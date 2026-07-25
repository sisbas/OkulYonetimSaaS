import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourseTenantIdCompositeUnique1784577600000 implements MigrationInterface {
  name = 'AddCourseTenantIdCompositeUnique1784577600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        existing_index_valid boolean;
      BEGIN
        IF to_regclass(current_schema() || '.courses') IS NULL THEN
          RAISE EXCEPTION 'Course prerequisite preflight failed: courses table is missing';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM courses course_row
          LEFT JOIN tenants tenant_row ON tenant_row.id = course_row.tenant_id
          WHERE course_row.id IS NULL
             OR course_row.tenant_id IS NULL
             OR tenant_row.id IS NULL
        ) THEN
          RAISE EXCEPTION 'Course prerequisite preflight failed: null or orphan tenant reference detected';
        END IF;

        IF EXISTS (
          SELECT tenant_id, id
          FROM courses
          GROUP BY tenant_id, id
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Course prerequisite preflight failed: duplicate (tenant_id, id) rows detected';
        END IF;

        IF to_regclass(current_schema() || '.uq_courses_tenant_id') IS NOT NULL THEN
          SELECT
            index_metadata.indisunique
            AND array_agg(column_metadata.attname ORDER BY key_columns.ordinality)
                = ARRAY['tenant_id', 'id']::name[]
          INTO existing_index_valid
          FROM pg_class index_relation
          JOIN pg_index index_metadata
            ON index_metadata.indexrelid = index_relation.oid
          JOIN pg_class table_relation
            ON table_relation.oid = index_metadata.indrelid
          JOIN pg_namespace namespace_relation
            ON namespace_relation.oid = table_relation.relnamespace
          JOIN unnest(index_metadata.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
            ON true
          JOIN pg_attribute column_metadata
            ON column_metadata.attrelid = table_relation.oid
           AND column_metadata.attnum = key_columns.attnum
          WHERE namespace_relation.nspname = current_schema()
            AND table_relation.relname = 'courses'
            AND index_relation.relname = 'uq_courses_tenant_id'
          GROUP BY index_metadata.indisunique;

          IF NOT COALESCE(existing_index_valid, false) THEN
            RAISE EXCEPTION 'Course prerequisite preflight failed: uq_courses_tenant_id exists with an invalid definition';
          END IF;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_id
      ON courses (tenant_id, id)
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        created_index_valid boolean;
      BEGIN
        SELECT
          index_metadata.indisunique
          AND array_agg(column_metadata.attname ORDER BY key_columns.ordinality)
              = ARRAY['tenant_id', 'id']::name[]
        INTO created_index_valid
        FROM pg_class index_relation
        JOIN pg_index index_metadata
          ON index_metadata.indexrelid = index_relation.oid
        JOIN pg_class table_relation
          ON table_relation.oid = index_metadata.indrelid
        JOIN pg_namespace namespace_relation
          ON namespace_relation.oid = table_relation.relnamespace
        JOIN unnest(index_metadata.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
          ON true
        JOIN pg_attribute column_metadata
          ON column_metadata.attrelid = table_relation.oid
         AND column_metadata.attnum = key_columns.attnum
        WHERE namespace_relation.nspname = current_schema()
          AND table_relation.relname = 'courses'
          AND index_relation.relname = 'uq_courses_tenant_id'
        GROUP BY index_metadata.indisunique;

        IF NOT COALESCE(created_index_valid, false) THEN
          RAISE EXCEPTION 'Course prerequisite postcondition failed: uq_courses_tenant_id is missing or invalid';
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint child_constraint
          JOIN pg_class owned_index ON owned_index.oid = child_constraint.conindid
          JOIN pg_namespace namespace_relation ON namespace_relation.oid = owned_index.relnamespace
          WHERE namespace_relation.nspname = current_schema()
            AND owned_index.relname = 'uq_courses_tenant_id'
        ) THEN
          RAISE EXCEPTION 'Course prerequisite rollback blocked: child constraints depend on uq_courses_tenant_id';
        END IF;
      END $$
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_courses_tenant_id`);
  }
}
