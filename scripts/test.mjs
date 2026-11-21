// Tests du pipeline avec des réponses simulées des quatre plateformes (aucun appel réseau réel).
// Lancer : node scripts/test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'hub-test-'));
await cp(join(here, 'config.json'), join(root, 'config.json'));
await cp(join(here, 'src'), join(root, 'src'), { recursive: true });
process.env.HUB_ROOT = root;
Object.assign(process.env, {
  META_PAGE_TOKEN: 't', IG_ACCESS_TOKEN: 'EAtest', FB_PAGE_ID: '2', YOUTUBE_CHANNEL_ID: 'UCx',
  TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's', TIKTOK_REFRESH_TOKEN: 'r1', SITE_URL: 'https://test.example',
});
delete process.env.ANTHROPIC_API_KEY;

const LONG = 'Le thiéboudienne est inscrit au patrimoine immatériel depuis 2021. On vous explique ce que ce classement change pour les cuisinières, pour les restaurants et pour tous ceux qui partagent le bol chaque midi. Une reconnaissance pour un savoir-faire transmis de génération en génération, bien plus qu\'une simple recette figée dans un livre, avec ses variantes selon les familles et les régions du pays.';
const day = (d, h = 10) => `2026-11-${String(d).padStart(2, '0')}T${h}:00:00+0000`;

let ig = [
  { id: 'ig1', caption: `${LONG} #cuisine #gingaaa`, media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn.test/ig1.jpg', permalink: 'https://www.instagram.com/reel/AAA/', timestamp: day(10) },
  { id: 'ig2', caption: 'Grand jeu concours : gagnez deux places pour le concert ! #music', media_type: 'IMAGE', media_url: 'https://cdn.test/ig2.jpg', permalink: 'https://www.instagram.com/p/BBB/', timestamp: day(9) },
  { id: 'ig3', caption: 'Coulisses du tournage, rien à relayer ici. #nohub', media_type: 'IMAGE', media_url: 'https://cdn.test/ig3.jpg', permalink: 'https://www.instagram.com/p/CCC/', timestamp: day(8) },
  { id: 'ig4', caption: 'Nouveau clip dispo ! #music', media_type: 'IMAGE', media_url: 'https://cdn.test/ig4.jpg', permalink: 'https://www.instagram.com/p/DDD/', timestamp: day(9, 15) },
];
const fb = [
  { id: 'fb1', message: LONG, created_time: day(10, 11), permalink_url: 'https://www.facebook.com/x/posts/1', full_picture: 'https://cdn.test/fb1.jpg', status_type: 'added_video', attachments: { data: [{ media_type: 'video' }] } },
  { id: 'fb2', message: 'Repartage', created_time: day(9), permalink_url: 'https://www.facebook.com/x/posts/2', status_type: 'shared_story' },
];
const tt = [{ id: 'tt1', video_description: `${LONG} #fyp`, create_time: Date.parse(day(10, 12)) / 1000, cover_image_url: 'https://cdn.test/tt1.jpg', share_url: 'https://www.tiktok.com/@g/video/tt1', duration: 60 }];
const yt = `<feed><entry><yt:videoId>yt1</yt:videoId><title>Créer du contenu avec son téléphone &amp; trois outils</title><published>2026-11-11T08:00:00+00:00</published><media:group><media:description>Trois applications testées pour écrire, monter et sous-titrer.</media:description></media:group></entry></feed>`;

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); calls.push(url);
  const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.includes('youtube.com/feeds')) return new Response(yt, { status: 200 });
  if (url.startsWith('https://graph.facebook.com/17841419212294972/media') && url.includes('access_token=EAtest')) return json({ data: ig });
  if (url.startsWith('https://graph.instagram.com/me/media') && url.includes('access_token=IGold')) return json({ data: ig });
  if (url.includes('/2/posts')) return json({ data: fb });
  if (url.includes('oauth/token')) return json({ access_token: 'a', refresh_token: 'r2' });
  if (url.includes('video/list')) { assert.equal(opts.headers.authorization, 'Bearer a'); return json({ data: { videos: tt } }); }
  if (url.startsWith('https://cdn.test/') || url.includes('ytimg.com')) return new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  throw new Error(`appel inattendu : ${url}`);
};

const fetcher = await import('./fetch.mjs');
const enricher = await import('./enrich.mjs');
const builder = await import('./build.mjs');
const load = async () => JSON.parse(await readFile(join(root, 'data/posts.json'), 'utf8'));
const exists = (rel) => access(join(root, rel)).then(() => true, () => false);

// 1. Premier passage : dédoublonnage, exclusions, repartages ignorés.
let res = await fetcher.run();
let store = await load();
assert.equal(store.items.length, 3, 'thieb fusionné + clip + vidéo YouTube');
const thieb = store.items.find((i) => i.caption.includes('thiéboudienne'));
assert.deepEqual(thieb.sources.map((s) => s.network).sort(), ['facebook', 'instagram', 'tiktok'], 'une seule fiche pour trois réseaux');
assert.ok(!store.items.some((i) => /concours|nohub|Repartage/i.test(i.caption)), 'exclusions appliquées');
assert.equal(res.added, 3); assert.equal(res.merged, 2);
assert.ok(await exists(thieb.cover), 'image de couverture enregistrée');
assert.equal(await readFile(join(root, '.rotated/TIKTOK_REFRESH_TOKEN'), 'utf8'), 'r2', 'nouveau jeton TikTok mis de côté');

// 2. Rédaction sans clé IA : version simple, page courte non proposée à Google.
await enricher.run();
store = await load();
const t = store.items.find((i) => i.caption.includes('thiéboudienne'));
assert.equal(t.rubrique, 'cuisine'); assert.equal(t.indexable, true); assert.ok(t.slug.startsWith('le-thieboudienne'));
const clip = store.items.find((i) => i.caption.includes('clip'));
assert.equal(clip.rubrique, 'music'); assert.equal(clip.indexable, false, 'légende trop courte : hors index');
assert.ok(!JSON.stringify(store.items.map((i) => [i.title, i.body])).match(/[–—]/), 'aucun tiret long');

// 3. Contrôles automatiques des textes IA.
const ok = { titre: 'Le thiéboudienne au patrimoine immatériel : ce que ça change', paragraphes: [LONG, 'Ce classement reconnaît un savoir-faire transmis de génération en génération, pas une recette figée.'], rubrique: 'cuisine' };
assert.equal(enricher.check(ok, LONG), null);
assert.match(enricher.check({ ...ok, paragraphes: [LONG.replace('2021', '2019'), ok.paragraphes[1]] }, LONG), /chiffre absent/);
assert.match(enricher.check({ ...ok, paragraphes: [LONG + ' Selon Aminata, tout a changé.', ok.paragraphes[1]] }, LONG), /nom absent/);
assert.match(enricher.check({ ...ok, rubrique: 'inventee' }, LONG), /rubrique/);

// 4. Génération du site.
await builder.run();
const home = await readFile(join(root, 'dist/index.html'), 'utf8');
assert.ok(home.includes(`/p/${t.slug}/`) && home.includes('wa.me'));
const page = await readFile(join(root, `dist/p/${t.slug}/index.html`), 'utf8');
assert.ok(page.includes('https://test.example/p/') && page.includes('application/ld+json') && !page.includes('noindex'));
assert.ok((await readFile(join(root, `dist/p/${clip.slug}/index.html`), 'utf8')).includes('noindex,follow'));
const map = await readFile(join(root, 'dist/sitemap.xml'), 'utf8');
assert.ok(map.includes(t.slug) && !map.includes(clip.slug), 'plan du site : pages indexables seulement');

// 5. Deuxième passage : rien en double, puis suppression synchronisée.
res = await fetcher.run();
assert.equal(res.added + res.merged + res.removed, 0, 'passage identique sans effet');
ig = ig.filter((m) => m.id !== 'ig4');
res = await fetcher.run();
store = await load();
assert.equal(res.removed, 1); assert.ok(!store.items.some((i) => i.caption.includes('clip')), 'publication supprimée retirée du hub');
assert.equal(store.items.find((i) => i.caption.includes('thiéboudienne')).slug, t.slug, 'adresse stable');

console.log(`OK : tous les tests passent (${calls.length} appels simulés)`);
