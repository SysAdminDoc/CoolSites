'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hashesFor, styleHashesFor } = require('./lib/csp');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyFile('index.html');
copyFile('collections.html');
copyFile('sites.json');
copyFile('categories.json');
copyFile('collections.json');
copyFile('stars.json');
copyFile('favicons.json');
copyFile('manifest.json');
copyFile('sw.js');
copyFile('widget.js');
copyFile('LICENSE');
copyFile('robots.txt');
copyFile('sitemap.xml');
copyFile('social-card.png');
copyDir('fonts');
copyDir('feeds');
copyDir('schemas');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const minified = minifyHtmlOutsideCode(html);
fs.writeFileSync(path.join(dist, `coolsites-v${pkg.version}.min.html`), minified);

if (minified.includes('__COOLSITES_BLOCK_')) {
  throw new Error('Minified output still contains block placeholders');
}

// The minifier lifts script and style blocks out whole and puts them back
// untouched, so the digests in the policy should survive it. "Should" is not
// good enough for a policy that fails closed: if a future change to the
// minifier so much as reindents a script, the packaged build would ship a page
// whose own JavaScript the browser refuses to run, and the only symptom is a
// blank screen. So the packaged file is checked against itself.
for (const [file, html] of [[`coolsites-v${pkg.version}.min.html`, minified], ['index.html', fs.readFileSync(path.join(dist, 'index.html'), 'utf8')], ['collections.html', fs.readFileSync(path.join(dist, 'collections.html'), 'utf8')]]) {
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  if (!policy) throw new Error(`${file} has no content security policy`);
  const listed = new Set((policy[1].match(/'sha256-[^']+'/g) || []));
  for (const [what, extract] of [['script', hashesFor], ['stylesheet', styleHashesFor]]) {
    const orphaned = extract(html).filter(hash => !listed.has(hash));
    if (orphaned.length) {
      throw new Error(`${file} contains ${orphaned.length} inline ${what}(s) the policy does not allow. The browser would refuse them. Run npm run generate before packaging.`);
    }
  }
}

console.log(`Packaged CoolSites v${pkg.version} in ${dist}`);

function copyFile(file) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) return;
  const target = path.join(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(src, target);
}

function copyDir(dir) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, path.join(dist, dir), { recursive: true });
}

function minifyHtmlOutsideCode(input) {
  const blocks = [];
  const protectedHtml = input.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, match => {
    const token = `__COOLSITES_BLOCK_${blocks.length}__`;
    blocks.push(match);
    return token;
  });
  let min = protectedHtml
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
  blocks.forEach((block, index) => {
    const token = `__COOLSITES_BLOCK_${index}__`;
    if (!min.includes(token)) throw new Error(`Minifier lost ${token}`);
    min = min.replace(token, () => block);
  });
  return `${min}\n`;
}
