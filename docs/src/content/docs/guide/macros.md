---
title: Macros
description: Useful API calls for players writing macros in Foundry VTT with Dice So Nice.
---

Dice So Nice exposes a few helper methods that are useful when writing Foundry VTT macros.

## Load a save file

You can load a previously created dice appearance save file from a macro:

```javascript
/**
 * Load a save file by its name
 * @param {String} name
 * @returns {Promise}
 */
game.dice3d.loadSaveFile(name);
```

The name must be the exact name of the save file, case sensitive.

## Wait for a 3D animation to complete

When you roll dice from a macro, you may want to wait for the 3D animation to finish before doing something else (like displaying a result or applying damage).

```javascript
/**
 * Wait for the end of a 3D animation for a specific message
 * @param {String} messageId
 * @returns {Promise<boolean>}
 */
game.dice3d.waitFor3DAnimationByMessageID(messageId);
```

### Example

```javascript
let r = await new Roll('d12').evaluate();
let msg = await r.toMessage();
await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
console.log('Animation ended, do something now');
```

## Disable the 3D animation temporarily

You can temporarily prevent Dice So Nice from animating rolls. This is useful in macros that make many rolls where you only want to animate some of them.

```javascript
// Disable 3D animations
game.dice3d.messageHookDisabled = true;

// Do rolls that should not be animated...
let r = await new Roll('1d20').evaluate();
await r.toMessage();

// Re-enable 3D animations
game.dice3d.messageHookDisabled = false;
```
