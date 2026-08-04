import { ConflictException, NotFoundException } from '@nestjs/common';
import { GlobalRole, UnitRole } from '../../database/entities';
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
    const membershipRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new TeamsService(
      teamRepository as any,
      teamMemberRepository as any,
      userRepository as any,
      membershipRepository as any,
      { exists: jest.fn().mockResolvedValue(false) } as any,
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
    const membershipRepository = { findOne: jest.fn().mockResolvedValue({ userId: 'manager', unitId: 'unit-a', role: UnitRole.MANAGER, active: true }) };
    const service = new TeamsService(
      teamRepository as any,
      teamMemberRepository as any,
      userRepository as any,
      membershipRepository as any,
      { exists: jest.fn().mockResolvedValue(false) } as any,
    );

    const result = await service.update('unit-a', 'team', { managerId: 'manager' });

    expect(team.managerId).toBe('manager');
    expect(teamMemberRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team',
      userId: 'manager',
    }));
    expect(result.manager).toEqual(expect.objectContaining({ id: 'manager', name: 'Gerente' }));
  });

  it('permite que o mesmo usuário participe de mais de um time', async () => {
    const teamRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'team-b', unitId: 'unit-a', name: 'Time B' }),
    };
    const teamMemberRepository = {
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user', active: true, globalRole: GlobalRole.STANDARD }),
    };
    const membershipRepository = { findOne: jest.fn().mockResolvedValue({ userId: 'user', unitId: 'unit-a', role: UnitRole.SALES, active: true }) };
    const service = new TeamsService(
      teamRepository as any,
      teamMemberRepository as any,
      userRepository as any,
      membershipRepository as any,
      { exists: jest.fn().mockResolvedValue(false) } as any,
    );

    await expect(service.add('unit-a', 'team-b', 'user')).resolves.toEqual(expect.objectContaining({
      teamId: 'team-b',
      userId: 'user',
    }));
  });

  it('rejeita usuário sem perfil comercial como membro do time', async () => {
    const service = new TeamsService(
      { findOne: jest.fn().mockResolvedValue({ id: 'team', unitId: 'unit-a', name: 'Comercial' }) } as any,
      { exists: jest.fn().mockResolvedValue(false), save: jest.fn(), create: jest.fn() } as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'support', active: true, globalRole: GlobalRole.STANDARD }) } as any,
      { findOne: jest.fn().mockResolvedValue({ userId: 'support', unitId: 'unit-a', role: UnitRole.SUPPORT, active: true }) } as any,
      { exists: jest.fn().mockResolvedValue(false) } as any,
    );

    await expect(service.add('unit-a', 'team', 'support')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita negociador como gerente formal do time', async () => {
    const team = { id: 'team', unitId: 'unit-a', name: 'Comercial', managerId: null, active: true };
    const service = new TeamsService(
      { findOne: jest.fn().mockResolvedValue(team), exists: jest.fn().mockResolvedValue(false), save: jest.fn(async (value) => value) } as any,
      { exists: jest.fn().mockResolvedValue(false), save: jest.fn(), create: jest.fn() } as any,
      { findOne: jest.fn().mockResolvedValue({ id: 'seller', active: true, globalRole: GlobalRole.STANDARD }) } as any,
      { findOne: jest.fn().mockResolvedValue({ userId: 'seller', unitId: 'unit-a', role: UnitRole.SALES, active: true }) } as any,
      { exists: jest.fn().mockResolvedValue(false) } as any,
    );

    await expect(service.update('unit-a', 'team', { managerId: 'seller' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloqueia a remoção de membro com oportunidades ativas no time', async () => {
    const teamRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'team', unitId: 'unit-a', name: 'Comercial', managerId: null }),
    };
    const service = new TeamsService(
      teamRepository as any,
      { delete: jest.fn() } as any,
      {} as any,
      {} as any,
      { exists: jest.fn().mockResolvedValue(true) } as any,
    );

    await expect(service.removeMember('unit-a', 'team', 'seller')).rejects.toBeInstanceOf(ConflictException);
  });

});
