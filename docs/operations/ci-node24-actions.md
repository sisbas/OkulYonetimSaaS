# CI Node 24 Actions Runtime

## Amaç

GitHub Actions runner uyarısında görülen Node.js 20 tabanlı JavaScript action kullanımını Backend CI hattından kaldırmak.

## Karar

- `actions/checkout@v4` yerine Node 24 runtime uyumlu `actions/checkout@v6` kullanılacak.
- `actions/setup-node@v4` yerine Node 24 runtime uyumlu `actions/setup-node@v5` kullanılacak.
- Project test runtime `node-version: 22` korunacak; bu değişiklik uygulama Node hedefini değiştirmez.

## Kapsam dışı

Runtime, migration, database schema, API kodu, test beklentisi ve governance ruleset değişikliği yoktur.

## Kanıt beklentisi

- Backend CI completed/success.
- Node 20 action runtime deprecation warning görünmemeli.
- `npm ci`, `npm run lint`, `npm test`, `npm run build` aynı şekilde çalışmalı.
