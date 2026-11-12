import React, { useRef, useState } from 'react';
import { AlertTriangle, ChevronsUpDown, ImagePlus, Layers, MousePointerClick, Pencil, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { HAZARDS, HAZARD_KEYS, ISSUES, companyColor, companyList, zoneConflicts, zoneTitle } from '../lib/model.js';
import { pick } from '../lib/i18n.js';
import DeckSchematic from '../components/DeckSchematic.jsx';
import Vessel3D from '../components/Vessel3D.jsx';
import ZonePanel from './ZonePanel.jsx';
import { HAZARD_ICON, HazardName, HazardTile, Menu, MenuItem, MenuLabel, MenuSep, Segmented, Sheet, useIsCompact } from '../components/ui.jsx';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function PlanView() {
  const { ship, a, deck, zoneId, setZoneId, setDeckId, focusZone, findZone, planMode, setPlanMode, lang, tx, canEdit, actions, openSheet } = useApp();
  const compact = useIsCompact();
  const [tool, setTool] = useState(null);
  const [colorMode, setColorMode] = useState('hazard');
  const [deckMenu, setDeckMenu] = useState(null);
  const [preview, setPreview] = useState(null);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);

  const companies = companyList(deck.zones);
  const conflicts = zoneConflicts(deck.zones);
  const conflictIds = new Set(conflicts.flatMap((c) => [c.z1.id, c.z2.id]));
  const selF = findZone(zoneId);

  function onStageClick(e) {
    if (moved.current) { moved.current = false; return; }
    if (!tool || !canEdit) { if (zoneId) setZoneId(null); return; }
    const r = stageRef.current.getBoundingClientRect();
    actions.addZone(deck.id, tool, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    setTool(null);
  }
  function startDrag(e, z, mode) {
    if (!canEdit) return;
    e.stopPropagation();
    if (mode === 'size') e.preventDefault();
    const r = stageRef.current.getBoundingClientRect();
    drag.current = { id: z.id, mode, x0: e.clientX, y0: e.clientY, z: { x: z.x, y: z.y, w: z.w, h: z.h }, rw: r.width, rh: r.height, active: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onDrag(e) {
    const d = drag.current; if (!d) return;
    if (!d.active && Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
    d.active = true;
    const dx = ((e.clientX - d.x0) / d.rw) * 100, dy = ((e.clientY - d.y0) / d.rh) * 100, z = d.z;
    setPreview(d.mode === 'move'
      ? { id: d.id, x: clamp(z.x + dx, 0, 100 - z.w), y: clamp(z.y + dy, 0, 100 - z.h) }
      : { id: d.id, w: clamp(z.w + dx, 4, 100 - z.x), h: clamp(z.h + dy, 4, 100 - z.y) });
  }
  function endDrag() {
    const d = drag.current; drag.current = null;
    if (d && d.active && preview && preview.id === d.id) { const { id, ...patch } = preview; actions.updateZone(id, patch); moved.current = true; setTimeout(() => { moved.current = false; }, 80); }
    setPreview(null);
  }
  function onZoneKey(e, z) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoneId(z.id); return; }
    if (!canEdit || zoneId !== z.id) return;
    const step = e.shiftKey ? 5 : 1, map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!map) return;
    e.preventDefault();
    actions.updateZone(z.id, { x: clamp(z.x + map[0], 0, 100 - z.w), y: clamp(z.y + map[1], 0, 100 - z.h) });
  }

  const hint = !canEdit
    ? tx('Lecture seule : touchez une zone pour voir sa fiche.', 'View only: tap a zone to see its details.')
    : tool ? tx('Touchez le plan pour placer la zone : ', 'Tap the plan to place the zone: ') + pick(lang, HAZARDS[tool].label.fr, HAZARDS[tool].label.en).toLowerCase() + '.'
      : tx('Choisissez un danger puis touchez le plan. Faites glisser une zone pour la déplacer.', 'Pick a hazard, then tap the plan. Drag a zone to move it.');

  return (
    <>
      <div className="page-head">
        <div><h1 className="t-large">{tx('Plan', 'Plan')}</h1><p className="page-sub">{ship.decks.length} {tx(ship.decks.length > 1 ? 'ponts' : 'pont', ship.decks.length > 1 ? 'decks' : 'deck')}, {a.rows.length} {tx('zones de travaux', 'work zones')}</p></div>
        <Segmented value={planMode} onChange={(v) => { setPlanMode(v); setTool(null); }} label={tx('Vue', 'View')} options={[{ value: '2d', label: tx('Pont', 'Deck') }, { value: '3d', label: '3D' }]} />
      </div>

      <div className="plan-wrap">
        <div className="plan-col">
          {planMode === '2d' ? (<>
            <div className="plan-bar">
              <button type="button" className="deck-btn" aria-haspopup="menu" aria-label={tx('Pont : ', 'Deck: ') + deck.name} onClick={(e) => setDeckMenu(e.currentTarget)}>
                <Layers size={16} aria-hidden="true" /><span>{deck.name}</span><ChevronsUpDown size={15} aria-hidden="true" />
              </button>
              <span className="grow" />
              <Segmented value={colorMode} onChange={setColorMode} label={tx('Couleur des zones', 'Zone colour')} options={[{ value: 'hazard', label: tx('Danger', 'Hazard') }, { value: 'company', label: tx('Entreprise', 'Company') }]} />
            </div>
            {canEdit && (
              <div className="tools" role="group" aria-label={tx('Ajouter une zone', 'Add a zone')}>
                {HAZARD_KEYS.map((k) => { const Ico = HAZARD_ICON[k]; return (
                  <button key={k} type="button" className={'tool hz-' + k} aria-pressed={tool === k} onClick={() => setTool(tool === k ? null : k)}>
                    <Ico size={15} strokeWidth={2.3} aria-hidden="true" />{pick(lang, HAZARDS[k].label.fr, HAZARDS[k].label.en)}
                  </button>); })}
              </div>)}
            <p className="plan-hint" aria-live="polite">{hint}</p>
            {conflicts.length > 0 && (
              <div className="banner" role="status">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <strong>{conflicts.length > 1 ? conflicts.length + tx(' conflits de travaux', ' work conflicts') : tx('Conflit de travaux', 'Work conflict')}</strong>
                  {conflicts.map((c, i) => <p key={i}>{zoneTitle(c.z1, lang)} ↔ {zoneTitle(c.z2, lang)}{lang === 'bi' ? ' : ' : ': '}{pick(lang, c.rule.fr, c.rule.en).toLowerCase()}.</p>)}
                </div>
              </div>)}
            <div ref={stageRef} className={'plan-stage' + (tool ? ' placing' : '')} onClick={onStageClick}>
              {deck.planImage ? <img src={deck.planImage} alt={tx('Plan importé du pont ', 'Imported plan of ') + deck.name} /> : <DeckSchematic deck={deck} lang={lang} />}
              {deck.zones.map((z) => {
                const p = preview && preview.id === z.id ? { ...z, ...preview } : z;
                const zi = a.info.get(z.id), isSel = zoneId === z.id, Ico = HAZARD_ICON[z.type];
                const color = colorMode === 'company' && z.company ? companyColor(z.company, companies) : null;
                const issue = zi && zi.issues.length ? ISSUES[zi.issues[0].code] : null;
                const label = zoneTitle(z, lang) + ', ' + pick(lang, HAZARDS[z.type].label.fr, HAZARDS[z.type].label.en) + (z.company ? ', ' + z.company : '') + (issue ? ', ' + pick(lang, issue.fr, issue.en) : '');
                return (
                  <div key={z.id} role="button" tabIndex={0} aria-pressed={isSel} aria-label={label}
                    className={'zone hz-' + z.type + ' ' + z.status + (isSel ? ' sel' : '') + (canEdit ? ' editable' : '') + (conflictIds.has(z.id) ? ' alert' : '')}
                    style={{ left: p.x + '%', top: p.y + '%', width: p.w + '%', height: p.h + '%', ...(color ? { '--hz': color } : null) }}
                    onPointerDown={(e) => startDrag(e, z, 'move')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                    onClick={(e) => { e.stopPropagation(); if (moved.current) { moved.current = false; return; } setZoneId(z.id); }}
                    onKeyDown={(e) => onZoneKey(e, z)}>
                    <span className="zone-name"><Ico size={12} strokeWidth={2.5} aria-hidden="true" /><span>{zoneTitle(z, lang)}</span></span>
                    <span className="zone-meta" aria-hidden="true">
                      {zi && zi.occupants.length > 0 && <span className="zone-tag"><Users size={9} strokeWidth={2.6} />{zi.occupants.length}</span>}
                      {issue && <span className={'zone-tag ' + (zi.sev >= 2 ? 'bad' : 'warn')}>{pick(lang, issue.sfr, issue.sen)}</span>}
                    </span>
                    {canEdit && isSel && <span className="zone-grip" aria-hidden="true" onPointerDown={(e) => startDrag(e, z, 'size')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={(e) => e.stopPropagation()} />}
                  </div>);
              })}
            </div>
            <div className="plan-foot">
              <div className="legend">
                {colorMode === 'company'
                  ? (companies.length ? companies.map((c) => <span key={c}><span className="swatch" style={{ '--c': companyColor(c, companies) }} aria-hidden="true" />{c}</span>) : <span>{tx('Aucune entreprise renseignée sur ce pont.', 'No company set on this deck.')}</span>)
                  : HAZARD_KEYS.map((k) => <span key={k} className={'hz-' + k}><span className="swatch" aria-hidden="true" /><HazardName type={k} lang={lang} /></span>)}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>{tx('Trait plein : en cours. Pointillés : planifié. Pâle : terminé.', 'Solid: in progress. Dashed: planned. Faint: completed.')}</p>
            </div>
          </>) : (
            <Vessel3D ship={ship} lang={lang} tx={tx} selectedId={zoneId} onSelect={focusZone} />
          )}
        </div>

        {!compact && (
          <div className="insp-col card">
            {selF
              ? <ZonePanel key={selF.zone.id} zone={selF.zone} deck={selF.deck} onClose={() => setZoneId(null)} />
              : <div className="insp-empty"><MousePointerClick size={30} aria-hidden="true" /><p>{tx('Touchez une zone pour voir son permis, ses tests, son registre d’accès et ses équipements.', 'Tap a zone to see its permit, tests, access register and equipment.')}</p></div>}
          </div>)}
      </div>

      {compact && selF && (
        <Sheet nonmodal detent icon={<HazardTile type={selF.zone.type} />} title={zoneTitle(selF.zone, lang)} sub={[selF.zone.company, selF.deck.name].filter(Boolean).join(', ')}
          closeLabel={tx('Fermer la fiche', 'Close the zone')} onClose={() => setZoneId(null)}>
          <ZonePanel key={selF.zone.id} zone={selF.zone} deck={selF.deck} inSheet />
        </Sheet>)}

      {deckMenu && (
        <Menu anchor={deckMenu} align="start" label={tx('Ponts', 'Decks')} onClose={() => setDeckMenu(null)}>
          <MenuLabel>{tx('Ponts', 'Decks')}</MenuLabel>
          {ship.decks.map((d) => <MenuItem key={d.id} role="menuitemradio" checked={d.id === deck.id} sub={d.zones.length + ' ' + tx('zones', 'zones')} onSelect={() => setDeckId(d.id)}>{d.name}</MenuItem>)}
          {canEdit && <>
            <MenuSep />
            <MenuItem icon={<Pencil size={17} />} onSelect={() => openSheet({ kind: 'deck', deckId: deck.id })}>{tx('Modifier ce pont', 'Edit this deck')}</MenuItem>
            <MenuItem icon={<Plus size={17} />} onSelect={actions.addDeck}>{tx('Nouveau pont', 'New deck')}</MenuItem>
            <MenuItem icon={<ImagePlus size={17} />} onSelect={() => actions.pickPlanImage(deck.id)} sub={tx('Photo ou scan du plan de ce pont', 'Photo or scan of this deck’s plan')}>{tx('Importer le plan du pont', 'Import the deck plan')}</MenuItem>
            <MenuItem icon={<Sparkles size={17} />} onSelect={actions.startAi} sub={tx('Crée les ponts à partir du plan général', 'Creates decks from the general arrangement')}>{tx('Lire un plan avec l’IA', 'Read a plan with AI')}</MenuItem>
            {deck.planImage && <MenuItem icon={<X size={17} />} onSelect={() => actions.clearPlanImage(deck.id)}>{tx('Retirer l’image du plan', 'Remove the plan image')}</MenuItem>}
            {ship.decks.length > 1 && <MenuItem danger icon={<Trash2 size={17} />} onSelect={() => actions.removeDeck(deck.id)}>{tx('Supprimer ce pont', 'Delete this deck')}</MenuItem>}
          </>}
        </Menu>)}
    </>
  );
}
