// What depends on where the app runs: saving a file to the device and asking Claude to read a plan.
// Inside a claude.ai artifact these go through `window.claude.use(...)`; everywhere else the app
// falls back to a plain browser download and to the sample analysis.

const asked = {};
function capability(name) {
  if (!asked[name]) {
    asked[name] = (async () => {
      try {
        if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return null;
        return (await window.claude.use(name)) || null;
      } catch (e) { return null; }
    })();
  }
  return asked[name];
}
// Ask early: a host that never answers takes ten seconds to say so.
export function warmCapabilities() { capability('downloads'); capability('sample'); }

// Resolves 'saved', 'declined' or 'failed'. Never throws.
export async function saveFile(filename, text, mime) {
  const downloads = await capability('downloads');
  if (downloads) {
    try { await downloads.save({ filename, data: text }); return 'saved'; }
    catch (e) { return e && e.code === 'declined' ? 'declined' : 'failed'; }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch (e) { return 'failed'; }
}

// Reads a picked image and scales it down. Resolves a canvas.
export function readImage(file, maxW) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const PLAN_PROMPT = [
  'The attached image is a ship general arrangement plan (or part of one).',
  'Identify at most 3 distinct decks. For each deck give:',
  '- "name": a short deck name, in French;',
  '- "layout": one of "main", "cabins", "machinery", "technical";',
  '- "compartments": at most 8 rooms, each {"fr": French name, "en": English name, "x", "y", "w", "h"} in percent (0-100) of an upright deck rectangle with the bow at the top;',
  '- "suggestedZones": at most 3 hazard zones likely during a dry docking, each {"type": one of "hot", "confined", "height", "blast", "x", "y", "w", "h" in percent, "workFr": short French description of the work, "workEn": the same in English}.',
  'Reply with only one JSON object of the form {"decks": [...]}. Example: {"decks":[{"name":"Pont principal","layout":"main","compartments":[{"fr":"Atelier","en":"Workshop","x":10,"y":20,"w":35,"h":15}],"suggestedZones":[{"type":"hot","x":30,"y":40,"w":20,"h":12,"workFr":"Réparation tuyauterie","workEn":"Piping repair"}]}]}',
].join('\n');

// Asks Claude to read the plan. Resolves { decks } or null when it cannot be asked here
// (not a claude.ai artifact, images not supported, the viewer declined, or the reply was unusable).
export async function analysePlan(canvas, signal) {
  const sample = await capability('sample');
  if (!sample) return null;
  try {
    const caps = await sample.limits();
    if (!caps || !caps.images) return null;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return null;
    const data = await sample.json(PLAN_PROMPT, { images: blob, signal });
    if (!data || !Array.isArray(data.decks) || !data.decks.length) return null;
    return { decks: data.decks.slice(0, 3) };
  } catch (e) {
    if (e && e.code === 'cancelled') throw e;
    return null;
  }
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
