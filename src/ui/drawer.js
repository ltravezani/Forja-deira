// ---------- painel lateral (abas), menu do HUD e redesenho do painel ----------
import { G, UI } from '../core/state.js';
import { $ } from '../core/util.js';
import { sendPetToSell } from '../game/allies.js';
import { townPortal } from '../game/player.js';
import { InventoryUI } from './inventoryPane.js';
import { closeItemPopups } from './itemTooltip.js';
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
export function closeDrawer() { $('#drawer').hidden = true; UI.tab = null; markMenu(null); lastHtml = ''; closeItemPopups(); }
export function refreshPaneSoon() { UI.paneDirty = true; }
/** Redesenho periódico (painel marcado como sujo): pula quando o HTML não mudou. */
export function renderPaneIfChanged() { renderPane(true); }
export function renderPane(onlyIfChanged) {
  UI.paneDirty = false;
  const pane = $('#pane');
  const st = pane.scrollTop;
  // inventário mais largo (personagem + mochila lado a lado no desktop)
  $('#drawer').classList.toggle('inv-open', UI.tab === 'inv');
  if (UI.tab === 'inv') {
    // montado uma vez; cada atualização troca só os slots e células que mudaram
    lastHtml = '';
    InventoryUI.render(pane);
    return;
  }
  closeItemPopups();
  const f = { char: paneChar, skills: paneSkills, loot: paneLoot, opts: paneOpts }[UI.tab];
  if (!f) return;
  const html = f();
  // nada mudou: não recria os ~60 elementos do painel (cada troca refaz layout, ícones e filtros)
  if (onlyIfChanged === true && html === lastHtml && pane.firstChild) return;
  lastHtml = html;
  pane.innerHTML = html;
  pane.scrollTop = st;
}
let lastHtml = '';

/** Abas do painel lateral e botões do menu do HUD. */
export function initDrawer() {
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) openTab(b.dataset.t); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  document.querySelectorAll('.menu [data-tab]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  $('#btnPortal').addEventListener('click', townPortal);
  $('#btnPet').addEventListener('click', sendPetToSell);
}
