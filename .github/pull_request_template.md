## Amaç

<!-- Bu PR neden açıldı? Hangi kullanıcı hikayesi, bug veya teknik borç kapatılıyor? -->

## Etkilenen modül

- [ ] Auth / Tenant
- [ ] RBAC / Permission
- [ ] Ders Programı
- [ ] İzin Yönetimi
- [ ] Günlük Operasyon
- [ ] Yoklama
- [ ] Veli Bilgilendirme
- [ ] KVKK / Audit
- [ ] CI / DevOps
- [ ] Diğer: <!-- yazınız -->

## Acceptance criteria

- [ ] AC-1:
- [ ] AC-2:
- [ ] AC-3:

## Test çıktısı

<!-- Lokal veya CI çıktısını yaz. Belirsiz CI sonucu varsa merge önermeyin. -->

- [ ] `npm ci` PASS
- [ ] `npm run lint` PASS
- [ ] `npm run test:unit` PASS
- [ ] `npm run db:migrate` PASS
- [ ] `npm run db:seed:permissions` PASS
- [ ] `npm run db:verify` PASS
- [ ] `npm run test:rbac` PASS
- [ ] `npm run test:kvkk` PASS
- [ ] `npm run test:audit-redaction` PASS
- [ ] `npm run build` PASS

CI run URL:

```text
<!-- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/<RUN_ID> -->
```

## KVKK/audit etkisi

- [ ] Kişisel veri alanı eklenmedi.
- [ ] Kişisel veri alanı eklendi ve redaction/audit kapsamı güncellendi.
- [ ] Parent/guardian contact verisi açık loglanmıyor.
- [ ] Credential/token/secret/email/phone alanları loglarda maskeleniyor.
- [ ] KVKK consent akışı etkilenmiyor veya testle doğrulandı.

Not:

```text
<!-- KVKK/audit etkisini kısa yazınız. -->
```

## Rollback planı

- [ ] Revert edilecek commit/PR açıkça belli.
- [ ] Migration rollback gerekmiyor.
- [ ] Migration rollback gerekiyorsa `npm run db:migrate:revert` yolu test edildi veya notlandı.
- [ ] Main kırılırsa önce revert, sonra hotfix PR açılacak.

Rollback notu:

```text
<!-- Örn: Revert PR #XX. DB migration yok. -->
```

## Merge güvenlik kontrolü

- [ ] CI sonucu `completed / success`.
- [ ] FAIL varsa ilk hata satırı ayrıştırıldı.
- [ ] Failure tipi sınıflandırıldı: flaky / env-config / real test failure.
- [ ] Belirsiz CI sonucu yok.
- [ ] Main branch kırılma riski düşük.
