// ---------- loot no chão ----------
import { GEO } from '../art/geometry.js';
import { buildItemModel, attachRefineFx } from '../art/items.js';
import { disposeObject, glowMat, glowShared } from '../art/materials.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { fmt, R, rand } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { overlay } from '../engine/overlay.js';
import { world } from '../engine/renderer.js';
import { addToBag, autoEquipOn, BAG_SIZE, classOk } from './inventory.js';
import { pathTo } from './movement.js';
import { questEvent } from './quests.js';
import { refreshPaneSoon } from '../ui/drawer.js';
import { glyph } from '../ui/icons.js';
import { log } from '../ui/log.js';
import { gy, walkable } from '../world/grid.js';

function lootLabel(l) {
  if (l.type === 'gold') return { text: fmt(l.amount) + ' de Ouro', color: '#f2cf7a' };
  if (l.type === 'jewel') return { text: R.JEWELS[l.id].name, color: R.JEWELS[l.id].color };
  if (l.type === 'potion') return { text: R.POTIONS[l.id].name, color: R.POTIONS[l.id].color || (l.id === 'hp' ? '#ff8a7a' : '#8ab8ff') };
  if (l.type === 'talisman') return { text: R.TALISMANS[l.id].name, color: R.TALISMANS[l.id].color };
  return { text: R.itemName(l.item), color: R.RARITY[l.item.rarity].color };
}
export function dropLoot(x, z, l) {
  const a = rand() * Math.PI * 2, r = 0.6 + rand() * 1.6;
  let tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
  if (!walkable(G.L, tx, tz)) { tx = x; tz = z; }
  l.x = tx; l.z = tz; l.born = G.time; l.fromX = x; l.fromZ = z;
  const info = lootLabel(l);
  const col = parseInt(info.color.slice(1), 16);
  const g = new THREE.Group();
  const gl = l.type === 'gold' ? null : glyph(l.type === 'item' ? l.item : { kind: l.type, id: l.id });
  const kind = gl ? gl.kind : 'gold';
  const mesh = buildItemModel(kind, { col: l.type === 'potion' ? parseInt(gl.c.slice(1), 16) : col, tier: l.type === 'item' ? l.item.tier : 0, amount: l.type === 'gold' ? Math.ceil(Math.log10(1 + (l.amount || 1))) : 0 });
  mesh.position.y = 0.12;
  mesh.scale.setScalar(kind === 'gold' ? 1.5 : 1.6);
  g.add(mesh);
  const ord = l.type === 'item' ? R.RARITY[l.item.rarity].order : l.type === 'jewel' || l.type === 'talisman' ? 3 : 0;
  // mancha de luz da raridade no chão: acha o item de longe sem poluir o cenário
  if (ord >= 1 || l.type === 'jewel' || l.type === 'talisman') {
    const pool = new THREE.Mesh(GEO.disc, glowShared(col, ord >= 2 ? 0.16 : 0.1));
    pool.position.y = 0.05; pool.scale.setScalar(0.45 + ord * 0.05); pool.renderOrder = 1;
    g.add(pool);
  }
  if (l.type === 'item') l.refine = attachRefineFx(mesh.children[0], l.item.plus || 0, { size: 0.12 });
  if (ord >= 1) {
    const beam = new THREE.Mesh(GEO.beam, glowMat(col, ord >= 2 ? 0.55 : 0.3));
    if (ord >= 3) beam.material.color.multiplyScalar(1 + (ord - 2) * 0.5); // Ancestral e Lendário acendem no bloom
    const h = ord >= 2 ? 4 + ord : 1.6;
    beam.scale.set(1, h, 1); beam.position.y = h / 2;
    g.add(beam);
    l.beam = beam;
  }
  g.position.set(x, gy(x, z), z);
  world.add(g);
  l.mesh = g; l.item3d = mesh; l.ord = ord;
  const el = document.createElement('div');
  el.className = 'label';
  el.style.color = info.color;
  el.textContent = info.text;
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); G.player.target = { type: 'loot', l }; pathTo(l.x, l.z); });
  overlay.appendChild(el);
  l.el = el;
  G.loot.push(l);
  if (G.loot.length > CONFIG.loot.maxGround) trimLoot(G.loot.length - CONFIG.loot.maxGround);
}
/** Remove `n` objetos do chão: primeiro os de menor raridade, entre eles os mais antigos. */
function trimLoot(n) {
  const order = G.loot.slice().sort((a, b) => (a.ord || 0) - (b.ord || 0) || a.born - b.born);
  for (let k = 0; k < n && k < order.length; k++) removeLoot(order[k]);
}
function removeLoot(l) {
  removeLootVisual(l);
  const i = G.loot.indexOf(l);
  if (i >= 0) G.loot.splice(i, 1);
  if (G.player && G.player.target && G.player.target.l === l) G.player.target = null;
}
/**
 * Espalha no chão um drop do Éden (R.rollEdenDrop): Gold, itens Ancestrais e
 * Lendários, Jewels, Talismã da Sorte e poções. Devolve quantos itens raros caíram.
 */
export function dropEdenRoll(x, z, drop, src) {
  const gold = drop.gold ? Math.floor(drop.gold * (1 + G.st.goldPct / 100)) : 0;
  if (gold) dropLoot(x, z, { type: 'gold', amount: gold });
  for (const it of drop.items) {
    dropLoot(x, z, { type: 'item', item: it });
    G.dropLog.unshift({ name: R.itemName(it), rarity: it.rarity, seed: it.seed, roll: null, table: null, src, mf: G.st.mf, at: Date.now() });
    log('Drop raro: ' + R.itemName(it) + '.', 'loot');
    Sfx.loot(R.RARITY[it.rarity].order);
  }
  if (G.dropLog.length > 40) G.dropLog.length = 40;
  for (const j of drop.jewels) dropLoot(x, z, { type: 'jewel', id: j });
  for (let i = 0; i < drop.talismans; i++) dropLoot(x, z, { type: 'talisman', id: 'luck' });
  for (const p of drop.potions) dropLoot(x, z, { type: 'potion', id: p });
  return drop.items.length + drop.jewels.length + drop.talismans;
}
/** Espaço: coleta tudo que está perto (mais raros primeiro); se nada estiver ao alcance, anda até o item mais próximo. */
export function spacePickup() {
  const p = G.player, C = CONFIG.loot;
  if (!p || !p.alive || !G.loot.length) return;
  const r2 = C.spacePickupRadius * C.spacePickupRadius;
  const near = G.loot.filter((l) => (l.x - p.x) ** 2 + (l.z - p.z) ** 2 < r2 && G.time - l.born > 0.3);
  near.sort((a, b) => (b.ord || 0) - (a.ord || 0));
  let got = 0;
  for (const l of near) if (pickup(l)) got++;
  if (got) return;
  let best = null, bd = C.spaceSeekRadius * C.spaceSeekRadius;
  for (const l of G.loot) { const d = (l.x - p.x) ** 2 + (l.z - p.z) ** 2; if (d < bd) { bd = d; best = l; } }
  if (best) { p.target = { type: 'loot', l: best }; pathTo(best.x, best.z); }
}
/**
 * Gold, poções e jewels são coletados só de passar por cima. Com "Pegar drops
 * automaticamente" ligado, tudo (itens também) num raio maior, sem mover o herói.
 */
export function autoPickup(p) {
  const C = CONFIG.loot, all = !!(G.ch && G.ch.autoLoot);
  const r = all ? C.autoLootRadius : C.autoPickupRadius, r2 = r * r;
  const bagFull = G.ch.bag.length >= BAG_SIZE;
  for (let i = G.loot.length - 1; i >= 0; i--) {
    const l = G.loot[i];
    if (l.type === 'item' && (!all || bagFull)) continue;
    if (G.time - l.born > C.autoPickupDelay && (l.x - p.x) ** 2 + (l.z - p.z) ** 2 < r2) pickup(l);
  }
}
function removeLootVisual(l) {
  world.remove(l.mesh);
  disposeObject(l.mesh, false);
  l.el.remove();
}
export function pickup(l) {
  const ch = G.ch;
  if (l.type === 'gold') { ch.gold += Number.isFinite(l.amount) ? l.amount : 0; Sfx.coin(); }
  else if (l.type === 'jewel') { if (!addToBag({ kind: 'jewel', id: l.id, qty: 1, uid: 'j' + l.id })) return false; log('Obteve ' + R.JEWELS[l.id].name + '.', 'loot'); Sfx.loot(3); questEvent('jewel', l.id); }
  else if (l.type === 'potion') { if (!addToBag({ kind: 'potion', id: l.id, qty: 1, uid: 'p' + l.id })) return false; if (R.POTIONS[l.id].buff) log('Obteve ' + R.POTIONS[l.id].name + '.', 'loot'); }
  else if (l.type === 'talisman') { if (!addToBag({ kind: 'talisman', id: l.id, qty: 1, uid: 't' + l.id })) return false; log('Obteve ' + R.TALISMANS[l.id].name + '!', 'loot'); Sfx.loot(4); }
  else {
    if (!addToBag(l.item)) return false;
    Sfx.loot(R.RARITY[l.item.rarity].order);
    if (autoEquipOn() && classOk(l.item)) G.autoEqT = 0.25;
  }
  removeLootVisual(l);
  const i = G.loot.indexOf(l);
  if (i >= 0) G.loot.splice(i, 1);
  // Gold não redesenha o painel inteiro: o HUD atualiza o valor no Inventário (hudTick)
  if (l.type !== 'gold') refreshPaneSoon();
  return true;
}
let expireT = 0;
/** Arco ao cair + rotação e pulsar do feixe de raridade. Equipamentos Comuns/Mágicos somem depois de alguns minutos. */
export function updateLootVisuals(dt) {
  if ((expireT -= dt) <= 0) {
    expireT = 1;
    const ttl = CONFIG.loot.expireLow;
    for (let i = G.loot.length - 1; i >= 0; i--) { const l = G.loot[i]; if (l.type === 'item' && l.ord <= 1 && G.time - l.born > ttl) removeLoot(l); }
  }
  for (const l of G.loot) {
    const k = Math.min(1, (G.time - l.born) / 0.45);
    const x = l.fromX + (l.x - l.fromX) * k, z = l.fromZ + (l.z - l.fromZ) * k;
    l.mesh.position.set(x, Math.sin(k * Math.PI) * 1.6 + gy(x, z), z);
    l.item3d.rotation.y += dt * 1.5;
    l.item3d.position.y = 0.12 + (k >= 1 ? Math.sin(G.time * 2.2 + l.x) * 0.05 : 0);
    if (l.refine) l.refine.update(G.time);
    if (l.beam) l.beam.material.opacity = (l.ord >= 2 ? 0.45 : 0.25) + Math.sin(G.time * 3 + l.x) * 0.1;
  }
}
export function clearLoot() {
  for (const l of G.loot) removeLootVisual(l);
  G.loot.length = 0;
}
