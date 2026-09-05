'use strict';

// tags.json is the facet vocabulary; keywords is the descriptive tail.
//
// The split exists because 586 entries had grown 836 distinct tags, 639 of them
// shared by fewer than three sites, with four terms spelled two ways at once
// ("open source" and "open-source" among them). A facet list of that shape is
// not a browsing structure, it is a second description. But the tail is still
// what people search for, so none of it was deleted: it moved to keywords,
// which search reads at the same weight and no facet ever will.
//
// These tests gate the rules that keep it that way, against the real lint.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'sites.json');
const TAGS_PATH = path.join(ROOT, 'tags.json');
const SITES = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));
const TAGS = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));

const TAG_FLOOR = 3;

// Runs the real lint against temporarily modified data and restores both files
// no matter what, including when an assertion throws.
function lintWith(mutate) {
  const originalSites = fs.readFileSync(SITES_PATH, 'utf8');
  const originalTags = fs.readFileSync(TAGS_PATH, 'utf8');
  try {
    const sites = JSON.parse(originalSites);
    const tags = JSON.parse(originalTags);
    mutate(sites, tags);
    fs.writeFileSync(SITES_PATH, `${JSON.stringify(sites, null, 2)}\n`);
    fs.writeFileSync(TAGS_PATH, `${JSON.stringify(tags, null, 2)}\n`);
    try {
      execFileSync(process.execPath, ['scripts/lint-data.js', '--source-only'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { passed: true, output: '' };
    } catch (error) {
      return { passed: false, output: (error.stdout || '') + (error.stderr || '') };
    }
  } finally {
    fs.writeFileSync(SITES_PATH, originalSites);
    fs.writeFileSync(TAGS_PATH, originalTags);
  }
}

test('every tag in the vocabulary is shared by enough entries to be a facet', () => {
  const used = new Map();
  for (const site of SITES) {
    for (const tag of site.tags) used.set(tag, (used.get(tag) || 0) + 1);
  }
  const thin = TAGS.filter(tag => (used.get(tag) || 0) < TAG_FLOOR);
  assert.deepEqual(thin, [], 'these belong in keywords, not tags.json');
});

test('no tag is spelled two ways', () => {
  const byShape = new Map();
  for (const tag of TAGS) {
    const shape = tag.toLowerCase().replace(/[-_ ]/g, '');
    assert.equal(byShape.has(shape), false, `${byShape.get(shape)} and ${tag} are the same tag`);
    byShape.set(shape, tag);
  }
});

test('nothing is both a facet and a keyword', () => {
  const vocabulary = new Set(TAGS);
  for (const site of SITES) {
    for (const word of site.keywords || []) {
      assert.equal(vocabulary.has(word), false, `${site.name}: ${word} is in tags.json, so it belongs in tags`);
      assert.equal(site.tags.includes(word), false, `${site.name}: ${word} is both a tag and a keyword`);
    }
  }
});

test('the descriptive tail was moved, not deleted', () => {
  // The migration split 1892 tag applications across two fields. If a later
  // edit quietly drops keywords instead of promoting them, the entries that
  // depend on them for search go quiet with nothing to show for it.
  const withoutFacets = SITES.filter(site => site.tags.length === 0);
  for (const site of withoutFacets) {
    assert.ok((site.keywords || []).length > 0, `${site.name} has neither a tag nor a keyword, so only its name and description are searchable`);
  }
});

test('lint rejects a tag that is not in the vocabulary', () => {
  const result = lintWith(sites => { sites[0].tags = [...sites[0].tags, 'a-tag-nobody-agreed-to']; });
  assert.equal(result.passed, false);
  assert.match(result.output, /is not in tags\.json/);
});

test('lint rejects a vocabulary tag too few entries share', () => {
  const result = lintWith((sites, tags) => { tags.push('zzz-unused-facet'); tags.sort(); });
  assert.equal(result.passed, false);
  assert.match(result.output, /fewer than the 3 a facet needs/);
});

test('lint rejects the same tag spelled two ways', () => {
  const result = lintWith((sites, tags) => {
    // "self-hosted" is in the vocabulary; "self hosted" is the mistake that put
    // four terms in twice before.
    tags.push('self hosted');
    tags.sort();
    for (const site of sites.slice(0, 3)) site.tags = [...new Set([...site.tags, 'self hosted'])];
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /the same tag spelled two ways/);
});

test('lint rejects a keyword that duplicates a facet', () => {
  const result = lintWith(sites => {
    const site = sites.find(entry => entry.tags.length > 0);
    site.keywords = [...(site.keywords || []), site.tags[0]];
  });
  assert.equal(result.passed, false);
  assert.match(result.output, /is both a tag and a keyword|belongs in tags/);
});

test('lint rejects an unsorted vocabulary', () => {
  const result = lintWith((sites, tags) => { tags.reverse(); });
  assert.equal(result.passed, false);
  assert.match(result.output, /must be sorted/);
});

test('the guard restores both files even when lint fails', () => {
  assert.equal(fs.readFileSync(SITES_PATH, 'utf8'), `${JSON.stringify(SITES, null, 2)}\n`);
  assert.equal(fs.readFileSync(TAGS_PATH, 'utf8'), `${JSON.stringify(TAGS, null, 2)}\n`);
});
