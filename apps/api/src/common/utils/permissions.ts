import { GlobalRole, UnitRole } from '../../database/entities';

export const PERMISSIONS = {
  UNIT_MANAGE: 'unit.manage',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  TEAMS_READ: 'teams.read',
  TEAMS_MANAGE: 'teams.manage',
  PEOPLE_READ: 'people.read',
  PEOPLE_MANAGE: 'people.manage',
  PLANS_READ: 'plans.read',
  PLANS_MANAGE: 'plans.manage',
  OPPORTUNITIES_READ: 'opportunities.read',
  OPPORTUNITIES_MANAGE: 'opportunities.manage',
  OPPORTUNITIES_ASSIGN: 'opportunities.assign',
  NEGOTIATIONS_EDIT: 'negotiations.edit',
  NEGOTIATIONS_REQUEST_APPROVAL: 'negotiations.request_approval',
  NEGOTIATIONS_APPROVE: 'negotiations.approve',
  CHECKOUT_GENERATE: 'checkout.generate',
  COMMERCIAL_CONFIG_MANAGE: 'commercial.config.manage',
  SUBSCRIPTIONS_READ: 'subscriptions.read',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  SALES_READ: 'sales.read',
  SALES_MANAGE: 'sales.manage',
  REPORTS_READ: 'reports.read',
  REPORTS_EXPORT: 'reports.export',
  AUDIT_READ: 'audit.read',
} as const;

const ALL = Object.values(PERMISSIONS);
const rolePermissions: Record<UnitRole, string[]> = {
  [UnitRole.OWNER]: ALL,
  [UnitRole.ADMIN]: ALL,
  [UnitRole.MANAGER]: ALL.filter(
    (permission) => ![
      PERMISSIONS.UNIT_MANAGE,
      PERMISSIONS.BILLING_MANAGE,
      PERMISSIONS.COMMERCIAL_CONFIG_MANAGE,
      PERMISSIONS.USERS_MANAGE,
    ].includes(permission as any),
  ),
  [UnitRole.SALES]: [
    PERMISSIONS.TEAMS_READ,
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PEOPLE_MANAGE,
    PERMISSIONS.PLANS_READ,
    PERMISSIONS.OPPORTUNITIES_READ,
    PERMISSIONS.OPPORTUNITIES_MANAGE,
    PERMISSIONS.NEGOTIATIONS_EDIT,
    PERMISSIONS.NEGOTIATIONS_REQUEST_APPROVAL,
    PERMISSIONS.CHECKOUT_GENERATE,
    PERMISSIONS.SUBSCRIPTIONS_READ,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.REPORTS_READ,
  ],
  [UnitRole.FINANCE]: [
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PLANS_READ,
    PERMISSIONS.SUBSCRIPTIONS_READ,
    PERMISSIONS.SUBSCRIPTIONS_MANAGE,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.SALES_MANAGE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
  ],
  [UnitRole.SUPPORT]: [
    PERMISSIONS.TEAMS_READ,
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PEOPLE_MANAGE,
    PERMISSIONS.PLANS_READ,
    PERMISSIONS.OPPORTUNITIES_READ,
    PERMISSIONS.SUBSCRIPTIONS_READ,
    PERMISSIONS.SUBSCRIPTIONS_MANAGE,
    PERMISSIONS.BILLING_READ,
  ],
  [UnitRole.VIEWER]: [
    PERMISSIONS.TEAMS_READ,
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PLANS_READ,
    PERMISSIONS.OPPORTUNITIES_READ,
    PERMISSIONS.SUBSCRIPTIONS_READ,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.REPORTS_READ,
  ],
};

export function hasPermissions(
  globalRole: GlobalRole,
  unitRole: UnitRole | null | undefined,
  required: string[],
): boolean {
  if (globalRole === GlobalRole.INSTALLATION_ADMIN) return true;
  if (!unitRole) return false;
  const available = rolePermissions[unitRole] || [];
  return required.every((permission) => available.includes(permission));
}
