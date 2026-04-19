---
title: Integration
description: Guide for system and module developers to integrate 3D dice animations with Dice So Nice.
---

If you are a system or module developer looking for information on how to have your rolls 3D animated when Dice So Nice is enabled, this guide is for you.

## Step 1: Understanding how 'Dice So Nice!' works
Once enabled, Dice So Nice! intercepts new chat messages and checks `chatMessage.isRoll` (which returns true when the message's `rolls` array has entries). When a roll is detected, Dice So Nice! hides the chat message and displays a 3D animation using the roll data attached to the message. This covers the majority of cases when using vanilla Foundry.

Customized Systems and Modules, however, may implement differently the way the roll is resolved. Therefore they may not want to rely on a single Chat message being rendered, or they may not even use the `Roll` class entirely, favoring custom random strategies for calculating the result.

In this case, 'Dice so Nice' exposes APIs to trigger the animation and have a notification when finished.
[You can find this API by following this link](/foundryvtt-dice-so-nice/api/roll/)

## Step 2: Decide if you can use a single Chat message for your needs or if you'll need a more complicated flow
While we recommend using the 'Chat message detection' system, if your needs are too complicated, please follow the link above and read our Roll API.
If you can make your system/module work with a simple Chat Message, go to Step 3.

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

You can manually alter this order by specifying a `rollOrder` option on a DiceTerm.
In the following example, the "attack" dice will be shown first, then the directDamage and aoeDamage will be shown simultaneously after the attack dice finished rolling.

```javascript
let attack = await new Roll('d20').evaluate();
attack.dice[0].options.rollOrder = 1;

let directDamage = await new Roll('d6').evaluate();
directDamage.dice[0].options.rollOrder = 2;

let aoeDamage = await new Roll('d4').evaluate();
aoeDamage.dice[0].options.rollOrder = 2;

//Merge rolls
const rolls = [attack, directDamage, aoeDamage]; //array of Roll

//Post directly to chat or create your own ChatMessage
//Here we post directly to the chat
const pool = PoolTerm.fromRolls(rolls);
roll = Roll.fromTerms([pool]);

roll.toMessage();
```

## Step 5: Further options
If you wish to add more features to your 'Dice So Nice!' integration like custom dice, multi-colored rolls, and more, please check the rest of our API.
[Roll API](/foundryvtt-dice-so-nice/api/roll/)
[Customization API](/foundryvtt-dice-so-nice/api/customization/)
