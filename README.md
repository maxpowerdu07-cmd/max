# DryDock Safety

Coordination sécurité d'un navire en cale sèche (bêta) : zones de travaux par pont, permis, tests
atmosphériques, fire watch, registre d'accès, et ce que coûtent les arrêts, la cale et le matériel.
React 18 + three.js, interface sombre inspirée d'iOS, en français (consignes aussi en anglais),
anglais et bulgare.

```bash
npm install
npm run dev              # http://localhost:5173
npm run build:artifact   # page unique pour l'artifact claude.ai -> artifact/drydock-safety-ios.html
```

Code coordination de la démo : `DRYDOCK2026`. Sans code, l'app est en lecture seule (tout le monde
peut quand même pointer les entrées et sorties de zone).

## Écrans

- **Aperçu** : profil du navire avec toutes les zones, points à traiter, échéances (tests gaz,
  permis, fin de veille incendie, sortie de cale), journal, rapport journalier exportable.
- **Plan** : pont par pont, ajout et déplacement des zones, fiche de zone (statut, accès, permis,
  tests gaz, fire watch, EPI), vue 3D du navire. Lecture d'un plan général par l'IA.
- **Travaux** : par état (bloqués, à régulariser, à préparer, prêts, terminés) ou par entreprise.
- **Équipe** : fire watch (en poste, veille après travaux, à libérer), personnes à bord.
- **Coûts** : main-d'œuvre exposée à un arrêt, actions qui font économiser, jours de cale et retard
  projeté, heures pointées par entreprise (export CSV), matériel en location inactif, hypothèses de
  tarifs modifiables.

## Code

- `src/lib/model.js` : données d'exemple et `analyze()`, qui calcule l'état de chaque zone, les
  alertes, les échéances, les heures et les coûts.
- `src/lib/i18n.js` : langues et formats. `src/lib/platform.js` : export de fichiers et lecture IA
  (via `window.claude` dans un artifact, repli navigateur sinon).
- `src/App.jsx` : état, synchronisation (`window.storage`, shim localStorage), actions.
- `src/views/*` : les écrans. `src/components/*` : feuilles, menus, profil du navire, vue 3D.
- `src/styles.css` : jetons de couleur et composants.
