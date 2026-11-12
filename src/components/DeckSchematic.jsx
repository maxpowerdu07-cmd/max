import React from 'react';
import { HULL_PATH, roomsOf } from '../lib/hull.js';
import { pick } from '../lib/i18n.js';

// Schematic deck: hull outline and compartments, bow at the top.
export default function DeckSchematic({ deck, lang }) {
  const rooms = roomsOf(deck);
  return (
    <svg className="schem" viewBox="0 0 200 280" aria-hidden="true">
      <path className="hull" d={HULL_PATH} />
      {rooms.map((r, i) => {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return (
          <g key={i}>
            <rect className="room" x={r.x} y={r.y} width={r.w} height={r.h} rx="1.4" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" transform={r.v ? `rotate(-90 ${cx} ${cy})` : undefined}>{pick(lang, r.fr, r.en)}</text>
          </g>);
      })}
      <text className="end" x="100" y="21" textAnchor="middle">{pick(lang, 'PROUE', 'BOW')}</text>
      <text className="end" x="100" y="267" textAnchor="middle">{pick(lang, 'POUPE', 'STERN')}</text>
    </svg>
  );
}
