import React from 'react';

const SpeedLimitBadge = ({
  speedLimit = 30,
  minSpeed = 5,
  maxSpeed = 2000
}) => (
  <div className="nav-modern-speed" aria-label="Speed limit">
    <p className="nav-modern-speed__value">{Math.max(minSpeed, Math.min(maxSpeed, Math.round(Number(speedLimit) || 30)))}</p>
    <p className="nav-modern-speed__label">LIMIT</p>
  </div>
);

export default SpeedLimitBadge;
