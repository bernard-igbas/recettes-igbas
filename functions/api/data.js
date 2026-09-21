// ============================================================
// recettes-igbas (data.js) — v1.7 — 21/09/2026 — Validé par Bernard : EN ATTENTE
// ------------------------------------------------------------
// CHANGELOG
//  v1.7 (21/09/2026) : ALLÈGEMENT du travail du serveur (la base grossit avec les
//    photos, et Cloudflare limite le temps de calcul par requête : constaté le
//    21/09/2026 à 17h30, une lecture avait échoué chez Bernard).
//    - Lecture : la base est renvoyée telle quelle, sans être décodée puis
//      ré-encodée (travail divisé par deux environ).
//    - Enregistrement : le nombre de recettes de l'ancienne version est compté
//      par une simple recherche de texte au lieu de décoder toute l'ancienne base.
//      Même règle de garde-fou (plus de 5 recettes en moins = refus).
//  v1.6 (21/09/2026) : SÉCURITÉ DES DONNÉES
//    - Sauvegardes automatiques : avant d'écraser la base, le serveur en
//      garde une copie — une par heure (conservée 48 h) et une par jour
//      (conservée 30 jours). Clés : "sauvegarde-heure-AAAA-MM-JJTHH" et
//      "sauvegarde-jour-AAAA-MM-JJ" (+ petit repère "sauvegardes-index").
//    - Garde-fou : un enregistrement est REFUSÉ (erreur 409) s'il ferait
//      disparaître plus de 5 recettes d'un coup, ou si la base perdait plus
//      de 30 % de son poids. Contournable volontairement avec l'en-tête
//      X-Recettes-Forcer: 1 (jamais envoyé par l'appli).
//    - Lecture : en cas d'erreur du serveur, la réponse est maintenant une
//      vraie erreur (500) au lieu d'une liste vide qui pouvait faire croire
//      à une base vide.
//    - La base est enregistrée telle que reçue (plus de re-conversion).
//  v1.5 (21/09/2026) : code secret dans la variable RECETTES_ADMIN_CODE +
//    vérification d'accès (X-Recettes-Verif)
//  v1.4 / v1.3 / v1.2 / v1.1 (21/09/2026) : diagnostic et nettoyage
//  v1.0 : version d'origine (sans numéro)
// ============================================================
// functions/api/data.js
// Route : /api/data
// GET  -> renvoie les données stockées (les recettes)
// POST -> enregistre les données envoyées (protégé par le header X-Recettes-Code)
//
// Nécessite, côté Cloudflare Pages :
//  - un namespace KV lié à ce projet avec le binding "RECETTES_KV"
//  - une variable d'environnement "RECETTES_ADMIN_CODE" : le code secret,
//    connu uniquement de Bernard, Marie-Laure et du serveur
//    (il n'est écrit dans aucun fichier)

const KV_KEY = "recettes-data";
const KV_INDEX = "sauvegardes-index";

// Garde-fou
const MAX_BAISSE_RECETTES = 5;   // plus de 5 recettes en moins d'un coup = refus
const SEUIL_POIDS = 0.7;         // base réduite à moins de 70 % de son poids = refus
const POIDS_MINI_CONTROLE = 200000; // le contrôle de poids ne s'applique qu'aux bases > 200 000 caractères

// Durées de conservation des sauvegardes (en secondes)
const TTL_HEURE = 48 * 3600;
const TTL_JOUR = 30 * 24 * 3600;

function messageErreur(e) {
  return String((e && e.message) || e);
}

// Compte les recettes par simple recherche de texte (une recette = un "titre":"…").
// Beaucoup plus léger que de décoder toute la base. Utilisé identiquement pour
// l'ancienne et la nouvelle version, donc la comparaison reste juste.
function compterRecettes(brut) {
  const motif = '"titre":"';
  let n = 0;
  let i = 0;
  while ((i = brut.indexOf(motif, i)) !== -1) {
    n++;
    i += motif.length;
  }
  return n;
}

function reponseJson(objet, statut) {
  return new Response(JSON.stringify(objet), {
    status: statut || 200,
    headers: { "Content-Type": "application/json" }
  });
}

// Copie la version actuelle (avant écrasement) : une fois par heure et une fois par jour.
async function sauvegarderAvant(env, brutPrecedent) {
  const iso = new Date().toISOString();
  const jour = iso.slice(0, 10);   // ex. 2026-09-21
  const heure = iso.slice(0, 13);  // ex. 2026-09-21T10

  let index = {};
  try {
    const brutIndex = await env.RECETTES_KV.get(KV_INDEX);
    if (brutIndex) index = JSON.parse(brutIndex) || {};
  } catch (e) { index = {}; }

  let modifie = false;
  if (index.jour !== jour) {
    await env.RECETTES_KV.put("sauvegarde-jour-" + jour, brutPrecedent, { expirationTtl: TTL_JOUR });
    index.jour = jour;
    modifie = true;
  }
  if (index.heure !== heure) {
    await env.RECETTES_KV.put("sauvegarde-heure-" + heure, brutPrecedent, { expirationTtl: TTL_HEURE });
    index.heure = heure;
    modifie = true;
  }
  if (modifie) {
    await env.RECETTES_KV.put(KV_INDEX, JSON.stringify(index));
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.RECETTES_KV.get(KV_KEY);
    return new Response(raw || '{"recettes":[]}', {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return reponseJson({ error: "Lecture impossible", detail: messageErreur(e) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const attendu = env.RECETTES_ADMIN_CODE;
  if (!attendu) {
    return reponseJson({
      error: "Configuration incomplète",
      detail: "La variable RECETTES_ADMIN_CODE est absente côté Cloudflare"
    }, 500);
  }

  const code = request.headers.get("X-Recettes-Code");
  if (!code || code !== attendu) {
    return reponseJson({ error: "Code invalide" }, 401);
  }

  // Simple vérification d'accès : le code est bon, on ne modifie rien.
  if (request.headers.get("X-Recettes-Verif") === "1") {
    return reponseJson({ ok: true, verifie: true });
  }

  try {
    const body = await request.text();
    // Validation minimale : le corps doit être un JSON valide avec une clé "recettes"
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.recettes)) {
      throw new Error("Format invalide");
    }
    const nbNouveau = parsed.recettes.length;
    const forcer = request.headers.get("X-Recettes-Forcer") === "1";

    let sauvegardeOk = null;
    const precedent = await env.RECETTES_KV.get(KV_KEY);

    if (precedent) {
      // --- Garde-fou contre l'effacement ---
      if (!forcer) {
        const nbPrecedent = compterRecettes(precedent);
        const nbNouveauTexte = compterRecettes(body);

        if ((nbPrecedent - nbNouveauTexte) > MAX_BAISSE_RECETTES) {
          return reponseJson({
            error: "Enregistrement refusé par sécurité",
            detail: "Le nombre de recettes passerait de " + nbPrecedent + " à " + nbNouveauTexte
          }, 409);
        }
        if (precedent.length > POIDS_MINI_CONTROLE && body.length < precedent.length * SEUIL_POIDS) {
          return reponseJson({
            error: "Enregistrement refusé par sécurité",
            detail: "La base perdrait plus de 30 % de son poids (" + precedent.length + " → " + body.length + " caractères)"
          }, 409);
        }
      }

      // --- Sauvegarde automatique de la version actuelle (n'empêche jamais l'enregistrement) ---
      try {
        await sauvegarderAvant(env, precedent);
        sauvegardeOk = true;
      } catch (e) {
        sauvegardeOk = false;
      }
    }

    await env.RECETTES_KV.put(KV_KEY, body);
    return reponseJson({ ok: true, sauvegarde: sauvegardeOk });
  } catch (e) {
    return reponseJson({
      error: "Échec de l'enregistrement",
      detail: messageErreur(e)
    }, 400);
  }
}
