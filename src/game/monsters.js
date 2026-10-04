// ---------- monstros ----------
import { deathTime, gltfRise } from '../art/gltfModels.js';
import { animateModel, attachBossSigil, buildModel, disposeModel, flashModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { R, rand } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { shake, world } from '../engine/renderer.js';
import { shockRing } from '../engine/combatfx.js';
import { inCone, telegraphCircle, telegraphCone } from '../engine/telegraph.js';
import { hurtPlayer } from './combat.js';
import { AFFIX, MON, monsterName } from './data.js';
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
/** Raio do corpo dos mini chefes (Éden). */
const MINI_RADIUS = 1.2;
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
  if (G.zone === 'eden') { mod.hp = (mod.hp || 1) * R.EDEN.hpMult; mod.dmg = (mod.dmg || 1) * R.EDEN.dmgMult; }
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
  if (T.flee) attachBossSigil(model, 0xffd86a, 1.1); // Ladrão de Ouro: brilho dourado no chão
  if (T.boss) {
    // selo rúnico no chão, do tamanho do corpo do chefe (compensa a escala do modelo)
    attachBossSigil(model, 0xff5a2a, BOSS_RADIUS * 1.45);
  } else if (T.mini) attachBossSigil(model, 0x8aff6a, MINI_RADIUS * 1.5); // mini chefe: selo verde, menor
  model.root.position.set(x, gy(x, z), z);
  model.root.rotation.y = rand() * 6.28;
  world.add(model.root);
  const m = {
    id: G.nextMonId++, kind, T, name: monsterName(T, affix), level, maxHp: s.hp, hp: s.hp, dmg: s.dmg, def: s.def,
    x, z, homeX: x, homeZ: z, rot: model.root.rotation.y, model, speed: T.speed * (affix && affix.speed ? affix.speed : 1),
    range: T.range, atkT: T.atkT, atkCd: rand(), atkWind: 0, attackAnim: 0, aggro: false, pack: opt.pack || 0,
    elite: !!opt.elite, affix, boss: !!T.boss, mini: !!T.mini, dead: false, deadT: 0, hitFlash: 0, lastHit: -99, slowUntil: 0, riseUntil: 0,
    radius: (T.boss ? BOSS_RADIUS : T.mini ? MINI_RADIUS : 0.55) * (affix && affix.scale ? affix.scale : 1),
    // raio usado contra paredes: o chefe é largo e não pode atravessar blocos
    moveR: T.boss ? 1.1 : T.mini ? 0.8 : 0.35 * (affix && affix.scale ? affix.scale : 1), losT: 0, los: false, path: null, repath: rand() * 0.6,
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
    // surgindo do chão: só anima (não persegue nem ataca)
    if (m.riseUntil > G.time) { updateVisual(m, dt, slow); continue; }
    const enrage = (m.boss || m.mini) && m.hp < m.maxHp * 0.25 ? 1.3 : 1;
    m.moving = false;
    m.atkCd -= dt * enrage;
    if (!p.alive || safe) m.aggro = false;
    if (!m.aggro) {
      // longe e ocioso: não simula nem desenha (o esqueleto animado é o custo maior)
      if (d > CONFIG.monsters.sleepDistance) { m.model.root.visible = false; continue; }
      updateIdle(m, d, dt, p, safe);
    } else {
      updateEngaged(m, dx, dz, d, dt, slow, p);
      if (m.boss || m.mini) updateBoss(m, d, dt, enrage, p);
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
  if (m.T.flee) { flee(m, dx, dz, d, dt, slow); return; }
  if (m.atkWind > 0) {
    m.atkWind -= dt;
    // golpe pesado: o aviso no chão vem antes; a animação só começa perto do impacto
    if (m.heavy && !m.attackAnim && m.atkWind <= 0.3) m.attackAnim = 0.001;
    if (m.atkWind <= 0) resolveAttack(m, dx, dz, d, p);
  } else if (d <= m.range + m.radius && (m.los || d < 2.5)) {
    face(m, p.x, p.z);
    if (m.atkCd <= 0) startAttack(m, p);
  } else {
    m.repath -= dt;
    if (m.los) { m.path = null; stepToward(m, p.x, p.z, m.speed * slow, dt, m.moveR); return; }
    if (m.repath <= 0 || !m.path) { m.repath = 0.6 + rand() * 0.4; m.path = findPath(G.L, m.x, m.z, p.x, p.z, 1200); }
    if (m.path && m.path.length) { const n = m.path[0]; if (stepToward(m, n.x, n.z, m.speed * slow, dt, m.moveR)) m.path.shift(); }
  }
}
/** Foge do herói: tenta a direção oposta e, se houver parede, desvia aos poucos para os lados. */
function flee(m, dx, dz, d, dt, slow) {
  if (d > 22) return;
  const base = Math.atan2(-dz, -dx);
  for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
    const a = base + off * (m.id % 2 ? 1 : -1), tx = m.x + Math.cos(a) * 2.5, tz = m.z + Math.sin(a) * 2.5;
    if (walkableR(G.L, tx, tz, m.moveR) && lineClear(G.L, m.x, m.z, tx, tz, m.moveR)) { stepToward(m, tx, tz, m.speed * slow, dt, m.moveR); return; }
  }
}
/**
 * Começa um ataque. Chefes e mini chefes corpo a corpo dão um golpe pesado em
 * cone a cada `heavyEvery` ataques; elites corpo a corpo, uma pancada em área a
 * cada `eliteSlamCd` s. Os dois avisam no chão e só acertam dentro da área marcada.
 */
function startAttack(m, p) {
  const C = CONFIG.telegraph;
  m.atkCd = m.atkT;
  m.atkWind = m.T.ranged ? 0.4 : 0.32;
  m.attackAnim = 0.001;
  m.heavy = null;
  if (m.T.ranged || m.T.flee) return;
  if (m.boss || m.mini) {
    m.swings = (m.swings || 0) + 1;
    if (m.swings % C.heavyEvery) return;
    const rot = Math.atan2(p.x - m.x, p.z - m.z), r = m.range + m.radius + 0.9;
    m.heavy = { cone: true, x: m.x, z: m.z, rot, r, mult: C.heavyMult };
    telegraphCone(m.x, m.z, rot, r, C.time, m);
  } else if (m.elite && G.time >= (m.slamAt || 0)) {
    m.slamAt = G.time + C.eliteSlamCd;
    m.heavy = { cone: false, x: m.x, z: m.z, r: C.eliteSlamR, mult: C.eliteSlamMult };
    telegraphCircle(m.x, m.z, C.eliteSlamR, C.time, m);
  } else return;
  m.atkWind = C.time;
  m.attackAnim = 0;
}
/** Golpe pesado: efeito no chão e dano só se o herói ainda estiver na área marcada. */
function resolveHeavy(m, h, p) {
  if (h.cone) {
    const k = h.r * 0.6;
    emit(h.x + Math.sin(h.rot) * k, 0.3, h.z + Math.cos(h.rot) * k, { n: 40, color: 0xff5a2a, speed: 7, up: 0.8, life: 0.5, size: 1.2, spread: h.r * 0.6 });
  } else emit(h.x, 0.3, h.z, { n: 30, color: 0xff6a3a, speed: 6, up: 0.8, life: 0.45, size: 1.1, spread: h.r });
  shockRing(h.cone ? h.x + Math.sin(h.rot) * h.r * 0.5 : h.x, h.cone ? h.z + Math.cos(h.rot) * h.r * 0.5 : h.z, h.cone ? h.r * 0.6 : h.r, 0xff6a3a, 0.3);
  shake(m.boss ? 0.6 : 0.3);
  if (m.boss || m.mini) Sfx.boom();
  const inside = h.cone ? inCone(h.x, h.z, h.rot, h.r, p.x, p.z, 0.4) : (p.x - h.x) ** 2 + (p.z - h.z) ** 2 < (h.r + 0.4) ** 2;
  if (inside) hurtPlayer(m.dmg * h.mult, m);
}
function resolveAttack(m, dx, dz, d, p) {
  if (m.heavy) { const h = m.heavy; m.heavy = null; resolveHeavy(m, h, p); return; }
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
    m.special = (m.mini ? 8 : 6.5) / enrage;
    const tx = p.x, tz = p.z, wait = CONFIG.telegraph.time + 0.2;
    telegraphCircle(tx, tz, 3.4, wait, m);
    m.attackAnim = 0.001;
    G.delayed.push({ t: wait, fn: () => {
      if (m.dead) return;
      emit(tx, 0.4, tz, { n: 60, color: 0xff5a2a, speed: 9, up: 1, life: 0.6, size: 1.4, spread: 2 });
      shake(0.9); Sfx.boom();
      if ((G.player.x - tx) ** 2 + (G.player.z - tz) ** 2 < 3.4 * 3.4) hurtPlayer(m.dmg * 1.8, m);
    } });
  }
  if (m.boss && !m.summoned && m.hp < m.maxHp * 0.5 && G.zone !== 'town') {
    m.summoned = true;
    const B = BIOMES[G.biome];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2, sx = m.x + Math.cos(a) * 3, sz = m.z + Math.sin(a) * 3;
      if (!walkable(G.L, sx, sz)) continue;
      const s = spawnMonster(B.monsters[k % 3], sx, sz, m.level - 4, { pack: m.pack });
      s.aggro = true;
      riseMonster(s);
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

/** Monstro que acaba de aparecer no meio da luta surge do chão (só os animados; os outros já atacam). */
export function riseMonster(m) { m.riseUntil = G.time + gltfRise(m.model); }

/** Remove todos os monstros (troca de zona), liberando modelos e barras de vida. */
export function clearMonsters() {
  for (const m of G.monsters) { m.dead = true; removeMonsterVisual(m); } // dead: aliados soltam alvos antigos
  G.monsters.length = 0;
  G.boss = null;
  grid.clear();
}
