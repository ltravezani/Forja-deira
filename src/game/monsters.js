// ---------- monstros ----------
import { deathTime } from '../art/gltfModels.js';
import { animateModel, attachBossSigil, buildModel, disposeModel, flashModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { R, rand } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit, spawnRing } from '../engine/effects.js';
import { shake, world } from '../engine/renderer.js';
import { hurtPlayer } from './combat.js';
import { AFFIX, MON } from './data.js';
import { face, stepToward, turn } from './movement.js';
import { spawnProjectile } from './projectiles.js';
import { inView } from './world.js';
import { inSafe } from './zones.js';
import { log } from '../ui/log.js';
import { BIOMES } from '../world/biomes.js';
import { findPath, gy, lineClear, walkable, walkableR } from '../world/grid.js';
import { SpatialHash } from '../world/spatial.js';

/** Maior raio de colisão de monstro (chefe); usado para ampliar consultas na grade espacial. */
/** Raio de colisão do corpo do chefe (m). */
const BOSS_RADIUS = 1.6;
const MAX_MONSTER_RADIUS = BOSS_RADIUS;
/**
 * Folga das consultas na grade: maior raio de monstro + 1 m, porque a grade é
 * montada no início do quadro e monstros ainda se movem (passo, empurrão, separação).
 */
export const QUERY_PAD = MAX_MONSTER_RADIUS + 1;
const grid = new SpatialHash(CONFIG.monsters.separationCell);
const near = [];

/** Reconstrói a grade espacial dos monstros vivos (uma vez por quadro). */
export function rebuildMonsterGrid() {
  grid.clear();
  for (const m of G.monsters) if (!m.dead) grid.insert(m);
}
/** Candidatos perto de (x, z) — pré-filtro; confira a distância exata. `out` é reaproveitado. */
export function queryMonsters(x, z, r, out) {
  return grid.query(x, z, r, out);
}

export function spawnMonster(kind, x, z, level, opt) {
  opt = opt || {};
  const T = MON[kind];
  const mod = Object.assign({}, T.mod);
  if (G.zone === 'tower') { const tm = R.towerMod(G.floor); mod.hp = (mod.hp || 1) * tm.hp; mod.dmg = (mod.dmg || 1) * tm.dmg; }
  let affix = null;
  if (opt.elite) {
    const ks = Object.keys(AFFIX);
    affix = AFFIX[ks[Math.floor(rand() * ks.length)]];
    mod.hp = (mod.hp || 1) * 2.4 * (affix.hp || 1);
    mod.dmg = (mod.dmg || 1) * 1.35;
  }
  const s = R.monsterStats(level, mod);
  const model = buildModel(T.model, T.o);
  if (opt.elite) {
    model.mats.forEach((m) => { m.userData.baseEmissive = new THREE.Color(0x2050ff); m.userData.baseEI = 0.35; m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = 0.35; });
    if (affix.scale) model.root.scale.multiplyScalar(affix.scale);
  }
  if (T.boss) {
    // selo rúnico no chão, do tamanho do corpo do chefe (compensa a escala do modelo)
    attachBossSigil(model, 0xff5a2a, BOSS_RADIUS * 1.45);
  }
  model.root.position.set(x, gy(x, z), z);
  model.root.rotation.y = rand() * 6.28;
  world.add(model.root);
  const m = {
    id: G.nextMonId++, kind, T, name: (affix ? affix.name + ' ' : '') + T.name, level, maxHp: s.hp, hp: s.hp, dmg: s.dmg, def: s.def,
    x, z, homeX: x, homeZ: z, rot: model.root.rotation.y, model, speed: T.speed * (affix && affix.speed ? affix.speed : 1),
    range: T.range, atkT: T.atkT, atkCd: rand(), atkWind: 0, attackAnim: 0, aggro: false, pack: opt.pack || 0,
    elite: !!opt.elite, affix, boss: !!T.boss, dead: false, deadT: 0, hitFlash: 0, lastHit: -99, slowUntil: 0,
    radius: (T.boss ? BOSS_RADIUS : 0.55) * (affix && affix.scale ? affix.scale : 1),
    // raio usado contra paredes: o chefe é largo e não pode atravessar blocos
    moveR: T.boss ? 1.1 : 0.35 * (affix && affix.scale ? affix.scale : 1), losT: 0, los: false, path: null, repath: rand() * 0.6,
    wanderT: rand() * 3, special: 5, summoned: false, moving: false, flyer: T.model === 'bat' || T.model === 'floater',
  };
  if (m.boss) G.boss = m;
  G.monsters.push(m);
  return m;
}
/** Acorda o monstro e todo o seu bando. */
export function aggroPack(m) {
  if (m.aggro) return;
  m.aggro = true;
  if (m.pack) G.monsters.forEach((o) => { if (o.pack === m.pack && !o.dead) o.aggro = true; });
}

// ---------- IA dos monstros ----------
export function updateMonsters(dt) {
  const p = G.player;
  const safe = inSafe();
  for (let i = G.monsters.length - 1; i >= 0; i--) {
    const m = G.monsters[i];
    if (m.dead) {
      if (updateCorpse(m, dt)) G.monsters.splice(i, 1);
      continue;
    }
    if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) { m.x = m.homeX; m.z = m.homeZ; }
    const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
    m.losT -= dt;
    if (m.losT <= 0) { m.losT = CONFIG.monsters.losInterval + rand() * 0.1; m.los = d < 18 && lineClear(G.L, m.x, m.z, p.x, p.z, 0); }
    const slow = m.slowUntil > G.time ? 0.5 : 1;
    const enrage = m.boss && m.hp < m.maxHp * 0.25 ? 1.3 : 1;
    m.moving = false;
    m.atkCd -= dt * enrage;
    if (!p.alive || safe) m.aggro = false;
    if (!m.aggro) {
      // longe e ocioso: não simula nem desenha (o esqueleto animado é o custo maior)
      if (d > CONFIG.monsters.sleepDistance) { m.model.root.visible = false; continue; }
      updateIdle(m, d, dt, p, safe);
    } else {
      updateEngaged(m, dx, dz, d, dt, slow, p);
      if (m.boss) updateBoss(m, d, dt, enrage, p);
    }
    separate(m);
    updateVisual(m, dt, slow);
  }
}

/** Queda e afundamento do corpo; devolve true quando pode ser removido. */
function updateCorpse(m, dt) {
  m.deadT += dt;
  const r = m.model.root;
  if (m.model.blob) m.model.blob.visible = false; // a mancha tombaria junto com o corpo
  // modelo animado: toca a queda e só depois afunda; o procedural tomba inteiro
  const fall = m.model.kind === 'gltf' ? Math.min(1.4, deathTime(m.model)) : 0.6;
  if (m.model.kind === 'gltf') animateModel(m.model, { t: G.time, dt, dead: true });
  else r.rotation.z = Math.min(Math.PI / 2, m.deadT * 5) * (m.id % 2 ? 1 : -1);
  r.position.y = gy(m.x, m.z) - (m.deadT > fall ? (m.deadT - fall) * 1.2 : 0);
  if (m.deadT <= fall + 1) return false;
  removeMonsterVisual(m);
  return true;
}
function removeMonsterVisual(m) {
  world.remove(m.model.root);
  disposeModel(m.model);
  if (m.bar) { m.bar.remove(); m.bar = null; }
}

function updateIdle(m, d, dt, p, safe) {
  const C = CONFIG.monsters;
  if (p.alive && !safe && d < (m.boss ? C.aggroRangeBoss : C.aggroRange) && m.los) aggroPack(m);
  m.wanderT -= dt;
  if (m.wanderT <= 0) { m.wanderT = 2 + rand() * 4; m.wx = m.homeX + (rand() - 0.5) * 5; m.wz = m.homeZ + (rand() - 0.5) * 5; }
  if (m.wx != null && Math.hypot(m.wx - m.x, m.wz - m.z) > 0.3) stepToward(m, m.wx, m.wz, m.speed * 0.3, dt, m.moveR);
}

/** Perseguição e ataque: prepara o golpe (atkWind, telegrafado pela animação) e o resolve. */
function updateEngaged(m, dx, dz, d, dt, slow, p) {
  if (m.atkWind > 0) {
    m.atkWind -= dt;
    if (m.atkWind <= 0) resolveAttack(m, dx, dz, d, p);
  } else if (d <= m.range + m.radius && (m.los || d < 2.5)) {
    face(m, p.x, p.z);
    if (m.atkCd <= 0) { m.atkCd = m.atkT; m.atkWind = m.T.ranged ? 0.4 : 0.32; m.attackAnim = 0.001; }
  } else {
    m.repath -= dt;
    if (m.los) { m.path = null; stepToward(m, p.x, p.z, m.speed * slow, dt, m.moveR); return; }
    if (m.repath <= 0 || !m.path) { m.repath = 0.6 + rand() * 0.4; m.path = findPath(G.L, m.x, m.z, p.x, p.z, 1200); }
    if (m.path && m.path.length) { const n = m.path[0]; if (stepToward(m, n.x, n.z, m.speed * slow, dt, m.moveR)) m.path.shift(); }
  }
}
function resolveAttack(m, dx, dz, d, p) {
  if (m.T.ranged) {
    const k = d || 1;
    spawnProjectile({ from: 'm', x: m.x, z: m.z, dx: dx / k, dz: dz / k, speed: m.T.ranged.speed, range: m.range + 4, dmg: m.dmg, src: m, color: m.T.ranged.color, arrow: m.T.ranged.arrow, size: 0.4 });
  } else if (d <= m.range + m.radius + 0.9) {
    hurtPlayer(m.dmg, m);
    if (m.boss) { shake(0.4); emit(p.x, 0.4, p.z, { n: 16, color: 0xffa060, speed: 5, life: 0.4, size: 1 }); }
  }
}

/** Golpe em área telegrafado, reforços a 50% de HP e fúria a 25% (via `enrage`). */
function updateBoss(m, d, dt, enrage, p) {
  m.special -= dt;
  if (m.special <= 0 && d < 16) {
    m.special = 6.5 / enrage;
    const tx = p.x, tz = p.z;
    spawnRing(tx, tz, 3.4, 3.4, 0xff2a1a, 1.1, { hold: true, op: 0.55 });
    spawnRing(tx, tz, 0.2, 3.4, 0xff2a1a, 1.1, { disc: true, op: 0.18 });
    m.attackAnim = 0.001;
    G.delayed.push({ t: 1.1, fn: () => {
      if (m.dead) return;
      emit(tx, 0.4, tz, { n: 60, color: 0xff5a2a, speed: 9, up: 1, life: 0.6, size: 1.4, spread: 2 });
      shake(0.9); Sfx.boom();
      if ((G.player.x - tx) ** 2 + (G.player.z - tz) ** 2 < 3.4 * 3.4) hurtPlayer(m.dmg * 1.8, m);
    } });
  }
  if (!m.summoned && m.hp < m.maxHp * 0.5 && G.zone !== 'town') {
    m.summoned = true;
    const B = BIOMES[G.biome];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2, sx = m.x + Math.cos(a) * 3, sz = m.z + Math.sin(a) * 3;
      if (!walkable(G.L, sx, sz)) continue;
      const s = spawnMonster(B.monsters[k % 3], sx, sz, m.level - 4, { pack: m.pack });
      s.aggro = true;
      emit(sx, 0.5, sz, { n: 20, color: 0xb070ff, speed: 3, life: 0.6, size: 1 });
    }
    log(m.T.name + ' convoca reforços!', 'warn');
  }
  if (m.model.sigil) m.model.sigil.rotation.y += dt * 0.6; // gira no plano do chão
}

/** Afasta monstros sobrepostos (vizinhos pela grade espacial, não todos contra todos). */
function separate(m) {
  queryMonsters(m.x, m.z, m.radius + QUERY_PAD, near);
  for (const o of near) {
    if (o === m || o.dead) continue;
    const sx = m.x - o.x, sz = m.z - o.z, sd = sx * sx + sz * sz, min = m.radius + o.radius;
    if (sd >= min * min || sd <= 0.0001) continue;
    const dist = Math.sqrt(sd), k = ((min - dist) / dist) * 0.5;
    const nx = m.x + sx * k, nz = m.z + sz * k;
    if (walkableR(G.L, nx, nz, m.moveR)) { m.x = nx; m.z = nz; }
  }
}

function updateVisual(m, dt, slow) {
  turn(m, dt);
  if (m.attackAnim > 0) { m.attackAnim += dt * 2.8; if (m.attackAnim >= 1) m.attackAnim = 0; }
  if (m.hitFlash > 0) { m.hitFlash -= dt; flashModel(m.model, 0xffffff, m.hitFlash > 0 ? 0.9 : 0); }
  const root = m.model.root;
  root.position.set(m.x, gy(m.x, m.z), m.z);
  root.rotation.y = m.rot;
  const mdx = m.x - (m.lx != null ? m.lx : m.x), mdz = m.z - (m.lz != null ? m.lz : m.z);
  m.lx = m.x; m.lz = m.z;
  // fora da tela não precisa animar nem desenhar
  const vis = inView(m.x, root.position.y + m.model.height * 0.5, m.z, m.model.height * 0.8 + 1);
  root.visible = vis;
  if (vis) animateModel(m.model, { t: G.time + m.id, dt, moving: m.moving, v: dt > 0 ? Math.hypot(mdx, mdz) / dt : 0, attack: m.attackAnim, speed: 9 * slow });
}

/** Remove todos os monstros (troca de zona), liberando modelos e barras de vida. */
export function clearMonsters() {
  for (const m of G.monsters) { m.dead = true; removeMonsterVisual(m); } // dead: aliados soltam alvos antigos
  G.monsters.length = 0;
  G.boss = null;
  grid.clear();
}
