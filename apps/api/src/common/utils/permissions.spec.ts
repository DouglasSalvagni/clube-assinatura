import { GlobalRole, UnitRole } from '../../database/entities';
import { hasPermissions, PERMISSIONS } from './permissions';

describe('permissions', () => {
  it('allows installation administrators across units', () => {
    expect(hasPermissions(GlobalRole.INSTALLATION_ADMIN, undefined, [PERMISSIONS.BILLING_MANAGE])).toBe(true);
  });

  it('does not allow sales users to manage billing credentials', () => {
    expect(hasPermissions(GlobalRole.STANDARD, UnitRole.SALES, [PERMISSIONS.BILLING_MANAGE])).toBe(false);
  });

  it('allows sales users to claim or release opportunities through the guarded assignment endpoint', () => {
    expect(hasPermissions(GlobalRole.STANDARD, UnitRole.SALES, [PERMISSIONS.OPPORTUNITIES_ASSIGN])).toBe(true);
  });

  it('allows finance users to manage billing', () => {
    expect(hasPermissions(GlobalRole.STANDARD, UnitRole.FINANCE, [PERMISSIONS.BILLING_MANAGE])).toBe(true);
  });
});
