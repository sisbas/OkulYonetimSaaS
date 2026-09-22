# Repo Operations Notes (agent-facing)

Bu dosya, bu repo'da çalışan ajanların **tekrar tekrar karşılaştığı tuzakları** ve
kanıtlanmış çözümlerini kaydeder. Buradaki maddeler gözleme dayanır (hangi komut
hangi hatayı üretti, ne düzeltildi); yeni bir tuzak bulunduğunda buraya eklenir.

Kapsam: yerel/yıkıcı olmayan doğrulama akışı, git/CI etkileşimi ve dosya yazımı.
Ürün/domain kararları için `docs/adr/`, issue akışı için
`docs/agents/issue-tracker.md`, domain sözlüğü için `CONTEXT.md` geçerlidir.

Özet (detaylar aşağıda):

1. Uzak merge/rebase sonrası `tsc` **ve** jest'i sıfırdan koştur.
2. Dosya düzenlemede PowerShell `Set-Content` kullanma (UTF-8 bozulur).
3. `git push`'u arka planda çalıştır ve `git rev-parse origin/<branch>` ile doğrula.
4. `docs/*` ve `src/database/migrations` `.gitignore` kapsamında → `git add -f`.
5. `tsc` bulguları **stdout**'ta; çıkış kodu + stdout birlikte okunur.
6. Kanıt üretmeden "tamam" demeyin (mutasyon kontrolü, gerçek DB kanıtı CI'da).

## 1. Uzak merge/rebase sonrası doğrulamayı SIFIRDAN çalıştır

Uzak dal `main` ile birleştirildiğinde (örn. otomatik "Merge branch 'main' into
<branch>" commit'i) çakışma çözümü **sessiz kod bozulması** bırakabilir: orphan
kod bloğu, çiftlenmiş nesne özelliği, eksik parantez. Bu bozulmalar yerel test
koşusu yapılmadığı sürece görünmez ve CI'da `error TS1005` / `error TS1117`
olarak patlar.

Kanıtlanmış akış:

```bash
git fetch origin --prune
git status -sb                      # ileri/geri durum
git rev-list --left-right --count origin/<branch>...<branch>
git rebase origin/<branch>          # veya git merge
npx tsc -p tsconfig.json --noEmit   # önce tip kapısı
npx jest --runInBand src test/rbac test/kvkk test/database test/contracts
```

Notlar:

- `tsc` tek başına yeterli değildir: `tsconfig.json` bazı dizinleri dışarıda
  bırakır ve jest (ts-jest) spec'leri ayrıca derler. Bu yüzden **hem** `tsc`
  **hem** jest koşulmalıdır; iki gerçek artık (orphan kod + çiftlenmiş
  `save` özelliği) yalnız bu ikili koşuda yakalandı.
- Şüphelendiğin dosyayı bilinen iyi sürümden karşılaştır/geri al:
  `git diff <iyi-sha> HEAD -- <path>` ve `git checkout <iyi-sha> -- <path>`.
  Merge edilen `main` bu dalın **eski** içeriğini taşıyorsa, dalın daha yeni
  sürümü (audit/`main` sonrası commit'ler) kazanmalıdır; aksi hâlde daha yeni
  özellikler geri düşer.

## 2. Dosya düzenlemede PowerShell `Set-Content` KULLANMA

`Get-Content | ... | Set-Content -Encoding utf8` döngüsü Windows PowerShell'de
UTF-8'i bozar: Türkçe karakterler `doÄŸrulama`, `sÄ±nÄ±rÄ±` gibi mojibake'e döner
(ayrıca BOM ekler). Bu repoda kaynak/dokümanlar UTF-8'dir ve Türkçe metin
içerir; bozulma CI'da değil, sonraki okuyan insanda/ajanda sorun olur.

Doğru yol:

- Metin düzenlemeleri için **editör aracını** kullan (doğru UTF-8 yazar).
- Toplu/otomatik düzenleme gerekiyorsa Node ile yaz, örn.:
  `node -e "const fs=require('fs');const p='src/x.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/A/g,'B'),'utf8')"`
- Yazdıktan sonra mojibake taraması:
  `Select-String -Path <path> -Pattern 'Ã|Ä|Å|â€'` → sonuç **0** olmalı.
- `-replace` ile yazan bir komut çalıştırdıysan, dosyayı editörle açıp
  yorum/metin satırlarını gözle doğrula; yalnız kod satırları ASCII olsa bile
  yorumlar bozulmuş olabilir.

## 3. `git push` çıktısı komutu düşürebilir — arka planda çalıştır ve ref'i doğrula

Bu ortamda `git push` ilerlemesini **stderr**'e yazar; kabuk stderr'i hata
saydığında komut zinciri kesilir ve push yarıda kalabilir. Ayrıca "her şey
güncel" görünen bir çıktı, push'un **reddedildiğini** gizleyebilir (ör. uzak dal
senin dalını içermiyorsa: `Updates were rejected because the remote contains
work that you do not have locally`).

Kanıtlanmış akış:

```powershell
$p = Start-Process -FilePath "git.exe" `
  -ArgumentList "push","origin","<branch>" `
  -NoNewWindow -PassThru `
  -RedirectStandardOutput "push.out" -RedirectStandardError "push.err"
Start-Sleep -Seconds 20
git rev-parse origin/<branch>     # HEAD ile karşılaştır
Get-Content push.err -Tail 5      # reddedilme/varsa hata
```

- **Push sonrası daima `git rev-parse origin/<branch>` ile teyit et.**
- Reddedilirse: `git fetch origin`, `git log --oneline origin/<branch>`,
  `git rev-list --left-right --count origin/<branch>...<branch>` ile farkı gör;
  gerekirse `git rebase origin/<branch>` sonra tekrar push et.
- Uzun süren doğrulama komutları (jest/npm) da aynı yöntemle arka planda
  çalıştırılıp çıktı dosyasından okunmalıdır (komut zaman aşımı ~30 sn).

## 4. `docs/*` ve `src/database/migrations` `.gitignore` kapsamındadır

`.gitignore` şu satırları içerir: `docs/` + `docs/*` (yalnız
`docs/agents/**` muaf), `migrations/`. Yani:

- Yeni migration: `git add -f src/database/migrations/<ts>-<Name>.ts`
- Yeni doküman: `git add -f docs/<area>/<file>.md`
  (`docs/agents/**` altı **muaf** → orada `-f` gerekmez)
- Zaten takip edilen (tracked) bir dosyayı değiştirdiysen normal `git add`
  çalışır; **yeni** dosya için `-f` şarttır. `git status --short` çıktısında
  dosyanın görünmemesi bu kuralı akla getirmelidir.

## 5. `tsc` hataları **stdout**'a yazar — exit code + stdout birlikte okunur

`npx tsc -p tsconfig.json --noEmit` bulgularını **stdout**'a basar, stderr'i boş
bırakır. Yalnız stderr dosyasını (`tsc.err`) kontrol etmek "temiz" sanılan ama
hatalı bir ağaç üretir; hata ancak CI'da `##[error] error TS2307 …` olarak
görünür.

Kanıtlanmış akış:

```powershell
$p = Start-Process -FilePath "npx.cmd" -ArgumentList "tsc","-p","tsconfig.json","--noEmit" `
  -NoNewWindow -PassThru -RedirectStandardOutput "tsc.out" -RedirectStandardError "tsc.err"
Start-Sleep -Seconds 25
Write-Output "exit=$($p.ExitCode)"
Get-Content tsc.out -Tail 20      # ASIL bulgular burada
Get-Content tsc.err -Tail 5
```

- `exit` **0** ve `tsc.out` **boş** olmalı; aksi hâlde temiz sayılmaz.
- Aynı kural diğer araçlar için de geçerlidir: hangi akışa yazdığını bilmediğin
  aracın **her iki** akışını ve çıkış kodunu birlikte kontrol et
  (`jest` sonuçları stderr'e, `tsc` stdout'a yazar).
- Yeni dosya ekledikten sonra göreli import yollarını mutlaka doğrula: aynı
  dizin ağacındaki bir modül `../common/x` değil `../x` olur
  (`src/common/audit/audit.controller.ts` → `../context/request-context`).
  Yanlış yol yerel olarak test edilmeyen dosyalarda (ör. yalnız `app.module.ts`
  üzerinden import edilen controller) CI'da `TS2307` üretir.

## 6. Kanıt üretmeden "tamam" demeyin (repo governance'ı)

- PR/commit mesajlarında yalnız **çalıştırılmış** komutların sonuçları yazılır;
  "bekleniyor/olacak" ifadeleri governance kontrollerinde reddedilir.
- Testin gerçekten yakaladığını göstermek için **mutasyon kontrolü** yap:
  korunması gereken satırı geçici kaldır → test kırmızıya dönmeli → geri al.
- `DATABASE_URL`/PostgreSQL yoksa DB'ye bağlı suite'ler yerelde **skip** olur;
  bu bir "environment prerequisite"tir, ürün hatası değildir. Gerçek-PostgreSQL
  kanıtı CI DB Smoke'ta `test:database:required` (skip yasak) ile alınır.
- Yeşil olmayan bir kontrolü gizlemek yerine, bulguyu ve düzeltmeyi aynı
  PR/thread'de kaydet (`fixed:<sha>` / `rejected:<counter-evidence>`).
