'use strict';

// The link checker records what it saw. These tests gate the boundary between
// an observation and a decision, because that boundary is the whole reason the
// script is allowed to touch sites.json at all: linkStatus and lastCheckedAt say
// what happened, and nothing else in the entry may move.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { writeBack } = require('../scripts/check-links.js');

const ROOT = path.resolve(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'sites.json');
const SITES = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// writeBack writes the real sites.json, so every test that calls it restores the
// file afterwards no matter what. This file must not run beside another that
// writes the same file; npm test pins --test-concurrency=1 for that reason.
function withRestoredSites(run) {
  const original = fs.readFileSync(SITES_PATH, 'utf8');
  try {
    return run(JSON.parse(original));
  } finally {
    fs.writeFileSync(SITES_PATH, original);
  }
}

test('a check records its own status and date, and nothing else', () => {
  withRestoredSites(sites => {
    const before = JSON.parse(JSON.stringify(sites[0]));
    const results = [{ url: sites[0].url, status: 'moved' }];
    writeBack(sites, results, new Date('2026-01-02T03:04:05Z'));

    const after = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'))[0];
    assert.equal(after.linkStatus, 'moved');
    assert.equal(after.lastCheckedAt, '2026-01-02');

    // Everything a person wrote has to survive untouched. A checker that can
    // reword a description is a checker that will, eventually.
    for (const key of Object.keys(before)) {
      if (key === 'linkStatus' || key === 'lastCheckedAt') continue;
      assert.deepEqual(after[key], before[key], `${key} must not be touched by a link check`);
    }
  });
});

test('an entry the run did not check keeps whatever it already had', () => {
  withRestoredSites(sites => {
    const untouched = JSON.parse(JSON.stringify(sites[1]));
    writeBack(sites, [{ url: sites[0].url, status: 'ok' }], new Date('2026-01-02T00:00:00Z'));
    const after = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'))[1];
    assert.deepEqual(after, untouched, 'a filtered or limited run must not stamp entries it never asked about');
  });
});

test('a run whose result the lint rejects is rolled back', () => {
  withRestoredSites(sites => {
    const before = fs.readFileSync(SITES_PATH, 'utf8');
    // 'imaginary' is not in the linkStatus enum, so the lint has to refuse it.
    const kept = writeBack(sites, [{ url: sites[0].url, status: 'imaginary' }], new Date('2026-01-02T00:00:00Z'));
    assert.equal(kept, false, 'writeBack must report that it did not keep the write');
    assert.equal(fs.readFileSync(SITES_PATH, 'utf8'), before, 'sites.json must be exactly as it was');
    // process.exitCode is set by the rollback; clear it so the run still passes.
    process.exitCode = 0;
  });
});

test('every recorded status is one the schema allows', () => {
  const allowed = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/site.schema.json'), 'utf8')).properties.linkStatus.enum);
  for (const site of SITES) {
    if (!site.linkStatus) continue;
    assert.ok(allowed.has(site.linkStatus), `${site.name}: ${site.linkStatus}`);
  }
});

test('a checked entry says when, and an unchecked one claims nothing', () => {
  for (const site of SITES) {
    assert.equal(Boolean(site.linkStatus), Boolean(site.lastCheckedAt), `${site.name}: a status and a date have to travel together`);
  }
});

test('the page tells a bot wall apart from a broken link', () => {
  // "blocked" means the host refused the checker. Filing that under link issues
  // would put 23 working sites behind a warning, which is how good entries get
  // deleted by someone tidying up.
  assert.match(INDEX, /const HEALTHY_LINK_STATUSES = new Set\(\['ok', 'redirect', 'blocked'\]\);/);
  for (const status of ['ok', 'redirect', 'blocked', 'moved', 'dead', 'tls', 'dns', 'timeout', 'error']) {
    assert.match(INDEX, new RegExp(`^\\s*${status}:`, 'm'), `${status} needs a plain-English explanation in LINK_STATUS_TEXT`);
  }
});

test('the link-issues filter round-trips through the URL', () => {
  assert.match(INDEX, /if \(linkIssuesOnly\) p\.set\('linkissues', '1'\);/);
  assert.match(INDEX, /linkissues: p\.get\('linkissues'\) === '1'/);
  // Was a grep for the literal `linkIssuesOnly = false;` that the reset handler
  // used to contain. Resetting is now table-driven, so the assertion was
  // pinning a line rather than the behaviour: this checks the filter is in the
  // table every reset walks. The behaviour itself is covered in browser.test.js.
  assert.match(INDEX, /\['linkIssuesOnly', 'linkissues',/);
});

test('an entry the checker skips is not shown as broken', () => {
  // Krea.ai loads fine in a browser; Node rejects its response headers as
  // oversized. Flagging it would show a warning re-running can never clear,
  // because a skipped entry is never re-checked.
  assert.match(INDEX, /if \(site\.checkDisabled\) return false;/);
  assert.match(INDEX, /not auto-checked/);
  for (const site of SITES) {
    if (!site.checkDisabled) continue;
    assert.equal(site.linkStatus, undefined, `${site.name}: a skipped entry must not carry a status from before it was skipped`);
  }
});

test('an accepted redirect names where it goes', () => {
  // Muting an entry would inherit a pass for the next move too. Naming the
  // destination means the exemption expires the day the destination changes.
  for (const site of SITES) {
    if (!site.acceptedRedirect) continue;
    assert.doesNotThrow(() => new URL(site.acceptedRedirect), `${site.name}: acceptedRedirect must be a URL`);
    assert.notEqual(site.acceptedRedirect, site.url, `${site.name}: accepting the address it already has means nothing`);
  }
});

test('an archived project says so on its card', () => {
  // The author's own statement that they have stopped. It is the question this
  // audience asks first, and a star count answers the opposite one: how popular
  // something was, not whether anyone is still there.
  const stars = JSON.parse(fs.readFileSync(path.join(ROOT, 'stars.json'), 'utf8'));
  const records = Object.values(stars);
  assert.ok(records.length > 0, 'there should be star records to reason about');
  for (const record of records) {
    assert.equal(typeof record.archived, 'boolean', `${record.fullName}: archived has to be recorded, not inferred`);
    assert.match(record.pushedAt, /^\d{4}-\d{2}-\d{2}T/, `${record.fullName}: pushedAt has to be a timestamp`);
  }
  assert.ok(records.some(record => record.archived), 'the archived state should actually be in use');
  assert.match(INDEX, /starRecord\?\.archived/, 'the card has to read the flag');
  assert.match(INDEX, /class="archived-badge"/);
});
