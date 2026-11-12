import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { HAZARDS, HAZARD_KEYS, zoneConflicts, zoneTitle } from '../lib/model.js';
import { hullStations, planX, planZ, roomsOf } from '../lib/hull.js';
import { pick } from '../lib/i18n.js';
import { prefersReducedMotion } from '../lib/platform.js';

function buildHull(B, L, D) {
  const st = hullStations(), m = 13, pos = [], idx = [], ln = [];
  st.forEach(([y, hb]) => { const z = planZ(y, L), b = Math.max(hb, 0.001) * B / 2; for (let j = 0; j < m; j++) { const x = b * (-1 + (2 * j) / (m - 1)); pos.push(x, D * Math.pow(Math.abs(x) / b, 8), z); } });
  for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + m; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const seg = (p, q) => ln.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
  for (let i = 0; i < st.length - 1; i++) [0, 3, 6, 9, 12].forEach((j) => seg(i * m + j, (i + 1) * m + j));
  for (let i = 0; i < st.length; i += 3) for (let j = 0; j < m - 1; j++) seg(i * m + j, i * m + j + 1);
  const g = new THREE.BufferGeometry(), lg = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3));
  return { g, lg };
}

// The active vessel in 3D, zones inside a see-through hull. Tap a zone to open its sheet.
export default function Vessel3D({ ship, lang, tx, selectedId, onSelect }) {
  const mountRef = useRef(null), api = useRef({}), cb = useRef({});
  cb.current.onSelect = onSelect;
  const [xray, setXray] = useState(true);
  const [labels, setLabels] = useState(true);
  const [hide, setHide] = useState({});
  const [failed, setFailed] = useState(false);
  const sig = JSON.stringify([ship.id, xray, labels, lang, hide, selectedId, ship.dock, ship.name, ship.decks.map((d) => [d.id, d.layout, d.aiRooms ? d.aiRooms.length : 0, d.zones.map((z) => [z.id, z.type, z.x, z.y, z.w, z.h, z.status])])]);

  useEffect(() => {
    const el = mountRef.current; if (!el) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { setFailed(true); return undefined; }
    const size = () => [Math.max(200, el.clientWidth), Math.max(240, el.clientHeight)];
    let [w, h] = size();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h); renderer.setClearColor(0x0b0b0c);
    const cv = renderer.domElement; el.appendChild(cv);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, w / h, 1, 3000), world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(200, 400, 150); scene.add(sun);
    const cam = { th: 0.95, ph: 1.0, r: 330, ty: 10 };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pts = new Map(); let pinch = 0, downAt = null;
    const pick3d = (e) => {
      const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(api.current.zoneMeshes || [], false)[0];
      if (hit && hit.object.userData.zoneId) cb.current.onSelect(hit.object.userData.zoneId);
    };
    const down = (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = pts.size === 1 ? { x: e.clientX, y: e.clientY } : null;
      if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); }
    };
    const move = (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [p1, p2] = [...pts.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (pinch && d) cam.r = Math.min(900, Math.max(40, cam.r * pinch / d));
        pinch = d; return;
      }
      cam.th -= (e.clientX - p.x) * 0.008;
      cam.ph = Math.min(2.7, Math.max(0.15, cam.ph - (e.clientY - p.y) * 0.008));
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e) => {
      if (downAt && pts.size === 1 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) pick3d(e);
      pts.delete(e.pointerId); pinch = 0; downAt = null;
    };
    const wheel = (e) => { e.preventDefault(); cam.r = Math.min(900, Math.max(40, cam.r * (1 + e.deltaY * 0.001))); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    api.current = { world, cam, zoneMeshes: [], pulse: [] };
    const still = prefersReducedMotion();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!still) { const t = performance.now() / 400; api.current.pulse.forEach((m) => { m.opacity = 0.42 + 0.22 * Math.sin(t); }); }
      camera.position.set(cam.r * Math.sin(cam.ph) * Math.sin(cam.th), cam.ty + cam.r * Math.cos(cam.ph), cam.r * Math.sin(cam.ph) * Math.cos(cam.th));
      camera.lookAt(0, cam.ty, 0);
      renderer.render(scene, camera);
    };
    loop();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { [w, h] = size(); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }) : null;
    if (ro) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf); if (ro) ro.disconnect();
      world.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
      renderer.dispose(); if (el.contains(cv)) el.removeChild(cv);
    };
  }, []);

  useEffect(() => {
    const a = api.current; if (!a.world) return;
    while (a.world.children.length) { const o = a.world.children.pop(); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); }
    a.zoneMeshes = []; a.pulse = [];
    const mkLabel = (text, color, font, sw, sh) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 96;
      const x = c.getContext('2d'); x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 48);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
      sp.scale.set(sw, sh, 1); sp.renderOrder = 9; return sp;
    };
    const s = ship, d = s.dock || {}, L = d.shipLength || 120, B = d.shipWidth || 20, D = B * 0.55, hD = D * 0.28;
    const g = new THREE.Group();
    if (a.cam && a.fitFor !== s.id) { a.cam.r = Math.max(50, L * 0.85); a.cam.ty = D / 2; a.fitFor = s.id; }
    const { g: hg, lg } = buildHull(B, L, D);
    const hmat = xray ? new THREE.MeshBasicMaterial({ color: 0xd1d1d6, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: 0x636366, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(hg, hmat));
    if (!xray) {
      const sp0 = new THREE.Shape(), stt = hullStations();
      stt.forEach(([y, hb], n) => { const x = -hb * (B / 2), z = -planZ(y, L); if (n) sp0.lineTo(x, z); else sp0.moveTo(x, z); });
      for (let n = stt.length - 1; n >= 0; n--) sp0.lineTo(stt[n][1] * (B / 2), -planZ(stt[n][0], L));
      const cg = new THREE.ShapeGeometry(sp0); cg.rotateX(-Math.PI / 2); cg.translate(0, D, 0);
      g.add(new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0x8e8e93, side: THREE.DoubleSide })));
    }
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd1d1d6, transparent: true, opacity: 0.55 })));
    if (labels) { const nm = mkLabel(s.name || '', '#ffffff', '600 44px -apple-system, BlinkMacSystemFont, Inter, sans-serif', 52, 10); nm.position.set(0, D + 10, 0); g.add(nm); }
    const st = hullStations(), decks = s.decks || [], inner = decks.filter((x) => x.layout !== 'technical'), dh = (D - hD) / Math.max(inner.length, 1);
    const ring = (hh) => { const f = Math.pow(Math.max(hh, 0.01) / D, 0.125), A = [], Z = []; st.forEach(([y, hb]) => { const b = hb * (B / 2) * f, z = planZ(y, L); A.push(new THREE.Vector3(-b, hh, z)); Z.unshift(new THREE.Vector3(b, hh, z)); }); return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...A, ...Z]), new THREE.LineBasicMaterial({ color: 0x8e8e93, transparent: true, opacity: 0.4 })); };
    [hD, ...inner.map((_, k) => hD + (k + 1) * dh)].forEach((hh) => g.add(ring(hh)));
    decks.forEach((dk) => {
      const tech = dk.layout === 'technical', k = inner.indexOf(dk), b0 = tech ? 0 : hD + k * dh, bh = tech ? hD : dh, mid = b0 + bh / 2, fx = Math.pow((b0 + bh / 2) / D, 0.125);
      if (xray) roomsOf(dk).forEach((r) => {
        const rg = new THREE.BoxGeometry((r.w / 104) * B * fx, bh * 0.92, (r.h / 266) * L), pos = [planX(r.x + r.w / 2, B) * fx, mid, planZ(r.y + r.h / 2, L)];
        const re = new THREE.LineSegments(new THREE.EdgesGeometry(rg), new THREE.LineBasicMaterial({ color: 0x8e8e93, transparent: true, opacity: 0.32 }));
        rg.dispose(); re.position.set(...pos); g.add(re);
        if (labels) { const lb = mkLabel(pick(lang, r.fr, r.en), 'rgba(235,235,245,0.6)', '500 34px -apple-system, BlinkMacSystemFont, Inter, sans-serif', 26, 5); lb.position.set(...pos); g.add(lb); }
      });
      const zp = {};
      (dk.zones || []).forEach((z) => {
        if (z.status === 'done' || hide[z.type]) return;
        const xs = z.x * 2, ys = z.y * 2.8, ws = z.w * 2, hs = z.h * 2.8, inside = xs >= 48 && xs + ws <= 152, under = tech && inside && z.type !== 'confined', f2 = inside ? fx : 1;
        const col = new THREE.Color((HAZARDS[z.type] || {}).color || '#8e8e93'), sel = z.id === selectedId;
        const hgt = !inside ? D : under ? 3.3 : bh * 0.8, yc = !inside ? D / 2 : under ? 0.85 : mid;
        zp[z.id] = [planX(xs + ws / 2, B) * f2, yc, planZ(ys + hs / 2, L)];
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: sel ? 0.7 : z.status === 'progress' ? 0.42 : 0.16, depthTest: false });
        const box = new THREE.Mesh(new THREE.BoxGeometry((ws / 104) * B * f2, hgt, (hs / 266) * L), mat);
        box.position.set(...zp[z.id]); box.renderOrder = 5; box.userData.zoneId = z.id; g.add(box); a.zoneMeshes.push(box);
        const eg = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: sel ? 0xffffff : col, depthTest: false }));
        eg.position.copy(box.position); eg.renderOrder = 6; g.add(eg);
        if (z.type === 'hot' && z.status === 'progress' && !sel) a.pulse.push(mat);
      });
      zoneConflicts(dk.zones || []).forEach(({ z1, z2 }) => {
        if (!zp[z1.id] || !zp[z2.id]) return;
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...zp[z1.id]), new THREE.Vector3(...zp[z2.id])]), new THREE.LineBasicMaterial({ color: 0xff453a, depthTest: false }));
        ln.renderOrder = 7; g.add(ln);
      });
    });
    a.world.add(g);
  }, [sig]);

  const view = (ph) => { if (api.current.cam) api.current.cam.ph = ph; };
  const zones = ship.decks.flatMap((dk) => dk.zones.filter((z) => z.status !== 'done' && !hide[z.type]));
  return (
    <div>
      <div className="scene-tools">
        <button type="button" className="btn sm toggle" aria-pressed={xray} onClick={() => setXray(!xray)}>{tx('Coque transparente', 'See-through hull')}</button>
        <button type="button" className="btn sm toggle" aria-pressed={labels} onClick={() => setLabels(!labels)}>{tx('Noms des locaux', 'Room names')}</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={() => view(0.95)}>{tx('Trois quarts', 'Three-quarter')}</button>
        <button type="button" className="btn sm" onClick={() => view(1.57)}>{tx('Profil', 'Side')}</button>
        <button type="button" className="btn sm" onClick={() => view(2.4)}>{tx('Dessous', 'Below')}</button>
      </div>
      <div className="scene" ref={mountRef} role="img" aria-label={tx('Vue 3D de ', '3D view of ') + ship.name + ', ' + zones.length + tx(' zones actives : ', ' active zones: ') + zones.map((z) => zoneTitle(z, lang)).join(', ')}>
        {failed && <div className="scene-fail">{tx('La vue 3D n’est pas disponible sur cet appareil. Le plan 2D reste complet.', '3D isn’t available on this device. The 2D plan has everything.')}</div>}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {HAZARD_KEYS.map((k) => (
          <button key={k} type="button" className={'hz-' + k} aria-pressed={!hide[k]} onClick={() => setHide({ ...hide, [k]: !hide[k] })}>
            <span className="swatch" aria-hidden="true" />{pick(lang, HAZARDS[k].label.fr, HAZARDS[k].label.en)}
          </button>))}
        <span><span className="rule" aria-hidden="true" />{tx('Conflit', 'Conflict')}</span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>{tx('Glissez pour tourner, pincez ou faites défiler pour zoomer, touchez une zone pour l’ouvrir. Touchez un danger pour le masquer.', 'Drag to turn, pinch or scroll to zoom, tap a zone to open it. Tap a hazard to hide it.')}</p>
    </div>
  );
}
