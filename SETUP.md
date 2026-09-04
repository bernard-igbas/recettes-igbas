[SETUP.md](https://github.com/user-attachments/files/31840412/SETUP.md)
# Installation de recettes-igbas

Même logique que pour compta-igbas. À faire une seule fois.

## 1. Créer le dépôt GitHub

1. Sur github.com, créer un nouveau dépôt nommé `recettes-igbas` (public ou privé, comme tu préfères).
2. Y déposer les 3 fichiers :
   - `index.html`
   - `functions/api/data.js`
   - `SETUP.md` (ce fichier, facultatif à garder en ligne)

## 2. Créer le projet Cloudflare Pages

1. Dans le tableau de bord Cloudflare → **Workers & Pages** → **Créer** → **Pages** → **Connecter à Git**.
2. Choisir le dépôt `recettes-igbas`.
3. Paramètres de build : aucun (fichiers statiques, laisser les champs de build vides).
4. Déployer.

## 3. Créer le namespace KV et le relier

1. Cloudflare → **Workers & Pages** → **KV** → **Créer un namespace** → nommer `recettes-igbas`.
2. Retourner sur le projet Pages `recettes-igbas` → **Settings** → **Functions** → **KV namespace bindings**.
3. Ajouter une liaison : variable `RECETTES_KV` → namespace `recettes-igbas`.

## 4. Définir le code de protection

1. Choisir un code secret (ex. une phrase que toi et Marie-Laure retenez facilement).
2. Dans le projet Pages → **Settings** → **Environment variables** → ajouter `RECETTES_CODE` avec ce code comme valeur.
3. Ouvrir `index.html`, remplacer `const RECETTES_CODE = "CHANGE_MOI";` par le **même** code exact.
4. Recommit / redéployer.

## 5. Ajouter le fichier partagé des aliments

1. Aller dans le dépôt GitHub de `compagnon-sante`.
2. Ajouter un nouveau fichier `aliments.json` à la racine (celui fourni par Claude).
3. Une fois déployé, il sera accessible à `https://compagnon-sante.pages.dev/aliments.json`
   (vérifier l'adresse exacte de ton projet Compagnon Santé et l'ajuster dans `index.html`
   si elle est différente — variable `ALIMENTS_URL` en haut du `<script>`).

## Pour ajouter un nouvel aliment plus tard

Modifier uniquement `aliments.json` dans le dépôt `compagnon-sante`. Les deux applis
(Compagnon Santé et Recettes IGBas) le liront automatiquement au prochain chargement —
rien à toucher ailleurs.

## Vérification après déploiement

- Ouvrir l'appli → onglet "Ajouter une recette" → taper un nom d'aliment dans le champ
  ingrédients → vérifier que des suggestions avec IG apparaissent.
- Créer une recette test → vérifier qu'elle apparaît bien dans le catalogue.
- Recharger la page → vérifier que la recette est toujours là (preuve que Cloudflare KV
  fonctionne, pas seulement le stockage local du navigateur).
