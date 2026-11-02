const fs = require('fs');
const path = process.argv[2];
const j = JSON.parse(fs.readFileSync(path, 'utf8'));
const eps = j.data.endpoints;
console.log('model', j.data.id, 'endpoints', eps.length);
console.log('keys', Object.keys(eps[0]).join(','));
for (const e of eps) {
  const interesting = {};
  for (const [k, v] of Object.entries(e)) {
    if (/through|latenc|uptime|status|provider_name|tag|name|quant/i.test(k) && typeof v !== 'object') {
      interesting[k] = v;
    }
  }
  console.log(JSON.stringify(interesting));
}
