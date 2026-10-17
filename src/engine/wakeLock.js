/**
 * "Não bloquear a tela" (Opções): pede ao navegador para manter a tela acesa
 * enquanto o jogo está aberto (Screen Wake Lock API). O navegador solta o
 * pedido sozinho quando a aba some (troca de app, tela desligada no botão);
 * ao voltar, pedimos de novo.
 */
const WL = { want: false, sentinel: null, pending: false, error: '' };

export const wakeLockSupported = () => typeof navigator !== 'undefined' && !!navigator.wakeLock && typeof navigator.wakeLock.request === 'function';

/** Estado para a tela de Opções: 'off' | 'on' | 'wait' | 'unsupported' | 'error'. */
export function wakeLockState() {
  if (!WL.want) return 'off';
  if (!wakeLockSupported()) return 'unsupported';
  if (WL.sentinel && !WL.sentinel.released) return 'on';
  return WL.error ? 'error' : 'wait';
}

async function acquire() {
  if (!WL.want || !wakeLockSupported() || WL.pending || document.visibilityState !== 'visible') return;
  if (WL.sentinel && !WL.sentinel.released) return;
  WL.pending = true;
  try {
    const s = await navigator.wakeLock.request('screen');
    WL.error = '';
    if (!WL.want) { s.release().catch(() => {}); return; }
    WL.sentinel = s;
    s.addEventListener('release', () => { if (WL.sentinel === s) WL.sentinel = null; });
  } catch (e) {
    // sem HTTPS, bateria fraca/economia de energia ou política do navegador
    WL.error = (e && e.name) || 'erro';
  } finally { WL.pending = false; }
}

function release() {
  const s = WL.sentinel;
  WL.sentinel = null;
  if (s && !s.released) s.release().catch(() => {});
}

let inited = false;
/** Liga/desliga conforme a opção salva; seguro chamar várias vezes. */
export function applyWakeLock(settings) {
  WL.want = !!(settings && settings.keepAwake);
  if (!inited && typeof document !== 'undefined') {
    inited = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
    // alguns navegadores só liberam depois de um toque: tenta de novo no primeiro gesto
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (WL.want && !WL.sentinel) acquire(); }, { capture: true, passive: true });
  }
  if (WL.want) return acquire();
  WL.error = '';
  release();
}
