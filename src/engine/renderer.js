// ---------- renderer, cena, luzes e câmera ----------
import { CONFIG } from '../core/config.js';
import { $, V3 } from '../core/util.js';
import { setTexAnisotropy } from '../art/textures.js';
import { gy } from '../world/grid.js';

export const canvas = $('#view');
// sem antialias no canvas: ele só recebe o quadro pronto do passe final; o MSAA de verdade fica no alvo da cena
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
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
/**
 * Luzes pontuais reaproveitáveis: as tochas mais próximas do herói e os clarões de habilidade
 * (engine/skillfx.js) dividem o mesmo conjunto. Quantas ficam ligadas no shader depende da
 * qualidade (CONFIG.quality[q].lights, contando a do herói); as outras ficam invisíveis, e luzes
 * invisíveis não entram na conta de cada pixel. Uma luz com `userData.busy` está num clarão.
 */
export const torchLights = [];
for (let i = 0; i < 8; i++) {
  const l = new THREE.PointLight(0xff9a40, 0, 12, 1.6);
  scene.add(l);
  torchLights.push(l);
}
let poolOn = torchLights.length;
/** Quantas luzes do conjunto estão ativas na qualidade atual. */
export function activeLights() { return poolOn; }

/** Grupo com tudo que pertence ao nível atual (limpo a cada troca de zona). */
export const world = new THREE.Group();
scene.add(world);

let quality = 'media';
/** Fração de partículas emitidas no nível de qualidade atual. */
export function particleScale() { return CONFIG.quality[quality].particles; }
/** Qualidade em uso (já resolvida). */
export function currentQuality() { return quality; }
/**
 * Aplica a qualidade. Só o que mudou é refeito: o tipo de sombra e ligar/desligar sombras
 * recompilam os materiais da cena; o número de luzes recompila sozinho (estado das luzes do
 * Three.js); MSAA recria o alvo da cena; desligar o brilho libera os alvos dele.
 */
export function applyQuality(q) {
  if (!CONFIG.quality[q]) q = 'media';
  quality = q;
  const Q = CONFIG.quality[q];
  dyn.scale = 1; dyn.slowT = dyn.fastT = dyn.acc = dyn.n = 0;
  renderer.setPixelRatio(baseDpr());
  const type = Q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const recompile = renderer.shadowMap.type !== type || renderer.shadowMap.enabled !== Q.shadows;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = type;
  sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.shadowSize) {
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  poolOn = Math.max(0, Math.min(torchLights.length, Q.lights - 1));
  torchLights.forEach((l, i) => { l.visible = i < poolOn; if (!l.visible) { l.intensity = 0; l.userData.busy = false; } });
  if (!!postMat.defines.POST_LITE !== Q.lite) {
    if (Q.lite) postMat.defines.POST_LITE = 1; else delete postMat.defines.POST_LITE;
    postMat.needsUpdate = true;
  }
  if (post.samples !== Q.msaa) { post.samples = Q.msaa; if (post.rt) { post.rt.dispose(); post.rt = null; } }
  post.qBloom = Q.bloom;
  updateBloom();
  setTexAnisotropy(Q.aniso);
  if (recompile) scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  resize();
}
/** DPR base da qualidade (sem a escala dinâmica). */
function baseDpr() { return Math.min(window.devicePixelRatio || 1, CONFIG.quality[quality].dpr); }
// ---------- resolução dinâmica (qualidades com dynRes) ----------
const dyn = { scale: 1, last: 0, acc: 0, n: 0, slowT: 0, fastT: 0 };
/** Escala atual da resolução dinâmica (1 = DPR cheio da qualidade). */
export function dynResScale() { return dyn.scale; }
function dynResTick(now) {
  const d = now - dyn.last;
  dyn.last = now;
  if (!CONFIG.quality[quality].dynRes || d <= 0 || d > 250) return; // pausas, aba oculta e travadas longas não contam
  dyn.acc += d; dyn.n++;
  if (dyn.acc < 500) return;
  const avg = dyn.acc / dyn.n, D = CONFIG.dynRes;
  dyn.acc = dyn.n = 0;
  let next = dyn.scale;
  if (avg > D.slowMs) { dyn.fastT = 0; if ((dyn.slowT += 0.5) >= 1) { dyn.slowT = 0; next = Math.max(D.min, dyn.scale - D.step); } }
  else if (avg < D.fastMs) { dyn.slowT = 0; if ((dyn.fastT += 0.5) >= 3) { dyn.fastT = 0; next = Math.min(1, dyn.scale + D.step); } }
  else dyn.slowT = dyn.fastT = 0;
  next = Math.round(next * 100) / 100;
  if (next !== dyn.scale) { dyn.scale = next; renderer.setPixelRatio(Math.max(0.5, baseDpr() * next)); resize(); }
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
// Passe final: contorno "nanquim" a partir da profundidade, brilho (bloom),
// gradação de cor por bioma e vinheta. A cena é desenhada num alvo
// intermediário (HDR quando possível); o brilho é extraído em 1/4 e 1/8 da
// resolução e desfocado em dois passes separáveis; um quad de tela junta tudo,
// aplica o tone mapping e converte para sRGB. O contorno é o que une
// personagens, adereços e paredes no mesmo traço de desenho animado.
// =============================================================================
const post = { rt: null, samples: 4, outline: true, bloom: true, qBloom: true, userBloom: null, size: new THREE.Vector2(), b: null, warm: null, dirty: false };
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 1 },
    uNear: { value: CC.near }, uFar: { value: CC.far }, uFade: { value: new THREE.Vector2(58, 95) },
    uInk: { value: CONFIG.style.ink }, uEdge: { value: new THREE.Vector2(CONFIG.style.edge0, CONFIG.style.edge1) },
    uOutline: { value: 1 }, uBloom: { value: 0 }, uVignette: { value: CONFIG.style.vignette },
    uProjInv: { value: new THREE.Matrix4() }, uNormalEdge: { value: CONFIG.style.normalEdge }, uSilWidth: { value: 1.8 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1 }, uAspect: { value: 1 },
    uContrast: { value: 1 }, uLift: { value: new THREE.Color(0, 0, 0) }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Color(1, 1, 1) },
    uCamWorld: { value: new THREE.Matrix4() }, uTime: { value: 0 },
    uHFog: { value: new THREE.Color(0, 0, 0) }, uHFogP: { value: new THREE.Vector3(0, 1, 0) },
  },
  vertexShader: FS_VERT,
  fragmentShader: `
    // A profundidade precisa de amostrador highp: no GLSL ES o sampler2D é lowp por padrão e GPUs de
    // celular (Mali, Adreno) devolvem a leitura em meia precisão. Perto de 1,0 isso vira degraus de
    // ~0,0005, e as normais reconstruídas dos degraus desenhavam linhas horizontais no chão.
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    uniform highp sampler2D tDepth;
    #else
    uniform sampler2D tDepth;
    #endif
    uniform sampler2D tColor; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
    uniform vec2 uTexel; uniform float uWidth; uniform float uNear; uniform float uFar; uniform vec2 uFade;
    uniform float uInk; uniform vec2 uEdge; uniform float uOutline; uniform float uBloom; uniform float uVignette;
    uniform vec3 uTint; uniform float uSat; uniform float uAspect;
    uniform float uContrast; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain;
    uniform mat4 uCamWorld; uniform float uTime; uniform vec3 uHFog; uniform vec3 uHFogP;
    uniform mat4 uProjInv; uniform float uNormalEdge; uniform float uSilWidth;
    varying vec2 vUv;
    float lin(vec2 uv) { highp float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
    // posição em espaço de visão reconstruída da profundidade
    vec3 vpos(vec2 uv) { vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    void main() {
      vec4 c = texture2D(tColor, vUv);
      if (uOutline > 0.5) {
        vec2 o = uTexel * uWidth;
        float z = lin(vUv);
        float l = lin(vUv - vec2(o.x, 0.0)), r = lin(vUv + vec2(o.x, 0.0));
        float d = lin(vUv - vec2(0.0, o.y)), u = lin(vUv + vec2(0.0, o.y));
        // laplaciano relativo: rampas (chão inclinado na tela) somem, degraus e silhuetas ficam
        float lap = (abs(l + r - 2.0 * z) + abs(u + d - 2.0 * z)) / z;
        float e = smoothstep(uEdge.x, uEdge.y, lap);
        #ifndef POST_LITE
        // quinas e dobras: normais dos quatro quadrantes em volta do pixel (reconstruídas da
        // profundidade, sem passe extra). Num plano são iguais; numa quina, divergem.
        vec3 pc = vpos(vUv), pl = vpos(vUv - vec2(o.x, 0.0)) - pc, pr = vpos(vUv + vec2(o.x, 0.0)) - pc;
        vec3 pd = vpos(vUv - vec2(0.0, o.y)) - pc, pu = vpos(vUv + vec2(0.0, o.y)) - pc;
        vec3 n1 = normalize(cross(pr, pu)), n2 = normalize(cross(pu, pl)), n3 = normalize(cross(pl, pd)), n4 = normalize(cross(pd, pr));
        float nd = 1.0 - min(min(dot(n1, n3), dot(n2, n4)), min(dot(n1, n2), dot(n3, n4)));
        e = max(e, smoothstep(uNormalEdge, uNormalEdge * 2.2, nd) * 0.75);
        // silhueta mais grossa: do lado de trás de um degrau grande de profundidade, amostra num raio maior
        vec2 w = o * uSilWidth;
        float zn = min(min(lin(vUv - vec2(w.x, 0.0)), lin(vUv + vec2(w.x, 0.0))), min(lin(vUv - vec2(0.0, w.y)), lin(vUv + vec2(0.0, w.y))));
        e = max(e, smoothstep(0.06, 0.12, (z - zn) / z));
        #endif
        e *= 1.0 - smoothstep(uFade.x, uFade.y, min(z, min(min(l, r), min(u, d))));
        c.rgb = mix(c.rgb, c.rgb * uInk, e);
      }
      // névoa de altura: neblina rasteira / cinzas (posição de mundo reconstruída da profundidade)
      if (uHFogP.z > 0.0) {
        vec3 vp = vpos(vUv);
        vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
        float hf = 1.0 - smoothstep(0.0, uHFogP.y, wp.y);
        float fn = sin(wp.x * 0.23 + uTime * 0.21) * sin(wp.z * 0.19 - uTime * 0.17) * 0.5 + 0.5;
        hf *= uHFogP.z * (0.55 + 0.45 * fn) * smoothstep(4.0, 16.0, -vp.z);
        c.rgb = mix(c.rgb, uHFog, clamp(hf, 0.0, 0.35));
      }
      // brilho: soma das duas escalas (halo curto e halo largo), por cima do traço
      if (uBloom > 0.0) c.rgb += (texture2D(tBloomA, vUv).rgb * 0.65 + texture2D(tBloomB, vUv).rgb * 0.55) * uBloom;
      // gradação por bioma: tinta nas sombras/meios-tons e saturação
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(lum), c.rgb, uSat) * mix(uTint, vec3(1.0), smoothstep(0.0, 1.2, lum));
      // lift/gamma/gain e contraste por bioma (no linear, antes do tone mapping; 0,18 = cinza médio)
      c.rgb = max(c.rgb, vec3(0.0));
      // contraste só na luminância (não satura mais as cores já fortes do bioma)
      c.rgb *= pow(max(lum, 1e-4) / 0.18, uContrast - 1.0);
      c.rgb = pow(c.rgb, 1.0 / uGamma) * uGain + uLift * (1.0 - smoothstep(0.0, 0.35, lum));
      // quadro de impacto (crítico): clarão branco quente de 1–2 quadros, mais forte no centro
      // vinheta oval suave (escurece as bordas, puxa o olho para o herói)
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q) * 1.25);
      gl_FragColor = vec4(c.rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});
// extração do brilho: média de 4 amostras + limiar com joelho suave (só o que passa do branco da cena)
const brightMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uThreshold: { value: CONFIG.style.bloomThreshold } },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
    void main() {
      vec3 c = (texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb +
                texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
      float br = max(c.r, max(c.g, c.b));
      float k = clamp(br - uThreshold + 0.25, 0.0, 0.5); k = k * k * 2.0; // joelho de 0.25
      float w = max(k, br - uThreshold) / max(br, 1e-4);
      gl_FragColor = vec4(min(c * w, vec3(6.0)), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// desfoque gaussiano separável de 9 amostras (5 leituras com filtro linear)
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tColor, vUv).rgb * 0.2270270;
      c += (texture2D(tColor, vUv + uDir * 1.3846154).rgb + texture2D(tColor, vUv - uDir * 1.3846154).rgb) * 0.3162162;
      c += (texture2D(tColor, vUv + uDir * 3.2307692).rgb + texture2D(tColor, vUv - uDir * 3.2307692).rgb) * 0.0702703;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const copyMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } },
  vertexShader: FS_VERT,
  fragmentShader: `uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
    void main() { gl_FragColor = vec4((texture2D(tColor, vUv - uTexel).rgb + texture2D(tColor, vUv + uTexel).rgb +
      texture2D(tColor, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tColor, vUv + vec2(-uTexel.x, uTexel.y)).rgb) * 0.25, 1.0); }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);
/** Desenha o quad de tela com `mat` em `target` (null = tela). */
function pass(mat, target) {
  postQuad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(postScene, postCam);
}

function colorType() {
  const ex = renderer.extensions;
  return ex.has('EXT_color_buffer_float') || ex.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
}
function bloomTargets(w, h) {
  const mk = (d) => new THREE.WebGLRenderTarget(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)), { type: colorType(), depthBuffer: false });
  if (!post.b) post.b = { a0: mk(4), a1: mk(4), b0: mk(8), b1: mk(8) };
  else { for (const k of ['a0', 'a1']) post.b[k].setSize(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4))); for (const k of ['b0', 'b1']) post.b[k].setSize(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 8))); }
}
function resizePost() {
  renderer.getDrawingBufferSize(post.size);
  const w = Math.max(1, post.size.x), h = Math.max(1, post.size.y);
  if (!post.rt) {
    post.rt = new THREE.WebGLRenderTarget(w, h, { type: colorType(), samples: post.samples, depthBuffer: true });
    post.rt.depthTexture = new THREE.DepthTexture(w, h);
    post.rt.depthTexture.type = THREE.UnsignedIntType;
  } else post.rt.setSize(w, h);
  if (post.bloom) bloomTargets(w, h);
  postMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  postMat.uniforms.uAspect.value = w / h;
  postMat.uniforms.uWidth.value = Math.max(1, renderer.getPixelRatio() * CONFIG.style.lineWidth);
  postMat.uniforms.uSilWidth.value = CONFIG.style.silhouetteWidth / CONFIG.style.lineWidth;
}
/** Brilho: limiar em 1/4, desfoque; cópia para 1/8, desfoque mais largo. */
function renderBloom() {
  const B = post.b, a = B.a0.width, ah = B.a0.height, b = B.b0.width, bh = B.b0.height;
  brightMat.uniforms.tColor.value = post.rt.texture;
  brightMat.uniforms.uTexel.value.set(1 / post.size.x, 1 / post.size.y);
  pass(brightMat, B.a0);
  blurMat.uniforms.tColor.value = B.a0.texture; blurMat.uniforms.uDir.value.set(1 / a, 0); pass(blurMat, B.a1);
  blurMat.uniforms.tColor.value = B.a1.texture; blurMat.uniforms.uDir.value.set(0, 1 / ah); pass(blurMat, B.a0);
  copyMat.uniforms.tColor.value = B.a0.texture; copyMat.uniforms.uTexel.value.set(1 / a, 1 / ah); pass(copyMat, B.b0);
  blurMat.uniforms.tColor.value = B.b0.texture; blurMat.uniforms.uDir.value.set(1.5 / b, 0); pass(blurMat, B.b1);
  blurMat.uniforms.tColor.value = B.b1.texture; blurMat.uniforms.uDir.value.set(0, 1.5 / bh); pass(blurMat, B.b0);
}
/** Sem contorno, brilho nem MSAA: a cena vai direto para a tela (sem alvo intermediário). */
const directToScreen = () => !post.outline && !post.bloom && !post.samples;
/**
 * Avisa que o nível foi trocado: no próximo quadro os shaders da cena são compilados e as
 * texturas enviadas à GPU antes de desenhar (ver warmScene).
 */
export function sceneChanged() { post.dirty = true; }
/** true enquanto a cena nova ainda está sendo preparada (o quadro anterior fica na tela). */
export function warming() { return !!post.warm || post.dirty; }
const TEX_KEYS = ['map', 'normalMap', 'emissiveMap', 'gradientMap', 'alphaMap', 'aoMap', 'bumpMap'];
/**
 * Pré-compila os programas da cena no mesmo alvo em que ela será desenhada (o alvo muda o
 * programa: espaço de cor e tone mapping) e envia as texturas. Com KHR_parallel_shader_compile
 * a compilação corre fora da thread principal; até terminar (no máximo `ms`) o renderFrame não
 * desenha, em vez de travar o primeiro quadro da zona nova.
 */
function warmScene(ms) {
  const seen = new Set();
  const up = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch { /* ignora */ } } };
  scene.traverse((o) => {
    if (!o.material || !o.visible) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of TEX_KEYS) up(m[k]);
      if (m.uniforms) for (const k in m.uniforms) up(m.uniforms[k].value);
    }
  });
  if (!directToScreen() && !post.rt) resizePost();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(directToScreen() ? null : post.rt);
  let mats = null;
  try { mats = renderer.compile(scene, camera); } catch { mats = null; }
  renderer.setRenderTarget(prev);
  if (!mats || !mats.size) return;
  // espera os programas ficarem prontos (como o compileAsync, mas tolera materiais liberados no meio:
  // uma troca de zona rápida descarta materiais antes de a compilação terminar)
  post.warm = { until: performance.now() + ms, done: false, mats };
}
/** true quando todos os programas pré-compilados já foram ligados pelo driver. */
function warmReady(w) {
  for (const m of w.mats) {
    const pr = renderer.properties.get(m).currentProgram;
    if (!pr || pr.isReady()) w.mats.delete(m);
    else return false;
  }
  return true;
}
/**
 * Desenha um quadro: cena → alvo intermediário → brilho → contorno, cor e tone mapping na tela.
 * lowRate: o laço está desenhando em ritmo reduzido (pausa): não conta para a resolução dinâmica.
 */
export function renderFrame(lowRate) {
  if (post.dirty) { post.dirty = false; warmScene(900); }
  if (post.warm) {
    if (!warmReady(post.warm) && performance.now() < post.warm.until) return;
    post.warm = null;
    dyn.last = 0;
  }
  if (lowRate) dyn.last = 0; else dynResTick(performance.now());
  if (directToScreen()) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  if (!post.rt) resizePost();
  renderer.setRenderTarget(post.rt);
  renderer.render(scene, camera);
  if (post.bloom) { if (!post.b) bloomTargets(post.size.x, post.size.y); renderBloom(); }
  const U = postMat.uniforms;
  U.tColor.value = post.rt.texture;
  U.tDepth.value = post.rt.depthTexture;
  U.tBloomA.value = post.b ? post.b.a0.texture : null; U.tBloomB.value = post.b ? post.b.b0.texture : null;
  U.uBloom.value = post.bloom ? CONFIG.style.bloom : 0;
  U.uOutline.value = post.outline ? 1 : 0;
  U.uNear.value = camera.near; U.uFar.value = camera.far;
  U.uProjInv.value.copy(camera.projectionMatrixInverse);
  U.uCamWorld.value.copy(camera.matrixWorld);
  U.uTime.value = performance.now() / 1000;
  if (scene.fog) U.uFade.value.set(scene.fog.near + 20, scene.fog.far + 10);
  pass(postMat, null);
}
/**
 * Brilho (bloom): segue a qualidade (ligado em alta/média, desligado em baixa)
 * até o jogador escolher em Opções. Sem alvo HDR (HalfFloat) fica sempre desligado:
 * num alvo de 8 bits nada passa do limiar.
 */
function updateBloom() {
  post.bloom = (post.userBloom == null ? post.qBloom : post.userBloom) && colorType() === THREE.HalfFloatType;
  // brilho desligado: libera os quatro alvos dele (voltam a ser criados se ligar de novo)
  if (!post.bloom && post.b) { for (const k in post.b) post.b[k].dispose(); post.b = null; }
}
/** on: true/false = escolha do jogador; null = padrão da qualidade. */
export function setBloom(on) { post.userBloom = on == null ? null : !!on; updateBloom(); }
/** Estado efetivo do brilho (Opções mostra o que está valendo). */
export function bloomOn() { return post.bloom; }
/** Liga/desliga o contorno (opção de acessibilidade/desempenho). */
export function setOutline(on) { post.outline = !!on; }
/**
 * Gradação de cor do bioma: tint = cor multiplicada nas sombras, sat = saturação (1 = neutra).
 * look (opcional): { contrast, lift (hex, somado nas sombras), gamma [r,g,b], gain (hex) }.
 */
export function setGrade(tint, sat, look) {
  const U = postMat.uniforms;
  look = look || {};
  U.uTint.value.setHex(tint == null ? 0xffffff : tint);
  U.uSat.value = sat == null ? 1 : sat;
  U.uContrast.value = look.contrast || 1;
  U.uLift.value.setHex(look.lift || 0).multiplyScalar(0.035);
  U.uGamma.value.fromArray(look.gamma || [1, 1, 1]);
  U.uGain.value.setHex(look.gain == null ? 0xffffff : look.gain);
}
/** Névoa de altura do bioma: [cor, altura (m), densidade 0–1] ou null. */
export function setHeightFog(f) {
  const U = postMat.uniforms;
  if (!f || !CONFIG.style.heightFog) { U.uHFogP.value.set(0, 1, 0); return; }
  U.uHFog.value.setHex(f[0]);
  U.uHFogP.value.set(0, f[1], f[2] * CONFIG.style.heightFog);
}
