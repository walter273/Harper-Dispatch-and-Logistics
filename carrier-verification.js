const { randomUUID } = require('node:crypto');
const { isDispatchPlan, termsVersion } = require('./dispatch-plans');
const SOURCE = 'https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi';
const DAY = 86400000;
const result = (status, summary, source = 'Submitted intake') => ({ status, summary, source });
function number(value, prefix) {
  const text = String(value || '').trim().toUpperCase().replace(new RegExp(`^(?:${prefix})[\\s-]*`), '');
  return /^\d{1,8}$/.test(text) && Number(text) > 0 ? String(Number(text)) : '';
}
const name = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
function carriers(payload) {
  if (!payload || !Object.hasOwn(payload, 'content')) throw new Error('Invalid provider response');
  const rows = Array.isArray(payload.content) ? payload.content : [payload.content];
  return rows.filter(Boolean).map(row => row.carrier || row).filter(row => row && typeof row === 'object');
}
function createVerifier({ key = '', baseUrl = 'https://mobile.fmcsa.dot.gov/qc/services', fetchImpl = fetch } = {}) {
  let active = 0;
  async function lookup(route, signal) {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${route}`);
    url.searchParams.set('webKey', key);
    const response = await fetchImpl(url, { signal, redirect: 'error' });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('Provider unavailable');
    // Bound the upstream body as well as the request duration. Never retain URLs containing the key.
    let text = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      text += decoder.decode(chunk, { stream: true });
      if (text.length > 500000) throw new Error('Provider response too large');
    }
    text += decoder.decode();
    return carriers(JSON.parse(text));
  }
  async function run(intake, review, now = Date.now()) {
    const fields = intake.fields;
    const dot = number(fields.dot_number, 'USDOT|DOT');
    const mc = number(fields.mc_number, 'MC');
    const checks = {};
    const test = /\b(TEST|DEMO|FICTIONAL)\b/i.test(`${fields.legal_carrier_name || ''} ${fields.primary_contact || ''}`);
    checks.submission = test ? result('needs_review', 'Test or demonstration submission. Never use it as verified operating authority.') : result('passed', 'No test label detected. This does not prove the carrier is genuine.');
    const missing = ['legal_carrier_name', 'primary_contact', 'business_email', 'business_phone'].filter(field => !fields[field]?.trim());
    checks.contact = missing.length ? result('missing', `Missing: ${missing.join(', ')}.`) :
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.business_email) || fields.business_phone.replace(/\D/g, '').length < 10 ?
        result('needs_review', 'Email or telephone format needs correction.') : result('passed', 'Required contact fields have valid formats. Ownership of the email and phone is not verified.');
    checks.identifiers = !fields.dot_number || !fields.mc_number ? result('missing', 'Supply both USDOT and MC numbers, or have staff review whether authority is required.') :
      dot && mc ? result('passed', 'USDOT and MC formats are valid; registry matching is checked separately.') : result('needs_review', 'USDOT or MC number is invalid or a zero placeholder.');
    checks.identity = result('needs_review', 'Registry matching has not been completed.', SOURCE);
    checks.authority = result('needs_review', 'Operating status has not been checked.', SOURCE);
    if (test || !dot || !mc) {
      checks.identity.summary = checks.authority.summary = 'Registry lookup skipped for test or invalid identifiers. Correct the carrier information before verification.';
    } else if (!key) {
      checks.identity.summary = checks.authority.summary = 'FMCSA connection is not configured. An administrator must add the FMCSA WebKey; no carrier status has been verified.';
    } else if (active >= 4) {
      checks.identity.summary = checks.authority.summary = 'Registry checks are busy. Run the checks again shortly.';
    } else {
      active++;
      try {
        const signal = AbortSignal.timeout(8000);
        const [byDot, byMc] = await Promise.all([lookup(`carriers/${dot}`, signal), lookup(`carriers/docket-number/${mc}`, signal)]);
        const matches = byDot.filter(row => number(row.dotNumber, 'USDOT|DOT') === dot);
        const docketMatches = byMc.filter(row => number(row.dotNumber, 'USDOT|DOT') === dot);
        if (matches.length !== 1 || docketMatches.length !== 1) {
          checks.identity = result('needs_review', 'No unique matching carrier was returned for both USDOT and MC. Check the numbers against FMCSA.', SOURCE);
          checks.authority = result('needs_review', 'Operating status cannot pass until both identifiers match one carrier.', SOURCE);
        } else {
          const carrier = matches[0];
          const legalName = String(carrier.legalName || '').slice(0, 200);
          const legalMatch = Boolean(name(fields.legal_carrier_name)) && name(fields.legal_carrier_name) === name(legalName);
          checks.identity = result(legalMatch ? 'passed' : 'needs_review', legalMatch ?
            `Legal name, USDOT ${dot}, and MC ${mc} match the registry. This does not establish the applicant's authority to represent the carrier.` :
            `Submitted legal name differs from FMCSA: ${legalName || 'not supplied'}. Review the operating entity.`, SOURCE);
          const operate = carrier.allowToOperate ?? carrier.allowedToOperate;
          const oos = carrier.outOfService;
          const pass = legalMatch && operate === 'Y' && oos === 'N' && !carrier.outOfServiceDate;
          checks.authority = result(pass ? 'passed' : 'needs_review',
            `FMCSA operating flag: ${operate === 'Y' ? 'allowed' : operate === 'N' ? 'not allowed' : 'unknown'}; out-of-service flag: ${oos === 'Y' ? 'yes' : oos === 'N' ? 'no' : 'unknown'}. ${pass ? 'Status flags passed.' : 'Staff review required.'} This is not a complete safety, authority-scope, or insurance determination.`, SOURCE);
          checks.identity.evidence = { dotNumber: dot, mcNumber: mc, legalName };
          checks.authority.evidence = { allowToOperate: ['Y', 'N'].includes(operate) ? operate : null, outOfService: ['Y', 'N'].includes(oos) ? oos : null };
        }
      } catch {
        checks.identity = result('needs_review', 'FMCSA could not be checked (connection, credentials, timeout, or unexpected response). Retry or review the official record manually.', SOURCE);
        checks.authority = result('needs_review', 'No operating status was verified because the registry check was unavailable.', SOURCE);
      } finally { active--; }
    }
    checks.package = isDispatchPlan(fields.dispatch_package) && ['weekly', 'percentage'].includes(fields.billing_method) && fields.dispatch_terms === termsVersion && Number.isInteger(Number(fields.available_units)) && Number(fields.available_units) >= 1 && Number(fields.available_units) <= 100 ?
      result('passed', 'Package, billing selection, truck count, and current overview acknowledgment are present. No signed agreement or service activation is implied.') : result('missing', 'Package, billing selection, truck count, or current overview acknowledgment is missing or invalid.');
    for (const [id, caption] of [['insurance', 'Insurance'], ['tax_form', 'W-9'], ['agreement', 'Signed agreement']]) {
      const check = review.checks[id];
      const expired = check?.expiresOn && check.expiresOn < new Date(now).toISOString().slice(0, 10);
      checks[id] = expired ? result('needs_review', `${caption}: recorded evidence expired on ${check.expiresOn}.`, 'Staff evidence metadata') :
        !check?.evidence?.trim() ? result('missing', `${caption}: no evidence reference is recorded. Obtain the document securely.`, 'Staff evidence metadata') :
          result('needs_review', `${caption}: evidence reference is recorded${check.expiresOn ? `; expiration ${check.expiresOn}` : '; expiration is not recorded'}. File contents, signatures, and authenticity have not been checked automatically.`, 'Staff evidence metadata');
    }
    const overall = Object.values(checks).some(check => check.status === 'needs_review') ? 'needs_review' : Object.values(checks).some(check => check.status === 'missing') ? 'missing' : 'passed';
    return { version: 1, checkedAt: now, expiresAt: now + DAY, overall, checks, providerConfigured: Boolean(key) };
  }
  return { run };
}
function attachReport(review, report, actor = null, { initial = false } = {}) {
  const updated = structuredClone(review);
  updated.automation = report;
  if (!initial) {
    updated.version++;
    updated.updatedAt = Date.now();
    updated.history.push({ id: randomUUID(), version: updated.version, at: updated.updatedAt,
      actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null, action: 'automatic_checks',
      note: 'Automatic screening completed. Staff checks and final decision remain unchanged.', after: report });
  }
  return updated;
}
module.exports = { createVerifier, attachReport };
