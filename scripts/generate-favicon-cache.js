const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'sites.json'), 'utf8'));
const output = path.join(root, 'favicons.json');
const cache = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};

function domainFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function fetchFavicon(domain) {
  const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`);
  if (!res.ok) throw new Error(`${domain}: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

(async () => {
  const domains = [...new Set(sites.map(site => domainFromUrl(site.url)).filter(Boolean))].sort();
  let updated = 0;
  for (const domain of domains) {
    if (cache[domain]) continue;
    try {
      cache[domain] = await fetchFavicon(domain);
      updated++;
    } catch (error) {
      console.warn(error.message);
    }
  }
  fs.writeFileSync(output, `${JSON.stringify(cache, null, 2)}\n`);
  console.log(`Cached ${updated} new favicons; ${Object.keys(cache).length}/${domains.length} domains available`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
