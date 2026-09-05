'use strict';

// Where each cached file came from, when, and what it hashed to. The caches
// themselves say nothing about their own provenance: favicons.json is 500-odd
// data URIs with no dates on them at all, and stars.json carries a fetch time
// per record with nothing to say whether the run that wrote them finished or
// died halfway through a rate limit. A reader looking at a five-month-old star
// count has no way to know that is what they are looking at, and neither does
// the page.
//
// The hash is the part that makes this worth having. A manifest that only
// recorded a date would still say "fetched today" after somebody hand-edited
// the file, so the lint compares the hash and fails when the two disagree.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_FILE = 'cache-manifest.json';
const MANIFEST_PATH = path.join(ROOT, MANIFEST_FILE);

// Past this, the page stops showing a cached star count rather than showing one
// it cannot stand behind. A quarter is long enough that a refresh is a habit
// rather than a chore, and short enough that a number nobody has touched since
// spring does not sit on a card looking current.
const MAX_AGE_DAYS = 90;

function hashOf(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  const ordered = Object.fromEntries(Object.keys(manifest).sort().map(key => [key, manifest[key]]));
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
}

// Called by a refresh script once it has written its cache file. Hashing here
// rather than taking a hash from the caller means the manifest describes what
// is actually on disk.
function record(key, entry) {
  const manifest = readManifest();
  manifest[key] = { ...entry, sha256: hashOf(entry.file) };
  writeManifest(manifest);
  return manifest[key];
}

function ageInDays(fetchedAt, now = Date.now()) {
  const parsed = Date.parse(fetchedAt);
  if (!Number.isFinite(parsed)) return Infinity;
  return (now - parsed) / 86400000;
}

module.exports = { MANIFEST_FILE, MANIFEST_PATH, MAX_AGE_DAYS, ageInDays, hashOf, readManifest, record, writeManifest };
