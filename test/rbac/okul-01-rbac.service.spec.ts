import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RbacService } from '../../src/rbac/rbac.service';
import { RbacPolicyService } from '../../src/rbac/rbac-policy.service';
import { RbacRoleEntity } from '../../src/rbac/rbac-role.entity';
import { RequestUser } from '../../src/common/context/request-context';
import { SystemRole } from '../../src/rbac/roles.extended';

describe('OKUL-01 RbacService — tenant izolasyonu ve policy sarmalama', () => {
  const makeRepo = (rows: Partial<RbacRoleEntity>[] = []) => {
    const store = [...rows];
    return {
      find: jest.fn().mockImplementation((opts: { where?: { tenantId: string } }) =>
        Promise.resolve(store.filter((r) => !opts?.where || r.tenantId === opts.where.tenantId)),
      ),
      findOne: jest.fn().mockImplementation((opts: { where?: { tenantId: string; id: string } }) =>
        Promise.resolve(
          store.find((r) => r.id === opts?.where?.id && r.tenantId === opts?.where?.tenantId) ?? null,
        ),
      ),
    } as unknown as Repository<RbacRoleEntity>;
  };

  const policy = new RbacPolicyService();
  const actor = (
    over: Partial<RequestUser> & { linkedStudentIds?: readonly string[] | null } = {},
  ): RequestUser => ({
    userId: 'u-1',
    tenantId: 'tenant-a',
    roleIds: ['student'],
    permissions: ['student:read'],
    ...over,
  });

  it('listTenantRoles yalnızca aktörün tenant rollerini döndürür', async () => {
    const repo = makeRepo([
      { id: 'r-1', tenantId: 'tenant-a', name: 'student' },
      { id: 'r-2', tenantId: 'tenant-b', name: 'student' },
    ]);
    const service = new RbacService(repo, policy);
    const roles = await service.listTenantRoles(actor());
    expect(roles).toHaveLength(1);
    expect(roles[0].tenantId).toBe('tenant-a');
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' }, order: { name: 'ASC' } });
  });

  it('getTenantRole başka tenant rolünü gizler (NotFound)', async () => {
    const repo = makeRepo([{ id: 'r-9', tenantId: 'tenant-b', name: 'parent' }]);
    const service = new RbacService(repo, policy);
    await expect(service.getTenantRole(actor(), 'r-9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTenantRole kendi tenant rolünü döndürür', async () => {
    const repo = makeRepo([{ id: 'r-1', tenantId: 'tenant-a', name: 'student' }]);
    const service = new RbacService(repo, policy);
    const role = await service.getTenantRole(actor(), 'r-1');
    expect(role.id).toBe('r-1');
  });

  it('tenant scope eksikse Forbidden', async () => {
    const repo = makeRepo();
    const service = new RbacService(repo, policy);
    await expect(service.listTenantRoles(actor({ tenantId: '' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listExtendedRoles OKUL-01 rollerini döndürür', () => {
    const service = new RbacService(makeRepo(), policy);
    expect(service.listExtendedRoles().sort()).toEqual(['parent', 'student', 'teacher_assistant']);
  });

  it('evaluate policy engine kararını tenant izolasyonu ile sarmalar', async () => {
    const repo = makeRepo();
    const service = new RbacService(repo, policy);
    const decision = await service.evaluate(actor({ roleIds: ['student'] as SystemRole[], permissions: ['student:read'] }), {
      permission: 'student:read',
      resource: 'student',
      targetTenantId: 'tenant-a',
    });
    expect(decision.allowed).toBe(true);

    const crossTenant = await service.evaluate(actor({ roleIds: ['student'] as SystemRole[] }), {
      permission: 'student:read',
      resource: 'student',
      targetTenantId: 'tenant-z',
    });
    expect(crossTenant.allowed).toBe(false);
    expect(crossTenant.reasonCode).toBe('tenant_isolation_breach');
  });

  // --- SECURITY (KRİTİK) regression: malformed actor (permissions undefined) ---
  it('resolveEffectivePermissions: permissions undefined iken çökmez', () => {
    const service = new RbacService(makeRepo(), policy);
    // Güvenilmeyen aktör verisi normalize edilir; tanımsız permissions [] olur.
    expect(() =>
      service.resolveEffectivePermissions(actor({ roleIds: ['student'] as SystemRole[], permissions: undefined as unknown as string[] })),
    ).not.toThrow();
  });

  it('evaluate: malformed actor (permissions undefined) 403 döndürür, çökmez', async () => {
    const repo = makeRepo();
    const service = new RbacService(repo, policy);
    const decision = await service.evaluate(
      actor({ roleIds: ['student'] as SystemRole[], permissions: undefined as unknown as string[] }),
      { permission: 'student:read', resource: 'student', targetTenantId: 'tenant-a' },
    );
    // Crash yerine fail-closed 403.
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(403);
  });

  it('evaluate: geçersiz roleId (isSystemRole dışı) filtrelenir', async () => {
    const repo = makeRepo();
    const service = new RbacService(repo, policy);
    // Bilinmeyen rol, isSystemRole ile elenir; student:read izni permissions'ta yok -> 403.
    const decision = await service.evaluate(
      actor({ roleIds: ['not_a_real_role'] as unknown as SystemRole[], permissions: [] }),
      { permission: 'student:read', resource: 'student', targetTenantId: 'tenant-a' },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.statusCode).toBe(403);
  });

  // --- SECURITY (KRİTİK): Veli -> öğrenci sahiplik (cross-student leak) ---
  describe('Veli sahiplik (parent-to-student ownership)', () => {
    const parentActor = (linkedStudentIds: readonly string[] = ['s-1']) =>
      actor({
        roleIds: ['parent'] as SystemRole[],
        permissions: [
          'student:parent_contact:read',
          'student:attendance:read',
          'student:enrollment:read',
        ],
        linkedStudentIds,
      });

    it('veli kendi çocuğunun parent_contact kaydını görebilir', async () => {
      const service = new RbacService(makeRepo(), policy);
      const decision = await service.evaluate(parentActor(['s-1']), {
        permission: 'student:parent_contact:read',
        resource: 'student.parent_contact',
        targetStudentId: 's-1',
      });
      expect(decision.allowed).toBe(true);
    });

    it('veli BAŞKA öğrencinin parent_contact kaydını GÖREMEZ (cross_student_leak)', async () => {
      const service = new RbacService(makeRepo(), policy);
      const decision = await service.evaluate(parentActor(['s-1']), {
        permission: 'student:parent_contact:read',
        resource: 'student.parent_contact',
        targetStudentId: 's-2',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.statusCode).toBe(403);
      expect(decision.reasonCode).toBe('cross_student_leak');
    });

    it('veli linkedStudentIds boşken erişemez (cross_student_leak)', async () => {
      const service = new RbacService(makeRepo(), policy);
      const decision = await service.evaluate(parentActor([]), {
        permission: 'student:attendance:read',
        resource: 'student.attendance',
        targetStudentId: 's-9',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.statusCode).toBe(403);
      expect(decision.reasonCode).toBe('cross_student_leak');
    });

    it('veli kendi çocuğunun attendance kaydını görebilir', async () => {
      const service = new RbacService(makeRepo(), policy);
      const decision = await service.evaluate(parentActor(['s-1']), {
        permission: 'student:attendance:read',
        resource: 'student.attendance',
        targetStudentId: 's-1',
      });
      expect(decision.allowed).toBe(true);
    });

    it('veli kendi çocuğunun enrollment kaydını görebilir', async () => {
      const service = new RbacService(makeRepo(), policy);
      const decision = await service.evaluate(parentActor(['s-1']), {
        permission: 'student:enrollment:read',
        resource: 'student.enrollment',
        targetStudentId: 's-1',
      });
      expect(decision.allowed).toBe(true);
    });
  });
});
