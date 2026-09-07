
// functions/api/aliments.js
// Route : /api/aliments
// GET  -> renvoie la liste des aliments/IG stockée
// POST -> enregistre la liste envoyée (protégé par le header X-Recettes-Code)
//
// Nécessite, côté Cloudflare Pages (projet recettes-igbas) :
//  - un namespace KV lié à ce projet avec le binding "ALIMENTS_KV"
//    (créer un NOUVEAU namespace KV, distinct de RECETTES_KV)
//  - la même variable d'environnement "RECETTES_CODE" déjà utilisée par
//    functions/api/data.js (pas besoin d'en recréer une autre)

const KV_KEY = "aliments-data";

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
    return new Response(JSON.stringify([]), {
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
    // Validation minimale : le corps doit être un tableau d'aliments {nom, ig}
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      throw new Error("Format invalide");
    }
    await env.ALIMENTS_KV.put(KV_KEY, JSON.stringify(parsed));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Échec de l'enregistrement" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
