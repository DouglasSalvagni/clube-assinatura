import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  GlobalRole,
  LifecycleEvent,
  LifecycleSource,
  Membership,
  Opportunity,
  OpportunityStatus,
  Person,
  Team,
  TeamMember,
  UnitRole,
  User,
} from '../../database/entities';
import {
  AutoDistributeOpportunitiesDto,
  AutomaticDistributionMode,
  BulkAssignOpportunitiesDto,
} from './opportunities.dto';
import { distributeFairly } from './fair-distribution';

const ACTIVE_OPPORTUNITY_STATUSES = [
  OpportunityStatus.OPEN,
  OpportunityStatus.CHECKOUT_PENDING,
  OpportunityStatus.PAID,
];
const ASSIGNEE_ROLES = [UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER, UnitRole.SALES];

interface DistributionMember {
  userId: string;
  name: string;
  email: string;
  role: UnitRole;
  isManager: boolean;
  activeCount: number;
}

@Injectable()
export class OpportunityDistributionService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepository: Repository<TeamMember>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async manageableTeams(
    unitId: string,
    actorId: string,
    unitRole: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const unitWideAccess = this.hasUnitWideAccess(unitRole, globalRole);
    if (!unitWideAccess && unitRole !== UnitRole.MANAGER) {
      throw new ForbiddenException('A distribuição em massa é restrita a gerentes e administradores.');
    }

    const teams = unitWideAccess
      ? await this.teamRepository.find({ where: { unitId, active: true }, order: { name: 'ASC' } })
      : await this.teamRepository.find({ where: { unitId, active: true, managerId: actorId }, order: { name: 'ASC' } });
    const counts = teams.length
      ? await this.opportunityRepository.createQueryBuilder('opportunity')
          .select('opportunity.team_id', 'teamId')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COUNT(*) FILTER (WHERE opportunity.owner_user_id IS NULL)', 'queue')
          .where('opportunity.unit_id = :unitId', { unitId })
          .andWhere('opportunity.team_id IN (:...teamIds)', { teamIds: teams.map((team) => team.id) })
          .andWhere('opportunity.status IN (:...statuses)', { statuses: ACTIVE_OPPORTUNITY_STATUSES })
          .groupBy('opportunity.team_id')
          .getRawMany<{ teamId: string; total: string; queue: string }>()
      : [];
    const countByTeam = new Map(counts.map((item) => [item.teamId, item]));

    return {
      data: teams.map((team) => ({
        id: team.id,
        name: team.name,
        managerId: team.managerId,
        activeOpportunities: Number(countByTeam.get(team.id)?.total || 0),
        queueOpportunities: Number(countByTeam.get(team.id)?.queue || 0),
      })),
      total: teams.length,
      managerCanManageMultipleTeams: true,
    };
  }

  async dashboard(
    unitId: string,
    teamId: string,
    actorId: string,
    unitRole: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const team = await this.authorizedTeam(unitId, teamId, actorId, unitRole, globalRole);
    const members = await this.eligibleMembers(unitId, team);
    const opportunities = await this.opportunityRepository.find({
      where: { unitId, teamId, status: In(ACTIVE_OPPORTUNITY_STATUSES) },
      order: { createdAt: 'ASC' },
    });
    const people = opportunities.length
      ? await this.personRepository.find({
          where: { unitId, id: In([...new Set(opportunities.map((item) => item.primaryPersonId))]) },
        })
      : [];
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const ownerIds = [...new Set(opportunities.map((item) => item.ownerUserId).filter((id): id is string => Boolean(id)))];
    const ownerUsers = ownerIds.length
      ? await this.userRepository.find({ where: { id: In(ownerIds) } })
      : [];
    const ownerNameById = new Map(ownerUsers.map((user) => [user.id, user.name]));
    const activeCounts = new Map<string, number>();
    for (const opportunity of opportunities) {
      if (opportunity.ownerUserId) {
        activeCounts.set(opportunity.ownerUserId, (activeCounts.get(opportunity.ownerUserId) || 0) + 1);
      }
    }

    const serializedMembers: DistributionMember[] = members.map((member) => ({
      ...member,
      activeCount: activeCounts.get(member.userId) || 0,
    }));

    return {
      team: {
        id: team.id,
        name: team.name,
        managerId: team.managerId,
        managerManagesMultipleTeams: team.managerId
          ? await this.teamRepository.count({ where: { unitId, managerId: team.managerId, active: true } }) > 1
          : false,
      },
      members: serializedMembers,
      opportunities: opportunities.map((opportunity) => ({
        id: opportunity.id,
        name: peopleById.get(opportunity.primaryPersonId)?.name || 'Cliente sem nome',
        customerType: opportunity.customerType,
        commercialStatus: opportunity.commercialStatus,
        status: opportunity.status,
        expectedValue: Number(opportunity.expectedValue || 0),
        ownerUserId: opportunity.ownerUserId,
        ownerName: opportunity.ownerUserId ? ownerNameById.get(opportunity.ownerUserId) || null : null,
        createdAt: opportunity.createdAt,
      })),
      summary: {
        total: opportunities.length,
        queue: opportunities.filter((item) => !item.ownerUserId).length,
        assigned: opportunities.filter((item) => Boolean(item.ownerUserId)).length,
      },
    };
  }

  async bulkAssign(
    unitId: string,
    dto: BulkAssignOpportunitiesDto,
    actorId: string,
    unitRole: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const team = await this.authorizedTeam(unitId, dto.teamId, actorId, unitRole, globalRole);
    if (dto.ownerUserId) await this.assertEligibleOwner(unitId, team.id, dto.ownerUserId);

    const uniqueIds = [...new Set(dto.opportunityIds)];
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Opportunity);
      const opportunities = await repository.createQueryBuilder('opportunity')
        .setLock('pessimistic_write')
        .where('opportunity.unit_id = :unitId', { unitId })
        .andWhere('opportunity.id IN (:...ids)', { ids: uniqueIds })
        .getMany();

      this.assertDistributionPool(opportunities, uniqueIds, team.id);
      let changed = 0;
      for (const opportunity of opportunities) {
        const nextOwnerId = dto.ownerUserId || null;
        if (opportunity.ownerUserId === nextOwnerId && opportunity.teamId === team.id) continue;
        const previousOwnerId = opportunity.ownerUserId;
        opportunity.teamId = team.id;
        opportunity.ownerUserId = nextOwnerId;
        await repository.save(opportunity);
        await this.recordAssignment(manager.getRepository(LifecycleEvent), opportunity, actorId, {
          method: 'MANUAL_BULK',
          previousOwnerId,
          ownerUserId: nextOwnerId,
        });
        changed += 1;
      }
      return { changed, total: opportunities.length };
    });

    return {
      ...result,
      destination: dto.ownerUserId ? 'INDIVIDUAL' : 'TEAM_QUEUE',
      dashboard: await this.dashboard(unitId, team.id, actorId, unitRole, globalRole),
    };
  }

  async autoDistribute(
    unitId: string,
    dto: AutoDistributeOpportunitiesDto,
    actorId: string,
    unitRole: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const team = await this.authorizedTeam(unitId, dto.teamId, actorId, unitRole, globalRole);
    const allMembers = await this.eligibleMembers(unitId, team);
    const members = allMembers.filter((member) => dto.includeManager || member.userId !== team.managerId);
    if (!members.length) {
      throw new BadRequestException('O time não possui membros elegíveis para a distribuição automática.');
    }

    const mode = dto.mode || AutomaticDistributionMode.QUEUE_ONLY;
    const selectedIds = dto.opportunityIds?.length ? [...new Set(dto.opportunityIds)] : null;
    const distribution = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Opportunity);
      const active = await repository.createQueryBuilder('opportunity')
        .setLock('pessimistic_write')
        .where('opportunity.unit_id = :unitId', { unitId })
        .andWhere('opportunity.team_id = :teamId', { teamId: team.id })
        .andWhere('opportunity.status IN (:...statuses)', { statuses: ACTIVE_OPPORTUNITY_STATUSES })
        .orderBy('opportunity.created_at', 'ASC')
        .getMany();

      let pool: Opportunity[];
      if (selectedIds) {
        pool = active.filter((item) => selectedIds.includes(item.id));
        if (pool.length !== selectedIds.length) {
          throw new BadRequestException('Uma ou mais oportunidades selecionadas não pertencem ao time ou não estão ativas.');
        }
      } else if (mode === AutomaticDistributionMode.REBALANCE_ALL) {
        pool = active;
      } else {
        pool = active.filter((item) => !item.ownerUserId);
      }

      if (!pool.length) {
        return {
          changed: 0,
          considered: 0,
          beforeCounts: this.memberCounts(active, members.map((item) => item.userId)),
          afterCounts: this.memberCounts(active, members.map((item) => item.userId)),
        };
      }

      const poolIds = new Set(pool.map((item) => item.id));
      const memberIds = members.map((item) => item.userId);
      const baseCounts = this.memberCounts(
        active.filter((item) => !poolIds.has(item.id)),
        memberIds,
      );
      const beforeCounts = this.memberCounts(active, memberIds);
      const fair = distributeFairly(pool, memberIds, baseCounts);
      let changed = 0;

      for (const opportunity of pool) {
        const ownerUserId = fair.assignments.get(opportunity.id)!;
        if (opportunity.ownerUserId === ownerUserId) continue;
        const previousOwnerId = opportunity.ownerUserId;
        opportunity.ownerUserId = ownerUserId;
        opportunity.teamId = team.id;
        await repository.save(opportunity);
        await this.recordAssignment(manager.getRepository(LifecycleEvent), opportunity, actorId, {
          method: 'AUTOMATIC_FAIR',
          mode,
          includeManager: Boolean(dto.includeManager),
          previousOwnerId,
          ownerUserId,
        });
        changed += 1;
      }

      return {
        changed,
        considered: pool.length,
        beforeCounts,
        afterCounts: fair.finalCounts,
      };
    });

    return {
      ...distribution,
      mode,
      includeManager: Boolean(dto.includeManager),
      dashboard: await this.dashboard(unitId, team.id, actorId, unitRole, globalRole),
    };
  }

  private async authorizedTeam(
    unitId: string,
    teamId: string,
    actorId: string,
    unitRole: UnitRole | null,
    globalRole: GlobalRole,
  ) {
    const team = await this.teamRepository.findOne({ where: { unitId, id: teamId, active: true } });
    if (!team) throw new NotFoundException('Time não encontrado ou inativo.');
    if (this.hasUnitWideAccess(unitRole, globalRole)) return team;
    if (unitRole === UnitRole.MANAGER && team.managerId === actorId) return team;
    throw new ForbiddenException('Você não possui permissão para distribuir oportunidades deste time.');
  }

  private hasUnitWideAccess(unitRole: UnitRole | null, globalRole: GlobalRole) {
    return globalRole === GlobalRole.INSTALLATION_ADMIN
      || unitRole === UnitRole.OWNER
      || unitRole === UnitRole.ADMIN;
  }

  private async eligibleMembers(unitId: string, team: Team) {
    const links = await this.teamMemberRepository.find({ where: { unitId, teamId: team.id } });
    if (!links.length) return [];
    const userIds = [...new Set(links.map((item) => item.userId))];
    const [memberships, users] = await Promise.all([
      this.membershipRepository.find({ where: { unitId, userId: In(userIds), active: true } }),
      this.userRepository.find({ where: { id: In(userIds), active: true } }),
    ]);
    const roleByUser = new Map(memberships.map((membership) => [membership.userId, membership.role]));
    return users
      .filter((user) => ASSIGNEE_ROLES.includes(roleByUser.get(user.id)!))
      .map((user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
        role: roleByUser.get(user.id)!,
        isManager: team.managerId === user.id,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }

  private async assertEligibleOwner(unitId: string, teamId: string, ownerUserId: string) {
    const team = await this.teamRepository.findOne({ where: { unitId, id: teamId, active: true } });
    if (!team) throw new NotFoundException('Time não encontrado ou inativo.');
    const member = await this.teamMemberRepository.exists({ where: { unitId, teamId, userId: ownerUserId } });
    const membership = await this.membershipRepository.findOne({
      where: { unitId, userId: ownerUserId, active: true },
    });
    const user = await this.userRepository.findOne({ where: { id: ownerUserId, active: true } });
    if (!member || !membership || !user || !ASSIGNEE_ROLES.includes(membership.role)) {
      throw new BadRequestException('O responsável precisa ser um membro comercial ativo do time.');
    }
  }

  private assertDistributionPool(opportunities: Opportunity[], requestedIds: string[], teamId: string) {
    if (opportunities.length !== requestedIds.length) {
      throw new BadRequestException('Uma ou mais oportunidades não foram encontradas.');
    }
    if (opportunities.some((item) => item.teamId !== teamId)) {
      throw new BadRequestException('Todas as oportunidades precisam pertencer ao time selecionado.');
    }
    if (opportunities.some((item) => !ACTIVE_OPPORTUNITY_STATUSES.includes(item.status))) {
      throw new BadRequestException('Oportunidades encerradas não podem ser redistribuídas.');
    }
  }

  private memberCounts(opportunities: Opportunity[], memberIds: string[]) {
    const result: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
    for (const opportunity of opportunities) {
      if (opportunity.ownerUserId && result[opportunity.ownerUserId] !== undefined) {
        result[opportunity.ownerUserId] += 1;
      }
    }
    return result;
  }

  private async recordAssignment(
    repository: Repository<LifecycleEvent>,
    opportunity: Opportunity,
    actorId: string,
    metadata: Record<string, unknown>,
  ) {
    await repository.save(repository.create({
      unitId: opportunity.unitId,
      type: 'opportunity.distributed',
      personId: opportunity.primaryPersonId,
      subscriptionId: null,
      fromStatus: null,
      toStatus: null,
      reasonCode: null,
      effectiveAt: new Date(),
      actorUserId: actorId,
      source: LifecycleSource.API,
      correlationId: null,
      metadata: {
        opportunityId: opportunity.id,
        teamId: opportunity.teamId,
        ...metadata,
      },
    }));
  }
}
