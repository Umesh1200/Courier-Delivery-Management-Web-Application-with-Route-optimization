import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_VIEW = [27.707, 85.33];
const DEFAULT_ZOOM = 12;
const DATA_DIR = '/mapnav/data';
const NAV_RUNTIME_KEY = '__courierNavRuntime';
const NAV_RUNTIME_VERSION = 2;
const MIN_SIM_SPEED_KMH = 5;
const DEFAULT_SIM_SPEED_KMH = 30;

const normalizeSimSpeedKmh = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIM_SPEED_KMH;
  }
  return Math.max(MIN_SIM_SPEED_KMH, parsed);
};

const roundCoord = (value, decimals = 5) => Number(value.toFixed(decimals));
const nodeKey = (lng, lat) => `${lng},${lat}`;
const buildPlannedRouteSignature = (points) => (
  (Array.isArray(points) ? points : [])
    .map((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng ?? point?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return `${roundCoord(lat, 5)},${roundCoord(lng, 5)}`;
    })
    .filter((token) => Boolean(token))
    .join('|')
);

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
      if (this.items[parent].priority <= this.items[index].priority) {
        break;
      }
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop() {
    if (this.items.length <= 0) {
      return null;
    }
    const root = this.items[0];
    const end = this.items.pop();
    if (this.items.length > 0 && end) {
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
      if (smallest === index) {
        break;
      }
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }

  get size() {
    return this.items.length;
  }
}

const toPoint = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng ?? value?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const haversineMeters = (a, b) => {
  if (!a || !b) {
    return 0;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(Number(b.lat) - Number(a.lat));
  const dLng = toRadians(Number(b.lng) - Number(a.lng));
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const arc = (Math.sin(dLat / 2) ** 2)
    + (Math.sin(dLng / 2) ** 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.sqrt(arc));
};

const bearing = (a, b) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const stepTypeFromInstruction = (instructionText = '') => {
  const lower = String(instructionText || '').toLowerCase();
  if (lower.includes('arrive') || lower.includes('destination')) {
    return 'arrive';
  }
  if (lower.includes('left')) {
    return 'turn-left';
  }
  if (lower.includes('right')) {
    return 'turn-right';
  }
  return 'continue';
};

const buildDirections = (coords, options = {}) => {
  if (!Array.isArray(coords) || coords.length < 2) {
    return [];
  }
  const segmentStreetNames = Array.isArray(options?.segmentStreetNames) ? options.segmentStreetNames : [];
  const resolveAreaName = typeof options?.resolveAreaName === 'function' ? options.resolveAreaName : null;
  const segmentCount = coords.length - 1;

  const cardinalDirection = (bearingDegrees) => {
    const headings = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const normalized = ((Number(bearingDegrees) % 360) + 360) % 360;
    return headings[Math.round(normalized / 45) % 8];
  };

  const streetNameForSegment = (segmentIndex) => (
    normalizeLabel(segmentStreetNames[Math.max(0, Number(segmentIndex) - 1)] || '')
  );

  const areaNameForCoordIndex = (coordIndex) => {
    if (!resolveAreaName) {
      return '';
    }
    const coordinate = coords[coordIndex];
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return '';
    }
    const lat = Number(coordinate[0]);
    const lng = Number(coordinate[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return '';
    }
    return normalizeLabel(resolveAreaName({ lat, lng }) || '');
  };

  const segmentData = [];
  for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
    const from = coords[segmentIndex - 1];
    const to = coords[segmentIndex];
    if (!Array.isArray(from) || !Array.isArray(to)) {
      continue;
    }
    const fromPoint = { lat: Number(from[0]), lng: Number(from[1]) };
    const toPoint = { lat: Number(to[0]), lng: Number(to[1]) };
    if (
      !Number.isFinite(fromPoint.lat)
      || !Number.isFinite(fromPoint.lng)
      || !Number.isFinite(toPoint.lat)
      || !Number.isFinite(toPoint.lng)
    ) {
      continue;
    }
    segmentData[segmentIndex] = {
      distanceMeters: haversineMeters(fromPoint, toPoint),
      bearingDegrees: bearing(fromPoint, toPoint),
      roadName: streetNameForSegment(segmentIndex)
    };
  }

  const sumSegmentDistance = (fromSegment, toSegment) => {
    let total = 0;
    for (let segmentIndex = fromSegment; segmentIndex <= toSegment; segmentIndex += 1) {
      total += Number(segmentData[segmentIndex]?.distanceMeters || 0);
    }
    return total;
  };

  const turnLabel = (type, roadName) => {
    if (type === 'uturn') {
      return roadName ? `Make a U-turn on ${roadName}` : 'Make a U-turn';
    }
    if (type === 'turn-left') {
      return roadName ? `Turn left onto ${roadName}` : 'Turn left';
    }
    if (type === 'turn-right') {
      return roadName ? `Turn right onto ${roadName}` : 'Turn right';
    }
    return roadName ? `Continue on ${roadName}` : 'Continue';
  };

  const turnEvents = [];
  for (let segmentIndex = 2; segmentIndex <= segmentCount; segmentIndex += 1) {
    const prevBearing = Number(segmentData[segmentIndex - 1]?.bearingDegrees);
    const currentBearing = Number(segmentData[segmentIndex]?.bearingDegrees);
    if (!Number.isFinite(prevBearing) || !Number.isFinite(currentBearing)) {
      continue;
    }
    let delta = currentBearing - prevBearing;
    delta = ((delta + 540) % 360) - 180;
    if (Math.abs(delta) < 30) {
      continue;
    }
    const type = Math.abs(delta) >= 150
      ? 'uturn'
      : (delta > 0 ? 'turn-right' : 'turn-left');
    turnEvents.push({
      type,
      segmentIndex,
      roadName: segmentData[segmentIndex]?.roadName || '',
      areaName: areaNameForCoordIndex(segmentIndex - 1)
    });
  }

  const steps = [];
  let currentStartSegment = 1;

  turnEvents.forEach((event) => {
    const intervalEnd = event.segmentIndex - 1;
    const distanceMeters = sumSegmentDistance(currentStartSegment, intervalEnd);
    if (distanceMeters > 0) {
      steps.push({
        label: turnLabel(event.type, event.roadName),
        distanceMeters,
        timeSeconds: null,
        startIndex: currentStartSegment,
        endIndex: intervalEnd,
        type: event.type,
        areaName: event.areaName || areaNameForCoordIndex(intervalEnd)
      });
    }
    currentStartSegment = event.segmentIndex;
  });

  const remainingDistance = sumSegmentDistance(currentStartSegment, segmentCount);
  const finalRoadName = streetNameForSegment(currentStartSegment) || streetNameForSegment(segmentCount);
  if (remainingDistance > 0) {
    if (steps.length <= 0) {
      const firstBearing = Number(segmentData[1]?.bearingDegrees);
      const headingText = Number.isFinite(firstBearing)
        ? `Head ${cardinalDirection(firstBearing)}`
        : 'Continue';
      steps.push({
        label: finalRoadName ? `${headingText} on ${finalRoadName}` : headingText,
        distanceMeters: remainingDistance,
        timeSeconds: null,
        startIndex: currentStartSegment,
        endIndex: segmentCount,
        type: 'continue',
        areaName: areaNameForCoordIndex(segmentCount)
      });
    } else {
      steps.push({
        label: finalRoadName ? `Continue on ${finalRoadName}` : 'Continue to destination',
        distanceMeters: remainingDistance,
        timeSeconds: null,
        startIndex: currentStartSegment,
        endIndex: segmentCount,
        type: 'continue',
        areaName: areaNameForCoordIndex(segmentCount)
      });
    }
  }

  steps.push({
    label: 'Arrive at destination',
    distanceMeters: 0,
    timeSeconds: 0,
    startIndex: segmentCount,
    endIndex: segmentCount,
    type: 'arrive',
    areaName: areaNameForCoordIndex(segmentCount)
  });

  return steps;
};

const parseGeoapifySteps = (feature, fallbackCoords) => {
  const rawLegs = Array.isArray(feature?.properties?.legs) ? feature.properties.legs : [];
  const rawSteps = Array.isArray(rawLegs[0]?.steps) ? rawLegs[0].steps : [];
  if (!rawSteps.length) {
    return buildDirections(fallbackCoords);
  }
  return rawSteps.map((step, index) => {
    const label = String(
      step?.instruction
      || step?.instruction_text
      || step?.text
      || step?.name
      || 'Continue'
    ).trim() || 'Continue';
    const startIndex = Number(
      step?.from_index
      ?? step?.from_index_in_path
      ?? step?.from
      ?? index
    );
    const endIndex = Number(
      step?.to_index
      ?? step?.to_index_in_path
      ?? step?.to
      ?? startIndex
    );
    return {
      label,
      distanceMeters: Number(step?.distance) || 0,
      timeSeconds: Number(step?.time) || null,
      startIndex: Number.isFinite(startIndex) ? startIndex : index,
      endIndex: Number.isFinite(endIndex) ? endIndex : (Number.isFinite(startIndex) ? startIndex : index),
      type: stepTypeFromInstruction(label)
    };
  });
};

const createPinIcon = (type) => (
  L.divIcon({
    className: `nav-pin nav-pin--${type}`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  })
);

const normalizeLabel = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
};

const normalizePlannedStopKind = (rawKind, index, label = '') => {
  const value = String(rawKind || '').trim().toLowerCase();
  if (['start', 'pickup', 'delivery', 'branch'].includes(value)) {
    return value;
  }
  const lowerLabel = normalizeLabel(label).toLowerCase();
  if (index === 0) {
    return 'start';
  }
  if (lowerLabel.startsWith('branch')) {
    return 'branch';
  }
  if (lowerLabel.startsWith('pickup')) {
    return 'pickup';
  }
  if (lowerLabel.startsWith('delivery')) {
    return 'delivery';
  }
  return 'waypoint';
};

const markerVisualTypeForStopKind = (stopKind, fallbackType = 'end') => {
  const kind = String(stopKind || '').trim().toLowerCase();
  if (kind === 'branch') {
    return 'branch';
  }
  if (kind === 'start') {
    return 'start';
  }
  return fallbackType === 'start' ? 'start' : 'end';
};

const defaultPointLabel = (type) => {
  if (type === 'branch') {
    return 'Branch';
  }
  if (type === 'start') {
    return 'Current leg start';
  }
  return 'Current leg destination';
};

const formatInputPoint = (point) => (
  point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
    ? `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`
    : ''
);

const normalizeSearchText = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[_,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildSegments = (coords) => {
  const segments = [];
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    const a = { lat: Number(coords[index - 1][0]), lng: Number(coords[index - 1][1]) };
    const b = { lat: Number(coords[index][0]), lng: Number(coords[index][1]) };
    const distance = haversineMeters(a, b);
    segments.push({
      index,
      a,
      b,
      distance,
      start: total,
      end: total + distance
    });
    total += distance;
  }
  return { segments, total };
};

const normalizeGeoCoordinate = (value) => {
  const lng = Number(value?.[0]);
  const lat = Number(value?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return [lat, lng];
};

const normalizeRouteGeometry = (rawGeometry) => {
  if (!rawGeometry || typeof rawGeometry !== 'object') {
    return null;
  }

  let geometryType = '';
  let geometryCoordinates = null;
  let legsRaw = [];

  if (rawGeometry?.type === 'FeatureCollection') {
    const feature = Array.isArray(rawGeometry.features) ? rawGeometry.features[0] : null;
    geometryType = String(feature?.geometry?.type || '');
    geometryCoordinates = feature?.geometry?.coordinates;
    legsRaw = Array.isArray(feature?.properties?.legs) ? feature.properties.legs : [];
  } else if (rawGeometry?.type === 'Feature') {
    geometryType = String(rawGeometry?.geometry?.type || '');
    geometryCoordinates = rawGeometry?.geometry?.coordinates;
    legsRaw = Array.isArray(rawGeometry?.properties?.legs)
      ? rawGeometry.properties.legs
      : (Array.isArray(rawGeometry?.legs) ? rawGeometry.legs : []);
  } else {
    geometryType = String(rawGeometry?.type || rawGeometry?.geometry?.type || '');
    geometryCoordinates = rawGeometry?.coordinates ?? rawGeometry?.geometry?.coordinates;
    legsRaw = Array.isArray(rawGeometry?.legs)
      ? rawGeometry.legs
      : (Array.isArray(rawGeometry?.geometry?.legs) ? rawGeometry.geometry.legs : []);
  }

  let coordinates = [];
  let legLines = [];
  if (geometryType === 'LineString') {
    coordinates = (Array.isArray(geometryCoordinates) ? geometryCoordinates : [])
      .map((coord) => normalizeGeoCoordinate(coord))
      .filter((coord) => Boolean(coord));
  } else if (geometryType === 'MultiLineString') {
    legLines = (Array.isArray(geometryCoordinates) ? geometryCoordinates : [])
      .map((line) => (
        (Array.isArray(line) ? line : [])
          .map((coord) => normalizeGeoCoordinate(coord))
          .filter((coord) => Boolean(coord))
      ))
      .filter((line) => line.length >= 2);
    coordinates = legLines.flat();
  }

  if (coordinates.length < 2) {
    return null;
  }

  const legs = (Array.isArray(legsRaw) ? legsRaw : [])
    .map((leg) => {
      const fromIndex = Number(
        leg?.from_index
        ?? leg?.fromIndex
        ?? leg?.start_index
        ?? leg?.startIndex
      );
      const toIndex = Number(
        leg?.to_index
        ?? leg?.toIndex
        ?? leg?.end_index
        ?? leg?.endIndex
      );
      if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) {
        return null;
      }
      return {
        fromIndex: Math.max(0, Math.floor(fromIndex)),
        toIndex: Math.max(0, Math.floor(toIndex))
      };
    })
    .filter((leg) => Boolean(leg));

  return {
    type: geometryType,
    coordinates,
    legLines,
    legs
  };
};

const extractLegGeometryCoordinates = ({
  normalizedRouteGeometry,
  legIndex,
  startPoint,
  endPoint
}) => {
  const requestedLegIndex = Number.isFinite(legIndex) && legIndex >= 0
    ? Math.floor(legIndex)
    : null;
  const geometryCoordinates = Array.isArray(normalizedRouteGeometry?.coordinates)
    ? normalizedRouteGeometry.coordinates
    : [];
  if (geometryCoordinates.length < 2) {
    return [];
  }

  if (requestedLegIndex !== null) {
    if (Array.isArray(normalizedRouteGeometry?.legLines) && normalizedRouteGeometry.legLines.length > 0) {
      const selectedLine = normalizedRouteGeometry.legLines[requestedLegIndex];
      if (Array.isArray(selectedLine) && selectedLine.length >= 2) {
        if (startPoint && endPoint) {
          const first = selectedLine[0];
          const last = selectedLine[selectedLine.length - 1];
          const forwardScore = haversineMeters(
            { lat: Number(startPoint.lat), lng: Number(startPoint.lng) },
            { lat: Number(first[0]), lng: Number(first[1]) }
          ) + haversineMeters(
            { lat: Number(endPoint.lat), lng: Number(endPoint.lng) },
            { lat: Number(last[0]), lng: Number(last[1]) }
          );
          const reverseScore = haversineMeters(
            { lat: Number(startPoint.lat), lng: Number(startPoint.lng) },
            { lat: Number(last[0]), lng: Number(last[1]) }
          ) + haversineMeters(
            { lat: Number(endPoint.lat), lng: Number(endPoint.lng) },
            { lat: Number(first[0]), lng: Number(first[1]) }
          );
          return reverseScore < forwardScore ? selectedLine.slice().reverse() : selectedLine;
        }
        return selectedLine;
      }
      return [];
    }

    if (Array.isArray(normalizedRouteGeometry?.legs) && normalizedRouteGeometry.legs.length > 0) {
      const leg = normalizedRouteGeometry.legs[requestedLegIndex];
      if (leg) {
        const fromIndex = Math.max(0, Math.min(geometryCoordinates.length - 1, Number(leg.fromIndex)));
        const toIndex = Math.max(0, Math.min(geometryCoordinates.length - 1, Number(leg.toIndex)));
        if (toIndex > fromIndex) {
          return geometryCoordinates.slice(fromIndex, toIndex + 1);
        }
        if (fromIndex > toIndex) {
          return geometryCoordinates.slice(toIndex, fromIndex + 1).reverse();
        }
      }
    }

    if (String(normalizedRouteGeometry?.type) === 'MultiLineString') {
      // Avoid accidentally mixing checkpoints from unrelated legs.
      return [];
    }
  }

  if (!startPoint || !endPoint) {
    return geometryCoordinates;
  }

  const nearestCoordIndex = (point) => {
    let bestIndex = 0;
    let bestDistance = Infinity;
    geometryCoordinates.forEach((coord, index) => {
      const distance = haversineMeters(
        { lat: Number(point.lat), lng: Number(point.lng) },
        { lat: Number(coord[0]), lng: Number(coord[1]) }
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const fromIndex = nearestCoordIndex(startPoint);
  const toIndex = nearestCoordIndex(endPoint);
  if (toIndex >= fromIndex) {
    return geometryCoordinates.slice(fromIndex, toIndex + 1);
  }
  return geometryCoordinates.slice(toIndex, fromIndex + 1).reverse();
};

const polylineDistanceMeters = (coords = []) => {
  if (!Array.isArray(coords) || coords.length < 2) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    const from = coords[index - 1];
    const to = coords[index];
    total += haversineMeters(
      { lat: Number(from?.[0]), lng: Number(from?.[1]) },
      { lat: Number(to?.[0]), lng: Number(to?.[1]) }
    );
  }
  return total;
};

const downsampleRouteCoordinates = (coords, spacingMeters = 55, maxPoints = 120) => {
  if (!Array.isArray(coords) || coords.length <= 2) {
    return Array.isArray(coords) ? coords : [];
  }
  const sampled = [coords[0]];
  let carryDistance = 0;
  for (let index = 1; index < coords.length - 1; index += 1) {
    const from = coords[index - 1];
    const to = coords[index];
    const segmentDistance = haversineMeters(
      { lat: Number(from[0]), lng: Number(from[1]) },
      { lat: Number(to[0]), lng: Number(to[1]) }
    );
    carryDistance += segmentDistance;
    if (carryDistance >= spacingMeters) {
      sampled.push(coords[index]);
      carryDistance = 0;
    }
  }
  sampled.push(coords[coords.length - 1]);

  if (sampled.length <= maxPoints) {
    return sampled;
  }
  const stride = Math.ceil(sampled.length / maxPoints);
  const compact = sampled.filter((_, index) => index % stride === 0);
  const last = sampled[sampled.length - 1];
  const final = compact[compact.length - 1];
  if (!final || final[0] !== last[0] || final[1] !== last[1]) {
    compact.push(last);
  }
  return compact;
};

const extractPlannedData = (payload) => {
  const rawPoints = Array.isArray(payload?.routePoints)
    ? payload.routePoints
    : [];
  const rawLabels = Array.isArray(payload?.routePointLabels)
    ? payload.routePointLabels
    : [];
  const rawKindsMeta = Array.isArray(payload?.routePointMeta)
    ? payload.routePointMeta
    : [];
  const rawKinds = rawKindsMeta.map((item) => String(item?.stopKind || '').trim().toLowerCase());

  const points = [];
  const labels = [];
  const stopKinds = [];

  rawPoints.forEach((point, index) => {
    const normalizedPoint = toPoint(point);
    if (!normalizedPoint) {
      return;
    }
    const safeLabel = normalizeLabel(rawLabels[index]);
    const nextKind = normalizePlannedStopKind(rawKinds[index], points.length, safeLabel);
    const previous = points[points.length - 1];
    const sameAsPrevious = previous
      && Math.abs(previous.lat - normalizedPoint.lat) < 0.00001
      && Math.abs(previous.lng - normalizedPoint.lng) < 0.00001;

    if (sameAsPrevious) {
      if (safeLabel) {
        labels[labels.length - 1] = safeLabel;
      }
      if (nextKind && !['start', 'waypoint'].includes(nextKind)) {
        stopKinds[stopKinds.length - 1] = nextKind;
      }
      return;
    }

    points.push(normalizedPoint);
    labels.push(safeLabel);
    stopKinds.push(nextKind);
  });

  return { points, labels, stopKinds };
};

const extractPlannedPreviewGeometry = (payload, points = []) => {
  const normalizedRouteGeometry = normalizeRouteGeometry(payload?.routeGeometry);
  if (Array.isArray(normalizedRouteGeometry?.legLines) && normalizedRouteGeometry.legLines.length > 0) {
    const legLines = normalizedRouteGeometry.legLines
      .map((line) => (Array.isArray(line) ? line : []))
      .filter((line) => line.length >= 2);
    if (legLines.length === 1) {
      return legLines[0];
    }
    if (legLines.length > 1) {
      return legLines;
    }
  }

  if (Array.isArray(normalizedRouteGeometry?.coordinates) && normalizedRouteGeometry.coordinates.length >= 2) {
    return normalizedRouteGeometry.coordinates;
  }

  const fallback = (Array.isArray(points) ? points : [])
    .map((point) => [Number(point?.lat), Number(point?.lng)])
    .filter((coord) => Number.isFinite(coord?.[0]) && Number.isFinite(coord?.[1]));
  return fallback.length >= 2 ? fallback : [];
};

const NavigationMap = forwardRef(({
  navPayload,
  useGpsTracking,
  gpsLocation,
  isFollowing,
  speedLimit,
  onDriverMessage,
  onRouteLoaded,
  onCurrentPosChange,
  onSimulationChange,
  onActiveStepIndexChange,
  onRouteProgressChange,
  onRouteSetupStateChange
}, ref) => {
  const mapContainerNodeRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const routePreviewLayerRef = useRef(null);
  const startMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const branchMarkersRef = useRef([]);
  const moverMarkerRef = useRef(null);
  const gpsMarkerRef = useRef(null);
  const simTimerRef = useRef(null);
  const roadLayerRef = useRef(null);
  const roadGraphRef = useRef(null);
  const roadNodesRef = useRef(null);
  const roadGridRef = useRef(null);
  const roadLoadPromiseRef = useRef(null);
  const roadsReadyRef = useRef(false);
  const plannedPointsRef = useRef([]);
  const plannedLabelsRef = useRef([]);
  const plannedKindsRef = useRef([]);
  const plannedLegIndexRef = useRef(-1);
  const routeCoordsRef = useRef([]);
  const routeStepsRef = useRef([]);
  const routeSegmentsRef = useRef([]);
  const routeTotalMetersRef = useRef(0);
  const routeTotalSecondsRef = useRef(0);
  const navDistanceTravelledRef = useRef(0);
  const navStateRef = useRef(null);
  const speedLimitRef = useRef(normalizeSimSpeedKmh(speedLimit));
  const activeStepIndexRef = useRef(-1);
  const awaitingAdvanceRef = useRef(false);
  const gpsModeEnabledRef = useRef(false);
  const autoStartPlannedLegRef = useRef(false);
  const lastPositionPushRef = useRef(0);
  const lastRuntimeSaveTsRef = useRef(0);
  const initSeqRef = useRef(0);
  const placeIndexRef = useRef([]);
  const placeCacheRef = useRef(new Map());
  const placesLoadPromiseRef = useRef(null);
  const startPointRef = useRef(null);
  const endPointRef = useRef(null);
  const pickModeRef = useRef(null);
  const pickStartThenEndRef = useRef(false);

  const [startPointState, setStartPointState] = useState(null);
  const [endPointState, setEndPointState] = useState(null);
  const [startNameState, setStartNameState] = useState('');
  const [endNameState, setEndNameState] = useState('');
  const [startSearchQuery, setStartSearchQuery] = useState('');
  const [endSearchQuery, setEndSearchQuery] = useState('');
  const [startSearchResults, setStartSearchResults] = useState([]);
  const [endSearchResults, setEndSearchResults] = useState([]);
  const [pickMode, setPickMode] = useState(null);
  const [pickStartThenEnd, setPickStartThenEnd] = useState(false);
  const [pickOptionsOpen, setPickOptionsOpen] = useState(false);
  const [placesReady, setPlacesReady] = useState(false);

  const buildRoadGraph = useCallback((geojson) => {
    const graph = new Map();
    const nodes = new Map();
    const grid = new Map();

    const addEdge = (aKey, bKey, distanceMeters, roadName = '') => {
      if (!graph.has(aKey)) {
        graph.set(aKey, []);
      }
      graph.get(aKey).push({ to: bKey, distanceMeters, roadName });
    };

    const addNode = (lng, lat) => {
      const roundedLng = roundCoord(Number(lng));
      const roundedLat = roundCoord(Number(lat));
      const key = nodeKey(roundedLng, roundedLat);
      if (!nodes.has(key)) {
        nodes.set(key, { lng: roundedLng, lat: roundedLat });
        const cellKey = `${Math.floor(roundedLat * 100)}:${Math.floor(roundedLng * 100)}`;
        if (!grid.has(cellKey)) {
          grid.set(cellKey, []);
        }
        grid.get(cellKey).push(key);
      }
      return key;
    };

    const addLine = (coordinates = [], roadName = '') => {
      for (let index = 0; index < coordinates.length - 1; index += 1) {
        const [lngA, latA] = coordinates[index] || [];
        const [lngB, latB] = coordinates[index + 1] || [];
        if (![lngA, latA, lngB, latB].every((value) => Number.isFinite(Number(value)))) {
          continue;
        }
        const aKey = addNode(lngA, latA);
        const bKey = addNode(lngB, latB);
        const aNode = nodes.get(aKey);
        const bNode = nodes.get(bKey);
        const distanceMeters = haversineMeters(aNode, bNode);
        addEdge(aKey, bKey, distanceMeters, roadName);
        addEdge(bKey, aKey, distanceMeters, roadName);
      }
    };

    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    features.forEach((feature) => {
      const geometry = feature?.geometry;
      if (!geometry) {
        return;
      }
      const props = feature?.properties || {};
      const roadName = normalizeLabel(
        String(props['name:en'] || props.name_en || props.name || props.ref || '')
      );
      if (geometry.type === 'LineString') {
        addLine(geometry.coordinates || [], roadName);
        return;
      }
      if (geometry.type === 'MultiLineString') {
        (geometry.coordinates || []).forEach((line) => addLine(line || [], roadName));
      }
    });

    roadGraphRef.current = graph;
    roadNodesRef.current = nodes;
    roadGridRef.current = grid;
    roadsReadyRef.current = true;
  }, []);

  const ensureRoadGraphLoaded = useCallback(() => {
    if (roadsReadyRef.current) {
      return Promise.resolve(true);
    }
    if (roadLoadPromiseRef.current) {
      return roadLoadPromiseRef.current;
    }
    roadLoadPromiseRef.current = fetch(`${DATA_DIR}/roads_major.geojson`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('roads-data-unavailable');
        }
        return response.json();
      })
      .then((geojson) => {
        buildRoadGraph(geojson);
        if (mapRef.current) {
          if (roadLayerRef.current) {
            mapRef.current.removeLayer(roadLayerRef.current);
          }
          roadLayerRef.current = L.geoJSON(geojson, {
            style: { color: 'rgba(255,255,255,0.25)', weight: 2 }
          }).addTo(mapRef.current);
        }
        return true;
      })
      .catch(() => {
        roadsReadyRef.current = false;
        return false;
      })
      .finally(() => {
        roadLoadPromiseRef.current = null;
      });
    return roadLoadPromiseRef.current;
  }, [buildRoadGraph]);

  const findNearestNode = useCallback((latlng) => {
    const nodes = roadNodesRef.current;
    const grid = roadGridRef.current;
    if (!nodes || !grid) {
      return null;
    }
    const baseLat = Math.floor(Number(latlng.lat) * 100);
    const baseLng = Math.floor(Number(latlng.lng) * 100);
    let bestKey = null;
    let bestDistance = Infinity;

    for (let radius = 0; radius <= 3; radius += 1) {
      for (let dLat = -radius; dLat <= radius; dLat += 1) {
        for (let dLng = -radius; dLng <= radius; dLng += 1) {
          const cellKey = `${baseLat + dLat}:${baseLng + dLng}`;
          const keys = grid.get(cellKey);
          if (!keys) {
            continue;
          }
          keys.forEach((key) => {
            const node = nodes.get(key);
            if (!node) {
              return;
            }
            const distance = haversineMeters(
              { lat: Number(node.lat), lng: Number(node.lng) },
              { lat: Number(latlng.lat), lng: Number(latlng.lng) }
            );
            if (distance < bestDistance) {
              bestDistance = distance;
              bestKey = key;
            }
          });
        }
      }
      if (bestKey) {
        break;
      }
    }

    return bestKey;
  }, []);

  const shortestPath = useCallback((startKey, endKey) => {
    const graph = roadGraphRef.current;
    const nodes = roadNodesRef.current;
    if (!graph || !nodes || !startKey || !endKey) {
      return null;
    }
    const distances = new Map();
    const previous = new Map();
    const visited = new Set();
    const heap = new MinHeap();

    distances.set(startKey, 0);
    heap.push({ key: startKey, priority: 0 });

    while (heap.size > 0) {
      const current = heap.pop();
      if (!current) {
        break;
      }
      const currentKey = current.key;
      if (visited.has(currentKey)) {
        continue;
      }
      visited.add(currentKey);
      if (currentKey === endKey) {
        break;
      }
      const currentDistance = distances.get(currentKey);
      if (!Number.isFinite(currentDistance)) {
        continue;
      }
      const neighbors = graph.get(currentKey) || [];
      neighbors.forEach((edge) => {
        const nextDistance = currentDistance + Number(edge.distanceMeters || 0);
        const previousBest = distances.get(edge.to);
        if (!Number.isFinite(previousBest) || nextDistance < previousBest) {
          distances.set(edge.to, nextDistance);
          previous.set(edge.to, {
            key: currentKey,
            roadName: normalizeLabel(String(edge.roadName || ''))
          });
          heap.push({ key: edge.to, priority: nextDistance });
        }
      });
    }

    if (!distances.has(endKey)) {
      return null;
    }

    const pathKeys = [];
    const segmentStreetNames = [];
    let keyCursor = endKey;
    while (keyCursor) {
      pathKeys.push(keyCursor);
      const previousEntry = previous.get(keyCursor);
      if (!previousEntry) {
        break;
      }
      segmentStreetNames.push(previousEntry.roadName || '');
      keyCursor = previousEntry.key;
    }
    pathKeys.reverse();
    segmentStreetNames.reverse();

    const coords = pathKeys
      .map((key) => nodes.get(key))
      .filter((node) => Boolean(node))
      .map((node) => [Number(node.lat), Number(node.lng)]);

    if (coords.length < 2) {
      return null;
    }

    return {
      coords,
      distanceMeters: Number(distances.get(endKey) || 0),
      segmentStreetNames
    };
  }, []);

  useEffect(() => {
    startPointRef.current = startPointState;
  }, [startPointState]);

  useEffect(() => {
    endPointRef.current = endPointState;
  }, [endPointState]);

  useEffect(() => {
    pickModeRef.current = pickMode;
    if (mapRef.current?.getContainer) {
      mapRef.current.getContainer().classList.toggle('picking', Boolean(pickMode));
    }
  }, [pickMode]);

  useEffect(() => {
    pickStartThenEndRef.current = pickStartThenEnd;
  }, [pickStartThenEnd]);

  const clearPlannedRoute = useCallback(() => {
    plannedPointsRef.current = [];
    plannedLabelsRef.current = [];
    plannedKindsRef.current = [];
    plannedLegIndexRef.current = -1;
    autoStartPlannedLegRef.current = false;
    awaitingAdvanceRef.current = false;
    lastRuntimeSaveTsRef.current = 0;
    try {
      window.sessionStorage.removeItem(NAV_RUNTIME_KEY);
    } catch (error) {
      // Ignore session storage errors.
    }
    if (routePreviewLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(routePreviewLayerRef.current);
    }
    routePreviewLayerRef.current = null;
  }, []);

  const clearRoutePreview = useCallback(() => {
    if (routePreviewLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(routePreviewLayerRef.current);
    }
    routePreviewLayerRef.current = null;
  }, []);

  const setRoutePreview = useCallback((previewGeometry) => {
    if (!mapRef.current) {
      return false;
    }
    clearRoutePreview();
    if (!Array.isArray(previewGeometry) || previewGeometry.length < 2) {
      return false;
    }
    routePreviewLayerRef.current = L.polyline(previewGeometry, {
      color: '#2f6eff',
      weight: 4,
      opacity: 0.3,
      dashArray: '10 10',
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(mapRef.current);
    return true;
  }, [clearRoutePreview]);

  const ensurePlacesLoaded = useCallback(() => {
    if (placesReady || placeIndexRef.current.length > 0) {
      return Promise.resolve(true);
    }
    if (placesLoadPromiseRef.current) {
      return placesLoadPromiseRef.current;
    }
    placesLoadPromiseRef.current = fetch(`${DATA_DIR}/places.geojson`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('places-data-unavailable');
        }
        return response.json();
      })
      .then((data) => {
        const features = Array.isArray(data?.features) ? data.features : [];
        placeIndexRef.current = features
          .map((feature) => {
            const lng = Number(feature?.geometry?.coordinates?.[0]);
            const lat = Number(feature?.geometry?.coordinates?.[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return null;
            }
            const props = feature?.properties || {};
            const name = String(
              props['name:en']
              || props.name_en
              || props.name
              || ''
            ).trim();
            if (!name) {
              return null;
            }
            return {
              lat,
              lng,
              name,
              searchName: normalizeSearchText(name)
            };
          })
          .filter((item) => Boolean(item));
        placeCacheRef.current.clear();
        setPlacesReady(true);
        return true;
      })
      .catch(() => {
        setPlacesReady(false);
        return false;
      })
      .finally(() => {
        placesLoadPromiseRef.current = null;
      });
    return placesLoadPromiseRef.current;
  }, [placesReady]);

  const clearPersistedNavRuntime = useCallback(() => {
    try {
      window.sessionStorage.removeItem(NAV_RUNTIME_KEY);
    } catch (error) {
      // Ignore session storage errors.
    }
  }, []);

  const readPersistedNavRuntime = useCallback(() => {
    try {
      const raw = window.sessionStorage.getItem(NAV_RUNTIME_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
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
  }, [clearPersistedNavRuntime]);

  const persistNavRuntime = useCallback((force = false) => {
    const plannedPoints = plannedPointsRef.current;
    const legIndex = Number(plannedLegIndexRef.current);
    if (!Array.isArray(plannedPoints) || plannedPoints.length < 2 || !Number.isFinite(legIndex) || legIndex < 0) {
      return;
    }

    const routeSignature = buildPlannedRouteSignature(plannedPoints);
    if (!routeSignature) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastRuntimeSaveTsRef.current < 900) {
      return;
    }

    const totalDistance = Number(routeTotalMetersRef.current) || 0;
    const travelledDistance = Number(navDistanceTravelledRef.current) || 0;
    const clampedDistance = totalDistance > 0
      ? Math.max(0, Math.min(totalDistance, travelledDistance))
      : Math.max(0, travelledDistance);

    const payload = {
      version: NAV_RUNTIME_VERSION,
      routeSignature,
      legIndex,
      distanceMeters: clampedDistance,
      isRunning: Boolean(navStateRef.current),
      awaitingConfirm: Boolean(awaitingAdvanceRef.current),
      speedKmh: speedLimitRef.current,
      savedAt: now
    };

    try {
      window.sessionStorage.setItem(NAV_RUNTIME_KEY, JSON.stringify(payload));
      lastRuntimeSaveTsRef.current = now;
    } catch (error) {
      // Ignore session storage errors.
    }
  }, []);

  useEffect(() => {
    const normalizedSpeed = normalizeSimSpeedKmh(speedLimit);
    speedLimitRef.current = normalizedSpeed;
    if (navStateRef.current) {
      navStateRef.current.speedMps = (normalizedSpeed * 1000) / 3600;
      navStateRef.current.lastTickMs = performance.now();
      persistNavRuntime(true);
    }
  }, [persistNavRuntime, speedLimit]);

  const nearestPlaceName = useCallback((point) => {
    if (!point) {
      return null;
    }
    const cacheKey = formatInputPoint(point);
    if (placeCacheRef.current.has(cacheKey)) {
      return placeCacheRef.current.get(cacheKey);
    }
    const placeIndex = placeIndexRef.current;
    if (!Array.isArray(placeIndex) || placeIndex.length <= 0) {
      return null;
    }
    let bestPlace = null;
    let bestDistance = Infinity;
    placeIndex.forEach((place) => {
      const distance = haversineMeters(
        { lat: Number(point.lat), lng: Number(point.lng) },
        { lat: Number(place.lat), lng: Number(place.lng) }
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPlace = place;
      }
    });
    if (!bestPlace || bestDistance > 60000) {
      placeCacheRef.current.set(cacheKey, null);
      return null;
    }
    const resolvedName = bestDistance <= 2200 ? bestPlace.name : `Near ${bestPlace.name}`;
    placeCacheRef.current.set(cacheKey, resolvedName);
    return resolvedName;
  }, []);

  const searchPlacesByName = useCallback((query, limit = 8) => {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 2) {
      return [];
    }
    const placeIndex = placeIndexRef.current;
    if (!Array.isArray(placeIndex) || placeIndex.length <= 0) {
      return [];
    }
    const matches = [];
    placeIndex.forEach((place) => {
      const name = place.searchName || normalizeSearchText(place.name);
      const index = name.indexOf(normalizedQuery);
      if (index < 0) {
        return;
      }
      const hasWordStartMatch = name
        .split(' ')
        .some((token) => token.startsWith(normalizedQuery));
      const rank = index === 0 ? 0 : (hasWordStartMatch ? 1 : 2);
      matches.push({ place, rank, index });
    });
    matches.sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (a.index !== b.index) {
        return a.index - b.index;
      }
      return String(a.place.name || '').localeCompare(String(b.place.name || ''));
    });
    return matches.slice(0, limit).map((match) => match.place);
  }, []);

  const refreshSearchResults = useCallback((type, query) => {
    const results = searchPlacesByName(query, 8);
    if (type === 'start') {
      setStartSearchResults(results);
    } else {
      setEndSearchResults(results);
    }
  }, [searchPlacesByName]);

  const emitMessage = useCallback((payload) => {
    if (typeof onDriverMessage === 'function' && payload && typeof payload === 'object') {
      onDriverMessage(payload);
    }
  }, [onDriverMessage]);

  const clearSimulation = useCallback(() => {
    if (simTimerRef.current !== null) {
      window.cancelAnimationFrame(simTimerRef.current);
      simTimerRef.current = null;
    }
    navStateRef.current = null;
    onSimulationChange?.(false);
  }, [onSimulationChange]);

  const setActiveStepForRouteIndex = useCallback((routeIndex) => {
    const steps = routeStepsRef.current;
    if (!Array.isArray(steps) || steps.length <= 0) {
      activeStepIndexRef.current = -1;
      onActiveStepIndexChange?.(-1);
      return;
    }
    let resolvedIndex = -1;
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      if (String(step?.type || '').toLowerCase() === 'arrive') {
        continue;
      }
      if (Number(routeIndex) >= Number(step?.startIndex) && Number(routeIndex) <= Number(step?.endIndex)) {
        resolvedIndex = index;
        break;
      }
    }
    if (resolvedIndex === -1) {
      resolvedIndex = steps.length - 1;
    }
    if (resolvedIndex !== activeStepIndexRef.current) {
      activeStepIndexRef.current = resolvedIndex;
      onActiveStepIndexChange?.(resolvedIndex);
    }
  }, [onActiveStepIndexChange]);

  const updateRouteProgress = useCallback((distanceMeters) => {
    const total = routeTotalMetersRef.current;
    const boundedDistance = total > 0
      ? Math.max(0, Math.min(total, distanceMeters))
      : Math.max(0, distanceMeters);
    navDistanceTravelledRef.current = boundedDistance;
    const progressPercent = total > 0 ? (boundedDistance / total) * 100 : 0;
    onRouteProgressChange?.(progressPercent);
    persistNavRuntime(false);
  }, [onRouteProgressChange, persistNavRuntime]);

  const getPositionForDistance = useCallback((distanceMeters) => {
    const segments = routeSegmentsRef.current;
    if (!Array.isArray(segments) || segments.length <= 0) {
      return null;
    }
    const total = routeTotalMetersRef.current;
    const boundedDistance = total > 0
      ? Math.max(0, Math.min(total, distanceMeters))
      : Math.max(0, distanceMeters);
    let segmentIndex = segments.findIndex((segment) => boundedDistance <= segment.end);
    if (segmentIndex < 0) {
      segmentIndex = segments.length - 1;
    }
    const segment = segments[segmentIndex];
    const ratio = segment.distance > 0 ? (boundedDistance - segment.start) / segment.distance : 0;
    const lat = segment.a.lat + (segment.b.lat - segment.a.lat) * ratio;
    const lng = segment.a.lng + (segment.b.lng - segment.a.lng) * ratio;
    return { lat, lng, segment, boundedDistance };
  }, []);

  const reportPosition = useCallback((source, point, shouldPan = true) => {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return;
    }

    if (moverMarkerRef.current && source === 'simulated') {
      moverMarkerRef.current.setLatLng([point.lat, point.lng]);
    }

    const now = Date.now();
    if (source !== 'simulated' || now - lastPositionPushRef.current > 800) {
      lastPositionPushRef.current = now;
      const routeDistanceMeters = Number(routeTotalMetersRef.current) || 0;
      const travelledDistanceMeters = navStateRef.current
        ? (Number(navStateRef.current.distanceMeters) || Number(navDistanceTravelledRef.current) || 0)
        : (Number(navDistanceTravelledRef.current) || 0);
      const remainingDistanceMeters = routeDistanceMeters > 0
        ? Math.max(0, routeDistanceMeters - Math.max(0, travelledDistanceMeters))
        : null;
      emitMessage({
        type: 'courier-nav/position',
        source,
        lat: Number(point.lat.toFixed(6)),
        lng: Number(point.lng.toFixed(6)),
        legIndex: plannedLegIndexRef.current,
        routeDistanceMeters: routeDistanceMeters > 0 ? routeDistanceMeters : null,
        remainingDistanceMeters
      });
    }

    onCurrentPosChange?.({ lat: point.lat, lng: point.lng });

    if (shouldPan && isFollowing && mapRef.current) {
      mapRef.current.panTo([point.lat, point.lng], { animate: true, duration: 0.45 });
    }
  }, [emitMessage, isFollowing, onCurrentPosChange]);

  const renderNavigationDistance = useCallback((distanceMeters, shouldPan = true) => {
    const position = getPositionForDistance(distanceMeters);
    if (!position) {
      return null;
    }
    updateRouteProgress(position.boundedDistance);
    reportPosition('simulated', { lat: position.lat, lng: position.lng }, shouldPan);
    setActiveStepForRouteIndex(position.segment.index);
    return position;
  }, [getPositionForDistance, reportPosition, setActiveStepForRouteIndex, updateRouteProgress]);

  const stopNavigation = useCallback(({ clearRoute = false, preserveProgress = true, emitEvent = false } = {}) => {
    let stopPoint = null;
    if (preserveProgress && navStateRef.current) {
      navDistanceTravelledRef.current = Math.max(
        0,
        Math.min(routeTotalMetersRef.current, navStateRef.current.distanceMeters)
      );
    }
    clearSimulation();
    if (!clearRoute && routeSegmentsRef.current.length > 0) {
      const position = getPositionForDistance(navDistanceTravelledRef.current);
      if (position) {
        stopPoint = {
          lat: Number(position.lat.toFixed(6)),
          lng: Number(position.lng.toFixed(6))
        };
        reportPosition('simulated', { lat: position.lat, lng: position.lng }, false);
      }
    }

    if (emitEvent) {
      emitMessage({
        type: 'courier-nav/navigation-stop',
        legIndex: plannedLegIndexRef.current,
        totalLegs: plannedPointsRef.current.length >= 2 ? plannedPointsRef.current.length - 1 : null,
        distanceMeters: Number(navDistanceTravelledRef.current) || 0,
        awaitingConfirm: Boolean(awaitingAdvanceRef.current),
        lat: stopPoint ? stopPoint.lat : null,
        lng: stopPoint ? stopPoint.lng : null
      });
    }

    persistNavRuntime(true);

    if (clearRoute) {
      if (routeLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current);
      }
      clearRoutePreview();
      if (moverMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(moverMarkerRef.current);
      }
      routeLayerRef.current = null;
      moverMarkerRef.current = null;
      routeCoordsRef.current = [];
      routeStepsRef.current = [];
      routeSegmentsRef.current = [];
      routeTotalMetersRef.current = 0;
      routeTotalSecondsRef.current = 0;
      navDistanceTravelledRef.current = 0;
      activeStepIndexRef.current = -1;
      lastRuntimeSaveTsRef.current = 0;
      clearPersistedNavRuntime();
      onRouteLoaded?.({
        routeCoords: [],
        steps: [],
        totalDistanceMeters: 0,
        totalTimeSeconds: 0,
        stageLabel: 'Route cleared',
        startLabel: '',
        endLabel: '',
        legIndex: plannedLegIndexRef.current,
        totalLegs: Math.max(0, plannedPointsRef.current.length - 1)
      });
      onActiveStepIndexChange?.(-1);
      onRouteProgressChange?.(0);
    }
  }, [
    clearRoutePreview,
    clearPersistedNavRuntime,
    clearSimulation,
    emitMessage,
    getPositionForDistance,
    onActiveStepIndexChange,
    onRouteLoaded,
    onRouteProgressChange,
    persistNavRuntime,
    reportPosition
  ]);

  const setPinMarker = useCallback((markerRef, point, markerType, label) => {
    if (!mapRef.current || !point) {
      return;
    }
    if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
    }
    markerRef.current = L.marker([point.lat, point.lng], {
      icon: createPinIcon(markerType),
      title: label || 'Route marker'
    }).addTo(mapRef.current);
    markerRef.current.bindTooltip(label || 'Route marker', {
      direction: 'top',
      offset: [0, -10]
    });
  }, []);

  const setRouteSetupPoint = useCallback((type, point, label = '', markerType = type) => {
    if (!point) {
      return;
    }
    const safePoint = {
      lat: Number(point.lat),
      lng: Number(point.lng)
    };
    if (!Number.isFinite(safePoint.lat) || !Number.isFinite(safePoint.lng)) {
      return;
    }
    const resolvedType = type === 'start' ? 'start' : 'end';
    const resolvedMarkerType = markerType || resolvedType;
    const resolvedLabel = label || nearestPlaceName(safePoint) || defaultPointLabel(resolvedMarkerType);

    if (resolvedType === 'start') {
      setStartPointState(safePoint);
      setStartNameState(resolvedLabel);
      setPinMarker(startMarkerRef, safePoint, resolvedMarkerType, resolvedLabel);
    } else {
      setEndPointState(safePoint);
      setEndNameState(resolvedLabel);
      setPinMarker(pickupMarkerRef, safePoint, resolvedMarkerType, resolvedLabel);
    }
  }, [nearestPlaceName, setPinMarker]);

  const applySearchSelection = useCallback((type, place) => {
    if (!place || !mapRef.current) {
      return;
    }
    clearPlannedRoute();
    stopNavigation({ preserveProgress: false });
    const point = { lat: Number(place.lat), lng: Number(place.lng) };
    setRouteSetupPoint(type, point, place.name, type);
    mapRef.current.flyTo([point.lat, point.lng], Math.max(mapRef.current.getZoom(), 14), {
      animate: true,
      duration: 0.45
    });
    if (type === 'start') {
      setStartSearchQuery(place.name);
      setStartSearchResults([]);
    } else {
      setEndSearchQuery(place.name);
      setEndSearchResults([]);
    }
  }, [clearPlannedRoute, setRouteSetupPoint, stopNavigation]);

  const chooseTopSearchResult = useCallback((type) => {
    const query = type === 'start' ? startSearchQuery : endSearchQuery;
    const topMatch = searchPlacesByName(query, 1)[0];
    if (!topMatch) {
      if (type === 'start') {
        setStartSearchResults([]);
      } else {
        setEndSearchResults([]);
      }
      return;
    }
    applySearchSelection(type, topMatch);
  }, [applySearchSelection, endSearchQuery, searchPlacesByName, startSearchQuery]);

  const selectSearchResult = useCallback((type, index) => {
    const list = type === 'start' ? startSearchResults : endSearchResults;
    const numericIndex = Number(index);
    if (!Array.isArray(list) || !Number.isFinite(numericIndex) || !list[numericIndex]) {
      return;
    }
    applySearchSelection(type, list[numericIndex]);
  }, [applySearchSelection, endSearchResults, startSearchResults]);

  const setRoute = useCallback(({
    coords,
    steps,
    distanceMeters,
    timeSeconds,
    stageLabel,
    startLabel,
    endLabel,
    legIndex
  }) => {
    if (!mapRef.current || !Array.isArray(coords) || coords.length < 2) {
      return false;
    }

    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
    }
    routeLayerRef.current = L.polyline(coords, {
      color: '#2f6eff',
      weight: 5,
      opacity: 0.9
    }).addTo(mapRef.current);
    const currentBounds = routeLayerRef.current.getBounds();
    const shouldShowFullPlannedRoute = plannedPointsRef.current.length > 2;
    if (shouldShowFullPlannedRoute && routePreviewLayerRef.current?.getBounds) {
      const previewBounds = routePreviewLayerRef.current.getBounds();
      if (previewBounds?.isValid?.()) {
        const mergedBounds = L.latLngBounds(previewBounds);
        if (currentBounds?.isValid?.()) {
          mergedBounds.extend(currentBounds);
        }
        mapRef.current.fitBounds(mergedBounds.pad(0.16), { animate: false });
      } else if (currentBounds?.isValid?.()) {
        mapRef.current.fitBounds(currentBounds.pad(0.2), { animate: false });
      }
    } else if (currentBounds?.isValid?.()) {
      mapRef.current.fitBounds(currentBounds.pad(0.2), { animate: false });
    }
    routeLayerRef.current.bringToFront();

    if (moverMarkerRef.current) {
      mapRef.current.removeLayer(moverMarkerRef.current);
    }
    moverMarkerRef.current = L.circleMarker(coords[0], {
      radius: 7,
      color: '#1c1a17',
      weight: 2,
      fillColor: '#2f6eff',
      fillOpacity: 0.95
    }).addTo(mapRef.current);

    routeCoordsRef.current = coords;
    routeStepsRef.current = Array.isArray(steps) ? steps : [];
    const segmentInfo = buildSegments(coords);
    routeSegmentsRef.current = segmentInfo.segments;
    routeTotalMetersRef.current = Number.isFinite(distanceMeters) ? distanceMeters : segmentInfo.total;
    routeTotalSecondsRef.current = Number.isFinite(timeSeconds) ? timeSeconds : null;
    navDistanceTravelledRef.current = 0;
    activeStepIndexRef.current = routeStepsRef.current.length > 0 ? 0 : -1;
    awaitingAdvanceRef.current = false;

    const totalLegs = Math.max(0, plannedPointsRef.current.length - 1);
    onRouteLoaded?.({
      routeCoords: routeCoordsRef.current,
      steps: routeStepsRef.current,
      totalDistanceMeters: routeTotalMetersRef.current,
      totalTimeSeconds: routeTotalSecondsRef.current,
      stageLabel,
      startLabel,
      endLabel,
      legIndex,
      totalLegs
    });
    onActiveStepIndexChange?.(activeStepIndexRef.current);
    updateRouteProgress(0);
    reportPosition('simulated', {
      lat: Number(coords[0][0]),
      lng: Number(coords[0][1])
    }, false);
    return true;
  }, [onActiveStepIndexChange, onRouteLoaded, reportPosition, updateRouteProgress]);

  const fetchLegRoute = useCallback(async (fromPoint, toPointValue, legIndex = -1) => {
    const fallbackCoords = [
      [Number(fromPoint.lat), Number(fromPoint.lng)],
      [Number(toPointValue.lat), Number(toPointValue.lng)]
    ];
    await ensurePlacesLoaded();
    const normalizedRouteGeometry = normalizeRouteGeometry(navPayload?.routeGeometry);
    const shouldUseLegGeometry = Boolean(
      Number.isFinite(legIndex)
      && Number(legIndex) >= 0
      && normalizedRouteGeometry
    );

    if (shouldUseLegGeometry) {
      const legTargetCoords = extractLegGeometryCoordinates({
        normalizedRouteGeometry,
        legIndex: Number(legIndex),
        startPoint: fromPoint,
        endPoint: toPointValue
      });
      if (Array.isArray(legTargetCoords) && legTargetCoords.length >= 2) {
        const alignedCoords = legTargetCoords.slice();
        const first = alignedCoords[0];
        const last = alignedCoords[alignedCoords.length - 1];
        const firstPoint = Array.isArray(first)
          ? { lat: Number(first[0]), lng: Number(first[1]) }
          : null;
        const lastPoint = Array.isArray(last)
          ? { lat: Number(last[0]), lng: Number(last[1]) }
          : null;
        if (
          firstPoint
          && Number.isFinite(firstPoint.lat)
          && Number.isFinite(firstPoint.lng)
          && haversineMeters(
            { lat: Number(fromPoint.lat), lng: Number(fromPoint.lng) },
            firstPoint
          ) > 18
        ) {
          alignedCoords.unshift([Number(fromPoint.lat), Number(fromPoint.lng)]);
        }
        if (
          lastPoint
          && Number.isFinite(lastPoint.lat)
          && Number.isFinite(lastPoint.lng)
          && haversineMeters(
            { lat: Number(toPointValue.lat), lng: Number(toPointValue.lng) },
            lastPoint
          ) > 18
        ) {
          alignedCoords.push([Number(toPointValue.lat), Number(toPointValue.lng)]);
        }

        const distanceMeters = polylineDistanceMeters(alignedCoords);
        return {
          coords: alignedCoords,
          distanceMeters,
          timeSeconds: distanceMeters > 0 ? ((distanceMeters / 1000) / Math.max(5, Number(speedLimit) || 30)) * 3600 : 0,
          steps: buildDirections(alignedCoords, {
            resolveAreaName: nearestPlaceName
          })
        };
      }
    }

    const roadsReady = await ensureRoadGraphLoaded();
    if (roadsReady) {
      const startKey = findNearestNode({ lat: Number(fromPoint.lat), lng: Number(fromPoint.lng) });
      const endKey = findNearestNode({ lat: Number(toPointValue.lat), lng: Number(toPointValue.lng) });
      let resolvedPath = null;
      let directGraphPath = null;
      let directGraphPathComputed = false;
      const getDirectGraphPath = () => {
        if (!startKey || !endKey) {
          return null;
        }
        if (!directGraphPathComputed) {
          directGraphPath = shortestPath(startKey, endKey);
          directGraphPathComputed = true;
        }
        return directGraphPath;
      };

      const shouldUseConstrainedPath = Boolean(
        Number.isFinite(legIndex)
        && Number(legIndex) >= 0
        && normalizedRouteGeometry
      );

      if (shouldUseConstrainedPath && startKey && endKey) {
        const legTargetCoords = extractLegGeometryCoordinates({
          normalizedRouteGeometry,
          legIndex: Number(legIndex),
          startPoint: fromPoint,
          endPoint: toPointValue
        });
        if (Array.isArray(legTargetCoords) && legTargetCoords.length >= 2) {
          const targetLegDistanceMeters = polylineDistanceMeters(legTargetCoords);
          const sampledCoords = downsampleRouteCoordinates(legTargetCoords, 55, 120);
          const checkpointNodeKeys = sampledCoords
            .map((coord) => findNearestNode({ lat: Number(coord[0]), lng: Number(coord[1]) }))
            .filter((key) => Boolean(key));
          const orderedNodeKeys = [];
          const seenNodeKeys = new Set();
          [startKey, ...checkpointNodeKeys, endKey].forEach((nodeKeyValue, index, list) => {
            if (!nodeKeyValue) {
              return;
            }
            const previousKey = orderedNodeKeys[orderedNodeKeys.length - 1];
            if (previousKey === nodeKeyValue) {
              return;
            }
            const isBoundaryKey = index === 0 || index === list.length - 1;
            if (!isBoundaryKey && seenNodeKeys.has(nodeKeyValue)) {
              return;
            }
            orderedNodeKeys.push(nodeKeyValue);
            seenNodeKeys.add(nodeKeyValue);
          });
          if (orderedNodeKeys[orderedNodeKeys.length - 1] !== endKey) {
            orderedNodeKeys.push(endKey);
          }

          if (orderedNodeKeys.length >= 2) {
            let stitchedCoords = [];
            let stitchedStreetNames = [];
            let stitchedDistanceMeters = 0;
            let stitchedSuccess = true;

            for (let index = 0; index < orderedNodeKeys.length - 1; index += 1) {
              const fromNodeKey = orderedNodeKeys[index];
              const toNodeKey = orderedNodeKeys[index + 1];
              if (!fromNodeKey || !toNodeKey || fromNodeKey === toNodeKey) {
                continue;
              }
              const partialPath = shortestPath(fromNodeKey, toNodeKey);
              if (!partialPath || !Array.isArray(partialPath.coords) || partialPath.coords.length < 2) {
                stitchedSuccess = false;
                break;
              }
              stitchedDistanceMeters += Number(partialPath.distanceMeters) || 0;
              stitchedStreetNames.push(...(Array.isArray(partialPath.segmentStreetNames) ? partialPath.segmentStreetNames : []));
              if (stitchedCoords.length <= 0) {
                stitchedCoords = partialPath.coords.slice();
              } else {
                stitchedCoords.push(...partialPath.coords.slice(1));
              }
            }

            if (stitchedSuccess && stitchedCoords.length >= 2) {
              const constrainedPath = {
                coords: stitchedCoords,
                distanceMeters: stitchedDistanceMeters,
                segmentStreetNames: stitchedStreetNames
              };
              const targetDistance = Math.max(1, Number(targetLegDistanceMeters) || 0);
              const constrainedDistance = Math.max(0, Number(constrainedPath.distanceMeters) || 0);
              const constrainedTooLong = targetDistance > 0
                ? constrainedDistance > targetDistance * 1.85
                : false;
              if (!constrainedTooLong) {
                resolvedPath = constrainedPath;
              }
            }
          }
        }
      }

      if (!resolvedPath) {
        const graphPath = getDirectGraphPath();
        if (graphPath && Array.isArray(graphPath.coords) && graphPath.coords.length >= 2) {
          resolvedPath = graphPath;
        }
      } else if (shouldUseConstrainedPath) {
        const graphPath = getDirectGraphPath();
        const constrainedDistance = Math.max(0, Number(resolvedPath.distanceMeters) || 0);
        const directDistance = Math.max(0, Number(graphPath?.distanceMeters) || 0);
        const constrainedTooLong = directDistance > 0 && constrainedDistance > directDistance * 1.65;
        if (constrainedTooLong && graphPath && Array.isArray(graphPath.coords) && graphPath.coords.length >= 2) {
          resolvedPath = graphPath;
        }
      }

      if (resolvedPath && Array.isArray(resolvedPath.coords) && resolvedPath.coords.length >= 2) {
        const distanceMeters = Number(resolvedPath.distanceMeters) || 0;
        return {
          coords: resolvedPath.coords,
          distanceMeters,
          timeSeconds: distanceMeters > 0 ? ((distanceMeters / 1000) / Math.max(5, Number(speedLimit) || 30)) * 3600 : 0,
          steps: buildDirections(resolvedPath.coords, {
            segmentStreetNames: resolvedPath.segmentStreetNames,
            resolveAreaName: nearestPlaceName
          })
        };
      }
    }
    const distanceMeters = haversineMeters(fromPoint, toPointValue);
    return {
      coords: fallbackCoords,
      distanceMeters,
      timeSeconds: distanceMeters > 0 ? ((distanceMeters / 1000) / Math.max(5, Number(speedLimit) || 30)) * 3600 : 0,
      steps: buildDirections(fallbackCoords, {
        resolveAreaName: nearestPlaceName
      })
    };
  }, [ensurePlacesLoaded, ensureRoadGraphLoaded, findNearestNode, navPayload?.routeGeometry, nearestPlaceName, shortestPath, speedLimit]);

  const calculateManualRoute = useCallback(async () => {
    const startPoint = startPointRef.current;
    const endPoint = endPointRef.current;
    if (!startPoint || !endPoint) {
      onRouteLoaded?.({
        routeCoords: routeCoordsRef.current,
        steps: routeStepsRef.current,
        totalDistanceMeters: routeTotalMetersRef.current,
        totalTimeSeconds: routeTotalSecondsRef.current,
        stageLabel: 'Choose start and destination points first.',
        startLabel: startNameState || '',
        endLabel: endNameState || '',
        legIndex: plannedLegIndexRef.current,
        totalLegs: Math.max(0, plannedPointsRef.current.length - 1)
      });
      return;
    }
    clearPlannedRoute();
    stopNavigation({ preserveProgress: false });
    const manualRoute = await fetchLegRoute(startPoint, endPoint);
    const startLabel = startNameState || defaultPointLabel('start');
    const endLabel = endNameState || defaultPointLabel('end');
    setRoute({
      coords: manualRoute.coords,
      steps: manualRoute.steps,
      distanceMeters: manualRoute.distanceMeters,
      timeSeconds: manualRoute.timeSeconds,
      stageLabel: 'Single route loaded',
      startLabel,
      endLabel,
      legIndex: -1
    });
    setPickMode(null);
    setPickStartThenEnd(false);
    setPickOptionsOpen(false);
  }, [
    clearPlannedRoute,
    endNameState,
    fetchLegRoute,
    onRouteLoaded,
    setRoute,
    startNameState,
    stopNavigation
  ]);

  const clearManualRoute = useCallback(() => {
    clearPlannedRoute();
    stopNavigation({ clearRoute: true, preserveProgress: false });
    if (mapRef.current) {
      if (startMarkerRef.current) {
        mapRef.current.removeLayer(startMarkerRef.current);
      }
      if (pickupMarkerRef.current) {
        mapRef.current.removeLayer(pickupMarkerRef.current);
      }
    }
    startMarkerRef.current = null;
    pickupMarkerRef.current = null;
    setStartPointState(null);
    setEndPointState(null);
    setStartNameState('');
    setEndNameState('');
    setStartSearchQuery('');
    setEndSearchQuery('');
    setStartSearchResults([]);
    setEndSearchResults([]);
    setPickMode(null);
    setPickStartThenEnd(false);
    setPickOptionsOpen(false);
    onRouteLoaded?.({
      routeCoords: [],
      steps: [],
      totalDistanceMeters: 0,
      totalTimeSeconds: 0,
      stageLabel: 'Manual route mode',
      startLabel: '',
      endLabel: '',
      legIndex: -1,
      totalLegs: 0
    });
  }, [clearPlannedRoute, onRouteLoaded, stopNavigation]);

  const loadLeg = useCallback(async (legIndex, autoStart = false) => {
    const points = plannedPointsRef.current;
    const labels = plannedLabelsRef.current;
    const kinds = plannedKindsRef.current;
    if (!Array.isArray(points) || points.length < 2 || !points[legIndex] || !points[legIndex + 1]) {
      return false;
    }

    const startPoint = points[legIndex];
    const endPoint = points[legIndex + 1];
    const startLabel = labels[legIndex]
      || (legIndex > 0 ? (labels[legIndex - 1] || '') : '')
      || 'Current leg start';
    const endLabel = labels[legIndex + 1] || 'Next stop';
    const startKind = kinds[legIndex] || normalizePlannedStopKind('', legIndex, startLabel);
    const endKind = kinds[legIndex + 1] || normalizePlannedStopKind('', legIndex + 1, endLabel);

    plannedLegIndexRef.current = legIndex;
    stopNavigation({ preserveProgress: false });

    setStartPointState({ lat: Number(startPoint.lat), lng: Number(startPoint.lng) });
    setEndPointState({ lat: Number(endPoint.lat), lng: Number(endPoint.lng) });
    setStartNameState(startLabel);
    setEndNameState(endLabel);
    setPickMode(null);
    setPickStartThenEnd(false);
    setPickOptionsOpen(false);

    setPinMarker(startMarkerRef, startPoint, markerVisualTypeForStopKind(startKind, 'start'), startLabel);
    setPinMarker(pickupMarkerRef, endPoint, markerVisualTypeForStopKind(endKind, 'end'), endLabel);

    const legRoute = await fetchLegRoute(startPoint, endPoint, legIndex);
    const totalLegs = Math.max(1, points.length - 1);
    const stageLabel = `Leg ${legIndex + 1} of ${totalLegs}: ${endLabel}`;
    const setResult = setRoute({
      coords: legRoute.coords,
      steps: legRoute.steps,
      distanceMeters: legRoute.distanceMeters,
      timeSeconds: legRoute.timeSeconds,
      stageLabel,
      startLabel,
      endLabel,
      legIndex
    });
    if (!setResult) {
      return false;
    }

    emitMessage({
      type: 'courier-nav/leg-loaded',
      legIndex,
      totalLegs,
      label: endLabel,
      legDistanceMeters: Number(legRoute?.distanceMeters) || 0,
      legTimeSeconds: Number(legRoute?.timeSeconds) || 0
    });

    if (autoStart) {
      window.requestAnimationFrame(() => {
        if (mapRef.current) {
          // Deferred to ensure map/markers paint before animation.
          ref?.current?.startNavigation?.();
        }
      });
    }
    return true;
  }, [emitMessage, fetchLegRoute, ref, setPinMarker, setRoute, stopNavigation]);

  const loadNextLeg = useCallback(async (startLegIndex = 0, autoStart = false) => {
    const points = plannedPointsRef.current;
    if (!Array.isArray(points) || points.length < 2) {
      return false;
    }
    const totalLegs = points.length - 1;
    for (let legIndex = Math.max(0, startLegIndex); legIndex < totalLegs; legIndex += 1) {
      // eslint-disable-next-line no-await-in-loop
      const legLoaded = await loadLeg(legIndex, autoStart);
      if (legLoaded) {
        return true;
      }
    }
    clearPersistedNavRuntime();
    emitMessage({
      type: 'courier-nav/route-complete',
      totalLegs
    });
    return false;
  }, [clearPersistedNavRuntime, emitMessage, loadLeg]);

  const startNavigation = useCallback(() => {
    if (awaitingAdvanceRef.current) {
      return;
    }
    const coords = routeCoordsRef.current;
    const segments = routeSegmentsRef.current;
    const totalDistance = routeTotalMetersRef.current;
    if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(segments) || segments.length <= 0) {
      return;
    }

    clearSimulation();
    autoStartPlannedLegRef.current = true;

    const speedKmh = speedLimitRef.current;
    const initialDistance = navDistanceTravelledRef.current > 0
      ? navDistanceTravelledRef.current
      : 0;
    navStateRef.current = {
      distanceMeters: Math.max(0, Math.min(totalDistance, initialDistance)),
      speedMps: (speedKmh * 1000) / 3600,
      lastTickMs: performance.now()
    };
    onSimulationChange?.(true);

    emitMessage({
      type: 'courier-nav/navigation-start',
      legIndex: plannedLegIndexRef.current,
      totalLegs: plannedPointsRef.current.length >= 2 ? plannedPointsRef.current.length - 1 : null
    });
    persistNavRuntime(true);

    renderNavigationDistance(navStateRef.current.distanceMeters, true);

    const tick = (now) => {
      if (!navStateRef.current) {
        return;
      }
      const deltaSeconds = Math.max(0, (now - navStateRef.current.lastTickMs) / 1000);
      navStateRef.current.lastTickMs = now;
      const liveSpeedMps = (speedLimitRef.current * 1000) / 3600;
      navStateRef.current.speedMps = liveSpeedMps;
      navStateRef.current.distanceMeters = Math.min(
        routeTotalMetersRef.current,
        navStateRef.current.distanceMeters + (liveSpeedMps * deltaSeconds)
      );
      renderNavigationDistance(navStateRef.current.distanceMeters, true);

      if (navStateRef.current.distanceMeters >= routeTotalMetersRef.current) {
        const endpoint = routeCoordsRef.current[routeCoordsRef.current.length - 1];
        const endpointPoint = Array.isArray(endpoint)
          ? { lat: Number(endpoint[0]), lng: Number(endpoint[1]) }
          : null;
        awaitingAdvanceRef.current = true;
        stopNavigation({ preserveProgress: false });
        if (endpointPoint) {
          reportPosition('simulated', endpointPoint, false);
        }
        const totalLegs = plannedPointsRef.current.length >= 2 ? plannedPointsRef.current.length - 1 : null;
        emitMessage({
          type: 'courier-nav/leg-reached',
          legIndex: plannedLegIndexRef.current,
          totalLegs,
          lat: endpointPoint ? endpointPoint.lat : null,
          lng: endpointPoint ? endpointPoint.lng : null
        });
        return;
      }

      simTimerRef.current = window.requestAnimationFrame(tick);
    };

    simTimerRef.current = window.requestAnimationFrame(tick);
  }, [
    clearSimulation,
    emitMessage,
    onSimulationChange,
    renderNavigationDistance,
    reportPosition,
    persistNavRuntime,
    stopNavigation
  ]);

  const handleMessage = useCallback(async (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'courier-nav/settings') {
      gpsModeEnabledRef.current = Boolean(message.useGps);
      if (!gpsModeEnabledRef.current && gpsMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(gpsMarkerRef.current);
        gpsMarkerRef.current = null;
      }
      return;
    }

    if (message.type === 'courier-nav/gps-update') {
      if (!gpsModeEnabledRef.current || !mapRef.current) {
        return;
      }
      const point = toPoint({ lat: message.lat, lng: message.lng });
      if (!point) {
        return;
      }
      if (!gpsMarkerRef.current) {
        gpsMarkerRef.current = L.circleMarker([point.lat, point.lng], {
          radius: 7,
          color: '#16a34a',
          weight: 2,
          fillColor: '#22c55e',
          fillOpacity: 0.82
        }).addTo(mapRef.current);
      } else {
        gpsMarkerRef.current.setLatLng([point.lat, point.lng]);
      }
      emitMessage({
        type: 'courier-nav/position',
        source: 'gps',
        lat: Number(point.lat.toFixed(6)),
        lng: Number(point.lng.toFixed(6)),
        legIndex: plannedLegIndexRef.current
      });
      return;
    }

    if (message.type === 'courier-nav/advance-leg') {
      const nextLeg = plannedLegIndexRef.current >= 0 ? plannedLegIndexRef.current + 1 : 0;
      awaitingAdvanceRef.current = false;
      autoStartPlannedLegRef.current = false;
      await loadNextLeg(nextLeg, false);
    }
  }, [emitMessage, loadNextLeg]);

  const handlePickStart = useCallback(() => {
    clearPlannedRoute();
    setPickOptionsOpen(false);
    setPickStartThenEnd(false);
    setPickMode('start');
  }, [clearPlannedRoute]);

  const handlePickEnd = useCallback(() => {
    clearPlannedRoute();
    setPickOptionsOpen(false);
    setPickStartThenEnd(false);
    setPickMode('end');
  }, [clearPlannedRoute]);

  const handlePickBoth = useCallback(() => {
    clearPlannedRoute();
    setPickOptionsOpen(false);
    setPickStartThenEnd(true);
    setPickMode('start');
  }, [clearPlannedRoute]);

  const handleTogglePickOptions = useCallback(() => {
    const willOpen = !pickOptionsOpen;
    setPickOptionsOpen(willOpen);
    setPickStartThenEnd(false);
    setPickMode(null);
  }, [pickOptionsOpen]);

  const handleClosePickOptions = useCallback(() => {
    setPickOptionsOpen(false);
    setPickStartThenEnd(false);
    setPickMode(null);
  }, []);

  useEffect(() => {
    ensurePlacesLoaded();
  }, [ensurePlacesLoaded]);

  useEffect(() => {
    refreshSearchResults('start', startSearchQuery);
  }, [refreshSearchResults, startSearchQuery]);

  useEffect(() => {
    refreshSearchResults('end', endSearchQuery);
  }, [endSearchQuery, refreshSearchResults]);

  useEffect(() => {
    if (typeof onRouteSetupStateChange !== 'function') {
      return;
    }
    let pickHelpText = 'Click Pick on map to choose how you want to pick.';
    if (pickMode) {
      if (pickMode === 'start') {
        pickHelpText = pickStartThenEnd
          ? 'Step 1: click map to set START point.'
          : 'Click map to set START point.';
      } else {
        pickHelpText = pickStartThenEnd
          ? 'Step 2: click map to set DESTINATION point.'
          : 'Click map to set DESTINATION point.';
      }
    } else if (pickOptionsOpen) {
      pickHelpText = 'Choose an option, then click on the map.';
    }

    onRouteSetupStateChange({
      startName: startNameState || '',
      startCoords: startPointState ? `Coordinates: ${formatInputPoint(startPointState)}` : 'Coordinates: -',
      endName: endNameState || '',
      endCoords: endPointState ? `Coordinates: ${formatInputPoint(endPointState)}` : 'Coordinates: -',
      startSearchQuery,
      endSearchQuery,
      startSearchResults,
      endSearchResults,
      pickOptionsOpen,
      pickMode,
      pickStartThenEnd,
      pickHelpText,
      placesReady
    });
  }, [
    endNameState,
    endPointState,
    endSearchQuery,
    endSearchResults,
    onRouteSetupStateChange,
    pickMode,
    pickOptionsOpen,
    pickStartThenEnd,
    placesReady,
    startNameState,
    startPointState,
    startSearchQuery,
    startSearchResults
  ]);

  useEffect(() => {
    if (!mapRef.current) {
      return undefined;
    }
    const handleMapClick = (event) => {
      const activePickMode = pickModeRef.current;
      if (!activePickMode) {
        return;
      }
      const lat = roundCoord(Number(event?.latlng?.lat), 5);
      const lng = roundCoord(Number(event?.latlng?.lng), 5);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      if (plannedPointsRef.current.length > 0) {
        clearPlannedRoute();
      }
      const point = { lat, lng };
      const continueToDestination = pickStartThenEndRef.current && activePickMode === 'start';
      const autoCompute = pickStartThenEndRef.current && activePickMode === 'end';

      if (activePickMode === 'start') {
        setRouteSetupPoint('start', point);
      } else if (activePickMode === 'end') {
        setRouteSetupPoint('end', point);
      }

      if (continueToDestination) {
        setPickMode('end');
        return;
      }

      setPickStartThenEnd(false);
      setPickMode(null);
      if (autoCompute) {
        calculateManualRoute();
      }
    };

    mapRef.current.on('click', handleMapClick);
    return () => {
      mapRef.current?.off('click', handleMapClick);
    };
  }, [calculateManualRoute, clearPlannedRoute, setRouteSetupPoint]);

  const recenterOnActivePoint = useCallback(() => {
    if (!mapRef.current) {
      return;
    }
    let point = null;
    if (moverMarkerRef.current?.getLatLng) {
      point = moverMarkerRef.current.getLatLng();
    } else if (gpsMarkerRef.current?.getLatLng) {
      point = gpsMarkerRef.current.getLatLng();
    } else if (startMarkerRef.current?.getLatLng) {
      point = startMarkerRef.current.getLatLng();
    }
    if (!point) {
      return;
    }
    mapRef.current.panTo([point.lat, point.lng], { animate: true, duration: 0.45 });
  }, []);

  const fitRouteInView = useCallback(() => {
    if (!mapRef.current) {
      return;
    }
    if (routePreviewLayerRef.current?.getBounds) {
      const previewBounds = routePreviewLayerRef.current.getBounds();
      if (previewBounds?.isValid?.()) {
        mapRef.current.fitBounds(previewBounds.pad(0.16), { animate: false });
        return;
      }
    }
    if (routeLayerRef.current?.getBounds) {
      mapRef.current.fitBounds(routeLayerRef.current.getBounds().pad(0.2), { animate: false });
      return;
    }
    if (startMarkerRef.current?.getLatLng && pickupMarkerRef.current?.getLatLng) {
      const bounds = L.latLngBounds(startMarkerRef.current.getLatLng(), pickupMarkerRef.current.getLatLng());
      mapRef.current.fitBounds(bounds.pad(0.22), { animate: false });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    handleMessage,
    startNavigation,
    stopNavigation,
    recenterOnActivePoint,
    fitRouteInView,
    setStartSearchQuery,
    setEndSearchQuery,
    chooseTopSearchResult,
    selectSearchResult,
    togglePickOptions: handleTogglePickOptions,
    pickStart: handlePickStart,
    pickEnd: handlePickEnd,
    pickBoth: handlePickBoth,
    closePickOptions: handleClosePickOptions,
    calculateRoute: calculateManualRoute,
    clearRoute: clearManualRoute
  }), [
    calculateManualRoute,
    chooseTopSearchResult,
    clearManualRoute,
    fitRouteInView,
    handleClosePickOptions,
    handleMessage,
    handlePickBoth,
    handlePickEnd,
    handlePickStart,
    handleTogglePickOptions,
    recenterOnActivePoint,
    selectSearchResult,
    setEndSearchQuery,
    setStartSearchQuery,
    startNavigation,
    stopNavigation
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistNavRuntime(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistNavRuntime(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [persistNavRuntime]);

  useEffect(() => {
    if (!mapContainerNodeRef.current || mapRef.current) {
      return undefined;
    }
    const map = L.map(mapContainerNodeRef.current, { zoomControl: true });
    map.setView(DEFAULT_VIEW, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    mapRef.current = map;
    return () => {
      clearSimulation();
      if (mapRef.current) {
        mapRef.current.stop?.();
        mapRef.current.off();
        mapRef.current.remove();
      }
      mapRef.current = null;
      roadLayerRef.current = null;
      routeLayerRef.current = null;
      routePreviewLayerRef.current = null;
      startMarkerRef.current = null;
      pickupMarkerRef.current = null;
      branchMarkersRef.current = [];
      moverMarkerRef.current = null;
      gpsMarkerRef.current = null;
      roadsReadyRef.current = false;
      roadGraphRef.current = null;
      roadNodesRef.current = null;
      roadGridRef.current = null;
      roadLoadPromiseRef.current = null;
      placeIndexRef.current = [];
      placeCacheRef.current.clear();
      placesLoadPromiseRef.current = null;
    };
  }, [clearSimulation]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    ensureRoadGraphLoaded();
  }, [ensureRoadGraphLoaded]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    gpsModeEnabledRef.current = Boolean(useGpsTracking);
    if (!gpsModeEnabledRef.current && gpsMarkerRef.current) {
      mapRef.current.removeLayer(gpsMarkerRef.current);
      gpsMarkerRef.current = null;
      return;
    }
    const point = toPoint(gpsLocation);
    if (!gpsModeEnabledRef.current || !point) {
      return;
    }
    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.circleMarker([point.lat, point.lng], {
        radius: 7,
        color: '#16a34a',
        weight: 2,
        fillColor: '#22c55e',
        fillOpacity: 0.82
      }).addTo(mapRef.current);
    } else {
      gpsMarkerRef.current.setLatLng([point.lat, point.lng]);
    }
  }, [gpsLocation, useGpsTracking]);

  useEffect(() => {
    const { points, labels, stopKinds } = extractPlannedData(navPayload);
    const routeSignature = buildPlannedRouteSignature(points);
    const persistedRuntime = routeSignature ? readPersistedNavRuntime() : null;
    let restoreLegIndex = 0;
    let restoreDistance = 0;
    let shouldResumeNavigation = false;
    let shouldAwaitConfirm = false;
    if (persistedRuntime && persistedRuntime.routeSignature === routeSignature) {
      const runtimeLegIndex = Number(persistedRuntime.legIndex);
      if (Number.isFinite(runtimeLegIndex) && runtimeLegIndex >= 0) {
        restoreLegIndex = runtimeLegIndex;
      }
      const runtimeDistance = Number(persistedRuntime.distanceMeters);
      if (Number.isFinite(runtimeDistance) && runtimeDistance > 0) {
        restoreDistance = runtimeDistance;
      }
      shouldResumeNavigation = Boolean(persistedRuntime.isRunning);
      shouldAwaitConfirm = Boolean(persistedRuntime.awaitingConfirm);
    } else if (persistedRuntime) {
      clearPersistedNavRuntime();
    }

    plannedPointsRef.current = points;
    plannedLabelsRef.current = labels;
    plannedKindsRef.current = stopKinds;
    plannedLegIndexRef.current = -1;
    awaitingAdvanceRef.current = false;
    autoStartPlannedLegRef.current = false;
    navDistanceTravelledRef.current = 0;
    clearSimulation();
    if (!mapRef.current) {
      return;
    }
    branchMarkersRef.current.forEach((marker) => {
      mapRef.current.removeLayer(marker);
    });
    branchMarkersRef.current = [];
    points.forEach((point, index) => {
      if (String(stopKinds[index] || '').toLowerCase() !== 'branch') {
        return;
      }
      const label = labels[index] || 'Branch';
      const marker = L.marker([Number(point.lat), Number(point.lng)], {
        icon: createPinIcon('branch'),
        title: label
      }).addTo(mapRef.current);
      marker.bindTooltip(label, { direction: 'top', offset: [0, -10] });
      branchMarkersRef.current.push(marker);
    });
    setRoutePreview(extractPlannedPreviewGeometry(navPayload, points));
    initSeqRef.current += 1;
    const seq = initSeqRef.current;
    if (points.length < 2) {
      stopNavigation({ clearRoute: true, preserveProgress: false });
      return;
    }
    const startLoad = async () => {
      const loaded = await loadNextLeg(restoreLegIndex, false);
      if (seq !== initSeqRef.current) {
        return;
      }

      if (!loaded) {
        mapRef.current?.invalidateSize(false);
        return;
      }

      if (restoreDistance > 0 && routeTotalMetersRef.current > 0) {
        const clampedDistance = Math.max(0, Math.min(routeTotalMetersRef.current, restoreDistance));
        navDistanceTravelledRef.current = clampedDistance;
        renderNavigationDistance(clampedDistance, false);
        persistNavRuntime(true);
      }

      if (shouldAwaitConfirm && routeTotalMetersRef.current > 0) {
        awaitingAdvanceRef.current = true;
        persistNavRuntime(true);
      } else if (
        shouldResumeNavigation
        && routeTotalMetersRef.current > 0
        && navDistanceTravelledRef.current < routeTotalMetersRef.current - 0.5
      ) {
        startNavigation();
      }

      mapRef.current?.invalidateSize(false);
    };
    startLoad();
  }, [
    clearPersistedNavRuntime,
    clearSimulation,
    loadNextLeg,
    navPayload,
    persistNavRuntime,
    readPersistedNavRuntime,
    renderNavigationDistance,
    setRoutePreview,
    startNavigation,
    stopNavigation
  ]);

  return <div ref={mapContainerNodeRef} className="nav-map" />;
});

NavigationMap.displayName = 'NavigationMap';

export default NavigationMap;
