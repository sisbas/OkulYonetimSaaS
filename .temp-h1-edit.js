const fs = require('fs');
let content = fs.readFileSync('artifacts/H1-H2/H1-prod-env-and-health.md', 'utf8');

// Replace the JWT_ACCESS_SECRET line (change "Eri" to "Yok" since they're now required)
content = content.replace(
  '| `JWT_ACCESS_SECRET` | \"✅\" | Eri\\x27Yim token imzas\'\\' |',
  '| `JWT_ACCESS_SECRET` | ✅ | Production bootstrap (JwtStrategy → FATAL if missing ≥32 chars) |'
);

// Replace the JWT_REFRESH_SECRET line
content = content.replace(
  '| `JWT_REFRESH_SECRET` | \"✅\" | Refresh token imzas\\' (refresh yaln\\x27az hash saklan\\'r) |',
  '| `JWT_REFRESH_SECRET` | ✅ | Production login/refresh; required at auth bootstrap |'
);

// Add KVKK_CONTACT_KEY line after KVKK_PSEUDONYM_KEY_VERSION line
content = content.replace(
  '| `KVKK_PSEUDONYM_KEY_VERSION` | opsiyonel | Pseudonym anahtar s\\x27r\\x27s\\x27 (\' key-id tabanl\\' do\\'rulama/rotasyon) |',
  '| `KVKK_PSEUDONYM_KEY_VERSION` | opsiyonel | Pseudonym anahtar sürümü (key-id tabanlı doğrulama/rotasyon) |\n| `KVKK_CONTACT_KEY` | ✅ | AES-256-GCM envelope key for parent contact; exactly 32 bytes; lazy (fails closed in decrypt, not bootstrap) |'
);

fs.writeFileSync('artifacts/H1-H2/H1-prod-env-and-health.md', content);
console.log('H1 doc updated');