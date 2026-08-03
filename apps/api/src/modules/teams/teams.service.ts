import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GlobalRole, Membership, Team, TeamMember, User } from '../../database/entities';
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
  ) {}

  async list(unitIds: string[] | null) {
    const teams = unitIds
      ? await this.teamRepository.find({ where: { unitId: In(unitIds) }, order: { name: 'ASC' } })
      : await this.teamRepository.find({ order: { name: 'ASC' } });
    const members = teams.length
      ? await this.teamMemberRepository.find({ where: { teamId: In(teams.map((team) => team.id)) } })
      : [];
    const users = members.length
      ? await this.userRepository.find({ where: { id: In([...new Set(members.map((member) => member.userId))]) } })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      data: teams.map((team) => ({
        ...team,
        members: members
          .filter((member) => member.teamId === team.id)
          .map((member) => ({ ...member, user: usersById.get(member.userId) || null })),
      })),
      total: teams.length,
    };
  }

  async get(unitId: string, id: string) {
    const team = await this.teamRepository.findOne({ where: { unitId, id } });
    if (!team) throw new NotFoundException('Time não encontrado.');
    return team;
  }

  async create(unitId: string, dto: CreateTeamDto) {
    const name = dto.name.trim();
    if (await this.teamRepository.exists({ where: { unitId, name } })) {
      throw new ConflictException('Já existe um time com este nome.');
    }
    return this.teamRepository.save(this.teamRepository.create({
      unitId,
      name,
      description: dto.description?.trim() || null,
      active: true,
    }));
  }

  async update(unitId: string, id: string, dto: UpdateTeamDto) {
    const team = await this.get(unitId, id);
    if (dto.name) {
      const name = dto.name.trim();
      if (name !== team.name && await this.teamRepository.exists({ where: { unitId, name } })) {
        throw new ConflictException('Já existe um time com este nome.');
      }
      team.name = name;
    }
    if (dto.description !== undefined) team.description = dto.description?.trim() || null;
    return this.teamRepository.save(team);
  }

  async remove(unitId: string, id: string) {
    await this.get(unitId, id);
    await this.teamMemberRepository.delete({ unitId, teamId: id });
    await this.teamRepository.delete({ id, unitId });
  }

  async add(unitId: string, id: string, userId: string) {
    await this.get(unitId, id);
    const user = await this.userRepository.findOne({ where: { id: userId, active: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado ou inativo.');

    const belongsToUnit = user.globalRole === GlobalRole.INSTALLATION_ADMIN
      || await this.membershipRepository.exists({ where: { unitId, userId, active: true } });
    if (!belongsToUnit) throw new NotFoundException('Usuário não pertence a esta unidade.');

    if (await this.teamMemberRepository.exists({ where: { unitId, teamId: id, userId } })) {
      throw new ConflictException('Usuário já pertence ao time.');
    }
    return this.teamMemberRepository.save(this.teamMemberRepository.create({ unitId, teamId: id, userId }));
  }

  async removeMember(unitId: string, id: string, userId: string) {
    await this.get(unitId, id);
    await this.teamMemberRepository.delete({ unitId, teamId: id, userId });
  }
}
