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
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
