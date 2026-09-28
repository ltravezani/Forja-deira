// ---------- texturas procedurais de cada bioma (chão A/B e paredes) ----------
/** Texturas de cada bioma (geradas na primeira visita e guardadas). Paletas "pintadas": saturadas, formas grandes. */
import { texBricks, texGround, texPlanks, texRock, texStones } from '../art/textures.js';

export function biomeTex(id) {
  switch (id) {
    case 'town': return {
      a: texStones('cobble_town3', { stone: 0x8e7e6c, stone2: 0x786a5e, mortar: 0x4a3e32, n: 24, mossAmt: 0.25, moss: 0x5a7a2a }),
      b: texGround('grass_town3', { a: 0x46682a, b: 0x5a7a2e, c: 0x9a9280, blades: true, bladeCol: 0x8ab842 }),
      wall: texPlanks('palisade3', { wood: 0x8a5a34, wood2: 0x6a4426, n: 5 }), wallCol: 0xffffff, capCol: 0.7,
    };
    case 'forest': return {
      a: texGround('grass_forest3', { a: 0x3a6428, b: 0x4e7430, c: 0x8a8672, blades: true, bladeCol: 0x86c048 }),
      b: texGround('mud_forest3', { a: 0x6a4a2e, b: 0x5a3e28, c: 0x9a9080 }),
      wall: texRock('cliff_forest3', { a: 0x5a5a4a, b: 0x74805a, n: 18 }), wallCol: 0xffffff, capCol: 0x4e7a2c,
    };
    case 'caves': return {
      a: texRock('floor_caves3', { a: 0x40465e, b: 0x505a78, n: 12, soft: true }),
      b: texGround('gravel_caves3', { a: 0x363c5c, b: 0x444a6c, c: 0x8a90b8 }),
      wall: texRock('wall_caves3', { a: 0x343a58, b: 0x4a5278, n: 16 }), wallCol: 0xffffff, capCol: 0x6a74a0,
    };
    case 'ruins': return {
      a: texStones('flag_ruins3', { stone: 0x9e9276, stone2: 0x847a64, mortar: 0x4a3e30, slabs: true, rows: 4, mossAmt: 0.3, moss: 0x5e7a2c }),
      b: texGround('dirt_ruins3', { a: 0x7a6446, b: 0x5e6a34, c: 0xa89a80, blades: true, bladeCol: 0x8aa844 }),
      wall: texBricks('wall_ruins3', { brick: 0xaa9a7a, brick2: 0x8c7c64, mortar: 0x3a3024, rows: 5, cols: 3, mossAmt: 0.25 }), wallCol: 0xffffff, capCol: 0x8c8e70,
    };
    case 'castle': return {
      a: texStones('flag_castle3', { stone: 0x685256, stone2: 0x58464a, mortar: 0x221418, slabs: true, rows: 4 }),
      b: texStones('cobble_castle3', { stone: 0x5e4a4e, stone2: 0x4e3c40, mortar: 0x1e1014, n: 26 }),
      wall: texBricks('wall_castle3', { brick: 0x6a5256, brick2: 0x564246, mortar: 0x1a0e12, rows: 5, cols: 3 }), wallCol: 0xffffff, capCol: 0x8a3a3a,
    };
    case 'abyss': return {
      a: texRock('floor_abyss3', { a: 0x2c2428, b: 0x3a3034, n: 12, soft: true }),
      b: texGround('ash_abyss3', { a: 0x3a302c, b: 0x4a3a34, c: 0x7a6a60 }),
      wall: texRock('wall_abyss3', { a: 0x2a1614, b: 0x46241e, glow: true, n: 16 }), wallCol: 0xffffff, capCol: 0x3a2420, wallGlow: 0xff6a18,
    };
  }
  return biomeTex('ruins');
}
