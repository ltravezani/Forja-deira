// ---------- projéteis (jogador e monstros) ----------
// As malhas vêm de um pool por tipo e usam materiais compartilhados, então disparar
// não cria nem libera materiais; ao sair de cena a malha volta ao pool.
import { GEO } from '../art/geometry.js';
import { glowShared, toon } from '../art/materials.js';
import { G } from '../core/state.js';
import { TILE } from '../core/util.js';
import { emit, spawnRing } from '../engine/effects.js';
import { world } from '../engine/renderer.js';
import { hitMonster, hurtPlayer } from './combat.js';
import { QUERY_PAD, queryMonsters } from './monsters.js';
import { gy, walkable } from '../world/grid.js';

const PROJ_RADIUS = 0.55;      // raio do projétil do jogador contra monstros (m)
const PLAYER_HIT_R2 = 0.8;     // distância² para projétil de monstro acertar o jogador
const meshPool = { arrow: [], orb: [] };
const near = [];

function takeMesh(kind) {
  const m = meshPool[kind].pop();
  return m || new THREE.Mesh(kind === 'arrow' ? GEO.box : GEO.sphS);
}
function releaseMesh(pr) {
  world.remove(pr.mesh);
  meshPool[pr.arrow ? 'arrow' : 'orb'].push(pr.mesh);
}

/** o: {from:'p'|'m', x, z, dx, dz, speed, range, color, arrow?, size?, mult?, skill?, pierce?, slow?, dmg?, src?, y?, spiral?} */
export function spawnProjectile(o) {
  const mesh = takeMesh(o.arrow ? 'arrow' : 'orb');
  if (o.arrow) {
    mesh.material = toon(o.color || 0xe8e0cc, o.color, 0.5);
    mesh.scale.set(0.08, 0.08, 0.9);
  } else {
    mesh.material = glowShared(o.color, 0.95);
    mesh.scale.setScalar(o.size || 0.5);
  }
  const y = o.y || 1.3;
  mesh.position.set(o.x, y + gy(o.x, o.z), o.z);
  mesh.rotation.set(0, Math.atan2(o.dx, o.dz), 0);
  world.add(mesh);
  G.projectiles.push(Object.assign({ traveled: 0, hit: new Set(), mesh, y }, o));
}

/** Rastro: brilho atrás dos orbes, risco fino atrás das flechas e espiral nos disparos de habilidade. */
function trail(pr) {
  if (pr.arrow) {
    if (pr.from === 'p') emit(pr.x - pr.dx * 0.4, pr.y, pr.z - pr.dz * 0.4, { n: 1, color: pr.color, speed: 0.1, life: 0.16, size: 0.45, grav: 0, spread: 0.05, alpha: 0.7 });
    return;
  }
  if (Math.random() < 0.8) emit(pr.x, pr.y, pr.z, { n: 1, color: pr.color, speed: 0.4, life: 0.35, size: pr.big ? 1.4 : 0.8, grav: 0 });
  if (pr.spiral) {
    const a = pr.traveled * 2.2, r = pr.big ? 0.45 : 0.32;
    for (const s of [1, -1]) {
      const c = Math.cos(a) * r * s;
      emit(pr.x - pr.dz * c, pr.y + Math.sin(a) * r * s, pr.z + pr.dx * c, { n: 1, color: pr.spiral, speed: 0.2, life: 0.3, size: 0.5, grav: 0, spread: 0.02, spreadY: 0.02 });
    }
  }
}

function blocked(pr) {
  if (walkable(G.L, pr.x, pr.z)) return false;
  // saindo de trás de uma parede baixa (tile 2) logo após o disparo: ainda vale
  const L = G.L, cell = L.grid[Math.round(pr.z / TILE) * L.W + Math.round(pr.x / TILE)];
  return !(cell === 2 && pr.traveled < 2);
}

function hitMonsters(pr) {
  queryMonsters(pr.x, pr.z, PROJ_RADIUS + QUERY_PAD, near);
  for (const m of near) {
    if (m.dead || pr.hit.has(m.id)) continue;
    const hr = PROJ_RADIUS + m.radius;
    if ((m.x - pr.x) ** 2 + (m.z - pr.z) ** 2 >= hr * hr) continue;
    pr.hit.add(m.id);
    hitMonster(m, pr.mult, pr.skill, { slow: pr.slow });
    if (!pr.pierce) return true;
  }
  return false;
}

export function updateProjectiles(dt) {
  const p = G.player;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    const s = pr.speed * dt;
    pr.x += pr.dx * s; pr.z += pr.dz * s; pr.traveled += s;
    pr.mesh.position.set(pr.x, pr.y + gy(pr.x, pr.z), pr.z);
    let dead = pr.traveled > pr.range || blocked(pr);
    trail(pr);
    let hit = false;
    if (!dead && pr.from === 'p') dead = hit = hitMonsters(pr);
    else if (!dead && pr.from === 'm' && (p.x - pr.x) ** 2 + (p.z - pr.z) ** 2 < PLAYER_HIT_R2) { hurtPlayer(pr.dmg, pr.src); dead = true; }
    if (dead) {
      emit(pr.x, pr.y, pr.z, { n: hit ? 12 : 6, color: pr.color, speed: hit ? 5 : 3, life: 0.3, size: 0.7 });
      if (hit && !pr.arrow) spawnRing(pr.x, pr.z, 0.2, 1.3, pr.color, 0.25);
      releaseMesh(pr);
      G.projectiles.splice(i, 1);
    }
  }
}

/** Remove todos os projéteis (troca de zona); as malhas voltam ao pool. */
export function clearProjectiles() {
  for (const pr of G.projectiles) releaseMesh(pr);
  G.projectiles.length = 0;
}
