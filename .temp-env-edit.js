const fs = require('fs');
let content = fs.readFileSync('.env.example', 'utf8');
const marker = 'KVKK_PSEUDONYM_KEY_VERSION=p1';
const insertAfter = '\n# KVKK parent contact encryption REQUIRED exactly 32 bytes in production.\n# AES-256-GCM envelope key for parent contact values (src/kvkk/contact-crypto.ts). The application fails closed (refuses to decrypt) if missing or malformed\n# in production; local/test runs use an isolated non-production fallback.\n# Rotation: set KVKK_CONTACT_KEY_ID to the new key version when you rotate.\nKVKK_CONTACT_KEY=exactly-32-bytes-base64-encoded-key\nKVKK_CONTACT_KEY_ID=key-1\n\n';
content = content.replace(marker, marker + insertAfter);
fs.writeFileSync('.env.example', content);
console.log('Done');