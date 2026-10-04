// ---------- pausa ----------
// Esc (sem painel ou diálogo aberto) pausa; a janela perder o foco também pausa,
// se a opção estiver ligada. Durante a pausa a simulação para e o render continua.
import { G, S } from '../core/state.js';
import { $ } from '../core/util.js';
import { KEYS, mouse } from '../input/inputState.js';

export function setPaused(on) {
  on = !!on && G.mode === 'play';
  G.paused = on;
  const el = $('#pause');
  if (el) el.hidden = !on;
  if (on) { mouse.down = false; KEYS.w = KEYS.a = KEYS.s = KEYS.d = false; }
}
export function togglePause() { setPaused(!G.paused); }

/** onQuit: botão "Voltar à tela inicial"; onOptions: botão "Opções" (despausa e abre o painel). */
export function initPause(onQuit, onOptions) {
  $('#pause').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pause]');
    if (!b) return;
    if (b.dataset.pause === 'resume') setPaused(false);
    else if (b.dataset.pause === 'title') onQuit();
    else if (b.dataset.pause === 'opts') { setPaused(false); if (onOptions) onOptions(); }
  });
  const autoPause = () => { if (G.mode === 'play' && S.settings.autoPause !== false && !G.paused) setPaused(true); };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
}
