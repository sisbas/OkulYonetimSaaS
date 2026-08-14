import { MigrationInterface, QueryRunner } from 'typeorm';

interface IndexSurface {
  name: string;
  table: string;
  columns: readonly string[];
}

const REQUIRED_PARENT_INDEXES: ReadonlyArray<IndexSurface> = [
  { name: 'uq_courses_tenant_id', table: 'courses', columns: ['tenant_id', 'id'] },
  { name: 'uq_teachers_tenant_id', table: 'teachers', columns: ['tenant_id', 'id'] },
  {
    name: 'uq_teacher_branches_schedule_fk',
    table: 'teacher_branches',
    columns: ['tenant_id', 'branch_id', 'teacher_id', 'id'],
  },
  {
    name: 'uq_student_groups_branch_id',
    table: 'student_groups',
    columns: ['tenant_id', 'branch_id', 'id'],
  },
];

const REPAIR_INDEX_DEFINITIONS: ReadonlyArray<IndexSurface> = [
  {
    name: 'uq_schedule_repair_schedules_owner',
    table: 'schedules',
    columns: ['tenant_id', 'branch_id', 'id'],
  },
  {
    name: 'uq_schedule_repair_versions_owner',
    table: 'schedule_versions',
    columns: ['tenant_id', 'branch_id', 'schedule_id', 'id'],
  },
  { name: 'uq_schedule_repair_courses_tenant_id', table: 'courses', columns: ['tenant_id', 'id'] },
  {
    name: 'uq_schedule_repair_time_slots_branch_id',
    table: 'time_slots',
    columns: ['tenant_id', 'branch_id', 'id'],
  },
  { name: 'uq_schedule_repair_teachers_tenant_id', table: 'teachers', columns: ['tenant_id', 'id'] },
  {
    name: 'uq_schedule_repair_teacher_branches_owner',
    table: 'teacher_branches',
    columns: ['tenant_id', 'branch_id', 'teacher_id', 'id'],
  },
  {
    name: 'uq_schedule_repair_student_groups_branch_id',
    table: 'student_groups',
    columns: ['tenant_id', 'branch_id', 'id'],
  },
  { name: 'uq_schedule_repair_rooms_branch_id', table: 'rooms', columns: ['tenant_id', 'branch_id', 'id'] },
];

const CANONICAL_PARENT_INDEXES: ReadonlyArray<IndexSurface> = [
  { name: 'uq_rooms_tenant_branch_id', table: 'rooms', columns: ['tenant_id', 'branch_id', 'id'] },
  {
    name: 'uq_time_slots_tenant_branch_id',
    table: 'time_slots',
    columns: ['tenant_id', 'branch_id', 'id'],
  },
  { name: 'uq_schedules_tenant_branch_id', table: 'schedules', columns: ['tenant_id', 'branch_id', 'id'] },
  {
    name: 'uq_schedule_versions_tenant_branch_schedule_id',
    table: 'schedule_versions',
    columns: ['tenant_id', 'branch_id', 'schedule_id', 'id'],
  },
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

function indexNameClause(surface: IndexSurface): string {
  return `
    EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      WHERE namespace_relation.nspname = current_schema()
        AND table_relation.relname = '${surface.table}'
        AND index_relation.relname = '${surface.name}'
    )`;
}

function validIndexClause(surface: IndexSurface): string {
  const columns = surface.columns.map((column) => `'${column}'`).join(', ');
  return `
    EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      JOIN unnest(index_metadata.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality) ON true
      JOIN pg_attribute column_metadata
        ON column_metadata.attrelid = table_relation.oid
       AND column_metadata.attnum = key_columns.attnum
      WHERE namespace_relation.nspname = current_schema()
        AND table_relation.relname = '${surface.table}'
        AND index_relation.relname = '${surface.name}'
        AND index_metadata.indisunique
      GROUP BY index_relation.relname, table_relation.relname, index_metadata.indisunique
      HAVING array_agg(column_metadata.attname ORDER BY key_columns.ordinality)
             = ARRAY[${columns}]::name[]
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

function indexDefinition(surface: IndexSurface): string {
  return `ON ${surface.table} (${surface.columns.join(', ')})`;
}

function fkContractClause(): string {
  const expected = SCHEDULE_FKS.map(
    (fk) => {
      const sourceColumns = fk.columns
        .slice(1, -1)
        .split(', ')
        .map((column) => `'${column}'`)
        .join(', ');
      const referenceSeparator = fk.references.indexOf(' ');
      const targetTable = fk.references.slice(0, referenceSeparator);
      const targetColumnList = fk.references.slice(referenceSeparator + 1);
      const targetColumns = targetColumnList
        .slice(1, -1)
        .split(', ')
        .map((column) => `'${column}'`)
        .join(', ');

      return `('${fk.name}', '${fk.table}', ARRAY[${sourceColumns}]::text[], '${targetTable}', ARRAY[${targetColumns}]::text[])`;
    },
  ).join(', ');
  return `
    SELECT count(*) = ${SCHEDULE_FKS.length} AND bool_and(
      actual_row.conname IS NOT NULL
      AND actual_row.source_rel = expected_row.source_rel
      AND actual_row.source_columns = expected_row.source_columns
      AND actual_row.target_rel = expected_row.target_rel
      AND actual_row.target_columns = expected_row.target_columns
      AND actual_row.confdeltype = 'r'
    )
    INTO fk_contract_ok
    FROM (VALUES ${expected})
      AS expected_row(conname, source_rel, source_columns, target_rel, target_columns)
    LEFT JOIN (
      SELECT constraint_row.conname,
             source_relation.relname AS source_rel,
             ARRAY(
               SELECT source_column.attname::text
               FROM unnest(constraint_row.conkey) WITH ORDINALITY
                 AS source_key(attnum, ordinality)
               JOIN pg_attribute source_column
                 ON source_column.attrelid = constraint_row.conrelid
                AND source_column.attnum = source_key.attnum
               ORDER BY source_key.ordinality
             ) AS source_columns,
             target_relation.relname AS target_rel,
             ARRAY(
               SELECT target_column.attname::text
               FROM unnest(constraint_row.confkey) WITH ORDINALITY
                 AS target_key(attnum, ordinality)
               JOIN pg_attribute target_column
                 ON target_column.attrelid = constraint_row.confrelid
                AND target_column.attnum = target_key.attnum
               ORDER BY target_key.ordinality
             ) AS target_columns,
             constraint_row.confdeltype
      FROM pg_constraint constraint_row
      JOIN pg_class source_relation ON source_relation.oid = constraint_row.conrelid
      JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
      JOIN pg_class target_relation ON target_relation.oid = constraint_row.confrelid
      JOIN pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
      WHERE source_namespace.nspname = current_schema()
        AND target_namespace.nspname = current_schema()
        AND constraint_row.contype = 'f'
    ) actual_row ON actual_row.conname = expected_row.conname;
  `;
}

export class ParentOwnedScheduleSurfaces1804000000000 implements MigrationInterface {
  name = 'ParentOwnedScheduleSurfaces1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const requiredStatements = REQUIRED_PARENT_INDEXES.map(
      (surface) => `
        IF NOT ${indexNameClause(surface)} THEN
          RAISE EXCEPTION 'Parent surface preflight failed: a required canonical parent index is missing';
        END IF;
        IF NOT ${validIndexClause(surface)} THEN
          RAISE EXCEPTION 'Parent surface preflight failed: ${surface.name} exists with an invalid definition';
        END IF;`,
    ).join('\n');

    const repairStatements = REPAIR_INDEX_DEFINITIONS.map(
      (surface) => `
        IF NOT ${indexNameClause(surface)} THEN
          RAISE EXCEPTION 'Parent surface preflight failed: expected Schedule-owned repair index is missing';
        END IF;
        IF NOT ${validIndexClause(surface)} THEN
          RAISE EXCEPTION 'Parent surface preflight failed: ${surface.name} exists with an invalid definition';
        END IF;`,
    ).join('\n');

    const canonicalPreexistenceStatements = CANONICAL_PARENT_INDEXES.map(
      (surface) => `
        IF ${indexNameClause(surface)} THEN
          RAISE EXCEPTION 'Parent surface preflight failed: ${surface.name} already exists; canonical ownership cannot be claimed (rollback would drop a pre-existing surface)';
        END IF;`,
    ).join('\n');

    await queryRunner.query(`
      DO $$
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

        ${requiredStatements}

        ${repairStatements}

        ${canonicalPreexistenceStatements}
      END $$
    `);

    for (const surface of CANONICAL_PARENT_INDEXES) {
      // OKUL-10: idempotency — migration yeniden çalıştığında index zaten varsa hata vermemeli
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${surface.name} ${indexDefinition(surface)}`,
      );
    }

    for (const fk of SCHEDULE_FKS) {
      await queryRunner.query(
        `ALTER TABLE ${fk.table} DROP CONSTRAINT IF EXISTS ${fk.name}`,
      );
    }

    for (const surface of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${surface.name}`);
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
        surface_ok boolean;
        repair_left boolean;
        fk_contract_ok boolean;
      BEGIN
        SELECT NOT (
          ${CANONICAL_PARENT_INDEXES.map((surface) => validIndexClause(surface)).join(' AND ')}
        ) INTO surface_ok;
        IF surface_ok THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: canonical parent index is missing or invalid';
        END IF;

        SELECT ${repairIndexLikeClause()} INTO repair_left;
        IF repair_left THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: Schedule-owned repair index remains';
        END IF;

        ${fkContractClause()}
        IF NOT fk_contract_ok THEN
          RAISE EXCEPTION 'Parent surface postcondition failed: FK contract mismatch';
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

    for (const surface of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${surface.name} ${indexDefinition(surface)}`,
      );
    }

    for (const surface of CANONICAL_PARENT_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${surface.name}`);
    }

    await queryRunner.query(`
      DO $$
      DECLARE
        surface_ok boolean;
      BEGIN
        SELECT NOT (
          ${REPAIR_INDEX_DEFINITIONS.map((surface) => validIndexClause(surface)).join(' AND ')}
        ) INTO surface_ok;
        IF surface_ok THEN
          RAISE EXCEPTION 'Parent surface rollback failed: repair index missing or invalid';
        END IF;
      END $$
    `);

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
