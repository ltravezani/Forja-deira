// =============================================================================
// Estilo unificado: todo material sólido do jogo (heróis, NPCs, monstros,
// chão, paredes e adereços) passa por aqui, para que o mundo e os
// personagens tenham a mesma rampa de luz suave, o mesmo brilho de borda e o
// mesmo reflexo nos metais. O contorno preto vem de um passe de tela
// (engine/renderer.js), então vale igualmente para tudo que grava profundidade.
// =============================================================================

let _grad = null;
/** Rampa de luz (sombra → realce) com filtro linear: sombreado suave, sem faixas duras. */
export function toonGradient() {
  if (_grad) return _grad;
  const v = [78, 128, 180, 222, 244];
  const data = new Uint8Array(v.length * 4);
  v.forEach((g, i) => data.set([g, g, g, 255], i * 4));
  _grad = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.LinearFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

/**
 * Uniforms compartilhados por todos os materiais estilizados: trocar de bioma
 * muda só os valores (sem recompilar shaders). uShadowTint é o tom das áreas
 * pouco iluminadas pelo sol (normalizado para não mudar o brilho, só a cor);
 * uShadowStrength vai de 0 (sombra neutra) a 1.
 */
export const STYLE_U = {
  uShadowTint: { value: new THREE.Color(1, 1, 1) },
  uShadowStrength: { value: 0 },
};
/** Tom de sombra do bioma atual (hex) e sua força (0–1). */
export function setShadowTint(hex, strength) {
  STYLE_U.uShadowTint.value.setHex(hex == null ? 0xffffff : hex);
  STYLE_U.uShadowStrength.value = hex == null ? 0 : strength;
}

const RIM_CHUNK = `
  #if NUM_DIR_LIGHTS > 0
  {
    // quanto o fragmento recebe do sol: luz difusa direta ÷ (cor × luz do sol).
    // Já inclui a sombra projetada e a rampa de luz; luzes pontuais somam e "acendem" a área.
    vec3 sRef = diffuseColor.rgb * RECIPROCAL_PI * directionalLights[ 0 ].color;
    float sLit = dot( reflectedLight.directDiffuse, vec3( 1.0 ) ) / max( dot( sRef, vec3( 1.0 ) ), 1e-4 );
    float sShade = ( 1.0 - smoothstep( 0.12, 0.62, sLit ) ) * uShadowStrength;
    // tom normalizado pela luminância: muda a cor da sombra sem escurecê-la
    vec3 sTint = min( uShadowTint / max( dot( uShadowTint, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 ), vec3( 1.7 ) );
    outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * mix( vec3( 1.0 ), sTint, sShade ) + totalEmissiveRadiance;
  }
  #endif
  {
    vec3 sV = normalize( vViewPosition );
    float sNV = 1.0 - clamp( dot( normal, sV ), 0.0, 1.0 );
    // borda iluminada suave (sem recorte duro)
    float sRim = smoothstep( 0.45, 1.0, sNV ) * uRim * 0.8;
    outgoingLight += diffuseColor.rgb * uRimColor * sRim;
    #if NUM_DIR_LIGHTS > 0
      // reflexo dos metais: realce suave em volta do ponto de luz
      vec3 sH = normalize( directionalLights[ 0 ].direction + sV );
      float sSpec = pow( smoothstep( 0.9, 1.0, dot( normal, sH ) ), 2.0 ) * uSpec * 0.6;
      outgoingLight += directionalLights[ 0 ].color * sSpec * ( 0.06 + diffuseColor.rgb * 0.5 );
    #endif
  }
  #include <opaque_fragment>`;

/**
 * Aplica o estilo cartoon a um material (MeshToonMaterial). Preserva um
 * onBeforeCompile já existente (ex.: mistura de texturas do chão).
 * o: { rim (0–1), spec (0–1), rimColor }
 */
export function stylize(mat, o) {
  o = o || {};
  mat.gradientMap = toonGradient();
  const prev = mat.onBeforeCompile;
  const U = { uRim: { value: o.rim != null ? o.rim : 0.35 }, uSpec: { value: o.spec || 0 }, uRimColor: { value: new THREE.Color(o.rimColor != null ? o.rimColor : 0xfff2dc) } };
  mat.userData.stylize = U;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U, STYLE_U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform float uSpec; uniform vec3 uRimColor; uniform vec3 uShadowTint; uniform float uShadowStrength;')
      .replace('#include <opaque_fragment>', RIM_CHUNK);
  };
  const key = 'toonStyle|' + (prev ? prev.toString() : '');
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Atalho: novo MeshToonMaterial já estilizado. */
export function toonMaterial(params, o) {
  return stylize(new THREE.MeshToonMaterial(params), o);
}
