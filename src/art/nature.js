// =============================================================================
// Vegetação e pedras do KayKit Forest Nature Pack (CC0, Kay Lousberg), já com a
// cor por vértice (ver tools/prep_nature.py). Devolve geometria pronta para o
// kit de adereços: mesmo material e instancing dos adereços gerados em código.
// =============================================================================
import { NATURE } from './natureData.js';

const _cache = {};
function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
/** Há o modelo `name` (ex.: 'Tree_1_A') embutido? */
export const hasNature = (name) => !!NATURE[name];
/**
 * Geometria (não indexada, como as do kit) do modelo `name`, com a cor
 * multiplicada por `tint` (hex, opcional) e escala uniforme `s`.
 */
export function natureGeo(name, tint, s) {
  const key = name + '|' + (tint || 0) + '|' + (s || 1);
  if (_cache[key]) return _cache[key].clone();
  const [sc, ctr, nv, ni, data] = NATURE[name], u = b64(data), dv = new DataView(u.buffer);
  const k = s || 1, t = new THREE.Color(tint == null ? 0xffffff : tint);
  const pos = new Float32Array(ni * 3), nor = new Float32Array(ni * 3), col = new Float32Array(ni * 3);
  const oN = nv * 6, oC = oN + nv * 3, oI = oC + nv * 3 + ((oC + nv * 3) % 2);
  for (let i = 0; i < ni; i++) {
    const v = dv.getUint16(oI + i * 2, true);
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] = (dv.getInt16(v * 6 + a * 2, true) / 32767 * sc[a] + ctr[a]) * k;
      nor[i * 3 + a] = dv.getInt8(oN + v * 3 + a) / 127;
    }
    // a textura vem em sRGB; o jogo trabalha com cores lineares
    const c = new THREE.Color().setRGB(u[oC + v * 3] / 255, u[oC + v * 3 + 1] / 255, u[oC + v * 3 + 2] / 255, THREE.SRGBColorSpace);
    col[i * 3] = c.r * t.r; col[i * 3 + 1] = c.g * t.g; col[i * 3 + 2] = c.b * t.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ni * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  _cache[key] = g;
  return g.clone();
}
