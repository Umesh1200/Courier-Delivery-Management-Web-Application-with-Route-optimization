import React from 'react';

const baseProps = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true'
};

const IconBase = ({ children }) => (
  <svg {...baseProps}>
    {children}
  </svg>
);

export const RouteSetupIcon = () => (
  <IconBase>
    <path d="M4.5 6.5 9 4.5l3.5 2 3-2 4 2v11l-4 2-3.5-2-3 2-4.5-2z" />
    <path d="M9 4.5V17" />
    <path d="M12.5 6.5v11" />
    <path d="M15.5 4.5V17" />
    <path d="M8.25 13.25h2.75" />
    <path d="M14 9.75h2.25" />
  </IconBase>
);

export const CloseIcon = () => (
  <IconBase>
    <path d="M7 7 17 17" />
    <path d="M17 7 7 17" />
  </IconBase>
);

export const CenterIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="3.25" />
    <circle cx="12" cy="12" r="7.75" />
    <path d="M12 2.75v2.5" />
    <path d="M12 18.75v2.5" />
    <path d="M2.75 12h2.5" />
    <path d="M18.75 12h2.5" />
  </IconBase>
);

export const FollowIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="3.25" />
    <circle cx="12" cy="12" r="7.75" />
    <path d="M12 2.75v2.5" />
    <path d="M12 18.75v2.5" />
    <path d="M2.75 12h2.5" />
    <path d="M18.75 12h2.5" />
  </IconBase>
);

export const UnfollowIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="3.25" />
    <circle cx="12" cy="12" r="7.75" />
    <path d="M12 2.75v2.5" />
    <path d="M12 18.75v2.5" />
    <path d="M2.75 12h2.5" />
    <path d="M18.75 12h2.5" />
    <path d="m5 5 14 14" />
  </IconBase>
);

export const FitIcon = () => (
  <IconBase>
    <path d="M8 4H4v4" />
    <path d="M16 4h4v4" />
    <path d="M4 16v4h4" />
    <path d="M20 16v4h-4" />
    <path d="M9 9 6 6" />
    <path d="M15 9 18 6" />
    <path d="M9 15 6 18" />
    <path d="M15 15 18 18" />
  </IconBase>
);

export const PlayIcon = () => (
  <IconBase>
    <path d="m9 7 8 5-8 5z" />
  </IconBase>
);

export const StopIcon = () => (
  <IconBase>
    <rect x="8" y="8" width="8" height="8" rx="1.2" />
  </IconBase>
);

export const TurnStraightIcon = () => (
  <IconBase>
    <path d="M12 19V5" />
    <path d="m8.5 8.5 3.5-3.5 3.5 3.5" />
  </IconBase>
);

export const TurnLeftIcon = () => (
  <IconBase>
    <path d="M18.5 8.5H10a4 4 0 0 0-4 4V19" />
    <path d="m10 12.5-4-4 4-4" />
  </IconBase>
);

export const TurnRightIcon = () => (
  <IconBase>
    <path d="M5.5 8.5H14a4 4 0 0 1 4 4V19" />
    <path d="m14 12.5 4-4-4-4" />
  </IconBase>
);

export const TurnDownIcon = () => (
  <IconBase>
    <path d="M12 5v14" />
    <path d="m8.5 15.5 3.5 3.5 3.5-3.5" />
  </IconBase>
);

export const ArriveIcon = () => (
  <IconBase>
    <path d="M12 20s6-5.33 6-10a6 6 0 1 0-12 0c0 4.67 6 10 6 10z" />
    <circle cx="12" cy="10" r="2.25" />
  </IconBase>
);
