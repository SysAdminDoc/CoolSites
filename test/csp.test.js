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

// The three rules below are written against a parsed policy rather than against
// the shipped file, so each one can be pointed at a deliberately bad policy and
// shown to catch it. Checking only the real policy made them unfalsifiable: the
// exact-match assertion above would fail first every time, and a rule with a
// hole in it would still look green.

// Anything that can load from an origin other than this one. A bare scheme
// source like `https:` is the easy one to miss: it permits every https host on
// the internet while matching none of the obvious wildcard shapes.
function offOriginSources(directives) {
  const found = [];
  for (const [name, sources] of directives) {
    for (const source of sources) {
      const bare = source.replace(/^'|'$/g, '');
      const isSchemeSource = /^[a-z][a-z0-9+.-]*:$/i.test(source) && source !== 'data:' && source !== 'blob:';
      if (source === '*' || source.includes('://') || /^\*\./.test(source)
        || isSchemeSource || bare === 'unsafe-hashes') {
        found.push(`${name} ${source}`);
      }
    }
  }
  return found;
}

function headerOnlyDirectives(directives) {
  return HEADER_ONLY.filter(name => directives.has(name));
}

function unsafeOutsideInlineCode(directives) {
  const found = [];
  for (const [name, sources] of directives) {
    if (name === 'script-src' || name === 'style-src') continue;
    for (const source of sources) {
      if (source === "'unsafe-inline'" || source === "'unsafe-eval'") found.push(`${name} ${source}`);
    }
  }
  return found;
}

test('the policy grants exactly what the site needs', () => {
  const directives = parse(readPolicy(PAGES[0]));
  const declared = [...directives.keys()].sort();
  assert.deepEqual(declared, Object.keys(EXPECTED).sort(),
    'a new directive needs a decision recorded here, not a silent addition');
  for (const [name, sources] of Object.entries(EXPECTED)) {
    assert.deepEqual(directives.get(name), sources, `--${name} must stay exactly as reviewed`);
  }
});

test('nothing may be loaded from another origin', () => {
  assert.deepEqual(offOriginSources(parse(readPolicy(PAGES[0]))), [],
    'the site is entirely self-hosted');

  // The rule has to catch every shape, including the ones that do not look like
  // wildcards. `https:` alone permits the whole web.
  const shouldCatch = [
    "img-src 'self' https:",
    "script-src 'self' https://cdn.example.com",
    "default-src *",
    "font-src 'self' *.example.com",
    "connect-src 'self' http:",
    "style-src 'self' 'unsafe-hashes'"
  ];
  for (const policy of shouldCatch) {
    assert.ok(offOriginSources(parse(policy)).length > 0, `should have flagged: ${policy}`);
  }

  // And must not fire on the inline schemes the site legitimately uses.
  for (const policy of ["img-src 'self' data:", "worker-src 'self' blob:", "default-src 'none'"]) {
    assert.deepEqual(offOriginSources(parse(policy)), [], `should not have flagged: ${policy}`);
  }
});

test('the policy does not claim protection a meta tag cannot deliver', () => {
  assert.deepEqual(headerOnlyDirectives(parse(readPolicy(PAGES[0]))), [],
    'browsers ignore these in a meta tag, so shipping them there is misleading');
  for (const name of HEADER_ONLY) {
    assert.deepEqual(headerOnlyDirectives(parse(`default-src 'self'; ${name} 'none'`)), [name],
      `the rule has to catch ${name}`);
  }
});

test('unsafe-inline is confined to script-src and style-src', () => {
  // Both are load-bearing today: all CSS and JS are inline, and the theme boot
  // script has to run before first paint. Dropping them is a roadmap item.
  // Anywhere else it would be an accident.
  assert.deepEqual(unsafeOutsideInlineCode(parse(readPolicy(PAGES[0]))), [],
    'unsafe-inline belongs only where inline code actually lives');
  assert.deepEqual(unsafeOutsideInlineCode(parse("script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")), []);
  assert.ok(unsafeOutsideInlineCode(parse("default-src 'self' 'unsafe-eval'")).length > 0);
  assert.ok(unsafeOutsideInlineCode(parse("img-src 'self' 'unsafe-inline'")).length > 0);
});
