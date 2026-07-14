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
    branchExistsInTenant: jest.fn(async () => true),
    create: jest.fn(),
    existsByIdInTenant: jest.fn(),
    findByCode: jest.fn(async () => null),
    findById: jest.fn(),
    findByName: jest.fn(async () => null),
    list: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<RoomRepository>;
  const audit = { emit: jest.fn(), emitAccessDenied: jest.fn(), emitTenantAccessDenied: jest.fn() } as unknown as jest.Mocked<RoomAuditService>;
  const service = new RoomService(repository, audit);
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['room:create'] },
  };
  return { audit, ctx, repository, service };
}

describe('RoomService', () => {
  it('creates a room only after validating branch belongs to the same tenant', async () => {
    const { audit, ctx, repository, service } = setup();
    const created = room({ description: 'token=secret should not be audited' });
    repository.create.mockResolvedValue(created);

    const result = await service.create(ctx, {
      branchId: 'branch-a',
      name: ' Derslik 1 ',
      code: 'd1',
      capacity: 24,
      description: 'token=secret should not be audited',
    });

    expect(result.id).toBe('room-1');
    expect(repository.branchExistsInTenant).toHaveBeenCalledWith(ctx, 'branch-a');
    expect(repository.findByName).toHaveBeenCalledWith(ctx, 'branch-a', 'Derslik 1', undefined);
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'branch-a', 'D1', undefined);
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

  it('rejects branchId values that are not active branches inside the tenant', async () => {
    const { audit, ctx, repository, service } = setup();
    repository.branchExistsInTenant.mockResolvedValue(false);

    await expect(service.create(ctx, { branchId: 'branch-from-tenant-b', name: 'Derslik 1', code: 'D1' })).rejects.toThrow(NotFoundException);
    expect(audit.emitAccessDenied).toHaveBeenCalledWith(ctx, { branchId: 'branch-from-tenant-b' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects blank names and invalid capacity after normalization', async () => {
    const { ctx, service } = setup();

    await expect(service.create(ctx, { branchId: 'branch-a', name: '   ', code: 'D1' })).rejects.toThrow(BadRequestException);
    await expect(service.create(ctx, { branchId: 'branch-a', name: 'Derslik 1', capacity: 0 })).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate code inside the same active tenant branch', async () => {
    const { ctx, repository, service } = setup();
    repository.findByCode.mockResolvedValue(room());

    await expect(service.create(ctx, { branchId: 'branch-a', name: 'Derslik 1', code: 'D1' })).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate name inside the same active tenant branch', async () => {
    const { ctx, repository, service } = setup();
    repository.findByName.mockResolvedValue(room());

    await expect(service.create(ctx, { branchId: 'branch-a', name: 'Derslik 1', code: 'D2' })).rejects.toThrow(ConflictException);
  });

  it('lists paginated rooms', async () => {
    const { ctx, repository, service } = setup();
    repository.list.mockResolvedValue({ data: [room()], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });

    await expect(service.list(ctx, { page: '1', limit: '20', branchId: 'branch-a' })).resolves.toMatchObject({ meta: { total: 1 } });
    expect(repository.list).toHaveBeenCalledWith(ctx, { page: '1', limit: '20', branchId: 'branch-a' });
  });

  it('hides missing or cross-tenant records as 404 without any global existence lookup', async () => {
    const { audit, ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(service.get(ctx, 'missing-or-cross-tenant-room')).rejects.toThrow(NotFoundException);
    expect(audit.emitAccessDenied).toHaveBeenCalledWith(ctx, { roomId: 'missing-or-cross-tenant-room' });
    expect(Object.prototype.hasOwnProperty.call(repository, 'existsByIdAnyTenant')).toBe(false);
  });

  it('updates a room with tenant branch, name and code validation', async () => {
    const { audit, ctx, repository, service } = setup();
    const existing = room();
    repository.findById.mockResolvedValue(existing);
    repository.save.mockImplementation(async (value) => value);

    const result = await service.update(ctx, 'room-1', { name: 'Laboratuvar', code: 'lab-1', branchId: 'branch-a', capacity: 30 });

    expect(result.name).toBe('Laboratuvar');
    expect(result.code).toBe('LAB-1');
    expect(result.capacity).toBe(30);
    expect(repository.branchExistsInTenant).toHaveBeenCalledWith(ctx, 'branch-a');
    expect(repository.findByName).toHaveBeenCalledWith(ctx, 'branch-a', 'Laboratuvar', 'room-1');
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'branch-a', 'LAB-1', 'room-1');
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.updated', expect.objectContaining({ changedFields: expect.arrayContaining(['name', 'code']) }));
  });

  it('deactivates and reactivates without hard delete', async () => {
    const { audit, ctx, repository, service } = setup();
    const active = room();
    repository.findById.mockResolvedValueOnce(active);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.deactivate(ctx, 'room-1')).resolves.toMatchObject({ status: RoomStatus.INACTIVE });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.archived', expect.objectContaining({ roomId: 'room-1' }));

    const inactive = room({ status: RoomStatus.INACTIVE, deactivatedAt: new Date() });
    repository.findById.mockResolvedValueOnce(inactive);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.reactivate(ctx, 'room-1')).resolves.toMatchObject({ status: RoomStatus.ACTIVE, deactivatedAt: null });
    expect(repository.branchExistsInTenant).toHaveBeenCalledWith(ctx, 'branch-a');
    expect(repository.findByName).toHaveBeenCalledWith(ctx, 'branch-a', 'Derslik 1', 'room-1');
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'branch-a', 'D1', 'room-1');
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'room.reactivated', expect.objectContaining({ roomId: 'room-1' }));
  });

  it('rejects invalid inactive lifecycle transitions', async () => {
    const { ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(room({ status: RoomStatus.INACTIVE, deactivatedAt: new Date() }));

    await expect(service.deactivate(ctx, 'room-1')).rejects.toThrow(BadRequestException);
  });
});
