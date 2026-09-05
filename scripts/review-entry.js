'use strict';

// Stamps entries as reviewed today. Run it after you have actually opened the
// site and confirmed the entry still describes it, which is the whole point of
// the field: without it, lint has no way to tell a checked record from one that
// has sat untouched since the import.
//
//   node scripts/review-entry.js <url-or-name> [more...]
//   node scripts/review-entry.js --url https://example.com --changed
//
//   --changed   the entry's own text changed too, so move updatedAt as well
//   --date <d>  stamp a specific YYYY-MM-DD instead of today
//   --list      show what still carries the bulk-import date
//
// Matching is exact on URL first, then case-insensitive on name. An ambiguous
// name is an error rather than a guess, because writing the wrong record here
// is a lie about provenance that nothing downstream can catch.

const fs = require('node:fs');
const path = require('node:path');
const { LEGACY_IMPORT_DATE } = require('./lib/metadata');

const ROOT = path.resolve(__dirname, '..');
const SITES = path.join(ROOT, 'sites.json');

function parseArgs(argv) {
  const options = { targets: [], changed: false, date: new Date().toISOString().slice(0, 10), list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--changed') { options.changed = true; continue; }
    if (arg === '--list') { options.list = true; continue; }
    if (arg === '--date') { options.date = argv[++i]; continue; }
    if (arg === '--url' || arg === '--name') { options.targets.push(argv[++i]); continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    options.targets.push(arg);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error('--date must be YYYY-MM-DD');
  if (options.date > new Date().toISOString().slice(0, 10)) throw new Error('--date cannot be in the future');
  return options;
}

function findEntry(sites, target) {
  const exact = sites.filter(site => site.url === target);
  if (exact.length === 1) return exact[0];
  const byName = sites.filter(site => site.name.toLowerCase() === target.toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`"${target}" matches ${byName.length} entries. Use the URL instead.`);
  throw new Error(`No entry matches "${target}".`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(SITES, 'utf8');
  const sites = JSON.parse(raw);

  if (options.list) {
    const legacy = sites.filter(site => site.updatedAt === LEGACY_IMPORT_DATE);
    console.log(`${legacy.length} of ${sites.length} entries still carry the ${LEGACY_IMPORT_DATE} import date.`);
    console.log(`${sites.length - legacy.length} have been reviewed since.`);
    return;
  }

  if (options.help || !options.targets.length) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 17).map(line => line.replace(/^\/\/ ?/, '')).join('\n'));
    if (!options.targets.length && !options.help) process.exitCode = 1;
    return;
  }

  const touched = [];
  try {
    for (const target of options.targets) {
      const entry = findEntry(sites, target);
      entry.lastReviewedAt = options.date;
      // updatedAt is when the entry's own text changed, so it only moves when
      // the caller says it did. A review that found nothing to change must not
      // pretend the record was rewritten.
      if (options.changed) entry.updatedAt = options.date;
      if (entry.lastReviewedAt < entry.updatedAt) {
        throw new Error(`${entry.name}: a review on ${options.date} cannot predate its updatedAt of ${entry.updatedAt}. Pass --changed if the entry itself changed.`);
      }
      touched.push(entry);
    }
  } catch (error) {
    console.error(error.message);
    console.error('Nothing was written.');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(SITES, `${JSON.stringify(sites, null, 2)}\n`);
  for (const entry of touched) {
    console.log(`${entry.name}: reviewed ${entry.lastReviewedAt}${options.changed ? `, updated ${entry.updatedAt}` : ''}`);
  }

  // Lint requires the recorded number to match exactly, because slack between
  // the two is room a new entry could be filed into under the import date. Keep
  // it tight here rather than making every reviewer remember.
  const remaining = sites.filter(site => site.updatedAt === LEGACY_IMPORT_DATE).length;
  const metadataPath = path.join(ROOT, 'scripts', 'lib', 'metadata.js');
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const recorded = /const MAX_LEGACY_DATED = (\d+);/.exec(metadata);
  if (!recorded) {
    console.error('Could not find MAX_LEGACY_DATED in scripts/lib/metadata.js. Update it by hand to ' + remaining + '.');
    process.exitCode = 1;
  } else if (Number(recorded[1]) !== remaining) {
    fs.writeFileSync(metadataPath, metadata.replace(recorded[0], `const MAX_LEGACY_DATED = ${remaining};`));
    console.log(`Unreviewed entries: ${recorded[1]} -> ${remaining}`);
  }

  console.log(`\n${touched.length} ${touched.length === 1 ? 'entry' : 'entries'} stamped. Run npm run build to refresh the feeds.`);
}

if (require.main === module) main();

module.exports = { findEntry, parseArgs };
