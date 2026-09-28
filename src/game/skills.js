// ---------- habilidades ----------
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { dist2, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit, spawnRing } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { shake } from '../engine/renderer.js';
import { spawnAlly } from './allies.js';
import { hitMonster, monstersIn } from './combat.js';
import { face } from './movement.js';
import { recalc } from './player.js';
import { spawnProjectile } from './projectiles.js';
import { inSafe } from './zones.js';
import { walkableR } from '../world/grid.js';

export function skillUnlocked(id) {
  const sk = R.SKILLS[id];
  return sk && sk.cls === G.ch.cls && G.ch.level >= sk.lvl && G.ch.tier >= sk.tier;
}
export function resetCooldowns() { G.cds = {}; G.skillQueue = null; }
export function cdLeft(id) { return Math.max(0, (G.cds[id] || 0) - G.time); }
function autoTargetPoint(range) {
  const p = G.player;
  let best = null, bd = (range || 14) ** 2;
  for (const m of G.monsters) { if (m.dead) continue; const d = dist2(m, p); if (d < bd) { bd = d; best = m; } }
  if (best) return { x: best.x, z: best.z };
  return { x: p.x + Math.sin(p.rot) * 4, z: p.z + Math.cos(p.rot) * 4 };
}
const CLASS_COLOR = { dk: 0xff8a4a, dw: 0x7aa8ff, elf: 0x8affb0 };
/**
 * Efeito de cada tipo de habilidade (campo `kind` em rules.js → SKILLS).
 * Recebe o contexto já validado (custo pago, alvo limitado ao alcance) e devolve
 * false para cancelar (o custo e a recarga são devolvidos).
 */
const EFFECTS = {
  spin(ctx) {
    const { p, sk, id, mult } = ctx;
    p.attackAnim = 0.001;
    spawnRing(p.x, p.z, 0.5, sk.radius, 0xffe0c0, 0.3);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; emit(p.x + Math.cos(a) * sk.radius * 0.8, 1, p.z + Math.sin(a) * sk.radius * 0.8, { n: 1, color: 0xffc080, speed: 2, life: 0.3, size: 1 }); }
    monstersIn(p.x, p.z, sk.radius).forEach((m) => hitMonster(m, mult, id, { kb: 0.4 }));
    Sfx.swing(); shake(0.2);
    return true;
  },
  dash(ctx) {
    const { p, sk, id, tx, tz, dx, dz, mult } = ctx;
    const steps = Math.floor(sk.range / 0.3);
    let ex = p.x, ez = p.z;
    for (let i = 1; i <= steps; i++) { const nx = p.x + dx * i * 0.3, nz = p.z + dz * i * 0.3; if (!walkableR(G.L, nx, nz, 0.4)) break; ex = nx; ez = nz; if ((nx - tx) ** 2 + (nz - tz) ** 2 < 0.2) break; }
    p.dash = { fx: p.x, fz: p.z, tx: ex, tz: ez, t: 0, dur: 0.16, hit: new Set(), mult, id };
    p.attackAnim = 0.001;
    Sfx.swing();
    return true;
  },
  buff(ctx) {
    const { p, sk, id, col } = ctx;
    G.buffs = G.buffs.filter((b) => b.id !== id);
    G.buffs.push({ id, name: sk.name, until: G.time + sk.dur, stats: sk.buff });
    recalc();
    if (sk.buff.hpPct) G.hp = Math.min(G.st.maxHp, G.hp * (1 + sk.buff.hpPct / 100));
    emit(p.x, 0.2, p.z, { n: 40, color: col, speed: 2, up: 4, life: 1, size: 1, grav: 3, spread: 1.4 });
    spawnRing(p.x, p.z, 0.4, 2.6, col, 0.6);
    p.castAnim = 0.001;
    Sfx.tone(440, 0.4, 'triangle', 0.05, 1.5);
    return true;
  },
  quake(ctx) {
    const { p, sk, id, mult } = ctx;
    p.attackAnim = 0.001;
    for (let k = 0; k < 3; k++) G.delayed.push({ t: k * 0.12, fn: () => { spawnRing(p.x, p.z, 0.6, sk.radius * (0.6 + k * 0.2), 0xffb070, 0.45); emit(p.x, 0.3, p.z, { n: 30, color: 0xc8a070, speed: 8, up: 0.6, life: 0.6, size: 1.2, spread: 2 }); } });
    monstersIn(p.x, p.z, sk.radius).forEach((m) => hitMonster(m, mult, id, { kb: 1.4 }));
    shake(0.8); Sfx.boom();
    return true;
  },
  nuke(ctx) {
    const { p, sk, id, tx, tz, mult } = ctx;
    p.attackAnim = 0.001;
    spawnRing(tx, tz, 0.4, sk.radius, 0xff4a2a, 0.3, { hold: true, op: 0.6 });
    G.delayed.push({ t: 0.28, fn: () => {
      emit(tx, 0.5, tz, { n: 90, color: 0xff7a3a, speed: 12, up: 1, life: 0.8, size: 1.6, spread: 1, jitter: true });
      emit(tx, 0.5, tz, { n: 40, color: 0xffe0a0, speed: 5, up: 3, life: 0.6, size: 1.2 });
      spawnRing(tx, tz, 0.5, sk.radius * 1.1, 0xffa050, 0.5);
      monstersIn(tx, tz, sk.radius).forEach((m) => hitMonster(m, mult, id, { slow: true, kb: 0.8, fromX: tx, fromZ: tz }));
      shake(1); Sfx.boom();
    } });
    return true;
  },
  bolt(ctx) {
    const { p, sk, id, dx, dz, mult } = ctx;
    p.castAnim = 0.001;
    spawnProjectile({ from: 'p', x: p.x + dx * 0.8, z: p.z + dz * 0.8, dx, dz, speed: 24, range: sk.range + 2, mult, skill: id, color: 0x7ab4ff, size: 0.5 });
    Sfx.zap();
    return true;
  },
  burst(ctx) {
    const { p, sk, id, tx, tz, mult } = ctx;
    p.castAnim = 0.001;
    for (let k = 0; k < 6; k++) G.delayed.push({ t: k * 0.05, fn: () => emit(tx, 0.2, tz, { n: 14, color: k % 2 ? 0xff7a2a : 0xffc04a, speed: 1.5, up: 7, life: 0.7, size: 1.3, grav: 2, spread: sk.radius }) });
    spawnRing(tx, tz, 0.3, sk.radius, 0xff7a2a, 0.4);
    monstersIn(tx, tz, sk.radius).forEach((m) => hitMonster(m, mult, id));
    Sfx.noise(0.3, 0.08, 900);
    return true;
  },
  blink(ctx) {
    const { p, tx, tz } = ctx;
    if (!walkableR(G.L, tx, tz, 0.3)) { floatText(p.x, 2.6, p.z, 'Destino inválido', 'info'); return false; }
    emit(p.x, 1, p.z, { n: 30, color: 0x9ab8ff, speed: 4, up: 1, life: 0.5, size: 1 });
    p.x = tx; p.z = tz;
    emit(p.x, 1, p.z, { n: 30, color: 0x9ab8ff, speed: 4, up: 1, life: 0.5, size: 1 });
    spawnRing(p.x, p.z, 0.2, 2, 0x9ab8ff, 0.4);
    Sfx.tone(700, 0.2, 'sine', 0.05, 2);
    return true;
  },
  meteor(ctx) {
    const { p, sk, id, tx, tz, mult } = ctx;
    p.castAnim = 0.001;
    const isRain = id === 'rain';
    spawnRing(tx, tz, sk.radius, sk.radius, isRain ? 0x8affb0 : 0xff5a2a, 0.5, { hold: true, op: 0.5 });
    if (isRain) {
      for (let k = 0; k < 10; k++) G.delayed.push({ t: k * 0.05, fn: () => emit(tx, 9, tz, { n: 6, color: 0xd8ffe0, speed: 16, dir: [0, -1, 0], life: 0.5, size: 0.6, grav: -20, spread: sk.radius * 1.6 }) });
    } else {
      for (let k = 0; k < 8; k++) G.delayed.push({ t: k * 0.055, fn: () => { const f = 1 - k / 8; emit(tx + 4 * f, 1 + 9 * f, tz - 3 * f, { n: 8, color: 0xff8a3a, speed: 1, life: 0.4, size: 2.2 * (1 - f * 0.5), grav: 0 }); } });
    }
    G.delayed.push({ t: 0.5, fn: () => {
      emit(tx, 0.4, tz, { n: isRain ? 30 : 70, color: isRain ? 0x8affb0 : 0xff6a2a, speed: isRain ? 5 : 10, up: 1, life: 0.7, size: 1.3, spread: sk.radius * (isRain ? 1.4 : 0.5), jitter: true });
      monstersIn(tx, tz, sk.radius).forEach((m) => hitMonster(m, mult, id, { kb: isRain ? 0 : 0.6, fromX: tx, fromZ: tz }));
      shake(isRain ? 0.2 : 0.6); Sfx.boom();
    } });
    return true;
  },
  nova(ctx) {
    const { p, sk, id, mult } = ctx;
    p.castAnim = 0.001;
    const fire = id === 'hell';
    const c = fire ? 0xff6a2a : 0x9ae0ff;
    spawnRing(p.x, p.z, 0.5, sk.radius, c, 0.5, { op: 0.9 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; emit(p.x + Math.cos(a), 0.6, p.z + Math.sin(a), { n: 1, color: c, speed: sk.radius * 2, dir: [Math.cos(a), 0.05, Math.sin(a)], life: 0.5, size: 1.4, grav: 0, drag: 0.5 }); }
    monstersIn(p.x, p.z, sk.radius).forEach((m) => hitMonster(m, mult, id, { slow: !fire, kb: 0.6 }));
    shake(0.5); Sfx.noise(0.5, 0.1, fire ? 700 : 2600);
    return true;
  },
  multishot(ctx) {
    const { p, sk, id, dx, dz, mult } = ctx;
    p.attackAnim = 0.001;
    const n = sk.arrows + (G.ch.tier >= 1 ? 2 : 0);
    const base = Math.atan2(dx, dz);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.16;
      spawnProjectile({ from: 'p', arrow: true, x: p.x, z: p.z, dx: Math.sin(a), dz: Math.cos(a), speed: 30, range: sk.range, mult, skill: id, color: 0xd8ffe0 });
    }
    Sfx.tone(1200, 0.08, 'triangle', 0.03, 0.5);
    return true;
  },
  pierce(ctx) {
    const { p, sk, id, dx, dz, mult } = ctx;
    p.attackAnim = 0.001;
    spawnProjectile({ from: 'p', x: p.x, z: p.z, dx, dz, speed: 34, range: sk.range, mult, skill: id, color: 0x8affb0, size: 0.45, pierce: true, big: true });
    Sfx.tone(900, 0.12, 'sawtooth', 0.03, 0.5);
    return true;
  },
  heal(ctx) {
    const { p } = ctx;
    const a = G.st.maxHp * 0.2 * (1 + G.st.healPct / 100) + G.ch.stats.ene / 5;
    G.hp = Math.min(G.st.maxHp, G.hp + a);
    floatText(p.x, 2.6, p.z, '+' + fmt(a), 'heal');
    emit(p.x, 0.3, p.z, { n: 40, color: 0x8aff9a, speed: 1.5, up: 4, life: 1, size: 1, grav: 2, spread: 1.4 });
    p.castAnim = 0.001;
    Sfx.tone(660, 0.4, 'sine', 0.05, 1.5);
    return true;
  },
  summon(ctx) {
    const { p, sk, dx, dz } = ctx;
    spawnAlly('spirit', p.x + dx * 1.5, p.z + dz * 1.5, sk.dur);
    p.castAnim = 0.001;
    emit(p.x + dx * 1.5, 0.5, p.z + dz * 1.5, { n: 50, color: 0x8affb0, speed: 3, up: 2, life: 0.8, size: 1.2 });
    return true;
  },
};

export function castSkill(id, tx, tz) {
  const p = G.player, ch = G.ch, st = G.st;
  if (!p.alive || inSafe()) { if (p.alive) floatText(p.x, 2.6, p.z, 'Habilidades desativadas na zona segura', 'info'); return false; }
  const sk = R.SKILLS[id];
  if (!sk || !skillUnlocked(id)) return false;
  if (cdLeft(id) > 0 || G.time < p.lockUntil) return false;
  const cost = R.skillCost(st, sk);
  if (G.mp < cost.mp) { floatText(p.x, 2.6, p.z, 'Mana insuficiente', 'info'); return false; }
  if (G.ag < cost.ag) { floatText(p.x, 2.6, p.z, 'AG insuficiente', 'info'); return false; }
  if (tx == null) { const a = autoTargetPoint(sk.range || 14); tx = a.x; tz = a.z; }
  // limita ao alcance
  let dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 0.001;
  if (sk.range && d > sk.range) { tx = p.x + (dx / d) * sk.range; tz = p.z + (dz / d) * sk.range; d = sk.range; }
  dx /= d; dz /= d;
  G.mp -= cost.mp; G.ag -= cost.ag;
  G.cds[id] = G.time + sk.cd * (1 + st.cdPct / 100);
  p.lockUntil = G.time + Math.min(0.35, sk.cd * 0.7);
  face(p, tx, tz); p.rot = p.rotTarget;
  p.path = null;
  const ctx = { p, sk, id, tx, tz, dx, dz, mult: sk.mult, col: CLASS_COLOR[ch.cls], cost };
  const fx = EFFECTS[sk.kind];
  if (!fx || fx(ctx) === false) { G.mp += cost.mp; G.ag += cost.ag; G.cds[id] = 0; p.lockUntil = G.time; return false; }
  return true;
}
export function castSlot(i, tx, tz) {
  const id = G.ch.skillBar[i];
  return id ? castSkill(id, tx, tz) : false;
}
/**
 * Pedido de habilidade vindo do teclado/mouse. Se o herói ainda está preso na
 * animação anterior, o pedido fica guardado por CONFIG.input.skillBuffer e sai
 * assim que a trava acabar (sensação de resposta imediata em combos).
 */
export function requestCast(i, tx, tz) {
  const p = G.player;
  if (p && p.alive && G.time < p.lockUntil) {
    G.skillQueue = { i, tx, tz, until: G.time + CONFIG.input.skillBuffer };
    return;
  }
  castSlot(i, tx, tz);
}
export function flushSkillBuffer() {
  const q = G.skillQueue;
  if (!q) return;
  G.skillQueue = null;
  if (G.time <= q.until) castSlot(q.i, q.tx, q.tz);
}
