// ---------- asas do herói ----------
// Dois estilos: penas (camadas de penas com textura de haste e barbas) e
// membrana (dragão: dedos de osso e membrana recortada). A asa normal é
// pequena e simples; a asa evoluída no Ferreiro (stage 1) é bem maior, ganha
// mais penas, segunda fileira de coberteiras, ossos dourados, joia nas costas
// e faíscas. O +nível de refino (+10 em diante) faz as penas pulsarem na cor
// do refino, como o resto do equipamento.
import { GEO, part, pivot } from './geometry.js';
import { glowMat, toonOwn } from './materials.js';
import { refineColor, refineK, sparkles } from './items.js';
import { texDetail } from './textures.js';
import { renderer } from '../engine/renderer.js';

const WHITE = new THREE.Color(0xffffff);

// ---------- textura de pena (canvas, tingida pela cor do material) ----------
const _featherTex = {};
function featherTexture(fancy) {
  const key = fancy ? 'f' : 'n';
  if (_featherTex[key]) return _featherTex[key];
  const W = 64, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // contorno da pena: estreita na base, larga no meio, ponta arredondada (um lado mais largo)
  const vane = new Path2D();
  vane.moveTo(W / 2, 0);
  vane.bezierCurveTo(W * 0.62, H * 0.18, W * 0.98, H * 0.45, W * 0.9, H * 0.82);
  vane.quadraticCurveTo(W * 0.8, H, W * 0.5, H);
  vane.quadraticCurveTo(W * 0.16, H * 0.97, W * 0.12, H * 0.8);
  vane.bezierCurveTo(W * 0.06, H * 0.5, W * 0.36, H * 0.2, W / 2, 0);
  g.save();
  g.clip(vane);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.45, '#e2e2e2'); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // barbas: riscos diagonais saindo da haste em direção à ponta
  g.strokeStyle = 'rgba(40,40,60,0.28)'; g.lineWidth = 1.2;
  for (let y = 18; y < H; y += 7) {
    g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W * 0.3, y + 8, 0, y + 22); g.stroke();
    g.beginPath(); g.moveTo(W / 2, y + 3); g.quadraticCurveTo(W * 0.72, y + 11, W, y + 25); g.stroke();
  }
  if (fancy) {
    // pena evoluída: borda clara, faixa escura perto da ponta e "olho" brilhante
    g.fillStyle = 'rgba(30,20,50,0.45)'; g.fillRect(0, H * 0.72, W, H * 0.07);
    const eye = g.createRadialGradient(W / 2, H * 0.88, 2, W / 2, H * 0.88, W * 0.3);
    eye.addColorStop(0, '#ffffff'); eye.addColorStop(0.45, 'rgba(120,110,160,0.9)'); eye.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = eye; g.fillRect(0, H * 0.74, W, H * 0.26);
  }
  g.restore();
  g.lineWidth = fancy ? 5 : 3; g.strokeStyle = fancy ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
  g.stroke(vane);
  // haste
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(W / 2, 0); g.quadraticCurveTo(W * 0.47, H * 0.6, W * 0.5, H * 0.96); g.stroke();
  // pequenos cortes na borda (pena de verdade não é lisa)
  g.globalCompositeOperation = 'destination-out';
  for (const [x, y, s] of [[0.14, 0.62, 1], [0.9, 0.55, -1], [0.86, 0.74, -1]]) {
    g.beginPath(); g.moveTo(x * W, y * H); g.lineTo(x * W + s * 9, y * H + 4); g.lineTo(x * W, y * H + 10); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _featherTex[key] = t;
  return t;
}

// ---------- geometria: penas fundidas por fileira (1 chamada de desenho por fileira) ----------
// Pena base: plano de 1×1 da raiz (y=0) até a ponta (y=-1), curvada para trás.
const FEATHER = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 5);
  g.translate(0, -0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = -p.getY(i); p.setZ(i, -0.12 * v * v); }
  g.computeVertexNormals();
  return g;
})();
const _geoCache = new Map();
/** Junta penas {x, y, z, rot, len, w} numa geometria só (cacheada por chave; compartilhada entre modelos). */
function featherRow(key, list) {
  let g = _geoCache.get(key);
  if (g) return g;
  const P = FEATHER.attributes.position, N = FEATHER.attributes.normal, U = FEATHER.attributes.uv, I = FEATHER.index;
  const pos = [], nor = [], uv = [], idx = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  list.forEach((f, k) => {
    e.set(f.tilt || 0, 0, f.rot);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(f.w, f.len, f.len));
    nm.getNormalMatrix(m);
    const base = k * P.count;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      uv.push(U.getX(i), U.getY(i));
    }
    for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
  });
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  _geoCache.set(key, g);
  return g;
}

/** Leque de n penas ao longo de um segmento: posições, ângulos (rad, 0 = para baixo) e comprimentos interpolados. */
function fan(n, x0, x1, r0, r1, l0, l1, w, z, dz) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push({ x: x0 + (x1 - x0) * t, y: 0, z: z + i * dz, rot: r0 + (r1 - r0) * t, len: l0 + (l1 - l0) * t, w });
  }
  return out;
}

// Ângulos dos dois segmentos do "braço" da asa (ombro e punho)
const A1 = 0.72, A2 = -0.38, L1 = 0.6, L2 = 0.7;

function featherWing(side, o, M) {
  const up = o.stage >= 1, S = up ? 'u' : 'n';
  const inner = pivot(side, 0, 0, 0);
  const R1 = up ? 0.88 : A1; // a evoluída se ergue mais
  inner.rotation.z = R1;
  const outer = pivot(inner, L1, 0, 0);
  outer.rotation.z = A2;
  // osso do braço (cone afinando para fora)
  part(GEO.cone, M.bone, 0.07, L1 + 0.04, 0.07, L1 / 2, 0, 0, inner, false).rotation.z = -Math.PI / 2;
  part(GEO.cone, M.bone, 0.05, L2, 0.05, L2 / 2, 0, 0, outer, false).rotation.z = -Math.PI / 2;
  const row = (seg, key, list, mat) => { const mh = new THREE.Mesh(featherRow(key, list), mat); seg.add(mh); return mh; };
  // ângulos no espaço do segmento: rot = ângulo no mundo − rotação acumulada do segmento
  const a1 = R1, a12 = R1 + A2, k = up ? 1.12 : 1;
  // rêmiges secundárias (braço) e primárias (mão)
  row(inner, 'sec' + S, fan(up ? 6 : 5, 0.06, 0.6, -0.3 - a1, 0.12 - a1, 0.5 * k, 0.66 * k, 0.36, 0, 0.012), M.main);
  row(outer, 'pri' + S, fan(up ? 7 : 6, 0.02, 0.66, 0.3 - a12, 1.38 - a12, 0.72 * k, 1.05 * k, 0.32, 0.006, 0.012), M.main);
  // coberteiras (mais curtas e claras, por cima)
  row(inner, 'cov' + S, fan(up ? 6 : 5, 0.02, 0.6, -0.4 - a1, 0.1 - a1, 0.3 * k, 0.36 * k, 0.38, 0.05, 0.006), M.cover);
  row(outer, 'covo' + S, fan(up ? 6 : 5, 0, 0.6, 0.25 - a12, 1.25 - a12, 0.34 * k, 0.46 * k, 0.34, 0.05, 0.006), M.cover);
  if (up) {
    // segunda fileira de coberteiras, penas do ombro e enfeites dourados
    row(inner, 'cov2u', fan(6, 0, 0.58, -0.5 - a1, 0.05 - a1, 0.17, 0.22, 0.4, 0.09, 0.004), M.cover2);
    row(outer, 'cov2ou', fan(5, 0, 0.5, 0.2 - a12, 1.1 - a12, 0.2, 0.26, 0.36, 0.09, 0.004), M.cover2);
    row(inner, 'scapu', fan(3, -0.02, 0.1, -0.9 - a1, -0.55 - a1, 0.38, 0.46, 0.34, 0.02, 0.01), M.main);
    part(GEO.cone4, M.bone, 0.07, 0.16, 0.07, L2 + 0.06, 0, 0, outer, false).rotation.z = -Math.PI / 2; // ponta da mão
    part(GEO.sphS, M.bone, 0.1, 0.1, 0.1, 0, 0, 0, outer, false); // punho
  }
  return { inner, outer, rest: R1 };
}

function membraneGeometry(up) {
  const key = 'mem' + (up ? 'u' : 'n');
  let g = _geoCache.get(key);
  if (g) return g;
  const E = [0.55, 0.32];
  const tips = up ? [[1.62, 0.66], [1.55, -0.1], [1.18, -0.66], [0.66, -0.8]] : [[1.4, 0.55], [1.25, -0.25], [0.8, -0.6]];
  const body = up ? [0.08, -0.55] : [0.08, -0.45];
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(E[0], E[1]); s.lineTo(tips[0][0], tips[0][1]);
  const pts = tips.concat([body]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    // borda recortada: cada vão entre dedos curva para dentro, na direção do punho
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    s.quadraticCurveTo(mx + (E[0] - mx) * 0.28, my + (E[1] - my) * 0.28, b[0], b[1]);
  }
  s.lineTo(0, 0);
  g = new THREE.ShapeGeometry(s, 12);
  // UV normalizado (a textura de membrana cobre a asa inteira)
  g.computeBoundingBox();
  const bb = g.boundingBox, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (uv.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  g.userData.shared = true;
  g.userData.E = E; g.userData.tips = tips;
  _geoCache.set(key, g);
  return g;
}
/** Osso entre dois pontos do plano da asa. */
function bone(parent, mat, a, b, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const m = part(GEO.cone, mat, r, L, r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.01, parent, false);
  m.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
  return m;
}
function membraneWing(side, o, M) {
  const up = o.stage >= 1;
  const inner = pivot(side, 0, 0, 0);
  const geo = membraneGeometry(up);
  inner.add(new THREE.Mesh(geo, M.main));
  const E = geo.userData.E;
  bone(inner, M.bone, [0, 0], E, 0.08);
  for (const t of geo.userData.tips) bone(inner, M.bone, E, t, up ? 0.045 : 0.04);
  // garra no punho
  const claw = part(GEO.cone4, M.bone, 0.06, 0.18, 0.06, E[0] + 0.02, E[1] + 0.09, 0.01, inner, false);
  claw.rotation.z = -0.3;
  if (up) {
    // espinhos ao longo do braço e veias de energia
    for (let i = 1; i <= 3; i++) {
      const sp = part(GEO.cone4, M.bone, 0.045, 0.14, 0.045, E[0] * i / 4, E[1] * i / 4 + 0.07, 0.01, inner, false);
      sp.rotation.z = 0.5;
    }
    for (const t of geo.userData.tips) bone(inner, M.glow, E, [(E[0] + t[0]) / 2 + 0.02, (E[1] + t[1]) / 2 - 0.08], 0.025);
  }
  return { inner, outer: null, rest: 0.1 };
}

/**
 * Prende um par de asas nas costas do modelo.
 * o: {color, stage (0 normal, 1 evoluída), tier, plus, style ('feather'|'membrane')}
 * Devolve o grupo; o modelo ganha model.wingRig para a animação.
 */
export function attachWings(model, o) {
  const up = o.stage >= 1;
  const style = o.style || 'feather';
  // entre as escápulas: no humanoide animado o osso do peito fica na altura do peito;
  // no procedural o tronco começa na cintura
  const gl = model.kind === 'gltf';
  const holder = pivot(model.torso || model.body, 0, gl ? 0.08 : 0.5, gl ? -0.2 : -0.26);
  holder.rotation.x = -0.22; // pontas inclinadas para trás, longe da cabeça
  const size = (up ? 0.86 : 0.56) + (o.tier || 0) * (up ? 0.035 : 0.025);
  holder.scale.setScalar(size);
  const col = new THREE.Color(o.color);
  const fancy = up && style === 'feather';
  const tex = style === 'feather' ? featherTexture(fancy) : null;
  const mk = (c, ei, op) => {
    const m = toonOwn(c.getHex(), c.getHex(), ei, style === 'membrane' ? { side: THREE.DoubleSide, rim: 0.6, map: texDetail('membrane'), rough: 0.8 } : { side: THREE.DoubleSide, rim: 0.55 });
    if (tex) { m.map = tex; m.alphaTest = 0.5; }
    if (op) { m.transparent = true; m.opacity = op; }
    m.needsUpdate = true;
    return m;
  };
  const M = {
    main: mk(col.clone(), up ? 0.32 : 0.18, style === 'membrane' && !up ? 0.92 : 0),
    cover: mk(col.clone().lerp(WHITE, up ? 0.35 : 0.2), up ? 0.36 : 0.2),
    cover2: mk(col.clone().lerp(WHITE, 0.6), 0.4),
    bone: up ? toonOwn(0xd8b45a, 0x6a4a10, 0.4, { metal: 0.85, rough: 0.35 }) : toonOwn(col.clone().multiplyScalar(0.45).getHex(), 0, 0, { rough: 0.7 }),
    glow: glowMat(col.clone().lerp(WHITE, 0.4).getHex(), 0.85),
  };
  const sides = [];
  for (const sx of [-1, 1]) {
    const side = pivot(holder, sx * 0.1, 0, 0);
    side.scale.x = sx; // asa esquerda espelhada
    const sweep = pivot(side, 0, 0, 0);
    const w = style === 'membrane' ? membraneWing(sweep, o, M) : featherWing(sweep, o, M);
    sides.push({ sweep, ...w });
  }
  // asa evoluída: joia entre as asas e faíscas descendo pelas penas
  let gem = null, pts = [];
  if (up) {
    part(GEO.box, M.bone, 0.26, 0.18, 0.06, 0, 0, 0.02, holder, false);
    gem = part(GEO.oct, M.glow, 0.17, 0.24, 0.17, 0, 0.01, -0.04, holder, false);
    for (const s of sides) {
      const box = new THREE.Box3(new THREE.Vector3(0.1, -0.9, -0.1), new THREE.Vector3(1.6, 0.6, 0.1));
      pts.push(sparkles(s.sweep, box, 16, col.clone().lerp(WHITE, 0.5).getHex(), 0.5, 0.14));
    }
  }
  // refino +10..+15: as penas pulsam na cor do refino e soltam mais faíscas
  const rk = refineK(o.plus || 0);
  const rc = rk ? new THREE.Color(refineColor(o.plus)) : null;
  if (rk) for (const s of sides) pts.push(sparkles(s.sweep, new THREE.Box3(new THREE.Vector3(0.1, -0.8, -0.1), new THREE.Vector3(1.4, 0.5, 0.1)), Math.round(6 + rk * 18), refineColor(o.plus), rk, 0.1 + rk * 0.06));
  const flapMats = [M.main, M.cover, M.cover2];
  const baseEI = flapMats.map((m) => m.emissiveIntensity);
  model.wingRig = {
    holder,
    update(t, moving) {
      // idle: respira devagar; andando: bate mais rápido e mais aberto
      const sp = moving ? 6.5 : up ? 1.8 : 2.2, amp = moving ? 0.28 : up ? 0.14 : 0.1;
      const f = Math.sin(t * sp);
      for (const s of sides) {
        s.sweep.rotation.y = 0.55 - f * amp;
        s.inner.rotation.z = s.rest + Math.sin(t * sp + 0.4) * amp * 0.4;
        if (s.outer) s.outer.rotation.z = A2 + Math.sin(t * sp - 0.7) * amp * 0.6;
      }
      if (gem) { gem.rotation.y = t * 1.6; gem.material.opacity = 0.7 + 0.25 * Math.sin(t * 3); }
      if (rk) {
        const k = rk * (0.18 + 0.14 * Math.sin(t * 3));
        flapMats.forEach((m, i) => { m.emissive.copy(col).lerp(rc, 0.25 + rk * 0.35); m.emissiveIntensity = baseEI[i] + k; });
      }
      for (const p of pts) { p.material.uniforms.uTime.value = t; p.material.uniforms.uScale.value = renderer.domElement.height * 0.9; }
    },
  };
  model.wingRig.update(0, false);
  return holder;
}
