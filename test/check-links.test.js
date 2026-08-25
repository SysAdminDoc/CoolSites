'use strict';

// Drives the link checker against a local server that returns each case on
// demand. Running it against the live web only exercises whatever the internet
// happens to hand back that day, which in practice is "ok" every time, so the
// interesting classifications would never be tested at all.

const assert = require('node:assert/strict');
const http = require('node:http');
const { test, before, after } = require('node:test');

const { check, classifyError, sameDestination } = require('../scripts/check-links.js');

let server;
let origin;

// Deliberately slower than the timeout the slow-route test uses.
const SLOW_MS = 3000;

before(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const route = url.pathname;

    if (route === '/ok') { response.writeHead(200); response.end('fine'); return; }
    if (route === '/gone') { response.writeHead(404); response.end('no'); return; }
    if (route === '/tombstone') { response.writeHead(410); response.end('no'); return; }
    if (route === '/forbidden') { response.writeHead(403); response.end('bot wall'); return; }
    if (route === '/ratelimited') { response.writeHead(429); response.end('slow down'); return; }
    if (route === '/needsauth') { response.writeHead(401); response.end('who are you'); return; }
    if (route === '/broken') { response.writeHead(500); response.end('oops'); return; }
    if (route === '/unavailable') { response.writeHead(503); response.end('later'); return; }
    if (route === '/teapot') { response.writeHead(418); response.end('short and stout'); return; }

    // A permanent move to a genuinely different path: the one case that should
    // send someone to edit sites.json.
    if (route === '/moved') { response.writeHead(301, { Location: `${origin}/somewhere-else` }); response.end(); return; }
    if (route === '/somewhere-else') { response.writeHead(200); response.end('fine'); return; }

    // A permanent redirect that lands on the same place: adding a trailing
    // slash or www is not a content move and must not be reported as one.
    if (route === '/trailing') { response.writeHead(301, { Location: `${origin}/trailing/` }); response.end(); return; }
    if (route === '/trailing/') { response.writeHead(200); response.end('fine'); return; }

    if (route === '/temporary') { response.writeHead(302, { Location: `${origin}/somewhere-else` }); response.end(); return; }

    // Permanent then temporary. The temporary hop has to win, or a site that
    // 301s to a login redirector gets rewritten into sites.json.
    if (route === '/mixed') { response.writeHead(301, { Location: `${origin}/mixed-two` }); response.end(); return; }
    if (route === '/mixed-two') { response.writeHead(302, { Location: `${origin}/somewhere-else` }); response.end(); return; }

    if (route === '/loop-a') { response.writeHead(302, { Location: `${origin}/loop-b` }); response.end(); return; }
    if (route === '/loop-b') { response.writeHead(302, { Location: `${origin}/loop-a` }); response.end(); return; }

    // Genuinely unparseable: an absolute URL with no host at all.
    if (route === '/badlocation') { response.writeHead(301, { Location: 'http://[' }); response.end(); return; }
    // Nonsense that the URL parser still resolves, against a real base, into a
    // relative path. Browsers follow this too.
    if (route === '/oddlocation') { response.writeHead(301, { Location: 'ht!tp://%%%' }); response.end(); return; }

    // Refuses HEAD the way a surprising number of real hosts do, but serves GET.
    if (route === '/headhostile') {
      if (request.method === 'HEAD') { response.writeHead(405); response.end(); return; }
      response.writeHead(200); response.end('fine');
      return;
    }

    if (route === '/slow') { setTimeout(() => { response.writeHead(200); response.end('eventually'); }, SLOW_MS); return; }

    // Cloudflare's 52x range: the edge could not reach the origin.
    if (route === '/edgefail') { response.writeHead(526); response.end('origin cert problem'); return; }

    // The nasty one. A bot wall that answers scripts with 404 and browsers with
    // a real page. Torrents CSV does exactly this.
    if (route === '/botwall404') {
      const browser = /Mozilla\/5\.0/.test(request.headers['user-agent'] || '');
      if (browser) { response.writeHead(200); response.end('the real page'); return; }
      response.writeHead(404); response.end('go away');
      return;
    }

    // Same trick with a 503, which is what a shield under load returns. This
    // has to actually be a 503: as a 403 it short-circuits long before the
    // browser retry and the test proves nothing.
    if (route === '/botwall503') {
      const browser = /Mozilla\/5\.0/.test(request.headers['user-agent'] || '');
      if (browser) { response.writeHead(200); response.end('the real page'); return; }
      response.writeHead(503); response.end('go away');
      return;
    }

    // A dead deep link on a site whose 404 handler redirects browsers to the
    // homepage. The browser retry must not read that as proof of life.
    if (route === '/deadbutredirects') {
      const browser = /Mozilla\/5\.0/.test(request.headers['user-agent'] || '');
      if (browser) { response.writeHead(302, { Location: origin + '/ok' }); response.end(); return; }
      response.writeHead(404); response.end('gone');
      return;
    }

    // Refuses HEAD with a 404 but serves GET to everyone, which some CDNs do.
    if (route === '/head404') {
      if (request.method === 'HEAD') { response.writeHead(404); response.end(); return; }
      response.writeHead(200); response.end('fine');
      return;
    }

    if (route === '/nolocation') { response.writeHead(302); response.end(); return; }
    if (route === '/notimplemented') { response.writeHead(501); response.end(); return; }
    if (route === '/netauth') { response.writeHead(511); response.end(); return; }
    if (route === '/teapotonly') { response.writeHead(418); response.end(); return; }

    if (route === '/hop') {
      const n = Number(url.searchParams.get('n') || '0');
      if (n <= 0) { response.writeHead(200); response.end('done'); return; }
      response.writeHead(301, { Location: origin + '/hop?n=' + (n - 1) });
      response.end();
      return;
    }

    // A genuinely missing page: 404 no matter who asks. Must stay dead.
    if (route === '/reallygone') { response.writeHead(404); response.end('gone'); return; }

    // Drops the connection without answering, the way a shield or a flaky link
    // does. PuTTY was reported dead for exactly this.
    if (route === '/reset') { request.socket.destroy(); return; }

    response.writeHead(404);
    response.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

function site(route) {
  return { name: `probe ${route}`, category: 'Test', url: `${origin}${route}` };
}

const options = { timeout: 8000 };

test('a reachable URL is ok', async () => {
  const result = await check(site('/ok'), options);
  assert.equal(result.status, 'ok');
  assert.equal(result.httpStatus, 200);
});

test('404 and 410 are dead', async () => {
  assert.equal((await check(site('/gone'), options)).status, 'dead');
  assert.equal((await check(site('/tombstone'), options)).status, 'dead');
});

test('401, 403 and 429 are blocked, not dead', async () => {
  // This is the distinction that matters most. Treating a bot wall as a dead
  // link is how a working entry gets deleted.
  for (const route of ['/needsauth', '/forbidden', '/ratelimited']) {
    const result = await check(site(route), options);
    assert.equal(result.status, 'blocked', `${route} should be blocked, got ${result.status}`);
  }
});

test('a permanent move to a different address is reported as moved', async () => {
  const result = await check(site('/moved'), options);
  assert.equal(result.status, 'moved');
  assert.equal(result.finalUrl, `${origin}/somewhere-else`);
  assert.equal(result.hops, 1);
});

test('a permanent redirect to the same place is not a move', async () => {
  // Adding a trailing slash is not a content move, and reporting it as one
  // would bury the real moves in noise.
  assert.equal((await check(site('/trailing'), options)).status, 'ok');
});

test('a temporary redirect is not a move', async () => {
  assert.equal((await check(site('/temporary'), options)).status, 'redirect');
});

test('one temporary hop makes the whole chain temporary', async () => {
  assert.equal((await check(site('/mixed'), options)).status, 'redirect');
});

test('a redirect loop is an error, not a move', async () => {
  const result = await check(site('/loop-a'), options);
  assert.equal(result.status, 'error');
  assert.match(result.detail, /loop/);
});

test('an unparseable Location header is an error', async () => {
  const result = await check(site('/badlocation'), options);
  assert.equal(result.status, 'error');
  assert.match(result.detail, /unparseable Location/);
});

test('a malformed Location the URL parser still resolves is followed', async () => {
  // Not a defect. WHATWG URL treats it as a relative reference, which is what a
  // browser does, so the checker reports whatever is actually at the other end.
  const result = await check(site('/oddlocation'), options);
  assert.equal(result.status, 'dead');
  assert.equal(result.httpStatus, 404);
});

test('a host that refuses HEAD is retried with GET', async () => {
  // Without the retry this reads as a 405 and gets classified as broken.
  assert.equal((await check(site('/headhostile'), options)).status, 'ok');
});

test('5xx and odd 4xx are errors, never dead', async () => {
  // This test used to assert that a 418 was "dead". That was wrong: only 404
  // and 410 say a page is gone, and dead is the one status that fails the run
  // and tells an editor to delete the entry.
  assert.equal((await check(site('/broken'), options)).status, 'error');
  assert.equal((await check(site('/unavailable'), options)).status, 'error');
  assert.equal((await check(site('/teapot'), options)).status, 'error');
});

test('a bot wall that 404s scripts and serves browsers is blocked, not dead', async () => {
  // The failure this guards against deletes a live entry from the directory,
  // which is the worst thing this tool could do.
  const result = await check(site('/botwall404'), options);
  assert.equal(result.status, 'blocked');
  assert.match(result.detail, /bot wall/);
});

test('a bot wall that 503s scripts is blocked, not filed as a server error', async () => {
  // A shield under load answers 503. That used to short-circuit to "error"
  // before the browser retry ever ran, so the whole 5xx half of the bot-wall
  // claim was untested and did not work.
  const result = await check(site('/botwall503'), options);
  assert.equal(result.status, 'blocked', `expected blocked, got ${result.status} (${result.detail})`);
});

test('a browser landing on the homepage is not proof the deep link is alive', async () => {
  // Parked domains and redirecting 404 handlers answer every path with a 200
  // somewhere else. Accepting that would mean nothing is ever reported dead.
  const result = await check(site('/deadbutredirects'), options);
  assert.equal(result.status, 'dead', `expected dead, got ${result.status} (${result.detail})`);
});

test('a host that answers HEAD with 404 and GET with a page is ok', async () => {
  // Not a bot wall: the user agent never came into it. Reporting this as
  // blocked would be an invented diagnosis.
  const result = await check(site('/head404'), options);
  assert.equal(result.status, 'ok', `expected ok, got ${result.status} (${result.detail})`);
});

test('a redirect with no Location goes nowhere and is an error', async () => {
  const result = await check(site('/nolocation'), options);
  assert.equal(result.status, 'error');
  assert.match(result.detail, /no Location/);
});

test('server errors and refusals are never reported as dead', async () => {
  // Only 404 and 410 mean the page is gone. A 501 or a captive portal is a
  // broken server, and failing the run on it tells the editor to delete a
  // live entry.
  for (const route of ['/notimplemented', '/netauth', '/teapotonly']) {
    const result = await check(site(route), options);
    assert.equal(result.status, 'error', `${route} should be error, got ${result.status}`);
  }
});

test('a long but working redirect chain resolves instead of erroring', async () => {
  // Browsers allow 20 hops. Stopping short reported a working link as broken.
  const result = await check(site('/hop?n=15'), options);
  assert.equal(result.status, 'moved', `expected moved, got ${result.status} (${result.detail})`);
  assert.equal(result.hops, 15);
});

test('a page that is missing for everyone stays dead', async () => {
  // The other half: the browser retry must not launder every 404 into blocked.
  const result = await check(site('/reallygone'), options);
  assert.equal(result.status, 'dead');
  assert.equal(result.httpStatus, 404);
});

test('a dropped connection is transient, not a dead link', async () => {
  const result = await check(site('/reset'), options);
  assert.equal(result.status, 'error', `expected error, got ${result.status} (${result.detail})`);
  assert.match(result.detail, /transient/);
});

test('a CDN edge failure is not a missing page', async () => {
  const result = await check(site('/edgefail'), options);
  assert.equal(result.status, 'error');
  assert.match(result.detail, /edge/);
});

test('a host that never answers is a timeout, not a dead link', async () => {
  const result = await check(site('/slow'), { timeout: 1000 });
  assert.equal(result.status, 'timeout');
});

test('a hostname that does not resolve is reported as dns', async () => {
  const result = await check({ name: 'nowhere', category: 'Test', url: 'https://this-host-does-not-exist.coolsites-test.invalid/' }, { timeout: 8000 });
  assert.equal(result.status, 'dns', `expected dns, got ${result.status} (${result.detail})`);
});

test('the checker never mutates the record it was handed', async () => {
  const original = site('/ok');
  const snapshot = JSON.stringify(original);
  await check(original, options);
  assert.equal(JSON.stringify(original), snapshot, 'editorial data must be read-only here');
});

test('error classification separates TLS, DNS and timeouts', () => {
  assert.equal(classifyError(Object.assign(new Error('x'), { cause: { code: 'ENOTFOUND' } })).status, 'dns');
  assert.equal(classifyError(Object.assign(new Error('x'), { cause: { code: 'CERT_HAS_EXPIRED' } })).status, 'tls');
  assert.equal(classifyError(Object.assign(new Error('x'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } })).status, 'tls');
  assert.equal(classifyError(Object.assign(new Error('x'), { cause: { code: 'ETIMEDOUT' } })).status, 'timeout');
  assert.equal(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' })).status, 'timeout');
  assert.equal(classifyError(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })).status, 'dead');
});

test('destination comparison ignores www and a trailing slash but not the path', () => {
  assert.equal(sameDestination('https://example.com', 'https://www.example.com/'), true);
  assert.equal(sameDestination('https://example.com/a', 'https://example.com/a/'), true);
  assert.equal(sameDestination('https://example.com/a', 'https://example.com/b'), false);
  assert.equal(sameDestination('https://example.com', 'https://other.com'), false);
  assert.equal(sameDestination('https://example.com/a?x=1', 'https://example.com/a?x=2'), false);
});

test('destination comparison respects protocol and port, and ignores query order', () => {
  // An https to http downgrade and a move to another port are real changes.
  assert.equal(sameDestination('https://example.com/a', 'http://example.com/a'), false);
  assert.equal(sameDestination('https://example.com/a', 'https://example.com:8443/a'), false);
  // Reordered parameters land in the same place, so reporting a move is noise.
  assert.equal(sameDestination('https://example.com/a?x=1&y=2', 'https://example.com/a?y=2&x=1'), true);
});
