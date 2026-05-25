---
title: Custom shaders
description: API for modifying ThreeJS materials and shaders in Dice So Nice dice systems.
---

You can modify any ThreeJS materials and shaders by registering callback functions. One is dedicated to the processing of the material, and one is called before the shader is compiled.

```js
import { DiceSystem } from '../dice-so-nice/api.js';

const myDSNSystem = new DiceSystem(
    'my-dice-system',
    'My Dice System',
    'default',
    'My Name'
);

/**
 * Called when a material is processed for a diceType.
 * Can be used to modify the material.
 * @param {string} diceType - The type of dice. d2, d6, d20, etc.
 * @param {Material} material - The ThreeJS material to be modified.
 * @param {Object} appearance - The player appearance settings for the diceType.
 */
myDSNSystem.registerProcessMaterialCallback(
    (diceType, material, appearance) => {
        //modify the threejs material
    }
);

/**
 * Called before the shader is compiled for a diceType.
 * Can be used to modify the shader fragments.
 * @param {Shader} shader - The ThreeJS shader to be modified.
 * @param {Material} material - The ThreeJS material that this shader is attached to.
 * @param {string} diceType - The type of dice. d2, d6, d20, etc.
 * @param {Object} appearance - The player appearance settings for the diceType.
 */
myDSNSystem.registerBeforeShaderCompileCallback(
    (shader, material, diceType, appearance) => {
        //modify the shader fragments
    }
);

Hooks.once('diceSoNiceReady', (dice3d) => {
    dice3d.addSystem(myDSNSystem);
});
```

## Uniforms
Dice So Nice exposes a `time` uniform to facilitate animated shaders creation.

```js
shader.uniforms.time = game.dice3d.uniforms.time;
```

## Custom Program Cache Key
Should your shader modification in onBeforeShaderCompile need a custom cache logic, registerProcessMaterialCallback is a good place to modify the [material.customProgramCacheKey](https://threejs.org/docs/#api/en/materials/Material.customProgramCacheKey) function.
By default, Dice So Nice will use the uncompiled fragmentShader and vertexShader strings as the key.

## Animations
On top of shader animations, Dice So Nice will also call in its render loop the update method of any ThreeJS [AnimationMixer](https://threejs.org/docs/index.html#api/en/animation/AnimationMixer) found on a mesh or a material.

Keep in mind that a material can be shared by multiple dice mesh as long as they share the exact same `appearance`, system settings included.
