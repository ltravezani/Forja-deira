// =============================================================================
// ENGINE — renderização (Three.js), modelos procedurais, partículas, masmorras
// =============================================================================

export const R = ForjaRules;
export const $ = (s, el) => (el || document).querySelector(s);
export const TILE = 2;
export const V3 = THREE.Vector3;

export const rand = Math.random;
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');
/** Número com vírgula decimal (pt-BR): dec(1.5) → "1,5"; `d` fixa as casas (dec(1, 2) → "1,00"). */
export const dec = (n, d) => Number(n).toLocaleString('pt-BR', d == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: d, maximumFractionDigits: d });
/** Tela de toque (dedo como ponteiro principal): troca textos de teclado e mostra os botões de toque. */
export const touchUI = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
