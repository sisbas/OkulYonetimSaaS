import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { RoomAuditService } from './room-audit.service';
import { Room, RoomStatus } from './room.entity';
import { RoomRepository } from './room.repository';
import { RoomService } from './room.service';

function room(overrides: Partial<Room> = {}): Room {
  const now = new Date('2026-07-14T00:00:00.000Z');
  return {
    id: 'room-1',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    name: 'Derslik 1',
    code: 'D1',
    capacity: 24,
    description: 'Birinci derslik',
    status: RoomStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
    ...overrides,
  } as Room;
}

function setup() {
  const repository = {
    create: jest.fn(),
    existsByIdAnyTenant: jest.fn(),
    existsByIdInTenant: jest.fn(),
    findByCode: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<RoomRepository>;
  const audit = { emit: jest.fn(), emitTenantAccessDenied: jest.fn() } as unknown as jest.Mocked<RoomAuditService>;
  const service = new RoomService(repository, audit);
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['room:create'] },
  };
  return { audit, ctx, repository, service };
}

describe('RoomService', () => {
  it('creates a room and emits room.created without raw payload values', async () => {
    const { audit, ctx, repository, service } = setup();
    const created = room({ description: 'token=secret should not be audited' });
    repository.findByCode.mockResolvedValue(null);
    repository.create.mockResolvedValue(created);

    const result = await service.create(ctx, {
      branchId: 'branch-a',
      name: ' Derslik 1 ',
      code: 'd1',
      capacity: 24,
      description: 'token=secret should not be audited',
    });

    expect(result.id).toBe('room-1');
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'branch-a', 'D1');
    expect(repository.create).toHaveBeenCalledWith(ctx, {
      branchId: 'branch-a',
      name: 'Derslik 1',
      code: 'D1',
      capacity: 24,
      description: 'token=secret should not be audited',
    });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.created', expect.objectContaining({ roomId: 'room-1', branchId: 'branch-a' }));
    expect(JSON.stringify(audit.emit.mock.calls[0])).not.toContain('secret');
  });

  it('rejects blank names and invalid capacity after normalization', async () => {
    const { ctx, service } = setup();

    await expect(service.create(ctx, { branchId: 'branch-a', name: '   ', code: 'D1' })).rejects.toThrow(BadRequestException);
    await expect(service.create(ctx, { branchId: 'branch-a', name: 'Derslik 1', capacity: 0 })).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate code inside the same tenant branch', async () => {
    const { ctx, repository, service } = setup();
    repository.findByCode.mockResolvedValue(room());

    await expect(service.create(ctx, { branchId: 'branch-a', name: 'Derslik 1', code: 'D1' })).rejects.toThrow(ConflictException);
  });

  it('lists paginated rooms', async () => {
    const { ctx, repository, service } = setup();
    repository.list.mockResolvedValue({ data: [room()], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });

    await expect(service.list(ctx, { page: '1', limit: '20', branchId: 'branch-a' })).resolves.toMatchObject({ meta: { total: 1 } });
    expect(repository.list).toHaveBeenCalledWith(ctx, { page: '1', limit: '20', branchId: 'branch-a' });
  });

  it('hides missing records as 404 without tenant access denied audit', async () => {
    const { audit, ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(null);
    repository.existsByIdInTenant.mockResolvedValue(false);
    repository.existsByIdAnyTenant.mockResolvedValue(false);

    await expect(service.get(ctx, 'missing-room')).rejects.toThrow(NotFoundException);
    expect(audit.emitTenantAccessDenied).not.toHaveBeenCalled();
  });

  it('does not emit tenant.access_denied for same-tenant inactive rooms hidden from active GET', async () => {
    const { audit, ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(null);
    repository.existsByIdInTenant.mockResolvedValue(true);

    await expect(service.get(ctx, 'inactive-same-tenant-room')).rejects.toThrow(NotFoundException);
    expect(repository.existsByIdAnyTenant).not.toHaveBeenCalled();
    expect(audit.emitTenantAccessDenied).not.toHaveBeenCalled();
  });

  it('emits tenant.access_denied while still hiding cross-tenant records as 404', async () => {
    const { audit, ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(null);
    repository.existsByIdInTenant.mockResolvedValue(false);
    repository.existsByIdAnyTenant.mockResolvedValue(true);

    await expect(service.get(ctx, 'room-from-tenant-b')).rejects.toThrow(NotFoundException);
    expect(audit.emitTenantAccessDenied).toHaveBeenCalledWith(ctx, { roomId: 'room-from-tenant-b' });
  });

  it('updates a room with tenant-and-branch scoped duplicate validation', async () => {
    const { audit, ctx, repository, service } = setup();
    const existing = room();
    repository.findById.mockResolvedValue(existing);
    repository.findByCode.mockResolvedValue(null);
    repository.save.mockImplementation(async (value) => value);

    const result = await service.update(ctx, 'room-1', { name: 'Laboratuvar', code: 'lab-1', branchId: 'branch-a', capacity: 30 });

    expect(result.name).toBe('Laboratuvar');
    expect(result.code).toBe('LAB-1');
    expect(result.capacity).toBe(30);
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'branch-a', 'LAB-1', 'room-1');
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.updated', expect.objectContaining({ changedFields: expect.arrayContaining(['name', 'code']) }));
  });

  it('deactivates and reactivates without hard delete', async () => {
    const { audit, ctx, repository, service } = setup();
    const active = room();
    repository.findById.mockResolvedValueOnce(active);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.deactivate(ctx, 'room-1')).resolves.toMatchObject({ status: RoomStatus.INACTIVE });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.deactivated', expect.objectContaining({ roomId: 'room-1' }));

    const inactive = room({ status: RoomStatus.INACTIVE, deactivatedAt: new Date() });
    repository.findById.mockResolvedValueOnce(inactive);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.reactivate(ctx, 'room-1')).resolves.toMatchObject({ status: RoomStatus.ACTIVE, deactivatedAt: null });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.reactivated', expect.objectContaining({ roomId: 'room-1' }));
  });

  it('rejects invalid inactive lifecycle transitions', async () => {
    const { ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(room({ status: RoomStatus.INACTIVE, deactivatedAt: new Date() }));

    await expect(service.deactivate(ctx, 'room-1')).rejects.toThrow(BadRequestException);
  });
});
