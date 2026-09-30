import { DataSource } from 'typeorm';
import { BranchScopeService } from './branch-scope.service';
import { AuthorizationContextError } from '../common/context/authorization-context';

describe('readable branch discriminator', () => {
  const actor = { tenantId: 'tenant', userId: 'user', roles: ['tenant_admin'], permissions: [] };
  const entries = [
    { branchId: 'a', name: 'Merkez', code: 'ANKARA' },
    { branchId: 'b', name: 'Merkez', code: 'IZMIR' },
  ];
  const service = new BranchScopeService({} as DataSource);

  it.each(entries)('selects $code independently among identical names', async (entry) => {
    await expect(service.resolveSelection(actor, {
      branchName: entry.name, branchCode: entry.code,
    }, entries)).resolves.toMatchObject({ branchId: entry.branchId });
  });

  it.each([
    { branchName: 'Merkez' },
    { branchName: 'Merkez', branchCode: 'OTHER-TENANT' },
    { branchName: 'Other', branchCode: 'ANKARA' },
    { branchId: 'b', branchCode: 'ANKARA' },
  ])('rejects ambiguous or inconsistent selectors %j', async (selection) => {
    await expect(service.resolveSelection(actor, selection, entries))
      .rejects.toBeInstanceOf(AuthorizationContextError);
  });

  it('does not silently choose a branch when selection is missing', async () => {
    await expect(service.resolveSelection(actor, {}, entries)).resolves.toBeNull();
  });

  it('rejects duplicate codes rather than picking the first row', async () => {
    await expect(service.resolveSelection(actor, { branchCode: 'ANKARA' },
      entries.map((entry) => ({ ...entry, code: 'ANKARA' }))))
      .rejects.toBeInstanceOf(AuthorizationContextError);
  });
});
