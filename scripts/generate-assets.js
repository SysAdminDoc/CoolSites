'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeMetadata, renderTargets, freshness, hasRealProvenance, LEGACY_IMPORT_DATE } = require('./lib/metadata');
const { rewritePolicies } = require('./lib/csp');

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

// Only entries someone has actually reviewed. Most of the directory still
// carries the date of a single bulk import, and publishing forty of those as
// "recently added", all stamped the same second, is alphabetical order with a
// timestamp glued on. A short honest feed beats a long invented one.
const recent = sites
  .filter(hasRealProvenance)
  .sort((a, b) => freshness(b).localeCompare(freshness(a)) || a.name.localeCompare(b.name))
  .slice(0, 50);
const feedUpdated = `${recent[0] ? freshness(recent[0]) : LEGACY_IMPORT_DATE}T00:00:00Z`;

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
    <updated>${freshness(site)}T00:00:00Z</updated>
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
    date_modified: `${freshness(site)}T00:00:00Z`,
    tags: [site.category, ...site.tags, ...(site.keywords || [])],
    _coolsites_category: site.category,
    _coolsites_slug: slug(site.name)
  }))
};

fs.writeFileSync(path.join(feedsDir, 'recent.atom'), atom);
fs.writeFileSync(path.join(feedsDir, 'recent.json'), `${JSON.stringify(jsonFeed, null, 2)}\n`);

// OPML is what the webring and blogroll world reads, and it is the one format
// that lets somebody take this directory somewhere else. Kagi's small-web list
// and the XXIIVV webring both publish one; the attributes here are the subset
// those files actually use rather than everything OPML 2.0 permits.
//
// Grouped by category, because a flat list of 586 outlines is a worse artefact
// than the page it came from. Nothing carries an xmlUrl: these are sites, not
// feeds, and claiming a feed where there is none breaks the reader that trusts
// it.
const opmlCategories = new Map();
for (const site of [...sites].sort((a, b) => a.name.localeCompare(b.name))) {
  if (!opmlCategories.has(site.category)) opmlCategories.set(site.category, []);
  opmlCategories.get(site.category).push(site);
}
const opmlBody = [...opmlCategories.keys()].sort().map(category => {
  const entries = opmlCategories.get(category)
    .map(site => `      <outline type="link" text="${xml(site.name)}" title="${xml(site.name)}" description="${xml(site.description)}" htmlUrl="${xml(site.url)}"/>`)
    .join('\n');
  return `    <outline text="${xml(category)}" title="${xml(category)}">\n${entries}\n    </outline>`;
}).join('\n');
const opml = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head>
    <title>CoolSites</title>
    <dateModified>${xml(new Date(feedUpdated).toUTCString())}</dateModified>
    <ownerName>SysAdminDoc</ownerName>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${opmlBody}
  </body>
</opml>
`;
fs.writeFileSync(path.join(feedsDir, 'directory.opml'), opml);

// Category counts are derived, so derive them. Lint has always verified them,
// which meant anyone adding a site had to hand-edit a number to match, and the
// README claimed the build did it. Now it does, and lint's check becomes a
// drift guard like every other one.
const categories = readJson('categories.json');
const actual = new Map();
for (const site of sites) actual.set(site.category, (actual.get(site.category) || 0) + 1);
let countsChanged = 0;
for (const category of categories) {
  const count = actual.get(category.name) || 0;
  if (category.count !== count) { category.count = count; countsChanged++; }
}
if (countsChanged) {
  fs.writeFileSync(path.join(root, 'categories.json'), `${JSON.stringify(categories, null, 2)}\n`);
}

// A sitemap of two URLs is not much, but the alternative is none, and it is the
// only machine-readable statement of what this site actually serves. lastmod is
// the freshest entry the directory holds rather than the moment the build ran:
// a timestamp that moves because someone regenerated a feed tells a crawler
// nothing and teaches it to stop believing the field.
const sitemapPages = [
  { loc: siteUrl, lastmod: feedUpdated.slice(0, 10) },
  { loc: `${siteUrl}collections.html`, lastmod: feedUpdated.slice(0, 10) }
];
const sitemap = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPages.map(page => `  <url>
    <loc>${xml(page.loc)}</loc>
    <lastmod>${xml(page.lastmod)}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

const meta = computeMetadata();
const { results, problems } = renderTargets(meta);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const rewritten = results.filter(result => result.changed);
for (const result of rewritten) fs.writeFileSync(result.absolute, result.next);

// Last, because the digests have to cover the scripts as they will actually
// ship. Anything that rewrites a script after this point invalidates them, and
// the page stops working rather than failing open, which is the right way round.
const CSP_PAGES = ['index.html', 'collections.html'];
const pageSources = Object.fromEntries(CSP_PAGES.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const csp = rewritePolicies(pageSources);
if (csp.missing.length) {
  console.error(`No content security policy meta tag to update in ${csp.missing.join(', ')}`);
  process.exit(1);
}
let policyChanged = 0;
for (const [file, html] of Object.entries(csp.pages)) {
  if (html === pageSources[file]) continue;
  fs.writeFileSync(path.join(root, file), html);
  policyChanged++;
}

console.log(`Generated feeds for ${recent.length} recent entries`);
if (countsChanged) console.log(`Updated ${countsChanged} category ${countsChanged === 1 ? 'count' : 'counts'}`);
if (policyChanged) console.log(`Updated the content security policy in ${policyChanged} ${policyChanged === 1 ? 'page' : 'pages'} for ${csp.hashes.length} inline scripts`);
console.log(rewritten.length
  ? `Synced v${meta.version}, ${meta.siteCount} sites, ${meta.categoryCount} categories into ${rewritten.map(result => result.file).join(', ')}`
  : `Metadata already in sync (v${meta.version}, ${meta.siteCount} sites, ${meta.categoryCount} categories)`);
