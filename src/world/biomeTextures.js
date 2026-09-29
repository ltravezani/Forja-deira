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
    // ---------- Torre Infinita ----------
    case 'tw_granite': return {
      a: texStones('flag_twgranite', { stone: 0x7e828e, stone2: 0x6a6e7a, mortar: 0x262a34, slabs: true, rows: 3 }),
      b: texStones('cobble_twgranite', { stone: 0x6e727e, stone2: 0x5e626e, mortar: 0x1e222a, n: 30 }),
      wall: texBricks('wall_twgranite', { brick: 0x7a7e8c, brick2: 0x686c7a, mortar: 0x1c1e26, rows: 6, cols: 2 }), wallCol: 0xffffff, capCol: 0x9aa0b4,
    };
    case 'tw_arcane': return {
      a: texPlanks('floor_twarcane', { wood: 0x5a3a4a, wood2: 0x4a2e3e, n: 6 }),
      b: texStones('flag_twarcane', { stone: 0x5e4e7a, stone2: 0x4e4068, mortar: 0x1a1428, slabs: true, rows: 4 }),
      wall: texBricks('wall_twarcane', { brick: 0x5a4a78, brick2: 0x4a3c66, mortar: 0x140e22, rows: 5, cols: 3 }), wallCol: 0xffffff, capCol: 0x8a6ac0,
    };
    case 'tw_storm': return {
      a: texStones('flag_twstorm', { stone: 0x6a7e82, stone2: 0x5a6e72, mortar: 0x1a2426, slabs: true, rows: 4, mossAmt: 0.3, moss: 0x3a6a5a }),
      b: texGround('moss_twstorm', { a: 0x2e5a4e, b: 0x3a6a5a, c: 0x7a9a96, blades: true, bladeCol: 0x6ab8a0 }),
      wall: texRock('wall_twstorm', { a: 0x4a5a60, b: 0x5e7278, n: 14 }), wallCol: 0xffffff, capCol: 0x6a9a98,
    };
    case 'tw_void': return {
      a: texRock('floor_twvoid', { a: 0x2a1e2e, b: 0x3a2a3e, n: 12, soft: true }),
      b: texStones('flag_twvoid', { stone: 0x3a2a40, stone2: 0x2e2034, mortar: 0x0e0610, slabs: true, rows: 3 }),
      wall: texRock('wall_twvoid', { a: 0x2a1430, b: 0x46204a, glow: true, n: 16 }), wallCol: 0xffffff, capCol: 0x4a2450, wallGlow: 0xff3ad0,
    };
  }
  return biomeTex('ruins');
}
