---
title: Roll API
description: API reference for triggering 3D dice animations programmatically using the Roll class or custom roll systems.
---

> **If you are trying to integrate Dice So Nice! into your system or module, please read the following paragraph carefully. You probably don't need to use the API!**

Once enabled, Dice So Nice! intercepts new chat messages and checks `chatMessage.isRoll` (which returns true when the message's `rolls` array has entries). When a roll is detected, Dice So Nice! hides the chat message and displays a 3D animation using the roll data attached to the message.

This solves the majority of the cases related to the roll visualization when vanilla foundry is used.

**[You can find the documentation for this type of integration here (Recommended)](/foundryvtt-dice-so-nice/api/integration/)**

Customized Systems and Modules, however, may implement differently the way the roll is resolved. Therefore they may not want to rely on a single Chat message being rendered, or they may not even use the `Roll` class entirely, favoring custom random strategies for calculating the result.

In this case, 'Dice so Nice' exposes APIs to trigger the animation and have a notification when finished.

## Using the FVTT Roll class
If the Roll class is still used, activating the animation could be done using the `game.dice3d.showForRoll` method:
```javascript
/**
 * Show the 3D Dice animation for the Roll made by the User.
 *
 * @param {Roll} roll - Roll instance to animate.
 * @param {User} user - Who made the roll (default: game.user).
 * @param {Boolean} synchronize - Show to other players
 *        (default: false).
 * @param {Array} whisper - Users/IDs who can see the roll,
 *        null for everyone (default: null).
 * @param {Boolean} blind - Blind for current user
 *        (default: false).
 * @param {String} chatMessageID - Message ID to reveal
 *        when the roll ends (default: null).
 * @param {Object} speaker - ChatSpeakerData object. Needed
 *        to hide NPC rolls when GM enables that setting.
 * @param {Object} options - { ghost: false, secret: false }
 * @returns {Promise<boolean>} true if animation displayed.
 */
game.dice3d.showForRoll(
    roll,
    user,
    synchronize,
    whisper,
    blind,
    chatMessageID,
    speaker,
    { ghost: false, secret: false }
);
```
`game.dice3d.showForRoll` returns a promise that resolves when the animation ends. The resolved value is a boolean indicating whether the animation was displayed.

The `synchronize` parameter, when set to true, sends a socket event to start the animation on every client that needs it.

The ChatSpeakerData schema can be [found here](https://foundryvtt.com/api/interfaces/foundry.documents.types.ChatSpeakerData.html).

## Using a custom Roll system
If the `Roll` class is not used, you can alternatively call the `game.dice3d.show` method.
```javascript
/**
 * Show the 3D Dice animation based on data configuration made by the User.
 *
 * @param data:  data containing the formula and the result to show in the 3D animation.
 * @param user: the user who made the roll (game.user by default).
 * @param synchronize: if the animation needs to be shown to other players. Default: false
 * @param whisper: list of users or userId who can see the roll,
 *        leave it empty if everyone can see.
 * @param blind if the roll is blind for the current user
 * @returns {Promise<boolean>} when resolved true if the animation was displayed,
 *          false if not.
 */
game.dice3d.show(data, user, synchronize, whisper, blind);
```

Passing a JSON configuration data like so:
d20 (7) + dc (T) + d100 (59)
```javascript
const data = {
    throws: [
        {
            dice: [
                {
                    result: 7,
                    resultLabel: 7,
                    type: 'd20',
                    vectors: [],
                    options: {}
                },
                {
                    result: 0,
                    resultLabel: 'T',
                    type: 'dc',
                    vectors: [],
                    options: {}
                },
                {
                    resultLabel: 50,
                    d100Result: 59,
                    result: 5,
                    type: 'd100',
                    vectors: [],
                    options: {}
                },
                {
                    resultLabel: 9,
                    d100Result: 59,
                    result: 9,
                    type: 'd10',
                    vectors: [],
                    options: {}
                }
            ]
        }
    ]
};
game.dice3d.show(data).then((displayed) => {
    // do your stuff after the animation
});
```

## Disabling/Enabling the 3D animation programmatically
In some cases, you may want to prevent 'Dice So Nice!' from displaying a 3D animation when a Roll Chat Message is posted.

### Skip animation for a specific message (recommended)
Set the `dice-so-nice.skip` flag on the chat message at creation time. This is per-message, multiplayer-safe, and requires no hooks or global state.
```javascript
let r = await new Roll('2d6').evaluate();
await ChatMessage.create({
    rolls: [r],
    content: 'This roll will not trigger a 3D animation',
    flags: {
        'dice-so-nice': {
            skip: true
        }
    }
});
```

### Disable the 'Dice So Nice!' hook locally
This disables 3D animation detection for **all** messages on the current client. Use this only when you need to suppress animation globally for a player rather than for a specific message.
```javascript
game.dice3d.messageHookDisabled = true;
```

### Hide a roll
```javascript
Hooks.on('diceSoNiceRollStart', (messageId, context) => {
    //Hide this roll
    context.blind = true;
});
```

Check the [Hooks documentation](/foundryvtt-dice-so-nice/api/hooks/) for more information.

## Customizing which elements are hidden during a message update

When a roll is added to an existing chat message via `updateChatMessage`, Dice So Nice! hides the new roll elements in the message HTML while the 3D animation plays, then reveals them when it finishes. By default, it targets elements matching the `.dice-roll` CSS selector.

Some systems render their chat messages with a different HTML structure where the roll container uses a different class (e.g. `.dice-result`). You can tell Dice So Nice! which selector to use:

```javascript
Hooks.on("diceSoNiceInit", (dice3d) => {
    dice3d.setMessageUpdateHideSelector(".dice-result");
});
```

The selector must match the elements that wrap individual roll results inside the chat message HTML. It accepts any valid CSS selector string.

:::note
This only affects how rolls added via message updates are hidden and revealed. The initial message hiding (when the message is first created with rolls) always hides the entire message element regardless of this selector.
:::

## Hiding a dice from a roll animation

:::tip[Skip vs. Hidden]
To suppress the **entire** 3D animation for a message, use the [`dice-so-nice.skip` flag](#skip-animation-for-a-specific-message-recommended) instead. The `hidden` property below hides **individual dice** from the animation while still animating the rest.
:::

### From the Roll object
If you wish to hide one or more dice from a Roll object so they are not displayed by Dice So Nice, you can set the `hidden` property on specific dice results within a DiceTerm.
```javascript
let r = await new Roll('1d20+1d6').evaluate();
//Only show the D6 in DsN
r.dice[0].results[0].hidden = true;
r.toMessage();
```

### From Inline Rolls
Alternatively, if you are using inline rolls, you can add the CSS class `inline-dsn-hidden` to your inline roll element to prevent Dice So Nice from detecting it.

## Detecting the end of a 3D Roll animation for a specific message

```javascript
/**
 * Wait for the end of a 3D animation for a specific message
 * @param {String} messageId
 * @returns {Promise<boolean>}
 */
game.dice3d.waitFor3DAnimationByMessageID(messageId);
```

```javascript
let r = await new Roll('d12').evaluate();
let msg = await r.toMessage();
game.dice3d
    .waitFor3DAnimationByMessageID(msg.id)
    .then(() => console.log('Animation ended'));
```

## Accessing the list of Dice Systems
If you need to create your own Dice Settings dialog, you will probably need to access the list of existing (and loaded) systems.
```js
/**
 * Get Loaded Dice Systems
 * return a map of DiceSystem
 * @returns {Map<systemId, DiceSystem>}
 */
game.dice3d.getLoadedDiceSystems();
```
