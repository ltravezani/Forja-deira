// ---------- cena de título: câmera orbitando a prévia 3D do personagem ----------
import { animateModel } from '../art/models.js';
import { CONFIG } from '../core/config.js';
import { G } from '../core/state.js';
import { TILE } from '../core/util.js';
import { emit } from '../engine/effects.js';
import { CAM, heroLight, updateCamera } from '../engine/renderer.js';
import { TP } from '../ui/title.js';
import { gy } from '../world/grid.js';
import { updateTorchLights } from '../world/level.js';

export function updateTitleScene(dt) {
  G.time += dt;
  const C = CONFIG.title;
  if (TP.model) {
    CAM.yaw = CONFIG.camera.yaw + Math.sin(G.time * C.swaySpeed) * C.sway;
    CAM.pitch = C.pitch; CAM.zoom = C.zoom;
    updateCamera(TP.x, TP.z, dt);
    TP.model.root.rotation.y = CAM.yaw + Math.sin(G.time * 0.35) * 0.35;
    animateModel(TP.model, { t: G.time, moving: false });
    heroLight.position.set(TP.x + 1.5, gy(TP.x, TP.z) + 3.2, TP.z + 2.5);
  } else {
    CAM.yaw = CONFIG.camera.yaw + Math.sin(G.time * C.swaySpeed) * 0.25;
    updateCamera(23 * TILE, 21 * TILE, dt);
    heroLight.position.set(46, 4, 44);
  }
  for (const n of G.npcs) animateModel(n.model, { t: G.time + n.phase, moving: false });
  const tp = G.townPortal;
  if (tp) {
    tp.ring.rotation.z += dt;
    if (Math.random() < 0.5) emit(tp.x + (Math.random() - 0.5) * 2, 0.3, tp.z, { n: 1, color: 0x9a7aff, speed: 0.5, up: 3, life: 1, size: 0.8, grav: 1.5 });
  }
  updateTorchLights(46, 42, G.time);
}
