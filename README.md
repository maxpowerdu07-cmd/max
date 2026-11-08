# Drydock Safety Demo

Démo 3D (React + three.js) de suivi sécurité en cale sèche.

```bash
npm install
npm run dev
```

Notes : `window.storage` (API artifact claude.ai) est remplacé par un shim localStorage.
L'analyse de plan par IA appelle l'API Anthropic sans clé hors claude.ai → bascule sur les données de démo.
