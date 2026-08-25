'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeMetadata, renderTargets } = require('./lib/metadata');

const root = path.resolve(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only');
const errors = [];

function readJson(file) {
  const target = path.join(root, file);
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return null;
  }
}

function readOptionalJson(file, fallback) {
  return fs.existsSync(path.join(root, file)) ? readJson(file) : fallback;
}

function addError(message) {
  errors.push(message);
}

function validateSchema(value, schema, label) {
  if (!schema) return;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      addError(`${label}: must be an object`);
      return;
    }
    for (const key of schema.required || []) {
      if (!(key in value)) addError(`${label}: missing required ${key}`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties?.[key]) addError(`${label}: unexpected property ${key}`);
      }
    }
    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (key in value) validateSchema(value[key], propertySchema, `${label}.${key}`);
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      addError(`${label}: must be an array`);
      return;
    }
    if (schema.minItems != null && value.length < schema.minItems) addError(`${label}: must contain at least ${schema.minItems} entries`);
    if (schema.maxItems != null && value.length > schema.maxItems) addError(`${label}: must contain at most ${schema.maxItems} entries`);
    if (schema.uniqueItems) {
      const serialized = value.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) addError(`${label}: entries must be unique`);
    }
    value.forEach((item, index) => validateSchema(item, schema.items, `${label}[${index}]`));
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      addError(`${label}: must be a string`);
      return;
    }
    if (schema.minLength != null && value.length < schema.minLength) addError(`${label}: is shorter than ${schema.minLength} characters`);
    if (schema.maxLength != null && value.length > schema.maxLength) addError(`${label}: is longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) addError(`${label}: does not match ${schema.pattern}`);
    if (schema.format === 'uri') {
      try { new URL(value); } catch { addError(`${label}: must be a valid URI`); }
    }
    return;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') addError(`${label}: must be a boolean`);
  if (schema.type === 'integer' && (!Number.isInteger(value) || (schema.minimum != null && value < schema.minimum))) addError(`${label}: must be an integer${schema.minimum != null ? ` >= ${schema.minimum}` : ''}`);
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function slugify(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function canonicalUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) parsed.port = '';
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return null;
  }
}

function validateSourceData() {
  const sites = readJson('sites.json');
  const categories = readJson('categories.json');
  const collections = readOptionalJson('collections.json', []);
  const stars = readOptionalJson('stars.json', {});
  const favicons = readOptionalJson('favicons.json', {});
  const siteSchema = readJson('schemas/site.schema.json');
  const categorySchema = readJson('schemas/category.schema.json');
  const collectionSchema = readJson('schemas/collection.schema.json');

  if (!Array.isArray(sites)) addError('sites.json must be an array');
  if (!Array.isArray(categories)) addError('categories.json must be an array');
  if (!Array.isArray(collections)) addError('collections.json must be an array');
  if (!stars || typeof stars !== 'object' || Array.isArray(stars)) addError('stars.json must be an object');
  if (!favicons || typeof favicons !== 'object' || Array.isArray(favicons)) addError('favicons.json must be an object');

  const categoryNames = new Set();
  const categoryCounts = new Map();
  const urls = new Set();
  const canonicalUrls = new Map();

  (Array.isArray(categories) ? categories : []).forEach((category, index) => {
    const label = `categories[${index}]`;
    validateSchema(category, categorySchema, label);
    if (category?.slug !== slugify(category?.name || '')) addError(`${label}: slug does not match name`);
    if (categoryNames.has(category?.name)) addError(`${label}: duplicate category ${category?.name}`);
    categoryNames.add(category?.name);
    categoryCounts.set(category?.name, 0);
  });

  (Array.isArray(sites) ? sites : []).forEach((site, index) => {
    const label = `sites[${index}] ${site?.name || ''}`.trim();
    validateSchema(site, siteSchema, label);
    const canonical = canonicalUrl(site?.url);
    if (!canonical || !['http:', 'https:'].includes(new URL(site.url).protocol)) addError(`${label}: URL must be http(s)`);
    if (urls.has(site?.url)) addError(`${label}: duplicate URL ${site?.url}`);
    urls.add(site?.url);
    if (canonical && canonicalUrls.has(canonical)) addError(`${label}: canonical URL collides with ${canonicalUrls.get(canonical)}`);
    if (canonical) canonicalUrls.set(canonical, label);
    if (!categoryNames.has(site?.category)) addError(`${label}: unknown category ${site?.category}`);
    categoryCounts.set(site?.category, (categoryCounts.get(site?.category) || 0) + 1);
    if (typeof site?.name === 'string' && (site.name.length > 120 || site.name.trim() !== site.name)) addError(`${label}: name length/whitespace invalid`);
    if (typeof site?.description === 'string' && (site.description.length > 300 || site.description.trim() !== site.description)) addError(`${label}: description length/whitespace invalid`);
    if (!isDate(site?.updatedAt)) addError(`${label}: updatedAt must be YYYY-MM-DD`);
    if (!Array.isArray(site?.tags) || new Set(site.tags).size !== site.tags.length) addError(`${label}: tags must be unique`);
    if (site?.tags?.some(tag => tag.length > 40 || tag.trim() !== tag)) addError(`${label}: tag length/whitespace invalid`);
    if ('lastReviewedAt' in (site || {}) && !isDate(site.lastReviewedAt)) addError(`${label}: lastReviewedAt must be YYYY-MM-DD`);
    if ('dateProvenance' in (site || {}) && !['legacy', 'curated', 'automated'].includes(site.dateProvenance)) addError(`${label}: invalid dateProvenance`);
  });

  (Array.isArray(categories) ? categories : []).forEach((category, index) => {
    const actual = categoryCounts.get(category?.name) || 0;
    if (category?.count !== actual) addError(`categories[${index}] ${category?.name}: count ${category?.count} does not match ${actual}`);
  });

  (Array.isArray(collections) ? collections : []).forEach((collection, index) => {
    const label = `collections[${index}] ${collection?.name || ''}`.trim();
    validateSchema(collection, collectionSchema, label);
    if (collection?.urls?.some(url => !urls.has(url))) addError(`${label}: contains an unknown URL`);
    if (collection?.slug !== slugify(collection?.name || '')) addError(`${label}: slug does not match name`);
  });

  Object.entries(stars || {}).forEach(([repository, record]) => {
    const label = `stars.${repository}`;
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) addError(`${label}: invalid repository key`);
    if (!record || typeof record !== 'object' || Array.isArray(record)) addError(`${label}: must be an object`);
    else {
      for (const key of ['fullName', 'fetchedAt']) if (typeof record[key] !== 'string' || !record[key].trim()) addError(`${label}: missing ${key}`);
      for (const key of ['stars', 'forks', 'openIssues']) if (!Number.isInteger(record[key]) || record[key] < 0) addError(`${label}: invalid ${key}`);
      if (!isTimestamp(record.fetchedAt)) addError(`${label}: invalid fetchedAt`);
    }
  });

  Object.entries(favicons || {}).forEach(([domain, data]) => {
    if (!/^[a-z0-9.-]+$/i.test(domain)) addError(`favicons.${domain}: invalid domain key`);
    if (typeof data !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(data)) addError(`favicons.${domain}: invalid data URI`);
    if (typeof data === 'string' && data.length > 300000) addError(`favicons.${domain}: data URI is too large`);
  });

  return { sites: Array.isArray(sites) ? sites : [], categories: Array.isArray(categories) ? categories : [], collections: Array.isArray(collections) ? collections : [], urls };
}

// The submission form lists categories by hand; when a category is added or
// renamed the dropdown silently keeps offering the old set.
function validateIssueTemplate(data) {
  const templatePath = path.join(root, '.github/ISSUE_TEMPLATE/submit-site.yml');
  if (!fs.existsSync(templatePath)) return;
  const template = fs.readFileSync(templatePath, 'utf8');
  const section = template.match(/label: Category\r?\n\s+options:\r?\n((?:[ \t]+- .+\r?\n)+)/);
  if (!section) {
    addError('.github/ISSUE_TEMPLATE/submit-site.yml: category dropdown not found');
    return;
  }
  const listed = section[1].split(/\r?\n/).map(line => line.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const expected = data.categories.map(category => category.name).sort((a, b) => a.localeCompare(b));
  const missing = expected.filter(name => !listed.includes(name));
  const extra = listed.filter(name => !expected.includes(name));
  if (missing.length) addError(`.github/ISSUE_TEMPLATE/submit-site.yml: category dropdown is missing ${missing.join(', ')}`);
  if (extra.length) addError(`.github/ISSUE_TEMPLATE/submit-site.yml: category dropdown offers unknown ${extra.join(', ')}`);
}

function validateFeeds(data) {
  const feed = readJson('feeds/recent.json');
  const atomPath = path.join(root, 'feeds/recent.atom');
  const atom = fs.existsSync(atomPath) ? fs.readFileSync(atomPath, 'utf8') : '';
  if (!feed || feed.version !== 'https://jsonfeed.org/version/1.1' || !Array.isArray(feed.items)) addError('feeds/recent.json: invalid JSON Feed envelope');
  const expected = [...data.sites].sort((a, b) => (b.lastReviewedAt || b.updatedAt).localeCompare(a.lastReviewedAt || a.updatedAt) || a.name.localeCompare(b.name)).slice(0, 50);
  if (feed?.items?.length !== expected.length) addError(`feeds/recent.json: expected ${expected.length} items, found ${feed?.items?.length}`);
  expected.forEach((site, index) => {
    const item = feed?.items?.[index];
    if (!item || item.id !== site.url || item.url !== site.url || item.title !== site.name || item.date_modified !== `${site.lastReviewedAt || site.updatedAt}T00:00:00Z`) addError(`feeds/recent.json: stale or mismatched item at index ${index} (${site.name})`);
  });
  const atomIds = [...atom.matchAll(/<id>([^<]+)<\/id>/g)].map(match => match[1]).slice(1);
  if (atomIds.length !== expected.length || atomIds.some((id, index) => id !== expected[index].url)) addError('feeds/recent.atom: stale or mismatched entry order');
}

function validateMetadata() {
  let meta;
  try {
    meta = computeMetadata();
  } catch (error) {
    addError(`metadata: ${error.message}`);
    return;
  }
  const { results, problems } = renderTargets(meta);
  problems.forEach(addError);
  results
    .filter(result => result.changed)
    .forEach(result => addError(`${result.file}: version, counts or formatting are out of sync; run npm run generate`));
}

const data = validateSourceData();
validateIssueTemplate(data);
if (!sourceOnly) {
  validateFeeds(data);
  validateMetadata();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${data.sites.length} sites, ${data.categories.length} categories, ${data.collections.length} collections${sourceOnly ? ' (source only)' : ', caches, and feeds'}`);
