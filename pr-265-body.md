## Amaç
#265 [P1B-08][ATTENDANCE] — Student roster and schedule-derived session lifecycle çekirdeğini tamamla: ScheduleEvent occurrence'ından türetilen AttendanceSession + immutable roster snapshot + teacher-own-lesson RBAC + lock lifecycle. M5 authority chain: ScheduleEvent → AttendanceSession → AttendanceRecord.

## Kapsam
- src/attendance/attendance-session.entity.ts: AttendanceSession entity (rosterSnapshot jsonb, status draft/published/locked, version optimistic concurrency, tenant-scoped UNIQUE(tenant,event,date)).
- src/database/migrations/1826000000000-CreateAttendanceSessions.ts: attendance_sessions CREATE + FK(tenants/schedule_events/courses) + UNIQUE + CHECK status.
- src/attendance/attendance-session.service.ts: createFromPublishedOccurrence (idempotent, immutable roster), lock (optimistic concurrency), markRecord (locked reject).
- src/attendance/teacher-own-lesson.guard.ts: teacher yalnızca kendi session'ı; manager tüm branch; BOLA negative.
- src/attendance/attendance.controller.ts: REST (sessions create/list, lock, records mark/get).
- src/attendance/attendance.module.ts: wiring.
- Testler: attendance-session.service.spec.ts (8 test), 1826000000000 spec (2 test).

## Kapsam dışı
- submit → controlled correction (versioned record düzeltme) — sonraki slice.
- Locked absence → idempotent domain event → notification (M6'ya bağlı).
- Role-aware Türkçe UI (frontend) — #264.
- Fresh-DB UI journey / pilot evidence — #269.

## Acceptance criteria
- [x] attendance_sessions migration + FK + UNIQUE + tenant predicate (spec test geçti).
- [x] Session yalnızca published occurrence'dan türer; rosterSnapshot immutable (createFromPublishedOccurrence test).
- [x] Teacher-own-lesson RBAC; manager visibility; BOLA negative guard.
- [x] present/absent/late/excused + lock lifecycle (draft→published→locked, version bump).
- [x] Optimistic concurrency (version), durable audit (logger), redacted notes (AttendanceService.redactNotes).
- [x] Unit + migration testleri PASS (10 passed); nest build başarılı.
- [ ] HCO Control-Plane CI + PR Governance yeşil (PR açılınca).

## Test çıktısı
Local verify (branch f1b/265-attendance-session):
npx jest src/attendance src/database/migrations/1826000000000 → 10 passed (8 attendance + 2 migration).
npm run build → tsc + build:runtime SUCCESS (dist/ oluştu).
CI: Backend CI / DB Smoke / Sprint 1 Quality Gate PR açılınca çalışır.

## KVKK/audit etkisi
rosterSnapshot yalnızca studentId[] (PII değil); notes redaction-registry ile maskeli. mark işlemi SecurityAuditService loglanır. BOLA negative guard tenant içi cross-teacher leak'i engeller.

## Rollback
git revert <merge-sha>; attendance modülü izole, diğer vertical'ları etkilemez. Migration 1826000000000 YENİ (immutable kural §6: mevcut migration'lar değişmedi).

## CI run referansı
Backend CI / DB Smoke / Sprint 1 Quality Gate: PR açılınca tetiklenir (actions run id PR body güncellemesinde eklenecek).

---
HCO contract: merge'i insan açık onaylamadıkça YAPMA. Auto-merge codepath DEFAULT OFF.

Refs #265
