'use strict';

// Reads sites.json and reports on every URL in it. By default it writes nothing
// back: deciding what to do about a dead entry is an editorial call, not
// something a script should make at three in the morning.
//
// --write records what the check saw, which is a different thing from deciding
// what it means. It stamps linkStatus and lastCheckedAt on each entry it
// actually checked, so the page can tell a reader when a link was last known to
// work. It still never removes, repoints or rewords anything.
//
//   node scripts/check-links.js [options]
//
//   --out <path>          where to write the JSON report (default work/link-check.json)
//   --write               record linkStatus and lastCheckedAt back into sites.json
//   --concurrency <n>     parallel requests (default 8)
//   --timeout <ms>        per-attempt timeout (default 15000)
//   --filter <text>       only check URLs containing this text
//   --limit <n>           stop after this many entries
//   --only <status,...>   print only these statuses in the console summary
//   --recheck             include entries marked checkDisabled
//
// Exit code is 0 unless something is actually broken: a page that is gone for
// everyone, a TLS failure, or a hostname that no longer resolves. A redirect, a
// rate-limited host or a server having a bad day does not fail a routine check.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

// Long enough that a slow homelab project does not read as dead, short enough
// that 588 entries still finish in a couple of minutes.
const DEFAULTS = { concurrency: 8, timeout: 15000, out: path.join('work', 'link-check.json') };
// Browsers allow 20. Stopping at 10 turned a long but working chain into a
// reported error, which is a false alarm rather than a finding.
const MAX_HOPS = 20;
const RETRY_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

// A polite, honest identifier. Some hosts still refuse it, which is what the
// "blocked" status is for.
const USER_AGENT = 'CoolSites-link-check (+https://github.com/SysAdminDoc/CoolSites)';

// Used only to re-ask after a failure, to find out whether the page is actually
// gone or the host just dislikes scripts. Never used for the first request:
// pretending to be a browser by default would hide exactly the bot walls this
// is supposed to surface.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Cloudflare's 52x range describes the edge failing to reach the origin. That
// is an outage or a shield, never evidence that a page was removed.
const EDGE_STATUSES = new Set([520, 521, 522, 523, 524, 525, 526, 527, 530]);

const STATUS_ORDER = ['dead', 'tls', 'dns', 'timeout', 'error', 'blocked', 'moved', 'redirect', 'ok'];

// Only these mean "a human needs to edit sites.json". Everything else is
// informational: a 403 from a bot wall says nothing about whether the page is
// still there, and treating it as a dead link is how good entries get deleted.
// dns belongs here because a hostname that stopped resolving is the commonest
// form of link rot there is.
const BROKEN = new Set(['dead', 'tls', 'dns']);

// Writing the report over the directory's own data would make a liar of every
// promise in this file. --out is a path from the command line, so it gets
// checked rather than trusted.
const PROTECTED_FILES = new Set([
  'sites.json', 'categories.json', 'collections.json', 'stars.json',
  'favicons.json', 'package.json', 'package-lock.json', 'index.html', 'collections.html'
]);

function parseArgs(argv) {
  const options = { ...DEFAULTS, filter: null, limit: Infinity, only: null, write: false, recheck: false };
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
      case '--write': options.write = true; break;
      case '--recheck': options.recheck = true; break;
      case '--help': case '-h': options.help = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    }
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be a positive integer');
  if (!Number.isInteger(options.timeout) || options.timeout < 1000) throw new Error('--timeout must be at least 1000');
  // Was silently ignored, so a typo checked all 588 URLs instead of the 5 asked for.
  if (options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
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
  // A refusal or an unreachable host is a strong signal, though still only a
  // candidate: check() re-asks as a browser before calling anything dead.
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return { status: 'dead', detail: code };
  }
  // A reset mid-stream is what shields and flaky links do. It is not evidence
  // that anything was removed, and it cost PuTTY a false "dead" once already.
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') {
    return { status: 'error', detail: `${code}, which is usually transient` };
  }
  return { status: 'error', detail: code || cause.message || String(error) };
}

async function attempt(url, method, timeout, userAgent = USER_AGENT) {
  return fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': userAgent,
      // Some hosts serve a bot wall to clients that do not look like browsers.
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
}

// Walks the redirect chain by hand so the final URL, the hop count and whether
// the move was permanent are all visible. redirect: 'follow' throws that away.
async function walk(startUrl, method, timeout, userAgent = USER_AGENT) {
  const chain = [];
  let current = startUrl;
  let permanent = true;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const response = await attempt(current, method, timeout, userAgent);
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400) {
      // 304 is not a redirect, and a 3xx with no Location is one no browser can
      // follow. Either way it is not a healthy link, so say so rather than
      // falling through and reporting the 3xx as ok.
      if (!location) return { response, finalUrl: current, chain, permanent, noLocation: true };
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
    const host = url => url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url => url.pathname.replace(/\/$/, '');
    // Sorted, because a redirect that only reorders query parameters lands in
    // the same place and is not worth sending anyone to edit sites.json over.
    const query = url => [...url.searchParams].sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]))
      .map(pair => pair.join('=')).join('&');
    // Protocol and port are part of the destination: an https to http downgrade
    // and a move to another port are both real changes.
    return first.protocol === second.protocol
      && first.port === second.port
      && host(first) === host(second)
      && path(first) === path(second)
      && query(first) === query(second);
  } catch {
    return a === b;
  }
}

// Only ever runs to downgrade a failure to "blocked". It has to be strict about
// where the browser landed: a parked domain, or any site with a redirecting 404
// handler, answers every path with a 200 on its homepage, and accepting that
// would mean nothing is ever reported dead again.
async function looksAliveToABrowser(url, timeout) {
  try {
    const walked = await walk(url, 'GET', timeout, BROWSER_USER_AGENT);
    if (!walked.response || !walked.response.ok) return false;
    return sameDestination(url, walked.finalUrl);
  } catch {
    return false;
  }
}

async function check(site, options) {
  const record = { name: site.name, category: site.category, url: site.url };
  let walked;

  try {
    walked = await walk(site.url, 'HEAD', options.timeout);
    // Plenty of hosts refuse HEAD outright while serving GET fine, and they do
    // it with 404s and 400s as well as the obvious 405. Any unhappy HEAD is a
    // reason to ask again properly rather than a verdict.
    const unresolved = !walked.response || !walked.response.ok || walked.noLocation;
    if (unresolved && !walked.loop && !walked.tooManyHops) {
      walked = await walk(site.url, 'GET', options.timeout);
    }
  } catch (firstError) {
    try {
      walked = await walk(site.url, 'GET', options.timeout);
    } catch (secondError) {
      const classified = classifyError(secondError);
      // A timeout on both attempts is still only a timeout. Calling it dead
      // would delete entries for anything slow.
      if (classified.status === 'dead' && await looksAliveToABrowser(site.url, options.timeout)) {
        return { ...record, status: 'blocked', detail: `${classified.detail} for a script, but a browser gets a page` };
      }
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

  if (walked.noLocation) {
    result.status = 'error';
    result.detail = `HTTP ${httpStatus} with no Location header, so the redirect goes nowhere`;
    return result;
  }
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
    result.status = 'blocked';
    result.detail = `HTTP ${httpStatus}, which usually means a bot wall rather than a missing page`;
    return result;
  }
  if (EDGE_STATUSES.has(httpStatus)) {
    // The edge could not reach the origin. Says nothing about the page.
    result.status = 'error';
    result.detail = `HTTP ${httpStatus} from the CDN edge, so the origin is unreachable rather than the page removed`;
    return result;
  }
  if (httpStatus >= 400) {
    // Ask again as a browser before deciding anything. Bot walls answer scripts
    // with 404s and 503s as readily as with 403s, and this runs before the 5xx
    // branch on purpose: a shield under load is the exact case that used to
    // slip through as a plain server error.
    if (await looksAliveToABrowser(site.url, options.timeout)) {
      result.status = 'blocked';
      result.detail = `HTTP ${httpStatus} for a script, but a browser gets the same page, so this is a bot wall`;
      return result;
    }
    // Only 404 and 410 actually mean the page is gone. A 5xx is a broken
    // server, a 400 or a 451 is a refusal, and none of them are grounds for
    // deleting an entry, so they are reported without failing the run.
    if (httpStatus === 404 || httpStatus === 410) {
      result.status = 'dead';
      result.detail = `HTTP ${httpStatus}`;
      return result;
    }
    result.status = 'error';
    result.detail = httpStatus >= 500
      ? `HTTP ${httpStatus}, a server error rather than a removed page`
      : `HTTP ${httpStatus}, which is a refusal rather than a removed page`;
    return result;
  }

  if (chain.length && !sameDestination(site.url, finalUrl)) {
    // Some permanent redirects are the right answer and repointing at them
    // would be worse. Six entries here land on a locale or marketing path:
    // tools.pdf24.org sends an English reader to /en/ and a German one to /de/,
    // so storing either would pick a language for everybody. acceptedRedirect
    // is a curator saying "I looked at this one, it is fine", and it names the
    // destination so the exemption stops applying the day the move changes.
    if (site.acceptedRedirect && sameDestination(site.acceptedRedirect, finalUrl)) {
      result.status = 'ok';
      result.detail = `redirects to ${finalUrl}, which was reviewed and accepted`;
      return result;
    }
    // A permanent redirect to a genuinely different address is the one case
    // worth editing sites.json over.
    result.status = permanent ? 'moved' : 'redirect';
    result.detail = permanent
      ? site.acceptedRedirect
        ? `permanently moved to ${finalUrl}, which is not the accepted ${site.acceptedRedirect}`
        : 'permanently moved, so sites.json should be updated'
      : 'temporary redirect, no action needed';
    return result;
  }

  result.status = 'ok';
  return result;
}

// Records what the check saw. Deliberately narrow: linkStatus is an observation
// and lastCheckedAt is when it was made. Neither is a decision about the entry,
// and removing, repointing or rewording one still belongs to a person.
//
// lastCheckedAt is not lastReviewedAt. A check says the URL answered. A review
// says someone opened the page and confirmed the entry still describes it. They
// are kept apart so a scheduled run cannot launder itself into a claim that
// somebody looked.
function writeBack(sites, results, startedAt) {
  const checkedAt = startedAt.toISOString().slice(0, 10);
  const byUrl = new Map(results.map(result => [result.url, result]));
  let changed = 0;

  for (const index of sites.keys()) {
    const site = sites[index];
    const result = byUrl.get(site.url);
    if (!result) continue;

    // Rebuilt rather than assigned into, so the two fields stay together at the
    // end of the record instead of wherever a previous run left them.
    const next = {};
    for (const [key, value] of Object.entries(site)) {
      if (key === 'linkStatus' || key === 'lastCheckedAt') continue;
      next[key] = value;
    }
    next.linkStatus = result.status;
    next.lastCheckedAt = checkedAt;
    if (JSON.stringify(next) !== JSON.stringify(site)) changed++;
    sites[index] = next;
  }

  const sitesPath = path.join(ROOT, 'sites.json');
  const original = fs.readFileSync(sitesPath, 'utf8');
  fs.writeFileSync(sitesPath, `${JSON.stringify(sites, null, 2)}\n`);

  // A run that writes something the lint rejects leaves the repository broken
  // for whoever pulls next, so put it back rather than hope someone notices.
  const lint = spawnSync(process.execPath, ['scripts/lint-data.js', '--source-only'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) {
    fs.writeFileSync(sitesPath, original);
    console.error('\nRefusing to keep the write: lint rejected the result, so sites.json has been restored.');
    console.error(lint.stdout || lint.stderr);
    process.exitCode = 1;
    return false;
  }
  console.log(`\nRecorded linkStatus and lastCheckedAt on ${changed} ${changed === 1 ? 'entry' : 'entries'}.`);
  return true;
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
    // Reads the header comment until it ends, rather than a line count that
    // silently truncated the help the moment the header grew.
    const header = [];
    for (const line of fs.readFileSync(__filename, 'utf8').split('\n').slice(2)) {
      if (!line.startsWith('//')) break;
      header.push(line.replace(/^\/\/ ?/, ''));
    }
    console.log(header.join('\n').trimEnd());
    return;
  }

  const sites = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));
  let targets = sites;
  if (options.filter) targets = targets.filter(site => site.url.includes(options.filter) || site.name.toLowerCase().includes(options.filter.toLowerCase()));

  // Some hosts refuse every automated request no matter how politely it asks.
  // checkDisabled is how a curator says "I looked by hand, it is fine, stop
  // reporting it", and skipping is only honest if the run says what it skipped.
  const skipped = options.recheck ? [] : targets.filter(site => site.checkDisabled);
  if (!options.recheck) targets = targets.filter(site => !site.checkDisabled);
  if (Number.isFinite(options.limit)) targets = targets.slice(0, options.limit);

  if (!targets.length) {
    console.error('Nothing matched.');
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  console.log(`Checking ${targets.length} of ${sites.length} URLs, ${options.concurrency} at a time.`);
  for (const site of skipped) {
    console.log(`  skipping ${site.name}: ${site.checkDisabled === true ? 'checkDisabled is set' : site.checkDisabled}`);
  }

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
  if (PROTECTED_FILES.has(path.basename(outPath)) && path.dirname(outPath) === ROOT) {
    console.error(`Refusing to write the report over ${path.basename(outPath)}. Pick another --out path.`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  const wrote = options.write ? writeBack(sites, results, startedAt) : false;

  console.log('');
  for (const status of STATUS_ORDER) {
    const list = byStatus.get(status) || [];
    if (!list.length) continue;
    console.log(`${status.padEnd(8)} ${String(list.length).padStart(4)}`);
    // Without --only the healthy statuses are counted but not listed. With it,
    // the flag decides entirely, so --only ok can actually show them.
    const listed = options.only ? options.only.has(status) : (status !== 'ok' && status !== 'redirect');
    if (!listed) continue;
    for (const result of list) {
      console.log(`  ${result.name} - ${result.url}`);
      console.log(`      ${result.detail}${result.finalUrl ? ` -> ${result.finalUrl}` : ''}`);
    }
  }

  console.log(`\nReport written to ${path.relative(ROOT, outPath)}`);
  console.log(wrote
    ? 'sites.json now records what this run saw. No entry was removed, repointed or reworded: that is still an editorial call.'
    : 'sites.json was not modified. Nothing here edits editorial data.' + (options.write ? '' : ' Pass --write to record what was seen.'));

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
module.exports = { check, classifyError, sameDestination, writeBack, BROKEN, STATUS_ORDER };
