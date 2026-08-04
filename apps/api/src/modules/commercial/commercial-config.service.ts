import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BillingCycle,
  BillingType,
  CommercialOffer,
  CommercialOfferStatus,
  CommercialOfferVersion,
  CommercialOfferVersionStatus,
  CommercialPipeline,
  CommercialPipelineStage,
  CommercialStatus,
  ContractTemplate,
  ContractTemplateStatus,
  ContractTemplateVersion,
  CustomerType,
  MemberRole,
  Membership,
  Opportunity,
  OpportunityMember,
  OpportunityStatus,
  PersonKind,
  Team,
  TeamMember,
} from '../../database/entities';
import { isValidCnpj, isValidCpf, normalizeTaxId } from '../../common/utils/tax-id';
import { PeopleService } from '../people/people.service';
import {
  CreateCommercialOfferDto,
  CreateCommercialOfferVersionDto,
  CreateCommercialPipelineDto,
  CreateCommercialPipelineStageDto,
  CreateContractTemplateDto,
  CreateContractTemplateVersionDto,
  SimulatePublicOfferDto,
  StartPublicOfferDto,
} from './commercial.dto';
import { CommercialWorkflowService } from './commercial-workflow.service';
import { PricingService } from './pricing.service';
import { CommercialFeatureService } from './commercial-feature.service';

@Injectable()
export class CommercialConfigService {
  constructor(
    @InjectRepository(CommercialOffer) private readonly offers: Repository<CommercialOffer>,
    @InjectRepository(CommercialOfferVersion) private readonly offerVersions: Repository<CommercialOfferVersion>,
    @InjectRepository(CommercialPipeline) private readonly pipelines: Repository<CommercialPipeline>,
    @InjectRepository(CommercialPipelineStage) private readonly stages: Repository<CommercialPipelineStage>,
    @InjectRepository(ContractTemplate) private readonly templates: Repository<ContractTemplate>,
    @InjectRepository(ContractTemplateVersion) private readonly templateVersions: Repository<ContractTemplateVersion>,
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    @InjectRepository(OpportunityMember) private readonly opportunityMembers: Repository<OpportunityMember>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(TeamMember) private readonly teamMembers: Repository<TeamMember>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly people: PeopleService,
    private readonly pricing: PricingService,
    private readonly workflow: CommercialWorkflowService,
    private readonly feature: CommercialFeatureService,
  ) {}

  async listOffers(unitId: string) {
    const offers = await this.offers.find({ where: { unitId }, order: { name: 'ASC' } });
    const versions = offers.length
      ? await this.offerVersions.find({ where: { unitId, offerId: In(offers.map((offer) => offer.id)) }, order: { version: 'DESC' } })
      : [];
    return offers.map((offer) => ({
      ...offer,
      versions: versions.filter((version) => version.offerId === offer.id),
    }));
  }

  async saveOffer(unitId: string, dto: CreateCommercialOfferDto, id?: string) {
    const current = id ? await this.offers.findOne({ where: { unitId, id } }) : null;
    if (id && !current) throw new NotFoundException('Oferta não encontrada.');

    const code = dto.code?.trim()
      ? this.normalizeCode(dto.code)
      : current?.code || await this.nextAvailableCode(this.offers, unitId, dto.name, id);
    const publicSlug = dto.publicSlug?.trim()
      ? this.normalizeSlug(dto.publicSlug)
      : dto.publicSlug === '' ? null : current?.publicSlug || null;

    const duplicate = await this.offers.findOne({ where: { unitId, code } });
    if (duplicate && duplicate.id !== id) throw new ConflictException('Já existe uma oferta com este código.');
    if (publicSlug) {
      const slugOwner = await this.offers.findOne({ where: { publicSlug } });
      if (slugOwner && slugOwner.id !== id) throw new ConflictException('Este endereço público já está em uso.');
    }

    if (dto.assignmentTeamId && !await this.teams.exists({ where: { unitId, id: dto.assignmentTeamId } })) {
      throw new BadRequestException('O time de atribuição não pertence à sede.');
    }
    if (dto.assignmentUserId && !await this.memberships.exists({
      where: { unitId, userId: dto.assignmentUserId, active: true },
    })) {
      throw new BadRequestException('O responsável de atribuição não pertence à sede.');
    }
    if (dto.assignmentTeamId && dto.assignmentUserId && !await this.teamMembers.exists({
      where: { unitId, teamId: dto.assignmentTeamId, userId: dto.assignmentUserId },
    })) {
      throw new BadRequestException('O responsável selecionado não pertence ao time de atribuição.');
    }

    const offer = current || this.offers.create({
      unitId,
      status: CommercialOfferStatus.DRAFT,
      active: true,
      metadata: {},
    });
    Object.assign(offer, {
      name: dto.name.trim(),
      code,
      description: dto.description?.trim() || null,
      customerType: dto.customerType,
      publicSlug,
      assignmentTeamId: dto.assignmentTeamId || null,
      assignmentUserId: dto.assignmentUserId || null,
      active: dto.active !== false,
      metadata: dto.metadata || offer.metadata || {},
    });
    if (offer.status === CommercialOfferStatus.ARCHIVED && offer.active) {
      offer.status = CommercialOfferStatus.DRAFT;
    }
    return this.offers.save(offer);
  }

  async revokeOffer(unitId: string, id: string) {
    const offer = await this.offer(unitId, id);
    offer.status = CommercialOfferStatus.ARCHIVED;
    offer.active = false;
    await this.offerVersions.update(
      { unitId, offerId: id, status: CommercialOfferVersionStatus.PUBLISHED },
      { status: CommercialOfferVersionStatus.RETIRED },
    );
    return this.offers.save(offer);
  }

  async restoreOffer(unitId: string, id: string) {
    const offer = await this.offer(unitId, id);
    offer.status = CommercialOfferStatus.DRAFT;
    offer.active = true;
    return this.offers.save(offer);
  }

  async createOfferVersion(unitId: string, offerId: string, dto: CreateCommercialOfferVersionDto) {
    const offer = await this.offer(unitId, offerId);
    this.validateOfferVersion(offer.customerType, dto);
    if (dto.contractTemplateVersionId) {
      await this.assertPublishedTemplateVersion(unitId, dto.contractTemplateVersionId, offer.customerType);
    }
    const latest = await this.offerVersions.findOne({ where: { unitId, offerId }, order: { version: 'DESC' } });
    return this.offerVersions.save(this.offerVersions.create({
      unitId,
      offerId,
      version: (latest?.version || 0) + 1,
      status: CommercialOfferVersionStatus.DRAFT,
      billingCycle: dto.billingCycle,
      holderAmount: dto.holderAmount == null ? null : dto.holderAmount.toFixed(2),
      dependentAmount: dto.dependentAmount == null ? null : dto.dependentAmount.toFixed(2),
      unitPrice: dto.unitPrice == null ? null : dto.unitPrice.toFixed(2),
      includedLives: dto.includedLives || 1,
      maxDependents: dto.maxDependents || 0,
      minLives: dto.minLives || 1,
      maxLives: dto.maxLives || null,
      allowedBillingTypes: dto.allowedBillingTypes,
      pricingRules: dto.pricingRules || {},
      contractTemplateVersionId: dto.contractTemplateVersionId || null,
      effectiveFrom: dto.effectiveFrom || null,
      effectiveTo: dto.effectiveTo || null,
      publishedAt: null,
      metadata: dto.metadata || {},
    }));
  }

  async publishOfferVersion(unitId: string, offerId: string, versionId: string) {
    const offer = await this.offer(unitId, offerId);
    const version = await this.offerVersions.findOne({ where: { unitId, offerId, id: versionId } });
    if (!version) throw new NotFoundException('Versão da oferta não encontrada.');
    if (version.status === CommercialOfferVersionStatus.RETIRED) {
      throw new ConflictException('Uma versão histórica não pode voltar a ser vigente. Crie uma nova versão.');
    }
    if (!version.allowedBillingTypes.length) throw new BadRequestException('Defina ao menos uma forma de pagamento.');
    if (!version.contractTemplateVersionId) {
      throw new BadRequestException('Selecione uma versão contratual publicada antes de publicar a oferta.');
    }
    await this.assertPublishedTemplateVersion(unitId, version.contractTemplateVersionId, offer.customerType);

    return this.offerVersions.manager.transaction(async (manager) => {
      const versionRepository = manager.getRepository(CommercialOfferVersion);
      const offerRepository = manager.getRepository(CommercialOffer);
      const current = await versionRepository.findOne({
        where: { unitId, offerId, status: CommercialOfferVersionStatus.PUBLISHED },
        lock: { mode: 'pessimistic_write' },
      });

      if (current && current.id !== version.id) {
        current.status = CommercialOfferVersionStatus.RETIRED;
        current.effectiveTo = new Date().toISOString().slice(0, 10);
        await versionRepository.save(current);
      }

      version.status = CommercialOfferVersionStatus.PUBLISHED;
      version.publishedAt ||= new Date();
      version.effectiveFrom ||= new Date().toISOString().slice(0, 10);
      version.effectiveTo = null;
      offer.status = CommercialOfferStatus.PUBLISHED;
      offer.active = true;
      await offerRepository.save(offer);
      return versionRepository.save(version);
    });
  }

  async listPipelines(unitId: string) {
    const pipelines = await this.pipelines.find({ where: { unitId }, order: { name: 'ASC' } });
    const stages = pipelines.length
      ? await this.stages.find({ where: { unitId, pipelineId: In(pipelines.map((pipeline) => pipeline.id)) }, order: { position: 'ASC' } })
      : [];
    return pipelines.map((pipeline) => ({
      ...pipeline,
      stages: stages.filter((stage) => stage.pipelineId === pipeline.id),
    }));
  }

  async createPipeline(unitId: string, dto: CreateCommercialPipelineDto) {
    const name = dto.name.trim();
    if (await this.pipelines.exists({ where: { unitId, name } })) {
      throw new ConflictException('Já existe um funil com este nome.');
    }
    if (dto.isDefault) await this.pipelines.update({ unitId, isDefault: true }, { isDefault: false });
    return this.pipelines.save(this.pipelines.create({
      unitId,
      name,
      isDefault: dto.isDefault === true,
      active: dto.active !== false,
    }));
  }

  async updatePipeline(unitId: string, id: string, dto: CreateCommercialPipelineDto) {
    const pipeline = await this.pipelines.findOne({ where: { unitId, id } });
    if (!pipeline) throw new NotFoundException('Funil não encontrado.');
    const name = dto.name.trim();
    const duplicate = await this.pipelines.findOne({ where: { unitId, name } });
    if (duplicate && duplicate.id !== id) throw new ConflictException('Já existe um funil com este nome.');
    if (dto.isDefault) await this.pipelines.update({ unitId, isDefault: true }, { isDefault: false });
    pipeline.name = name;
    pipeline.isDefault = dto.isDefault === true;
    pipeline.active = dto.active !== false;
    return this.pipelines.save(pipeline);
  }

  async archivePipeline(unitId: string, id: string) {
    const pipeline = await this.pipelines.findOne({ where: { unitId, id } });
    if (!pipeline) throw new NotFoundException('Funil não encontrado.');
    pipeline.active = false;
    pipeline.isDefault = false;
    await this.stages.update({ unitId, pipelineId: id }, { active: false });
    return this.pipelines.save(pipeline);
  }

  async createStage(unitId: string, pipelineId: string, dto: CreateCommercialPipelineStageDto) {
    const pipeline = await this.pipelines.findOne({ where: { unitId, id: pipelineId } });
    if (!pipeline) throw new NotFoundException('Funil não encontrado.');
    const code = dto.code?.trim()
      ? this.normalizeCode(dto.code)
      : await this.nextAvailableStageCode(unitId, pipelineId, dto.name);
    const duplicate = await this.stages.findOne({ where: { unitId, pipelineId, code } });
    if (duplicate) throw new ConflictException('Já existe uma etapa com este identificador no funil.');
    return this.stages.save(this.stages.create({
      unitId,
      pipelineId,
      code,
      name: dto.name.trim(),
      position: dto.position,
      commercialStatus: (dto.commercialStatus as CommercialStatus) || null,
      active: dto.active !== false,
    }));
  }

  async updateStage(
    unitId: string,
    pipelineId: string,
    stageId: string,
    dto: CreateCommercialPipelineStageDto,
  ) {
    const stage = await this.stages.findOne({ where: { unitId, pipelineId, id: stageId } });
    if (!stage) throw new NotFoundException('Etapa não encontrada.');
    const code = dto.code?.trim() ? this.normalizeCode(dto.code) : stage.code;
    const duplicate = await this.stages.findOne({ where: { unitId, pipelineId, code } });
    if (duplicate && duplicate.id !== stageId) {
      throw new ConflictException('Já existe uma etapa com este identificador no funil.');
    }
    stage.name = dto.name.trim();
    stage.code = code;
    stage.position = dto.position;
    stage.commercialStatus = (dto.commercialStatus as CommercialStatus) || null;
    stage.active = dto.active !== false;
    return this.stages.save(stage);
  }

  async archiveStage(unitId: string, pipelineId: string, stageId: string) {
    const stage = await this.stages.findOne({ where: { unitId, pipelineId, id: stageId } });
    if (!stage) throw new NotFoundException('Etapa não encontrada.');
    stage.active = false;
    return this.stages.save(stage);
  }

  async listTemplates(unitId: string) {
    const templates = await this.templates.find({ where: { unitId }, order: { name: 'ASC' } });
    const versions = templates.length
      ? await this.templateVersions.find({ where: { unitId, templateId: In(templates.map((template) => template.id)) }, order: { version: 'DESC' } })
      : [];
    return templates.map((template) => ({
      ...template,
      versions: versions.filter((version) => version.templateId === template.id),
    }));
  }

  async createTemplate(unitId: string, dto: CreateContractTemplateDto) {
    const code = dto.code?.trim()
      ? this.normalizeCode(dto.code)
      : await this.nextAvailableCode(this.templates, unitId, dto.name);
    if (await this.templates.exists({ where: { unitId, code } })) {
      throw new ConflictException('Já existe um modelo com este código.');
    }
    return this.templates.save(this.templates.create({
      unitId,
      code,
      name: dto.name.trim(),
      customerType: dto.customerType,
      active: dto.active !== false,
      metadata: dto.metadata || {},
    }));
  }

  async updateTemplate(unitId: string, id: string, dto: CreateContractTemplateDto) {
    const template = await this.templates.findOne({ where: { unitId, id } });
    if (!template) throw new NotFoundException('Modelo contratual não encontrado.');

    const code = dto.code?.trim()
      ? this.normalizeCode(dto.code)
      : template.code || await this.nextAvailableCode(this.templates, unitId, dto.name, id);
    const duplicate = await this.templates.findOne({ where: { unitId, code } });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Já existe um modelo com este código.');
    }

    if (dto.customerType !== template.customerType) {
      const hasVersions = await this.templateVersions.exists({ where: { unitId, templateId: id } });
      if (hasVersions) {
        throw new BadRequestException('O tipo de cliente não pode ser alterado depois que o modelo possui versões.');
      }
    }

    template.name = dto.name.trim();
    template.code = code;
    template.customerType = dto.customerType;
    template.active = dto.active !== false;
    template.metadata = dto.metadata || template.metadata || {};
    return this.templates.save(template);
  }

  async revokeTemplate(unitId: string, id: string) {
    const template = await this.templates.findOne({ where: { unitId, id } });
    if (!template) throw new NotFoundException('Modelo contratual não encontrado.');
    template.active = false;
    return this.templates.save(template);
  }

  async restoreTemplate(unitId: string, id: string) {
    const template = await this.templates.findOne({ where: { unitId, id } });
    if (!template) throw new NotFoundException('Modelo contratual não encontrado.');
    template.active = true;
    return this.templates.save(template);
  }

  async createTemplateVersion(unitId: string, templateId: string, dto: CreateContractTemplateVersionDto) {
    const template = await this.templates.findOne({ where: { unitId, id: templateId } });
    if (!template) throw new NotFoundException('Modelo contratual não encontrado.');
    if (!template.active) throw new BadRequestException('Reative o modelo antes de criar uma nova versão.');
    this.validateTemplateVariables(dto.content, dto.variables);
    const latest = await this.templateVersions.findOne({ where: { unitId, templateId }, order: { version: 'DESC' } });
    return this.templateVersions.save(this.templateVersions.create({
      unitId,
      templateId,
      version: (latest?.version || 0) + 1,
      status: ContractTemplateStatus.DRAFT,
      content: dto.content,
      variables: [...new Set(dto.variables)],
      publishedAt: null,
    }));
  }

  async updateTemplateVersion(
    unitId: string,
    templateId: string,
    versionId: string,
    dto: CreateContractTemplateVersionDto,
  ) {
    const version = await this.templateVersions.findOne({ where: { unitId, templateId, id: versionId } });
    if (!version) throw new NotFoundException('Versão contratual não encontrada.');
    if (version.status !== ContractTemplateStatus.DRAFT) {
      throw new ConflictException('Uma versão publicada é imutável. Crie uma nova versão para alterar o contrato.');
    }
    this.validateTemplateVariables(dto.content, dto.variables);
    version.content = dto.content;
    version.variables = [...new Set(dto.variables)];
    return this.templateVersions.save(version);
  }

  async publishTemplateVersion(unitId: string, templateId: string, versionId: string) {
    const template = await this.templates.findOne({ where: { unitId, id: templateId } });
    if (!template) throw new NotFoundException('Modelo contratual não encontrado.');
    if (!template.active) throw new BadRequestException('Reative o modelo antes de publicar uma versão.');
    const version = await this.templateVersions.findOne({ where: { unitId, templateId, id: versionId } });
    if (!version) throw new NotFoundException('Versão contratual não encontrada.');
    version.status = ContractTemplateStatus.PUBLISHED;
    version.publishedAt = new Date();
    return this.templateVersions.save(version);
  }

  async publicOffer(slug: string) {
    const offer = await this.offers.findOne({
      where: { publicSlug: slug, status: CommercialOfferStatus.PUBLISHED, active: true },
    });
    if (!offer) throw new NotFoundException('Oferta pública não encontrada.');
    await this.feature.assertEnabled(offer.unitId);
    const version = await this.currentVersion(offer);
    return {
      id: offer.id,
      name: offer.name,
      description: offer.description,
      customerType: offer.customerType,
      publicSlug: offer.publicSlug,
      version: this.publicVersion(offer, version),
      simulation: this.simulateVersion(offer, version, {}),
    };
  }

  async simulatePublicOffer(slug: string, dto: SimulatePublicOfferDto) {
    const offer = await this.offers.findOne({
      where: { publicSlug: slug, status: CommercialOfferStatus.PUBLISHED, active: true },
    });
    if (!offer) throw new NotFoundException('Oferta pública não encontrada.');
    await this.feature.assertEnabled(offer.unitId);
    return this.simulateVersion(offer, await this.currentVersion(offer), dto);
  }

  async startPublicOffer(slug: string, dto: StartPublicOfferDto) {
    const offer = await this.offers.findOne({
      where: { publicSlug: slug, status: CommercialOfferStatus.PUBLISHED, active: true },
    });
    if (!offer) throw new NotFoundException('Oferta pública não encontrada.');
    await this.feature.assertEnabled(offer.unitId);
    const version = await this.currentVersion(offer);
    const declaredDependents = dto.participants?.length ?? dto.dependentCount ?? 0;
    if (offer.customerType === CustomerType.PERSON && dto.dependentCount != null && declaredDependents !== dto.dependentCount) {
      throw new BadRequestException('Preencha os dados de todos os dependentes selecionados.');
    }
    const calculation = this.simulateVersion(offer, version, {
      dependentCount: declaredDependents,
      lives: dto.lives,
    });
    const taxId = normalizeTaxId(dto.taxId);
    const validCustomerTaxId = offer.customerType === CustomerType.COMPANY
      ? isValidCnpj(taxId)
      : isValidCpf(taxId);
    if (!validCustomerTaxId) {
      throw new BadRequestException(offer.customerType === CustomerType.COMPANY ? 'CNPJ inválido.' : 'CPF inválido.');
    }
    for (const participant of dto.participants || []) {
      if (!isValidCpf(normalizeTaxId(participant.taxId))) {
        throw new BadRequestException(`CPF inválido para o dependente ${participant.name}.`);
      }
    }
    const person = await this.people.upsertByTaxId(offer.unitId, {
      unitId: offer.unitId,
      kind: offer.customerType === CustomerType.COMPANY ? PersonKind.COMPANY : PersonKind.PERSON,
      name: dto.name.trim(),
      taxId,
      email: dto.email,
      phone: dto.phone,
      whatsapp: dto.phone,
      address: dto.address,
      addressNumber: dto.addressNumber,
      complement: dto.complement,
      district: dto.district,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      metadata: { publicOfferId: offer.id },
    } as any);
    const ownerUserId = await this.resolveOwner(offer);
    const stage = await this.defaultStage(offer.unitId);
    const opportunity = await this.opportunities.save(this.opportunities.create({
      unitId: offer.unitId,
      primaryPersonId: person.id,
      ownerUserId,
      teamId: offer.assignmentTeamId,
      pipelineStageId: stage?.id || null,
      offerVersionId: version.id,
      customerType: offer.customerType,
      commercialStatus: CommercialStatus.APPROVED,
      negotiationSnapshot: {
        ...calculation,
        offer: { id: offer.id, code: offer.code, name: offer.name, version: version.version },
        allowedBillingTypes: this.allowedBillingTypes(offer.customerType, version.billingCycle, version.allowedBillingTypes, version.pricingRules),
        limits: { maxDependents: version.maxDependents, minLives: version.minLives, maxLives: version.maxLives },
        source: 'PUBLIC_OFFER',
      },
      planPriceId: null,
      status: OpportunityStatus.OPEN,
      expectedValue: Number(calculation.pricing.finalAmount).toFixed(2),
      billingCycle: version.billingCycle,
      billingType: this.allowedBillingTypes(offer.customerType, version.billingCycle, version.allowedBillingTypes, version.pricingRules)[0] || BillingType.CREDIT_CARD,
      acquisitionSource: `PUBLIC_OFFER:${offer.code}`,
      notes: null,
      lossReason: null,
      asaasCustomerId: null,
      wonAt: null,
      cancelledAt: null,
    }));
    await this.opportunityMembers.save(this.opportunityMembers.create({
      unitId: offer.unitId,
      opportunityId: opportunity.id,
      personId: person.id,
      role: MemberRole.PRIMARY,
      relationship: null,
    }));

    const precheckout = await this.workflow.createPrecheckout(offer.unitId, opportunity.id, 7);
    await this.workflow.updateCustomer(precheckout.token, dto);
    for (const participant of dto.participants || []) {
      await this.workflow.addParticipant(precheckout.token, participant);
    }
    return {
      opportunityId: opportunity.id,
      checkoutPath: precheckout.url,
      token: precheckout.token,
      expiresAt: precheckout.expiresAt,
    };
  }

  private async offer(unitId: string, id: string) {
    const offer = await this.offers.findOne({ where: { unitId, id } });
    if (!offer) throw new NotFoundException('Oferta não encontrada.');
    return offer;
  }

  private async currentVersion(offer: CommercialOffer) {
    const today = new Date().toISOString().slice(0, 10);
    const versions = await this.offerVersions.find({
      where: { unitId: offer.unitId, offerId: offer.id, status: CommercialOfferVersionStatus.PUBLISHED },
      order: { version: 'DESC' },
    });
    const version = versions.find((item) =>
      (!item.effectiveFrom || item.effectiveFrom <= today)
      && (!item.effectiveTo || item.effectiveTo >= today));
    if (!version) throw new NotFoundException('A oferta não possui uma versão vigente.');
    return version;
  }

  private simulateVersion(offer: CommercialOffer, version: CommercialOfferVersion, dto: SimulatePublicOfferDto) {
    const lives = dto.lives ?? version.minLives;
    if (offer.customerType === CustomerType.COMPANY) {
      if (lives < version.minLives || (version.maxLives != null && lives > version.maxLives)) {
        throw new BadRequestException('Quantidade de vidas fora dos limites da oferta.');
      }
    }
    const dependentCount = dto.dependentCount ?? 0;
    if (offer.customerType === CustomerType.PERSON && dependentCount > version.maxDependents) {
      throw new BadRequestException('Quantidade de dependentes acima do limite da oferta.');
    }
    return {
      ...this.pricing.calculate({
        customerType: offer.customerType,
        cycle: version.billingCycle,
        billingType: this.allowedBillingTypes(offer.customerType, version.billingCycle, version.allowedBillingTypes, version.pricingRules)[0],
        baseAmount: Number(version.holderAmount || version.unitPrice || 0),
        dependentAmount: Number(version.dependentAmount || 0),
        dependentCount,
        unitPrice: Number(version.unitPrice || 0),
        lives,
        discounts: [],
      }),
      allowedBillingTypes: this.allowedBillingTypes(offer.customerType, version.billingCycle, version.allowedBillingTypes, version.pricingRules),
      limits: {
        maxDependents: version.maxDependents,
        minLives: version.minLives,
        maxLives: version.maxLives,
      },
    };
  }

  private publicVersion(offer: CommercialOffer, version: CommercialOfferVersion) {
    return {
      id: version.id,
      version: version.version,
      billingCycle: version.billingCycle,
      holderAmount: version.holderAmount == null ? null : Number(version.holderAmount),
      dependentAmount: version.dependentAmount == null ? null : Number(version.dependentAmount),
      unitPrice: version.unitPrice == null ? null : Number(version.unitPrice),
      maxDependents: version.maxDependents,
      minLives: version.minLives,
      maxLives: version.maxLives,
      allowedBillingTypes: this.allowedBillingTypes(offer.customerType, version.billingCycle, version.allowedBillingTypes, version.pricingRules),
    };
  }

  private async assertPublishedTemplateVersion(
    unitId: string,
    versionId: string,
    customerType: CustomerType,
  ) {
    const version = await this.templateVersions.findOne({ where: { unitId, id: versionId } });
    if (!version || version.status !== ContractTemplateStatus.PUBLISHED) {
      throw new BadRequestException('A versão contratual selecionada não está publicada.');
    }
    const template = await this.templates.findOne({ where: { unitId, id: version.templateId } });
    if (!template || !template.active || template.customerType !== customerType) {
      throw new BadRequestException('O modelo contratual não é compatível com o tipo da oferta.');
    }
    return version;
  }

  private validateOfferVersion(customerType: CustomerType, dto: CreateCommercialOfferVersionDto) {
    if (!dto.allowedBillingTypes?.length) throw new BadRequestException('Informe ao menos uma forma de pagamento.');
    if (customerType === CustomerType.PERSON && dto.holderAmount == null) {
      throw new BadRequestException('Informe o valor do titular.');
    }
    if (customerType === CustomerType.PERSON) {
      const allowed = this.allowedBillingTypes(customerType, dto.billingCycle, dto.allowedBillingTypes, dto.pricingRules || {});
      if (!allowed.includes(BillingType.CREDIT_CARD)) {
        throw new BadRequestException('Ofertas de pessoa física devem permitir cartão de crédito.');
      }
      if (allowed.length !== dto.allowedBillingTypes.length) {
        throw new BadRequestException('Formas de pagamento incompatíveis com a periodicidade da oferta PF. Boleto mensal exige autorização e Pix é permitido apenas no anual.');
      }
    }
    if (customerType === CustomerType.COMPANY && dto.unitPrice == null) {
      throw new BadRequestException('Informe o preço por vida.');
    }
    if (dto.maxLives != null && dto.maxLives < (dto.minLives || 1)) {
      throw new BadRequestException('O máximo de vidas deve ser maior ou igual ao mínimo.');
    }
  }


  private allowedBillingTypes(
    customerType: CustomerType,
    cycle: BillingCycle,
    configured: BillingType[],
    pricingRules: Record<string, any> = {},
  ) {
    const unique = [...new Set((configured || []).filter((type) => type !== BillingType.UNDEFINED))];
    if (customerType !== CustomerType.PERSON) return unique;
    const monthly = cycle === BillingCycle.MONTHLY;
    const yearly = cycle === BillingCycle.YEARLY;
    return unique.filter((type) => {
      if (type === BillingType.CREDIT_CARD) return true;
      if (type === BillingType.BOLETO) return monthly && pricingRules.allowMonthlyBoleto === true;
      if (type === BillingType.PIX) return yearly;
      return false;
    });
  }

  private normalizeCode(value: string) {
    return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'ITEM';
  }

  private normalizeSlug(value: string) {
    return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private async nextAvailableCode(
    repository: Repository<any>,
    unitId: string,
    name: string,
    excludedId?: string,
  ) {
    const base = this.normalizeCode(name);
    let candidate = base;
    let suffix = 2;
    while (true) {
      const existing = await repository.findOne({ where: { unitId, code: candidate } });
      if (!existing || existing.id === excludedId) return candidate;
      candidate = `${base}_${suffix++}`;
    }
  }

  private async nextAvailableStageCode(unitId: string, pipelineId: string, name: string) {
    const base = this.normalizeCode(name);
    let candidate = base;
    let suffix = 2;
    while (await this.stages.exists({ where: { unitId, pipelineId, code: candidate } })) {
      candidate = `${base}_${suffix++}`;
    }
    return candidate;
  }

  private validateTemplateVariables(content: string, declared: string[]) {
    const found = [...content.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((match) => match[1]);
    const undeclared = found.filter((variable) => !declared.includes(variable));
    if (undeclared.length) {
      throw new BadRequestException(`Variáveis não declaradas: ${[...new Set(undeclared)].join(', ')}.`);
    }
  }

  private async resolveOwner(offer: CommercialOffer) {
    if (offer.assignmentUserId) return offer.assignmentUserId;
    if (!offer.assignmentTeamId) return null;
    const members = await this.teamMembers.find({
      where: { unitId: offer.unitId, teamId: offer.assignmentTeamId },
    });
    if (!members.length) return null;
    const counts = await this.opportunities.createQueryBuilder('opportunity')
      .select('opportunity.owner_user_id', 'ownerUserId')
      .addSelect('COUNT(*)', 'total')
      .where('opportunity.unit_id = :unitId', { unitId: offer.unitId })
      .andWhere('opportunity.owner_user_id IN (:...userIds)', { userIds: members.map((member) => member.userId) })
      .andWhere('opportunity.status IN (:...statuses)', { statuses: [OpportunityStatus.OPEN, OpportunityStatus.CHECKOUT_PENDING] })
      .groupBy('opportunity.owner_user_id')
      .getRawMany<{ ownerUserId: string; total: string }>();
    const byUser = new Map<string, number>(counts.map((row) => [row.ownerUserId, Number(row.total)] as [string, number]));
    return [...members].sort((a, b) => (byUser.get(a.userId) || 0) - (byUser.get(b.userId) || 0))[0].userId;
  }

  private async defaultStage(unitId: string) {
    const pipeline = await this.pipelines.findOne({ where: { unitId, isDefault: true, active: true } });
    if (!pipeline) return null;
    return this.stages.findOne({ where: { unitId, pipelineId: pipeline.id, active: true }, order: { position: 'ASC' } });
  }
}
