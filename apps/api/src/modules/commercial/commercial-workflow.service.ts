import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import {
  ApprovalRequest, ApprovalStatus, AuditLog, BillingCustomer, BillingProviderName, BillingType, CheckoutSession,
  CheckoutStatus, CommercialOfferVersion, CommercialStatus, Contract, ContractAcceptance, ContractRelationType, ContractStatus,
  ContractTemplateStatus, ContractTemplateVersion, CustomerType, GlobalRole, MemberRole, NegotiationPolicy, Opportunity,
  OpportunityMember, OpportunityStatus, Person, PersonKind, PrecheckoutParticipant, PrecheckoutSession,
  PrecheckoutStatus, Subscription, TeamMember, UnitRole,
} from '../../database/entities';
import { isValidCnpj, isValidCpf, isValidTaxId, normalizeTaxId } from '../../common/utils/tax-id';
import { PricingService } from './pricing.service';
import { evaluateNegotiationPolicies } from './policy-evaluator';
import { CommercialFeatureService } from './commercial-feature.service';
import { AsaasClient } from '../billing/asaas.client';
import {
  AcceptContractDto, CreateContractRevisionDto, CreatePolicyDto, DecideApprovalDto, PrecheckoutParticipantDto,
  RequestApprovalDto, StartAsaasCheckoutDto, UpdatePrecheckoutCustomerDto,
} from './commercial.dto';

@Injectable()
export class CommercialWorkflowService {
  constructor(
    @InjectRepository(NegotiationPolicy) private readonly policies: Repository<NegotiationPolicy>,
    @InjectRepository(ApprovalRequest) private readonly approvals: Repository<ApprovalRequest>,
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    @InjectRepository(Contract) private readonly contracts: Repository<Contract>,
    @InjectRepository(ContractAcceptance) private readonly acceptances: Repository<ContractAcceptance>,
    @InjectRepository(PrecheckoutSession) private readonly sessions: Repository<PrecheckoutSession>,
    @InjectRepository(PrecheckoutParticipant) private readonly participants: Repository<PrecheckoutParticipant>,
    @InjectRepository(OpportunityMember) private readonly opportunityMembers: Repository<OpportunityMember>,
    @InjectRepository(TeamMember) private readonly teamMembers: Repository<TeamMember>,
    @InjectRepository(CommercialOfferVersion) private readonly offerVersions: Repository<CommercialOfferVersion>,
    @InjectRepository(ContractTemplateVersion) private readonly templateVersions: Repository<ContractTemplateVersion>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(BillingCustomer) private readonly billingCustomers: Repository<BillingCustomer>,
    @InjectRepository(CheckoutSession) private readonly checkoutSessions: Repository<CheckoutSession>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    private readonly pricing: PricingService,
    private readonly asaas: AsaasClient,
    private readonly feature: CommercialFeatureService,
  ) {}

  listPolicies(unitId: string) {
    return this.policies.find({
      where: { unitId },
      order: { active: 'DESC', name: 'ASC' },
    });
  }

  async savePolicy(unitId: string, dto: CreatePolicyDto, id?: string, actorUserId?: string) {
    const current = id ? await this.policies.findOne({ where: { unitId, id } }) : null;
    if (id && !current) throw new NotFoundException('Política não encontrada.');
    const before = current ? this.policySnapshot(current) : null;
    const entity = current || this.policies.create({ unitId, archivedAt: null });
    const rules = { ...(dto.rules || {}) };
    const customerType = dto.customerType || null;
    if (customerType === CustomerType.PERSON) delete rules.maxLives;
    Object.assign(entity, {
      name: dto.name,
      customerType,
      targetRole: dto.targetRole || null,
      targetUserId: dto.targetUserId || null,
      maxDiscountPercent: Number(dto.maxDiscountPercent || 0).toFixed(2),
      maxDiscountAmount: dto.maxDiscountAmount == null ? null : Number(dto.maxDiscountAmount).toFixed(2),
      minUnitPrice: customerType === CustomerType.PERSON || dto.minUnitPrice == null
        ? null
        : Number(dto.minUnitPrice).toFixed(2),
      allowedBillingTypes: dto.allowedBillingTypes || [],
      active: entity.archivedAt ? false : dto.active !== false,
      rules,
    });
    const saved = await this.policies.save(entity);
    await this.audit(
      unitId,
      actorUserId || null,
      id ? 'negotiation_policy.updated' : 'negotiation_policy.created',
      'negotiation_policy',
      saved.id,
      before,
      this.policySnapshot(saved),
    );
    return saved;
  }

  async setPolicyActive(unitId: string, id: string, active: boolean, actorUserId?: string) {
    const policy = await this.policies.findOne({ where: { unitId, id } });
    if (!policy) throw new NotFoundException('Política não encontrada.');
    if (policy.archivedAt) throw new ConflictException('Restaure a política antes de ativá-la ou desativá-la.');
    if (policy.active === active) return policy;
    const before = this.policySnapshot(policy);
    policy.active = active;
    const saved = await this.policies.save(policy);
    await this.audit(
      unitId,
      actorUserId || null,
      active ? 'negotiation_policy.activated' : 'negotiation_policy.deactivated',
      'negotiation_policy',
      saved.id,
      before,
      this.policySnapshot(saved),
    );
    return saved;
  }

  async archivePolicy(unitId: string, id: string, actorUserId?: string) {
    const policy = await this.policies.findOne({ where: { unitId, id } });
    if (!policy) throw new NotFoundException('Política não encontrada.');
    if (policy.archivedAt) return policy;
    const before = this.policySnapshot(policy);
    policy.active = false;
    policy.archivedAt = new Date();
    const saved = await this.policies.save(policy);
    await this.audit(unitId, actorUserId || null, 'negotiation_policy.archived', 'negotiation_policy', saved.id, before, this.policySnapshot(saved));
    return saved;
  }

  async restorePolicy(unitId: string, id: string, actorUserId?: string) {
    const policy = await this.policies.findOne({ where: { unitId, id } });
    if (!policy) throw new NotFoundException('Política não encontrada.');
    if (!policy.archivedAt) return policy;
    const before = this.policySnapshot(policy);
    policy.archivedAt = null;
    policy.active = false;
    const saved = await this.policies.save(policy);
    await this.audit(unitId, actorUserId || null, 'negotiation_policy.restored', 'negotiation_policy', saved.id, before, this.policySnapshot(saved));
    return saved;
  }

  private policySnapshot(policy: NegotiationPolicy) {
    return {
      name: policy.name,
      customerType: policy.customerType,
      targetRole: policy.targetRole,
      targetUserId: policy.targetUserId,
      maxDiscountPercent: policy.maxDiscountPercent,
      maxDiscountAmount: policy.maxDiscountAmount,
      minUnitPrice: policy.minUnitPrice,
      allowedBillingTypes: policy.allowedBillingTypes,
      active: policy.active,
      archivedAt: policy.archivedAt,
      rules: policy.rules,
    };
  }

  async evaluate(
    unitId: string,
    userId: string,
    role: UnitRole | null,
    negotiation: any,
    customerType?: CustomerType,
  ) {
    const policies = await this.policies.find({ where: { unitId, active: true } });
    return evaluateNegotiationPolicies(policies, userId, role, {
      ...(negotiation || {}),
      customerType: negotiation?.customerType || customerType || null,
    });
  }

  async evaluateOpportunity(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, globalRole);
    const evaluation = await this.evaluate(unitId, userId, role, opportunity.negotiationSnapshot, opportunity.customerType);
    const approval = await this.currentApproval(unitId, opportunityId, opportunity.negotiationSnapshot);
    const approvedException = approval?.status === ApprovalStatus.APPROVED;
    const companyApprovalRequired = opportunity.customerType === CustomerType.COMPANY && !approvedException;
    return {
      ...evaluation,
      policyAllowed: evaluation.allowed,
      allowed: opportunity.customerType === CustomerType.COMPANY
        ? approvedException
        : evaluation.allowed || approvedException,
      approvalRequired: companyApprovalRequired || (!evaluation.allowed && !approvedException),
      approval,
    };
  }

  async requestApproval(unitId: string, opportunityId: string, userId: string, role: UnitRole | null, dto: RequestApprovalDto) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, GlobalRole.STANDARD);
    const evaluation = await this.evaluate(unitId, userId, role, opportunity.negotiationSnapshot, opportunity.customerType);
    if (evaluation.allowed && opportunity.customerType !== CustomerType.COMPANY) {
      throw new BadRequestException('A negociação está dentro dos limites e não exige aprovação.');
    }
    const current = await this.currentApproval(unitId, opportunityId, opportunity.negotiationSnapshot);
    if (current?.status === ApprovalStatus.APPROVED) return current;
    if (current?.status === ApprovalStatus.PENDING) return current;
    await this.approvals.update({ unitId, opportunityId, status: ApprovalStatus.PENDING }, { status: ApprovalStatus.CANCELLED });
    opportunity.commercialStatus = CommercialStatus.PENDING_APPROVAL;
    await this.opportunities.save(opportunity);
    const approval = await this.approvals.save(this.approvals.create({
      unitId, opportunityId, requestedBy: userId, decidedBy: null, status: ApprovalStatus.PENDING,
      reason: dto.reason, requestedConditions: opportunity.negotiationSnapshot, policyEvaluation: evaluation,
      decisionNotes: null, decidedAt: null,
    }));
    await this.audit(unitId, userId, 'negotiation.approval_requested', 'approval_request', approval.id, null, {
      opportunityId, reason: dto.reason, violations: evaluation.violations,
    });
    return approval;
  }

  listApprovals(unitId: string) { return this.approvals.find({ where: { unitId }, order: { createdAt: 'DESC' } }); }

  async decide(unitId: string, approvalId: string, userId: string, dto: DecideApprovalDto) {
    const approval = await this.approvals.findOne({ where: { unitId, id: approvalId } });
    if (!approval) throw new NotFoundException('Solicitação não encontrada.');
    if (approval.status !== ApprovalStatus.PENDING) throw new ConflictException('Solicitação já decidida.');
    const opportunity = await this.opportunities.findOneByOrFail({ unitId, id: approval.opportunityId });
    if (dto.decision === 'APPROVED'
      && this.canonical(opportunity.negotiationSnapshot || {}) !== this.canonical(approval.requestedConditions || {})) {
      throw new ConflictException('As condições da negociação mudaram após a solicitação. Gere uma nova aprovação.');
    }
    approval.status = dto.decision === 'APPROVED' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    approval.decidedBy = userId; approval.decisionNotes = dto.notes || null; approval.decidedAt = new Date();
    opportunity.commercialStatus = approval.status === ApprovalStatus.APPROVED ? CommercialStatus.APPROVED : CommercialStatus.NEGOTIATION;
    await this.opportunities.save(opportunity);
    const saved = await this.approvals.save(approval);
    await this.audit(unitId, userId, 'negotiation.approval_decided', 'approval_request', approval.id, null, {
      opportunityId: approval.opportunityId, decision: approval.status, notes: approval.decisionNotes,
    });
    return saved;
  }


  async listContracts(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, globalRole);
    return this.contracts.find({
      where: { unitId, opportunityId },
      order: { version: 'DESC' },
    });
  }

  async createContractRevision(
    unitId: string,
    contractId: string,
    dto: CreateContractRevisionDto,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    await this.feature.assertEnabled(unitId);
    const parent = await this.contracts.findOne({ where: { unitId, id: contractId } });
    if (!parent) throw new NotFoundException('Contrato de origem não encontrado.');
    if (parent.status !== ContractStatus.ACCEPTED) {
      throw new BadRequestException('Somente contratos aceitos podem receber aditivo, renovação ou substituição.');
    }
    const opportunity = await this.opportunities.findOne({
      where: { unitId, id: parent.opportunityId },
    });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, globalRole);

    const existing = await this.contracts.find({
      where: { unitId, parentContractId: parent.id },
    });
    if (existing.some((item) => [ContractStatus.DRAFT, ContractStatus.READY].includes(item.status))) {
      throw new ConflictException('Já existe uma alteração contratual aguardando aceite.');
    }

    const currentNegotiation = parent.snapshot?.negotiation || opportunity.negotiationSnapshot || {};
    const changes = dto.changes || {};
    const currentPricing = currentNegotiation.pricing || {};
    const currentParticipants = currentNegotiation.participants || {};
    const cycle = changes.cycle || currentNegotiation.cycle || opportunity.billingCycle;
    if (!cycle) throw new BadRequestException('Periodicidade contratual não definida.');

    const allowedBillingTypes = changes.allowedBillingTypes?.length
      ? changes.allowedBillingTypes
      : currentNegotiation.allowedBillingTypes?.length
        ? currentNegotiation.allowedBillingTypes
        : opportunity.billingType
          ? [opportunity.billingType]
          : [BillingType.CREDIT_CARD];
    const billingType = allowedBillingTypes.includes(opportunity.billingType as BillingType)
      ? opportunity.billingType as BillingType
      : allowedBillingTypes[0];

    const calculation = this.pricing.calculate({
      customerType: opportunity.customerType,
      cycle,
      billingType,
      baseAmount: opportunity.customerType === CustomerType.PERSON
        ? Number(changes.holderAmount ?? currentPricing.holderAmount ?? currentPricing.baseAmount ?? opportunity.expectedValue ?? 0)
        : Number(changes.unitPrice ?? currentPricing.unitPrice ?? currentPricing.baseAmount ?? opportunity.expectedValue ?? 0),
      dependentAmount: opportunity.customerType === CustomerType.PERSON
        ? Number(changes.dependentAmount ?? currentPricing.dependentAmount ?? 0)
        : undefined,
      dependentCount: opportunity.customerType === CustomerType.PERSON
        ? Number(changes.dependentCount ?? currentParticipants.dependentCount ?? 0)
        : undefined,
      unitPrice: opportunity.customerType === CustomerType.COMPANY
        ? Number(changes.unitPrice ?? currentPricing.unitPrice ?? 0)
        : undefined,
      lives: opportunity.customerType === CustomerType.COMPANY
        ? Number(changes.lives ?? currentParticipants.contractedLives ?? 1)
        : undefined,
      discounts: changes.discounts ?? currentNegotiation.discounts ?? [],
    });
    const negotiation = {
      ...calculation,
      allowedBillingTypes,
      revisionEffectiveAt: changes.effectiveAt || new Date().toISOString().slice(0, 10),
    };
    const policyEvaluation = await this.evaluate(unitId, userId, role, negotiation);
    if (!policyEvaluation.allowed && ![UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER].includes(role as UnitRole)
      && globalRole !== GlobalRole.INSTALLATION_ADMIN) {
      throw new BadRequestException({
        message: 'A alteração contratual ultrapassa os limites do usuário.',
        violations: policyEvaluation.violations,
      });
    }

    const revisionData = {
      relationType: dto.relationType,
      reason: dto.reason.trim(),
      changes,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      parentContractId: parent.id,
      parentContentHash: parent.contentHash,
    };
    const snapshot = {
      ...parent.snapshot,
      negotiation,
      revision: revisionData,
    };
    const content = this.renderRevision(parent, revisionData, negotiation);
    const contentHash = this.hash(content);
    const allContracts = await this.contracts.find({
      where: { unitId, opportunityId: opportunity.id },
    });
    const requiresPayment = dto.requiresPayment
      ?? [ContractRelationType.RENEWAL, ContractRelationType.REPLACEMENT].includes(dto.relationType);
    const nextVersion = Math.max(parent.version, ...allContracts.map((item) => item.version || 0)) + 1;

    const revision = await this.contracts.save(this.contracts.create({
      unitId,
      opportunityId: opportunity.id,
      parentContractId: parent.id,
      relationType: dto.relationType,
      changeReason: dto.reason.trim(),
      requiresPayment,
      version: nextVersion,
      status: ContractStatus.READY,
      templateCode: parent.templateCode,
      templateVersionId: parent.templateVersionId,
      snapshot,
      renderedContent: content,
      contentHash,
      acceptedAt: null,
    }));

    const previousSessions = await this.sessions.find({
      where: { unitId, opportunityId: opportunity.id },
    });
    if (previousSessions.some((item) =>
      [PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING].includes(item.status))) {
      revision.status = ContractStatus.VOID;
      await this.contracts.save(revision);
      throw new ConflictException('Existe uma contratação aguardando pagamento.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresInDays = dto.expiresInDays || 7;
    const session = await this.sessions.save(this.sessions.create({
      unitId,
      opportunityId: opportunity.id,
      contractId: revision.id,
      checkoutSessionId: null,
      tokenHash: this.hash(token),
      status: PrecheckoutStatus.CONTRACT_READY,
      expiresAt: new Date(Date.now() + expiresInDays * 86400000),
      revokedAt: null,
      customerData: parent.snapshot?.customer || {},
      pricingSnapshot: negotiation,
    }));
    const originalParticipants = Array.isArray(parent.snapshot?.participants)
      ? parent.snapshot.participants
      : [];
    for (const participant of originalParticipants) {
      if (!participant?.name || !participant?.taxId) continue;
      await this.participants.save(this.participants.create({
        unitId,
        precheckoutSessionId: session.id,
        role: participant.role || MemberRole.DEPENDENT,
        name: participant.name,
        taxId: normalizeTaxId(participant.taxId),
        birthDate: participant.birthDate || null,
        relationship: participant.relationship || null,
      }));
    }

    await this.audit(unitId, userId, 'contract.revision_created', 'contract', revision.id, null, {
      opportunityId: opportunity.id,
      parentContractId: parent.id,
      relationType: revision.relationType,
      requiresPayment,
      contentHash,
    });
    return {
      contract: revision,
      precheckout: {
        id: session.id,
        token,
        expiresAt: session.expiresAt,
        url: `/checkout/${token}`,
      },
      policyEvaluation,
    };
  }

  async createPrecheckout(unitId: string, opportunityId: string, expiresInDays = 7, userId?: string, role?: UnitRole | null, globalRole?: GlobalRole) {
    await this.feature.assertEnabled(unitId);
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    if (userId) {
      await this.assertOpportunityAccess(opportunity, userId, role || null, globalRole || GlobalRole.STANDARD);
      const evaluation = await this.evaluate(unitId, userId, role || null, opportunity.negotiationSnapshot, opportunity.customerType);
      const approval = await this.currentApproval(unitId, opportunityId, opportunity.negotiationSnapshot);
      const hasApprovedException = approval?.status === ApprovalStatus.APPROVED;
      if (!evaluation.allowed && !hasApprovedException) {
        throw new BadRequestException('A negociação possui condições sem aprovação válida.');
      }
      if (opportunity.customerType === CustomerType.COMPANY && !hasApprovedException) {
        throw new BadRequestException('A negociação jurídica precisa estar aprovada.');
      }
    }

    const previousSessions = await this.sessions.find({ where: { unitId, opportunityId } });
    if (previousSessions.some((item) =>
      [PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING].includes(item.status))) {
      throw new ConflictException('Já existe uma contratação aceita ou aguardando pagamento.');
    }
    for (const previous of previousSessions.filter((item) =>
      ![PrecheckoutStatus.COMPLETED, PrecheckoutStatus.REVOKED, PrecheckoutStatus.EXPIRED].includes(item.status))) {
      previous.status = PrecheckoutStatus.REVOKED;
      previous.revokedAt = new Date();
      await this.sessions.save(previous);
    }

    const primaryPerson = await this.people.findOneByOrFail({
      id: opportunity.primaryPersonId,
      unitId,
    });
    const opportunityDependents = opportunity.customerType === CustomerType.PERSON
      ? await this.opportunityMembers.find({
          where: { unitId, opportunityId, role: MemberRole.DEPENDENT },
          order: { createdAt: 'ASC' },
        })
      : [];
    const dependentPeople = opportunityDependents.length
      ? await this.people.find({
          where: { unitId, id: In(opportunityDependents.map((member) => member.personId)) },
        })
      : [];

    let pricingSnapshot = opportunity.negotiationSnapshot || {};
    if (opportunity.customerType === CustomerType.PERSON && pricingSnapshot?.pricing) {
      const cycle = pricingSnapshot.cycle || opportunity.billingCycle;
      if (cycle) {
        const calculation = this.pricing.calculate({
          customerType: CustomerType.PERSON,
          cycle,
          billingType: pricingSnapshot.billingType || opportunity.billingType,
          baseAmount: Number(pricingSnapshot.pricing.holderAmount ?? pricingSnapshot.pricing.baseAmount ?? 0),
          dependentAmount: Number(pricingSnapshot.pricing.dependentAmount ?? 0),
          dependentCount: opportunityDependents.length,
          discounts: pricingSnapshot.discounts || [],
        });
        pricingSnapshot = {
          ...calculation,
          allowedBillingTypes: pricingSnapshot.allowedBillingTypes,
          limits: pricingSnapshot.limits,
          offer: pricingSnapshot.offer,
          source: pricingSnapshot.source,
          policyEvaluation: pricingSnapshot.policyEvaluation,
        };
        opportunity.negotiationSnapshot = pricingSnapshot;
        opportunity.expectedValue = Number(calculation.pricing.finalAmount).toFixed(2);
        await this.opportunities.save(opportunity);
      }
    }

    const token = randomBytes(32).toString('hex');
    const session = await this.sessions.save(this.sessions.create({
      unitId,
      opportunityId,
      contractId: null,
      checkoutSessionId: null,
      tokenHash: this.hash(token),
      status: PrecheckoutStatus.CREATED,
      expiresAt: new Date(Date.now() + expiresInDays * 86400000),
      revokedAt: null,
      customerData: {
        name: primaryPerson.name,
        taxId: primaryPerson.taxId,
        email: primaryPerson.email,
        phone: primaryPerson.phone || primaryPerson.whatsapp,
        postalCode: primaryPerson.postalCode,
        address: primaryPerson.address,
        addressNumber: primaryPerson.addressNumber,
        complement: primaryPerson.complement,
        district: primaryPerson.district,
        city: primaryPerson.city,
        state: primaryPerson.state,
      },
      pricingSnapshot,
    }));

    for (const member of opportunityDependents) {
      const person = dependentPeople.find((item) => item.id === member.personId);
      if (!person) continue;
      await this.participants.save(this.participants.create({
        unitId,
        precheckoutSessionId: session.id,
        role: MemberRole.DEPENDENT,
        name: person.name,
        taxId: person.taxId || '',
        birthDate: person.birthDate,
        relationship: member.relationship,
      }));
    }

    await this.audit(unitId, userId || null, 'precheckout.created', 'precheckout_session', session.id, null, {
      opportunityId,
      expiresAt: session.expiresAt,
      prefilledDependents: opportunityDependents.length,
      finalAmount: pricingSnapshot?.pricing?.finalAmount ?? opportunity.expectedValue,
    });
    return { id: session.id, token, expiresAt: session.expiresAt, url: `/checkout/${token}` };
  }

  async revokePrecheckout(unitId: string, opportunityId: string, userId?: string, role?: UnitRole | null, globalRole?: GlobalRole) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    if (userId) await this.assertOpportunityAccess(opportunity, userId, role || null, globalRole || GlobalRole.STANDARD);
    const active = await this.sessions.find({ where: { unitId, opportunityId } });
    for (const session of active.filter(s=>![PrecheckoutStatus.COMPLETED,PrecheckoutStatus.REVOKED].includes(s.status))) {
      session.status = PrecheckoutStatus.REVOKED; session.revokedAt = new Date(); await this.sessions.save(session);
    }
    return { revoked: true };
  }

  private async ensureEditable(session: PrecheckoutSession) {
    if ([PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING, PrecheckoutStatus.COMPLETED].includes(session.status)) {
      throw new ConflictException('Os dados não podem ser alterados após o aceite do contrato.');
    }
    if (session.contractId) {
      const contract = await this.contracts.findOne({
        where: { id: session.contractId, unitId: session.unitId },
      });
      if (contract?.status === ContractStatus.ACCEPTED) {
        throw new ConflictException('O contrato aceito é imutável.');
      }
      if (contract?.parentContractId) {
        throw new ConflictException('Os dados de um aditivo, renovação ou substituição não podem ser alterados no pré-checkout.');
      }
      if (contract?.status === ContractStatus.READY) {
        contract.status = ContractStatus.VOID;
        await this.contracts.save(contract);
      }
      session.contractId = null;
      session.status = PrecheckoutStatus.DATA_COMPLETED;
      await this.sessions.save(session);
    }
  }

  private async byToken(token: string) {
    const session = await this.sessions.findOne({ where: { tokenHash: this.hash(token) } });
    if (!session) throw new NotFoundException('Checkout não encontrado.');
    if (session.revokedAt || session.status === PrecheckoutStatus.REVOKED) throw new BadRequestException('Checkout revogado.');
    if (session.expiresAt.getTime() <= Date.now()) { session.status = PrecheckoutStatus.EXPIRED; await this.sessions.save(session); throw new BadRequestException('Checkout expirado.'); }
    return session;
  }

  async publicGet(token: string) {
    const session = await this.byToken(token);
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    const person = await this.people.findOneByOrFail({ id: opportunity.primaryPersonId, unitId: session.unitId });
    const participants = await this.participants.find({ where: { precheckoutSessionId: session.id, unitId: session.unitId } });
    const contract = session.contractId ? await this.contracts.findOne({ where: { id: session.contractId, unitId: session.unitId } }) : null;
    return {
      status: session.status,
      expiresAt: session.expiresAt,
      customerType: opportunity.customerType,
      customer: { name: person.name, taxId: person.taxId, email: person.email, phone: person.phone, ...session.customerData },
      pricing: session.pricingSnapshot,
      allowedBillingTypes: session.pricingSnapshot?.allowedBillingTypes
        || opportunity.negotiationSnapshot?.allowedBillingTypes
        || (opportunity.billingType ? [opportunity.billingType] : [BillingType.CREDIT_CARD]),
      participants,
      contract: contract && {
        id: contract.id,
        content: contract.renderedContent,
        hash: contract.contentHash,
        status: contract.status,
        relationType: contract.relationType,
        parentContractId: contract.parentContractId,
        requiresPayment: contract.requiresPayment,
        changeReason: contract.changeReason,
      },
    };
  }

  async updateCustomer(token: string, dto: UpdatePrecheckoutCustomerDto) {
    const session = await this.byToken(token);
    await this.ensureEditable(session);
    const taxId = normalizeTaxId(dto.taxId);
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    const validTaxId = opportunity.customerType === CustomerType.COMPANY
      ? isValidCnpj(taxId)
      : isValidCpf(taxId);
    if (!validTaxId) {
      throw new BadRequestException(opportunity.customerType === CustomerType.COMPANY ? 'CNPJ inválido.' : 'CPF inválido.');
    }
    const person = await this.people.findOneByOrFail({ id: opportunity.primaryPersonId, unitId: session.unitId });
    const before = { name: person.name, taxId: '[REDACTED]', email: person.email, phone: '[REDACTED]' };
    Object.assign(person, {
      name: dto.name.trim(),
      taxId,
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone,
      whatsapp: dto.phone,
      postalCode: dto.postalCode.replace(/\D/g, ''),
      address: dto.address,
      addressNumber: dto.addressNumber,
      district: dto.district,
      city: dto.city,
      state: dto.state.toUpperCase(),
      complement: dto.complement || null,
      kind: opportunity.customerType === CustomerType.COMPANY ? PersonKind.COMPANY : PersonKind.PERSON,
    });
    await this.people.save(person);
    session.customerData = {
      ...dto,
      taxId,
      email: dto.email.trim().toLowerCase(),
      postalCode: dto.postalCode.replace(/\D/g, ''),
      state: dto.state.toUpperCase(),
    };
    session.status = PrecheckoutStatus.DATA_COMPLETED;
    await this.sessions.save(session);
    await this.audit(session.unitId, null, 'precheckout.customer_updated', 'precheckout_session', session.id, before, {
      name: person.name, taxId: '[REDACTED]', email: person.email, phone: '[REDACTED]',
    });
    return this.publicGet(token);
  }

  async updateCompanyContacts(token: string, data: {
    legalRepresentativeName: string;
    legalRepresentativeTaxId: string;
    financialEmail: string;
    financialContactName: string;
    financialPhone: string;
  }) {
    const session = await this.byToken(token);
    await this.ensureEditable(session);
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    if (opportunity.customerType !== CustomerType.COMPANY) {
      throw new BadRequestException('Contatos empresariais são permitidos apenas para pessoa jurídica.');
    }
    const representativeTaxId = normalizeTaxId(data.legalRepresentativeTaxId);
    if (!isValidCpf(representativeTaxId)) throw new BadRequestException('CPF do responsável legal inválido.');
    session.customerData = {
      ...session.customerData,
      legalRepresentative: {
        name: data.legalRepresentativeName.trim(),
        taxId: representativeTaxId,
      },
      financialContact: {
        name: data.financialContactName.trim(),
        email: data.financialEmail.trim().toLowerCase(),
        phone: data.financialPhone,
      },
    };
    await this.sessions.save(session);
    return this.publicGet(token);
  }

  async addParticipant(token: string, dto: PrecheckoutParticipantDto) {
    const session = await this.byToken(token);
    await this.ensureEditable(session);
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    if (opportunity.customerType !== CustomerType.PERSON) throw new BadRequestException('Beneficiários empresariais serão cadastrados após a contratação.');
    const count = await this.participants.count({ where: { precheckoutSessionId: session.id, unitId: session.unitId } });
    const max = Number(session.pricingSnapshot?.limits?.maxDependents ?? 20);
    if (count >= max) throw new BadRequestException('Limite de dependentes atingido.');
    const taxId = dto.taxId.replace(/\D/g,'');
    if (!isValidCpf(taxId)) throw new BadRequestException('CPF do dependente inválido.');
    await this.participants.save(this.participants.create({ unitId: session.unitId, precheckoutSessionId: session.id, role: MemberRole.DEPENDENT, name: dto.name, taxId, birthDate: dto.birthDate || null, relationship: dto.relationship || null }));
    await this.reprice(session);
    return this.publicGet(token);
  }

  async removeParticipant(token: string, participantId: string) {
    const session = await this.byToken(token);
    await this.ensureEditable(session);
    await this.participants.delete({ id: participantId, precheckoutSessionId: session.id, unitId: session.unitId });
    await this.reprice(session);
    return this.publicGet(token);
  }

  private async reprice(session: PrecheckoutSession) {
    const count = await this.participants.count({ where: { precheckoutSessionId: session.id, unitId: session.unitId } });
    const current = session.pricingSnapshot;
    if (current?.customerType === CustomerType.PERSON) {
      const calculation = this.pricing.calculate({
        customerType: CustomerType.PERSON, cycle: current.cycle, billingType: current.billingType,
        baseAmount: Number(current.pricing?.holderAmount || current.pricing?.baseAmount || 0),
        dependentAmount: Number(current.pricing?.dependentAmount || 0), dependentCount: count, discounts: current.discounts || [],
      });
      session.pricingSnapshot = {
        ...calculation,
        allowedBillingTypes: current.allowedBillingTypes,
        limits: current.limits,
        offer: current.offer,
        source: current.source,
        policyEvaluation: current.policyEvaluation,
      };
      await this.sessions.save(session);
    }
  }

  async prepareContract(token: string) {
    const session = await this.byToken(token);
    if ([PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING, PrecheckoutStatus.COMPLETED].includes(session.status)) {
      throw new ConflictException('O contrato já foi aceito e não pode ser regenerado.');
    }
    if (!session.customerData?.name || !session.customerData?.taxId) {
      throw new BadRequestException('Confirme os dados cadastrais.');
    }
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    if (opportunity.customerType === CustomerType.COMPANY) {
      if (!session.customerData?.legalRepresentative?.name || !session.customerData?.financialContact?.email) {
        throw new BadRequestException('Informe os responsáveis legal e financeiro.');
      }
    }
    const participants = await this.participants.find({
      where: { precheckoutSessionId: session.id, unitId: session.unitId },
      order: { createdAt: 'ASC' },
    });
    const snapshot = {
      customer: session.customerData,
      participants,
      negotiation: session.pricingSnapshot,
      opportunityId: session.opportunityId,
      generatedAt: new Date().toISOString(),
    };
    const template = await this.resolveTemplate(opportunity);
    const content = template ? this.renderTemplate(template.content, snapshot) : this.render(snapshot);
    const hash = this.hash(content);
    const previous = await this.contracts.find({
      where: { unitId: session.unitId, opportunityId: session.opportunityId },
    });
    for (const previousContract of previous.filter((item) => item.status === ContractStatus.READY)) {
      previousContract.status = ContractStatus.VOID;
      await this.contracts.save(previousContract);
    }
    const contract = await this.contracts.save(this.contracts.create({
      unitId: session.unitId,
      opportunityId: session.opportunityId,
      parentContractId: null,
      relationType: ContractRelationType.ORIGINAL,
      changeReason: null,
      requiresPayment: true,
      version: previous.length + 1,
      status: ContractStatus.READY,
      templateCode: template ? `TEMPLATE_VERSION_${template.id}` : 'DEFAULT',
      templateVersionId: template?.id || null,
      snapshot,
      renderedContent: content,
      contentHash: hash,
      acceptedAt: null,
    }));
    session.contractId = contract.id;
    session.status = PrecheckoutStatus.CONTRACT_READY;
    await this.sessions.save(session);
    await this.audit(session.unitId, null, 'contract.generated', 'contract', contract.id, null, {
      opportunityId: session.opportunityId,
      version: contract.version,
      templateVersionId: contract.templateVersionId,
      contentHash: contract.contentHash,
    });
    return this.publicGet(token);
  }

  async accept(token: string, dto: AcceptContractDto, ip: string | null, userAgent: string | null) {
    if (!dto.accepted) throw new BadRequestException('O aceite é obrigatório.');
    const session = await this.byToken(token);
    if (!session.contractId) throw new BadRequestException('Gere o contrato antes do aceite.');
    const contract = await this.contracts.findOneByOrFail({ id: session.contractId, unitId: session.unitId });
    if (contract.status === ContractStatus.ACCEPTED) throw new ConflictException('Contrato já aceito.');
    const acceptedTaxId = normalizeTaxId(dto.acceptedByTaxId);
    if (!isValidTaxId(acceptedTaxId)) throw new BadRequestException('CPF/CNPJ do responsável inválido.');
    const opportunity = await this.opportunities.findOneByOrFail({
      id: session.opportunityId,
      unitId: session.unitId,
    });
    const person = await this.people.findOneByOrFail({
      id: opportunity.primaryPersonId,
      unitId: session.unitId,
    });
    const expectedSignerTaxId = opportunity.customerType === CustomerType.COMPANY
      ? normalizeTaxId(session.customerData?.legalRepresentative?.taxId || '')
      : normalizeTaxId(person.taxId || session.customerData?.taxId || '');
    if (expectedSignerTaxId && acceptedTaxId !== expectedSignerTaxId) {
      throw new BadRequestException(
        opportunity.customerType === CustomerType.COMPANY
          ? 'O aceite deve ser realizado pelo responsável legal informado.'
          : 'O aceite deve ser realizado pelo titular da contratação.',
      );
    }
    await this.syncParticipantsToOpportunity(session);
    const now = new Date();
    contract.status = ContractStatus.ACCEPTED;
    contract.acceptedAt = now;
    await this.contracts.save(contract);
    await this.acceptances.save(this.acceptances.create({
      unitId: session.unitId,
      contractId: contract.id,
      acceptedByName: dto.acceptedByName.trim(),
      acceptedByTaxId: acceptedTaxId,
      ipAddress: ip,
      userAgent,
      contentHash: contract.contentHash,
      acceptedAt: now,
      evidence: { method: 'CHECKBOX', precheckoutSessionId: session.id },
    }));
    session.status = contract.requiresPayment ? PrecheckoutStatus.ACCEPTED : PrecheckoutStatus.COMPLETED;
    await this.sessions.save(session);
    if (contract.parentContractId && !contract.requiresPayment) {
      await this.applyAcceptedRevision(contract, session);
    }
    await this.audit(session.unitId, null, 'contract.accepted', 'contract', contract.id, null, {
      opportunityId: session.opportunityId,
      acceptedAt: now,
      contentHash: contract.contentHash,
      acceptedByTaxId: '[REDACTED]',
    });
    return this.publicGet(token);
  }


  async startAsaasCheckout(token: string, dto: StartAsaasCheckoutDto) {
    const session = await this.byToken(token);
    if (session.status !== PrecheckoutStatus.ACCEPTED && session.status !== PrecheckoutStatus.PAYMENT_PENDING) {
      throw new BadRequestException('O contrato precisa estar aceito antes do pagamento.');
    }
    if (!session.contractId) throw new BadRequestException('Contrato não encontrado.');
    const contract = await this.contracts.findOneByOrFail({ id: session.contractId, unitId: session.unitId });
    if (contract.status !== ContractStatus.ACCEPTED) throw new BadRequestException('Contrato ainda não foi aceito.');
    if (!contract.requiresPayment) throw new BadRequestException('Esta alteração contratual não exige novo pagamento.');

    if (session.checkoutSessionId) {
      const existing = await this.checkoutSessions.findOne({
        where: { id: session.checkoutSessionId, unitId: session.unitId },
      });
      if (existing && [CheckoutStatus.CREATED, CheckoutStatus.PENDING].includes(existing.status)) {
        if (existing.url) {
          return { checkoutId: existing.id, checkoutLink: existing.url, expiresAt: existing.expiresAt };
        }
        if (existing.payload?.providerResourceType === 'SUBSCRIPTION' && existing.externalId) {
          const response = await this.asaas.subscriptionPayments(session.unitId, existing.externalId, undefined, 10);
          const payment = Array.isArray(response?.data) ? response.data[0] : null;
          existing.url = payment?.invoiceUrl || payment?.bankSlipUrl || null;
          existing.payload = { ...existing.payload, paymentId: payment?.id || null };
          await this.checkoutSessions.save(existing);
          if (existing.url) {
            return { checkoutId: existing.id, checkoutLink: existing.url, expiresAt: existing.expiresAt };
          }
          throw new BadRequestException(
            'O primeiro boleto ainda está sendo preparado pelo Asaas. Tente novamente em instantes.',
          );
        }
      }
    }

    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    const person = await this.people.findOneByOrFail({ id: opportunity.primaryPersonId, unitId: session.unitId });
    const configured = session.pricingSnapshot?.allowedBillingTypes
      || opportunity.negotiationSnapshot?.allowedBillingTypes
      || (opportunity.billingType ? [opportunity.billingType] : [BillingType.CREDIT_CARD]);
    const allowed = configured.map((value: string) => String(value).toUpperCase());
    if (!allowed.includes(dto.billingType)) throw new BadRequestException('Forma de pagamento não autorizada para esta contratação.');

    const customerData = { ...person, ...session.customerData };
    let billingCustomer = await this.billingCustomers.findOne({ where: { unitId: session.unitId, personId: person.id, provider: BillingProviderName.ASAAS } });
    if (!billingCustomer) {
      const external = await this.asaas.createCustomer(session.unitId, {
        name: customerData.name,
        cpfCnpj: String(customerData.taxId || '').replace(/\D/g, ''),
        email: customerData.email,
        phone: customerData.phone,
        postalCode: String(customerData.postalCode || '').replace(/\D/g, ''),
        address: customerData.address,
        addressNumber: customerData.addressNumber,
        complement: customerData.complement || undefined,
        province: customerData.district,
        externalReference: person.id,
      });
      billingCustomer = await this.billingCustomers.save(this.billingCustomers.create({
        unitId: session.unitId, personId: person.id, provider: BillingProviderName.ASAAS,
        externalId: external.id, metadata: { source: 'commercial_precheckout' },
      }));
    }

    const value = Number(session.pricingSnapshot?.pricing?.finalAmount
      ?? opportunity.negotiationSnapshot?.pricing?.finalAmount
      ?? opportunity.expectedValue ?? 0);
    if (!(value > 0)) throw new BadRequestException('Valor final inválido.');

    const appUrl = (process.env.APP_URL || 'http://localhost:4002').replace(/\/$/, '');
    const cycle = session.pricingSnapshot?.cycle || opportunity.billingCycle || 'MONTHLY';
    const nextDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    if (dto.billingType === BillingType.BOLETO) {
      return this.startBoletoSubscription({
        session, contract, opportunity, billingCustomer, value, cycle, nextDueDate,
      });
    }

    const result = await this.asaas.createCheckout(session.unitId, {
      billingTypes: [dto.billingType],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 1440,
      externalReference: opportunity.id,
      customerData: {
        name: customerData.name,
        cpfCnpj: String(customerData.taxId || '').replace(/\D/g, ''),
        email: customerData.email || undefined,
        phone: customerData.phone || undefined,
        postalCode: String(customerData.postalCode || '').replace(/\D/g, '') || undefined,
        address: customerData.address || undefined,
        addressNumber: customerData.addressNumber || undefined,
        complement: customerData.complement || undefined,
        province: customerData.district || undefined,
      },
      items: [{ name: process.env.APP_NAME || 'Clube de Assinatura', quantity: 1, value }],
      subscription: { cycle, nextDueDate },
      callback: {
        successUrl: `${appUrl}/checkout/${token}?payment=success`,
        cancelUrl: `${appUrl}/checkout/${token}?payment=cancelled`,
        expiredUrl: `${appUrl}/checkout/${token}?payment=expired`,
      },
    });

    const checkout = await this.checkoutSessions.save(this.checkoutSessions.create({
      unitId: session.unitId,
      opportunityId: opportunity.id,
      billingCustomerId: billingCustomer.id,
      provider: BillingProviderName.ASAAS,
      externalId: result.id,
      status: CheckoutStatus.PENDING,
      url: result.link,
      expiresAt: new Date(Date.now() + 86_400_000),
      payload: {
        contractId: contract.id,
        precheckoutSessionId: session.id,
        billingType: dto.billingType,
        providerResourceType: 'CHECKOUT',
      },
    }));
    session.checkoutSessionId = checkout.id;
    session.status = PrecheckoutStatus.PAYMENT_PENDING;
    opportunity.status = OpportunityStatus.CHECKOUT_PENDING;
    opportunity.commercialStatus = CommercialStatus.CHECKOUT_SENT;
    await this.sessions.save(session);
    await this.opportunities.save(opportunity);
    await this.audit(session.unitId, null, 'asaas.checkout_created', 'checkout_session', checkout.id, null, {
      opportunityId: opportunity.id,
      contractId: contract.id,
      externalId: checkout.externalId,
      billingType: dto.billingType,
      amount: value,
    });
    return { checkoutId: checkout.id, checkoutLink: checkout.url, expiresAt: checkout.expiresAt };
  }


  private async startBoletoSubscription(input: {
    session: PrecheckoutSession;
    contract: Contract;
    opportunity: Opportunity;
    billingCustomer: BillingCustomer;
    value: number;
    cycle: string;
    nextDueDate: string;
  }) {
    const { session, contract, opportunity, billingCustomer, value, cycle, nextDueDate } = input;
    const subscription = await this.asaas.createSubscription(session.unitId, {
      customer: billingCustomer.externalId,
      billingType: BillingType.BOLETO,
      value,
      nextDueDate,
      cycle,
      description: process.env.APP_NAME || 'Clube de Assinatura',
      externalReference: opportunity.id,
    });

    const checkout = await this.checkoutSessions.save(this.checkoutSessions.create({
      unitId: session.unitId,
      opportunityId: opportunity.id,
      billingCustomerId: billingCustomer.id,
      provider: BillingProviderName.ASAAS,
      externalId: subscription.id,
      status: CheckoutStatus.PENDING,
      url: null,
      expiresAt: null,
      payload: {
        contractId: contract.id,
        precheckoutSessionId: session.id,
        billingType: BillingType.BOLETO,
        providerResourceType: 'SUBSCRIPTION',
      },
    }));

    session.checkoutSessionId = checkout.id;
    session.status = PrecheckoutStatus.PAYMENT_PENDING;
    opportunity.status = OpportunityStatus.CHECKOUT_PENDING;
    opportunity.commercialStatus = CommercialStatus.CHECKOUT_SENT;
    await this.sessions.save(session);
    await this.opportunities.save(opportunity);

    try {
      const response = await this.asaas.subscriptionPayments(session.unitId, subscription.id, undefined, 10);
      const payment = Array.isArray(response?.data) ? response.data[0] : null;
      checkout.url = payment?.invoiceUrl || payment?.bankSlipUrl || null;
      checkout.payload = { ...checkout.payload, paymentId: payment?.id || null };
      await this.checkoutSessions.save(checkout);
    } catch (error) {
      await this.audit(session.unitId, null, 'asaas.boleto_link_pending', 'checkout_session', checkout.id, null, {
        opportunityId: opportunity.id,
        externalSubscriptionId: subscription.id,
      });
      throw error;
    }

    if (!checkout.url) {
      throw new BadRequestException(
        'A assinatura foi criada no Asaas, mas o link do primeiro boleto ainda não está disponível. Tente novamente em instantes.',
      );
    }

    await this.audit(session.unitId, null, 'asaas.subscription_created', 'checkout_session', checkout.id, null, {
      opportunityId: opportunity.id,
      contractId: contract.id,
      externalSubscriptionId: subscription.id,
      billingType: BillingType.BOLETO,
      amount: value,
    });
    return { checkoutId: checkout.id, checkoutLink: checkout.url, expiresAt: checkout.expiresAt };
  }


  private renderRevision(parent: Contract, revision: Record<string, any>, negotiation: Record<string, any>) {
    const title = {
      [ContractRelationType.AMENDMENT]: 'ADITIVO CONTRATUAL',
      [ContractRelationType.RENEWAL]: 'RENOVAÇÃO CONTRATUAL',
      [ContractRelationType.REPLACEMENT]: 'SUBSTITUIÇÃO CONTRATUAL',
      [ContractRelationType.ORIGINAL]: 'CONTRATO',
    }[revision.relationType as ContractRelationType];
    const effectiveAt = revision.changes?.effectiveAt || new Date().toISOString().slice(0, 10);
    const conditions = JSON.stringify({
      cycle: negotiation.cycle,
      participants: negotiation.participants,
      pricing: negotiation.pricing,
      discounts: negotiation.discounts,
      allowedBillingTypes: negotiation.allowedBillingTypes,
      notes: revision.changes?.notes || null,
    }, null, 2);
    return `${title}

Contrato de origem: ${parent.id}
Hash do contrato de origem: ${parent.contentHash}
Motivo: ${revision.reason}
Vigência das alterações: ${effectiveAt}

CONDIÇÕES ATUALIZADAS
${conditions}

As demais cláusulas do contrato de origem permanecem inalteradas.`;
  }

  private async applyAcceptedRevision(contract: Contract, session: PrecheckoutSession) {
    const negotiation = contract.snapshot?.negotiation || session.pricingSnapshot || {};
    const opportunity = await this.opportunities.findOne({
      where: { unitId: contract.unitId, id: contract.opportunityId },
    });
    if (!opportunity) throw new NotFoundException('Oportunidade da alteração contratual não encontrada.');
    opportunity.negotiationSnapshot = negotiation;
    opportunity.expectedValue = Number(negotiation.pricing?.finalAmount || opportunity.expectedValue || 0).toFixed(2);
    opportunity.billingCycle = negotiation.cycle || opportunity.billingCycle;
    opportunity.billingType = negotiation.allowedBillingTypes?.[0] || opportunity.billingType;
    await this.opportunities.save(opportunity);

    const subscription = await this.subscriptions.findOne({
      where: { unitId: contract.unitId, sourceOpportunityId: opportunity.id },
    });
    if (subscription) {
      subscription.metadata = {
        ...(subscription.metadata || {}),
        contractId: contract.id,
        contractVersion: contract.version,
        contractHash: contract.contentHash,
        contractRelationType: contract.relationType,
        parentContractId: contract.parentContractId,
        negotiationSnapshot: negotiation,
        contractedLives: negotiation.participants?.contractedLives || null,
      };
      await this.subscriptions.save(subscription);
    }
    await this.audit(contract.unitId, null, 'contract.revision_applied', 'contract', contract.id, null, {
      opportunityId: opportunity.id,
      subscriptionId: subscription?.id || null,
      relationType: contract.relationType,
      requiresPayment: contract.requiresPayment,
    });
  }

  private async resolveTemplate(opportunity: Opportunity) {
    if (opportunity.offerVersionId) {
      const offerVersion = await this.offerVersions.findOne({
        where: { id: opportunity.offerVersionId, unitId: opportunity.unitId },
      });
      if (offerVersion?.contractTemplateVersionId) {
        const selected = await this.templateVersions.findOne({
          where: { id: offerVersion.contractTemplateVersionId, unitId: opportunity.unitId },
        });
        if (selected?.status === ContractTemplateStatus.PUBLISHED) return selected;
      }
    }
    return null;
  }

  private renderTemplate(template: string, snapshot: any) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
      const value = path.split('.').reduce((current: any, key: string) => current?.[key], snapshot);
      if (value == null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  private async syncParticipantsToOpportunity(session: PrecheckoutSession) {
    const opportunity = await this.opportunities.findOneByOrFail({
      id: session.opportunityId,
      unitId: session.unitId,
    });
    if (opportunity.customerType !== CustomerType.PERSON) return;
    const participants = await this.participants.find({
      where: { precheckoutSessionId: session.id, unitId: session.unitId },
    });
    for (const participant of participants) {
      let person = await this.people.findOne({
        where: { unitId: session.unitId, taxId: participant.taxId },
      });
      if (!person) {
        person = await this.people.save(this.people.create({
          unitId: session.unitId,
          kind: PersonKind.PERSON,
          name: participant.name,
          taxId: participant.taxId,
          email: null,
          phone: null,
          whatsapp: null,
          birthDate: participant.birthDate,
          address: null,
          addressNumber: null,
          complement: null,
          district: null,
          city: null,
          state: null,
          postalCode: null,
          metadata: { source: 'precheckout' },
        }));
      }
      const exists = await this.opportunityMembers.exists({
        where: {
          unitId: session.unitId,
          opportunityId: session.opportunityId,
          personId: person.id,
        },
      });
      if (!exists) {
        await this.opportunityMembers.save(this.opportunityMembers.create({
          unitId: session.unitId,
          opportunityId: session.opportunityId,
          personId: person.id,
          role: MemberRole.DEPENDENT,
          relationship: participant.relationship,
        }));
      }
    }
  }

  private async currentApproval(unitId: string, opportunityId: string, snapshot: Record<string, any>) {
    const approvals = await this.approvals.find({
      where: { unitId, opportunityId },
      order: { createdAt: 'DESC' },
    });
    const currentSnapshot = this.canonical(snapshot || {});
    return approvals.find((approval) =>
      approval.status !== ApprovalStatus.CANCELLED
      && this.canonical(approval.requestedConditions || {}) === currentSnapshot,
    ) || null;
  }

  private canonical(value: any): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonical(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private async assertOpportunityAccess(
    opportunity: Opportunity,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    if (globalRole === GlobalRole.INSTALLATION_ADMIN || role === UnitRole.OWNER || role === UnitRole.ADMIN) return;
    if (role === UnitRole.SALES && opportunity.ownerUserId !== userId) {
      throw new NotFoundException('Oportunidade não encontrada.');
    }
    if (role === UnitRole.MANAGER) {
      const memberships = await this.teamMembers.find({
        where: { unitId: opportunity.unitId, userId },
      });
      if (!opportunity.teamId || !memberships.some((membership) => membership.teamId === opportunity.teamId)) {
        throw new NotFoundException('Oportunidade não encontrada.');
      }
    }
  }

  private async audit(
    unitId: string,
    actorUserId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    beforeData: Record<string, any> | null,
    afterData: Record<string, any> | null,
  ) {
    await this.auditLogs.save(this.auditLogs.create({
      unitId,
      actorUserId,
      action,
      resourceType,
      resourceId,
      beforeData,
      afterData,
      ipAddress: null,
      userAgent: null,
      metadata: {},
    }));
  }

  private render(snapshot: any) {
    const p = snapshot.negotiation?.pricing || {};
    return `CONTRATO DE ADESÃO\n\nContratante: ${snapshot.customer.name}\nCPF/CNPJ: ${snapshot.customer.taxId}\nValor: R$ ${Number(p.finalAmount || 0).toFixed(2)}\nPeriodicidade: ${snapshot.negotiation?.cycle || '-'}\nParticipantes adicionais: ${snapshot.participants.length}\n\nAo aceitar, o contratante declara ciência das condições comerciais apresentadas.`;
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
