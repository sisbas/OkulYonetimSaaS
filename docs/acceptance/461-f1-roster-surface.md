# #461 F1 — Salt-okunur öğrenci roster yüzeyi

**Durum:** Kod tamam; birim testleri yeşil; gerçek PostgreSQL kanıtı CI'da
(`test/database/student-roster.db.spec.ts`, `postgres:16`).

Bu dilim, #454 yerinde yoklama ve #455 karar rayı için gereken sunucu
otoritesini kurar. Öğrenci/grup CRUD'u **kapsam dışıdır**; yalnız okuma vardır.

## Uçlar

| Method | Path | İzin | Açıklama |
|---|---|---|---|
| GET | `/api/v1/students?branchId=&studentGroupId=&search=&page=&limit=` | `student:read` | Şube/tenant kapsamlı, aktif öğrenci listesi. `studentGroupId` verilirse yalnız o grubun aktif üyeleri. |
| GET | `/api/v1/students/:id` | `student:read` | Tek öğrenci temel kaydı. Aktif şube bağlamı varsa yalnız o şubedeki öğrenci. |
| GET | `/api/v1/student-groups/:groupId/students?branchId=&page=&limit=` | `student:group_students:read` | Sınıf roster'ı; öğretmenin kullandığı yüzey. |

`branchId` verilmezse sunucunun çözdüğü aktif şube (`context.branchId`)
kullanılır. İkisi de yoksa liste uçları `400` döner. Tenant dışı veya aktif
olmayan şube/grup/öğrenci için yanıt `404`'tür; varlık sızdırılmaz.

## Yanıt sözleşmesi

```json
{
  "data": [
    {
      "id": "uuid",
      "branchId": "uuid",
      "studentCode": "DEMO-9A-S001",
      "firstName": "Ada",
      "lastName": "Yılmaz",
      "enrollmentStatus": "active"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Roster yanıtı ek olarak `studentGroup` özetini taşır:

```json
{
  "studentGroup": { "id": "uuid", "branchId": "uuid", "name": "9-A", "code": "DEMO-9A" },
  "data": [],
  "meta": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 }
}
```

**PII minimizasyonu:** `birthDate`, `gender`, veli/guardian adı, telefonu,
e-postası ve KVKK consent alanları yanıta **hiç** çıkmaz. Roster yalnız yoklama
için gereken ad-soyad/numara ve durum alanlarını taşır.

## Veri modeli

`student_group_members` (migration `1890000000000-CreateStudentGroupMembers`):

| Alan | Not |
|---|---|
| `tenant_id`, `branch_id` | Zorunlu; branch aynı tenant'ta olmalı. |
| `student_group_id` | `student_groups(tenant_id, branch_id, id)` composite FK. |
| `student_id` | `students(tenant_id, branch_id, id)` composite FK. |
| `status` | `active` / `inactive`. |
| `deleted_at` | Soft-delete; roster dışlar. |

- `uq_students_branch_id (tenant_id, branch_id, id)` composite FK hedefi olarak
  eklendi; yıkıcı veri değişikliği yok.
- `uq_student_group_members_active` partial unique index: aynı öğrenci aynı
  grupta yalnız bir **aktif** üyelik taşıyabilir; soft-delete sonrası yeni
  üyelik açılabilir.
- Cross-tenant ve cross-branch üyelik composite FK ile reddedilir.

## Sentetik seed

```bash
SEED_TENANT_SLUG=system-seed \
SEED_BRANCH_CODE=DEMO \
SEED_BRANCH_NAME="Demo Şube" \
SEED_GROUP_CODE=DEMO-9A \
SEED_GROUP_NAME="9-A" \
SEED_STUDENT_COUNT=8 \
npm run db:seed:students
```

Seed idempotenttir; gerçek kişi verisi içermez. Şube yoksa oluşturur, varsa
adını/güncelliğini tazeler. Öğrenci kodları `DEMO-9A-S001` biçimindedir.

## Testler

| Test | Ne kanıtlar |
|---|---|
| `src/students/student.repository.spec.ts` | Tenant/branch filtreleri, aktif üyelik join'i, soft-delete dışlama, arama kaçışı, deterministik roster. |
| `src/students/student.service.spec.ts` | 404/400 davranışı, PII minimizasyonu, aktif şube bağlamı. |
| `src/students/student.controller.spec.ts` | `student:read` / `student:group_students:read` eşlemesi. |
| `test/database/student-group-members.migration.spec.ts` | Migration up/down sözleşmesi, composite FK'ler, partial unique index. |
| `test/database/student-roster.db.spec.ts` | Gerçek PostgreSQL: cross-tenant/cross-branch reddi, duplicate aktif üyelik, soft-delete sonrası yeniden üyelik, seed idempotency. |

## Sınırlar

- Akademik dönem/efektif tarih modellemesi yoktur; yalnız aktif üyelik.
- Öğrenci veya grup oluşturma/güncelleme/silme ucu yoktur.
- `student_group:*` contract-only izin anahtarları kullanılmaz.
- Bu dilim #454 UI'ını, #455 karar rayını veya #461 insan kapısını tek başına
  kapatmaz; yalnız sunucu tarafındaki roster otoritesini sağlar.
