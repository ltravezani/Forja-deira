// ---------- O Éden: povoamento, baús, santuários, emboscadas, regiões e o Guardião ----------
import { GEO } from '../art/geometry.js';
import { glowShared } from '../art/materials.js';
import { G, persist } from '../core/state.js';
import { R, rand, TILE } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit, spawnRing } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { hemi, heroLight, scene, shake, sun, world } from '../engine/renderer.js';
import { EDEN_MINI, EDEN_MON } from './data.js';
import { dropEdenRoll } from './loot.js';
import { riseMonster, spawnMonster } from './monsters.js';
import { makePortal } from './npcs.js';
import { recalc } from './player.js';
import { enterTown } from './zones.js';
import { log, setZoneText, toast } from '../ui/log.js';
import { REGION, REGION_INFO } from '../world/edengen.js';
import { gy, walkable } from '../world/grid.js';
import { kit, kitGlowMat, kitMat } from '../world/kit.js';

/** Estado do Éden atual (zerado a cada entrada). */
const E = { chests: [], shrines: [], ambush: [], region: -1, seen: new Set(), k: 0, base: null, pack: 1000 };

/** Bênçãos dos santuários (uma por caminho), 90 s. */
const BLESS = {
  [REGION.forest]: { name: 'Bênção da Floresta', stats: { dmgPct: 15 }, say: '+15% de dano', color: 0x9aff6a },
  [REGION.roots]: { name: 'Bênção das Raízes', stats: { defPct: 30, dmgRed: 8 }, say: '+30% de defesa e -8% de dano recebido', color: 0x6affd0 },
  [REGION.river]: { name: 'Bênção do Rio', stats: { cdPct: -10, atkRatePct: 10 }, say: '+10% de velocidade de ataque e -10% de recarga', color: 0x6ad8ff },
};
const AMBUSH_SAY = {
  [REGION.forest]: 'A floresta se fecha à sua volta!',
  [REGION.roots]: 'Algo se mexe entre as raízes!',
  [REGION.river]: 'Criaturas emergem da água!',
};

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
/** Ponto andável perto de (x, z) em coordenadas de mundo (ou o próprio ponto). */
function nearWalkable(x, z, r) {
  if (walkable(G.L, x, z)) return { x, z };
  for (let k = 0; k < 16; k++) {
    const a = rand() * Math.PI * 2, d = rand() * r;
    if (walkable(G.L, x + Math.cos(a) * d, z + Math.sin(a) * d)) return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
  }
  return null;
}

/** Monstros, mini chefes, Guardião, baús, santuários, emboscadas e o portal de volta. */
export function spawnEden(L, entry) {
  E.chests = []; E.shrines = []; E.ambush = []; E.region = -1; E.seen = new Set(); E.k = 0; E.pack = 1000;
  let pack = 1;
  for (const s of L.spawns) {
    const wx = s.x * TILE, wz = s.z * TILE;
    const kinds = EDEN_MON[s.reg] || EDEN_MON[REGION.heart];
    if (s.boss) {
      spawnMonster('e_guardian', wx, wz, R.edenLevel(entry, 'boss'), { pack });
      for (let i = 0; i < 4; i++) { const q = nearWalkable(wx + (rand() - 0.5) * 8, wz + (rand() - 0.5) * 8, 3); if (q) spawnMonster(kinds[i % kinds.length], q.x, q.z, R.edenLevel(entry, 'heart'), { pack }); }
    } else if (s.mini) {
      spawnMonster(EDEN_MINI[s.reg], wx, wz, R.edenLevel(entry, 'mini'), { pack });
      for (let i = 0; i < 3; i++) { const q = nearWalkable(wx + (rand() - 0.5) * 6, wz + (rand() - 0.5) * 6, 3); if (q) spawnMonster(kinds[i % kinds.length], q.x, q.z, R.edenLevel(entry, 'path', 1), { pack }); }
    } else {
      const lvl = s.reg === REGION.heart ? R.edenLevel(entry, 'heart') : R.edenLevel(entry, 'path', s.t);
      const kind = pick(kinds);
      for (let i = 0; i < s.size; i++) {
        const q = nearWalkable(wx + (rand() - 0.5) * 4, wz + (rand() - 0.5) * 4, 2) || { x: wx, z: wz };
        spawnMonster(rand() < 0.7 ? kind : pick(kinds), q.x, q.z, lvl + Math.floor(rand() * 2), { pack, elite: s.elite && i === 0 });
      }
    }
    pack++;
  }
  for (const c of L.chests) spawnChest(c.x * TILE, c.z * TILE, c.secret ? 'secret' : 'chest');
  for (const e of L.events) {
    if (e.type === 'shrine') spawnShrine(e);
    else if (e.type === 'ambush') E.ambush.push({ x: e.x * TILE, z: e.z * TILE, r: e.r * TILE, reg: e.reg, state: 0, mons: [] });
  }
  G.hubPortal = makePortal(L.exit.x * TILE, L.exit.z * TILE, 0x8affb0, 'Voltar para Aldrena', () => { enterTown(); return true; });
  E.base = { hemi: hemi.intensity, sun: sun.intensity, fog: scene.fog.color.clone(), hero: heroLight.intensity };
}

// ---------- baús ----------
/** Baú de madeira com ferragens; a tampa gira para abrir. src: chest | secret (bolsões escondidos e prêmio de emboscada). */
function spawnChest(x, z, src) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(kit('chest').geo, kitMat());
  body.castShadow = true; body.receiveShadow = true;
  const lid = new THREE.Group();
  lid.position.set(0, 0.62, -0.36);
  const lm = new THREE.Mesh(kit('chestLid').geo, kitMat());
  lm.castShadow = true;
  lid.add(lm);
  g.add(body, lid);
  if (src === 'secret') { // brilho dourado no chão: tesouro escondido
    const ring = new THREE.Mesh(GEO.ring, glowShared(0xffd86a, 0.45));
    ring.scale.setScalar(1.2); ring.position.y = 0.05;
    g.add(ring);
  }
  g.position.set(x, gy(x, z), z);
  g.rotation.y = Math.PI / 4; // frente virada para a câmera
  world.add(g);
  const b = { x, z, mesh: g, color: 0x8a5a2a, broken: false, chest: true, src, lid, open: 0 };
  G.breakables.push(b);
  E.chests.push(b);
  return b;
}
/** Abre o baú (clique/ataque): a tampa sobe e o tesouro cai em volta. */
export function openChest(b) {
  if (b.broken) return;
  b.broken = true; b.opening = true;
  const lvl = (G.edenLvl || 1) + 3;
  const drop = R.rollEdenDrop({ seed: R.hash32(G.L.seed, 'bau', Math.round(b.x), Math.round(b.z)), mLevel: lvl, src: b.src, mf: G.st.mf, favorCls: G.ch.cls });
  const rare = dropEdenRoll(b.x, b.z, drop, b.src);
  emit(b.x, 0.8, b.z, { n: 40, color: 0xffd86a, speed: 3, up: 4, life: 1, size: 0.9, grav: 3, spread: 0.6 });
  Sfx.loot(rare ? 4 : 2);
  log(b.src === 'secret' ? 'Tesouro escondido do Éden!' : 'Baú do Éden aberto.', 'loot');
  persist();
}

// ---------- santuários ----------
function spawnShrine(e) {
  const x = e.x * TILE, z = e.z * TILE, B = BLESS[e.reg];
  const g = new THREE.Group();
  const k = kit('shrine');
  const m = new THREE.Mesh(k.geo, kitMat());
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  const orb = new THREE.Mesh(k.glow, kitGlowMat());
  orb.renderOrder = 3;
  g.add(orb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glowShared(B.color, 0.5));
  halo.position.y = 2.1;
  g.add(halo);
  g.position.set(x, gy(x, z), z);
  world.add(g);
  E.shrines.push({ x, z, reg: e.reg, used: false, g, halo, B });
}
function useShrine(s) {
  s.used = true;
  const B = s.B;
  G.buffs = G.buffs.filter((b) => b.id !== 'eden:' + s.reg);
  G.buffs.push({ id: 'eden:' + s.reg, name: B.name, until: G.time + 90, stats: B.stats });
  recalc();
  G.hp = G.st.maxHp; G.mp = G.st.maxMp;
  const p = G.player;
  emit(p.x, 0.4, p.z, { n: 70, color: B.color, speed: 3, up: 4, life: 1.2, size: 1, grav: 1.5, spread: 1.2 });
  spawnRing(s.x, s.z, 0.5, 4, B.color, 0.9);
  floatText(p.x, 3, p.z, B.name, 'heal');
  toast(B.name, B.say + ' por 90s · HP e mana cheios');
  log('Santuário do Éden: ' + B.name + ' (' + B.say + ' por 90s).', 'sys');
  Sfx.level();
  s.halo.visible = false;
}

// ---------- emboscadas ----------
function triggerAmbush(a) {
  a.state = 1;
  const kinds = EDEN_MON[a.reg] || EDEN_MON[REGION.heart];
  const lvl = R.edenLevel(G.edenLvl || 1, 'path', 0.7), pack = E.pack++;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + rand() * 0.4, d = (4 + rand() * 3) * TILE;
    const q = nearWalkable(a.x + Math.cos(ang) * d, a.z + Math.sin(ang) * d, 4);
    if (!q) continue;
    const m = spawnMonster(pick(kinds), q.x, q.z, lvl + Math.floor(rand() * 2), { pack, elite: i === 0 });
    m.aggro = true;
    riseMonster(m);
    a.mons.push(m);
    emit(q.x, 0.5, q.z, { n: 16, color: 0x9aff6a, speed: 3, up: 2, life: 0.6, size: 1 });
  }
  toast('Emboscada!', AMBUSH_SAY[a.reg] || 'Você foi cercado!');
  log('Emboscada no ' + REGION_INFO[a.reg].name + '! Derrote todos para ganhar o tesouro.', 'warn');
  shake(0.5);
}
function finishAmbush(a) {
  a.state = 2;
  const q = nearWalkable(a.x, a.z, 4) || { x: a.x, z: a.z };
  spawnChest(q.x, q.z, 'secret');
  emit(q.x, 0.5, q.z, { n: 60, color: 0xffd86a, speed: 3, up: 5, life: 1.2, size: 1, grav: 2, spread: 1 });
  toast('Emboscada vencida', 'Um baú surgiu na clareira');
  Sfx.level();
}

// ---------- mortes ----------
/** Qualquer abate no Éden: confere emboscadas vencidas. */
export function onEdenKill() {
  for (const a of E.ambush) if (a.state === 1 && a.mons.every((m) => m.dead)) finishAmbush(a);
}
export function onMiniKilled(m) {
  shake(0.8); Sfx.boom();
  toast('Mini chefe derrotado', m.T.name);
  log(m.T.name + ' foi derrotado. O Coração do Éden está mais perto.', 'sys');
  persist();
}
/** Guardião do Éden: portal de volta para Aldrena no lugar dele. */
export function onEdenBossKilled(m) {
  const ch = G.ch;
  ch.edenClears = (ch.edenClears || 0) + 1;
  toast('Guardião do Éden derrotado', 'O Coração do Éden está em paz');
  log('Você derrotou o Guardião do Éden! Um portal para Aldrena se abriu.', 'sys');
  G.exitPortal = makePortal(m.x, m.z, 0x8affb0, 'Voltar para Aldrena', () => { enterTown(); return true; });
  persist();
}

// ---------- por quadro ----------
const ROOTS_FOG = new THREE.Color(0x1c3a32);
export function updateEden(dt) {
  const p = G.player, L = G.L;
  if (!p || !L || L.biome !== 'eden') return;
  // região sob o herói: nome no topo e aviso na primeira visita
  const tx = Math.round(p.x / TILE), tz = Math.round(p.z / TILE);
  const reg = tx >= 0 && tz >= 0 && tx < L.W && tz < L.H ? L.region[tz * L.W + tx] : 0;
  if (reg && reg !== E.region) {
    E.region = reg;
    const info = REGION_INFO[reg];
    setZoneText('O Éden · ' + info.name, info.sub);
    if (!E.seen.has(reg)) { E.seen.add(reg); if (reg !== REGION.hub) toast(info.name, info.sub); }
  }
  // nas Raízes a luz do dia some aos poucos (sob a terra), e volta ao sair
  if (E.base) {
    const target = E.region === REGION.roots ? 1 : 0;
    E.k += (target - E.k) * Math.min(1, dt * 1.2);
    const k = E.k;
    hemi.intensity = E.base.hemi * (1 - 0.55 * k);
    sun.intensity = E.base.sun * (1 - 0.75 * k);
    heroLight.intensity = E.base.hero * (1 + 0.5 * k);
    scene.fog.color.copy(E.base.fog).lerp(ROOTS_FOG, k);
    scene.background.copy(scene.fog.color);
  }
  // santuários: o orbe gira; tocar concede a bênção
  for (const s of E.shrines) {
    if (s.used) continue;
    s.halo.position.y = 2.1 + Math.sin(G.time * 2 + s.x) * 0.12;
    s.halo.scale.setScalar(1 + Math.sin(G.time * 3 + s.z) * 0.08);
    if (Math.random() < 0.3) emit(s.x + (rand() - 0.5), 2.1, s.z + (rand() - 0.5), { n: 1, color: s.B.color, speed: 0.4, up: 1.5, life: 1.2, size: 0.6, grav: -0.5 });
    if (p.alive && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 3.2 * 3.2) useShrine(s);
  }
  // emboscadas: disparam quando o herói entra na clareira
  for (const a of E.ambush) if (a.state === 0 && p.alive && (a.x - p.x) ** 2 + (a.z - p.z) ** 2 < a.r * a.r) triggerAmbush(a);
  // tampa dos baús abrindo
  for (const b of E.chests) {
    if (!b.opening || b.open >= 1) continue;
    b.open = Math.min(1, b.open + dt * 3);
    b.lid.rotation.x = -1.9 * (1 - (1 - b.open) ** 3);
  }
}
/** Saída do Éden: as malhas de baús e santuários (os baús também estão em G.breakables). */
export function clearEden() {
  for (const s of E.shrines) world.remove(s.g);
  for (const s of E.shrines) s.halo.geometry.dispose();
  E.shrines = []; E.chests = []; E.ambush = []; E.base = null;
}
/** Estado do Éden para testes e depuração. */
export function edenState() { return E; }
