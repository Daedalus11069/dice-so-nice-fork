---
title: Custom terms
description: Guide for creating custom die terms and integrating them with Dice So Nice 3D animations.
---

Foundry VTT allows developers to extend the dice system with custom die terms. The core software provides: dc, df, d2, d4, d6, d8, d10, d12, d20, d100.

When a system or module registers a new term during initialization, Dice So Nice! automatically detects it and tries to determine which 3D die shape to use for the animation.

This automatic detection is often not enough on its own. This guide shows how to implement custom die terms and integrate them with Dice So Nice!
## Step 1: Extend the Die class
Foundry VTT provides two relevant classes: `DiceTerm` and `Die`. `DiceTerm` is the abstract base class for any term in a roll formula. `Die` extends it to define a fair n-sided die with modifier support (exploding, keep highest, etc.).

If you are not sure which one to use, you most likely want to extend `Die`.

In the following example, we create a new type of dice: the _Szimfonia_ die, denominated `ds`.
This die is a six-faced die with custom symbols on each face. Its '1' and '6' faces have the same symbol while the other faces have their own symbols.
![Szimfonia die](../../../assets/wiki/ds.jpg)
We'll also override the result labels to display custom thumbnails in the chat message.
```javascript
export class DieSzimfonia extends Die {
    constructor(termData) {
        termData.faces = 6;
        super(termData);
    }

    /* -------------------------------------------- */

    /** @override */
    static DENOMINATION = 's';

    /* -------------------------------------------- */

    /** @override */
    getResultLabel(result) {
        return {
            1: '<img src="modules/szimfonia-dice-roller/images/S1_inCHAT.png" />',
            2: '<img src="modules/szimfonia-dice-roller/images/S2_inCHAT.png" />',
            3: '<img src="modules/szimfonia-dice-roller/images/F1_inCHAT.png" />',
            4: '<img src="modules/szimfonia-dice-roller/images/F2_inCHAT.png" />',
            5: '<img src="modules/szimfonia-dice-roller/images/D1_inCHAT.png" />',
            6: '<img src="modules/szimfonia-dice-roller/images/D1_inCHAT.png" />'
        }[result.result];
    }
}
```
## Step 2: Register the new `DiceTerm`
Once your new `Die` class is created, register it in the Foundry config during the `init` hook.
```javascript
Hooks.once('init', async function () {
    CONFIG.Dice.terms['s'] = DieSzimfonia;
});
```
## Step 3: Add Dice So Nice! support
Now that your new die is registered in Foundry, Dice So Nice! will automatically detect it. Customize its appearance using the [Customization API](/foundryvtt-dice-so-nice/api/customization/).
[Check the Customization API for more options](/foundryvtt-dice-so-nice/api/customization/)
```javascript
Hooks.once('diceSoNiceReady', (dice3d) => {
    dice3d.addSystem({ id: 'szimfonia', name: 'Szimfonia' }, 'preferred');
    dice3d.addDicePreset({
        type: 'ds',
        labels: [
            'modules/szimfonia-dice-roller/images/D1_bg.png',
            'modules/szimfonia-dice-roller/images/F2.png',
            'modules/szimfonia-dice-roller/images/S1.png',
            'modules/szimfonia-dice-roller/images/S2.png',
            'modules/szimfonia-dice-roller/images/F1.png',
            'modules/szimfonia-dice-roller/images/D1_bg.png'
        ],
        bumpMaps: [
            'modules/szimfonia-dice-roller/images/D1_bump.png',
            'modules/szimfonia-dice-roller/images/F2_bump.png',
            'modules/szimfonia-dice-roller/images/S1_bump.png',
            'modules/szimfonia-dice-roller/images/S2_bump.png',
            'modules/szimfonia-dice-roller/images/F1_bump.png',
            'modules/szimfonia-dice-roller/images/D1_bump.png'
        ],
        system: 'szimfonia'
    });
});
```
## Full demo
You can find the module on which this guide is based here: [Szimfonia Dice Roller](https://github.com/JiDW/FVTT-Szimfonia)
