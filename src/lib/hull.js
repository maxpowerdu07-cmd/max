// Deck plan geometry. A deck plan is a 200 × 280 drawing, bow at the top; zones are stored as
// percentages of it (x% × 2, y% × 2.8). The same numbers place zones in the 3D hull and on the profile.

export const DECK_LAYOUTS = {
  main: [
    { x: 70, y: 34, w: 60, h: 20, fr: 'Pic avant', en: 'Forepeak' },
    { x: 54, y: 58, w: 36, h: 32, fr: 'Cabines BB', en: 'Cabins (P)' },
    { x: 92, y: 58, w: 16, h: 108, fr: 'Coursive', en: 'Corridor', v: true },
    { x: 110, y: 58, w: 36, h: 32, fr: 'Cabines TB', en: 'Cabins (S)' },
    { x: 54, y: 92, w: 36, h: 32, fr: 'Magasin', en: 'Store' },
    { x: 110, y: 92, w: 36, h: 32, fr: 'Atelier', en: 'Workshop' },
    { x: 54, y: 126, w: 36, h: 40, fr: 'Citerne BB', en: 'Tank (P)' },
    { x: 110, y: 126, w: 36, h: 40, fr: 'Citerne TB', en: 'Tank (S)' },
    { x: 54, y: 168, w: 92, h: 42, fr: 'Salle des machines', en: 'Engine room' },
    { x: 60, y: 212, w: 80, h: 34, fr: 'Local de barre', en: 'Steering gear' },
  ],
  cabins: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Pic avant', en: 'Forepeak' },
    { x: 54, y: 56, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 82, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 108, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 134, w: 36, h: 30, fr: 'Sanitaires', en: 'Sanitary' },
    { x: 92, y: 56, w: 16, h: 108, fr: 'Coursive', en: 'Corridor', v: true },
    { x: 110, y: 56, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 82, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 108, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 134, w: 36, h: 30, fr: 'Sanitaires', en: 'Sanitary' },
    { x: 54, y: 168, w: 92, h: 42, fr: 'Réfectoire', en: 'Mess room' },
    { x: 60, y: 212, w: 80, h: 34, fr: 'Local technique', en: 'Technical room' },
  ],
  machinery: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Local étrave', en: 'Bow space' },
    { x: 54, y: 56, w: 38, h: 30, fr: 'Atelier', en: 'Workshop' },
    { x: 108, y: 56, w: 38, h: 30, fr: 'Soute BB/TB', en: 'Bunkers P/S' },
    { x: 54, y: 90, w: 44, h: 30, fr: 'Salle de contrôle', en: 'Control room' },
    { x: 102, y: 90, w: 44, h: 30, fr: 'Tableau élec.', en: 'Switchboard' },
    { x: 54, y: 124, w: 44, h: 34, fr: 'Groupe élec. BB', en: 'Generator (P)' },
    { x: 102, y: 124, w: 44, h: 34, fr: 'Groupe élec. TB', en: 'Generator (S)' },
    { x: 54, y: 162, w: 92, h: 50, fr: 'Moteur principal', en: 'Main engine' },
    { x: 60, y: 214, w: 80, h: 32, fr: 'Local de barre', en: 'Steering gear' },
  ],
  technical: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Pic avant (ballast)', en: 'Forepeak (ballast)' },
    { x: 54, y: 56, w: 40, h: 50, fr: 'Ballast BB 1', en: 'Ballast (P) 1' },
    { x: 96, y: 56, w: 8, h: 102, fr: 'Tunnel', en: 'Pipe tunnel', v: true },
    { x: 106, y: 56, w: 40, h: 50, fr: 'Ballast TB 1', en: 'Ballast (S) 1' },
    { x: 54, y: 108, w: 40, h: 50, fr: 'Ballast BB 2', en: 'Ballast (P) 2' },
    { x: 106, y: 108, w: 40, h: 50, fr: 'Ballast TB 2', en: 'Ballast (S) 2' },
    { x: 54, y: 160, w: 92, h: 46, fr: 'Soute combustible', en: 'Fuel bunker' },
    { x: 60, y: 210, w: 80, h: 34, fr: 'Pic arrière', en: 'Aft peak' },
  ],
};

export const HULL_PATH = 'M 100 8 C 130 22, 150 46, 152 80 L 152 232 C 152 258, 130 272, 100 274 C 70 272, 48 258, 48 232 L 48 80 C 50 46, 70 22, 100 8 Z';

export const planX = (x, B) => ((x - 100) / 52) * (B / 2);
export const planZ = (y, L) => ((y - 8) / 266 - 0.5) * L;

// Half-breadth of the hull along its length: [y, halfBreadth 0..1] from bow to stern.
export function hullStations() {
  const bez = (p0, p1, p2, p3, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return o; };
  return [...bez([100, 8], [130, 22], [150, 46], [152, 80], 10), ...bez([152, 232], [152, 258], [130, 272], [100, 274], 10)].map(([x, y]) => [y, (x - 100) / 52]);
}

export function roomsOf(deck) {
  return deck.aiRooms && deck.aiRooms.length ? deck.aiRooms : (DECK_LAYOUTS[deck.layout] || DECK_LAYOUTS.main);
}

// Where a zone sits along the ship: 0 = bow, 1 = stern.
export function zoneSpan(z) {
  const t = (v) => Math.max(0, Math.min(1, (v * 2.8 - 8) / 266));
  return [t(z.y), t(z.y + z.h)];
}
// A zone on a tank-top deck that reaches outside the beam is on the outer hull (scaffolding).
export function zoneIsOutboard(z) { const xs = z.x * 2, ws = z.w * 2; return !(xs >= 48 && xs + ws <= 152); }
