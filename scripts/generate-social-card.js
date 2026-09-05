'use strict';

// Renders social-card.png, the image that appears when someone shares the
// directory in Slack, Discord, Mastodon or anywhere else that reads og:image.
// Without one, every share of this site is a bare blue link, and sharing is how
// a directory is found.
//
//   node scripts/generate-social-card.js
//
// Run by hand, not by npm run build. The card says nothing that changes, on
// purpose: putting the site count on it would mean rewriting a 40KB binary on
// every commit that adds an entry, and git would carry every version of it
// forever to keep a number nobody reads from an image.
//
// Chrome renders it. There is no image library here and there cannot be one,
// because lint fails the build the moment package.json declares a dependency.
// This uses Chrome's own --screenshot flag rather than the CDP client in
// reencode-icons.js: one page, one shot, no need for a protocol connection.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'social-card.png');
// The size every scraper documents wanting, and the one Slack, Discord and
// Mastodon all crop from predictably.
const WIDTH = 1200;
const HEIGHT = 630;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge was not found; set CHROME_PATH to render the social card');
  return executable;
}

// Self-contained: the fonts are the ones already in the repository, read from
// disk and inlined, so this renders identically on a machine that has neither
// installed and makes no network request.
function cardHtml() {
  const font = file => fs.readFileSync(path.join(ROOT, 'fonts', file)).toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Outfit'; font-weight: 300 800; src: url(data:font/woff2;base64,${font('outfit-latin.woff2')}) format('woff2'); }
    @font-face { font-family: 'JetBrains Mono'; font-weight: 400 600; src: url(data:font/woff2;base64,${font('jetbrains-mono-latin.woff2')}) format('woff2'); }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; background: #08090d; color: #e6e8ee;
      font-family: 'Outfit', system-ui, sans-serif; display: flex; flex-direction: column;
      justify-content: center; padding: 88px 96px; position: relative; overflow: hidden; }
    .glow { position: absolute; width: 720px; height: 720px; border-radius: 50%;
      background: radial-gradient(circle, rgba(110,86,207,0.30), transparent 62%);
      top: -280px; right: -200px; }
    .mark { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 30px;
      color: #08090d; background: #6e56cf; width: 74px; height: 74px; border-radius: 18px;
      display: flex; align-items: center; justify-content: center; margin-bottom: 38px; }
    h1 { font-size: 82px; font-weight: 700; letter-spacing: -0.028em; line-height: 1.02; }
    p { font-size: 33px; color: #a6adc8; margin-top: 26px; max-width: 900px; line-height: 1.38; }
    .foot { position: absolute; bottom: 56px; left: 96px; right: 96px; display: flex;
      justify-content: space-between; align-items: baseline; gap: 48px;
      font-family: 'JetBrains Mono', monospace; font-size: 20px; color: #6f7689; }
    .foot span { white-space: nowrap; }
    .foot b { color: #6e56cf; font-weight: 600; }
  </style></head><body>
    <div class="glow"></div>
    <div class="mark">//</div>
    <h1>CoolSites</h1>
    <p>A hand-checked directory of free tools, open source projects and hidden gems.</p>
    <div class="foot">
      <span>sysadmindoc.github.io/CoolSites</span>
      <span><b>No account.</b> No tracking.</span>
    </div>
  </body></html>`;
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'coolsites-card-'));
const page = path.join(workspace, 'card.html');
fs.writeFileSync(page, cardHtml());

try {
  const result = spawnSync(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    // Chrome writes the file relative to the working directory, so it is given
    // an absolute path and the directory is pinned too.
    `--user-data-dir=${path.join(workspace, 'profile')}`,
    `--screenshot=${OUTPUT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `file://${page.replace(/\\/g, '/')}`
  ], { cwd: workspace, encoding: 'utf8' });

  if (!fs.existsSync(OUTPUT)) {
    throw new Error(`Chrome produced no image.\n${result.stderr || result.stdout || ''}`);
  }
  const bytes = fs.statSync(OUTPUT).size;
  console.log(`Wrote social-card.png, ${WIDTH}x${HEIGHT}, ${(bytes / 1024).toFixed(0)}KB`);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
