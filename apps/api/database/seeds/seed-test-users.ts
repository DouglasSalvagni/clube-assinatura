import 'reflect-metadata';
import AppDataSource from '../../src/database/data-source';
import { GlobalRole, UnitRole } from '../../src/database/entities';
import { ensureTeam, ensureUnit, ensureUserMembership, printCredentials, TEST_PASSWORD } from './seed-helpers';

const roleSpecs: Array<{ suffix: string; label: string; role: UnitRole }> = [
  { suffix: 'owner', label: 'Proprietário', role: UnitRole.OWNER },
  { suffix: 'admin', label: 'Administrador', role: UnitRole.ADMIN },
  { suffix: 'manager', label: 'Gerente', role: UnitRole.MANAGER },
  { suffix: 'sales', label: 'Negociador', role: UnitRole.SALES },
  { suffix: 'finance', label: 'Financeiro', role: UnitRole.FINANCE },
  { suffix: 'support', label: 'Atendimento', role: UnitRole.SUPPORT },
  { suffix: 'viewer', label: 'Visualizador', role: UnitRole.VIEWER },
];

async function run() {
  await AppDataSource.initialize();

  const matrix = await ensureUnit(AppDataSource, {
    slug: process.env.SEED_MATRIX_SLUG ?? 'matriz',
    name: process.env.SEED_MATRIX_NAME ?? 'Matriz DNA Care',
    legalName: 'DNA Care Matriz Ltda.',
    taxId: '11222333000181',
    isMatrix: true,
  });
  const branch = await ensureUnit(AppDataSource, {
    slug: process.env.SEED_BRANCH_SLUG ?? 'filial-centro',
    name: process.env.SEED_BRANCH_NAME ?? 'Sede Centro',
    legalName: 'DNA Care Sede Centro Ltda.',
    taxId: '11444777000161',
    isMatrix: false,
  });

  const credentials: Array<{ unit: string; role: string; email: string }> = [];
  const usersByUnit: Record<string, Record<string, string>> = {};
  for (const unit of [matrix, branch]) {
    const unitKey = unit.slug.replace(/[^a-z0-9]+/g, '-');
    usersByUnit[unit.id] = {};
    for (const spec of roleSpecs) {
      const key = `teste.${unitKey}.${spec.suffix}`;
      const user = await ensureUserMembership(AppDataSource, unit, {
        key,
        name: `${spec.label} — ${unit.name}`,
        role: spec.role,
        phone: `5199${String(credentials.length + 100000).slice(-6)}`,
      });
      usersByUnit[unit.id][spec.suffix] = user.id;
      credentials.push({ unit: unit.name, role: spec.role, email: user.email });
    }
  }

  const installationAdmin = await ensureUserMembership(AppDataSource, matrix, {
    key: 'teste.superadmin',
    name: 'Superadministrador de Testes',
    role: UnitRole.OWNER,
    globalRole: GlobalRole.INSTALLATION_ADMIN,
  });
  credentials.unshift({ unit: 'Todas as sedes', role: GlobalRole.INSTALLATION_ADMIN, email: installationAdmin.email });

  for (const unit of [matrix, branch]) {
    await ensureTeam(AppDataSource, unit.id, 'Equipe Comercial de Testes', [
      usersByUnit[unit.id].manager,
      usersByUnit[unit.id].sales,
    ], usersByUnit[unit.id].manager);
  }

  printCredentials('Usuários de teste criados/atualizados', credentials);
  console.log(`Matriz: ${matrix.id} (${matrix.slug})`);
  console.log(`Sede não matriz: ${branch.id} (${branch.slug})`);
  console.log(`Para redefinir senhas existentes para ${TEST_PASSWORD}, execute com SEED_RESET_PASSWORDS=true.`);
}

run()
  .then(async () => AppDataSource.destroy())
  .catch(async (error) => {
    console.error('Falha ao criar estrutura e usuários de teste:', error);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  });
