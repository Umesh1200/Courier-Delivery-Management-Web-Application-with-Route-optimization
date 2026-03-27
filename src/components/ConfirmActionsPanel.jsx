import React from 'react';

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) {
    return '-';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.max(1, Math.round(meters))} m`;
};

const ConfirmActionsPanel = ({
  checkpointLabel,
  checkpointDistanceMeters,
  checkpointRadiusMeters = 90,
  checkpointUnlocked,
  onConfirm
}) => (
  <aside className="nav-confirm">
    <div className="nav-confirm__head">
      <p className="nav-confirm__eyebrow">Confirm Actions</p>
      <h2>Navigation Checkpoint</h2>
      <p>Confirmation unlocks within {checkpointRadiusMeters}m.</p>
    </div>
    <div className="nav-confirm__card">
      <p className="nav-confirm__label">Current Checkpoint</p>
      <p className="nav-confirm__name">{checkpointLabel || 'No active checkpoint'}</p>
      <p className="nav-confirm__meta">
        {formatDistance(checkpointDistanceMeters)} away | radius {checkpointRadiusMeters}m
      </p>
    </div>
    <button
      type="button"
      className="nav-confirm__btn"
      disabled={!checkpointUnlocked}
      title={checkpointUnlocked ? 'Confirm Pickup' : `Move within ${checkpointRadiusMeters}m to unlock`}
      onClick={onConfirm}
    >
      Confirm Pickup
    </button>
    <p className="nav-confirm__hint">Move within {checkpointRadiusMeters}m to unlock this action.</p>
  </aside>
);

export default ConfirmActionsPanel;
