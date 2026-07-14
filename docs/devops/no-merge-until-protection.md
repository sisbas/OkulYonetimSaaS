# No Merge Until Protection

Bu governance PR'ı merge edildikten sonra aşağıdaki korumalar aktif edilmeden yeni ürün/runtime PR'ları merge edilmemelidir.

## Gerekli korumalar

- Required status checks aktif.
- En az bir review required.
- Stale approval dismissal aktif.
- Conversation resolution required.
- Direct push kapalı.
- Admin bypass kapalı veya emergency-only loglu.
- `GITGUARDIAN_API_KEY` repository secret mevcut.

## Kapsam

Bu kural özellikle M2 runtime/frontend, Room, Course, TimeSlot, StudentGroup ve KVKK/audit etkisi olan PR'lar için geçerlidir.
