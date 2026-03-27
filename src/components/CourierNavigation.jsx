import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import NavigationMap from './NavigationMap';
import TopInstructionBanner from './TopInstructionBanner';
import DriverNavigationPanel from './DriverNavigationPanel';
import MapControls from './MapControls';
import SpeedLimitBadge from './SpeedLimitBadge';
import ConfirmActionsPanel from './ConfirmActionsPanel';
import '../styles/navigation.css';

const CHECKPOINT_RADIUS_METERS = 90;
const MIN_SIM_SPEED_KMH = 5;
const MAX_SIM_SPEED_KMH = 2000;

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
    return null;
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

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) {
    return '-';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.max(1, Math.round(meters))} m`;
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '-';
  }
  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

const CourierNavigation = forwardRef(({
  navPayload,
  useGpsTracking = false,
  gpsLocation = null,
  onDriverMessage,
  showConfirmActions = false,
  className = ''
}, ref) => {
  const navMapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [steps, setSteps] = useState([]);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState(0);
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0);
  const [currentPos, setCurrentPos] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isStepsOpen, setIsStepsOpen] = useState(true);
  const [isRouteSetupOpen, setIsRouteSetupOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [checkpointUnlocked, setCheckpointUnlocked] = useState(false);
  const [checkpointDistanceMeters, setCheckpointDistanceMeters] = useState(null);
  const [speedLimit, setSpeedLimit] = useState(30);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageLabel, setStageLabel] = useState('Build route to start guidance.');
  const [currentLegIndex, setCurrentLegIndex] = useState(-1);
  const [currentLegTotal, setCurrentLegTotal] = useState(0);
  const [startLabel, setStartLabel] = useState('');
  const [endLabel, setEndLabel] = useState('');
  const [routeSetupState, setRouteSetupState] = useState(() => ({
    startName: '',
    startCoords: 'Coordinates: -',
    endName: '',
    endCoords: 'Coordinates: -',
    startSearchQuery: '',
    endSearchQuery: '',
    startSearchResults: [],
    endSearchResults: [],
    pickOptionsOpen: false,
    pickMode: null,
    pickStartThenEnd: false,
    pickHelpText: 'Click Pick on map to choose how you want to pick.',
    placesReady: false
  }));

  const routePoints = useMemo(() => (
    Array.isArray(navPayload?.routePoints)
      ? navPayload.routePoints.map((point) => toPoint(point)).filter((point) => Boolean(point))
      : []
  ), [navPayload?.routePoints]);

  const routePointLabels = useMemo(() => (
    Array.isArray(navPayload?.routePointLabels)
      ? navPayload.routePointLabels.map((label) => String(label || '').trim())
      : []
  ), [navPayload?.routePointLabels]);

  const currentCheckpoint = useMemo(() => {
    if (routePoints.length < 2) {
      return null;
    }
    const fallbackIndex = routePoints.length > 1 ? 1 : 0;
    const targetIndex = Number.isFinite(currentLegIndex) && currentLegIndex >= 0
      ? Math.min(currentLegIndex + 1, routePoints.length - 1)
      : fallbackIndex;
    const point = routePoints[targetIndex];
    const label = routePointLabels[targetIndex] || endLabel || 'Checkpoint';
    if (!point) {
      return null;
    }
    return { ...point, label };
  }, [currentLegIndex, endLabel, routePointLabels, routePoints]);

  useEffect(() => {
    if (!currentPos || !currentCheckpoint) {
      setCheckpointDistanceMeters(null);
      setCheckpointUnlocked(false);
      return;
    }
    const distanceMeters = haversineMeters(currentPos, currentCheckpoint);
    setCheckpointDistanceMeters(distanceMeters);
    setCheckpointUnlocked(Boolean(Number.isFinite(distanceMeters) && distanceMeters <= CHECKPOINT_RADIUS_METERS));
  }, [currentCheckpoint, currentPos]);

  const activeStep = useMemo(() => (
    Number.isFinite(activeStepIndex) && activeStepIndex >= 0 ? (steps[activeStepIndex] || null) : null
  ), [activeStepIndex, steps]);
  const boundedProgressPercent = useMemo(
    () => Math.max(0, Math.min(100, Number(progressPercent) || 0)),
    [progressPercent]
  );
  const remainingDistanceMeters = useMemo(() => (
    Math.max(0, Number(totalDistanceMeters || 0) * (1 - (boundedProgressPercent / 100)))
  ), [boundedProgressPercent, totalDistanceMeters]);
  const remainingTimeSeconds = useMemo(() => (
    Math.max(0, Number(totalTimeSeconds || 0) * (1 - (boundedProgressPercent / 100)))
  ), [boundedProgressPercent, totalTimeSeconds]);

  const bannerDistanceText = useMemo(() => {
    if (Number.isFinite(activeStep?.distanceMeters) && activeStep.distanceMeters > 0) {
      return formatDistance(activeStep.distanceMeters);
    }
    return formatDistance(remainingDistanceMeters);
  }, [activeStep?.distanceMeters, remainingDistanceMeters]);

  const bannerPickupLine = useMemo(() => (
    endLabel ? `Pickup: ${endLabel}` : 'Pickup details will appear here.'
  ), [endLabel]);

  const bannerMetaLine = useMemo(() => {
    const areaName = String(activeStep?.areaName || '').trim();
    if (areaName && stageLabel) {
      return `${areaName} • ${stageLabel}`;
    }
    if (areaName) {
      return areaName;
    }
    return stageLabel || 'Build route to start guidance.';
  }, [activeStep?.areaName, stageLabel]);

  const sheetPickupLabel = useMemo(() => (
    endLabel ? `Heading to ${endLabel}` : 'Waiting for destination...'
  ), [endLabel]);

  const handleDriverMessage = useCallback((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'courier-nav/leg-loaded') {
      const legIndex = Number(message.legIndex);
      const totalLegs = Number(message.totalLegs);
      if (Number.isFinite(legIndex)) {
        setCurrentLegIndex(legIndex);
      }
      if (Number.isFinite(totalLegs)) {
        setCurrentLegTotal(totalLegs);
      }
      const label = String(message.label || '').trim();
      if (label) {
        setEndLabel(label);
      }
      if (Number.isFinite(legIndex) && Number.isFinite(totalLegs) && label) {
        setStageLabel(`Leg ${legIndex + 1} of ${totalLegs}: ${label}`);
      }
    }
    if (message.type === 'courier-nav/leg-reached') {
      const legIndex = Number(message.legIndex);
      const totalLegs = Number(message.totalLegs);
      if (Number.isFinite(legIndex) && Number.isFinite(totalLegs)) {
        setStageLabel(`Leg ${legIndex + 1} of ${totalLegs} reached. Confirm stop to load next leg.`);
      }
    }
    if (message.type === 'courier-nav/route-complete') {
      setStageLabel('Route completed');
    }
    if (typeof onDriverMessage === 'function') {
      onDriverMessage(message);
    }
  }, [onDriverMessage]);

  const handleRouteLoaded = useCallback((payload) => {
    setRouteCoords(Array.isArray(payload?.routeCoords) ? payload.routeCoords : []);
    setSteps(Array.isArray(payload?.steps) ? payload.steps : []);
    setTotalDistanceMeters(Number(payload?.totalDistanceMeters) || 0);
    setTotalTimeSeconds(Number(payload?.totalTimeSeconds) || 0);
    setStageLabel(String(payload?.stageLabel || 'Build route to start guidance.'));
    setStartLabel(String(payload?.startLabel || ''));
    setEndLabel(String(payload?.endLabel || ''));
    setCurrentLegIndex(Number.isFinite(Number(payload?.legIndex)) ? Number(payload.legIndex) : -1);
    setCurrentLegTotal(Number.isFinite(Number(payload?.totalLegs)) ? Number(payload.totalLegs) : 0);
    setProgressPercent(0);
  }, []);

  const handleStartNavigation = useCallback(() => {
    navMapRef.current?.startNavigation?.();
  }, []);

  const handleStopNavigation = useCallback(() => {
    navMapRef.current?.stopNavigation?.({ clearRoute: false, preserveProgress: true, emitEvent: true });
  }, []);

  const canStart = useMemo(
    () => Array.isArray(routeCoords) && routeCoords.length > 1 && !isSimulating,
    [isSimulating, routeCoords]
  );
  const canStop = useMemo(
    () => isSimulating || (Array.isArray(routeCoords) && routeCoords.length > 1),
    [isSimulating, routeCoords]
  );

  useImperativeHandle(ref, () => ({
    handleMessage: (message) => navMapRef.current?.handleMessage?.(message),
    startNavigation: () => navMapRef.current?.startNavigation?.(),
    stopNavigation: (options) => navMapRef.current?.stopNavigation?.(options),
    recenterOnActivePoint: () => navMapRef.current?.recenterOnActivePoint?.(),
    fitRouteInView: () => navMapRef.current?.fitRouteInView?.()
  }), []);

  const wrapperClassName = ['react-courier-navigation', 'nav-body', 'nav-embedded', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName}>
      <div className={`nav-shell ${showConfirmActions ? 'nav-shell--with-confirm' : ''}`}>
        <NavigationMap
          ref={navMapRef}
          navPayload={navPayload}
          useGpsTracking={useGpsTracking}
          gpsLocation={gpsLocation}
          isFollowing={isFollowing}
          speedLimit={speedLimit}
          onDriverMessage={handleDriverMessage}
          onRouteLoaded={handleRouteLoaded}
          onCurrentPosChange={setCurrentPos}
          onSimulationChange={setIsSimulating}
          onActiveStepIndexChange={setActiveStepIndex}
          onRouteProgressChange={setProgressPercent}
          onRouteSetupStateChange={setRouteSetupState}
        />

        <div className="nav-modern-overlay" aria-hidden="false">
          <TopInstructionBanner
            stepType={activeStep?.type}
            distanceText={bannerDistanceText}
            instruction={activeStep?.label || 'Waiting for route'}
            pickupLine={bannerPickupLine}
            metaLine={bannerMetaLine}
          />

          <MapControls
            isFollowing={isFollowing}
            onCenter={() => navMapRef.current?.recenterOnActivePoint?.()}
            onToggleFollow={() => setIsFollowing((previous) => !previous)}
            onFit={() => navMapRef.current?.fitRouteInView?.()}
          />

          <SpeedLimitBadge
            speedLimit={speedLimit}
            minSpeed={MIN_SIM_SPEED_KMH}
            maxSpeed={MAX_SIM_SPEED_KMH}
          />

          <DriverNavigationPanel
            totalDistanceMeters={remainingDistanceMeters}
            totalTimeSeconds={remainingTimeSeconds}
            progressPercent={progressPercent}
            stageLabel={stageLabel}
            steps={steps}
            activeStepIndex={activeStepIndex}
            isSimulating={isSimulating}
            isStepsOpen={isStepsOpen}
            isRouteSetupOpen={isRouteSetupOpen}
            startLabel={startLabel}
            endLabel={endLabel}
            speedLimit={speedLimit}
            minSpeed={MIN_SIM_SPEED_KMH}
            maxSpeed={MAX_SIM_SPEED_KMH}
            isFollowing={isFollowing}
            canStart={canStart}
            canStop={canStop}
            onStart={handleStartNavigation}
            onStop={handleStopNavigation}
            onToggleSteps={() => setIsStepsOpen((previous) => !previous)}
            onToggleRouteSetup={() => setIsRouteSetupOpen((previous) => !previous)}
            routeSetupState={routeSetupState}
            onStartSearchChange={(value) => navMapRef.current?.setStartSearchQuery?.(value)}
            onEndSearchChange={(value) => navMapRef.current?.setEndSearchQuery?.(value)}
            onSetStartFromSearch={() => navMapRef.current?.chooseTopSearchResult?.('start')}
            onSetEndFromSearch={() => navMapRef.current?.chooseTopSearchResult?.('end')}
            onSelectStartSearch={(index) => navMapRef.current?.selectSearchResult?.('start', index)}
            onSelectEndSearch={(index) => navMapRef.current?.selectSearchResult?.('end', index)}
            onTogglePickOptions={() => navMapRef.current?.togglePickOptions?.()}
            onPickStart={() => navMapRef.current?.pickStart?.()}
            onPickEnd={() => navMapRef.current?.pickEnd?.()}
            onPickBoth={() => navMapRef.current?.pickBoth?.()}
            onClosePickOptions={() => navMapRef.current?.closePickOptions?.()}
            onCalculateRoute={() => navMapRef.current?.calculateRoute?.()}
            onClearRoute={() => navMapRef.current?.clearRoute?.()}
            onSpeedChange={(nextValue) => {
              const nextSpeed = Number(nextValue);
              if (!Number.isFinite(nextSpeed)) {
                return;
              }
              setSpeedLimit(Math.max(MIN_SIM_SPEED_KMH, Math.min(MAX_SIM_SPEED_KMH, Math.round(nextSpeed))));
            }}
            onToggleFollow={() => setIsFollowing((previous) => !previous)}
          />

          <section className="nav-modern-sheet">
            <div className="nav-modern-sheet__left">
              <p className="nav-modern-meta">
                <span>{formatEta(remainingTimeSeconds)}</span>
                <span className="nav-modern-meta__dot">•</span>
                <span>{formatDistance(remainingDistanceMeters)}</span>
              </p>
              <p className="nav-modern-pickup">{sheetPickupLabel}</p>
            </div>
            <div className="nav-modern-sheet__right">
              <button
                className="nav-modern-action"
                type="button"
                onClick={handleStartNavigation}
                disabled={!canStart}
              >
                {isSimulating ? 'Running' : 'Navigate'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {showConfirmActions ? (
        <ConfirmActionsPanel
          checkpointLabel={currentCheckpoint?.label || endLabel}
          checkpointDistanceMeters={checkpointDistanceMeters}
          checkpointRadiusMeters={CHECKPOINT_RADIUS_METERS}
          checkpointUnlocked={checkpointUnlocked}
          onConfirm={() => {}}
        />
      ) : null}
    </div>
  );
});

CourierNavigation.displayName = 'CourierNavigation';

export default CourierNavigation;
