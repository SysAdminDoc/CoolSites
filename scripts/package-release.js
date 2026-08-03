const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyFile('index.html');
copyFile('sites.json');
copyFile('categories.json');
copyFile('collections.json');
copyFile('stars.json');
copyFile('favicons.json');
copyFile('manifest.json');
copyFile('sw.js');
copyFile('widget.js');
copyFile('LICENSE');
copyDir('fonts');
copyDir('feeds');
copyDir('schemas');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const minified = minifyHtmlOutsideCode(html);
fs.writeFileSync(path.join(dist, `coolsites-v${pkg.version}.min.html`), minified);

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
    min = min.replace(`__COOLSITES_BLOCK_${index}__`, block);
  });
  return `${min}\n`;
}
