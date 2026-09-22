// ============================================================
// recettes-igbas (photo.js) — v1.0 — 22/09/2026 — Validé par Bernard : EN ATTENTE
// ------------------------------------------------------------
// CHANGELOG
//  v1.0 (22/09/2026) : nouveau fichier. Chaque photo est stockée séparément
//    des recettes, dans sa propre case (binding PHOTOS_KV). La fiche recette
//    ne garde plus qu'une adresse ("/api/photo?id=...") au lieu de la photo
//    elle-même. But : garder l'enregistrement d'une recette rapide, quel que
//    soit le nombre de photos (constaté le 22/09/2026 : 7,4 s pour 234 photos,
//    contre 0,7 s au départ).
// ============================================================
// functions/api/photo.js
// Route : /api/photo
// GET  ?id=ID   -> renvoie l'image (accès libre, comme sur le site public)
// POST          -> enregistre une photo envoyée en "data URL" (protégé par
//                   le header X-Recettes-Code), renvoie { id, url }
//
// Nécessite, côté Cloudflare Pages (projet recettes-igbas) :
//  - un namespace KV lié à ce projet avec le binding "PHOTOS_KV"
//    (distinct de RECETTES_KV et ALIMENTS_KV)
//  - la variable d'environnement "RECETTES_ADMIN_CODE" (déjà en place)

function messageErreur(e) {
  return String((e && e.message) || e);
}

function reponseJson(objet, statut) {
  return new Response(JSON.stringify(objet), {
    status: statut || 200,
    headers: { "Content-Type": "application/json" }
  });
}

// Décode une "data URL" (ex. "data:image/jpeg;base64,XXXX") en octets bruts + type.
function decoderDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) throw new Error("Format de photo invalide");
  const type = m[1];
  const binaire = atob(m[2]);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return { type, octets };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return reponseJson({ error: "id manquant" }, 400);

  try {
    const dataUrl = await env.PHOTOS_KV.get("photo-" + id);
    if (!dataUrl) return reponseJson({ error: "Photo introuvable" }, 404);
    const { type, octets } = decoderDataUrl(dataUrl);
    return new Response(octets, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
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

  try {
    const dataUrl = await request.text();
    // Validation minimale : on vérifie juste que le format est décodable.
    decoderDataUrl(dataUrl);

    const id = crypto.randomUUID();
    await env.PHOTOS_KV.put("photo-" + id, dataUrl);
    return reponseJson({ ok: true, id, url: "/api/photo?id=" + id });
  } catch (e) {
    return reponseJson({
      error: "Échec de l'enregistrement de la photo",
      detail: messageErreur(e)
    }, 400);
  }
}
