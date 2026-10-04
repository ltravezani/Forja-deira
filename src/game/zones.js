// ---------- limpeza / carregamento de zonas ----------
import { G, persist } from '../core/state.js';
import { R, rand, TILE } from '../core/util.js';
import { clearCombatFx } from '../engine/combatfx.js';
import { clearEffects } from '../engine/effects.js';
import { Music } from '../engine/music.js';
import { clearFx } from '../engine/skillfx.js';
import { resetFloatText } from '../engine/overlay.js';
import { camTarget, resize, world } from '../engine/renderer.js';
import { clearAllies } from './allies.js';
import { clearLoot } from './loot.js';
import { clearMonsters, spawnMonster } from './monsters.js';
import { clearNpcs, spawnNpcs } from './npcs.js';
import { clearProjectiles } from './projectiles.js';
import { clearTownLife, spawnTownLife } from './townlife.js';
import { log, setZoneText, toast } from '../ui/log.js';
import { resetMinimap } from '../ui/minimap.js';
import { BIOMES, floorLevel, towerBiome } from '../world/biomes.js';
import { gy, walkable } from '../world/grid.js';
import { kit, kitMat } from '../world/kit.js';
import { buildLevel } from '../world/level.js';
import { genDungeon, genTown } from '../world/levelgen.js';
import { genTower, TOWER_LAYOUTS } from '../world/towergen.js';
import { genEden } from '../world/edengen.js';
import { clearEden, spawnEden } from './eden.js';
import { clearTower, spawnTowerEvents } from './tower.js';
import { questEvent } from './quests.js';
import { clearTelegraphs } from '../engine/telegraph.js';

/** A cidade é a única zona segura. */
export function inSafe() { return G.zone === 'town'; }
export function hasTownServices() { return G.zone === 'town'; }
/** Nível base dos monstros da zona atual (masmorra ou torre). */
export function zoneLevel() { return G.zone === 'tower' ? R.towerLevel(G.floor) : G.zone === 'eden' ? G.edenLvl || 1 : floorLevel(G.biome, G.floor); }

/** Descarta tudo que pertence à zona atual (o pet e o jogador continuam). */
export function clearWorld() {
  clearMonsters();
  clearProjectiles();
  G.delayed.length = 0;
  clearLoot();
  for (const b of G.breakables) world.remove(b.mesh);
  G.breakables.length = 0;
  clearNpcs();
  clearTownLife();
  clearAllies(true);
  clearEffects();
  clearFx();
  clearCombatFx();
  clearTelegraphs();
  clearEden();
  clearTower();
  resetFloatText();
}
function placePlayer(L) {
  const p = G.player;
  p.x = L.start.x * TILE; p.z = L.start.z * TILE;
  p.path = null; p.target = null; p.dash = null; p.shove = null; p.dodge = null;
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
  spawnTownLife(G.L);
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
        let x = wx + (rand() - 0.5) * 5, z = wz + (rand() - 0.5) * 5;
        if (!walkable(G.L, x, z)) { x = wx; z = wz; }
        const k2 = rand() < 0.75 ? kind : B.monsters[Math.floor(rand() * B.monsters.length)];
        spawnMonster(k2, x, z, lvl + Math.floor(rand() * 4), { pack, elite: s.elite && i === 0 });
      }
    }
    pack++;
  });
  G.L.breakables.forEach((b) => spawnBreakable(b.x * TILE, b.z * TILE, biome));
  setZoneText(B.name + ' · Andar ' + floor, 'Monstros nv ' + lvl + '–' + (lvl + 6));
  log('Você entrou em ' + B.name + ', andar ' + floor + '.', 'sys');
  toast(B.name, 'Andar ' + floor);
  persist();
}
/**
 * Torre Infinita: andares sem fim, cada um mais difícil (nível e multiplicadores
 * de HP/dano sobem por andar). O bioma troca a cada 5 andares. Guarda o andar
 * mais alto alcançado para o Guardião oferecer "continuar de onde parou".
 */
export function enterTower(floor) {
  clearWorld();
  const biome = towerBiome(floor, R.TOWER.biomeEvery);
  G.zone = 'tower'; G.biome = biome; G.floor = floor;
  G.ch.towerBest = Math.max(G.ch.towerBest || 1, floor);
  Music.play(biome);
  const seed = R.hash32('tower', biome, floor, G.ch.name, Date.now());
  G.L = genTower(biome, floor, seed, G.towerLayout);
  G.towerLayout = G.L.layout;
  buildLevel(G.L);
  resize();
  placePlayer(G.L);
  const B = BIOMES[biome], lvl = R.towerLevel(floor);
  let pack = 1;
  G.L.spawns.forEach((s) => {
    const wx = s.x * TILE, wz = s.z * TILE;
    if (s.boss) {
      spawnMonster(B.boss, wx, wz, lvl + 6, { pack });
      const escort = (2 + Math.min(4, Math.floor(floor / 4))) * R.TOWER.monsterMult;
      for (let i = 0; i < escort; i++) spawnMonster(B.monsters[i % 3], wx + (rand() - 0.5) * 6, wz + (rand() - 0.5) * 6, lvl + 2, { pack });
    } else {
      const kind = B.monsters[Math.floor(rand() * B.monsters.length)];
      const n = s.size * R.TOWER.monsterMult; // grupos em dobro na torre
      for (let i = 0; i < n; i++) {
        let x = wx + (rand() - 0.5) * 5, z = wz + (rand() - 0.5) * 5;
        if (!walkable(G.L, x, z)) { x = wx; z = wz; }
        const k2 = rand() < 0.7 ? kind : B.monsters[Math.floor(rand() * B.monsters.length)];
        spawnMonster(k2, x, z, lvl + Math.floor(rand() * 4), { pack, elite: s.elite && i === 0 });
      }
    }
    pack++;
  });
  spawnTowerEvents(G.L, lvl);
  G.L.breakables.forEach((b) => spawnBreakable(b.x * TILE, b.z * TILE, biome));
  const plan = TOWER_LAYOUTS[G.L.layout];
  setZoneText('Torre Infinita · Andar ' + floor, plan.name + ' · ' + B.name + ' · monstros nv ' + lvl + '–' + (lvl + 6) + ' · recorde ' + G.ch.towerBest);
  log('Torre Infinita, andar ' + floor + ': ' + plan.name + ' (' + B.name + '). ' + plan.hint + ' Fique atento: emboscadas e invasões podem surgir a qualquer momento.', 'sys');
  toast('Torre Infinita · Andar ' + floor, plan.name + ' · ' + B.name);
  questEvent('tower', floor);
  persist();
}
/**
 * O Éden: mapa aberto com três caminhos até o Coração do Éden. Uma entrada a cada
 * 3 horas (marcada no save ao entrar). Os monstros partem de 15% abaixo do nível de entrada.
 */
export function enterEden() {
  const ch = G.ch;
  clearWorld();
  const entry = R.edenEntryLevel(ch.level);
  G.zone = 'eden'; G.biome = 'eden'; G.floor = 1; G.edenLvl = entry;
  ch.edenLast = Date.now();
  Music.play('eden');
  const seed = R.hash32('eden', ch.name, Date.now());
  G.L = genEden(seed);
  buildLevel(G.L);
  resize();
  placePlayer(G.L);
  spawnEden(G.L, entry);
  setZoneText(BIOMES.eden.name, 'Monstros nv ' + entry + '+ · Guardião do Éden nv ' + R.edenLevel(entry, 'boss'));
  log('Você entrou no Éden. Três caminhos levam ao Coração do Éden: Floresta, Raízes e Rio. O portal de Aldrena só reabre em 3 horas.', 'sys');
  toast('O Éden', 'Escolha um caminho: Floresta, Raízes ou Rio');
  persist();
}
function spawnBreakable(x, z, biome) {
  const c = { forest: 0x8a5a2a, caves: 0x6a5a4a, ruins: 0x9a7a5a, castle: 0x7a3a2a, abyss: 0x4a2a2a, tw_granite: 0x7a7068, tw_arcane: 0x6a4a7a, tw_storm: 0x5a6a6a, tw_void: 0x4a2a4a }[biome];
  const g = new THREE.Group();
  const k = kit(biome === 'ruins' || biome === 'castle' || biome === 'tw_granite' || biome === 'tw_arcane' ? 'crate' : 'barrel');
  const body = new THREE.Mesh(k.geo, kitMat());
  body.castShadow = true; body.receiveShadow = true;
  body.rotation.y = Math.random() * 6;
  g.add(body);
  g.position.set(x, gy(x, z), z);
  world.add(g);
  G.breakables.push({ x, z, mesh: g, color: c, broken: false });
}
