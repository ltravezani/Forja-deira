// =============================================================================
// Ícones das armas a partir dos modelos 3D do KayKit Fantasy Weapons Bits (CC0),
// embutidos em assets/models/weapons.glb (ver tools/prep_weapons.mjs). Cada modelo é
// desenhado uma única vez num renderer pequeno e próprio, que é descartado logo em
// seguida; o resultado vira uma imagem (data URL) e o inventário continua usando <img>.
// Se os modelos não carregarem, ui/icons.js usa os ícones SVG desenhados em código.
// =============================================================================
import { gltfProp } from './gltfModels.js';

/**
 * Arma de cada tier (0..9) por classe do item, na ordem de R.WEAPON_NAMES: "modelo" ou
 * "modelo#cor". A cor multiplica a textura e diferencia os modelos repetidos nos tiers altos.
 */
export const WEAPON_ICONS = {
  // Espada Curta (madeira), Longa, Katana (curva), de Batalha, Lâmina Relâmpago (rapieira), depois as lendárias
  dk: ['sword_A', 'sword_B', 'sword_C', 'sword_E', 'sword_D', 'sword_E#ff9a5a', 'sword_B#b49aff', 'sword_D#ffe27a', 'sword_C#c06aff', 'sword_E#9af0ff'],
  dw: ['staff_A', 'wand_A', 'staff_B', 'wand_A#ffd27a', 'staff_B#ffe27a', 'staff_A#c06aff', 'wand_A#9af0ff', 'staff_B#ff7a7a', 'staff_A#9a7aff', 'staff_B#ffffff'],
  elf: ['bow_A_withString', 'bow_B_withString', 'bow_A_withString#b8e0ff', 'bow_B_withString#ffd27a', 'bow_A_withString#dfe6f0', 'bow_B_withString#9af0ff', 'bow_A_withString#7ac8ff', 'bow_B_withString#ffb070', 'bow_A_withString#ffc8e8', 'bow_B_withString#ffffff'],
};
/** Pose base por modelo [giro em X, giro em Z]: os arcos vêm deitados e de lado. */
const POSE = { bow_A_withString: [Math.PI / 2, Math.PI / 2], bow_B_withString: [Math.PI / 2, Math.PI / 2] };

const SIZE = 128;
const ICONS = {};
let tried = false;

/** Chave "modelo" ou "modelo#cor" da arma de um item (null se o item não for arma). */
export function weaponModel(it) {
  const list = it && it.slot === 'weapon' && WEAPON_ICONS[it.cls];
  if (!list) return null;
  return list[Math.max(0, Math.min(list.length - 1, it.tier | 0))];
}
/** Data URL do ícone 3D da arma do item, ou null (sem modelos ou sem WebGL: use o ícone SVG). */
export function weaponIconURI(it) {
  const key = weaponModel(it);
  if (!key) return null;
  if (!tried && gltfProp('weapons')) {
    // todos de uma vez, na primeira vez que uma arma aparece (um contexto WebGL curto, liberado no fim)
    tried = true;
    const keys = new Set();
    for (const cls in WEAPON_ICONS) for (const k of WEAPON_ICONS[cls]) keys.add(k);
    Object.assign(ICONS, drawWeaponIcons([...keys]));
  }
  return ICONS[key] || null;
}

/** Desenha os ícones pedidos (lista de "modelo" ou "modelo#cor"); devolve { chave: data URL }. */
export function drawWeaponIcons(keys) {
  const res = {}, lib = gltfProp('weapons');
  if (!lib) return res;
  let r;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch { return res; }
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf2f0ff, 0x3a2c40, 1.6));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
  key.position.set(-2, 4, 6);
  const rim = new THREE.DirectionalLight(0xc8b4ff, 1.4);
  rim.position.set(3, -1, -4);
  scene.add(key, rim);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  cam.position.set(0, 0, 10);
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  const ctx = out.getContext('2d');
  for (const k of keys) {
    const [name, tint] = k.split('#');
    const src = lib.getObjectByName(name);
    if (!src) continue;
    const obj = src.clone(); // mantém a transformação do nó (a malha quantizada depende dela)
    const mats = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      // tom claro (metade branco) para não escurecer madeira e couro, e um brilho leve da mesma cor
      if (tint) { const c = new THREE.Color('#' + tint); m.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.4); m.emissive = c.multiplyScalar(0.12); }
      mats.push((o.material = m));
    });
    // pose de ícone: na diagonal (ponta para cima à direita) e um pouco girada para mostrar volume
    const pose = POSE[name] || [0, 0], lay = new THREE.Group(), spin = new THREE.Group(), turn = new THREE.Group(), pivot = new THREE.Group();
    lay.add(obj);
    lay.rotation.x = pose[0];
    spin.add(lay);
    spin.rotation.z = pose[1];
    turn.add(spin);
    turn.rotation.y = -0.5;
    pivot.add(turn);
    pivot.rotation.z = -Math.PI / 4;
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const half = Math.max(s.x, s.y) / 2 * 1.06;
    cam.left = c.x - half; cam.right = c.x + half; cam.top = c.y + half; cam.bottom = c.y - half;
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    // contorno escuro de 1,5 px (silhueta deslocada) para a arma não sumir no fundo do slot
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.filter = 'brightness(0)';
    for (let a = 0; a < 8; a++) ctx.drawImage(r.domElement, Math.cos(a * Math.PI / 4) * 1.5, Math.sin(a * Math.PI / 4) * 1.5);
    ctx.filter = 'none';
    ctx.drawImage(r.domElement, 0, 0);
    res[k] = out.toDataURL('image/png');
    scene.remove(pivot);
    for (const m of mats) m.dispose();
  }
  r.dispose();
  r.forceContextLoss();
  return res;
}
