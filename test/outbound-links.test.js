'use strict';

// A directory that passes ranking signal to its entries is a commodity people
// buy, and two of the three submissions this repository has received were
// promotional. Every link out to a listed site therefore carries
// rel="nofollow ugc". Nothing enforces that in the markup itself, and the three
// surfaces build their anchors from three different helpers, so the rule is
// gated here instead.
//
// The classification below is the point of the test. It is not enough to check
// that today's four site links carry the attribute: a new anchor with a new
// helper name would be invisible to a check that only looked for known
// expressions. So every anchor in every surface has to fall into one of the two
// buckets, and an unrecognised href fails the test rather than being ignored.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SURFACES = ['index.html', 'collections.html', 'widget.js'];

// Links we publish about ourselves. They are not entries and pass no signal to
// anybody else, so they stay plain. The Wayback link is generated from an entry
// but points at the archive, not at the entry.
const OURS = [
  /^#/,
  /^\.\/$/,
  /^collections\.html$/,
  /^feeds\/recent\.atom$/,
  /^feeds\/directory\.opml$/,
  /^https:\/\/github\.com\/SysAdminDoc\/CoolSites(\/|$)/,
  /^https:\/\/web\.archive\.org\//,
  /^\$\{escapeAttr\(rootUrl\.href\)\}$/
];

function anchors(source) {
  return [...source.matchAll(/<a\b[^>]*?>/g)].map(match => match[0]);
}

function hrefOf(anchor) {
  const match = /href="([^"]*)"/.exec(anchor);
  return match ? match[1] : null;
}

for (const surface of SURFACES) {
  const source = fs.readFileSync(path.join(ROOT, surface), 'utf8');
  const tags = anchors(source);

  test(`${surface} has anchors this test understands`, () => {
    assert.ok(tags.length > 0, 'no anchors found, so the regex has drifted from the markup');
    for (const tag of tags) {
      assert.ok(hrefOf(tag) !== null, `anchor without a quoted href: ${tag}`);
    }
  });

  test(`${surface} sends no ranking signal to a listed site`, () => {
    for (const tag of tags) {
      const href = hrefOf(tag);
      if (OURS.some(pattern => pattern.test(href))) continue;

      // Anything left is a link to somewhere a listed entry chose. It has to be
      // built from entry data, and it has to be nofollowed.
      assert.match(href, /\$\{/, `${surface}: hardcoded link to somewhere that is not ours: ${href}. Add it to OURS if it is, or make it an entry link.`);
      assert.match(tag, /rel="[^"]*\bnofollow\b/, `${surface}: link to a listed site without nofollow: ${tag}`);
      assert.match(tag, /rel="[^"]*\bugc\b/, `${surface}: link to a listed site without ugc: ${tag}`);
      assert.match(tag, /rel="[^"]*\bnoopener\b/, `${surface}: link to a listed site without noopener: ${tag}`);
      assert.match(tag, /rel="[^"]*\bnoreferrer\b/, `${surface}: link to a listed site without noreferrer: ${tag}`);
    }
  });
}
