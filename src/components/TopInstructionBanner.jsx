import React from 'react';
import {
  ArriveIcon,
  TurnDownIcon,
  TurnLeftIcon,
  TurnRightIcon,
  TurnStraightIcon
} from './icons';

const iconByType = {
  'turn-left': TurnLeftIcon,
  'turn-right': TurnRightIcon,
  uturn: TurnDownIcon,
  arrive: ArriveIcon
};

const TopInstructionBanner = ({
  stepType,
  distanceText,
  instruction,
  pickupLine,
  metaLine
}) => {
  const IconComponent = iconByType[String(stepType || '').toLowerCase()] || TurnStraightIcon;

  return (
    <section className="nav-modern-banner" role="status">
      <div className="nav-modern-turn-icon">
        <IconComponent />
      </div>
      <div className="nav-modern-turn-body">
        <p className="nav-modern-turn-distance">{distanceText || '-'}</p>
        <h2 className="nav-modern-turn-street">{instruction || 'Waiting for route'}</h2>
        <p className="nav-modern-subline">{pickupLine || 'Pickup details will appear here.'}</p>
        <p className="nav-modern-subline nav-modern-subline--muted">{metaLine || 'Build route to start guidance.'}</p>
      </div>
    </section>
  );
};

export default TopInstructionBanner;
