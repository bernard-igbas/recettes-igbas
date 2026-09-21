// ============================================================
// recettes-igbas (aliments.js) — v2.0 — 21/09/2026 — Validé par Bernard : EN ATTENTE
// ------------------------------------------------------------
// CHANGELOG
//  v2.0 (21/09/2026) : SÉCURITÉ, alignée sur data.js v1.6
//    - Le code secret vient désormais de la variable Cloudflare
//      RECETTES_ADMIN_CODE (la même que pour les recettes) au lieu de
//      l'ancienne variable RECETTES_CODE, dont la valeur était lisible
//      dans la page gestion-aliments-ig.html.
//    - Vérification d'accès (en-tête X-Recettes-Verif: 1) : confirme que le
//      code est bon sans rien enregistrer.
//    - Sauvegardes automatiques avant écrasement : une par heure (48 h) et
//      une par jour (30 jours). Clés "aliments-sauvegarde-heure-..." et
//      "aliments-sauvegarde-jour-..." (+ repère "aliments-sauvegardes-index").
//    - Garde-fou : enregistrement REFUSÉ (409) s'il supprimait plus de 20
//      aliments d'un coup, ou si la liste perdait plus de 30 % de son poids.
//      Contournable volontairement avec l'en-tête X-Recettes-Forcer: 1.
//    - Lecture : en cas d'erreur, vraie erreur (500) au lieu d'une liste vide.
//    Nécessite gestion-aliments-ig.html v6.
//  v1.0 : version d'origine (sans numéro)
// ============================================================
// functions/api/aliments.js
// Route : /api/aliments
// GET  -> renvoie la liste des aliments/IG stockée
// POST -> enregistre la liste envoyée (protégé par le header X-Recettes-Code)
//
// Nécessite, côté Cloudflare Pages (projet recettes-igbas) :
//  - un namespace KV lié à ce projet avec le binding "ALIMENTS_KV"
//    (distinct de RECETTES_KV)
//  - la variable d'environnement "RECETTES_ADMIN_CODE" (la même que pour
//    functions/api/data.js)

const KV_KEY = "aliments-data";
const KV_INDEX = "aliments-sauvegardes-index";

// Garde-fou
const MAX_BAISSE_ALIMENTS = 20;  // plus de 20 aliments en moins d'un coup = refus
const SEUIL_POIDS = 0.7;         // liste réduite à moins de 70 % de son poids = refus
const POIDS_MINI_CONTROLE = 5000; // le contrôle de poids ne s'applique qu'aux listes > 5 000 caractères

// Durées de conservation des sauvegardes (en secondes)
const TTL_HEURE = 48 * 3600;
const TTL_JOUR = 30 * 24 * 3600;

function messageErreur(e) {
  return String((e && e.message) || e);
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
    const brutIndex = await env.ALIMENTS_KV.get(KV_INDEX);
    if (brutIndex) index = JSON.parse(brutIndex) || {};
  } catch (e) { index = {}; }

  let modifie = false;
  if (index.jour !== jour) {
    await env.ALIMENTS_KV.put("aliments-sauvegarde-jour-" + jour, brutPrecedent, { expirationTtl: TTL_JOUR });
    index.jour = jour;
    modifie = true;
  }
  if (index.heure !== heure) {
    await env.ALIMENTS_KV.put("aliments-sauvegarde-heure-" + heure, brutPrecedent, { expirationTtl: TTL_HEURE });
    index.heure = heure;
    modifie = true;
  }
  if (modifie) {
    await env.ALIMENTS_KV.put(KV_INDEX, JSON.stringify(index));
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.ALIMENTS_KV.get(KV_KEY);
    if (raw) {
      return new Response(raw, { headers: { "Content-Type": "application/json" } });
    }
    // Rien en base pour l'instant (premier lancement) : on se réamorce depuis le
    // fichier aliments.json déployé avec le site, puis on écrit le résultat en
    // base pour que les prochaines lectures/écritures partent de cette même liste.
    const fallback = await env.ASSETS.fetch(new URL("/aliments.json", context.request.url));
    const donneesInitiales = fallback.ok ? await fallback.text() : "[]";
    await env.ALIMENTS_KV.put(KV_KEY, donneesInitiales);
    return new Response(donneesInitiales, { headers: { "Content-Type": "application/json" } });
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
    // Validation minimale : le corps doit être un tableau d'aliments {nom, ig}
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      throw new Error("Format invalide");
    }
    const nbNouveau = parsed.length;
    const forcer = request.headers.get("X-Recettes-Forcer") === "1";

    let sauvegardeOk = null;
    const precedent = await env.ALIMENTS_KV.get(KV_KEY);

    if (precedent) {
      // --- Garde-fou contre l'effacement ---
      if (!forcer) {
        let nbPrecedent = null;
        try {
          const p = JSON.parse(precedent);
          if (Array.isArray(p)) nbPrecedent = p.length;
        } catch (e) { nbPrecedent = null; }

        if (nbPrecedent !== null && (nbPrecedent - nbNouveau) > MAX_BAISSE_ALIMENTS) {
          return reponseJson({
            error: "Enregistrement refusé par sécurité",
            detail: "Le nombre d'aliments passerait de " + nbPrecedent + " à " + nbNouveau
          }, 409);
        }
        if (precedent.length > POIDS_MINI_CONTROLE && body.length < precedent.length * SEUIL_POIDS) {
          return reponseJson({
            error: "Enregistrement refusé par sécurité",
            detail: "La liste perdrait plus de 30 % de son poids (" + precedent.length + " → " + body.length + " caractères)"
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

    await env.ALIMENTS_KV.put(KV_KEY, body);
    return reponseJson({ ok: true, sauvegarde: sauvegardeOk });
  } catch (e) {
    return reponseJson({
      error: "Échec de l'enregistrement",
      detail: messageErreur(e)
    }, 400);
  }
}
