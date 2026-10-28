// ---------- Encantamento e Combinar Joias (Encantadora Morgana) ----------
// A Joia da Escuridão adiciona uma linha aleatória ao equipamento (até 3); cada
// linha pode ser retirada com Ouro. Três joias comuns viram uma joia aleatória.
// Funções puras sobre o personagem `ch` (sem tocar na cena), para os testes.
import { R } from '../core/util.js';

/** Quantas joias `id` o herói tem na mochila. */
export const jewelCount = (ch, id) => { const x = ch.bag.find((b) => b.kind === 'jewel' && b.id === id); return x ? x.qty : 0; };
function takeJewels(ch, id, n) {
  const x = ch.bag.find((b) => b.kind === 'jewel' && b.id === id);
  x.qty -= n;
  if (x.qty <= 0) ch.bag.splice(ch.bag.indexOf(x), 1);
}
/** O equipamento ainda é do herói (equipado ou na mochila)? */
export const ownsItem = (ch, it) => !!it && !!it.slot && (ch.equip[it.slot] === it || ch.bag.includes(it));

/**
 * Gasta 1 Joia da Escuridão e adiciona um encantamento aleatório.
 * why: 'gone' | 'nojewel' | 'full' (3 linhas ou nada mais a sortear).
 */
export function enchantItem(ch, it, rnd) {
  if (!ownsItem(ch, it)) return { ok: false, why: 'gone' };
  if (!R.canEnchant(it)) return { ok: false, why: 'full' };
  if (jewelCount(ch, 'dark') < 1) return { ok: false, why: 'nojewel' };
  takeJewels(ch, 'dark', 1);
  return R.applyEnchant(it, rnd);
}
/** Retira a linha `idx` pagando Ouro (R.enchantRemoveCost). why: 'gone' | 'none' | 'gold'. */
export function removeEnchant(ch, it, idx) {
  if (!ownsItem(ch, it)) return { ok: false, why: 'gone' };
  const e = it.ench && it.ench[idx];
  if (!e) return { ok: false, why: 'none' };
  const cost = R.enchantRemoveCost(it, e);
  if (ch.gold < cost) return { ok: false, why: 'gold', cost };
  ch.gold -= cost;
  it.ench.splice(idx, 1);
  if (!it.ench.length) delete it.ench;
  return { ok: true, ench: e, cost };
}

/** Joias pedidas por uma receita (lista de 3 ids) → { id: quantidade }. */
function need(picks) { const n = {}; picks.forEach((j) => (n[j] = (n[j] || 0) + 1)); return n; }
/** Quantas vezes a receita pode ser feita com as joias e o Ouro do herói. */
export function combineTimes(ch, picks) {
  if (!validPicks(picks)) return 0;
  const n = need(picks);
  let t = Math.floor(ch.gold / R.COMBINE.fee);
  for (const j in n) t = Math.min(t, Math.floor(jewelCount(ch, j) / n[j]));
  return Math.max(0, t);
}
const validPicks = (picks) => Array.isArray(picks) && picks.length === R.COMBINE.n && picks.every((j) => R.COMBINE.inputs.includes(j));
/**
 * Combina `times` vezes a receita `picks` (3 joias comuns, misturadas ou não).
 * Cada vez cobra R.COMBINE.fee de Ouro e devolve 1 joia aleatória (R.rollCombine).
 * `cap`: espaços da mochila (a joia nova precisa de uma pilha ou de um espaço livre).
 * why: 'picks' | 'short' (faltam joias ou Ouro) | 'full'. Devolve as joias obtidas.
 */
export function combineJewels(ch, picks, rnd, cap, times = 1) {
  if (!validPicks(picks)) return { ok: false, why: 'picks' };
  times = Math.max(1, Math.floor(times) || 1);
  if (combineTimes(ch, picks) < times) return { ok: false, why: 'short' };
  // espaço: pior caso, a joia sorteada não tem pilha; as pilhas que se esgotam liberam espaço
  const n = need(picks);
  const freed = Object.keys(n).filter((j) => jewelCount(ch, j) === n[j] * times).length;
  const outs = R.COMBINE.inputs.concat('dark');
  const missing = outs.filter((j) => !jewelCount(ch, j) || (n[j] && jewelCount(ch, j) === n[j] * times)).length;
  if (missing && ch.bag.length - freed + Math.min(missing, times) > cap) return { ok: false, why: 'full' };
  const got = [];
  for (let i = 0; i < times; i++) {
    ch.gold -= R.COMBINE.fee;
    for (const j in n) takeJewels(ch, j, n[j]);
    const id = R.rollCombine(rnd);
    const ex = ch.bag.find((b) => b.kind === 'jewel' && b.id === id);
    if (ex) ex.qty++;
    else ch.bag.push({ kind: 'jewel', id, qty: 1, uid: 'j' + id });
    got.push(id);
  }
  return { ok: true, got };
}
