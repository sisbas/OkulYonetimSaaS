# Issue #179 Review Checklist

- Queue/today route is server-owned.
- Branch filter is tenant-validated.
- Response DTO is allowlisted and PII-free.
- `leaveVersion` and `leaveEtag` are returned by current impact/mutation responses.
- Clear requires exact current server ETag through existing optimistic lock.
- Client-generated versions remain non-authoritative.
