import { ForbiddenException } from '@nestjs/common';
import { GlobalRole, UnitRole } from '../../database/entities';
import { OpportunityDistributionService } from './opportunity-distribution.service';

function repository(overrides: Record<string, any> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as any;
}

function service(options: Record<string, any> = {}) {
  const opportunities = options.opportunities || repository();
  const people = options.people || repository();
  const teams = options.teams || repository();
  const teamMembers = options.teamMembers || repository();
  const memberships = options.memberships || repository();
  const users = options.users || repository();
  const dataSource = options.dataSource || { transaction: jest.fn() };
  return new OpportunityDistributionService(
    opportunities,
    people,
    teams,
    teamMembers,
    memberships,
    users,
    dataSource as any,
  );
}

describe('OpportunityDistributionService', () => {
  it('permite que o mesmo gerente administre mais de um time', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const teams = repository({
      find: jest.fn().mockResolvedValue([
        { id: 'team-a', name: 'Time A', managerId: 'manager-1' },
        { id: 'team-b', name: 'Time B', managerId: 'manager-1' },
      ]),
    });
    const opportunities = repository({ createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) });
    const target = service({ teams, opportunities });

    const result = await target.manageableTeams(
      'unit-1', 'manager-1', UnitRole.MANAGER, GlobalRole.STANDARD,
    );

    expect(result.data).toHaveLength(2);
    expect(teams.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { unitId: 'unit-1', active: true, managerId: 'manager-1' },
    }));
  });

  it('não permite que um gerente distribua um time que não gerencia', async () => {
    const teams = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'team-a', unitId: 'unit-1', managerId: 'other-manager', active: true }),
    });
    const target = service({ teams });

    await expect(target.dashboard(
      'unit-1', 'team-a', 'manager-1', UnitRole.MANAGER, GlobalRole.STANDARD,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});
