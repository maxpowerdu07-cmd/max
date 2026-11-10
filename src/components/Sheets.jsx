import React, { useEffect, useRef, useState } from 'react';
import { Download, Info, LoaderCircle, Sparkles } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { COORD_CODE, HAZARDS } from '../lib/model.js';
import { DAY, fmtDate, fmtHours, fmtMoney, fmtNum, fmtTime, fromLocalInput, pick, toLocalInput } from '../lib/i18n.js';
import { Sheet } from './ui.jsx';
import { alertSentence, capFirst, colon } from '../views/text.js';

const HOUR = 3600000;
const sod = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function LoginSheet({ onClose, login }) {
  const { tx } = useApp();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(false);
  return (
    <Sheet title={tx('Accès coordination', 'Coordination access')} closeLabel={tx('Fermer', 'Close')} onClose={onClose} width={420}
      footer={(close) => <><button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button><button type="submit" form="login-form" className="btn primary">{tx('Déverrouiller', 'Unlock')}</button></>}>
      {(close) => (
        <form id="login-form" onSubmit={(e) => { e.preventDefault(); if (login(code)) close(); else setErr(true); }}>
          <p className="sheet-text">{tx('La coordination modifie les zones, les permis, les équipes et les coûts. Tout le monde peut consulter le chantier et pointer les entrées en zone.', 'Coordination edits zones, permits, crews and costs. Everyone can view the site and record zone entries.')}</p>
          <label className="field">
            <span className="lbl">{tx('Code d’accès', 'Access code')}</span>
            <input className={'input' + (err ? ' err' : '')} type="password" name="access-code" autoComplete="current-password" spellCheck={false} data-autofocus value={code} onChange={(e) => { setCode(e.target.value); setErr(false); }} aria-invalid={err} />
          </label>
          {err && <p className="err-text" role="alert" style={{ marginTop: 8 }}>{tx('Code incorrect. Vérifiez-le auprès de la coordination.', 'Wrong code. Check it with site coordination.')}</p>}
          <p className="hint" style={{ marginTop: 10 }}>{tx('Démo : le code est ', 'Demo: the code is ')}{COORD_CODE}</p>
        </form>)}
    </Sheet>);
}

const PAPER_CSS = 'body{margin:0;background:#f2f2f7;color:#1d1d1f;font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}'
  + '.paper{max-width:760px;margin:32px auto;background:#fff;border-radius:14px;padding:36px 40px;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
  + '.paper h2{margin:0;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.018em}.paper .meta{margin:2px 0 0;color:#6e6e73}'
  + '.paper h3{margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid #d2d2d7;font-size:15px;line-height:20px;font-weight:600}'
  + '.paper p{margin:0 0 6px}.paper ul{margin:0;padding-left:18px}.paper li{margin-bottom:4px}'
  + '.crit{color:#c5221f;font-weight:600}.bad{color:#c5221f}.warnt{color:#8a5a00}.okt{color:#1d7a3e}'
  + '.log{display:grid;grid-template-columns:auto 1fr;gap:3px 14px}.log time{color:#6e6e73;font-variant-numeric:tabular-nums;white-space:nowrap}'
  + '.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px 18px;margin:16px 0 4px}.figs div{border-top:2px solid #1d1d1f;padding-top:6px}'
  + '.figs b{display:block;font-size:20px;line-height:24px;font-weight:700}.figs span{color:#6e6e73;font-size:12px}.note{margin-top:20px;color:#6e6e73;font-size:12px}'
  + '@media print{body{background:#fff}.paper{box-shadow:none;margin:0;max-width:none;padding:0}}';

export function ReportSheet({ onClose }) {
  const { ship, a, lang, tx, actions } = useApp();
  const ref = useRef(null);
  const C = ship.costs, m = (v) => fmtMoney(v, lang, C.currency), c = colon(lang);
  const date = capFirst(fmtDate(a.now, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const logs = (ship.log || []).filter((l) => l.ts >= sod(a.now)).slice().reverse();
  const fwActive = a.fw.filter((x) => x.state === 'active' || x.state === 'cooldown').length;
  const idle = a.rentals.filter((r) => r.idle).reduce((s, r) => s + r.rental.dayRate, 0);
  const S = a.schedule;

  async function exportIt() {
    if (!ref.current) return;
    const html = '<!doctype html><html lang="' + (lang === 'en' ? 'en' : lang === 'bg' ? 'bg' : 'fr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
      + tx('Rapport journalier', 'Daily report') + ' — ' + ship.name.replace(/</g, '&lt;') + '</title><style>' + PAPER_CSS + '</style></head><body>' + ref.current.outerHTML + '</body></html>';
    const name = tx('rapport-securite', 'safety-report') + '-' + ship.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-' + toLocalInput(a.now, true) + '.html';
    actions.exportFile(name, html, 'text/html', tx('Rapport exporté', 'Report exported'));
  }

  return (
    <Sheet title={tx('Rapport journalier', 'Daily report')} sub={ship.name} closeLabel={tx('Fermer', 'Close')} width={700} onClose={onClose}
      footer={(close) => <><button type="button" className="btn" onClick={close}>{tx('Fermer', 'Close')}</button><button type="button" className="btn primary" onClick={exportIt}><Download size={17} aria-hidden="true" />{tx('Exporter', 'Export')}</button></>}>
      <article ref={ref} className="paper">
        <h2>{tx('Rapport journalier de sécurité', 'Daily safety report')}</h2>
        <p className="meta">{ship.name}, {date}</p>
        <div className="figs">
          <div><b>{a.counts.progress}</b><span>{tx('travaux en cours', 'works in progress')}</span></div>
          <div><b>{a.occupants.length}</b><span>{tx('personnes en zone', 'people in zones')}</span></div>
          <div><b>{a.checksToday}</b><span>{tx('contrôles gaz du jour', 'gas checks today')}</span></div>
          <div><b>{fwActive} / {ship.crew.fireWatch.length}</b><span>{tx('fire watch en poste', 'fire watch posted')}</span></div>
          <div><b>{fmtHours(a.timesheet.totalMs, lang)}</b><span>{tx('heures pointées', 'hours booked')}</span></div>
        </div>
        <h3>{tx('Coordination', 'Coordination')}</h3>
        <p>{tx('Coordinateur', 'Coordinator')}{c}{ship.crew.coordinator || '—'}{ship.crew.assistant ? ', ' + tx('assistant', 'assistant') + c + ship.crew.assistant : ''}</p>
        <h3>{tx('Points de vigilance', 'Attention points')}</h3>
        {a.alerts.length === 0
          ? <p className="okt">{tx('Aucun point de vigilance : chantier conforme au moment du rapport.', 'No attention point: site compliant at report time.')}</p>
          : <ul>{a.alerts.map((al) => <li key={al.id} className={al.sev >= 3 ? 'crit' : al.sev === 2 ? 'bad' : 'warnt'}>{alertSentence(al, lang)}</li>)}</ul>}
        <h3>{tx('Coûts', 'Costs')}</h3>
        <p>{tx('Main-d’œuvre exposée à un arrêt', 'Labour at risk of a stoppage')}{c}{a.cost.standbyRate ? m(a.cost.standbyRate) + tx(' par heure (', ' an hour (') + a.cost.standbyPeople + tx(' personnes sur ', ' people on ') + a.cost.blockers.length + tx(' travaux).', ' works).') : tx('aucune.', 'none.')}</p>
        <p>{tx('Heures pointées', 'Hours booked')}{c}{fmtHours(a.timesheet.totalMs, lang)}{tx(', soit ', ', or ')}{m(a.timesheet.totalCost)}.</p>
        <p>{tx('Matériel en location', 'Hired equipment')}{c}{m(a.cost.rentalDaily)}{tx(' par jour', ' a day')}{idle ? tx(', dont ', ', of which ') + m(idle) + tx(' pour du matériel inactif.', ' for idle equipment.') : '.'}</p>
        <p>{tx('Cale', 'Dock')}{c}{S.started ? tx('jour ', 'day ') + S.dayNo + tx(' sur ', ' of ') + S.calDays : tx('entrée le ', 'docking on ') + fmtDate(S.dockIn, lang)}. {S.delayDays ? tx('Retard projeté', 'Projected delay') + c + fmtNum(S.delayDays, lang, 1) + (S.delayDays > 1 ? tx(' jours, soit ', ' days, or ') : tx(' jour, soit ', ' day, or ')) + m(S.delayCost) + '.' : tx('Sortie prévue tenue au rythme actuel.', 'Planned undocking holds at the current pace.')}</p>
        <h3>{tx('Journal des opérations', 'Operations log')}</h3>
        {logs.length === 0
          ? <p>{tx('Aucune opération enregistrée aujourd’hui.', 'No operation recorded today.')}</p>
          : <div className="log">{logs.map((l) => <React.Fragment key={l.id}><time>{fmtTime(l.ts, lang)}</time><span>{pick(lang, l.fr, l.en)}</span></React.Fragment>)}</div>}
        <p className="note">{tx('Généré par DryDock Safety (bêta) le ', 'Generated by DryDock Safety (beta) on ')}{fmtDate(a.now, lang, { day: 'numeric', month: 'long', year: 'numeric' })}{tx(' à ', ' at ')}{fmtTime(a.now, lang)}.</p>
      </article>
    </Sheet>);
}

export function DocSheet({ docKind, obj, onClose }) {
  const { tx, loadDoc } = useApp();
  const [state, setState] = useState({ loading: true, data: null });
  useEffect(() => { let alive = true; loadDoc(obj).then((d) => { if (alive) setState({ loading: false, data: d }); }); return () => { alive = false; }; }, []);
  const name = obj.name || obj.fileName || '';
  return (
    <Sheet title={docKind === 'permit' ? tx('Permis de travail', 'Work permit') : tx('Test atmosphérique', 'Atmospheric test')} sub={name} closeLabel={tx('Fermer', 'Close')} width={620} onClose={onClose}>
      <div className="doc-frame">
        {state.loading ? <div className="doc-empty">{tx('Chargement…', 'Loading…')}</div>
          : state.data ? <img src={state.data} alt={name} />
            : <div className="doc-empty">{tx('Document indisponible sur cet appareil.', 'Document not available on this device.')}</div>}
      </div>
    </Sheet>);
}

export function AiSheet({ phase, result, onApply, onCancel, onClose }) {
  const { tx, lang } = useApp();
  const loading = phase === 'loading';
  return (
    <Sheet title={tx('Lecture du plan par l’IA', 'AI plan reading')} closeLabel={tx('Fermer', 'Close')} width={500}
      icon={<span className="tile-ic tone-info" aria-hidden="true"><Sparkles size={16} /></span>}
      onClose={() => { if (loading) onCancel(); onClose(); }}
      footer={(close) => (loading
        ? <button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button>
        : <><button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button><button type="button" className="btn primary" onClick={() => { onApply(result); close(); }}>{tx('Créer les ponts', 'Create decks')}</button></>)}>
      {loading ? (
        <div aria-live="polite">
          <div className="ai-step"><LoaderCircle size={18} className="spin" aria-hidden="true" />{tx('Lecture du plan d’arrangement général…', 'Reading the general arrangement plan…')}</div>
          <p className="hint" style={{ marginTop: 8 }}>{tx('L’IA repère les ponts, découpe les compartiments et propose des zones à risque. Rien n’est créé avant votre accord.', 'The AI finds the decks, maps the compartments and suggests hazard zones. Nothing is created until you agree.')}</p>
        </div>
      ) : result ? (
        <div>
          {result.demo && <div className="banner plain"><Info size={18} aria-hidden="true" /><div><p>{tx('Lecture IA indisponible ici. Voici un exemple (pétrolier) pour montrer le résultat.', 'AI reading isn’t available here. This sample (a tanker) shows the result.')}</p></div></div>}
          {result.decks.map((d, i) => (
            <div key={i} className="ai-deck">
              <h4>{d.name}</h4>
              <p>{(d.compartments || []).length} {tx('compartiments', 'compartments')}, {(d.suggestedZones || []).length} {tx('zones proposées', 'suggested zones')}</p>
              {(d.suggestedZones || []).length > 0 && <ul>{d.suggestedZones.filter((z) => HAZARDS[z.type]).map((z, j) => <li key={j} className={'hz-' + z.type}><span className="swatch" aria-hidden="true" />{pick(lang, z.workFr || z.workEn, z.workEn || z.workFr)}</li>)}</ul>}
            </div>))}
        </div>
      ) : null}
    </Sheet>);
}

export function VesselSheet({ isNew, onClose }) {
  const { ship, tx, actions } = useApp();
  const [name, setName] = useState(ship.name);
  const [dockIn, setDockIn] = useState(toLocalInput(ship.schedule.dockIn, true));
  const [undock, setUndock] = useState(toLocalInput(ship.schedule.undock, true));
  const [len, setLen] = useState(String(ship.dock.shipLength || ''));
  const [beam, setBeam] = useState(String(ship.dock.shipWidth || ''));
  const [err, setErr] = useState(null);
  function save(close) {
    const di = fromLocalInput(dockIn + 'T07:00'), ud = fromLocalInput(undock + 'T17:00');
    if (!name.trim()) { setErr(tx('Donnez un nom au navire.', 'Give the vessel a name.')); return; }
    if (!di || !ud || ud <= di) { setErr(tx('La sortie doit suivre l’entrée en cale.', 'Undocking must come after docking.')); return; }
    const L = Math.max(20, Math.min(400, Number(len) || ship.dock.shipLength)), B = Math.max(5, Math.min(70, Number(beam) || ship.dock.shipWidth));
    actions.updateShip({ name: name.trim().slice(0, 60), schedule: { dockIn: di, undock: ud }, dock: { ...ship.dock, shipLength: L, shipWidth: B } });
    close();
  }
  const days = (() => { const di = fromLocalInput(dockIn + 'T07:00'), ud = fromLocalInput(undock + 'T17:00'); return di && ud && ud > di ? Math.round((ud - di) / DAY) + 1 : null; })();
  return (
    <Sheet title={isNew ? tx('Nouveau navire', 'New vessel') : tx('Modifier le navire', 'Edit vessel')} closeLabel={tx('Fermer', 'Close')} width={460} onClose={onClose}
      footer={(close) => <><button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button><button type="submit" form="vessel-form" className="btn primary">{tx('Enregistrer', 'Save')}</button></>}>
      {(close) => (
        <form id="vessel-form" onSubmit={(e) => { e.preventDefault(); save(close); }}>
          <label className="field"><span className="lbl">{tx('Nom', 'Name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></label>
          <div className="field-row" style={{ marginTop: 14 }}>
            <label className="field"><span className="lbl">{tx('Entrée en cale', 'Docking')}</span><input className="input" type="date" value={dockIn} onChange={(e) => setDockIn(e.target.value)} /></label>
            <label className="field"><span className="lbl">{tx('Sortie prévue', 'Undocking')}</span><input className="input" type="date" value={undock} onChange={(e) => setUndock(e.target.value)} /></label>
          </div>
          {days && <p className="hint" style={{ marginTop: 6 }}>{days} {tx('jours de cale', 'days in dock')}</p>}
          <div className="field-row" style={{ marginTop: 14 }}>
            <label className="field"><span className="lbl">{tx('Longueur (m)', 'Length (m)')}</span><input className="input" type="number" inputMode="decimal" min="20" max="400" value={len} onChange={(e) => setLen(e.target.value)} /></label>
            <label className="field"><span className="lbl">{tx('Largeur (m)', 'Beam (m)')}</span><input className="input" type="number" inputMode="decimal" min="5" max="70" value={beam} onChange={(e) => setBeam(e.target.value)} /></label>
          </div>
          {err && <p className="err-text" role="alert" style={{ marginTop: 10 }}>{err}</p>}
        </form>)}
    </Sheet>);
}

export function DeckSheet({ deckId, onClose }) {
  const { ship, tx, actions } = useApp();
  const deck = ship.decks.find((d) => d.id === deckId) || ship.decks[0];
  const [name, setName] = useState(deck.name);
  const [layout, setLayout] = useState(deck.layout || 'main');
  return (
    <Sheet title={tx('Pont', 'Deck')} sub={deck.name} closeLabel={tx('Fermer', 'Close')} width={420} onClose={onClose}
      footer={(close) => <><button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button><button type="submit" form="deck-form" className="btn primary">{tx('Enregistrer', 'Save')}</button></>}>
      {(close) => (
        <form id="deck-form" onSubmit={(e) => { e.preventDefault(); actions.updateDeck(deck.id, { name: name.trim().slice(0, 60) || deck.name, layout }); close(); }}>
          <label className="field"><span className="lbl">{tx('Nom du pont', 'Deck name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></label>
          <label className="field"><span className="lbl">{tx('Schéma du pont', 'Deck layout')}</span>
            <select className="input" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="main">{tx('Général', 'General')}</option>
              <option value="cabins">{tx('Cabines', 'Cabins')}</option>
              <option value="machinery">{tx('Machines', 'Machinery')}</option>
              <option value="technical">{tx('Fonds et coque', 'Tanks and hull')}</option>
            </select>
          </label>
          <p className="hint" style={{ marginTop: 8 }}>{tx('Le schéma sert de fond quand aucun plan n’est importé, et place le pont dans la vue 3D.', 'The layout is the background when no plan is imported, and places the deck in the 3D view.')}</p>
        </form>)}
    </Sheet>);
}

export function RentalSheet({ onClose }) {
  const { ship, a, lang, tx, actions } = useApp();
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [since, setSince] = useState(toLocalInput(a.now, true));
  const [err, setErr] = useState(null);
  return (
    <Sheet title={tx('Matériel en location', 'Hired equipment')} closeLabel={tx('Fermer', 'Close')} width={440} onClose={onClose}
      footer={(close) => <><button type="button" className="btn" onClick={close}>{tx('Annuler', 'Cancel')}</button><button type="submit" form="rental-form" className="btn primary">{tx('Ajouter', 'Add')}</button></>}>
      {(close) => (
        <form id="rental-form" onSubmit={(e) => {
          e.preventDefault();
          const r = Number(String(rate).replace(',', '.'));
          if (!name.trim()) { setErr(tx('Indiquez le matériel.', 'Name the equipment.')); return; }
          if (!(r > 0)) { setErr(tx('Indiquez le prix par jour.', 'Enter the daily rate.')); return; }
          actions.rentalAdd({ name: name.trim().slice(0, 60), dayRate: Math.round(r), zoneId: zoneId || null, since: fromLocalInput(since + 'T07:00') || a.now });
          close();
        }}>
          <label className="field"><span className="lbl">{tx('Matériel', 'Equipment')}</span><input className="input" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder={tx('Nacelle 16 m', 'Boom lift 16 m')} data-autofocus /></label>
          <div className="field-row" style={{ marginTop: 14 }}>
            <label className="field"><span className="lbl">{tx('Prix par jour', 'Daily rate')} ({ship.costs.currency})</span><input className="input" type="number" inputMode="decimal" min="1" value={rate} onChange={(e) => { setRate(e.target.value); setErr(null); }} /></label>
            <label className="field"><span className="lbl">{tx('Sur site depuis', 'On site since')}</span><input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} /></label>
          </div>
          <label className="field" style={{ marginTop: 14 }}><span className="lbl">{tx('Pour les travaux', 'For the work')}</span>
            <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">{tx('Aucun en particulier', 'None in particular')}</option>
              {a.rows.map(({ zone, deck }) => <option key={zone.id} value={zone.id}>{(zone.work || pick(lang, HAZARDS[zone.type].label.fr, HAZARDS[zone.type].label.en)) + ' (' + deck.name + ')'}</option>)}
            </select>
          </label>
          <p className="hint" style={{ marginTop: 8 }}>{tx('Quand ces travaux sont terminés, le matériel est signalé comme inactif à restituer.', 'When that work is finished, the equipment is flagged as idle, ready to return.')}</p>
          {err && <p className="err-text" role="alert" style={{ marginTop: 10 }}>{err}</p>}
        </form>)}
    </Sheet>);
}
