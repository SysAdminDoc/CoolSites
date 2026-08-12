'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const WAIT_STEP_MS = 100;

test('CoolSites golden path works in a real browser', { timeout: 90000 }, async () => {
  let server = await startLocalServer();
  const chrome = await startChrome();
  let connection;
  let page;

  try {
    connection = await CdpConnection.connect(chrome.webSocketUrl);
    page = await createPage(connection, server.url);
    await waitFor(page, "document.readyState === 'complete' && document.querySelectorAll('#grid .card').length > 0");
    await page.evaluate('localStorage.clear()');
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    const initial = await page.evaluate(`({
      cards: document.querySelectorAll('#grid .card').length,
      dialogs: document.querySelectorAll('dialog[open]').length,
      dataStatusHidden: document.getElementById('dataStatus').hidden,
      unnamedButtons: [...document.querySelectorAll('button')].filter(button =>
        !button.getAttribute('aria-label') && !button.getAttribute('title') && !button.textContent.trim()
      ).length
    })`);
    assert.equal(initial.dialogs, 0, 'closed native dialogs must not render open');
    assert.equal(initial.dataStatusHidden, true, 'online data should not show the offline status');
    assert.equal(initial.unnamedButtons, 0, 'icon-only controls need an accessible name');
    assert.ok(initial.cards > 0, 'the directory should render cards');

    await page.evaluate("document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))");
    await waitFor(page, "document.getElementById('shortcutsModal').open");
    await page.evaluate("document.getElementById('shortcutsClose').click()");
    await waitFor(page, "!document.getElementById('shortcutsModal').open");
    await page.evaluate("document.getElementById('newGroupBtn').focus(); document.getElementById('newGroupBtn').click()");
    await waitFor(page, "document.getElementById('groupModal').open");
    await page.evaluate("document.getElementById('modalCancel').click()");
    await waitFor(page, "!document.getElementById('groupModal').open");
    assert.equal(await page.evaluate("document.activeElement.id"), 'newGroupBtn', 'closing the group dialog should restore focus');

    await page.evaluate(`(() => {
      const input = document.getElementById('searchInput');
      input.value = 'Cloudflare';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(page, "document.querySelector('#grid .card .card-title')?.textContent.includes('Cloudflare')");
    assert.match(await page.evaluate("document.getElementById('resultsCount').textContent"), /of 589/);

    await page.evaluate(`(() => {
      const input = document.getElementById('searchInput');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-cat="Homelab"]').click();
    })()`);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0 && location.search.includes('cat=Homelab')");
    assert.ok(await page.evaluate("[...document.querySelectorAll('#grid .card-category')].every(node => node.textContent.trim() === 'Homelab')"));
    await page.evaluate("document.querySelector('[data-cat=\"All\"]').click(); document.querySelector('#sortSelect').value = 'az'; document.querySelector('#sortSelect').dispatchEvent(new Event('change', { bubbles: true }))");
    await waitFor(page, "document.querySelector('#grid .card-title')?.textContent");
    assert.equal(await page.evaluate(`(() => {
      const names = [...document.querySelectorAll('#grid .card-title')].map(node => node.textContent.trim());
      return names[0] === [...names].sort((a, b) => a.localeCompare(b))[0];
    })()`), true, 'A-Z sort should reorder the visible cards');

    await page.evaluate("document.querySelector('.theme-option[data-theme=\"light\"]').click()");
    assert.equal(await page.evaluate("document.documentElement.dataset.theme"), 'light');

    await page.evaluate("document.querySelector('#compareModeBtn').click()");
    await waitFor(page, "document.querySelectorAll('[data-action=compare]').length >= 2");
    await page.evaluate("document.querySelectorAll('[data-action=compare]')[0].click(); document.querySelectorAll('[data-action=compare]')[1].click()");
    await waitFor(page, "!document.getElementById('compareOpenBtn').disabled");
    await page.evaluate("document.getElementById('compareOpenBtn').click()");
    await waitFor(page, "document.getElementById('compareModal').open");
    await page.evaluate("document.getElementById('compareClose').click()");

    const firstUrl = await page.evaluate("document.querySelector('#grid .card')?.dataset.url");
    await page.evaluate("document.querySelector('[data-action=bookmark]').click()");
    await waitFor(page, "JSON.parse(localStorage.getItem('coolsites-bookmarks-v2')).schemaVersion === 2");
    const savedBookmark = await page.evaluate(`(() => {
      const stored = JSON.parse(localStorage.getItem('coolsites-bookmarks-v2'));
      return { schemaVersion: stored.schemaVersion, hasBookmark: Boolean(stored.data['${escapeForExpression(firstUrl)}']) };
    })()`);
    assert.deepEqual(savedBookmark, { schemaVersion: 2, hasBookmark: true });

    await page.evaluate("localStorage.setItem('coolsites-bookmarks-v2', '{broken')");
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.equal(await page.evaluate("document.getElementById('resultsCount').textContent.includes('Data failed')"), false, 'corrupt local storage must not stop boot');

    const importResult = await page.evaluate(`(() => {
      const first = document.querySelector('#grid .card').dataset.url;
      const payload = {
        app: 'coolsites-bookmarks',
        schemaVersion: 2,
        groups: [
          { id: 'safe_group', name: 'Safe Group', color: '#112233' },
          { id: 'bad\" onmouseover=\"alert(1)', name: '<img src=x>', color: 'red' }
        ],
        bookmarks: {
          [first]: { group: 'safe_group', order: 0, addedAt: Date.now() },
          'javascript:alert(1)': { group: 'safe_group', order: 1, addedAt: Date.now() },
          'https://unknown.invalid/': { group: 'safe_group', order: 2, addedAt: Date.now() }
        }
      };
      const input = document.getElementById('importFile');
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return first;
    })()`);
    await waitFor(page, "document.getElementById('toast').textContent.includes('skipped')");
    const importedState = await page.evaluate(`(() => {
      const bookmarks = JSON.parse(localStorage.getItem('coolsites-bookmarks-v2')).data;
      const groups = JSON.parse(localStorage.getItem('coolsites-groups-v2')).data;
      return {
        bookmarkKeys: Object.keys(bookmarks),
        groups,
        unsafeGroup: groups.some(group => group.id.includes('onmouseover') || group.color === 'red')
      };
    })()`);
    assert.deepEqual(importedState.bookmarkKeys, [importResult]);
    assert.equal(importedState.unsafeGroup, false, 'unsafe imported group fields must be rejected');

    await page.send('Page.navigate', { url: `${server.url}collections.html` });
    await waitFor(page, "document.querySelectorAll('#collections .collection').length > 0");
    assert.ok(await page.evaluate("document.querySelectorAll('#collections .site').length > 0"));

    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    await page.evaluate(`(() => {
      const target = document.createElement('div');
      target.id = 'widget-test-target';
      document.body.appendChild(target);
      const script = document.createElement('script');
      script.src = './widget.js';
      script.dataset.target = '#widget-test-target';
      target.appendChild(script);
    })()`);
    await waitFor(page, "document.querySelector('#widget-test-target coolsites-widget')?.shadowRoot?.querySelector('.item, .empty')");

    await waitFor(page, "navigator.serviceWorker?.controller");
    await stopProcess(server.process);
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0", 15000);
    const offlineState = await page.evaluate(`(async () => ({
      statusHidden: document.getElementById('dataStatus').hidden,
      statusText: document.getElementById('dataStatus').textContent,
      online: navigator.onLine,
      dataSource: typeof DATA_SOURCE === 'undefined' ? 'missing' : DATA_SOURCE,
      controller: Boolean(navigator.serviceWorker?.controller),
      cacheKeys: typeof caches === 'undefined' ? [] : await caches.keys(),
      probeSource: await fetch('./sites.json', { cache: 'no-cache' }).then(response => response.headers.get('X-CoolSites-Cache')).catch(error => String(error))
    }))()`);
    assert.equal(offlineState.statusHidden, false, JSON.stringify(offlineState));
    assert.match(offlineState.statusText, /Offline: showing cached directory data/);
    server = await startLocalServer();
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await page.send('Page.reload', { ignoreCache: false });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    const mobile = await page.evaluate(`({
      columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns,
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    })`);
    assert.equal(mobile.columns.split(' ').length, 1, 'mobile layout should use one card column');
    assert.equal(mobile.overflow, true, 'mobile layout should not overflow horizontally');
    await page.send('Emulation.clearDeviceMetricsOverride');
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.reload', { ignoreCache: false });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.ok(Number.parseFloat(await page.evaluate("getComputedStyle(document.querySelector('#grid .card')).animationDuration")) < 0.001, 'reduced motion should disable card animation');
  } finally {
    if (page && connection) {
      try { await connection.send('Target.closeTarget', { targetId: page.targetId }); } catch {}
    }
    if (connection) connection.close();
    await stopProcess(chrome.process);
    await stopProcess(server.process);
    fs.rmSync(chrome.profile, { recursive: true, force: true });
  }
});

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    if (typeof WebSocket !== 'function') throw new Error('Node 22.17+ with WebSocket support is required for browser tests');
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { this.socket.close(); }
}

async function createPage(connection, url, navigate = true) {
  const target = await connection.send('Target.createTarget', { url: 'about:blank' });
  const attached = await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = {
    targetId: target.targetId,
    send: (method, params = {}) => connection.send(method, params, attached.sessionId),
    evaluate: expression => evaluate(connection, attached.sessionId, expression)
  };
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['https://*'] });
  if (navigate) await page.send('Page.navigate', { url });
  return page;
}

async function evaluate(connection, sessionId, expression) {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitFor(page, expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(expression)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(WAIT_STEP_MS);
  }
  throw new Error(`Timed out waiting for: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

async function startLocalServer() {
  const child = spawn(process.execPath, ['scripts/serve.js', '0'], {
    cwd: ROOT,
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = collectOutput(child);
  const match = await waitForOutput(output, /http:\/\/127\.0\.0\.1:(\d+)\//, child, 'local server');
  return { process: child, url: `http://127.0.0.1:${match[1]}/` };
}

async function startChrome() {
  const executable = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'coolsites-browser-'));
  const child = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = collectOutput(child);
  const match = await waitForOutput(output, /DevTools listening on (ws:\/\/[^\s]+)/, child, 'Chrome DevTools');
  return { process: child, profile, webSocketUrl: match[1] };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge was not found; set CHROME_PATH to run npm test');
  return executable;
}

function collectOutput(child) {
  let value = '';
  const append = chunk => { value += String(chunk); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return { get value() { return value; } };
}

async function waitForOutput(output, pattern, child, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const match = output.value.match(pattern);
    if (match) return match;
    if (child.exitCode != null) throw new Error(`${label} exited before becoming ready`);
    await delay(WAIT_STEP_MS);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(2000)
  ]);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function escapeForExpression(value) {
  return JSON.stringify(value).slice(1, -1).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
