// ---------- Auto-Limpeza: tickets da Guardiã Nyx e da Torre Infinita limpam andares sozinhos ----------
import { CONFIG } from '../core/config.js';
import { G, persist } from '../core/state.js';
import { $, esc, R } from '../core/util.js';
import { KEYS, mouse } from '../input/inputState.js';
import { revive } from './combat.js';
import { addToBag, BAG_SIZE, potionCount, usePotion } from './inventory.js';
import { pathTo } from './movement.js';
import { towerState } from './tower.js';
import { enterDungeon, enterTower } from './zones.js';
import { log, toast } from '../ui/log.js';
import { closeModal } from '../ui/npcDialogs.js';
import { BIOMES, DUNGEON_ORDER, floorLevel } from '../world/biomes.js';

/** Tickets de Auto-Limpeza da masmorra (ou da torre, 'tower') na mochila. */
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
  const cost = R.ticketPrice(biome) * n;
  if (!R.TICKETS[biome] || ch.gold < cost) return false;
  if (!addToBag({ kind: 'ticket', id: biome, qty: n, uid: 'k' + biome })) return false;
  ch.gold -= cost;
  return true;
}

export const autoClearOn = () => !!G.auto;
/** A Auto-Limpeza decide os alvos agora (não está pausada pelo jogador)? */
export const autoSteering = () => !!G.auto && G.time >= G.auto.manualT;

const isTower = (a) => a.biome === 'tower';
const placeName = (a) => (isTower(a) ? 'Torre Infinita' : BIOMES[a.biome].name);
function enterFloor(a) { if (isTower(a)) enterTower(a.floor); else enterDungeon(a.biome, a.floor); }

/**
 * Começa na masmorra escolhida (ou na torre, biome 'tower'), no andar mais fundo liberado.
 * Na torre dá para escolher o andar inicial (1 até o recorde), para farmar desde o começo.
 * Cada andar gasta um ticket ao entrar. Na masmorra, o herói desce logo depois do chefe;
 * na torre, só sobe depois de derrotar todos os monstros do andar.
 */
export function startAutoClear(biome, startFloor) {
  const ch = G.ch, tower = biome === 'tower';
  if ((!tower && DUNGEON_ORDER.indexOf(biome) < 0) || !takeTicket(biome)) return false;
  const best = ch.towerBest || 1;
  const floor = tower ? (startFloor ? Math.max(1, Math.min(startFloor | 0, best)) : best) : ch.unlockedFloors[biome] || 1;
  const a = G.auto = { biome, floor, done: 0, used: 1, manualT: 0, thinkT: 0, deadT: 0, bossDown: false, bossT: 0, endT: 0, nextT: 0, skip: new Map(), tgt: null };
  enterFloor(a);
  const lvl = tower ? R.towerLevel(floor) : floorLevel(biome, floor);
  toast('Auto-Limpeza', placeName(a) + ' · andar ' + floor);
  log('Auto-Limpeza: ' + placeName(a) + ', andar ' + floor + ' (nv ' + lvl + '). ' + (tower ? 'O herói derrota todos os monstros e o chefe, recolhe os drops e só então sobe' : 'O herói enfrenta o chefe, recolhe todos os drops do andar e desce') + '; mexer nele pausa a automação por um instante.', 'sys');
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
/** Chefe do andar caiu (combat.js): na masmorra recolhe os drops e segue; na torre termina o que sobrou. */
export function autoBossDown() { if (G.auto && !G.auto.bossDown) { G.auto.bossDown = true; G.auto.bossT = G.time; } }

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
 * Próximo alvo: o que estiver mais perto entre os drops e os monstros, para recolher tudo enquanto limpa
 * (sem deixar drops para trás e voltar no fim). Monstros que já estão brigando por perto vêm antes de drops
 * mais longe que eles; o chefe fica por último. Depois do chefe, recolhe o que sobrou no andar
 * (na masmorra sem caçar os monstros que sobraram, só se defendendo dos que vierem atrás dele).
 */
function pickTarget(a) {
  const p = G.player, R2 = CONFIG.autoClear.lootRadius ** 2;
  const d2 = (o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
  const ok = (m) => !m.dead && !skipped(a, m);
  const l = nearest(G.loot, (x) => lootOk(x) && !skipped(a, x), 1e4);
  const fighting = nearest(G.monsters, (m) => ok(m) && m.aggro, 9);
  if (fighting) return l && d2(l) < d2(fighting) ? { type: 'loot', l } : { type: 'mon', m: fighting };
  if (l && (a.bossDown || d2(l) <= R2)) return { type: 'loot', l };
  if (a.bossDown && !isTower(a)) return null;
  const m = nearest(G.monsters, (x) => ok(x) && !x.boss, 1e4) || nearest(G.monsters, ok, 1e4);
  if (l && (!m || d2(l) <= d2(m))) return { type: 'loot', l };
  return m ? { type: 'mon', m } : null;
}
function aim(p, t) {
  p.target = t;
  if (t.type === 'mon') p.path = null; else pathTo(t.l.x, t.l.z);
}
/**
 * Sem andar nem ferir o alvo por alguns segundos: deixa ele de lado por um tempo.
 * No fim do andar, um drop travado (atrás de parede) ou que nunca chega (andando em círculos)
 * é abandonado de vez nesse andar, para a automação não ficar presa.
 */
function watchStuck(a, p) {
  const C = CONFIG.autoClear, t = p.target, ref = t.type === 'mon' ? t.m : t.l;
  let s = a.tgt;
  if (!s || s.ref !== ref) s = a.tgt = { ref, x: p.x, z: p.z, hp: t.type === 'mon' ? t.m.hp : 0, at: G.time, from: G.time };
  const hp = t.type === 'mon' ? t.m.hp : 0, endLoot = a.bossDown && t.type === 'loot';
  const moved = Math.hypot(p.x - s.x, p.z - s.z) > 1.5 || hp < s.hp;
  if (moved) { s.x = p.x; s.z = p.z; s.hp = hp; s.at = G.time; }
  if ((!moved && G.time - s.at > C.stuckTime) || (endLoot && G.time - s.from > C.lootGiveUp)) {
    a.skip.set(ref, endLoot ? Infinity : G.time + C.skipTime);
    a.tgt = null; p.target = null; p.path = null;
  }
}
/** Mochila cheia com drops de equipamento no chão: o pet está fora vendendo e vai abrir espaço? */
const petFreesBag = () => G.ch.bag.length >= BAG_SIZE && G.pet && G.pet.away > G.time && G.loot.some((l) => l.type === 'item');
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
  a.bossDown = false; a.bossT = 0; a.endT = 0; a.nextT = 0; a.tgt = null; a.skip.clear();
  enterFloor(a);
  log('Auto-Limpeza: ' + (isTower(a) ? 'subindo' : 'descendo') + ' para o andar ' + a.floor + ' (' + ticketCount(a.biome) + ' tickets restantes).', 'sys');
}
/** Na torre o andar só acaba sem nenhum monstro vivo e sem a fenda da invasão ainda soltando ondas. */
function towerFloorClear() {
  if (G.monsters.some((m) => !m.dead)) return false;
  const inv = towerState().inv;
  return !inv || inv.state === 2;
}

export function updateAutoClear(dt) {
  const a = G.auto, p = G.player, C = CONFIG.autoClear;
  if (!a || !p || !G.ch) return;
  // saiu da masmorra (portal para a cidade, renasceu em Aldrena, outra zona): fim
  if (isTower(a) ? G.zone !== 'tower' || G.floor !== a.floor : G.zone !== 'dungeon' || G.biome !== a.biome || G.floor !== a.floor) { stopAutoClear('o herói saiu do andar'); return; }
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
  const tower = isTower(a);
  // depois do chefe, recolher o que sobrou no chão tem um limite de tempo largo, só como rede de segurança
  if (a.bossDown && !a.endT && (!tower || towerFloorClear())) a.endT = G.time;
  const late = a.endT && G.time - a.endT > C.lootTimeout;
  // na masmorra, com o chefe caído, larga o monstro que estava perseguindo (a não ser que ele esteja atacando);
  // acabou o tempo, larga o drop também
  if (p.target && (late || (a.bossDown && !tower && p.target.type === 'mon' && !p.target.m.aggro))) { p.target = null; p.path = null; }
  // indo atrás de um monstro que ainda não está brigando: um drop que caiu mais perto vem antes
  if (validTarget(p.target) && p.target.type === 'mon' && !p.target.m.aggro && !late) {
    const t = pickTarget(a);
    if (t && t.type === 'loot') { a.nextT = 0; aim(p, t); return; }
  }
  if (validTarget(p.target)) { watchStuck(a, p); return; }
  const t = late ? null : pickTarget(a);
  if (t) { a.nextT = 0; aim(p, t); return; }
  p.target = null;
  if (!a.bossDown) return; // o chefe ainda está vivo mas fora de alcance por enquanto (travado): espera
  // torre: com monstro vivo (travado e deixado de lado por um tempo) ou onda da invasão por vir, espera;
  // só um monstro inalcançável por muito tempo libera a subida, para a automação não ficar presa
  if (tower && !towerFloorClear() && G.time - a.bossT < C.towerStuckTimeout) return;
  // drops recém-caídos ainda no ar: espera pousarem antes de dar o andar por limpo
  if (!late && G.loot.some((l) => G.time - l.born <= 0.6 && lootOk2(l))) return;
  // mochila cheia com equipamento ainda no chão: espera o pet voltar da venda (a venda já liberou espaço ao partir)
  if (!late && petFreesBag()) return;
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
  const state = !G.player.alive ? 'Caído' : G.time < a.manualT ? 'Pausada (você está no controle)' : a.bossDown && G.loot.length && (!left || !isTower(a)) ? 'Recolhendo os drops' : a.bossDown && (!left || !isTower(a)) ? 'Andar limpo' : a.bossDown ? 'Chefe derrotado · limpando' : 'Limpando o andar';
  const html = '<div class="ac-h"><b>Auto-Limpeza</b><button class="btn sm" data-auto="stop">Parar</button></div>' +
    '<div class="ac-s">' + (isTower(a) ? 'Torre · ' : '') + 'Andar ' + a.floor + ' · ' + esc(state) + '</div>' +
    '<div class="ac-s">Monstros ' + left + ' · tickets ' + tk + ' · andares ' + a.done + '</div>';
  if (html !== lastHtml) { lastHtml = html; hudEl.innerHTML = html; }
  hudEl.hidden = false;
}
