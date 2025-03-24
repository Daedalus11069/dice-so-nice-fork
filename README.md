![Banner](./banner.jpg?raw=true)

This module for Foundry VTT adds the ability to show a 3D dice simulation when a roll is made.

[[_TOC_]]

# Disclaimer

This fork is to fix a bug present in the 4.6.10 version of the module; namely, when hooking into events supplied by this module for rolling dice, if one rolls multiple dice and multiple dice have effects added to them, it crashes dice-so-nice.  I have not submitted a pull request because the fix, in my opinion, is a bit hacky.  Its hacky because I do not know why the underlying issue occurs, and at best it is a bandaid instead of a solution that targets the root cause of the bug.

This fork was secondarily created so I could use my module which hooks into it: https://github.com/Daedalus11069/foundry-dangerously-threatening-dice-module without having to rely on major caveats for usage.

# Installation

To install, follow these steps:

1.  Inside Foundry, select the Game Modules tab in the Configuration and Setup menu.
2.  Click the Install Module button and enter the following URL: https://github.com/Daedalus11069/dice-so-nice-fork/releases/latest/download/module.json
3.  Click Install and wait for installation to complete.

Dice So Nice! is also available on [The Forge](https://forge-vtt.com/bazaar#package=dice-so-nice). (Non-forked version)

# Usage Instructions

There are no particular instructions for use. Once the module is enabled, 3D animation will be displayed each time dice is rolled on foundry.

![Preview](./dice-so-nice.gif?raw=true)

# Configuration
There's two type of settings:
- The GM settings can only be modified by a GM user and will affect everyone in this FVTT world.
- The Player's dice settings are linked to a player in a single world and can be modified by himself. These settings won't affect other players settings.
## Appearance
![Preview](./settings-appearance.jpg?raw=true)
- **Enable 3D dices**: Enable the 3D dice display in this browser session.
- **Enable Extra Dice Customization**: Let you customize the appearance of special dice, like d7 or d30.
- **Dice Presets (Faces)**: Allows to select the dices faces. Default is "Standard" where every face is a text label. Some game systems can force this value for all players to display their own dices.
- **Theme**: Allows to select a color theme for your dices. Themes changes every color settings and can pack multiple colors that will be selected at random each time you roll. A theme can also include a default texture that will be displayed if you selected "None / Auto (Theme)" in the "Texture" dropdown.
- **Texture**: Allows to select a texture for the dice. Selecting "None / Auto (Theme)" will show the theme texture if there is one.
- **Material**: Allows to select a material for the dice. Selecting "Auto (Theme)" will show the theme material if there is one. Default is "plastic".
- **Font**: Allows to select a font for the dice. Selecting "Auto (Theme)" will use the theme font instead.
- **Label Color**: Allows to change the color of the dice label. 
- **Dice Color**: Allows to change the color of the dice.
- **Outline Color**: Allows to change the color of the dice label outline.
- **Edge Color**: Allows to change the color of the edges of the dice.  

**Note:** You can click on any dice to customize it instead of using a global settings for all the dice.

## Preferences
![Preview](./settings-preferences.jpg?raw=true)
- **Automatically Hide**: When enabled, the dice disappear automatically after the result is displayed.
- **Millisecs Before Hiding**: time in milliseconds after which the dice disappear automatically.
- **Hide FX**: Effect used during dice hiding
- **Sound Effects**: When enabled, custom sounds with "realistic" collision effects are played when the dices roll.
- **Mute all sounds for GM/Blind/Self rolls**: Useful if you don't want your players to hear your secret dice rolls through Voice Chat.
- **Sound Volume**: Let you change the dice sound effect volume. This setting is applied on top of the "Interface" volume bar.
- **Table surface for sounds**: Allows to select the type of sound made by dice hitting the virtual table.
- **Auto Scale**: When enabled, auto scale the dice dimension based on the display size.
- **Manual Scale**: Allows to manually change the scale of the dice.
- **Animation Speed**: Change the speed at which the dices roll.
- **3D layer position**: Select if dice appear on top of the UI or under.
- **Throwing force**: Change the magnitude of the vector applied to roll the dice. Let you either gently roll the dice or throw them with full force like a mad man.
- **Override your dice appearance**: By default, a dice appearance can be changed when a flavor text is added to the roll. Uncheck to disable. 

## Special Effects
![Preview](./settings-sfx.jpg?raw=true)
- **Show other players special effects**: When enabled, it will play the special effects from other players settings. Disable to only show your own.
- **Settings**: Some special effects require further options to work properly. Click on the Gear icon to access these options. 
- **Add**: You can add special effects. A special effect is a short animation and/or sound played when a die roll on a specified result. Ex: Rolling a native 20 on a d20.  

💥[You can find a gallery of all special effects here](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/wikis/Special-Effects)💥

## Performance
![Preview](./settings-performance.jpg?raw=true)
- **Image Quality**: Quality presets to help you optimize your image quality.
- **Advanced lighting**: When enabled, use realistic lighting (HDRI). Disabling this setting will drastically change the image quality but will improve performance.
- **Shadows Quality**: Allows to select the shadows quality. Can help with performances on some PCs.
- **Glowing lights**: When enabled, dice with light effects will glow.
- **Anti-aliasing**: When enabled, dice will be rendered with anti-aliasing. MSAA is the best option for this but requires a GPU with WebGL2 capabilities.
- **UHD resolution support**: When enabled, it will upscale the 3D view to benefit from the extra pixels. Only have an effect on HDPI screens (like Retina display, 4k, etc). High-end GPU needed. No effect if you screen is not HDPI.

## Backup & Restore
![Preview](./settings-backuprestore.jpg?raw=true)
- **Save As**: Manage your save files. You can have an unlimited number of save files to rapidly switch between multiple settings.
- **Load**: Load a previously created save file.
- **Import**: Import a Dice So Nice setting file from a local file.
- **Export all**: Export all settings (appearances, preferences, sfx, performance settings) to a JSON file.
- **Export Special effects**: Export only the Special effects list to a JSON file.
- **Reset to Default**: Reset all settings to their default value.

## Rollable Area Settings

![Preview](./rollable-area-settings.jpg?raw=true)

With this setting it is possible to limit the area of the screen that shows the animation of the 3D dice.
Useful for example for those who stream online sessions and show only a portion of Foundry canvas on the screen
Just resize and/or move the shape and press **"Apply"** on the left window to change and save the Rolling Area for the current user.   
Press **"Restore"** to return to default settings.   
A few considerations:
- The custom rollable area defined in this way is static, therefore it does not adapt to the resize of the browser window
- If "auto scale" is enabled, the size of the dice adapts to the size of the rollable area, so it shrinks compared to when the area occupies the entire screen. Disable the auto scale and set a custom size that is correct for your use.

# Documentation and API
A complete API and documentation for developers and artists alike is available in the [Wiki](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/wikis/home)

# Development and Contributing
Dice So Nice! is a free and open source project. You can contribute to the project by making a merge request or by creating a [Gitlab issue](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/issues).  
Translations are done on the Foundry Hub Weblate directly. Check the [Weblate](https://weblate.foundryvtt-hub.com/engage/dice-so-nice/) page for contributing.  

[![Translation status](https://weblate.foundryvtt-hub.com/widgets/dice-so-nice/-/multi-auto.svg)](https://weblate.foundryvtt-hub.com/engage/dice-so-nice/)

## Build instructions
    npm install
    npx rollup -c -w

# Compatibility

Compatible with Foundry VTT v10 and later.
Tested with Foundry VTT v10.
If you need to use an older Foundry version, please [download a compatible older version](https://foundryvtt.com/packages/dice-so-nice/)

# Acknowledgment

Based on the "Online 3D dice roller" from [http://a.teall.info/dice](http://www.teall.info/2014/01/online-3d-dice-roller.html). 
Credits go to Anton Natarov, who published it under public domain.

> "You can assume that it has the MIT license (or that else) if you wish so. I do not love any licenses at all and prefer to simply say that it is completely free =)" - Anton Natarov

v2 of "Dice So Nice" based on Teal's fork from the awesome MajorVictory, with his direct consent. You can find his online roller here: http://dnd.majorsplace.com/dice/

d10 Geometry created by Greewi who did all the maths for our custom "Pentagonal Trapezohedron". You can find his homebrewed (french) TTRPG Feerie/Solaires here: https://feerie.net

d14, d16, d24 and d30 created and integrated by [Steve Barnett](https://gitlab.com/mooped). Huge thanks to him. He's a developer on the [DCC system](https://www.foundryvtt-hub.com/package/dcc/)

Built on [ThreeJS](https://threejs.org/), [CannonJS](https://schteppe.github.io/cannon.js/) and [Proton](https://github.com/drawcall/three.proton)

## Theme and model credits:
- **Spencer Thayer:** `Thylean Bronze` theme
- **Foundry VTT:** For the FVTT Logo in the `Foundry VTT` preset.
- **LyncsCwtsh:** For the `Spectrum` system (Discord: LyncsCwtsh#7116).
- **MajorVictory:** For all the other theme in this module!
- **[Christian Bloch](http://www.hdrlabs.com/sibl/archive.html):** For the "Footprint Court" HDRI map, released under the [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) license.
- Additional sound effects from https://www.zapsplat.com

Many thanks to the people who continue to support us on Discord, to the amazing system and module developers who integrate our module and to the artists who have let us integrate their textures in Dice So Nice!

# Feedback

Every suggestions/feedback are appreciated, if so, please contact JDW (JDW#6422) or Simone (Simone#6710) on discord.  

To report a bug, please open a new issue [in our tracker](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/issues) or use the [Bug Reporter module](https://www.foundryvtt-hub.com/package/bug-reporter/)

# License

FoundryVTT Dice So Nice is a module for Foundry VTT by Simone and JDW and is licensed under [GNU AFFERO GENERAL PUBLIC LICENSE](./LICENSE.md).

The Foundry VTT platform integration is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development](https://foundryvtt.com/article/license/).
