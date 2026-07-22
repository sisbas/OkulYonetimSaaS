# Transactional Audit Writer Foundation

## Decision

Phase 1 uses a transaction-bound writer against the existing `audit_logs` table. Logger output is not the canonical audit record. Transactional outbox is deferred to future integration-event work.

## Port

```ts
TransactionalAuditWriter.write(
  entityManager,
  eventName,
  allowlistedMetadata,
)
```

The writer and repository use only the `EntityManager` supplied by the caller. They do not inject or use a global TypeORM repository, `DataSource.manager`, or an independent transaction.

## Success-event transaction boundary

A lifecycle mutation must use one transaction callback:

```text
domain mutation
+ awaited audit insert
= one PostgreSQL commit or rollback
```

Rules:

- The domain repository and audit writer receive repositories/managers from the same transaction-scoped `EntityManager`.
- The audit write is awaited before the transaction callback returns.
- Audit insert failures propagate to the caller and roll back the domain mutation.
- A later domain failure rolls back the already-issued audit insert.
- The writer never swallows persistence failures.

## Metadata policy

Metadata is event-name specific and exact-key allowlisted. Unknown keys and unknown changed-field names are rejected before persistence.

Canonical columns:

- `tenant_id`
- `actor_user_id`
- `actor_session_id`
- `action`
- `entity_type`
- `entity_id`
- `request_id`

Allowed `metadata_json` values for this slice:

- `schemaVersion`
- `result`
- `changedFields`
- `branchId` for branch-scoped Room and TimeSlot events

The foundation does not write `before_json` or `after_json`.

The following categories are not accepted as metadata:

- raw request or response bodies
- authorization headers, cookies, tokens, credentials, passwords, secrets, or API keys
- student, parent, or guardian identity/contact fields
- notification payloads or message bodies
- guidance, counseling, or health notes

## PostgreSQL acceptance tests

The database suite proves:

1. Domain mutation and audit insert commit together.
2. A real audit-table foreign-key failure rolls back the domain mutation.
3. A forced domain rollback leaves no success audit row.

Tests use the production writer and repository against PostgreSQL after normal repository migrations.

## Schema and rollback

No migration is added. The existing `audit_logs` table already contains the required columns.

Application rollback is a revert of this foundation PR. Existing `audit_logs` data and schema are not removed.

## Explicit non-scope

- AuthGuard and PermissionGuard ordering
- shared request-body logging
- Course adapter migration
- Room adapter migration
- TimeSlot adapter migration
- denied-event recorder
- Schedule publish or unpublish
- transactional outbox
