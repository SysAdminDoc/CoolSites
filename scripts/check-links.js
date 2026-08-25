'use strict';

// Reads sites.json and reports on every URL in it. Never writes to sites.json:
// deciding what to do about a dead entry is an editorial call, not something a
// script should make at three in the morning.
//
//   node scripts/check-links.js [options]
//
//   --out <path>          where to write the JSON report (default work/link-check.json)
//   --concurrency <n>     parallel requests (default 8)
//   --timeout <ms>        per-attempt timeout (default 15000)
//   --filter <text>       only check URLs containing this text
//   --limit <n>           stop after this many entries
//   --only <status,...>   print only these statuses in the console summary
//
// Exit code is 0 unless something is actually broken (dead or a TLS failure),
// so a redirect or a rate-limited host does not fail a routine check.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Long enough that a slow homelab project does not read as dead, short enough
// that 588 entries still finish in a couple of minutes.
const DEFAULTS = { concurrency: 8, timeout: 15000, out: path.join('work', 'link-check.json') };
const MAX_HOPS = 10;
const RETRY_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

// A polite, honest identifier. Some hosts still refuse it, which is what the
// "blocked" status is for.
const USER_AGENT = 'CoolSites-link-check (+https://github.com/SysAdminDoc/CoolSites)';

const STATUS_ORDER = ['dead', 'tls', 'dns', 'timeout', 'error', 'blocked', 'moved', 'redirect', 'ok'];

// Only these mean "a human needs to edit sites.json". Everything else is
// informational: a 403 from a bot wall says nothing about whether the page is
// still there, and treating it as a dead link is how good entries get deleted.
const BROKEN = new Set(['dead', 'tls']);

function parseArgs(argv) {
  const options = { ...DEFAULTS, filter: null, limit: Infinity, only: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '--out': options.out = value; i++; break;
      case '--concurrency': options.concurrency = Number.parseInt(value, 10); i++; break;
      case '--timeout': options.timeout = Number.parseInt(value, 10); i++; break;
      case '--filter': options.filter = value; i++; break;
      case '--limit': options.limit = Number.parseInt(value, 10); i++; break;
      case '--only': options.only = new Set(value.split(',').map(s => s.trim())); i++; break;
      case '--help': case '-h': options.help = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    }
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be a positive integer');
  if (!Number.isInteger(options.timeout) || options.timeout < 1000) throw new Error('--timeout must be at least 1000');
  return options;
}

// Node reports every network problem as "fetch failed" and hides the real
// reason in .cause, so the distinction between a dead host, an expired
// certificate and a slow one has to be dug out by code.
function classifyError(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return { status: 'timeout', detail: 'timed out' };
  const cause = error.cause || error;
  const code = cause.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { status: 'dns', detail: code };
  if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code.startsWith('UNABLE_TO_')
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN'
    || code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'EPROTO') {
    return { status: 'tls', detail: code };
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
    return { status: 'timeout', detail: code };
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH') {
    return { status: 'dead', detail: code };
  }
  return { status: 'error', detail: code || cause.message || String(error) };
}

async function attempt(url, method, timeout) {
  return fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': USER_AGENT,
      // Some hosts serve a bot wall to clients that do not look like browsers.
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
}

// Walks the redirect chain by hand so the final URL, the hop count and whether
// the move was permanent are all visible. redirect: 'follow' throws that away.
async function walk(startUrl, method, timeout) {
  const chain = [];
  let current = startUrl;
  let permanent = true;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await attempt(current, method, timeout);
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      // A 302/303/307 says "not here right now", which is not a reason to
      // rewrite the entry, so one temporary hop makes the whole chain temporary.
      if (response.status !== 301 && response.status !== 308) permanent = false;
      let next;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { response, finalUrl: current, chain, permanent, badLocation: location };
      }
      if (chain.includes(next)) return { response, finalUrl: next, chain, permanent, loop: true };
      chain.push(next);
      current = next;
      continue;
    }
    return { response, finalUrl: current, chain, permanent };
  }
  return { finalUrl: current, chain, permanent, tooManyHops: true };
}

function sameDestination(a, b) {
  try {
    const first = new URL(a);
    const second = new URL(b);
    const strip = value => value.replace(/\/$/, '');
    return first.hostname.replace(/^www\./, '') === second.hostname.replace(/^www\./, '')
      && strip(first.pathname) === strip(second.pathname)
      && first.search === second.search;
  } catch {
    return a === b;
  }
}

async function check(site, options) {
  const record = { name: site.name, category: site.category, url: site.url };
  let walked;

  try {
    walked = await walk(site.url, 'HEAD', options.timeout);
    // Plenty of hosts refuse HEAD outright while serving GET fine, so a failing
    // HEAD is a reason to ask again properly, not a verdict.
    if (!walked.response || !walked.response.ok) {
      const status = walked.response ? walked.response.status : 0;
      if (status === 0 || status === 403 || status === 405 || status === 501 || status >= 500) {
        walked = await walk(site.url, 'GET', options.timeout);
      }
    }
  } catch (firstError) {
    try {
      walked = await walk(site.url, 'GET', options.timeout);
    } catch (secondError) {
      const classified = classifyError(secondError);
      // A timeout on both attempts is still only a timeout. Calling it dead
      // would delete entries for anything slow.
      return { ...record, status: classified.status, detail: classified.detail };
    }
  }

  if (walked.tooManyHops) return { ...record, status: 'error', detail: `more than ${MAX_HOPS} redirects` };
  if (walked.loop) return { ...record, status: 'error', detail: 'redirect loop' };
  if (walked.badLocation) return { ...record, status: 'error', detail: `unparseable Location: ${walked.badLocation}` };

  const { response, finalUrl, chain, permanent } = walked;
  const httpStatus = response.status;
  const result = { ...record, httpStatus, hops: chain.length };
  if (chain.length) result.finalUrl = finalUrl;

  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
    result.status = 'blocked';
    result.detail = `HTTP ${httpStatus}, which usually means a bot wall rather than a missing page`;
    return result;
  }
  if (httpStatus === 404 || httpStatus === 410) {
    result.status = 'dead';
    result.detail = `HTTP ${httpStatus}`;
    return result;
  }
  if (httpStatus >= 500) {
    result.status = RETRY_STATUSES.has(httpStatus) ? 'error' : 'dead';
    result.detail = `HTTP ${httpStatus}`;
    return result;
  }
  if (httpStatus >= 400) {
    result.status = 'dead';
    result.detail = `HTTP ${httpStatus}`;
    return result;
  }

  if (chain.length && !sameDestination(site.url, finalUrl)) {
    // A permanent redirect to a genuinely different address is the one case
    // worth editing sites.json over.
    result.status = permanent ? 'moved' : 'redirect';
    result.detail = permanent
      ? 'permanently moved, so sites.json should be updated'
      : 'temporary redirect, no action needed';
    return result;
  }

  result.status = 'ok';
  return result;
}

async function runPool(items, worker, concurrency, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      done++;
      onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }

  const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));
  let targets = sites;
  if (options.filter) targets = targets.filter(site => site.url.includes(options.filter) || site.name.toLowerCase().includes(options.filter.toLowerCase()));
  if (Number.isFinite(options.limit)) targets = targets.slice(0, options.limit);

  if (!targets.length) {
    console.error('Nothing matched.');
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  console.log(`Checking ${targets.length} of ${sites.length} URLs, ${options.concurrency} at a time.`);

  const results = await runPool(targets, site => check(site, options), options.concurrency, (done, total) => {
    if (done % 25 === 0 || done === total) process.stdout.write(`\r  ${done}/${total}`);
  });
  process.stdout.write('\n');

  const byStatus = new Map(STATUS_ORDER.map(status => [status, []]));
  for (const result of results) {
    if (!byStatus.has(result.status)) byStatus.set(result.status, []);
    byStatus.get(result.status).push(result);
  }

  const finishedAt = new Date();
  const report = {
    generatedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    checked: results.length,
    ofTotal: sites.length,
    userAgent: USER_AGENT,
    // Spelled out because "42 blocked" means nothing to whoever reads this in
    // three months.
    legend: {
      ok: 'reachable at the URL in sites.json',
      moved: 'permanently redirected somewhere else, so the entry is stale',
      redirect: 'temporarily redirected, nothing to do',
      blocked: 'refused this client (401/403/429), which says nothing about the page',
      dead: 'gone: 404, 410, or a hard connection refusal',
      tls: 'certificate or TLS handshake failure',
      dns: 'hostname does not resolve',
      timeout: `no response within ${options.timeout}ms, twice`,
      error: 'something else, listed in detail'
    },
    counts: Object.fromEntries([...byStatus].filter(([, list]) => list.length).map(([status, list]) => [status, list.length])),
    needsAttention: results.filter(result => BROKEN.has(result.status)),
    results
  };

  const outPath = path.resolve(ROOT, options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('');
  for (const status of STATUS_ORDER) {
    const list = byStatus.get(status) || [];
    if (!list.length) continue;
    console.log(`${status.padEnd(8)} ${String(list.length).padStart(4)}`);
    if (options.only && !options.only.has(status)) continue;
    if (status === 'ok' || status === 'redirect') continue;
    for (const result of list) {
      console.log(`  ${result.name} - ${result.url}`);
      console.log(`      ${result.detail}${result.finalUrl ? ` -> ${result.finalUrl}` : ''}`);
    }
  }

  console.log(`\nReport written to ${path.relative(ROOT, outPath)}`);
  console.log('sites.json was not modified. Nothing here edits editorial data.');

  const broken = report.needsAttention.length;
  if (broken) {
    console.log(`\n${broken} ${broken === 1 ? 'entry needs' : 'entries need'} a human decision.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

// Exported so the tests can drive the classifier against a local server that
// returns each case on demand. Checking 588 real URLs only ever exercises the
// paths the live web happens to hand back that day.
module.exports = { check, classifyError, sameDestination, BROKEN, STATUS_ORDER };
