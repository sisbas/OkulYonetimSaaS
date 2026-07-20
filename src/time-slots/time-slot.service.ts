import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { ListTimeSlotsQueryDto } from './dto/list-time-slots-query.dto';
import { TimeSlotResponseDto } from './dto/time-slot-response.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { TimeSlotAuditService } from './time-slot-audit.service';
import { TimeSlot, TimeSlotStatus } from './time-slot.entity';
import { PaginatedTimeSlots, TimeSlotRepository } from './time-slot.repository';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
type TimeSlotMutation = CreateTimeSlotDto | UpdateTimeSlotDto;

function requiredString(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new BadRequestException(`${label} must be between 1 and 120 characters after trimming`);
  }
  return normalized;
}

function day(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    throw new BadRequestException('dayOfWeek must be an integer between 1 and 7');
  }
  return value;
}

function time(value: string, label: string): string {
  const normalized = value.slice(0, 5);
  if (!TIME_PATTERN.test(normalized)) throw new BadRequestException(`${label} must use HH:mm format`);
  return normalized;
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function assertTimeRange(startTime: string, endTime: string): void {
  if (minutes(endTime) <= minutes(startTime)) {
    throw new UnprocessableEntityException('endTime must be greater than startTime');
  }
}

function orderIndex(value: number | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1) throw new BadRequestException('orderIndex must be a positive integer');
  return value;
}

function changedFields(input: TimeSlotMutation, defaults: string[] = []): string[] {
  const fields = new Set(defaults);
  for (const field of ['branchId', 'name', 'dayOfWeek', 'startTime', 'endTime', 'orderIndex'] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) fields.add(field);
  }
  return [...fields];
}

@Injectable()
export class TimeSlotService {
  constructor(
    private readonly slots: TimeSlotRepository,
    private readonly audit: TimeSlotAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async create(ctx: RequestContext, dto: CreateTimeSlotDto): Promise<TimeSlotResponseDto> {
    assertTenantScope(ctx, 'time_slots');
    const branchId = dto.branchId;
    const name = requiredString(dto.name, 'TimeSlot name');
    const dayOfWeek = day(dto.dayOfWeek);
    const startTime = time(dto.startTime, 'startTime');
    const endTime = time(dto.endTime, 'endTime');
    assertTimeRange(startTime, endTime);

    return this.dataSource.transaction(async (manager) => {
      const tx = this.slots.withManager(manager);
      await this.assertBranch(ctx, branchId, tx);
      await this.assertNoConflict(ctx, tx, branchId, dayOfWeek, startTime, endTime);
      const slot = await tx.create(ctx, {
        branchId,
        name,
        dayOfWeek,
        startTime,
        endTime,
        orderIndex: orderIndex(dto.orderIndex),
      });
      this.audit.emit(ctx, 'time_slot.created', {
        timeSlotId: slot.id,
        branchId: slot.branchId,
        changedFields: changedFields(dto, ['status']),
      });
      return this.toResponse(slot);
    });
  }

  async list(
    ctx: RequestContext,
    query: ListTimeSlotsQueryDto,
  ): Promise<{ data: TimeSlotResponseDto[]; meta: PaginatedTimeSlots['meta'] }> {
    await this.assertBranch(ctx, query.branchId, this.slots);
    const result = await this.slots.list(ctx, query);
    return { data: result.data.map((slot) => this.toResponse(slot)), meta: result.meta };
  }

  async calendar(
    ctx: RequestContext,
    query: ListTimeSlotsQueryDto,
  ): Promise<{ data: Array<{ dayOfWeek: number; slots: TimeSlotResponseDto[] }> }> {
    await this.assertBranch(ctx, query.branchId, this.slots);
    const slots = await this.slots.calendar(ctx, query.branchId, query.dayOfWeek ? Number(query.dayOfWeek) : undefined);
    const grouped = new Map<number, TimeSlotResponseDto[]>();
    for (const slot of slots) {
      const items = grouped.get(slot.dayOfWeek) ?? [];
      items.push(this.toResponse(slot));
      grouped.set(slot.dayOfWeek, items);
    }
    return { data: [...grouped.entries()].map(([dayOfWeek, items]) => ({ dayOfWeek, slots: items })) };
  }

  async get(ctx: RequestContext, id: string): Promise<TimeSlotResponseDto> {
    return this.toResponse(await this.findOrThrow(ctx, id));
  }

  async update(ctx: RequestContext, id: string, dto: UpdateTimeSlotDto): Promise<TimeSlotResponseDto> {
    assertTenantScope(ctx, 'time_slots');
    return this.dataSource.transaction(async (manager) => {
      const tx = this.slots.withManager(manager);
      const slot = await this.findOrThrow(ctx, id, true, tx);
      const branchId = Object.prototype.hasOwnProperty.call(dto, 'branchId') ? dto.branchId ?? '' : slot.branchId;
      const name = Object.prototype.hasOwnProperty.call(dto, 'name') ? requiredString(dto.name ?? '', 'TimeSlot name') : slot.name;
      const dayOfWeek = Object.prototype.hasOwnProperty.call(dto, 'dayOfWeek') ? day(dto.dayOfWeek ?? 0) : slot.dayOfWeek;
      const startTime = Object.prototype.hasOwnProperty.call(dto, 'startTime') ? time(dto.startTime ?? '', 'startTime') : time(slot.startTime, 'startTime');
      const endTime = Object.prototype.hasOwnProperty.call(dto, 'endTime') ? time(dto.endTime ?? '', 'endTime') : time(slot.endTime, 'endTime');
      assertTimeRange(startTime, endTime);

      await this.assertBranch(ctx, branchId, tx);
      await this.assertNoConflict(ctx, tx, branchId, dayOfWeek, startTime, endTime, id);

      slot.branchId = branchId;
      slot.name = name;
      slot.dayOfWeek = dayOfWeek;
      slot.startTime = startTime;
      slot.endTime = endTime;
      if (Object.prototype.hasOwnProperty.call(dto, 'orderIndex')) slot.orderIndex = orderIndex(dto.orderIndex);

      const updated = await tx.save(slot);
      this.audit.emit(ctx, 'time_slot.updated', {
        timeSlotId: updated.id,
        branchId: updated.branchId,
        changedFields: changedFields(dto),
      });
      return this.toResponse(updated);
    });
  }

  async archive(ctx: RequestContext, id: string): Promise<TimeSlotResponseDto> {
    const slot = await this.findOrThrow(ctx, id, true);
    if (slot.status === TimeSlotStatus.INACTIVE) throw new BadRequestException('TimeSlot is already inactive');
    slot.status = TimeSlotStatus.INACTIVE;
    slot.archivedAt = new Date();
    const updated = await this.slots.save(slot);
    this.audit.emit(ctx, 'time_slot.archived', {
      timeSlotId: updated.id,
      branchId: updated.branchId,
      changedFields: ['archivedAt', 'status'],
    });
    return this.toResponse(updated);
  }

  async reactivate(ctx: RequestContext, id: string): Promise<TimeSlotResponseDto> {
    assertTenantScope(ctx, 'time_slots');
    return this.dataSource.transaction(async (manager) => {
      const tx = this.slots.withManager(manager);
      const slot = await this.findOrThrow(ctx, id, true, tx);
      if (slot.status === TimeSlotStatus.ACTIVE) throw new BadRequestException('TimeSlot is already active');
      const startTime = time(slot.startTime, 'startTime');
      const endTime = time(slot.endTime, 'endTime');
      await this.assertBranch(ctx, slot.branchId, tx);
      await this.assertNoConflict(ctx, tx, slot.branchId, slot.dayOfWeek, startTime, endTime, id);
      slot.status = TimeSlotStatus.ACTIVE;
      slot.archivedAt = null;
      const updated = await tx.save(slot);
      this.audit.emit(ctx, 'time_slot.reactivated', {
        timeSlotId: updated.id,
        branchId: updated.branchId,
        changedFields: ['archivedAt', 'status'],
      });
      return this.toResponse(updated);
    });
  }

  private async assertBranch(ctx: RequestContext, branchId: string, repository: TimeSlotRepository): Promise<void> {
    if (await repository.branchExistsInTenant(ctx, branchId)) return;
    this.audit.emitAccessDenied(ctx, { branchId, reasonCode: 'branch_not_visible' });
    throw new NotFoundException('Branch not found');
  }

  private async assertNoConflict(
    ctx: RequestContext,
    repository: TimeSlotRepository,
    branchId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    if (await repository.findDuplicate(ctx, branchId, dayOfWeek, startTime, endTime, excludeId)) {
      throw new ConflictException('An active TimeSlot already exists for this exact interval');
    }
    if (await repository.findOverlap(ctx, branchId, dayOfWeek, startTime, endTime, excludeId)) {
      throw new UnprocessableEntityException('TimeSlot overlaps an active interval in this tenant branch');
    }
  }

  private async findOrThrow(
    ctx: RequestContext,
    id: string,
    includeInactive = false,
    repository: TimeSlotRepository = this.slots,
  ): Promise<TimeSlot> {
    const slot = await repository.findById(ctx, id, includeInactive);
    if (slot) return slot;
    this.audit.emitAccessDenied(ctx, { timeSlotId: id, reasonCode: 'time_slot_not_visible' });
    throw new NotFoundException('TimeSlot not found');
  }

  private toResponse(slot: TimeSlot): TimeSlotResponseDto {
    return {
      id: slot.id,
      tenantId: slot.tenantId,
      branchId: slot.branchId,
      name: slot.name,
      dayOfWeek: slot.dayOfWeek,
      startTime: time(slot.startTime, 'startTime'),
      endTime: time(slot.endTime, 'endTime'),
      orderIndex: slot.orderIndex,
      status: slot.status,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
      archivedAt: slot.archivedAt,
    };
  }
}
