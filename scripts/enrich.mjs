// Étape 2 : transforme chaque publication en mini article (titre, texte, rubrique).
// Avec une clé ANTHROPIC_API_KEY, la rédaction est faite par IA sous règles strictes.
// Sans clé, ou si le texte produit est rejeté par les contrôles, une version simple est utilisée.
import { readJSON, writeJSON, slugify, noDash, cleanCaption, hashtags, wordCount, log } from './lib.mjs';

const cfg = await readJSON('config.json');
const KEY = process.env.ANTHROPIC_API_KEY;
const RUBS = cfg.rubriques;
const MAX_TRIES = 3;
// À augmenter quand les consignes de rédaction changent : tous les articles sont alors repris une fois.
const AI_VERSION = 2;

const SYSTEM = `Tu rédiges les mini articles du site de Gingaaa, média digital panafricain basé à Dakar. Ton vif, chaleureux, direct, en français.
À partir de la légende d'une publication de Gingaaa sur les réseaux sociaux, tu produis un mini article pour le site.

Règles absolues :
1. Tu n'utilises QUE les informations présentes dans la légende. Aucun fait, nom, chiffre, date, lieu ou citation ajouté, même si tu les connais.
2. Tu reformules et tu structures, tu n'inventes rien. Si la légende pose une question sans y répondre, tu ne réponds pas à sa place.
3. Aucune phrase de remplissage : chaque phrase apporte une information de la légende. Un texte court et dense vaut mieux qu'un texte allongé.
4. Aucun tiret long ni tiret demi-cadratin. Ponctuation classique uniquement.
5. Pas de hashtags, pas d'emojis. Tu ne reprends pas les appels à commenter, aimer, partager ou s'abonner. Tu ne parles ni de "la publication", ni de "la légende", ni de Gingaaa.
6. Le titre et la rubrique sont toujours fournis. Le titre annonce le sujet précis, sans point final.
7. Si la légende ne contient pas assez de matière pour écrire ${cfg.ai.min_words} mots sans rien ajouter, tu réponds avec "assez_de_matiere": false et "paragraphes": [] : seuls le titre, le résumé, la rubrique et les mots-clés sont alors utilisés.

Tu réponds uniquement avec un objet JSON :
{"assez_de_matiere": true, "titre": "titre clair de 40 à 70 caractères, pensé pour la recherche Google", "resume": "une phrase de 140 caractères maximum", "paragraphes": ["2 ou 3 paragraphes, ${cfg.ai.min_words} à ${cfg.ai.max_words} mots au total"], "rubrique": "un identifiant de la liste fournie", "mots_cles": ["3 à 5 mots-clés"]}`;

// Extrait l'objet JSON de la réponse. Le modèle réfléchit avant d'écrire : la réponse peut donc
// commencer par un bloc de réflexion, et seul le texte des blocs "text" compte.
export function readAnswer(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const out = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = out.indexOf('{'), end = out.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`réponse sans texte exploitable (arrêt : ${data?.stop_reason}, blocs : ${blocks.map((b) => b.type).join(', ') || 'aucun'})`);
  }
  return JSON.parse(out.slice(start, end + 1));
}

async function askAI(item) {
  const user = `Rubriques possibles (identifiant : nom) :\n${RUBS.map((r) => `${r.slug} : ${r.name}`).join('\n')}\n\nType de publication : ${item.kind}\nLégende :\n"""\n${item.caption}\n"""`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.ai.model, max_tokens: 6000, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${text.slice(0, 200)}`);
  return readAnswer(JSON.parse(text));
}

// Comparaison tolérante : sans accents, sans casse, apostrophes et espaces unifiés.
const flat = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/[  ]/g, ' ');

// Contrôles automatiques qui remplacent la relecture humaine. Renvoie la raison du rejet, ou null.
// "court" : la légende est trop brève pour un texte, seuls le titre et la rubrique sont contrôlés.
export function check(ai, caption, court = false) {
  if (!ai || typeof ai.titre !== 'string' || !Array.isArray(ai.paragraphes)) return 'format invalide';
  const body = court ? '' : ai.paragraphes.join(' ');
  if (!court) {
    const n = wordCount(body);
    if (n < cfg.ai.min_words * 0.7 || n > cfg.ai.max_words * 1.4) return `longueur hors limites (${n} mots)`;
  }
  if (ai.titre.length < 12 || ai.titre.length > 110) return 'titre hors limites';
  if (!RUBS.some((r) => r.slug === ai.rubrique)) return 'rubrique inconnue';
  // Tout nombre présent dans l'article doit exister dans la légende d'origine.
  const sourceNumbers = new Set(caption.match(/\d+(?:[.,]\d+)?/g) || []);
  for (const num of `${ai.titre} ${body}`.match(/\d+(?:[.,]\d+)?/g) || []) {
    if (!sourceNumbers.has(num)) return `chiffre absent de la source (${num})`;
  }
  // Tout nom propre (mot à majuscule en milieu de phrase) doit exister dans la légende.
  // Un mot long est reconnu à son radical, pour accepter "Ivoiriens" quand la légende dit "Ivoire".
  const source = flat(`${caption} ${cfg.site_name} afrique`);
  for (const [, name] of `x ${ai.titre}. ${body}`.matchAll(/[a-zà-ÿ,;] ([A-ZÀ-Ý][\p{L}'’-]{2,})/gu)) {
    const word = flat(name);
    if (!source.includes(word.length >= 7 ? word.slice(0, 5) : word)) return `nom absent de la source (${name})`;
  }
  return null;
}

function guessRubrique(caption) {
  const tags = hashtags(caption).map((t) => t.slice(1));
  const text = ` ${caption.toLowerCase()} `;
  let best = null, score = 0;
  for (const r of RUBS) {
    let s = 0;
    for (const t of r.tags) {
      const flatTag = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
      if (tags.includes(flatTag)) s += 3;
      if (new RegExp(`[^\\p{L}]${t}[^\\p{L}]`, 'u').test(text)) s += 1;
    }
    if (text.includes(r.name.toLowerCase())) s += 4;
    if (s > score) { score = s; best = r.slug; }
  }
  return best || 'actus';
}

const captionParagraphs = (item) => cleanCaption(item.caption).split(/\n{2,}/).map((x) => x.replace(/\n/g, ' ').trim()).filter(Boolean);

function basic(item) {
  const text = cleanCaption(item.caption);
  const first = (item.sourceTitle || text.split(/(?<=[.!?])\s|\n/)[0] || '').trim();
  let title = first.length > 90 ? first.slice(0, 87).replace(/\s+\S*$/, '') + '...' : first;
  if (title.length < 8) title = `${RUBS.find((r) => r.slug === guessRubrique(item.caption)).name} : la publication du jour`;
  return {
    title, summary: text.replace(/\s+/g, ' ').slice(0, 140), body: captionParagraphs(item),
    rubrique: guessRubrique(item.caption), keywords: hashtags(item.caption).slice(0, 5).map((t) => t.slice(1)),
  };
}

export async function run() {
  const store = await readJSON('data/posts.json', { items: [] });
  if (store.demo) { log('données d\'exemple, rédaction ignorée'); return; }
  const slugs = new Set(store.items.map((i) => i.slug).filter(Boolean));
  let full = 0, short = 0, simple = 0, rejected = 0, failed = 0;

  for (const item of store.items) {
    // Un article est repris par l'IA s'il n'a pas encore de version à jour et qu'il lui reste des essais.
    if (KEY && item.aiv !== AI_VERSION) { item.aiv = AI_VERSION; item.tries = 0; item.aiDone = false; }
    const wantsAI = KEY && !item.aiDone && (item.tries || 0) < MAX_TRIES && wordCount(cleanCaption(item.caption)) >= 4;
    if (item.enriched && !wantsAI) continue;

    let result = null;
    if (wantsAI) {
      try {
        const out = await askAI(item);
        // Seule une réponse réellement reçue compte comme un essai : une panne technique n'en consomme pas.
        item.tries = (item.tries || 0) + 1;
        const court = out.assez_de_matiere === false || !out.paragraphes?.length;
        if (court) out.paragraphes = [];
        const why = check(out, item.caption, court);
        if (why) { rejected++; log(`texte rejeté (${item.id}) : ${why}`); }
        else {
          result = {
            title: out.titre, summary: out.resume || '', rubrique: out.rubrique, keywords: out.mots_cles || [],
            body: court ? captionParagraphs(item) : out.paragraphes,
          };
          item.aiDone = true;
          item.short = court;
          court ? short++ : full++;
        }
      } catch (e) {
        failed++;
        log(`rédaction indisponible (${item.id}) : ${e.message}`);
      }
    }
    // Un essai manqué ne dégrade jamais un article déjà rédigé : on garde la version en place.
    if (!result && item.enriched) continue;
    if (!result) { result = basic(item); simple++; }

    item.title = noDash(result.title).replace(/\.$/, '').trim();
    item.summary = noDash(result.summary).trim();
    item.body = result.body.map((x) => noDash(x).trim()).filter(Boolean);
    item.rubrique = result.rubrique;
    item.keywords = result.keywords;
    item.enriched = item.aiDone ? 'ai' : 'basic';
    delete item.thin;
    // Une page trop courte reste dans le fil du hub mais n'est pas proposée à Google.
    item.indexable = wordCount(item.body.join(' ')) >= cfg.min_words_indexable;

    if (!item.slug) {
      let slug = slugify(item.title), n = 2;
      while (slugs.has(slug)) slug = `${slugify(item.title, 66)}-${n++}`;
      item.slug = slug;
      slugs.add(slug);
    }
  }

  await writeJSON('data/posts.json', store);
  log(`rédaction : ${full} articles rédigés par IA, ${short} titres et rubriques par IA (légende courte), ${simple} en version simple, ${rejected} rejetés par les contrôles, ${failed} pannes`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
