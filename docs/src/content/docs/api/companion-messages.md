---
title: Companion Messages
description: Link non-roll chat messages to a roll so they stay hidden during the 3D animation and reveal together.
---

Some game systems create multiple chat messages for a single logical roll. For example, WFRP4e posts a test card (containing the Roll) and a separate handler card (with buttons and outcome text). Without companion linking, the handler card appears immediately and spoils the result while the dice are still rolling.

Companion linking solves this. You set a flag on the non-roll message to link it to the primary roll message. Dice So Nice! hides the companion during the animation and reveals it when the dice finish.

## How It Works

1. Create a chat message with a `rolls` array as usual. This is the **primary message**. Dice So Nice! detects and animates it normally.
2. Create one or more **companion messages** with a `dice-so-nice.linkedTo` flag pointing to the primary message's ID.
3. If the primary's animation is still in progress, the companion is hidden automatically.
4. When the animation completes, all companions are revealed together with the primary.

## Integration Example

```javascript
// 1. Create the primary message (contains the roll)
let roll = await new Roll('1d20').evaluate();
let primary = await ChatMessage.create({
    rolls: [roll],
    content: '<p>Attack roll</p>'
});

// 2. Create a companion message linked to the primary
await ChatMessage.create({
    content: '<p>Damage options and buttons here</p>',
    flags: {
        'dice-so-nice': {
            linkedTo: primary.id
        }
    }
});
```

The companion is hidden while the d20 animates and revealed when it lands.

## Integration Contract

- **Create the primary message before its companions.** The companion checks whether the primary's animation is in progress at the moment the companion is created. If the primary doesn't exist yet, the companion shows immediately (no error, just no hiding).
- **Put the Roll on the primary message, not the companion.** If a message has both a `linkedTo` flag and a `rolls` array, it is treated as a normal roll. The `linkedTo` flag is ignored.
- **One primary per companion.** Each companion links to exactly one primary. Multiple companions can link to the same primary.

## Behavior Details

**Advisory flag.** The `linkedTo` flag is advisory. If the primary message doesn't exist, has no animation in progress, or has already finished animating, the companion shows normally. This makes the integration safe to use unconditionally without checking whether Dice So Nice! is active.

**Immediately Display setting.** If the player has enabled "Immediately Display Chat Messages," companion hiding is bypassed. Companions show immediately, matching the player's preference.

**Safety timeout.** If an animation stalls or fails, companions are automatically revealed after 30 seconds to prevent messages from being stuck hidden.

**Message deletion.** If the primary message is deleted mid-animation, all its companions are revealed immediately. If a companion is deleted, it is simply removed from tracking.

**Re-renders.** Foundry may re-render a message's HTML while it is hidden (e.g. when the chat log scrolls). Companions stay hidden during re-renders while the animation is active. After reveal, re-renders will not re-hide the companion.

## Hook Integration

The [`diceSoNiceRollComplete`](/foundryvtt-dice-so-nice/api/hooks/#dicesonicerollcomplete) hook receives an optional second argument with the IDs of any companion messages that were revealed:

```javascript
Hooks.on('diceSoNiceRollComplete', (messageId, companionIds) => {
    // companionIds is an array of revealed companion message IDs
    // Empty array if no companions were linked
    if (companionIds.length > 0) {
        console.log('Companions revealed:', companionIds);
    }
});
```

Existing listeners that only use `messageId` are unaffected.
