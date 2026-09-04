const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const BIND_HOST = String(process.env.ALPHAWAY_HOST || process.env.HOST || '127.0.0.1').trim();
const DATA_FILE = process.env.ALPHAWAY_DATA_FILE || path.join(ROOT_DIR, 'data', 'alphaway-store.json');
const REQUIRE_PREVIEW_AUTH = String(process.env.ALPHAWAY_REQUIRE_AUTH || '').trim().toLowerCase() === 'true';
const PREVIEW_USERNAME = String(process.env.ALPHAWAY_PREVIEW_USERNAME || process.env.ALPHAWAY_ACCESS_USER || '').trim();
const PREVIEW_PASSWORD = String(process.env.ALPHAWAY_PREVIEW_PASSWORD || process.env.ALPHAWAY_ACCESS_PASSWORD || '');
const PREVIEW_ADMIN_TOKEN = String(process.env.ALPHAWAY_ADMIN_TOKEN || '');
const HOME_PAGE = 'Alphaway Logistics LLC _ Nationwide Freight & Dispatch.html';
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_INTAKE_BYTES = 64 * 1024;
const MAX_SSE_CLIENTS = 40;
const AUTH_FAILURE_WINDOW_MS = 60 * 1000;
const AUTH_FAILURE_LIMIT = 12;
const EVENT_WINDOW_MS = 60 * 1000;
const EVENT_LIMIT = 120;
const INTAKE_WINDOW_MS = 60 * 60 * 1000;
const INTAKE_LIMIT = 12;
const sseClients = new Set();
const rateLimitBuckets = new Map();

const STATIC_FILES = new Set([
  HOME_PAGE,
  'loadboard.html',
  'tms.html',
  'admin.html',
  'carrier-onboarding.html',
  'carrier-agreement.html',
  'broker-intake.html',
  'contact-portal.html',
  'style.css',
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

if (!BIND_HOST) throw new Error('ALPHAWAY_HOST must not be blank.');
if (REQUIRE_PREVIEW_AUTH && (!PREVIEW_USERNAME || !PREVIEW_PASSWORD)) {
  throw new Error('ALPHAWAY_REQUIRE_AUTH=true requires ALPHAWAY_PREVIEW_USERNAME and ALPHAWAY_PREVIEW_PASSWORD.');
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
  'carrier-onboarding': new Set(['legal_carrier_name', 'primary_contact', 'business_email', 'business_phone', 'mc_number', 'dot_number', 'equipment_type', 'available_units', 'preferred_lanes', 'availability', 'operational_notes']),
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
  if (!REQUIRE_PREVIEW_AUTH) return true;
  return Boolean(PREVIEW_ADMIN_TOKEN)
    && timingSafeTextEqual(headerValue(request, 'x-alphaway-admin-token'), PREVIEW_ADMIN_TOKEN);
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
  return { schemaVersion: 1, revision: 1, loads, state: defaultState(), intakes: [] };
}

function normalizeStore(candidate) {
  const loads = normalizeCatalog(candidate?.loads) || defaultLoads();
  return {
    schemaVersion: 1,
    revision: cleanNumber(candidate?.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    loads,
    state: normalizeState(candidate?.state, loads),
    intakes: Array.isArray(candidate?.intakes) ? candidate.intakes.slice(-200).map(normalizeIntake).filter(Boolean) : []
  };
}

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return createStore();
    return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (error) {
    console.warn('Could not read the local data store; starting from safe demo data.', error.message);
    return createStore();
  }
}

function persistStore() {
  const directory = path.dirname(DATA_FILE);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryFile, DATA_FILE);
}

function publicSnapshot() {
  return { revision: store.revision, loads: store.loads, state: store.state };
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

function acceptEvent(event) {
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
      store.state.bookedLoads = [...new Set([loadId, ...store.state.bookedLoads])].slice(0, 100);
      break;
    }
    case 'saved-search.add': {
      const search = event.search || {};
      const normalized = normalizeState({ savedSearches: [search], bookedLoads: [], messages: [], tms: store.state.tms }, store.loads).savedSearches[0];
      store.state.savedSearches = [normalized, ...store.state.savedSearches.filter((item) => item.id !== normalized.id)].slice(0, 20);
      break;
    }
    case 'message.send': {
      const message = event.message || {};
      const loadId = message.loadId === 'general' || validLoadIds.has(message.loadId) ? message.loadId : null;
      const text = cleanText(message.text, '', 500);
      if (!loadId || !text) throw reject(400, 'A valid load and message are required.');
      store.state.messages = [...store.state.messages, {
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        loadId,
        sender: message.sender === 'Driver' ? 'Driver' : 'Dispatcher',
        text,
        createdAt: Date.now()
      }].slice(-200);
      break;
    }
    case 'tms.set-demo-running': {
      store.state.tms.demoRunning = event.demoRunning !== false;
      break;
    }
    case 'tms.refresh': {
      refreshTracking(cleanText(event.loadId, '', 28) || null);
      break;
    }
    default:
      throw reject(400, 'Unsupported app event.');
  }

  store.state = normalizeState(store.state, store.loads);
  store.revision += 1;
  persistStore();
  broadcastSnapshot();
  return publicSnapshot();
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
  const message = `event: snapshot\ndata: ${JSON.stringify(publicSnapshot())}\n\n`;
  for (const response of sseClients) {
    try {
      response.write(message);
    } catch (error) {
      sseClients.delete(response);
    }
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, responseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private'
  }));
  response.end(JSON.stringify(payload));
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
    if (!hasPreviewAccess(request)) {
      if (!consumeRateLimit(request, 'auth', AUTH_FAILURE_LIMIT, AUTH_FAILURE_WINDOW_MS)) {
        sendJson(response, 429, { error: 'Too many authentication attempts. Try again shortly.' });
      } else {
        sendUnauthorized(response);
      }
      return;
    }
    if (request.method === 'GET' && pathname === '/api/app') {
      sendJson(response, 200, publicSnapshot());
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
      sseClients.add(response);
      response.write(`event: snapshot\ndata: ${JSON.stringify(publicSnapshot())}\n\n`);
      request.on('close', () => sseClients.delete(response));
      response.on('error', () => sseClients.delete(response));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/events') {
      requireJsonSameOrigin(request);
      if (!consumeRateLimit(request, 'events', EVENT_LIMIT, EVENT_WINDOW_MS)) {
        throw reject(429, 'Too many updates. Try again shortly.');
      }
      const event = await readJson(request, MAX_JSON_BYTES);
      sendJson(response, 200, { snapshot: acceptEvent(event) });
      return;
    }
    if (request.method === 'GET' && pathname === '/api/intakes') {
      if (!hasIntakeReadAccess(request)) {
        sendJson(response, 403, { error: 'An administrator token is required to view intake requests.' });
        return;
      }
      sendJson(response, 200, { intakes: store.intakes.slice(-30).reverse() });
      return;
    }
    if (request.method === 'POST' && pathname === '/api/intakes') {
      requireJsonSameOrigin(request);
      if (!consumeRateLimit(request, 'intakes', INTAKE_LIMIT, INTAKE_WINDOW_MS)) {
        throw reject(429, 'Too many intake requests. Try again later.');
      }
      const candidate = normalizeIntake(await readJson(request, MAX_INTAKE_BYTES));
      if (!candidate) throw reject(400, 'A supported request type is required.');
      candidate.id = `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      candidate.createdAt = Date.now();
      store.intakes = [...store.intakes, candidate].slice(-200);
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
  refreshTracking();
  store.revision += 1;
  persistStore();
  broadcastSnapshot();
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
  console.log(`Alphaway app running at http://${BIND_HOST}:${PORT}`);
  console.log(`Data store: ${DATA_FILE}`);
  console.log(`Preview access: ${REQUIRE_PREVIEW_AUTH ? 'enabled' : 'disabled (local default)'}`);
});
