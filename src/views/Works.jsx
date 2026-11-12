import React, { useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { useApp } from '../lib/ctx.js';
import { companyColor, companyList, zoneTitle } from '../lib/model.js';
import { fmtHours } from '../lib/i18n.js';
import { Chip, HazardTile, Section, Segmented, StateChip, StatusChip } from '../components/ui.jsx';

const STATE_ORDER = ['blocked', 'attention', 'prepare', 'ready', 'done'];

export default function Works() {
  const { ship, a, lang, tx, openZone } = useApp();
  const [by, setBy] = useState('state');
  const titles = { blocked: tx('Bloqués', 'Blocked'), attention: tx('À régulariser', 'To sort out'), prepare: tx('À préparer', 'To prepare'), ready: tx('Prêts', 'Ready'), done: tx('Terminés', 'Completed') };
  const notes = {
    blocked: tx('Ces travaux ne peuvent pas continuer en l’état : ouvrez la fiche pour voir ce qui manque.', 'These works can’t carry on as they are: open one to see what’s missing.'),
    attention: tx('Travaux en cours avec un document manquant ou expiré.', 'Works in progress with a missing or expired document.'),
    prepare: tx('Travaux planifiés : ce qui manque avant de démarrer.', 'Planned works: what’s missing before they start.'),
  };
  const companies = companyList(a.rows.map((r) => r.zone));
  const hoursOf = new Map(a.timesheet.companies.map((c) => [c.company, c]));

  const groups = by === 'state'
    ? STATE_ORDER.map((st) => ({ key: st, title: titles[st], note: notes[st], items: a.rows.filter((r) => a.info.get(r.zone.id).state === st) })).filter((g) => g.items.length)
    : [...companies, ''].map((c) => {
      const items = a.rows.filter((r) => (r.zone.company || '') === c);
      const t = hoursOf.get(c);
      return { key: c || '_none', company: c, title: c || tx('Sans entreprise', 'No company'), note: t ? fmtHours(t.ms, lang) + tx(' pointées aujourd’hui par ', ' booked today by ') + t.people + tx(t.people > 1 ? ' personnes' : ' personne', t.people > 1 ? ' people' : ' person') + '.' : null, items };
    }).filter((g) => g.items.length);

  return (
    <>
      <div className="page-head">
        <div><h1 className="t-large">{tx('Travaux', 'Works')}</h1><p className="page-sub">{a.rows.length} {tx('travaux sur ', 'works on ')}{ship.decks.length} {tx(ship.decks.length > 1 ? 'ponts' : 'pont', ship.decks.length > 1 ? 'decks' : 'deck')}, {a.counts.progress} {tx('en cours', 'in progress')}</p></div>
        <Segmented value={by} onChange={setBy} label={tx('Regrouper', 'Group')} options={[{ value: 'state', label: tx('Par état', 'By state') }, { value: 'company', label: tx('Par entreprise', 'By company') }]} />
      </div>
      {groups.length === 0 && <div className="group"><p className="row-empty">{tx('Aucun travail pour l’instant. Ajoutez des zones depuis le plan.', 'No work yet. Add zones from the plan.')}</p></div>}
      {groups.map((g) => (
        <Section key={g.key} count={g.items.length} note={g.note}
          title={by === 'company' && g.company ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span className="swatch" style={{ '--c': companyColor(g.company, companies) }} aria-hidden="true" />{g.title}</span> : g.title}>
          <div className="group ic">
            {g.items.map(({ zone, deck }) => {
              const zi = a.info.get(zone.id);
              return (
                <button key={zone.id} type="button" className="row work" onClick={() => openZone(zone.id)}>
                  <HazardTile type={zone.type} />
                  <span className="row-main"><span className="row-title">{zoneTitle(zone, lang)}</span><span className="row-sub">{by === 'state' ? (zone.company || tx('Sans entreprise', 'No company')) + ', ' + deck.name : deck.name}</span></span>
                  <span className="work-cells">
                    <StatusChip status={zone.status} lang={lang} />
                    <StateChip zi={zi} lang={lang} />
                    {zi.occupants.length > 0 && <Chip icon={<Users size={12} strokeWidth={2.4} aria-hidden="true" />}>{zi.occupants.length}<span className="sr"> {tx('en zone', 'inside')}</span></Chip>}
                  </span>
                  <ChevronRight className="row-chev" size={18} aria-hidden="true" />
                </button>);
            })}
          </div>
        </Section>))}
    </>
  );
}
