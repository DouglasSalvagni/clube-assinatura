import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { GlobalRole, Membership, RefreshToken, Unit, User } from '../../database/entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Membership) private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(Unit) private readonly unitRepo: Repository<Unit>,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  async login(email: string, password: string, adminOnly = false, metadata?: { userAgent?: string; ip?: string }) {
    const user = await this.userRepo.findOne({ where: { email: email.trim().toLowerCase(), active: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Email ou senha inválidos.');
    if (adminOnly && user.globalRole !== GlobalRole.INSTALLATION_ADMIN) throw new UnauthorizedException('Acesso administrativo não autorizado.');

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);
    const accessToken = await this.jwt.signAsync({ sub: user.id }, {
      secret: process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-me',
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = `${randomBytes(32).toString('hex')}.${await this.jwt.signAsync({ sub: user.id, kind: 'refresh' }, {
      secret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me',
      expiresIn: `${Number(process.env.JWT_REFRESH_TTL_DAYS || 30)}d`,
    })}`;
    const expiresAt = new Date(Date.now() + Number(process.env.JWT_REFRESH_TTL_DAYS || 30) * 86_400_000);
    await this.refreshRepo.save(this.refreshRepo.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt,
      revokedAt: null,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ip || null,
    }));

    const available = await this.availableUnits(user);
    return { accessToken, refreshToken, expiresIn: process.env.JWT_ACCESS_TTL || '15m', tenantId: available[0]?.id || null, unitId: available[0]?.id || null, user: this.serializeUser(user) };
  }

  async refresh(rawToken: string) {
    const stored = await this.refreshRepo.findOne({ where: { tokenHash: this.hashToken(rawToken), revokedAt: IsNull() } });
    if (!stored || stored.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Refresh token inválido.');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(rawToken.split('.').slice(1).join('.'), { secret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me' });
      const user = await this.userRepo.findOne({ where: { id: payload.sub, active: true } });
      if (!user) throw new UnauthorizedException();
      stored.revokedAt = new Date();
      await this.refreshRepo.save(stored);
      return this.loginWithoutPassword(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido.');
    }
  }

  private async loginWithoutPassword(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-me', expiresIn: process.env.JWT_ACCESS_TTL || '15m' });
    const refreshToken = `${randomBytes(32).toString('hex')}.${await this.jwt.signAsync({ sub: user.id, kind: 'refresh' }, { secret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me', expiresIn: `${Number(process.env.JWT_REFRESH_TTL_DAYS || 30)}d` })}`;
    await this.refreshRepo.save(this.refreshRepo.create({ userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_TTL_DAYS || 30) * 86_400_000), revokedAt: null, userAgent: null, ipAddress: null }));
    return { accessToken, refreshToken, expiresIn: process.env.JWT_ACCESS_TTL || '15m' };
  }

  async logout(rawToken: string): Promise<void> {
    await this.refreshRepo.update({ tokenHash: this.hashToken(rawToken), revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async availableUnits(user: User): Promise<Unit[]> {
    if (user.globalRole === GlobalRole.INSTALLATION_ADMIN) return this.unitRepo.find({ where: { active: true }, order: { name: 'ASC' } });
    const memberships = await this.membershipRepo.find({ where: { userId: user.id, active: true } });
    if (!memberships.length) return [];
    return this.unitRepo.createQueryBuilder('unit').where('unit.id IN (:...ids)', { ids: memberships.map((item) => item.unitId) }).andWhere('unit.active = true').orderBy('unit.name', 'ASC').getMany();
  }

  async me(user: User) {
    const memberships = await this.membershipRepo.find({ where: { userId: user.id, active: true } });
    return { ...this.serializeUser(user), memberships, units: await this.availableUnits(user) };
  }

  serializeUser(user: User) {
    return { id: user.id, email: user.email, name: user.name, phone: user.phone, globalRole: user.globalRole, role: user.globalRole === GlobalRole.INSTALLATION_ADMIN ? 'super_admin' : 'user', is_platform_admin: user.globalRole === GlobalRole.INSTALLATION_ADMIN, active: user.active };
  }
}
