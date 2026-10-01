// ---------- O Éden: geração do mapa (dados puros, sem Three.js) ----------
// Região aberta e orgânica: uma clareira de entrada na frente (perto da câmera),
// três caminhos que seguem separados quase até o fim (Floresta à esquerda da tela,
// Raízes no meio, Rio à direita) e o Coração do Éden no fundo, onde os três se
// encontram em volta do Guardião. A câmera olha do sudeste: +x/+z = frente.
import { R } from '../core/util.js';

/** Regiões gravadas por tile em L.region (0 = mata fechada / rocha). */
export const REGION = { hub: 1, forest: 2, roots: 3, river: 4, heart: 5 };
export const REGION_INFO = {
  1: { key: 'hub', name: 'Clareira dos Três Caminhos', sub: 'Escolha um caminho: Floresta, Raízes ou Rio' },
  2: { key: 'forest', name: 'Caminho da Floresta', sub: 'Árvores gigantes, clareiras e criaturas corrompidas' },
  3: { key: 'roots', name: 'Caminho das Raízes', sub: 'Túneis de raízes, cavernas e cristais' },
  4: { key: 'river', name: 'Caminho do Rio', sub: 'Cachoeiras, lagos e ruínas submersas' },
  5: { key: 'heart', name: 'Coração do Éden', sub: 'Onde os três caminhos se encontram' },
};

const W = 108, H = 108;
const HUB = { x: 84, z: 84, r: 8 };
const HEART = { x: 26, z: 26, r: 13.5 };
/**
 * Caminhos: pontos de passagem, largura base/variação e salas especiais
 * (índice do ponto → raio; 'mini' marca a sala do mini chefe no fim do caminho).
 */
const PATH_DEFS = {
  forest: { reg: REGION.forest, pts: [[84, 84], [70, 91], [52, 93], [36, 88], [24, 79], [16, 64], [16, 48], [22, 37], [27, 31]], r: 2.8, amp: 0.9, rooms: { 2: 5, 4: 6.5, 6: 6.5 }, mini: 6, shrine: 3, ambush: 4 },
  roots: { reg: REGION.roots, pts: [[84, 84], [74, 74], [64, 72], [62, 60], [50, 62], [47, 50], [55, 44], [44, 40], [35, 35]], r: 1.9, amp: 0.5, rooms: { 3: 4, 5: 4.2, 7: 5 }, mini: 7, shrine: 2, ambush: 5 },
  river: { reg: REGION.river, pts: [[84, 84], [91, 70], [93, 52], [88, 36], [79, 24], [64, 16], [48, 16], [37, 22], [31, 27]], r: 4.6, amp: 0.8, rooms: { 2: 7.5, 4: 7.5, 6: 6.5 }, mini: 6, shrine: 3, ambush: 5, lakes: [2, 4] },
};

/** Suaviza a linha (Chaikin) e devolve pontos a cada ~0,5 tile com a distância acumulada. */
function sampleLine(pts) {
  let p = pts.map(([x, z]) => ({ x, z }));
  for (let it = 0; it < 2; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const out = [];
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: s + d * t, dx: (b.x - a.x) / (d || 1), dz: (b.z - a.z) / (d || 1) });
    }
    s += d;
  }
  const l = p[p.length - 1], pl = out[out.length - 1];
  out.push({ x: l.x, z: l.z, s, dx: pl.dx, dz: pl.dz });
  return out;
}
/** Ponto da linha amostrada mais próximo de (x, z). */
function nearestOnLine(line, x, z) {
  let best = line[0], bd = 1e9;
  for (const p of line) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

export function genEden(seed) {
  const rnd = R.mulberry32(seed);
  const N = W * H;
  const grid = new Uint8Array(N);   // 0 mata/rocha, 1 chão, 2 chão bloqueado (água, adereço)
  const region = new Uint8Array(N);
  const water = new Uint8Array(N);  // 1 = água (desenhada por cima do chão)
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x > 1 && z > 1 && x < W - 2 && z < H - 2;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[idx(x, z)]);
  const disc = (cx, cz, r, fn) => {
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (inb(x, z) && Math.hypot(x - cx, z - cz) <= r) fn(x, z, idx(x, z));
    }
  };
  const carve = (cx, cz, r, reg, force) => disc(cx, cz, r, (x, z, i) => { if (!grid[i] || force) { grid[i] = 1; region[i] = reg; } else if (!region[i]) region[i] = reg; });

  // ---------- caminhos (com leve sorteio nos pontos internos) ----------
  const lines = {};
  const PATHS = {};
  for (const k of Object.keys(PATH_DEFS)) {
    const P = PATHS[k] = Object.assign({}, PATH_DEFS[k]);
    const pts = P.pts.map(([x, z], i) => (i === 0 || i === P.pts.length - 1 ? [x, z] : [x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3]));
    P.cur = pts;
    const line = sampleLine(pts);
    lines[k] = line;
    const ph1 = rnd() * 9, ph2 = rnd() * 9;
    for (const p of line) {
      const r = P.r + P.amp * (0.6 * Math.sin(p.s * 0.21 + ph1) + 0.4 * Math.sin(p.s * 0.53 + ph2));
      carve(p.x, p.z, Math.max(1.3, r), P.reg);
    }
    for (const i in P.rooms) carve(pts[i][0], pts[i][1], P.rooms[i], P.reg);
  }
  // clareira de entrada e Coração do Éden (bordas irregulares)
  const blob = (c, r, reg, wob) => {
    const ph = rnd() * 6;
    for (let z = Math.floor(c.z - r - 3); z <= Math.ceil(c.z + r + 3); z++) for (let x = Math.floor(c.x - r - 3); x <= Math.ceil(c.x + r + 3); x++) {
      if (!inb(x, z)) continue;
      const a = Math.atan2(z - c.z, x - c.x), rr = r + wob * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 7 + ph * 2) * 0.4);
      if (Math.hypot(x - c.x, z - c.z) <= rr) { grid[idx(x, z)] = 1; region[idx(x, z)] = reg; }
    }
  };
  blob(HUB, HUB.r, REGION.hub, 1.2);
  blob(HEART, HEART.r, REGION.heart, 1.6);

  // ---------- áreas secretas: bolsões fora do caminho, ligados por uma trilha estreita e sinuosa ----------
  const secrets = [];
  const freeAround = (cx, cz, r) => { for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (!inb(x, z) || grid[idx(x, z)]) return false; return true; };
  for (const k of Object.keys(PATHS)) {
    const P = PATHS[k], line = lines[k];
    let made = 0;
    for (let tries = 0; tries < 40 && made < 2; tries++) {
      const p = line[Math.floor(line.length * (0.18 + rnd() * 0.6))];
      const side = rnd() < 0.5 ? 1 : -1, nx = -p.dz * side, nz = p.dx * side;
      const dist = P.r + 7 + rnd() * 3, sx = p.x + nx * dist, sz = p.z + nz * dist;
      if (!freeAround(sx, sz, 5.2) || secrets.some((s) => Math.hypot(s.x - sx, s.z - sz) < 14)) continue;
      // trilha: sai da borda do caminho e serpenteia até o bolsão
      const n = Math.ceil(dist * 2), wob = rnd() * 6;
      for (let i = 0; i <= n; i++) {
        const t = i / n, w = Math.sin(t * Math.PI) * 1.6 * Math.sin(t * 5 + wob);
        carve(p.x + nx * dist * t - nx * 0 + nz * w * side, p.z + nz * dist * t - nz * 0 - nx * w * side, 0.75, P.reg);
      }
      carve(sx, sz, 2.9, P.reg);
      secrets.push({ x: Math.round(sx), z: Math.round(sz), reg: P.reg });
      made++;
    }
  }

  // ---------- água: rio com margens, lagos, poças do Coração ----------
  const wet = (x, z, i) => { if (grid[i]) { water[i] = 1; grid[i] = 2; } };
  const riv = lines.river, RP = PATHS.river, rph = rnd() * 9;
  const sStart = 13, sEnd = riv[riv.length - 1].s - 9;
  for (const p of riv) {
    if (p.s < sStart || p.s > sEnd) continue;
    disc(p.x, p.z, 1.25 + 0.35 * Math.sin(p.s * 0.4 + rph), wet);
  }
  for (const li of RP.lakes) disc(RP.cur[li][0], RP.cur[li][1], 3.6, wet);
  // poças no Coração (o rio, as raízes e a floresta se misturam)
  const pools = [];
  for (const [a, d, r] of [[-1.0, 9, 2.9], [2.6, 9, 2.6], [0.8, 10.5, 2.3]]) {
    const px = HEART.x + Math.cos(a) * d, pz = HEART.z + Math.sin(a) * d;
    disc(px, pz, r, wet); pools.push({ x: px, z: pz, r });
  }
  // pontes naturais: faixas de chão que cruzam o rio a cada ~14 tiles (nunca nos lagos)
  const bridges = [];
  const nearLake = (x, z) => RP.lakes.some((li) => Math.hypot(RP.cur[li][0] - x, RP.cur[li][1] - z) < 6);
  let nextB = sStart + 8;
  for (const p of riv) {
    if (p.s < nextB || p.s > sEnd - 3 || nearLake(p.x, p.z)) continue;
    nextB = p.s + 13 + rnd() * 4;
    const nx = -p.dz, nz = p.dx;
    for (let k = -3; k <= 3; k += 0.5) for (const w of [-0.6, 0, 0.6]) {
      const x = Math.round(p.x + nx * k + p.dx * w), z = Math.round(p.z + nz * k + p.dz * w), i = idx(x, z);
      if (water[i]) { water[i] = 0; grid[i] = 1; }
    }
    bridges.push({ x: p.x, z: p.z, ry: Math.atan2(nx, nz) });
  }

  // ---------- cachoeiras: na parede do fundo (norte) de cada lago, com um riacho até a água ----------
  const falls = [];
  for (const li of RP.lakes) {
    const cx = Math.round(RP.cur[li][0]);
    let z = Math.round(RP.cur[li][1]);
    while (z > 2 && at(cx, z - 1)) z--;
    if (z <= 2) continue;
    for (let zz = z; zz <= z + 3; zz++) for (const dx of [-1, 0, 1]) { const i = idx(cx + dx, zz); if (grid[i]) { water[i] = 1; grid[i] = 2; } }
    falls.push({ x: cx, z: z - 1, w: 3.6, h: 5.5 });
  }
  // uma cachoeira alimenta a poça do fundo do Coração
  {
    const p = pools[0];
    let z = Math.round(p.z);
    const cx = Math.round(p.x);
    while (z > 2 && at(cx, z - 1)) { const i = idx(cx, z - 1); z--; if (grid[i]) { water[i] = 1; grid[i] = 2; } }
    if (z > 2) falls.push({ x: cx, z: z - 1, w: 3, h: 6 });
  }

  // ---------- Coração: Árvore-Mãe no fundo, Guardião no centro ----------
  const boss = { x: HEART.x, z: HEART.z };
  const motherTree = { x: HEART.x - 8, z: HEART.z - 8 };
  for (let z = motherTree.z - 1; z <= motherTree.z + 1; z++) for (let x = motherTree.x - 1; x <= motherTree.x + 1; x++) if (grid[idx(x, z)]) grid[idx(x, z)] = 2;
  const start = { x: HUB.x + 3, z: HUB.z + 3 };
  grid[idx(start.x, start.z)] = 1;

  // ---------- tudo alcançável a partir da entrada (o resto vira mata) ----------
  const flood = () => {
    const dist = new Int32Array(N).fill(-1), q = [idx(start.x, start.z)];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (z + dz) * W + x + dx; if (grid[j] === 1 && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
    }
    return dist;
  };
  let dist = flood();
  for (let i = 0; i < N; i++) if (grid[i] === 1 && dist[i] < 0) { grid[i] = 0; region[i] = 0; }

  // ---------- adereços que ocupam o tile (grid 2): santuários e baús ----------
  const props = [];
  const nearWallTile = (x, z) => !at(x - 1, z) || !at(x + 1, z) || !at(x, z - 1) || !at(x, z + 1);
  /** Tile de chão livre perto de (x, z), de preferência encostado na mata (não fecha a passagem). */
  const edgeSpot = (x0, z0, r, wantWall) => {
    let best = null, bd = 1e9;
    for (let z = Math.round(z0 - r); z <= Math.round(z0 + r); z++) for (let x = Math.round(x0 - r); x <= Math.round(x0 + r); x++) {
      if (at(x, z) !== 1 || (wantWall && !nearWallTile(x, z))) continue;
      const d = (x - x0) ** 2 + (z - z0) ** 2 + rnd() * 2;
      if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  };
  const events = [], chests = [];
  const block = (s) => { grid[idx(s.x, s.z)] = 2; };
  for (const k of Object.keys(PATHS)) {
    const P = PATHS[k], pts = P.cur;
    const sh = edgeSpot(pts[P.shrine][0], pts[P.shrine][1], 5, true);
    if (sh) { block(sh); events.push({ type: 'shrine', x: sh.x, z: sh.z, reg: P.reg }); }
    events.push({ type: 'ambush', x: Math.round(pts[P.ambush][0]), z: Math.round(pts[P.ambush][1]), reg: P.reg, r: 5 });
    for (const i of [2, 5]) {
      const c = edgeSpot(pts[i][0] + (rnd() - 0.5) * 4, pts[i][1] + (rnd() - 0.5) * 4, 5, true);
      if (c) { block(c); chests.push({ x: c.x, z: c.z, reg: P.reg, secret: false }); }
    }
  }
  for (const s of secrets) { const c = edgeSpot(s.x, s.z, 2, false); if (c) { block(c); chests.push({ x: c.x, z: c.z, reg: s.reg, secret: true }); } }
  // bloquear um tile nunca pode isolar chão: confere e devolve o que for preciso
  dist = flood();
  for (let i = 0; i < N; i++) if (grid[i] === 1 && dist[i] < 0) {
    const x = i % W, z = (i - x) / W;
    for (const c of chests) if (Math.abs(c.x - x) + Math.abs(c.z - z) <= 1) grid[idx(c.x, c.z)] = 1;
    for (const e of events) if (e.type === 'shrine' && Math.abs(e.x - x) + Math.abs(e.z - z) <= 1) grid[idx(e.x, e.z)] = 1;
  }
  dist = flood();
  for (let i = 0; i < N; i++) if (grid[i] === 1 && dist[i] < 0) { grid[i] = 0; region[i] = 0; }

  // ---------- bandos ao longo de cada caminho, mini chefes e o Coração ----------
  const spawns = [];
  const okSpawn = (x, z) => at(x, z) === 1 && Math.hypot(x - start.x, z - start.z) > 13;
  const snap = (x, z) => edgeSpot(x, z, 3, false);
  for (const k of Object.keys(PATHS)) {
    const P = PATHS[k], line = lines[k], total = line[line.length - 1].s;
    const miniP = P.cur[P.mini];
    for (let s = 12; s < total - 6; s += 6.5 + rnd() * 3) {
      const p = line.find((q) => q.s >= s);
      if (Math.hypot(p.x - miniP[0], p.z - miniP[1]) < 7 || Math.hypot(p.x - HEART.x, p.z - HEART.z) < HEART.r + 2) continue;
      const q = snap(p.x + (rnd() - 0.5) * 3, p.z + (rnd() - 0.5) * 3);
      if (!q || !okSpawn(q.x, q.z)) continue;
      spawns.push({ x: q.x, z: q.z, reg: P.reg, t: s / total, elite: rnd() < 0.15, size: 3 + Math.floor(rnd() * 3) });
    }
    const m = snap(miniP[0], miniP[1]);
    if (m) spawns.push({ x: m.x, z: m.z, reg: P.reg, t: 1, mini: true, size: 2 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, q = snap(HEART.x + Math.cos(a) * 8, HEART.z + Math.sin(a) * 8);
    if (q) spawns.push({ x: q.x, z: q.z, reg: REGION.heart, t: 1, elite: i % 3 === 0, size: 4 });
  }
  spawns.push({ x: boss.x, z: boss.z, reg: REGION.heart, boss: true, size: 1 });
  for (const s of secrets) { const q = snap(s.x + 1, s.z + 1); if (q) spawns.push({ x: q.x, z: q.z, reg: s.reg, t: 0.6, elite: true, size: 1 }); }

  // ---------- adereços decorativos (não mudam a grade) ----------
  // árvores gigantes: no fundo das trilhas (mata a norte/oeste do chão) e no meio da mata fechada
  const distFloor = new Uint8Array(N).fill(9);
  {
    const q = [];
    for (let i = 0; i < N; i++) if (grid[i]) { distFloor[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const j = nz * W + nx;
        if (distFloor[j] > distFloor[i] + 1) { distFloor[j] = distFloor[i] + 1; q.push(j); }
      }
    }
  }
  const trees = [];
  const farFromTrees = (x, z, d) => !trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < d * d);
  for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
    const i = idx(x, z);
    if (grid[i]) continue;
    const back = (at(x + 1, z) || at(x + 2, z) || at(x, z + 1) || at(x, z + 2)) && !(at(x - 1, z) || at(x, z - 1));
    // copas no meio da mata só onde não tampam a trilha: a câmera olha do sudeste, então uma árvore alta
    // cobre o chão que fica a -x/-z dela (acima dela na tela)
    let front = false;
    for (let k = 1; k <= 8 && !front; k++) front = at(x - k, z - k) || at(x - k, z) || at(x, z - k) || at(x - k, z - Math.ceil(k / 2)) || at(x - Math.ceil(k / 2), z - k);
    const deep = distFloor[i] >= 3 && !front;
    if (back && rnd() < 0.16 && farFromTrees(x, z, 4.5)) trees.push({ x, z, v: rnd(), edge: true });
    else if (deep && rnd() < 0.06 && farFromTrees(x, z, 5.5)) trees.push({ x, z, v: rnd(), edge: false });
  }
  for (const t of trees) props.push({ x: t.x, z: t.z, kind: t.edge ? 'gtree' : 'gtreeDeep', v: t.v });
  // ruínas antigas: colunas e arcos tombados na floresta, ruínas meio submersas no rio
  for (const k of ['forest', 'river']) {
    const P = PATHS[k];
    for (const i in P.rooms) {
      const [cx, cz] = P.cur[i];
      for (let n = 0; n < 4; n++) {
        const a = rnd() * Math.PI * 2, d = P.rooms[i] * (0.55 + rnd() * 0.4), x = Math.round(cx + Math.cos(a) * d), z = Math.round(cz + Math.sin(a) * d);
        const wtr = water[idx(x, z)];
        if (at(x, z) === 1 && nearWallTile(x, z)) { props.push({ x, z, kind: n % 2 ? 'ruinPillar' : 'ruinBroken', v: rnd() }); grid[idx(x, z)] = 2; }
        else if (wtr) props.push({ x, z, kind: 'ruinSunk', v: rnd() });
      }
    }
  }
  // arcos de raiz sobre o Caminho das Raízes (perpendiculares à trilha)
  {
    const line = lines.roots;
    for (let s = 8; s < line[line.length - 1].s - 6; s += 7 + rnd() * 3) {
      const p = line.find((q) => q.s >= s);
      // largura livre de cada lado da trilha
      const span = (sg) => { let d = 0; while (d < 8 && at(Math.round(p.x - p.dz * sg * (d + 1)), Math.round(p.z + p.dx * sg * (d + 1)))) d++; return d; };
      const a = span(1), b = span(-1);
      props.push({ x: p.x + (-p.dz) * (a - b) / 2, z: p.z + p.dx * (a - b) / 2, kind: 'rootArch', ry: Math.atan2(-p.dz, p.dx), span: a + b + 2, v: rnd() });
    }
  }
  // adereços baixos soltos: pelos tiles de chão, por região
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = idx(x, z);
    if (grid[i] !== 1 || Math.hypot(x - start.x, z - start.z) < 3 || Math.hypot(x - boss.x, z - boss.z) < 4) continue;
    const r = rnd(), wall = nearWallTile(x, z);
    if (wall && r < 0.22) props.push({ x, z, kind: 'low', reg: region[i], v: rnd() });
    else if (r < 0.04) props.push({ x, z, kind: 'decal', reg: region[i], v: rnd() });
  }
  // círculo de pedras na clareira de entrada e a placa dos três caminhos
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.2, x = Math.round(HUB.x + Math.cos(a) * 5.2), z = Math.round(HUB.z + Math.sin(a) * 5.2);
    if (at(x, z) === 1 && Math.hypot(x - start.x, z - start.z) > 2.5) { props.push({ x, z, kind: 'standing', v: rnd(), ry: -a }); grid[idx(x, z)] = 2; }
  }
  const sign = { x: HUB.x - 1, z: HUB.z - 1 };
  if (at(sign.x, sign.z) === 1) { props.push({ x: sign.x, z: sign.z, kind: 'edenSign' }); grid[idx(sign.x, sign.z)] = 2; }
  // runas no chão: círculo sob o Guardião
  const runes = [{ x: boss.x, z: boss.z, s: 9 }];
  dist = flood();
  for (let i = 0; i < N; i++) if (grid[i] === 1 && dist[i] < 0) grid[i] = 0;
  const exit = { x: HUB.x + 5, z: HUB.z - 2 };
  if (at(exit.x, exit.z) !== 1) { const e = edgeSpot(exit.x, exit.z, 3, false); if (e) Object.assign(exit, e); }
  return {
    W, H, grid, region, water, biome: 'eden', floor: 1, seed, start, boss, props, spawns, breakables: [], templates: [],
    eden: true, hub: HUB, heart: HEART, lines, paths: PATHS, secrets, events, chests, bridges, falls, pools, motherTree, runes, exit,
  };
}
