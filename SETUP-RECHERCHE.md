# Outil de recherche OSINT Industries — installation

Ce site inclut désormais une page `/recherche.html` protégée par mot de passe, connectée en direct à votre compte **OSINT Industries** via deux fonctions serverless Vercel (`/api/auth.js` et `/api/search.js`). Votre clé API n'est jamais exposée au navigateur : elle ne vit que côté serveur.

## 1. Générer votre clé API OSINT Industries

1. Connectez-vous sur [app.osint.industries](https://app.osint.industries) avec un abonnement **Intermediate** ou **Advanced** (l'accès API n'est pas inclus dans le plan gratuit).
2. Allez dans les paramètres de votre compte → **API keys**.
3. Générez une clé (vous pouvez en avoir jusqu'à 5 actives simultanément). Copiez-la immédiatement — gardez-la strictement confidentielle.

## 2. Codes d'accès au portail

9 codes d'accès sont configurés, un par membre de l'équipe (n'importe lequel des 9 déverrouille l'outil) :

`809231` · `809232` · `809233` · `809234` · `809235` · `809236` · `809237` · `809238` · `809239`

Vous pouvez en distribuer un différent à chaque personne. Si l'un d'eux est un jour compromis, retirez-le simplement de la liste dans Vercel (étape 3) et redéployez — inutile de changer les 8 autres.

## 3. Configurer les variables d'environnement sur Vercel

Dans votre projet Vercel : **Settings → Environment Variables**, ajoutez :

| Nom | Valeur |
|---|---|
| `SEARCH_TOOL_PASSWORDS` | `809231,809232,809233,809234,809235,809236,809237,809238,809239` |
| `OSINT_INDUSTRIES_API_KEY` | la clé générée à l'étape 1 |

(Pas d'espaces autour des virgules dans `SEARCH_TOOL_PASSWORDS`.) Cochez "Production" (et "Preview"/"Development" si vous testez des branches). **Redéployez** ensuite le projet pour que les nouvelles variables soient prises en compte.

## 4. Tester

Ouvrez `https://votre-domaine/recherche.html`, saisissez le code d'accès, puis lancez une recherche (email, téléphone, nom d'utilisateur, nom complet ou wallet crypto). Chaque recherche consomme des crédits de votre abonnement OSINT Industries — activer la case "modules premium" consomme des crédits supplémentaires (Snapchat, TikTok, etc.).

## 5. Test local (facultatif)

Si vous avez la CLI Vercel installée :

```bash
npm i -g vercel
cp .env.example .env.local   # puis remplissez les deux valeurs
vercel dev
```

## Sécurité — points importants

- Un bouton **// Log out** a été ajouté en haut de la page (une fois déverrouillée) : il efface le code d'accès stocké dans le navigateur (`sessionStorage`) et ramène immédiatement à l'écran de saisie du code. Utile sur un poste partagé.
- Le mot de passe est vérifié **côté serveur** à chaque recherche, pas seulement à l'écran d'accueil : même en contournant l'interface, personne ne peut appeler `/api/search` sans le bon code.
- La page est marquée `noindex, nofollow` pour ne pas apparaître dans les moteurs de recherche, et n'est pas mise en avant comme un service public — c'est un outil interne.
- Il n'y a pas de limitation de débit (rate limiting) persistante : les fonctions serverless Vercel sont sans état. Si l'un des 9 codes fuite, il pourrait être utilisé pour épuiser vos crédits jusqu'à ce que vous le retiriez de `SEARCH_TOOL_PASSWORDS`. Pour un vrai rate limiting partagé (ex. limiter chaque code à N recherches/jour), il faudrait ajouter une base comme Vercel KV ou Upstash — je peux l'ajouter si besoin.
- Ces codes sont numériques à 6 chiffres : suffisants pour dissuader un visiteur occasionnel, mais pas conçus pour résister à un bot qui tenterait des combinaisons en masse. Comme il n'y a pas de limite de tentatives sur `/api/auth`, un mot de passe alphanumérique plus long serait plus robuste si l'outil devait un jour être exposé plus largement — dites-le-moi si vous voulez que j'ajoute un verrouillage après plusieurs échecs.
- Ne committez jamais `.env.local` dans Git (déjà exclu via `.gitignore`).

## 6. Recherche "Entreprise / entité" (nouveau, sans clé pour 3 des 4 sources)

Un nouveau type de recherche **Entreprise / entité** a été ajouté (`/api/entity-search.js`). Il interroge en parallèle :

| Source | Clé requise ? | Donnée |
|---|---|---|
| Registre des entreprises françaises (data.gouv.fr) | Non | SIREN, dirigeants, adresse, statut |
| GLEIF | Non | Identifiant LEI, forme juridique, adresse |
| ICIJ Offshore Leaks | Non (attribution obligatoire, licence ODbL/CC BY-SA — déjà affichée sur la page) | Entités liées aux Panama/Paradise/Pandora Papers etc. |
| Pappers | **Oui** — `PAPPERS_API_KEY` | Données légales et financières enrichies (CA, dirigeants détaillés, KBIS) |
| Zefix (Suisse) | **Oui, mais gratuite** — `ZEFIX_USERNAME` + `ZEFIX_PASSWORD` | Registre fédéral suisse du commerce (UID/CHE, forme juridique, siège, statut) |

Les trois premières fonctionnent immédiatement, sans rien configurer. Pappers et Zefix s'activent automatiquement dès que leurs variables sont définies dans Vercel (Settings → Environment Variables) — si elles sont absentes, ces modules sont simplement ignorés, le reste continue de fonctionner normalement. Redéployez après avoir ajouté des variables.

**Pour Zefix** : créez un compte gratuit sur [zefix.admin.ch](https://www.zefix.admin.ch) (aucun contrat payant, juste une inscription en libre-service) pour obtenir votre identifiant/mot de passe. C'est actuellement la seule source de ce lot avec une vraie API publique gratuite de bout en bout.

**Point de transparence** : je n'ai pas pu exécuter d'appel réel vers l'API Zefix depuis cet environnement pour vérifier les noms exacts des champs de la réponse (documentation Swagger bloquée par robots.txt aux outils que j'utilise). Le module a été codé de façon tolérante (comme le reste de l'outil : bouton "Voir le JSON brut" toujours disponible sur chaque carte), mais après votre première vraie recherche une fois les identifiants configurés, montrez-moi un exemple de réponse si un champ affiche des valeurs manquantes ou mal étiquetées — j'ajusterai le mapping.

**Sur l'Arabie Saoudite (Wathq) et Israël (data.gov.il)** demandés également : ces deux ont un signal d'API réel, mais je n'ai pas pu confirmer avec certitude les URLs d'endpoint exactes, le format d'authentification, ni les noms de champs (documentation derrière connexion développeur / pages qui bloquent la lecture automatisée). Plutôt que de coder à l'aveugle un endpoint que je ne peux pas vérifier — risque réel de livrer une intégration cassée — je préfère attendre soit que vous m'envoyiez un extrait de leur documentation technique une fois connecté à leur portail développeur, soit que vous me confirmiez l'URL exacte d'un appel de test. Dites-le-moi et je les ajoute dès que j'ai de quoi coder juste.

## 7. Reconnaissance faciale (bêta, désactivée par défaut)

Un panneau "Reconnaissance faciale (CompreFace)" a été préparé en bas de la page (`/api/face-search.js`), mais **reste désactivé** tant que vous n'avez pas fait les deux choses suivantes :

1. **Déployer votre propre serveur CompreFace** ([exadel-inc/CompreFace](https://github.com/exadel-inc/CompreFace), Docker) sur un hébergeur qui garde un processus permanent — Fly.io, Railway, une VPS. Ce n'est pas possible sur Vercel (serverless). CompreFace génère sa propre clé API locale depuis son interface d'administration — il n'y a pas de fournisseur tiers à qui la demander.
2. **Obtenir un avis juridique avant l'activation.** Faire correspondre des visages pour identifier une personne relève du traitement de données biométriques (article 9 du RGPD), interdit par défaut sauf base légale précise. Pour un outil public opéré depuis l'Estonie, cela nécessite très probablement une analyse d'impact (AIPD) et un avis juridique documenté.

Une fois ces deux étapes faites, activez la fonctionnalité en ajoutant dans Vercel :

| Nom | Valeur |
|---|---|
| `FACE_SEARCH_ENABLED` | `true` |
| `COMPREFACE_URL` | l'URL de votre serveur CompreFace |
| `COMPREFACE_API_KEY` | la clé générée par CompreFace lui-même (pas par nous) |

**Important à comprendre** : CompreFace ne recherche pas un visage sur le web public comme le ferait un service commercial (PimEyes, FaceCheck.id). Il ne fait que comparer deux photos entre elles ("Verify"), ou comparer une photo à une collection de visages que *vous* avez vous-même enregistrés au préalable dans CompreFace ("Recognize"). Ce n'est pas un moteur de recherche de visages sur Internet.

## 8. Quota mensuel par code d'accès + alerte par email

Chaque code d'accès a maintenant un quota mensuel, toutes recherches confondues (OSINT Industries, Entreprise/entité, reconnaissance faciale) :

| Codes | Limite mensuelle | Email d'alerte envoyé à... |
|---|---|---|
| `809231` à `809236` | 300 recherches | `contact@sovereignman.dev`, une fois, dès que le compteur atteint **200** |
| `809237`, `809238`, `809239` | 500 recherches | idem, dès que le compteur atteint **~334** (même proportion, 2/3 de la limite) |

**Rien n'est jamais bloqué** : c'est uniquement une alerte informative, envoyée au maximum une fois par code et par mois (le compteur se remet à zéro chaque mois calendaire). Pour changer les limites ou les codes concernés, éditez les constantes en haut de `api/_quota.js` (`DEFAULT_LIMIT`, `HIGH_LIMIT`, `HIGH_LIMIT_CODES`).

Deux services externes sont nécessaires (tous deux gratuits pour ce volume) :

1. **Stockage du compteur — Upstash Redis** : créez une base gratuite sur [upstash.com](https://upstash.com) (ou via Vercel : Storage → Browse Marketplace → Upstash), puis copiez son URL et son jeton REST dans les variables Vercel `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
2. **Envoi d'email — Resend** : créez un compte gratuit sur [resend.com](https://resend.com), vérifiez un domaine d'envoi (ou utilisez leur domaine de test le temps de valider), générez une clé API, et mettez-la dans `RESEND_API_KEY`. Vous pouvez aussi personnaliser `QUOTA_ALERT_FROM` (l'expéditeur) et `QUOTA_ALERT_TO` (le destinataire, `contact@sovereignman.dev` par défaut).

Si l'une de ces deux configurations manque, la fonctionnalité est simplement désactivée — toutes les recherches continuent de fonctionner normalement, vous ne recevrez juste pas l'alerte tant que ce n'est pas configuré. Redéployez après avoir ajouté les variables.

## Format de réponse de l'API

La documentation publique d'OSINT Industries ne détaille pas complètement le schéma exact de la réponse JSON (noms de modules, champs par plateforme). L'interface a donc été conçue pour être **tolérante à la structure réelle** : elle affiche chaque module retourné sous forme de carte avec ses champs, et propose toujours un bouton « Voir le JSON brut » pour consulter la réponse complète telle quelle. Une fois que vous aurez votre clé et effectuerez une première recherche réelle, faites-moi voir un exemple de réponse si vous voulez que j'affine l'affichage pour coller exactement au format retourné.
