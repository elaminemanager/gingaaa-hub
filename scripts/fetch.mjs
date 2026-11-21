// Étape 1 : récupère les publications des comptes Gingaaa et met à jour data/posts.json.
// Chaque réseau est indépendant : une panne sur l'un n'empêche pas les autres de passer.
import { writeFile, mkdir } from 'node:fs/promises';
import { readJSON, writeJSON, p, similarity, hashtags, log } from './lib.mjs';

const cfg = await readJSON('config.json');
const env = process.env;
const UA = { 'user-agent': 'GingaaaHub/1.0' };

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const xml = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const meta = (path) => `https://graph.facebook.com/${cfg.meta_api_version ? cfg.meta_api_version + '/' : ''}${path}`;

// ---------- Connecteurs. Chacun renvoie une liste de publications normalisées. ----------

const connectors = {
  // YouTube : flux public de la chaîne, aucune clé nécessaire.
  async youtube() {
    const id = env.YOUTUBE_CHANNEL_ID || cfg.youtube_channel_id;
    if (!id) return null;
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const feed = await r.text();
    return [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
      const vid = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      const title = xml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const desc = xml((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1]);
      return {
        network: 'youtube', id: vid, kind: 'video', ratio: '16/9',
        url: `https://www.youtube.com/watch?v=${vid}`,
        embed: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1`,
        date: (e.match(/<published>(.*?)<\/published>/) || [])[1],
        caption: [title, desc].filter(Boolean).join('\n\n'),
        sourceTitle: title,
        coverUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      };
    }).filter((x) => x.id);
  },

  // Instagram : compte professionnel relié à la Page Facebook, lu avec le jeton de la Page.
  async instagram() {
    const token = env.META_PAGE_TOKEN, id = env.IG_USER_ID;
    if (!token || !id) return null;
    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
    const res = await getJSON(meta(`${id}/media?fields=${encodeURIComponent(fields)}&limit=50&access_token=${token}`));
    return (res.data || []).map((m) => {
      const first = m.children?.data?.[0];
      const isVideo = m.media_type === 'VIDEO';
      const permalink = m.permalink.endsWith('/') ? m.permalink : m.permalink + '/';
      return {
        network: 'instagram', id: m.id, url: permalink, embed: `${permalink}embed/`,
        kind: isVideo ? 'video' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image',
        ratio: m.media_product_type === 'REELS' ? '9/16' : '4/5',
        date: m.timestamp, caption: m.caption || '',
        coverUrl: isVideo ? m.thumbnail_url : m.media_url || first?.thumbnail_url || first?.media_url,
      };
    });
  },

  // Facebook : publications de la Page. Les simples repartages sont ignorés.
  async facebook() {
    const token = env.META_PAGE_TOKEN, id = env.FB_PAGE_ID;
    if (!token || !id) return null;
    const fields = 'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type}';
    const res = await getJSON(meta(`${id}/posts?fields=${encodeURIComponent(fields)}&limit=50&access_token=${token}`));
    return (res.data || [])
      .filter((x) => x.status_type !== 'shared_story' && (x.message || x.full_picture))
      .map((x) => {
        const type = x.attachments?.data?.[0]?.media_type || '';
        return {
          network: 'facebook', id: x.id, url: x.permalink_url,
          embed: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(x.permalink_url)}&show_text=false&width=500`,
          kind: type === 'video' ? 'video' : type === 'album' ? 'carousel' : 'image',
          ratio: '4/5', date: x.created_time, caption: x.message || '', coverUrl: x.full_picture,
        };
      });
  },

  // TikTok : le jeton d'accès dure 24 h, il est renouvelé à chaque passage avec le jeton de rafraîchissement.
  async tiktok() {
    const { TIKTOK_CLIENT_KEY: key, TIKTOK_CLIENT_SECRET: secret, TIKTOK_REFRESH_TOKEN: refresh } = env;
    if (!key || !secret || !refresh) return null;
    const tok = await getJSON('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: key, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }),
    });
    if (!tok.access_token) throw new Error(`jeton refusé : ${JSON.stringify(tok).slice(0, 200)}`);
    if (tok.refresh_token && tok.refresh_token !== refresh) {
      // Le nouveau jeton est déposé hors dépôt ; l'automatisation le range dans les secrets.
      await mkdir(p('.rotated'), { recursive: true });
      await writeFile(p('.rotated/TIKTOK_REFRESH_TOKEN'), tok.refresh_token);
    }
    const fields = 'id,title,video_description,create_time,cover_image_url,share_url,duration';
    const res = await getJSON(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ max_count: 20 }),
    });
    return (res.data?.videos || []).map((v) => ({
      network: 'tiktok', id: v.id, url: v.share_url, embed: `https://www.tiktok.com/embed/v2/${v.id}`,
      kind: 'video', ratio: '9/16', date: new Date(v.create_time * 1000).toISOString(),
      caption: v.video_description || v.title || '', coverUrl: v.cover_image_url,
    }));
  },
};

// ---------- Garde-fous ----------

function excluded(post) {
  const tags = hashtags(post.caption);
  const text = post.caption.toLowerCase();
  if (cfg.exclude_hashtags.some((h) => tags.includes(h.toLowerCase()))) return true;
  return cfg.exclude_keywords.some((k) => text.includes(k.toLowerCase()));
}

async function saveCover(post) {
  if (!post.coverUrl) return null;
  try {
    const r = await fetch(post.coverUrl, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get('content-type') || '';
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const rel = `media/${post.network}_${String(post.id).replace(/[^\w-]/g, '')}.${ext}`;
    await mkdir(p('media'), { recursive: true });
    await writeFile(p(rel), Buffer.from(await r.arrayBuffer()));
    return rel;
  } catch (e) {
    log(`image non récupérée (${post.network} ${post.id}) : ${e.message}`);
    return null;
  }
}

const hours = (a, b) => Math.abs(new Date(a) - new Date(b)) / 36e5;
const source = (post) => ({ network: post.network, id: post.id, url: post.url, embed: post.embed, date: post.date, ratio: post.ratio });

// ---------- Passage ----------

export async function run({ only } = {}) {
  const store = await readJSON('data/posts.json', { items: [] });
  let added = 0, merged = 0, removed = 0, connected = 0;
  const report = [];
  // Les contenus d'exemple cèdent la place dès qu'un vrai compte répond.
  const wasDemo = Boolean(store.demo);
  if (wasDemo) store.items = [];

  for (const [network, connector] of Object.entries(connectors)) {
    if (only && !only.includes(network)) continue;
    let posts;
    try {
      posts = await connector();
    } catch (e) {
      report.push(`${network} : erreur (${e.message})`);
      continue;
    }
    if (posts === null) { report.push(`${network} : non connecté`); continue; }
    connected++;
    posts = posts.filter((x) => x.id && x.date);
    report.push(`${network} : ${posts.length} publications lues`);

    // Suppressions : une publication absente de la réponse, dans la période couverte, a été retirée.
    if (posts.length) {
      const oldest = posts.reduce((m, x) => (x.date < m ? x.date : m), posts[0].date);
      const ids = new Set(posts.map((x) => String(x.id)));
      for (const item of store.items) {
        const before = item.sources.length;
        item.sources = item.sources.filter((s) => s.network !== network || new Date(s.date) < new Date(oldest) || ids.has(String(s.id)));
        if (item.sources.length < before && item.sources.length === 0) removed++;
      }
      store.items = store.items.filter((item) => item.sources.length);
    }

    for (const post of posts.sort((a, b) => new Date(a.date) - new Date(b.date))) {
      const known = store.items.find((i) => i.sources.some((s) => s.network === network && String(s.id) === String(post.id)));
      if (excluded(post)) {
        if (known) { store.items = store.items.filter((i) => i !== known); removed++; }
        continue;
      }
      if (known) continue;

      // Dédoublonnage : même contenu déjà venu d'un autre réseau, dans la fenêtre de temps prévue.
      const twin = store.items.find((i) =>
        !i.sources.some((s) => s.network === network) &&
        hours(i.date, post.date) <= cfg.dedup.window_hours &&
        similarity(i.caption, post.caption) >= cfg.dedup.similarity);
      if (twin) {
        twin.sources.push(source(post));
        if (!twin.cover) twin.cover = await saveCover(post);
        if (post.caption.length > twin.caption.length) twin.caption = post.caption;
        merged++;
        continue;
      }

      store.items.push({
        id: `${network}_${post.id}`, date: post.date, kind: post.kind, caption: post.caption,
        sourceTitle: post.sourceTitle || '', cover: await saveCover(post), sources: [source(post)],
      });
      added++;
    }
  }

  for (const line of report) log(line);
  if (!connected) {
    log('aucun compte connecté, rien n\'est modifié');
    return { added, merged, removed, report };
  }
  store.items.sort((a, b) => new Date(b.date) - new Date(a.date));
  delete store.demo;
  await writeJSON('data/posts.json', store);
  log(`${added} nouvelles, ${merged} fusionnées, ${removed} retirées, ${store.items.length} au total`);
  return { added, merged, removed, report };
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
