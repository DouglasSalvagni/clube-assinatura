import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  AccessStatus, BillingCustomer, BillingType, FinancialStatus, Invoice, InvoiceStatus,
  LifecycleSource, MemberRole, Person, PlanPrice, Subscription, SubscriptionMember,
  SubscriptionMemberStatus, SubscriptionStatus, User,
} from '../../database/entities';
import { AsaasClient } from '../billing/asaas.client';
import { BillingService } from '../billing/billing.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { CancelSubscriptionDto, CreateDependentDto, CreatePaymentDto, UpdateDependentDto, UpdatePrimaryDto } from './subscriptions.dto';

import { isValidCpf, normalizeTaxId } from '../../common/utils/tax-id';
import { canTransitionSubscription } from './subscription-state-machine';
@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionMember) private readonly memberRepo: Repository<SubscriptionMember>,
    @InjectRepository(Person) private readonly personRepo: Repository<Person>,
    @InjectRepository(PlanPrice) private readonly priceRepo: Repository<PlanPrice>,
    @InjectRepository(BillingCustomer) private readonly customerRepo: Repository<BillingCustomer>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly asaas: AsaasClient,
    private readonly billing: BillingService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async transition(subscription: Subscription, to: SubscriptionStatus, input: { actorUserId?: string | null; source?: LifecycleSource; reasonCode?: string | null; correlationId?: string | null; metadata?: Record<string, any> } = {}): Promise<Subscription> {
    const from = subscription.status;
    if (from === to) return subscription;
    if (!canTransitionSubscription(from, to)) throw new BadRequestException(`Transição inválida de ${from} para ${to}.`);
    subscription.status = to;
    if (to === SubscriptionStatus.ACTIVE) {
      subscription.financialStatus = FinancialStatus.CURRENT;
      subscription.accessStatus = AccessStatus.ENABLED;
      subscription.startedAt ||= new Date();
      subscription.firstActiveAt ||= new Date();
      if ([SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED].includes(from)) subscription.lastReactivatedAt = new Date();
      subscription.cancelledAt = null;
      subscription.cancellationScheduledAt = null;
    }
    if (to === SubscriptionStatus.PAST_DUE) { subscription.financialStatus = FinancialStatus.OVERDUE; subscription.accessStatus = AccessStatus.RESTRICTED; }
    if (to === SubscriptionStatus.SUSPENDED) { subscription.financialStatus = FinancialStatus.BLOCKED; subscription.accessStatus = AccessStatus.DISABLED; }
    if ([SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED].includes(to)) { subscription.cancelledAt = new Date(); subscription.accessStatus = AccessStatus.DISABLED; }
    await this.subRepo.save(subscription);
    await this.lifecycle.record({ unitId: subscription.unitId, subscriptionId: subscription.id, personId: subscription.primaryPersonId, type: `subscription.${to.toLowerCase()}`, fromStatus: from, toStatus: to, actorUserId: input.actorUserId, source: input.source, reasonCode: input.reasonCode, correlationId: input.correlationId, metadata: input.metadata });
    return subscription;
  }

  async listLives(unitIds: string[] | null, query: { page: number; limit: number; search?: string; status?: string; subscription?: string; estado?: string }) {
    const qb = this.subRepo.createQueryBuilder('subscription');
    if (unitIds) qb.where('subscription.unit_id IN (:...unitIds)', { unitIds });
    if (query.status) {
      const map: Record<string, SubscriptionStatus[]> = { ACTIVE: [SubscriptionStatus.ACTIVE], DELINQUENT: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED], INACTIVE: [SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED] };
      qb.andWhere('subscription.status IN (:...statuses)', { statuses: map[query.status] || [query.status] });
    }
    const subscriptions = await qb.orderBy('subscription.created_at', 'DESC').getMany();
    const members = subscriptions.length ? await this.memberRepo.find({ where: { subscriptionId: In(subscriptions.map((s) => s.id)) } }) : [];
    const people = members.length ? await this.personRepo.find({ where: { id: In([...new Set(members.map((m) => m.personId))]) } }) : [];
    let rows = members.map((member) => {
      const sub = subscriptions.find((item) => item.id === member.subscriptionId)!;
      const person = people.find((item) => item.id === member.personId)!;
      return this.lifeRow(sub, member, person);
    }).filter((row) => row.nome);
    if (query.search) { const search = query.search.toLowerCase(); const digits = query.search.replace(/\D/g, ''); rows = rows.filter((row) => row.nome.toLowerCase().includes(search) || row.email?.toLowerCase().includes(search) || (digits && row.cpf.includes(digits))); }
    if (query.estado) rows = rows.filter((row) => row.estado === query.estado);
    if (query.subscription === 'titular') rows = rows.filter((row) => row.tipo === 'Titular');
    if (query.subscription === 'dependente') rows = rows.filter((row) => row.tipo === 'Dependente');
    const allRows = rows;
    const total = allRows.length;
    rows = allRows.slice((query.page - 1) * query.limit, query.page * query.limit);
    const count = (status: string, tipo?: string) => allRows.filter((row) => row.status === status && (!tipo || row.tipo === tipo)).length;
    return {
      data: rows, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit),
      ativos: count('ACTIVE'), inadimplentes: count('DELINQUENT'), inativos: count('INACTIVE'),
      ativosTit: count('ACTIVE', 'Titular'), ativosDep: count('ACTIVE', 'Dependente'),
      inadTit: count('DELINQUENT', 'Titular'), inadDep: count('DELINQUENT', 'Dependente'),
      inatTit: count('INACTIVE', 'Titular'), inatDep: count('INACTIVE', 'Dependente'),
      totalTit: allRows.filter((row) => row.tipo === 'Titular').length, totalDep: allRows.filter((row) => row.tipo === 'Dependente').length,
      estados: [...new Set(allRows.map((row) => row.estado).filter(Boolean))].sort(),
    };
  }

  private lifeRow(sub: Subscription, member: SubscriptionMember, person: Person) {
    const status = sub.status === SubscriptionStatus.ACTIVE ? 'ACTIVE' : [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status) ? 'DELINQUENT' : 'INACTIVE';
    return { id: member.id, asaas_id: sub.id, subscriptionId: sub.id, nome: person?.name || '', cpf: person?.taxId || '', telefone: person?.phone || '', email: person?.email || '', data_nascimento: person?.birthDate || '', cidade: person?.city || '', estado: person?.state || '', status, tipo: member.role === MemberRole.PRIMARY ? 'Titular' : 'Dependente' };
  }

  async resolve(unitId: string, reference: string): Promise<Subscription> {
    let sub = await this.subRepo.findOne({ where: [{ unitId, id: reference }, { unitId, externalSubscriptionId: reference }] });
    if (!sub) {
      const customer = await this.customerRepo.findOne({ where: { unitId, externalId: reference } });
      if (customer) sub = await this.subRepo.findOne({ where: { unitId, primaryPersonId: customer.personId }, order: { createdAt: 'DESC' } });
    }
    if (!sub) throw new NotFoundException('Assinatura não encontrada.');
    return sub;
  }

  async detail(unitId: string, reference: string) {
    const sub = await this.resolve(unitId, reference);
    const members = await this.memberRepo.find({ where: { unitId, subscriptionId: sub.id, status: SubscriptionMemberStatus.ACTIVE }, order: { joinedAt: 'ASC' } });
    const people = members.length ? await this.personRepo.find({ where: { unitId, id: In(members.map((m) => m.personId)) } }) : [];
    const primaryMember = members.find((m) => m.role === MemberRole.PRIMARY);
    const primary = people.find((p) => p.id === primaryMember?.personId);
    if (!primary) throw new NotFoundException('Titular da assinatura não encontrado.');
    const status = sub.status === SubscriptionStatus.ACTIVE ? 'ACTIVE' : [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status) ? 'DELINQUENT' : 'INACTIVE';
    return {
      titular: { id: primary.id, nome: primary.name, email: primary.email, telefone: primary.phone, cpfCnpj: primary.taxId, endereco: primary.address, enderecoNumero: primary.addressNumber, complemento: primary.complement, bairro: primary.district, cidade: primary.city, estado: primary.state, cep: primary.postalCode, status, cycle: await this.cycle(sub) },
      dependentes: members.filter((m) => m.role === MemberRole.DEPENDENT).map((m) => { const p = people.find((x) => x.id === m.personId)!; return { id: m.id, personId: p.id, nome: p.name, cpf: p.taxId, telefone: p.phone, email: p.email, dataNascimento: p.birthDate, endereco: p.address, bairro: p.district, cidade: p.city, estado: p.state, cep: p.postalCode, status: m.status === SubscriptionMemberStatus.ACTIVE ? 'ACTIVE' : 'INACTIVE' }; }),
      subscription: sub,
    };
  }

  private async cycle(sub: Subscription): Promise<string | null> { if (!sub.planPriceId) return null; return (await this.priceRepo.findOne({ where: { id: sub.planPriceId } }))?.billingCycle || null; }

  async updatePrimary(unitId: string, reference: string, dto: UpdatePrimaryDto) {
    const sub = await this.resolve(unitId, reference);
    const person = await this.personRepo.findOne({ where: { unitId, id: sub.primaryPersonId } });
    if (!person) throw new NotFoundException('Titular não encontrado.');
    const before = { ...person };
    const mapping: Record<string, keyof Person> = { nome: 'name', email: 'email', telefone: 'phone', endereco: 'address', enderecoNumero: 'addressNumber', complemento: 'complement', bairro: 'district', cidade: 'city', estado: 'state', cep: 'postalCode' };
    for (const [key, value] of Object.entries(dto)) if (value !== undefined) (person as any)[mapping[key]] = value;
    const customer = await this.customerRepo.findOne({ where: { unitId, personId: person.id } });
    if (customer) await this.asaas.updateCustomer(unitId, customer.externalId, { name: person.name, email: person.email, mobilePhone: person.phone, address: person.address, addressNumber: person.addressNumber, complement: person.complement, province: person.district, postalCode: person.postalCode, state: person.state });
    return this.personRepo.save(person);
  }

  async addDependent(unitId: string, reference: string, dto: CreateDependentDto) {
    const sub = await this.resolve(unitId, reference);
    const taxId = normalizeTaxId(dto.cpf);
    if (!isValidCpf(taxId)) throw new BadRequestException('CPF inválido.');
    if (await this.personRepo.exists({ where: { unitId, taxId } })) throw new ConflictException('CPF já cadastrado na unidade.');

    const activeDependents = await this.memberRepo.count({
      where: {
        unitId,
        subscriptionId: sub.id,
        role: MemberRole.DEPENDENT,
        status: SubscriptionMemberStatus.ACTIVE,
      },
    });
    const snapshot = sub.metadata?.negotiationSnapshot || {};
    const customerType = snapshot.customerType;
    const contractedLives = Number(sub.metadata?.contractedLives || snapshot.participants?.contractedLives || 0);
    const maxDependents = Number(snapshot.limits?.maxDependents ?? snapshot.participants?.maxDependents ?? 0);
    if (customerType === 'COMPANY' && contractedLives > 0 && activeDependents >= contractedLives) {
      throw new ConflictException(`O contrato permite no máximo ${contractedLives} beneficiários ativos.`);
    }
    if (customerType === 'PERSON' && maxDependents > 0 && activeDependents >= maxDependents) {
      throw new ConflictException(`O contrato permite no máximo ${maxDependents} dependentes ativos.`);
    }

    const person = await this.personRepo.save(this.personRepo.create({ unitId, kind: 'PERSON' as any, name: dto.nome, taxId, phone: dto.telefone || null, email: dto.email || null, whatsapp: null, birthDate: dto.dataNascimento || null, address: null, addressNumber: null, complement: null, district: null, city: null, state: null, postalCode: null, metadata: {} }));
    const member = await this.memberRepo.save(this.memberRepo.create({ unitId, subscriptionId: sub.id, personId: person.id, role: MemberRole.DEPENDENT, status: SubscriptionMemberStatus.ACTIVE, joinedAt: new Date(), leftAt: null, relationship: dto.relationship || null }));
    await this.lifecycle.record({ unitId, subscriptionId: sub.id, personId: person.id, type: 'member.added', source: LifecycleSource.API });
    return { id: member.id, nome: person.name, cpf: person.taxId };
  }

  async updateDependent(unitId: string, reference: string, memberId: string, dto: UpdateDependentDto) {
    const sub = await this.resolve(unitId, reference);
    const member = await this.memberRepo.findOne({ where: { unitId, subscriptionId: sub.id, id: memberId, role: MemberRole.DEPENDENT } });
    if (!member) throw new NotFoundException('Dependente não encontrado.');
    const person = await this.personRepo.findOneByOrFail({ id: member.personId, unitId });
    if (dto.nome !== undefined) person.name = dto.nome;
    if (dto.cpf !== undefined) person.taxId = dto.cpf;
    if (dto.telefone !== undefined) person.phone = dto.telefone;
    if (dto.email !== undefined) person.email = dto.email;
    if (dto.dataNascimento !== undefined) person.birthDate = dto.dataNascimento;
    if (dto.relationship !== undefined) member.relationship = dto.relationship;
    await this.memberRepo.save(member);
    await this.personRepo.save(person);
    return { id: member.id, nome: person.name, cpf: person.taxId };
  }

  async removeDependent(unitId: string, reference: string, memberId: string, actorUserId?: string) {
    const sub = await this.resolve(unitId, reference);
    const member = await this.memberRepo.findOne({ where: { unitId, subscriptionId: sub.id, id: memberId, role: MemberRole.DEPENDENT } });
    if (!member) throw new NotFoundException('Dependente não encontrado.');
    member.status = SubscriptionMemberStatus.INACTIVE; member.leftAt = new Date(); await this.memberRepo.save(member);
    await this.lifecycle.record({ unitId, subscriptionId: sub.id, personId: member.personId, type: 'member.removed', actorUserId, source: LifecycleSource.API });
  }

  async cancel(unitId: string, reference: string, dto: CancelSubscriptionDto, actor: User) {
    const sub = await this.resolve(unitId, reference);
    if (sub.externalSubscriptionId) await this.asaas.deleteSubscription(unitId, sub.externalSubscriptionId);
    sub.cancellationReasonCode = dto.reasonCode || 'OTHER'; sub.cancellationReasonText = dto.reason;
    await this.transition(sub, SubscriptionStatus.CANCELLED, { actorUserId: actor.id, source: LifecycleSource.API, reasonCode: sub.cancellationReasonCode, metadata: { reason: dto.reason } });
    return { success: true };
  }

  async reactivate(unitId: string, reference: string, actor: User) {
    const sub = await this.resolve(unitId, reference);
    if (![SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED].includes(sub.status)) throw new BadRequestException('A assinatura não está em um estado reativável.');
    const customer = await this.customerRepo.findOne({ where: { unitId, personId: sub.primaryPersonId } });
    const price = sub.planPriceId ? await this.priceRepo.findOne({ where: { unitId, id: sub.planPriceId } }) : null;
    if (customer && price && sub.status !== SubscriptionStatus.SUSPENDED) {
      const nextDueDate = new Date(); nextDueDate.setDate(nextDueDate.getDate() + 1);
      const result = await this.asaas.createSubscription(unitId, { customer: customer.externalId, billingType: price.billingType === BillingType.UNDEFINED ? 'BOLETO' : price.billingType, value: Number(price.amount), nextDueDate: nextDueDate.toISOString().slice(0, 10), cycle: price.billingCycle, description: 'Reativação de assinatura', externalReference: sub.id });
      sub.externalSubscriptionId = result.id;
    }
    await this.transition(sub, SubscriptionStatus.ACTIVE, { actorUserId: actor.id, source: LifecycleSource.API, reasonCode: 'REACTIVATED' });
    return { success: true, subscriptionId: sub.id, externalSubscriptionId: sub.externalSubscriptionId };
  }

  async invoices(unitId: string, reference: string, limit = 20, offset = 0) {
    const sub = await this.resolve(unitId, reference);
    const [local, total] = await this.invoiceRepo.findAndCount({ where: { unitId, subscriptionId: sub.id }, order: { dueDate: 'DESC' }, take: limit, skip: offset });
    return { data: local.map((invoice) => ({ id: invoice.externalId || invoice.id, dueDate: invoice.dueDate, value: Number(invoice.amount), status: invoice.status, description: invoice.metadata?.description || '', bankSlipUrl: invoice.bankSlipUrl, invoiceUrl: invoice.invoiceUrl, transactionReceiptUrl: invoice.metadata?.transactionReceiptUrl || null, billingType: invoice.metadata?.billingType || 'UNDEFINED' })), totalCount: total };
  }

  async createPayment(unitId: string, reference: string, dto: CreatePaymentDto) {
    const sub = await this.resolve(unitId, reference);
    const customer = await this.customerRepo.findOne({ where: { unitId, personId: sub.primaryPersonId } });
    if (!customer) throw new BadRequestException('Cliente financeiro não encontrado.');
    const result = await this.asaas.createPayment(unitId, { customer: customer.externalId, billingType: dto.billingType, value: dto.value, dueDate: dto.dueDate, description: dto.description || 'Cobrança avulsa', externalReference: sub.id });
    const invoice = await this.invoiceRepo.save(this.invoiceRepo.create({ unitId, subscriptionId: sub.id, billingCustomerId: customer.id, externalId: result.id, status: InvoiceStatus.PENDING, dueDate: dto.dueDate, amount: dto.value.toFixed(2), paidAmount: '0', paidAt: null, invoiceUrl: result.invoiceUrl || null, bankSlipUrl: result.bankSlipUrl || null, pixPayload: null, metadata: { billingType: dto.billingType, description: dto.description || 'Cobrança avulsa' } }));
    if (dto.billingType === BillingType.PIX) { const pix = await this.asaas.pixQrCode(unitId, result.id); invoice.pixPayload = pix.payload || null; await this.invoiceRepo.save(invoice); return { ...result, pixQrCode: pix }; }
    return result;
  }

  async syncStatus(unitId: string) {
    const subs = await this.subRepo.find({ where: { unitId } }); let active = 0, delinquent = 0, inactive = 0, errors = 0;
    for (const sub of subs) {
      if (!sub.externalSubscriptionId) { if (sub.status === SubscriptionStatus.ACTIVE) active++; else inactive++; continue; }
      try {
        const external = await this.asaas.getSubscription(unitId, sub.externalSubscriptionId);
        if (['EXPIRED', 'INACTIVE'].includes(external.status)) { if (sub.status !== SubscriptionStatus.CANCELLED) await this.transition(sub, SubscriptionStatus.EXPIRED, { source: LifecycleSource.RECONCILIATION, reasonCode: 'PROVIDER_STATUS' }); inactive++; continue; }
        const overdue = await this.asaas.subscriptionPayments(unitId, sub.externalSubscriptionId, 'OVERDUE', 1);
        if ((overdue.totalCount || overdue.data?.length || 0) > 0) { if (sub.status === SubscriptionStatus.ACTIVE) await this.transition(sub, SubscriptionStatus.PAST_DUE, { source: LifecycleSource.RECONCILIATION }); delinquent++; }
        else { if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status)) await this.transition(sub, SubscriptionStatus.ACTIVE, { source: LifecycleSource.RECONCILIATION, reasonCode: 'PAYMENT_RECOVERED' }); active++; }
      } catch { errors++; if (sub.status === SubscriptionStatus.ACTIVE) active++; else if ([SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(sub.status)) delinquent++; else inactive++; }
    }
    return { active, delinquent, inactive, errors };
  }
}
