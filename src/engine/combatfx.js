// =============================================================================
// Efeitos de combate estilizados, em pools fixos (nenhuma alocação por golpe):
// rastro de golpe em meia-lua, faíscas em estrela no ponto de impacto e anel de
// choque achatado no chão. Materiais e texturas são criados uma vez; cada uso
// só troca cor, posição e opacidade. Tudo aditivo e sem gravar profundidade.
// =============================================================================
import { CONFIG } from '../core/config.js';
import { gy } from '../world/grid.js';
import { scene } from './renderer.js';

const ease = (k) => 1 - Math.pow(1 - k, 3);

// ---------- texturas em canvas ----------
/** Degradê da meia-lua: u = ângulo (0 = cauda transparente, 1 = ponta branca), v = raio. */
function slashTexture() {
  const W = 128, H = 32, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = y / (H - 1);
    // corpo: some na cauda, cheio perto da ponta; borda externa (v = 1) mais forte e dura
    const body = Math.pow(u, 1.1) * Math.min(1, (1 - u) * 14);
    const edge = 0.3 + 0.55 * Math.pow(v, 1.3) + (v > 0.86 ? 0.45 : 0);
    const a = Math.min(1, body * edge);
    // miolo branco na ponta e na borda externa; resto recebe a cor do material
    const w = Math.min(1, Math.pow(u, 6) * 1.2 + (v > 0.9 ? 0.6 : 0));
    const k = (y * W + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * (0.55 + 0.45 * w);
    img.data[k + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Estrela de 4 pontas com miolo branco (faísca de impacto). */
function starTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const star = (n, r0, r1, rot, fill) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r1 : r0;
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  star(4, 31, 5, -Math.PI / 2, 'rgba(255,255,255,0.55)');
  star(4, 20, 4, -Math.PI / 4, 'rgba(255,255,255,0.35)');
  star(4, 22, 3.5, -Math.PI / 2, '#ffffff');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 9);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- geometria da meia-lua (UV polar: u ao longo do arco, v do raio interno ao externo) ----------
function crescentGeometry(span, seg) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = -span / 2 + span * u;
    // largura da lâmina: fina nas pontas, larga perto do fim do golpe (formato de meia-lua)
    const inner = 1 - 0.5 * Math.sin(Math.PI * Math.pow(u, 0.8));
    for (const [r, v] of [[inner, 0], [1, 1]]) { pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, v); }
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- pools ----------
const SLASH_N = 16, STAR_N = 24, SHOCK_N = 8;
let pools = null;
function init() {
  if (pools) return pools;
  const addMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 });
  const crescent = crescentGeometry(Math.PI * 0.78, 28);
  const sT = slashTexture(), stT = starTexture();
  pools = { slash: [], star: [], shock: [], cur: { slash: 0, star: 0, shock: 0 } };
  for (let i = 0; i < SLASH_N; i++) {
    const m = new THREE.Mesh(crescent, addMat(sT));
    m.visible = false; m.renderOrder = 8; m.frustumCulled = false; // por cima de tudo, como um traço de animação
    scene.add(m);
    pools.slash.push({ m, t: 1, dur: 1 });
  }
  for (let i = 0; i < STAR_N; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: stT, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.visible = false; m.renderOrder = 7;
    scene.add(m);
    pools.star.push({ m, t: 1, dur: 1 });
  }
  const ring = new THREE.RingGeometry(0.82, 1, 48);
  ring.rotateX(-Math.PI / 2);
  for (let i = 0; i < SHOCK_N; i++) {
    const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.visible = false; m.renderOrder = 2;
    scene.add(m);
    pools.shock.push({ m, t: 1, dur: 1 });
  }
  return pools;
}
/** Próximo item livre do pool (ou o mais antigo, se todos estiverem em uso). */
function take(kind) {
  const P = init(), list = P[kind];
  for (let k = 0; k < list.length; k++) {
    const i = (P.cur[kind] + k) % list.length;
    if (list[i].t >= list[i].dur) { P.cur[kind] = (i + 1) % list.length; return list[i]; }
  }
  const f = list[P.cur[kind]];
  P.cur[kind] = (P.cur[kind] + 1) % list.length;
  return f;
}

/**
 * Rastro de golpe em meia-lua, orientado por `rot` (ângulo do ataque, como atan2(dx, dz)).
 * o: { radius, y, dur, flip (varre da direita para a esquerda), tilt }
 */
export function slashArc(x, z, rot, color, o) {
  o = o || {};
  const f = take('slash');
  f.t = 0; f.dur = o.dur || 0.18;
  f.x = x; f.z = z; f.y = (o.y != null ? o.y : 1.05) + gy(x, z);
  f.rot = rot; f.flip = o.flip ? -1 : 1; f.r = o.radius || 2; f.tilt = o.tilt || 0.18;
  f.m.material.color.setHex(color).multiplyScalar(CONFIG.style.glowCore);
  f.m.visible = true;
  setSlash(f, 0);
}
function setSlash(f, k) {
  const e = ease(k), m = f.m;
  m.position.set(f.x, f.y, f.z);
  // a lâmina varre ~70° durante o golpe e abre um pouco
  m.rotation.set(f.tilt, f.rot + f.flip * (e - 0.5) * 1.2, 0, 'YXZ');
  m.scale.set(f.r * (0.8 + 0.25 * e) * f.flip, 1, f.r * (0.8 + 0.25 * e));
  m.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 1.5);
}

/** Faísca em estrela no ponto de impacto. size em metros. */
export function impactStar(x, y, z, color, size) {
  const f = take('star');
  f.t = 0; f.dur = 0.16 + size * 0.05; f.s = size;
  f.m.position.set(x, y + gy(x, z), z);
  f.m.material.color.setHex(color).multiplyScalar(CONFIG.style.glowCore);
  f.m.material.rotation = Math.random() * 0.8 - 0.4;
  f.m.visible = true;
  setStar(f, 0);
}
function setStar(f, k) {
  const s = f.s * (k < 0.3 ? 0.5 + ease(k / 0.3) * 0.7 : 1.2 - (k - 0.3) * 0.6);
  f.m.scale.set(s, s, 1);
  f.m.material.opacity = 1 - k * k;
}

/** Anel de choque achatado no chão (golpes fortes e habilidades de área). */
export function shockRing(x, z, radius, color, dur) {
  const f = take('shock');
  f.t = 0; f.dur = dur || 0.35; f.r = radius;
  f.m.position.set(x, 0.1 + gy(x, z), z);
  f.m.material.color.setHex(color).multiplyScalar(1.4);
  f.m.visible = true;
  setShock(f, 0);
}
function setShock(f, k) {
  const e = ease(k);
  f.m.scale.set(f.r * (0.2 + 0.8 * e), 1, f.r * (0.2 + 0.8 * e));
  f.m.material.opacity = 0.9 * (1 - k);
}

export function updateCombatFx(dt) {
  if (!pools) return;
  for (const [list, set] of [[pools.slash, setSlash], [pools.star, setStar], [pools.shock, setShock]]) {
    for (const f of list) {
      if (f.t >= f.dur) continue;
      f.t += dt;
      if (f.t >= f.dur) { f.m.visible = false; continue; }
      set(f, f.t / f.dur);
    }
  }
}
/** Esconde tudo (troca de zona). As malhas são reaproveitadas, nunca liberadas. */
export function clearCombatFx() {
  if (!pools) return;
  for (const k of ['slash', 'star', 'shock']) for (const f of pools[k]) { f.t = f.dur = 1; f.m.visible = false; }
}
