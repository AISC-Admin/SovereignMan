// Vercel serverless function — proxies face search/verification requests to a self-hosted
// CompreFace instance (https://github.com/exadel-inc/CompreFace).
//
// READ BEFORE ENABLING THIS FEATURE:
//   1. CompreFace does NOT search the public internet for a face, unlike commercial
//      "reverse face search" services (PimEyes, FaceCheck.id, etc.). It only compares
//      faces against:
//        - a face collection YOU enroll yourself ahead of time ("recognize" mode), or
//        - two photos supplied together in the same request ("verify" mode).
//      If the goal is "upload a photo and find out who it is" against the open web,
//      CompreFace alone cannot do that — it needs its own collection of known faces.
//   2. CompreFace is not a hosted API you sign up for. You self-host the server
//      (Docker Compose) and it generates its own local API key from its admin UI —
//      there is no third-party vendor key to request. See SETUP-RECHERCHE.md for the
//      deployment steps (it needs a persistent host — Fly.io/Railway/a VPS — Vercel's
//      serverless functions cannot run the CompreFace server itself).
//   3. LEGAL — READ THIS: matching faces to identify a real person is biometric data
//      processing under GDPR Article 9 (special category data). This is prohibited by
//      default unless a specific legal basis applies (e.g. explicit consent, or a
//      substantial-public-interest basis set out in law) — "the photo was public" is
//      NOT a valid basis on its own. For a public-facing search tool operated from
//      Estonia, this almost certainly requires a DPIA (Art. 35) and legal sign-off
//      before going live. As a safeguard, this endpoint refuses to run at all unless
//      FACE_SEARCH_ENABLED=true is explicitly set — do not set it until that legal
//      review is done.
//
// Required environment variables (once your own CompreFace server is deployed):
//   SEARCH_TOOL_PASSWORDS  — same access codes as the rest of the tool
//   COMPREFACE_URL         — base URL of your CompreFace instance, e.g. https://compreface.yourhost.com
//   COMPREFACE_API_KEY     — the key CompreFace generated for its Recognition/Verification
//                             service (created in the CompreFace admin UI, not from us)
//   FACE_SEARCH_ENABLED    — must be exactly "true" to activate this endpoint

function getValidCodes() {
  const raw = process.env.SEARCH_TOOL_PASSWORDS || '';
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

function base64ToBlob(b64) {
  const clean = String(b64).replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(clean, 'base64');
  return new Blob([buf], { type: 'image/jpeg' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (process.env.FACE_SEARCH_ENABLED !== 'true') {
    res.status(503).json({
      error: 'Face search is disabled on this deployment. It stays off until FACE_SEARCH_ENABLED=true is set, and a self-hosted CompreFace server is configured — see SETUP-RECHERCHE.md. Get legal sign-off (GDPR Art. 9) before enabling.'
    });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const { password, mode, imageBase64, targetImageBase64 } = body || {};

  const validCodes = getValidCodes();
  const compreFaceUrl = process.env.COMPREFACE_URL;
  const apiKey = process.env.COMPREFACE_API_KEY;

  if (validCodes.length === 0 || !compreFaceUrl || !apiKey) {
    res.status(500).json({
      error: 'Server not configured. Set SEARCH_TOOL_PASSWORDS, COMPREFACE_URL and COMPREFACE_API_KEY in your Vercel project (Settings > Environment Variables), then redeploy.'
    });
    return;
  }
  if (!password || !validCodes.includes(String(password))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!imageBase64) {
    res.status(400).json({ error: 'Missing imageBase64' });
    return;
  }
  if (mode === 'verify' && !targetImageBase64) {
    res.status(400).json({ error: 'Verify mode requires both imageBase64 and targetImageBase64' });
    return;
  }

  try {
    const base = compreFaceUrl.replace(/\/+$/, '');
    let upstream;

    if (mode === 'verify') {
      // Face Verification service: compares two supplied photos directly, no enrollment needed.
      const form = new FormData();
      form.append('source_image', base64ToBlob(imageBase64), 'source.jpg');
      form.append('target_image', base64ToBlob(targetImageBase64), 'target.jpg');
      upstream = await fetch(`${base}/api/v1/verification/verify`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form
      });
    } else {
      // Recognition service: matches the uploaded photo against faces already enrolled
      // in your own CompreFace collection (added separately via its admin UI/API).
      const form = new FormData();
      form.append('file', base64ToBlob(imageBase64), 'probe.jpg');
      upstream = await fetch(`${base}/api/v1/recognition/recognize`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form
      });
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `CompreFace error (HTTP ${upstream.status})`, details: data });
      return;
    }
    res.status(200).json({ ok: true, mode: mode === 'verify' ? 'verify' : 'recognize', result: data });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach the CompreFace server', details: String(err) });
  }
};
