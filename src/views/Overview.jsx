import React from 'react';
import { AlertTriangle, ChevronRight, ClipboardList, Coins, FileText, FileWarning, Flame, Map as MapIcon, Ship, Siren, Wind } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { HAZARDS, HAZARD_KEYS, zoneTitle } from '../lib/model.js';
import { fmtDate, fmtMoney, fmtNum, fmtTime, pick } from '../lib/i18n.js';
import ShipProfile from '../components/ShipProfile.jsx';
import { Section, useIsCompact } from '../components/ui.jsx';
import { alertLabel, alertSubject, capFirst, inSpan } from './text.js';

const HOUR = 3600000;
const ISSUE_ICON = { 'occupied-risk': Siren, conflict: AlertTriangle, 'gas-overdue': Wind, 'gas-none': Wind, firewatch: Flame, 'permit-expired': FileWarning, permit: FileWarning };
const DEADLINE_ICON = { gas: Wind, permit: FileText, fw: Flame, undock: Ship };

export default function Overview() {
  const { ship, a, lang, tx, go, openZone, openSheet } = useApp();
  const compact = useIsCompact();
  const S = a.schedule, cur = ship.costs.currency;
  const n = a.alerts.length;
  const today = capFirst(fmtDate(a.now, lang, { weekday: 'long', day: 'numeric', month: 'long' }));
  const sub = today + ', ' + (S.started ? tx('jour ', 'day ') + S.dayNo + tx(' sur ', ' of ') + S.calDays + tx(' en cale', ' in dock') : tx('entrée en cale le ', 'docking on ') + fmtDate(S.dockIn, lang));

  const states = { blocked: 0, attention: 0, prepare: 0, ready: 0 };
  a.activeRows.forEach(({ zone }) => { states[a.info.get(zone.id).state] += 1; });
  const order = ['blocked', 'attention', 'prepare', 'ready'];
  const segs = [];
  order.forEach((st) => { for (let i = 0; i < states[st]; i++) segs.push(st); });
  const words = { blocked: [tx('bloqué', 'blocked'), tx('bloqués', 'blocked')], attention: [tx('à régulariser', 'to sort out'), tx('à régulariser', 'to sort out')], prepare: [tx('à préparer', 'to prepare'), tx('à préparer', 'to prepare')], ready: [tx('prêt', 'ready'), tx('prêts', 'ready')] };
  const readyText = order.filter((st) => states[st]).map((st) => states[st] + ' ' + words[st][states[st] > 1 ? 1 : 0]).join(', ');

  const fwOn = a.fw.filter((x) => x.state === 'active' || x.state === 'cooldown').length;
  const logs = (ship.log || []).slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div><h1 className="t-large">{tx('Aperçu', 'Summary')}</h1><p className="page-sub">{sub}</p></div>
      </div>

      <section className="card hero" aria-labelledby="hero-title">
        <div className="hero-art">
          <ShipProfile ship={ship} a={a} lang={lang} compact={compact} onOpen={openZone} />
          <div className="legend" style={{ marginTop: 14 }}>
            {HAZARD_KEYS.map((k) => <span key={k} className={'hz-' + k}><span className="swatch" aria-hidden="true" />{pick(lang, HAZARDS[k].label.fr, HAZARDS[k].label.en)}</span>)}
            <span><span className="dot" aria-hidden="true" />{tx('Point à traiter', 'Needs attention')}</span>
          </div>
        </div>
        <div className="hero-body">
          <div>
            <h2 id="hero-title" className="hero-title">{n ? n + ' ' + tx(n > 1 ? 'points à traiter' : 'point à traiter', n > 1 ? 'items need attention' : 'item needs attention') : tx('Chantier conforme', 'Site compliant')}</h2>
            <p className="hero-sub">{n ? alertLabel(a.alerts[0], lang) + (lang === 'bi' ? ' : ' : ': ') + alertSubject(a.alerts[0], lang) : tx('Espaces confinés testés, travaux à chaud couverts, aucun conflit.', 'Confined spaces tested, hot work covered, no conflicts.')}</p>
            {segs.length > 0 && (
              <div className="ready">
                <div className="ready-bar" role="img" aria-label={readyText}>{segs.map((st, i) => <span key={i} className={'ready-seg ' + st} />)}</div>
                <p className="ready-text">{tx('Travaux actifs', 'Active works')}{lang === 'bi' ? ' : ' : ': '}{readyText}</p>
              </div>)}
          </div>
          <div className="hero-actions">
            <button type="button" className="btn primary" onClick={() => openSheet({ kind: 'report' })}><ClipboardList size={17} aria-hidden="true" />{tx('Rapport journalier', 'Daily report')}</button>
            <button type="button" className="btn" onClick={() => go('plan')}><MapIcon size={17} aria-hidden="true" />{tx('Ouvrir le plan', 'Open the plan')}</button>
          </div>
        </div>
        {a.cost.standbyRate > 0 && (
          <button type="button" className="row hero-cost" onClick={() => go('costs')}>
            <span className="tile-ic tone-warn" aria-hidden="true"><Coins size={16} /></span>
            <span className="row-main">
              <span className="row-title">{fmtMoney(a.cost.standbyRate, lang, cur)}{tx(' par heure exposés à un arrêt', ' an hour at risk of a stoppage')}</span>
              <span className="row-sub">{a.cost.standbyPeople} {tx('personnes sur ', 'people on ')}{a.cost.blockers.length} {tx('travaux non conformes', 'non-compliant works')}</span>
            </span>
            <ChevronRight className="row-chev" size={18} aria-hidden="true" />
          </button>)}
      </section>

      <div className="tiles" style={{ marginTop: 14 }}>
        <button type="button" className="tile" onClick={() => go('works')}><span className="tile-lbl">{tx('Travaux en cours', 'Works in progress')}</span><span className="tile-val">{a.counts.progress}</span></button>
        <button type="button" className="tile" onClick={() => go('crew')}><span className="tile-lbl">{tx('Personnes en zone', 'People in zones')}</span><span className="tile-val">{a.occupants.length}</span></button>
        <button type="button" className="tile" onClick={() => go('crew')}><span className="tile-lbl">{tx('Fire watch en poste', 'Fire watch posted')}</span><span className="tile-val">{fwOn}<small> / {ship.crew.fireWatch.length}</small></span></button>
        <button type="button" className="tile" onClick={() => go('costs')}><span className="tile-lbl">{tx('Heures pointées aujourd’hui', 'Hours booked today')}</span><span className="tile-val">{fmtNum(a.timesheet.totalMs / HOUR, lang, 1)}<small>{lang === 'bg' ? ' ч' : ' h'}</small></span></button>
      </div>

      <div className="cols">
        <div className="col">
          <Section title={tx('À traiter', 'Needs attention')} count={n}>
            <div className="group ic">
              {n === 0 && <p className="row-empty">{tx('Tous les espaces confinés sont à jour, les travaux à chaud sont couverts et aucun conflit n’est détecté.', 'All confined spaces are up to date, hot work is covered and no conflict is detected.')}</p>}
              {a.alerts.map((al) => { const Ico = ISSUE_ICON[al.code] || AlertTriangle; return (
                <button key={al.id} type="button" className={'row' + (al.sev >= 3 ? ' crit' : '')} onClick={() => openZone(al.zone.id)}>
                  <span className={'tile-ic ' + (al.sev >= 2 ? 'tone-danger' : 'tone-warn')} aria-hidden="true"><Ico size={16} strokeWidth={2.2} /></span>
                  <span className="row-main"><span className="row-title">{alertLabel(al, lang)}</span><span className="row-sub">{alertSubject(al, lang)}, {al.deck.name}</span></span>
                  <ChevronRight className="row-chev" size={18} aria-hidden="true" />
                </button>); })}
            </div>
          </Section>
        </div>
        <div className="col">
          <Section title={tx('Échéances', 'Coming up')}>
            <div className="group ic">
              {a.deadlines.length === 0 && <p className="row-empty">{tx('Aucune échéance.', 'Nothing due.')}</p>}
              {a.deadlines.slice(0, 6).map((d) => {
                const Ico = DEADLINE_ICON[d.kind];
                const title = d.kind === 'gas' ? tx('Test gaz', 'Gas test') : d.kind === 'permit' ? tx('Fin de permis', 'Permit ends') : d.kind === 'fw' ? tx('Fin de veille incendie', 'Post-work watch ends') : tx('Sortie de cale prévue', 'Planned undocking');
                const what = d.kind === 'undock' ? ship.name : d.kind === 'fw' ? d.fw.name + ', ' + zoneTitle(d.zone, lang) : zoneTitle(d.zone, lang);
                const soon = d.ts - a.now < 2 * HOUR && d.kind !== 'undock';
                const when = d.ts - a.now < 20 * HOUR ? fmtTime(d.ts, lang) : fmtDate(d.ts, lang, { day: 'numeric', month: 'short' });
                const inner = (<>
                  <span className={'tile-ic' + (soon ? ' tone-warn' : '')} aria-hidden="true"><Ico size={16} strokeWidth={2.2} /></span>
                  <span className="row-main"><span className="row-title">{title}</span><span className="row-sub">{what}</span></span>
                  <span className="row-trail"><span className="row-val stack">{inSpan(d.ts - a.now, lang)}<small>{when}</small></span>{d.zone && <ChevronRight className="row-chev" size={18} aria-hidden="true" />}</span>
                </>);
                return d.zone
                  ? <button key={d.id} type="button" className="row" onClick={() => openZone(d.zone.id)}>{inner}</button>
                  : <button key={d.id} type="button" className="row" onClick={() => go('costs')}>{inner}</button>;
              })}
            </div>
          </Section>
          <Section title={tx('Journal du chantier', 'Site log')}>
            <div className="group">
              {logs.length === 0 && <p className="row-empty">{tx('Les permis, contrôles et mouvements de fire watch s’inscrivent ici avec leur heure.', 'Permits, checks and fire watch moves are recorded here with their time.')}</p>}
              {logs.map((l) => (
                <div key={l.id} className="row">
                  <span className="row-time">{l.ts >= a.now - 20 * HOUR ? fmtTime(l.ts, lang) : fmtDate(l.ts, lang, { day: 'numeric', month: 'short' })}</span>
                  <span className="row-main"><span className="row-title t-sub">{pick(lang, l.fr, l.en)}</span></span>
                </div>))}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
