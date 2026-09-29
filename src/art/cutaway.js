// =============================================================================
// Recorte de visão (estilo ARPG isométrico): paredes e adereços que ficam
// entre a câmera e o herói somem num "furo" pontilhado ao redor da linha de
// visão, deixando só o pé da parede. Assim as paredes podem ser todas altas
// (labirinto de verdade) sem esconder o jogador.
// =============================================================================

/** Uniformes compartilhados por todos os materiais recortáveis (atualizados a cada quadro). */
export const CUT = {
  uCutP: { value: new THREE.Vector3(0, -999, 0) }, // ponto do herói (peito)
  uCutC: { value: new THREE.Vector3(0, 50, 0) },   // câmera
  uCutR: { value: 4.4 },                            // raio do furo (mundo)
};
/** Atualiza o furo: herói em (x, y, z) visto pela câmera `cam`. */
export function setCutaway(x, y, z, cam) {
  CUT.uCutP.value.set(x, y + 1.1, z);
  CUT.uCutC.value.copy(cam.position);
}
/** Desliga o furo (ex.: tela de título). */
export function clearCutaway() { CUT.uCutP.value.set(0, -999, 0); }

const VERT = `
  vec4 cutW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cutW = instanceMatrix * cutW;
  #endif
  vCutW = ( modelMatrix * cutW ).xyz;`;
// ponto mais próximo no segmento herói→câmera; dentro do raio e acima do pé da parede → descarta (com pontilhado na borda)
const FRAG = `
  {
    vec3 cSeg = uCutC - uCutP;
    float cT = dot( vCutW - uCutP, cSeg ) / dot( cSeg, cSeg );
    if ( cT > 0.0 && cT < 1.0 && vCutW.y > 0.55 ) {
      float cD = length( vCutW - ( uCutP + cSeg * cT ) );
      float cA = 1.0 - smoothstep( uCutR - 1.3, uCutR, cD );
      cA *= smoothstep( 0.55, 1.0, vCutW.y ) * smoothstep( 0.0, 0.04, cT );
      // pontilhado ordenado (Bayer 4×4): borda suave sem transparência
      vec2 cF = floor( gl_FragCoord.xy ), cA2 = mod( cF, 2.0 ), cB2 = mod( floor( cF * 0.5 ), 2.0 );
      float cB = ( 4.0 * mod( 2.0 * cA2.x + 3.0 * cA2.y, 4.0 ) + mod( 2.0 * cB2.x + 3.0 * cB2.y, 4.0 ) + 0.5 ) / 16.0;
      if ( cA > cB ) discard;
    }
  }`;

/** Injeta o recorte num shader já pronto (vertexShader/fragmentShader de onBeforeCompile). */
export function injectCutaway(sh) {
  Object.assign(sh.uniforms, CUT);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;')
    .replace('#include <project_vertex>', '#include <project_vertex>' + VERT);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uCutP; uniform vec3 uCutC; uniform float uCutR; varying vec3 vCutW;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + FRAG);
}
/** Torna um material recortável (preserva um onBeforeCompile anterior). */
export function cutaway(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); injectCutaway(sh); };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => 'cutaway|' + prevKey();
  return mat;
}
/** Trecho GLSL para shaders próprios (ex.: chamas em pontos): `cutHidden(pos)` diz se o ponto está no furo. */
export const CUT_GLSL = `uniform vec3 uCutP; uniform vec3 uCutC; uniform float uCutR;
  bool cutHidden( vec3 w ) {
    vec3 s = uCutC - uCutP; float t = dot( w - uCutP, s ) / dot( s, s );
    return t > 0.04 && t < 1.0 && w.y > 0.55 && length( w - ( uCutP + s * t ) ) < uCutR - 0.6;
  }`;
