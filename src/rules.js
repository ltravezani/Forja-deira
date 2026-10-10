/*
 * Forja-deira — regras de jogo (progressão, atributos, itens, loot, EXP).
 *
 * Funções puras, sem DOM nem Three.js: o jogo as usa no navegador e os testes
 * (tests/) as executam no Node. Todo o balanceamento fica centralizado aqui.
 *
 * As fórmulas de atributos modelam cada classe como uma lista de relações
 * "alvo = multiplicador × fonte".
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.ForjaRules = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.1.0';

  // ---------------------------------------------------------------------------
  // Taxas do servidor
  // ---------------------------------------------------------------------------
  const RATES = {
    exp: 1500,                  // taxa de EXP sem reset
    expResetFactor: 0.92,       // cada reset multiplica a taxa por este fator
    expMin: 150,                // piso da taxa de EXP regressiva
    maxLevel: 1000,
    resetLevel: 400,            // nível mínimo para reset
    resetPoints: 300,           // pontos livres concedidos por reset acumulado
    resetBonusPerLevel: 3,      // bônus por nível acima de 400 no momento do reset
    maxResets: 100,
    chaosFeeGold: 1000000,       // taxa em Gold da fusão Chaos (+10..+15)
  };
  const resetGoldCost = (resets) => Math.min(500000 * (resets + 1), 20000000);

  // ---------------------------------------------------------------------------
  // RNG determinístico (seeds públicas → loot auditável)
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash32() {
    let h = 0x811c9dc5;
    const s = Array.prototype.join.call(arguments, '|');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return h >>> 0;
  }
  const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------------------
  // Experiência
  // ---------------------------------------------------------------------------
  /** EXP para passar do nível L para L+1 (curva clássica + cauda pós-255). */
  function expToNext(level) {
    let e = (level + 9) * level * level * 10;
    if (level > 255) {
      const x = level - 255;
      e += (x + 9) * x * x * 100;
    }
    return e;
  }
  /**
   * Taxa de EXP regressiva: 1500x sem reset, cai 8% a cada reset e nunca fica
   * abaixo de 150x. Arredondada a múltiplos de 10 para ficar legível na HUD.
   */
  function expRate(resets) {
    const r = Math.max(0, resets | 0);
    const v = RATES.exp * Math.pow(RATES.expResetFactor, r);
    return Math.max(RATES.expMin, Math.round(v / 10) * 10);
  }
  /** EXP por monstro: fórmula clássica com penalidade quando o monstro é muito mais fraco. */
  function monsterExp(mLevel, pLevel, rate) {
    rate = rate || RATES.exp;
    let e = ((mLevel + 25) * mLevel) / 3;
    if (mLevel + 10 < pLevel) e = (e * (mLevel + 10)) / pLevel;
    return Math.max(1, Math.floor(e * rate));
  }
  /** Divisão de EXP em party: bônus por membro, partilha proporcional ao nível. */
  function partyShare(levels, exp) {
    const n = levels.length;
    if (n <= 1) return [exp];
    const distinctBonus = 1 + 0.12 * (n - 1);
    const total = exp * distinctBonus;
    const sum = levels.reduce((a, b) => a + b, 0);
    return levels.map((l) => Math.floor((total * l) / sum));
  }

  // ---------------------------------------------------------------------------
  // Classes
  // ---------------------------------------------------------------------------
  // rel: [alvo, multiplicador, fonte]  (fonte: str/agi/vit/ene/level)
  const CLASSES = {
    dk: {
      id: 'dk', tiers: ['Dark Knight', 'Blade Knight', 'Blade Master'],
      role: 'Guerreiro corpo a corpo', weapon: 'sword', mainStat: 'str',
      base: { str: 28, agi: 20, vit: 25, ene: 10 }, ppl: 5,
      konst: { maxHp: 35, maxMp: 10 },
      rel: [
        ['maxHp', 2, 'level'], ['maxHp', 3, 'vit'],
        ['maxMp', 0.5, 'level'], ['maxMp', 1, 'ene'],
        ['maxAg', 1, 'ene'], ['maxAg', 0.3, 'vit'], ['maxAg', 0.2, 'agi'], ['maxAg', 0.15, 'str'],
        ['def', 1 / 3, 'agi'], ['atkSpeed', 1 / 15, 'agi'],
        ['minDmg', 1 / 6, 'str'], ['maxDmg', 1 / 4, 'str'],
        ['skillMul', 0.001, 'ene'],
      ],
      auto: { str: 0.45, agi: 0.2, vit: 0.3, ene: 0.05 },
      color: '#d9573b',
      blurb: 'Tanque de linha de frente. Força gera dano, Energia amplia habilidades e AG.',
    },
    dw: {
      id: 'dw', tiers: ['Dark Wizard', 'Soul Master', 'Grand Master'],
      role: 'Mago de área', weapon: 'staff', mainStat: 'ene',
      base: { str: 18, agi: 18, vit: 15, ene: 30 }, ppl: 5,
      // dano mágico e HP fixos extras: pesam nos níveis iniciais e somem na escala depois
      konst: { maxHp: 50, maxMp: 20, minWiz: 3, maxWiz: 5 },
      rel: [
        ['maxHp', 1, 'level'], ['maxHp', 2, 'vit'],
        ['maxMp', 2, 'level'], ['maxMp', 2, 'ene'],
        ['maxAg', 0.2, 'ene'], ['maxAg', 0.3, 'vit'], ['maxAg', 0.4, 'agi'], ['maxAg', 0.2, 'str'],
        ['def', 1 / 4, 'agi'], ['atkSpeed', 1 / 20, 'agi'],
        ['minDmg', 1 / 8, 'str'], ['maxDmg', 1 / 4, 'str'],
        ['minWiz', 1 / 9, 'ene'], ['maxWiz', 1 / 4, 'ene'],
      ],
      auto: { str: 0.05, agi: 0.2, vit: 0.25, ene: 0.5 },
      color: '#5b7cff',
      blurb: 'Destrói grupos à distância. Energia gera dano mágico e mana.',
    },
    elf: {
      id: 'elf', tiers: ['Fairy Elf', 'Muse Elf', 'High Elf'],
      role: 'Arqueira e suporte', weapon: 'bow', mainStat: 'agi',
      base: { str: 22, agi: 25, vit: 20, ene: 15 }, ppl: 5,
      konst: { maxHp: 39, maxMp: 6 },
      rel: [
        ['maxHp', 1, 'level'], ['maxHp', 2, 'vit'],
        ['maxMp', 1.5, 'level'], ['maxMp', 1.5, 'ene'],
        ['maxAg', 0.2, 'ene'], ['maxAg', 0.3, 'vit'], ['maxAg', 0.2, 'agi'], ['maxAg', 0.3, 'str'],
        ['def', 1 / 10, 'agi'], ['atkSpeed', 1 / 50, 'agi'],
        ['minDmg', 1 / 14, 'str'], ['minDmg', 1 / 7, 'agi'],
        ['maxDmg', 1 / 8, 'str'], ['maxDmg', 1 / 4, 'agi'],
      ],
      auto: { str: 0.15, agi: 0.5, vit: 0.25, ene: 0.1 },
      color: '#4fc27a',
      blurb: 'Dano contínuo à distância, cura e invocação. Agilidade é tudo.',
    },
    // gear: de qual classe vêm os itens que ela usa (arma e armaduras); sem gear, os da própria classe
    de: {
      id: 'de', tiers: ['Dark Elf', 'Bloody Elf', 'Shadowblade'],
      role: 'Lâminas duplas e fúria', weapon: 'sword', mainStat: 'str', dual: true,
      gear: { weapon: 'dk', armor: 'elf' },
      base: { str: 24, agi: 26, vit: 20, ene: 12 }, ppl: 5,
      konst: { maxHp: 40, maxMp: 8 },
      rel: [
        ['maxHp', 1.5, 'level'], ['maxHp', 2.5, 'vit'],
        ['maxMp', 1, 'level'], ['maxMp', 1, 'ene'],
        ['maxAg', 0.6, 'ene'], ['maxAg', 0.3, 'vit'], ['maxAg', 0.3, 'agi'], ['maxAg', 0.15, 'str'],
        ['def', 1 / 5, 'agi'], ['atkSpeed', 1 / 12, 'agi'],
        ['minDmg', 1 / 8, 'str'], ['minDmg', 1 / 12, 'agi'],
        ['maxDmg', 1 / 5, 'str'], ['maxDmg', 1 / 8, 'agi'],
        ['skillMul', 0.001, 'ene'],
      ],
      auto: { str: 0.4, agi: 0.3, vit: 0.25, ene: 0.05 },
      color: '#c23a6a',
      blurb: 'Duas espadas, golpes em área e fúria. Força gera dano, Agilidade dá velocidade. Usa as espadas do Dark Knight e as armaduras da Fairy Elf.',
    },
    nc: {
      id: 'nc', tiers: ['Necromancer', 'Death Knight', 'Bloody Knight'],
      role: 'Roubo de vida e mortos-vivos', weapon: 'staff', mainStat: 'ene', dual: true, magic: true,
      gear: { weapon: 'dw', armor: 'dw' },
      base: { str: 20, agi: 16, vit: 22, ene: 26 }, ppl: 5,
      // roubo de vida próprio da classe (soma com itens e árvore)
      konst: { maxHp: 55, maxMp: 16, minWiz: 3, maxWiz: 5 },
      passive: { lifeSteal: 2 },
      rel: [
        ['maxHp', 1.5, 'level'], ['maxHp', 2.5, 'vit'],
        ['maxMp', 1.5, 'level'], ['maxMp', 1.5, 'ene'],
        ['maxAg', 0.3, 'ene'], ['maxAg', 0.3, 'vit'], ['maxAg', 0.3, 'agi'], ['maxAg', 0.2, 'str'],
        ['def', 1 / 4, 'agi'], ['atkSpeed', 1 / 20, 'agi'],
        ['minDmg', 1 / 8, 'str'], ['maxDmg', 1 / 4, 'str'],
        ['minWiz', 1 / 10, 'ene'], ['maxWiz', 1 / 4.5, 'ene'],
      ],
      auto: { str: 0.05, agi: 0.15, vit: 0.3, ene: 0.5 },
      color: '#8a4ad0',
      blurb: 'Drena a vida dos inimigos e ergue os mortos. Energia gera dano mágico. Usa os cajados e armaduras do Dark Wizard.',
    },
  };
  /** Classe dos itens que `cls` equipa no slot (a própria, ou a indicada em gear). */
  function gearCls(cls, slot) {
    const g = CLASSES[cls] && CLASSES[cls].gear;
    return g ? (slot === 'weapon' ? g.weapon : g.armor) : cls;
  }
  /** Esta classe pode equipar o item? (anéis, colares e asas servem a todas) */
  function canUse(cls, it) {
    return !!(it && it.slot && (!it.cls || gearCls(cls, it.slot) === it.cls));
  }
  /** Nomes das classes que usam o item (para a descrição). */
  function itemUsers(it) {
    return Object.keys(CLASSES).filter((c) => canUse(c, it)).map((c) => CLASSES[c].tiers[0]);
  }

  /** Elenco completo planejado. Só as classes com entrada em CLASSES são jogáveis. */
  const ROSTER = [
    { id: 'dk', name: 'Dark Knight', phase: 1 },
    { id: 'dw', name: 'Dark Wizard', phase: 1 },
    { id: 'elf', name: 'Fairy Elf', phase: 1 },
    { id: 'de', name: 'Dark Elf', phase: 1 },
    { id: 'nc', name: 'Necromancer', phase: 1 },
    { id: 'sum', name: 'Summoner', phase: 2, role: 'Maldições e invocações' },
    { id: 'mg', name: 'Magic Gladiator', phase: 2, role: 'Híbrido espada + magia' },
    { id: 'dl', name: 'Dark Lord', phase: 2, role: 'Comando, corvo e montaria' },
    { id: 'rf', name: 'Rage Fighter', phase: 2, role: 'Monge de combos' },
    { id: 'gl', name: 'Grow Lancer', phase: 2, role: 'Lança e fúria' },
    { id: 'rw', name: 'Rune Wizard', phase: 2, role: 'Runas elementais' },
    { id: 'sl', name: 'Slayer', phase: 2, role: 'Assassina de lâminas duplas' },
    { id: 'gc', name: 'Gun Crusher', phase: 2, role: 'Pistoleiro' },
    { id: 'lw', name: 'Light Wizard', phase: 3, role: 'Luz e barreiras' },
    { id: 'lm', name: 'Lemuria Mage', phase: 3, role: 'Grimório e maldições' },
    { id: 'ik', name: 'Illusion Knight', phase: 3, role: 'Clones e ilusão' },
    { id: 'al', name: 'Alchemist', phase: 3, role: 'Poções e golens' },
  ];

  const EVOLUTION = [
    null,
    { level: 150, bosses: 3, resets: 0, dmgPct: 10, hpPct: 5 },
    { level: 400, bosses: 10, resets: 1, dmgPct: 20, hpPct: 10 },
  ];

  // ---------------------------------------------------------------------------
  // Habilidades (custam MP e AG)
  // ---------------------------------------------------------------------------
  const SKILLS = {
    // Dark Knight
    twist: { cls: 'dk', name: 'Golpe Giratório', lvl: 1, tier: 0, mp: 8, ag: 6, cd: 0.55, kind: 'spin', mult: 1.45, radius: 3.4, desc: 'Gira a lâmina e atinge todos ao redor.' },
    stab: { cls: 'dk', name: 'Estocada Mortal', lvl: 30, tier: 0, mp: 12, ag: 10, cd: 1.1, kind: 'dash', mult: 2.3, range: 7, desc: 'Avança e perfura tudo no caminho.' },
    swell: { cls: 'dk', name: 'Vida Inabalável', lvl: 60, tier: 0, mp: 30, ag: 20, cd: 20, kind: 'buff', buff: { hpPct: 25 }, dur: 30, desc: '+25% HP máximo por 30s.' },
    rage: { cls: 'dk', name: 'Golpe Furioso', lvl: 150, tier: 1, mp: 25, ag: 18, cd: 2.2, kind: 'quake', mult: 3.1, radius: 5.5, desc: 'Esmaga o chão em ondas de choque.' },
    destruct: { cls: 'dk', name: 'Lâmina Destruidora', lvl: 300, tier: 1, mp: 45, ag: 30, cd: 5, kind: 'nuke', mult: 5.5, radius: 6.5, range: 12, desc: 'Explosão massiva no alvo; lentifica sobreviventes.' },
    // Dark Wizard
    ball: { cls: 'dw', name: 'Bola de Energia', lvl: 1, tier: 0, mp: 3, ag: 0, cd: 0.32, kind: 'bolt', mult: 1.15, range: 16, desc: 'Projétil rápido de energia.' },
    flame: { cls: 'dw', name: 'Chama', lvl: 20, tier: 0, mp: 10, ag: 3, cd: 0.8, kind: 'burst', mult: 1.7, radius: 2.8, range: 14, desc: 'Coluna de fogo no ponto alvo.' },
    tele: { cls: 'dw', name: 'Teleporte', lvl: 40, tier: 0, mp: 30, ag: 15, cd: 3, kind: 'blink', range: 12, desc: 'Teleporta até o cursor.' },
    meteor: { cls: 'dw', name: 'Meteoro', lvl: 70, tier: 0, mp: 18, ag: 6, cd: 1.2, kind: 'meteor', mult: 2.5, radius: 3.6, range: 15, desc: 'Um meteoro cai após 0,5s.' },
    barrier: { cls: 'dw', name: 'Barreira da Alma', lvl: 100, tier: 0, mp: 50, ag: 20, cd: 25, kind: 'buff', buff: { dmgRed: 30 }, dur: 30, desc: 'Reduz 30% do dano recebido por 30s.' },
    nova: { cls: 'dw', name: 'Nova Gélida', lvl: 150, tier: 1, mp: 35, ag: 12, cd: 2.4, kind: 'nova', mult: 3.0, radius: 7.5, desc: 'Anel de gelo que lentifica.' },
    hell: { cls: 'dw', name: 'Inferno Primordial', lvl: 300, tier: 1, mp: 70, ag: 30, cd: 6, kind: 'nova', mult: 6.2, radius: 10, desc: 'Nova de fogo devastadora.' },
    // Elf
    triple: { cls: 'elf', name: 'Flecha Tripla', lvl: 1, tier: 0, mp: 4, ag: 3, cd: 0.42, kind: 'multishot', mult: 0.95, arrows: 3, range: 17, desc: 'Três flechas em leque.' },
    pierce: { cls: 'elf', name: 'Flecha Penetrante', lvl: 25, tier: 0, mp: 10, ag: 6, cd: 0.9, kind: 'pierce', mult: 1.9, range: 20, desc: 'Atravessa todos os inimigos.' },
    heal: { cls: 'elf', name: 'Cura', lvl: 40, tier: 0, mp: 25, ag: 5, cd: 4, kind: 'heal', desc: 'Cura 20% do HP + Energia/5 (você e aliados).' },
    aura: { cls: 'elf', name: 'Aura Élfica', lvl: 60, tier: 0, mp: 30, ag: 10, cd: 20, kind: 'buff', buff: { dmgPct: 15, defPct: 20 }, dur: 30, desc: '+15% dano e +20% defesa por 30s.' },
    spirit: { cls: 'elf', name: 'Espírito da Floresta', lvl: 150, tier: 1, mp: 60, ag: 20, cd: 25, kind: 'summon', dur: 30, desc: 'Invoca um guardião por 30s.' },
    rain: { cls: 'elf', name: 'Chuva de Flechas', lvl: 300, tier: 1, mp: 45, ag: 25, cd: 4, kind: 'meteor', mult: 5.2, radius: 6, range: 16, desc: 'Dezenas de flechas caem no alvo.' },
    // Dark Elf: lâminas duplas, área e fúria
    bladedance: { cls: 'de', name: 'Dança das Lâminas', lvl: 1, tier: 0, mp: 6, ag: 6, cd: 0.5, kind: 'spin', mult: 1.35, radius: 3.6, color: 0xff4a7a, desc: 'Gira as duas espadas e corta todos ao redor.' },
    bladefan: { cls: 'de', name: 'Leque de Lâminas', lvl: 25, tier: 0, mp: 12, ag: 8, cd: 1, kind: 'bladefan', mult: 1.25, blades: 5, range: 11, color: 0xff5a8a, desc: 'Arremessa lâminas sombrias em leque que atravessam os inimigos.' },
    fury: { cls: 'de', name: 'Fúria Sombria', lvl: 50, tier: 0, mp: 30, ag: 20, cd: 22, kind: 'buff', buff: { dmgPct: 25, atkSpeed: 25 }, dur: 30, color: 0xff2a4a, desc: '+25% dano e +25 de velocidade de ataque por 30s.' },
    shadowstep: { cls: 'de', name: 'Passo Sombrio', lvl: 80, tier: 0, mp: 16, ag: 12, cd: 1.6, kind: 'dash', mult: 2.1, range: 8, radius: 3, color: 0xc84aff, desc: 'Avança pelas sombras cortando o caminho e explode em lâminas no fim.' },
    bloodstorm: { cls: 'de', name: 'Tempestade Sangrenta', lvl: 150, tier: 1, mp: 30, ag: 18, cd: 3, kind: 'whirl', mult: 1.05, hits: 5, radius: 5, color: 0xff2a4a, desc: 'Redemoinho de lâminas: 5 cortes seguidos em área enquanto você anda.' },
    eclipse: { cls: 'de', name: 'Eclipse das Lâminas', lvl: 300, tier: 1, mp: 50, ag: 30, cd: 5, kind: 'eclipse', mult: 5.8, radius: 8, buff: { dmgPct: 15 }, dur: 8, color: 0xb02aff, desc: 'Explosão de lâminas em volta de você; a fúria cresce (+15% dano por 8s).' },
    // Necromancer: roubo de vida, dano e necromancia
    drain: { cls: 'nc', name: 'Toque Vampírico', lvl: 1, tier: 0, mp: 4, ag: 1, cd: 0.36, kind: 'drain', mult: 1.1, drain: 30, range: 14, color: 0xff3a5a, desc: 'Projétil de sangue: cura 30% do dano causado.' },
    bonespear: { cls: 'nc', name: 'Lança de Ossos', lvl: 20, tier: 0, mp: 10, ag: 5, cd: 0.9, kind: 'pierce', mult: 1.9, range: 18, color: 0xe8e0c8, desc: 'Lança de osso que atravessa todos os inimigos.' },
    raise: { cls: 'nc', name: 'Erguer Esqueleto', lvl: 40, tier: 0, mp: 35, ag: 10, cd: 12, kind: 'summon', ally: 'skeleton', count: 2, dur: 30, color: 0x7affb0, desc: 'Ergue 2 esqueletos guerreiros por 30s.' },
    bloodpact: { cls: 'nc', name: 'Pacto de Sangue', lvl: 70, tier: 0, mp: 40, ag: 15, cd: 22, kind: 'buff', buff: { lifeSteal: 6, dmgPct: 12 }, dur: 30, color: 0xff2a3a, desc: '+6% de roubo de vida e +12% dano por 30s.' },
    soulburst: { cls: 'nc', name: 'Explosão de Almas', lvl: 150, tier: 1, mp: 40, ag: 14, cd: 2.4, kind: 'drainnova', mult: 2.9, radius: 7, drain: 15, color: 0x7affb0, desc: 'Onda de almas ao redor; cura 15% do dano causado.' },
    army: { cls: 'nc', name: 'Exército dos Mortos', lvl: 300, tier: 1, mp: 80, ag: 30, cd: 20, kind: 'army', mult: 5, radius: 7, range: 14, ally: 'deathknight', count: 3, dur: 25, color: 0xff3a5a, desc: 'Os mortos rompem o chão no alvo e 3 cavaleiros da morte lutam por 25s.' },
  };
  const skillsFor = (cls) => Object.keys(SKILLS).filter((k) => SKILLS[k].cls === cls);

  // ---------------------------------------------------------------------------
  // Árvore de habilidades (estilo Master Skill Tree): 3 ramos × 4 nós × 5 ranks
  // ---------------------------------------------------------------------------
  const TREES = {
    dk: [
      { name: 'Fúria', nodes: [['dmgPct', 3, 'Lâmina Afiada'], ['critPct', 1, 'Olho do Carrasco'], ['skill:twist', 8, 'Giro Voraz'], ['skill:rage', 8, 'Terremoto']] },
      { name: 'Baluarte', nodes: [['hpPct', 4, 'Pele de Ferro'], ['defPct', 3, 'Couraça'], ['lifeSteal', 0.5, 'Sede de Sangue'], ['agRegen', 6, 'Fôlego']] },
      { name: 'Técnica', nodes: [['atkSpeedPct', 2, 'Ritmo'], ['excPct', 1, 'Golpe Perfeito'], ['costPct', -3, 'Economia'], ['skill:stab', 8, 'Investida Letal']] },
    ],
    dw: [
      { name: 'Piromancia', nodes: [['dmgPct', 3, 'Chama Interior'], ['skill:meteor', 8, 'Queda Estelar'], ['skill:flame', 8, 'Pira'], ['skill:hell', 8, 'Inferno']] },
      { name: 'Criomancia', nodes: [['skill:nova', 8, 'Coração Gélido'], ['critPct', 1, 'Estilhaço'], ['defPct', 3, 'Armadura de Gelo'], ['hpPct', 4, 'Vigor Arcano']] },
      { name: 'Arcano', nodes: [['costPct', -3, 'Fluxo de Mana'], ['mpPct', 4, 'Poço de Mana'], ['cdPct', -2, 'Aceleração'], ['skill:ball', 8, 'Orbe Denso']] },
    ],
    elf: [
      { name: 'Caçadora', nodes: [['dmgPct', 3, 'Mira'], ['skill:triple', 8, 'Leque Mortal'], ['critPct', 1, 'Ponto Fraco'], ['skill:rain', 8, 'Tempestade']] },
      { name: 'Guardiã', nodes: [['hpPct', 4, 'Casca de Carvalho'], ['defPct', 3, 'Folhagem'], ['healPct', 8, 'Toque Vital'], ['lifeSteal', 0.5, 'Seiva']] },
      { name: 'Vento', nodes: [['atkSpeedPct', 2, 'Corda Tensa'], ['moveSpeedPct', 2, 'Passo Leve'], ['skill:pierce', 8, 'Flecha do Vento'], ['mfPct', 4, 'Olho da Fortuna']] },
    ],
    de: [
      { name: 'Carnificina', nodes: [['dmgPct', 3, 'Fio Duplo'], ['skill:bladedance', 8, 'Dança Voraz'], ['critPct', 1, 'Corte Certeiro'], ['skill:eclipse', 8, 'Noite Eterna']] },
      { name: 'Sombra', nodes: [['moveSpeedPct', 2, 'Pés de Sombra'], ['skill:shadowstep', 8, 'Rastro Negro'], ['defPct', 3, 'Couro Élfico'], ['hpPct', 4, 'Resistência']] },
      { name: 'Fúria', nodes: [['atkSpeedPct', 2, 'Frenesi'], ['skill:bloodstorm', 8, 'Olho da Tempestade'], ['lifeSteal', 0.5, 'Sede'], ['skill:bladefan', 8, 'Leque Mortal']] },
    ],
    nc: [
      { name: 'Sangue', nodes: [['lifeSteal', 0.5, 'Presas'], ['skill:drain', 8, 'Sanguessuga'], ['hpPct', 4, 'Coração Frio'], ['skill:soulburst', 8, 'Colheita']] },
      { name: 'Ossos', nodes: [['dmgPct', 3, 'Medula'], ['skill:bonespear', 8, 'Lança Serrilhada'], ['critPct', 1, 'Fratura'], ['defPct', 3, 'Couraça de Ossos']] },
      { name: 'Túmulo', nodes: [['cdPct', -2, 'Ritual Rápido'], ['costPct', -3, 'Pacto Barato'], ['mpPct', 4, 'Poço Sombrio'], ['skill:army', 8, 'Legião']] },
    ],
  };
  const treeNodeId = (cls, b, n) => cls + '.' + b + '.' + n;
  function treePoints(ch) {
    return Math.floor(ch.level / 20) + ch.resets + ch.tier * 2;
  }
  function treeSpent(ch) {
    let s = 0;
    for (const k in ch.tree || {}) s += ch.tree[k];
    return s;
  }

  // ---------------------------------------------------------------------------
  // Itens
  // ---------------------------------------------------------------------------
  const DROP_LEVEL = [0, 15, 35, 60, 95, 140, 200, 270, 350, 450];
  const WEAPON_NAMES = {
    dk: ['Espada Curta', 'Espada Longa', 'Katana', 'Espada de Batalha', 'Lâmina Relâmpago', 'Espada Dracônica', 'Lâmina Rúnica', 'Espada do Trovão', 'Lâmina do Eclipse', 'Espada Celestial'],
    dw: ['Cajado de Carvalho', 'Cajado Serpente', 'Cajado Relâmpago', 'Cajado Gorgônico', 'Cajado Lendário', 'Cajado do Abismo', 'Cajado Estelar', 'Cajado Carmesim', 'Cajado do Vazio', 'Cajado Primordial'],
    elf: ['Arco Curto', 'Arco Élfico', 'Besta Leve', 'Arco Tiburon', 'Arco Prateado', 'Arco Celestial', 'Besta Aquática', 'Arco Sagitário', 'Arco da Aurora', 'Arco Albatroz'],
  };
  const SET_NAMES = {
    dk: ['Couro', 'Bronze', 'Escamas', 'Placas', 'Dragão', 'Negro', 'Fúria', 'Tempestade', 'Titã', 'Eclipse'],
    dw: ['Pano', 'Seda', 'Osso', 'Espírito', 'Lendário', 'Grão-Mago', 'Vendaval', 'Arcano', 'Astral', 'Vazio'],
    elf: ['Vinha', 'Seda Élfica', 'Ventania', 'Guardiã', 'Divino', 'Íris', 'Glória', 'Aurora', 'Sílfide', 'Selene'],
  };
  const PIECE = { helm: 'Elmo', armor: 'Armadura', gloves: 'Luvas', boots: 'Botas' };
  const RING_NAMES = ['Anel de Ferro', 'Anel de Gelo', 'Anel de Veneno', 'Anel de Fogo', 'Anel do Vento', 'Anel da Terra', 'Anel Rúnico', 'Anel do Trovão', 'Anel do Eclipse', 'Anel Celestial'];
  const PENDANT_NAMES = ['Colar de Cobre', 'Colar de Gelo', 'Colar de Veneno', 'Colar de Fogo', 'Colar do Vento', 'Colar da Terra', 'Colar Rúnico', 'Colar do Trovão', 'Colar do Eclipse', 'Colar Celestial'];
  const WING_NAMES = ['Asas de Pena', 'Asas do Espírito', 'Asas Dracônicas', 'Asas do Tempo', 'Asas da Tempestade', 'Asas Celestiais'];
  const SLOTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'ring', 'pendant', 'wings'];
  const SLOT_LABEL = { weapon: 'Arma', helm: 'Elmo', armor: 'Armadura', gloves: 'Luvas', boots: 'Botas', ring: 'Anel', pendant: 'Colar', wings: 'Asas' };

  const RARITY = {
    comum: { name: 'Comum', color: '#e8e2d4', order: 0 },
    magico: { name: 'Mágico', color: '#6fa8ff', order: 1 },
    excelente: { name: 'Excelente', color: '#4be07a', order: 2 },
    ancestral: { name: 'Ancestral', color: '#3fd6c9', order: 3 },
    lendario: { name: 'Lendário', color: '#ff9a2e', order: 4 },
  };
  /** Adjetivo da raridade concordando com o nome base (g: 'm'|'f'; pl: plural). Comum não aparece no nome. */
  const RARITY_ADJ = {
    magico: { m: 'Mágico', f: 'Mágica', mp: 'Mágicos', fp: 'Mágicas' },
    excelente: { m: 'Excelente', f: 'Excelente', mp: 'Excelentes', fp: 'Excelentes' },
    ancestral: { m: 'Ancestral', f: 'Ancestral', mp: 'Ancestrais', fp: 'Ancestrais' },
    lendario: { m: 'Lendário', f: 'Lendária', mp: 'Lendários', fp: 'Lendárias' },
  };
  function rarityAdj(r, g, pl) { const a = RARITY_ADJ[r]; return a ? a[(g || 'm') + (pl ? 'p' : '')] : ''; }
  /** Gênero dos nomes base de armas (as não listadas são masculinas: Cajado, Arco). */
  const FEM_WEAPON = /^(Espada|Lâmina|Katana|Besta)\b/;
  /** Gênero e número do nome base de um equipamento. */
  function itemGender(it) {
    if (it.slot === 'weapon') return { g: FEM_WEAPON.test(WEAPON_NAMES[it.cls][it.tier]) ? 'f' : 'm', pl: false };
    if (it.slot === 'wings' || it.slot === 'gloves' || it.slot === 'boots') return { g: 'f', pl: true };
    if (it.slot === 'armor') return { g: 'f', pl: false };
    return { g: 'm', pl: false }; // elmo, anel, colar
  }
  const EXC_WEAPON = {
    excRate: { t: 'Chance de dano excelente +10%', s: { excPct: 10 } },
    dmgLvl: { t: 'Dano +nível/20', s: { dmgLvl: 1 } },
    dmgPct2: { t: 'Dano +2%', s: { dmgPct: 2 } },
    speed: { t: 'Velocidade de ataque +7', s: { atkSpeed: 7 } },
    lifeKill: { t: 'Vida após matar +HP/8', s: { lifeKill: 1 } },
    manaKill: { t: 'Mana após matar +MP/8', s: { manaKill: 1 } },
  };
  const EXC_ARMOR = {
    hp4: { t: 'HP máximo +4%', s: { hpPct: 4 } },
    mp4: { t: 'MP máximo +4%', s: { mpPct: 4 } },
    dmgRed: { t: 'Redução de dano +4%', s: { dmgRed: 4 } },
    reflect: { t: 'Reflexão de dano +5%', s: { reflect: 5 } },
    defRate: { t: 'Taxa de defesa +10%', s: { defPct: 10 } },
    gold30: { t: 'Ouro obtido +30%', s: { goldPct: 30 } },
  };
  const LEGEND = {
    mf: { t: 'Encontrar Magia +40%', s: { mf: 40 } },
    fury: { t: 'Dano +8%', s: { dmgPct: 8 } },
    titan: { t: 'HP máximo +8%', s: { hpPct: 8 } },
    haste: { t: 'Recarga de habilidades -10%', s: { cdPct: -10 } },
  };
  const JEWELS = {
    bless: { name: 'Joia da Bênção', color: '#8fd3ff', desc: 'Aprimora itens de +0 até +6 (100%).' },
    soul: { name: 'Joia da Alma', color: '#ffd36b', desc: 'Aprimora de +6 até +9 (50%, +25% com Sorte). Falha: -1.' },
    chaos: { name: 'Joia do Caos', color: '#ff6b9a', desc: 'Fusão +9 até +15 (+10 custa 1, +11 custa 2 … +15 custa 6). Falha: volta a +0 (nunca destrói).' },
    life: { name: 'Joia da Vida', color: '#b0ff8a', desc: 'Opção adicional +4 (até +16).' },
  };
  const POTIONS = {
    hp: { name: 'Poção de Vida', pct: 0.3, flat: 60, price: 60 },
    mp: { name: 'Poção de Mana', pct: 0.3, flat: 40, price: 50 },
    // Não é bebida: consumida na tela de queda para renascer no mesmo lugar com HP/MP cheios.
    rez: { name: 'Poção da Ressurreição', pct: 1, flat: 0, price: 50000, revive: true },
    // Poções de reforço (só caem no Éden): bebidas no inventário, duram 10 minutos.
    spd: { name: 'Poção de Velocidade', price: 20000, buff: { atkRatePct: 10 }, dur: 600, color: '#ffd84a', desc: 'Velocidade de ataque +10% por 10 minutos.' },
    cdr: { name: 'Poção de Recarga', price: 20000, buff: { cdPct: -10 }, dur: 600, color: '#5ae8ff', desc: 'Tempo de recarga das habilidades -10% por 10 minutos.' },
    str: { name: 'Poção de Força', price: 20000, buff: { str: 50 }, dur: 600, color: '#ff6a3a', desc: 'Força +50 por 10 minutos.' },
    agi: { name: 'Poção de Agilidade', price: 20000, buff: { agi: 50 }, dur: 600, color: '#7aff5a', desc: 'Agilidade +50 por 10 minutos.' },
    vit: { name: 'Poção de Vitalidade', price: 20000, buff: { vit: 50 }, dur: 600, color: '#ff5aa8', desc: 'Vitalidade +50 por 10 minutos.' },
    ene: { name: 'Poção de Energia', price: 20000, buff: { ene: 50 }, dur: 600, color: '#a87aff', desc: 'Energia +50 por 10 minutos.' },
  };
  const BUFF_POTIONS = ['spd', 'cdr', 'str', 'agi', 'vit', 'ene'];
  /** Talismãs: consumidos no Ferreiro. */
  const TALISMANS = {
    luck: { name: 'Talismã da Sorte', color: '#7affa0', desc: 'Usado no Ferreiro: se a fusão com Joia do Caos ou a evolução de asa falhar, o item mantém o +nível atual em vez de voltar a +0. Consumido a cada tentativa protegida.' },
  };

  /** Bônus das asas: a evoluída (stage 1) soma +10% de dano, +6% de absorção e +5% de HP. */
  function wingBonus(it) {
    const t = it.tier, p = it.plus || 0, up = it.stage ? 1 : 0;
    return { dmg: 12 + t * 5 + p + up * 10, red: 12 + t * 3 + p * 0.5 + up * 6, hp: up * 5 };
  }
  function plusBonus(p) {
    return p * 3 + (p > 9 ? (p - 9) * (p - 8) : 0);
  }
  function itemName(it) {
    if (it.kind === 'jewel') return JEWELS[it.id].name;
    if (it.kind === 'potion') return POTIONS[it.id].name;
    if (it.kind === 'talisman') return TALISMANS[it.id].name;
    let base;
    if (it.slot === 'weapon') base = WEAPON_NAMES[it.cls][it.tier];
    else if (it.slot === 'ring') base = RING_NAMES[it.tier];
    else if (it.slot === 'pendant') base = PENDANT_NAMES[it.tier];
    else if (it.slot === 'wings') base = WING_NAMES[Math.min(it.tier, WING_NAMES.length - 1)];
    else base = PIECE[it.slot] + ' de ' + SET_NAMES[it.cls][it.tier];
    // adjetivo depois do nome, no gênero certo: "Katana Lendária", "Anel de Ferro Mágico"
    const gn = itemGender(it);
    const adj = it.rarity === 'comum' ? '' : ' ' + rarityAdj(it.rarity, gn.g, gn.pl);
    return base + adj + (it.slot === 'wings' && it.stage ? ' Ascendidas' : '') + (it.plus ? ' +' + it.plus : '');
  }
  /** Requisito de atributo para equipar (sobe com o +nível). */
  function itemReq(it) {
    if (!it.slot || it.slot === 'ring' || it.slot === 'pendant') return null;
    if (it.slot === 'wings') return { stat: 'level', value: 150 + it.tier * 60 };
    const stat = it.cls === 'dw' ? 'ene' : it.cls === 'elf' ? 'agi' : 'str';
    const k = it.slot === 'weapon' ? 1 : 0.7;
    return { stat, value: Math.floor((15 + it.tier * 38 + it.plus * 4) * k) };
  }
  /** Tabela de opções excelentes do slot (armas e colares usam a ofensiva). */
  function excPool(it) { return it.slot === 'weapon' || it.slot === 'pendant' ? EXC_WEAPON : EXC_ARMOR; }
  /**
   * Opções excelentes ativas. Lendário (fora asas) tem TODAS as opções do slot,
   * então nunca perde para um Excelente/Ancestral da mesma base por azar no sorteio.
   */
  function excOpts(it) {
    if (!it || !it.slot) return [];
    if (it.rarity === 'lendario' && it.slot !== 'wings') return Object.keys(excPool(it));
    return it.exc || [];
  }
  /** Dano % extra do +nível no colar (antes o +nível não fazia nada no colar). */
  function pendantPlus(it) { return Math.round(plusBonus(it.plus || 0) * (1 + it.tier * 0.2) / 10); }
  function itemStats(it) {
    const o = {};
    const add = (k, v) => (o[k] = (o[k] || 0) + v);
    if (!it || !it.slot) return o;
    const t = it.tier, pb = plusBonus(it.plus || 0) * (1 + t * 0.2);
    if (it.slot === 'weapon') {
      const min = Math.round(4 + t * 14 + t * t * 1.6 + pb);
      const max = Math.round(min * 1.45 + 3);
      if (it.cls === 'dw') { add('wizMin', min); add('wizMax', max); add('wizRise', 6 + t * 5 + (it.plus || 0) * 2); }
      else { add('wMin', min); add('wMax', max); }
      if (it.addOpt) { add(it.cls === 'dw' ? 'wizMin' : 'wMin', it.addOpt); add(it.cls === 'dw' ? 'wizMax' : 'wMax', it.addOpt); }
      if (it.skill) add('skillDmgPct', 10);
    } else if (it.slot === 'ring') {
      add('maxHp', 12 + t * 30 + pb * 2);
      if (it.addOpt) add('hpPct', it.addOpt / 4);
    } else if (it.slot === 'pendant') {
      add('dmgPct', 2 + t + pendantPlus(it));
      if (it.addOpt) add('dmgPct', it.addOpt / 4);
    } else if (it.slot === 'wings') {
      const wb = wingBonus(it);
      add('dmgPct', wb.dmg);
      add('dmgRed', wb.red);
      if (wb.hp) add('hpPct', wb.hp);
    } else {
      add('armorDef', Math.round(3 + t * 8 + t * t * 1.2 + pb / 1.4));
      if (it.addOpt) add('armorDef', it.addOpt);
    }
    if (it.luck) { add('critPct', 5); }
    const excSet = excPool(it);
    excOpts(it).forEach((e) => { const d = excSet[e]; if (d) for (const k in d.s) add(k, d.s[k]); });
    if (it.anc) add(it.anc.stat, it.anc.value);
    if (it.legend && LEGEND[it.legend]) for (const k in LEGEND[it.legend].s) add(k, LEGEND[it.legend].s[k]);
    return o;
  }
  function itemLines(it) {
    const s = itemStats(it), L = [];
    if (s.wMin) L.push(['Dano', s.wMin + ' ~ ' + s.wMax]);
    if (s.wizMin) L.push(['Dano mágico', s.wizMin + ' ~ ' + s.wizMax]);
    if (s.wizRise) L.push(['Aumento de magia', s.wizRise + '%']);
    if (s.armorDef) L.push(['Defesa', s.armorDef]);
    if (it.slot === 'ring') L.push(['HP máximo', '+' + Math.round(12 + it.tier * 30 + plusBonus(it.plus || 0) * (1 + it.tier * 0.2) * 2)]);
    if (it.slot === 'pendant') L.push(['Dano', '+' + (2 + it.tier + pendantPlus(it)) + '%']);
    if (it.slot === 'wings') {
      const wb = wingBonus(it);
      L.push(['Dano', '+' + wb.dmg + '%']); L.push(['Absorção', '+' + String(Math.round(wb.red * 10) / 10).replace('.', ',') + '%']);
      if (wb.hp) L.push(['HP máximo', '+' + wb.hp + '%']);
    }
    return L;
  }
  function itemValue(it) {
    if (it.kind === 'jewel') return { bless: 90000, soul: 60000, chaos: 45000, life: 70000 }[it.id] * (it.qty || 1);
    if (it.kind === 'potion') return Math.floor(POTIONS[it.id].price * 0.3) * (it.qty || 1);
    if (it.kind === 'talisman') return 150000 * (it.qty || 1);
    const r = RARITY[it.rarity].order;
    return Math.floor((200 + it.tier * it.tier * 900) * (1 + r * 1.5) * (1 + (it.plus || 0) * 0.3) * (it.stage ? 3 : 1));
  }
  /** Gold recebido ao vender `n` unidades (padrão: a pilha toda) — metade do valor. */
  function sellValue(it, n) {
    const qty = it.qty || 1;
    const k = Math.max(0, Math.min(n == null ? qty : n, qty));
    return Math.floor(itemValue(Object.assign({}, it, { qty: 1 })) * 0.5) * k;
  }
  // ---------------------------------------------------------------------------
  // Loot — tabela pública, MF visível, seed por drop
  // ---------------------------------------------------------------------------
  const BASE_RARITY = { magico: 0.2, excelente: 0.045, ancestral: 0.011, lendario: 0.0028 };
  const MF_SOFTCAP = 250;
  /** MF efetivo para raridades altas (retorno decrescente, como no Diablo II). */
  const mfEffective = (mf) => (mf * MF_SOFTCAP) / (mf + MF_SOFTCAP);
  function rarityTable(mf, src) {
    const boss = src === 'boss', elite = src === 'elite';
    const hi = 1 + mfEffective(mf) / 100, lo = 1 + mf / 100;
    const k = boss ? 4 : elite ? 2 : 1;
    const t = {
      magico: BASE_RARITY.magico * lo * (boss ? 2 : elite ? 1.5 : 1),
      excelente: BASE_RARITY.excelente * hi * k,
      ancestral: BASE_RARITY.ancestral * hi * k,
      lendario: BASE_RARITY.lendario * hi * k,
    };
    let sum = t.magico + t.excelente + t.ancestral + t.lendario;
    if (sum > 0.95) { const f = 0.95 / sum; for (const r in t) t[r] *= f; sum = 0.95; }
    t.comum = boss ? 0 : 1 - sum;
    if (boss) { const f = 1 / sum; for (const r in t) if (r !== 'comum') t[r] *= f; }
    return t;
  }
  const DROP_CHANCE = { item: 0.3, gold: 0.45, bless: 0.012, soul: 0.009, chaos: 0.011, life: 0.004, potion: 0.08 };

  function tierForLevel(mLevel) {
    let t = 0;
    for (let i = 0; i < DROP_LEVEL.length; i++) if (DROP_LEVEL[i] <= mLevel) t = i;
    return t;
  }

  /** Gera um equipamento a partir de uma seed pública. */
  function makeEquip(seed, mLevel, forcedRarity, favorCls, mf, src) {
    const rnd = mulberry32(seed);
    const rolls = [];
    const r0 = rnd();
    const cls = r0 < 0.6 && favorCls ? favorCls : ['dk', 'dw', 'elf'][Math.floor(rnd() * 3)];
    const sr = rnd();
    let slot;
    if (sr < 0.2) slot = 'weapon';
    else if (sr < 0.36) slot = 'armor';
    else if (sr < 0.5) slot = 'helm';
    else if (sr < 0.64) slot = 'gloves';
    else if (sr < 0.78) slot = 'boots';
    else if (sr < 0.89) slot = 'ring';
    else if (sr < 0.985) slot = 'pendant';
    else slot = 'wings';
    if (slot === 'wings' && src !== 'boss') slot = 'pendant';
    let tier = tierForLevel(mLevel);
    if (rnd() < 0.35 && tier > 0) tier--;
    if (slot === 'wings') tier = Math.min(5, Math.floor(tier / 2));
    let rarity = forcedRarity;
    const rr = rnd();
    if (!rarity) {
      const tab = rarityTable(mf || 0, src);
      let acc = 0;
      rarity = 'comum';
      for (const r of ['lendario', 'ancestral', 'excelente', 'magico']) {
        acc += tab[r];
        if (rr < acc) { rarity = r; break; }
      }
      rolls.push({ what: 'raridade', roll: rr, table: tab, result: rarity });
    }
    const ord = RARITY[rarity].order;
    const it = { uid: hex(hash32(seed, 'uid')) + hex(seed).slice(2), slot, cls: slot === 'ring' || slot === 'pendant' || slot === 'wings' ? null : cls, tier, rarity, plus: 0, luck: false, skill: false, addOpt: 0, exc: [], anc: null, legend: null, seed: hex(seed) };
    if (slot === 'weapon' || slot === 'armor' || slot === 'helm' || slot === 'gloves' || slot === 'boots') it.cls = gearCls(cls, slot);
    // +nível inicial
    const pr = rnd();
    it.plus = pr < 0.55 ? 0 : pr < 0.8 ? 1 : pr < 0.93 ? 2 : pr < 0.985 ? 3 : 4;
    if (ord >= 1) { it.luck = rnd() < 0.35 + ord * 0.1; it.addOpt = rnd() < 0.5 ? 4 * (1 + Math.floor(rnd() * Math.min(4, ord + 1))) : 0; }
    if (slot === 'weapon') it.skill = ord >= 1 ? rnd() < 0.5 : rnd() < 0.1;
    if (ord >= 2 && slot !== 'wings') {
      const pool = Object.keys(slot === 'weapon' || slot === 'pendant' ? EXC_WEAPON : EXC_ARMOR);
      const n = ord === 2 ? 1 + Math.floor(rnd() * 2) : ord === 3 ? 2 : (rnd(), pool.length); // lendário: todas (rnd() mantém a sequência das seeds)
      while (it.exc.length < n) { const e = pool[Math.floor(rnd() * pool.length)]; if (it.exc.indexOf(e) < 0) it.exc.push(e); }
    }
    if (ord === 3) {
      const st = ['str', 'agi', 'vit', 'ene'][Math.floor(rnd() * 4)];
      it.anc = { stat: st, value: 10 + tier * 5 };
    }
    if (ord === 4) {
      const ks = Object.keys(LEGEND);
      it.legend = ks[Math.floor(rnd() * ks.length)];
    }
    it.rolls = rolls;
    return it;
  }

  /**
   * Resolve tudo que cai de um monstro morto. Determinístico dado a seed:
   * seed = hash(seedDoAndar, idDoMonstro, contadorDeKills).
   */
  function rollDrop(opts) {
    const { seed, mLevel, src, mf, favorCls } = opts;
    const rnd = mulberry32(seed);
    const out = { items: [], gold: 0, jewels: [], potions: [], log: [] };
    const nItems = src === 'boss' ? 3 + Math.floor(rnd() * 3) : src === 'elite' ? 1 + (rnd() < 0.5 ? 1 : 0) : 0;
    for (let i = 0; i < nItems; i++) out.items.push(makeEquip(hash32(seed, 'b', i), mLevel, null, favorCls, mf, src));
    const ri = rnd();
    const pItem = DROP_CHANCE.item * (1 + mf / 400);
    out.log.push({ what: 'item', roll: ri, threshold: pItem });
    if (ri < pItem) out.items.push(makeEquip(hash32(seed, 'i'), mLevel, null, favorCls, mf, src));
    const rz = rnd();
    if (rz < DROP_CHANCE.gold || src === 'boss') out.gold = goldAmount(mLevel, src, rnd());
    for (const j of ['bless', 'soul', 'chaos', 'life']) {
      const rj = rnd();
      const p = DROP_CHANCE[j] * (src === 'boss' ? 12 : src === 'elite' ? 3 : 1) * (mLevel < 15 ? 0.3 : 1);
      out.log.push({ what: j, roll: rj, threshold: p });
      if (rj < p) out.jewels.push(j);
    }
    const rp = rnd();
    if (rp < DROP_CHANCE.potion) out.potions.push(rnd() < 0.6 ? 'hp' : 'mp');
    return out;
  }

  /** Gold de um abate (mesma fórmula nas masmorras e na torre). */
  function goldAmount(mLevel, src, r) {
    return Math.floor(mLevel * (18 + r * 24) * (src === 'boss' ? 12 : src === 'elite' ? 3 : 1) + 15);
  }

  // ---------------------------------------------------------------------------
  // Torre Infinita: andares sem fim, cada um mais difícil. Só cai Gold e Jewels.
  // ---------------------------------------------------------------------------
  const TOWER = {
    baseLevel: 20,      // nível dos monstros no andar 1
    levelPerFloor: 10,  // +níveis por andar
    hpPerFloor: 0.06,   // +6% de HP por andar (além do nível)
    dmgPerFloor: 0.035, // +3,5% de dano por andar
    jewelChance: 0.1,   // monstros: 10% de chance de uma Jewel aleatória
    bossChance: 0.2,    // chefe do andar: 20% de chance de soltar o tesouro
    biomeEvery: 5,      // troca de bioma a cada 5 andares
    monsterMult: 2,     // quantidade de monstros por grupo (2x o de um grupo normal)
    goldMult: 2,        // Gold dos monstros, do chefe e dos barris (2x o da masmorra)
  };
  const JEWEL_IDS = ['bless', 'soul', 'chaos', 'life'];
  function towerLevel(floor) { return TOWER.baseLevel + (Math.max(1, floor) - 1) * TOWER.levelPerFloor; }
  /** Multiplicadores extras dos monstros do andar (somados aos do tipo de monstro). */
  function towerMod(floor) {
    const f = Math.max(1, floor) - 1;
    return { hp: 1 + f * TOWER.hpPerFloor, dmg: 1 + f * TOWER.dmgPerFloor };
  }
  /**
   * Drop na torre (determinístico pela seed). Monstros: Gold em dobro (TOWER.goldMult)
   * em relação a um andar de masmorra + 10% de uma Jewel aleatória. Chefe: 20% de chance de
   * soltar Gold de chefe (também em dobro) e 1–3 Jewels aleatórias; nos outros 80%, nada.
   */
  function rollTowerDrop(opts) {
    const { seed, mLevel, src } = opts;
    const rnd = mulberry32(seed);
    const out = { gold: 0, jewels: [], bossRoll: null };
    const pick = () => JEWEL_IDS[Math.floor(rnd() * JEWEL_IDS.length)];
    if (src === 'boss') {
      out.bossRoll = rnd();
      if (out.bossRoll < TOWER.bossChance) {
        out.gold = goldAmount(mLevel, 'boss', rnd()) * TOWER.goldMult;
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) out.jewels.push(pick());
      }
      return out;
    }
    if (rnd() < DROP_CHANCE.gold) out.gold = goldAmount(mLevel, src, rnd()) * TOWER.goldMult;
    if (rnd() < TOWER.jewelChance) out.jewels.push(pick());
    return out;
  }

  // ---------------------------------------------------------------------------
  // O Éden: mapa aberto com três caminhos e o Guardião do Éden. Uma entrada a
  // cada 3 horas; a dificuldade acompanha o nível do personagem na entrada.
  // ---------------------------------------------------------------------------
  const EDEN = {
    cooldownMs: 3 * 60 * 60 * 1000,
    levelCutPct: 15,                         // os monstros partem de 15% abaixo do nível do personagem
    hpMult: 1.25, dmgMult: 1.1,            // monstros um pouco mais duros que os de masmorra do mesmo nível
    // nível dos monstros = nível de entrada + bônus por trecho (início dos caminhos → Coração do Éden)
    lvl: { path: 0, pathEnd: 3, heart: 5, mini: 6, boss: 8 },
    rare: { normal: 0.1, elite: 0.15, mini: 0.4, boss: 0.75, chest: 0.3, secret: 0.6 }, // joia ou item Ancestral
    bossRareRolls: 2,
    legend: { mini: 0.05, boss: 0.05 },     // item Lendário (só mini chefes e chefe final)
    talisman: 0.07,                          // Talismã da Sorte (sempre no chefe final)
    buffPotion: { normal: 0.15, elite: 0.15, mini: 0.15, boss: 0.15, chest: 0.4, secret: 0.6 },
  };
  /** Milissegundos que faltam para poder entrar de novo (0 = liberado). */
  function edenRemaining(ch, now) {
    const last = ch && Number.isFinite(ch.edenLast) ? ch.edenLast : 0;
    if (!last) return 0;
    return clamp(last + EDEN.cooldownMs - now, 0, EDEN.cooldownMs);
  }
  /** Nível de entrada do Éden: nível do personagem menos 15% (ex.: 360 → 306). */
  function edenEntryLevel(level) {
    return Math.max(1, Math.floor(Math.max(1, Math.floor(level || 1)) * (100 - EDEN.levelCutPct) / 100));
  }
  /** Nível dos monstros num trecho do Éden. part: path|heart|mini|boss; t: 0..1 ao longo do caminho. */
  function edenLevel(entry, part, t) {
    const L = EDEN.lvl, e = Math.max(1, Math.floor(entry || 1));
    if (part === 'path') return e + Math.round(L.path + (L.pathEnd - L.path) * clamp(t || 0, 0, 1));
    return e + (L[part] || 0);
  }
  /**
   * Drop do Éden (determinístico pela seed). src: normal|elite|mini|boss|chest|secret.
   * Joia ou item Ancestral (10%, mais em mini chefes e no chefe), Lendário só em mini
   * chefes e no chefe (5%), Talismã da Sorte (7%, sempre no chefe), poções de reforço (15%),
   * além de Gold e poções de vida/mana como numa masmorra.
   */
  function rollEdenDrop(opts) {
    const { seed, mLevel, src, mf, favorCls } = opts;
    const rnd = mulberry32(seed);
    const out = { gold: 0, items: [], jewels: [], potions: [], talismans: 0, log: [] };
    const boss = src === 'boss', mini = src === 'mini', chest = src === 'chest' || src === 'secret';
    const equipSrc = boss ? 'boss' : mini || chest ? 'elite' : src;
    if (rnd() < DROP_CHANCE.gold || boss || mini || chest) {
      const g = goldAmount(mLevel, boss || mini ? 'boss' : src === 'elite' || chest ? 'elite' : 'normal', rnd());
      out.gold = mini ? Math.floor(g / 2) : src === 'secret' ? g * 2 : g;
    }
    const rolls = boss ? EDEN.bossRareRolls : 1;
    for (let i = 0; i < rolls; i++) {
      const r = rnd(), p = EDEN.rare[src] || EDEN.rare.normal;
      out.log.push({ what: 'raro', roll: r, threshold: p });
      if (r >= p) continue;
      if (rnd() < 0.5) out.jewels.push(JEWEL_IDS[Math.floor(rnd() * JEWEL_IDS.length)]);
      else out.items.push(makeEquip(hash32(seed, 'anc', i), mLevel, 'ancestral', favorCls, mf, equipSrc));
    }
    const pl = EDEN.legend[src] || 0;
    if (pl) { const r = rnd(); out.log.push({ what: 'lendario', roll: r, threshold: pl }); if (r < pl) out.items.push(makeEquip(hash32(seed, 'leg'), mLevel, 'lendario', favorCls, mf, equipSrc)); }
    const rt = rnd();
    if (boss || rt < EDEN.talisman) out.talismans = 1;
    const rb = rnd();
    if (rb < (EDEN.buffPotion[src] || 0)) out.potions.push(BUFF_POTIONS[Math.floor(rnd() * BUFF_POTIONS.length)]);
    if (!boss && rnd() < DROP_CHANCE.potion) out.potions.push(rnd() < 0.6 ? 'hp' : 'mp');
    return out;
  }

  // ---------------------------------------------------------------------------
  // Aprimoramento (+nível)
  // ---------------------------------------------------------------------------
  function upgradeChance(it, jewel) {
    const p = it.plus || 0;
    if (jewel === 'bless') return p < 6 ? 1 : 0;
    if (jewel === 'soul') return p >= 6 && p < 9 ? 0.5 + (it.luck ? 0.25 : 0) : 0;
    if (jewel === 'chaos') return p >= 9 && p < 15 ? Math.max(0.3, 0.6 - (p - 9) * 0.05) + (it.luck ? 0.2 : 0) : 0;
    if (jewel === 'life') return it.addOpt < 16 && it.slot !== 'wings' ? 0.5 + (it.luck ? 0.1 : 0) : 0;
    return 0;
  }
  /**
   * Quantas Jewels uma tentativa gasta (gastas mesmo na falha). Chaos cresce com
   * o alvo: +10 → 1, +11 → 2, … +15 → 6. As demais custam 1 por tentativa.
   */
  function upgradeCost(it, jewel) {
    if (jewel === 'chaos') return Math.max(1, (it.plus || 0) - 8);
    return 1;
  }
  /** Talismã da Sorte só faz diferença onde a falha volta o item a +0 (fusão Chaos e evolução de asa). */
  const talismanUseful = (jewel) => jewel === 'chaos' || jewel === 'wing';
  /**
   * Evolução de asa no Ferreiro: asa normal +12 ou mais vira asa Ascendida.
   * Custa 10 de cada Jewel (gastas mesmo na falha). Chance 10% no +12 e +5% a
   * cada +nível acima (25% no +15). Falha: a asa volta a +0 (o Talismã da
   * Sorte mantém o +nível). Sucesso: mantém o +nível e continua refinável até +15.
   */
  const WING_UP = { minPlus: 12, jewels: { bless: 10, soul: 10, chaos: 10, life: 10 }, base: 0.1, perPlus: 0.05 };
  function wingUpgradeChance(it) {
    if (!it || it.slot !== 'wings' || it.stage || (it.plus || 0) < WING_UP.minPlus) return 0;
    return Math.round((WING_UP.base + (Math.min(15, it.plus) - WING_UP.minPlus) * WING_UP.perPlus) * 100) / 100;
  }
  function applyWingUpgrade(it, roll, opts) {
    const ch = wingUpgradeChance(it);
    if (ch <= 0) return { ok: false, invalid: true, chance: 0 };
    const ok = roll < ch;
    if (ok) { it.stage = 1; return { ok, chance: ch }; }
    if (opts && opts.talisman) return { ok, chance: ch, protected: true };
    it.plus = 0;
    return { ok, chance: ch };
  }
  /**
   * Aplica uma Jewel. opts.talisman: Talismã da Sorte em uso — se a fusão Chaos
   * falhar, o item mantém o +nível (protected: true) em vez de voltar a +0.
   */
  function applyUpgrade(it, jewel, roll, opts) {
    const ch = upgradeChance(it, jewel);
    if (ch <= 0) return { ok: false, invalid: true, chance: 0 };
    const ok = roll < ch;
    if (jewel === 'life') { if (ok) it.addOpt += 4; return { ok, chance: ch }; }
    if (ok) it.plus += 1;
    else if (jewel === 'soul') it.plus = Math.max(6, it.plus - 1);
    else if (jewel === 'chaos') {
      if (opts && opts.talisman) return { ok, chance: ch, protected: true };
      it.plus = 0;
    }
    return { ok, chance: ch };
  }

  // ---------------------------------------------------------------------------
  // Monstros
  // ---------------------------------------------------------------------------
  function monsterStats(level, mod) {
    mod = mod || {};
    return {
      level,
      hp: Math.round((30 + 9 * level + 0.06 * level * level) * (mod.hp || 1)),
      dmg: Math.round((4 + 1.9 * level + 0.004 * level * level) * (mod.dmg || 1)),
      def: Math.round((1 + 0.7 * level) * (mod.def || 1)),
    };
  }

  // ---------------------------------------------------------------------------
  // Personagem
  // ---------------------------------------------------------------------------
  function newCharacter(name, cls) {
    const C = CLASSES[cls];
    return {
      name, cls, level: 1, exp: 0, resets: 0, tier: 0, points: 0, treeV: 2,
      stats: Object.assign({}, C.base), tree: {},
      gold: 5000, bossKills: 0, created: Date.now(),
      equip: {}, bag: [], skillBar: skillsFor(cls).filter((k) => SKILLS[k].lvl <= 1),
      unlockedFloors: {}, towerBest: 1, edenLast: 0,
      autoSkills: [], autoLoot: false, autoPetSell: false,
    };
  }
  function className(ch) {
    return CLASSES[ch.cls].tiers[ch.tier];
  }

  const REQ_STATS = ['str', 'agi', 'vit', 'ene'];
  /**
   * Itens equipados com requisito cumprido. Primeiro soma os atributos de todos
   * os itens, do passivo da classe e dos buffs; depois testa cada requisito sem o
   * bônus do próprio item (um item não se libera sozinho). Repete enquanto algum
   * item cair, porque o bônus de um item inativo não conta. A ordem dos slots não
   * importa. `swap`: item da mochila testado no lugar do equipado do mesmo slot.
   * Devolve Map item → itemStats(item) só dos ativos.
   */
  function activeItems(ch, buffs, swap) {
    const items = [];
    for (const s of SLOTS) { const it = swap && swap.slot === s ? swap : ch.equip[s]; if (it) items.push(it); }
    const base = {};
    const addBase = (src) => { if (src) for (const k of REQ_STATS) if (src[k]) base[k] = (base[k] || 0) + src[k]; };
    addBase(CLASSES[ch.cls].passive);
    (buffs || []).forEach(addBase);
    const act = new Map(items.map((it) => [it, itemStats(it)]));
    for (let pass = 0; pass <= items.length; pass++) {
      const sum = Object.assign({}, base);
      act.forEach((st) => { for (const k of REQ_STATS) if (st[k]) sum[k] = (sum[k] || 0) + st[k]; });
      let changed = false;
      for (const [it, st] of [...act]) {
        const req = itemReq(it);
        if (!req) continue;
        const ok = req.stat === 'level' ? ch.level >= req.value : (ch.stats[req.stat] || 0) + (sum[req.stat] || 0) - (st[req.stat] || 0) >= req.value;
        if (!ok) { act.delete(it); changed = true; }
      }
      if (!changed) break;
    }
    return act;
  }
  /** O item (equipado ou, da mochila, se fosse equipado) teria o requisito cumprido? */
  function itemActive(ch, it, buffs) {
    if (!it || !it.slot || !itemReq(it)) return true;
    return activeItems(ch, buffs, ch.equip[it.slot] === it ? null : it).has(it);
  }

  /** Soma bônus de árvore + itens + buffs e aplica as relações da classe. */
  function deriveStats(ch, buffs) {
    const C = CLASSES[ch.cls];
    const b = {};
    const add = (k, v) => (b[k] = (b[k] || 0) + v);
    // itens (só os com requisito cumprido; ver activeItems)
    activeItems(ch, buffs).forEach((st) => { for (const k in st) add(k, st[k]); });
    // passivo da classe
    if (C.passive) for (const k in C.passive) add(k, C.passive[k]);
    // árvore
    TREES[ch.cls].forEach((br, bi) => br.nodes.forEach((n, ni) => {
      const r = (ch.tree || {})[treeNodeId(ch.cls, bi, ni)] || 0;
      if (!r) return;
      if (n[0].indexOf('skill:') === 0) add('skillBoost:' + n[0].slice(6), n[1] * r);
      else add(n[0], n[1] * r);
    }));
    // buffs temporários
    (buffs || []).forEach((bf) => { for (const k in bf) add(k, bf[k]); });
    // evolução
    for (let t = 1; t <= ch.tier; t++) { add('dmgPct', EVOLUTION[t].dmgPct); add('hpPct', EVOLUTION[t].hpPct); }

    const tot = {
      str: ch.stats.str + (b.str || 0), agi: ch.stats.agi + (b.agi || 0),
      vit: ch.stats.vit + (b.vit || 0), ene: ch.stats.ene + (b.ene || 0), level: ch.level,
    };
    const d = Object.assign({ maxHp: 0, maxMp: 0, maxAg: 0, def: 0, atkSpeed: 0, minDmg: 0, maxDmg: 0, minWiz: 0, maxWiz: 0, skillMul: 0 }, C.konst);
    C.rel.forEach(([t, m, s]) => { d[t] += m * tot[s]; });
    const out = {
      total: tot,
      maxHp: Math.floor((d.maxHp + (b.maxHp || 0)) * (1 + (b.hpPct || 0) / 100)),
      maxMp: Math.floor(d.maxMp * (1 + (b.mpPct || 0) / 100)),
      maxAg: Math.floor(d.maxAg + 10),
      def: Math.floor((d.def + (b.armorDef || 0)) * (1 + (b.defPct || 0) / 100)),
      atkSpeed: Math.floor(d.atkSpeed + (b.atkSpeed || 0)),
      critPct: 1 + (b.critPct || 0),
      excPct: 1 + (b.excPct || 0),
      dmgPct: (b.dmgPct || 0),
      dmgRed: Math.min(60, b.dmgRed || 0),
      reflect: b.reflect || 0,
      lifeSteal: b.lifeSteal || 0,
      lifeKill: b.lifeKill || 0,
      manaKill: b.manaKill || 0,
      goldPct: b.goldPct || 0,
      mf: Math.floor((b.mf || 0) + (b.mfPct || 0) + ch.resets * 2),
      costPct: b.costPct || 0,
      cdPct: Math.max(-40, b.cdPct || 0),
      healPct: b.healPct || 0,
      moveSpeed: 6.4 * (1 + (b.moveSpeedPct || 0) / 100),
      agRegen: 0.06 * (1 + (b.agRegen || 0) / 100),
      skillDmgPct: b.skillDmgPct || 0,
      dmgLvl: b.dmgLvl ? Math.floor(ch.level / 20) : 0,
      boosts: {},
      skillMul: 1 + d.skillMul,
    };
    for (const k in b) if (k.indexOf('skillBoost:') === 0) out.boosts[k.slice(11)] = b[k];
    if (C.id === 'dw' || C.magic) {
      const rise = 1 + (b.wizRise || 0) / 100;
      out.minDmg = Math.floor((d.minWiz + (b.wizMin || 0)) * rise);
      out.maxDmg = Math.floor((d.maxWiz + (b.wizMax || 0)) * rise);
    } else {
      out.minDmg = Math.floor(d.minDmg + (b.wMin || 0));
      out.maxDmg = Math.floor(d.maxDmg + (b.wMax || 0));
    }
    out.minDmg += out.dmgLvl; out.maxDmg += out.dmgLvl;
    if (out.maxDmg < out.minDmg) out.maxDmg = out.minDmg;
    out.attackInterval = clamp(0.95 / (1 + out.atkSpeed / 60) / (1 + ((b.atkRatePct || 0) + (b.atkSpeedPct || 0)) / 100), 0.18, 1.2);
    out.mfTable = rarityTable(out.mf, 'normal');
    return out;
  }

  /**
   * Combat Points (CP): uma nota única do poder do personagem, derivada dos
   * atributos finais. Ofensa (dano médio esperado × velocidade × bônus) e
   * sobrevivência (HP efetivo com defesa e absorção) pesam juntos.
   */
  function combatPower(st) {
    const avg = (st.minDmg + st.maxDmg) / 2;
    const critMul = 1 + Math.min(100, st.critPct) / 100 * 0.25 + Math.min(100, st.excPct) / 100 * 0.45;
    const offense = avg * (1 + st.dmgPct / 100) * critMul * (1 + st.skillDmgPct / 200) * (1 + (st.skillMul - 1) * 0.5) / st.attackInterval;
    const ehp = st.maxHp * (1 + st.def / 250) / (1 - st.dmgRed / 100);
    const util = st.lifeSteal * 20 + st.lifeKill * 4 + st.reflect * 15 + st.mf * 2 + st.goldPct;
    return Math.max(1, Math.round(offense * 6 + ehp * 0.9 + util));
  }
  /** CP intrínseco de um item (independe de quem usa) — para marcar e comparar peças. */
  const CP_W = { wMin: 5, wMax: 5, wizMin: 5, wizMax: 5, wizRise: 4, armorDef: 6, maxHp: 1, hpPct: 10, mpPct: 3, dmgPct: 14, dmgRed: 16, critPct: 10, excPct: 12, atkSpeed: 5, defPct: 8, reflect: 10, lifeSteal: 14, lifeKill: 3, manaKill: 2, goldPct: 1, mf: 2, mfPct: 2, costPct: 3, cdPct: 6, healPct: 3, moveSpeedPct: 4, agRegen: 1, skillDmgPct: 6, dmgLvl: 40, str: 3, agi: 3, vit: 3, ene: 3 };
  function itemCP(it) {
    if (!it || !it.slot) return 0;
    const s = itemStats(it);
    let v = 0;
    for (const k in s) v += Math.abs(s[k]) * (CP_W[k] || 4);
    return Math.round(v * (1 + (it.tier || 0) * 0.04));
  }

  /** Rola dano de um golpe. Retorna {dmg, type: 'normal'|'crit'|'exc'}. */
  function rollDamage(st, rnd, mult, skillId, targetDef) {
    const r = rnd();
    let base, type = 'normal';
    if (r < st.excPct / 100) { base = st.maxDmg * 1.2; type = 'exc'; }
    else if (r < (st.excPct + st.critPct) / 100) { base = st.maxDmg; type = 'crit'; }
    else base = st.minDmg + rnd() * (st.maxDmg - st.minDmg);
    let m = mult || 1;
    if (skillId) {
      m *= st.skillMul * (1 + (st.skillDmgPct + (st.boosts[skillId] || 0)) / 100);
    }
    let dmg = base * m * (1 + st.dmgPct / 100);
    dmg = Math.max(dmg * 0.15, dmg - (targetDef || 0));
    return { dmg: Math.max(1, Math.round(dmg)), type };
  }
  function skillCost(st, sk) {
    const f = 1 + st.costPct / 100;
    return { mp: Math.ceil(sk.mp * f), ag: Math.ceil(sk.ag * f) };
  }

  function gainExp(ch, amount) {
    let ups = 0;
    if (ch.level >= RATES.maxLevel) return 0;
    ch.exp += amount;
    while (ch.level < RATES.maxLevel && ch.exp >= expToNext(ch.level)) {
      ch.exp -= expToNext(ch.level);
      ch.level++;
      ch.points += CLASSES[ch.cls].ppl;
      ups++;
    }
    if (ch.level >= RATES.maxLevel) ch.exp = 0;
    return ups;
  }

  function canReset(ch) {
    const reasons = [];
    if (ch.level < RATES.resetLevel) reasons.push('Nível ' + RATES.resetLevel + ' necessário');
    if (ch.gold < resetGoldCost(ch.resets)) reasons.push(resetGoldCost(ch.resets).toLocaleString('pt-BR') + ' de Ouro');
    if (ch.resets >= RATES.maxResets) reasons.push('Limite de resets atingido');
    return { ok: reasons.length === 0, reasons, cost: resetGoldCost(ch.resets) };
  }
  function applyReset(ch) {
    const c = canReset(ch);
    if (!c.ok) return c;
    const extra = (ch.level - RATES.resetLevel) * RATES.resetBonusPerLevel;
    ch.gold -= c.cost;
    ch.resets++;
    ch.level = 1; ch.exp = 0;
    ch.stats = Object.assign({}, CLASSES[ch.cls].base);
    ch.points = ch.resets * RATES.resetPoints + extra;
    ch.tree = {}; // a árvore de maestria é zerada; os pontos voltam para redistribuir
    return { ok: true, points: ch.points };
  }
  /**
   * Risco de enfrentar monstros de nível `monLevel` com um herói de nível `heroLevel`
   * (cor do portal): 'easy' 40+ níveis abaixo (pouca EXP), 'ok' até 5 acima, 'hard' até 25, 'deadly' além disso.
   */
  function levelRisk(monLevel, heroLevel) {
    const d = monLevel - heroLevel;
    return d < -40 ? 'easy' : d <= 5 ? 'ok' : d <= 25 ? 'hard' : 'deadly';
  }
  function canEvolve(ch) {
    const next = EVOLUTION[ch.tier + 1];
    if (!next) return { ok: false, reasons: ['Evolução máxima'], next: null };
    const reasons = [];
    if (ch.level < next.level) reasons.push('Nível ' + next.level);
    if (ch.bossKills < next.bosses) reasons.push(next.bosses + ' chefes derrotados (' + ch.bossKills + ')');
    if (ch.resets < next.resets) reasons.push(next.resets + ' reset(s)');
    return { ok: reasons.length === 0, reasons, next, name: CLASSES[ch.cls].tiers[ch.tier + 1] };
  }
  function autoDistribute(ch, pts) {
    const a = CLASSES[ch.cls].auto;
    pts = Math.min(pts, ch.points);
    let used = 0;
    const keys = ['str', 'agi', 'vit', 'ene'];
    keys.forEach((k) => { const n = Math.floor(pts * a[k]); ch.stats[k] += n; used += n; });
    ch.stats[CLASSES[ch.cls].mainStat] += pts - used;
    ch.points -= pts;
  }

  function today() {
    const d = new Date();
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  return {
    VERSION, RATES, resetGoldCost, mulberry32, hash32, hex, clamp,
    expToNext, expRate, monsterExp, partyShare,
    CLASSES, gearCls, canUse, itemUsers, ROSTER, EVOLUTION, SKILLS, skillsFor, TREES, treeNodeId, treePoints, treeSpent,
    DROP_LEVEL, SLOTS, SLOT_LABEL, RARITY, EXC_WEAPON, EXC_ARMOR, LEGEND, JEWELS, POTIONS, BUFF_POTIONS, TALISMANS,
    plusBonus, rarityAdj, itemGender, itemName, itemReq, itemStats, excOpts, itemLines, itemValue, sellValue,
    BASE_RARITY, MF_SOFTCAP, mfEffective, rarityTable, DROP_CHANCE, tierForLevel, makeEquip, rollDrop,
    goldAmount, TOWER, towerLevel, towerMod, rollTowerDrop,
    EDEN, edenRemaining, edenEntryLevel, edenLevel, rollEdenDrop,
    upgradeChance, upgradeCost, applyUpgrade, talismanUseful, WING_UP, wingUpgradeChance, applyWingUpgrade, wingBonus, monsterStats,
    newCharacter, className, activeItems, itemActive, deriveStats, combatPower, itemCP, rollDamage, skillCost, gainExp,
    canReset, applyReset, levelRisk, canEvolve, autoDistribute, today,
  };
});

