// ---------- biomas: dados (nome, paleta, luz, monstros, chefe, modelos de sala) ----------
/**
 * Biomas: paleta sombria, texturas procedurais do chão (A e B, misturadas por
 * manchas) e das paredes, e luz. fog = [cor, início, fim].
 */

export const BIOMES = {
  town: { name: 'Refúgio de Aldrena', fog: [0x181b26, 34, 88], hemi: [0x7a8ab8, 0x3a2e22, 2.1], sun: [0xa8bcff, 2.3], light: 0xffc07a, exposure: 1.15, grade: [0xc4d0ff, 1.03] },
  forest: { name: 'Floresta Sussurrante', base: 3, fog: [0x0e1610, 26, 68], hemi: [0x7a9a70, 0x2a2016, 1.8], sun: [0xc8dcb0, 1.8], light: 0xffc88a, exposure: 1.05, grade: [0xd4ecd0, 1.0], templates: ['cave', 'room', 'cave', 'hall'], monsters: ['goblin', 'spider', 'wolf'], boss: 'queen', decor: 'forest', ambient: 0x9aff8a },
  caves: { name: 'Cavernas de Cristal', base: 30, fog: [0x0a0c1a, 24, 64], hemi: [0x8a92b8, 0x14101c, 1.7], sun: [0xc0caf0, 1.2], light: 0xc8d8ff, exposure: 1.1, grade: [0xc8d4ff, 1.02], templates: ['cave', 'cave', 'room'], monsters: ['bat', 'golem', 'kobold'], boss: 'colossus', decor: 'crystal', ambient: 0x8ad0ff },
  ruins: { name: 'Ruínas de Kael', base: 70, fog: [0x16131c, 26, 70], hemi: [0x9a90b0, 0x2a2016, 1.6], sun: [0xe0d4ff, 1.7], light: 0xffc890, exposure: 1.05, grade: [0xf0e2d0, 1.0], templates: ['hall', 'room', 'cross', 'hall'], monsters: ['skeleton', 'archer', 'specter'], boss: 'skeking', decor: 'ruins', ambient: 0xd8c8a8 },
  castle: { name: 'Castelo Carmesim', base: 120, fog: [0x160a0e, 26, 66], hemi: [0xb08090, 0x241018, 1.7], sun: [0xffc8b8, 1.4], light: 0xffb888, exposure: 1.05, grade: [0xffd4dc, 1.02], templates: ['hall', 'room', 'cross', 'hall'], monsters: ['knight', 'gargoyle', 'warlock'], boss: 'lord', decor: 'castle', ambient: 0xff8a6a },
  abyss: { name: 'Abismo de Obsidiana', base: 180, fog: [0x1c0806, 26, 66], hemi: [0x9a6a64, 0x2a0e0a, 1.5], sun: [0xffa070, 1.4], light: 0xffb080, exposure: 1.1, grade: [0xffd0c0, 0.98], templates: ['cave', 'hall', 'cave', 'room'], monsters: ['lavademon', 'hound', 'herald'], boss: 'tyrant', decor: 'lava', ambient: 0xff7a2a },
};
export const DUNGEON_ORDER = ['forest', 'caves', 'ruins', 'castle', 'abyss'];
export const floorLevel = (biome, floor) => BIOMES[biome].base + (floor - 1) * 8;
