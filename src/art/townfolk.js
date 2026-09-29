// =============================================================================
// Moradores e bichos da cidade: humanos de roupa simples (sem armadura) e
// animais pequenos (cachorro, gato, galinha, pombo, cavalo). Materiais
// compartilhados (cache de toon), então dezenas deles custam pouca memória.
// =============================================================================
import { GEO, part, pivot } from './geometry.js';
import { toon } from './materials.js';
import { addContactShadow } from './models.js';
import { texDetail } from './textures.js';

const D = (kind) => texDetail(kind);

/**
 * Junta, em cada pivô do modelo, as peças que usam o mesmo material numa só
 * malha (as articulações continuam animáveis). Um morador cai de ~45 para
 * ~15 chamadas de desenho. Peças com userData próprio (orbe, marcas) ficam soltas.
 */
export function mergeModelParts(root) {
  const groups = [];
  root.traverse((o) => { if (o.isGroup) groups.push(o); });
  for (const g of groups) {
    const byMat = new Map();
    for (const c of g.children) {
      if (!c.isMesh || Object.keys(c.userData).length) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      let n = 0;
      const parts = list.map((m) => {
        m.updateMatrix();
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        geo.applyMatrix4(m.matrix);
        n += geo.attributes.position.count;
        return geo;
      });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const geo of parts) {
        const c = geo.attributes.position.count;
        pos.set(geo.attributes.position.array, o * 3);
        if (geo.attributes.normal) nor.set(geo.attributes.normal.array, o * 3);
        if (geo.attributes.uv) uv.set(geo.attributes.uv.array, o * 2);
        o += c;
        geo.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.computeBoundingSphere();
      const mesh = new THREE.Mesh(out, mat);
      mesh.castShadow = list.some((m) => m.castShadow);
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
  return root;
}
const flat = (c, kind, o) => toon(c, 0, 0, Object.assign({ rough: 0.9, map: D(kind || 'cloth'), nscale: 0.7 }, o));

/**
 * Morador: túnica ou vestido, avental, calça, botinas, cabelo e chapéu.
 * Compatível com animateModel (kind 'humanoid': legs, arms, torso, body).
 * o: {skin, cloth, cloth2, hair, hat: 'straw'|'cap'|'scarf'|'hood'|null, hairStyle: 'short'|'long'|'bun'|'bald',
 *     dress, apron, beard, carry: 'basket'|'bucket'|'sack'|'lantern'|null, scale}
 */
export function buildVillager(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const skin = toon(o.skin || 0xe0b08a, 0, 0, { rough: 0.75, map: D('skin'), nscale: 0.6 });
  const cloth = flat(o.cloth || 0x6a4a3a);
  const cloth2 = flat(o.cloth2 || 0x4a4a52);
  const leather = flat(0x4a3020, 'leather');
  const hair = flat(o.hair || 0x3a2a1a, 'fur');
  const white = flat(0xe8e0cc);
  // pernas: calça + botina (ficam escondidas pela saia no vestido)
  const legs = [];
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.17, 0.7, 0);
    p.scale.set(1.1, 0.86, 1.1);
    part(GEO.taper, cloth2, 0.2, 0.52, 0.22, 0, -0.26, 0, p).rotation.x = Math.PI;
    part(GEO.box, leather, 0.22, 0.14, 0.34, 0, -0.72, 0.05, p);
    part(GEO.sphS, leather, 0.22, 0.15, 0.18, 0, -0.69, 0.19, p, false);
    legs.push(p);
  }
  const torso = pivot(body, 0, 0.74, 0);
  part(GEO.cyl, cloth, 0.62, 0.56, 0.44, 0, 0.42, 0, torso);
  part(GEO.sphS, cloth, 0.62, 0.3, 0.44, 0, 0.66, 0, torso, false);
  part(GEO.cyl, skin, 0.2, 0.12, 0.2, 0, 0.8, 0.01, torso, false); // pescoço
  if (o.dress) {
    part(GEO.robe, flat(o.cloth || 0x6a4a3a, 'cloth', { side: THREE.DoubleSide }), 0.95, 0.95, 0.9, 0, -0.18, 0, torso);
    part(GEO.cyl, cloth2, 0.64, 0.08, 0.46, 0, 0.26, 0, torso, false); // corpete
  } else {
    part(GEO.taper, cloth, 0.72, 0.4, 0.52, 0, 0.02, 0, torso); // barra da túnica
    part(GEO.cyl, leather, 0.64, 0.07, 0.46, 0, 0.2, 0, torso, false); // cinto
    part(GEO.box, flat(0xb08a3a, 'leather'), 0.09, 0.08, 0.04, 0, 0.2, 0.23, torso, false);
    part(GEO.box, leather, 0.13, 0.15, 0.1, 0.27, 0.1, 0.13, torso, false).rotation.y = 0.4; // bolsinha
  }
  if (o.apron) {
    part(GEO.box, white, 0.4, 0.62, 0.03, 0, -0.02, 0.24, torso, false);
    part(GEO.box, white, 0.3, 0.2, 0.03, 0, 0.44, 0.23, torso, false);
  }
  // braços: manga + antebraço + mão
  const arms = [];
  for (const sx of [-1, 1]) {
    const p = pivot(torso, sx * 0.38, 0.66, 0);
    part(GEO.taper, cloth, 0.17, 0.36, 0.18, 0, -0.17, 0, p).rotation.x = Math.PI;
    part(GEO.taper, skin, 0.12, 0.28, 0.13, 0, -0.46, 0, p).rotation.x = Math.PI;
    part(GEO.sphS, skin, 0.15, 0.15, 0.15, 0, -0.62, 0.02, p, false);
    arms.push(p);
  }
  // cabeça
  const head = pivot(torso, 0, 1.0, 0.02);
  head.scale.setScalar(o.child ? 1.55 : 1.35);
  part(GEO.sphS, skin, 0.44, 0.5, 0.46, 0, 0.08, 0, head);
  part(GEO.sphS, skin, 0.08, 0.08, 0.08, 0, 0.04, 0.24, head, false); // nariz
  for (const sx of [-1, 1]) part(GEO.sphS, skin, 0.08, 0.12, 0.06, sx * 0.22, 0.06, -0.02, head, false); // orelhas
  const dark = toon(0x15100c), glint = toon(0xffffff, 0xffffff, 0.6);
  for (const sx of [-1, 1]) {
    part(GEO.sphS, dark, 0.07, 0.1, 0.04, sx * 0.1, 0.11, 0.215, head, false);
    part(GEO.sphS, glint, 0.025, 0.025, 0.02, sx * 0.1 - 0.012, 0.13, 0.232, head, false);
    part(GEO.box, hair, 0.11, 0.025, 0.03, sx * 0.1, 0.19, 0.215, head, false).rotation.z = sx * 0.12;
  }
  const hs = o.hairStyle || 'short';
  if (hs !== 'bald') part(GEO.sphH, hair, 0.48, 0.3, 0.5, 0, 0.16, -0.03, head);
  if (hs === 'long') { part(GEO.box, hair, 0.42, 0.56, 0.14, 0, -0.08, -0.2, head); for (const sx of [-1, 1]) part(GEO.box, hair, 0.08, 0.4, 0.12, sx * 0.22, -0.02, -0.06, head, false); }
  if (hs === 'bun') part(GEO.sphS, hair, 0.22, 0.2, 0.22, 0, 0.3, -0.22, head, false);
  if (o.beard) { part(GEO.sphS, hair, 0.34, 0.26, 0.2, 0, -0.1, 0.16, head); part(GEO.box, hair, 0.2, 0.05, 0.04, 0, 0.0, 0.245, head, false); }
  else part(GEO.box, flat(0x8a4a3a, 'skin'), 0.09, 0.02, 0.02, 0, -0.04, 0.23, head, false); // boca
  const hat = o.hat;
  if (hat === 'straw') {
    const st = flat(0xd8b868, 'leather');
    part(GEO.cyl, st, 0.86, 0.04, 0.86, 0, 0.3, 0, head);
    part(GEO.taper, st, 0.46, 0.2, 0.46, 0, 0.42, 0, head).rotation.x = Math.PI;
    part(GEO.cyl, flat(0x8a2a2a), 0.47, 0.05, 0.47, 0, 0.35, 0, head, false);
  } else if (hat === 'cap') {
    part(GEO.sphH, cloth2, 0.54, 0.32, 0.54, 0, 0.2, 0, head);
    part(GEO.cone, cloth2, 0.2, 0.36, 0.2, 0, 0.42, -0.14, head).rotation.x = -1.1;
  } else if (hat === 'scarf') {
    part(GEO.sphH, cloth2, 0.54, 0.4, 0.56, 0, 0.14, -0.02, head);
    part(GEO.cyl, cloth2, 0.5, 0.06, 0.52, 0, 0.14, 0, head, false);
    part(GEO.sphS, cloth2, 0.12, 0.1, 0.1, 0, 0.05, -0.28, head, false); // nó
  } else if (hat === 'hood') {
    part(GEO.sphS, cloth2, 0.58, 0.58, 0.6, 0, 0.14, -0.06, head);
    part(GEO.cone, cloth2, 0.3, 0.4, 0.3, 0, 0.36, -0.26, head, false).rotation.x = -1.2;
  }
  // o que carrega na mão esquerda
  const hand = pivot(arms[0], 0, -0.66, 0.08);
  if (o.carry === 'basket') {
    const wick = flat(0x9a6a34, 'leather');
    part(GEO.taper, wick, 0.36, 0.22, 0.28, 0, -0.18, 0.06, hand).rotation.x = Math.PI;
    part(GEO.torus, wick, 0.3, 0.3, 0.4, 0, -0.08, 0.06, hand, false);
    for (let i = 0; i < 3; i++) part(GEO.sphS, flat([0xc83a2a, 0xe8c040, 0x6aa040][i], 'skin'), 0.1, 0.1, 0.1, -0.08 + i * 0.08, -0.06, 0.06 + (i % 2) * 0.04, hand, false);
  } else if (o.carry === 'bucket') {
    part(GEO.taper, flat(0x7a5634, 'leather'), 0.26, 0.26, 0.26, 0, -0.26, 0, hand).rotation.x = Math.PI;
    part(GEO.cyl, toon(0x3a6a9a, 0x0a2a4a, 0.4), 0.22, 0.01, 0.22, 0, -0.14, 0, hand, false);
    part(GEO.torus, flat(0x4e4e5a, 'metal'), 0.24, 0.24, 0.4, 0, -0.12, 0, hand, false);
  } else if (o.carry === 'sack') {
    const s = pivot(torso, 0, 0.62, -0.22);
    s.rotation.z = 0.4;
    part(GEO.sphS, flat(0xb8a078, 'cloth'), 0.42, 0.56, 0.34, 0.1, 0.1, 0, s);
    part(GEO.cyl6, flat(0x6a5a3a), 0.12, 0.1, 0.12, 0.1, 0.4, 0, s, false);
  } else if (o.carry === 'lantern') {
    part(GEO.box, flat(0x2a2a30, 'metal'), 0.14, 0.03, 0.14, 0, -0.08, 0, hand, false);
    part(GEO.box, toon(0xffc070, 0xffa040, 1.4), 0.12, 0.16, 0.12, 0, -0.18, 0, hand, false);
    part(GEO.cone4, flat(0x2a2a30, 'metal'), 0.18, 0.08, 0.18, 0, -0.05, 0, hand, false).rotation.y = Math.PI / 4;
  }
  const S = (o.scale || 1) * 1.1;
  root.scale.setScalar(S);
  mergeModelParts(root);
  const m = { root, kind: 'humanoid', body, torso, head, legs, arms, weapon: null, cape: null, mats: [], height: 2.3 * S };
  addContactShadow(m, [0.55, 0.55]);
  return m;
}

// ---------- bichos ----------
/**
 * Bicho da cidade, olhando para +z. o.type: 'dog' | 'cat' | 'chicken' | 'pigeon' | 'horse'.
 * Retorna {root, kind: 'critter', type, body, head, legs, tail, wings?, height}.
 */
export function buildCritter(o) {
  const B = { dog: critterDog, cat: critterCat, chicken: critterBird, pigeon: critterBird, horse: critterHorse }[o.type] || critterDog;
  const m = B(o);
  mergeModelParts(m.root);
  m.type = o.type;
  m.kind = 'critter';
  const r = { dog: 0.5, cat: 0.36, chicken: 0.3, pigeon: 0.22, horse: 1.0 }[o.type] || 0.4;
  addContactShadow(m, [r / (m.root.scale.x || 1), 0.5]);
  return m;
}
function eyes(head, y, z, dx, s, color) {
  const dark = toon(color || 0x15100c), glint = toon(0xffffff, 0xffffff, 0.6);
  for (const sx of [-1, 1]) {
    part(GEO.sphS, dark, s, s * 1.1, s * 0.6, sx * dx, y, z, head, false);
    part(GEO.sphS, glint, s * 0.35, s * 0.35, s * 0.2, sx * dx - s * 0.15, y + s * 0.2, z + s * 0.25, head, false);
  }
}
function critterDog(o) {
  const root = new THREE.Group();
  const fur = flat(o.fur || 0x9a6a3a, 'fur'), fur2 = flat(o.fur2 || 0xe8dcc0, 'fur'), dark = flat(0x2a1a14, 'leather');
  const body = pivot(root, 0, 0.52, 0);
  part(GEO.cap, fur, 0.36, 0.34, 0.36, 0, 0, -0.02, body).rotation.x = Math.PI / 2;
  part(GEO.sphS, fur2, 0.36, 0.34, 0.3, 0, -0.02, 0.2, body, false); // peito claro
  part(GEO.cyl, flat(o.collar || 0xb02a2a), 0.26, 0.06, 0.26, 0, 0.12, 0.34, body, false).rotation.x = 0.6;
  const head = pivot(body, 0, 0.26, 0.4);
  part(GEO.sphS, fur, 0.36, 0.32, 0.34, 0, 0, 0, head);
  part(GEO.taper, fur2, 0.18, 0.22, 0.16, 0, -0.05, 0.2, head).rotation.x = -Math.PI / 2; // focinho
  part(GEO.sphS, dark, 0.09, 0.07, 0.07, 0, -0.02, 0.31, head, false); // nariz
  part(GEO.box, toon(0xd05a6a), 0.07, 0.02, 0.1, 0, -0.12, 0.24, head, false).rotation.x = 0.4; // língua
  eyes(head, 0.06, 0.15, 0.09, 0.05);
  for (const sx of [-1, 1]) { const e = part(GEO.box, flat(o.ear || 0x6a4424, 'fur'), 0.12, 0.2, 0.05, sx * 0.17, 0.04, -0.02, head, false); e.rotation.z = sx * 0.35; e.rotation.x = 0.2; }
  const legs = [];
  for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.22], [0.12, -0.22]]) {
    const p = pivot(body, x, -0.08, z);
    part(GEO.cyl6, fur, 0.1, 0.4, 0.1, 0, -0.2, 0, p);
    part(GEO.sphS, fur2, 0.12, 0.08, 0.14, 0, -0.42, 0.03, p, false);
    legs.push(p);
  }
  const tail = pivot(body, 0, 0.1, -0.34);
  part(GEO.cone, fur, 0.1, 0.34, 0.1, 0, 0.14, -0.06, tail).rotation.x = -0.5;
  root.scale.setScalar(o.scale || 1);
  return { root, body, head, legs, tail, height: 1.1 * (o.scale || 1), bodyY: 0.52 };
}
function critterCat(o) {
  const root = new THREE.Group();
  const fur = flat(o.fur || 0x3a3a40, 'fur'), fur2 = flat(o.fur2 || o.fur || 0x3a3a40, 'fur');
  const body = pivot(root, 0, 0.34, 0);
  part(GEO.cap, fur, 0.24, 0.26, 0.24, 0, 0, 0, body).rotation.x = Math.PI / 2;
  part(GEO.sphS, fur2, 0.24, 0.22, 0.2, 0, -0.02, 0.16, body, false);
  const head = pivot(body, 0, 0.18, 0.3);
  part(GEO.sphS, fur, 0.28, 0.24, 0.24, 0, 0, 0, head);
  part(GEO.sphS, fur2, 0.14, 0.09, 0.08, 0, -0.04, 0.11, head, false);
  part(GEO.sphS, toon(0xe07a8a), 0.04, 0.03, 0.03, 0, -0.01, 0.15, head, false);
  eyes(head, 0.04, 0.11, 0.065, 0.04, 0x6aa030);
  for (const sx of [-1, 1]) part(GEO.cone4, fur, 0.1, 0.14, 0.06, sx * 0.09, 0.14, -0.01, head, false).rotation.z = -sx * 0.25;
  const legs = [];
  for (const [x, z] of [[-0.08, 0.13], [0.08, 0.13], [-0.08, -0.15], [0.08, -0.15]]) {
    const p = pivot(body, x, -0.06, z);
    part(GEO.cyl6, fur, 0.07, 0.28, 0.07, 0, -0.14, 0, p);
    part(GEO.sphS, fur2, 0.08, 0.05, 0.1, 0, -0.28, 0.02, p, false);
    legs.push(p);
  }
  const tail = pivot(body, 0, 0.06, -0.24);
  part(GEO.cyl6, fur, 0.06, 0.34, 0.06, 0, 0.15, -0.06, tail).rotation.x = -0.4;
  part(GEO.cyl6, fur, 0.055, 0.22, 0.055, 0, 0.36, -0.02, tail, false).rotation.x = 0.4;
  root.scale.setScalar(o.scale || 1);
  return { root, body, head, legs, tail, height: 0.7 * (o.scale || 1), bodyY: 0.34 };
}
/** Galinha ou pombo: corpo redondo, asas que batem, cabeça que bica. */
function critterBird(o) {
  const hen = o.type === 'chicken';
  const root = new THREE.Group();
  const plume = flat(o.fur || (hen ? 0xf0e8d8 : 0x8a8e9a), 'fur');
  const wingC = flat(o.fur2 || (hen ? 0xd8ccb8 : 0x6a6e7a), 'fur');
  const beakC = flat(0xe8a830, 'skin');
  const s = hen ? 1 : 0.62;
  const body = pivot(root, 0, 0.3 * s, 0);
  part(GEO.sphS, plume, 0.36 * s, 0.32 * s, 0.46 * s, 0, 0, 0, body);
  if (!hen) part(GEO.sphS, flat(0x5a8a7a, 'metal', { metal: 0.4, rough: 0.4 }), 0.26 * s, 0.24 * s, 0.22 * s, 0, 0.12 * s, 0.14 * s, body, false); // pescoço furta-cor
  // rabo
  const tail = pivot(body, 0, 0.06 * s, -0.2 * s);
  for (let i = -1; i <= 1; i++) part(GEO.cone, hen ? (i ? wingC : flat(0x2a2a2a, 'fur')) : wingC, 0.1 * s, 0.26 * s, 0.05 * s, i * 0.06 * s, 0.1 * s, -0.04 * s, tail, false).rotation.set(-0.8, 0, i * 0.3);
  const head = pivot(body, 0, 0.2 * s, 0.2 * s);
  part(GEO.sphS, plume, 0.22 * s, 0.24 * s, 0.22 * s, 0, 0.06 * s, 0, head);
  part(GEO.cone4, beakC, 0.07 * s, 0.12 * s, 0.07 * s, 0, 0.04 * s, 0.13 * s, head, false).rotation.x = Math.PI / 2;
  eyes(head, 0.1 * s, 0.07 * s, 0.075 * s, 0.035 * s);
  if (hen) {
    const red = flat(0xd02a2a, 'skin');
    for (let i = 0; i < 3; i++) part(GEO.sphS, red, 0.05, 0.08, 0.06, 0, 0.19 + (i === 1 ? 0.02 : 0), -0.04 + i * 0.05, head, false);
    part(GEO.sphS, red, 0.04, 0.07, 0.04, 0, -0.04, 0.1, head, false);
  }
  const wings = [];
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.16 * s, 0.06 * s, 0);
    part(GEO.sphS, wingC, 0.08 * s, 0.24 * s, 0.36 * s, sx * 0.03 * s, -0.04 * s, -0.02 * s, p);
    wings.push(p);
  }
  const legs = [];
  const legC = flat(0xe8a030, 'skin');
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.08 * s, -0.1 * s, 0.02 * s);
    part(GEO.cyl6, legC, 0.035 * s, 0.22 * s, 0.035 * s, 0, -0.1 * s, 0, p, false);
    part(GEO.box, legC, 0.1 * s, 0.02 * s, 0.12 * s, 0, -0.2 * s, 0.03 * s, p, false);
    legs.push(p);
  }
  return { root, body, head, legs, tail, wings, height: 0.7 * s, bodyY: 0.3 * s };
}
function critterHorse(o) {
  const root = new THREE.Group();
  const coat = flat(o.fur || 0x7a4a2a, 'fur'), mane = flat(o.fur2 || 0x2a1a12, 'fur'), hoof = flat(0x2a2220, 'leather');
  const body = pivot(root, 0, 1.25, 0);
  part(GEO.cap, coat, 0.78, 0.8, 0.78, 0, 0, 0, body).rotation.x = Math.PI / 2;
  // sela/arreio
  part(GEO.box, flat(0x5a2a1a, 'leather'), 0.84, 0.1, 0.6, 0, 0.36, 0.05, body, false);
  part(GEO.box, flat(0xa01a2a), 0.86, 0.3, 0.5, 0, 0.24, 0.05, body, false);
  const neck = pivot(body, 0, 0.2, 0.6);
  neck.rotation.x = 0.55;
  part(GEO.taper, coat, 0.38, 0.8, 0.46, 0, 0.3, 0, neck);
  for (let i = 0; i < 5; i++) part(GEO.box, mane, 0.08, 0.22, 0.16, 0, 0.1 + i * 0.16, -0.2, neck, false);
  const head = pivot(neck, 0, 0.72, 0.04);
  head.rotation.x = -0.25;
  part(GEO.box, coat, 0.3, 0.3, 0.3, 0, 0, 0, head);
  part(GEO.taper, coat, 0.26, 0.5, 0.24, 0, 0.02, 0.3, head).rotation.x = Math.PI / 2;
  part(GEO.sphS, flat(0x3a2a22, 'skin'), 0.24, 0.2, 0.18, 0, 0.0, 0.56, head, false);
  part(GEO.box, flat(0xe8dcc0, 'fur'), 0.08, 0.02, 0.4, 0, 0.14, 0.26, head, false); // lista branca
  eyes(head, 0.08, 0.02, 0.15, 0.05);
  for (const sx of [-1, 1]) part(GEO.cone4, coat, 0.08, 0.2, 0.06, sx * 0.1, 0.2, -0.1, head, false).rotation.x = -0.9;
  const legs = [];
  for (const [x, z] of [[-0.24, 0.5], [0.24, 0.5], [-0.24, -0.5], [0.24, -0.5]]) {
    const p = pivot(body, x, -0.2, z);
    part(GEO.taper, coat, 0.2, 0.5, 0.22, 0, -0.2, 0, p).rotation.x = Math.PI;
    part(GEO.cyl6, coat, 0.12, 0.5, 0.12, 0, -0.66, 0, p);
    part(GEO.cyl6, hoof, 0.16, 0.12, 0.16, 0, -0.96, 0.01, p, false);
    legs.push(p);
  }
  const tail = pivot(body, 0, 0.2, -0.76);
  part(GEO.cone, mane, 0.24, 0.9, 0.2, 0, -0.4, -0.1, tail).rotation.x = Math.PI - 0.3;
  root.scale.setScalar(o.scale || 1);
  return { root, body, head, legs, tail, neck, height: 2.4, bodyY: 1.25 };
}

/**
 * Anima um bicho. s: {t, moving, speed, peck (0..1), sit (0..1), fly (0..1), graze (0..1), wag}
 */
export function animateCritter(m, s) {
  const t = s.t, mv = s.moving ? 1 : 0, ph = t * (s.speed || 10);
  const bird = m.type === 'chicken' || m.type === 'pigeon';
  if (bird) {
    m.legs[0].rotation.x = Math.sin(ph * 1.4) * 0.7 * mv * (1 - (s.fly || 0));
    m.legs[1].rotation.x = -Math.sin(ph * 1.4) * 0.7 * mv * (1 - (s.fly || 0));
    m.body.position.y = m.bodyY + Math.abs(Math.sin(ph * 1.4)) * 0.03 * mv;
    m.body.rotation.x = (s.peck || 0) * 0.7;
    m.head.rotation.x = (s.peck || 0) * 0.5 + Math.sin(t * 3.1) * 0.05;
    m.head.position.z = m.head.userData.z0 == null ? (m.head.userData.z0 = m.head.position.z) : m.head.userData.z0 + Math.sin(ph * 1.4) * 0.03 * mv;
    const f = s.fly ? Math.sin(t * 28) * 1.1 * s.fly : s.flap ? Math.sin(t * 22) * 0.6 : 0;
    m.wings[0].rotation.z = -Math.abs(f) - (s.fly ? 0.3 : 0);
    m.wings[1].rotation.z = Math.abs(f) + (s.fly ? 0.3 : 0);
    return;
  }
  const sit = s.sit || 0;
  m.legs[0].rotation.x = Math.sin(ph) * 0.8 * mv;
  m.legs[3].rotation.x = Math.sin(ph) * 0.8 * mv;
  m.legs[1].rotation.x = -Math.sin(ph) * 0.8 * mv;
  m.legs[2].rotation.x = -Math.sin(ph) * 0.8 * mv - sit * 1.3;
  m.legs[3].rotation.x += -sit * 1.3;
  m.body.rotation.x = -sit * 0.45;
  m.body.position.y = m.bodyY * (1 - sit * 0.3) + Math.abs(Math.sin(ph)) * 0.04 * mv * m.bodyY;
  if (m.type === 'horse') {
    m.tail.rotation.z = Math.sin(t * 1.3) * 0.25;
    const g = s.graze || 0;
    m.neck.rotation.x = 0.55 + g * 1.1;
    m.head.rotation.x = -0.25 + g * 0.5 + Math.sin(t * 2.2) * 0.05 * g;
    return;
  }
  const wag = s.wag ? 12 : m.type === 'cat' ? 1.4 : 4;
  m.tail.rotation.y = Math.sin(t * wag) * (m.type === 'cat' ? 0.35 : 0.5);
  m.head.rotation.x = Math.sin(t * 1.3) * 0.06 + (s.look || 0);
  m.head.rotation.y = s.turn || 0;
}
