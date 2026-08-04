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
