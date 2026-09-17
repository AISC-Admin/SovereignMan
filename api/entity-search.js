// Vercel serverless function — aggregates three open, key-free registry/leak-data sources
// for company & legal-entity searches. Unlike /api/search (OSINT Industries), none of these
// three sources require a vendor API key or account:
//
//   1. API Recherche d'entreprises (data.gouv.fr / Etalab) — French company registry (SIRENE-based)
//      Docs: https://www.data.gouv.fr/dataservices/api-recherche-dentreprises
//   2. GLEIF API — global Legal Entity Identifier (LEI) registry
//      Docs: https://www.gleif.org/en/lei-data/gleif-api
//   3. ICIJ Offshore Leaks Database (Reconciliation API) — Panama/Paradise/Pandora Papers,
//      Offshore Leaks, Swiss Leaks. Docs: https://offshoreleaks.icij.org/pages/database
//      NOTE (licensing): ICIJ data is dual-licensed ODbL (structure) + CC BY-SA (content).
//      Commercial/public reuse is allowed but REQUIRES attribution to ICIJ and share-alike
//      terms on any derivative — keep the "Source: ICIJ Offshore Leaks Database" credit
//      visible next to these results on the page.
//
// Two more sources are included when configured — both optional, both skipped silently
// (not blocking the free sources above) if their credentials are absent:
//   4. Pappers (api.pappers.fr) — commercial French company data (KBIS, dirigeants,
//      finances, actes). Needs an account/key you create yourself at pappers.fr —
//      set PAPPERS_API_KEY below.
//   5. Zefix (zefix.admin.ch) — Switzerland's official federal commercial register API
//      (Federal Office of Justice). Genuinely free: self-service account registration
//      at zefix.admin.ch gives you a username/password for Basic Auth — no paid
//      contract. Set ZEFIX_USERNAME and ZEFIX_PASSWORD below.
//      NOTE: field names for this module are best-effort, based on Zefix's published
//      swagger schema, which we could not execute a live test call against from this
//      environment — always cross-check against the "raw JSON" toggle on the card
//      after your first real search, and tell us if any field looks off so we can fix it.
//
// This endpoint is still gated by the same SEARCH_TOOL_PASSWORDS access code as the rest
// of the tool. Required environment variable: SEARCH_TOOL_PASSWORDS (same as /api/search).
// Optional environment variables: PAPPERS_API_KEY, ZEFIX_USERNAME, ZEFIX_PASSWORD.

const { recordSearchAndMaybeAlert } = require('./_quota');

function getValidCodes() {
  const raw = process.env.SEARCH_TOOL_PASSWORDS || '';
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

async function safeFetchJson(url, opts) {
  try {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err) };
  }
}

function fieldEntry(properKey, value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return { proper_key: properKey, value, type };
}

const ETAT_LABELS = { A: 'Active', C: 'Cessée' };

async function searchFrenchCompany(query) {
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&page=1&per_page=3`;
  const { ok, data } = await safeFetchJson(url);
  const results = data && Array.isArray(data.results) ? data.results : [];
  if (!ok || !results.length) {
    return { module: 'entreprise_fr', status: 'not found', spec_format: [] };
  }

  const hit = results[0];
  const siege = hit.siege || {};
  const dirigeants = Array.isArray(hit.dirigeants) ? hit.dirigeants : [];
  const dirNames = dirigeants
    .map(d => [d.prenoms, d.nom].filter(Boolean).join(' ') || d.denomination || d.nom || '')
    .filter(Boolean);
  const addressParts = [siege.adresse, siege.code_postal, siege.libelle_commune].filter(Boolean);
  const others = results.slice(1, 3).map(r => r.nom_complet || r.siren).filter(Boolean);
  const etat = hit.etat_administratif ? (ETAT_LABELS[hit.etat_administratif] || hit.etat_administratif) : null;

  const spec = [
    fieldEntry('SIREN', hit.siren, 'text'),
    fieldEntry('Nom', hit.nom_complet || hit.nom_raison_sociale, 'text'),
    fieldEntry('Sigle', hit.sigle, 'text'),
    fieldEntry('Forme juridique', hit.nature_juridique, 'text'),
    fieldEntry('Date de création', hit.date_creation ? `${hit.date_creation}T00:00:00` : null, 'datetime'),
    fieldEntry('État administratif', etat, 'text'),
    fieldEntry('Activité principale (NAF)', hit.activite_principale, 'text'),
    fieldEntry('Tranche effectif salarié', hit.tranche_effectif_salarie, 'text'),
    fieldEntry('Adresse du siège', addressParts.join(', '), 'text'),
    dirNames.length ? { proper_key: 'Dirigeants', value: dirNames.slice(0, 12), type: 'list' } : null,
    fieldEntry('Fiche complète', hit.siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${hit.siren}` : null, 'url'),
    others.length ? { proper_key: `Autres correspondances (${data.total_results || results.length} au total)`, value: others, type: 'list' } : null
  ].filter(Boolean);

  return { module: 'entreprise_fr', status: 'found', spec_format: spec };
}

async function searchGleif(query) {
  const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(query)}&page%5Bsize%5D=3`;
  const { ok, data } = await safeFetchJson(url);
  const list = data && Array.isArray(data.data) ? data.data : [];
  if (!ok || !list.length) {
    return { module: 'gleif', status: 'not found', spec_format: [] };
  }

  const hit = list[0];
  const attr = hit.attributes || {};
  const entity = attr.entity || {};
  const legalName = entity.legalName && entity.legalName.name;
  const legalForm = entity.legalForm && (entity.legalForm.id || entity.legalForm.other);
  const addr = entity.legalAddress || {};
  const addressParts = [].concat(addr.addressLines || [], [addr.city, addr.region, addr.postalCode, addr.country]).filter(Boolean);
  const lei = hit.id || attr.lei;
  const others = list.slice(1, 3)
    .map(r => r.attributes && r.attributes.entity && r.attributes.entity.legalName && r.attributes.entity.legalName.name)
    .filter(Boolean);

  const spec = [
    fieldEntry('LEI', lei, 'text'),
    fieldEntry('Nom légal', legalName, 'text'),
    fieldEntry('Forme juridique', legalForm, 'text'),
    fieldEntry('Statut de l’entité', entity.status, 'text'),
    fieldEntry('Statut enregistrement LEI', attr.registration && attr.registration.status, 'text'),
    fieldEntry('Adresse', addressParts.join(', '), 'text'),
    fieldEntry('Fiche GLEIF', lei ? `https://search.gleif.org/#/record/${lei}` : null, 'url'),
    others.length ? { proper_key: 'Autres correspondances', value: others, type: 'list' } : null
  ].filter(Boolean);

  return { module: 'gleif', status: 'found', spec_format: spec };
}

async function searchIcij(query) {
  const { ok, data } = await safeFetchJson('https://offshoreleaks.icij.org/api/v1/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 10 })
  });
  const matches = data && Array.isArray(data.result) ? data.result : [];
  if (!ok || !matches.length) {
    return { module: 'icij_offshore_leaks', status: 'not found', icij_matches: [] };
  }

  const rows = matches.slice(0, 10).map(m => ({
    name: m.name || 'Unknown',
    id: m.id,
    score: typeof m.score === 'number' ? Math.round(m.score) : null,
    types: Array.isArray(m.type) ? m.type.map(t => t.name || t.id).filter(Boolean) : [],
    url: m.id ? `https://offshoreleaks.icij.org/nodes/${encodeURIComponent(m.id)}` : null
  }));

  return { module: 'icij_offshore_leaks', status: 'found', icij_matches: rows };
}

async function searchPappers(query) {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) return null; // not configured on this deployment — skip silently, other sources still run

  const url = `https://api.pappers.fr/v2/recherche?api_token=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&par_page=3`;
  const { ok, data } = await safeFetchJson(url);
  const list = data && (data.resultats || data.entreprises || data.results || data.data);
  const results = Array.isArray(list) ? list : [];
  if (!ok || !results.length) {
    return { module: 'pappers', status: 'not found', spec_format: [] };
  }

  const hit = results[0];
  const siren = hit.siren;
  const nom = hit.nom_entreprise || hit.denomination || hit.nom_complet || hit.nom;
  const siege = hit.siege || {};
  const address = [siege.adresse_ligne_1 || siege.adresse, siege.code_postal, siege.ville || siege.libelle_commune]
    .filter(Boolean).join(', ');
  const dirigeants = Array.isArray(hit.dirigeants) ? hit.dirigeants : [];
  const dirNames = dirigeants
    .map(d => d.nom_complet || [d.prenom, d.nom].filter(Boolean).join(' ') || d.denomination)
    .filter(Boolean);
  const others = results.slice(1, 3).map(r => r.nom_entreprise || r.denomination || r.siren).filter(Boolean);
  const ca = hit.chiffre_affaires || hit.chiffre_affaires_dernier;

  const spec = [
    fieldEntry('SIREN', siren, 'text'),
    fieldEntry('Nom', nom, 'text'),
    fieldEntry('Forme juridique', hit.forme_juridique, 'text'),
    fieldEntry('Date de création', hit.date_creation ? `${hit.date_creation}T00:00:00` : null, 'datetime'),
    fieldEntry('Statut', hit.statut_rcs || hit.statut || hit.etat_administratif, 'text'),
    fieldEntry('Code NAF / Activité', [hit.code_naf, hit.libelle_code_naf].filter(Boolean).join(' — '), 'text'),
    fieldEntry('Chiffre d’affaires', ca ? `${Number(ca).toLocaleString('fr-FR')} €` : null, 'text'),
    fieldEntry('Adresse du siège', address, 'text'),
    dirNames.length ? { proper_key: 'Dirigeants', value: dirNames.slice(0, 12), type: 'list' } : null,
    fieldEntry('Fiche Pappers', siren ? `https://www.pappers.fr/entreprise/${siren}` : null, 'url'),
    others.length ? { proper_key: 'Autres correspondances', value: others, type: 'list' } : null
  ].filter(Boolean);

  return { module: 'pappers', status: 'found', spec_format: spec };
}

async function searchZefix(query) {
  const user = process.env.ZEFIX_USERNAME;
  const pass = process.env.ZEFIX_PASSWORD;
  if (!user || !pass) return null; // not configured on this deployment — skip silently

  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const { ok, data } = await safeFetchJson('https://www.zefix.admin.ch/ZefixPublicREST/api/v1/firm/search.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    },
    body: JSON.stringify({ name: query, languageKey: 'en' })
  });

  const list = data && Array.isArray(data.list) ? data.list : (Array.isArray(data) ? data : []);
  if (!ok || !list.length) {
    return { module: 'zefix', status: 'not found', spec_format: [] };
  }

  const hit = list[0];
  const legalFormNames = hit.legalForm && hit.legalForm.name;
  const legalFormName = legalFormNames && (legalFormNames.en || legalFormNames.de || Object.values(legalFormNames)[0]);
  const addr = hit.address || {};
  const addressParts = [addr.street, addr.houseNumber, addr.swissZipCode, addr.town].filter(Boolean);
  const others = list.slice(1, 3).map(r => r.name).filter(Boolean);
  const searchUrl = `https://www.zefix.ch/en/search/entity/list?name=${encodeURIComponent(query)}`;

  const spec = [
    fieldEntry('UID (CHE)', hit.uid || hit.chid, 'text'),
    fieldEntry('Nom', hit.name, 'text'),
    fieldEntry('Forme juridique', legalFormName, 'text'),
    fieldEntry('Siège légal (canton)', hit.legalSeat, 'text'),
    fieldEntry('Statut', hit.status, 'text'),
    fieldEntry('Adresse', addressParts.join(', '), 'text'),
    fieldEntry('Fiche Zefix', searchUrl, 'url'),
    others.length ? { proper_key: 'Autres correspondances', value: others, type: 'list' } : null
  ].filter(Boolean);

  return { module: 'zefix', status: 'found', spec_format: spec };
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
  const { password, query } = body || {};

  const validCodes = getValidCodes();
  if (validCodes.length === 0) {
    res.status(500).json({ error: 'Server not configured: missing SEARCH_TOOL_PASSWORDS environment variable.' });
    return;
  }
  if (!password || !validCodes.includes(String(password))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'Missing search query' });
    return;
  }

  const q = query.trim();
  // Counts toward the same monthly per-code quota as /api/search and /api/face-search
  // (the client asked for ALL search types combined). Runs in parallel, never blocks.
  const quotaPromise = recordSearchAndMaybeAlert(password);

  const [fr, gleif, icij, pappers, zefix] = await Promise.all([
    searchFrenchCompany(q).catch(() => ({ module: 'entreprise_fr', status: 'not found', spec_format: [] })),
    searchGleif(q).catch(() => ({ module: 'gleif', status: 'not found', spec_format: [] })),
    searchIcij(q).catch(() => ({ module: 'icij_offshore_leaks', status: 'not found', icij_matches: [] })),
    searchPappers(q).catch(() => null),
    searchZefix(q).catch(() => null)
  ]);

  const modules = [fr, gleif, icij];
  if (pappers) modules.push(pappers);
  if (zefix) modules.push(zefix);

  await quotaPromise;
  res.status(200).json({ ok: true, result: { data: modules } });
};
