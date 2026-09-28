// ---------- NPCs e cidade ----------
import { GEO } from '../art/geometry.js';
import { disposeObject, glowMat } from '../art/materials.js';
import { animateModel, buildHumanoid, disposeModel } from '../art/models.js';
import { G } from '../core/state.js';
import { esc, rand, TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { overlay } from '../engine/overlay.js';
import { world } from '../engine/renderer.js';
import { NPCS } from './data.js';
import { pathTo } from './movement.js';
import { inView } from './world.js';
import { openNpc } from '../ui/npcDialogs.js';
import { gy } from '../world/grid.js';

export function spawnNpcs(L) {
  L.npcs.forEach((n) => {
    const D = NPCS[n.id];
    const model = buildHumanoid(Object.assign({ scale: 1.05 }, D.look));
    const x = n.x * TILE, z = n.z * TILE;
    model.root.position.set(x, gy(x, z), z);
    const cx = L.town ? L.town.cx * TILE : 23 * TILE, cz = L.town ? L.town.cz * TILE : 23 * TILE;
    model.root.rotation.y = Math.atan2(cx - x, cz - z);
    world.add(model.root);
    const label = document.createElement('div');
    label.className = 'label npc';
    label.innerHTML = esc(D.name) + '<small>' + esc(D.role.split(' · ')[0]) + '</small>';
    label.addEventListener('pointerdown', (e) => { e.stopPropagation(); targetNpc(npc); });
    overlay.appendChild(label);
    const npc = { id: n.id, D, x, z, model, label, phase: rand() * 6 };
    G.npcs.push(npc);
  });
  // portal da cidade
  const pp = L.portal;
  if (pp) G.townPortal = makePortal(pp.x * TILE, pp.z * TILE, 0x9a7aff, 'Portal das Masmorras', () => openNpc('portal'));
}
// geometrias do portal: criadas uma vez e compartilhadas por todos os portais
let portalGeo = null;
function getPortalGeo() {
  if (!portalGeo) {
    portalGeo = { ring: new THREE.TorusGeometry(1.5, 0.18, 8, 32), disc: new THREE.CircleGeometry(1.4, 32) };
    portalGeo.ring.userData.shared = portalGeo.disc.userData.shared = true;
  }
  return portalGeo;
}
export function makePortal(x, z, color, text, onUse) {
  const PG = getPortalGeo();
  const g = new THREE.Group();
  const ring = new THREE.Mesh(PG.ring, glowMat(color, 0.9));
  ring.position.y = 1.8;
  g.add(ring);
  const disc = new THREE.Mesh(PG.disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.position.y = 1.8;
  g.add(disc);
  const floorRing = new THREE.Mesh(GEO.ring, glowMat(color, 0.6));
  floorRing.scale.setScalar(1.8); floorRing.position.y = 0.06;
  g.add(floorRing);
  g.position.set(x, gy(x, z), z);
  g.rotation.y = Math.PI / 4;
  world.add(g);
  const label = document.createElement('div');
  label.className = 'label portal';
  label.textContent = text;
  const portal = { x, z, g, ring, disc, label, color, onUse };
  label.addEventListener('pointerdown', (e) => { e.stopPropagation(); G.player.target = { type: 'portal', p: portal }; pathTo(x, z); });
  overlay.appendChild(label);
  return portal;
}
function removePortal(pt) {
  if (!pt) return;
  world.remove(pt.g);
  disposeObject(pt.g, true);
  pt.label.remove();
}
export function targetNpc(npc) {
  G.player.target = { type: 'npc', n: npc };
  pathTo(npc.x, npc.z);
}

/** NPCs ociosos: só animam quando estão na tela. */
export function updateNpcs(dt) {
  for (const n of G.npcs) {
    const vis = inView(n.x, n.model.root.position.y + 1.5, n.z, 3);
    n.model.root.visible = vis;
    if (vis) animateModel(n.model, { t: G.time + n.phase, dt, moving: false, attack: 0 });
  }
}
export function updatePortals(dt) {
  for (const pt of [G.exitPortal, G.townPortal]) {
    if (!pt) continue;
    pt.ring.rotation.z += dt * 1.5;
    pt.disc.material.opacity = 0.3 + Math.sin(G.time * 4) * 0.1;
    if (Math.random() < 0.5) emit(pt.x + (rand() - 0.5) * 2, 0.3, pt.z + (rand() - 0.5) * 2, { n: 1, color: pt.color, speed: 0.5, up: 3, life: 1, size: 0.8, grav: 1.5 });
  }
}
/** Remove NPCs e portais (troca de zona), liberando modelos, materiais e rótulos. */
export function clearNpcs() {
  for (const n of G.npcs) { world.remove(n.model.root); disposeModel(n.model); n.label.remove(); }
  G.npcs.length = 0;
  removePortal(G.exitPortal);
  removePortal(G.townPortal);
  G.exitPortal = G.townPortal = null;
}
