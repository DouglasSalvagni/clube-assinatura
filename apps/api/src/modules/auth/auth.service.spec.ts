import { AuthService } from './auth.service';

describe('AuthService refresh', () => {
  const repository = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value: any) => value),
    create: jest.fn((value: any) => value),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  it('renova somente o access token e mantém o mesmo refresh token válido', async () => {
    const userRepo = repository();
    const membershipRepo = repository();
    const unitRepo = repository();
    const refreshRepo = repository();
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', kind: 'refresh' }),
      signAsync: jest.fn().mockResolvedValue('new-access-token'),
    };

    refreshRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    userRepo.findOne.mockResolvedValue({ id: 'user-1', active: true });

    const service = new AuthService(
      userRepo as any,
      membershipRepo as any,
      unitRepo as any,
      refreshRepo as any,
      jwt as any,
    );

    const refreshToken = `prefix.${'header.payload.signature'}`;
    const result = await service.refresh(refreshToken);

    expect(result).toEqual(expect.objectContaining({
      accessToken: 'new-access-token',
      refreshToken,
    }));
    expect(refreshRepo.save).not.toHaveBeenCalled();
    expect(jwt.verifyAsync).toHaveBeenCalledWith('header.payload.signature', expect.any(Object));
  });

  it('permite duas renovações sequenciais com o mesmo refresh token', async () => {
    const userRepo = repository();
    const membershipRepo = repository();
    const unitRepo = repository();
    const refreshRepo = repository();
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', kind: 'refresh' }),
      signAsync: jest.fn().mockResolvedValueOnce('access-1').mockResolvedValueOnce('access-2'),
    };

    refreshRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    userRepo.findOne.mockResolvedValue({ id: 'user-1', active: true });

    const service = new AuthService(
      userRepo as any,
      membershipRepo as any,
      unitRepo as any,
      refreshRepo as any,
      jwt as any,
    );

    const refreshToken = 'prefix.header.payload.signature';
    expect((await service.refresh(refreshToken)).accessToken).toBe('access-1');
    expect((await service.refresh(refreshToken)).accessToken).toBe('access-2');
    expect(refreshRepo.findOne).toHaveBeenCalledTimes(2);
  });
});
