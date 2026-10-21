// ---------- laço principal ----------
// Um único requestAnimationFrame para o jogo inteiro. O próximo quadro é agendado
// antes de atualizar, então uma exceção num sistema não congela o jogo: ela é
// registrada (uma vez por mensagem) e o quadro seguinte roda normalmente.
import { CONFIG } from './config.js';

const loop = { running: false, last: 0, due: 0, step: null, errors: new Map(), onError: null, frames: 0, skipped: 0, pacer: null };

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

/**
 * Limite de quadros: `fn()` devolve os quadros por segundo desejados (0 = sem limite). Telas de
 * 90/120 Hz chamam o requestAnimationFrame mais vezes; os quadros adiantados são pulados (sem
 * simular nem desenhar), o que corta o trabalho da GPU e da CPU pela metade numa tela de 120 Hz.
 */
export function setFramePacer(fn) { loop.pacer = fn; }

/** Quadros por segundo desejados no momento (0 = sem limite: segue a tela). */
export function frameFps() { return loop.fps || 0; }

/** true se este quadro deve rodar. Acumula o horário previsto, então 45 numa tela de 60 Hz dá 3 de 4. */
export function paceFrame(st, now, fps) {
  if (!(fps > 0)) { st.due = now; return true; }
  const iv = 1000 / fps, tol = Math.min(4, iv * 0.25);
  if (now < st.due - tol) return false;
  st.due = now - st.due > iv * 2 ? now + iv : st.due + iv; // atrasado demais (travada, aba voltando): recomeça
  return true;
}

function tick(now) {
  requestAnimationFrame(tick);
  let fps = 0;
  if (loop.pacer) { try { fps = loop.pacer(); } catch { fps = 0; } }
  loop.fps = fps;
  if (!paceFrame(loop, now, fps)) { loop.skipped++; return; }
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
  return { running: loop.running, frames: loop.frames, skipped: loop.skipped, errors: [...loop.errors.entries()] };
}
