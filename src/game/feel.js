// ---------- sensação de jogo: micro-pausa de impacto ----------
// Um golpe crítico ou o abate de um elite congela a simulação por alguns
// centésimos de segundo (o render continua), realçando o impacto. Intensidade
// e desligamento em CONFIG.feel (Opções e "reduzir movimento").

const feel = { stop: 0 };

export function hitStop(seconds) {
  if (seconds > 0) feel.stop = Math.max(feel.stop, Math.min(0.12, seconds));
}
/** Converte o delta real no delta da simulação (quase parado durante a micro-pausa). */
export function simDelta(dt) {
  if (feel.stop <= 0) return dt;
  feel.stop -= dt;
  return dt * 0.08;
}
