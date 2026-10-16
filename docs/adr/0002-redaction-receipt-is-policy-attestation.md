# Redaction receipt is a policy-conformance attestation, not a PII scan

`evaluatedFieldCount` means *admitted by the per-event audit metadata allowlist*, not *inspected for PII*. A field is evaluated because `assertExactKeys` independently vouched for it, which is what makes `redactedFieldCount + skippedFieldCount === evaluatedFieldCount` an honest balance rather than a tautology. The receipt attests conformance to the reviewed allowlist and carries no independent PII evidence: if a future change adds a PII-bearing field to a policy allowlist, the receipt still reports it as skipped and cannot be distinguished from a correct one.

## Consequences

- Never cite a `redactionReceipt` as evidence that a PII scan ran. Cite it as evidence that the payload passed the event's allowlist.
- `strategy` values `partial-mask` / `full-redact` / `hash` are reserved vocabulary. Runtime constructs only `none`, so `redactedFieldCount` is structurally always `0` today. Do not narrow the union — a real redaction path should be able to land without a type edit.
- `combineReceipts` derives `evaluated` from the other two counts and selects `'full-redact'` from a condition that cannot currently fire. This is correct aggregation of already-attested receipts, not independent verification.

## Considered Options

- **Inspected** (each key tested against PII rules): honest under the name, but nothing runs it and the receipt builder would need a per-field classification pass. Rejected as cost without added evidence — the allowlist already performs the classification.
- **Considered** (all keys merely taken into account): cheapest and true, but leaves `skipped === evaluated` byte-identical to "never checked", so an auditor learns nothing. Rejected as the reading that motivated the original complaint.

Related: K-19 in `CONTEXT.md`, which replaced a hardcoded `evaluatedFieldCount: 6` with a measured count but left the term undefined.