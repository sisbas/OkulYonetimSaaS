import { RoomStatus } from '../room.entity';

export class RoomResponseDto {
  id!: string;
  tenantId!: string;
  branchId!: string;
  name!: string;
  code!: string | null;
  capacity!: number | null;
  description!: string | null;
  status!: RoomStatus;
  createdAt!: Date;
  updatedAt!: Date;
  deactivatedAt!: Date | null;
}
