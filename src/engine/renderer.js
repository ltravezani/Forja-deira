// ---------- renderer, cena, luzes e câmera ----------
import { CONFIG } from '../core/config.js';
import { $, V3 } from '../core/util.js';
import { gy } from '../world/grid.js';

export const canvas = $('#view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
const CC = CONFIG.camera;
export const camera = new THREE.PerspectiveCamera(CC.fov, 1, CC.near, CC.far);
/** Estado da câmera orbital (yaw/pitch em radianos, zoom relativo, tremor atual). */
export const CAM = { dist: CC.dist, zoom: 1, yaw: CC.yaw, pitch: CC.pitch, shake: 0 };
export const camTarget = new V3();

export const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a2a1a, 1.1);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 100 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
export const heroLight = new THREE.PointLight(0xffc88a, 55, 18, 1.5);
scene.add(heroLight);
/** Orçamento fixo de luzes de tocha, reaproveitadas pelas tochas mais próximas do herói. */
export const torchLights = [];
for (let i = 0; i < 6; i++) {
  const l = new THREE.PointLight(0xff9a40, 0, 12, 1.6);
  scene.add(l);
  torchLights.push(l);
}

/** Grupo com tudo que pertence ao nível atual (limpo a cada troca de zona). */
export const world = new THREE.Group();
scene.add(world);

let quality = 'media';
/** Fração de partículas emitidas no nível de qualidade atual. */
export function particleScale() { return CONFIG.quality[quality].particles; }
export function applyQuality(q) {
  if (!CONFIG.quality[q]) q = 'media';
  quality = q;
  const Q = CONFIG.quality[q];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  renderer.shadowMap.enabled = Q.shadows;
  post.samples = Q.msaa;
  if (post.rt) { post.rt.dispose(); post.rt = null; }
  sun.castShadow = Q.shadows;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
export function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  renderer.setSize(w, h, false);
  resizePost();
  camera.aspect = w / h;
  // em telas estreitas afasta a câmera para manter o campo de visão útil
  CAM.dist = w < CC.narrowWidth ? CC.distNarrow : CC.dist;
  camera.updateProjectionMatrix();
}

/** Soma tremor de tela (0–1+), já escalado pela preferência do jogador. Não acumula além do maior pedido. */
export function shake(amount) {
  CAM.shake = Math.max(CAM.shake, amount * CONFIG.feel.shake);
}
export function resetCamera() {
  CAM.yaw = CC.yaw; CAM.pitch = CC.pitch; CAM.zoom = 1;
}

const _off = new V3();
export function updateCamera(x, z, dt) {
  const k = Math.min(1, dt * CC.follow);
  camTarget.x += (x - camTarget.x) * k;
  camTarget.z += (z - camTarget.z) * k;
  const d = CAM.dist * CAM.zoom, cp = Math.cos(CAM.pitch);
  _off.set(Math.sin(CAM.yaw) * cp * d, Math.sin(CAM.pitch) * d, Math.cos(CAM.yaw) * cp * d);
  let sx = 0, sz = 0;
  if (CAM.shake > 0) {
    CAM.shake = Math.max(0, CAM.shake - dt * 2.5);
    sx = (Math.random() - 0.5) * CAM.shake; sz = (Math.random() - 0.5) * CAM.shake;
  }
  const ty = gy(camTarget.x, camTarget.z);
  camTarget.y += (ty - camTarget.y) * Math.min(1, dt * 6);
  camera.position.set(camTarget.x + _off.x + sx, camTarget.y + _off.y, camTarget.z + _off.z + sz);
  camera.lookAt(camTarget.x + sx, camTarget.y + 0.8, camTarget.z + sz);
  sun.position.set(camTarget.x - 14, 34, camTarget.z + 10);
  sun.target.position.set(camTarget.x, 0, camTarget.z);
}

// =============================================================================
// Passe final: contorno "nanquim" a partir da profundidade. A cena é desenhada
// num alvo intermediário (HDR quando possível) e um quad de tela aplica o
// contorno, o tone mapping e a conversão para sRGB. O contorno é o que une
// personagens, adereços e paredes no mesmo traço de desenho animado.
// =============================================================================
const post = { rt: null, samples: 4, on: true, size: new THREE.Vector2() };
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 1 },
    uNear: { value: CC.near }, uFar: { value: CC.far }, uFade: { value: new THREE.Vector2(58, 95) },
    uInk: { value: CONFIG.style.ink }, uEdge: { value: new THREE.Vector2(CONFIG.style.edge0, CONFIG.style.edge1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform vec2 uTexel; uniform float uWidth; uniform float uNear; uniform float uFar; uniform vec2 uFade;
    uniform float uInk; uniform vec2 uEdge;
    varying vec2 vUv;
    float lin(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
    void main() {
      vec4 c = texture2D(tColor, vUv);
      vec2 o = uTexel * uWidth;
      float z = lin(vUv);
      float l = lin(vUv - vec2(o.x, 0.0)), r = lin(vUv + vec2(o.x, 0.0));
      float d = lin(vUv - vec2(0.0, o.y)), u = lin(vUv + vec2(0.0, o.y));
      // laplaciano relativo: rampas (chão inclinado na tela) somem, degraus e silhuetas ficam
      float lap = (abs(l + r - 2.0 * z) + abs(u + d - 2.0 * z)) / z;
      float e = smoothstep(uEdge.x, uEdge.y, lap) * (1.0 - smoothstep(uFade.x, uFade.y, min(z, min(min(l, r), min(u, d)))));
      c.rgb = mix(c.rgb, c.rgb * uInk, e);
      gl_FragColor = vec4(c.rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);

function colorType() {
  const ex = renderer.extensions;
  return ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
}
function resizePost() {
  renderer.getDrawingBufferSize(post.size);
  const w = Math.max(1, post.size.x), h = Math.max(1, post.size.y);
  if (!post.rt) {
    post.rt = new THREE.WebGLRenderTarget(w, h, { type: colorType(), samples: post.samples, depthBuffer: true });
    post.rt.depthTexture = new THREE.DepthTexture(w, h);
    post.rt.depthTexture.type = THREE.UnsignedIntType;
  } else post.rt.setSize(w, h);
  postMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  postMat.uniforms.uWidth.value = Math.max(1, renderer.getPixelRatio() * CONFIG.style.lineWidth);
}
/** Desenha um quadro: cena → alvo intermediário → contorno + tone mapping na tela. */
export function renderFrame() {
  if (!post.on) { renderer.render(scene, camera); return; }
  if (!post.rt) resizePost();
  renderer.setRenderTarget(post.rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  postMat.uniforms.tColor.value = post.rt.texture;
  postMat.uniforms.tDepth.value = post.rt.depthTexture;
  postMat.uniforms.uNear.value = camera.near; postMat.uniforms.uFar.value = camera.far;
  if (scene.fog) postMat.uniforms.uFade.value.set(scene.fog.near + 20, scene.fog.far + 10);
  renderer.render(postScene, postCam);
}
/** Liga/desliga o contorno (opção de acessibilidade/desempenho). */
export function setOutline(on) { post.on = !!on; }
