// ---------- loot no chão ----------
import { GEO } from '../art/geometry.js';
import { glowMat, toon } from '../art/materials.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { fmt, R, rand } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { overlay } from '../engine/overlay.js';
import { world } from '../engine/renderer.js';
import { addToBag, autoEquipOn, classOk } from './inventory.js';
import { pathTo } from './movement.js';
import { refreshPaneSoon } from '../ui/drawer.js';
import { log } from '../ui/log.js';
import { gy, walkable } from '../world/grid.js';

function lootLabel(l) {
  if (l.type === 'gold') return { text: fmt(l.amount) + ' Gold', color: '#f2cf7a' };
  if (l.type === 'jewel') return { text: R.JEWELS[l.id].name, color: R.JEWELS[l.id].color };
  if (l.type === 'potion') return { text: R.POTIONS[l.id].name, color: l.id === 'hp' ? '#ff8a7a' : '#8ab8ff' };
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
  let mesh;
  if (l.type === 'gold') mesh = new THREE.Mesh(GEO.cyl, toon(0xffd24a, 0xaa7a00, 0.4)), mesh.scale.set(0.45, 0.12, 0.45);
  else if (l.type === 'jewel') mesh = new THREE.Mesh(GEO.oct, toon(col, col, 0.6)), mesh.scale.set(0.45, 0.6, 0.45);
  else if (l.type === 'potion') mesh = new THREE.Mesh(GEO.sphS, toon(col, col, 0.3)), mesh.scale.setScalar(0.4);
  else mesh = new THREE.Mesh(GEO.box, toon(col, col, 0.25)), mesh.scale.set(0.5, 0.18, 0.7);
  mesh.position.y = 0.2;
  mesh.castShadow = true;
  g.add(mesh);
  const ord = l.type === 'item' ? R.RARITY[l.item.rarity].order : l.type === 'jewel' ? 3 : 0;
  if (ord >= 1) {
    const beam = new THREE.Mesh(GEO.beam, glowMat(col, ord >= 2 ? 0.55 : 0.3));
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
/** Gold, poções e jewels são coletados só de passar por cima. */
export function autoPickup(p) {
  const C = CONFIG.loot, r2 = C.autoPickupRadius * C.autoPickupRadius;
  for (let i = G.loot.length - 1; i >= 0; i--) {
    const l = G.loot[i];
    if (l.type !== 'item' && G.time - l.born > C.autoPickupDelay && (l.x - p.x) ** 2 + (l.z - p.z) ** 2 < r2) pickup(l);
  }
}
function removeLootVisual(l) {
  world.remove(l.mesh);
  if (l.beam) l.beam.material.dispose();
  l.el.remove();
}
export function pickup(l) {
  const ch = G.ch;
  if (l.type === 'gold') { ch.gold += Number.isFinite(l.amount) ? l.amount : 0; Sfx.coin(); }
  else if (l.type === 'jewel') { if (!addToBag({ kind: 'jewel', id: l.id, qty: 1, uid: 'j' + l.id })) return false; log('Obteve ' + R.JEWELS[l.id].name + '.', 'loot'); Sfx.loot(3); }
  else if (l.type === 'potion') { if (!addToBag({ kind: 'potion', id: l.id, qty: 1, uid: 'p' + l.id })) return false; }
  else {
    if (!addToBag(l.item)) return false;
    Sfx.loot(R.RARITY[l.item.rarity].order);
    if (autoEquipOn() && classOk(l.item)) G.autoEqT = 0.25;
  }
  removeLootVisual(l);
  const i = G.loot.indexOf(l);
  if (i >= 0) G.loot.splice(i, 1);
  refreshPaneSoon();
  return true;
}
/** Arco ao cair + rotação e pulsar do feixe de raridade. */
export function updateLootVisuals(dt) {
  for (const l of G.loot) {
    const k = Math.min(1, (G.time - l.born) / 0.45);
    const x = l.fromX + (l.x - l.fromX) * k, z = l.fromZ + (l.z - l.fromZ) * k;
    l.mesh.position.set(x, Math.sin(k * Math.PI) * 1.6 + gy(x, z), z);
    l.item3d.rotation.y += dt * 1.5;
    if (l.beam) l.beam.material.opacity = (l.ord >= 2 ? 0.45 : 0.25) + Math.sin(G.time * 3 + l.x) * 0.1;
  }
}
export function clearLoot() {
  for (const l of G.loot) removeLootVisual(l);
  G.loot.length = 0;
}
