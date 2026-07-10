# Sprint 1 API Route Map

> Bu doküman Sprint 1 uygulama PR'ları için route sözleşmesidir; feature kodu, controller veya DTO implementasyonu değildir.

## Genel Kurallar

- Tüm route'lar tenant scope ile çalışmalıdır; tenant scope olmadan query, lookup, create, update veya delete yapılmamalıdır.
- Cross-tenant veri erişimi tüm roller için yasaktır.
- Admin route'ları tenant içi tam yönetim amacıyla tasarlanır; yine de tenant dışına çıkamaz.
- Operations route'ları operasyonel CRUD ile sınırlıdır; tenant settings, role assignment ve security audit kapsamına girmez.
- Teacher route'ları yalnızca öğretmenin kendi görünürlük sınırındaki kayıtları okuyabilir ve hassas KVKK alanlarını dönmez.
- Student route'larında parent/guardian contact alanları default response'ta dönmeyecektir.

## Route Taslağı

| HTTP method | Path | Entity | Required permission | Tenant scope zorunluluğu | Audit gerekir mi? | KVKK notu |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/branches` | Branch | `branches.read` | Evet | Hayır | Serbest metin alanları kişisel veri içermemelidir. |
| GET | `/branches/{id}` | Branch | `branches.read` | Evet | Hayır | ID lookup tenant içinde sınırlandırılır. |
| POST | `/branches` | Branch | `branches.write` | Evet | Evet | Address summary kişisel veri içermemelidir. |
| PATCH | `/branches/{id}` | Branch | `branches.write` | Evet | Evet | Tenant dışı branch güncellenemez. |
| DELETE | `/branches/{id}` | Branch | `branches.delete` | Evet | Evet | Tercihen soft delete/deactivate davranışı beklenir. |
| GET | `/teachers` | Teacher | `teachers.read` | Evet | Hayır | Öğretmen iletişim alanları kişisel veridir. |
| GET | `/teachers/{id}` | Teacher | `teachers.read` | Evet | Hayır | Teacher rolü yalnızca kendi profilini veya atanmış görünürlüğü okuyabilir. |
| POST | `/teachers` | Teacher | `teachers.write` | Evet | Evet | Email/phone değişiklikleri auditlenir. |
| PATCH | `/teachers/{id}` | Teacher | `teachers.write` | Evet | Evet | Tenant dışı branch/course ilişkisi kurulamaz. |
| DELETE | `/teachers/{id}` | Teacher | `teachers.delete` | Evet | Evet | Deactivate tercih edilir. |
| GET | `/courses` | Course | `courses.read` | Evet | Hayır | Teacher için sadece atanmış/görünür course kayıtları. |
| GET | `/courses/{id}` | Course | `courses.read` | Evet | Hayır | Course ilişkileri aynı tenant içinde olmalıdır. |
| POST | `/courses` | Course | `courses.write` | Evet | Evet | Serbest metin açıklaması kişisel veri içermemelidir. |
| PATCH | `/courses/{id}` | Course | `courses.write` | Evet | Evet | Öğretmen ataması değişiklikleri auditlenir. |
| DELETE | `/courses/{id}` | Course | `courses.delete` | Evet | Evet | Deactivate tercih edilir. |
| GET | `/students` | Student | `students.read` | Evet | Hayır | Parent/guardian contact default response'ta dönmez. |
| GET | `/students/{id}` | Student | `students.read` | Evet | Hayır | Teacher yalnızca görünür öğrencileri okuyabilir; contact ve consent detayları dönmez. |
| POST | `/students` | Student | `students.write` | Evet | Evet | Öğrenci kimlik ve veli/guardian alanları yüksek KVKK hassasiyetindedir. |
| PATCH | `/students/{id}` | Student | `students.write` | Evet | Evet | KVKK consent veya contact değişiklikleri auditlenir. |
| DELETE | `/students/{id}` | Student | `students.delete` | Evet | Evet | Deactivate/archival tercih edilir; tenant dışı silme yasaktır. |
| GET | `/rooms` | Room | `rooms.read` | Evet | Hayır | Düşük KVKK riski; branch tenant uyumu zorunludur. |
| GET | `/rooms/{id}` | Room | `rooms.read` | Evet | Hayır | ID lookup tenant içinde sınırlandırılır. |
| POST | `/rooms` | Room | `rooms.write` | Evet | Evet | Serbest metin notları kişisel veri içermemelidir. |
| PATCH | `/rooms/{id}` | Room | `rooms.write` | Evet | Evet | Capacity/type değişiklikleri auditlenir. |
| DELETE | `/rooms/{id}` | Room | `rooms.delete` | Evet | Evet | Deactivate tercih edilir. |
| GET | `/time-slots` | TimeSlot | `time_slots.read` | Evet | Hayır | Program bilgisi kişi ilişkileriyle birleştiğinde KVKK etkisi doğurabilir. |
| GET | `/time-slots/{id}` | TimeSlot | `time_slots.read` | Evet | Hayır | Teacher yalnızca görünür planlama kayıtlarını okuyabilir. |
| POST | `/time-slots` | TimeSlot | `time_slots.write` | Evet | Evet | Planlama etkisi olan değişiklikler auditlenir. |
| PATCH | `/time-slots/{id}` | TimeSlot | `time_slots.write` | Evet | Evet | Tenant dışı ilişkilendirme yasaktır. |
| DELETE | `/time-slots/{id}` | TimeSlot | `time_slots.delete` | Evet | Evet | Deactivate tercih edilir. |

## Role Bazlı Route Farkları

- `tenant_admin`: Tenant içindeki tüm Sprint 1 CRUD route'larını yönetebilir; cross-tenant erişim yoktur.
- `operations_manager`: Operasyonel CRUD yapabilir; tenant settings, role assignment, security audit ve tenant geneli güvenlik yapılandırmasına erişemez.
- `teacher`: Sadece kendi görünürlük sınırındaki read route'larına erişebilir; write/delete, parent/guardian contact, KVKK consent, audit log ve notification payload erişimi yoktur.

## Sprint 1 PR Merge Policy

Sprint 1 PR merge policy:
- Sprint 1 Quality Gate PASS olmalı.
- Gate 1 CI PASS olmalı.
- DB Smoke Tests PASS olmalı.
- Backend CI PASS olmalı.
- GitGuardian / secret scanner uyarısı açık olmamalı.
- Uyarı varsa remediation veya false-positive kararı yazılmadan merge önerilmez.
- KVKK/audit etkisi yazılmadan merge önerilmez.
- Rollback planı yazılmadan merge önerilmez.
