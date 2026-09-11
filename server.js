const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { createBilling } = require('./billing');
const billing = createBilling();
const { createStorage } = require('./storage');
const intakeReview = require('./intake-review');
const { reduceSubscription } = require('./subscription-state');
const { plans: dispatchPlans, isDispatchPlan, termsVersion: dispatchTermsVersion } = require('./dispatch-plans');
const HOSTED = process.env.NODE_ENV === 'production';
const SECURE_COOKIES = HOSTED || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const BIND_HOST = String(process.env.ALPHAWAY_HOST || process.env.HOST || '127.0.0.1').trim();
const DATA_FILE = process.env.ALPHAWAY_DATA_FILE || path.join(ROOT_DIR, 'data', 'alphaway-store.json');
const storage = createStorage(DATA_FILE);
let committedStore = null;
const REQUIRE_PREVIEW_AUTH = String(process.env.ALPHAWAY_REQUIRE_AUTH || '').trim().toLowerCase() === 'true';
const PREVIEW_USERNAME = String(process.env.ALPHAWAY_PREVIEW_USERNAME || process.env.ALPHAWAY_ACCESS_USER || '').trim();
const PREVIEW_PASSWORD = String(process.env.ALPHAWAY_PREVIEW_PASSWORD || process.env.ALPHAWAY_ACCESS_PASSWORD || '');
const PREVIEW_ADMIN_TOKEN = String(process.env.ALPHAWAY_ADMIN_TOKEN || '');
const PRIVATE_NETWORK = String(process.env.ALPHAWAY_PRIVATE_NETWORK || '').trim().toLowerCase() === 'true';
const NETWORK_INVITE_CODE = String(process.env.ALPHAWAY_NETWORK_INVITE_CODE || '');
const NETWORK_ACCESS_COOKIE = 'alphaway_network_access';
const ACCOUNT_AUTH = String(process.env.ALPHAWAY_ACCOUNT_AUTH || '').trim().toLowerCase() === 'true';
const REQUIRE_SUBSCRIPTION = String(process.env.ALPHAWAY_REQUIRE_SUBSCRIPTION || '').trim().toLowerCase() === 'true';
const ACCOUNT_SESSION_SECRET = String(process.env.ALPHAWAY_ACCOUNT_SESSION_SECRET || NETWORK_INVITE_CODE || PREVIEW_PASSWORD || 'local-account-secret');
const ACCOUNT_COOKIE = 'alphaway_account';
const ACCOUNT_SESSION_DAYS = 7;
const FMCSA_API_KEY = String(process.env.ALPHAWAY_FMCSA_QCMOBILE_KEY || '');
const FMCSA_BASE_URL = String(process.env.ALPHAWAY_FMCSA_BASE_URL || 'https://mobile.fmcsa.dot.gov/qc/services').replace(/\/+$/, '');
const HOME_PAGE = 'index.html';
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_INTAKE_BYTES = 64 * 1024;
const MAX_OPERATION_BYTES = 3 * 1024 * 1024;
const MAX_SSE_CLIENTS = 40;
const AUTH_FAILURE_WINDOW_MS = 60 * 1000;
const AUTH_FAILURE_LIMIT = 12;
const NETWORK_ACCESS_FAILURE_LIMIT = 8;
const EVENT_WINDOW_MS = 60 * 1000;
const EVENT_LIMIT = 120;
const INTAKE_WINDOW_MS = 60 * 60 * 1000;
const INTAKE_LIMIT = 12;
const OPERATION_LIMIT = 60;
const sseClients = new Set();
const rateLimitBuckets = new Map();
const checkoutLocks = new Set();

const STATIC_FILES = new Set([
  'account-nav.js',
  'dispatch-plans.js',
  'dispatch-ui.js',
  HOME_PAGE,
  'loadboard.html',
  'workspace.html',
  'workspace.js',
  'tms.html',
  'admin.html',
  'intake-review.html',
  'intake-review-ui.js',
  'intake-review.css',
  'carrier-onboarding.html',
  'carrier-agreement.html',
  'broker-intake.html',
  'contact-portal.html',
  'style.css',
  'assets/alphaway-dispatch-office.jpg',
  'script.js',
  'operations.js',
  'css2'
]);

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

if (HOSTED && (!REQUIRE_PREVIEW_AUTH || !PRIVATE_NETWORK || !ACCOUNT_AUTH)) {
  throw new Error('Hosted previews require ALPHAWAY_REQUIRE_AUTH, ALPHAWAY_PRIVATE_NETWORK, and ALPHAWAY_ACCOUNT_AUTH=true.');
}
if (!BIND_HOST) throw new Error('ALPHAWAY_HOST must not be blank.');
if (REQUIRE_PREVIEW_AUTH && (!PREVIEW_USERNAME || !PREVIEW_PASSWORD)) {
  throw new Error('ALPHAWAY_REQUIRE_AUTH=true requires ALPHAWAY_PREVIEW_USERNAME and ALPHAWAY_PREVIEW_PASSWORD.');
}
if (PRIVATE_NETWORK && !NETWORK_INVITE_CODE) {
  throw new Error('ALPHAWAY_PRIVATE_NETWORK=true requires ALPHAWAY_NETWORK_INVITE_CODE.');
}

const LOAD_ROWS = [
  ['LB-48201', 'Denver, CO', 'Phoenix, AZ', 'Dry Van', 698, 2540, 'Today, 2:00 PM', 'Tomorrow, 11:30 AM', '26,000 lb', 'Swiftline Logistics', 'Hot'],
  ['LB-48322', 'Colorado Springs, CO', 'Dallas, TX', 'Reefer', 874, 3185, 'Today, 7:15 PM', 'Fri, 6:00 AM', '22,400 lb', 'Northway Freight', 'New'],
  ['LB-48190', 'Fort Collins, CO', 'Kansas City, MO', 'Flatbed', 992, 2950, 'Tomorrow, 9:45 AM', 'Sat, 2:15 PM', '41,600 lb', 'Summit Dispatch', 'Hot'],
  ['LB-48246', 'Grand Junction, CO', 'Salt Lake City, UT', 'Power Only', 412, 1860, 'Today, 11:00 AM', 'Today, 9:30 PM', '12,000 lb', 'Cedar Union', 'New'],
  ['LB-48410', 'Denver, CO', 'Albuquerque, NM', 'Dry Van', 519, 2265, 'Tomorrow, 1:30 PM', 'Tue, 7:10 AM', '28,300 lb', 'Blue Mesa Logistics', 'Hot'],
  ['LB-48468', 'Pueblo, CO', 'Omaha, NE', 'Reefer', 711, 2675, 'Sat, 6:00 AM', 'Sun, 4:45 PM', '17,800 lb', 'Prairie Crest', 'New'],
  ['LB-48155', 'Greeley, CO', 'Las Vegas, NV', 'Dry Van', 1042, 3455, 'Fri, 10:15 AM', 'Sat, 10:00 PM', '30,900 lb', 'Mountain Line', 'Hot'],
  ['LB-48531', 'Boulder, CO', 'Cheyenne, WY', 'Flatbed', 170, 975, 'Today, 8:30 AM', 'Today, 3:00 PM', '38,000 lb', 'High Plains Haul', 'New'],
  ['LB-48621', 'Atlanta, GA', 'Jacksonville, FL', 'Dry Van', 452, 2140, 'Today, 4:45 PM', 'Tue, 5:30 AM', '23,500 lb', 'Southern Route Group', 'Hot'],
  ['LB-48658', 'Chicago, IL', 'Detroit, MI', 'Reefer', 281, 1825, 'Tomorrow, 7:00 AM', 'Tomorrow, 3:30 PM', '19,800 lb', 'Midwest Bridge', 'New'],
  ['LB-48703', 'Nashville, TN', 'Charlotte, NC', 'Flatbed', 436, 2420, 'Fri, 1:15 PM', 'Sat, 6:10 PM', '33,200 lb', 'Blue Ridge Carrier Co.', 'Hot'],
  ['LB-48795', 'Portland, OR', 'Spokane, WA', 'Dry Van', 432, 1965, 'Today, 9:20 AM', 'Today, 7:10 PM', '27,900 lb', 'Cascade Dispatch', 'New'],
  ['LB-48822', 'Philadelphia, PA', 'Baltimore, MD', 'Power Only', 170, 980, 'Today, 12:00 PM', 'Today, 4:30 PM', '10,800 lb', 'Atlantic Fleet', 'New'],
  ['LB-48871', 'Dallas, TX', 'Houston, TX', 'Reefer', 246, 1480, 'Tomorrow, 6:00 AM', 'Tomorrow, 2:00 PM', '16,900 lb', 'Texas Freight One', 'Hot'],
  ['LB-48911', 'Reno, NV', 'Sacramento, CA', 'Flatbed', 566, 2285, 'Sat, 7:30 AM', 'Sun, 3:15 PM', '36,400 lb', 'Golden Bear Logistics', 'New'],
  ['LB-48974', 'Boston, MA', 'Newark, NJ', 'Dry Van', 220, 1620, 'Today, 5:15 PM', 'Tomorrow, 12:45 PM', '25,700 lb', 'Northeast Line', 'Hot']
];

const EQUIPMENT = new Set(['Dry Van', 'Reefer', 'Flatbed', 'Power Only']);
const LOAD_STATUSES = new Set(['Hot', 'New', 'Available', 'Booked']);
const ASSIGNMENT_STATUSES = new Set(['Dispatched', 'In transit', 'Attention']);
const INTAKE_TYPES = new Set(['access-request', 'carrier-onboarding', 'broker-intake', 'contact']);
const INTAKE_FIELD_ALLOWLIST = Object.freeze({
  'access-request': new Set(['name', 'email', 'company', 'plan']),
  'carrier-onboarding': new Set(['legal_carrier_name', 'primary_contact', 'business_email', 'business_phone', 'mc_number', 'dot_number', 'equipment_type', 'available_units', 'preferred_lanes', 'availability', 'operational_notes', 'dispatch_package', 'billing_method', 'dispatch_terms']),
  'broker-intake': new Set(['broker_company', 'primary_contact', 'business_email', 'business_phone', 'load_reference', 'equipment', 'origin', 'destination', 'pickup_date', 'delivery_date', 'weight', 'target_rate', 'load_notes']),
  contact: new Set(['name', 'email', 'company', 'topic', 'message'])
});
const REQUIRED_INTAKE_FIELDS = Object.freeze({
  'access-request': ['name', 'email', 'company', 'plan'],
  'carrier-onboarding': ['legal_carrier_name', 'primary_contact', 'business_email'],
  'broker-intake': ['broker_company', 'primary_contact', 'business_email', 'origin', 'destination'],
  contact: ['name', 'email', 'message']
});

function cleanText(value, fallback = '', maxLength = 90) {
  const text = String(value ?? '')
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function cleanNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function responseHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

function headerValue(request, name) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function requestIp(request) {
  return request.socket?.remoteAddress || 'unknown';
}

function consumeRateLimit(request, scope, limit, windowMs) {
  const now = Date.now();
  const key = `${scope}:${requestIp(request)}`;
  const recent = (rateLimitBuckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    rateLimitBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return true;
}

function timingSafeTextEqual(received, expected) {
  if (typeof received !== 'string' || !expected) return false;
  const receivedDigest = crypto.createHash('sha256').update(received, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

function hasPreviewAccess(request) {
  if (!REQUIRE_PREVIEW_AUTH) return true;
  const authorization = headerValue(request, 'authorization');
  if (typeof authorization !== 'string' || !authorization.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  } catch (error) {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return timingSafeTextEqual(decoded.slice(0, separator), PREVIEW_USERNAME)
    && timingSafeTextEqual(decoded.slice(separator + 1), PREVIEW_PASSWORD);
}

function hasIntakeReadAccess(request) {
  return ['admin', 'dispatcher'].includes(accountFromRequest(request)?.role);
}

function parseCookies(request) {
  return Object.fromEntries(String(headerValue(request, 'cookie') || '')
    .split(';')
    .map((part) => part.trim().split('='))
    .filter(([name, value]) => name && value)
    .map(([name, ...value]) => [name, value.join('=')]));
}

function networkAccessTokenIsValid(token) {
  if (!PRIVATE_NETWORK || typeof token !== 'string') return !PRIVATE_NETWORK;
  const [issuedAt, signature] = token.split('.');
  const timestamp = Number(issuedAt);
  if (!Number.isSafeInteger(timestamp) || !signature || Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac('sha256', NETWORK_INVITE_CODE).update(String(timestamp)).digest('hex');
  return timingSafeTextEqual(signature, expected);
}

function hasNetworkAccess(request) {
  if (!PRIVATE_NETWORK) return true;
  return networkAccessTokenIsValid(parseCookies(request)[NETWORK_ACCESS_COOKIE]);
}

function accountFromRequest(request) {
  if (!ACCOUNT_AUTH) return null;
  const raw = parseCookies(request)[ACCOUNT_COOKIE];
  if (!raw) return null;
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const session = store.accounts.sessions.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now());
  const user = session && store.accounts.users.find((entry) => entry.id === session.userId);
  return user?.status === 'active' ? user : null;
}

function requireAccount(request, roles = null) {
  const user = accountFromRequest(request);
  if (!user) throw reject(401, 'A signed-in account is required.');
  if (roles && !roles.includes(user.role)) throw reject(403, 'Your account role does not have permission for this action.');
  return user;
}

function addAudit(actorId, action, targetId = '') {
  store.accounts.audit = [...store.accounts.audit, { id: operationId('audit'), actorId, action, targetId, createdAt: Date.now() }].slice(-1000);
}

function sendUnauthorized(response) {
  response.writeHead(401, responseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    Vary: 'Authorization',
    'WWW-Authenticate': 'Basic realm="Alphaway Preview", charset="UTF-8"'
  }));
  response.end(JSON.stringify({ error: 'Preview access is required.' }));
}

function sendNetworkAccessRequired(response) {
  sendJson(response, 403, { error: 'An invitation code is required to access the private carrier network.' }, {
    'X-Alphaway-Private-Network': 'true'
  });
}

function requireJsonSameOrigin(request) {
  const contentType = String(headerValue(request, 'content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw reject(415, 'Requests must use application/json.');
  }
  const origin = headerValue(request, 'origin');
  if (!origin) return;
  const host = headerValue(request, 'host');
  if (!host || (origin !== `http://${host}` && origin !== `https://${host}`)) {
    throw reject(403, 'Cross-site requests are not allowed.');
  }
}

function dataDirectoryIsWritable() {
  try {
    const directory = path.dirname(DATA_FILE);
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function laneFor(origin, destination) {
  return `${origin.split(',')[0].trim()} → ${destination.split(',')[0].trim()}`;
}

function normalizeLoad(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object') return null;
  const id = cleanText(candidate.id, '', 28).toUpperCase().replace(/[^A-Z0-9-]/g, '') || `LOCAL-${String(index + 1).padStart(3, '0')}`;
  const origin = cleanText(candidate.origin, 'Origin not set');
  const destination = cleanText(candidate.destination, 'Destination not set');
  return {
    id,
    origin,
    destination,
    equipment: EQUIPMENT.has(candidate.equipment) ? candidate.equipment : 'Dry Van',
    miles: cleanNumber(candidate.miles, 0, 0, 10000),
    rate: cleanNumber(candidate.rate, 0, 0, 100000),
    pickup: cleanText(candidate.pickup, 'TBD', 60),
    delivery: cleanText(candidate.delivery, 'TBD', 60),
    weight: cleanText(candidate.weight, 'TBD', 40),
    broker: cleanText(candidate.broker, 'Unassigned', 90),
    status: LOAD_STATUSES.has(candidate.status) ? candidate.status : 'Available',
    lane: laneFor(origin, destination)
  };
}

function normalizeCatalog(catalog) {
  if (!Array.isArray(catalog)) return null;
  const seen = new Set();
  const normalized = catalog
    .slice(0, 100)
    .map(normalizeLoad)
    .filter((load) => {
      if (!load || seen.has(load.id)) return false;
      seen.add(load.id);
      return true;
    });
  return normalized.length ? normalized : null;
}

function defaultLoads() {
  return LOAD_ROWS.map(([id, origin, destination, equipment, miles, rate, pickup, delivery, weight, broker, status]) => normalizeLoad({
    id, origin, destination, equipment, miles, rate, pickup, delivery, weight, broker, status
  }));
}

function defaultTmsState(now = Date.now()) {
  return {
    demoRunning: true,
    assignments: [
      { id: 'tms-48201', loadId: 'LB-48201', driverName: 'Marcus Lane', truckId: 'TRK-204', status: 'In transit', tracking: { progress: 0.42, speedMph: 64, etaMinutes: 525, lastPingAt: now } },
      { id: 'tms-48322', loadId: 'LB-48322', driverName: 'Daniela Ruiz', truckId: 'TRK-317', status: 'Dispatched', tracking: { progress: 0.12, speedMph: 0, etaMinutes: 845, lastPingAt: now } },
      { id: 'tms-48190', loadId: 'LB-48190', driverName: 'Andre Cole', truckId: 'TRK-185', status: 'Attention', tracking: { progress: 0.58, speedMph: 18, etaMinutes: 640, lastPingAt: now } },
      { id: 'tms-48410', loadId: 'LB-48410', driverName: 'Casey Owens', truckId: 'TRK-278', status: 'In transit', tracking: { progress: 0.31, speedMph: 58, etaMinutes: 430, lastPingAt: now } }
    ]
  };
}

function defaultState(now = Date.now()) {
  return {
    savedSearches: [
      { id: 'reefer-routes', name: 'Reefer hot lanes', origin: 'all', destination: 'all', equipment: 'Reefer', minRate: '2500', miles: 'all' },
      { id: 'west-drive', name: 'West coast lanes', origin: 'all', destination: 'California', equipment: 'all', minRate: '0', miles: 'all' },
      { id: 'midwest-fast', name: 'Midwest priority', origin: 'Illinois', destination: 'all', equipment: 'Dry Van', minRate: '2000', miles: 'all' }
    ],
    bookedLoads: [],
    messages: [{
      id: 'dispatch-welcome',
      loadId: 'general',
      sender: 'Dispatcher',
      text: 'Dispatch channel is ready. Select a load to keep messages tied to that route.',
      createdAt: now
    }],
    tms: defaultTmsState(now)
  };
}

function normalizeState(candidate, catalog) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const fallback = defaultState();
  const validLoadIds = new Set(catalog.map((load) => load.id));
  const savedSearches = Array.isArray(source.savedSearches)
    ? source.savedSearches.slice(0, 20).map((search, index) => ({
        id: cleanText(search?.id, `saved-${index}`, 48).replace(/[^A-Z0-9_-]/gi, ''),
        name: cleanText(search?.name, 'Saved search', 80),
        origin: cleanText(search?.origin, 'all', 60),
        destination: cleanText(search?.destination, 'all', 60),
        equipment: EQUIPMENT.has(search?.equipment) ? search.equipment : 'all',
        minRate: String(cleanNumber(search?.minRate, 0, 0, 100000)),
        miles: ['all', '300', '500'].includes(String(search?.miles)) ? String(search.miles) : 'all'
      }))
    : fallback.savedSearches;
  const bookedLoads = Array.isArray(source.bookedLoads)
    ? [...new Set(source.bookedLoads.filter((loadId) => validLoadIds.has(loadId)))].slice(0, 100)
    : [];
  const messages = Array.isArray(source.messages)
    ? source.messages.slice(-200).map((message, index) => ({
        id: cleanText(message?.id, `message-${index}`, 64).replace(/[^A-Z0-9_-]/gi, ''),
        loadId: message?.loadId === 'general' || validLoadIds.has(message?.loadId) ? message.loadId : 'general',
        sender: message?.sender === 'Driver' ? 'Driver' : 'Dispatcher',
        text: cleanText(message?.text, '', 500),
        createdAt: cleanNumber(message?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
      })).filter((message) => message.text)
    : fallback.messages;
  const assignmentSource = Array.isArray(source.tms?.assignments) ? source.tms.assignments : fallback.tms.assignments;
  const assignments = assignmentSource
    .filter((assignment) => validLoadIds.has(assignment?.loadId))
    .slice(0, 100)
    .map((assignment, index) => ({
      id: cleanText(assignment?.id, `tms-${index}`, 64).replace(/[^A-Z0-9_-]/gi, ''),
      loadId: assignment.loadId,
      driverName: cleanText(assignment?.driverName, 'Unassigned driver', 90),
      truckId: cleanText(assignment?.truckId, 'Unassigned', 40),
      status: ASSIGNMENT_STATUSES.has(assignment?.status) ? assignment.status : 'Dispatched',
      tracking: {
        progress: Math.min(0.96, Math.max(0.04, Number(assignment?.tracking?.progress) || 0.04)),
        speedMph: cleanNumber(assignment?.tracking?.speedMph, 0, 0, 120),
        etaMinutes: cleanNumber(assignment?.tracking?.etaMinutes, 0, 0, 100000),
        lastPingAt: cleanNumber(assignment?.tracking?.lastPingAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
      }
    }));
  return {
    savedSearches,
    bookedLoads,
    messages: messages.length ? messages : fallback.messages,
    tms: { demoRunning: source.tms?.demoRunning !== false, assignments }
  };
}

function createStore() {
  const loads = defaultLoads();
  const adminEmail = String(process.env.ALPHAWAY_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.ALPHAWAY_ADMIN_PASSWORD || '');
  const seeded = adminEmail && adminPassword ? hashPassword(adminPassword) : null;
  return {
    schemaVersion: 2,
    revision: 1,
    loads,
    state: defaultState(),
    intakes: [],
    intakeReviews: {},
    operations: normalizeOperations(),
    accounts: normalizeAccounts(seeded ? {
      companies: [{ id: 'alphaway', name: 'Alphaway Logistics', type: 'organization', status: 'active' }],
      users: [{ id: 'user-admin', email: adminEmail, name: 'Alphaway Administrator', role: 'admin', companyId: 'alphaway', status: 'active', passwordSalt: seeded.salt, passwordHash: seeded.hash }]
    } : {})
  };
}

function normalizeStore(candidate) {
  const loads = normalizeCatalog(candidate?.loads) || defaultLoads();
  if (candidate?.intakes !== undefined && !Array.isArray(candidate.intakes)) throw new Error('Invalid saved intake records.');
  const intakes = candidate?.intakes || [];
  const intakeReviews = intakeReview.restoreReviews(intakes, candidate?.intakeReviews);
  return {
    schemaVersion: 1,
    revision: cleanNumber(candidate?.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    loads,
    state: normalizeState(candidate?.state, loads),
    companyStates: Object.fromEntries(Object.entries(candidate?.companyStates || {}).map(([id, state]) => [id, normalizeState(state, loads)])),
    intakes,
    intakeReviews,
    operations: normalizeOperations(candidate?.operations),
    carrierOnboardedCompanies: Array.isArray(candidate?.carrierOnboardedCompanies) ? [...new Set(candidate.carrierOnboardedCompanies.filter(id => typeof id === 'string'))] : [],
    dispatchRequests: Array.isArray(candidate?.dispatchRequests) ? candidate.dispatchRequests.filter(entry => isDispatchPlan(entry?.plan) && entry.companyId && entry.billingMethod === 'percentage') : [],
    billingCheckouts: Array.isArray(candidate?.billingCheckouts) ? candidate.billingCheckouts : [],
    accounts: normalizeAccounts(candidate?.accounts)
  };
}

function readStore() {
  const saved = storage.read();
  // Corrupt data must fail startup rather than silently resetting customer records.
  return saved ? normalizeStore(saved) : { ...createStore(), companyStates: {}, carrierOnboardedCompanies: [], billingCheckouts: [], dispatchRequests: [] };
}

function persistStore() {
  try {
    storage.write(store);
    committedStore = structuredClone(store);
  } catch {
    if (committedStore) store = structuredClone(committedStore);
    throw reject(503, 'Data could not be saved. Please retry.');
  }
}

function staff(user) { return ['admin', 'dispatcher'].includes(user?.role); }
function emptyPrivateState() {
  return { savedSearches: [], bookedLoads: [], messages: [], tms: { demoRunning: false, assignments: [] } };
}
function companyState(user) {
  if (!user?.companyId) return emptyPrivateState();
  return Object.hasOwn(store.companyStates, user.companyId) ? store.companyStates[user.companyId] : emptyPrivateState();
}
function publicSnapshot(user = null) {
  const state = !ACCOUNT_AUTH || staff(user) ? store.state : companyState(user);
  return { revision: store.revision, loads: store.loads, state };
}

function normalizeIntake(candidate) {
  if (!candidate || typeof candidate !== 'object' || !INTAKE_TYPES.has(candidate.type)) return null;
  const fields = candidate.fields && typeof candidate.fields === 'object' ? candidate.fields : {};
  const allowedFields = INTAKE_FIELD_ALLOWLIST[candidate.type];
  const normalizedFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const safeKey = cleanText(key, '', 60).replace(/[^a-z0-9_-]/gi, '');
    if (!safeKey || !allowedFields.has(safeKey)) return null;
    const maxLength = ['load_notes', 'operational_notes', 'message'].includes(safeKey) ? 1000 : 160;
    const safeValue = cleanText(value, '', maxLength);
    if (!safeValue) continue;
    if (safeKey.endsWith('email') || safeKey === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeValue)) return null;
    }

    if (['pickup_date', 'delivery_date'].includes(safeKey) && !/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) return null;
    if (['mc_number', 'dot_number'].includes(safeKey) && !/^\d{1,10}$/.test(safeValue)) return null;
    if (safeKey === 'available_units' && !/^\d{1,4}$/.test(safeValue)) return null;
    normalizedFields[safeKey] = safeValue;
  }
  if (!REQUIRED_INTAKE_FIELDS[candidate.type].every((field) => normalizedFields[field])) return null;
  return {
    id: cleanText(candidate.id, `intake-${Date.now()}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    type: candidate.type,
    fields: normalizedFields,
    createdAt: cleanNumber(candidate.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  };
}

function normalizeOperations(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const documents = Array.isArray(source.documents) ? source.documents.slice(-200).map((document, index) => ({
    id: cleanText(document?.id, `document-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    fileName: cleanText(document?.fileName, 'document', 160),
    documentType: cleanText(document?.documentType, 'Other', 60),
    loadId: cleanText(document?.loadId, 'general', 28),
    uploadedBy: cleanText(document?.uploadedBy, 'Operations', 90),
    companyId: cleanText(document?.companyId, 'demo', 80),
    contentType: cleanText(document?.contentType, 'application/octet-stream', 100),
    size: cleanNumber(document?.size, 0, 0, 3 * 1024 * 1024),
    storedPath: cleanText(document?.storedPath, '', 240),
    createdAt: cleanNumber(document?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })) : [];
  const assignments = Array.isArray(source.assignments) ? source.assignments.slice(-200).map((assignment, index) => ({
    id: cleanText(assignment?.id, `assignment-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    loadId: cleanText(assignment?.loadId, '', 28),
    driverName: cleanText(assignment?.driverName, '', 90),
    driverUserId: cleanText(assignment?.driverUserId, '', 80),
    truckId: cleanText(assignment?.truckId, '', 40),
    companyId: cleanText(assignment?.companyId, 'demo', 80),
    status: ASSIGNMENT_STATUSES.has(assignment?.status) ? assignment.status : 'Dispatched',
    createdAt: cleanNumber(assignment?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })).filter((assignment) => assignment.loadId && assignment.driverName) : [];
  const invoices = Array.isArray(source.invoices) ? source.invoices.slice(-200).map((invoice, index) => ({
    id: cleanText(invoice?.id, `invoice-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    loadId: cleanText(invoice?.loadId, 'general', 28),
    customer: cleanText(invoice?.customer, '', 120),
    companyId: cleanText(invoice?.companyId, 'demo', 80),
    amount: cleanNumber(invoice?.amount, 0, 0, 1000000),
    status: ['Draft', 'Sent', 'Paid', 'Overdue'].includes(invoice?.status) ? invoice.status : 'Draft',
    dueDate: cleanText(invoice?.dueDate, '', 10),
    createdAt: cleanNumber(invoice?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })).filter((invoice) => invoice.customer) : [];
  const billingEvents = Array.isArray(source.billingEvents) ? source.billingEvents.slice(-500).map((event, index) => ({
    id: cleanText(event?.id, `billing-event-${index}`, 100),
    type: cleanText(event?.type, 'billing.event', 100),
    customerId: cleanText(event?.customerId, '', 100),
    subscriptionId: cleanText(event?.subscriptionId, '', 100),
    status: cleanText(event?.status, '', 40),
    paymentStatus: cleanText(event?.paymentStatus, '', 40),
    userId: cleanText(event?.userId, '', 100),
    companyId: cleanText(event?.companyId, '', 100),
    eventCreated: cleanNumber(event?.eventCreated, 0, 0, Number.MAX_SAFE_INTEGER),
    createdAt: cleanNumber(event?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })) : [];
  const billingSubscriptions = Array.isArray(source.billingSubscriptions) ? source.billingSubscriptions.map((subscription, index) => ({
    id: cleanText(subscription?.id, `subscription-${index}`, 100),
    customerId: cleanText(subscription?.customerId, '', 100),
    userId: cleanText(subscription?.userId, '', 100),
    companyId: cleanText(subscription?.companyId, '', 100),
    plan: ['carrier', 'shipper', 'broker', ...Object.keys(dispatchPlans)].includes(subscription?.plan) ? subscription.plan : '',
    status: cleanText(subscription?.status, 'pending', 40),
    currentPeriodEnd: cleanNumber(subscription?.currentPeriodEnd, 0, 0, Number.MAX_SAFE_INTEGER),
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    eventCreated: cleanNumber(subscription?.eventCreated, 0, 0, Number.MAX_SAFE_INTEGER),
    eventId: cleanText(subscription?.eventId, '', 100),
    updatedAt: cleanNumber(subscription?.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })).filter((subscription) => /^sub_[A-Za-z0-9]+$/.test(subscription.id)) : [];
  return { documents, assignments, invoices, brokerSearches: Array.isArray(source.brokerSearches) ? source.brokerSearches.slice(-100) : [], billingEvents, billingSubscriptions };
}

const ACCOUNT_ROLES = new Set(['admin', 'dispatcher', 'carrier-owner', 'driver', 'broker', 'shipper']);
const ACCOUNT_STATUSES = new Set(['pending', 'active', 'suspended', 'invited']);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function verifyPassword(password, account) {
  if (!account?.passwordHash || !account?.passwordSalt) return false;
  const candidate = crypto.scryptSync(String(password), account.passwordSalt, 64).toString('hex');
  return timingSafeTextEqual(candidate, account.passwordHash);
}

function normalizeAccounts(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const companies = Array.isArray(source.companies) ? source.companies.slice(-500).map((company, index) => ({
    id: cleanText(company?.id, `company-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    name: cleanText(company?.name, 'Unnamed company', 120),
    type: cleanText(company?.type, 'carrier', 40),
    status: ['pending', 'active', 'suspended'].includes(company?.status) ? company.status : 'pending',
    createdAt: cleanNumber(company?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })) : [];
  const users = Array.isArray(source.users) ? source.users.slice(-1000).map((user, index) => ({
    id: cleanText(user?.id, `user-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    email: cleanText(user?.email, '', 160).toLowerCase(),
    name: cleanText(user?.name, 'User', 120),
    role: ACCOUNT_ROLES.has(user?.role) ? user.role : 'driver',
    companyId: cleanText(user?.companyId, '', 80),
    status: ACCOUNT_STATUSES.has(user?.status) ? user.status : 'pending',
    passwordSalt: cleanText(user?.passwordSalt, '', 64),
    passwordHash: cleanText(user?.passwordHash, '', 160),
    createdAt: cleanNumber(user?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })).filter((user) => user.email) : [];
  const invitations = Array.isArray(source.invitations) ? source.invitations.slice(-500).map((invite, index) => ({
    id: cleanText(invite?.id, `invite-${index}`, 80).replace(/[^A-Z0-9_-]/gi, ''),
    email: cleanText(invite?.email, '', 160).toLowerCase(),
    role: ACCOUNT_ROLES.has(invite?.role) ? invite.role : 'driver',
    companyId: cleanText(invite?.companyId, '', 80),
    tokenHash: cleanText(invite?.tokenHash, '', 160),
    status: invite?.status === 'accepted' ? 'accepted' : 'pending',
    expiresAt: cleanNumber(invite?.expiresAt, Date.now() + 7 * 86400000, 0, Number.MAX_SAFE_INTEGER)
  })).filter((invite) => invite.email && invite.tokenHash) : [];
  const sessions = Array.isArray(source.sessions) ? source.sessions.slice(-1000).filter((session) => session?.tokenHash && session?.userId).map((session) => ({
    tokenHash: cleanText(session.tokenHash, '', 160),
    userId: cleanText(session.userId, '', 80),
    expiresAt: cleanNumber(session.expiresAt, 0, 0, Number.MAX_SAFE_INTEGER)
  })) : [];
  const audit = Array.isArray(source.audit) ? source.audit.slice(-1000).map((entry) => ({
    id: cleanText(entry?.id, operationId('audit'), 90),
    actorId: cleanText(entry?.actorId, 'system', 80),
    action: cleanText(entry?.action, 'unknown', 100),
    targetId: cleanText(entry?.targetId, '', 100),
    createdAt: cleanNumber(entry?.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  })) : [];
  return { companies, users, invitations, sessions, audit };
}

function reject(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireCurrentCatalogRevision(event) {
  const expectedRevision = Number(event?.baseRevision);
  if (!Number.isSafeInteger(expectedRevision)) {
    throw reject(400, 'Catalog changes must include the current app revision.');
  }
  if (expectedRevision !== store.revision) {
    const error = reject(409, 'The catalog changed in another session. Review the latest loads and try again.');
    error.snapshot = publicSnapshot();
    throw error;
  }
}

function acceptEvent(event, actor = null) {
  const tenant = ACCOUNT_AUTH && !staff(actor);
  if (tenant && !actor?.companyId) throw reject(403, 'A company assignment is required.');
  const state = tenant ? structuredClone(companyState(actor)) : store.state;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw reject(400, 'A valid app event is required.');
  const validLoadIds = new Set(store.loads.map((load) => load.id));

  switch (event.type) {
    case 'catalog.replace': {
      requireCurrentCatalogRevision(event);
      const catalog = normalizeCatalog(event.loads);
      if (!catalog) throw reject(400, 'Provide at least one valid load.');
      store.loads = catalog;
      store.state = normalizeState(store.state, catalog);
      break;
    }
    case 'catalog.reset': {
      requireCurrentCatalogRevision(event);
      store.loads = defaultLoads();
      store.state = defaultState();
      break;
    }
    case 'booking.add': {
      const loadId = cleanText(event.loadId, '', 28);
      if (!validLoadIds.has(loadId)) throw reject(404, 'The selected load is no longer available.');
      state.bookedLoads = [...new Set([loadId, ...state.bookedLoads])].slice(0, 100);
      break;
    }
    case 'saved-search.add': {
      const search = event.search || {};
      const normalized = normalizeState({ savedSearches: [search], bookedLoads: [], messages: [], tms: state.tms }, store.loads).savedSearches[0];
      state.savedSearches = [normalized, ...state.savedSearches.filter((item) => item.id !== normalized.id)].slice(0, 20);
      break;
    }
    case 'message.send': {
      const message = event.message || {};
      const loadId = message.loadId === 'general' || validLoadIds.has(message.loadId) ? message.loadId : null;
      const text = cleanText(message.text, '', 500);
      if (!loadId || !text) throw reject(400, 'A valid load and message are required.');
      state.messages = [...state.messages, {
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        loadId,
        sender: message.sender === 'Driver' ? 'Driver' : 'Dispatcher',
        text,
        createdAt: Date.now()
      }].slice(-200);
      break;
    }
    case 'tms.set-demo-running': {
      state.tms.demoRunning = event.demoRunning !== false;
      break;
    }
    case 'tms.refresh': {
      refreshTracking(cleanText(event.loadId, '', 28) || null);
      break;
    }
    default:
      throw reject(400, 'Unsupported app event.');
  }

  if (tenant) Object.defineProperty(store.companyStates, actor.companyId, { value: normalizeState(state, store.loads), writable: true, enumerable: true, configurable: true });
  else store.state = normalizeState(store.state, store.loads);
  store.revision += 1;
  persistStore();
  broadcastSnapshot();
  return publicSnapshot(actor);
}

function refreshTracking(loadId = null) {
  const now = Date.now();
  store.state.tms.assignments = store.state.tms.assignments.map((assignment, index) => {
    if (loadId && assignment.loadId !== loadId) return assignment;
    const tracking = assignment.tracking;
    if (assignment.status === 'Dispatched') return { ...assignment, tracking: { ...tracking, lastPingAt: now } };
    const increment = assignment.status === 'Attention' ? 0.003 : 0.009 + ((index % 3) * 0.002);
    const progress = Math.min(0.96, tracking.progress + increment);
    return {
      ...assignment,
      tracking: {
        progress,
        speedMph: assignment.status === 'Attention' ? 18 : 54 + ((Math.round(progress * 100) + index * 7) % 13),
        etaMinutes: Math.max(0, tracking.etaMinutes - Math.max(1, Math.round(increment * 20))),
        lastPingAt: now
      }
    };
  });
}

function broadcastSnapshot() {
  for (const response of sseClients) {
    try {
      const user = accountFromRequest(response.accountRequest);
      response.write(`event: snapshot\ndata: ${JSON.stringify(publicSnapshot(user))}\n\n`);
    } catch (error) {
      sseClients.delete(response);
    }
  }
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, responseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    ...headers
  }));
  response.end(JSON.stringify(payload));
}

function operationSnapshot(user = null) {
  const role = user?.role || 'admin';
  const companyId = user?.companyId || null;
  const canSeeAll = ['admin', 'dispatcher'].includes(role);
  const sameCompany = item => Boolean(companyId) && item.companyId === companyId;
  const assignments = canSeeAll
    ? store.operations.assignments
    : store.operations.assignments.filter((item) => sameCompany(item) && (role !== 'driver' || item.driverUserId === user.id));
  return {
    operations: {
      brokerSearches: canSeeAll ? store.operations.brokerSearches : [],
      billingEvents: role === 'admin' ? store.operations.billingEvents : [],
      billingSubscriptions: role === 'admin' ? store.operations.billingSubscriptions : [],
      assignments,
      documents: canSeeAll ? store.operations.documents : store.operations.documents.filter(item => sameCompany(item) && (role !== 'driver' || assignments.some(a => a.loadId === item.loadId))),
      invoices: canSeeAll ? store.operations.invoices : store.operations.invoices.filter(item => role !== 'driver' && sameCompany(item))
    },
    fmcsaConfigured: Boolean(FMCSA_API_KEY),
    account: user ? { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId } : null
  };
}

function subscriptionForUser(user) {
  if (!user) return null;
  return store.operations.billingSubscriptions
    .filter((subscription) => subscription.userId === user.id && subscription.companyId === user.companyId)
    .sort((left, right) => Number(['active','trialing'].includes(right.status)) - Number(['active','trialing'].includes(left.status)) || right.updatedAt - left.updatedAt)[0] || null;
}

function publicSubscription(subscription) {
  if (!subscription) return null;
  const { customerId, ...safe } = subscription;
  return safe;
}

function requirePaidSubscription(user) {
  if (!REQUIRE_SUBSCRIPTION || !user || ['admin', 'dispatcher'].includes(user.role)) return;
  const subscription = subscriptionForUser(user);
  if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
    throw reject(402, 'An active Alphaway Logistics subscription is required for operations access.');
  }
}

function operationId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function lookupFmcsaBroker(query) {
  if (!FMCSA_API_KEY) {
    return { configured: false, message: 'Set ALPHAWAY_FMCSA_QCMOBILE_KEY to enable live FMCSA lookup.' };
  }
  const safeQuery = encodeURIComponent(cleanText(query, '', 40));
  if (!safeQuery) throw reject(400, 'Enter an MC, DOT, or broker search value.');
  const endpoint = `${FMCSA_BASE_URL}/brokers/${safeQuery}?webKey=${encodeURIComponent(FMCSA_API_KEY)}`;
  const upstream = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw reject(502, `FMCSA lookup failed with status ${upstream.status}.`);
  return { configured: true, result: payload };
}

function readJson(request, maximumBytes) {
  return new Promise((resolve, rejectPromise) => {
    const chunks = [];
    let byteCount = 0;
    request.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > maximumBytes) {
        rejectPromise(reject(413, 'Request is too large.'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        rejectPromise(reject(400, 'Request body must be valid JSON.'));
      }
    });
    request.on('error', rejectPromise);
  });
}

function readRaw(request, maximumBytes) {
  return new Promise((resolve, rejectPromise) => {
    const chunks = [];
    let byteCount = 0;
    request.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > maximumBytes) {
        rejectPromise(reject(413, 'Request is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', rejectPromise);
  });
}

function contentTypeFor(filePath) {
  if (path.basename(filePath) === 'css2') return 'text/css; charset=utf-8';
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  }[extension] || 'application/octet-stream';
}

function serveStatic(request, response, pathname) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === '/' ? HOME_PAGE : pathname.replace(/^\/+/, ''));
  } catch (error) {
    sendJson(response, 400, { error: 'Invalid path.' });
    return;
  }
  if (!STATIC_FILES.has(requestedPath)) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  const resolvedPath = path.resolve(ROOT_DIR, requestedPath);
  if (!resolvedPath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
  fs.realpath(resolvedPath, (realPathError, realPath) => {
    if (realPathError || !realPath.startsWith(`${ROOT_DIR}${path.sep}`)) {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    fs.stat(realPath, (error, stats) => {
      if (error || !stats.isFile()) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
      }
      response.writeHead(200, responseHeaders({
        'Content-Type': contentTypeFor(realPath),
        'Cache-Control': 'no-store, private'
      }));
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = fs.createReadStream(realPath);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    });
  });
}

let store = readStore();
committedStore = structuredClone(store);
persistStore();

if (ACCOUNT_AUTH && store.accounts.users.length === 0 && process.env.ALPHAWAY_ADMIN_EMAIL && process.env.ALPHAWAY_ADMIN_PASSWORD) {
  const credentials = hashPassword(process.env.ALPHAWAY_ADMIN_PASSWORD);
  store.accounts.companies.push({ id: 'alphaway', name: 'Alphaway Logistics', type: 'organization', status: 'active', createdAt: Date.now() });
  store.accounts.users.push({ id: 'user-admin', email: process.env.ALPHAWAY_ADMIN_EMAIL.trim().toLowerCase(), name: 'Alphaway Administrator', role: 'admin', companyId: 'alphaway', status: 'active', passwordSalt: credentials.salt, passwordHash: credentials.hash, createdAt: Date.now() });
  persistStore();
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;
  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      if (!dataDirectoryIsWritable()) {
        sendJson(response, 503, { ok: false, error: 'Data storage is unavailable.' });
        return;
      }
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/stripe/webhook') {
      const raw = await readRaw(request, 256 * 1024);
      const event = billing.event(raw, headerValue(request, 'stripe-signature'));
      const tracked = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
      if (tracked.includes(event.type) && !store.operations.billingEvents.some((entry) => entry.id === event.id)) {
        const object = event.data.object;
        const stripeId = (value) => cleanText(typeof value === 'string' ? value : value?.id, '', 100);
        const previousEvents = store.operations.billingEvents;
        const previousSubscriptions = store.operations.billingSubscriptions;
        const previousRevision = store.revision;
        const previousOnboarded = store.carrierOnboardedCompanies;
        const subscriptionId = stripeId(event.type.startsWith('checkout.session.') ? object.subscription : object.id);
        const existingSubscription = previousSubscriptions.find((entry) => entry.id === subscriptionId);
        const metadata = object.metadata || {};
        if (event.type.startsWith('checkout.session.') && object.payment_status === 'paid' && (metadata.plan === 'carrier' || isDispatchPlan(metadata.plan)) && metadata.onboardingCharged === 'true' && metadata.companyId) {
          store.carrierOnboardedCompanies = [...new Set([...previousOnboarded, metadata.companyId])];
        }
        store.operations.billingEvents = [...previousEvents, {
          id: event.id, type: event.type,
          customerId: stripeId(object.customer),
          subscriptionId,
          status: cleanText(object.status, '', 40),
          paymentStatus: cleanText(object.payment_status, '', 40),
          userId: cleanText(object.metadata?.userId, '', 100),
          companyId: cleanText(object.metadata?.companyId, '', 100),
          eventCreated: event.created,
          createdAt: Date.now()
        }].slice(-500);
        if (subscriptionId) {
          const nextSubscription = reduceSubscription(existingSubscription, event);
          if (nextSubscription && nextSubscription !== existingSubscription) {
            store.operations.billingSubscriptions = [...previousSubscriptions.filter(entry => entry.id !== subscriptionId), nextSubscription];
          }
        }
        store.revision += 1;
        try { persistStore(); }
        catch (error) {
          // Leave retries eligible when the write fails.
          store.operations.billingEvents = previousEvents;
          store.operations.billingSubscriptions = previousSubscriptions;
          store.revision = previousRevision;
          store.carrierOnboardedCompanies = previousOnboarded;
          throw error;
        }
      }
      sendJson(response, 200, { received: true });
      return;
    }
    if (!hasPreviewAccess(request)) {
      if (!consumeRateLimit(request, 'auth', AUTH_FAILURE_LIMIT, AUTH_FAILURE_WINDOW_MS)) {
        sendJson(response, 429, { error: 'Too many authentication attempts. Try again shortly.' });
      } else {
        sendUnauthorized(response);
      }
      return;
    }
    if (pathname === '/api/dispatch/requests') {
      const actor = requireAccount(request, ['admin', 'dispatcher', 'carrier-owner']);
      if (request.method === 'GET') {
        sendJson(response, 200, { requests: store.dispatchRequests.filter(entry => staff(actor) || entry.companyId === actor.companyId) });
        return;
      }
      if (request.method !== 'POST') throw reject(405, 'Method not allowed.');
      requireJsonSameOrigin(request);
      if (!['admin', 'carrier-owner'].includes(actor.role) || !actor.companyId) throw reject(403, 'A carrier owner account is required.');
      if (!consumeRateLimit(request, 'dispatch-request', 12, AUTH_FAILURE_WINDOW_MS)) throw reject(429, 'Too many requests. Try again shortly.');
      const body = await readJson(request, 8192);
      const previous = store.dispatchRequests.find(entry => entry.companyId === actor.companyId && entry.status === 'pending_review');
      if (body.action === 'withdraw') {
        if (!previous || body.id !== previous.id) throw reject(404, 'Request not found.');
        previous.status = 'withdrawn';
        previous.updatedAt = Date.now();
        persistStore();
        sendJson(response, 200, { request: previous });
        return;
      }
      if (!isDispatchPlan(body.plan) || body.billingMethod !== 'percentage' || body.termsVersion !== dispatchTermsVersion) throw reject(400, 'Choose a dispatch package and acknowledge the percentage billing terms.');
      const truckCount = Number(body.truckCount);
      if (!Number.isInteger(truckCount) || truckCount < 1 || truckCount > 100) throw reject(400, 'Choose a whole-number truck count from 1 to 100.');
      if (store.operations.billingSubscriptions.some(sub => sub.companyId === actor.companyId && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(sub.status))) throw reject(409, 'Contact dispatch to change an existing subscription.');
      if (store.billingCheckouts.some(entry => entry.companyId === actor.companyId && entry.createdAt > Date.now() - 86400000)) throw reject(409, 'A checkout is pending. Contact dispatch before changing billing methods.');
      if (previous) {
        if (previous.plan !== body.plan || previous.truckCount !== truckCount) throw reject(409, 'Withdraw the pending request before choosing different terms.');
        sendJson(response, 200, { request: previous });
        return;
      }
      const entry = { id: crypto.randomUUID(), companyId: actor.companyId, userId: actor.id, email: actor.email, plan: body.plan, truckCount, billingMethod: 'percentage', percent: dispatchPlans[body.plan].percent, termsVersion: dispatchTermsVersion, status: 'pending_review', createdAt: Date.now() };
      store.dispatchRequests.push(entry);
      persistStore();
      sendJson(response, 201, { request: entry });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/stripe/checkout') {
      requireJsonSameOrigin(request);
      if (!hasNetworkAccess(request)) throw reject(403, 'An invitation code is required before Checkout.');
      const actor = ACCOUNT_AUTH ? requireAccount(request, ['admin', 'carrier-owner', 'shipper', 'broker']) : null;
      if (!consumeRateLimit(request, 'checkout', 12, AUTH_FAILURE_WINDOW_MS)) throw reject(429, 'Too many checkout attempts. Try again shortly.');
      const body = await readJson(request, 16 * 1024);
      const plan = cleanText(body?.plan, '', 20).toLowerCase();
      if (!['shipper', 'broker', ...Object.keys(dispatchPlans)].includes(plan)) throw reject(400, 'Choose a supported subscription plan.');
      const email = actor?.email || cleanText(body?.email, '', 160);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw reject(400, 'Enter a valid email address.');
      const companyId = actor?.companyId;
      const dispatch = isDispatchPlan(plan);
      if (dispatch && (body.billingMethod !== 'weekly' || body.termsVersion !== dispatchTermsVersion)) throw reject(400, 'Review the dispatch terms and choose weekly billing to open Checkout.');
      if (dispatch && !['admin', 'carrier-owner'].includes(actor?.role)) throw reject(403, 'A carrier owner account is required.');
      if (dispatch && store.dispatchRequests.some(entry => entry.companyId === companyId && entry.status === 'pending_review')) throw reject(409, 'Withdraw your percentage request before choosing weekly billing.');
      if (dispatch && !companyId) throw reject(400, 'An approved fleet account is required.');
      const truckCount = dispatch ? Number(body?.truckCount ?? 1) : 1;
      if (!Number.isInteger(truckCount) || truckCount < 1 || truckCount > 100) throw reject(400, 'Choose a whole-number truck count from 1 to 100.');
      const lock = companyId || actor?.id || 'preview';
      if (billing.ready === false) throw reject(503, 'Stripe Checkout is not configured yet. Dispatch can review your onboarding request.');
      if (checkoutLocks.has(lock)) throw reject(409, 'Checkout is already being prepared for this company.');
      if (store.operations.billingSubscriptions.some(sub => sub.companyId === companyId && ['active','trialing','past_due','unpaid','incomplete','paused'].includes(sub.status))) throw reject(409, 'This company already has a subscription. Use billing management.');
      let pending = store.billingCheckouts.find(entry => entry.companyId === lock && entry.createdAt > Date.now() - 24 * 60 * 60 * 1000);
      if (pending) {
        if (pending.plan !== plan || pending.truckCount !== truckCount) throw reject(409, 'An existing checkout is pending. Complete it or contact dispatch before changing quantities.');
        if (pending.url) {
          sendJson(response, 200, { url: pending.url, sessionId: pending.sessionId });
          return;
        }
        if (pending.userId !== (actor?.id || 'preview')) throw reject(409, 'Another company member has a checkout in progress.');
      }
      checkoutLocks.add(lock);
      try {
        // Save the retry identity before contacting Stripe. A lost response or failed final write
        // must reuse the same remote session, including its one-time onboarding item.
        if (!pending) {
          pending = { companyId: lock, userId: actor?.id || 'preview', email, plan, truckCount, onboardingRequired: dispatch && !store.carrierOnboardedCompanies.includes(companyId), requestId: crypto.randomUUID(), createdAt: Date.now() };
          store.billingCheckouts = [...store.billingCheckouts.filter(entry => entry.companyId !== lock), pending];
          persistStore();
        }
        const checkout = await billing.checkout(plan, pending.email, actor, pending.requestId, { truckCount, onboardingRequired: pending.onboardingRequired, billingMethod: dispatch ? 'weekly' : undefined });
        store.billingCheckouts = [...store.billingCheckouts.filter(entry => entry.companyId !== lock), { ...pending, ...checkout }];
        persistStore();
        sendJson(response, 200, checkout);
      } finally { checkoutLocks.delete(lock); }
      return;
    }
    if (request.method === 'GET' && pathname === '/api/stripe/subscription') {
      const actor = ACCOUNT_AUTH ? requireAccount(request) : null;
      sendJson(response, 200, { required: REQUIRE_SUBSCRIPTION, subscription: publicSubscription(subscriptionForUser(actor)) });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/stripe/portal') {
      requireJsonSameOrigin(request);
      const actor = requireAccount(request, ['carrier-owner', 'shipper', 'broker']);
      const subscription = subscriptionForUser(actor);
      if (!subscription?.customerId) throw reject(409, 'Complete Stripe Checkout before opening billing management.');
      sendJson(response, 200, await billing.portal(subscription.customerId));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/access') {
      requireJsonSameOrigin(request);
      if (!consumeRateLimit(request, 'network-access', NETWORK_ACCESS_FAILURE_LIMIT, AUTH_FAILURE_WINDOW_MS)) {
        sendJson(response, 429, { error: 'Too many invitation attempts. Try again shortly.' });
        return;
      }
      const body = await readJson(request, 4 * 1024);
      if (!timingSafeTextEqual(String(body?.code || ''), NETWORK_INVITE_CODE)) {
        sendJson(response, 403, { error: 'That invitation code is not valid.' });
        return;
      }
      const issuedAt = Date.now();
      const signature = crypto.createHmac('sha256', NETWORK_INVITE_CODE).update(String(issuedAt)).digest('hex');
      const secure = (SECURE_COOKIES || request.socket.encrypted) ? '; Secure' : '';
      sendJson(response, 200, { ok: true }, {
        'Set-Cookie': `${NETWORK_ACCESS_COOKIE}=${issuedAt}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`
      });
      return;
    }
    if (!hasNetworkAccess(request) && ['/api/app', '/api/events'].includes(pathname)) {
      sendNetworkAccessRequired(response);
      return;
    }
    if (request.method === 'POST' && pathname === '/api/accounts/signin') {
      requireJsonSameOrigin(request);
      const body = await readJson(request, 16 * 1024);
      const user = store.accounts.users.find((entry) => entry.email === cleanText(body?.email, '', 160).toLowerCase());
      if (!user || user.status !== 'active' || !verifyPassword(body?.password, user)) {
        throw reject(401, 'Invalid credentials or inactive account.');
      }
      const rawToken = crypto.randomBytes(32).toString('hex');
      store.accounts.sessions = [...store.accounts.sessions, {
        tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        userId: user.id,
        expiresAt: Date.now() + ACCOUNT_SESSION_DAYS * 86400000
      }].slice(-1000);
      addAudit(user.id, 'account.signin', user.id);
      persistStore();
      sendJson(response, 200, { account: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId } }, {
        'Set-Cookie': `${ACCOUNT_COOKIE}=${rawToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ACCOUNT_SESSION_DAYS * 86400}${(SECURE_COOKIES || request.socket.encrypted) ? '; Secure' : ''}`
      });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/accounts/accept') {
      requireJsonSameOrigin(request);
      const body = await readJson(request, 16 * 1024);
      const tokenHash = crypto.createHash('sha256').update(String(body?.token || '')).digest('hex');
      const invitation = store.accounts.invitations.find((entry) => entry.tokenHash === tokenHash && entry.status === 'pending' && entry.expiresAt > Date.now());
      const name = cleanText(body?.name, '', 120);
      const password = String(body?.password || '');
      if (!invitation || !name || password.length < 10) throw reject(400, 'A valid invitation, name, and password of at least 10 characters are required.');
      if (store.accounts.users.some((user) => user.email === invitation.email)) throw reject(409, 'An account already exists for this email.');
      const credentials = hashPassword(password);
      const user = { id: operationId('user'), email: invitation.email, name, role: invitation.role, companyId: invitation.companyId, status: 'active', passwordSalt: credentials.salt, passwordHash: credentials.hash, createdAt: Date.now() };
      store.accounts.users.push(user);
      invitation.status = 'accepted';
      addAudit(user.id, 'account.accept-invitation', user.id);
      persistStore();
      const rawToken = crypto.randomBytes(32).toString('hex');
      store.accounts.sessions.push({ tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'), userId: user.id, expiresAt: Date.now() + ACCOUNT_SESSION_DAYS * 86400000 });
      persistStore();
      sendJson(response, 201, { account: { id: user.id, name, email: user.email, role: user.role, companyId: user.companyId } }, {
        'Set-Cookie': `${ACCOUNT_COOKIE}=${rawToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ACCOUNT_SESSION_DAYS * 86400}${(SECURE_COOKIES || request.socket.encrypted) ? '; Secure' : ''}`
      });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/accounts/signout') {
      requireJsonSameOrigin(request);
      const tokenHash = crypto.createHash('sha256').update(parseCookies(request)[ACCOUNT_COOKIE] || '').digest('hex');
      const user = accountFromRequest(request);
      store.accounts.sessions = store.accounts.sessions.filter((session) => session.tokenHash !== tokenHash);
      if (user) addAudit(user.id, 'account.signout', user.id);
      persistStore();
      sendJson(response, 200, { ok: true }, { 'Set-Cookie': `${ACCOUNT_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/accounts/me') {
      sendJson(response, 200, { account: accountFromRequest(request) ? operationSnapshot(accountFromRequest(request)).account : null });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/accounts/invitations') {
      const actor = requireAccount(request, ['admin', 'dispatcher']);
      requireJsonSameOrigin(request);
      const body = await readJson(request, 16 * 1024);
      const email = cleanText(body?.email, '', 160).toLowerCase();
      const role = cleanText(body?.role, '', 40);
      const companyId = cleanText(body?.companyId, actor.companyId, 80);
      if (actor.role !== 'admin' && (['admin','dispatcher'].includes(role) || companyId !== actor.companyId)) throw reject(403, 'Only administrators can grant staff or other-company access.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ACCOUNT_ROLES.has(role) || !companyId) throw reject(400, 'A valid email, role, and company are required.');
      const rawToken = crypto.randomBytes(24).toString('hex');
      store.accounts.invitations = [...store.accounts.invitations, { id: operationId('invite'), email, role, companyId, tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'), status: 'pending', expiresAt: Date.now() + 7 * 86400000 }].slice(-500);
      addAudit(actor.id, 'account.invite', email);
      persistStore();
      sendJson(response, 201, { invitation: { email, role, companyId, token: rawToken, expiresAt: Date.now() + 7 * 86400000 } });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/accounts/users') {
      const actor = requireAccount(request, ['admin', 'dispatcher']);
      const users = store.accounts.users.filter((user) => actor.role === 'admin' || user.companyId === actor.companyId).map(({ passwordHash, passwordSalt, ...safe }) => safe);
      sendJson(response, 200, { users, companies: actor.role === 'admin' ? store.accounts.companies : store.accounts.companies.filter(company => company.id === actor.companyId) });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/accounts/audit') {
      const actor = requireAccount(request, ['admin', 'dispatcher']);
      const audit = actor.role === 'admin' ? store.accounts.audit : store.accounts.audit.filter((entry) => entry.actorId === actor.id);
      sendJson(response, 200, { audit: audit.slice(-200).reverse() });
      return;
    }
    if (request.method === 'PATCH' && pathname.startsWith('/api/accounts/users/')) {
      const actor = requireAccount(request, ['admin']);
      requireJsonSameOrigin(request);
      const userId = decodeURIComponent(pathname.slice('/api/accounts/users/'.length));
      const target = store.accounts.users.find((user) => user.id === userId);
      if (!target) throw reject(404, 'Account not found.');
      const body = await readJson(request, 16 * 1024);
      if (body.status && ACCOUNT_STATUSES.has(body.status)) target.status = body.status;
      if (body.role && ACCOUNT_ROLES.has(body.role)) target.role = body.role;
      if (body.companyId) target.companyId = cleanText(body.companyId, target.companyId, 80);
      if (body.password) {
        const password = hashPassword(body.password);
        target.passwordSalt = password.salt;
        target.passwordHash = password.hash;
      }
      addAudit(actor.id, 'account.update', target.id);
      persistStore();
      const { passwordHash, passwordSalt, ...safe } = target;
      sendJson(response, 200, { user: safe });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/operations') {
      const user = ACCOUNT_AUTH ? requireAccount(request) : null;
      requirePaidSubscription(user);
      sendJson(response, 200, operationSnapshot(user));
      return;
    }
    if (request.method === 'GET' && pathname === '/api/fmcsa/brokers') {
      if (!hasNetworkAccess(request)) {
        sendNetworkAccessRequired(response);
        return;
      }
      sendJson(response, 200, await lookupFmcsaBroker(requestUrl.searchParams.get('q')));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/operations') {
      if (!hasNetworkAccess(request)) {
        sendNetworkAccessRequired(response);
        return;
      }
      requireJsonSameOrigin(request);
      const actor = ACCOUNT_AUTH ? requireAccount(request, ['admin', 'dispatcher', 'carrier-owner', 'broker', 'shipper']) : null;
      requirePaidSubscription(actor);
      if (!consumeRateLimit(request, 'operations', OPERATION_LIMIT, EVENT_WINDOW_MS)) {
        throw reject(429, 'Too many operations updates. Try again shortly.');
      }
      const payload = await readJson(request, MAX_OPERATION_BYTES);
      const type = cleanText(payload?.type, '', 40);
      if (type === 'assignment.create') {
        const assignment = normalizeOperations({ assignments: [payload.assignment] }).assignments[0];
        if (!assignment) throw reject(400, 'A load, driver name, and truck are required.');
        assignment.companyId = actor?.companyId || 'demo';
        if (assignment.driverUserId && !store.accounts.users.some(user => user.id === assignment.driverUserId && user.role === 'driver' && user.companyId === assignment.companyId)) throw reject(403, 'Driver must belong to the same company.');
        store.operations.assignments = [assignment, ...store.operations.assignments].slice(0, 200);
      } else if (type === 'invoice.create') {
        const invoice = normalizeOperations({ invoices: [payload.invoice] }).invoices[0];
        if (!invoice) throw reject(400, 'A customer and valid invoice details are required.');
        invoice.id = operationId('invoice');
        invoice.companyId = actor?.companyId || 'demo';
        store.operations.invoices = [invoice, ...store.operations.invoices].slice(0, 200);
      } else if (type === 'document.upload') {
        const document = payload.document || {};
        const content = String(document.contentBase64 || '');
        if (!content || content.length > 4 * 1024 * 1024) throw reject(400, 'A document under 3 MB is required.');
        const fileName = cleanText(document.fileName, 'document', 160).replace(/[\\/]/g, '_');
        const uploadDirectory = path.join(path.dirname(DATA_FILE), 'documents');
        fs.mkdirSync(uploadDirectory, { recursive: true });
        const storedPath = path.join(uploadDirectory, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${fileName}`);
        fs.writeFileSync(storedPath, Buffer.from(content, 'base64'));
        const normalized = normalizeOperations({ documents: [{ ...document, fileName, size: Buffer.byteLength(content, 'base64'), storedPath: path.basename(storedPath), companyId: actor?.companyId || 'demo' }] }).documents[0];
        if (!normalized) throw reject(400, 'Document metadata is invalid.');
        normalized.id = operationId('document');
        store.operations.documents = [normalized, ...store.operations.documents].slice(0, 200);
      } else {
        throw reject(400, 'Unsupported operations update.');
      }
      store.revision += 1;
      persistStore();
      sendJson(response, 201, operationSnapshot(actor));
      return;
    }
    if (request.method === 'GET' && pathname === '/api/app') {
      sendJson(response, 200, publicSnapshot(accountFromRequest(request)));
      return;
    }
    if (request.method === 'GET' && pathname === '/api/events') {
      if (sseClients.size >= MAX_SSE_CLIENTS) {
        sendJson(response, 503, { error: 'Live update capacity is temporarily full.' });
        return;
      }
      response.writeHead(200, responseHeaders({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, private',
        Connection: 'keep-alive',
        Vary: 'Authorization',
        'X-Accel-Buffering': 'no'
      }));
      response.accountRequest = request;
      sseClients.add(response);
      response.write(`event: snapshot\ndata: ${JSON.stringify(publicSnapshot(accountFromRequest(request)))}\n\n`);
      request.on('close', () => sseClients.delete(response));
      response.on('error', () => sseClients.delete(response));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/events') {
      requireJsonSameOrigin(request);
      if (!consumeRateLimit(request, 'events', EVENT_LIMIT, EVENT_WINDOW_MS)) {
        throw reject(429, 'Too many updates. Try again shortly.');
      }
      if (ACCOUNT_AUTH) requireAccount(request);
      const event = await readJson(request, MAX_JSON_BYTES);
      if (ACCOUNT_AUTH && (event?.type?.startsWith('catalog.') || event?.type?.startsWith('tms.'))) {
        requireAccount(request, ['admin', 'dispatcher']);
      }
      sendJson(response, 200, { snapshot: acceptEvent(event, accountFromRequest(request)) });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/intakes') {
      if (!hasIntakeReadAccess(request)) {
        sendJson(response, 403, { error: 'Authorized staff access is required to view intake requests.' });
        return;
      }
      sendJson(response, 200, intakeReview.listIntakes(store.intakes, store.intakeReviews, new URL(request.url, 'http://localhost').searchParams));
      return;
    }
    if (request.method === 'GET' && pathname === '/api/intakes/meta') {
      requireAccount(request, ['admin', 'dispatcher']);
      sendJson(response, 200, { categories: intakeReview.categories, statuses: intakeReview.statuses,
        reviewers: store.accounts.users.filter(user => user.status === 'active' && staff(user)).map(user => ({ id: user.id, name: user.name, role: user.role })) });
      return;
    }
    const intakeRoute = pathname.match(/^\/api\/intakes\/([a-zA-Z0-9_-]+)(?:\/(review|history|export))?$/);
    if (intakeRoute) {
      const actor = requireAccount(request, ['admin', 'dispatcher']);
      const record = store.intakes.find(intake => intake.id === intakeRoute[1]);
      if (!record) throw reject(404, 'Intake record not found.');
      const review = store.intakeReviews[record.id];
      if (request.method === 'GET' && intakeRoute[2] === 'export') {
        sendJson(response, 200, { exportedAt: Date.now(), intake: record, review: { ...intakeReview.publicReview(review), history: intakeReview.publicHistory(review.history) } });
        return;
      }
      if (request.method === 'GET' && !intakeRoute[2]) {
        sendJson(response, 200, { intake: record, review: intakeReview.publicReview(review) });
        return;
      }
      if (request.method === 'GET' && intakeRoute[2] === 'history') {
        const query = new URL(request.url, 'http://localhost').searchParams;
        const pages = Math.max(1, Math.ceil(review.history.length / 25));
        const page = Math.min(pages, Math.max(1, parseInt(query.get('page'), 10) || 1));
        const end = review.history.length - (page - 1) * 25;
        sendJson(response, 200, { history: intakeReview.publicHistory(review.history.slice(Math.max(0, end - 25), end).reverse()), total: review.history.length, page, pages });
        return;
      }
      if (request.method === 'POST' && intakeRoute[2] === 'review') {
        requireJsonSameOrigin(request);
        const input = await readJson(request, MAX_INTAKE_BYTES);
        // Re-read after awaiting the body: another request may have committed meanwhile.
        const result = intakeReview.applyReview(store.intakeReviews[record.id], input, requireAccount(request, ['admin', 'dispatcher']), store.accounts.users);
        if (!result.replayed) {
          store.intakeReviews[record.id] = result.review;
          store.revision += 1;
          persistStore();
        }
        sendJson(response, 200, { intake: record, review: intakeReview.publicReview(result.review), replayed: result.replayed });
        return;
      }
      throw reject(405, 'Method not allowed.');
    }
    if (request.method === 'POST' && pathname === '/api/intakes') {
      requireJsonSameOrigin(request);
      if (!consumeRateLimit(request, 'intakes', INTAKE_LIMIT, INTAKE_WINDOW_MS)) {
        throw reject(429, 'Too many intake requests. Try again later.');
      }
      const candidate = normalizeIntake(await readJson(request, MAX_INTAKE_BYTES));
      if (!candidate) throw reject(400, 'A supported request type is required.');
      if (candidate.type === 'carrier-onboarding' && (!isDispatchPlan(candidate.fields.dispatch_package) || !['weekly', 'percentage'].includes(candidate.fields.billing_method) || candidate.fields.dispatch_terms !== dispatchTermsVersion || !Number.isInteger(Number(candidate.fields.available_units)) || Number(candidate.fields.available_units) < 1 || Number(candidate.fields.available_units) > 100)) throw reject(400, 'Choose a dispatch package, billing method, 1 to 100 trucks and acknowledge the current terms.');
      candidate.id = `intake-${crypto.randomUUID()}`;
      candidate.createdAt = Date.now();
      store.intakes.push(candidate);
      store.intakeReviews[candidate.id] = intakeReview.createReview(candidate);
      store.revision += 1;
      persistStore();
      broadcastSnapshot();
      sendJson(response, 201, { intake: candidate });
      return;
    }
    if (pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API route not found.' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }
    serveStatic(request, response, pathname);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) console.error(error);
    sendJson(response, statusCode, {
      error: error.message || 'Unexpected server error.',
      ...(error.snapshot ? { snapshot: error.snapshot } : {})
    });
  }
});

setInterval(() => {
  if (!store.state.tms.demoRunning || sseClients.size === 0) return;
  try {
    refreshTracking();
    store.revision += 1;
    persistStore();
    broadcastSnapshot();
  } catch { console.error('Demo tracking update could not be saved.'); }
}, 5000).unref();

setInterval(() => {
  for (const response of sseClients) {
    try {
      response.write(': keep-alive\n\n');
    } catch (error) {
      sseClients.delete(response);
    }
  }
}, 25000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitBuckets) {
    const windowMs = key.startsWith('intakes:') ? INTAKE_WINDOW_MS : Math.max(AUTH_FAILURE_WINDOW_MS, EVENT_WINDOW_MS);
    const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (recent.length) rateLimitBuckets.set(key, recent);
    else rateLimitBuckets.delete(key);
  }
}, 60000).unref();

function shutdown(signal) {
  console.log(`Received ${signal}; closing the Alphaway server.`);
  for (const response of sseClients) response.end();
  sseClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, BIND_HOST, () => {
  console.log(`Alphaway app running at http://${BIND_HOST}:${server.address().port}`);
  console.log(`Data store: ${DATA_FILE}`);
  console.log(`Preview access: ${REQUIRE_PREVIEW_AUTH ? 'enabled' : 'disabled (local default)'}`);
});
