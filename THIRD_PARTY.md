# Componentes de terceiros

O arquivo jogável (`dist/forja-deira.html`) embute os componentes abaixo. Cada um
continua sob a sua própria licença.

| Componente | Onde | Licença |
|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js) r160 | `vendor/three.js` | MIT — Copyright © 2010-2023 Three.js Authors |
| GLTFLoader e SkeletonUtils (exemplos do Three.js r160, adaptados para script clássico) | `vendor/gltf.js` | MIT — Copyright © 2010-2023 Three.js Authors |
| [KayKit Character Pack: Adventurers 1.0](https://kaylousberg.itch.io/kaykit-adventurers) (Knight, Mage, Rogue, Rogue_Hooded, Barbarian e animações) | `assets/models/*.glb`, embutidos em base64 | CC0 1.0 — criado e distribuído por Kay Lousberg (www.kaylousberg.com) |
| [KayKit Character Pack: Skeletons 1.0](https://kaylousberg.itch.io/kaykit-skeletons) (Skeleton_Warrior, Skeleton_Rogue, armas e clipes) | `assets/models/*.glb`, embutidos em base64 | CC0 1.0 — criado e distribuído por Kay Lousberg (www.kaylousberg.com) |
| Fonte [Lora](https://github.com/cyrealtype/Lora-Cyrillic) (título) | embutida em `src/shell.html` | SIL Open Font License 1.1 — Copyright 2011 The Lora Project Authors, nome reservado "Lora" |

Os modelos KayKit foram reduzidos por `tools/prep_models.mjs` (só os clipes usados, sem animações repetidas em cada personagem). O restante da arte (cenário, monstros não humanoides, moradores, texturas, efeitos) e os sons são gerados em código pelo próprio jogo; com "Personagens: simples" em Opções, os humanoides também voltam a ser gerados em código.
