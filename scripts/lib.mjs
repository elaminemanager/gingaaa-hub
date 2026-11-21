// Outils communs aux scripts du hub Gingaaa.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.HUB_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
export const p = (...parts) => join(ROOT, ...parts);

export async function readJSON(rel, fallback) {
  try {
    return JSON.parse(await readFile(p(rel), 'utf8'));
  } catch (e) {
    if (fallback !== undefined && e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJSON(rel, data) {
  await mkdir(dirname(p(rel)), { recursive: true });
  await writeFile(p(rel), JSON.stringify(data, null, 2) + '\n');
}

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function slugify(s, max = 70) {
  const slug = plain(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, max).replace(/-+$/g, '') || 'publication';
}

// Les tirets longs sont remplacés par une ponctuation classique (règle éditoriale).
export const noDash = (s) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/ ,/g, ',');

export const hashtags = (caption) => (String(caption ?? '').match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => plain(h));

// Légende sans les hashtags et mentions de fin, pour l'affichage et la rédaction.
export function cleanCaption(caption) {
  return String(caption ?? '')
    .replace(/(\s*[#@][\p{L}\p{N}_.]+)+\s*$/gu, '')
    .replace(/\n[.\s]*\n/g, '\n\n')
    .trim();
}

const STOP = new Set('les des une que qui pour dans sur avec pas plus est sont aux ces son ses nos vos mais cette tout tous the and for you'.split(' '));

export function wordSet(text) {
  const out = new Set();
  for (const w of plain(text).replace(/[#@]\S+/g, ' ').split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

export const wordCount = (text) => (String(text ?? '').match(/[\p{L}\p{N}]+/gu) || []).length;

// Ressemblance entre deux légendes (indice de Jaccard), de 0 à 1.
export function similarity(a, b) {
  const A = wordSet(a), B = wordSet(b);
  if (A.size < 5 || B.size < 5) return plain(a).trim() && plain(a).trim() === plain(b).trim() ? 1 : 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / (A.size + B.size - common);
}

export function frDate(iso, tz = 'Africa/Dakar', short = false) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: tz,
  }).format(new Date(iso));
}

export const NETWORKS = {
  instagram: { name: 'Instagram', short: 'IG' },
  facebook: { name: 'Facebook', short: 'FB' },
  tiktok: { name: 'TikTok', short: 'TT' },
  youtube: { name: 'YouTube', short: 'YT' },
};

export const log = (...a) => console.log('[hub]', ...a);
