// ---------- automação: habilidades automáticas, coleta de drops e venda pelo pet ----------
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { dist2, R } from '../core/util.js';
import { petSellable, sendPetToSell } from './allies.js';
import { BAG_SIZE, classOk, cpOf, cpWith, reqOk } from './inventory.js';
import { castSkill, cdLeft, skillUnlocked } from './skills.js';
import { inSafe } from './zones.js';

/** Habilidades que deslocam o herói: ficam de fora da automação (o movimento é sempre do jogador). */
const MOVES_HERO = { blink: 1, dash: 1 };
export const autoSkillAllowed = (id) => !!R.SKILLS[id] && !MOVES_HERO[R.SKILLS[id].kind];
export const autoSkillOn = (id) => Array.isArray(G.ch.autoSkills) && G.ch.autoSkills.includes(id);
export function toggleAutoSkill(id) {
  const ch = G.ch;
  if (!Array.isArray(ch.autoSkills)) ch.autoSkills = [];
  const i = ch.autoSkills.indexOf(id);
  if (i >= 0) ch.autoSkills.splice(i, 1);
  else if (autoSkillAllowed(id)) ch.autoSkills.push(id);
}

/** Algum monstro vivo dentro do alcance da habilidade? */
function monsterNear(p, reach) {
  for (const m of G.monsters) {
    if (m.dead) continue;
    const r = reach + (m.radius || 0);
    if (dist2(m, p) <= r * r) return true;
  }
  return false;
}
/**
 * Lança sozinha a primeira habilidade marcada como automática que estiver pronta,
 * com MP/AG suficientes e um monstro ao alcance. As de recarga longa (buffs,
 * invocações, golpes fortes) têm prioridade; as rápidas preenchem o resto.
 */
function autoCast() {
  const p = G.player, ch = G.ch, st = G.st;
  if (!ch.autoSkills || !ch.autoSkills.length || !p || !p.alive || p.dash || G.skillQueue) return;
  if (G.time < p.lockUntil || G.zone === 'town' || inSafe()) return;
  const ids = ch.autoSkills.filter((id) => autoSkillAllowed(id) && skillUnlocked(id) && cdLeft(id) <= 0);
  ids.sort((a, b) => R.SKILLS[b].cd - R.SKILLS[a].cd);
  for (const id of ids) {
    const sk = R.SKILLS[id], c = R.skillCost(st, sk);
    if (G.mp < c.mp || G.ag < c.ag) continue;
    if (sk.kind === 'heal' && G.hp > st.maxHp * CONFIG.auto.healBelow) continue;
    if (!monsterNear(p, Math.max(sk.range || 0, sk.radius || 0) || CONFIG.auto.skillReach)) continue;
    if (castSkill(id, null, null, { auto: true })) return;
  }
}

/** Itens que o pet leva sozinho: os mesmos da venda manual, menos melhorias para o herói. */
function autoSellable(it, base) {
  return petSellable(it) && !(classOk(it) && reqOk(it) && cpWith(it) > base);
}
function autoPetSell() {
  const pet = G.pet, ch = G.ch;
  if (!pet || pet.away > G.time || G.autoEqT > 0) return;
  const base = cpOf(ch);
  const n = ch.bag.filter((it) => autoSellable(it, base)).length;
  if (!n || (n < CONFIG.loot.autoPetSellMin && ch.bag.length < BAG_SIZE - 2)) return;
  sendPetToSell((it) => autoSellable(it, base));
}

let sellTick = 0;
export function updateAutomation(dt) {
  if (!G.ch || !G.player) return;
  autoCast();
  sellTick -= dt;
  if (sellTick <= 0) { sellTick = 1; if (G.ch.autoPetSell) autoPetSell(); }
}
