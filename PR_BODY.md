# Pull request body çalışma kopyası

Bu dosya belirli bir pull request'e ait kalıcı kanıt deposu değildir. Yeni PR gövdesi
hazırlarken [`.github/pull_request_template.md`](.github/pull_request_template.md)
şablonunu kopyalayın ve yalnızca güncel branch/head için doğrulanmış kanıtları yazın.

Eski commit SHA'ları, workflow run bağlantıları veya tamamlanmamış kararlar burada
tutulmamalıdır. Kalıcı kanıtlar ilgili issue, PR veya `docs/` altındaki konuya özgü
evidence kaydında saklanmalıdır.

## Kullanım

1. PR'ı önce Draft olarak açın.
2. Şablondaki kapsam, kabul kriterleri, KVKK/audit etkisi ve rollback alanlarını doldurun.
3. Yerel kontrolleri ve current-head GitHub Actions sonuçlarını ekleyin.
4. Tamamlanmamış acceptance kriteri kalmadığında Ready for review durumuna geçirin.
5. Bağımsız review ve tüm required check'ler başarılı olmadan merge etmeyin.
