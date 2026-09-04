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
    return new Response(JSON.stringify({ error: "Échec de l'enregistrement" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
