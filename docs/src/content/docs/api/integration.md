---
title: Integration
description: Guide for system and module developers to integrate 3D dice animations with Dice So Nice.
---

If you are a system or module developer looking for information on how to have your rolls 3D animated when Dice So Nice is enabled, this guide is for you.

## Step 1: Understanding how 'Dice So Nice!' works
Once enabled, Dice So Nice! intercepts new chat messages and checks `chatMessage.isRoll` (which returns true when the message's `rolls` array has entries). When a roll is detected, Dice So Nice! hides the chat message and displays a 3D animation using the roll data attached to the message. This covers the majority of cases when using vanilla Foundry.

## Step 2: Pick the right integration path

Most systems and modules work with one of the following approaches:

- **Single chat message with Roll objects.** This is the standard path and requires no special integration. If your roll produces a chat message with a `rolls` array, Dice So Nice! detects and animates it automatically. Go to Step 3.

- **Multiple chat messages for one logical roll.** Some systems create several messages for a single action (e.g. a roll card and a separate result card). In that case, put the Roll on the primary message and use [Companion Messages](/foundryvtt-dice-so-nice/api/companion-messages/) to link the others. Companions stay hidden during the animation and are revealed when the dice land. Go to Step 3 for the primary message, then see the Companion Messages page for the linking flag.

- **No Roll class or no chat message at all.** If your system uses a custom random strategy or needs to trigger an animation without posting to chat, use the [Roll API](/foundryvtt-dice-so-nice/api/roll/) directly.

## Step 3: Create a Chat Message with the required data
For a chat message to be detected by Dice So Nice!, it needs a `rolls` array containing `Roll` objects. In modern Foundry, a message with a `rolls` array is automatically recognized as a roll (`isRoll` returns true).

```javascript
let r = await new Roll('1d20').evaluate();
let chatData = {
    rolls: [r],
    content: 'My HTML Content'
};
ChatMessage.create(chatData);
```

## Step 4: Select roll order for multiple rolls
If your chat message contains multiple rolls, you may wish to delay some of them until another one finishes rolling.
In order to do so, you need to take care of two extra steps.

### 1: Change the value of the `enabledSimultaneousRollForMessage` setting
This setting is set to "true" by default. Your system should take care of changing this setting once and only once, the first time a GM connects to their world.

```javascript
//Do this only once
game.settings.set('dice-so-nice', 'enabledSimultaneousRollForMessage', false);
```

### 2: Decide on the roll orders in your messages
By default, DsN will show the different rolls one after the other in the order of detection, starting by the "rolls" array attached to the message, then each inline rolls found inside the content.

You can alter this order by specifying a `rollOrder` option on a Roll or on individual DiceTerms. Rolls sharing the same `rollOrder` value animate simultaneously; different values animate sequentially in ascending order.

#### Roll-level rollOrder

Set `roll.options.rollOrder` to apply the same order to all dice terms in the roll. Per-term values take priority if both are set.

```javascript
let attack = await new Roll('d20').evaluate();
attack.options.rollOrder = 1;

let damage = await new Roll('2d6+1d4').evaluate();
damage.options.rollOrder = 1; // animates with the attack

let secondAttack = await new Roll('d20').evaluate();
secondAttack.options.rollOrder = 2;

let secondDamage = await new Roll('2d6').evaluate();
secondDamage.options.rollOrder = 2; // animates after the first group

const rolls = [attack, damage, secondAttack, secondDamage];
const pool = PoolTerm.fromRolls(rolls);
Roll.fromTerms([pool]).toMessage();
```

#### Term-level rollOrder

For finer control, set `rollOrder` on individual dice terms. In this example, the attack die animates first, then both damage rolls animate simultaneously.

```javascript
let attack = await new Roll('d20').evaluate();
attack.dice[0].options.rollOrder = 1;

let directDamage = await new Roll('d6').evaluate();
directDamage.dice[0].options.rollOrder = 2;

let aoeDamage = await new Roll('d4').evaluate();
aoeDamage.dice[0].options.rollOrder = 2;

const rolls = [attack, directDamage, aoeDamage];
const pool = PoolTerm.fromRolls(rolls);
Roll.fromTerms([pool]).toMessage();
```

## Step 5: Per-roll appearance in multi-actor messages

When the world setting **"Force roll appearance to owner"** is enabled (the default for new worlds), Dice So Nice! resolves which player's dice appearance to use for each roll in a message. The resolution priority is:

1. **`roll.data.actorId`** — If the Roll's `data` object contains an `actorId`, the actor is looked up via `game.actors.get(actorId)`. If found and the actor has a player owner, that player's dice appearance is used.
2. **`chatMessage.speaker.actor`** — The message-level speaker actor. Same lookup as above.
3. **`chatMessage.author`** — The user who created the message (fallback).

This is especially useful for systems that create a single chat message containing rolls for multiple actors (e.g. a group skill check). By setting `actorId` in each Roll's data, each roll displays the correct player's dice appearance.

```javascript
// Example: group skill check with per-roll actor appearance
const rolls = [];
for (const actor of selectedActors) {
  const roll = await new Roll("1d20").evaluate();
  roll.data.actorId = actor.id;
  rolls.push(roll);
}
```

Without `actorId` in the roll data, all dice in a multi-actor message use the message author's (typically the GM's) appearance.

## Step 6: Further options
If you wish to add more features to your integration, the rest of the API has you covered:

- [Roll API](/foundryvtt-dice-so-nice/api/roll/) - trigger animations programmatically, hide specific dice, disable detection, customize which elements are hidden during message updates
- [Companion Messages](/foundryvtt-dice-so-nice/api/companion-messages/) - link non-roll messages to a roll animation
- [Colors & Themes](/foundryvtt-dice-so-nice/api/customization/) - register custom color themes and presets
- [Hooks](/foundryvtt-dice-so-nice/api/hooks/) - react to animation lifecycle events

### Message flags reference

These flags can be set on a `ChatMessage` at creation time via the `flags` property to control Dice So Nice! behavior.

| Flag | Type | Description |
|------|------|-------------|
| `dice-so-nice.skip` | `boolean` | Suppress the 3D animation entirely for this message. See [Roll API](/foundryvtt-dice-so-nice/api/roll/#skip-animation-for-a-specific-message-recommended). |
| `dice-so-nice.linkedTo` | `string` | Link a non-roll message to a primary roll message so it stays hidden during animation. See [Companion Messages](/foundryvtt-dice-so-nice/api/companion-messages/). |
| `dice-so-nice.persistent` | `boolean` | Mark the message's dice as persistent (interactive dice that stay on the canvas). |
