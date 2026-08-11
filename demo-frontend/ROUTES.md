# Demo Route Registry

Demo anlatısı: **Ders Programı → İzin → Günlük Operasyon**.

| Route | Amaç |
| --- | --- |
| `/demo/schedule` | Ders programı: taslak/yayınlanmış program, conflict ve event modalı |
| `/demo/leave/:id` | İzin etki analizi ve yedek öğretmen seçimi |
| `/demo/today` | Günlük operasyon sunum akışı |
| `/demo/attendance/session/:id` | Sentetik öğrenci yoklama etkileşimi (planning-only sınır) |
| `/demo/notifications` | İnsan onaylı bildirim simülasyonu (planning-only sınır) |

Yoklama ve Veli Bilgilendirme route'ları planning-only sınırdır: yalnız sentetik ekran etkileşimi gösterir, ürün derinliği veya production iddiası taşımaz.

Tüm route'lar aynı deterministik statik fixture setini kullanır.