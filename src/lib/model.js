// Data model, sample vessels and the analysis that every view reads (readiness, alerts, costs).
import { DAY, pick } from './i18n.js';

const MIN = 60000, HOUR = 3600000;

export const SHARED_KEY = 'dd_shared_v4';
export const PRESENCE_KEY = 'dd_presence_v4';
export const PENDING_KEY = 'dd_pending_v3';
export const COORD_CODE = 'DRYDOCK2026';

export function uid() { return Math.random().toString(36).slice(2, 9); }

// Hazard colours: iOS system red, purple, yellow and cyan. Checked with the dataviz palette
// validator on the plan surface, all pairs: worst colour-blind ΔE 17.7, worst normal-vision ΔE 27.7.
// Every hazard also carries an icon and a label, so colour is never the only cue.
export const HAZARDS = {
  hot: { color: '#ff453a', label: { fr: 'Travaux à chaud', en: 'Hot work' },
    epi: [{ fr: 'Masque de soudure', en: 'Welding mask' }, { fr: 'Tablier ignifuge', en: 'Fire-retardant apron' }, { fr: 'Gants de soudeur', en: 'Welding gloves' }, { fr: 'Surveillant incendie', en: 'Fire watch' }],
    permit: { fr: 'Permis de feu obligatoire', en: 'Hot work permit required' } },
  confined: { color: '#bf5af2', label: { fr: 'Espace confiné', en: 'Confined space' },
    epi: [{ fr: 'Détecteur 4 gaz', en: '4-gas detector' }, { fr: 'Harnais + ligne de vie', en: 'Harness + lifeline' }, { fr: 'Ventilation forcée', en: 'Forced ventilation' }, { fr: 'Surveillant à l’entrée', en: 'Standby attendant' }],
    permit: { fr: 'Permis d’entrée + test gaz', en: 'Entry permit + gas test' } },
  height: { color: '#ffd60a', label: { fr: 'Travail en hauteur', en: 'Working at height' },
    epi: [{ fr: 'Harnais antichute', en: 'Fall-arrest harness' }, { fr: 'Double longe', en: 'Double lanyard' }, { fr: 'Casque à jugulaire', en: 'Chin-strap helmet' }],
    permit: { fr: 'Échafaudage validé (étiquette verte)', en: 'Scaffold validated (green tag)' } },
  blast: { color: '#64d2ff', label: { fr: 'Sablage / Peinture', en: 'Blasting / Painting' },
    epi: [{ fr: 'Masque à adduction d’air', en: 'Air-fed respirator' }, { fr: 'Combinaison étanche', en: 'Sealed coverall' }, { fr: 'Gants nitrile', en: 'Nitrile gloves' }, { fr: 'Protection auditive', en: 'Hearing protection' }],
    permit: { fr: 'Zone balisée et ventilée', en: 'Cordoned & ventilated area' } },
};
export const HAZARD_KEYS = ['hot', 'confined', 'height', 'blast'];

export const STATUS = {
  planned: { fr: 'Planifié', en: 'Planned' },
  progress: { fr: 'En cours', en: 'In progress' },
  done: { fr: 'Terminé', en: 'Completed' },
};
export const STATUS_KEYS = ['planned', 'progress', 'done'];

// Company colours on the plan: the dataviz reference categorical palette, dark steps, fixed order.
// Validated on #1c1c1e (worst adjacent colour-blind ΔE 8.4). Past eight, a company reads as "other".
export const COMPANY_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const COMPANY_OTHER = '#8e8e93';
export function companyList(zones) { const set = []; zones.forEach((z) => { if (z.company && !set.includes(z.company)) set.push(z.company); }); return set; }
export function companyColor(name, companies) { const i = companies.indexOf(name); return i < 0 || i >= COMPANY_PALETTE.length ? COMPANY_OTHER : COMPANY_PALETTE[i]; }

export const DEFAULT_COSTS = { currency: 'EUR', labour: 45, fireWatch: 32, dockDay: 15000, shift: 8, cooldown: 60 };

// Incompatible works placed too close on the same deck.
export const CONFLICT_RULES = [
  { a: 'hot', b: 'blast', margin: 10, fr: 'Travaux à chaud à proximité de sablage/peinture — vapeurs et poussières inflammables', en: 'Hot work near blasting/painting — flammable vapours & dust' },
  { a: 'hot', b: 'confined', margin: 8, fr: 'Travaux à chaud à proximité d’un espace confiné — atmosphère intérieure à risque', en: 'Hot work near a confined space — internal atmosphere at risk' },
  { a: 'blast', b: 'confined', margin: 8, fr: 'Sablage/peinture près d’un espace confiné — contamination possible de l’atmosphère', en: 'Blasting/painting near a confined space — possible atmosphere contamination' },
];
function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}
export function zoneConflicts(zones) {
  const out = [];
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const z1 = zones[i], z2 = zones[j];
    if (z1.status === 'done' || z2.status === 'done') continue;
    CONFLICT_RULES.forEach((r) => {
      if ((z1.type === r.a && z2.type === r.b) || (z1.type === r.b && z2.type === r.a)) {
        if (rectGap(z1, z2) <= r.margin) out.push({ z1, z2, rule: r });
      }
    });
  }
  return out;
}

function permitSvg() {
  const rows = ['Date / Date : 08-06-2026', 'Lieu / Location : Pont 1 - proue', 'Duree / Duration : 08:00 - 16:00',
    'Surveillant incendie / Fire watch : J. Pieters', 'Extincteur verifie / Extinguisher checked : OUI',
    'Atmosphere testee / Atmosphere tested : OUI', 'Signature coordination : __________'];
  let y = 250; let body = '';
  rows.forEach((r) => { body += "<text x='50' y='" + y + "' font-family='Arial' font-size='22' fill='#0A2540'>" + r + "</text>"; y += 55; });
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='760' height='980'><rect width='760' height='980' fill='#ffffff' stroke='#cbd5e1'/><rect x='0' y='0' width='760' height='110' fill='#ef4444'/><text x='40' y='70' font-family='Arial' font-size='38' font-weight='bold' fill='#ffffff'>HOT WORK PERMIT</text><text x='50' y='175' font-family='Arial' font-size='24' font-weight='bold' fill='#0A2540'>Permis de travail a chaud</text>" + body + "<rect x='50' y='820' width='660' height='110' fill='none' stroke='#94a3b8'/><text x='65' y='855' font-family='Arial' font-size='16' fill='#64748b'>Document importe - exemple de demonstration</text></svg>";
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function atmoSvg() {
  const rows = ['Heure / Time : 07:45', 'O2 : 20.9 %  (19.5 - 23.5)', 'LEL : 0 %', 'H2S : 0 ppm', 'CO : 0 ppm',
    'Resultat / Result : SAFE FOR ENTRY', 'Testeur / Tester : M. de Vries', 'Re-test : toutes les 2h'];
  let y = 250; let body = '';
  rows.forEach((r) => { body += "<text x='50' y='" + y + "' font-family='Arial' font-size='22' fill='#0A2540'>" + r + "</text>"; y += 55; });
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='760' height='980'><rect width='760' height='980' fill='#ffffff' stroke='#cbd5e1'/><rect x='0' y='0' width='760' height='110' fill='#f97316'/><text x='40' y='70' font-family='Arial' font-size='34' font-weight='bold' fill='#ffffff'>ATMOSPHERIC TEST</text><text x='50' y='175' font-family='Arial' font-size='24' font-weight='bold' fill='#0A2540'>Test atmospherique - espace confine</text>" + body + "<rect x='50' y='820' width='660' height='110' fill='none' stroke='#94a3b8'/><text x='65' y='855' font-family='Arial' font-size='16' fill='#64748b'>Document importe - exemple de demonstration</text></svg>";
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Résultat d'exemple si l'appel IA échoue (plan type pétrolier)
export const AI_FALLBACK = { demo: true, decks: [
  { name: 'Pont principal — Citernes cargo', layout: 'technical',
    compartments: [
      { fr: 'Pic avant', en: 'Forepeak', x: 25, y: 1, w: 50, h: 7 },
      { fr: 'COT 1 BB', en: 'COT 1 P', x: 6, y: 10, w: 42, h: 13 }, { fr: 'COT 1 TB', en: 'COT 1 S', x: 52, y: 10, w: 42, h: 13 },
      { fr: 'COT 2 BB', en: 'COT 2 P', x: 6, y: 25, w: 42, h: 13 }, { fr: 'COT 2 TB', en: 'COT 2 S', x: 52, y: 25, w: 42, h: 13 },
      { fr: 'COT 3 BB', en: 'COT 3 P', x: 6, y: 40, w: 42, h: 13 }, { fr: 'COT 3 TB', en: 'COT 3 S', x: 52, y: 40, w: 42, h: 13 },
      { fr: 'Slop BB', en: 'Slop P', x: 6, y: 55, w: 42, h: 9 }, { fr: 'Slop TB', en: 'Slop S', x: 52, y: 55, w: 42, h: 9 },
      { fr: 'Chambre des pompes', en: 'Pump room', x: 20, y: 66, w: 60, h: 8 },
      { fr: 'Château / Machines', en: 'Casing / Engine', x: 14, y: 76, w: 72, h: 20 },
    ],
    suggestedZones: [
      { type: 'confined', x: 54, y: 42, w: 24, h: 12, workFr: 'Nettoyage COT 3 TB', workEn: 'COT 3 S tank cleaning' },
      { type: 'hot', x: 30, y: 20, w: 22, h: 10, workFr: 'Réparation collecteur cargo', workEn: 'Cargo manifold repair' },
      { type: 'blast', x: 10, y: 56, w: 28, h: 10, workFr: 'Sablage pont arrière', workEn: 'Aft deck blasting' },
    ] },
  { name: 'Salle des machines', layout: 'machinery',
    compartments: [
      { fr: 'Atelier', en: 'Workshop', x: 8, y: 6, w: 40, h: 14 }, { fr: 'Salle de contrôle', en: 'Control room', x: 52, y: 6, w: 40, h: 14 },
      { fr: 'Groupes élec.', en: 'Generators', x: 8, y: 24, w: 84, h: 16 },
      { fr: 'Moteur principal', en: 'Main engine', x: 14, y: 44, w: 72, h: 26 },
      { fr: 'Double-fond', en: 'Double bottom', x: 8, y: 74, w: 84, h: 12 },
      { fr: 'Local de barre', en: 'Steering gear', x: 20, y: 89, w: 60, h: 9 },
    ],
    suggestedZones: [
      { type: 'hot', x: 20, y: 46, w: 26, h: 14, workFr: 'Tuyautage moteur principal', workEn: 'Main engine piping' },
      { type: 'confined', x: 12, y: 74, w: 32, h: 11, workFr: 'Inspection double-fond', workEn: 'Double bottom inspection' },
    ] },
  { name: 'Accommodations / Passerelle', layout: 'cabins',
    compartments: [
      { fr: 'Passerelle', en: 'Bridge', x: 20, y: 4, w: 60, h: 12 },
      { fr: 'Cabines officiers', en: 'Officers cabins', x: 8, y: 20, w: 40, h: 22 }, { fr: 'Cabines équipage', en: 'Crew cabins', x: 52, y: 20, w: 40, h: 22 },
      { fr: 'Cuisine', en: 'Galley', x: 8, y: 46, w: 40, h: 14 }, { fr: 'Réfectoire', en: 'Mess room', x: 52, y: 46, w: 40, h: 14 },
      { fr: 'Local technique', en: 'Technical room', x: 20, y: 64, w: 60, h: 12 },
    ],
    suggestedZones: [
      { type: 'height', x: 16, y: 2, w: 30, h: 14, workFr: 'Échafaudage façade passerelle', workEn: 'Bridge front scaffolding' },
    ] },
] };

export function makeExampleShip() {
  const now = Date.now();
  const sod = new Date(now); sod.setHours(0, 0, 0, 0); const day0 = sod.getTime();
  const ago = (min) => now - min * MIN;
  const E = (name, inMin, outMin) => ({ id: uid(), name, inAt: ago(inMin), outAt: outMin == null ? null : ago(outMin) });
  const L = (min, fr, en) => ({ id: uid(), ts: ago(min), fr, en });
  const hotId = uid(), tankId = uid(), portId = uid(), stbdId = uid(), anodeId = uid(), chestId = uid();
  return { id: uid(), name: 'MV Demo Vessel',
    dock: { dockLength: 180, dockWidth: 32, shipLength: 154, shipWidth: 25 },
    schedule: { dockIn: day0 - 9 * DAY + 7 * HOUR, undock: day0 + 5 * DAY + 16 * HOUR },
    costs: { ...DEFAULT_COSTS },
    crew: {
      coordinator: 'A. Janssen', assistant: 'L. Moreau',
      fireWatch: [
        { id: uid(), name: 'J. Pieters', status: 'posted', zoneId: hotId, since: ago(163) },
        { id: uid(), name: 'S. Kowalski', status: 'posted', zoneId: chestId, since: ago(205) },
        { id: uid(), name: 'M. Diallo', status: 'available', zoneId: null, since: null },
      ],
      fwLog: [],
    },
    rentals: [
      { id: uid(), name: 'Scaffolding — port side', zoneId: portId, dayRate: 180, since: day0 - 8 * DAY, returnedAt: null },
      { id: uid(), name: 'Scaffolding — starboard side', zoneId: stbdId, dayRate: 180, since: day0 - 8 * DAY, returnedAt: null },
      { id: uid(), name: 'Tank ventilation fan', zoneId: tankId, dayRate: 45, since: day0 - 2 * DAY, returnedAt: null },
      { id: uid(), name: 'Boom lift 12 m', zoneId: anodeId, dayRate: 160, since: day0 - 5 * DAY, returnedAt: null },
    ],
    log: [
      L(50, 'Entrée en zone — T. Lemaire → Aft ballast tank cleaning', 'Checked in — T. Lemaire → Aft ballast tank cleaning'),
      L(60, 'Contrôle atmosphérique enregistré', 'Atmospheric check recorded'),
      L(72, 'Travaux terminés — Sea chest grating weld. Veille incendie 60 min.', 'Work completed — Sea chest grating weld. Fire watch stays 60 min.'),
      L(160, 'Entrée en zone — K. Ivanov → Bow plating replacement', 'Checked in — K. Ivanov → Bow plating replacement'),
      L(163, 'Fire watch posté — J. Pieters → Bow plating replacement', 'Fire watch posted — J. Pieters → Bow plating replacement'),
    ],
    decks: [
      { id: uid(), name: 'Hull exterior', layout: 'technical', planImage: null, zones: [
        { id: portId, type: 'height', x: 18, y: 20, w: 12, h: 50, company: 'HeightWorks BV', work: 'Port hull scaffolding', status: 'progress', crew: 4, permit: null, atmo: null,
          entries: [E('D. Novak', 232), E('R. Costa', 232), E('I. Petrov', 230, 45)] },
        { id: stbdId, type: 'height', x: 70, y: 20, w: 12, h: 50, company: 'HeightWorks BV', work: 'Starboard hull scaffolding', status: 'progress', crew: 4, permit: null, atmo: null,
          entries: [E('F. Haddad', 228), E('G. Marin', 228, 60)] },
        { id: uid(), type: 'blast', x: 35, y: 30, w: 30, h: 40, company: 'BlastPro NV', work: 'Hull blasting & painting', status: 'planned', crew: 6, permit: null, atmo: null },
        { id: anodeId, type: 'height', x: 40, y: 76, w: 20, h: 12, company: 'HeightWorks BV', work: 'Stern anode replacement', status: 'done', doneAt: now - 2 * DAY, crew: 2, permit: null, atmo: null },
      ] },
      { id: uid(), name: 'Deck 1 — Machinery / Tanks', layout: 'machinery', planImage: null, zones: [
        { id: hotId, type: 'hot', x: 35, y: 22, w: 30, h: 24, company: 'Nordweld Marine', work: 'Bow plating replacement', status: 'progress', crew: 3,
          permit: { name: 'Permis_feu_proue.svg', data: permitSvg(), validUntil: now + 190 * MIN }, atmo: null,
          entries: [E('K. Ivanov', 160), E('P. Dimitrov', 158)] },
        { id: tankId, type: 'confined', x: 38, y: 50, w: 24, h: 22, company: 'TankClean Services', work: 'Aft ballast tank cleaning', status: 'progress', crew: 3, permit: null,
          atmo: { name: 'Test_atmo_ballast.svg', data: atmoSvg() }, entries: [E('T. Lemaire', 50), E('B. Okafor', 190, 70)] },
        { id: chestId, type: 'hot', x: 54, y: 80, w: 24, h: 10, company: 'Nordweld Marine', work: 'Sea chest grating weld', status: 'done', doneAt: ago(72), crew: 2,
          permit: { name: 'Permis_feu_prise_eau.svg', data: permitSvg() }, atmo: null },
      ] },
    ] };
}

export function makeBlankShip(name) {
  return { id: uid(), name, dock: { dockLength: 200, dockWidth: 35, shipLength: 170, shipWidth: 28 },
    decks: [{ id: uid(), name: 'Pont 1', layout: 'main', planImage: null, zones: [] }] };
}

export function makeAtalante() {
  const R = (x, y, w, h, fr, en) => ({ x, y, w, h, fr, en });
  const Z = (type, x, y, w, h, company, work) => ({ id: uid(), type, x, y, w, h, company, work, status: 'progress', permit: null, atmo: null });
  return { id: uid(), name: "L'Atalante", dock: { dockLength: 120, dockWidth: 24, shipLength: 85, shipWidth: 16 },
    decks: [
      { id: uid(), name: 'Pont E (partiel)', layout: 'main', planImage: null, aiRooms: [
        R(67, 161, 30, 35, 'E20 Zone de contrôle / acquisition', 'E20 Acquisition control zone'), R(67, 150, 25, 11, 'Tambour machine', 'Machine drum'),
        R(71, 139, 25, 10, 'E14 Atelier électronique', 'E14 Electronics workshop'), R(48, 126, 9, 13, 'E18 Accumulateurs', 'E18 Accumulators'),
        R(57, 126, 10, 13, 'E16 Chargeurs batteries', 'E16 Battery chargers'), R(67, 126, 20, 13, 'E12 Magasin électronique', 'E12 Electronics store'),
        R(48, 112, 32, 14, 'E8 / E6 Cabines', 'E8 / E6 Cabins'), R(48, 103, 31, 9, 'E4 Chef méc.', 'E4 Chief engineer'),
        R(79, 96, 16, 12, 'E2 Chef de mission', 'E2 Mission leader'), R(48, 57, 48, 37, 'E21 Pont avant', 'E21 Forward deck'),
      ], zones: [
        Z('hot', 42, 89, 16, 8, 'Piping', 'HWP 76 — tuyauterie, conduites hydrauliques (portique arrière)'),
        Z('hot', 24, 41, 17, 6.5, 'Aris', 'HWP 78 — Aris'),
        Z('hot', 25, 62, 8, 7, 'Steel', 'HWP 80 — acier (embarcation)'),
      ] },
      { id: uid(), name: 'Pont F', layout: 'main', planImage: null, aiRooms: [
        R(66, 162, 24, 14, 'F4 Local tech. nav.', 'F4 Nav. equipment room'), R(65, 150, 25, 11, 'Tambour machine', 'Machine drum'),
        R(65, 128, 82, 22, 'F1 Timonerie avant', 'F1 Forward wheelhouse'), R(91, 154, 23, 12, 'F2 Chambre à cartes', 'F2 Chart room'),
        R(92, 177, 19, 12, 'F3 Timonerie arrière', 'F3 Aft wheelhouse'), R(98, 166, 16, 11, 'F7 Bureau pont', 'F7 Deck office'),
        R(48, 97, 99, 31, 'F5 Pont avant', 'F5 Forward deck'),
      ], zones: [] },
    ] };
}

export function normalize(ship) {
  const now = Date.now();
  if (!ship.crew) ship.crew = { coordinator: '', assistant: '', fireWatch: [] };
  if (!ship.crew.fireWatch) ship.crew.fireWatch = [];
  if (!ship.crew.fwLog) ship.crew.fwLog = [];
  if (!ship.log) ship.log = [];
  if (!ship.dock) ship.dock = { dockLength: 200, dockWidth: 35, shipLength: 170, shipWidth: 28 };
  if (!ship.schedule) { const d = new Date(now); d.setHours(7, 0, 0, 0); ship.schedule = { dockIn: d.getTime(), undock: d.getTime() + 14 * DAY }; }
  ship.costs = { ...DEFAULT_COSTS, ...(ship.costs || {}) };
  if (!ship.rentals) ship.rentals = [];
  if (!ship.decks) ship.decks = [{ id: uid(), name: 'Pont principal', planImage: ship.planImage || null, zones: ship.zones || [] }];
  ship.decks = ship.decks.map((d) => ({ id: d.id || uid(), name: d.name || 'Pont', layout: d.layout || 'main', planImage: d.planImage || null, aiRooms: d.aiRooms || null, zones: (d.zones || []).map((z) => {
    const base = { permit: null, atmo: null, entries: [], crew: 2, ...z };
    if (base.type === 'confined') {
      if (!base.interval) base.interval = 12;
      if (!base.checks) base.checks = base.atmo ? [{ id: uid(), ts: now - 60 * MIN, by: '—', fileName: base.atmo.name, data: base.atmo.data, key: base.atmo.key, synced: true }] : [];
    }
    if (base.status === 'done' && !base.doneAt) base.doneAt = now;
    return base;
  }) }));
  delete ship.planImage; delete ship.zones;
  return ship;
}

export function mergedChecks(zone, pending) {
  const base = (zone.checks || []).map((c) => ({ ...c, pending: false }));
  const pend = (pending || []).filter((p) => p.zoneId === zone.id).map((p) => ({ ...p.check, pending: true, data: p.dataUrl }));
  return base.concat(pend).sort((a, b) => b.ts - a.ts);
}
export function atmoDue(zone, pending, now) {
  const checks = mergedChecks(zone, pending);
  if (!checks.length) return { state: 'none' };
  const last = checks[0].ts, due = last + (zone.interval || 12) * HOUR, remaining = due - now;
  return { state: remaining < 0 ? 'overdue' : 'ok', last, due, remaining };
}
export function permitState(zone, now) {
  if (!zone.permit) return { state: 'none' };
  const vu = zone.permit.validUntil || null;
  if (vu && vu < now) return { state: 'expired', validUntil: vu };
  return { state: 'ok', validUntil: vu, remaining: vu ? vu - now : null };
}

// What can stop a work, by severity: 3 critical, 2 stop now, 1 fix before carrying on.
export const ISSUES = {
  'occupied-risk': { sev: 3, fr: 'Personne en espace confiné sans test valide', en: 'Person in a confined space without a valid test', sfr: 'Évacuer', sen: 'Evacuate' },
  conflict: { sev: 2, fr: 'Conflit de travaux', en: 'Work conflict', sfr: 'Conflit', sen: 'Conflict' },
  'gas-overdue': { sev: 2, fr: 'Test atmosphérique en retard', en: 'Atmospheric test overdue', sfr: 'Test gaz en retard', sen: 'Gas test overdue' },
  firewatch: { sev: 2, fr: 'Travaux à chaud sans fire watch', en: 'Hot work without fire watch', sfr: 'Fire watch absent', sen: 'No fire watch' },
  'gas-none': { sev: 1, fr: 'Espace confiné jamais testé', en: 'Confined space never tested', sfr: 'Test gaz à faire', sen: 'Gas test needed' },
  'permit-expired': { sev: 1, fr: 'Permis expiré', en: 'Permit expired', sfr: 'Permis expiré', sen: 'Permit expired' },
  permit: { sev: 1, fr: 'Permis manquant', en: 'Missing permit', sfr: 'Permis manquant', sen: 'No permit' },
};

export const zoneTitle = (z, lang) => z.work || pick(lang, HAZARDS[z.type].label.fr, HAZARDS[z.type].label.en);
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const PROGRESS_WEIGHT = { planned: 0, progress: 0.5, done: 1 };

export function analyze(ship, pending, now) {
  const C = ship.costs, S = ship.schedule, fwList = ship.crew.fireWatch;
  const rows = [];
  ship.decks.forEach((deck) => deck.zones.forEach((zone) => rows.push({ zone, deck })));
  const conflicts = ship.decks.flatMap((deck) => zoneConflicts(deck.zones).map((c) => ({ ...c, deck })));
  const confOf = new Map();
  conflicts.forEach((c) => {
    confOf.set(c.z1.id, [...(confOf.get(c.z1.id) || []), { other: c.z2, rule: c.rule }]);
    confOf.set(c.z2.id, [...(confOf.get(c.z2.id) || []), { other: c.z1, rule: c.rule }]);
  });

  // Per zone: what is open, what is still needed before a start, who is inside.
  const info = new Map();
  rows.forEach(({ zone: z, deck }) => {
    const occupants = (z.entries || []).filter((e) => !e.outAt);
    const atmo = z.type === 'confined' ? atmoDue(z, pending, now) : null;
    const permit = permitState(z, now);
    const fwHere = fwList.filter((f) => f.status === 'posted' && f.zoneId === z.id);
    const issues = [], prep = [];
    if (z.status !== 'done') {
      (confOf.get(z.id) || []).forEach((c) => issues.push({ code: 'conflict', sev: 2, other: c.other, rule: c.rule }));
      if (atmo && atmo.state !== 'ok') {
        if (occupants.length) issues.push({ code: 'occupied-risk', sev: 3 });
        else issues.push({ code: atmo.state === 'overdue' ? 'gas-overdue' : 'gas-none', sev: atmo.state === 'overdue' ? 2 : 1 });
      }
      const live = z.status === 'progress';
      if (z.type === 'hot' && !fwHere.length) (live ? issues : prep).push({ code: 'firewatch', sev: 2 });
      if (permit.state !== 'ok') (live ? issues : prep).push({ code: permit.state === 'expired' ? 'permit-expired' : 'permit', sev: 1 });
    }
    const sev = issues.reduce((m, i) => Math.max(m, i.sev), 0);
    const state = z.status === 'done' ? 'done' : sev >= 2 ? 'blocked' : sev === 1 ? 'attention' : prep.length ? 'prepare' : 'ready';
    info.set(z.id, { zone: z, deck, occupants, atmo, permit, fwHere, issues, prep, sev, state, people: Math.max(z.crew || 0, occupants.length) });
  });

  const alerts = conflicts.map((c) => ({ id: 'c' + c.z1.id + c.z2.id, code: 'conflict', sev: 2, zone: c.z1, other: c.z2, deck: c.deck, rule: c.rule }));
  info.forEach((zi) => zi.issues.forEach((is) => { if (is.code !== 'conflict') alerts.push({ id: is.code + zi.zone.id, code: is.code, sev: is.sev, zone: zi.zone, deck: zi.deck }); }));
  alerts.sort((a, b) => b.sev - a.sev);

  const counts = { planned: 0, progress: 0, done: 0 };
  rows.forEach(({ zone }) => { counts[zone.status] = (counts[zone.status] || 0) + 1; });
  const activeRows = rows.filter(({ zone }) => zone.status !== 'done');
  const readyCount = activeRows.filter(({ zone }) => info.get(zone.id).issues.length === 0).length;

  const occupants = [];
  info.forEach((zi) => zi.occupants.forEach((entry) => occupants.push({ entry, zone: zi.zone, deck: zi.deck })));
  occupants.sort((a, b) => a.entry.inAt - b.entry.inAt);

  // Fire watch: active on live hot work, on post-work watch after it ends, then free to release.
  const fw = fwList.map((f) => {
    if (f.status !== 'posted') return { f, state: 'available' };
    const zi = info.get(f.zoneId);
    if (!zi) return { f, state: 'orphan' };
    if (zi.zone.status === 'done') {
      const end = (zi.zone.doneAt || now) + C.cooldown * MIN;
      return { f, zone: zi.zone, deck: zi.deck, end, remaining: end - now, state: end > now ? 'cooldown' : 'releasable' };
    }
    return { f, zone: zi.zone, deck: zi.deck, state: zi.zone.status === 'planned' ? 'waiting' : 'active' };
  });
  const fwPosted = fw.filter((x) => x.state !== 'available').length;

  const today = startOfDay(now);
  const isToday = (ts) => ts >= today;
  const checksToday = rows.reduce((n, { zone }) => n + (zone.checks || []).filter((c) => isToday(c.ts)).length, 0) + (pending || []).filter((q) => q.shipId === ship.id && isToday(q.check.ts)).length;

  // Works that are live but not compliant: the crews an inspection would stand down.
  const blockers = [];
  info.forEach((zi) => { if (zi.zone.status === 'progress' && zi.issues.length) blockers.push({ zone: zi.zone, deck: zi.deck, issues: zi.issues, people: zi.people, rate: zi.people * C.labour }); });
  blockers.sort((a, b) => b.rate - a.rate);
  const standbyRate = blockers.reduce((s, b) => s + b.rate, 0);
  const standbyPeople = blockers.reduce((s, b) => s + b.people, 0);

  const deadlines = [];
  info.forEach((zi) => {
    if (zi.zone.status === 'done') return;
    if (zi.atmo && zi.atmo.state === 'ok') deadlines.push({ id: 'g' + zi.zone.id, ts: zi.atmo.due, kind: 'gas', zone: zi.zone, deck: zi.deck });
    if (zi.permit.state === 'ok' && zi.permit.validUntil) deadlines.push({ id: 'p' + zi.zone.id, ts: zi.permit.validUntil, kind: 'permit', zone: zi.zone, deck: zi.deck });
  });
  fw.forEach((x) => { if (x.state === 'cooldown') deadlines.push({ id: 'f' + x.f.id, ts: x.end, kind: 'fw', fw: x.f, zone: x.zone, deck: x.deck }); });
  if (S.undock > now) deadlines.push({ id: 'undock', ts: S.undock, kind: 'undock' });
  deadlines.sort((a, b) => a.ts - b.ts);

  // Hours booked today, from the access register and the fire watch roster.
  const byCompany = new Map();
  rows.forEach(({ zone, deck }) => (zone.entries || []).forEach((e) => {
    const from = Math.max(e.inAt, today), to = Math.min(e.outAt || now, now);
    if (to <= from) return;
    const key = zone.company || '';
    let c = byCompany.get(key);
    if (!c) { c = { company: key, ms: 0, names: new Set(), lines: [] }; byCompany.set(key, c); }
    c.ms += to - from; c.names.add(e.name); c.lines.push({ name: e.name, zone, deck, from, to: e.outAt ? to : null, ms: to - from });
  }));
  const companies = [...byCompany.values()].map((c) => ({ company: c.company, ms: c.ms, people: c.names.size, lines: c.lines, cost: (c.ms / HOUR) * C.labour })).sort((a, b) => b.ms - a.ms);
  const fwLines = [];
  (ship.crew.fwLog || []).forEach((l) => { const from = Math.max(l.from, today), to = Math.min(l.to, now); if (to > from) fwLines.push({ name: l.name, zoneId: l.zoneId, from, to, ms: to - from }); });
  fwList.forEach((f) => { if (f.status === 'posted' && f.since) { const from = Math.max(f.since, today); if (now > from) fwLines.push({ name: f.name, zoneId: f.zoneId, from, to: null, ms: now - from }); } });
  const fwMs = fwLines.reduce((s, l) => s + l.ms, 0);
  const labourMs = companies.reduce((s, c) => s + c.ms, 0);
  const timesheet = { companies, fwLines, fwMs, fwCost: (fwMs / HOUR) * C.fireWatch, fwPeople: new Set(fwLines.map((l) => l.name)).size,
    totalMs: labourMs + fwMs, totalCost: (labourMs / HOUR) * C.labour + (fwMs / HOUR) * C.fireWatch };

  // Hired equipment still on site; idle once its work is finished.
  const rentals = (ship.rentals || []).filter((r) => !r.returnedAt).map((r) => {
    const zi = r.zoneId ? info.get(r.zoneId) : null;
    const days = Math.max(1, Math.ceil((now - r.since) / DAY));
    const why = r.zoneId && !zi ? 'gone' : zi && zi.zone.status === 'done' ? 'done' : null;
    return { rental: r, zone: zi ? zi.zone : null, deck: zi ? zi.deck : null, days, cost: days * r.dayRate, idle: !!why, why, idleMs: why === 'done' ? now - (zi.zone.doneAt || now) : 0 };
  });
  const rentalDaily = rentals.reduce((s, r) => s + r.rental.dayRate, 0);

  // Dock days: time used against work completed, with a straight-line projection.
  const totalDays = Math.max(1, (S.undock - S.dockIn) / DAY);
  const elapsedDays = Math.max(0, (now - S.dockIn) / DAY);
  const completion = rows.length ? rows.reduce((s, { zone }) => s + (PROGRESS_WEIGHT[zone.status] || 0), 0) / rows.length : 0;
  const projectedDays = completion >= 0.05 && elapsedDays > 0 ? elapsedDays / completion : null;
  const overrun = Math.max(0, elapsedDays - totalDays);
  const delayDays = projectedDays ? Math.max(0, Math.round((projectedDays - totalDays) * 2) / 2) : overrun ? Math.ceil(overrun) : 0;
  const schedule = { dockIn: S.dockIn, undock: S.undock, totalDays, elapsedDays, completion,
    dayNo: Math.round((startOfDay(now) - startOfDay(S.dockIn)) / DAY) + 1, calDays: Math.round((startOfDay(S.undock) - startOfDay(S.dockIn)) / DAY) + 1,
    remainingDays: Math.max(0, totalDays - elapsedDays), delayDays, delayCost: delayDays * C.dockDay,
    projectedUndock: delayDays ? S.undock + delayDays * DAY : null, started: now >= S.dockIn };

  // Actions that save money, largest first (hourly amounts compared over one shift).
  const savings = [];
  fw.forEach((x) => { if (x.state === 'releasable' || x.state === 'orphan') savings.push({ id: 'fw' + x.f.id, kind: 'fw', amount: C.fireWatch, unit: 'h', fw: x.f, zone: x.zone || null, deck: x.deck || null, overMs: x.end ? now - x.end : 0 }); });
  rentals.forEach((r) => { if (r.idle) savings.push({ id: 'r' + r.rental.id, kind: 'rental', amount: r.rental.dayRate, unit: 'd', rental: r.rental, zone: r.zone, deck: r.deck, idleMs: r.idleMs, why: r.why }); });
  blockers.forEach((b) => savings.push({ id: 'b' + b.zone.id, kind: 'blocker', amount: b.rate, unit: 'h', zone: b.zone, deck: b.deck, issues: b.issues, people: b.people }));
  deadlines.forEach((d) => {
    if ((d.kind !== 'gas' && d.kind !== 'permit') || d.ts - now > 2 * HOUR || d.zone.status !== 'progress') return;
    const zi = info.get(d.zone.id);
    if (zi.issues.length) return;
    savings.push({ id: 'x' + d.id, kind: 'expiry', amount: zi.people * C.labour, unit: 'h', zone: d.zone, deck: d.deck, deadline: d, people: zi.people });
  });
  const weight = (s) => (s.unit === 'h' ? s.amount * C.shift : s.amount);
  savings.sort((a, b) => weight(b) - weight(a));

  return { now, rows, info, conflicts, alerts, alertCount: alerts.filter((x) => x.sev >= 2).length, counts, activeRows, readyCount,
    occupants, fw, fwPosted, fwAvail: fwList.length - fwPosted, checksToday,
    cost: { blockers, standbyRate, standbyPeople, perShift: standbyRate * C.shift, rentalDaily }, deadlines, timesheet, rentals, schedule, savings };
}

// One line per check-in today, for the CSV export.
export function timesheetLines(a) {
  const out = [];
  a.timesheet.companies.forEach((c) => c.lines.forEach((l) => out.push({ kind: 'work', company: c.company, work: l.zone.work || '', deck: l.deck.name, name: l.name, from: l.from, to: l.to, ms: l.ms })));
  a.timesheet.fwLines.forEach((l) => { const zi = a.info.get(l.zoneId); out.push({ kind: 'fw', company: 'Fire watch', work: zi ? zi.zone.work || '' : '', deck: zi ? zi.deck.name : '', name: l.name, from: l.from, to: l.to, ms: l.ms }); });
  return out.sort((x, y) => x.from - y.from);
}
