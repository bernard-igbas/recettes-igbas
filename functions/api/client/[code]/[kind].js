// functions/api/client/[code]/[kind].js
//
// Point d'entrée de la base commune pour le portail client.
// [code] = code d'accès du client (ex: ABC123)
// [kind] = nom du module (ex: "semainier", "profil", plus tard "questionnaire"...)
//
// Nécessite une base KV Cloudflare créée et liée à ce projet Pages
// sous le nom IGBAS_KV (Paramètres du projet > Functions > Liaisons KV).
// C'est le même principe que pour compta-igbas.

export async function onRequestGet({ params, env }) {
  const key = `client:${params.code}:${params.kind}`;
  const raw = await env.IGBAS_KV.get(key);
  return new Response(raw || "null", {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestPut({ params, env, request }) {
  const key = `client:${params.code}:${params.kind}`;
  const body = await request.text();
  await env.IGBAS_KV.put(key, body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
}
