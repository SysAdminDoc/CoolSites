'use strict';

// Single source of truth for every user-visible version string and site/category
// count. `generate-assets.js` applies these transforms; `lint-data.js` runs the
// same transforms in memory and fails when the file on disk differs, so the two
// can never drift apart.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

// Provenance. 587 of the original 588 entries carry this one date because they
// arrived in a single bulk import, not because anyone reviewed them that day.
// Treating it as a per-entry review date is what made the "recent" sort and the
// feeds alphabetical tie-breaks dressed up as chronology.
const LEGACY_IMPORT_DATE = '2026-06-25';

// How many entries still carry the import date. Lint requires this to match
// exactly, so it can only go down, and it goes down on its own: npm run review
// lowers it as entries get checked. An approximate ceiling would leave slack
// that a new entry could be filed into, which is the hole this closes.
const MAX_LEGACY_DATED = 555;

// The date a human last actually looked at the entry, as opposed to updatedAt,
// which is when its content changed. Either can be the more recent one.
function freshness(site) {
  return site.lastReviewedAt || site.updatedAt;
}

function hasRealProvenance(site) {
  return Boolean(site.lastReviewedAt);
}

function computeMetadata() {
  const pkg = readJson('package.json');
  const sites = readJson('sites.json');
  const categories = readJson('categories.json');
  const counts = new Map();
  for (const site of sites) counts.set(site.category, (counts.get(site.category) || 0) + 1);
  const active = categories
    .filter(category => counts.get(category.name) > 0)
    .map(category => ({ ...category, siteCount: counts.get(category.name) }))
    .sort((a, b) => b.siteCount - a.siteCount || a.name.localeCompare(b.name));

  return {
    root,
    version: pkg.version,
    siteCount: sites.length,
    categoryCount: active.length,
    categories: active,
    sites
  };
}

function copyFor(meta) {
  const { siteCount, categoryCount } = meta;
  return {
    metaDescription: `A hand-checked directory of ${siteCount} free tools, open source projects, and hidden gems across ${categoryCount} categories.`,
    socialDescription: `${siteCount} hand-checked free tools, open source projects, and hidden gems, sorted into ${categoryCount} categories.`,
    heroTagline: `A hand-picked directory of ${siteCount} free tools and hidden gems across ${categoryCount} categories.`,
    readmeTagline: `> A curated directory of ${siteCount} free tools, open source projects, and hidden gems across ${categoryCount} categories, built for sysadmins, devs, creators, homelabbers, and the endlessly curious.`,
    readmeFeature: `- **${siteCount} curated sites** across ${categoryCount} categories, every entry hand-picked and described`,
    readmeClosing: `**[Browse the full directory](https://sysadmindoc.github.io/CoolSites/)** with all ${siteCount} sites.`
  };
}

const SITE_URL = 'https://sysadmindoc.github.io/CoolSites/';

// The only machine-readable statement of what this site holds. The page renders
// its cards from JSON at runtime, so a crawler reading the HTML sees the shell
// and the noscript notice and nothing else.
//
// The previous block was a WebSite with a SearchAction, which existed to drive
// Google's sitelinks search box. Google retired that on 2024-11-21, so it had
// been describing a feature that no longer exists for the better part of a year.
//
// This lists the categories rather than all 586 entries, because a ListItem is
// supposed to point at a page this site serves and the only such pages are the
// filtered views. Listing 586 addresses belonging to other people under our own
// ItemList would be a claim about pages we do not publish.
function structuredData(meta) {
  const copy = copyFor(meta);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'CoolSites',
    url: SITE_URL,
    description: copy.metaDescription,
    inLanguage: 'en',
    isFamilyFriendly: true,
    license: 'https://opensource.org/licenses/MIT',
    keywords: meta.categories.map(category => category.name).join(', '),
    mainEntity: {
      '@type': 'ItemList',
      name: 'Categories',
      numberOfItems: meta.categoryCount,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      itemListElement: meta.categories.map((category, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: category.name,
        description: category.blurb,
        url: `${SITE_URL}?cat=${encodeURIComponent(category.name)}`
      }))
    }
  };
}

function collectionsStructuredData(meta, collections) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'CoolSites Collections',
    url: `${SITE_URL}collections.html`,
    description: `${collections.length} curated starting points drawn from the ${meta.siteCount} entries in the directory.`,
    inLanguage: 'en',
    isPartOf: { '@type': 'CollectionPage', name: 'CoolSites', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Collections',
      numberOfItems: collections.length,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      // No per-item url: the page has no address for an individual collection,
      // and inventing one would point a crawler at something that does not load.
      itemListElement: collections.map((collection, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: collection.name,
        description: collection.description
      }))
    }
  };
}

// A </script> inside a JSON string would end the block early and put the rest of
// the payload into the document as markup. Nothing here contains one today,
// which is exactly why it would go unnoticed the day something does.
function embedJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function replaceOnce(content, pattern, replacement, label, hint, problems) {
  const matches = content.match(new RegExp(pattern.source, `${pattern.flags.replace(/g/g, '')}g`));
  if (!matches || matches.length !== 1) {
    const found = matches ? matches.length : 0;
    problems.push(`${label}: found ${found} matches, expected exactly 1. ${hint}`);
    return content;
  }
  return content.replace(pattern, replacement);
}

// shields.io reads a single hyphen as a field separator.
function shield(value) {
  return String(value).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
}

// A pipe inside a cell would silently add a column, and the next run would
// re-parse its own broken output and truncate the text.
function cell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function padCell(value, width) {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

// Split on unescaped pipes only, so an escaped pipe inside a cell survives the
// round trip.
function splitRow(line) {
  return line
    .split(/(?<!\\)\|/)
    .map(part => part.replace(/\\\|/g, '|').trim());
}

function buildCategoryTable(meta, previous) {
  const highlights = new Map();
  for (const line of previous.split(/\r?\n/)) {
    const cells = splitRow(line);
    if (cells.length < 5 || !/^\d+$/.test(cells[2])) continue;
    // A hand-typed pipe in the Highlights cell splits the row into more parts
    // than the template writes. Rejoin the tail rather than dropping it, or a
    // regenerate silently truncates someone's prose.
    const tail = cells.slice(3, cells.length - 1).join(' | ');
    highlights.set(cells[1], tail);
  }
  const rows = meta.categories.map(category => [
    cell(category.name),
    String(category.siteCount),
    cell(highlights.get(cell(category.name)) ?? highlights.get(category.name) ?? category.blurb)
  ]);
  const nameWidth = Math.max(8, ...rows.map(row => row[0].length));
  const countWidth = Math.max(5, ...rows.map(row => row[1].length));
  const lines = [
    `| ${padCell('Category', nameWidth)} | ${padCell('Sites', countWidth)} | Highlights |`,
    `|${'-'.repeat(nameWidth + 2)}|:${'-'.repeat(countWidth)}:|-----------|`
  ];
  for (const row of rows) {
    lines.push(`| ${padCell(row[0], nameWidth)} | ${padCell(row[1], countWidth)} | ${row[2]} |`);
  }
  return lines.join('\n');
}

function applyIndexHtml(content, meta, problems) {
  const copy = copyFor(meta);
  let next = content;
  next = replaceOnce(next, /(<meta name="description" content=")[^"]*(">)/,
    (_, a, b) => `${a}${copy.metaDescription}${b}`, 'index.html meta description',
    'There must be exactly one <meta name="description">.', problems);
  next = replaceOnce(next, /(<meta property="og:description" content=")[^"]*(">)/,
    (_, a, b) => `${a}${copy.socialDescription}${b}`, 'index.html og:description',
    'There must be exactly one <meta property="og:description">.', problems);
  next = replaceOnce(next, /(<meta name="twitter:description" content=")[^"]*(">)/,
    (_, a, b) => `${a}${copy.socialDescription}${b}`, 'index.html twitter:description',
    'There must be exactly one <meta name="twitter:description">.', problems);
  next = replaceOnce(next, /(<script type="application\/ld\+json">\n)[\s\S]*?(\n<\/script>)/,
    (_, a, b) => `${a}${embedJson(structuredData(meta))}${b}`, 'index.html structured data',
    'There must be exactly one application/ld+json block, opening and closing on their own lines.', problems);
  next = replaceOnce(next, /(<p id="heroTagline">)[^<]*(<\/p>)/,
    (_, a, b) => `${a}${copy.heroTagline}${b}`, 'index.html hero tagline',
    'The hero paragraph must be a single <p id="heroTagline"> with plain text.', problems);
  next = replaceOnce(next, /(<meta name="generator" content="CoolSites v)[^"]*(">)/,
    (_, a, b) => `${a}${meta.version}${b}`, 'index.html generator version',
    'Keep the <meta name="generator" content="CoolSites vX.Y.Z"> tag.', problems);
  return next;
}

function applyManifest(content, meta, problems) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    problems.push(`manifest.json: ${error.message}`);
    return content;
  }
  manifest.description = copyFor(meta).metaDescription;
  // Note: this also normalises formatting to two-space indent, so a
  // hand-reindented manifest reports as out of sync.
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function applyServiceWorker(content, meta, problems) {
  return replaceOnce(content, /(const CACHE_NAME = 'coolsites-v)[^']*(';)/,
    (_, a, b) => `${a}${meta.version}${b}`, 'sw.js cache name',
    "Keep the line `const CACHE_NAME = 'coolsites-vX.Y.Z';`.", problems);
}

function applyReadme(content, meta, problems) {
  const copy = copyFor(meta);
  let next = content;
  next = replaceOnce(next, /(!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-)[^)]*(-blue\))/,
    (_, a, b) => `${a}${shield(meta.version)}${b}`, 'README version badge',
    'Keep one ![Version](https://img.shields.io/badge/version-X-blue) badge.', problems);
  next = replaceOnce(next, /(!\[Sites\]\(https:\/\/img\.shields\.io\/badge\/sites-)[^)]*(-blueviolet\))/,
    (_, a, b) => `${a}${meta.siteCount}${b}`, 'README sites badge',
    'Keep one ![Sites](https://img.shields.io/badge/sites-N-blueviolet) badge.', problems);
  next = replaceOnce(next, /(!\[Categories\]\(https:\/\/img\.shields\.io\/badge\/categories-)[^)]*(-orange\))/,
    (_, a, b) => `${a}${meta.categoryCount}${b}`, 'README categories badge',
    'Keep one ![Categories](https://img.shields.io/badge/categories-N-orange) badge.', problems);
  next = replaceOnce(next, /^> .*$/m, () => copy.readmeTagline, 'README tagline',
    'The tagline is the only line starting with "> ". Blockquotes elsewhere in the README are not supported.', problems);
  next = replaceOnce(next, /^- \*\*\d+ curated sites\*\*.*$/m, () => copy.readmeFeature, 'README site-count feature',
    'Exactly one feature bullet may start "- **N curated sites**".', problems);
  next = replaceOnce(next, /^\*\*\[Browse the full directory\].*$/m, () => copy.readmeClosing, 'README closing line',
    'Exactly one line may start "**[Browse the full directory]".', problems);

  // Match the table itself rather than everything up to the next heading, so
  // prose that follows the table is left alone.
  const tableMatch = next.match(/(^## Categories\r?\n\r?\n)((?:\|.*(?:\r?\n|$))+)/m);
  if (!tableMatch) {
    problems.push('README category table: no pipe table found directly under the "## Categories" heading.');
    return next;
  }
  const eol = tableMatch[2].includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /(\r?\n)$/.test(tableMatch[2]) ? eol : '';
  const rendered = `${tableMatch[1]}${buildCategoryTable(meta, tableMatch[2]).split('\n').join(eol)}${trailingNewline}`;
  return next.replace(tableMatch[0], () => rendered);
}

function applyCollectionsHtml(content, meta, problems) {
  const collections = readJson('collections.json');
  return replaceOnce(content, /(<script type="application\/ld\+json">\n)[\s\S]*?(\n<\/script>)/,
    (_, a, b) => `${a}${embedJson(collectionsStructuredData(meta, Array.isArray(collections) ? collections : []))}${b}`,
    'collections.html structured data',
    'There must be exactly one application/ld+json block, opening and closing on their own lines.', problems);
}

const TARGETS = [
  { file: 'index.html', apply: applyIndexHtml },
  { file: 'manifest.json', apply: applyManifest },
  { file: 'sw.js', apply: applyServiceWorker },
  { file: 'collections.html', apply: applyCollectionsHtml },
  { file: 'README.md', apply: applyReadme }
];

// Returns [{ file, current, next, changed }] plus any structural problems found.
function renderTargets(meta) {
  const problems = [];
  const results = TARGETS.map(target => {
    const absolute = path.join(root, target.file);
    const current = fs.readFileSync(absolute, 'utf8');
    const next = target.apply(current, meta, problems);
    return { file: target.file, absolute, current, next, changed: current !== next };
  });
  return { results, problems };
}

module.exports = {
  computeMetadata, copyFor, renderTargets,
  LEGACY_IMPORT_DATE, MAX_LEGACY_DATED, freshness, hasRealProvenance
};
