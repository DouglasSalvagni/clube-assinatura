import bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import {
  GlobalRole,
  Membership,
  Team,
  TeamMember,
  Unit,
  UnitRole,
  User,
} from '../../src/database/entities';

export const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD ?? 'Test1234!';

export async function ensureUnit(
  dataSource: DataSource,
  input: { slug: string; name: string; legalName?: string; taxId?: string; isMatrix?: boolean },
) {
  const repository = dataSource.getRepository(Unit);
  let unit = await repository.findOne({ where: { slug: input.slug } });
  if (!unit) {
    unit = repository.create({
      slug: input.slug,
      name: input.name,
      legalName: input.legalName ?? input.name,
      taxId: input.taxId ?? null,
      timezone: process.env.INSTALLATION_TIMEZONE ?? 'America/Sao_Paulo',
      active: true,
      branding: { productName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'DNA Care' },
      settings: {
        isMatrix: input.isMatrix === true,
        commercialNegotiationV2Enabled: true,
      },
    });
  } else {
    unit.name = input.name;
    unit.legalName = input.legalName ?? unit.legalName;
    unit.taxId = input.taxId ?? unit.taxId;
    unit.active = true;
    unit.settings = {
      ...(unit.settings || {}),
      isMatrix: input.isMatrix === true,
      commercialNegotiationV2Enabled: true,
    };
  }
  return repository.save(unit);
}

export async function ensureUserMembership(
  dataSource: DataSource,
  unit: Unit,
  input: {
    key: string;
    name: string;
    role: UnitRole;
    globalRole?: GlobalRole;
    phone?: string;
  },
) {
  const users = dataSource.getRepository(User);
  const memberships = dataSource.getRepository(Membership);
  const domain = process.env.SEED_TEST_EMAIL_DOMAIN ?? 'dna.test';
  const email = `${input.key}@${domain}`.toLowerCase();

  let user = await users.findOne({ where: { email } });
  if (!user) {
    user = users.create({
      email,
      name: input.name,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 12),
      globalRole: input.globalRole ?? GlobalRole.STANDARD,
      active: true,
      phone: input.phone ?? null,
      asaasWalletId: null,
      lastLoginAt: null,
    });
  } else {
    user.name = input.name;
    user.globalRole = input.globalRole ?? user.globalRole;
    user.active = true;
    user.phone = input.phone ?? user.phone;
    if (process.env.SEED_RESET_PASSWORDS === 'true') {
      user.passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    }
  }
  user = await users.save(user);

  let membership = await memberships.findOne({ where: { unitId: unit.id, userId: user.id } });
  if (!membership) {
    membership = memberships.create({ unitId: unit.id, userId: user.id, role: input.role, active: true });
  } else {
    membership.role = input.role;
    membership.active = true;
  }
  await memberships.save(membership);
  return user;
}

export async function ensureTeam(
  dataSource: DataSource,
  unitId: string,
  name: string,
  userIds: string[],
) {
  const teams = dataSource.getRepository(Team);
  const members = dataSource.getRepository(TeamMember);
  let team = await teams.findOne({ where: { unitId, name } });
  if (!team) {
    team = await teams.save(teams.create({
      unitId,
      name,
      description: 'Equipe criada para testes automatizados e manuais.',
      active: true,
    }));
  }
  for (const userId of userIds) {
    const exists = await members.findOne({ where: { unitId, teamId: team.id, userId } });
    if (!exists) await members.save(members.create({ unitId, teamId: team.id, userId }));
  }
  return team;
}

export function printCredentials(title: string, rows: Array<{ unit: string; role: string; email: string }>) {
  console.log(`\n${title}`);
  console.table(rows);
  console.log(`Senha padrão: ${TEST_PASSWORD}`);
}
