import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomAuditService } from './room-audit.service';
import { Room, RoomStatus } from './room.entity';
import { PaginatedRooms, RoomRepository } from './room.repository';

type RoomMutation = CreateRoomDto | UpdateRoomDto;

function normalizeRequiredString(value: string, label: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new BadRequestException(`${label} must be between 1 and ${max} characters after trimming`);
  }
  return trimmed;
}

function normalizeOptionalCode(code: string | undefined): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function normalizeDescription(description: string | undefined): string | null {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCapacity(capacity: number | undefined): number | null {
  if (capacity === undefined || capacity === null) return null;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new BadRequestException('Room capacity must be a positive integer');
  }
  return capacity;
}

function changedFieldsFrom(input: RoomMutation, defaults: string[] = []): string[] {
  const fields = new Set(defaults);
  for (const field of ['branchId', 'name', 'code', 'capacity', 'description'] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) fields.add(field);
  }
  return [...fields];
}

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly audit: RoomAuditService,
  ) {}

  async create(ctx: RequestContext, dto: CreateRoomDto): Promise<RoomResponseDto> {
    const branchId = normalizeRequiredString(dto.branchId, 'Room branchId', 36);
    const name = normalizeRequiredString(dto.name, 'Room name');
    const code = normalizeOptionalCode(dto.code);
    if (code && (await this.rooms.findByCode(ctx, branchId, code))) {
      throw new ConflictException('Room code already exists in this tenant branch');
    }
    const room = await this.rooms.create(ctx, {
      branchId,
      name,
      code,
      capacity: normalizeCapacity(dto.capacity),
      description: normalizeDescription(dto.description),
    });
    this.audit.emit(ctx, 'room.created', { roomId: room.id, branchId: room.branchId, changedFields: changedFieldsFrom(dto, ['status']) });
    return this.toResponse(room);
  }

  async list(ctx: RequestContext, query: ListRoomsQueryDto): Promise<{ data: RoomResponseDto[]; meta: PaginatedRooms['meta'] }> {
    const result = await this.rooms.list(ctx, query);
    return { data: result.data.map((room) => this.toResponse(room)), meta: result.meta };
  }

  async get(ctx: RequestContext, id: string): Promise<RoomResponseDto> {
    const room = await this.findTenantScopedRoomOrThrow(ctx, id);
    return this.toResponse(room);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateRoomDto): Promise<RoomResponseDto> {
    const room = await this.findTenantScopedRoomOrThrow(ctx, id, true);
    const nextBranchId = Object.prototype.hasOwnProperty.call(dto, 'branchId')
      ? normalizeRequiredString(dto.branchId ?? '', 'Room branchId', 36)
      : room.branchId;
    const nextCode = Object.prototype.hasOwnProperty.call(dto, 'code') ? normalizeOptionalCode(dto.code) : room.code;

    if (nextCode && (await this.rooms.findByCode(ctx, nextBranchId, nextCode, id))) {
      throw new ConflictException('Room code already exists in this tenant branch');
    }

    if (Object.prototype.hasOwnProperty.call(dto, 'branchId')) room.branchId = nextBranchId;
    if (Object.prototype.hasOwnProperty.call(dto, 'name')) room.name = normalizeRequiredString(dto.name ?? '', 'Room name');
    if (Object.prototype.hasOwnProperty.call(dto, 'code')) room.code = nextCode;
    if (Object.prototype.hasOwnProperty.call(dto, 'capacity')) room.capacity = normalizeCapacity(dto.capacity);
    if (Object.prototype.hasOwnProperty.call(dto, 'description')) room.description = normalizeDescription(dto.description);

    const updated = await this.rooms.save(room);
    this.audit.emit(ctx, 'room.updated', { roomId: updated.id, branchId: updated.branchId, changedFields: changedFieldsFrom(dto) });
    return this.toResponse(updated);
  }

  async deactivate(ctx: RequestContext, id: string): Promise<RoomResponseDto> {
    const room = await this.findTenantScopedRoomOrThrow(ctx, id, true);
    if (room.status === RoomStatus.INACTIVE) throw new BadRequestException('Room is already inactive');
    room.status = RoomStatus.INACTIVE;
    room.deactivatedAt = new Date();
    const updated = await this.rooms.save(room);
    this.audit.emit(ctx, 'room.deactivated', { roomId: updated.id, branchId: updated.branchId, changedFields: ['status', 'deactivatedAt'] });
    return this.toResponse(updated);
  }

  async reactivate(ctx: RequestContext, id: string): Promise<RoomResponseDto> {
    const room = await this.findTenantScopedRoomOrThrow(ctx, id, true);
    if (room.status === RoomStatus.ACTIVE) throw new BadRequestException('Room is already active');
    room.status = RoomStatus.ACTIVE;
    room.deactivatedAt = null;
    const updated = await this.rooms.save(room);
    this.audit.emit(ctx, 'room.reactivated', { roomId: updated.id, branchId: updated.branchId, changedFields: ['status', 'deactivatedAt'] });
    return this.toResponse(updated);
  }

  private async findTenantScopedRoomOrThrow(ctx: RequestContext, id: string, includeInactive = false): Promise<Room> {
    const room = await this.rooms.findById(ctx, id, includeInactive);
    if (room) return room;
    if (!includeInactive && await this.rooms.existsByIdInTenant(ctx, id)) {
      throw new NotFoundException('Room not found');
    }
    if (await this.rooms.existsByIdAnyTenant(id)) {
      this.audit.emitTenantAccessDenied(ctx, { roomId: id });
    }
    throw new NotFoundException('Room not found');
  }

  private toResponse(room: Room): RoomResponseDto {
    return {
      id: room.id,
      tenantId: room.tenantId,
      branchId: room.branchId,
      name: room.name,
      code: room.code,
      capacity: room.capacity,
      description: room.description,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      deactivatedAt: room.deactivatedAt,
    };
  }
}
