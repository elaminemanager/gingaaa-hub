// Remplit data/posts.json avec des contenus d'exemple, pour voir le site avant la connexion des comptes.
// Le premier passage réel (scripts/fetch.mjs) remplace automatiquement ces exemples.
import { readJSON, writeJSON, slugify, wordCount, log } from './lib.mjs';

const cfg = await readJSON('config.json');
const ig = cfg.accounts.instagram, fb = cfg.accounts.facebook;
const src = (network, n, date, ratio) => ({ network, id: `demo${n}`, url: network === 'facebook' ? fb : ig, embed: '', date, ratio });

const demo = [
  ['week-end', 'carousel', '2026-11-09T09:00:00Z', ['instagram', 'facebook'], 'On a raté quoi ce week-end ? Le récap en cinq slides',
    ['Concerts, sorties, matchs, polémiques du dimanche soir : le week-end a été chargé et personne n\'a pu tout suivre.', 'Chaque lundi, Gingaaa rassemble en un carrousel les moments à retenir, pour arriver au bureau ou en cours avec les bonnes références. Faites défiler, puis envoyez le récap à la personne qui dort toujours le week-end.']],
  ['vrai-ou-faux', 'video', '2026-11-09T17:30:00Z', ['instagram', 'tiktok', 'facebook'], 'Vrai ou faux : le thiéboudienne est-il classé à l\'UNESCO ?',
    ['Vrai. Le ceebu jën, plat emblématique du Sénégal, est inscrit depuis décembre 2021 sur la liste du patrimoine culturel immatériel de l\'humanité.', 'Ce classement ne protège pas une recette figée. Il reconnaît un savoir-faire, des gestes transmis de génération en génération et tout ce qui se joue autour du bol partagé. On vous explique en une minute ce que ça change, et ce que ça ne change pas.']],
  ['sport', 'video', '2026-11-10T12:00:00Z', ['tiktok', 'instagram'], 'Journal du sport : ce qu\'il faut retenir cette semaine',
    ['Résultats, transferts, déclarations fortes : le journal du sport de Gingaaa fait le tri en moins de deux minutes.', 'Au programme, les performances des sportifs africains et de la diaspora, sur tous les terrains et pas seulement ceux du football. Dites-nous quelle discipline vous voulez voir plus souvent, on prend les commandes.']],
  ['entrepreneuriat', 'carousel', '2026-11-10T18:00:00Z', ['instagram', 'facebook'], 'Financement : trois portes où frapper quand on lance sa boîte',
    ['Trouver de l\'argent pour démarrer reste le premier obstacle des jeunes entrepreneurs. Bonne nouvelle : la banque n\'est pas la seule option.', 'Subventions, concours et investisseurs de proximité, chaque piste a ses règles, ses délais et ses pièges. Ce carrousel résume ce qu\'il faut préparer avant de candidater, pour ne pas perdre trois mois sur un dossier incomplet.']],
  ['net-check', 'video', '2026-11-11T11:00:00Z', ['tiktok'], 'Net Check : les sons viraux de la semaine',
    ['Vous les entendez partout sans savoir d\'où ils viennent. Net Check remonte à la source des sons qui tournent sur vos fils cette semaine.', 'Un extrait d\'émission, un refrain sorti de nulle part, un vieux tube qui revient : on vous dit qui a lancé la tendance et pourquoi elle a pris.']],
  ['tech-gaming', 'video', '2026-11-12T08:30:00Z', ['youtube'], 'Créer du contenu avec son téléphone : trois outils d\'IA à essayer',
    ['Pas besoin d\'un studio pour produire des vidéos propres. Trois applications suffisent pour écrire, monter et sous-titrer depuis un téléphone.', 'On les a testées dans les conditions réelles, avec une connexion moyenne et un appareil d\'entrée de gamme. Verdict, limites et astuces pour ne pas payer un abonnement inutile.']],
  ['fashion', 'image', '2026-11-09T13:00:00Z', ['instagram'], 'Fashion : les créateurs à suivre cette saison',
    ['Coupes audacieuses, tissus du continent, finitions soignées : la nouvelle génération de designers africains et de la diaspora ne demande plus la permission.', 'Chaque lundi, Gingaaa met un atelier à l\'honneur et raconte l\'histoire derrière la pièce. Enregistrez la publication pour retrouver les comptes à suivre.']],
  ['cuisine', 'video', '2026-11-08T16:00:00Z', ['instagram', 'tiktok', 'youtube'], 'Histoire de plats : pourquoi tout le monde se dispute le jollof',
    ['Sénégal, Nigeria, Ghana : chacun jure que son riz est le meilleur. La dispute est devenue un classique des réseaux sociaux.', 'Derrière la blague, il y a une vraie histoire, celle d\'un plat qui a voyagé le long des côtes ouest-africaines en changeant de nom et de recette. On remonte le fil, sans désigner de vainqueur.']],
  ['music', 'video', '2026-11-06T19:00:00Z', ['instagram', 'tiktok'], 'Next artist to check : les voix à écouter ce vendredi',
    ['Le vendredi, c\'est jour de sorties. Entre les gros albums attendus et les talents encore discrets, la sélection Gingaaa fait de la place à tout le monde.', 'Trois titres à ajouter à votre playlist avant le week-end, avec une règle simple : au moins une découverte que vous n\'auriez pas trouvée seul.']],
  ['4-the-culture', 'video', '2026-11-06T10:00:00Z', ['youtube', 'facebook'], '4 The Culture : une matinée au marché, côté saveurs',
    ['Odeurs, couleurs, négociations : le marché est un spectacle à part entière et le meilleur endroit pour comprendre ce que mange une ville.', 'On a suivi une cliente fidèle entre les étals pour savoir comment elle choisit son poisson, ses légumes et ses épices. Une leçon de cuisine avant même d\'allumer le feu.']],
  ['music', 'video', '2026-11-05T19:00:00Z', ['tiktok', 'instagram'], 'Clip de la semaine : celui qu\'on se repasse en boucle',
    ['Une chorégraphie qui reste en tête, une image soignée et un refrain qu\'on chante dès la deuxième écoute.', 'Chaque semaine, la rédaction choisit un clip et explique en trente secondes pourquoi il sort du lot. Le vôtre n\'y est pas ? Envoyez-le nous.']],
  ['music', 'carousel', '2026-11-04T18:00:00Z', ['instagram'], 'Playlist Gingaaa : dix titres pour tenir jusqu\'au week-end',
    ['Dix morceaux, dix ambiances, du réveil difficile du lundi à la sortie du vendredi soir.', 'La playlist mélange les sorties récentes et quelques classiques qu\'on ne se lasse pas de réentendre. Glissez pour découvrir la sélection complète.']],
  ['sport', 'video', '2026-11-07T12:00:00Z', ['instagram', 'facebook'], 'Portrait : une championne que vous devriez connaître',
    ['On parle beaucoup des mêmes disciplines et des mêmes visages. Cette rubrique met la lumière sur celles et ceux qui gagnent loin des caméras.', 'Parcours, entraînements, sacrifices : un portrait court pour retenir un nom de plus.']],
  ['sport', 'image', '2026-11-03T12:00:00Z', ['facebook'], 'Le programme sport de la semaine en une image',
    ['Toutes les dates à retenir, réunies sur un seul visuel à enregistrer.', 'Matchs, combats, finales : enregistrez l\'image et vous ne raterez plus un coup d\'envoi.']],
  ['cuisine', 'video', '2026-11-05T16:00:00Z', ['tiktok', 'youtube'], 'Le dessert du dimanche : simple, rapide, sans four',
    ['Trois ingrédients, dix minutes et aucun matériel compliqué.', 'Un dessert de famille revisité par une cheffe, à refaire à la maison le jour même. La liste des ingrédients est dans la vidéo.']],
  ['cuisine', 'carousel', '2026-11-02T16:00:00Z', ['instagram'], 'Ces plats qui se ressemblent d\'un pays à l\'autre',
    ['Des recettes cousines se retrouvent à des milliers de kilomètres de distance, avec d\'autres noms et d\'autres épices.', 'Ce carrousel rapproche des assiettes qui se ressemblent et raconte ce qu\'elles ont en commun.']],
];

const items = demo.map(([rubrique, kind, date, nets, title, body], n) => ({
  id: `demo_${n + 1}`, date, kind, caption: body.join('\n\n'), cover: null,
  sources: nets.map((net) => src(net, n + 1, date, kind === 'video' ? (net === 'youtube' ? '16/9' : '9/16') : '4/5')),
  title, summary: body[0].slice(0, 140), body, rubrique, keywords: [], enriched: 'demo',
  indexable: wordCount(body.join(' ')) >= cfg.min_words_indexable, slug: slugify(title),
}));

await writeJSON('data/posts.json', { demo: true, items });
log(`${items.length} contenus d'exemple écrits`);
