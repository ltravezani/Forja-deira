// ---------- armas ----------
/** Arma presa à mão. Retorna o grupo da arma (com orbe marcado em userData.orb). */
import { GEO, part, pivot } from './geometry.js';
import { animateGltf, buildGltfHumanoid, hasGltf } from './gltfModels.js';
import { disposeObject, glowMat, toon, toonOwn } from './materials.js';
import { texDetail, texRock } from './textures.js';

/** Atalho: conjunto de textura de detalhe por tipo de superfície. */
const D = (kind) => texDetail(kind);
/** Escala geral por tipo: personagens maiores em relação ao cenário (leitura cartoon). */
const CARTOON = { humanoid: 1.2, spider: 1.1, beast: 1.15, floater: 1.12, bat: 1.15, golem: 1.08 };

function buildWeapon(hand, arms, o, M) {
  const wk = o.weapon === 'blade' ? 'sword' : o.weapon === 'rod' ? 'staff' : o.weapon || 'none';
  const wc = o.weaponColor || 0xb8c0cc, wg = o.weaponGlow || 0;
  const steel = toon(wc, wg, wg ? 0.7 : 0, { metal: 0.85, rough: 0.32, env: 1.1 });
  const leather = toon(0x3a2418, 0, 0, { rough: 0.9, map: D('leather') });
  const gold = toon(0x9a7a3a, 0, 0, { metal: 0.9, rough: 0.35, env: 1.2 });
  const iron = toon(0x3a3a40, 0, 0, { metal: 0.7, rough: 0.5, map: D('metal') });
  let weapon = null;
  if (wk === 'sword') {
    weapon = pivot(hand, 0, 0, 0);
    weapon.rotation.x = Math.PI / 2;
    const L = o.bulky ? 1.35 : 1.05;
    part(GEO.cyl, leather, 0.07, 0.3, 0.07, 0, -0.04, 0, weapon);
    part(GEO.sphS, gold, 0.12, 0.12, 0.12, 0, -0.22, 0, weapon);
    part(GEO.box, gold, 0.42, 0.06, 0.09, 0, 0.12, 0, weapon);
    part(GEO.cone4, gold, 0.07, 0.1, 0.07, -0.22, 0.12, 0, weapon).rotation.z = Math.PI / 2;
    part(GEO.cone4, gold, 0.07, 0.1, 0.07, 0.22, 0.12, 0, weapon).rotation.z = -Math.PI / 2;
    part(GEO.blade, steel, 0.13, L, 0.035, 0, 0.15 + L / 2, 0, weapon);
    part(GEO.box, toon(0x2a2a30, wg, wg ? 1.2 : 0, { metal: 0.6, rough: 0.4 }), 0.025, L * 0.7, 0.04, 0, 0.15 + L * 0.4, 0, weapon, false);
  } else if (wk === 'club') {
    weapon = pivot(hand, 0, 0, 0);
    weapon.rotation.x = Math.PI / 2;
    part(GEO.cyl, toon(0x4a3020, 0, 0, { rough: 0.95 }), 0.1, 0.85, 0.1, 0, 0.3, 0, weapon);
    part(GEO.cyl6, iron, 0.14, 0.06, 0.14, 0, 0.0, 0, weapon);
    part(GEO.dod, iron, 0.32, 0.32, 0.32, 0, 0.72, 0, weapon).castShadow = true;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const s = part(GEO.cone, iron, 0.07, 0.18, 0.07, Math.cos(a) * 0.17, 0.72 + (i % 2 ? 0.08 : -0.08), Math.sin(a) * 0.17, weapon, false); s.rotation.z = -Math.cos(a) * 1.4; s.rotation.x = Math.sin(a) * 1.4; }
  } else if (wk === 'staff') {
    weapon = pivot(hand, 0, 0, 0);
    const wood = toon(0x3a2616, 0, 0, { rough: 0.95 });
    part(GEO.cyl6, wood, 0.08, 1.2, 0.08, 0, 0.1, 0, weapon);
    part(GEO.cyl6, wood, 0.07, 0.8, 0.07, 0.02, 1.05, 0, weapon).rotation.z = -0.08;
    part(GEO.torusF, gold, 0.14, 0.14, 0.14, 0, -0.1, 0, weapon).rotation.x = Math.PI / 2;
    // garras segurando o orbe
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const c = part(GEO.cone, wood, 0.06, 0.45, 0.06, Math.cos(a) * 0.14, 1.45, Math.sin(a) * 0.14, weapon); c.rotation.z = -Math.cos(a) * 0.5; c.rotation.x = Math.sin(a) * 0.5; }
    const orb = part(GEO.sphS, glowMat(wg || 0x7aa8ff, 0.95), 0.26, 0.26, 0.26, 0, 1.5, 0, weapon, false);
    orb.userData.orb = true;
    part(GEO.sphS, glowMat(wg || 0x7aa8ff, 0.25), 0.55, 0.55, 0.55, 0, 1.5, 0, weapon, false);
  } else if (wk === 'bow') {
    weapon = pivot(arms[0], 0, -0.6, 0.1);
    // madeira sempre marrom; a raridade só tinge levemente (antes o arco ficava cinza-claro)
    const woodC = new THREE.Color(0x5a3418).lerp(new THREE.Color(wc), wc === 0xb8c0cc ? 0 : 0.2).getHex();
    const wood = toon(woodC, wg, wg ? 0.6 : 0, { rough: 0.7, map: D('leather') });
    const b = part(GEO.torus, wood, 1.3, 1.3, 1.6, 0, 0, 0, weapon);
    b.rotation.z = Math.PI / 2; b.rotation.y = Math.PI / 2;
    part(GEO.cyl, leather, 0.07, 0.22, 0.07, 0, 0, 0, weapon);
    part(GEO.cyl, toon(0xd8d0c0), 0.012, 1.3, 0.012, 0, 0, -0.02, weapon, false);
  }
  if (o.shield) {
    const sh = pivot(arms[0], 0, -0.42, 0.18);
    sh.rotation.y = 0.25;
    const face = toonOwn(o.shieldColor || o.cloth || 0x5a2020, 0, 0, { rough: 0.7, map: D('leather') });
    M.push(face);
    const s = part(GEO.shield, face, 0.62, 0.7, 0.9, -0.12, 0, 0.05, sh);
    s.rotation.y = -Math.PI / 2;
    part(GEO.sphS, iron, 0.16, 0.16, 0.1, -0.2, 0.06, 0.05, sh).rotation.y = -Math.PI / 2;
    part(GEO.box, gold, 0.03, 0.08, 0.62, -0.18, 0.3, 0.05, sh, false);
  }
  return weapon;
}

// ---------- humanoide ----------
/**
 * Humanoide medieval (proporções levemente heroicas).
 * o: {skin, cloth, armor, trim, head, weapon, robe, bulky, thin, scale, crown, horns, cape, hair, eye, shield, trimGlow, plume}
 */
export function buildHumanoid(o) {
  if (hasGltf(o)) return buildAnimatedHumanoid(o);
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const mats = [];
  const M = (c, e, ei, x) => { const m = toonOwn(c, e, ei, x); mats.push(m); return m; };
  const skel = o.head === 'skull' && o.thin;
  const skin = M(o.skin || 0xd0a080, 0, 0, { rough: skel ? 0.6 : 0.75, map: D(skel ? 'bone' : 'skin'), nscale: 0.6 });
  const cloth = M(o.cloth || 0x4a3a2a, 0, 0, { rough: 0.95, map: D('cloth'), nscale: 0.7 });
  const armor = M(o.armor || o.cloth || 0x5a5a66, 0, 0, { metal: 0.75, rough: 0.42, env: 1, map: D('metal'), nscale: 0.6 });
  const trim = M(o.trim || 0x8a6a2a, o.trimGlow ? o.trim : 0, o.trimGlow ? 0.7 : 0, { metal: 0.9, rough: 0.35, env: 1.2, map: D('metal'), nscale: 0.4 });
  const leather = M(0x3a2618, 0, 0, { rough: 0.85, map: D('leather') });
  const w = o.bulky ? 1.22 : o.thin ? 0.8 : 1;
  // pernas
  const legs = [];
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.2 * w, 0.7, 0);
    p.scale.set(1.18, 0.86, 1.18); // pernas curtas e grossas (proporção cartoon)
    if (skel) {
      part(GEO.cyl6, skin, 0.08, 0.4, 0.08, 0, -0.2, 0, p);
      part(GEO.sphS, skin, 0.12, 0.12, 0.12, 0, -0.42, 0, p);
      part(GEO.cyl6, skin, 0.07, 0.36, 0.07, 0, -0.6, 0, p);
      part(GEO.box, skin, 0.14, 0.06, 0.26, 0, -0.78, 0.06, p);
    } else {
      part(GEO.taper, o.thin ? skin : cloth, 0.24 * w, 0.42, 0.26, 0, -0.2, 0, p).rotation.x = Math.PI;
      part(GEO.sphS, armor, 0.2 * w, 0.16, 0.2, 0, -0.44, 0.06, p);
      part(GEO.taper, armor, 0.21 * w, 0.3, 0.23, 0, -0.6, 0.01, p).rotation.x = Math.PI;
      part(GEO.box, leather, 0.3 * w, 0.17, 0.46, 0, -0.74, 0.1, p); // botas grandes
      part(GEO.sphS, leather, 0.3 * w, 0.2, 0.26, 0, -0.7, 0.26, p, false); // bico arredondado
      part(GEO.box, armor, 0.22 * w, 0.06, 0.14, 0, -0.64, 0.25, p, false);
    }
    legs.push(p);
  }
  const torso = pivot(body, 0, 0.74, 0);
  if (skel) {
    // pélvis, coluna e costelas
    part(GEO.box, skin, 0.36, 0.12, 0.18, 0, 0.02, 0, torso);
    part(GEO.cyl6, skin, 0.07, 0.72, 0.07, 0, 0.4, -0.06, torso);
    for (let i = 0; i < 4; i++) { const r = part(GEO.torus, skin, 0.46 - i * 0.03, 0.34, 0.5, 0, 0.52 + i * 0.1, 0.02, torso); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI; }
    part(GEO.box, cloth, 0.5, 0.24, 0.3, 0, 0.06, 0, torso); // tanga rasgada
    part(GEO.box, armor, 0.62, 0.1, 0.3, 0, 0.8, 0, torso);
  } else {
    part(GEO.cyl, armor, 0.76 * w, 0.54, 0.5, 0, 0.46, 0, torso); // peito largo
    part(GEO.sphS, armor, 0.74 * w, 0.34, 0.5, 0, 0.66, 0.02, torso, false); // ombros arredondados
    part(GEO.box, trim, 0.08, 0.44, 0.06, 0, 0.44, 0.21, torso, false); // nervura do peitoral
    part(GEO.cyl, cloth, 0.6 * w, 0.24, 0.38, 0, 0.08, 0, torso);
    part(GEO.cyl, leather, 0.64 * w, 0.08, 0.41, 0, 0.18, 0, torso); // cinto
    part(GEO.box, trim, 0.12, 0.1, 0.05, 0, 0.18, 0.21, torso, false); // fivela
    part(GEO.cyl, armor, 0.3, 0.1, 0.3, 0, 0.74, 0, torso); // gorjal
    // bolsas no cinto (dos lados, visíveis de cima) com aba e botão
    for (const sx of [-1, 1]) {
      part(GEO.box, leather, 0.14, 0.16, 0.12, sx * 0.3 * w, 0.1, 0.12, torso, false).rotation.y = sx * 0.4;
      part(GEO.box, leather, 0.15, 0.05, 0.13, sx * 0.3 * w, 0.19, 0.125, torso, false).rotation.y = sx * 0.4;
      part(GEO.sphS, trim, 0.035, 0.035, 0.035, sx * 0.33 * w, 0.17, 0.18, torso, false);
    }
    // tabardo na frente e atrás
    part(GEO.box, cloth, 0.34 * w, 0.46, 0.03, 0, -0.14, 0.2, torso);
    part(GEO.box, cloth, 0.34 * w, 0.46, 0.03, 0, -0.14, -0.2, torso);
    part(GEO.box, trim, 0.34 * w, 0.03, 0.035, 0, -0.36, 0.2, torso, false);
  }
  if (o.robe) {
    part(GEO.robe, cloth, 1.0 * w, 1.05, 1.0, 0, -0.2, 0, torso).material.side = THREE.DoubleSide;
    part(GEO.cyl, trim, 0.5 * w, 0.04, 0.5, 0, 0.3, 0, torso, false);
    // barra com runas que brilham na cor da magia
    const hem = part(GEO.torusF, glowMat(o.weaponGlow || o.trim || 0x7aa8ff, 0.4), 0.94 * w, 0.94, 0.35, 0, -0.62, 0, torso, false);
    hem.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(GEO.box, hem.material, 0.05, 0.1, 0.02, Math.sin(a) * 0.43 * w, -0.5, Math.cos(a) * 0.43, torso, false).rotation.y = a; }
    // mantelete sobre os ombros e grimório preso ao cinto
    part(GEO.sphH, cloth, 0.95 * w, 0.42, 0.66, 0, 0.62, 0, torso);
    part(GEO.cyl, trim, 0.62 * w, 0.03, 0.44, 0, 0.62, 0, torso, false);
    const book = pivot(torso, 0.34 * w, 0.02, 0.12);
    book.rotation.set(0.1, 0.5, 0.15);
    part(GEO.box, leather, 0.2, 0.26, 0.08, 0, 0, 0, book);
    part(GEO.box, toon(0xe8dcc0), 0.17, 0.23, 0.085, 0.015, 0, 0, book, false);
    part(GEO.oct, glowMat(o.weaponGlow || 0x7aa8ff, 0.9), 0.06, 0.08, 0.03, 0, 0, 0.045, book, false);
  }
  // aljava nas costas (arqueiros): couro, faixa, flechas com penas
  if (o.weapon === 'bow' && !skel) {
    const q = pivot(torso, 0.12, 0.5, -0.3);
    q.rotation.set(-0.25, 0, -0.35);
    part(GEO.cyl, leather, 0.2, 0.62, 0.2, 0, 0, 0, q);
    part(GEO.cyl, trim, 0.22, 0.04, 0.22, 0, 0.26, 0, q, false);
    part(GEO.cyl, trim, 0.22, 0.04, 0.22, 0, -0.22, 0, q, false);
    const shaft = toon(0x8a6a44), feather = toon(o.trim && o.trimGlow ? o.trim : 0xe8e0d0);
    for (let i = 0; i < 5; i++) {
      const ax = Math.cos(i * 1.3) * 0.05, az = Math.sin(i * 1.3) * 0.05;
      part(GEO.cyl6, shaft, 0.02, 0.3, 0.02, ax, 0.4, az, q, false);
      part(GEO.cone4, feather, 0.07, 0.12, 0.02, ax, 0.52, az, q, false).rotation.y = i;
    }
    part(GEO.box, leather, 0.05, 0.9, 0.03, -0.1, 0.1, 0.24, torso, false).rotation.z = 0.7; // correia no peito
  }
  // braços
  const arms = [];
  for (const sx of [-1, 1]) {
    const p = pivot(torso, sx * 0.5 * w, 0.68, 0);
    p.scale.set(1.18, 0.94, 1.18);
    if (skel) {
      part(GEO.cyl6, skin, 0.07, 0.3, 0.07, 0, -0.16, 0, p);
      part(GEO.cyl6, skin, 0.06, 0.28, 0.06, 0, -0.44, 0, p);
      part(GEO.box, skin, 0.1, 0.12, 0.08, 0, -0.62, 0, p);
    } else {
      part(GEO.taper, o.thin ? skin : cloth, 0.17 * w, 0.32, 0.18, 0, -0.16, 0, p).rotation.x = Math.PI;
      part(GEO.sphS, armor, 0.17 * w, 0.15, 0.17, 0, -0.34, 0, p);
      part(GEO.taper, armor, 0.16 * w, 0.26, 0.17, 0, -0.48, 0, p).rotation.x = Math.PI;
      part(GEO.box, leather, 0.17, 0.12, 0.17, 0, -0.6, 0.01, p);
      part(GEO.sphS, o.thin ? skin : leather, 0.24, 0.24, 0.24, 0, -0.7, 0.02, p); // punho grande
      // ombreiras em camadas
      if (o.bulky || o.pauldron || o.armor) {
        part(GEO.sphH, armor, 0.42 * w, 0.34, 0.4, sx * 0.04, -0.02, 0, p);
        part(GEO.sphH, trim, 0.34 * w, 0.24, 0.32, sx * 0.08, -0.1, 0, p, false).rotation.z = sx * 0.25;
        // crista e rebites na ombreira (é o que a câmera alta mais vê)
        part(GEO.box, trim, 0.05, 0.08, 0.36, sx * 0.05, 0.14, 0, p, false).rotation.z = sx * 0.2;
        for (let r = -1; r <= 1; r++) part(GEO.sphS, trim, 0.045, 0.045, 0.045, sx * 0.2 * w, 0.02, r * 0.13, p, false);
      }
    }
    arms.push(p);
  }
  // cabeça
  const head = pivot(torso, 0, 1.02, 0.02);
  head.scale.setScalar(o.headScale || 1.38); // cabeça grande (proporção cartoon)
  const hk = o.head || 'human';
  const eyeC = o.eye || 0x66ccff;
  if (hk === 'skull') {
    part(GEO.sphS, skin, 0.46, 0.5, 0.48, 0, 0.1, 0, head);
    part(GEO.box, skin, 0.3, 0.14, 0.26, 0, -0.12, 0.07, head); // mandíbula
    const dark = toon(0x0a0806);
    part(GEO.sphS, dark, 0.14, 0.12, 0.08, -0.1, 0.1, 0.21, head, false);
    part(GEO.sphS, dark, 0.14, 0.12, 0.08, 0.1, 0.1, 0.21, head, false);
    const eye = glowMat(eyeC, 1);
    part(GEO.sphS, eye, 0.07, 0.07, 0.04, -0.1, 0.1, 0.24, head, false);
    part(GEO.sphS, eye, 0.07, 0.07, 0.04, 0.1, 0.1, 0.24, head, false);
    part(GEO.box, dark, 0.05, 0.07, 0.04, 0, -0.01, 0.24, head, false);
    if (!o.crown) part(GEO.sphH, armor, 0.52, 0.42, 0.52, 0, 0.18, -0.02, head); // elmo enferrujado
  } else if (hk === 'goblin') {
    part(GEO.sphS, skin, 0.56, 0.48, 0.52, 0, 0.08, 0, head);
    part(GEO.cone, skin, 0.14, 0.46, 0.08, -0.34, 0.16, -0.02, head).rotation.z = 1.25;
    part(GEO.cone, skin, 0.14, 0.46, 0.08, 0.34, 0.16, -0.02, head).rotation.z = -1.25;
    part(GEO.cone, skin, 0.1, 0.22, 0.1, 0, 0.04, 0.3, head).rotation.x = Math.PI / 2;
    const eye = glowMat(0xffcc33, 1);
    part(GEO.sphS, eye, 0.08, 0.06, 0.04, -0.11, 0.14, 0.24, head, false);
    part(GEO.sphS, eye, 0.08, 0.06, 0.04, 0.11, 0.14, 0.24, head, false);
    const tooth = toon(0xe8dcc0, 0, 0, { rough: 0.5, map: D('bone') });
    part(GEO.cone, tooth, 0.04, 0.08, 0.04, -0.07, -0.08, 0.24, head, false).rotation.x = Math.PI;
    part(GEO.cone, tooth, 0.04, 0.08, 0.04, 0.07, -0.08, 0.24, head, false).rotation.x = Math.PI;
    part(GEO.sphH, leather, 0.5, 0.3, 0.5, 0, 0.2, -0.03, head); // gorro de couro
  } else {
    part(GEO.sphS, skin, 0.44, 0.5, 0.46, 0, 0.08, 0, head);
    if (hk === 'helm') {
      // elmo fechado (great helm) com viseira
      part(GEO.cyl, armor, 0.54, 0.58, 0.56, 0, 0.14, 0, head);
      part(GEO.sphH, armor, 0.54, 0.26, 0.56, 0, 0.43, 0, head);
      part(GEO.box, toon(0x050505), 0.4, 0.05, 0.08, 0, 0.18, 0.26, head, false);
      // olhar aceso atrás da viseira (heróis e chefes)
      if (o.eye) part(GEO.box, glowMat(o.eye, 1), 0.3, 0.026, 0.02, 0, 0.18, 0.305, head, false);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(GEO.sphS, trim, 0.05, 0.05, 0.05, Math.sin(a) * 0.27, -0.1, Math.cos(a) * 0.28, head, false); }
      part(GEO.box, toon(0x050505), 0.04, 0.2, 0.08, 0, 0.04, 0.27, head, false);
      part(GEO.box, trim, 0.06, 0.5, 0.58, 0, 0.2, 0, head, false);
      if (o.horns) {
        for (const sx of [-1, 1]) { const h = part(GEO.cone, toon(0xd8ccb0, 0, 0, { rough: 0.6, map: D('bone') }), 0.13, 0.62, 0.13, sx * 0.34, 0.5, 0, head); h.rotation.z = -sx * 0.9; }
      } else if (o.plume !== false) {
        const pl = part(GEO.cone, cloth, 0.12, 0.5, 0.3, 0, 0.62, -0.1, head); pl.rotation.x = -0.6;
      }
    } else if (hk === 'hood') {
      part(GEO.cone, cloth, 0.66, 0.9, 0.7, 0, 0.44, -0.06, head);
      part(GEO.sphS, cloth, 0.6, 0.56, 0.62, 0, 0.12, -0.04, head);
      part(GEO.sphS, toon(0x040304), 0.4, 0.4, 0.2, 0, 0.06, 0.2, head, false); // rosto na sombra
      const eye = glowMat(o.eye || o.weaponGlow || 0xffcc66, 1);
      part(GEO.sphS, eye, 0.06, 0.04, 0.03, -0.08, 0.1, 0.3, head, false);
      part(GEO.sphS, eye, 0.06, 0.04, 0.03, 0.08, 0.1, 0.3, head, false);
    } else {
      const hair = M(o.hair || 0x3a2a1a, 0, 0, { rough: 0.9, map: D('fur') });
      if (hk === 'hair') {
        part(GEO.sphS, hair, 0.54, 0.44, 0.56, 0, 0.24, -0.05, head);
        part(GEO.box, hair, 0.42, 0.62, 0.14, 0, -0.1, -0.22, head);
        // rabo de cavalo trançado e tiara com pedra
        const tail = pivot(head, 0, 0.22, -0.26);
        tail.rotation.x = 0.5;
        for (let i = 0; i < 4; i++) part(GEO.sphS, hair, 0.16 - i * 0.02, 0.2, 0.16 - i * 0.02, 0, -0.14 * i, -0.04 * i, tail, false);
        const tiara = part(GEO.torusF, toon(0xd8b050, 0, 0, { metal: 0.9, rough: 0.3 }), 0.5, 0.5, 0.22, 0, 0.2, 0, head, false);
        tiara.rotation.x = Math.PI / 2 - 0.25;
        part(GEO.oct, glowMat(o.eye || 0x8affb0, 1), 0.06, 0.09, 0.04, 0, 0.26, 0.25, head, false);
        part(GEO.cone, skin, 0.07, 0.28, 0.07, -0.26, 0.14, -0.02, head).rotation.z = 1.35;
        part(GEO.cone, skin, 0.07, 0.28, 0.07, 0.26, 0.14, -0.02, head).rotation.z = -1.35;
      } else {
        part(GEO.sphH, hair, 0.5, 0.3, 0.5, 0, 0.18, -0.03, head);
        part(GEO.box, hair, 0.3, 0.16, 0.12, 0, -0.14, 0.18, head); // barba
      }
      // olhos cartoon: ovais escuros com brilho, sobrancelhas grossas
      const dark = toon(0x15100c), glint = toon(0xffffff, 0xffffff, 0.6);
      for (const sx of [-1, 1]) {
        part(GEO.sphS, dark, 0.08, 0.11, 0.04, sx * 0.1, 0.1, 0.215, head, false);
        part(GEO.sphS, glint, 0.03, 0.03, 0.02, sx * 0.1 - 0.015, 0.125, 0.232, head, false);
        part(GEO.box, hair, 0.12, 0.03, 0.03, sx * 0.1, 0.19, 0.215, head, false).rotation.z = sx * 0.15;
      }
    }
  }
  if (o.crown) {
    const cm = toon(0xd8a830, 0x8a5a00, 0.4, { metal: 0.95, rough: 0.3, env: 1.3 });
    part(GEO.cyl, cm, 0.5, 0.1, 0.5, 0, 0.36, 0, head);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(GEO.cone4, cm, 0.09, 0.26, 0.09, Math.sin(a) * 0.24, 0.52, Math.cos(a) * 0.24, head); }
    part(GEO.oct, glowMat(o.eye || 0xff3a3a, 0.9), 0.1, 0.12, 0.1, 0, 0.4, 0.26, head, false);
  }
  // capa
  let cape = null;
  if (o.cape || o.bulky || o.crown) {
    cape = pivot(torso, 0, 0.74, -0.24);
    const cm = M(o.capeColor || o.cloth || 0x3a1a1a, 0, 0, { rough: 0.95, side: THREE.DoubleSide, map: D('cloth'), nscale: 0.7 });
    part(GEO.cape, cm, 0.82 * w, 1.35, 1, 0, 0, 0, cape);
  }
  const hand = pivot(arms[1], 0, -0.7, 0.05);
  const weapon = buildWeapon(hand, arms, o, mats);
  if (weapon && o.weapon !== 'bow') weapon.scale.set(1.4, 1.12, 1.4); // armas robustas
  // segunda arma na mão esquerda (só visual: Dark Elf e Necromancer)
  let offhand = null;
  if (o.offhand && o.weapon !== 'bow') {
    offhand = buildWeapon(pivot(arms[0], 0, -0.7, 0.05), arms, Object.assign({}, o, { shield: false }), mats);
    if (offhand) offhand.scale.set(1.4, 1.12, 1.4);
  }
  const S = (o.scale || 1) * CARTOON.humanoid;
  root.scale.setScalar(S);
  return { root, kind: 'humanoid', body, torso, head, legs, arms, weapon, offhand, cape, mats, armorMat: armor, trimMat: trim, height: 2.45 * S };
}

/** Humanoide com esqueleto e clipes (art/gltfModels.js) mais os enfeites procedurais que o modelo não tem. */
function buildAnimatedHumanoid(o) {
  const m = buildGltfHumanoid(o, CARTOON.humanoid);
  if (o.crown) {
    const cm = toon(0xd8a830, 0x8a5a00, 0.4, { metal: 0.95, rough: 0.3, env: 1.3 });
    const c = pivot(m.head, 0, 0.9, 0.02); // cabeça grande do modelo: coroa maior e mais alta
    c.scale.setScalar(1.35);
    part(GEO.cyl, cm, 0.62, 0.12, 0.62, 0, 0, 0, c);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(GEO.cone4, cm, 0.1, 0.3, 0.1, Math.sin(a) * 0.3, 0.18, Math.cos(a) * 0.3, c); }
    part(GEO.oct, glowMat(o.eye || 0xff3a3a, 0.9), 0.12, 0.14, 0.12, 0, 0.06, 0.32, c, false);
  }
  return m;
}

// ---------- aranha ----------
function buildSpider(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.62, 0);
  const mats = [];
  const m = toonOwn(o.body || 0x2a1e30, 0, 0, { rough: 0.5, map: D('scale'), nscale: 1 }); mats.push(m);
  const m2 = toonOwn(o.belly || 0x4a2a52, 0, 0, { rough: 0.4, map: D('scale'), nscale: 1.2 }); mats.push(m2);
  const mark = glowMat(o.eye || 0xff4040, 0.55);
  part(GEO.sphS, m, 0.72, 0.5, 0.78, 0, 0.02, 0.35, body); // cefalotórax
  const abd = part(GEO.sphS, m2, 1.15, 0.92, 1.35, 0, 0.2, -0.62, body);
  // desenho no abdômen (ampulheta)
  part(GEO.oct, mark, 0.18, 0.02, 0.38, 0, 0.66, -0.62, body, false).rotation.x = 0.1;
  // pelos/espinhos
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; part(GEO.cone, m, 0.05, 0.22, 0.05, Math.cos(a) * 0.45, 0.35 + Math.sin(a * 2) * 0.1, -0.62 + Math.sin(a) * 0.5, body, false).rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
  // olhos em grupo e quelíceras
  const eye = glowMat(o.eye || 0xff4040, 1);
  for (const [x, y, s] of [[-0.1, 0.12, 0.1], [0.1, 0.12, 0.1], [-0.2, 0.18, 0.06], [0.2, 0.18, 0.06], [-0.06, 0.22, 0.05], [0.06, 0.22, 0.05]]) part(GEO.sphS, eye, s, s, s * 0.7, x, y, 0.72, body, false);
  const fang = toon(0x1a1210, 0, 0, { rough: 0.3, map: D('bone') });
  for (const sx of [-1, 1]) part(GEO.cone, fang, 0.07, 0.26, 0.07, sx * 0.09, -0.12, 0.74, body).rotation.x = Math.PI * 0.85;
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const p = pivot(body, side * 0.28, 0.02, 0.52 - k * 0.24);
    p.rotation.y = (k - 1.5) * 0.4 * side;
    // fêmur sobe para FORA do corpo; a tíbia desce até o chão (antes os dois
    // ângulos estavam com o sinal trocado e as pernas cruzavam por cima do corpo)
    const femur = pivot(p, 0, 0, 0);
    femur.rotation.z = -side * 0.9;
    part(GEO.cyl6, m, 0.09, 0.7, 0.09, 0, 0.35, 0, femur);
    const knee = pivot(femur, 0, 0.7, 0);
    part(GEO.sphS, m2, 0.13, 0.13, 0.13, 0, 0, 0, knee, false);
    knee.rotation.z = -side * 1.7;
    part(GEO.cyl6, m, 0.065, 1.1, 0.065, 0, 0.55, 0, knee);
    part(GEO.cone, fang, 0.05, 0.18, 0.05, 0, 1.18, 0, knee, false);
    legs.push(p);
  }
  const S = (o.scale || 1) * CARTOON.spider;
  root.scale.setScalar(S);
  return { root, kind: 'spider', body, legs, abd, mats, height: 1.4 * S };
}

// ---------- fera (lobo, cão infernal) ----------
export function buildBeast(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0.78, 0);
  const mats = [];
  const fur = toonOwn(o.fur || 0x3a3a44, o.flame ? 0xff4a10 : 0, o.flame ? 0.25 : 0, { rough: 0.95, map: D('fur'), nscale: 1 }); mats.push(fur);
  const dark = toonOwn(o.dark || 0x1e1e24, 0, 0, { rough: 0.9, map: D('leather') }); mats.push(dark);
  const bone = toon(0xe8dcc4, 0, 0, { rough: 0.5, map: D('bone') });
  part(GEO.cap, fur, 0.62, 0.62, 0.62, 0, 0.05, -0.05, body).rotation.x = Math.PI / 2; // tronco
  part(GEO.sphS, fur, 0.74, 0.7, 0.66, 0, 0.12, 0.34, body); // peito
  // crina / espinhos ao longo das costas
  for (let i = 0; i < 6; i++) part(GEO.cone, o.flame ? toon(0xff7a2a, 0xff4a10, 1.2) : dark, 0.12, 0.34 - i * 0.03, 0.12, 0, 0.42, 0.42 - i * 0.18, body, false).rotation.x = -0.5;
  const head = pivot(body, 0, 0.4, 0.74);
  head.scale.setScalar(1.3); // cabeça grande
  part(GEO.sphS, fur, 0.46, 0.42, 0.46, 0, 0, 0, head);
  part(GEO.taper, fur, 0.26, 0.4, 0.24, 0, -0.06, 0.3, head).rotation.x = -Math.PI / 2; // focinho
  part(GEO.sphS, dark, 0.1, 0.08, 0.08, 0, 0.0, 0.5, head, false); // nariz
  part(GEO.box, dark, 0.22, 0.06, 0.34, 0, -0.16, 0.28, head); // mandíbula
  for (const sx of [-1, 1]) {
    part(GEO.cone, fur, 0.14, 0.32, 0.1, sx * 0.14, 0.3, -0.06, head).rotation.z = -sx * 0.2;
    part(GEO.cone, bone, 0.04, 0.12, 0.04, sx * 0.08, -0.14, 0.44, head, false).rotation.x = Math.PI;
  }
  const eye = glowMat(o.eye || 0xffd040, 1);
  part(GEO.sphS, eye, 0.08, 0.05, 0.04, -0.12, 0.08, 0.2, head, false);
  part(GEO.sphS, eye, 0.08, 0.05, 0.04, 0.12, 0.08, 0.2, head, false);
  const legs = [];
  for (const [x, z] of [[-0.24, 0.4], [0.24, 0.4], [-0.24, -0.46], [0.24, -0.46]]) {
    const p = pivot(body, x, -0.1, z);
    part(GEO.taper, fur, 0.2, 0.36, 0.22, 0, -0.18, 0, p).rotation.x = Math.PI;
    part(GEO.cyl6, dark, 0.1, 0.34, 0.1, 0, -0.48, z < 0 ? -0.04 : 0.02, p);
    part(GEO.box, dark, 0.14, 0.08, 0.18, 0, -0.66, 0.04, p);
    legs.push(p);
  }
  const tail = pivot(body, 0, 0.2, -0.66);
  const tm = o.tailColor ? toonOwn(o.tailColor, 0, 0, { rough: 0.95, map: D('fur') }) : fur;
  if (o.tailColor) mats.push(tm);
  // cauda para trás e levemente erguida (o eixo da cápsula aponta para -Z)
  part(GEO.cap, tm, o.bushy ? 0.3 : 0.16, 0.55, o.bushy ? 0.3 : 0.16, 0, 0.1, -0.32, tail).rotation.x = -(Math.PI / 2 - 0.45);
  const S = (o.scale || 1) * CARTOON.beast;
  root.scale.setScalar(S);
  return { root, kind: 'beast', body, head, legs, tail, mats, height: 1.4 * S };
}

// ---------- espectro / arauto ----------
function buildFloater(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 1.25, 0);
  const mats = [];
  const bm = toonOwn(o.body || 0x6ab0d0, o.body || 0x6ab0d0, o.ghost ? 0.35 : 0.2, { rough: 0.9, side: THREE.DoubleSide, map: D('cloth'), nscale: 0.8 });
  bm.transparent = true; bm.opacity = o.ghost ? 0.72 : 0.9; bm.depthWrite = false;
  mats.push(bm);
  const r = part(GEO.robe, bm, 1.0, 1.7, 1.0, 0, -0.35, 0, body, false);
  r.rotation.x = 0;
  part(GEO.cone, bm, 0.72, 0.8, 0.72, 0, 0.62, -0.06, body, false); // capuz
  part(GEO.sphS, toon(0x020203), 0.46, 0.46, 0.3, 0, 0.48, 0.14, body, false); // vazio do rosto
  const eye = glowMat(o.eye || 0xffffff, 1);
  part(GEO.sphS, eye, 0.1, 0.06, 0.04, -0.1, 0.52, 0.3, body, false);
  part(GEO.sphS, eye, 0.1, 0.06, 0.04, 0.1, 0.52, 0.3, body, false);
  part(GEO.sphS, glowMat(o.body || 0x7fd6ff, 0.18), 1.6, 2.2, 1.6, 0, 0.1, 0, body, false); // aura
  // correntes penduradas
  const chain = toon(0x3a3a40, 0, 0, { metal: 0.8, rough: 0.4, map: D('metal') });
  for (let i = 0; i < 5; i++) part(GEO.torusF, chain, 0.12, 0.16, 0.12, 0.22, -0.3 - i * 0.12, 0.28, body, false).rotation.y = i % 2 ? Math.PI / 2 : 0;
  const arms = [];
  const bone = toon(0xd8d0c0, 0, 0, { rough: 0.6, map: D('bone') });
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.42, 0.3, 0.05);
    part(GEO.cone, bm, 0.26, 0.8, 0.26, 0, -0.32, 0, p, false).rotation.x = Math.PI;
    for (let f = 0; f < 3; f++) part(GEO.cyl6, bone, 0.025, 0.2, 0.025, (f - 1) * 0.05, -0.78, 0.04, p, false);
    p.rotation.z = sx * 0.45;
    arms.push(p);
  }
  const S = (o.scale || 1) * CARTOON.floater;
  root.scale.setScalar(S);
  return { root, kind: 'floater', body, arms, mats, height: 2.3 * S };
}

// ---------- morcego / gárgula ----------
function buildBat(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 1.5, 0);
  const mats = [];
  const stone = (o.scale || 1) > 1.2;
  const bm = toonOwn(o.body || 0x4a3a6a, o.glow || 0, o.glow ? 0.35 : 0, { rough: stone ? 0.95 : 0.8, flat: stone, map: D(stone ? 'stone' : 'fur'), nscale: stone ? 1.3 : 0.9 }); mats.push(bm);
  part(GEO.sphS, bm, 0.56, 0.7, 0.52, 0, 0, 0, body);
  part(GEO.sphS, bm, 0.42, 0.4, 0.42, 0, 0.46, 0.06, body); // cabeça
  for (const sx of [-1, 1]) {
    part(stone ? GEO.cone : GEO.cone4, bm, 0.12, stone ? 0.5 : 0.36, 0.12, sx * 0.14, 0.78, stone ? -0.04 : 0.02, body).rotation.set(stone ? -0.4 : 0, 0, -sx * (stone ? 0.3 : 0.15));
    part(GEO.cone, toon(0xe8e0d0), 0.04, 0.1, 0.04, sx * 0.06, 0.32, 0.26, body, false).rotation.x = Math.PI;
    // pés com garras
    const foot = pivot(body, sx * 0.14, -0.34, 0.04);
    part(GEO.cyl6, bm, 0.08, 0.26, 0.08, 0, -0.1, 0, foot);
    for (let f = 0; f < 3; f++) part(GEO.cone, toon(0x1a1414), 0.03, 0.12, 0.03, (f - 1) * 0.05, -0.26, 0.05, foot, false).rotation.x = 2.6;
  }
  const eye = glowMat(o.eye || 0x99ffff, 1);
  part(GEO.sphS, eye, 0.09, 0.07, 0.04, -0.1, 0.5, 0.26, body, false);
  part(GEO.sphS, eye, 0.09, 0.07, 0.04, 0.1, 0.5, 0.26, body, false);
  const wm = toonOwn(o.wing || 0x2a1e3a, 0, 0, { rough: 0.8, side: THREE.DoubleSide, flat: stone, map: D(stone ? 'stone' : 'membrane') }); mats.push(wm);
  const boneM = toon(stone ? 0x4a4a52 : 0x1a1420, 0, 0, { rough: 0.8 });
  const wings = [];
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.2, 0.12, -0.04);
    const w = new THREE.Mesh(GEO.wing, wm);
    w.scale.set(sx * 0.78, 0.66, 0.66);
    w.rotation.x = -Math.PI / 2 + 0.3;
    w.castShadow = true;
    p.add(w);
    // "dedos" da asa
    for (const [ex, ez, a] of [[1.35, -0.1, 0.3], [0.95, 0.35, 0.9], [0.55, 0.6, 1.3]]) {
      const b = part(GEO.cyl6, boneM, 0.035, 1, 0.035, sx * ex * 0.33, 0.02, ez * 0.3 - 0.05, p, false);
      b.rotation.set(0, 0, 0);
      b.scale.y = Math.hypot(ex, ez) * 0.66;
      b.rotation.z = -sx * (Math.PI / 2 - (a - 0.3) * 0.25);
      b.rotation.y = sx * -a * 0.35;
    }
    wings.push(p);
  }
  const S = (o.scale || 1) * CARTOON.bat;
  root.scale.setScalar(S);
  return { root, kind: 'bat', body, wings, mats, height: 2.0 * S };
}

// ---------- golem (pedra, cristal, magma) ----------
function buildGolem(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const mats = [];
  const hot = o.core && ((o.core >> 16) & 255) > 200 && ((o.core >> 8) & 255) < 140; // núcleo quente = magma
  const rock = hot ? texRock('obsidian_glow3', { a: 0x4a3a38, b: 0x5a4640, glow: true, n: 14 }) : texRock('golem_rock3', { a: 0xa8a8ae, b: 0xc8c8cc, n: 14, soft: true });
  const st = toonOwn(o.stone || 0x6a6a74, hot ? 0xff5a10 : 0, hot ? 1.2 : 0, { rough: 0.95, flat: true, map: rock, nscale: 1.2 }); mats.push(st);
  if (hot) st.emissiveMap = rock.emissiveMap;
  st.userData.baseEmissive = st.emissive.clone(); st.userData.baseEI = st.emissiveIntensity;
  const core = glowMat(o.core || 0x66e0ff, 0.95);
  const moss = toon(0x2a3a18, 0, 0, { rough: 1 });
  const legs = [];
  for (const sx of [-1, 1]) {
    const p = pivot(body, sx * 0.4, 0.95, 0);
    part(GEO.dod, st, 0.5, 0.55, 0.5, 0, -0.2, 0, p);
    part(GEO.dod, st, 0.46, 0.5, 0.5, 0, -0.62, 0.02, p);
    part(GEO.box, st, 0.5, 0.2, 0.6, 0, -0.88, 0.06, p);
    legs.push(p);
  }
  const torso = pivot(body, 0, 0.95, 0);
  part(GEO.dod, st, 1.55, 1.25, 1.15, 0, 0.62, 0, torso);
  part(GEO.dod, st, 0.9, 0.7, 0.8, -0.35, 1.05, -0.2, torso);
  part(GEO.oct, core, 0.42, 0.54, 0.3, 0, 0.62, 0.5, torso, false);
  part(GEO.sphS, glowMat(o.core || 0x66e0ff, 0.25), 0.9, 0.9, 0.5, 0, 0.62, 0.45, torso, false);
  // runas brilhantes
  for (let i = 0; i < 4; i++) part(GEO.box, core, 0.05, 0.28, 0.03, -0.45 + i * 0.3, 0.3 + (i % 2) * 0.35, 0.55, torso, false);
  if (!hot && o.moss !== false) { part(GEO.sphH, moss, 0.9, 0.2, 0.7, 0.1, 1.2, -0.05, torso, false); part(GEO.sphH, moss, 0.5, 0.15, 0.4, 0.55, 1.05, 0.1, torso, false); }
  const headG = pivot(torso, 0, 1.35, 0.15);
  part(GEO.dod, st, 0.55, 0.45, 0.5, 0, 0, 0, headG);
  part(GEO.box, core, 0.34, 0.06, 0.04, 0, 0.02, 0.26, headG, false);
  const arms = [];
  for (const sx of [-1, 1]) {
    const p = pivot(torso, sx * 0.88, 1.02, 0);
    part(GEO.dod, st, 0.62, 0.6, 0.62, 0, 0, 0, p);
    part(GEO.dod, st, 0.46, 0.8, 0.46, 0, -0.55, 0, p);
    part(GEO.dod, st, 0.7, 0.66, 0.66, 0, -1.12, 0.06, p);
    if (hot) part(GEO.cone, toon(0x2a1010, 0xff4a10, 0.8), 0.14, 0.4, 0.14, sx * 0.2, 0.3, 0, p).rotation.z = -sx * 0.6;
    arms.push(p);
  }
  const S = (o.scale || 1) * CARTOON.golem;
  root.scale.setScalar(S);
  return { root, kind: 'golem', body, torso, legs, arms, mats, height: 2.9 * S };
}

const BUILD = { spider: buildSpider, beast: buildBeast, floater: buildFloater, bat: buildBat, golem: buildGolem };
/** Raio (unidades do modelo) e força da sombra de contato por tipo; quem flutua recebe uma mais fraca. */
const BLOB = { humanoid: [0.62, 0.6], gltf: [0.62, 0.6], spider: [1.25, 0.6], beast: [0.8, 0.6], floater: [0.62, 0.35], bat: [0.55, 0.3], golem: [1.15, 0.65] };
export function buildModel(kind, o) {
  const m = (BUILD[kind] || buildHumanoid)(o);
  addContactShadow(m, BLOB[m.kind]);
  return m;
}

// ---------- sombra de contato ----------
// Mancha escura e suave logo abaixo do modelo: assenta personagens no chão
// mesmo sem sombras em tempo real (qualidade baixa) e quando o sol projeta
// a sombra de lado.
let _blobTex = null;
const _blobMats = new Map();
function blobMaterial(op) {
  if (!_blobTex) {
    const N = 64, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    _blobTex = new THREE.CanvasTexture(c);
  }
  let m = _blobMats.get(op);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
    m.userData.shared = true;
    _blobMats.set(op, m);
  }
  return m;
}
export function addContactShadow(m, spec) {
  if (!spec) return;
  const blob = new THREE.Mesh(GEO.plane, blobMaterial(spec[1]));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04 / (m.root.scale.x || 1);
  blob.scale.setScalar(spec[0] * 2);
  blob.renderOrder = 1;
  m.root.add(blob);
  m.blob = blob;
}

/** Anima qualquer modelo. s: {t, dt, moving, run, attack (0..1), dead, speed, cast}; nos animados escolhe o clipe. */
export function animateModel(m, s) {
  const t = s.t;
  if (m.kind === 'gltf') animateGltf(m, s);
  const mv = s.moving ? 1 : 0;
  const ph = t * (s.speed || 9);
  if (m.kind === 'humanoid') {
    m.legs[0].rotation.x = Math.sin(ph) * 0.8 * mv;
    m.legs[1].rotation.x = -Math.sin(ph) * 0.8 * mv;
    m.arms[0].rotation.x = -Math.sin(ph) * 0.6 * mv;
    m.body.position.y = Math.abs(Math.sin(ph)) * 0.08 * mv + (mv ? 0 : Math.sin(t * 2) * 0.02);
    m.torso.rotation.x = mv ? 0.08 : Math.sin(t * 1.6) * 0.015;
    const a = s.attack || 0;
    if (a > 0) {
      const k = Math.sin(a * Math.PI);
      m.arms[1].rotation.x = -k * 2.1;
      m.arms[1].rotation.z = -k * 0.3;
      m.torso.rotation.y = -k * 0.35;
    } else {
      m.arms[1].rotation.x = Math.sin(ph) * 0.6 * mv;
      m.arms[1].rotation.z = 0;
      m.torso.rotation.y = 0;
    }
    if (s.cast > 0) { const k = Math.sin(s.cast * Math.PI); m.arms[0].rotation.x = -k * 2.4; m.arms[1].rotation.x = -k * 2.4; }
    if (m.cape) m.cape.rotation.x = 0.12 + mv * (0.35 + Math.sin(ph * 2) * 0.08) + Math.sin(t * 1.3) * 0.04;
  } else if (m.kind === 'spider') {
    m.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph * 1.6 + i * 1.3) * 0.35 * (mv + 0.1); });
    m.body.position.y = 0.62 + Math.sin(ph * 2) * 0.04;
    if (m.abd) m.abd.scale.y = 0.92 + Math.sin(t * 3) * 0.03;
    if (s.attack > 0) m.body.rotation.x = -Math.sin(s.attack * Math.PI) * 0.5; else m.body.rotation.x = 0;
  } else if (m.kind === 'beast') {
    m.legs[0].rotation.x = Math.sin(ph) * 0.9 * mv;
    m.legs[3].rotation.x = Math.sin(ph) * 0.9 * mv;
    m.legs[1].rotation.x = -Math.sin(ph) * 0.9 * mv;
    m.legs[2].rotation.x = -Math.sin(ph) * 0.9 * mv;
    m.tail.rotation.y = Math.sin(t * 6) * 0.4;
    m.body.position.y = 0.78 + Math.abs(Math.sin(ph)) * 0.08 * mv;
    m.head.rotation.x = s.attack > 0 ? -Math.sin(s.attack * Math.PI) * 0.6 : Math.sin(t * 1.5) * 0.05;
    m.body.position.z = s.attack > 0 ? Math.sin(s.attack * Math.PI) * 0.4 : 0;
  } else if (m.kind === 'floater') {
    m.body.position.y = 1.25 + Math.sin(t * 2.4) * 0.18;
    m.body.rotation.z = Math.sin(t * 1.3) * 0.05;
    m.arms[0].rotation.x = s.attack > 0 ? -Math.sin(s.attack * Math.PI) * 2 : Math.sin(t * 3) * 0.2;
    m.arms[1].rotation.x = s.attack > 0 ? -Math.sin(s.attack * Math.PI) * 2 : -Math.sin(t * 3) * 0.2;
  } else if (m.kind === 'bat') {
    m.body.position.y = 1.5 + Math.sin(t * 5) * 0.2;
    const f = Math.sin(t * 16) * 0.8;
    m.wings[0].rotation.z = f; m.wings[1].rotation.z = -f;
    m.body.rotation.x = s.attack > 0 ? Math.sin(s.attack * Math.PI) * 0.7 : 0.15;
  } else if (m.kind === 'golem') {
    m.legs[0].rotation.x = Math.sin(ph * 0.6) * 0.5 * mv;
    m.legs[1].rotation.x = -Math.sin(ph * 0.6) * 0.5 * mv;
    m.body.position.y = Math.abs(Math.sin(ph * 0.6)) * 0.1 * mv;
    const a = s.attack || 0;
    const k = a > 0 ? Math.sin(a * Math.PI) : 0;
    m.arms[0].rotation.x = -k * 2.2 + Math.sin(ph * 0.6) * 0.3 * mv;
    m.arms[1].rotation.x = -k * 2.2 - Math.sin(ph * 0.6) * 0.3 * mv;
  }
  if (m.wingRig) m.wingRig.update(t, mv);
  if (m.fx) for (const fx of m.fx) fx.update(t);
}
export function flashModel(m, color, k) {
  m.flashing = k > 0; // o brilho de refino da armadura espera o piscar acabar
  for (const mat of m.mats) {
    if (k > 0) { mat.emissive.setHex(color); mat.emissiveIntensity = k * 0.8; }
    else { mat.emissive.copy(mat.userData.baseEmissive); mat.emissiveIntensity = mat.userData.baseEI; }
  }
}
/** Libera os materiais próprios do modelo (as geometrias são compartilhadas via GEO). */
export function disposeModel(m) {
  disposeObject(m.root, false);
  if (m.mixer) {
    // animados: cada clone tem esqueleto próprio (textura de ossos na GPU) e ações no mixer
    m.mixer.stopAllAction();
    m.mixer.uncacheRoot(m.scene);
    m.scene.traverse((c) => { if (c.isSkinnedMesh) c.skeleton.dispose(); });
  }
}

// ---------- selo de chefe no chão ----------
let _sigilTex = null;
/** Textura do selo (anéis, runas e brilho), desenhada uma vez em canvas. */
function sigilTexture() {
  if (_sigilTex) return _sigilTex;
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), R0 = N / 2;
  g.translate(R0, R0);
  const glow = g.createRadialGradient(0, 0, R0 * 0.2, 0, 0, R0);
  glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(0.7, 'rgba(255,255,255,0.10)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, R0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (const [r, w, a] of [[0.94, 5, 0.95], [0.86, 2, 0.7], [0.62, 3, 0.8], [0.55, 1.5, 0.5]]) { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.arc(0, 0, R0 * r, 0, Math.PI * 2); g.stroke(); }
  // runas entre os anéis externos
  g.globalAlpha = 0.9; g.lineWidth = 2.5;
  for (let i = 0; i < 16; i++) {
    g.save(); g.rotate((i / 16) * Math.PI * 2); g.translate(0, -R0 * 0.74);
    const k = i % 4;
    g.beginPath();
    if (k === 0) { g.moveTo(-6, -8); g.lineTo(0, 8); g.lineTo(6, -8); }
    else if (k === 1) { g.moveTo(0, -9); g.lineTo(0, 9); g.moveTo(-6, -2); g.lineTo(6, 3); }
    else if (k === 2) { g.moveTo(-6, 8); g.lineTo(-6, -8); g.lineTo(6, 0); g.lineTo(-6, 8); }
    else { g.arc(0, 0, 6, 0.3, Math.PI * 2 - 0.3); }
    g.stroke(); g.restore();
  }
  // estrela interna de 5 pontas
  g.globalAlpha = 0.55; g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI * 2) / 5; const x = Math.cos(a) * R0 * 0.55, y = Math.sin(a) * R0 * 0.55; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  _sigilTex = new THREE.CanvasTexture(c);
  _sigilTex.colorSpace = THREE.SRGBColorSpace;
  return _sigilTex;
}
/**
 * Selo rúnico plano sob o chefe. `worldRadius` em metros, compensando a escala
 * do modelo; o giro é em torno do eixo vertical (o selo nunca sai do chão).
 */
export function attachBossSigil(model, color, worldRadius) {
  const s = model.root.scale.x || 1;
  const holder = new THREE.Group();
  holder.position.y = 0.05 / s;
  const mat = new THREE.MeshBasicMaterial({ map: sigilTexture(), color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const disc = new THREE.Mesh(GEO.plane, mat);
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar((worldRadius * 2) / s);
  disc.renderOrder = 1;
  holder.add(disc);
  model.root.add(holder);
  model.sigil = holder;
  return holder;
}
