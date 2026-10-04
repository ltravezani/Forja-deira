// ---------- seleção no mundo: tela → chão, monstro, NPC, portal, barril ----------
import { allPortals, G } from '../core/state.js';
import { V3 } from '../core/util.js';
import { spawnRing } from '../engine/effects.js';
import { toScreen } from '../engine/overlay.js';
import { camera } from '../engine/renderer.js';
import { pathTo } from '../game/movement.js';
import { targetNpc } from '../game/npcs.js';
import { cancelChannel } from '../game/player.js';
import { mouse } from './inputState.js';
import { MCUR, mcurSet } from '../ui/cursor.js';
import { gy } from '../world/grid.js';

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new V3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
/** Ponto do chão sob a posição de tela (px). Devolve um vetor novo (o chamador pode guardá-lo). */
export function screenToGround(sx, sy) {
  ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new V3();
  // terreno com relevo: duas passadas contra um plano na altura local
  groundPlane.constant = -(G.player ? gy(G.player.x, G.player.z) : 0);
  if (!raycaster.ray.intersectPlane(groundPlane, p)) return null;
  return p;
}

/** Monstro vivo mais próximo do ponto de tela (raio de 44 px; 90 px para chefes). */
export function pickMonster(sx, sy) {
  let best = null, bd = 44 * 44;
  for (const m of G.monsters) {
    if (m.dead) continue;
    const s = toScreen(m.x, m.model.height * 0.5, m.z);
    if (!s.vis) continue;
    const rr = m.boss ? 90 : 44;
    const d = (s.x - sx) ** 2 + (s.y - sy) ** 2;
    if (d < rr * rr && d < bd) { bd = d; best = m; }
  }
  return best;
}
function pickNpc(sx, sy) {
  let best = null, bd = 50 * 50;
  for (const n of G.npcs) {
    const s = toScreen(n.x, 1.2, n.z);
    const d = (s.x - sx) ** 2 + (s.y - sy) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function pickBreakable(sx, sy) {
  for (const b of G.breakables) {
    if (b.broken) continue;
    const s = toScreen(b.x, 0.5, b.z);
    if ((s.x - sx) ** 2 + (s.y - sy) ** 2 < 32 * 32) return b;
  }
  return null;
}
/** Clique no mundo: monstro > portal > NPC > barril > chão. `fromHold` = botão segurado (só persegue/anda). */
export function clickWorld(sx, sy, fromHold) {
  const p = G.player;
  if (!p.alive) return;
  const m = pickMonster(sx, sy);
  if (m) { p.target = { type: 'mon', m }; p.path = null; return; }
  if (fromHold && p.target && p.target.type === 'mon') return;
  if (!fromHold) {
    for (const pt of allPortals()) {
      const s = toScreen(pt.x, 1.8, pt.z);
      if ((s.x - sx) ** 2 + (s.y - sy) ** 2 < 60 * 60) { p.target = { type: 'portal', p: pt }; pathTo(pt.x, pt.z); return; }
    }
    const n = G.npcs.length && pickNpc(sx, sy);
    if (n) { targetNpc(n); return; }
    const b = pickBreakable(sx, sy);
    if (b) { p.target = { type: 'barrel', b }; pathTo(b.x, b.z); return; }
  }
  const g = screenToGround(sx, sy);
  if (!g) return;
  p.target = null;
  cancelChannel();
  pathTo(g.x, g.z);
  if (!fromHold) spawnRing(g.x, g.z, 0.9, 0.2, 0xffe0a0, 0.35);
}

/** Atualiza o monstro sob o cursor (1× por quadro, não a cada pointermove) e o cursor de ataque. */
// toque não tem cursor pairando: a busca de monstro sob o último toque roda a ~4 vezes por segundo
let touchOnly = false, touchT = 0;
if (typeof window === 'object') {
  window.addEventListener('pointerdown', (e) => { touchOnly = e.pointerType === 'touch'; }, { capture: true, passive: true });
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') touchOnly = false; }, { capture: true, passive: true });
}
export function updateHover() {
  if (G.paused) return;
  if (touchOnly) { const now = performance.now(); if (now - touchT < 250) return; touchT = now; }
  const m = pickMonster(mouse.x, mouse.y);
  if (m === mouse.hover) return;
  mouse.hover = m;
  if (MCUR.mode === '' || MCUR.mode === 'atk') mcurSet(m ? 'atk' : '');
}
