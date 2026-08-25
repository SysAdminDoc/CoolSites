'use strict';

// Palette gate. The browser probe measures what a few selectors actually render;
// this checks the tokens themselves, which covers surfaces that are hard to
// render on demand (popovers, dialogs, hover and drag states) and gives an exact
// number rather than a compositor snapshot.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function parseThemes(source) {
  const themes = new Map();
  const blocks = source.matchAll(/\[data-theme="([a-z-]+)"\][^{]*\{([\s\S]*?)\n {2}\}/g);
  for (const block of blocks) {
    const tokens = {};
    for (const declaration of block[2].matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
      tokens[declaration[1]] = declaration[2].trim();
    }
    // Skip the light-theme override rules further down the stylesheet, which
    // reuse the same selector but define no palette.
    if (tokens['bg-primary']) themes.set(block[1], tokens);
  }
  return themes;
}

// Returns null rather than throwing: one unparseable token must not abort the
// whole sweep and hide every other regression behind it.
function toRgb(value) {
  if (typeof value !== 'string') return null;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function channel(value) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a, b) {
  const rgbA = toRgb(a);
  const rgbB = toRgb(b);
  if (!rgbA || !rgbB) return null;
  const la = luminance(rgbA);
  const lb = luminance(rgbB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Foreground token -> the surfaces it is painted on.
const PAIRS = [
  ['text-primary', ['bg-primary', 'bg-secondary', 'bg-card', 'bg-card-hover']],
  ['text-secondary', ['bg-primary', 'bg-secondary', 'bg-card', 'bg-card-hover']],
  ['text-muted', ['bg-primary', 'bg-secondary', 'bg-card', 'bg-card-hover']],
  ['accent-text', ['bg-primary', 'bg-card', 'bg-card-hover']],
  ['amber-text', ['bg-primary', 'bg-card']],
  ['danger-text', ['bg-primary', 'bg-card']],
  ['on-accent', ['accent']]
];

const THEMES = parseThemes(html);

test('every theme defines the full token set', () => {
  assert.equal(THEMES.size, 9, `expected nine palettes, found ${[...THEMES.keys()].join(', ')}`);
  const required = ['bg-primary', 'bg-secondary', 'bg-card', 'bg-card-hover', 'text-primary',
    'text-secondary', 'text-muted', 'accent', 'accent-text', 'amber-text', 'danger-text',
    'on-accent', 'accent-amber', 'accent-tertiary'];
  const missing = [];
  for (const [name, tokens] of THEMES) {
    for (const token of required) if (!tokens[token]) missing.push(`${name}.--${token}`);
  }
  assert.deepEqual(missing, [], 'every palette must define the same tokens');
});

test('text tokens clear WCAG AA on the surfaces that use them', () => {
  // Every palette has to be present, or a parse slip silently narrows the sweep
  // and this test passes without measuring the missing theme.
  assert.equal(THEMES.size, 9, 'the palette parse must find all nine themes');
  const failures = [];
  let checked = 0;
  for (const [name, tokens] of THEMES) {
    for (const [foreground, backgrounds] of PAIRS) {
      for (const background of backgrounds) {
        const ratio = contrast(tokens[foreground], tokens[background]);
        if (ratio === null) {
          failures.push(`${name}: --${foreground} (${tokens[foreground] ?? 'missing'}) on --${background} (${tokens[background] ?? 'missing'}) is not a plain hex colour`);
          continue;
        }
        checked++;
        if (ratio < 4.5) {
          failures.push(`${name}: --${foreground} on --${background} is ${ratio.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], 'small text needs 4.5:1');
  assert.equal(checked, THEMES.size * PAIRS.reduce((total, pair) => total + pair[1].length, 0),
    'every token pair in every theme has to be measured');
});

test('borders stay visible against their own surface', () => {
  // Not a contrast rule, just a guard that no palette leaves an edge at zero.
  const failures = [];
  for (const [name, tokens] of THEMES) {
    for (const token of ['border', 'border-hover']) {
      const value = tokens[token] || '';
      const alpha = /rgba?\([^)]*?,\s*([\d.]+)\s*\)$/.exec(value);
      if (!alpha) { failures.push(`${name}: --${token} is not an rgba value (${value})`); continue; }
      if (Number(alpha[1]) < 0.05) failures.push(`${name}: --${token} alpha ${alpha[1]} is invisible`);
    }
  }
  assert.deepEqual(failures, [], 'every palette needs a perceptible border');
});
