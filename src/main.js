// =============================================================================
// Forja-deira — ponto de entrada. Valida o ambiente, carrega o save, monta a cidade
// da tela de título, registra a entrada e inicia o laço único do jogo.
// =============================================================================
import { applyFeelSettings } from './core/config.js';
import { loopStats, reportError, startLoop } from './core/loop.js';
import { G, loadSave, S } from './core/state.js';
import { TILE } from './core/util.js';
import { installDebugHook } from './debug.js';
import { Sfx } from './engine/audio.js';
import { updateParticles, updateRings } from './engine/effects.js';
import { Music, MUSIC_LEVELS, musicLevel } from './engine/music.js';
import { updateFx } from './engine/skillfx.js';
import { applyQuality, camTarget, renderFrame, resize, setOutline } from './engine/renderer.js';
import { buildTitleBackdrop, returnToTitle } from './game/session.js';
import { initInput } from './input/input.js';
import { updatePlayScene } from './scenes/playScene.js';
import { updateTitleScene } from './scenes/titleScene.js';
import { initCursor } from './ui/cursor.js';
import { initDragDrop } from './ui/dragdrop.js';
import { initDrawer } from './ui/drawer.js';
import { initDialogs } from './ui/npcDialogs.js';
import { initPaneActions } from './ui/paneActions.js';
import { initPause } from './ui/pause.js';
import { initTitle, renderTitle } from './ui/title.js';

function frame(dt) {
  // efeitos seguem o tempo da simulação: congelam na pausa e desaceleram na micro-pausa
  let fxDt = dt;
  if (G.mode === 'play') fxDt = updatePlayScene(dt);
  else updateTitleScene(dt);
  updateParticles(fxDt);
  Music.tick();
  updateRings(fxDt);
  updateFx(fxDt);
  renderFrame();
}

function boot() {
  loadSave();
  applyFeelSettings(S.settings);
  applyQuality(S.settings.quality || 'media');
  setOutline(S.settings.outline !== false);
  Sfx.on = S.settings.sound;
  Music.setVolume(MUSIC_LEVELS[musicLevel(S.settings)].v);
  Music.play('town'); // tela de título: a cidade ao fundo
  // o navegador só libera o áudio depois de um gesto; a música da tela de título começa no primeiro
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => Sfx.init(), { once: true, capture: true });
  window.addEventListener('resize', resize);
  initCursor();
  initInput();
  initDrawer();
  initDialogs();
  initPaneActions();
  initDragDrop();
  initTitle();
  initPause(returnToTitle);
  buildTitleBackdrop();
  camTarget.set(23 * TILE, 0, 23 * TILE);
  renderTitle();
  resize();
  installDebugHook(loopStats);
  startLoop(frame, reportError);
  window.__FORJA_BOOTED = true;
}

boot();
