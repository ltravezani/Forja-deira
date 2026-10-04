// ---------- mochila, poções, Pontos de Combate (CP) e auto-equipar ----------
import { CONFIG } from '../core/config.js';
import { G, S, UI } from '../core/state.js';
import { dec, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { buildPlayerModel, recalc } from './player.js';
import { questEvent } from './quests.js';
import { refreshPaneSoon } from '../ui/drawer.js';
import { log } from '../ui/log.js';

/** Capacidade da mochila (células). */
export const BAG_SIZE = CONFIG.bag.size;

// ---------- CP (Pontos de Combate) e auto-equipar ----------
/** CP do personagem sem buffs temporários (valor estável para comparar equipamentos). */
export function cpOf(ch) { return R.combatPower(R.deriveStats(ch, [])); }
export function fmtCP(v) { return v >= 1e6 ? dec(Math.round(v / 1e5) / 10) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? dec(Math.round(v / 100) / 10) + 'k' : String(v); }
/** Pode ser usado por esta classe (independe de requisito de atributo). */
export function classOk(it) { return R.canUse(G.ch.cls, it); }
/** Requisito cumprido (mesma regra do cálculo de atributos: todos os itens e buffs, sem o bônus do próprio item). */
export function reqOk(it) {
  return R.itemActive(G.ch, it, G.buffs.map((b) => b.stats));
}
/** CP que o personagem teria com `it` no lugar do item atual do mesmo slot. */
export function cpWith(it) {
  const ch = G.ch, old = ch.equip[it.slot];
  ch.equip[it.slot] = it;
  const v = cpOf(ch);
  if (old) ch.equip[it.slot] = old; else delete ch.equip[it.slot];
  return v;
}
/** Categoria da mochila: mine (sua classe), other (outras classes), mat (jewels/poções). */
export function bagCat(it) { return !it.slot ? 'mat' : classOk(it) ? 'mine' : 'other'; }
export function equipFromBag(idx, quiet) {
  const ch = G.ch, it = ch.bag[idx];
  if (!it || !it.slot) return false;
  if (!classOk(it)) { if (!quiet) log('Este item é exclusivo de ' + R.itemUsers(it).join(', ') + '.', 'warn'); return false; }
  const old = ch.equip[it.slot];
  ch.bag.splice(idx, 1);
  if (old) ch.bag.push(old);
  ch.equip[it.slot] = it;
  if (!quiet) {
    UI.sel = { where: 'eq', slot: it.slot };
    if (!reqOk(it)) log('Requisito não atendido: o item fica equipado mas inativo.', 'warn');
    const before = G.cp;
    recalc(); buildPlayerModel();
    const d = G.cp - before;
    Sfx.loot(1);
    log('Equipou ' + R.itemName(it) + (d ? ' (' + (d > 0 ? '+' : '') + fmt(d) + ' CP)' : '') + '.', 'loot');
    if (d) floatText(G.player.x, 3, G.player.z, (d > 0 ? '+' : '') + fmt(d) + ' CP', d > 0 ? 'heal' : 'info');
  }
  return true;
}
export function unequipSlot(slot) {
  const ch = G.ch;
  if (!ch.equip[slot]) return false;
  if (ch.bag.length >= BAG_SIZE) { log('Mochila cheia.', 'warn'); return false; }
  ch.bag.push(ch.equip[slot]);
  delete ch.equip[slot];
  recalc(); buildPlayerModel();
  return true;
}
export function autoEquipOn() { return S.settings.autoEquip !== false; }
/**
 * Equipa sempre a melhor combinação disponível: para cada slot, testa cada peça
 * da mochila (da sua classe) e fica com a que mais aumenta o CP total. Itens com
 * requisito não atendido não somam CP, então nunca são escolhidos. Repete algumas
 * vezes porque bônus de atributo de uma peça podem liberar outra.
 */
export function autoEquip(manual) {
  const ch = G.ch;
  if (!ch || !G.player) return 0;
  const start = cpOf(ch), done = [];
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const s of R.SLOTS) {
      const base = cpOf(ch);
      let best = -1, bestCp = base;
      ch.bag.forEach((it, i) => {
        if (it.slot !== s || !classOk(it)) return;
        const v = cpWith(it);
        if (v > bestCp) { bestCp = v; best = i; }
      });
      if (best >= 0) { const it = ch.bag[best]; equipFromBag(best, true); done.push(it); any = true; }
    }
    if (!any) break;
  }
  if (!done.length) { if (manual) log('Você já está usando os melhores itens disponíveis (CP ' + fmt(start) + ').', 'sys'); return 0; }
  recalc(); buildPlayerModel();
  const gain = G.cp - start;
  done.forEach((it) => log('Auto-equipado: ' + R.itemName(it) + '.', 'loot'));
  log('CP ' + fmt(start) + ' → ' + fmt(G.cp) + ' (+' + fmt(gain) + ').', 'sys');
  floatText(G.player.x, 3.2, G.player.z, '+' + fmt(gain) + ' CP', 'heal');
  if (UI.sel && UI.sel.where === 'bag') UI.sel = null;
  refreshPaneSoon();
  return gain;
}
export function addToBag(it) {
  const bag = G.ch.bag;
  if (it.kind) {
    const ex = bag.find((b) => b.kind === it.kind && b.id === it.id);
    if (ex) { ex.qty += it.qty || 1; return true; }
  }
  if (bag.length >= BAG_SIZE) { log('Inventário cheio. Envie o pet para vender (P).', 'warn'); return false; }
  bag.push(it);
  return true;
}
/**
 * Poção de reforço (Éden): 10 minutos de efeito. Beber de novo a mesma poção
 * renova o tempo (não acumula); poções diferentes valem juntas.
 */
function drinkBuff(id, D) {
  const bid = 'pot:' + id;
  G.buffs = G.buffs.filter((b) => b.id !== bid);
  G.buffs.push({ id: bid, name: D.name.replace('Poção de ', ''), until: G.time + D.dur, stats: D.buff, potion: true });
  recalc();
  const col = parseInt(D.color.slice(1), 16);
  emit(G.player.x, 1, G.player.z, { n: 30, color: col, speed: 2.5, up: 3, life: 0.9, size: 0.9, grav: 1, spread: 0.8 });
  floatText(G.player.x, 2.8, G.player.z, D.name.replace('Poção de ', '') + '!', 'heal');
  log(D.name + ': ' + D.desc, 'sys');
}
export function potionCount(id) { const p = G.ch.bag.find((b) => b.kind === 'potion' && b.id === id); return p ? p.qty : 0; }
/** Bebe uma poção (Q/E); pequena recarga para não gastar várias num clique duplo. */
export function usePotion(id) {
  if (!G.player || !G.player.alive) return; // caído: a tela de queda cuida (nada de "Sem poções")
  const p = G.ch.bag.find((b) => b.kind === 'potion' && b.id === id);
  // aviso com pausa curta: segurar Q/E não enche a tela de textos
  const say = (t) => { if ((G.potMsgT || 0) <= G.time) { G.potMsgT = G.time + 0.6; floatText(G.player.x, 2.6, G.player.z, t, 'info'); } };
  if (!p) { say('Sem poções'); return; }
  if (G.potCd > G.time) return;
  const D = R.POTIONS[id];
  if (D.revive) { log('A Poção da Ressurreição é usada na tela de queda.', 'sys'); return; }
  // vida/mana cheias: não gasta a poção
  if (id === 'hp' && G.hp >= G.st.maxHp) { say('HP cheio'); return; }
  if (id === 'mp' && G.mp >= G.st.maxMp) { say('MP cheio'); return; }
  G.potCd = G.time + 0.5;
  if (D.buff) { drinkBuff(id, D); p.qty--; if (p.qty <= 0) G.ch.bag.splice(G.ch.bag.indexOf(p), 1); questEvent('potion', id); return; }
  if (id === 'hp') { const a = G.st.maxHp * D.pct + D.flat; G.hp = Math.min(G.st.maxHp, G.hp + a); floatText(G.player.x, 2.6, G.player.z, '+' + fmt(a), 'heal'); }
  else G.mp = Math.min(G.st.maxMp, G.mp + G.st.maxMp * D.pct + D.flat);
  emit(G.player.x, 1, G.player.z, { n: 14, color: id === 'hp' ? 0xff5a4a : 0x5a9aff, speed: 2, up: 2, life: 0.6, size: 0.8, grav: 2 });
  p.qty--;
  if (p.qty <= 0) G.ch.bag.splice(G.ch.bag.indexOf(p), 1);
  questEvent('potion', id);
}
