// Vercel serverless function — proxies a search to the OSINT Industries API.
// The API key is NEVER exposed to the browser: it lives only in this server-side function,
// read from the OSINT_INDUSTRIES_API_KEY environment variable set in your Vercel project.
//
// Required environment variables:
//   SEARCH_TOOL_PASSWORDS     — comma-separated list of valid access codes (set by you), e.g.
//                               809231,809232,809233,809234,809235,809236,809237,809238,809239
//   OSINT_INDUSTRIES_API_KEY  — your OSINT Industries API key (Settings > API keys on osint.industries)
//
// Endpoint documentation: https://docs.osint.industries/reference/search

const { recordSearchAndMaybeAlert } = require('./_quota');

const ALLOWED_TYPES = ['email', 'phone', 'username', 'name', 'wallet'];

function getValidCodes() {
  const raw = process.env.SEARCH_TOOL_PASSWORDS || '';
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const { password, type, query, premium } = body || {};

  const validCodes = getValidCodes();
  const apiKey = process.env.OSINT_INDUSTRIES_API_KEY;

  if (validCodes.length === 0 || !apiKey) {
    res.status(500).json({
      error: 'Server not configured. Set SEARCH_TOOL_PASSWORDS and OSINT_INDUSTRIES_API_KEY in your Vercel project (Settings > Environment Variables), then redeploy.'
    });
    return;
  }

  if (!password || !validCodes.includes(String(password))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!ALLOWED_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid search type. Must be one of: ${ALLOWED_TYPES.join(', ')}` });
    return;
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'Missing search query' });
    return;
  }

  const params = new URLSearchParams({ type, query: query.trim() });
  if (premium) params.set('premium', 'true');

  // Fired in parallel with the upstream call below (not sequentially) so the monthly
  // per-code quota counter/alert email never adds noticeable latency to the search itself.
  const quotaPromise = recordSearchAndMaybeAlert(password);

  try {
    const upstream = await fetch(`https://api.osint.industries/v2/request?${params.toString()}`, {
      method: 'GET',
      headers: { 'api-key': apiKey }
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    if (!upstream.ok) {
      await quotaPromise;
      res.status(upstream.status).json({
        error: `OSINT Industries API error (HTTP ${upstream.status})`,
        details: data
      });
      return;
    }

    await quotaPromise;
    res.status(200).json({ ok: true, result: data });
  } catch (err) {
    await quotaPromise;
    res.status(502).json({ error: 'Failed to reach the OSINT Industries API', details: String(err) });
  }
};
