// ---------- rótulos sobre o mundo (loot, NPCs, portais, barras de vida) ----------
// Posicionados por `transform` (sem recalcular layout) e só reescritos quando mudam.
// A largura dos rótulos de loot é lida uma vez, numa fase de leitura antes das
// escritas do quadro, para não forçar reflow a cada item.
import { CONFIG } from '../core/config.js';
import { allPortals, G, S } from '../core/state.js';
import { overlay, toScreen } from '../engine/overlay.js';
import { mouse } from '../input/inputState.js';

/** Move/mostra um elemento de overlay, tocando no DOM só quando algo mudou. */
function place(el, cache, x, y, vis) {
  if (cache._vis !== vis) { el.style.display = vis ? '' : 'none'; cache._vis = vis; }
  if (!vis) return;
  x = Math.round(x); y = Math.round(y);
  if (cache._x === x && cache._y === y) return;
  cache._x = x; cache._y = y;
  el.style.transform = 'translate(' + x + 'px,' + y + 'px) ' + (cache._anchor || 'translate(-50%,-100%)');
}

const placed = [];
/** Rótulos de portal na tela (x, y da base, largura, altura): têm prioridade sobre os de loot. */
const blockers = [];
function updateLootLabels() {
  const showAll = S.settings.labels || G.showAllLabels;
  // fase de leitura: larguras ainda desconhecidas (rótulos recém-criados)
  for (const l of G.loot) if (!l.w) l.w = l.el.offsetWidth || 80;
  blockers.length = 0;
  if (G.loot.length) {
    for (const pt of allPortals()) {
      if (!pt.lw) { pt.lw = pt.label.offsetWidth || 120; pt.lh = pt.label.offsetHeight || 26; }
      const s = toScreen(pt.x, 4, pt.z);
      if (s.vis) blockers.push(s.x, s.y, pt.lw, pt.lh);
    }
  }
  placed.length = 0;
  const gap = CONFIG.overlay.labelGap;
  for (const l of G.loot) {
    const s = toScreen(l.x, 0.7, l.z);
    const vis = s.vis && (showAll || l.ord >= 2 || l.type === 'jewel');
    let y = s.y;
    if (vis) {
      // empilha rótulos que se sobrepõem; o rótulo do portal nunca fica coberto (o de loot passa para cima dele)
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < placed.length; i += 3) {
          if (Math.abs(placed[i] - s.x) < (placed[i + 2] + l.w) / 2 && Math.abs(placed[i + 1] - y) < gap - 1) y = placed[i + 1] - gap;
        }
        let moved = false;
        for (let i = 0; i < blockers.length; i += 4) {
          const bx = blockers[i], by = blockers[i + 1], bw = blockers[i + 2], bh = blockers[i + 3];
          if (Math.abs(bx - s.x) < (bw + l.w) / 2 && y > by - bh - 1 && y - gap < by) { y = by - bh - 2; moved = true; }
        }
        if (!moved) break;
      }
      placed.push(s.x, y, l.w);
    }
    place(l.el, l, s.x, y, vis);
  }
}

function updateNpcLabels() {
  for (const n of G.npcs) {
    const s = toScreen(n.x, (n.model.height || 2.2) + 0.5, n.z);
    place(n.label, n, s.x, s.y, s.vis);
  }
  for (const pt of allPortals()) {
    const s = toScreen(pt.x, 4, pt.z);
    place(pt.label, pt, s.x, s.y, s.vis);
  }
}

function barFor(m, named) {
  if (!m.bar) {
    const el = document.createElement('div');
    el.className = 'hpbar' + (m.elite ? ' elite' : '');
    el.innerHTML = '<i></i>';
    overlay.appendChild(el);
    m.bar = el;
    m.barFill = el.firstChild;
    m.barHp = -1;
    m._anchor = 'translate(-50%,-50%)';
    m._vis = m._x = m._y = undefined;
  }
  if (named && !m.barName) {
    m.barName = document.createElement('b');
    m.barName.textContent = m.name + ' · ' + m.level;
    m.bar.appendChild(m.barName);
  }
  return m.bar;
}
function updateMonsterBars() {
  for (const m of G.monsters) {
    const hover = mouse.hover === m;
    const show = !m.dead && !m.boss && (m.elite || m.mini || G.time - m.lastHit < 5 || hover);
    if (!show) {
      if (m.bar) { m.bar.remove(); m.bar = m.barFill = m.barName = null; }
      continue;
    }
    const bar = barFor(m, m.elite || m.mini || hover);
    const s = toScreen(m.x, m.model.height + 0.5, m.z);
    place(bar, m, s.x, s.y, s.vis);
    const pct = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
    if (pct !== m.barHp) { m.barHp = pct; m.barFill.style.width = pct + '%'; }
  }
}

export function updateOverlay() {
  updateLootLabels();
  updateNpcLabels();
  updateMonsterBars();
}
