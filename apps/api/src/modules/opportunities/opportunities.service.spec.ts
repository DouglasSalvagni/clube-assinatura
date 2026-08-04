import { ConflictException } from '@nestjs/common';
import { GlobalRole } from '../../database/entities';
import { OpportunitiesService } from './opportunities.service';

function repository() {
  return {
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('OpportunitiesService — transição do checkout', () => {
  it('bloqueia o checkout legado quando o fluxo comercial novo está ativo', async () => {
    const opportunityRepository = repository();
    const service = new OpportunitiesService(
      opportunityRepository as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { status: jest.fn().mockResolvedValue({ enabled: true }) } as any,
      {} as any,
    );

    await expect(service.generateCheckout(
      'unit-1',
      'opportunity-1',
      { id: 'user-1', globalRole: GlobalRole.STANDARD } as any,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(opportunityRepository.findOne).not.toHaveBeenCalled();
  });
});

describe('OpportunitiesService — escopo e atribuição', () => {
  function accessService(input: {
    teamMembers?: any[];
    managedTeams?: any[];
    opportunity?: any;
  } = {}) {
    const opportunity = input.opportunity || {
      id: 'opp-1',
      unitId: 'unit-1',
      primaryPersonId: 'person-1',
      ownerUserId: null,
      teamId: 'team-1',
      status: 'OPEN',
    };
    const opportunityRepository = repository();
    opportunityRepository.findOne.mockResolvedValue(opportunity);
    opportunityRepository.save.mockImplementation(async (value: any) => value);
    const teamMemberRepository = repository();
    teamMemberRepository.find.mockResolvedValue(input.teamMembers || []);
    teamMemberRepository.exists.mockImplementation(async ({ where }: any) =>
      (input.teamMembers || []).some((member) => member.teamId === where.teamId && member.userId === where.userId),
    );
    const teamRepository = repository();
    teamRepository.find.mockImplementation(async ({ where }: any = {}) => {
      if (where?.managerId) return input.managedTeams || [];
      const requestedIds = Array.isArray(where?.id?._value) ? where.id._value : [];
      const memberTeamIds = [...new Set((input.teamMembers || []).map((member) => member.teamId))];
      return memberTeamIds
        .filter((teamId) => !requestedIds.length || requestedIds.includes(teamId))
        .map((teamId) => ({ id: teamId, unitId: 'unit-1', active: true, managerId: null }));
    });
    teamRepository.findOne.mockImplementation(async ({ where }: any) =>
      (input.managedTeams || []).find((team) => team.id === where.id) || { id: where.id, unitId: where.unitId, active: true, managerId: null },
    );
    const dataSource = { getRepository: jest.fn().mockReturnValue(teamRepository) };
    const lifecycle = { record: jest.fn() };
    const service = new OpportunitiesService(
      opportunityRepository as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      teamMemberRepository as any,
      repository() as any,
      repository() as any,
      repository() as any,
      repository() as any,
      {} as any,
      {} as any,
      {} as any,
      lifecycle as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
    return { service, opportunity, opportunityRepository, teamRepository, lifecycle };
  }

  it('não libera oportunidade individual para outro membro do mesmo time', async () => {
    const { service, opportunity } = accessService({
      opportunity: { id: 'opp-1', unitId: 'unit-1', ownerUserId: 'seller-a', teamId: 'team-1' },
      teamMembers: [{ unitId: 'unit-1', teamId: 'team-1', userId: 'seller-b' }],
    });

    await expect((service as any).canAccessOpportunity(
      opportunity, 'seller-b', 'SALES', GlobalRole.STANDARD,
    )).resolves.toBe(false);
  });

  it('libera fila sem responsável para todos os membros do time, inclusive em múltiplos times', async () => {
    const { service, opportunity } = accessService({
      opportunity: { id: 'opp-1', unitId: 'unit-1', ownerUserId: null, teamId: 'team-2' },
      teamMembers: [
        { unitId: 'unit-1', teamId: 'team-1', userId: 'seller-a' },
        { unitId: 'unit-1', teamId: 'team-2', userId: 'seller-a' },
      ],
    });

    await expect((service as any).canAccessOpportunity(
      opportunity, 'seller-a', 'SALES', GlobalRole.STANDARD,
    )).resolves.toBe(true);
  });

  it('não libera fila comercial para perfis sem atuação em oportunidades', async () => {
    const { service, opportunity } = accessService({
      opportunity: { id: 'opp-1', unitId: 'unit-1', ownerUserId: null, teamId: 'team-1' },
      teamMembers: [{ unitId: 'unit-1', teamId: 'team-1', userId: 'support-1' }],
    });

    await expect((service as any).canAccessOpportunity(
      opportunity, 'support-1', 'SUPPORT', GlobalRole.STANDARD,
    )).resolves.toBe(false);
  });

  it('gerente enxerga todas as oportunidades do time que gerencia, mas não de time em que é apenas membro', async () => {
    const managed = accessService({
      opportunity: { id: 'opp-1', unitId: 'unit-1', ownerUserId: 'seller-a', teamId: 'team-managed' },
      teamMembers: [{ unitId: 'unit-1', teamId: 'team-member-only', userId: 'manager' }],
      managedTeams: [{ id: 'team-managed', unitId: 'unit-1', managerId: 'manager', active: true }],
    });
    await expect((managed.service as any).canAccessOpportunity(
      managed.opportunity, 'manager', 'MANAGER', GlobalRole.STANDARD,
    )).resolves.toBe(true);

    const memberOnly = accessService({
      opportunity: { id: 'opp-2', unitId: 'unit-1', ownerUserId: 'seller-a', teamId: 'team-member-only' },
      teamMembers: [{ unitId: 'unit-1', teamId: 'team-member-only', userId: 'manager' }],
      managedTeams: [],
    });
    await expect((memberOnly.service as any).canAccessOpportunity(
      memberOnly.opportunity, 'manager', 'MANAGER', GlobalRole.STANDARD,
    )).resolves.toBe(false);
  });

  it('persiste corretamente uma atribuição somente ao time, limpando o responsável anterior', async () => {
    const { service, opportunity, opportunityRepository } = accessService({
      opportunity: {
        id: 'opp-1', unitId: 'unit-1', primaryPersonId: 'person-1', ownerUserId: 'seller-a',
        teamId: 'team-1', status: 'OPEN',
      },
      managedTeams: [{ id: 'team-2', unitId: 'unit-1', managerId: null, active: true }],
    });
    jest.spyOn(service, 'detail').mockResolvedValue({ id: 'opp-1' } as any);

    await service.assign(
      'unit-1', 'opp-1', { ownerUserId: null, teamId: 'team-2' },
      'admin-1', 'ADMIN' as any, GlobalRole.STANDARD,
    );

    expect(opportunity.ownerUserId).toBeNull();
    expect(opportunity.teamId).toBe('team-2');
    expect(opportunityRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: null,
      teamId: 'team-2',
    }));
  });
});
