// ---------- registro de mensagens, avisos centrais e nome da zona ----------
import { $, esc } from '../core/util.js';

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
/** Partes curtas separadas por " · " ("Andar 1", "nv 20–26") não quebram por dentro; nomes longos podem quebrar. */
function partsHtml(text) { return String(text).split(' · ').map((p) => (p.length <= 14 ? '<span class="nw">' + esc(p) + '</span>' : esc(p))).join(' · '); }
export function toast(big, small) {
  const t = dom('toast');
  dom('toastBig').innerHTML = partsHtml(big);
  dom('toastSmall').textContent = small || '';
  t.classList.remove('show');
  void t.offsetWidth; // reinicia a animação CSS (1 reflow, só neste evento raro)
  t.classList.add('show');
}
/** Subtítulo da zona: a parte "Monstros nv …" ganha a classe zmon (o celular a esconde para poupar espaço). */
function subHtml(text) {
  const parts = String(text).split(' · ');
  const keep = parts.filter((p) => !/^monstros nv/i.test(p)), mon = parts.filter((p) => /^monstros nv/i.test(p));
  if (!mon.length) return partsHtml(text);
  const m = partsHtml(mon.join(' · '));
  return keep.length ? partsHtml(keep.join(' · ')) + '<span class="zmon"> · ' + m + '</span>' : '<span class="zmon">' + m + '</span>';
}
export function setZoneText(a, b) { dom('zoneName').innerHTML = partsHtml(a); dom('zoneSub').innerHTML = subHtml(b); }
/** Limpa o registro de mensagens (ao voltar para a tela de título). */
export function clearLog() { dom('log').textContent = ''; }
