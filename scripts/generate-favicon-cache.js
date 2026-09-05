'use strict';

// Fills favicons.json so the browser never has to ask a third party for an icon.
// Google's favicon service 404s for a long tail of domains, so this falls back
// to DuckDuckGo and then to the site's own /favicon.ico before giving up.
//
// An entry is one of three things, and the difference matters. A data URI means
// an icon was found. `false` means all four sources were tried and there is
// nothing to find: putty.org serves no link tags at all, retroarch.com has
// seven and none of them is an icon. Absent means nobody has looked yet. Without
// the middle state every run re-attempted the same thirteen domains and paid
// four requests each to learn what the last run already knew.
//
//   node scripts/generate-favicon-cache.js [--no-reencode] [--retry-missing]

const fs = require('node:fs');
const path = require('node:path');
const { reencodeAll, RENDER_SIZE } = require('./lib/reencode-icons');
const { record } = require('./lib/cache-manifest');

const root = path.resolve(__dirname, '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'sites.json'), 'utf8'));
const output = path.join(root, 'favicons.json');
const cache = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};

const REQUEST_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 400 * 1024;
const MAX_PAGE_ICONS = 6;
// The three icon services and a bare /favicon.ico cover most of the web. What
// they miss is sites that declare an icon somewhere else entirely, which is why
// the page itself is worth reading. Plenty of those hosts also refuse a
// script-shaped user agent, so this one asks the way a browser would.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ICON_REL = /(?:^|\s)(?:shortcut\s+)?(?:icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon|fluid-icon)(?:\s|$)/i;
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

function looksLikeImage(bytes) {
  if (bytes.length < 8) return false;
  const head = bytes.subarray(0, 4);
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (bytes.subarray(0, 3).toString('latin1') === 'GIF') return true;
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF'
    && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return true;
  if (head[0] === 0x00 && head[1] === 0x00 && (head[2] === 0x01 || head[2] === 0x02)) return true;
  const text = bytes.subarray(0, 256).toString('utf8');
  return text.includes('<svg') || text.trimStart().startsWith('<?xml');
}

async function fetchIcon(url, userAgent = 'CoolSites-favicon-cache') {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': userAgent }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = normalizeType(response.headers.get('content-type'));
  if (!type) throw new Error(`unsupported content type ${response.headers.get('content-type') || 'none'}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_ICON_BYTES) throw new Error(`icon is only ${bytes.length} bytes`);
  if (bytes.length > MAX_ICON_BYTES) throw new Error(`icon is ${bytes.length} bytes`);
  // Servers lie about Content-Type. One domain served a macOS alias file as
  // image/x-icon, which the browser then refused to decode.
  if (!looksLikeImage(bytes)) throw new Error(`payload is not an image (starts ${bytes.subarray(0, 4).toString('hex')})`);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

// Pulls every icon a page declares. Written against the raw HTML rather than a
// parser because adding a dependency to read four link tags is not a trade worth
// making in a project with none.
function iconLinksFromHtml(html, baseUrl) {
  const links = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
    if (!rel || !href) continue;
    const relValue = (rel[1] ?? rel[2] ?? rel[3] ?? '').trim();
    if (!ICON_REL.test(relValue)) continue;
    const hrefValue = (href[1] ?? href[2] ?? href[3] ?? '').trim();
    if (!hrefValue) continue;
    try {
      links.push(new URL(hrefValue, baseUrl).toString());
    } catch {
      // A malformed href is the page's problem, not a reason to stop.
    }
  }
  // A site that lists ten sizes of the same icon should not cost ten requests.
  return [...new Set(links)].slice(0, MAX_PAGE_ICONS);
}

async function iconsDeclaredByPage(pageUrl) {
  const response = await fetch(pageUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('html') && !contentType.includes('xml')) throw new Error(`not a page (${contentType || 'no content type'})`);
  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const links = iconLinksFromHtml(html, response.url);
  if (!links.length) throw new Error('page declares no icon');
  return links;
}

async function fetchFavicon(domain, pageUrl) {
  const failures = [];
  for (const source of sourcesFor(domain)) {
    try {
      return await fetchIcon(source);
    } catch (error) {
      failures.push(`${new URL(source).hostname}: ${error.message}`);
    }
  }

  // Last resort: read the page and use whatever icon it points at. This is the
  // one source that finds icons on project pages, where the domain root has no
  // favicon.ico because the project lives on a path.
  try {
    for (const link of await iconsDeclaredByPage(pageUrl)) {
      try {
        return await fetchIcon(link, BROWSER_USER_AGENT);
      } catch (error) {
        failures.push(`declared ${link.slice(0, 60)}: ${error.message}`);
      }
    }
  } catch (error) {
    failures.push(`page: ${error.message}`);
  }

  const error = new Error(`${domain} (${failures.join('; ')})`);
  // A 404 from every source and a page declaring no icon is a fact about the
  // site. A timeout, a rate limit or a server error is a fact about this
  // minute. Recording the second as "there is no icon here" freezes a domain at
  // the fallback initial until somebody remembers to pass --retry-missing.
  error.definitive = !failures.some(isTransient);
  throw error;
}

const TRANSIENT = /\btimed out\b|\bHTTP (?:408|425|429|5\d\d)\b|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed|socket/i;

function isTransient(failure) {
  return TRANSIENT.test(failure);
}

// Exported for the tests. Reading link tags out of arbitrary HTML with a regex
// is the kind of thing that quietly matches nothing, so it gets exercised
// against awkward markup rather than trusted.
module.exports = { iconLinksFromHtml, looksLikeImage, domainFromUrl, isTransient };

if (require.main !== module) return;

(async () => {
  // Keep a real entry URL per domain. The domain root is often not where the
  // site lives, and asking a project page for its icon works where asking
  // github.io for one does not.
  const pageForDomain = new Map();
  for (const site of sites) {
    const domain = domainFromUrl(site.url);
    if (domain && !pageForDomain.has(domain)) pageForDomain.set(domain, site.url);
  }
  const domains = [...pageForDomain.keys()].sort();
  const known = new Set(domains);
  let updated = 0;
  const failed = [];

  const retryMissing = process.argv.includes('--retry-missing');
  let skipped = 0;
  const transient = [];
  for (const domain of domains) {
    if (cache[domain]) continue;
    // Recorded as having no icon by a previous run. A site can start publishing
    // one, so --retry-missing exists, but doing it every run is four requests
    // per domain to be told the same thing again.
    if (cache[domain] === false && !retryMissing) { skipped++; failed.push(domain); continue; }
    try {
      cache[domain] = await fetchFavicon(domain, pageForDomain.get(domain));
      updated++;
    } catch (error) {
      // Only a definitive "there is no icon here" is worth remembering. A
      // transient failure is left unrecorded so the next run asks again.
      if (error.definitive) cache[domain] = false;
      else transient.push(domain);
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

  // Every byte here is downloaded by every reader, so anything the fallbacks
  // handed back at 180px or as a multi-resolution .ico gets re-encoded at the
  // size the page renders. Skipped with --no-reencode, which is what you want
  // when Chrome is not available and you only need the fetch.
  if (!process.argv.includes('--no-reencode')) {
    // A re-encode that cannot run must not cost the fetch that already worked.
    // Chrome missing from the machine threw from here, past the point where
    // every newly fetched icon was in memory and before the point where any of
    // it was written, so an entire run was discarded to save nobody any bytes.
    try {
      const result = await reencodeAll(cache, {
        onProgress: (done, total) => process.stdout.write(`\r  re-encoding ${done}/${total}`)
      });
      if (result.checked) {
        process.stdout.write('\n');
        console.log(`Re-encoded ${result.shrunk} of ${result.checked} oversized icons at ${RENDER_SIZE}px, saving ${(result.savedBytes / 1024).toFixed(0)}KB`);
        for (const failure of result.failures) console.warn(`  could not re-encode ${failure}`);
      }
    } catch (error) {
      process.stdout.write('\n');
      console.warn(`Could not re-encode: ${error.message}`);
      console.warn('The icons this run fetched are still being saved. Re-run when Chrome is available, or pass --no-reencode to skip the step deliberately.');
    }
  }

  const ordered = Object.fromEntries(Object.keys(cache).sort().map(key => [key, cache[key]]));
  fs.writeFileSync(output, `${JSON.stringify(ordered, null, 2)}\n`);
  const covered = Object.values(ordered).filter(value => typeof value === 'string').length;
  // favicons.json holds 500-odd data URIs and not one date. The manifest is the
  // only record of when this ran and what came back.
  record('favicons', {
    file: 'favicons.json',
    command: 'npm run update:favicons',
    sources: ['google s2', 'duckduckgo ip3', 'the site\'s own <link rel="icon">', '/favicon.ico'],
    fetchedAt: new Date().toISOString(),
    entries: Object.keys(ordered).length,
    covered,
    failed: failed.length
  });
  console.log(`Cached ${updated} new favicons (${failed.length} without one, ${skipped} of those already known, ${pruned} stale removed); ${covered}/${domains.length} domains available`);
  if (failed.length) {
    console.log(`No icon found for: ${failed.join(', ')}`);
    console.log('Those entries render the site initial instead. The page makes no third-party request for them.');
    if (skipped && !retryMissing) console.log('Pass --retry-missing to ask again for the ones already recorded as having none.');
  }
  if (transient.length) {
    console.log(`Not recorded as missing, because the failure looked temporary: ${transient.join(', ')}. The next run will ask again.`);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
