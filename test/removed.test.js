'use strict';

// A removal has to leave something behind. Kagi's small-web list documents the
// failure plainly in its own tracker: sites they had removed kept coming back,
// proposed in good faith by people with no way to know the decision had already
// been made or why. Deleting a row from sites.json records nothing except in a
// commit message nobody reads before opening a pull request.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'sites.json');
const REMOVED_PATH = path.join(ROOT, 'removed.json');

// Restores both files whatever happens. npm test pins --test-concurrency=1
// because this and two other files write the same sites.json.
function lintWith(mutate) {
  const originalSites = fs.readFileSync(SITES_PATH, 'utf8');
  const originalRemoved = fs.readFileSync(REMOVED_PATH, 'utf8');
  try {
    const sites = JSON.parse(originalSites);
    const removed = JSON.parse(originalRemoved);
    mutate(sites, removed);
    fs.writeFileSync(SITES_PATH, `${JSON.stringify(sites, null, 2)}\n`);
    fs.writeFileSync(REMOVED_PATH, `${JSON.stringify(removed, null, 2)}\n`);
    try {
      execFileSync(process.execPath, ['scripts/lint-data.js', '--source-only'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { passed: true, output: '' };
    } catch (error) {
      return { passed: false, output: (error.stdout || '') + (error.stderr || '') };
    }
  } finally {
    fs.writeFileSync(SITES_PATH, originalSites);
    fs.writeFileSync(REMOVED_PATH, originalRemoved);
  }
}

const TOMBSTONE = { url: 'https://example.invalid/gone', name: 'Gone', removedAt: '2026-01-01', reason: 'The project was archived and the site stopped resolving.' };

test('an entry that was removed on purpose cannot be added back', () => {
  const result = lintWith((sites, removed) => {
    removed.push(TOMBSTONE);
    sites.push({ ...sites[0], name: 'Gone', url: TOMBSTONE.url, tags: [], keywords: ['probe'] });
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /was removed on purpose/);
});

test('a trailing slash does not walk a removed entry back in', () => {
  // The duplicate-URL rule already canonicalises. A tombstone that only matched
  // the exact string would be trivially defeated by a slash nobody noticed.
  const result = lintWith((sites, removed) => {
    removed.push(TOMBSTONE);
    sites.push({ ...sites[0], name: 'Gone', url: `${TOMBSTONE.url}/`, tags: [], keywords: ['probe'] });
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /was removed on purpose/);
});

test('a removal has to say why', () => {
  const result = lintWith((sites, removed) => {
    const { reason, ...withoutReason } = TOMBSTONE;
    removed.push(withoutReason);
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /missing required reason/);
});

test('the same address cannot be recorded as removed twice', () => {
  const result = lintWith((sites, removed) => { removed.push(TOMBSTONE, { ...TOMBSTONE }); });
  assert.equal(result.passed, false);
  assert.match(result.output, /already recorded as removed/);
});

test('a tombstone on its own is not an error', () => {
  // Removing the entry and recording why is the whole intended workflow, so it
  // has to be the case that passes.
  const result = lintWith((sites, removed) => { removed.push(TOMBSTONE); });
  assert.equal(result.passed, true, result.output);
});

test('deleting the record is how a decision gets reversed', () => {
  // No "retired" flag: a tombstone that can be switched off is a second state
  // to reason about, and git records the deletion either way.
  //
  // An existing entry's URL is moved rather than a new one added, because
  // adding one trips the legacy-date ratchet and this test is about the
  // tombstone, not about provenance.
  const result = lintWith(sites => { sites[1].url = TOMBSTONE.url; });
  assert.equal(result.passed, true, result.output);
});

test('the guard restores both files even when lint fails', () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(SITES_PATH, 'utf8')));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(REMOVED_PATH, 'utf8')));
});

// Every shape below walked past the first version of the tombstone check, which
// reused the duplicate-URL comparison. That one exists to decide whether two
// entries are the same listing, where http and https really are different
// addresses. This one decides whether somebody is re-adding a site that was
// removed on purpose, and none of these is a different site.
for (const [shape, url] of [
  ['a protocol swap', 'http://example.invalid/gone'],
  ['a www prefix', 'https://www.example.invalid/gone'],
  ['a tracking parameter', 'https://example.invalid/gone?ref=newsletter'],
  ['a fragment', 'https://example.invalid/gone#top'],
  ['an uppercase host', 'https://EXAMPLE.invalid/gone']
]) {
  test(`${shape} does not walk a removed entry back in`, () => {
    const result = lintWith((sites, removed) => {
      removed.push(TOMBSTONE);
      sites[1].url = url;
    });
    assert.equal(result.passed, false, `${url} was accepted`);
    assert.match(result.output, /was removed on purpose/);
  });
}

test('a removed project cannot come back through the repository field', () => {
  // repository is a link the entry publishes too, and it drives the star badge,
  // so a removed project could otherwise be reattached to a new front door and
  // have its stars shown again.
  const result = lintWith((sites, removed) => {
    removed.push(TOMBSTONE);
    sites[1].repository = TOMBSTONE.url;
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /repository .* was removed on purpose/);
});
