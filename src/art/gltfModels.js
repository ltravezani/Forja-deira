// =============================================================================
// Personagens com esqueleto (glTF): modelos low-poly animados (KayKit, CC0) que
// o tools/build.py embute em base64 no HTML. Todos compartilham o mesmo rig, então
// um único arquivo de clipes (anims) anima qualquer personagem. Cada instância é
// um clone com materiais toon próprios (piscam ao levar dano e recebem as cores do
// equipamento), arma presa ao osso da mão e um AnimationMixer.
//
// Se os modelos não carregarem (ou o jogador escolher personagens simples), os
// construtores de art/models.js continuam usando o modelo procedural.
// =============================================================================
import { CONFIG } from '../core/config.js';
import { GEO, part } from './geometry.js';
import { glowMat } from './materials.js';
import { stylize } from './stylize.js';

/** Personagem de cada chave `gltf` usada em data.js, player.js e townlife.js. */
const CHAR = { knight: 'Knight', mage: 'Mage', rogue: 'Rogue_Hooded', barbarian: 'Barbarian', skeleton: 'Skeleton_Warrior', skeletonRogue: 'Skeleton_Rogue' };
/** Arma na mão direita: nó do próprio personagem ou arquivo avulso (props). */
const WEAPON = {
  knight: { sword: '1H_Sword', club: '1H_Sword', staff: '2H_Sword' },
  mage: { staff: '2H_Staff', sword: '1H_Wand' },
  rogue: { bow: '2H_Crossbow', sword: 'Knife' },
  barbarian: { club: '1H_Axe', sword: '1H_Axe' },
  skeleton: { sword: 'Skeleton_Blade', club: 'Skeleton_Blade' },
  skeletonRogue: { bow: 'Skeleton_Crossbow' },
};
const SHIELD = { knight: 'Badge_Shield', skeleton: 'Skeleton_Shield_Small_A' };
/** Clipes: locomoção, golpes (alternados), disparo, magia e queda. */
const CLIP = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', chop: '1H_Melee_Attack_Chop', slice: '1H_Melee_Attack_Slice_Diagonal', shoot: '2H_Ranged_Shoot', spell: 'Spellcast_Shoot', cast: 'Spellcast_Raise', death: 'Death_A' };
/** Altura do modelo procedural (unidades do corpo); o glTF é escalado para ela, um pouco menor (cabeça e ombros largos pesam mais na tela). */
const BODY_H = 2.45, FIT = 0.9;

const LIB = { ready: false, on: true, chars: {}, props: {}, clips: {}, H: 1, loadMs: 0, bytes: 0 };

function b64ToBuffer(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
/** Carrega os modelos embutidos (assíncrono: as texturas viram imagens). Resolve true se deu certo. */
export function loadGltfModels() {
  const src = window.__FORJA_GLB, L = window.THREE_GLTF;
  if (!src || !L) return Promise.resolve(false);
  const t0 = performance.now();
  const loader = new L.GLTFLoader();
  const names = Object.keys(src);
  const jobs = names.map((name) => new Promise((res, rej) => {
    LIB.bytes += src[name].length * 0.75;
    loader.parse(b64ToBuffer(src[name]), '', (g) => res([name, g]), rej);
  }));
  return Promise.all(jobs).then((list) => {
    const chars = Object.values(CHAR);
    for (const [name, g] of list) {
      // geometrias e texturas são dos modelos-base: os clones nunca as liberam
      g.scene.traverse((o) => { if (o.geometry) o.geometry.userData.shared = true; });
      if (name === 'anims') for (const c of g.animations) LIB.clips[c.name] = c;
      else if (chars.includes(name)) LIB.chars[name] = g.scene;
      else LIB.props[name] = g.scene;
    }
    // altura de referência: corpo do cavaleiro sem acessórios (todos usam o mesmo rig)
    const box = new THREE.Box3();
    LIB.chars.Knight.updateMatrixWorld(true);
    LIB.chars.Knight.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    LIB.H = box.max.y - box.min.y || 1;
    LIB.ready = true;
    LIB.loadMs = performance.now() - t0;
    delete window.__FORJA_GLB; // o texto base64 não é mais necessário
    return true;
  }).catch((e) => { console.warn('Personagens animados indisponíveis; usando os modelos simples.', e); return false; });
}
/** Liga ou desliga os personagens animados (vale para os modelos criados depois). */
export function setGltfEnabled(on) { LIB.on = !!on; }
/** Preferência salva: null = automático (animados, exceto na qualidade baixa). */
export function applyCharSetting(st) { LIB.on = st.animChars != null ? !!st.animChars : st.quality !== 'baixa'; }
export function gltfEnabled() { return LIB.ready && LIB.on; }
/** Estatísticas para a ferramenta de medição (tempo de carga e tamanho embutido). */
export function gltfStats() { return { ready: LIB.ready, on: LIB.on, loadMs: Math.round(LIB.loadMs), kb: Math.round(LIB.bytes / 1024) }; }
/** true se este visual tem um modelo animado disponível agora. */
export function hasGltf(o) { return !!(o && o.gltf && gltfEnabled() && LIB.chars[CHAR[o.gltf]]); }

// ---------- cores ----------
/** Tinge a textura de paleta: `k` = 0 mantém as cores originais, 1 aplica o tom de `hex` (e escurece se ele for escuro). */
function tint(hex, k) {
  const c = new THREE.Color(1, 1, 1);
  if (hex == null || !k) return c;
  const t = new THREE.Color(hex), v = Math.max(t.r, t.g, t.b, 1e-3);
  return c.lerp(t.multiplyScalar(1 / v), k).multiplyScalar(1 - k * 0.7 * (1 - Math.sqrt(v)));
}
/**
 * Material toon próprio sobre a textura de paleta. `desat` tira a cor original da
 * textura antes de tingir: com ele um manto roxo vira vermelho de verdade (só
 * multiplicar escureceria para marrom).
 */
function ownMat(map, color, emissive, ei, mats, desat) {
  const m = new THREE.MeshToonMaterial({ map, color });
  const U = { uDesat: { value: desat || 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDesat = U.uDesat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDesat;')
      .replace('#include <map_fragment>', DESAT_MAP);
  };
  stylize(m, { rim: 0.3 });
  if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = ei; }
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEI = m.emissiveIntensity;
  mats.push(m);
  return m;
}
const DESAT_MAP = `#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    float mapLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( mapLum * 1.35 ), uDesat );
    diffuseColor *= sampledDiffuseColor;
  #endif`;
/** Papel de cada malha do personagem, pelo nome. */
function roleOf(name, key) {
  if (/Eyes/.test(name)) return 'eyes';
  if (/Cape|Cloak/.test(name)) return 'cape';
  if (/Head|Jaw/.test(name)) return 'skin';
  if (key === 'barbarian' && /Arm/.test(name)) return 'skin';
  if (/Helmet|Hat|Hood/.test(name)) return 'hat';
  return 'body';
}

/**
 * As partes do corpo usam o mesmo esqueleto, mas o clone dá um objeto Skeleton
 * (e uma textura de ossos na GPU) para cada malha. Religa todas ao primeiro.
 */
function shareSkeleton(scene) {
  let base = null;
  scene.traverse((c) => {
    if (!c.isSkinnedMesh) return;
    const s = c.skeleton;
    if (!base) { base = s; return; }
    const same = s.bones.length === base.bones.length && s.bones.every((b, i) => b === base.bones[i] && s.boneInverses[i].equals(base.boneInverses[i]));
    if (same) c.bind(base, c.bindMatrix);
  });
}
/** Acha um nó pelo nome (o carregador remove pontos: "handslot.r" vira "handslotr"). */
function find(root, name) {
  let r = null;
  root.traverse((o) => { if (!r && o.name === name) r = o; });
  return r;
}
/**
 * Âncora num osso, em unidades e eixos do corpo procedural (para asas, coroa e
 * efeitos): desfaz a rotação do osso na pose de repouso, então "para cima" e
 * "para trás" são os mesmos do modelo simples.
 */
function anchor(bone, scene) {
  const a = new THREE.Object3D();
  a.scale.setScalar(1 / scene.scale.x);
  if (!bone) return a;
  scene.updateMatrixWorld(true);
  const q = new THREE.Quaternion(), qs = new THREE.Quaternion();
  bone.getWorldQuaternion(q);
  scene.getWorldQuaternion(qs);
  a.quaternion.copy(q.invert().multiply(qs));
  bone.add(a);
  return a;
}

/**
 * Humanoide animado a partir do visual `o` (mesmas chaves do procedural, mais `gltf`).
 * Devolve um modelo compatível com animateModel/flashModel/attachWings (kind 'gltf').
 */
export function buildGltfHumanoid(o, cartoon) {
  const key = o.gltf, tpl = LIB.chars[CHAR[key]];
  const scene = window.THREE_GLTF.cloneSkinned(tpl);
  scene.scale.setScalar((BODY_H * FIT) / LIB.H);
  const root = new THREE.Group();
  root.add(scene);
  const mats = [];
  let map = null;
  scene.traverse((c) => { if (!map && c.isMesh && c.material.map) map = c.material.map; });
  const skel = key === 'skeleton' || key === 'skeletonRogue';
  const k = o.tintK != null ? o.tintK : 0.42, sk = o.skinK != null ? o.skinK : skel ? 0.25 : 0.12;
  const M = {
    body: ownMat(map, tint(o.armor || o.cloth, k), 0, 0, mats, k * 0.9),
    skin: ownMat(map, tint(o.skin, sk), 0, 0, mats, sk * 0.9),
    cape: ownMat(map, tint(o.capeColor || o.cloth, 0.55), 0, 0, mats, 0.5),
    weapon: ownMat(map, tint(o.weaponColor, 0.35), o.weaponGlow || 0, o.weaponGlow ? 0.45 : 0, mats),
  };
  M.hat = M.body;
  const eyes = glowMat(o.eye || (skel ? 0x7ae8ff : 0xffffff), 0.95);
  const showHat = key === 'knight' ? o.head === 'helm' : key === 'mage' ? o.head === 'hood' : key === 'barbarian' ? !!o.horns : !o.crown;
  const showCape = skel || !!(o.cape || o.bulky || o.crown || o.robe);
  const wantW = WEAPON[key] && WEAPON[key][o.weapon], wantS = o.shield && SHIELD[key];
  const drop = [];
  let weapon = null;
  scene.traverse((c) => {
    if (!c.isMesh) return;
    c.castShadow = true; c.receiveShadow = true;
    if (!c.isSkinnedMesh) {
      // armas e acessórios presos a ossos
      const role = roleOf(c.name, key);
      if (c.name === wantW) { c.material = M.weapon; weapon = c; }
      else if (c.name === wantS) c.material = M.weapon;
      else if (role === 'hat' && showHat) c.material = M.hat;
      else if (role === 'cape' && showCape) c.material = M.cape;
      else drop.push(c);
      return;
    }
    const role = roleOf(c.name, key);
    if (role === 'eyes') { c.material = eyes; c.castShadow = false; }
    else if (role === 'cape' && !showCape) drop.push(c);
    else c.material = M[role];
  });
  const fem = key === 'rogue' && o.head === 'hair' ? borrowHead(scene, drop, M.skin) : null;
  for (const c of drop) c.parent.remove(c);
  shareSkeleton(scene);
  // armas avulsas (pacote de esqueletos) vão para os encaixes das mãos
  const hand = (side) => find(scene, 'handslot' + side);
  const prop = (name, side) => {
    const P = LIB.props[name];
    if (!P) return null;
    const g = P.clone();
    g.traverse((c) => { if (c.isMesh) { c.material = M.weapon; c.castShadow = true; } });
    const h = hand(side);
    if (h) h.add(g);
    return g;
  };
  if (wantW && !weapon) weapon = prop(wantW, 'r');
  if (wantS && !find(scene, wantS)) prop(wantS, 'l');
  // orbe no topo do cajado (o jogador anima o tamanho dele)
  if (weapon && o.weapon === 'staff') {
    const b = new THREE.Box3();
    weapon.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); b.union(c.geometry.boundingBox); } });
    const orb = new THREE.Group();
    orb.userData.orb = true;
    orb.position.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    const s = new THREE.Mesh(GEO.sphS, glowMat(o.weaponGlow || 0x7aa8ff, 0.9));
    s.scale.setScalar((b.max.y - b.min.y) * 0.3);
    orb.add(s);
    orb.scale.setScalar(0.3);
    weapon.add(orb);
  }
  const mixer = new THREE.AnimationMixer(scene);
  const acts = {};
  for (const [id, name] of Object.entries(CLIP)) {
    const clip = LIB.clips[name];
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (id === 'death' || id === 'chop' || id === 'slice' || id === 'shoot' || id === 'spell' || id === 'cast') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    acts[id] = a;
  }
  const S = (o.scale || 1) * cartoon;
  root.scale.setScalar(S);
  const m = {
    root, scene, kind: 'gltf', mixer, acts, mats,
    body: scene, torso: anchor(find(scene, 'chest'), scene), head: anchor(find(scene, 'head'), scene),
    weapon, cape: null, armorMat: M.body, trimMat: M.body, height: BODY_H * S,
    anim: { cur: null, over: null, prev: 0, dead: false, lastT: null, flip: false },
    atk: o.weapon === 'bow' ? 'shoot' : key === 'mage' && o.weapon === 'staff' ? 'spell' : 'melee',
  };
  if (fem) femaleHair(m, fem, o, mats);
  // idle começa num ponto aleatório: um grupo de monstros não respira em uníssono
  play(m, acts.idle, 0);
  if (acts.idle) acts.idle.time = Math.random() * acts.idle.getClip().duration;
  return m;
}

// ---------- rosto feminino (a elfa) ----------
/**
 * O pacote só tem a ladina encapuzada, de rosto masculino: troca a cabeça pela do
 * mago (mesmo rig, rosto mais delicado e sem chapéu), religada aos ossos deste clone.
 */
function borrowHead(scene, drop, mat) {
  const hood = find(scene, 'Rogue_Head_Hooded'), src = LIB.chars.Mage && find(LIB.chars.Mage, 'Mage_Head');
  if (!hood || !src || !src.isSkinnedMesh) return null;
  const bones = src.skeleton.bones.map((b) => find(scene, b.name));
  if (bones.some((b) => !b)) return null;
  const head = new THREE.SkinnedMesh(src.geometry, mat);
  head.name = 'Elf_Head';
  head.castShadow = true; head.receiveShadow = true;
  hood.parent.add(head);
  head.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
  drop.push(hood);
  return head;
}
/** Cabelo longo com franja, rabo de cavalo e orelhas pontudas, presos ao osso da cabeça. */
function femaleHair(m, head, o, mats) {
  // caixa da cabeça (pose de repouso) nos eixos da âncora do osso: +y para cima, +z para a frente
  m.root.updateMatrixWorld(true);
  head.geometry.computeBoundingBox();
  const box = head.geometry.boundingBox.clone().applyMatrix4(head.matrixWorld);
  const inv = new THREE.Matrix4().copy(m.head.matrixWorld).invert();
  box.applyMatrix4(inv);
  const c = box.getCenter(new THREE.Vector3()), z = box.getSize(new THREE.Vector3());
  const w = z.x, h = z.y, d = z.z;
  const hair = ownMat(null, new THREE.Color(o.hair || 0xd8b86a), 0, 0, mats);
  const skin = ownMat(null, new THREE.Color(o.skin || 0xf0caa8), 0, 0, mats);
  const g = new THREE.Group();
  g.position.copy(c);
  m.head.add(g);
  const P = (geo, mat, sx, sy, sz, x, y, zz) => part(geo, mat, sx * w, sy * h, sz * d, x * w, y * h, zz * d, g);
  // calota e volume da nuca até os ombros
  P(GEO.sphH, hair, 1.12, 1.0, 1.2, 0, 0.12, -0.06).rotation.x = -0.2; // frente mais alta: a borda some atrás da franja
  P(GEO.sphS, hair, 1.06, 0.9, 0.62, 0, -0.08, -0.26);
  P(GEO.sphS, hair, 0.9, 0.7, 0.5, 0, -0.42, -0.3);
  // franja em mechas e mechas laterais emoldurando o rosto
  for (let i = -2; i <= 2; i++) P(GEO.sphS, hair, 0.3, 0.26, 0.2, i * 0.17, 0.16 - Math.abs(i) * 0.03, 0.52 - Math.abs(i) * 0.06).rotation.z = -i * 0.25;
  // cílios e bochechas coradas
  const lash = ownMat(null, new THREE.Color(0x2a1810), 0, 0, mats), blush = ownMat(null, new THREE.Color(0xf08a8a), 0, 0, mats);
  for (const sx of [-1, 1]) {
    P(GEO.sphS, hair, 0.2, 0.85, 0.34, sx * 0.49, -0.2, 0.1).rotation.z = sx * 0.08;
    P(GEO.sphS, hair, 0.14, 0.4, 0.2, sx * 0.46, -0.62, 0.14);
    P(GEO.box, lash, 0.07, 0.022, 0.04, sx * 0.26, -0.05, 0.5).rotation.z = -sx * 0.6;
    P(GEO.sphS, blush, 0.14, 0.07, 0.03, sx * 0.25, -0.28, 0.46);
    // orelhas de elfa, pontudas e inclinadas para trás
    const e = P(GEO.cone, skin, 0.1, 0.42, 0.12, sx * 0.56, 0.02, -0.02);
    e.rotation.set(-0.35, 0, -sx * 1.15);
  }
  // rabo de cavalo longo
  const tail = new THREE.Group();
  tail.position.set(0, 0.2 * h, -0.5 * d);
  tail.rotation.x = 0.35;
  g.add(tail);
  for (let i = 0; i < 5; i++) part(GEO.sphS, hair, (0.3 - i * 0.035) * w, 0.3 * h, (0.3 - i * 0.035) * d, 0, -0.24 * h * i, -0.05 * d * i, tail, i < 2);
}

// ---------- animação ----------
function play(m, next, fade) {
  const A = m.anim, prev = A.cur;
  if (!next || prev === next) return;
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.play();
  if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
  else if (prev) prev.stop();
  A.cur = next;
}
/** Golpe/magia: o clipe é percorrido pelo progresso 0..1 que o jogo já controla. */
function overlay(m, id, k) {
  const A = m.anim, a = m.acts[id];
  if (!a) return;
  if (A.over !== a || k < A.prev) {
    a.reset();
    a.paused = true;
    A.over = a;
    play(m, a, 0.06);
  }
  // pula o começo do clipe (preparação lenta) e termina antes da volta
  a.time = (0.12 + 0.7 * k) * a.getClip().duration;
  A.prev = k;
}
/** Seleciona o clipe do modelo animado a partir do estado s (mesmo formato de animateModel). */
export function animateGltf(m, s) {
  const A = m.anim;
  let dt = s.dt;
  if (dt == null) dt = A.lastT == null ? 0 : Math.max(0, Math.min(0.1, s.t - A.lastT));
  A.lastT = s.t;
  if (s.dead) {
    if (!A.dead) { A.dead = true; A.over = null; const d = m.acts.death; if (d) { d.reset(); play(m, d, 0.1); } }
  } else {
    if (A.dead) { A.dead = false; if (m.acts.death) m.acts.death.stop(); A.cur = null; }
    const a = s.attack || 0, c = s.cast || 0;
    if (c > 0) overlay(m, 'cast', c);
    else if (a > 0) {
      if (A.prev === 0 || !A.over) A.flip = !A.flip;
      overlay(m, m.atk === 'melee' ? (A.flip ? 'chop' : 'slice') : m.atk, a);
    } else {
      A.prev = 0; A.over = null;
      const moving = !!s.moving;
      const loco = !moving ? m.acts.idle : s.run ? m.acts.run : m.acts.walk;
      play(m, loco, 0.18);
      // a passada acompanha a velocidade de quem anda (monstros lentos, heróis rápidos)
      if (loco && moving) loco.timeScale = Math.max(0.6, Math.min(1.5, (s.speed || 9) / (s.run ? 11 : 8)));
    }
  }
  m.mixer.update(dt);
}
/** Duração da queda (para o corpo sumir só depois). */
export function deathTime(m) {
  return m.acts && m.acts.death ? m.acts.death.getClip().duration : 0;
}
