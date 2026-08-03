import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer, Invoice, Person, PlanPrice, Subscription, SubscriptionMember } from '../../database/entities';
import { LivesCompatibilityController, SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
@Module({imports:[TypeOrmModule.forFeature([Subscription,SubscriptionMember,Person,PlanPrice,BillingCustomer,Invoice])],controllers:[SubscriptionsController,LivesCompatibilityController],providers:[SubscriptionsService],exports:[SubscriptionsService]})
export class SubscriptionsModule{}
