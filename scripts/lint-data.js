const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sites = readJson('sites.json');
const categories = readJson('categories.json');
const collections = readOptionalJson('collections.json', []);

const errors = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function readOptionalJson(file, fallback) {
  const target = path.join(root, file);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : fallback;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function slugify(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function requireString(obj, key, label) {
  if (typeof obj[key] !== 'string' || obj[key].trim() === '') {
    errors.push(`${label}: missing non-empty ${key}`);
  }
}

if (!Array.isArray(sites)) errors.push('sites.json must be an array');
if (!Array.isArray(categories)) errors.push('categories.json must be an array');

const categoryNames = new Set();
const categoryCounts = new Map();
const urls = new Set();

categories.forEach((category, index) => {
  const label = `categories[${index}]`;
  requireString(category, 'name', label);
  requireString(category, 'slug', label);
  requireString(category, 'className', label);
  requireString(category, 'color', label);
  requireString(category, 'blurb', label);
  if (category.slug !== slugify(category.name)) errors.push(`${label}: slug does not match name`);
  if (!/^#[0-9a-fA-F]{6}$/.test(category.color || '')) errors.push(`${label}: invalid color`);
  if (!Number.isInteger(category.count) || category.count < 1) errors.push(`${label}: invalid count`);
  if (categoryNames.has(category.name)) errors.push(`${label}: duplicate category ${category.name}`);
  categoryNames.add(category.name);
  categoryCounts.set(category.name, 0);
});

sites.forEach((site, index) => {
  const label = `sites[${index}] ${site?.name || ''}`.trim();
  requireString(site, 'name', label);
  requireString(site, 'url', label);
  requireString(site, 'description', label);
  requireString(site, 'category', label);
  try {
    const parsed = new URL(site.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`${label}: URL must be http(s)`);
  } catch {
    errors.push(`${label}: invalid URL ${site.url}`);
  }
  if (urls.has(site.url)) errors.push(`${label}: duplicate URL ${site.url}`);
  urls.add(site.url);
  if (!categoryNames.has(site.category)) errors.push(`${label}: unknown category ${site.category}`);
  categoryCounts.set(site.category, (categoryCounts.get(site.category) || 0) + 1);
  if (typeof site.openSource !== 'boolean') errors.push(`${label}: openSource must be boolean`);
  if (typeof site.requiresAuth !== 'boolean') errors.push(`${label}: requiresAuth must be boolean`);
  if (!isDate(site.updatedAt)) errors.push(`${label}: updatedAt must be YYYY-MM-DD`);
  if (!Array.isArray(site.tags) || site.tags.length === 0) errors.push(`${label}: tags must be a non-empty array`);
  if (site.tags?.some(tag => typeof tag !== 'string' || !tag.trim())) errors.push(`${label}: tags must be non-empty strings`);
  if ('editorsPick' in site && typeof site.editorsPick !== 'boolean') errors.push(`${label}: editorsPick must be boolean`);
  if ('alternativeTo' in site) {
    if (!Array.isArray(site.alternativeTo)) errors.push(`${label}: alternativeTo must be an array`);
    else if (site.alternativeTo.some(item => typeof item !== 'string' || !item.trim())) errors.push(`${label}: alternativeTo values must be non-empty strings`);
  }
});

categories.forEach((category, index) => {
  const actual = categoryCounts.get(category.name) || 0;
  if (category.count !== actual) errors.push(`categories[${index}] ${category.name}: count ${category.count} does not match ${actual}`);
});

collections.forEach((collection, index) => {
  const label = `collections[${index}] ${collection?.name || ''}`.trim();
  requireString(collection, 'name', label);
  requireString(collection, 'slug', label);
  requireString(collection, 'description', label);
  if (!Array.isArray(collection.urls) || collection.urls.length < 2) errors.push(`${label}: urls must contain at least two entries`);
  collection.urls?.forEach(url => {
    if (!urls.has(url)) errors.push(`${label}: unknown URL ${url}`);
  });
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${sites.length} sites, ${categories.length} categories, ${collections.length} collections`);
