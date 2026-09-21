// ============================================================
// recettes-igbas (data.js) — v1.1 — 21/09/2026 — Validé par Bernard : EN ATTENTE
// ------------------------------------------------------------
// CHANGELOG
//  v1.1 (21/09/2026) : diagnostic de l'échec d'enregistrement
//    - Ajout d'un test : /api/data?diag=CODE
//      (lit la base, puis écrit uniquement dans deux clés de TEST
//       "diag-test-petit" et "diag-test-copie" — la vraie base
//       "recettes-data" n'est jamais modifiée par ce test)
//    - Si l'enregistrement échoue, la réponse contient maintenant
//      un champ "detail" avec la vraie cause (le reste est inchangé)
//  v1.0 : version d'origine (sans numéro)
// ============================================================
// functions/api/data.js
// Route : /api/data
// GET  -> renvoie les données stockées (les recettes)
// POST -> enregistre les données envoyées (protégé par le header X-Recettes-Code)
//
// Nécessite, côté Cloudflare Pages :
//  - un namespace KV lié à ce projet avec le binding "RECETTES_KV"
//  - une variable d'environnement "RECETTES_CODE" (même valeur que RECETTES_CODE
//    dans index.html)

const KV_KEY = "recettes-data";

function messageErreur(e) {
  return String((e && e.message) || e);
}

async function diagnostic(env) {
  const sortie = { fichier: "data.js v1.1 — 21/09/2026", tests: {} };
  let brut = null;

  // Test 1 : lire la vraie base
  try {
    brut = await env.RECETTES_KV.get(KV_KEY);
    sortie.tests["1_lecture_base"] = {
      resultat: "OK",
      taille_caracteres: brut ? brut.length : 0,
      taille_Mo_environ: brut ? Math.round((brut.length / 1048576) * 100) / 100 : 0
    };
  } catch (e) {
    sortie.tests["1_lecture_base"] = { resultat: "ECHEC", cause: messageErreur(e) };
  }

  // Test 2 : écrire une toute petite valeur dans une clé de test
  try {
    await env.RECETTES_KV.put("diag-test-petit", "test " + new Date().toISOString());
    sortie.tests["2_ecriture_petite"] = { resultat: "OK" };
  } catch (e) {
    sortie.tests["2_ecriture_petite"] = { resultat: "ECHEC", cause: messageErreur(e) };
  }

  // Test 3 : écrire une copie de la base (même poids) dans une clé de test
  if (brut) {
    try {
      await env.RECETTES_KV.put("diag-test-copie", brut);
      sortie.tests["3_ecriture_copie_complete"] = { resultat: "OK" };
    } catch (e) {
      sortie.tests["3_ecriture_copie_complete"] = { resultat: "ECHEC", cause: messageErreur(e) };
    }
  } else {
    sortie.tests["3_ecriture_copie_complete"] = { resultat: "NON TESTE (base non lue)" };
  }

  return new Response(JSON.stringify(sortie, null, 2), {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Mode diagnostic : /api/data?diag=CODE
  const url = new URL(request.url);
  const diag = url.searchParams.get("diag");
  if (diag !== null) {
    if (!diag || diag !== env.RECETTES_CODE) {
      return new Response(JSON.stringify({ error: "Code invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    return diagnostic(env);
  }

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
  const code = request.headers.get("X-Recettes-Code");
  if (!code || code !== env.RECETTES_CODE) {
    return new Response(JSON.stringify({ error: "Code invalide" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const body = await request.text();
    // Validation minimale : le corps doit être un JSON valide avec une clé "recettes"
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.recettes)) {
      throw new Error("Format invalide");
    }
    await env.RECETTES_KV.put(KV_KEY, JSON.stringify(parsed));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Échec de l'enregistrement",
      detail: messageErreur(e)
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
