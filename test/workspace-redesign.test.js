'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const directory = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const collections = fs.readFileSync(path.join(ROOT, 'collections.html'), 'utf8');

test('directory keeps browse controls in the desktop workspace rail', () => {
  assert.match(directory, /--workspace-rail:\s*328px/);
  assert.match(directory, /aria-label="Primary navigation"/);
  assert.match(directory, /class="rail-categories-toggle"/);
  assert.match(directory, /class="metadata-filters"/);
  assert.match(directory, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(directory, /savedDockState === null && window\.matchMedia\('\(max-width: 900px\)'\)\.matches/);
});

test('collections exposes a selectable focused collection workspace', () => {
  assert.match(collections, /--rail:328px/);
  assert.match(collections, /aria-label="Collection navigation"/);
  assert.match(collections, /id="collectionSearch"/);
  assert.match(collections, /class="featured-sites"/);
  assert.match(collections, /id="moreCollections"/);
  assert.match(collections, /function selectCollection\(index, moveFocus\)/);
});
