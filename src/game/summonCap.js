// ---------- limite de invocações do Necromancer (regra pura, testada no Node) ----------
/** Máximo de aliados vivos por tipo; o novo substitui o mais antigo. */
export const SUMMON_CAP = { skeleton: 5, deathknight: 2 };
/**
 * Aliados que precisam sair para caber mais um do tipo `kind` (os mais antigos
 * primeiro; `allies` está em ordem de criação). Tipos sem limite: lista vazia.
 */
export function summonOverflow(allies, kind) {
  const cap = SUMMON_CAP[kind];
  if (!cap) return [];
  const same = allies.filter((a) => a.kind === kind);
  return same.slice(0, Math.max(0, same.length - cap + 1));
}
