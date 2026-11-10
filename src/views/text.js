// Sentences shared by the overview, the plan and the report.
import { ISSUES, zoneTitle } from '../lib/model.js';
import { fmtSpan, pick } from '../lib/i18n.js';

export const colon = (lang) => (lang === 'bi' ? ' : ' : ': ');
export const alertLabel = (al, lang) => pick(lang, ISSUES[al.code].fr, ISSUES[al.code].en);
export const alertSubject = (al, lang) => (al.code === 'conflict' ? zoneTitle(al.zone, lang) + ' ↔ ' + zoneTitle(al.other, lang) : zoneTitle(al.zone, lang));
export const alertSentence = (al, lang) => alertLabel(al, lang) + colon(lang) + alertSubject(al, lang) + ' (' + al.deck.name + ')';
export const issueText = (is, lang) => {
  if (is.code === 'conflict') return pick(lang, 'Conflit avec « ', 'Conflict with “') + zoneTitle(is.other, lang) + pick(lang, ' » : ', '”: ') + pick(lang, is.rule.fr, is.rule.en);
  return pick(lang, ISSUES[is.code].fr, ISSUES[is.code].en);
};
const spanIn = { en: (s) => 'in ' + s, bg: (s) => 'след ' + s, fr: (s) => 'dans ' + s };
const spanAgo = { en: (s) => s + ' ago', bg: (s) => 'преди ' + s, fr: (s) => 'il y a ' + s };
const spanLeft = { en: (s) => s + ' left', bg: (s) => 'остават ' + s, fr: (s) => 'encore ' + s };
const by = (table, lang) => table[lang] || table.fr;
export const ago = (ms, lang) => by(spanAgo, lang)(fmtSpan(ms, lang));
export const left = (ms, lang) => by(spanLeft, lang)(fmtSpan(ms, lang));
export const inSpan = (ms, lang) => (ms >= 0 ? by(spanIn, lang)(fmtSpan(ms, lang)) : ago(-ms, lang));
export const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
