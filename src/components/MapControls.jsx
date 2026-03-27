import React from 'react';
import { CenterIcon, FitIcon, FollowIcon, UnfollowIcon } from './icons';

const MapControls = ({ isFollowing, onCenter, onToggleFollow, onFit }) => (
  <div className="nav-modern-controls" aria-label="Map controls">
    <button
      className="nav-modern-btn nav-modern-btn--icon"
      type="button"
      title="Center"
      aria-label="Center"
      onClick={onCenter}
    >
      <CenterIcon />
    </button>
    <button
      className={`nav-modern-btn nav-modern-btn--icon ${isFollowing ? 'is-active' : ''}`}
      type="button"
      title={isFollowing ? 'Unfollow' : 'Follow'}
      aria-label={isFollowing ? 'Unfollow' : 'Follow'}
      onClick={onToggleFollow}
    >
      {isFollowing ? <UnfollowIcon /> : <FollowIcon />}
    </button>
    <button
      className="nav-modern-btn nav-modern-btn--icon"
      type="button"
      title="Fit route"
      aria-label="Fit route"
      onClick={onFit}
    >
      <FitIcon />
    </button>
  </div>
);

export default MapControls;
