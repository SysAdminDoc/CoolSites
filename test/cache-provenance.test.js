'use strict';

// stars.json and favicons.json are the two files here that are copies of
// somebody else's data. A copy with no date on it is indistinguishable from a
// fresh one, and a star count is exactly the kind of number that looks current
// whatever its age. These gate the record that says otherwise.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'cache-manifest.json');
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Restores the manifest whatever happens. npm test pins --test-concurrency=1
// because this and three other files write repository data files.
function lintWith(mutate) {
  const original = fs.readFileSync(MANIFEST_PATH, 'utf8');
  try {
    const manifest = JSON.parse(original);
    mutate(manifest);
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      execFileSync(process.execPath, ['scripts/lint-data.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { passed: true, output: '' };
    } catch (error) {
      return { passed: false, output: (error.stdout || '') + (error.stderr || '') };
    }
  } finally {
    fs.writeFileSync(MANIFEST_PATH, original);
  }
}

test('every cache says where it came from, when, and what it hashed to', () => {
  for (const key of ['stars', 'favicons']) {
    const entry = MANIFEST[key];
    assert.ok(entry, `${key} needs a manifest record`);
    assert.match(entry.fetchedAt, /^\d{4}-\d{2}-\d{2}T/, `${key}.fetchedAt has to be an ISO timestamp`);
    assert.ok(Array.isArray(entry.sources) && entry.sources.length, `${key} has to name its sources`);
    assert.match(entry.command, /^npm run /, `${key} has to name the command that refreshes it`);
    assert.equal(typeof entry.failed, 'number', `${key} has to record how many fetches failed`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, entry.file))).digest('hex');
    assert.equal(entry.sha256, digest, `${key}.sha256 does not match ${entry.file}`);
  }
});

test('a star refresh records whether it was authenticated', () => {
  // Unauthenticated, update:stars stops at the first 403 and writes a partial
  // refresh carrying today's date. Without this field the two are identical.
  assert.equal(typeof MANIFEST.stars.authenticated, 'boolean');
});

test('editing a cache without refreshing it is caught', () => {
  // The whole reason the hash is there. A manifest that recorded only a date
  // would still say "fetched today" after a hand edit.
  const result = lintWith(manifest => { manifest.stars.sha256 = 'a'.repeat(64); });
  assert.equal(result.passed, false);
  assert.match(result.output, /sha256 does not match stars\.json/);
});

test('a count that no longer matches the file is caught', () => {
  const result = lintWith(manifest => { manifest.favicons.entries += 1; });
  assert.equal(result.passed, false);
  assert.match(result.output, /entries says \d+, favicons\.json holds \d+/);
});

test('a cache with no record at all is caught', () => {
  const result = lintWith(manifest => { delete manifest.stars; });
  assert.equal(result.passed, false);
  assert.match(result.output, /no record for stars\.json/);
});

test('a record with no source is caught', () => {
  const result = lintWith(manifest => { manifest.stars.sources = []; });
  assert.equal(result.passed, false);
  assert.match(result.output, /sources has to say where the data came from/);
});

test('the current manifest passes', () => {
  const result = lintWith(() => {});
  assert.equal(result.passed, true, result.output);
});

test('the page hides a star count it cannot stand behind', () => {
  assert.match(INDEX, /const CACHE_MAX_AGE_DAYS = 90;/);
  assert.match(INDEX, /function starsAreStale\(\) \{[\s\S]*?age === null \|\| age > CACHE_MAX_AGE_DAYS;/,
    'a cache nobody can date is as stale as one that is too old');
  assert.match(INDEX, /function getStarRecord\(site\) \{\s*\n\s*if \(starsAreStale\(\)\) return null;/,
    'suppression has to happen at the one place every badge reads');
  assert.match(INDEX, /past the \$\{CACHE_MAX_AGE_DAYS\}-day limit, so counts are hidden/,
    'diagnostics has to say why the counts are gone');
});

test('the browser never asks GitHub for a star count', () => {
  // The counts exist as a file precisely so the page makes no third-party
  // request. A fetch to api.github.com would undo the whole arrangement.
  assert.doesNotMatch(INDEX, /api\.github\.com/);
  assert.match(INDEX, /cacheManifest: '\.\/cache-manifest\.json'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'\.\/cache-manifest\.json'/,
    'the manifest has to be precached, or an offline page reads no date and hides every count');
});
