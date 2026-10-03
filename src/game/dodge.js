// ---------- esquiva: passo curto com invulnerabilidade (Shift no PC, botão no toque) ----------
// Direção: teclas de movimento, se houver; senão o cursor (PC) ou o caminho que o
// herói segue (toque); por último, para onde ele está virado. Para na parede: o
// passo é testado com o raio do herói, como os empurrões das habilidades.
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { CAM } from '../engine/renderer.js';
import { afterimage } from '../engine/skillfx.js';
import { KEYS, mouse } from '../input/inputState.js';
import { screenToGround } from '../input/picking.js';
import { cancelChannel } from './player.js';
import { walkableR } from '../world/grid.js';

/** Segundos até a esquiva voltar (0 = pronta). */
export function dodgeLeft() {
  const p = G.player;
  return p ? Math.max(0, (p.dodgeReadyAt || 0) - G.time) : 0;
}
/** Direção da esquiva (vetor unitário) ou null. */
function dodgeDir(p, useCursor) {
  let dx = 0, dz = 0;
  if (KEYS.any()) {
    const fx = -Math.sin(CAM.yaw), fz = -Math.cos(CAM.yaw);
    if (KEYS.w) { dx += fx; dz += fz; }
    if (KEYS.s) { dx -= fx; dz -= fz; }
    if (KEYS.a) { dx += fz; dz -= fx; }
    if (KEYS.d) { dx -= fz; dz += fx; }
  }
  if (!dx && !dz && useCursor) {
    const g = screenToGround(mouse.x, mouse.y);
    if (g) { dx = g.x - p.x; dz = g.z - p.z; }
  }
  if ((!dx && !dz) || Math.hypot(dx, dz) < 0.3) {
    const n = p.path && p.path[0];
    if (n && Math.hypot(n.x - p.x, n.z - p.z) > 0.3) { dx = n.x - p.x; dz = n.z - p.z; }
    else { dx = Math.sin(p.rot); dz = Math.cos(p.rot); }
  }
  const l = Math.hypot(dx, dz);
  return l ? { x: dx / l, z: dz / l } : null;
}
/**
 * Tenta esquivar. `useCursor`: no PC, a direção segue o cursor quando não há
 * tecla de movimento. Cancela a canalização do portal e interrompe a trava de
 * habilidade leve (não a investida nem o salto). Devolve true se esquivou.
 */
export function tryDodge(useCursor) {
  const p = G.player, C = CONFIG.dodge;
  if (G.mode !== 'play' || G.paused || !p || !p.alive || p.dodge || p.dash || p.hop) return false;
  if (G.time < (p.dodgeReadyAt || 0)) return false;
  const dir = dodgeDir(p, useCursor);
  if (!dir) return false;
  cancelChannel();
  p.dodge = { t: 0, dur: C.dur, dist: C.dist, dx: dir.x, dz: dir.z, ghost: 0 };
  p.dodgeReadyAt = G.time + C.cd;
  p.invulnUntil = Math.max(p.invulnUntil || 0, G.time + C.invuln);
  p.path = null; p.target = null; p.lockUntil = 0; p.castFace = null;
  p.rot = p.rotTarget = Math.atan2(dir.x, dir.z);
  emit(p.x, 0.2, p.z, { n: 14, color: 0xd8c8a8, speed: 3, up: 0.6, life: 0.45, size: 0.9, spread: 0.6 });
  Sfx.swing();
  return true;
}
/** Deslocamento da esquiva (rápido no começo, freia no fim); para ou desliza na parede. */
export function updateDodge(p, dt) {
  const d = p.dodge;
  const k0 = Math.min(1, d.t / d.dur);
  d.t += dt;
  const k1 = Math.min(1, d.t / d.dur);
  const ease = (k) => 1 - (1 - k) * (1 - k);
  const step = d.dist * (ease(k1) - ease(k0));
  const r = CONFIG.player.radius, nx = p.x + d.dx * step, nz = p.z + d.dz * step;
  if (walkableR(G.L, nx, nz, r)) { p.x = nx; p.z = nz; }
  else if (walkableR(G.L, nx, p.z, r)) p.x = nx;
  else if (walkableR(G.L, p.x, nz, r)) p.z = nz;
  else d.t = d.dur; // parede de frente: termina aqui
  if (d.t - d.ghost > 0.05 && k1 < 0.85) { d.ghost = d.t; afterimage(p.x, p.z, p.rot, 0xcfd8ff, 0.25); }
  if (d.t >= d.dur) p.dodge = null;
}
