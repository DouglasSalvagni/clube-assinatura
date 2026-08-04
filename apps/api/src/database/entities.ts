import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum GlobalRole { INSTALLATION_ADMIN = 'INSTALLATION_ADMIN', STANDARD = 'STANDARD' }
export enum UnitRole { OWNER = 'OWNER', ADMIN = 'ADMIN', MANAGER = 'MANAGER', SALES = 'SALES', FINANCE = 'FINANCE', SUPPORT = 'SUPPORT', VIEWER = 'VIEWER' }
export enum PersonKind { PERSON = 'PERSON', COMPANY = 'COMPANY' }
export enum BillingEnvironment { SANDBOX = 'SANDBOX', PRODUCTION = 'PRODUCTION' }
export enum BillingProviderName { ASAAS = 'ASAAS' }
export enum BillingCycle { WEEKLY = 'WEEKLY', BIWEEKLY = 'BIWEEKLY', MONTHLY = 'MONTHLY', BIMONTHLY = 'BIMONTHLY', QUARTERLY = 'QUARTERLY', SEMIANNUALLY = 'SEMIANNUALLY', YEARLY = 'YEARLY' }
export enum BillingType { BOLETO = 'BOLETO', CREDIT_CARD = 'CREDIT_CARD', PIX = 'PIX', UNDEFINED = 'UNDEFINED' }
export enum CustomerType { PERSON = 'PERSON', COMPANY = 'COMPANY' }
export enum CommercialStatus { DRAFT = 'DRAFT', NEGOTIATION = 'NEGOTIATION', PENDING_APPROVAL = 'PENDING_APPROVAL', APPROVED = 'APPROVED', CHECKOUT_SENT = 'CHECKOUT_SENT', CONVERTED = 'CONVERTED', LOST = 'LOST' }
export enum ApprovalStatus { PENDING = 'PENDING', APPROVED = 'APPROVED', REJECTED = 'REJECTED', CANCELLED = 'CANCELLED' }
export enum ContractStatus { DRAFT = 'DRAFT', READY = 'READY', ACCEPTED = 'ACCEPTED', VOID = 'VOID' }
export enum ContractRelationType { ORIGINAL = 'ORIGINAL', AMENDMENT = 'AMENDMENT', RENEWAL = 'RENEWAL', REPLACEMENT = 'REPLACEMENT' }
export enum PrecheckoutStatus { CREATED = 'CREATED', DATA_COMPLETED = 'DATA_COMPLETED', CONTRACT_READY = 'CONTRACT_READY', ACCEPTED = 'ACCEPTED', PAYMENT_PENDING = 'PAYMENT_PENDING', COMPLETED = 'COMPLETED', EXPIRED = 'EXPIRED', CANCELLED = 'CANCELLED', FAILED = 'FAILED', REVOKED = 'REVOKED' }
export enum CommercialOfferStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', ARCHIVED = 'ARCHIVED' }
export enum CommercialOfferVersionStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', RETIRED = 'RETIRED' }
export enum ContractTemplateStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', RETIRED = 'RETIRED' }
export enum OpportunityStatus { OPEN = 'OPEN', CHECKOUT_PENDING = 'CHECKOUT_PENDING', PAID = 'PAID', WON = 'WON', LOST = 'LOST', CANCELLED = 'CANCELLED', EXPIRED = 'EXPIRED' }
export enum MemberRole { PRIMARY = 'PRIMARY', DEPENDENT = 'DEPENDENT' }
export enum SubscriptionStatus { DRAFT = 'DRAFT', PENDING_PAYMENT = 'PENDING_PAYMENT', ACTIVE = 'ACTIVE', PAST_DUE = 'PAST_DUE', SUSPENDED = 'SUSPENDED', CANCELLATION_SCHEDULED = 'CANCELLATION_SCHEDULED', CANCELLED = 'CANCELLED', EXPIRED = 'EXPIRED' }
export enum FinancialStatus { CURRENT = 'CURRENT', OVERDUE = 'OVERDUE', BLOCKED = 'BLOCKED', UNKNOWN = 'UNKNOWN' }
export enum AccessStatus { ENABLED = 'ENABLED', RESTRICTED = 'RESTRICTED', DISABLED = 'DISABLED' }
export enum SubscriptionMemberStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export enum CheckoutStatus { CREATED = 'CREATED', PENDING = 'PENDING', PAID = 'PAID', EXPIRED = 'EXPIRED', CANCELLED = 'CANCELLED', FAILED = 'FAILED' }
export enum InvoiceStatus { PENDING = 'PENDING', CONFIRMED = 'CONFIRMED', RECEIVED = 'RECEIVED', OVERDUE = 'OVERDUE', REFUNDED = 'REFUNDED', CANCELLED = 'CANCELLED', UNKNOWN = 'UNKNOWN' }
export enum PaymentStatus { PENDING = 'PENDING', CONFIRMED = 'CONFIRMED', RECEIVED = 'RECEIVED', REFUNDED = 'REFUNDED', FAILED = 'FAILED' }
export enum WebhookStatus { RECEIVED = 'RECEIVED', QUEUED = 'QUEUED', PROCESSING = 'PROCESSING', PROCESSED = 'PROCESSED', IGNORED = 'IGNORED', FAILED = 'FAILED', DEAD_LETTER = 'DEAD_LETTER' }
export enum LifecycleSource { API = 'API', WEBHOOK = 'WEBHOOK', IMPORT = 'IMPORT', RECONCILIATION = 'RECONCILIATION', SYSTEM = 'SYSTEM' }

export abstract class AppBaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export abstract class UnitScopedEntity extends AppBaseEntity {
  @Index()
  @Column({ name: 'unit_id', type: 'uuid' }) unitId: string;
}

@Entity('users')
@Index(['email'], { unique: true })
export class User extends AppBaseEntity {
  @Column({ type: 'varchar', length: 255 }) email: string;
  @Column({ name: 'password_hash', type: 'varchar', length: 255 }) passwordHash: string;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ name: 'global_role', type: 'varchar', length: 40, default: GlobalRole.STANDARD }) globalRole: GlobalRole;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true }) phone: string | null;
  @Column({ name: 'asaas_wallet_id', type: 'varchar', length: 100, nullable: true }) asaasWalletId: string | null;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt: Date | null;
}

@Entity('units')
@Index(['slug'], { unique: true })
export class Unit extends AppBaseEntity {
  @Column({ type: 'varchar', length: 80 }) slug: string;
  @Column({ type: 'varchar', length: 180 }) name: string;
  @Column({ name: 'legal_name', type: 'varchar', length: 220, nullable: true }) legalName: string | null;
  @Column({ name: 'tax_id', type: 'varchar', length: 20, nullable: true }) taxId: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'varchar', length: 80, default: 'America/Sao_Paulo' }) timezone: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) settings: Record<string, any>;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) branding: Record<string, any>;
}

@Entity('memberships')
@Index(['userId', 'unitId'], { unique: true })
export class Membership extends UnitScopedEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 40, default: UnitRole.VIEWER }) role: UnitRole;
  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('refresh_tokens')
@Index(['tokenHash'], { unique: true })
export class RefreshToken extends AppBaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'token_hash', type: 'varchar', length: 128 }) tokenHash: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true }) userAgent: string | null;
  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true }) ipAddress: string | null;
}

@Entity('billing_connections')
@Index(['unitId', 'provider'], { unique: true })
export class BillingConnection extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 40, default: BillingProviderName.ASAAS }) provider: BillingProviderName;
  @Column({ type: 'varchar', length: 30, default: BillingEnvironment.SANDBOX }) environment: BillingEnvironment;
  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true }) apiKeyEncrypted: string | null;
  @Column({ name: 'webhook_secret_encrypted', type: 'text', nullable: true }) webhookSecretEncrypted: string | null;
  @Column({ name: 'webhook_secret_hash', type: 'varchar', length: 128, nullable: true }) webhookSecretHash: string | null;
  @Column({ name: 'external_webhook_id', type: 'varchar', length: 120, nullable: true }) externalWebhookId: string | null;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ name: 'last_validated_at', type: 'timestamptz', nullable: true }) lastValidatedAt: Date | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
}

@Entity('people')
@Index(['unitId', 'taxId'], { unique: true, where: 'tax_id IS NOT NULL' })
@Index(['unitId', 'name'])
export class Person extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 20, default: PersonKind.PERSON }) kind: PersonKind;
  @Column({ type: 'varchar', length: 200 }) name: string;
  @Column({ name: 'tax_id', type: 'varchar', length: 20, nullable: true }) taxId: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) email: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) phone: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) whatsapp: string | null;
  @Column({ name: 'birth_date', type: 'date', nullable: true }) birthDate: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) address: string | null;
  @Column({ name: 'address_number', type: 'varchar', length: 30, nullable: true }) addressNumber: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) complement: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) district: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) city: string | null;
  @Column({ type: 'varchar', length: 2, nullable: true }) state: string | null;
  @Column({ name: 'postal_code', type: 'varchar', length: 12, nullable: true }) postalCode: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('plans')
@Index(['unitId', 'code'], { unique: true })
export class Plan extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 120 }) code: string;
  @Column({ type: 'varchar', length: 180 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'max_dependents', type: 'int', default: 0 }) maxDependents: number;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) benefits: any[];
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('plan_prices')
@Index(['unitId', 'planId', 'version'], { unique: true })
export class PlanPrice extends UnitScopedEntity {
  @Index()
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'numeric', precision: 14, scale: 2 }) amount: string;
  @Column({ name: 'billing_cycle', type: 'varchar', length: 30, default: BillingCycle.MONTHLY }) billingCycle: BillingCycle;
  @Column({ name: 'billing_type', type: 'varchar', length: 30, default: BillingType.UNDEFINED }) billingType: BillingType;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('teams')
@Index(['unitId', 'name'], { unique: true })
export class Team extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('team_members')
@Index(['unitId', 'teamId', 'userId'], { unique: true })
export class TeamMember extends UnitScopedEntity {
  @Column({ name: 'team_id', type: 'uuid' }) teamId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
}

@Entity('opportunities')
@Index(['unitId', 'status'])
export class Opportunity extends UnitScopedEntity {
  @Index()
  @Column({ name: 'primary_person_id', type: 'uuid' }) primaryPersonId: string;
  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true }) ownerUserId: string | null;
  @Column({ name: 'team_id', type: 'uuid', nullable: true }) teamId: string | null;
  @Column({ name: 'pipeline_stage_id', type: 'uuid', nullable: true }) pipelineStageId: string | null;
  @Column({ name: 'offer_version_id', type: 'uuid', nullable: true }) offerVersionId: string | null;
  @Column({ name: 'customer_type', type: 'varchar', length: 20, default: CustomerType.PERSON }) customerType: CustomerType;
  @Column({ name: 'commercial_status', type: 'varchar', length: 30, default: CommercialStatus.DRAFT }) commercialStatus: CommercialStatus;
  @Column({ name: 'negotiation_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) negotiationSnapshot: Record<string, any>;
  @Column({ name: 'plan_price_id', type: 'uuid', nullable: true }) planPriceId: string | null;
  @Column({ type: 'varchar', length: 30, default: OpportunityStatus.OPEN }) status: OpportunityStatus;
  @Column({ name: 'expected_value', type: 'numeric', precision: 14, scale: 2, nullable: true }) expectedValue: string | null;
  @Column({ name: 'billing_cycle', type: 'varchar', length: 30, nullable: true }) billingCycle: BillingCycle | null;
  @Column({ name: 'billing_type', type: 'varchar', length: 30, nullable: true }) billingType: BillingType | null;
  @Column({ name: 'acquisition_source', type: 'varchar', length: 120, nullable: true }) acquisitionSource: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'loss_reason', type: 'text', nullable: true }) lossReason: string | null;
  @Column({ name: 'asaas_customer_id', type: 'varchar', length: 120, nullable: true }) asaasCustomerId: string | null;
  @Column({ name: 'won_at', type: 'timestamptz', nullable: true }) wonAt: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
}

@Entity('opportunity_members')
@Index(['unitId', 'opportunityId', 'personId'], { unique: true })
export class OpportunityMember extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid' }) opportunityId: string;
  @Column({ name: 'person_id', type: 'uuid' }) personId: string;
  @Column({ type: 'varchar', length: 30, default: MemberRole.DEPENDENT }) role: MemberRole;
  @Column({ type: 'varchar', length: 80, nullable: true }) relationship: string | null;
}

@Entity('billing_customers')
@Index(['unitId', 'provider', 'externalId'], { unique: true })
@Index(['unitId', 'personId', 'provider'], { unique: true })
export class BillingCustomer extends UnitScopedEntity {
  @Column({ name: 'person_id', type: 'uuid' }) personId: string;
  @Column({ type: 'varchar', length: 40, default: BillingProviderName.ASAAS }) provider: BillingProviderName;
  @Column({ name: 'external_id', type: 'varchar', length: 120 }) externalId: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('checkout_sessions')
@Index(['unitId', 'externalId'], { unique: true, where: 'external_id IS NOT NULL' })
export class CheckoutSession extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid' }) opportunityId: string;
  @Column({ name: 'billing_customer_id', type: 'uuid', nullable: true }) billingCustomerId: string | null;
  @Column({ type: 'varchar', length: 40, default: BillingProviderName.ASAAS }) provider: BillingProviderName;
  @Column({ name: 'external_id', type: 'varchar', length: 120, nullable: true }) externalId: string | null;
  @Column({ type: 'varchar', length: 30, default: CheckoutStatus.CREATED }) status: CheckoutStatus;
  @Column({ type: 'text', nullable: true }) url: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) payload: Record<string, any>;
}

@Entity('subscriptions')
@Index(['unitId', 'status'])
@Index(['unitId', 'externalSubscriptionId'], { unique: true, where: 'external_subscription_id IS NOT NULL' })
export class Subscription extends UnitScopedEntity {
  @Column({ name: 'primary_person_id', type: 'uuid' }) primaryPersonId: string;
  @Column({ name: 'plan_price_id', type: 'uuid', nullable: true }) planPriceId: string | null;
  @Column({ name: 'source_opportunity_id', type: 'uuid', nullable: true }) sourceOpportunityId: string | null;
  @Column({ name: 'billing_connection_id', type: 'uuid', nullable: true }) billingConnectionId: string | null;
  @Column({ name: 'external_subscription_id', type: 'varchar', length: 120, nullable: true }) externalSubscriptionId: string | null;
  @Column({ type: 'varchar', length: 40, default: SubscriptionStatus.DRAFT }) status: SubscriptionStatus;
  @Column({ name: 'financial_status', type: 'varchar', length: 40, default: FinancialStatus.UNKNOWN }) financialStatus: FinancialStatus;
  @Column({ name: 'access_status', type: 'varchar', length: 40, default: AccessStatus.DISABLED }) accessStatus: AccessStatus;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ name: 'first_active_at', type: 'timestamptz', nullable: true }) firstActiveAt: Date | null;
  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true }) currentPeriodStart: Date | null;
  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true }) currentPeriodEnd: Date | null;
  @Column({ name: 'cancellation_scheduled_at', type: 'timestamptz', nullable: true }) cancellationScheduledAt: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @Column({ name: 'last_reactivated_at', type: 'timestamptz', nullable: true }) lastReactivatedAt: Date | null;
  @Column({ name: 'cancellation_reason_code', type: 'varchar', length: 80, nullable: true }) cancellationReasonCode: string | null;
  @Column({ name: 'cancellation_reason_text', type: 'text', nullable: true }) cancellationReasonText: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('subscription_members')
@Index(['unitId', 'subscriptionId', 'personId'], { unique: true })
export class SubscriptionMember extends UnitScopedEntity {
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId: string;
  @Column({ name: 'person_id', type: 'uuid' }) personId: string;
  @Column({ type: 'varchar', length: 30, default: MemberRole.DEPENDENT }) role: MemberRole;
  @Column({ type: 'varchar', length: 30, default: SubscriptionMemberStatus.ACTIVE }) status: SubscriptionMemberStatus;
  @Column({ name: 'joined_at', type: 'timestamptz' }) joinedAt: Date;
  @Column({ name: 'left_at', type: 'timestamptz', nullable: true }) leftAt: Date | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) relationship: string | null;
}

@Entity('invoices')
@Index(['unitId', 'externalId'], { unique: true, where: 'external_id IS NOT NULL' })
export class Invoice extends UnitScopedEntity {
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true }) subscriptionId: string | null;
  @Column({ name: 'billing_customer_id', type: 'uuid', nullable: true }) billingCustomerId: string | null;
  @Column({ name: 'external_id', type: 'varchar', length: 120, nullable: true }) externalId: string | null;
  @Column({ type: 'varchar', length: 30, default: InvoiceStatus.PENDING }) status: InvoiceStatus;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'numeric', precision: 14, scale: 2 }) amount: string;
  @Column({ name: 'paid_amount', type: 'numeric', precision: 14, scale: 2, default: 0 }) paidAmount: string;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt: Date | null;
  @Column({ name: 'invoice_url', type: 'text', nullable: true }) invoiceUrl: string | null;
  @Column({ name: 'bank_slip_url', type: 'text', nullable: true }) bankSlipUrl: string | null;
  @Column({ name: 'pix_payload', type: 'text', nullable: true }) pixPayload: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('payments')
@Index(['unitId', 'externalId'], { unique: true })
export class Payment extends UnitScopedEntity {
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true }) invoiceId: string | null;
  @Column({ name: 'external_id', type: 'varchar', length: 120 }) externalId: string;
  @Column({ type: 'varchar', length: 30, default: PaymentStatus.PENDING }) status: PaymentStatus;
  @Column({ type: 'numeric', precision: 14, scale: 2 }) amount: string;
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true }) confirmedAt: Date | null;
  @Column({ name: 'received_at', type: 'timestamptz', nullable: true }) receivedAt: Date | null;
  @Column({ name: 'raw_payload', type: 'jsonb', default: () => "'{}'::jsonb" }) rawPayload: Record<string, any>;
}

@Entity('sales')
@Index(['unitId', 'soldAt'])
export class Sale extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid', nullable: true }) opportunityId: string | null;
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId: string;
  @Column({ name: 'salesperson_id', type: 'uuid', nullable: true }) salespersonId: string | null;
  @Column({ name: 'gross_amount', type: 'numeric', precision: 14, scale: 2 }) grossAmount: string;
  @Column({ name: 'commission_amount', type: 'numeric', precision: 14, scale: 2, default: 0 }) commissionAmount: string;
  @Column({ name: 'commission_paid', type: 'boolean', default: false }) commissionPaid: boolean;
  @Column({ name: 'sold_at', type: 'timestamptz' }) soldAt: Date;
}

@Entity('webhook_events')
@Index(['unitId', 'deduplicationKey'], { unique: true })
@Index(['status', 'nextRetryAt'])
export class WebhookEvent extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 40, default: BillingProviderName.ASAAS }) provider: BillingProviderName;
  @Column({ name: 'provider_event_id', type: 'varchar', length: 180, nullable: true }) providerEventId: string | null;
  @Column({ name: 'deduplication_key', type: 'varchar', length: 128 }) deduplicationKey: string;
  @Column({ name: 'event_type', type: 'varchar', length: 120 }) eventType: string;
  @Column({ type: 'varchar', length: 30, default: WebhookStatus.RECEIVED }) status: WebhookStatus;
  @Column({ type: 'jsonb' }) payload: Record<string, any>;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) headers: Record<string, any>;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true }) nextRetryAt: Date | null;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
}

@Entity('lifecycle_events')
@Index(['unitId', 'effectiveAt'])
@Index(['unitId', 'subscriptionId', 'effectiveAt'])
export class LifecycleEvent extends UnitScopedEntity {
  @Column({ name: 'person_id', type: 'uuid', nullable: true }) personId: string | null;
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true }) subscriptionId: string | null;
  @Column({ type: 'varchar', length: 100 }) type: string;
  @Column({ name: 'from_status', type: 'varchar', length: 50, nullable: true }) fromStatus: string | null;
  @Column({ name: 'to_status', type: 'varchar', length: 50, nullable: true }) toStatus: string | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 100, nullable: true }) reasonCode: string | null;
  @Column({ name: 'effective_at', type: 'timestamptz' }) effectiveAt: Date;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
  @Column({ type: 'varchar', length: 40, default: LifecycleSource.SYSTEM }) source: LifecycleSource;
  @Column({ name: 'correlation_id', type: 'varchar', length: 160, nullable: true }) correlationId: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('audit_logs')
@Index(['unitId', 'createdAt'])
export class AuditLog extends UnitScopedEntity {
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
  @Column({ type: 'varchar', length: 120 }) action: string;
  @Column({ name: 'resource_type', type: 'varchar', length: 100 }) resourceType: string;
  @Column({ name: 'resource_id', type: 'varchar', length: 160, nullable: true }) resourceId: string | null;
  @Column({ name: 'before_data', type: 'jsonb', nullable: true }) beforeData: Record<string, any> | null;
  @Column({ name: 'after_data', type: 'jsonb', nullable: true }) afterData: Record<string, any> | null;
  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true }) ipAddress: string | null;
  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true }) userAgent: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}



@Entity('commercial_offers')
@Index(['unitId', 'code'], { unique: true })
@Index(['publicSlug'], { unique: true, where: 'public_slug IS NOT NULL' })
export class CommercialOffer extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 120 }) code: string;
  @Column({ type: 'varchar', length: 180 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'customer_type', type: 'varchar', length: 20 }) customerType: CustomerType;
  @Column({ type: 'varchar', length: 30, default: CommercialOfferStatus.DRAFT }) status: CommercialOfferStatus;
  @Column({ name: 'public_slug', type: 'varchar', length: 160, nullable: true }) publicSlug: string | null;
  @Column({ name: 'assignment_team_id', type: 'uuid', nullable: true }) assignmentTeamId: string | null;
  @Column({ name: 'assignment_user_id', type: 'uuid', nullable: true }) assignmentUserId: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('contract_templates')
@Index(['unitId', 'code'], { unique: true })
export class ContractTemplate extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 120 }) code: string;
  @Column({ type: 'varchar', length: 180 }) name: string;
  @Column({ name: 'customer_type', type: 'varchar', length: 20 }) customerType: CustomerType;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('contract_template_versions')
@Index(['unitId', 'templateId', 'version'], { unique: true })
export class ContractTemplateVersion extends UnitScopedEntity {
  @Column({ name: 'template_id', type: 'uuid' }) templateId: string;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 30, default: ContractTemplateStatus.DRAFT }) status: ContractTemplateStatus;
  @Column({ type: 'text' }) content: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) variables: string[];
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
}

@Entity('commercial_offer_versions')
@Index(['unitId', 'offerId', 'version'], { unique: true })
export class CommercialOfferVersion extends UnitScopedEntity {
  @Column({ name: 'offer_id', type: 'uuid' }) offerId: string;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 30, default: CommercialOfferVersionStatus.DRAFT }) status: CommercialOfferVersionStatus;
  @Column({ name: 'billing_cycle', type: 'varchar', length: 30 }) billingCycle: BillingCycle;
  @Column({ name: 'holder_amount', type: 'numeric', precision: 14, scale: 2, nullable: true }) holderAmount: string | null;
  @Column({ name: 'dependent_amount', type: 'numeric', precision: 14, scale: 2, nullable: true }) dependentAmount: string | null;
  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2, nullable: true }) unitPrice: string | null;
  @Column({ name: 'included_lives', type: 'int', default: 1 }) includedLives: number;
  @Column({ name: 'max_dependents', type: 'int', default: 0 }) maxDependents: number;
  @Column({ name: 'min_lives', type: 'int', default: 1 }) minLives: number;
  @Column({ name: 'max_lives', type: 'int', nullable: true }) maxLives: number | null;
  @Column({ name: 'allowed_billing_types', type: 'jsonb', default: () => "'[]'::jsonb" }) allowedBillingTypes: BillingType[];
  @Column({ name: 'pricing_rules', type: 'jsonb', default: () => "'{}'::jsonb" }) pricingRules: Record<string, any>;
  @Column({ name: 'contract_template_version_id', type: 'uuid', nullable: true }) contractTemplateVersionId: string | null;
  @Column({ name: 'effective_from', type: 'date', nullable: true }) effectiveFrom: string | null;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, any>;
}

@Entity('commercial_pipelines')
@Index(['unitId', 'name'], { unique: true })
export class CommercialPipeline extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ name: 'is_default', type: 'boolean', default: false }) isDefault: boolean;
  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('commercial_pipeline_stages')
@Index(['unitId', 'pipelineId', 'code'], { unique: true })
export class CommercialPipelineStage extends UnitScopedEntity {
  @Column({ name: 'pipeline_id', type: 'uuid' }) pipelineId: string;
  @Column({ type: 'varchar', length: 100 }) code: string;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'int', default: 0 }) position: number;
  @Column({ name: 'commercial_status', type: 'varchar', length: 30, nullable: true }) commercialStatus: CommercialStatus | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('negotiation_policies')
@Index(['unitId', 'name'])
export class NegotiationPolicy extends UnitScopedEntity {
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ name: 'target_role', type: 'varchar', length: 40, nullable: true }) targetRole: UnitRole | null;
  @Column({ name: 'target_user_id', type: 'uuid', nullable: true }) targetUserId: string | null;
  @Column({ name: 'max_discount_percent', type: 'numeric', precision: 6, scale: 2, default: 0 }) maxDiscountPercent: string;
  @Column({ name: 'max_discount_amount', type: 'numeric', precision: 14, scale: 2, nullable: true }) maxDiscountAmount: string | null;
  @Column({ name: 'min_unit_price', type: 'numeric', precision: 14, scale: 2, nullable: true }) minUnitPrice: string | null;
  @Column({ name: 'allowed_billing_types', type: 'jsonb', default: () => "'[]'::jsonb" }) allowedBillingTypes: BillingType[];
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) rules: Record<string, any>;
}

@Entity('approval_requests')
@Index(['unitId', 'opportunityId', 'status'])
export class ApprovalRequest extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid' }) opportunityId: string;
  @Column({ name: 'requested_by', type: 'uuid' }) requestedBy: string;
  @Column({ name: 'decided_by', type: 'uuid', nullable: true }) decidedBy: string | null;
  @Column({ type: 'varchar', length: 30, default: ApprovalStatus.PENDING }) status: ApprovalStatus;
  @Column({ type: 'text' }) reason: string;
  @Column({ name: 'requested_conditions', type: 'jsonb', default: () => "'{}'::jsonb" }) requestedConditions: Record<string, any>;
  @Column({ name: 'policy_evaluation', type: 'jsonb', default: () => "'{}'::jsonb" }) policyEvaluation: Record<string, any>;
  @Column({ name: 'decision_notes', type: 'text', nullable: true }) decisionNotes: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt: Date | null;
}

@Entity('contracts')
@Index(['unitId', 'opportunityId'])
export class Contract extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid' }) opportunityId: string;
  @Column({ name: 'parent_contract_id', type: 'uuid', nullable: true }) parentContractId: string | null;
  @Column({ name: 'relation_type', type: 'varchar', length: 30, default: ContractRelationType.ORIGINAL }) relationType: ContractRelationType;
  @Column({ name: 'change_reason', type: 'text', nullable: true }) changeReason: string | null;
  @Column({ name: 'requires_payment', type: 'boolean', default: true }) requiresPayment: boolean;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'varchar', length: 30, default: ContractStatus.DRAFT }) status: ContractStatus;
  @Column({ name: 'template_code', type: 'varchar', length: 120, default: 'DEFAULT' }) templateCode: string;
  @Column({ name: 'template_version_id', type: 'uuid', nullable: true }) templateVersionId: string | null;
  @Column({ type: 'jsonb' }) snapshot: Record<string, any>;
  @Column({ name: 'rendered_content', type: 'text' }) renderedContent: string;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 }) contentHash: string;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt: Date | null;
}

@Entity('contract_acceptances')
@Index(['unitId', 'contractId'], { unique: true })
export class ContractAcceptance extends UnitScopedEntity {
  @Column({ name: 'contract_id', type: 'uuid' }) contractId: string;
  @Column({ name: 'accepted_by_name', type: 'varchar', length: 200 }) acceptedByName: string;
  @Column({ name: 'accepted_by_tax_id', type: 'varchar', length: 20 }) acceptedByTaxId: string;
  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true }) ipAddress: string | null;
  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true }) userAgent: string | null;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 }) contentHash: string;
  @Column({ name: 'accepted_at', type: 'timestamptz' }) acceptedAt: Date;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) evidence: Record<string, any>;
}

@Entity('precheckout_sessions')
@Index(['tokenHash'], { unique: true })
@Index(['unitId', 'opportunityId'])
export class PrecheckoutSession extends UnitScopedEntity {
  @Column({ name: 'opportunity_id', type: 'uuid' }) opportunityId: string;
  @Column({ name: 'contract_id', type: 'uuid', nullable: true }) contractId: string | null;
  @Column({ name: 'checkout_session_id', type: 'uuid', nullable: true }) checkoutSessionId: string | null;
  @Column({ name: 'token_hash', type: 'varchar', length: 64 }) tokenHash: string;
  @Column({ type: 'varchar', length: 40, default: PrecheckoutStatus.CREATED }) status: PrecheckoutStatus;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ name: 'customer_data', type: 'jsonb', default: () => "'{}'::jsonb" }) customerData: Record<string, any>;
  @Column({ name: 'pricing_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" }) pricingSnapshot: Record<string, any>;
}

@Entity('precheckout_participants')
@Index(['unitId', 'precheckoutSessionId', 'taxId'], { unique: true })
export class PrecheckoutParticipant extends UnitScopedEntity {
  @Column({ name: 'precheckout_session_id', type: 'uuid' }) precheckoutSessionId: string;
  @Column({ type: 'varchar', length: 30, default: MemberRole.DEPENDENT }) role: MemberRole;
  @Column({ type: 'varchar', length: 200 }) name: string;
  @Column({ name: 'tax_id', type: 'varchar', length: 20 }) taxId: string;
  @Column({ name: 'birth_date', type: 'date', nullable: true }) birthDate: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) relationship: string | null;
}

export const ALL_ENTITIES = [
  User, Unit, Membership, RefreshToken, BillingConnection, Person, Plan, PlanPrice,
  Team, TeamMember, Opportunity, OpportunityMember, BillingCustomer, CheckoutSession,
  Subscription, SubscriptionMember, Invoice, Payment, Sale, WebhookEvent, LifecycleEvent, AuditLog,
  CommercialOffer, CommercialOfferVersion, CommercialPipeline, CommercialPipelineStage, ContractTemplate, ContractTemplateVersion,
  NegotiationPolicy, ApprovalRequest, Contract, ContractAcceptance, PrecheckoutSession, PrecheckoutParticipant,
];
