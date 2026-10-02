// ---------- ações dos painéis (cliques delegados por data-act) ----------
import { applyCharSetting, gltfEnabled } from '../art/gltfModels.js';
import { forgetCloudLocal } from '../core/cloud.js';
import { applyFeelSettings, CONFIG } from '../core/config.js';
import { G, persist, S, SAVE_KEY, UI } from '../core/state.js';
import { $, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { Music, MUSIC_LEVELS, musicLevel } from '../engine/music.js';
import { applyQuality, bloomOn, resetCamera, setBloom, setOutline } from '../engine/renderer.js';
import { sendPetToSell } from '../game/allies.js';
import { toggleAutoSkill } from '../game/automation.js';
import { autoEquip, autoEquipOn, bagCat, equipFromBag, unequipSlot, usePotion } from '../game/inventory.js';
import { buildPlayerModel, recalc } from '../game/player.js';
import { returnToTitle } from '../game/session.js';
import { Drag } from './dragdrop.js';
import { renderPane } from './drawer.js';
import { buildSlots, hudTick } from './hud.js';
import { ContextMenu, drinkable, ItemTooltip, selectedItem } from './itemTooltip.js';

function paneAction(e) {
  if (Drag.eatClick) { Drag.eatClick = false; return; }
  // o toque longo já abriu o menu de contexto: ignora o clique que vem junto
  if (performance.now() < Drag.eatUntil) { Drag.eatUntil = 0; return; }
  const b = e.target.closest('[data-act]');
  ContextMenu.close();
  if (!b) {
    // clique no vazio do inventário: tira a seleção (e fecha os detalhes)
    if (UI.tab === 'inv' && UI.sel && e.currentTarget.id === 'pane' && !e.target.closest('#charPv,.cell.none')) { UI.sel = null; renderPane(); }
    return;
  }
  if (b.disabled) return;
  const a = b.dataset.act, ch = G.ch;
  const it = selectedItem();
  switch (a) {
    case 'stat': { const n = Math.min(+b.dataset.n, ch.points); ch.stats[b.dataset.k] += n; ch.points -= n; recalc(); if (autoEquipOn()) G.autoEqT = 0.3; break; }
    case 'auto': R.autoDistribute(ch, ch.points); recalc(); if (autoEquipOn()) G.autoEqT = 0.3; break;
    case 'seleq': {
      const now = performance.now(), k = 'e' + b.dataset.slot;
      if (UI.lastCell && UI.lastCell.k === k && now - UI.lastCell.t < CONFIG.input.doubleClickMs) { UI.lastCell = null; UI.tipOpen = false; if (unequipSlot(b.dataset.slot)) UI.sel = null; break; }
      UI.lastCell = { k, t: now };
      UI.sel = { where: 'eq', slot: b.dataset.slot };
      ItemTooltip.open(true);
      break;
    }
    case 'selbag': {
      const i = +b.dataset.i, now = performance.now();
      if (UI.lastCell && UI.lastCell.k === 'b' + i && now - UI.lastCell.t < CONFIG.input.doubleClickMs && ch.bag[i] && ch.bag[i].slot) { UI.lastCell = null; UI.tipOpen = false; UI.sel = { where: 'bag', idx: i }; equipFromBag(i); break; }
      // clique duplo numa poção: bebe direto do inventário
      if (UI.lastCell && UI.lastCell.k === 'b' + i && now - UI.lastCell.t < CONFIG.input.doubleClickMs && drinkable(ch.bag[i])) { UI.lastCell = null; UI.tipOpen = false; usePotion(ch.bag[i].id); UI.sel = ch.bag[i] ? { where: 'bag', idx: i } : null; break; }
      UI.lastCell = { k: 'b' + i, t: now };
      UI.sel = ch.bag[i] ? { where: 'bag', idx: i } : null;
      if (UI.sel) ItemTooltip.open(true);
      break;
    }
    case 'bagf': UI.bagFilter = b.dataset.k; UI.sel = null; break;
    case 'aeqtoggle': S.settings.autoEquip = !autoEquipOn(); if (autoEquipOn()) autoEquip(true); persist(); break;
    case 'aeqnow': autoEquip(true); break;
    case 'equip': if (it && it.slot && UI.sel.where === 'bag') equipFromBag(UI.sel.idx); break;
    case 'tipclose': UI.tipOpen = false; break;
    case 'tipopen': ItemTooltip.open(false); break;
    case 'unequip': if (UI.sel && UI.sel.where === 'eq' && unequipSlot(UI.sel.slot)) UI.sel = null; break;
    case 'usepot': if (it) usePotion(it.id); if (!selectedItem()) UI.sel = null; break;
    case 'sell': ch.gold += R.sellValue(it); ch.bag.splice(UI.sel.idx, 1); UI.sel = null; Sfx.coin(); break;
    case 'drop': ch.bag.splice(UI.sel.idx, 1); UI.sel = null; break;
    case 'petsell': sendPetToSell(); break;
    case 'sortbag': { const co = { mine: 0, other: 1, mat: 2 }; ch.bag.sort((x, y) => co[bagCat(x)] - co[bagCat(y)] || R.itemCP(y) - R.itemCP(x) || (x.kind || '').localeCompare(y.kind || '')); UI.sel = null; break; }
    case 'bar': if (ch.skillBar.length < 6) ch.skillBar.push(b.dataset.id); buildSlots(); break;
    case 'unbar': ch.skillBar.splice(ch.skillBar.indexOf(b.dataset.id), 1); buildSlots(); break;
    case 'autoskill': toggleAutoSkill(b.dataset.id); break;
    case 'autoLoot': ch.autoLoot = b.dataset.v === '1'; break;
    case 'autoPetSell': ch.autoPetSell = b.dataset.v === '1'; break;
    case 'node': ch.tree[b.dataset.id] = (ch.tree[b.dataset.id] || 0) + 1; recalc(); break;
    case 'toggleSound': S.settings.sound = !S.settings.sound; Sfx.on = S.settings.sound; break;
    case 'cycleMusic': S.settings.music = (musicLevel(S.settings) + 1) % MUSIC_LEVELS.length; Music.setVolume(MUSIC_LEVELS[S.settings.music].v); break;
    case 'toggleLabels': S.settings.labels = !S.settings.labels; break;
    case 'toggleOutline': S.settings.outline = S.settings.outline === false; setOutline(S.settings.outline); break;
    case 'toggleBloom': S.settings.bloom = !bloomOn(); setBloom(S.settings.bloom); break;
    case 'toggleAnimChars': S.settings.animChars = !gltfEnabled(); applyCharSetting(S.settings); if (G.player && G.player.model && G.mode === 'play') buildPlayerModel(); break;
    case 'cycleShake': { const cur = S.settings.shake == null ? 1 : S.settings.shake; S.settings.shake = cur === 1 ? 0.5 : cur === 0.5 ? 0 : 1; applyFeelSettings(S.settings); break; }
    case 'toggleHitStop': S.settings.hitStop = S.settings.hitStop === false; applyFeelSettings(S.settings); break;
    case 'toggleAutoPause': S.settings.autoPause = S.settings.autoPause === false; break;
    case 'camreset': resetCamera(); break;
    case 'quit': returnToTitle(); return;
    case 'wipe': if (!UI.confirmWipe) { UI.confirmWipe = true; break; } try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } forgetCloudLocal(); location.reload(); return;
  }
  persist();
  renderPane();
  hudTick();
}


/** Cliques, botão direito e opções dentro do painel lateral. */
export function initPaneActions() {
  $('#pane').addEventListener('click', paneAction);
  // detalhes do item e menu de contexto ficam fora do painel, com os mesmos botões
  $('#itemTip').addEventListener('click', paneAction);
  $('#ctxMenu').addEventListener('click', paneAction);
  $('#itemTipBg').addEventListener('click', () => { UI.tipOpen = false; ItemTooltip.sync(); });
  // botão direito (ou toque longo, em dragdrop.js) abre o menu de contexto do item
  $('#pane').addEventListener('contextmenu', (e) => {
    const c = e.target.closest('[data-act="selbag"],[data-act="seleq"]');
    if (!c) return;
    e.preventDefault();
    if (performance.now() < Drag.eatUntil) return; // o toque longo já abriu o menu
    const src = c.dataset.act === 'selbag' ? { where: 'bag', idx: +c.dataset.i } : { where: 'eq', slot: c.dataset.slot };
    if (ContextMenu.open(src, e.clientX, e.clientY)) renderPane();
  });
  window.addEventListener('resize', () => { ContextMenu.close(); ItemTooltip.sync(); });
  // clique fora fecha o menu de contexto
  window.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctxMenu')) ContextMenu.close(); }, true);

  $('#pane').addEventListener('change', (e) => { if (e.target.id === 'qualSel') { S.settings.quality = e.target.value; S.settings.bloom = null; setBloom(null); S.settings.animChars = null; applyCharSetting(S.settings); applyQuality(e.target.value); persist(); renderPane(); } });
}
