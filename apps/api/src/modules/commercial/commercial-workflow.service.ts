import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import {
  AccessStatus, ApprovalRequest, ApprovalStatus, AuditLog, BillingCustomer, BillingCycle, BillingProviderName, BillingType, CheckoutSession,
  CheckoutStatus, CommercialOfferVersion, CommercialStatus, Contract, ContractAcceptance, ContractRelationType, ContractStatus,
  ContractTemplate, ContractTemplateStatus, ContractTemplateVersion, CustomerType, FinancialStatus, GlobalRole, LifecycleSource, MemberRole, Membership, NegotiationPolicy, Opportunity,
  OpportunityMember, OpportunityStatus, Person, PersonKind, PrecheckoutParticipant, PrecheckoutSession, Sale,
  PrecheckoutStatus, Subscription, SubscriptionMember, SubscriptionMemberStatus, SubscriptionStatus, Team, TeamMember, UnitRole,
} from '../../database/entities';
import { isValidCnpj, isValidCpf, isValidTaxId, normalizeTaxId } from '../../common/utils/tax-id';
import { PricingService } from './pricing.service';
import { evaluateNegotiationPolicies } from './policy-evaluator';
import { CommercialFeatureService } from './commercial-feature.service';
import { AsaasApiException, AsaasClient } from '../billing/asaas.client';
import { BillingService } from '../billing/billing.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import {
  AcceptContractDto, CreateContractRevisionDto, CreatePolicyDto, DecideApprovalDto, PrecheckoutParticipantDto,
  RequestApprovalDto, SaveContractRevisionDraftDto, StartAsaasCheckoutDto, UpdatePrecheckoutCustomerDto,
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
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(CommercialOfferVersion) private readonly offerVersions: Repository<CommercialOfferVersion>,
    @InjectRepository(ContractTemplateVersion) private readonly templateVersions: Repository<ContractTemplateVersion>,
    @InjectRepository(ContractTemplate) private readonly templates: Repository<ContractTemplate>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(BillingCustomer) private readonly billingCustomers: Repository<BillingCustomer>,
    @InjectRepository(CheckoutSession) private readonly checkoutSessions: Repository<CheckoutSession>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(SubscriptionMember) private readonly subscriptionMembers: Repository<SubscriptionMember>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly pricing: PricingService,
    private readonly asaas: AsaasClient,
    private readonly billing: BillingService,
    private readonly lifecycle: LifecycleService,
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

    const selectedTargets = [dto.targetRole, dto.targetUserId, dto.targetTeamId].filter(Boolean);
    if (selectedTargets.length > 1) {
      throw new BadRequestException('Escolha apenas um escopo: perfil, time ou usuário específico.');
    }
    if (dto.targetTeamId && !await this.teams.exists({ where: { unitId, id: dto.targetTeamId, active: true } })) {
      throw new BadRequestException('O time selecionado não pertence à sede ou está inativo.');
    }
    if (dto.targetUserId) {
      const membership = await this.memberships.findOne({
        where: { unitId, userId: dto.targetUserId, active: true },
      });
      if (!membership) {
        throw new BadRequestException('O usuário selecionado não pertence à sede ou está inativo.');
      }
      if (![UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER, UnitRole.SALES].includes(membership.role)) {
        throw new BadRequestException('A política individual exige um usuário com perfil comercial.');
      }
    }

    const before = current ? this.policySnapshot(current) : null;
    const entity = current || this.policies.create({ unitId, archivedAt: null });
    const rules = { ...(dto.rules || {}) };
    const customerType = dto.customerType || null;
    if (customerType === CustomerType.PERSON) delete rules.maxLives;
    if (Array.isArray(rules.allowedBillingCycles)) {
      const cycles = [...new Set(rules.allowedBillingCycles)];
      if (!cycles.length) {
        throw new BadRequestException('Selecione ao menos uma periodicidade permitida.');
      }
      if (cycles.some((cycle) => ![BillingCycle.MONTHLY, BillingCycle.YEARLY].includes(cycle))) {
        throw new BadRequestException('A política aceita somente periodicidade mensal ou anual.');
      }
      if (customerType === CustomerType.COMPANY
        && (cycles.length !== 1 || cycles[0] !== BillingCycle.MONTHLY)) {
        throw new BadRequestException('Políticas de pessoa jurídica devem permitir somente cobrança mensal.');
      }
      rules.allowedBillingCycles = cycles;
    }
    Object.assign(entity, {
      name: dto.name,
      customerType,
      targetRole: dto.targetRole || null,
      targetUserId: dto.targetUserId || null,
      targetTeamId: dto.targetTeamId || null,
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
      targetTeamId: policy.targetTeamId,
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
    teamId?: string | null,
  ) {
    const policies = await this.policies.find({ where: { unitId, active: true } });
    return evaluateNegotiationPolicies(policies, userId, role, teamId || null, {
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
    const subject = await this.policySubject(opportunity, userId, role);
    const evaluation = await this.evaluate(
      unitId,
      subject.userId,
      subject.role,
      opportunity.negotiationSnapshot,
      opportunity.customerType,
      opportunity.teamId,
    );
    let approval = await this.currentApproval(unitId, opportunityId, opportunity.negotiationSnapshot);

    if (evaluation.allowed && approval?.status === ApprovalStatus.PENDING) {
      await this.approvals.update(
        { id: approval.id, unitId },
        { status: ApprovalStatus.CANCELLED },
      );
      approval = { ...approval, status: ApprovalStatus.CANCELLED };

      if (opportunity.commercialStatus === CommercialStatus.PENDING_APPROVAL) {
        opportunity.commercialStatus = CommercialStatus.NEGOTIATION;
        await this.opportunities.save(opportunity);
      }
    }

    const approvedException = approval?.status === ApprovalStatus.APPROVED;
    return {
      ...evaluation,
      policyAllowed: evaluation.allowed,
      allowed: evaluation.allowed || approvedException,
      approvalRequired: !evaluation.allowed && !approvedException,
      approval,
    };
  }

  async requestApproval(unitId: string, opportunityId: string, userId: string, role: UnitRole | null, dto: RequestApprovalDto) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, GlobalRole.STANDARD);
    const subject = await this.policySubject(opportunity, userId, role);
    const evaluation = await this.evaluate(
      unitId,
      subject.userId,
      subject.role,
      opportunity.negotiationSnapshot,
      opportunity.customerType,
      opportunity.teamId,
    );
    if (evaluation.allowed) {
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
    const revisionContext = approval.requestedConditions?.revisionContext || null;
    if (dto.decision === 'APPROVED') {
      if (revisionContext?.parentContractId) {
        const parent = await this.contracts.findOne({
          where: { unitId, id: revisionContext.parentContractId },
        });
        if (!parent || parent.status !== ContractStatus.ACCEPTED || parent.contentHash !== revisionContext.parentContentHash) {
          throw new ConflictException('O contrato de origem mudou após a solicitação. Gere uma nova aprovação para a alteração contratual.');
        }
      } else if (this.canonical(this.approvalTerms(opportunity.negotiationSnapshot || {})) !== this.canonical(this.approvalTerms(approval.requestedConditions || {}))) {
        throw new ConflictException('As condições da negociação mudaram após a solicitação. Gere uma nova aprovação.');
      }
    }
    approval.status = dto.decision === 'APPROVED' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    approval.decidedBy = userId; approval.decisionNotes = dto.notes || null; approval.decidedAt = new Date();
    if (!revisionContext) {
      opportunity.commercialStatus = approval.status === ApprovalStatus.APPROVED ? CommercialStatus.APPROVED : CommercialStatus.NEGOTIATION;
      await this.opportunities.save(opportunity);
    }
    const saved = await this.approvals.save(approval);
    await this.audit(unitId, userId, revisionContext ? 'contract_revision.approval_decided' : 'negotiation.approval_decided', 'approval_request', approval.id, null, {
      opportunityId: approval.opportunityId,
      parentContractId: revisionContext?.parentContractId || null,
      decision: approval.status,
      notes: approval.decisionNotes,
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

  async getContractRevisionDraft(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const context = await this.revisionDraftContext(unitId, opportunityId, userId, role, globalRole);
    const pendingPrecheckout = await this.revisionPendingPrecheckout(unitId, opportunityId);
    if (!context.draft) {
      return {
        currentContract: context.parent,
        draft: null,
        policyEvaluation: null,
        pendingPrecheckout: this.pendingPrecheckoutSummary(pendingPrecheckout),
      };
    }
    const subject = await this.policySubject(context.opportunity, userId, role);
    const evaluation = await this.evaluate(
      unitId, subject.userId, subject.role, context.draft.snapshot?.negotiation || {},
      context.opportunity.customerType, context.opportunity.teamId,
    );
    const approval = await this.currentRevisionApproval(
      unitId, opportunityId, context.draft.snapshot?.negotiation || {}, context.parent.id,
      context.parent.contentHash, context.draft.relationType,
    );
    return {
      currentContract: context.parent,
      draft: context.draft,
      policyEvaluation: { ...evaluation, approval, approvalRequired: !evaluation.allowed },
      pendingPrecheckout: this.pendingPrecheckoutSummary(pendingPrecheckout),
    };
  }

  async reissueContractRevisionPrecheckout(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    await this.assertRevisionOpportunityAccess(unitId, opportunityId, userId, role, globalRole);
    const pending = await this.revisionPendingPrecheckout(unitId, opportunityId);
    if (!pending) throw new NotFoundException('Não existe uma alteração contratual pendente para reemitir o link.');

    const token = randomBytes(32).toString('hex');
    pending.session.tokenHash = this.hash(token);
    if (pending.session.expiresAt <= new Date()) {
      pending.session.expiresAt = new Date(Date.now() + 7 * 86400000);
    }
    await this.sessions.save(pending.session);
    await this.audit(unitId, userId, 'contract_revision.precheckout_reissued', 'precheckout_session', pending.session.id, null, {
      opportunityId,
      contractId: pending.contract.id,
      previousStatus: pending.session.status,
    });
    return {
      precheckout: {
        id: pending.session.id,
        status: pending.session.status,
        expiresAt: pending.session.expiresAt,
        url: `/checkout/${token}`,
      },
      checkout: pending.checkout ? {
        id: pending.checkout.id,
        status: pending.checkout.status,
        url: pending.checkout.url,
        expiresAt: pending.checkout.expiresAt,
      } : null,
    };
  }

  async revokeContractRevisionPrecheckout(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    await this.assertRevisionOpportunityAccess(unitId, opportunityId, userId, role, globalRole);
    const pending = await this.revisionPendingPrecheckout(unitId, opportunityId);
    if (!pending) throw new NotFoundException('Não existe uma alteração contratual pendente para anular.');
    if (pending.checkout?.status === CheckoutStatus.PAID) {
      throw new ConflictException('O pagamento desta alteração já foi confirmado e ela não pode ser anulada por esta tela.');
    }

    await this.cancelPendingAsaasResource(unitId, pending.checkout);
    if (pending.checkout) {
      pending.checkout.status = CheckoutStatus.CANCELLED;
      await this.checkoutSessions.save(pending.checkout);
    }
    pending.session.status = PrecheckoutStatus.REVOKED;
    pending.session.revokedAt = new Date();
    await this.sessions.save(pending.session);
    pending.contract.status = ContractStatus.VOID;
    await this.contracts.save(pending.contract);
    await this.audit(unitId, userId, 'contract_revision.precheckout_revoked', 'precheckout_session', pending.session.id, null, {
      opportunityId,
      contractId: pending.contract.id,
      checkoutSessionId: pending.checkout?.id || null,
      checkoutExternalId: pending.checkout?.externalId || null,
    });
    return { revoked: true, contractId: pending.contract.id, precheckoutSessionId: pending.session.id };
  }

  async saveContractRevisionDraft(
    unitId: string,
    opportunityId: string,
    dto: SaveContractRevisionDraftDto,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    await this.feature.assertEnabled(unitId);
    const context = await this.revisionDraftContext(unitId, opportunityId, userId, role, globalRole);
    if (context.opportunity.status !== OpportunityStatus.WON) {
      throw new BadRequestException('Rascunhos pós-venda só podem ser criados para oportunidades já convertidas.');
    }
    const pendingRevision = context.children.find((item) => item.status === ContractStatus.READY);
    if (pendingRevision) throw new ConflictException('Já existe uma alteração contratual aguardando aceite.');

    const relationType = dto.relationType || context.draft?.relationType || ContractRelationType.AMENDMENT;
    const proposal = await this.calculateRevisionDraftProposal(
      context.parent, context.opportunity, { ...dto, relationType }, userId, role,
    );
    const templateVersionId = dto.contractTemplateVersionId
      || context.draft?.templateVersionId
      || context.parent.templateVersionId;
    if (templateVersionId && !await this.templateVersions.findOne({ where: { unitId, id: templateVersionId } })) {
      throw new BadRequestException('A versão de modelo contratual selecionada não foi encontrada.');
    }
    const revisionData = {
      relationType,
      reason: dto.reason?.trim() || context.draft?.changeReason || '',
      changes: dto.changes || {},
      effectiveAt: proposal.effectiveAt,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      parentContractId: context.parent.id,
      parentContentHash: context.parent.contentHash,
    };
    const snapshot = {
      ...context.parent.snapshot,
      negotiation: { ...proposal.negotiation, contractTemplateVersionId: templateVersionId || null },
      revision: revisionData,
    };
    const content = this.renderRevision(context.parent, revisionData, snapshot.negotiation);
    const draft = context.draft || this.contracts.create({
      unitId,
      opportunityId,
      parentContractId: context.parent.id,
      relationType,
      changeReason: revisionData.reason || null,
      requiresPayment: proposal.requiresPayment,
      version: 0,
      status: ContractStatus.DRAFT,
      templateCode: context.parent.templateCode,
      templateVersionId: templateVersionId || null,
      snapshot,
      renderedContent: content,
      contentHash: this.hash(content),
      acceptedAt: null,
    });
    if (context.draft) {
      Object.assign(draft, {
        relationType,
        changeReason: revisionData.reason || null,
        requiresPayment: proposal.requiresPayment,
        templateCode: context.parent.templateCode,
        templateVersionId: templateVersionId || null,
        snapshot,
        renderedContent: content,
        contentHash: this.hash(content),
        acceptedAt: null,
      });
    }
    const savedDraft = await this.contracts.save(draft);
    const approval = await this.currentRevisionApproval(
      unitId, opportunityId, snapshot.negotiation, context.parent.id, context.parent.contentHash, relationType,
    );
    await this.audit(unitId, userId, 'contract_revision.draft_saved', 'contract', savedDraft.id, null, {
      opportunityId,
      parentContractId: context.parent.id,
      relationType,
      requiresPayment: proposal.requiresPayment,
    });
    return {
      currentContract: context.parent,
      draft: savedDraft,
      policyEvaluation: { ...proposal.policyEvaluation, approval, approvalRequired: !proposal.policyEvaluation.allowed },
    };
  }

  async createContractRevisionFromDraft(
    unitId: string,
    contractId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    await this.feature.assertEnabled(unitId);
    const parent = await this.contracts.findOne({ where: { unitId, id: contractId } });
    if (!parent || parent.status !== ContractStatus.ACCEPTED) {
      throw new BadRequestException('O contrato vigente não está disponível para gerar uma alteração.');
    }
    const previousPending = await this.revisionPendingPrecheckout(unitId, parent.opportunityId);
    if (previousPending) {
      throw new ConflictException('Existe uma contratação aguardando pagamento. Reenvie ou anule o link pendente antes de criar outra alteração.');
    }
    const context = await this.revisionDraftContext(unitId, parent.opportunityId, userId, role, globalRole);
    if (context.parent.id !== parent.id || !context.draft) {
      throw new NotFoundException('Nenhum rascunho de alteração contratual foi encontrado para este contrato vigente.');
    }
    const draft = context.draft;
    const reason = String(draft.snapshot?.revision?.reason || draft.changeReason || '').trim();
    if (reason.length < 5) throw new BadRequestException('Informe um motivo com pelo menos 5 caracteres antes de gerar o aditivo.');
    if (context.children.some((item) => item.id !== draft.id && item.status === ContractStatus.READY)) {
      throw new ConflictException('Já existe uma alteração contratual aguardando aceite.');
    }

    const negotiation = draft.snapshot?.negotiation || {};
    const subject = await this.policySubject(context.opportunity, userId, role);
    const policyEvaluation = await this.evaluate(
      unitId, subject.userId, subject.role, negotiation, context.opportunity.customerType, context.opportunity.teamId,
    );
    if (!policyEvaluation.allowed) {
      const approval = await this.currentRevisionApproval(
        unitId, context.opportunity.id, negotiation, parent.id, parent.contentHash, draft.relationType,
      );
      if (approval?.status !== ApprovalStatus.APPROVED) {
        throw new BadRequestException({
          message: 'O rascunho de alteração contratual exige aprovação antes da emissão do aditivo.',
          approvalRequired: true,
          approvalRequestId: approval?.id || null,
          approvalStatus: approval?.status || null,
          violations: policyEvaluation.violations,
        });
      }
    }

    const revisionData = {
      ...(draft.snapshot?.revision || {}),
      relationType: draft.relationType,
      reason,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      parentContractId: parent.id,
      parentContentHash: parent.contentHash,
    };
    const snapshot = { ...draft.snapshot, revision: revisionData, negotiation };
    const content = this.renderRevision(parent, revisionData, negotiation);
    const allContracts = await this.contracts.find({ where: { unitId, opportunityId: parent.opportunityId } });
    const nextVersion = Math.max(
      parent.version,
      ...allContracts.filter((item) => item.id !== draft.id).map((item) => item.version || 0),
    ) + 1;
    Object.assign(draft, {
      relationType: draft.relationType,
      changeReason: reason,
      requiresPayment: draft.requiresPayment,
      version: nextVersion,
      status: ContractStatus.READY,
      templateCode: parent.templateCode,
      snapshot,
      renderedContent: content,
      contentHash: this.hash(content),
      acceptedAt: null,
    });
    const revision = await this.contracts.save(draft);

    const token = randomBytes(32).toString('hex');
    const session = await this.sessions.save(this.sessions.create({
      unitId,
      opportunityId: parent.opportunityId,
      contractId: revision.id,
      checkoutSessionId: null,
      tokenHash: this.hash(token),
      status: PrecheckoutStatus.CONTRACT_READY,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      revokedAt: null,
      customerData: parent.snapshot?.customer || {},
      pricingSnapshot: negotiation,
    }));
    for (const participant of Array.isArray(parent.snapshot?.participants) ? parent.snapshot.participants : []) {
      if (!participant?.name || !participant?.taxId) continue;
      await this.participants.save(this.participants.create({
        unitId, precheckoutSessionId: session.id, role: participant.role || MemberRole.DEPENDENT,
        name: participant.name, taxId: normalizeTaxId(participant.taxId), birthDate: participant.birthDate || null,
        relationship: participant.relationship || null,
      }));
    }
    await this.audit(unitId, userId, 'contract.revision_created', 'contract', revision.id, null, {
      opportunityId: parent.opportunityId, parentContractId: parent.id, relationType: revision.relationType,
      requiresPayment: revision.requiresPayment, contentHash: revision.contentHash, source: 'POST_SALE_DRAFT',
    });
    return {
      contract: revision,
      precheckout: { id: session.id, token, expiresAt: session.expiresAt, url: `/checkout/${token}` },
      policyEvaluation,
    };
  }

  async requestContractRevisionDraftApproval(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const context = await this.revisionDraftContext(unitId, opportunityId, userId, role, globalRole);
    if (!context.draft) throw new NotFoundException('Salve um rascunho de alteração contratual antes de solicitar aprovação.');
    const subject = await this.policySubject(context.opportunity, userId, role);
    const negotiation = context.draft.snapshot?.negotiation || {};
    const policyEvaluation = await this.evaluate(
      unitId, subject.userId, subject.role, negotiation, context.opportunity.customerType, context.opportunity.teamId,
    );
    if (policyEvaluation.allowed) throw new BadRequestException('O rascunho está dentro da política comercial e não exige aprovação.');
    const current = await this.currentRevisionApproval(
      unitId, opportunityId, negotiation, context.parent.id, context.parent.contentHash, context.draft.relationType,
    );
    if (current?.status === ApprovalStatus.APPROVED || current?.status === ApprovalStatus.PENDING) return current;
    const approval = await this.approvals.save(this.approvals.create({
      unitId,
      opportunityId,
      requestedBy: userId,
      decidedBy: null,
      status: ApprovalStatus.PENDING,
      reason: `Alteração contratual: ${context.draft.changeReason || 'Rascunho pós-venda'}`,
      requestedConditions: {
        ...negotiation,
        revisionContext: {
          parentContractId: context.parent.id,
          parentContentHash: context.parent.contentHash,
          relationType: context.draft.relationType,
        },
      },
      policyEvaluation,
      decisionNotes: null,
      decidedAt: null,
    }));
    await this.audit(unitId, userId, 'contract_revision.approval_requested', 'approval_request', approval.id, null, {
      opportunityId,
      parentContractId: context.parent.id,
      relationType: context.draft.relationType,
      violations: policyEvaluation.violations,
      source: 'POST_SALE_DRAFT',
    });
    return approval;
  }

  private async revisionPendingPrecheckout(unitId: string, opportunityId: string) {
    const [sessions, contracts] = await Promise.all([
      this.sessions.find({ where: { unitId, opportunityId } }),
      this.contracts.find({ where: { unitId, opportunityId } }),
    ]);
    const revisionsById = new Map(
      contracts.filter((contract) => Boolean(contract.parentContractId)).map((contract) => [contract.id, contract]),
    );
    const session = sessions
      .filter((item) => item.contractId && revisionsById.has(item.contractId)
        && [PrecheckoutStatus.CONTRACT_READY, PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING].includes(item.status))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (!session || !session.contractId) return null;
    const checkout = session.checkoutSessionId
      ? await this.checkoutSessions.findOne({ where: { unitId, id: session.checkoutSessionId } })
      : null;
    return { session, contract: revisionsById.get(session.contractId)!, checkout };
  }

  private async assertRevisionOpportunityAccess(
    unitId: string,
    opportunityId: string,
    userId: string,
    role: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, globalRole);
    if (opportunity.status !== OpportunityStatus.WON) {
      throw new BadRequestException('Ações de alteração contratual só estão disponíveis para oportunidades já convertidas.');
    }
    return opportunity;
  }

  private pendingPrecheckoutSummary(pending: Awaited<ReturnType<CommercialWorkflowService['revisionPendingPrecheckout']>>) {
    if (!pending) return null;
    return {
      id: pending.session.id,
      status: pending.session.status,
      contractId: pending.contract.id,
      relationType: pending.contract.relationType,
      expiresAt: pending.session.expiresAt,
      checkout: pending.checkout ? {
        id: pending.checkout.id,
        status: pending.checkout.status,
        url: pending.checkout.url,
        expiresAt: pending.checkout.expiresAt,
      } : null,
    };
  }

  private async cancelPendingAsaasResource(unitId: string, checkout: CheckoutSession | null) {
    if (!checkout?.externalId) return;
    try {
      if (checkout.payload?.providerResourceType === 'CHECKOUT') {
        await this.asaas.cancelCheckout(unitId, checkout.externalId);
      } else if (checkout.payload?.providerResourceType === 'SUBSCRIPTION') {
        const paymentId = checkout.payload?.paymentId;
        if (paymentId) await this.asaas.deletePayment(unitId, paymentId);
        await this.asaas.deleteSubscription(unitId, checkout.externalId);
      }
    } catch (error) {
      if (!(error instanceof AsaasApiException) || error.providerStatus !== 404) throw error;
    }
  }

  private async revisionDraftContext(
    unitId: string, opportunityId: string, userId: string, role: UnitRole | null, globalRole: GlobalRole,
  ) {
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    await this.assertOpportunityAccess(opportunity, userId, role, globalRole);
    const all = await this.contracts.find({ where: { unitId, opportunityId } });
    const parent = all.filter((item) => item.status === ContractStatus.ACCEPTED)
      .sort((left, right) => (right.version || 0) - (left.version || 0))[0];
    if (!parent) throw new NotFoundException('Contrato vigente não encontrado.');
    const children = all.filter((item) => item.parentContractId === parent.id);
    return { opportunity, parent, children, draft: children.find((item) => item.status === ContractStatus.DRAFT) || null };
  }

  private async calculateRevisionDraftProposal(
    parent: Contract,
    opportunity: Opportunity,
    dto: SaveContractRevisionDraftDto & { relationType: ContractRelationType },
    userId: string,
    role: UnitRole | null,
  ) {
    const currentNegotiation = parent.snapshot?.negotiation || opportunity.negotiationSnapshot || {};
    const changes = dto.changes || {};
    const currentPricing = currentNegotiation.pricing || {};
    const currentParticipants = currentNegotiation.participants || {};
    if (opportunity.customerType === CustomerType.PERSON
      && (currentNegotiation.cycle || opportunity.billingCycle) === BillingCycle.YEARLY
      && changes.dependentCount != null
      && Number(changes.dependentCount) > Number(currentParticipants.dependentCount || 0)
      && dto.relationType !== ContractRelationType.RENEWAL) {
      throw new BadRequestException('Em plano PF anual, novos dependentes somente podem ser incluídos por renovação contratual.');
    }
    if (opportunity.customerType === CustomerType.COMPANY && changes.lives != null) {
      const subscription = await this.subscriptions.findOne({ where: { unitId: opportunity.unitId, sourceOpportunityId: opportunity.id } });
      if (subscription) {
        const registered = await this.subscriptionMembers.count({
          where: { unitId: opportunity.unitId, subscriptionId: subscription.id, role: MemberRole.DEPENDENT, status: SubscriptionMemberStatus.ACTIVE },
        });
        if (Number(changes.lives) < registered) {
          throw new BadRequestException(`A quantidade contratada não pode ser menor que os ${registered} beneficiários atualmente cadastrados.`);
        }
      }
    }
    const cycle = changes.cycle || currentNegotiation.cycle || opportunity.billingCycle;
    if (!cycle) throw new BadRequestException('Periodicidade contratual não definida.');
    const allowedBillingTypes = changes.allowedBillingTypes?.length
      ? changes.allowedBillingTypes
      : currentNegotiation.allowedBillingTypes?.length ? currentNegotiation.allowedBillingTypes
        : opportunity.billingType ? [opportunity.billingType] : [BillingType.CREDIT_CARD];
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
      dependentAmount: opportunity.customerType === CustomerType.PERSON ? Number(changes.dependentAmount ?? currentPricing.dependentAmount ?? 0) : undefined,
      dependentCount: opportunity.customerType === CustomerType.PERSON ? Number(changes.dependentCount ?? currentParticipants.dependentCount ?? 0) : undefined,
      unitPrice: opportunity.customerType === CustomerType.COMPANY ? Number(changes.unitPrice ?? currentPricing.unitPrice ?? 0) : undefined,
      lives: opportunity.customerType === CustomerType.COMPANY ? Number(changes.lives ?? currentParticipants.contractedLives ?? 1) : undefined,
      annualDiscountPercent: Number(changes.annualDiscountPercent ?? currentPricing.annualDiscountPercent ?? 0),
      discounts: changes.discounts ?? currentNegotiation.discounts ?? [],
    });
    const negotiation = {
      ...calculation,
      allowedBillingTypes,
      revisionEffectiveAt: changes.effectiveAt || new Date().toISOString().slice(0, 10),
    };
    const subject = await this.policySubject(opportunity, userId, role);
    const policyEvaluation = await this.evaluate(
      opportunity.unitId, subject.userId, subject.role, negotiation, opportunity.customerType, opportunity.teamId,
    );
    return {
      negotiation,
      effectiveAt: negotiation.revisionEffectiveAt,
      requiresPayment: cycle !== (currentNegotiation.cycle || opportunity.billingCycle)
        || dto.requiresPayment === true
        || [ContractRelationType.RENEWAL, ContractRelationType.REPLACEMENT].includes(dto.relationType),
      policyEvaluation,
    };
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
    if (
      opportunity.customerType === CustomerType.PERSON
      && (currentNegotiation.cycle || opportunity.billingCycle) === 'YEARLY'
      && changes.dependentCount != null
      && Number(changes.dependentCount) > Number(currentParticipants.dependentCount || 0)
      && dto.relationType !== ContractRelationType.RENEWAL
    ) {
      throw new BadRequestException(
        'Em plano PF anual, novos dependentes somente podem ser incluídos por renovação contratual. O sistema não aplica pró-rata automático no meio da vigência.',
      );
    }
    if (opportunity.customerType === CustomerType.COMPANY && changes.lives != null) {
      const currentSubscription = await this.subscriptions.findOne({
        where: { unitId, sourceOpportunityId: opportunity.id },
      });
      if (currentSubscription) {
        const registeredBeneficiaries = await this.subscriptionMembers.count({
          where: {
            unitId,
            subscriptionId: currentSubscription.id,
            role: MemberRole.DEPENDENT,
            status: SubscriptionMemberStatus.ACTIVE,
          },
        });
        if (Number(changes.lives) < registeredBeneficiaries) {
          throw new BadRequestException(
            `A quantidade contratada não pode ser menor que os ${registeredBeneficiaries} beneficiários atualmente cadastrados.`,
          );
        }
      }
    }
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
      annualDiscountPercent: Number(changes.annualDiscountPercent ?? currentPricing.annualDiscountPercent ?? 0),
      discounts: changes.discounts ?? currentNegotiation.discounts ?? [],
    });
    const negotiation = {
      ...calculation,
      allowedBillingTypes,
      revisionEffectiveAt: changes.effectiveAt || new Date().toISOString().slice(0, 10),
    };
    const subject = await this.policySubject(opportunity, userId, role);
    const policyEvaluation = await this.evaluate(
      unitId,
      subject.userId,
      subject.role,
      negotiation,
      opportunity.customerType,
      opportunity.teamId,
    );
    if (!policyEvaluation.allowed) {
      const currentRevisionApproval = await this.currentRevisionApproval(
        unitId, opportunity.id, negotiation, parent.id, parent.contentHash, dto.relationType,
      );
      if (currentRevisionApproval?.status === ApprovalStatus.REJECTED) {
        throw new BadRequestException({
          message: 'A condição desta alteração contratual foi rejeitada. Ajuste as condições antes de tentar novamente.',
          approvalRequired: true,
          approvalRequestId: currentRevisionApproval.id,
          approvalStatus: currentRevisionApproval.status,
          violations: policyEvaluation.violations,
        });
      }
      if (currentRevisionApproval?.status !== ApprovalStatus.APPROVED) {
        const approval = currentRevisionApproval?.status === ApprovalStatus.PENDING
          ? currentRevisionApproval
          : await this.approvals.save(this.approvals.create({
            unitId,
            opportunityId: opportunity.id,
            requestedBy: userId,
            decidedBy: null,
            status: ApprovalStatus.PENDING,
            reason: `Alteração contratual: ${dto.reason.trim()}`,
            requestedConditions: {
              ...negotiation,
              revisionContext: {
                parentContractId: parent.id,
                parentContentHash: parent.contentHash,
                relationType: dto.relationType,
              },
            },
            policyEvaluation,
            decisionNotes: null,
            decidedAt: null,
          }));
        if (!currentRevisionApproval) {
          await this.audit(unitId, userId, 'contract_revision.approval_requested', 'approval_request', approval.id, null, {
            opportunityId: opportunity.id,
            parentContractId: parent.id,
            relationType: dto.relationType,
            violations: policyEvaluation.violations,
          });
        }
        throw new BadRequestException({
          message: 'A alteração contratual foge da política comercial e precisa ser aprovada antes da emissão do novo contrato.',
          approvalRequired: true,
          approvalRequestId: approval.id,
          approvalStatus: approval.status,
          violations: policyEvaluation.violations,
        });
      }
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
    const changesBillingCycle = cycle !== (currentNegotiation.cycle || opportunity.billingCycle);
    const requiresPayment = changesBillingCycle
      || dto.requiresPayment
      || [ContractRelationType.RENEWAL, ContractRelationType.REPLACEMENT].includes(dto.relationType);
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

  async createPrecheckout(
    unitId: string,
    opportunityId: string,
    expiresInDays = 7,
    userId?: string,
    role?: UnitRole | null,
    globalRole?: GlobalRole,
  ) {
    await this.feature.assertEnabled(unitId);
    const opportunity = await this.opportunities.findOne({ where: { unitId, id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada.');
    if (userId) {
      await this.assertOpportunityAccess(
        opportunity,
        userId,
        role || null,
        globalRole || GlobalRole.STANDARD,
      );
    }
    const existingSubscription = await this.subscriptions.findOne({
      where: { unitId, sourceOpportunityId: opportunityId },
    });
    if (opportunity.commercialStatus === CommercialStatus.CONVERTED
      || (existingSubscription && existingSubscription.status !== SubscriptionStatus.PENDING_PAYMENT)) {
      throw new ConflictException(
        'Esta oportunidade já foi convertida em assinatura. Use o histórico contratual para criar um aditivo, renovação ou substituição; não gere uma contratação inicial novamente.',
      );
    }
    if (!await this.resolveTemplate(opportunity)) {
      throw new BadRequestException('Selecione um modelo contratual publicado antes de gerar o pré-checkout.');
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
    const pricingSnapshot = opportunity.negotiationSnapshot || {};
    const negotiatedDependentCount = opportunity.customerType === CustomerType.PERSON
      ? Math.max(0, Number(pricingSnapshot?.participants?.dependentCount ?? 0) || 0)
      : 0;

    // A negociação é a fonte de verdade para quantidade e preço.
    // Dependentes já vinculados à oportunidade servem apenas como pré-preenchimento de cadastro.
    const opportunityDependents = opportunity.customerType === CustomerType.PERSON
      ? await this.opportunityMembers.find({
          where: { unitId, opportunityId, role: MemberRole.DEPENDENT },
          order: { createdAt: 'ASC' },
        })
      : [];
    const prefilledOpportunityDependents = opportunityDependents.slice(0, negotiatedDependentCount);
    const dependentPeople = prefilledOpportunityDependents.length
      ? await this.people.find({
          where: { unitId, id: In(prefilledOpportunityDependents.map((member) => member.personId)) },
        })
      : [];

    // A política é avaliada sobre os valores finais e a quantidade real de participantes.
    if (userId) {
      const subject = await this.policySubject(opportunity, userId, role || null);
      const evaluation = await this.evaluate(
        unitId,
        subject.userId,
        subject.role,
        pricingSnapshot,
        opportunity.customerType,
        opportunity.teamId,
      );
      const approval = await this.currentApproval(unitId, opportunityId, pricingSnapshot);
      const hasApprovedException = approval?.status === ApprovalStatus.APPROVED;
      if (!evaluation.allowed && !hasApprovedException) {
        throw new BadRequestException('A negociação possui condições sem aprovação válida.');
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

    for (const member of prefilledOpportunityDependents) {
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
      prefilledDependents: prefilledOpportunityDependents.length,
      finalAmount: pricingSnapshot?.pricing?.finalAmount ?? opportunity.expectedValue,
      contractTemplateVersionId: opportunity.contractTemplateVersionId,
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
    const opportunity = await this.opportunities.findOneByOrFail({
      id: session.opportunityId,
      unitId: session.unitId,
    });
    const person = await this.people.findOneByOrFail({
      id: opportunity.primaryPersonId,
      unitId: session.unitId,
    });
    const participants = await this.participants.find({
      where: { precheckoutSessionId: session.id, unitId: session.unitId },
    });
    const contract = session.contractId
      ? await this.contracts.findOne({ where: { id: session.contractId, unitId: session.unitId } })
      : null;
    const selectedTemplateVersionId = contract?.templateVersionId
      || opportunity.contractTemplateVersionId
      || opportunity.negotiationSnapshot?.contractTemplateVersionId
      || null;
    const templateVersion = selectedTemplateVersionId
      ? await this.templateVersions.findOne({
          where: { id: selectedTemplateVersionId, unitId: session.unitId },
        })
      : null;
    const template = templateVersion
      ? await this.templates.findOne({
          where: { id: templateVersion.templateId, unitId: session.unitId },
        })
      : null;
    const contractTemplate = templateVersion && template ? {
      id: template.id,
      name: template.name,
      code: template.code,
      versionId: templateVersion.id,
      version: templateVersion.version,
    } : null;

    const effectivePricing = contract?.snapshot?.negotiation || session.pricingSnapshot;
    const checkout = session.checkoutSessionId
      ? await this.checkoutSessions.findOne({ where: { id: session.checkoutSessionId, unitId: session.unitId } })
      : null;
    const localSubscription = await this.subscriptions.findOne({
      where: { unitId: session.unitId, sourceOpportunityId: session.opportunityId },
    });
    // A assinatura vigente pertence ao contrato anterior. Ela nunca confirma o
    // pagamento de um novo aditivo: somente a sessão deste pré-checkout pode fazê-lo.
    const paymentConfirmed = session.status === PrecheckoutStatus.COMPLETED;

    return {
      status: session.status,
      payment: {
        checkoutStatus: checkout?.status || null,
        confirmed: paymentConfirmed,
        awaitingConfirmation: !paymentConfirmed && (
          session.status === PrecheckoutStatus.PAYMENT_PENDING
          || checkout?.status === CheckoutStatus.PAID
        ),
      },
      currentSubscription: localSubscription ? {
        status: localSubscription.status,
      } : null,
      expiresAt: session.expiresAt,
      customerType: opportunity.customerType,
      participantEditingAllowed: opportunity.customerType === CustomerType.PERSON
        && !contract,
      customer: {
        name: person.name,
        taxId: person.taxId,
        email: person.email,
        phone: person.phone,
        ...session.customerData,
      },
      pricing: effectivePricing,
      contractTemplate,
      allowedBillingTypes: effectivePricing?.allowedBillingTypes
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
        templateName: template?.name || null,
        templateCode: template?.code || contract.templateCode,
        templateVersion: templateVersion?.version || null,
        templateVersionId: contract.templateVersionId,
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

    const count = await this.participants.count({
      where: { precheckoutSessionId: session.id, unitId: session.unitId },
    });
    const publicOffer = session.pricingSnapshot?.source === 'PUBLIC_OFFER';
    const negotiatedCount = Math.max(
      0,
      Number(session.pricingSnapshot?.participants?.dependentCount ?? 0) || 0,
    );
    const max = publicOffer
      ? Number(session.pricingSnapshot?.limits?.maxDependents ?? 20)
      : negotiatedCount;

    if (count >= max) {
      throw new BadRequestException(
        publicOffer
          ? 'Limite de dependentes atingido.'
          : `A negociação prevê ${negotiatedCount} dependente(s), e todos já foram informados.`,
      );
    }

    const taxId = dto.taxId.replace(/\D/g,'');
    if (!isValidCpf(taxId)) throw new BadRequestException('CPF do dependente inválido.');
    await this.participants.save(this.participants.create({
      unitId: session.unitId,
      precheckoutSessionId: session.id,
      role: MemberRole.DEPENDENT,
      name: dto.name,
      taxId,
      birthDate: dto.birthDate || null,
      relationship: dto.relationship || null,
    }));

    if (publicOffer) await this.reprice(session);
    return this.publicGet(token);
  }

  async removeParticipant(token: string, participantId: string) {
    const session = await this.byToken(token);
    await this.ensureEditable(session);
    const opportunity = await this.opportunities.findOneByOrFail({
      id: session.opportunityId,
      unitId: session.unitId,
    });
    if (opportunity.customerType !== CustomerType.PERSON) {
      throw new BadRequestException('Beneficiários empresariais serão cadastrados após a contratação.');
    }

    await this.participants.delete({
      id: participantId,
      precheckoutSessionId: session.id,
      unitId: session.unitId,
    });
    if (session.pricingSnapshot?.source === 'PUBLIC_OFFER') await this.reprice(session);
    return this.publicGet(token);
  }

  private async reprice(session: PrecheckoutSession) {
    const count = await this.participants.count({ where: { precheckoutSessionId: session.id, unitId: session.unitId } });
    const current = session.pricingSnapshot;
    if (current?.customerType === CustomerType.PERSON) {
      const calculation = this.pricing.calculate({
        customerType: CustomerType.PERSON, cycle: current.cycle, billingType: current.billingType,
        baseAmount: Number(current.pricing?.holderAmount || current.pricing?.baseAmount || 0),
        dependentAmount: Number(current.pricing?.dependentAmount || 0),
        dependentCount: count,
        annualDiscountPercent: Number(current.pricing?.annualDiscountPercent || 0),
        discounts: current.discounts || [],
      });
      session.pricingSnapshot = {
        ...calculation,
        allowedBillingTypes: current.allowedBillingTypes,
        limits: current.limits,
        offer: current.offer,
        priceTable: current.priceTable,
        contractTemplateVersionId: current.contractTemplateVersionId,
        source: current.source,
        policyEvaluation: current.policyEvaluation,
      };
      await this.sessions.save(session);

      const opportunity = await this.opportunities.findOne({
        where: { id: session.opportunityId, unitId: session.unitId },
      });
      if (opportunity) {
        opportunity.negotiationSnapshot = session.pricingSnapshot;
        opportunity.expectedValue = Number(calculation.pricing.finalAmount).toFixed(2);
        opportunity.billingCycle = calculation.cycle;
        opportunity.billingType = calculation.billingType || opportunity.billingType;
        await this.opportunities.save(opportunity);
      }
    }
  }

  async prepareContract(token: string) {
    const session = await this.byToken(token);
    if ([PrecheckoutStatus.ACCEPTED, PrecheckoutStatus.PAYMENT_PENDING, PrecheckoutStatus.COMPLETED].includes(session.status)) {
      throw new ConflictException('O contrato já foi aceito e não pode ser regenerado.');
    }
    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    this.validateCustomerDataForCheckout(session.customerData, opportunity.customerType);
    if (opportunity.customerType === CustomerType.COMPANY) {
      const legalRepresentative = session.customerData?.legalRepresentative;
      const financialContact = session.customerData?.financialContact;
      if (!legalRepresentative?.name || !legalRepresentative?.taxId
        || !financialContact?.name || !financialContact?.email || !financialContact?.phone) {
        throw new BadRequestException('Informe e confirme os responsáveis legal e financeiro.');
      }
    }
    const participants = await this.participants.find({
      where: { precheckoutSessionId: session.id, unitId: session.unitId },
      order: { createdAt: 'ASC' },
    });
    if (opportunity.customerType === CustomerType.PERSON
      && session.pricingSnapshot?.source !== 'PUBLIC_OFFER') {
      const negotiatedDependentCount = Math.max(
        0,
        Number(session.pricingSnapshot?.participants?.dependentCount ?? 0) || 0,
      );
      if (participants.length !== negotiatedDependentCount) {
        throw new BadRequestException(
          `Informe os dados dos ${negotiatedDependentCount} dependente(s) previstos na negociação antes de gerar o contrato.`,
        );
      }
    }
    const snapshot: Record<string, any> = {
      customer: session.customerData,
      participants,
      negotiation: session.pricingSnapshot,
      opportunityId: session.opportunityId,
      generatedAt: new Date().toISOString(),
    };
    const template = await this.resolveTemplate(opportunity);
    if (!template) {
      throw new BadRequestException('Nenhum modelo contratual foi selecionado para esta contratação.');
    }
    const templateEntity = await this.templates.findOne({
      where: { id: template.templateId, unitId: session.unitId },
    });
    if (!templateEntity) {
      throw new BadRequestException('O modelo contratual selecionado não está disponível.');
    }
    snapshot.contractTemplate = {
      id: templateEntity.id,
      name: templateEntity.name,
      code: templateEntity.code,
      versionId: template.id,
      version: template.version,
    };
    const content = this.renderTemplate(template.content, snapshot);
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
      templateCode: templateEntity?.code || (template ? `TEMPLATE_VERSION_${template.id}` : 'DEFAULT'),
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
    if (contract.status === ContractStatus.ACCEPTED) {
      if (contract.parentContractId && !contract.requiresPayment) {
        await this.applyAcceptedRevision(contract, session);
        session.status = PrecheckoutStatus.COMPLETED;
        await this.sessions.save(session);
        return this.publicGet(token);
      }
      throw new ConflictException('Contrato já aceito.');
    }
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
      if (existing?.status === CheckoutStatus.PAID) {
        throw new ConflictException(
          'Este checkout já foi concluído no Asaas e aguarda confirmação financeira. Não realize um novo pagamento.',
        );
      }
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
            'A primeira cobrança ainda está sendo preparada pelo Asaas. Tente novamente em instantes.',
          );
        }
      }
    }

    const opportunity = await this.opportunities.findOneByOrFail({ id: session.opportunityId, unitId: session.unitId });
    const person = await this.people.findOneByOrFail({ id: opportunity.primaryPersonId, unitId: session.unitId });
    const acceptedNegotiation = contract.snapshot?.negotiation
      || session.pricingSnapshot
      || opportunity.negotiationSnapshot
      || {};
    const configured = acceptedNegotiation?.allowedBillingTypes
      || (opportunity.billingType ? [opportunity.billingType] : [BillingType.CREDIT_CARD]);
    const allowed = configured.map((value: string) => String(value).toUpperCase());
    if (!allowed.includes(dto.billingType)) throw new BadRequestException('Forma de pagamento não autorizada para esta contratação.');

    const customerData = { ...person, ...session.customerData };
    this.validateCustomerDataForCheckout(customerData, opportunity.customerType);
    const billingCustomer = await this.syncAsaasCustomer(session.unitId, person, customerData);

    const value = Number(acceptedNegotiation?.pricing?.finalAmount ?? opportunity.expectedValue ?? 0);
    if (!(value > 0)) throw new BadRequestException('Valor final inválido.');

    const appUrl = (process.env.APP_URL || 'http://localhost:4002').replace(/\/$/, '');
    const cycle = acceptedNegotiation?.cycle || opportunity.billingCycle || 'MONTHLY';
    const nextDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    if (dto.billingType === BillingType.BOLETO || dto.billingType === BillingType.PIX) {
      return this.startDirectSubscription({
        session,
        contract,
        opportunity,
        billingCustomer,
        billingType: dto.billingType,
        value,
        cycle,
        nextDueDate,
      });
    }

    const result = await this.asaas.createCheckout(session.unitId, {
      billingTypes: [dto.billingType],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 1440,
      externalReference: opportunity.id,
      customer: billingCustomer.externalId,
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
        contractedAmount: value,
        billingCycle: cycle,
      },
    }));
    session.checkoutSessionId = checkout.id;
    session.status = PrecheckoutStatus.PAYMENT_PENDING;
    opportunity.status = OpportunityStatus.CHECKOUT_PENDING;
    opportunity.commercialStatus = CommercialStatus.CHECKOUT_SENT;
    await this.sessions.save(session);
    await this.opportunities.save(opportunity);
    await this.ensurePendingSubscriber({
      session,
      contract,
      opportunity,
      billingCustomer,
      externalSubscriptionId: null,
      value,
      cycle,
      billingType: dto.billingType,
    });
    await this.audit(session.unitId, null, 'asaas.checkout_created', 'checkout_session', checkout.id, null, {
      opportunityId: opportunity.id,
      contractId: contract.id,
      externalId: checkout.externalId,
      billingType: dto.billingType,
      amount: value,
    });
    return { checkoutId: checkout.id, checkoutLink: checkout.url, expiresAt: checkout.expiresAt };
  }


  private validateCustomerDataForCheckout(customerData: Record<string, any>, customerType: CustomerType) {
    const requiredFields: Array<[string, string]> = [
      ['name', customerType === CustomerType.COMPANY ? 'Razão social/nome' : 'Nome'],
      ['taxId', customerType === CustomerType.COMPANY ? 'CNPJ' : 'CPF'],
      ['email', 'E-mail'],
      ['phone', 'Telefone'],
      ['postalCode', 'CEP'],
      ['address', 'Endereço'],
      ['addressNumber', 'Número'],
      ['district', 'Bairro'],
      ['city', 'Cidade'],
      ['state', 'UF'],
    ];
    const missing = requiredFields
      .filter(([key]) => !String(customerData?.[key] ?? '').trim())
      .map(([, label]) => label);
    if (missing.length) {
      throw new BadRequestException(
        `Complete os dados cadastrais antes de continuar: ${missing.join(', ')}.`,
      );
    }

    const postalCode = String(customerData.postalCode).replace(/\D/g, '');
    if (postalCode.length !== 8) throw new BadRequestException('Informe um CEP válido com 8 dígitos.');
    const state = String(customerData.state).trim().toUpperCase();
    if (state.length !== 2) throw new BadRequestException('Informe a UF com 2 letras.');
  }

  private async syncAsaasCustomer(unitId: string, person: Person, customerData: Record<string, any>) {
    const payload = {
      name: String(customerData.name).trim(),
      cpfCnpj: String(customerData.taxId).replace(/\D/g, ''),
      email: String(customerData.email).trim().toLowerCase(),
      phone: String(customerData.phone).replace(/\D/g, ''),
      mobilePhone: String(customerData.phone).replace(/\D/g, ''),
      postalCode: String(customerData.postalCode).replace(/\D/g, ''),
      address: String(customerData.address).trim(),
      addressNumber: String(customerData.addressNumber).trim(),
      complement: String(customerData.complement || '').trim() || undefined,
      province: String(customerData.district).trim(),
      externalReference: person.id,
    };

    let billingCustomer = await this.billingCustomers.findOne({
      where: { unitId, personId: person.id, provider: BillingProviderName.ASAAS },
    });
    if (billingCustomer) {
      await this.asaas.updateCustomer(unitId, billingCustomer.externalId, payload);
      billingCustomer.metadata = {
        ...(billingCustomer.metadata || {}),
        source: 'commercial_precheckout',
        lastSyncedAt: new Date().toISOString(),
      };
      return this.billingCustomers.save(billingCustomer);
    }

    const external = await this.asaas.createCustomer(unitId, payload);
    billingCustomer = await this.billingCustomers.save(this.billingCustomers.create({
      unitId,
      personId: person.id,
      provider: BillingProviderName.ASAAS,
      externalId: external.id,
      metadata: {
        source: 'commercial_precheckout',
        lastSyncedAt: new Date().toISOString(),
      },
    }));
    return billingCustomer;
  }

  private async startDirectSubscription(input: {
    session: PrecheckoutSession;
    contract: Contract;
    opportunity: Opportunity;
    billingCustomer: BillingCustomer;
    billingType: BillingType.BOLETO | BillingType.PIX;
    value: number;
    cycle: string;
    nextDueDate: string;
  }) {
    const {
      session,
      contract,
      opportunity,
      billingCustomer,
      billingType,
      value,
      cycle,
      nextDueDate,
    } = input;
    const subscription = await this.asaas.createSubscription(session.unitId, {
      customer: billingCustomer.externalId,
      billingType,
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
        billingType,
        providerResourceType: 'SUBSCRIPTION',
        contractedAmount: value,
        billingCycle: cycle,
      },
    }));

    session.checkoutSessionId = checkout.id;
    session.status = PrecheckoutStatus.PAYMENT_PENDING;
    opportunity.status = OpportunityStatus.CHECKOUT_PENDING;
    opportunity.commercialStatus = CommercialStatus.CHECKOUT_SENT;
    await this.sessions.save(session);
    await this.opportunities.save(opportunity);
    await this.ensurePendingSubscriber({
      session,
      contract,
      opportunity,
      billingCustomer,
      externalSubscriptionId: subscription.id,
      value,
      cycle,
      billingType,
    });

    try {
      const response = await this.asaas.subscriptionPayments(session.unitId, subscription.id, undefined, 10);
      const payment = Array.isArray(response?.data) ? response.data[0] : null;
      checkout.url = payment?.invoiceUrl || payment?.bankSlipUrl || null;
      checkout.payload = { ...checkout.payload, paymentId: payment?.id || null };
      await this.checkoutSessions.save(checkout);
    } catch (error) {
      await this.audit(session.unitId, null, 'asaas.subscription_payment_link_pending', 'checkout_session', checkout.id, null, {
        opportunityId: opportunity.id,
        externalSubscriptionId: subscription.id,
      });
      throw error;
    }

    if (!checkout.url) {
      throw new BadRequestException(
        'A assinatura foi criada no Asaas, mas o link da primeira cobrança ainda não está disponível. Tente novamente em instantes.',
      );
    }

    await this.audit(session.unitId, null, 'asaas.subscription_created', 'checkout_session', checkout.id, null, {
      opportunityId: opportunity.id,
      contractId: contract.id,
      externalSubscriptionId: subscription.id,
      billingType,
      amount: value,
    });
    return { checkoutId: checkout.id, checkoutLink: checkout.url, expiresAt: checkout.expiresAt };
  }


  private async ensurePendingSubscriber(input: {
    session: PrecheckoutSession;
    contract: Contract;
    opportunity: Opportunity;
    billingCustomer: BillingCustomer;
    externalSubscriptionId: string | null;
    value: number;
    cycle: string;
    billingType: BillingType;
  }) {
    const { session, contract, opportunity, billingCustomer, externalSubscriptionId, value, cycle, billingType } = input;
    if (contract.relationType !== ContractRelationType.ORIGINAL) return null;

    const billingConnection = await this.billing.connectionEntity(session.unitId);
    let subscription = await this.subscriptions.findOne({
      where: { unitId: session.unitId, sourceOpportunityId: opportunity.id },
    });
    const wasCreated = !subscription;
    if (!subscription) {
      subscription = this.subscriptions.create({
        unitId: session.unitId,
        primaryPersonId: opportunity.primaryPersonId,
        planPriceId: opportunity.planPriceId,
        sourceOpportunityId: opportunity.id,
        billingConnectionId: billingConnection?.id || null,
        externalSubscriptionId,
        status: SubscriptionStatus.PENDING_PAYMENT,
        financialStatus: FinancialStatus.UNKNOWN,
        accessStatus: AccessStatus.DISABLED,
        startedAt: null,
        firstActiveAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancellationScheduledAt: null,
        cancelledAt: null,
        lastReactivatedAt: null,
        cancellationReasonCode: null,
        cancellationReasonText: null,
        metadata: {},
      });
    } else if (subscription.status === SubscriptionStatus.DRAFT) {
      subscription.status = SubscriptionStatus.PENDING_PAYMENT;
      subscription.financialStatus = FinancialStatus.UNKNOWN;
      subscription.accessStatus = AccessStatus.DISABLED;
    }

    if (externalSubscriptionId) subscription.externalSubscriptionId = externalSubscriptionId;
    subscription.billingConnectionId = subscription.billingConnectionId || billingConnection?.id || null;
    subscription.metadata = {
      ...(subscription.metadata || {}),
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contentHash,
      contractRelationType: contract.relationType,
      negotiationSnapshot: contract.snapshot?.negotiation || session.pricingSnapshot || {},
      customerType: opportunity.customerType,
      contractedLives: contract.snapshot?.negotiation?.participants?.contractedLives ?? null,
      contractedDependents: contract.snapshot?.negotiation?.participants?.dependentCount ?? 0,
      contractedAmount: value,
      billingCycle: cycle,
      billingType,
      billingCustomerId: billingCustomer.id,
      companyContacts: opportunity.customerType === CustomerType.COMPANY ? {
        legalRepresentative: session.customerData?.legalRepresentative || null,
        financialContact: session.customerData?.financialContact || null,
      } : null,
      offerVersionId: opportunity.offerVersionId || null,
      checkoutSessionId: session.checkoutSessionId || null,
      precheckoutSessionId: session.id,
      pendingCreatedAt: subscription.metadata?.pendingCreatedAt || new Date().toISOString(),
    };
    subscription = await this.subscriptions.save(subscription);

    const desiredMembers = [
      { personId: opportunity.primaryPersonId, role: MemberRole.PRIMARY, relationship: null as string | null },
      ...(await this.opportunityMembers.find({
        where: { unitId: session.unitId, opportunityId: opportunity.id },
      })).map((member) => ({ personId: member.personId, role: member.role, relationship: member.relationship })),
    ];
    for (const desired of desiredMembers) {
      let member = await this.subscriptionMembers.findOne({
        where: { unitId: session.unitId, subscriptionId: subscription.id, personId: desired.personId },
      });
      if (!member) {
        member = this.subscriptionMembers.create({
          unitId: session.unitId,
          subscriptionId: subscription.id,
          personId: desired.personId,
          role: desired.role,
          status: SubscriptionMemberStatus.ACTIVE,
          joinedAt: new Date(),
          leftAt: null,
          relationship: desired.relationship,
        });
      } else {
        member.role = desired.role;
        member.status = SubscriptionMemberStatus.ACTIVE;
        member.leftAt = null;
        member.relationship = desired.relationship;
      }
      await this.subscriptionMembers.save(member);
    }

    const existingSale = await this.sales.findOne({
      where: { unitId: session.unitId, opportunityId: opportunity.id, subscriptionId: subscription.id },
    });
    if (!existingSale) {
      await this.sales.save(this.sales.create({
        unitId: session.unitId,
        opportunityId: opportunity.id,
        subscriptionId: subscription.id,
        salespersonId: opportunity.ownerUserId,
        grossAmount: Number(value).toFixed(2),
        commissionAmount: (value * 0.1).toFixed(2),
        commissionPaid: false,
        soldAt: contract.acceptedAt || new Date(),
      }));
    }

    opportunity.status = OpportunityStatus.WON;
    opportunity.commercialStatus = CommercialStatus.CONVERTED;
    opportunity.wonAt = opportunity.wonAt || new Date();
    await this.opportunities.save(opportunity);

    if (wasCreated) {
      await this.lifecycle.record({
        unitId: session.unitId,
        type: 'subscription.pending_payment',
        personId: subscription.primaryPersonId,
        subscriptionId: subscription.id,
        fromStatus: SubscriptionStatus.DRAFT,
        toStatus: SubscriptionStatus.PENDING_PAYMENT,
        source: LifecycleSource.SYSTEM,
        correlationId: session.id,
        metadata: { contractId: contract.id, opportunityId: opportunity.id },
      });
    }
    return subscription;
  }


  private renderRevision(parent: Contract, revision: Record<string, any>, negotiation: Record<string, any>) {
    const title = {
      [ContractRelationType.AMENDMENT]: 'ADITIVO CONTRATUAL',
      [ContractRelationType.RENEWAL]: 'RENOVAÇÃO CONTRATUAL',
      [ContractRelationType.REPLACEMENT]: 'SUBSTITUIÇÃO CONTRATUAL',
      [ContractRelationType.ORIGINAL]: 'CONTRATO',
    }[revision.relationType as ContractRelationType];
    const effectiveAt = this.formatContractDate(revision.changes?.effectiveAt || new Date().toISOString().slice(0, 10));
    const pricing = negotiation.pricing || {};
    const participants = negotiation.participants || {};
    const money = (value: unknown) => new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL',
    }).format(Number(value || 0));
    const cycleLabel = negotiation.cycle === BillingCycle.YEARLY ? 'Anual' : 'Mensal';
    const billingTypeLabels: Record<string, string> = {
      [BillingType.CREDIT_CARD]: 'Cartão de crédito',
      [BillingType.BOLETO]: 'Boleto',
      [BillingType.PIX]: 'Pix',
    };
    const conditions = [
      `Periodicidade: ${cycleLabel}`,
      negotiation.customerType === CustomerType.COMPANY
        ? `Vidas contratadas: ${Number(participants.contractedLives || 0)}`
        : `Dependentes contratados: ${Number(participants.dependentCount || 0)}`,
      negotiation.customerType === CustomerType.COMPANY
        ? `Valor por vida: ${money(pricing.unitPrice)}`
        : `Valor do titular: ${money(pricing.holderAmount)}`,
      negotiation.customerType === CustomerType.PERSON
        ? `Valor por dependente: ${money(pricing.dependentAmount)}`
        : null,
      `Equivalente mensal: ${money(pricing.monthlyEquivalent ?? pricing.finalAmount)}`,
      negotiation.cycle === BillingCycle.YEARLY
        ? `Valor total anual: ${money(pricing.finalAmount)}`
        : `Valor total mensal: ${money(pricing.finalAmount)}`,
      `Formas de pagamento: ${(negotiation.allowedBillingTypes || [])
        .map((type: string) => billingTypeLabels[type] || type)
        .join(', ') || 'A definir'}`,
      `Vigência: ${effectiveAt}`,
      revision.changes?.notes?.trim() ? `Observações: ${revision.changes.notes.trim()}` : null,
    ].filter(Boolean).join('\n');
    return `${title}

Motivo: ${revision.reason}

CONDIÇÕES ATUALIZADAS
${conditions}

As demais cláusulas do contrato de origem permanecem inalteradas.`;
  }

  private formatContractDate(value: unknown) {
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(String(value));
    if (Number.isNaN(date.getTime())) return 'A definir';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
  }

  private async applyAcceptedRevision(contract: Contract, session: PrecheckoutSession) {
    const negotiation = contract.snapshot?.negotiation || session.pricingSnapshot || {};
    const opportunity = await this.opportunities.findOne({
      where: { unitId: contract.unitId, id: contract.opportunityId },
    });
    if (!opportunity) throw new NotFoundException('Oportunidade da alteração contratual não encontrada.');

    const subscription = await this.subscriptions.findOne({
      where: { unitId: contract.unitId, sourceOpportunityId: opportunity.id },
    });
    if (!subscription) throw new NotFoundException('Assinatura vinculada à oportunidade não encontrada.');

    const value = Number(negotiation.pricing?.finalAmount ?? subscription.metadata?.contractedAmount ?? 0);
    const cycle = negotiation.cycle || subscription.metadata?.billingCycle || opportunity.billingCycle;
    const currentBillingType = subscription.metadata?.billingType || opportunity.billingType || null;
    const billingType = negotiation.billingType
      || (currentBillingType && negotiation.allowedBillingTypes?.includes(currentBillingType) ? currentBillingType : null)
      || negotiation.allowedBillingTypes?.[0]
      || currentBillingType;
    if (!(value > 0) || !cycle || !billingType) {
      throw new BadRequestException('A alteração contratual não possui condições financeiras válidas.');
    }

    if (subscription.externalSubscriptionId) {
      const alreadySynced = subscription.metadata?.lastAppliedContractId === contract.id;
      if (!alreadySynced) {
        await this.asaas.updateSubscription(contract.unitId, subscription.externalSubscriptionId, {
          value,
          cycle,
          billingType,
          updatePendingPayments: true,
        });
      }
    }

    opportunity.negotiationSnapshot = negotiation;
    opportunity.expectedValue = value.toFixed(2);
    opportunity.billingCycle = cycle;
    opportunity.billingType = billingType;
    await this.opportunities.save(opportunity);

    subscription.metadata = {
      ...(subscription.metadata || {}),
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contentHash,
      contractRelationType: contract.relationType,
      parentContractId: contract.parentContractId,
      negotiationSnapshot: negotiation,
      contractedLives: negotiation.participants?.contractedLives ?? subscription.metadata?.contractedLives ?? null,
      contractedDependents: negotiation.participants?.dependentCount ?? subscription.metadata?.contractedDependents ?? 0,
      contractedAmount: value,
      billingCycle: cycle,
      billingType,
      lastAppliedContractId: contract.id,
      lastContractChangeAt: new Date().toISOString(),
    };
    await this.subscriptions.save(subscription);
    if (opportunity.customerType === CustomerType.PERSON) {
      await this.syncSubscriptionMembersFromOpportunity(subscription, opportunity);
    }

    await this.lifecycle.record({
      unitId: contract.unitId,
      type: 'subscription.contract_changed',
      personId: subscription.primaryPersonId,
      subscriptionId: subscription.id,
      source: LifecycleSource.SYSTEM,
      correlationId: contract.id,
      metadata: {
        contractId: contract.id,
        parentContractId: contract.parentContractId,
        relationType: contract.relationType,
        value,
        cycle,
        billingType,
      },
    });
    await this.audit(contract.unitId, null, 'contract.revision_applied', 'contract', contract.id, null, {
      opportunityId: opportunity.id,
      subscriptionId: subscription.id,
      relationType: contract.relationType,
      requiresPayment: contract.requiresPayment,
      providerSubscriptionUpdated: Boolean(subscription.externalSubscriptionId),
      updatePendingPayments: Boolean(subscription.externalSubscriptionId),
    });
  }

  private async syncSubscriptionMembersFromOpportunity(subscription: Subscription, opportunity: Opportunity) {
    const opportunityMembers = await this.opportunityMembers.find({
      where: { unitId: opportunity.unitId, opportunityId: opportunity.id },
    });
    const desired = new Map<string, { role: MemberRole; relationship: string | null }>();
    desired.set(opportunity.primaryPersonId, { role: MemberRole.PRIMARY, relationship: null });
    for (const member of opportunityMembers) {
      desired.set(member.personId, { role: member.role, relationship: member.relationship });
    }

    const current = await this.subscriptionMembers.find({
      where: { unitId: opportunity.unitId, subscriptionId: subscription.id },
    });
    const currentByPerson = new Map(current.map((member) => [member.personId, member]));
    const now = new Date();
    for (const [personId, data] of desired) {
      let member = currentByPerson.get(personId);
      if (!member) {
        member = this.subscriptionMembers.create({
          unitId: opportunity.unitId,
          subscriptionId: subscription.id,
          personId,
          role: data.role,
          status: SubscriptionMemberStatus.ACTIVE,
          joinedAt: now,
          leftAt: null,
          relationship: data.relationship,
        });
      } else {
        member.role = data.role;
        member.relationship = data.relationship;
        member.status = SubscriptionMemberStatus.ACTIVE;
        member.leftAt = null;
      }
      await this.subscriptionMembers.save(member);
    }
    for (const member of current) {
      if (member.role === MemberRole.PRIMARY || desired.has(member.personId)) continue;
      if (member.status === SubscriptionMemberStatus.ACTIVE) {
        member.status = SubscriptionMemberStatus.INACTIVE;
        member.leftAt = now;
        await this.subscriptionMembers.save(member);
      }
    }
  }

  private async resolveTemplate(opportunity: Opportunity) {
    const selectedVersionId = opportunity.contractTemplateVersionId
      || opportunity.negotiationSnapshot?.contractTemplateVersionId
      || null;
    if (selectedVersionId) {
      const selected = await this.templateVersions.findOne({
        where: { id: selectedVersionId, unitId: opportunity.unitId },
      });
      if (selected?.status === ContractTemplateStatus.PUBLISHED) return selected;
      throw new BadRequestException('O modelo contratual selecionado não está mais publicado.');
    }

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
    const desiredPersonIds = new Set<string>();
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
      } else {
        person.name = participant.name;
        person.birthDate = participant.birthDate || person.birthDate;
        await this.people.save(person);
      }
      desiredPersonIds.add(person.id);
      let member = await this.opportunityMembers.findOne({
        where: {
          unitId: session.unitId,
          opportunityId: session.opportunityId,
          personId: person.id,
        },
      });
      if (!member) {
        member = this.opportunityMembers.create({
          unitId: session.unitId,
          opportunityId: session.opportunityId,
          personId: person.id,
          role: MemberRole.DEPENDENT,
          relationship: participant.relationship,
        });
      } else {
        member.role = MemberRole.DEPENDENT;
        member.relationship = participant.relationship;
      }
      await this.opportunityMembers.save(member);
    }

    const existingDependents = await this.opportunityMembers.find({
      where: {
        unitId: session.unitId,
        opportunityId: session.opportunityId,
        role: MemberRole.DEPENDENT,
      },
    });
    const stale = existingDependents.filter((member) => !desiredPersonIds.has(member.personId));
    if (stale.length) await this.opportunityMembers.remove(stale);
  }

  private async policySubject(
    opportunity: Opportunity,
    fallbackUserId: string,
    fallbackRole: UnitRole | null,
  ) {
    const subjectUserId = opportunity.ownerUserId || fallbackUserId;
    if (subjectUserId === fallbackUserId) {
      return { userId: subjectUserId, role: fallbackRole };
    }
    const membership = await this.memberships.findOne({
      where: {
        unitId: opportunity.unitId,
        userId: subjectUserId,
        active: true,
      },
    });
    return {
      userId: subjectUserId,
      role: membership?.role || fallbackRole,
    };
  }

  private async currentApproval(unitId: string, opportunityId: string, snapshot: Record<string, any>) {
    const approvals = await this.approvals.find({
      where: { unitId, opportunityId },
      order: { createdAt: 'DESC' },
    });
    const currentSnapshot = this.canonical(this.approvalTerms(snapshot || {}));
    return approvals.find((approval) =>
      approval.status !== ApprovalStatus.CANCELLED
      && this.canonical(this.approvalTerms(approval.requestedConditions || {})) === currentSnapshot,
    ) || null;
  }

  private async currentRevisionApproval(
    unitId: string,
    opportunityId: string,
    snapshot: Record<string, any>,
    parentContractId: string,
    parentContentHash: string,
    relationType: ContractRelationType,
  ) {
    const approvals = await this.approvals.find({
      where: { unitId, opportunityId },
      order: { createdAt: 'DESC' },
    });
    const currentSnapshot = this.canonical(this.approvalTerms(snapshot || {}));
    return approvals.find((approval) =>
      approval.status !== ApprovalStatus.CANCELLED
      && approval.requestedConditions?.revisionContext?.parentContractId === parentContractId
      && approval.requestedConditions?.revisionContext?.parentContentHash === parentContentHash
      && approval.requestedConditions?.revisionContext?.relationType === relationType
      && this.canonical(this.approvalTerms(approval.requestedConditions || {})) === currentSnapshot,
    ) || null;
  }

  private approvalTerms(snapshot: Record<string, any>) {
    return {
      customerType: snapshot?.customerType || null,
      cycle: snapshot?.cycle || null,
      billingType: snapshot?.billingType || null,
      allowedBillingTypes: [...(snapshot?.allowedBillingTypes || [])].sort(),
      participants: snapshot?.participants || null,
      pricing: snapshot?.pricing ? {
        holderAmount: snapshot.pricing.holderAmount,
        dependentAmount: snapshot.pricing.dependentAmount,
        unitPrice: snapshot.pricing.unitPrice,
        grossPeriodAmount: snapshot.pricing.grossPeriodAmount,
        annualDiscountPercent: snapshot.pricing.annualDiscountPercent,
        negotiationBaseAmount: snapshot.pricing.negotiationBaseAmount,
        commercialDiscountAmount: snapshot.pricing.commercialDiscountAmount,
        finalAmount: snapshot.pricing.finalAmount,
      } : null,
      discounts: snapshot?.discounts || [],
      contractTemplateVersionId: snapshot?.contractTemplateVersionId || null,
    };
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
    if (opportunity.ownerUserId === userId) return;
    if (!opportunity.teamId || !await this.teams.exists({
      where: { unitId: opportunity.unitId, id: opportunity.teamId, active: true },
    })) throw new NotFoundException('Oportunidade não encontrada.');

    if (role === UnitRole.MANAGER && await this.teams.exists({
      where: { unitId: opportunity.unitId, id: opportunity.teamId, managerId: userId, active: true },
    })) return;

    if ((role === UnitRole.SALES || role === UnitRole.MANAGER)
      && opportunity.ownerUserId === null
      && await this.teamMembers.exists({
        where: { unitId: opportunity.unitId, teamId: opportunity.teamId, userId },
      })) return;

    throw new NotFoundException('Oportunidade não encontrada.');
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
