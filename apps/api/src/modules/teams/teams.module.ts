import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership, Opportunity, Team, TeamMember, User } from '../../database/entities';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [TypeOrmModule.forFeature([Team, TeamMember, User, Membership, Opportunity])],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
