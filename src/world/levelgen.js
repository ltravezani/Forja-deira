// ---------- geração procedural (dados puros): masmorras por chunks e a cidade ----------
import { R } from '../core/util.js';
import { BIOMES } from './biomes.js';

/** Busca em largura a partir de `sc` pelos tiles de chão (1); -1 = inalcançável. */
function floodFrom(grid, W, H, sc) {
  const dist = new Int32Array(W * H).fill(-1);
  const q = [sc.z * W + sc.x];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (z + dz) * W + x + dx;
      if (grid[j] === 1 && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  return dist;
}

/**
 * Adereços do andar: altos só encostados em paredes do fundo (norte/oeste),
 * baixos perto de paredes e decalques soltos. Adereços altos que isolariam
 * algum pedaço do chão são desfeitos. `avoid` = [[centro, raio], ...] livres.
 */
function placeProps(grid, W, H, rnd, sc, avoid) {
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  const props = [];
  const nearWall = (x, z) => at(x - 1, z) === 0 || at(x + 1, z) === 0 || at(x, z - 1) === 0 || at(x, z + 1) === 0;
  const backWall = (x, z) => at(x - 1, z) === 0 || at(x, z - 1) === 0;
  const nearCenter = (x, z, c, r) => Math.abs(x - c.x) <= r && Math.abs(z - c.z) <= r;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    if (grid[z * W + x] !== 1) continue;
    if (avoid.some(([c, r]) => nearCenter(x, z, c, r))) continue;
    const r = rnd();
    if (backWall(x, z) && !(at(x + 1, z) === 0 || at(x, z + 1) === 0) && r < 0.09) {
      const fr = [at(x + 1, z), at(x, z + 1), at(x - 1, z + 1) || at(x + 1, z - 1)].every((v) => v === 1);
      if (fr) { props.push({ x, z, kind: 'tall', v: rnd() }); grid[z * W + x] = 2; }
    } else if (nearWall(x, z) && r < 0.2) props.push({ x, z, kind: 'low', v: rnd() });
    else if (r < 0.05) props.push({ x, z, kind: 'decal', v: rnd() });
  }
  let dist = floodFrom(grid, W, H, sc);
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && dist[i] < 0) {
    const x = i % W, z = (i - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid[(z + dz) * W + x + dx] === 2) grid[(z + dz) * W + x + dx] = 1;
  }
  for (let i = props.length - 1; i >= 0; i--) if (props[i].kind === 'tall' && grid[props[i].z * W + props[i].x] !== 2) props.splice(i, 1);
  dist = floodFrom(grid, W, H, sc);
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && dist[i] < 0) grid[i] = 0;
  return props;
}

/**
 * Gera uma masmorra a partir de "chunks" 12×12 ligados por um labirinto.
 * Regras de câmera (Torchlight): paredes entre a câmera e o chão ficam baixas,
 * e objetos altos só encostam em paredes do fundo (norte/oeste), nunca no meio.
 */
export function genDungeon(biomeId, floor, seed) {
  const rnd = R.mulberry32(seed);
  const B = BIOMES[biomeId];
  const cw = floor < 3 ? 3 : 4, chN = floor < 3 ? 3 : 4 + (rnd() < 0.4 ? 1 : 0);
  const CS = 12, W = cw * CS + 2, H = chN * CS + 2;
  const grid = new Uint8Array(W * H);
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  const set = (x, z, v) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) grid[z * W + x] = v; };
  const conn = new Set();
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const idx = (cx, cz) => cz * cw + cx;
  const seen = new Uint8Array(cw * chN);
  const start = { cx: 0, cz: Math.floor(rnd() * chN) };
  const stack = [start];
  seen[idx(start.cx, start.cz)] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ cx: c.cx + dx, cz: c.cz + dz }))
      .filter((n) => n.cx >= 0 && n.cz >= 0 && n.cx < cw && n.cz < chN && !seen[idx(n.cx, n.cz)]);
    if (!nb.length) { stack.pop(); continue; }
    const n = nb[Math.floor(rnd() * nb.length)];
    seen[idx(n.cx, n.cz)] = 1;
    conn.add(key(idx(c.cx, c.cz), idx(n.cx, n.cz)));
    stack.push(n);
  }
  for (let k = 0; k < 2; k++) {
    const cx = Math.floor(rnd() * (cw - 1)), cz = Math.floor(rnd() * chN);
    conn.add(key(idx(cx, cz), idx(cx + 1, cz)));
  }
  const centerOf = (cx, cz) => ({ x: 1 + cx * CS + 6, z: 1 + cz * CS + 6 });
  const templates = [];
  for (let cz = 0; cz < chN; cz++) for (let cx = 0; cx < cw; cx++) {
    const ox = 1 + cx * CS, oz = 1 + cz * CS;
    const tpl = B.templates[Math.floor(rnd() * B.templates.length)];
    templates.push(tpl);
    if (tpl === 'room' || tpl === 'hall') {
      const l = 1 + Math.floor(rnd() * (tpl === 'hall' ? 1 : 3)), r = 1 + Math.floor(rnd() * (tpl === 'hall' ? 1 : 3));
      const t = 1 + Math.floor(rnd() * (tpl === 'hall' ? 1 : 3)), b = 1 + Math.floor(rnd() * (tpl === 'hall' ? 1 : 3));
      for (let z = oz + t; z < oz + CS - b; z++) for (let x = ox + l; x < ox + CS - r; x++) set(x, z, 1);
    } else if (tpl === 'cave') {
      const tmp = new Uint8Array(CS * CS);
      for (let i = 0; i < tmp.length; i++) tmp[i] = rnd() < 0.58 ? 1 : 0;
      for (let it = 0; it < 3; it++) {
        const nx = new Uint8Array(CS * CS);
        for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
          let c = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Z = z + dz;
            c += X < 0 || Z < 0 || X >= CS || Z >= CS ? 0 : tmp[Z * CS + X];
          }
          nx[z * CS + x] = c >= 5 ? 1 : 0;
        }
        tmp.set(nx);
      }
      for (let z = 1; z < CS - 1; z++) for (let x = 1; x < CS - 1; x++) {
        const d = Math.hypot(x - 6, z - 6);
        if (tmp[z * CS + x] || d < 3.2) set(ox + x, oz + z, 1);
      }
    } else {
      for (let z = oz + 4; z < oz + 9; z++) for (let x = ox + 4; x < ox + 9; x++) set(x, z, 1);
    }
  }
  conn.forEach((k) => {
    const [a, b] = k.split('-').map(Number);
    const A = centerOf(a % cw, Math.floor(a / cw)), Bc = centerOf(b % cw, Math.floor(b / cw));
    if (A.z === Bc.z) { for (let x = Math.min(A.x, Bc.x); x <= Math.max(A.x, Bc.x); x++) for (let d = -1; d <= 1; d++) set(x, A.z + d, 1); }
    else { for (let z = Math.min(A.z, Bc.z); z <= Math.max(A.z, Bc.z); z++) for (let d = -1; d <= 1; d++) set(A.x + d, z, 1); }
  });
  const sc = centerOf(start.cx, start.cz);
  const flood = () => {
    const dist = new Int32Array(W * H).fill(-1);
    const q = [sc.z * W + sc.x];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (z + dz) * W + x + dx;
        if (grid[j] === 1 && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
      }
    }
    return dist;
  };
  let dist = flood();
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && dist[i] < 0) grid[i] = 0;
  let far = { d: -1 };
  for (let cz = 0; cz < chN; cz++) for (let cx = 0; cx < cw; cx++) {
    const c = centerOf(cx, cz), d = dist[c.z * W + c.x];
    if (d > far.d) far = { d, cx, cz };
  }
  const bossC = centerOf(far.cx, far.cz);
  const props = placeProps(grid, W, H, rnd, sc, [[sc, 2], [bossC, 3]]);
  const nearWall = (x, z) => at(x - 1, z) === 0 || at(x + 1, z) === 0 || at(x, z - 1) === 0 || at(x, z + 1) === 0;
  const nearCenter = (x, z, c, r) => Math.abs(x - c.x) <= r && Math.abs(z - c.z) <= r;
  const spawns = [];
  for (let cz = 0; cz < chN; cz++) for (let cx = 0; cx < cw; cx++) {
    if (cx === start.cx && cz === start.cz) continue;
    const isBoss = cx === far.cx && cz === far.cz;
    const packs = isBoss ? 1 : 1 + (rnd() < 0.55 ? 1 : 0) + (floor > 4 && rnd() < 0.3 ? 1 : 0);
    for (let p = 0; p < packs; p++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = 1 + cx * CS + 2 + Math.floor(rnd() * (CS - 4)), z = 1 + cz * CS + 2 + Math.floor(rnd() * (CS - 4));
        if (at(x, z) === 1) { spawns.push({ x, z, boss: isBoss && p === 0, elite: !isBoss && rnd() < 0.14, size: 3 + Math.floor(rnd() * (3 + Math.min(4, floor / 2))) }); break; }
      }
    }
  }
  const breakables = [];
  for (let k = 0; k < cw * chN * 2; k++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    if (at(x, z) === 1 && nearWall(x, z) && !nearCenter(x, z, sc, 2)) breakables.push({ x, z });
  }
  return { W, H, grid, biome: biomeId, floor, seed, start: sc, boss: bossC, props, spawns, breakables, templates };
}

/**
 * Andar da Torre Infinita: planta circular. Um anel externo dividido em setores
 * por muretas radiais (cada uma com uma passagem), uma muralha grossa em volta
 * do salão central e o chefe no centro. A entrada fica na frente (+x/+z, perto
 * da câmera) e a porta do salão fica no fundo, então é preciso contornar o anel.
 */
export function genTower(biomeId, floor, seed) {
  const rnd = R.mulberry32(seed);
  const W = 52, H = 52, c = 26;
  const RO = 23.5, RI0 = 8.5, RI1 = 11.5; // raio externo, muralha do salão (de RI0 a RI1)
  const grid = new Uint8Array(W * H);
  const set = (x, z, v) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) grid[z * W + x] = v; };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
  const FRONT = Math.PI / 4, BACK = FRONT + Math.PI; // ângulo (atan2(z, x)) da entrada e do fundo
  // portas do salão: uma no fundo e, a partir do andar 4, às vezes outra de lado
  const doors = [BACK + (rnd() - 0.5) * 1.2];
  if (floor >= 4 && rnd() < 0.5) doors.push(BACK + (rnd() < 0.5 ? 1 : -1) * (1.4 + rnd() * 0.4));
  // muretas radiais: 5 ou 6 setores, cada mureta com uma passagem em raio sorteado
  const nSect = 5 + (rnd() < 0.5 ? 1 : 0), off = rnd() * Math.PI * 2;
  const spokes = [];
  for (let k = 0; k < nSect; k++) {
    const a = off + (k / nSect) * Math.PI * 2;
    if (angDiff(a, FRONT) < 0.35) continue; // não fecha a entrada
    spokes.push({ a, gap: RI1 + 2 + rnd() * (RO - RI1 - 5) });
  }
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const dx = x - c, dz = z - c, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (d >= RO) continue;
    let v = 1;
    if (d >= RI0 && d < RI1 && !doors.some((da) => angDiff(a, da) * d < 1.6)) v = 0;
    if (d >= RI1) for (const sp of spokes) if (angDiff(a, sp.a) * d < 0.9 && Math.abs(d - sp.gap) > 1.6) v = 0;
    grid[z * W + x] = v;
  }
  // pilares soltos no anel (2×2), longe da entrada e das passagens
  const start = { x: Math.round(c + Math.cos(FRONT) * (RO - 3.5)), z: Math.round(c + Math.sin(FRONT) * (RO - 3.5)) };
  const nPil = 3 + Math.floor(rnd() * 4);
  for (let k = 0, tries = 0; k < nPil && tries < 60; tries++) {
    const a = rnd() * Math.PI * 2, d = RI1 + 3 + rnd() * (RO - RI1 - 6);
    const x = Math.round(c + Math.cos(a) * d), z = Math.round(c + Math.sin(a) * d);
    if (Math.hypot(x - start.x, z - start.z) < 6 || spokes.some((sp) => angDiff(a, sp.a) * d < 3)) continue;
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) set(x + dx, z + dz, 0);
    k++;
  }
  // salão do chefe: quatro colunas em volta do centro
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    set(Math.round(c + Math.cos(a) * 5), Math.round(c + Math.sin(a) * 5), 0);
  }
  const boss = { x: c, z: c };
  const props = placeProps(grid, W, H, rnd, start, [[start, 2], [boss, 4]]);
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : grid[z * W + x]);
  const nearWall = (x, z) => at(x - 1, z) === 0 || at(x + 1, z) === 0 || at(x, z - 1) === 0 || at(x, z + 1) === 0;
  // bandos no anel (mais e maiores a cada andar), chefe no centro
  const spawns = [{ x: boss.x, z: boss.z, boss: true, elite: false, size: 1 }];
  const nPacks = 7 + Math.min(6, Math.floor(floor / 2));
  for (let k = 0, tries = 0; k < nPacks && tries < 400; tries++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    const d = Math.hypot(x - c, z - c);
    if (at(x, z) !== 1 || d < RI1 + 1 || Math.hypot(x - start.x, z - start.z) < 8) continue;
    if (spawns.some((s) => Math.abs(s.x - x) + Math.abs(s.z - z) < 5)) continue;
    spawns.push({ x, z, boss: false, elite: rnd() < 0.14 + Math.min(0.16, floor * 0.01), size: 3 + Math.floor(rnd() * (3 + Math.min(5, floor / 3))) });
    k++;
  }
  const breakables = [];
  for (let k = 0; k < 14; k++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (H - 2));
    if (at(x, z) === 1 && nearWall(x, z) && Math.hypot(x - start.x, z - start.z) > 3 && Math.hypot(x - c, z - c) > 6) breakables.push({ x, z });
  }
  // runas no chão: círculo sob o chefe e alguns selos no anel
  const runes = [{ x: boss.x, z: boss.z, s: 7 }];
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, d = RI1 + 2 + rnd() * (RO - RI1 - 4);
    const x = Math.round(c + Math.cos(a) * d), z = Math.round(c + Math.sin(a) * d);
    if (at(x, z) === 1) runes.push({ x, z, s: 2.4 + rnd() * 1.6 });
  }
  return { W, H, grid, biome: biomeId, floor, seed, start, boss, props, spawns, breakables, templates: [], tower: true, runes };
}

/**
 * Cidade de Aldrena à noite: praça calçada, ruas em cruz, casas enxaimel no
 * fundo (norte/oeste, para não tapar a câmera), barracas, lampiões, poço,
 * cemitério e paliçada. Mesma estrutura de grade das masmorras.
 */
export function genTown() {
  const W = 46, H = 46;
  const grid = new Uint8Array(W * H);
  const cx = 23, cz = 23;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const d = Math.hypot(x - cx, (z - cz) * 1.05);
    if (d < 19.5) grid[z * W + x] = 1;
  }
  const props = [];
  const block = (x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (grid[z * W + x]) grid[z * W + x] = 2; };
  // fonte central
  block(cx - 1, cz - 1, cx + 1, cz + 1);
  props.push({ x: cx, z: cz, kind: 'fountain' });
  // casas (sempre no fundo); rot 0 = comprida no eixo x (5×3), rot 1 = no eixo z (3×5)
  const houses = [[cx - 12, cz - 11, 0], [cx + 2, cz - 16, 0], [cx - 17, cz + 1, 1], [cx + 11, cz - 13, 0], [cx - 15, cz + 10, 1], [cx - 7, cz - 16, 0]];
  houses.forEach(([hx, hz, r], i) => {
    if (r) block(hx - 1, hz - 2, hx + 1, hz + 2); else block(hx - 2, hz - 1, hx + 2, hz + 1);
    props.push({ x: hx, z: hz, kind: 'house', r, v: i });
  });
  const rnd = R.mulberry32(77);
  const isPath = (x, z) => Math.hypot(x - cx, z - cz) < 8.5 || Math.abs(x - (cx + 1)) < 1.6 || Math.abs(z - cz) < 1.6;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    if (grid[z * W + x] !== 1) continue;
    const d = Math.hypot(x - cx, z - cz);
    const back = x < cx - 4 || z < cz - 4;
    if (d > 16.5 && d < 19 && back && !isPath(x, z) && rnd() < 0.32) { props.push({ x, z, kind: 'tree', v: rnd() }); grid[z * W + x] = 2; }
    else if (d > 13 && !isPath(x, z) && rnd() < 0.06) props.push({ x, z, kind: 'bush', v: rnd() });
    else if (!isPath(x, z) && rnd() < 0.03) props.push({ x, z, kind: 'decal', v: rnd() });
  }
  // lampiões ao longo das ruas e da praça
  for (const [lx, lz] of [[cx - 5, cz - 5], [cx + 6, cz - 5], [cx - 5, cz + 6], [cx + 6, cz + 6], [cx + 3, cz - 12], [cx - 1, cz - 12], [cx + 12, cz + 2], [cx - 12, cz + 2], [cx + 2, cz + 13], [cx - 12, cz - 2]]) {
    if (grid[lz * W + lx] === 1) { props.push({ x: lx, z: lz, kind: 'lamp' }); grid[lz * W + lx] = 2; }
  }
  // barracas do mercado perto da mercadora e do ferreiro
  for (const [sx, sz, v] of [[cx + 9, cz - 9, 0.2], [cx + 10, cz - 6, 0.7], [cx - 9, cz - 8, 0.4]]) if (grid[sz * W + sx] === 1) { props.push({ x: sx, z: sz, kind: 'stall', v }); grid[sz * W + sx] = 2; }
  // forja do ferreiro, carroça, barris e caixotes
  props.push({ x: cx - 8, z: cz - 4, kind: 'anvil' });
  for (const [bx, bz] of [[cx - 10, cz - 7], [cx - 11, cz - 6], [cx + 8, cz - 11], [cx + 12, cz - 10], [cx - 14, cz + 4], [cx - 13, cz + 6], [cx + 4, cz - 13], [cx - 4, cz - 13]]) if (grid[bz * W + bx] === 1) props.push({ x: bx, z: bz, kind: 'barrel', v: rnd() });
  for (const [bx, bz] of [[cx - 11, cz - 8], [cx + 13, cz - 8], [cx - 15, cz + 5], [cx + 5, cz - 14]]) if (grid[bz * W + bx] === 1) props.push({ x: bx, z: bz, kind: 'crate', v: rnd() });
  if (grid[(cz + 4) * W + cx + 12] === 1) { props.push({ x: cx + 12, z: cz + 4, kind: 'cart' }); grid[(cz + 4) * W + cx + 12] = 2; }
  // cemitério (baixo, na frente-esquerda)
  for (let i = 0; i < 7; i++) { const gx = cx - 11 + (i % 4) * 2, gz = cz + 13 + Math.floor(i / 4) * 2; if (grid[gz * W + gx] === 1) props.push({ x: gx, z: gz, kind: 'grave', v: rnd() }); }
  // Torre Infinita na parte de baixo do mapa (frente, +x/+z), com o Guardião diante dela
  const tower = { x: cx + 11, z: cz + 11 };
  block(tower.x - 1, tower.z - 1, tower.x + 1, tower.z + 1);
  for (let i = props.length - 1; i >= 0; i--) if (Math.hypot(props[i].x - tower.x, props[i].z - tower.z) < 3.5) props.splice(i, 1);
  const npcs = [
    { id: 'tower', x: cx + 8, z: cz + 8 },
    { id: 'smith', x: cx - 7, z: cz - 6 },
    { id: 'merchant', x: cx + 6, z: cz - 7 },
    { id: 'portal', x: cx + 1, z: cz - 9 },
    { id: 'master', x: cx - 9, z: cz + 3 },
    { id: 'duel', x: cx - 5, z: cz + 9 },
  ];
  // garante que NPCs e portal estejam livres
  for (const n of npcs.concat([{ x: cx + 1, z: cz - 12 }, { x: cx + 1, z: cz + 4 }])) grid[n.z * W + n.x] = 1;
  return { W, H, grid, biome: 'town', floor: 0, seed: 1, start: { x: cx + 1, z: cz + 4 }, boss: null, props, spawns: [], breakables: [], npcs, portal: { x: cx + 1, z: cz - 12 }, tower, isPath };
}
