import React from 'react';
import { CloseIcon, PlayIcon, RouteSetupIcon, StopIcon } from './icons';

const formatMeters = (meters) => {
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

const formatPlaceCoords = (place) => {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '-';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
};

const DriverNavigationPanel = ({
  totalDistanceMeters,
  totalTimeSeconds,
  progressPercent,
  stageLabel,
  steps,
  activeStepIndex,
  isSimulating,
  isStepsOpen,
  isRouteSetupOpen,
  startLabel,
  endLabel,
  speedLimit,
  minSpeed = 5,
  maxSpeed = 2000,
  isFollowing,
  canStart,
  canStop,
  onStart,
  onStop,
  onToggleSteps,
  onToggleRouteSetup,
  routeSetupState,
  onStartSearchChange,
  onEndSearchChange,
  onSetStartFromSearch,
  onSetEndFromSearch,
  onSelectStartSearch,
  onSelectEndSearch,
  onTogglePickOptions,
  onPickStart,
  onPickEnd,
  onPickBoth,
  onClosePickOptions,
  onCalculateRoute,
  onClearRoute,
  onSpeedChange,
  onToggleFollow
}) => {
  const shouldShowResume = Number(progressPercent) > 0 && !isSimulating;
  const startTitle = shouldShowResume ? 'Resume navigation' : 'Start navigation';
  const setup = routeSetupState || {};
  const hasStartQuery = String(setup.startSearchQuery || '').trim().length >= 2;
  const hasEndQuery = String(setup.endSearchQuery || '').trim().length >= 2;
  const boundedProgress = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  const progressBarStyle = {
    width: `${boundedProgress}%`,
    transition: isSimulating ? 'none' : undefined
  };

  return (
    <aside className="nav-panel">
      <div className="nav-block">
        <div className="nav-block__head">
          <h2>Navigation</h2>
          <div className="nav-header-actions">
            <button
              className={`nav-icon-btn route-setup-icon-toggle ${isRouteSetupOpen ? 'open' : ''}`}
              type="button"
              aria-expanded={isRouteSetupOpen ? 'true' : 'false'}
              aria-controls="routeSetupPanel"
              aria-label={isRouteSetupOpen ? 'Close' : 'Route setup'}
              title={isRouteSetupOpen ? 'Close' : 'Route setup'}
              onClick={onToggleRouteSetup}
            >
              {isRouteSetupOpen ? <CloseIcon /> : <RouteSetupIcon />}
            </button>
            <button
              className="btn ghost small nav-section-toggle"
              type="button"
              aria-expanded={isStepsOpen ? 'true' : 'false'}
              aria-controls="routeStepsPanel"
              onClick={onToggleSteps}
            >
              {isStepsOpen ? 'Hide steps' : 'Show steps'}
            </button>
          </div>
        </div>

        {stageLabel ? <p className="route-stage">{stageLabel}</p> : null}

        <div className="nav-stats">
          <div className="nav-stat">
            <span className="nav-stat__label">Distance</span>
            <span className="nav-stat__value">{formatMeters(totalDistanceMeters)}</span>
          </div>
          <div className="nav-stat">
            <span className="nav-stat__label">ETA</span>
            <span className="nav-stat__value">{formatEta(totalTimeSeconds)}</span>
          </div>
        </div>

        <div className="nav-progress">
          <div className="nav-progress__bar" style={progressBarStyle} />
        </div>

        <div className="nav-icon-actions" role="group" aria-label="Navigation actions">
          <button
            className="nav-icon-btn nav-icon-btn--primary nav-icon-btn--action"
            type="button"
            disabled={!canStart}
            onClick={onStart}
            aria-label={startTitle}
            title={startTitle}
          >
            <PlayIcon />
          </button>
          <button
            className="nav-icon-btn nav-icon-btn--neutral nav-icon-btn--action"
            type="button"
            disabled={!canStop}
            onClick={onStop}
            aria-label="Stop navigation"
            title="Stop navigation"
          >
            <StopIcon />
          </button>
        </div>

        <div id="routeSetupPanel" hidden={!isRouteSetupOpen} className="route-setup-panel">
          <div className="field">
            <label htmlFor="startName">Current leg start</label>
            <input
              id="startName"
              type="text"
              readOnly
              value={setup.startName || startLabel || ''}
              placeholder="Choose start point on map"
            />
            <p className="location-meta">{setup.startCoords || 'Coordinates: -'}</p>
          </div>

          <div className="field">
            <label htmlFor="startSearch">Search start location</label>
            <div className="search-row">
              <input
                id="startSearch"
                type="text"
                value={setup.startSearchQuery || ''}
                onChange={(event) => onStartSearchChange?.(event.target.value)}
                placeholder="Type place name"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onSetStartFromSearch?.();
                  }
                }}
              />
              <button className="btn ghost small search-set-btn" type="button" onClick={onSetStartFromSearch}>
                Set
              </button>
            </div>
            {hasStartQuery ? (
              <div className="search-results">
                {!setup.placesReady ? (
                  <div className="search-result-empty">Place data is loading. Try again in a moment.</div>
                ) : Array.isArray(setup.startSearchResults) && setup.startSearchResults.length > 0 ? (
                  setup.startSearchResults.map((place, index) => (
                    <button
                      key={`start-place-${index + 1}`}
                      className="search-result-item"
                      type="button"
                      onClick={() => onSelectStartSearch?.(index)}
                    >
                      <strong>{place?.name || 'Unknown place'}</strong>
                      <span>{formatPlaceCoords(place)}</span>
                    </button>
                  ))
                ) : (
                  <div className="search-result-empty">No place found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="endName">Current leg destination</label>
            <input
              id="endName"
              type="text"
              readOnly
              value={setup.endName || endLabel || ''}
              placeholder="Choose destination point on map"
            />
            <p className="location-meta">{setup.endCoords || 'Coordinates: -'}</p>
          </div>

          <div className="field">
            <label htmlFor="endSearch">Search destination location</label>
            <div className="search-row">
              <input
                id="endSearch"
                type="text"
                value={setup.endSearchQuery || ''}
                onChange={(event) => onEndSearchChange?.(event.target.value)}
                placeholder="Type place name"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onSetEndFromSearch?.();
                  }
                }}
              />
              <button className="btn ghost small search-set-btn" type="button" onClick={onSetEndFromSearch}>
                Set
              </button>
            </div>
            {hasEndQuery ? (
              <div className="search-results">
                {!setup.placesReady ? (
                  <div className="search-result-empty">Place data is loading. Try again in a moment.</div>
                ) : Array.isArray(setup.endSearchResults) && setup.endSearchResults.length > 0 ? (
                  setup.endSearchResults.map((place, index) => (
                    <button
                      key={`end-place-${index + 1}`}
                      className="search-result-item"
                      type="button"
                      onClick={() => onSelectEndSearch?.(index)}
                    >
                      <strong>{place?.name || 'Unknown place'}</strong>
                      <span>{formatPlaceCoords(place)}</span>
                    </button>
                  ))
                ) : (
                  <div className="search-result-empty">No place found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="field-actions">
            <button
              className="btn ghost small"
              type="button"
              aria-expanded={setup.pickOptionsOpen ? 'true' : 'false'}
              onClick={onTogglePickOptions}
            >
              Pick on map
            </button>
          </div>

          {setup.pickOptionsOpen ? (
            <div className="pick-options">
              <div className="field-actions">
                <button className="btn ghost small" type="button" onClick={onPickStart}>Pick Start</button>
                <button className="btn ghost small" type="button" onClick={onPickEnd}>Pick Destination</button>
              </div>
              <div className="field-actions">
                <button className="btn ghost small" type="button" onClick={onPickBoth}>Pick Start &amp; Destination</button>
                <button className="btn ghost small" type="button" onClick={onClosePickOptions}>Cancel</button>
              </div>
            </div>
          ) : null}

          <p className={`pick-help ${setup.pickMode ? 'active' : ''}`}>
            {setup.pickHelpText || 'Click Pick on map to choose how you want to pick.'}
          </p>

          <div className="field two-col">
            <div>
              <label htmlFor="navSpeedInput">Speed (km/h)</label>
              <input
                id="navSpeedInput"
                type="number"
                min={minSpeed}
                max={maxSpeed}
                value={speedLimit}
                onChange={(event) => onSpeedChange?.(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="followToggle">Follow car</label>
              <div className="toggle">
                <input
                  id="followToggle"
                  type="checkbox"
                  checked={Boolean(isFollowing)}
                  onChange={onToggleFollow}
                />
                <label htmlFor="followToggle">Keep centered</label>
              </div>
            </div>
          </div>

          <div className="field-actions">
            <button className="btn" type="button" onClick={onCalculateRoute}>Calculate route</button>
            <button className="btn ghost" type="button" onClick={onClearRoute}>Clear</button>
          </div>
        </div>

        <div className="route-steps-wrap" id="routeStepsPanel" hidden={!isStepsOpen}>
          <div className="route-steps">
            {Array.isArray(steps) && steps.length > 0 ? (
              steps.map((step, index) => {
                const stepMeta = Number(step?.distanceMeters) > 0
                  ? `${formatMeters(step.distanceMeters)} | ${formatEta(step.timeSeconds)}`
                  : '';
                return (
                  <div
                    key={`${String(step?.label || 'step')}-${index}`}
                    className={`route-step ${index === activeStepIndex ? 'active' : ''}`}
                  >
                    <span className={`route-step__icon ${step?.type || 'continue'}`} />
                    <div className="route-step__content">
                      <strong>{step?.label || 'Continue'}</strong>
                      <span className="route-step__meta">{stepMeta || ' '}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="nav-empty">No navigation steps yet.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default DriverNavigationPanel;
