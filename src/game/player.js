// ---------- jogador: status, modelo, movimento, alvo e recuperação ----------
import { animateModel, attachWings, buildHumanoid, disposeModel, flashModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { $, dist2, R, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { CAM, heroLight, shake, world } from '../engine/renderer.js';
import { attackRange, basicAttack, breakBarrel, hitMonster } from './combat.js';
import { cpOf } from './inventory.js';
import { autoPickup, pickup } from './loot.js';
import { QUERY_PAD, queryMonsters } from './monsters.js';
import { face, followPath, pathTo, playerSpeed, stepToward, turn } from './movement.js';
import { flushSkillBuffer } from './skills.js';
import { enterTown, hasTownServices, inSafe } from './zones.js';
import { KEYS, mouse } from '../input/inputState.js';
import { clickWorld } from '../input/picking.js';
import { openNpc } from '../ui/npcDialogs.js';
import { gy, lineClear } from '../world/grid.js';

const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);

// ---------- status ----------
/** Recalcula os atributos derivados (itens, árvore, buffs) e mantém HP/MP/AG válidos. */
export function recalc() {
  const ch = G.ch;
  G.st = R.deriveStats(ch, G.buffs.map((b) => b.stats));
  G.cp = cpOf(ch);
  clampVitals();
}
/** Garante HP/MP/AG finitos e dentro dos limites (protege contra NaN vindo de saves ou fórmulas). */
function clampVitals() {
  const st = G.st;
  G.hp = Math.min(finite(G.hp, st.maxHp), st.maxHp);
  G.mp = Math.max(0, Math.min(finite(G.mp, st.maxMp), st.maxMp));
  G.ag = Math.max(0, Math.min(finite(G.ag, st.maxAg), st.maxAg));
}
export function fillVitals() {
  G.hp = G.st.maxHp; G.mp = G.st.maxMp; G.ag = G.st.maxAg;
}

// ---------- modelo ----------
/** Aparência do herói a partir da classe, evolução e equipamento (cores por raridade). */
function playerLook(ch) {
  const eq = ch.equip;
  const rc = (it, def) => (it ? parseInt(R.RARITY[it.rarity].color.slice(1), 16) : def);
  const tint = (it, base) => {
    if (!it) return base;
    const c = new THREE.Color(base);
    c.lerp(new THREE.Color(R.RARITY[it.rarity].color), 0.18 + it.tier * 0.03);
    return c.getHex();
  };
  const armorBase = { dk: 0x7a7e88, dw: 0x2e2a48, elf: 0x4a5a34 }[ch.cls];
  const o = {
    dk: { skin: 0xd8a888, cloth: 0x4a1616, head: 'helm', weapon: 'sword', bulky: true, shield: true, horns: ch.tier >= 1, cape: true, capeColor: 0x3a0e10, shieldColor: 0x5a1414 },
    dw: { skin: 0xe0b89a, cloth: 0x221c3a, head: 'hood', weapon: 'staff', robe: true, weaponGlow: 0x7aa8ff, eye: 0x9ac8ff, cape: true, capeColor: 0x1a1430 },
    elf: { skin: 0xf0caa8, cloth: 0x2e3a22, head: 'hair', hair: 0xd8b86a, weapon: 'bow', thin: true, cape: true, capeColor: 0x24301a },
  }[ch.cls];
  o.armor = tint(eq.armor || eq.helm, armorBase);
  o.trim = rc(eq.gloves || eq.boots, ch.tier >= 1 ? 0xffd24a : 0xc9a24a);
  if (eq.weapon) {
    o.weaponColor = tint(eq.weapon, 0xc8d0dc);
    if (R.RARITY[eq.weapon.rarity].order >= 2) o.weaponGlow = rc(eq.weapon);
    if (ch.cls === 'dw') o.weaponGlow = rc(eq.weapon, 0x7aa8ff);
  }
  o.pauldron = ch.tier >= 1;
  o.trimGlow = ch.tier >= 2;
  return o;
}
/** Constrói o modelo 3D de um personagem (também usado na prévia da tela de título). */
export function buildCharacterModel(ch) {
  const m = buildHumanoid(playerLook(ch));
  const w = ch.equip.wings;
  if (w) attachWings(m, parseInt(R.RARITY[w.rarity].color.slice(1), 16), 0.75 + w.tier * 0.08);
  else if (ch.tier >= 2) attachWings(m, { dk: 0xff6a3a, dw: 0x7aa8ff, elf: 0x8affb0 }[ch.cls], 0.8);
  m.orb = m.weapon ? m.weapon.children.find((c) => c.userData.orb) || null : null;
  return m;
}
/** (Re)constrói o modelo do jogador após troca de equipamento ou evolução. */
export function buildPlayerModel() {
  const p = G.player;
  if (p.model) { world.remove(p.model.root); disposeModel(p.model); }
  const m = buildCharacterModel(G.ch);
  p.model = m;
  m.root.position.set(p.x, gy(p.x, p.z), p.z);
  m.root.rotation.y = p.rot;
  world.add(m.root);
}
export function newPlayer() {
  G.player = { x: 0, z: 0, rot: 0, model: null, path: null, target: null, atkCd: 0, attackAnim: 0, castAnim: 0, lockUntil: 0, dash: null, alive: true, repath: 0, hurtFlash: 0, moveHold: 0 };
}

// ---------- atualização por quadro ----------
export function updatePlayer(dt) {
  const p = G.player;
  if (!p.alive) return;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { p.x = G.L.start.x * TILE; p.z = G.L.start.z * TILE; p.path = null; }
  p.atkCd -= dt;
  p.moving = false;
  // segurar o botão = seguir o cursor (estilo Torchlight)
  if (mouse.down && G.time - mouse.lastRepath > CONFIG.player.holdRepath) {
    mouse.lastRepath = G.time;
    clickWorld(mouse.x, mouse.y, true);
  }
  if (p.dash) updateDash(p, dt);
  else if (G.time >= p.lockUntil) {
    flushSkillBuffer();
    if (KEYS.any()) moveWithKeys(p, dt);
    else if (updateTarget(p, dt)) return;
  }
  turn(p, dt, CONFIG.player.turnRate);
  regenerate(p, dt);
  autoPickup(p);
  expireBuffs();
  updateVisual(p, dt);
  updateChannel(p, dt);
  heroLight.position.set(p.x + 1.6, 6.5 + gy(p.x, p.z), p.z + 1.6); // alto e para o lado da câmera: ilumina sem estourar o herói
}

const dashNear = [];
/** Investida (habilidade): interpolação linear e acerto único por monstro no caminho. */
function updateDash(p, dt) {
  const d = p.dash;
  d.t += dt;
  const k = Math.min(1, d.t / d.dur);
  p.x = d.fx + (d.tx - d.fx) * k; p.z = d.fz + (d.tz - d.fz) * k;
  emit(p.x, 1, p.z, { n: 3, color: 0xffb070, speed: 1, life: 0.3, size: 1 });
  queryMonsters(p.x, p.z, 1.6 + QUERY_PAD, dashNear);
  for (const m of dashNear) {
    if (m.dead || d.hit.has(m.id) || dist2(m, p) >= (1.6 + m.radius) ** 2) continue;
    d.hit.add(m.id);
    hitMonster(m, d.mult, d.id, { kb: 0.8 });
  }
  if (k >= 1) { p.dash = null; shake(0.3); }
}

/** WASD / setas: movimento relativo à câmera. */
function moveWithKeys(p, dt) {
  const fx = -Math.sin(CAM.yaw), fz = -Math.cos(CAM.yaw);
  let mx = 0, mz = 0;
  if (KEYS.w) { mx += fx; mz += fz; }
  if (KEYS.s) { mx -= fx; mz -= fz; }
  if (KEYS.a) { mx += fz; mz -= fx; }
  if (KEYS.d) { mx -= fz; mz += fx; }
  const l = Math.hypot(mx, mz);
  if (!l) return;
  p.path = null; p.target = null;
  stepToward(p, p.x + (mx / l) * 2, p.z + (mz / l) * 2, playerSpeed(), dt, CONFIG.player.radius);
  cancelChannel();
}

/** Age sobre o alvo atual (monstro, barril, item, NPC, portal) e segue o caminho. Devolve true se trocou de zona. */
function updateTarget(p, dt) {
  const t = p.target;
  if (t) {
    if (t.type === 'mon') engageMonster(p, t.m, dt);
    else if (t.type === 'barrel') {
      if (t.b.broken) p.target = null;
      else if (Math.hypot(t.b.x - p.x, t.b.z - p.z) < 2.4) {
        p.path = null; face(p, t.b.x, t.b.z);
        if (p.atkCd <= 0) { p.atkCd = G.st.attackInterval; p.attackAnim = 0.001; breakBarrel(t.b); p.target = null; }
      }
    } else if (t.type === 'loot') {
      if (G.loot.indexOf(t.l) < 0) p.target = null;
      else if (Math.hypot(t.l.x - p.x, t.l.z - p.z) < CONFIG.loot.pickupReach) { p.path = null; pickup(t.l); p.target = null; }
    } else if (t.type === 'npc') {
      if (Math.hypot(t.n.x - p.x, t.n.z - p.z) < 3.2) { p.path = null; p.target = null; face(p, t.n.x, t.n.z); openNpc(t.n.id); }
    } else if (t.type === 'portal') {
      if (Math.hypot(t.p.x - p.x, t.p.z - p.z) < 2.6) { p.path = null; p.target = null; return t.p.onUse() !== false; }
    }
  }
  if (p.path && p.path.length) {
    followPath(p, playerSpeed(), dt, CONFIG.player.radius);
    if (p.moving) cancelChannel();
  }
  return false;
}
function engageMonster(p, m, dt) {
  if (m.dead) { p.target = null; return; }
  const d = Math.hypot(m.x - p.x, m.z - p.z);
  const needLos = G.ch.cls !== 'dk';
  if (d <= attackRange(m) && (!needLos || lineClear(G.L, p.x, p.z, m.x, m.z, 0))) {
    p.path = null;
    face(p, m.x, m.z);
    if (p.atkCd <= 0) basicAttack(m);
    return;
  }
  p.repath -= dt;
  if (p.repath <= 0 || !p.path) { p.repath = CONFIG.player.chaseRepath; pathTo(m.x, m.z); }
}

/** AG rápido como no MU; HP só fora de combate (ou na cidade). */
function regenerate(p, dt) {
  const st = G.st, P = CONFIG.player, town = inSafe();
  G.ag = Math.min(st.maxAg, G.ag + st.maxAg * st.agRegen * P.regenAgPerSec * dt);
  G.mp = Math.min(st.maxMp, G.mp + (st.maxMp * (town ? P.regenMpTown : P.regenMpField) + G.ch.stats.ene / 400) * dt);
  if (town || G.time - G.lastHurt > P.regenHpDelay) G.hp = Math.min(st.maxHp, G.hp + st.maxHp * (town ? P.regenHpTown : P.regenHpField) * dt);
  if (!Number.isFinite(G.hp) || !Number.isFinite(G.mp) || !Number.isFinite(G.ag)) clampVitals();
}
function expireBuffs() {
  if (!G.buffs.length) return;
  const alive = G.buffs.filter((b) => b.until > G.time);
  if (alive.length !== G.buffs.length) { G.buffs = alive; recalc(); }
}

function updateVisual(p, dt) {
  // velocidade real no chão (para a animação não "patinar")
  const vx = p.x - (p.lastX != null ? p.lastX : p.x), vz = p.z - (p.lastZ != null ? p.lastZ : p.z);
  p.lastX = p.x; p.lastZ = p.z;
  p.groundSpeed = dt > 0 ? Math.min(20, Math.hypot(vx, vz) / dt) : 0;
  if (p.attackAnim > 0) { p.attackAnim += dt * 4.2; if (p.attackAnim >= 1) p.attackAnim = 0; }
  if (p.castAnim > 0) { p.castAnim += dt * 3.5; if (p.castAnim >= 1) p.castAnim = 0; }
  if (p.hurtFlash > 0) { p.hurtFlash -= dt; if (p.hurtFlash <= 0) flashModel(p.model, 0, 0); }
  p.model.root.position.set(p.x, gy(p.x, p.z), p.z);
  p.model.root.rotation.y = p.rot;
  // segura o "andando" por um instante: evita piscar para a pose parada entre pontos do caminho
  p.moveHold = p.moving ? CONFIG.player.moveHold : Math.max(0, p.moveHold - dt);
  animateModel(p.model, { t: G.time, dt, moving: p.moving || p.moveHold > 0, run: !inSafe(), v: p.groundSpeed, attack: p.attackAnim, cast: p.castAnim, speed: 11 });
  if (p.model.orb) p.model.orb.scale.setScalar(0.3 + Math.sin(G.time * 6) * 0.04);
}

// ---------- canalização do portal para a cidade (T) ----------
const castbar = { el: null, fill: null, txt: null };
function castUi() {
  if (!castbar.el) { castbar.el = $('#castbar'); castbar.fill = $('#castFill'); castbar.txt = $('#castTxt'); }
  return castbar;
}
/** Interrompe a canalização; devolve true se havia uma em andamento. */
export function cancelChannel() {
  if (!G.cast) return false;
  G.cast = null;
  castUi().el.hidden = true;
  return true;
}
function updateChannel(p, dt) {
  if (!G.cast) return;
  G.cast.t += dt;
  castUi().fill.style.width = Math.min(100, (G.cast.t / G.cast.dur) * 100) + '%';
  if (Math.random() < 0.6) emit(p.x, 0.2, p.z, { n: 2, color: 0xb9a4ff, speed: 1, up: 3, life: 0.8, size: 0.8, grav: 2, spread: 1.2 });
  if (G.cast.t >= G.cast.dur) { const fn = G.cast.fn; cancelChannel(); fn(); }
}
export function townPortal() {
  if (hasTownServices()) { openNpc('portal'); return; }
  if (!G.player.alive || G.cast) return;
  G.player.path = null;
  G.cast = { t: 0, dur: 1.4, fn: enterTown };
  const ui = castUi();
  ui.txt.textContent = 'Abrindo portal para a cidade…';
  ui.fill.style.width = '0%';
  ui.el.hidden = false;
}
