import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionBranchSelection1841000000000 implements MigrationInterface {
  name = 'AddSessionBranchSelection1841000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE user_sessions
      ADD COLUMN selected_branch_id uuid NULL,
      ADD COLUMN selected_branch_version integer NULL,
      ADD CONSTRAINT chk_session_branch_selection CHECK (
        (selected_branch_id IS NULL AND selected_branch_version IS NULL) OR
        (selected_branch_id IS NOT NULL AND selected_branch_version IS NOT NULL AND selected_branch_version >= 0)
      ),
      ADD CONSTRAINT fk_session_branch_selection FOREIGN KEY (tenant_id, selected_branch_id)
        REFERENCES branches(tenant_id, id) ON DELETE RESTRICT`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Drops only the selection; sessions and refresh hashes are preserved.
    await runner.query(`ALTER TABLE user_sessions
      DROP CONSTRAINT fk_session_branch_selection,
      DROP CONSTRAINT chk_session_branch_selection,
      DROP COLUMN selected_branch_version,
      DROP COLUMN selected_branch_id`);
  }
}
