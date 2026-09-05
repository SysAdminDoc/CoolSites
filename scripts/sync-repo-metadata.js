'use strict';

// Sets the GitHub repository's description and topics from the same source the
// README badges use.
//
//   node scripts/sync-repo-metadata.js [--check]
//
// scripts/lib/metadata.js guarantees no count can drift inside the repository,
// and lint proves it on every build. Nothing covered anything outside the
// working tree, so the description on GitHub sat at "588 free tools" while
// sites.json held 586, and the first place most people read about this project
// is the one place the guarantee did not reach.
//
// --check reports a difference and exits non-zero without changing anything,
// which is what you want from a hook or before a release.
//
// Needs the gh CLI, authenticated. It is a local curation command like
// npm run update:stars, not part of the build: a build that reaches out and
// mutates something on github.com would be a surprising build.

const { spawnSync } = require('node:child_process');
const { computeMetadata, copyFor } = require('./lib/metadata');

const REPO = 'SysAdminDoc/CoolSites';

// Deliberately hand-written rather than derived. Topics are how someone browsing
// GitHub finds this, and the words they search for are not the words the
// categories happen to be called.
const TOPICS = [
  'awesome-list', 'bookmarks', 'curated', 'curated-list', 'developer-tools',
  'directory', 'foss', 'homelab', 'open-source', 'osint', 'privacy',
  'selfhosted', 'single-file', 'static-site', 'sysadmin', 'tools', 'web-tools'
];

function gh(args, { allowFailure = false } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`gh is not on PATH: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`gh ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function main() {
  const check = process.argv.includes('--check');
  const meta = computeMetadata();
  const copy = copyFor(meta);
  // The README tagline without its blockquote marker: one sentence that already
  // has to stay in step with the data, so it cannot drift from the badges.
  const description = copy.readmeTagline.replace(/^>\s*/, '');

  const current = JSON.parse(gh(['repo', 'view', REPO, '--json', 'description,repositoryTopics']).stdout);
  const currentTopics = (current.repositoryTopics || []).map(topic => topic.name ?? topic).sort();
  const wantedTopics = [...TOPICS].sort();

  const descriptionMatches = current.description === description;
  const topicsMatch = JSON.stringify(currentTopics) === JSON.stringify(wantedTopics);

  if (descriptionMatches && topicsMatch) {
    console.log('GitHub already matches the repository data.');
    return;
  }

  if (!descriptionMatches) {
    console.log(`description:\n  is:     ${current.description || '(none)'}\n  should: ${description}`);
  }
  if (!topicsMatch) {
    console.log(`topics:\n  is:     ${currentTopics.join(', ') || '(none)'}\n  should: ${wantedTopics.join(', ')}`);
  }

  if (check) {
    console.error('\nGitHub is out of step with the repository. Run npm run sync:repo to fix it.');
    process.exitCode = 1;
    return;
  }

  if (!descriptionMatches) gh(['repo', 'edit', REPO, '--description', description]);
  if (!topicsMatch) {
    // gh replaces the whole set only when every existing topic is removed
    // first, so the ones that should go are named explicitly.
    for (const topic of currentTopics.filter(topic => !wantedTopics.includes(topic))) {
      gh(['repo', 'edit', REPO, '--remove-topic', topic]);
    }
    const missing = wantedTopics.filter(topic => !currentTopics.includes(topic));
    if (missing.length) gh(['repo', 'edit', REPO, '--add-topic', missing.join(',')]);
  }
  console.log('\nGitHub updated.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
