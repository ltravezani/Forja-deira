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
  quality: {
    alta: { dpr: 2, shadows: true, particles: 1, msaa: 4, bloom: true },
    media: { dpr: 1.3, shadows: true, particles: 0.8, msaa: 4, bloom: true },
    baixa: { dpr: 1, shadows: false, particles: 0.5, msaa: 0, bloom: false },
  },
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
  loot: {
    autoPickupRadius: 1.48, // m (gold, poções e jewels)
    autoPickupDelay: 0.5,   // s após cair
    spacePickupRadius: 3.8, // m: tecla Espaço
    spaceSeekRadius: 16,    // m: se nada estiver perto, anda até o mais próximo
    spaceRepeat: 0.25,      // s: repetição ao segurar Espaço
    pickupReach: 1.5,       // m: ao clicar num item
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
};

/** Preferências do jogador que afetam CONFIG (aplicadas ao carregar o save e ao mudar Opções). */
export function applyFeelSettings(settings) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = settings.shake == null ? 1 : settings.shake;
  CONFIG.feel.shake = reduce ? Math.min(s, 0.3) : s;
  CONFIG.feel.hitStop = settings.hitStop === false || reduce ? 0 : 0.045;
}
