import { validate } from 'class-validator';

import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { ListTimeSlotsQueryDto } from './dto/list-time-slots-query.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('TimeSlot DTO validation', () => {
  it('accepts the valid create contract', async () => {
    const dto = Object.assign(new CreateTimeSlotDto(), {
      branchId: UUID,
      name: '1. Ders',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '09:40',
      orderIndex: 1,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid branch UUID, day and time format', async () => {
    const dto = Object.assign(new CreateTimeSlotDto(), {
      branchId: 'invalid',
      name: '1. Ders',
      dayOfWeek: 8,
      startTime: '9:00',
      endTime: '25:00',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['branchId', 'dayOfWeek', 'startTime', 'endTime']));
  });

  it('validates update and list branch UUIDs', async () => {
    const update = Object.assign(new UpdateTimeSlotDto(), { branchId: 'invalid' });
    const list = Object.assign(new ListTimeSlotsQueryDto(), { branchId: 'invalid', dayOfWeek: '0' });
    expect((await validate(update)).some((error) => error.property === 'branchId')).toBe(true);
    expect((await validate(list)).map((error) => error.property)).toEqual(expect.arrayContaining(['branchId', 'dayOfWeek']));
  });
});
