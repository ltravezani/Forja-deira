// ---------- jogador: status, modelo, movimento, alvo e recuperação ----------
import { attachHeroAura, attachRefineFx, refineColor, refineK } from '../art/items.js';
import { animateModel, attachWings, buildHumanoid, disposeModel, flashModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { $, dist2, R, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { afterimage } from '../engine/skillfx.js';
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
import { gy, lineClear, walkableR } from '../world/grid.js';

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
  const armorBase = { dk: 0x7a7e88, dw: 0x2e2a48, elf: 0x4a5a34, de: [0x3a2a44, 0x4a1a2a, 0x2a1a3a][ch.tier] || 0x3a2a44, nc: [0x1a1a22, 0x24222c, 0x3a0e16][ch.tier] || 0x1a1a22 }[ch.cls];
  const o = {
    dk: { gltf: 'knight', skin: 0xd8a888, cloth: 0x4a1616, head: 'helm', eye: 0xff5a3a, weapon: 'sword', bulky: true, shield: true, horns: ch.tier >= 1, cape: true, capeColor: 0x3a0e10, shieldColor: 0x5a1414 },
    dw: { gltf: 'mage', skin: 0xe0b89a, cloth: 0x221c3a, head: 'hood', weapon: 'staff', robe: true, weaponGlow: 0x7aa8ff, eye: 0x9ac8ff, cape: true, capeColor: 0x1a1430 },
    elf: { gltf: 'rogue', skin: 0xf0caa8, cloth: 0x2e3a22, head: 'hair', hair: 0xd8b86a, weapon: 'bow', thin: true, cape: true, capeColor: 0x24301a },
    // Dark Elf: modelo feminino sem capuz (Rogue), pele cinza-lilás, uma espada em cada mão (só a direita é o item equipado)
    de: { gltf: 'rogueFem', tintK: 0.7, skinK: 0.3, skin: 0xb49ccc, hoodColor: [0x2a1a3a, 0x5a0e22, 0x1e0a30][ch.tier] || 0x2a1a3a, cloth: [0x1e1428, 0x3a0a18, 0x160a22][ch.tier] || 0x1e1428, head: 'hair', hair: 0xeae4f4, eye: 0xff4a7a, weapon: 'blade', offhand: true, thin: true, cape: true, capeColor: [0x2a0e2a, 0x4a0a14, 0x1a0628][ch.tier] || 0x2a0e2a },
    // Necromancer: manto negro e chapéu; como Death Knight e Bloody Knight veste armadura com elmo e chifres.
    // Sempre um cajado em cada mão (só o da direita é o item equipado).
    nc: ch.tier >= 1
      ? { gltf: 'knight', tintK: 0.75, skinK: 0.4, skin: 0xc8c0b8, cloth: ch.tier >= 2 ? 0x3a060c : 0x121018, head: 'helm', horns: true, eye: ch.tier >= 2 ? 0xff3a4a : 0x7affb0, weapon: 'rod', offhand: true, bulky: true, weaponGlow: ch.tier >= 2 ? 0xff3a4a : 0x7affb0, cape: true, capeColor: ch.tier >= 2 ? 0x4a0a10 : 0x1a0a14 }
      : { gltf: 'mage', tintK: 0.8, skinK: 0.4, skin: 0xc8c0b8, cloth: 0x16161c, head: 'hood', eye: 0x7affb0, weapon: 'rod', offhand: true, robe: true, weaponGlow: 0x7affb0, cape: true, capeColor: 0x0e0e12 },
  }[ch.cls];
  o.armor = tint(eq.armor || eq.helm, armorBase);
  o.trim = rc(eq.gloves || eq.boots, ch.tier >= 1 ? 0xffd24a : 0xc9a24a);
  if (eq.weapon) {
    o.weaponColor = tint(eq.weapon, 0xc8d0dc);
    if (R.RARITY[eq.weapon.rarity].order >= 2) o.weaponGlow = rc(eq.weapon);
    if (ch.cls === 'dw') o.weaponGlow = rc(eq.weapon, 0x7aa8ff);
    if (ch.cls === 'nc' && R.RARITY[eq.weapon.rarity].order < 2) o.weaponGlow = ch.tier >= 2 ? 0xff3a4a : 0x7affb0;
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
  else if (ch.tier >= 2) attachWings(m, { dk: 0xff6a3a, dw: 0x7aa8ff, elf: 0x8affb0, de: 0xff2a6a, nc: 0xb04aff }[ch.cls], 0.8);
  m.orb = m.weapon ? m.weapon.children.find((c) => c.userData.orb) || null : null;
  applyRefine(m, ch.equip);
  return m;
}
/**
 * Brilho de refino no herói: a arma +10 ganha aura e faíscas; a maior peça de
 * armadura +10 faz as placas pulsarem e solta faíscas pelo corpo; +15 acende o halo no chão.
 */
function applyRefine(m, eq) {
  const fx = [];
  const w = eq.weapon;
  if (w && m.weapon) fx.push(attachRefineFx(m.weapon, w.plus || 0));
  if (w && m.offhand) fx.push(attachRefineFx(m.offhand, w.plus || 0)); // a cópia da mão esquerda brilha junto
  const ap = Math.max(0, ...['helm', 'armor', 'gloves', 'boots', 'wings'].map((s) => (eq[s] && eq[s].plus) || 0));
  const ak = refineK(ap), top = Math.max(ap, (w && w.plus) || 0);
  // o halo no chão aparece com qualquer peça +15; sem armadura refinada, só ele e poucas faíscas
  if (ak || top >= 15) fx.push(attachHeroAura(m.root, Math.max(ap, top >= 15 ? 10 : 0), 2.45, top >= 15));
  if (ak) {
    const c = new THREE.Color(refineColor(ap));
    fx.push({
      update(t) {
        if (m.flashing) return;
        for (const mat of [m.armorMat, m.trimMat]) { mat.emissive.copy(c); mat.emissiveIntensity = ak * (0.1 + 0.07 * Math.sin(t * 3)); }
      },
    });
  }
  m.fx = fx.filter(Boolean);
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
  G.player = { x: 0, z: 0, rot: 0, model: null, path: null, target: null, atkCd: 0, attackAnim: 0, castAnim: 0, lockUntil: 0, dash: null, shove: null, hop: null, spin: null, pop: null, lean: 0, castFace: null, castMove: 0, alive: true, repath: 0, hurtFlash: 0, moveHold: 0 };
}

// ---------- atualização por quadro ----------
export function updatePlayer(dt) {
  const p = G.player;
  if (!p.alive) {
    if (p.model && p.model.dead) animateModel(p.model, { t: G.time, dt, dead: true }); // queda do modelo animado
    return;
  }
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { p.x = G.L.start.x * TILE; p.z = G.L.start.z * TILE; p.path = null; }
  p.atkCd -= dt;
  p.moving = false;
  // segurar o botão = seguir o cursor (estilo ARPG)
  if (mouse.down && G.time - mouse.lastRepath > CONFIG.player.holdRepath) {
    mouse.lastRepath = G.time;
    clickWorld(mouse.x, mouse.y, true);
  }
  if (p.shove) updateShove(p, dt);
  const locked = G.time < p.lockUntil;
  if (p.dash) updateDash(p, dt);
  else if (!locked) {
    p.castFace = null;
    flushSkillBuffer();
    if (KEYS.any()) moveWithKeys(p, dt, 1);
    else if (updateTarget(p, dt)) return;
  } else castMotion(p, dt);
  // durante a habilidade o herói vira rápido (sem estalo) para o alvo
  turn(p, dt, locked || p.dash ? 30 : CONFIG.player.turnRate);
  regenerate(p, dt);
  autoPickup(p);
  expireBuffs();
  updateVisual(p, dt);
  updateChannel(p, dt);
  heroLight.position.set(p.x + 1.6, 6.5 + gy(p.x, p.z), p.z + 1.6); // alto e para o lado da câmera: ilumina sem estourar o herói
}

/**
 * Enquanto a habilidade trava o herói: as leves (projéteis, magias no alvo)
 * deixam andar devagar pelo caminho ou pelo teclado, sempre de frente para o
 * alvo; as pesadas (investida, salto) seguram o herói no lugar.
 */
function castMotion(p, dt) {
  if (p.castMove > 0) {
    if (KEYS.any()) moveWithKeys(p, dt, p.castMove);
    else if (p.path && p.path.length) followPath(p, playerSpeed() * p.castMove, dt, CONFIG.player.radius);
  }
  if (p.castFace != null) p.rotTarget = p.castFace;
}
/** Avanço/recuo curto de uma habilidade (desacelera no fim e para na parede). */
function updateShove(p, dt) {
  const s = p.shove;
  const k0 = Math.min(1, s.t / s.dur);
  s.t += dt;
  const k1 = Math.min(1, s.t / s.dur);
  const step = s.dist * ((1 - Math.pow(1 - k1, 3)) - (1 - Math.pow(1 - k0, 3)));
  const nx = p.x + s.dx * step, nz = p.z + s.dz * step;
  if (walkableR(G.L, nx, nz, CONFIG.player.radius)) { p.x = nx; p.z = nz; } else s.t = s.dur;
  if (s.t >= s.dur) p.shove = null;
}

const dashNear = [];
/** Investida (habilidade): arranca rápido e freia no fim, deixando pós-imagens; acerto único por monstro no caminho. */
function updateDash(p, dt) {
  const d = p.dash;
  d.t += dt;
  const k = Math.min(1, d.t / d.dur), e = 1 - Math.pow(1 - k, 3);
  p.x = d.fx + (d.tx - d.fx) * e; p.z = d.fz + (d.tz - d.fz) * e;
  if (d.t - (d.ghost || 0) > 0.035 && k < 0.9) { d.ghost = d.t; afterimage(p.x, p.z, p.rot, d.color || 0xffb070, 0.3); }
  emit(p.x, 1, p.z, { n: 3, color: d.color || 0xffb070, speed: 1, life: 0.3, size: 1 });
  queryMonsters(p.x, p.z, 1.6 + QUERY_PAD, dashNear);
  for (const m of dashNear) {
    if (m.dead || d.hit.has(m.id) || dist2(m, p) >= (1.6 + m.radius) ** 2) continue;
    d.hit.add(m.id);
    hitMonster(m, d.mult, d.id, { kb: 0.8 });
  }
  if (k >= 1) { const end = d.onEnd; p.dash = null; shake(0.3); if (end) end(); }
}

/** WASD / setas: movimento relativo à câmera. */
function moveWithKeys(p, dt, speedMul) {
  const fx = -Math.sin(CAM.yaw), fz = -Math.cos(CAM.yaw);
  let mx = 0, mz = 0;
  if (KEYS.w) { mx += fx; mz += fz; }
  if (KEYS.s) { mx -= fx; mz -= fz; }
  if (KEYS.a) { mx += fz; mz -= fx; }
  if (KEYS.d) { mx -= fz; mz += fx; }
  const l = Math.hypot(mx, mz);
  if (!l) return;
  p.path = null; p.target = null;
  stepToward(p, p.x + (mx / l) * 2, p.z + (mz / l) * 2, playerSpeed() * speedMul, dt, CONFIG.player.radius);
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
  const needLos = G.ch.cls !== 'dk' && G.ch.cls !== 'de';
  if (d <= attackRange(m) && (!needLos || lineClear(G.L, p.x, p.z, m.x, m.z, 0))) {
    p.path = null;
    face(p, m.x, m.z);
    if (p.atkCd <= 0) basicAttack(m);
    return;
  }
  p.repath -= dt;
  if (p.repath <= 0 || !p.path) { p.repath = CONFIG.player.chaseRepath; pathTo(m.x, m.z); }
}

/** AG regenera rápido; HP só fora de combate (ou na cidade). */
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
  const root = p.model.root;
  root.position.set(p.x, gy(p.x, p.z) + skillPose(p, dt), p.z);
  root.rotation.order = 'YXZ'; // inclinação para a frente no eixo do próprio herói
  root.rotation.x = p.lean;
  // segura o "andando" por um instante: evita piscar para a pose parada entre pontos do caminho
  p.moveHold = p.moving ? CONFIG.player.moveHold : Math.max(0, p.moveHold - dt);
  animateModel(p.model, { t: G.time, dt, moving: p.moving || p.moveHold > 0, run: !inSafe(), v: p.groundSpeed, attack: p.attackAnim, cast: p.castAnim, speed: 11 });
  if (p.model.orb) p.model.orb.scale.setScalar(0.3 + Math.sin(G.time * 6) * 0.04);
}

/**
 * Pose das habilidades por cima da animação: salto (hop), giro completo (spin),
 * encolher e reaparecer (pop, teleporte) e inclinação na investida. Define a
 * rotação e a escala da raiz e devolve o deslocamento vertical.
 */
function skillPose(p, dt) {
  const root = p.model.root;
  let y = 0, spin = 0, sc = 1;
  const leanTo = p.dash ? 0.45 : p.hop ? -0.12 : 0;
  p.lean += (leanTo - p.lean) * Math.min(1, dt * 18);
  if (p.hop) {
    const h = p.hop; h.t += dt;
    const k = Math.min(1, h.t / h.dur);
    y = Math.sin(k * Math.PI) * h.h;
    if (k >= 1) p.hop = null;
  }
  if (p.spin) {
    const s = p.spin; s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    spin = (s.turns > 1 ? k : 1 - Math.pow(1 - k, 2)) * Math.PI * 2 * (s.turns || 1) * (s.dir || 1);
    if (k >= 1) p.spin = null;
  }
  if (p.pop) {
    const s = p.pop; s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    sc = k < 1 ? 0.25 + 0.75 * (1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2)) : 1; // volta com leve exagero
    if (k >= 1) p.pop = null;
  }
  root.rotation.y = p.rot + spin;
  const m = p.model;
  if (m.baseScale == null) m.baseScale = root.scale.x; // escala cartoon do modelo
  root.scale.set(m.baseScale * sc, m.baseScale * sc * (2 - sc), m.baseScale * sc);
  return y;
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
