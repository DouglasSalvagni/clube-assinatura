import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer, CheckoutSession, CommercialPipelineStage, Contract, Membership, Opportunity, OpportunityMember, Person, PlanPrice, PrecheckoutSession, Subscription, TeamMember } from '../../database/entities';
import { PeopleModule } from '../people/people.module';
import { CommercialModule } from '../commercial/commercial.module';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
@Module({imports:[TypeOrmModule.forFeature([Opportunity,OpportunityMember,Person,PlanPrice,BillingCustomer,CheckoutSession,Subscription,TeamMember,Membership,CommercialPipelineStage,Contract,PrecheckoutSession]),PeopleModule,CommercialModule],controllers:[OpportunitiesController],providers:[OpportunitiesService],exports:[OpportunitiesService]})
export class OpportunitiesModule{}
