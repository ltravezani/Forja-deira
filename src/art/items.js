// ---------- itens: modelos 3D do loot e brilho de refino (+10 a +15) ----------
import { GEO, part, pivot } from './geometry.js';
import { glowShared, toon } from './materials.js';
import { toonMaterial } from './stylize.js';
import { texDetail } from './textures.js';
import { renderer } from '../engine/renderer.js';

const D = (kind) => texDetail(kind);
const _own = new Map();
/** Material compartilhado criado sob demanda (vidro, asas): nunca liberado junto do loot. */
function shared(key, make) {
  let m = _own.get(key);
  if (!m) { m = make(); m.userData.shared = true; _own.set(key, m); }
  return m;
}
/** Metal da peça: aço claro puxado para a cor da raridade (mais forte nos tiers altos). */
function tintHex(base, col, f) {
  return new THREE.Color(base).lerp(new THREE.Color(col), f).getHex();
}

/**
 * Modelo 3D de um item caído no chão, já apresentado (inclinado para a câmera alta).
 * kind: sword/staff/bow/helm/armor/gloves/boots/ring/pendant/wings/jewel/potion/gold.
 * o: {col (cor da raridade/joia, número), tier}
 */
export function buildItemModel(kind, o) {
  const col = o.col != null ? o.col : 0xe8e2d4, tier = o.tier || 0;
  const hi = tier >= 4; // tiers altos ganham filetes dourados e gemas
  const root = new THREE.Group();
  const steel = toon(tintHex(0xc8d0dc, col, 0.22 + tier * 0.03), 0, 0, { metal: 0.85, rough: 0.3, env: 1.1, map: D('metal'), nscale: 0.4 });
  const plate = toon(tintHex(0x8a8e98, col, 0.3 + tier * 0.03), 0, 0, { metal: 0.75, rough: 0.42, map: D('metal'), nscale: 0.6 });
  const gold = toon(0xc9a24a, 0, 0, { metal: 0.9, rough: 0.32, env: 1.2 });
  const leather = toon(0x4a2c1a, 0, 0, { rough: 0.85, map: D('leather') });
  const wood = toon(0x5a3820, 0, 0, { rough: 0.9, map: D('leather') });
  const gem = glowShared(col, 0.95);
  const halo = glowShared(col, 0.28);
  const trim = hi ? gold : plate;
  const h = pivot(root, 0, 0, 0);
  if (kind === 'sword') {
    h.rotation.set(0, 0, 1.15);
    part(GEO.blade, steel, 0.16, 0.95, 0.045, 0, 0.62, 0, h);
    part(GEO.box, toon(0x2a2a30, 0, 0, { metal: 0.6, rough: 0.4 }), 0.03, 0.62, 0.05, 0, 0.5, 0, h, false); // sulco da lâmina
    part(GEO.box, trim, 0.46, 0.07, 0.1, 0, 0.12, 0, h);
    for (const sx of [-1, 1]) part(GEO.cone4, trim, 0.08, 0.12, 0.08, sx * 0.25, 0.12, 0, h, false).rotation.z = -sx * Math.PI / 2;
    part(GEO.oct, gem, 0.08, 0.1, 0.06, 0, 0.12, 0.05, h, false);
    part(GEO.cyl, leather, 0.075, 0.28, 0.075, 0, -0.05, 0, h);
    part(GEO.sphS, trim, 0.13, 0.13, 0.13, 0, -0.22, 0, h);
  } else if (kind === 'staff') {
    h.rotation.set(0, 0, 1.2);
    part(GEO.cyl6, wood, 0.08, 1.2, 0.08, 0, 0.1, 0, h);
    for (const y of [-0.35, 0.2]) part(GEO.cyl, trim, 0.1, 0.05, 0.1, 0, y, 0, h, false);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const c = part(GEO.cone, wood, 0.06, 0.34, 0.06, Math.cos(a) * 0.1, 0.78, Math.sin(a) * 0.1, h); c.rotation.z = -Math.cos(a) * 0.5; c.rotation.x = Math.sin(a) * 0.5; }
    part(GEO.sphS, gem, 0.22, 0.22, 0.22, 0, 0.86, 0, h, false);
    part(GEO.sphS, halo, 0.46, 0.46, 0.46, 0, 0.86, 0, h, false);
  } else if (kind === 'bow') {
    h.rotation.set(Math.PI / 2, 0, 0);
    const b = part(GEO.torus, toon(tintHex(0x5a3418, col, 0.15), 0, 0, { rough: 0.7, map: D('leather') }), 1.0, 1.0, 1.5, 0, 0, 0, h);
    b.rotation.z = -Math.PI / 2;
    part(GEO.cyl, leather, 0.08, 0.2, 0.08, 0.02, 0, 0, h);
    for (const y of [-0.46, 0.46]) part(GEO.oct, hi ? gem : trim, 0.07, 0.09, 0.07, 0.04 + Math.abs(y) * -0.02, y, 0, h, false);
    part(GEO.cyl, toon(0xe8e0d0), 0.012, 1.0, 0.012, -0.02, 0, 0, h, false);
    const ar = part(GEO.cyl6, toon(0x8a6a44), 0.02, 0.9, 0.02, 0.1, 0.05, 0.03, h, false); ar.rotation.z = 0.08;
    part(GEO.cone4, steel, 0.06, 0.1, 0.03, 0.14, 0.54, 0.03, h, false);
  } else if (kind === 'helm') {
    h.position.y = 0.18; h.rotation.x = 0.35;
    part(GEO.cyl, plate, 0.5, 0.36, 0.52, 0, 0, 0, h);
    part(GEO.sphH, plate, 0.5, 0.28, 0.52, 0, 0.18, 0, h);
    part(GEO.box, toon(0x050505), 0.36, 0.05, 0.08, 0, 0.04, 0.24, h, false);
    part(GEO.box, trim, 0.06, 0.4, 0.54, 0, 0.12, 0, h, false);
    part(GEO.cyl, trim, 0.53, 0.05, 0.55, 0, -0.16, 0, h, false);
    part(GEO.oct, gem, 0.07, 0.09, 0.05, 0, 0.26, 0.24, h, false);
    const pl = part(GEO.cone, toon(tintHex(0x7a1a1a, col, 0.35), 0, 0, { rough: 0.9, map: D('cloth') }), 0.1, 0.4, 0.26, 0, 0.42, -0.08, h); pl.rotation.x = -0.6;
  } else if (kind === 'armor') {
    h.position.y = 0.2; h.rotation.x = -0.55;
    part(GEO.cyl, plate, 0.62, 0.5, 0.4, 0, 0, 0, h);
    part(GEO.sphS, plate, 0.64, 0.3, 0.42, 0, 0.2, 0, h, false);
    for (const sx of [-1, 1]) {
      part(GEO.sphH, plate, 0.3, 0.24, 0.3, sx * 0.34, 0.2, 0, h);
      part(GEO.sphH, trim, 0.24, 0.16, 0.24, sx * 0.36, 0.22, 0, h, false).rotation.z = sx * 0.25;
    }
    part(GEO.box, trim, 0.07, 0.42, 0.06, 0, 0, 0.19, h, false);
    part(GEO.cyl, leather, 0.54, 0.07, 0.36, 0, -0.2, 0, h, false);
    part(GEO.oct, gem, 0.08, 0.1, 0.05, 0, 0.14, 0.21, h, false);
  } else if (kind === 'gloves') {
    h.position.y = 0.08;
    for (const sx of [-1, 1]) {
      const g = pivot(h, sx * 0.2, 0, 0); g.rotation.set(Math.PI / 2 - 0.2, 0, sx * 0.35);
      part(GEO.taper, plate, 0.17, 0.26, 0.18, 0, 0, 0, g);
      part(GEO.cyl, trim, 0.19, 0.05, 0.2, 0, -0.12, 0, g, false);
      part(GEO.sphS, leather, 0.22, 0.2, 0.18, 0, 0.19, 0, g);
      for (let f = 0; f < 4; f++) part(GEO.cyl6, plate, 0.045, 0.14, 0.045, -0.07 + f * 0.047, 0.32, 0.02, g, false);
      part(GEO.oct, gem, 0.05, 0.06, 0.04, 0, 0.02, 0.1, g, false);
    }
  } else if (kind === 'boots') {
    h.position.y = 0.02;
    for (const sx of [-1, 1]) {
      const b = pivot(h, sx * 0.18, 0, 0); b.rotation.y = sx * 0.25;
      part(GEO.taper, plate, 0.2, 0.34, 0.22, 0, 0.26, 0, b).rotation.x = Math.PI;
      part(GEO.box, leather, 0.22, 0.14, 0.38, 0, 0.07, 0.07, b);
      part(GEO.sphS, leather, 0.22, 0.16, 0.2, 0, 0.09, 0.24, b, false);
      part(GEO.cyl, trim, 0.23, 0.05, 0.25, 0, 0.42, 0, b, false);
      part(GEO.box, trim, 0.16, 0.05, 0.1, 0, 0.14, 0.22, b, false);
    }
  } else if (kind === 'ring') {
    h.position.y = 0.12; h.rotation.x = 1.1;
    part(GEO.torusF, gold, 0.36, 0.36, 0.7, 0, 0, 0, h);
    part(GEO.cyl6, gold, 0.12, 0.06, 0.12, 0, 0.19, 0, h, false);
    part(GEO.oct, gem, 0.14, 0.18, 0.14, 0, 0.28, 0, h, false);
    part(GEO.sphS, halo, 0.34, 0.34, 0.34, 0, 0.28, 0, h, false);
  } else if (kind === 'pendant') {
    h.position.y = 0.08; h.rotation.x = 1.25;
    const ch = part(GEO.torusF, gold, 0.6, 0.6, 0.18, 0, 0.18, 0, h, false); ch.rotation.x = Math.PI / 2 - 0.2;
    part(GEO.oct, toon(tintHex(0x9a7a3a, col, 0.2), 0, 0, { metal: 0.9, rough: 0.3 }), 0.24, 0.34, 0.08, 0, -0.16, 0, h);
    part(GEO.oct, gem, 0.14, 0.2, 0.1, 0, -0.16, 0.02, h, false);
    part(GEO.sphS, halo, 0.36, 0.36, 0.36, 0, -0.16, 0, h, false);
  } else if (kind === 'wings') {
    h.position.y = 0.1; h.rotation.x = -1.1;
    const m = shared('wing|' + col, () => toonMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9, emissive: new THREE.Color(col), emissiveIntensity: 0.45 }, { rim: 0.5 }));
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(GEO.wing, m);
      w.scale.set(sx * 0.3, 0.3, 0.3); w.rotation.z = sx * 0.1;
      h.add(w);
    }
    part(GEO.oct, gem, 0.08, 0.1, 0.06, 0, 0.05, 0.02, h, false);
  } else if (kind === 'jewel') {
    h.position.y = 0.26;
    const facet = shared('jewel|' + col, () => toonMaterial({ color: col, flatShading: true, transparent: true, opacity: 0.85, emissive: new THREE.Color(col), emissiveIntensity: 0.35 }, { rim: 0.7, spec: 1.2 }));
    part(GEO.oct, facet, 0.34, 0.46, 0.34, 0, 0, 0, h);
    part(GEO.oct, gem, 0.18, 0.26, 0.18, 0, 0, 0, h, false);
    part(GEO.sphS, halo, 0.6, 0.6, 0.6, 0, 0, 0, h, false);
  } else if (kind === 'potion') {
    h.position.y = 0.05;
    const glass = shared('glass', () => toonMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.32, depthWrite: false }, { rim: 0.9, spec: 1.4 }));
    part(GEO.sphS, glowShared(col, 0.85), 0.3, 0.24, 0.3, 0, 0.17, 0, h, false); // líquido
    part(GEO.sphS, glass, 0.36, 0.36, 0.36, 0, 0.2, 0, h, false);
    part(GEO.cyl, glass, 0.12, 0.14, 0.12, 0, 0.42, 0, h, false);
    part(GEO.cyl, toon(0x8a6a42, 0, 0, { rough: 0.95 }), 0.13, 0.08, 0.13, 0, 0.52, 0, h, false); // rolha
    part(GEO.sphS, toon(0xffffff, 0xffffff, 0.8), 0.06, 0.1, 0.03, -0.1, 0.28, 0.13, h, false); // brilho do vidro
  } else if (kind === 'talisman') {
    // medalhão dourado em pé, com um trevo de quatro folhas que brilha
    h.position.y = 0.32;
    part(GEO.cyl, gold, 0.5, 0.07, 0.5, 0, 0, 0, h).rotation.x = Math.PI / 2;
    part(GEO.cyl, toon(0x0e3a1a, 0, 0, { rough: 0.6 }), 0.4, 0.075, 0.4, 0, 0, 0.004, h).rotation.x = Math.PI / 2;
    for (const [x, y] of [[0, 0.09], [0, -0.09], [0.09, 0], [-0.09, 0]]) part(GEO.sphS, gem, 0.12, 0.12, 0.05, x, y, 0.045, h, false);
    part(GEO.torusF, gold, 0.16, 0.16, 0.3, 0, 0.29, 0, h).rotation.y = Math.PI / 2;
    part(GEO.sphS, halo, 0.75, 0.75, 0.4, 0, 0, 0, h, false);
  } else if (kind === 'gold') {
    const coin = toon(0xffd24a, 0xaa7a00, 0.35, { metal: 0.9, rough: 0.3, env: 1.2 });
    const n = Math.min(7, 2 + (o.amount || 1));
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, r = i ? 0.1 + (i % 3) * 0.05 : 0;
      const c = part(GEO.cyl, coin, 0.2, 0.04, 0.2, Math.cos(a) * r, 0.02 + (i < 3 ? i * 0.04 : 0.01), Math.sin(a) * r, h);
      c.rotation.set(i ? (i % 2 ? 0.3 : -0.25) : 0, 0, i ? 0.2 : 0);
    }
  } else {
    part(GEO.box, plate, 0.5, 0.18, 0.7, 0, 0.1, 0, h);
  }
  return root;
}

// ---------- brilho de refino ----------
// Itens +10 em diante brilham: +10 é um fio de luz e poucas faíscas; a cada
// nível a aura engrossa, as faíscas aumentam e a cor esquenta; no +15 (máximo)
// o herói inteiro ganha uma coluna de luz e um halo no chão.

/** Força do brilho: 0 abaixo de +10, 0.25 no +10 até 1 no +15. */
export function refineK(plus) {
  return plus >= 10 ? 0.25 + (Math.min(15, plus) - 10) * 0.15 : 0;
}
/** Cor por faixa: +10/11 azul-gelo, +12/13 dourado, +14 laranja-fogo, +15 branco-dourado. */
export function refineColor(plus) {
  return plus >= 15 ? 0xfff0b0 : plus >= 14 ? 0xff8a3a : plus >= 12 ? 0xffc84a : 0x8ad8ff;
}

const SPARK_VS = 'attribute vec4 seed; uniform float uTime; uniform float uScale; uniform float uSize; uniform vec3 uMin; uniform vec3 uBox; uniform vec3 uAxis; varying float vA;' +
  'void main(){ vec3 f = fract(seed.xyz + uAxis * uTime * (0.18 + seed.w * 0.3));' +
  ' float along = dot(f, uAxis); vA = sin(along * 3.14159) * (0.5 + 0.5 * sin(uTime * 7.0 + seed.w * 40.0));' +
  ' vec4 mv = modelViewMatrix * vec4(uMin + f * uBox, 1.0); gl_PointSize = uSize * (0.55 + seed.w * 0.9) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }';
// faísca em estrela: miolo redondo + cruz fina
const SPARK_FS = 'uniform vec3 uColor; uniform float uK; varying float vA;' +
  'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;' +
  ' float a = pow(1.0 - r * 2.0, 2.0); float cr = max(0.0, 1.0 - abs(d.x) * 16.0) * (1.0 - r * 2.0) + max(0.0, 1.0 - abs(d.y) * 16.0) * (1.0 - r * 2.0);' +
  ' gl_FragColor = vec4(uColor * (a + cr * 0.8) * vA * uK, 1.0); }';

/** Nuvem de faíscas subindo pelo eixo mais longo de uma caixa (coordenadas locais do alvo). */
function sparkles(parent, box, n, color, k, size) {
  const sz = new THREE.Vector3(); box.getSize(sz);
  const ax = sz.x >= sz.y && sz.x >= sz.z ? [1, 0, 0] : sz.y >= sz.z ? [0, 1, 0] : [0, 0, 1];
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: SPARK_VS, fragmentShader: SPARK_FS,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uSize: { value: size }, uMin: { value: box.min.clone() }, uBox: { value: sz }, uAxis: { value: new THREE.Vector3(...ax) }, uColor: { value: new THREE.Color(color) }, uK: { value: 0.6 + k * 0.6 } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.userData.ownGeo = true;
  parent.add(pts);
  return pts;
}
/** Caixa das malhas sólidas de um objeto, no espaço local dele. */
function localBox(obj) {
  const box = new THREE.Box3(), tmp = new THREE.Box3(), inv = new THREE.Matrix4();
  obj.updateMatrixWorld(true);
  inv.copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    box.union(tmp);
  });
  return box;
}

/**
 * Aplica o brilho de refino a um objeto (arma na mão ou item no chão):
 * casca aditiva em volta de cada peça sólida + faíscas subindo pela peça.
 * Devolve {update(t)} ou null abaixo de +10.
 */
export function attachRefineFx(obj, plus, o) {
  const k = refineK(plus);
  if (!k) return null;
  o = o || {};
  const color = refineColor(plus);
  const pad = (o.pad || 0.05) * (0.6 + k);
  const shell = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const solids = [];
  obj.traverse((m) => { if (m.isMesh && !(m.material && m.material.blending === THREE.AdditiveBlending) && !m.material.transparent) solids.push(m); });
  for (const m of solids) {
    const s = new THREE.Mesh(m.geometry, shell);
    s.position.copy(m.position); s.quaternion.copy(m.quaternion);
    s.scale.set(Math.abs(m.scale.x) + pad, Math.abs(m.scale.y) + pad, Math.abs(m.scale.z) + pad);
    s.castShadow = false; s.renderOrder = 2;
    m.parent.add(s);
  }
  const box = localBox(obj);
  box.expandByScalar(0.08 + k * 0.1);
  const pts = sparkles(obj, box, Math.round(8 + k * 34), color, k, o.size || 0.1 + k * 0.08);
  return {
    k, color,
    update(t) {
      shell.opacity = (0.12 + k * 0.32) * (0.75 + 0.25 * Math.sin(t * (3 + k * 3)));
      pts.material.uniforms.uTime.value = t;
      pts.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
    },
  };
}

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.42, 0, Math.PI * 2); g.stroke();
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
/**
 * Aura do herói pelo refino da armadura: faíscas subindo em volta do corpo
 * (mais densas com o nível) e, com halo (peça +15), um anel de luz pulsante no chão.
 * h = altura do modelo (unidades locais).
 */
export function attachHeroAura(root, plus, h, halo) {
  const k = refineK(plus);
  if (!k) return null;
  const color = refineColor(plus);
  let disc = null;
  if (halo) {
    disc = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: glowTexture(), color: refineColor(15), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    disc.renderOrder = 2;
    root.add(disc);
  }
  const box = new THREE.Box3(new THREE.Vector3(-0.7, 0.1, -0.7), new THREE.Vector3(0.7, h, 0.7));
  const pts = sparkles(root, box, Math.round(6 + k * 40), color, k, 0.1 + k * 0.08);
  return {
    update(t) {
      if (disc) {
        disc.material.opacity = 0.35 + 0.2 * Math.sin(t * 2.5);
        disc.rotation.z = t * 0.4;
        disc.scale.setScalar(2.5 + Math.sin(t * 2.5) * 0.15);
      }
      pts.material.uniforms.uTime.value = t;
      pts.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
    },
  };
}
