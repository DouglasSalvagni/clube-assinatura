import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer, CheckoutSession, Invoice, Opportunity, Payment, PrecheckoutSession, Subscription, Unit, WebhookEvent } from '../../database/entities';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WebhookEventsController, WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
@Module({imports:[TypeOrmModule.forFeature([Unit,WebhookEvent,Subscription,BillingCustomer,Invoice,Payment,CheckoutSession,PrecheckoutSession,Opportunity]),BullModule.registerQueue({name:'billing-webhooks'}),OpportunitiesModule,SubscriptionsModule],controllers:[WebhooksController,WebhookEventsController],providers:[WebhooksService],exports:[WebhooksService]})
export class WebhooksModule{}
