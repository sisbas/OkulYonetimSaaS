# M2 Frontend Operations Skeleton Alignment

Refs #66.

This document records the frontend-only guardrails for Daily Operation, Schedule and Attendance placeholders.

## Runtime guardrails

- No API binding is enabled.
- No permission key is hard-coded.
- No runtime route guard is changed.
- Permission Catalog binding remains pending.
- Attendance student roster data remains blocked.
- Parent/guardian contact, notification payload and counseling notes remain excluded.
- Schedule skeleton does not consume Course, Room or TimeSlot runtime APIs.

## Routes

- `/app/today`
- `/app/schedule`
- `/app/attendance`
- `/app/attendance/session/:sessionId`

## Binding gate

Runtime UI binding requires approved API contract, approved Permission Catalog role mapping, approved 403 reason contract, tenant/own-scope rules, sensitive-field policy and successful TypeScript/build checks.
