'use strict';

// Keeps the content security policy honest about the inline scripts it allows.
//
// script-src used to carry 'unsafe-inline', which is the directive doing the
// least work in any policy: it permits every inline script, including one an
// attacker managed to inject. All the JavaScript here is inline and the theme
// boot script has to run before first paint, so externalising it was the
// obvious fix and the wrong one, since it would trade the single-file build for
// a protection hashes give without that cost.
//
// So each inline script is hashed and the digest is listed instead. A browser
// runs a script whose SHA-256 matches one in the policy and refuses every other
// one, injected or otherwise. Editing a script by hand and forgetting to
// regenerate does not fail open: the page simply stops working, loudly.
//
// style-src is hashed the same way, and could not be until the 28 style
// attributes were out of the markup: a hash covers a whole <style> element and
// never a style="" attribute. Covering attributes needs 'unsafe-hashes', which
// the CSP spec's own wording calls unsafe. The colours that used to live in
// those attributes are set through the CSSOM instead, which CSP does not govern
// and which therefore needs no hash at all.

const crypto = require('node:crypto');

// A <script> with a type the browser does not execute is data, not code, and is
// outside script-src entirely. The JSON-LD block is the one here.
//
// The opening tag is captured separately from the body on purpose. Testing the
// whole match for a src attribute looked equivalent and was not: the 93KB
// application script assigns element.src in its own code, so it read as an
// external script and was silently left out of the policy. The page then loaded
// with a hash covering the theme boot script and nothing else.
const EXECUTABLE_SCRIPT = /(<script(?![^>]*\stype\s*=\s*"(?!text\/javascript|module)[^"]*")[^>]*>)([\s\S]*?)<\/script>/gi;

// An HTML comment holding an unpaired <script ...> open tag, the sort a README
// snippet inside a page would have, made the non-greedy body match run past it
// and swallow the next real script whole. That script then shipped with no
// digest and the browser refused to run it. Comments cannot contain a script
// element, so removing them first is both correct and enough. The replacement
// keeps the newlines so nothing else that reads this HTML shifts.
function withoutComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ''));
}

// A <style> element has no equivalent of type="module" or src to reason about:
// every one of them is a stylesheet the browser applies, so all of them count.
const INLINE_STYLE = /<style>([\s\S]*?)<\/style>/gi;

function digest(body) {
  return `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

function hashesFor(html) {
  const digests = [];
  for (const [, openingTag, body] of withoutComments(html).matchAll(EXECUTABLE_SCRIPT)) {
    // Only inline scripts. One with a src attribute loads from an origin and is
    // covered by 'self'.
    if (/\ssrc\s*=/i.test(openingTag)) continue;
    if (!body.trim()) continue;
    digests.push(digest(body));
  }
  return [...new Set(digests)];
}

function styleHashesFor(html) {
  const digests = [];
  for (const [, body] of withoutComments(html).matchAll(INLINE_STYLE)) {
    if (!body.trim()) continue;
    digests.push(digest(body));
  }
  return [...new Set(digests)];
}

// Both pages ship the same policy, so the sources are the union across them.
// A per-page policy would be tighter, but the two are asserted identical
// elsewhere precisely so neither can quietly drift from the other.
function buildPolicy(scriptHashes, styleHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    `style-src 'self' ${styleHashes.join(' ')}`.trim(),
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');
}

const POLICY_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;

function applyPolicy(html, policy) {
  if (!POLICY_META.test(html)) return { html, ok: false };
  // A function replacement, because $& and $` in a base64 digest would be
  // interpreted as replacement patterns by the string form and corrupt it.
  return { html: html.replace(POLICY_META, () => `<meta http-equiv="Content-Security-Policy" content="${policy}">`), ok: true };
}

// Takes { file: html } and returns the same shape with the policy rewritten to
// match whatever scripts those files actually contain right now.
function rewritePolicies(pages) {
  const hashes = [...new Set(Object.values(pages).flatMap(hashesFor))].sort();
  const styleHashes = [...new Set(Object.values(pages).flatMap(styleHashesFor))].sort();
  const policy = buildPolicy(hashes, styleHashes);
  const out = {};
  const missing = [];
  for (const [file, html] of Object.entries(pages)) {
    const result = applyPolicy(html, policy);
    if (!result.ok) missing.push(file);
    out[file] = result.html;
  }
  return { pages: out, policy, hashes, styleHashes, missing };
}

module.exports = { hashesFor, styleHashesFor, buildPolicy, rewritePolicies };
