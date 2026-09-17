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

- Le mot de passe est vérifié **côté serveur** à chaque recherche, pas seulement à l'écran d'accueil : même en contournant l'interface, personne ne peut appeler `/api/search` sans le bon code.
- La page est marquée `noindex, nofollow` pour ne pas apparaître dans les moteurs de recherche, et n'est pas mise en avant comme un service public — c'est un outil interne.
- Il n'y a pas de limitation de débit (rate limiting) persistante : les fonctions serverless Vercel sont sans état. Si l'un des 9 codes fuite, il pourrait être utilisé pour épuiser vos crédits jusqu'à ce que vous le retiriez de `SEARCH_TOOL_PASSWORDS`. Pour un vrai rate limiting partagé (ex. limiter chaque code à N recherches/jour), il faudrait ajouter une base comme Vercel KV ou Upstash — je peux l'ajouter si besoin.
- Ces codes sont numériques à 6 chiffres : suffisants pour dissuader un visiteur occasionnel, mais pas conçus pour résister à un bot qui tenterait des combinaisons en masse. Comme il n'y a pas de limite de tentatives sur `/api/auth`, un mot de passe alphanumérique plus long serait plus robuste si l'outil devait un jour être exposé plus largement — dites-le-moi si vous voulez que j'ajoute un verrouillage après plusieurs échecs.
- Ne committez jamais `.env.local` dans Git (déjà exclu via `.gitignore`).

## Format de réponse de l'API

La documentation publique d'OSINT Industries ne détaille pas complètement le schéma exact de la réponse JSON (noms de modules, champs par plateforme). L'interface a donc été conçue pour être **tolérante à la structure réelle** : elle affiche chaque module retourné sous forme de carte avec ses champs, et propose toujours un bouton « Voir le JSON brut » pour consulter la réponse complète telle quelle. Une fois que vous aurez votre clé et effectuerez une première recherche réelle, faites-moi voir un exemple de réponse si vous voulez que j'affine l'affichage pour coller exactement au format retourné.
