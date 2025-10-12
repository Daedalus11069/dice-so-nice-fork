import { Dice3D } from './Dice3D.js';
import { DiceConfig } from './DiceConfig.js';
import { RollableAreaConfig } from './RollableAreaConfig.js';
import { Utils } from './Utils.js';

/**
 * Registers the exposed settings for the various 3D dice options.
 */
Hooks.once('init', () => {
    game.settings.registerMenu("dice-so-nice", "dice-so-nice", {
        name: "DICESONICE.config",
        label: "DICESONICE.configTitle",
        hint: "DICESONICE.configHint",
        icon: "fas fa-dice-d20",
        type: DiceConfig,
        restricted: false
    });

    game.settings.registerMenu("dice-so-nice", "rollable-area", {
        name: "DICESONICE.RollableAreaConfig",
        label: "DICESONICE.RollableAreaConfigTitle",
        hint: "DICESONICE.RollableAreaConfigHint",
        icon: "fas fa-crop-alt",
        type: RollableAreaConfig,
        restricted: false
    });

    //Not used anymore but kept for compatibility with migration
    game.settings.register("dice-so-nice", "settings", {
        name: "3D Dice Settings",
        scope: "client",
        default: {},
        type: Object,
        config: false
    });

    game.settings.register("dice-so-nice", "maxDiceNumber", {
        name: "DICESONICE.maxDiceNumber",
        hint: "DICESONICE.maxDiceNumberHint",
        scope: "world",
        type: Number,
        default: 20,
        range: {
            min: 20,
            max: 100,
            step: 5
        },
        config: true
    });

    game.settings.register("dice-so-nice", "globalAnimationSpeed", {
        name: "DICESONICE.globalAnimationSpeed",
        hint: "DICESONICE.globalAnimationSpeedHint",
        scope: "world",
        type: String,
        choices: Utils.localize({
            "0": "DICESONICE.PlayerSpeed",
            "1": "DICESONICE.NormalSpeed",
            "2": "DICESONICE.2xSpeed",
            "3": "DICESONICE.3xSpeed"
        }),
        default: "0",
        config: true,
        requiresReload: true
    });

    //add a button to reset the display of the welcome message for all users
    game.settings.register("dice-so-nice", "resetWelcomeMessage", {
        name: "DICESONICE.resetWelcomeMessage",
        hint: "DICESONICE.resetWelcomeMessageHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true,
        onChange: value => {
            if (value) {
                game.users.forEach(user => {
                    user.setFlag("dice-so-nice", "welcomeMessageShown", false);
                });
                game.settings.set("dice-so-nice", "resetWelcomeMessage", false);
            }
        }
    });

    game.settings.register("dice-so-nice", "enabledSimultaneousRolls", {
        name: "DICESONICE.enabledSimultaneousRolls",
        hint: "DICESONICE.enabledSimultaneousRollsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true,
        requiresReload: true
    });

    game.settings.register("dice-so-nice", "enabledSimultaneousRollForMessage", {
        name: "DICESONICE.enabledSimultaneousRollForMessage",
        hint: "DICESONICE.enabledSimultaneousRollForMessageHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true
    });

    game.settings.register("dice-so-nice", "diceCanBeFlipped", {
        name: "DICESONICE.diceCanBeFlipped",
        hint: "DICESONICE.diceCanBeFlippedHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true
    });

    game.settings.register("dice-so-nice", "formatVersion", {
        scope: "world",
        type: String,
        default: "",
        config: false
    });

    game.settings.register("dice-so-nice", "disabledDuringCombat", {
        name: "DICESONICE.disabledDuringCombat",
        hint: "DICESONICE.disabledDuringCombatHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register("dice-so-nice", "disabledForInitiative", {
        name: "DICESONICE.disabledForInitiative",
        hint: "DICESONICE.disabledForInitiativeHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true
    });
    
    //Settings for forcing the dice appearance of the character owner during an initative roll instead of the message author
    game.settings.register("dice-so-nice", "forceCharacterOwnerAppearanceForInitiative", {
        name: "DICESONICE.forceCharacterOwnerAppearanceForInitiative",
        hint: "DICESONICE.forceCharacterOwnerAppearanceForInitiativeHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true
    });

    game.settings.register("dice-so-nice", "immediatelyDisplayChatMessages", {
        name: "DICESONICE.immediatelyDisplayChatMessages",
        hint: "DICESONICE.immediatelyDisplayChatMessagesHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register("dice-so-nice", "animateRollTable", {
        name: "DICESONICE.animateRollTable",
        hint: "DICESONICE.animateRollTableHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register("dice-so-nice", "animateInlineRoll", {
        name: "DICESONICE.animateInlineRoll",
        hint: "DICESONICE.animateInlineRollHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true
    });

    game.settings.register("dice-so-nice", "hideNpcRolls", {
        name: "DICESONICE.hideNpcRolls",
        hint: "DICESONICE.hideNpcRollsHint",
        scope: "world",
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register("dice-so-nice", "allowInteractivity", {
        name: "DICESONICE.allowInteractivity",
        hint: "DICESONICE.allowInteractivityHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true,
        requiresReload: true
    });

    game.settings.register("dice-so-nice", "hide3dDiceOnSecretRolls", {
        name: "DICESONICE.hide3dDiceOnSecretRolls",
        hint: "DICESONICE.hide3dDiceOnSecretRollsHint",
        scope: "world",
        type: Boolean,
        default: true,
        config: true
    });

    game.settings.register("dice-so-nice", "showGhostDice", {
        name: "DICESONICE.showGhostDice",
        hint: "DICESONICE.showGhostDiceHint",
        scope: "world",
        type: String,
        choices: Utils.localize({
            "0": "DICESONICE.ghostDiceDisabled",
            "1": "DICESONICE.ghostDiceForAll",
            "2": "DICESONICE.ghostDiceForRollAuthor"
        }),
        default: false,
        config: true
    });

});

/**
 * Core Foundry is ready, wait for the sidebar then let's create a new Dice3D!
 */
Hooks.once('ready', () => {
    if (ui.sidebar.rendered) {
        setupDiceSoNice();
    } else {
        ui.sidebar.addEventListener("render", setupDiceSoNice, {once: true})
    }
});

const setupDiceSoNice = () => {
    Utils.migrateOldSettings().then((updated) => {
        if (updated) {
            if (!game.settings.get("core", "noCanvas")){
                game.dice3d = new Dice3D();
                game.dice3d.init();
            }
            else
                logger.warn("Dice So Nice! is disabled because the user has activated the 'No-Canvas' mode");
        }
    });
};

const shouldInterceptMessage = (chatMessage, options = {dsnCountAddedRoll: 0, dsnIndexAddedRoll: 0}) => {
    const hasInlineRoll = game.settings.get("dice-so-nice", "animateInlineRoll") && chatMessage.content.includes('inline-roll');

    const hide3dDiceOnSecretRolls = game.settings.get("dice-so-nice", "hide3dDiceOnSecretRolls");
    const showGhostDice = game.settings.get("dice-so-nice", "showGhostDice");
    const shouldShowGhostDice = (showGhostDice === "1" || (showGhostDice === "2" && game.user.id === chatMessage.author.id) && hide3dDiceOnSecretRolls);
    
    const isContentVisible = chatMessage.isContentVisible;
    const shouldAnimateRollTable = game.settings.get("dice-so-nice", "animateRollTable");
    const hasRollTableFlag = chatMessage.getFlag("core", "RollTable");
    
    //The table could be in a compedium pack and foundry does not have an easy way to find the packed table without looping over all compediums
    //In such case, we assume the roll table is displayed
    const rollTableFormulaDisplayed = hasRollTableFlag && (game.tables.get(hasRollTableFlag)?.displayRoll ?? true);

    //Is a roll
    let willTrigger3DRoll = (chatMessage.isRoll || hasInlineRoll) &&
    //If the content is  visible and ghost dice should  be shown
    (isContentVisible || shouldShowGhostDice || !hide3dDiceOnSecretRolls) &&
    //If dsn is correctly enabled and the message hook is not disabled
    game.dice3d && !game.dice3d.messageHookDisabled &&
    //If it has a roll table, then check if the roll table should be animated and the roll table is displayed
    (!hasRollTableFlag || (shouldAnimateRollTable && rollTableFormulaDisplayed)) &&
    //If there's at least one roll with diceterms (could be a deterministic roll without any dice like Roll("5")) or has an inline roll
    (chatMessage.rolls.slice(options.dsnIndexAddedRoll).some(roll => roll.dice.length > 0) || hasInlineRoll);

    const interception = {willTrigger3DRoll: willTrigger3DRoll};

    Hooks.callAll("diceSoNiceMessageProcessed", chatMessage.id, interception);

    return interception.willTrigger3DRoll;
};

/**
 * Intercepts all roll-type messages hiding the content until the animation is finished
 */
Hooks.on('createChatMessage', (chatMessage) => {
    if (!shouldInterceptMessage(chatMessage)) return;
    
    let rolls = chatMessage.isRoll ? chatMessage.rolls : null;
    let maxRollOrder = rolls ? 0 : -1;

    const hasInlineRoll = game.settings.get("dice-so-nice", "animateInlineRoll") && chatMessage.content.includes('inline-roll');
    if (hasInlineRoll) {
        let JqInlineRolls = $($.parseHTML(`<div>${chatMessage.content}</div>`)).find(".inline-roll.inline-result:not(.inline-dsn-hidden)");
        if (JqInlineRolls.length == 0 && !chatMessage.isRoll) //it was a false positive
            return;
        let inlineRollList = [];
        JqInlineRolls.each((index, el) => {
            //We use the Roll class registered in the CONFIG constant in case the system overwrites it (eg: HeXXen)
            let roll = CONFIG.Dice.rolls[0].fromJSON(unescape(el.dataset.roll));
            maxRollOrder++;
            roll.dice.forEach(diceterm => {
                if (!diceterm.options.hasOwnProperty("rollOrder"))
                    diceterm.options.rollOrder = maxRollOrder;
            });
            inlineRollList.push(roll);
        });
        if (inlineRollList.length) {
            if (chatMessage.isRoll)
                inlineRollList = [...chatMessage.rolls, ...inlineRollList];

            let pool = foundry.dice.terms.PoolTerm.fromRolls(inlineRollList);
            //We use the Roll class registered in the CONFIG constant in case the system overwrites it (eg: HeXXen)
            rolls = [CONFIG.Dice.rolls[0].fromTerms([pool])];
        }
        else if (!chatMessage.isRoll)
            return;
    }

    //Because Better Roll 5e sends an empty roll object sometime
    if (!rolls.length || !rolls[0].dice.length)
        return;

    const isInitiativeRoll = chatMessage.getFlag("core", "initiativeRoll");
    if (isInitiativeRoll && game.settings.get("dice-so-nice", "disabledForInitiative"))
        return;

    //Remove the chatmessage sound if it is the core dice sound.
    if (Dice3D.CONFIG().enabled && chatMessage.sound == "sounds/dice.wav") {
        foundry.utils.mergeObject(chatMessage, { "-=sound": null }, { performDeletions: true });
    }
    chatMessage._dice3danimating = true;

    game.dice3d.renderRolls(chatMessage, rolls);
});

/**
 * Hide messages which are animating rolls.
 */
Hooks.on("renderChatMessageHTML", (message, html, data) => {
    if (game.dice3d && game.dice3d.messageHookDisabled) {
        return;
    }
    if (message._dice3danimating && !game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")) {
        /* How does this work:
         * First, it should be noted that updates to the DOM of the message will be erased by the next update as FVTT will rerender the entire message
         * DsN will hide the message for the first render
         * It will then hide the following .dice-roll 
         * We need to keep track of what to hide in order to correctly hide unfinished rolls every time the message is rendered
         * For this, we store two variables in the message: _dice3dRollsHidden and _dice3dMessageHidden
         * _dice3dRollsHidden is an array of the number of rolls added to the message at every update
         * _dice3dMessageHidden is a boolean, true if the original rolls are yet to be finished
         * The reveal/unhiding part can be found in Dice3D.renderRolls
         */
        if (message._dice3dCountNewRolls){
            if(!message._dice3dRollsHidden)
                message._dice3dRollsHidden = [];

            //push the number of new rolls to the array
            message._dice3dRollsHidden.push(message._dice3dCountNewRolls);
            
            //if there's the popout chat, we need to keep track of which render we are in
            if(window.ui.sidebar.popouts.chat) {
                //if _dice3dRenderedInPopout is undefined, we are in the first render (not in the popout), so we set it to false
                //if it exists and is false, we are in a popout render, so we set it to true
                //if it exists and is true, we are in sidebar render, so we set it to false
                message._dice3dRenderedInPopout = typeof message._dice3dRenderedInPopout === "undefined" ? false : !message._dice3dRenderedInPopout;
            }

            //calculate the sum of all hidden rolls
            //if _dice3dRenderedInPopout is true, we need to divide by 2 the sum
            let sumOfAllHiddenRolls = message._dice3dRollsHidden.reduce((a, b) => a + b, 0) / (message._dice3dRenderedInPopout ? 2 : 1);

            //use this sum to hide the last rolls
            //which should be the most recent rolls
            [html.querySelectorAll(`.dice-roll`)].slice(-sumOfAllHiddenRolls).forEach(el => el.classList.add("dsn-hide"));

            //In case _dice3dMessageHidden is still true, we hide the message as it means the original rolls are not yet finished
            if(message._dice3dMessageHidden)
                html.classList.add("dsn-hide");
        }
        else {
            //first time rendering the message
            html.classList.add("dsn-hide");
            message._dice3dMessageHidden = true;
        }
    }
});

/**
 * Save the number of new rolls in the message before it is updated.
 */
Hooks.on("preUpdateChatMessage", (message, updateData, options) => {
    if (!("rolls" in updateData)) return;
    // We test against the source data in case the system/macro/module has modified the scoped message variable
    const originalRollsArrayLength = message.toObject().rolls.length;
    options.dsnCountAddedRoll = updateData.rolls.length - originalRollsArrayLength;
    options.dsnIndexAddedRoll = originalRollsArrayLength;
});

/**
 * Hide and roll new rolls added in a chat message in a update
 */
Hooks.on("updateChatMessage", (message, updateData, options) => {
    if(!shouldInterceptMessage(message, options)) return;

    if (options.dsnCountAddedRoll > 0) {
        message._dice3danimating = true;
        message._dice3dCountNewRolls = options.dsnCountAddedRoll;
        game.dice3d.renderRolls(message, message.rolls.slice(options.dsnIndexAddedRoll));
    }
});

document.addEventListener("visibilitychange", function () {
    //if there was roll while the tab was hidden
    if (!document.hidden && game.dice3d && game.dice3d.hiddenAnimationQueue && game.dice3d.hiddenAnimationQueue.length) {
        let now = (new Date()).getTime();
        for (let i = 0; i < game.dice3d.hiddenAnimationQueue.length; i++) {
            let anim = game.dice3d.hiddenAnimationQueue[i];
            if (now - anim.timestamp > 10000) {
                anim.resolve(false);
            } else {
                game.dice3d._showAnimation(anim.data, anim.config).then(displayed => {
                    anim.resolve(displayed);
                });
            }
        }
        game.dice3d.hiddenAnimationQueue = [];
    }
});

//Chat Command integration
Hooks.on("chatCommandsReady", commands => {
    commands.register({
        name: "/dice3d",
        module: "dice-so-nice",
        aliases: ["/d3d", "/dsn"],
        description: game.i18n.localize("DICESONICE.ChatCommandDescription"),
        icon: "<i class='fas fa-dice-d20'></i>",
        requiredRole: "NONE",
        callback: async (chat, parameters, messageData) => {
            if (game.dice3d) {
                const dsnRoll = await new Roll(parameters).evaluate();
                game.dice3d.showForRoll(dsnRoll, game.user, true);
            }
            return {};
        },
        autocompleteCallback: (menu, alias, parameters) => [game.chatCommands.createInfoElement(game.i18n.localize("DICESONICE.ChatCommandCompletionDescription"))],
        closeOnComplete: true
    });
});

Hooks.on("collapseSidebar", (sidebar, collapsed) => {
    document.getElementById("sidebar-content").addEventListener("transitionend", () => {
        if (game.dice3d && game.dice3d.box) {
            game.dice3d.resizePlayArea();
        }
    }, { once: true });
});