import { DiceFactory } from './DiceFactory.js';
import { DiceBox } from './DiceBox.js';
import { DiceColors, TEXTURELIST, COLORSETS } from './DiceColors.js';
import { DiceNotation } from './DiceNotation.js';
import { DiceSFXManager } from './DiceSFXManager.js';
import { Accumulator } from './Accumulator.js';
import { Utils } from './Utils.js';
import { ThinFilmFresnelMap } from './libs/ThinFilmFresnelMap.js';
import { TextureLoader } from 'three';
import { DiceTourMain } from './tours/DiceTourMain.js';
import { DiceSFX } from './DiceSFX.js';
import { DiceSystem } from './DiceSystem.js';
import { DiceLibrary } from './DiceLibrary.js';
/**
 * Main class to handle 3D Dice animations.
 */
export class Dice3D {

    static get DEFAULT_OPTIONS() {
        const quality = {};
        switch (game.settings.get("core", "performanceMode")) {
            case 0:
                quality.bumpMapping = false;
                quality.shadowQuality = "low";
                quality.glow = false;
                quality.antialiasing = "none";
                quality.useHighDPI = false;
                quality.imageQuality = "low";
                quality.persistentDiceOutlines = false;
                break;
            case 1:
                quality.bumpMapping = true;
                quality.shadowQuality = "low";
                quality.glow = false;
                quality.antialiasing = "none";
                quality.useHighDPI = false;
                quality.imageQuality = "medium";
                quality.persistentDiceOutlines = false;
                break;
            case 2:
            case 3:
                quality.bumpMapping = true;
                quality.shadowQuality = "high";
                quality.glow = true;
                quality.antialiasing = game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa";
                quality.useHighDPI = true;
                quality.imageQuality = "high";
                quality.persistentDiceOutlines = true;
                break;
        }
        return {
            enabled: true,
            showExtraDice: game.dice3d && game.dice3d.hasOwnProperty("defaultShowExtraDice") ? game.dice3d.defaultShowExtraDice : false,
            onlyShowOwnDice: false,
            hideAfterRoll: true,
            timeBeforeHide: 2000,
            hideFX: 'fadeOut',
            autoscale: true,
            scale: 75,
            speed: 1,
            imageQuality: quality.imageQuality,
            shadowQuality: quality.shadowQuality,
            bumpMapping: quality.bumpMapping,
            sounds: true,
            soundsSurface: 'felt',
            soundsVolume: 0.5,
            canvasZIndex: 'over',
            throwingForce: 'medium',
            useHighDPI: quality.useHighDPI,
            antialiasing: quality.antialiasing,
            glow: quality.glow,
            persistentDiceOutlines: quality.persistentDiceOutlines,
            showOthersSFX: true,
            immersiveDarkness: true,
            muteSoundSecretRolls: false,
            enableFlavorColorset: true,
            rollingArea: false
        };
    }

    static DEFAULT_APPEARANCE(user = game.user) {
        return {
            global: {
                labelColor: Utils.contrastOf(user.color.toString()),
                diceColor: user.color.toString(),
                outlineColor: user.color.toString(),
                edgeColor: user.color.toString(),
                texture: "none",
                material: "auto",
                font: "auto",
                colorset: "custom",
                system: "standard"
            }
        };
    }

    static ALL_DEFAULT_OPTIONS(user = game.user) {
        let options = foundry.utils.mergeObject(Dice3D.DEFAULT_OPTIONS, { appearance: Dice3D.DEFAULT_APPEARANCE(user) }, { performDeletions: true });
        options.appearance.global.system = game.dice3d.DiceFactory.preferredSystem;
        options.appearance.global.colorset = game.dice3d.DiceFactory.preferredColorset;
        return options;
    }

    static CONFIG(user = game.user) {
        let userSettings = user.getFlag("dice-so-nice", "settings") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "settings")) : {};
        let config = foundry.utils.mergeObject(Dice3D.DEFAULT_OPTIONS, userSettings, { performDeletions: true });
        foundry.utils.mergeObject(config, { "-=appearance": null, "-=sfxLine": null }, { performDeletions: true });
        return config;
    }

    static APPEARANCE(user = game.user) {
        let userAppearance = user.getFlag("dice-so-nice", "appearance") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "appearance")) : {};
        let appearance = foundry.utils.mergeObject(Dice3D.DEFAULT_APPEARANCE(user), userAppearance, { performDeletions: true });
        appearance = foundry.utils.mergeObject(appearance, { "-=dimensions": null }, { performDeletions: true });
        return Utils.sanitizeAppearance(appearance);
    }

    static SFX(user = game.user) {
        let sfxArray;
        if (Dice3D.CONFIG().showOthersSFX || user.id == game.user.id)
            sfxArray = user.getFlag("dice-so-nice", "sfxList") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "sfxList")) : [];
        else
            sfxArray = [];
        if (!Array.isArray(sfxArray)) {
            sfxArray = [];
        }
        return sfxArray;
    }

    static SYSTEM_SETTINGS(user = game.user) {
        let systemSettingsList;
        if (user.id == game.user.id)
            systemSettingsList = user.getFlag("dice-so-nice", "systemSettingsList") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "systemSettingsList")) : [];
        else
            systemSettingsList = [];
        if (!Array.isArray(systemSettingsList)) {
            systemSettingsList = [];
        }
        return systemSettingsList;
    }

    /**
     * Get the full customizations settings for the _showAnimation method 
     */
    static ALL_CUSTOMIZATION(user = game.user, dicefactory = null) {
        let specialEffects = Dice3D.SFX(user) || [];
        game.users.forEach((other) => {
            if (other.isGM && other.id != user.id) {
                let GMSFX = Dice3D.SFX(other);
                if (Array.isArray(GMSFX)) {
                    GMSFX = GMSFX.filter(sfx => sfx.options && sfx.options.isGlobal);
                    specialEffects = specialEffects.concat(GMSFX);
                }
            }
        });
        let config = foundry.utils.mergeObject({ appearance: Dice3D.APPEARANCE(user) }, { specialEffects: specialEffects }, { performDeletions: true });
        if (dicefactory && !game.user.getFlag("dice-so-nice", "appearance")) {
            if (dicefactory.preferredSystem != "standard")
                config.appearance.global.system = dicefactory.preferredSystem;
            if (dicefactory.preferredColorset != "custom")
                config.appearance.global.colorset = dicefactory.preferredColorset;
        }
        config.diceLibrary = DiceLibrary.getLibraryForUser(user);
        return config;
    }

    static ALL_CONFIG(user = game.user) {
        let ret = foundry.utils.mergeObject(Dice3D.CONFIG(user), { appearance: Dice3D.APPEARANCE(user) }, { performDeletions: true });
        ret.specialEffects = Dice3D.SFX(user);
        return ret;
    }

    /**
     * Register a new system (legacy)
     * The id is to be used with addDicePreset
     * The name can be a localized string
     * @param {Object} system {id, name, group} or instance of DiceSystem
     * @param {Boolean} mode "default,preferred". Default will add the system as a choice. Preferred will be enabled for all users unless they change their settings.
     * @param {String} group Group to display in the dice selector. Can be any string, like the dice maker name or a brand
     */
    addSystem(system, mode = "default") {
        //retrocompatibility with  API version < 3.1
        if (typeof mode == "boolean") {
            mode = mode ? "preferred" : "default";
        }

        this.DiceFactory.addSystem(system, mode);
    }

    /**
     * Register a new dice preset
     * Type should be a known dice type (d4,d6,d8,d10,d12,d14,d16,d20,d24,d30,d100)
     * Labels contains either strings (unicode) or a path to a texture (png, gif, jpg, webp)
     * The texture file size should be 256*256
     * The system should be a system id already registered
     * @param {Object} dice {type:"",labels:[],system:""}
     */
    addDicePreset(dice, shape = null) {
        this.DiceFactory.addDicePreset(dice, shape);
    }

    /**
     * Add a texture to the list of textures and preload it
     * @param {String} textureID 
     * @param {Object} textureData 
     * @returns {Promise}
     */
    addTexture(textureID, textureData) {
        if (!textureData.bump)
            textureData.bump = '';
        return new Promise((resolve) => {
            let textureEntry = {};
            textureEntry[textureID] = textureData;
            TEXTURELIST[textureID] = textureData;
            DiceColors.loadTextures(textureEntry, (images) => {
                resolve();
            });
        });
    }

    /**
     * Add a colorset (theme)
     * @param {Object} colorset 
     * @param {Object} mode = "default", "preferred"
     */
    async addColorset(colorset, mode = "default") {
        let defaultValues = {
            foreground: "custom",
            background: "custom",
            outline: "",
            edge: "",
            texture: "custom",
            material: "custom",
            font: "custom",
            visibility: "visible"
        }
        colorset = foundry.utils.mergeObject(defaultValues, colorset, { performDeletions: true });
        COLORSETS[colorset.name] = colorset;
        DiceColors.initColorSets(colorset);

        if (colorset.font && !foundry.applications.settings.menus.FontConfig.getAvailableFonts().includes(colorset.font)) {
            await foundry.applications.settings.menus.FontConfig.loadFont(colorset.font, { editor: false, fonts: [] });
        }
        if (mode == "preferred")
            this.DiceFactory.preferredColorset = colorset.name;
    }

    /**
     * Add a new type if SFX trigger that can be customized by users.
     * This trigger can then be pulled by a system, a module or a macro
     * @param {String} id : Identifier of the trigger, ex: fate3df
     * @param {String} name : Localized name of the trigger, ex: Fate Roll
     * @param {Array(String)} results : Array of possible results for this trigger, ex: ["-3","3","0"]
     */
    addSFXTrigger(id, name, results) {
        if (DiceSFXManager.EXTRA_TRIGGER_RESULTS[id])
            return;
        DiceSFXManager.EXTRA_TRIGGER_TYPE.push({ id: id, name: name });
        DiceSFXManager.EXTRA_TRIGGER_RESULTS[id] = [];
        results.forEach((res) => {
            DiceSFXManager.EXTRA_TRIGGER_RESULTS[id].push({ id: res, name: res });
        });
    }

    /**
     * Registers a new SFX mode class with the DiceSFXManager.
     *
     * @param {DiceSFX} sfxClass - The SFX mode class to be registered.
     * @return {void}
     */
    addSFXMode(sfxClass) {
        DiceSFXManager.registerSFXModeClass(sfxClass);
    }

    /**
     * Get available SFX modes by id -> localized name.
     * @returns {Object<string, string>}
     */
    getSFXModes() {
        const modes = DiceSFXManager.SFX_MODE_LIST || {};
        const localized = {};
        Object.entries(modes).forEach(([id, key]) => {
            localized[id] = game.i18n.localize(key);
        });
        return localized;
    }

    /**
     * Load a save file by its name
     * @param {String} name 
     * @returns {Promise}
     */
    async loadSaveFile(name) {
        if (game.user.getFlag("dice-so-nice", "saves").hasOwnProperty(name))
            await Utils.actionLoadSave(name);
    }

    /**
     * Get Loaded Dice Systems
     * return a map of DiceSystem
     * @returns {Map<systemId, DiceSystem>}
     */
    getLoadedDiceSystems() {
        return this.DiceFactory.systems;
    }


    /**
     * Constructor. Create and initialize a new Dice3d.
     */
    constructor() {
        Hooks.call("diceSoNiceInit", this);
        this.dice3dRenderers = {
            "board": null,
            "showcase": null,
            "editor": null
        };

        this.exports = {
            "Utils": Utils,
            "DiceColors": DiceColors,
            "TEXTURELIST": TEXTURELIST,
            "COLORSETS": COLORSETS
        };

        this.uniforms = {
            globalBloom: { value: 1 },
            bloomStrength: { value: 1.1 },
            bloomRadius: { value: 0.2 },
            bloomThreshold: { value: 0 },
            iridescenceLookUp: { value: new ThinFilmFresnelMap() },
            iridescenceNoise: { value: new TextureLoader().load("modules/dice-so-nice/textures/noise-thin-film.webp") },
            boost: { value: 1.5 },
            time: { value: 0 }
        };

        this.hiddenAnimationQueue = [];
        this.defaultShowExtraDice = Dice3D.DEFAULT_OPTIONS.showExtraDice;

        //local user's persistent dice data, keyed by persistentId
        this._persistentDiceData = new Map();
    }

    init() {
        this._buildCanvas();
        this._initListeners();
        this._buildDiceBox();
        this.diceLibrary = new DiceLibrary();
        DiceColors.loadTextures(TEXTURELIST, async (images) => {
            DiceColors.initColorSets();

            Hooks.call("diceSoNiceReady", this);
            await this.DiceFactory._loadFonts();
            await this.diceLibrary.load();
            await DiceLibrary.preloadAssets();
            await this.DiceFactory.preloadPresets();
            //restore persistent dice from flags
            await this._restoreAllPersistentDice();
        });
        DiceSFXManager.init();
        this._startQueueHandler();
        this._nextAnimationHandler();
        this._welcomeMessage();
        this._registerTours();
    }

    get canInteract() {
        return !this.box.running || this.box.persistentDiceList.length > 0;
    }

    /**
     * Create and inject the dice box canvas resizing to the window total size.
     *
     * @private
     */
    _buildCanvas() {
        const config = Dice3D.CONFIG();
        const bodyTop = parseInt(window.getComputedStyle(document.body).top, 10) || 0;

        const area = {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight - 1 - bodyTop
        };

        if(config.rollingArea) {
            area.width = config.rollingArea.width;
            area.height = config.rollingArea.height;
            area.left = config.rollingArea.left;
            area.top = config.rollingArea.top;
        }

        if (!config.enabled) {
            area.width = 1;
            area.height = 1;
        }

        this.canvas = $(`<div id="dice-box-canvas" style="position: absolute; left: ${area.left}px; top: ${area.top}px; pointer-events: none;"></div>`);
        if (config.canvasZIndex === "over") {
            this.canvas.css("z-index", 1000);
            this.canvas.appendTo($('body'));
        }
        else {
            $("#board").after(this.canvas);
        }
        this.canvas.width(area.width + 'px');
        this.canvas.height(area.height + 'px');
    }

    /**
     * Build the dicebox.
     *
     * @private
     */
    _buildDiceBox() {
        this.DiceFactory = new DiceFactory();
        let config = Dice3D.ALL_CONFIG();
        config.boxType = "board";

        config.dimensions = this._computeDimensions(config.rollingArea);

        this.box = new DiceBox(this.canvas[0], this.DiceFactory, config);
        this._boxReady = this.box.initialize();
        this.box.onPersistentEvent = (type, data) => this._emitPersistentEvent(type, data);
        this.box.sfxListForUser = (user) => Dice3D.ALL_CUSTOMIZATION(user).specialEffects || [];
    }

    _computeDimensions(rollingArea) {
        const dimensions = {
            width: window.innerWidth,
            height: window.innerHeight - 1,
            margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            }
        };

        if(!rollingArea) {
            if (ui.sidebar.expanded) {
                dimensions.margin.right = ui.sidebar.element.clientWidth;
            }
        } else {
            dimensions.width = rollingArea.width;
            dimensions.height = rollingArea.height;
        }

        return dimensions;
    }

    /**
     * Init listeners on windows resize and on click if auto hide has been disabled within the settings.
     *
     * @private
     */
    _initListeners() {
        this._rtime;
        this._timeout = false;

        const resizeHandler = () => {
            //resize ended probably, lets update the canvas once the current animation is complete
            this._currentAnimation.then(() => this.resizeAndRebuild());
        }
        const debouncedResizeHandler = foundry.utils.debounce(resizeHandler.bind(this), 1000);
        $(window).resize(debouncedResizeHandler);

        // Resize the play area
        // Only works if the window size hasn't changed
        this.resizePlayArea = () => {
            const config = Dice3D.CONFIG();
            const dimensions = this._computeDimensions(config.rollingArea);
            this.box.updateBoundaries(dimensions);
        };

        //Only used after a window resize
        this.resizeAndRebuild = () => {
            this.canvas[0].remove();
            this.dice3dRenderers.board.dispose();
            this.dice3dRenderers.board = null;

            //save previous systems
            const systemBackup = this.DiceFactory.systems;

            this.box.clearScene();
            this._buildCanvas();
            this._buildDiceBox();
            this.box.soundManager.preloadSounds();

            // Restore previous systems
            this.DiceFactory.systems = systemBackup;
        };

        $(document).on("click", ".dice-so-nice-btn-settings", (ev) => {
            ev.preventDefault();
            const menu = game.settings.menus.get(ev.currentTarget.dataset.key);
            const app = new menu.type();
            return app.render(true);
        });

        $(document).on("click", ".dice-so-nice-btn-tour", (ev) => {
            ev.preventDefault();
            game.tours.get("dice-so-nice.dice-so-nice-tour").start();
        });

        game.socket.on('module.dice-so-nice', (request) => {
            switch (request.type) {
                case "show":
                    if (!request.users || request.users.includes(game.user.id))
                        this.show(request.data, game.users.get(request.user));
                    break;
                case "update":
                    if (request.user == game.user.id || Dice3D.CONFIG().showOthersSFX)
                        DiceSFXManager.init();
                    if (request.user != game.user.id) {
                        DiceLibrary.preloadAssets(request.user);
                        this.DiceFactory.preloadPresets(false, request.user);
                    }
                    break;
                case "persistent-create":
                case "persistent-remove":
                case "persistent-clear":
                case "persistent-pickup":
                case "persistent-move":
                case "persistent-release":
                case "persistent-preroll":
                case "persistent-throw":
                    if (request.user !== game.user.id)
                        this._handlePersistentMessage(request).catch(err =>
                            console.error("[Dice So Nice] Persistent sync error:", err));
                    break;
            }
        });

        //clean up persistent dice when user disconnects (locked dice would stay stuck otherwise)
        Hooks.on("userConnected", (user, connected) => {
            if (!connected) {
                this._cleanupDisconnectedUser(user.id);
                this.box.clearPersistentDice({ ownerUserId: user.id });
                return;
            }
            //restore connecting user's persistent dice from their flags
            this._restorePersistentDiceFromFlags(user.id, false);
        });

        const hideCanvasAndClear = () => {
            const config = Dice3D.CONFIG();
            if (!config.hideAfterRoll && this.canvas.is(":visible") && !this.box.rolling) {
                if (this.box.persistentDiceList.length > 0) return;
                this.canvas.hide();
                this.box.clearAll();
            }
        }

        const mouseNDC = (event) => {
            let rect = this.canvas[0].getBoundingClientRect();
            let x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            if (x > 1)
                x = 1;
            let y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
            return { x: x, y: y };
        }

        if (game.settings.get("dice-so-nice", "allowInteractivity")) {
            //pointer events + setPointerCapture to avoid dropped drags
            //capture phase on window so nothing downstream can stopPropagation
            //TODO: touch/pen input not supported yet for persistent dice
            this._dsnPointerDown = async (event) => {
                if (event.pointerType && event.pointerType !== "mouse") return;
                if (!this.canInteract) return;
                //temporarily flip pointer-events to auto so elementsFromPoint can see the canvas,
                //then restore immediately. respects stacking order (modals, dialogs, etc.)
                //look up fresh each time in case _buildCanvas recreated the div
                const dsnEl = document.getElementById("dice-box-canvas");
                if (dsnEl && typeof document.elementFromPoint === "function") {
                    const prevPE = dsnEl.style.pointerEvents;
                    let topmost;
                    dsnEl.style.pointerEvents = "auto";
                    try {
                        topmost = document.elementFromPoint(event.clientX, event.clientY);
                    } finally {
                        dsnEl.style.pointerEvents = prevPE;
                    }
                    if (topmost && topmost !== dsnEl && !dsnEl.contains(topmost)) {
                        return;
                    }
                }
                let hit = await this.box.onMouseDown(event, mouseNDC(event));
                if (hit) {
                    try {
                        document.documentElement.setPointerCapture?.(event.pointerId);
                    } catch (e) { /* capture is best-effort */ }
                    this._beforeShow();
                } else {
                    hideCanvasAndClear();
                }
            };
            this._dsnPointerMove = async (event) => {
                if (event.pointerType && event.pointerType !== "mouse") return;
                if (!this.canInteract) return;
                await this.box.onMouseMove(event, mouseNDC(event));
            };
            this._dsnPointerUp = async (event) => {
                if (event.pointerType && event.pointerType !== "mouse") return;
                if (!this.canInteract) return;
                let hit = await this.box.onMouseUp(event);
                if (hit) this._afterShow();
            };
            //no removeEventListener needed, _initListeners runs once per session
            window.addEventListener("pointerdown", this._dsnPointerDown, true);
            window.addEventListener("pointermove", this._dsnPointerMove, true);
            window.addEventListener("pointerup", this._dsnPointerUp, true);
            //pointercancel = OS took the pointer, treat as release
            window.addEventListener("pointercancel", this._dsnPointerUp, true);
        } else {
            $(document).on("mousedown.dicesonice", "body", async (event) => {
                hideCanvasAndClear();
            });
        }
    }

    /**
     * Show a private message to new players
     */
    _welcomeMessage() {
        if (!game.user.getFlag("dice-so-nice", "welcomeMessageShown")) {
            const content = [`
            <div class="dice-so-nice">
                <h3 class="nue">${game.i18n.localize("DICESONICE.WelcomeTitle")}</h3>
                <p class="nue">${game.i18n.localize("DICESONICE.WelcomeMessage1")}</p>
                <p class="nue">${game.i18n.localize("DICESONICE.WelcomeMessage2")}</p>
                <p>
                    <button type="button" class="dice-so-nice-btn-settings" data-key="dice-so-nice.dice-so-nice">
                        <i class="fas fa-dice-d20"></i> ${game.i18n.localize("DICESONICE.configTitle")}
                    </button>
                </p>
                <p class="nue">${game.i18n.localize("DICESONICE.WelcomeMessage3")}</p>
                <p class="nue">${game.i18n.localize("DICESONICE.WelcomeMessageTour")}</p>
                <p>
                    <button type="button" class="dice-so-nice-btn-tour" data-tour="dice-so-nice-tour">
                        <i class="fas fa-hiking"></i> ${game.i18n.localize("DICESONICE.WelcomeMessageTourBtn")}
                    </button>
                </p>
                <p class="nue">${game.i18n.localize("DICESONICE.WelcomeMessage4")}</p>
                <footer class="nue">${game.i18n.localize("NUE.FirstLaunchHint")}</footer>
            </div>
            `];
            const chatData = content.map(c => {
                return {
                    whisper: [game.user.id],
                    speaker: { alias: "Dice So Nice!" },
                    flags: { core: { canPopout: true } },
                    content: c
                };
            });
            ChatMessage.implementation.createDocuments(chatData);
            game.user.setFlag("dice-so-nice", "welcomeMessageShown", true);
        }
    }

    /**
     * Register the tours to the Tour Manager
     */
    _registerTours() {
        game.tours.register("dice-so-nice", "dice-so-nice-tour", new DiceTourMain());
    }

    /**
     * Check if 3D simulation is enabled from the settings.
     */
    isEnabled() {
        let combatEnabled = (!game.combat || !game.combat.started) || (game.combat && game.combat.started && !game.settings.get("dice-so-nice", "disabledDuringCombat"));
        return Dice3D.CONFIG().enabled && combatEnabled;
    }

    /**
     * Update the DiceBox with fresh new settgins.
     *
     * @param settings
     */
    update(settings) {
        this.box.update(settings);
    }

    /**
     * Parse, sort and add the dice animation to the queue for a chat message and an array of Roll
     * Used internally by the message Hooks. Not meant to be used outside of the module.
     * Please use the showForRoll method instead.
     * @param {ChatMessage} chatMessage 
     * @param {Array<Roll>} rolls 
     */
    renderRolls(chatMessage, rolls) {
        const showMessage = () => {
            delete chatMessage._dice3danimating;

            let messageElement = $(window.ui.chat.element).find(`.message[data-message-id="${chatMessage.id}"]`);
            messageElement.removeClass("dsn-hide");

            let messageElementPopout;
            if (window.ui.sidebar.popouts.chat) {
                messageElementPopout = $(window.ui.sidebar.popouts.chat.element).find(`.message[data-message-id="${chatMessage.id}"]`);
                messageElementPopout.removeClass("dsn-hide");
            }

            // Manage v13 popup system - TODO clean up consistency jquery
            const notificationElement = document.querySelector(`#chat-notifications .message[data-message-id="${chatMessage.id}"]`);
            if (notificationElement) {
                // Remove previously hidden notification
                notificationElement.remove();
            }

            if (!ui.sidebar.expanded) {
                ui.chat.notify(chatMessage, { newMessage: true, existing: ui.chat.element.querySelector(`[data-message-id="${chatMessage.id}"]`) });
            }

            if (chatMessage._dice3dMessageHidden) {
                //first/initial rolls are done
                chatMessage._dice3dMessageHidden = false;
            } else if (chatMessage._dice3dRollsHidden && chatMessage._dice3dRollsHidden.length) {
                //subsequent rolls. for every 'done' roll we reveal x hidden rolls by shifting the _dice3dRollsHidden array
                messageElement.find(`.dice-roll.dsn-hide`).slice(0, chatMessage._dice3dRollsHidden.shift()).removeClass("dsn-hide");

                if (window.ui.sidebar.popouts.chat) {
                    messageElementPopout.find(`.dice-roll.dsn-hide`).slice(0, chatMessage._dice3dRollsHidden.shift()).removeClass("dsn-hide");
                }
            }

            Hooks.callAll("diceSoNiceRollComplete", chatMessage.id);

            if (window.ui.chat.isAtBottom || chatMessage.author?.id === game.user.id)
                window.ui.chat.scrollBottom({ popout: false });
            if (window.ui.sidebar.popouts.chat && (window.ui.sidebar.popouts.chat.isAtBottom || chatMessage.author?.id === game.user.id))
                window.ui.sidebar.popouts.chat.scrollBottom();
        }

        if (game.view == "stream" && !(game.modules.get("0streamutils")?.active || game.modules.get("obs-utils")?.active)) {
            setTimeout(showMessage, 2500, chatMessage);
        } else {
            //1- We create a list of all 3D rolls, ordered ASC
            //2- We create a Roll object with the correct formula and results
            //3- We queue the showForRoll calls and then show the message
            let orderedDiceList = [[]];
            rolls.forEach(roll => {
                roll.dice.forEach(diceTerm => {
                    let index = 0;
                    if (!game.settings.get("dice-so-nice", "enabledSimultaneousRollForMessage") && diceTerm.options.hasOwnProperty("rollOrder")) {
                        index = diceTerm.options.rollOrder;
                        if (orderedDiceList[index] == null) {
                            orderedDiceList[index] = [];
                        }
                    }

                    //In order to allow for custom appearance and the roll level, we merge the roll appearance in the dice term
                    if (roll.options?.appearance) {
                        if (!diceTerm.options)
                            diceTerm.options = {};
                        if (!diceTerm.options.appearance)
                            diceTerm.options.appearance = {};
                        diceTerm.options.appearance = foundry.utils.mergeObject(diceTerm.options.appearance, roll.options.appearance);
                    }

                    orderedDiceList[index].push(diceTerm);
                });
            });
            orderedDiceList = orderedDiceList.filter(el => el != null);

            let rollList = [];
            const plus = new foundry.dice.terms.OperatorTerm({ operator: "+" });
            //_evaluated is false in v12, true in v13+
            if (!plus._evaluated)
                plus.evaluate();

            orderedDiceList.forEach(dice => {
                //add a "plus" between each term
                if (Array.isArray(dice) && dice.length) {
                    let termList = [...dice].map((e, i) => i < dice.length - 1 ? [e, plus] : [e]).reduce((a, b) => a.concat(b));
                    //We use the Roll class registered in the CONFIG constant in case the system overwrites it (eg: HeXXen)
                    rollList.push(CONFIG.Dice.rolls[0].fromTerms(termList));
                }
            });

            //call each promise one after the other, then call the showMessage function
            const recursShowForRoll = (rollList, index) => {
                let author = chatMessage.author;
                if (chatMessage.getFlag("core", "initiativeRoll") && game.settings.get("dice-so-nice", "forceCharacterOwnerAppearanceForInitiative")) {
                    if (chatMessage.speaker) {
                        const actor = game.actors.get(chatMessage.speaker.actor);
                        if (actor && actor.hasPlayerOwner) {
                            //get the user from game.users
                            author = game.users.find(user => !user.isGM && user.character?.id == actor.id);
                            if (!author) {
                                //if we could not find a player user, we try to find a player owner, if and only if the actor only has a single player owner (but can have multiple GMs)
                                const ownership = { ...actor.ownership }; //ie {"default": 0,"Q1Qcc8RRRcvG6QjE": 3}
                                if (ownership.default != CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) { //Check that the default isn't Owner
                                    //now get all the owners that are not GMs nor the default
                                    delete ownership.default;
                                    const playerOwners = Object.keys(ownership).filter(key => game.users.get(key) && !game.users.get(key).isGM);
                                    //if there is only one player owner
                                    if (playerOwners.length == 1) {
                                        author = game.users.get(playerOwners[0]);
                                    }
                                }
                            }
                        }
                    }
                }
                this.showForRoll(rollList[index], author, false, null, false, chatMessage.id, chatMessage.speaker).then(() => {
                    index++;
                    if (rollList[index] != null)
                        recursShowForRoll(rollList, index);
                    else
                        showMessage();
                });
            };

            recursShowForRoll(rollList, 0);
        }
    }

    /**
     * Show the 3D Dice animation for the Roll made by the User.
     *
     * @param roll an instance of Roll class to show 3D dice animation.
     * @param user the user who made the roll (game.user by default).
     * @param synchronize if the animation needs to be sent and played for each players (true/false).
     * @param users list of users or userId who can see the roll, leave it empty if everyone can see.
     * @param blind if the roll is blind for the current user
     * @param messageID ChatMessage related to this roll (default: null)
     * @param speaker Object based on the ChatSpeakerData data schema related to this roll. Useful to fully support DsN settings like "hide npc rolls". (Default: null)
     * @param options Object with 2 booleans: ghost (default: false) and secret (default: false)
     * @returns {Promise<boolean>} when resolved true if the animation was displayed, false if not.
     */
    showForRoll(roll, user = game.user, synchronize, users = null, blind, messageID = null, speaker = null, options = { ghost: false, secret: false }) {
        let context = {
            roll: roll,
            user: user,
            users: users,
            blind: blind
        };

        if (options.ghost) {
            context.roll.ghost = true;
        }

        if (options.secret) {
            context.roll.secret = true;
        }

        //If the showForRoll method was called directly from the API, we didn't get the chance to retrieve a roll appearance
        const applyAppearance = (roll) => {
            if (roll.rolls) { // Is PoolTerm
                roll.rolls.forEach(applyAppearance);
            } else if (roll.options?.appearance) { // Is Roll with appearance
                roll.dice.forEach(diceTerm => {
                    if (!diceTerm.options)
                        diceTerm.options = {};
                    if (!diceTerm.options.appearance)
                        diceTerm.options.appearance = {};
                    diceTerm.options.appearance = foundry.utils.mergeObject(diceTerm.options.appearance, roll.options.appearance);
                });
            }
        };
        applyAppearance(context.roll);

        if (speaker) {
            let actor = game.actors.get(speaker.actor);
            const isNpc = actor ? !actor.hasPlayerOwner : false;
            if (isNpc && game.settings.get("dice-so-nice", "hideNpcRolls")) {
                return Promise.resolve(false);
            }
        }

        if (Dice3D.CONFIG().onlyShowOwnDice && user !== game.user) {
            return Promise.resolve(false);
        }

        let chatMessage = game.messages.get(messageID);
        if (chatMessage) {
            const hide3dDiceOnSecretRolls = game.settings.get("dice-so-nice", "hide3dDiceOnSecretRolls");
            if (chatMessage.whisper.length > 0 && hide3dDiceOnSecretRolls)
                context.roll.secret = true;
            if (!chatMessage.isContentVisible && hide3dDiceOnSecretRolls)
                context.roll.ghost = true;
        }


        Hooks.callAll("diceSoNiceRollStart", messageID, context);
        //We allow the hook to modify the roll to be shown without altering the original roll reference
        //This is useful for example to show a different roll than the one made by the user without relying on the manual showForRoll method
        let hookedRoll = context.dsnRoll || context.roll;
        let notation = new DiceNotation(hookedRoll, Dice3D.ALL_CONFIG(user), user);
        return this.show(notation, context.user, synchronize, context.users, context.blind);
    }

    /**
     * Show the 3D Dice animation based on data configuration made by the User.
     *
     * @param data data containing the dice info.
     * @param user the user who made the roll (game.user by default).
     * @param synchronize
     * @param users list of users or userId who can see the roll, leave it empty if everyone can see.
     * @param blind if the roll is blind for the current user
     * @returns {Promise<boolean>} when resolved true if the animation was displayed, false if not.
     */
    show(data, user = game.user, synchronize = false, users = null, blind) {
        return new Promise((resolve, reject) => {

            if (!data.throws) throw new Error("Roll data should be not null");

            if (!data.throws.length || !this.isEnabled()) {
                resolve(false);
            } else {
                if (synchronize) {
                    users = users && users.length > 0 ? (users[0]?.id ? users.map(user => user.id) : users) : users;
                    game.socket.emit("module.dice-so-nice", { type: "show", data: data, user: user.id, users: users });
                }

                if (!blind) {
                    if (document.hidden) {
                        this.hiddenAnimationQueue.push({
                            data: data,
                            config: Dice3D.ALL_CUSTOMIZATION(user, this.DiceFactory),
                            timestamp: (new Date()).getTime(),
                            resolve: resolve
                        });
                    } else {
                        this._showAnimation(data, Dice3D.ALL_CUSTOMIZATION(user, this.DiceFactory)).then(displayed => {
                            resolve(displayed);
                        });
                    }
                } else {
                    resolve(false);
                }
            }
            if (game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")) {
                resolve();
            }
        });
    }

    /**
     * Change the default value of the showExtraDice settings
     * @param {Boolean} show 
     */
    showExtraDiceByDefault(show = true) {
        this.defaultShowExtraDice = show;
    }

    /**
     * enableDebugMode
     */
    enableDebugMode() {
        if(this.box)
            this.box.debugMode = true;
    }

    /**
     * Helper function to detect the end of a 3D animation for a message
     * @param {ChatMessage.ID} targetMessageId 
     * @returns Promise<boolean>
     */
    waitFor3DAnimationByMessageID(targetMessageId) {
        function buildHook(resolve) {
            Hooks.once('diceSoNiceRollComplete', (messageId) => {
                if (targetMessageId === messageId)
                    resolve(true);
                else
                    buildHook(resolve)
            });
        }
        return new Promise((resolve, reject) => {
            if (game.dice3d && Dice3D.CONFIG().enabled && !game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")) {
                buildHook(resolve);
            } else {
                resolve(true);
            }
        });
    }


    /**
     * Add the 3D Dice animation to the Accumulator based on data configuration made by the User.
     *
     * @param notation 
     * @param dsnConfig
     * @returns {Promise<boolean>}
     * @private
     */
    _showAnimation(notation, dsnConfig) {
        notation.dsnConfig = dsnConfig;
        return new Promise((resolve, reject) => {
            this.nextAnimation.addItem({
                params: notation,
                resolve: resolve
            });
        });
    }

    /**
     * Initializes the animation queue system.
     * Sets up an empty queue array for managing dice roll animations
     * and initializes a Promise to track the current animation state.
     * 
     * @private
     */
    _startQueueHandler() {
        this.queue = [];
        this._currentAnimation = Promise.resolve();
    }


    /**
     * Processes the queue of dice animations recursively.
     * Each animation in the queue is executed one at a time in sequence.
     * Once an animation is complete, it moves on to the next one if available.
     *
     * @private
     * @returns {Promise<void>} Resolves when all queued animations are complete
     */
    async _processQueue() {
        if (this.queue.length === 0) return;

        const animate = this.queue.shift();
        await animate();

        // If there are more animations, process the next one
        if (this.queue.length > 0) {
            await this._processQueue();
        }
    }

    /**
     * Initializes and handles the animation queue system for dice rolls.
     * This method sets up an Accumulator to manage multiple dice roll animations,
     * potentially allowing for simultaneous rolls based on game settings.
     *
     * @private
     * @returns {Promise<void>} A promise that resolves when the animation handler is initialized
     */
    async _nextAnimationHandler() {
        const timing = game.settings.get("dice-so-nice", "enabledSimultaneousRolls") ? 400 : 0;

        this.nextAnimation = new Accumulator(timing, async (items) => {
            // If dice are disabled or queue is too long, resolve all items as false
            if (!this.isEnabled() || this.queue.length >= 10) {
                items.forEach(item => item.resolve(false));
                return;
            }

            // Merge multiple roll commands into a single command array
            const commands = DiceNotation.mergeQueuedRollCommands(items);
            let remainingAnimations = commands.length;

            // Chain the animations using promises
            this._currentAnimation = this._currentAnimation.then(async () => {
                // Process each dice throw command
                for (const diceThrow of commands) {
                    this.queue.push(() => new Promise(async (resolve) => {
                        this._beforeShow();
                        await this.box.start_throw(diceThrow, () => {
                            remainingAnimations--;
                            // When all animations are complete, resolve items and cleanup
                            if (remainingAnimations === 0) {
                                items.forEach(item => item.resolve(true));
                                this._afterShow();
                            }
                            resolve();
                        });
                    }));
                }
                return this._processQueue();
            });

            await this._currentAnimation;
        });
    }

    /**
     *
     * @private
     */
    _beforeShow() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
        }
        this.canvas.stop(true);
        this.canvas.show();
    }

    /**
     *
     * @private
     */
    _afterShow() {
        if (Dice3D.CONFIG().hideAfterRoll) {
            if (DiceSFXManager.renderQueue.length) {
                clearTimeout(this.timeoutHandle);
                return;
            } else {
                this.timeoutHandle = setTimeout(() => {
                    if (!this.box.rolling) {
                        const hasPersistentDice = this.box.persistentDiceList.length > 0;
                        if (Dice3D.CONFIG().hideFX === 'none') {
                            if (!hasPersistentDice) {
                                this.canvas.hide();
                            }
                            this.box.clearAll();
                        }
                        if (Dice3D.CONFIG().hideFX === 'fadeOut') {
                            if (hasPersistentDice) {
                                //just clear ephemeral dice, keep canvas visible
                                this.box.clearAll();
                            } else {
                                this.canvas.fadeOut({
                                    duration: 1000,
                                    complete: () => {
                                        this.box.clearAll();
                                    },
                                    fail: () => {
                                        this.canvas.fadeIn(0);
                                    }
                                });
                            }
                        }
                    }
                }, Dice3D.CONFIG().timeBeforeHide);
            }
        }
    }

    /**
     * Spawn a persistent die on the tabletop.
     */
    async spawnPersistentDie(type, position = null, opts = {}, synchronize = true) {
        const user = opts.ownerUserId ? game.users.get(opts.ownerUserId) : game.user;
        //raw appearances for socket sync and flag persistence
        const rawAppearances = opts._rawAppearances || Dice3D.APPEARANCE(user);
        const appearance = opts.appearance || this.DiceFactory.getAppearanceForDice(rawAppearances, type);
        const diceLibrary = opts.diceLibrary ?? DiceLibrary.getLibraryForUser(user);
        this._beforeShow();
        const mesh = await this.box.spawnPersistentDie(type, appearance, position, diceLibrary, opts);
        if (mesh && synchronize) {
            this._emitPersistentEvent("create", {
                data: {
                    persistentId: mesh.userData.persistentId,
                    dieType: type,
                    positionPct: position || this._toPositionPct(
                        mesh.parent.position.x,
                        mesh.parent.position.y
                    ),
                    linkGroupId: opts.linkGroupId || null,
                    linkGroupSecondary: opts.linkGroupSecondary || false,
                    appearances: rawAppearances,
                    diceLibrary: diceLibrary
                }
            });
        }
        if (mesh && mesh.userData.ownerUserId === game.user?.id) {
            this._persistentDiceData.set(mesh.userData.persistentId, {
                persistentId: mesh.userData.persistentId,
                dieType: type,
                appearances: rawAppearances,
                diceLibrary,
                linkGroupId: opts.linkGroupId || null,
                linkGroupSecondary: opts.linkGroupSecondary || false
            });
            this._savePersistentDiceToFlags();
        }
        return mesh;
    }

    /**
     * Set persistent dice visibility mode (not persisted across reloads)
     */
    setPersistentDiceVisibility(mode) {
        this.box?.setPersistentDiceVisibility(mode);
    }

    /**
     * Remove a persistent die from the tabletop.
     */
    async removePersistentDie(persistentId, synchronize = true) {
        const wasLocal = this._persistentDiceData.has(persistentId);
        await this.box.removePersistentDie(persistentId);
        if (this.box.persistentDiceList.length === 0 && !this.box.rolling) {
            this._afterShow();
        }
        if (synchronize) {
            this._emitPersistentEvent("remove", {
                data: { persistentId }
            });
        }
        if (wasLocal) {
            this._persistentDiceData.delete(persistentId);
            this._savePersistentDiceToFlags();
        }
    }

    /**
     * Clear persistent dice. Pass { ownerUserId } to limit to one user.
     */
    async clearPersistentDice(opts = {}, synchronize = true) {
        await this.box.clearPersistentDice(opts);
        if (!this.box.rolling) {
            this._afterShow();
        }
        if (synchronize) {
            this._emitPersistentEvent("clear", {
                data: { ownerUserId: opts.ownerUserId || null }
            });
        }
        //update local tracking if we cleared our own dice
        const clearedLocal = !opts.ownerUserId || opts.ownerUserId === game.user?.id;
        if (clearedLocal) {
            this._persistentDiceData.clear();
            this._savePersistentDiceToFlags();
        }
    }

    /**
     * Remove selected persistent dice (respects ownership).
     */
    async removeSelectedPersistentDice() {
        //collect ids before removal for socket messages
        const removedPids = [];
        for (const mesh of this.box.persistentDiceList) {
            if (this.box.selectedPersistentDiceIds.has(mesh.id)) {
                removedPids.push(mesh.userData.persistentId);
                //include link-group siblings
                if (mesh.userData.linkGroupId) {
                    for (const other of this.box.persistentDiceList) {
                        if (other.userData.linkGroupId === mesh.userData.linkGroupId
                            && !removedPids.includes(other.userData.persistentId)) {
                            removedPids.push(other.userData.persistentId);
                        }
                    }
                }
            }
        }
        const n = await this.box.removeSelectedPersistentDice();
        if (!this.box.rolling && this.box.persistentDiceList.length === 0) {
            this._afterShow();
        }
        let localChanged = false;
        for (const pid of removedPids) {
            this._emitPersistentEvent("remove", { data: { persistentId: pid } });
            if (this._persistentDiceData.delete(pid)) localChanged = true;
        }
        if (localChanged) this._savePersistentDiceToFlags();
        return n;
    }

    //"move" uses volatile delivery, everything else reliable
    _emitPersistentEvent(type, data) {
        const msg = { type: `persistent-${type}`, user: game.user.id, ...data };
        if (type === "move") {
            game.socket.volatile.emit("module.dice-so-nice", msg);
        } else {
            game.socket.emit("module.dice-so-nice", msg);
        }
    }

    _findPersistentMeshById(persistentId) {
        return this.box.persistentDiceList.find(
            m => m.userData.persistentId === persistentId
        ) || null;
    }

    _toPositionPct(worldX, worldY) {
        return this.box.toPositionPct(worldX, worldY);
    }

    _fromPositionPct(pct) {
        return this.box.fromPositionPct(pct);
    }

    async _handlePersistentMessage(request) {
        if (!request.data) return;
        switch (request.type) {
            case "persistent-create": return this._onRemotePersistentCreate(request);
            case "persistent-remove": return this._onRemotePersistentRemove(request);
            case "persistent-clear": return this._onRemotePersistentClear(request);
            case "persistent-pickup": return this._onRemotePersistentPickup(request);
            case "persistent-move": return this._onRemotePersistentMove(request);
            case "persistent-release": return this._onRemotePersistentRelease(request);
            case "persistent-preroll": return this._onRemotePersistentPreroll(request);
            case "persistent-throw": return this._onRemotePersistentThrow(request);
        }
    }

    _cleanupDisconnectedUser(userId) {
        let changed = false;
        for (const mesh of this.box.persistentDiceList) {
            if (mesh.userData?.lockedBy === userId) {
                delete mesh.userData.lockedBy;
                delete mesh.userData.remotePreRoll;
                delete mesh.userData.preRollRates;
                delete mesh.userData.remoteMoveTarget;
                changed = true;
            }
        }
        if (changed) {
            this.box.updateSelectionOutlines();
        }
        this.box.removeRemoteOutlinePass(userId);
    }

    //save local user's persistent dice to flags
    _savePersistentDiceToFlags() {
        if (!game.user || this._restoringDice) return;
        const data = Array.from(this._persistentDiceData.values());
        game.user.setFlag("dice-so-nice", "persistentDice", data);
    }

    //restore a user's persistent dice from flags
    async _restorePersistentDiceFromFlags(userId, synchronize = false) {
        const user = game.users.get(userId);
        if (!user) return;
        const saved = user.getFlag("dice-so-nice", "persistentDice");
        if (!Array.isArray(saved) || saved.length === 0) return;

        if (userId !== game.user?.id) {
            DiceLibrary.preloadAssets(userId);
            this.DiceFactory.preloadPresets(false, userId);
        }

        const count = saved.length;
        for (let i = 0; i < count; i++) {
            const entry = saved[i];
            const x = (i + 1) / (count + 1);
            const y = 0.85;
            const appearances = entry.appearances || Dice3D.APPEARANCE(user);
            const appearance = this.DiceFactory.getAppearanceForDice(appearances, entry.dieType);
            await this.spawnPersistentDie(entry.dieType, { x, y }, {
                ownerUserId: userId,
                remotePersistentId: entry.persistentId,
                appearance,
                _rawAppearances: appearances,
                diceLibrary: entry.diceLibrary,
                linkGroupId: entry.linkGroupId || null,
                linkGroupSecondary: entry.linkGroupSecondary || false
            }, synchronize);
        }
    }

    //restore all connected users' persistent dice
    async _restoreAllPersistentDice() {
        //wait for DiceBox to finish initializing (materials, renderer, etc.)
        if (this._boxReady) await this._boxReady;
        this._restoringDice = true;
        try {
            for (const user of game.users) {
                if (!user.active) continue;
                await this._restorePersistentDiceFromFlags(user.id, user.id === game.user?.id);
            }
        } finally {
            this._restoringDice = false;
        }
    }

    async _onRemotePersistentCreate(request) {
        const { persistentId, dieType, positionPct, linkGroupId, linkGroupSecondary, appearances, diceLibrary } = request.data;
        const user = game.users.get(request.user);
        if (!user) return;

        //skip if already restored from flags
        if (this._findPersistentMeshById(persistentId)) return;

        DiceLibrary.preloadAssets(request.user);
        this.DiceFactory.preloadPresets(false, request.user);

        const resolvedAppearance = this.DiceFactory.getAppearanceForDice(
            appearances || Dice3D.APPEARANCE(user), dieType
        );

        await this.spawnPersistentDie(dieType, positionPct, {
            ownerUserId: request.user,
            remotePersistentId: persistentId,
            linkGroupId,
            linkGroupSecondary,
            appearance: resolvedAppearance,
            _rawAppearances: appearances,
            diceLibrary
        }, false);
    }

    async _onRemotePersistentRemove(request) {
        const { persistentId } = request.data;
        await this.removePersistentDie(persistentId, false);
    }

    async _onRemotePersistentClear(request) {
        const { ownerUserId } = request.data;
        await this.clearPersistentDice(ownerUserId ? { ownerUserId } : {}, false);
    }

    _onRemotePersistentPickup(request) {
        const { persistentIds } = request.data;
        if (!Array.isArray(persistentIds)) return;
        for (const pid of persistentIds) {
            const mesh = this._findPersistentMeshById(pid);
            if (mesh) mesh.userData.lockedBy = request.user;
        }
        this.box.updateSelectionOutlines();
    }

    _onRemotePersistentMove(request) {
        const { positions } = request.data;
        if (!Array.isArray(positions)) return;
        //store target position, render loop lerps toward it
        for (const entry of positions) {
            if (!entry?.persistentId) continue;
            const mesh = this._findPersistentMeshById(entry.persistentId);
            if (!mesh) continue;
            //ignore late-arriving moves for already-released dice
            if (!mesh.userData?.lockedBy) continue;
            const world = this._fromPositionPct(entry);
            mesh.userData.remoteMoveTarget = { x: world.x, y: world.y };
        }
    }

    _onRemotePersistentRelease(request) {
        const { persistentIds } = request.data;
        if (!Array.isArray(persistentIds)) return;
        for (const pid of persistentIds) {
            const mesh = this._findPersistentMeshById(pid);
            if (!mesh) continue;
            delete mesh.userData.lockedBy;
            delete mesh.userData.remotePreRoll;
            delete mesh.userData.preRollRates;
            delete mesh.userData.remoteMoveTarget;
        }
        this.box.updateSelectionOutlines();
    }

    _onRemotePersistentPreroll(request) {
        const { persistentIds } = request.data;
        if (!Array.isArray(persistentIds)) return;
        const rate = () => (Math.random() < 0.5 ? -1 : 1) * (6.3 + Math.random() * 1.8);
        for (const pid of persistentIds) {
            const mesh = this._findPersistentMeshById(pid);
            if (!mesh) continue;
            mesh.userData.remotePreRoll = true;
            //random rotation rates for pre-roll animation
            mesh.userData.preRollRates = {
                x: rate(),
                y: rate(),
                zAmp: 0.35,
                zFreq: 1.2 + Math.random() * 0.4,
                t: 0
            };
        }
    }

    async _onRemotePersistentThrow(request) {
        const { velocityPct, results } = request.data;
        if (!Array.isArray(results) || !velocityPct) return;

        //look up local meshes and map forced results
        const heldDice = [];
        const forcedByMesh = new Map();
        for (const entry of results) {
            const mesh = this._findPersistentMeshById(entry.persistentId);
            if (!mesh) continue;
            heldDice.push(mesh);
            forcedByMesh.set(mesh, entry.forcedResult);
            //unlock and clear pre-roll state
            delete mesh.userData.lockedBy;
            delete mesh.userData.remotePreRoll;
            delete mesh.userData.preRollRates;
            delete mesh.userData.remoteMoveTarget;
        }
        if (heldDice.length === 0) return;

        this.box.updateSelectionOutlines();
        this._beforeShow();

        //convert velocity from pct to world units
        const velocity = {
            x: velocityPct.x * this.box.display.innerWidth,
            y: velocityPct.y * this.box.display.innerHeight,
            z: velocityPct.z || 0
        };

        //thrower's SFX config for remote playback
        const throwerUser = game.users.get(request.user);
        const sfxList = throwerUser ? Dice3D.ALL_CUSTOMIZATION(throwerUser).specialEffects || [] : [];

        //simulate + face swap with pre-determined results
        await this.box.replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList);
    }
}