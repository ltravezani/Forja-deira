// ---------- Auto-Limpeza: tickets da Guardiã Nyx limpam andares de masmorra sozinhos ----------
import { CONFIG } from '../core/config.js';
import { G, persist } from '../core/state.js';
import { $, esc, R } from '../core/util.js';
import { KEYS, mouse } from '../input/inputState.js';
import { revive } from './combat.js';
import { addToBag, BAG_SIZE, potionCount, usePotion } from './inventory.js';
import { pathTo } from './movement.js';
import { enterDungeon } from './zones.js';
import { log, toast } from '../ui/log.js';
import { closeModal } from '../ui/npcDialogs.js';
import { BIOMES, DUNGEON_ORDER, floorLevel } from '../world/biomes.js';

/** Tickets de Auto-Limpeza da masmorra na mochila. */
export function ticketCount(biome) {
  const t = G.ch && G.ch.bag.find((b) => b.kind === 'ticket' && b.id === biome);
  return t ? t.qty : 0;
}
function takeTicket(biome) {
  const bag = G.ch.bag, t = bag.find((b) => b.kind === 'ticket' && b.id === biome);
  if (!t) return false;
  t.qty--; if (t.qty <= 0) bag.splice(bag.indexOf(t), 1);
  return true;
}
/** Compra na Mercadora: devolve false sem Ouro ou sem espaço na mochila. */
export function buyTicket(biome, n = 1) {
  const ch = G.ch;
  n = Math.max(1, Math.floor(n) || 1);
  if (!R.TICKETS[biome] || ch.gold < R.TICKET_PRICE * n) return false;
  if (!addToBag({ kind: 'ticket', id: biome, qty: n, uid: 'k' + biome })) return false;
  ch.gold -= R.TICKET_PRICE * n;
  return true;
}

export const autoClearOn = () => !!G.auto;
/** A Auto-Limpeza decide os alvos agora (não está pausada pelo jogador)? */
export const autoSteering = () => !!G.auto && G.time >= G.auto.manualT;

/**
 * Começa na masmorra escolhida, no andar mais fundo liberado. Cada andar gasta um
 * ticket ao entrar; com tickets sobrando, o herói desce sozinho depois do chefe.
 */
export function startAutoClear(biome) {
  const ch = G.ch;
  if (DUNGEON_ORDER.indexOf(biome) < 0 || !takeTicket(biome)) return false;
  const floor = ch.unlockedFloors[biome] || 1;
  G.auto = { biome, floor, done: 0, used: 1, manualT: 0, thinkT: 0, deadT: 0, bossDown: false, endT: 0, nextT: 0, skip: new Map(), tgt: null };
  enterDungeon(biome, floor);
  toast('Auto-Limpeza', BIOMES[biome].name + ' · andar ' + floor);
  log('Auto-Limpeza: ' + BIOMES[biome].name + ', andar ' + floor + ' (nv ' + floorLevel(biome, floor) + '). O herói limpa o andar e enfrenta o chefe sozinho; mexer nele pausa a automação por um instante.', 'sys');
  return true;
}
export function stopAutoClear(msg, done) {
  const a = G.auto;
  if (!a) return;
  G.auto = null;
  const p = G.player;
  if (p && p.alive) { p.target = null; p.path = null; }
  const n = a.done;
  const cleared = n + (n === 1 ? ' andar limpo' : ' andares limpos');
  log('Auto-Limpeza ' + (done ? 'concluída' : 'encerrada') + (msg ? ': ' + msg : '') + '. ' + cleared + '.', 'sys');
  toast(done ? 'Auto-Limpeza concluída' : 'Auto-Limpeza encerrada', done ? cleared : msg || cleared);
  persist();
}
/** Chefe do andar caiu (combat.js): termina o que sobrou e segue para o próximo. */
export function autoBossDown() { if (G.auto) G.auto.bossDown = true; }

const skipped = (a, ref) => (a.skip.get(ref) || 0) > G.time;
function validTarget(t) {
  if (!t) return false;
  if (t.type === 'mon') return !t.m.dead;
  if (t.type === 'loot') return G.loot.indexOf(t.l) >= 0;
  return false;
}
/** Drops que valem a viagem: itens só com espaço na mochila. */
const lootOk2 = (l) => l.type !== 'item' || G.ch.bag.length < BAG_SIZE;
const lootOk = (l) => G.time - l.born > 0.6 && lootOk2(l);
function nearest(list, ok, maxD) {
  const p = G.player;
  let best = null, bd = maxD * maxD;
  for (const o of list) {
    if (!ok(o)) continue;
    const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/**
 * Próximo alvo: monstros que já estão brigando por perto, drops no caminho,
 * o monstro mais próximo e, por último, o chefe. Depois do chefe, recolhe o resto do chão.
 */
function pickTarget(a) {
  const ok = (m) => !m.dead && !skipped(a, m);
  const fighting = nearest(G.monsters, (m) => ok(m) && m.aggro, 9);
  if (fighting) return { type: 'mon', m: fighting };
  const l = nearest(G.loot, (x) => lootOk(x) && !skipped(a, x), a.bossDown ? 1e4 : CONFIG.autoClear.lootRadius);
  if (l) return { type: 'loot', l };
  const m = nearest(G.monsters, (x) => ok(x) && !x.boss, 1e4) || nearest(G.monsters, ok, 1e4);
  return m ? { type: 'mon', m } : null;
}
function aim(p, t) {
  p.target = t;
  if (t.type === 'mon') p.path = null; else pathTo(t.l.x, t.l.z);
}
/** Sem andar nem ferir o alvo por alguns segundos: deixa ele de lado por um tempo. */
function watchStuck(a, p) {
  const C = CONFIG.autoClear, t = p.target, ref = t.type === 'mon' ? t.m : t.l;
  let s = a.tgt;
  if (!s || s.ref !== ref) s = a.tgt = { ref, x: p.x, z: p.z, hp: t.type === 'mon' ? t.m.hp : 0, at: G.time };
  const hp = t.type === 'mon' ? t.m.hp : 0;
  if (Math.hypot(p.x - s.x, p.z - s.z) > 1.5 || hp < s.hp) { s.x = p.x; s.z = p.z; s.hp = hp; s.at = G.time; return; }
  if (G.time - s.at > C.stuckTime) {
    a.skip.set(ref, G.time + C.skipTime);
    a.tgt = null; p.target = null; p.path = null;
  }
}
function drinkPotions() {
  const C = CONFIG.autoClear, st = G.st;
  if (G.hp < st.maxHp * C.hpPotionBelow && potionCount('hp')) usePotion('hp');
  else if (G.mp < st.maxMp * C.mpPotionBelow && potionCount('mp')) usePotion('mp');
}
function nextFloor(a) {
  a.done++;
  if (!takeTicket(a.biome)) {
    stopAutoClear('os tickets acabaram', true);
    return;
  }
  a.used++;
  a.floor++;
  a.bossDown = false; a.endT = 0; a.nextT = 0; a.tgt = null; a.skip.clear();
  enterDungeon(a.biome, a.floor);
  log('Auto-Limpeza: descendo para o andar ' + a.floor + ' (' + ticketCount(a.biome) + ' tickets restantes).', 'sys');
}

export function updateAutoClear(dt) {
  const a = G.auto, p = G.player, C = CONFIG.autoClear;
  if (!a || !p || !G.ch) return;
  // saiu da masmorra (portal para a cidade, renasceu em Aldrena, outra zona): fim
  if (G.zone !== 'dungeon' || G.biome !== a.biome || G.floor !== a.floor) { stopAutoClear('o herói saiu do andar'); return; }
  if (!p.alive) {
    if (!a.deadT) a.deadT = G.time;
    if (G.time - a.deadT < C.reviveDelay) return;
    if (potionCount('rez') && revive()) { closeModal(); a.deadT = 0; a.tgt = null; return; }
    stopAutoClear('o herói caiu sem Poção da Ressurreição');
    return;
  }
  a.deadT = 0;
  if (KEYS.any() || mouse.down) a.manualT = G.time + C.manualPause;
  drinkPotions();
  if (G.time < a.manualT || G.time < p.lockUntil || p.dash || p.dodge) return;
  if ((a.thinkT -= dt) > 0) return;
  a.thinkT = C.think;
  if (validTarget(p.target)) { watchStuck(a, p); return; }
  // depois do chefe, recolher o que sobrou no chão tem limite de tempo
  if (a.bossDown && !a.endT && !G.monsters.some((m) => !m.dead)) a.endT = G.time;
  const late = a.endT && G.time - a.endT > C.lootTimeout;
  const t = late ? null : pickTarget(a);
  if (t) { a.nextT = 0; aim(p, t); return; }
  p.target = null;
  if (!a.bossDown) return; // o chefe ainda está vivo mas fora de alcance por enquanto (travado): espera
  // drops recém-caídos ainda no ar: espera pousarem antes de dar o andar por limpo
  if (!late && G.loot.some((l) => G.time - l.born <= 0.6 && lootOk2(l))) return;
  // andar limpo: uma pausa curta para ver o resultado e desce
  if (!a.nextT) a.nextT = G.time + C.nextDelay;
  if (G.time >= a.nextT) nextFloor(a);
}

// ---------- HUD: selo da Auto-Limpeza sob o minimapa, com o botão Parar ----------
let hudEl = null, lastHtml = '';
export function updateAutoHud() {
  if (!hudEl) {
    hudEl = $('#autoClr');
    if (!hudEl) return;
    hudEl.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-auto="stop"]')) { e.stopPropagation(); e.preventDefault(); stopAutoClear('parada pelo jogador'); } });
  }
  const a = G.auto;
  if (!a) { if (!hudEl.hidden) { hudEl.hidden = true; lastHtml = ''; } return; }
  const left = G.monsters.reduce((n, m) => n + (m.dead ? 0 : 1), 0), tk = ticketCount(a.biome);
  const state = !G.player.alive ? 'Caído' : G.time < a.manualT ? 'Pausada (você está no controle)' : a.bossDown && !left ? 'Andar limpo' : a.bossDown ? 'Chefe derrotado · limpando' : 'Limpando o andar';
  const html = '<div class="ac-h"><b>Auto-Limpeza</b><button class="btn sm" data-auto="stop">Parar</button></div>' +
    '<div class="ac-s">Andar ' + a.floor + ' · ' + esc(state) + '</div>' +
    '<div class="ac-s">Monstros ' + left + ' · tickets ' + tk + ' · andares ' + a.done + '</div>';
  if (html !== lastHtml) { lastHtml = html; hudEl.innerHTML = html; }
  hudEl.hidden = false;
}
