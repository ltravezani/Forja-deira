// =============================================================================
// Vida em Aldrena: moradores que passeiam entre a fonte, as barracas, o poço e
// as portas das casas, um guarda de ronda, crianças correndo e bichos (cachorro
// que segue o herói, gatos, galinhas no cercado, pombos que voam quando alguém
// chega perto e um cavalo na carroça). Só visual: ninguém bloqueia o caminho.
// =============================================================================
import { animateModel, buildModel } from '../art/models.js';
import { animateCritter, buildCritter, buildVillager, mergeModelParts } from '../art/townfolk.js';
import { disposeObject } from '../art/materials.js';
import { G } from '../core/state.js';
import { TILE } from '../core/util.js';
import { overlay, toScreen } from '../engine/overlay.js';
import { world } from '../engine/renderer.js';
import { findPath, walkable } from '../world/grid.js';
import { inView } from './world.js';

/** Moradores: aparência e falas quando o herói passa perto. */
const FOLK = [
  { look: { skin: 0xe8b890, cloth: 0x8a3a2a, cloth2: 0x5a3a2a, hair: 0x6a3a1a, hairStyle: 'bun', dress: true, apron: true, carry: 'basket' }, says: ['Maçãs fresquinhas da horta!', 'Bom dia, aventureiro!', 'A Lira vende poções boas, viu?'] },
  { look: { skin: 0xc08a60, cloth: 0x4a6a3a, cloth2: 0x5a4a32, hair: 0x2a1a10, hat: 'straw', beard: true }, says: ['Os repolhos estão enormes este ano.', 'Cuidado lá embaixo, nas masmorras.', 'Ouvi uivos vindos da floresta...'] },
  { look: { skin: 0xf0c8a0, cloth: 0x3a5a8a, cloth2: 0x2a2a3a, hair: 0xd8b060, hairStyle: 'long', dress: true }, says: ['Que noite bonita, não?', 'Dizem que a Torre não tem fim.', 'Viu meu gato por aí?'] },
  { look: { skin: 0xd0a070, cloth: 0x7a6a4a, cloth2: 0x3a3a3a, hairStyle: 'bald', beard: true, hair: 0x8a8a8a, carry: 'sack' }, says: ['Ufa, esse saco pesa!', 'Trigo para o moleiro.', 'Abram caminho!'] },
  { look: { skin: 0xe0b890, cloth: 0x6a2a4a, cloth2: 0x8a6a3a, hat: 'scarf', dress: true, carry: 'bucket' }, says: ['A água da fonte é a mais fresca.', 'O poço anda baixo...', 'Boa caçada, herói.'] },
  { look: { skin: 0xf0c8a0, cloth: 0xc8a040, cloth2: 0x4a3a2a, hair: 0x8a4a1a, hat: 'cap', scale: 0.62, child: true }, child: true, says: ['Olha! Um herói de verdade!', 'Pega eu se for capaz!', 'Um dia vou subir a Torre!'] },
  { look: { skin: 0xd8a878, cloth: 0xb03a3a, cloth2: 0xe8e0cc, hair: 0x3a2a1a, hairStyle: 'long', dress: true, scale: 0.6, child: true }, child: true, says: ['Hihi!', 'O cachorro é seu?', 'Minha mãe mandou eu voltar cedo.'] },
  { look: { skin: 0xd8b890, cloth: 0x5a5a6a, cloth2: 0x4a4a58, hat: 'hood', beard: true, hair: 0xd8d8d8, carry: 'lantern', dress: true }, says: ['Que a luz te guie.', 'Eu era jovem quando ergueram a fonte.', 'Aldrena já viu dias piores.'] },
  { look: { skin: 0xb07a50, cloth: 0x5a3a2a, cloth2: 0x3a2a20, hair: 0x1a1210, apron: true, beard: true }, says: ['O mestre Hanzo não dorme nunca.', 'Carvão para a forja!', 'Essa lâmina aí precisa de um reparo.'] },
  { look: { skin: 0xf0c8a0, cloth: 0x4a7a6a, cloth2: 0x3a3a2a, hair: 0xa04a2a, hairStyle: 'bun', dress: true, carry: 'basket' }, says: ['Pão quentinho!', 'Já foi à arena da Kora?', 'Boa noite!'] },
];
const GUARD = { look: { skin: 0xd0a080, cloth: 0x2a4a7a, armor: 0x6a6e7a, trim: 0xb0903a, head: 'helm', weapon: 'sword', shield: true, shieldColor: 0x2a4a7a, scale: 1.0 }, says: ['Ronda da noite. Tudo em ordem.', 'Circulando, circulando.', 'Nenhum monstro passa da paliçada.'] };

let LIFE = null;
const T = TILE;
const angTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);

function place(o) { o.m.root.position.set(o.x, o.y || 0, o.z); o.m.root.rotation.y = o.ry; }
function add(o) { world.add(o.m.root); place(o); return o; }

export function spawnTownLife(L) {
  clearTownLife();
  if (!L.spots || !L.spots.length) return;
  LIFE = { L, folk: [], critters: [], bubbles: [] };
  const spots = L.spots;
  // moradores começam espalhados pelos pontos de interesse
  FOLK.forEach((f, i) => {
    const s = spots[(i * 7) % spots.length];
    const m = buildVillager(f.look);
    m.root.traverse((c) => { c.castShadow = false; }); // a sombra de contato basta (e poupa o passe de sombras)
    LIFE.folk.push(add({ m, def: f, x: s.x * T + rnd(-0.5, 0.5), z: s.z * T + rnd(-0.5, 0.5), ry: rnd(0, 6), speed: f.child ? 3.4 : rnd(1.5, 2.1), state: 'idle', wait: rnd(0.5, 4), path: null, spot: s, phase: rnd(0, 6), greet: 0 }));
  });
  // guarda de ronda: circuito fixo em volta da praça até o portal e a torre
  const route = [[L.town.cx - 6, L.town.cz], [L.town.cx - 1, L.town.cz - 8], [L.town.cx + 7, L.town.cz - 1], [L.town.cx + 5, L.town.cz + 5], [L.town.cx - 2, L.town.cz + 8]];
  const g = buildModel('humanoid', GUARD.look);
  mergeModelParts(g.root);
  LIFE.folk.push(add({ m: g, def: GUARD, guard: true, route, ri: 0, x: route[0][0] * T, z: route[0][1] * T, ry: 0, speed: 1.7, state: 'idle', wait: 1, path: null, phase: 0, greet: 0 }));
  // bichos
  const cx = L.town.cx * T, cz = L.town.cz * T;
  const crit = (type, look, x, z, extra) => { const m = buildCritter(Object.assign({ type }, look)); m.root.traverse((o) => { o.castShadow = false; }); return LIFE.critters.push(add(Object.assign({ m, type, x, z, ry: rnd(0, 6), state: 'idle', wait: rnd(0.5, 3), phase: rnd(0, 6), tx: x, tz: z }, extra))); };
  crit('dog', { fur: 0x9a6a3a, fur2: 0xe8dcc0, ear: 0x6a4424 }, cx + 5, cz + 7, { home: { x: cx, z: cz, r: 12 }, speed: 3.2 });
  crit('dog', { fur: 0x3a3a40, fur2: 0xd8d0c0, ear: 0x2a2a30, collar: 0x2a6ab0, scale: 0.8 }, cx - 18, cz - 6, { home: { x: cx - 16, z: cz - 8, r: 7 }, speed: 3.6 });
  crit('cat', { fur: 0xd8883a, fur2: 0xf0e0c8 }, cx - 20, cz - 16, { home: { x: cx - 18, z: cz - 14, r: 6 }, speed: 1.4 });
  crit('cat', { fur: 0x3a3a40, fur2: 0xe8e0d8 }, cx + 12, cz - 14, { home: { x: cx + 14, z: cz - 12, r: 5 }, speed: 1.4 });
  if (L.pen) {
    const p = L.pen, box = { x0: (p.x0 + 0.7) * T, x1: (p.x1 - 0.7) * T, z0: (p.z0 + 0.7) * T, z1: (p.z1 - 0.7) * T };
    const hens = [[0xf0e8d8, 0xd8ccb8], [0xa0582a, 0x7a3a1a], [0xf0e8d8, 0xd8ccb8], [0x3a3030, 0x2a2020]];
    hens.forEach(([a, b]) => crit('chicken', { fur: a, fur2: b }, rnd(box.x0, box.x1), rnd(box.z0, box.z1), { box, speed: 1.6 }));
  }
  for (let i = 0; i < 6; i++) { const a = rnd(0, Math.PI * 2), r = rnd(4.5, 9); crit('pigeon', i % 3 ? {} : { fur: 0xb8bcc8, fur2: 0x8a8e9a }, cx + Math.cos(a) * r, cz + Math.sin(a) * r, { ring: { x: cx, z: cz, r0: 4.2, r1: 10 }, speed: 1.2 }); }
  const cart = L.props.find((p) => p.kind === 'cart');
  if (cart) { // cavalo atrelado à carroça (a carroça gira 0.5 rad; os varais apontam para +x local)
    const a = 0.5, dx = Math.cos(a), dz = -Math.sin(a);
    crit('horse', { fur: 0x7a4a2a, fur2: 0x2a1a12 }, cart.x * T + dx * 3.7, cart.z * T + dz * 3.7, { ry: Math.atan2(dx, dz), tied: true });
  }
}

export function clearTownLife() {
  if (!LIFE) return;
  for (const o of LIFE.folk.concat(LIFE.critters)) { world.remove(o.m.root); disposeObject(o.m.root, true); if (o.bubble) o.bubble.el.remove(); }
  LIFE = null;
}

/** Balão de fala sobre a cabeça por alguns segundos. */
function say(o, text) {
  if (!o.bubble) { const el = document.createElement('div'); el.className = 'bubble'; overlay.appendChild(el); o.bubble = { el, t: 0 }; }
  o.bubble.el.textContent = text;
  o.bubble.el.style.opacity = '1';
  o.bubble.el.style.display = '';
  o.bubble.t = 3.6;
}
function updateBubble(o, dt) {
  const b = o.bubble;
  if (!b || b.t <= 0) return;
  b.t -= dt;
  if (b.t <= 0) { b.el.style.display = 'none'; return; }
  if (b.t < 0.4) b.el.style.opacity = String(b.t / 0.4);
  const s = toScreen(o.x, o.m.height + 0.7, o.z);
  b.el.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%,-100%)';
  b.el.style.visibility = s.vis ? '' : 'hidden';
}

/** Anda em direção a (tx, tz); devolve true ao chegar. */
function stepTo(o, tx, tz, sp, dt) {
  const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const k = Math.min(1, (sp * dt) / d);
  o.x += dx * k; o.z += dz * k;
  o.ry += angTo(o.ry, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
  return d <= sp * dt;
}
function face(o, tx, tz, dt) { o.ry += angTo(o.ry, Math.atan2(tx - o.x, tz - o.z)) * Math.min(1, dt * 5); }

function updateFolk(o, dt, p) {
  const L = LIFE.L;
  const pd = p ? Math.hypot(p.x - o.x, p.z - o.z) : 99;
  o.greet -= dt;
  if (pd < 3.2 && o.greet <= 0 && Math.random() < dt * 2) { say(o, o.def.says[Math.floor(Math.random() * o.def.says.length)]); o.greet = rnd(14, 24); }
  let moving = false;
  if (o.state === 'walk') {
    if (pd < 1.5) { o.state = 'yield'; o.wait = 1.2; }
    else {
      const n = o.path[0];
      moving = true;
      if (stepTo(o, n.x, n.z, o.speed, dt)) { o.path.shift(); if (!o.path.length) { o.state = 'idle'; o.wait = o.guard ? rnd(2, 4) : o.def.child ? rnd(0.5, 2) : rnd(3, 9); } }
    }
  } else if (o.state === 'yield') { // deixa o herói passar e olha para ele
    face(o, p.x, p.z, dt);
    o.wait -= dt;
    if (o.wait <= 0 && pd > 1.8) o.state = 'walk';
  } else {
    if (o.spot && o.spot.look) face(o, o.spot.look[0] * T, o.spot.look[1] * T, dt);
    else if (pd < 4) face(o, p.x, p.z, dt);
    o.wait -= dt;
    if (o.wait <= 0) {
      let tx, tz;
      if (o.guard) { o.ri = (o.ri + 1) % o.route.length; [tx, tz] = o.route[o.ri]; o.spot = null; }
      else { const s = LIFE.L.spots[Math.floor(Math.random() * LIFE.L.spots.length)]; o.spot = s; tx = s.x; tz = s.z; }
      const path = findPath(L, o.x, o.z, tx * T + rnd(-0.4, 0.4), tz * T + rnd(-0.4, 0.4), 4000);
      if (path && path.length) { o.path = path; o.state = 'walk'; } else o.wait = rnd(1, 3);
    }
  }
  // não se sobrepõe aos outros moradores
  for (const q of LIFE.folk) {
    if (q === o) continue;
    const dx = o.x - q.x, dz = o.z - q.z, d2 = dx * dx + dz * dz;
    if (d2 < 0.8 && d2 > 1e-4) { const d = Math.sqrt(d2), push = (0.9 - d) * dt * 2; const nx = o.x + (dx / d) * push, nz = o.z + (dz / d) * push; if (walkable(L, nx, nz)) { o.x = nx; o.z = nz; } }
  }
  o.moving = moving;
}

function wanderTarget(o) {
  const L = LIFE.L;
  for (let i = 0; i < 8; i++) {
    let x, z;
    if (o.box) { x = rnd(o.box.x0, o.box.x1); z = rnd(o.box.z0, o.box.z1); }
    else if (o.ring) { const a = rnd(0, Math.PI * 2), r = rnd(o.ring.r0, o.ring.r1); x = o.ring.x + Math.cos(a) * r; z = o.ring.z + Math.sin(a) * r; }
    else { const a = rnd(0, Math.PI * 2), r = rnd(1, o.home.r); x = o.home.x + Math.cos(a) * r; z = o.home.z + Math.sin(a) * r; }
    if (walkable(L, x, z)) return [x, z];
  }
  return null;
}
function updateCritter(o, dt, p) {
  const L = LIFE.L;
  const pd = p ? Math.hypot(p.x - o.x, p.z - o.z) : 99;
  const s = { t: G.time + o.phase, moving: false, speed: o.type === 'dog' ? 12 : o.type === 'cat' ? 8 : 10 };
  if (o.type === 'horse') { // parado na carroça: pasta, abana o rabo, olha para quem chega
    o.graze = (o.graze || 0) + ((pd < 3 ? 0 : Math.sin(G.time * 0.25 + o.phase) > 0 ? 1 : 0) - (o.graze || 0)) * Math.min(1, dt * 1.5);
    s.graze = o.graze;
    return s;
  }
  const bird = o.type === 'pigeon' || o.type === 'chicken';
  // pombos: voam quando alguém chega perto e pousam em outro canto da praça
  if (o.type === 'pigeon') {
    if (o.state !== 'fly' && pd < 3.4) {
      const t = wanderTarget(o);
      if (t) { o.state = 'fly'; o.fx0 = o.x; o.fz0 = o.z; o.fx1 = t[0]; o.fz1 = t[1]; o.ft = 0; o.fd = 1.4 + Math.hypot(t[0] - o.x, t[1] - o.z) * 0.08; }
    }
    if (o.state === 'fly') {
      o.ft += dt / o.fd;
      const k = Math.min(1, o.ft);
      o.x = o.fx0 + (o.fx1 - o.fx0) * k; o.z = o.fz0 + (o.fz1 - o.fz0) * k;
      o.y = Math.sin(k * Math.PI) * (2.5 + o.fd);
      o.ry += angTo(o.ry, Math.atan2(o.fx1 - o.fx0, o.fz1 - o.fz0)) * Math.min(1, dt * 10);
      s.fly = 1 - Math.max(0, k - 0.85) * 5;
      if (k >= 1) { o.state = 'idle'; o.y = 0; o.wait = rnd(1, 4); }
      return s;
    }
  }
  // galinhas fogem batendo as asas; gatos fogem do herói
  const flee = (o.type === 'chicken' && pd < 2.6) || (o.type === 'cat' && pd < 2.2);
  if (flee && o.state !== 'flee') {
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
    let tx = o.x + (dx / d) * 3, tz = o.z + (dz / d) * 3;
    if (o.box) { tx = Math.max(o.box.x0, Math.min(o.box.x1, tx)); tz = Math.max(o.box.z0, Math.min(o.box.z1, tz)); }
    if (walkable(L, tx, tz)) { o.state = 'flee'; o.tx = tx; o.tz = tz; }
  }
  // cachorro: às vezes segue o herói por um tempo, abanando o rabo
  if (o.type === 'dog' && o.state !== 'follow' && pd < 7 && Math.random() < dt * 0.25) { o.state = 'follow'; o.wait = rnd(8, 16); }
  if (o.state === 'follow') {
    o.wait -= dt;
    s.wag = true;
    const hd = Math.hypot(o.x - o.home.x, o.z - o.home.z);
    if (o.wait <= 0 || pd > 12 || hd > o.home.r + 10 || G.zone !== 'town') { o.state = 'idle'; o.wait = rnd(2, 5); }
    else if (pd > 2.6) {
      const dx = p.x - o.x, dz = p.z - o.z, k = (pd - 2.2) / pd;
      const nx = o.x + dx * k, nz = o.z + dz * k;
      if (walkable(L, o.x + (dx / pd) * 0.5, o.z + (dz / pd) * 0.5)) { stepTo(o, nx, nz, o.speed * (pd > 5 ? 1.5 : 1), dt); s.moving = true; }
    } else { face(o, p.x, p.z, dt); s.sit = 1; }
    return s;
  }
  if (o.state === 'flee' || o.state === 'walk') {
    const sp = o.state === 'flee' ? o.speed * 2.2 : o.speed;
    // anda em linha reta: se o próximo passo cai num banco, cerca ou canteiro, para ali mesmo
    const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz) || 1;
    if (!walkable(L, o.x + (dx / d) * 0.45, o.z + (dz / d) * 0.45)) { o.tx = o.x; o.tz = o.z; }
    if (stepTo(o, o.tx, o.tz, sp, dt)) { o.state = 'idle'; o.wait = bird ? rnd(0.6, 2.5) : o.type === 'cat' ? rnd(4, 12) : rnd(2, 6); }
    s.moving = true;
    s.speed *= o.state === 'flee' ? 1.8 : 1;
    if (o.state === 'flee' && bird) s.flap = true;
    return s;
  }
  // parado: bicando (aves), sentado (gato/cachorro)
  o.wait -= dt;
  if (bird) { const pk = Math.sin((G.time + o.phase) * 5); s.peck = pk > 0.3 ? (pk - 0.3) * 1.4 : 0; }
  else { o.sit = Math.min(1, (o.sit || 0) + dt * 2); s.sit = o.type === 'cat' || o.wait > 2 ? o.sit : 0; }
  if (o.wait <= 0) {
    const t = wanderTarget(o);
    if (t) { o.state = 'walk'; o.tx = t[0]; o.tz = t[1]; o.sit = 0; if (bird && !o.box) { const dx = t[0] - o.x, dz = t[1] - o.z, d = Math.hypot(dx, dz); if (d > 1.5) { o.tx = o.x + (dx / d) * 1.5; o.tz = o.z + (dz / d) * 1.5; } } }
    else o.wait = 1;
  }
  return s;
}

/** Atualiza moradores e bichos; só anima (e desenha) quem está na tela. */
export function updateTownLife(dt) {
  if (!LIFE) return;
  const p = G.player;
  for (const o of LIFE.folk) {
    updateFolk(o, dt, p);
    const vis = inView(o.x, 1.2, o.z, 2.5);
    o.m.root.visible = vis;
    place(o);
    if (vis) animateModel(o.m, { t: G.time + o.phase, dt, moving: o.moving, speed: o.def.child ? 11 : 7, attack: 0 });
    updateBubble(o, dt);
  }
  for (const o of LIFE.critters) {
    const s = updateCritter(o, dt, p);
    const vis = inView(o.x, (o.y || 0) + 0.5, o.z, o.type === 'horse' ? 3 : 1.5);
    o.m.root.visible = vis;
    place(o);
    if (vis) animateCritter(o.m, s);
  }
}
/** Diagnóstico/testes: quantos moradores e bichos existem. */
export function townLifeCount() { return LIFE ? { folk: LIFE.folk.length, critters: LIFE.critters.length } : { folk: 0, critters: 0 }; }
