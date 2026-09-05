'use strict';

// The pages render their cards from JSON at runtime, so a crawler reading the
// HTML sees the shell, the noscript notice and nothing else. This block is the
// only machine-readable statement of what the site holds.
//
// It used to be a WebSite with a SearchAction, which existed to drive Google's
// sitelinks search box. Google retired that on 2024-11-21, so for most of a year
// the only structured data here described a feature that no longer existed.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://sysadmindoc.github.io/CoolSites/';

function structuredData(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
  assert.equal(blocks.length, 1, `${page} should carry exactly one structured-data block`);
  return JSON.parse(blocks[0][1]);
}

test('the directory describes itself as a collection of its categories', () => {
  const data = structuredData('index.html');
  const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'categories.json'), 'utf8'));

  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'CollectionPage');
  assert.equal(data.url, SITE);
  assert.equal(data.mainEntity['@type'], 'ItemList');
  assert.equal(data.mainEntity.numberOfItems, categories.length);
  assert.equal(data.mainEntity.itemListElement.length, categories.length);

  const names = data.mainEntity.itemListElement.map(item => item.name);
  assert.deepEqual(names.sort(), categories.map(category => category.name).sort(),
    'the listed categories have to be the ones categories.json holds');
});

test('every listed item points at a page this site actually serves', () => {
  // A ListItem is a claim that a page exists at that address. The filtered views
  // are real; the 586 entries belong to other people and this site publishes no
  // page for any of them, which is why they are not listed here.
  const data = structuredData('index.html');
  for (const [index, item] of data.mainEntity.itemListElement.entries()) {
    assert.equal(item['@type'], 'ListItem');
    assert.equal(item.position, index + 1, 'positions have to be 1-based and in order');
    assert.ok(item.url.startsWith(`${SITE}?cat=`), `${item.name} points somewhere this site does not serve: ${item.url}`);
    // Round-trips back to the category name, so an unencoded ampersand or space
    // cannot produce a link that silently filters nothing.
    const category = new URL(item.url).searchParams.get('cat');
    assert.equal(category, item.name, `${item.url} does not decode back to ${item.name}`);
  }
});

test('the retired SearchAction is gone', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(raw, /SearchAction/, 'Google retired the sitelinks search box on 2024-11-21');
});

test('collections describes its collections and claims no page for them', () => {
  const data = structuredData('collections.html');
  const collections = JSON.parse(fs.readFileSync(path.join(ROOT, 'collections.json'), 'utf8'));

  assert.equal(data['@type'], 'CollectionPage');
  assert.equal(data.mainEntity.numberOfItems, collections.length);
  assert.deepEqual(
    data.mainEntity.itemListElement.map(item => item.name).sort(),
    collections.map(collection => collection.name).sort()
  );
  for (const item of data.mainEntity.itemListElement) {
    // The page has no address for an individual collection. Inventing one would
    // point a crawler at something that does not load.
    assert.equal('url' in item, false, `${item.name} claims a URL the site does not serve`);
  }
});

test('nothing in the payload can break out of the script block', () => {
  // A </script> inside a JSON string ends the block early and spills the rest of
  // the payload into the document as markup. The generator escapes < for that
  // reason; this checks the escaping survived, on the rendered output rather
  // than by re-running the escaper.
  for (const page of ['index.html', 'collections.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const block = /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(html)[1];
    assert.doesNotMatch(block, /</, `${page}: a raw < in the payload can end the block early`);
  }
});
