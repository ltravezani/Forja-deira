// ---------- movimento: caminhos, passos com colisão e giro suave ----------
import { G } from '../core/state.js';
import { findPath, lineClear, walkable, walkableR } from '../world/grid.js';

/** Caminho do jogador até (x, z): reta se o caminho estiver livre, senão A*. */
export function pathTo(x, z) {
  const p = G.player;
  if (!G.L) return;
  if (lineClear(G.L, p.x, p.z, x, z, 0.45)) { p.path = walkable(G.L, x, z) ? [{ x, z }] : (findPath(G.L, p.x, p.z, x, z) || null); return; }
  p.path = findPath(G.L, p.x, p.z, x, z);
}
/**
 * Anda em linha reta até (tx, tz) respeitando o raio de colisão `r`; se bater de
 * frente, desliza ao longo da parede (tenta cada eixo). Devolve true ao chegar
 * ou se ficou totalmente bloqueado.
 */
export function stepToward(e, tx, tz, speed, dt, r) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const s = Math.min(d, speed * dt);
  const nx = e.x + (dx / d) * s, nz = e.z + (dz / d) * s;
  const L = G.L;
  let moved = false;
  if (walkableR(L, nx, nz, r)) { e.x = nx; e.z = nz; moved = true; }
  else {
    if (walkableR(L, nx, e.z, r)) { e.x = nx; moved = true; }
    if (walkableR(L, e.x, nz, r)) { e.z = nz; moved = true; }
  }
  if (!moved && r > 0.5) return stepToward(e, tx, tz, speed, dt, 0.5); // corpo largo encostado: tenta com raio menor
  e.rotTarget = Math.atan2(dx, dz);
  e.moving = moved;
  return d <= s + 0.02 || !moved;
}
export function turn(e, dt, rate) {
  if (e.rotTarget == null) return;
  let d = e.rotTarget - e.rot;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  e.rot += d * Math.min(1, dt * (rate || 14));
}
export function playerSpeed() {
  return G.st.moveSpeed;
}
/**
 * Segue o caminho gastando todo o deslocamento do quadro: ao chegar num ponto,
 * o que sobrou continua em direção ao próximo (sem micro-paradas nas curvas).
 */
export function followPath(e, speed, dt, r) {
  let budget = speed * dt, moved = false, guard = 0;
  while (e.path && e.path.length && budget > 1e-4 && guard++ < 8) {
    const n = e.path[0];
    const d = Math.hypot(n.x - e.x, n.z - e.z);
    if (d < 0.05) { e.path.shift(); continue; }
    const step = Math.min(d, budget);
    stepToward(e, n.x, n.z, step / dt, dt, r);
    if (!e.moving) { e.path.shift(); break; } // bloqueado: desiste deste ponto
    moved = true;
    budget -= step;
    if (step >= d - 1e-4) e.path.shift();
  }
  e.moving = moved;
  if (e.path && !e.path.length) e.path = null;
  return moved;
}
export function face(e, x, z) { e.rotTarget = Math.atan2(x - e.x, z - e.z); }
