// Shared helper — NOT a route (filename starts with "_", which Vercel's file-based
// router excludes from becoming an endpoint). Tracks, per access code, how many
// searches were run this calendar month, across ALL search types (/api/search,
// /api/entity-search, /api/face-search), and sends a one-time warning email once a
// code crosses its threshold. Required by the client: warn at 200/300 for the normal
// codes, and at the equivalent ~2/3 mark for the two codes with a higher 500/month
// limit — nothing is ever blocked, this only sends an email.
//
// STORAGE — Upstash Redis (REST API, no SDK/dependency needed):
//   1. Create a free database at https://upstash.com (or via the Vercel Marketplace:
//      your Vercel project → Storage → Browse Marketplace → Upstash → Redis).
//   2. Copy its REST URL and REST token into your Vercel project's environment
//      variables: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
//   If these are not set, quota counting/alerting is silently skipped — every search
//   endpoint keeps working exactly as before, you simply won't get the warning email.
//
// EMAIL — sent via Resend (https://resend.com):
//   1. Create a free Resend account, verify a sending domain (or use their shared
//      test domain while testing), and generate an API key.
//   2. Set RESEND_API_KEY in Vercel. Optionally set QUOTA_ALERT_FROM (a verified
//      sender, e.g. "SovereignMan Search <alerts@sovereignman.dev>") and
//      QUOTA_ALERT_TO (defaults to contact@sovereignman.dev, as requested).
//   If RESEND_API_KEY is not set, the alert is skipped silently — never blocks a search.
//
// TO CHANGE THE LIMITS: edit DEFAULT_LIMIT / HIGH_LIMIT / HIGH_LIMIT_CODES below.

const DEFAULT_LIMIT = 300;
const HIGH_LIMIT = 500;
const HIGH_LIMIT_CODES = new Set(['809237', '809238', '809239']);
// Warning fires once per code per month, at this fraction of that code's own limit.
// 2/3 of 300 = 200 (exactly what was asked); 2/3 of 500 ≈ 334, kept proportional.
const WARN_RATIO = 2 / 3;
const TTL_SECONDS = 60 * 60 * 24 * 40; // ~40 days: comfortably outlives any calendar month

function limitForCode(code) {
  return HIGH_LIMIT_CODES.has(String(code)) ? HIGH_LIMIT : DEFAULT_LIMIT;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function upstash(commandParts) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // not configured — tracking disabled, callers no-op
  try {
    const path = commandParts.map(p => encodeURIComponent(String(p))).join('/');
    const resp = await fetch(`${url.replace(/\/+$/, '')}/${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    return data && Object.prototype.hasOwnProperty.call(data, 'result') ? data.result : null;
  } catch (e) {
    return null;
  }
}

async function sendQuotaAlertEmail({ code, count, limit, monthKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // not configured — skip silently
  const from = process.env.QUOTA_ALERT_FROM || 'SovereignMan Search <alerts@sovereignman.dev>';
  const to = process.env.QUOTA_ALERT_TO || 'contact@sovereignman.dev';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to,
        subject: `Recherche — code ${code} : ${count}/${limit} ce mois-ci (${monthKey})`,
        text: `Le code d'accès ${code} vient de dépasser ${count} recherches sur une limite mensuelle de ${limit}, pour ${monthKey}.\n\nCeci est une alerte automatique — aucune recherche n'a été bloquée, l'outil continue de fonctionner normalement pour ce code. Vous recevrez au plus une alerte par code et par mois.`
      })
    });
  } catch (e) {
    // Never let an email failure affect the actual search request.
  }
}

// Call once per authenticated search request (any endpoint). Never throws, never
// meaningfully blocks — safe to await without try/catch at call sites.
async function recordSearchAndMaybeAlert(code) {
  if (!code) return;
  const monthKey = currentMonthKey();
  const countKey = `sm:search:count:${code}:${monthKey}`;
  const warnedKey = `sm:search:warned:${code}:${monthKey}`;

  const count = await upstash(['INCR', countKey]);
  if (count === null) return; // Upstash not configured/unreachable — tracking disabled
  await upstash(['EXPIRE', countKey, String(TTL_SECONDS)]);

  const limit = limitForCode(code);
  const warnAt = Math.round(limit * WARN_RATIO);

  if (count >= warnAt) {
    // SET ... NX guarantees the email fires exactly once per code per month, even
    // if several requests cross the threshold concurrently.
    const firstTime = await upstash(['SET', warnedKey, '1', 'EX', String(TTL_SECONDS), 'NX']);
    if (firstTime === 'OK') {
      await sendQuotaAlertEmail({ code, count, limit, monthKey });
    }
  }
}

module.exports = { recordSearchAndMaybeAlert, limitForCode, currentMonthKey };
