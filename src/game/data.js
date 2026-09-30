// ---------- dados de conteúdo: monstros, afixos de elite e NPCs da cidade ----------

export const MON = {
  goblin: { name: 'Goblin Saqueador', model: 'humanoid', o: { gltf: 'barbarian', skinK: 0.75, tintK: 0.5, skin: 0x7bbf4a, cloth: 0x7a4a2a, armor: 0x6a4a2a, head: 'goblin', weapon: 'club', scale: 0.8 }, speed: 4.4, range: 1.7, atkT: 1.1, mod: { hp: 0.8, dmg: 0.9 } },
  spider: { name: 'Aranha Tecelã', model: 'spider', o: { body: 0x3a2a4a, belly: 0x6a3a7a, eye: 0xff4040, scale: 0.9 }, speed: 5.4, range: 1.6, atkT: 0.9, mod: { hp: 0.6, dmg: 0.8 } },
  wolf: { name: 'Lobo Sombrio', model: 'beast', o: { fur: 0x4a4a5a, dark: 0x2a2a33, eye: 0xffd040 }, speed: 6.2, range: 1.8, atkT: 0.9, mod: { hp: 0.9, dmg: 1 } },
  bat: { name: 'Morcego de Cristal', model: 'bat', o: { body: 0x6a5acd, wing: 0x3a2a6a, eye: 0x99ffff, glow: 0x3a2a8a }, speed: 6.6, range: 1.6, atkT: 0.8, mod: { hp: 0.55, dmg: 0.8 } },
  golem: { name: 'Golem de Pedra', model: 'golem', o: { stone: 0x777a88, core: 0x66e0ff, scale: 0.85 }, speed: 3, range: 2.2, atkT: 1.6, mod: { hp: 1.8, dmg: 1.3, def: 1.5 } },
  kobold: { name: 'Kobold Mineiro', model: 'humanoid', o: { gltf: 'barbarian', skinK: 0.6, tintK: 0.5, skin: 0xb07a4a, cloth: 0x55606a, armor: 0x55606a, head: 'goblin', weapon: 'club', scale: 0.75 }, ranged: { speed: 13, color: 0xffaa44 }, speed: 4, range: 9, atkT: 1.8, mod: { hp: 0.8, dmg: 0.9 } },
  skeleton: { name: 'Esqueleto Guerreiro', model: 'humanoid', o: { gltf: 'skeleton', skin: 0xe8e0cc, cloth: 0x5a5048, armor: 0x6a6258, head: 'skull', weapon: 'sword', thin: true }, speed: 4.6, range: 1.9, atkT: 1.2, mod: { hp: 1, dmg: 1 } },
  archer: { name: 'Esqueleto Arqueiro', model: 'humanoid', o: { gltf: 'skeletonRogue', skin: 0xe8e0cc, cloth: 0x4a5a48, armor: 0x4a5a48, head: 'skull', weapon: 'bow', thin: true, eye: 0xff6a3a }, ranged: { speed: 16, color: 0xe8e0cc, arrow: true }, speed: 4, range: 11, atkT: 1.7, mod: { hp: 0.8, dmg: 1 } },
  specter: { name: 'Espectro', model: 'floater', o: { body: 0x7fd6ff, eye: 0xffffff, ghost: true }, speed: 5, range: 1.7, atkT: 1.1, mod: { hp: 0.9, dmg: 1.1 } },
  knight: { name: 'Cavaleiro Profano', model: 'humanoid', o: { gltf: 'knight', tintK: 0.7, skinK: 0.5, skin: 0x3a3a44, cloth: 0x7a1f2a, armor: 0x4a4a58, trim: 0xa01a2a, head: 'helm', horns: true, weapon: 'sword', bulky: true, shield: true, scale: 1.05 }, speed: 4, range: 2.1, atkT: 1.3, mod: { hp: 1.5, dmg: 1.2, def: 1.4 } },
  gargoyle: { name: 'Gárgula', model: 'bat', o: { body: 0x6a6a70, wing: 0x4a4a52, eye: 0xff5020, scale: 1.35 }, speed: 5.6, range: 1.9, atkT: 1, mod: { hp: 1.1, dmg: 1.1 } },
  warlock: { name: 'Feiticeiro Rubro', model: 'humanoid', o: { gltf: 'mage', tintK: 0.85, skin: 0xc9a88a, cloth: 0x8a1a3a, armor: 0x6a1a2a, head: 'hood', weapon: 'staff', weaponGlow: 0xff3a6a, robe: true }, ranged: { speed: 11, color: 0xff3a6a }, speed: 3.8, range: 10, atkT: 1.9, mod: { hp: 0.9, dmg: 1.3 } },
  lavademon: { name: 'Demônio de Magma', model: 'golem', o: { stone: 0x3a2020, core: 0xff6a1a, scale: 0.95 }, speed: 3.4, range: 2.2, atkT: 1.4, mod: { hp: 1.7, dmg: 1.3, def: 1.3 } },
  hound: { name: 'Cão Infernal', model: 'beast', o: { fur: 0x5a1a10, dark: 0x2a0a08, eye: 0xffcc00, flame: true, scale: 1.1 }, speed: 6.6, range: 1.9, atkT: 0.85, mod: { hp: 1, dmg: 1.1 } },
  herald: { name: 'Arauto do Vazio', model: 'floater', o: { body: 0x7a3aff, eye: 0xff66ff }, ranged: { speed: 10, color: 0xbb66ff }, speed: 4, range: 10, atkT: 1.7, mod: { hp: 1, dmg: 1.3 } },
  // chefes
  queen: { name: 'Rainha Aracnídea', model: 'spider', o: { body: 0x5a1a5a, belly: 0x8a2a6a, eye: 0x40ff80, scale: 2.4 }, boss: true, speed: 4.4, range: 3.2, atkT: 1.2, mod: { hp: 16, dmg: 1.8, def: 1.4 } },
  colossus: { name: 'Colosso de Cristal', model: 'golem', o: { stone: 0x5a6aa8, core: 0xbfffff, scale: 1.9 }, boss: true, speed: 3.2, range: 3.6, atkT: 1.6, mod: { hp: 18, dmg: 2, def: 1.6 } },
  skeking: { name: 'Rei Esqueleto Aldric', model: 'humanoid', o: { gltf: 'skeleton', tintK: 0.6, skin: 0xf0e6c8, cloth: 0x3a2a6a, armor: 0x4a3a7a, trim: 0xffd24a, head: 'skull', eye: 0x9a6aff, crown: true, weapon: 'sword', weaponGlow: 0x9a6aff, scale: 2.1 }, boss: true, speed: 4.2, range: 3.4, atkT: 1.3, mod: { hp: 16, dmg: 1.9, def: 1.5 } },
  lord: { name: 'Lorde Carmesim', model: 'humanoid', o: { gltf: 'knight', tintK: 0.75, skinK: 0.6, skin: 0x2a2a30, cloth: 0xa01a2a, armor: 0x302a34, trim: 0xff3a3a, trimGlow: true, head: 'helm', eye: 0xff2a2a, horns: true, weapon: 'sword', weaponGlow: 0xff2a2a, bulky: true, scale: 2.1 }, boss: true, speed: 4.4, range: 3.6, atkT: 1.2, mod: { hp: 18, dmg: 2, def: 1.6 } },
  tyrant: { name: 'Tirano do Abismo', model: 'golem', o: { stone: 0x2a1010, core: 0xff3a0a, scale: 2.2 }, boss: true, speed: 3.6, range: 4, atkT: 1.4, mod: { hp: 22, dmg: 2.2, def: 1.7 } },
};
export const AFFIX = {
  veloz: { name: 'Veloz', speed: 1.5 },
  colosso: { name: 'Colosso', hp: 2, scale: 1.3 },
  vampirico: { name: 'Vampírico', leech: 0.25 },
  explosivo: { name: 'Explosivo', explode: true },
};
export const NPCS = {
  smith: { name: 'Hanzo', role: 'Ferreiro · aprimoramento com Jewels', look: { gltf: 'barbarian', skin: 0xc08a60, cloth: 0x5a3a2a, armor: 0x6a5a4a, head: 'human', weapon: 'club', bulky: true }, say: 'Bless leva até +6 sem falhar. Soul é sorte. Chaos… Chaos é fé. Mas aqui ninguém perde item: no pior caso volta a +0.' },
  merchant: { name: 'Lira', role: 'Mercadora · poções e compra de itens', look: { skin: 0xf0c8a0, cloth: 0x2a6a5a, armor: 0x2a6a5a, head: 'hair', hair: 0x8a3a2a }, say: 'Poções fresquinhas! E se o seu pet estiver ocupado, eu compro o que você carrega.' },
  portal: { name: 'Guardiã Nyx', role: 'Portais das masmorras', look: { gltf: 'mage', skin: 0xd0b8f0, cloth: 0x3a2a6a, armor: 0x3a2a6a, head: 'hood', weapon: 'staff', robe: true, weaponGlow: 0xb08aff }, say: 'Cada portal abre um labirinto diferente — a semente muda a cada visita. Derrote o guardião do andar para descer.' },
  master: { name: 'Mestre Orvan', role: 'Evolução de classe · Reset · Árvore', look: { gltf: 'mage', skin: 0xd8b890, cloth: 0x7a1a1a, armor: 0x7a1a1a, head: 'hood', robe: true, weapon: 'staff', weaponGlow: 0xffcc66 }, say: 'Força sem propósito é só barulho. Prove seu valor contra os guardiões e eu revelarei sua próxima forma.' },
  tower: { name: 'Guardião Varek', role: 'Guardião da Torre · Torre Infinita', look: { gltf: 'knight', skin: 0xb8c8e0, cloth: 0x1a2a4a, armor: 0x5a6a8a, trim: 0x6ad8ff, trimGlow: true, head: 'helm', weapon: 'staff', weaponGlow: 0x6ad8ff, robe: true, eye: 0x6ad8ff }, say: 'A torre não tem topo. Cada andar é mais cruel que o anterior, e lá dentro só se encontra ouro e Jewels. Derrote o guardião de cada andar e suba o quanto aguentar.' },
  duel: { name: 'Kora', role: 'Arena de Duelo · em construção', look: { gltf: 'knight', skin: 0xe0a880, cloth: 0x3a3a3a, armor: 0x8a2a2a, head: 'helm', weapon: 'sword', shield: true }, say: 'A arena ainda está sendo erguida. Em breve, desafios contra os campeões de Aldrena. Até lá, afie a lâmina nas masmorras.' },
};
