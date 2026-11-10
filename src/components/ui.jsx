// Shared interface pieces: sheets, menus, segmented control, chips.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpFromLine, Check, CircleDashed, CircleDot, Flame, Minus, Plus, SprayCan, Wind, X } from 'lucide-react';
import { HAZARDS, ISSUES, STATUS } from '../lib/model.js';
import { pick } from '../lib/i18n.js';
import { prefersReducedMotion } from '../lib/platform.js';

const COMPACT = '(max-width: 899px)';
export function useIsCompact() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(COMPACT).matches);
  useEffect(() => {
    const m = window.matchMedia(COMPACT), f = () => setCompact(m.matches);
    f(); m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return compact;
}

// Escape closes the layer on top, and only that one.
const layers = [];
function onLayerKey(e) { if (e.key === 'Escape' && layers.length) { e.preventDefault(); layers[layers.length - 1](); } }
function pushLayer(fn) {
  if (!layers.length) window.addEventListener('keydown', onLayerKey);
  layers.push(fn);
  return () => { const i = layers.lastIndexOf(fn); if (i >= 0) layers.splice(i, 1); if (!layers.length) window.removeEventListener('keydown', onLayerKey); };
}

function useLayer(onClose, exitMs) {
  const [closing, setClosing] = useState(false);
  const state = useRef({ closing: false, onClose });
  state.current.onClose = onClose;
  const close = useCallback(() => {
    if (state.current.closing) return;
    state.current.closing = true; setClosing(true);
    setTimeout(() => state.current.onClose(), prefersReducedMotion() ? 110 : exitMs);
  }, [exitMs]);
  useEffect(() => pushLayer(close), [close]);
  return [closing, close, state];
}

function useFocusReturn(ref, grab) {
  useEffect(() => {
    const before = document.activeElement;
    const el = ref.current;
    if (el && grab) { const auto = el.querySelector('[data-autofocus]'); (auto || el).focus({ preventScroll: true }); }
    return () => {
      // Give focus back only if it is still ours: a sheet opened from a menu keeps its focus.
      const now = document.activeElement;
      const ours = !now || now === document.body || (el && el.contains(now));
      if (ours && before && before.focus && document.contains(before)) { try { before.focus({ preventScroll: true }); } catch (e) {} }
    };
  }, []);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trapTab(e, el) {
  if (e.key !== 'Tab' || !el) return;
  const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// A sheet: a centred dialog on wide screens, a bottom sheet with a grabber on a phone.
// `nonmodal` keeps the page usable behind it (phone only); `detent` rests at half height first.
export function Sheet({ title, sub, icon, children, footer, onClose, width, nonmodal = false, detent = false, label, closeLabel = 'Fermer', tone }) {
  const compact = useIsCompact();
  const [closing, close, st] = useLayer(onClose, compact ? 230 : 150);
  const [large, setLarge] = useState(false);
  const ref = useRef(null), drag = useRef(null);
  useFocusReturn(ref, !(nonmodal && compact));

  const onDown = (e) => {
    if (!compact || e.target.closest('button, input, select, a, textarea')) return;
    drag.current = { y0: e.clientY, t0: Date.now(), dy: 0 };
    ref.current.style.transition = 'none';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    d.dy = e.clientY - d.y0;
    ref.current.style.transform = 'translateY(' + (d.dy > 0 ? d.dy : d.dy * 0.2) + 'px)';
  };
  const onUp = () => {
    const d = drag.current, el = ref.current; if (!d || !el) return;
    drag.current = null;
    const v = d.dy / Math.max(1, Date.now() - d.t0);
    el.style.transition = 'transform 260ms cubic-bezier(.2, .8, .2, 1)';
    const down = d.dy > 110 || (d.dy > 24 && v > 0.11), up = d.dy < -36;
    if (Math.abs(d.dy) < 4 && detent) { el.style.transform = ''; setLarge((x) => !x); }
    else if (up && detent && !large) { el.style.transform = ''; setLarge(true); }
    else if (down && detent && large) { el.style.transform = ''; setLarge(false); }
    else if (down) { st.current.closing = true; el.style.transform = 'translateY(100%)'; setTimeout(() => st.current.onClose(), 220); return; }
    else el.style.transform = '';
    setTimeout(() => { if (ref.current) ref.current.style.transition = ''; }, 280);
  };
  const dragProps = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return createPortal(
    <div className={'sheet-layer' + (closing ? ' closing' : '') + (nonmodal ? ' nonmodal' : '')}>
      {!(nonmodal && compact) && <div className="sheet-scrim" onClick={close} />}
      <div ref={ref} className={'sheet' + (detent ? ' detent' : '') + (large ? ' large' : '')} role="dialog" aria-modal={!(nonmodal && compact)} aria-label={label || (typeof title === 'string' ? title : undefined)}
        tabIndex={-1} style={width ? { '--sheet-w': width + 'px' } : undefined} onKeyDown={(e) => { if (!(nonmodal && compact)) trapTab(e, ref.current); }}>
        <div className="sheet-grab" {...dragProps} aria-hidden="true" />
        {(title || icon) && (
          <div className="sheet-head" {...dragProps}>
            {icon}
            <h2 className="sheet-title">{title}{sub && <small>{sub}</small>}</h2>
            <button type="button" className="icon-btn sm" onClick={close} aria-label={closeLabel}><X size={16} strokeWidth={2.4} aria-hidden="true" /></button>
          </div>
        )}
        <div className="sheet-body">{typeof children === 'function' ? children(close) : children}</div>
        {footer && <div className="sheet-foot">{typeof footer === 'function' ? footer(close) : footer}</div>}
      </div>
    </div>, document.body);
}

// Confirmation for something that cannot be undone.
export function ConfirmSheet({ message, detail, confirmLabel, cancelLabel, onConfirm, onClose }) {
  const compact = useIsCompact();
  const [closing, close, st] = useLayer(onClose, compact ? 230 : 150);
  const ref = useRef(null);
  useFocusReturn(ref, true);
  return createPortal(
    <div className={'sheet-layer action-layer' + (closing ? ' closing' : '')}>
      <div className="sheet-scrim" onClick={close} />
      <div ref={ref} className="action-sheet" role="alertdialog" aria-modal="true" aria-label={message} tabIndex={-1} onKeyDown={(e) => trapTab(e, ref.current)}>
        <div className="grp">
          <div className="msg">{message}{detail && <small>{detail}</small>}</div>
          <button type="button" className="destructive" data-autofocus onClick={() => { st.current.closing = true; st.current.onClose(); onConfirm(); }}>{confirmLabel}</button>
        </div>
        <div className="grp"><button type="button" className="cancel" onClick={close}>{cancelLabel}</button></div>
      </div>
    </div>, document.body);
}

const MenuCtx = createContext(() => {});

// A menu anchored to its trigger on wide screens, a bottom sheet on a phone.
export function Menu({ anchor, onClose, children, align = 'end', label }) {
  const compact = useIsCompact();
  const [closing, close] = useLayer(onClose, compact ? 210 : 110);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useFocusReturn(ref, true);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !anchor || !anchor.getBoundingClientRect) return;
    const r = anchor.getBoundingClientRect(), h = el.offsetHeight, w = el.offsetWidth, vw = window.innerWidth, vh = window.innerHeight;
    const below = r.bottom + 8 + h <= vh - 12 || r.top - 8 - h < 12;
    const top = below ? Math.min(r.bottom + 8, Math.max(12, vh - 12 - h)) : r.top - 8 - h;
    const p = { top, '--origin': (below ? 'top ' : 'bottom ') + (align === 'end' ? 'right' : 'left') };
    if (align === 'end') p.right = Math.max(12, Math.min(vw - r.right, vw - 12 - w));
    else p.left = Math.max(12, Math.min(r.left, vw - 12 - w));
    setPos(p);
  }, [anchor, align]);
  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') { trapTab(e, ref.current); return; }
    e.preventDefault();
    const items = [...ref.current.querySelectorAll('button.menu-item, .seg button')];
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (next) next.focus();
  };
  return createPortal(
    <div className={'menu-layer' + (closing ? ' closing' : '')}>
      <div className="menu-scrim" onClick={close} />
      <div ref={ref} className="menu" role="menu" aria-label={label} tabIndex={-1} style={pos || { visibility: compact ? 'visible' : 'hidden' }} onKeyDown={onKey}>
        <MenuCtx.Provider value={close}>{children}</MenuCtx.Provider>
      </div>
    </div>, document.body);
}
export function MenuItem({ icon, checked, danger, onSelect, children, sub, keepOpen, role = 'menuitem', trail }) {
  const close = useContext(MenuCtx);
  return (
    <button type="button" role={role} aria-checked={role === 'menuitem' ? undefined : !!checked} className={'menu-item' + (danger ? ' danger' : '')}
      onClick={() => { if (!keepOpen) close(); onSelect && onSelect(); }}>
      {(icon || (checked != null && !trail)) && <span className="ck" aria-hidden="true">{checked && !trail ? <Check size={17} strokeWidth={2.6} /> : icon}</span>}
      <span className="tx">{children}{sub && <small>{sub}</small>}</span>
      {trail}
    </button>);
}
export const MenuLabel = ({ children }) => <div className="menu-label">{children}</div>;
export const MenuSep = () => <div className="menu-sep" role="separator" />;

export function Segmented({ value, onChange, options, label, block, className }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);
  const sig = options.map((o) => o.value + ':' + o.label + ':' + (o.count == null ? '' : o.count)).join('|');
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const measure = () => { const b = el.querySelector('button[aria-pressed="true"]'); setThumb(b ? { x: b.offsetLeft, w: b.offsetWidth } : null); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [value, sig]);
  return (
    <div ref={ref} className={'seg' + (block ? ' block' : '') + (className ? ' ' + className : '')} role="group" aria-label={label}>
      {thumb && <span className="seg-thumb" aria-hidden="true" style={{ width: thumb.w + 'px', transform: 'translateX(' + thumb.x + 'px)' }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon}{o.label}{o.count != null && <span className="n">{o.count}</span>}
        </button>))}
    </div>);
}

export function Stepper({ value, onChange, min = 1, max = 30, label, lessLabel = '−', moreLabel = '+' }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={lessLabel}><Minus size={15} strokeWidth={2.4} aria-hidden="true" /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={moreLabel}><Plus size={15} strokeWidth={2.4} aria-hidden="true" /></button>
    </span>);
}

export const HAZARD_ICON = { hot: Flame, confined: Wind, height: ArrowUpFromLine, blast: SprayCan };
export function HazardTile({ type, large }) {
  const Ico = HAZARD_ICON[type] || Flame;
  return <span className={'tile-ic hz hz-' + type + (large ? ' lg' : '')} aria-hidden="true"><Ico size={large ? 19 : 16} strokeWidth={2.2} /></span>;
}
// Hazard name; in the bilingual mode the English follows, dimmed.
export function HazardName({ type, lang }) {
  const h = HAZARDS[type];
  return lang === 'bi' ? <>{h.label.fr} <span className="sub-en">/ {h.label.en}</span></> : pick(lang, h.label.fr, h.label.en);
}

export function Chip({ tone, icon, children, title }) {
  return <span className={'chip' + (tone ? ' ' + tone : '')} title={title}>{icon}{children}</span>;
}
export function StatusChip({ status, lang }) {
  const s = STATUS[status];
  const tone = status === 'done' ? 'ok' : status === 'progress' ? 'info' : '';
  const Ico = status === 'done' ? Check : status === 'progress' ? CircleDot : CircleDashed;
  return <Chip tone={tone} icon={<Ico size={12} strokeWidth={2.6} aria-hidden="true" />}>{pick(lang, s.fr, s.en)}</Chip>;
}
// How ready a zone is: ready, to prepare (before a start), or the first open issue.
export function StateChip({ zi, lang }) {
  if (zi.state === 'done') return null;
  if (zi.state === 'ready') return <Chip tone="ok" icon={<Check size={12} strokeWidth={2.8} aria-hidden="true" />}>{pick(lang, 'Prêt', 'Ready')}</Chip>;
  const list = zi.issues.length ? zi.issues : zi.prep;
  const first = ISSUES[list[0].code];
  const more = list.length > 1 ? ' +' + (list.length - 1) : '';
  if (zi.state === 'prepare') return <Chip>{pick(lang, 'À préparer', 'To prepare')}</Chip>;
  return <Chip tone={zi.state === 'blocked' ? 'danger' : 'warn'}>{pick(lang, first.sfr, first.sen)}{more}</Chip>;
}

export function Section({ title, count, action, children, note, className }) {
  return (
    <section className={'sect' + (className ? ' ' + className : '')}>
      <div className="sect-head"><h2 className="sect-title">{title}{count != null && <span className="n">{count}</span>}</h2>{action}</div>
      {children}
      {note && <p className="sect-note">{note}</p>}
    </section>);
}

export function BrandMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5h18l-2 7.4a3 3 0 0 1-2.9 2.2H7.9A3 3 0 0 1 5 14.9L3 7.5Z" />
      <path d="M6.5 20.5h2.2M10.9 20.5h2.2M15.3 20.5h2.2" />
    </svg>);
}
