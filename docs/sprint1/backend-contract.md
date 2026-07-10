# Sprint 1 Backend Contract

> Bu doküman kod değildir; uygulama PR'ları için sözleşme niteliğindedir.

## Sprint 1 Kapsamı

Sprint 1 backend çalışmaları, tenant içi okul operasyonlarının temel CRUD sözleşmesini netleştirir. Bu kapsamda yalnızca aşağıdaki domain sınırları ve gelecekteki uygulama PR'ları için beklenen davranışlar tanımlanır:

- Branch, Teacher, Course, Student, Room ve TimeSlot entity/domain taslakları.
- Tenant izolasyonu ve her kayıtta `tenant_id` zorunluluğu.
- Role dayalı görünürlük ve route yetki sınırları.
- KVKK hassas alanların varsayılan response davranışı.
- Audit gerektiren create/update/delete ve hassas okuma senaryoları.

## Kapsam Dışı

- Feature kodu, migration, controller, service, entity/model, DTO veya test implementasyonu.
- Mevcut backend davranışının değiştirilmesi.
- CI, DB Smoke, Backend CI veya Sprint 1 Quality Gate zincirinin zayıflatılması.
- KVKK, audit veya RBAC kapsamının daraltılması.
- Tenant settings, role assignment, security audit yönetimi ve cross-tenant operasyonlar.
- Notification payload, audit log görüntüleme veya KVKK consent detaylarının öğretmen görünürlüğüne açılması.

## Zorunlu Tenant İzolasyonu

- Sprint 1 kapsamındaki tüm entity kayıtlarında `tenant_id` zorunludur.
- Tüm query, lookup, create, update ve delete işlemleri tenant scope ile sınırlandırılmalıdır.
- Cross-tenant veri erişimi, listeleme, arama, ilişkilendirme, export veya id üzerinden doğrudan erişim kesinlikle yasaktır.
- Tenant admin yetkisi yalnızca kendi tenant'ı içinde geçerlidir; başka tenant verisine erişim hakkı vermez.

## Domain / Entity Taslağı

### Branch

- **Amaç:** Tenant içindeki okul şubesi, kampüs veya organizasyonel birimi temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `name`, `code`, `address_summary`, `is_active`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; tüm Branch kayıtları tek bir tenant'a bağlıdır.
- **KVKK hassasiyet seviyesi:** Düşük-Orta. `address_summary` kişisel veri içermemeli; serbest metin alanlarında kişi adı, telefon veya özel nitelikli veri tutulmamalıdır.
- **Audit ihtiyacı:** Create, update, deactivate/delete işlemleri auditlenmelidir.

### Teacher

- **Amaç:** Tenant içindeki öğretmen personelini ve operasyonel ders ilişkilendirmelerini temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `branch_id`, `first_name`, `last_name`, `employee_code`, `email`, `phone`, `is_active`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; teacher kayıtları tenant dışına taşamaz veya tenant dışı branch/course/student ile ilişkilendirilemez.
- **KVKK hassasiyet seviyesi:** Orta. Kimlik ve iletişim alanları kişisel veri kabul edilir.
- **Audit ihtiyacı:** Create, update, deactivate/delete ve iletişim bilgisi değişiklikleri auditlenmelidir.

### Course

- **Amaç:** Tenant içindeki ders veya eğitim programı tanımını temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `branch_id`, `name`, `code`, `description`, `primary_teacher_id`, `is_active`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; ilişkili branch ve teacher aynı tenant içinde olmalıdır.
- **KVKK hassasiyet seviyesi:** Düşük-Orta. Ders açıklaması serbest metin ise kişisel veri veya özel nitelikli veri içermemelidir.
- **Audit ihtiyacı:** Create, update, deactivate/delete ve öğretmen ataması değişiklikleri auditlenmelidir.

### Student

- **Amaç:** Tenant içindeki öğrenciyi ve Sprint 1 operasyonel kayıt bilgisini temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `branch_id`, `student_number`, `first_name`, `last_name`, `date_of_birth`, `status`, `parent_guardian_contact_summary`, `kvkk_consent_status`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; student kayıtları, branch/course/teacher görünürlüğü ve lookup işlemleri aynı tenant ile sınırlandırılır.
- **KVKK hassasiyet seviyesi:** Yüksek. Öğrenci kimlik bilgileri, doğum tarihi, veli/guardian iletişim bilgileri ve KVKK consent bilgisi hassas kabul edilir.
- **Audit ihtiyacı:** Create, update, deactivate/delete, hassas alan erişimi ve KVKK consent alanı değişiklikleri auditlenmelidir.

### Room

- **Amaç:** Tenant içindeki sınıf, laboratuvar veya fiziksel ders alanını temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `branch_id`, `name`, `code`, `capacity`, `room_type`, `is_active`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; room kayıtları sadece aynı tenant ve branch kapsamında kullanılabilir.
- **KVKK hassasiyet seviyesi:** Düşük. Serbest metin notları varsa kişisel veri içermemelidir.
- **Audit ihtiyacı:** Create, update, deactivate/delete işlemleri auditlenmelidir.

### TimeSlot

- **Amaç:** Tenant içindeki ders planlama zaman aralığını temsil eder.
- **Temel alanlar:** `id`, `tenant_id`, `branch_id`, `day_of_week`, `start_time`, `end_time`, `label`, `is_active`, `created_at`, `updated_at`.
- **`tenant_id` zorunluluğu:** Zorunlu; time slot kayıtları tenant dışı branch, course, room veya teacher planlamasıyla ilişkilendirilemez.
- **KVKK hassasiyet seviyesi:** Düşük-Orta. Tek başına düşük risklidir; öğrenci/öğretmen programı ile birleştiğinde operasyonel kişisel veri etkisi oluşabilir.
- **Audit ihtiyacı:** Create, update, deactivate/delete ve planlama etkisi olan değişiklikler auditlenmelidir.

## Teacher Visibility Sınırı

- Teacher rolü yalnızca kendi tenant'ı içindeki kendisine atanmış veya operasyonel olarak görünür kılınmış branch, course, student, room ve time slot kayıtlarını okuyabilir.
- Teacher rolü parent/guardian contact detaylarını, KVKK consent detaylarını, audit log kayıtlarını ve notification payload içeriklerini okuyamaz.
- Teacher rolü tenant geneli yönetim, role assignment, security audit veya tenant settings kapsamına giremez.
- Teacher görünürlüğü hiçbir durumda cross-tenant veri erişimine dönüşemez.

## Parent / Guardian Contact Alanları

- Sprint 1'de parent/guardian contact bilgileri Student domaininde yüksek KVKK hassasiyetli alan olarak ele alınır.
- Varsayılan student list/detail response'larında parent/guardian contact detayları dönmemelidir.
- Gerektiğinde yalnızca yetkili tenant_admin veya uygun operasyonel yetkiye sahip operations_manager için explicit permission ve audit kaydı ile erişilebilir olmalıdır.
- Teacher rolü parent/guardian contact okuyamaz.

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
