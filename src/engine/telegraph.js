// =============================================================================
// Avisos no chão antes de golpes fortes (chefes, mini chefes e elites): círculo
// ou cone vermelho translúcido cujo preenchimento cresce até o momento do golpe.
// O dano é aplicado por quem criou o aviso, só na área marcada (dá para esquivar).
// Pool fixo de malhas, criado na primeira vez; cada aviso só troca posição,
// escala e opacidade. Na qualidade baixa fica só o contorno e o preenchimento.
// =============================================================================
import { gy } from '../world/grid.js';
import { particleScale, scene } from './renderer.js';

/** Meio ângulo do cone (rad): ~55° para cada lado da direção do golpe. */
export const CONE_HALF = 0.96;
const N = 10;
const COLOR = 0xff2a1a;
let pool = null;

function init() {
  if (pool) return pool;
  const flat = (g) => { g.rotateX(-Math.PI / 2); return g; };
  // deitada no chão, o ângulo -90° da geometria aponta para +z: centro do cone = direção 0 do jogo (atan2(dx, dz))
  const geo = {
    circle: { base: flat(new THREE.CircleGeometry(1, 40)), edge: flat(new THREE.RingGeometry(0.93, 1, 48)) },
    cone: {
      base: flat(new THREE.CircleGeometry(1, 24, -Math.PI / 2 - CONE_HALF, CONE_HALF * 2)),
      edge: flat(new THREE.RingGeometry(0.93, 1, 24, 1, -Math.PI / 2 - CONE_HALF, CONE_HALF * 2)),
    },
  };
  const mat = (op) => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pool = { geo, list: [] };
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(geo.circle.base, mat(0.16));
    const fill = new THREE.Mesh(geo.circle.base, mat(0.32));
    const edge = new THREE.Mesh(geo.circle.edge, mat(0.75));
    base.renderOrder = fill.renderOrder = edge.renderOrder = 3;
    fill.position.y = 0.01; edge.position.y = 0.02;
    g.add(base, fill, edge);
    g.visible = false;
    scene.add(g);
    pool.list.push({ g, base, fill, edge, t: 1, dur: 1, end: 0.15, live: false, owner: null });
  }
  return pool;
}
function take() {
  const P = init();
  let f = P.list.find((x) => !x.live);
  if (!f) f = P.list.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); // todos em uso: recicla o mais adiantado
  return f;
}
function start(shape, x, z, rot, r, dur, owner) {
  const f = take(), G2 = pool.geo[shape];
  f.base.geometry = f.fill.geometry = G2.base;
  f.edge.geometry = G2.edge;
  f.base.visible = particleScale() > 0.6; // qualidade baixa: sem o fundo translúcido (menos sobreposição)
  f.g.position.set(x, 0.06 + gy(x, z), z);
  f.g.rotation.set(0, shape === 'cone' ? rot : 0, 0);
  f.g.scale.set(r, 1, r);
  f.t = 0; f.dur = dur; f.live = true; f.owner = owner || null; f.fading = false;
  f.base.material.opacity = 0.16;
  f.g.visible = true;
  set(f, 0);
  return f;
}
/** Círculo de aviso de raio r em (x, z), por `dur` segundos. `owner`: se morrer, o aviso some. */
export function telegraphCircle(x, z, r, dur, owner) { return start('circle', x, z, 0, r, dur, owner); }
/** Cone de aviso a partir de (x, z), na direção `rot` (atan2(dx, dz)), alcance r. */
export function telegraphCone(x, z, rot, r, dur, owner) { return start('cone', x, z, rot, r, dur, owner); }
/** O ponto (px, pz) está dentro do cone (x, z, rot, r)? `pad` aumenta o alcance (raio do corpo). */
export function inCone(x, z, rot, r, px, pz, pad) {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  if (d > r + (pad || 0)) return false;
  if (d < 0.6) return true;
  let da = Math.atan2(dx, dz) - rot;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) <= CONE_HALF + 0.08;
}

function set(f, k) {
  // o preenchimento cresce até a borda no instante do golpe; a borda pulsa cada vez mais rápido
  const e = Math.min(1, k);
  f.fill.scale.set(e, 1, e);
  f.edge.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(f.t * (8 + 14 * e)));
  f.fill.material.opacity = 0.22 + 0.2 * e;
}
export function updateTelegraphs(dt) {
  if (!pool) return;
  for (const f of pool.list) {
    if (!f.live) continue;
    f.t += dt;
    if (!f.fading && f.owner && f.owner.dead) { f.fading = true; f.t = Math.max(f.t, f.dur); }
    if (f.t < f.dur) { set(f, f.t / f.dur); continue; }
    // depois do golpe: clarão rápido e some
    const k = (f.t - f.dur) / f.end;
    if (k >= 1) { f.live = false; f.g.visible = false; continue; }
    f.fill.scale.set(1, 1, 1);
    f.fill.material.opacity = (f.fading ? 0.2 : 0.55) * (1 - k);
    f.edge.material.opacity = 0.8 * (1 - k);
    f.base.material.opacity = 0.16 * (1 - k);
  }
}
/** Esconde todos os avisos (troca de zona). As malhas são reaproveitadas. */
export function clearTelegraphs() {
  if (!pool) return;
  for (const f of pool.list) { f.live = false; f.g.visible = false; f.base.material.opacity = 0.16; }
}
