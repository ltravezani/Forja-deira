// ---------- biomas: dados (nome, paleta, luz, monstros, chefe, modelos de sala) ----------
/**
 * Biomas: paleta sombria, texturas procedurais do chão (A e B, misturadas por
 * manchas) e das paredes, e luz. fog = [cor, início, fim].
 */

export const BIOMES = {
  town: { name: 'Refúgio de Aldrena', fog: [0x181b26, 34, 88], hemi: [0x7a8ab8, 0x3a2e22, 2.1], sun: [0xa8bcff, 2.3], light: 0xffc07a, exposure: 1.15, shadow: [0x4a5cc0, 0.5], grade: [0xc4d0ff, 1.03] },
  forest: { name: 'Floresta Sussurrante', base: 3, fog: [0x0e1610, 26, 68], hemi: [0x7a9a70, 0x2a2016, 1.8], sun: [0xc8dcb0, 1.8], light: 0xffc88a, exposure: 1.05, shadow: [0x2e6a86, 0.42], grade: [0xd4ecd0, 1.0], templates: ['cave', 'room', 'cave', 'hall'], monsters: ['goblin', 'spider', 'wolf'], boss: 'queen', decor: 'forest', ambient: 0x9aff8a },
  caves: { name: 'Cavernas de Cristal', base: 30, fog: [0x0a0c1a, 24, 64], hemi: [0x8a92b8, 0x14101c, 1.7], sun: [0xc0caf0, 1.2], light: 0xc8d8ff, exposure: 1.1, shadow: [0x5a44c8, 0.55], grade: [0xc8d4ff, 1.02], templates: ['cave', 'cave', 'room'], monsters: ['bat', 'golem', 'kobold'], boss: 'colossus', decor: 'crystal', ambient: 0x8ad0ff },
  ruins: { name: 'Ruínas de Kael', base: 70, fog: [0x16131c, 26, 70], hemi: [0x9a90b0, 0x2a2016, 1.6], sun: [0xe0d4ff, 1.7], light: 0xffc890, exposure: 1.05, shadow: [0x54489a, 0.45], grade: [0xf0e2d0, 1.0], templates: ['hall', 'room', 'cross', 'hall'], monsters: ['skeleton', 'archer', 'specter'], boss: 'skeking', decor: 'ruins', ambient: 0xd8c8a8 },
  castle: { name: 'Castelo Carmesim', base: 120, fog: [0x160a0e, 26, 66], hemi: [0xb08090, 0x241018, 1.7], sun: [0xffc8b8, 1.4], light: 0xffb888, exposure: 1.05, shadow: [0x5a2a78, 0.5], grade: [0xffd4dc, 1.02], templates: ['hall', 'room', 'cross', 'hall'], monsters: ['knight', 'gargoyle', 'warlock'], boss: 'lord', decor: 'castle', ambient: 0xff8a6a },
  abyss: { name: 'Abismo de Obsidiana', base: 180, fog: [0x1c0806, 26, 66], hemi: [0x9a6a64, 0x2a0e0a, 1.5], sun: [0xffa070, 1.4], light: 0xffb080, exposure: 1.1, shadow: [0x8a1838, 0.55], grade: [0xffd0c0, 0.98], templates: ['cave', 'hall', 'cave', 'room'], monsters: ['lavademon', 'hound', 'herald'], boss: 'tyrant', decor: 'lava', ambient: 0xff7a2a },
  // ---------- Torre Infinita: biomas próprios (monstros reaproveitados), trocados a cada 5 andares ----------
  tw_granite: { name: 'Salões de Granito', tower: true, fog: [0x10141c, 26, 70], hemi: [0x8a98b8, 0x1e1a22, 1.7], sun: [0xc8d4ff, 1.5], light: 0xffc890, exposure: 1.08, shadow: [0x4a58b0, 0.45], grade: [0xd8e0ff, 1.02], monsters: ['skeleton', 'knight', 'golem'], boss: 'skeking', decor: 'tower', ambient: 0xbfd0ff },
  tw_arcane: { name: 'Biblioteca Arcana', tower: true, fog: [0x140c22, 24, 64], hemi: [0xa08ad0, 0x1a1028, 1.7], sun: [0xd8c0ff, 1.3], light: 0xd0a8ff, exposure: 1.1, shadow: [0x5a38c0, 0.55], grade: [0xe4d4ff, 1.03], monsters: ['warlock', 'specter', 'bat'], boss: 'colossus', decor: 'tower', ambient: 0xc89aff },
  tw_storm: { name: 'Terraço da Tempestade', tower: true, fog: [0x0a161a, 26, 66], hemi: [0x7ab0b8, 0x10201e, 1.7], sun: [0xbff4ff, 1.6], light: 0xa8f0ff, exposure: 1.08, shadow: [0x2a6a9a, 0.45], grade: [0xd0f4ff, 1.02], monsters: ['gargoyle', 'archer', 'wolf'], boss: 'lord', decor: 'tower', ambient: 0x8af0ff },
  tw_void: { name: 'Coroa do Vazio', tower: true, fog: [0x12060e, 24, 62], hemi: [0x9a6a9a, 0x1a0814, 1.5], sun: [0xff9ad8, 1.3], light: 0xff9ae0, exposure: 1.1, shadow: [0x7a2080, 0.55], grade: [0xffd0ec, 1.0], monsters: ['herald', 'hound', 'lavademon'], boss: 'tyrant', decor: 'tower', ambient: 0xff6ad0 },
};
export const DUNGEON_ORDER = ['forest', 'caves', 'ruins', 'castle', 'abyss'];
export const floorLevel = (biome, floor) => BIOMES[biome].base + (floor - 1) * 8;
export const TOWER_ORDER = ['tw_granite', 'tw_arcane', 'tw_storm', 'tw_void'];
/** Bioma do andar da torre: troca a cada `every` andares e volta ao início depois do último. */
export const towerBiome = (floor, every = 5) => TOWER_ORDER[Math.floor((Math.max(1, floor) - 1) / every) % TOWER_ORDER.length];
