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
});
