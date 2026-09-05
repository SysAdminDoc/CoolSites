'use strict';

// Shrinks cached favicons by decoding and re-encoding them at the size the page
// actually renders.
//
// favicons.json ships in full on every visit, so every byte in it is paid for by
// every reader. The generator asks Google for a 32px icon, but Google 404s for a
// long tail of domains and the fallbacks hand back whatever the site has: a
// multi-resolution .ico carrying 16 through 256px, or an apple-touch-icon at
// 180px. Four of those were 21% of the file on their own.
//
// There is no image library here and there cannot be one: lint fails the build
// if package.json declares a dependency of any kind. So this drives the headless
// Chrome that already runs the browser tests, decodes each icon into a canvas at
// 32x32 and re-encodes it. Chrome decodes ICO, PNG, JPEG, GIF and WebP, which is
// every raster type the cache is allowed to hold.
//
// SVG is left alone. It is already resolution-independent, and rasterising it to
// 32px would throw that away to save bytes it mostly does not cost.

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const RENDER_SIZE = 32;
// Below this a re-encode cannot win back more than it costs in churn: the median
// cached icon is about 1KB and already close to what 32px can be.
const DEFAULT_THRESHOLD = 2048;
const CHROME_START_TIMEOUT_MS = 20000;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge was not found; set CHROME_PATH to re-encode icons');
  return executable;
}

async function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'coolsites-icons-'));
  const child = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let output = '';
  const append = chunk => { output += String(chunk); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const started = Date.now();
  while (Date.now() - started < CHROME_START_TIMEOUT_MS) {
    const match = /ws:\/\/[^\s]+/.exec(output);
    if (match) return { child, profile, webSocketUrl: match[0] };
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Chrome did not report a debugging endpoint:\n${output}`);
}

// The smallest CDP client that can run one expression and read the answer back.
// Node 22 ships a global WebSocket, so this needs nothing installed.
async function connect(url) {
  if (typeof WebSocket !== 'function') throw new Error('Node 22.17+ with WebSocket support is required');
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await send('Runtime.enable', {}, attached.sessionId);

  return {
    close: () => socket.close(),
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      }, attached.sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'evaluation failed');
      return result.result.value;
    }
  };
}

// Runs in the browser. Returns the smallest of the candidate encodings, or null
// if the image will not decode or the re-encode did not actually save anything.
function browserSideResize() {
  return `(async (source, size) => {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', () => reject(new Error('decode failed')), { once: true });
    });
    image.src = source;
    await loaded;
    if (!image.naturalWidth || !image.naturalHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';

    // Letterbox rather than stretch: a wide wordmark squashed into a square is
    // worse than the initial letter the page falls back to.
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);

    const candidates = [canvas.toDataURL('image/webp', 0.92), canvas.toDataURL('image/png')]
      .filter(value => value && value.startsWith('data:image/'));
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.length - b.length);
    return { encoded: candidates[0], width: image.naturalWidth, height: image.naturalHeight };
  })(${JSON.stringify('__SOURCE__')}, ${RENDER_SIZE})`;
}

// Exported so the caller decides what to do with the numbers, and so a test can
// drive one icon without launching anything.
async function reencodeAll(cache, { threshold = DEFAULT_THRESHOLD, onProgress } = {}) {
  const targets = Object.entries(cache)
    .filter(([, value]) => typeof value === 'string' && value.length > threshold && !value.startsWith('data:image/svg+xml'));

  if (!targets.length) return { checked: 0, shrunk: 0, savedBytes: 0, failures: [] };

  const chrome = await startChrome();
  let session;
  const failures = [];
  let shrunk = 0;
  let savedBytes = 0;

  try {
    session = await connect(chrome.webSocketUrl);
    let done = 0;
    for (const [domain, original] of targets) {
      try {
        const expression = browserSideResize().replace(JSON.stringify('__SOURCE__'), JSON.stringify(original));
        const result = await session.evaluate(expression);
        // Only keep a result that is genuinely smaller. A 32px icon that
        // re-encodes larger than the original means the original was already
        // small or already 32px, and replacing it would lose quality for free.
        if (result && result.encoded.length < original.length) {
          savedBytes += original.length - result.encoded.length;
          cache[domain] = result.encoded;
          shrunk++;
        }
      } catch (error) {
        failures.push(`${domain}: ${error.message}`);
      }
      done++;
      if (onProgress) onProgress(done, targets.length);
    }
  } finally {
    if (session) session.close();
    chrome.child.kill();
    // Chrome holds the profile directory briefly after exit on Windows.
    try {
      fs.rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch { /* a leftover temp profile is not worth failing a run over */ }
  }

  return { checked: targets.length, shrunk, savedBytes, failures };
}

module.exports = { reencodeAll, RENDER_SIZE, DEFAULT_THRESHOLD };
