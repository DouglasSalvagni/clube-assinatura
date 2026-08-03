import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-me',
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub: string }): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub, active: true } });
    if (!user) throw new UnauthorizedException('Sessão inválida.');
    return user;
  }
}
