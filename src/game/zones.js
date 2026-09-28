// ---------- limpeza / carregamento de zonas ----------
import { G, persist } from '../core/state.js';
import { R, rand, TILE } from '../core/util.js';
import { clearEffects } from '../engine/effects.js';
import { Music } from '../engine/music.js';
import { resetFloatText } from '../engine/overlay.js';
import { camTarget, resize, world } from '../engine/renderer.js';
import { clearAllies } from './allies.js';
import { clearLoot } from './loot.js';
import { clearMonsters, spawnMonster } from './monsters.js';
import { clearNpcs, spawnNpcs } from './npcs.js';
import { clearProjectiles } from './projectiles.js';
import { log, setZoneText, toast } from '../ui/log.js';
import { resetMinimap } from '../ui/minimap.js';
import { BIOMES, floorLevel } from '../world/biomes.js';
import { gy, walkable } from '../world/grid.js';
import { kit, kitMat } from '../world/kit.js';
import { buildLevel } from '../world/level.js';
import { genDungeon, genTown } from '../world/levelgen.js';

/** A cidade é a única zona segura. */
export function inSafe() { return G.zone === 'town'; }
export function hasTownServices() { return G.zone === 'town'; }

/** Descarta tudo que pertence à zona atual (o pet e o jogador continuam). */
export function clearWorld() {
  clearMonsters();
  clearProjectiles();
  G.delayed.length = 0;
  clearLoot();
  for (const b of G.breakables) world.remove(b.mesh);
  G.breakables.length = 0;
  clearNpcs();
  clearAllies(true);
  clearEffects();
  resetFloatText();
}
function placePlayer(L) {
  const p = G.player;
  p.x = L.start.x * TILE; p.z = L.start.z * TILE;
  p.path = null; p.target = null; p.dash = null;
  if (p.model) p.model.root.position.set(p.x, gy(p.x, p.z), p.z);
  camTarget.set(p.x, 0, p.z);
  if (G.pet) { G.pet.x = p.x - 1.5; G.pet.z = p.z + 1; }
  G.explored = new Uint8Array(L.W * L.H);
  resetMinimap(L);
}
export function enterTown() {
  clearWorld();
  G.zone = 'town'; G.floor = 0;
  Music.play('town');
  G.L = genTown();
  buildLevel(G.L);
  resize();
  spawnNpcs(G.L);
  placePlayer(G.L);
  G.hp = G.st.maxHp; G.mp = G.st.maxMp; G.ag = G.st.maxAg;
  setZoneText(BIOMES.town.name, 'Cidade segura');
  log('Você está em ' + BIOMES.town.name + '.', 'sys');
  persist();
}
export function enterDungeon(biome, floor) {
  clearWorld();
  G.zone = 'dungeon'; G.biome = biome; G.floor = floor;
  Music.play(biome);
  const seed = R.hash32(biome, floor, G.ch.name, Date.now());
  G.L = genDungeon(biome, floor, seed);
  buildLevel(G.L);
  resize();
  placePlayer(G.L);
  const B = BIOMES[biome], lvl = floorLevel(biome, floor);
  let pack = 1;
  G.L.spawns.forEach((s) => {
    const wx = s.x * TILE, wz = s.z * TILE;
    if (s.boss) {
      spawnMonster(B.boss, wx, wz, lvl + 6, { pack });
      for (let i = 0; i < 3; i++) spawnMonster(B.monsters[i % 3], wx + (rand() - 0.5) * 5, wz + (rand() - 0.5) * 5, lvl + 2, { pack });
    } else {
      const kind = B.monsters[Math.floor(rand() * B.monsters.length)];
      for (let i = 0; i < s.size; i++) {
        let x = wx + (rand() - 0.5) * 4, z = wz + (rand() - 0.5) * 4;
        if (!walkable(G.L, x, z)) { x = wx; z = wz; }
        const k2 = rand() < 0.75 ? kind : B.monsters[Math.floor(rand() * B.monsters.length)];
        spawnMonster(k2, x, z, lvl + Math.floor(rand() * 4), { pack, elite: s.elite && i === 0 });
      }
    }
    pack++;
  });
  G.L.breakables.forEach((b) => spawnBreakable(b.x * TILE, b.z * TILE, biome));
  setZoneText(B.name + ' · Andar ' + floor, 'Monstros nv ' + lvl + '–' + (lvl + 6) + ' · seed ' + R.hex(seed));
  log('Você entrou em ' + B.name + ', andar ' + floor + '. Seed pública ' + R.hex(seed) + '.', 'sys');
  toast(B.name, 'Andar ' + floor);
  persist();
}
function spawnBreakable(x, z, biome) {
  const c = { forest: 0x8a5a2a, caves: 0x6a5a4a, ruins: 0x9a7a5a, castle: 0x7a3a2a, abyss: 0x4a2a2a }[biome];
  const g = new THREE.Group();
  const k = kit(biome === 'ruins' || biome === 'castle' ? 'crate' : 'barrel');
  const body = new THREE.Mesh(k.geo, kitMat());
  body.castShadow = true; body.receiveShadow = true;
  body.rotation.y = Math.random() * 6;
  g.add(body);
  g.position.set(x, gy(x, z), z);
  world.add(g);
  G.breakables.push({ x, z, mesh: g, color: c, broken: false });
}
