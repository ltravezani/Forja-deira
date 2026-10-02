#!/usr/bin/env node
// =============================================================================
// Prepara as armas do KayKit Fantasy Weapons Bits (CC0) para o jogo: junta num só
// arquivo os modelos usados (um nó por arma, com o nome do arquivo de origem), uma
// única textura de paleta; as malhas são simplificadas e quantizadas. Saída em assets/models/weapons.glb,
// que o tools/build.py embute no HTML em base64 (art/weaponIcons.js desenha os ícones).
//
// Uso (uma vez, fora do jogo; o jogo não depende destes pacotes):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
//   node tools/prep_weapons.mjs <pasta KayKit_FantasyWeaponsBits_1.0_FREE>
// =============================================================================
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, quantize, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const [PACK] = process.argv.slice(2);
if (!PACK) { console.error('uso: node tools/prep_weapons.mjs <KayKit_FantasyWeaponsBits_1.0_FREE>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models', 'weapons.glb');

/** Modelos usados (ver WEAPON_ICONS em art/weaponIcons.js). */
const USED = ['sword_A', 'sword_B', 'sword_C', 'sword_D', 'sword_E', 'staff_A', 'staff_B', 'wand_A', 'bow_A_withString', 'bow_B_withString'];

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const doc = await io.read(path.join(PACK, 'Assets/gltf', USED[0] + '.gltf'));
for (const name of USED.slice(1)) mergeDocuments(doc, await io.read(path.join(PACK, 'Assets/gltf', name + '.gltf')));
// uma cena só, com um nó por arma
const root = doc.getRoot(), scenes = root.listScenes(), scene = scenes[0];
for (const s of scenes.slice(1)) { for (const n of s.listChildren()) scene.addChild(n); s.dispose(); }
const names = scene.listChildren().map((n) => n.getName());
const missing = USED.filter((n) => !names.includes(n));
if (missing.length) throw new Error('modelos ausentes: ' + missing.join(', '));
// os modelos só viram ícones de 128 px: dá para simplificar as malhas e guardar as normais em 8 bits
await MeshoptSimplifier.ready;
await doc.transform(unpartition(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.004 }), prune(),
  quantize({ quantizeNormal: 8 }));
await io.write(OUT, doc);
console.log('weapons'.padEnd(20), (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB', '(' + names.length + ' armas)');
