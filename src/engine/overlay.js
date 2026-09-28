// ---------- overlay HTML sobre o canvas: projeção 3D→tela e números flutuantes ----------
import { CONFIG } from '../core/config.js';
import { $, V3 } from '../core/util.js';
import { camera } from './renderer.js';
import { gy } from '../world/grid.js';

export const overlay = $('#overlay');

const _v = new V3();
/** Resultado reaproveitado de toScreen: copie os campos se precisar guardá-los. */
const _screen = { x: 0, y: 0, vis: false };
/** Projeta um ponto do mundo na tela (px). Reusa o mesmo objeto de saída. */
export function toScreen(x, y, z) {
  _v.set(x, y + gy(x, z), z).project(camera);
  _screen.x = (_v.x * 0.5 + 0.5) * window.innerWidth;
  _screen.y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
  _screen.vis = _v.z < 1 && _v.x > -1.2 && _v.x < 1.2 && _v.y > -1.2 && _v.y < 1.2;
  return _screen;
}

// Números flutuantes: pool fixo de elementos, animados com a Web Animations API
// (sem criar/destruir nós nem timers por golpe; o limite vale sempre).
const floats = [];
let floatCursor = 0;
const RISE = [
  { opacity: 0, transform: 'translate(-50%, calc(-50% + 6px))' },
  { opacity: 1, offset: 0.12 },
  { opacity: 0, transform: 'translate(-50%, calc(-50% - 54px))' },
];
function floatEl() {
  const O = CONFIG.overlay;
  if (!floats.length) {
    for (let i = 0; i < O.floatMax; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.hidden = true;
      overlay.appendChild(el);
      floats.push({ el, until: 0, anim: null });
    }
  }
  const now = performance.now();
  for (let k = 0; k < floats.length; k++) {
    const f = floats[(floatCursor + k) % floats.length];
    if (f.until <= now) { floatCursor = (floatCursor + k + 1) % floats.length; return f; }
  }
  return null; // todos ocupados: descarta (o limite protege a legibilidade e o desempenho)
}
export function floatText(x, y, z, text, cls) {
  const p = toScreen(x, y, z);
  if (!p.vis) return;
  const f = floatEl();
  if (!f) return;
  const big = !!cls && cls.indexOf('big') >= 0;
  const dur = big ? CONFIG.overlay.floatDurationBig : CONFIG.overlay.floatDuration;
  f.el.className = 'dmg ' + (cls || '');
  f.el.textContent = text;
  f.el.style.left = p.x + (Math.random() - 0.5) * 24 + 'px';
  f.el.style.top = p.y + 'px';
  f.el.hidden = false;
  f.until = performance.now() + dur;
  if (f.anim) f.anim.cancel();
  f.anim = f.el.animate(RISE, { duration: dur, easing: 'ease-out', fill: 'forwards' });
  f.anim.onfinish = () => { f.el.hidden = true; };
}
/** Esconde todos os números flutuantes (troca de zona). */
export function resetFloatText() {
  for (const f of floats) { if (f.anim) f.anim.cancel(); f.el.hidden = true; f.until = 0; }
}
