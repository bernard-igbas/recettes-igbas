// ============================================================
// recettes-igbas (data.js) — v1.5 — 21/09/2026 — Validé par Bernard : EN ATTENTE
// ------------------------------------------------------------
// CHANGELOG
//  v1.5 (21/09/2026) : SÉCURITÉ — le code secret n'est plus partagé avec la
//    page publique. Il est lu dans une variable Cloudflare dédiée :
//    RECETTES_ADMIN_CODE. Ajout d'une "vérification d'accès" (en-tête
//    X-Recettes-Verif: 1) : le serveur confirme si le code est bon SANS rien
//    enregistrer, pour activer l'accès administrateur d'un appareil.
//    Si la variable est absente, message explicite (erreur 500).
//    Inclut le nettoyage de la v1.4 (plus de test de diagnostic).
//    Nécessite index.html v30.
//  v1.4 (21/09/2026) : retrait du test de diagnostic et du mot temporaire
//  v1.3 / v1.2 / v1.1 (21/09/2026) : versions de diagnostic (retirées)
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

function messageErreur(e) {
  return String((e && e.message) || e);
}

function reponseJson(objet, statut) {
  return new Response(JSON.stringify(objet), {
    status: statut || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.RECETTES_KV.get(KV_KEY);
    const data = raw ? JSON.parse(raw) : { recettes: [] };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ recettes: [] }), {
      headers: { "Content-Type": "application/json" }
    });
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
    await env.RECETTES_KV.put(KV_KEY, JSON.stringify(parsed));
    return reponseJson({ ok: true });
  } catch (e) {
    return reponseJson({
      error: "Échec de l'enregistrement",
      detail: messageErreur(e)
    }, 400);
  }
}
