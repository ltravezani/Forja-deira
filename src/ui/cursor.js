// Cursor medieval desenhado pelo jogo: sempre visível (o sistema pode esconder o
// ponteiro enquanto teclas são pressionadas, ex.: WASD/1–6 no Linux).
import { canvas } from '../engine/renderer.js';
import { mouse } from '../input/inputState.js';

export const MCUR = { el: document.getElementById('mcur'), mode: '' };
function mcurMode(t) {
  if (!t || !t.closest) return '';
  if (t.closest('input, textarea')) return 'text';
  if (t.closest('button:not([disabled]), [data-act], .label, a, select, .slot, .cell, .cls')) return 'hand';
  if (t === canvas && mouse.hover) return 'atk';
  return '';
}
export function mcurSet(m) {
  if (m === MCUR.mode) return;
  MCUR.mode = m;
  MCUR.el.className = m === 'text' ? '' : m;
  MCUR.el.style.visibility = m === 'text' ? 'hidden' : '';
}
/** Liga o cursor desenhado pelo jogo (uma única vez, no boot). */
export function initCursor() {
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') { document.documentElement.classList.remove('swcur'); return; }
    document.documentElement.classList.add('swcur');
    MCUR.el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    MCUR.x = e.clientX; MCUR.y = e.clientY;
    mcurSet(mcurMode(e.target));
  }, { passive: true });
  document.addEventListener('mouseleave', () => (MCUR.el.style.visibility = 'hidden'));
  document.addEventListener('mouseenter', () => (MCUR.el.style.visibility = ''));
  window.addEventListener('blur', () => (MCUR.el.style.visibility = 'hidden'));
  window.addEventListener('focus', () => (MCUR.el.style.visibility = ''));
}
