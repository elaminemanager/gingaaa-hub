// Assemble le site généré (dist/) en une seule page autonome, pour le montrer avant la mise en ligne.
// Lancer : node scripts/build.mjs && node scripts/preview.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { p, log } from './lib.mjs';

const dataURI = async (rel) => {
  const buf = await readFile(p('dist', rel));
  const type = rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.png') ? 'image/png' : rel.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
};
const viewId = (path) => {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return 'accueil';
  if (parts[0] === 'rubrique') parts[0] = 'r';
  return parts.join('-');
};

const files = (await readdir(p('dist'), { recursive: true })).filter((f) => f.endsWith('index.html')).sort((a, b) => a.length - b.length);
const cache = new Map();
const inline = async (html) => {
  for (const [, rel] of html.matchAll(/src="\/((?:media|assets\/img)\/[^"]+)"/g)) if (!cache.has(rel)) cache.set(rel, await dataURI(rel));
  return html
    .replace(/src="\/((?:media|assets\/img)\/[^"]+)"/g, (_, rel) => `src="${cache.get(rel)}"`)
    .replace(/<a href="\/feed\.xml">[^<]*<\/a>/g, '')
    .replace(/href="(\/[^"]*)"/g, (_, path) => `href="#${viewId(path)}"`);
};

const index = await readFile(p('dist/index.html'), 'utf8');
const header = await inline(index.match(/<header class="top">[\s\S]*?<\/header>/)[0]);
const footer = await inline(index.match(/<footer class="foot">[\s\S]*?<\/footer>/)[0]);
let views = '';
for (const file of files) {
  const html = await readFile(p('dist', file), 'utf8');
  const id = viewId('/' + file.replace(/index\.html$/, ''));
  views += `<main data-view="${id}"${id === 'accueil' ? '' : ' hidden'}>${await inline(html.match(/<main>([\s\S]*?)<\/main>/)[1])}</main>\n`;
}
const css = (await readFile(p('dist/assets/style.css'), 'utf8')).replace("url('img/motif.png')", `url('${await dataURI('assets/img/motif.png')}')`);
const js = await readFile(p('dist/assets/hub.js'), 'utf8');

const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hub Gingaaa</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
${header}
${views}${footer}
<script>window.GINGAAA_PREVIEW = true;</script>
<script>
${js}
</script>
<script>
(function () {
  function show() {
    var id = (location.hash || '#accueil').slice(1);
    var view = document.querySelector('main[data-view="' + id + '"]') || document.querySelector('main[data-view="accueil"]');
    document.querySelectorAll('main[data-view]').forEach(function (m) { m.hidden = m !== view; });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', show);
  show();
})();
</script>
</body>
</html>
`;
await writeFile(p('preview.html'), page);
log(`aperçu écrit : preview.html (${Math.round(page.length / 1024)} Ko, ${files.length} pages réunies)`);
