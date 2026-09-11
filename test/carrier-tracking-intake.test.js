const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../test-support/server');
const { seed } = require('../test-support/review-fixture');
const { termsVersion } = require('../dispatch-plans');

test('carrier tracking details survive submission, staff search, export and restart without granting access', { timeout: 180000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alphaway-gps-intake-'));
  const file = path.join(dir, 'store.json');
  const { tokens, original } = seed(file, 0);
  const config = { ALPHAWAY_DATA_FILE: file, ALPHAWAY_ACCOUNT_AUTH: 'true' };
  let app;
  t.after(async () => { if (app) await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  app = await start(config);
  const get = (route, role = 'admin') => fetch(app.url + route, { headers: { cookie: role ? `alphaway_account=${tokens[`user-${role}`]}` : '' } });
  const base = { legal_carrier_name: 'Pilot Intake Test', primary_contact: 'Test Dispatcher', business_email: 'pilot@example.com',
    dispatch_package: 'dispatch-standard', billing_method: 'weekly', dispatch_terms: termsVersion, available_units: '1' };
  const post = fields => fetch(app.url + '/api/intakes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'carrier-onboarding', fields: { ...base, ...fields } }) });
  const selected = { eld_gps_provider: 'Motive', gps_pilot_truck: 'PILOT-101', gps_pilot_requested: 'yes' };
  const response = await post(selected);
  assert.equal(response.status, 201);
  const { intake } = await response.json();
  assert.deepEqual(intake.fields, { ...base, ...selected });
  const recordPath = `/api/intakes/${intake.id}`;
  for (const role of ['', 'carrier-owner', 'driver', 'broker', 'shipper']) {
    assert.ok([401, 403].includes((await get(recordPath, role)).status));
    assert.ok([401, 403].includes((await get(`${recordPath}/export`, role)).status));
  }
  const detail = await (await get(recordPath, 'dispatcher')).json();
  assert.equal(detail.review.status, 'received');
  assert.equal(detail.review.decision, null);
  assert.equal(detail.review.historyCount, 1);
  for (const query of ['Motive', 'PILOT-101']) {
    const results = await (await get(`/api/intakes?q=${query}`, 'dispatcher')).json();
    assert.deepEqual(results.intakes.map(item => item.id), [intake.id]);
  }
  const exported = await (await get(`${recordPath}/export`)).json();
  assert.deepEqual(exported.intake.fields, { ...base, ...selected });

  // Older forms and records remain usable; only submitted new fields are validated.
  assert.equal((await post({})).status, 201);
  const other = await post({ eld_gps_provider: 'Other', eld_gps_provider_other: 'Pilot provider' });
  assert.equal(other.status, 201);
  assert.equal((await other.json()).intake.fields.eld_gps_provider_other, 'Pilot provider');
  for (const fields of [
    { eld_gps_provider: 'Unlisted provider' },
    { eld_gps_provider: 'Other' },
    { eld_gps_provider: 'Other', eld_gps_provider_other: 'x'.repeat(81) },
    { gps_pilot_truck: 'x'.repeat(41) },
    { gps_pilot_requested: 'authorized' },
    { gps_tracking_authorized: 'yes' },
    { eld_api_key: 'must-not-be-accepted' }
  ]) assert.equal((await post(fields)).status, 400);

  const saved = JSON.parse(fs.readFileSync(file));
  assert.equal(saved.intakes.length, 4, 'invalid requests must not be stored');
  assert.deepEqual(saved.intakes[0], original.intakes[0], 'legacy records must not be rewritten');
  assert.equal(saved.accounts.users.length, original.accounts.users.length, 'request does not create an account');
  assert.equal(saved.operations.billingSubscriptions.length, 0, 'request does not activate billing');
  await app.stop(); app = await start(config);
  const restored = await (await get(`${recordPath}/export`)).json();
  assert.deepEqual(restored.intake, exported.intake);
  assert.deepEqual(restored.review, exported.review);
});
