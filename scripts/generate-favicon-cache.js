'use strict';

// Fills favicons.json so the browser never has to ask a third party for an icon.
// Google's favicon service 404s for a long tail of domains, so this falls back
// to DuckDuckGo and then to the site's own /favicon.ico before giving up.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'sites.json'), 'utf8'));
const output = path.join(root, 'favicons.json');
const cache = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};

const REQUEST_TIMEOUT_MS = 12000;
const MAX_ICON_BYTES = 200 * 1024;
const MIN_ICON_BYTES = 64;
// Browsers render all of these in an <img>. Base64 SVG in an img element is
// script-inert, so it is safe to inline.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/svg+xml']);
const TYPE_ALIASES = { 'image/jpg': 'image/jpeg', 'image/vnd.microsoft.icon': 'image/x-icon', 'image/ico': 'image/x-icon' };

function domainFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function sourcesFor(domain) {
  const encoded = encodeURIComponent(domain);
  return [
    `https://www.google.com/s2/favicons?domain=${encoded}&sz=32`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
    `https://${domain}/favicon.ico`
  ];
}

// The lint step only accepts an image data URI, so anything else (an HTML
// error page, a redirect to a login screen) has to be rejected here.
function normalizeType(contentType) {
  const raw = (contentType || '').split(';')[0].trim().toLowerCase();
  const type = TYPE_ALIASES[raw] || raw;
  return ALLOWED_TYPES.has(type) ? type : null;
}

async function fetchIcon(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'CoolSites-favicon-cache' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = normalizeType(response.headers.get('content-type'));
  if (!type) throw new Error(`unsupported content type ${response.headers.get('content-type') || 'none'}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_ICON_BYTES) throw new Error(`icon is only ${bytes.length} bytes`);
  if (bytes.length > MAX_ICON_BYTES) throw new Error(`icon is ${bytes.length} bytes`);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

async function fetchFavicon(domain) {
  const failures = [];
  for (const source of sourcesFor(domain)) {
    try {
      return await fetchIcon(source);
    } catch (error) {
      failures.push(`${new URL(source).hostname}: ${error.message}`);
    }
  }
  throw new Error(`${domain} (${failures.join('; ')})`);
}

(async () => {
  const domains = [...new Set(sites.map(site => domainFromUrl(site.url)).filter(Boolean))].sort();
  const known = new Set(domains);
  let updated = 0;
  const failed = [];

  for (const domain of domains) {
    if (cache[domain]) continue;
    try {
      cache[domain] = await fetchFavicon(domain);
      updated++;
    } catch (error) {
      failed.push(domain);
      console.warn(error.message);
    }
  }

  // Every entry ships to the browser, so an icon for a delisted domain is pure
  // payload.
  let pruned = 0;
  for (const domain of Object.keys(cache)) {
    if (!known.has(domain)) { delete cache[domain]; pruned++; }
  }

  const ordered = Object.fromEntries(Object.keys(cache).sort().map(key => [key, cache[key]]));
  fs.writeFileSync(output, `${JSON.stringify(ordered, null, 2)}\n`);
  const covered = Object.keys(ordered).length;
  console.log(`Cached ${updated} new favicons (${failed.length} failed, ${pruned} stale removed); ${covered}/${domains.length} domains available`);
  if (failed.length) {
    console.log(`No icon found for: ${failed.join(', ')}`);
    console.log('Those entries render the site initial instead. The page makes no third-party request for them.');
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
