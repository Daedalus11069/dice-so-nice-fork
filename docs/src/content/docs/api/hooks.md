---
title: Hooks
description: Hooks called by Dice So Nice to help integrate it into your own system or module.
---

There are various hooks called by 'Dice So Nice' to help you integrate it into your own system/module.
## diceSoNiceReady
Called once the module is ready to listen to new rolls and display 3D animations.
* `dice3d`: Main class, instantiated and ready to use.
```javascript
Hooks.once('diceSoNiceReady', (dice3d) => {
    //...
});
```
## diceSoNiceInit
Called at the start of the module initialization process.
* `dice3d`: Main class, instantiated but not ready yet.
```javascript
Hooks.once('diceSoNiceInit', (dice3d) => {
    //...
});
```
## diceSoNiceMessagePreProcess


Called when DsN detects a roll message and decides whether to animate it. Use this hook to force or suppress the 3D animation.

* `messageId`: ID of the message detected by Dice So Nice.
* `interception`: Mutable object `{ willTrigger3DRoll: boolean }`. Flip the boolean to force or suppress the 3D animation.

Fires **before** `diceSoNiceMessageProcessed`.

```js
Hooks.on('diceSoNiceMessagePreProcess', (messageId, interception) => {
    // Suppress 3D animation for this message
    interception.willTrigger3DRoll = false;
});
```

:::tip[Migration from diceSoNiceMessageProcessed]
If your module currently mutates `interception.willTrigger3DRoll` inside a `diceSoNiceMessageProcessed` listener, rename the hook string:

```diff
- Hooks.on('diceSoNiceMessageProcessed', (messageId, interception) => {
+ Hooks.on('diceSoNiceMessagePreProcess', (messageId, interception) => {
      interception.willTrigger3DRoll = false;
  });
```

During the v6 grace period, mutation from `diceSoNiceMessageProcessed` still works but triggers a deprecation warning (since: 6.0.0, until: 7.0.0).
:::

## diceSoNiceMessageProcessed

Called after `diceSoNiceMessagePreProcess`. By the time this hook fires, the `willTrigger3DRoll` value is final.

* `messageId`: ID of the message detected by Dice So Nice.
* `interception`: Object `{ willTrigger3DRoll: boolean }` - the value is now read-only by convention. Use `diceSoNiceMessagePreProcess` if you need to change it.

```js
Hooks.on('diceSoNiceMessageProcessed', (messageId, interception) => {
    if (interception.willTrigger3DRoll) {
        // Wait for the animation to complete before revealing content
        game.dice3d.waitFor3DAnimationByMessageID(messageId);
    }
});
```

:::caution[Deprecation]
Mutating `interception.willTrigger3DRoll` in this hook is deprecated since v6.0.0 and will be removed in v7.0.0. Migrate to `diceSoNiceMessagePreProcess`.
:::
## diceSoNiceRollStart
Called when a 3D roll starts from the hook of the Chat message or when showForRoll is called directly from the API.
* `messageId`: ID of the message that triggered the roll, or `null` if the API was called
* `context`: The data needed to show the roll. Any change made to this object will be used in the roll animation.
  * **roll:** An instance of Roll class to show 3D dice animation
  * **user:** The user who made the roll (game.user by default).
  * **users:** List of users or userId who can see the roll, leave it empty if everyone can see.
  * **blind:** If the roll is blind for the current user
```javascript
Hooks.on('diceSoNiceRollStart', (messageId, context) => {
    //...
});
```
## diceSoNiceRollComplete
Called only when a roll complete after being caught in a Chat message. This hook is therefore not called by using the Roll API. If you need to detect when a Roll is complete while using the Roll class, you can wait for the Promise to resolve.
* `messageId`: ID of the message that triggered the roll.
```javascript
Hooks.on('diceSoNiceRollComplete', (messageId) => {
    //...
});
```
