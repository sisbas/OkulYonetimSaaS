\set ON_ERROR_STOP on

SELECT set_config('parent_surface.expected_state', :'expected_state', false);
SELECT set_config('parent_surface.phase', :'phase', false);

DO $$
DECLARE
  expected_state text := current_setting('parent_surface.expected_state');
  verification_phase text := current_setting('parent_surface.phase');
  index_contract_ok boolean;
  unexpected_index_exists boolean;
  fk_contract_ok boolean;
BEGIN
  IF expected_state = 'applied' THEN
    SELECT count(*) = 4 AND bool_and(
      actual_index.index_name IS NOT NULL
      AND actual_index.table_name = expected_index.table_name
      AND actual_index.columns = expected_index.columns
      AND actual_index.is_unique
      AND actual_index.is_valid
      AND NOT actual_index.is_partial
      AND NOT actual_index.has_expressions
    )
    INTO index_contract_ok
    FROM (VALUES
      ('uq_rooms_tenant_branch_id', 'rooms', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_time_slots_tenant_branch_id', 'time_slots', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_schedules_tenant_branch_id', 'schedules', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_schedule_versions_tenant_branch_schedule_id', 'schedule_versions', ARRAY['tenant_id', 'branch_id', 'schedule_id', 'id']::text[])
    ) AS expected_index(index_name, table_name, columns)
    LEFT JOIN (
      SELECT index_relation.relname::text AS index_name,
             table_relation.relname::text AS table_name,
             array_agg(column_metadata.attname::text ORDER BY key_columns.ordinality) AS columns,
             index_metadata.indisunique AS is_unique,
             index_metadata.indisvalid AS is_valid,
             index_metadata.indpred IS NOT NULL AS is_partial,
             index_metadata.indexprs IS NOT NULL AS has_expressions
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      JOIN unnest(index_metadata.indkey) WITH ORDINALITY
        AS key_columns(attnum, ordinality) ON true
      JOIN pg_attribute column_metadata
        ON column_metadata.attrelid = table_relation.oid
       AND column_metadata.attnum = key_columns.attnum
      WHERE namespace_relation.nspname = current_schema()
      GROUP BY index_relation.relname,
               table_relation.relname,
               index_metadata.indisunique,
               index_metadata.indisvalid,
               (index_metadata.indpred IS NOT NULL),
               (index_metadata.indexprs IS NOT NULL)
    ) actual_index ON actual_index.index_name = expected_index.index_name;

    IF NOT COALESCE(index_contract_ok, false) THEN
      RAISE EXCEPTION 'Parent surface verification failed: canonical index contract mismatch during %', verification_phase;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = index_relation.relnamespace
      WHERE namespace_relation.nspname = current_schema()
        AND index_relation.relname LIKE 'uq_schedule_repair_%'
    ) INTO unexpected_index_exists;

    IF unexpected_index_exists THEN
      RAISE EXCEPTION 'Parent surface verification failed: repair index remains during %', verification_phase;
    END IF;
  ELSIF expected_state = 'reverted' THEN
    SELECT count(*) = 8 AND bool_and(
      actual_index.index_name IS NOT NULL
      AND actual_index.table_name = expected_index.table_name
      AND actual_index.columns = expected_index.columns
      AND actual_index.is_unique
      AND actual_index.is_valid
      AND NOT actual_index.is_partial
      AND NOT actual_index.has_expressions
    )
    INTO index_contract_ok
    FROM (VALUES
      ('uq_schedule_repair_schedules_owner', 'schedules', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_schedule_repair_versions_owner', 'schedule_versions', ARRAY['tenant_id', 'branch_id', 'schedule_id', 'id']::text[]),
      ('uq_schedule_repair_courses_tenant_id', 'courses', ARRAY['tenant_id', 'id']::text[]),
      ('uq_schedule_repair_time_slots_branch_id', 'time_slots', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_schedule_repair_teachers_tenant_id', 'teachers', ARRAY['tenant_id', 'id']::text[]),
      ('uq_schedule_repair_teacher_branches_owner', 'teacher_branches', ARRAY['tenant_id', 'branch_id', 'teacher_id', 'id']::text[]),
      ('uq_schedule_repair_student_groups_branch_id', 'student_groups', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
      ('uq_schedule_repair_rooms_branch_id', 'rooms', ARRAY['tenant_id', 'branch_id', 'id']::text[])
    ) AS expected_index(index_name, table_name, columns)
    LEFT JOIN (
      SELECT index_relation.relname::text AS index_name,
             table_relation.relname::text AS table_name,
             array_agg(column_metadata.attname::text ORDER BY key_columns.ordinality) AS columns,
             index_metadata.indisunique AS is_unique,
             index_metadata.indisvalid AS is_valid,
             index_metadata.indpred IS NOT NULL AS is_partial,
             index_metadata.indexprs IS NOT NULL AS has_expressions
      FROM pg_class index_relation
      JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
      JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
      JOIN unnest(index_metadata.indkey) WITH ORDINALITY
        AS key_columns(attnum, ordinality) ON true
      JOIN pg_attribute column_metadata
        ON column_metadata.attrelid = table_relation.oid
       AND column_metadata.attnum = key_columns.attnum
      WHERE namespace_relation.nspname = current_schema()
      GROUP BY index_relation.relname,
               table_relation.relname,
               index_metadata.indisunique,
               index_metadata.indisvalid,
               (index_metadata.indpred IS NOT NULL),
               (index_metadata.indexprs IS NOT NULL)
    ) actual_index ON actual_index.index_name = expected_index.index_name;

    IF NOT COALESCE(index_contract_ok, false) THEN
      RAISE EXCEPTION 'Parent surface verification failed: repair index contract mismatch during %', verification_phase;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_namespace namespace_relation ON namespace_relation.oid = index_relation.relnamespace
      WHERE namespace_relation.nspname = current_schema()
        AND index_relation.relname IN (
          'uq_rooms_tenant_branch_id',
          'uq_time_slots_tenant_branch_id',
          'uq_schedules_tenant_branch_id',
          'uq_schedule_versions_tenant_branch_schedule_id'
        )
    ) INTO unexpected_index_exists;

    IF unexpected_index_exists THEN
      RAISE EXCEPTION 'Parent surface verification failed: canonical parent index remains during %', verification_phase;
    END IF;
  ELSE
    RAISE EXCEPTION 'Parent surface verification failed: unsupported expected state %', expected_state;
  END IF;

  SELECT count(*) = 10 AND bool_and(
    actual_fk.constraint_name IS NOT NULL
    AND actual_fk.source_table = expected_fk.source_table
    AND actual_fk.source_columns = expected_fk.source_columns
    AND actual_fk.target_table = expected_fk.target_table
    AND actual_fk.target_columns = expected_fk.target_columns
    AND actual_fk.delete_action = 'r'
  )
  INTO fk_contract_ok
  FROM (VALUES
    ('fk_schedule_versions_schedule_owner', 'schedule_versions', ARRAY['tenant_id', 'branch_id', 'schedule_id']::text[], 'schedules', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
    ('fk_schedule_events_schedule_owner', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'schedule_id']::text[], 'schedules', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
    ('fk_schedules_active_version_owner', 'schedules', ARRAY['tenant_id', 'branch_id', 'id', 'active_version_id']::text[], 'schedule_versions', ARRAY['tenant_id', 'branch_id', 'schedule_id', 'id']::text[]),
    ('fk_schedule_events_version_owner', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'schedule_id', 'version_id']::text[], 'schedule_versions', ARRAY['tenant_id', 'branch_id', 'schedule_id', 'id']::text[]),
    ('fk_schedule_events_course_tenant', 'schedule_events', ARRAY['tenant_id', 'course_id']::text[], 'courses', ARRAY['tenant_id', 'id']::text[]),
    ('fk_schedule_events_time_slot_branch', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'time_slot_id']::text[], 'time_slots', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
    ('fk_schedule_events_teacher_tenant', 'schedule_events', ARRAY['tenant_id', 'teacher_id']::text[], 'teachers', ARRAY['tenant_id', 'id']::text[]),
    ('fk_schedule_events_teacher_branch_owner', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'teacher_id', 'teacher_branch_id']::text[], 'teacher_branches', ARRAY['tenant_id', 'branch_id', 'teacher_id', 'id']::text[]),
    ('fk_schedule_events_student_group_branch', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'student_group_id']::text[], 'student_groups', ARRAY['tenant_id', 'branch_id', 'id']::text[]),
    ('fk_schedule_events_room_branch', 'schedule_events', ARRAY['tenant_id', 'branch_id', 'room_id']::text[], 'rooms', ARRAY['tenant_id', 'branch_id', 'id']::text[])
  ) AS expected_fk(
    constraint_name,
    source_table,
    source_columns,
    target_table,
    target_columns
  )
  LEFT JOIN (
    SELECT constraint_row.conname::text AS constraint_name,
           source_relation.relname::text AS source_table,
           ARRAY(
             SELECT source_column.attname::text
             FROM unnest(constraint_row.conkey) WITH ORDINALITY
               AS source_key(attnum, ordinality)
             JOIN pg_attribute source_column
               ON source_column.attrelid = constraint_row.conrelid
              AND source_column.attnum = source_key.attnum
             ORDER BY source_key.ordinality
           ) AS source_columns,
           target_relation.relname::text AS target_table,
           ARRAY(
             SELECT target_column.attname::text
             FROM unnest(constraint_row.confkey) WITH ORDINALITY
               AS target_key(attnum, ordinality)
             JOIN pg_attribute target_column
               ON target_column.attrelid = constraint_row.confrelid
              AND target_column.attnum = target_key.attnum
             ORDER BY target_key.ordinality
           ) AS target_columns,
           constraint_row.confdeltype AS delete_action
    FROM pg_constraint constraint_row
    JOIN pg_class source_relation ON source_relation.oid = constraint_row.conrelid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
    JOIN pg_class target_relation ON target_relation.oid = constraint_row.confrelid
    JOIN pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
    WHERE source_namespace.nspname = current_schema()
      AND target_namespace.nspname = current_schema()
      AND constraint_row.contype = 'f'
  ) actual_fk ON actual_fk.constraint_name = expected_fk.constraint_name;

  IF NOT COALESCE(fk_contract_ok, false) THEN
    RAISE EXCEPTION 'Parent surface verification failed: exact FK contract mismatch during %', verification_phase;
  END IF;
END $$;
