import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const LINEHAUL_ROUTE_STATUSES = ['linehaul_load_confirmed', 'linehaul_in_transit'];
const DELIVERY_RETURN_TO_BRANCH_STATUSES = ['delivery_attempt_failed'];
const BRANCH_TARGET_STATUSES = [...LINEHAUL_ROUTE_STATUSES, ...DELIVERY_RETURN_TO_BRANCH_STATUSES];

const formatBranchLabel = (branch, fallbackText = '') => {
  const name = String(branch?.name || '').trim();
  const locality = [branch?.city, branch?.province].filter(Boolean).join(', ').trim();
  if (name && locality) {
    return `${name} (${locality})`;
  }
  if (name) {
    return name;
  }
  if (locality) {
    return locality;
  }
  const address = String(branch?.address || '').trim();
  if (address) {
    return address;
  }
  const fallback = String(fallbackText || '').trim();
  return fallback || 'Branch';
};

const formatBranchLabelWithAddress = (branch, fallbackText = '') => {
  const name = formatBranchLabel(branch, fallbackText);
  const addressLine = [
    String(branch?.address || '').trim(),
    String(branch?.city || '').trim(),
    String(branch?.province || '').trim(),
    String(branch?.postalCode || '').trim()
  ]
    .filter((value) => Boolean(value))
    .join(', ');
  if (!addressLine) {
    return name;
  }
  if (!name || name === addressLine) {
    return addressLine;
  }
  return `${name} | ${addressLine}`;
};

const resolveDispatchBranchForPendingDelivery = (delivery) => {
  const status = String(delivery?.status || '').trim().toLowerCase();
  const isIntercity = Boolean(delivery?.isIntercity);
  if (status === 'linehaul_assigned') {
    return delivery?.originBranch || null;
  }
  if (['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed'].includes(status)) {
    return isIntercity ? (delivery?.destinationBranch || null) : (delivery?.originBranch || null);
  }
  return delivery?.originBranch || null;
};

const RouteOptimizationPanel = ({
  routes,
  onSelectRoute,
  onRefresh,
  isLoading,
  startLocation,
  courierLocation,
  branchLocation,
  vehicle,
  onStartNavigation,
  deliveries,
  courierRole,
  selectedRouteIndex,
  onSelectRouteIndex,
  emptyStateMessage,
  onUseDeviceLocation,
  onUpdateLocationCoordinates,
  isUpdatingLocation,
  locationUpdateError,
  locationUpdateNotice
}) => {
  const [localSelectedRoute, setLocalSelectedRoute] = useState(0);
  const activeRouteIndex = Number.isFinite(Number(selectedRouteIndex))
    ? Number(selectedRouteIndex)
    : localSelectedRoute;
  const setActiveRouteIndex = onSelectRouteIndex || setLocalSelectedRoute;
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [localLocationError, setLocalLocationError] = useState('');
  const [isPickOnMapEnabled, setIsPickOnMapEnabled] = useState(false);
  const selectedStopSequence = routes?.[activeRouteIndex]?.stopSequence || [];
  const deliveryById = useMemo(() => {
    const map = new Map();
    (deliveries || []).forEach((delivery) => {
      const id = Number(delivery?.id);
      if (Number.isFinite(id)) {
        map.set(id, delivery);
      }
    });
    return map;
  }, [deliveries]);
  const statusByBooking = useMemo(() => (
    new Map(
      (deliveries || [])
        .filter((delivery) => Number.isFinite(Number(delivery?.id)))
        .map((delivery) => [Number(delivery.id), delivery?.status])
    )
  ), [deliveries]);
  const normalizedCourierRole = ['pickup', 'linehaul', 'delivery', 'both'].includes(courierRole)
    ? courierRole
    : 'both';
  const isLinehaulRoleView = normalizedCourierRole === 'linehaul';
  const routeSubtitle = isLinehaulRoleView
    ? 'Choose the best route between branches'
    : 'Choose the best route for your deliveries';
  const pendingLoadDeliveries = useMemo(() => {
    const statusAllowList = normalizedCourierRole === 'pickup'
      ? []
      : normalizedCourierRole === 'linehaul'
        ? ['linehaul_assigned']
        : normalizedCourierRole === 'delivery'
          ? ['delivery_assigned']
          : ['linehaul_assigned', 'delivery_assigned'];
    if (statusAllowList.length === 0) {
      return [];
    }
    return (deliveries || []).filter((delivery) => (
      statusAllowList.includes(String(delivery?.status || '').trim().toLowerCase())
    ));
  }, [deliveries, normalizedCourierRole]);
  const pendingLoadBookingIds = useMemo(() => (
    pendingLoadDeliveries
      .map((delivery) => Number(delivery?.id))
      .filter((id) => Number.isFinite(id))
  ), [pendingLoadDeliveries]);
  const pendingLoadBranch = useMemo(() => {
    for (const delivery of pendingLoadDeliveries) {
      const status = String(delivery?.status || '').trim().toLowerCase();
      const isIntercity = Boolean(delivery?.isIntercity);
      const branch = status === 'delivery_assigned'
        ? (isIntercity ? delivery?.destinationBranch : delivery?.originBranch)
        : delivery?.originBranch;
      const lat = Number(branch?.lat);
      const lng = Number(branch?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          label: branch?.name || 'Dispatch Branch',
          city: branch?.city || '',
          address: branch?.address || ''
        };
      }
    }
    return null;
  }, [pendingLoadDeliveries]);
  const hasPendingLoadWithoutRoutes = pendingLoadDeliveries.length > 0
    && (!Array.isArray(routes) || routes.length === 0);
  const effectiveBranchLocation = useMemo(() => {
    if (hasPendingLoadWithoutRoutes && pendingLoadBranch) {
      return pendingLoadBranch;
    }
    const lat = Number(branchLocation?.lat);
    const lng = Number(branchLocation?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        label: branchLocation?.label || 'Branch',
        city: branchLocation?.city || '',
        address: branchLocation?.address || ''
      };
    }
    return pendingLoadBranch;
  }, [branchLocation, hasPendingLoadWithoutRoutes, pendingLoadBranch]);
  const hideMapForPendingDeliveryLoad = useMemo(() => (
    pendingLoadDeliveries.some((delivery) => String(delivery?.status || '').trim().toLowerCase() === 'delivery_assigned')
      && (!Array.isArray(routes) || routes.length === 0)
  ), [pendingLoadDeliveries, routes]);
  const hasStart = Number.isFinite(startLocation?.lng) && Number.isFinite(startLocation?.lat);
  const routeStartPoint = hasStart
    ? { lat: Number(startLocation.lat), lng: Number(startLocation.lng) }
    : null;
  const courierStartPoint = (
    courierLocation && Number.isFinite(Number(courierLocation?.lat)) && Number.isFinite(Number(courierLocation?.lng))
      ? { lat: Number(courierLocation.lat), lng: Number(courierLocation.lng) }
      : null
  );
  const hasEffectiveBranchLocation = Number.isFinite(Number(effectiveBranchLocation?.lat))
    && Number.isFinite(Number(effectiveBranchLocation?.lng));
  const branchStartPoint = hasEffectiveBranchLocation
    ? { lat: Number(effectiveBranchLocation.lat), lng: Number(effectiveBranchLocation.lng) }
    : null;
  const shouldPreferBranchStart = hasPendingLoadWithoutRoutes
    && !courierStartPoint
    && !routeStartPoint;
  const fallbackCenter = [27.7172, 85.324];
  const mapCenter = useMemo(() => {
    if (shouldPreferBranchStart && branchStartPoint) {
      return [branchStartPoint.lat, branchStartPoint.lng];
    }
    if (courierStartPoint) {
      return [courierStartPoint.lat, courierStartPoint.lng];
    }
    if (routeStartPoint) {
      return [routeStartPoint.lat, routeStartPoint.lng];
    }
    if (branchStartPoint) {
      return [branchStartPoint.lat, branchStartPoint.lng];
    }
    return fallbackCenter;
  }, [branchStartPoint, courierStartPoint, routeStartPoint, shouldPreferBranchStart]);
  const geoapifyKey = import.meta.env.VITE_GEOAPIFY_KEY || 'b2753bad7f63400ba6e69b971f16fe4e';
  const currentStart = useMemo(() => {
    if (shouldPreferBranchStart && branchStartPoint) {
      return branchStartPoint;
    }
    return courierStartPoint || routeStartPoint || branchStartPoint || null;
  }, [branchStartPoint, courierStartPoint, routeStartPoint, shouldPreferBranchStart]);

  const filterStopsForRole = (stops) => {
    const list = Array.isArray(stops) ? stops : [];
    const allowedDeliveryStopStatuses = normalizedCourierRole === 'linehaul'
      ? ['linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_destination_branch', 'delivered']
      : normalizedCourierRole === 'delivery'
        ? ['delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'delivered']
        : [
            'linehaul_load_confirmed',
            'linehaul_in_transit',
            'received_at_destination_branch',
            'delivery_load_confirmed',
            'out_for_delivery',
            'delivery_attempt_failed',
            'delivered'
          ];

    return list.filter((stop) => {
      if (normalizedCourierRole === 'pickup' && stop?.stop_kind !== 'pickup') {
        return false;
      }
      if ((normalizedCourierRole === 'delivery' || normalizedCourierRole === 'linehaul') && stop?.stop_kind !== 'delivery') {
        return false;
      }
      if (stop?.stop_kind !== 'delivery') {
        return true;
      }
      const bookingId = Number(stop?.booking_id);
      const status = String(statusByBooking.get(bookingId) || '').trim().toLowerCase();
      if (!status) {
        // Keep the stop visible when status is unavailable from dashboard payload.
        return true;
      }
      return allowedDeliveryStopStatuses.includes(status);
    });
  };

  const allowedStopSequence = useMemo(() => (
    filterStopsForRole(selectedStopSequence)
  ), [courierRole, selectedStopSequence, statusByBooking]);

  const markers = useMemo(() => {
    const list = [];
    const toNumber = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const add = (lat, lng, label, color, hint) => {
      const safeLat = toNumber(lat);
      const safeLng = toNumber(lng);
      if (safeLat === null || safeLng === null) {
        return;
      }
      list.push({
        position: [safeLat, safeLng],
        label,
        color,
        hint
      });
    };

    const vehicleType = (vehicle?.type || '').toLowerCase();
    const vehicleEmoji = vehicleType.includes('scooter')
      ? '🛵'
      : vehicleType.includes('bike') || vehicleType.includes('bicycle')
        ? '🚲'
        : vehicleType.includes('motor')
          ? '🏍️'
          : vehicleType.includes('truck')
            ? '🚚'
            : vehicleType.includes('van')
              ? '🚐'
              : vehicleType.includes('car')
                ? '🚗'
                : '🚚';

    if (effectiveBranchLocation) {
      add(effectiveBranchLocation.lat, effectiveBranchLocation.lng, 'B', '#f59e0b', effectiveBranchLocation.label || 'Branch');
    }
    if (!shouldPreferBranchStart && courierStartPoint) {
      add(courierStartPoint.lat, courierStartPoint.lng, vehicleEmoji, '#1e40af', 'Courier Vehicle');
    } else if (!shouldPreferBranchStart && routeStartPoint) {
      add(routeStartPoint.lat, routeStartPoint.lng, vehicleEmoji, '#1e40af', 'Courier Start');
    }

    const maxStopsToShow = 20;
    allowedStopSequence.slice(0, maxStopsToShow).forEach((stop, index) => {
      const rawStopKind = String(stop?.stop_kind ?? stop?.stopKind ?? '').trim().toLowerCase();
      const bookingId = Number(stop?.booking_id ?? stop?.bookingId);
      const status = String(statusByBooking.get(bookingId) || '').trim().toLowerCase();
      const isPickup = rawStopKind === 'pickup';
      const isBranch = rawStopKind === 'branch';
      const isBranchLeg = !isPickup && !isBranch && (
        normalizedCourierRole === 'linehaul' || BRANCH_TARGET_STATUSES.includes(status)
      );
      const isDeliveryFailureReturn = DELIVERY_RETURN_TO_BRANCH_STATUSES.includes(status);
      const label = isPickup ? '📦' : (isBranch || isBranchLeg ? '🏢' : '🏁');
      const color = isPickup ? '#10b981' : (isBranch || isBranchLeg ? '#f59e0b' : '#ef4444');
      const hint = isPickup
        ? `Pickup ${index + 1}`
        : (isBranch || isBranchLeg
            ? `${isDeliveryFailureReturn ? 'Dispatch Branch' : 'Destination Branch'} ${index + 1}`
            : `Delivery ${index + 1}`);
      add(stop?.lat, stop?.lng, label, color, hint);
    });

    return list;
  }, [allowedStopSequence, courierStartPoint, effectiveBranchLocation, normalizedCourierRole, routeStartPoint, shouldPreferBranchStart, statusByBooking, vehicle]);

  const createLabelIcon = (label, color) =>
    L.divIcon({
      className: 'route-marker',
      html: `<div style="width:24px;height:24px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2);">${label}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

  const BoundsFitter = ({ points }) => {
    const map = useMap();
    useEffect(() => {
      if (!points.length) {
        map.setView(mapCenter, 13);
        return;
      }
      const bounds = L.latLngBounds(points.map((point) => point.position));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }, [map, mapCenter, points]);
    return null;
  };

  const MapClickPicker = ({ enabled, onPick }) => {
    useMapEvents({
      click(event) {
        if (!enabled || typeof onPick !== 'function') {
          return;
        }
        const lat = Number(event?.latlng?.lat);
        const lng = Number(event?.latlng?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }
        onPick(lat, lng);
      }
    });
    return null;
  };

  const handleRouteSelect = (index) => {
    setActiveRouteIndex(index);
    onSelectRoute(routes?.[index]);
  };

  const validateCoordinate = (value, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return null;
    }
    return parsed;
  };

  const applyManualCoordinates = async () => {
    setLocalLocationError('');
    const lat = validateCoordinate(manualLat, -90, 90);
    const lng = validateCoordinate(manualLng, -180, 180);
    if (lat === null || lng === null) {
      setLocalLocationError('Enter valid coordinates: latitude (-90 to 90), longitude (-180 to 180).');
      return;
    }
    if (typeof onUpdateLocationCoordinates !== 'function') {
      return;
    }
    try {
      await onUpdateLocationCoordinates(lat, lng);
      setIsPickOnMapEnabled(false);
    } catch (error) {
      setLocalLocationError(error?.message || 'Unable to update current location.');
    }
  };

  const handleManualLocationSubmit = async (event) => {
    event?.preventDefault?.();
    await applyManualCoordinates();
  };

  const handleUseDeviceLocation = async () => {
    setLocalLocationError('');
    if (typeof onUseDeviceLocation !== 'function') {
      return;
    }
    try {
      await onUseDeviceLocation();
      setIsPickOnMapEnabled(false);
    } catch (error) {
      setLocalLocationError(error?.message || 'Unable to use device location.');
    }
  };

  const handlePickFromMap = async (lat, lng) => {
    const normalizedLat = Number(lat.toFixed(5));
    const normalizedLng = Number(lng.toFixed(5));
    setManualLat(String(normalizedLat));
    setManualLng(String(normalizedLng));
    setLocalLocationError('');
    if (typeof onUpdateLocationCoordinates !== 'function') {
      return;
    }
    try {
      await onUpdateLocationCoordinates(normalizedLat, normalizedLng);
      setIsPickOnMapEnabled(false);
    } catch (error) {
      setLocalLocationError(error?.message || 'Unable to update current location from map.');
    }
  };

  const buildStopPreview = (route, limit = 6) => {
    const rawStops = filterStopsForRole(route?.stopSequence || []);
    if (isLinehaulRoleView) {
      const branchLegs = [];
      const seenLegs = new Set();
      rawStops.forEach((stop, idx) => {
        const bookingId = Number(stop?.booking_id);
        const booking = deliveryById.get(bookingId);
        const originLabel = formatBranchLabel(booking?.originBranch, booking?.pickupAddress);
        const destinationLabel = formatBranchLabel(booking?.destinationBranch, booking?.deliveryAddress);
        const originKey = Number.isFinite(Number(booking?.originBranch?.id))
          ? Number(booking?.originBranch?.id)
          : originLabel;
        const destinationKey = Number.isFinite(Number(booking?.destinationBranch?.id))
          ? Number(booking?.destinationBranch?.id)
          : destinationLabel;
        const legKey = `${originKey}->${destinationKey}`;
        if (seenLegs.has(legKey)) {
          return;
        }
        seenLegs.add(legKey);
        const etaMinutes = Number(stop?.eta_minutes);
        branchLegs.push({
          key: `${legKey}-${idx}`,
          label: 'Branch Route',
          address: `${originLabel} -> ${destinationLabel}`,
          eta: Number.isFinite(etaMinutes) ? `~${Math.round(etaMinutes)} mins` : null
        });
      });
      return {
        preview: branchLegs.slice(0, limit),
        remaining: Math.max(0, branchLegs.length - limit),
        total: branchLegs.length
      };
    }

    const seen = new Set();
    const stops = rawStops.filter((stop) => {
      const key = `${Number(stop?.booking_id)}-${String(stop?.stop_kind || '')}-${Number(stop?.address_id)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    const preview = stops.slice(0, limit).map((stop, idx) => {
      const bookingId = Number(stop?.booking_id);
      const booking = deliveryById.get(bookingId);
      const isPickup = stop?.stop_kind === 'pickup';
      const status = String(statusByBooking.get(bookingId) || '').trim().toLowerCase();
      const isLinehaulLeg = LINEHAUL_ROUTE_STATUSES.includes(status);
      const isReturnToDispatchLeg = DELIVERY_RETURN_TO_BRANCH_STATUSES.includes(status);
      const isBranchLeg = isLinehaulLeg || isReturnToDispatchLeg;
      const isIntercity = Boolean(booking?.isIntercity);
      const dispatchBranch = isIntercity
        ? (booking?.destinationBranch || booking?.originBranch || null)
        : (booking?.originBranch || booking?.destinationBranch || null);
      const branchForStop = isReturnToDispatchLeg ? dispatchBranch : (booking?.destinationBranch || dispatchBranch);
      const branchAddress = [
        branchForStop?.address,
        branchForStop?.city,
        branchForStop?.province,
        branchForStop?.postalCode
      ].filter(Boolean).join(', ');
      const branchLabel = isReturnToDispatchLeg ? 'Dispatch Branch' : 'Destination Branch';
      const address = isPickup
        ? booking?.pickupAddress
        : (isBranchLeg
            ? (branchAddress || branchForStop?.name || booking?.deliveryAddress)
            : booking?.deliveryAddress);
      const etaMinutes = Number(stop?.eta_minutes);
      return {
        key: `${bookingId}-${stop?.stop_kind}-${idx}`,
        label: isPickup ? 'Pickup' : (isBranchLeg ? branchLabel : 'Delivery'),
        address: address || `Booking #${Number.isFinite(bookingId) ? bookingId : 'N/A'}`,
        eta: Number.isFinite(etaMinutes) ? `~${Math.round(etaMinutes)} mins` : null
      };
    });
    return {
      preview,
      remaining: Math.max(0, stops.length - preview.length),
      total: stops.length
    };
  };
  const buildLinehaulRouteSummary = (route) => {
    if (!isLinehaulRoleView) {
      return null;
    }
    const rawStops = filterStopsForRole(route?.stopSequence || []);
    const legs = [];
    const seenLegs = new Set();

    rawStops.forEach((stop) => {
      const bookingId = Number(stop?.booking_id);
      const booking = deliveryById.get(bookingId);
      const originLabel = formatBranchLabel(booking?.originBranch, booking?.pickupAddress);
      const destinationLabel = formatBranchLabel(booking?.destinationBranch, booking?.deliveryAddress);
      const originKey = Number.isFinite(Number(booking?.originBranch?.id))
        ? Number(booking?.originBranch?.id)
        : originLabel;
      const destinationKey = Number.isFinite(Number(booking?.destinationBranch?.id))
        ? Number(booking?.destinationBranch?.id)
        : destinationLabel;
      const legKey = `${originKey}->${destinationKey}`;
      if (seenLegs.has(legKey)) {
        return;
      }
      seenLegs.add(legKey);
      legs.push({
        key: legKey,
        originLabel,
        destinationLabel
      });
    });

    if (legs.length === 0) {
      return null;
    }
    return {
      primary: legs[0],
      extraLegs: Math.max(0, legs.length - 1),
      totalLegs: legs.length
    };
  };
  const pendingLoadSummary = useMemo(() => (
    pendingLoadDeliveries.map((delivery) => {
      const status = String(delivery?.status || '').trim().toLowerCase();
      const isIntercity = Boolean(delivery?.isIntercity);
      const dispatchBranch = status === 'delivery_assigned'
        ? (isIntercity ? delivery?.destinationBranch : delivery?.originBranch)
        : delivery?.originBranch;
      const dispatchBranchLabel = dispatchBranch?.name
        || [dispatchBranch?.address, dispatchBranch?.city].filter(Boolean).join(', ')
        || 'Dispatch branch';
      return {
        id: Number(delivery?.id),
        trackingId: delivery?.trackingId || `#${delivery?.id}`,
        status,
        dispatchBranchLabel
      };
    })
  ), [pendingLoadDeliveries]);

  const navigationContext = useMemo(() => {
    const start = shouldPreferBranchStart && branchStartPoint
      ? branchStartPoint
      : courierStartPoint
        || routeStartPoint
        || branchStartPoint
        || { lat: mapCenter[0], lng: mapCenter[1] };

    const shortAddress = (value) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        return '';
      }
      return text.length > 90 ? `${text.slice(0, 87)}...` : text;
    };

    const startLabel = shouldPreferBranchStart && branchStartPoint
      ? (effectiveBranchLocation?.label || 'Dispatch branch')
      : courierStartPoint
        ? 'Courier current location'
        : routeStartPoint
          ? 'Courier current position'
          : branchStartPoint
            ? (effectiveBranchLocation?.label || 'Assigned branch')
            : 'Map start point';

    const uniqueNumericIds = (values = []) => Array.from(new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    ));

    const fallbackPendingStops = pendingLoadDeliveries
      .map((delivery) => {
        const status = String(delivery?.status || '').trim().toLowerCase();
        const deliveryId = Number(delivery?.id);
        const dispatchBranch = resolveDispatchBranchForPendingDelivery(delivery);
        const lat = Number(dispatchBranch?.lat);
        const lng = Number(dispatchBranch?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(deliveryId)) {
          return null;
        }
        const branchAddressText = shortAddress(formatBranchLabelWithAddress(dispatchBranch, 'Dispatch Branch'));
        const labelPrefix = 'Dispatch Branch';
        return {
          lat,
          lng,
          label: branchAddressText
            ? `${labelPrefix}: ${branchAddressText}`
            : `${labelPrefix} booking #${deliveryId}`,
          stopKind: 'branch',
          bookingId: deliveryId,
          addressId: null,
          bookingIds: [deliveryId],
          addressIds: []
        };
      })
      .filter((point) => Boolean(point));
    const sourceStops = allowedStopSequence.length > 0 ? allowedStopSequence : fallbackPendingStops;

    const stops = sourceStops
      .map((stop) => {
        const lat = Number(stop?.lat);
        const lng = Number(stop?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        const rawStopKind = String(stop?.stop_kind ?? stop?.stopKind ?? '').trim().toLowerCase();
        const isPickup = rawStopKind === 'pickup';
        const isBranch = rawStopKind === 'branch';
        const bookingId = Number(stop?.booking_id ?? stop?.bookingId);
        const booking = deliveryById.get(bookingId);
        const status = String(statusByBooking.get(bookingId) || '').trim().toLowerCase();
        const isLinehaulLeg = (
          !isPickup
          && !isBranch
          && (normalizedCourierRole === 'linehaul' || LINEHAUL_ROUTE_STATUSES.includes(status))
        );
        const isReturnToDispatchLeg = (
          !isPickup
          && !isBranch
          && DELIVERY_RETURN_TO_BRANCH_STATUSES.includes(status)
        );
        const isBranchTargetLeg = isLinehaulLeg || isReturnToDispatchLeg;
        const explicitLabel = String(stop?.label || '').trim();
        const addressId = Number(stop?.address_id ?? stop?.addressId);

        if (isBranch) {
          const branchLabel = explicitLabel || 'Branch';
          return {
            lat,
            lng,
            label: branchLabel,
            stopKind: 'branch',
            bookingId: Number.isFinite(bookingId) ? bookingId : null,
            addressId: Number.isFinite(addressId) ? addressId : null,
            bookingIds: Number.isFinite(bookingId) ? [bookingId] : [],
            addressIds: Number.isFinite(addressId) ? [addressId] : []
          };
        }

        const isIntercity = Boolean(booking?.isIntercity);
        const dispatchBranch = isIntercity
          ? (booking?.destinationBranch || booking?.originBranch || null)
          : (booking?.originBranch || booking?.destinationBranch || null);
        const branchTarget = isReturnToDispatchLeg
          ? dispatchBranch
          : (booking?.destinationBranch || dispatchBranch);
        const branchTargetLabel = formatBranchLabelWithAddress(
          branchTarget,
          booking?.deliveryAddress
        );
        const branchPrefix = isReturnToDispatchLeg ? 'Dispatch Branch' : 'Destination Branch';
        const rawAddress = isPickup
          ? booking?.pickupAddress
          : (isBranchTargetLeg
              ? branchTargetLabel
              : booking?.deliveryAddress);
        const addressText = shortAddress(rawAddress);
        const computedLabel = addressText
          ? `${isPickup ? 'Pickup' : (isBranchTargetLeg ? branchPrefix : 'Delivery')}: ${addressText}`
          : `${isPickup ? 'Pickup' : (isBranchTargetLeg ? branchPrefix : 'Delivery')} booking #${Number.isFinite(bookingId) ? bookingId : 'N/A'}`;
        const stopLabel = explicitLabel || computedLabel;
        return {
          lat,
          lng,
          label: stopLabel,
          stopKind: isPickup ? 'pickup' : 'delivery',
          bookingId: Number.isFinite(bookingId) ? bookingId : null,
          addressId: Number.isFinite(addressId) ? addressId : null,
          bookingIds: Number.isFinite(bookingId) ? [bookingId] : [],
          addressIds: Number.isFinite(addressId) ? [addressId] : []
        };
      })
      .filter((point) => Boolean(point));

    const maxStops = 20;
    const pointsWithLabels = [{
      lat: start.lat,
      lng: start.lng,
      label: startLabel,
      stopKind: 'start',
      bookingId: null,
      addressId: null,
      bookingIds: [],
      addressIds: []
    }, ...stops.slice(0, maxStops)];
    const shouldAppendStandaloneBranch = pendingLoadBookingIds.length > 0 && stops.length === 0;
    if (shouldAppendStandaloneBranch && effectiveBranchLocation && Number.isFinite(Number(effectiveBranchLocation?.lat)) && Number.isFinite(Number(effectiveBranchLocation?.lng))) {
      const branchLabel = formatBranchLabelWithAddress(
        {
          name: effectiveBranchLocation?.label || '',
          address: effectiveBranchLocation?.address || '',
          city: effectiveBranchLocation?.city || ''
        },
        'Branch'
      );
      pointsWithLabels.push({
        lat: Number(effectiveBranchLocation.lat),
        lng: Number(effectiveBranchLocation.lng),
        label: branchLabel,
        stopKind: 'branch',
        bookingId: null,
        addressId: null,
        bookingIds: pendingLoadBookingIds,
        addressIds: []
      });
    }

    const dedupedPoints = [];
    pointsWithLabels.forEach((point) => {
      const prev = dedupedPoints[dedupedPoints.length - 1];
      const sameAsPrev = prev
        && Math.abs(prev.lat - point.lat) < 0.00001
        && Math.abs(prev.lng - point.lng) < 0.00001;
      if (sameAsPrev) {
        if (point.label) {
          prev.label = point.label;
        }
        if (point.stopKind && point.stopKind !== 'start') {
          prev.stopKind = point.stopKind;
        }
        if (Number.isFinite(point.bookingId)) {
          prev.bookingId = point.bookingId;
        }
        if (Number.isFinite(point.addressId)) {
          prev.addressId = point.addressId;
        }
        prev.bookingIds = uniqueNumericIds([...(prev.bookingIds || []), ...(point.bookingIds || []), point.bookingId]);
        prev.addressIds = uniqueNumericIds([...(prev.addressIds || []), ...(point.addressIds || []), point.addressId]);
        return;
      }
      dedupedPoints.push({
        ...point,
        bookingIds: uniqueNumericIds([...(point.bookingIds || []), point.bookingId]),
        addressIds: uniqueNumericIds([...(point.addressIds || []), point.addressId])
      });
    });

    const vehicleType = (vehicle?.type || '').toLowerCase();
    const mode = vehicleType.includes('truck')
      ? 'truck'
      : vehicleType.includes('van')
        ? 'light_truck'
        : vehicleType.includes('scooter')
          ? 'scooter'
          : vehicleType.includes('motor')
            ? 'motorcycle'
            : vehicleType.includes('bike') || vehicleType.includes('bicycle')
              ? 'bicycle'
              : 'drive';
    const recommendedSpeedKmh = mode === 'bicycle' ? 18 : mode === 'scooter' || mode === 'motorcycle' ? 30 : 35;

    return {
      start,
      points: dedupedPoints.map((point) => ({ lat: point.lat, lng: point.lng })),
      pointLabels: dedupedPoints.map((point) => point.label || ''),
      pointMeta: dedupedPoints.map((point, index) => ({
        index,
        lat: Number(point.lat),
        lng: Number(point.lng),
        label: point.label || '',
        stopKind: point.stopKind || (index === 0 ? 'start' : 'waypoint'),
        bookingId: Number.isFinite(point.bookingId) ? Number(point.bookingId) : null,
        addressId: Number.isFinite(point.addressId) ? Number(point.addressId) : null,
        bookingIds: uniqueNumericIds([...(point.bookingIds || []), point.bookingId]),
        addressIds: uniqueNumericIds([...(point.addressIds || []), point.addressId])
      })),
      mode,
      recommendedSpeedKmh
    };
  }, [allowedStopSequence, branchStartPoint, courierStartPoint, deliveryById, effectiveBranchLocation, mapCenter, normalizedCourierRole, pendingLoadBookingIds, pendingLoadDeliveries, routeStartPoint, shouldPreferBranchStart, statusByBooking, vehicle]);

  const routingWaypointParam = useMemo(
    () => navigationContext.points.map((point) => `${point.lat},${point.lng}`).join('|'),
    [navigationContext.points]
  );
  const routingRequestUrl = useMemo(() => {
    if (!geoapifyKey || hideMapForPendingDeliveryLoad || navigationContext.points.length < 2) {
      return '';
    }
    const params = new URLSearchParams({
      waypoints: routingWaypointParam,
      mode: navigationContext.mode,
      format: 'geojson',
      apiKey: geoapifyKey
    });
    return `https://api.geoapify.com/v1/routing?${params.toString()}`;
  }, [geoapifyKey, hideMapForPendingDeliveryLoad, navigationContext.mode, navigationContext.points.length, routingWaypointParam]);
  const navigationUrl = useMemo(() => {
    if (navigationContext.points.length < 2) {
      return `https://www.openstreetmap.org/?mlat=${navigationContext.start.lat}&mlon=${navigationContext.start.lng}#map=15/${navigationContext.start.lat}/${navigationContext.start.lng}`;
    }
    return routingRequestUrl;
  }, [navigationContext.points.length, navigationContext.start.lat, navigationContext.start.lng, routingRequestUrl]);
  const navigationRouteGeometry = useMemo(() => {
    const feature = Array.isArray(routeGeoJson?.features) ? routeGeoJson.features[0] : null;
    const geometryType = String(feature?.geometry?.type || '');
    const coordinates = feature?.geometry?.coordinates;
    if (!['LineString', 'MultiLineString'].includes(geometryType) || !Array.isArray(coordinates)) {
      return null;
    }

    const legs = Array.isArray(feature?.properties?.legs)
      ? feature.properties.legs
        .map((leg) => {
          const fromIndex = Number(leg?.from_index);
          const toIndex = Number(leg?.to_index);
          if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) {
            return null;
          }
          return {
            from_index: Math.max(0, Math.floor(fromIndex)),
            to_index: Math.max(0, Math.floor(toIndex))
          };
        })
        .filter((leg) => Boolean(leg))
      : [];

    return {
      source: 'geoapify',
      mode: navigationContext.mode,
      type: geometryType,
      coordinates,
      legs
    };
  }, [navigationContext.mode, routeGeoJson]);
  const handleStartNavigation = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();
    if (onStartNavigation) {
      const { start, points, pointLabels, pointMeta, recommendedSpeedKmh } = navigationContext;
      const destination = points[points.length - 1] || start;
      onStartNavigation({
        start,
        destination,
        waypoints: points.slice(1),
        routePoints: points,
        routePointLabels: pointLabels,
        routePointMeta: pointMeta,
        routeGeometry: navigationRouteGeometry,
        speedKmh: recommendedSpeedKmh,
        autoStart: points.length > 1
      });
      return;
    }
    if (navigationUrl) {
      window.location.assign(navigationUrl);
    }
  };

  useEffect(() => {
    if (hideMapForPendingDeliveryLoad) {
      setRouteGeoJson(null);
      setRouteError(null);
      setIsRouting(false);
      return;
    }
    if (!routingRequestUrl) {
      setRouteGeoJson(null);
      setRouteError(null);
      setIsRouting(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    setIsRouting(true);
    setRouteError(null);
    fetch(routingRequestUrl, { signal: controller.signal })
      .then((resp) => resp.json())
      .then((data) => {
        if (!isActive) {
          return;
        }
        if (data?.features?.length) {
          setRouteGeoJson(data);
        } else {
          setRouteGeoJson(null);
          setRouteError('No route returned from Geoapify.');
        }
      })
      .catch((error) => {
        if (isActive && error?.name !== 'AbortError') {
          setRouteGeoJson(null);
          setRouteError('Geoapify routing failed.');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRouting(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [hideMapForPendingDeliveryLoad, routingRequestUrl]);

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="Navigation" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Route Optimization</h2>
            <p className="text-xs md:text-sm text-muted-foreground">{routeSubtitle}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          iconName="RefreshCw"
          onClick={() => onRefresh?.()}
          disabled={isLoading}
        />
      </div>
      <div className="space-y-3 mb-4">
        {routes?.length === 0 && (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            {isLoading ? 'Loading routes...' : (emptyStateMessage || 'No optimized routes yet.')}
          </div>
        )}
        {routes?.length === 0 && pendingLoadSummary.length > 0 ? (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <div className="flex items-start gap-2">
              <Icon name="PackageCheck" size={16} className="mt-0.5 text-warning" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Pending Load Confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Load confirmation is required in Trip/Navigation before route optimization unlocks.
                </p>
                {pendingLoadBranch ? (
                  <p className="mt-2 text-xs text-foreground">
                    Branch: {pendingLoadBranch.label}
                    {pendingLoadBranch.address ? `, ${pendingLoadBranch.address}` : ''}
                    {pendingLoadBranch.city ? `, ${pendingLoadBranch.city}` : ''}
                  </p>
                ) : null}
                <div className="mt-2 space-y-1">
                  {pendingLoadSummary.map((item) => (
                    <p key={item.id} className="text-xs text-muted-foreground">
                      {item.trackingId} | {item.status.replaceAll('_', ' ')} | {item.dispatchBranchLabel}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {routes?.map((route, index) => {
          const { preview, remaining, total } = buildStopPreview(route);
          const linehaulSummary = buildLinehaulRouteSummary(route);
          return (
          <div
            key={index}
            className={`border rounded-lg p-4 cursor-pointer transition-smooth ${
              activeRouteIndex === index
                ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => handleRouteSelect(index)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  activeRouteIndex === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {activeRouteIndex === index ? (
                    <Icon name="Check" size={14} />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>
                <h3 className="text-sm md:text-base font-semibold text-foreground">{route?.name}</h3>
              </div>
              {route?.recommended && (
                <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded-md">
                  Recommended
                </span>
              )}
            </div>

            {linehaulSummary ? (
              <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Branch Route</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {linehaulSummary.primary.originLabel}{' -> '}{linehaulSummary.primary.destinationLabel}
                </p>
                {linehaulSummary.extraLegs > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    +{linehaulSummary.extraLegs} more destination branch route
                    {linehaulSummary.extraLegs > 1 ? 's' : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Icon name="MapPin" size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{isLinehaulRoleView ? 'Branch Legs' : 'Stops'}</p>
                  <p className="text-sm font-medium text-foreground">{total}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Navigation2" size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-sm font-medium text-foreground">{route?.distance}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="Clock" size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="text-sm font-medium text-foreground">{route?.estimatedTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="NepalRupee" size={14} className="text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Earnings</p>
                  <p className="text-sm font-medium text-foreground">RS {route?.totalEarnings?.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {route?.score ? (
                  <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md">
                    Score {route?.scoreLabel || route?.score}
                  </span>
                ) : null}
                {route?.lateness ? (
                  <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md">
                    {route?.latenessLabel || route?.lateness}
                  </span>
                ) : null}
              </div>
              {route?.highlights && route?.highlights?.length > 0 && (
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {route?.highlights?.map((highlight, idx) => (
                    <span key={idx} className="px-2 py-1 bg-success/10 text-success text-xs rounded-md">
                      {highlight}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground mb-2">{isLinehaulRoleView ? 'Branch transfer detail' : 'Stops detail'}</p>
              <div className="space-y-1">
                {preview.map((stop) => (
                  <div key={stop.key} className="flex items-start justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        stop.label === 'Pickup'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : stop.label === 'Branch Route' || stop.label === 'Destination Branch'
                            ? 'bg-amber-500/10 text-amber-700'
                            : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {stop.label}
                      </span>
                      <span className="text-foreground">{stop.address}</span>
                    </div>
                    {stop.eta ? (
                      <span className="text-muted-foreground whitespace-nowrap">{stop.eta}</span>
                    ) : null}
                  </div>
                ))}
                {remaining > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    +{remaining} more {isLinehaulRoleView ? 'branch route' : 'stop'}
                    {remaining > 1 ? 's' : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          );
        })}
      </div>
      {hideMapForPendingDeliveryLoad ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
          <p className="text-sm font-semibold text-foreground">Loading Stage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Delivery map and optimized route will unlock after load confirmation in Trip/Navigation.
          </p>
          {pendingLoadBranch ? (
            <p className="mt-2 text-xs text-foreground">
              Dispatch branch: {pendingLoadBranch.label}
              {pendingLoadBranch.address ? `, ${pendingLoadBranch.address}` : ''}
              {pendingLoadBranch.city ? `, ${pendingLoadBranch.city}` : ''}
            </p>
          ) : null}
          {pendingLoadSummary.length > 0 ? (
            <div className="mt-2 space-y-1">
              {pendingLoadSummary.map((item) => (
                <p key={item.id} className="text-xs text-muted-foreground">
                  {item.trackingId} | {item.dispatchBranchLabel}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
      <div className="bg-muted rounded-lg p-4 mb-4">
        <div className="mb-3 rounded-lg border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Current Start Location</p>
              <p className="text-[11px] text-muted-foreground">
                {currentStart
                  ? `${currentStart.lat.toFixed(5)}, ${currentStart.lng.toFixed(5)}`
                  : 'No location available yet'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              iconName="MapPin"
              onClick={handleUseDeviceLocation}
              disabled={Boolean(isUpdatingLocation)}
            >
              {isUpdatingLocation ? 'Updating...' : 'Use Device GPS'}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {isPickOnMapEnabled
                ? 'Pick mode ON: click any map point to set courier current location.'
                : 'Pick mode OFF'}
            </p>
            <Button
              variant={isPickOnMapEnabled ? 'default' : 'outline'}
              size="sm"
              iconName="MousePointerClick"
              onClick={() => setIsPickOnMapEnabled((previous) => !previous)}
              disabled={Boolean(isUpdatingLocation)}
            >
              {isPickOnMapEnabled ? 'Stop Picking' : 'Pick On Map'}
            </Button>
          </div>
          <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleManualLocationSubmit}>
            <input
              type="number"
              step="0.00001"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Latitude"
              value={manualLat}
              onChange={(event) => setManualLat(event.target.value)}
              disabled={Boolean(isUpdatingLocation)}
            />
            <input
              type="number"
              step="0.00001"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Longitude"
              value={manualLng}
              onChange={(event) => setManualLng(event.target.value)}
              disabled={Boolean(isUpdatingLocation)}
            />
            <Button
              variant="default"
              size="sm"
              iconName="Navigation"
              iconPosition="left"
              type="button"
              onClick={applyManualCoordinates}
              disabled={Boolean(isUpdatingLocation)}
            >
              Set Coordinates
            </Button>
          </form>
          {locationUpdateNotice ? (
            <p className="mt-2 text-xs text-success">{locationUpdateNotice}</p>
          ) : null}
          {locationUpdateError ? (
            <p className="mt-2 text-xs text-destructive">{locationUpdateError}</p>
          ) : null}
          {localLocationError ? (
            <p className="mt-2 text-xs text-destructive">{localLocationError}</p>
          ) : null}
        </div>
        <div className="aspect-video bg-background rounded-lg overflow-hidden">
          <MapContainer
            center={mapCenter}
            zoom={13}
            scrollWheelZoom
            className="w-full h-full"
            style={{ height: '100%', width: '100%' }}
          >
            <MapClickPicker enabled={isPickOnMapEnabled && !isUpdatingLocation} onPick={handlePickFromMap} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((marker, index) => (
              <Marker
                key={`${marker.label}-${index}`}
                position={marker.position}
                icon={createLabelIcon(marker.label, marker.color)}
              >
                <Tooltip>{marker.hint}</Tooltip>
              </Marker>
            ))}
            {routeGeoJson ? (
              <GeoJSON
                data={routeGeoJson}
                style={{ color: 'var(--color-primary)', weight: 4, opacity: 0.9 }}
              />
            ) : null}
            <BoundsFitter points={markers} />
          </MapContainer>
        </div>
        {routeError ? (
          <p className="text-xs text-destructive mt-2">{routeError}</p>
        ) : isRouting ? (
          <p className="text-xs text-muted-foreground mt-2">Calculating route with Geoapify...</p>
        ) : null}
      </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="default"
          size="default"
          fullWidth
          iconName="Navigation"
          iconPosition="left"
          onClick={handleStartNavigation}
          disabled={!onStartNavigation && !navigationUrl}
        >
          {pendingLoadSummary.length > 0 && (!Array.isArray(routes) || routes.length === 0)
            ? 'Open Loading Trip'
            : 'Start Navigation'}
        </Button>
        <Button
          variant="outline"
          size="default"
          fullWidth
          iconName="Download"
          iconPosition="left"
          onClick={() => console.log('Download route')}
        >
          Download Route
        </Button>
      </div>
    </div>
  );
};

export default RouteOptimizationPanel;
