import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, ClipboardList, Coins, Ellipsis, HardHat, LayoutDashboard, Lock, LockOpen, LogIn, LogOut, Map as MapIcon, Pencil, Plus, RotateCcw, Ship as ShipIcon, Trash2, Users } from 'lucide-react';
import { AppCtx } from './lib/ctx.js';
import { fmtDate, fmtMoney, fmtTime, mkTx, toLocalInput } from './lib/i18n.js';
import { AI_FALLBACK, COORD_CODE, HAZARDS, PENDING_KEY, PRESENCE_KEY, SHARED_KEY, analyze, makeAtalante, makeBlankShip, makeExampleShip, normalize, timesheetLines, uid, zoneTitle } from './lib/model.js';
import { analysePlan, prefersReducedMotion, readImage, saveFile, warmCapabilities } from './lib/platform.js';
import { BrandMark, ConfirmSheet, Menu, MenuItem, MenuLabel, MenuSep, Segmented } from './components/ui.jsx';
import Intro from './components/Intro.jsx';
import { AiSheet, DeckSheet, DocSheet, LoginSheet, RentalSheet, ReportSheet, VesselSheet } from './components/Sheets.jsx';
import Overview from './views/Overview.jsx';
import PlanView from './views/Plan.jsx';
import Works from './views/Works.jsx';
import Crew from './views/Crew.jsx';
import Costs from './views/Costs.jsx';

const HOUR = 3600000;
const TABS = [
  { key: 'overview', fr: 'Aperçu', en: 'Summary', Icon: LayoutDashboard },
  { key: 'plan', fr: 'Plan', en: 'Plan', Icon: MapIcon },
  { key: 'works', fr: 'Travaux', en: 'Works', Icon: HardHat },
  { key: 'crew', fr: 'Équipe', en: 'Crew', Icon: Users },
  { key: 'costs', fr: 'Coûts', en: 'Costs', Icon: Coins },
];
const TAB_KEYS = TABS.map((t) => t.key);
const LANG_KEY = 'dd_lang';
const STALE_DEMO = 6 * HOUR;

const readHash = () => { try { const h = window.location.hash.slice(1); return TAB_KEYS.includes(h) ? h : 'overview'; } catch (e) { return 'overview'; } };
const readLang = () => { try { const v = localStorage.getItem(LANG_KEY); if (v === 'bi' || v === 'en' || v === 'bg') return v; } catch (e) {} return 'bi'; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slug = (s) => (s || 'navire').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'navire';

// Pure helpers on one vessel.
const withZone = (s, zid, fn) => ({ ...s, decks: s.decks.map((d) => (d.zones.some((z) => z.id === zid) ? { ...d, zones: d.zones.map((z) => (z.id === zid ? fn(z) : z)) } : d)) });
const addLog = (s, fr, en) => ({ ...s, log: [{ id: uid(), ts: Date.now(), fr, en }, ...(s.log || [])].slice(0, 150) });
export const findZone = (s, zid) => { if (!s || !zid) return null; for (const d of s.decks) { const z = d.zones.find((x) => x.id === zid); if (z) return { zone: z, deck: d }; } return null; };
// Takes fire watches off their post, keeping their hours for the timesheet.
const freeFw = (s, pred) => {
  const t = Date.now(), log = [...(s.crew.fwLog || [])];
  const fireWatch = s.crew.fireWatch.map((f) => {
    if (f.status !== 'posted' || !pred(f)) return f;
    if (f.since) log.push({ name: f.name, zoneId: f.zoneId, from: f.since, to: t });
    return { ...f, status: 'available', zoneId: null, since: null };
  });
  return { ...s, crew: { ...s.crew, fireWatch, fwLog: log.slice(-200) } };
};

export default function App() {
  const [ships, setShips] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [deckId, setDeckIdState] = useState(null);
  const [zoneId, setZoneId] = useState(null);
  const [tab, setTabState] = useState(readHash);
  const [planMode, setPlanMode] = useState('2d');
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState('viewer');
  const [lang, setLangState] = useState(readLang);
  const [online, setOnline] = useState(1);
  const [synced, setSynced] = useState(false);
  const [simOffline, setSimOffline] = useState(false);
  const [netOnline, setNetOnline] = useState(true);
  const [pending, setPending] = useState([]);
  const [tick, setTick] = useState(0);
  const [intro, setIntro] = useState(true);
  const [introOut, setIntroOut] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const tx = useMemo(() => mkTx(lang), [lang]);
  const canEdit = role === 'coordinator';
  const connected = netOnline && !simOffline;

  const myId = useRef(null); if (!myId.current) myId.current = uid();
  const knownRev = useRef(0);
  const applyingRemote = useRef(false);
  const lastEditTs = useRef(0);
  const meta = useRef({ demo: false, edited: false, seededAt: 0 });
  const activeRef = useRef(null); activeRef.current = activeId;
  const canEditRef = useRef(false); canEditRef.current = canEdit;
  const connectedRef = useRef(true); connectedRef.current = connected;
  const docCache = useRef({});
  const upload = useRef(null);
  const planInput = useRef(null), aiInput = useRef(null), docInput = useRef(null);
  const flushing = useRef(false);
  const introStart = useRef(Date.now());
  const toastTimer = useRef(null);
  const aiAbort = useRef(null);

  const ship = ships.find((s) => s.id === activeId) || null;
  const shipRef = useRef(null); shipRef.current = ship;
  const a = useMemo(() => (ship ? analyze(ship, pending, Date.now()) : null), [ship, pending, tick]);
  const aRef = useRef(null); aRef.current = a;
  const deck = ship ? ship.decks.find((d) => d.id === deckId) || ship.decks[0] : null;

  // ---------- navigation ----------
  function go(k) {
    if (k !== 'plan') setZoneId(null);
    setTabState(k);
    try { window.history.replaceState(null, '', '#' + k); } catch (e) {}
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  }
  useEffect(() => {
    const f = () => setTabState(readHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  function setLang(v) { setLangState(v); try { localStorage.setItem(LANG_KEY, v); } catch (e) {} }
  function setDeckId(id) { setDeckIdState(id); setZoneId(null); }
  function selectShip(id) { setActiveId(id); setDeckIdState(null); setZoneId(null); }
  function openZone(zid) {
    const f = findZone(shipRef.current, zid); if (!f) return;
    setDeckIdState(f.deck.id); setZoneId(zid); setPlanMode('2d');
    if (tab !== 'plan') go('plan');
  }
  function focusZone(zid) { const f = findZone(shipRef.current, zid); if (!f) return; setDeckIdState(f.deck.id); setZoneId(zid); }
  function notify(text) {
    clearTimeout(toastTimer.current);
    setToast({ id: uid(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  const askConfirm = (c) => setConfirm(c);

  // ---------- load, sync, presence ----------
  function seedDemo() {
    const ex = normalize(makeExampleShip());
    meta.current = { demo: true, edited: false, seededAt: Date.now() };
    setShips([ex]); setActiveId(ex.id); setDeckIdState(null); setZoneId(null); setLoaded(true);
  }
  useEffect(() => {
    warmCapabilities();
    let cancelled = false;
    (async () => {
      let data = null;
      try { const res = await window.storage.get(SHARED_KEY, true); if (res && res.value) data = JSON.parse(res.value); } catch (e) {}
      if (cancelled) return;
      // An untouched demo is re-created after a few hours so its times stay realistic.
      const stale = data && data.demo && !data.edited && Date.now() - (data.seededAt || 0) > STALE_DEMO;
      if (data && Array.isArray(data.ships) && data.ships.length && !stale) {
        knownRev.current = data.rev || 1;
        meta.current = { demo: !!data.demo, edited: !!data.edited, seededAt: data.seededAt || 0 };
        applyingRemote.current = true;
        const list = data.ships.map(normalize);
        setShips(list); setActiveId(list[0].id); setSynced(true); setLoaded(true);
        return;
      }
      knownRev.current = data && data.rev ? data.rev : 0;
      seedDemo();
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (applyingRemote.current) { applyingRemote.current = false; return; }
    const rev = knownRev.current + 1; knownRev.current = rev;
    const payload = JSON.stringify({ ships, rev, editor: myId.current, ts: Date.now(), ...meta.current });
    Promise.resolve(window.storage.set(SHARED_KEY, payload, true)).then(() => setSynced(true), () => setSynced(false));
  }, [ships, loaded]);

  useEffect(() => {
    if (!loaded) return undefined;
    const poll = async () => {
      try {
        const res = await window.storage.get(SHARED_KEY, true);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.rev > knownRev.current) {
            knownRev.current = data.rev;
            if (data.editor !== myId.current && Date.now() - lastEditTs.current > 2500 && Array.isArray(data.ships) && data.ships.length) {
              meta.current = { demo: !!data.demo, edited: !!data.edited, seededAt: data.seededAt || 0 };
              applyingRemote.current = true;
              const list = data.ships.map(normalize);
              setShips(list);
              if (!list.some((s) => s.id === activeRef.current)) selectShip(list[0].id);
            }
          }
          setSynced(true);
        }
      } catch (e) {}
      try {
        let pres = {};
        try { const pr = await window.storage.get(PRESENCE_KEY, true); if (pr && pr.value) pres = JSON.parse(pr.value); } catch (e) {}
        const t = Date.now(); pres[myId.current] = t;
        Object.keys(pres).forEach((k) => { if (t - pres[k] > 20000) delete pres[k]; });
        setOnline(Object.keys(pres).length || 1);
        await window.storage.set(PRESENCE_KEY, JSON.stringify(pres), true);
      } catch (e) {}
    };
    poll();
    const iv = setInterval(poll, 3500);
    const tk = setInterval(() => setTick((x) => x + 1), 15000);
    return () => { clearInterval(iv); clearInterval(tk); };
  }, [loaded]);

  // Connectivity and the offline queue of gas checks.
  useEffect(() => {
    setNetOnline(typeof navigator !== 'undefined' ? navigator.onLine !== false : true);
    const up = () => setNetOnline(true), down = () => setNetOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    (async () => { try { const r = await window.storage.get(PENDING_KEY, false); if (r && r.value) setPending(JSON.parse(r.value)); } catch (e) {} })();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { Promise.resolve(window.storage.set(PENDING_KEY, JSON.stringify(pending), false)).catch(() => {}); }, [pending]);
  useEffect(() => { if (connected && pending.length && !flushing.current) flushPending(); }, [connected, pending]);

  async function flushPending() {
    if (flushing.current || !pending.length) return;
    flushing.current = true;
    for (const item of [...pending]) {
      try {
        const key = 'docfile:check:' + item.check.id;
        await window.storage.set(key, item.dataUrl, true);
        docCache.current[key] = item.dataUrl;
        markEdit();
        setShips((prev) => prev.map((s) => (s.id !== item.shipId ? s : addLog(withZone(s, item.zoneId, (z) => ({ ...z, checks: [{ ...item.check, key, synced: true }, ...(z.checks || [])] })), 'Contrôle synchronisé après retour réseau', 'Check synced after network recovery'))));
        setPending((p) => p.filter((x) => x.id !== item.id));
      } catch (e) { break; }
    }
    flushing.current = false;
  }

  // Launch animation: hold for the wordmark, then let the app fade in. Any tap or key skips it.
  useEffect(() => {
    if (!loaded) return undefined;
    if (prefersReducedMotion()) { setIntroOut(true); setIntro(false); return undefined; }
    const wait = Math.max(0, 1550 - (Date.now() - introStart.current));
    let t2 = setTimeout(() => setIntro(false), wait + 440);
    const t1 = setTimeout(() => setIntroOut(true), wait);
    const skip = () => { clearTimeout(t1); clearTimeout(t2); setIntroOut(true); t2 = setTimeout(() => setIntro(false), 440); };
    window.addEventListener('pointerdown', skip, { once: true }); window.addEventListener('keydown', skip, { once: true });
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
  }, [loaded]);

  // ---------- edits ----------
  function markEdit() { lastEditTs.current = Date.now(); meta.current.edited = true; }
  const guard = () => canEditRef.current;
  function mutate(fn, shipId) { markEdit(); setShips((prev) => prev.map((s) => (s.id === (shipId || activeRef.current) ? fn(s) : s))); }

  function updateShip(patch) { if (!guard()) return; mutate((s) => ({ ...s, ...patch })); }
  function updateDeck(did, patch) { if (!guard()) return; mutate((s) => ({ ...s, decks: s.decks.map((d) => (d.id === did ? { ...d, ...patch } : d)) })); }
  function updateZone(zid, patch) { if (!guard()) return; mutate((s) => withZone(s, zid, (z) => ({ ...z, ...patch }))); }

  function setZoneStatus(zid, status) {
    if (!guard()) return;
    mutate((s) => {
      const f = findZone(s, zid); if (!f || f.zone.status === status) return s;
      const z = f.zone, t = zoneTitle(z, 'fr'), te = zoneTitle(z, 'en');
      const n = withZone(s, zid, (x) => ({ ...x, status, doneAt: status === 'done' ? Date.now() : null }));
      if (status === 'done') return addLog(n, 'Travaux terminés — ' + t + (z.type === 'hot' ? '. Veille incendie ' + s.costs.cooldown + ' min.' : ''), 'Work completed — ' + te + (z.type === 'hot' ? '. Fire watch stays ' + s.costs.cooldown + ' min.' : ''));
      if (status === 'progress') return addLog(n, 'Travaux démarrés — ' + t, 'Work started — ' + te);
      return addLog(n, 'Travaux replanifiés — ' + t, 'Work re-planned — ' + te);
    });
  }
  function addZone(did, type, px, py) {
    if (!guard()) return;
    const z = { id: uid(), type, x: clamp(px - 9, 0, 82), y: clamp(py - 6, 0, 88), w: 18, h: 12, company: '', work: '', status: 'planned', crew: 2, permit: null, atmo: null, entries: [], ...(type === 'confined' ? { interval: 12, checks: [] } : {}) };
    mutate((s) => addLog({ ...s, decks: s.decks.map((d) => (d.id === did ? { ...d, zones: [...d.zones, z] } : d)) }, 'Zone créée — ' + HAZARDS[type].label.fr, 'Zone created — ' + HAZARDS[type].label.en));
    setZoneId(z.id);
  }
  function removeZone(zid) {
    if (!guard()) return;
    askConfirm({ message: tx('Supprimer cette zone ?', 'Delete this zone?'), detail: tx('Son permis, ses contrôles et son registre d’accès sont supprimés.', 'Its permit, checks and access register are deleted.'), confirmLabel: tx('Supprimer la zone', 'Delete zone'), onConfirm: () => {
      mutate((s) => {
        const f = findZone(s, zid); if (!f) return s;
        const n = freeFw({ ...s, decks: s.decks.map((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== zid) })) }, (fw) => fw.zoneId === zid);
        return addLog(n, 'Zone supprimée — ' + zoneTitle(f.zone, 'fr'), 'Zone removed — ' + zoneTitle(f.zone, 'en'));
      });
      setZoneId(null);
    } });
  }

  function addDeck() {
    if (!guard()) return;
    const nd = { id: uid(), name: tx('Nouveau pont', 'New deck'), layout: 'main', planImage: null, aiRooms: null, zones: [] };
    mutate((s) => ({ ...s, decks: [...s.decks, nd] }));
    setDeckId(nd.id); setSheet({ kind: 'deck', deckId: nd.id });
  }
  function removeDeck(did) {
    const s0 = shipRef.current; if (!guard() || !s0 || s0.decks.length <= 1) return;
    const d0 = s0.decks.find((d) => d.id === did); if (!d0) return;
    askConfirm({ message: tx('Supprimer le pont « ', 'Delete the deck “') + d0.name + tx(' » ?', '”?'), detail: tx('Ses ' + d0.zones.length + ' zones sont supprimées.', 'Its ' + d0.zones.length + ' zones are deleted.'), confirmLabel: tx('Supprimer le pont', 'Delete deck'), onConfirm: () => {
      mutate((s) => { const ids = new Set(d0.zones.map((z) => z.id)); return addLog(freeFw({ ...s, decks: s.decks.filter((d) => d.id !== did) }, (fw) => ids.has(fw.zoneId)), 'Pont supprimé — ' + d0.name, 'Deck removed — ' + d0.name); });
      setDeckId(null);
    } });
  }
  function addShip() {
    if (!guard()) return;
    const s = normalize(makeBlankShip(tx('Nouveau navire', 'New vessel')));
    markEdit(); setShips((p) => [...p, s]); selectShip(s.id); setSheet({ kind: 'vessel', isNew: true });
  }
  function addExample() {
    if (!guard()) return;
    const s = normalize(makeAtalante());
    markEdit(); setShips((p) => [...p, s]); selectShip(s.id); notify(tx('Navire ajouté', 'Vessel added'));
  }
  function removeShip(id) {
    if (!guard() || ships.length <= 1) return;
    const s0 = ships.find((s) => s.id === id); if (!s0) return;
    askConfirm({ message: tx('Supprimer ', 'Delete ') + s0.name + ' ?', detail: tx('Ses ponts, zones, équipes et coûts sont supprimés.', 'Its decks, zones, crew and costs are deleted.'), confirmLabel: tx('Supprimer le navire', 'Delete vessel'), onConfirm: () => {
      markEdit();
      setShips((prev) => { const next = prev.filter((s) => s.id !== id); if (id === activeRef.current && next[0]) selectShip(next[0].id); return next; });
    } });
  }

  // Images: deck plans, permits, gas test sheets, and plans for the AI reading.
  function pickPlanImage(did) { if (!guard()) return; upload.current = { kind: 'plan', deckId: did }; if (planInput.current) planInput.current.click(); }
  async function onPlanFile(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    const ctx = upload.current; upload.current = null; if (!file || !ctx) return;
    try { const c = await readImage(file, 1100); updateDeck(ctx.deckId, { planImage: c.toDataURL('image/jpeg', 0.72) }); notify(tx('Plan importé', 'Plan imported')); }
    catch (err) { notify(tx('Image illisible', 'Unreadable image')); }
  }
  function clearPlanImage(did) { updateDeck(did, { planImage: null }); }

  function startAi() { if (!guard()) return; if (aiInput.current) aiInput.current.click(); }
  async function onAiFile(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
    const ctl = new AbortController(); aiAbort.current = ctl;
    setSheet({ kind: 'ai', phase: 'loading' });
    let result = null;
    try { const c = await readImage(file, 1400); result = await analysePlan(c, ctl.signal); }
    catch (err) { if (err && err.code === 'cancelled') return; }
    if (ctl.signal.aborted) return;
    setSheet({ kind: 'ai', phase: 'done', result: result ? { demo: false, decks: result.decks } : AI_FALLBACK });
  }
  function cancelAi() { if (aiAbort.current) aiAbort.current.abort(); }
  function applyAi(result) {
    if (!guard() || !result) return;
    const valid = ['main', 'cabins', 'machinery', 'technical'];
    const cl = (v, lo, hi) => clamp(Number(v) || 0, lo, hi);
    const room = (r) => ({ x: 48 + cl(r.x, 0, 96) * 1.04, y: 26 + cl(r.y, 0, 96) * 2.4, w: Math.max(8, cl(r.w, 2, 100) * 1.04), h: Math.max(7, cl(r.h, 2, 100) * 2.4), fr: r.fr || r.en || '?', en: r.en || r.fr || '?' });
    const decks = result.decks.map((d) => ({
      id: uid(), name: String(d.name || 'Pont (IA)').slice(0, 60), layout: valid.includes(d.layout) ? d.layout : 'main', planImage: null,
      aiRooms: (d.compartments || []).slice(0, 12).map(room),
      zones: (d.suggestedZones || []).slice(0, 4).filter((z) => HAZARDS[z.type]).map((z) => ({
        id: uid(), type: z.type, x: cl(z.x, 0, 84), y: cl(z.y, 0, 88), w: cl(z.w, 6, 40), h: cl(z.h, 5, 30), company: '',
        work: String((lang === 'en' ? z.workEn || z.workFr : z.workFr || z.workEn) || '').slice(0, 80), status: 'planned', crew: 2, permit: null, atmo: null, entries: [],
        ...(z.type === 'confined' ? { interval: 12, checks: [] } : {}),
      })),
    }));
    if (!decks.length) return;
    mutate((s) => addLog({ ...s, decks: [...s.decks, ...decks] }, 'Analyse IA du plan — ' + decks.length + ' pont(s) créé(s)', 'AI plan analysis — ' + decks.length + ' deck(s) created'));
    setDeckId(decks[0].id); setPlanMode('2d'); if (tab !== 'plan') go('plan');
    notify(tx('Ponts créés', 'Decks created'));
  }

  function pickDoc(zid, kind) { if (!guard()) return; upload.current = { kind, zoneId: zid }; if (docInput.current) docInput.current.click(); }
  async function onDocFile(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    const ctx = upload.current; upload.current = null; if (!file || !ctx) return;
    let dataUrl;
    try { const c = await readImage(file, 1000); dataUrl = c.toDataURL('image/jpeg', 0.62); }
    catch (err) { notify(tx('Image illisible', 'Unreadable image')); return; }
    if (ctx.kind === 'check') {
      const check = { id: uid(), ts: Date.now(), by: tx('Contrôleur', 'Tester'), fileName: file.name, synced: connectedRef.current };
      if (connectedRef.current) {
        const key = 'docfile:check:' + check.id;
        try { await window.storage.set(key, dataUrl, true); docCache.current[key] = dataUrl; } catch (err) {}
        mutate((s) => addLog(withZone(s, ctx.zoneId, (z) => ({ ...z, checks: [{ ...check, key }, ...(z.checks || [])] })), 'Contrôle atmosphérique enregistré', 'Atmospheric check recorded'));
        notify(tx('Contrôle enregistré', 'Check recorded'));
      } else {
        const sid = activeRef.current;
        setPending((p) => [{ id: check.id, shipId: sid, zoneId: ctx.zoneId, check, dataUrl }, ...p]);
        mutate((s) => addLog(s, 'Contrôle enregistré hors-ligne (en attente de synchro)', 'Check recorded offline (awaiting sync)'));
        notify(tx('Gardé sur l’appareil, envoyé au retour du réseau', 'Kept on this device, sent when back online'));
      }
      return;
    }
    const key = 'docfile:' + ctx.zoneId + ':permit:' + uid();
    try { await window.storage.set(key, dataUrl, true); docCache.current[key] = dataUrl; } catch (err) {}
    mutate((s) => addLog(withZone(s, ctx.zoneId, (z) => ({ ...z, permit: { name: file.name, key, validUntil: Date.now() + (s.costs.shift || 8) * HOUR } })), 'Permis importé — ' + file.name, 'Permit uploaded — ' + file.name));
    notify(tx('Permis importé', 'Permit uploaded'));
  }
  async function loadDoc(obj) {
    if (!obj) return null;
    if (obj.data) return obj.data;
    if (!obj.key) return null;
    if (docCache.current[obj.key]) return docCache.current[obj.key];
    try { const r = await window.storage.get(obj.key, true); if (r && r.value) { docCache.current[obj.key] = r.value; return r.value; } } catch (e) {}
    return null;
  }
  function openDoc(kind, obj) { setSheet({ kind: 'doc', docKind: kind, obj }); }
  function removePermit(zid) {
    if (!guard()) return;
    askConfirm({ message: tx('Retirer ce permis ?', 'Remove this permit?'), confirmLabel: tx('Retirer le permis', 'Remove permit'), onConfirm: () => mutate((s) => addLog(withZone(s, zid, (z) => ({ ...z, permit: null })), 'Permis retiré', 'Permit removed')) });
  }
  function setPermitUntil(zid, ts) { if (!guard()) return; mutate((s) => withZone(s, zid, (z) => (z.permit ? { ...z, permit: { ...z.permit, validUntil: ts } } : z))); }

  // Access register: open to everyone on site; the gate refuses and logs.
  function checkIn(zid, name) {
    const n = (name || '').trim(); if (!n) return { ok: false, empty: true };
    const zi = aRef.current && aRef.current.info.get(zid); if (!zi) return { ok: false };
    const z = zi.zone;
    let gate = null;
    if (z.type === 'confined' && (!zi.atmo || zi.atmo.state !== 'ok')) gate = zi.atmo && zi.atmo.state === 'overdue' ? { fr: 'Test atmosphérique expiré', en: 'Atmospheric test expired' } : { fr: 'Aucun test atmosphérique valide', en: 'No valid atmospheric test' };
    else if (z.type === 'hot' && !zi.fwHere.length) gate = { fr: 'Aucun fire watch posté sur la zone', en: 'No fire watch posted on the zone' };
    if (gate) { mutate((s) => addLog(s, 'Entrée refusée — ' + n + ' (' + gate.fr + ')', 'Entry refused — ' + n + ' (' + gate.en + ')')); return { ok: false, ...gate }; }
    const entry = { id: uid(), name: n, inAt: Date.now(), outAt: null };
    mutate((s) => addLog(withZone(s, zid, (x) => ({ ...x, entries: [entry, ...(x.entries || [])] })), 'Entrée en zone — ' + n + ' → ' + zoneTitle(z, 'fr'), 'Checked in — ' + n + ' → ' + zoneTitle(z, 'en')));
    return { ok: true };
  }
  function checkOut(zid, entryId) {
    mutate((s) => {
      const f = findZone(s, zid), e = f && (f.zone.entries || []).find((x) => x.id === entryId);
      if (!e || e.outAt) return s;
      return addLog(withZone(s, zid, (x) => ({ ...x, entries: x.entries.map((y) => (y.id === entryId ? { ...y, outAt: Date.now() } : y)) })), 'Sortie de zone — ' + e.name, 'Checked out — ' + e.name);
    });
  }

  function fwAdd(name) {
    const n = (name || '').trim(); if (!guard() || !n) return;
    mutate((s) => ({ ...s, crew: { ...s.crew, fireWatch: [...s.crew.fireWatch, { id: uid(), name: n, status: 'available', zoneId: null, since: null }] } }));
  }
  function fwAssign(fwId, zid) {
    if (!guard()) return;
    mutate((s) => {
      const f = s.crew.fireWatch.find((x) => x.id === fwId), fz = findZone(s, zid); if (!f || !fz) return s;
      let n = freeFw(s, (x) => x.id === fwId);
      n = { ...n, crew: { ...n.crew, fireWatch: n.crew.fireWatch.map((x) => (x.id === fwId ? { ...x, status: 'posted', zoneId: zid, since: Date.now() } : x)) } };
      return addLog(n, 'Fire watch posté — ' + f.name + ' → ' + zoneTitle(fz.zone, 'fr'), 'Fire watch posted — ' + f.name + ' → ' + zoneTitle(fz.zone, 'en'));
    });
  }
  function fwRelease(fwId, ask) {
    if (!guard()) return;
    const run = () => {
      mutate((s) => { const f = s.crew.fireWatch.find((x) => x.id === fwId); if (!f || f.status !== 'posted') return s; return addLog(freeFw(s, (x) => x.id === fwId), 'Fire watch libéré — ' + f.name, 'Fire watch released — ' + f.name); });
      notify(tx('Fire watch libéré', 'Fire watch released'));
    };
    if (ask) askConfirm({ message: tx('Libérer ce fire watch ?', 'Release this fire watch?'), detail: tx('Les travaux à chaud de sa zone seront bloqués.', 'Hot work in that zone will be blocked.'), confirmLabel: tx('Libérer', 'Release'), onConfirm: run });
    else run();
  }
  function fwRemove(fwId) {
    if (!guard()) return;
    mutate((s) => { const n = freeFw(s, (x) => x.id === fwId); return { ...n, crew: { ...n.crew, fireWatch: n.crew.fireWatch.filter((x) => x.id !== fwId) } }; });
  }
  function setCrew(patch) { if (!guard()) return; mutate((s) => ({ ...s, crew: { ...s.crew, ...patch } })); }

  function rentalAdd(r) {
    if (!guard()) return;
    mutate((s) => addLog({ ...s, rentals: [...(s.rentals || []), { id: uid(), returnedAt: null, ...r }] }, 'Matériel en location ajouté — ' + r.name, 'Hired equipment added — ' + r.name));
  }
  function rentalReturn(id) {
    if (!guard()) return;
    mutate((s) => {
      const r = (s.rentals || []).find((x) => x.id === id); if (!r) return s;
      return addLog({ ...s, rentals: s.rentals.map((x) => (x.id === id ? { ...x, returnedAt: Date.now() } : x)) },
        'Matériel restitué — ' + r.name + ' (' + fmtMoney(r.dayRate, 'fr', s.costs.currency) + ' par jour en moins)', 'Equipment returned — ' + r.name + ' (' + fmtMoney(r.dayRate, 'en', s.costs.currency) + ' a day saved)');
    });
    notify(tx('Restitution enregistrée', 'Return recorded'));
  }
  function setCosts(patch) { if (!guard()) return; mutate((s) => ({ ...s, costs: { ...s.costs, ...patch } })); }
  function setSchedule(patch) { if (!guard()) return; mutate((s) => ({ ...s, schedule: { ...s.schedule, ...patch } })); }

  async function exportFile(name, text, mime, okText) {
    const res = await saveFile(name, text, mime);
    if (res === 'saved') notify(okText);
    else if (res === 'failed') notify(tx('Export impossible ici', 'Export unavailable here'));
  }
  function exportTimesheet() {
    const s = shipRef.current, an = aRef.current; if (!s || !an) return;
    const C = s.costs, fr = lang !== 'en', sep = fr ? ';' : ',';
    const dec = (v) => (fr ? v.toFixed(2).replace('.', ',') : v.toFixed(2));
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = [tx('Date', 'Date'), tx('Entreprise', 'Company'), tx('Travaux', 'Work'), tx('Pont', 'Deck'), tx('Nom', 'Name'), tx('Entrée', 'In'), tx('Sortie', 'Out'), tx('Heures', 'Hours'), tx('Taux horaire', 'Hourly rate'), tx('Coût', 'Cost') + ' (' + C.currency + ')'];
    const rows = timesheetLines(an).map((l) => {
      const h = l.ms / HOUR, rate = l.kind === 'fw' ? C.fireWatch : C.labour;
      return [fmtDate(l.from, lang, { day: '2-digit', month: '2-digit', year: 'numeric' }), l.company || tx('Sans entreprise', 'No company'), l.work, l.deck, l.name, fmtTime(l.from, lang), l.to ? fmtTime(l.to, lang) : tx('en cours', 'ongoing'), dec(h), dec(rate), dec(h * rate)];
    });
    const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
    exportFile(tx('pointage', 'timesheet') + '-' + slug(s.name) + '-' + toLocalInput(Date.now(), true) + '.csv', csv, 'text/csv', tx('Pointage exporté', 'Timesheet exported'));
  }

  function login(code) {
    if (String(code || '').trim().toUpperCase() !== COORD_CODE) return false;
    setRole('coordinator'); notify(tx('Mode coordination', 'Coordination mode')); return true;
  }
  function logout() { setRole('viewer'); notify(tx('Lecture seule', 'View only')); }
  function resetDemo() {
    askConfirm({ message: tx('Réinitialiser la démo ?', 'Reset the demo?'), detail: tx('Les navires et modifications de cet appareil sont remplacés par l’exemple.', 'Vessels and changes on this device are replaced by the sample.'), confirmLabel: tx('Réinitialiser', 'Reset'), onConfirm: () => {
      markEdit(); setPending([]); seedDemo(); go('overview'); notify(tx('Démo réinitialisée', 'Demo reset'));
    } });
  }
  function openMenu(kind, e) { setMenu({ kind, anchor: e.currentTarget }); }
  function openLogin() { setSheet({ kind: 'login' }); }

  // ---------- render ----------
  const actions = { updateShip, updateDeck, updateZone, setZoneStatus, addZone, removeZone, addDeck, removeDeck, pickPlanImage, clearPlanImage, startAi,
    pickDoc, openDoc, removePermit, setPermitUntil, checkIn, checkOut, fwAdd, fwAssign, fwRelease, fwRemove, setCrew, rentalAdd, rentalReturn, setCosts, setSchedule, exportTimesheet, exportFile };
  const ctx = { ships, ship, a, lang, tx, canEdit, connected, synced, online, pending, deck, zoneId, setZoneId, setDeckId, focusZone, planMode, setPlanMode, tab, go, openZone,
    notify, askConfirm, actions, openSheet: setSheet, openLogin, loadDoc, findZone: (zid) => findZone(shipRef.current, zid) };

  const introHold = intro && !introOut;
  const statusText = connected ? (synced ? tx('En direct', 'Live') : tx('Synchronisation', 'Syncing')) : tx('Hors-ligne', 'Offline');
  const dotClass = 'live-dot' + (!connected ? ' off' : synced ? '' : ' sync');
  const roleText = canEdit ? tx('Coordination', 'Coordination') : tx('Lecture seule', 'View only');
  const S = a ? a.schedule : null;
  const dayText = S ? (S.started ? tx('Jour ', 'Day ') + S.dayNo + tx(' sur ', ' of ') + S.calDays + tx(' en cale', ' in dock') : tx('Entrée en cale le ', 'Docking on ') + fmtDate(S.dockIn, lang)) : '';
  const tabLabel = (t) => tx(t.fr, t.en);

  let view = null;
  if (ship && a) view = tab === 'plan' ? <PlanView /> : tab === 'works' ? <Works /> : tab === 'crew' ? <Crew /> : tab === 'costs' ? <Costs /> : <Overview />;

  return (
    <AppCtx.Provider value={ctx}>
      {intro && <Intro out={introOut} />}
      <div className="app" data-hold={introHold ? 'true' : 'false'}>
        <a className="skip" href="#main">{tx('Aller au contenu', 'Skip to content')}</a>
        <input ref={planInput} type="file" accept="image/*" onChange={onPlanFile} hidden />
        <input ref={aiInput} type="file" accept="image/*" onChange={onAiFile} hidden />
        <input ref={docInput} type="file" accept="image/*" onChange={onDocFile} hidden />
        <div className="shell">
          <aside className="sidebar" aria-label={tx('Navigation', 'Navigation')}>
            <div className="sidebar-in">
              <div className="brand"><BrandMark />DryDock Safety</div>
              {ship && (
                <button type="button" className="vessel-btn" aria-haspopup="menu" aria-label={tx('Navire : ', 'Vessel: ') + ship.name} onClick={(e) => openMenu('vessel', e)}>
                  <span className="tx"><span className="nm">{ship.name}</span><span className="mt">{dayText}</span></span>
                  <ChevronsUpDown size={16} aria-hidden="true" />
                </button>)}
              <nav className="side-nav">
                {TABS.map(({ key, Icon, ...t }) => (
                  <button key={key} type="button" className="side-item" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)}>
                    <Icon size={18} strokeWidth={tab === key ? 2.3 : 2} aria-hidden="true" /><span>{tabLabel(t)}</span>
                    {key === 'overview' && a && a.alertCount > 0 && <span className="badge" aria-label={a.alertCount + ' ' + tx('alertes', 'alerts')}>{a.alertCount}</span>}
                  </button>))}
              </nav>
              <div className="side-foot"><span className={dotClass} aria-hidden="true" /><span>{statusText}, {online} {tx(online > 1 ? 'connectés' : 'connecté', 'online')}</span></div>
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              {ship && (
                <button type="button" className="vessel-pill glassy" aria-haspopup="menu" aria-label={tx('Navire : ', 'Vessel: ') + ship.name} onClick={(e) => openMenu('vessel', e)}>
                  <span>{ship.name}</span><ChevronsUpDown size={15} aria-hidden="true" />
                </button>)}
              <div className="topbar-space" />
              <button type="button" className="status-pill glassy" onClick={(e) => (canEdit ? openMenu('more', e) : openLogin())} aria-label={statusText + ', ' + roleText + (canEdit ? '' : ', ' + tx('se connecter', 'sign in'))}>
                <span className={dotClass} aria-hidden="true" />{statusText}
                {pending.length > 0 && <span className="cnt">{pending.length}</span>}
                <span className="sep" aria-hidden="true" />
                <span className="role">{canEdit ? <LockOpen size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}<span className="role-t">{roleText}</span></span>
              </button>
              <button type="button" className="icon-btn glassy" aria-label={tx('Plus d’options', 'More options')} aria-haspopup="menu" onClick={(e) => openMenu('more', e)}><Ellipsis size={20} strokeWidth={2.2} aria-hidden="true" /></button>
            </header>
            <main id="main" className="page" tabIndex={-1}>{view}</main>
            <footer className="foot">{tx('DryDock Safety, version bêta. Permis et tests affichés sont des exemples de démonstration.', 'DryDock Safety, beta. Permits and tests shown are demonstration samples.')}</footer>
          </div>
        </div>
        {ship && (
          <nav className="tabbar" aria-label={tx('Sections', 'Sections')}>
            {TABS.map(({ key, Icon, ...t }) => { const on = tab === key; return (
              <button key={key} type="button" aria-current={on ? 'page' : undefined} onClick={() => go(key)}>
                <span className="ico"><Icon size={23} strokeWidth={on ? 2.3 : 1.9} aria-hidden="true" />{key === 'overview' && a && a.alertCount > 0 && <span className="badge" aria-label={a.alertCount + ' ' + tx('alertes', 'alerts')}>{a.alertCount}</span>}</span>
                <span className="lbl">{tabLabel(t)}</span>
              </button>); })}
          </nav>)}
      </div>

      {menu && menu.kind === 'vessel' && (
        <Menu anchor={menu.anchor} align="start" label={tx('Navires', 'Vessels')} onClose={() => setMenu(null)}>
          <MenuLabel>{tx('Navires', 'Vessels')}</MenuLabel>
          {ships.map((s) => <MenuItem key={s.id} role="menuitemradio" checked={s.id === activeId} onSelect={() => selectShip(s.id)}>{s.name}</MenuItem>)}
          {canEdit && <>
            <MenuSep />
            <MenuItem icon={<Pencil size={17} />} onSelect={() => setSheet({ kind: 'vessel' })}>{tx('Modifier le navire', 'Edit vessel')}</MenuItem>
            <MenuItem icon={<Plus size={17} />} onSelect={addShip}>{tx('Nouveau navire', 'New vessel')}</MenuItem>
            {!ships.some((s) => s.name === "L'Atalante") && <MenuItem icon={<ShipIcon size={17} />} onSelect={addExample} sub={tx('Plan photographié et lu par l’IA', 'Photographed plan read by AI')}>{tx('Ajouter l’exemple L’Atalante', 'Add the L’Atalante sample')}</MenuItem>}
            {ships.length > 1 && <MenuItem danger icon={<Trash2 size={17} />} onSelect={() => removeShip(activeId)}>{tx('Supprimer ce navire', 'Delete this vessel')}</MenuItem>}
          </>}
        </Menu>)}
      {menu && menu.kind === 'more' && (
        <Menu anchor={menu.anchor} label={tx('Options', 'Options')} onClose={() => setMenu(null)}>
          <MenuItem icon={<ClipboardList size={17} />} onSelect={() => setSheet({ kind: 'report' })}>{tx('Rapport journalier', 'Daily report')}</MenuItem>
          <MenuSep />
          <MenuLabel>{tx('Langue', 'Language')}</MenuLabel>
          <Segmented block value={lang} onChange={setLang} label={tx('Langue', 'Language')} options={[{ value: 'bi', label: 'FR', title: 'Français, consignes de sécurité aussi en anglais' }, { value: 'en', label: 'EN', title: 'English' }, { value: 'bg', label: 'БГ', title: 'Български' }]} />
          <MenuItem role="menuitemcheckbox" checked={simOffline} keepOpen onSelect={() => setSimOffline((v) => !v)} trail={<span className={'switch' + (simOffline ? ' on' : '')} aria-hidden="true" />}>{tx('Simuler hors-ligne', 'Simulate offline')}</MenuItem>
          <div className="menu-item static"><span className={dotClass} aria-hidden="true" />{online} {tx(online > 1 ? 'personnes connectées' : 'personne connectée', online > 1 ? 'people online' : 'person online')}</div>
          <MenuItem icon={<RotateCcw size={17} />} onSelect={resetDemo}>{tx('Réinitialiser la démo', 'Reset the demo')}</MenuItem>
          <MenuSep />
          {canEdit
            ? <MenuItem icon={<LogOut size={17} />} onSelect={logout}>{tx('Quitter la coordination', 'Leave coordination')}</MenuItem>
            : <MenuItem icon={<LogIn size={17} />} onSelect={openLogin}>{tx('Accès coordination', 'Coordination access')}</MenuItem>}
        </Menu>)}

      {sheet && sheet.kind === 'login' && <LoginSheet onClose={() => setSheet(null)} login={login} />}
      {sheet && sheet.kind === 'report' && ship && <ReportSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'doc' && <DocSheet docKind={sheet.docKind} obj={sheet.obj} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'ai' && <AiSheet phase={sheet.phase} result={sheet.result} onApply={applyAi} onCancel={cancelAi} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'vessel' && ship && <VesselSheet key={ship.id} isNew={!!sheet.isNew} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'deck' && ship && <DeckSheet deckId={sheet.deckId} onClose={() => setSheet(null)} />}
      {sheet && sheet.kind === 'rental' && ship && <RentalSheet onClose={() => setSheet(null)} />}
      {confirm && <ConfirmSheet message={confirm.message} detail={confirm.detail} confirmLabel={confirm.confirmLabel} cancelLabel={tx('Annuler', 'Cancel')} onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />}
      {toast && <div key={toast.id} className="toast" role="status">{toast.text}</div>}
    </AppCtx.Provider>
  );
}
