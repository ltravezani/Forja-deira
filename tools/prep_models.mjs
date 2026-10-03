#!/usr/bin/env node
// =============================================================================
// Prepara os modelos glTF do KayKit Skeletons 1.0 (CC0) para o jogo: tira as
// animações de cada personagem (todos usam o mesmo esqueleto), junta num só
// arquivo apenas os clipes usados, reamostra as curvas e remove o que sobrou.
// Os heróis vêm do Adventurers 2.0 (tools/prep_adventurers.mjs). Saída em
// assets/models/*.glb, que o tools/build.py embute no HTML em base64.
//
// Uso (uma vez, fora do jogo; o jogo não depende destes pacotes):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4
//   node tools/prep_models.mjs <pasta KayKit-Character-Pack-Skeletons-1.0>
// =============================================================================
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const [SKE] = process.argv.slice(2);
if (!SKE) { console.error('uso: node tools/prep_models.mjs <skeletons>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const skeC = (n) => path.join(SKE, 'addons/kaykit_character_pack_skeletons/Characters/gltf', n + '.glb');
const skeA = (n) => path.join(SKE, 'addons/kaykit_character_pack_skeletons/Assets/gltf', n + '.gltf');

/** Remove uma animação com seus canais e amostradores (senão os dados das curvas continuam no arquivo). */
function dropAnim(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const sm of a.listSamplers()) sm.dispose();
  a.dispose();
}
/** Clipes usados pelo jogo (ver art/gltfModels.js). */
const CLIPS = ['Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal',
  'Spellcast_Shoot', 'Spellcast_Raise', '2H_Ranged_Shoot', 'Death_A'];

async function save(doc, name) {
  await doc.transform(prune(), dedup());
  const file = path.join(OUT, name + '.glb');
  await io.write(file, doc);
  console.log(name.padEnd(20), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

// personagens: só malha, esqueleto e textura
for (const name of ['Skeleton_Warrior', 'Skeleton_Rogue']) {
  const doc = await io.read(skeC(name));
  for (const a of doc.getRoot().listAnimations()) dropAnim(a);
  await save(doc, name);
}
// animações: o pacote de esqueletos tem o conjunto completo; ficam só os clipes usados, sem malhas
{
  const doc = await io.read(skeC('Skeleton_Minion'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!CLIPS.includes(a.getName())) dropAnim(a);
  const missing = CLIPS.filter((c) => !root.listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error('clipes ausentes: ' + missing.join(', '));
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await save(doc, 'anims');
}
// armas dos esqueletos (arquivos .gltf soltos → .glb)
for (const name of ['Skeleton_Blade', 'Skeleton_Shield_Small_A', 'Skeleton_Crossbow']) {
  await save(await io.read(skeA(name)), name);
}
