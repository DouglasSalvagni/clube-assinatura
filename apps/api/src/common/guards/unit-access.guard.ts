import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { GlobalRole, Membership, Unit } from '../../database/entities';
import { AuthenticatedRequest } from '../types/request-context';

@Injectable()
export class UnitAccessGuard implements CanActivate {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = String(
      request.headers['x-unit-id'] || request.headers['x-tenant-id'] || '',
    ).trim();

    if (!raw) {
      throw new BadRequestException(
        'Informe a unidade no header x-unit-id.',
      );
    }

    const unitRepo = this.dataSource.getRepository(Unit);
    const membershipRepo = this.dataSource.getRepository(Membership);

    if (raw === 'all' || raw.includes(',')) {
      if (request.user.globalRole !== GlobalRole.INSTALLATION_ADMIN) {
        throw new ForbiddenException(
          'Seleção de múltiplas unidades restrita ao administrador da instalação.',
        );
      }

      if (raw === 'all') {
        request.unitIds = null;
        request.unitId = undefined;
        return true;
      }

      const refs = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const units = await unitRepo.find({
        where: [
          { id: In(refs), active: true },
          { slug: In(refs), active: true },
        ],
      });

      const ids = [...new Set(units.map((unit) => unit.id))];

      if (ids.length !== refs.length) {
        throw new BadRequestException(
          'Uma ou mais unidades não foram encontradas.',
        );
      }

      request.unitIds = ids;
      request.unitId = ids.length === 1 ? ids[0] : undefined;
      return true;
    }

    const unit = await unitRepo.findOne({
      where: [
        { id: raw, active: true },
        { slug: raw, active: true },
      ],
    });

    if (!unit) {
      throw new BadRequestException(
        'Unidade não encontrada ou inativa.',
      );
    }

    let membership: Membership | null = null;

    if (request.user.globalRole !== GlobalRole.INSTALLATION_ADMIN) {
      membership = await membershipRepo.findOne({
        where: {
          userId: request.user.id,
          unitId: unit.id,
          active: true,
        },
      });

      if (!membership) {
        throw new ForbiddenException(
          'Usuário sem acesso a esta unidade.',
        );
      }
    }

    request.unit = unit;
    request.unitId = unit.id;
    request.unitIds = [unit.id];
    request.membership = membership;

    return true;
  }
}
