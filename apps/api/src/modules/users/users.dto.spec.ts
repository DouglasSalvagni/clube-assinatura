import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './users.dto';

const basePayload = {
  name: 'Usuário de teste',
  email: 'usuario@example.com',
  password: 'senha-segura',
  role: 'representante',
};

describe('CreateUserDto tenantId', () => {
  it('aceita o UUID da matriz', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...basePayload,
      tenantId: '00000000-0000-4000-8000-000000000001',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejeita slug enviado no campo tenantId', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...basePayload,
      tenantId: 'matriz-nova',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'tenantId')).toBe(true);
  });

  it('normaliza string vazia de campo opcional', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...basePayload,
      tenantId: '',
    });

    expect(dto.tenantId).toBeUndefined();
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
