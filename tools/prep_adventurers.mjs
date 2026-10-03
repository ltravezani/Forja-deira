#!/usr/bin/env node
// =============================================================================
// Prepara os heróis do KayKit Adventurers 2.0 (CC0) para o jogo: Knight, Mage,
// Rogue, Rogue_Hooded e Barbarian (só malha, esqueleto e textura, com normais,
// UVs e pesos quantizados), as armas avulsas do pacote num só arquivo
// (AdvWeapons) e os clipes extras de reação a dano e de surgir do chão
// (anims_extra). O esqueleto é o mesmo do 1.0, então os clipes de golpe e magia
// do anims.glb continuam valendo. Saída em assets/models/*.glb, que o
// tools/build.py embute no HTML.
//
// Uso (uma vez, fora do jogo; o jogo não depende destes pacotes):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4
//   node tools/prep_adventurers.mjs <pasta KayKit_Adventurers_2.0_FREE>
// =============================================================================
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, quantize, resample, unpartition } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const [ADV] = process.argv.slice(2);
if (!ADV) { console.error('uso: node tools/prep_adventurers.mjs <KayKit_Adventurers_2.0_FREE>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function dropAnim(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const sm of a.listSamplers()) sm.dispose();
  a.dispose();
}
/** Quantiza tudo menos as posições: sem isso as caixas das geometrias sairiam na escala quantizada. */
const QUANT = quantize({ pattern: /^(NORMAL|TEXCOORD|JOINTS|WEIGHTS)/ });
async function save(doc, name, ...extra) {
  await doc.transform(prune(), dedup(), ...extra);
  const file = path.join(OUT, name + '.glb');
  await io.write(file, doc);
  console.log(name.padEnd(20), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

// heróis
for (const name of ['Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian']) {
  const doc = await io.read(path.join(ADV, 'Characters/gltf', name + '.glb'));
  for (const a of doc.getRoot().listAnimations()) dropAnim(a);
  await save(doc, name, QUANT);
}
// armas avulsas (mesma geometria das armas que vinham presas aos heróis no 1.0); cada nó leva o nome do arquivo
{
  const WEAPONS = ['sword_1handed', 'sword_2handed', 'axe_1handed', 'dagger', 'staff', 'wand', 'crossbow_2handed', 'shield_badge_color'];
  const doc = await io.read(path.join(ADV, 'Assets/gltf', WEAPONS[0] + '.gltf'));
  for (const w of WEAPONS.slice(1)) mergeDocuments(doc, await io.read(path.join(ADV, 'Assets/gltf', w + '.gltf')));
  const root = doc.getRoot(), scene = root.listScenes()[0];
  for (const s of root.listScenes().slice(1)) { for (const n of s.listChildren()) scene.addChild(n); s.dispose(); }
  await doc.transform(unpartition());
  await save(doc, 'AdvWeapons', QUANT);
}
// clipes extras: reação a dano e surgir do chão (só os ossos, sem o manequim)
{
  const doc = await io.read(path.join(ADV, 'Animations/gltf/Rig_Medium/Rig_Medium_General.glb'));
  const root = doc.getRoot(), KEEP = ['Hit_A', 'Spawn_Ground'];
  for (const a of root.listAnimations()) if (!KEEP.includes(a.getName())) dropAnim(a);
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await save(doc, 'anims_extra');
}
