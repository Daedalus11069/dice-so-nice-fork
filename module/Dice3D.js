import { DiceFactory } from './engine/DiceFactory.js';
import { DiceBox } from './rendering/DiceBox.js';
import { DiceColors, TEXTURELIST, COLORSETS } from './engine/DiceColors.js';
import { DiceNotation } from './DiceNotation.js';
import { DiceSFXManager } from './sfx/DiceSFXManager.js';
import { Accumulator } from './Accumulator.js';
import { Utils } from './Utils.js';
import { ThinFilmFresnelMap } from './libs/ThinFilmFresnelMap.js';
import { TextureLoader } from 'three';
import { DiceTourMain } from './tours/DiceTourMain.js';
import { DiceSFX } from './sfx/DiceSFX.js';
import { DiceSystem } from './DiceSystem.js';
import { DiceLibrary } from './engine/DiceLibrary.js';
import { InitiativeMask } from './ui/InitiativeMask.js';
import { CompanionLink } from './CompanionLink.js';
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
                quality.advancedGlass = false;
                break;
            case 1:
                quality.bumpMapping = true;
                quality.shadowQuality = "low";
                quality.glow = false;
                quality.antialiasing = "none";
                quality.useHighDPI = false;
                quality.imageQuality = "medium";
                quality.persistentDiceOutlines = false;
                quality.advancedGlass = false;
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
                quality.advancedGlass = true;
                break;
        }
        return {
            visibility: "all",
            showExtraDice: game.dice3d && game.dice3d.hasOwnProperty("defaultShowExtraDice") ? game.dice3d.defaultShowExtraDice : false,
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
            canvasZIndex: 'auto',
            throwingForce: 'medium',
            useHighDPI: quality.useHighDPI,
            antialiasing: quality.antialiasing,
            glow: quality.glow,
            persistentDiceOutlines: quality.persistentDiceOutlines,
            advancedGlass: quality.advancedGlass,
            ambiance: "blouberg_sunrise_2_1k",
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
        let options = foundry.utils.mergeObject(Dice3D.DEFAULT_OPTIONS, { appearance: Dice3D.DEFAULT_APPEARANCE(user) }, { applyOperators: true });
        options.appearance.global.system = game.dice3d.DiceFactory.preferredSystem;
        options.appearance.global.colorset = game.dice3d.DiceFactory.preferredColorset;
        return options;
    }

    static CONFIG(user = game.user) {
        let userSettings = user.getFlag("dice-so-nice", "settings") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "settings")) : {};
        let config = foundry.utils.mergeObject(Dice3D.DEFAULT_OPTIONS, userSettings, { applyOperators: true });
        delete config.appearance;
        delete config.sfxLine;
        return config;
    }

    static APPEARANCE(user = game.user, actor = null) {
        let userAppearance = user.getFlag("dice-so-nice", "appearance") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "appearance")) : {};
        let appearance = foundry.utils.mergeObject(Dice3D.DEFAULT_APPEARANCE(user), userAppearance, { applyOperators: true });
        delete appearance.dimensions;
        if (actor) {
            let actorAppearance = actor.getFlag("dice-so-nice", "appearance");
            if (actorAppearance) {
                actorAppearance = foundry.utils.duplicate(actorAppearance);
                appearance = foundry.utils.mergeObject(appearance, actorAppearance, { applyOperators: true });
            }
        }
        return Utils.sanitizeAppearance(appearance, user);
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
    static ALL_CUSTOMIZATION(user = game.user, dicefactory = null, actor = null) {
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
        let config = foundry.utils.mergeObject({ appearance: Dice3D.APPEARANCE(user, actor) }, { specialEffects: specialEffects }, { applyOperators: true });
        if (dicefactory && !user.getFlag("dice-so-nice", "appearance") && !actor?.getFlag("dice-so-nice", "appearance")) {
            if (dicefactory.preferredSystem != "standard")
                config.appearance.global.system = dicefactory.preferredSystem;
            if (dicefactory.preferredColorset != "custom")
                config.appearance.global.colorset = dicefactory.preferredColorset;
        }
        config.diceLibrary = DiceLibrary.getLibraryForUser(user);
        return config;
    }

    static ALL_CONFIG(user = game.user, actor = null) {
        let ret = foundry.utils.mergeObject(Dice3D.CONFIG(user), { appearance: Dice3D.APPEARANCE(user, actor) }, { applyOperators: true });
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
     * Force preload of every dice preset registered under a given system id.
     * Useful for systems/modules that register internal dice presets that
     * users may never select in their appearance settings - without this,
     * those presets load lazily on the first roll and cause visible lag.
     *
     * Call this once after registering your presets (typically from the
     * `diceSoNiceReady` hook).
     *
     * @param {String} systemId - Id of the system whose presets should be preloaded
     * @returns {Promise<void>}
     */
    async preloadPresets(systemId) {
        await this.DiceFactory.forceLoadPresets(systemId);
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
        colorset = foundry.utils.mergeObject(defaultValues, colorset, { applyOperators: true });
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
            await this._preloadActorDocuments();
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

    async _preloadActorDocuments() {
        let preloadList = game.settings.get("dice-so-nice", "documentsForPreload");
        if (!preloadList?.length) return;

        let cleaned = false;
        const validUuids = [];
        for (const uuid of preloadList) {
            const doc = foundry.utils.fromUuidSync(uuid);
            if (!doc) {
                cleaned = true;
                continue;
            }
            validUuids.push(uuid);
            await DiceLibrary.preloadAssets(null, uuid);
            await this.DiceFactory.preloadPresets(false, null, {}, uuid);
        }

        if (cleaned && game.user.isGM) {
            await game.settings.set("dice-so-nice", "documentsForPreload", validUuids);
        }
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

        this.canvas = $(`<div id="dice-box-canvas" style="position: absolute; left: ${area.left}px; top: ${area.top}px; pointer-events: none;"></div>`);
        if (config.canvasZIndex === "over") {
            this.canvas.css("z-index", 1000);
            this.canvas.appendTo($('body'));
        } else if (config.canvasZIndex === "auto") {
            this.canvas.css("z-index", 0);
            this.canvas.appendTo($('body'));
        } else {
            $("#board").after(this.canvas);
        }
        this.canvas.width(area.width + 'px');
        this.canvas.height(area.height + 'px');
    }

    _isAutoMode() {
        return Dice3D.CONFIG().canvasZIndex === 'auto';
    }

    _raiseCanvas() {
        if (!this._isAutoMode()) return;
        const maxZ = foundry.applications?.api?.ApplicationV2?._maxZ;
        if (maxZ == null) {
            this.canvas[0].style.zIndex = 1000;
        } else {
            this.canvas[0].style.zIndex = ++foundry.applications.api.ApplicationV2._maxZ;
        }
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
        this.box.onQueueThrow = (throwData) => this._showPersistentThrow(throwData);
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
                        this.show(request.data, game.users.get(request.user), false, null, false, request.speaker);
                    break;
                case "update":
                    if (request.document) {
                        DiceLibrary.preloadAssets(null, request.document);
                        this.DiceFactory.preloadPresets(false, null, {}, request.document);
                        if (game.user.isGM) {
                            let preloadList = game.settings.get("dice-so-nice", "documentsForPreload");
                            if (!preloadList.includes(request.document)) {
                                preloadList = [...preloadList, request.document];
                                game.settings.set("dice-so-nice", "documentsForPreload", preloadList);
                            }
                        }
                    } else {
                        if (request.user == game.user.id || Dice3D.CONFIG().showOthersSFX)
                            DiceSFXManager.init();
                        if (request.user != game.user.id) {
                            DiceLibrary.preloadAssets(request.user);
                            this.DiceFactory.preloadPresets(false, request.user);
                        }
                    }
                    break;
                case "gmPush":
                    //GM overwrote my flags - reload my own state so new config takes effect without a reload
                    if (request.targets && request.targets.includes(game.user.id)) {
                        DiceSFXManager.init();
                        this.update(Dice3D.CONFIG());
                        ui.notifications.info(game.i18n.localize("DICESONICE.GMPushReceived"));
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
                if (this.box.persistentDiceList.length === 0) {
                    this.canvas.hide();
                }
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
                    if (this._isAutoMode()) {
                        const el = document.elementFromPoint(event.clientX, event.clientY);
                        const win = el?.closest('.window-app, .application');
                        if (win && foundry.applications?.api?.ApplicationV2?._maxZ != null) {
                            win.style.zIndex = ++foundry.applications.api.ApplicationV2._maxZ;
                        }
                    }
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
        return Dice3D.CONFIG().visibility !== "none" && combatEnabled;
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
     * Add metadata to dice with roll dependencies (ie 1d(1d4)) so they can be sorted into the same bucket and
     * rolled after their dependencies resolve, without dragging those dependencies into the same bucket and causing them to roll together.
     */
    _assignDependentRollOrder(rolls) {
        const DiceTerm = foundry.dice.terms.DiceTerm;
        const RollClass = foundry.dice.Roll;
        const ParentheticalTerm = foundry.dice.terms.ParentheticalTerm;
        const PoolTerm = foundry.dice.terms.PoolTerm;
        const FunctionTerm = foundry.dice.terms.FunctionTerm;

        //collect the immediate dice contained in a roll-term subtree without descending
        //into die _number/_faces
        const collectTopDice = (term, out) => {
            if (!term) return;
            if (term instanceof DiceTerm) { out.push(term); return; }
            if (term instanceof ParentheticalTerm && term.roll) {
                for (const t of term.roll.terms ?? []) collectTopDice(t, out);
                return;
            }
            if ((term instanceof PoolTerm || term instanceof FunctionTerm) && term.rolls) {
                for (const r of term.rolls)
                    for (const t of r.terms ?? []) collectTopDice(t, out);
            }
        };

        //recursively visit a die: mark inner dependency dice and return this die depth
        const visitDie = (die) => {
            let innerMax = -1;
            for (const sub of [die._number, die._faces]) {
                if (sub instanceof RollClass) {
                    const innerDice = [];
                    for (const t of sub.terms ?? []) collectTopDice(t, innerDice);
                    for (const innerDie of innerDice) {
                        if (!innerDie.options) innerDie.options = {};
                        innerDie.options.dsnDependentBucket = true;
                        const d = visitDie(innerDie);
                        if (d > innerMax) innerMax = d;
                    }
                }
            }
            const myDepth = innerMax + 1;
            if (!die.options) die.options = {};
            if (myDepth > 0) die.options.dsnDependentBucket = true;
            if (die.options.dsnDependentBucket) {
                //compose with any pre-existing rollOrder
                const existing = die.options.hasOwnProperty("rollOrder") ? die.options.rollOrder : 0;
                die.options.rollOrder = existing + myDepth;
            }
            return myDepth;
        };

        for (const roll of rolls ?? []) {
            const tops = [];
            for (const t of roll.terms ?? []) collectTopDice(t, tops);
            for (const die of tops) visitDie(die);
        }
    }

    /**
     * Returns a die with _number/_faces Roll dependencies that have been collapsed to their primitive values.
     * Returns the original die unchanged when no dependencies are present.
     */
    _stripDependencyRolls(die) {
        const RollClass = foundry.dice.Roll;
        if (!(die._number instanceof RollClass) && !(die._faces instanceof RollClass)) return die;
        //shallow clone preserving prototype so instanceof checks (Die / DiceTerm) still pass
        const clone = Object.assign(Object.create(Object.getPrototypeOf(die)), die);
        clone.options = { ...die.options };
        if (die._number instanceof RollClass) clone._number = die.number;
        if (die._faces instanceof RollClass) clone._faces = die.faces;
        return clone;
    }

    /**
     * Parse, sort and add the dice animation to the queue for a chat message and an array of Roll
     * Used internally by the message Hooks. Not meant to be used outside of the module.
     * Please use the showForRoll method instead.
     * @param {ChatMessage} chatMessage
     * @param {Array<Roll>} rolls
     */
    renderRolls(chatMessage, rolls) {
        //sequence dependent dice like (1d4)d6 so the inner roll resolves before the outer one spawns
        this._assignDependentRollOrder(rolls);

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

            InitiativeMask.release(chatMessage.id);

            chatMessage._dice3dPendingRenders = (chatMessage._dice3dPendingRenders || 1) - 1;
            let companionIds = [];
            if (chatMessage._dice3dPendingRenders <= 0) {
                chatMessage._dice3dPendingRenders = 0;
                companionIds = CompanionLink.release(chatMessage.id);
            }

            Hooks.callAll("diceSoNiceRollComplete", chatMessage.id, companionIds);

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
                    //dependent dice (parenthetical expressions like (1d4)d6) always sequence,
                    //even when the user has the simultaneous-rolls setting enabled
                    const dependentBucket = diceTerm.options?.dsnDependentBucket;
                    const sequentialEnabled = !game.settings.get("dice-so-nice", "enabledSimultaneousRollForMessage");
                    if (diceTerm.options?.hasOwnProperty("rollOrder") && (dependentBucket || sequentialEnabled)) {
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

                    //backfill damage type from roll options so term-level detection catches it
                    //per-term values always win over whole-roll values
                    if (roll.options?.type || roll.options?.flavor) {
                        if (!diceTerm.options) diceTerm.options = {};
                        if (!diceTerm.options.type && roll.options.type)
                            diceTerm.options.type = roll.options.type;
                        if (!diceTerm.options.flavor && roll.options.flavor)
                            diceTerm.options.flavor = roll.options.flavor;
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
                    //strip dependency rolls from each die so the per-bucket Roll's flat .dice
                    //list contains only this bucket's dice - otherwise a (1d4)d6 d6 in bucket 1
                    //would re-render the d4 alongside it via Roll.dice's recursive walk
                    const cleanDice = dice.map(this._stripDependencyRolls);
                    let termList = [...cleanDice].map((e, i) => i < cleanDice.length - 1 ? [e, plus] : [e]).reduce((a, b) => a.concat(b));
                    //We use the Roll class registered in the CONFIG constant in case the system overwrites it (eg: HeXXen)
                    rollList.push(CONFIG.Dice.rolls[0].fromTerms(termList));
                }
            });

            //call each promise one after the other, then call the showMessage function
            const recursShowForRoll = (rollList, index) => {
                let author = chatMessage.author;
                const ownerAppearanceSetting = game.settings.get("dice-so-nice", "forceCharacterOwnerAppearance");
                const shouldResolveOwner = ownerAppearanceSetting === "2"
                    || (ownerAppearanceSetting === "1" && chatMessage.getFlag("core", "initiativeRoll"));
                if (shouldResolveOwner && chatMessage.speaker) {
                    const actor = game.actors.get(chatMessage.speaker.actor);
                    if (actor && actor.hasPlayerOwner) {
                        //get the user from game.users
                        let ownerUser = game.users.find(user => !user.isGM && user.character?.id == actor.id);
                        if (!ownerUser) {
                            //if we could not find a player user, we try to find a player owner, if and only if the actor only has a single player owner (but can have multiple GMs)
                            const ownership = { ...actor.ownership }; //ie {"default": 0,"Q1Qcc8RRRcvG6QjE": 3}
                            if (ownership.default != CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) { //Check that the default isn't Owner
                                //now get all the owners that are not GMs nor the default
                                delete ownership.default;
                                const playerOwners = Object.keys(ownership).filter(key => game.users.get(key) && !game.users.get(key).isGM);
                                //if there is only one player owner
                                if (playerOwners.length == 1) {
                                    ownerUser = game.users.get(playerOwners[0]);
                                }
                            }
                        }
                        if (ownerUser) author = ownerUser;
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
                return;
            }
            if (roll.options?.appearance) { // Is Roll with appearance
                roll.dice.forEach(diceTerm => {
                    if (!diceTerm.options)
                        diceTerm.options = {};
                    if (!diceTerm.options.appearance)
                        diceTerm.options.appearance = {};
                    diceTerm.options.appearance = foundry.utils.mergeObject(diceTerm.options.appearance, roll.options.appearance);
                });
            }
            //backfill damage type from roll options so term-level detection catches it
            if (roll.options?.type || roll.options?.flavor) {
                roll.dice.forEach(diceTerm => {
                    if (!diceTerm.options) diceTerm.options = {};
                    if (!diceTerm.options.type && roll.options.type)
                        diceTerm.options.type = roll.options.type;
                    if (!diceTerm.options.flavor && roll.options.flavor)
                        diceTerm.options.flavor = roll.options.flavor;
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

        if (Dice3D.CONFIG().visibility === "mine" && user !== game.user) {
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
        let actor = speaker?.actor ? game.actors.get(speaker.actor) : null;
        let notation = new DiceNotation(hookedRoll, Dice3D.ALL_CONFIG(user, actor), user);
        return this.show(notation, context.user, synchronize, context.users, context.blind, speaker);
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
    show(data, user = game.user, synchronize = false, users = null, blind, speaker = null) {
        return new Promise((resolve, reject) => {

            if (!data.throws) throw new Error("Roll data should be not null");

            if (!data.throws.length || !this.isEnabled()) {
                resolve(false);
            } else {
                let actor = speaker?.actor ? game.actors.get(speaker.actor) : null;

                if (synchronize) {
                    users = users && users.length > 0 ? (users[0]?.id ? users.map(user => user.id) : users) : users;
                    game.socket.emit("module.dice-so-nice", { type: "show", data: data, user: user.id, users: users, speaker: speaker });
                }

                if (!blind) {
                    if (window.document.hidden) {
                        this.hiddenAnimationQueue.push({
                            data: data,
                            config: Dice3D.ALL_CUSTOMIZATION(user, this.DiceFactory, actor),
                            timestamp: (new Date()).getTime(),
                            resolve: resolve
                        });
                    } else {
                        this._showAnimation(data, Dice3D.ALL_CUSTOMIZATION(user, this.DiceFactory, actor)).then(displayed => {
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
            if (game.dice3d && Dice3D.CONFIG().visibility !== "none" && !game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")) {
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

    _showPersistentThrow(throwData) {
        const idle = this.queue.length === 0 && !this.box.running;
        return new Promise((resolve) => {
            this.nextAnimation.addItem({
                type: "persistent",
                params: throwData,
                resolve: resolve
            }, { immediate: idle });
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
            if (!this.isEnabled() || this.queue.length >= 10) {
                items.forEach(item => item.resolve(false));
                if (this.box.inputHandler) this.box.inputHandler.clearPendingThrowDice();
                return;
            }

            //partition items by type
            const ephemeralItems = items.filter(i => i.type !== "persistent");
            const persistentItems = items.filter(i => i.type === "persistent");

            const commands = ephemeralItems.length > 0 ? DiceNotation.mergeQueuedRollCommands(ephemeralItems) : [];
            const flatThrows = commands.flat();

            //merge persistent items into a single throwData for the unified batch
            let mergedPersistentData = null;
            if (persistentItems.length > 0) {
                const allHeldDice = [];
                const mergedForcedByMesh = new Map();
                let roll = null, primaries = null, sfxList = [];
                for (const item of persistentItems) {
                    const p = item.params;
                    allHeldDice.push(...p.heldDice);
                    for (const [mesh, val] of p.forcedByMesh) {
                        mergedForcedByMesh.set(mesh, val);
                    }
                    if (!roll && p.roll) { roll = p.roll; primaries = p.primaries; }
                    if (p.sfxList) sfxList.push(...p.sfxList);
                }
                mergedPersistentData = {
                    heldDice: allHeldDice,
                    velocity: persistentItems[0].params.velocity,
                    forcedByMesh: mergedForcedByMesh,
                    roll,
                    primaries,
                    sfxList: sfxList.length > 0 ? sfxList : undefined
                };
            }

            if (flatThrows.length === 0 && !mergedPersistentData) {
                items.forEach(item => item.resolve(false));
                return;
            }

            this._currentAnimation = this._currentAnimation.then(async () => {
                this.queue.push(() => new Promise(async (resolve) => {
                    this._beforeShow();
                    await this.box.startUnifiedBatch(flatThrows, mergedPersistentData, () => {
                        items.forEach(item => item.resolve(true));
                        this._afterShow();
                        resolve();
                    });
                }));

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
        this.box.cancelFade();
        this.canvas.stop(true);
        this.canvas.show();
        this._raiseCanvas();
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
                                this.box.fadeOutEphemeral(1000);
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
                        mesh.parent.position.z
                    ),
                    linkGroupId: opts.linkGroupId || null,
                    linkGroupSecondary: opts.linkGroupSecondary || false,
                    digitPlace: opts.digitPlace ?? null,
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
                linkGroupSecondary: opts.linkGroupSecondary || false,
                digitPlace: opts.digitPlace ?? null
            });
            this._savePersistentDiceToFlags();
        }
        return mesh;
    }

    async setVisibility(mode) {
        if (mode !== "all" && mode !== "mine" && mode !== "none") return;
        const settings = game.user.getFlag("dice-so-nice", "settings") || {};
        await game.user.setFlag("dice-so-nice", "settings", { ...settings, visibility: mode });
        this.box?.applyVisibility(mode);
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
     * Dismiss all ephemeral (non-persistent) dice currently on the board.
     * If a roll is still animating, the replay is fast-forwarded to its end
     * so the natural finalization path runs - which fires result events,
     * runs SFX init, and reveals the chat message - before the dice are cleared.
     * Persistent dice are left untouched.
     * @returns {Promise<boolean>} true if something was dismissed, false otherwise.
     */
    async dismissEphemeralDice() {
        const box = this.box;
        if (!box) return false;

        //a roll in flight needs to finalize naturally so the chat message reveal fires
        if (box.rolling) {
            const engine = box.throwEngine;
            //push iteration past throwFinished's threshold - next animateThrow tick
            //will run fireResultEvents => handleSpecialEffectsInit => callback => rolling=false
            engine.iteration = Math.max(engine.iterationsNeeded || 0, engine.minIterations || 0) + 1;
            await new Promise(resolve => {
                const poll = () => {
                    if (!box.rolling) resolve();
                    else requestAnimationFrame(poll);
                };
                poll();
            });
        }

        const engine = box.throwEngine;
        const hasEphemeral = (engine?.diceList?.length > 0) || (engine?.deadDiceList?.length > 0);
        if (!hasEphemeral) return false;

        await box.clearAll();
        if (box.persistentDiceList.length === 0 && this.canvas?.is(":visible")) {
            this.canvas.hide();
        }
        return true;
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
        const removedPids = await this.box.removeSelectedPersistentDice();
        if (!this.box.rolling && this.box.persistentDiceList.length === 0) {
            this._afterShow();
        }
        let localChanged = false;
        for (const pid of removedPids) {
            this._emitPersistentEvent("remove", { data: { persistentId: pid } });
            if (this._persistentDiceData.delete(pid)) localChanged = true;
        }
        if (localChanged) this._savePersistentDiceToFlags();
        return removedPids.size;
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

    _toPositionPct(worldX, worldZ) {
        return this.box.toPositionPct(worldX, worldZ);
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

    async _cleanupDisconnectedUser(userId) {
        const lockedMeshes = [];
        for (const mesh of this.box.persistentDiceList) {
            if (mesh.userData?.lockedBy === userId) {
                delete mesh.userData.lockedBy;
                delete mesh.userData.remotePreRoll;
                delete mesh.userData.preRollRates;
                delete mesh.userData.remoteMoveTarget;
                delete mesh.userData.remoteMoveSmoothed;
                delete mesh.userData.pendingReplay;
                lockedMeshes.push(mesh);
            }
        }
        if (lockedMeshes.length > 0) {
            await this.box.persistentDiceManager.removeRemoteConstraints(lockedMeshes);
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
                linkGroupSecondary: entry.linkGroupSecondary || false,
                digitPlace: entry.digitPlace ?? null
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
        const { persistentId, dieType, positionPct, linkGroupId, linkGroupSecondary, digitPlace, appearances, diceLibrary } = request.data;
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
            digitPlace: digitPlace ?? null,
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

    async _onRemotePersistentPickup(request) {
        const { persistentIds, grabTime: remoteGrabTime } = request.data;
        if (!Array.isArray(persistentIds)) return;

        //yield locally-held dice that the remote player is picking up,
        //but only if the remote grab wins the tiebreak (earlier timestamp,
        //or lower user ID on exact tie). this prevents cross-deadlocks when
        //two players grab the same die simultaneously.
        const inputHandler = this.box.inputHandler;
        if (inputHandler) {
            const locallyHeldIds = [];
            for (const pid of persistentIds) {
                const mesh = this._findPersistentMeshById(pid);
                if (!mesh?.userData?.constrained) continue;
                const localTime = mesh.userData.localGrabTime || 0;
                const remoteTime = remoteGrabTime || 0;
                const remoteWins = remoteTime < localTime
                    || (remoteTime === localTime && request.user < game.user.id);
                if (remoteWins) {
                    locallyHeldIds.push(mesh.id);
                }
            }
            if (locallyHeldIds.length > 0) {
                await inputHandler.yieldHeldDice(locallyHeldIds);
            }
        }

        const meshes = [];
        for (const pid of persistentIds) {
            const mesh = this._findPersistentMeshById(pid);
            if (!mesh) continue;
            //skip dice the local player won the tiebreak for
            if (mesh.userData?.constrained) continue;
            mesh.userData.lockedBy = request.user;
            meshes.push(mesh);
        }
        this.box.updateSelectionOutlines();
        if (meshes.length > 0) {
            await this.box.persistentDiceManager.addRemoteConstraints(meshes);
        }
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
            mesh.userData.remoteMoveTarget = { x: world.x, z: world.z };
        }
    }

    async _onRemotePersistentRelease(request) {
        const { persistentIds } = request.data;
        if (!Array.isArray(persistentIds)) return;
        const meshes = [];
        for (const pid of persistentIds) {
            const mesh = this._findPersistentMeshById(pid);
            if (!mesh) continue;
            delete mesh.userData.lockedBy;
            delete mesh.userData.remotePreRoll;
            delete mesh.userData.preRollRates;
            delete mesh.userData.remoteMoveTarget;
            meshes.push(mesh);
        }
        await this.box.persistentDiceManager.removeRemoteConstraints(meshes);
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
            //block interaction until the queued replay actually starts
            mesh.userData.pendingReplay = true;
        }
        if (heldDice.length === 0) return;

        await this.box.persistentDiceManager.removeRemoteConstraints(heldDice);
        this.box.updateSelectionOutlines();

        //convert velocity from pct to world units
        const velocity = {
            x: velocityPct.x * this.box.display.innerWidth,
            y: velocityPct.y * this.box.display.innerHeight,
            z: velocityPct.z || 0
        };

        //thrower's SFX config for remote playback
        const throwerUser = game.users.get(request.user);
        const sfxList = throwerUser ? Dice3D.ALL_CUSTOMIZATION(throwerUser).specialEffects || [] : [];

        //route through queue for serialized execution
        await this.box.replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList);
    }
}