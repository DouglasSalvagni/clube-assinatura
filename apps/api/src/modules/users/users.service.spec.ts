jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }), { virtual: true });
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GlobalRole, UnitRole, User } from '../../database/entities';
import { UsersService } from './users.service';

describe('UsersService unit isolation', () => {
  const currentUser = { id: 'current', globalRole: GlobalRole.STANDARD } as User;

  function service(membership: unknown = null) {
    const userRepository = {
      findOne: jest.fn(),
      exists: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };
    const membershipRepository = {
      findOne: jest.fn().mockResolvedValue(membership),
      exists: jest.fn(),
      save: jest.fn().mockImplementation(async (item: unknown) => item),
    };
    const unitRepository = {
      exists: jest.fn().mockResolvedValue(true),
    };
    return {
      value: new UsersService(userRepository as any, membershipRepository as any, unitRepository as any),
      userRepository,
      membershipRepository,
      unitRepository,
    };
  }

  it('rejects selecting another unit through the request body', async () => {
    const { value } = service();
    await expect(value.update('target', 'unit-a', { tenantId: '00000000-0000-0000-0000-000000000002' }, currentUser))
      .rejects.toBeInstanceOf(ForbiddenException);
  });


  it('rejects an inactive or nonexistent target unit before creating a membership', async () => {
    const installationAdmin = { id: 'admin', globalRole: GlobalRole.INSTALLATION_ADMIN } as User;
    const { value, unitRepository, membershipRepository } = service();
    unitRepository.exists.mockResolvedValue(false);

    await expect(value.create('unit-a', {
      name: 'User',
      email: 'user@example.com',
      password: 'secure-password',
      tenantId: '00000000-0000-4000-8000-000000000001',
    }, installationAdmin)).rejects.toBeInstanceOf(NotFoundException);

    expect(membershipRepository.save).not.toHaveBeenCalled();
  });

  it('does not load or change a user without membership in the current unit', async () => {
    const { value, userRepository } = service();
    await expect(value.update('target', 'unit-a', { role: 'gerente' }, currentUser))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows loading a user only after a matching membership is resolved', async () => {
    const membership = { id: 'membership', userId: 'target', unitId: 'unit-a', role: UnitRole.SALES, active: true };
    const { value, userRepository } = service(membership);
    userRepository.findOne.mockResolvedValue({ id: 'target', email: 'user@example.com', name: 'User', globalRole: GlobalRole.STANDARD, active: true });
    userRepository.save.mockImplementation(async (item: unknown) => item);
    await value.update('target', 'unit-a', { role: 'gerente' }, currentUser);
    expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 'target' } });
  });
});
