import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../../../components/AppIcon';

const MOVING_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'linehaul_assigned',
  'linehaul_load_confirmed',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);
const DEFAULT_CENTER = [27.7172, 85.3240];
const ROAD_DATA_URL = '/mapnav/data/roads_major.geojson';

let roadGraphCachePromise = null;

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
      if ((this.items[parent]?.priority ?? Infinity) <= (this.items[index]?.priority ?? Infinity)) {
        break;
      }
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop() {
    if (!this.items.length) {
      return null;
    }
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

      if (left < length && (this.items[left]?.priority ?? Infinity) < (this.items[smallest]?.priority ?? Infinity)) {
        smallest = left;
      }
      if (right < length && (this.items[right]?.priority ?? Infinity) < (this.items[smallest]?.priority ?? Infinity)) {
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

const roundCoord = (value, decimals = 5) => Number(Number(value).toFixed(decimals));
const nodeKey = (lon, lat) => `${lon},${lat}`;
const toRadians = (value) => (Number(value) * Math.PI) / 180;
const haversineMeters = (a, b) => {
  const earthRadius = 6371000;
  const dLat = toRadians(Number(b.lat) - Number(a.lat));
  const dLon = toRadians(Number(b.lon) - Number(a.lon));
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const arc = (Math.sin(dLat / 2) ** 2)
    + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.sqrt(arc));
};

const addEdge = (graph, from, to, dist) => {
  if (!graph.has(from)) {
    graph.set(from, []);
  }
  graph.get(from).push({ to, dist });
};

const buildRoadGraph = (geojson) => {
  const graph = new Map();
  const nodes = new Map();
  const grid = new Map();

  const addNode = (lon, lat) => {
    const lonRounded = roundCoord(lon);
    const latRounded = roundCoord(lat);
    const key = nodeKey(lonRounded, latRounded);
    if (!nodes.has(key)) {
      nodes.set(key, { lon: lonRounded, lat: latRounded });
      const cellKey = `${Math.floor(latRounded * 100)}:${Math.floor(lonRounded * 100)}`;
      if (!grid.has(cellKey)) {
        grid.set(cellKey, []);
      }
      grid.get(cellKey).push(key);
    }
    return key;
  };

  const addLine = (coords) => {
    if (!Array.isArray(coords) || coords.length < 2) {
      return;
    }
    for (let i = 0; i < coords.length - 1; i += 1) {
      const fromCoord = coords[i];
      const toCoord = coords[i + 1];
      const lon1 = Number(fromCoord?.[0]);
      const lat1 = Number(fromCoord?.[1]);
      const lon2 = Number(toCoord?.[0]);
      const lat2 = Number(toCoord?.[1]);
      if (![lon1, lat1, lon2, lat2].every((value) => Number.isFinite(value))) {
        continue;
      }

      const fromKey = addNode(lon1, lat1);
      const toKey = addNode(lon2, lat2);
      const fromNode = nodes.get(fromKey);
      const toNode = nodes.get(toKey);
      const dist = haversineMeters(fromNode, toNode);
      addEdge(graph, fromKey, toKey, dist);
      addEdge(graph, toKey, fromKey, dist);
    }
  };

  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) {
      return;
    }
    if (geometry.type === 'LineString') {
      addLine(geometry.coordinates);
      return;
    }
    if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((line) => addLine(line));
    }
  });

  return { graph, nodes, grid };
};

const loadRoadGraph = async () => {
  if (!roadGraphCachePromise) {
    roadGraphCachePromise = fetch(ROAD_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Road dataset unavailable');
        }
        return response.json();
      })
      .then((data) => buildRoadGraph(data));
  }
  return roadGraphCachePromise;
};

const findNearestNode = (point, nodes, grid) => {
  if (!point || !nodes || !grid) {
    return null;
  }
  const baseLat = Math.floor(Number(point.lat) * 100);
  const baseLon = Math.floor(Number(point.lon) * 100);
  let bestNode = null;
  let bestDist = Infinity;

  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dLat = -radius; dLat <= radius; dLat += 1) {
      for (let dLon = -radius; dLon <= radius; dLon += 1) {
        const cellKey = `${baseLat + dLat}:${baseLon + dLon}`;
        const nodeKeys = grid.get(cellKey);
        if (!nodeKeys) {
          continue;
        }
        nodeKeys.forEach((key) => {
          const node = nodes.get(key);
          if (!node) {
            return;
          }
          const dist = haversineMeters({ lat: point.lat, lon: point.lon }, node);
          if (dist < bestDist) {
            bestDist = dist;
            bestNode = key;
          }
        });
      }
    }
    if (bestNode) {
      break;
    }
  }

  return bestNode;
};

const shortestPathCoords = (startKey, endKey, graph, nodes) => {
  if (!startKey || !endKey || startKey === endKey) {
    return null;
  }

  const distances = new Map();
  const previous = new Map();
  const visited = new Set();
  const heap = new MinHeap();

  distances.set(startKey, 0);
  heap.push({ key: startKey, priority: 0 });

  while (heap.size) {
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

    const currentDist = distances.get(currentKey);
    if (currentDist === undefined) {
      continue;
    }

    const neighbors = graph.get(currentKey) || [];
    neighbors.forEach((edge) => {
      const nextDist = currentDist + Number(edge?.dist || 0);
      const prevBest = distances.get(edge.to);
      if (prevBest === undefined || nextDist < prevBest) {
        distances.set(edge.to, nextDist);
        previous.set(edge.to, currentKey);
        heap.push({ key: edge.to, priority: nextDist });
      }
    });
  }

  if (!distances.has(endKey)) {
    return null;
  }

  const pathKeys = [];
  let cursor = endKey;
  while (cursor) {
    pathKeys.push(cursor);
    cursor = previous.get(cursor);
  }
  pathKeys.reverse();

  const coords = pathKeys
    .map((key) => {
      const node = nodes.get(key);
      if (!node) {
        return null;
      }
      return [Number(node.lat), Number(node.lon)];
    })
    .filter((point) => Boolean(point));

  return coords.length >= 2 ? coords : null;
};

const toLatLng = (point) => {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return [lat, lng];
};

const pointsAreNear = (a, b, epsilon = 0.00001) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return false;
  }
  return Math.abs(Number(a[0]) - Number(b[0])) < epsilon
    && Math.abs(Number(a[1]) - Number(b[1])) < epsilon;
};

const createMarkerIcon = ({ label, color }) => (
  L.divIcon({
    className: 'tracking-marker',
    html: `<div style="width:24px;height:24px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  })
);

const FitBounds = ({ points }) => {
  const map = useMap();
  const lastSignatureRef = useRef('');
  const userAdjustedRef = useRef(false);

  useEffect(() => {
    const markAdjusted = () => {
      userAdjustedRef.current = true;
    };
    map.on('dragstart', markAdjusted);
    map.on('zoomstart', markAdjusted);
    return () => {
      map.off('dragstart', markAdjusted);
      map.off('zoomstart', markAdjusted);
    };
  }, [map]);

  useEffect(() => {
    const signature = (Array.isArray(points) ? points : [])
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) {
          return null;
        }
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return `${lat.toFixed(5)},${lng.toFixed(5)}`;
      })
      .filter((value) => Boolean(value))
      .join('|');
    if (signature && signature === lastSignatureRef.current) {
      return;
    }
    if (userAdjustedRef.current) {
      return;
    }
    lastSignatureRef.current = signature;

    if (!points?.length) {
      map.setView(DEFAULT_CENTER, 12);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);

  return null;
};

const labelForTarget = (targetType, status) => {
  const type = String(targetType || '').trim().toLowerCase();
  const statusCode = String(status || '').trim().toLowerCase();

  if (type === 'pickup') {
    return 'Pickup Point';
  }
  if (type === 'origin_branch') {
    return 'Origin Branch';
  }
  if (type === 'destination_branch') {
    return 'Destination Branch';
  }
  if (type === 'delivery') {
    return 'Delivery Point';
  }
  if (type.includes('branch')) {
    return 'Branch';
  }

  if (statusCode === 'pickup_assigned') {
    return 'Pickup Point';
  }
  if (statusCode === 'picked_up' || statusCode === 'in_transit_to_origin_branch') {
    return 'Origin Branch';
  }
  if (statusCode === 'linehaul_assigned' || statusCode === 'linehaul_load_confirmed' || statusCode === 'linehaul_in_transit') {
    return 'Destination Branch';
  }
  if (statusCode === 'delivery_assigned' || statusCode === 'delivery_load_confirmed' || statusCode === 'out_for_delivery') {
    return 'Delivery Point';
  }
  return 'Target Point';
};

const TrackingMap = ({ trackingData }) => {
  const status = String(trackingData?.status || '').trim().toLowerCase();
  const targetLabel = labelForTarget(trackingData?.targetType, status);
  const isDelivered = status === 'delivered';
  const isMoving = Boolean(
    trackingData?.isLiveTrackingEnabled
      ?? MOVING_STATUSES.has(status)
  );

  const pickupPoint = toLatLng(trackingData?.pickupLocation);
  const deliveryPoint = toLatLng(trackingData?.deliveryLocation);
  const originBranchPoint = toLatLng(trackingData?.originBranchLocation);
  const destinationBranchPoint = toLatLng(trackingData?.destinationBranchLocation);
  const parcelPoint = toLatLng(trackingData?.parcelLocation || trackingData?.currentLocation)
    || (isDelivered ? deliveryPoint : null);
  const courierPoint = toLatLng(trackingData?.courierLocation);
  const targetPoint = toLatLng(trackingData?.targetLocation);
  const parcelOverDelivery = Boolean(
    parcelPoint
    && deliveryPoint
    && Math.abs(parcelPoint[0] - deliveryPoint[0]) < 0.00001
    && Math.abs(parcelPoint[1] - deliveryPoint[1]) < 0.00001
  );
  const showDeliveryMarker = Boolean(deliveryPoint && !(isDelivered && parcelOverDelivery));
  const parcelTooltip = isDelivered ? 'Parcel delivered' : 'Parcel location';

  const [roadRoute, setRoadRoute] = useState([]);
  const [fullRoadRoute, setFullRoadRoute] = useState([]);

  const routeFromLat = isMoving ? (courierPoint?.[0] ?? parcelPoint?.[0]) : parcelPoint?.[0];
  const routeFromLng = isMoving ? (courierPoint?.[1] ?? parcelPoint?.[1]) : parcelPoint?.[1];
  const routeToLat = targetPoint?.[0];
  const routeToLng = targetPoint?.[1];

  const routeEndpoints = useMemo(() => {
    if (![routeFromLat, routeFromLng, routeToLat, routeToLng].every((value) => Number.isFinite(value))) {
      return null;
    }
    const samePoint = Math.abs(routeFromLat - routeToLat) < 0.00001
      && Math.abs(routeFromLng - routeToLng) < 0.00001;
    if (samePoint) {
      return null;
    }
    return {
      from: { lat: Number(routeFromLat), lon: Number(routeFromLng) },
      to: { lat: Number(routeToLat), lon: Number(routeToLng) }
    };
  }, [routeFromLat, routeFromLng, routeToLat, routeToLng]);

  const journeyWaypointPairs = useMemo(() => {
    const candidates = [
      pickupPoint,
      originBranchPoint,
      destinationBranchPoint,
      deliveryPoint
    ].filter((point) => Array.isArray(point) && point.length >= 2);

    const dedupedWaypoints = [];
    candidates.forEach((point) => {
      const previous = dedupedWaypoints[dedupedWaypoints.length - 1];
      if (!previous || !pointsAreNear(previous, point)) {
        dedupedWaypoints.push(point);
      }
    });
    if (dedupedWaypoints.length < 2) {
      return [];
    }

    const pairs = [];
    for (let idx = 0; idx < dedupedWaypoints.length - 1; idx += 1) {
      const from = dedupedWaypoints[idx];
      const to = dedupedWaypoints[idx + 1];
      pairs.push({
        from: { lat: Number(from[0]), lon: Number(from[1]) },
        to: { lat: Number(to[0]), lon: Number(to[1]) }
      });
    }
    return pairs;
  }, [deliveryPoint, destinationBranchPoint, originBranchPoint, pickupPoint]);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (!routeEndpoints) {
        if (isActive) {
          setRoadRoute([]);
        }
        return;
      }
      try {
        const roadGraph = await loadRoadGraph();
        if (!isActive) {
          return;
        }

        const startNode = findNearestNode(routeEndpoints.from, roadGraph.nodes, roadGraph.grid);
        const endNode = findNearestNode(routeEndpoints.to, roadGraph.nodes, roadGraph.grid);
        const startPoint = [Number(routeEndpoints.from.lat), Number(routeEndpoints.from.lon)];
        const endPoint = [Number(routeEndpoints.to.lat), Number(routeEndpoints.to.lon)];
        let coords = null;
        if (startNode && endNode) {
          coords = shortestPathCoords(startNode, endNode, roadGraph.graph, roadGraph.nodes);
        }
        if (Array.isArray(coords) && coords.length > 1) {
          if (!pointsAreNear(coords[0], startPoint)) {
            coords = [startPoint, ...coords];
          }
          if (!pointsAreNear(coords[coords.length - 1], endPoint)) {
            coords = [...coords, endPoint];
          }
        } else {
          coords = [startPoint, endPoint];
        }
        if (!isActive) {
          return;
        }
        setRoadRoute(Array.isArray(coords) ? coords : []);
      } catch (error) {
        if (isActive) {
          setRoadRoute([]);
        }
      }
    };

    run();

    return () => {
      isActive = false;
    };
  }, [routeEndpoints]);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (!Array.isArray(journeyWaypointPairs) || journeyWaypointPairs.length === 0) {
        if (isActive) {
          setFullRoadRoute([]);
        }
        return;
      }
      try {
        const roadGraph = await loadRoadGraph();
        if (!isActive) {
          return;
        }

        const assembled = [];
        journeyWaypointPairs.forEach((pair) => {
          const startPoint = [Number(pair.from.lat), Number(pair.from.lon)];
          const endPoint = [Number(pair.to.lat), Number(pair.to.lon)];
          const startNode = findNearestNode(pair.from, roadGraph.nodes, roadGraph.grid);
          const endNode = findNearestNode(pair.to, roadGraph.nodes, roadGraph.grid);

          let segment = null;
          if (startNode && endNode) {
            segment = shortestPathCoords(startNode, endNode, roadGraph.graph, roadGraph.nodes);
          }
          if (Array.isArray(segment) && segment.length > 1) {
            if (!pointsAreNear(segment[0], startPoint)) {
              segment = [startPoint, ...segment];
            }
            if (!pointsAreNear(segment[segment.length - 1], endPoint)) {
              segment = [...segment, endPoint];
            }
          } else {
            segment = [startPoint, endPoint];
          }

          segment.forEach((point, index) => {
            if (!Array.isArray(point) || point.length < 2) {
              return;
            }
            const last = assembled[assembled.length - 1];
            if (index === 0 && last && pointsAreNear(last, point)) {
              return;
            }
            assembled.push(point);
          });
        });

        if (!isActive) {
          return;
        }
        setFullRoadRoute(assembled.length > 1 ? assembled : []);
      } catch (error) {
        if (isActive) {
          setFullRoadRoute([]);
        }
      }
    };

    run();

    return () => {
      isActive = false;
    };
  }, [journeyWaypointPairs]);

  const fitPoints = useMemo(() => {
    const list = [];
    if (pickupPoint) {
      list.push(pickupPoint);
    }
    if (deliveryPoint) {
      list.push(deliveryPoint);
    }
    if (parcelPoint) {
      list.push(parcelPoint);
    }
    if (courierPoint) {
      list.push(courierPoint);
    }
    if (targetPoint) {
      list.push(targetPoint);
    }
    if (Array.isArray(roadRoute) && roadRoute.length > 1) {
      list.push(roadRoute[0]);
      list.push(roadRoute[roadRoute.length - 1]);
    }
    if (Array.isArray(fullRoadRoute) && fullRoadRoute.length > 1) {
      list.push(fullRoadRoute[0]);
      list.push(fullRoadRoute[fullRoadRoute.length - 1]);
    }
    return list;
  }, [courierPoint, deliveryPoint, fullRoadRoute, parcelPoint, pickupPoint, roadRoute, targetPoint]);

  const mapCenter = courierPoint || parcelPoint || pickupPoint || deliveryPoint || DEFAULT_CENTER;

  return (
    <div className="bg-card rounded-xl shadow-elevation-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="MapPin" size={20} color="var(--color-primary)" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">Tracking Map</h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                {isMoving ? 'Courier movement is live for this stage' : 'Location is fixed for this stage'}
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isMoving ? 'bg-success/10' : 'bg-muted'}`}>
            <div className={`w-2 h-2 rounded-full ${isMoving ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
            <span className={`text-xs md:text-sm font-medium ${isMoving ? 'text-success' : 'text-muted-foreground'}`}>
              {isMoving ? 'Live' : 'Static'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative w-full h-64 md:h-80 lg:h-96 bg-muted">
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          dragging
          touchZoom
          doubleClickZoom
          boxZoom
          keyboard
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {pickupPoint ? (
            <Marker
              position={pickupPoint}
              icon={createMarkerIcon({ label: 'P', color: '#16a34a' })}
            >
              <Tooltip>Pickup Location</Tooltip>
            </Marker>
          ) : null}

          {showDeliveryMarker ? (
            <Marker
              position={deliveryPoint}
              icon={createMarkerIcon({ label: 'D', color: '#dc2626' })}
            >
              <Tooltip>Delivery Location</Tooltip>
            </Marker>
          ) : null}

          {parcelPoint ? (
            <Marker
              position={parcelPoint}
              icon={createMarkerIcon({ label: 'P', color: isDelivered ? '#16a34a' : '#f59e0b' })}
              zIndexOffset={1200}
            >
              <Tooltip>{parcelTooltip}</Tooltip>
            </Marker>
          ) : null}

          {parcelPoint ? (
            <CircleMarker
              center={parcelPoint}
              radius={isDelivered ? 14 : 11}
              pathOptions={{
                color: isDelivered ? '#15803d' : '#d97706',
                weight: 2,
                fillColor: isDelivered ? '#22c55e' : '#f59e0b',
                fillOpacity: isDelivered ? 0.2 : 0.16
              }}
            />
          ) : null}

          {isMoving && courierPoint ? (
            <Marker
              position={courierPoint}
              icon={createMarkerIcon({ label: 'V', color: '#1d4ed8' })}
            >
              <Tooltip>Courier Vehicle Location</Tooltip>
            </Marker>
          ) : null}

          {targetPoint ? (
            <Marker
              position={targetPoint}
              icon={createMarkerIcon({ label: 'T', color: '#7c3aed' })}
            >
              <Tooltip>{targetLabel}</Tooltip>
            </Marker>
          ) : null}

          {Array.isArray(fullRoadRoute) && fullRoadRoute.length > 1 ? (
            <Polyline
              positions={fullRoadRoute}
              pathOptions={{ color: '#64748b', weight: 2, opacity: 0.45 }}
            />
          ) : null}

          {Array.isArray(roadRoute) && roadRoute.length > 1 ? (
            <Polyline
              positions={roadRoute}
              pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.85 }}
            />
          ) : null}

          <FitBounds points={fitPoints} />
        </MapContainer>

        <div className="pointer-events-none absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur-sm rounded-lg p-3 md:p-4 shadow-elevation-lg">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name={isMoving ? 'Truck' : 'Package'} size={20} color="var(--color-accent)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-foreground mb-1">
                {isMoving ? 'Courier Vehicle / Parcel Tracking' : 'Parcel Location'}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">{trackingData?.currentAddress}</p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <Icon name="Clock" size={14} color="var(--color-primary)" />
                  <span className="text-xs font-medium text-primary">{trackingData?.estimatedTime}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="Navigation2" size={14} color="var(--color-secondary)" />
                  <span className="text-xs text-muted-foreground">{trackingData?.distance}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 border-t border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">V</span>
            <span className="text-xs text-muted-foreground">Courier Vehicle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">P</span>
            <span className="text-xs text-muted-foreground">Parcel</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">D</span>
            <span className="text-xs text-muted-foreground">Destination</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">T</span>
            <span className="text-xs text-muted-foreground">{targetLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TrackingMap);
