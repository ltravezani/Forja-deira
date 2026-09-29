// ---------- simulação de um quadro de jogo ----------
import { guard } from '../core/loop.js';
import { G } from '../core/state.js';
import { rand, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { camera, updateCamera } from '../engine/renderer.js';
import { updateAllies } from './allies.js';
import { updateLootVisuals } from './loot.js';
import { rebuildMonsterGrid, updateMonsters } from './monsters.js';
import { updateNpcs, updatePortals } from './npcs.js';
import { updatePlayer } from './player.js';
import { updateProjectiles } from './projectiles.js';
import { updateTownLife } from './townlife.js';
import { paintMinimapTile } from '../ui/minimap.js';
import { updateTorchLights } from '../world/level.js';

const _frustum = new THREE.Frustum(), _fm = new THREE.Matrix4(), _fs = new THREE.Sphere();
/** Teste de visibilidade contra a câmera do último quadro. */
export function inView(x, y, z, r) {
  _fs.center.set(x, y, z); _fs.radius = r;
  return _frustum.intersectsSphere(_fs);
}
function updateFrustum() {
  camera.updateMatrixWorld();
  _fm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_fm);
}

/** Eventos agendados (impactos atrasados, explosões): cada um isolado para não derrubar os outros. */
function runDelayed(dt) {
  const list = G.delayed;
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    d.t -= dt;
    if (d.t > 0) continue;
    list.splice(i, 1);
    guard('evento', d.fn);
  }
}

const AMBIENT = { forest: 0xd8ff8a, caves: 0x8ad0ff, ruins: 0xd8c8a8, castle: 0xff8a8a, abyss: 0xff7a2a, tw_granite: 0xd8e0ff, tw_arcane: 0xc89aff, tw_storm: 0x9af4ff, tw_void: 0xff6ad0 };
/** Partículas de ambiente: vaga-lumes na floresta, brasas no abismo, poeira nas ruínas. */
function ambient(p) {
  if (G.zone === 'town' || Math.random() >= 0.3) return;
  // na torre as fagulhas sobem (grav negativa), como se a torre puxasse tudo para o alto
  const up = G.zone === 'tower';
  emit(p.x + (rand() - 0.5) * 30, 0.5 + rand() * 3, p.z + (rand() - 0.5) * 24, { n: 1, color: AMBIENT[G.biome], speed: 0.3, up: up ? 1.2 : 0.3, life: 3, size: 0.5, grav: up ? -0.35 : G.biome === 'abyss' ? 0.8 : 0.05, alpha: 0.7 });
}

const EXPLORE_R = 7;
let lastTile = -1;
/** Revela o minimapa em volta do herói (só quando ele muda de tile). */
function explore(p) {
  const L = G.L;
  const px = Math.round(p.x / TILE), pz = Math.round(p.z / TILE), key = pz * L.W + px;
  if (key === lastTile && G.explored[key]) return;
  lastTile = key;
  for (let dz = -EXPLORE_R; dz <= EXPLORE_R; dz++) for (let dx = -EXPLORE_R; dx <= EXPLORE_R; dx++) {
    const x = px + dx, z = pz + dz;
    if (x < 0 || z < 0 || x >= L.W || z >= L.H || dx * dx + dz * dz > EXPLORE_R * EXPLORE_R) continue;
    const i = z * L.W + x;
    if (!G.explored[i]) { G.explored[i] = 1; paintMinimapTile(L, x, z); }
  }
}

export function updateWorld(dt) {
  G.time += dt;
  updateFrustum();
  rebuildMonsterGrid();
  updatePlayer(dt);
  if (G.zone !== 'town') updateMonsters(dt);
  updateAllies(dt);
  updateProjectiles(dt);
  runDelayed(dt);
  updateNpcs(dt);
  if (G.zone === 'town') updateTownLife(dt);
  updateLootVisuals(dt);
  updatePortals(dt);
  const p = G.player;
  explore(p);
  updateCamera(p.x, p.z, dt);
  updateTorchLights(p.x, p.z, G.time);
  ambient(p);
}
