const fs = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
function seed(file, count = 255) {
  const roles = ['admin', 'dispatcher', 'carrier-owner', 'driver', 'broker', 'shipper'];
  const users = roles.map(role => ({ id: `user-${role}`, name: `Review ${role}`, email: `${role}@example.com`, role, status: 'active', companyId: role === 'admin' || role === 'dispatcher' ? 'alphaway' : `company-${role}` }));
  users.push({ ...users[0], id: 'user-suspended', email: 'suspended@example.com', status: 'suspended' });
  const tokens = Object.fromEntries(users.map(user => [user.id, randomBytes(32).toString('hex')]));
  const accounts = { users, companies: [{ id: 'harper', name: 'Harper Dispatch and Logistics', status: 'active' }], sessions: users.map(user => ({ userId: user.id, tokenHash: createHash('sha256').update(tokens[user.id]).digest('hex'), expiresAt: Date.now() + 3600000 })) };
  const intakes = Array.from({ length: count }, (_, i) => ({ id: `legacy-${i}`, type: 'contact', createdAt: Date.now() - (count - i) * 1000,
    fields: { name: `Intake contact ${i}`, company: `Review company ${i}`, email: `contact-${i}@example.com`, message: 'Please review our request.', legacy_reference: 'Retain this older field.' } }));
  intakes.push({ id: 'legacy-carrier', type: 'carrier-onboarding', createdAt: Date.now(), fields: { legal_carrier_name: 'Summit Ridge Transport', primary_contact: 'Casey Morgan', business_email: 'casey@example.com', business_phone: '303-555-0145', mc_number: '1234567', dot_number: '123456', equipment_type: 'Dry Van', available_units: '2', preferred_lanes: 'Denver to Phoenix', dispatch_package: 'dispatch-basic', billing_method: 'percentage', operational_notes: 'Please review the insurance renewal before dispatch begins.' } });
  const store = { schemaVersion: 2, revision: 1, loads: [], operations: {}, accounts, intakes };
  fs.writeFileSync(file, JSON.stringify(store), { mode: 0o600 });
  return { tokens, original: structuredClone(store) };
}
module.exports = { seed };
