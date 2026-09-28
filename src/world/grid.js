// ---------- utilidades de grade / pathfinding ----------
import { TILE } from '../core/util.js';

export function walkable(L, wx, wz) {
  const x = Math.round(wx / TILE), z = Math.round(wz / TILE);
  if (x < 0 || z < 0 || x >= L.W || z >= L.H) return false;
  return L.grid[z * L.W + x] === 1;
}
export function walkableR(L, wx, wz, r) {
  return walkable(L, wx - r, wz - r) && walkable(L, wx + r, wz - r) && walkable(L, wx - r, wz + r) && walkable(L, wx + r, wz + r);
}
export function lineClear(L, x0, z0, x1, z1, r) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / 0.5);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!walkableR(L, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r || 0)) return false;
  }
  return true;
}
/** A* em grade (8 direções, sem cortar quinas). Retorna lista de pontos do mundo. */
export function findPath(L, sx, sz, tx, tz, maxNodes) {
  const W = L.W, H = L.H, g = L.grid;
  const s = { x: Math.round(sx / TILE), z: Math.round(sz / TILE) };
  let t = { x: Math.round(tx / TILE), z: Math.round(tz / TILE) };
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && g[z * W + x] === 1;
  if (!ok(t.x, t.z)) {
    let best = null, bd = 1e9;
    for (let r = 1; r < 4 && !best; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (ok(t.x + dx, t.z + dz)) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { x: t.x + dx, z: t.z + dz }; } }
    }
    if (!best) return null;
    t = best;
  }
  if (!ok(s.x, s.z)) return [{ x: t.x * TILE, z: t.z * TILE }];
  const N = W * H;
  const PF = findPath.buf && findPath.buf.n === N ? findPath.buf : (findPath.buf = { n: N, gs: new Float32Array(N), fs: new Float32Array(N), from: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: new Int32Array(N * 4) });
  const gen = ++PF.gen;
  const { gs, fs, from, stamp, closed, heap } = PF;
  const G_ = (i) => (stamp[i] === gen ? gs[i] : 1e9);
  // heap binária de índices ordenada por fs
  let hn = 0;
  const hpush = (i) => {
    if (hn >= heap.length) return;
    let k = hn++; heap[k] = i;
    while (k > 0) { const p = (k - 1) >> 1; if (fs[heap[p]] <= fs[heap[k]]) break; const t0 = heap[p]; heap[p] = heap[k]; heap[k] = t0; k = p; }
  };
  const hpop = () => {
    const top = heap[0]; heap[0] = heap[--hn];
    let k = 0;
    for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && fs[heap[l]] < fs[heap[m]]) m = l; if (r < hn && fs[heap[r]] < fs[heap[m]]) m = r; if (m === k) break; const t0 = heap[m]; heap[m] = heap[k]; heap[k] = t0; k = m; }
    return top;
  };
  const hfn = (i) => { const x = i % W, z = (i - x) / W; const dx = Math.abs(x - t.x), dz = Math.abs(z - t.z); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const s0 = s.z * W + s.x, goal = t.z * W + t.x;
  stamp[s0] = gen; gs[s0] = 0; fs[s0] = hfn(s0); from[s0] = -1;
  hpush(s0);
  // se o destino for inalcançável, anda até o ponto explorado mais próximo dele
  let best = s0, bestH = fs[s0];
  let iter = 0, found = false;
  const limit = maxNodes || 24000;
  while (hn && iter++ < limit) {
    const cur = hpop();
    if (closed[cur] === gen) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = gen;
    const hc = fs[cur] - gs[cur];
    if (hc < bestH) { bestH = hc; best = cur; }
    const cx = cur % W, cz = (cur - cx) / W;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!ok(nx, nz)) continue;
      if (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz))) continue;
      const ni = nz * W + nx;
      if (closed[ni] === gen) continue;
      const ng = gs[cur] + (dx && dz ? 1.414 : 1);
      if (ng < G_(ni)) {
        stamp[ni] = gen; gs[ni] = ng; fs[ni] = ng + hfn(ni); from[ni] = cur;
        hpush(ni);
      }
    }
  }
  const end = found ? goal : best;
  if (end === s0) return found ? [] : null;
  const pts = [];
  for (let c = end; c !== -1 && c !== s0; c = from[c]) { const x = c % W; pts.push({ x: x * TILE, z: ((c - x) / W) * TILE }); }
  pts.reverse();
  // suaviza (string pulling)
  const out = [];
  let ax = sx, az = sz, i = 0;
  while (i < pts.length) {
    // janela limitada: puxar a corda contra o caminho inteiro é O(n²) em mapas 256×256
    let j = Math.min(pts.length - 1, i + 28);
    while (j > i && !lineClear(L, ax, az, pts[j].x, pts[j].z, 0.45)) j--;
    out.push(pts[j]);
    ax = pts[j].x; az = pts[j].z; i = j + 1;
  }
  if (found && out.length && walkable(L, tx, tz)) { out[out.length - 1] = { x: tx, z: tz }; }
  return out;
}

/** Altura do chão. Os níveis procedurais são planos. */
export function gy() { return 0; }
