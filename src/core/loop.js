// ---------- laço principal ----------
// Um único requestAnimationFrame para o jogo inteiro. O próximo quadro é agendado
// antes de atualizar, então uma exceção num sistema não congela o jogo: ela é
// registrada (uma vez por mensagem) e o quadro seguinte roda normalmente.
import { CONFIG } from './config.js';

const loop = { running: false, last: 0, step: null, errors: new Map(), onError: null, frames: 0 };

/** Inicia o laço. Chamadas repetidas são ignoradas (evita dois loops simultâneos). */
export function startLoop(step, onError) {
  if (loop.running) return false;
  loop.running = true;
  loop.step = step;
  loop.onError = onError || null;
  loop.last = performance.now();
  requestAnimationFrame(tick);
  return true;
}

function tick(now) {
  requestAnimationFrame(tick);
  const raw = (now - loop.last) / 1000;
  loop.last = now;
  // relógio que volta de uma aba em segundo plano ou de uma travada longa: limita o passo
  const dt = Number.isFinite(raw) && raw > 0 ? Math.min(CONFIG.loop.maxDt, raw) : 0;
  loop.frames++;
  try {
    loop.step(dt);
  } catch (err) {
    reportError('loop', err);
  }
}

/**
 * Executa `fn` protegido: se falhar, registra e segue. Usado pelos sistemas do
 * quadro para que um erro isolado (ex.: uma entidade inválida) não derrube os outros.
 */
export function guard(name, fn, a) {
  try {
    return fn(a);
  } catch (err) {
    reportError(name, err);
    return undefined;
  }
}

export function reportError(where, err) {
  const key = where + ':' + (err && err.message);
  const n = (loop.errors.get(key) || 0) + 1;
  loop.errors.set(key, n);
  if (n === 1) {
    console.error('[Forja-deira] erro em ' + where + ':', err);
    if (loop.onError) loop.onError(where, err);
  }
}

/** Contadores para diagnóstico e testes automatizados. */
export function loopStats() {
  return { running: loop.running, frames: loop.frames, errors: [...loop.errors.entries()] };
}
