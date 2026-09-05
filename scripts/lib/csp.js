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
// style-src still carries 'unsafe-inline'. Hashes cover a whole <style> element
// but not a style="" attribute, and 25 of those are still in the markup, four of
// them built at render time. Covering them needs 'unsafe-hashes', which the CSP
// spec's own wording calls unsafe, so the honest move is to leave style-src as
// it is until the attributes are gone rather than claim a protection with a
// hole in it.

const crypto = require('node:crypto');

// A <script> with a type the browser does not execute is data, not code, and is
// outside script-src entirely. The JSON-LD block is the one here.
// The opening tag is captured separately from the body on purpose. Testing the
// whole match for a src attribute looked equivalent and was not: the 93KB
// application script assigns element.src in its own code, so it read as an
// external script and was silently left out of the policy. The page then loaded
// with a hash covering the theme boot script and nothing else.
const EXECUTABLE_SCRIPT = /(<script(?![^>]*\stype\s*=\s*"(?!text\/javascript|module)[^"]*")[^>]*>)([\s\S]*?)<\/script>/gi;

function hashesFor(html) {
  const digests = [];
  for (const [, openingTag, body] of html.matchAll(EXECUTABLE_SCRIPT)) {
    // Only inline scripts. One with a src attribute loads from an origin and is
    // covered by 'self'.
    if (/\ssrc\s*=/i.test(openingTag)) continue;
    if (!body.trim()) continue;
    digests.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...new Set(digests)];
}

// Both pages ship the same policy, so the sources are the union across them.
// A per-page policy would be tighter, but the two are asserted identical
// elsewhere precisely so neither can quietly drift from the other.
function buildPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
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
  const policy = buildPolicy(hashes);
  const out = {};
  const missing = [];
  for (const [file, html] of Object.entries(pages)) {
    const result = applyPolicy(html, policy);
    if (!result.ok) missing.push(file);
    out[file] = result.html;
  }
  return { pages: out, policy, hashes, missing };
}

module.exports = { hashesFor, buildPolicy, rewritePolicies };
