import React, { useId } from 'react';
import { zoneSpan } from '../lib/hull.js';
import { HAZARDS, ISSUES, STATUS, zoneTitle } from '../lib/model.js';
import { pick } from '../lib/i18n.js';

// The ship in profile, bow to the right, standing on its keel blocks.
// One band per deck (tank top at the bottom); each zone is drawn where it sits along the hull.
// Zones that overlap along the length (port and starboard) share the band in rows.
export default function ShipProfile({ ship, a, lang, compact, onOpen }) {
  const clip = useId();
  const D = compact ? 230 : 100, yD = 86, yK = yD + D;
  const hull = `M 30 ${yD} L 566 ${yD - 6} C 612 ${yD - 7} 652 ${yD - 16} 694 ${yD - 32} L 676 ${yD + 0.52 * D} C 674 ${yD + 0.64 * D} 694 ${yD + 0.7 * D} 692 ${yD + 0.84 * D} C 690 ${yD + 0.96 * D} 672 ${yK} 652 ${yK} L 126 ${yK} C 84 ${yK} 50 ${yK - 0.16 * D} 40 ${yD + 0.56 * D} Z`;
  const top = yD + 8, bottom = yK - 8, H = bottom - top, X0 = 44, X1 = 676, LEN = X1 - X0;
  const tech = ship.decks.filter((d) => d.layout === 'technical'), inner = ship.decks.filter((d) => d.layout !== 'technical');
  const lanes = [...inner].reverse().concat(tech);
  const n = Math.max(1, lanes.length), gap = 4;
  const lh = Math.min(compact ? 96 : 38, (H - gap * (n - 1)) / n), pad = (H - (lh * n + gap * (n - 1))) / 2;
  const blocks = []; for (let x = 140; x <= 632; x += 41) blocks.push(x);
  const dot = compact ? 8 : 4.6;

  const marks = [];
  lanes.forEach((deck, li) => {
    const y0 = top + pad + li * (lh + gap);
    const items = deck.zones.map((z) => { const [t0, t1] = zoneSpan(z); return { z, x: X1 - t1 * LEN, w: Math.max(10, (t1 - t0) * LEN) }; }).sort((p, q) => p.x - q.x || q.w - p.w);
    const ends = [];
    items.forEach((it) => { let r = ends.findIndex((end) => end <= it.x - 2); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = it.x + it.w; it.r = r; });
    const rc = Math.max(1, ends.length), rh = (lh - 2 * (rc - 1)) / rc;
    items.forEach((it) => marks.push({ ...it, deck, y: y0 + it.r * (rh + 2), h: rh }));
  });

  const describe = (m) => {
    const zi = a.info.get(m.z.id), h = HAZARDS[m.z.type], s = STATUS[m.z.status];
    const parts = [zoneTitle(m.z, lang), m.deck.name, pick(lang, h.label.fr, h.label.en), pick(lang, s.fr, s.en)];
    if (zi && zi.issues.length) parts.push(zi.issues.map((i) => pick(lang, ISSUES[i.code].fr, ISSUES[i.code].en)).join(', '));
    return parts.join(' — ');
  };

  return (
    <svg className="profile" viewBox={`0 22 720 ${yK + 12}`} role="group" aria-label={pick(lang, 'Profil du navire : zones de travaux par pont', 'Ship profile: work zones by deck')}>
      <defs><clipPath id={clip}><path d={hull} /></clipPath></defs>
      <path className="line" d={`M 64 ${yD} V 50 H 186 V 62 H 208 V ${yD - 2}`} />
      <path className="line" d="M 100 50 V 30 H 128 V 50" />
      <path className="line" d={`M 250 ${yD - 3} v -6 h 72 v 6 M 350 ${yD - 4} v -6 h 72 v 6 M 450 ${yD - 5} v -6 h 72 v 6`} />
      <path className="line" d={`M 598 ${yD - 8} V 44 M 590 54 H 606`} />
      <path className="line" d={`M 46 ${yD + 0.68 * D} V ${yK} H 60 V ${yK - 0.14 * D}`} />
      <path className="hull" d={hull} />
      <g clipPath={`url(#${clip})`}>
        {lanes.map((deck, li) => { const y = top + pad + li * (lh + gap); return <rect key={deck.id} x="0" y={y} width="720" height={lh} fill="rgba(255,255,255,0.035)" />; })}
        {marks.map((m) => <rect key={'m' + m.z.id} className="mark-bg" x={m.x} y={m.y} width={m.w} height={m.h} rx="3" fill="#0d0d0f" />)}
      </g>
      {blocks.map((x) => <rect key={x} className="block" x={x} y={yK + 2} width="16" height="18" rx="1.5" />)}
      <path className="floor" d={`M 4 ${yK + 21} H 716`} />
      <g clipPath={`url(#${clip})`}>
        {marks.map((m) => {
          const zi = a.info.get(m.z.id), flag = zi && (zi.state === 'blocked' || zi.state === 'attention') ? zi.state : null;
          const label = describe(m);
          return (
            <g key={m.z.id} className={'pz hz-' + m.z.type + ' ' + m.z.status} role="button" tabIndex={0} aria-label={label}
              onClick={() => onOpen(m.z.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(m.z.id); } }}>
              <title>{label}</title>
              <rect className="mark" x={m.x} y={m.y} width={m.w} height={m.h} rx="3" />
              {flag && <circle className={'flag ' + flag} cx={m.x + m.w - dot - 1} cy={m.y + Math.min(m.h / 2, dot + 1)} r={dot} />}
              <rect className="hit" x={Math.min(m.x, m.x + m.w / 2 - 14)} y={m.y - 2} width={Math.max(m.w, 28)} height={m.h + 4} />
            </g>);
        })}
      </g>
    </svg>
  );
}
