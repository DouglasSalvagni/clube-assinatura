import { NotFoundException } from '@nestjs/common';
import { GlobalRole } from '../../database/entities';
import { TeamsService } from './teams.service';

describe('TeamsService unit membership', () => {
  it('rejects adding a standard user who does not belong to the unit', async () => {
    const teamRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'team', unitId: 'unit-a', name: 'Comercial' }),
    };
    const teamMemberRepository = { exists: jest.fn(), save: jest.fn(), create: jest.fn() };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user', active: true, globalRole: GlobalRole.STANDARD }),
    };
    const membershipRepository = { exists: jest.fn().mockResolvedValue(false) };
    const service = new TeamsService(
      teamRepository as any,
      teamMemberRepository as any,
      userRepository as any,
      membershipRepository as any,
    );

    await expect(service.add('unit-a', 'team', 'user')).rejects.toBeInstanceOf(NotFoundException);
    expect(teamMemberRepository.save).not.toHaveBeenCalled();
  });

  it('aceita gerente pertencente à unidade e o inclui como membro do time', async () => {
    const team = { id: 'team', unitId: 'unit-a', name: 'Comercial', managerId: null, active: true };
    const manager = { id: 'manager', active: true, globalRole: GlobalRole.STANDARD, name: 'Gerente' };
    const teamRepository = {
      findOne: jest.fn().mockResolvedValue(team),
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
    };
    const teamMemberRepository = {
      find: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(manager),
      find: jest.fn().mockResolvedValue([manager]),
    };
    const membershipRepository = { exists: jest.fn().mockResolvedValue(true) };
    const service = new TeamsService(
      teamRepository as any,
      teamMemberRepository as any,
      userRepository as any,
      membershipRepository as any,
    );

    const result = await service.update('unit-a', 'team', { managerId: 'manager' });

    expect(team.managerId).toBe('manager');
    expect(teamMemberRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team',
      userId: 'manager',
    }));
    expect(result.manager).toEqual(expect.objectContaining({ id: 'manager', name: 'Gerente' }));
  });

});
