import { createHash } from 'crypto';
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import {
  BillingCustomer, CheckoutSession, CheckoutStatus, CommercialStatus, FinancialStatus, Invoice, InvoiceStatus,
  CustomerType, LifecycleSource, Opportunity, OpportunityStatus, Payment, PaymentStatus, PrecheckoutSession, PrecheckoutStatus,
  Subscription, SubscriptionStatus, Unit, WebhookEvent, WebhookStatus,
} from '../../database/entities';
import { BillingService } from '../billing/billing.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Unit) private readonly unitRepo: Repository<Unit>,
    @InjectRepository(WebhookEvent) private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(BillingCustomer) private readonly customerRepo: Repository<BillingCustomer>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(CheckoutSession) private readonly checkoutRepo: Repository<CheckoutSession>,
    @InjectRepository(PrecheckoutSession) private readonly precheckoutRepo: Repository<PrecheckoutSession>,
    @InjectRepository(Opportunity) private readonly opportunityRepo: Repository<Opportunity>,
    @InjectQueue('billing-webhooks') private readonly queue: Queue,
    private readonly billing: BillingService,
    private readonly opportunities: OpportunitiesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async receive(slug: string, payload: any, headers: Record<string, any>) {
    const unit = await this.unitRepo.findOne({ where: { slug, active: true } });
    if (!unit) throw new UnauthorizedException('Unidade não encontrada.');
    const token = String(headers['asaas-access-token'] || headers['x-webhook-token'] || '');
    if (!(await this.billing.verifyWebhookSecret(unit.id, token))) throw new UnauthorizedException('Token de webhook inválido.');
    const eventType = String(payload?.event || 'UNKNOWN');
    const providerEventId = payload?.id ? String(payload.id) : null;
    const deduplicationKey = createHash('sha256').update(providerEventId || JSON.stringify(payload)).digest('hex');
    let event = await this.eventRepo.findOne({ where: { unitId: unit.id, deduplicationKey } });
    if (event) {
      if (event.status === WebhookStatus.RECEIVED) await this.enqueue(event);
      return { accepted: true, duplicate: true, eventId: event.id, status: event.status };
    }
    event = await this.eventRepo.save(this.eventRepo.create({
      unitId: unit.id, provider: 'ASAAS' as any, providerEventId, deduplicationKey, eventType,
      status: WebhookStatus.RECEIVED, payload, headers: this.safeHeaders(headers), attempts: 0,
      nextRetryAt: null, processedAt: null, error: null,
    }));
    await this.enqueue(event);
    return { accepted: true, duplicate: false, eventId: event.id };
  }

  async list(unitIds: string[] | null, status?: WebhookStatus, page = 1, limit = 30) {
    const where: any = {};
    if (unitIds) where.unitId = In(unitIds);
    if (status) where.status = status;
    const [data, total] = await this.eventRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 100),
    });
    return { data, total, page, limit: Math.min(limit, 100), totalPages: Math.ceil(total / Math.min(limit, 100)) };
  }

  async retry(unitId: string, eventId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId, unitId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.status === WebhookStatus.PROCESSING) throw new ConflictException('O evento está sendo processado.');

    const existingJob = await this.queue.getJob(event.id);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'active') throw new ConflictException('O evento está sendo processado.');
      await existingJob.remove();
    }

    event.status = WebhookStatus.RECEIVED;
    event.attempts = 0;
    event.error = null;
    event.processedAt = null;
    event.nextRetryAt = null;
    await this.eventRepo.save(event);
    await this.enqueue(event);
    return { success: true, eventId: event.id };
  }

  private async enqueue(event: WebhookEvent) {
    await this.queue.add('process', { eventId: event.id }, {
      jobId: event.id,
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    event.status = WebhookStatus.QUEUED;
    event.nextRetryAt = null;
    await this.eventRepo.save(event);
  }

  async process(eventId: string): Promise<{ processed: boolean; ignored?: boolean }> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if ([WebhookStatus.PROCESSED, WebhookStatus.IGNORED].includes(event.status)) return { processed: true, ignored: event.status === WebhookStatus.IGNORED };
    event.status = WebhookStatus.PROCESSING; event.attempts += 1; event.error = null; await this.eventRepo.save(event);
    try {
      const handled = await this.dispatch(event);
      event.status = handled ? WebhookStatus.PROCESSED : WebhookStatus.IGNORED;
      event.processedAt = new Date(); event.nextRetryAt = null; await this.eventRepo.save(event);
      return { processed: true, ignored: !handled };
    } catch (error: any) {
      event.status = event.attempts >= 8 ? WebhookStatus.DEAD_LETTER : WebhookStatus.FAILED;
      event.error = String(error?.message || error).slice(0, 4000);
      event.nextRetryAt = event.status === WebhookStatus.FAILED ? new Date(Date.now() + Math.min(3_600_000, 5_000 * 2 ** event.attempts)) : null;
      await this.eventRepo.save(event);
      throw error;
    }
  }

  private async dispatch(event: WebhookEvent): Promise<boolean> {
    if (event.eventType.startsWith('CHECKOUT_')) return this.checkout(event);
    if (event.eventType.startsWith('PAYMENT_')) return this.payment(event);
    if (event.eventType.startsWith('SUBSCRIPTION_')) return this.subscription(event);
    return false;
  }

  private async checkout(event: WebhookEvent): Promise<boolean> {
    const providerCheckout = event.payload?.checkout;
    const externalId = typeof providerCheckout === 'string'
      ? providerCheckout
      : providerCheckout?.id ? String(providerCheckout.id) : null;
    if (!externalId) return false;

    const checkout = await this.checkoutRepo.findOne({
      where: { unitId: event.unitId, externalId },
    });
    if (!checkout) {
      throw new NotFoundException('Sessão de checkout não encontrada para o evento recebido.');
    }

    const mappedStatus = this.checkoutStatus(event.eventType);
    checkout.status = mappedStatus;
    checkout.payload = {
      ...(checkout.payload || {}),
      lastWebhookEventId: event.id,
      lastWebhookEventType: event.eventType,
      providerStatus: typeof providerCheckout === 'object' ? providerCheckout.status || null : null,
    };
    await this.checkoutRepo.save(checkout);

    const precheckout = await this.precheckoutRepo.findOne({
      where: { unitId: event.unitId, checkoutSessionId: checkout.id },
    });
    if (precheckout) {
      precheckout.status = this.precheckoutStatus(mappedStatus);
      await this.precheckoutRepo.save(precheckout);
    }

    if (mappedStatus === CheckoutStatus.PAID) {
      await this.opportunities.convertByCheckout(event.unitId, externalId, event.payload);
    } else {
      const opportunity = await this.opportunityRepo.findOne({
        where: { unitId: event.unitId, id: checkout.opportunityId },
      });
      if (opportunity) {
        if ([CheckoutStatus.EXPIRED, CheckoutStatus.CANCELLED, CheckoutStatus.FAILED].includes(mappedStatus)) {
          opportunity.status = OpportunityStatus.OPEN;
          opportunity.commercialStatus = opportunity.customerType === CustomerType.COMPANY
            ? CommercialStatus.APPROVED
            : CommercialStatus.NEGOTIATION;
        }
        await this.opportunityRepo.save(opportunity);
      }
    }

    await this.lifecycle.record({
      unitId: event.unitId,
      type: event.eventType.toLowerCase(),
      source: LifecycleSource.WEBHOOK,
      correlationId: event.id,
      metadata: {
        checkoutId: externalId,
        checkoutSessionId: checkout.id,
        opportunityId: checkout.opportunityId,
        status: mappedStatus,
      },
    });
    return true;
  }

  private checkoutStatus(eventType: string): CheckoutStatus {
    const mapping: Record<string, CheckoutStatus> = {
      CHECKOUT_CREATED: CheckoutStatus.PENDING,
      CHECKOUT_PENDING: CheckoutStatus.PENDING,
      CHECKOUT_PAID: CheckoutStatus.PAID,
      CHECKOUT_EXPIRED: CheckoutStatus.EXPIRED,
      CHECKOUT_CANCELLED: CheckoutStatus.CANCELLED,
      CHECKOUT_CANCELED: CheckoutStatus.CANCELLED,
      CHECKOUT_FAILED: CheckoutStatus.FAILED,
    };
    return mapping[eventType] || CheckoutStatus.PENDING;
  }

  private precheckoutStatus(status: CheckoutStatus): PrecheckoutStatus {
    const mapping: Record<CheckoutStatus, PrecheckoutStatus> = {
      [CheckoutStatus.CREATED]: PrecheckoutStatus.ACCEPTED,
      [CheckoutStatus.PENDING]: PrecheckoutStatus.PAYMENT_PENDING,
      [CheckoutStatus.PAID]: PrecheckoutStatus.COMPLETED,
      [CheckoutStatus.EXPIRED]: PrecheckoutStatus.EXPIRED,
      [CheckoutStatus.CANCELLED]: PrecheckoutStatus.CANCELLED,
      [CheckoutStatus.FAILED]: PrecheckoutStatus.FAILED,
    };
    return mapping[status];
  }

  private async payment(event: WebhookEvent): Promise<boolean> {
    const p = event.payload?.payment;
    if (!p?.id) return false;
    const sub = await this.resolveSubscription(event.unitId, p);
    let invoice = await this.invoiceRepo.findOne({ where: { unitId: event.unitId, externalId: p.id } });
    const status = this.invoiceStatus(event.eventType, p.status);
    if (!invoice) invoice = this.invoiceRepo.create({ unitId: event.unitId, subscriptionId: sub?.id || null, billingCustomerId: null, externalId: p.id, status, dueDate: p.dueDate || null, amount: String(p.value || 0), paidAmount: String(p.netValue || p.value || 0), paidAt: null, invoiceUrl: p.invoiceUrl || null, bankSlipUrl: p.bankSlipUrl || null, pixPayload: null, metadata: { billingType: p.billingType, description: p.description, externalReference: p.externalReference } });
    invoice.status = status;
    if (['PAYMENT_CONFIRMED','PAYMENT_RECEIVED'].includes(event.eventType)) { invoice.paidAt = new Date(p.paymentDate || p.confirmedDate || Date.now()); invoice.paidAmount = String(p.netValue || p.value || 0); }
    invoice = await this.invoiceRepo.save(invoice);
    let payment = await this.paymentRepo.findOne({ where: { unitId: event.unitId, externalId: p.id } });
    if (!payment) payment = this.paymentRepo.create({ unitId: event.unitId, invoiceId: invoice.id, externalId: p.id, status: PaymentStatus.PENDING, amount: String(p.value || 0), confirmedAt: null, receivedAt: null, rawPayload: p });
    payment.status = this.paymentStatus(event.eventType); payment.rawPayload = p;
    if (event.eventType === 'PAYMENT_CONFIRMED') payment.confirmedAt = new Date();
    if (event.eventType === 'PAYMENT_RECEIVED') payment.receivedAt = new Date();
    await this.paymentRepo.save(payment);

    if (['PAYMENT_CONFIRMED','PAYMENT_RECEIVED'].includes(event.eventType)) {
      if (p.externalReference) {
        await this.opportunities.convertByExternalReference(event.unitId, p.externalReference, p.subscription || null, event.id);
        await this.completeDirectSubscriptionCheckout(event.unitId, p.externalReference, p);
      }
      if (sub && [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.PENDING_PAYMENT].includes(sub.status)) await this.subscriptions.transition(sub, SubscriptionStatus.ACTIVE, { source: LifecycleSource.WEBHOOK, reasonCode: 'PAYMENT_RECOVERED', correlationId: event.id });
    } else if (event.eventType === 'PAYMENT_OVERDUE' && sub?.status === SubscriptionStatus.ACTIVE) {
      await this.subscriptions.transition(sub, SubscriptionStatus.PAST_DUE, { source: LifecycleSource.WEBHOOK, reasonCode: 'PAYMENT_OVERDUE', correlationId: event.id });
    } else if (event.eventType === 'PAYMENT_REFUNDED') {
      await this.lifecycle.record({ unitId: event.unitId, subscriptionId: sub?.id || null, personId: sub?.primaryPersonId || null, type: 'payment.refunded', source: LifecycleSource.WEBHOOK, correlationId: event.id, metadata: { paymentId: p.id, amount: p.value } });
    }
    return true;
  }

  private async subscription(event: WebhookEvent): Promise<boolean> {
    const external = event.payload?.subscription;
    if (!external?.id) return false;
    let sub = await this.subRepo.findOne({ where: { unitId: event.unitId, externalSubscriptionId: external.id } });
    if (!sub && external.externalReference) {
      sub = await this.opportunities.convertByExternalReference(event.unitId, external.externalReference, external.id, event.id);
    }
    if (!sub) return false;
    if (!sub.externalSubscriptionId) { sub.externalSubscriptionId = external.id; await this.subRepo.save(sub); }
    if (['SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_DELETED'].includes(event.eventType) && ![SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED].includes(sub.status)) {
      await this.subscriptions.transition(sub, SubscriptionStatus.CANCELLED, { source: LifecycleSource.WEBHOOK, reasonCode: event.eventType, correlationId: event.id });
    } else {
      await this.lifecycle.record({ unitId: event.unitId, subscriptionId: sub.id, personId: sub.primaryPersonId, type: event.eventType.toLowerCase(), source: LifecycleSource.WEBHOOK, correlationId: event.id, metadata: { providerStatus: external.status } });
    }
    return true;
  }

  private async completeDirectSubscriptionCheckout(unitId: string, opportunityId: string, payment: any) {
    const checkout = await this.checkoutRepo.findOne({
      where: { unitId, opportunityId, status: CheckoutStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!checkout || checkout.payload?.providerResourceType !== 'SUBSCRIPTION') return;
    if (checkout.externalId && payment.subscription && checkout.externalId !== payment.subscription) return;

    checkout.status = CheckoutStatus.PAID;
    checkout.url = checkout.url || payment.invoiceUrl || payment.bankSlipUrl || null;
    checkout.payload = {
      ...(checkout.payload || {}),
      paymentId: payment.id || checkout.payload?.paymentId || null,
      providerStatus: payment.status || null,
    };
    await this.checkoutRepo.save(checkout);

    const precheckout = await this.precheckoutRepo.findOne({
      where: { unitId, checkoutSessionId: checkout.id },
    });
    if (precheckout) {
      precheckout.status = PrecheckoutStatus.COMPLETED;
      await this.precheckoutRepo.save(precheckout);
    }
  }

  private async resolveSubscription(unitId: string, payment: any): Promise<Subscription | null> {
    if (payment.subscription) {
      const byExternal = await this.subRepo.findOne({ where: { unitId, externalSubscriptionId: payment.subscription } });
      if (byExternal) return byExternal;
    }
    if (payment.externalReference) {
      const byOpportunity = await this.subRepo.findOne({ where: { unitId, sourceOpportunityId: payment.externalReference } });
      if (byOpportunity) return byOpportunity;
    }
    if (payment.customer) {
      const customer = await this.customerRepo.findOne({ where: { unitId, externalId: payment.customer } });
      if (customer) return this.subRepo.findOne({ where: { unitId, primaryPersonId: customer.personId }, order: { createdAt: 'DESC' } });
    }
    return null;
  }

  private invoiceStatus(event: string, providerStatus?: string): InvoiceStatus {
    const map: Record<string, InvoiceStatus> = { PAYMENT_CONFIRMED: InvoiceStatus.CONFIRMED, PAYMENT_RECEIVED: InvoiceStatus.RECEIVED, PAYMENT_OVERDUE: InvoiceStatus.OVERDUE, PAYMENT_REFUNDED: InvoiceStatus.REFUNDED, PAYMENT_DELETED: InvoiceStatus.CANCELLED };
    const known = providerStatus && Object.values(InvoiceStatus).includes(providerStatus as InvoiceStatus);
    return map[event] || (known ? providerStatus as InvoiceStatus : InvoiceStatus.PENDING);
  }
  private paymentStatus(event: string): PaymentStatus { return ({ PAYMENT_CONFIRMED: PaymentStatus.CONFIRMED, PAYMENT_RECEIVED: PaymentStatus.RECEIVED, PAYMENT_REFUNDED: PaymentStatus.REFUNDED } as any)[event] || PaymentStatus.PENDING; }
  private safeHeaders(headers: Record<string, any>) { const copy = { ...headers }; for (const key of ['authorization','asaas-access-token','x-webhook-token','cookie']) if (copy[key]) copy[key] = '[REDACTED]'; return copy; }
}
