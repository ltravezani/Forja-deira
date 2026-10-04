// ---------- efeitos: partículas (um único Points com shader aditivo) e anéis no chão ----------
import { GEO } from '../art/geometry.js';
import { glowMat } from '../art/materials.js';
import { CONFIG } from '../core/config.js';
import { particleScale, renderer, scene, world } from './renderer.js';
import { gy } from '../world/grid.js';

const PMAX = CONFIG.particles.max;
/** Partículas em arrays tipados (pool fixo; remover = trocar com a última viva). */
const P = {
  pos: new Float32Array(PMAX * 3), col: new Float32Array(PMAX * 4), size: new Float32Array(PMAX),
  vel: new Float32Array(PMAX * 3), life: new Float32Array(PMAX), max: new Float32Array(PMAX),
  grav: new Float32Array(PMAX), drag: new Float32Array(PMAX), s0: new Float32Array(PMAX), a0: new Float32Array(PMAX), n: 0,
};
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('pcolor', new THREE.BufferAttribute(P.col, 4).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('size', new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float uScale;' +
    'void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(uScale/-mv.z); gl_Position=projectionMatrix*mv; }',
  fragmentShader: 'varying vec4 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=pow(1.0-r*2.0,1.6); gl_FragColor=vec4(vC.rgb*a*vC.a,1.0); }',
  uniforms: { uScale: { value: 520 } },
});
const pPoints = new THREE.Points(pGeo, pMat);
pPoints.frustumCulled = false;
scene.add(pPoints);
const tmpC = new THREE.Color();
/** Emite partículas. o: {n, color, speed, up, life, size, grav, spread, drag, y} */
export function emit(x, y, z, o) {
  y += gy(x, z);
  const n = Math.round((o.n || 10) * particleScale());
  tmpC.set(o.color || 0xffffff);
  for (let i = 0; i < n; i++) {
    if (P.n >= PMAX) return;
    const k = P.n++;
    const sp = (o.speed || 3) * (0.4 + Math.random() * 0.6);
    const a = Math.random() * Math.PI * 2;
    const up = o.up != null ? o.up : 0.5;
    const vy = (Math.random() * 0.8 + 0.2) * sp * up;
    const hr = o.dir ? 0 : sp;
    P.pos[k * 3] = x + (Math.random() - 0.5) * (o.spread || 0.3);
    P.pos[k * 3 + 1] = y + (Math.random() - 0.5) * (o.spreadY || 0.2);
    P.pos[k * 3 + 2] = z + (Math.random() - 0.5) * (o.spread || 0.3);
    if (o.dir) {
      P.vel[k * 3] = o.dir[0] * sp + (Math.random() - 0.5) * 1.2;
      P.vel[k * 3 + 1] = o.dir[1] * sp + (Math.random() - 0.5) * 1.2;
      P.vel[k * 3 + 2] = o.dir[2] * sp + (Math.random() - 0.5) * 1.2;
    } else {
      P.vel[k * 3] = Math.cos(a) * hr;
      P.vel[k * 3 + 1] = vy;
      P.vel[k * 3 + 2] = Math.sin(a) * hr;
    }
    const v = o.jitter ? 0.75 + Math.random() * 0.5 : 1;
    P.col[k * 4] = tmpC.r * v; P.col[k * 4 + 1] = tmpC.g * v; P.col[k * 4 + 2] = tmpC.b * v; P.col[k * 4 + 3] = 1;
    P.a0[k] = o.alpha || 1;
    P.life[k] = P.max[k] = (o.life || 0.6) * (0.6 + Math.random() * 0.6);
    P.s0[k] = P.size[k] = (o.size || 1) * (0.6 + Math.random() * 0.7);
    P.grav[k] = o.grav != null ? o.grav : -6;
    P.drag[k] = o.drag != null ? o.drag : 1.5;
  }
}
let lastDrawn = 0;
export function updateParticles(dt) {
  let i = 0;
  while (i < P.n) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) {
      const l = --P.n;
      if (i !== l) {
        for (let c = 0; c < 3; c++) { P.pos[i * 3 + c] = P.pos[l * 3 + c]; P.vel[i * 3 + c] = P.vel[l * 3 + c]; }
        for (let c = 0; c < 4; c++) P.col[i * 4 + c] = P.col[l * 4 + c];
        P.life[i] = P.life[l]; P.max[i] = P.max[l]; P.size[i] = P.size[l]; P.grav[i] = P.grav[l]; P.drag[i] = P.drag[l]; P.s0[i] = P.s0[l]; P.a0[i] = P.a0[l];
      }
      continue;
    }
    const f = Math.max(0, 1 - P.drag[i] * dt);
    P.vel[i * 3] *= f; P.vel[i * 3 + 2] *= f;
    P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * Math.max(0, 1 - P.drag[i] * 0.3 * dt) + P.grav[i] * dt;
    P.pos[i * 3] += P.vel[i * 3] * dt;
    P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
    P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    if (P.pos[i * 3 + 1] < 0.05) { P.pos[i * 3 + 1] = 0.05; P.vel[i * 3 + 1] *= -0.3; }
    const lf = P.life[i] / P.max[i];
    P.col[i * 4 + 3] = P.a0[i] * Math.min(1, lf * 2.2);
    P.size[i] = P.s0[i] * (0.5 + lf * 0.5);
    i++;
  }
  if (P.n === 0 && lastDrawn === 0) return; // nada vivo: não reenvia buffers à GPU
  lastDrawn = P.n;
  pGeo.setDrawRange(0, P.n);
  // só as partículas vivas sobem para a GPU (não o pool inteiro de 4000)
  for (const k of ['position', 'pcolor', 'size']) {
    const a = pGeo.attributes[k];
    a.clearUpdateRanges();
    if (P.n) a.addUpdateRange(0, P.n * a.itemSize);
    a.needsUpdate = P.n > 0;
  }
  pMat.uniforms.uScale.value = renderer.domElement.height * 0.9;
}

// ---------- anéis / efeitos de chão ----------
const rings = [];
export function spawnRing(x, z, r0, r1, color, dur, opts) {
  opts = opts || {};
  const mesh = new THREE.Mesh(opts.disc ? GEO.disc : GEO.ring, glowMat(color, opts.op || 0.85));
  mesh.position.set(x, 0.08 + gy(x, z) + rings.length * 0.001, z);
  mesh.scale.setScalar(r0);
  mesh.renderOrder = 2;
  world.add(mesh);
  rings.push({ mesh, r0, r1, t: 0, dur, op: opts.op || 0.85, hold: opts.hold });
  return rings[rings.length - 1];
}
export function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const e = 1 - Math.pow(1 - k, 3);
    r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
    r.mesh.material.opacity = r.hold ? r.op * (0.5 + 0.5 * Math.sin(r.t * 12)) : r.op * (1 - k);
    if (k >= 1) { world.remove(r.mesh); r.mesh.material.dispose(); rings.splice(i, 1); }
  }
}

/** Remove todos os efeitos ativos (troca de zona), liberando os materiais dos anéis. */
export function clearEffects() {
  for (const r of rings) { world.remove(r.mesh); r.mesh.material.dispose(); }
  rings.length = 0;
  P.n = 0;
}
