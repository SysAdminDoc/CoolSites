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
    heroTagline: `Your personal launchpad. Bookmark what you like, sort it into groups, and go find something new. ${siteCount} picks across ${categoryCount} categories.`,
    readmeTagline: `> A curated directory of ${siteCount} free tools, open source projects, and hidden gems across ${categoryCount} categories, built for sysadmins, devs, creators, homelabbers, and the endlessly curious.`,
    readmeFeature: `- **${siteCount} curated sites** across ${categoryCount} categories, every entry hand-picked and described`,
    readmeClosing: `**[Browse the full directory](https://sysadmindoc.github.io/CoolSites/)** with all ${siteCount} sites.`
  };
}

function replaceOnce(content, pattern, replacement, label, problems) {
  const matches = content.match(new RegExp(pattern.source, `${pattern.flags.replace(/g/g, '')}g`));
  if (!matches || matches.length !== 1) {
    problems.push(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
    return content;
  }
  return content.replace(pattern, replacement);
}

function padCell(value, width) {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function buildCategoryTable(meta, previous) {
  const highlights = new Map();
  for (const line of previous.split('\n')) {
    const cells = line.split('|').map(cell => cell.trim());
    if (cells.length < 5 || !/^\d+$/.test(cells[2])) continue;
    highlights.set(cells[1], cells[3]);
  }
  const rows = meta.categories.map(category => [
    category.name,
    String(category.siteCount),
    highlights.get(category.name) || category.blurb
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
    (_, a, b) => `${a}${copy.metaDescription}${b}`, 'index.html meta description', problems);
  next = replaceOnce(next, /(<meta property="og:description" content=")[^"]*(">)/,
    (_, a, b) => `${a}${copy.socialDescription}${b}`, 'index.html og:description', problems);
  next = replaceOnce(next, /(<meta name="twitter:description" content=")[^"]*(">)/,
    (_, a, b) => `${a}${copy.socialDescription}${b}`, 'index.html twitter:description', problems);
  next = replaceOnce(next, /("@type":"WebSite","name":"CoolSites","url":"[^"]*","description":")[^"]*(")/,
    (_, a, b) => `${a}${copy.metaDescription}${b}`, 'index.html JSON-LD description', problems);
  next = replaceOnce(next, /(<p id="heroTagline">)[^<]*(<\/p>)/,
    (_, a, b) => `${a}${copy.heroTagline}${b}`, 'index.html hero tagline', problems);
  next = replaceOnce(next, /(<meta name="generator" content="CoolSites v)[^"]*(">)/,
    (_, a, b) => `${a}${meta.version}${b}`, 'index.html generator version', problems);
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
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function applyServiceWorker(content, meta, problems) {
  return replaceOnce(content, /(const CACHE_NAME = 'coolsites-v)[^']*(';)/,
    (_, a, b) => `${a}${meta.version}${b}`, 'sw.js cache name', problems);
}

function applyReadme(content, meta, problems) {
  const copy = copyFor(meta);
  let next = content;
  next = replaceOnce(next, /(!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-)[^-]*(-blue\))/,
    (_, a, b) => `${a}${meta.version}${b}`, 'README version badge', problems);
  next = replaceOnce(next, /(!\[Sites\]\(https:\/\/img\.shields\.io\/badge\/sites-)[^-]*(-blueviolet\))/,
    (_, a, b) => `${a}${meta.siteCount}${b}`, 'README sites badge', problems);
  next = replaceOnce(next, /(!\[Categories\]\(https:\/\/img\.shields\.io\/badge\/categories-)[^-]*(-orange\))/,
    (_, a, b) => `${a}${meta.categoryCount}${b}`, 'README categories badge', problems);
  next = replaceOnce(next, /^> .*$/m, () => copy.readmeTagline, 'README tagline', problems);
  next = replaceOnce(next, /^- \*\*\d+ curated sites\*\*.*$/m, () => copy.readmeFeature, 'README site-count feature', problems);
  next = replaceOnce(next, /^\*\*\[Browse the full directory\].*$/m, () => copy.readmeClosing, 'README closing line', problems);

  const tableMatch = next.match(/(## Categories\n\n)([\s\S]*?)(\n\n## )/);
  if (!tableMatch) {
    problems.push('README category table: section not found');
    return next;
  }
  const rendered = `${tableMatch[1]}${buildCategoryTable(meta, tableMatch[2])}${tableMatch[3]}`;
  return next.replace(tableMatch[0], () => rendered);
}

const TARGETS = [
  { file: 'index.html', apply: applyIndexHtml },
  { file: 'manifest.json', apply: applyManifest },
  { file: 'sw.js', apply: applyServiceWorker },
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

module.exports = { computeMetadata, copyFor, renderTargets };
