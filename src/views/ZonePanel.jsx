import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, FileText, Flame, LogIn, Trash2, Upload, UserRound, Wind, X } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { HAZARDS, STATUS, STATUS_KEYS, mergedChecks, zoneTitle } from '../lib/model.js';
import { fmtClock, fmtSince, fmtSpan, fmtTime, fromLocalInput, pick, toLocalInput } from '../lib/i18n.js';
import { Chip, HazardName, HazardTile, Segmented, StateChip, StatusChip, Stepper } from '../components/ui.jsx';
import { ago, issueText, left } from './text.js';

// Everything about one work zone: status, readiness, access, permit, gas tests, fire watch, PPE.
export default function ZonePanel({ zone, deck, inSheet, onClose }) {
  const { a, lang, tx, canEdit, actions, ship, pending, go } = useApp();
  const zi = a.info.get(zone.id);
  const h = HAZARDS[zone.type];
  const [name, setName] = useState('');
  const [refused, setRefused] = useState(null);
  useEffect(() => { setName(''); setRefused(null); }, [zone.id]);
  if (!zi) return null;
  const bi = (fr, en) => (lang === 'bi' ? fr + ' / ' + en : pick(lang, fr, en));
  const live = zone.status !== 'done';

  const gate = zone.type === 'confined' && (!zi.atmo || zi.atmo.state !== 'ok')
    ? (zi.atmo && zi.atmo.state === 'overdue' ? tx('test atmosphérique expiré', 'atmospheric test expired') : tx('aucun test atmosphérique valide', 'no valid atmospheric test'))
    : zone.type === 'hot' && !zi.fwHere.length ? tx('aucun fire watch posté', 'no fire watch posted') : null;

  const permit = zi.permit;
  const permitChip = permit.state === 'ok' ? <Chip tone="ok">{tx('Valide', 'Valid')}</Chip> : permit.state === 'expired' ? <Chip tone="danger">{tx('Expiré', 'Expired')}</Chip> : <Chip tone={zone.status === 'progress' ? 'warn' : ''}>{tx('Manquant', 'Missing')}</Chip>;
  const permitLine = permit.state === 'expired' ? tx('Expiré ', 'Expired ') + ago(a.now - permit.validUntil, lang)
    : permit.validUntil ? tx('Valable jusqu’à ', 'Valid until ') + fmtTime(permit.validUntil, lang) + ' (' + left(permit.remaining, lang) + ')' : tx('Sans échéance', 'No end time');

  const checks = zone.type === 'confined' ? mergedChecks(zone, pending) : [];
  const atmo = zi.atmo;
  const availableFw = ship.crew.fireWatch.filter((f) => f.status !== 'posted');

  function submit(e) {
    e.preventDefault();
    const r = actions.checkIn(zone.id, name);
    if (r.ok) { setName(''); setRefused(null); } else if (!r.empty) setRefused(r);
  }

  return (
    <div className="insp">
      {!inSheet && (
        <div className="insp-head">
          <HazardTile type={zone.type} large />
          <div className="tx"><h2>{zoneTitle(zone, lang)}</h2><p>{[zone.company, deck.name].filter(Boolean).join(', ')}</p></div>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label={tx('Fermer la fiche', 'Close the zone')}><X size={16} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>)}
      <div className="insp-body">
        <div className="insp-sec">
          {canEdit
            ? <Segmented block value={zone.status} onChange={(v) => actions.setZoneStatus(zone.id, v)} label={tx('Statut', 'Status')} options={STATUS_KEYS.map((k) => ({ value: k, label: pick(lang, STATUS[k].fr, STATUS[k].en) }))} />
            : <div className="chips"><StatusChip status={zone.status} lang={lang} />{zi.state === 'ready' && <StateChip zi={zi} lang={lang} />}</div>}
          {canEdit && zi.state === 'ready' && <div className="chips" style={{ marginTop: 10 }}><StateChip zi={zi} lang={lang} /></div>}
          {(zi.issues.length > 0 || zi.prep.length > 0) && (
            <div style={{ marginTop: 10 }}>
              {zi.issues.map((is, i) => (
                <div key={'i' + i} className="insp-line"><span className={'tile-ic ' + (is.sev >= 2 ? 'tone-danger' : 'tone-warn')} aria-hidden="true"><AlertTriangle size={15} /></span><span className="tx">{issueText(is, lang)}</span></div>))}
              {zi.prep.map((is, i) => (
                <div key={'p' + i} className="insp-line"><span className="tile-ic" aria-hidden="true"><Check size={15} /></span><span className="tx">{tx('Avant de démarrer : ', 'Before starting: ')}{issueText(is, lang).toLowerCase()}</span></div>))}
            </div>)}
          {zone.type === 'hot' && zone.status === 'done' && (() => {
            const x = a.fw.find((f) => f.zone && f.zone.id === zone.id && (f.state === 'cooldown' || f.state === 'releasable'));
            return x ? <p className="hint" style={{ marginTop: 10 }}>{x.state === 'cooldown' ? tx('Veille incendie après travaux : ', 'Post-work fire watch: ') + left(x.remaining, lang) : tx('Veille terminée : le fire watch peut être libéré.', 'Watch complete: the fire watch can be released.')}</p> : null;
          })()}
        </div>

        <div className="insp-sec">
          <h3>{tx('Travaux', 'Work')}</h3>
          {canEdit ? (<>
            <label className="field"><span className="lbl">{tx('Description', 'Description')}</span><input className="input" value={zone.work} onChange={(e) => actions.updateZone(zone.id, { work: e.target.value })} placeholder={tx('Sablage de la carène', 'Hull blasting')} /></label>
            <label className="field"><span className="lbl">{tx('Entreprise', 'Company')}</span><input className="input" value={zone.company} onChange={(e) => actions.updateZone(zone.id, { company: e.target.value })} placeholder="Nordweld Marine" /></label>
            <div className="insp-line" style={{ marginTop: 10 }}>
              <span className="tx">{tx('Effectif prévu', 'Planned crew')}<small>{tx('Sert au coût d’un arrêt', 'Used for the stoppage cost')}</small></span>
              <Stepper value={zone.crew || 2} onChange={(v) => actions.updateZone(zone.id, { crew: v })} min={1} max={40} label={tx('Effectif prévu', 'Planned crew')} lessLabel={tx('Une personne de moins', 'One person fewer')} moreLabel={tx('Une personne de plus', 'One more person')} />
            </div>
          </>) : (
            <dl className="kv">
              <dt>{tx('Entreprise', 'Company')}</dt><dd>{zone.company || '—'}</dd>
              <dt>{tx('Effectif prévu', 'Planned crew')}</dt><dd>{zone.crew || 2}</dd>
              <dt>{tx('Danger', 'Hazard')}</dt><dd><HazardName type={zone.type} lang={lang} /></dd>
            </dl>)}
        </div>

        <div className="insp-sec">
          <h3>{tx('Accès', 'Access')}{zi.occupants.length > 0 && <Chip tone="info">{zi.occupants.length} {tx('en zone', 'inside')}</Chip>}</h3>
          {zi.occupants.length === 0 && <p className="hint">{tx('Personne dans la zone.', 'Nobody in the zone.')}</p>}
          {zi.occupants.map((e) => (
            <div key={e.id} className="insp-line">
              <UserRound size={17} aria-hidden="true" />
              <span className="tx">{e.name}<small>{tx('depuis ', 'for ')}{fmtSince(e.inAt, lang)}</small></span>
              <button type="button" className="btn sm" onClick={() => actions.checkOut(zone.id, e.id)}>{tx('Sortie', 'Check out')}</button>
            </div>))}
          {live && (<>
            {gate && <p className="err-text" style={{ marginTop: 10 }}>{tx('Entrée bloquée : ', 'Entry blocked: ')}{gate}.</p>}
            <form className="insp-form" onSubmit={submit}>
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); setRefused(null); }} placeholder={tx('Nom de l’intervenant', 'Worker’s name')} aria-label={tx('Nom de l’intervenant', 'Worker’s name')} autoComplete="off" />
              <button type="submit" className="btn" disabled={!name.trim()}><LogIn size={16} aria-hidden="true" />{tx('Entrée', 'Check in')}</button>
            </form>
            {refused && <p className="err-text" role="alert" style={{ marginTop: 8 }}>{tx('Entrée refusée et consignée au journal : ', 'Entry refused and logged: ')}{pick(lang, refused.fr, refused.en).toLowerCase()}.</p>}
          </>)}
        </div>

        <div className="insp-sec">
          <h3>{tx('Permis', 'Permit')}{permitChip}</h3>
          <p className="hint" style={{ marginBottom: 8 }}>{bi(h.permit.fr, h.permit.en)}</p>
          {zone.permit ? (<>
            <div className="insp-line">
              <FileText size={17} aria-hidden="true" />
              <span className="tx">{zone.permit.name}<small>{permitLine}</small></span>
              <button type="button" className="btn sm" onClick={() => actions.openDoc('permit', zone.permit)}><Eye size={15} aria-hidden="true" />{tx('Voir', 'View')}</button>
            </div>
            {canEdit && (<>
              <label className="field" style={{ marginTop: 10 }}><span className="lbl">{tx('Valable jusqu’à', 'Valid until')}</span>
                <input className="input" type="datetime-local" value={zone.permit.validUntil ? toLocalInput(zone.permit.validUntil) : ''} onChange={(e) => { const t = fromLocalInput(e.target.value); if (t) actions.setPermitUntil(zone.id, t); }} />
              </label>
              <div className="chips" style={{ marginTop: 10 }}>
                <button type="button" className="btn sm" onClick={() => actions.pickDoc(zone.id, 'permit')}><Upload size={15} aria-hidden="true" />{tx('Remplacer', 'Replace')}</button>
                <button type="button" className="btn sm danger" onClick={() => actions.removePermit(zone.id)}>{tx('Retirer', 'Remove')}</button>
              </div>
            </>)}
          </>) : canEdit
            ? <button type="button" className="btn block" onClick={() => actions.pickDoc(zone.id, 'permit')}><Upload size={16} aria-hidden="true" />{tx('Importer le permis (photo ou scan)', 'Upload the permit (photo or scan)')}</button>
            : <p className="hint">{tx('Aucun permis importé.', 'No permit uploaded.')}</p>}
        </div>

        {zone.type === 'confined' && (
          <div className="insp-sec">
            <h3>
              {tx('Tests atmosphériques', 'Gas tests')}
              {canEdit
                ? <select className="input sm" value={zone.interval || 12} onChange={(e) => actions.updateZone(zone.id, { interval: Number(e.target.value) })} aria-label={tx('Intervalle entre deux tests', 'Interval between tests')}>
                    {[4, 8, 12, 24].map((v) => <option key={v} value={v}>{tx('Toutes les ', 'Every ') + v + ' h'}</option>)}
                  </select>
                : <span className="dim">{tx('Toutes les ', 'Every ')}{zone.interval || 12} h</span>}
            </h3>
            <div className="insp-line">
              <span className={'tile-ic ' + (atmo.state === 'ok' ? 'tone-ok' : atmo.state === 'overdue' ? 'tone-danger' : 'tone-warn')} aria-hidden="true"><Wind size={15} /></span>
              <span className="tx">{atmo.state === 'none' ? tx('Aucun test enregistré', 'No test recorded') : atmo.state === 'overdue' ? tx('En retard de ', 'Overdue by ') + fmtSpan(-atmo.remaining, lang) : tx('Prochain test dans ', 'Next test in ') + fmtSpan(atmo.remaining, lang)}
                {atmo.state !== 'none' && <small>{tx('Dernier test à ', 'Last test at ')}{fmtTime(atmo.last, lang)}</small>}</span>
            </div>
            {canEdit && <button type="button" className="btn block" style={{ marginTop: 10 }} onClick={() => actions.pickDoc(zone.id, 'check')}><Upload size={16} aria-hidden="true" />{tx('Nouveau contrôle (photo de la fiche)', 'New check (photo of the sheet)')}</button>}
            {checks.slice(0, 5).map((c) => (
              <div key={c.id} className="insp-line">
                <span className="tx">{fmtClock(c.ts, lang)}<small>{c.by}{c.pending ? ' · ' + tx('en attente de réseau', 'waiting for network') : ''}</small></span>
                <button type="button" className="btn sm" onClick={() => actions.openDoc('atmo', c)}>{tx('Voir', 'View')}</button>
              </div>))}
            <p className="hint" style={{ marginTop: 8 }}>{tx('Hors-ligne, le contrôle reste sur l’appareil et part au retour du réseau.', 'Offline, the check stays on the device and is sent when the network returns.')}</p>
          </div>)}

        {zone.type === 'hot' && (
          <div className="insp-sec">
            <h3>Fire watch</h3>
            {zi.fwHere.map((f) => (
              <div key={f.id} className="insp-line">
                <Flame size={17} aria-hidden="true" />
                <span className="tx">{f.name}<small>{tx('en poste depuis ', 'on station for ')}{fmtSince(f.since, lang)}</small></span>
                {canEdit && <button type="button" className="btn sm" onClick={() => actions.fwRelease(f.id, zone.status === 'progress')}>{tx('Libérer', 'Release')}</button>}
              </div>))}
            {!zi.fwHere.length && <p className={zone.status === 'progress' ? 'err-text' : 'hint'}>{tx('Aucun fire watch posté sur cette zone.', 'No fire watch posted on this zone.')}</p>}
            {canEdit && live && (availableFw.length
              ? <div className="sel-line"><select className="input" value="" onChange={(e) => { if (e.target.value) actions.fwAssign(e.target.value, zone.id); }} aria-label={tx('Poster un fire watch', 'Post a fire watch')}>
                  <option value="" disabled>{tx('Poster un fire watch…', 'Post a fire watch…')}</option>
                  {availableFw.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select></div>
              : <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => go('crew')}>{tx('Aucun disponible : voir l’équipe', 'None available: see crew')}</button>)}
          </div>)}

        <div className="insp-sec">
          <h3>{tx('Équipements de protection', 'Protective equipment')}</h3>
          <ul className="ppe">{h.epi.map((e, i) => <li key={i}><Check size={14} strokeWidth={2.6} aria-hidden="true" /><span>{bi(e.fr, e.en)}</span></li>)}</ul>
        </div>

        {canEdit && (
          <div className="insp-sec">
            <h3>{tx('Taille sur le plan', 'Size on the plan')}</h3>
            <label className="size-row"><span>{tx('Largeur', 'Width')}</span><input type="range" min="4" max="80" value={Math.round(zone.w)} onChange={(e) => actions.updateZone(zone.id, { w: Math.max(4, Math.min(100 - zone.x, Number(e.target.value))) })} /><output>{Math.round(zone.w)} %</output></label>
            <label className="size-row"><span>{tx('Hauteur', 'Height')}</span><input type="range" min="4" max="80" value={Math.round(zone.h)} onChange={(e) => actions.updateZone(zone.id, { h: Math.max(4, Math.min(100 - zone.y, Number(e.target.value))) })} /><output>{Math.round(zone.h)} %</output></label>
            <p className="hint" style={{ marginTop: 8 }}>{tx('Vous pouvez aussi faire glisser la zone ou son coin blanc sur le plan.', 'You can also drag the zone, or its white corner, on the plan.')}</p>
            <button type="button" className="btn danger block" style={{ marginTop: 14 }} onClick={() => actions.removeZone(zone.id)}><Trash2 size={16} aria-hidden="true" />{tx('Supprimer la zone', 'Delete zone')}</button>
          </div>)}
      </div>
    </div>
  );
}
