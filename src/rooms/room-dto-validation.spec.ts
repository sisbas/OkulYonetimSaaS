import { validate } from 'class-validator';

import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

describe('Room DTO validation', () => {
  it('rejects non-v4 UUID branchId in create payloads', async () => {
    const dto = Object.assign(new CreateRoomDto(), { branchId: 'not-a-uuid', name: 'Derslik 1' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'branchId')).toBe(true);
  });

  it('accepts v4 UUID branchId in create payloads', async () => {
    const dto = Object.assign(new CreateRoomDto(), { branchId: VALID_UUID, name: 'Derslik 1' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'branchId')).toBe(false);
  });

  it('rejects non-v4 UUID branchId in update payloads', async () => {
    const dto = Object.assign(new UpdateRoomDto(), { branchId: 'not-a-uuid' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'branchId')).toBe(true);
  });

  it('rejects non-v4 UUID branchId in list query payloads', async () => {
    const dto = Object.assign(new ListRoomsQueryDto(), { branchId: 'not-a-uuid' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'branchId')).toBe(true);
  });
});
