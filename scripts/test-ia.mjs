// Tests de la rédaction par IA, avec un modèle simulé (aucun appel réel, aucune clé nécessaire).
// Lancer : node scripts/test-ia.mjs
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'hub-ia-'));
await cp(join(here, 'config.json'), join(root, 'config.json'));
await mkdir(join(root, 'data'));
process.env.HUB_ROOT = root;
process.env.ANTHROPIC_API_KEY = 'cle-de-test';

const LONG = 'Rema vient de lâcher son nouvel EP, E-Mortal Boy, disponible sur toutes les plateformes. Il retrouve Wizkid sur le titre d’ouverture « Feel Alright ». Le projet compte aussi « Oh No » et « TEA ». La chanteuse Theodora pose sa voix sur « SUGA ». La Côte d’Ivoire et le Sénégal sont cités parmi les pays où le projet démarre fort, avec 3 titres déjà classés. #rema #music';
const item = (id, caption, extra = {}) => ({ id, date: '2026-11-20T10:00:00+0000', kind: 'image', caption, cover: null, sources: [{ network: 'instagram', id, url: 'https://www.instagram.com/p/x/', date: '2026-11-20T10:00:00+0000' }], ...extra });
const store = { items: [
  item('long', LONG),
  item('court', 'Rwanda 0-2 Mali ⚽️ #can2027'),
  item('invente', LONG.replace('Rema', 'Burna')),
  // Article déjà rédigé par une ancienne version des consignes : il doit être repris, sans jamais être dégradé.
  item('ancien', LONG.replace('Rema', 'Tems'), { enriched: 'ai', aiv: 1, title: 'Ancien titre conservé', summary: '', body: ['Ancien texte.'], rubrique: 'music', keywords: [], slug: 'ancien-titre-conserve', indexable: false }),
] };
await writeFile(join(root, 'data/posts.json'), JSON.stringify(store));

const body = ['Rema vient de sortir son nouvel EP, E-Mortal Boy, disponible sur toutes les plateformes. Il y retrouve Wizkid sur le titre d’ouverture, « Feel Alright ».', 'Le projet compte aussi « Oh No » et « TEA ». La chanteuse Theodora pose sa voix sur « SUGA ». Les Ivoiriens et le Sénégal figurent parmi les publics où le projet démarre fort, avec 3 titres déjà classés dès la sortie du projet sur les plateformes.'];
let calls = 0;
globalThis.fetch = async (url, opts) => {
  assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
  assert.equal(opts.headers['x-api-key'], 'cle-de-test');
  calls++;
  const caption = JSON.parse(opts.body).messages[0].content;
  let answer;
  if (caption.includes('Rwanda')) answer = { assez_de_matiere: false, titre: 'Rwanda 0-2 Mali : le score du match', resume: 'Rwanda 0-2 Mali.', paragraphes: [], rubrique: 'sport', mots_cles: ['CAN 2027'] };
  else if (caption.includes('Burna')) answer = { assez_de_matiere: true, titre: 'Burna sort un EP attendu au festival Coachella', resume: '', paragraphes: body.map((x) => x.replace('Rema', 'Burna')), rubrique: 'music', mots_cles: [] };
  else if (caption.includes('Tems')) answer = { assez_de_matiere: true, titre: 'Tems sort un EP en 2031', resume: '', paragraphes: body.map((x) => x.replace('Rema', 'Tems')), rubrique: 'music', mots_cles: [] };
  else answer = { assez_de_matiere: true, titre: 'Rema sort E-Mortal Boy, son nouvel EP avec Wizkid.', resume: 'Rema dévoile E-Mortal Boy.', paragraphes: body, rubrique: 'music', mots_cles: ['Rema'] };
  return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: JSON.stringify(answer) }] }), { status: 200 });
};

const enricher = await import('./enrich.mjs');
const load = async () => Object.fromEntries(JSON.parse(await readFile(join(root, 'data/posts.json'), 'utf8')).items.map((i) => [i.id, i]));

await enricher.run();
let s = await load();
assert.equal(calls, 4);
// Article complet : texte de l'IA, radical "Ivoir" accepté, point final du titre retiré.
assert.equal(s.long.enriched, 'ai'); assert.equal(s.long.title, 'Rema sort E-Mortal Boy, son nouvel EP avec Wizkid'); assert.equal(s.long.body.length, 2); assert.equal(s.long.short, false);
// Légende courte : titre et rubrique de l'IA, texte = légende d'origine, hors index Google.
assert.equal(s.court.enriched, 'ai'); assert.equal(s.court.rubrique, 'sport'); assert.equal(s.court.short, true); assert.deepEqual(s.court.body, ['Rwanda 0-2 Mali ⚽️']); assert.equal(s.court.indexable, false);
// Nom inventé (Coachella) : rejet, version simple en attendant un nouvel essai.
assert.equal(s.invente.enriched, 'basic'); assert.equal(s.invente.tries, 1); assert.ok(s.invente.title.startsWith('Burna vient de lâcher'));
// Chiffre inventé (2031) sur un article déjà rédigé : l'ancienne version reste en place.
assert.equal(s.ancien.title, 'Ancien titre conservé'); assert.equal(s.ancien.enriched, 'ai'); assert.equal(s.ancien.slug, 'ancien-titre-conserve'); assert.equal(s.ancien.tries, 1);

// Passages suivants : seuls les deux rejetés sont retentés, trois essais au maximum, puis plus aucun appel.
await enricher.run(); assert.equal(calls, 6);
await enricher.run(); assert.equal(calls, 8);
await enricher.run(); assert.equal(calls, 8, 'plus aucun appel après trois essais');
s = await load();
assert.equal(s.invente.tries, 3); assert.equal(s.long.title, 'Rema sort E-Mortal Boy, son nouvel EP avec Wizkid');

console.log(`OK : rédaction IA testée (${calls} appels simulés)`);
