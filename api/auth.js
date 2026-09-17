// Vercel serverless function — validates the access code for the internal search tool.
// Required environment variable: SEARCH_TOOL_PASSWORDS
// Comma-separated list of valid access codes, e.g.:
//   SEARCH_TOOL_PASSWORDS=809231,809232,809233,809234,809235,809236,809237,809238,809239
// Each teammate can be given a different code from the list.

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

  const validCodes = getValidCodes();
  if (validCodes.length === 0) {
    res.status(500).json({ error: 'Server not configured: missing SEARCH_TOOL_PASSWORDS environment variable.' });
    return;
  }

  const password = body && body.password;
  if (password && validCodes.includes(String(password))) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Invalid access code' });
  }
};
