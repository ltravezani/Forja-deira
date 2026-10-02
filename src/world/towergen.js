// ---------- Torre Infinita: geração dos andares (dados puros, sem Three.js) ----------
// Cada andar sorteia uma planta diferente da anterior (anel, salões, claustros,
// câmaras ou nave) e espalha eventos: emboscadas, uma invasão, círculos selados,
// santuários e o Ladrão de Ouro. Os eventos usam o mesmo orçamento de bandos de
// antes (o andar não fica mais difícil, só mais imprevisível).
// A câmera olha do sudeste: +x/+z = frente (entrada), -x/-z = fundo (chefe).
import { R } from '../core/util.js';
import { floodFrom, placeProps } from './levelgen.js';

const W = 52, H = 52, C = 26;
const FRONT = Math.PI / 4; // ângulo (atan2(z, x)) da entrada

/** Plantas possíveis de um andar: nome no topo da tela e dica no registro. */
export const TOWER_LAYOUTS = {
  anel: { name: 'Anel dos Sentinelas', hint: 'Contorne o anel até a porta do salão central.' },
  saloes: { name: 'Salões Entrelaçados', hint: 'Atravesse os salões até a sala do trono, no fundo.' },
  claustros: { name: 'Claustros Concêntricos', hint: 'Cada muralha tem uma única passagem; o chefe espera no centro.' },
  camaras: { name: 'Câmaras Suspensas', hint: 'Pontes estreitas ligam as câmaras; o chefe está na maior delas.' },
  nave: { name: 'Nave do Juramento', hint: 'Suba a nave entre as capelas até o altar do chefe.' },
};

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

/** Ferramentas de desenho na grade (sempre dentro da borda). */
function painter(grid) {
  const set = (x, z, v) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) grid[z * W + x] = v; };
  const rect = (x0, z0, x1, z1, v) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, v); };
  const disk = (cx, cz, r, v) => {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, z - cz) <= r) set(x, z, v);
  };
  /** Corredor reto de (ax, az) a (bx, bz) com meia largura `hw`. */
  const line = (ax, az, bx, bz, hw, v) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    for (let i = 0; i <= n; i++) disk(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, hw, v);
  };
  return { set, rect, disk, line };
}

// ---------- plantas ----------
// Cada uma desenha o chão (1) e devolve { start, boss, bossR, spots }.
// spots = pontos de interesse ({x, z, r}) onde podem cair os eventos.

/** Anel: setores separados por muretas radiais e o salão do chefe no centro. */
function layoutAnel(grid, rnd, floor) {
  const { set } = painter(grid);
  const RO = 23.5, RI0 = 8.5, RI1 = 11.5; // raio externo, muralha do salão (de RI0 a RI1)
  const BACK = FRONT + Math.PI;
  const doors = [BACK + (rnd() - 0.5) * 1.2];
  if (floor >= 4 && rnd() < 0.5) doors.push(BACK + (rnd() < 0.5 ? 1 : -1) * (1.4 + rnd() * 0.4));
  const nSect = 5 + (rnd() < 0.5 ? 1 : 0), off = rnd() * Math.PI * 2;
  const spokes = [];
  for (let k = 0; k < nSect; k++) {
    const a = off + (k / nSect) * Math.PI * 2;
    if (angDiff(a, FRONT) < 0.35) continue; // não fecha a entrada
    spokes.push({ a, gap: RI1 + 2 + rnd() * (RO - RI1 - 5) });
  }
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const dx = x - C, dz = z - C, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (d >= RO) continue;
    let v = 1;
    if (d >= RI0 && d < RI1 && !doors.some((da) => angDiff(a, da) * d < 1.6)) v = 0;
    if (d >= RI1) for (const sp of spokes) if (angDiff(a, sp.a) * d < 0.9 && Math.abs(d - sp.gap) > 1.6) v = 0;
    grid[z * W + x] = v;
  }
  const start = { x: Math.round(C + Math.cos(FRONT) * (RO - 3.5)), z: Math.round(C + Math.sin(FRONT) * (RO - 3.5)) };
  const nPil = 3 + Math.floor(rnd() * 4);
  for (let k = 0, tries = 0; k < nPil && tries < 60; tries++) {
    const a = rnd() * Math.PI * 2, d = RI1 + 3 + rnd() * (RO - RI1 - 6);
    const x = Math.round(C + Math.cos(a) * d), z = Math.round(C + Math.sin(a) * d);
    if (Math.hypot(x - start.x, z - start.z) < 6 || spokes.some((sp) => angDiff(a, sp.a) * d < 3)) continue;
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) set(x + dx, z + dz, 0);
    k++;
  }
  const spots = [];
  for (let k = 0; k < 10; k++) {
    const a = FRONT + ((k + 0.5) / 10) * Math.PI * 2, d = (RI1 + RO) / 2;
    if (angDiff(a, FRONT) > 0.6) spots.push({ x: Math.round(C + Math.cos(a) * d), z: Math.round(C + Math.sin(a) * d), r: 4 });
  }
  return { start, boss: { x: C, z: C }, bossR: RI0, spots };
}

/** Salões: grade 4×4 de salas de tamanhos variados ligadas por um labirinto; trono no canto do fundo. */
function layoutSaloes(grid, rnd) {
  const { rect, set } = painter(grid);
  const N = 4, CS = 12, O = 2;
  const idx = (cx, cz) => cz * N + cx;
  const center = (cx, cz) => ({ x: O + cx * CS + 6, z: O + cz * CS + 6 });
  const rooms = [];
  for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) {
    const boss = cx === 0 && cz === 0, start = cx === N - 1 && cz === N - 1;
    const ins = () => (boss ? 1 : 1 + Math.floor(rnd() * 3));
    const l = ins(), r = ins(), t = ins(), b = ins();
    const x0 = O + cx * CS + l, x1 = O + cx * CS + CS - 1 - r, z0 = O + cz * CS + t, z1 = O + cz * CS + CS - 1 - b;
    rect(x0, z0, x1, z1, 1);
    rooms.push({ cx, cz, x0, x1, z0, z1, boss, start });
  }
  // labirinto entre as salas (busca em profundidade) e dois atalhos
  const seen = new Uint8Array(N * N), conn = [];
  const stack = [{ cx: N - 1, cz: N - 1 }];
  seen[idx(N - 1, N - 1)] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ cx: c.cx + dx, cz: c.cz + dz }))
      .filter((n) => n.cx >= 0 && n.cz >= 0 && n.cx < N && n.cz < N && !seen[idx(n.cx, n.cz)]);
    if (!nb.length) { stack.pop(); continue; }
    const n = nb[Math.floor(rnd() * nb.length)];
    seen[idx(n.cx, n.cz)] = 1;
    conn.push([c, n]);
    stack.push(n);
  }
  for (let k = 0; k < 2; k++) {
    const cx = Math.floor(rnd() * (N - 1)), cz = 1 + Math.floor(rnd() * (N - 1));
    conn.push([{ cx, cz }, { cx: cx + 1, cz }]);
  }
  for (const [a, b] of conn) {
    const A = center(a.cx, a.cz), B = center(b.cx, b.cz);
    rect(Math.min(A.x, B.x) - 1, Math.min(A.z, B.z) - 1, Math.max(A.x, B.x) + 1, Math.max(A.z, B.z) + 1, 1);
  }
  // colunas nos salões grandes (dois pares, longe das portas)
  const spots = [];
  for (const rm of rooms) {
    const w = rm.x1 - rm.x0 + 1, h = rm.z1 - rm.z0 + 1, c = center(rm.cx, rm.cz);
    if (!rm.boss && !rm.start && w >= 8 && h >= 8 && rnd() < 0.6) for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) set(c.x + dx, c.z + dz, 0);
    if (!rm.boss && !rm.start) spots.push({ x: c.x, z: c.z, r: Math.min(w, h) / 2 - 0.5 });
  }
  const s = center(N - 1, N - 1), b = center(0, 0);
  return { start: { x: s.x + 1, z: s.z + 1 }, boss: b, bossR: 5, spots };
}

/** Claustros: muralhas quadradas concêntricas, cada uma com uma passagem do lado oposto à anterior. */
function layoutClaustros(grid, rnd) {
  const walls = [7, 13, 18], OUT = 23;
  // passagens no meio dos lados: a de fora fica no fundo (esquerdo ou direito), as outras se alternam
  const sides = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const g = [rnd() < 0.5 ? Math.PI : -Math.PI / 2];
  for (let k = 1; k < walls.length; k++) g.push(g[k - 1] + Math.PI + (rnd() < 0.35 ? (rnd() < 0.5 ? 1 : -1) * Math.PI / 2 : 0));
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const dx = x - C, dz = z - C, d = Math.max(Math.abs(dx), Math.abs(dz)), a = Math.atan2(dz, dx);
    if (d > OUT) continue;
    const wi = walls.indexOf(d);
    // walls[2] é a de fora (g[0]), walls[0] a do salão do chefe
    if (wi >= 0 && angDiff(a, g[walls.length - 1 - wi]) * d >= 1.6) continue;
    grid[z * W + x] = 1;
  }
  // pares de colunas nos corredores largos, e cada canto vira um ponto de interesse
  const { set } = painter(grid);
  const spots = [];
  const rings = [[8, 12], [14, 17], [19, 23]];
  for (const [r0, r1] of rings) {
    const m = Math.round((r0 + r1) / 2);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) spots.push({ x: C + sx * m, z: C + sz * m, r: (r1 - r0) / 2 + 1 });
    for (const a of sides) if (rnd() < 0.5) {
      const off = Math.round((rnd() - 0.5) * 2 * (m - 3));
      const px = C + Math.round(Math.cos(a)) * m + Math.round(Math.sin(a)) * off, pz = C + Math.round(Math.sin(a)) * m + Math.round(Math.cos(a)) * off;
      if (g.every((ga) => angDiff(Math.atan2(pz - C, px - C), ga) * m > 4)) set(px, pz, 0);
    }
  }
  return { start: { x: C + 20, z: C + 20 }, boss: { x: C, z: C }, bossR: 6, spots: spots.filter((s) => !(s.x > C && s.z > C && Math.max(s.x - C, s.z - C) > 18)) };
}

/** Câmaras: salas redondas espalhadas, ligadas por pontes estreitas (árvore mínima + atalhos). */
function layoutCamaras(grid, rnd) {
  const { disk, line, set } = painter(grid);
  const ch = [{ x: 41, z: 41, r: 4.5 }, { x: 13, z: 13, r: 8 }];
  for (let tries = 0; tries < 400 && ch.length < 10; tries++) {
    const r = 3.5 + rnd() * 2.5;
    const x = r + 2 + rnd() * (W - 2 * r - 5), z = r + 2 + rnd() * (H - 2 * r - 5);
    if (ch.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 3)) ch.push({ x: Math.round(x), z: Math.round(z), r });
  }
  // árvore geradora mínima (Prim) a partir da entrada
  const inTree = [0], edges = [];
  while (inTree.length < ch.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < ch.length; j++) {
      if (inTree.includes(j)) continue;
      const d = Math.hypot(ch[i].x - ch[j].x, ch[i].z - ch[j].z);
      if (!best || d < best.d) best = { i, j, d };
    }
    inTree.push(best.j);
    edges.push([best.i, best.j]);
  }
  for (let k = 0; k < 2; k++) {
    const i = Math.floor(rnd() * ch.length), j = Math.floor(rnd() * ch.length);
    if (i !== j && Math.hypot(ch[i].x - ch[j].x, ch[i].z - ch[j].z) < 20) edges.push([i, j]);
  }
  for (const c of ch) disk(c.x, c.z, c.r, 1);
  for (const [i, j] of edges) line(ch[i].x, ch[i].z, ch[j].x, ch[j].z, 1.1, 1);
  // anel de colunas nas câmaras maiores
  for (let k = 2; k < ch.length; k++) {
    const c = ch[k];
    if (c.r < 5 || rnd() < 0.4) continue;
    for (let q = 0; q < 4; q++) { const a = Math.PI / 4 + (q * Math.PI) / 2; set(Math.round(c.x + Math.cos(a) * (c.r - 2)), Math.round(c.z + Math.sin(a) * (c.r - 2)), 0); }
  }
  return { start: { x: ch[0].x, z: ch[0].z }, boss: { x: ch[1].x, z: ch[1].z }, bossR: ch[1].r, spots: ch.slice(2).map((c) => ({ x: c.x, z: c.z, r: c.r })) };
}

/** Nave: corredor largo com colunatas, transepto com capelas redondas e capelas laterais; altar no fundo. */
function layoutNave(grid, rnd) {
  const { rect, disk, set } = painter(grid);
  const spots = [];
  rect(C - 4, 11, C + 4, 46, 1); // nave
  disk(C, 10, 7, 1); // abside do chefe
  rect(C - 17, C - 3, C + 17, C + 3, 1); // transepto
  for (const sx of [-1, 1]) {
    disk(C + sx * 18, C, 4.5, 1);
    spots.push({ x: C + sx * 18, z: C, r: 4.5 });
    // capelas laterais acima e abaixo do transepto, com porta para a nave ou para o transepto
    for (const [z0, z1] of [[33, 40], [13, 20]]) {
      if (rnd() < 0.15) continue;
      const w = 6 + Math.floor(rnd() * 3), x0 = sx < 0 ? C - 7 - w : C + 7, x1 = x0 + w;
      rect(x0, z0, x1, z1, 1);
      const zd = z0 + 2 + Math.floor(rnd() * (z1 - z0 - 3));
      if (rnd() < 0.75) rect(sx < 0 ? x1 : C + 5, zd - 1, sx < 0 ? C - 5 : x0, zd + 1, 1);
      else { const xm = Math.round((x0 + x1) / 2); rect(xm - 1, z0 > C ? C + 3 : z1, xm + 1, z0 > C ? z0 : C - 3, 1); }
      spots.push({ x: Math.round((x0 + x1) / 2), z: Math.round((z0 + z1) / 2), r: Math.min(w, z1 - z0) / 2 });
    }
  }
  // colunatas da nave
  for (let z = 15; z <= 40; z += 4) if (Math.abs(z - C) > 4) { set(C - 3, z, 0); set(C + 3, z, 0); }
  spots.push({ x: C, z: 37, r: 3.5 });
  // metade das vezes a nave corre ao longo de x (transposta): continua indo da frente ao fundo
  if (rnd() < 0.5) {
    const g2 = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) g2[x * W + z] = grid[z * W + x];
    grid.set(g2);
    for (const s of spots) [s.x, s.z] = [s.z, s.x];
    return { start: { x: 44, z: C }, boss: { x: 10, z: C }, bossR: 7, spots };
  }
  return { start: { x: C, z: 44 }, boss: { x: C, z: 10 }, bossR: 7, spots };
}

const BUILD = { anel: layoutAnel, saloes: layoutSaloes, claustros: layoutClaustros, camaras: layoutCamaras, nave: layoutNave };

/**
 * Andar da Torre Infinita. `avoid` = planta do andar anterior (não repete).
 * Eventos (L.events, em tiles): ambush (dispara ao chegar perto), sealed (círculo
 * que se fecha com um bando dentro), invasion (fenda que abre durante o andar),
 * shrine (bênção temporária) e thief (Ladrão de Ouro, foge e some).
 */
export function genTower(biomeId, floor, seed, avoid) {
  const rnd = R.mulberry32(seed);
  const keys = Object.keys(BUILD).filter((k) => k !== avoid);
  const layout = keys[Math.floor(rnd() * keys.length)];
  const grid = new Uint8Array(W * H);
  const P = BUILD[layout](grid, rnd, floor);
  const { start, boss, bossR } = P;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  // salão do chefe: quatro colunas em volta do centro
  const k4 = Math.round(bossR * 0.45);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (at(boss.x + sx * k4, boss.z + sz * k4) === 1) grid[(boss.z + sz * k4) * W + boss.x + sx * k4] = 0;
  let dist = floodFrom(grid, W, H, start);
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && dist[i] < 0) grid[i] = 0;
  /** Tile de chão mais próximo de (x, z), até `r` de distância. */
  const snap = (x, z, r) => {
    let best = null, bd = 1e9;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, z + dz) === 1 && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = { x: x + dx, z: z + dz }; }
    return best;
  };
  const far = (s, d) => Math.hypot(s.x - start.x, s.z - start.z) >= d && Math.hypot(s.x - boss.x, s.z - boss.z) >= bossR + 4;
  const spots = [];
  for (const s of P.spots) { const q = snap(s.x, s.z, 2); if (q && far(q, 9)) spots.push({ x: q.x, z: q.z, r: s.r }); }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  // eventos: emboscadas, círculo selado e invasão gastam bandos do orçamento normal
  const packSize = () => 3 + Math.floor(rnd() * (3 + Math.min(5, floor / 3)));
  let budget = 7 + Math.min(6, Math.floor(floor / 2));
  const events = [];
  const take = (ok) => { const i = spots.findIndex(ok || (() => true)); return i < 0 ? null : spots.splice(i, 1)[0]; };
  if (floor >= 2 && rnd() < 0.6) {
    const s = take((q) => q.r >= 3.5);
    if (s) { events.push({ type: 'sealed', x: s.x, z: s.z, r: Math.min(5, s.r), size: packSize() + 1 }); budget--; }
  }
  const nAmb = 1 + (rnd() < 0.5 ? 1 : 0) + (floor >= 5 && rnd() < 0.4 ? 1 : 0);
  for (let k = 0; k < nAmb; k++) {
    const s = take();
    if (s) { events.push({ type: 'ambush', x: s.x, z: s.z, r: 3, size: packSize() }); budget--; }
  }
  if (rnd() < 0.8) { events.push({ type: 'invasion', size: packSize() + 1, delay: 35 + Math.floor(rnd() * 30) }); budget--; }
  if (rnd() < 0.45) { const s = take(); if (s) events.push({ type: 'shrine', x: s.x, z: s.z, kind: Math.floor(rnd() * 3) }); }
  if (floor >= 2 && rnd() < 0.35) { const s = take(); if (s) events.push({ type: 'thief', x: s.x, z: s.z }); }
  const marked = events.filter((e) => e.x != null);
  const props = placeProps(grid, W, H, rnd, start, [[start, 2], [boss, Math.ceil(bossR * 0.5)]].concat(marked.map((e) => [e, e.type === 'shrine' ? 2 : 1])));
  for (const e of marked) { const q = snap(e.x, e.z, 3); if (q) { e.x = q.x; e.z = q.z; } }
  const nearWall = (x, z) => at(x - 1, z) === 0 || at(x + 1, z) === 0 || at(x, z - 1) === 0 || at(x, z + 1) === 0;
  // bandos comuns (o que sobrou do orçamento), chefe no fundo
  const spawns = [{ x: boss.x, z: boss.z, boss: true, elite: false, size: 1 }];
  for (let k = 0, tries = 0; k < budget && tries < 600; tries++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    if (at(x, z) !== 1 || Math.hypot(x - boss.x, z - boss.z) < bossR + 1 || Math.hypot(x - start.x, z - start.z) < 8) continue;
    if (spawns.some((s) => Math.abs(s.x - x) + Math.abs(s.z - z) < 5)) continue;
    if (marked.some((e) => (e.type === 'sealed' || e.type === 'ambush') && Math.hypot(e.x - x, e.z - z) < (e.r || 3) + 3)) continue;
    spawns.push({ x, z, boss: false, elite: rnd() < 0.14 + Math.min(0.16, floor * 0.01), size: packSize() });
    k++;
  }
  const breakables = [];
  for (let k = 0; k < 14; k++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    if (at(x, z) === 1 && nearWall(x, z) && Math.hypot(x - start.x, z - start.z) > 3 && Math.hypot(x - boss.x, z - boss.z) > 6) breakables.push({ x, z });
  }
  // runas no chão: círculo sob o chefe, o selo dos círculos selados e alguns selos soltos
  const runes = [{ x: boss.x, z: boss.z, s: 7 }];
  for (const e of events) if (e.type === 'sealed') runes.push({ x: e.x, z: e.z, s: e.r * 3.6, seal: true });
  for (let k = 0; k < 6; k++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    if (at(x, z) === 1 && Math.hypot(x - boss.x, z - boss.z) > bossR) runes.push({ x, z, s: 2.4 + rnd() * 1.6 });
  }
  return { W, H, grid, biome: biomeId, floor, seed, start, boss, bossR, props, spawns, breakables, templates: [], tower: true, runes, events, layout };
}
