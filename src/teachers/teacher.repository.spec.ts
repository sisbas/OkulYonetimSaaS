import { ForbiddenException } from '@nestjs/common';
import { TeacherRepository } from './teacher.repository';
import { RequestContext } from '../common/context/request-context';

const ctx: RequestContext = {
  requestId: 'identity-regression', tenantId: 'tenant-a',
  user: { userId: 'actor', tenantId: 'tenant-a', roleIds: [], permissions: [] },
};

describe('TeacherDirectory decision affiliation', () => {
  function setup(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue(rows);
    return { query, repository: new TeacherRepository({ query } as any) };
  }

  it('returns null only for an active member whose teacher join is absent', async () => {
    const { repository, query } = setup([{ actorUserId: 'actor', teacherId: null }]);
    await expect(repository.findDecisionActorTeacherId(ctx)).resolves.toBeNull();
    expect(query.mock.calls[0][1]).toEqual(['tenant-a', 'actor']);
  });

  it('resolves teacher identity independently of branch/date context', async () => {
    const { repository } = setup([{ actorUserId: 'actor', teacherId: 'teacher-a' }]);
    await expect(repository.findDecisionActorTeacherId(ctx)).resolves.toBe('teacher-a');
  });

  it.each([
    [],
    [{ actorUserId: 'actor', teacherId: 'a' }, { actorUserId: 'actor', teacherId: 'b' }],
    [{ actorUserId: 'other', teacherId: null }],
    [{ actorUserId: 'actor' }],
  ])('rejects absent or ambiguous authority %#', async (...rows: any[]) => {
    const { repository } = setup(rows);
    await expect(repository.findDecisionActorTeacherId(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects mismatched tenant authority before querying', async () => {
    const { repository, query } = setup([]);
    await expect(repository.findDecisionActorTeacherId({ ...ctx, tenantId: 'tenant-b' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates database failure instead of returning absence', async () => {
    const { repository, query } = setup([]);
    const error = new Error('Connection unavailable');
    query.mockRejectedValue(error);
    await expect(repository.findDecisionActorTeacherId(ctx)).rejects.toBe(error);
  });
});
