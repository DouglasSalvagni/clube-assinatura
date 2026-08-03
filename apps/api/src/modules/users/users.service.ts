import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { GlobalRole, Membership, UnitRole, User } from '../../database/entities';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const roleFromLegacy: Record<string, UnitRole> = {
  'super-admin': UnitRole.OWNER,
  administrador: UnitRole.ADMIN,
  gerente: UnitRole.MANAGER,
  representante: UnitRole.SALES,
  financeiro: UnitRole.FINANCE,
  suporte: UnitRole.SUPPORT,
  visualizador: UnitRole.VIEWER,
};

const roleToLegacy: Record<UnitRole, string> = {
  [UnitRole.OWNER]: 'administrador',
  [UnitRole.ADMIN]: 'administrador',
  [UnitRole.MANAGER]: 'gerente',
  [UnitRole.SALES]: 'representante',
  [UnitRole.FINANCE]: 'financeiro',
  [UnitRole.SUPPORT]: 'suporte',
  [UnitRole.VIEWER]: 'visualizador',
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
  ) {}

  async list(unitIds: string[] | null, currentUser: User) {
    if (unitIds === null) {
      this.assertInstallationAdmin(currentUser);
      const users = await this.userRepository.find({ order: { name: 'ASC' } });
      const memberships = await this.membershipRepository.find();
      const data = users.flatMap((user) => {
        const links = memberships.filter((membership) => membership.userId === user.id);
        if (!links.length) return [this.serialize(user, null)];
        return links.map((membership) => this.serialize(user, membership));
      });
      return { data, total: data.length };
    }

    const memberships = await this.membershipRepository.find({
      where: { unitId: In(unitIds), active: true },
    });
    const users = memberships.length
      ? await this.userRepository.find({
          where: { id: In([...new Set(memberships.map((membership) => membership.userId))]) },
          order: { name: 'ASC' },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    const data = memberships
      .map((membership) => {
        const user = byId.get(membership.userId);
        return user ? this.serialize(user, membership) : null;
      })
      .filter(Boolean);
    return { data, total: data.length };
  }

  async create(unitId: string, dto: CreateUserDto, currentUser: User) {
    const isInstallationAdmin = currentUser.globalRole === GlobalRole.INSTALLATION_ADMIN;
    if (dto.tenantId && !isInstallationAdmin && dto.tenantId !== unitId) {
      throw new ForbiddenException('Não é permitido criar usuários em outra unidade.');
    }
    if (dto.role === 'super-admin' && !isInstallationAdmin) {
      throw new ForbiddenException('Apenas administradores da instalação podem criar outro administrador da instalação.');
    }

    const targetUnitId = isInstallationAdmin && dto.tenantId ? dto.tenantId : unitId;
    if (!targetUnitId) throw new ForbiddenException('Selecione uma unidade para criar o usuário.');

    const normalizedEmail = dto.email.trim().toLowerCase();
    let user = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (user && await this.membershipRepository.exists({ where: { userId: user.id, unitId: targetUnitId } })) {
      throw new ConflictException('Este usuário já pertence à unidade.');
    }

    if (!user) {
      user = await this.userRepository.save(this.userRepository.create({
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(dto.password, 12),
        globalRole: dto.role === 'super-admin' ? GlobalRole.INSTALLATION_ADMIN : GlobalRole.STANDARD,
        active: true,
        phone: null,
        asaasWalletId: null,
        lastLoginAt: null,
      }));
    } else if (dto.role === 'super-admin' && user.globalRole !== GlobalRole.INSTALLATION_ADMIN) {
      user.globalRole = GlobalRole.INSTALLATION_ADMIN;
      user.active = true;
      await this.userRepository.save(user);
    }

    const membership = await this.membershipRepository.save(this.membershipRepository.create({
      unitId: targetUnitId,
      userId: user.id,
      role: roleFromLegacy[dto.role || 'representante'] || UnitRole.SALES,
      active: true,
    }));
    return this.serialize(user, membership);
  }

  async update(
    id: string,
    unitId: string | undefined,
    dto: UpdateUserDto,
    currentUser: User,
  ) {
    const isInstallationAdmin = currentUser.globalRole === GlobalRole.INSTALLATION_ADMIN;
    if (dto.tenantId && !isInstallationAdmin && dto.tenantId !== unitId) {
      throw new ForbiddenException('Não é permitido alterar associações de outra unidade.');
    }

    const targetUnitId = isInstallationAdmin && dto.tenantId ? dto.tenantId : unitId;
    let membership: Membership | null = null;
    if (targetUnitId) {
      membership = await this.membershipRepository.findOne({
        where: { userId: id, unitId: targetUnitId },
      });
    }

    if (!isInstallationAdmin && !membership) {
      throw new NotFoundException('Usuário não encontrado nesta unidade.');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (!isInstallationAdmin && user.globalRole === GlobalRole.INSTALLATION_ADMIN) {
      throw new ForbiddenException('Administradores de unidade não podem alterar administradores da instalação.');
    }

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== user.email && await this.userRepository.exists({
        where: { email: normalizedEmail, id: Not(user.id) },
      })) {
        throw new ConflictException('Email já utilizado.');
      }
      user.email = normalizedEmail;
    }
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 12);

    if (dto.is_platform_admin !== undefined) {
      this.assertInstallationAdmin(currentUser);
      if (id === currentUser.id && !dto.is_platform_admin) {
        throw new ForbiddenException('Você não pode remover o próprio acesso de administrador da instalação.');
      }
      if (!dto.is_platform_admin && user.globalRole === GlobalRole.INSTALLATION_ADMIN) {
        await this.assertAnotherInstallationAdminExists(user.id);
      }
      user.globalRole = dto.is_platform_admin ? GlobalRole.INSTALLATION_ADMIN : GlobalRole.STANDARD;
    } else if (dto.role === 'super-admin') {
      this.assertInstallationAdmin(currentUser);
      user.globalRole = GlobalRole.INSTALLATION_ADMIN;
    }

    if (isInstallationAdmin && dto.active !== undefined) {
      if (id === currentUser.id && !dto.active) {
        throw new ForbiddenException('Você não pode desativar a própria conta.');
      }
      if (!dto.active && user.globalRole === GlobalRole.INSTALLATION_ADMIN) {
        await this.assertAnotherInstallationAdminExists(user.id);
      }
      user.active = dto.active;
    }
    await this.userRepository.save(user);

    if (targetUnitId) {
      if (!membership) {
        if (!isInstallationAdmin) throw new ForbiddenException();
        membership = this.membershipRepository.create({
          userId: id,
          unitId: targetUnitId,
          role: UnitRole.SALES,
          active: true,
        });
      }
      if (dto.role && dto.role !== 'super-admin') {
        membership.role = roleFromLegacy[dto.role] || membership.role;
      }
      if (dto.active !== undefined && !isInstallationAdmin) membership.active = dto.active;
      if (dto.active !== undefined && isInstallationAdmin) membership.active = dto.active;
      membership = await this.membershipRepository.save(membership);
    }

    return this.serialize(user, membership);
  }

  async deactivate(id: string, unitId: string | undefined, currentUser: User): Promise<void> {
    if (id === currentUser.id) throw new ForbiddenException('Você não pode desativar a própria conta.');

    const isInstallationAdmin = currentUser.globalRole === GlobalRole.INSTALLATION_ADMIN;
    if (unitId) {
      const membership = await this.membershipRepository.findOne({ where: { userId: id, unitId } });
      if (!membership) throw new NotFoundException('Usuário não encontrado nesta unidade.');
      const target = await this.userRepository.findOne({ where: { id } });
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      if (!isInstallationAdmin && target.globalRole === GlobalRole.INSTALLATION_ADMIN) {
        throw new ForbiddenException('Administradores de unidade não podem remover administradores da instalação.');
      }
      membership.active = false;
      await this.membershipRepository.save(membership);
      return;
    }

    this.assertInstallationAdmin(currentUser);
    const target = await this.userRepository.findOne({ where: { id } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.globalRole === GlobalRole.INSTALLATION_ADMIN) {
      await this.assertAnotherInstallationAdminExists(target.id);
    }
    target.active = false;
    await this.userRepository.save(target);
  }

  serialize(user: User, membership: Membership | null) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      active: membership ? membership.active && user.active : user.active,
      role: user.globalRole === GlobalRole.INSTALLATION_ADMIN
        ? 'super-admin'
        : membership ? roleToLegacy[membership.role] : 'representante',
      globalRole: user.globalRole,
      is_platform_admin: user.globalRole === GlobalRole.INSTALLATION_ADMIN,
      tenant_id: membership?.unitId || null,
      tenantId: membership?.unitId || null,
      asaasWalletId: user.asaasWalletId,
    };
  }

  private assertInstallationAdmin(user: User) {
    if (user.globalRole !== GlobalRole.INSTALLATION_ADMIN) {
      throw new ForbiddenException('Acesso restrito ao administrador da instalação.');
    }
  }

  private async assertAnotherInstallationAdminExists(excludedUserId: string) {
    const count = await this.userRepository.count({
      where: {
        globalRole: GlobalRole.INSTALLATION_ADMIN,
        active: true,
        id: Not(excludedUserId),
      },
    });
    if (count === 0) {
      throw new ForbiddenException('A instalação deve manter pelo menos um administrador ativo.');
    }
  }
}
