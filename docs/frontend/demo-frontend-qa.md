# Demo Frontend QA

## Sev-2 conflict validation regression

Önceki davranış, event state değişmeden `validated=true` atıyor; conflict stillerini kaldırıyor ve hard conflict sayısını sıfır gösteriyordu.

Yeni davranış:

- Validation, mevcut demo event listesi üzerinden pure conflict engine ile hesaplanır.
- Aynı gün ve çakışan zaman aralığındaki Teacher, StudentGroup ve Room eşleşmeleri ayrı hard conflict kayıtları üretir.
- Başlangıç fixture’ı deterministik olarak bir Teacher, bir StudentGroup ve bir Room overlap içerir.
- Conflict kartları ve event stilleri gerçek validation sonucundan türetilir.
- Event editor kaydı sonrasında validation otomatik yeniden çalışır.
- `valid` yalnız `hardConflictCount === 0` olduğunda gösterilir.
- Published görünümde save/add/validation mutation aksiyonları kapalıdır.

## Otomatik assertion kapsamı

- Unresolved teacher overlap zero-conflict success üretemez.
- Unresolved StudentGroup overlap zero-conflict success üretemez.
- Unresolved Room overlap zero-conflict success üretemez.
- Bir conflict çözülünce count azalır.
- Son conflict çözülünce count sıfır olur.
- Reset başlangıç conflict durumunu geri getirir.
- Published görünüm mutation açmaz.
- Network, auth, permission ve persistent storage marker’ları yoktur.

## Manuel preview kontrolü

- Taslak görünüm başlangıçta üç conflict göstermeli.
- Değişiklik yapmadan `Çakışmaları doğrula` count’u sıfırlamamalı.
- Her conflict kartı ilgili event editor modalını açmalı.
- Event kaynak alanı değiştirildiğinde count azalmalı.
- Son conflict çözüldüğünde başarı durumu görünmeli.
- Reset sonrası başlangıçtaki üç conflict geri gelmeli.
- Yayınlanmış görünümde düzenleme ve yeni event mutation’ı açılmamalı.
