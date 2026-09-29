// =============================================================================
// Kit de adereços: geometrias montadas a partir de primitivas, com cor por
// vértice (uma só malha e um só material por tipo, desenhados com instancing).
// =============================================================================
import { GEO } from '../art/geometry.js';
import { toonMaterial } from '../art/stylize.js';
import { texGrime, texShingles } from '../art/textures.js';
import { V3 } from '../core/util.js';

const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _kp = new V3(), _ks = new V3();
/** Grava a transformação (posição, rotação Euler XYZ, escala) na instância `i` de um InstancedMesh. */
export function setInstance(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
  _ke.set(rx, ry, rz); _kq.setFromEuler(_ke);
  _kp.set(x, y, z); _ks.set(sx, sy, sz);
  _km.compose(_kp, _kq, _ks);
  mesh.setMatrixAt(i, _km);
}
/** Parte de adereço: geometria, cor, posição, escala, rotação. */
const KP = (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) => ({ geo, color, x, y, z, sx, sy: sy == null ? sx : sy, sz: sz == null ? sx : sz, rx: rx || 0, ry: ry || 0, rz: rz || 0 });
function mergeParts(parts) {
  const geos = [];
  let n = 0;
  for (const p of parts) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
    _ke.set(p.rx, p.ry, p.rz); _kq.setFromEuler(_ke); _kp.set(p.x, p.y, p.z); _ks.set(p.sx, p.sy, p.sz);
    _km.compose(_kp, _kq, _ks);
    g.applyMatrix4(_km);
    geos.push([g, new THREE.Color(p.color)]);
    n += g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of geos) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
/** Telhado em duas águas (prisma) com UV ao longo da água. */
function roofGeo(len, wid, h, over) {
  const L = len / 2 + over, Wd = wid / 2 + over;
  const v = [
    [-L, 0, -Wd], [L, 0, -Wd], [L, h, 0], [-L, 0, -Wd], [L, h, 0], [-L, h, 0],
    [L, 0, Wd], [-L, 0, Wd], [-L, h, 0], [L, 0, Wd], [-L, h, 0], [L, h, 0],
  ];
  const s = Math.hypot(Wd, h) / 2;
  const u = [[0, 0], [len / 2, 0], [len / 2, s], [0, 0], [len / 2, s], [0, s], [len / 2, 0], [0, 0], [0, s], [len / 2, 0], [0, s], [len / 2, s]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v.flat()), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(u.flat()), 2));
  g.computeVertexNormals();
  return g;
}
/** Empena triangular (fechamento lateral do telhado). */
function gableGeo(wid, h) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-wid / 2, 0, 0, wid / 2, 0, 0, 0, h, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
  g.computeVertexNormals();
  return g;
}
const barrelGeo = new THREE.LatheGeometry([[0.001, 0], [0.34, 0], [0.4, 0.2], [0.43, 0.5], [0.4, 0.8], [0.34, 1], [0.001, 1]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
const bowlGeo = new THREE.LatheGeometry([[0.05, 0], [0.3, 0.05], [0.5, 0.3], [0.55, 0.42], [0.5, 0.42], [0.001, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 12);

const KITS = {};
/** Constrói (uma vez) o adereço `name`: { geo (corpo), glow (partes que brilham), roof? } */
export function kit(name) {
  if (KITS[name]) return KITS[name];
  const P = [], Gl = [];
  // paleta cartoon: tons mais claros e saturados (o contorno e as faixas de luz dão o peso)
  const WOOD = 0x8a5a34, DWOOD = 0x5a3a22, IRON = 0x4e4e5a, STONE = 0xa09888, DSTONE = 0x706a60, BONE = 0xeadcc0;
  let roof = null;
  switch (name) {
    case 'barrel':
      P.push(KP(barrelGeo, WOOD, 0, 0, 0, 1, 1.05, 1));
      for (const y of [0.18, 0.84]) P.push(KP(GEO.torusF, IRON, 0, y, 0, 0.86, 0.86, 0.5, Math.PI / 2));
      break;
    case 'crate':
      P.push(KP(GEO.box, WOOD, 0, 0.45, 0, 0.9));
      for (const [x, z] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) P.push(KP(GEO.box, DWOOD, x, 0.45, z, 0.08, 0.92, 0.08));
      P.push(KP(GEO.box, DWOOD, 0, 0.45, 0.455, 0.08, 1.2, 0.03, 0, 0, 0.78));
      P.push(KP(GEO.box, DWOOD, 0.455, 0.45, 0, 0.03, 1.2, 0.08, 0.78, 0, 0));
      break;
    case 'pillar':
      P.push(KP(GEO.box, DSTONE, 0, 0.18, 0, 1.2, 0.36, 1.2));
      P.push(KP(GEO.box, STONE, 0, 0.45, 0, 1.0, 0.2, 1.0));
      P.push(KP(GEO.cyl, STONE, 0, 2.2, 0, 0.78, 3.3, 0.78));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.push(KP(GEO.box, DSTONE, Math.cos(a) * 0.39, 2.2, Math.sin(a) * 0.39, 0.05, 3.2, 0.05, 0, -a, 0)); }
      P.push(KP(GEO.cyl, STONE, 0, 3.95, 0, 0.9, 0.2, 0.9));
      P.push(KP(GEO.box, DSTONE, 0, 4.2, 0, 1.15, 0.3, 1.15));
      break;
    case 'pillarBroken':
      P.push(KP(GEO.box, DSTONE, 0, 0.18, 0, 1.2, 0.36, 1.2));
      P.push(KP(GEO.cyl, STONE, 0, 1.05, 0, 0.78, 1.5, 0.78));
      P.push(KP(GEO.dod, STONE, 0.1, 1.85, 0, 0.7, 0.4, 0.7, 0.3, 0, 0.2));
      P.push(KP(GEO.cyl, STONE, 0.9, 0.35, 0.6, 0.7, 1.3, 0.7, Math.PI / 2, 0.6, 0));
      P.push(KP(GEO.dod, DSTONE, -0.6, 0.15, 0.5, 0.35));
      break;
    case 'rubble':
      for (let i = 0; i < 6; i++) { const a = i * 1.9; P.push(KP(GEO.dod, i % 2 ? STONE : DSTONE, Math.cos(a) * 0.4 * (i / 6), 0.12, Math.sin(a) * 0.4 * (i / 6), 0.25 + (i % 3) * 0.12, 0.2 + (i % 2) * 0.1, 0.3, a, a, 0)); }
      break;
    case 'bones':
      P.push(KP(GEO.sphS, BONE, 0, 0.14, 0, 0.3, 0.28, 0.32));
      P.push(KP(GEO.box, BONE, 0, 0.05, 0.1, 0.18, 0.08, 0.14));
      P.push(KP(GEO.sphS, 0x100c08, -0.06, 0.16, 0.14, 0.08, 0.07, 0.04));
      P.push(KP(GEO.sphS, 0x100c08, 0.06, 0.16, 0.14, 0.08, 0.07, 0.04));
      for (let i = 0; i < 3; i++) { const a = 0.8 + i * 1.7; P.push(KP(GEO.cyl6, BONE, Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4, 0.06, 0.6, 0.06, Math.PI / 2, a, 0)); }
      P.push(KP(GEO.torus, BONE, 0.3, 0.1, -0.3, 0.4, 0.4, 0.6, Math.PI / 2, 0.4, 0));
      break;
    case 'skulls':
      for (let i = 0; i < 7; i++) { const a = i * 2.3, r = i < 4 ? 0.35 : 0.15, y = i < 4 ? 0.14 : 0.36; P.push(KP(GEO.sphS, BONE, Math.cos(a) * r, y, Math.sin(a) * r, 0.28, 0.26, 0.3)); P.push(KP(GEO.sphS, 0x100c08, Math.cos(a) * (r + 0.12), y + 0.02, Math.sin(a) * (r + 0.12), 0.07)); }
      break;
    case 'sconce':
      P.push(KP(GEO.box, IRON, 0, 0, -0.05, 0.14, 0.3, 0.06));
      P.push(KP(GEO.box, IRON, 0, -0.05, 0.12, 0.05, 0.05, 0.34));
      P.push(KP(GEO.cyl6, DWOOD, 0, 0.12, 0.28, 0.08, 0.5, 0.08, -0.3, 0, 0));
      P.push(KP(GEO.cyl6, 0x2a1a10, 0, 0.36, 0.35, 0.12, 0.12, 0.12));
      Gl.push(KP(GEO.cone, 0xffa040, 0, 0.55, 0.37, 0.2, 0.42, 0.2));
      Gl.push(KP(GEO.cone, 0xfff0a0, 0, 0.48, 0.37, 0.1, 0.22, 0.1));
      break;
    case 'brazier':
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; P.push(KP(GEO.cyl6, IRON, Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3, 0.06, 1.1, 0.06, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25)); }
      P.push(KP(bowlGeo, IRON, 0, 0.95, 0, 1.1, 0.9, 1.1));
      P.push(KP(GEO.dod, 0x1a0a06, 0, 1.25, 0, 0.7, 0.2, 0.7));
      Gl.push(KP(GEO.cone, 0xff7a20, 0, 1.6, 0, 0.6, 0.9, 0.6));
      Gl.push(KP(GEO.cone, 0xffd060, 0, 1.45, 0, 0.35, 0.5, 0.35));
      break;
    case 'candles':
      P.push(KP(GEO.cyl, 0x2a2420, 0, 0.03, 0, 0.8, 0.06, 0.8));
      for (let i = 0; i < 5; i++) { const a = i * 1.3, r = i ? 0.25 : 0, h = 0.25 + ((i * 7) % 5) * 0.08; P.push(KP(GEO.cyl, 0xd8ccb0, Math.cos(a) * r, 0.06 + h / 2, Math.sin(a) * r, 0.08, h, 0.08)); Gl.push(KP(GEO.cone, 0xffc060, Math.cos(a) * r, 0.14 + h, Math.sin(a) * r, 0.06, 0.14, 0.06)); }
      break;
    case 'banner':
      P.push(KP(GEO.cyl6, DWOOD, 0, 3.0, 0, 0.06, 1.3, 0.06, 0, 0, Math.PI / 2));
      P.push(KP(GEO.box, 0x9a1a22, 0, 2.05, 0, 1.0, 1.9, 0.03));
      P.push(KP(GEO.box, 0xa07a2a, 0, 2.9, 0.02, 1.02, 0.08, 0.03));
      P.push(KP(GEO.cone4, 0x9a1a22, 0, 0.98, 0, 0.72, 0.4, 0.03, Math.PI, Math.PI / 4, 0));
      P.push(KP(GEO.oct, 0xa07a2a, 0, 2.2, 0.03, 0.4, 0.5, 0.04));
      break;
    case 'grave':
      P.push(KP(GEO.box, DSTONE, 0, 0.45, 0, 0.7, 0.9, 0.16));
      P.push(KP(GEO.cyl, DSTONE, 0, 0.9, 0, 0.7, 0.16, 0.7, Math.PI / 2, 0, 0));
      P.push(KP(GEO.box, 0x2a2620, 0, 0.62, 0.085, 0.4, 0.05, 0.01));
      P.push(KP(GEO.box, 0x3a2e20, 0, 0.03, 0.55, 0.8, 0.06, 1.0));
      break;
    case 'cross':
      P.push(KP(GEO.box, DSTONE, 0, 0.6, 0, 0.16, 1.2, 0.16));
      P.push(KP(GEO.box, DSTONE, 0, 0.85, 0, 0.6, 0.16, 0.16));
      P.push(KP(GEO.box, 0x3a2e20, 0, 0.03, 0.5, 0.7, 0.06, 0.9));
      break;
    case 'deadTree':
      // árvore retorcida cartoon: tronco grosso que afina, galhos curtos e grossos
      P.push(KP(GEO.taper, 0x5a4230, 0, 1.4, 0, 0.9, 2.8, 0.9, Math.PI, 0, 0.08));
      P.push(KP(GEO.cone, 0x5a4230, 0.12, 3.2, 0, 0.5, 1.1, 0.5, 0, 0, -0.25));
      for (let i = 0; i < 4; i++) { const a = i * 2.4, y = 1.9 + i * 0.35; P.push(KP(GEO.cone, 0x4e3a2a, Math.cos(a) * 0.5, y + 0.3, Math.sin(a) * 0.5, 0.26, 1.3 - i * 0.12, 0.26, Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0)); }
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; P.push(KP(GEO.cone, 0x4a3626, Math.cos(a) * 0.5, 0.18, Math.sin(a) * 0.5, 0.36, 0.8, 0.36, Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3)); }
      P.push(KP(GEO.sphS, 0x2a1a10, 0, 1.3, 0.42, 0.3, 0.4, 0.1)); // oco no tronco
      break;
    case 'pine':
      // pinheiro cartoon: tronco curto e grosso, 3 camadas gordas com a ponta curvada
      P.push(KP(GEO.taper, 0x6a4226, 0, 0.7, 0, 0.55, 1.4, 0.55, Math.PI, 0, 0));
      for (let i = 0; i < 3; i++) {
        const w = 3.3 - i * 0.85, y = 1.5 + i * 1.15;
        P.push(KP(GEO.cone, [0x2e6a34, 0x367a3a, 0x3e8a40][i], 0, y + 0.55, 0, w, 1.7, w));
        P.push(KP(GEO.cyl, [0x285e2e, 0x2e6a34, 0x367a3a][i], 0, y - 0.25, 0, w * 0.98, 0.2, w * 0.98)); // barra da saia
      }
      P.push(KP(GEO.cone, 0x4a9a48, 0.05, 5.1, 0, 0.5, 0.8, 0.5, 0, 0, -0.35));
      break;
    case 'bush':
      for (let i = 0; i < 5; i++) { const a = i * 1.25; P.push(KP(GEO.sph, i % 2 ? 0x3a7a34 : 0x46883a, Math.cos(a) * 0.36 * (i ? 1 : 0), 0.38 + (i ? 0 : 0.22), Math.sin(a) * 0.36 * (i ? 1 : 0), 0.78 + (i % 2) * 0.2)); }
      for (let i = 0; i < 6; i++) { const a = i * 2.2 + 0.4; P.push(KP(GEO.sphLow, i % 2 ? 0xd84a3a : 0xf0d060, Math.cos(a) * 0.52, 0.55 + (i % 3) * 0.14, Math.sin(a) * 0.52, 0.1)); }
      break;
    case 'rock':
      P.push(KP(GEO.dod, 0x8a8678, 0, 0.35, 0, 1.25, 0.85, 1.05, 0.3, 0.7, 0.1));
      P.push(KP(GEO.dod, 0x767266, 0.6, 0.2, 0.2, 0.6, 0.45, 0.55, 0.8, 0.2, 0));
      P.push(KP(GEO.sphH, 0x4e8a34, -0.05, 0.66, 0, 0.85, 0.16, 0.65));
      break;
    case 'log':
      P.push(KP(GEO.cyl, 0x6a4a2e, 0, 0.32, 0, 0.62, 2.2, 0.62, 0, 0, Math.PI / 2));
      P.push(KP(GEO.cyl, 0xd8b078, 1.11, 0.32, 0, 0.52, 0.03, 0.52, 0, 0, Math.PI / 2));
      P.push(KP(GEO.cyl, 0xa07a48, 1.12, 0.32, 0, 0.26, 0.03, 0.26, 0, 0, Math.PI / 2));
      P.push(KP(GEO.sphH, 0x4e8a34, -0.3, 0.56, 0, 1.2, 0.18, 0.5));
      break;
    case 'mushroom':
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1, r = i ? 0.34 : 0, s = i ? 0.6 : 1.1, x = Math.cos(a) * r, z = Math.sin(a) * r;
        P.push(KP(GEO.cyl6, 0xf0e4c8, x, 0.22 * s, z, 0.18 * s, 0.44 * s, 0.18 * s));
        P.push(KP(GEO.sphHLow, 0xd83a2a, x, 0.4 * s, z, 0.62 * s, 0.34 * s, 0.62 * s));
        for (let k = 0; k < 4; k++) { const b = k * 1.6 + i; P.push(KP(GEO.ico0, 0xfff4e0, x + Math.cos(b) * 0.16 * s, 0.4 * s + 0.13 * s, z + Math.sin(b) * 0.16 * s, 0.08 * s, 0.04 * s, 0.08 * s)); }
      }
      break;
    case 'glowshroom':
      for (let i = 0; i < 4; i++) { const a = i * 1.7, r = i ? 0.32 : 0, s = i ? 0.55 : 1; P.push(KP(GEO.cyl, 0x9aa0b0, Math.cos(a) * r, 0.25 * s, Math.sin(a) * r, 0.1 * s, 0.5 * s, 0.1 * s)); Gl.push(KP(GEO.sphH, 0x4aa0ff, Math.cos(a) * r, 0.48 * s, Math.sin(a) * r, 0.46 * s, 0.22 * s, 0.46 * s)); }
      break;
    case 'stalagmite':
      for (let i = 0; i < 4; i++) { const a = i * 1.9, r = i ? 0.6 : 0, h = i ? 1.3 + (i % 2) * 0.8 : 3.0; P.push(KP(GEO.cone, i % 2 ? 0x5a6080 : 0x4a506e, Math.cos(a) * r, h / 2, Math.sin(a) * r, i ? 0.75 : 1.5, h, i ? 0.75 : 1.5)); }
      P.push(KP(GEO.dod, 0x3e445e, 0, 0.12, 0, 1.8, 0.35, 1.6));
      break;
    case 'spikes':
      for (let i = 0; i < 5; i++) { const a = i * 1.4, r = i ? 0.55 : 0, h = i ? 1.6 + (i % 2) : 3.6; P.push(KP(GEO.cone4, i % 2 ? 0x2e2230 : 0x3a2a3a, Math.cos(a) * r, h / 2, Math.sin(a) * r, i ? 0.55 : 1.2, h, i ? 0.55 : 1.2, (i % 2) * 0.2, a, 0)); }
      Gl.push(KP(GEO.sphS, 0xff4a10, 0, 0.1, 0, 1.6, 0.12, 1.6));
      break;
    case 'lavapool':
      P.push(KP(GEO.cyl, 0x140a08, 0, 0.03, 0, 2.4, 0.06, 2.0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(KP(GEO.dod, 0x1e1010, Math.cos(a) * 1.15, 0.1, Math.sin(a) * 0.95, 0.5, 0.3, 0.5, a, a, 0)); }
      Gl.push(KP(GEO.cyl, 0xff5a10, 0, 0.07, 0, 2.0, 0.02, 1.6));
      Gl.push(KP(GEO.cyl, 0xffc040, 0.2, 0.08, 0.1, 0.9, 0.02, 0.6));
      break;
    case 'crystal':
      P.push(KP(GEO.dod, 0x2a2c3a, 0, 0.15, 0, 0.9, 0.35, 0.8));
      Gl.push(KP(GEO.oct, 0x7ab8ff, 0, 0.9, 0, 0.5, 1.8, 0.5, 0, 0.3, 0));
      Gl.push(KP(GEO.oct, 0xa08aff, 0.35, 0.6, 0.15, 0.3, 1.1, 0.3, 0, 0, -0.4));
      Gl.push(KP(GEO.oct, 0x8affe0, -0.3, 0.5, -0.1, 0.26, 0.9, 0.26, 0.3, 0, 0.4));
      break;
    case 'crystalBig':
      P.push(KP(GEO.dod, 0x2a2c3a, 0, 0.3, 0, 1.8, 0.7, 1.6));
      Gl.push(KP(GEO.oct, 0x6aa8ff, 0, 2.0, 0, 1.0, 4.0, 1.0, 0, 0.4, 0.1));
      Gl.push(KP(GEO.oct, 0x9a7aff, 0.7, 1.3, 0.3, 0.6, 2.4, 0.6, 0.2, 0, -0.45));
      Gl.push(KP(GEO.oct, 0x6affd0, -0.6, 1.1, -0.2, 0.5, 2.0, 0.5, -0.2, 0, 0.5));
      break;
    case 'statue':
      P.push(KP(GEO.box, DSTONE, 0, 0.4, 0, 1.3, 0.8, 1.3));
      P.push(KP(GEO.box, STONE, 0, 0.85, 0, 1.0, 0.1, 1.0));
      P.push(KP(GEO.taper, STONE, 0, 1.6, 0, 0.7, 1.4, 0.5, Math.PI, 0, 0));
      P.push(KP(GEO.cyl, STONE, 0, 2.55, 0, 0.8, 0.6, 0.5));
      P.push(KP(GEO.sphS, STONE, 0, 3.05, 0, 0.42));
      P.push(KP(GEO.blade, STONE, 0.3, 2.1, 0.3, 0.14, 2.2, 0.05));
      P.push(KP(GEO.sphH, STONE, -0.4, 2.8, 0, 0.4, 0.3, 0.4));
      break;
    case 'armor':
      P.push(KP(GEO.box, DWOOD, 0, 0.1, 0, 0.9, 0.2, 0.9));
      P.push(KP(GEO.cyl6, DWOOD, 0, 1.0, 0, 0.08, 1.8, 0.08));
      P.push(KP(GEO.cyl, 0x4a4a52, 0, 1.55, 0, 0.66, 0.6, 0.42));
      P.push(KP(GEO.sphH, 0x4a4a52, -0.38, 1.82, 0, 0.42, 0.34, 0.4));
      P.push(KP(GEO.sphH, 0x4a4a52, 0.38, 1.82, 0, 0.42, 0.34, 0.4));
      P.push(KP(GEO.cyl, 0x4a4a52, 0, 2.2, 0, 0.44, 0.5, 0.46));
      P.push(KP(GEO.box, 0x050505, 0, 2.22, 0.23, 0.3, 0.04, 0.03));
      P.push(KP(GEO.box, 0x6a0e14, 0, 1.2, 0.22, 0.34, 0.5, 0.03));
      break;
    case 'lamp':
      P.push(KP(GEO.box, DSTONE, 0, 0.12, 0, 0.5, 0.24, 0.5));
      P.push(KP(GEO.cyl6, IRON, 0, 1.6, 0, 0.12, 3.0, 0.12));
      P.push(KP(GEO.box, IRON, 0.3, 3.05, 0, 0.7, 0.06, 0.06));
      P.push(KP(GEO.cone4, IRON, 0.62, 3.0, 0, 0.42, 0.18, 0.42, 0, Math.PI / 4, 0));
      P.push(KP(GEO.box, IRON, 0.62, 2.65, 0, 0.3, 0.04, 0.3));
      Gl.push(KP(GEO.box, 0xffc070, 0.62, 2.8, 0, 0.24, 0.3, 0.24));
      break;
    case 'fountain':
      P.push(KP(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), DSTONE, 0, 0.35, 0, 5.4, 0.7, 5.4));
      P.push(KP(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), STONE, 0, 0.74, 0, 5.6, 0.12, 5.6));
      P.push(KP(GEO.cyl, 0x0e1a24, 0, 0.62, 0, 4.9, 0.05, 4.9));
      P.push(KP(GEO.cyl, STONE, 0, 1.4, 0, 0.8, 1.6, 0.8));
      P.push(KP(bowlGeo, STONE, 0, 2.1, 0, 2.2, 0.8, 2.2));
      P.push(KP(GEO.taper, STONE, 0, 3.0, 0, 0.45, 1.3, 0.35, Math.PI, 0, 0));
      P.push(KP(GEO.sphS, STONE, 0, 3.8, 0, 0.36));
      P.push(KP(GEO.sphH, STONE, 0, 3.55, 0, 0.9, 0.3, 0.7));
      break;
    case 'well':
      P.push(KP(GEO.cyl, DSTONE, 0, 0.45, 0, 1.6, 0.9, 1.6));
      P.push(KP(GEO.cyl, 0x05080a, 0, 0.91, 0, 1.3, 0.02, 1.3));
      for (const x of [-0.75, 0.75]) P.push(KP(GEO.box, DWOOD, x, 1.3, 0, 0.12, 1.8, 0.12));
      P.push(KP(GEO.cyl6, DWOOD, 0, 2.0, 0, 0.08, 1.6, 0.08, 0, 0, Math.PI / 2));
      P.push(KP(roofGeo(1.6, 1.2, 0.6, 0.15), 0x3a2418, 0, 2.2, 0, 1));
      break;
    case 'stall':
      P.push(KP(GEO.box, WOOD, 0, 0.45, 0, 2.2, 0.9, 0.9));
      for (const [x, z] of [[-1.05, -0.4], [1.05, -0.4], [-1.05, 0.4], [1.05, 0.4]]) P.push(KP(GEO.box, DWOOD, x, 1.1, z, 0.1, 2.2, 0.1));
      P.push(KP(GEO.box, 0x6a1a1a, 0, 2.25, 0, 2.5, 0.06, 1.3, 0.18, 0, 0));
      for (let i = 0; i < 5; i++) P.push(KP(GEO.box, i % 2 ? 0xa08a5a : 0x6a1a1a, -1.0 + i * 0.5, 2.1, 0.64, 0.5, 0.25, 0.02, 0.18, 0, 0));
      for (let i = 0; i < 4; i++) P.push(KP(i % 2 ? GEO.sphS : GEO.box, [0x8a2a1a, 0x5a6a2a, 0x8a6a2a, 0x4a3a5a][i], -0.75 + i * 0.5, 1.02, 0, 0.3, 0.22, 0.3));
      break;
    case 'anvil':
      P.push(KP(GEO.cyl, 0x3a2a1a, 0, 0.3, 0, 0.8, 0.6, 0.8));
      P.push(KP(GEO.box, 0x2a2a2e, 0, 0.7, 0, 0.9, 0.22, 0.4));
      P.push(KP(GEO.cone4, 0x2a2a2e, 0.62, 0.72, 0, 0.3, 0.5, 0.2, 0, 0, -Math.PI / 2));
      P.push(KP(GEO.box, 0x3a2a1a, 1.4, 0.45, 0.3, 0.8, 0.9, 0.8));
      Gl.push(KP(GEO.box, 0xff5a10, 1.4, 0.92, 0.3, 0.6, 0.04, 0.6));
      break;
    case 'cart':
      P.push(KP(GEO.box, WOOD, 0, 0.9, 0, 2.6, 0.2, 1.4));
      P.push(KP(GEO.box, DWOOD, 0, 1.25, 0.68, 2.6, 0.5, 0.06));
      P.push(KP(GEO.box, DWOOD, 0, 1.25, -0.68, 2.6, 0.5, 0.06));
      for (const z of [-0.8, 0.8]) P.push(KP(GEO.cyl, DWOOD, 0.3, 0.55, z, 1.1, 0.1, 1.1, Math.PI / 2, 0, 0));
      P.push(KP(GEO.box, DWOOD, 1.9, 0.7, 0.3, 1.6, 0.08, 0.08, 0, 0, -0.2));
      P.push(KP(GEO.box, DWOOD, 1.9, 0.7, -0.3, 1.6, 0.08, 0.08, 0, 0, -0.2));
      for (let i = 0; i < 3; i++) P.push(KP(barrelGeo, WOOD, -0.7 + i * 0.7, 1.0, 0, 0.7, 0.8, 0.7));
      break;
    case 'stake':
      P.push(KP(GEO.cyl6, DWOOD, 0, 0.3, 0, 0.3, 0.6, 0.3));
      P.push(KP(GEO.cone, DWOOD, 0, 0.8, 0, 0.3, 0.45, 0.3));
      break;
    case 'crenel': // merlão (ameia) quadrado com tampa
      P.push(KP(GEO.box, 0x6a5256, 0, 0.45, 0, 1.3, 0.9, 1.3));
      P.push(KP(GEO.box, 0x7e6468, 0, 0.95, 0, 1.45, 0.14, 1.45));
      break;
    case 'arch':
      for (const x of [-2.2, 2.2]) { P.push(KP(GEO.box, DSTONE, x, 0.3, 0, 1.2, 0.6, 1.2)); P.push(KP(GEO.box, STONE, x, 2.4, 0, 0.9, 3.8, 0.9)); for (let i = 0; i < 3; i++) Gl.push(KP(GEO.box, 0x9a7aff, x, 1.4 + i * 1.0, 0.46, 0.3, 0.12, 0.02)); }
      P.push(KP(GEO.box, STONE, 0, 4.5, 0, 5.6, 0.6, 1.0));
      P.push(KP(GEO.box, DSTONE, 0, 4.95, 0, 6.0, 0.3, 1.2));
      P.push(KP(GEO.oct, DSTONE, 0, 5.4, 0, 0.8, 0.8, 0.5));
      Gl.push(KP(GEO.oct, 0xb89aff, 0, 5.4, 0.2, 0.35, 0.35, 0.2));
      break;
    case 'house': {
      // casa enxaimel: 9,6 × 5,6 de base, reboco + vigas + telhado de telhas
      const Lx = 9.6, Lz = 5.6, Hh = 3.4;
      P.push(KP(GEO.box, DSTONE, 0, 0.3, 0, Lx + 0.3, 0.6, Lz + 0.3));
      P.push(KP(GEO.box, 0xe8d8b0, 0, 0.6 + Hh / 2, 0, Lx, Hh, Lz));
      const beam = 0x5a3a24;
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) P.push(KP(GEO.box, beam, sx * (Lx / 2 - 0.05) * (sx ? 1 : 0), 0.6 + Hh / 2, sz * (Lz / 2 + 0.03), 0.22, Hh, 0.1));
      for (const sz of [-1, 1]) for (const y of [0.7, 0.6 + Hh / 2, 0.55 + Hh]) P.push(KP(GEO.box, beam, 0, y, sz * (Lz / 2 + 0.04), Lx + 0.1, 0.18, 0.1));
      for (const sx of [-1, 1]) for (const y of [0.7, 0.6 + Hh / 2, 0.55 + Hh]) P.push(KP(GEO.box, beam, sx * (Lx / 2 + 0.04), y, 0, 0.1, 0.18, Lz + 0.1));
      // diagonais (mãos-francesas)
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) P.push(KP(GEO.box, beam, sx * Lx * 0.3, 0.6 + Hh * 0.72, sz * (Lz / 2 + 0.04), 0.14, 1.9, 0.08, 0, 0, sx * 0.7));
      // porta e janelas iluminadas na frente (+z) e no lado
      P.push(KP(GEO.box, 0x24160c, -1.2, 1.55, Lz / 2 + 0.06, 1.1, 1.9, 0.08));
      P.push(KP(GEO.box, beam, -1.2, 2.55, Lz / 2 + 0.08, 1.3, 0.14, 0.08));
      for (const x of [1.4, 3.3]) { Gl.push(KP(GEO.box, 0xffaa50, x, 2.0, Lz / 2 + 0.05, 0.8, 0.9, 0.04)); P.push(KP(GEO.box, beam, x, 2.0, Lz / 2 + 0.08, 0.08, 0.95, 0.06)); P.push(KP(GEO.box, beam, x, 2.0, Lz / 2 + 0.08, 0.85, 0.08, 0.06)); }
      Gl.push(KP(GEO.box, 0xffaa50, Lx / 2 + 0.05, 2.0, 0, 0.04, 0.9, 0.8));
      // empenas
      for (const sx of [-1, 1]) P.push(KP(gableGeo(Lz, 2.4), 0xe8d8b0, sx * Lx / 2, 0.6 + Hh, 0, 1, 1, 1, 0, sx * Math.PI / 2, 0));
      // chaminé
      P.push(KP(GEO.box, DSTONE, Lx * 0.3, 0.6 + Hh + 1.6, -0.8, 0.8, 2.4, 0.8));
      P.push(KP(GEO.box, 0x3a3630, Lx * 0.3, 0.6 + Hh + 2.85, -0.8, 0.95, 0.15, 0.95));
      roof = mergeParts([KP(roofGeo(Lx, Lz, 2.4, 0.45), 0xffffff, 0, 0.6 + Hh, 0, 1)]);
      break;
    }
    // ---------- miudezas espalhadas pelo chão (sem sombra, 1 chamada de desenho por tipo) ----------
    case 'tuft': // tufo de grama: lâminas em leque
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, t = 0.25 + (i % 3) * 0.12; P.push(KP(GEO.blade3, i % 2 ? 0x5a9a3a : 0x78b848, Math.cos(a) * 0.08, t / 2, Math.sin(a) * 0.08, 0.1, t, 0.04, Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35)); }
      break;
    case 'flowers':
      for (let i = 0; i < 4; i++) { const a = i * 1.7, r = i ? 0.22 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.22 + (i % 2) * 0.1;
        P.push(KP(GEO.blade3, 0x4a8a34, x, h / 2, z, 0.025, h, 0.025));
        P.push(KP(GEO.ico0, [0xf05a6a, 0xf8e070, 0xa878f0, 0xf0f0f0][i], x, h + 0.03, z, 0.12, 0.07, 0.12));
        P.push(KP(GEO.ico0, 0xf8c030, x, h + 0.06, z, 0.05)); }
      break;
    case 'pebbles':
      for (let i = 0; i < 4; i++) { const a = i * 2.3, r = i ? 0.25 : 0; P.push(KP(GEO.ico0, i % 2 ? STONE : DSTONE, Math.cos(a) * r, 0.05, Math.sin(a) * r, 0.18 + (i % 3) * 0.06, 0.1 + (i % 2) * 0.04, 0.16, a, a, 0)); }
      break;
    case 'fern':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(KP(GEO.ico0, i % 2 ? 0x3e8a3a : 0x52a044, Math.cos(a) * 0.35, 0.16, Math.sin(a) * 0.35, 0.16, 0.05, 0.7, 0.5, -a + Math.PI / 2, 0)); }
      break;
    case 'shard': // lascas de cristal no chão (brilham)
      Gl.push(KP(GEO.oct, 0x7ac8ff, 0, 0.2, 0, 0.18, 0.5, 0.18, 0, 0, 0.3));
      Gl.push(KP(GEO.oct, 0xb08aff, 0.16, 0.12, 0.08, 0.12, 0.3, 0.12, 0.2, 0, -0.4));
      P.push(KP(GEO.ico0, 0x4a506e, 0, 0.04, 0, 0.4, 0.1, 0.35));
      break;
    case 'ember': // pedra de obsidiana com brasa
      P.push(KP(GEO.ico0, 0x2a2228, 0, 0.1, 0, 0.5, 0.25, 0.45, 0.4, 0.3, 0));
      Gl.push(KP(GEO.ico0, 0xff7a20, 0.12, 0.2, 0.05, 0.12, 0.06, 0.1));
      break;
    case 'baseRocks': // pedras e entulho no pé da parede
      for (let i = 0; i < 4; i++) { const t = (i - 1.5) * 0.5; P.push(KP(GEO.ico0, i % 2 ? STONE : DSTONE, t, 0.14 + (i % 2) * 0.06, (i % 2) * 0.18, 0.5 + (i % 3) * 0.14, 0.34 + (i % 2) * 0.12, 0.42, i, i * 2, 0)); }
      break;
    case 'grassEdge': // capim alto no pé da parede
      for (let i = 0; i < 9; i++) { const t = (i - 4) * 0.22, h = 0.35 + ((i * 7) % 4) * 0.1; P.push(KP(GEO.blade3, i % 2 ? 0x4e8a34 : 0x6aa840, t, h / 2, ((i * 3) % 3) * 0.08, 0.12, h, 0.05, 0.15 * (i % 3 - 1), i, 0.2 * (i % 2 ? 1 : -1))); }
      break;
    // ---------- Torre Infinita ----------
    case 'towerBig': { // torre da cidade: três andares que afinam, janelas e runas em espiral; porta em +z
      const TS = 0x8e909e, TD = 0x5e6070, TB = 0x3e4050, RUNE = 0x6ad8ff;
      const oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      P.push(KP(oct, TD, 0, 0.3, 0, 7.0, 0.6, 7.0));
      P.push(KP(oct, TS, 0, 0.75, 0, 6.2, 0.3, 6.2));
      const tiers = [[2.5, 0.9, 5.2], [2.1, 6.4, 4.2], [1.75, 10.9, 3.2]]; // raio, base, altura
      tiers.forEach(([r, y0, h], t) => {
        P.push(KP(GEO.cyl, t % 2 ? 0x8a8c9a : TS, 0, y0 + h / 2, 0, r * 2, h, r * 2));
        P.push(KP(oct, TB, 0, y0 + h + 0.15, 0, r * 2 + 0.6, 0.35, r * 2 + 0.6));
        // janelas estreitas (brilham) com moldura, 6 por andar, desencontradas
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + t * 0.5, x = Math.sin(a) * (r + 0.02), z = Math.cos(a) * (r + 0.02);
          if (t === 0 && Math.abs(a % (Math.PI * 2)) < 0.4) continue; // lugar da porta
          P.push(KP(GEO.box, TB, x, y0 + h * 0.55, z, 0.62, 1.5, 0.12, 0, a, 0));
          Gl.push(KP(GEO.box, RUNE, Math.sin(a) * (r + 0.07), y0 + h * 0.55, Math.cos(a) * (r + 0.07), 0.36, 1.2, 0.04, 0, a, 0));
        }
      });
      // contrafortes no térreo
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; P.push(KP(GEO.box, TD, Math.sin(a) * 2.55, 2.4, Math.cos(a) * 2.55, 0.7, 4.6, 1.0, 0, a, 0)); P.push(KP(GEO.cone4, TD, Math.sin(a) * 2.55, 5.1, Math.cos(a) * 2.55, 0.9, 0.9, 1.2, 0, a + Math.PI / 4, 0)); }
      // runas em espiral subindo pelos três andares
      for (let i = 0; i < 44; i++) {
        const k = i / 44, y = 1.4 + k * 12.4, a = k * Math.PI * 6;
        const r = y < 6.4 ? 2.5 : y < 10.9 ? 2.1 : 1.75;
        Gl.push(KP(GEO.box, i % 3 ? RUNE : 0xb89aff, Math.sin(a) * (r + 0.05), y, Math.cos(a) * (r + 0.05), 0.22, 0.22, 0.04, 0, a, Math.PI / 4));
      }
      // ameias no topo
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; P.push(KP(GEO.box, TS, Math.sin(a) * 1.9, 14.65, Math.cos(a) * 1.9, 0.7, 0.8, 0.5, 0, a, 0)); }
      // porta em arco (+z), com moldura de runas
      P.push(KP(GEO.box, 0x14161e, 0, 2.1, 2.44, 1.7, 2.6, 0.2));
      P.push(KP(GEO.box, TB, -1.05, 2.0, 2.52, 0.4, 3.0, 0.3));
      P.push(KP(GEO.box, TB, 1.05, 2.0, 2.52, 0.4, 3.0, 0.3));
      P.push(KP(GEO.box, TB, 0, 3.65, 2.52, 2.5, 0.5, 0.3));
      Gl.push(KP(GEO.box, RUNE, 0, 2.0, 2.56, 1.3, 2.2, 0.02));
      Gl.push(KP(GEO.oct, 0xb89aff, 0, 3.65, 2.72, 0.4, 0.4, 0.2));
      break;
    }
    case 'obelisk': // obelisco rúnico (adereço alto da torre)
      P.push(KP(GEO.box, DSTONE, 0, 0.25, 0, 1.3, 0.5, 1.3));
      P.push(KP(GEO.taper, 0x6a6c7a, 0, 1.9, 0, 0.9, 2.8, 0.9, 0, Math.PI / 8, 0));
      P.push(KP(GEO.cone4, 0x6a6c7a, 0, 3.6, 0, 0.72, 0.7, 0.72, 0, Math.PI / 4, 0));
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; Gl.push(KP(GEO.box, 0x6ad8ff, Math.sin(a) * 0.4, 1.4 + (i % 2) * 0.7, Math.cos(a) * 0.4, 0.16, 0.6, 0.03, 0, a, 0)); }
      Gl.push(KP(GEO.oct, 0xb89aff, 0, 4.3, 0, 0.35, 0.5, 0.35));
      break;
    case 'bookshelf': // estante de livros (biblioteca arcana)
      P.push(KP(GEO.box, DWOOD, 0, 1.4, 0, 1.6, 2.8, 0.6));
      for (let s = 0; s < 4; s++) {
        P.push(KP(GEO.box, WOOD, 0, 0.3 + s * 0.68, 0.05, 1.5, 0.06, 0.55));
        for (let b = 0; b < 6; b++) P.push(KP(GEO.box, [0x6a1a2a, 0x2a3a6a, 0x3a5a2a, 0x7a5a2a, 0x4a2a5a][(b + s * 2) % 5], -0.6 + b * 0.24, 0.55 + s * 0.68, 0.08, 0.18, 0.4 + ((b * 7 + s) % 3) * 0.06, 0.42));
      }
      Gl.push(KP(GEO.oct, 0xc89aff, 0.5, 2.95, 0.1, 0.18, 0.26, 0.18));
      break;
    default:
      P.push(KP(GEO.box, 0xff00ff, 0, 0.5, 0, 1));
  }
  const k = { geo: mergeParts(P), glow: Gl.length ? mergeParts(Gl) : null, roof };
  for (const g of [k.geo, k.glow, k.roof]) if (g) g.userData.shared = true; // cache: nunca liberar com o nível
  KITS[name] = k;
  return k;
}
/** Material dos adereços: cor por vértice × textura de desgaste. */
let _kitMat = null, _kitGlow = null, _roofMat = null;
export function kitMat() {
  if (!_kitMat) { const g = texGrime(); _kitMat = toonMaterial({ vertexColors: true, map: g.map, normalMap: g.normalMap }, { rim: 0.22 }); _kitMat.normalScale.setScalar(0.6); _kitMat.userData.shared = true; }
  return _kitMat;
}
/**
 * Partes que brilham (chamas, lava, cristais, cogumelos): aditivas, pulsando
 * devagar com fase pela posição no mundo — cada cristal "respira" no seu tempo.
 * O pulso passa um pouco do branco, então o passe de brilho (bloom) as acende.
 */
const glowTime = { value: 0 };
export function setKitGlowTime(t) { glowTime.value = t; }
export function kitGlowMat() {
  if (!_kitGlow) {
    _kitGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    _kitGlow.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = glowTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vPulse;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 gw = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            gw = instanceMatrix * gw;
          #endif
          gw = modelMatrix * gw;
          vPulse = 1.05 + 0.3 * sin( uTime * 1.7 + gw.x * 0.9 + gw.z * 0.7 ) + 0.08 * sin( uTime * 4.3 + gw.y * 3.0 );`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPulse;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPulse;');
    };
    _kitGlow.customProgramCacheKey = () => 'kitGlowPulse';
    _kitGlow.userData.shared = true;
  }
  return _kitGlow;
}
export function roofMat() {
  if (!_roofMat) { const t = texShingles('shingles3', { a: 0xa04632, b: 0x7a3426 }); _roofMat = toonMaterial({ map: t.map, normalMap: t.normalMap, side: THREE.DoubleSide }, { rim: 0.2 }); _roofMat.userData.shared = true; }
  return _roofMat;
}
