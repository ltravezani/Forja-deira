// ---------- habilidades ----------
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { dist2, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { GEO } from '../art/geometry.js';
import { emit, spawnRing } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { shake } from '../engine/renderer.js';
import { afterimage, bubble, cracks, fall, flash, pillar, scorch, shards, slash } from '../engine/skillfx.js';
import { spawnAlly } from './allies.js';
import { hitMonster, monstersIn } from './combat.js';
import { hitStop } from './feel.js';
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
/** Monstro vivo mais próximo do herói dentro do alcance; sem nenhum, vale o ponto dado (ou à frente do herói). */
function autoTargetPoint(range, fx, fz) {
  const p = G.player;
  let best = null, bd = Infinity;
  for (const m of G.monsters) {
    if (m.dead) continue;
    const d = dist2(m, p), r = range + (m.radius || 0);
    if (d <= r * r && d < bd) { bd = d; best = m; }
  }
  if (best) return { x: best.x, z: best.z };
  if (fx != null) return { x: fx, z: fz };
  return { x: p.x + Math.sin(p.rot) * 4, z: p.z + Math.cos(p.rot) * 4 };
}
const CLASS_COLOR = { dk: 0xff8a4a, dw: 0x7aa8ff, elf: 0x8affb0 };
/** Habilidades que seguram o herói no lugar; as demais deixam andar devagar enquanto saem. */
const HEAVY = { dash: 1, quake: 1, nuke: 1, blink: 1 };
/** Faíscas na mão/arma do herói no instante do lançamento. */
function castGlow(p, dx, dz, color, n) {
  emit(p.x + dx * 0.7, 1.3, p.z + dz * 0.7, { n: n || 10, color, speed: 2.5, life: 0.25, size: 0.9, grav: 0 });
}
/** Recuo ou avanço curto do herói (ver updateShove em player.js). */
function shove(p, dx, dz, dist, dur) {
  if (dist > 0.01) p.shove = { dx, dz, dist, t: 0, dur };
}
/**
 * Efeito de cada tipo de habilidade (campo `kind` em rules.js → SKILLS).
 * Recebe o contexto já validado (custo pago, alvo limitado ao alcance) e devolve
 * false para cancelar (o custo e a recarga são devolvidos).
 */
const EFFECTS = {
  spin(ctx) {
    const { p, sk, id, mult } = ctx;
    p.attackAnim = 0.001;
    p.spin = { t: 0, dur: 0.3 };
    slash(p.x, p.z, p.rot, sk.radius * 0.95, 0xffe8c8, { wide: true, sweep: Math.PI * 2, dur: 0.3, y: 1 });
    slash(p.x, p.z, p.rot + 1.2, sk.radius * 0.72, 0xff8a4a, { wide: true, sweep: Math.PI * 2, dur: 0.34, y: 0.65, op: 0.6 });
    spawnRing(p.x, p.z, 0.5, sk.radius, 0xffe0c0, 0.3);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; emit(p.x + Math.cos(a) * sk.radius * 0.8, 1, p.z + Math.sin(a) * sk.radius * 0.8, { n: 1, color: 0xffc080, speed: 3, dir: [-Math.sin(a), 0.2, Math.cos(a)], life: 0.3, size: 1, grav: 0 }); }
    monstersIn(p.x, p.z, sk.radius).forEach((m) => hitMonster(m, mult, id, { kb: 0.4 }));
    Sfx.swing(); shake(0.2);
    return true;
  },
  dash(ctx) {
    const { p, sk, id, tx, tz, dx, dz, mult } = ctx;
    const steps = Math.floor(sk.range / 0.3);
    let ex = p.x, ez = p.z;
    for (let i = 1; i <= steps; i++) { const nx = p.x + dx * i * 0.3, nz = p.z + dz * i * 0.3; if (!walkableR(G.L, nx, nz, 0.4)) break; ex = nx; ez = nz; if ((nx - tx) ** 2 + (nz - tz) ** 2 < 0.2) break; }
    emit(p.x, 0.2, p.z, { n: 14, color: 0xc8a070, speed: 3, up: 0.4, life: 0.45, size: 1.1, spread: 0.6 });
    p.dash = { fx: p.x, fz: p.z, tx: ex, tz: ez, t: 0, dur: 0.2, hit: new Set(), mult, id, color: 0xffb070, onEnd: () => {
      slash(p.x, p.z, p.rot, 2.8, 0xffe0b0, { sweep: 0.5, dur: 0.2 });
      emit(p.x + dx * 1.2, 1.1, p.z + dz * 1.2, { n: 16, color: 0xffd0a0, speed: 6, dir: [dx, 0.1, dz], life: 0.3, size: 0.9, grav: 0 });
      flash(p.x + dx, 1.2, p.z + dz, 0xffa050, 30, 0.22);
    } };
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
    pillar(p.x, p.z, 1.1, 5, col, 0.8);
    if (sk.buff.dmgRed) bubble(p.x, p.z, 1.3, 0x9ac8ff, 1.3, p);
    flash(p.x, 1.5, p.z, col, 35, 0.5);
    p.castAnim = 0.001;
    Sfx.tone(440, 0.4, 'triangle', 0.05, 1.5);
    return true;
  },
  quake(ctx) {
    const { p, sk, id, mult } = ctx;
    p.attackAnim = 0.001;
    p.hop = { t: 0, dur: 0.24, h: 1.1 };
    // o impacto sai na aterrissagem do salto
    G.delayed.push({ t: 0.22, fn: () => {
      if (!p.alive) return;
      const x = p.x, z = p.z;
      for (let k = 0; k < 3; k++) G.delayed.push({ t: k * 0.12, fn: () => { spawnRing(x, z, 0.6, sk.radius * (0.6 + k * 0.2), 0xffb070, 0.45); emit(x, 0.3, z, { n: 30, color: 0xc8a070, speed: 8, up: 0.6, life: 0.6, size: 1.2, spread: 2 }); } });
      cracks(x, z, sk.radius * 0.9, 10, 0xff9a4a, 0.9);
      shards(x, z, 1.2, sk.radius * 0.8, 10, 0xc89a60, 0.7, { h: 1, stagger: 0.15 });
      scorch(x, z, sk.radius * 0.5, 3);
      flash(x, 1, z, 0xffa050, 50, 0.35);
      monstersIn(x, z, sk.radius).forEach((m) => hitMonster(m, mult, id, { kb: 1.4 }));
      shake(0.8); Sfx.boom(); hitStop(CONFIG.feel.hitStop);
    } });
    Sfx.swing();
    return true;
  },
  nuke(ctx) {
    const { p, sk, id, tx, tz, dx, dz, d, mult } = ctx;
    p.attackAnim = 0.001;
    shove(p, dx, dz, Math.min(1.4, d - 2), 0.2);
    slash(p.x + dx * 0.6, p.z + dz * 0.6, p.rot, 2.6, 0xff6a3a, { sweep: 1.8, dur: 0.24 });
    spawnRing(tx, tz, 0.4, sk.radius, 0xff4a2a, 0.3, { hold: true, op: 0.6 });
    G.delayed.push({ t: 0.28, fn: () => {
      emit(tx, 0.5, tz, { n: 90, color: 0xff7a3a, speed: 12, up: 1, life: 0.8, size: 1.6, spread: 1, jitter: true });
      emit(tx, 0.5, tz, { n: 40, color: 0xffe0a0, speed: 5, up: 3, life: 0.6, size: 1.2 });
      spawnRing(tx, tz, 0.5, sk.radius * 1.1, 0xffa050, 0.5);
      pillar(tx, tz, sk.radius * 0.35, 7, 0xff5a2a, 0.7, { grow: 1 });
      pillar(tx, tz, sk.radius * 0.16, 9, 0xffe0a0, 0.5, { grow: 0.5 });
      cracks(tx, tz, sk.radius, 12, 0xff6a2a, 1);
      scorch(tx, tz, sk.radius * 0.7, 4);
      flash(tx, 1.5, tz, 0xff6a2a, 90, 0.5);
      monstersIn(tx, tz, sk.radius).forEach((m) => hitMonster(m, mult, id, { slow: true, kb: 0.8, fromX: tx, fromZ: tz }));
      shake(1); Sfx.boom(); hitStop(CONFIG.feel.hitStop);
    } });
    Sfx.swing();
    return true;
  },
  bolt(ctx) {
    const { p, sk, id, dx, dz, mult } = ctx;
    p.castAnim = 0.001;
    castGlow(p, dx, dz, 0x9ac8ff);
    spawnProjectile({ from: 'p', x: p.x + dx * 0.8, z: p.z + dz * 0.8, dx, dz, speed: 24, range: sk.range + 2, mult, skill: id, color: 0x7ab4ff, size: 0.55, spiral: 0xd0e4ff });
    Sfx.zap();
    return true;
  },
  burst(ctx) {
    const { p, sk, id, dx, dz, tx, tz, mult } = ctx;
    p.castAnim = 0.001;
    castGlow(p, dx, dz, 0xff9a3a);
    for (let k = 0; k < 6; k++) G.delayed.push({ t: k * 0.05, fn: () => emit(tx, 0.2, tz, { n: 14, color: k % 2 ? 0xff7a2a : 0xffc04a, speed: 1.5, up: 7, life: 0.7, size: 1.3, grav: 2, spread: sk.radius }) });
    spawnRing(tx, tz, 0.3, sk.radius, 0xff7a2a, 0.4);
    pillar(tx, tz, sk.radius * 0.45, 5, 0xff6a1a, 0.7, { grow: 0.6 });
    pillar(tx, tz, sk.radius * 0.22, 6.5, 0xffd07a, 0.55, { grow: 0.3 });
    scorch(tx, tz, sk.radius * 0.55, 2.5);
    flash(tx, 1.5, tz, 0xff7a2a, 45, 0.4);
    monstersIn(tx, tz, sk.radius).forEach((m) => hitMonster(m, mult, id));
    Sfx.noise(0.3, 0.08, 900);
    return true;
  },
  blink(ctx) {
    const { p, tx, tz } = ctx;
    if (!walkableR(G.L, tx, tz, 0.3)) { floatText(p.x, 2.6, p.z, 'Destino inválido', 'info'); return false; }
    const fx = p.x, fz = p.z;
    // implosão na origem, rastro até o destino e reaparição com leve exagero
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; emit(fx + Math.cos(a) * 1.6, 1, fz + Math.sin(a) * 1.6, { n: 1, color: 0x9ab8ff, speed: 5, dir: [-Math.cos(a), 0.15, -Math.sin(a)], life: 0.3, size: 1, grav: 0, drag: 0 }); }
    afterimage(fx, fz, p.rot, 0x9ab8ff, 0.35);
    const len = Math.hypot(tx - fx, tz - fz), n = Math.ceil(len / 0.6);
    for (let i = 1; i < n; i++) { const k = i / n; emit(fx + (tx - fx) * k, 1, fz + (tz - fz) * k, { n: 2, color: 0xc8d8ff, speed: 0.6, life: 0.35, size: 0.8, grav: 0 }); }
    p.x = tx; p.z = tz;
    p.pop = { t: 0, dur: 0.28 };
    emit(p.x, 1, p.z, { n: 30, color: 0x9ab8ff, speed: 4, up: 1, life: 0.5, size: 1 });
    spawnRing(p.x, p.z, 0.2, 2, 0x9ab8ff, 0.4);
    pillar(p.x, p.z, 0.8, 4, 0x9ab8ff, 0.45);
    flash(p.x, 1.5, p.z, 0x9ab8ff, 35, 0.3);
    Sfx.tone(700, 0.2, 'sine', 0.05, 2);
    return true;
  },
  meteor(ctx) {
    const { p, sk, id, dx, dz, tx, tz, mult } = ctx;
    p.castAnim = 0.001;
    const isRain = id === 'rain';
    const col = isRain ? 0x8affb0 : 0xff6a2a;
    castGlow(p, dx, dz, isRain ? 0xd8ffe0 : 0xff9a3a);
    spawnRing(tx, tz, sk.radius, sk.radius, isRain ? 0x8affb0 : 0xff5a2a, 0.5, { hold: true, op: 0.5 });
    if (isRain) {
      // flechas de luz caindo em toda a área, a última chega junto com o impacto
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sk.radius;
        const ax = tx + Math.cos(a) * r, az = tz + Math.sin(a) * r;
        fall(ax, az, { geo: GEO.box, color: 0xd8ffe0, stretch: true, size: 1, dur: 0.24, delay: k * 0.018, from: [1.2, 9, -0.8], trail: { n: 1, color: 0xd8ffe0, speed: 0.2, life: 0.2, size: 0.6, grav: 0, spread: 0.05 },
          onLand: () => emit(ax, 0.2, az, { n: 4, color: 0xd8ffe0, speed: 3, up: 0.8, life: 0.3, size: 0.7 }) });
      }
    } else {
      const trail = { n: 3, color: 0xff8a3a, speed: 1, life: 0.45, size: 1.8, grav: 0, spread: 0.5 };
      fall(tx, tz, { color: 0xff7a3a, size: 1.4, dur: 0.5, from: [4, 11, -3], trail });
      fall(tx, tz, { color: 0xffe0a0, size: 0.8, dur: 0.5, from: [4, 11, -3] });
    }
    G.delayed.push({ t: 0.5, fn: () => {
      emit(tx, 0.4, tz, { n: isRain ? 30 : 70, color: col, speed: isRain ? 5 : 10, up: 1, life: 0.7, size: 1.3, spread: sk.radius * (isRain ? 1.4 : 0.5), jitter: true });
      spawnRing(tx, tz, 0.5, sk.radius * 1.1, col, 0.45);
      if (!isRain) {
        pillar(tx, tz, sk.radius * 0.35, 5, 0xff7a2a, 0.55, { grow: 1.2 });
        shards(tx, tz, 0.8, sk.radius * 0.8, 9, 0xff8a4a, 0.8, { h: 1.1, stagger: 0.1 });
        scorch(tx, tz, sk.radius * 0.6, 3.5);
      }
      flash(tx, 1.5, tz, col, isRain ? 30 : 70, 0.4);
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
    shards(p.x, p.z, 1.5, sk.radius * 0.95, fire ? 24 : 18, fire ? 0xff7a3a : 0xbfeeff, 0.9, { h: fire ? 2.2 : 1.6, stagger: 0.25 });
    pillar(p.x, p.z, 1.2, fire ? 8 : 4, c, 0.7, { grow: fire ? 1.5 : 0.8 });
    if (fire) scorch(p.x, p.z, sk.radius * 0.5, 3.5);
    flash(p.x, 1.5, p.z, c, fire ? 80 : 45, 0.45);
    monstersIn(p.x, p.z, sk.radius).forEach((m) => hitMonster(m, mult, id, { slow: !fire, kb: 0.6 }));
    shake(0.5); Sfx.noise(0.5, 0.1, fire ? 700 : 2600);
    if (fire) hitStop(CONFIG.feel.hitStop);
    return true;
  },
  multishot(ctx) {
    const { p, sk, id, dx, dz, mult } = ctx;
    p.attackAnim = 0.001;
    castGlow(p, dx, dz, 0xd8ffe0, 8);
    shove(p, -dx, -dz, 0.25, 0.12);
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
    castGlow(p, dx, dz, 0x8affb0, 16);
    shove(p, -dx, -dz, 0.55, 0.16);
    spawnRing(p.x + dx, p.z + dz, 0.3, 1.6, 0x8affb0, 0.25);
    flash(p.x + dx, 1.3, p.z + dz, 0x8affb0, 25, 0.2);
    spawnProjectile({ from: 'p', x: p.x, z: p.z, dx, dz, speed: 34, range: sk.range, mult, skill: id, color: 0x8affb0, size: 0.45, pierce: true, big: true, spiral: 0xd8ffe0 });
    Sfx.tone(900, 0.12, 'sawtooth', 0.03, 0.5);
    return true;
  },
  heal(ctx) {
    const { p } = ctx;
    const a = G.st.maxHp * 0.2 * (1 + G.st.healPct / 100) + G.ch.stats.ene / 5;
    G.hp = Math.min(G.st.maxHp, G.hp + a);
    floatText(p.x, 2.6, p.z, '+' + fmt(a), 'heal');
    emit(p.x, 0.3, p.z, { n: 40, color: 0x8aff9a, speed: 1.5, up: 4, life: 1, size: 1, grav: 2, spread: 1.4 });
    pillar(p.x, p.z, 0.9, 4, 0x8aff9a, 0.8);
    spawnRing(p.x, p.z, 0.3, 2.2, 0x8aff9a, 0.5);
    flash(p.x, 1.5, p.z, 0x8aff9a, 30, 0.4);
    p.castAnim = 0.001;
    Sfx.tone(660, 0.4, 'sine', 0.05, 1.5);
    return true;
  },
  summon(ctx) {
    const { p, sk, dx, dz } = ctx;
    const sx = p.x + dx * 1.5, sz = p.z + dz * 1.5;
    spawnAlly('spirit', sx, sz, sk.dur);
    p.castAnim = 0.001;
    emit(sx, 0.5, sz, { n: 50, color: 0x8affb0, speed: 3, up: 2, life: 0.8, size: 1.2 });
    pillar(sx, sz, 1, 6, 0x8affb0, 0.9, { grow: 0.6 });
    spawnRing(sx, sz, 0.3, 2.4, 0x8affb0, 0.6);
    flash(sx, 1.5, sz, 0x8affb0, 40, 0.5);
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
  // Toda habilidade mira o monstro mais próximo; só o Teleporte obedece ao cursor.
  if (sk.kind !== 'blink' || tx == null) { const a = autoTargetPoint(sk.range || sk.radius || 14, tx, tz); tx = a.x; tz = a.z; }
  // limita ao alcance
  let dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 0.001;
  if (sk.range && d > sk.range) { tx = p.x + (dx / d) * sk.range; tz = p.z + (dz / d) * sk.range; d = sk.range; }
  dx /= d; dz /= d;
  G.mp -= cost.mp; G.ag -= cost.ag;
  G.cds[id] = G.time + sk.cd * (1 + st.cdPct / 100);
  p.lockUntil = G.time + Math.min(0.35, sk.cd * 0.7);
  // vira para o alvo: boa parte do giro na hora e o resto suave (turn em updatePlayer)
  face(p, tx, tz);
  let dr = p.rotTarget - p.rot;
  while (dr > Math.PI) dr -= Math.PI * 2;
  while (dr < -Math.PI) dr += Math.PI * 2;
  p.rot += dr * 0.6;
  p.castFace = p.rotTarget;
  p.castMove = HEAVY[sk.kind] ? 0 : CONFIG.player.castMove;
  if (HEAVY[sk.kind]) p.path = null;
  const ctx = { p, sk, id, tx, tz, dx, dz, d, mult: sk.mult, col: CLASS_COLOR[ch.cls], cost };
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
