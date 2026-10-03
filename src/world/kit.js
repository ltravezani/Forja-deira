// =============================================================================
// Kit de adereços: geometrias montadas a partir de primitivas, com cor por
// vértice (uma só malha e um só material por tipo, desenhados com instancing).
// =============================================================================
import { GEO } from '../art/geometry.js';
import { cutaway } from '../art/cutaway.js';
import { stylize, toonMaterial } from '../art/stylize.js';
import { texGrime, texShingles } from '../art/textures.js';
import { V3 } from '../core/util.js';
import { natureGeo } from '../art/nature.js';

const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _kp = new V3(), _ks = new V3();
/** Grava a transformação (posição, rotação Euler XYZ, escala) na instância `i` de um InstancedMesh. */
export function setInstance(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
  _ke.set(rx, ry, rz); _kq.setFromEuler(_ke);
  _kp.set(x, y, z); _ks.set(sx, sy, sz);
  _km.compose(_kp, _kq, _ks);
  mesh.setMatrixAt(i, _km);
}
/** Parte de adereço: geometria, cor, posição, escala, rotação. */
/** Marca uma parte como copa "fofa" (normais para fora de `c`, ver fluffNormals). */
const fluff = (p, c, k) => Object.assign(p, { fc: c, fk: k });
const KP = (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) => ({ geo, color, x, y, z, sx, sy: sy == null ? sx : sy, sz: sz == null ? sx : sz, rx: rx || 0, ry: ry || 0, rz: rz || 0 });
/**
 * Copa "fofa": normais apontando para fora do centro `c` da copa (não de cada
 * bola), misturadas (k) com as originais. As faixas de luz do toon passam a
 * desenhar um volume único e macio em vez de várias esferas.
 */
function fluffNormals(g, c, k) {
  const pos = g.attributes.position, nor = g.attributes.normal, v = new V3(), n = new V3();
  k = k == null ? 0.85 : k;
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - c[0], pos.getY(i) - c[1], pos.getZ(i) - c[2]).normalize();
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).multiplyScalar(1 - k).addScaledVector(v, k).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}
/** Vento: [y inicial, y final, amplitude em m] — vértices acima de y0 balançam, até a amplitude em y1 (bases fixas). */
const WIND = {
  tuft: [0.02, 0.5, 0.07], grassEdge: [0.02, 0.7, 0.09], fern: [0.02, 0.3, 0.06], flowers: [0.05, 0.35, 0.05],
  bush: [0.25, 1.2, 0.07], pine: [1.3, 5.6, 0.2], oak: [2.2, 5.6, 0.22],
  gtree: [7, 14, 0.28], gtreeDeep: [7, 14, 0.28], motherTree: [7, 14, 0.18], hedge: [0.3, 1.4, 0.08], reeds: [0.1, 1.5, 0.12], magicFlower: [0.05, 0.5, 0.05],
};
function windAttr(geo, w) {
  const pos = geo.attributes.position, a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, (pos.getY(i) - w[0]) / (w[1] - w[0]))); a[i] = w[2] * t * t * (3 - 2 * t); }
  geo.setAttribute('wind', new THREE.BufferAttribute(a, 1));
}
function mergeParts(parts) {
  const geos = [];
  let n = 0;
  for (const p of parts) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
    _ke.set(p.rx, p.ry, p.rz); _kq.setFromEuler(_ke); _kp.set(p.x, p.y, p.z); _ks.set(p.sx, p.sy, p.sz);
    _km.compose(_kp, _kq, _ks);
    g.applyMatrix4(_km);
    if (p.fc) fluffNormals(g, p.fc, p.fk);
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
  if (name.startsWith('kk:')) return (KITS[name] = natureKit(name));
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
    // ---------- detalhes de labirinto: armas quebradas e enfeites de parede (face em +z, fundo em z=0) ----------
    case 'swordStuck': { // espada quebrada cravada no chão, inclinada, com a ponta partida ao lado
      const STEEL = 0xb8bcc8, a = 0.28;
      const tilt = (y) => [Math.sin(a) * y, Math.cos(a) * y];
      const at = (geo, c, y, sx, sy, sz) => { const [x, yy] = tilt(y); P.push(KP(geo, c, x, yy, 0, sx, sy, sz, 0, 0, -a)); };
      at(GEO.box, STEEL, 0.3, 0.12, 0.8, 0.03);
      at(GEO.box, 0x8a8e9a, 0.3, 0.03, 0.8, 0.04); // sulco da lâmina
      at(GEO.box, 0x6a4a2a, 0.74, 0.56, 0.08, 0.1); // guarda
      at(GEO.cyl6, 0x3a2418, 0.94, 0.07, 0.32, 0.07); // cabo
      at(GEO.sphS, 0xa07a2a, 1.14, 0.13, 0.13, 0.13); // pomo
      P.push(KP(GEO.box, STEEL, 0.42, 0.02, 0.28, 0.1, 0.025, 0.42, 0, 0.7, 0)); // pedaço da lâmina
      P.push(KP(GEO.cone4, STEEL, 0.5, 0.02, 0.5, 0.1, 0.18, 0.025, Math.PI / 2, 0.7, 0));
      P.push(KP(GEO.ico0, DSTONE, 0, 0.04, 0, 0.45, 0.1, 0.4)); // terra revolvida
      break;
    }
    case 'swordPile': { // espadas e escudo caídos, restos de uma batalha
      const STEEL = 0xa8acb8;
      for (let i = 0; i < 3; i++) {
        const r = -0.9 + i * 1.1, x = (i - 1) * 0.35, z = (i % 2) * 0.25 - 0.1;
        P.push(KP(GEO.box, STEEL, x, 0.03, z, 0.1, 0.03, 0.75 - i * 0.12, 0, r, 0));
        P.push(KP(GEO.box, 0x6a4a2a, x - Math.sin(r) * 0.4, 0.05, z - Math.cos(r) * 0.4, 0.4, 0.06, 0.07, 0, r, 0));
        P.push(KP(GEO.cyl6, 0x3a2418, x - Math.sin(r) * 0.55, 0.05, z - Math.cos(r) * 0.55, 0.06, 0.24, 0.06, Math.PI / 2, r, 0));
      }
      P.push(KP(GEO.cyl, 0x6a3a22, 0.45, 0.07, -0.4, 0.7, 0.07, 0.7, 0.12, 0, 0.1)); // escudo tombado
      P.push(KP(GEO.torusF, IRON, 0.45, 0.1, -0.4, 0.7, 0.7, 0.6, Math.PI / 2 + 0.12, 0, 0.1));
      P.push(KP(GEO.sphH, IRON, 0.45, 0.11, -0.4, 0.2, 0.1, 0.2));
      P.push(KP(GEO.sphH, 0x5a5a66, -0.5, 0.0, 0.45, 0.42, 0.34, 0.4, 0.4, 0.5, 0)); // elmo amassado
      break;
    }
    case 'shieldWall': { // escudo redondo pendurado com duas espadas cruzadas atrás
      P.push(KP(GEO.box, 0x9aa0ac, -0.02, 2.0, 0.05, 0.09, 1.5, 0.03, 0, 0, 0.75));
      P.push(KP(GEO.box, 0x9aa0ac, 0.02, 2.0, 0.05, 0.09, 1.5, 0.03, 0, 0, -0.75));
      for (const sg of [1, -1]) P.push(KP(GEO.box, 0x6a4a2a, sg * 0.46, 1.52, 0.05, 0.3, 0.06, 0.06, 0, 0, sg * -0.75));
      P.push(KP(GEO.cyl, 0x7a2020, 0, 2.0, 0.12, 0.95, 0.08, 0.95, Math.PI / 2, 0, 0));
      P.push(KP(GEO.torusF, IRON, 0, 2.0, 0.17, 0.95, 0.95, 0.6));
      P.push(KP(GEO.box, 0xa07a2a, 0, 2.0, 0.165, 0.9, 0.1, 0.02));
      P.push(KP(GEO.box, 0xa07a2a, 0, 2.0, 0.165, 0.1, 0.9, 0.02));
      P.push(KP(GEO.sphH, IRON, 0, 2.0, 0.16, 0.24, 0.24, 0.16, Math.PI / 2, 0, 0));
      break;
    }
    case 'chains': // correntes penduradas com grilhões
      for (const cx of [-0.45, 0.4]) {
        P.push(KP(GEO.box, IRON, cx, 2.75, 0.04, 0.16, 0.16, 0.08));
        const n = cx < 0 ? 9 : 6;
        for (let i = 0; i < n; i++) P.push(KP(GEO.torusF, 0x5a5a64, cx, 2.62 - i * 0.16, 0.1, 0.16, 0.22, 0.5, 0, i % 2 ? Math.PI / 2 : 0, 0));
        P.push(KP(GEO.torusF, IRON, cx, 2.5 - n * 0.16, 0.12, 0.3, 0.3, 0.9, Math.PI / 2, 0, 0));
      }
      break;
    case 'weaponRack': // suporte de armas encostado na parede
      P.push(KP(GEO.box, DWOOD, 0, 0.1, 0.35, 1.6, 0.12, 0.34));
      P.push(KP(GEO.box, DWOOD, 0, 1.55, 0.1, 1.6, 0.12, 0.16));
      for (const x of [-0.75, 0.75]) P.push(KP(GEO.box, WOOD, x, 0.85, 0.2, 0.1, 1.6, 0.1, 0.2, 0, 0));
      for (let i = 0; i < 3; i++) {
        const x = -0.45 + i * 0.45;
        P.push(KP(GEO.cyl6, WOOD, x, 1.25, 0.22, 0.06, 2.3, 0.06, 0.12, 0, 0));
        if (i !== 1) P.push(KP(GEO.cone4, 0xb8bcc8, x, 2.5, 0.08, 0.14, 0.34, 0.04, 0.12, 0, 0));
        else P.push(KP(GEO.cone4, 0xb8bcc8, x + 0.04, 2.42, 0.08, 0.1, 0.12, 0.04, 0.12, 0, 0.6)); // lança partida
      }
      P.push(KP(GEO.box, 0xb8bcc8, 0.22, 0.75, 0.3, 0.1, 1.0, 0.03, 0.15, 0, 0.1));
      P.push(KP(GEO.box, 0x6a4a2a, 0.26, 1.3, 0.24, 0.4, 0.07, 0.08, 0.15, 0, 0.1));
      break;
    case 'pilaster': // meia-coluna de pedra colada à parede (quebra a parede lisa)
      P.push(KP(GEO.box, DSTONE, 0, 0.2, 0.2, 0.95, 0.4, 0.4));
      P.push(KP(GEO.box, STONE, 0, 1.75, 0.16, 0.7, 2.9, 0.32));
      P.push(KP(GEO.box, DSTONE, 0, 1.75, 0.33, 0.12, 2.8, 0.02));
      P.push(KP(GEO.box, DSTONE, 0, 3.25, 0.22, 0.95, 0.3, 0.44));
      P.push(KP(GEO.box, STONE, 0, 3.45, 0.18, 1.1, 0.14, 0.36));
      break;
    case 'skullNiche': // nicho escavado com crânios e uma vela
      P.push(KP(GEO.box, 0x1a1418, 0, 1.6, 0.03, 1.0, 0.9, 0.06));
      P.push(KP(GEO.box, DSTONE, 0, 1.12, 0.12, 1.2, 0.1, 0.24));
      P.push(KP(GEO.box, DSTONE, 0, 2.1, 0.1, 1.2, 0.12, 0.2));
      for (let i = 0; i < 3; i++) { const x = -0.3 + i * 0.3; P.push(KP(GEO.sphS, BONE, x, 1.32, 0.12, 0.26, 0.24, 0.26)); P.push(KP(GEO.sphS, 0x100c08, x - 0.05, 1.34, 0.24, 0.06)); P.push(KP(GEO.sphS, 0x100c08, x + 0.05, 1.34, 0.24, 0.06)); }
      P.push(KP(GEO.cyl6, 0xe8dcc0, 0.42, 1.28, 0.14, 0.08, 0.22, 0.08));
      Gl.push(KP(GEO.cone, 0xffc060, 0.42, 1.46, 0.14, 0.08, 0.16, 0.08));
      break;
    case 'vines': // cipós e raízes descendo pela parede
      for (let i = 0; i < 6; i++) {
        const x = -0.7 + i * 0.28, len = 1.1 + ((i * 7) % 5) * 0.35, top = 3.2;
        P.push(KP(GEO.box, i % 2 ? 0x3e7a2e : 0x52903a, x, top - len / 2, 0.06, 0.07, len, 0.05, 0, 0, (i % 3 - 1) * 0.06));
        for (let k = 0; k < 3; k++) P.push(KP(GEO.ico0, k % 2 ? 0x4e9a38 : 0x64b048, x + (k % 2 ? 0.1 : -0.1), top - len * (0.25 + k * 0.3), 0.1, 0.22, 0.14, 0.1, 0.3, k, 0));
      }
      P.push(KP(GEO.cyl6, 0x5a3a22, 0, 3.15, 0.08, 0.12, 1.9, 0.12, 0, 0, Math.PI / 2 - 0.1)); // raiz grossa
      break;
    case 'wallCrystals': // cristais brotando da parede (brilham)
      for (let i = 0; i < 4; i++) { const x = -0.4 + i * 0.28, y = 1.3 + ((i * 5) % 3) * 0.45; Gl.push(KP(GEO.oct, i % 2 ? 0x7ac8ff : 0xb08aff, x, y, 0.2, 0.2, 0.6 + (i % 2) * 0.3, 0.2, 0.9, 0, (i - 1.5) * 0.4)); }
      P.push(KP(GEO.ico0, 0x4a506e, 0, 1.5, 0.05, 1.1, 0.6, 0.25));
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
        P.push(fluff(KP(GEO.cone, [0x2e6a34, 0x367a3a, 0x3e8a40][i], 0, y + 0.55, 0, w, 1.7, w), [0, y - 0.2, 0], 0.5));
        P.push(KP(GEO.cyl, [0x285e2e, 0x2e6a34, 0x367a3a][i], 0, y - 0.25, 0, w * 0.98, 0.2, w * 0.98)); // barra da saia
      }
      P.push(KP(GEO.cone, 0x4a9a48, 0.05, 5.1, 0, 0.5, 0.8, 0.5, 0, 0, -0.35));
      break;
    case 'bush':
      for (let i = 0; i < 5; i++) { const a = i * 1.25; P.push(fluff(KP(GEO.sph, i % 2 ? 0x3a7a34 : 0x46883a, Math.cos(a) * 0.36 * (i ? 1 : 0), 0.38 + (i ? 0 : 0.22), Math.sin(a) * 0.36 * (i ? 1 : 0), 0.78 + (i % 2) * 0.2), [0, 0.3, 0])); }
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
      // a superfície da lava é desenhada à parte, com material animado (lavaMat)
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
    case 'fountain': { // chafariz de três níveis: bacia octogonal, taça grande, taça pequena e pinha; a água é desenhada à parte (townfx)
      const oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8), R = 2.8, tn = Math.tan(Math.PI / 8);
      P.push(KP(oct, DSTONE, 0, 0.08, 0, 6.4, 0.16, 6.4)); // degrau
      P.push(KP(oct, 0x3a4a52, 0, 0.2, 0, 5.2, 0.2, 5.2)); // fundo (visto através da água)
      // paredes e borda larga, peça por lado (a bacia é oca)
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + Math.PI / 8, ap = R * Math.cos(Math.PI / 8);
        P.push(KP(GEO.box, STONE, Math.sin(a) * (ap - 0.18), 0.42, Math.cos(a) * (ap - 0.18), 2 * ap * tn + 0.05, 0.84, 0.36, 0, a, 0));
        P.push(KP(GEO.box, 0xb8b0a0, Math.sin(a) * (ap - 0.14), 0.9, Math.cos(a) * (ap - 0.14), 2 * (ap + 0.14) * tn + 0.12, 0.14, 0.62, 0, a, 0));
        P.push(KP(GEO.box, DSTONE, Math.sin(a) * (ap + 0.02), 0.5, Math.cos(a) * (ap + 0.02), 1.2, 0.34, 0.04, 0, a, 0)); // painel
        const v = i * Math.PI / 4; // pilaretes nos vértices
        P.push(KP(GEO.box, 0xb8b0a0, Math.sin(v) * R, 0.55, Math.cos(v) * R, 0.36, 1.1, 0.36, 0, v, 0));
        P.push(KP(GEO.sphS, STONE, Math.sin(v) * R, 1.18, Math.cos(v) * R, 0.26));
      }
      // pedestal com quatro carrancas de leão que cospem água
      P.push(KP(oct, DSTONE, 0, 0.5, 0, 1.5, 0.6, 1.5));
      P.push(KP(GEO.taper, STONE, 0, 1.2, 0, 0.9, 1.0, 0.9, Math.PI, 0, 0));
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, x = Math.sin(a), z = Math.cos(a);
        P.push(KP(GEO.sphS, 0xc8b070, x * 0.48, 1.05, z * 0.48, 0.34, 0.32, 0.3, 0, a, 0));
        P.push(KP(GEO.sphS, 0xa89050, x * 0.44, 1.12, z * 0.44, 0.44, 0.38, 0.22, 0, a, 0)); // juba
        P.push(KP(GEO.cyl6, 0x2a2a2a, x * 0.64, 1.0, z * 0.64, 0.08, 0.06, 0.08, Math.PI / 2, a, 0)); // boca
      }
      P.push(KP(bowlGeo, STONE, 0, 1.55, 0, 2.6, 0.9, 2.6));
      P.push(KP(GEO.torusF, 0xb8b0a0, 0, 1.93, 0, 2.86, 2.86, 0.9, Math.PI / 2, 0, 0));
      P.push(KP(GEO.taper, STONE, 0, 2.3, 0, 0.5, 0.8, 0.5, Math.PI, 0, 0));
      P.push(KP(bowlGeo, STONE, 0, 2.6, 0, 1.3, 0.7, 1.3));
      P.push(KP(GEO.torusF, 0xb8b0a0, 0, 2.89, 0, 1.44, 1.44, 0.7, Math.PI / 2, 0, 0));
      P.push(KP(GEO.cyl6, STONE, 0, 3.05, 0, 0.26, 0.4, 0.26));
      P.push(KP(GEO.sphS, 0xb8b0a0, 0, 3.3, 0, 0.36, 0.36, 0.36));
      P.push(KP(GEO.cone, 0xa89a88, 0, 3.6, 0, 0.3, 0.5, 0.3)); // pinha
      break;
    }
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
      // floreiras e venezianas nas janelas da frente, lampião ao lado da porta e degrau de pedra
      for (const x of [1.4, 3.3]) {
        P.push(KP(GEO.box, DWOOD, x, 1.44, Lz / 2 + 0.2, 1.0, 0.2, 0.3));
        for (let i = 0; i < 5; i++) P.push(KP(GEO.ico0, [0xf05a6a, 0xf8e070, 0x4e8e3a, 0xa878f0, 0x4e8e3a][(i + (x > 2 ? 2 : 0)) % 5], x - 0.4 + i * 0.2, 1.6, Lz / 2 + 0.22, 0.2, 0.17, 0.2));
        for (const sx of [-1, 1]) P.push(KP(GEO.box, 0x3a6a4a, x + sx * 0.6, 2.0, Lz / 2 + 0.1, 0.32, 1.0, 0.05, 0, sx * 0.25, 0));
      }
      P.push(KP(GEO.box, IRON, -0.35, 2.3, Lz / 2 + 0.22, 0.06, 0.06, 0.34));
      P.push(KP(GEO.cone4, IRON, -0.35, 2.36, Lz / 2 + 0.38, 0.24, 0.12, 0.24, 0, Math.PI / 4, 0));
      Gl.push(KP(GEO.box, 0xffc070, -0.35, 2.18, Lz / 2 + 0.38, 0.15, 0.2, 0.15));
      P.push(KP(GEO.box, STONE, -1.2, 0.3, Lz / 2 + 0.45, 1.5, 0.3, 0.6));
      // telhadinho sobre a porta
      P.push(KP(GEO.box, 0x7a3426, -1.2, 2.75, Lz / 2 + 0.3, 1.6, 0.08, 0.7, 0.35, 0, 0));
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
    // ---------- cidade: mobiliário, quintais e comércio ----------
    case 'bench': // banco de praça: pés de pedra, assento e encosto de ripas
      for (const x of [-0.75, 0.75]) { P.push(KP(GEO.box, DSTONE, x, 0.24, 0, 0.22, 0.48, 0.5)); P.push(KP(GEO.box, STONE, x, 0.5, 0, 0.3, 0.06, 0.58)); }
      for (let i = 0; i < 3; i++) P.push(KP(GEO.box, i % 2 ? WOOD : 0x9a6a3e, 0, 0.56, -0.16 + i * 0.16, 1.9, 0.07, 0.14));
      for (const x of [-0.75, 0.75]) P.push(KP(GEO.box, DWOOD, x, 0.85, -0.3, 0.1, 0.62, 0.08, -0.15, 0, 0));
      for (let i = 0; i < 2; i++) P.push(KP(GEO.box, WOOD, 0, 0.8 + i * 0.2, -0.32 - i * 0.03, 1.9, 0.12, 0.05, -0.15, 0, 0));
      break;
    case 'planter': { // canteiro de pedra com flores e folhagem
      P.push(KP(GEO.box, DSTONE, 0, 0.3, 0, 1.6, 0.6, 1.6));
      P.push(KP(GEO.box, STONE, 0, 0.62, 0, 1.75, 0.1, 1.75));
      P.push(KP(GEO.box, 0x4a3222, 0, 0.62, 0, 1.4, 0.06, 1.4));
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.45 : 0; P.push(KP(GEO.sph, i % 2 ? 0x3e7a34 : 0x4e8e3a, Math.cos(a) * r, 0.8, Math.sin(a) * r, 0.5, 0.36, 0.5)); }
      for (let i = 0; i < 10; i++) { const a = i * 2.3, r = 0.2 + (i % 3) * 0.18; P.push(KP(GEO.ico0, [0xf05a6a, 0xf8e070, 0xa878f0, 0xffffff, 0xff9a40][i % 5], Math.cos(a) * r, 0.98 + (i % 2) * 0.06, Math.sin(a) * r, 0.16, 0.1, 0.16)); }
      break;
    }
    case 'woodpile': // lenha empilhada sob um telhadinho
      for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
        const x = -0.8 + i * 0.4 + row * 0.2, y = 0.2 + row * 0.34;
        P.push(KP(GEO.cyl6, (i + row) % 2 ? 0x8a5a34 : 0x7a4e2c, x, y, 0, 0.34, 1.2, 0.34, Math.PI / 2, 0, 0));
        P.push(KP(GEO.cyl6, 0xd8b078, x, y, 0.61, 0.28, 0.02, 0.28, Math.PI / 2, 0, 0));
      }
      for (const x of [-1.1, 1.1]) P.push(KP(GEO.box, DWOOD, x, 0.9, -0.3, 0.1, 1.8, 0.1));
      P.push(KP(GEO.box, 0x6a3a26, 0, 1.8, 0.05, 2.5, 0.08, 1.4, 0.25, 0, 0));
      break;
    case 'chop': // cepo com machado cravado
      P.push(KP(GEO.cyl, 0x7a4e2c, 0, 0.3, 0, 0.8, 0.6, 0.8));
      P.push(KP(GEO.cyl, 0xd8b078, 0, 0.61, 0, 0.7, 0.02, 0.7));
      P.push(KP(GEO.cyl6, DWOOD, 0.1, 0.95, 0.05, 0.07, 0.8, 0.07, 0, 0, -0.5));
      P.push(KP(GEO.box, 0xb8bcc8, -0.05, 0.66, 0.05, 0.3, 0.16, 0.04, 0, 0, -0.5));
      for (let i = 0; i < 3; i++) P.push(KP(GEO.box, 0xd8b078, 0.5 + i * 0.15, 0.05, 0.3 - i * 0.2, 0.3, 0.08, 0.1, 0, i, 0));
      break;
    case 'clothesline': // varal entre dois postes, com roupas coloridas
      for (const x of [-3, 3]) { P.push(KP(GEO.cyl6, DWOOD, x, 1.1, 0, 0.12, 2.2, 0.12)); P.push(KP(GEO.box, DWOOD, x, 2.15, 0, 0.1, 0.1, 0.5)); }
      P.push(KP(GEO.cyl6, 0xd8ccb0, 0, 2.05, 0, 0.02, 6, 0.02, 0, 0, Math.PI / 2));
      [[-2.2, 0xc84a3a, 0.7, 0.8], [-1.2, 0xe8e0cc, 0.6, 1.0], [-0.2, 0x3a6aa0, 0.8, 0.7], [0.9, 0xd8b050, 0.5, 0.6], [1.9, 0x5a8a4a, 0.7, 0.9]].forEach(([x, c, w, h], i) => {
        P.push(KP(GEO.box, c, x, 2.05 - h / 2, 0, w, h, 0.03, 0, 0, (i % 2 ? 1 : -1) * 0.04));
        if (i % 2 === 0) for (const sx of [-1, 1]) P.push(KP(GEO.box, c, x + sx * (w / 2 + 0.1), 1.9, 0, 0.22, 0.26, 0.03, 0, 0, sx * 0.6)); // mangas
      });
      break;
    case 'garden': { // horta 3×3 tiles: leiras de terra com repolhos, abóboras e espantalho
      P.push(KP(GEO.box, 0x5a3e28, 0, 0.04, 0, 5.6, 0.08, 5.6));
      for (let r = 0; r < 4; r++) {
        const z = -2.1 + r * 1.4;
        P.push(KP(GEO.box, 0x6a4a30, 0, 0.14, z, 5.0, 0.2, 0.7));
        for (let i = 0; i < 6; i++) {
          const x = -2.1 + i * 0.84;
          if (r === 3 && i % 2) { P.push(KP(GEO.sphS, 0xe07a20, x, 0.4, z, 0.5, 0.36, 0.5)); P.push(KP(GEO.cyl6, 0x4a6a2a, x, 0.6, z, 0.06, 0.14, 0.06)); }
          else P.push(KP(GEO.sph, (i + r) % 2 ? 0x5a9a3a : 0x7ab84a, x, 0.4, z, 0.5, 0.36, 0.5));
        }
      }
      for (const [x, z, w, d] of [[0, -2.85, 5.8, 0.08], [0, 2.85, 5.8, 0.08], [-2.85, 0, 0.08, 5.8], [2.85, 0, 0.08, 5.8]]) P.push(KP(GEO.box, WOOD, x, 0.3, z, w, 0.08, d));
      // espantalho
      P.push(KP(GEO.cyl6, DWOOD, 1.6, 1.1, 0.7, 0.1, 2.2, 0.1));
      P.push(KP(GEO.cyl6, DWOOD, 1.6, 1.6, 0.7, 0.08, 1.6, 0.08, 0, 0, Math.PI / 2));
      P.push(KP(GEO.box, 0x8a3a2a, 1.6, 1.4, 0.7, 0.6, 0.6, 0.3));
      P.push(KP(GEO.sphS, 0xd8c08a, 1.6, 2.0, 0.7, 0.4));
      P.push(KP(GEO.cone, 0xc8a050, 1.6, 2.3, 0.7, 0.7, 0.4, 0.7));
      break;
    }
    case 'fence': // trecho de cerca (1 tile, ao longo de x)
      for (const x of [-0.95, 0.95]) P.push(KP(GEO.box, DWOOD, x, 0.5, 0, 0.14, 1.0, 0.14));
      for (const y of [0.35, 0.75]) P.push(KP(GEO.box, WOOD, 0, y, 0, 2.0, 0.1, 0.06));
      break;
    case 'coop': // galinheiro de tábuas, com rampa
      P.push(KP(GEO.box, 0x9a6a3e, 0, 0.75, 0, 1.6, 0.9, 1.2));
      for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) P.push(KP(GEO.box, DWOOD, x, 0.3, z, 0.1, 0.6, 0.1));
      P.push(KP(GEO.box, 0x1a120c, 0, 0.7, 0.61, 0.4, 0.45, 0.02));
      P.push(KP(GEO.box, WOOD, 0, 0.35, 0.95, 0.4, 0.04, 0.8, 0.5, 0, 0));
      P.push(KP(roofGeo(1.8, 1.4, 0.55, 0.12), 0x7a3426, 0, 1.2, 0, 1));
      P.push(KP(GEO.box, 0xe8dcc0, 0.4, 0.08, 1.1, 0.3, 0.05, 0.3)); // palha espalhada
      break;
    case 'haystack':
      P.push(KP(GEO.sphH, 0xd8b050, 0, 0, 0, 2.0, 2.2, 2.0));
      P.push(KP(GEO.sphH, 0xc8a040, 0, 0.9, 0, 1.3, 0.9, 1.3));
      P.push(KP(GEO.cyl6, DWOOD, 0.6, 1.1, 0.5, 0.06, 2.2, 0.06, 0.3, 0, -0.4)); // forcado
      for (let i = 0; i < 6; i++) { const a = i * 1.05; P.push(KP(GEO.box, 0xe0c060, Math.cos(a) * 1.05, 0.03, Math.sin(a) * 1.05, 0.5, 0.04, 0.12, 0, a, 0)); }
      break;
    case 'trough': // cocho de madeira com água
      P.push(KP(GEO.box, DWOOD, 0, 0.35, 0, 1.8, 0.5, 0.7));
      P.push(KP(GEO.box, 0x2a4a6a, 0, 0.58, 0, 1.6, 0.04, 0.5));
      for (const x of [-0.8, 0.8]) P.push(KP(GEO.box, WOOD, x, 0.2, 0, 0.12, 0.4, 0.9));
      break;
    case 'notice': // quadro de avisos com cartazes
      for (const x of [-0.9, 0.9]) P.push(KP(GEO.box, DWOOD, x, 1.1, 0, 0.16, 2.2, 0.16));
      P.push(KP(GEO.box, WOOD, 0, 1.45, 0, 1.9, 1.1, 0.1));
      P.push(KP(roofGeo(2.2, 0.5, 0.35, 0.1), 0x6a3426, 0, 2.1, 0, 1));
      [[-0.5, 1.6, 0xe8dcc0, 0.5, 0.6], [0.1, 1.5, 0xf0e4b0, 0.4, 0.5], [0.6, 1.65, 0xe8d0a8, 0.4, 0.4], [-0.2, 1.1, 0xd8c8a0, 0.6, 0.3], [0.55, 1.15, 0xe0d8c8, 0.3, 0.35]].forEach(([x, y, c, w, h]) => {
        P.push(KP(GEO.box, c, x, y, 0.06, w, h, 0.01, 0, 0, (x * 7) % 0.2 - 0.1));
        P.push(KP(GEO.box, 0x3a2a20, x, y + h * 0.15, 0.067, w * 0.7, 0.03, 0.005));
        P.push(KP(GEO.box, 0x3a2a20, x, y - h * 0.1, 0.067, w * 0.6, 0.03, 0.005));
        P.push(KP(GEO.sphS, 0xb03030, x, y + h / 2 - 0.05, 0.07, 0.05));
      });
      break;
    case 'signpost': // placa com setas (masmorras / mercado / torre)
      P.push(KP(GEO.cyl6, DWOOD, 0, 1.3, 0, 0.14, 2.6, 0.14));
      [[2.35, 0.3, 0x8a5a34], [1.9, -0.9, 0x9a6a3e], [1.45, 1.8, 0x7a4e2c]].forEach(([y, r, c]) => {
        P.push(KP(GEO.box, c, 0.45 * Math.cos(r), y, -0.45 * Math.sin(r), 0.9, 0.24, 0.06, 0, r, 0));
        P.push(KP(GEO.cone4, c, 0.95 * Math.cos(r), y, -0.95 * Math.sin(r), 0.2, 0.2, 0.06, 0, r, -Math.PI / 2));
        P.push(KP(GEO.box, 0xe8dcc0, 0.45 * Math.cos(r) + 0.04 * Math.sin(r), y, -0.45 * Math.sin(r) + 0.04 * Math.cos(r), 0.6, 0.04, 0.005, 0, r, 0));
      });
      P.push(KP(GEO.cone, DWOOD, 0, 2.7, 0, 0.2, 0.2, 0.2));
      break;
    case 'sacks': // sacas de grão empilhadas
      for (const [x, y, z, r] of [[-0.3, 0.3, 0, 0.2], [0.35, 0.3, 0.1, -0.3], [0, 0.3, -0.45, 0.8], [0.05, 0.8, -0.1, 0.1]]) {
        P.push(KP(GEO.sphS, 0xc8b08a, x, y, z, 0.7, 0.62, 0.55, 0, r, 0));
        P.push(KP(GEO.cyl6, 0x8a6a3a, x, y + 0.34, z, 0.16, 0.12, 0.16));
      }
      P.push(KP(GEO.sphH, 0xe8d8a0, 0.5, 0.02, 0.5, 0.5, 0.12, 0.4)); // grão derramado
      break;
    case 'pots': // potes e jarros de barro
      for (const [x, z, s, c] of [[0, 0, 1, 0xb0643a], [0.5, 0.2, 0.7, 0xc07848], [-0.4, 0.35, 0.8, 0x9a5230], [0.1, -0.5, 0.6, 0xd08a58]]) {
        P.push(KP(barrelGeo, c, x, 0, z, 0.8 * s, 1.0 * s, 0.8 * s));
        P.push(KP(GEO.cyl, c, x, 1.02 * s, z, 0.34 * s, 0.14 * s, 0.34 * s));
        P.push(KP(GEO.torusF, 0x6a3a22, x, 0.6 * s, z, 0.66 * s, 0.66 * s, 0.4, Math.PI / 2, 0, 0));
      }
      break;
    case 'produce': // caixotes abertos com frutas e legumes
      for (const [x, c] of [[-0.5, 0xd83a2a], [0.5, 0xf0c040]]) {
        P.push(KP(GEO.box, WOOD, x, 0.3, 0, 0.9, 0.5, 0.8));
        P.push(KP(GEO.box, DWOOD, x, 0.56, 0, 0.94, 0.06, 0.84));
        for (let i = 0; i < 6; i++) P.push(KP(GEO.sphLow, c, x - 0.25 + (i % 3) * 0.25, 0.6 + (i > 2 ? 0.08 : 0), -0.15 + Math.floor(i / 3) * 0.3, 0.26));
      }
      P.push(KP(GEO.box, WOOD, 0, 0.8, -0.1, 0.9, 0.4, 0.7, 0, 0.3, 0));
      for (let i = 0; i < 4; i++) P.push(KP(GEO.sph, 0x6aa040, -0.2 + (i % 2) * 0.35, 1.05, -0.2 + Math.floor(i / 2) * 0.25, 0.3, 0.26, 0.3));
      break;
    case 'oak': // árvore frondosa: tronco grosso, copa em bolas de folhas
      P.push(KP(GEO.taper, 0x6a4426, 0, 1.3, 0, 0.8, 2.6, 0.8, Math.PI, 0, 0));
      for (let i = 0; i < 3; i++) { const a = i * 2.1; P.push(KP(GEO.cone, 0x5a3a22, Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45, 0.4, 0.8, 0.4, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2)); }
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8, r = i ? 1.3 : 0, y = i ? 3.3 + (i % 3) * 0.45 : 4.3;
        P.push(fluff(KP(GEO.sph, [0x3a7a30, 0x4a8a38, 0x5a9a3e][i % 3], Math.cos(a) * r, y, Math.sin(a) * r, 2.2 - (i % 2) * 0.4, 1.8, 2.2 - (i % 2) * 0.4), [0, 3.4, 0]));
      }
      for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.3; P.push(KP(GEO.sphLow, 0xd83a2a, Math.cos(a) * 1.6, 3.2 + (i % 2) * 0.6, Math.sin(a) * 1.6, 0.2)); } // maçãs
      break;
    // ---------- O Éden ----------
    case 'gtree': case 'gtreeDeep': case 'motherTree': { // árvore gigante: raízes-contraforte, tronco largo, copa enorme em camadas, cipós
      const mother = name === 'motherTree', BARK = mother ? 0x7a5a3a : 0x5e4228, BARK2 = mother ? 0x5a4028 : 0x4a3220;
      const LEAF = mother ? [0x5ab83a, 0x7ad04a, 0x9ae05a] : name === 'gtreeDeep' ? [0x2e6a2a, 0x387a30, 0x448a36] : [0x347a2e, 0x408a34, 0x52a03c];
      const H0 = 8.5;
      P.push(KP(GEO.taper, BARK, 0, H0 / 2, 0, 2.6, H0, 2.6, Math.PI, 0, 0));
      P.push(KP(GEO.taper, BARK2, 0.2, H0 + 1.2, 0, 1.5, 2.6, 1.5, Math.PI, 0, -0.12));
      for (let i = 0; i < 6; i++) { // contrafortes
        const a = i * 1.05 + 0.3;
        P.push(KP(GEO.cone4, i % 2 ? BARK : BARK2, Math.cos(a) * 1.25, 0.9, Math.sin(a) * 1.25, 0.9, 2.6, 0.5, Math.sin(a) * 0.75, -a, -Math.cos(a) * 0.75));
        P.push(KP(GEO.cone, BARK2, Math.cos(a) * 2.1, 0.2, Math.sin(a) * 2.1, 0.5, 1.6, 0.5, Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4));
      }
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.7; P.push(KP(GEO.cone, BARK2, Math.cos(a) * 1.4, H0 - 0.6, Math.sin(a) * 1.4, 0.55, 3.4, 0.55, Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95)); } // galhos
      P.push(KP(GEO.sphS, 0x2a1a10, 0.1, 2.0, 1.25, 0.7, 1.1, 0.2)); // oco
      for (let i = 0; i < 12; i++) { // copa em três camadas
        const a = i * 0.9 + (i > 5 ? 0.4 : 0), r = i === 0 ? 0 : i < 7 ? 3.2 : 1.8, y = H0 + 1.4 + (i < 7 ? (i % 2) * 0.6 : 2.0) + (i === 0 ? 2.8 : 0);
        const sz = i === 0 ? 5 : i < 7 ? 4.4 - (i % 2) * 0.6 : 3.6;
        P.push(fluff(KP(GEO.sph, LEAF[i % 3], Math.cos(a) * r, y, Math.sin(a) * r, sz, sz * 0.72, sz), [0, H0 + 2.2, 0], 0.8));
      }
      for (let i = 0; i < 8; i++) { // cipós pendurados
        const a = i * 0.8 + 0.2, r = 3.6 + (i % 2) * 0.6, len = 2.4 + (i % 3) * 1.1;
        P.push(KP(GEO.box, i % 2 ? 0x3e7a2e : 0x4e8a34, Math.cos(a) * r, H0 + 0.6 - len / 2, Math.sin(a) * r, 0.1, len, 0.1));
        P.push(KP(GEO.ico0, 0x5aa040, Math.cos(a) * r, H0 + 0.6 - len, Math.sin(a) * r, 0.3, 0.22, 0.3));
      }
      if (mother) for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 2.4 + (i % 4) * 0.8, y = H0 + 1 + (i % 5) * 0.8; Gl.push(KP(GEO.sphLow, i % 2 ? 0xfff0a0 : 0xb0ff8a, Math.cos(a) * r, y, Math.sin(a) * r, 0.35)); }
      else for (let i = 0; i < 6; i++) { const a = i * 2.2, r = 3 + (i % 2); Gl.push(KP(GEO.sphLow, 0xe0ff9a, Math.cos(a) * r, H0 + 0.5 + (i % 3) * 0.7, Math.sin(a) * r, 0.18)); } // frutos/esporos que brilham
      break;
    }
    case 'chest': // corpo do baú (a tampa é 'chestLid', articulada atrás)
      P.push(KP(GEO.box, WOOD, 0, 0.32, 0, 1.1, 0.62, 0.72));
      for (const x of [-0.5, 0, 0.5]) P.push(KP(GEO.box, IRON, x, 0.32, 0, 0.08, 0.66, 0.76));
      P.push(KP(GEO.box, 0xc9a24a, 0, 0.5, 0.37, 0.18, 0.2, 0.06));
      P.push(KP(GEO.box, DWOOD, 0, 0.03, 0, 1.16, 0.06, 0.78));
      Gl.push(KP(GEO.box, 0xffe08a, 0, 0.63, 0, 0.98, 0.02, 0.6)); // tesouro aparece quando a tampa abre
      break;
    case 'chestLid':
      P.push(KP(GEO.cyl, WOOD, 0, 0.02, 0.36, 0.72, 1.1, 0.72, 0, 0, Math.PI / 2));
      P.push(KP(GEO.box, WOOD, 0, -0.06, 0.36, 1.1, 0.14, 0.72));
      for (const x of [-0.5, 0, 0.5]) P.push(KP(GEO.torusF, IRON, x, -0.02, 0.36, 0.76, 0.76, 0.4, 0, Math.PI / 2, 0));
      break;
    case 'shrine': { // santuário: degraus de pedra com musgo, pilar entalhado com folhas, cristais; o orbe é desenhado à parte
      P.push(KP(GEO.cyl, DSTONE, 0, 0.12, 0, 2.0, 0.24, 2.0));
      P.push(KP(GEO.cyl, STONE, 0, 0.34, 0, 1.5, 0.22, 1.5));
      P.push(KP(GEO.sphH, 0x4e8a34, 0.3, 0.42, 0.2, 1.0, 0.16, 0.6));
      P.push(KP(GEO.taper, STONE, 0, 1.0, 0, 0.8, 1.2, 0.8, Math.PI, 0, 0));
      P.push(KP(GEO.cyl, DSTONE, 0, 1.62, 0, 1.0, 0.14, 1.0));
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; P.push(KP(GEO.cone4, 0x5aa040, Math.cos(a) * 0.42, 1.0, Math.sin(a) * 0.42, 0.3, 0.7, 0.08, 0, -a, 0)); }
      for (let i = 0; i < 3; i++) { const a = i * 2.1; Gl.push(KP(GEO.oct, 0x9affc0, Math.cos(a) * 0.36, 1.85, Math.sin(a) * 0.36, 0.14, 0.4, 0.14, 0, 0, (i - 1) * 0.3)); }
      Gl.push(KP(GEO.torusF, 0xb0ffd0, 0, 0.36, 0, 1.4, 1.4, 0.4, Math.PI / 2, 0, 0));
      break;
    }
    case 'standing': // pedra em pé com musgo e runa verde
      P.push(KP(GEO.box, 0x7a8072, 0, 1.2, 0, 0.9, 2.4, 0.55, 0.04, 0, 0.05));
      P.push(KP(GEO.dod, DSTONE, 0, 2.45, 0, 0.8, 0.5, 0.55));
      P.push(KP(GEO.sphH, 0x4e8a34, 0.05, 2.55, 0, 0.8, 0.22, 0.55));
      P.push(KP(GEO.dod, DSTONE, 0.3, 0.12, 0.3, 0.5, 0.3, 0.45));
      Gl.push(KP(GEO.box, 0x8affb0, 0, 1.4, 0.285, 0.12, 0.9, 0.02));
      Gl.push(KP(GEO.box, 0x8affb0, 0, 1.6, 0.285, 0.42, 0.1, 0.02));
      break;
    case 'edenSign': // placa dos três caminhos: Floresta (verde), Raízes (marrom), Rio (azul)
      P.push(KP(GEO.cyl6, DWOOD, 0, 1.3, 0, 0.18, 2.6, 0.18));
      for (const [y, ry, c] of [[2.2, -0.9, 0x4a8a34], [1.75, 0.3, 0x7a5a34], [1.3, 1.4, 0x3a7ab8]]) {
        P.push(KP(GEO.box, c, Math.sin(ry) * 0.55, y, Math.cos(ry) * 0.55, 0.1, 0.32, 1.1, 0, ry, 0));
        P.push(KP(GEO.cone4, c, Math.sin(ry) * 1.15, y, Math.cos(ry) * 1.15, 0.36, 0.32, 0.1, Math.PI / 2, ry, 0));
      }
      P.push(KP(GEO.sphH, 0x4e8a34, 0, 2.62, 0, 0.5, 0.25, 0.5));
      Gl.push(KP(GEO.sphLow, 0xd8ff8a, 0, 2.85, 0, 0.18));
      break;
    case 'edenArch': // moldura viva do Portal do Éden: dois troncos que se curvam e se encontram, com folhas, flores e runas
      for (const sx of [-1, 1]) {
        const pts = [[2.45, 0], [2.3, 1.2], [2.2, 2.4], [2.15, 3.4], [1.9, 4.4], [1.3, 5.1], [0.55, 5.5], [0, 5.6]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0), th = 0.62 - i * 0.05;
          P.push(KP(GEO.taper, i % 2 ? 0x6a4a2c : 0x5a3e24, sx * (x0 + x1) / 2, (y0 + y1) / 2, 0, th, len + 0.2, th, 0, 0, -Math.atan2(sx * (x1 - x0), y1 - y0)));
        }
        P.push(KP(GEO.cone, 0x5a3e24, sx * 2.6, 0.3, 0.2, 0.7, 1.4, 0.7, 0.4, 0, -sx * 0.6));
        P.push(KP(GEO.cone, 0x5a3e24, sx * 2.1, 0.3, -0.3, 0.6, 1.2, 0.6, -0.4, 0, sx * 0.5));
        for (let k = 0; k < 4; k++) Gl.push(KP(GEO.box, 0x8affb0, sx * (2.25 - k * 0.1), 1.1 + k * 0.85, 0.36, 0.22, 0.1, 0.02));
      }
      for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI, r = 2.6; P.push(fluff(KP(GEO.sph, [0x3a7a30, 0x4a9a38, 0x5aae40][i % 3], Math.cos(a) * r * 0.9, 4.2 + Math.sin(a) * 1.4, (i % 2) * 0.3 - 0.15, 1.5, 1.1, 1.2), [0, 5, 0], 0.6)); }
      for (let i = 0; i < 10; i++) { const a = (i / 9) * Math.PI, r = 2.8; P.push(KP(GEO.ico0, [0xf05a8a, 0xffe070, 0xffffff][i % 3], Math.cos(a) * r * 0.9, 4.3 + Math.sin(a) * 1.5, 0.55, 0.22, 0.16, 0.1)); }
      Gl.push(KP(GEO.oct, 0xd8ffb0, 0, 5.9, 0.2, 0.5, 0.7, 0.3));
      break;
    case 'bridge': { // ponte de troncos e tábuas sobre o rio (ao longo de z)
      const L = 7.2;
      for (let i = 0; i < 12; i++) { const z = -L / 2 + (i + 0.5) * (L / 12); P.push(KP(GEO.box, i % 2 ? WOOD : 0x7a4e2c, 0, 0.32 + Math.sin((z / L + 0.5) * Math.PI) * 0.25, z, 2.3, 0.12, L / 12 - 0.04, 0, 0, (i % 3 - 1) * 0.03)); }
      for (const x of [-1.15, 1.15]) {
        P.push(KP(GEO.cyl, DWOOD, x, 0.2, 0, 0.32, L + 0.6, 0.32, Math.PI / 2, 0, 0));
        for (const z of [-L / 2, 0, L / 2]) P.push(KP(GEO.cyl6, DWOOD, x, 0.75, z, 0.14, 1.1 + (z ? 0 : 0.25), 0.14));
        P.push(KP(GEO.box, 0xb89a6a, x, 1.15, 0, 0.05, 0.05, L));
      }
      P.push(KP(GEO.sphH, 0x4e8a34, 1.15, 0.36, 2.2, 0.6, 0.18, 0.9));
      break;
    }
    case 'lily': // vitórias-régias com flor
      for (let i = 0; i < 4; i++) { const a = i * 1.7, r = i ? 0.55 : 0; P.push(KP(GEO.cyl, i % 2 ? 0x3e8a34 : 0x52a040, Math.cos(a) * r, 0, Math.sin(a) * r, 0.7 - (i % 2) * 0.2, 0.03, 0.7 - (i % 2) * 0.2)); }
      P.push(KP(GEO.cone, 0xf8a0c0, 0.1, 0.12, 0.05, 0.28, 0.22, 0.28));
      P.push(KP(GEO.sphLow, 0xffe070, 0.1, 0.2, 0.05, 0.1));
      break;
    case 'reeds': // juncos na beira da água
      for (let i = 0; i < 9; i++) { const t = (i - 4) * 0.2, h = 0.9 + ((i * 7) % 4) * 0.25; P.push(KP(GEO.blade3, i % 2 ? 0x5a8a3a : 0x7aa848, t, h / 2, ((i * 3) % 3) * 0.12 - 0.12, 0.08, h, 0.04, 0.1 * (i % 3 - 1), i, 0.1 * (i % 2 ? 1 : -1))); if (i % 3 === 0) P.push(KP(GEO.cyl6, 0x6a4a2a, t, h + 0.1, ((i * 3) % 3) * 0.12 - 0.12, 0.08, 0.3, 0.08)); }
      break;
    case 'magicFlower': // flores que brilham (elementos mágicos do Éden)
      for (let i = 0; i < 3; i++) { const a = i * 2.1, r = i ? 0.25 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.35 + (i % 2) * 0.15;
        P.push(KP(GEO.blade3, 0x4a8a34, x, h / 2, z, 0.03, h, 0.03));
        Gl.push(KP(GEO.oct, [0x9affe0, 0xe0a0ff, 0xfff08a][i], x, h + 0.06, z, 0.16, 0.12, 0.16)); }
      break;
    case 'hedge': // folhagem densa no alto da mata
      for (let i = 0; i < 6; i++) { const a = i * 1.1, r = i ? 0.7 : 0; P.push(fluff(KP(GEO.sph, [0x2e6a2a, 0x3a7e30, 0x4a9038][i % 3], Math.cos(a) * r, 0.5 + (i ? 0 : 0.35), Math.sin(a) * r, 1.6 - (i % 2) * 0.3, 1.2, 1.6 - (i % 2) * 0.3), [0, 0.4, 0])); }
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.5; P.push(KP(GEO.sphLow, [0xf8e070, 0xf05a8a][i % 2], Math.cos(a) * 0.95, 0.75 + (i % 2) * 0.3, Math.sin(a) * 0.95, 0.14)); }
      break;
    case 'rootVines': // raízes grossas descendo pela parede (Caminho das Raízes), com esporos
      for (let i = 0; i < 4; i++) {
        const x = -0.6 + i * 0.4, top = 3.6, len = 2.4 + ((i * 5) % 3) * 0.5;
        P.push(KP(GEO.taper, i % 2 ? 0x5a4028 : 0x4a3420, x, top - len / 2, 0.15, 0.22, len, 0.22, 0, 0, (i % 3 - 1) * 0.12));
        P.push(KP(GEO.cone, 0x4a3420, x + (i % 2 ? 0.2 : -0.2), 0.25, 0.35, 0.3, 0.7, 0.3, 0.9, 0, (i % 2 ? -0.5 : 0.5)));
      }
      Gl.push(KP(GEO.sphLow, 0x6affd0, -0.2, 1.4, 0.32, 0.12)); Gl.push(KP(GEO.sphLow, 0x6affd0, 0.35, 2.1, 0.3, 0.1)); Gl.push(KP(GEO.sphLow, 0x9affe0, 0.1, 0.9, 0.34, 0.08));
      break;
    case 'fallRock': // borda de pedra com musgo no alto da cachoeira (ao longo de x, face em +z)
      for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.95; P.push(KP(GEO.dod, i % 2 ? STONE : DSTONE, x, 0, 0.1 + (i % 2) * 0.15, 1.2, 0.7, 1.0, i, i * 2, 0)); }
      P.push(KP(GEO.sphH, 0x4e8a34, 0, 0.3, 0, 4.4, 0.4, 1.2));
      break;
    default:
      if (name.startsWith('rootArch')) { // arco de raiz sobre a trilha: vão de n tiles (ao longo de x), com musgo, cipós e esporos
        const n = +name.slice(8) || 6, A = (n * 2) / 2, Hh = 4.6;
        for (const [off, th, c] of [[0, 1, 0x5a4028], [0.45, 0.55, 0x4a3420]]) {
          const seg = 10;
          for (let i = 0; i < seg; i++) {
            const a0 = Math.PI - (i / seg) * Math.PI, a1 = Math.PI - ((i + 1) / seg) * Math.PI;
            const x0 = Math.cos(a0) * A, y0 = Math.sin(a0) * Hh + (off ? 0.3 : 0), x1 = Math.cos(a1) * A, y1 = Math.sin(a1) * Hh + (off ? 0.3 : 0);
            const len = Math.hypot(x1 - x0, y1 - y0), t = Math.abs(i + 0.5 - seg / 2) / (seg / 2);
            P.push(KP(GEO.cyl6, c, (x0 + x1) / 2, (y0 + y1) / 2, off * Math.sin(i), (0.45 + t * 0.4) * th, len + 0.2, (0.45 + t * 0.4) * th, 0, 0, -Math.atan2(x1 - x0, y1 - y0)));
          }
        }
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) P.push(KP(GEO.cone, 0x4a3420, sx * (A + 0.3 + k * 0.3), 0.3, (k - 1) * 0.5, 0.45, 1.4, 0.45, (k - 1) * 0.4, 0, -sx * (0.7 + k * 0.2)));
        for (let i = 0; i < 5; i++) { const x = (i - 2) / 2.5 * A * 0.7, y = Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) * Hh; P.push(KP(GEO.sphH, 0x4e8a34, x, y + 0.35, 0, 0.9, 0.3, 0.7)); P.push(KP(GEO.box, 0x3e7a2e, x + 0.2, y - 0.7, 0.1, 0.07, 1.4 - (i % 2) * 0.5, 0.07)); }
        for (let i = 0; i < 6; i++) { const x = (i - 2.5) / 3 * A * 0.8, y = Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) * Hh; Gl.push(KP(GEO.sphLow, i % 2 ? 0x6affd0 : 0xb0ffe0, x, y - 0.5, 0.3, 0.14)); }
        break;
      }
      if (name.startsWith('bunting')) { // bandeirolas pendentes de comprimento L (ao longo de x), catenária rasa
        const L = +name.slice(7) || 10, n = Math.round(L / 0.7), sag = L * 0.08;
        const yAt = (t) => -sag * (1 - (2 * t - 1) ** 2);
        const cols = [0xd83a2a, 0xf0c040, 0x3a7ad8, 0x4aa050, 0xe8e0cc, 0xa04ad0];
        for (let i = 0; i < 24; i++) { const t0 = i / 24, t1 = (i + 1) / 24, x0 = (t0 - 0.5) * L, x1 = (t1 - 0.5) * L, y0 = yAt(t0), y1 = yAt(t1); P.push(KP(GEO.box, 0x3a2a20, (x0 + x1) / 2, (y0 + y1) / 2, 0, Math.hypot(x1 - x0, y1 - y0), 0.03, 0.03, 0, 0, Math.atan2(y1 - y0, x1 - x0))); }
        for (let i = 1; i < n; i++) { const t = i / n; P.push(KP(GEO.cone4, cols[i % cols.length], (t - 0.5) * L, yAt(t) - 0.3, 0, 0.5, 0.6, 0.04, Math.PI, 0, 0)); }
        break;
      }
      P.push(KP(GEO.box, 0xff00ff, 0, 0.5, 0, 1));
  }
  const k = { geo: mergeParts(P), glow: Gl.length ? mergeParts(Gl) : null, roof };
  if (WIND[name]) windAttr(k.geo, WIND[name]);
  for (const g of [k.geo, k.glow, k.roof]) if (g) g.userData.shared = true; // cache: nunca liberar com o nível
  KITS[name] = k;
  return k;
}
/**
 * Adereço do KayKit Forest Nature Pack: 'kk:<modelo>[:escala[:tinta hex]]'.
 * UV em coordenadas do objeto (o desgaste do kitMat varia pela peça) e vento
 * pela altura, como as árvores feitas em código.
 */
function natureKit(name) {
  const [, n, s, tint] = name.split(':');
  const geo = natureGeo(n, tint ? parseInt(tint, 16) : null, s ? +s : 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  let h = 0;
  for (let i = 0; i < pos.count; i++) { h = Math.max(h, pos.getY(i)); uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.35, pos.getY(i) * 0.35); }
  const w = n.startsWith('Tree_Bare') ? [h * 0.4, h, 0.08] : n.startsWith('Tree') ? [h * 0.35, h, 0.2] : n.startsWith('Bush') ? [h * 0.2, h, 0.07] : n.startsWith('Grass') ? [0.02, h, 0.08] : null;
  if (w) windAttr(geo, w);
  geo.userData.shared = true;
  return { geo, glow: null, roof: null };
}
/** Material dos adereços: cor por vértice × textura de desgaste. */
let _kitMat = null, _kitGlow = null, _roofMat = null;
export function kitMat() {
  if (!_kitMat) { const g = texGrime(); _kitMat = toonMaterial({ vertexColors: true, map: g.map, normalMap: g.normalMap }, { rim: 0.22 }); _kitMat.normalScale.setScalar(0.6); _kitMat.userData.shared = true; cutaway(_kitMat); }
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
    cutaway(_kitGlow);
  }
  return _kitGlow;
}
/**
 * Variante do material do kit com vento: desloca no vertex shader os vértices
 * com atributo `wind` (amplitude em m, zero na base), com fase pela posição da
 * instância e rajadas lentas. Mesmo toon estilizado e recorte do kit.
 */
let _kitWind = null;
export function kitWindMat() {
  if (!_kitWind) {
    const g = texGrime();
    const m = new THREE.MeshToonMaterial({ vertexColors: true, map: g.map, normalMap: g.normalMap });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = glowTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float wind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec2 wBase = modelMatrix[3].xz;
            #ifdef USE_INSTANCING
              wBase += instanceMatrix[3].xz;
            #endif
            float wPh = dot(wBase, vec2(0.37, 0.53));
            float wGust = 0.55 + 0.45 * sin(uTime * 0.31 + wBase.x * 0.045 + wBase.y * 0.03);
            vec2 wS = vec2(sin(uTime * 1.6 + wPh) + 0.35 * sin(uTime * 3.7 + wPh * 2.1), 0.6 * cos(uTime * 1.25 + wPh * 1.3));
            transformed.xz += wS * wind * wGust;
            transformed.y -= 0.25 * wind * abs(wS.x) * wGust;
          }`);
    };
    _kitWind = stylize(m, { rim: 0.22 });
    _kitWind.normalScale.setScalar(0.6);
    _kitWind.userData.shared = true;
    cutaway(_kitWind);
  }
  return _kitWind;
}

/**
 * Lava das poças: ruído rolando no tempo em faixas de cor (degraus, estilo toon),
 * pontos quentes e uma borda de "espuma" clara antes da crosta escura. Cores em
 * HDR (acima do limiar do bloom). Desenhada num disco de raio 1 com instancing.
 */
let _lava = null;
export function lavaMat() {
  if (!_lava) {
    _lava = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `uniform float uTime; varying vec2 vL; varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vL = position.xz;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vL; varying vec3 vW;
        #include <fog_pars_fragment>
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float r = length(vL);
          if (r > 1.0) discard;
          vec2 p = vW.xz * 0.9;
          float n = vn(p + vec2(uTime * 0.18, uTime * 0.11)) * 0.6 + vn(p * 2.3 - vec2(uTime * 0.27, -uTime * 0.2)) * 0.4;
          float h = n * 0.85 + (1.0 - r) * 0.35;
          float band = floor(h * 4.0) / 3.0;
          vec3 col = mix(vec3(0.55, 0.05, 0.015), vec3(1.9, 0.5, 0.06), clamp(band, 0.0, 1.0));
          col = mix(col, vec3(2.4, 1.2, 0.25), step(0.92, h));
          // espuma: anel claro ondulando antes da crosta
          float a = atan(vL.y, vL.x);
          float fr = 0.8 + 0.04 * sin(a * 7.0 + uTime * 1.5);
          float foam = smoothstep(fr - 0.09, fr - 0.02, r) * (1.0 - smoothstep(fr, fr + 0.05, r));
          col = mix(col, vec3(2.4, 1.3, 0.35), foam * (0.65 + 0.35 * sin(a * 13.0 - uTime * 2.4)));
          col = mix(col, vec3(0.07, 0.03, 0.025), smoothstep(fr + 0.02, fr + 0.08, r));
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
      fog: true, polygonOffset: true, polygonOffsetFactor: -2,
    });
    _lava.uniforms.uTime = glowTime;
    _lava.userData.shared = true;
  }
  return _lava;
}
export function roofMat() {
  if (!_roofMat) { const t = texShingles('shingles3', { a: 0xa04632, b: 0x7a3426 }); _roofMat = toonMaterial({ map: t.map, normalMap: t.normalMap, side: THREE.DoubleSide }, { rim: 0.2 }); _roofMat.userData.shared = true; }
  return _roofMat;
}
