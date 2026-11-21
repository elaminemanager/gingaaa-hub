# Hub Gingaaa

Site statique qui relaie automatiquement les publications de Gingaaa (Instagram, Facebook, TikTok, YouTube). Chaque publication devient un mini article avec sa propre adresse, prêt à être partagé sur WhatsApp et référencé par Google. Aucune intervention humaine n'est nécessaire une fois les comptes connectés.

## Fonctionnement

Toutes les 30 minutes, une tâche GitHub Actions enchaîne trois étapes :

1. `scripts/fetch.mjs` lit les quatre comptes et met à jour `data/posts.json`.
2. `scripts/enrich.mjs` rédige le mini article de chaque nouvelle publication (titre, texte, rubrique).
3. `scripts/build.mjs` régénère le site dans `dist/`, publié sur la branche `site` que l'hébergeur déploie.

Si rien n'a changé, le site n'est pas republié.

## Garde-fous automatiques

| Règle | Comportement |
|---|---|
| Dédoublonnage | Une même publication postée sur plusieurs réseaux donne un seul article, avec un lien vers chaque réseau. |
| Exclusions | `#nohub` dans la légende écarte une publication. Les jeux-concours et les simples repartages Facebook sont ignorés. |
| Suppressions | Une publication retirée d'un réseau disparaît du hub au passage suivant. |
| Rédaction encadrée | L'IA n'utilise que la légende. Tout chiffre ou nom propre absent de la légende fait rejeter le texte, remplacé par la légende d'origine. |
| Contenu trop court | Moins de 60 mots : la publication apparaît dans le fil mais n'est pas proposée à Google. |
| Vidéos | Lues depuis la plateforme d'origine, jamais réhébergées. Seule l'image de couverture est copiée. |
| Ponctuation | Les tirets longs sont remplacés par une ponctuation classique. |

Les réglages (rubriques, mots exclus, seuils) sont dans `config.json`.

## Accès à renseigner

Dans le dépôt GitHub, menu Settings > Secrets and variables > Actions.

| Nom | Type | Rôle |
|---|---|---|
| `SITE_URL` | variable | Adresse du site, par exemple `https://exemple.com` |
| `YOUTUBE_CHANNEL_ID` | variable | Identifiant de la chaîne YouTube (commence par `UC`) |
| `META_PAGE_TOKEN` | secret | Jeton de la Page Facebook, sans expiration |
| `FB_PAGE_ID` | secret | Identifiant de la Page Facebook |
| `IG_USER_ID` | secret | Identifiant du compte Instagram professionnel relié à la Page |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` | secrets | Application TikTok validée (Login Kit + Display API, autorisation `video.list`) |
| `GH_PAT` | secret | Jeton GitHub permettant de mettre à jour le jeton TikTok quand il change |
| `ANTHROPIC_API_KEY` | secret | Clé pour la rédaction par IA. Sans elle, le hub publie la légende telle quelle. |

Un réseau sans accès est simplement ignoré : le hub fonctionne avec ceux qui sont connectés.

## Mise en ligne sur Hostinger

1. hPanel > Sites web > Gérer > Avancé > Git : dépôt de ce projet, branche `site`, répertoire vide (déploiement dans `public_html`).
2. Copier l'adresse Webhook affichée par Hostinger et l'ajouter dans GitHub (Settings > Webhooks) pour un déploiement automatique à chaque mise à jour.
3. Lancer la tâche une première fois : onglet Actions > Hub Gingaaa > Run workflow.

## Commandes

```
npm test        Tests du pipeline, avec des réponses simulées des plateformes
npm run demo    Site avec des contenus d'exemple
npm run hub     Passage complet (lecture, rédaction, génération)
```

## État au 12 novembre 2026

Le générateur, les garde-fous et la génération du site sont testés (`npm test`). Les connecteurs sont écrits d'après la documentation des plateformes mais n'ont pas encore tourné sur les vrais comptes Gingaaa : le premier passage réel sert de vérification.

Limite connue : GitHub suspend les tâches planifiées d'un dépôt resté 60 jours sans activité. Tant que Gingaaa publie, le dépôt reste actif.
