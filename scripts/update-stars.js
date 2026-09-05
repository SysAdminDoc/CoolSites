'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sites = JSON.parse(fs.readFileSync(path.join(root, 'sites.json'), 'utf8'));
const cachePath = path.join(root, 'stars.json');
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const token = process.env.GITHUB_TOKEN || '';

function repoFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    if (['topics', 'trending', 'marketplace', 'features', 'orgs'].includes(parts[0])) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

async function fetchRepo(fullName) {
  const res = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CoolSites-star-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) throw new Error(`${fullName}: ${res.status} ${res.statusText}`);
  return res.json();
}

(async () => {
  // repository wins where it is set: the entry's main link may be the project's
  // own site while the code still lives on GitHub.
  const repos = [...new Set(sites.map(site => repoFromUrl(site.repository || site.url)).filter(Boolean))].sort();
  const known = new Set(repos.map(fullName => fullName.toLowerCase()));
  const fetchedAt = new Date().toISOString();
  let updated = 0;
  let failed = 0;

  if (!token) {
    console.warn('No GITHUB_TOKEN set; the unauthenticated API allows 60 requests an hour.');
  }

  for (const fullName of repos) {
    try {
      const repo = await fetchRepo(fullName);
      cache[fullName.toLowerCase()] = {
        fullName,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        fetchedAt
      };
      updated++;
    } catch (error) {
      failed++;
      console.warn(error.message);
      // Stop early rather than burning through the list once the quota is gone.
      if (/\b(403|429)\b/.test(error.message)) {
        console.error('Rate limited by the GitHub API; stopping and keeping what was fetched.');
        break;
      }
    }
  }

  // A site can leave the directory; its cached record should leave with it.
  let pruned = 0;
  for (const key of Object.keys(cache)) {
    if (!known.has(key)) { delete cache[key]; pruned++; }
  }

  const ordered = Object.fromEntries(Object.keys(cache).sort().map(key => [key, cache[key]]));
  fs.writeFileSync(cachePath, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`Updated ${updated}/${repos.length} GitHub star records (${failed} failed, ${pruned} stale removed)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
