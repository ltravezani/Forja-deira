// ---------- cena de jogo: simulação + interface com cadências próprias ----------
import { CONFIG } from '../core/config.js';
import { guard } from '../core/loop.js';
import { G, persist, UI } from '../core/state.js';
import { $ } from '../core/util.js';
import { simDelta } from '../game/feel.js';
import { autoEquip, autoEquipOn } from '../game/inventory.js';
import { updateWorld } from '../game/world.js';
import { updateHover } from '../input/picking.js';
import { Drag } from '../ui/dragdrop.js';
import { renderPaneIfChanged } from '../ui/drawer.js';
import { hudTick } from '../ui/hud.js';
import { updateOverlay } from '../ui/labels.js';
import { drawMinimap } from '../ui/minimap.js';
import { questUiTick } from '../ui/questUi.js';
import { panelHold, showHeld } from '../ui/touch.js';

const T = { hud: 0, minimap: 0, save: 0, pane: 0 };

/** Atualiza a cena de jogo e devolve o delta simulado (0 em pausa; reduzido na micro-pausa de impacto). */
export function updatePlayScene(dt) {
  const L = CONFIG.loop;
  if (G.paused) { guard('rótulos', updateOverlay); return 0; }
  // toque fora da cidade: painel ou diálogo aberto segura a simulação (o herói não apanha sem ver)
  const held = panelHold();
  showHeld(held && $('#bigmap').hidden); // o mapa ampliado já ocupa a tela: sem o aviso por cima da legenda
  if (held) { guard('rótulos', updateOverlay); if ((T.hud -= dt) <= 0) { T.hud = L.hudInterval; guard('hud', hudTick); } return 0; }
  guard('seleção', updateHover);
  const sim = simDelta(dt);
  guard('mundo', updateWorld, sim);
  guard('rótulos', updateOverlay);
  if ((T.hud -= dt) <= 0) { T.hud = L.hudInterval; guard('hud', hudTick); guard('missões', questUiTick); }
  if ((T.minimap -= dt) <= 0) { T.minimap = L.minimapInterval; guard('minimapa', drawMinimap); }
  if ((T.save += dt) > L.autosaveInterval) { T.save = 0; persist(); }
  if (G.autoEqT > 0 && (G.autoEqT -= dt) <= 0) { G.autoEqT = 0; if (autoEquipOn()) guard('auto-equipar', autoEquip, false); }
  if ((T.pane -= dt) <= 0) {
    T.pane = L.paneInterval;
    if (UI.paneDirty && !$('#drawer').hidden && !paneBusy()) guard('painel', renderPaneIfChanged);
  }
  return sim;
}

/** Não redesenha o painel enquanto o jogador interage com ele (clique, arrasto ou campo em foco). */
function paneBusy() {
  const a = document.activeElement;
  return UI.ptr || Drag.on || (a && /INPUT|SELECT/.test(a.tagName) && $('#pane').contains(a));
}
