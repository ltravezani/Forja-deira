// ---------- entrada: mouse, roda e teclado durante o jogo ----------
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { $ } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { CAM, canvas, resetCamera } from '../engine/renderer.js';
import { sendPetToSell } from '../game/allies.js';
import { usePotion } from '../game/inventory.js';
import { spacePickup } from '../game/loot.js';
import { townPortal } from '../game/player.js';
import { requestCast } from '../game/skills.js';
import { tryDodge } from '../game/dodge.js';
import { KEYS, mouse } from './inputState.js';
import { clickWorld, pickMonster, screenToGround } from './picking.js';
import { closeDrawer, openTab } from '../ui/drawer.js';
import { closeItemPopups } from '../ui/itemTooltip.js';
import { closeBigMap, toggleBigMap } from '../ui/minimap.js';
import { closeModal } from '../ui/npcDialogs.js';
import { togglePause } from '../ui/pause.js';

/** Teclas de movimento (WASD e setas) → direção em KEYS. */
const MOVE = { w: 'w', arrowup: 'w', s: 's', arrowdown: 's', a: 'a', arrowleft: 'a', d: 'd', arrowright: 'd' };
/** Atalhos simples: tecla → ação. */
const ACTIONS = {
  q: () => usePotion('hp'),
  e: () => usePotion('mp'),
  t: townPortal,
  p: sendPetToSell,
  c: () => openTab('char'),
  i: () => openTab('inv'),
  k: () => openTab('skills'),
  l: () => openTab('loot'),
  o: () => openTab('opts'),
  m: toggleBigMap,
  home: resetCamera,
};

/** Habilidade no ponto sob o cursor (ou no monstro sob ele). */
function castAtCursor(slot) {
  const m = pickMonster(mouse.x, mouse.y);
  const g = m ? null : screenToGround(mouse.x, mouse.y);
  requestCast(slot, m ? m.x : g && g.x, m ? m.z : g && g.z);
}

function onPointerDown(e) {
  if (G.mode !== 'play' || G.paused) return;
  Sfx.init();
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 2) { castAtCursor(G.selectedSlot); return; }
  if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
    mouse.orbit = { x: e.clientX, y: e.clientY, yaw: CAM.yaw, pitch: CAM.pitch };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  mouse.down = true;
  mouse.lastRepath = G.time;
  if (e.shiftKey) { const m = pickMonster(e.clientX, e.clientY); if (m) { G.player.target = { type: 'mon', m }; return; } }
  clickWorld(e.clientX, e.clientY, false);
}

function onPointerMove(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.moved = true; // o monstro sob o cursor é recalculado uma vez por quadro (picking.updateHover)
  if (!mouse.orbit) return;
  // câmera livre com limites (não passa do chão nem fica de cima para baixo)
  const C = CONFIG.camera;
  CAM.yaw = mouse.orbit.yaw - (e.clientX - mouse.orbit.x) * C.orbitYaw;
  CAM.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, mouse.orbit.pitch + (e.clientY - mouse.orbit.y) * C.orbitPitch));
}

function onWheel(e) {
  const C = CONFIG.camera;
  CAM.zoom = Math.max(C.zoomMin, Math.min(C.zoomMax, CAM.zoom + Math.sign(e.deltaY) * C.zoomStep));
  e.preventDefault();
}

function onEscape() {
  // herói caído: a tela de queda só fecha pelos botões (Renascer/Ressurreição)
  if (!$('#modal').hidden) { if (G.player && G.player.alive) closeModal(); }
  else if (closeItemPopups()) { /* Esc fecha primeiro o menu ou os detalhes do item */ }
  else if (closeBigMap()) { /* depois o mapa ampliado */ }
  else if (!$('#drawer').hidden) closeDrawer();
  else togglePause();
}

function onKeyDown(e) {
  if (G.mode !== 'play') return;
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { if (e.key === 'Escape') a.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'escape') { onEscape(); return; }
  if (G.paused) return;
  if (k >= '1' && k <= '6') { castAtCursor(+k - 1); return; }
  if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (a && a.blur) a.blur(); // evita "clicar" o botão focado com a barra de espaço
    if (!e.repeat || G.time - (G.lastSpace || 0) > CONFIG.loot.spaceRepeat) { G.lastSpace = G.time; spacePickup(); }
    return;
  }
  if (k === 'shift') { if (!e.repeat) tryDodge(true); return; } // esquiva para o cursor (ou para as teclas de movimento)
  if (MOVE[k]) { KEYS[MOVE[k]] = true; return; }
  if (k === 'alt') { G.showAllLabels = true; e.preventDefault(); return; }
  // poções repetem ao segurar (a recarga de 0,5 s limita); painéis e portal não
  if (ACTIONS[k] && (!e.repeat || k === 'q' || k === 'e')) ACTIONS[k]();
}

function onKeyUp(e) {
  if (e.key === 'Alt') G.showAllLabels = false;
  const dir = MOVE[e.key.toLowerCase()];
  if (dir) KEYS[dir] = false;
}

/** Solta tudo ao perder o foco (evita tecla "presa" ao voltar). */
function releaseAll() {
  G.showAllLabels = false;
  mouse.down = false; mouse.orbit = null;
  KEYS.w = KEYS.a = KEYS.s = KEYS.d = false;
}

/** Registra os ouvintes de entrada do jogo (uma única vez, no boot). */
export function initInput() {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', () => { mouse.down = false; mouse.orbit = null; });
  window.addEventListener('pointercancel', () => { mouse.down = false; mouse.orbit = null; });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
}
