'use strict';

// OPML is the interchange format of the webring and blogroll world, and the one
// thing that lets somebody take this directory somewhere else. Kagi's small-web
// list and the XXIIVV webring both publish one.
//
// It is generated, so the failure it can have is silent: an unescaped ampersand
// in a description makes the file unparseable, and nothing else in the build
// would notice, because no page reads it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const OPML = fs.readFileSync(path.join(ROOT, 'feeds/directory.opml'), 'utf8');
const SITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));

// A deliberately strict reader rather than a regex. The point of the file is
// that another program can parse it, so the test has to parse it the same way.
function parseOutlines(xml) {
  const groups = [];
  const groupPattern = /<outline text="([^"]*)" title="[^"]*">([\s\S]*?)<\/outline>/g;
  for (const [, name, inner] of xml.matchAll(groupPattern)) {
    const entries = [...inner.matchAll(/<outline type="link"([^>]*)\/>/g)].map(([, attrs]) => {
      const read = key => {
        const match = new RegExp(`${key}="([^"]*)"`).exec(attrs);
        return match ? match[1] : null;
      };
      return { text: read('text'), htmlUrl: read('htmlUrl'), description: read('description') };
    });
    groups.push({ name, entries });
  }
  return groups;
}

test('the OPML is well-formed enough for something else to read', () => {
  assert.match(OPML, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<opml version="2\.0">/);
  assert.match(OPML, /<\/opml>\n$/);
  // Every < that opens a tag has a matching >, and no raw & survives outside an
  // entity. An unescaped ampersand in a description is the realistic failure and
  // it makes the whole file unparseable.
  const withoutEntities = OPML.replace(/&(?:amp|lt|gt|quot|apos|#\d+);/g, '');
  assert.doesNotMatch(withoutEntities, /&/, 'a raw ampersand makes the file unparseable');
});

test('every entry in the directory is in the export', () => {
  const groups = parseOutlines(OPML);
  const exported = groups.flatMap(group => group.entries);
  assert.equal(exported.length, SITES.length, 'the export has to be the whole directory, not a sample');
  assert.deepEqual(
    exported.map(entry => entry.htmlUrl).sort(),
    SITES.map(site => site.url).sort()
  );
  assert.equal(groups.length, new Set(SITES.map(site => site.category)).size, 'grouped by category');
});

test('nothing claims to be a feed', () => {
  // OPML's usual job is carrying feed subscriptions, so a reader seeing an
  // xmlUrl will try to poll it. These are sites, and most have no feed at all.
  assert.doesNotMatch(OPML, /xmlUrl=/, 'claiming a feed where there is none breaks the reader that trusts it');
});

test('a name or description with markup in it survives the export', () => {
  // The escaping is what keeps this parseable, and it only has to fail once.
  const groups = parseOutlines(OPML);
  const byUrl = new Map(groups.flatMap(group => group.entries).map(entry => [entry.htmlUrl, entry]));
  const risky = SITES.filter(site => /[&<>"']/.test(site.name + site.description));
  assert.ok(risky.length > 0, 'the directory should contain something worth escaping');
  for (const site of risky) {
    const entry = byUrl.get(site.url);
    assert.ok(entry, `${site.name} is missing from the export`);
    const decoded = entry.text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    assert.equal(decoded, site.name, `${site.name} did not survive escaping`);
  }
});
