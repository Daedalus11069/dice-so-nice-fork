---
title: Events API
description: API for registering callback events on dice spawn, result, and click in Dice So Nice.
---

Dice So Nice will trigger 3 types of events.
- When a dice spawn
- When a dice finishes rolling
- When a dice is clicked

To register callback events, you need to add a listener on your DiceSystem.

```js
import { DiceSystem } from '../dice-so-nice/api.js';

Hooks.once('diceSoNiceReady', (dice3d) => {
    const myDSNSystem = new DiceSystem(
        'my-dice-system',
        'My Dice System',
        'default',
        'My Name'
    );
    dice3d.addSystem(myDSNSystem);

    myDSNSystem.on(DiceSystem.DICE_EVENT_TYPE.SPAWN, (event) => {
        console.log(event.dice);
    });

    myDSNSystem.on(DiceSystem.DICE_EVENT_TYPE.RESULT, (event) => {
        console.log(event.dice);
    });

    myDSNSystem.on(DiceSystem.DICE_EVENT_TYPE.CLICK, (event) => {
        console.log(event.dice);
        console.log(event.position);
    });
});
```

You can remove a listener by using the `.off` method

```js
myDSNSystem.off(DiceSystem.DICE_EVENT_TYPE.SPAWN, myListenerCallback);
```
