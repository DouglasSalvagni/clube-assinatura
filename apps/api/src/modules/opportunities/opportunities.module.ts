import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer, CheckoutSession, CommercialPipelineStage, CommercialPriceTableVersion, Contract, ContractTemplate, ContractTemplateVersion, Membership, Opportunity, OpportunityMember, Person, PlanPrice, PrecheckoutSession, Subscription, Team, TeamMember, User } from '../../database/entities';
import { PeopleModule } from '../people/people.module';
import { CommercialModule } from '../commercial/commercial.module';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunityDistributionService } from './opportunity-distribution.service';
import { OpportunitiesService } from './opportunities.service';
@Module({imports:[TypeOrmModule.forFeature([Opportunity,OpportunityMember,Person,PlanPrice,BillingCustomer,CheckoutSession,Subscription,Team,TeamMember,Membership,User,CommercialPipelineStage,Contract,PrecheckoutSession,CommercialPriceTableVersion,ContractTemplateVersion,ContractTemplate]),PeopleModule,CommercialModule],controllers:[OpportunitiesController],providers:[OpportunitiesService,OpportunityDistributionService],exports:[OpportunitiesService]})
export class OpportunitiesModule{}
