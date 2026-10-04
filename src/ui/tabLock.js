// ---------- trava de aba única ----------
// Duas abas do jogo abertas gravariam o save uma por cima da outra (vence quem
// grava por último). A aba aberta primeiro fica com o save; as outras avisam e
// não gravam (SaveGuard.readOnly) até o jogador escolher "Usar esta aba".
import { persist, SaveGuard } from '../core/state.js';

const CHANNEL = 'forjadeira.tabs';
const me = Math.random().toString(36).slice(2);
const born = Date.now();
let bc = null;

/** A outra aba é mais antiga (ou empata e perde no id): ela fica com o save. */
const older = (m) => m.born < born || (m.born === born && m.from < me);

function block() {
  if (SaveGuard.readOnly) return;
  SaveGuard.readOnly = true;
  showBanner();
}

function showBanner() {
  if (typeof document === 'undefined' || document.getElementById('tabLockBar')) return;
  const el = document.createElement('div');
  el.id = 'tabLockBar';
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;max-width:calc(100% - 32px);box-sizing:border-box;' +
    'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:center;padding:8px 12px;border-radius:6px;' +
    'background:#2a1416;border:1px solid #c9a24a;color:#f2e6c8;font:13px/1.35 system-ui,sans-serif;box-shadow:0 4px 16px #0008';
  const t = document.createElement('span');
  t.textContent = 'O jogo está aberto em outra aba. Esta aba não salva o progresso, para não apagar o da outra.';
  const b = document.createElement('button');
  b.className = 'btn sm gold';
  b.textContent = 'Usar esta aba';
  b.addEventListener('click', takeOver);
  el.append(t, b);
  document.body.appendChild(el);
}

/** Pede para a outra aba gravar e parar; depois recarrega esta com o save mais novo. */
function takeOver() {
  if (bc) bc.postMessage({ type: 'takeover', from: me, born });
  setTimeout(() => location.reload(), 350);
}

/** Liga a trava (uma vez, no boot). Sem BroadcastChannel o jogo segue como antes. */
export function initTabLock() {
  if (typeof BroadcastChannel !== 'function') return;
  try { bc = new BroadcastChannel(CHANNEL); } catch { return; }
  bc.onmessage = (e) => {
    const m = e.data || {};
    if (m.from === me || SaveGuard.readOnly) return; // aba bloqueada não responde nem disputa
    if (m.type === 'hello') bc.postMessage({ type: 'here', from: me, born });
    else if (m.type === 'here' && older(m)) block();
    else if (m.type === 'takeover') { persist(); block(); }
  };
  bc.postMessage({ type: 'hello', from: me, born });
}
