// ---------- montagem visual do nível: chão, paredes, adereços, decalques, névoa, chamas e tochas ----------
import { GEO } from '../art/geometry.js';
import { disposeObject } from '../art/materials.js';
import { CUT, CUT_GLSL, cutaway, setCutaway } from '../art/cutaway.js';
import { setShadowTint, stylize, toonGradient, toonMaterial } from '../art/stylize.js';
import { fbm, hash2, makeTexSet, sat, texDecal, texPlaza, vnoise } from '../art/textures.js';
import { CONFIG } from '../core/config.js';
import { R, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { camera, hemi, heroLight, renderer, scene, setGrade, setHeightFog, sun, torchLights, world } from '../engine/renderer.js';
import { biomeTex } from './biomeTextures.js';
import { BIOMES } from './biomes.js';
import { kit, kitGlowMat, kitMat, kitWindMat, lavaMat, roofMat, setInstance, setKitGlowTime } from './kit.js';
import { buildTownFx, clearTownFx, updateTownFx } from './townfx.js';
import { buildEdenFx, clearEdenFx, updateEdenFx } from './edenfx.js';

const LAVA_DISC = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
LAVA_DISC.userData.shared = true;
/** Adereços com cone de luz: [altura da fonte, raio da boca, comprimento, cor]. */
const CONE_KITS = { brazier: [1.35, 1.1, 3.2, 0xffa050], crystalBig: [0.6, 1.3, 4.2, 0x8ac0ff] };
let cones = [];
let levelMeshes = [];
/** Malhas do nível atual (diagnóstico/testes). */
export function getLevelMeshes() { return levelMeshes; }
let torches = [];
let fires = []; // {x, y, z, size, kind} para chamas animadas
function addLevel(o) { world.add(o); levelMeshes.push(o); return o; }
/** Desenha uma lista de adereços `name` com instancing. fn(p) → {x,y,z,ry,s,sy} */
function placeKit(name, list, fn, opt) {
  if (!list.length) return;
  const k = kit(name);
  const mk = (geo, mat, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      const o = fn(p, i);
      const s = o.s || 1;
      setInstance(m, i, o.x, o.y || 0, o.z, o.rx || 0, o.ry || 0, 0, o.sx || s, o.sy || s, o.sz || s);
    });
    m.castShadow = shadow; m.receiveShadow = true;
    m.computeBoundingSphere();
    return addLevel(m);
  };
  mk(k.geo, k.geo.attributes.wind ? kitWindMat() : kitMat(), !(opt && opt.noShadow));
  // raios de luz falsos saindo de braseiros e cristais grandes (ver buildCones)
  const cs = CONE_KITS[name];
  if (cs) list.forEach((p, i) => { const o = fn(p, i), s = o.s || 1; cones.push({ x: o.x, y: (o.y || 0) + cs[0] * s, z: o.z, r: cs[1] * s, h: cs[2] * s, color: cs[3] }); });
  if (k.glow) { const g = mk(k.glow, kitGlowMat(), false); g.renderOrder = 3; }
  if (k.roof) mk(k.roof, roofMat(), true);
}

// =============================================================================
// Chão e paredes: malhas únicas com UV em coordenadas de mundo (sem emendas),
// oclusão ambiente por vértice e mistura de duas texturas por manchas.
// =============================================================================
function groundMaterial(A, Bt, tint) {
  const m = new THREE.MeshToonMaterial({ map: A.map, normalMap: A.normalMap, vertexColors: true });
  if (tint) m.color.setHex(tint);
  m.normalScale.setScalar(0.6);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.map2 = { value: Bt.map };
    sh.uniforms.normalMap2 = { value: Bt.normalMap };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float blend; varying float vBlend;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBlend = blend;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D map2; uniform sampler2D normalMap2; varying float vBlend;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n vec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(map2, vMapUv * 0.8), vBlend);\n diffuseColor *= sampledDiffuseColor;\n#endif')
      .replace('texture2D( normalMap, vNormalMapUv )', 'mix(texture2D( normalMap, vNormalMapUv ), texture2D( normalMap2, vNormalMapUv * 0.8 ), vBlend)');
  };
  return stylize(m, { rim: 0 });
}
/** Chão: um quad por tile andável, UV = mundo/4, AO nos cantos junto às paredes. */
function buildGround(L, T, blendFn, tintFn) {
  const { W, H, grid } = L;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) n++;
  const pos = new Float32Array(n * 18), uv = new Float32Array(n * 12), col = new Float32Array(n * 18), bl = new Float32Array(n * 6), nor = new Float32Array(n * 18);
  const aoAt = (cx, cz) => { // canto (cx,cz) em coordenadas de tile (entre tiles)
    let w = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!at(cx + dx, cz + dz)) w++;
    return 1 - w * 0.2;
  };
  let k = 0;
  const T2 = TILE / 2;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!at(x, z)) continue;
    const cs = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
    const order = [0, 3, 2, 0, 2, 1];
    for (const ci of order) {
      const [cx, cz] = cs[ci];
      const wx = cx * TILE - T2, wz = cz * TILE - T2;
      pos[k * 3] = wx; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = wz;
      nor[k * 3 + 1] = 1;
      uv[k * 2] = wx / 4; uv[k * 2 + 1] = wz / 4;
      const a = aoAt(cx, cz), nn = 0.86 + vnoise(wx * 0.15, wz * 0.15, 999, 5) * 0.28;
      col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = a * nn;
      if (tintFn) { const c = tintFn(x, z, wx, wz); col[k * 3] *= c[0]; col[k * 3 + 1] *= c[1]; col[k * 3 + 2] *= c[2]; }
      bl[k] = blendFn(wx, wz);
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('blend', new THREE.BufferAttribute(bl, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, groundMaterial(T.a, T.b));
  m.receiveShadow = true;
  return addLevel(m);
}
/**
 * Paredes: bloco por tile de parede vizinho do chão. Faces só onde aparecem;
 * UV em mundo (sem esticar), topo escurecido, base com oclusão.
 * rough: jitter das quinas (cavernas/abismo) com ruído determinístico.
 * Todas as paredes são altas (labirinto): o que fica entre a câmera e o herói
 * some pelo recorte de visão (art/cutaway.js), em vez de a parede ser baixa.
 */
function buildWalls(L, T, opt) {
  const { W, H, grid } = L;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  const rnd = R.mulberry32(L.seed * 7 + 3);
  const hts = new Float32Array(W * H);
  const walls = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (at(x, z)) continue;
    let adj = false;
    for (let dz = -1; dz <= 1 && !adj; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz)) { adj = true; break; }
    if (!adj) continue;
    const h = opt.h + (rnd() - 0.5) * opt.var;
    hts[z * W + x] = h;
    walls.push({ x, z, h, low: false });
  }
  const P = [], U = [], C = [], N = [];
  const T2 = TILE / 2;
  const jit = (x, z) => (opt.rough ? (vnoise(x * 0.9, z * 0.9, 999, 11) - 0.5) * opt.rough : 0);
  const jh = (x, z) => (opt.rough ? (vnoise(x * 0.7, z * 0.7, 999, 23) - 0.5) * opt.rough * 1.6 : 0);
  const push = (p, u, c, nrm) => { P.push(p[0], p[1], p[2]); U.push(u[0], u[1]); if (typeof c === 'number') C.push(c, c, c); else C.push(c[0], c[1], c[2]); N.push(nrm[0], nrm[1], nrm[2]); };
  // cor do topo/borda: tom do bioma (musgo, grama, pedra clara) sobre a textura da parede
  const capHex = typeof opt.capCol === 'number' && opt.capCol > 1 ? opt.capCol : null;
  const capRGB = capHex != null ? (() => { const c = new THREE.Color(capHex); return [c.r * 1.6, c.g * 1.6, c.b * 1.6]; })() : opt.capCol;
  const shadeRGB = (c, k) => (typeof c === 'number' ? c * k : [c[0] * k, c[1] * k, c[2] * k]);
  const LIP = opt.lip || 0;
  const quad = (a, b, c, d, ua, ub, uc, ud, ca, cb, cc, cd, nrm) => {
    // garante a face voltada para `nrm` (as abas são montadas em qualquer ordem)
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
    const dot = (ey * fz - ez * fy) * nrm[0] + (ez * fx - ex * fz) * nrm[1] + (ex * fy - ey * fx) * nrm[2];
    if (dot < 0) { [b, d] = [d, b]; [ub, ud] = [ud, ub]; [cb, cd] = [cd, cb]; }
    push(a, ua, ca, nrm); push(b, ub, cb, nrm); push(c, uc, cc, nrm); push(a, ua, ca, nrm); push(c, uc, cc, nrm); push(d, ud, cd, nrm);
  };
  const corner = (cx, cz, y) => { const wx = cx * TILE - T2, wz = cz * TILE - T2; return [wx + jit(wx, wz), y, wz + jit(wz, wx)]; };
  for (const w of walls) {
    const { x, z, h } = w;
    const top = (cx, cz) => h + (w.low ? 0 : jh(cx * TILE, cz * TILE));
    // topo
    const c00 = corner(x, z, top(x, z)), c10 = corner(x + 1, z, top(x + 1, z)), c11 = corner(x + 1, z + 1, top(x + 1, z + 1)), c01 = corner(x, z + 1, top(x, z + 1));
    const tc = capRGB;
    quad(c00, c01, c11, c10, [c00[0] / 4, c00[2] / 4], [c01[0] / 4, c01[2] / 4], [c11[0] / 4, c11[2] / 4], [c10[0] / 4, c10[2] / 4], tc, tc, tc, tc, [0, 1, 0]);
    // tampa interna na altura do pé da parede: escondida dentro do bloco, aparece só quando o recorte de visão corta a parede
    const sy = 0.6, s00 = corner(x, z, sy), s10 = corner(x + 1, z, sy), s11 = corner(x + 1, z + 1, sy), s01 = corner(x, z + 1, sy), sc = shadeRGB(tc, 0.6);
    quad(s00, s01, s11, s10, [s00[0] / 4, s00[2] / 4], [s01[0] / 4, s01[2] / 4], [s11[0] / 4, s11[2] / 4], [s10[0] / 4, s10[2] / 4], sc, sc, sc, sc, [0, 1, 0]);
    // lados: [dx,dz, canto A, canto B, normal]
    for (const [dx, dz, A, Bc, nrm] of [[0, -1, [x + 1, z], [x, z], [0, 0, -1]], [0, 1, [x, z + 1], [x + 1, z + 1], [0, 0, 1]], [-1, 0, [x, z], [x, z + 1], [-1, 0, 0]], [1, 0, [x + 1, z + 1], [x + 1, z], [1, 0, 0]]]) {
      const nx = x + dx, nz = z + dz;
      const nh = at(nx, nz) ? 0 : hts[(nz >= 0 && nz < H && nx >= 0 && nx < W) ? nz * W + nx : 0] || 0;
      if (nh >= h - 0.01 && !at(nx, nz)) continue;
      const y0 = at(nx, nz) ? 0 : nh;
      const ta = top(A[0], A[1]), tb = top(Bc[0], Bc[1]);
      const pa0 = corner(A[0], A[1], y0), pb0 = corner(Bc[0], Bc[1], y0), pb1 = corner(Bc[0], Bc[1], tb), pa1 = corner(A[0], A[1], ta);
      const along = (p) => (dz ? p[0] : p[2]) / 4;
      const ao0 = y0 === 0 ? 0.45 : 0.8;
      quad(pa0, pb0, pb1, pa1, [along(pa0), y0 / 4], [along(pb0), y0 / 4], [along(pb1), tb / 4], [along(pa1), ta / 4], ao0, ao0, 1, 1, nrm);
      // borda saliente no alto (aba de musgo/grama/pedra): silhueta mais "desenhada"
      if (LIP && !w.low && at(nx, nz)) {
        const o = LIP, dd = 0.42;
        const out = (p, dy) => [p[0] + nrm[0] * o, p[1] + dy, p[2] + nrm[2] * o];
        const A1 = out(pa1, 0.05), B1 = out(pb1, 0.05), A0 = out(pa1, -dd), B0 = out(pb1, -dd);
        const lipC = shadeRGB(tc, 0.85);
        quad(A0, B0, B1, A1, [along(A0), (ta - dd) / 4], [along(B0), (tb - dd) / 4], [along(B1), tb / 4], [along(A1), ta / 4], shadeRGB(tc, 0.55), shadeRGB(tc, 0.55), lipC, lipC, nrm);
        // tampa da aba (liga o topo da parede à aba)
        const pa1u = [pa1[0], pa1[1] + 0.05, pa1[2]], pb1u = [pb1[0], pb1[1] + 0.05, pb1[2]];
        quad(pa1u, A1, B1, pb1u, [pa1[0] / 4, pa1[2] / 4], [A1[0] / 4, A1[2] / 4], [B1[0] / 4, B1[2] / 4], [pb1[0] / 4, pb1[2] / 4], tc, tc, tc, tc, [0, 1, 0]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
  if (opt.rough) g.computeVertexNormals(); else g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  g.computeBoundingSphere();
  const mat = toonMaterial({ map: T.wall.map, normalMap: T.wall.normalMap, vertexColors: true, flatShading: !!opt.rough }, { rim: 0.12 });
  mat.normalScale.setScalar(0.7);
  mat.color.setHex(T.wallCol || 0xffffff);
  if (T.wall.emissiveMap) { mat.emissiveMap = T.wall.emissiveMap; mat.emissive = new THREE.Color(T.wallGlow || 0xff5a10); mat.emissiveIntensity = 0.9; }
  cutaway(mat);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  addLevel(m);
  return walls;
}

// ---------- decalques e névoa ----------
function placeDecals(list, kind, size, opt) {
  if (!list.length) return;
  const t = texDecal(kind);
  // glow: decalque que brilha (runas da torre), aditivo e sem tone mapping
  const mat = opt && opt.glow
    ? new THREE.MeshBasicMaterial({ map: t.map, color: opt.glow, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 })
    : new THREE.MeshToonMaterial({ map: t.map, gradientMap: toonGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: opt && opt.vertical ? THREE.DoubleSide : THREE.FrontSide });
  const geo = GEO.plane;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((p, i) => {
    const sc = size * (p.s || 1);
    if (opt && opt.vertical) setInstance(m, i, p.x, p.y, p.z, 0, p.ry || 0, 0, sc, sc, 1);
    else setInstance(m, i, p.x, 0.02 + i * 0.0004, p.z, -Math.PI / 2, 0, p.r || 0, sc, sc, 1);
  });
  m.renderOrder = 1;
  cutaway(mat);
  m.receiveShadow = true;
  m.computeBoundingSphere();
  addLevel(m);
}
let mist = null;
function mistTexture() {
  return makeTexSet('mist', 128, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = fbm(u, v, 4, 4, 77);
    return { h: 0, c: [255, 255, 255], a: sat(1 - d) * sat(n * 1.6 - 0.2) * 255 };
  }, { alpha: true, bump: 0 });
}
function buildMist(color, op) {
  const t = mistTexture();
  const mat = new THREE.MeshBasicMaterial({ map: t.map, color, transparent: true, opacity: op, depthWrite: false, fog: true });
  mist = new THREE.InstancedMesh(GEO.plane, mat, 14);
  mist.userData.p = Array.from({ length: 14 }, (_, i) => ({ x: (Math.random() - 0.5) * 50, z: (Math.random() - 0.5) * 50, s: 8 + Math.random() * 8, r: Math.random() * 6, v: (Math.random() - 0.5) * 0.08, y: 0.25 + Math.random() * 0.5 }));
  mist.frustumCulled = false;
  mist.renderOrder = 5;
  addLevel(mist);
}
function updateMist(px, pz, dt) {
  if (!mist) return;
  mist.userData.p.forEach((p, i) => {
    p.r += p.v * dt; p.x += 0.25 * dt;
    let dx = p.x - px, dz = p.z - pz;
    if (dx > 30) p.x -= 60; if (dx < -30) p.x += 60; if (dz > 30) p.z -= 60; if (dz < -30) p.z += 60;
    setInstance(mist, i, p.x, p.y, p.z, -Math.PI / 2, 0, p.r, p.s, p.s, 1);
  });
  mist.instanceMatrix.needsUpdate = true;
}

// ---------- chamas (sprites aditivos + faíscas) ----------
let _flameTex = null;
function flameTexture() {
  if (_flameTex) return _flameTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.2, 'rgba(255,170,80,.8)'); gr.addColorStop(0.5, 'rgba(255,90,20,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _flameTex = new THREE.CanvasTexture(c);
  return _flameTex;
}
let flameSprites = null;
function buildFlames() {
  flameSprites = null;
  if (!fires.length) return;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(fires.length * 3), size = new Float32Array(fires.length), col = new Float32Array(fires.length * 3);
  fires.forEach((f, i) => { pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z; size[i] = f.size; const c = new THREE.Color(f.color || 0xff9a40); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('fcol', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: flameTexture() }, uTime: { value: 0 }, uScale: { value: 500 }, ...CUT },
    vertexShader: 'attribute float size; attribute vec3 fcol; varying vec3 vC; uniform float uTime; uniform float uScale; ' + CUT_GLSL + ' void main(){ vC = fcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); float f = 0.85 + 0.1 * sin(uTime * 13.0 + position.x * 3.1) + 0.06 * sin(uTime * 29.0 + position.z * 5.3); gl_PointSize = cutHidden(position) ? 0.0 : size * f * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uMap; varying vec3 vC; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(t.rgb * vC * 1.6 * t.a, 1.0); }',
  });
  flameSprites = new THREE.Points(geo, mat);
  flameSprites.frustumCulled = false;
  flameSprites.renderOrder = 4;
  addLevel(flameSprites);
}
/** Tocha de parede: suporte + chama + luz. */
function addTorch(x, y, z, ry, cold) {
  torches.push({ x, y: y + 0.5, z, cold });
  fires.push({ x: x + Math.sin(ry) * 0.37, y: y + 0.55, z: z + Math.cos(ry) * 0.37, size: 1.3, color: cold ? 0x7ab8ff : 0xffa050, emit: !cold });
  return { x, y, z, ry };
}

// =============================================================================
// Montagem do nível
// =============================================================================
export function buildLevel(L) {
  // libera o nível anterior: geometrias e materiais próprios (kits, GEO e materiais em cache são compartilhados)
  for (const m of levelMeshes) {
    world.remove(m);
    if (m.isInstancedMesh && m.dispose) m.dispose();
    disposeObject(m, true);
  }
  levelMeshes = [];
  torches = [];
  fires = [];
  mist = null;
  shafts = null;
  cones = [];
  clearTownFx();
  clearEdenFx();
  const B = BIOMES[L.biome];
  scene.background = new THREE.Color(B.fog[0]);
  scene.fog = new THREE.Fog(B.fog[0], B.fog[1], B.fog[2]);
  hemi.color.setHex(B.hemi[0]); hemi.groundColor.setHex(B.hemi[1]); hemi.intensity = B.hemi[2] * 0.72; // no toon, luz ambiente forte achata as faixas
  sun.color.setHex(B.sun[0]); sun.intensity = B.sun[1] * 1.35;
  heroLight.color.setHex(B.light);
  heroLight.intensity = L.biome === 'town' ? 26 : 36;
  renderer.toneMappingExposure = (B.exposure || 1.05) * 0.88;
  setGrade(B.grade && B.grade[0], B.grade && B.grade[1], B.look);
  setHeightFog(B.hfog);
  setShadowTint(B.shadow && B.shadow[0], B.shadow ? B.shadow[1] * CONFIG.style.shadowTint : 0);
  const T = biomeTex(L.biome);
  const town = L.biome === 'town';
  // chão: cidade = calçamento nas ruas, grama fora; masmorras = manchas de A/B
  const sd = L.seed % 1000;
  const blendFn = town
    ? (x, z) => { const tx = x / TILE, tz = z / TILE; return L.isPath(Math.round(tx), Math.round(tz)) ? sat((fbm(x / 60, z / 60, 4, 3, 5) - 0.62) * 3) : 1; }
    : L.biome === 'eden' ? edenBlend(L, sd)
    : (x, z) => sat((fbm(((x / 40) % 1 + 1) % 1, ((z / 40) % 1 + 1) % 1, 3, 4, sd) - 0.52) * 5);
  buildGround(L, T, blendFn, L.biome === 'eden' ? edenTint(L) : null);
  const wopt = {
    town: { h: 2.6, var: 0.4, capCol: 0.7 },
    forest: { h: 3.4, var: 0.9, rough: 0.9, lip: 0.22 },
    caves: { h: 3.8, var: 1.0, rough: 1.1, lip: 0.16 },
    ruins: { h: 3.4, var: 0.8, lip: 0.18 },
    castle: { h: 4.0, var: 0.2, lip: 0.2 },
    abyss: { h: 3.6, var: 1.0, rough: 1.1, lip: 0.14 },
    tw_granite: { h: 4.2, var: 0.15, lip: 0.2 },
    tw_arcane: { h: 4.2, var: 0.1, lip: 0.2 },
    tw_storm: { h: 3.8, var: 0.35, lip: 0.18 },
    tw_void: { h: 4.0, var: 0.6, rough: 0.6, lip: 0.16 },
    eden: { h: 4.4, var: 1.0, rough: 0.6, lip: 0.24 },
  }[L.biome];
  if (wopt.capCol == null) wopt.capCol = T.capCol;
  const walls = buildWalls(L, T, wopt);
  if (!town) decorateMaze(L, walls, R.mulberry32(L.seed * 19 + 5));
  const at = (x, z) => (x < 0 || z < 0 || x >= L.W || z >= L.H ? 0 : L.grid[z * L.W + x]);
  const rnd = R.mulberry32(L.seed * 13 + 1);
  // tochas nas paredes altas voltadas para o jogador (+x / +z)
  const sconces = [];
  if (!town && L.biome !== 'eden') walls.forEach((w) => {
    if (w.low || w.decor) return;
    const fx = at(w.x + 1, w.z) === 1, fz = !fx && at(w.x, w.z + 1) === 1;
    if ((fx || fz) && rnd() < (L.biome === 'caves' ? 0.03 : 0.075)) {
      const ry = fx ? Math.PI / 2 : 0;
      const x = w.x * TILE + (fx ? 1.02 : 0), z = w.z * TILE + (fz ? 1.02 : 0);
      sconces.push(addTorch(x, 2.2, z, ry));
    }
  });
  placeKit('sconce', sconces, (p) => ({ x: p.x, y: p.y, z: p.z, ry: p.ry }), { noShadow: true });
  // ameias no castelo, estacas na paliçada da cidade
  const tall = walls.filter((w) => !w.low);
  if (L.biome === 'castle' || L.tower) placeKit('crenel', tall.filter((w) => (w.x + w.z) % 2 === 0), (w) => ({ x: w.x * TILE, y: w.h, z: w.z * TILE }));
  if (town) placeKit('stake', tall, (w) => ({ x: w.x * TILE, y: w.h, z: w.z * TILE, s: 1.4, ry: rnd() * 3 }));
  buildProps(L, B, rnd);
  scatterClutter(L, walls);
  buildFlames();
  const mc = { town: [0x8090b0, 0.08], forest: [0x9ab08a, 0.1], caves: [0x6a7aaa, 0.08], ruins: [0xa098b0, 0.08], castle: [0x806068, 0.07], abyss: [0x8a4a30, 0.08], tw_granite: [0x8090b0, 0.07], tw_arcane: [0x8a6ab0, 0.09], tw_storm: [0x6aa0b0, 0.1], tw_void: [0x8a3a7a, 0.08], eden: [0xc0f0d0, 0.12] }[L.biome];
  buildMist(mc[0], mc[1]);
  buildShafts(L, R.mulberry32(L.seed * 7 + 3));
  buildCones();
}

// ---------- raios de luz (fachos inclinados vindos do alto, na direção do sol) ----------
const SHAFTS = {
  town: [0x9ab4ff, 4, 0.06], forest: [0xe0f8a8, 10, 0.13], caves: [0x7ab8ff, 6, 0.11],
  ruins: [0xffe2b0, 8, 0.12], castle: [0xff9a8a, 5, 0.09], abyss: [0xff7a3a, 4, 0.07],
  eden: [0xf0ffc0, 18, 0.15],
  tw_granite: [0xd8e4ff, 7, 0.11], tw_arcane: [0xd0a8ff, 6, 0.12], tw_storm: [0xbff4ff, 9, 0.13], tw_void: [0xff8ad8, 5, 0.09],
};
let shafts = null;
function buildShafts(L, rnd) {
  const S = SHAFTS[L.biome];
  if (!S) return;
  const spots = [];
  for (let tries = 0; spots.length < S[1] && tries < 400; tries++) {
    const x = 1 + Math.floor(rnd() * (L.W - 2)), z = 1 + Math.floor(rnd() * (L.H - 2));
    if (L.grid[z * L.W + x] !== 1 || (L.isPath && L.isPath(x, z))) continue;
    if (spots.some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) < 6)) continue;
    spots.push({ x, z });
  }
  if (!spots.length) return;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(S[0]) }, uOp: { value: S[2] }, uTime: { value: 0 } },
    vertexShader: `varying float vH; varying float vF; varying float vPh; varying float vD;
      void main() {
        vH = position.y + 0.5;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vF = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        vPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
        vec4 mv = viewMatrix * wp; vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp; uniform float uTime;
      varying float vH; varying float vF; varying float vPh; varying float vD;
      void main() {
        float a = smoothstep(0.0, 0.3, vH) * (1.0 - smoothstep(0.55, 1.0, vH)) * pow(vF, 2.0);
        a *= 0.7 + 0.3 * sin(uTime * 0.5 + vPh) * sin(uTime * 0.23 + vPh * 1.7);
        a *= 1.0 - smoothstep(45.0, 75.0, vD);
        gl_FragColor = vec4(uColor * a * uOp, 1.0);
      }`,
  });
  shafts = new THREE.InstancedMesh(GEO.beam, mat, spots.length);
  // inclinação: do chão em direção ao sol (ver updateCamera: sol em -14, +34, +10)
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-14, 34, 10).normalize());
  const e = new THREE.Euler().setFromQuaternion(tilt);
  const H = 16;
  shafts.userData.spots = spots.map((p, i) => {
    const w = 4 + rnd() * 3, x = p.x * TILE, z = p.z * TILE;
    // o centro do cilindro fica a meia altura, deslocado ao longo do eixo inclinado
    const ax = new THREE.Vector3(0, H / 2, 0).applyQuaternion(tilt);
    setInstance(shafts, i, x + ax.x, ax.y, z + ax.z, e.x, e.y, e.z, w, H, w);
    return { x, z, r: w * 0.3 };
  });
  shafts.frustumCulled = false;
  shafts.renderOrder = 6;
  addLevel(shafts);
}
// ---------- cones de luz: brilho aditivo que sai das fontes (lampiões para baixo; braseiros e cristais para cima) ----------
const CONE_GEO = new THREE.CylinderGeometry(1, 0.22, 1, 14, 1, true).translate(0, 0.5, 0);
CONE_GEO.userData.shared = true;
let coneMesh = null;
function buildCones() {
  coneMesh = null;
  if (!cones.length) return;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOp: { value: 0.16 } },
    vertexShader: `varying float vH; varying float vF; varying float vPh; varying vec3 vC;
      void main() {
        vH = position.y; vC = instanceColor;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vF = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        vPh = instanceMatrix[3].x * 0.71 + instanceMatrix[3].z * 0.43;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `uniform float uOp; uniform float uTime; varying float vH; varying float vF; varying float vPh; varying vec3 vC;
      void main() {
        float a = smoothstep(0.0, 0.1, vH) * (1.0 - smoothstep(0.25, 1.0, vH)) * pow(vF, 1.5);
        a *= 0.75 + 0.25 * sin(uTime * 2.1 + vPh) * sin(uTime * 0.9 + vPh * 2.3);
        gl_FragColor = vec4(vC * a * uOp, 1.0);
      }`,
  });
  coneMesh = new THREE.InstancedMesh(CONE_GEO, mat, cones.length);
  const c = new THREE.Color();
  cones.forEach((k, i) => {
    // h < 0: cone virado para baixo (a boca estreita fica na fonte de luz)
    setInstance(coneMesh, i, k.x, k.y, k.z, k.h < 0 ? Math.PI : 0, 0, 0, k.r, Math.abs(k.h), k.r);
    coneMesh.setColorAt(i, c.setHex(k.color));
  });
  coneMesh.computeBoundingSphere();
  coneMesh.renderOrder = 6;
  addLevel(coneMesh);
}
function updateShafts(px, pz, t, dt) {
  if (coneMesh) coneMesh.material.uniforms.uTime.value = t;
  if (!shafts) return;
  shafts.material.uniforms.uTime.value = t;
  // poeira flutuando dentro dos fachos próximos
  for (const s of shafts.userData.spots) {
    if ((s.x - px) ** 2 + (s.z - pz) ** 2 > 28 * 28 || Math.random() > dt * 5) continue;
    const a = Math.random() * 6.28, r = Math.random() * s.r;
    emit(s.x + Math.cos(a) * r, 0.4 + Math.random() * 2.5, s.z + Math.sin(a) * r, { n: 1, color: shafts.material.uniforms.uColor.value.getHex(), speed: 0.15, up: 0.2, life: 3.5, size: 0.28, grav: 0.02, drag: 0.5, alpha: 0.55 });
  }
}

/** Adereços por bioma a partir da lista de props do gerador. */
function buildProps(L, B, rnd) {
  const T = TILE;
  const tall = L.props.filter((p) => p.kind === 'tall');
  const low = L.props.filter((p) => p.kind === 'low');
  const decal = L.props.filter((p) => p.kind === 'decal');
  const pos = (p, j) => ({ x: p.x * T + (j ? (hash2(p.x, p.z, 3) - 0.5) * j : 0), z: p.z * T + (j ? (hash2(p.x, p.z, 4) - 0.5) * j : 0) });
  const by = (arr, fn) => arr.filter(fn);
  const addFire = (x, y, z, size, color) => fires.push({ x, y, z, size, color: color || 0xff9a40, emit: true });
  if (L.biome === 'town') {
    const P = (k) => L.props.filter((p) => p.kind === k);
    placeKit('fountain', P('fountain'), (p) => ({ x: p.x * T, z: p.z * T }));
    placeKit('house', P('house'), (p) => ({ x: p.x * T, z: p.z * T, ry: p.r ? Math.PI / 2 : 0 }));
    // chaminés soltam fumaça (faíscas) — anotadas como fogo sem sprite
    placeKit('pine', by(P('tree'), (p) => p.v > 0.35), (p) => ({ x: p.x * T, z: p.z * T, s: 0.8 + p.v * 0.5, ry: p.v * 6 }));
    placeKit('deadTree', by(P('tree'), (p) => p.v <= 0.35), (p) => ({ x: p.x * T, z: p.z * T, s: 0.9 + p.v, ry: p.v * 9 }));
    placeKit('bush', P('bush'), (p) => ({ x: p.x * T, z: p.z * T, s: 0.7 + p.v * 0.6, ry: p.v * 6 }));
    placeKit('lamp', P('lamp'), (p) => ({ x: p.x * T, z: p.z * T, ry: -Math.atan2(23 - p.z, 23 - p.x) }));
    P('lamp').forEach((p) => { const a = Math.atan2(23 - p.z, 23 - p.x); const lx = p.x * T + Math.cos(a) * 0.62, lz = p.z * T + Math.sin(a) * 0.62; torches.push({ x: lx, y: 2.3, z: lz, lamp: true }); addFire(lx, 2.8, lz, 1.6, 0xffc070); cones.push({ x: lx, y: 2.75, z: lz, r: 1.5, h: -2.75, color: 0xffc070 }); });
    placeKit('stall', P('stall'), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 2 }));
    placeKit('anvil', P('anvil'), (p) => ({ x: p.x * T, z: p.z * T, ry: 0.4 }));
    P('anvil').forEach((p) => { torches.push({ x: p.x * T + 1.4, y: 1.2, z: p.z * T + 0.3, lamp: true, forge: true }); addFire(p.x * T + 1.4, 1.05, p.z * T + 0.3, 1.2, 0xff6a20); });
    placeKit('barrel', P('barrel'), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 6 }));
    placeKit('crate', P('crate'), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3, s: 0.9 + p.v * 0.3 }));
    placeKit('cart', P('cart'), (p) => ({ x: p.x * T, z: p.z * T, ry: 0.5 }));
    placeKit('grave', by(P('grave'), (p) => p.v > 0.35), (p) => ({ x: p.x * T, z: p.z * T, ry: (p.v - 0.5) * 0.3 + Math.PI / 4 }));
    placeKit('cross', by(P('grave'), (p) => p.v <= 0.35), (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 + (p.v - 0.2) * 0.4 }));
    placeKit('candles', by(P('grave'), (p) => p.v > 0.7), (p) => ({ x: p.x * T + 0.6, z: p.z * T + 0.6, s: 0.6 }));
    by(P('grave'), (p) => p.v > 0.7).forEach((p) => addFire(p.x * T + 0.6, 0.35, p.z * T + 0.6, 0.35, 0xffc060));
    placeDecals(P('decal').map((p) => ({ ...pos(p, 1), r: p.v * 6, s: 0.8 + p.v })), 'moss', 2.4);
    // mobiliário, quintais e comércio
    const simple = (k, fn) => placeKit(k, P(k), fn || ((p) => ({ x: p.x * T, z: p.z * T, ry: p.ry || 0 })));
    simple('bench');
    simple('planter', (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3 }));
    simple('well', (p) => ({ x: p.x * T, z: p.z * T, ry: 0.3 }));
    simple('woodpile');
    simple('chop', (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 6 }));
    simple('clothesline');
    simple('garden');
    simple('fence');
    simple('coop', (p) => ({ x: p.x * T, z: p.z * T, ry: -Math.PI / 2 }));
    simple('haystack', (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 6 }));
    simple('trough', (p) => ({ x: p.x * T, z: p.z * T, ry: 0.5 }));
    simple('notice', (p) => ({ x: p.x * T, z: p.z * T, ry: 0.3 }));
    simple('signpost', (p) => ({ x: p.x * T, z: p.z * T, ry: 0.4 }));
    for (const k of ['sacks', 'pots', 'produce']) simple(k, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 6 }));
    simple('oak', (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 6, s: 0.9 + p.v * 0.25 }));
    // bandeirolas presas no alto dos lampiões da praça
    const byLen = {};
    for (const b of L.bunting || []) { const len = Math.round(Math.hypot(b.bx - b.ax, b.bz - b.az) * T); (byLen[len] || (byLen[len] = [])).push(b); }
    for (const len in byLen) placeKit('bunting' + len, byLen[len], (b) => ({ x: ((b.ax + b.bx) / 2) * T, y: 3.05, z: ((b.az + b.bz) / 2) * T, ry: -Math.atan2(b.bz - b.az, b.bx - b.ax) }), { noShadow: true });
    // rosácea de lajes em volta da fonte e luz azulada da água
    const fo = P('fountain')[0];
    if (fo) {
      const t = texPlaza();
      const mat = new THREE.MeshToonMaterial({ map: t.map, normalMap: t.normalMap, gradientMap: toonGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      mat.normalScale.setScalar(0.6);
      const m = new THREE.Mesh(GEO.plane, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(fo.x * T, 0.015, fo.z * T);
      m.scale.setScalar(17);
      m.receiveShadow = true;
      m.renderOrder = 1;
      addLevel(m);
      torches.push({ x: fo.x * T, y: 1.4, z: fo.z * T, cold: true, water: true });
    }
    buildTownFx(L, addLevel);
    const pp = L.portal;
    placeKit('arch', [pp], (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
    torches.push({ x: pp.x * T, y: 3, z: pp.z * T, cold: true });
    // moldura viva do Portal do Éden, no fundo da rua entre a Kora e o Varek
    if (L.eden) { placeKit('edenArch', [L.eden], (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 })); torches.push({ x: L.eden.x * T, y: 2.4, z: L.eden.z * T, green: true }); }
    // luz fria na porta da Torre Infinita (a porta olha para a praça)
    if (L.tower) { const tx = L.tower.x * T, tz = L.tower.z * T, a = Math.atan2(23 * T - tz, 23 * T - tx); torches.push({ x: tx + Math.cos(a) * 2.4, y: 1.8, z: tz + Math.sin(a) * 2.4, cold: true }); }
    return;
  }
  const deco = B.decor;
  const webs = [];
  // teias nas quinas do fundo (cantos de parede norte/oeste)
  for (let z = 1; z < L.H - 1; z++) for (let x = 1; x < L.W - 1; x++) {
    if (L.grid[z * L.W + x] !== 1) continue;
    if (!L.grid[z * L.W + x - 1] && !L.grid[(z - 1) * L.W + x] && rnd() < (deco === 'lava' ? 0.05 : 0.3)) webs.push({ x: x * T - 0.9, y: 2.2 + rnd() * 0.8, z: z * T - 0.9, ry: -Math.PI / 4, s: 0.8 + rnd() * 0.5 });
  }
  if (deco !== 'lava' && deco !== 'eden') placeDecals(webs, 'web', 2.2, { vertical: true });
  // manchas no chão
  const splat = decal.concat(low.filter((p) => p.v < 0.2)).map((p) => ({ ...pos(p, 1.2), r: p.v * 17, s: 0.7 + p.v * 0.8 }));
  const half = Math.floor(splat.length / 2);
  if (deco === 'forest') { placeDecals(splat, 'moss', 2.6); }
  else if (deco === 'crystal') { placeDecals(splat, 'crack', 2.4); }
  else if (deco === 'ruins') { placeDecals(splat.slice(0, half), 'moss', 2.4); placeDecals(splat.slice(half), 'crack', 2.6); }
  else if (deco === 'castle') { placeDecals(splat.slice(0, half), 'blood', 1.8); placeDecals(splat.slice(half), 'crack', 2.6); }
  else if (deco === 'lava') { placeDecals(splat.slice(0, half), 'ash', 2.8); placeDecals(splat.slice(half), 'blood', 1.8); }
  else if (deco === 'tower') { placeDecals(splat, L.biome === 'tw_void' ? 'ash' : 'crack', 2.4); }
  else if (deco === 'eden') { placeDecals(splat.filter((p, i) => i % 4), 'moss', 2.8); placeDecals(splat.filter((p, i) => !(i % 4)), 'crack', 2.2); }
  if (L.runes) {
    placeDecals(L.runes.map((r) => ({ x: r.x * T, z: r.z * T, r: r.s, s: r.s })), 'rune', 1, { glow: TOWER_RUNE[L.biome] });
    for (const r of L.runes) if (r.s > 5) torches.push({ x: r.x * T, y: 1.5, z: r.z * T, cold: true });
  }
  if (deco === 'forest') {
    placeKit('pine', by(tall, (p) => p.v < 0.3), (p) => ({ ...pos(p, 0.6), s: 0.85 + p.v * 0.5, ry: p.v * 9 }));
    placeKit('oak', by(tall, (p) => p.v >= 0.3 && p.v < 0.6), (p) => ({ ...pos(p, 0.6), s: 0.75 + p.v * 0.4, ry: p.v * 9 }));
    placeKit('deadTree', by(tall, (p) => p.v >= 0.6), (p) => ({ ...pos(p, 0.6), s: 0.9 + p.v * 0.4, ry: p.v * 9 }));
    placeKit('bush', by(low, (p) => p.v < 0.4), (p) => ({ ...pos(p, 0.8), s: 0.7 + p.v, ry: p.v * 9 }));
    placeKit('rock', by(low, (p) => p.v >= 0.4 && p.v < 0.6), (p) => ({ ...pos(p, 0.8), s: 0.6 + p.v * 0.5, ry: p.v * 9 }));
    placeKit('log', by(low, (p) => p.v >= 0.6 && p.v < 0.75), (p) => ({ ...pos(p, 0.4), ry: p.v * 9, s: 0.9 }));
    placeKit('mushroom', by(low, (p) => p.v >= 0.75).concat(decal), (p) => ({ ...pos(p, 1), ry: p.v * 9, s: 0.7 + p.v * 0.6 }));
    placeKit('bones', by(decal, (p) => p.v > 0.6), (p) => ({ ...pos(p, 1.4), ry: p.v * 9 }), { noShadow: true });
  } else if (deco === 'crystal') {
    placeKit('stalagmite', by(tall, (p) => p.v < 0.55), (p) => ({ ...pos(p, 0.5), ry: p.v * 9, s: 0.9 + p.v * 0.4 }));
    placeKit('crystalBig', by(tall, (p) => p.v >= 0.55), (p) => ({ ...pos(p, 0.5), ry: p.v * 9, s: 0.8 + p.v * 0.3 }));
    by(tall, (p) => p.v >= 0.55).forEach((p) => torches.push({ x: p.x * T, y: 2, z: p.z * T, cold: true }));
    placeKit('crystal', by(low, (p) => p.v < 0.4), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v }));
    by(low, (p) => p.v < 0.35).forEach((p) => torches.push({ x: p.x * T, y: 1.2, z: p.z * T, cold: true }));
    placeKit('glowshroom', by(low, (p) => p.v >= 0.4 && p.v < 0.65), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v * 0.6 }));
    placeKit('rock', by(low, (p) => p.v >= 0.65), (p) => ({ ...pos(p, 0.8), s: 0.6 + p.v * 0.5, ry: p.v * 9 }));
    placeKit('rubble', decal, (p) => ({ ...pos(p, 1), ry: p.v * 9 }), { noShadow: true });
  } else if (deco === 'ruins' || deco === 'castle') {
    const castle = deco === 'castle';
    placeKit('pillar', by(tall, (p) => p.v < (castle ? 0.7 : 0.4)), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3 }));
    if (castle) placeKit('banner', by(tall, (p) => p.v < 0.7 && p.v > 0.3), (p) => ({ x: p.x * T + 0.62, z: p.z * T + 0.62, ry: Math.PI / 4 }), { noShadow: true });
    placeKit(castle ? 'armor' : 'pillarBroken', by(tall, (p) => p.v >= (castle ? 0.7 : 0.4) && p.v < 0.85), (p) => ({ x: p.x * T, z: p.z * T, ry: castle ? Math.PI / 4 : p.v * 9 }));
    placeKit('statue', by(tall, (p) => p.v >= 0.85), (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
    placeKit('rubble', by(low, (p) => p.v < 0.3), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v }), { noShadow: true });
    placeKit('barrel', by(low, (p) => p.v >= 0.3 && p.v < 0.45), (p) => ({ ...pos(p, 0.6), ry: p.v * 9 }));
    placeKit('crate', by(low, (p) => p.v >= 0.45 && p.v < 0.58), (p) => ({ ...pos(p, 0.6), ry: p.v * 9, s: 0.8 + p.v * 0.4 }));
    const br = by(low, (p) => p.v >= 0.58 && p.v < 0.7);
    placeKit('brazier', br, (p) => ({ ...pos(p, 0.3) }));
    br.forEach((p) => { const q = pos(p, 0.3); torches.push({ x: q.x, y: 1.6, z: q.z }); addFire(q.x, 1.55, q.z, 2.2); });
    const cd = by(low, (p) => p.v >= 0.7 && p.v < 0.8);
    placeKit('candles', cd, (p) => ({ ...pos(p, 0.6), s: 0.9 }));
    cd.forEach((p) => { const q = pos(p, 0.6); addFire(q.x, 0.55, q.z, 0.5, 0xffc060); });
    placeKit(castle ? 'skulls' : 'bones', by(low, (p) => p.v >= 0.8).concat(decal), (p) => ({ ...pos(p, 1), ry: p.v * 9 }), { noShadow: true });
  } else if (deco === 'tower') {
    buildTowerProps(L, tall, low, decal, pos, by, addFire);
  } else if (deco === 'eden') {
    buildEdenProps(L, low, pos, by, addFire, rnd);
  } else if (deco === 'lava') {
    placeKit('spikes', tall, (p) => ({ ...pos(p, 0.4), ry: p.v * 9, s: 0.9 + p.v * 0.4 }));
    const pools = by(low, (p) => p.v < 0.35).concat(by(decal, (p) => p.v < 0.5));
    placeKit('lavapool', pools, (p) => ({ ...pos(p, 0.5), ry: p.v * 9, s: 0.7 + p.v * 0.5 }), { noShadow: true });
    if (pools.length) { // superfície animada da lava (disco de raio 1 → elipse da poça)
      const lava = new THREE.InstancedMesh(LAVA_DISC, lavaMat(), pools.length);
      pools.forEach((p, i) => { const q = pos(p, 0.5), s = 0.7 + p.v * 0.5; setInstance(lava, i, q.x, 0.08, q.z, 0, p.v * 9, 0, s * 1.0, 1, s * 0.8); });
      lava.computeBoundingSphere();
      addLevel(lava);
    }
    pools.forEach((p) => torches.push({ x: p.x * T, y: 0.8, z: p.z * T, lava: true }));
    const br = by(low, (p) => p.v >= 0.35 && p.v < 0.55);
    placeKit('brazier', br, (p) => ({ ...pos(p, 0.3) }));
    br.forEach((p) => { const q = pos(p, 0.3); torches.push({ x: q.x, y: 1.6, z: q.z }); addFire(q.x, 1.55, q.z, 2.2); });
    placeKit('skulls', by(low, (p) => p.v >= 0.55 && p.v < 0.8), (p) => ({ ...pos(p, 0.8), ry: p.v * 9 }), { noShadow: true });
    placeKit('rock', by(low, (p) => p.v >= 0.8).concat(by(decal, (p) => p.v >= 0.5)), (p) => ({ ...pos(p, 0.8), s: 0.5 + p.v * 0.5, ry: p.v * 9 }));
  }
}

/** Cor das runas do chão em cada bioma da torre. */
const TOWER_RUNE = { eden: 0x8affb0, tw_granite: 0x6ad8ff, tw_arcane: 0xc89aff, tw_storm: 0x8afff0, tw_void: 0xff5ad0 };
/**
 * Adereços da Torre Infinita: obeliscos rúnicos e colunas em todos os andares;
 * cada bioma troca o resto (estátuas e armaduras no granito, estantes e cristais
 * na biblioteca, pilares partidos e braseiros no terraço, espinhos e cristais no vazio).
 */
function buildTowerProps(L, tall, low, decal, pos, by, addFire) {
  const T = TILE, b = L.biome;
  const fireCol = { tw_granite: 0xffa040, tw_arcane: 0xb070ff, tw_storm: 0x6ae0ff, tw_void: 0xff40c0 }[b];
  placeKit('obelisk', by(tall, (p) => p.v < 0.3), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 9 }));
  by(tall, (p) => p.v < 0.3).forEach((p) => torches.push({ x: p.x * T, y: 2, z: p.z * T, cold: true }));
  const mid = by(tall, (p) => p.v >= 0.3 && p.v < 0.75), top = by(tall, (p) => p.v >= 0.75);
  if (b === 'tw_granite') {
    placeKit('pillar', mid, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3 }));
    placeKit('statue', by(top, (p) => p.v < 0.88), (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
    placeKit('armor', by(top, (p) => p.v >= 0.88), (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
  } else if (b === 'tw_arcane') {
    placeKit('bookshelf', mid, (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
    placeKit('crystalBig', top, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 9, s: 0.8 }));
    top.forEach((p) => torches.push({ x: p.x * T, y: 2, z: p.z * T, cold: true }));
  } else if (b === 'tw_storm') {
    placeKit('pillarBroken', mid, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 9 }));
    placeKit('pillar', top, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3 }));
  } else {
    placeKit('spikes', mid, (p) => ({ ...pos(p, 0.4), ry: p.v * 9, s: 0.9 + p.v * 0.4 }));
    placeKit('crystalBig', top, (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 9, s: 0.9 }));
    top.forEach((p) => torches.push({ x: p.x * T, y: 2, z: p.z * T, cold: true }));
  }
  placeKit('rubble', by(low, (p) => p.v < 0.3), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v }), { noShadow: true });
  const br = by(low, (p) => p.v >= 0.3 && p.v < 0.45);
  placeKit('brazier', br, (p) => ({ ...pos(p, 0.3) }));
  br.forEach((p) => { const q = pos(p, 0.3); torches.push({ x: q.x, y: 1.6, z: q.z }); addFire(q.x, 1.55, q.z, 2.2, fireCol); });
  placeKit(b === 'tw_arcane' ? 'crate' : 'barrel', by(low, (p) => p.v >= 0.45 && p.v < 0.55), (p) => ({ ...pos(p, 0.6), ry: p.v * 9 }));
  placeKit(b === 'tw_storm' ? 'rock' : 'crystal', by(low, (p) => p.v >= 0.55 && p.v < 0.7), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.7 + p.v * 0.5 }));
  const cd = by(low, (p) => p.v >= 0.7 && p.v < 0.82);
  placeKit('candles', cd, (p) => ({ ...pos(p, 0.6), s: 0.9 }));
  cd.forEach((p) => { const q = pos(p, 0.6); addFire(q.x, 0.55, q.z, 0.5, fireCol); });
  placeKit('skulls', by(low, (p) => p.v >= 0.82).concat(decal), (p) => ({ ...pos(p, 1), ry: p.v * 9 }), { noShadow: true });
}

/**
 * Miudezas espalhadas (tufos, flores, pedrinhas, lascas, brasas) e acabamento no
 * pé das paredes. Tudo com instancing e sem sombra: 1 chamada de desenho por tipo.
 * Determinístico pela semente do nível.
 */
const CLUTTER = {
  town: { floor: [['tuft', 0.5, 'grass'], ['flowers', 0.12, 'grass'], ['pebbles', 0.05, 'path']], edge: [] },
  forest: { floor: [['tuft', 0.55], ['fern', 0.12], ['flowers', 0.06], ['pebbles', 0.05]], edge: [['grassEdge', 0.55], ['baseRocks', 0.15]] },
  caves: { floor: [['shard', 0.08], ['pebbles', 0.14]], edge: [['baseRocks', 0.45]] },
  ruins: { floor: [['tuft', 0.16], ['pebbles', 0.1], ['flowers', 0.02]], edge: [['baseRocks', 0.3], ['grassEdge', 0.25]] },
  castle: { floor: [['pebbles', 0.07]], edge: [['baseRocks', 0.25]] },
  abyss: { floor: [['ember', 0.09], ['pebbles', 0.08]], edge: [['baseRocks', 0.4]] },
  tw_granite: { floor: [['pebbles', 0.08]], edge: [['baseRocks', 0.25]] },
  tw_arcane: { floor: [['shard', 0.05], ['pebbles', 0.05]], edge: [['baseRocks', 0.2]] },
  tw_storm: { floor: [['tuft', 0.12], ['pebbles', 0.1]], edge: [['baseRocks', 0.3], ['grassEdge', 0.2]] },
  tw_void: { floor: [['ember', 0.06], ['shard', 0.04], ['pebbles', 0.06]], edge: [['baseRocks', 0.35]] },
  eden: { floor: [['tuft', 0.7, 'dry'], ['fern', 0.2, 'dry'], ['flowers', 0.12, 'dry'], ['pebbles', 0.03, 'dry']], edge: [['grassEdge', 0.7], ['fern', 0.25], ['baseRocks', 0.12]] },
};
function scatterClutter(L, walls) {
  const C = CLUTTER[L.biome];
  if (!C) return;
  const rnd = R.mulberry32(L.seed * 31 + 17);
  const at = (x, z) => (x < 0 || z < 0 || x >= L.W || z >= L.H ? 0 : L.grid[z * L.W + x]);
  const lists = {};
  const add = (k, o) => (lists[k] || (lists[k] = [])).push(o);
  const T2 = TILE * 0.42;
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    if (!at(x, z)) continue;
    if (L.water && L.water[z * L.W + x]) continue; // nada de grama dentro do rio
    const path = L.isPath ? L.isPath(x, z) : false;
    for (const [k, p, where] of C.floor) {
      if (where === 'grass' && path) continue;
      if (where === 'path' && !path) continue;
      const n = p > 0.4 && rnd() < p - 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) if (rnd() < p) add(k, { x: x * TILE + (rnd() - 0.5) * 2 * T2, z: z * TILE + (rnd() - 0.5) * 2 * T2, ry: rnd() * 6.28, s: 0.75 + rnd() * 0.6 });
    }
  }
  for (const w of walls) {
    if (w.low) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!at(w.x + dx, w.z + dz)) continue;
      for (const [k, p] of C.edge) if (rnd() < p) add(k, { x: w.x * TILE + dx * (TILE / 2 + 0.12), z: w.z * TILE + dz * (TILE / 2 + 0.12), ry: dx ? Math.PI / 2 : 0, s: 0.85 + rnd() * 0.35 });
    }
  }
  for (const k in lists) placeKit(k, lists[k], (o) => o, { noShadow: true });
}

/**
 * Detalhes de labirinto: enfeites nas faces das paredes que a câmera vê (+x/+z),
 * rachaduras/musgo/sangue pintados nelas, colunas coladas nas paredes retas e
 * restos de batalha no chão (espadas quebradas cravadas, pilhas de armas).
 * Só visual: não muda a grade andável. Marca `w.decor` para as tochas não se sobreporem.
 */
const MAZE_DECOR = {
  forest: { wall: [['vines', 0.16], ['shieldWall', 0.02]], paint: ['moss', 'moss', 'crack'], floor: 0.06, pilaster: false },
  caves: { wall: [['wallCrystals', 0.1], ['chains', 0.03], ['shieldWall', 0.02]], paint: ['crack', 'crack', 'moss'], floor: 0.05, pilaster: false },
  ruins: { wall: [['shieldWall', 0.05], ['weaponRack', 0.04], ['vines', 0.06], ['chains', 0.03]], paint: ['crack', 'moss', 'moss'], floor: 0.065, pilaster: true },
  castle: { wall: [['shieldWall', 0.07], ['weaponRack', 0.05], ['chains', 0.05], ['skullNiche', 0.03]], paint: ['crack', 'blood', 'crack'], floor: 0.075, pilaster: true },
  abyss: { wall: [['chains', 0.08], ['skullNiche', 0.06], ['shieldWall', 0.02]], paint: ['blood', 'ash', 'crack'], floor: 0.06, pilaster: false },
  eden: { wall: [['vines', 0.3], ['rootVines', 0.08], ['wallCrystals', 0.03]], paint: ['moss', 'moss', 'moss'], floor: 0, pilaster: false },
};
function decorateMaze(L, walls, rnd) {
  const D = MAZE_DECOR[L.biome] || MAZE_DECOR.ruins;
  const T = TILE;
  const at = (x, z) => (x < 0 || z < 0 || x >= L.W || z >= L.H ? 0 : L.grid[z * L.W + x]);
  const wallAt = (x, z) => !at(x, z);
  const lists = {}, paint = {};
  const add = (k, o) => (lists[k] || (lists[k] = [])).push(o);
  const near = (x, z, c, r) => c && Math.abs(x - c.x) <= r && Math.abs(z - c.z) <= r;
  for (const w of walls) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (at(w.x + dx, w.z + dz) !== 1) continue;
      const ry = Math.atan2(dx, dz);
      const fx = w.x * T + dx * (T / 2 + 0.02), fz = w.z * T + dz * (T / 2 + 0.02);
      // parede reta (vizinhos laterais também são parede com o mesmo lado livre): cabe coluna
      const lx = dz, lz = dx;
      const straight = wallAt(w.x + lx, w.z + lz) && wallAt(w.x - lx, w.z - lz) && at(w.x + lx + dx, w.z + lz + dz) === 1 && at(w.x - lx + dx, w.z - lz + dz) === 1;
      const k3 = ((dx ? w.z : w.x) % 3 + 3) % 3;
      if (D.pilaster && straight && k3 === 0) { add('pilaster', { x: fx, z: fz, ry, sy: w.h / 3.5 }); w.decor = true; continue; }
      let r = rnd(), put = null;
      for (const [k, p] of D.wall) { if (r < p) { put = k; break; } r -= p; }
      if (put && !w.decor) {
        const j = (rnd() - 0.5) * 0.5;
        add(put, { x: fx + lx * j, z: fz + lz * j, ry, s: 0.9 + rnd() * 0.2, sy: put === 'vines' ? w.h / 3.4 : undefined });
        w.decor = true;
      } else if (rnd() < 0.2) {
        const kind = D.paint[Math.floor(rnd() * D.paint.length)];
        (paint[kind] || (paint[kind] = [])).push({ x: fx + dx * 0.02 + lx * (rnd() - 0.5) * 0.6, y: 0.9 + rnd() * 1.4, z: fz + dz * 0.02 + lz * (rnd() - 0.5) * 0.6, ry, s: 0.8 + rnd() * 0.6 });
      }
    }
  }
  // restos de batalha no chão, de preferência encostados nas paredes
  for (let z = 1; z < L.H - 1; z++) for (let x = 1; x < L.W - 1; x++) {
    if (at(x, z) !== 1 || near(x, z, L.start, 2) || near(x, z, L.boss, 2)) continue;
    const byWall = wallAt(x - 1, z) || wallAt(x + 1, z) || wallAt(x, z - 1) || wallAt(x, z + 1);
    if (!D.floor || rnd() > (byWall ? D.floor : D.floor * 0.25)) continue;
    const o = { x: x * T + (rnd() - 0.5) * 1.1, z: z * T + (rnd() - 0.5) * 1.1, ry: rnd() * 6.28, s: 0.9 + rnd() * 0.3 };
    add(rnd() < 0.6 ? 'swordStuck' : 'swordPile', o);
  }
  for (const k in lists) placeKit(k, lists[k], (o) => o, { noShadow: k === 'swordPile' || k === 'chains' });
  for (const k in paint) placeDecals(paint[k], k, 1.5, { vertical: true });
}

/** Liga as luzes mais próximas do herói (orçamento fixo) e anima chamas, fumaça e névoa. */
let _tlT = 0;
export function updateTorchLights(px, pz, t) {
  const dt = Math.min(0.05, Math.max(0, t - _tlT)); _tlT = t;
  if (flameSprites) { flameSprites.material.uniforms.uTime.value = t; flameSprites.material.uniforms.uScale.value = renderer.domElement.height * 0.9; }
  updateMist(px, pz, dt);
  updateShafts(px, pz, t, dt);
  setKitGlowTime(t);
  setCutaway(px, 0, pz, camera);
  updateTownFx(px, pz, t, dt, renderer.domElement.height);
  updateEdenFx(px, pz, t, dt);
  // faíscas das chamas próximas
  for (const f of fires) {
    if (!f.emit) continue;
    const d = (f.x - px) ** 2 + (f.z - pz) ** 2;
    if (d > 26 * 26) continue;
    f.acc = (f.acc || 0) + dt * (f.size > 2 ? 22 : f.size > 1 ? 9 : 3);
    while (f.acc >= 1) {
      f.acc -= 1;
      emit(f.x + (Math.random() - 0.5) * 0.2 * f.size, f.y - 0.1, f.z + (Math.random() - 0.5) * 0.2 * f.size, { n: 1, color: Math.random() < 0.5 ? 0xffc060 : 0xff6a20, speed: 0.5, up: 2.6, life: 0.45 + f.size * 0.1, size: 0.35 + f.size * 0.25, grav: 2.2, drag: 2, spread: 0.1 });
    }
  }
  if (!torches.length) { torchLights.forEach((l) => (l.intensity = 0)); return; }
  const near = torches.map((tc) => ({ tc, d: (tc.x - px) ** 2 + (tc.z - pz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, torchLights.length);
  torchLights.forEach((l, i) => {
    const n = near[i];
    if (!n || n.d > 1100) { l.intensity = 0; return; }
    const tc = n.tc;
    l.position.set(tc.x, tc.y + 0.3, tc.z);
    l.color.setHex(tc.green ? 0x8affb0 : tc.water ? 0x5ac8e8 : tc.cold ? 0x6aa8ff : tc.lava ? 0xff4a10 : tc.lamp ? 0xffb060 : 0xff8a30);
    l.distance = tc.lamp ? 16 : tc.lava ? 10 : 13;
    const flick = tc.cold ? 1 : 0.84 + Math.sin(t * 9 + i * 2) * 0.09 + Math.sin(t * 23 + i) * 0.06;
    l.intensity = (tc.water ? 7 : tc.cold ? 16 : tc.lava ? 24 : tc.lamp ? 30 : 34) * flick;
  });
}

// =============================================================================
// O Éden: chão tingido por região, adereços (árvores gigantes, ruínas, arcos de
// raiz, pontes, santuários de pedra) e a água (ver world/edenfx.js).
// =============================================================================
/** Tom do chão por região: clareira clara, floresta verde, raízes terrosas, rio musgoso, Coração dourado. */
const EDEN_TINT = { 1: [1.0, 1.02, 0.92], 2: [0.9, 0.98, 0.86], 3: [0.78, 0.72, 0.66], 4: [0.84, 0.96, 0.94], 5: [1.04, 1.0, 0.8] };
function edenTint(L) {
  return (x, z) => {
    const i = z * L.W + x;
    if (L.water[i]) return [0.42, 0.5, 0.46]; // leito do rio: escuro sob a água
    let wet = 0; // margem molhada (barro escuro) junto da água
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (L.water[i + dz * L.W + dx]) wet++;
    const c = EDEN_TINT[L.region[i]] || EDEN_TINT[2];
    return wet ? [c[0] * 0.8, c[1] * 0.82, c[2] * 0.78] : c;
  };
}
/** Mistura grama/musgo: as Raízes são quase só musgo e terra; a Floresta e a clareira, grama com manchas. */
function edenBlend(L, sd) {
  return (x, z) => {
    const tx = Math.min(L.W - 1, Math.max(0, Math.round(x / TILE))), tz = Math.min(L.H - 1, Math.max(0, Math.round(z / TILE)));
    const reg = L.region[tz * L.W + tx], n = fbm(((x / 40) % 1 + 1) % 1, ((z / 40) % 1 + 1) % 1, 3, 4, sd);
    if (reg === 3) return sat(0.55 + (n - 0.5) * 2);
    if (reg === 4) return sat((n - 0.45) * 4);
    return sat((n - 0.6) * 5);
  };
}
function buildEdenProps(L, low, pos, by, addFire, rnd) {
  const T = TILE, P = (k) => L.props.filter((p) => p.kind === k);
  // árvores gigantes nos paredões (as da borda inclinam um pouco para a trilha)
  placeKit('gtree', P('gtree'), (p) => ({ x: p.x * T, y: -0.4, z: p.z * T, ry: p.v * 9, s: 0.72 + p.v * 0.25 }));
  placeKit('gtreeDeep', P('gtreeDeep'), (p) => ({ x: p.x * T, y: 0.6, z: p.z * T, ry: p.v * 9, s: 0.8 + p.v * 0.3 }));
  // Árvore-Mãe no fundo do Coração, com luz dourada
  const mt = L.motherTree;
  if (mt) {
    placeKit('motherTree', [mt], () => ({ x: mt.x * T, z: mt.z * T, ry: 0.6, s: 1.45 }));
    torches.push({ x: mt.x * T + 3, y: 3, z: mt.z * T + 3, green: true });
  }
  // ruínas antigas
  placeKit('pillar', by(P('ruinPillar'), (p) => p.v < 0.5), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 3 }));
  placeKit('pillarBroken', by(P('ruinPillar'), (p) => p.v >= 0.5).concat(P('ruinBroken')), (p) => ({ x: p.x * T, z: p.z * T, ry: p.v * 9 }));
  placeKit('pillarBroken', P('ruinSunk'), (p) => ({ x: p.x * T, y: -0.9, z: p.z * T, ry: p.v * 9, rx: (p.v - 0.5) * 0.5, s: 1.1 }));
  placeKit('rubble', P('ruinSunk'), (p) => ({ x: p.x * T + 0.5, y: -0.15, z: p.z * T - 0.4, ry: p.v * 7 }), { noShadow: true });
  // arcos de raiz por cima do Caminho das Raízes (um kit por vão, arredondado)
  const arches = {};
  for (const a of P('rootArch')) { const n = Math.max(4, Math.min(12, Math.round(a.span))); (arches[n] || (arches[n] = [])).push(a); }
  for (const n in arches) placeKit('rootArch' + n, arches[n], (a) => ({ x: a.x * T, z: a.z * T, ry: a.ry + Math.PI / 2 }));
  // pontes sobre o rio
  placeKit('bridge', L.bridges, (b) => ({ x: b.x * T, y: 0.05, z: b.z * T, ry: b.ry }));
  // clareira de entrada: pedras em pé e a placa dos três caminhos
  placeKit('standing', P('standing'), (p) => ({ x: p.x * T, z: p.z * T, ry: p.ry || 0, s: 0.9 + p.v * 0.3 }));
  P('standing').forEach((p, i) => { if (i % 2 === 0) torches.push({ x: p.x * T, y: 1.6, z: p.z * T, green: true }); });
  placeKit('edenSign', P('edenSign'), (p) => ({ x: p.x * T, z: p.z * T, ry: -Math.PI / 4 }));
  // miudezas por região
  const lowR = (r) => by(low, (p) => p.reg === r);
  const forestish = low.filter((p) => p.reg === 1 || p.reg === 2 || p.reg === 5);
  placeKit('hedge', by(forestish, (p) => p.v < 0.35), (p) => ({ ...pos(p, 0.6), ry: p.v * 9, s: 0.8 + p.v }));
  placeKit('bush', by(forestish, (p) => p.v >= 0.35 && p.v < 0.5), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v }));
  placeKit('log', by(lowR(2), (p) => p.v >= 0.5 && p.v < 0.6), (p) => ({ ...pos(p, 0.4), ry: p.v * 9 }));
  placeKit('mushroom', by(forestish, (p) => p.v >= 0.6 && p.v < 0.72), (p) => ({ ...pos(p, 1), ry: p.v * 9, s: 0.7 + p.v * 0.5 }));
  placeKit('rock', by(forestish, (p) => p.v >= 0.72 && p.v < 0.82), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.6 + p.v * 0.5 }));
  const mf = by(forestish, (p) => p.v >= 0.82);
  placeKit('magicFlower', mf, (p) => ({ ...pos(p, 1), ry: p.v * 9, s: 1 + p.v * 0.6 }));
  mf.filter((p, i) => i % 4 === 0).forEach((p) => torches.push({ x: p.x * T, y: 0.8, z: p.z * T, green: true }));
  // Raízes: cristais, cogumelos que brilham, estalagmites
  const roots = lowR(3);
  placeKit('crystal', by(roots, (p) => p.v < 0.25), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v }));
  by(roots, (p) => p.v < 0.25).filter((p, i) => i % 2 === 0).forEach((p) => torches.push({ x: p.x * T, y: 1.2, z: p.z * T, cold: true }));
  placeKit('glowshroom', by(roots, (p) => p.v >= 0.25 && p.v < 0.55), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.8 + p.v * 0.6 }));
  by(roots, (p) => p.v >= 0.25 && p.v < 0.55).filter((p, i) => i % 4 === 0).forEach((p) => torches.push({ x: p.x * T, y: 1, z: p.z * T, green: true }));
  placeKit('stalagmite', by(roots, (p) => p.v >= 0.55 && p.v < 0.75), (p) => ({ ...pos(p, 0.5), ry: p.v * 9, s: 0.7 + p.v * 0.4 }));
  placeKit('rock', by(roots, (p) => p.v >= 0.75), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.6 + p.v * 0.5 }));
  // Rio: juncos e pedras nas margens, vitórias-régias na água
  const river = lowR(4);
  placeKit('reeds', by(river, (p) => p.v < 0.45), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.9 + p.v * 0.5 }), { noShadow: true });
  placeKit('rock', by(river, (p) => p.v >= 0.45 && p.v < 0.7), (p) => ({ ...pos(p, 0.8), ry: p.v * 9, s: 0.6 + p.v * 0.6 }));
  placeKit('hedge', by(river, (p) => p.v >= 0.7), (p) => ({ ...pos(p, 0.6), ry: p.v * 9, s: 0.7 + p.v * 0.6 }));
  const lilies = [];
  for (let i = 0; i < L.water.length; i++) if (L.water[i] && rnd() < 0.07) lilies.push({ x: (i % L.W) * T + (rnd() - 0.5) * 1.2, y: 0.17, z: Math.floor(i / L.W) * T + (rnd() - 0.5) * 1.2, ry: rnd() * 6, s: 0.8 + rnd() * 0.5 });
  placeKit('lily', lilies, (o) => o, { noShadow: true });
  // moitas no alto dos paredões (vistas de cima, deixam a mata densa)
  const tops = [];
  const rr = R.mulberry32(L.seed * 23 + 9);
  for (let z = 1; z < L.H - 1; z++) for (let x = 1; x < L.W - 1; x++) {
    if (L.grid[z * L.W + x] || rr() > 0.12) continue;
    let adj = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (L.grid[(z + dz) * L.W + x + dx]) adj = true;
    if (adj) tops.push({ x: x * T + (rr() - 0.5), y: 4.2, z: z * T + (rr() - 0.5), ry: rr() * 6, s: 1 + rr() * 0.7 });
  }
  placeKit('hedge', tops, (o) => o, { noShadow: true });
  // cachoeiras: borda de pedra no alto, água e espuma (edenfx)
  placeKit('fallRock', L.falls, (f) => ({ x: f.x * T, y: 4.7, z: f.z * T + 0.7, sx: f.w * 1.3 / 4.6 }));
  for (const f of L.falls) torches.push({ x: f.x * T, y: 1, z: (f.z + 2) * T, water: true });
  buildEdenFx(L, addLevel);
}
