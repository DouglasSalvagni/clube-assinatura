import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GlobalRole, Membership, Opportunity, OpportunityStatus, Team, TeamMember, UnitRole, User } from '../../database/entities';
import { CreateTeamDto, UpdateTeamDto } from './teams.dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepository: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepository: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async list(unitIds: string[] | null) {
    const teams = unitIds
      ? await this.teamRepository.find({ where: { unitId: In(unitIds) }, order: { name: 'ASC' } })
      : await this.teamRepository.find({ order: { name: 'ASC' } });
    const members = teams.length
      ? await this.teamMemberRepository.find({ where: { teamId: In(teams.map((team) => team.id)) } })
      : [];
    const userIds = [...new Set([
      ...members.map((member) => member.userId),
      ...teams.map((team) => team.managerId).filter((id): id is string => Boolean(id)),
    ])];
    const users = userIds.length
      ? await this.userRepository.find({ where: { id: In(userIds) } })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      data: teams.map((team) => this.serialize(team, members, usersById)),
      total: teams.length,
    };
  }

  async get(unitId: string, id: string) {
    const team = await this.team(unitId, id);
    const members = await this.teamMemberRepository.find({ where: { unitId, teamId: id } });
    const userIds = [...new Set([
      ...members.map((member) => member.userId),
      ...(team.managerId ? [team.managerId] : []),
    ])];
    const users = userIds.length
      ? await this.userRepository.find({ where: { id: In(userIds) } })
      : [];
    return this.serialize(team, members, new Map(users.map((user) => [user.id, user])));
  }

  async create(unitId: string, dto: CreateTeamDto) {
    const name = dto.name.trim();
    if (await this.teamRepository.exists({ where: { unitId, name } })) {
      throw new ConflictException('Já existe um time com este nome.');
    }
    const managerId = await this.validateManager(unitId, dto.managerId);
    const team = await this.teamRepository.save(this.teamRepository.create({
      unitId,
      name,
      description: dto.description?.trim() || null,
      managerId,
      active: true,
    }));
    await this.ensureManagerMember(team, managerId);
    return this.get(unitId, team.id);
  }

  async update(unitId: string, id: string, dto: UpdateTeamDto) {
    const team = await this.team(unitId, id);
    if (dto.name) {
      const name = dto.name.trim();
      if (name !== team.name && await this.teamRepository.exists({ where: { unitId, name } })) {
        throw new ConflictException('Já existe um time com este nome.');
      }
      team.name = name;
    }
    if (dto.description !== undefined) team.description = dto.description?.trim() || null;
    if (dto.managerId !== undefined) {
      team.managerId = await this.validateManager(unitId, dto.managerId);
    }
    const saved = await this.teamRepository.save(team);
    await this.ensureManagerMember(saved, saved.managerId);
    return this.get(unitId, id);
  }

  async remove(unitId: string, id: string) {
    await this.team(unitId, id);
    if (await this.opportunityRepository.exists({ where: { unitId, teamId: id } })) {
      throw new ConflictException('Este time possui oportunidades vinculadas. Transfira as oportunidades antes de excluí-lo.');
    }
    await this.teamMemberRepository.delete({ unitId, teamId: id });
    await this.teamRepository.delete({ id, unitId });
  }

  async add(unitId: string, id: string, userId: string) {
    await this.team(unitId, id);
    const user = await this.userRepository.findOne({ where: { id: userId, active: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado ou inativo.');

    const membership = await this.membershipRepository.findOne({ where: { unitId, userId, active: true } });
    const isInstallationAdmin = user.globalRole === GlobalRole.INSTALLATION_ADMIN;
    if (!membership && !isInstallationAdmin) throw new NotFoundException('Usuário não pertence a esta unidade.');
    if (membership && ![UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER, UnitRole.SALES].includes(membership.role)) {
      throw new ConflictException('Somente usuários com perfil comercial podem participar de times de oportunidades.');
    }

    if (await this.teamMemberRepository.exists({ where: { unitId, teamId: id, userId } })) {
      throw new ConflictException('Usuário já pertence ao time.');
    }
    return this.teamMemberRepository.save(this.teamMemberRepository.create({ unitId, teamId: id, userId }));
  }

  async removeMember(unitId: string, id: string, userId: string) {
    const team = await this.team(unitId, id);
    if (team.managerId === userId) {
      throw new ConflictException('O gerente do time não pode ser removido dos membros. Altere o gerente primeiro.');
    }
    if (await this.opportunityRepository.exists({
      where: {
        unitId,
        teamId: id,
        ownerUserId: userId,
        status: In([OpportunityStatus.OPEN, OpportunityStatus.CHECKOUT_PENDING, OpportunityStatus.PAID]),
      },
    })) {
      throw new ConflictException('Este usuário possui oportunidades ativas no time. Transfira-as antes de remover o membro.');
    }
    await this.teamMemberRepository.delete({ unitId, teamId: id, userId });
  }

  private async team(unitId: string, id: string) {
    const team = await this.teamRepository.findOne({ where: { unitId, id } });
    if (!team) throw new NotFoundException('Time não encontrado.');
    return team;
  }

  private async validateManager(unitId: string, managerId?: string | null) {
    if (!managerId) return null;
    const user = await this.userRepository.findOne({ where: { id: managerId, active: true } });
    if (!user) throw new NotFoundException('Gerente não encontrado ou inativo.');
    const membership = await this.membershipRepository.findOne({ where: { unitId, userId: managerId, active: true } });
    if (!membership && user.globalRole !== GlobalRole.INSTALLATION_ADMIN) {
      throw new NotFoundException('O gerente selecionado não pertence a esta unidade.');
    }
    if (membership && ![UnitRole.OWNER, UnitRole.ADMIN, UnitRole.MANAGER].includes(membership.role)) {
      throw new ConflictException('O gerente do time precisa ter perfil de gerente, administrador ou proprietário.');
    }
    return managerId;
  }

  private async ensureManagerMember(team: Team, managerId: string | null) {
    if (!managerId) return;
    const exists = await this.teamMemberRepository.exists({
      where: { unitId: team.unitId, teamId: team.id, userId: managerId },
    });
    if (!exists) {
      await this.teamMemberRepository.save(this.teamMemberRepository.create({
        unitId: team.unitId,
        teamId: team.id,
        userId: managerId,
      }));
    }
  }

  private publicUser(user?: User) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      globalRole: user.globalRole,
    };
  }

  private serialize(team: Team, members: TeamMember[], usersById: Map<string, User>) {
    return {
      ...team,
      manager: team.managerId ? this.publicUser(usersById.get(team.managerId)) : null,
      members: members
        .filter((member) => member.teamId === team.id)
        .map((member) => ({ ...member, user: this.publicUser(usersById.get(member.userId)) })),
    };
  }
}
