# Demo Interaction Registry

- Menü ve hızlı geçiş linkleri History API ile route değiştirir.
- Schedule taslak/yayınlanmış görünümü değiştirilebilir.
- Conflict validation her çalıştırmada mevcut sentetik event state’inden yeniden hesaplanır.
- Çözülmemiş öğretmen, StudentGroup veya Room overlap sonucu `SCHEDULE_HARD_CONFLICTS_PRESENT` olarak kalır.
- Conflict kartındaki `Çakışmayı düzenle` aksiyonu mevcut event editor modalını açar.
- Event saati, öğretmeni, StudentGroup’u veya dersliği değiştirildiğinde validation otomatik yeniden çalışır.
- Yalnız bütün hard conflictler çözülünce validation `valid` ve count `0` olur.
- Yayınlanmış görünümde event modalı salt okunurdur ve mutation aksiyonu gösterilmez.
- Yeni ders modalı yalnız taslak görünümde demo event state’ine kayıt ekler.
- İzin ekranında yedek öğretmen seçilebilir.
- Yoklama durumu Var/Yok/Geç olarak değiştirilebilir.
- Bildirimler onaylanabilir ve gönderim simüle edilebilir.
- Sıfırla düğmesi deterministik başlangıç state’ini ve üç başlangıç conflict’ini geri getirir.
