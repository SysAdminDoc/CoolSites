'use strict';

// Reading link tags out of arbitrary HTML with a regex is the kind of code that
// quietly matches nothing and reports "this page declares no icon" for the whole
// web. It did exactly that once already, so it is tested against markup that is
// messy in the ways real pages are.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { iconLinksFromHtml, looksLikeImage, domainFromUrl } = require('../scripts/generate-favicon-cache.js');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://example.test/project/';

test('it finds the icon however the page spells it', () => {
  const cases = [
    ['<link rel="shortcut icon" href="/favicon.ico">', 'https://example.test/favicon.ico'],
    ['<link rel="icon" href="icon.png">', 'https://example.test/project/icon.png'],
    ['<link rel=icon href=bare.png>', 'https://example.test/project/bare.png'],
    ["<link rel='apple-touch-icon' href='/touch.png'>", 'https://example.test/touch.png'],
    ['<link rel="mask-icon" href="/m.svg" color="#000">', 'https://example.test/m.svg'],
    ['<LINK REL="ICON" HREF="/UP.ico">', 'https://example.test/UP.ico'],
    // Attribute order is not guaranteed by anything.
    ['<link href="/first.ico" rel="icon">', 'https://example.test/first.ico'],
    // Protocol-relative, which plenty of older pages still use.
    ['<link rel="icon" href="//cdn.test/i.png">', 'https://cdn.test/i.png'],
    // Line breaks inside the tag.
    ['<link\n  rel="icon"\n  href="/wrapped.png">', 'https://example.test/wrapped.png']
  ];
  for (const [html, expected] of cases) {
    assert.deepEqual(iconLinksFromHtml(html, BASE), [expected], `failed on: ${html.replace(/\n/g, ' ')}`);
  }
});

test('it ignores links that are not icons', () => {
  const html = `
    <link rel="stylesheet" href="/s.css">
    <link rel="preload" href="/f.woff2" as="font">
    <link rel="canonical" href="https://example.test/">
    <link rel="iconography" href="/not-an-icon.png">
    <link rel="alternate" type="application/atom+xml" href="/feed.atom">
  `;
  assert.deepEqual(iconLinksFromHtml(html, BASE), [],
    'a rel that merely contains the word icon is not an icon');
});

test('it survives markup that is missing pieces', () => {
  assert.deepEqual(iconLinksFromHtml('<link rel="icon">', BASE), [], 'no href, nothing to fetch');
  assert.deepEqual(iconLinksFromHtml('<link href="/x.ico">', BASE), [], 'no rel, not an icon');
  assert.deepEqual(iconLinksFromHtml('<link rel="icon" href="">', BASE), [], 'an empty href is not a URL');
  assert.deepEqual(iconLinksFromHtml('<link rel="icon" href="http://[">', BASE), [],
    'an unparseable href is skipped rather than thrown');
  assert.deepEqual(iconLinksFromHtml('', BASE), []);
  assert.deepEqual(iconLinksFromHtml('<p>no links here at all</p>', BASE), []);
});

test('it deduplicates and stays bounded', () => {
  // Sites commonly declare the same icon at eight sizes. That must not become
  // eight requests.
  const many = Array.from({ length: 20 }, (_, i) => `<link rel="icon" sizes="${i}x${i}" href="/i${i}.png">`).join('\n');
  const links = iconLinksFromHtml(many, BASE);
  assert.ok(links.length > 0, 'it should still find some');
  assert.ok(links.length <= 6, `expected at most 6 candidates, got ${links.length}`);

  const repeated = Array.from({ length: 5 }, () => '<link rel="icon" href="/same.ico">').join('\n');
  assert.deepEqual(iconLinksFromHtml(repeated, BASE), ['https://example.test/same.ico']);
});

test('it takes rel lists as they come', () => {
  // "shortcut icon" is two tokens, and some pages add more.
  assert.deepEqual(iconLinksFromHtml('<link rel="icon shortcut" href="/a.ico">', BASE), ['https://example.test/a.ico']);
  assert.deepEqual(iconLinksFromHtml('<link rel="  icon  " href="/b.ico">', BASE), ['https://example.test/b.ico']);
});

test('the cached icons are all really images', () => {
  // The magic-byte check is what caught a macOS alias file being served as
  // image/x-icon. Every entry that ships to the browser goes through it.
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'favicons.json'), 'utf8'));
  const entries = Object.entries(cache);
  assert.ok(entries.length > 100, 'the cache should not be nearly empty');
  const bad = entries.filter(([, uri]) => {
    // false records a domain checked and found to have no icon anywhere.
    if (uri === false) return false;
    if (typeof uri !== 'string' || !uri.startsWith('data:image/')) return true;
    const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
    return !looksLikeImage(bytes);
  }).map(([domain]) => domain);
  assert.deepEqual(bad, [], 'every cached favicon must be an image by its bytes, not just its label');
});

test('the cache holds no icon for a domain that left the directory', () => {
  const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));
  const live = new Set(sites.map(site => domainFromUrl(site.url)).filter(Boolean));
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'favicons.json'), 'utf8'));
  const orphans = Object.keys(cache).filter(domain => !live.has(domain));
  assert.deepEqual(orphans, [], 'an icon for a delisted domain is payload every visitor downloads for nothing');
});

test('no single icon is fat enough to matter on its own', () => {
  // Four icons were 21% of this file before they were re-encoded: a 58KB
  // multi-resolution .ico, a 46KB PNG, a 43KB .ico and a 20KB .ico. Nothing in
  // the fetch path stopped them, because the size only shows up in aggregate.
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'favicons.json'), 'utf8'));
  const fat = Object.entries(cache)
    .filter(([, value]) => typeof value === 'string' && value.length > 8 * 1024 && !value.startsWith('data:image/svg+xml'))
    .map(([domain, value]) => `${domain} ${(value.length / 1024).toFixed(1)}KB`);
  assert.deepEqual(fat, [], 'run npm run update:favicons to re-encode these at 32px');
});

test('the whole cache stays inside its download budget', () => {
  // Not a style rule. favicons.json is fetched in full on every visit, so this
  // number is the largest single thing a reader waits for.
  const bytes = fs.readFileSync(path.join(ROOT, 'favicons.json'), 'utf8').length;
  assert.ok(bytes <= 700 * 1024, `favicons.json is ${(bytes / 1024).toFixed(0)}KB, over the 700KB budget`);
});

test('a domain with no icon anywhere is recorded, not just skipped', () => {
  // Thirteen domains have no icon and never will: putty.org serves no link tags
  // at all, retroarch.com has seven and none is an icon. Recording only
  // successes meant every refresh re-attempted all thirteen and paid four
  // requests each to learn what the previous run already knew.
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'favicons.json'), 'utf8'));
  const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));
  const domains = new Set(sites.map(site => domainFromUrl(site.url)).filter(Boolean));

  const unrecorded = [...domains].filter(domain => !(domain in cache));
  assert.deepEqual(unrecorded, [], 'every listed domain should be either an icon or a recorded absence');

  const values = Object.values(cache);
  assert.ok(values.some(value => value === false), 'the absence state should actually be in use');
  for (const [domain, value] of Object.entries(cache)) {
    assert.ok(value === false || typeof value === 'string', `${domain}: an entry is a data URI or false, nothing else`);
  }
});

test('a temporary failure is not recorded as having no icon', () => {
  // false means "checked, none exists". A timeout, a rate limit or a server
  // error is a fact about this minute, not about the site, and recording one as
  // an absence freezes the domain at the fallback initial until somebody
  // remembers to pass --retry-missing.
  const { isTransient } = require('../scripts/generate-favicon-cache.js');
  for (const failure of [
    'icons.duckduckgo.com: HTTP 429',
    'host: timed out',
    'x: HTTP 503',
    'y: HTTP 500',
    'z: ETIMEDOUT',
    'w: UND_ERR_CONNECT_TIMEOUT'
  ]) {
    assert.equal(isTransient(failure), true, `${failure} should not be recorded as a permanent absence`);
  }
  for (const failure of [
    'www.google.com: HTTP 404',
    'page: page declares no icon',
    'z: HTTP 403',
    'q: payload is not an image (starts 626f6f6b)',
    'w: unsupported content type text/html'
  ]) {
    assert.equal(isTransient(failure), false, `${failure} is a fact about the site, so it should be recorded`);
  }
});
