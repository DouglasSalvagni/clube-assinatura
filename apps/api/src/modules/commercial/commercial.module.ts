import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApprovalRequest,
  AuditLog,
  BillingCustomer,
  CheckoutSession,
  CommercialOffer,
  CommercialOfferBillingOption,
  CommercialOfferVersion,
  CommercialPriceTableVersion,
  CommercialPipeline,
  CommercialPipelineStage,
  Contract,
  ContractAcceptance,
  ContractTemplate,
  ContractTemplateVersion,
  NegotiationPolicy,
  Membership,
  Opportunity,
  OpportunityMember,
  Person,
  PrecheckoutParticipant,
  PrecheckoutSession,
  Sale,
  Subscription,
  SubscriptionMember,
  Team,
  TeamMember,
  Unit,
} from '../../database/entities';
import { PeopleModule } from '../people/people.module';
import { CommercialConfigService } from './commercial-config.service';
import {
  CommercialController,
  PublicOffersController,
  PublicPrecheckoutController,
} from './commercial.controller';
import { CommercialWorkflowService } from './commercial-workflow.service';
import { CommercialMetricsService } from './commercial-metrics.service';
import { CommercialFeatureService } from './commercial-feature.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NegotiationPolicy,
      ApprovalRequest,
      AuditLog,
      Opportunity,
      OpportunityMember,
      Person,
      Contract,
      ContractAcceptance,
      ContractTemplate,
      ContractTemplateVersion,
      CommercialOffer,
      CommercialOfferBillingOption,
      CommercialOfferVersion,
      CommercialPriceTableVersion,
      CommercialPipeline,
      CommercialPipelineStage,
      PrecheckoutSession,
      PrecheckoutParticipant,
      BillingCustomer,
      CheckoutSession,
      Sale,
      Subscription,
      SubscriptionMember,
      Team,
      TeamMember,
      Membership,
      Unit,
    ]),
    PeopleModule,
  ],
  controllers: [CommercialController, PublicOffersController, PublicPrecheckoutController],
  providers: [PricingService, CommercialWorkflowService, CommercialConfigService, CommercialMetricsService, CommercialFeatureService],
  exports: [PricingService, CommercialWorkflowService, CommercialConfigService, CommercialMetricsService, CommercialFeatureService],
})
export class CommercialModule {}
