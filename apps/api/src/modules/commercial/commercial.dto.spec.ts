import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerType } from '../../database/entities';
import { CreateCommercialOfferDto } from './commercial.dto';

describe('CreateCommercialOfferDto optional UUID fields', () => {
  it('normalizes empty assignment fields from HTML selects', async () => {
    const dto = plainToInstance(CreateCommercialOfferDto, {
      name: 'Oferta padrão',
      code: 'OFERTA-PADRAO',
      customerType: CustomerType.PERSON,
      assignmentTeamId: '',
      assignmentUserId: '',
    });

    expect(dto.assignmentTeamId).toBeUndefined();
    expect(dto.assignmentUserId).toBeUndefined();
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
