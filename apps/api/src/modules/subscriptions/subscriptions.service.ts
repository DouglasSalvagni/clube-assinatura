import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AccessStatus,
  BillingCustomer,
  BillingCycle,
  BillingType,
  Contract,
  ContractStatus,
  CustomerType,
  FinancialStatus,
  Invoice,
  InvoiceStatus,
  LifecycleEvent,
  LifecycleSource,
  MemberRole,
  Person,
  PersonKind,
  Plan,
  PlanPrice,
  Subscription,
  SubscriptionMember,
  SubscriptionMemberStatus,
  SubscriptionStatus,
  Unit,
  User,
} from '../../database/entities';
import { isValidCnpj, isValidCpf, normalizeTaxId } from '../../common/utils/tax-id';
import { AsaasApiException, AsaasClient } from '../billing/asaas.client';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import {
  CancelSubscriptionDto,
  CreateDependentDto,
  CreatePaymentDto,
  SettleDebtsDto,
  SuspendSubscriptionDto,
  UpdateCompanyContactsDto,
  UpdateDependentDto,
  UpdatePrimaryDto,
} from './subscriptions.dto';
import { canTransitionSubscription } from './subscription-state-machine';

interface ContractTerms {
  snapshot: Record<string, any>;
  customerType: CustomerType;
  cycle: BillingCycle | null;
  billingType: BillingType | null;
  recurringAmount: number | null;
  contractedLives: number | null;
  contractedDependents: number | null;
  contractId: string | null;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionMember) private readonly memberRepo: Repository<SubscriptionMember>,
    @InjectRepository(Person) private readonly personRepo: Repository<Person>,
    @InjectRepository(PlanPrice) private readonly priceRepo: Repository<PlanPrice>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Unit) private readonly unitRepo: Repository<Unit>,
    @InjectRepository(BillingCustomer) private readonly customerRepo: Repository<BillingCustomer>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(LifecycleEvent) private readonly lifecycleRepo: Repository<LifecycleEvent>,
    private readonly asaas: AsaasClient,
    private readonly lifecycle: LifecycleService,
  ) {}

  async transition(
    subscription: Subscription,
    to: SubscriptionStatus,
    input: {
      actorUserId?: string | null;
      source?: LifecycleSource;
      reasonCode?: string | null;
      correlationId?: string | null;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<Subscription> {
    const from = subscription.status;
    if (from === to) return subscription;
    if (!canTransitionSubscription(from, to)) {
      throw new BadRequestException(`Transição inválida de ${from} para ${to}.`);
    }

    subscription.status = to;
    if (to === SubscriptionStatus.PENDING_PAYMENT) {
      subscription.financialStatus = FinancialStatus.UNKNOWN;
      subscription.accessStatus = AccessStatus.DISABLED;
      subscription.cancelledAt = null;
      subscription.cancellationScheduledAt = null;
    }
    if (to === SubscriptionStatus.ACTIVE) {
      subscription.financialStatus = FinancialStatus.CURRENT;
      subscription.accessStatus = AccessStatus.ENABLED;
      subscription.startedAt ||= new Date();
      subscription.firstActiveAt ||= new Date();
      if ([SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED].includes(from)) {
        subscription.lastReactivatedAt = new Date();
      }
      subscription.cancelledAt = null;
      subscription.cancellationScheduledAt = null;
      subscription.metadata = {
        ...(subscription.metadata || {}),
        pastDueSince: null,
        suspensionDueAt: null,
        lastOverduePaymentId: null,
      };
    }
    if (to === SubscriptionStatus.PAST_DUE) {
      subscription.financialStatus = FinancialStatus.OVERDUE;
      subscription.accessStatus = AccessStatus.RESTRICTED;
    }
    if (to === SubscriptionStatus.SUSPENDED) {
      subscription.financialStatus = FinancialStatus.BLOCKED;
      subscription.accessStatus = AccessStatus.DISABLED;
    }
    if ([SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED].includes(to)) {
      subscription.cancelledAt = new Date();
      subscription.accessStatus = AccessStatus.DISABLED;
    }

    await this.subRepo.save(subscription);
    await this.lifecycle.record({
      unitId: subscription.unitId,
      subscriptionId: subscription.id,
      personId: subscription.primaryPersonId,
      type: `subscription.${to.toLowerCase()}`,
      fromStatus: from,
      toStatus: to,
      actorUserId: input.actorUserId,
      source: input.source,
      reasonCode: input.reasonCode,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
    return subscription;
  }

  async listLives(
    unitIds: string[] | null,
    query: { page: number; limit: number; search?: string; status?: string; subscription?: string; estado?: string },
  ) {
    const qb = this.subRepo.createQueryBuilder('subscription');
    if (unitIds) qb.where('subscription.unit_id IN (:...unitIds)', { unitIds });
    if (query.status) {
      const map: Record<string, SubscriptionStatus[]> = {
        ACTIVE: [SubscriptionStatus.ACTIVE],
        PENDING: [SubscriptionStatus.PENDING_PAYMENT],
        DELINQUENT: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED],
        INACTIVE: [SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
      };
      qb.andWhere('subscription.status IN (:...statuses)', { statuses: map[query.status] || [query.status] });
    }
    const subscriptions = await qb.orderBy('subscription.created_at', 'DESC').getMany();
    const members = subscriptions.length
      ? await this.memberRepo.find({
          where: {
            subscriptionId: In(subscriptions.map((subscription) => subscription.id)),
            status: SubscriptionMemberStatus.ACTIVE,
          },
        })
      : [];
    const people = members.length
      ? await this.personRepo.find({ where: { id: In([...new Set(members.map((member) => member.personId))]) } })
      : [];
    let rows = members
      .map((member) => {
        const sub = subscriptions.find((item) => item.id === member.subscriptionId)!;
        const person = people.find((item) => item.id === member.personId)!;
        return this.lifeRow(sub, member, person);
      })
      .filter((row) => row.nome);

    if (query.search) {
      const search = query.search.toLowerCase();
      const digits = query.search.replace(/\D/g, '');
      rows = rows.filter(
        (row) => row.nome.toLowerCase().includes(search)
          || row.email?.toLowerCase().includes(search)
          || (digits && row.cpf.includes(digits)),
      );
    }
    if (query.estado) rows = rows.filter((row) => row.estado === query.estado);
    if (query.subscription === 'titular') rows = rows.filter((row) => row.tipo === 'Titular');
    if (query.subscription === 'dependente') rows = rows.filter((row) => row.tipo === 'Dependente');

    const allRows = rows;
    const total = allRows.length;
    rows = allRows.slice((query.page - 1) * query.limit, query.page * query.limit);
    const count = (status: string, tipo?: string) => allRows.filter((row) => row.status === status && (!tipo || row.tipo === tipo)).length;
    return {
      data: rows,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      ativos: count('ACTIVE'),
      pendentes: count('PENDING'),
      inadimplentes: count('DELINQUENT'),
      inativos: count('INACTIVE'),
      ativosTit: count('ACTIVE', 'Titular'),
      ativosDep: count('ACTIVE', 'Dependente'),
      inadTit: count('DELINQUENT', 'Titular'),
      inadDep: count('DELINQUENT', 'Dependente'),
      inatTit: count('INACTIVE', 'Titular'),
      inatDep: count('INACTIVE', 'Dependente'),
      totalTit: allRows.filter((row) => row.tipo === 'Titular').length,
      totalDep: allRows.filter((row) => row.tipo === 'Dependente').length,
      estados: [...new Set(allRows.map((row) => row.estado).filter(Boolean))].sort(),
    };
  }

  private lifeRow(sub: Subscription, member: SubscriptionMember, person: Person) {
    const status = this.uiStatus(sub.status);
    return {
      id: member.id,
      asaas_id: sub.id,
      subscriptionId: sub.id,
      nome: person?.name || '',
      cpf: person?.taxId || '',
      telefone: person?.phone || '',
      email: person?.email || '',
      data_nascimento: person?.birthDate || '',
      cidade: person?.city || '',
      estado: person?.state || '',
      status,
      subscriptionStatus: sub.status,
      tipo: member.role === MemberRole.PRIMARY ? 'Titular' : 'Dependente',
    };
  }

  private uiStatus(status: SubscriptionStatus) {
    if (status === SubscriptionStatus.ACTIVE) return 'ACTIVE';
    if (status === SubscriptionStatus.PENDING_PAYMENT) return 'PENDING';
    if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(status)) return 'DELINQUENT';
    return 'INACTIVE';
  }

  async resolve(unitId: string, reference: string): Promise<Subscription> {
    let sub = await this.subRepo.findOne({
      where: [{ unitId, id: reference }, { unitId, externalSubscriptionId: reference }],
    });
    if (!sub) {
      const customer = await this.customerRepo.findOne({ where: { unitId, externalId: reference } });
      if (customer) {
        sub = await this.subRepo.findOne({
          where: { unitId, primaryPersonId: customer.personId },
          order: { createdAt: 'DESC' },
        });
      }
    }
    if (!sub) throw new NotFoundException('Assinatura não encontrada.');
    return sub;
  }

  async detail(unitId: string, reference: string) {
    const sub = await this.resolve(unitId, reference);
    const members = await this.memberRepo.find({
      where: { unitId, subscriptionId: sub.id, status: SubscriptionMemberStatus.ACTIVE },
      order: { joinedAt: 'ASC' },
    });
    const people = members.length
      ? await this.personRepo.find({ where: { unitId, id: In(members.map((member) => member.personId)) } })
      : [];
    const primaryMember = members.find((member) => member.role === MemberRole.PRIMARY);
    const primary = people.find((person) => person.id === primaryMember?.personId);
    if (!primary) throw new NotFoundException('Titular da assinatura não encontrado.');

    const terms = await this.contractTerms(sub);
    const contract = await this.currentContract(sub);
    const nextInvoice = await this.invoiceRepo.findOne({
      where: {
        unitId,
        subscriptionId: sub.id,
        status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      },
      order: { dueDate: 'ASC' },
    });
    const history = await this.lifecycleRepo.find({
      where: { unitId, subscriptionId: sub.id },
      order: { effectiveAt: 'DESC' },
      take: 50,
    });
    const dependents = members.filter((member) => member.role === MemberRole.DEPENDENT);
    const companyContacts = sub.metadata?.companyContacts
      || contract?.snapshot?.customer && {
        legalRepresentative: contract.snapshot.customer.legalRepresentative || null,
        financialContact: contract.snapshot.customer.financialContact || null,
      }
      || null;
    const modernContract = Boolean(terms.contractId || contract?.id);

    return {
      titular: {
        id: primary.id,
        nome: primary.name,
        email: primary.email,
        telefone: primary.phone,
        cpfCnpj: primary.taxId,
        endereco: primary.address,
        enderecoNumero: primary.addressNumber,
        complemento: primary.complement,
        bairro: primary.district,
        cidade: primary.city,
        estado: primary.state,
        cep: primary.postalCode,
        status: this.uiStatus(sub.status),
        cycle: terms.cycle,
      },
      dependentes: dependents.map((member) => {
        const person = people.find((item) => item.id === member.personId)!;
        return {
          id: member.id,
          personId: person.id,
          nome: person.name,
          cpf: person.taxId,
          telefone: person.phone,
          email: person.email,
          dataNascimento: person.birthDate,
          endereco: person.address,
          bairro: person.district,
          cidade: person.city,
          estado: person.state,
          cep: person.postalCode,
          relationship: member.relationship,
          status: member.status === SubscriptionMemberStatus.ACTIVE ? 'ACTIVE' : 'INACTIVE',
        };
      }),
      subscription: sub,
      summary: {
        status: sub.status,
        financialStatus: sub.financialStatus,
        accessStatus: sub.accessStatus,
        customerType: terms.customerType,
        recurringAmount: terms.recurringAmount,
        cycle: terms.cycle,
        billingType: terms.billingType,
        contractedLives: terms.contractedLives,
        contractedDependents: terms.contractedDependents,
        registeredBeneficiaries: terms.customerType === CustomerType.COMPANY ? dependents.length : null,
        activeDependents: terms.customerType === CustomerType.PERSON ? dependents.length : null,
        nextDueDate: nextInvoice?.dueDate || null,
        sourceOpportunityId: sub.sourceOpportunityId,
        contractId: contract?.id || terms.contractId,
        contractVersion: contract?.version || sub.metadata?.contractVersion || null,
        contractRelationType: contract?.relationType || sub.metadata?.contractRelationType || null,
        pastDueSince: sub.metadata?.pastDueSince || null,
        suspensionDueAt: sub.metadata?.suspensionDueAt || null,
      },
      companyContacts,
      contract: contract ? {
        id: contract.id,
        version: contract.version,
        relationType: contract.relationType,
        status: contract.status,
        acceptedAt: contract.acceptedAt,
        contentHash: contract.contentHash,
        changeReason: contract.changeReason,
      } : null,
      history: history.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reasonCode: event.reasonCode,
        source: event.source,
        effectiveAt: event.effectiveAt,
        metadata: event.metadata,
      })),
      management: {
        modernContract,
        dependentChangesRequireContract: terms.customerType === CustomerType.PERSON
          && (terms.contractedDependents === null || dependents.length >= terms.contractedDependents),
        annualDependentAdditionBlocked: false,
        canManageBeneficiariesDirectly: terms.customerType === CustomerType.COMPANY,
        canAddDependentsDirectly: terms.customerType === CustomerType.PERSON
          && terms.contractedDependents !== null
          && dependents.length < terms.contractedDependents,
        dependentSlotsAvailable: terms.customerType === CustomerType.PERSON && terms.contractedDependents !== null
          ? Math.max(0, terms.contractedDependents - dependents.length)
          : null,
        canCreateContractRevision: Boolean(sub.sourceOpportunityId && contract?.id),
      },
    };
  }

  async updatePrimary(unitId: string, reference: string, dto: UpdatePrimaryDto, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const person = await this.personRepo.findOne({ where: { unitId, id: sub.primaryPersonId } });
    if (!person) throw new NotFoundException('Titular não encontrado.');
    const terms = await this.contractTerms(sub);
    const changedFields = Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key);

    if (dto.cpfCnpj !== undefined) {
      const taxId = normalizeTaxId(dto.cpfCnpj);
      const valid = terms.customerType === CustomerType.COMPANY ? isValidCnpj(taxId) : isValidCpf(taxId);
      if (!valid) throw new BadRequestException(terms.customerType === CustomerType.COMPANY ? 'CNPJ inválido.' : 'CPF inválido.');
      const conflict = await this.personRepo.findOne({ where: { unitId, taxId } });
      if (conflict && conflict.id !== person.id) throw new ConflictException('CPF/CNPJ já cadastrado na unidade.');
      person.taxId = taxId;
    }

    const mapping: Record<string, keyof Person> = {
      nome: 'name',
      email: 'email',
      telefone: 'phone',
      endereco: 'address',
      enderecoNumero: 'addressNumber',
      complemento: 'complement',
      bairro: 'district',
      cidade: 'city',
      estado: 'state',
      cep: 'postalCode',
    };
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && mapping[key]) (person as any)[mapping[key]] = value;
    }

    const customer = await this.customerRepo.findOne({ where: { unitId, personId: person.id } });
    if (customer) {
      await this.asaas.updateCustomer(unitId, customer.externalId, {
        name: person.name,
        cpfCnpj: person.taxId,
        email: person.email,
        phone: person.phone,
        mobilePhone: person.phone,
        address: person.address,
        addressNumber: person.addressNumber,
        complement: person.complement,
        province: person.district,
        postalCode: person.postalCode,
        state: person.state,
      });
    }

    await this.personRepo.save(person);
    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: person.id,
      type: 'subscriber.profile_updated',
      actorUserId,
      source: LifecycleSource.API,
      metadata: { fields: changedFields, asaasSynchronized: Boolean(customer) },
    });
    return this.detail(unitId, sub.id);
  }

  async updateCompanyContacts(unitId: string, reference: string, dto: UpdateCompanyContactsDto, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const terms = await this.contractTerms(sub);
    if (terms.customerType !== CustomerType.COMPANY) {
      throw new BadRequestException('Responsáveis empresariais são permitidos apenas para pessoa jurídica.');
    }
    const representativeTaxId = normalizeTaxId(dto.legalRepresentativeTaxId);
    if (!isValidCpf(representativeTaxId)) throw new BadRequestException('CPF do responsável legal inválido.');
    const before = sub.metadata?.companyContacts || null;
    sub.metadata = {
      ...(sub.metadata || {}),
      companyContacts: {
        legalRepresentative: {
          name: dto.legalRepresentativeName.trim(),
          taxId: representativeTaxId,
        },
        financialContact: {
          name: dto.financialContactName.trim(),
          email: dto.financialEmail.trim().toLowerCase(),
          phone: dto.financialPhone.replace(/\D/g, ''),
        },
      },
    };
    await this.subRepo.save(sub);
    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: sub.primaryPersonId,
      type: 'subscriber.company_contacts_updated',
      actorUserId,
      source: LifecycleSource.API,
      metadata: {
        hadPreviousData: Boolean(before),
        fields: ['legalRepresentative', 'financialContact'],
      },
    });
    return this.detail(unitId, sub.id);
  }

  async addDependent(unitId: string, reference: string, dto: CreateDependentDto, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const terms = await this.contractTerms(sub);

    const taxId = normalizeTaxId(dto.cpf);
    if (!isValidCpf(taxId)) throw new BadRequestException('CPF inválido.');
    if (await this.personRepo.exists({ where: { unitId, taxId } })) {
      throw new ConflictException('CPF já cadastrado na unidade.');
    }

    const activeDependents = await this.memberRepo.count({
      where: {
        unitId,
        subscriptionId: sub.id,
        role: MemberRole.DEPENDENT,
        status: SubscriptionMemberStatus.ACTIVE,
      },
    });
    if (terms.customerType === CustomerType.COMPANY && terms.contractedLives && activeDependents >= terms.contractedLives) {
      throw new ConflictException(`O contrato permite no máximo ${terms.contractedLives} beneficiários ativos.`);
    }

    if (terms.customerType === CustomerType.PERSON) {
      if (terms.contractedDependents === null) {
        throw new ConflictException('A assinatura não possui a quantidade de dependentes contratada. Faça uma alteração contratual antes de cadastrar outro dependente.');
      }
      if (activeDependents >= terms.contractedDependents) {
        throw new ConflictException(`O contrato permite no máximo ${terms.contractedDependents} dependente(s) ativo(s). Faça um aditivo, renovação ou substituição para ampliar a quantidade contratada.`);
      }
    }

    const person = await this.personRepo.save(this.personRepo.create({
      unitId,
      kind: PersonKind.PERSON,
      name: dto.nome,
      taxId,
      phone: dto.telefone || null,
      email: dto.email || null,
      whatsapp: null,
      birthDate: dto.dataNascimento || null,
      address: null,
      addressNumber: null,
      complement: null,
      district: null,
      city: null,
      state: null,
      postalCode: null,
      metadata: { source: 'subscription_management' },
    }));
    const member = await this.memberRepo.save(this.memberRepo.create({
      unitId,
      subscriptionId: sub.id,
      personId: person.id,
      role: MemberRole.DEPENDENT,
      status: SubscriptionMemberStatus.ACTIVE,
      joinedAt: new Date(),
      leftAt: null,
      relationship: dto.relationship || null,
    }));
    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: person.id,
      type: terms.customerType === CustomerType.COMPANY ? 'beneficiary.added' : 'member.added',
      actorUserId,
      source: LifecycleSource.API,
    });
    return { id: member.id, nome: person.name, cpf: person.taxId };
  }

  async updateDependent(unitId: string, reference: string, memberId: string, dto: UpdateDependentDto, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const member = await this.memberRepo.findOne({
      where: { unitId, subscriptionId: sub.id, id: memberId, role: MemberRole.DEPENDENT },
    });
    if (!member) throw new NotFoundException('Dependente não encontrado.');
    const person = await this.personRepo.findOneByOrFail({ id: member.personId, unitId });
    const changedFields = Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key);
    if (dto.nome !== undefined) person.name = dto.nome;
    if (dto.cpf !== undefined) {
      const taxId = normalizeTaxId(dto.cpf);
      if (!isValidCpf(taxId)) throw new BadRequestException('CPF inválido.');
      const conflict = await this.personRepo.findOne({ where: { unitId, taxId } });
      if (conflict && conflict.id !== person.id) throw new ConflictException('CPF já cadastrado na unidade.');
      person.taxId = taxId;
    }
    if (dto.telefone !== undefined) person.phone = dto.telefone;
    if (dto.email !== undefined) person.email = dto.email;
    if (dto.dataNascimento !== undefined) person.birthDate = dto.dataNascimento;
    if (dto.relationship !== undefined) member.relationship = dto.relationship;
    await this.memberRepo.save(member);
    await this.personRepo.save(person);
    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: person.id,
      type: 'member.updated',
      actorUserId,
      source: LifecycleSource.API,
      metadata: { fields: changedFields },
    });
    return { id: member.id, nome: person.name, cpf: person.taxId };
  }

  async removeDependent(unitId: string, reference: string, memberId: string, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const terms = await this.contractTerms(sub);
    this.assertDirectMemberChangeAllowed(terms, 'remove');
    const member = await this.memberRepo.findOne({
      where: { unitId, subscriptionId: sub.id, id: memberId, role: MemberRole.DEPENDENT },
    });
    if (!member) throw new NotFoundException('Dependente não encontrado.');
    if (member.status === SubscriptionMemberStatus.INACTIVE) return { success: true, idempotent: true };
    member.status = SubscriptionMemberStatus.INACTIVE;
    member.leftAt = new Date();
    await this.memberRepo.save(member);
    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: member.personId,
      type: terms.customerType === CustomerType.COMPANY ? 'beneficiary.removed' : 'member.removed',
      actorUserId,
      source: LifecycleSource.API,
    });
    return { success: true };
  }

  async suspend(unitId: string, reference: string, dto: SuspendSubscriptionDto, actor: User) {
    const sub = await this.resolve(unitId, reference);
    if (sub.status === SubscriptionStatus.SUSPENDED) return { success: true, idempotent: true };
    if (![SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE].includes(sub.status)) {
      throw new BadRequestException('A assinatura não está em um estado que permita suspensão manual.');
    }
    await this.transition(sub, SubscriptionStatus.SUSPENDED, {
      actorUserId: actor.id,
      source: LifecycleSource.API,
      reasonCode: dto.reasonCode || 'MANUAL_SUSPENSION',
      metadata: { reason: dto.reason },
    });
    return { success: true, status: sub.status };
  }

  async cancel(unitId: string, reference: string, dto: CancelSubscriptionDto, actor: User) {
    const sub = await this.resolve(unitId, reference);
    if (sub.status === SubscriptionStatus.CANCELLED) {
      return { success: true, idempotent: true };
    }
    if (sub.externalSubscriptionId) {
      try {
        await this.asaas.deleteSubscription(unitId, sub.externalSubscriptionId);
      } catch (error) {
        if (!(error instanceof AsaasApiException) || error.providerStatus !== 404) throw error;
      }
    }
    sub.cancellationReasonCode = dto.reasonCode || 'OTHER';
    sub.cancellationReasonText = dto.reason;
    await this.transition(sub, SubscriptionStatus.CANCELLED, {
      actorUserId: actor.id,
      source: LifecycleSource.API,
      reasonCode: sub.cancellationReasonCode,
      metadata: { reason: dto.reason },
    });
    return { success: true };
  }

  async reactivate(unitId: string, reference: string, actor: User) {
    const sub = await this.resolve(unitId, reference);
    if (![SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED].includes(sub.status)) {
      throw new BadRequestException('A assinatura não está em um estado reativável.');
    }

    const overdueCount = await this.invoiceRepo.count({
      where: { unitId, subscriptionId: sub.id, status: InvoiceStatus.OVERDUE },
    });
    if (overdueCount > 0) {
      throw new ConflictException('Existem cobranças vencidas. Regularize os débitos antes de reativar o acesso.');
    }

    if (sub.status === SubscriptionStatus.SUSPENDED) {
      await this.transition(sub, SubscriptionStatus.ACTIVE, {
        actorUserId: actor.id,
        source: LifecycleSource.API,
        reasonCode: 'REACTIVATED',
      });
      return { success: true, subscriptionId: sub.id, externalSubscriptionId: sub.externalSubscriptionId, status: sub.status };
    }

    const customer = await this.customerRepo.findOne({ where: { unitId, personId: sub.primaryPersonId } });
    if (!customer) throw new BadRequestException('Cliente financeiro não encontrado.');
    const terms = await this.contractTerms(sub);
    if (!terms.recurringAmount || !terms.cycle || !terms.billingType) {
      throw new BadRequestException('A assinatura não possui snapshot financeiro histórico suficiente para reativação segura.');
    }
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const result = await this.asaas.createSubscription(unitId, {
      customer: customer.externalId,
      billingType: terms.billingType === BillingType.UNDEFINED ? BillingType.BOLETO : terms.billingType,
      value: terms.recurringAmount,
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      cycle: terms.cycle,
      description: 'Reativação de assinatura',
      externalReference: sub.sourceOpportunityId || sub.id,
    });
    sub.externalSubscriptionId = result.id;
    sub.metadata = {
      ...(sub.metadata || {}),
      reactivatedFromHistoricalSnapshotAt: new Date().toISOString(),
    };
    await this.subRepo.save(sub);
    await this.transition(sub, SubscriptionStatus.PENDING_PAYMENT, {
      actorUserId: actor.id,
      source: LifecycleSource.API,
      reasonCode: 'REACTIVATION_AWAITING_PAYMENT',
    });

    let paymentUrl: string | null = null;
    let paymentId: string | null = null;
    try {
      const payments = await this.asaas.subscriptionPayments(unitId, result.id, 'PENDING', 1);
      const first = payments?.data?.[0] || null;
      paymentId = first?.id || null;
      paymentUrl = first?.invoiceUrl || first?.bankSlipUrl || null;
    } catch {
      // A assinatura já foi criada e permanece PENDING_PAYMENT. A reconciliação/webhook
      // poderá completar o vínculo da primeira cobrança sem ativar o acesso indevidamente.
    }
    return {
      success: true,
      subscriptionId: sub.id,
      externalSubscriptionId: sub.externalSubscriptionId,
      status: sub.status,
      paymentId,
      paymentUrl,
    };
  }

  async invoices(unitId: string, reference: string, limit = 20, offset = 0) {
    const sub = await this.resolve(unitId, reference);
    const [local, total] = await this.invoiceRepo.findAndCount({
      where: { unitId, subscriptionId: sub.id },
      order: { dueDate: 'DESC' },
      take: limit,
      skip: offset,
    });
    return {
      data: local.map((invoice) => ({
        id: invoice.externalId || invoice.id,
        dueDate: invoice.dueDate,
        value: Number(invoice.amount),
        status: invoice.status,
        description: invoice.metadata?.description || '',
        bankSlipUrl: invoice.bankSlipUrl,
        invoiceUrl: invoice.invoiceUrl,
        transactionReceiptUrl: invoice.metadata?.transactionReceiptUrl || null,
        billingType: invoice.metadata?.billingType || 'UNDEFINED',
        consolidationId: invoice.metadata?.debtConsolidationId || null,
      })),
      totalCount: total,
    };
  }

  async debtSummary(unitId: string, reference: string) {
    const sub = await this.resolve(unitId, reference);
    const invoices = await this.invoiceRepo.find({
      where: { unitId, subscriptionId: sub.id, status: InvoiceStatus.OVERDUE },
      order: { dueDate: 'ASC' },
    });
    const eligible = invoices.filter((invoice) => Boolean(invoice.externalId));
    return {
      subscriptionId: sub.id,
      count: eligible.length,
      total: Number(eligible.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0).toFixed(2)),
      invoices: eligible.map((invoice) => ({
        id: invoice.externalId,
        dueDate: invoice.dueDate,
        value: Number(invoice.amount),
        billingType: invoice.metadata?.billingType || 'UNDEFINED',
      })),
      suggestedDueDate: this.plusDays(new Date(), 2),
    };
  }

  async settleDebts(unitId: string, reference: string, dto: SettleDebtsDto, actor: User) {
    const sub = await this.resolve(unitId, reference);
    const overdue = await this.invoiceRepo.find({
      where: { unitId, subscriptionId: sub.id, status: InvoiceStatus.OVERDUE },
      order: { dueDate: 'ASC' },
    });
    const eligible = overdue.filter((invoice) => Boolean(invoice.externalId));
    if (!eligible.length) throw new BadRequestException('Não há cobranças vencidas elegíveis para regularização.');

    const dueDate = dto.dueDate || this.plusDays(new Date(), 2);
    const total = Number(eligible.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0).toFixed(2));
    const target = eligible[0];
    const others = eligible.slice(1);
    const consolidationId = `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const original = eligible.map((invoice) => ({ id: invoice.externalId!, amount: Number(invoice.amount) }));

    const updated = await this.asaas.updatePayment(unitId, target.externalId!, {
      value: total,
      dueDate,
      description: `Regularização de ${eligible.length} cobrança(s) vencida(s)`,
    });

    const deleted: Invoice[] = [];
    try {
      for (const invoice of others) {
        await this.asaas.deletePayment(unitId, invoice.externalId!);
        deleted.push(invoice);
      }
    } catch (error) {
      const notDeleted = others.filter((invoice) => !deleted.includes(invoice));
      const outstandingOutsideTarget = notDeleted.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
      const compensatedValue = Number(Math.max(0, total - outstandingOutsideTarget).toFixed(2));
      try {
        await this.asaas.updatePayment(unitId, target.externalId!, { value: compensatedValue, dueDate });
        target.amount = compensatedValue.toFixed(2);
        target.dueDate = dueDate;
        target.metadata = {
          ...(target.metadata || {}),
          debtConsolidationId: consolidationId,
          debtConsolidationPartial: true,
          originalInvoices: original,
        };
        await this.invoiceRepo.save(target);
        for (const invoice of deleted) {
          invoice.status = InvoiceStatus.CANCELLED;
          invoice.metadata = { ...(invoice.metadata || {}), debtConsolidationId: consolidationId, replacedBy: target.externalId };
          await this.invoiceRepo.save(invoice);
        }
      } catch {
        sub.metadata = {
          ...(sub.metadata || {}),
          providerReconciliation: {
            required: true,
            reason: 'DEBT_CONSOLIDATION_PARTIAL_FAILURE',
            consolidationId,
            at: new Date().toISOString(),
          },
        };
        await this.subRepo.save(sub);
      }
      throw new ConflictException('A regularização não foi concluída integralmente no Asaas. O sistema registrou a ocorrência para reconciliação; revise as cobranças antes de repetir.');
    }

    target.amount = total.toFixed(2);
    target.dueDate = dueDate;
    target.invoiceUrl = updated?.invoiceUrl || target.invoiceUrl;
    target.bankSlipUrl = updated?.bankSlipUrl || target.bankSlipUrl;
    target.metadata = {
      ...(target.metadata || {}),
      debtConsolidationId: consolidationId,
      debtConsolidationPartial: false,
      originalInvoices: original,
      description: `Regularização de ${eligible.length} cobrança(s) vencida(s)`,
    };
    await this.invoiceRepo.save(target);
    for (const invoice of deleted) {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.metadata = { ...(invoice.metadata || {}), debtConsolidationId: consolidationId, replacedBy: target.externalId };
      await this.invoiceRepo.save(invoice);
    }

    await this.lifecycle.record({
      unitId,
      subscriptionId: sub.id,
      personId: sub.primaryPersonId,
      type: 'debt.consolidated',
      actorUserId: actor.id,
      source: LifecycleSource.API,
      metadata: {
        consolidationId,
        invoiceCount: eligible.length,
        total,
        dueDate,
        targetPaymentId: target.externalId,
      },
    });

    return {
      success: true,
      consolidationId,
      total,
      dueDate,
      payment: {
        id: target.externalId,
        value: total,
        dueDate,
        invoiceUrl: target.invoiceUrl,
        bankSlipUrl: target.bankSlipUrl,
      },
    };
  }

  async createPayment(unitId: string, reference: string, dto: CreatePaymentDto) {
    const sub = await this.resolve(unitId, reference);
    const customer = await this.customerRepo.findOne({ where: { unitId, personId: sub.primaryPersonId } });
    if (!customer) throw new BadRequestException('Cliente financeiro não encontrado.');
    const result = await this.asaas.createPayment(unitId, {
      customer: customer.externalId,
      billingType: dto.billingType,
      value: dto.value,
      dueDate: dto.dueDate,
      description: dto.description || 'Cobrança avulsa',
      externalReference: sub.id,
    });
    const invoice = await this.invoiceRepo.save(this.invoiceRepo.create({
      unitId,
      subscriptionId: sub.id,
      billingCustomerId: customer.id,
      externalId: result.id,
      status: InvoiceStatus.PENDING,
      dueDate: dto.dueDate,
      amount: dto.value.toFixed(2),
      paidAmount: '0',
      paidAt: null,
      invoiceUrl: result.invoiceUrl || null,
      bankSlipUrl: result.bankSlipUrl || null,
      pixPayload: null,
      metadata: { billingType: dto.billingType, description: dto.description || 'Cobrança avulsa' },
    }));
    if (dto.billingType === BillingType.PIX) {
      const pix = await this.asaas.pixQrCode(unitId, result.id);
      invoice.pixPayload = pix.payload || null;
      await this.invoiceRepo.save(invoice);
      return { ...result, pixQrCode: pix };
    }
    return result;
  }

  async markPastDue(
    sub: Subscription,
    input: { paymentId?: string | null; correlationId?: string | null; source?: LifecycleSource } = {},
  ) {
    const now = new Date();
    const graceDays = await this.graceDays(sub);
    const existingSince = sub.metadata?.pastDueSince ? new Date(sub.metadata.pastDueSince) : now;
    const suspensionDueAt = new Date(existingSince.getTime() + graceDays * 86_400_000);
    sub.metadata = {
      ...(sub.metadata || {}),
      pastDueSince: existingSince.toISOString(),
      suspensionDueAt: suspensionDueAt.toISOString(),
      delinquencyGraceDays: graceDays,
      lastOverduePaymentId: input.paymentId || sub.metadata?.lastOverduePaymentId || null,
    };
    await this.subRepo.save(sub);
    if ([SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING_PAYMENT].includes(sub.status)) {
      await this.transition(sub, SubscriptionStatus.PAST_DUE, {
        source: input.source || LifecycleSource.SYSTEM,
        reasonCode: 'PAYMENT_OVERDUE',
        correlationId: input.correlationId || null,
        metadata: { paymentId: input.paymentId || null, graceDays, suspensionDueAt: suspensionDueAt.toISOString() },
      });
    }
    return sub;
  }

  async recoverIfCurrent(sub: Subscription, correlationId?: string | null, source = LifecycleSource.SYSTEM) {
    const overdueCount = await this.invoiceRepo.count({
      where: { unitId: sub.unitId, subscriptionId: sub.id, status: InvoiceStatus.OVERDUE },
    });
    if (overdueCount > 0) {
      if ([SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING_PAYMENT].includes(sub.status)) {
        await this.markPastDue(sub, { correlationId, source });
      }
      return { recovered: false, overdueCount, reason: 'OVERDUE_INVOICES' };
    }

    if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.PENDING_PAYMENT].includes(sub.status)) {
      const paidEvidence = await this.invoiceRepo.findOne({
        where: {
          unitId: sub.unitId,
          subscriptionId: sub.id,
          status: In([InvoiceStatus.CONFIRMED, InvoiceStatus.RECEIVED]),
        },
        order: { paidAt: 'DESC' },
      });
      const paidAt = paidEvidence?.paidAt ? new Date(paidEvidence.paidAt).getTime() : null;
      const delinquencyStartedAt = sub.metadata?.pastDueSince
        ? new Date(sub.metadata.pastDueSince).getTime()
        : null;
      const hasCurrentPaymentEvidence = Boolean(
        paidAt
        && (!delinquencyStartedAt || paidAt >= delinquencyStartedAt),
      );
      if (!hasCurrentPaymentEvidence) {
        return { recovered: false, overdueCount: 0, reason: 'PAYMENT_CONFIRMATION_REQUIRED' };
      }

      await this.transition(sub, SubscriptionStatus.ACTIVE, {
        source,
        reasonCode: sub.status === SubscriptionStatus.PENDING_PAYMENT ? 'FIRST_PAYMENT_CONFIRMED' : 'PAYMENT_RECOVERED',
        correlationId,
        metadata: { paymentId: paidEvidence?.externalId || null },
      });
    }
    return { recovered: true, overdueCount: 0 };
  }

  async enforceDelinquencyGrace() {
    const subs = await this.subRepo.find({ where: { status: SubscriptionStatus.PAST_DUE } });
    let suspended = 0;
    let pending = 0;
    const now = Date.now();
    for (const sub of subs) {
      const dueAt = sub.metadata?.suspensionDueAt ? new Date(sub.metadata.suspensionDueAt).getTime() : null;
      if (!dueAt) {
        await this.markPastDue(sub);
        pending++;
        continue;
      }
      if (dueAt > now) {
        pending++;
        continue;
      }
      const overdueCount = await this.invoiceRepo.count({
        where: { unitId: sub.unitId, subscriptionId: sub.id, status: InvoiceStatus.OVERDUE },
      });
      if (overdueCount === 0) {
        const recovery = await this.recoverIfCurrent(sub, null, LifecycleSource.RECONCILIATION);
        if (!recovery.recovered) pending++;
        continue;
      }
      await this.transition(sub, SubscriptionStatus.SUSPENDED, {
        source: LifecycleSource.SYSTEM,
        reasonCode: 'DELINQUENCY_GRACE_EXPIRED',
        metadata: { overdueCount, suspensionDueAt: sub.metadata?.suspensionDueAt },
      });
      suspended++;
    }
    return { checked: subs.length, suspended, pending };
  }

  async syncStatus(unitId: string) {
    const subs = await this.subRepo.find({ where: { unitId } });
    let active = 0;
    let delinquent = 0;
    let inactive = 0;
    let pending = 0;
    let errors = 0;
    for (const sub of subs) {
      if (!sub.externalSubscriptionId) {
        if (sub.status === SubscriptionStatus.ACTIVE) active++;
        else if (sub.status === SubscriptionStatus.PENDING_PAYMENT) pending++;
        else if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status)) delinquent++;
        else inactive++;
        continue;
      }
      try {
        const external = await this.asaas.getSubscription(unitId, sub.externalSubscriptionId);
        if (['EXPIRED', 'INACTIVE'].includes(external.status) && sub.status !== SubscriptionStatus.SUSPENDED) {
          if (sub.status !== SubscriptionStatus.CANCELLED) {
            await this.transition(sub, SubscriptionStatus.EXPIRED, {
              source: LifecycleSource.RECONCILIATION,
              reasonCode: 'PROVIDER_STATUS',
            });
          }
          inactive++;
          continue;
        }
        const overdue = await this.asaas.subscriptionPayments(unitId, sub.externalSubscriptionId, 'OVERDUE', 100);
        if ((overdue.totalCount || overdue.data?.length || 0) > 0) {
          await this.markPastDue(sub, { source: LifecycleSource.RECONCILIATION });
          const dueAt = sub.metadata?.suspensionDueAt ? new Date(sub.metadata.suspensionDueAt).getTime() : null;
          if (dueAt && dueAt <= Date.now() && sub.status === SubscriptionStatus.PAST_DUE) {
            await this.transition(sub, SubscriptionStatus.SUSPENDED, {
              source: LifecycleSource.RECONCILIATION,
              reasonCode: 'DELINQUENCY_GRACE_EXPIRED',
            });
          }
          delinquent++;
        } else {
          await this.recoverIfCurrent(sub, null, LifecycleSource.RECONCILIATION);
          if (sub.status === SubscriptionStatus.ACTIVE) active++;
          else if (sub.status === SubscriptionStatus.PENDING_PAYMENT) pending++;
          else if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status)) delinquent++;
          else inactive++;
        }
      } catch {
        errors++;
        if (sub.status === SubscriptionStatus.ACTIVE) active++;
        else if (sub.status === SubscriptionStatus.PENDING_PAYMENT) pending++;
        else if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status)) delinquent++;
        else inactive++;
      }
    }
    return { active, pending, delinquent, inactive, errors };
  }

  private assertDirectMemberChangeAllowed(terms: ContractTerms, action: 'add' | 'remove') {
    if (terms.customerType !== CustomerType.PERSON) return;
    if (terms.cycle === BillingCycle.YEARLY && action === 'add') {
      throw new ConflictException('Novos dependentes não podem ser incluídos diretamente durante a vigência anual. Faça a alteração pela renovação/aditivo contratual.');
    }
    if (terms.contractId) {
      throw new ConflictException('Alterações de dependentes que impactam o preço devem ser feitas por aditivo/renovação no fluxo contratual da oportunidade.');
    }
    throw new ConflictException('A assinatura não possui fluxo contratual suficiente para alterar dependentes com segurança. Faça uma alteração contratual antes de mudar a composição do plano.');
  }

  private async currentContract(sub: Subscription) {
    const contractId = sub.metadata?.contractId || null;
    if (contractId) {
      const byId = await this.contractRepo.findOne({ where: { unitId: sub.unitId, id: contractId } });
      if (byId) return byId;
    }
    if (!sub.sourceOpportunityId) return null;
    return this.contractRepo.findOne({
      where: { unitId: sub.unitId, opportunityId: sub.sourceOpportunityId, status: ContractStatus.ACCEPTED },
      order: { version: 'DESC' },
    });
  }

  private async contractTerms(sub: Subscription): Promise<ContractTerms> {
    const snapshot = sub.metadata?.negotiationSnapshot || {};
    const price = sub.planPriceId
      ? await this.priceRepo.findOne({ where: { unitId: sub.unitId, id: sub.planPriceId } })
      : null;
    const customerType = (snapshot.customerType || sub.metadata?.customerType || CustomerType.PERSON) === CustomerType.COMPANY
      ? CustomerType.COMPANY
      : CustomerType.PERSON;
    const rawCycle = snapshot.cycle || sub.metadata?.billingCycle || price?.billingCycle || null;
    const cycle = rawCycle && Object.values(BillingCycle).includes(rawCycle as BillingCycle) ? rawCycle as BillingCycle : null;
    const rawBillingType = sub.metadata?.billingType
      || snapshot.billingType
      || snapshot.allowedBillingTypes?.[0]
      || price?.billingType
      || null;
    const billingType = rawBillingType && Object.values(BillingType).includes(rawBillingType as BillingType)
      ? rawBillingType as BillingType
      : null;
    const rawAmount = snapshot.pricing?.finalAmount ?? sub.metadata?.contractedAmount ?? price?.amount ?? null;
    const recurringAmount = rawAmount !== null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null;
    const contractedLivesRaw = sub.metadata?.contractedLives ?? snapshot.participants?.contractedLives ?? null;
    const contractedDependentsRaw = snapshot.participants?.dependentCount ?? null;
    return {
      snapshot,
      customerType,
      cycle,
      billingType,
      recurringAmount,
      contractedLives: contractedLivesRaw === null ? null : Number(contractedLivesRaw),
      contractedDependents: contractedDependentsRaw === null ? null : Number(contractedDependentsRaw),
      contractId: sub.metadata?.contractId || null,
    };
  }

  private async graceDays(sub: Subscription) {
    let planGrace: number | null = null;
    if (sub.planPriceId) {
      const price = await this.priceRepo.findOne({ where: { unitId: sub.unitId, id: sub.planPriceId } });
      if (price) {
        const plan = await this.planRepo.findOne({ where: { unitId: sub.unitId, id: price.planId } });
        const candidate = Number(plan?.metadata?.delinquencyGraceDays);
        if (Number.isFinite(candidate) && candidate >= 0) planGrace = candidate;
      }
    }
    if (planGrace !== null) return Math.min(planGrace, 90);
    const unit = await this.unitRepo.findOne({ where: { id: sub.unitId } });
    const unitCandidate = Number(unit?.settings?.delinquencyGraceDays ?? unit?.settings?.billing?.delinquencyGraceDays);
    if (Number.isFinite(unitCandidate) && unitCandidate >= 0) return Math.min(unitCandidate, 90);
    const envCandidate = Number(process.env.SUBSCRIPTION_DELINQUENCY_GRACE_DAYS ?? 5);
    return Number.isFinite(envCandidate) ? Math.max(0, Math.min(envCandidate, 90)) : 5;
  }

  private plusDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().slice(0, 10);
  }
}
