// ---------- montagem visual do nível: chão, paredes, adereços, decalques, névoa, chamas e tochas ----------
import { GEO } from '../art/geometry.js';
import { disposeObject } from '../art/materials.js';
import { stylize, toonGradient, toonMaterial } from '../art/stylize.js';
import { fbm, hash2, makeTexSet, sat, texDecal, vnoise } from '../art/textures.js';
import { R, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { hemi, heroLight, renderer, scene, sun, torchLights, world } from '../engine/renderer.js';
import { biomeTex } from './biomeTextures.js';
import { BIOMES } from './biomes.js';
import { kit, kitGlowMat, kitMat, roofMat, setInstance } from './kit.js';

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
  mk(k.geo, kitMat(), !(opt && opt.noShadow));
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
function buildGround(L, T, blendFn) {
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
    let front = false;
    for (let dz = 0; dz <= 2 && !front; dz++) for (let dx = 0; dx <= 2; dx++) if ((dx || dz) && at(x - dx, z - dz)) { front = true; break; }
    const h = front ? 0.7 : opt.h + (rnd() - 0.5) * opt.var;
    hts[z * W + x] = h;
    walls.push({ x, z, h, low: front });
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
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  addLevel(m);
  return walls;
}

// ---------- decalques e névoa ----------
function placeDecals(list, kind, size, opt) {
  if (!list.length) return;
  const t = texDecal(kind);
  const mat = new THREE.MeshToonMaterial({ map: t.map, gradientMap: toonGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: opt && opt.vertical ? THREE.DoubleSide : THREE.FrontSide });
  const geo = GEO.plane;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((p, i) => {
    const sc = size * (p.s || 1);
    if (opt && opt.vertical) setInstance(m, i, p.x, p.y, p.z, 0, p.ry || 0, 0, sc, sc, 1);
    else setInstance(m, i, p.x, 0.02 + i * 0.0004, p.z, -Math.PI / 2, 0, p.r || 0, sc, sc, 1);
  });
  m.renderOrder = 1;
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
    uniforms: { uMap: { value: flameTexture() }, uTime: { value: 0 }, uScale: { value: 500 } },
    vertexShader: 'attribute float size; attribute vec3 fcol; varying vec3 vC; uniform float uTime; uniform float uScale; void main(){ vC = fcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); float f = 0.85 + 0.1 * sin(uTime * 13.0 + position.x * 3.1) + 0.06 * sin(uTime * 29.0 + position.z * 5.3); gl_PointSize = size * f * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
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
  const B = BIOMES[L.biome];
  scene.background = new THREE.Color(B.fog[0]);
  scene.fog = new THREE.Fog(B.fog[0], B.fog[1], B.fog[2]);
  hemi.color.setHex(B.hemi[0]); hemi.groundColor.setHex(B.hemi[1]); hemi.intensity = B.hemi[2] * 0.72; // no toon, luz ambiente forte achata as faixas
  sun.color.setHex(B.sun[0]); sun.intensity = B.sun[1] * 1.35;
  heroLight.color.setHex(B.light);
  heroLight.intensity = L.biome === 'town' ? 26 : 36;
  renderer.toneMappingExposure = (B.exposure || 1.05) * 0.88;
  const T = biomeTex(L.biome);
  const town = L.biome === 'town';
  // chão: cidade = calçamento nas ruas, grama fora; masmorras = manchas de A/B
  const sd = L.seed % 1000;
  const blendFn = town
    ? (x, z) => { const tx = x / TILE, tz = z / TILE; return L.isPath(Math.round(tx), Math.round(tz)) ? sat((fbm(x / 60, z / 60, 4, 3, 5) - 0.62) * 3) : 1; }
    : (x, z) => sat((fbm(((x / 40) % 1 + 1) % 1, ((z / 40) % 1 + 1) % 1, 3, 4, sd) - 0.52) * 5);
  buildGround(L, T, blendFn);
  const wopt = {
    town: { h: 2.6, var: 0.4, capCol: 0.7 },
    forest: { h: 3.4, var: 0.9, rough: 0.9, lip: 0.22 },
    caves: { h: 3.8, var: 1.0, rough: 1.1, lip: 0.16 },
    ruins: { h: 3.4, var: 0.8, lip: 0.18 },
    castle: { h: 4.0, var: 0.2, lip: 0.2 },
    abyss: { h: 3.6, var: 1.0, rough: 1.1, lip: 0.14 },
  }[L.biome];
  if (wopt.capCol == null) wopt.capCol = T.capCol;
  const walls = buildWalls(L, T, wopt);
  const at = (x, z) => (x < 0 || z < 0 || x >= L.W || z >= L.H ? 0 : L.grid[z * L.W + x]);
  const rnd = R.mulberry32(L.seed * 13 + 1);
  // tochas nas paredes altas voltadas para o jogador (+x / +z)
  const sconces = [];
  if (!town) walls.forEach((w) => {
    if (w.low) return;
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
  if (L.biome === 'castle') placeKit('crenel', tall.filter((w) => (w.x + w.z) % 2 === 0), (w) => ({ x: w.x * TILE, y: w.h, z: w.z * TILE }));
  if (town) placeKit('stake', tall, (w) => ({ x: w.x * TILE, y: w.h, z: w.z * TILE, s: 1.4, ry: rnd() * 3 }));
  buildProps(L, B, rnd);
  scatterClutter(L, walls);
  buildFlames();
  const mc = { town: [0x8090b0, 0.08], forest: [0x9ab08a, 0.1], caves: [0x6a7aaa, 0.08], ruins: [0xa098b0, 0.08], castle: [0x806068, 0.07], abyss: [0x8a4a30, 0.08] }[L.biome];
  buildMist(mc[0], mc[1]);
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
    P('lamp').forEach((p) => { const a = Math.atan2(23 - p.z, 23 - p.x); const lx = p.x * T + Math.cos(a) * 0.62, lz = p.z * T + Math.sin(a) * 0.62; torches.push({ x: lx, y: 2.3, z: lz, lamp: true }); addFire(lx, 2.8, lz, 1.6, 0xffc070); });
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
    const pp = L.portal;
    placeKit('arch', [pp], (p) => ({ x: p.x * T, z: p.z * T, ry: Math.PI / 4 }));
    torches.push({ x: pp.x * T, y: 3, z: pp.z * T, cold: true });
    return;
  }
  const deco = B.decor;
  const webs = [];
  // teias nas quinas do fundo (cantos de parede norte/oeste)
  for (let z = 1; z < L.H - 1; z++) for (let x = 1; x < L.W - 1; x++) {
    if (L.grid[z * L.W + x] !== 1) continue;
    if (!L.grid[z * L.W + x - 1] && !L.grid[(z - 1) * L.W + x] && rnd() < (deco === 'lava' ? 0.05 : 0.3)) webs.push({ x: x * T - 0.9, y: 2.2 + rnd() * 0.8, z: z * T - 0.9, ry: -Math.PI / 4, s: 0.8 + rnd() * 0.5 });
  }
  if (deco !== 'lava') placeDecals(webs, 'web', 2.2, { vertical: true });
  // manchas no chão
  const splat = decal.concat(low.filter((p) => p.v < 0.2)).map((p) => ({ ...pos(p, 1.2), r: p.v * 17, s: 0.7 + p.v * 0.8 }));
  const half = Math.floor(splat.length / 2);
  if (deco === 'forest') { placeDecals(splat, 'moss', 2.6); }
  else if (deco === 'crystal') { placeDecals(splat, 'crack', 2.4); }
  else if (deco === 'ruins') { placeDecals(splat.slice(0, half), 'moss', 2.4); placeDecals(splat.slice(half), 'crack', 2.6); }
  else if (deco === 'castle') { placeDecals(splat.slice(0, half), 'blood', 1.8); placeDecals(splat.slice(half), 'crack', 2.6); }
  else if (deco === 'lava') { placeDecals(splat.slice(0, half), 'ash', 2.8); placeDecals(splat.slice(half), 'blood', 1.8); }
  if (deco === 'forest') {
    placeKit('pine', by(tall, (p) => p.v < 0.6), (p) => ({ ...pos(p, 0.6), s: 0.85 + p.v * 0.5, ry: p.v * 9 }));
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
  } else if (deco === 'lava') {
    placeKit('spikes', tall, (p) => ({ ...pos(p, 0.4), ry: p.v * 9, s: 0.9 + p.v * 0.4 }));
    const pools = by(low, (p) => p.v < 0.35).concat(by(decal, (p) => p.v < 0.5));
    placeKit('lavapool', pools, (p) => ({ ...pos(p, 0.5), ry: p.v * 9, s: 0.7 + p.v * 0.5 }), { noShadow: true });
    pools.forEach((p) => torches.push({ x: p.x * T, y: 0.8, z: p.z * T, lava: true }));
    const br = by(low, (p) => p.v >= 0.35 && p.v < 0.55);
    placeKit('brazier', br, (p) => ({ ...pos(p, 0.3) }));
    br.forEach((p) => { const q = pos(p, 0.3); torches.push({ x: q.x, y: 1.6, z: q.z }); addFire(q.x, 1.55, q.z, 2.2); });
    placeKit('skulls', by(low, (p) => p.v >= 0.55 && p.v < 0.8), (p) => ({ ...pos(p, 0.8), ry: p.v * 9 }), { noShadow: true });
    placeKit('rock', by(low, (p) => p.v >= 0.8).concat(by(decal, (p) => p.v >= 0.5)), (p) => ({ ...pos(p, 0.8), s: 0.5 + p.v * 0.5, ry: p.v * 9 }));
  }
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

/** Liga as luzes mais próximas do herói (orçamento fixo) e anima chamas, fumaça e névoa. */
let _tlT = 0;
export function updateTorchLights(px, pz, t) {
  const dt = Math.min(0.05, Math.max(0, t - _tlT)); _tlT = t;
  if (flameSprites) { flameSprites.material.uniforms.uTime.value = t; flameSprites.material.uniforms.uScale.value = renderer.domElement.height * 0.9; }
  updateMist(px, pz, dt);
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
    l.color.setHex(tc.cold ? 0x6aa8ff : tc.lava ? 0xff4a10 : tc.lamp ? 0xffb060 : 0xff8a30);
    l.distance = tc.lamp ? 16 : tc.lava ? 10 : 13;
    const flick = tc.cold ? 1 : 0.84 + Math.sin(t * 9 + i * 2) * 0.09 + Math.sin(t * 23 + i) * 0.06;
    l.intensity = (tc.cold ? 16 : tc.lava ? 24 : tc.lamp ? 30 : 34) * flick;
  });
}
