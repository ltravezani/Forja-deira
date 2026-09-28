// ---------- registro de mensagens, avisos centrais e nome da zona ----------
import { $ } from '../core/util.js';

const MAX_LINES = 9;
const el = {};
function dom(id) { return el[id] || (el[id] = $('#' + id)); }

/** Adiciona uma linha ao registro (as antigas esmaecem via CSS, sem timers). */
export function log(text, cls) {
  const box = dom('log');
  const p = document.createElement('p');
  p.className = cls || '';
  p.textContent = text;
  box.appendChild(p);
  while (box.children.length > MAX_LINES) box.firstChild.remove();
}
/** Aviso grande no centro da tela (troca de andar, chefe derrotado, evolução). */
export function toast(big, small) {
  const t = dom('toast');
  dom('toastBig').textContent = big;
  dom('toastSmall').textContent = small || '';
  t.classList.remove('show');
  void t.offsetWidth; // reinicia a animação CSS (1 reflow, só neste evento raro)
  t.classList.add('show');
}
export function setZoneText(a, b) { dom('zoneName').textContent = a; dom('zoneSub').textContent = b; }
/** Limpa o registro de mensagens (ao voltar para a tela de título). */
export function clearLog() { dom('log').textContent = ''; }
