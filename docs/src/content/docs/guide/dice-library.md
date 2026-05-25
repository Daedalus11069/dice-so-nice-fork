---
title: Dice Library
description: Manage your personal collection of custom dice created with the Dice Editor.
---

The Dice Library is your personal collection of custom dice. Each die you create with the [Dice Editor](/foundryvtt-dice-so-nice/guide/dice-editor/) is stored here and becomes available as a preset in your appearance settings.

## Accessing the Library

1. Open the Dice So Nice! configuration dialog.
2. Go to the **Appearance** tab.
3. Click on a die type in the 3D preview to select it.
4. Click the **library management button** to open the Dice Library for that die type.

## Library Operations

From the Dice Library dialog, you can:

- **View** all custom dice you have created for the selected die type.
- **Create** a new custom die, which opens the [Dice Editor](/foundryvtt-dice-so-nice/guide/dice-editor/).
- **Edit** an existing die to modify its properties in the Dice Editor.
- **Duplicate** a die to create a variant based on an existing design.
- **Delete** dice you no longer need.

## Using Custom Dice

Once a custom die is saved to your library, it appears as a **Library Custom Die** option in the appearance settings dropdown for its die type. Select it to use your custom die for all rolls of that type.

## Rolling a Library Die by Name

You can roll a specific library die directly from the chat by adding a `die:` prefix inside flavor brackets:

```
/r 1d6[die:Fire Oracle]
```

This looks up a d6 named "Fire Oracle" in your library and uses its full appearance (base colors, textures, per-face overrides). The name matching is **case-insensitive**, so `[die:fire oracle]` works too.

### Rolling another player's die

Use the `User:Die` syntax to roll a die from another player's library:

```
/r 1d6[die:Alice:Fate Die]
```

The user name is matched case-insensitively. The die name can contain colons — only the first colon after `die:` separates the user from the die name.

### Multiple library dice in one roll

Each die term resolves its own flavor independently, so you can mix different library dice:

```
/r 1d6[die:Sun]+1d6[die:Moon]+1d6[die:Star]
```

### Behavior notes

- **Type matching is strict** — `[die:Fire Oracle]` on a d20 roll only finds a d20 named "Fire Oracle", not a d6 with the same name.
- **No match** — if the die name isn't found, the die silently uses your default appearance. No error is shown.
- **Independent of damage type themes** — the `die:` prefix works even if "Apply damage type themes to dice" is disabled in your preferences. Regular flavors like `[fire]` still go through the damage type system as before.

## Visibility

Your custom dice are visible to other players in the world. When you roll with a Library Custom Die, other players see your custom design.

## Import and Export

Custom dice definitions are included when you export your settings from the [Profiles & Data](/foundryvtt-dice-so-nice/guide/save-files/) tab. This lets you back up your library or transfer it between worlds.
