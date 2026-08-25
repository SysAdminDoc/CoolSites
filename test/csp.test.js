'use strict';

// Structural gate on the content security policy. The browser test proves the
// shipped policy does not block the app; this proves the policy is still there,
// still enforced, and has not quietly grown a wildcard.
//
// It lives in a meta tag because GitHub Pages cannot send response headers, and
// GitHub Pages is where this actually deploys.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'collections.html'];

// Ignored by browsers when the policy arrives in a meta tag, so shipping them
// there reads as protection the page does not actually have.
const HEADER_ONLY = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

const EXPECTED = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"]
};

function readPolicy(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const match = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i.exec(html);
  return match ? match[1] : null;
}

function parse(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) directives.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return directives;
}

test('both pages ship the same enforced content security policy', () => {
  const policies = PAGES.map(page => [page, readPolicy(page)]);
  const missing = policies.filter(([, policy]) => !policy).map(([page]) => page);
  assert.deepEqual(missing, [], 'every page needs the policy, not just the entry point');

  // Report-only would be a header-side concept anyway, but a stray
  // "-Report-Only" in the http-equiv would silently disable enforcement.
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.equal(/Content-Security-Policy-Report-Only/i.test(html), false,
      `${page} must enforce the policy, not just report on it`);
  }

  const [first, ...rest] = policies.map(([, policy]) => policy);
  for (const [index, policy] of rest.entries()) {
    assert.equal(policy, first, `${PAGES[index + 1]} must not drift from ${PAGES[0]}`);
  }
});

test('the policy grants exactly what the site needs and nothing wider', () => {
  const directives = parse(readPolicy(PAGES[0]));

  const declared = [...directives.keys()].sort();
  assert.deepEqual(declared, Object.keys(EXPECTED).sort(),
    'a new directive needs a decision recorded here, not a silent addition');

  for (const [name, sources] of Object.entries(EXPECTED)) {
    assert.deepEqual(directives.get(name), sources, `--${name} must stay exactly as reviewed`);
  }

  // The site is entirely self-hosted, so any host source at all is a regression.
  const wildcards = [];
  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (source === '*' || source.includes('://') || /^\*\./.test(source)) {
        wildcards.push(`${name} ${source}`);
      }
    }
  }
  assert.deepEqual(wildcards, [], 'nothing may be loaded from another origin');
});

test('the policy does not claim protection a meta tag cannot deliver', () => {
  const directives = parse(readPolicy(PAGES[0]));
  const ignored = HEADER_ONLY.filter(name => directives.has(name));
  assert.deepEqual(ignored, [],
    'browsers ignore these in a meta tag, so shipping them there is misleading');
});

test('unsafe-inline is confined to script-src and style-src', () => {
  // Both are load-bearing today: all CSS and JS are inline, and the theme boot
  // script has to run before first paint. Dropping them is a roadmap item.
  // Anywhere else it would be an accident.
  const directives = parse(readPolicy(PAGES[0]));
  const unexpected = [];
  for (const [name, sources] of directives) {
    if (name === 'script-src' || name === 'style-src') continue;
    for (const source of sources) {
      if (source === "'unsafe-inline'" || source === "'unsafe-eval'") unexpected.push(`${name} ${source}`);
    }
  }
  assert.deepEqual(unexpected, [], 'unsafe-inline belongs only where inline code actually lives');
});
