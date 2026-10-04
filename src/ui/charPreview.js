// ---------- prévia 3D do herói no inventário ----------
// Renderer pequeno e próprio (fundo escuro opaco, para os brilhos aditivos
// somarem sobre ele), criado uma vez. O modelo só é refeito quando classe, evolução ou
// equipamento mudam; o desenho roda a ~30 fps e só com o inventário aberto. Fechado por
// RELEASE_MS, o renderer é liberado (o contexto WebGL e a memória de vídeo voltam ao sistema).
import { gltfEnabled } from '../art/gltfModels.js';
import { animateModel, disposeModel } from '../art/models.js';
import { UI } from '../core/state.js';
import { $ } from '../core/util.js';
import { buildCharacterModel } from '../game/player.js';

const PV = { host: null, canvas: null, r: null, scene: null, cam: null, model: null, key: '', yaw: 0.5, drag: null, raf: 0, last: 0, failed: false, w: 0, h: 0, center: null, size: null, idle: 0 };
const RELEASE_MS = 20000;

function setup() {
  try {
    PV.r = new THREE.WebGLRenderer({ canvas: PV.canvas, antialias: true, powerPreference: 'low-power' });
  } catch { PV.failed = true; PV.host.classList.add('off'); return; }
  PV.w = PV.h = 0;
  PV.r.outputColorSpace = THREE.SRGBColorSpace;
  PV.r.toneMapping = THREE.ACESFilmicToneMapping;
  PV.r.toneMappingExposure = 1.1;
  if (PV.scene) return; // renderer recriado depois de liberado: cena, câmera e modelo continuam
  const sc = (PV.scene = new THREE.Scene());
  sc.background = backdrop();
  sc.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a1e30, 1.15));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.1); // luz principal suave, de frente e do alto
  key.position.set(2.5, 5, 6);
  const rim = new THREE.DirectionalLight(0xb49aff, 1.3); // contraluz lilás que separa o herói do fundo
  rim.position.set(-4, 3, -5);
  sc.add(key, rim);
  PV.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
}
/** Fundo: brilho roxo suave atrás do herói, escurecendo nas bordas (como o painel). */
function backdrop() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 104, 8, 128, 120, 170);
  gr.addColorStop(0, '#2c2342'); gr.addColorStop(0.55, '#17121f'); gr.addColorStop(1, '#0b0810');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Câmera ajustada ao tamanho do modelo (altura e asas abertas cabem no quadro). */
function fitCamera() {
  if (!PV.center) return;
  const cam = PV.cam, t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dH = (PV.size.y / 2) / t, dW = (PV.size.x / 2) / (t * cam.aspect);
  const d = Math.max(dH, dW) * 1.04 + PV.size.z / 2;
  cam.position.set(PV.center.x, PV.center.y + d * 0.12, PV.center.z + d);
  cam.lookAt(PV.center.x, PV.center.y, PV.center.z);
}
/** Caixa só das partes sólidas (ignora halos, auras e faíscas aditivas, que são largos e achatados). */
function measure(root) {
  root.rotation.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && (m.blending === THREE.AdditiveBlending || m.transparent && m.opacity < 0.5)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.6, 0, -0.4), new THREE.Vector3(0.6, 2, 0.4));
  // asas giram junto: a largura vale para qualquer ângulo
  const size = box.getSize(new THREE.Vector3());
  size.x = Math.max(size.x, size.z);
  PV.size = size; PV.center = box.getCenter(new THREE.Vector3());
}
function rebuild(ch) {
  if (PV.model) { PV.scene.remove(PV.model.root); disposeModel(PV.model); PV.model = null; }
  const m = buildCharacterModel(ch);
  PV.scene.add(m.root);
  PV.model = m;
  animateModel(m, { t: performance.now() / 1000, dt: 0, moving: false });
  measure(m.root);
  fitCamera();
}
function resize() {
  const w = PV.canvas.clientWidth, h = PV.canvas.clientHeight;
  if (!w || !h || (w === PV.w && h === PV.h)) return;
  PV.w = w; PV.h = h;
  PV.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  PV.r.setSize(w, h, false);
  PV.cam.aspect = w / h;
  PV.cam.updateProjectionMatrix();
  fitCamera();
}
const visible = () => PV.canvas.isConnected && UI.tab === 'inv' && !$('#drawer').hidden && !document.hidden;
/**
 * Libera o renderer da prévia: o contexto perdido não volta no mesmo canvas, então um canvas
 * novo toma o lugar (os eventos de girar são ligados de novo por mount).
 */
function release() {
  PV.idle = 0;
  if (!PV.r || visible()) return;
  PV.r.dispose();
  PV.r.forceContextLoss();
  PV.r = null;
  const c = PV.canvas.cloneNode(false);
  if (PV.canvas.parentNode) { PV.canvas.replaceWith(c); CharPreview.mount(PV.host); } else PV.canvas = c;
}
function frame(now) {
  PV.raf = 0;
  if (!PV.model || !visible()) { // volta a rodar no próximo sync() do inventário
    if (PV.r && !PV.idle) PV.idle = setTimeout(release, RELEASE_MS);
    return;
  }
  PV.raf = requestAnimationFrame(frame);
  if (now - PV.last < 32) return;
  const dt = Math.min(0.1, (now - PV.last) / 1000);
  PV.last = now;
  resize();
  animateModel(PV.model, { t: now / 1000, dt, moving: false });
  PV.model.root.rotation.y = PV.yaw;
  PV.r.render(PV.scene, PV.cam);
}

export const CharPreview = {
  html() { return '<div class="pv" id="charPv" title="Arraste para girar"><canvas aria-label="Prévia do personagem"></canvas></div>'; },
  mount(host) {
    PV.host = host;
    PV.canvas = host.querySelector('canvas');
    // arrastar gira o herói (mouse ou toque); não inicia o arrastar de itens
    PV.canvas.addEventListener('pointerdown', (e) => {
      PV.drag = { x: e.clientX, yaw: PV.yaw };
      PV.canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    PV.canvas.addEventListener('pointermove', (e) => { if (PV.drag) PV.yaw = PV.drag.yaw + (e.clientX - PV.drag.x) * 0.012; });
    const end = () => { PV.drag = null; };
    PV.canvas.addEventListener('pointerup', end);
    PV.canvas.addEventListener('pointercancel', end);
  },
  /** Refaz o modelo só se a aparência mudou e garante o laço de desenho com o painel aberto. */
  sync(ch) {
    if (PV.failed || !PV.canvas) return;
    if (PV.idle) { clearTimeout(PV.idle); PV.idle = 0; }
    if (!PV.r) { setup(); if (PV.failed) return; }
    const key = ch.cls + '|' + ch.tier + '|' + gltfEnabled() + '|' + Object.keys(ch.equip).sort().map((k) => ch.equip[k] && ch.equip[k].uid + '+' + (ch.equip[k].plus || 0) + '+' + (ch.equip[k].stage || 0)).join(',');
    if (key !== PV.key) { PV.key = key; rebuild(ch); }
    if (!PV.raf && visible()) { PV.last = 0; PV.raf = requestAnimationFrame(frame); }
  },
};
