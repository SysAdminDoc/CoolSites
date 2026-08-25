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

  throw new Error(`${domain} (${failures.join('; ')})`);
}

// Exported for the tests. Reading link tags out of arbitrary HTML with a regex
// is the kind of thing that quietly matches nothing, so it gets exercised
// against awkward markup rather than trusted.
module.exports = { iconLinksFromHtml, looksLikeImage, domainFromUrl };

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

  for (const domain of domains) {
    if (cache[domain]) continue;
    try {
      cache[domain] = await fetchFavicon(domain, pageForDomain.get(domain));
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
