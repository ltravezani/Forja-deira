// ---------- combate ----------
import { flashModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G, persist } from '../core/state.js';
import { fmt, R, rand } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit, spawnRing } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { shake, world } from '../engine/renderer.js';
import { hitStop } from './feel.js';
import { autoEquipOn } from './inventory.js';
import { dropLoot } from './loot.js';
import { aggroPack, QUERY_PAD, queryMonsters } from './monsters.js';
import { face } from './movement.js';
import { makePortal } from './npcs.js';
import { cancelChannel, fillVitals, recalc } from './player.js';
import { spawnProjectile } from './projectiles.js';
import { enterDungeon, enterTown, inSafe } from './zones.js';
import { hurtFeedback } from '../ui/feedback.js';
import { buildSlots } from '../ui/hud.js';
import { log, toast } from '../ui/log.js';
import { showDeath } from '../ui/npcDialogs.js';
import { floorLevel } from '../world/biomes.js';
import { walkableR } from '../world/grid.js';

/** Alcance do ataque básico por classe (m), somado ao raio do alvo. */
const RANGE = { dk: 2.3, dw: 13, elf: 15 };
export function attackRange(m) { return RANGE[G.ch.cls] + (m ? m.radius : 0); }

/** Aplica um golpe do jogador (ou aliado) a um monstro. opts: {slow, kb, fromX, fromZ}. Devolve o dano. */
export function hitMonster(m, mult, skillId, opts) {
  if (!m || m.dead) return 0;
  opts = opts || {};
  const r = R.rollDamage(G.st, rand, mult, skillId, m.def);
  if (!Number.isFinite(r.dmg)) return 0;
  m.hp -= r.dmg;
  if (r.type !== 'normal') hitStop(CONFIG.feel.hitStop * 0.5);
  m.hitFlash = 0.12;
  m.lastHit = G.time;
  aggroPack(m);
  const h = m.model.height;
  floatText(m.x, h + 0.3, m.z, fmt(r.dmg), r.type === 'exc' ? 'exc' : r.type === 'crit' ? 'crit' : '');
  if (G.st.lifeSteal) G.hp = Math.min(G.st.maxHp, G.hp + r.dmg * G.st.lifeSteal / 100);
  if (opts.slow) m.slowUntil = G.time + 2.5;
  if (opts.kb) {
    const dx = m.x - (opts.fromX != null ? opts.fromX : G.player.x), dz = m.z - (opts.fromZ != null ? opts.fromZ : G.player.z), d = Math.hypot(dx, dz) || 1;
    if (!m.boss) { const nx = m.x + (dx / d) * opts.kb, nz = m.z + (dz / d) * opts.kb; if (walkableR(G.L, nx, nz, 0.4)) { m.x = nx; m.z = nz; } }
  }
  emit(m.x, h * 0.55, m.z, { n: r.type === 'normal' ? 5 : 12, color: r.type === 'exc' ? 0x4be07a : 0xffe0a0, speed: 5, life: 0.35, size: 0.7, grav: -10 });
  Sfx.hit();
  if (m.hp <= 0) killMonster(m);
  return r.dmg;
}
const areaNear = [];
/** Monstros vivos cujo corpo toca o círculo (x, z, r). Devolve um array novo (seguro para iterar e matar). */
export function monstersIn(x, z, r) {
  queryMonsters(x, z, r + QUERY_PAD, areaNear);
  return areaNear.filter((m) => !m.dead && (m.x - x) ** 2 + (m.z - z) ** 2 <= (r + m.radius) ** 2);
}
/** Dano recebido pelo jogador: esquiva, defesa, absorção, reflexão e roubo de vida do atacante. */
export function hurtPlayer(raw, src) {
  const p = G.player;
  if (!p.alive || inSafe() || !Number.isFinite(raw)) return;
  if (rand() < CONFIG.player.missChance) { floatText(p.x, 2.4, p.z, 'MISS', 'info'); return; }
  let d = raw * (0.85 + rand() * 0.3);
  d = Math.max(raw * 0.1, d - G.st.def * 0.5);
  d *= 1 - G.st.dmgRed / 100;
  d = Math.max(1, Math.round(d));
  G.hp -= d;
  G.lastHurt = G.time;
  flashModel(p.model, 0xff2a1a, 0.6);
  p.hurtFlash = 0.1;
  floatText(p.x, 2.6, p.z, '-' + fmt(d), 'hurt');
  hurtFeedback(d / G.st.maxHp);
  Sfx.hurt();
  if (src && !src.dead) {
    if (G.st.reflect) { src.hp -= d * G.st.reflect / 100; if (src.hp <= 0) killMonster(src); }
    if (src.affix && src.affix.leech) src.hp = Math.min(src.maxHp, src.hp + d * src.affix.leech);
  }
  if (cancelChannel()) log('Portal interrompido.', 'warn');
  if (G.hp <= 0) die();
}
function die() {
  const p = G.player;
  p.alive = false;
  G.hp = 0;
  p.diedAt = G.time;
  p.model.root.rotation.x = -Math.PI / 2; p.model.root.position.y = 0.4;
  const ch = G.ch;
  const loss = Math.floor(R.expToNext(ch.level) * 0.02);
  ch.exp = Math.max(0, ch.exp - loss);
  const zl = Math.floor(ch.zen * 0.03);
  ch.zen -= zl;
  persist();
  showDeath(loss, zl);
}
export function respawn() {
  const p = G.player;
  p.alive = true;
  p.target = null; p.path = null; p.dash = null;
  p.model.root.rotation.x = 0;
  p.model.root.position.y = 0;
  G.buffs = []; recalc();
  enterTown();
}

export function killMonster(m) {
  if (m.dead) return;
  m.dead = true; m.deadT = 0; m.hp = 0;
  const src = m.boss ? 'boss' : m.elite ? 'elite' : 'normal';
  grantKillRewards(m);
  if (m.elite || m.boss) hitStop(CONFIG.feel.hitStop);
  emit(m.x, 1, m.z, { n: m.boss ? 80 : 18, color: m.boss ? 0xffa040 : 0xc8b8ff, speed: m.boss ? 9 : 5, life: 0.7, size: 1, grav: -4 });
  if (m.affix && m.affix.explode) scheduleExplosion(m);
  dropMonsterLoot(m, src);
  if (m.boss) onBossKilled(m);
}
function grantKillRewards(m) {
  const ch = G.ch;
  const exp = R.monsterExp(m.level, ch.level) * (m.boss ? 8 : m.elite ? 2.5 : 1);
  const before = ch.level;
  if (R.gainExp(ch, Math.floor(exp))) onLevelUp(before);
  if (G.st.lifeKill) G.hp = Math.min(G.st.maxHp, G.hp + G.st.maxHp / 8);
  if (G.st.manaKill) G.mp = Math.min(G.st.maxMp, G.mp + G.st.maxMp / 8);
}
/** Afixo Explosivo: círculo de aviso e explosão atrasada no local da morte. */
function scheduleExplosion(m) {
  const x = m.x, z = m.z, dmg = m.dmg * 1.6;
  spawnRing(x, z, 0.3, 3.2, 0xff4a1a, 0.8, { hold: true, op: 0.7 });
  G.delayed.push({ t: 0.8, fn: () => {
    emit(x, 0.6, z, { n: 50, color: 0xff6a1a, speed: 10, life: 0.6, size: 1.4 });
    Sfx.boom();
    if ((G.player.x - x) ** 2 + (G.player.z - z) ** 2 < 10) hurtPlayer(dmg, null);
  } });
}
/** Loot determinístico: a seed do drop deriva da seed do andar, do id do monstro e do contador de abates. */
function dropMonsterLoot(m, src) {
  const ch = G.ch;
  const seed = R.hash32(G.L.seed, m.id, G.killCount++);
  const drop = R.rollDrop({ seed, mLevel: m.level, src, mf: G.st.mf, favorCls: ch.cls });
  const zen = drop.zen ? Math.floor(drop.zen * (1 + G.st.zenPct / 100)) : 0;
  if (zen) dropLoot(m.x, m.z, { type: 'zen', amount: zen });
  for (const it of drop.items) {
    dropLoot(m.x, m.z, { type: 'item', item: it });
    const ord = R.RARITY[it.rarity].order;
    G.dropLog.unshift({ name: R.itemName(it), rarity: it.rarity, seed: it.seed, roll: it.rolls[0] ? it.rolls[0].roll : null, table: it.rolls[0] ? it.rolls[0].table : null, src, mf: G.st.mf, at: Date.now() });
    if (ord >= 2) { log('Drop ' + R.RARITY[it.rarity].name + ': ' + R.itemName(it) + ' (seed ' + it.seed + ')', 'loot'); Sfx.loot(ord); }
  }
  if (G.dropLog.length > 40) G.dropLog.length = 40;
  for (const j of drop.jewels) dropLoot(m.x, m.z, { type: 'jewel', id: j });
  for (const pt of drop.potions) dropLoot(m.x, m.z, { type: 'potion', id: pt });
}
/** Guardião do andar: libera o próximo andar e abre o portal de descida. */
function onBossKilled(m) {
  const ch = G.ch;
  ch.bossKills++;
  G.boss = null;
  shake(1.2);
  Sfx.boom();
  if (G.zone !== 'dungeon') { toast('Chefe derrotado', m.name); persist(); return; }
  const key = G.biome;
  ch.unlockedFloors[key] = Math.max(ch.unlockedFloors[key] || 1, G.floor + 1);
  toast('Guardião derrotado', m.T.name + ' · andar ' + (G.floor + 1) + ' liberado');
  G.exitPortal = makePortal(m.x, m.z, 0xff9a40, 'Descer ao andar ' + (G.floor + 1), () => enterDungeon(G.biome, G.floor + 1));
  const ev = R.canEvolve(ch);
  if (ev.ok) log('Mestre Orvan sente seu poder: evolução para ' + ev.name + ' disponível na cidade.', 'sys');
  persist();
}

export function onLevelUp(before) {
  const ch = G.ch;
  recalc();
  fillVitals();
  const p = G.player;
  emit(p.x, 0.2, p.z, { n: 60, color: 0xffd76a, speed: 3, up: 3, life: 1.2, size: 1.1, grav: 2, spread: 1.2 });
  spawnRing(p.x, p.z, 0.5, 4, 0xffd76a, 0.8);
  floatText(p.x, 3.4, p.z, 'Nível ' + ch.level, 'big');
  Sfx.level();
  log('Nível ' + before + ' → ' + ch.level + '. +' + (ch.level - before) * R.CLASSES[ch.cls].ppl + ' pontos de atributo.', 'sys');
  unlockSkills();
  if (autoEquipOn()) G.autoEqT = 0.3;
  if (ch.level >= R.RATES.resetLevel && before < R.RATES.resetLevel) log('Nível 400! Reset disponível com o Mestre Orvan.', 'sys');
  buildSlots();
}
/** Novas habilidades liberadas vão direto para a barra (se houver espaço). */
export function unlockSkills() {
  const ch = G.ch;
  R.skillsFor(ch.cls).forEach((id) => {
    const sk = R.SKILLS[id];
    if (sk.lvl <= ch.level && sk.tier <= ch.tier && ch.skillBar.indexOf(id) < 0 && ch.skillBar.length < 6) {
      ch.skillBar.push(id);
      log('Nova habilidade: ' + sk.name + ' (tecla ' + ch.skillBar.length + ').', 'sys');
    }
  });
}

// ---------- ataque básico ----------
export function basicAttack(m) {
  const p = G.player, cls = G.ch.cls;
  p.atkCd = G.st.attackInterval;
  p.attackAnim = 0.001;
  face(p, m.x, m.z);
  if (cls === 'dk') {
    // golpe em arco: acerta o alvo e quem estiver no cone de ±0,9 rad à frente
    const ang = Math.atan2(m.x - p.x, m.z - p.z);
    for (const o of monstersIn(p.x, p.z, 2.6)) {
      let da = Math.atan2(o.x - p.x, o.z - p.z) - ang;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (o === m || Math.abs(da) < 0.9) hitMonster(o, o === m ? 1 : 0.6, null);
    }
    for (let i = -3; i <= 3; i++) { const a = ang + i * 0.25; emit(p.x + Math.sin(a) * 1.8, 1.1, p.z + Math.cos(a) * 1.8, { n: 1, color: 0xfff0d0, speed: 1, life: 0.2, size: 0.9 }); }
    Sfx.swing();
  } else if (cls === 'dw') {
    const d = Math.hypot(m.x - p.x, m.z - p.z) || 1;
    spawnProjectile({ from: 'p', x: p.x, z: p.z, dx: (m.x - p.x) / d, dz: (m.z - p.z) / d, speed: 22, range: 16, mult: 0.85, color: 0xa8c8ff, size: 0.35 });
    Sfx.zap();
  } else {
    const d = Math.hypot(m.x - p.x, m.z - p.z) || 1;
    spawnProjectile({ from: 'p', arrow: true, x: p.x, z: p.z, dx: (m.x - p.x) / d, dz: (m.z - p.z) / d, speed: 32, range: 18, mult: 1, color: 0xe8e0cc });
    Sfx.tone(1100, 0.06, 'triangle', 0.02, 0.6);
  }
}
export function breakBarrel(b) {
  if (b.broken) return;
  b.broken = true;
  world.remove(b.mesh);
  emit(b.x, 0.6, b.z, { n: 24, color: b.color, speed: 5, up: 1.2, life: 0.6, size: 0.9, grav: -12 });
  Sfx.noise(0.2, 0.08, 800);
  const lvl = floorLevel(G.biome, G.floor);
  if (rand() < 0.5) dropLoot(b.x, b.z, { type: 'zen', amount: Math.floor(lvl * (8 + rand() * 12) + 10) });
  if (rand() < 0.15) dropLoot(b.x, b.z, { type: 'potion', id: rand() < 0.6 ? 'hp' : 'mp' });
  if (rand() < 0.06) dropLoot(b.x, b.z, { type: 'item', item: R.makeEquip(R.hash32(G.L.seed, 'barrel', b.x, b.z), lvl, null, G.ch.cls, G.st.mf, 'normal') });
}
