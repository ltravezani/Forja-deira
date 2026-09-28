// ---------- painel lateral (abas), menu do HUD e redesenho do painel ----------
import { G, UI } from '../core/state.js';
import { $ } from '../core/util.js';
import { sendPetToSell } from '../game/allies.js';
import { townPortal } from '../game/player.js';
import { paneInv } from './inventoryPane.js';
import { paneChar, paneLoot, paneOpts, paneSkills } from './panes.js';

export function openTab(t) {
  if (G.mode !== 'play') return;
  if (UI.tab === t && !$('#drawer').hidden) { closeDrawer(); return; }
  UI.tab = t;
  $('#drawer').hidden = false;
  document.querySelectorAll('#tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  markMenu(t);
  renderPane();
}
/** Destaca no menu de ícones o painel aberto. */
function markMenu(t) {
  document.querySelectorAll('.menu [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
}
export function closeDrawer() { $('#drawer').hidden = true; UI.tab = null; markMenu(null); }
export function refreshPaneSoon() { UI.paneDirty = true; }
export function renderPane() {
  UI.paneDirty = false;
  const pane = $('#pane');
  const st = pane.scrollTop;
  const f = { char: paneChar, inv: paneInv, skills: paneSkills, loot: paneLoot, opts: paneOpts }[UI.tab];
  if (!f) return;
  pane.innerHTML = f();
  pane.scrollTop = st;
}

/** Abas do painel lateral e botões do menu do HUD. */
export function initDrawer() {
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) openTab(b.dataset.t); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  document.querySelectorAll('.menu [data-tab]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  $('#btnPortal').addEventListener('click', townPortal);
  $('#btnPet').addEventListener('click', sendPetToSell);
}
