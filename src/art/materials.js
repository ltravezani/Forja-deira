// ---------- materiais ----------
// Materiais compartilhados levam userData.shared = true e nunca são liberados
// junto com um modelo; os próprios de cada modelo/efeito são liberados ao remover.
import { CONFIG } from '../core/config.js';
import { stylize } from './stylize.js';

const matCache = new Map();
/**
 * Opções: {rough, metal, flat, map (conjunto de textura), nscale, side, rim}
 * Todos os materiais sólidos usam o mesmo sombreamento cartoon (faixas de luz +
 * borda iluminada). "metal" e "rough" baixos viram reflexo pintado.
 */
function stdMat(color, emissive, ei, o) {
  o = o || {};
  // MeshToonMaterial não tem flatShading (só gerava aviso no console); "flat" segue aceito e ignorado
  const m = new THREE.MeshToonMaterial({ color });
  if (o.map) { m.map = o.map.map; m.normalMap = o.map.normalMap; m.normalScale.setScalar((o.nscale || 0.8) * 0.55); }
  m.emissive = new THREE.Color(emissive || 0x000000);
  m.emissiveIntensity = ei || (emissive ? 1 : 0);
  if (o.side) m.side = o.side;
  const metal = o.metal || 0, rough = o.rough != null ? o.rough : 0.82;
  // no PBR o metal quase não tinha difuso; no toon ele seria claro demais: escurece e deixa o brilho no reflexo pintado
  if (metal > 0.3) m.color.multiplyScalar(1 - metal * 0.45);
  stylize(m, { rim: o.rim != null ? o.rim : 0.3 + metal * 0.25, spec: metal > 0.3 ? 0.6 + metal * 0.6 : rough < 0.55 ? 0.35 : 0 });
  return m;
}
/** Material compartilhado (cache). Mantém a assinatura antiga toon(cor, emissivo, intensidade). */
export function toon(color, emissive, ei, o) {
  // o conjunto de textura entra na chave pelo nome (senão dois mapas diferentes colidiriam)
  const key = color + '|' + (emissive || 0) + '|' + (ei || 0) + '|' + (o ? JSON.stringify(o, (k, v) => (k === 'map' && v ? 'tex:' + v.key : v)) : '');
  let m = matCache.get(key);
  if (!m) { m = stdMat(color, emissive, ei, o); m.userData.shared = true; matCache.set(key, m); }
  return m;
}
/** Material próprio de um modelo (pisca ao levar dano). */
export function toonOwn(color, emissive, ei, o) {
  const m = stdMat(color, emissive, ei, o);
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEI = m.emissiveIntensity;
  return m;
}
/**
 * Material aditivo próprio (a opacidade pode ser animada por instância). Brilhos
 * "sólidos" (opacidade ≥ 0,8: orbes, olhos, núcleos, magias) saem em HDR, acima
 * do limiar do bloom; halos e auras translúcidos ficam como estão.
 */
export function glowMat(color, op) {
  op = op == null ? 0.6 : op;
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  if (op >= 0.8) m.color.multiplyScalar(CONFIG.style.glowCore);
  return m;
}
const glowCache = new Map();
/** Material aditivo compartilhado, para brilhos que não animam opacidade (projéteis). */
export function glowShared(color, op) {
  const key = color + '|' + op;
  let m = glowCache.get(key);
  if (!m) { m = glowMat(color, op); m.userData.shared = true; glowCache.set(key, m); }
  return m;
}
/** Libera materiais e geometrias próprios de um objeto (ignora os compartilhados). */
export function disposeObject(root, geometries) {
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData.shared) m.dispose();
    if ((geometries || o.userData.ownGeo) && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}
