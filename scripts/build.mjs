// Étape 3 : génère le site statique dans dist/ à partir de data/posts.json.
import { writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readJSON, p, esc, frDate, NETWORKS, wordCount, hashtags, log } from './lib.mjs';

const cfg = await readJSON('config.json');
const SITE = (process.env.SITE_URL || cfg.site_url).replace(/\/$/, '');
const BASE = cfg.base_path.replace(/\/$/, '');
const url = (path) => `${BASE}${path}`;
const abs = (path) => `${SITE}${BASE}${path}`;
const rub = (slug) => cfg.rubriques.find((r) => r.slug === slug) || cfg.rubriques[0];
const PRIORITY = ['youtube', 'instagram', 'tiktok', 'facebook'];
const primary = (item) => [...item.sources].sort((a, b) => PRIORITY.indexOf(a.network) - PRIORITY.indexOf(b.network))[0];
const postPath = (item) => `/p/${item.slug}/`;
const enc = encodeURIComponent;
let USED_RUBS = [];

// Contenu phare : la publication récente marquée du hashtag prévu (#alaune), sinon la plus récente.
function pickLead(items) {
  const tag = (cfg.featured_hashtag || '').toLowerCase();
  const pinned = tag && items.slice(0, 12).find((i) => hashtags(i.caption).includes(tag));
  return pinned || items[0];
}

const rubNav = (current) => USED_RUBS.length ? `<nav class="rubs" aria-label="Rubriques">
    ${USED_RUBS.map((r) => `<a href="${url(`/rubrique/${r.slug}/`)}" style="--rub:${r.color}"${current === r.slug ? ' aria-current="page"' : ''}>${esc(r.name)}</a>`).join('\n    ')}
  </nav>` : '';

async function out(rel, content) {
  await mkdir(dirname(p('dist', rel)), { recursive: true });
  await writeFile(p('dist', rel), content);
}

// Visuel de remplacement quand une publication n'a pas d'image récupérable.
function coverSVG(item) {
  const r = rub(item.rubrique);
  let seed = [...item.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let shapes = '';
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rnd() * 760), y = Math.round(rnd() * 720), s = 40 + Math.round(rnd() * 90);
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) shapes += `<rect x="${x}" y="${y}" width="${s}" height="${Math.round(s * (0.5 + rnd()))}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="10"/>`;
    else if (kind === 1) shapes += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#000" fill-opacity=".14"/><rect x="${x + s * 0.3}" y="${y + s * 0.3}" width="${s * 0.4}" height="${s * 0.4}" fill="${r.color}"/>`;
    else shapes += `<path d="M${x} ${y}h${s}M${x} ${y + 18}h${s}M${x} ${y + 36}h${s}" stroke="#000" stroke-opacity=".22" stroke-width="9"/>`;
  }
  const lines = [];
  for (const w of r.name.toUpperCase().replace(' ?', '\u00a0?').split(' ')) {
    if (lines.length && (lines.at(-1) + ' ' + w).length <= 12) lines[lines.length - 1] += ' ' + w;
    else lines.push(w);
  }
  // Taille calculée pour que la ligne la plus longue tienne dans la largeur du visuel.
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(128, Math.floor(690 / (longest * 0.6)));
  const startY = 940 - (lines.length - 1) * size;
  const text = lines.map((l, i) => `<text x="52" y="${startY + i * size}" font-size="${size}" textLength="${l.length * size * 0.56 > 696 ? 696 : ''}" lengthAdjust="spacingAndGlyphs">${esc(l)}</text>`).join('').replace(/ textLength="" lengthAdjust="spacingAndGlyphs"/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="${r.color}"/>${shapes}<path d="M0 ${startY - size - 40}L800 ${startY - size - 110}V1000H0Z" fill="#0D0D0D"/><g font-family="Impact,'Arial Narrow','Helvetica Neue',Arial,sans-serif" font-weight="900" font-style="italic" fill="#F5F0E8">${text}</g></svg>`;
}

const shareLinks = (title, link) => [
  { key: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${title} ${link}`)}` },
  { key: 'fb', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}` },
  { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(link)}` },
  { key: 'tg', label: 'Telegram', href: `https://t.me/share/url?url=${enc(link)}&text=${enc(title)}` },
];

function layout({ title, description, path, image, type = 'website', robots, jsonld, body, cls = '', current }) {
  const follow = Object.entries(cfg.accounts).filter(([, v]) => v)
    .map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${NETWORKS[k].name}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="${cfg.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(path))}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<meta property="og:site_name" content="${esc(cfg.site_name)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(abs(path))}">
<meta property="og:image" content="${esc(abs(image || '/assets/img/partage.png'))}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${url('/assets/img/icon.png')}">
<link rel="apple-touch-icon" href="${url('/assets/img/icon.png')}">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.site_name)}" href="${url('/feed.xml')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${url('/assets/style.css')}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body class="${cls}">
<header class="top">
  <div class="top-row">
    <a class="brand" href="${url('/')}"><img src="${url('/assets/img/logo.png')}" width="560" height="204" alt="${esc(cfg.site_name)}"></a>
    <nav class="follow" aria-label="Nous suivre">${follow}</nav>
  </div>
  ${rubNav(current)}
</header>
<main>
${body}
</main>
<footer class="foot">
  <p>${esc(cfg.tagline)}</p>
  <nav aria-label="Comptes Gingaaa">${follow}<a href="${url('/feed.xml')}">Flux RSS</a></nav>
  <p class="legal">© ${new Date().getFullYear()} ${esc(cfg.site_name)}. Les vidéos sont lues depuis leur plateforme d'origine.</p>
</footer>
<script src="${url('/assets/hub.js')}" defer></script>
</body>
</html>
`;
}

function card(item, covers) {
  const r = rub(item.rubrique);
  const nets = item.sources.map((s) => s.network);
  const link = url(postPath(item));
  const wa = shareLinks(item.title, abs(postPath(item)))[0];
  return `<article class="card" data-net="${nets.join(' ')}" style="--rub:${r.color}">
  <a class="card-media${item.kind === 'video' ? ' is-video' : ''}" href="${link}" tabindex="-1" aria-hidden="true"><img src="${url('/' + covers.get(item.id))}" alt="" loading="lazy" width="800" height="1000"></a>
  <div class="card-body">
    <p class="card-meta"><a class="tag" href="${url(`/rubrique/${r.slug}/`)}"><span>${esc(r.name)}</span></a><time datetime="${item.date}">${frDate(item.date, cfg.timezone, true)}</time></p>
    <h2><a href="${link}">${esc(item.title)}</a></h2>
    <p class="card-nets">${nets.map((n) => NETWORKS[n].name).join(' · ')}</p>
    <a class="btn btn-wa" href="${esc(wa.href)}" target="_blank" rel="noopener">Partager sur WhatsApp</a>
  </div>
</article>`;
}

function pager(basePath, page, pages) {
  if (pages < 2) return '';
  const href = (n) => url(n === 1 ? basePath : `${basePath}page/${n}/`);
  return `<nav class="pager" aria-label="Pages">
  ${page > 1 ? `<a class="btn" href="${href(page - 1)}">Plus récents</a>` : '<span></span>'}
  <span>Page ${page} sur ${pages}</span>
  ${page < pages ? `<a class="btn" href="${href(page + 1)}">Plus anciens</a>` : '<span></span>'}
</nav>`;
}

const demoNote = (demo) => demo ? '<p class="demo">Aperçu avec des contenus d\'exemple. Les vraies publications prendront leur place dès la connexion des comptes.</p>\n' : '';

const chips = (list) => {
  const nets = Object.keys(NETWORKS).filter((n) => list.some((i) => i.sources.some((s) => s.network === n)));
  if (nets.length < 2) return '';
  return `<div class="chips" role="group" aria-label="Filtrer par réseau">
    <button type="button" class="chip is-on" data-filter="all">Tous</button>
    ${nets.map((n) => `<button type="button" class="chip" data-filter="${n}">${NETWORKS[n].name}</button>`).join('\n    ')}
  </div>`;
};

// Accueil : pas de titre de page, le contenu phare ouvre directement, suivi du fil puis des rubriques.
function home({ items, covers, demo }) {
  if (!items.length) return `<h1 class="sr-only">${esc(cfg.site_name)}</h1><p class="empty">Les premières publications arrivent.</p>`;
  const lead = pickLead(items);
  const r = rub(lead.rubrique);
  const link = url(postPath(lead));
  const wa = shareLinks(lead.title, abs(postPath(lead)))[0];
  const latest = items.filter((i) => i !== lead).slice(0, cfg.home_latest || 12);
  const sections = USED_RUBS.map((x) => ({ r: x, list: items.filter((i) => i.rubrique === x.slug) })).filter((x) => x.list.length >= 2);
  return `<h1 class="sr-only">${esc(cfg.site_name)} : ${esc(cfg.tagline)}</h1>
<section class="lead" style="--rub:${r.color}" aria-label="À la une">
  <a class="lead-media${lead.kind === 'video' ? ' is-video' : ''}" href="${link}" tabindex="-1" aria-hidden="true"><img src="${url('/' + covers.get(lead.id))}" alt="" width="800" height="1000"></a>
  <div class="lead-body">
    <p class="card-meta"><a class="tag" href="${url(`/rubrique/${r.slug}/`)}"><span>${esc(r.name)}</span></a><time datetime="${lead.date}">${frDate(lead.date, cfg.timezone)}</time></p>
    <h2><a href="${link}">${esc(lead.title)}</a></h2>
    <p class="lead-text">${esc(lead.body[0] || lead.summary || '')}</p>
    <div class="lead-actions">
      <a class="btn btn-go" href="${link}">${lead.kind === 'video' ? 'Regarder' : 'Lire la suite'}</a>
      <a class="btn btn-wa" href="${esc(wa.href)}" target="_blank" rel="noopener">Partager sur WhatsApp</a>
    </div>
    <p class="card-nets">${lead.sources.map((s) => NETWORKS[s.network].name).join(' · ')}</p>
  </div>
</section>
${demoNote(demo)}${latest.length ? `<section class="block">
  <div class="block-head"><h2>Dernières publications</h2>${chips(latest)}</div>
  <div class="grid">
${latest.map((i) => card(i, covers)).join('\n')}
  </div>
  <p class="empty" hidden>Aucune publication de ce réseau ici.</p>
  ${items.length - 1 > latest.length ? `<p class="center"><a class="btn" href="${url('/toutes/')}">Toutes les publications</a></p>` : ''}
</section>` : ''}
${sections.map(({ r: x, list }) => `<section class="block" style="--rub:${x.color}">
  <div class="block-head"><h2><a href="${url(`/rubrique/${x.slug}/`)}">${esc(x.name)}</a></h2><a class="more-link" href="${url(`/rubrique/${x.slug}/`)}">Tout voir</a></div>
  <div class="rail">
${list.slice(0, 10).map((i) => card(i, covers)).join('\n')}
  </div>
</section>`).join('\n')}`;
}

// Pages de liste : une rubrique, ou l'ensemble des publications.
function listing({ items, covers, current, title, count, basePath, page, pages, demo }) {
  return `${demoNote(demo)}<section class="page-head"${current ? ` style="--rub:${current.color}"` : ''}>
  <h1>${esc(current ? current.name : title)}</h1>
  <p class="count">${count} publication${count > 1 ? 's' : ''}</p>
</section>
<section class="block">
  <div class="block-head">${chips(items)}</div>
  <div class="grid">
${items.map((i) => card(i, covers)).join('\n')}
  </div>
  <p class="empty" hidden>Aucune publication de ce réseau sur cette page.</p>
</section>
${pager(basePath, page, pages)}`;
}

function article(item, covers, all) {
  const r = rub(item.rubrique);
  const main = primary(item);
  const link = abs(postPath(item));
  const cover = url('/' + covers.get(item.id));
  const label = item.kind === 'video' ? 'Lire la vidéo' : item.kind === 'carousel' ? 'Voir le carrousel' : '';
  const media = label
    ? `<div class="player" data-net="${main.network}" data-embed="${esc(main.embed || '')}" data-url="${esc(main.url)}" style="--ratio:${main.ratio || '4/5'}">
    <img src="${cover}" alt="" width="800" height="1000">
    <button type="button" class="play">${label}</button>
  </div>`
    : `<div class="player is-image" style="--ratio:${main.ratio || '4/5'}"><img src="${cover}" alt="" width="800" height="1000"></div>`;
  const related = all.filter((i) => i !== item && i.rubrique === item.rubrique).concat(all.filter((i) => i !== item && i.rubrique !== item.rubrique)).slice(0, 4);
  return `<article class="post" style="--rub:${r.color}">
  <p class="eyebrow"><a href="${url('/')}">Tous les contenus</a></p>
  <p class="card-meta"><a class="tag" href="${url(`/rubrique/${r.slug}/`)}"><span>${esc(r.name)}</span></a><time datetime="${item.date}">${frDate(item.date, cfg.timezone)}</time></p>
  <h1>${esc(item.title)}</h1>
  <div class="post-cols">
  ${media}
  <div class="post-side">
    <div class="post-text">
${item.body.map((x) => `      <p>${esc(x)}</p>`).join('\n')}
    </div>
    <div class="share" aria-label="Partager">
      <h2>Faites tourner</h2>
      <div class="share-row">
        ${shareLinks(item.title, link).map((s) => `<a class="btn btn-${s.key}" href="${esc(s.href)}" target="_blank" rel="noopener">${s.label}</a>`).join('\n        ')}
        <button type="button" class="btn" data-copy="${esc(link)}">Copier le lien</button>
        <button type="button" class="btn" data-share="${esc(link)}" data-title="${esc(item.title)}" hidden>Autres applis</button>
      </div>
    </div>
    <p class="origin">Publication d'origine : ${item.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${NETWORKS[s.network].name}</a>`).join(', ')}</p>
  </div>
  </div>
</article>
<section class="more">
  <h2>À voir aussi</h2>
  <div class="grid">
${related.map((i) => card(i, covers)).join('\n')}
  </div>
</section>`;
}

export async function run() {
  const store = await readJSON('data/posts.json', { items: [] });
  const items = store.items.filter((i) => i.slug && i.title).sort((a, b) => new Date(b.date) - new Date(a.date));
  await rm(p('dist'), { recursive: true, force: true });
  await mkdir(p('dist/assets/img'), { recursive: true });
  await mkdir(p('dist/media'), { recursive: true });
  await cp(p('src/style.css'), p('dist/assets/style.css'));
  await cp(p('src/hub.js'), p('dist/assets/hub.js'));
  await cp(p('src/img'), p('dist/assets/img'), { recursive: true });

  // Images : seules celles encore utilisées partent en ligne.
  const covers = new Map();
  for (const item of items) {
    if (item.cover) {
      await cp(p(item.cover), p('dist', item.cover));
      covers.set(item.id, item.cover);
    } else {
      const rel = `media/gen_${item.id.replace(/[^\w-]/g, '')}.svg`;
      await out(rel, coverSVG(item));
      covers.set(item.id, rel);
    }
  }

  USED_RUBS = cfg.rubriques.filter((r) => items.some((i) => i.rubrique === r.slug));
  const per = cfg.per_page;
  const paginate = async (list, basePath, make) => {
    const pages = Math.max(1, Math.ceil(list.length / per));
    for (let n = 1; n <= pages; n++) {
      const path = n === 1 ? basePath : `${basePath}page/${n}/`;
      await out(`${path}index.html`.replace(/^\//, ''), make(list.slice((n - 1) * per, n * per), n, pages, path));
    }
  };

  await out('index.html', layout({
    title: `${cfg.site_name} : ${cfg.tagline}`, description: cfg.description, path: '/',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.site_name, url: abs('/'), description: cfg.description, sameAs: Object.values(cfg.accounts).filter(Boolean) },
    body: home({ items, covers, demo: store.demo }),
  }));

  await paginate(items, '/toutes/', (slice, n, pages, path) => layout({
    title: `Toutes les publications ${cfg.site_name}${n > 1 ? `, page ${n}` : ''}`, description: cfg.description, path,
    body: listing({ items: slice, covers, title: 'Toutes les publications', count: items.length, basePath: '/toutes/', page: n, pages, demo: store.demo }),
  }));

  for (const r of USED_RUBS) {
    const list = items.filter((i) => i.rubrique === r.slug);
    await paginate(list, `/rubrique/${r.slug}/`, (slice, n, pages, path) => layout({
      title: `${r.name} : les publications ${cfg.site_name}${n > 1 ? `, page ${n}` : ''}`,
      description: `Toutes les publications ${cfg.site_name} de la rubrique ${r.name}, à lire et à partager.`, path, current: r.slug,
      body: listing({ items: slice, covers, current: r, count: list.length, basePath: `/rubrique/${r.slug}/`, page: n, pages, demo: store.demo }),
    }));
  }

  for (const item of items) {
    const image = '/' + covers.get(item.id);
    const description = item.summary || item.body.join(' ').slice(0, 155);
    await out(`p/${item.slug}/index.html`, layout({
      title: `${item.title} | ${cfg.site_name}`, description, path: postPath(item), type: 'article',
      image: image.endsWith('.svg') ? null : image,
      robots: item.indexable ? null : 'noindex,follow', cls: 'is-post',
      jsonld: {
        '@context': 'https://schema.org', '@type': 'Article', headline: item.title, description,
        datePublished: item.date, image: [abs(image)], mainEntityOfPage: abs(postPath(item)),
        articleSection: rub(item.rubrique).name, keywords: (item.keywords || []).join(', '), wordCount: wordCount(item.body.join(' ')),
        author: { '@type': 'Organization', name: cfg.site_name, url: abs('/') },
        publisher: { '@type': 'Organization', name: cfg.site_name, logo: { '@type': 'ImageObject', url: abs('/assets/img/logo.png') } },
        sameAs: item.sources.map((s) => s.url),
      },
      body: article(item, covers, items),
    }));
  }

  // Plan du site, flux RSS, robots, page d'erreur, réglages serveur.
  const indexable = items.filter((i) => i.indexable);
  const rubPaths = cfg.rubriques.filter((r) => items.some((i) => i.rubrique === r.slug)).map((r) => `/rubrique/${r.slug}/`);
  await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/toutes/', ...rubPaths].map((x) => `  <url><loc>${esc(abs(x))}</loc></url>`).join('\n')}
${indexable.map((i) => `  <url><loc>${esc(abs(postPath(i)))}</loc><lastmod>${i.date.slice(0, 10)}</lastmod></url>`).join('\n')}
</urlset>
`);
  await out('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(cfg.site_name)}</title><link>${esc(abs('/'))}</link><description>${esc(cfg.description)}</description><language>fr</language>
${items.slice(0, 30).map((i) => `<item><title>${esc(i.title)}</title><link>${esc(abs(postPath(i)))}</link><guid>${esc(abs(postPath(i)))}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><description>${esc(i.summary || i.body[0] || '')}</description></item>`).join('\n')}
</channel></rss>
`);
  await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
  await out('404.html', layout({
    title: `Page introuvable | ${cfg.site_name}`, description: cfg.description, path: '/404.html', robots: 'noindex',
    body: `<section class="page-head notfound"><p class="eyebrow">Erreur 404</p><h1>Cette page a bougé</h1><p class="lede">La publication a peut-être été retirée. <a href="${url('/')}">Retour à tous les contenus</a>.</p></section>`,
  }));
  await out('.htaccess', `# Hub Gingaaa : réglages Apache (Hostinger)
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
ErrorDocument 404 ${url('/404.html')}
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml application/xml text/xml
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 10 minutes"
  ExpiresByType text/css "access plus 1 day"
  ExpiresByType application/javascript "access plus 1 day"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
`);

  const files = await readdir(p('dist'), { recursive: true });
  log(`site généré : ${items.length} mini articles (${indexable.length} proposés à Google), ${files.length} fichiers`);
  return { items: items.length, indexable: indexable.length };
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
