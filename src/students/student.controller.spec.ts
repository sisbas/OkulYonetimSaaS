import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';

import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import {
  StudentController,
  StudentGroupController,
} from './student.controller';
import { StudentService } from './student.service';

describe('Student/roster controller RBAC contract', () => {
  const service = {
    list: jest.fn(),
    get: jest.fn(),
    roster: jest.fn(),
  } as unknown as StudentService;

  it('maps student reads and roster reads to seeded permissions', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, StudentController.prototype.list),
    ).toEqual(['student:read']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, StudentController.prototype.get),
    ).toEqual(['student:read']);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        StudentGroupController.prototype.roster,
      ),
    ).toEqual(['student:group_students:read']);
  });

  it('requires authenticated tenant context on the student list', () => {
    const controller = new StudentController(service);
    expect(() =>
      controller.list(
        { context: { requestId: 'req-1' } } as RequestWithContext,
        {},
      ),
    ).toThrow(UnauthorizedException);
  });

  it('requires authenticated tenant context on the roster route', () => {
    const controller = new StudentGroupController(service);
    expect(() =>
      controller.roster(
        { context: { requestId: 'req-1' } } as RequestWithContext,
        '00000000-0000-4000-8000-000000000001',
        {},
      ),
    ).toThrow(UnauthorizedException);
  });
});
