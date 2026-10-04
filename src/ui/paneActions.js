// ---------- ações dos painéis (cliques delegados por data-act) ----------
import { applyCharSetting, gltfEnabled } from '../art/gltfModels.js';
import { forgetCloudLocal } from '../core/cloud.js';
import { applyFeelSettings, CONFIG } from '../core/config.js';
import { G, persist, S, SAVE_KEY, SaveGuard, UI } from '../core/state.js';
import { $, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { Music, MUSIC_LEVELS, musicLevel } from '../engine/music.js';
import { log } from './log.js';
import { applyUiScale } from './touch.js';
import { applyQuality, bloomOn, resetCamera, setBloom, setOutline } from '../engine/renderer.js';
import { sendPetToSell } from '../game/allies.js';
import { toggleAutoSkill } from '../game/automation.js';
import { skillUnlocked } from '../game/skills.js';
import { autoEquip, autoEquipOn, bagCat, equipFromBag, unequipSlot, usePotion } from '../game/inventory.js';
import { buildPlayerModel, recalc } from '../game/player.js';
import { returnToTitle } from '../game/session.js';
import { Drag } from './dragdrop.js';
import { renderPane } from './drawer.js';
import { buildSlots, hudTick } from './hud.js';
import { bagSel, ContextMenu, drinkable, ItemTooltip, needsConfirm, selBagIdx, selectedItem } from './itemTooltip.js';
import { log } from './log.js';

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
  // o pedido de confirmação (vender/descartar) vale só para o clique seguinte no mesmo item
  const conf = UI.itemConfirm;
  UI.itemConfirm = null;
  switch (a) {
    case 'stat': { const n = Math.min(Math.floor(+b.dataset.n) || 0, ch.points); if (n <= 0 || !(b.dataset.k in ch.stats)) break; ch.stats[b.dataset.k] += n; ch.points -= n; recalc(); if (autoEquipOn()) G.autoEqT = 0.3; break; }
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
      // o clique duplo só vale se a célula ainda guarda o mesmo item (a mochila pode mudar entre os cliques)
      const dbl = UI.lastCell && UI.lastCell.k === 'b' + i && UI.lastCell.it === ch.bag[i] && now - UI.lastCell.t < CONFIG.input.doubleClickMs;
      if (dbl && ch.bag[i] && ch.bag[i].slot) { UI.lastCell = null; UI.tipOpen = false; UI.sel = bagSel(i); equipFromBag(i); break; }
      // clique duplo numa poção: bebe direto do inventário
      if (dbl && drinkable(ch.bag[i])) { UI.lastCell = null; UI.tipOpen = false; const pot = ch.bag[i]; usePotion(pot.id); UI.sel = ch.bag.includes(pot) ? bagSel(ch.bag.indexOf(pot)) : null; break; }
      UI.lastCell = { k: 'b' + i, t: now, it: ch.bag[i] };
      UI.sel = bagSel(i);
      if (UI.sel) ItemTooltip.open(true);
      break;
    }
    case 'bagf': UI.bagFilter = b.dataset.k; UI.sel = null; break;
    case 'aeqtoggle': S.settings.autoEquip = !autoEquipOn(); if (autoEquipOn()) autoEquip(true); persist(); break;
    case 'aeqnow': autoEquip(true); break;
    case 'equip': { const i = selBagIdx(); if (it && it.slot && i >= 0) equipFromBag(i); break; }
    case 'tipclose': UI.tipOpen = false; break;
    case 'tipopen': ItemTooltip.open(false); break;
    case 'unequip': if (UI.sel && UI.sel.where === 'eq' && unequipSlot(UI.sel.slot)) UI.sel = null; break;
    case 'usepot': if (it) usePotion(it.id); if (!selectedItem()) UI.sel = null; break;
    case 'lock': if (it) { it.locked = !it.locked; log((it.locked ? 'Trancado: ' : 'Destrancado: ') + R.itemName(it) + '.', 'sys'); } break;
    case 'sell': case 'drop': {
      // confere o item na hora (a posição na mochila pode ter mudado) e nunca mexe em item trancado
      const i = selBagIdx();
      if (i < 0 || !it) { UI.sel = null; break; }
      if (it.locked) { log('Item trancado: destranque antes de ' + (a === 'sell' ? 'vender' : 'descartar') + '.', 'warn'); break; }
      // o segundo clique precisa ser deliberado (um clique duplo acidental não confirma)
      if (needsConfirm(it) && !(conf && conf.it === it && conf.act === a && performance.now() - conf.t > 250)) { UI.itemConfirm = { it, act: a, t: performance.now() }; ItemTooltip.open(false); break; }
      ch.bag.splice(i, 1); UI.sel = null;
      if (a === 'sell') { const v = R.sellValue(it); ch.gold += v; Sfx.coin(); log('Vendeu ' + R.itemName(it) + (it.qty > 1 ? ' ×' + it.qty : '') + ' por ' + fmt(v) + ' de Ouro.', 'loot'); }
      else log('Descartou ' + R.itemName(it) + (it.qty > 1 ? ' ×' + it.qty : '') + '.', 'sys');
      break;
    }
    case 'petsell': sendPetToSell(); break;
    case 'sortbag': { const co = { mine: 0, other: 1, mat: 2 }; ch.bag.sort((x, y) => co[bagCat(x)] - co[bagCat(y)] || R.itemCP(y) - R.itemCP(x) || (x.kind || '').localeCompare(y.kind || '')); UI.sel = null; break; }
    case 'bar': { const id = b.dataset.id; if (ch.skillBar.length < 6 && !ch.skillBar.includes(id) && skillUnlocked(id)) ch.skillBar.push(id); buildSlots(); break; }
    case 'unbar': { const i = ch.skillBar.indexOf(b.dataset.id); if (i >= 0) ch.skillBar.splice(i, 1); buildSlots(); break; }
    case 'autoskill': toggleAutoSkill(b.dataset.id); break;
    case 'autoLoot': ch.autoLoot = b.dataset.v === '1'; break;
    case 'autoPetSell': ch.autoPetSell = b.dataset.v === '1'; break;
    case 'node': {
      // revalida: nó da classe, ponto livre e limite de 5 ranks
      const id = b.dataset.id, r = ch.tree[id] || 0;
      const valid = R.TREES[ch.cls].some((br, bi) => br.nodes.some((n, ni) => R.treeNodeId(ch.cls, bi, ni) === id));
      if (valid && r < 5 && R.treePoints(ch) - R.treeSpent(ch) > 0) {
        ch.tree[id] = r + 1; recalc(); Sfx.loot(2);
        const nm = b.querySelector('b');
        log('Árvore de maestria: ' + (nm ? nm.textContent : 'nó') + ' agora no rank ' + (r + 1) + '/5.', 'sys');
      }
      break;
    }
    case 'techToggle': UI.techOpen = !UI.techOpen; break;
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
    case 'wipe': if (!UI.confirmWipe) { UI.confirmWipe = true; break; } SaveGuard.wiping = true; try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } forgetCloudLocal(); location.reload(); return;
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
    const src = c.dataset.act === 'selbag' ? bagSel(+c.dataset.i) : { where: 'eq', slot: c.dataset.slot };
    if (!src) return;
    if (ContextMenu.open(src, e.clientX, e.clientY)) renderPane();
  });
  window.addEventListener('resize', () => { ContextMenu.close(); ItemTooltip.sync(); });
  // clique fora fecha o menu de contexto
  window.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctxMenu')) ContextMenu.close(); }, true);

  // controles deslizantes de Opções: aplicam ao arrastar e salvam ao soltar
  const RANGES = {
    sfxVol: (v) => { S.settings.sfxVol = v; Sfx.vol = v / 100; },
    musicVol: (v) => { S.settings.musicVol = v; Music.setVolume(v / 100); },
    uiScale: (v) => { S.settings.uiScale = v; applyUiScale(S.settings); },
  };
  $('#pane').addEventListener('input', (e) => {
    const f = RANGES[e.target.id];
    if (!f) return;
    const v = +e.target.value;
    f(v);
    const out = e.target.nextElementSibling;
    if (out) out.textContent = v + '%';
  });
  $('#pane').addEventListener('change', (e) => {
    if (RANGES[e.target.id]) { persist(); if (e.target.id === 'sfxVol') Sfx.coin(); }
  });
  $('#pane').addEventListener('change', (e) => { if (e.target.id === 'qualSel') { S.settings.quality = e.target.value; S.settings.bloom = null; setBloom(null); S.settings.animChars = null; applyCharSetting(S.settings); applyQuality(e.target.value); persist(); renderPane(); } });
}
