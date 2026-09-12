const allStates = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Puerto Rico','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','Washington DC','West Virginia','Wisconsin','Wyoming'
];

const loads = [
  {
    id: 'LB-48201',
    origin: 'Denver, CO',
    destination: 'Phoenix, AZ',
    equipment: 'Dry Van',
    miles: 698,
    rate: 2540,
    pickup: 'Today, 2:00 PM',
    delivery: 'Tomorrow, 11:30 AM',
    weight: '26,000 lb',
    broker: 'Swiftline Logistics',
    status: 'Hot',
    lane: 'Denver → Phoenix'
  },
  {
    id: 'LB-48322',
    origin: 'Colorado Springs, CO',
    destination: 'Dallas, TX',
    equipment: 'Reefer',
    miles: 874,
    rate: 3185,
    pickup: 'Today, 7:15 PM',
    delivery: 'Fri, 6:00 AM',
    weight: '22,400 lb',
    broker: 'Northway Freight',
    status: 'New',
    lane: 'Colorado Springs → Dallas'
  },
  {
    id: 'LB-48190',
    origin: 'Fort Collins, CO',
    destination: 'Kansas City, MO',
    equipment: 'Flatbed',
    miles: 992,
    rate: 2950,
    pickup: 'Tomorrow, 9:45 AM',
    delivery: 'Sat, 2:15 PM',
    weight: '41,600 lb',
    broker: 'Summit Dispatch',
    status: 'Hot',
    lane: 'Fort Collins → Kansas City'
  },
  {
    id: 'LB-48246',
    origin: 'Grand Junction, CO',
    destination: 'Salt Lake City, UT',
    equipment: 'Power Only',
    miles: 412,
    rate: 1860,
    pickup: 'Today, 11:00 AM',
    delivery: 'Today, 9:30 PM',
    weight: '12,000 lb',
    broker: 'Cedar Union',
    status: 'New',
    lane: 'Grand Junction → Salt Lake City'
  },
  {
    id: 'LB-48410',
    origin: 'Denver, CO',
    destination: 'Albuquerque, NM',
    equipment: 'Dry Van',
    miles: 519,
    rate: 2265,
    pickup: 'Tomorrow, 1:30 PM',
    delivery: 'Tue, 7:10 AM',
    weight: '28,300 lb',
    broker: 'Blue Mesa Logistics',
    status: 'Hot',
    lane: 'Denver → Albuquerque'
  },
  {
    id: 'LB-48468',
    origin: 'Pueblo, CO',
    destination: 'Omaha, NE',
    equipment: 'Reefer',
    miles: 711,
    rate: 2675,
    pickup: 'Sat, 6:00 AM',
    delivery: 'Sun, 4:45 PM',
    weight: '17,800 lb',
    broker: 'Prairie Crest',
    status: 'New',
    lane: 'Pueblo → Omaha'
  },
  {
    id: 'LB-48155',
    origin: 'Greeley, CO',
    destination: 'Las Vegas, NV',
    equipment: 'Dry Van',
    miles: 1042,
    rate: 3455,
    pickup: 'Fri, 10:15 AM',
    delivery: 'Sat, 10:00 PM',
    weight: '30,900 lb',
    broker: 'Mountain Line',
    status: 'Hot',
    lane: 'Greeley → Las Vegas'
  },
  {
    id: 'LB-48531',
    origin: 'Boulder, CO',
    destination: 'Cheyenne, WY',
    equipment: 'Flatbed',
    miles: 170,
    rate: 975,
    pickup: 'Today, 8:30 AM',
    delivery: 'Today, 3:00 PM',
    weight: '38,000 lb',
    broker: 'High Plains Haul',
    status: 'New',
    lane: 'Boulder → Cheyenne'
  },
  {
    id: 'LB-48621',
    origin: 'Atlanta, GA',
    destination: 'Jacksonville, FL',
    equipment: 'Dry Van',
    miles: 452,
    rate: 2140,
    pickup: 'Today, 4:45 PM',
    delivery: 'Tue, 5:30 AM',
    weight: '23,500 lb',
    broker: 'Southern Route Group',
    status: 'Hot',
    lane: 'Atlanta → Jacksonville'
  },
  {
    id: 'LB-48658',
    origin: 'Chicago, IL',
    destination: 'Detroit, MI',
    equipment: 'Reefer',
    miles: 281,
    rate: 1825,
    pickup: 'Tomorrow, 7:00 AM',
    delivery: 'Tomorrow, 3:30 PM',
    weight: '19,800 lb',
    broker: 'Midwest Bridge',
    status: 'New',
    lane: 'Chicago → Detroit'
  },
  {
    id: 'LB-48703',
    origin: 'Nashville, TN',
    destination: 'Charlotte, NC',
    equipment: 'Flatbed',
    miles: 436,
    rate: 2420,
    pickup: 'Fri, 1:15 PM',
    delivery: 'Sat, 6:10 PM',
    weight: '33,200 lb',
    broker: 'Blue Ridge Carrier Co.',
    status: 'Hot',
    lane: 'Nashville → Charlotte'
  },
  {
    id: 'LB-48795',
    origin: 'Portland, OR',
    destination: 'Spokane, WA',
    equipment: 'Dry Van',
    miles: 432,
    rate: 1965,
    pickup: 'Today, 9:20 AM',
    delivery: 'Today, 7:10 PM',
    weight: '27,900 lb',
    broker: 'Cascade Dispatch',
    status: 'New',
    lane: 'Portland → Spokane'
  },
  {
    id: 'LB-48822',
    origin: 'Philadelphia, PA',
    destination: 'Baltimore, MD',
    equipment: 'Power Only',
    miles: 170,
    rate: 980,
    pickup: 'Today, 12:00 PM',
    delivery: 'Today, 4:30 PM',
    weight: '10,800 lb',
    broker: 'Atlantic Fleet',
    status: 'New',
    lane: 'Philadelphia → Baltimore'
  },
  {
    id: 'LB-48871',
    origin: 'Dallas, TX',
    destination: 'Houston, TX',
    equipment: 'Reefer',
    miles: 246,
    rate: 1480,
    pickup: 'Tomorrow, 6:00 AM',
    delivery: 'Tomorrow, 2:00 PM',
    weight: '16,900 lb',
    broker: 'Texas Freight One',
    status: 'Hot',
    lane: 'Dallas → Houston'
  },
  {
    id: 'LB-48911',
    origin: 'Reno, NV',
    destination: 'Sacramento, CA',
    equipment: 'Flatbed',
    miles: 566,
    rate: 2285,
    pickup: 'Sat, 7:30 AM',
    delivery: 'Sun, 3:15 PM',
    weight: '36,400 lb',
    broker: 'Golden Bear Logistics',
    status: 'New',
    lane: 'Reno → Sacramento'
  },
  {
    id: 'LB-48974',
    origin: 'Boston, MA',
    destination: 'Newark, NJ',
    equipment: 'Dry Van',
    miles: 220,
    rate: 1620,
    pickup: 'Today, 5:15 PM',
    delivery: 'Tomorrow, 12:45 PM',
    weight: '25,700 lb',
    broker: 'Northeast Line',
    status: 'Hot',
    lane: 'Boston → Newark'
  }
];

const statePositions = {
  AL: { x: 62, y: 72 }, AK: { x: 18, y: 18 }, AZ: { x: 28, y: 56 }, AR: { x: 52, y: 64 }, CA: { x: 18, y: 52 },
  CO: { x: 38, y: 42 }, CT: { x: 82, y: 34 }, DE: { x: 80, y: 52 }, FL: { x: 70, y: 86 }, GA: { x: 66, y: 70 },
  HI: { x: 20, y: 84 }, ID: { x: 22, y: 30 }, IL: { x: 54, y: 46 }, IN: { x: 58, y: 50 }, IA: { x: 48, y: 42 },
  KS: { x: 44, y: 54 }, KY: { x: 60, y: 58 }, LA: { x: 52, y: 76 }, ME: { x: 91, y: 22 }, MD: { x: 78, y: 48 },
  MA: { x: 86, y: 30 }, MI: { x: 58, y: 34 }, MN: { x: 50, y: 24 }, MS: { x: 56, y: 72 }, MO: { x: 48, y: 52 },
  MT: { x: 28, y: 18 }, NE: { x: 42, y: 40 }, NV: { x: 22, y: 44 }, NH: { x: 88, y: 24 }, NJ: { x: 82, y: 42 },
  NM: { x: 36, y: 58 }, NY: { x: 80, y: 32 }, NC: { x: 72, y: 60 }, ND: { x: 42, y: 18 }, OH: { x: 62, y: 46 },
  OK: { x: 46, y: 60 }, OR: { x: 14, y: 32 }, PA: { x: 76, y: 42 }, PR: { x: 88, y: 90 }, RI: { x: 87, y: 36 },
  SC: { x: 69, y: 66 }, SD: { x: 42, y: 28 }, TN: { x: 60, y: 62 }, TX: { x: 44, y: 70 }, UT: { x: 26, y: 44 },
  VT: { x: 86, y: 24 }, VA: { x: 76, y: 54 }, WA: { x: 12, y: 18 }, DC: { x: 78, y: 48 }, WV: { x: 70, y: 46 },
  WI: { x: 52, y: 30 }, WY: { x: 32, y: 28 }
};

const LOAD_CATALOG_STORAGE_KEY = 'alphaway-loadboard-catalog';
const BOARD_STATE_STORAGE_KEY = 'alphaway-loadboard-state';
const allowedEquipment = ['Dry Van', 'Reefer', 'Flatbed', 'Power Only'];
const allowedLoadStatuses = ['Hot', 'New', 'Available', 'Booked'];

function cleanLoadText(value, fallback = '', maxLength = 90) {
  const text = String(value ?? '')
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function cleanLoadNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function getLoadLane(origin, destination) {
  const originCity = cleanLoadText(origin, 'Origin', 90).split(',')[0].trim();
  const destinationCity = cleanLoadText(destination, 'Destination', 90).split(',')[0].trim();
  return `${originCity} → ${destinationCity}`;
}

function normalizeLoadRecord(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object') return null;
  const rawId = cleanLoadText(candidate.id, '', 28).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const id = rawId || `LOCAL-${String(index + 1).padStart(3, '0')}`;
  const origin = cleanLoadText(candidate.origin, 'Origin not set');
  const destination = cleanLoadText(candidate.destination, 'Destination not set');
  const equipment = allowedEquipment.includes(candidate.equipment) ? candidate.equipment : 'Dry Van';
  const status = allowedLoadStatuses.includes(candidate.status) ? candidate.status : 'Available';

  return {
    id,
    origin,
    destination,
    equipment,
    miles: cleanLoadNumber(candidate.miles, 0, 0, 10000),
    rate: cleanLoadNumber(candidate.rate, 0, 0, 100000),
    pickup: cleanLoadText(candidate.pickup, 'TBD', 60),
    delivery: cleanLoadText(candidate.delivery, 'TBD', 60),
    weight: cleanLoadText(candidate.weight, 'TBD', 40),
    broker: cleanLoadText(candidate.broker, 'Unassigned', 90),
    status,
    lane: getLoadLane(origin, destination)
  };
}

function normalizeLoadCatalog(catalog) {
  if (!Array.isArray(catalog)) return null;
  const ids = new Set();
  const normalized = catalog
    .slice(0, 100)
    .map((candidate, index) => normalizeLoadRecord(candidate, index))
    .filter((candidate) => {
      if (!candidate || ids.has(candidate.id)) return false;
      ids.add(candidate.id);
      return true;
    });
  return normalized.length ? normalized : null;
}

function reconcileBoardStateForCatalog(catalog, { resetLoadScopedState = false } = {}) {
  try {
    const storedState = JSON.parse(localStorage.getItem(BOARD_STATE_STORAGE_KEY) || 'null');
    if (!storedState || typeof storedState !== 'object') return;

    const validLoadIds = new Set(catalog.map((load) => load.id));
    const nextState = { ...storedState };

    if (resetLoadScopedState) {
      nextState.bookedLoads = [];
      nextState.messages = Array.isArray(storedState.messages)
        ? storedState.messages.filter((message) => message?.loadId === 'general')
        : [];
      delete nextState.tms;
    } else {
      nextState.bookedLoads = Array.isArray(storedState.bookedLoads)
        ? storedState.bookedLoads.filter((loadId) => validLoadIds.has(loadId))
        : [];
      nextState.messages = Array.isArray(storedState.messages)
        ? storedState.messages.filter((message) => message?.loadId === 'general' || validLoadIds.has(message?.loadId))
        : [];

      if (storedState.tms && Array.isArray(storedState.tms.assignments)) {
        nextState.tms = {
          ...storedState.tms,
          assignments: storedState.tms.assignments.filter((assignment) => validLoadIds.has(assignment?.loadId))
        };
      }
    }

    localStorage.setItem(BOARD_STATE_STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    // Keeping the catalog usable is more important than failing on an invalid legacy browser state.
  }
}

function cloneDefaultLoads() {
  return loads.map((load, index) => normalizeLoadRecord(load, index));
}

const APP_UPDATED_EVENT = 'alphaway-app-updated';
let remoteAppSnapshot = null;
let appHydrationGeneration = 0;
let appEventStream = null;
let privateAccessLocked = false;
let resolveAppReady;
const appReady = new Promise((resolve) => {
  resolveAppReady = resolve;
});

function hasServerTransport() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function isServerConnected() {
  return Boolean(remoteAppSnapshot);
}

function isPrivateAccessLocked() {
  return privateAccessLocked;
}

function applyRemoteSnapshot(snapshot) {
  const normalizedCatalog = normalizeLoadCatalog(snapshot?.loads);
  if (!normalizedCatalog || !snapshot?.state || typeof snapshot.state !== 'object') return;
  const revision = Number(snapshot.revision || 0);
  if (remoteAppSnapshot && revision && revision < Number(remoteAppSnapshot.revision || 0)) return;
  remoteAppSnapshot = {
    revision,
    loads: normalizedCatalog,
    state: snapshot.state
  };
  window.dispatchEvent(new CustomEvent(APP_UPDATED_EVENT, { detail: { revision } }));
}

function getRemoteAppState() {
  return remoteAppSnapshot?.state || null;
}

async function sendAppEvent(event) {
  if (!hasServerTransport()) return null;
  const response = await fetch('./api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  const payload = await response.json().catch(() => ({}));
  if (payload.snapshot) applyRemoteSnapshot(payload.snapshot);
  if (!response.ok) throw new Error(payload.error || 'The app could not save that change.');
  return payload.snapshot || null;
}

async function submitIntakeRequest(request) {
  if (!hasServerTransport()) return null;
  const response = await fetch('./api/intakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be saved.');
  return payload.intake || null;
}

function connectAppEvents() {
  if (!hasServerTransport() || !('EventSource' in window) || appEventStream) return;
  appEventStream = new EventSource('./api/events');
  appEventStream.addEventListener('onboarding-required', () => {
    appEventStream.close(); appEventStream = null; privateAccessLocked = true;
    if (/\/(loadboard|tms)\.html$/.test(window.location.pathname)) window.location.assign('./onboarding.html');
  });
  appEventStream.addEventListener('snapshot', (event) => {
    try {
      applyRemoteSnapshot(JSON.parse(event.data));
    } catch (error) {
      // Ignore a malformed event and wait for the next complete server snapshot.
    }
  });
  appEventStream.addEventListener('error', () => {
    // The browser reconnects EventSource automatically. The local fallback remains usable meanwhile.
  });
}

async function hydrateApp() {
  const generation = ++appHydrationGeneration;
  if (!hasServerTransport()) {
    resolveAppReady(null);
    return;
  }
  try {
    const response = await fetch('./api/app', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      if (response.status === 403) {
        const failure = await response.clone().json().catch(() => ({}));
        if (failure.code === 'onboarding_required') {
          privateAccessLocked = true;
          if (/\/(loadboard|tms)\.html$/.test(window.location.pathname)) window.location.assign('./onboarding.html');
        }
      }
      if (response.status === 403 && response.headers.get('X-Alphaway-Private-Network') === 'true') {
        privateAccessLocked = true;
        window.dispatchEvent(new CustomEvent('alphaway-private-access-required'));
      }
      throw new Error('Server snapshot unavailable.');
    }
    privateAccessLocked = false;
    const snapshot = await response.json();
    if (generation !== appHydrationGeneration) return;
    applyRemoteSnapshot(snapshot);
    connectAppEvents();
  } catch (error) {
    // Opening a downloaded HTML file or a basic static host still uses the explicit local demo fallback.
  } finally {
    resolveAppReady(remoteAppSnapshot);
  }

}

async function requestNetworkAccess(code) {
  const response = await fetch('./api/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The invitation code could not be verified.');
  remoteAppSnapshot = null;
  await hydrateApp();
  if (privateAccessLocked) throw new Error('The private network is still unavailable.');
}

function getLoadCatalog() {
  if (privateAccessLocked) return [];
  const remoteCatalog = normalizeLoadCatalog(remoteAppSnapshot?.loads);
  if (remoteCatalog) return remoteCatalog;
  try {
    const storedCatalog = JSON.parse(localStorage.getItem(LOAD_CATALOG_STORAGE_KEY) || 'null');
    return normalizeLoadCatalog(storedCatalog) || cloneDefaultLoads();
  } catch (error) {
    return cloneDefaultLoads();
  }
}

async function saveLoadCatalog(catalog) {
  const normalized = normalizeLoadCatalog(catalog);
  if (!normalized) throw new Error('Add at least one valid load to the demo catalog.');

  if (isServerConnected()) {
    const snapshot = await sendAppEvent({
      type: 'catalog.replace',
      loads: normalized,
      baseRevision: remoteAppSnapshot.revision
    });
    return normalizeLoadCatalog(snapshot?.loads) || normalized;
  }

  localStorage.setItem(LOAD_CATALOG_STORAGE_KEY, JSON.stringify(normalized));
  reconcileBoardStateForCatalog(normalized);
  return normalized;
}

async function resetLoadCatalog() {
  if (isServerConnected()) {
    const snapshot = await sendAppEvent({ type: 'catalog.reset', baseRevision: remoteAppSnapshot.revision });
    return normalizeLoadCatalog(snapshot?.loads) || cloneDefaultLoads();
  }

  try {
    localStorage.removeItem(LOAD_CATALOG_STORAGE_KEY);
  } catch (error) {
    // Browser storage can be unavailable on restrictive local file origins.
  }
  const defaultCatalog = cloneDefaultLoads();
  reconcileBoardStateForCatalog(defaultCatalog, { resetLoadScopedState: true });
  return defaultCatalog;
}

window.AlphawayLoadboard = Object.freeze({
  catalogStorageKey: LOAD_CATALOG_STORAGE_KEY,
  getLoads: getLoadCatalog,
  saveLoads: saveLoadCatalog,
  resetLoads: resetLoadCatalog,
  getState: getRemoteAppState,
  isServerConnected,
  isPrivateAccessLocked,
  requestNetworkAccess,
  whenReady: () => appReady,
  sendEvent: sendAppEvent,
  submitIntake: submitIntakeRequest
});

hydrateApp();

const boardRoot = document.getElementById('originFilter');

const signupForm = document.getElementById('signupForm');
const signupStatus = document.getElementById('signupStatus');

document.querySelectorAll('[data-plan].plan-checkout-button').forEach((button) => {
  button.addEventListener('click', () => { window.location.assign('./workspace.html'); });
});

if (signupForm && signupStatus) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const company = String(formData.get('company') || '').trim();
    const plan = String(formData.get('plan') || '').trim();
    const subject = `Access request: ${company}`;
    const body = `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nPlan: ${plan}`;

    if (isServerConnected()) {
      signupStatus.textContent = 'Saving your request…';
      try {
        await submitIntakeRequest({ type: 'access-request', fields: { name, email, company, plan } });
        signupForm.reset();
        signupStatus.textContent = 'Request saved for the Harper Dispatch and Logistics team.';
      } catch (error) {
        signupStatus.textContent = error.message || 'We could not save your request.';
      }
      return;
    }

    signupStatus.textContent = 'Opening your email app to send this request.';
    window.location.href = `mailto:support@alphaway-tms.invalid?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

const isBoardPage = Boolean(
  boardRoot &&
  document.getElementById('destinationFilter') &&
  document.getElementById('equipmentFilter') &&
  document.getElementById('rateFilter')
);

if (isBoardPage) {
  const originFilter = document.getElementById('originFilter');
  const destinationFilter = document.getElementById('destinationFilter');
  const equipmentFilter = document.getElementById('equipmentFilter');
  const rateFilter = document.getElementById('rateFilter');
  const searchButton = document.getElementById('searchButton');
  const resetFilters = document.getElementById('resetFilters');
  const saveSearchButton = document.getElementById('saveSearchButton');
  const accountButton = document.getElementById('accountButton');
  const accountModal = document.getElementById('accountModal');
  const closeModalButton = document.getElementById('closeModalButton');
  const accountForm = document.getElementById('accountForm');
  const networkAccessButton = document.getElementById('networkAccessButton');
  const networkAccessModal = document.getElementById('networkAccessModal');
  const closeNetworkAccessButton = document.getElementById('closeNetworkAccessButton');
  const networkAccessForm = document.getElementById('networkAccessForm');
  const networkAccessStatus = document.getElementById('networkAccessStatus');
  const savedSearchesContainer = document.getElementById('savedSearches');
  const loadRows = document.getElementById('loadRows');
  const resultsCount = document.getElementById('resultsCount');
  const liveCount = document.getElementById('liveCount');
  const bookedCount = document.getElementById('bookedCount');
  const avgRate = document.getElementById('avgRate');
  const avgMiles = document.getElementById('avgMiles');
  const quickFilters = document.querySelectorAll('.chip');
  const milesRadios = document.querySelectorAll('input[name="miles"]');
  const mapOriginCode = document.getElementById('mapOriginCode');
  const mapDestinationCode = document.getElementById('mapDestinationCode');
  const mapRouteLabel = document.getElementById('mapRouteLabel');
  const mapBrokerLabel = document.getElementById('mapBrokerLabel');
  const bookToast = document.getElementById('bookToast');
  const chatLoadContext = document.getElementById('chatLoadContext');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatSender = document.getElementById('chatSender');
  const chatMessage = document.getElementById('chatMessage');
  const chatSyncStatus = document.getElementById('chatSyncStatus');
  const driverCallLabel = document.getElementById('driverCallLabel');
  const driverCallLink = document.getElementById('driverCallLink');
  const driverSmsLink = document.getElementById('driverSmsLink');
  const dispatchCallLink = document.getElementById('dispatchCallLink');
  const dispatchSmsLink = document.getElementById('dispatchSmsLink');
  const tmsActiveLoads = document.getElementById('tmsActiveLoads');
  const tmsAvailableLoads = document.getElementById('tmsAvailableLoads');
  const tmsAssignedDrivers = document.getElementById('tmsAssignedDrivers');
  const tmsAttention = document.getElementById('tmsAttention');
  const tmsDriverList = document.getElementById('tmsDriverList');
  const trackedDriverName = document.getElementById('trackedDriverName');
  const trackerLoadLabel = document.getElementById('trackerLoadLabel');
  const gpsMarker = document.getElementById('gpsMarker');
  const gpsLocation = document.getElementById('gpsLocation');
  const gpsSpeed = document.getElementById('gpsSpeed');
  const gpsEta = document.getElementById('gpsEta');
  const trackerLastPing = document.getElementById('trackerLastPing');
  const gpsStatus = document.getElementById('gpsStatus');
  const toggleGpsDemoButton = document.getElementById('toggleGpsDemoButton');
  const refreshGpsButton = document.getElementById('refreshGpsButton');
  const paginationControls = document.querySelectorAll('[data-pagination]');
  const selectedLoadState = { value: null };
  const storageKey = BOARD_STATE_STORAGE_KEY;
  const chatChannelName = 'alphaway-loadboard-chat';
  const pageSize = 6;
  let currentPage = 1;
  let chatChannel = null;
  let gpsDemoInterval = null;

  function createDefaultTmsState() {
    const now = Date.now();
    return {
      demoRunning: true,
      assignments: [
        { id: 'tms-48201', loadId: 'LB-48201', driverName: 'Marcus Lane', truckId: 'TRK-204', status: 'In transit', tracking: { progress: 0.42, speedMph: 64, etaMinutes: 525, lastPingAt: now - 2000 } },
        { id: 'tms-48322', loadId: 'LB-48322', driverName: 'Daniela Ruiz', truckId: 'TRK-317', status: 'Dispatched', tracking: { progress: 0.12, speedMph: 0, etaMinutes: 845, lastPingAt: now - 8000 } },
        { id: 'tms-48190', loadId: 'LB-48190', driverName: 'Andre Cole', truckId: 'TRK-185', status: 'Attention', tracking: { progress: 0.58, speedMph: 18, etaMinutes: 640, lastPingAt: now - 14000 } },
        { id: 'tms-48410', loadId: 'LB-48410', driverName: 'Casey Owens', truckId: 'TRK-278', status: 'In transit', tracking: { progress: 0.31, speedMph: 58, etaMinutes: 430, lastPingAt: now - 4000 } }
      ]
    };
  }

  const defaultState = {
    savedSearches: [
      { id: 'reefer-routes', name: 'Reefer hot lanes', origin: 'all', destination: 'all', equipment: 'Reefer', minRate: '2500' },
      { id: 'west-drive', name: 'West coast lanes', origin: 'all', destination: 'California', equipment: 'all', minRate: '0' },
      { id: 'midwest-fast', name: 'Midwest priority', origin: 'Illinois', destination: 'all', equipment: 'Dry Van', minRate: '2000' }
    ],
    bookedLoads: [],
    messages: [
      {
        id: 'dispatch-welcome',
        loadId: 'general',
        sender: 'Dispatcher',
        text: 'Dispatch channel is ready. Select a load to keep messages tied to that route.',
        createdAt: Date.now()
      }
    ],
    tms: createDefaultTmsState()
  };

  const liveDriverPhones = {
    'LB-48201': { name: 'Marcus Lane', phone: '+19705550118' },
    'LB-48322': { name: 'Daniela Ruiz', phone: '+19705550124' },
    'LB-48190': { name: 'Andre Cole', phone: '+19705550131' },
    'LB-48410': { name: 'Casey Owens', phone: '+19705550147' }
  };

  const formatMoney = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);

  function populateStateOptions() {
    const options = allStates.map((state) => `<option value="${state}">${state}</option>`).join('');
    originFilter.innerHTML = '<option value="all">All states</option>' + options;
    destinationFilter.innerHTML = '<option value="all">All states</option>' + options;
    originFilter.value = 'all';
    destinationFilter.value = 'all';
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeTmsState(value) {
    const fallback = createDefaultTmsState();
    if (!value || !Array.isArray(value.assignments)) return fallback;

    return {
      demoRunning: value.demoRunning !== false,
      assignments: value.assignments
        .filter((assignment) => assignment && typeof assignment.loadId === 'string')
        .map((assignment) => ({
          id: String(assignment.id || `tms-${assignment.loadId}`),
          loadId: assignment.loadId,
          driverName: String(assignment.driverName || 'Unassigned driver'),
          truckId: String(assignment.truckId || 'Unassigned'),
          status: ['Dispatched', 'In transit', 'Attention'].includes(assignment.status) ? assignment.status : 'Dispatched',
          tracking: {
            progress: Math.min(0.96, Math.max(0.04, Number(assignment.tracking?.progress) || 0.04)),
            speedMph: Math.max(0, Math.round(Number(assignment.tracking?.speedMph) || 0)),
            etaMinutes: Math.max(0, Math.round(Number(assignment.tracking?.etaMinutes) || 0)),
            lastPingAt: Number(assignment.tracking?.lastPingAt) || Date.now()
          }
        }))
    };
  }

  function readAppState() {
    try {
      const parsed = getRemoteAppState() || JSON.parse(localStorage.getItem(storageKey) || 'null');
      const nextState = {
        ...defaultState,
        ...(parsed || {})
      };
      return {
        ...nextState,
        savedSearches: Array.isArray(nextState.savedSearches) ? nextState.savedSearches : defaultState.savedSearches,
        bookedLoads: Array.isArray(nextState.bookedLoads) ? nextState.bookedLoads : [],
        messages: Array.isArray(nextState.messages) ? nextState.messages : defaultState.messages,
        tms: normalizeTmsState(parsed?.tms)
      };
    } catch (error) {
      return { ...defaultState, tms: createDefaultTmsState() };
    }
  }

  function saveAppState(nextState) {
    const validLoadIds = new Set(getLoadCatalog().map((load) => load.id));
    const sanitizedState = {
      ...nextState,
      bookedLoads: Array.isArray(nextState.bookedLoads)
        ? nextState.bookedLoads.filter((loadId) => validLoadIds.has(loadId))
        : [],
      messages: Array.isArray(nextState.messages)
        ? nextState.messages.filter((message) => message?.loadId === 'general' || validLoadIds.has(message?.loadId))
        : [],
      tms: nextState.tms && Array.isArray(nextState.tms.assignments)
        ? {
            ...nextState.tms,
            assignments: nextState.tms.assignments.filter((assignment) => validLoadIds.has(assignment?.loadId))
          }
        : nextState.tms
    };
    if (!isServerConnected()) {
      localStorage.setItem(storageKey, JSON.stringify(sanitizedState));
    }
    return sanitizedState;
  }

  function getCurrentState() {
    return readAppState();
  }

  function getSelectedLoad() {
    return getLoadCatalog().find((load) => load.id === selectedLoadState.value) || null;
  }

  function getConversationMessages() {
    const selectedLoad = getSelectedLoad();
    const loadId = selectedLoad?.id || 'general';
    const messages = getCurrentState().messages;
    if (!Array.isArray(messages)) return [];
    return messages
      .filter((message) => message?.loadId === 'general' || message?.loadId === loadId)
      .slice(-50);
  }

  function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function renderChatMessages() {
    if (!chatMessages) return;
    const messages = getConversationMessages();
    chatMessages.replaceChildren();

    if (!messages.length) {
      const emptyState = document.createElement('p');
      emptyState.className = 'chat-empty';
      emptyState.textContent = 'No messages for this load yet. Start the conversation.';
      chatMessages.append(emptyState);
      return;
    }

    messages.forEach((message) => {
      const messageCard = document.createElement('article');
      const sender = message.sender === 'Driver' ? 'Driver' : 'Dispatcher';
      messageCard.className = `chat-message ${sender.toLowerCase()}`;

      const meta = document.createElement('div');
      meta.className = 'chat-message-meta';
      const name = document.createElement('strong');
      name.textContent = sender;
      const time = document.createElement('time');
      time.textContent = formatMessageTime(message.createdAt);
      meta.append(name, time);

      const messageText = document.createElement('p');
      messageText.className = 'chat-message-text';
      messageText.textContent = String(message.text || '');
      messageCard.append(meta, messageText);
      chatMessages.append(messageCard);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateChatContext(load) {
    if (!chatLoadContext) return;
    chatLoadContext.textContent = load
      ? `Conversation for ${load.id} · ${load.lane}`
      : 'Select a load to discuss its route.';
    renderChatMessages();
    updateLiveCallActions(load);
  }

  function updateLiveCallActions(load) {
    const dispatchNumber = '+19705550194';
    const fallbackDriver = { name: 'Driver direct line', phone: '+19705550197' };
    const assignment = getCurrentState().tms?.assignments?.find((item) => item.loadId === load?.id) || null;
    const driverContact = (load && liveDriverPhones[load.id]) || (assignment ? { name: assignment.driverName || 'Driver direct line', phone: fallbackDriver.phone } : fallbackDriver);

    if (dispatchCallLink) {
      dispatchCallLink.href = `tel:${dispatchNumber}`;
      dispatchCallLink.setAttribute('aria-label', 'Call Harper dispatch');
    }
    if (dispatchSmsLink) {
      dispatchSmsLink.href = `sms:${dispatchNumber}`;
      dispatchSmsLink.setAttribute('aria-label', 'Text Harper dispatch');
    }
    if (driverCallLabel) {
      driverCallLabel.textContent = `${driverContact.name || 'Driver'} direct line`;
    }
    if (driverCallLink) {
      const driverPhone = driverContact.phone || fallbackDriver.phone;
      driverCallLink.href = `tel:${driverPhone}`;
      driverCallLink.setAttribute('aria-label', `Call ${driverContact.name || 'driver'}`);
    }
    if (driverSmsLink) {
      const driverPhone = driverContact.phone || fallbackDriver.phone;
      driverSmsLink.href = `sms:${driverPhone}`;
      driverSmsLink.setAttribute('aria-label', `Text ${driverContact.name || 'driver'}`);
    }
  }

  function broadcastChatUpdate() {
    chatChannel?.postMessage({ type: 'messages-updated' });
  }

  function setChatSyncStatus(status) {
    if (chatSyncStatus) chatSyncStatus.textContent = status;
  }

  function getDemoLastPingLabel(timestamp) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - Number(timestamp || Date.now())) / 1000));
    if (elapsedSeconds < 5) return 'Just now';
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    return `${Math.floor(elapsedSeconds / 60)}m ago`;
  }

  function getDemoPositionLabel(progress) {
    return `Route ${Math.round(progress * 100)}% complete`;
  }

  function getDemoEtaLabel(minutes) {
    if (!minutes) return 'Awaiting departure';
    const rounded = Math.max(5, Math.ceil(minutes / 5) * 5);
    return `~${rounded} min (demo)`;
  }

  function getDriverInitials(name) {
    return String(name || 'Driver')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function broadcastTmsUpdate() {
    chatChannel?.postMessage({ type: 'tms-updated' });
  }

  function renderTmsDriverList(tmsState, selectedLoadId) {
    if (!tmsDriverList) return;
    tmsDriverList.replaceChildren();

    tmsState.assignments.forEach((assignment) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tms-driver-row${assignment.loadId === selectedLoadId ? ' selected' : ''}`;
      row.dataset.trackLoadId = assignment.loadId;

      const avatar = document.createElement('span');
      avatar.className = 'driver-avatar';
      avatar.textContent = getDriverInitials(assignment.driverName);

      const info = document.createElement('span');
      info.className = 'driver-info';
      const name = document.createElement('strong');
      name.textContent = `${assignment.driverName} · ${assignment.truckId}`;
      const route = document.createElement('span');
      const assignedLoad = getLoadCatalog().find((load) => load.id === assignment.loadId);
      route.textContent = assignedLoad ? `${assignedLoad.id} · ${assignedLoad.lane}` : assignment.loadId;
      info.append(name, route);

      const state = document.createElement('span');
      state.className = 'driver-state';
      state.textContent = assignment.status;
      row.append(avatar, info, state);
      tmsDriverList.append(row);
    });
  }

  function renderTmsPanel(load) {
    if (!tmsActiveLoads) return;
    const tmsState = getCurrentState().tms;
    const catalog = getLoadCatalog();
    const catalogIds = new Set(catalog.map((entry) => entry.id));
    const assignments = tmsState.assignments.filter((assignment) => catalogIds.has(assignment.loadId));
    const activeAssignments = assignments.filter((assignment) => assignment.status !== 'Dispatched');
    const attentionCount = assignments.filter((assignment) => assignment.status === 'Attention').length;
    const assignment = assignments.find((item) => item.loadId === load?.id) || null;

    tmsActiveLoads.textContent = activeAssignments.length;
    tmsAvailableLoads.textContent = Math.max(0, catalog.length - assignments.length);
    tmsAssignedDrivers.textContent = assignments.length;
    tmsAttention.textContent = attentionCount;
    gpsStatus.textContent = tmsState.demoRunning ? 'Demo updating' : 'Demo paused';
    toggleGpsDemoButton.textContent = tmsState.demoRunning ? 'Pause demo' : 'Resume demo';
    renderTmsDriverList(tmsState, load?.id);

    if (!assignment || !load) {
      trackedDriverName.textContent = 'Awaiting assignment';
      trackerLoadLabel.textContent = load ? `${load.id} · No demo vehicle assigned` : 'Select a load to view demo tracking.';
      gpsMarker.style.left = '12%';
      gpsMarker.style.opacity = '0.38';
      gpsLocation.textContent = '—';
      gpsSpeed.textContent = '—';
      gpsEta.textContent = '—';
      trackerLastPing.textContent = '—';
      return;
    }

    const tracking = assignment.tracking;
    trackedDriverName.textContent = `${assignment.driverName} · ${assignment.truckId}`;
    trackerLoadLabel.textContent = `${load.id} · ${load.lane} · ${assignment.status}`;
    gpsMarker.style.left = `${12 + (tracking.progress * 76)}%`;
    gpsMarker.style.opacity = '1';
    gpsLocation.textContent = getDemoPositionLabel(tracking.progress);
    gpsSpeed.textContent = tracking.speedMph ? `${tracking.speedMph} mph (demo)` : 'Stopped (demo)';
    gpsEta.textContent = getDemoEtaLabel(tracking.etaMinutes);
    trackerLastPing.textContent = getDemoLastPingLabel(tracking.lastPingAt);
  }

  function advanceDemoGps({ loadId = null, force = false } = {}) {
    if (isServerConnected()) {
      sendAppEvent({ type: 'tms.refresh', loadId }).catch((error) => showToast(error.message || 'Demo GPS could not refresh'));
      return;
    }
    const state = getCurrentState();
    const tmsState = state.tms;
    if (!force && !tmsState.demoRunning) return;
    const now = Date.now();
    const assignments = tmsState.assignments.map((assignment, index) => {
      if (loadId && assignment.loadId !== loadId) return assignment;
      const tracking = assignment.tracking;
      if (assignment.status === 'Dispatched') {
        return { ...assignment, tracking: { ...tracking, lastPingAt: now } };
      }

      const increment = assignment.status === 'Attention' ? 0.003 : 0.009 + ((index % 3) * 0.002);
      const progress = Math.min(0.96, tracking.progress + increment);
      const speedMph = assignment.status === 'Attention' ? 18 : 54 + ((Math.round(progress * 100) + index * 7) % 13);
      const etaMinutes = Math.max(0, tracking.etaMinutes - Math.max(1, Math.round(increment * 20)));
      return { ...assignment, tracking: { progress, speedMph, etaMinutes, lastPingAt: now } };
    });

    saveAppState({ ...state, tms: { ...tmsState, assignments } });
    renderTmsPanel(getSelectedLoad());
    broadcastTmsUpdate();
  }

  function startGpsDemo() {
    clearInterval(gpsDemoInterval);
    if (isServerConnected()) return;
    if (!getCurrentState().tms.demoRunning) return;
    gpsDemoInterval = window.setInterval(() => advanceDemoGps(), 5000);
  }

  function setGpsDemoRunning(isRunning) {
    if (isServerConnected()) {
      sendAppEvent({ type: 'tms.set-demo-running', demoRunning: isRunning })
        .catch((error) => showToast(error.message || 'Demo GPS setting could not be saved'));
      return;
    }
    const state = getCurrentState();
    saveAppState({ ...state, tms: { ...state.tms, demoRunning: isRunning } });
    if (isRunning) startGpsDemo();
    else clearInterval(gpsDemoInterval);
    renderTmsPanel(getSelectedLoad());
    broadcastTmsUpdate();
  }

  function selectTmsLoad(loadId) {
    const visibleLoads = getFilteredLoads();
    const loadIndex = visibleLoads.findIndex((load) => load.id === loadId);
    if (loadIndex === -1) {
      showToast('That assigned load is hidden by the current filters');
      return;
    }
    currentPage = Math.floor(loadIndex / pageSize) + 1;
    selectedLoadState.value = loadId;
    renderLoads();
  }

  function matchesLocationText(locationText, queryText) {
    const normalizedLocation = normalizeText(locationText);
    const normalizedQuery = normalizeText(queryText);

    if (!normalizedQuery || normalizedQuery === 'all') {
      return true;
    }

    if (normalizedLocation.includes(normalizedQuery)) {
      return true;
    }

    const stateName = allStates.find((state) => normalizeText(state) === normalizedQuery);
    if (stateName) {
      return normalizedLocation.includes(normalizeText(stateName));
    }

    const stateAbbreviationMap = {
      al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado', ct: 'Connecticut',
      de: 'Delaware', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana',
      ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts',
      mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada',
      nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota',
      oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', pr: 'Puerto Rico', ri: 'Rhode Island',
      sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia',
      wa: 'Washington', dc: 'Washington DC', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming'
    };

    const matchedStateName = stateAbbreviationMap[normalizedQuery];
    if (matchedStateName) {
      return normalizedLocation.includes(normalizeText(matchedStateName));
    }

    return false;
  }

  function getFilteredLoads() {
    const originText = originFilter.value;
    const destinationText = destinationFilter.value;
    const equipmentValue = equipmentFilter.value;
    const minRate = Number(rateFilter.value || 0);
    const selectedMiles = document.querySelector('input[name="miles"]:checked')?.value || 'all';

    const sameDayActive = [...quickFilters].some((chip) => chip.dataset.filter === 'Same Day' && chip.classList.contains('active'));

    return getLoadCatalog().filter((load) => {
      const matchesOrigin = matchesLocationText(load.origin, originText) || matchesLocationText(load.lane, originText);
      const matchesDestination = matchesLocationText(load.destination, destinationText) || matchesLocationText(load.lane, destinationText);
      const matchesEquipment = equipmentValue === 'all' || load.equipment === equipmentValue;
      const matchesRate = load.rate >= minRate;
      const matchesMiles = selectedMiles === 'all' || load.miles <= Number(selectedMiles);

      const matchesPickupDate = !sameDayActive || load.pickup.startsWith('Today');

      return matchesOrigin && matchesDestination && matchesEquipment && matchesRate && matchesMiles && matchesPickupDate;
    });
  }

  function getFilterSnapshot() {
    return {
      origin: originFilter.value,
      destination: destinationFilter.value,
      equipment: equipmentFilter.value,
      minRate: rateFilter.value,
      miles: document.querySelector('input[name="miles"]:checked')?.value || 'all'
    };
  }

  function setFilterSnapshot(snapshot) {
    if (!snapshot) return;
    originFilter.value = snapshot.origin || 'all';
    destinationFilter.value = snapshot.destination || 'all';
    equipmentFilter.value = snapshot.equipment || 'all';
    rateFilter.value = snapshot.minRate || '0';
    const selectedMiles = document.querySelector(`input[name="miles"][value="${snapshot.miles || 'all'}"]`);
    if (selectedMiles) selectedMiles.checked = true;
    const activeQuickFilter = snapshot.equipment && snapshot.equipment !== 'all' ? snapshot.equipment : 'all';
    quickFilters.forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === activeQuickFilter));
  }

  function renderSavedSearches() {
    const state = getCurrentState();
    savedSearchesContainer.innerHTML = state.savedSearches.map((search) => `
      <button class="saved-search-item" type="button" data-search-id="${search.id}">
        <div>
          <strong>${search.name}</strong>
          <span>${search.origin === 'all' ? 'All origins' : search.origin} → ${search.destination === 'all' ? 'All destinations' : search.destination}</span>
        </div>
        <small>${search.equipment === 'all' ? 'Any eq' : search.equipment}</small>
      </button>
    `).join('');
  }

  function saveCurrentSearch() {
    const state = getCurrentState();
    const snapshot = getFilterSnapshot();
    const searchName = `${snapshot.equipment === 'all' ? 'All equipment' : snapshot.equipment} lanes`;
    const newSearch = {
      id: `saved-${Date.now()}`,
      name: searchName,
      ...snapshot
    };

    const updatedState = {
      ...state,
      savedSearches: [newSearch, ...state.savedSearches].slice(0, 4)
    };
    if (isServerConnected()) {
      sendAppEvent({ type: 'saved-search.add', search: newSearch })
        .then(() => showToast('Search saved'))
        .catch((error) => showToast(error.message || 'Search could not be saved'));
      return;
    }
    saveAppState(updatedState);
    renderSavedSearches();
    showToast('Search saved');
  }

  function applySavedSearch(searchId) {
    const state = getCurrentState();
    const matchedSearch = state.savedSearches.find((search) => search.id === searchId);
    if (!matchedSearch) return;
    setFilterSnapshot(matchedSearch);
    renderLoads({ resetPage: true });
  }

  function getOriginCode(location) {
    const lastPart = location.split(',').at(-1)?.trim() || 'CO';
    const match = lastPart.match(/[A-Z]{2}/);
    return match ? match[0] : lastPart.slice(0, 2).toUpperCase();
  }

  function hideToast() {
    bookToast.classList.remove('visible');
  }

  function showToast(message) {
    bookToast.textContent = message;
    bookToast.classList.add('visible');
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(hideToast, 2200);
  }

  function updateMapPanel(load) {
    if (!load) {
      mapRouteLabel.textContent = 'No route selected';
      mapBrokerLabel.textContent = 'No broker';
      mapOriginCode.textContent = 'N/A';
      mapDestinationCode.textContent = 'N/A';
      updateChatContext(null);
      renderTmsPanel(null);
      return;
    }

    updateLiveCallActions(load);

    const originCode = getOriginCode(load.origin);
    const destinationCode = getOriginCode(load.destination);
    mapOriginCode.textContent = originCode;
    mapDestinationCode.textContent = destinationCode;
    mapRouteLabel.textContent = load.lane;
    mapBrokerLabel.textContent = load.broker;
    updateChatContext(load);
    renderTmsPanel(load);
  }

  function renderPagination(totalLoads) {
    const totalPages = Math.max(1, Math.ceil(totalLoads / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    paginationControls.forEach((control) => {
      const previousButton = control.querySelector('[data-page-action="previous"]');
      const nextButton = control.querySelector('[data-page-action="next"]');
      const status = control.querySelector('[data-page-status]');
      previousButton.disabled = currentPage === 1;
      nextButton.disabled = currentPage === totalPages;
      status.textContent = `Page ${currentPage} of ${totalPages}`;
      control.hidden = totalLoads === 0;
    });
  }

  function renderLoads({ resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const filteredLoads = getFilteredLoads();

    const appState = getCurrentState();
    const catalogIds = new Set(getLoadCatalog().map((load) => load.id));
    bookedCount.textContent = appState.bookedLoads.filter((loadId) => catalogIds.has(loadId)).length;

    if (!filteredLoads.length) {
      loadRows.innerHTML = '<div class="empty-state">No loads match these filters. Adjust your criteria to see more options.</div>';
      resultsCount.textContent = '0';
      liveCount.textContent = '0';
      avgRate.textContent = '$0';
      avgMiles.textContent = '0 mi';
      renderPagination(0);
      updateMapPanel(null);
      return;
    }

    renderPagination(filteredLoads.length);
    const pageStart = (currentPage - 1) * pageSize;
    const pageLoads = filteredLoads.slice(pageStart, pageStart + pageSize);

    if (!pageLoads.some((load) => load.id === selectedLoadState.value)) selectedLoadState.value = pageLoads[0].id;

    const averageRate = Math.round(filteredLoads.reduce((sum, load) => sum + load.rate, 0) / filteredLoads.length);
    const averageMiles = Math.round(filteredLoads.reduce((sum, load) => sum + load.miles, 0) / filteredLoads.length);

    resultsCount.textContent = filteredLoads.length;
    liveCount.textContent = filteredLoads.filter((load) => load.status === 'Hot').length;
    avgRate.textContent = formatMoney(averageRate);
    avgMiles.textContent = `${averageMiles} mi`;

    loadRows.innerHTML = pageLoads.map((load) => `
      <article class="load-row ${selectedLoadState.value === load.id ? 'selected' : ''}" data-load-id="${load.id}">
        <div class="load-primary">
          <div class="load-card-head">
            <span class="load-id">${load.id}</span>
            <span class="load-shipper">${load.broker}</span>
          </div>
          <div class="load-badges">
            <span class="badge ${load.status === 'Hot' ? 'hot' : ''}">${load.status}</span>
            <span class="badge">${load.equipment}</span>
          </div>
          <div class="route" aria-label="Route from ${load.origin} to ${load.destination}">
            <div class="route-stop">
              <strong>${load.origin.split(',')[0]}</strong>
              <span>${load.origin.split(',')[1]?.trim() || 'CO'}</span>
            </div>
            <div class="route-arrow">→</div>
            <div class="route-stop">
              <strong>${load.destination.split(',')[0]}</strong>
              <span>${load.destination.split(',')[1]?.trim() || 'TX'}</span>
            </div>
          </div>
        </div>

        <div class="load-details">
          <div class="load-metric">
            <span>Rate</span>
            <strong>${formatMoney(load.rate)}</strong>
          </div>
          <div class="load-metric">
            <span>Miles</span>
            <strong>${load.miles} mi</strong>
          </div>
          <div class="load-metric">
            <span>Pickup</span>
            <strong>${load.pickup}</strong>
          </div>
          <div class="load-metric">
            <span>Delivery</span>
            <strong>${load.delivery}</strong>
          </div>
        </div>

        <div class="load-actions">
          <button class="book-button" type="button" data-book-id="${load.id}">Book load</button>
          <button class="outline-button" type="button" data-details-id="${load.id}">Details</button>
        </div>
      </article>
    `).join('');

    const activeLoad = pageLoads.find((load) => load.id === selectedLoadState.value) || pageLoads[0];
    updateMapPanel(activeLoad);
  }

  function setQuickFilter(filterValue) {
    const safeFilter = filterValue === 'Same Day' ? 'all' : filterValue;
    quickFilters.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.filter === filterValue);
    });

    equipmentFilter.value = safeFilter === 'all' ? 'all' : safeFilter;
    renderLoads({ resetPage: true });
  }

  quickFilters.forEach((chip) => {
    chip.addEventListener('click', () => setQuickFilter(chip.dataset.filter));
  });

  paginationControls.forEach((control) => {
    control.addEventListener('click', (event) => {
      const action = event.target.closest('[data-page-action]')?.dataset.pageAction;
      if (!action) return;
      currentPage += action === 'next' ? 1 : -1;
      renderLoads();
    });
  });

  saveSearchButton.addEventListener('click', saveCurrentSearch);

  savedSearchesContainer.addEventListener('click', (event) => {
    const item = event.target.closest('.saved-search-item');
    if (!item) return;
    applySavedSearch(item.dataset.searchId);
  });

  accountButton.addEventListener('click', () => {
    accountModal.classList.remove('hidden');
    accountModal.setAttribute('aria-hidden', 'false');
  });

  const setNetworkAccessModal = (open) => {
    networkAccessModal.classList.toggle('hidden', !open);
    networkAccessModal.setAttribute('aria-hidden', String(!open));
    if (open) networkAccessForm.elements.code.focus();
  };

  networkAccessButton.addEventListener('click', () => setNetworkAccessModal(true));
  closeNetworkAccessButton.addEventListener('click', () => setNetworkAccessModal(false));
  networkAccessModal.addEventListener('click', (event) => {
    if (event.target.dataset.closeNetworkModal === 'true') setNetworkAccessModal(false);
  });

  networkAccessForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    networkAccessStatus.textContent = 'Verifying invitation…';
    try {
      await board.requestNetworkAccess(new FormData(networkAccessForm).get('code'));
      networkAccessForm.reset();
      networkAccessStatus.textContent = 'Private board unlocked.';
      setNetworkAccessModal(false);
      renderSavedSearches();
      renderLoads({ resetPage: true });
      clearInterval(gpsDemoInterval);
      startGpsDemo();
    } catch (error) {
      networkAccessStatus.textContent = error.message || 'The invitation code could not be verified.';
    }
  });

  closeModalButton.addEventListener('click', () => {
    accountModal.classList.add('hidden');
    accountModal.setAttribute('aria-hidden', 'true');
  });

  accountModal.addEventListener('click', (event) => {
    if (event.target.dataset.closeModal === 'true') {
      accountModal.classList.add('hidden');
      accountModal.setAttribute('aria-hidden', 'true');
    }
  });

  accountForm.addEventListener('submit', (event) => {
    event.preventDefault();
    accountButton.textContent = 'Preview active';
    accountModal.classList.add('hidden');
    accountModal.setAttribute('aria-hidden', 'true');
    showToast('Carrier workspace preview enabled — no account was created');
  });

  if ('BroadcastChannel' in window) {
    try {
      chatChannel = new BroadcastChannel(chatChannelName);
      chatChannel.addEventListener('message', (event) => {
        if (event.data?.type === 'messages-updated') renderChatMessages();
        if (event.data?.type === 'tms-updated') renderTmsPanel(getSelectedLoad());
      });
    } catch (error) {
      setChatSyncStatus('This tab');
    }
  } else {
    setChatSyncStatus('This tab');
  }

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) {
      renderSavedSearches();
      renderLoads();
    }
    if (event.key === LOAD_CATALOG_STORAGE_KEY) {
      renderLoads({ resetPage: true });
    }
  });

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = chatMessage.value.trim();
    if (!text) return;

    const sender = chatSender.value === 'Driver' ? 'Driver' : 'Dispatcher';
    const selectedLoad = getSelectedLoad();
    const state = getCurrentState();
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const message = {
      id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      loadId: selectedLoad?.id || 'general',
      sender,
      text: text.slice(0, 500),
      createdAt: Date.now()
    };

    if (isServerConnected()) {
      sendAppEvent({ type: 'message.send', message })
        .then(() => showToast(`${sender} message sent`))
        .catch((error) => showToast(error.message || 'Message could not be sent'));
      chatMessage.value = '';
      return;
    }
    saveAppState({ ...state, messages: [...messages, message].slice(-100) });
    chatMessage.value = '';
    renderChatMessages();
    broadcastChatUpdate();
    showToast(`${sender} message sent`);
  });

  tmsDriverList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-track-load-id]');
    if (row) selectTmsLoad(row.dataset.trackLoadId);
  });

  refreshGpsButton.addEventListener('click', () => {
    const selectedLoad = getSelectedLoad();
    if (!selectedLoad) return;
    const hasAssignment = getCurrentState().tms.assignments.some((assignment) => assignment.loadId === selectedLoad.id);
    if (!hasAssignment) {
      showToast('No demo vehicle is assigned to this load');
      return;
    }
    advanceDemoGps({ loadId: selectedLoad.id, force: true });
    showToast('Demo GPS refreshed');
  });

  toggleGpsDemoButton.addEventListener('click', () => {
    setGpsDemoRunning(!getCurrentState().tms.demoRunning);
  });

  window.addEventListener('beforeunload', () => clearInterval(gpsDemoInterval));

  [milesRadios, searchButton].forEach((controlSet) => {
    if (controlSet instanceof NodeList) {
      controlSet.forEach((control) => control.addEventListener('change', () => renderLoads({ resetPage: true })));
      return;
    }

    controlSet.addEventListener('click', () => renderLoads({ resetPage: true }));
  });

  originFilter.addEventListener('input', () => renderLoads({ resetPage: true }));
  destinationFilter.addEventListener('input', () => renderLoads({ resetPage: true }));
  equipmentFilter.addEventListener('change', () => {
    const activeChip = [...quickFilters].find((chip) => chip.dataset.filter === equipmentFilter.value);
    quickFilters.forEach((chip) => chip.classList.toggle('active', chip === activeChip || (equipmentFilter.value === 'all' && chip.dataset.filter === 'all')));
    renderLoads({ resetPage: true });
  });
  rateFilter.addEventListener('change', () => renderLoads({ resetPage: true }));

  loadRows.addEventListener('click', (event) => {
    const loadCard = event.target.closest('.load-row');
    const bookButton = event.target.closest('.book-button');
    const detailsButton = event.target.closest('.outline-button');

    if (bookButton) {
      const loadId = bookButton.dataset.bookId;
      const load = getLoadCatalog().find((entry) => entry.id === loadId);
      if (load) {
        const appState = getCurrentState();
        const exists = appState.bookedLoads.includes(loadId);
        const updatedState = {
          ...appState,
          bookedLoads: exists ? appState.bookedLoads : [loadId, ...appState.bookedLoads]
        };
        if (isServerConnected()) {
          selectedLoadState.value = loadId;
          sendAppEvent({ type: 'booking.add', loadId })
            .then(() => showToast(`${load.id} saved as a demo booking for ${load.lane}`))
            .catch((error) => showToast(error.message || 'Booking could not be saved'));
          return;
        }
        saveAppState(updatedState);
        selectedLoadState.value = loadId;
        showToast(`${load.id} booked for ${load.lane}`);
        renderLoads();
      }
      return;
    }

    if (detailsButton) {
      const load = getLoadCatalog().find((entry) => entry.id === detailsButton.dataset.detailsId);
      if (load) {
        selectedLoadState.value = load.id;
        updateMapPanel(load);
        renderLoads();
        showToast(`${load.id}: ${load.weight}, ${load.equipment}, posted by ${load.broker}`);
      }
      return;
    }

    if (loadCard) {
      selectedLoadState.value = loadCard.dataset.loadId;
      const selectedLoad = getLoadCatalog().find((load) => load.id === selectedLoadState.value);
      updateMapPanel(selectedLoad);
      renderLoads();
    }
  });

  resetFilters.addEventListener('click', () => {
    originFilter.value = 'all';
    destinationFilter.value = 'all';
    equipmentFilter.value = 'all';
    rateFilter.value = '0';
    document.querySelector('input[name="miles"][value="all"]').checked = true;
    setQuickFilter('all');
  });

  window.addEventListener(APP_UPDATED_EVENT, () => {
    if (!isServerConnected()) return;
    clearInterval(gpsDemoInterval);
    setChatSyncStatus('Server sync');
    renderSavedSearches();
    renderLoads();
  });

  window.addEventListener('alphaway-private-access-required', () => {
    renderLoads({ resetPage: true });
    setNetworkAccessModal(true);
  });

  populateStateOptions();
  renderSavedSearches();
  selectedLoadState.value = getLoadCatalog()[0]?.id || null;
  updateMapPanel(getLoadCatalog()[0]);
  renderLoads();
  startGpsDemo();
}

window.addEventListener('alphaway:account-changed', () => {
  appEventStream?.close();
  appEventStream = null;
  remoteAppSnapshot = null;
  hydrateApp();
});
