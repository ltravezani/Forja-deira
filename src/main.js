// =============================================================================
// Forja-deira — ponto de entrada. Valida o ambiente, carrega o save, monta a cidade
// da tela de título, registra a entrada e inicia o laço único do jogo.
// =============================================================================
import { applyCharSetting, loadGltfModels } from './art/gltfModels.js';
import { applyFeelSettings, autoQuality, CONFIG } from './core/config.js';
import { loopStats, reportError, startLoop } from './core/loop.js';
import { Cloud, cloudTick, initCloud } from './core/cloud.js';
import { G, loadSave, persist, S, UI } from './core/state.js';
import { TILE } from './core/util.js';
import { installDebugHook } from './debug.js';
import { Sfx, sfxVolume } from './engine/audio.js';
import { updateCombatFx } from './engine/combatfx.js';
import { updateParticles, updateRings } from './engine/effects.js';
import { Music, musicVolume } from './engine/music.js';
import { updateFx } from './engine/skillfx.js';
import { updateTelegraphs } from './engine/telegraph.js';
import { applyQuality, camTarget, renderFrame, resize, setBloom, setOutline } from './engine/renderer.js';
import { buildTitleBackdrop, returnToTitle } from './game/session.js';
import { initInput } from './input/input.js';
import { updatePlayScene } from './scenes/playScene.js';
import { updateTitleScene } from './scenes/titleScene.js';
import { initAccount, openAccount, refreshAccountUi, showConflictDialog } from './ui/account.js';
import { initCursor } from './ui/cursor.js';
import { initDragDrop } from './ui/dragdrop.js';
import { initDrawer, openTab } from './ui/drawer.js';
import { initDialogs } from './ui/npcDialogs.js';
import { initPaneActions } from './ui/paneActions.js';
import { initPause } from './ui/pause.js';
import { initTabLock } from './ui/tabLock.js';
import { initQuestUi } from './ui/questUi.js';
import { initTitle, renderTitle, titlePreview } from './ui/title.js';
import { applyUiScale, initTouch } from './ui/touch.js';

function frame(dt) {
  // efeitos seguem o tempo da simulação: congelam na pausa e desaceleram na micro-pausa
  let fxDt = dt;
  if (G.mode === 'play') fxDt = updatePlayScene(dt);
  else updateTitleScene(dt);
  updateParticles(fxDt);
  Music.tick();
  updateRings(fxDt);
  updateFx(fxDt);
  updateCombatFx(fxDt);
  updateTelegraphs(fxDt);
  cloudTick();
  const thr = renderThrottled();
  if (thr !== 'skip') renderFrame(thr === 'slow');
}

/**
 * Pausado, ou com o painel cobrindo a tela inteira (celular), nada se mexe atrás: desenha a
 * ~10 quadros por segundo em vez de 60 (a simulação e a interface seguem no laço normal).
 */
const THR = { last: 0, coverT: 0, cover: false };
/** '' = desenha normal; 'slow' = desenha, mas em ritmo reduzido; 'skip' = pula este quadro. */
function renderThrottled() {
  const now = performance.now();
  if (now - THR.coverT > 250) {
    THR.coverT = now;
    const d = G.mode === 'play' && document.getElementById('drawer');
    THR.cover = !!d && !d.hidden && d.getBoundingClientRect().width >= window.innerWidth * 0.9;
  }
  if (!(G.mode === 'play' && G.paused) && !THR.cover) return '';
  if (now - THR.last < 100) return 'skip';
  THR.last = now;
  return 'slow';
}

/** Primeiro acesso (ou save sem qualidade válida): escolhe pelo aparelho e guarda a escolha. */
function resolveQuality() {
  if (!CONFIG.quality[S.settings.quality]) S.settings.quality = autoQuality();
}

function applySettings() {
  resolveQuality();
  applyCharSetting(S.settings);
  applyFeelSettings(S.settings);
  setBloom(S.settings.bloom);
  applyQuality(S.settings.quality);
  setOutline(S.settings.outline !== false);
  Sfx.on = S.settings.sound;
  Sfx.vol = sfxVolume(S.settings) / 100;
  Music.setVolume(musicVolume(S.settings) / 100);
  applyUiScale(S.settings);
}

/** O save foi trocado pelo da nuvem (ou por uma cópia de segurança): redesenha a tela de título. */
function onSaveReplaced() {
  applySettings();
  UI.titleIdx = null; UI.titleMode = 'select'; UI.confirmDel = -1;
  titlePreview(null);
  if (G.mode === 'title') renderTitle();
  refreshAccountUi();
}

function boot() {
  applySettings();
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
  initPause(returnToTitle, () => openTab('opts'));
  initTouch();
  initAccount();
  initQuestUi();
  buildTitleBackdrop();
  camTarget.set(23 * TILE, 0, 23 * TILE);
  renderTitle();
  resize();
  installDebugHook(loopStats);
  startLoop(frame, reportError);
  window.__FORJA_BOOTED = true;
  initTabLock();
  // grava ao fechar ou esconder a aba, com ou sem nuvem (o autosave é só a cada 15 s);
  // registrado antes da nuvem, que logo depois tenta o último envio
  const saveOnHide = () => { if (G.mode === 'play' && G.ch) persist(); };
  window.addEventListener('pagehide', saveOnHide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveOnHide(); });
  // save na nuvem: nunca atrasa nem impede o jogo (sem chave ou sem internet, segue só local)
  initCloud({ onChange: refreshAccountUi, onConflict: showConflictDialog, onApplied: onSaveReplaced })
    .then((link) => {
      refreshAccountUi();
      if (link === 'recovery') openAccount('newpass');
      else if (link === 'error') openAccount();
      else if (link && !Cloud.conflict) openAccount('account');
    })
    .catch(() => {});
}

// os personagens animados vêm embutidos em base64; se não carregarem, o jogo usa os modelos simples
loadSave();
resolveQuality();
applyCharSetting(S.settings);
loadGltfModels().then(boot, boot);
