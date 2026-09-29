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
import { kit, kitGlowMat } from '../world/kit.js';
import { toonMaterial } from '../art/stylize.js';
import { texGrime } from '../art/textures.js';

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
  if (L.tower) G.townTower = makeTownTower(L.tower.x * TILE, L.tower.z * TILE, L.town ? L.town.cx * TILE : 23 * TILE, L.town ? L.town.cz * TILE : 23 * TILE);
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
/**
 * Torre Infinita na cidade: corpo de pedra com janelas e runas (kit), porta
 * voltada para a praça e, acima das ameias, anéis de pedra flutuando e subindo
 * sem fim até sumir, com um cristal girando. Fica translúcida quando o herói
 * passa atrás dela (ela está na frente da câmera).
 */
const TOWER_SCALE = 0.62;
function makeTownTower(x, z, cx, cz) {
  const g = new THREE.Group();
  const k = kit('towerBig');
  const gr = texGrime();
  const mat = toonMaterial({ vertexColors: true, map: gr.map, normalMap: gr.normalMap, transparent: true }, { rim: 0.22 });
  mat.normalScale.setScalar(0.6);
  const body = new THREE.Mesh(k.geo, mat);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const glowM = kitGlowMat().clone();
  glowM.onBeforeCompile = kitGlowMat().onBeforeCompile;
  glowM.customProgramCacheKey = kitGlowMat().customProgramCacheKey;
  const glow = new THREE.Mesh(k.glow, glowM);
  glow.renderOrder = 3;
  g.add(glow);
  // anéis flutuantes: pedaços da torre "que continua" acima das ameias
  const rings = [];
  const ringGeo = new THREE.TorusGeometry(1.6, 0.28, 6, 10, Math.PI * 1.55);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshToonMaterial({ color: 0x8e909e, transparent: true });
    const r = new THREE.Mesh(ringGeo, m);
    r.rotation.x = Math.PI / 2;
    r.userData.k = i / 4;
    g.add(r); rings.push(r);
  }
  const crystal = new THREE.Mesh(GEO.oct, glowMat(0x6ad8ff, 0.9));
  crystal.scale.set(0.9, 1.5, 0.9);
  g.add(crystal);
  g.position.set(x, gy(x, z), z);
  g.scale.setScalar(TOWER_SCALE); // modelada em escala grande; reduzida para não tapar a câmera
  g.rotation.y = Math.atan2(cx - x, cz - z); // porta (+z) voltada para a praça
  world.add(g);
  return { x, z, g, mat, glowM, rings, ringGeo, crystal, fade: 1 };
}
/** Anéis sobem, encolhem e somem; a torre fica translúcida com o herói atrás dela. */
function updateTownTower(T, dt) {
  const t = G.time;
  for (const r of T.rings) {
    const k = (r.userData.k + t * 0.06) % 1;
    r.position.y = 15.8 + k * 9;
    r.scale.setScalar(1 - k * 0.45);
    r.rotation.z = t * 0.4 + r.userData.k * 5;
    r.material.opacity = Math.min(1, (1 - k) * 1.6) * T.fade;
  }
  T.crystal.position.y = 16.4 + Math.sin(t * 1.4) * 0.35;
  T.crystal.rotation.y = t * 1.2;
  if (Math.random() < 0.4) emit(T.x + (rand() - 0.5) * 1.6, 15 * TOWER_SCALE, T.z + (rand() - 0.5) * 2.4, { n: 1, color: 0x6ad8ff, speed: 0.3, up: 4, life: 2.2, size: 0.6, grav: -1.2, alpha: 0.8 });
  // atrás da torre = mais longe da câmera (que olha do sudeste) e perto da linha de visão
  const p = G.player;
  let target = 1;
  if (p && G.mode === 'play') {
    const dx = T.x - p.x, dz = T.z - p.z, along = (dx + dz) * Math.SQRT1_2, side = Math.abs(dx - dz) * Math.SQRT1_2;
    if (along > -1 && along < 14 && side < 3.5) target = 0.3;
  }
  T.fade += (target - T.fade) * Math.min(1, dt * 6);
  T.mat.opacity = T.fade;
  T.mat.depthWrite = T.fade > 0.95;
  T.glowM.opacity = 0.95 * T.fade;
}
function removeTownTower(T) {
  if (!T) return;
  world.remove(T.g);
  T.mat.dispose(); T.glowM.dispose(); T.ringGeo.dispose(); T.crystal.material.dispose();
  for (const r of T.rings) r.material.dispose();
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
  if (G.townTower) updateTownTower(G.townTower, dt);
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
  removeTownTower(G.townTower);
  G.exitPortal = G.townPortal = G.townTower = null;
}
