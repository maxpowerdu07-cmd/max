import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, FileWarning, Flame, HardHat, Package, Pencil, Plus, TrendingUp } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { ISSUES, zoneTitle } from '../lib/model.js';
import { fmtDate, fmtHours, fmtMoney, fmtNum, fmtSpan, pick } from '../lib/i18n.js';
import { Chip, Section } from '../components/ui.jsx';

const HOUR = 3600000;

// A number that commits on blur, so a field can be cleared while typing.
function NumField({ label, value, unit, canEdit, onCommit, fmt, min = 0, step = 1 }) {
  const [v, setV] = useState(String(value));
  const commit = () => { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= min) onCommit(n); else setV(String(value)); };
  return (
    <label className="line-edit">
      <span className="k">{label}</span>
      {canEdit
        ? <input className="v" type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={label + (unit ? ' (' + unit + ')' : '')} step={step} />
        : <span className="v">{fmt(value)}</span>}
    </label>);
}

export default function Costs() {
  const { ship, a, lang, tx, canEdit, actions, openZone, openSheet } = useApp();
  const C = ship.costs, cur = C.currency, m = (v) => fmtMoney(v, lang, cur);
  const S = a.schedule, T = a.timesheet, cost = a.cost;
  const per = (unit) => (unit === 'h' ? tx(' par heure', ' an hour') : tx(' par jour', ' a day'));
  const short = (unit) => (unit === 'h' ? '/h' : tx('/j', '/day'));
  const maxMs = Math.max(1, ...T.companies.map((c) => c.ms), T.fwMs);
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100) + ' %';
  const timeShare = Math.min(1, S.elapsedDays / S.totalDays);
  const behind = S.completion + 0.05 < timeShare;
  const idleDaily = a.rentals.filter((r) => r.idle).reduce((s, r) => s + r.rental.dayRate, 0);

  return (
    <>
      <div className="page-head">
        <div><h1 className="t-large">{tx('Coûts', 'Costs')}</h1><p className="page-sub">{tx('Ce que coûtent aujourd’hui les arrêts, la cale et le matériel, et comment le réduire.', 'What stoppages, dock time and equipment cost today, and how to cut it.')}</p></div>
      </div>

      <section className="card money-hero" aria-labelledby="money-l">
        <p className="money-lbl" id="money-l">{tx('Main-d’œuvre exposée à un arrêt', 'Labour at risk of a stoppage')}</p>
        {cost.standbyRate > 0
          ? <p className="money-fig">{m(cost.standbyRate)}<small>{tx('/h', '/h')}</small></p>
          : <p className="money-fig calm">{tx('Aucun travail exposé', 'Nothing at risk')}</p>}
        <p className="money-text">
          {cost.standbyRate > 0
            ? <>{cost.standbyPeople}{tx(' personnes travaillent sur ', ' people are working on ')}{cost.blockers.length}{tx(' travaux non conformes. Régularisez-les avant un contrôle : un poste d’arrêt coûterait ', ' non-compliant works. Sort them out before an inspection: one shift of stoppage would cost ')}<b>{m(cost.perShift)}</b>.</>
            : tx('Tous les travaux en cours sont conformes : un contrôle ne les arrêterait pas.', 'All works in progress are compliant: an inspection wouldn’t stop them.')}
        </p>
      </section>

      <Section title={tx('À faire pour économiser', 'Ways to save')} count={a.savings.length} note={tx('Montant économisé par heure (/h) ou par jour (/j), calculé avec les hypothèses en bas de page.', 'Saving per hour (/h) or per day (/day), using the assumptions at the bottom of the page.')}>
        <div className="group ic">
          {a.savings.length === 0 && <p className="row-empty">{tx('Rien à signaler : aucun travail exposé, aucun fire watch ni matériel inutile.', 'Nothing to flag: no work at risk, no idle fire watch or equipment.')}</p>}
          {a.savings.map((s) => {
            const amount = <span className="row-val">{m(s.amount)}<small>{short(s.unit)}</small></span>;
            if (s.kind === 'blocker') {
              const sev = s.issues.reduce((x, i) => Math.max(x, i.sev), 0);
              return (
                <button key={s.id} type="button" className="row" onClick={() => openZone(s.zone.id)}>
                  <span className={'tile-ic ' + (sev >= 2 ? 'tone-danger' : 'tone-warn')} aria-hidden="true">{sev >= 2 ? <AlertTriangle size={16} /> : <FileWarning size={16} />}</span>
                  <span className="row-main"><span className="row-title">{tx('Régulariser : ', 'Sort out: ')}{zoneTitle(s.zone, lang)}</span><span className="row-sub">{s.issues.map((i) => pick(lang, ISSUES[i.code].sfr, ISSUES[i.code].sen)).join(', ')}, {s.people} {tx('personnes', 'people')}</span></span>
                  <span className="row-trail">{amount}</span>
                </button>);
            }
            if (s.kind === 'expiry') {
              return (
                <button key={s.id} type="button" className="row" onClick={() => openZone(s.zone.id)}>
                  <span className="tile-ic tone-warn" aria-hidden="true"><Clock size={16} /></span>
                  <span className="row-main"><span className="row-title">{s.deadline.kind === 'gas' ? tx('Refaire le test gaz : ', 'Redo the gas test: ') : tx('Renouveler le permis : ', 'Renew the permit: ')}{zoneTitle(s.zone, lang)}</span><span className="row-sub">{tx('Expire dans ', 'Expires in ')}{fmtSpan(s.deadline.ts - a.now, lang)}, {s.people} {tx('personnes', 'people')}</span></span>
                  <span className="row-trail">{amount}</span>
                </button>);
            }
            if (s.kind === 'fw') {
              return (
                <div key={s.id} className="row">
                  <span className="tile-ic tone-info" aria-hidden="true"><Flame size={16} /></span>
                  <span className="row-main"><span className="row-title">{tx('Libérer ', 'Release ')}{s.fw.name}</span><span className="row-sub">{s.zone ? tx('Veille terminée sur ', 'Watch complete on ') + zoneTitle(s.zone, lang) + (s.overMs > 60000 ? tx(' depuis ', ' for ') + fmtSpan(s.overMs, lang) : '') : tx('Sa zone a été supprimée', 'Their zone was deleted')}</span></span>
                  <span className="row-trail">{amount}{canEdit && <button type="button" className="btn sm" onClick={() => actions.fwRelease(s.fw.id)}>{tx('Libérer', 'Release')}</button>}</span>
                </div>);
            }
            return (
              <div key={s.id} className="row">
                <span className="tile-ic tone-warn" aria-hidden="true"><Package size={16} /></span>
                <span className="row-main"><span className="row-title">{tx('Restituer : ', 'Return: ')}{s.rental.name}</span><span className="row-sub">{s.why === 'gone' ? tx('Ses travaux ont été supprimés', 'Its work was deleted') : tx('Travaux terminés : ', 'Work finished: ') + zoneTitle(s.zone, lang) + (s.idleMs > HOUR ? tx(', inactif depuis ', ', idle for ') + fmtSpan(s.idleMs, lang) : '')}</span></span>
                <span className="row-trail">{amount}{canEdit && <button type="button" className="btn sm" onClick={() => actions.rentalReturn(s.rental.id)}>{tx('Restituer', 'Return')}</button>}</span>
              </div>);
          })}
        </div>
      </Section>

      <div className="cols even">
        <div className="col">
          <Section title={tx('Jours de cale', 'Dock days')}>
            <div className="card dock">
              <div className="dock-top">
                <p className="dock-day">{S.started ? <>{tx('Jour ', 'Day ')}{S.dayNo} <small>{tx('sur ', 'of ')}{S.calDays}</small></> : <>{tx('Entrée le ', 'Docking ')}{fmtDate(S.dockIn, lang, { day: 'numeric', month: 'short' })}</>}</p>
                <p className="t-foot dim">{tx('Sortie prévue le ', 'Undocking ')}{fmtDate(S.undock, lang, { day: 'numeric', month: 'short' })}</p>
              </div>
              <div className="meters">
                <div className="meter-row">
                  <div className="hd"><span>{tx('Temps de cale écoulé', 'Dock time used')}</span><b>{pct(timeShare)}</b></div>
                  <div className="meter" role="img" aria-label={tx('Temps de cale écoulé : ', 'Dock time used: ') + pct(timeShare)}><i style={{ width: pct(timeShare).replace(' ', '') }} /></div>
                </div>
                <div className="meter-row">
                  <div className="hd"><span>{tx('Travaux réalisés', 'Work completed')}</span><b>{pct(S.completion)}</b></div>
                  <div className={'meter' + (behind ? ' warn' : '')} role="img" aria-label={tx('Travaux réalisés : ', 'Work completed: ') + pct(S.completion)}><i style={{ width: pct(S.completion).replace(' ', '') }} /></div>
                </div>
              </div>
              {S.delayDays > 0 ? (
                <div className="dock-note warn"><TrendingUp size={18} aria-hidden="true" /><div>
                  {tx('Au rythme actuel, sortie le ', 'At the current pace, undocking on ')}{fmtDate(S.projectedUndock, lang, { day: 'numeric', month: 'short' })}{tx(' : ', ': ')}{fmtNum(S.delayDays, lang, 1)}{S.delayDays > 1 ? tx(' jours de retard, soit ', ' days late, or ') : tx(' jour de retard, soit ', ' day late, or ')}<b>{m(S.delayCost)}</b>{tx(' de cale en plus.', ' of extra dock time.')}
                  <small>{tx('Projection : jours écoulés divisés par la part des travaux réalisée. Terminer un travail la rapproche.', 'Projection: days used divided by the share of work done. Finishing a work brings it closer.')}</small>
                </div></div>
              ) : (
                <div className="dock-note ok"><CheckCircle2 size={18} aria-hidden="true" /><div>{tx('Au rythme actuel, la sortie prévue est tenue.', 'At the current pace, the planned undocking holds.')}<small>{tx('Une journée de cale coûte ', 'A day in dock costs ')}{m(C.dockDay)}.</small></div></div>
              )}
              {canEdit && <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => openSheet({ kind: 'vessel' })}><Pencil size={14} aria-hidden="true" />{tx('Modifier les dates', 'Edit dates')}</button>}
            </div>
          </Section>

          <Section title={tx('Matériel en location', 'Hired equipment')} count={a.rentals.length}
            action={canEdit ? <button type="button" className="btn sm" onClick={() => openSheet({ kind: 'rental' })}><Plus size={15} aria-hidden="true" />{tx('Ajouter', 'Add')}</button> : null}
            note={a.rentals.length ? m(cost.rentalDaily) + per('d') + (idleDaily ? tx(', dont ', ', of which ') + m(idleDaily) + tx(' pour du matériel inactif.', ' for idle equipment.') : '.') : null}>
            <div className="group ic">
              {a.rentals.length === 0 && <p className="row-empty">{tx('Aucun matériel en location suivi.', 'No hired equipment tracked.')}</p>}
              {a.rentals.map((r) => (
                <div key={r.rental.id} className="row">
                  <span className={'tile-ic' + (r.idle ? ' tone-warn' : '')} aria-hidden="true"><Package size={16} /></span>
                  <span className="row-main">
                    <span className="row-title">{r.rental.name}</span>
                    <span className="row-sub">{r.zone ? zoneTitle(r.zone, lang) : tx('Sans travaux associés', 'No linked work')}, {r.days} {tx(r.days > 1 ? 'jours' : 'jour', r.days > 1 ? 'days' : 'day')} × {m(r.rental.dayRate)}</span>
                    {r.idle && <span style={{ marginTop: 4 }}><Chip tone="warn">{tx('Inactif', 'Idle')}</Chip></span>}
                  </span>
                  <span className="row-trail"><span className="row-val">{m(r.cost)}</span>{canEdit && <button type="button" className="btn sm" onClick={() => actions.rentalReturn(r.rental.id)}>{tx('Restituer', 'Return')}</button>}</span>
                </div>))}
            </div>
          </Section>
        </div>

        <div className="col">
          <Section title={tx('Heures pointées aujourd’hui', 'Hours booked today')}
            action={<button type="button" className="btn sm" onClick={actions.exportTimesheet}><Download size={15} aria-hidden="true" />{tx('Exporter', 'Export')}</button>}
            note={tx('Calculées à partir des entrées et sorties de zone et des postes de fire watch. L’export CSV s’ouvre dans un tableur pour la facturation.', 'Built from zone check-ins and fire watch posts. The CSV export opens in a spreadsheet for invoicing.')}>
            <div className="group">
              <div className="bars">
                {T.companies.length === 0 && T.fwMs === 0 && <p className="hint">{tx('Aucune heure pointée aujourd’hui.', 'No hours booked today.')}</p>}
                {T.companies.map((c) => (
                  <div key={c.company || '_'} className="bar-row">
                    <span className="tile-ic" aria-hidden="true"><HardHat size={16} /></span>
                    <span className="row-main"><span className="row-title">{c.company || tx('Sans entreprise', 'No company')}</span><span className="row-sub">{c.people} {tx(c.people > 1 ? 'personnes' : 'personne', c.people > 1 ? 'people' : 'person')}, {m(c.cost)}</span></span>
                    <span className="amt">{fmtHours(c.ms, lang)}</span>
                    <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ display: 'block', width: (c.ms / maxMs * 100) + '%' }} /></span>
                  </div>))}
                {T.fwMs > 0 && (
                  <div className="bar-row">
                    <span className="tile-ic" aria-hidden="true"><Flame size={16} /></span>
                    <span className="row-main"><span className="row-title">Fire watch</span><span className="row-sub">{T.fwPeople} {tx(T.fwPeople > 1 ? 'personnes' : 'personne', T.fwPeople > 1 ? 'people' : 'person')}, {m(T.fwCost)}</span></span>
                    <span className="amt">{fmtHours(T.fwMs, lang)}</span>
                    <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ display: 'block', width: (T.fwMs / maxMs * 100) + '%' }} /></span>
                  </div>)}
              </div>
              <div className="row" style={{ borderTop: '.5px solid var(--sep)' }}>
                <span className="row-main"><span className="row-title" style={{ fontWeight: 600 }}>{tx('Total', 'Total')}</span></span>
                <span className="row-trail"><span className="row-val">{fmtHours(T.totalMs, lang)}</span><span className="row-val">{m(T.totalCost)}</span></span>
              </div>
            </div>
          </Section>

          <Section title={tx('Hypothèses de calcul', 'Assumptions')} note={canEdit ? tx('Ajustez-les aux tarifs du chantier : tous les montants se mettent à jour.', 'Match them to the yard’s rates: every amount updates.') : tx('Seule la coordination peut les modifier.', 'Only coordination can change them.')}>
            <div className="group">
              <NumField key={'l' + C.labour} label={tx('Main-d’œuvre, par personne et par heure', 'Labour, per person per hour')} unit={cur} value={C.labour} canEdit={canEdit} fmt={m} onCommit={(n) => actions.setCosts({ labour: n })} />
              <NumField key={'f' + C.fireWatch} label={tx('Fire watch, par heure', 'Fire watch, per hour')} unit={cur} value={C.fireWatch} canEdit={canEdit} fmt={m} onCommit={(n) => actions.setCosts({ fireWatch: n })} />
              <NumField key={'d' + C.dockDay} label={tx('Une journée de cale', 'One day in dock')} unit={cur} value={C.dockDay} canEdit={canEdit} fmt={m} onCommit={(n) => actions.setCosts({ dockDay: n })} />
              <NumField key={'s' + C.shift} label={tx('Durée d’un poste (heures)', 'Shift length (hours)')} unit="h" value={C.shift} canEdit={canEdit} min={1} fmt={(v) => v + ' h'} onCommit={(n) => actions.setCosts({ shift: Math.max(1, Math.min(24, n)) })} />
              <NumField key={'c' + C.cooldown} label={tx('Veille après travaux à chaud (minutes)', 'Watch after hot work (minutes)')} unit="min" value={C.cooldown} canEdit={canEdit} fmt={(v) => v + ' min'} onCommit={(n) => actions.setCosts({ cooldown: Math.max(0, Math.min(240, Math.round(n))) })} />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
