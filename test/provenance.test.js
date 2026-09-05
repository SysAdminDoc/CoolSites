'use strict';

// Guards the rules lint enforces on sites.json. Mostly date provenance: the
// directory carries the date of a single bulk import, so the job is making sure
// nothing new can be filed under that date and quietly inherit its false
// chronology. Also the one-entry-per-project rule, which lives here because it
// needs the same run-lint-against-a-mutated-copy harness.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const { LEGACY_IMPORT_DATE, MAX_LEGACY_DATED, freshness, hasRealProvenance } = require('../scripts/lib/metadata');

const ROOT = path.resolve(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'sites.json');
const SITES = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));

// Runs the real lint against a temporarily modified sites.json and restores it
// no matter what. Anything less would leave the repository broken on a failure.
function lintWith(mutate) {
  const original = fs.readFileSync(SITES_PATH, 'utf8');
  try {
    const sites = JSON.parse(original);
    mutate(sites);
    fs.writeFileSync(SITES_PATH, `${JSON.stringify(sites, null, 2)}\n`);
    try {
      execFileSync(process.execPath, ['scripts/lint-data.js', '--source-only'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { passed: true, output: '' };
    } catch (error) {
      return { passed: false, output: (error.stdout || '') + (error.stderr || '') };
    }
  } finally {
    fs.writeFileSync(SITES_PATH, original);
  }
}

test('the legacy import date is a known quantity, not a per-entry review', () => {
  const legacy = SITES.filter(site => site.updatedAt === LEGACY_IMPORT_DATE);
  assert.ok(legacy.length > 0, 'the import date should still be recognisable in the data');
  assert.ok(legacy.length <= MAX_LEGACY_DATED,
    `${legacy.length} entries carry the import date, over the ceiling of ${MAX_LEGACY_DATED}`);
  // None of them may claim a review, because none of them had one.
  const claiming = legacy.filter(hasRealProvenance);
  assert.deepEqual(claiming.map(site => site.name), [],
    'an entry cannot be reviewed and still carry the untouched import date');
});

test('every entry that is not left over from the import says who checked it', () => {
  const missing = SITES
    .filter(site => site.updatedAt !== LEGACY_IMPORT_DATE && !hasRealProvenance(site))
    .map(site => site.name);
  assert.deepEqual(missing, [], 'a date without a review behind it is not provenance');
});

test('no entry is dated in the future or reviewed before it changed', () => {
  const today = new Date().toISOString().slice(0, 10);
  const problems = [];
  for (const site of SITES) {
    if (site.updatedAt > today) problems.push(`${site.name}: updatedAt ${site.updatedAt}`);
    if (site.lastReviewedAt && site.lastReviewedAt > today) problems.push(`${site.name}: lastReviewedAt ${site.lastReviewedAt}`);
    if (site.lastReviewedAt && site.lastReviewedAt < site.updatedAt) {
      problems.push(`${site.name}: reviewed ${site.lastReviewedAt} before updatedAt ${site.updatedAt}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the recent order is chronological where there is real chronology', () => {
  const reviewed = SITES.filter(hasRealProvenance)
    .sort((a, b) => freshness(b).localeCompare(freshness(a)) || a.name.localeCompare(b.name));
  assert.ok(reviewed.length > 0, 'something has to have been reviewed for the sort to mean anything');
  for (let i = 1; i < reviewed.length; i++) {
    assert.ok(freshness(reviewed[i - 1]) >= freshness(reviewed[i]), 'reviewed entries must order by date');
  }
});

test('the feeds carry only entries with real provenance', () => {
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'feeds/recent.json'), 'utf8'));
  const reviewed = new Set(SITES.filter(hasRealProvenance).map(site => site.url));
  assert.ok(feed.items.length > 0, 'the feed should not be empty');
  const unreviewed = feed.items.filter(item => !reviewed.has(item.id)).map(item => item.title);
  assert.deepEqual(unreviewed, [], 'publishing import-dated entries as recent is the bug this replaced');

  // And no two items may share a timestamp by accident of the import date.
  const stamps = feed.items.map(item => item.date_modified);
  assert.equal(stamps.filter(stamp => stamp.startsWith(LEGACY_IMPORT_DATE)).length, 0,
    'nothing in the feed may be stamped with the bulk import date');
});

test('lint rejects a new entry filed under the import date', () => {
  // The ratchet. Without it, anything could dodge the provenance rule by
  // claiming to be as old as the import.
  const result = lintWith(sites => {
    sites.push({
      ...sites.find(site => site.updatedAt === LEGACY_IMPORT_DATE),
      name: 'Provenance Probe',
      url: 'https://provenance-probe.invalid/'
    });
  });
  assert.equal(result.passed, false, 'a new import-dated entry must not pass lint');
  assert.match(result.output, /import date|ceiling/i);
});

test('lint rejects a dated entry with no review behind it', () => {
  const result = lintWith(sites => {
    const target = sites.find(site => site.updatedAt === LEGACY_IMPORT_DATE);
    target.updatedAt = '2026-08-20';
  });
  assert.equal(result.passed, false, 'a moved date with no lastReviewedAt must not pass lint');
  assert.match(result.output, /lastReviewedAt/);
});

test('lint rejects a review dated before the change it reviewed', () => {
  const result = lintWith(sites => {
    const target = sites.find(hasRealProvenance);
    target.lastReviewedAt = '2026-01-01';
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /before updatedAt/);
});

test('lint rejects a date in the future', () => {
  const result = lintWith(sites => {
    sites[0].updatedAt = '2099-01-01';
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /future/);
});

test('a project gets one entry', () => {
  // Two projects used to be listed twice, once by homepage and once by
  // repository. That inflated the count and showed the same tool twice in
  // search, staff picks and the unfiltered view.
  const addresses = new Map();
  const clashes = [];
  for (const site of SITES) {
    for (const [field, value] of [['url', site.url], ['repository', site.repository]]) {
      if (!value) continue;
      const key = value.replace(/\/+$/, '').toLowerCase();
      const previous = addresses.get(key);
      if (previous && previous.name !== site.name) clashes.push(`${site.name}.${field} == ${previous.name}.${previous.field}`);
      if (!previous) addresses.set(key, { name: site.name, field });
    }
  }
  assert.deepEqual(clashes, []);
});

test('lint rejects a second entry for a project already listed', () => {
  const result = lintWith(sites => {
    const withRepo = sites.find(site => site.repository);
    sites.push({
      name: 'Duplicate Probe',
      url: withRepo.repository,
      description: 'A second entry pointing at an existing project.',
      category: withRepo.category,
      openSource: true,
      requiresAuth: false,
      updatedAt: '2026-08-25',
      lastReviewedAt: '2026-08-25',
      tags: ['probe']
    });
  });
  assert.equal(result.passed, false, 'listing a project twice must not pass lint');
  assert.match(result.output, /already listed by/);
});

test('lint rejects a repository that just repeats the url', () => {
  const result = lintWith(sites => { sites[0].repository = sites[0].url; });
  assert.equal(result.passed, false);
  assert.match(result.output, /same address as url/);
});

test('the guard restores sites.json even when lint fails', () => {
  // Every test above rewrites the real file. If the restore ever slipped, the
  // repository would be left broken by a test run.
  const onDisk = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));
  assert.equal(onDisk.length, SITES.length);
  assert.equal(onDisk[0].url, SITES[0].url);
  assert.equal(JSON.stringify(onDisk), JSON.stringify(SITES), 'sites.json must be byte-identical after the lint probes');
});
