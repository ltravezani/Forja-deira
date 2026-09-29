// ---------- gancho de depuração (usado pelos testes automatizados de fumaça) ----------
import { animateModel, buildModel } from './art/models.js';
import { CONFIG } from './core/config.js';
import { G, S } from './core/state.js';
import { R } from './core/util.js';
import { CAM, camera, camTarget, renderer, scene, world } from './engine/renderer.js';
import { hurtPlayer, killMonster } from './game/combat.js';
import { MON } from './game/data.js';
import { followPath, pathTo } from './game/movement.js';
import { recalc } from './game/player.js';
import { castSkill, castSlot } from './game/skills.js';
import { townLifeCount } from './game/townlife.js';
import { updateWorld } from './game/world.js';
import { enterDungeon, enterTower, enterTown, inSafe } from './game/zones.js';
import { skillIconURI } from './ui/icons.js';
import { findPath } from './world/grid.js';
import { getLevelMeshes } from './world/level.js';

export function installDebugHook(loopStats) {
  window.__FORJA_DEBUG = {
    G, R, MON, CONFIG, skillIconURI, buildModel, animateModel, camTarget, updateWorld, pathTo, findPath, inSafe, followPath,
    renderer, scene, camera, CAM, levelMeshes: getLevelMeshes, getSave: () => S, enterDungeon, enterTower, enterTown,
    castSkill, castSlot, killMonster, hurtPlayer, recalc, loopStats,
    worldChildren: () => world.children.length, townLifeCount,
  };
}
