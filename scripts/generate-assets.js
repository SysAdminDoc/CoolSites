const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const feedsDir = path.join(root, 'feeds');
fs.mkdirSync(feedsDir, { recursive: true });

const pkg = readJson('package.json');
const sites = readJson('sites.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slug(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const siteUrl = 'https://sysadmindoc.github.io/CoolSites/';
const recent = [...sites]
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name))
  .slice(0, 50);
const feedUpdated = `${recent[0]?.updatedAt || '2026-06-25'}T00:00:00Z`;

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>CoolSites Recently Added</title>
  <id>${siteUrl}feeds/recent.atom</id>
  <link href="${siteUrl}" rel="alternate"/>
  <link href="${siteUrl}feeds/recent.atom" rel="self"/>
  <updated>${feedUpdated}</updated>
  <generator version="${xml(pkg.version)}">CoolSites</generator>
${recent.map(site => `  <entry>
    <title>${xml(site.name)}</title>
    <id>${xml(site.url)}</id>
    <link href="${xml(site.url)}"/>
    <updated>${site.updatedAt}T00:00:00Z</updated>
    <category term="${xml(site.category)}"/>
    <summary>${xml(site.description)}</summary>
  </entry>`).join('\n')}
</feed>
`;

const jsonFeed = {
  version: 'https://jsonfeed.org/version/1.1',
  title: 'CoolSites Recently Added',
  home_page_url: siteUrl,
  feed_url: `${siteUrl}feeds/recent.json`,
  description: 'Recently added and updated CoolSites directory entries.',
  items: recent.map(site => ({
    id: site.url,
    url: site.url,
    title: site.name,
    summary: site.description,
    date_modified: `${site.updatedAt}T00:00:00Z`,
    tags: [site.category, ...site.tags],
    _coolsites_category: site.category,
    _coolsites_slug: slug(site.name)
  }))
};

fs.writeFileSync(path.join(feedsDir, 'recent.atom'), atom);
fs.writeFileSync(path.join(feedsDir, 'recent.json'), `${JSON.stringify(jsonFeed, null, 2)}\n`);
console.log(`Generated feeds for ${recent.length} recent entries`);
