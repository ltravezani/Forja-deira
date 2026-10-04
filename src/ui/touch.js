// ---------- telas de toque: botões extras, pinça para zoom, escala da interface e pausa com painel aberto ----------
// No celular/tablet (ponteiro "coarse") o HUD ganha a classe html.touch: as habilidades
// viram um bloco perto do polegar direito, as poções e os botões Coletar/Itens ficam
// perto do polegar esquerdo (ver shell.html, seção "toque"). No PC nada disso aparece.
import { CONFIG, uiScale } from '../core/config.js';
import { G } from '../core/state.js';
import { $, touchUI } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { CAM, canvas } from '../engine/renderer.js';
import { spacePickup } from '../game/loot.js';
import { mouse } from '../input/inputState.js';
import { setPaused } from './pause.js';

/** Aplica a escala da interface (Opções, 90–130%) no HUD, painel, diálogos e pausa. */
export function applyUiScale(settings) {
  document.documentElement.style.setProperty('--ui', String(uiScale(settings) / 100));
}

/**
 * No toque, fora da cidade, um painel ou diálogo cobrindo a tela segura a simulação
 * (o jogador não apanha sem ver). No PC, e na cidade, o jogo segue como sempre.
 */
export function panelHold() {
  if (!touchUI() || G.mode !== 'play' || G.zone === 'town' || !G.player || !G.player.alive) return false;
  return !$('#drawer').hidden || !$('#modal').hidden;
}
let heldShown = false;
/** Mostra/esconde o aviso "Jogo pausado" enquanto o painel segura a simulação. */
export function showHeld(on) {
  if (on === heldShown) return;
  heldShown = on;
  $('#heldNote').hidden = !on;
}

function markTouch() { document.documentElement.classList.toggle('touch', touchUI()); }

// ---------- pinça (dois dedos) para aproximar/afastar a câmera ----------
const pts = new Map();
let pinch = null;
const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
function pinchDown(e) {
  if (e.pointerType !== 'touch' || e.target !== canvas || G.mode !== 'play') return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size < 2) return;
  // segundo dedo: vira pinça (não anda nem ataca onde o segundo dedo tocou)
  e.stopImmediatePropagation();
  mouse.down = false;
  pinch = { d: spread(), zoom: CAM.zoom };
}
function pinchMove(e) {
  const p = pts.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (!pinch || pts.size < 2) return;
  const C = CONFIG.camera;
  // dedos se afastando aproximam (zoom menor = câmera mais perto, como a roda do mouse)
  CAM.zoom = Math.max(C.zoomMin, Math.min(C.zoomMax, pinch.zoom * pinch.d / spread()));
  mouse.down = false;
}
function pinchUp(e) {
  if (!pts.delete(e.pointerId)) return;
  if (pts.size < 2) pinch = null;
}

/** Botões de toque (pausa, Coletar, Itens), pinça e detecção de tela de toque. */
export function initTouch() {
  markTouch();
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(pointer: coarse)');
    if (mq.addEventListener) mq.addEventListener('change', markTouch);
  }
  window.addEventListener('pointerdown', pinchDown, true);
  window.addEventListener('pointermove', pinchMove, { passive: true });
  window.addEventListener('pointerup', pinchUp);
  window.addEventListener('pointercancel', pinchUp);
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); Sfx.init(); if (G.mode === 'play' && !G.paused) fn(e.currentTarget); });
  tap('#tbPick', () => spacePickup());
  tap('#tbItems', (b) => { G.showAllLabels = !G.showAllLabels; b.classList.toggle('on', G.showAllLabels); b.setAttribute('aria-pressed', String(G.showAllLabels)); });
  $('#btnPause').addEventListener('click', () => setPaused(true));
}
