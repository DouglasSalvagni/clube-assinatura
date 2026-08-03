import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCustomer, CheckoutSession, Opportunity, OpportunityMember, Person, PlanPrice, Subscription } from '../../database/entities';
import { PeopleModule } from '../people/people.module';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
@Module({imports:[TypeOrmModule.forFeature([Opportunity,OpportunityMember,Person,PlanPrice,BillingCustomer,CheckoutSession,Subscription]),PeopleModule],controllers:[OpportunitiesController],providers:[OpportunitiesService],exports:[OpportunitiesService]})
export class OpportunitiesModule{}
