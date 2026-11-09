import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { LayoutDashboard, Map as MapIcon, Box, HardHat, Users, Satellite, WifiOff, Lock, Unlock, Eye, ClipboardList, MoreHorizontal, Check, Plus, Trash2, LogIn, LogOut, Ship, Languages, AlertTriangle, Flame, Wind, FileWarning, Siren, ShieldCheck, ChevronRight, Activity, UserCheck, ClipboardCheck, History } from 'lucide-react';

const HAZARDS = {
  hot: { color: '#ff453a', label: { fr: 'Travaux à chaud', en: 'Hot work' },
    epi: [ { fr: 'Masque de soudure', en: 'Welding mask' }, { fr: 'Tablier ignifuge', en: 'Fire-retardant apron' }, { fr: 'Gants de soudeur', en: 'Welding gloves' }, { fr: 'Surveillant incendie', en: 'Fire watch' } ],
    permit: { fr: 'Permis de feu obligatoire', en: 'Hot work permit required' } },
  confined: { color: '#ff9f0a', label: { fr: 'Espace confiné', en: 'Confined space' },
    epi: [ { fr: 'Détecteur 4 gaz', en: '4-gas detector' }, { fr: 'Harnais + ligne de vie', en: 'Harness + lifeline' }, { fr: 'Ventilation forcée', en: 'Forced ventilation' }, { fr: 'Surveillant à l’entrée', en: 'Standby attendant' } ],
    permit: { fr: 'Permis d’entrée + test gaz', en: 'Entry permit + gas test' } },
  height: { color: '#ffd60a', label: { fr: 'Travail en hauteur', en: 'Working at height' },
    epi: [ { fr: 'Harnais antichute', en: 'Fall-arrest harness' }, { fr: 'Double longe', en: 'Double lanyard' }, { fr: 'Casque à jugulaire', en: 'Chin-strap helmet' } ],
    permit: { fr: 'Échafaudage validé (étiquette verte)', en: 'Scaffold validated (green tag)' } },
  blast: { color: '#64d2ff', label: { fr: 'Sablage / Peinture', en: 'Blasting / Painting' },
    epi: [ { fr: 'Masque à adduction d’air', en: 'Air-fed respirator' }, { fr: 'Combinaison étanche', en: 'Sealed coverall' }, { fr: 'Gants nitrile', en: 'Nitrile gloves' }, { fr: 'Protection auditive', en: 'Hearing protection' } ],
    permit: { fr: 'Zone balisée et ventilée', en: 'Cordoned & ventilated area' } },
};
const STATUS = {
  planned:  { fr: 'Planifié', en: 'Planned', color: '#8e8e93' },
  progress: { fr: 'En cours', en: 'In progress', color: '#30d158' },
  done:     { fr: 'Terminé', en: 'Completed', color: '#0a84ff' },
};
const COMPANY_PALETTE = ['#2dd4bf', '#60a5fa', '#f472b6', '#facc15', '#fda4af', '#fb923c', '#4ade80', '#f87171', '#38bdf8', '#a3e635'];
const SHARED_KEY = 'ams_shared_v2';
const PRESENCE_KEY = 'ams_presence_v2';
const PENDING_KEY = 'ams_pending_v1';
const BRAND_INK = '#111316';
const COORD_CODE = 'ALLIED2026';

function uid() { return Math.random().toString(36).slice(2, 9); }
function companyList(zones) { const set = []; zones.forEach((z) => { if (z.company && !set.includes(z.company)) set.push(z.company); }); return set; }
function companyColor(name, companies) { const i = companies.indexOf(name); return i < 0 ? '#94a3b8' : COMPANY_PALETTE[i % COMPANY_PALETTE.length]; }
function fmtDur(since, lang) {
  if (!since) return '';
  const ms = Date.now() - since; const min = Math.floor(ms / 60000);
  if (min < 1) return lang === 'en' ? 'just now' : lang === 'bg' ? 'току-що' : "à l'instant";
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60; return h + 'h ' + String(m).padStart(2, '0');
}
// Helpers de langue
// Dictionnaire bulgare (clé = chaîne française ; repli automatique sur l'anglais)
const BG = {
  'Travaux à chaud': 'Огневи работи', 'Espace confiné': 'Затворено пространство', 'Travail en hauteur': 'Работа на височина', 'Sablage / Peinture': 'Пясъкоструене / Боядисване',
  'Masque de soudure': 'Заваръчна маска', 'Tablier ignifuge': 'Огнеупорна престилка', 'Gants de soudeur': 'Заваръчни ръкавици', 'Surveillant incendie': 'Пожарен наблюдател',
  'Détecteur 4 gaz': '4-газов детектор', 'Harnais + ligne de vie': 'Сбруя + осигурително въже', 'Ventilation forcée': 'Принудителна вентилация', 'Surveillant à l’entrée': 'Дежурен на входа',
  'Harnais antichute': 'Предпазна сбруя срещу падане', 'Double longe': 'Двойно осигурително въже', 'Casque à jugulaire': 'Каска с каишка',
  'Masque à adduction d’air': 'Маска с подаване на въздух', 'Combinaison étanche': 'Херметичен гащеризон', 'Gants nitrile': 'Нитрилни ръкавици', 'Protection auditive': 'Защита на слуха',
  'Permis de feu obligatoire': 'Задължително разрешително за огневи работи', 'Permis d’entrée + test gaz': 'Разрешително за влизане + газов тест',
  'Échafaudage validé (étiquette verte)': 'Одобрено скеле (зелен етикет)', 'Zone balisée et ventilée': 'Обозначена и вентилирана зона',
  'Planifié': 'Планирано', 'En cours': 'В процес', 'Terminé': 'Завършено',
  'Vue d’ensemble': 'Общ преглед', 'Plan': 'План', 'Travaux': 'Дейности', 'Équipe': 'Екип',
  'En direct': 'На живо', 'Coordination': 'Координация', 'quitter': 'изход', 'Mode consultation': 'Само преглед', 'Accès coordination': 'Достъп за координация',
  'Réservé à la coordination du chantier.': 'Само за координацията на обекта.', "Code d'accès": 'Код за достъп', 'Code incorrect.': 'Грешен код.',
  'Annuler': 'Отказ', 'Déverrouiller': 'Отключи', 'Fermer': 'Затвори', 'Chargement…': 'Зареждане…', 'Document indisponible.': 'Документът не е наличен.',
  'Permis de travail': 'Работно разрешително', 'Test atmosphérique': 'Атмосферен тест',
  'Aucun navire.': 'Няма кораб.', '+ Navire': '+ Кораб', 'Nouveau navire': 'Нов кораб', 'Pont': 'Палуба', 'Nom du pont': 'Име на палубата', '+ Pont': '+ Палуба', 'Nouveau pont': 'Нова палуба',
  'Type : Général': 'Тип: Общ', 'Type : Cabines': 'Тип: Каюти', 'Type : Machines': 'Тип: Машини', 'Type : Technique': 'Тип: Технически',
  'Importer le plan du pont': 'Качи план на палубата', 'Retirer': 'Премахни', 'Par danger': 'По опасност', 'Par compagnie': 'По фирма',
  'Analyser un plan (IA)': 'Анализ на план (ИИ)', 'Analyse IA du plan': 'ИИ анализ на плана',
  'Ajouter une zone': 'Добави зона', 'Supprimer': 'Изтрий', 'Compagnie': 'Фирма', 'Travaux': 'Дейности', 'Statut': 'Статус',
  'Taille de la zone': 'Размер на зоната', 'Largeur': 'Ширина', 'Hauteur': 'Височина',
  'Permis de travail': 'Работно разрешително', 'Voir le permis': 'Виж разрешителното', 'Aucun permis importé.': 'Няма качено разрешително.',
  '＋ Importer le permis (image / scan)': '＋ Качи разрешително (снимка / скан)',
  'Tests atmosphériques': 'Атмосферни тестове', 'Intervalle': 'Интервал', '＋ Nouveau contrôle (upload fiche)': '＋ Нов контрол (качи протокол)',
  'Aucun contrôle.': 'Няма контроли.', 'Voir': 'Виж', 'en attente': 'изчаква', '⚠ Aucun test enregistré': '⚠ Няма записан тест',
  'EN RETARD depuis ': 'ПРОСРОЧЕН от ', '✓ Prochain test dans ': '✓ Следващ тест след ',
  'Registre d’accès': 'Регистър за достъп', 'Personne dans la zone.': 'Няма никой в зоната.', 'Nom de l’intervenant…': 'Име на работника…',
  'Entrée': 'Вход', 'Sortie': 'Изход', 'Conditions non remplies : ': 'Условията не са изпълнени: ', 'Entrée refusée et journalisée — ': 'Входът е отказан и записан — ',
  'depuis': 'от', 'EPI': 'ЛПС',
  'Test atmosphérique expiré': 'Атмосферният тест е изтекъл', 'Aucun test atmosphérique valide': 'Няма валиден атмосферен тест', 'Aucun fire watch posté sur la zone': 'Няма пожарен наблюдател на зоната',
  'Fire Watch — surveillants incendie': 'Fire Watch — пожарни наблюдатели', 'Nom du fire watch…': 'Име на наблюдателя…', '＋ Ajouter': '＋ Добави',
  'Aucun fire watch.': 'Няма пожарни наблюдатели.', 'Disponible': 'Свободен', 'Libérer': 'Освободи', 'Poster sur…': 'Постави на…',
  'Aucune zone à chaud': 'Няма зона за огневи работи', 'Zone à chaud': 'Зона за огневи работи', 'Zone travaux à chaud': 'Зона за огневи работи', 'Zone supprimée': 'Изтрита зона',
  'Coordination du chantier': 'Координация на обекта', 'Coordinateur': 'Координатор', 'Assistant coordinateur': 'Асистент-координатор', 'Nom': 'Име', 'Nom (optionnel)': 'Име (по избор)',
  'Fire Watch en position': 'Наблюдатели на позиция', 'Disponibles': 'Свободни',
  'Travaux par compagnie (tous les ponts)': 'Дейности по фирми (всички палуби)', 'Aucune zone.': 'Няма зони.', 'zone(s)': 'зона/и', 'Sans compagnie': 'Без фирма',
  'Dimensions du dry dock & du navire': 'Размери на сухия док и кораба', 'Longueur bassin': 'Дължина на дока', 'Largeur bassin': 'Ширина на дока',
  'Longueur navire': 'Дължина на кораба', 'Largeur navire': 'Ширина на кораба', 'Vue de dessus — navire en cale sèche': 'Изглед отгоре — кораб в сух док',
  'Travaux en cours': 'Текущи дейности', 'Présents en zone': 'Хора в зоните', 'Conflits détectés': 'Открити конфликти', 'Tests atmo en retard': 'Просрочени тестове',
  'Fire watch postés': 'Поставени наблюдатели', 'Contrôles aujourd’hui': 'Контроли днес', 'Permis manquants': 'Липсващи разрешителни',
  'Alertes actives': 'Активни аларми', 'Aucune alerte — chantier conforme': 'Няма аларми — обектът е съответен',
  'Rapport journalier': 'Дневен отчет', 'Journal du chantier (traçabilité)': 'Дневник на обекта (проследимост)',
  'Conflits de travaux détectés': 'Открити конфликти между дейности', 'Conflit avec': 'Конфликт с',
  'Travaux à chaud à proximité de sablage/peinture — vapeurs et poussières inflammables': 'Огневи работи близо до пясъкоструене/боядисване — запалими пари и прах',
  'Travaux à chaud à proximité d’un espace confiné — atmosphère intérieure à risque': 'Огневи работи близо до затворено пространство — риск за вътрешната атмосфера',
  'Sablage/peinture près d’un espace confiné — contamination possible de l’atmosphère': 'Пясъкоструене/боядисване близо до затворено пространство — възможно замърсяване на атмосферата',
  'En ligne': 'Онлайн', 'Hors-ligne': 'Офлайн', 'Simuler hors-ligne': 'Симулирай офлайн',
  'Coordination sécurité · Cale sèche': 'Координация по безопасност · Сух док',
  'Rapport journalier de sécurité': 'Дневен отчет за безопасност', 'POINTS DE VIGILANCE': 'ТОЧКИ ЗА ВНИМАНИЕ', 'JOURNAL DES OPÉRATIONS': 'ДНЕВНИК НА ОПЕРАЦИИТЕ',
  'en cours': 'в процес', 'planifiés': 'планирани', 'terminés': 'завършени', 'postés': 'поставени', 'Contrôles atmo aujourd’hui': 'Атмосферни контроли днес',
  'Pic avant': 'Форпик', 'Cabines BB': 'Каюти ЛБ', 'Cabines TB': 'Каюти ДБ', 'Coursive': 'Коридор', 'Magasin': 'Склад', 'Atelier': 'Работилница',
  'Citerne BB': 'Танк ЛБ', 'Citerne TB': 'Танк ДБ', 'Salle des machines': 'Машинно отделение', 'Local de barre': 'Румпелно отделение',
  'Cabine BB': 'Каюта ЛБ', 'Cabine TB': 'Каюта ДБ', 'Sanitaires': 'Санитарен възел', 'Réfectoire': 'Столова', 'Local technique': 'Техническо помещение',
  'Local étrave': 'Носово помещение', 'Soute BB/TB': 'Бункери ЛБ/ДБ', 'Salle de contrôle': 'Контролна зала', 'Tableau élec.': 'Ел. табло',
  'Groupe élec. BB': 'Генератор ЛБ', 'Groupe élec. TB': 'Генератор ДБ', 'Moteur principal': 'Главен двигател',
  'Pic avant (ballast)': 'Форпик (баласт)', 'Ballast BB 1': 'Баласт ЛБ 1', 'Tunnel': 'Тунел', 'Ballast TB 1': 'Баласт ДБ 1',
  'Ballast BB 2': 'Баласт ЛБ 2', 'Ballast TB 2': 'Баласт ДБ 2', 'Soute combustible': 'Горивен танк', 'Pic arrière': 'Ахтерпик',
  'PROUE': 'НОС', 'POUPE': 'КЪРМА',
  'Voir sur le plan': 'Виж на плана',
  'Consultation — touchez une zone pour voir le détail': 'Само преглед — докоснете зона за детайли',
  'Choisissez un danger à droite, puis cliquez sur le plan': 'Изберете опасност вдясно, после докоснете плана',
  '→ Cliquez sur le plan pour placer : ': '→ Докоснете плана, за да поставите: ',
  'Mode consultation — seule la coordination peut modifier.': 'Само преглед — само координацията може да редактира.',
  'Lecture du plan d’arrangement général…': 'Четене на генералния план…',
  'Identification des ponts': 'Идентифициране на палубите',
  'Découpage des compartiments': 'Определяне на отсеците',
  'Proposition de zones de danger': 'Предлагане на опасни зони',
  'pont(s) détecté(s)': 'открити палуби',
  'compartiments': 'отсека',
  'zones de danger proposées': 'предложени опасни зони',
  'Créer les ponts': 'Създай палубите',
  'Aucune opération enregistrée aujourd’hui.': 'Няма записани операции днес.',
  'Aucun point de vigilance — chantier conforme au moment du rapport.': 'Няма точки за внимание — обектът е съответен към момента на отчета.',
  'Conflit': 'Конфликт',
  'Test atmosphérique en retard': 'Просрочен атмосферен тест',
  'Travaux à chaud sans fire watch': 'Огневи работи без пожарен наблюдател',
  'Espace confiné jamais testé': 'Затворено пространство без тест',
  'Permis manquant': 'Липсващо разрешително',
  'Aucun fire watch posté sur cette zone.': 'Няма пожарен наблюдател на тази зона.',
  'Gérer dans l’onglet Équipe.': 'Управлява се в раздел Екип.',
  'Voir le test': 'Виж теста',
  'Vue d’ensemble': 'Общ преглед', 'Plan': 'План', 'Équipe': 'Екип', 'En ligne': 'Онлайн', 'Hors-ligne': 'Офлайн', 'Rapport journalier': 'Дневен отчет',
};
function pick(lang, fr, en) { if (lang === 'en') return en; if (lang === 'bg') return BG[fr] || en; return fr; }
function mkTx(lang) { return (fr, en) => pick(lang, fr, en); }                       // interface
function mkBi(lang) { return (fr, en) => (lang === 'bi' ? fr + ' / ' + en : pick(lang, fr, en)); } // info clé bilingue
function fmtClock(ts, lang) { if (!ts) return ''; try { return new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : lang === 'bg' ? 'bg-BG' : 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function fmtRemaining(ms, lang) { const abs = Math.abs(ms); const h = Math.floor(abs / 3600000); const m = Math.floor((abs % 3600000) / 60000); return h > 0 ? h + 'h ' + String(m).padStart(2, '0') : m + ' min'; }

// Détection de conflits de travaux incompatibles (proximité sur le plan)
const CONFLICT_RULES = [
  { a: 'hot', b: 'blast', margin: 10, fr: 'Travaux à chaud à proximité de sablage/peinture — vapeurs et poussières inflammables', en: 'Hot work near blasting/painting — flammable vapours & dust' },
  { a: 'hot', b: 'confined', margin: 8, fr: 'Travaux à chaud à proximité d’un espace confiné — atmosphère intérieure à risque', en: 'Hot work near a confined space — internal atmosphere at risk' },
  { a: 'blast', b: 'confined', margin: 8, fr: 'Sablage/peinture près d’un espace confiné — contamination possible de l’atmosphère', en: 'Blasting/painting near a confined space — possible atmosphere contamination' },
];
function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}
function zoneConflicts(zones) {
  const out = [];
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const z1 = zones[i], z2 = zones[j];
    if (z1.status === 'done' || z2.status === 'done') continue;
    CONFLICT_RULES.forEach((r) => {
      if ((z1.type === r.a && z2.type === r.b) || (z1.type === r.b && z2.type === r.a)) {
        if (rectGap(z1, z2) <= r.margin) out.push({ z1, z2, rule: r });
      }
    });
  }
  return out;
}

function permitSvg() {
  const rows = ['Date / Date : 08-06-2026', 'Lieu / Location : Pont 1 - proue', 'Duree / Duration : 08:00 - 16:00',
    'Surveillant incendie / Fire watch : J. Pieters', 'Extincteur verifie / Extinguisher checked : OUI',
    'Atmosphere testee / Atmosphere tested : OUI', 'Signature coordination : __________'];
  let y = 250; let body = '';
  rows.forEach((r) => { body += "<text x='50' y='" + y + "' font-family='Arial' font-size='22' fill='#0A2540'>" + r + "</text>"; y += 55; });
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='760' height='980'><rect width='760' height='980' fill='#ffffff' stroke='#cbd5e1'/><rect x='0' y='0' width='760' height='110' fill='#ef4444'/><text x='40' y='70' font-family='Arial' font-size='38' font-weight='bold' fill='#ffffff'>HOT WORK PERMIT</text><text x='50' y='175' font-family='Arial' font-size='24' font-weight='bold' fill='#0A2540'>Permis de travail a chaud</text>" + body + "<rect x='50' y='820' width='660' height='110' fill='none' stroke='#94a3b8'/><text x='65' y='855' font-family='Arial' font-size='16' fill='#64748b'>Document importe - exemple de demonstration</text></svg>";
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function atmoSvg() {
  const rows = ['Heure / Time : 07:45', 'O2 : 20.9 %  (19.5 - 23.5)', 'LEL : 0 %', 'H2S : 0 ppm', 'CO : 0 ppm',
    'Resultat / Result : SAFE FOR ENTRY', 'Testeur / Tester : M. de Vries', 'Re-test : toutes les 2h'];
  let y = 250; let body = '';
  rows.forEach((r) => { body += "<text x='50' y='" + y + "' font-family='Arial' font-size='22' fill='#0A2540'>" + r + "</text>"; y += 55; });
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='760' height='980'><rect width='760' height='980' fill='#ffffff' stroke='#cbd5e1'/><rect x='0' y='0' width='760' height='110' fill='#f97316'/><text x='40' y='70' font-family='Arial' font-size='34' font-weight='bold' fill='#ffffff'>ATMOSPHERIC TEST</text><text x='50' y='175' font-family='Arial' font-size='24' font-weight='bold' fill='#0A2540'>Test atmospherique - espace confine</text>" + body + "<rect x='50' y='820' width='660' height='110' fill='none' stroke='#94a3b8'/><text x='65' y='855' font-family='Arial' font-size='16' fill='#64748b'>Document importe - exemple de demonstration</text></svg>";
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}




// Résultat d'exemple si l'appel IA échoue (plan type pétrolier)
const AI_FALLBACK = { demo: true, decks: [
  { name: 'Pont principal — Citernes cargo', layout: 'technical',
    compartments: [
      { fr: 'Pic avant', en: 'Forepeak', x: 25, y: 1, w: 50, h: 7 },
      { fr: 'COT 1 BB', en: 'COT 1 P', x: 6, y: 10, w: 42, h: 13 }, { fr: 'COT 1 TB', en: 'COT 1 S', x: 52, y: 10, w: 42, h: 13 },
      { fr: 'COT 2 BB', en: 'COT 2 P', x: 6, y: 25, w: 42, h: 13 }, { fr: 'COT 2 TB', en: 'COT 2 S', x: 52, y: 25, w: 42, h: 13 },
      { fr: 'COT 3 BB', en: 'COT 3 P', x: 6, y: 40, w: 42, h: 13 }, { fr: 'COT 3 TB', en: 'COT 3 S', x: 52, y: 40, w: 42, h: 13 },
      { fr: 'Slop BB', en: 'Slop P', x: 6, y: 55, w: 42, h: 9 }, { fr: 'Slop TB', en: 'Slop S', x: 52, y: 55, w: 42, h: 9 },
      { fr: 'Chambre des pompes', en: 'Pump room', x: 20, y: 66, w: 60, h: 8 },
      { fr: 'Château / Machines', en: 'Casing / Engine', x: 14, y: 76, w: 72, h: 20 },
    ],
    suggestedZones: [
      { type: 'confined', x: 54, y: 42, w: 24, h: 12, workFr: 'Nettoyage COT 3 TB', workEn: 'COT 3 S tank cleaning' },
      { type: 'hot', x: 30, y: 20, w: 22, h: 10, workFr: 'Réparation collecteur cargo', workEn: 'Cargo manifold repair' },
      { type: 'blast', x: 10, y: 56, w: 28, h: 10, workFr: 'Sablage pont arrière', workEn: 'Aft deck blasting' },
    ] },
  { name: 'Salle des machines', layout: 'machinery',
    compartments: [
      { fr: 'Atelier', en: 'Workshop', x: 8, y: 6, w: 40, h: 14 }, { fr: 'Salle de contrôle', en: 'Control room', x: 52, y: 6, w: 40, h: 14 },
      { fr: 'Groupes élec.', en: 'Generators', x: 8, y: 24, w: 84, h: 16 },
      { fr: 'Moteur principal', en: 'Main engine', x: 14, y: 44, w: 72, h: 26 },
      { fr: 'Double-fond', en: 'Double bottom', x: 8, y: 74, w: 84, h: 12 },
      { fr: 'Local de barre', en: 'Steering gear', x: 20, y: 89, w: 60, h: 9 },
    ],
    suggestedZones: [
      { type: 'hot', x: 20, y: 46, w: 26, h: 14, workFr: 'Tuyautage moteur principal', workEn: 'Main engine piping' },
      { type: 'confined', x: 12, y: 74, w: 32, h: 11, workFr: 'Inspection double-fond', workEn: 'Double bottom inspection' },
    ] },
  { name: 'Accommodations / Passerelle', layout: 'cabins',
    compartments: [
      { fr: 'Passerelle', en: 'Bridge', x: 20, y: 4, w: 60, h: 12 },
      { fr: 'Cabines officiers', en: 'Officers cabins', x: 8, y: 20, w: 40, h: 22 }, { fr: 'Cabines équipage', en: 'Crew cabins', x: 52, y: 20, w: 40, h: 22 },
      { fr: 'Cuisine', en: 'Galley', x: 8, y: 46, w: 40, h: 14 }, { fr: 'Réfectoire', en: 'Mess room', x: 52, y: 46, w: 40, h: 14 },
      { fr: 'Local technique', en: 'Technical room', x: 20, y: 64, w: 60, h: 12 },
    ],
    suggestedZones: [
      { type: 'height', x: 16, y: 2, w: 30, h: 14, workFr: 'Échafaudage façade passerelle', workEn: 'Bridge front scaffolding' },
    ] },
] };

function makeExampleShip() {
  const hotId = uid();
  return { id: uid(), name: 'MV Demo Vessel',
    dock: { dockLength: 180, dockWidth: 32, shipLength: 154, shipWidth: 25 },
    crew: {
      coordinator: 'A. Janssen', assistant: 'L. Moreau',
      fireWatch: [
        { id: uid(), name: 'J. Pieters', status: 'posted', zoneId: hotId, since: Date.now() - 43 * 60000 },
        { id: uid(), name: 'S. Kowalski', status: 'available', zoneId: null, since: null },
        { id: uid(), name: 'M. Diallo', status: 'available', zoneId: null, since: null },
      ],
    },
    decks: [
      { id: uid(), name: 'Hull exterior', layout: 'technical', planImage: null, zones: [
        { id: uid(), type: 'height', x: 18, y: 20, w: 12, h: 50, company: 'HeightWorks BV', work: 'Port hull scaffolding', status: 'progress', permit: null, atmo: null },
        { id: uid(), type: 'height', x: 70, y: 20, w: 12, h: 50, company: 'HeightWorks BV', work: 'Starboard hull scaffolding', status: 'progress', permit: null, atmo: null },
        { id: uid(), type: 'blast', x: 35, y: 30, w: 30, h: 40, company: 'BlastPro NV', work: 'Hull blasting & painting', status: 'planned', permit: null, atmo: null },
      ] },
      { id: uid(), name: 'Deck 1 — Machinery / Tanks', layout: 'machinery', planImage: null, zones: [
        { id: hotId, type: 'hot', x: 35, y: 22, w: 30, h: 24, company: 'Allied Welding', work: 'Bow plating replacement', status: 'progress', permit: { name: 'Permis_feu_proue.svg', data: permitSvg() }, atmo: null },
        { id: uid(), type: 'confined', x: 38, y: 50, w: 24, h: 22, company: 'TankClean Services', work: 'Aft ballast tank cleaning', status: 'progress', permit: null, atmo: { name: 'Test_atmo_ballast.svg', data: atmoSvg() }, entries: [{ id: uid(), name: 'T. Lemaire', inAt: Date.now() - 50 * 60000, outAt: null }] },
      ] },
    ] };
}

function makeAtalante() {
  const R = (x, y, w, h, fr, en) => ({ x, y, w, h, fr, en });
  const Z = (type, x, y, w, h, company, work) => ({ id: uid(), type, x, y, w, h, company, work, status: 'progress', permit: null, atmo: null });
  return { id: uid(), name: "L'Atalante", dock: { dockLength: 120, dockWidth: 24, shipLength: 85, shipWidth: 16 },
    decks: [
      { id: uid(), name: 'Pont E (partiel)', layout: 'main', planImage: null, aiRooms: [
        R(67, 161, 30, 35, 'E20 Zone de contrôle / acquisition', 'E20 Acquisition control zone'), R(67, 150, 25, 11, 'Tambour machine', 'Machine drum'),
        R(71, 139, 25, 10, 'E14 Atelier électronique', 'E14 Electronics workshop'), R(48, 126, 9, 13, 'E18 Accumulateurs', 'E18 Accumulators'),
        R(57, 126, 10, 13, 'E16 Chargeurs batteries', 'E16 Battery chargers'), R(67, 126, 20, 13, 'E12 Magasin électronique', 'E12 Electronics store'),
        R(48, 112, 32, 14, 'E8 / E6 Cabines', 'E8 / E6 Cabins'), R(48, 103, 31, 9, 'E4 Chef méc.', 'E4 Chief engineer'),
        R(79, 96, 16, 12, 'E2 Chef de mission', 'E2 Mission leader'), R(48, 57, 48, 37, 'E21 Pont avant', 'E21 Forward deck'),
      ], zones: [
        Z('hot', 42, 89, 16, 8, 'Piping', 'HWP 76 — tuyauterie, conduites hydrauliques (portique arrière)'),
        Z('hot', 24, 41, 17, 6.5, 'Aris', 'HWP 78 — Aris'),
        Z('hot', 25, 62, 8, 7, 'Steel', 'HWP 80 — acier (embarcation)'),
      ] },
      { id: uid(), name: 'Pont F', layout: 'main', planImage: null, aiRooms: [
        R(66, 162, 24, 14, 'F4 Local tech. nav.', 'F4 Nav. equipment room'), R(65, 150, 25, 11, 'Tambour machine', 'Machine drum'),
        R(65, 128, 82, 22, 'F1 Timonerie avant', 'F1 Forward wheelhouse'), R(91, 154, 23, 12, 'F2 Chambre à cartes', 'F2 Chart room'),
        R(92, 177, 19, 12, 'F3 Timonerie arrière', 'F3 Aft wheelhouse'), R(98, 166, 16, 11, 'F7 Bureau pont', 'F7 Deck office'),
        R(48, 97, 99, 31, 'F5 Pont avant', 'F5 Forward deck'),
      ], zones: [] },
    ] };
}
function normalize(ship) {
  if (!ship.crew) ship.crew = { coordinator: '', assistant: '', fireWatch: [] };
  if (!ship.log) ship.log = [];
  if (!ship.crew.fireWatch) ship.crew.fireWatch = [];
  if (!ship.decks) ship.decks = [{ id: uid(), name: 'Pont principal', planImage: ship.planImage || null, zones: ship.zones || [] }];
  ship.decks = ship.decks.map((d) => ({ id: d.id || uid(), name: d.name || 'Pont', layout: d.layout || 'main', planImage: d.planImage || null, aiRooms: d.aiRooms || null, zones: (d.zones || []).map((z) => {
    const base = { permit: null, atmo: null, entries: [], ...z };
    if (base.type === 'confined') {
      if (!base.interval) base.interval = 12;
      if (!base.checks) base.checks = base.atmo ? [{ id: uid(), ts: Date.now() - 60 * 60000, by: '—', fileName: base.atmo.name, data: base.atmo.data, key: base.atmo.key, synced: true }] : [];
    }
    return base;
  }) }));
  delete ship.planImage; delete ship.zones;
  return ship;
}

export default function ShipyardSafetyDemo() {
  const [ships, setShips] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const TAB_KEYS = ['overview', 'plan', '3d', 'works', 'crew'];
  const [tab, setTabState] = useState(() => { const h = (typeof location !== 'undefined' ? location.hash.slice(1) : ''); return TAB_KEYS.includes(h) ? h : 'overview'; });
  const setTab = (k) => { setTabState(k); try { history.replaceState(null, '', '#' + k); } catch (e) {} };
  const [tool, setTool] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [colorMode, setColorMode] = useState('hazard');
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(1);
  const [synced, setSynced] = useState(false);
  const [role, setRole] = useState('viewer');
  const [showLogin, setShowLogin] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [docView, setDocView] = useState(null);
  const [nowTick, setNowTick] = useState(0);
  const [lang, setLang] = useState('bi');
  const [simOffline, setSimOffline] = useState(false);
  const [netOnline, setNetOnline] = useState(true);
  const [pending, setPending] = useState([]);
  const [intro, setIntro] = useState(true);
  const [introOut, setIntroOut] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [checkinName, setCheckinName] = useState('');
  const [checkinErr, setCheckinErr] = useState(null);
  const [aiPhase, setAiPhase] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [confirmAsk, setConfirmAsk] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tabsRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  const askConfirm = (msg, label, onYes) => setConfirmAsk({ msg, label, onYes });
  const canEdit = role === 'coordinator';
  const connected = netOnline && !simOffline;
  const tx = mkTx(lang); const bi = mkBi(lang);
  const planRef = useRef(null);
  const fileRef = useRef(null);
  const aiInputRef = useRef(null);
  const docInputRef = useRef(null);
  const uploadCtx = useRef(null);
  const docCache = useRef({});
  const resizingRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const flushingRef = useRef(false);
  const introStart = useRef(Date.now());

  const myId = useRef(uid());
  const knownRev = useRef(0);
  const applyingRemote = useRef(false);
  const lastEditTs = useRef(0);
  function markEdit() { lastEditTs.current = Date.now(); }

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(SHARED_KEY, true);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.ships && data.ships.length) { knownRev.current = data.rev || 1; setShips(data.ships.map(normalize)); setActiveId(data.ships[0].id); setLoaded(true); setSynced(true); return; }
        }
      } catch (e) {}
      const ex = normalize(makeExampleShip());
      knownRev.current = 1; setShips([ex]); setActiveId(ex.id); setLoaded(true);
      try { await window.storage.set(SHARED_KEY, JSON.stringify({ ships: [ex], rev: 1, editor: myId.current, ts: Date.now() }), true); setSynced(true); } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (applyingRemote.current) { applyingRemote.current = false; return; }
    (async () => { try { const rev = knownRev.current + 1; knownRev.current = rev; await window.storage.set(SHARED_KEY, JSON.stringify({ ships, rev, editor: myId.current, ts: Date.now() }), true); setSynced(true); } catch (e) { setSynced(false); } })();
  }, [ships, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const tick = async () => {
      try {
        const res = await window.storage.get(SHARED_KEY, true);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.rev > knownRev.current) {
            knownRev.current = data.rev;
            if (data.editor !== myId.current && Date.now() - lastEditTs.current > 2500) { applyingRemote.current = true; setShips(data.ships.map(normalize)); if (!data.ships.find((s) => s.id === activeId)) setActiveId(data.ships[0] ? data.ships[0].id : null); }
          }
          setSynced(true);
        }
      } catch (e) {}
      try {
        let pres = {};
        try { const pr = await window.storage.get(PRESENCE_KEY, true); if (pr && pr.value) pres = JSON.parse(pr.value); } catch (e) {}
        const now = Date.now(); pres[myId.current] = now;
        Object.keys(pres).forEach((k) => { if (now - pres[k] > 20000) delete pres[k]; });
        setOnline(Object.keys(pres).length || 1);
        await window.storage.set(PRESENCE_KEY, JSON.stringify(pres), true);
      } catch (e) {}
    };
    tick();
    const iv = setInterval(tick, 3500);
    const tk = setInterval(() => setNowTick((t) => t + 1), 20000);
    return () => { clearInterval(iv); clearInterval(tk); };
  }, [loaded, activeId]);

  // Connectivité + file d'attente hors-ligne
  useEffect(() => {
    setNetOnline(typeof navigator !== 'undefined' ? navigator.onLine !== false : true);
    const up = () => setNetOnline(true); const down = () => setNetOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    (async () => { try { const r = await window.storage.get(PENDING_KEY, false); if (r && r.value) setPending(JSON.parse(r.value)); } catch (e) {} })();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { (async () => { try { await window.storage.set(PENDING_KEY, JSON.stringify(pending), false); } catch (e) {} })(); }, [pending]);
  useEffect(() => { if (connected && pending.length && !flushingRef.current) flushPending(); }, [connected, pending]);
  useEffect(() => {
    const onKey = (e) => { if (e.key !== 'Escape') return; setMenuOpen(false); setConfirmAsk(null); setShowLogin(false); setShowReport(false); setDocView(null); setAiPhase((ph) => { if (ph === 'loading') return ph; setAiResult(null); return null; }); };
    window.addEventListener('keydown', onKey);
    let drag = null;
    const ts = (e) => { const sh = e.target.closest && e.target.closest('.dd-sheet'); if (!sh || window.innerWidth > 768) return; const top = sh.getBoundingClientRect().top; const y = e.touches[0].clientY; if (y - top > 56 && sh.scrollTop > 0) return; if (y - top > 56) return; drag = { sh, y0: y, dy: 0, t0: Date.now() }; sh.style.transition = 'none'; };
    const tm = (e) => { if (!drag) return; drag.dy = Math.max(0, e.touches[0].clientY - drag.y0); drag.sh.style.transform = 'translateY(' + drag.dy + 'px)'; };
    const te = () => { if (!drag) return; const { sh, dy, t0 } = drag; drag = null; const v = dy / Math.max(1, Date.now() - t0); sh.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; if (dy > 110 || (dy > 24 && v > 0.11)) { sh.style.transform = 'translateY(100%)'; setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), 180); } else { sh.style.transform = ''; } };
    document.addEventListener('touchstart', ts, { passive: true }); document.addEventListener('touchmove', tm, { passive: true }); document.addEventListener('touchend', te);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('touchstart', ts); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setIntroOut(true); setIntro(false); return; }
    const wait = Math.max(0, 1550 - (Date.now() - introStart.current));
    let t2 = setTimeout(() => setIntro(false), wait + 440);
    const t1 = setTimeout(() => setIntroOut(true), wait);
    const skip = () => { clearTimeout(t1); clearTimeout(t2); setIntroOut(true); t2 = setTimeout(() => setIntro(false), 440); };
    window.addEventListener('pointerdown', skip, { once: true }); window.addEventListener('keydown', skip, { once: true });
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
  }, [loaded]);

  async function flushPending() {
    if (flushingRef.current || !pending.length) return;
    flushingRef.current = true;
    for (const item of [...pending]) {
      try {
        const key = 'docfile:check:' + item.check.id;
        await window.storage.set(key, item.dataUrl, true);
        docCache.current[key] = item.dataUrl;
        markEdit();
        setShips((prev) => prev.map((s) => s.id !== item.shipId ? s : ({ ...s, decks: s.decks.map((d) => d.id !== item.deckId ? d : ({ ...d, zones: d.zones.map((z) => z.id !== item.zoneId ? z : ({ ...z, checks: [{ ...item.check, key, synced: true }, ...(z.checks || [])] })) })) })));
        setPending((p) => p.filter((x) => x.id !== item.id));
        logEvent('Contrôle synchronisé après retour réseau', 'Check synced after network recovery', item.shipId);
      } catch (e) { break; }
    }
    flushingRef.current = false;
  }

  useEffect(() => { setCheckinName(''); setCheckinErr(null); }, [selectedId]);
  useEffect(() => () => { document.removeEventListener('touchmove', preventScroll); window.removeEventListener('pointermove', onZoneMove); window.removeEventListener('pointerup', onZoneUp); window.removeEventListener('pointermove', onResizeMove); window.removeEventListener('pointerup', endResize); }, []);

  const active = ships.find((s) => s.id === activeId) || null;
  const activeDeck = active ? (active.decks.find((d) => d.id === activeDeckId) || active.decks[0]) : null;
  const allZones = active ? active.decks.reduce((a, d) => a.concat(d.zones), []) : [];
  const hotZones = allZones.filter((z) => z.type === 'hot');
  const selectedZone = activeDeck ? activeDeck.zones.find((z) => z.id === selectedId) || null : null;
  const deckCompanies = activeDeck ? companyList(activeDeck.zones) : [];
  const deckConflicts = activeDeck ? zoneConflicts(activeDeck.zones) : [];
  const conflictIds = new Set(); deckConflicts.forEach((c) => { conflictIds.add(c.z1.id); conflictIds.add(c.z2.id); });
  const crew = active ? (active.crew || { coordinator: '', assistant: '', fireWatch: [] }) : null;

  function moveShip(id, pos) { if (!canEdit) return; markEdit(); setShips((prev) => prev.map((s) => (s.id === id ? { ...s, pos } : s))); }
  function addAtalante() { if (!canEdit) return; markEdit(); const a = normalize(makeAtalante()); setShips((p) => [...p, a]); setActiveId(a.id); setActiveDeckId(a.decks[0].id); setSelectedId(null); }
  function updateActive(patch) { if (!canEdit) return; markEdit(); setShips((prev) => prev.map((s) => (s.id === activeId ? { ...s, ...patch } : s))); }
  function logEvent(fr, en, shipId) { const sid = shipId || activeId; markEdit(); setShips((prev) => prev.map((s) => s.id === sid ? { ...s, log: [{ id: uid(), ts: Date.now(), fr, en }, ...(s.log || [])].slice(0, 80) } : s)); }
  function updateDeck(patch) { if (!canEdit || !active || !activeDeck) return; markEdit(); updateActive({ decks: active.decks.map((d) => (d.id === activeDeck.id ? { ...d, ...patch } : d)) }); }
  function updateZone(zid, patch) { if (!canEdit || !activeDeck) return; markEdit(); updateDeck({ zones: activeDeck.zones.map((z) => (z.id === zid ? { ...z, ...patch } : z)) }); }
  function updateCrew(patch) { if (!canEdit || !active) return; markEdit(); updateActive({ crew: { ...crew, ...patch } }); }
  function addShip() { if (!canEdit) return; markEdit(); const s = normalize({ id: uid(), name: tx('Nouveau navire', 'New vessel'), dock: { dockLength: 200, dockWidth: 35, shipLength: 170, shipWidth: 28 }, decks: [{ id: uid(), name: 'Pont 1', layout: 'main', planImage: null, zones: [] }] }); setShips((p) => [...p, s]); setActiveId(s.id); setActiveDeckId(s.decks[0].id); setTab('dock'); }
  function deleteShip(id) { if (!canEdit || ships.length <= 1) return; askConfirm(tx('Supprimer ce navire et toutes ses zones ?', 'Delete this vessel and all its zones?'), tx('Supprimer le navire', 'Delete Vessel'), () => doDeleteShip(id)); }
  function doDeleteShip(id) { markEdit(); setShips((prev) => { const next = prev.filter((s) => s.id !== id); if (id === activeId) { setActiveId(next[0] ? next[0].id : null); setActiveDeckId(null); } return next; }); }
  function addDeck() { if (!canEdit || !active) return; markEdit(); const nd = { id: uid(), name: tx('Nouveau pont', 'New deck'), layout: 'main', planImage: null, zones: [] }; updateActive({ decks: [...active.decks, nd] }); setActiveDeckId(nd.id); setSelectedId(null); }
  function deleteDeck() { if (!canEdit || !active || active.decks.length <= 1) return; askConfirm(tx('Supprimer ce pont et ses zones ?', 'Delete this deck and its zones?'), tx('Supprimer le pont', 'Delete Deck'), () => doDeleteDeck()); }
  function doDeleteDeck() { markEdit(); const remaining = active.decks.filter((d) => d.id !== activeDeck.id); updateActive({ decks: remaining }); setActiveDeckId(remaining[0].id); setSelectedId(null); }

  function handleFile(e) {
    if (!canEdit) return; const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const img = new Image(); img.onload = () => {
      const maxW = 1100, scale = Math.min(1, maxW / img.width); const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      markEdit(); updateDeck({ planImage: canvas.toDataURL('image/jpeg', 0.72) }); }; img.src = ev.target.result; };
    reader.readAsDataURL(file);
  }
  function handlePlanClick(e) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (!canEdit || !tool || !activeDeck) return;
    const rect = planRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100, py = ((e.clientY - rect.top) / rect.height) * 100;
    const z = { id: uid(), type: tool, x: Math.max(0, px - 8), y: Math.max(0, py - 6), w: 16, h: 12, company: '', work: '', status: 'planned', permit: null, atmo: null };
    markEdit(); updateDeck({ zones: [...activeDeck.zones, z] }); setSelectedId(z.id); setTool(null);
    logEvent('Zone créée — ' + HAZARDS[tool].label.fr + ' (' + activeDeck.name + ')', 'Zone created — ' + HAZARDS[tool].label.en + ' (' + activeDeck.name + ')');
  }
  function removeZone(zid) { if (!canEdit || !activeDeck) return; askConfirm(tx('Supprimer cette zone ?', 'Delete this zone?'), tx('Supprimer la zone', 'Delete Zone'), () => doRemoveZone(zid)); }
  function doRemoveZone(zid) { const zz = activeDeck.zones.find((z) => z.id === zid); markEdit(); updateDeck({ zones: activeDeck.zones.filter((z) => z.id !== zid) }); setSelectedId(null); if (zz) logEvent('Zone supprimée — ' + (zz.work || HAZARDS[zz.type].label.fr), 'Zone removed — ' + (zz.work || HAZARDS[zz.type].label.en)); }
  function preventScroll(e) { if (dragRef.current || resizingRef.current) { e.preventDefault(); } }
  function onResizeMove(e) {
    const r = resizingRef.current; if (!r || !planRef.current || !activeDeck) return;
    const rect = planRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const zone = activeDeck.zones.find((z) => z.id === r.zoneId); if (!zone) return;
    const w = Math.max(4, Math.min(100 - zone.x, px - zone.x));
    const h = Math.max(4, Math.min(100 - zone.y, py - zone.y));
    updateZone(r.zoneId, { w, h });
  }
  function endResize() { resizingRef.current = null; document.removeEventListener('touchmove', preventScroll); window.removeEventListener('pointermove', onResizeMove); window.removeEventListener('pointerup', endResize); }
  function startResize(e, z) { if (!canEdit) return; e.stopPropagation(); e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} resizingRef.current = { zoneId: z.id }; document.addEventListener('touchmove', preventScroll, { passive: false }); window.addEventListener('pointermove', onResizeMove); window.addEventListener('pointerup', endResize); }
  function onZoneMove(e) {
    const d = dragRef.current; if (!d || !planRef.current || !activeDeck) return;
    if (!d.moved && Math.abs(e.clientX - d.startPx) < 3 && Math.abs(e.clientY - d.startPy) < 3) return;
    d.moved = true; suppressClickRef.current = true;
    const dx = ((e.clientX - d.startPx) / d.rectW) * 100;
    const dy = ((e.clientY - d.startPy) / d.rectH) * 100;
    const zone = activeDeck.zones.find((z) => z.id === d.zoneId); if (!zone) return;
    const nx = Math.max(0, Math.min(100 - zone.w, d.origX + dx));
    const ny = Math.max(0, Math.min(100 - zone.h, d.origY + dy));
    updateZone(d.zoneId, { x: nx, y: ny });
  }
  function onZoneUp() { dragRef.current = null; document.removeEventListener('touchmove', preventScroll); window.removeEventListener('pointermove', onZoneMove); window.removeEventListener('pointerup', onZoneUp); setTimeout(() => { suppressClickRef.current = false; }, 60); }
  function onZonePointerDown(e, z) {
    e.stopPropagation(); setSelectedId(z.id);
    if (!canEdit || !planRef.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    const rect = planRef.current.getBoundingClientRect();
    dragRef.current = { zoneId: z.id, startPx: e.clientX, startPy: e.clientY, origX: z.x, origY: z.y, rectW: rect.width, rectH: rect.height, moved: false };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('pointermove', onZoneMove); window.addEventListener('pointerup', onZoneUp);
  }

  // Analyse IA d'un plan de navire (vision) avec repli hors-ligne
  function aiRoomToSvg(r) { const cl = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0)); return { x: 48 + cl(r.x, 0, 96) * 1.04, y: 26 + cl(r.y, 0, 96) * 2.4, w: Math.max(8, cl(r.w, 2, 100) * 1.04), h: Math.max(7, cl(r.h, 2, 100) * 2.4), fr: r.fr || r.en || '?', en: r.en || r.fr || '?' }; }
  function startAiImport() { if (!canEdit) return; if (aiInputRef.current) aiInputRef.current.click(); }
  function onAiFile(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setAiPhase('loading'); setAiResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => { const img = new Image(); img.onload = () => {
      const maxW = 1100, scale = Math.min(1, maxW / img.width); const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      analyzePlan(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    }; img.src = ev.target.result; };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  async function analyzePlan(b64) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: "Tu analyses un plan d'arrangement général de navire (General Arrangement). Identifie au plus 3 ponts distincts. Pour chaque pont: name (français court), layout parmi main|cabins|machinery|technical, compartments (max 8) avec fr, en, x, y, w, h en pourcentage 0-100 d'un rectangle de pont vertical (proue en haut), et suggestedZones (max 3) avec type parmi hot|confined|height|blast, x, y, w, h en pourcentage, workFr, workEn (description courte des travaux probables). Réponds UNIQUEMENT avec un JSON valide de la forme {\"decks\":[...]}. Aucun texte avant ou après, pas de backticks." }
        ] }] }),
      });
      const data = await res.json();
      const text = (data.content || []).map((i) => i.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (!parsed.decks || !parsed.decks.length) throw new Error('vide');
      setAiResult({ demo: false, decks: parsed.decks.slice(0, 3) }); setAiPhase('done');
    } catch (err) {
      setAiResult(AI_FALLBACK); setAiPhase('done');
    }
  }
  function applyAiResult() {
    if (!canEdit || !active || !aiResult) return;
    const valid = ['main', 'cabins', 'machinery', 'technical'];
    const cl = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const newDecks = aiResult.decks.map((d) => ({
      id: uid(), name: d.name || 'Pont (IA)', layout: valid.includes(d.layout) ? d.layout : 'main', planImage: null,
      aiRooms: (d.compartments || []).slice(0, 12).map(aiRoomToSvg),
      zones: (d.suggestedZones || []).slice(0, 4).filter((z) => HAZARDS[z.type]).map((z) => ({
        id: uid(), type: z.type, x: cl(z.x, 0, 84), y: cl(z.y, 0, 88), w: cl(z.w, 6, 40), h: cl(z.h, 5, 30),
        company: '', work: pick(lang, z.workFr || z.workEn || '', z.workEn || z.workFr || ''), status: 'planned', permit: null, atmo: null, entries: [],
        ...(z.type === 'confined' ? { interval: 12, checks: [] } : {}),
      })),
    }));
    markEdit(); updateActive({ decks: [...active.decks, ...newDecks] });
    setActiveDeckId(newDecks[0].id); setTab('plan'); setAiPhase(null); setAiResult(null);
    logEvent('Analyse IA du plan — ' + newDecks.length + ' pont(s) créés', 'AI plan analysis — ' + newDecks.length + ' deck(s) created');
  }

  function startDocImport(zoneId, kind) { if (!canEdit) return; uploadCtx.current = { zoneId, kind }; if (docInputRef.current) docInputRef.current.click(); }
  function onDocFile(e) {
    const file = e.target.files && e.target.files[0]; const ctx = uploadCtx.current;
    if (!file || !ctx) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const img = new Image(); img.onload = async () => {
      const maxW = 1000, scale = Math.min(1, maxW / img.width); const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
      if (ctx.kind === 'check') {
        const check = { id: uid(), ts: Date.now(), by: tx('Contrôleur', 'Operator'), fileName: file.name, synced: connected };
        if (connected) {
          const key = 'docfile:check:' + check.id;
          try { await window.storage.set(key, dataUrl, true); docCache.current[key] = dataUrl; } catch (err) {}
          markEdit();
          setShips((prev) => prev.map((s) => s.id !== activeId ? s : ({ ...s, decks: s.decks.map((d) => d.id !== activeDeck.id ? d : ({ ...d, zones: d.zones.map((z) => z.id !== ctx.zoneId ? z : ({ ...z, checks: [{ ...check, key }, ...(z.checks || [])] })) })) })));
          logEvent('Contrôle atmosphérique enregistré', 'Atmospheric check recorded');
        } else {
          setPending((p) => [{ id: check.id, shipId: activeId, deckId: activeDeck.id, zoneId: ctx.zoneId, check, dataUrl }, ...p]);
          logEvent('Contrôle enregistré hors-ligne (en attente de synchro)', 'Check recorded offline (awaiting sync)');
        }
        uploadCtx.current = null; return;
      }
      const key = 'docfile:' + ctx.zoneId + ':' + ctx.kind;
      try { await window.storage.set(key, dataUrl, true); docCache.current[key] = dataUrl; } catch (err) {}
      updateZone(ctx.zoneId, { [ctx.kind]: { name: file.name, key } });
      logEvent((ctx.kind === 'permit' ? 'Permis importé — ' : 'Document importé — ') + file.name, (ctx.kind === 'permit' ? 'Permit uploaded — ' : 'Document uploaded — ') + file.name);
      uploadCtx.current = null;
    }; img.src = ev.target.result; };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  async function openDoc(kind, obj) {
    setDocView({ kind, name: obj.name, data: null, loading: true });
    let data = obj.data || null;
    if (!data && obj.key) { if (docCache.current[obj.key]) data = docCache.current[obj.key]; else { try { const r = await window.storage.get(obj.key, true); if (r && r.value) { data = r.value; docCache.current[obj.key] = data; } } catch (e) {} } }
    setDocView({ kind, name: obj.name, data, loading: false });
  }
  function removeDoc(zoneId, kind) { if (!canEdit) return; updateZone(zoneId, { [kind]: null }); }
  function mergedChecks(zone) {
    const base = (zone.checks || []).map((c) => ({ ...c, pending: false }));
    const pend = pending.filter((p) => p.zoneId === zone.id).map((p) => ({ ...p.check, pending: true, data: p.dataUrl }));
    return base.concat(pend).sort((a, b) => b.ts - a.ts);
  }
  function atmoDue(zone) {
    const checks = mergedChecks(zone);
    if (!checks.length) return { state: 'none' };
    const last = checks[0].ts; const intervalMs = (zone.interval || 12) * 3600000;
    const due = last + intervalMs; const remaining = due - Date.now();
    return { state: remaining < 0 ? 'overdue' : 'ok', last, due, remaining };
  }
  function startCheckImport(zoneId) { if (!canEdit) return; uploadCtx.current = { zoneId, kind: 'check' }; if (docInputRef.current) docInputRef.current.click(); }

  // Registre d'accès : garde-fous + entrée/sortie (ouvert à tous les rôles — geste terrain)
  function zoneGate(z) {
    if (z.type === 'confined') { const d = atmoDue(z); if (d.state !== 'ok') return { ok: false, fr: d.state === 'overdue' ? 'Test atmosphérique expiré' : 'Aucun test atmosphérique valide', en: d.state === 'overdue' ? 'Atmospheric test expired' : 'No valid atmospheric test' }; }
    if (z.type === 'hot') { const has = crew && crew.fireWatch.some((f) => f.status === 'posted' && f.zoneId === z.id); if (!has) return { ok: false, fr: 'Aucun fire watch posté sur la zone', en: 'No fire watch posted on the zone' }; }
    return { ok: true };
  }
  function occupantsOf(z) { return (z.entries || []).filter((e) => !e.outAt); }
  function checkIn(zone) {
    const n = checkinName.trim(); if (!n) return;
    const g = zoneGate(zone);
    if (!g.ok) { setCheckinErr(g); logEvent('⛔ Entrée refusée — ' + n + ' (' + g.fr + ')', '⛔ Entry denied — ' + n + ' (' + g.en + ')'); return; }
    setCheckinErr(null); markEdit();
    const entry = { id: uid(), name: n, inAt: Date.now(), outAt: null };
    setShips((prev) => prev.map((s) => s.id !== activeId ? s : ({ ...s, decks: s.decks.map((d) => d.id !== activeDeck.id ? d : ({ ...d, zones: d.zones.map((z) => z.id !== zone.id ? z : ({ ...z, entries: [entry, ...(z.entries || [])] })) })) })));
    logEvent('Entrée en zone — ' + n + ' → ' + (zone.work || HAZARDS[zone.type].label.fr), 'Checked in — ' + n + ' → ' + (zone.work || HAZARDS[zone.type].label.en));
    setCheckinName('');
  }
  function checkOut(zone, entryId, name) {
    markEdit();
    setShips((prev) => prev.map((s) => s.id !== activeId ? s : ({ ...s, decks: s.decks.map((d) => d.id !== activeDeck.id ? d : ({ ...d, zones: d.zones.map((z) => z.id !== zone.id ? z : ({ ...z, entries: (z.entries || []).map((e) => e.id === entryId ? { ...e, outAt: Date.now() } : e) })) })) })));
    logEvent('Sortie de zone — ' + name, 'Checked out — ' + name);
  }

  function addFireWatch(name) { if (!canEdit) return; const n = (name || '').trim(); if (!n) return; updateCrew({ fireWatch: [...crew.fireWatch, { id: uid(), name: n, status: 'available', zoneId: null, since: null }] }); }
  function assignFireWatch(fwId, zoneId) { if (!canEdit) return; const f = crew.fireWatch.find((x) => x.id === fwId); const zz = hotZones.find((z) => z.id === zoneId); updateCrew({ fireWatch: crew.fireWatch.map((f2) => f2.id === fwId ? { ...f2, status: 'posted', zoneId, since: Date.now() } : f2) }); if (f) logEvent('Fire watch posté — ' + f.name + (zz ? ' → ' + (zz.work || 'zone à chaud') : ''), 'Fire watch posted — ' + f.name + (zz ? ' → ' + (zz.work || 'hot work zone') : '')); }
  function releaseFireWatch(fwId) { if (!canEdit) return; const f = crew.fireWatch.find((x) => x.id === fwId); updateCrew({ fireWatch: crew.fireWatch.map((f2) => f2.id === fwId ? { ...f2, status: 'available', zoneId: null, since: null } : f2) }); if (f) logEvent('Fire watch libéré — ' + f.name, 'Fire watch released — ' + f.name); }
  function removeFireWatch(fwId) { if (!canEdit) return; updateCrew({ fireWatch: crew.fireWatch.filter((f) => f.id !== fwId) }); }

  function locateZone(zoneId) {
    if (!active) return;
    const deck = active.decks.find((d) => d.zones.some((z) => z.id === zoneId));
    if (!deck) return;
    setActiveDeckId(deck.id); setSelectedId(zoneId); setTab('plan');
  }

  function tryLogin() { if (codeInput.trim() === COORD_CODE) { setRole('coordinator'); setShowLogin(false); setCodeInput(''); setCodeError(false); } else { setCodeError(true); } }
  function logout() { setRole('viewer'); setTool(null); }

  const C = { sel: 'var(--sel)', bg: 'var(--bg)', panel: 'var(--surface)', panel2: 'var(--surface-2)', fill: 'var(--fill)', line: 'var(--line)', accent: 'var(--accent)', accent2: 'var(--muted)', text: 'var(--ink)', dim: 'var(--ink-2)', green: 'var(--ok)', red: 'var(--danger)', amber: 'var(--warn)', blue: 'var(--info)' };
  function zoneColor(z) { return colorMode === 'company' && z.company ? companyColor(z.company, deckCompanies) : HAZARDS[z.type].color; }

  const TABS = [['overview', tx('Vue d\u2019ensemble', 'Overview'), LayoutDashboard], ['plan', tx('Plan', 'Plan'), MapIcon], ['3d', '3D', Box], ['works', tx('Travaux', 'Works'), HardHat], ['crew', tx('Équipe', 'Crew'), Users]];

  // Indicateurs et alertes agrégés (tous les ponts du navire actif)
  const statusCounts = { planned: 0, progress: 0, done: 0 };
  allZones.forEach((z) => { statusCounts[z.status] = (statusCounts[z.status] || 0) + 1; });
  const allConflicts = active ? active.decks.flatMap((d) => zoneConflicts(d.zones).map((c) => ({ ...c, deck: d.name }))) : [];
  const confinedAll = allZones.filter((z) => z.type === 'confined' && z.status !== 'done');
  const overdueTests = confinedAll.filter((z) => atmoDue(z).state === 'overdue');
  const untestedConfined = confinedAll.filter((z) => atmoDue(z).state === 'none');
  const hotNoFw = active ? allZones.filter((z) => z.type === 'hot' && z.status === 'progress' && !crew.fireWatch.some((f) => f.status === 'posted' && f.zoneId === z.id)) : [];
  const noPermitActive = allZones.filter((z) => z.status === 'progress' && !z.permit);
  const fwPosted = active ? crew.fireWatch.filter((f) => f.status === 'posted').length : 0;
  const fwAvail = active ? crew.fireWatch.length - fwPosted : 0;
  const todayStr = new Date().toDateString();
  const checksToday = allZones.flatMap((z) => z.checks || []).filter((c) => new Date(c.ts).toDateString() === todayStr).length + pending.filter((q) => new Date(q.check.ts).toDateString() === todayStr).length;
  const occupantsTotal = allZones.reduce((a, z) => a + (z.entries || []).filter((e) => !e.outAt).length, 0);
  const riskyOccupied = allZones.filter((z) => z.type === 'confined' && (z.entries || []).some((e) => !e.outAt) && atmoDue(z).state !== 'ok');
  const alertCount = allConflicts.length + overdueTests.length + hotNoFw.length + riskyOccupied.length;

  const introHold = intro && !introOut;
  useLayoutEffect(() => {
    const measure = () => { const el = tabsRef.current; if (!el) return; const b = el.querySelector('button[aria-pressed="true"]'); if (b) setThumb({ x: b.offsetLeft, w: b.offsetWidth }); };
    measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure);
  }, [tab, lang, introHold, activeId]);
  return (
    <>
    {intro && <IntroOverlay introOut={introOut} />}
    <div style={{ minHeight: '100vh', opacity: introHold ? 0 : 1, visibility: introHold ? 'hidden' : 'visible', transition: 'opacity 420ms cubic-bezier(0.23, 1, 0.32, 1)', color: C.text, fontFamily: 'var(--f-text)', backgroundColor: C.bg }}>
      <a href="#main" className="dd-skip">{tx('Aller au contenu', 'Skip to content')}</a>
      <input ref={docInputRef} type="file" accept="image/*" onChange={onDocFile} style={{ display: 'none' }} />
      <input ref={aiInputRef} type="file" accept="image/*" onChange={onAiFile} style={{ display: 'none' }} />
      <header className={'dd-nav' + (introHold ? '' : ' dd-rise')}>
        <div className="dd-nav-in">
          <span className="dd-appname">DryDock Safety</span>
          <div className="dd-nav-right">
            <button type="button" className="dd-status" onClick={() => { if (canEdit) setMenuOpen(true); else { setShowLogin(true); setCodeError(false); } }} aria-label={(connected ? (synced ? tx('En direct', 'Live') : 'Sync') : tx('Hors-ligne', 'Offline')) + ', ' + (canEdit ? tx('coordination', 'coordination') : tx('lecture seule, se connecter', 'view only, sign in'))}>
              <span className={'dot' + (!connected ? ' off' : synced ? '' : ' sync')} aria-hidden="true" />
              {connected ? (synced ? tx('En direct', 'Live') : 'Sync…') : tx('Hors-ligne', 'Offline')}
              {pending.length > 0 && <span className="cnt">{pending.length}</span>}
              <span className="sep" aria-hidden="true" />
              <span className="role">{canEdit ? <><Unlock size={13} aria-hidden="true" /><span className="role-t">{tx('Coordination', 'Coordination')}</span></> : <><Lock size={13} aria-hidden="true" /><span className="role-t">{tx('Lecture seule', 'View only')}</span></>}</span>
            </button>
            <button type="button" className="dd-iconbtn" aria-label={tx('Plus d\u2019options', 'More options')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}><MoreHorizontal size={19} strokeWidth={2.2} aria-hidden="true" /></button>
            {menuOpen && createPortal(<>
              <div className="dd-scrim" onClick={() => setMenuOpen(false)} />
              <div className="dd-menu" role="menu" aria-label={tx('Options', 'Options')}>
                <div className="hd">{tx('Navire', 'Vessel')}</div>
                {ships.map((sh) => (<button key={sh.id} type="button" role="menuitemradio" aria-checked={sh.id === activeId} className="it" onClick={() => { setActiveId(sh.id); setActiveDeckId(null); setSelectedId(null); setMenuOpen(false); }}><span className="ck">{sh.id === activeId && <Check size={17} strokeWidth={2.6} aria-hidden="true" />}</span><span className="tx">{sh.name}</span></button>))}
                {canEdit && <button type="button" role="menuitem" className="it" onClick={() => { setMenuOpen(false); addShip(); }}><span className="ck"><Plus size={17} aria-hidden="true" /></span><span className="tx">{tx('Nouveau navire', 'New vessel')}</span></button>}
                {canEdit && ships.length > 1 && active && <button type="button" role="menuitem" className="it danger" onClick={() => { setMenuOpen(false); deleteShip(active.id); }}><span className="ck"><Trash2 size={17} aria-hidden="true" /></span><span className="tx">{tx('Supprimer ce navire', 'Delete this vessel')}</span></button>}
                <div className="rule" />
                <div className="hd">{tx('Langue', 'Language')}</div>
                <div className="seg" role="group" aria-label={tx('Langue', 'Language')}>{[['bi', 'FR / EN'], ['en', 'EN'], ['bg', 'БГ']].map(([k, l]) => (<button key={k} type="button" aria-pressed={lang === k} className={lang === k ? 'on' : ''} onClick={() => setLang(k)}>{l}</button>))}</div>
                <div className="rule" />
                <button type="button" role="menuitemcheckbox" aria-checked={simOffline} className="it" onClick={() => setSimOffline((v) => !v)}><span className="tx">{tx('Simuler hors-ligne', 'Simulate offline')}</span><span className={'dd-switch' + (simOffline ? ' on' : '')} aria-hidden="true" /></button>
                <div className="it" style={{ cursor: 'default', color: 'var(--ink-2)', fontSize: '13px', minHeight: '32px' }}><Users size={15} aria-hidden="true" />{online} {tx(online > 1 ? 'personnes connectées' : 'personne connectée', online > 1 ? 'people online' : 'person online')}</div>
                <div className="rule" />
                {canEdit
                  ? <button type="button" role="menuitem" className="it" onClick={() => { setMenuOpen(false); logout(); }}><span className="ck"><LogOut size={17} aria-hidden="true" /></span><span className="tx">{tx('Quitter la coordination', 'Leave coordination')}</span></button>
                  : <button type="button" role="menuitem" className="it" onClick={() => { setMenuOpen(false); setShowLogin(true); setCodeError(false); }}><span className="ck"><LogIn size={17} aria-hidden="true" /></span><span className="tx">{tx('Accès coordination', 'Coordination access')}</span></button>}
              </div>
            </>, document.body)}
          </div>
        </div>
      </header>
      <style>{`
        /* Apple Pro, dark. True black ground, iOS grouped surfaces, SF type, glass only on floating
           chrome (nav, tab bar, menus). Colour carries status only; the primary action is white.
           Signature: the compliance ring on the overview. Motion: short ease-out, iOS drawer curve
           for sheets, press feedback on every control, hover only for fine pointers. */
        :root {
          --bg: #000000; --surface: #1c1c1e; --surface-2: #2c2c2e; --surface-3: #3a3a3c;
          --fill: rgba(118,118,128,0.24); --sel: #636366; --line: rgba(255,255,255,0.09); --sep: rgba(84,84,88,0.45);
          --ink: #ffffff; --ink-2: rgba(235,235,245,0.62); --muted: rgba(235,235,245,0.45);
          --accent: #ffffff; --on-accent: #000000; --accent-soft: rgba(255,255,255,0.12);
          --danger: #ff453a; --danger-ink: #ff6961; --danger-soft: rgba(255,69,58,0.16);
          --ok: #30d158; --ok-ink: #30d158; --ok-soft: rgba(48,209,88,0.16);
          --warn: #ff9f0a; --warn-ink: #ffb340; --warn-soft: rgba(255,159,10,0.16);
          --info: #0a84ff; --info-ink: #409cff; --line-strong: rgba(255,255,255,0.3);
          --glass: rgba(22,22,24,0.72);
          --f-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, sans-serif;
          --f-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif;
          --f-round: ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, Inter, sans-serif;
          --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
          color-scheme: dark;
        }
        html { -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
        body { background: var(--bg); color: var(--ink); font-family: var(--f-text); -webkit-font-smoothing: antialiased; }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
        @keyframes ddRise { from { opacity: 0; } to { opacity: 1; } }
        .dd-rise, .dd-rise-2 { animation: ddRise .35s ease-out both; }
        .dd-scan, .dd-sub, .dd-tape { display: none; }

        /* controls: one system */
        button { font-family: inherit; transition: transform 160ms var(--ease-out), background-color 150ms ease, color 150ms ease, opacity 150ms ease; }
        button:active { transform: scale(0.97); }
        button:disabled { cursor: not-allowed; opacity: .4; transform: none; }
        @media (hover: hover) and (pointer: fine) { button:hover { filter: brightness(1.15); } }
        :focus-visible { outline: 2px solid var(--info) !important; outline-offset: 2px; }
        #main select, .dd-sheet select { -webkit-appearance: none; appearance: none; background-color: var(--surface-2) !important; color: var(--ink) !important; border: 0 !important; border-radius: 10px !important; padding: 9px 34px 9px 12px !important; font-weight: 600; font-size: 14px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ebebf5' stroke-opacity='.6' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5M7 9l5-5 5 5'/%3E%3C/svg%3E") !important; background-repeat: no-repeat !important; background-position: right 11px center !important; }
        #main input[type=text], #main input:not([type]), #main input[type=number], #main input[type=password], .dd-sheet input[type=password], .dd-sheet input:not([type]) { background: var(--surface-2) !important; border: 1px solid transparent !important; border-radius: 10px !important; color: var(--ink) !important; }
        input:focus, select:focus { outline: none !important; box-shadow: 0 0 0 3px rgba(10,132,255,0.45) !important; }
        input::placeholder { color: var(--muted); }
        input[type=range], input[type=checkbox], input[type=radio] { accent-color: var(--info); }
        button, [role=button], select, a { touch-action: manipulation; }
        h1, h2, h3 { text-wrap: balance; }
        .dd-skip { position: fixed; left: 12px; top: -60px; z-index: 200; background: var(--ink); color: #000; font-weight: 600; padding: 10px 14px; border-radius: 10px; text-decoration: none; }
        .dd-skip:focus-visible { top: 12px; }
        ::selection { background: rgba(10,132,255,0.45); }

        /* nav bar: floating glass */
        .dd-nav { position: sticky; top: 0; z-index: 30; background: var(--glass); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%); box-shadow: 0 0.5px 0 var(--sep); }
        .dd-nav-in { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top)); }
        .dd-appname { font-family: var(--f-display); font-weight: 600; font-size: 17px; letter-spacing: -0.02em; color: var(--ink); white-space: nowrap; }
        .dd-nav-right { margin-left: auto; display: flex; align-items: center; gap: 8px; position: relative; }
        .dd-status { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 999px; border: 0; background: var(--fill); color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .dd-status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px rgba(48,209,88,0.22); }
        .dd-status .dot.sync { background: var(--warn); box-shadow: 0 0 0 3px rgba(255,159,10,0.22); }
        .dd-status .dot.off { background: var(--muted); box-shadow: none; }
        .dd-status .sep { width: 1px; height: 14px; background: var(--sep); }
        .dd-status .role { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-2); }
        .dd-status .cnt { min-width: 18px; height: 18px; border-radius: 9px; background: var(--warn); color: #000; font-size: 11px; display: inline-grid; place-items: center; padding: 0 5px; box-sizing: border-box; }
        .dd-iconbtn { width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--fill); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; }

        /* menu (pull-down) */
        .dd-scrim { position: fixed; inset: 0; z-index: 60; }
        .dd-menu { position: fixed; right: max(12px, calc((100vw - 1200px) / 2 + 16px)); top: calc(env(safe-area-inset-top, 0px) + 58px); z-index: 61; width: 290px; max-width: calc(100vw - 24px); max-height: min(70vh, 560px); overflow: auto; padding: 6px 0; border-radius: 14px; background: rgba(40,40,42,0.97); -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%); box-shadow: 0 0 0 0.5px rgba(255,255,255,0.12), 0 24px 60px rgba(0,0,0,0.55); transform-origin: top right; animation: ddPop 180ms var(--ease-out) both; overscroll-behavior: contain; }
        @keyframes ddPop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .dd-menu .hd { padding: 8px 16px 4px; font-size: 12px; color: var(--muted); }
        .dd-menu .it { box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 16px; border: 0; background: transparent; color: var(--ink); font-size: 15px; text-align: left; cursor: pointer; border-radius: 0; }
        .dd-menu .it:active { transform: none; background: rgba(255,255,255,0.08); }
        @media (hover: hover) and (pointer: fine) { .dd-menu .it:hover { filter: none; background: rgba(255,255,255,0.08); } }
        .dd-menu .it .ck { width: 18px; flex: none; color: var(--info); display: inline-flex; }
        .dd-menu .it .tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dd-menu .it.danger { color: var(--danger); }
        .dd-menu .rule { height: 6px; margin: 6px 0; background: rgba(0,0,0,0.25); }
        .dd-menu .seg { display: flex; margin: 4px 12px 8px; padding: 2px; border-radius: 9px; background: var(--fill); }
        .dd-menu .seg button { flex: 1; height: 30px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
        .dd-menu .seg button.on { background: var(--sel); box-shadow: 0 3px 8px rgba(0,0,0,0.25); }
        .dd-switch { margin-left: auto; width: 51px; height: 31px; border-radius: 16px; background: var(--fill); position: relative; flex: none; transition: background-color 200ms ease; }
        .dd-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.3); transition: transform 240ms var(--ease-out); }
        .dd-switch.on { background: var(--ok); } .dd-switch.on::after { transform: translateX(20px); }

        /* title row + segmented tabs with sliding thumb */
        .dd-large { font-family: var(--f-display) !important; font-size: 34px !important; font-weight: 700 !important; letter-spacing: -0.025em !important; line-height: 1.1 !important; }
        .dd-tabs { position: relative; display: flex; gap: 0 !important; padding: 2px !important; border-radius: 10px !important; background: var(--fill) !important; border: 0 !important; }
        .dd-tabs .thumb { position: absolute; top: 2px; bottom: 2px; left: 0; border-radius: 8px; background: var(--sel); box-shadow: 0 3px 8px rgba(0,0,0,0.25), 0 0.5px 0 rgba(255,255,255,0.12) inset; transition: transform 260ms var(--ease-out), width 260ms var(--ease-out); }
        .dd-tabs button { position: relative; z-index: 1; background: transparent !important; box-shadow: none !important; color: var(--ink) !important; font-size: 13px !important; padding: 6px 14px !important; }
        .dd-tabs button:active { transform: none; }

        /* overview */
        .dd-hero { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 22px; padding: 22px; border-radius: 22px; background: var(--surface); }
        .dd-ring { position: relative; width: 112px; height: 112px; flex: none; }
        .dd-ring svg { display: block; transform: rotate(-90deg); }
        .dd-ring .trk { stroke: rgba(255,255,255,0.1); }
        .dd-ring .val { transition: stroke-dashoffset 900ms var(--ease-out); }
        @starting-style { .dd-ring .val { stroke-dashoffset: 327; } }
        .dd-ring .ctr { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
        .dd-ring .pct { font-family: var(--f-round); font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; font-variant-numeric: tabular-nums; }
        .dd-ring .cap { font-size: 11px; color: var(--ink-2); margin-top: 2px; }
        .dd-hero-title { margin: 0; font-family: var(--f-display); font-size: 28px; font-weight: 700; letter-spacing: -0.022em; line-height: 1.12; }
        .dd-hero-sub { margin-top: 6px; font-size: 15px; line-height: 1.4; color: var(--ink-2); max-width: 60ch; overflow-wrap: anywhere; }
        .dd-hero-date { margin-top: 10px; font-size: 13px; color: var(--muted); }
        .dd-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; padding: 0 20px; border-radius: 23px; border: 0; background: #fff; color: #000; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer; white-space: nowrap; }
        .dd-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 22px; align-items: start; }
        .dd-group-hd { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px 16px; font-family: var(--f-display); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
        .dd-group-hd .n { font-size: 15px; font-weight: 600; color: var(--muted); }
        .dd-group { background: var(--surface); border-radius: 14px; overflow: hidden; }
        .dd-li { box-sizing: border-box; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 16px; border: 0; background: transparent; color: var(--ink); text-align: left; font-size: 15px; cursor: pointer; border-radius: 0; position: relative; }
        .dd-li + .dd-li::before { content: ""; position: absolute; top: 0; left: 52px; right: 0; height: 0.5px; background: var(--sep); }
        .dd-li.plain { cursor: default; padding-top: 12px; padding-bottom: 12px; align-items: flex-start; }
        .dd-li.plain + .dd-li.plain::before { left: 16px; }
        .dd-li:active { transform: none; background: rgba(255,255,255,0.06); }
        .dd-li.plain:active { background: transparent; }
        @media (hover: hover) and (pointer: fine) { button.dd-li:hover { filter: none; background: rgba(255,255,255,0.04); } }
        .dd-li .ic { width: 28px; height: 28px; flex: none; border-radius: 7px; display: grid; place-items: center; background: var(--surface-3); color: var(--ink); }
        .dd-li .lb { flex: 1; min-width: 0; line-height: 1.35; overflow-wrap: anywhere; }
        .dd-li .vl { font-family: var(--f-round); font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-2); }
        .dd-li .vl.red { color: var(--danger); } .dd-li .vl.orange { color: var(--warn); }
        .dd-li .chev { color: var(--muted); flex: none; }
        .dd-li .ic.red { background: var(--danger); color: #fff; } .dd-li .ic.orange { background: var(--warn); color: #000; }
        .dd-li.crit { background: var(--danger-soft); }
        .dd-li .tm { width: 92px; flex: none; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; padding-top: 1px; }
        .dd-foot { background: transparent !important; border: 0 !important; color: var(--muted) !important; font-size: 12px !important; }

        /* action sheet + sheets */
        .dd-action { width: 300px; max-width: 100%; display: flex; flex-direction: column; gap: 8px; animation: ddPopC 200ms var(--ease-out) both; }
        @keyframes ddPopC { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .dd-action .grp { background: rgba(44,44,46,0.92); -webkit-backdrop-filter: blur(30px); backdrop-filter: blur(30px); border-radius: 14px; overflow: hidden; }
        .dd-action .msg { padding: 14px 16px; text-align: center; font-size: 13px; color: var(--ink-2); border-bottom: 0.5px solid var(--sep); }
        .dd-action .msg small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
        .dd-action button { display: block; width: 100%; background: transparent; border: 0; padding: 16px; font-size: 17px; cursor: pointer; }
        .dd-action button:active { transform: none; background: rgba(255,255,255,0.08); }
        .dd-action .danger { color: var(--danger); }
        .dd-action .cancel { color: var(--info); font-weight: 600; }
        @keyframes ddSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes ddFade { from { opacity: 0; } to { opacity: 1; } }
        .dd-backdrop { animation: ddFade 200ms ease-out both; }
        .dd-sheet { animation: ddPopC 220ms var(--ease-out) both; }
        .dd-tabbar, .dd-seg { display: none; }

        @media (max-width: 768px) {
          button, [role=button], .dd-tabbar, .dd-status { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
          input, select, textarea { font-size: 16px !important; }
          .dd-tabs { display: none !important; }
          .dd-status .role-t { display: none; }
          .dd-nav-in { gap: 8px; }
          .dd-appname { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
          .dd-large { font-size: 32px !important; }
          .dd-hero { grid-template-columns: auto 1fr; gap: 16px; padding: 18px; }
          .dd-hero .dd-primary { grid-column: 1 / -1; width: 100%; }
          .dd-ring { width: 92px; height: 92px; } .dd-ring svg { width: 92px; height: 92px; }
          .dd-hero-title { font-size: 24px; }
          .dd-li { font-size: 17px; min-height: 50px; }
          #main { padding-bottom: calc(100px + env(safe-area-inset-bottom)) !important; }
          .dd-foot { padding-bottom: calc(100px + env(safe-area-inset-bottom)) !important; margin-top: 0 !important; }
          .dd-tabbar { display: flex; position: fixed; z-index: 40; left: max(14px, env(safe-area-inset-left)); right: max(14px, env(safe-area-inset-right)); bottom: calc(8px + env(safe-area-inset-bottom)); justify-content: space-around; padding: 4px; border-radius: 999px; background: rgba(30,30,32,0.7); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%); box-shadow: 0 0 0 0.5px rgba(255,255,255,0.14), 0 12px 32px rgba(0,0,0,0.5); }
          .dd-tabbar button { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; background: transparent; border: 0; color: var(--ink); padding: 6px 0 5px; border-radius: 999px; min-height: 54px; transition: background-color 200ms ease, color 200ms ease, transform 160ms var(--ease-out); }
          .dd-tabbar button:not(.on) { color: var(--ink-2); }
          .dd-tabbar button.on { background: rgba(255,255,255,0.13); color: #fff; }
          .dd-tabbar .ico { position: relative; display: inline-flex; }
          .dd-tabbar .badge { position: absolute; top: -4px; right: -10px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; background: #ff3b30; color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
          .dd-tabbar .lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.01em; }
          .dd-backdrop { align-items: flex-end !important; padding: 0 !important; }
          .dd-confirm-bd { padding: 0 8px calc(8px + env(safe-area-inset-bottom)) !important; }
          .dd-action { width: 100%; animation: ddSheetIn 420ms var(--ease-drawer) both; }
          .dd-sheet { width: 100% !important; max-width: 100% !important; max-height: 92vh !important; border-radius: 16px 16px 0 0 !important; padding-bottom: calc(16px + env(safe-area-inset-bottom)) !important; animation: ddSheetIn 420ms var(--ease-drawer) both; overflow: auto; position: relative; overscroll-behavior: contain; }
          .dd-sheet::before { content: ""; display: block; width: 36px; height: 5px; border-radius: 3px; background: rgba(235,235,245,0.3); margin: -8px auto 12px; }
          .dd-menu { position: fixed; top: auto; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); width: auto; max-width: none; border-radius: 18px; transform-origin: bottom center; animation: ddSheetIn 380ms var(--ease-drawer) both; }
          .dd-menu .it { min-height: 50px; font-size: 17px; }
          .dd-scrim { background: rgba(0,0,0,0.4); animation: ddFade 200ms ease-out both; }
        }
        @media (max-width: 640px) {
          button, select, input:not([type=file]) { min-height: 44px; }
          .dd-plan button, .dd-plan input, .dd-tabbar button, .dd-status, .dd-iconbtn, .dd-menu .seg button { min-height: 0; }
          .dd-cols { grid-template-columns: 1fr; }
        }
        @keyframes ddAlert { 0%,100% { box-shadow: 0 0 0 2px #ff453a; } 50% { box-shadow: 0 0 0 5px rgba(255,69,58,.35); } }
        @keyframes ddCrit { 0%,100% { background: var(--danger-soft); } 50% { background: rgba(255,69,58,0.26); } }
        .dd-plan { box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.1); }
        #main div[style*="border: 1px solid var(--line)"] { border-color: transparent !important; }
        #main div[style*="dashed"] { border-color: transparent !important; background: var(--surface) !important; }
        #main button[style*="border: 1px solid var(--line)"] { border-color: transparent !important; background-color: var(--fill) !important; }
        @media (prefers-reduced-transparency: reduce) { .dd-nav, .dd-tabbar, .dd-menu { background: #1c1c1e !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } }
        @media (prefers-reduced-motion: reduce) { .dd-rise, .dd-rise-2, .dd-menu, .dd-sheet, .dd-action { animation: ddFade 150ms ease both !important; } .dd-tabs .thumb, .dd-ring .val { transition: none; } *,*::before,*::after { animation-iteration-count: 1 !important; scroll-behavior: auto !important; } }
      `}</style>

      {showLogin && (
        <div className="dd-backdrop" onClick={() => setShowLogin(false)} style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div className="dd-sheet" role="dialog" aria-modal="true" aria-label={tx('Accès coordination', 'Coordination access')} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '22px', width: '320px', maxWidth: '100%' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>{tx('Accès coordination', 'Coordination access')}</div>
            <div style={{ fontSize: '12px', color: C.dim, marginBottom: '14px' }}>{tx('Réservé à la coordination du chantier.', 'Restricted to site coordination.')}</div>
            <input type="password" name="access-code" autoComplete="current-password" spellCheck={false} aria-label={tx("Code d'accès", 'Access code')} value={codeInput} autoFocus onChange={(e) => { setCodeInput(e.target.value); setCodeError(false); }} onKeyDown={(e) => { if (e.key === 'Enter') tryLogin(); }} placeholder={tx("Code d'accès", 'Access code') + '…'} style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.text, border: `1px solid ${codeError ? 'var(--danger)' : C.line}`, borderRadius: '8px', padding: '11px 12px', fontSize: '15px', marginBottom: codeError ? '6px' : '14px' }} />
            {codeError && <div role="alert" style={{ fontSize: '12px', color: 'var(--danger-ink)', marginBottom: '12px' }}>{tx('Code incorrect.', 'Wrong code.')}</div>}
            <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => setShowLogin(false)} style={{ flex: 1, background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer' }}>{tx('Annuler', 'Cancel')}</button><button onClick={tryLogin} style={{ flex: 1, background: C.accent, color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{tx('Déverrouiller', 'Unlock')}</button></div>
          </div>
        </div>
      )}

      {showReport && active && (
        <div className="dd-backdrop" onClick={() => setShowReport(false)} style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: '18px' }}>
          <div className="dd-sheet" role="dialog" aria-modal="true" aria-label={tx('Rapport journalier', 'Daily report')} onClick={(e) => e.stopPropagation()} style={{ overscrollBehavior: 'contain', background: '#fff', color: '#11283c', borderRadius: '18px', width: '600px', maxWidth: '100%', maxHeight: '92vh', overflow: 'auto', fontFamily: 'Georgia, serif' }}>
            <div style={{ padding: '20px 24px', borderBottom: '3px solid ' + BRAND_INK, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>{tx('Rapport journalier de sécurité', 'Daily safety report')}</div>
                <div style={{ fontSize: '12px', marginTop: '2px', color: '#5b7288' }}>{active.name} · {new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'bg' ? 'bg-BG' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
              <button onClick={() => setShowReport(false)} style={{ background: 'transparent', border: '1px solid #c9d6e2', color: '#11283c', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>{tx('Fermer', 'Close')}</button>
            </div>
            <div style={{ padding: '18px 24px', fontSize: '13.5px', lineHeight: 1.55 }}>
              <p style={{ margin: '0 0 10px' }}><strong>{tx('Coordination', 'Coordination')} :</strong> {crew.coordinator || '—'}{crew.assistant ? ' · ' + tx('Assistant', 'Assistant') + ' : ' + crew.assistant : ''}</p>
              <p style={{ margin: '0 0 14px' }}><strong>{tx('Travaux', 'Works')} :</strong> {statusCounts.progress || 0} {tx('en cours', 'in progress')}, {statusCounts.planned || 0} {tx('planifiés', 'planned')}, {statusCounts.done || 0} {tx('terminés', 'completed')} · <strong>{tx('Présents en zone', 'People in zones')} :</strong> {occupantsTotal} · <strong>{tx('Contrôles atmo aujourd\u2019hui', 'Atmo checks today')} :</strong> {checksToday} · <strong>Fire watch :</strong> {fwPosted}/{fwPosted + fwAvail} {tx('postés', 'posted')}</p>
              <div style={{ fontSize: '12px', letterSpacing: '1.5px', color: BRAND_INK, fontWeight: 700, fontFamily: 'Arial, sans-serif', borderBottom: '1px solid #dde6ee', paddingBottom: '4px', marginBottom: '8px' }}>{tx('POINTS DE VIGILANCE', 'ATTENTION POINTS')}</div>
              {(riskyOccupied.length + allConflicts.length + overdueTests.length + hotNoFw.length + untestedConfined.length + noPermitActive.length) === 0 ? <p style={{ margin: '0 0 14px', color: '#1d7a3e' }}>✓ {tx('Aucun point de vigilance — chantier conforme au moment du rapport.', 'No attention points — site compliant at report time.')}</p> : (
                <ul style={{ margin: '0 0 14px', paddingLeft: '20px' }}>
                  {riskyOccupied.map((z, i) => <li key={'r' + i} style={{ color: '#b3261e', fontWeight: 700 }}>{tx('CRITIQUE — personne en espace confiné avec test expiré', 'CRITICAL — person in confined space with expired test')} — {z.work || 'zone'}</li>)}
                  {allConflicts.map((c, i) => <li key={'c' + i} style={{ color: '#b3261e' }}>{tx('Conflit', 'Conflict')} ({c.deck}) : {(c.z1.work || pick(lang, HAZARDS[c.z1.type].label.fr, HAZARDS[c.z1.type].label.en))} ↔ {(c.z2.work || pick(lang, HAZARDS[c.z2.type].label.fr, HAZARDS[c.z2.type].label.en))}</li>)}
                  {overdueTests.map((z, i) => <li key={'o' + i} style={{ color: '#b3261e' }}>{tx('Test atmosphérique en retard', 'Atmospheric test overdue')} — {z.work || tx('espace confiné', 'confined space')}</li>)}
                  {hotNoFw.map((z, i) => <li key={'h' + i} style={{ color: '#b3261e' }}>{tx('Travaux à chaud sans fire watch', 'Hot work without fire watch')} — {z.work || 'zone'}</li>)}
                  {untestedConfined.map((z, i) => <li key={'u' + i} style={{ color: '#9a6b00' }}>{tx('Espace confiné jamais testé', 'Confined space never tested')} — {z.work || 'zone'}</li>)}
                  {noPermitActive.map((z, i) => <li key={'p' + i} style={{ color: '#9a6b00' }}>{tx('Permis manquant', 'Missing permit')} — {z.work || pick(lang, HAZARDS[z.type].label.fr, HAZARDS[z.type].label.en)}</li>)}
                </ul>
              )}
              <div style={{ fontSize: '12px', letterSpacing: '1.5px', color: BRAND_INK, fontWeight: 700, fontFamily: 'Arial, sans-serif', borderBottom: '1px solid #dde6ee', paddingBottom: '4px', marginBottom: '8px' }}>{tx('JOURNAL DES OPÉRATIONS', 'OPERATIONS LOG')}</div>
              {(active.log || []).filter((l) => new Date(l.ts).toDateString() === new Date().toDateString()).length === 0 ? <p style={{ margin: 0, color: '#5b7288' }}>{tx('Aucune opération enregistrée aujourd\u2019hui.', 'No operation recorded today.')}</p> : (active.log || []).filter((l) => new Date(l.ts).toDateString() === new Date().toDateString()).map((l) => (<div key={l.id} style={{ display: 'flex', gap: '12px', padding: '3px 0', fontSize: '12.5px' }}><span style={{ color: '#5b7288', fontFamily: 'ui-monospace, monospace' }}>{fmtClock(l.ts, lang)}</span><span>{pick(lang, l.fr, l.en)}</span></div>))}
              <p style={{ margin: '16px 0 0', fontSize: '11px', color: '#8194a6', fontStyle: 'italic' }}>{tx('Aperçu de démonstration — la version production exporte ce rapport en PDF signé et archivé.', 'Demo preview — the production version exports this report as a signed, archived PDF.')}</p>
            </div>
          </div>
        </div>
      )}

      {aiPhase && (
        <div className="dd-backdrop" onClick={() => { if (aiPhase !== 'loading') { setAiPhase(null); setAiResult(null); } }} style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: '18px' }}>
          <div className="dd-sheet" role="dialog" aria-modal="true" aria-label={tx('Analyse IA du plan', 'AI plan analysis')} onClick={(e) => e.stopPropagation()} style={{ overscrollBehavior: 'contain', background: C.panel, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '20px', width: '460px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{tx('Analyse IA du plan', 'AI plan analysis')}</div>
            {aiPhase === 'loading' && (
              <div style={{ padding: '18px 0' }}>
                <div style={{ fontSize: '13px', color: C.dim, marginBottom: '12px', animation: 'pulse 1.6s infinite' }}>{tx('Lecture du plan d\u2019arrangement général…', 'Reading the general arrangement plan…')}</div>
                <div style={{ fontSize: '12px', color: C.dim, lineHeight: 1.9 }}>
                  <div>① {tx('Identification des ponts', 'Identifying decks')}</div>
                  <div>② {tx('Découpage des compartiments', 'Mapping compartments')}</div>
                  <div>③ {tx('Proposition de zones de danger', 'Suggesting hazard zones')}</div>
                </div>
              </div>
            )}
            {aiPhase === 'done' && aiResult && (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--ok-ink)', margin: '6px 0 12px' }}>✓ {aiResult.decks.length} {tx('pont(s) détecté(s)', 'deck(s) detected')}</div>
                {aiResult.demo && <div style={{ fontSize: '11px', color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid #eab308', borderRadius: '8px', padding: '8px 10px', marginBottom: '12px' }}>⚠ {tx('API indisponible ici — résultat d\u2019exemple (pétrolier) pour illustrer le fonctionnement.', 'API unavailable here — sample result (tanker) to illustrate the workflow.')}</div>}
                {aiResult.decks.map((d, i) => (
                  <div key={i} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '10px 12px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{d.name}</div>
                    <div style={{ fontSize: '11px', color: C.dim, marginTop: '2px' }}>{(d.compartments || []).length} {tx('compartiments', 'compartments')} · {(d.suggestedZones || []).length} {tx('zones de danger proposées', 'suggested hazard zones')}</div>
                    {(d.suggestedZones || []).map((z, j) => HAZARDS[z.type] ? (<div key={j} style={{ fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: HAZARDS[z.type].color }} />{pick(lang, z.workFr || z.workEn, z.workEn || z.workFr)}</div>) : null)}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button onClick={() => { setAiPhase(null); setAiResult(null); }} style={{ flex: 1, background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer' }}>{tx('Annuler', 'Cancel')}</button>
                  <button onClick={applyAiResult} style={{ flex: 1, background: C.accent, color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{tx('Créer les ponts', 'Create decks')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {docView && (
        <div className="dd-backdrop" onClick={() => setDocView(null)} style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }}>
          <div className="dd-sheet" role="dialog" aria-modal="true" aria-label={docView.name} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '16px', width: '560px', maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ fontSize: '14px', fontWeight: 700 }}>{docView.kind === 'permit' ? tx('Permis de travail', 'Work permit') : tx('Test atmosphérique', 'Atmospheric test')}<span style={{ color: C.dim, fontWeight: 400 }}> · {docView.name}</span></div><button onClick={() => setDocView(null)} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.text, borderRadius: '6px', padding: '4px 10px', fontSize: '13px', cursor: 'pointer' }}>{tx('Fermer', 'Close')}</button></div>
            <div style={{ overflow: 'auto', background: '#fff', borderRadius: '8px' }}>{docView.loading ? <div style={{ padding: '40px', textAlign: 'center', color: C.dim }}>{tx('Chargement…', 'Loading…')}</div> : docView.data ? <img src={docView.data} alt={docView.name} style={{ width: '100%', display: 'block' }} /> : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>{tx('Document indisponible.', 'Document unavailable.')}</div>}</div>
          </div>
        </div>
      )}

      {!active ? (<div style={{ padding: '60px 20px', textAlign: 'center', color: C.dim }}><div style={{ fontSize: '44px', marginBottom: '12px' }}>🚢</div><p>{tx('Aucun navire.', 'No vessel.')}</p></div>) : (
        <div id="main" role="main" tabIndex={-1} className={introHold ? '' : 'dd-rise-2'} style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            {canEdit ? <input aria-label={tx('Nom du navire', 'Vessel name')} value={active.name} onChange={(e) => updateActive({ name: e.target.value })} className="dd-title dd-large" style={{ background: 'transparent', color: C.text, border: 'none', borderBottom: `2px solid ${C.line}`, fontSize: '24px', fontWeight: 700, padding: '4px 2px', minWidth: '180px' }} /> : <h1 className="dd-title dd-large" style={{ margin: 0, fontSize: '24px', fontWeight: 700, letterSpacing: '-0.3px', padding: '4px 2px' }}>{active.name}</h1>}
            <div ref={tabsRef} className="dd-tabs" style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', padding: '3px', background: C.panel, border: `1px solid ${C.line}`, borderRadius: '12px' }}>
              {thumb && <span className="thumb" aria-hidden="true" style={{ width: thumb.w + 'px', transform: 'translateX(' + thumb.x + 'px)' }} />}
              {TABS.map(([k, lbl, Ico]) => (<button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', position: 'relative', background: tab === k ? C.fill : 'transparent', color: tab === k ? C.text : C.dim, border: 'none', borderRadius: '9px', padding: '7px 13px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: tab === k ? '0 1px 2px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06)' : 'none' }}><Ico size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'currentColor' }} />{lbl}{k === 'overview' && alertCount > 0 && <span style={{ position: 'absolute', top: '-7px', right: '-7px', background: '#dc2626', color: '#fff', borderRadius: '14px', minWidth: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, padding: '0 4px', boxShadow: '0 0 0 2px #0a0b0d' }}>{alertCount}</span>}</button>))}
            </div>
          </div>

          {tab === 'plan' && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 460px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <select aria-label={bi('Pont', 'Deck')} value={activeDeck.id} onChange={(e) => { setActiveDeckId(e.target.value); setSelectedId(null); }} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontWeight: 600, maxWidth: '220px' }}>
                    {active.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {canEdit && <input aria-label={tx('Nom du pont', 'Deck name')} value={activeDeck.name} onChange={(e) => updateDeck({ name: e.target.value })} placeholder={tx('Nom du pont', 'Deck name') + '…'} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '12px', width: '150px' }} />}
                  {canEdit && <select value={activeDeck.layout || 'main'} onChange={(e) => updateDeck({ layout: e.target.value })} aria-label={tx('Type de pont (schéma)', 'Deck type (schematic)')} title={tx('Type de pont (schéma)', 'Deck type (schematic)')} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '12px' }}><option value="main">{tx('Type : Général', 'Type: General')}</option><option value="cabins">{tx('Type : Cabines', 'Type: Cabins')}</option><option value="machinery">{tx('Type : Machines', 'Type: Machinery')}</option><option value="technical">{tx('Type : Technique', 'Type: Technical')}</option></select>}
                  {canEdit && <button onClick={addDeck} style={{ background: C.fill, color: C.text, border: 'none', borderRadius: '8px', padding: '8px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{tx('+ Pont', '+ Deck')}</button>}
                  {canEdit && active.decks.length > 1 && <button onClick={deleteDeck} style={{ background: 'transparent', color: 'var(--danger)', border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '12px', cursor: 'pointer' }}>🗑 {tx('Pont', 'Deck')}</button>}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                  {canEdit && <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: C.fill, color: C.text, border: 'none', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{tx('Importer le plan du pont', 'Import deck plan')}</button>}
                  {canEdit && <button onClick={startAiImport} style={{ background: 'linear-gradient(120deg, #1e6fb8, #0e4a80)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{tx('Analyser un plan (IA)', 'Analyse a plan (AI)')}</button>}
                  {canEdit && activeDeck.planImage && (<button onClick={() => updateDeck({ planImage: null })} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 12px', fontSize: '12px', cursor: 'pointer' }}>{tx('Retirer', 'Remove')}</button>)}
                  <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: '8px', overflow: 'hidden' }}>{[['hazard', tx('Par danger', 'By hazard')], ['company', tx('Par compagnie', 'By company')]].map(([k, lbl]) => (<button key={k} onClick={() => setColorMode(k)} style={{ background: colorMode === k ? C.sel : 'transparent', color: colorMode === k ? C.text : C.dim, border: 'none', padding: '8px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{lbl}</button>))}</div>
                </div>
                <div style={{ fontSize: '11px', color: C.dim, marginBottom: '8px' }}>{!canEdit ? tx('Consultation — touchez une zone pour voir le détail', 'View-only — tap a zone to see details') : (tool ? tx('→ Cliquez sur le plan pour placer : ', '→ Tap the plan to place: ') + pick(lang, HAZARDS[tool].label.fr, HAZARDS[tool].label.en) : tx('Choisissez un danger à droite, puis cliquez sur le plan', 'Pick a hazard on the right, then tap the plan'))}</div>
                {deckConflicts.length > 0 && (
                  <div style={{ background: 'var(--danger-soft)', border: '1px solid #ef4444', borderRadius: '14px', padding: '10px 12px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--danger-ink)', marginBottom: '4px' }}>⚠ {tx('Conflits de travaux détectés', 'Work conflicts detected')} ({deckConflicts.length})</div>
                    {deckConflicts.map((c, i) => (<div key={i} style={{ fontSize: '11px', color: 'var(--danger-ink)', marginBottom: '2px' }}>• {(c.z1.work || pick(lang, HAZARDS[c.z1.type].label.fr, HAZARDS[c.z1.type].label.en))} ↔ {(c.z2.work || pick(lang, HAZARDS[c.z2.type].label.fr, HAZARDS[c.z2.type].label.en))} — {pick(lang, c.rule.fr, c.rule.en)}</div>))}
                  </div>
                )}

                <div ref={planRef} onClick={handlePlanClick} className="dd-plan" style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', background: '#0b0b0c', border: `1px solid ${C.line}`, borderRadius: '18px', overflow: 'hidden', cursor: tool ? 'crosshair' : 'default' }}>
                  {activeDeck.planImage ? (<img src={activeDeck.planImage} alt="plan" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />) : (<DeckSchematic layout={activeDeck.layout} lang={lang} aiRooms={activeDeck.aiRooms} />)}
                  {activeDeck.zones.map((z) => {
                    const col = zoneColor(z), sel = selectedId === z.id, st = STATUS[z.status];
                    const fwHere = z.type === 'hot' && crew.fireWatch.some((f) => f.status === 'posted' && f.zoneId === z.id);
                    return (
                      <div key={z.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={(z.work || pick(lang, HAZARDS[z.type].label.fr, HAZARDS[z.type].label.en)) + (z.company ? ' — ' + z.company : '')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(z.id); } }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => onZonePointerDown(e, z)} style={{ position: 'absolute', left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, background: col + (sel ? 'd9' : '99'), border: `2px solid ${col}`, borderRadius: '4px', cursor: canEdit ? 'move' : 'pointer', touchAction: canEdit ? 'none' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', fontSize: '10px', lineHeight: 1.15, fontWeight: 700, color: 'var(--on-accent)', textAlign: 'center', padding: '2px', overflow: 'hidden', boxShadow: sel ? '0 0 0 2px #fff' : 'none', animation: !sel && conflictIds.has(z.id) ? 'ddAlert 1.8s ease-in-out infinite' : 'none' }}>
                        <span>{conflictIds.has(z.id) && '⚠ '}{z.company || pick(lang, HAZARDS[z.type].label.fr, HAZARDS[z.type].label.en)}</span>
                        <span style={{ display: 'flex', gap: '2px', alignItems: 'center' }}><span style={{ background: st.color, color: '#fff', borderRadius: '3px', padding: '0 4px', fontSize: '9px' }}>{pick(lang, st.fr, st.en)}</span>{z.permit && <span style={{ fontSize: '8px' }}>📄</span>}{z.type === 'confined' && z.status !== 'done' && (() => { const dz = atmoDue(z); const dc = dz.state === 'overdue' ? 'var(--danger)' : dz.state === 'ok' ? '#16a34a' : 'var(--muted)'; return <span style={{ fontSize: '8px', display: 'inline-flex', alignItems: 'center', gap: '1px' }}>🫁<span style={{ width: '5px', height: '5px', borderRadius: '50%', background: dc }} /></span>; })()}{fwHere && <span style={{ fontSize: '8px' }}>🧯</span>}{(z.entries || []).filter((e) => !e.outAt).length > 0 && <span style={{ fontSize: '7.5px', background: 'var(--info)', borderRadius: '3px', padding: '0 3px', color: 'var(--on-accent)' }}>👤{(z.entries || []).filter((e) => !e.outAt).length}</span>}</span>
                        {canEdit && sel && (<div onPointerDown={(e) => startResize(e, z)} onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: '1px', bottom: '1px', width: '13px', height: '13px', background: '#fff', border: `2px solid ${col}`, borderRadius: '3px', cursor: 'nwse-resize', touchAction: 'none' }} />)}
                      </div>
                    );
                  })}
                </div>
                {colorMode === 'company' && deckCompanies.length > 0 && (<div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{deckCompanies.map((c) => (<span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: companyColor(c, deckCompanies) }} />{c}</span>))}</div>)}
              </div>

              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {canEdit && <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '14px' }}><div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: C.text }}>{tx('Ajouter une zone', 'Add a zone')}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>{Object.entries(HAZARDS).map(([key, h]) => (<button key={key} onClick={() => setTool(tool === key ? null : key)} style={{ background: tool === key ? h.color : 'transparent', color: tool === key ? 'var(--on-accent)' : C.text, border: `1.5px solid ${h.color}`, borderRadius: '8px', padding: '9px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}><span style={{ display: 'inline-block', width: '10px', height: '10px', background: h.color, borderRadius: '50%', marginRight: '6px' }} />{lang !== 'bi' ? pick(lang, h.label.fr, h.label.en) : <>{h.label.fr}<br /><span style={{ opacity: 0.6, fontSize: '10px' }}>{h.label.en}</span></>}</button>))}</div></div>}

                {selectedZone ? (() => {
                  const h = HAZARDS[selectedZone.type];
                  const fwHere = crew.fireWatch.filter((f) => f.status === 'posted' && f.zoneId === selectedZone.id);
                  return (
                    <div style={{ background: C.panel, border: `2px solid ${h.color}`, borderRadius: '18px', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ fontSize: '13px', fontWeight: 700, color: h.color }}>{lang !== 'bi' ? pick(lang, h.label.fr, h.label.en) : <>{h.label.fr} <span style={{ opacity: 0.55, fontWeight: 400 }}>/ {h.label.en}</span></>}</div>{canEdit && <button onClick={() => removeZone(selectedZone.id)} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: 'var(--danger)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>{tx('Supprimer', 'Delete')}</button>}</div>
                      {(() => { const my = deckConflicts.filter((c) => c.z1.id === selectedZone.id || c.z2.id === selectedZone.id); return my.length ? (<div style={{ background: 'var(--danger-soft)', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>{my.map((c, i) => { const other = c.z1.id === selectedZone.id ? c.z2 : c.z1; return (<div key={i} style={{ fontSize: '11px', color: 'var(--danger-ink)', marginBottom: i < my.length - 1 ? '4px' : 0 }}>⚠ {tx('Conflit avec', 'Conflict with')} « {other.work || pick(lang, HAZARDS[other.type].label.fr, HAZARDS[other.type].label.en)} » — {pick(lang, c.rule.fr, c.rule.en)}</div>); })}</div>) : null; })()}
                      <label style={{ fontSize: '11px', color: C.dim, display: 'block', marginBottom: '4px' }}>{bi('Compagnie', 'Company')}</label>
                      {canEdit ? <input value={selectedZone.company} onChange={(e) => updateZone(selectedZone.id, { company: e.target.value })} placeholder={tx('ex : Allied Welding', 'e.g. Allied Welding')} style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '13px', marginBottom: '10px' }} /> : <div style={{ fontSize: '13px', padding: '8px 0', marginBottom: '4px' }}>{selectedZone.company || '—'}</div>}
                      <label style={{ fontSize: '11px', color: C.dim, display: 'block', marginBottom: '4px' }}>{bi('Travaux', 'Work')}</label>
                      {canEdit ? <input value={selectedZone.work} onChange={(e) => updateZone(selectedZone.id, { work: e.target.value })} placeholder={tx('ex : Sablage carène', 'e.g. Hull blasting')} style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '8px 10px', fontSize: '13px', marginBottom: '10px' }} /> : <div style={{ fontSize: '13px', padding: '8px 0', marginBottom: '4px' }}>{selectedZone.work || '—'}</div>}
                      <label style={{ fontSize: '11px', color: C.dim, display: 'block', marginBottom: '4px' }}>{bi('Statut', 'Status')}</label>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>{canEdit ? Object.entries(STATUS).map(([k, s]) => (<button key={k} onClick={() => updateZone(selectedZone.id, { status: k })} style={{ flex: 1, background: selectedZone.status === k ? s.color : 'transparent', color: selectedZone.status === k ? '#fff' : C.dim, border: `1px solid ${s.color}`, borderRadius: '6px', padding: '6px 4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>{pick(lang, s.fr, s.en)}</button>)) : <span style={{ background: STATUS[selectedZone.status].color, color: '#fff', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: 600 }}>{pick(lang, STATUS[selectedZone.status].fr, STATUS[selectedZone.status].en)}</span>}</div>

                      {canEdit && (<div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '10px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: C.dim, marginBottom: '6px', fontWeight: 700 }}>{bi('Taille de la zone', 'Zone size')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><span style={{ fontSize: '11px', color: C.dim, width: '56px' }}>{tx('Largeur', 'Width')}</span><input type="range" min="4" max="80" value={selectedZone.w} onChange={(e) => updateZone(selectedZone.id, { w: Math.max(4, Math.min(100 - selectedZone.x, Number(e.target.value))) })} style={{ flex: 1 }} /><span style={{ fontSize: '11px', color: C.text, width: '34px', textAlign: 'right' }}>{Math.round(selectedZone.w)}%</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '11px', color: C.dim, width: '56px' }}>{tx('Hauteur', 'Height')}</span><input type="range" min="4" max="80" value={selectedZone.h} onChange={(e) => updateZone(selectedZone.id, { h: Math.max(4, Math.min(100 - selectedZone.y, Number(e.target.value))) })} style={{ flex: 1 }} /><span style={{ fontSize: '11px', color: C.text, width: '34px', textAlign: 'right' }}>{Math.round(selectedZone.h)}%</span></div>
                        <div style={{ fontSize: '10px', color: C.dim, marginTop: '6px', fontStyle: 'italic' }}>{tx('Astuce : on peut aussi tirer le coin blanc de la zone sur le plan.', 'Tip: you can also drag the white corner of the zone on the plan.')}</div>
                      </div>)}
                      {(() => {
                        const occ = occupantsOf(selectedZone); const gate = zoneGate(selectedZone);
                        return (
                          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '10px', marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--info-ink)', marginBottom: '6px', fontWeight: 700 }}>🚪 {bi('Registre d\u2019accès', 'Access register')}{occ.length > 0 && <span style={{ marginLeft: '6px', background: 'var(--info)', color: 'var(--on-accent)', borderRadius: '8px', padding: '0 6px', fontSize: '10px' }}>👤 {occ.length}</span>}</div>
                            {occ.length === 0 && <div style={{ fontSize: '12px', color: C.dim, marginBottom: '6px' }}>{tx('Personne dans la zone.', 'Nobody in the zone.')}</div>}
                            {occ.map((e) => (<div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '4px' }}><span style={{ flex: 1 }}>👤 {e.name} <span style={{ color: C.dim }}>· {tx('depuis', 'since')} {fmtDur(e.inAt, lang)}</span></span><button onClick={() => checkOut(selectedZone, e.id, e.name)} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: 'var(--info-ink)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', cursor: 'pointer' }}>{tx('Sortie', 'Check-out')}</button></div>))}
                            {!gate.ok && <div style={{ fontSize: '11px', color: 'var(--danger-ink)', marginBottom: '6px' }}>⛔ {tx('Conditions non remplies : ', 'Conditions not met: ')}{pick(lang, gate.fr, gate.en)}</div>}
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input value={checkinName} onChange={(e) => { setCheckinName(e.target.value); setCheckinErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') checkIn(selectedZone); }} placeholder={tx('Nom de l\u2019intervenant…', 'Worker name…')} style={{ flex: 1, minWidth: '100px', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '7px', padding: '8px 10px', fontSize: '12px' }} />
                              <button onClick={() => checkIn(selectedZone)} style={{ background: gate.ok ? 'var(--info)' : '#475569', color: 'var(--on-accent)', border: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{tx('Entrée', 'Check-in')}</button>
                            </div>
                            {checkinErr && <div style={{ fontSize: '11px', color: 'var(--danger-ink)', marginTop: '6px' }}>⛔ {tx('Entrée refusée et journalisée — ', 'Entry denied and logged — ')}{pick(lang, checkinErr.fr, checkinErr.en)}</div>}
                          </div>
                        );
                      })()}
                      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '10px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: C.text, marginBottom: '6px', fontWeight: 700 }}>{bi('Permis de travail', 'Work permit')}</div>
                        {selectedZone.permit ? (<div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}><button onClick={() => openDoc('permit', selectedZone.permit)} style={{ background: C.fill, color: C.text, border: 'none', borderRadius: '7px', padding: '7px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>{tx('Voir le permis', 'View permit')}</button><span style={{ fontSize: '11px', color: C.dim, flex: 1, minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedZone.permit.name}</span>{canEdit && <button onClick={() => removeDoc(selectedZone.id, 'permit')} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: 'var(--danger)', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer' }}>{tx('Retirer', 'Remove')}</button>}</div>) : canEdit ? (<button onClick={() => startDocImport(selectedZone.id, 'permit')} style={{ background: 'transparent', border: `1px dashed ${C.accent2}`, color: C.accent2, borderRadius: '7px', padding: '8px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', width: '100%' }}>{tx('＋ Importer le permis (image / scan)', '＋ Import permit (image / scan)')}</button>) : (<div style={{ fontSize: '12px', color: C.dim }}>{tx('Aucun permis importé.', 'No permit uploaded.')}</div>)}
                      </div>

                      {selectedZone.type === 'confined' && (() => {
                        const due = atmoDue(selectedZone); const checks = mergedChecks(selectedZone);
                        const dueColor = due.state === 'overdue' ? 'var(--danger)' : due.state === 'ok' ? 'var(--ok)' : C.dim;
                        return (<div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '10px', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ fontSize: '11px', color: '#fb923c', fontWeight: 700 }}>{bi('Tests atmosphériques', 'Atmospheric tests')}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '10px', color: C.dim }}>{tx('Intervalle', 'Interval')}</span>{canEdit ? <select value={selectedZone.interval || 12} onChange={(e) => updateZone(selectedZone.id, { interval: Number(e.target.value) })} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '2px 6px', fontSize: '11px' }}><option value={12}>12h</option><option value={24}>24h</option></select> : <span style={{ fontSize: '11px', color: C.text }}>{(selectedZone.interval || 12)}h</span>}</div>
                          </div>
                          <div style={{ fontSize: '11px', color: dueColor, fontWeight: 700, marginBottom: '8px' }}>{due.state === 'none' ? tx('⚠ Aucun test enregistré', '⚠ No test recorded') : due.state === 'overdue' ? tx('EN RETARD depuis ', 'OVERDUE by ') + fmtRemaining(due.remaining, lang) : tx('✓ Prochain test dans ', '✓ Next test in ') + fmtRemaining(due.remaining, lang)}</div>
                          {canEdit && <button onClick={() => startCheckImport(selectedZone.id)} style={{ background: '#f97316', color: 'var(--on-accent)', border: 'none', borderRadius: '7px', padding: '8px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', marginBottom: '8px' }}>{tx('＋ Nouveau contrôle (upload fiche)', '＋ New check (upload sheet)')}</button>}
                          {checks.length === 0 && <div style={{ fontSize: '12px', color: C.dim }}>{tx('Aucun contrôle.', 'No check yet.')}</div>}
                          {checks.map((c) => (<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 0', borderTop: `1px solid ${C.line}` }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.pending ? 'var(--warn)' : 'var(--ok)', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: '90px' }}>{fmtClock(c.ts, lang)}<span style={{ color: C.dim }}> · {c.by}</span></span>
                            {c.pending && <span style={{ fontSize: '9px', color: 'var(--warn)', border: '1px solid #eab308', borderRadius: '4px', padding: '0 4px' }}>{tx('en attente', 'pending')}</span>}
                            <button onClick={() => openDoc('atmo', c)} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.accent2, borderRadius: '5px', padding: '3px 8px', fontSize: '10px', cursor: 'pointer' }}>{tx('Voir', 'View')}</button>
                          </div>))}
                          <div style={{ fontSize: '10px', color: C.dim, marginTop: '6px', fontStyle: 'italic' }}>{tx('Hors-ligne, les contrôles sont enregistrés sur l’appareil puis synchronisés au retour du réseau.', 'Offline, checks are saved on the device and synced when the network returns.')}</div>
                        </div>);
                      })()}

                      {selectedZone.type === 'hot' && (<div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '10px', marginBottom: '10px' }}><div style={{ fontSize: '11px', color: 'var(--danger-ink)', marginBottom: '6px', fontWeight: 700 }}>Fire Watch</div>{fwHere.length ? fwHere.map((f) => (<div key={f.id} style={{ fontSize: '12px', marginBottom: '3px' }}>✓ {f.name} <span style={{ color: C.dim }}>· {tx('depuis', 'since')} {fmtDur(f.since, lang)}</span></div>)) : <div style={{ fontSize: '12px', color: 'var(--danger-ink)' }}>⚠ {tx('Aucun fire watch posté sur cette zone.', 'No fire watch posted on this zone.')}</div>}{canEdit && <div style={{ fontSize: '11px', color: C.dim, marginTop: '4px' }}>{tx('Gérer dans l’onglet Équipe.', 'Manage in the Crew tab.')}</div>}</div>)}

                      <div style={{ fontSize: '11px', color: C.text, marginBottom: '6px' }}>⚠ {pick(lang, h.permit.fr, h.permit.en)}</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: C.dim, marginBottom: '6px' }}>{bi('EPI', 'PPE')}</div>
                      {h.epi.map((e, i) => (<div key={i} style={{ fontSize: '12px', marginBottom: '3px' }}>{lang !== 'bi' ? '✓ ' + pick(lang, e.fr, e.en) : <>✓ {e.fr} <span style={{ opacity: 0.5 }}>/ {e.en}</span></>}</div>))}
                    </div>
                  );
                })() : (<div style={{ background: C.panel2, border: `1px dashed ${C.line}`, borderRadius: '18px', padding: '18px', textAlign: 'center', fontSize: '12px', color: C.dim }}>{tx('Touchez une zone pour voir permis, test atmo, fire watch et EPI.', 'Tap a zone to see permit, atmospheric test, fire watch and PPE.')}</div>)}
              </div>
            </div>
          )}

          {tab === 'overview' && <DashboardView C={C} lang={lang} active={active} statusCounts={statusCounts} allConflicts={allConflicts} overdueTests={overdueTests} untestedConfined={untestedConfined} hotNoFw={hotNoFw} noPermitActive={noPermitActive} fwPosted={fwPosted} fwAvail={fwAvail} checksToday={checksToday} crew={crew} occupantsTotal={occupantsTotal} riskyOccupied={riskyOccupied} onReport={() => setShowReport(true)} onGoto={(t) => setTab(t)} />}
          {tab === '3d' && (<div>
            {canEdit && !ships.some((x) => x.name === "L'Atalante") && <button onClick={addAtalante} style={{ background: C.fill, color: C.text, border: 'none', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '10px' }}>{tx("+ Ajouter L'Atalante (plan photographié)", "+ Add L'Atalante (photographed plan)")}</button>}
            <Yard3D ships={ships} activeId={activeId} onSelect={(id) => { setActiveId(id); setActiveDeckId(null); setSelectedId(null); }} onMove={moveShip} canEdit={canEdit} C={C} lang={lang} />
          </div>)}
          {tab === 'works' && <WorksView zones={allZones} companies={companyList(allZones)} C={C} lang={lang} />}
          {tab === 'crew' && <CrewView crew={crew} C={C} canEdit={canEdit} hotZones={hotZones} nowTick={nowTick} lang={lang} onCoord={(v) => updateCrew({ coordinator: v })} onAssist={(v) => updateCrew({ assistant: v })} onAdd={addFireWatch} onAssign={assignFireWatch} onRelease={releaseFireWatch} onRemove={removeFireWatch} onLocate={locateZone} />}
        </div>
      )}

      {active && (<nav className="dd-tabbar" aria-label={tx('Navigation', 'Navigation')}>{[['overview', tx('Aperçu', 'Summary'), LayoutDashboard], ['plan', 'Plan', MapIcon], ['3d', '3D', Box], ['works', tx('Travaux', 'Works'), HardHat], ['crew', tx('Équipe', 'Crew'), Users]].map(([k, l, Ico]) => { const on = tab === k; return (<button key={k} type="button" aria-current={on ? 'page' : undefined} className={on ? 'on' : ''} onClick={() => { setTab(k); window.scrollTo({ top: 0 }); }}><span className="ico"><Ico size={23} strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />{k === 'overview' && alertCount > 0 && <span className="badge" aria-label={alertCount + ' ' + tx('alertes', 'alerts')}>{alertCount}</span>}</span><span className="lbl">{l}</span></button>); })}</nav>)}
      {confirmAsk && (<div className="dd-backdrop dd-confirm-bd" onClick={() => setConfirmAsk(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: '20px' }}>
        <div className="dd-action" role="alertdialog" aria-modal="true" aria-label={confirmAsk.msg} onClick={(e) => e.stopPropagation()}>
          <div className="grp"><div className="msg">{confirmAsk.msg}<small>{tx('Cette action est définitive.', 'This can’t be undone.')}</small></div><button type="button" className="danger" autoFocus onClick={() => { const f = confirmAsk.onYes; setConfirmAsk(null); f(); }}>{confirmAsk.label}</button></div>
          <div className="grp"><button type="button" className="cancel" onClick={() => setConfirmAsk(null)}>{tx('Annuler', 'Cancel')}</button></div>
        </div>
      </div>)}
      <div className="dd-foot" style={{ padding: '14px 18px', background: C.panel2, borderTop: `1px solid ${C.line}`, fontSize: '11px', color: C.dim, textAlign: 'center', marginTop: '20px' }}>{tx('Démo collaborative — Allied Maritime Solutions Ltd · Safety & Service. Permis et tests sont des exemples de démonstration.', 'Collaborative demo — Allied Maritime Solutions Ltd · Safety & Service. Permits and tests are demonstration samples.')}</div>
    </div>
    </>
  );
}

function CrewView({ crew, C, canEdit, hotZones, nowTick, lang, onCoord, onAssist, onAdd, onAssign, onRelease, onRemove, onLocate }) {
  const tx = mkTx(lang), bi = mkBi(lang);
  const [fwName, setFwName] = useState('');
  const posted = crew.fireWatch.filter((f) => f.status === 'posted');
  const avail = crew.fireWatch.filter((f) => f.status !== 'posted');
  const zoneName = (id) => { const z = hotZones.find((h) => h.id === id); return z ? (z.work || tx('Zone travaux à chaud', 'Hot work zone')) : tx('Zone supprimée', 'Deleted zone'); };
  function submitAdd() { const n = fwName.trim(); if (!n) return; onAdd(n); setFwName(''); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: C.text }}>{tx('Coordination du chantier', 'Site coordination')}</div>
          <label style={{ fontSize: '12px', color: C.dim, display: 'block', marginBottom: '4px' }}>{bi('Coordinateur', 'Site coordinator')}</label>
          {canEdit ? <input value={crew.coordinator} onChange={(e) => onCoord(e.target.value)} placeholder={tx('Nom', 'Name') + '…'} style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 10px', fontSize: '14px', marginBottom: '12px' }} /> : <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>{crew.coordinator || '—'}</div>}
          <label style={{ fontSize: '12px', color: C.dim, display: 'block', marginBottom: '4px' }}>{bi('Assistant coordinateur', 'Assistant')}</label>
          {canEdit ? <input value={crew.assistant} onChange={(e) => onAssist(e.target.value)} placeholder={tx('Nom (optionnel)', 'Name (optional)') + '…'} style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 10px', fontSize: '14px' }} /> : <div style={{ fontSize: '15px', fontWeight: 600 }}>{crew.assistant || '—'}</div>}
        </div>
        <div style={{ flex: '1 1 160px', display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '16px', textAlign: 'center' }}><div style={{ fontSize: '30px', fontWeight: 800, color: 'var(--ok)' }}>{posted.length}</div><div style={{ fontSize: '12px', color: C.dim }}>{tx('Fire Watch en position', 'Fire watch on station')}</div></div>
          <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '16px', textAlign: 'center' }}><div style={{ fontSize: '30px', fontWeight: 800, color: C.accent2 }}>{avail.length}</div><div style={{ fontSize: '12px', color: C.dim }}>{tx('Disponibles', 'Available')}</div></div>
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.line}` }}>{tx('Fire Watch — surveillants incendie', 'Fire watch — fire sentries')}</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px 14px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
            <input value={fwName} onChange={(e) => setFwName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} placeholder={tx('Nom du fire watch…', 'Fire watch name…')} style={{ flex: 1, minWidth: '160px', background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '9px 10px', fontSize: '13px' }} />
            <button onClick={submitAdd} style={{ background: C.fill, color: C.text, border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{tx('＋ Ajouter', '＋ Add')}</button>
          </div>
        )}
        {crew.fireWatch.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: C.dim, fontSize: '13px' }}>{tx('Aucun fire watch.', 'No fire watch.')}</div>}
        {crew.fireWatch.map((f) => {
          const isPosted = f.status === 'posted';
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: isPosted ? 'var(--ok)' : C.dim }} />
              <span style={{ fontWeight: 600, fontSize: '14px', minWidth: '110px' }}>{f.name}</span>
              {isPosted ? (() => { const exists = hotZones.some((z) => z.id === f.zoneId); return (<span role={exists ? 'button' : undefined} tabIndex={exists ? 0 : undefined} onKeyDown={(e) => { if (exists && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onLocate(f.zoneId); } }} onClick={() => exists && onLocate(f.zoneId)} title={exists ? tx('Voir sur le plan', 'View on plan') : undefined} style={{ fontSize: '12px', color: 'var(--ok-ink)', flex: 1, minWidth: '160px', cursor: exists ? 'pointer' : 'default' }}><span style={{ textDecoration: exists ? 'underline dotted' : 'none', textUnderlineOffset: '3px' }}>{zoneName(f.zoneId)}</span> <span style={{ color: C.dim }}>· {tx('depuis', 'since')} {fmtDur(f.since, lang)}</span>{exists && <span style={{ marginLeft: '6px', fontSize: '12px' }}>📍</span>}</span>); })() : (<span style={{ fontSize: '12px', color: C.dim, flex: 1, minWidth: '160px' }}>{tx('Disponible', 'Available')}</span>)}
              {canEdit && (<div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>{isPosted ? (<button onClick={() => onRelease(f.id)} style={{ background: 'transparent', border: `1px solid #22c55e`, color: 'var(--ok-ink)', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>{tx('Libérer', 'Release')}</button>) : (<select defaultValue="" onChange={(e) => { if (e.target.value) onAssign(f.id, e.target.value); }} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}`, borderRadius: '6px', padding: '5px 8px', fontSize: '12px' }}><option value="" disabled>{tx('Poster sur…', 'Post to…')}</option>{hotZones.length === 0 && <option value="" disabled>{tx('Aucune zone à chaud', 'No hot work zone')}</option>}{hotZones.map((z) => <option key={z.id} value={z.id}>{z.work || tx('Zone à chaud', 'Hot work zone')}</option>)}</select>)}<button onClick={() => onRemove(f.id)} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: 'var(--danger)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>✕</button></div>)}
            </div>
          );
        })}
        {hotZones.length === 0 && <div style={{ padding: '10px 14px', fontSize: '12px', color: C.dim, fontStyle: 'italic' }}>{tx('Astuce : ajoutez une zone « Travaux à chaud » sur un pont pour pouvoir y poster un fire watch.', 'Tip: add a “Hot work” zone on a deck to post a fire watch there.')}</div>}
      </div>
    </div>
  );
}

function WorksView({ zones, companies, C, lang }) {
  const tx = mkTx(lang);
  const counts = { planned: 0, progress: 0, done: 0 };
  zones.forEach((z) => { counts[z.status] = (counts[z.status] || 0) + 1; });
  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>{Object.entries(STATUS).map(([k, s]) => (<div key={k} style={{ flex: '1 1 120px', background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '14px', textAlign: 'center' }}><div style={{ fontSize: '26px', fontWeight: 800, color: s.color }}>{counts[k] || 0}</div><div style={{ fontSize: '12px', color: C.dim }}>{pick(lang, s.fr, s.en)}</div></div>))}</div>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.line}` }}>{tx('Travaux par compagnie (tous les ponts)', 'Works by company (all decks)')}</div>
        {companies.length === 0 && zones.length === 0 && (<div style={{ padding: '24px', textAlign: 'center', color: C.dim, fontSize: '13px' }}>{tx('Aucune zone.', 'No zone.')}</div>)}
        {companies.map((c) => {
          const zs = zones.filter((z) => z.company === c);
          return (<div key={c} style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}` }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: companyColor(c, companies) }} /><span style={{ fontWeight: 700, fontSize: '14px' }}>{c}</span><span style={{ fontSize: '12px', color: C.dim }}>· {zs.length} {tx('zone(s)', 'zone(s)')}</span></div>{zs.map((z) => { const h = HAZARDS[z.type], s = STATUS[z.status]; return (<div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 0 5px 20px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: h.color }} /><span style={{ flex: 1 }}>{z.work || pick(lang, h.label.fr, h.label.en)}</span>{z.permit && <span>📄</span>}{(z.atmo || (z.checks && z.checks.length)) && <span>🫁</span>}<span style={{ background: s.color, color: '#fff', borderRadius: '4px', padding: '1px 7px', fontSize: '12px' }}>{pick(lang, s.fr, s.en)}</span></div>); })}</div>);
        })}
        {zones.filter((z) => !z.company).length > 0 && (<div style={{ padding: '12px 14px' }}><div style={{ fontWeight: 700, fontSize: '13px', color: C.dim, marginBottom: '6px' }}>{tx('Sans compagnie', 'No company')}</div>{zones.filter((z) => !z.company).map((z) => { const h = HAZARDS[z.type], s = STATUS[z.status]; return (<div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 0 5px 20px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: h.color }} /><span style={{ flex: 1 }}>{z.work || pick(lang, h.label.fr, h.label.en)}</span><span style={{ background: s.color, color: '#fff', borderRadius: '4px', padding: '1px 7px', fontSize: '12px' }}>{pick(lang, s.fr, s.en)}</span></div>); })}</div>)}
      </div>
    </div>
  );
}

const DECK_LAYOUTS = {
  main: [
    { x: 70, y: 34, w: 60, h: 20, fr: 'Pic avant', en: 'Forepeak' },
    { x: 54, y: 58, w: 36, h: 32, fr: 'Cabines BB', en: 'Cabins (P)' },
    { x: 92, y: 58, w: 16, h: 108, fr: 'Coursive', en: 'Corridor', v: true },
    { x: 110, y: 58, w: 36, h: 32, fr: 'Cabines TB', en: 'Cabins (S)' },
    { x: 54, y: 92, w: 36, h: 32, fr: 'Magasin', en: 'Store' },
    { x: 110, y: 92, w: 36, h: 32, fr: 'Atelier', en: 'Workshop' },
    { x: 54, y: 126, w: 36, h: 40, fr: 'Citerne BB', en: 'Tank (P)' },
    { x: 110, y: 126, w: 36, h: 40, fr: 'Citerne TB', en: 'Tank (S)' },
    { x: 54, y: 168, w: 92, h: 42, fr: 'Salle des machines', en: 'Engine room' },
    { x: 60, y: 212, w: 80, h: 34, fr: 'Local de barre', en: 'Steering gear' },
  ],
  cabins: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Pic avant', en: 'Forepeak' },
    { x: 54, y: 56, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 82, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 108, w: 36, h: 24, fr: 'Cabine BB', en: 'Cabin (P)' },
    { x: 54, y: 134, w: 36, h: 30, fr: 'Sanitaires', en: 'Sanitary' },
    { x: 92, y: 56, w: 16, h: 108, fr: 'Coursive', en: 'Corridor', v: true },
    { x: 110, y: 56, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 82, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 108, w: 36, h: 24, fr: 'Cabine TB', en: 'Cabin (S)' },
    { x: 110, y: 134, w: 36, h: 30, fr: 'Sanitaires', en: 'Sanitary' },
    { x: 54, y: 168, w: 92, h: 42, fr: 'Réfectoire', en: 'Mess room' },
    { x: 60, y: 212, w: 80, h: 34, fr: 'Local technique', en: 'Technical room' },
  ],
  machinery: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Local étrave', en: 'Bow space' },
    { x: 54, y: 56, w: 38, h: 30, fr: 'Atelier', en: 'Workshop' },
    { x: 108, y: 56, w: 38, h: 30, fr: 'Soute BB/TB', en: 'Bunkers P/S' },
    { x: 54, y: 90, w: 44, h: 30, fr: 'Salle de contrôle', en: 'Control room' },
    { x: 102, y: 90, w: 44, h: 30, fr: 'Tableau élec.', en: 'Switchboard' },
    { x: 54, y: 124, w: 44, h: 34, fr: 'Groupe élec. BB', en: 'Generator (P)' },
    { x: 102, y: 124, w: 44, h: 34, fr: 'Groupe élec. TB', en: 'Generator (S)' },
    { x: 54, y: 162, w: 92, h: 50, fr: 'Moteur principal', en: 'Main engine' },
    { x: 60, y: 214, w: 80, h: 32, fr: 'Local de barre', en: 'Steering gear' },
  ],
  technical: [
    { x: 70, y: 34, w: 60, h: 18, fr: 'Pic avant (ballast)', en: 'Forepeak (ballast)' },
    { x: 54, y: 56, w: 40, h: 50, fr: 'Ballast BB 1', en: 'Ballast (P) 1' },
    { x: 96, y: 56, w: 8, h: 102, fr: 'Tunnel', en: 'Pipe tunnel', v: true },
    { x: 106, y: 56, w: 40, h: 50, fr: 'Ballast TB 1', en: 'Ballast (S) 1' },
    { x: 54, y: 108, w: 40, h: 50, fr: 'Ballast BB 2', en: 'Ballast (P) 2' },
    { x: 106, y: 108, w: 40, h: 50, fr: 'Ballast TB 2', en: 'Ballast (S) 2' },
    { x: 54, y: 160, w: 92, h: 46, fr: 'Soute combustible', en: 'Fuel bunker' },
    { x: 60, y: 210, w: 80, h: 34, fr: 'Pic arrière', en: 'Aft peak' },
  ],
};

function IntroOverlay({ introOut }) {
  // Launch: one lead (the wordmark materialises), the hull line draws in overlapping it.
  // Exit: everything together, the wordmark pushes slightly toward the viewer as the app fades in beneath.
  return (
    <div className={'ddi' + (introOut ? ' out' : '')} aria-hidden="true">
      <div className="ddi-glow" />
      <div className="ddi-stack">
        <div className="ddi-name">DryDock Safety</div>
        <svg className="ddi-hull" viewBox="0 0 320 64" fill="none">
          <path pathLength="1" d="M16 22 L250 19 C272 18 290 14 306 8 L298 40 C297 44 305 46 304 51 C303 55 296 56 288 56 H60 C40 56 26 50 21 40 Z" stroke="rgba(255,255,255,0.42)" strokeWidth="1.2" strokeLinejoin="round" />
          <path pathLength="1" d="M10 40 H312" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        </svg>
      </div>
      <style>{`
        .ddi { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: #000; transition: opacity 420ms cubic-bezier(0.23, 1, 0.32, 1); }
        .ddi.out { opacity: 0; pointer-events: none; }
        .ddi-glow { position: absolute; left: 50%; top: 50%; width: 560px; height: 560px; margin: -300px 0 0 -280px; border-radius: 50%; background: radial-gradient(closest-side, rgba(120,140,160,0.16), transparent); opacity: 0; animation: ddiFade 900ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        .ddi-stack { position: relative; display: flex; flex-direction: column; align-items: center; transition: transform 420ms cubic-bezier(0.23, 1, 0.32, 1), filter 420ms cubic-bezier(0.23, 1, 0.32, 1); }
        .ddi.out .ddi-stack { transform: scale(1.04); filter: blur(6px); }
        .ddi-name { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif; font-size: clamp(30px, 8vw, 40px); font-weight: 600; letter-spacing: -0.03em; color: #f5f5f7; animation: ddiMaterialise 700ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        .ddi-hull { width: min(72vw, 300px); height: auto; margin-top: 30px; overflow: visible; }
        .ddi-hull path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ddiDraw 900ms cubic-bezier(0.77, 0, 0.175, 1) 260ms both; }
        .ddi-hull path + path { animation-delay: 520ms; animation-duration: 600ms; }
        @keyframes ddiMaterialise { from { opacity: 0; transform: scale(0.96); filter: blur(12px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
        @keyframes ddiDraw { to { stroke-dashoffset: 0; } }
        @keyframes ddiFade { to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ddi-name, .ddi-glow { animation: ddiFade 200ms ease both; }
          .ddi-hull path { animation: none; stroke-dashoffset: 0; }
          .ddi.out .ddi-stack { transform: none; filter: none; }
        }
      `}</style>
    </div>
  );
}

function SafetySign({ level, size = 72, title }) {
  // level: 0 safe condition (green square), 1 warning (yellow triangle), 2 danger (red-bordered triangle)
  if (level === 0) return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}><rect x="2" y="2" width="96" height="96" rx="8" fill="#1e7f4f" /><path d="M27 52 L44 68 L74 34" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  const fill = level >= 2 ? '#fff' : '#f6b800', edge = level >= 2 ? '#c4161c' : '#15191c', mark = level >= 2 ? '#c4161c' : '#15191c';
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 100 90" role="img" aria-label={title}><path d="M50 4 L96 84 Q98 88 93 88 L7 88 Q2 88 4 84 Z" fill={fill} stroke={edge} strokeWidth="7" strokeLinejoin="round" /><rect x="45" y="30" width="10" height="32" rx="3" fill={mark} /><circle cx="50" cy="73" r="6" fill={mark} /></svg>);
}

function DashboardView({ C, lang, active, statusCounts, allConflicts, overdueTests, untestedConfined, hotNoFw, noPermitActive, fwPosted, fwAvail, checksToday, crew, occupantsTotal, riskyOccupied, onReport, onGoto }) {
  const tx = mkTx(lang);
  const kpis = [
    { v: statusCounts.progress || 0, fr: 'Travaux en cours', en: 'Works in progress', ico: Activity, tint: C.blue, go: 'works' },
    { v: occupantsTotal, fr: 'Présents en zone', en: 'People in zones', ico: UserCheck, tint: C.blue, go: 'plan' },
    { v: allConflicts.length, fr: 'Conflits détectés', en: 'Conflicts detected', ico: AlertTriangle, tint: allConflicts.length ? C.red : C.green, flag: allConflicts.length ? 'red' : null, go: 'plan' },
    { v: overdueTests.length, fr: 'Tests atmo en retard', en: 'Overdue atmo tests', ico: Wind, tint: overdueTests.length ? C.red : C.green, flag: overdueTests.length ? 'red' : null, go: 'plan' },
    { v: fwPosted + ' / ' + (fwPosted + fwAvail), fr: 'Fire watch postés', en: 'Fire watch posted', ico: Flame, tint: C.accent, go: 'crew' },
    { v: checksToday, fr: 'Contrôles aujourd\u2019hui', en: 'Checks today', ico: ClipboardCheck, tint: C.green, go: 'plan' },
    { v: noPermitActive.length, fr: 'Permis manquants', en: 'Missing permits', ico: FileWarning, tint: noPermitActive.length ? C.amber : C.green, flag: noPermitActive.length ? 'amber' : null, go: 'plan' },
  ];
  const alerts = [
    ...riskyOccupied.map((z) => ({ ico: Siren, sev: 3, fr: 'PERSONNE EN ESPACE CONFINÉ AVEC TEST EXPIRÉ — ' + (z.work || 'zone') + ' : évacuation et re-test immédiats', en: 'PERSON IN CONFINED SPACE WITH EXPIRED TEST — ' + (z.work || 'zone') + ': evacuate and re-test immediately' })),
    ...allConflicts.map((c) => ({ ico: AlertTriangle, sev: 2, fr: 'Conflit (' + c.deck + ') : ' + (c.z1.work || HAZARDS[c.z1.type].label.fr) + ' ↔ ' + (c.z2.work || HAZARDS[c.z2.type].label.fr), en: 'Conflict (' + c.deck + '): ' + (c.z1.work || HAZARDS[c.z1.type].label.en) + ' ↔ ' + (c.z2.work || HAZARDS[c.z2.type].label.en) })),
    ...overdueTests.map((z) => ({ ico: Wind, sev: 2, fr: 'Test atmosphérique en retard — ' + (z.work || 'espace confiné'), en: 'Atmospheric test overdue — ' + (z.work || 'confined space') })),
    ...hotNoFw.map((z) => ({ ico: Flame, sev: 2, fr: 'Travaux à chaud sans fire watch — ' + (z.work || 'zone'), en: 'Hot work without fire watch — ' + (z.work || 'zone') })),
    ...untestedConfined.map((z) => ({ ico: Wind, sev: 1, fr: 'Espace confiné jamais testé — ' + (z.work || 'zone'), en: 'Confined space never tested — ' + (z.work || 'zone') })),
    ...noPermitActive.map((z) => ({ ico: FileWarning, sev: 1, fr: 'Permis manquant — ' + (z.work || HAZARDS[z.type].label.fr), en: 'Missing permit — ' + (z.work || HAZARDS[z.type].label.en) })),
  ].sort((a, b) => b.sev - a.sev);
  const log = (active.log || []).slice(0, 25);
  const top = alerts.length ? alerts[0].sev : 0;
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'bg' ? 'bg-BG' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  // compliance = share of active zones with no open issue (conflict, overdue/untested atmosphere, no fire watch, no permit)
  const activeZones = active.decks.flatMap((d) => d.zones).filter((z) => z.status !== 'done');
  const issueIds = new Set([...allConflicts.flatMap((c) => [c.z1.id, c.z2.id]), ...overdueTests.map((z) => z.id), ...untestedConfined.map((z) => z.id), ...hotNoFw.map((z) => z.id), ...noPermitActive.map((z) => z.id), ...riskyOccupied.map((z) => z.id)]);
  const okCount = activeZones.filter((z) => !issueIds.has(z.id)).length;
  const pct = activeZones.length ? Math.round((okCount / activeZones.length) * 100) : 100;
  const ringCol = top >= 2 ? 'var(--danger)' : top === 1 ? 'var(--warn)' : 'var(--ok)';
  const CIRC = 2 * Math.PI * 52;
  const rowsActivity = [kpis[0], kpis[1], kpis[4], kpis[5]], rowsCompliance = [kpis[2], kpis[3], kpis[6]];
  const Row = ({ k }) => (<button type="button" className="dd-li" onClick={() => onGoto(k.go)}><span className={'ic' + (k.flag === 'red' ? ' red' : k.flag === 'amber' ? ' orange' : '')}><k.ico size={16} strokeWidth={2.2} aria-hidden="true" /></span><span className="lb">{pick(lang, k.fr, k.en)}</span><span className={'vl' + (k.flag === 'red' ? ' red' : k.flag === 'amber' ? ' orange' : '')}>{k.v}</span><ChevronRight size={17} className="chev" aria-hidden="true" /></button>);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <section className="dd-hero">
        <div className="dd-ring" role="img" aria-label={pct + ' % ' + tx('des zones actives conformes', 'of active zones compliant')}>
          <svg width="112" height="112" viewBox="0 0 120 120"><circle className="trk" cx="60" cy="60" r="52" fill="none" strokeWidth="12" /><circle className="val" cx="60" cy="60" r="52" fill="none" stroke={ringCol} strokeWidth="12" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - Math.max(pct, 2) / 100)} /></svg>
          <div className="ctr"><div><div className="pct">{pct}%</div><div className="cap">{tx('conforme', 'compliant')}</div></div></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="dd-hero-title">{alerts.length ? alerts.length + ' ' + tx(alerts.length > 1 ? 'points à traiter' : 'point à traiter', alerts.length > 1 ? 'items need attention' : 'item needs attention') : tx('Chantier conforme', 'Site compliant')}</h2>
          <div className="dd-hero-sub">{alerts.length ? pick(lang, alerts[0].fr, alerts[0].en) : tx('Espaces confinés testés, zones à chaud couvertes, aucun conflit.', 'Confined spaces tested, hot work covered, no conflicts.')}</div>
          <div className="dd-hero-date">{today.charAt(0).toUpperCase() + today.slice(1)} · {okCount}/{activeZones.length} {tx('zones actives conformes', 'active zones compliant')}</div>
        </div>
        <button type="button" className="dd-primary" onClick={onReport}><ClipboardList size={17} aria-hidden="true" />{tx('Rapport journalier', 'Daily report')}</button>
      </section>

      <div className="dd-cols dd-kpis">
        <section><h3 className="dd-group-hd">{tx('Conformité', 'Compliance')}</h3><div className="dd-group">{rowsCompliance.map((k, i) => <Row key={i} k={k} />)}</div></section>
        <section><h3 className="dd-group-hd">{tx('Activité', 'Activity')}</h3><div className="dd-group">{rowsActivity.map((k, i) => <Row key={i} k={k} />)}</div></section>
      </div>

      <div className="dd-cols">
        <section>
          <h3 className="dd-group-hd">{tx('Alertes actives', 'Active alerts')}<span className="n">{alerts.length}</span></h3>
          <div className="dd-group">
            {alerts.length === 0 && <div className="dd-li plain" style={{ color: 'var(--ink-2)' }}>{tx('Tous les espaces confinés sont à jour, les zones à chaud sont couvertes et aucun conflit n\u2019est détecté.', 'All confined spaces are up to date, hot work zones are covered and no conflict is detected.')}</div>}
            {alerts.map((a, i) => (<div key={i} className={'dd-li plain' + (a.sev === 3 ? ' crit' : '')}><span className={'ic ' + (a.sev >= 2 ? 'red' : 'orange')}><a.ico size={15} strokeWidth={2.3} aria-hidden="true" /></span><span className="lb">{pick(lang, a.fr, a.en)}</span></div>))}
          </div>
        </section>
        <section>
          <h3 className="dd-group-hd">{tx('Journal du chantier', 'Site log')}</h3>
          <div className="dd-group">
            {log.length === 0 && <div className="dd-li plain" style={{ color: 'var(--ink-2)' }}>{tx('Les permis, contrôles et mouvements de fire watch s\u2019inscrivent ici avec leur heure.', 'Permits, checks and fire watch moves are recorded here with their time.')}</div>}
            {log.map((l) => (<div key={l.id} className="dd-li plain"><span className="tm">{fmtClock(l.ts, lang)}</span><span className="lb">{pick(lang, l.fr, l.en)}</span></div>))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DeckSchematic({ layout, lang, aiRooms }) {
  const rooms = (aiRooms && aiRooms.length) ? aiRooms : (DECK_LAYOUTS[layout] || DECK_LAYOUTS.main);
  return (
    <svg viewBox="0 0 200 280" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <path d="M 100 8 C 130 22, 150 46, 152 80 L 152 232 C 152 258, 130 272, 100 274 C 70 272, 48 258, 48 232 L 48 80 C 50 46, 70 22, 100 8 Z" fill="#121417" stroke="#33373d" strokeWidth="2" />
      {rooms.map((r, i) => {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#1c1f23" stroke="#3a3f45" strokeWidth="0.8" rx="1" />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#9aa3ad" fontSize="4.2" fontWeight="bold" transform={r.v ? `rotate(-90 ${cx} ${cy})` : undefined}>{pick(lang, r.fr, r.en)}</text>
          </g>
        );
      })}
      <text x="100" y="20" textAnchor="middle" fill="#7b838c" fontSize="5.5">▲ {pick(lang, 'PROUE', 'BOW')}</text>
      <text x="100" y="266" textAnchor="middle" fill="#7b838c" fontSize="5.5">{pick(lang, 'POUPE', 'STERN')} ▼</text>
    </svg>
  );
}

const planX = (x, B) => ((x - 100) / 52) * (B / 2);
const planZ = (y, L) => ((y - 8) / 266 - 0.5) * L;
function hullStations() {
  const bez = (p0, p1, p2, p3, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return o; };
  return [...bez([100, 8], [130, 22], [150, 46], [152, 80], 10), ...bez([152, 232], [152, 258], [130, 272], [100, 274], 10)].map(([x, y]) => [y, (x - 100) / 52]);
}
function buildHull(B, L, D) {
  const st = hullStations(), m = 13, pos = [], idx = [], ln = [];
  st.forEach(([y, hb]) => { const z = planZ(y, L), b = Math.max(hb, 0.001) * B / 2; for (let j = 0; j < m; j++) { const x = b * (-1 + (2 * j) / (m - 1)); pos.push(x, D * Math.pow(Math.abs(x) / b, 8), z); } });
  for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + m; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const seg = (p, q) => ln.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
  for (let i = 0; i < st.length - 1; i++) [0, 3, 6, 9, 12].forEach((j) => seg(i * m + j, (i + 1) * m + j));
  for (let i = 0; i < st.length; i += 3) for (let j = 0; j < m - 1; j++) seg(i * m + j, i * m + j + 1);
  const g = new THREE.BufferGeometry(), lg = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3));
  return { g, lg };
}

function Yard3D({ ships, activeId, onSelect, onMove, canEdit, C, lang }) {
  const tx = mkTx(lang);
  const mountRef = useRef(null), api = useRef({}), cb = useRef({});
  cb.current = { onSelect, onMove, canEdit };
  const lift = 0;
  const [xray, setXray] = useState(true), [labels, setLabels] = useState(true), [zmode, setZmode] = useState('through'), [hide, setHide] = useState({});
  const sig = JSON.stringify([activeId, xray, labels, lift, lang, zmode, hide, ships.map((s) => [s.id, s.name, s.dock, s.pos, (s.decks || []).map((d) => [d.layout, d.aiRooms ? d.aiRooms.length : 0, (d.zones || []).map((z) => [z.id, z.type, z.x, z.y, z.w, z.h, z.status])])])]);

  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const W = () => el.clientWidth || 360, H = 460;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W(), H); renderer.setClearColor(0x0b0b0c);
    const cv = renderer.domElement; cv.style.touchAction = 'none'; cv.style.display = 'block'; cv.style.borderRadius = '8px'; el.appendChild(cv);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, W() / H, 1, 3000), world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6)); const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(200, 400, 150); scene.add(sun);
    const cam = { th: 0.9, ph: 1.0, r: 330, ty: 10 };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    const pts = new Map(); let drag = null, pinch = 0;
    const aim = (e) => { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const down = (e) => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return; }
      aim(e);
      const h = ray.intersectObjects(api.current.hulls || [], false)[0];
      if (h) {
        cb.current.onSelect(h.object.userData.shipId);
        
      }
    };
    const move = (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch && d) cam.r = Math.min(900, Math.max(40, cam.r * pinch / d)); pinch = d; return; }
      if (drag) { aim(e); if (ray.ray.intersectPlane(ground, hit)) { drag.g.position.set(hit.x + drag.ox, 0, hit.z + drag.oz); drag.moved = true; } }
      else { cam.th -= (e.clientX - p.x) * 0.008; cam.ph = Math.min(2.7, Math.max(0.15, cam.ph - (e.clientY - p.y) * 0.008)); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e) => {
      pts.delete(e.pointerId); pinch = 0;
      if (drag && drag.moved) cb.current.onMove(drag.id, { x: Math.round(drag.g.position.x * 10) / 10, z: Math.round(drag.g.position.z * 10) / 10 });
      drag = null;
    };
    const wheel = (e) => { e.preventDefault(); cam.r = Math.min(900, Math.max(40, cam.r * (1 + e.deltaY * 0.001))); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false });
    api.current = { world, cam, hulls: [], pulse: [] };
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now() / 400; api.current.pulse.forEach((m) => { m.opacity = 0.4 + 0.25 * Math.sin(t); });
      camera.position.set(cam.r * Math.sin(cam.ph) * Math.sin(cam.th), cam.ty + cam.r * Math.cos(cam.ph), cam.r * Math.sin(cam.ph) * Math.cos(cam.th)); camera.lookAt(0, cam.ty, 0);
      renderer.render(scene, camera);
    };
    loop();
    const onResize = () => { renderer.setSize(W(), H); camera.aspect = W() / H; camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose(); if (el.contains(cv)) el.removeChild(cv); };
  }, []);

  useEffect(() => {
    const a = api.current; if (!a.world) return;
    while (a.world.children.length) { const o = a.world.children.pop(); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); }
    a.hulls = []; a.pulse = [];
    const mkLabel = (text, color, font, sw, sh) => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.fillText(text, 128, 40); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); sp.scale.set(sw, sh, 1); sp.renderOrder = 9; return sp; };
    ships.filter((s) => s.id === activeId).forEach((s) => {
      const d = s.dock || {}, L = d.shipLength || 120, B = d.shipWidth || 20, DL = d.dockLength || L + 20, DW = d.dockWidth || B + 8, D = B * 0.55, hD = D * 0.28;
      const sel = s.id === activeId, hc = sel ? 0xd1d1d6 : 0x8e8e93;
      const g = new THREE.Group();
      if (a.cam && a.fitFor !== s.id) { a.cam.r = Math.max(50, L * 0.85); a.cam.ty = D / 2; a.fitFor = s.id; }
      const { g: hg, lg } = buildHull(B, L, D); hg.translate(0, lift, 0); lg.translate(0, lift, 0);
      const hmat = xray ? new THREE.MeshBasicMaterial({ color: hc, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: sel ? 0x636366 : 0x48484a, side: THREE.DoubleSide });
      const hull = new THREE.Mesh(hg, hmat);
      hull.userData.shipId = s.id; g.add(hull); a.hulls.push(hull);
      if (!xray) {
        const sp0 = new THREE.Shape(), stt = hullStations();
        stt.forEach(([y, hb], n) => { const x = -hb * (B / 2), z = -planZ(y, L); if (n) sp0.lineTo(x, z); else sp0.moveTo(x, z); });
        for (let n = stt.length - 1; n >= 0; n--) sp0.lineTo(stt[n][1] * (B / 2), -planZ(stt[n][0], L));
        const cg = new THREE.ShapeGeometry(sp0); cg.rotateX(-Math.PI / 2); cg.translate(0, lift + D, 0);
        const cap = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: sel ? 0x8e8e93 : 0x636366, side: THREE.DoubleSide }));
        cap.userData.shipId = s.id; g.add(cap); a.hulls.push(cap);
      }
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: hc, transparent: true, opacity: 0.7 })));
      const nm = mkLabel(s.name || '', '#ffffff', 'bold 28px sans-serif', 48, 12); nm.position.set(0, lift + D + 10, 0); g.add(nm);
      const st = hullStations(), decks = s.decks || [], inner = decks.filter((x) => x.layout !== 'technical'), dh = (D - hD) / Math.max(inner.length, 1);
      const loop = (h) => { const f = Math.pow(Math.max(h, 0.01) / D, 0.125), A = [], Z = []; st.forEach(([y, hb]) => { const b = hb * (B / 2) * f, z = planZ(y, L); A.push(new THREE.Vector3(-b, lift + h, z)); Z.unshift(new THREE.Vector3(b, lift + h, z)); }); return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...A, ...Z]), new THREE.LineBasicMaterial({ color: 0x5b6470, transparent: true, opacity: 0.6 })); };
      [hD, ...inner.map((_, k) => hD + (k + 1) * dh)].forEach((h) => g.add(loop(h)));
      decks.forEach((dk) => {
        const tech = dk.layout === 'technical', k = inner.indexOf(dk), b0 = tech ? 0 : hD + k * dh, bh = tech ? hD : dh, mid = lift + b0 + bh / 2, fx = Math.pow((b0 + bh / 2) / D, 0.125);
        if (sel && xray) {
          const rooms = dk.aiRooms && dk.aiRooms.length ? dk.aiRooms : DECK_LAYOUTS[dk.layout] || DECK_LAYOUTS.main;
          rooms.forEach((r) => {
            const rg = new THREE.BoxGeometry((r.w / 104) * B * fx, bh * 0.92, (r.h / 266) * L), pos = [planX(r.x + r.w / 2, B) * fx, mid, planZ(r.y + r.h / 2, L)];
            const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x8f9aa6, transparent: true, opacity: 0.05, depthWrite: false })); rm.position.set(...pos); g.add(rm);
            const re = new THREE.LineSegments(new THREE.EdgesGeometry(rg), new THREE.LineBasicMaterial({ color: 0x6b7480, transparent: true, opacity: 0.8 })); re.position.set(...pos); g.add(re);
            if (labels) { const lb = mkLabel(pick(lang, r.fr, r.en), '#9aa3ad', 'bold 22px sans-serif', 24, 6); lb.position.set(...pos); g.add(lb); }
          });
        }
        const zp = {};
        (dk.zones || []).forEach((z) => {
          if (z.status === 'done' || zmode === 'off' || hide[z.type]) return;
          const xs = z.x * 2, ys = z.y * 2.8, ws = z.w * 2, hs = z.h * 2.8, inside = xs >= 48 && xs + ws <= 152, under = tech && inside && z.type !== 'confined', f2 = inside ? fx : 1;
          const col = new THREE.Color((HAZARDS[z.type] || {}).color || '#94a3b8'), hgt = !inside ? lift + D : under ? 3.3 : bh * 0.8, yc = !inside ? (lift + D) / 2 : under ? lift + 0.85 : mid;
          zp[z.id] = [planX(xs + ws / 2, B) * f2, yc, planZ(ys + hs / 2, L)];
          const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: z.status === 'progress' ? 0.4 : 0.18, depthTest: zmode === 'through' });
          const box = new THREE.Mesh(new THREE.BoxGeometry((ws / 104) * B * f2, hgt, (hs / 266) * L), mat); box.position.set(...zp[z.id]); box.renderOrder = 5; g.add(box);
          const eg = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: col, depthTest: zmode === 'through' })); eg.position.copy(box.position); eg.renderOrder = 6; g.add(eg);
          if (z.type === 'hot' && z.status === 'progress') a.pulse.push(mat);
        });
        zoneConflicts(dk.zones || []).forEach(({ z1, z2 }) => {
          if (!zp[z1.id] || !zp[z2.id]) return;
          const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...zp[z1.id]), new THREE.Vector3(...zp[z2.id])]), new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: zmode === 'through' }));
          ln.renderOrder = 7; g.add(ln);
        });
      });
      a.world.add(g);
    });
  }, [sig]);

  const btn = (on) => ({ background: on ? C.sel : C.fill, color: C.text, border: 0, borderRadius: '999px', padding: '7px 13px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });
  const view = (ph) => { if (api.current.cam) api.current.cam.ph = ph; };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '18px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{tx('Vue 3D du navire', '3D vessel view')}</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setXray(!xray)} style={btn(xray)}>{tx('Coque transparente', 'See-through hull')}</button>
          <button onClick={() => setLabels(!labels)} style={btn(labels)}>{tx('Étiquettes', 'Labels')}</button>
          <button onClick={() => view(0.9)} style={btn(false)}>{tx('Dessus', 'Above')}</button>
          <button onClick={() => view(1.57)} style={btn(false)}>{tx('Côté', 'Side')}</button>
          <button onClick={() => view(2.4)} style={btn(false)}>{tx('Dessous', 'Below')}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px', fontSize: '12px', color: C.dim }}>
        <span>{tx('Zones', 'Zones')} :</span>
        <button onClick={() => setZmode('through')} style={btn(zmode === 'through')}>{tx('À travers la coque', 'Through hull')}</button>
        <button onClick={() => setZmode('normal')} style={btn(zmode === 'normal')}>{tx('Normal', 'Normal')}</button>
        <button onClick={() => setZmode('off')} style={btn(zmode === 'off')}>{tx('Masquées', 'Hidden')}</button>
        <span>{tx('(toucher la légende pour filtrer un type)', '(tap the legend to filter a type)')}</span>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '460px' }} />
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11px', color: C.dim }}>
        {Object.keys(HAZARDS).map((k) => (<span key={k} role="button" tabIndex={0} aria-pressed={!hide[k]} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHide({ ...hide, [k]: !hide[k] }); } }} onClick={() => setHide({ ...hide, [k]: !hide[k] })} style={{ cursor: 'pointer', opacity: hide[k] ? 0.35 : 1, textDecoration: hide[k] ? 'line-through' : 'none' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: HAZARDS[k].color, marginRight: 4 }} />{pick(lang, HAZARDS[k].label.fr, HAZARDS[k].label.en)}</span>))}
        <span><span style={{ display: 'inline-block', width: 14, height: 2, background: '#ef4444', marginRight: 4, verticalAlign: 'middle' }} />{tx('Conflit', 'Conflict')}</span>
      </div>
      <div style={{ fontSize: '11px', color: C.dim, marginTop: '6px' }}>{tx('Glisser pour tourner · molette ou pincer pour zoomer', 'Drag to rotate · scroll or pinch to zoom')}</div>
    </div>
  );
}
