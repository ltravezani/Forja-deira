// =============================================================================
// Efeitos da cidade: água da fonte (superfícies com ondulação, cortinas que
// escorrem das taças, jatos das carrancas e respingos), fumaça das chaminés e
// vaga-lumes nos gramados. Tudo pertence ao nível e é liberado com ele.
// =============================================================================
import { CUT, CUT_GLSL } from '../art/cutaway.js';
import { TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';

let FX = null;

// ---------- água ----------
const WATER_VS = `varying vec3 vW; varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const WATER_FS = `uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight; uniform vec2 uC; uniform float uFoamR; uniform float uOp;
  varying vec3 vW; varying vec2 vUv;
  ${CUT_GLSL}
  #include <fog_pars_fragment>
  void main() {
    if (cutHidden(vW)) discard;
    vec2 d = vW.xz - uC; float r = length(d);
    float rip = sin(r * 7.0 - uTime * 2.6) * 0.5 + 0.5;
    float n1 = sin(vW.x * 3.1 + uTime * 1.3) * sin(vW.z * 2.7 - uTime * 1.1);
    float n2 = sin((vW.x + vW.z) * 5.3 - uTime * 2.0) * sin((vW.x - vW.z) * 4.1 + uTime * 1.7);
    float h = rip * 0.35 + n1 * 0.3 + n2 * 0.35;
    vec3 col = mix(uDeep, uLight, clamp(0.35 + 0.45 * h, 0.0, 1.0));
    // cintilado do luar e dos lampiões nas cristas
    float sp = smoothstep(0.86, 0.99, n2 * 0.5 + 0.5 + rip * 0.12 + n1 * 0.08);
    col += vec3(0.8, 0.9, 1.0) * sp * 0.8;
    // espuma onde a cortina de água cai
    float foam = smoothstep(0.32, 0.0, abs(r - uFoamR)) * (0.55 + 0.45 * sin(uTime * 7.0 + atan(d.y, d.x) * 11.0 + r * 9.0));
    col = mix(col, vec3(0.88, 0.95, 1.0), foam * 0.55);
    gl_FragColor = vec4(col, uOp + foam * 0.15);
    #include <fog_fragment>
  }`;
const CURTAIN_FS = `uniform float uTime; uniform vec3 uLight;
  varying vec3 vW; varying vec2 vUv;
  ${CUT_GLSL}
  #include <fog_pars_fragment>
  void main() {
    if (cutHidden(vW)) discard;
    float streak = sin(vUv.x * 90.0 + sin(vUv.x * 13.0) * 3.0) * 0.5 + 0.5;
    float flow = fract(vUv.y * 2.5 + uTime * 1.7 + sin(vUv.x * 41.0) * 0.35);
    float a = (0.18 + 0.5 * streak * smoothstep(0.0, 0.55, flow)) * smoothstep(0.0, 0.12, vUv.y) * (0.6 + 0.4 * smoothstep(1.0, 0.7, vUv.y));
    vec3 col = mix(uLight, vec3(0.92, 0.97, 1.0), streak * 0.6);
    gl_FragColor = vec4(col, a * 0.75);
    #include <fog_fragment>
  }`;
function waterMat(fs, extra) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x10364e) }, uLight: { value: new THREE.Color(0x4aa0c8) },
      uC: { value: new THREE.Vector2() }, uFoamR: { value: 0 }, uOp: { value: 0.84 },
    }, extra || {}]),
    vertexShader: WATER_VS, fragmentShader: fs, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  // uniformes do recorte de visão compartilhados (mesmo objeto, atualizado a cada quadro)
  Object.assign(m.uniforms, CUT);
  return m;
}
/** Chafariz: três superfícies de água, duas cortinas e os pontos de onde saem os jatos. */
function buildFountain(fx, add, wx, wz) {
  const surf = (geo, y, foamR, op) => {
    const m = waterMat(WATER_FS);
    m.uniforms.uC.value.set(wx, wz); m.uniforms.uFoamR.value = foamR; m.uniforms.uOp.value = op;
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(wx, y, wz);
    mesh.renderOrder = 2;
    add(mesh); fx.mats.push(m);
  };
  const disc = (r, seg) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
  surf(disc(2.42, 8), 0.72, 1.62, 0.84);
  surf(disc(1.24, 24), 1.9, 0.82, 0.8);
  surf(disc(0.62, 16), 2.86, 0, 0.78);
  const curtain = (rTop, rBot, yTop, yBot) => {
    const m = waterMat(CURTAIN_FS);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, yTop - yBot, 32, 1, true), m);
    mesh.position.set(wx, (yTop + yBot) / 2, wz);
    mesh.renderOrder = 3;
    add(mesh); fx.mats.push(m);
  };
  curtain(1.46, 1.62, 1.94, 0.74);
  curtain(0.74, 0.84, 2.9, 1.91);
  fx.fountain = { x: wx, z: wz };
}

// ---------- fumaça das chaminés (Points com mistura normal: fumaça não brilha) ----------
const SMOKE_MAX = 160;
let _smokeTex = null;
function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 5; i++) { // bolas sobrepostas: contorno de nuvem, não um círculo liso
    const x = 32 + Math.cos(i * 1.3) * 9, y = 32 + Math.sin(i * 1.3) * 8, r = 18 + (i % 2) * 5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  _smokeTex = new THREE.CanvasTexture(c);
  _smokeTex.userData = { shared: true };
  return _smokeTex;
}
function buildSmoke(fx, add, chimneys) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SMOKE_MAX * 3), size = new Float32Array(SMOKE_MAX), alpha = new Float32Array(SMOKE_MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: smokeTexture() }, uScale: { value: 500 }, uCol: { value: new THREE.Color(0x8a8e9e) } },
    vertexShader: 'attribute float size; attribute float alpha; varying float vA; uniform float uScale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uMap; uniform vec3 uCol; varying float vA; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uCol, t.a * vA); }',
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  add(pts);
  fx.smoke = { pts, pos, size, alpha, p: [], chimneys, acc: chimneys.map((_, i) => i * 0.37) };
}
function updateSmoke(S, dt, h) {
  S.pts.material.uniforms.uScale.value = h * 0.9;
  S.chimneys.forEach((c, i) => {
    S.acc[i] += dt;
    if (S.acc[i] > 0.55 && S.p.length < SMOKE_MAX) { S.acc[i] = Math.random() * 0.2; S.p.push({ x: c.x, y: c.y, z: c.z, vx: 0.25 + Math.random() * 0.2, vz: 0.1 + Math.random() * 0.15, vy: 0.7 + Math.random() * 0.3, age: 0, life: 5 + Math.random() * 2, s: 0.9 + Math.random() * 0.4 }); }
  });
  let n = 0;
  for (let i = S.p.length - 1; i >= 0; i--) {
    const p = S.p[i];
    p.age += dt;
    if (p.age >= p.life) { S.p.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - dt * 0.15;
    const k = p.age / p.life;
    S.pos[n * 3] = p.x; S.pos[n * 3 + 1] = p.y; S.pos[n * 3 + 2] = p.z;
    S.size[n] = p.s * (1 + k * 3.2);
    S.alpha[n] = Math.min(1, p.age * 3) * (1 - k) * 0.7;
    n++;
  }
  const g = S.pts.geometry;
  g.setDrawRange(0, n);
  g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
}

/**
 * Monta os efeitos da cidade. `add` põe a malha no nível (liberada na troca de zona).
 * houses: [{x, z, ry}] em mundo; grassSpots: tiles de grama para vaga-lumes.
 */
export function buildTownFx(L, add) {
  FX = { mats: [], fountain: null, smoke: null, grass: [], jetAcc: 0 };
  const T = TILE;
  const f = L.props.find((p) => p.kind === 'fountain');
  if (f) buildFountain(FX, add, f.x * T, f.z * T);
  // chaminés: kit da casa tem a chaminé em (Lx*0.3, topo, -0.8) no espaço local
  const chimneys = L.props.filter((p) => p.kind === 'house').map((p) => {
    const ry = p.r ? Math.PI / 2 : 0, lx = 9.6 * 0.3, lz = -0.8;
    return { x: p.x * T + lx * Math.cos(ry) + lz * Math.sin(ry), y: 7.1, z: p.z * T - lx * Math.sin(ry) + lz * Math.cos(ry) };
  });
  buildSmoke(FX, add, chimneys);
  for (let z = 1; z < L.H - 1; z++) for (let x = 1; x < L.W - 1; x++) if (L.grid[z * L.W + x] === 1 && !L.isPath(x, z)) FX.grass.push(x * T, z * T);
}
export function clearTownFx() { FX = null; }

/** Anima água, jatos, respingos, fumaça e vaga-lumes perto do herói. */
export function updateTownFx(px, pz, t, dt, screenH) {
  if (!FX) return;
  for (const m of FX.mats) m.uniforms.uTime.value = t;
  if (FX.smoke) updateSmoke(FX.smoke, dt, screenH);
  const F = FX.fountain;
  if (F && (F.x - px) ** 2 + (F.z - pz) ** 2 < 34 * 34) {
    FX.jetAcc += dt * 26;
    while (FX.jetAcc >= 1) {
      FX.jetAcc -= 1;
      // jatos das quatro carrancas, em arco até a bacia
      const i = Math.floor(Math.random() * 4), a = i * Math.PI / 2 + Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a);
      emit(F.x + sx * 0.66, 1.0, F.z + sz * 0.66, { n: 1, color: 0xbfe4ff, dir: [sx * 0.62, 0.55, sz * 0.62], speed: 3.1, life: 0.55, size: 0.34, grav: -9, drag: 0, spread: 0.04, spreadY: 0.02, alpha: 0.75 });
      // repuxo no topo, caindo na taça pequena
      if (Math.random() < 0.6) emit(F.x, 3.7, F.z, { n: 1, color: 0xd8f0ff, speed: 1.1, up: 3.2, life: 0.7, size: 0.3, grav: -7, drag: 0.4, spread: 0.05, alpha: 0.7 });
      // respingos onde as cortinas batem
      if (Math.random() < 0.7) { const b = Math.random() * Math.PI * 2, r = Math.random() < 0.6 ? 1.62 : 0.84, y = r > 1 ? 0.74 : 1.92; emit(F.x + Math.cos(b) * r, y, F.z + Math.sin(b) * r, { n: 1, color: 0xe0f4ff, speed: 0.9, up: 1.6, life: 0.35, size: 0.26, grav: -6, drag: 1, spread: 0.1, alpha: 0.6 }); }
    }
    // névoa fina subindo da bacia
    if (Math.random() < dt * 3) emit(F.x + (Math.random() - 0.5) * 3, 1.0, F.z + (Math.random() - 0.5) * 3, { n: 1, color: 0x6a8ab0, speed: 0.2, up: 0.4, life: 2.5, size: 1.6, grav: 0.1, drag: 0.5, alpha: 0.18 });
  }
  // vaga-lumes nos gramados perto do herói
  const G_ = FX.grass;
  if (G_.length && Math.random() < dt * 9) {
    for (let tries = 0; tries < 6; tries++) {
      const k = Math.floor(Math.random() * (G_.length / 2)) * 2, x = G_[k], z = G_[k + 1];
      if ((x - px) ** 2 + (z - pz) ** 2 > 22 * 22) continue;
      emit(x + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.6, z + (Math.random() - 0.5) * 2, { n: 1, color: Math.random() < 0.7 ? 0xd8ff6a : 0xfff08a, speed: 0.35, up: 0.35, life: 3.2, size: 0.34, grav: 0.02, drag: 0.3, alpha: 0.9 });
      break;
    }
  }
}
