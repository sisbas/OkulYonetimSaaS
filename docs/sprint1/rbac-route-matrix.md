# Sprint 1 RBAC Route Matrix

> Bu doküman Sprint 1 uygulama PR'ları için RBAC sözleşmesidir; runtime davranışı değiştirmez.

## Roller

- `tenant_admin`: Tenant içi tam yönetim yetkisine sahiptir; cross-tenant erişimi yoktur.
- `operations_manager`: Operasyonel CRUD yapabilir; tenant settings, role assignment ve security audit kapsamına giremez.
- `teacher`: Yalnızca kendi görünürlük sınırındaki okuma işlemlerine erişebilir.

## Permission Matrisi

| Route | Permission key | tenant_admin | operations_manager | teacher | KVKK/audit notu |
| --- | --- | --- | --- | --- | --- |
| `GET /branches`, `GET /branches/{id}` | `branches.read` | Allow | Allow | Conditional | Teacher sadece görünür branch kayıtlarını okuyabilir. |
| `POST/PATCH /branches` | `branches.write` | Allow | Allow | Deny | Create/update auditlenir. |
| `DELETE /branches/{id}` | `branches.delete` | Allow | Allow | Deny | Delete/deactivate auditlenir. |
| `GET /teachers`, `GET /teachers/{id}` | `teachers.read` | Allow | Allow | Conditional | Teacher kendi profilini veya atanmış görünürlüğü okuyabilir; iletişim alanları kişisel veridir. |
| `POST/PATCH /teachers` | `teachers.write` | Allow | Allow | Deny | Email/phone değişiklikleri auditlenir. |
| `DELETE /teachers/{id}` | `teachers.delete` | Allow | Allow | Deny | Deactivate auditlenir. |
| `GET /courses`, `GET /courses/{id}` | `courses.read` | Allow | Allow | Conditional | Teacher sadece atanmış/görünür course kayıtlarını okuyabilir. |
| `POST/PATCH /courses` | `courses.write` | Allow | Allow | Deny | Öğretmen ataması değişiklikleri auditlenir. |
| `DELETE /courses/{id}` | `courses.delete` | Allow | Allow | Deny | Delete/deactivate auditlenir. |
| `GET /students`, `GET /students/{id}` | `students.read` | Allow | Allow | Conditional | Default response parent/guardian contact ve KVKK consent detaylarını dönmez. |
| `POST/PATCH /students` | `students.write` | Allow | Allow | Deny | Öğrenci, contact ve consent değişiklikleri yüksek KVKK etkisi nedeniyle auditlenir. |
| `DELETE /students/{id}` | `students.delete` | Allow | Allow | Deny | Delete/deactivate auditlenir; archival tercih edilir. |
| `GET /rooms`, `GET /rooms/{id}` | `rooms.read` | Allow | Allow | Conditional | Teacher sadece görünür room kayıtlarını okuyabilir. |
| `POST/PATCH /rooms` | `rooms.write` | Allow | Allow | Deny | Create/update auditlenir. |
| `DELETE /rooms/{id}` | `rooms.delete` | Allow | Allow | Deny | Delete/deactivate auditlenir. |
| `GET /time-slots`, `GET /time-slots/{id}` | `time_slots.read` | Allow | Allow | Conditional | Teacher sadece görünür planlama kayıtlarını okuyabilir. |
| `POST/PATCH /time-slots` | `time_slots.write` | Allow | Allow | Deny | Planlama etkisi olan değişiklikler auditlenir. |
| `DELETE /time-slots/{id}` | `time_slots.delete` | Allow | Allow | Deny | Delete/deactivate auditlenir. |

## Teacher İçin Açık Yasaklar

Teacher rolü aşağıdaki verilere veya işlemlere erişemez:

- Parent/guardian contact okuyamaz.
- KVKK consent okuyamaz.
- Audit log okuyamaz.
- Notification payload okuyamaz.
- Cross-tenant data okuyamaz.
- Sprint 1 write/delete route'larını kullanamaz.
- Tenant settings, role assignment veya security audit kapsamına giremez.

## Operations Manager Sınırları

- Branch, Teacher, Course, Student, Room ve TimeSlot için tenant içi operasyonel CRUD yapabilir.
- Tenant settings, role assignment, security audit ve tenant geneli güvenlik yapılandırması kapsamına giremez.
- Cross-tenant veri okuyamaz, yazamaz, ilişkilendiremez veya silemez.
- Hassas Student contact veya KVKK consent alanlarına erişim gerekiyorsa explicit permission, audit ve KVKK etki notu gerekir.

## Tenant Admin Sınırları

- Tenant içi Sprint 1 CRUD kapsamındaki route'larda tam yetkilidir.
- Tenant dışı veri erişimi, tenant dışı ilişkilendirme ve cross-tenant arama yapamaz.
- KVKK/audit etkisi olan hassas alan işlemleri için audit kaydı ve merge policy etkisi yazılmalıdır.

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
