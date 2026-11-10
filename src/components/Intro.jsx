import React from 'react';

// Launch: the wordmark comes into focus while the hull line draws under it.
// Exit: both push slightly toward the viewer as the app fades in beneath.
export default function Intro({ out }) {
  return (
    <div className={'intro' + (out ? ' out' : '')} aria-hidden="true">
      <div className="intro-glow" />
      <div className="intro-stack">
        <div className="intro-name">DryDock Safety</div>
        <svg className="intro-hull" viewBox="0 0 320 64" fill="none">
          <path pathLength="1" d="M16 22 L250 19 C272 18 290 14 306 8 L298 40 C297 44 305 46 304 51 C303 55 296 56 288 56 H60 C40 56 26 50 21 40 Z" stroke="rgba(255,255,255,0.42)" strokeWidth="1.2" strokeLinejoin="round" />
          <path pathLength="1" d="M10 40 H312" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
