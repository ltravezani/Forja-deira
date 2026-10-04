// ---------- Torre Infinita: eventos do andar (emboscadas, invasão, círculo selado, santuário, Ladrão de Ouro) ----------
import { GEO } from '../art/geometry.js';
import { glowShared } from '../art/materials.js';
import { G } from '../core/state.js';
import { R, rand, TILE } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit, spawnRing } from '../engine/effects.js';
import { floatText } from '../engine/overlay.js';
import { shake, world } from '../engine/renderer.js';
import { dropLoot } from './loot.js';
import { riseMonster, spawnMonster } from './monsters.js';
import { recalc } from './player.js';
import { log, toast } from '../ui/log.js';
import { BIOMES } from '../world/biomes.js';
import { gy, lineClear, walkable } from '../world/grid.js';
import { kit, kitGlowMat, kitMat } from '../world/kit.js';

/** Estado dos eventos do andar atual (zerado a cada andar). */
const T = { ambush: [], seals: [], shrines: [], inv: null, thief: null, t: 0, total: 0, kills: 0, lvl: 1, pack: 3000 };

/** Cor mágica de cada bioma da torre (barreiras, fendas, fumaça). */
const TINT = { tw_granite: 0x6ad8ff, tw_arcane: 0xc89aff, tw_storm: 0x8afff0, tw_void: 0xff5ad0 };
const AMBUSH_SAY = {
  tw_granite: 'As estátuas ganham vida à sua volta!',
  tw_arcane: 'Os livros sussurram e criaturas saem das sombras!',
  tw_storm: 'Criaturas descem com o vento!',
  tw_void: 'O vazio se abre à sua volta!',
};
/** Bênçãos dos santuários da torre, 60 s. */
const BLESS = [
  { name: 'Bênção da Fúria', stats: { dmgPct: 15 }, say: '+15% de dano', color: 0xff8a5a },
  { name: 'Bênção da Égide', stats: { defPct: 30, dmgRed: 8 }, say: '+30% de defesa e -8% de dano recebido', color: 0x6ad8ff },
  { name: 'Bênção do Vento', stats: { atkRatePct: 10, cdPct: -10 }, say: '+10% de velocidade de ataque e -10% de recarga', color: 0x9aff8a },
];
/** Segundos até o Ladrão de Ouro sumir depois de notar o herói. */
const THIEF_ESCAPE = 18;

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const tint = () => TINT[G.biome] || 0x6ad8ff;
function nearWalkable(x, z, r) {
  if (walkable(G.L, x, z)) return { x, z };
  for (let k = 0; k < 16; k++) {
    const a = rand() * Math.PI * 2, d = rand() * r;
    if (walkable(G.L, x + Math.cos(a) * d, z + Math.sin(a) * d)) return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
  }
  return null;
}
/** Um bando do bioma (mesmo tamanho e níveis dos bandos comuns da torre). */
function spawnPack(size, at, opt) {
  const B = BIOMES[G.biome], pack = T.pack++, n = size * R.TOWER.monsterMult, kind = pick(B.monsters), out = [];
  for (let i = 0; i < n; i++) {
    const q = at(i, n);
    if (!q) continue;
    const m = spawnMonster(rand() < 0.7 ? kind : pick(B.monsters), q.x, q.z, T.lvl + Math.floor(rand() * 4), { pack, elite: !!opt.elite && i === 0 });
    if (opt.aggro) m.aggro = true;
    if (opt.puff) { emit(q.x, 0.5, q.z, { n: 14, color: tint(), speed: 3, up: 2, life: 0.6, size: 1 }); riseMonster(m); }
    out.push(m);
  }
  return out;
}
/** Prêmio de um evento vencido: um punhado de Ouro (com o mesmo multiplicador da torre). */
function goldReward(x, z, src, piles) {
  for (let i = 0; i < piles; i++) {
    const amount = Math.floor(R.goldAmount(T.lvl, src, rand()) * R.TOWER.goldMult * (1 + G.st.goldPct / 100) / piles);
    dropLoot(x, z, { type: 'gold', amount });
  }
  emit(x, 0.6, z, { n: 40, color: 0xffd86a, speed: 3, up: 4, life: 1, size: 0.9, grav: 3, spread: 0.6 });
  Sfx.loot(2);
}

/** Monta os eventos do andar (chamado depois dos bandos comuns). */
export function spawnTowerEvents(L, lvl) {
  clearTower();
  T.t = 0; T.kills = 0; T.lvl = lvl; T.pack = 3000;
  for (const e of L.events || []) {
    const x = e.x * TILE, z = e.z * TILE;
    if (e.type === 'ambush') T.ambush.push({ x, z, r: e.r * TILE, size: e.size, state: 0, mons: [] });
    else if (e.type === 'sealed') {
      const r = e.r * TILE;
      const mons = spawnPack(e.size, () => nearWalkable(x + (rand() - 0.5) * r, z + (rand() - 0.5) * r, 2) || { x, z }, { elite: true });
      for (const m of mons) m.sealed = true;
      T.seals.push({ x, z, r, state: 0, mons, tiles: null, mesh: null, t: 0 });
    } else if (e.type === 'invasion') T.inv = { state: 0, delay: e.delay, size: e.size, x: 0, z: 0, mons: [], waves: 0, waveT: 0, mesh: null, close: 0 };
    else if (e.type === 'shrine') spawnShrine(x, z, BLESS[e.kind % BLESS.length]);
    else if (e.type === 'thief') {
      const m = spawnMonster('tw_thief', x, z, lvl + 2, { pack: T.pack++ });
      T.thief = { m, seenT: -1, gone: false };
    }
  }
  T.total = G.monsters.filter((m) => !m.dead && !m.boss).length;
}

// ---------- emboscadas ----------
function triggerAmbush(a) {
  a.state = 1;
  const p = G.player;
  // surgem em volta do herói, só em pontos que ele enxerga (nada brota atrás de parede)
  a.mons = spawnPack(a.size, (i, n) => {
    for (let k = 0; k < 12; k++) {
      const ang = (i / n) * Math.PI * 2 + k * 0.55 + rand() * 0.3, d = (2.2 + rand() * 2.8 - k * 0.12) * TILE;
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      if (walkable(G.L, x, z) && lineClear(G.L, p.x, p.z, x, z, 0.3)) return { x, z };
    }
    return nearWalkable(p.x, p.z, TILE);
  }, { aggro: true, puff: true, elite: rand() < 0.5 });
  spawnRing(p.x, p.z, 1, 7 * TILE, tint(), 0.8);
  toast('Emboscada!', AMBUSH_SAY[G.biome] || 'Você foi cercado!');
  log('Emboscada! Derrote os atacantes para ganhar o Ouro que eles guardavam.', 'warn');
  shake(0.5); Sfx.boom();
}

// ---------- círculo selado ----------
/** Fecha o círculo: os tiles da borda viram parede até o bando de dentro cair. */
function seal(s) {
  s.state = 1; s.t = 0;
  const L = G.L, r = s.r, tiles = [];
  for (let tz = Math.floor((s.z - r) / TILE) - 2; tz <= Math.ceil((s.z + r) / TILE) + 2; tz++) for (let tx = Math.floor((s.x - r) / TILE) - 2; tx <= Math.ceil((s.x + r) / TILE) + 2; tx++) {
    if (tx < 0 || tz < 0 || tx >= L.W || tz >= L.H) continue;
    const d = Math.hypot(tx * TILE - s.x, tz * TILE - s.z);
    if (d >= r && d < r + TILE * 1.2 && L.grid[tz * L.W + tx] === 1) { L.grid[tz * L.W + tx] = 0; tiles.push(tz * L.W + tx); }
  }
  s.tiles = tiles;
  // quem do bando ficou do lado de fora é puxado para dentro
  for (const m of s.mons) {
    m.aggro = true;
    if (m.dead || Math.hypot(m.x - s.x, m.z - s.z) < r - 1) continue;
    const q = nearWalkable(s.x + (rand() - 0.5) * r, s.z + (rand() - 0.5) * r, 2) || { x: s.x, z: s.z };
    m.x = q.x; m.z = q.z; m.path = null;
    emit(q.x, 0.5, q.z, { n: 14, color: tint(), speed: 3, up: 2, life: 0.6, size: 1 });
  }
  const mat = new THREE.MeshBasicMaterial({ color: tint(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r + TILE * 0.5, r + TILE * 0.5, 2.6, 56, 1, true), mat);
  wall.position.set(s.x, 1.3, s.z);
  wall.renderOrder = 4;
  world.add(wall);
  s.mesh = wall;
  spawnRing(s.x, s.z, r * 0.3, r + TILE * 0.5, tint(), 0.7);
  toast('Círculo selado!', 'Uma barreira se fechou: derrote os guardiões do círculo');
  log('Círculo selado! A barreira só cai quando os guardiões de dentro forem derrotados.', 'warn');
  shake(0.4); Sfx.boom();
}
function unseal(s, won) {
  s.state = 2;
  const L = G.L;
  if (s.tiles) for (const i of s.tiles) L.grid[i] = 1;
  s.tiles = null;
  if (s.mesh) { world.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); s.mesh = null; }
  emit(s.x, 1, s.z, { n: 60, color: tint(), speed: 6, up: 2, life: 0.8, size: 1.1, spread: s.r });
  if (!won) return;
  goldReward(s.x, s.z, 'elite', 4);
  toast('Círculo quebrado', 'A barreira caiu e deixou um tesouro');
}

// ---------- invasão ----------
/** Abre a fenda num ponto andável a uma distância média do herói (fora de círculos selados). */
function openRift(v) {
  const p = G.player, L = G.L;
  let best = null;
  for (let k = 0; k < 160 && !best; k++) {
    const tx = 1 + Math.floor(rand() * (L.W - 2)), tz = 1 + Math.floor(rand() * (L.H - 2));
    if (L.grid[tz * L.W + tx] !== 1) continue;
    const x = tx * TILE, z = tz * TILE, d = Math.hypot(x - p.x, z - p.z);
    if (d < (k < 120 ? 16 : 10) || d > (k < 120 ? 30 : 60)) continue;
    if (T.seals.some((s) => s.state === 1 && Math.hypot(x - s.x, z - s.z) < s.r + TILE * 2)) continue;
    best = { x, z };
  }
  if (!best) return false;
  v.state = 1; v.x = best.x; v.z = best.z; v.waveT = 0.6;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(GEO.torusF, glowShared(tint(), 0.95));
  ring.scale.setScalar(3.4);
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), new THREE.MeshBasicMaterial({ color: 0x0a0414, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), glowShared(tint(), 0.35));
  halo.position.z = -0.02;
  g.add(halo, core, ring);
  g.position.set(v.x, 2, v.z);
  g.rotation.y = Math.PI / 4; // de frente para a câmera
  g.scale.setScalar(0.01);
  world.add(g);
  v.mesh = g; v.ring = ring;
  spawnRing(v.x, v.z, 0.5, 6, tint(), 1);
  toast('Invasão!', 'Uma fenda se abriu no andar e os monstros vêm atrás de você');
  log('Invasão! Uma fenda se abriu e monstros estão atravessando. Feche-a derrotando todos.', 'warn');
  Sfx.boom();
  return true;
}
function updateInvasion(v, dt) {
  if (v.state === 0) {
    const boss = G.boss && G.boss.aggro;
    if (!boss && G.player.alive && (T.t > v.delay || T.kills >= T.total * 0.4)) openRift(v);
    return;
  }
  const g = v.mesh;
  if (g) {
    const k = v.state === 2 ? Math.max(0, 1 - v.close * 2) : Math.min(1, g.scale.x + dt * 2);
    g.scale.setScalar(Math.max(0.01, k));
    v.ring.rotation.z += dt * 2.2;
    if (Math.random() < 0.5) emit(v.x + (rand() - 0.5) * 2, 1 + rand() * 2.4, v.z + (rand() - 0.5) * 2, { n: 1, color: tint(), speed: 0.6, up: 1, life: 0.9, size: 0.7, grav: -0.6 });
  }
  if (v.state === 1) {
    // três ondas, a cada 3,5 s, saindo da fenda
    if (v.waves < 3) {
      v.waveT -= dt;
      if (v.waveT <= 0) {
        v.waveT = 3.5; v.waves++;
        const part = Math.ceil(v.size / 3);
        v.mons.push(...spawnPack(part, () => nearWalkable(v.x + (rand() - 0.5) * 3, v.z + (rand() - 0.5) * 3, 3), { aggro: true, puff: true, elite: v.waves === 3 }));
        spawnRing(v.x, v.z, 0.5, 4, tint(), 0.6);
      }
    } else if (v.mons.every((m) => m.dead)) {
      v.state = 2; v.close = 0;
      goldReward(v.x, v.z, 'elite', 3);
      toast('Invasão repelida', 'A fenda se fechou');
      log('A fenda se fechou. A invasão foi repelida.', 'sys');
    }
  } else if (v.state === 2 && g) {
    v.close += dt;
    if (v.close > 0.6) { removeRift(g); v.mesh = null; }
  }
}

/** Remove a fenda (o anel usa material compartilhado; o miolo e o halo têm geometria própria). */
function removeRift(g) {
  world.remove(g);
  const [halo, core] = g.children;
  halo.geometry.dispose(); core.geometry.dispose(); core.material.dispose();
}

// ---------- santuários ----------
function spawnShrine(x, z, B) {
  const g = new THREE.Group();
  const k = kit('shrine');
  const m = new THREE.Mesh(k.geo, kitMat());
  m.castShadow = true; m.receiveShadow = true;
  const orb = new THREE.Mesh(k.glow, kitGlowMat());
  orb.renderOrder = 3;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glowShared(B.color, 0.5));
  halo.position.y = 2.1;
  g.add(m, orb, halo);
  g.position.set(x, gy(x, z), z);
  world.add(g);
  T.shrines.push({ x, z, used: false, g, halo, B });
}
function useShrine(s) {
  s.used = true;
  const B = s.B;
  G.buffs = G.buffs.filter((b) => b.id !== 'tower:shrine');
  G.buffs.push({ id: 'tower:shrine', name: B.name, until: G.time + 60, stats: B.stats });
  recalc();
  G.hp = G.st.maxHp; G.mp = G.st.maxMp;
  const p = G.player;
  emit(p.x, 0.4, p.z, { n: 70, color: B.color, speed: 3, up: 4, life: 1.2, size: 1, grav: 1.5, spread: 1.2 });
  spawnRing(s.x, s.z, 0.5, 4, B.color, 0.9);
  floatText(p.x, 3, p.z, B.name, 'heal');
  toast(B.name, B.say + ' por 60s · HP e mana cheios');
  log('Santuário da torre: ' + B.name + ' (' + B.say + ' por 60s).', 'sys');
  Sfx.level();
  s.halo.visible = false;
}

// ---------- Ladrão de Ouro ----------
function updateThief(th) {
  const m = th.m;
  if (th.gone || m.dead) return;
  if (Math.random() < 0.25) emit(m.x + (rand() - 0.5), 0.6 + rand(), m.z + (rand() - 0.5), { n: 1, color: 0xffd86a, speed: 0.5, up: 1, life: 0.7, size: 0.6, grav: 1 });
  if (m.aggro && th.seenT < 0) {
    th.seenT = T.t;
    toast('Ladrão de Ouro!', 'Pegue-o antes que ele escape com o tesouro');
    log('Um Ladrão de Ouro! Ele foge e some em ' + THIEF_ESCAPE + 's: derrote-o para pegar o que carrega.', 'loot');
  }
  if (th.seenT >= 0 && T.t - th.seenT > THIEF_ESCAPE) {
    th.gone = true;
    m.dead = true; m.deadT = 99; m.model.root.visible = false;
    emit(m.x, 1, m.z, { n: 40, color: 0xffd86a, speed: 5, up: 3, life: 0.7, size: 1 });
    spawnRing(m.x, m.z, 0.3, 3, 0xffd86a, 0.5);
    toast('Ele escapou…', 'O Ladrão de Ouro sumiu com o tesouro');
    log('O Ladrão de Ouro escapou.', 'sys');
  }
}

// ---------- mortes e quadro ----------
/** Qualquer abate na torre: conta para a invasão e paga o Ladrão de Ouro. */
export function onTowerKill(m) {
  if (!m.boss) T.kills++;
  if (T.thief && m === T.thief.m) {
    goldReward(m.x, m.z, 'boss', 6);
    toast('Ladrão de Ouro derrotado', 'O tesouro dele caiu no chão');
    log('Você pegou o Ladrão de Ouro! O Ouro que ele carregava se espalhou.', 'loot');
    Sfx.loot(4);
  }
  for (const a of T.ambush) if (a.state === 1 && a.mons.every((o) => o.dead)) {
    a.state = 2;
    goldReward(m.x, m.z, 'elite', 2);
    toast('Emboscada vencida', 'Os atacantes deixaram Ouro para trás');
  }
}
export function updateTower(dt) {
  const p = G.player, L = G.L;
  if (!p || !L || !L.tower) return;
  T.t += dt;
  for (const a of T.ambush) if (a.state === 0 && p.alive && (a.x - p.x) ** 2 + (a.z - p.z) ** 2 < a.r * a.r) triggerAmbush(a);
  for (const s of T.seals) {
    if (s.state === 0) {
      if (p.alive && Math.hypot(p.x - s.x, p.z - s.z) < s.r - TILE && s.mons.some((m) => !m.dead)) seal(s);
      else if (s.mons.every((m) => m.dead)) s.state = 2; // vencido sem fechar (de longe)
    } else if (s.state === 1) {
      s.t += dt;
      if (s.mesh) { s.mesh.material.opacity = Math.min(0.32, s.t * 0.8) * (0.8 + Math.sin(G.time * 4) * 0.2); s.mesh.rotation.y += dt * 0.4; }
      // trava de segurança: o herói caiu ou a luta se arrastou demais
      if (s.mons.every((m) => m.dead)) unseal(s, true);
      else if (!p.alive || s.t > 90) unseal(s, false);
    }
  }
  if (T.inv) updateInvasion(T.inv, dt);
  for (const s of T.shrines) {
    if (s.used) continue;
    s.halo.position.y = 2.1 + Math.sin(G.time * 2 + s.x) * 0.12;
    if (Math.random() < 0.3) emit(s.x + (rand() - 0.5), 2.1, s.z + (rand() - 0.5), { n: 1, color: s.B.color, speed: 0.4, up: 1.5, life: 1.2, size: 0.6, grav: -0.5 });
    if (p.alive && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 3.2 * 3.2) useShrine(s);
  }
  if (T.thief) updateThief(T.thief);
}
/** Saída do andar: remove barreiras, fenda e santuários. */
export function clearTower() {
  for (const s of T.seals) if (s.mesh) { world.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
  if (T.inv && T.inv.mesh) removeRift(T.inv.mesh);
  for (const s of T.shrines) { world.remove(s.g); s.halo.geometry.dispose(); }
  T.ambush = []; T.seals = []; T.shrines = []; T.inv = null; T.thief = null;
}
/** Estado dos eventos para testes e depuração. */
export function towerState() { return T; }
