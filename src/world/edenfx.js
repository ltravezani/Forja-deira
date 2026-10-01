// =============================================================================
// Água do Éden: superfície do rio, dos lagos e das poças (correnteza, faixas de
// cor em degraus como o resto do cenário, espuma nas margens e cintilado do sol)
// e as cachoeiras (cortinas que escorrem, espuma e névoa ao pé). Pertence ao
// nível e é liberada com ele.
// =============================================================================
import { CUT, CUT_GLSL } from '../art/cutaway.js';
import { TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';

let FX = null;
const Y = 0.14; // altura da lâmina d'água

const VS = `attribute float shore; varying vec3 vW; varying vec2 vUv; varying float vShore;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vShore = shore;
    vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const WATER_FS = `uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight;
  varying vec3 vW; varying vec2 vUv; varying float vShore;
  ${CUT_GLSL}
  #include <fog_pars_fragment>
  void main() {
    if (cutHidden(vW)) discard;
    vec2 p = vW.xz;
    // correnteza: duas camadas de ondas andando em direções diferentes
    float n1 = sin(p.x * 1.3 + p.y * 0.4 + uTime * 1.6) * sin(p.y * 1.1 - uTime * 1.2 + sin(p.x * 0.5));
    float n2 = sin((p.x + p.y) * 2.7 - uTime * 2.4) * sin((p.x - p.y) * 2.1 + uTime * 1.5);
    float h = 0.5 + n1 * 0.3 + n2 * 0.25;
    float depth = smoothstep(0.0, 1.0, vShore);
    vec3 col = mix(uLight, uDeep, depth * 0.85);
    col = mix(col * 0.8, col * 1.12, floor(clamp(h, 0.0, 1.0) * 3.0 + 0.5) / 3.0);
    // cintilado do sol nas cristas
    float sp = smoothstep(0.9, 0.99, n2 * 0.5 + 0.5 + n1 * 0.1);
    col += vec3(0.9, 0.95, 0.85) * sp * 0.45;
    // espuma nas margens, pulsando com a correnteza
    float foam = (1.0 - smoothstep(0.0, 0.3, vShore)) * (0.5 + 0.5 * sin(uTime * 3.0 + p.x * 3.0 + p.y * 2.3));
    col = mix(col, vec3(0.78, 0.9, 0.86), foam * 0.45);
    gl_FragColor = vec4(col, 0.86 + foam * 0.1 - (1.0 - depth) * 0.12);
    #include <fog_fragment>
  }`;
const FALL_FS = `uniform float uTime; uniform vec3 uLight;
  varying vec3 vW; varying vec2 vUv;
  ${CUT_GLSL}
  #include <fog_pars_fragment>
  void main() {
    if (cutHidden(vW)) discard;
    float streak = sin(vUv.x * 60.0 + sin(vUv.x * 9.0) * 3.0) * 0.5 + 0.5;
    float flow = fract(vUv.y * 1.6 + uTime * 1.9 + sin(vUv.x * 31.0) * 0.4);
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float a = (0.45 + 0.45 * streak * smoothstep(0.0, 0.6, flow)) * edge;
    vec3 col = mix(uLight, vec3(0.95, 1.0, 1.0), streak * 0.55 + (1.0 - vUv.y) * 0.3);
    gl_FragColor = vec4(col, a * 0.85);
    #include <fog_fragment>
  }`;
function mat(fs) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x0a3240) }, uLight: { value: new THREE.Color(0x2a8a86) },
    }]),
    vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  Object.assign(m.uniforms, CUT);
  return m;
}

/** Uma malha para toda a água: um quad por tile, `shore` = quanto do canto está cercado de água. */
function waterGeo(L) {
  const { W, H, water } = L, T2 = TILE / 2;
  const wAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : water[z * W + x]);
  const CELLS = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
  const shoreAt = (cx, cz) => { let n = 0; for (const [dx, dz] of CELLS) n += wAt(cx + dx, cz + dz); return n === 4 ? 1 : n === 3 ? 0.35 : 0; };
  // margem arredondada: quinas convexas recuam para a água, côncavas avançam sobre a terra,
  // e um ruído leve tira a cara de grade das retas
  const cornerPos = (cx, cz) => {
    let n = 0, ax = 0, az = 0;
    for (const [dx, dz] of CELLS) if (wAt(cx + dx, cz + dz)) { n++; ax += dx + 0.5; az += dz + 0.5; }
    let ox = 0, oz = 0;
    if (n === 1) { ox = ax * 1.3; oz = az * 1.3; }
    else if (n === 3) { for (const [dx, dz] of CELLS) if (!wAt(cx + dx, cz + dz)) { ox = (dx + 0.5) * 0.7; oz = (dz + 0.5) * 0.7; } }
    else if (n === 2) { ox = -ax * 0.25; oz = -az * 0.25; }
    if (n < 4) { const h = Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453; const r = h - Math.floor(h); ox += (r - 0.5) * 0.35; oz += (((h * 7.13) % 1 + 1) % 1 - 0.5) * 0.35; }
    return [cx * TILE - T2 + ox * TILE * 0.5, cz * TILE - T2 + oz * TILE * 0.5];
  };
  const pos = [], sh = [], uv = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!wAt(x, z)) continue;
    const cs = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
    for (const ci of [0, 3, 2, 0, 2, 1]) {
      const [cx, cz] = cs[ci], [px, pz] = cornerPos(cx, cz);
      pos.push(px, Y, pz); sh.push(shoreAt(cx, cz)); uv.push(cx, cz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('shore', new THREE.BufferAttribute(new Float32Array(sh), 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeBoundingSphere();
  return g;
}

export function buildEdenFx(L, add) {
  clearEdenFx();
  FX = { mats: [], falls: [], t: 0 };
  if (L.water && L.water.some((w) => w)) {
    const m = mat(WATER_FS);
    const mesh = new THREE.Mesh(waterGeo(L), m);
    mesh.renderOrder = 2; mesh.receiveShadow = true;
    add(mesh); FX.mats.push(m);
  }
  for (const f of L.falls || []) {
    const w = f.w * 1.3, top = 4.7, x = f.x * TILE, z = f.z * TILE + TILE / 2 + 0.15;
    const m = mat(FALL_FS);
    // cortina levemente curva para a frente no alto (a água sai da borda de pedra)
    const g = new THREE.PlaneGeometry(w, top, 8, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / top + 0.5; p.setZ(i, Math.pow(y, 3) * 0.6 + (1 - y) * 0.35); }
    g.translate(0, top / 2, 0);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 0, z);
    mesh.renderOrder = 3;
    add(mesh); FX.mats.push(m);
    FX.falls.push({ x, z: z + 0.6, w, acc: 0 });
  }
}
export function clearEdenFx() { FX = null; }
/** Anima a água e solta espuma e névoa ao pé das cachoeiras próximas. */
export function updateEdenFx(px, pz, t, dt) {
  if (!FX) return;
  for (const m of FX.mats) m.uniforms.uTime.value = t;
  for (const f of FX.falls) {
    if ((f.x - px) ** 2 + (f.z - pz) ** 2 > 30 * 30) continue;
    f.acc += dt * 14;
    while (f.acc >= 1) {
      f.acc -= 1;
      const r = Math.random();
      emit(f.x + (Math.random() - 0.5) * f.w * 0.8, 0.25, f.z + Math.random() * 0.8, r < 0.6
        ? { n: 1, color: 0xe8fff8, speed: 1.4, up: 2.2, life: 0.6, size: 0.35, grav: 5, spread: 0.6, alpha: 0.8 }
        : { n: 1, color: 0xc8f0e8, speed: 0.4, up: 0.6, life: 2.2, size: 1.4, grav: -0.05, drag: 1, alpha: 0.35 });
    }
  }
}
