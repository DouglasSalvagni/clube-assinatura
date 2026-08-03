import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import AppDataSource from '../../src/database/data-source';
import {
  BillingCycle,
  BillingType,
  GlobalRole,
  Membership,
  Plan,
  PlanPrice,
  Unit,
  UnitRole,
  User,
} from '../../src/database/entities';

async function seed() {
  await AppDataSource.initialize();

  const unitRepository = AppDataSource.getRepository(Unit);
  const userRepository = AppDataSource.getRepository(User);
  const membershipRepository = AppDataSource.getRepository(Membership);
  const planRepository = AppDataSource.getRepository(Plan);
  const priceRepository = AppDataSource.getRepository(PlanPrice);

  const unitSlug = process.env.SEED_UNIT_SLUG ?? 'matriz';
  let unit = await unitRepository.findOne({ where: { slug: unitSlug } });
  if (!unit) {
    unit = await unitRepository.save(unitRepository.create({
      slug: unitSlug,
      name: process.env.SEED_UNIT_NAME ?? 'Unidade Matriz',
      timezone: process.env.INSTALLATION_TIMEZONE ?? 'America/Sao_Paulo',
      active: true,
      branding: {
        productName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'ClubFlow',
      },
      settings: {},
    }));
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  let user = await userRepository.findOne({ where: { email } });
  if (!user) {
    user = await userRepository.save(userRepository.create({
      email,
      name: process.env.SEED_ADMIN_NAME ?? 'Administrador da Instalação',
      passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 12),
      globalRole: GlobalRole.INSTALLATION_ADMIN,
      active: true,
    }));
  }

  const membership = await membershipRepository.findOne({ where: { userId: user.id, unitId: unit.id } });
  if (!membership) {
    await membershipRepository.save(membershipRepository.create({
      unitId: unit.id,
      userId: user.id,
      role: UnitRole.OWNER,
      active: true,
    }));
  }

  let plan = await planRepository.findOne({ where: { unitId: unit.id, code: 'STANDARD' } });
  if (!plan) {
    plan = await planRepository.save(planRepository.create({
      unitId: unit.id,
      code: 'STANDARD',
      name: 'Plano Padrão',
      description: 'Plano inicial criado pelo seed. Ajuste-o antes de iniciar a operação.',
      active: true,
      maxDependents: 4,
      benefits: [],
      metadata: {},
    }));
  }

  const price = await priceRepository.findOne({ where: { unitId: unit.id, planId: plan.id, version: 1 } });
  if (!price) {
    await priceRepository.save(priceRepository.create({
      unitId: unit.id,
      planId: plan.id,
      version: 1,
      amount: '99.90',
      billingCycle: BillingCycle.MONTHLY,
      billingType: BillingType.UNDEFINED,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: null,
      active: true,
    }));
  }

  console.log(`Seed concluído. Usuário: ${email}; unidade: ${unit.name}`);
  await AppDataSource.destroy();
}

seed().catch(async (error) => {
  console.error(error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
