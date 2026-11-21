// Prolonge le jeton Instagram de 60 jours. Lancé chaque semaine par la tâche "Jetons d'accès".
// Si Instagram renvoie un nouveau jeton, il est déposé hors dépôt pour que la tâche le range dans les secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { p, log } from './lib.mjs';

const token = process.env.IG_ACCESS_TOKEN;
if (!token) {
  log('aucun jeton Instagram à prolonger');
  process.exit(0);
}
if (!token.startsWith('IG')) {
  log('jeton Instagram sans expiration (connexion unifiée), rien à prolonger');
  process.exit(0);
}
const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
const data = await r.json().catch(() => ({}));
if (!r.ok || !data.access_token) {
  console.error(`[hub] prolongation refusée par Instagram (HTTP ${r.status}) : ${JSON.stringify(data.error || data).slice(0, 300)}`);
  process.exit(1);
}
log(`jeton Instagram prolongé, valable encore ${Math.round(data.expires_in / 86400)} jours`);
if (data.access_token !== token) {
  await mkdir(p('.rotated'), { recursive: true });
  await writeFile(p('.rotated/IG_ACCESS_TOKEN'), data.access_token);
  log('Instagram a fourni un nouveau jeton, à enregistrer dans les secrets');
}
