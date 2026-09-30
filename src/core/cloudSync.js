// ---------- decisão de sincronização com a nuvem (lógica pura, sem rede) ----------
// O save local é sempre a fonte do jogo; a nuvem é uma cópia com número de
// revisão (`rev`). `sync` guarda, neste aparelho, a última revisão combinada com
// a nuvem e se o save local mudou desde então (`dirty`). Regra de ouro: nada é
// sobrescrito sem que o outro lado já esteja contido nele ou o jogador escolha.

/** Save tem ao menos um personagem? */
export function hasChars(save) {
  return !!(save && Array.isArray(save.chars) && save.chars.length);
}

/** JSON com chaves ordenadas (o jsonb do Postgres reordena as chaves dos objetos). */
export function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return v === undefined ? 'null' : JSON.stringify(v);
}

/**
 * O que fazer ao comparar o save local com o da nuvem.
 * @param local  save deste aparelho (objeto S)
 * @param cloud  { data, rev } da nuvem, ou null se a conta ainda não tem save
 * @param sync   { userId, rev, dirty } gravado neste aparelho (ou null)
 * @param userId conta atual
 * @returns 'none' | 'same' | 'upload' | 'download' | 'conflict'
 */
export function decideSync({ local, cloud, sync, userId }) {
  if (!cloud) return hasChars(local) || (sync && sync.userId === userId && sync.dirty) ? 'upload' : 'none';
  if (stableJson(local) === stableJson(cloud.data)) return 'same';
  const linked = !!(sync && sync.userId === userId);
  // a nuvem não mudou desde a última troca: o que difere é novo aqui
  if (linked && sync.rev === cloud.rev) return 'upload';
  // a nuvem avançou (outro aparelho) e aqui nada mudou: baixar não perde nada
  if (linked && cloud.rev > sync.rev && !sync.dirty) return 'download';
  // um dos lados não tem personagens: fica o que tem (só opções se perderiam)
  if (!hasChars(local)) return 'download';
  if (!hasChars(cloud.data)) return 'upload';
  return 'conflict';
}

/** Resumo curto de um save para a janela de escolha. */
export function saveSummary(save) {
  if (!hasChars(save)) return [];
  return save.chars.filter((c) => c && typeof c.name === 'string').map((c) => ({
    name: c.name, cls: c.cls, tier: Number.isInteger(c.tier) ? c.tier : 0, level: Number.isFinite(c.level) ? c.level : 1, resets: Number.isFinite(c.resets) ? c.resets : 0,
  }));
}
