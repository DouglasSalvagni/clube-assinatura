import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BillingCustomer,
  Contract,
  Invoice,
  LifecycleEvent,
  Person,
  Plan,
  PlanPrice,
  Subscription,
  SubscriptionMember,
  Unit,
} from '../../database/entities';
import { InternalSubscriptionsController, LivesCompatibilityController, SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionMember,
      Person,
      Plan,
      PlanPrice,
      Unit,
      BillingCustomer,
      Invoice,
      Contract,
      LifecycleEvent,
    ]),
  ],
  controllers: [SubscriptionsController, LivesCompatibilityController, InternalSubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
