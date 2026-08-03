import { SubscriptionStatus } from '../../database/entities';
import { canTransitionSubscription } from './subscription-state-machine';

describe('subscription state machine', () => {
  it('allows activation after pending payment', () => {
    expect(canTransitionSubscription(SubscriptionStatus.PENDING_PAYMENT, SubscriptionStatus.ACTIVE)).toBe(true);
  });

  it('allows reactivation after cancellation', () => {
    expect(canTransitionSubscription(SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE)).toBe(true);
  });

  it('does not allow a cancelled subscription to become past due directly', () => {
    expect(canTransitionSubscription(SubscriptionStatus.CANCELLED, SubscriptionStatus.PAST_DUE)).toBe(false);
  });
});
