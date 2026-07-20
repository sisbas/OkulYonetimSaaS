import { ConflictException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { RequestContext } from '../../src/common/context/request-context';
import { TimeSlotAuditService } from '../../src/time-slots/time-slot-audit.service';
import { TimeSlot } from '../../src/time-slots/time-slot.entity';
import { TimeSlotRepository } from '../../src/time-slots/time-slot.repository';
import { TimeSlotService } from '../../src/time-slots/time-slot.service';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000099';
const BRANCH_ID = '20000000-0000-4000-8000-000000000099';
const TENANT_SLUG = 'timeslot-concurrency-test';
const BRANCH_CODE = 'TS-CONCURRENCY';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rollbackAndRelease(runner: QueryRunner): Promise<void> {
  if (runner.isTransactionActive) await runner.rollbackTransaction();
  if (!runner.isReleased) await runner.release();
}

describeWithPostgres('TimeSlot PostgreSQL concurrency', () => {
  jest.setTimeout(20_000);

  let dataSource: DataSource;
  let service: TimeSlotService;
  const ctx: RequestContext = {
    requestId: 'timeslot-concurrency',
    tenantId: TENANT_ID,
    user: {
      userId: '30000000-0000-4000-8000-000000000099',
      tenantId: TENANT_ID,
      roleIds: ['tenant-admin'],
      permissions: ['time_slot:create', 'time_slot:update', 'time_slot:delete'],
    },
  };

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [TimeSlot],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    await dataSource.query(
      `
        INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
        VALUES ($1, $2, $3, 'active', 'Europe/Istanbul', NULL)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            status = 'active',
            deleted_at = NULL
      `,
      [TENANT_ID, 'TimeSlot Concurrency Tenant', TENANT_SLUG],
    );
    await dataSource.query(
      `
        INSERT INTO branches (id, tenant_id, name, code, status, deleted_at)
        VALUES ($1, $2, $3, $4, 'active', NULL)
        ON CONFLICT (id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            status = 'active',
            deleted_at = NULL
      `,
      [BRANCH_ID, TENANT_ID, 'TimeSlot Concurrency Branch', BRANCH_CODE],
    );

    service = new TimeSlotService(
      new TimeSlotRepository(dataSource.getRepository(TimeSlot)),
      new TimeSlotAuditService(),
      dataSource,
    );
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM time_slots WHERE tenant_id = $1 AND branch_id = $2', [TENANT_ID, BRANCH_ID]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM time_slots WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM branches WHERE id = $1 AND tenant_id = $2', [BRANCH_ID, TENANT_ID]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);
    await dataSource.destroy();
    jest.restoreAllMocks();
  });

  it('blocks a parallel transaction on the same tenant, branch and day scope', async () => {
    const first = dataSource.createQueryRunner();
    const second = dataSource.createQueryRunner();
    await first.connect();
    await second.connect();
    await first.startTransaction();
    await second.startTransaction();

    try {
      const firstRepository = new TimeSlotRepository(first.manager.getRepository(TimeSlot));
      const secondRepository = new TimeSlotRepository(second.manager.getRepository(TimeSlot));
      await firstRepository.lockMutationScopes(ctx, [{ branchId: BRANCH_ID, dayOfWeek: 1 }]);

      let secondAcquired = false;
      const secondLock = secondRepository
        .lockMutationScopes(ctx, [{ branchId: BRANCH_ID, dayOfWeek: 1 }])
        .then(() => {
          secondAcquired = true;
        });

      await delay(150);
      expect(secondAcquired).toBe(false);

      await first.commitTransaction();
      await secondLock;
      expect(secondAcquired).toBe(true);
    } finally {
      await rollbackAndRelease(first);
      await rollbackAndRelease(second);
    }
  });

  it('does not block a parallel transaction for a different day scope', async () => {
    const first = dataSource.createQueryRunner();
    const second = dataSource.createQueryRunner();
    await first.connect();
    await second.connect();
    await first.startTransaction();
    await second.startTransaction();

    try {
      const firstRepository = new TimeSlotRepository(first.manager.getRepository(TimeSlot));
      const secondRepository = new TimeSlotRepository(second.manager.getRepository(TimeSlot));
      await firstRepository.lockMutationScopes(ctx, [{ branchId: BRANCH_ID, dayOfWeek: 1 }]);

      const result = await Promise.race([
        secondRepository
          .lockMutationScopes(ctx, [{ branchId: BRANCH_ID, dayOfWeek: 2 }])
          .then(() => 'acquired'),
        delay(2_000).then(() => 'timeout'),
      ]);

      expect(result).toBe('acquired');
    } finally {
      await rollbackAndRelease(first);
      await rollbackAndRelease(second);
    }
  });

  it('serializes parallel overlapping creates and returns one 422 response', async () => {
    const results = await Promise.allSettled([
      service.create(ctx, {
        branchId: BRANCH_ID,
        name: 'Parallel A',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '09:40',
      }),
      service.create(ctx, {
        branchId: BRANCH_ID,
        name: 'Parallel B',
        dayOfWeek: 1,
        startTime: '09:20',
        endTime: '10:00',
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(UnprocessableEntityException);

    const rows = await dataSource.query(
      'SELECT id FROM time_slots WHERE tenant_id = $1 AND branch_id = $2 AND day_of_week = 1 AND status = $3',
      [TENANT_ID, BRANCH_ID, 'active'],
    );
    expect(rows).toHaveLength(1);
  });

  it('serializes parallel exact duplicates and returns one 409 response', async () => {
    const results = await Promise.allSettled([
      service.create(ctx, {
        branchId: BRANCH_ID,
        name: 'Duplicate A',
        dayOfWeek: 3,
        startTime: '11:00',
        endTime: '11:40',
      }),
      service.create(ctx, {
        branchId: BRANCH_ID,
        name: 'Duplicate B',
        dayOfWeek: 3,
        startTime: '11:00',
        endTime: '11:40',
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const rows = await dataSource.query(
      'SELECT id FROM time_slots WHERE tenant_id = $1 AND branch_id = $2 AND day_of_week = 3 AND status = $3',
      [TENANT_ID, BRANCH_ID, 'active'],
    );
    expect(rows).toHaveLength(1);
  });
});
