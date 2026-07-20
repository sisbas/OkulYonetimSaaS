import { TimeSlotStatus } from '../time-slot.entity';

export class TimeSlotResponseDto {
  id!: string;
  tenantId!: string;
  branchId!: string;
  name!: string;
  dayOfWeek!: number;
  startTime!: string;
  endTime!: string;
  orderIndex!: number | null;
  status!: TimeSlotStatus;
  createdAt!: Date;
  updatedAt!: Date;
  archivedAt!: Date | null;
}
