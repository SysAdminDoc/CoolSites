'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeMetadata, renderTargets, LEGACY_IMPORT_DATE, MAX_LEGACY_DATED, freshness, hasRealProvenance } = require('./lib/metadata');

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
  // Checked before the type branches, and on its own, because an enum schema
  // carries no "type". Without this an enum was decoration: every value passed,
  // including ones the schema explicitly listed as the only allowed set.
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) addError(`${label}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
    if (schema.type == null) return;
  }
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

// A repository page on one of these is a project's source, so an entry pointing
// at one reads as open source whatever the flag says. Deliberately not matching
// *.github.io or *.pages.dev: those are project sites, not repositories.
const SOURCE_FORGES = new Set([
  'github.com', 'gist.github.com', 'gitlab.com', 'codeberg.org',
  'bitbucket.org', 'git.sr.ht', 'sourceforge.net', 'gitea.com'
]);
// Paths on those hosts that are the site itself rather than somebody's project.
// github.com/apps/dependabot is a listing page, not a repository, and demanding
// a licence note for one would be nonsense.
const NON_REPOSITORY_PATHS = new Set([
  'topics', 'trending', 'marketplace', 'features', 'orgs', 'sponsors', 'explore',
  'apps', 'settings', 'about', 'pricing', 'security', 'collections', 'events',
  'enterprise', 'login', 'join', 'search', 'notifications'
]);

// Measured, not aspirational. After re-encoding at 32px the whole cache is
// about 593KB across 525 domains, so roughly 1.1KB an icon, and the largest
// raster is 3KB. The headroom is for the directory growing, not for one icon
// getting fat: an SVG is exempt from the per-icon cap because rasterising a
// vector to 32px would trade away the thing that makes it worth keeping.
const MAX_ICON_URI_BYTES = 8 * 1024;
const MAX_FAVICON_FILE_BYTES = 700 * 1024;

function forgeRepository(value) {
  try {
    const url = new URL(value);
    if (!SOURCE_FORGES.has(url.hostname.replace(/^www\./, ''))) return null;
    const parts = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    if (NON_REPOSITORY_PATHS.has(parts[0])) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
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

// The declared media type is whatever the server claimed. Check the bytes, or a
// non-image sails through and only fails in the browser, where it can take the
// surrounding UI with it.
function looksLikeImage(dataUri) {
  let bytes;
  try {
    bytes = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
  } catch {
    return false;
  }
  if (bytes.length < 8) return false;
  const head = bytes.subarray(0, 4);
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;  // PNG
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;                     // JPEG
  if (bytes.subarray(0, 3).toString('latin1') === 'GIF') return true;                            // GIF
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF'
    && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return true;                         // WebP
  if (head[0] === 0x00 && head[1] === 0x00 && (head[2] === 0x01 || head[2] === 0x02)) return true; // ICO/CUR
  const text = bytes.subarray(0, 256).toString('utf8');
  if (text.includes('<svg') || text.trimStart().startsWith('<?xml')) return true;                // SVG
  return false;
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
  let legacyDated = 0;
  const projectAddresses = [];

  // tags.json is the whole facet vocabulary. Keeping it in its own file is the
  // point: a new tag becomes a deliberate edit to a shared list instead of a
  // word someone typed into one entry, which is how 586 entries came to carry
  // 836 distinct tags, 639 of them shared by fewer than three sites.
  const tagList = readJson('tags.json');
  const tagVocabulary = new Set(Array.isArray(tagList) ? tagList : []);
  const tagUse = new Map();
  if (!Array.isArray(tagList)) {
    addError('tags.json must be an array of tag names');
  } else {
    if (tagVocabulary.size !== tagList.length) addError('tags.json: duplicate tag');
    const sorted = [...tagList].sort();
    if (tagList.some((tag, index) => tag !== sorted[index])) addError('tags.json must be sorted');
    const byShape = new Map();
    for (const tag of tagList) {
      if (typeof tag !== 'string' || tag.trim() !== tag || !tag.length || tag.length > 40) {
        addError(`tags.json: invalid tag ${JSON.stringify(tag)}`);
        continue;
      }
      // "open source" and "open-source" both shipped, and so did three other
      // pairs. Same word, two records, half the entries under each.
      const shape = tag.toLowerCase().replace(/[-_ ]/g, '');
      if (byShape.has(shape)) addError(`tags.json: ${byShape.get(shape)} and ${tag} are the same tag spelled two ways`);
      else byShape.set(shape, tag);
    }
  }
  // Compared as a plain string against the YYYY-MM-DD the data uses, so a
  // timezone never turns a same-day stamp into a future date.
  const today = new Date().toISOString().slice(0, 10);

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
    if (site?.keywords && new Set(site.keywords).size !== site.keywords.length) addError(`${label}: keywords must be unique`);
    if (site?.keywords?.some(word => word.length > 40 || word.trim() !== word)) addError(`${label}: keyword length/whitespace invalid`);

    // tags is the facet vocabulary and keywords is the descriptive tail. A term
    // in both would be filtered on and searched twice, and it would be unclear
    // which copy is authoritative.
    for (const word of site?.keywords || []) {
      if (site?.tags?.includes(word)) addError(`${label}: ${word} is both a tag and a keyword`);
      if (tagVocabulary.has(word)) addError(`${label}: keyword ${word} is in the tag vocabulary, so it belongs in tags`);
      tagUse.set(word, tagUse.get(word) || 0);
    }
    for (const tag of site?.tags || []) {
      if (!tagVocabulary.has(tag)) addError(`${label}: tag ${tag} is not in tags.json. Add it there if three or more entries share it, otherwise make it a keyword.`);
      tagUse.set(tag, (tagUse.get(tag) || 0) + 1);
    }
    if ('lastReviewedAt' in (site || {}) && !isDate(site.lastReviewedAt)) addError(`${label}: lastReviewedAt must be YYYY-MM-DD`);
    if (site?.updatedAt && site.updatedAt > today) addError(`${label}: updatedAt ${site.updatedAt} is in the future`);
    if (site?.lastReviewedAt && site.lastReviewedAt > today) addError(`${label}: lastReviewedAt ${site.lastReviewedAt} is in the future`);
    // A review is a person confirming the entry still describes the site, so it
    // cannot predate the content change it is supposed to have looked at.
    if (site?.lastReviewedAt && site?.updatedAt && site.lastReviewedAt < site.updatedAt) {
      addError(`${label}: lastReviewedAt ${site.lastReviewedAt} is before updatedAt ${site.updatedAt}`);
    }
    // Everything except the untouched import has to say when someone checked it.
    // Without this the recent sort and the feeds are alphabetical order wearing
    // a timestamp.
    if (site?.updatedAt && site.updatedAt !== LEGACY_IMPORT_DATE && !hasRealProvenance(site)) {
      addError(`${label}: updatedAt is ${site.updatedAt} but there is no lastReviewedAt saying who checked it`);
    }
    if (site?.updatedAt === LEGACY_IMPORT_DATE) legacyDated++;

    // Five entries sat on a source repository declaring openSource false, so the
    // open-source-only filter hid tools whose code is one click away. Saying no
    // to that reading now costs a sentence, which is the right price: the one
    // real exception is source-available under a licence the OSI has not
    // approved, and a reader cannot tell that from the URL.
    if (site?.openSource === false && (forgeRepository(site?.url) || forgeRepository(site?.repository)) && !site?.openSourceNote) {
      addError(`${label}: openSource is false but the entry points at a source repository. Set it true, or say why not in openSourceNote.`);
    }
    if (site?.openSource === true && site?.openSourceNote) {
      addError(`${label}: openSourceNote explains a false openSource, but this entry is true`);
    }

    // A project gets one entry. Two of them were listed twice, once by homepage
    // and once by repository, which inflated the count and showed the same tool
    // twice in any combined view. The repository field is how one entry links
    // both, so it also has to be checked for collisions.
    const repository = canonicalUrl(site?.repository);
    if (site?.repository && !repository) addError(`${label}: repository must be a valid URL`);
    if (repository) {
      if (repository === canonical) addError(`${label}: repository is the same address as url`);
      projectAddresses.push({ label, address: repository, field: 'repository' });
    }
    if (canonical) projectAddresses.push({ label, address: canonical, field: 'url' });
  });

  // Checked after the loop because a collision can run in either direction:
  // entry A's repository may be entry B's url, whichever comes first.
  const seenAddress = new Map();
  for (const entry of projectAddresses) {
    const previous = seenAddress.get(entry.address);
    if (previous && previous.label !== entry.label) {
      addError(`${entry.label}: ${entry.field} ${entry.address} is already listed by ${previous.label} as its ${previous.field}. A project gets one entry.`);
    }
    if (!previous) seenAddress.set(entry.address, entry);
  }

  // A tag nobody shares is a keyword wearing a facet's clothes: it would render
  // a filter that returns one or two entries. The floor is what keeps the
  // vocabulary a browsing structure rather than a second description.
  const TAG_FLOOR = 3;
  for (const tag of tagVocabulary) {
    const used = tagUse.get(tag) || 0;
    if (used < TAG_FLOOR) addError(`tags.json: ${tag} is used by ${used} ${used === 1 ? 'entry' : 'entries'}, fewer than the ${TAG_FLOOR} a facet needs. Move it to keywords, or drop it from tags.json.`);
  }

  // Exact, not a ceiling. Slack between the two is room a new entry could be
  // filed into under the import date, dodging the provenance rule above.
  // npm run review lowers the recorded number as entries get checked.
  if (legacyDated > MAX_LEGACY_DATED) {
    addError(`sites.json: ${legacyDated} entries carry the ${LEGACY_IMPORT_DATE} import date, more than the ${MAX_LEGACY_DATED} on record. A new entry needs a real date and a lastReviewedAt.`);
  } else if (legacyDated < MAX_LEGACY_DATED) {
    addError(`sites.json: ${legacyDated} entries carry the ${LEGACY_IMPORT_DATE} import date but scripts/lib/metadata.js still says ${MAX_LEGACY_DATED}. Lower MAX_LEGACY_DATED to ${legacyDated}.`);
  }

  // Derived by the generator, so this is a drift guard and belongs with the
  // other post-generate checks. Running it in --source-only mode would fail the
  // build before the step that fixes it ever ran.
  if (!sourceOnly) {
    (Array.isArray(categories) ? categories : []).forEach((category, index) => {
      const actual = categoryCounts.get(category?.name) || 0;
      if (category?.count !== actual) addError(`categories[${index}] ${category?.name}: count ${category?.count} does not match ${actual}; run npm run generate`);
    });
  }

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
    if (typeof data !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(data)) {
      addError(`favicons.${domain}: invalid data URI`);
      return;
    }
    // 300KB was a sanity check against a corrupt payload, not a budget. The
    // real cost is that favicons.json ships in full to every reader, so an icon
    // arriving as a multi-resolution .ico or a 180px apple-touch-icon is paid
    // for by everyone. npm run update:favicons re-encodes anything oversized at
    // 32px; these two ceilings are what stops one slipping past it.
    if (data.length > MAX_ICON_URI_BYTES && !data.startsWith('data:image/svg+xml')) {
      addError(`favicons.${domain}: ${(data.length / 1024).toFixed(1)}KB is over the ${(MAX_ICON_URI_BYTES / 1024)}KB per-icon ceiling. Run npm run update:favicons to re-encode it at 32px.`);
    }
    if (!looksLikeImage(data)) addError(`favicons.${domain}: payload is not an image`);
  });

  const faviconBytes = JSON.stringify(favicons || {}).length;
  if (faviconBytes > MAX_FAVICON_FILE_BYTES) {
    addError(`favicons.json is ${(faviconBytes / 1024).toFixed(0)}KB, over the ${(MAX_FAVICON_FILE_BYTES / 1024)}KB ceiling. Every reader downloads this file in full.`);
  }

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
  // Only entries with real provenance. A feed of fifty items where thirty-nine
  // share the import timestamp is not a list of what changed recently.
  const expected = [...data.sites]
    .filter(hasRealProvenance)
    .sort((a, b) => freshness(b).localeCompare(freshness(a)) || a.name.localeCompare(b.name))
    .slice(0, 50);
  if (feed?.items?.length !== expected.length) addError(`feeds/recent.json: expected ${expected.length} items, found ${feed?.items?.length}`);
  expected.forEach((site, index) => {
    const item = feed?.items?.[index];
    if (!item || item.id !== site.url || item.url !== site.url || item.title !== site.name || item.date_modified !== `${freshness(site)}T00:00:00Z`) addError(`feeds/recent.json: stale or mismatched item at index ${index} (${site.name})`);
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

// The project is deliberately dependency-free: no framework, no build step to
// view it, nothing to audit and nothing to lock. That is a decision, not an
// oversight, so it is enforced rather than written down and forgotten. The day
// a real dependency lands, this fails and the lockfile has to land with it.
function validateDependencies() {
  const pkg = readJson('package.json');
  if (!pkg) return;
  const declared = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    .flatMap(field => Object.keys(pkg[field] || {}).map(name => `${field}.${name}`));
  if (!declared.length) return;
  if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
    addError(`package.json declares ${declared.join(', ')} but there is no package-lock.json. `
      + 'A dependency without a lockfile is not reproducible, and npm audit cannot run at all.');
  }
}

const data = validateSourceData();
validateDependencies();
validateIssueTemplate(data);
if (!sourceOnly) {
  validateFeeds(data);
  validateMetadata();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const tagCount = readOptionalJson('tags.json', []).length;
const keywordCount = new Set(data.sites.flatMap(site => site.keywords || [])).size;
console.log(`Validated ${data.sites.length} sites, ${data.categories.length} categories, ${data.collections.length} collections, ${tagCount} tags, ${keywordCount} keywords${sourceOnly ? ' (source only)' : ', caches, and feeds'}`);
