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
  const repos = [...new Set(sites.map(site => repoFromUrl(site.url)).filter(Boolean))].sort();
  const fetchedAt = new Date().toISOString();
  let updated = 0;

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
      console.warn(error.message);
    }
  }

  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  console.log(`Updated ${updated}/${repos.length} GitHub star records`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
