# Reviewer Checklist

## Governance PR review

- [ ] Workflow job names required check listesiyle birebir eşleşiyor.
- [ ] PR body validation zorunlu alanları fail-closed doğruluyor.
- [ ] Template placeholder'ları HTML comment içinde ve validation tarafından sayılmıyor.
- [ ] `Draft/Taslak/WIP` gövdede varsa gerçek GitHub draft metadata zorunlu.
- [ ] GitGuardian secret setup dokümanı mevcut.
- [ ] Sensitive pattern scanner credential, phone, TCKN-like ve sensitive log pattern'lerini yakalıyor.
- [ ] Branch protection/ruleset adımları açık.
- [ ] Rollback plan migration gerektirmediğini ve revert yolunu açıklıyor.
