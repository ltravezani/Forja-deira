// ---------- gancho de depuração (usado pelos testes automatizados de fumaça) ----------
import { gltfHit, gltfRise, gltfStats, setGltfEnabled } from './art/gltfModels.js';
import { animateModel, buildModel } from './art/models.js';
import { cloudDebug } from './core/cloud.js';
import { CONFIG } from './core/config.js';
import { G, S } from './core/state.js';
import { R } from './core/util.js';
import { CAM, camera, camTarget, renderer, scene, world } from './engine/renderer.js';
import { hurtPlayer, killMonster } from './game/combat.js';
import { MON } from './game/data.js';
import { followPath, pathTo } from './game/movement.js';
import { dropLoot } from './game/loot.js';
import { spawnMonster } from './game/monsters.js';
import { buildPlayerModel, recalc } from './game/player.js';
import { castSkill, castSlot } from './game/skills.js';
import { townLifeCount } from './game/townlife.js';
import { updateWorld } from './game/world.js';
import { enterDungeon, enterEden, enterTower, enterTown, inSafe } from './game/zones.js';
import { edenState } from './game/eden.js';
import { spawnAlly } from './game/allies.js';
import { tryDodge } from './game/dodge.js';
import { questEvent } from './game/quests.js';
import { openQuestBoard } from './ui/questUi.js';
import { telegraphCircle, telegraphCone } from './engine/telegraph.js';
import { towerState } from './game/tower.js';
import { glyph, skillIconURI } from './ui/icons.js';
import { drawWeaponIcons } from './art/weaponIcons.js';
import { closeModal, openNpc } from './ui/npcDialogs.js';
import { findPath, lineClear } from './world/grid.js';
import { getLevelMeshes } from './world/level.js';

export function installDebugHook(loopStats) {
  window.__FORJA_DEBUG = {
    G, R, MON, CONFIG, skillIconURI, glyph, drawWeaponIcons, buildModel, animateModel, camTarget, updateWorld, pathTo, findPath, inSafe, followPath,
    renderer, scene, camera, CAM, levelMeshes: getLevelMeshes, getSave: () => S, enterDungeon, enterTower, enterTown,
    castSkill, castSlot, killMonster, hurtPlayer, recalc, buildPlayerModel, dropLoot, loopStats, openNpc, closeModal,
    worldChildren: () => world.children.length, townLifeCount, gltfStats, setGltfEnabled, spawnMonster, cloudDebug,
    enterEden, edenState, towerState, lineClear, gltfHit, gltfRise,
    tryDodge, questEvent, openQuestBoard, spawnAlly, telegraphCircle, telegraphCone,
  };
}
