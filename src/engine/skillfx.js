// ---------- efeitos de habilidade: malhas animadas (cortes, colunas, estilhaços, clarões) ----------
// Cada efeito é uma malha aditiva com material próprio (a opacidade anima) e uma
// função que a atualiza de 0 a 1 ao longo da duração; ao terminar o material é
// liberado. As geometrias são compartilhadas e nunca liberadas.
import { GEO } from '../art/geometry.js';
import { glowMat } from '../art/materials.js';
import { emit } from './effects.js';
import { scene, world } from './renderer.js';
import { gy } from '../world/grid.js';

const FXG = {
  // arco de corte horizontal (pouco menos de meia volta), centrado em +z depois do rotateX
  arc: new THREE.RingGeometry(0.62, 1, 40, 1, -Math.PI / 2 - Math.PI * 0.45, Math.PI * 0.9),
  // arco fino para o golpe giratório (três quartos de volta)
  arcWide: new THREE.RingGeometry(0.78, 1, 64, 1, 0, Math.PI * 1.5),
  // coluna de luz aberta com a base em y = 0
  pillar: new THREE.CylinderGeometry(1, 1, 1, 28, 1, true),
  shard: new THREE.ConeGeometry(0.5, 1, 4),
};
FXG.arc.rotateX(-Math.PI / 2);
FXG.arcWide.rotateX(-Math.PI / 2);
FXG.pillar.translate(0, 0.5, 0);
// a coluna esmaece para cima: cor por vértice (preto some no brilho aditivo)
{
  const pos = FXG.pillar.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const v = Math.pow(1 - pos.getY(i), 1.5); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  FXG.pillar.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
FXG.shard.translate(0, 0.5, 0);

const fx = [];
const ease = (k) => 1 - Math.pow(1 - k, 3);

/** Registra uma malha animada; `upd(k, e, t)` recebe o progresso (0–1), o progresso suavizado e o tempo. */
function add(mesh, dur, upd, opts) {
  mesh.renderOrder = 3;
  world.add(mesh);
  const f = { mesh, dur, t: -(opts && opts.delay || 0), upd };
  mesh.visible = f.t >= 0;
  fx.push(f);
  return f;
}
function glowMesh(geo, color, op) {
  return new THREE.Mesh(geo, glowMat(color, op));
}

/** Corte em arco no plano do chão, varrendo `sweep` radianos a partir de `rot`. */
export function slash(x, z, rot, radius, color, o) {
  o = o || {};
  const y = (o.y != null ? o.y : 1.1) + gy(x, z);
  const m = glowMesh(o.wide ? FXG.arcWide : FXG.arc, color, o.op || 0.9);
  m.position.set(x, y, z);
  m.scale.setScalar(radius);
  if (o.tilt) m.rotation.x = o.tilt;
  const sweep = o.sweep != null ? o.sweep : 1.4, dur = o.dur || 0.22, r0 = rot - sweep / 2;
  m.rotation.y = r0;
  return add(m, dur, (k, e) => {
    m.rotation.y = r0 + sweep * e;
    m.scale.setScalar(radius * (0.85 + 0.2 * e));
    m.material.opacity = (o.op || 0.9) * (1 - k * k);
  }, o);
}

/** Coluna de luz vertical que sobe rápido e se abre enquanto some. */
export function pillar(x, z, radius, height, color, dur, o) {
  o = o || {};
  const m = glowMesh(FXG.pillar, color, o.op || 0.55);
  m.material.vertexColors = true;
  m.position.set(x, gy(x, z), z);
  return add(m, dur, (k, e, t) => {
    const up = Math.min(1, k * 4);
    m.scale.set(radius * (1 + e * (o.grow != null ? o.grow : 0.4)), height * ease(up), radius * (1 + e * (o.grow != null ? o.grow : 0.4)));
    m.rotation.y = t * 3;
    m.material.opacity = (o.op || 0.55) * (1 - k);
  }, o);
}

/** Esfera translúcida em volta do herói (escudos, auras). Segue `follow` se dado. */
export function bubble(x, z, radius, color, dur, follow) {
  const m = glowMesh(GEO.sphS, color, 0.35);
  return add(m, dur, (k, e, t) => {
    const px = follow ? follow.x : x, pz = follow ? follow.z : z;
    m.position.set(px, 1 + gy(px, pz), pz);
    const s = radius * 2 * (0.6 + 0.4 * ease(Math.min(1, k * 3))) * (1 + Math.sin(t * 14) * 0.03);
    m.scale.set(s, s * 1.1, s);
    m.material.opacity = 0.35 * (k < 0.7 ? 1 : (1 - k) / 0.3);
  });
}

/** Estilhaços que brotam do chão em círculo (gelo, rocha) e afundam de volta. */
export function shards(x, z, r0, r1, count, color, dur, o) {
  o = o || {};
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const d = r0 + (r1 - r0) * Math.random();
    const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
    const h = (o.h || 1.4) * (0.6 + Math.random() * 0.6);
    const m = glowMesh(FXG.shard, color, 0.8);
    m.position.set(sx, gy(sx, sz) - 0.05, sz);
    m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    const w = 0.35 + Math.random() * 0.25;
    add(m, dur, (k) => {
      const up = k < 0.2 ? ease(k / 0.2) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      m.scale.set(w, h * up, w);
      m.material.opacity = 0.8 * (k > 0.6 ? (1 - k) / 0.4 : 1);
    }, { delay: (d / r1) * (o.stagger || 0.18) });
  }
}

/** Rachaduras brilhantes irradiando do centro (impacto no chão). */
export function cracks(x, z, len, count, color, dur) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const l = len * (0.6 + Math.random() * 0.5);
    const m = glowMesh(GEO.box, color, 0.9);
    const cx = x + Math.sin(a) * l * 0.5, cz = z + Math.cos(a) * l * 0.5;
    m.position.set(cx, gy(cx, cz) + 0.06, cz);
    m.rotation.y = a;
    add(m, dur, (k, e) => {
      m.scale.set(0.12 * (1 - k * 0.5), 0.03, l * ease(Math.min(1, k * 5)));
      m.material.opacity = 0.9 * (1 - k);
    });
  }
}

/** Marca escura no chão que desbota devagar (queimadura, cratera). */
export function scorch(x, z, radius, dur) {
  const m = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  m.position.set(x, gy(x, z) + 0.05, z);
  m.scale.setScalar(radius);
  m.renderOrder = 1;
  world.add(m);
  fx.push({ mesh: m, dur, t: 0, upd: (k) => { m.material.opacity = 0.45 * (1 - k * k); } });
}

/** Silhueta luminosa deixada para trás numa investida (pós-imagem). */
export function afterimage(x, z, rot, color, dur) {
  const m = glowMesh(GEO.cap, color, 0.4);
  m.position.set(x, 1 + gy(x, z), z);
  m.rotation.y = rot;
  add(m, dur, (k) => {
    m.scale.set(0.7 * (1 - k * 0.3), 0.8, 0.45);
    m.material.opacity = 0.4 * (1 - k);
  });
}

/** Objeto que cai do céu até (x, z) em `dur` segundos deixando rastro; `onLand` roda no impacto. */
export function fall(x, z, o) {
  const from = o.from || [4, 12, -3];
  const m = glowMesh(o.geo || GEO.sphS, o.color, 0.95);
  const s = o.size || 1;
  const y0 = gy(x, z);
  const dir = new THREE.Vector3(-from[0], -from[1], -from[2]).normalize();
  if (o.stretch) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  return add(m, o.dur, (k) => {
    const e = k * k;
    m.position.set(x + from[0] * (1 - e), y0 + 0.4 + from[1] * (1 - e), z + from[2] * (1 - e));
    if (o.stretch) m.scale.set(s * 0.16, s * 0.16, s * 2.2);
    else m.scale.setScalar(s * (0.7 + 0.3 * k));
    if (o.trail && Math.random() < 0.9) emit(m.position.x, m.position.y - y0, m.position.z, o.trail);
    if (k >= 1 && o.onLand) o.onLand();
  }, o);
}

// ---------- clarões de luz (pool fixo: nunca muda o número de luzes da cena) ----------
const LIGHTS = [];
for (let i = 0; i < 2; i++) {
  const l = new THREE.PointLight(0xffffff, 0, 14, 1.6);
  scene.add(l);
  LIGHTS.push({ l, t: 1, dur: 1, i0: 0 });
}
/** Ilumina o entorno por um instante (explosões, impactos pesados). */
export function flash(x, y, z, color, intensity, dur) {
  let s = LIGHTS[0];
  for (const c of LIGHTS) if (c.t / c.dur > s.t / s.dur) s = c; // reaproveita o mais apagado
  s.l.color.setHex(color);
  s.l.position.set(x, y + gy(x, z), z);
  s.t = 0; s.dur = dur || 0.35; s.i0 = intensity || 60;
  s.l.intensity = s.i0;
}

export function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    if (f.t < 0) continue;
    f.mesh.visible = true;
    const k = Math.min(1, f.t / f.dur);
    f.upd(k, ease(k), f.t);
    if (k >= 1) { world.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); }
  }
  for (const s of LIGHTS) {
    if (s.t >= s.dur) continue;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    s.l.intensity = s.i0 * (1 - k) * (1 - k);
  }
}

/** Remove todos os efeitos ativos (troca de zona). */
export function clearFx() {
  for (const f of fx) { world.remove(f.mesh); f.mesh.material.dispose(); }
  fx.length = 0;
  for (const s of LIGHTS) { s.t = s.dur; s.l.intensity = 0; }
}
