// =============================================================================
// Configuração central do jogo. Valores de "sensação" e de motor ficam aqui;
// o balanceamento de progressão (EXP, itens, dano base, classes) continua em
// src/rules.js, que é compartilhado com os testes.
// =============================================================================

export const CONFIG = {
  loop: {
    maxDt: 0.05,            // s: delta máximo por quadro (evita "teleporte" após travadas)
    hudInterval: 0.1,       // s: atualização do HUD
    minimapInterval: 0.125, // s: redesenho do minimapa
    paneInterval: 0.5,      // s: redesenho do painel lateral quando marcado como sujo
    autosaveInterval: 15,   // s
  },
  camera: {
    fov: 34, near: 1, far: 240,
    dist: 33, distNarrow: 42, narrowWidth: 700, // afasta a câmera em telas estreitas
    yaw: Math.PI / 4, pitch: 0.93,
    pitchMin: 0.42, pitchMax: 1.35,
    zoomMin: 0.5, zoomMax: 1.6, zoomStep: 0.06,
    follow: 8,              // suavização do seguimento (por segundo)
    orbitYaw: 0.006, orbitPitch: 0.004,
  },
  title: {
    pitch: 0.3, zoom: 0.44, sway: 0.1, swaySpeed: 0.12,
  },
  // lights: luzes pontuais no shader (herói + tochas/clarões); fixo por qualidade (mudar recompila tudo).
  // lite: pós-processo leve (sem contorno por normais nem silhueta larga). dynRes: baixa a resolução
  // sozinha quando o quadro passa de ~20 ms. shadowSize/softShadows: mapa de sombra do sol.
  quality: {
    alta: { dpr: 2, shadows: true, shadowSize: 2048, softShadows: true, particles: 1, msaa: 4, bloom: true, lights: 9, lite: false, dynRes: false, aniso: 8 },
    media: { dpr: 1.3, shadows: true, shadowSize: 1024, softShadows: false, particles: 0.8, msaa: 4, bloom: true, lights: 4, lite: false, dynRes: false, aniso: 4 },
    celular: { dpr: 1.5, shadows: true, shadowSize: 1024, softShadows: false, particles: 0.6, msaa: 0, bloom: false, lights: 2, lite: true, dynRes: true, aniso: 2 },
    baixa: { dpr: 1, shadows: false, shadowSize: 1024, softShadows: false, particles: 0.5, msaa: 0, bloom: false, lights: 2, lite: true, dynRes: true, aniso: 2 },
  },
  // resolução dinâmica (qualidades com dynRes): média de quadro acima de `slowMs` por 1 s baixa um
  // degrau; abaixo de `fastMs` por 3 s sobe um. A escala multiplica o DPR da qualidade.
  dynRes: { slowMs: 20, fastMs: 14, step: 0.1, min: 0.6 },
  style: {
    ink: 0.16,              // cor do contorno = cor da cena × ink (tinta escura colorida, não preto puro)
    edge0: 0.012, edge1: 0.05, // faixa do laplaciano relativo de profundidade que vira traço
    lineWidth: 1.1,         // px (× densidade de pixels)
    normalEdge: 0.09,       // 1 − cos do ângulo entre normais vizinhas a partir do qual uma quina vira traço (~25°)
    silhouetteWidth: 1.9,   // px: raio das amostras de silhueta (degraus grandes de profundidade)
    bloom: 0.6,             // intensidade do brilho (partes acima do limiar: fogo, lava, cristais, magia)
    bloomThreshold: 1.5,    // brilho linear (antes do tone mapping) a partir do qual algo "acende"
    vignette: 0.38,         // escurecimento das bordas da tela (0 = sem vinheta)
    shadowTint: 1.2,        // multiplica a força do tom de sombra de cada bioma (BIOMES[x].shadow)
    heightFog: 1,           // multiplica a densidade da névoa de altura dos biomas (0 = desligada)
    glowCore: 1.8,          // brilhos sólidos (orbes, olhos, núcleos, magias) em HDR: passam do limiar do bloom
  },
  particles: { max: 4000 },
  overlay: {
    floatMax: 70,           // números flutuantes simultâneos
    floatDuration: 900,     // ms
    floatDurationBig: 1800, // ms
    labelGap: 21,           // px entre rótulos de loot empilhados
  },
  player: {
    radius: 0.4,
    turnRate: 16,
    castMove: 0.45,         // fração da velocidade ao andar durante uma habilidade leve
    holdRepath: 0.14,       // s: segurar o botão = seguir o cursor
    chaseRepath: 0.3,       // s
    moveHold: 0.12,         // s: mantém a pose "andando" entre pontos do caminho
    reviveInvuln: 3,        // s de invulnerabilidade após a Poção da Ressurreição
    regenAgPerSec: 1,       // multiplica st.agRegen
    regenMpTown: 0.08, regenMpField: 0.012,
    regenHpTown: 0.1, regenHpField: 0.012, regenHpDelay: 4,
    missChance: 0.05,
  },
  // esquiva (Shift no PC, botão no toque): passo curto com invulnerabilidade
  dodge: {
    dist: 4,                // m
    dur: 0.24,              // s do deslocamento
    invuln: 0.3,            // s sem receber dano a partir do início
    cd: 1.7,                // s de recarga
  },
  // aviso no chão antes de golpes fortes (o dano só vale dentro da área marcada)
  telegraph: {
    time: 0.8,              // s entre o aviso e o golpe
    heavyEvery: 3,          // chefes e mini chefes: 1 golpe pesado a cada N ataques corpo a corpo
    heavyMult: 1.6,         // dano do golpe pesado
    eliteSlamCd: 7,         // s entre pancadas em área das elites corpo a corpo
    eliteSlamR: 2.8,        // m: raio da pancada da elite
    eliteSlamMult: 1.5,
  },
  loot: {
    autoPickupRadius: 1.48, // m (gold, poções e jewels)
    autoPickupDelay: 0.5,   // s após cair
    spacePickupRadius: 3.8, // m: tecla Espaço
    spaceSeekRadius: 16,    // m: se nada estiver perto, anda até o mais próximo
    spaceRepeat: 0.25,      // s: repetição ao segurar Espaço
    pickupReach: 1.5,       // m: ao clicar num item
    autoLootRadius: 6,      // m: com "Pegar drops automaticamente" ligado (inclui itens)
    autoPetSellMin: 5,      // itens vendáveis na mochila para o pet partir sozinho (ou mochila quase cheia)
    maxGround: 150,         // objetos no chão; acima disso somem os mais antigos de menor raridade
    expireLow: 180,         // s até um equipamento Comum/Mágico no chão sumir
  },
  auto: {
    skillReach: 10,         // m: alcance usado por habilidades sem alcance próprio (buffs, cura, invocações)
    healBelow: 0.7,         // a Cura automática só sai com o HP abaixo disso
    scanInterval: 0.12,     // s entre buscas de alvo à vista (linha de visão custa)
  },
  monsters: {
    aggroRange: 10, aggroRangeBoss: 12,
    sleepDistance: 70,      // m: longe disso, monstros ociosos não simulam
    losInterval: 0.25,      // s entre testes de linha de visão
    separationCell: 3,      // m: célula da grade espacial
  },
  input: {
    skillBuffer: 0.15,      // s: tecla de habilidade apertada durante a trava fica guardada
    doubleClickMs: 450,
    dragThreshold: 6,       // px
  },
  feel: {
    shake: 1,               // multiplicador do tremor de tela (Opções)
    hitStop: 0.045,         // s de micro-pausa em crítico/abate de elite
    lowHpWarn: 0.3,         // fração de HP para o aviso de vida baixa
  },
  audio: {
    maxVoicesPerFrame: 6,   // sons iniciados por quadro (evita estouro em AoE)
  },
  bag: { size: 48 },
  // Save na nuvem (Supabase). Só a chave PÚBLICA (anon/publishable) pode ficar aqui:
  // quem protege os dados é o Row Level Security da tabela `saves`
  // (supabase/migrations/). Chave vazia = nuvem desligada, o jogo segue só local.
  cloud: {
    url: 'https://vsntbdwlxngqcmpcibub.supabase.co',
    anonKey: 'sb_publishable_vGm57-GkckiTOeC-NK-G5g_ggbq8ML1', // chave PÚBLICA (publishable): pode ficar no código
    pushInterval: 60,       // s entre envios durante a partida (o save local continua a cada 15 s)
    pushIntervalTitle: 4,   // s na tela de título (logo depois de voltar da partida)
    retryInterval: 90,      // s até tentar de novo após falha de rede
  },
};

/** Escala da interface em % (Opções): 90 a 130, de 10 em 10; padrão 100. */
export function uiScale(settings) {
  const v = settings && settings.uiScale;
  return Number.isFinite(v) ? Math.max(90, Math.min(130, Math.round(v / 10) * 10)) : 100;
}

/** Preferências do jogador que afetam CONFIG (aplicadas ao carregar o save e ao mudar Opções). */
export function applyFeelSettings(settings) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = settings.shake == null ? 1 : settings.shake;
  CONFIG.feel.shake = reduce ? Math.min(s, 0.3) : s;
  CONFIG.feel.hitStop = settings.hitStop === false || reduce ? 0 : 0.045;
}

/**
 * Qualidade inicial para quem ainda não escolheu (sem save): telas de toque e telas
 * pequenas começam na "celular"; aparelhos com pouca memória (≤ 2 GB), na "baixa".
 */
export function autoQuality() {
  const nav = typeof navigator === 'object' ? navigator : {};
  const mem = nav.deviceMemory || 4;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const scr = typeof screen === 'object' ? Math.min(screen.width || 0, screen.height || 0) : 0;
  const small = scr > 0 && scr < 500;
  if (mem <= 2) return 'baixa';
  return coarse || small ? 'celular' : 'media';
}
