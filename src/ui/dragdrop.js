// ---------- arrastar e soltar itens entre mochila e equipamento ----------
import { CONFIG } from '../core/config.js';
import { G, UI } from '../core/state.js';
import { $ } from '../core/util.js';
import { equipFromBag, unequipSlot } from '../game/inventory.js';
import { renderPane } from './drawer.js';
import { ContextMenu } from './itemTooltip.js';

export const Drag = { on: false, src: null, x0: 0, y0: 0, ghost: null, eatClick: false, eatUntil: 0, lp: 0 };
/** Toque prolongado (sem arrastar) abre o menu de contexto do item. */
const LONG_PRESS_MS = 520;
function cancelLongPress() { clearTimeout(Drag.lp); Drag.lp = 0; }
function dropTarget(x, y, src) {
  src = src || Drag.src;
  const el = document.elementFromPoint(x, y);
  if (!el || !src) return null;
  if (src.where === 'bag') return el.closest('#paper');
  return el.closest('#bagGrid');
}
/** Arrastar itens entre mochila e equipamento. */
export function initDragDrop() {
  $('#pane').addEventListener('pointerdown', (e) => {
    UI.ptr = true;
    if (e.button !== 0) return;
    const c = e.target.closest('[data-act="selbag"],[data-act="seleq"]');
    if (!c) return;
    Drag.src = c.dataset.act === 'selbag' ? { where: 'bag', idx: +c.dataset.i } : { where: 'eq', slot: c.dataset.slot };
    Drag.x0 = e.clientX; Drag.y0 = e.clientY; Drag.el = c;
    cancelLongPress();
    if (e.pointerType !== 'mouse') {
      const src = Drag.src, x = e.clientX, y = e.clientY;
      Drag.lp = setTimeout(() => {
        Drag.lp = 0;
        if (Drag.on || Drag.src !== src) return;
        Drag.src = null;
        if (ContextMenu.open(src, x, y)) { Drag.eatUntil = performance.now() + 900; renderPane(); }
      }, LONG_PRESS_MS);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!Drag.src) return;
    if (!Drag.on) {
      if (Math.hypot(e.clientX - Drag.x0, e.clientY - Drag.y0) < CONFIG.input.dragThreshold) return;
      cancelLongPress();
      Drag.on = true;
      UI.tipOpen = false;
      const g = Drag.el.cloneNode(true);
      g.className += ' ghost';
      const r = Drag.el.getBoundingClientRect();
      g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      document.body.appendChild(g);
      Drag.ghost = g;
      Drag.el.classList.add('dragging');
    }
    Drag.ghost.style.left = e.clientX - 20 + 'px'; Drag.ghost.style.top = e.clientY - 20 + 'px';
    document.querySelectorAll('.droptgt').forEach((n) => n.classList.remove('droptgt'));
    const t = dropTarget(e.clientX, e.clientY);
    if (t) t.classList.add('droptgt');
  });
  window.addEventListener('pointercancel', () => { cancelLongPress(); });
  window.addEventListener('pointerup', (e) => {
    UI.ptr = false;
    cancelLongPress();
    if (!Drag.src) return;
    const src = Drag.src, was = Drag.on;
    Drag.src = null;
    if (!was) return;
    Drag.on = false;
    if (Drag.ghost) Drag.ghost.remove();
    Drag.ghost = null;
    document.querySelectorAll('.droptgt').forEach((n) => n.classList.remove('droptgt'));
    Drag.eatClick = true; setTimeout(() => (Drag.eatClick = false), 0);
    const t = dropTarget(e.clientX, e.clientY, src);
    if (t) {
      if (src.where === 'bag') { if (G.ch.bag[src.idx] && G.ch.bag[src.idx].slot) { UI.sel = { where: 'bag', idx: src.idx }; equipFromBag(src.idx); } }
      else if (unequipSlot(src.slot)) UI.sel = null;
    }
    renderPane();
  });
}
