import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BillingCycle,
  BillingType,
  CommercialOffer,
  CommercialOfferBillingOption,
  CommercialOfferStatus,
  CommercialOfferVersion,
  CommercialOfferVersionStatus,
  CommercialPriceTableVersion,
  CommercialPriceTableVersionStatus,
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
  UnitRole,
} from '../../database/entities';
import { isValidCnpj, isValidCpf, normalizeTaxId } from '../../common/utils/tax-id';
import { PeopleService } from '../people/people.service';
import {
  CreateCommercialOfferDto,
  CreateCommercialOfferVersionDto,
  CreateCommercialPriceTableVersionDto,
  CommercialOfferBillingOptionDto,
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
    @InjectRepository(CommercialOfferBillingOption) private readonly offerBillingOptions: Repository<CommercialOfferBillingOption>,
    @InjectRepository(CommercialPriceTableVersion) private readonly priceTableVersions: Repository<CommercialPriceTableVersion>,
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
    const options = versions.length
      ? await this.offerBillingOptions.find({
          where: { unitId, offerVersionId: In(versions.map((version) => version.id)) },
          order: { billingCycle: 'ASC' },
        })
      : [];
    return offers.map((offer) => ({
      ...offer,
      versions: versions
        .filter((version) => version.offerId === offer.id)
        .map((version) => ({
          ...version,
          billingOptions: options.filter((option) => option.offerVersionId === version.id),
        })),
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
    if (dto.publicSlug?.trim() && !publicSlug) {
      throw new BadRequestException('Informe um endereço público com letras ou números.');
    }

    const duplicate = await this.offers.findOne({ where: { unitId, code } });
    if (duplicate && duplicate.id !== id) throw new ConflictException('Já existe uma oferta com este código.');
    if (publicSlug) {
      const slugOwner = await this.offers.findOne({ where: { publicSlug } });
      if (slugOwner && slugOwner.id !== id) throw new ConflictException('Este endereço público já está em uso.');
    }

    if (dto.assignmentTeamId && !await this.teams.exists({ where: { unitId, id: dto.assignmentTeamId } })) {
      throw new BadRequestException('O time de atribuição não pertence à sede.');
    }
    if (dto.assignmentUserId) {
      const assignmentMembership = await this.memberships.findOne({
        where: { unitId, userId: dto.assignmentUserId, active: true },
      });
      if (!assignmentMembership) {
        throw new BadRequestException('O responsável de atribuição não pertence à sede.');
      }
      if (![UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER, UnitRole.SALES].includes(assignmentMembership.role)) {
        throw new BadRequestException('O responsável de atribuição precisa possuir um perfil comercial.');
      }
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
    const billingOptions = this.normalizeOfferBillingOptions(offer.customerType, dto);
    this.validateOfferVersion(offer.customerType, dto, billingOptions);
    if (dto.contractTemplateVersionId) {
      await this.assertPublishedTemplateVersion(unitId, dto.contractTemplateVersionId, offer.customerType);
    }
    const latest = await this.offerVersions.findOne({ where: { unitId, offerId }, order: { version: 'DESC' } });
    const primary = billingOptions.find((option) => option.billingCycle === BillingCycle.MONTHLY) || billingOptions[0];

    return this.offerVersions.manager.transaction(async (manager) => {
      const versionRepository = manager.getRepository(CommercialOfferVersion);
      const optionRepository = manager.getRepository(CommercialOfferBillingOption);
      const version = await versionRepository.save(versionRepository.create({
        unitId,
        offerId,
        version: (latest?.version || 0) + 1,
        status: CommercialOfferVersionStatus.DRAFT,
        billingCycle: primary.billingCycle,
        holderAmount: primary.holderAmount == null ? null : Number(primary.holderAmount).toFixed(2),
        dependentAmount: primary.dependentAmount == null ? null : Number(primary.dependentAmount).toFixed(2),
        unitPrice: primary.unitPrice == null ? null : Number(primary.unitPrice).toFixed(2),
        includedLives: dto.includedLives || 1,
        maxDependents: dto.maxDependents || 0,
        minLives: dto.minLives || 1,
        maxLives: dto.maxLives || null,
        allowedBillingTypes: primary.allowedBillingTypes,
        pricingRules: primary.pricingRules || {},
        contractTemplateVersionId: dto.contractTemplateVersionId || null,
        effectiveFrom: dto.effectiveFrom || null,
        effectiveTo: dto.effectiveTo || null,
        publishedAt: null,
        metadata: dto.metadata || {},
      }));
      await optionRepository.save(billingOptions.map((option) => optionRepository.create({
        unitId,
        offerVersionId: version.id,
        billingCycle: option.billingCycle,
        holderAmount: option.holderAmount == null ? null : Number(option.holderAmount).toFixed(2),
        dependentAmount: option.dependentAmount == null ? null : Number(option.dependentAmount).toFixed(2),
        unitPrice: option.unitPrice == null ? null : Number(option.unitPrice).toFixed(2),
        annualDiscountPercent: Number(option.annualDiscountPercent || 0).toFixed(2),
        allowedBillingTypes: option.allowedBillingTypes,
        pricingRules: option.pricingRules || {},
      })));
      return {
        ...version,
        billingOptions: await optionRepository.find({
          where: { unitId, offerVersionId: version.id },
          order: { billingCycle: 'ASC' },
        }),
      };
    });
  }

  async publishOfferVersion(unitId: string, offerId: string, versionId: string) {
    const offer = await this.offer(unitId, offerId);
    if (!offer.publicSlug) {
      throw new BadRequestException('Defina o endereço público antes de ativar a oferta.');
    }
    const version = await this.offerVersions.findOne({ where: { unitId, offerId, id: versionId } });
    if (!version) throw new NotFoundException('Versão da oferta não encontrada.');
    if (version.status === CommercialOfferVersionStatus.RETIRED) {
      throw new ConflictException('Uma versão histórica não pode voltar a ser vigente. Crie uma nova versão.');
    }
    const billingOptions = await this.offerBillingOptions.find({
      where: { unitId, offerVersionId: version.id },
    });
    if (!billingOptions.length || billingOptions.some((option) => !option.allowedBillingTypes.length)) {
      throw new BadRequestException('Defina ao menos uma opção de cobrança com forma de pagamento.');
    }
    this.validateBillingOptions(offer.customerType, billingOptions.map((option) => ({
      billingCycle: option.billingCycle,
      holderAmount: option.holderAmount == null ? undefined : Number(option.holderAmount),
      dependentAmount: option.dependentAmount == null ? undefined : Number(option.dependentAmount),
      unitPrice: option.unitPrice == null ? undefined : Number(option.unitPrice),
      annualDiscountPercent: Number(option.annualDiscountPercent || 0),
      allowedBillingTypes: option.allowedBillingTypes,
      pricingRules: option.pricingRules,
    })));
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

  async listPriceTableVersions(unitId: string) {
    return this.priceTableVersions.find({
      where: { unitId },
      order: { customerType: 'ASC', version: 'DESC' },
    });
  }

  async currentPriceTable(unitId: string, customerType: CustomerType) {
    if (!Object.values(CustomerType).includes(customerType)) {
      throw new BadRequestException('Informe um tipo de cliente válido.');
    }
    const today = new Date().toISOString().slice(0, 10);
    const versions = await this.priceTableVersions.find({
      where: {
        unitId,
        customerType,
        status: CommercialPriceTableVersionStatus.PUBLISHED,
      },
      order: { version: 'DESC' },
    });
    return versions.find((version) =>
      (!version.effectiveFrom || version.effectiveFrom <= today)
      && (!version.effectiveTo || version.effectiveTo >= today)) || null;
  }

  async priceTableVersion(unitId: string, versionId: string) {
    const version = await this.priceTableVersions.findOne({
      where: { unitId, id: versionId },
    });
    if (!version) throw new NotFoundException('Versão da tabela de preços não encontrada.');
    return version;
  }

  async createPriceTableVersion(unitId: string, dto: CreateCommercialPriceTableVersionDto) {
    this.validatePriceTable(dto);
    if (dto.contractTemplateVersionId) {
      await this.assertPublishedTemplateVersion(unitId, dto.contractTemplateVersionId, dto.customerType);
    }
    const latest = await this.priceTableVersions.findOne({
      where: { unitId, customerType: dto.customerType },
      order: { version: 'DESC' },
    });
    return this.priceTableVersions.save(this.priceTableVersions.create({
      unitId,
      customerType: dto.customerType,
      version: (latest?.version || 0) + 1,
      status: CommercialPriceTableVersionStatus.DRAFT,
      holderAmount: dto.customerType === CustomerType.PERSON && dto.holderAmount != null
        ? Number(dto.holderAmount).toFixed(2)
        : null,
      dependentAmount: dto.customerType === CustomerType.PERSON && dto.dependentAmount != null
        ? Number(dto.dependentAmount).toFixed(2)
        : null,
      unitPrice: dto.customerType === CustomerType.COMPANY && dto.unitPrice != null
        ? Number(dto.unitPrice).toFixed(2)
        : null,
      annualDiscountPercent: dto.customerType === CustomerType.PERSON
        ? Number(dto.annualDiscountPercent || 0).toFixed(2)
        : '0.00',
      maxDependents: dto.customerType === CustomerType.PERSON ? dto.maxDependents || 0 : 0,
      minLives: dto.customerType === CustomerType.COMPANY ? dto.minLives || 1 : 1,
      maxLives: dto.customerType === CustomerType.COMPANY ? dto.maxLives || null : null,
      monthlyBillingTypes: this.allowedBillingTypes(
        dto.customerType,
        BillingCycle.MONTHLY,
        dto.monthlyBillingTypes,
        { allowMonthlyBoleto: dto.monthlyBillingTypes.includes(BillingType.BOLETO) },
      ),
      yearlyBillingTypes: dto.customerType === CustomerType.PERSON
        ? this.allowedBillingTypes(
            dto.customerType,
            BillingCycle.YEARLY,
            dto.yearlyBillingTypes || [BillingType.CREDIT_CARD],
          )
        : [],
      contractTemplateVersionId: dto.contractTemplateVersionId || null,
      effectiveFrom: dto.effectiveFrom || null,
      effectiveTo: null,
      publishedAt: null,
      metadata: dto.metadata || {},
    }));
  }

  async publishPriceTableVersion(unitId: string, versionId: string) {
    const version = await this.priceTableVersions.findOne({ where: { unitId, id: versionId } });
    if (!version) throw new NotFoundException('Versão da tabela de preços não encontrada.');
    if (version.status === CommercialPriceTableVersionStatus.RETIRED) {
      throw new ConflictException('Uma versão histórica não pode voltar a ser vigente. Crie uma nova versão.');
    }
    if (!version.contractTemplateVersionId) {
      throw new BadRequestException('Selecione um modelo contratual publicado para a tabela padrão.');
    }
    await this.assertPublishedTemplateVersion(
      unitId,
      version.contractTemplateVersionId,
      version.customerType,
    );

    return this.priceTableVersions.manager.transaction(async (manager) => {
      const repository = manager.getRepository(CommercialPriceTableVersion);
      const current = await repository.findOne({
        where: {
          unitId,
          customerType: version.customerType,
          status: CommercialPriceTableVersionStatus.PUBLISHED,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && current.id !== version.id) {
        current.status = CommercialPriceTableVersionStatus.RETIRED;
        current.effectiveTo = new Date().toISOString().slice(0, 10);
        await repository.save(current);
      }
      version.status = CommercialPriceTableVersionStatus.PUBLISHED;
      version.publishedAt ||= new Date();
      version.effectiveFrom ||= new Date().toISOString().slice(0, 10);
      version.effectiveTo = null;
      return repository.save(version);
    });
  }

  async publishedTemplateOptions(unitId: string, customerType?: CustomerType) {
    const templates = await this.templates.find({
      where: customerType
        ? { unitId, customerType, active: true }
        : { unitId, active: true },
      order: { name: 'ASC' },
    });
    if (!templates.length) return [];
    const versions = await this.templateVersions.find({
      where: {
        unitId,
        templateId: In(templates.map((template) => template.id)),
        status: ContractTemplateStatus.PUBLISHED,
      },
      order: { version: 'DESC' },
    });
    return versions.map((version) => {
      const template = templates.find((item) => item.id === version.templateId)!;
      return {
        id: version.id,
        templateId: template.id,
        templateName: template.name,
        templateCode: template.code,
        customerType: template.customerType,
        version: version.version,
        label: `${template.name} — versão ${version.version}`,
      };
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
    const billingOptions = await this.getBillingOptions(version);
    return {
      id: offer.id,
      name: offer.name,
      description: offer.description,
      customerType: offer.customerType,
      publicSlug: offer.publicSlug,
      version: this.publicVersion(offer, version, billingOptions),
      simulation: this.simulateVersion(offer, version, {}, billingOptions),
    };
  }

  async simulatePublicOffer(slug: string, dto: SimulatePublicOfferDto) {
    const offer = await this.offers.findOne({
      where: { publicSlug: slug, status: CommercialOfferStatus.PUBLISHED, active: true },
    });
    if (!offer) throw new NotFoundException('Oferta pública não encontrada.');
    await this.feature.assertEnabled(offer.unitId);
    const version = await this.currentVersion(offer);
    return this.simulateVersion(offer, version, dto, await this.getBillingOptions(version));
  }

  async startPublicOffer(slug: string, dto: StartPublicOfferDto) {
    const offer = await this.offers.findOne({
      where: { publicSlug: slug, status: CommercialOfferStatus.PUBLISHED, active: true },
    });
    if (!offer) throw new NotFoundException('Oferta pública não encontrada.');
    await this.feature.assertEnabled(offer.unitId);
    const version = await this.currentVersion(offer);
    const billingOptions = await this.getBillingOptions(version);
    const declaredDependents = dto.participants?.length ?? dto.dependentCount ?? 0;
    if (offer.customerType === CustomerType.PERSON
      && dto.dependentCount != null
      && declaredDependents !== dto.dependentCount) {
      throw new BadRequestException('Preencha os dados de todos os dependentes selecionados.');
    }
    const calculation = this.simulateVersion(offer, version, {
      cycle: dto.cycle,
      dependentCount: declaredDependents,
      lives: dto.lives,
    }, billingOptions);
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
      priceTableVersionId: null,
      contractTemplateVersionId: version.contractTemplateVersionId,
      customerType: offer.customerType,
      commercialStatus: CommercialStatus.APPROVED,
      negotiationSnapshot: {
        ...calculation,
        offer: { id: offer.id, code: offer.code, name: offer.name, version: version.version },
        contractTemplateVersionId: version.contractTemplateVersionId,
        source: 'PUBLIC_OFFER',
      },
      planPriceId: null,
      status: OpportunityStatus.OPEN,
      expectedValue: Number(calculation.pricing.finalAmount).toFixed(2),
      billingCycle: calculation.cycle,
      billingType: calculation.allowedBillingTypes[0] || BillingType.CREDIT_CARD,
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
    if (offer.customerType === CustomerType.PERSON) {
      await this.workflow.prepareContract(precheckout.token);
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

  private simulateVersion(
    offer: CommercialOffer,
    version: CommercialOfferVersion,
    dto: SimulatePublicOfferDto,
    billingOptions: CommercialOfferBillingOption[],
  ) {
    const requestedCycle = dto.cycle
      || (billingOptions.some((option) => option.billingCycle === BillingCycle.MONTHLY)
        ? BillingCycle.MONTHLY
        : billingOptions[0]?.billingCycle);
    const option = billingOptions.find((item) => item.billingCycle === requestedCycle);
    if (!option) {
      throw new BadRequestException('A periodicidade selecionada não está disponível nesta oferta.');
    }
    if (offer.customerType === CustomerType.COMPANY && option.billingCycle !== BillingCycle.MONTHLY) {
      throw new BadRequestException('Pessoa jurídica utiliza somente cobrança mensal.');
    }

    const lives = dto.lives ?? version.minLives;
    if (offer.customerType === CustomerType.COMPANY
      && (lives < version.minLives || (version.maxLives != null && lives > version.maxLives))) {
      throw new BadRequestException('Quantidade de vidas fora dos limites da oferta.');
    }
    const dependentCount = dto.dependentCount ?? 0;
    if (offer.customerType === CustomerType.PERSON && dependentCount > version.maxDependents) {
      throw new BadRequestException('Quantidade de dependentes acima do limite da oferta.');
    }

    const allowedBillingTypes = this.allowedBillingTypes(
      offer.customerType,
      option.billingCycle,
      option.allowedBillingTypes,
      option.pricingRules,
    );
    return {
      ...this.pricing.calculate({
        customerType: offer.customerType,
        cycle: option.billingCycle,
        billingType: allowedBillingTypes[0],
        baseAmount: Number(option.holderAmount || option.unitPrice || 0),
        dependentAmount: Number(option.dependentAmount || 0),
        dependentCount,
        unitPrice: Number(option.unitPrice || 0),
        annualDiscountPercent: Number(option.annualDiscountPercent || 0),
        lives,
        discounts: [],
      }),
      allowedBillingTypes,
      limits: {
        maxDependents: version.maxDependents,
        minLives: version.minLives,
        maxLives: version.maxLives,
      },
    };
  }

  private publicVersion(
    offer: CommercialOffer,
    version: CommercialOfferVersion,
    billingOptions: CommercialOfferBillingOption[],
  ) {
    const options = billingOptions.map((option) => ({
      id: option.id,
      billingCycle: option.billingCycle,
      holderAmount: option.holderAmount == null ? null : Number(option.holderAmount),
      dependentAmount: option.dependentAmount == null ? null : Number(option.dependentAmount),
      unitPrice: option.unitPrice == null ? null : Number(option.unitPrice),
      annualDiscountPercent: Number(option.annualDiscountPercent || 0),
      allowedBillingTypes: this.allowedBillingTypes(
        offer.customerType,
        option.billingCycle,
        option.allowedBillingTypes,
        option.pricingRules,
      ),
    }));
    const primary = options.find((option) => option.billingCycle === BillingCycle.MONTHLY) || options[0];
    return {
      id: version.id,
      version: version.version,
      billingCycle: primary?.billingCycle || version.billingCycle,
      holderAmount: primary?.holderAmount ?? (version.holderAmount == null ? null : Number(version.holderAmount)),
      dependentAmount: primary?.dependentAmount ?? (version.dependentAmount == null ? null : Number(version.dependentAmount)),
      unitPrice: primary?.unitPrice ?? (version.unitPrice == null ? null : Number(version.unitPrice)),
      annualDiscountPercent: primary?.annualDiscountPercent || 0,
      maxDependents: version.maxDependents,
      minLives: version.minLives,
      maxLives: version.maxLives,
      allowedBillingTypes: primary?.allowedBillingTypes || [],
      billingOptions: options,
      contractTemplateVersionId: version.contractTemplateVersionId,
    };
  }

  private async getBillingOptions(version: CommercialOfferVersion) {
    const persisted = await this.offerBillingOptions.find({
      where: { unitId: version.unitId, offerVersionId: version.id },
      order: { billingCycle: 'ASC' },
    });
    if (persisted.length) return persisted;

    // Compatibilidade com versões criadas antes das opções múltiplas de cobrança.
    return [this.offerBillingOptions.create({
      unitId: version.unitId,
      offerVersionId: version.id,
      billingCycle: version.billingCycle,
      holderAmount: version.holderAmount,
      dependentAmount: version.dependentAmount,
      unitPrice: version.unitPrice,
      annualDiscountPercent: '0.00',
      allowedBillingTypes: version.allowedBillingTypes,
      pricingRules: version.pricingRules,
    })];
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

  private normalizeOfferBillingOptions(
    customerType: CustomerType,
    dto: CreateCommercialOfferVersionDto,
  ): CommercialOfferBillingOptionDto[] {
    const source = dto.billingOptions?.length
      ? dto.billingOptions
      : [{
          billingCycle: dto.billingCycle || BillingCycle.MONTHLY,
          holderAmount: dto.holderAmount,
          dependentAmount: dto.dependentAmount,
          unitPrice: dto.unitPrice,
          annualDiscountPercent: dto.annualDiscountPercent || 0,
          allowedBillingTypes: dto.allowedBillingTypes || [],
          pricingRules: dto.pricingRules || {},
        }];
    return source.map((option) => ({
      ...option,
      holderAmount: customerType === CustomerType.PERSON ? option.holderAmount : undefined,
      dependentAmount: customerType === CustomerType.PERSON ? option.dependentAmount : undefined,
      unitPrice: customerType === CustomerType.COMPANY ? option.unitPrice : undefined,
      annualDiscountPercent: option.billingCycle === BillingCycle.YEARLY
        ? Number(option.annualDiscountPercent || 0)
        : 0,
      allowedBillingTypes: [...new Set(option.allowedBillingTypes || [])],
      pricingRules: option.pricingRules || {},
    }));
  }

  private validateOfferVersion(
    customerType: CustomerType,
    dto: CreateCommercialOfferVersionDto,
    options: CommercialOfferBillingOptionDto[],
  ) {
    this.validateBillingOptions(customerType, options);
    if (dto.maxLives != null && dto.maxLives < (dto.minLives || 1)) {
      throw new BadRequestException('O máximo de vidas deve ser maior ou igual ao mínimo.');
    }
  }

  private validateBillingOptions(
    customerType: CustomerType,
    options: CommercialOfferBillingOptionDto[],
  ) {
    if (!options.length) throw new BadRequestException('Informe ao menos uma opção de cobrança.');
    if (new Set(options.map((option) => option.billingCycle)).size !== options.length) {
      throw new BadRequestException('Cada periodicidade pode aparecer somente uma vez na oferta.');
    }

    for (const option of options) {
      if (!option.allowedBillingTypes?.length) {
        throw new BadRequestException('Informe ao menos uma forma de pagamento em cada periodicidade.');
      }
      const allowed = this.allowedBillingTypes(
        customerType,
        option.billingCycle,
        option.allowedBillingTypes,
        option.pricingRules || {},
      );
      if (allowed.length !== option.allowedBillingTypes.length) {
        throw new BadRequestException(
          'Há formas de pagamento incompatíveis com a periodicidade selecionada.',
        );
      }
      if (customerType === CustomerType.PERSON) {
        if (![BillingCycle.MONTHLY, BillingCycle.YEARLY].includes(option.billingCycle)) {
          throw new BadRequestException('Ofertas PF aceitam apenas cobrança mensal ou anual.');
        }
        if (option.holderAmount == null) {
          throw new BadRequestException('Informe o valor do titular em todas as opções PF.');
        }
        if (!allowed.includes(BillingType.CREDIT_CARD)) {
          throw new BadRequestException('Ofertas PF devem permitir cartão de crédito.');
        }
      } else {
        if (options.length !== 1 || option.billingCycle !== BillingCycle.MONTHLY) {
          throw new BadRequestException('Ofertas PJ possuem somente cobrança mensal.');
        }
        if (option.unitPrice == null) {
          throw new BadRequestException('Informe o preço mensal por vida.');
        }
      }
    }
  }

  private validatePriceTable(dto: CreateCommercialPriceTableVersionDto) {
    if (!dto.monthlyBillingTypes?.length) {
      throw new BadRequestException('Informe as formas de pagamento mensais.');
    }
    if (dto.maxLives != null && dto.maxLives < (dto.minLives || 1)) {
      throw new BadRequestException('O máximo de vidas deve ser maior ou igual ao mínimo.');
    }
    if (dto.customerType === CustomerType.PERSON) {
      if (dto.holderAmount == null) throw new BadRequestException('Informe o valor mensal do titular.');
      if (!dto.monthlyBillingTypes.includes(BillingType.CREDIT_CARD)) {
        throw new BadRequestException('A tabela PF mensal deve permitir cartão de crédito.');
      }
      if (!(dto.yearlyBillingTypes || []).includes(BillingType.CREDIT_CARD)) {
        throw new BadRequestException('A tabela PF anual deve permitir cartão de crédito.');
      }
      const monthly = this.allowedBillingTypes(
        CustomerType.PERSON,
        BillingCycle.MONTHLY,
        dto.monthlyBillingTypes,
        { allowMonthlyBoleto: dto.monthlyBillingTypes.includes(BillingType.BOLETO) },
      );
      const yearly = this.allowedBillingTypes(
        CustomerType.PERSON,
        BillingCycle.YEARLY,
        dto.yearlyBillingTypes || [],
      );
      if (monthly.length !== dto.monthlyBillingTypes.length
        || yearly.length !== (dto.yearlyBillingTypes || []).length) {
        throw new BadRequestException('Há formas de pagamento incompatíveis com a periodicidade PF.');
      }
      return;
    }
    if (dto.unitPrice == null) throw new BadRequestException('Informe o preço mensal por vida.');
    if (dto.yearlyBillingTypes?.length) {
      throw new BadRequestException('Pessoa jurídica utiliza somente cobrança mensal.');
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
    if (offer.assignmentUserId) {
      const membership = await this.memberships.findOne({
        where: { unitId: offer.unitId, userId: offer.assignmentUserId, active: true },
      });
      return membership && [UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER, UnitRole.SALES].includes(membership.role)
        ? offer.assignmentUserId
        : null;
    }
    if (!offer.assignmentTeamId) return null;
    const members = await this.teamMembers.find({
      where: { unitId: offer.unitId, teamId: offer.assignmentTeamId },
    });
    if (!members.length) return null;
    const memberships = await this.memberships.find({
      where: {
        unitId: offer.unitId,
        userId: In(members.map((member) => member.userId)),
        active: true,
        role: UnitRole.SALES,
      },
    });
    const eligibleUserIds: string[] = [...new Set<string>(memberships.map((membership) => membership.userId))];
    if (!eligibleUserIds.length) return null;
    const counts = await this.opportunities.createQueryBuilder('opportunity')
      .select('opportunity.owner_user_id', 'ownerUserId')
      .addSelect('COUNT(*)', 'total')
      .where('opportunity.unit_id = :unitId', { unitId: offer.unitId })
      .andWhere('opportunity.owner_user_id IN (:...userIds)', { userIds: eligibleUserIds })
      .andWhere('opportunity.status IN (:...statuses)', { statuses: [OpportunityStatus.OPEN, OpportunityStatus.CHECKOUT_PENDING] })
      .groupBy('opportunity.owner_user_id')
      .getRawMany<{ ownerUserId: string; total: string }>();
    const byUser = new Map<string, number>(counts.map((row) => [row.ownerUserId, Number(row.total)] as [string, number]));
    return eligibleUserIds.sort((a, b) => (byUser.get(a) || 0) - (byUser.get(b) || 0))[0];
  }

  private async defaultStage(unitId: string) {
    const pipeline = await this.pipelines.findOne({ where: { unitId, isDefault: true, active: true } });
    if (!pipeline) return null;
    return this.stages.findOne({ where: { unitId, pipelineId: pipeline.id, active: true }, order: { position: 'ASC' } });
  }
}
