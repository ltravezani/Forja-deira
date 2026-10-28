// ---------- Baú da conta (NPC Dalva) ----------
// Itens guardados aqui ficam no save da conta (S.chest), fora de qualquer
// personagem: todos os heróis do mesmo save (e da mesma conta na nuvem) veem e
// retiram os mesmos itens. Joias, poções, talismãs e tickets empilham num espaço
// só; equipamentos ocupam um espaço cada.
import { CONFIG } from '../core/config.js';

/** Espaços do baú. */
export const CHEST_SIZE = CONFIG.chest.size;

/** Mesma pilha: itens empilháveis (sem slot) do mesmo tipo e id. */
const sameStack = (a, b) => !a.slot && !b.slot && a.kind === b.kind && a.id === b.id;

/**
 * Move `n` unidades (ou o item inteiro, se não empilhável) de `from` para `to`.
 * `cap` é o limite de espaços de `to` (uma pilha já existente não ocupa espaço novo).
 * Devolve { ok, why } — why: 'gone' (item não está mais em `from`) | 'full'.
 */
export function moveItem(from, to, it, n, cap) {
  const i = from.indexOf(it);
  if (i < 0) return { ok: false, why: 'gone' };
  if (it.slot) {
    if (to.length >= cap) return { ok: false, why: 'full' };
    from.splice(i, 1);
    to.push(it);
    return { ok: true, n: 1 };
  }
  const q = it.qty || 1;
  n = Math.max(1, Math.min(Math.floor(n) || 1, q));
  const ex = to.find((b) => sameStack(b, it));
  if (!ex && to.length >= cap) return { ok: false, why: 'full' };
  if (ex) ex.qty = (ex.qty || 1) + n;
  else to.push(n >= q ? it : Object.assign({}, it, { qty: n }));
  if (n >= q) from.splice(i, 1); else it.qty = q - n;
  return { ok: true, n };
}

/** Guarda do personagem no baú da conta. Equipamentos em uso não entram (tire antes). */
export function deposit(ch, chest, it, n) { return moveItem(ch.bag, chest, it, n, CHEST_SIZE); }
/** Retira do baú da conta para a mochila do personagem (limite: espaços da mochila). */
export function withdraw(ch, chest, it, n, bagSize) { return moveItem(chest, ch.bag, it, n, bagSize); }
