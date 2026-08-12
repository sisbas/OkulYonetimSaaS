import { MigrationInterface, QueryRunner } from 'typeorm';

const REQUIRED_PARENT_INDEXES: ReadonlyArray<readonly [string, string]> = [
  ['uq_courses_tenant_id', 'courses'],
  ['uq_teachers_tenant_id', 'teachers'],
  ['uq_teacher_branches_schedule_fk', 'teacher_branches'],
  ['uq_student_groups_branch_id', 'student_groups'],
];

const REPAIR_INDEX_DEFINITIONS: ReadonlyArray<readonly [string, string, string]> = [
  [
    'uq_schedule_repair_schedules_owner',
    'schedules',
    'ON schedules (tenant_id, branch_id, id)',
  ],
  [
    'uq_schedule_repair_versions_owner',
    'schedule_versions',
    'ON schedule_versions (tenant_id, branch_id, schedule_id, id)',
  ],
  ['uq_schedule_repair_courses_tenant_id', 'courses', 'ON courses (tenant_id, id)'],
  [
    'uq_schedule_repair_time_slots_branch_id',
    'time_slots',
    'ON time_slots (tenant_id, branch_id, id)',
  ],
  ['uq_schedule_repair_teachers_tenant_id', 'teachers', 'ON teachers (tenant_id, id)'],
  [
    'uq_schedule_repair_teacher_branches_owner',
    'teacher_branches',
    'ON teacher_branches (tenant_id, branch_id, teacher_id, id)',
  ],
  [
    'uq_schedule_repair_student_groups_branch_id',
    'student_groups',
    'ON student_groups (tenant_id, branch_id, id)',
  ],
  ['uq_schedule_repair_rooms_branch_id', 'rooms', 'ON rooms (tenant_id, branch_id, id)'],
];

const CANONICAL_PARENT_INDEXES: ReadonlyArray<readonly [string, string, string]> = [
  ['uq_rooms_tenant_branch_id', 'rooms', 'ON rooms (tenant_id, branch_id, id)'],
  [
    'uq_time_slots_tenant_branch_id',
    'time_slots',
    'ON time_slots (tenant_id, branch_id, id)',
  ],
  [
    'uq_schedules_tenant_branch_id',
    'schedules',
    'ON schedules (tenant_id, branch_id, id)',
  ],
  [
    'uq_schedule_versions_tenant_branch_schedule_id',
    'schedule_versions',
    'ON schedule_versions (tenant_id, branch_id, schedule_id, id)',
  ],
];

const SCHEDULE_FKS: ReadonlyArray<{
  table: string;
  name: string;
  columns: string;
  references: string;
}> = [
  {
    table: 'schedule_versions',
    name: 'fk_schedule_versions_schedule_owner',
    columns: '(tenant_id, branch_id, schedule_id)',
    references: 'schedules (tenant_id, branch_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_schedule_owner',
    columns: '(tenant_id, branch_id, schedule_id)',
    references: 'schedules (tenant_id, branch_id, id)',
  },
  {
    table: 'schedules',
    name: 'fk_schedules_active_version_owner',
    columns: '(tenant_id, branch_id, id, active_version_id)',
    references: 'schedule_versions (tenant_id, branch_id, schedule_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_version_owner',
    columns: '(tenant_id, branch_id, schedule_id, version_id)',
    references: 'schedule_versions (tenant_id, branch_id, schedule_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_course_tenant',
    columns: '(tenant_id, course_id)',
    references: 'courses (tenant_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_time_slot_branch',
    columns: '(tenant_id, branch_id, time_slot_id)',
    references: 'time_slots (tenant_id, branch_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_teacher_tenant',
    columns: '(tenant_id, teacher_id)',
    references: 'teachers (tenant_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_teacher_branch_owner',
    columns: '(tenant_id, branch_id, teacher_id, teacher_branch_id)',
    references: 'teacher_branches (tenant_id, branch_id, teacher_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_student_group_branch',
    columns: '(tenant_id, branch_id, student_group_id)',
    references: 'student_groups (tenant_id, branch_id, id)',
  },
  {
    table: 'schedule_events',
    name: 'fk_schedule_events_room_branch',
    columns: '(tenant_id, branch_id, room_id)',
    references: 'rooms (tenant_id, branch_id, id)',
  },
];

function indexExistsClause(indexName: string, tableName: string): string {
  return `
    EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      WHERE namespace_relation.nspname = current_schema()
        AND table_relation.relname = '${tableName}'
        AND index_relation.relname = '${indexName}'
    )`;
}

function repairIndexLikeClause(): string {
  return `
    EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      WHERE namespace_relation.nspname = current_schema()
        AND index_relation.relname LIKE 'uq_schedule_repair_%'
    )`;
}

export class ParentOwnedScheduleSurfaces1804000000000 implements MigrationInterface {
  name = 'ParentOwnedScheduleSurfaces1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        missing_surface boolean;
      BEGIN
        IF to_regclass(current_schema() || '.rooms') IS NULL
           OR to_regclass(current_schema() || '.time_slots') IS NULL
           OR to_regclass(current_schema() || '.schedules') IS NULL
           OR to_regclass(current_schema() || '.schedule_versions') IS NULL
           OR to_regclass(current_schema() || '.courses') IS NULL
           OR to_regclass(current_schema() || '.teachers') IS NULL
           OR to_regclass(current_schema() || '.teacher_branches') IS NULL
           OR to_regclass(current_schema() || '.student_groups') IS NULL THEN
          RAISE EXCEPTION 'Parent surface preflight failed: required table is missing';
        END IF;

        SELECT NOT (
          ${REQUIRED_PARENT_INDEXES.map(([name, table]) => indexExistsClause(name, table)).join(' AND ')}
        ) INTO missing_surface;
        IF missing_surface THEN
          RAISE EXCEPTION 'Parent surface preflight failed: a required canonical parent index is missing';
        END IF;

        SELECT NOT (
          ${REPAIR_INDEX_DEFINITIONS.map(([name, table]) => indexExistsClause(name, table)).join(' AND ')}
        ) INTO missing_surface;
        IF missing_surface THEN
          RAISE EXCEPTION 'Parent surface preflight failed: expected Schedule-owned repair index is missing';
        END IF;
      END $$
    `);

    for (const [name, , definition] of CANONICAL_PARENT_INDEXES) {
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ${definition}`);
    }

    for (const fk of SCHEDULE_FKS) {
      await queryRunner.query(
        `ALTER TABLE ${fk.table} DROP CONSTRAINT IF EXISTS ${fk.name}`,
      );
    }

    for (const [name] of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${name}`);
    }

    for (const fk of SCHEDULE_FKS) {
      await queryRunner.query(`
        ALTER TABLE ${fk.table}
        ADD CONSTRAINT ${fk.name}
        FOREIGN KEY ${fk.columns}
        REFERENCES ${fk.references}
        ON DELETE RESTRICT
      `);
    }

    await queryRunner.query(`
      DO $$
      DECLARE
        missing_surface boolean;
        repair_left boolean;
        fk_count integer;
      BEGIN
        SELECT NOT (
          ${CANONICAL_PARENT_INDEXES.map(([name, table]) => indexExistsClause(name, table)).join(' AND ')}
        ) INTO missing_surface;
        IF missing_surface THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: canonical parent index is missing';
        END IF;

        SELECT ${repairIndexLikeClause()} INTO repair_left;
        IF repair_left THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: Schedule-owned repair index remains';
        END IF;

        SELECT COUNT(*)
        INTO fk_count
        FROM pg_constraint constraint_row
        JOIN pg_class table_relation ON table_relation.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
        WHERE namespace_relation.nspname = current_schema()
          AND constraint_row.conname IN (${SCHEDULE_FKS.map((fk) => `'${fk.name}'`).join(', ')});
        IF fk_count <> ${SCHEDULE_FKS.length} THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: FK constraint count mismatch';
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const fk of SCHEDULE_FKS) {
      await queryRunner.query(
        `ALTER TABLE ${fk.table} DROP CONSTRAINT IF EXISTS ${fk.name}`,
      );
    }

    for (const [name, , definition] of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ${definition}`);
    }

    for (const [name] of CANONICAL_PARENT_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${name}`);
    }

    for (const fk of SCHEDULE_FKS) {
      await queryRunner.query(`
        ALTER TABLE ${fk.table}
        ADD CONSTRAINT ${fk.name}
        FOREIGN KEY ${fk.columns}
        REFERENCES ${fk.references}
        ON DELETE RESTRICT
      `);
    }
  }
}
