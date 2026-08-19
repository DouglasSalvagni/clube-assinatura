import { SubscriptionStatus } from '../../database/entities';

export const SUBSCRIPTION_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  [SubscriptionStatus.DRAFT]: [SubscriptionStatus.PENDING_PAYMENT, SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.PENDING_PAYMENT]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLATION_SCHEDULED, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.SUSPENDED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.CANCELLATION_SCHEDULED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.CANCELLED]: [SubscriptionStatus.PENDING_PAYMENT, SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.PENDING_PAYMENT, SubscriptionStatus.ACTIVE],
};

export function canTransitionSubscription(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return from === to || SUBSCRIPTION_TRANSITIONS[from]?.includes(to) === true;
}
