const fs = require('fs');
let pkg = fs.readFileSync('package.json', 'utf8');
pkg = JSON.parse(pkg);

// Add new scripts
pkg.scripts['check:production-env'] = 'node scripts/check-production-env.cjs';
pkg.scripts['smoke:production-auth'] = 'node scripts/production-auth-smoke.cjs';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('Package.json updated with new scripts');