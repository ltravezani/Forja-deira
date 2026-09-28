// ---------- ações dos painéis (cliques delegados por data-act) ----------
import { applyFeelSettings, CONFIG } from '../core/config.js';
import { G, LEGACY_SAVE_KEYS, persist, S, SAVE_KEY, UI } from '../core/state.js';
import { $, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { applyQuality, resetCamera, setOutline } from '../engine/renderer.js';
import { sendPetToSell } from '../game/allies.js';
import { onLevelUp } from '../game/combat.js';
import { addToBag, autoEquip, autoEquipOn, bagCat, equipFromBag, unequipSlot, usePotion } from '../game/inventory.js';
import { recalc } from '../game/player.js';
import { returnToTitle } from '../game/session.js';
import { Drag } from './dragdrop.js';
import { renderPane } from './drawer.js';
import { buildSlots, hudTick } from './hud.js';
import { selectedItem } from './inventoryPane.js';
import { log } from './log.js';

function paneAction(e) {
  if (Drag.eatClick) { Drag.eatClick = false; return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act, ch = G.ch;
  const it = selectedItem();
  switch (a) {
    case 'stat': { const n = Math.min(+b.dataset.n, ch.points); ch.stats[b.dataset.k] += n; ch.points -= n; recalc(); if (autoEquipOn()) G.autoEqT = 0.3; break; }
    case 'auto': R.autoDistribute(ch, ch.points); recalc(); if (autoEquipOn()) G.autoEqT = 0.3; break;
    case 'seleq': {
      const now = performance.now(), k = 'e' + b.dataset.slot;
      if (UI.lastCell && UI.lastCell.k === k && now - UI.lastCell.t < CONFIG.input.doubleClickMs) { UI.lastCell = null; if (unequipSlot(b.dataset.slot)) UI.sel = null; break; }
      UI.lastCell = { k, t: now };
      UI.sel = { where: 'eq', slot: b.dataset.slot };
      break;
    }
    case 'selbag': {
      const i = +b.dataset.i, now = performance.now();
      if (UI.lastCell && UI.lastCell.k === 'b' + i && now - UI.lastCell.t < CONFIG.input.doubleClickMs && ch.bag[i] && ch.bag[i].slot) { UI.lastCell = null; UI.sel = { where: 'bag', idx: i }; equipFromBag(i); break; }
      UI.lastCell = { k: 'b' + i, t: now };
      UI.sel = ch.bag[i] ? { where: 'bag', idx: i } : null;
      break;
    }
    case 'bagf': UI.bagFilter = b.dataset.k; UI.sel = null; break;
    case 'aeqtoggle': S.settings.autoEquip = !autoEquipOn(); if (autoEquipOn()) autoEquip(true); persist(); break;
    case 'aeqnow': autoEquip(true); break;
    case 'equip': if (it && it.slot && UI.sel.where === 'bag') equipFromBag(UI.sel.idx); break;
    case 'unequip': if (UI.sel && UI.sel.where === 'eq' && unequipSlot(UI.sel.slot)) UI.sel = null; break;
    case 'usepot': usePotion(it.id); break;
    case 'sell': ch.zen += Math.floor(R.itemValue(it) * 0.5) * (it.qty && it.kind !== 'jewel' ? 1 : 1); ch.bag.splice(UI.sel.idx, 1); UI.sel = null; Sfx.coin(); break;
    case 'drop': ch.bag.splice(UI.sel.idx, 1); UI.sel = null; break;
    case 'petsell': sendPetToSell(); break;
    case 'sortbag': { const co = { mine: 0, other: 1, mat: 2 }; ch.bag.sort((x, y) => co[bagCat(x)] - co[bagCat(y)] || R.itemCP(y) - R.itemCP(x) || (x.kind || '').localeCompare(y.kind || '')); UI.sel = null; break; }
    case 'bar': if (ch.skillBar.length < 6) ch.skillBar.push(b.dataset.id); buildSlots(); break;
    case 'unbar': ch.skillBar.splice(ch.skillBar.indexOf(b.dataset.id), 1); buildSlots(); break;
    case 'node': ch.tree[b.dataset.id] = (ch.tree[b.dataset.id] || 0) + 1; recalc(); break;
    case 'toggleSound': S.settings.sound = !S.settings.sound; Sfx.on = S.settings.sound; break;
    case 'toggleLabels': S.settings.labels = !S.settings.labels; break;
    case 'toggleOutline': S.settings.outline = S.settings.outline === false; setOutline(S.settings.outline); break;
    case 'cycleShake': { const cur = S.settings.shake == null ? 1 : S.settings.shake; S.settings.shake = cur === 1 ? 0.5 : cur === 0.5 ? 0 : 1; applyFeelSettings(S.settings); break; }
    case 'toggleHitStop': S.settings.hitStop = S.settings.hitStop === false; applyFeelSettings(S.settings); break;
    case 'toggleAutoPause': S.settings.autoPause = S.settings.autoPause === false; break;
    case 't-lvl': { const before = ch.level; const tgt = Math.min(R.RATES.maxLevel, ch.level + 100); while (ch.level < tgt) R.gainExp(ch, R.expToNext(ch.level) - ch.exp); onLevelUp(before); break; }
    case 't-zen': ch.zen += 5e6; break;
    case 't-leg': { const x = R.makeEquip(R.hash32('teste', Date.now()), Math.max(20, ch.level), 'lendario', ch.cls, 0, 'boss'); addToBag(x); log('Gerado: ' + R.itemName(x), 'loot'); break; }
    case 't-jew': ['bless', 'soul', 'chaos', 'life'].forEach((j) => addToBag({ kind: 'jewel', id: j, qty: 10, uid: 'j' + j })); break;
    case 't-boss': ch.bossKills += 5; break;
    case 'camreset': resetCamera(); break;
    case 'quit': returnToTitle(); return;
    case 'wipe': if (!UI.confirmWipe) { UI.confirmWipe = true; break; } try { localStorage.removeItem(SAVE_KEY); LEGACY_SAVE_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* */ } location.reload(); return;
  }
  persist();
  renderPane();
  hudTick();
}


/** Cliques, botão direito e opções dentro do painel lateral. */
export function initPaneActions() {
  $('#pane').addEventListener('click', paneAction);
  // Botão direito equipa/desequipa (como no MU); arrastar move entre mochila e equipamento.
  $('#pane').addEventListener('contextmenu', (e) => {
    const c = e.target.closest('[data-act="selbag"],[data-act="seleq"]');
    if (!c) return;
    e.preventDefault();
    if (c.dataset.act === 'selbag') { const i = +c.dataset.i; if (G.ch.bag[i] && G.ch.bag[i].slot) { UI.sel = { where: 'bag', idx: i }; equipFromBag(i); } }
    else if (unequipSlot(c.dataset.slot)) UI.sel = null;
    renderPane();
  });

  $('#pane').addEventListener('change', (e) => { if (e.target.id === 'qualSel') { S.settings.quality = e.target.value; applyQuality(e.target.value); persist(); } });
}
