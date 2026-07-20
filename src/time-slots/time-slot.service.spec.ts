import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { TimeSlotAuditService } from './time-slot-audit.service';
import { TimeSlot, TimeSlotStatus } from './time-slot.entity';
import { TimeSlotRepository } from './time-slot.repository';
import { TimeSlotService } from './time-slot.service';

function slot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  const now = new Date('2026-07-20T00:00:00.000Z');
  return {
    id: 'slot-1',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    name: '1. Ders',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '09:40',
    orderIndex: 1,
    status: TimeSlotStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  } as TimeSlot;
}

function setup() {
  const repository = {
    withManager: jest.fn(),
    lockMutationScopes: jest.fn(async () => undefined),
    branchExistsInTenant: jest.fn(async () => true),
    findDuplicate: jest.fn(async () => null),
    findOverlap: jest.fn(async () => null),
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    calendar: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<TimeSlotRepository>;
  repository.withManager.mockReturnValue(repository);
  const audit = { emit: jest.fn(), emitAccessDenied: jest.fn() } as unknown as jest.Mocked<TimeSlotAuditService>;
  const dataSource = {
    transaction: jest.fn(async (work: (manager: any) => Promise<unknown>) => work({})),
  } as unknown as jest.Mocked<DataSource>;
  const service = new TimeSlotService(repository, audit, dataSource);
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['admin'], permissions: ['time_slot:create'] },
  };
  return { repository, audit, dataSource, service, ctx };
}

describe('TimeSlotService', () => {
  it('creates inside a transaction after the scope lock, branch, duplicate and overlap checks', async () => {
    const { repository, audit, dataSource, service, ctx } = setup();
    repository.create.mockResolvedValue(slot());
    await expect(service.create(ctx, {
      branchId: 'branch-a', name: ' 1. Ders ', dayOfWeek: 1, startTime: '09:00', endTime: '09:40', orderIndex: 1,
    })).resolves.toMatchObject({ id: 'slot-1', name: '1. Ders' });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.lockMutationScopes).toHaveBeenCalledWith(ctx, [{ branchId: 'branch-a', dayOfWeek: 1 }]);
    expect(repository.findDuplicate).toHaveBeenCalledWith(ctx, 'branch-a', 1, '09:00', '09:40', undefined);
    expect(repository.findOverlap).toHaveBeenCalledWith(ctx, 'branch-a', 1, '09:00', '09:40', undefined);
    expect(repository.lockMutationScopes.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findDuplicate.mock.invocationCallOrder[0],
    );
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'time_slot.created', expect.objectContaining({ timeSlotId: 'slot-1' }));
  });

  it('locks the current row and both old/new scopes before moving a TimeSlot', async () => {
    const { repository, service, ctx } = setup();
    repository.findById.mockResolvedValue(slot());
    repository.save.mockImplementation(async (value) => value);

    await expect(service.update(ctx, 'slot-1', {
      branchId: 'branch-b',
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '10:40',
    })).resolves.toMatchObject({ branchId: 'branch-b', dayOfWeek: 2 });

    expect(repository.findById).toHaveBeenCalledWith(ctx, 'slot-1', true, true);
    expect(repository.lockMutationScopes).toHaveBeenCalledWith(ctx, [
      { branchId: 'branch-a', dayOfWeek: 1 },
      { branchId: 'branch-b', dayOfWeek: 2 },
    ]);
    expect(repository.findDuplicate).toHaveBeenCalledWith(ctx, 'branch-b', 2, '10:00', '10:40', 'slot-1');
    expect(repository.findOverlap).toHaveBeenCalledWith(ctx, 'branch-b', 2, '10:00', '10:40', 'slot-1');
  });

  it('rejects missing/cross-tenant or inactive branch as non-enumerating 404', async () => {
    const { repository, audit, service, ctx } = setup();
    repository.branchExistsInTenant.mockResolvedValue(false);
    await expect(service.create(ctx, {
      branchId: 'branch-b', name: '1. Ders', dayOfWeek: 1, startTime: '09:00', endTime: '09:40',
    })).rejects.toThrow(NotFoundException);
    expect(audit.emitAccessDenied).toHaveBeenCalledWith(ctx, { branchId: 'branch-b', reasonCode: 'branch_not_visible' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns 409 for exact active duplicate and 422 for active overlap', async () => {
    const duplicate = setup();
    duplicate.repository.findDuplicate.mockResolvedValue(slot());
    await expect(duplicate.service.create(duplicate.ctx, {
      branchId: 'branch-a', name: 'Duplicate', dayOfWeek: 1, startTime: '09:00', endTime: '09:40',
    })).rejects.toThrow(ConflictException);

    const overlap = setup();
    overlap.repository.findOverlap.mockResolvedValue(slot());
    await expect(overlap.service.create(overlap.ctx, {
      branchId: 'branch-a', name: 'Overlap', dayOfWeek: 1, startTime: '09:20', endTime: '10:00',
    })).rejects.toThrow(UnprocessableEntityException);
  });

  it('allows adjacent intervals because repository overlap result is empty', async () => {
    const { repository, service, ctx } = setup();
    repository.create.mockResolvedValue(slot({ id: 'slot-2', startTime: '09:40', endTime: '10:20' }));
    await expect(service.create(ctx, {
      branchId: 'branch-a', name: '2. Ders', dayOfWeek: 1, startTime: '09:40', endTime: '10:20',
    })).resolves.toMatchObject({ id: 'slot-2' });
  });

  it('rejects endTime less than or equal to startTime', async () => {
    const { service, ctx } = setup();
    await expect(service.create(ctx, {
      branchId: 'branch-a', name: 'Invalid', dayOfWeek: 1, startTime: '10:00', endTime: '10:00',
    })).rejects.toThrow(UnprocessableEntityException);
  });

  it('hides missing and cross-tenant records with the same 404 path', async () => {
    const { repository, audit, service, ctx } = setup();
    repository.findById.mockResolvedValue(null);
    await expect(service.get(ctx, 'missing-or-cross-tenant')).rejects.toThrow(NotFoundException);
    expect(audit.emitAccessDenied).toHaveBeenCalledWith(ctx, {
      timeSlotId: 'missing-or-cross-tenant', reasonCode: 'time_slot_not_visible',
    });
    expect(Object.prototype.hasOwnProperty.call(repository, 'existsByIdAnyTenant')).toBe(false);
  });

  it('archives and reactivates inside locked transactions', async () => {
    const archivedCase = setup();
    archivedCase.repository.findById.mockResolvedValue(slot());
    archivedCase.repository.save.mockImplementation(async (value) => value);
    await expect(archivedCase.service.archive(archivedCase.ctx, 'slot-1')).resolves.toMatchObject({ status: 'inactive' });
    expect(archivedCase.repository.findById).toHaveBeenCalledWith(archivedCase.ctx, 'slot-1', true, true);
    expect(archivedCase.repository.lockMutationScopes).toHaveBeenCalledWith(archivedCase.ctx, [
      { branchId: 'branch-a', dayOfWeek: 1 },
    ]);

    const reactivateCase = setup();
    reactivateCase.repository.findById.mockResolvedValue(slot({ status: TimeSlotStatus.INACTIVE, archivedAt: new Date() }));
    reactivateCase.repository.save.mockImplementation(async (value) => value);
    await expect(reactivateCase.service.reactivate(reactivateCase.ctx, 'slot-1')).resolves.toMatchObject({ status: 'active', archivedAt: null });
    expect(reactivateCase.repository.findById).toHaveBeenCalledWith(reactivateCase.ctx, 'slot-1', true, true);
    expect(reactivateCase.repository.lockMutationScopes).toHaveBeenCalledWith(reactivateCase.ctx, [
      { branchId: 'branch-a', dayOfWeek: 1 },
    ]);
    expect(reactivateCase.repository.findDuplicate).toHaveBeenCalledWith(
      reactivateCase.ctx, 'branch-a', 1, '09:00', '09:40', 'slot-1',
    );
    expect(reactivateCase.repository.findOverlap).toHaveBeenCalledWith(
      reactivateCase.ctx, 'branch-a', 1, '09:00', '09:40', 'slot-1',
    );
  });

  it('rejects repeated archive/reactivate transitions explicitly', async () => {
    const archiveCase = setup();
    archiveCase.repository.findById.mockResolvedValue(slot({ status: TimeSlotStatus.INACTIVE }));
    await expect(archiveCase.service.archive(archiveCase.ctx, 'slot-1')).rejects.toThrow(BadRequestException);

    const reactivateCase = setup();
    reactivateCase.repository.findById.mockResolvedValue(slot());
    await expect(reactivateCase.service.reactivate(reactivateCase.ctx, 'slot-1')).rejects.toThrow(BadRequestException);
  });
});
