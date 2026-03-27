const DEFAULT_VIEW = [27.707, 85.33];
const DEFAULT_ZOOM = 12;
const DATA_DIR = "./data";
const queryParams = new URLSearchParams(window.location.search);
const NAV_SESSION_KEY = "__courierNavPayload";
const NAV_RUNTIME_KEY = "__courierNavRuntime";
const NAV_RUNTIME_VERSION = 2;
const isEmbeddedMode = queryParams.get("embedded") === "1" || queryParams.get("embed") === "1";

if (isEmbeddedMode) {
  document.body.classList.add("nav-embedded");
}

const map = L.map("navMap", { zoomControl: true }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);
const markerPane = map.createPane("navMarkers");
markerPane.style.zIndex = "650";
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let mapLayoutRefreshFrame = null;
const refreshMapLayout = () => {
  if (mapLayoutRefreshFrame !== null) {
    cancelAnimationFrame(mapLayoutRefreshFrame);
  }
  mapLayoutRefreshFrame = requestAnimationFrame(() => {
    mapLayoutRefreshFrame = null;
    map.invalidateSize(false);
    positionModernSpeedCard();
  });
};
const scheduleMapLayoutRefresh = () => {
  refreshMapLayout();
  window.setTimeout(() => refreshMapLayout(), 110);
  window.setTimeout(() => refreshMapLayout(), 300);
};
map.whenReady(() => {
  scheduleMapLayoutRefresh();
});

const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const startNameInput = document.getElementById("startName");
const endNameInput = document.getElementById("endName");
const startCoords = document.getElementById("startCoords");
const endCoords = document.getElementById("endCoords");
const startSearchInput = document.getElementById("startSearch");
const endSearchInput = document.getElementById("endSearch");
const startSearchSet = document.getElementById("startSearchSet");
const endSearchSet = document.getElementById("endSearchSet");
const startSearchResults = document.getElementById("startSearchResults");
const endSearchResults = document.getElementById("endSearchResults");
const pickStart = document.getElementById("pickStart");
const pickEnd = document.getElementById("pickEnd");
const pickBoth = document.getElementById("pickBoth");
const pickOptionsToggle = document.getElementById("pickOptionsToggle");
const pickOptionsPanel = document.getElementById("pickOptionsPanel");
const pickOptionsClose = document.getElementById("pickOptionsClose");
const pickHelp = document.getElementById("pickHelp");
const calcRoute = document.getElementById("calcRoute");
const clearRoute = document.getElementById("clearRoute");
const startNav = document.getElementById("startNav");
const stopNav = document.getElementById("stopNav");
const speedInput = document.getElementById("speedInput");
const followToggle = document.getElementById("followToggle");
const routeSteps = document.getElementById("routeSteps");
const routeSetupToggle = document.getElementById("routeSetupToggle");
const routeSetupPanel = document.getElementById("routeSetupPanel");
const routeStepsToggle = document.getElementById("routeStepsToggle");
const routeStepsPanel = document.getElementById("routeStepsPanel");
const routeNowValue = document.getElementById("routeNowValue");
const routeNowMeta = document.getElementById("routeNowMeta");
const routeStage = document.getElementById("routeStage");
const navDistance = document.getElementById("navDistance");
const navEta = document.getElementById("navEta");
const navProgress = document.getElementById("navProgress");
const modernTurnIcon = document.getElementById("modernTurnIcon");
const modernTurnDistance = document.getElementById("modernTurnDistance");
const modernTurnStreet = document.getElementById("modernTurnStreet");
const modernPickupLine = document.getElementById("modernPickupLine");
const modernPickupMeta = document.getElementById("modernPickupMeta");
const modernBanner = document.getElementById("modernBanner");
const modernSpeedCard = document.getElementById("modernSpeedCard");
const modernSpeedNumber = document.getElementById("modernSpeedNumber");
const modernEtaValue = document.getElementById("modernEtaValue");
const modernDistValue = document.getElementById("modernDistValue");
const modernSheetPickup = document.getElementById("modernSheetPickup");
const modernNavigateBtn = document.getElementById("modernNavigateBtn");
const modernRecenterBtn = document.getElementById("modernRecenterBtn");
const modernFollowBtn = document.getElementById("modernFollowBtn");
const modernFitBtn = document.getElementById("modernFitBtn");

const readSessionNavigationPayload = () => {
  try {
    const raw = window.sessionStorage.getItem(NAV_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
};

const sessionNavigationPayload = readSessionNavigationPayload();

let roadGraph = null;
let roadNodes = null;
let roadGrid = null;
let routeLine = null;
let routeMover = null;
let gpsMarker = null;
let gpsModeEnabled = false;
let latestGpsPoint = null;
let currentSteps = [];
let currentRoute = null;
let routeSegments = [];
let routeTotal = 0;
let activeStepIndex = -1;
let navFrame = null;
let navState = null;
let navDistanceTravelled = 0;
let pickMode = null;
let pickStartThenEnd = false;
let plannedPoints = [];
let plannedPointLabels = [];
let plannedPointKinds = [];
let plannedLegIndex = -1;
let plannedAutoStart = false;
let currentLegTargetPoint = null;
let startMarker = null;
let endMarker = null;
let placeIndex = [];
const placeCache = new Map();
let lastParentPositionTs = 0;
let lastRuntimeSaveTs = 0;
const START_NAV_LABEL = "Start navigation";
const RESUME_NAV_LABEL = "Resume navigation";
let inlineIconSequence = 0;

const INLINE_ICON_PATHS = {
  turnStraight: [
    '<path d="M12 19V5" />',
    '<path d="m8.5 8.5 3.5-3.5 3.5 3.5" />',
  ],
  turnLeft: [
    '<path d="M18.5 8.5H10a4 4 0 0 0-4 4V19" />',
    '<path d="m10 12.5-4-4 4-4" />',
  ],
  turnRight: [
    '<path d="M5.5 8.5H14a4 4 0 0 1 4 4V19" />',
    '<path d="m14 12.5 4-4-4-4" />',
  ],
  arrive: [
    '<path d="M12 20s6-5.33 6-10a6 6 0 1 0-12 0c0 4.67 6 10 6 10z" />',
    '<circle cx="12" cy="10" r="2.25" />',
  ],
  routeSetup: [
    '<path d="M4.5 6.5 9 4.5l3.5 2 3-2 4 2v11l-4 2-3.5-2-3 2-4.5-2z" />',
    '<path d="M9 4.5V17" />',
    '<path d="M12.5 6.5v11" />',
    '<path d="M15.5 4.5V17" />',
    '<path d="M8.25 13.25h2.75" />',
    '<path d="M14 9.75h2.25" />',
  ],
  close: [
    '<path d="M7 7 17 17" />',
    '<path d="M17 7 7 17" />',
  ],
  center: [
    '<circle cx="12" cy="12" r="3.25" />',
    '<circle cx="12" cy="12" r="7.75" />',
    '<path d="M12 2.75v2.5" />',
    '<path d="M12 18.75v2.5" />',
    '<path d="M2.75 12h2.5" />',
    '<path d="M18.75 12h2.5" />',
  ],
  follow: [
    '<circle cx="12" cy="12" r="3.25" />',
    '<circle cx="12" cy="12" r="7.75" />',
    '<path d="M12 2.75v2.5" />',
    '<path d="M12 18.75v2.5" />',
    '<path d="M2.75 12h2.5" />',
    '<path d="M18.75 12h2.5" />',
  ],
  unfollow: [
    '<circle cx="12" cy="12" r="3.25" />',
    '<circle cx="12" cy="12" r="7.75" />',
    '<path d="M12 2.75v2.5" />',
    '<path d="M12 18.75v2.5" />',
    '<path d="M2.75 12h2.5" />',
    '<path d="M18.75 12h2.5" />',
    '<path d="m5 5 14 14" />',
  ],
  fitBounds: [
    '<path d="M8 4H4v4" />',
    '<path d="M16 4h4v4" />',
    '<path d="M4 16v4h4" />',
    '<path d="M20 16v4h-4" />',
    '<path d="M9 9 6 6" />',
    '<path d="M15 9 18 6" />',
    '<path d="M9 15 6 18" />',
    '<path d="M15 15 18 18" />',
  ],
};

const renderInlineIcon = (name, title) => {
  const paths = INLINE_ICON_PATHS[name];
  if (!paths || !title) {
    return "";
  }
  inlineIconSequence += 1;
  const titleId = `nav-icon-${name}-${inlineIconSequence}`;
  return [
    `<svg class="nav-inline-icon nav-inline-icon--${name}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="${titleId}" focusable="false">`,
    `<title id="${titleId}">${title}</title>`,
    ...paths,
    "</svg>",
  ].join("");
};

const setButtonIcon = (buttonEl, iconName, title) => {
  if (!buttonEl) {
    return;
  }
  buttonEl.innerHTML = renderInlineIcon(iconName, title);
  buttonEl.setAttribute("aria-label", title);
  buttonEl.setAttribute("title", title);
};

const setRouteSetupToggleIcon = (isOpen, labels = {}) => {
  const openLabel = typeof labels.show === "string" && labels.show ? labels.show : "Route setup";
  const closeLabel = typeof labels.hide === "string" && labels.hide ? labels.hide : "Close";
  if (routeSetupToggle) {
    routeSetupToggle.classList.toggle("open", isOpen);
  }
  setButtonIcon(routeSetupToggle, isOpen ? "close" : "routeSetup", isOpen ? closeLabel : openLabel);
};

const syncFollowControlState = () => {
  if (!modernFollowBtn) {
    return;
  }
  const isFollowing = Boolean(followToggle?.checked);
  modernFollowBtn.classList.toggle("is-active", isFollowing);
  const title = isFollowing ? "Unfollow" : "Follow";
  setButtonIcon(modernFollowBtn, isFollowing ? "unfollow" : "follow", title);
};

const initializeOverlayIcons = () => {
  if (modernTurnIcon) {
    modernTurnIcon.innerHTML = renderInlineIcon("turnStraight", "Next maneuver");
  }
  setButtonIcon(modernRecenterBtn, "center", "Center");
  setButtonIcon(modernFitBtn, "fitBounds", "Fit route");
  syncFollowControlState();
};

const roundCoord = (value, decimals = 5) => Number(value.toFixed(decimals));
const nodeKey = (lon, lat) => `${lon},${lat}`;
const toRad = (deg) => (deg * Math.PI) / 180;
const haversine = (a, b) => {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const postToParent = (payload) => {
  if (!isEmbeddedMode || window.parent === window) {
    return;
  }
  window.parent.postMessage(payload, window.location.origin);
};

const normalizePoint = (rawLat, rawLon) => {
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    lat: roundCoord(lat, 6),
    lon: roundCoord(lon, 6),
  };
};

const updateGpsMarker = (point) => {
  if (!point || !gpsModeEnabled) {
    if (gpsMarker) {
      map.removeLayer(gpsMarker);
      gpsMarker = null;
    }
    return;
  }

  if (!gpsMarker) {
    const gpsIcon = L.divIcon({
      className: "nav-gps-marker",
      html: '<div style="width:14px;height:14px;border-radius:999px;background:#16a34a;border:2px solid #ffffff;box-shadow:0 0 0 4px rgba(22,163,74,0.2);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    gpsMarker = L.marker([point.lat, point.lon], {
      pane: "navMarkers",
      icon: gpsIcon,
      zIndexOffset: 1100,
      title: "GPS location",
    }).addTo(map);
    gpsMarker.bindTooltip("GPS location", { direction: "top", offset: [0, -10] });
  } else {
    gpsMarker.setLatLng([point.lat, point.lon]);
  }

  if (followToggle?.checked && !navState) {
    map.panTo([point.lat, point.lon], { animate: true, duration: 0.4 });
  }
};

const setGpsModeEnabled = (enabled) => {
  gpsModeEnabled = Boolean(enabled);
  if (!gpsModeEnabled) {
    updateGpsMarker(null);
  } else if (latestGpsPoint) {
    updateGpsMarker(latestGpsPoint);
  }
  postToParent({
    type: "courier-nav/gps-mode",
    enabled: gpsModeEnabled,
  });
};

const reportCourierPosition = (source, lat, lon) => {
  const point = normalizePoint(lat, lon);
  if (!point) {
    return;
  }
  const now = Date.now();
  if (source === "simulated" && now - lastParentPositionTs < 800) {
    return;
  }
  lastParentPositionTs = now;
  postToParent({
    type: "courier-nav/position",
    source,
    lat: point.lat,
    lng: point.lon,
    legIndex: plannedLegIndex,
  });
};

const bearing = (a, b) => {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(node) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= this.items[index].priority) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0];
    const end = this.items.pop();
    if (this.items.length && end) {
      this.items[0] = end;
      this.sinkDown(0);
    }
    return root;
  }
  sinkDown(index) {
    const length = this.items.length;
    while (true) {
      let left = index * 2 + 1;
      let right = index * 2 + 2;
      let smallest = index;
      if (left < length && this.items[left].priority < this.items[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.items[right].priority < this.items[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
  get size() {
    return this.items.length;
  }
}

const addEdge = (graph, aKey, bKey, dist) => {
  if (!graph.has(aKey)) graph.set(aKey, []);
  graph.get(aKey).push({ to: bKey, dist });
};

const buildRoadGraph = (geojson) => {
  const graph = new Map();
  const nodes = new Map();
  const grid = new Map();

  const addNode = (lon, lat) => {
    const lonR = roundCoord(lon);
    const latR = roundCoord(lat);
    const key = nodeKey(lonR, latR);
    if (!nodes.has(key)) {
      nodes.set(key, { lon: lonR, lat: latR });
      const cell = `${Math.floor(latR * 100)}:${Math.floor(lonR * 100)}`;
      if (!grid.has(cell)) grid.set(cell, []);
      grid.get(cell).push(key);
    }
    return key;
  };

  const addLine = (coords) => {
    for (let i = 0; i < coords.length - 1; i += 1) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      const aKey = addNode(lon1, lat1);
      const bKey = addNode(lon2, lat2);
      const a = nodes.get(aKey);
      const b = nodes.get(bKey);
      const dist = haversine(a, b);
      addEdge(graph, aKey, bKey, dist);
      addEdge(graph, bKey, aKey, dist);
    }
  };

  geojson.features.forEach((feature) => {
    const geom = feature.geometry;
    if (!geom) return;
    if (geom.type === "LineString") {
      addLine(geom.coordinates);
    } else if (geom.type === "MultiLineString") {
      geom.coordinates.forEach((line) => addLine(line));
    }
  });

  roadGraph = graph;
  roadNodes = nodes;
  roadGrid = grid;
};

const findNearestNode = (latlng) => {
  if (!roadNodes || !roadGrid) return null;
  const baseLat = Math.floor(latlng.lat * 100);
  const baseLon = Math.floor(latlng.lng * 100);
  let best = null;
  let bestDist = Infinity;

  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dLat = -radius; dLat <= radius; dLat += 1) {
      for (let dLon = -radius; dLon <= radius; dLon += 1) {
        const cell = `${baseLat + dLat}:${baseLon + dLon}`;
        const keys = roadGrid.get(cell);
        if (!keys) continue;
        keys.forEach((key) => {
          const node = roadNodes.get(key);
          const dist = haversine({ lon: node.lon, lat: node.lat }, { lon: latlng.lng, lat: latlng.lat });
          if (dist < bestDist) {
            bestDist = dist;
            best = key;
          }
        });
      }
    }
    if (best) break;
  }
  return best;
};

const shortestPath = (startKey, endKey) => {
  if (!roadGraph || !roadNodes) return null;
  const distances = new Map();
  const previous = new Map();
  const heap = new MinHeap();
  const visited = new Set();

  distances.set(startKey, 0);
  heap.push({ key: startKey, priority: 0 });

  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const { key } = current;
    if (visited.has(key)) continue;
    visited.add(key);
    if (key === endKey) break;
    const currentDist = distances.get(key);
    if (currentDist === undefined) continue;
    const neighbors = roadGraph.get(key) || [];
    neighbors.forEach((edge) => {
      const nextDist = currentDist + edge.dist;
      const prevBest = distances.get(edge.to);
      if (prevBest === undefined || nextDist < prevBest) {
        distances.set(edge.to, nextDist);
        previous.set(edge.to, key);
        heap.push({ key: edge.to, priority: nextDist });
      }
    });
  }

  if (!distances.has(endKey)) return null;

  const pathKeys = [];
  let cur = endKey;
  while (cur) {
    pathKeys.push(cur);
    cur = previous.get(cur);
  }
  pathKeys.reverse();
  const coords = pathKeys.map((key) => {
    const node = roadNodes.get(key);
    return [node.lat, node.lon];
  });
  return {
    coords,
    distance: distances.get(endKey),
  };
};

const buildDirections = (coords) => {
  if (coords.length < 2) return [];
  const steps = [];
  let segmentDistance = 0;
  let prevBearing = null;
  let segmentStart = 0;

  const pushStep = (label, startIndex, endIndex, type = "continue") => {
    if (segmentDistance <= 0) return;
    steps.push({
      label,
      distance: segmentDistance,
      startIndex,
      endIndex,
      type,
    });
    segmentDistance = 0;
  };

  for (let i = 1; i < coords.length; i += 1) {
    const a = { lat: coords[i - 1][0], lon: coords[i - 1][1] };
    const b = { lat: coords[i][0], lon: coords[i][1] };
    const currentBearing = bearing(a, b);
    const dist = haversine(a, b);
    segmentDistance += dist;

    if (prevBearing !== null) {
      let delta = currentBearing - prevBearing;
      delta = ((delta + 540) % 360) - 180;
      if (Math.abs(delta) >= 30) {
        const turn = delta > 0 ? "Turn right" : "Turn left";
        const continueDistance = segmentDistance - dist;
        if (continueDistance > 0) {
          segmentDistance = continueDistance;
          pushStep("Continue", segmentStart, i - 1, "continue");
        } else {
          segmentDistance = 0;
        }
        steps.push({
          label: turn,
          distance: 0,
          startIndex: i - 1,
          endIndex: i - 1,
          type: delta > 0 ? "turn-right" : "turn-left",
        });
        prevBearing = currentBearing;
        segmentDistance = dist;
        segmentStart = i - 1;
        continue;
      }
    }

    prevBearing = currentBearing;
  }

  pushStep("Continue", segmentStart, coords.length - 1, "continue");
  steps.push({
    label: "Arrive at destination",
    distance: 0,
    startIndex: coords.length - 1,
    endIndex: coords.length - 1,
    type: "arrive",
  });
  return steps;
};

const formatKm = (meters) => `${(meters / 1000).toFixed(2)} km`;
const formatMinutes = (meters, speedKmh) => {
  if (!meters || !speedKmh) return "-";
  const minutes = Math.max(1, Math.round((meters / 1000 / speedKmh) * 60));
  return `${minutes} min`;
};

const parseLatLon = (text) => {
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
};

const normalizeLabel = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
};

const normalizePlannedStopKind = (rawKind, index, label = "") => {
  const value = String(rawKind || "").trim().toLowerCase();
  if (["start", "pickup", "delivery", "branch"].includes(value)) {
    return value;
  }
  const lowerLabel = normalizeLabel(label).toLowerCase();
  if (index === 0) {
    return "start";
  }
  if (lowerLabel.startsWith("branch")) {
    return "branch";
  }
  if (lowerLabel.startsWith("pickup")) {
    return "pickup";
  }
  if (lowerLabel.startsWith("delivery")) {
    return "delivery";
  }
  return "waypoint";
};

const getActiveStep = () => (
  Number.isFinite(activeStepIndex) && activeStepIndex >= 0 && currentSteps[activeStepIndex]
    ? currentSteps[activeStepIndex]
    : null
);

const getCurrentLegLabel = () => {
  if (plannedPoints.length >= 2 && plannedLegIndex >= 0) {
    return plannedPointLabels[plannedLegIndex + 1] || "next stop";
  }
  const endName = String(endNameInput?.value || "").trim();
  return endName || "";
};

const getModernStepIconName = (step) => {
  const type = String(step?.type || "").toLowerCase();
  if (type === "turn-left") return "turnLeft";
  if (type === "turn-right") return "turnRight";
  if (type === "arrive") return "arrive";
  return "turnStraight";
};

const recenterOnActivePoint = () => {
  let point = null;
  if (routeMover?.getLatLng) {
    point = routeMover.getLatLng();
  }
  if (!point && gpsMarker?.getLatLng) {
    point = gpsMarker.getLatLng();
  }
  if (!point && startMarker?.getLatLng) {
    point = startMarker.getLatLng();
  }
  if (!point) {
    return;
  }
  map.panTo([point.lat, point.lng], { animate: true, duration: 0.45 });
};

const fitRouteInView = () => {
  if (routeLine?.getBounds) {
    map.fitBounds(routeLine.getBounds().pad(0.2));
    return;
  }
  if (startMarker?.getLatLng && endMarker?.getLatLng) {
    const bounds = L.latLngBounds(startMarker.getLatLng(), endMarker.getLatLng());
    map.fitBounds(bounds.pad(0.22));
  }
};

function positionModernSpeedCard() {
  if (!isEmbeddedMode || !modernSpeedCard) {
    return;
  }
  const panelEl = document.querySelector(".nav-panel");
  const mapContainer = map.getContainer();
  if (!mapContainer) {
    return;
  }
  const mapRect = mapContainer.getBoundingClientRect();
  const speedRect = modernSpeedCard.getBoundingClientRect();
  const panelRect = panelEl?.getBoundingClientRect();
  const bannerRect = modernBanner?.getBoundingClientRect();

  const fallbackLeft = window.innerWidth <= 980 ? 12 : 18;
  const desiredLeft = panelRect ? panelRect.left - mapRect.left : fallbackLeft;
  const maxLeft = Math.max(12, mapRect.width - speedRect.width - 12);
  const left = Math.max(12, Math.min(desiredLeft, maxLeft));

  const bannerBottom = bannerRect ? bannerRect.bottom - mapRect.top : 96;
  const minTop = bannerBottom + 8;
  const desiredTop = panelRect ? panelRect.top - mapRect.top - speedRect.height - 10 : minTop;
  const maxTop = Math.max(12, mapRect.height - speedRect.height - 12);
  const top = maxTop >= minTop
    ? Math.min(Math.max(desiredTop, minTop), maxTop)
    : Math.max(12, maxTop);

  modernSpeedCard.style.left = `${Math.round(left)}px`;
  modernSpeedCard.style.top = `${Math.round(top)}px`;
  modernSpeedCard.style.bottom = "auto";
}

const syncModernOverlay = () => {
  if (!isEmbeddedMode || !modernTurnStreet) {
    return;
  }

  const activeStep = getActiveStep();
  const routeMeta = String(routeNowMeta?.textContent || "").split("|").map((part) => part.trim()).filter(Boolean);
  const stepDistance = routeMeta[0] || "-";
  const stepEta = routeMeta[1] || "-";
  const legLabel = getCurrentLegLabel();
  const stageText = String(routeStage?.textContent || "").trim() || "Build route to start guidance.";

  if (modernTurnIcon) {
    const iconName = getModernStepIconName(activeStep);
    modernTurnIcon.innerHTML = renderInlineIcon(iconName, "Next maneuver");
  }
  if (modernTurnDistance) {
    modernTurnDistance.textContent = stepDistance;
  }
  if (modernTurnStreet) {
    modernTurnStreet.textContent = activeStep?.label || "Waiting for route";
  }
  if (modernPickupLine) {
    modernPickupLine.textContent = legLabel ? `Pickup: ${legLabel}` : "Pickup details will appear here.";
  }
  if (modernPickupMeta) {
    modernPickupMeta.textContent = stageText;
  }
  if (modernSpeedNumber) {
    modernSpeedNumber.textContent = String(Math.max(5, Math.min(99, Math.round(getSpeed()))));
  }
  if (modernEtaValue) {
    modernEtaValue.textContent = String(navEta?.textContent || "").trim() || stepEta || "-";
  }
  if (modernDistValue) {
    modernDistValue.textContent = String(navDistance?.textContent || "").trim() || stepDistance || "-";
  }
  if (modernSheetPickup) {
    modernSheetPickup.textContent = legLabel ? `Heading to ${legLabel}` : "Waiting for destination...";
  }
  if (modernNavigateBtn) {
    modernNavigateBtn.textContent = navState ? "Running" : (String(startNav?.textContent || "").trim() || "Navigate");
    modernNavigateBtn.disabled = !navState && Boolean(startNav?.disabled);
  }
  syncFollowControlState();
};

const readQueryPoints = () => {
  const raw = queryParams.get("points");
  if (raw) {
    return raw
      .split("|")
      .map((token) => parseLatLon(token))
      .filter((point) => Boolean(point));
  }
  const payloadPoints = Array.isArray(sessionNavigationPayload?.routePoints)
    ? sessionNavigationPayload.routePoints
    : [];
  return payloadPoints
    .map((point) => {
      const lat = Number(point?.lat);
      const lon = Number(point?.lon ?? point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      return { lat, lon };
    })
    .filter((point) => Boolean(point));
};

const readQueryPoint = (key) => {
  const fromQuery = parseLatLon(queryParams.get(key));
  if (fromQuery) {
    return fromQuery;
  }
  const payloadPoint = key === "start"
    ? sessionNavigationPayload?.start
    : key === "end"
      ? sessionNavigationPayload?.destination
      : null;
  const lat = Number(payloadPoint?.lat);
  const lon = Number(payloadPoint?.lon ?? payloadPoint?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
};

const readQueryLabels = () => {
  const raw = queryParams.get("labels");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => normalizeLabel(item));
    } catch (error) {
      return raw.split("|").map((item) => normalizeLabel(item));
    }
  }
  const payloadLabels = Array.isArray(sessionNavigationPayload?.routePointLabels)
    ? sessionNavigationPayload.routePointLabels
    : [];
  return payloadLabels.map((item) => normalizeLabel(item));
};
const readQueryStopKinds = () => {
  const raw = queryParams.get("stopKinds");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => String(item || "").trim().toLowerCase());
    } catch (error) {
      return raw.split("|").map((item) => String(item || "").trim().toLowerCase());
    }
  }
  const payloadMeta = Array.isArray(sessionNavigationPayload?.routePointMeta)
    ? sessionNavigationPayload.routePointMeta
    : [];
  if (!payloadMeta.length) {
    return [];
  }
  return payloadMeta.map((item) => String(item?.stopKind || "").trim().toLowerCase());
};
const readQueryMode = () => {
  const modeFromQuery = (queryParams.get("pick") || "").toLowerCase();
  if (modeFromQuery) {
    return modeFromQuery;
  }
  return String(sessionNavigationPayload?.pick || "").toLowerCase();
};

const normalizePlannedData = (points, labels = [], stopKinds = []) => {
  const normalizedPoints = [];
  const normalizedLabels = [];
  const normalizedKinds = [];
  points.forEach((point, index) => {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      return;
    }
    const safeLabel = normalizeLabel(labels[index]);
    const nextKind = normalizePlannedStopKind(stopKinds[index], normalizedPoints.length, safeLabel);
    const prev = normalizedPoints[normalizedPoints.length - 1];
    const sameAsPrev = prev
      && Math.abs(prev.lat - point.lat) < 0.00001
      && Math.abs(prev.lon - point.lon) < 0.00001;
    if (sameAsPrev) {
      if (safeLabel) {
        normalizedLabels[normalizedLabels.length - 1] = safeLabel;
      }
      if (nextKind && !["start", "waypoint"].includes(nextKind)) {
        normalizedKinds[normalizedKinds.length - 1] = nextKind;
      }
      return;
    }
    normalizedPoints.push({ lat: Number(point.lat), lon: Number(point.lon) });
    normalizedLabels.push(safeLabel);
    normalizedKinds.push(nextKind);
  });
  return { points: normalizedPoints, labels: normalizedLabels, stopKinds: normalizedKinds };
};

const setRouteStage = (text) => {
  if (!routeStage) return;
  routeStage.textContent = text;
  syncModernOverlay();
};

const buildPlannedRouteSignature = (points) =>
  (Array.isArray(points) ? points : [])
    .map((point) => {
      const lat = Number(point?.lat);
      const lon = Number(point?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      return `${roundCoord(lat, 5)},${roundCoord(lon, 5)}`;
    })
    .filter((token) => Boolean(token))
    .join("|");

const readPersistedNavRuntime = () => {
  try {
    const raw = window.sessionStorage.getItem(NAV_RUNTIME_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (Number(parsed.version) !== NAV_RUNTIME_VERSION) {
      clearPersistedNavRuntime();
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const clearPersistedNavRuntime = () => {
  try {
    window.sessionStorage.removeItem(NAV_RUNTIME_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
};

const persistNavRuntime = (force = false) => {
  if (plannedPoints.length < 2 || !Number.isFinite(plannedLegIndex) || plannedLegIndex < 0) {
    return;
  }
  const routeSignature = buildPlannedRouteSignature(plannedPoints);
  if (!routeSignature) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastRuntimeSaveTs < 900) {
    return;
  }

  const clampedDistance = routeTotal > 0
    ? Math.max(0, Math.min(routeTotal, navDistanceTravelled))
    : Math.max(0, navDistanceTravelled);
  const awaitingConfirm = Boolean(
    plannedPoints.length >= 2
    && plannedLegIndex >= 0
    && !navState
    && routeTotal > 0
    && clampedDistance >= routeTotal - 0.5
  );

  const payload = {
    version: NAV_RUNTIME_VERSION,
    routeSignature,
    legIndex: plannedLegIndex,
    distanceMeters: clampedDistance,
    isRunning: Boolean(navState),
    awaitingConfirm,
    speedKmh: Number.isFinite(getSpeed()) ? Number(getSpeed()) : null,
    savedAt: now
  };

  try {
    window.sessionStorage.setItem(NAV_RUNTIME_KEY, JSON.stringify(payload));
    lastRuntimeSaveTs = now;
  } catch (error) {
    // Ignore storage errors.
  }
};

const clearPlannedRoute = () => {
  plannedPoints = [];
  plannedPointLabels = [];
  plannedPointKinds = [];
  plannedLegIndex = -1;
  plannedAutoStart = false;
  currentLegTargetPoint = null;
  clearPersistedNavRuntime();
  setRouteStage("Manual route mode");
};

const setCollapsibleSectionState = (toggleEl, panelEl, isOpen, labels = {}) => {
  if (!panelEl) return;
  const showLabel = typeof labels.show === "string" && labels.show ? labels.show : "Show";
  const hideLabel = typeof labels.hide === "string" && labels.hide ? labels.hide : "Hide";
  panelEl.hidden = !isOpen;
  if (toggleEl) {
    toggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (toggleEl === routeSetupToggle) {
      setRouteSetupToggleIcon(isOpen, { show: showLabel, hide: hideLabel });
    } else {
      toggleEl.textContent = isOpen ? hideLabel : showLabel;
    }
  }
  scheduleMapLayoutRefresh();
};

const initializeCollapsibleSections = () => {
  setCollapsibleSectionState(routeSetupToggle, routeSetupPanel, !isEmbeddedMode, {
    show: "Route setup",
    hide: "Close"
  });
  setCollapsibleSectionState(routeStepsToggle, routeStepsPanel, !isEmbeddedMode, {
    show: "Show steps",
    hide: "Hide steps"
  });
};

const setPickOptionsOpen = (isOpen) => {
  if (!pickOptionsPanel) return;
  pickOptionsPanel.hidden = !isOpen;
  if (pickOptionsToggle) {
    pickOptionsToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
};

const updatePickHelp = () => {
  if (!pickHelp) return;
  if (!pickMode) {
    pickHelp.classList.remove("active");
    if (pickOptionsPanel && !pickOptionsPanel.hidden) {
      pickHelp.textContent = "Choose an option, then click on the map.";
      return;
    }
    pickHelp.innerHTML = "Click <strong>Pick on map</strong> to choose how you want to pick.";
    return;
  }

  pickHelp.classList.add("active");
  if (pickMode === "start") {
    pickHelp.textContent = pickStartThenEnd
      ? "Step 1: click map to set START point."
      : "Click map to set START point.";
    return;
  }
  pickHelp.textContent = pickStartThenEnd
    ? "Step 2: click map to set DESTINATION point."
    : "Click map to set DESTINATION point.";
};

const setPickMode = (mode) => {
  pickMode = mode;
  map.getContainer().classList.toggle("picking", Boolean(mode));
  updatePickHelp();
};

const startPickBothFlow = () => {
  pickStartThenEnd = true;
  setPickMode("start");
};

const pinIcon = (type) =>
  L.divIcon({
    className: `nav-pin nav-pin--${type}`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const formatInputPoint = (point) => `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
const markerTitle = (type) => {
  if (type === "branch") return "Branch";
  if (type === "start") return "Start";
  return "Destination";
};
const defaultPointLabel = (type) => {
  if (type === "branch") return "Branch";
  if (type === "start") return "Current leg start";
  return "Current leg destination";
};
const markerVisualTypeForStopKind = (stopKind, fallbackType = "end") => {
  const kind = String(stopKind || "").trim().toLowerCase();
  if (kind === "branch") {
    return "branch";
  }
  if (kind === "start") {
    return "start";
  }
  return fallbackType === "start" ? "start" : "end";
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const nearestPlaceName = (point) => {
  const cacheKey = formatInputPoint(point);
  if (placeCache.has(cacheKey)) {
    return placeCache.get(cacheKey);
  }
  if (!placeIndex.length) {
    return null;
  }

  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < placeIndex.length; i += 1) {
    const place = placeIndex[i];
    const dist = haversine({ lat: point.lat, lon: point.lon }, { lat: place.lat, lon: place.lon });
    if (dist < bestDist) {
      best = place;
      bestDist = dist;
    }
  }

  if (!best || bestDist > 60000) {
    placeCache.set(cacheKey, null);
    return null;
  }

  const name = bestDist <= 2200 ? best.name : `Near ${best.name}`;
  placeCache.set(cacheKey, name);
  return name;
};

const normalizeSearchText = (value) =>
  String(value || "")
    .toLocaleLowerCase()
    .replace(/[_,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const searchPlacesByName = (query, limit = 8) => {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2 || !placeIndex.length) {
    return [];
  }

  const matches = [];
  for (let i = 0; i < placeIndex.length; i += 1) {
    const place = placeIndex[i];
    const placeName = place.searchName || normalizeSearchText(place.name);
    const index = placeName.indexOf(normalizedQuery);
    if (index < 0) {
      continue;
    }
    const hasWordStartMatch = placeName
      .split(" ")
      .some((token) => token.startsWith(normalizedQuery));
    const rank = index === 0 ? 0 : hasWordStartMatch ? 1 : 2;
    matches.push({ place, rank, index });
  }

  matches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.index !== b.index) return a.index - b.index;
    return a.place.name.localeCompare(b.place.name);
  });

  return matches.slice(0, limit).map((match) => match.place);
};

const getSearchElements = (type) => {
  const input = type === "start" ? startSearchInput : endSearchInput;
  const resultBox = type === "start" ? startSearchResults : endSearchResults;
  return { input, resultBox };
};

const hideSearchResults = (type) => {
  const { resultBox } = getSearchElements(type);
  if (!resultBox) return;
  resultBox.hidden = true;
  resultBox.innerHTML = "";
};

const setSearchResultsHtml = (resultBox, html, show = true) => {
  if (!resultBox) return;
  resultBox.innerHTML = html;
  resultBox.hidden = !show;
};

const applySearchSelection = (type, place) => {
  if (!place) {
    return;
  }
  clearPlannedRoute();
  stopNavigation();
  resetRoute();
  setPoint(type, place.lat, place.lon, place.name);
  map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 14), { animate: true, duration: 0.45 });
  hideSearchResults(type);
};

const renderSearchResults = (type, results, query) => {
  const { resultBox } = getSearchElements(type);
  if (!resultBox) return;

  if (!query || normalizeSearchText(query).length < 2) {
    hideSearchResults(type);
    return;
  }

  if (!placeIndex.length) {
    setSearchResultsHtml(
      resultBox,
      `<div class="search-result-empty">Place data is loading. Try again in a moment.</div>`
    );
    return;
  }

  if (!results.length) {
    setSearchResultsHtml(
      resultBox,
      `<div class="search-result-empty">No place found for "${escapeHtml(query)}".</div>`
    );
    return;
  }

  const html = results
    .map((place, idx) => {
      const pointText = `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;
      return `
        <button class="search-result-item" type="button" data-search-type="${type}" data-search-index="${idx}">
          <strong>${escapeHtml(place.name)}</strong>
          <span>${escapeHtml(pointText)}</span>
        </button>
      `;
    })
    .join("");
  setSearchResultsHtml(resultBox, html, true);
};

const refreshSearchResults = (type) => {
  const { input } = getSearchElements(type);
  const query = input?.value || "";
  const results = searchPlacesByName(query);
  renderSearchResults(type, results, query);
};

const chooseTopSearchResult = (type) => {
  const { input } = getSearchElements(type);
  const query = input?.value || "";
  const results = searchPlacesByName(query, 1);
  if (!results.length) {
    renderSearchResults(type, [], query);
    return;
  }
  applySearchSelection(type, results[0]);
};

const updatePointDisplay = (type, point, label) => {
  const nameInput = type === "start" ? startNameInput : endNameInput;
  const coordText = type === "start" ? startCoords : endCoords;
  const hiddenInput = type === "start" ? startInput : endInput;
  const pointText = formatInputPoint(point);
  if (hiddenInput) {
    hiddenInput.value = pointText;
  }
  if (nameInput) {
    nameInput.value = label || defaultPointLabel(type);
  }
  if (coordText) {
    coordText.textContent = `Coordinates: ${pointText}`;
  }
};

const updateMarkerDetails = (type, marker, point, label) => {
  const title = markerTitle(type);
  const resolvedLabel = label || defaultPointLabel(type);
  const pointText = formatInputPoint(point);
  marker.bindTooltip(`${title}: ${resolvedLabel}`, {
    direction: "top",
    offset: [0, -10],
  });
  marker.bindPopup(
    `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(resolvedLabel)}<br><small>${escapeHtml(pointText)}</small>`
  );
};

const setMarker = (type, lat, lon, label = "", markerType = type) => {
  const point = { lat, lon };
  const marker = L.marker([lat, lon], {
    pane: "navMarkers",
    icon: pinIcon(markerType),
    zIndexOffset: 1000,
    title: `${markerTitle(markerType)} marker`,
  }).addTo(map);
  updateMarkerDetails(markerType, marker, point, label);
  if (type === "start") {
    if (startMarker) map.removeLayer(startMarker);
    startMarker = marker;
  } else {
    if (endMarker) map.removeLayer(endMarker);
    endMarker = marker;
  }
};

const setPoint = (type, lat, lon, label = "", markerType = type) => {
  const point = { lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return;
  }
  const resolvedLabel = label || nearestPlaceName(point) || defaultPointLabel(markerType);
  updatePointDisplay(type, point, resolvedLabel);
  setMarker(type, point.lat, point.lon, resolvedLabel, markerType);
};

const refreshPointNames = () => {
  const startPoint = parseLatLon(startInput?.value);
  const endPoint = parseLatLon(endInput?.value);
  if (startPoint) {
    setPoint("start", startPoint.lat, startPoint.lon, nearestPlaceName(startPoint) || undefined);
  }
  if (endPoint) {
    setPoint("end", endPoint.lat, endPoint.lon, nearestPlaceName(endPoint) || undefined);
  }
};

const loadPlannedLeg = (legIndex, autoStartLeg = false) => {
  if (!plannedPoints[legIndex] || !plannedPoints[legIndex + 1]) {
    return { loaded: false, hasMovement: false };
  }

  plannedLegIndex = legIndex;
  const fromPoint = plannedPoints[legIndex];
  const toPoint = plannedPoints[legIndex + 1];
  currentLegTargetPoint = { lat: Number(toPoint.lat), lon: Number(toPoint.lon) };
  const fromLabel = plannedPointLabels[legIndex]
    || (legIndex > 0 ? (plannedPointLabels[legIndex - 1] || "") : "")
    || "Current leg start";
  const toLabel = plannedPointLabels[legIndex + 1] || "";
  const fromKind = plannedPointKinds[legIndex] || normalizePlannedStopKind("", legIndex, fromLabel);
  const toKind = plannedPointKinds[legIndex + 1] || normalizePlannedStopKind("", legIndex + 1, toLabel);
  const fromMarkerType = markerVisualTypeForStopKind(fromKind, "start");
  const toMarkerType = markerVisualTypeForStopKind(toKind, "end");
  const targetLabel = toLabel || "next stop";
  const totalLegs = plannedPoints.length - 1;

  stopNavigation();
  resetRoute();
  setPoint("start", fromPoint.lat, fromPoint.lon, fromLabel, fromMarkerType);
  setPoint("end", toPoint.lat, toPoint.lon, toLabel, toMarkerType);

  const routeReady = computeRoute();
  if (!routeReady) {
    setRouteStage(`Leg ${legIndex + 1} of ${totalLegs} unavailable for ${targetLabel}. Skipping.`);
    return { loaded: false, hasMovement: false };
  }

  const hasMovement = routeSegments.length > 0 && routeTotal > 0;
  if (!hasMovement) {
    setRouteStage(`Leg ${legIndex + 1} of ${totalLegs} is same point (${targetLabel}). Skipping.`);
    return { loaded: true, hasMovement: false };
  }

  setRouteStage(`Leg ${legIndex + 1} of ${totalLegs}: ${targetLabel}`);
  postToParent({
    type: "courier-nav/leg-loaded",
    legIndex,
    totalLegs,
    label: targetLabel,
  });
  persistNavRuntime(true);
  if (autoStartLeg) {
    requestAnimationFrame(() => startNavigation());
  }
  return { loaded: true, hasMovement: true };
};

const loadNextPlannedLeg = (startLegIndex, autoStartLeg = false) => {
  if (plannedPoints.length < 2) {
    return false;
  }
  const totalLegs = plannedPoints.length - 1;
  for (let legIndex = Math.max(0, startLegIndex); legIndex < totalLegs; legIndex += 1) {
    const legResult = loadPlannedLeg(legIndex, autoStartLeg);
    if (legResult.hasMovement) {
      return true;
    }
  }
  setRouteStage("Route completed");
  currentLegTargetPoint = null;
  clearPersistedNavRuntime();
  postToParent({
    type: "courier-nav/route-complete",
    totalLegs,
  });
  return false;
};

const setNowCard = (step) => {
  if (!routeNowValue || !routeNowMeta) return;
  if (!step) {
    routeNowValue.textContent = "-";
    routeNowMeta.textContent = "-";
    syncModernOverlay();
    return;
  }
  routeNowValue.textContent = step.label;
  const meta = step.distance > 0 ? `${formatKm(step.distance)} | ${formatMinutes(step.distance, getSpeed())}` : "-";
  routeNowMeta.textContent = meta;
  syncModernOverlay();
};

const renderSteps = (steps) => {
  routeSteps.innerHTML = "";
  steps.forEach((step) => {
    const row = document.createElement("div");
    row.className = "route-step";
    row.dataset.stepIndex = step.startIndex ?? 0;
    row.dataset.stepType = step.type || "continue";
    const meta = step.distance > 0 ? `${formatKm(step.distance)} | ${formatMinutes(step.distance, getSpeed())}` : "";
    row.innerHTML = `
      <span class="route-step__icon ${step.type || "continue"}"></span>
      <div class="route-step__content">
        <strong>${step.label}</strong>
        <span class="route-step__meta">${meta || " "}</span>
      </div>
    `;
    routeSteps.appendChild(row);
  });
};

const setActiveStepByIndex = (routeIndex) => {
  if (!currentSteps.length) return;
  let stepIdx = -1;
  for (let i = currentSteps.length - 1; i >= 0; i -= 1) {
    const step = currentSteps[i];
    if (step.type === "arrive") continue;
    if (routeIndex >= step.startIndex && routeIndex <= step.endIndex) {
      stepIdx = i;
      break;
    }
  }
  const finalIndex = stepIdx === -1 ? currentSteps.length - 1 : stepIdx;
  if (finalIndex === activeStepIndex) return;
  activeStepIndex = finalIndex;
  const items = routeSteps.querySelectorAll(".route-step");
  items.forEach((item, idx) => {
    item.classList.toggle("active", idx === finalIndex);
  });
  setNowCard(currentSteps[finalIndex]);
};

const buildSegments = (coords) => {
  const segments = [];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = { lat: coords[i - 1][0], lon: coords[i - 1][1] };
    const b = { lat: coords[i][0], lon: coords[i][1] };
    const dist = haversine(a, b);
    const segment = {
      index: i,
      a,
      b,
      dist,
      start: total,
      end: total + dist,
    };
    segments.push(segment);
    total += dist;
  }
  return { segments, total };
};

const getSpeed = () => Math.max(5, parseFloat(speedInput.value || "30"));

const hasPausedProgress = () =>
  routeTotal > 0 && navDistanceTravelled > 0 && navDistanceTravelled < routeTotal;

const syncNavigationButtons = () => {
  if (startNav) {
    const isRunning = Boolean(navState);
    const canStart = Boolean(currentRoute && routeSegments.length);
    startNav.disabled = isRunning || !canStart;
    startNav.textContent = hasPausedProgress() ? RESUME_NAV_LABEL : START_NAV_LABEL;
  }
  if (stopNav) {
    stopNav.disabled = !navState;
  }
  syncModernOverlay();
};

const getPositionForDistance = (distance) => {
  if (!routeSegments.length) {
    return null;
  }
  const boundedDistance = Math.max(0, Math.min(routeTotal, distance));
  let segIndex = routeSegments.findIndex((seg) => boundedDistance <= seg.end);
  if (segIndex === -1) {
    segIndex = routeSegments.length - 1;
  }
  const seg = routeSegments[segIndex];
  const t = seg.dist > 0 ? (boundedDistance - seg.start) / seg.dist : 0;
  const lat = seg.a.lat + (seg.b.lat - seg.a.lat) * t;
  const lon = seg.a.lon + (seg.b.lon - seg.a.lon) * t;
  return { lat, lon, seg, boundedDistance };
};

const renderNavigationDistance = (distance, shouldPan = true) => {
  const position = getPositionForDistance(distance);
  if (!position) {
    return null;
  }
  const { lat, lon, seg, boundedDistance } = position;
  const progress = routeTotal ? boundedDistance / routeTotal : 0;
  navProgress.style.width = `${(progress * 100).toFixed(2)}%`;
  if (routeMover) {
    routeMover.setLatLng([lat, lon]);
  }
  reportCourierPosition("simulated", lat, lon);
  if (shouldPan && followToggle?.checked) {
    map.panTo([lat, lon], { animate: true, duration: 0.5 });
  }
  setActiveStepByIndex(seg.index);
  persistNavRuntime(false);
  syncModernOverlay();
  return position;
};

const resolveLegEndpointPoint = () => {
  if (
    currentLegTargetPoint
    && Number.isFinite(Number(currentLegTargetPoint.lat))
    && Number.isFinite(Number(currentLegTargetPoint.lon))
  ) {
    return {
      lat: Number(currentLegTargetPoint.lat),
      lon: Number(currentLegTargetPoint.lon),
    };
  }
  const legEndPoint = Array.isArray(currentRoute?.coords)
    ? currentRoute.coords[currentRoute.coords.length - 1]
    : null;
  if (!Array.isArray(legEndPoint) || legEndPoint.length < 2) {
    return null;
  }
  const lat = Number(legEndPoint[0]);
  const lon = Number(legEndPoint[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
};

const snapSimulatedCourierToLegEndpoint = () => {
  const endpoint = resolveLegEndpointPoint();
  if (!endpoint) {
    return null;
  }
  if (routeMover) {
    routeMover.setLatLng([endpoint.lat, endpoint.lon]);
  }
  reportCourierPosition("simulated", endpoint.lat, endpoint.lon);
  return endpoint;
};

const stopNavigation = ({ preserveProgress = true } = {}) => {
  if (navFrame) {
    cancelAnimationFrame(navFrame);
    navFrame = null;
  }
  if (preserveProgress && navState) {
    navDistanceTravelled = Math.max(0, Math.min(routeTotal, navState.distance));
  }
  navState = null;
  syncNavigationButtons();
  persistNavRuntime(true);
};

const startNavigation = () => {
  if (!currentRoute || !routeSegments.length) return;
  stopNavigation({ preserveProgress: false });
  if (plannedPoints.length >= 2) {
    plannedAutoStart = true;
  }
  postToParent({
    type: "courier-nav/navigation-start",
    legIndex: plannedLegIndex,
    totalLegs: plannedPoints.length >= 2 ? plannedPoints.length - 1 : null,
  });

  const initialDistance = hasPausedProgress() ? navDistanceTravelled : 0;
  const speedMps = (getSpeed() * 1000) / 3600;
  navState = {
    distance: initialDistance,
    speed: speedMps,
    lastTime: performance.now(),
  };
  navDistanceTravelled = initialDistance;
  renderNavigationDistance(initialDistance, true);
  syncNavigationButtons();
  persistNavRuntime(true);

  const step = (now) => {
    if (!navState) return;
    const delta = Math.max(0, (now - navState.lastTime) / 1000);
    navState.lastTime = now;
    navState.distance = Math.min(routeTotal, navState.distance + navState.speed * delta);
    navDistanceTravelled = navState.distance;
    renderNavigationDistance(navState.distance, true);

    if (navState.distance >= routeTotal) {
      setActiveStepByIndex(currentRoute.coords.length - 1);
      navDistanceTravelled = routeTotal;
      stopNavigation({ preserveProgress: false });
      const endpoint = snapSimulatedCourierToLegEndpoint();
      postToParent({
        type: "courier-nav/leg-reached",
        legIndex: plannedLegIndex,
        totalLegs: plannedPoints.length >= 2 ? plannedPoints.length - 1 : null,
        lat: endpoint ? Number(endpoint.lat) : null,
        lng: endpoint ? Number(endpoint.lon) : null,
      });
      if (plannedPoints.length >= 2 && plannedLegIndex >= 0) {
        const totalLegs = plannedPoints.length - 1;
        setRouteStage(`Leg ${plannedLegIndex + 1} of ${totalLegs} reached. Confirm stop to load next leg.`);
        if (startNav) {
          startNav.disabled = true;
          startNav.textContent = START_NAV_LABEL;
        }
        persistNavRuntime(true);
      } else {
        setRouteStage("Route completed");
        clearPersistedNavRuntime();
      }
      return;
    }
    navFrame = requestAnimationFrame(step);
  };

  navFrame = requestAnimationFrame(step);
};

const resetRoute = () => {
  if (routeLine) map.removeLayer(routeLine);
  if (routeMover) map.removeLayer(routeMover);
  routeLine = null;
  routeMover = null;
  currentSteps = [];
  currentRoute = null;
  routeSegments = [];
  routeTotal = 0;
  navDistanceTravelled = 0;
  activeStepIndex = -1;
  routeSteps.innerHTML = "";
  setNowCard(null);
  navDistance.textContent = "-";
  navEta.textContent = "-";
  navProgress.style.width = "0%";
  syncNavigationButtons();
  syncModernOverlay();
};

const setRoute = (route) => {
  currentRoute = route;
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(route.coords, { color: "#2f6eff", weight: 5, opacity: 0.9 }).addTo(map);
  map.fitBounds(routeLine.getBounds().pad(0.2));
  currentSteps = buildDirections(route.coords);
  renderSteps(currentSteps);
  setActiveStepByIndex(0);

  const segInfo = buildSegments(route.coords);
  routeSegments = segInfo.segments;
  routeTotal = segInfo.total;
  navDistanceTravelled = 0;
  navDistance.textContent = formatKm(routeTotal);
  navEta.textContent = formatMinutes(routeTotal, getSpeed());
  navProgress.style.width = "0%";
  syncNavigationButtons();

  if (routeMover) map.removeLayer(routeMover);
  routeMover = L.circleMarker(route.coords[0], {
    radius: 7,
    color: "#1c1a17",
    weight: 2,
    fillColor: "#2f6eff",
    fillOpacity: 0.95,
  }).addTo(map);
  routeMover.bindTooltip("Simulated courier", { direction: "top", offset: [0, -8] });
  routeMover.bindPopup("<strong>Simulated courier</strong><br><small>Moves when navigation starts.</small>");
  if (Array.isArray(route.coords[0])) {
    reportCourierPosition("simulated", route.coords[0][0], route.coords[0][1]);
  }
  syncModernOverlay();
};

const computeRoute = () => {
  const start = parseLatLon(startInput.value);
  const end = parseLatLon(endInput.value);
  if (!start || !end) return false;
  if (!roadGraph) return false;
  currentLegTargetPoint = { lat: Number(end.lat), lon: Number(end.lon) };
  setMarker("start", start.lat, start.lon, startNameInput?.value || "");
  setMarker("end", end.lat, end.lon, endNameInput?.value || "");
  const startKey = findNearestNode(L.latLng(start.lat, start.lon));
  const endKey = findNearestNode(L.latLng(end.lat, end.lon));
  if (!startKey || !endKey) return false;
  const result = shortestPath(startKey, endKey);
  if (!result || !Array.isArray(result.coords) || result.coords.length < 2) return false;
  setRoute(result);
  return true;
};

const loadRoads = async () => {
  const response = await fetch(`${DATA_DIR}/roads_major.geojson`);
  const data = await response.json();
  L.geoJSON(data, {
    style: { color: "rgba(255,255,255,0.25)", weight: 2 },
  }).addTo(map);
  buildRoadGraph(data);
};

const loadPlaces = async () => {
  const response = await fetch(`${DATA_DIR}/places.geojson`);
  if (!response.ok) {
    throw new Error("places data unavailable");
  }
  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  placeIndex = features
    .map((feature) => {
      const lon = Number(feature?.geometry?.coordinates?.[0]);
      const lat = Number(feature?.geometry?.coordinates?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      const props = feature?.properties || {};
      const name =
        String(props["name:en"] || props.name_en || props.name || "").trim() || null;
      if (!name) {
        return null;
      }
      return { lat, lon, name, searchName: normalizeSearchText(name) };
    })
    .filter((place) => Boolean(place));
  placeCache.clear();
  refreshPointNames();
};

const applyInitialRouteFromQuery = () => {
  const queryPoints = readQueryPoints();
  const queryLabels = readQueryLabels();
  const queryStopKinds = readQueryStopKinds();
  const startPoint = readQueryPoint("start");
  const endPoint = readQueryPoint("end");
  const speedFromQuery = Number(queryParams.get("speed"));
  const speedFromPayload = Number(sessionNavigationPayload?.speedKmh);
  const speedValue = Number.isFinite(speedFromQuery) && speedFromQuery > 0
    ? speedFromQuery
    : speedFromPayload;
  const pickModeQuery = readQueryMode();

  if (Number.isFinite(speedValue) && speedValue > 0 && speedInput) {
    const clampedSpeed = Math.max(5, Math.min(80, Math.round(speedValue)));
    speedInput.value = String(clampedSpeed);
  }

  if (queryPoints.length >= 2) {
    const normalized = normalizePlannedData(queryPoints, queryLabels, queryStopKinds);
    plannedPoints = normalized.points;
    plannedPointLabels = normalized.labels;
    plannedPointKinds = normalized.stopKinds;
    plannedLegIndex = -1;
    plannedAutoStart = false;
    setPickMode(null);
    setPickOptionsOpen(false);
    if (plannedPoints.length < 2) {
      setRouteStage("Need at least two different route points.");
      return;
    }

    const runtime = readPersistedNavRuntime();
    const expectedSignature = buildPlannedRouteSignature(plannedPoints);
    let restored = false;
    if (runtime && runtime.routeSignature === expectedSignature) {
      const restoreLegIndex = Number(runtime.legIndex);
      if (Number.isFinite(restoreLegIndex) && restoreLegIndex >= 0) {
        const hasRestoredLeg = loadNextPlannedLeg(restoreLegIndex, false);
        if (hasRestoredLeg) {
          const savedSpeed = Number(runtime.speedKmh);
          if (Number.isFinite(savedSpeed) && speedInput) {
            speedInput.value = String(Math.max(5, Math.min(80, Math.round(savedSpeed))));
            navEta.textContent = formatMinutes(routeTotal, getSpeed());
            renderSteps(currentSteps);
          }

          const savedDistance = Number(runtime.distanceMeters);
          if (Number.isFinite(savedDistance) && routeTotal > 0) {
            navDistanceTravelled = Math.max(0, Math.min(routeTotal, savedDistance));
            renderNavigationDistance(navDistanceTravelled, false);
            syncNavigationButtons();
          }

          if (Boolean(runtime.awaitingConfirm) && routeTotal > 0 && navDistanceTravelled >= routeTotal - 0.5 && plannedLegIndex >= 0) {
            const totalLegs = plannedPoints.length - 1;
            setRouteStage(`Leg ${plannedLegIndex + 1} of ${totalLegs} reached. Confirm stop to load next leg.`);
            snapSimulatedCourierToLegEndpoint();
            if (startNav) {
              startNav.disabled = true;
              startNav.textContent = START_NAV_LABEL;
            }
          } else if (Boolean(runtime.isRunning) && routeTotal > 0 && navDistanceTravelled < routeTotal - 0.5) {
            requestAnimationFrame(() => startNavigation());
          }

          persistNavRuntime(true);
          restored = true;
        }
      }
    }

    if (runtime && !restored) {
      clearPersistedNavRuntime();
    }

    const hasInitialLeg = restored ? true : loadNextPlannedLeg(0, plannedAutoStart);
    if (!hasInitialLeg) {
      setRouteStage("No routable legs found for this route.");
    }
    return;
  }

  clearPlannedRoute();

  if (startPoint && startInput) {
    const startLabel = queryLabels[0] || "";
    const startKind = normalizePlannedStopKind(queryStopKinds[0], 0, startLabel);
    setPoint("start", startPoint.lat, startPoint.lon, startLabel, markerVisualTypeForStopKind(startKind, "start"));
  }

  if (endPoint && endInput) {
    const endLabel = queryLabels[1] || "";
    const endKind = normalizePlannedStopKind(queryStopKinds[1], 1, endLabel);
    setPoint("end", endPoint.lat, endPoint.lon, endLabel, markerVisualTypeForStopKind(endKind, "end"));
  }

  if (!startPoint || !endPoint) {
    if (pickModeQuery === "both") {
      startPickBothFlow();
    }
    return;
  }

  stopNavigation();
  const routeReady = computeRoute();
  setRouteStage(routeReady ? "Single route loaded" : "Unable to compute this route.");
};

map.on("click", (event) => {
  if (!pickMode) return;
  if (plannedPoints.length > 0) {
    clearPlannedRoute();
  }
  const lat = Number(event.latlng.lat.toFixed(5));
  const lon = Number(event.latlng.lng.toFixed(5));
  const shouldContinueToDestination = pickStartThenEnd && pickMode === "start";
  const shouldAutoCompute = pickStartThenEnd && pickMode === "end";
  if (pickMode === "start") {
    setPoint("start", lat, lon);
  } else if (pickMode === "end") {
    setPoint("end", lat, lon);
  }
  if (shouldContinueToDestination) {
    setPickMode("end");
    return;
  }
  pickStartThenEnd = false;
  setPickMode(null);
  if (shouldAutoCompute) {
    stopNavigation();
    computeRoute();
  }
});

pickStart?.addEventListener("click", () => {
  clearPlannedRoute();
  pickStartThenEnd = false;
  setPickOptionsOpen(false);
  setPickMode("start");
});

pickEnd?.addEventListener("click", () => {
  clearPlannedRoute();
  pickStartThenEnd = false;
  setPickOptionsOpen(false);
  setPickMode("end");
});

pickBoth?.addEventListener("click", () => {
  clearPlannedRoute();
  setPickOptionsOpen(false);
  startPickBothFlow();
});

pickOptionsToggle?.addEventListener("click", () => {
  const willOpen = Boolean(pickOptionsPanel?.hidden);
  pickStartThenEnd = false;
  setPickMode(null);
  setPickOptionsOpen(willOpen);
  updatePickHelp();
});

pickOptionsClose?.addEventListener("click", () => {
  pickStartThenEnd = false;
  setPickMode(null);
  setPickOptionsOpen(false);
  updatePickHelp();
});

routeSetupToggle?.addEventListener("click", () => {
  const willOpen = Boolean(routeSetupPanel?.hidden);
  setCollapsibleSectionState(routeSetupToggle, routeSetupPanel, willOpen, {
    show: "Route setup",
    hide: "Close"
  });
});

routeStepsToggle?.addEventListener("click", () => {
  const willOpen = Boolean(routeStepsPanel?.hidden);
  setCollapsibleSectionState(routeStepsToggle, routeStepsPanel, willOpen, {
    show: "Show steps",
    hide: "Hide steps"
  });
});

startSearchInput?.addEventListener("input", () => {
  refreshSearchResults("start");
});

endSearchInput?.addEventListener("input", () => {
  refreshSearchResults("end");
});

startSearchInput?.addEventListener("focus", () => {
  refreshSearchResults("start");
});

endSearchInput?.addEventListener("focus", () => {
  refreshSearchResults("end");
});

startSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    chooseTopSearchResult("start");
  } else if (event.key === "Escape") {
    hideSearchResults("start");
  }
});

endSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    chooseTopSearchResult("end");
  } else if (event.key === "Escape") {
    hideSearchResults("end");
  }
});

startSearchSet?.addEventListener("click", () => {
  chooseTopSearchResult("start");
});

endSearchSet?.addEventListener("click", () => {
  chooseTopSearchResult("end");
});

startSearchResults?.addEventListener("click", (event) => {
  const trigger = event.target?.closest?.(".search-result-item");
  if (!trigger) return;
  const index = Number(trigger.dataset.searchIndex);
  const results = searchPlacesByName(startSearchInput?.value || "");
  if (!Number.isFinite(index) || !results[index]) return;
  applySearchSelection("start", results[index]);
});

endSearchResults?.addEventListener("click", (event) => {
  const trigger = event.target?.closest?.(".search-result-item");
  if (!trigger) return;
  const index = Number(trigger.dataset.searchIndex);
  const results = searchPlacesByName(endSearchInput?.value || "");
  if (!Number.isFinite(index) || !results[index]) return;
  applySearchSelection("end", results[index]);
});

document.addEventListener("click", (event) => {
  const startWithin = Boolean(
    event.target?.closest?.("#startSearch")
      || event.target?.closest?.("#startSearchSet")
      || event.target?.closest?.("#startSearchResults")
  );
  const endWithin = Boolean(
    event.target?.closest?.("#endSearch")
      || event.target?.closest?.("#endSearchSet")
      || event.target?.closest?.("#endSearchResults")
  );
  if (!startWithin) {
    hideSearchResults("start");
  }
  if (!endWithin) {
    hideSearchResults("end");
  }
});

calcRoute?.addEventListener("click", () => {
  clearPlannedRoute();
  stopNavigation();
  computeRoute();
  if (currentRoute) {
    setRouteStage("Single route loaded");
  }
});

clearRoute?.addEventListener("click", () => {
  clearPlannedRoute();
  stopNavigation();
  resetRoute();
});

startNav?.addEventListener("click", () => {
  startNavigation();
});

stopNav?.addEventListener("click", () => {
  stopNavigation();
});

modernRecenterBtn?.addEventListener("click", () => {
  recenterOnActivePoint();
});

modernFollowBtn?.addEventListener("click", () => {
  if (!followToggle) {
    return;
  }
  followToggle.checked = !followToggle.checked;
  syncFollowControlState();
});

modernFitBtn?.addEventListener("click", () => {
  fitRouteInView();
});

modernNavigateBtn?.addEventListener("click", () => {
  if (navState) {
    recenterOnActivePoint();
    return;
  }
  if (startNav && !startNav.disabled) {
    startNav.click();
  }
});

speedInput?.addEventListener("change", () => {
  if (currentRoute) {
    navEta.textContent = formatMinutes(routeTotal, getSpeed());
    renderSteps(currentSteps);
  }
  syncModernOverlay();
});

followToggle?.addEventListener("change", () => {
  syncFollowControlState();
});

window.addEventListener("message", (event) => {
  if (event?.origin !== window.location.origin) {
    return;
  }
  const data = event?.data;
  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "courier-nav/settings") {
    setGpsModeEnabled(Boolean(data?.useGps));
    return;
  }

  if (data.type === "courier-nav/gps-update") {
    const point = normalizePoint(data?.lat, data?.lng);
    if (!point) {
      return;
    }
    latestGpsPoint = point;
    updateGpsMarker(point);
    reportCourierPosition("gps", point.lat, point.lon);
    return;
  }

  if (data.type === "courier-nav/advance-leg") {
    if (plannedPoints.length < 2) {
      return;
    }
    const nextStart = plannedLegIndex >= 0 ? plannedLegIndex + 1 : 0;
    const loaded = loadNextPlannedLeg(nextStart, plannedAutoStart);
    if (!loaded) {
      clearPersistedNavRuntime();
      return;
    }
    persistNavRuntime(true);
  }
});

window.addEventListener("pagehide", () => {
  persistNavRuntime(true);
});
window.addEventListener("beforeunload", () => {
  persistNavRuntime(true);
});
window.addEventListener("resize", scheduleMapLayoutRefresh);
window.addEventListener("orientationchange", scheduleMapLayoutRefresh);

resetRoute();
initializeOverlayIcons();
initializeCollapsibleSections();
scheduleMapLayoutRefresh();
Promise.all([loadRoads(), loadPlaces().catch(() => null)])
  .then(() => {
    applyInitialRouteFromQuery();
    scheduleMapLayoutRefresh();
    postToParent({ type: "courier-nav/ready" });
  })
  .catch(() => {
    // Keep controls interactive even if road data fails to load.
  });
