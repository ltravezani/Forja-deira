// ---------- retorno visual de dano e vida baixa (vinheta vermelha) ----------
import { CONFIG } from '../core/config.js';
import { $ } from '../core/util.js';

const fx = { el: null, anim: null };
function el() { return fx.el || (fx.el = $('#hurtfx')); }

/** Pulso vermelho proporcional à fração de vida perdida no golpe. */
export function hurtFeedback(frac) {
  const e = el();
  if (!e || !(frac > 0)) return;
  const peak = Math.min(0.55, 0.15 + frac * 2.5);
  if (fx.anim) fx.anim.cancel();
  fx.anim = e.animate([{ opacity: peak }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
}
/** Aviso persistente (pulsante) enquanto a vida estiver abaixo do limite configurado. */
export function updateLowHp(hpFrac, alive) {
  const e = el();
  if (e) e.classList.toggle('low', alive && hpFrac < CONFIG.feel.lowHpWarn);
}
