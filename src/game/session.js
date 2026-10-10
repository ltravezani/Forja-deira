// ---------- sessão: entrar no jogo com um personagem e voltar à tela de título ----------
import { disposeModel } from '../art/models.js';
import { G, persist, S, sanitizeCharacter, UI } from '../core/state.js';
import { $, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { resetCamera, world } from '../engine/renderer.js';
import { clearAllies, spawnAlly } from './allies.js';
import { spawnNpcs } from './npcs.js';
import { buildPlayerModel, cancelChannel, fillVitals, newPlayer, recalc } from './player.js';
import { resetCooldowns } from './skills.js';
import { clearWorld, enterTown } from './zones.js';
import { closeDrawer } from '../ui/drawer.js';
import { updateLowHp } from '../ui/feedback.js';
import { buildSlots, hudTick, resetHudCache } from '../ui/hud.js';
import { clearLog, log } from '../ui/log.js';
import { closeBigMap } from '../ui/minimap.js';
import { closeModal } from '../ui/npcDialogs.js';
import { setPaused } from '../ui/pause.js';
import { renderTitle, titlePreview } from '../ui/title.js';
import { buildLevel } from '../world/level.js';
import { genTown } from '../world/levelgen.js';

function removePlayerModel() {
  const p = G.player;
  if (p && p.model) { world.remove(p.model.root); disposeModel(p.model); p.model = null; }
}

/** Zera o que pertence à sessão anterior (canalização, seleção, histórico de drops). */
function resetSessionState() {
  cancelChannel();
  G.dropLog = [];
  G.killCount = 0;
  G.autoEqT = 0;
  UI.sel = null;
  UI.smithSel = null;
  UI.tab = null;
  UI.confirmWipe = false;
}

/** Cidade de fundo da tela de título (sem jogador, rótulos escondidos). */
export function buildTitleBackdrop() {
  clearWorld();
  newPlayer();
  G.zone = 'town';
  G.L = genTown();
  buildLevel(G.L);
  spawnNpcs(G.L);
  G.explored = new Uint8Array(G.L.W * G.L.H);
  for (const n of G.npcs) n.label.style.display = 'none';
  for (const pt of [G.townPortal, G.edenPortal]) if (pt) pt.label.style.display = 'none';
}

/** Entra no jogo com o personagem `i` do save. */
export function startGame(i) {
  const ch = S.chars[i];
  if (!ch) return;
  sanitizeCharacter(ch);
  Sfx.init();
  Sfx.on = S.settings.sound;
  titlePreview(null);
  resetCamera();
  S.active = i;
  G.ch = ch;
  resetSessionState();
  clearWorld();
  clearAllies(false);
  removePlayerModel();
  newPlayer();
  G.buffs = [];
  resetCooldowns();
  recalc();
  fillVitals();
  buildPlayerModel();
  spawnAlly('pet', 0, 0);
  enterTown();
  $('#title').hidden = true;
  $('#hud').hidden = false;
  G.mode = 'play';
  setPaused(false);
  resetHudCache();
  buildSlots();
  hudTick();
  log('Bem-vindo, ' + ch.name + '. Fale com a Guardiã Nyx para abrir um portal. EXP ' + R.expRate(ch.resets) + 'x.', 'sys');
}

/** Salva e volta à tela de título sem recarregar a página (limpa mundo, aliados, HUD e diálogos). */
export function returnToTitle() {
  persist();
  setPaused(false);
  resetSessionState();
  updateLowHp(1, false);
  closeModal();
  closeDrawer();
  closeBigMap();
  clearAllies(false);
  removePlayerModel();
  G.ch = null;
  G.mode = 'title';
  G.buffs = [];
  resetCooldowns();
  $('#hud').hidden = true;
  $('#title').hidden = false;
  clearLog();
  buildTitleBackdrop();
  resetCamera();
  UI.titleMode = 'select';
  UI.titleIdx = S.active;
  renderTitle();
}
