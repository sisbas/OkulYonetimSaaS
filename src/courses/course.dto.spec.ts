import { validate } from 'class-validator';

import { CreateCourseDto } from './dto/create-course.dto';

function dto(values: Partial<CreateCourseDto>): CreateCourseDto {
  return Object.assign(new CreateCourseDto(), values);
}

describe('Course DTO validation', () => {
  it('accepts a valid create payload', async () => {
    await expect(validate(dto({ name: 'Matematik', code: 'MAT-101', description: 'TYT Matematik' }))).resolves.toHaveLength(0);
  });

  it('rejects validation failures', async () => {
    const errors = await validate(dto({ name: 'M', code: 'invalid code with spaces' }));

    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['name', 'code']));
  });
});
