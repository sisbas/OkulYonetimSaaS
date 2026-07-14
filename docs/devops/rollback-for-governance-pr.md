# Rollback for Governance PR

## Rollback hedefi

Bu PR CI/merge akışında beklenmeyen kilitlenme oluşturursa geri dönüş dosya silmek değil, önce required check adlarını ve workflow job adlarını eşitlemektir.

## Sıra

1. Failed veya missing required check adı tespit edilir.
2. Workflow job name ile branch protection required check adı karşılaştırılır.
3. Ad uyuşmazlığı varsa workflow veya ruleset düzeltilir.
4. GitGuardian secret eksikse `GITGUARDIAN_API_KEY` eklenir.
5. Scanner false positive ise allowlist değil, önce test/dummy veri temizlenir.
6. Kritik kilit devam ederse bu PR revert edilir ve hotfix PR açılır.

## Revert komutu

```bash
git revert <merge_commit_sha>
git push origin <hotfix_branch>
```

## Migration etkisi

Bu PR migration içermez. DB rollback gerektirmez.
