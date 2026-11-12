import React, { useState } from 'react';
import { Flame, Timer, Trash2, UserRound } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { zoneTitle } from '../lib/model.js';
import { fmtMoney, fmtSince, fmtSpan } from '../lib/i18n.js';
import { Chip, Section } from '../components/ui.jsx';

function LineField({ label, value, canEdit, onCommit, placeholder }) {
  const [v, setV] = useState(value || '');
  return (
    <label className="line-edit">
      <span className="k">{label}</span>
      {canEdit
        ? <input className="v" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== (value || '')) onCommit(v.trim()); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        : <span className="v">{value || '—'}</span>}
    </label>);
}

export default function Crew() {
  const { ship, a, lang, tx, canEdit, actions, openZone } = useApp();
  const [fwName, setFwName] = useState('');
  const hotZones = a.rows.filter(({ zone }) => zone.type === 'hot' && zone.status !== 'done');
  const posted = a.fw.filter((x) => x.state === 'active' || x.state === 'cooldown').length;
  const rate = fmtMoney(ship.costs.fireWatch, lang, ship.costs.currency);

  return (
    <>
      <div className="page-head">
        <div><h1 className="t-large">{tx('Équipe', 'Crew')}</h1><p className="page-sub">{a.occupants.length} {tx(a.occupants.length > 1 ? 'personnes en zone' : 'personne en zone', a.occupants.length === 1 ? 'person in zones' : 'people in zones')}, {posted} {tx('fire watch en poste', 'fire watch posted')}</p></div>
      </div>
      <div className="cols even">
        <div className="col">
          <Section title="Fire watch" count={ship.crew.fireWatch.length} note={tx('Après des travaux à chaud, le fire watch reste ', 'After hot work, the fire watch stays ') + ship.costs.cooldown + tx(' min, puis l’app propose de le libérer (', ' min, then the app suggests releasing them (') + rate + tx(' par heure).', ' an hour).')}>
            <div className="group ic">
              {a.fw.length === 0 && <p className="row-empty">{tx('Aucun fire watch. Ajoutez les surveillants incendie du chantier.', 'No fire watch yet. Add the site’s fire sentries.')}</p>}
              {a.fw.map((x) => {
                const f = x.f;
                const tone = x.state === 'active' ? 'tone-ok' : x.state === 'cooldown' ? 'tone-warn' : x.state === 'releasable' || x.state === 'orphan' ? 'tone-info' : '';
                const sub = x.state === 'active' ? tx('En poste : ', 'On station: ') + zoneTitle(x.zone, lang) + tx(', depuis ', ', for ') + fmtSince(f.since, lang)
                  : x.state === 'cooldown' ? tx('Veille après travaux : ', 'Post-work watch: ') + zoneTitle(x.zone, lang)
                    : x.state === 'releasable' ? tx('Veille terminée sur ', 'Watch complete on ') + zoneTitle(x.zone, lang) + tx(', à libérer', ', ready to release')
                      : x.state === 'waiting' ? tx('Affecté à ', 'Assigned to ') + zoneTitle(x.zone, lang) + tx(', pas encore démarré', ', not started yet')
                        : x.state === 'orphan' ? tx('Sa zone a été supprimée', 'Their zone was deleted') : tx('Disponible', 'Available');
                return (
                  <div key={f.id} className="row">
                    <span className={'tile-ic ' + tone} aria-hidden="true"><Flame size={16} /></span>
                    {x.zone
                      ? <button type="button" className="row-main row-btn" onClick={() => openZone(x.zone.id)}><span className="row-title">{f.name}</span><span className="row-sub">{sub}</span></button>
                      : <span className="row-main"><span className="row-title">{f.name}</span><span className="row-sub">{sub}</span></span>}
                    <span className="row-trail">
                      {x.state === 'cooldown' && <Chip tone="warn" icon={<Timer size={12} strokeWidth={2.4} aria-hidden="true" />}>{fmtSpan(x.remaining, lang)}</Chip>}
                      {canEdit && x.state !== 'available' && <button type="button" className="btn sm" onClick={() => actions.fwRelease(f.id, x.state === 'active')}>{tx('Libérer', 'Release')}</button>}
                      {canEdit && x.state === 'available' && (hotZones.length
                        ? <select className="input sm" value="" onChange={(e) => { if (e.target.value) actions.fwAssign(f.id, e.target.value); }} aria-label={tx('Poster ', 'Post ') + f.name}>
                            <option value="" disabled>{tx('Poster…', 'Post…')}</option>
                            {hotZones.map(({ zone }) => <option key={zone.id} value={zone.id}>{zoneTitle(zone, lang)}</option>)}
                          </select>
                        : null)}
                      {canEdit && x.state === 'available' && <button type="button" className="icon-btn sm plain" onClick={() => actions.fwRemove(f.id)} aria-label={tx('Retirer ', 'Remove ') + f.name}><Trash2 size={15} aria-hidden="true" /></button>}
                    </span>
                  </div>);
              })}
              {canEdit && (
                <form className="add-line" onSubmit={(e) => { e.preventDefault(); actions.fwAdd(fwName); setFwName(''); }}>
                  <input className="input" value={fwName} onChange={(e) => setFwName(e.target.value)} placeholder={tx('Nom du fire watch', 'Fire watch name')} aria-label={tx('Nom du fire watch', 'Fire watch name')} />
                  <button type="submit" className="btn" disabled={!fwName.trim()}>{tx('Ajouter', 'Add')}</button>
                </form>)}
            </div>
          </Section>
          <Section title={tx('Coordination du chantier', 'Site coordination')}>
            <div className="group">
              <LineField key={'c' + ship.id} label={tx('Coordinateur', 'Coordinator')} value={ship.crew.coordinator} canEdit={canEdit} placeholder={tx('Nom', 'Name')} onCommit={(v) => actions.setCrew({ coordinator: v })} />
              <LineField key={'a' + ship.id} label={tx('Assistant', 'Assistant')} value={ship.crew.assistant} canEdit={canEdit} placeholder={tx('Nom (facultatif)', 'Name (optional)')} onCommit={(v) => actions.setCrew({ assistant: v })} />
            </div>
          </Section>
        </div>
        <div className="col">
          <Section title={tx('À bord maintenant', 'On board now')} count={a.occupants.length} note={tx('Les entrées se pointent depuis la fiche de chaque zone. Tout le monde peut pointer une sortie.', 'Entries are recorded from each zone’s sheet. Anyone can record an exit.')}>
            <div className="group ic">
              {a.occupants.length === 0 && <p className="row-empty">{tx('Personne en zone pour l’instant.', 'Nobody in a zone right now.')}</p>}
              {a.occupants.map(({ entry, zone, deck }) => {
                const zi = a.info.get(zone.id), risk = zi.issues.some((i) => i.code === 'occupied-risk');
                return (
                  <div key={entry.id} className={'row' + (risk ? ' crit' : '')}>
                    <span className={'tile-ic' + (risk ? ' tone-danger' : '')} aria-hidden="true"><UserRound size={16} /></span>
                    <button type="button" className="row-main row-btn" onClick={() => openZone(zone.id)}>
                      <span className="row-title">{entry.name}</span>
                      <span className="row-sub">{zoneTitle(zone, lang)}, {deck.name}, {tx('depuis ', 'for ')}{fmtSince(entry.inAt, lang)}{risk ? tx('. Test gaz plus valide : faire sortir.', '. Gas test no longer valid: get them out.') : ''}</span>
                    </button>
                    <button type="button" className="btn sm" onClick={() => actions.checkOut(zone.id, entry.id)}>{tx('Sortie', 'Check out')}</button>
                  </div>);
              })}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
