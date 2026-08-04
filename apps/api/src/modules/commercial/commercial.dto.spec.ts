import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerType, UnitRole } from '../../database/entities';
import { CreateCommercialOfferDto, CreatePolicyDto } from './commercial.dto';

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

describe('CreatePolicyDto', () => {
  it('aceita escopo por tipo de cliente e por perfil real da unidade', async () => {
    const dto = plainToInstance(CreatePolicyDto, {
      name: 'Alçada PJ do comercial',
      customerType: CustomerType.COMPANY,
      targetRole: UnitRole.SALES,
      maxDiscountPercent: 5,
      maxDiscountAmount: 500,
      allowedBillingTypes: ['CREDIT_CARD'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejeita perfis que não existem no enum de papéis da unidade', async () => {
    const dto = plainToInstance(CreatePolicyDto, {
      name: 'Perfil inválido',
      targetRole: 'NEGOTIATOR',
      maxDiscountPercent: 0,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'targetRole')).toBe(true);
  });

  it('rejeita um perfil existente que não possui permissão de negociação', async () => {
    const dto = plainToInstance(CreatePolicyDto, {
      name: 'Política financeira inválida',
      targetRole: UnitRole.FINANCE,
      maxDiscountPercent: 0,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'targetRole')).toBe(true);
  });

});

