import { Dice3D } from '../Dice3D.js';
import { DiceScene } from '../engine/DiceScene.js';
import { DiceSFXManager } from '../sfx/DiceSFXManager.js';
import { SFXFormulaMatcher } from '../sfx/SFXFormulaMatcher.js';
import { ShowcaseView } from '../rendering/ShowcaseView.js';
import { Utils } from '../Utils.js';
import { DiceNotation, COMPOUND_DICE } from '../DiceNotation.js';
import { DiceColors, DICE_SCALE } from '../engine/DiceColors.js';
import { AMBIANCE_LIST } from '../engine/DiceFactory.js';
import { DiceSystem } from '../DiceSystem.js';
import { DiceLibrary } from '../engine/DiceLibrary.js';
import { DiceLibraryDialog } from './DiceLibraryDialog.js';
import { DiceEditor } from './DiceEditor.js';
import SlimSelect from 'slim-select';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Form application to configure settings of the 3D Dice.
 */
export class DiceConfig extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["dice-so-nice"],
        form: {
            handler: DiceConfig._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        window: {
            contentClasses: ["standard-form"]
        },
        id: "dice-config",
        position: {
            width: 680,
            height: "auto"
        },
        actions: {
            resetActor: DiceConfig._onResetActor
        }
    };

    constructor(options = {}) {
        super(options);
        this.document = options.document ?? game.user;
        this.isUser = this.document instanceof User;
        this.isActor = this.document instanceof Actor;
    }

    get title() {
        if (this.isActor) {
            return `${game.i18n.localize("DICESONICE.configTitle")} - ${this.document.name}`;
        }
        return game.i18n.localize("DICESONICE.configTitle");
    }

    get id() {
        if (this.isActor) return `dice-config-${this.document.id}`;
        return "dice-config";
    }

    static TABS = {
        "dsn-main": {
            tabs: [
                { id: "general", icon: "fa-solid fa-dice-d20", label: "DICESONICE.settingsAppearance" },
                { id: "preferences", icon: "fa-solid fa-cog", label: "DICESONICE.settingsPreferences" },
                { id: "sfx", icon: "fa-solid fa-meteor", label: "DICESONICE.settingsSpecialEffects" },
                { id: "performance", icon: "fa-solid fa-desktop", label: "DICESONICE.settingsDisplay" },
                { id: "data", icon: "fa-solid fa-database", label: "DICESONICE.settingsProfilesData" }
            ],
            initial: "general"
        },
        "dsn-dice": {
            tabs: [{ id: "global", label: "Global" }],
            initial: "global"
        }
    };

    static PARTS = {
        tabs: {
            template: "templates/generic/tab-navigation.hbs",
        },
        general: {
            template: "modules/dice-so-nice/templates/dice-config-general.hbs",
            scrollable: [""]
        },
        preferences: {
            template: "modules/dice-so-nice/templates/dice-config-preferences.hbs",
            scrollable: [""]
        },
        sfx: {
            template: "modules/dice-so-nice/templates/dice-config-sfx.hbs",
            scrollable: [""]
        },
        performance: {
            template: "modules/dice-so-nice/templates/dice-config-performance.hbs",
            scrollable: [""]
        },
        data: {
            template: "modules/dice-so-nice/templates/dice-config-data.hbs",
            scrollable: [""]
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        context.tab = context.tabs[partId];
        if (partId === "data") {
            context.isGM = game.user.isGM;
        }
        return context;
    }

    _configureRenderParts(options) {
        const parts = super._configureRenderParts(options);
        if (this.isActor) {
            for (const key of Object.keys(parts)) {
                if (!["general", "footer"].includes(key)) {
                    delete parts[key];
                }
            }
        }
        return parts;
    }

    async _prepareContext(options) {
        let data = foundry.utils.mergeObject({
            fxList: Utils.localize({
                "none": "DICESONICE.None",
                "fadeOut": "DICESONICE.FadeOut"
            }),
            speedList: Utils.localize({
                "1": "DICESONICE.NormalSpeed",
                "2": "DICESONICE.2xSpeed",
                "3": "DICESONICE.3xSpeed"
            }),
            textureList: Utils.prepareTextureList(),
            materialList: Utils.localize({
                "auto": "DICESONICE.MaterialAuto",
                "chrome": "DICESONICE.MaterialChrome",
                "glass": "DICESONICE.MaterialGlass",
                "iridescent": "DICESONICE.MaterialIridescent",
                "metal": "DICESONICE.MaterialMetal",
                "plastic": "DICESONICE.MaterialPlastic",
                "pristine": "DICESONICE.MaterialPristine",
                "stone": "DICESONICE.MaterialStone",
                "wood": "DICESONICE.MaterialWood"
            }),
            fontList: Utils.prepareFontList(),
            colorsetList: Utils.prepareColorsetList(),
            imageQualityList: Utils.localize({
                "low": "DICESONICE.Low",
                "medium": "DICESONICE.Medium",
                "high": "DICESONICE.High",
                "custom": "DICESONICE.Custom"
            }),
            shadowQualityList: Utils.localize({
                "none": "DICESONICE.None",
                "low": "DICESONICE.Low",
                "medium": "DICESONICE.Medium",
                "high": "DICESONICE.High"
            }),
            antialiasingList: Utils.localize({
                "none": "DICESONICE.None",
                "smaa": "DICESONICE.SMAA",
                "msaa": "DICESONICE.MSAA"
            }),
            systemList: Utils.prepareSystemList(),
            soundsSurfaceList: Utils.localize({
                "felt": "DICESONICE.SurfaceFelt",
                "wood_table": "DICESONICE.SurfaceWoodTable",
                "wood_tray": "DICESONICE.SurfaceWoodTray",
                "metal": "DICESONICE.SurfaceMetal"
            }),
            ambianceList: Utils.localize(AMBIANCE_LIST),
            canvasZIndexList: Utils.localize({
                "auto": "DICESONICE.CanvasZIndexAuto",
                "over": "DICESONICE.CanvasZIndexOver",
                "under": "DICESONICE.CanvasZIndexUnder",
            }),
            throwingForceList: Utils.localize({
                "weak": "DICESONICE.ThrowingForceWeak",
                "medium": "DICESONICE.ThrowingForceMedium",
                "strong": "DICESONICE.ThrowingForceStrong"
            }),
            spawnLocationList: Utils.localize({
                "center": "DICESONICE.SpawnCenter",
                "topLeft": "DICESONICE.SpawnTopLeft",
                "topRight": "DICESONICE.SpawnTopRight",
                "bottomLeft": "DICESONICE.SpawnBottomLeft",
                "bottomRight": "DICESONICE.SpawnBottomRight"
            }),
            visibilityList: Utils.localize({
                "all": "DICESONICE.visibilityAll",
                "mine": "DICESONICE.visibilityMine",
                "none": "DICESONICE.visibilityNone"
            })
        },
            this.reset ? Dice3D.ALL_DEFAULT_OPTIONS() : Dice3D.ALL_CONFIG(game.user, this.isActor ? this.document : null)
        );
        delete data.sfxLine;

        data.isUser = this.isUser;

        //remove MSAA if not supported
        if (game.canvas.app.renderer.context.webGLVersion < 2) {
            delete data.antialiasingList.msaa;
        }

        //fix corupted save from #139
        if (data.specialEffects) {
            for (let [key, value] of Object.entries(data.specialEffects)) {
                if (Array.isArray(value.diceType) || Array.isArray(value.onResult) || Array.isArray(value.specialEffect))
                    delete data.specialEffects[key];
            }
        }

        this.canvas = document.createElement("div");
        this.canvas.id = "dice-configuration-canvas";
        this.diceFactory = game.dice3d.box.dicefactory;
        let config = foundry.utils.mergeObject(
            this.reset ? Dice3D.ALL_DEFAULT_OPTIONS() : Dice3D.ALL_CONFIG(game.user, this.isActor ? this.document : null),
            { dimensions: { width: 634, height: 245 }, autoscale: false, scale: 60 }
        );

        this.diceScene = new DiceScene(this.canvas, this.diceFactory, {
            rendererCacheKey: "showcase",
            dimensions: config.dimensions,
            scale: config.scale,
            autoscale: config.autoscale
        });
        await this.diceScene.initialize();
        this.diceFactory.setQualitySettings(config);
        this.diceScene.setupBloomPipeline();

        this.showcaseView = new ShowcaseView(this.diceScene, this.diceFactory);
        this.showcaseView.showExtraDice = config.showExtraDice;

        if (!game.user.getFlag("dice-so-nice", "appearance") && !this.document.getFlag("dice-so-nice", "appearance")) {
            if (this.diceFactory.preferredSystem != "standard")
                config.appearance.global.system = this.diceFactory.preferredSystem;
            if (this.diceFactory.preferredColorset != "standard")
                config.appearance.global.colorset = this.diceFactory.preferredColorset;
        }
        config.diceLibrary = DiceLibrary.getLibraryForUser(game.user);
        await this.showcaseView.showcase(config);

        this.navOrder = {};
        let triggerTypeList = [{ id: "", name: "" }];
        this.possibleResultList = {};
        let i = 0;
        const sfxExcludedCompound = new Set(
            Object.entries(COMPOUND_DICE).filter(([k]) => parseInt(k) > 100).map(([, places]) => places[0].type)
        );
        this.showcaseView.diceList.forEach((el) => {
            this.navOrder[el.userData] = i++;
            if (!sfxExcludedCompound.has(el.userData)) {
                triggerTypeList.push({ id: el.userData, name: el.userData });
                this.possibleResultList[el.userData] = [];
                let preset = this.diceFactory.systems.get("standard").dice.get(el.userData);
                let termClass = Object.values(CONFIG.Dice.terms).find(term => term.name == preset.term) || foundry.dice.terms.Die;
                let term = new termClass({});

                if (el.userData == "d100") {
                    for (let i = 1; i <= 100; i++) {
                        let label = term.getResultLabel({ result: i });
                        let option = { id: i + "", name: label };
                        this.possibleResultList[el.userData].push(option);
                    }
                } else {
                    preset.values.forEach((value) => {
                        let label = term.getResultLabel({ result: value });
                        let option = { id: value + "", name: label };
                        this.possibleResultList[el.userData].push(option);
                    });
                }

                this.possibleResultList[el.userData].push({ id: "kh", name: "Keep Highest / Advantage" });
                this.possibleResultList[el.userData].push({ id: "kl", name: "Keep Lowest / Disadvantage" });
                this.possibleResultList[el.userData].push({ id: "dh", name: "Drop Highest" });
                this.possibleResultList[el.userData].push({ id: "dl", name: "Drop Lowest" });
                this.possibleResultList[el.userData].push({ id: "cs", name: "Counting Success" });
                this.possibleResultList[el.userData].push({ id: "cf", name: "Counting Failure" });
                this.possibleResultList[el.userData].push({ id: "x", name: "Exploded" });
                this.possibleResultList[el.userData].push({ id: "r", name: "Rerolled" });
            }
        });

        let specialEffectsList = [];
        let specialEffectsPromises = [];
        let specialEffects = Dice3D.SFX();
        if (this.reset)
            specialEffects = [];
        this.triggerTypeList = [...triggerTypeList, ...DiceSFXManager.EXTRA_TRIGGER_TYPE];
        foundry.utils.mergeObject(this.possibleResultList, DiceSFXManager.EXTRA_TRIGGER_RESULTS, { applyOperators: true });

        //Filter out the SFX that are not registered (skip advanced entries, they have no diceType)
        if (specialEffects) {
            let registeredTriggerTypes = this.triggerTypeList.map(trigger => trigger.id);
            specialEffects = specialEffects.filter(sfx => sfx.mode === 'advanced' || registeredTriggerTypes.includes(sfx.diceType));
        }

        if (specialEffects) {
            specialEffects.forEach((sfx, index) => {
                let sfxClass = DiceSFXManager.SFX_MODE_CLASS[sfx.specialEffect];
                if (!sfxClass) return;
                let dialogContent = sfxClass.getDialogContent(sfx, index);
                let hdbsTemplate = Handlebars.compile(dialogContent.content);
                const isAdvanced = sfx.mode === 'advanced';

                specialEffectsPromises.push(foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.hbs", {
                    id: index,
                    isAdvanced: isAdvanced,
                    formula: isAdvanced ? (sfx.formula || '') : '',
                    diceType: sfx.diceType,
                    onResult: sfx.onResult,
                    specialEffect: sfx.specialEffect,
                    specialEffectsMode: DiceSFXManager.SFX_MODE_LIST,
                    triggerTypeList: this.triggerTypeList,
                    possibleResultList: this.possibleResultList[sfx.diceType],
                    options: hdbsTemplate(dialogContent.data)
                }).then((html) => {
                    specialEffectsList.push(html);
                }));
            });
            await Promise.all(specialEffectsPromises);
        }
        data.specialEffectsList = specialEffectsList.join("");

        const tabsList = [];
        const systemSettingsScoped = {};
        for (let scope in data.appearance) {
            if (data.appearance.hasOwnProperty(scope)) {
                tabsList.push(scope);
                if (scope != "global") {
                    if (!data.appearance[scope].labelColor)
                        data.appearance[scope].labelColor = data.appearance.global.labelColor;
                    if (!data.appearance[scope].diceColor)
                        data.appearance[scope].diceColor = data.appearance.global.diceColor;
                    if (!data.appearance[scope].outlineColor)
                        data.appearance[scope].outlineColor = data.appearance.global.outlineColor;
                    if (!data.appearance[scope].edgeColor)
                        data.appearance[scope].edgeColor = data.appearance.global.edgeColor;
                }

                if (this.diceFactory.systems.has(data.appearance[scope].system)) {
                    const system = this.diceFactory.systems.get(data.appearance[scope].system);

                    if (system.settings.length > 0) {
                        const dialogContent = system.getSettingsDialogContent(scope);

                        if (dialogContent.content != "") {
                            const hdbsTemplate = Handlebars.compile(dialogContent.content);
                            systemSettingsScoped[scope] = hdbsTemplate(dialogContent.data);
                        }
                    }
                }
            }
        }

        let tabsAppearance = [];
        let tabsPromises = [];
        data.navAppearance = {};
        tabsList.forEach((diceType) => {
            const isPerDie = diceType !== "global";
            let libraryDiceGroups = [];
            if(isPerDie) {
                libraryDiceGroups = DiceLibrary.buildLibraryDiceGroups(diceType, data.appearance[diceType]);
            }
            tabsPromises.push(foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-appearance.hbs", {
                dicetype: diceType,
                appearance: data.appearance[diceType],
                systemList: data.systemList,
                colorsetList: data.colorsetList,
                textureList: data.textureList,
                materialList: data.materialList,
                fontList: data.fontList,
                showLibrary: isPerDie && DiceLibrary.getFullDieTypes().includes(diceType),
                libraryDiceGroups: libraryDiceGroups,
                systemSettings: systemSettingsScoped.hasOwnProperty(diceType) ? systemSettingsScoped[diceType] : '',
                systemSettingsVisible: systemSettingsScoped.hasOwnProperty(diceType) ? '' : 'dsn-hidden'
            }).then((html) => {
                //We add a "title" attribute to all colorsets to give a way to users to see the colorset id
                //However the FVTT Hdlb helper does not provide such functionnality so we have to do it ourselves
                html = this.addTitleToOptions(html, '[data-colorset] option');

                tabsAppearance.push(html);
            }));
            if (diceType != "global")
                data.navAppearance[diceType] = diceType.toUpperCase();
        });
        await Promise.all(tabsPromises);

        if (tabsAppearance.length > 1)
            data.displayHint = "style='display:none;'";
        else
            data.displayHint = '';

        data.tabsAppearance = tabsAppearance.join("");

        this.lastActiveAppearanceTab = "global";

        this.initializationData = data;
        this.currentGlobalAppearance = data.appearance.global;
        this.sfxDialogList = [];
        this.systemSettingsDialogList = [];

        this.slimSelectInstances = new Map();

        data.tabs = this._prepareTabs("dsn-main");
        data.appearanceTabs = this._prepareTabs("dsn-dice");

        data.buttons = [
            { type: "submit", icon: "fa-solid fa-save", label: "DICESONICE.Save" },
            { type: "button", action: "test", icon: "fa-solid fa-dice", label: "DICESONICE.TestRoll" },
            { type: "button", action: "close", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel" }
        ];

        if (this.isActor) {
            data.buttons.unshift({ type: "button", action: "resetActor", icon: "fa-solid fa-undo", label: "DICESONICE.Reset" });
        }

        return data;
    }

    addTitleToOptions(htmlString, selectorString) {
        // Initialize a DOMParser to parse the HTML string
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        // Select all <option> elements within elements that have the 'data-colorset' attribute
        const options = doc.querySelectorAll(selectorString);

        // Iterate over each <option> and set its 'title' attribute to its 'value'
        options.forEach(option => {
            // Ensure the 'value' attribute exists
            if (option.hasAttribute('value')) {
                const value = option.getAttribute('value');
                option.setAttribute('title', value);
            }
        });

        // Serialize the modified DOM back to an HTML string
        return doc.documentElement.outerHTML;
    }

    _onRender(context, options) {
        this.changeTab(this.tabGroups["dsn-dice"], "dsn-dice", { force: true });

        this.element.querySelector("#dice-configuration-canvas-container").append(this.canvas);

        if (this.isUser) {
            this.toggleHideAfterRoll();
            this.toggleAutoScale();
        }
        this.toggleCustomization();
        this.filterSystems();
        this.setPreferredOptions();

        this._initSlimSelects();

        if (!this.reset) {
            this.element.addEventListener("change", (ev) => {
                const target = ev.target;
                if (target.matches("[data-showExtraDice]")) {
                    this.onApply(ev);
                } else if (target.matches("[data-hideAfterRoll]")) {
                    this.toggleHideAfterRoll(ev);
                } else if (target.matches("[data-sounds]")) {
                    this.toggleSounds(ev);
                } else if (target.matches("[data-autoscale]")) {
                    this.toggleAutoScale(ev);
                } else if (target.matches("[data-colorset]")) {
                    this.toggleCustomColors(target.dataset.dicetype);
                } else if (target.matches("[data-libraryDie]")) {
                    this.toggleCustomization(target.dataset.dicetype);
                } else if (target.matches("[data-system]")) {
                    this.toggleCustomization(target.dataset.dicetype);
                    const systemSettingsContainer = target.closest(".tabAppearance").querySelector("[data-systemsettings-hidden]");
                    systemSettingsContainer.innerHTML = "";
                    const system = this.diceFactory.systems.get(target.value);
                    const optionsBtn = target.nextElementSibling;
                    if (system.settings.length > 0) {
                        if (optionsBtn) optionsBtn.classList.remove("dsn-hidden");
                        const dialogContent = system.getSettingsDialogContent(target.dataset.dicetype);
                        if (dialogContent.content != "") {
                            const hdbsTemplate = Handlebars.compile(dialogContent.content);
                            systemSettingsContainer.insertAdjacentHTML("beforeend", hdbsTemplate(dialogContent.data));
                        }
                    } else {
                        if (optionsBtn) optionsBtn.classList.add("dsn-hidden");
                    }
                } else if (target.matches("[data-sfx-dicetype]")) {
                    let dicetype = target.value;
                    let selectEl = target.closest(".sfx-line").querySelector("[data-sfx-result]");
                    if (!selectEl) return;
                    selectEl.setAttribute("data-sfx-result-dicetype", dicetype);
                    let instance = this.slimSelectInstances.get(selectEl);
                    if (instance) {
                        instance.setData(dicetype !== "" ? this._buildSlimSelectOptions(dicetype) : []);
                    }
                    this.setPosition();
                } else if (target.matches("[data-sfx-specialeffect]")) {
                    this.sfxDialogList.forEach((dialog) => { dialog.close(); });
                    this.sfxDialogList = [];
                    let sfxLine = target.closest(".sfx-line");
                    let ID = Array.from(sfxLine.parentElement.querySelectorAll(".sfx-line")).indexOf(sfxLine);
                    let sfxClass = DiceSFXManager.SFX_MODE_CLASS[target.value];
                    let dialogContent = sfxClass.getDialogContent({}, ID);
                    let hdbsTemplate = Handlebars.compile(dialogContent.content);
                    sfxLine.querySelector(".sfx-hidden [data-sfx-hidden-options]").innerHTML = hdbsTemplate(dialogContent.data);
                } else if (target.matches("[data-imageQuality]")) {
                    let quality = {
                        bumpMapping: true, shadowQuality: "high", glow: true,
                        antialiasing: game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa",
                        useHighDPI: true, persistentDiceOutlines: true, advancedGlass: true
                    };
                    switch (target.value) {
                        case "low":
                            quality.bumpMapping = false; quality.shadowQuality = "low"; quality.glow = false;
                            quality.antialiasing = "none"; quality.useHighDPI = false;
                            quality.persistentDiceOutlines = false; quality.advancedGlass = false;
                            break;
                        case "medium":
                            quality.bumpMapping = true; quality.shadowQuality = "medium"; quality.glow = false;
                            quality.antialiasing = "none"; quality.useHighDPI = false;
                            quality.persistentDiceOutlines = false; quality.advancedGlass = false;
                            break;
                        case "high":
                            quality.bumpMapping = true; quality.shadowQuality = "high"; quality.glow = true;
                            quality.antialiasing = game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa";
                            quality.useHighDPI = true; quality.persistentDiceOutlines = true; quality.advancedGlass = true;
                            break;
                    }
                    this.element.querySelector("[data-bumpMapping]").checked = quality.bumpMapping;
                    this.element.querySelector("[data-shadowQuality]").value = quality.shadowQuality;
                    this.element.querySelector("[data-glow]").checked = quality.glow;
                    this.element.querySelector("[data-antialiasing]").value = quality.antialiasing;
                    this.element.querySelector("[data-useHighDPI]").checked = quality.useHighDPI;
                    this.element.querySelector("[data-persistentDiceOutlines]").checked = quality.persistentDiceOutlines;
                    this.element.querySelector("[data-advancedGlass]").checked = quality.advancedGlass;
                } else if (target.matches("[data-bumpMapping],[data-shadowQuality],[data-glow],[data-antialiasing],[data-useHighDPI],[data-persistentDiceOutlines],[data-advancedGlass]")) {
                    this.element.querySelector("[data-imageQuality]").value = "custom";
                }

                if (target.matches("input,select") && target.closest('[data-tab="general"]')) {
                    this.onApply(ev);
                }
            });

            this.element.addEventListener("input", (ev) => {
                const target = ev.target;
                if (target.matches("[data-sfx-formula]")) {
                    const { valid, error } = SFXFormulaMatcher.validate(target.value);
                    const errorIcon = target.parentElement.querySelector("[data-sfx-formula-error]");
                    if (!valid && target.value.trim()) {
                        target.classList.add("sfx-formula-invalid");
                        if (errorIcon) {
                            errorIcon.classList.add("visible");
                            errorIcon.title = error || '';
                        }
                    } else {
                        target.classList.remove("sfx-formula-invalid");
                        if (errorIcon) {
                            errorIcon.classList.remove("visible");
                            errorIcon.title = '';
                        }
                    }
                }
            });

            this.element.addEventListener("click", (ev) => {
                const target = ev.target;
                let actionTarget;

                if (target.closest("[data-reset]")) {
                    this.onReset(ev);
                } else if (target.closest("[data-cancel]")) {
                    this.close();
                } else if (target.closest("[data-close-tab]")) {
                    let tabEl = target.closest("[data-close-tab]").parentElement;
                    this.closeAppearanceTab(tabEl.dataset.tab);
                } else if ((actionTarget = target.closest("[data-library-manage]"))) {
                    ev.preventDefault();
                    new DiceLibraryDialog({ diceType: actionTarget.dataset.dicetype, diceConfig: this }).render(true);
                } else if (target.closest("[data-action=test]")) {
                    let config = this.getShowcaseAppearance();
                    let denominationList = [];
                    const showcaseTypes = new Set(this.showcaseView.diceList.map(el => el.userData));
                    const compoundSubTypes = new Set();
                    for (const [, places] of Object.entries(COMPOUND_DICE)) {
                        if (showcaseTypes.has(places[0].type)) {
                            for (let p = 1; p < places.length; p++) {
                                if (!showcaseTypes.has(places[p].type) || !COMPOUND_DICE[parseInt(places[p].type.slice(1))])
                                    compoundSubTypes.add(places[p].type);
                            }
                        }
                    }
                    this.showcaseView.diceList.forEach((el) => {
                        if (!compoundSubTypes.has(el.userData))
                            denominationList.push(el.userData);
                    });
                    new Roll(denominationList.join("+")).evaluate().then((roll) => {
                        let data = new DiceNotation(roll);
                        let specialEffects = this.getShowcaseSFX();
                        let customization = foundry.utils.mergeObject({ appearance: config.appearance }, { specialEffects: specialEffects }, { applyOperators: true });
                        customization.diceLibrary = config.diceLibrary;
                        game.dice3d._showAnimation(data, customization);
                    });
                } else if (target.closest("[data-sfx-create]")) {
                    let ID = this.element.querySelectorAll(".sfx-line").length;
                    let firstSFX = Object.keys(DiceSFXManager.SFX_MODE_LIST)[0];
                    let sfxClass = DiceSFXManager.SFX_MODE_CLASS[firstSFX];
                    let dialogContent = sfxClass.getDialogContent({}, ID);
                    let hdbsTemplate = Handlebars.compile(dialogContent.content);
                    foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.hbs", {
                        id: ID, diceType: "", onResult: [], specialEffect: "",
                        isAdvanced: false,
                        specialEffectsMode: DiceSFXManager.SFX_MODE_LIST,
                        triggerTypeList: this.triggerTypeList, possibleResultList: [],
                        options: hdbsTemplate(dialogContent.data)
                    }).then((html) => {
                        this.element.querySelector("#sfxs-list").insertAdjacentHTML("beforeend", html);
                        this._initSlimSelects();
                        this.setPosition();
                    });
                } else if (target.closest("[data-sfx-mode-toggle]")) {
                    let sfxLine = target.closest(".sfx-line");
                    let currentMode = sfxLine.dataset.sfxMode || 'basic';
                    if (currentMode === 'basic') {
                        this._sfxToggleToAdvanced(sfxLine);
                    } else {
                        this._sfxToggleToBasic(sfxLine);
                    }
                } else if (target.closest("[data-sfx-delete]")) {
                    let sfxLine = target.closest(".sfx-line");
                    let selectEl = sfxLine.querySelector("[data-sfx-result]");
                    if (selectEl && this.slimSelectInstances.has(selectEl)) {
                        this.slimSelectInstances.get(selectEl).destroy();
                        this.slimSelectInstances.delete(selectEl);
                    }
                    sfxLine.remove();
                    this.element.querySelectorAll(".sfx-line").forEach((line, index) => {
                        line.querySelectorAll("input, select").forEach(input => {
                            let name = input.getAttribute("name");
                            input.setAttribute("name", name.replace(/(\w+\[)(\d+)(\]\[\w+\])/, "$1" + index + "$3"));
                        });
                    });
                    this.setPosition();
                } else if (target.closest("[data-sfx-options]")) {
                    let sfxLine = target.closest(".sfx-line");
                    let sfxLineOptions = sfxLine.querySelector("[data-sfx-hidden-options]");
                    if (!sfxLineOptions) return;

                    foundry.applications.api.DialogV2.wait({
                        classes: ["dice-so-nice"],
                        window: { title: "DICESONICE.Options", contentClasses: ["standard-form"] },
                        position: { width: 680 },
                        content: `<form class="standard-form" autocomplete="off" onsubmit="event.preventDefault();"></form>`,
                        buttons: [{ action: "ok", icon: "fa-solid fa-check-circle", label: "OK", default: true }],
                        render: (event, dialog) => {
                            dialog.element.querySelector(".dialog-content").append(sfxLineOptions);
                            this.activateDialogFilePicker(sfxLineOptions);
                            this.sfxDialogList.push(dialog);
                        },
                        close: (event, dialog) => {
                            sfxLine.querySelector(".sfx-hidden").append(sfxLineOptions);
                            this.sfxDialogList = this.sfxDialogList.filter(d => dialog.appId != d.appId);
                        }
                    });
                } else if (target.closest("[data-system-options]")) {
                    const tabAppearance = target.closest(".tabAppearance");
                    const systemSettingsContainer = tabAppearance.querySelector("[data-systemSettings-hidden]");
                    const systemSettingsElement = systemSettingsContainer.querySelector("[data-systemSettings]");
                    const systemSelected = tabAppearance.querySelector("[data-system]").value;
                    const systemName = this.diceFactory.systems.get(systemSelected).name;

                    foundry.applications.api.DialogV2.wait({
                        window: { title: `${game.i18n.localize("DICESONICE.SystemOptions")} - ${this.lastActiveAppearanceTab.charAt(0).toUpperCase()}${this.lastActiveAppearanceTab.slice(1)} - ${systemName}` },
                        position: { width: 550 },
                        content: `<form autocomplete="off" onsubmit="event.preventDefault();"></form>`,
                        buttons: [{ action: 'ok', icon: 'fa-solid fa-check', label: 'OK', default: true }],
                        render: (event, dialog) => {
                            this.systemSettingsDialogList.push(dialog);
                            dialog.element.querySelector("form").append(systemSettingsElement);
                            this.activateDialogListeners(dialog.element);
                        },
                        close: (event, dialog) => {
                            systemSettingsContainer.append(systemSettingsElement);
                            this.systemSettingsDialogList = this.systemSettingsDialogList.filter(d => dialog.appId != d.appId);
                            this.onApply();
                        }
                    });
                } else if (target.closest("[data-saveas]")) {
                    this._onSaveAs();
                } else if (target.closest("[data-load]")) {
                    this._onLoad();
                } else if (target.closest("[data-import]")) {
                    this._onImport();
                } else if (target.closest("[data-export]")) {
                    const filename = `fvtt-dicesonice-${Date.now()}.json`;
                    this.actionExportToJSON().then((json) => {
                        foundry.utils.saveDataToFile(json, "text/json", filename);
                    });
                } else if (target.closest("[data-exportSFX]")) {
                    const filename = `fvtt-dicesonice-SFX-${Date.now()}.json`;
                    this.actionExportSFXToJSON().then((json) => {
                        foundry.utils.saveDataToFile(json, "text/json", filename);
                    });
                } else if (target.closest("[data-exportLibrary]")) {
                    const filename = `fvtt-dicesonice-Library-${Date.now()}.json`;
                    const json = this.actionExportLibraryToJSON();
                    foundry.utils.saveDataToFile(json, "text/json", filename);
                } else if (target.closest("[data-gm-push]")) {
                    this._onGMPush();
                } else if (target.closest("#dice-configuration-canvas")) {
                    this._onCanvasClick(ev);
                }
            });
        }

        this.activateDialogListeners(this.element);
    }

    activateDialogFilePicker(el) {
        el.addEventListener("click", (event) => {
            const btn = event.target.closest("button.file-picker");
            if (!btn) return;
            const filePicker = foundry.applications.apps.FilePicker.fromButton(btn);
            filePicker.render(true);
        });
    }

    activateDialogListeners(el) {
        el.addEventListener("change", (event) => {
            const target = event.target;
            if (target.matches("input[type=range]")) {
                target.nextElementSibling.textContent = target.value;
            } else if (target.matches("span.range-value")) {
                target.previousElementSibling.value = target.textContent;
            } else if (target.matches("input[type=color]")) {
                target.previousElementSibling.value = target.value;
            } else if (target.matches("[data-colorpicker]")) {
                target.nextElementSibling.value = target.value;
            }
        });
    }

    async actionSaveAs(name) {
        await this.submit({
            preventClose: true,
            preventRender: true
        });

        Utils.actionSaveAs(name);
    }

    async actionDeleteSave(name) {
        await Utils.actionDeleteSave(name);
    }

    async actionLoadSave(name) {
        await Utils.actionLoadSave(name);
    }

    async actionExportToJSON() {

        //save current settings first
        await this.submit({
            preventClose: true,
            preventRender: true
        });

        //strip cross-user library die refs (not portable)
        const appearance = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "appearance") || {});
        for (const scope in appearance) {
            if (!appearance.hasOwnProperty(scope)) continue;
            if (appearance[scope]?.libraryDieOwner) {
                delete appearance[scope].libraryDieId;
                delete appearance[scope].libraryDieOwner;
            }
        }

        const saves = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "saves") || {});
        for (const saveName in saves) {
            if (!saves.hasOwnProperty(saveName)) continue;
            const saveAppearance = saves[saveName]?.appearance;
            if (!saveAppearance) continue;
            for (const scope in saveAppearance) {
                if (!saveAppearance.hasOwnProperty(scope)) continue;
                if (saveAppearance[scope]?.libraryDieOwner) {
                    delete saveAppearance[scope].libraryDieId;
                    delete saveAppearance[scope].libraryDieOwner;
                }
            }
        }

        let data = {
            appearance: appearance,
            sfxList: game.user.getFlag("dice-so-nice", "sfxList"),
            settings: game.user.getFlag("dice-so-nice", "settings"),
            saves: saves,
            diceLibrary: game.user.getFlag("dice-so-nice", "diceLibrary")
        };

        return JSON.stringify(data, null, 2);
    }

    async actionExportSFXToJSON() {

        //save current settings first
        await this.submit({
            preventClose: true,
            preventRender: true
        });
        let data = {
            sfxList: game.user.getFlag("dice-so-nice", "sfxList")
        };

        return JSON.stringify(data, null, 2);
    }

    actionExportLibraryToJSON() {
        return game.dice3d.diceLibrary.exportAll();
    }

    async actionImportFromJSON(json) {
        let data = JSON.parse(json);

        //library-only export
        if (data.dsnLibraryExport && Array.isArray(data.dice)) {
            await this._importLibraryDice(data.dice);
            return;
        }

        if (data.appearance) {
            await game.user.unsetFlag("dice-so-nice", "appearance");
            await game.user.setFlag("dice-so-nice", "appearance", data.appearance);
        }
        if (data.sfxList) {
            await game.user.unsetFlag("dice-so-nice", "sfxList");
            await game.user.setFlag("dice-so-nice", "sfxList", data.sfxList);
        }
        if (data.settings) {
            await game.user.unsetFlag("dice-so-nice", "settings");
            await game.user.setFlag("dice-so-nice", "settings", data.settings);
        }
        if (data.saves) {
            await game.user.unsetFlag("dice-so-nice", "saves");
            await game.user.setFlag("dice-so-nice", "saves", data.saves);
        }
        if (data.diceLibrary) {
            await this._importLibraryDice(data.diceLibrary);
        }
    }

    async actionGMPushConfig(parts) {
        if (!game.user.isGM) return;

        //collect the GM's current flag values once - offline users get written the same payload
        const payload = {};
        if (parts.appearance) {
            const appearance = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "appearance") || {});
            //strip cross-user library die refs - they point at the GM's library and won't resolve for other users
            for (const scope in appearance) {
                if (!appearance.hasOwnProperty(scope)) continue;
                if (appearance[scope]?.libraryDieOwner) {
                    delete appearance[scope].libraryDieId;
                    delete appearance[scope].libraryDieOwner;
                }
            }
            payload.appearance = appearance;
        }
        if (parts.sfxList) {
            payload.sfxList = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "sfxList") || []);
        }
        if (parts.settings) {
            payload.settings = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "settings") || {});
        }

        //write directly to each non-GM user's flags - works for offline users too, since GMs have permission
        const targets = game.users.filter(u => !u.isGM && u.id !== game.user.id);
        const pushedIds = [];
        for (const user of targets) {
            try {
                for (const key of Object.keys(payload)) {
                    await user.unsetFlag("dice-so-nice", key);
                    await user.setFlag("dice-so-nice", key, payload[key]);
                }
                pushedIds.push(user.id);
            } catch (err) {
                console.error(`[Dice So Nice] Failed to push config to ${user.name}:`, err);
            }
        }

        //notify connected targets so they reload their in-memory state without a page reload
        game.socket.emit("module.dice-so-nice", {
            type: "gmPush",
            user: game.user.id,
            targets: pushedIds
        });

        ui.notifications.info(game.i18n.format("DICESONICE.GMPushSuccess", { count: pushedIds.length }));
    }

    async _importLibraryDice(diceArray) {
        const { imported, skipped } = await game.dice3d.diceLibrary.importArray(diceArray);
        ui.notifications.info(game.i18n.format("DICESONICE.ImportLibrarySuccess", { count: imported, skipped: skipped }));
    }

    activateAppearanceTab(diceType) {
        this.changeTab(diceType, "dsn-dice");
    }

    closeAppearanceTab(diceType) {
        if (diceType == "global")
            return;

        if (this.tabGroups["dsn-dice"] == diceType)
            this.changeTab("global", "dsn-dice");

        this.element.querySelector(`.tabAppearance[data-tab="${diceType}"]`)?.remove();
        this.element.querySelector(`.dsn-appearance-tabs [data-tab="${diceType}"]`)?.remove();

        this.onApply();
    }

    changeTab(tab, group, { force=false } = {}) {
        super.changeTab(tab, group, { force });
        if (group == "dsn-dice") {
            if (this.lastActiveAppearanceTab != "global") {
                let appearanceArray = [];
                let systemSettingsElement = null;
                const tabs = this.element.querySelectorAll(`.tabAppearance[data-tab="global"],.tabAppearance[data-tab="${this.lastActiveAppearanceTab}"]`);
                tabs.forEach((element, index) => {
                    let obj = {
                        labelColor: element.querySelector("[data-labelColor]")?.value,
                        diceColor: element.querySelector("[data-diceColor]")?.value,
                        outlineColor: element.querySelector("[data-outlineColor]")?.value,
                        edgeColor: element.querySelector("[data-edgeColor]")?.value,
                        colorset: element.querySelector("[data-colorset]")?.value,
                        texture: element.querySelector("[data-texture]")?.value,
                        material: element.querySelector("[data-material]")?.value,
                        font: element.querySelector("[data-font]")?.value,
                        system: element.querySelector("[data-system]")?.value,
                        libraryDie: element.querySelector("[data-libraryDie]")?.value || ""
                    };
                    if (index == 1)
                        systemSettingsElement = element.querySelector("[data-systemSettings]");
                    if (obj.system == null) {
                        obj.system = this.currentGlobalAppearance.system;
                    }
                    appearanceArray.push(obj);
                });
                if (appearanceArray.length > 1) {
                    let hasDiff = false;
                    hasDiff = !foundry.utils.isEmpty(foundry.utils.diffObject(appearanceArray[0], appearanceArray[1]));

                    if (!hasDiff && systemSettingsElement) {
                        for (let setting of this.diceFactory.systems.get(appearanceArray[1].system).settings) {
                            let settingEl = systemSettingsElement.querySelector(`[name="systemSettings[${appearanceArray[1].system}][${setting.id}]"]`);
                            let value;
                            if (setting.type == DiceSystem.SETTING_TYPE.BOOLEAN) {
                                value = settingEl?.checked;
                            } else {
                                value = settingEl?.value;
                            }
                            if (value != setting.defaultValue) {
                                hasDiff = true;
                                break;
                            }
                        }
                    }

                    if (!hasDiff) {
                        this.closeAppearanceTab(this.lastActiveAppearanceTab)
                    }
                }
            }
            this.lastActiveAppearanceTab = tab;
        }
    }

    toggleHideAfterRoll() {
        let hideAfterRoll = this.element.querySelector("[data-hideAfterRoll]").checked;
        this.element.querySelector("[data-timeBeforeHide]").disabled = !hideAfterRoll;
        this.element.querySelector("[data-hideFX]").disabled = !hideAfterRoll;
    }

    toggleSounds() {
        let sounds = this.element.querySelector("[data-sounds]").checked;
        this.element.querySelector("[data-soundsSurface]").disabled = !sounds;
        this.element.querySelector("[data-soundsVolume]").disabled = !sounds;
    }

    toggleAutoScale() {
        let autoscale = this.element.querySelector("[data-autoscale]").checked;
        this.element.querySelector("[data-scale]").disabled = autoscale;
    }

    toggleCustomColors(dicetype) {
        let selector = ".tabAppearance";
        if (dicetype) selector += `[data-tab="${dicetype}"]`;
        this.element.querySelectorAll(selector).forEach(element => {
            const libraryDieVal = element.querySelector("[data-libraryDie]")?.value;
            if (libraryDieVal) return;

            let colorsetEl = element.querySelector("[data-colorset]");
            let disabled = colorsetEl.value !== "custom" || colorsetEl.disabled;
            for (const attr of ["data-labelColor", "data-diceColor", "data-outlineColor", "data-edgeColor",
                "data-labelColorSelector", "data-diceColorSelector", "data-outlineColorSelector", "data-edgeColorSelector"]) {
                const el = element.querySelector(`[${attr}]`);
                if (el) el.disabled = disabled;
            }
        });
    }

    toggleCustomization(diceType = null) {
        let selector = ".tabAppearance";
        if (diceType) selector += `[data-tab="${diceType}"]`;

        this.element.querySelectorAll(selector).forEach(element => {
            let dt = element.dataset.tab;
            if (dt != "global") {
                const libraryDieVal = element.querySelector("[data-libraryDie]")?.value;
                const allAppearanceControls = element.querySelectorAll("[data-colorset],[data-texture],[data-material],[data-font],[data-labelColor],[data-diceColor],[data-outlineColor],[data-edgeColor],[data-labelColorSelector],[data-diceColorSelector],[data-outlineColorSelector],[data-edgeColorSelector]");
                if (libraryDieVal) {
                    allAppearanceControls.forEach(el => el.disabled = true);
                    return;
                }

                let system = element.querySelector("[data-system]")?.value;
                let customizationElements = element.querySelectorAll("[data-colorset],[data-texture],[data-material],[data-font]");
                if (system != "standard") {
                    let diceobj = this.diceFactory.systems.get(system).dice.get(dt);
                    if (diceobj) {
                        let colorsetData = {};
                        if (diceobj.colorset) {
                            colorsetData = DiceColors.getColorSet(diceobj.colorset);
                        }
                        customizationElements.forEach(el => {
                            let colorsetForce = false;
                            if (el.matches("[data-colorset]") && !foundry.utils.isEmpty(colorsetData))
                                colorsetForce = true;
                            else if (el.matches("[data-texture]") && !foundry.utils.isEmpty(colorsetData) && colorsetData.texture != "custom")
                                colorsetForce = true;
                            else if (el.matches("[data-material]") && !foundry.utils.isEmpty(colorsetData) && colorsetData.material != "custom")
                                colorsetForce = true;
                            else if (el.matches("[data-font]") && ((!foundry.utils.isEmpty(colorsetData) && colorsetData.font != "custom") || diceobj.font))
                                colorsetForce = true;
                            el.disabled = diceobj.modelFile || colorsetForce;
                        });
                    }
                } else {
                    customizationElements.forEach(el => el.disabled = false);
                }
            }
        });
        this.toggleCustomColors(diceType);
    }

    filterSystems(diceType = null) {
        let selector = ".tabAppearance";
        if (diceType) selector += `[data-tab="${diceType}"]`;
        this.element.querySelectorAll(`${selector} [data-system]`).forEach(element => {
            let dt = element.dataset.dicetype;
            if (dt != "global") {
                element.querySelectorAll("option").forEach(opt => {
                    let model = this.diceFactory.systems.get("standard").dice.get(dt);
                    if (!this.diceFactory.systems.get(opt.value).dice.has(dt) || !this.diceFactory.systems.get(opt.value).getDiceByShapeAndValues(model.shape, model.values))
                        opt.disabled = true;
                });
            }
        });
    }

    setPreferredOptions() {
        if (!game.user.getFlag("dice-so-nice", "appearance") && !this.document.getFlag("dice-so-nice", "appearance")) {
            if (this.diceFactory.preferredSystem != "standard") {
                const el = this.element.querySelector('.tabAppearance[data-tab="global"] [data-system]');
                if (el) el.value = this.diceFactory.preferredSystem;
            }
            if (this.diceFactory.preferredColorset != "custom") {
                const el = this.element.querySelector('.tabAppearance[data-tab="global"] [data-colorset]');
                if (el) el.value = this.diceFactory.preferredColorset;
            }
        }
    }

    //"userId:dieId" => {libraryDieId, libraryDieOwner}
    static _parseLibraryDieValue(val) {
        if (!val) return {};
        if (val.includes(":")) {
            const [owner, id] = val.split(":", 2);
            return { libraryDieId: id, libraryDieOwner: owner };
        }
        return { libraryDieId: val };
    }

    getShowcaseAppearance() {
        let config;
        if (this.isActor) {
            let userConfig = Dice3D.ALL_CONFIG();
            config = foundry.utils.mergeObject(userConfig, {
                autoscale: false,
                scale: 60,
                appearance: {}
            });
        } else {
            const q = (sel) => this.element.querySelector(sel);
            config = {
                autoscale: false,
                scale: 60,
                shadowQuality: q("[data-shadowQuality]").value,
                imageQuality: q("[data-imageQuality]").value,
                antialiasing: q("[data-antialiasing]").value,
                bumpMapping: q("[data-bumpMapping]").checked,
                glow: q("[data-glow]").checked,
                sounds: q("[data-sounds]").checked,
                throwingForce: q("[data-throwingForce]").value,
                useHighDPI: q("[data-useHighDPI]").checked,
                advancedGlass: q("[data-advancedGlass]").checked,
                showExtraDice: q("[data-showExtraDice]").checked,
                muteSoundSecretRolls: q("[data-muteSoundSecretRolls]").checked,
                enableFlavorColorset: q("[data-enableFlavorColorset]").checked,
                immersiveDarkness: q("[data-immersiveDarkness]").checked,
                appearance: {}
            };
        }
        this.element.querySelectorAll(".tabAppearance").forEach(element => {
            const tab = element.dataset.tab;
            config.appearance[tab] = {
                labelColor: element.querySelector("[data-labelColor]")?.value,
                diceColor: element.querySelector("[data-diceColor]")?.value,
                outlineColor: element.querySelector("[data-outlineColor]")?.value,
                edgeColor: element.querySelector("[data-edgeColor]")?.value,
                colorset: element.querySelector("[data-colorset]")?.value,
                texture: element.querySelector("[data-texture]")?.value,
                material: element.querySelector("[data-material]")?.value,
                font: element.querySelector("[data-font]")?.value,
                system: element.querySelector("[data-system]")?.value,
                ...DiceConfig._parseLibraryDieValue(element.querySelector("[data-libraryDie]")?.value)
            };

            const systemSettingsRaw = {};
            const systemSettingsContainer = element.querySelector("[data-systemsettings]");
            if (systemSettingsContainer) {
                systemSettingsContainer.querySelectorAll("input, select").forEach(field => {
                    let name = field.getAttribute("name");
                    name = name.substring(name.lastIndexOf("[") + 1, name.lastIndexOf("]"));
                    if (field.type === "checkbox") {
                        systemSettingsRaw[name] = field.checked;
                    } else {
                        systemSettingsRaw[name] = field.value;
                    }
                });
            }

            const system = this.diceFactory.systems.get(config.appearance[tab].system);
            if (system && system.settings.length > 0) {
                const systemSettingsIDs = system.settings.map(setting => setting.id);
                config.appearance[tab].systemSettings = Object.fromEntries(Object.entries(systemSettingsRaw).filter(([key]) => systemSettingsIDs.includes(key)));
            }
        });

        config.diceLibrary = DiceLibrary.getLibraryForUser(game.user);
        this.currentGlobalAppearance = config.appearance.global;
        return config;
    }

    refreshLibraryDropdown(dieType = null) {
        const selector = dieType
            ? `.tabAppearance[data-tab="${dieType}"]`
            : '.tabAppearance:not([data-tab="global"])';

        this.element.querySelectorAll(selector).forEach(element => {
            const tab = element.dataset.tab;
            const select = element.querySelector("[data-libraryDie]");
            if (!select) return;
            const currentVal = select.value || "";
            const groups = DiceLibrary.buildLibraryDiceGroups(tab, null, currentVal);
            let html = `<option value="">${game.i18n.localize("DICESONICE.None")}</option>`;
            for (const group of groups) {
                html += `<optgroup label="${group.label}">`;
                for (const d of group.dice) {
                    const sel = d.value === currentVal ? " selected" : "";
                    html += `<option value="${d.value}"${sel}>${d.name}</option>`;
                }
                html += `</optgroup>`;
            }
            select.innerHTML = html;
        });
    }

    //Not used because SFX aren't initialized. Keeping it here for later use.
    getShowcaseSFX() {
        let sfxList = [];

        this.element.querySelectorAll(".sfx-line").forEach(element => {
            const resultSelect = element.querySelector("[data-sfx-result]");
            let sfx = {
                diceType: element.querySelector("[data-sfx-dicetype]").value,
                onResult: resultSelect ? Array.from(resultSelect.selectedOptions).map(o => o.value) : [],
                specialEffect: element.querySelector("[data-sfx-specialeffect]").value,
                options: {}
            };
            element.querySelectorAll("[data-sfx-hidden-options] input, [data-sfx-hidden-options] select").forEach(el => {
                let name = el.getAttribute("name").match(/.*\[(.*)\]$/)[1];
                if (el.type === "checkbox")
                    sfx.options[name] = el.checked;
                else
                    sfx.options[name] = el.value;
            });
            if (sfx.diceType && sfx.onResult && sfx.specialEffect)
                sfxList.push(sfx);
        });
        return sfxList;
    }

    onApply(event = null) {
        if (event)
            event.preventDefault();

        const container = this.element.querySelector("#dice-configuration-canvas-container");
        container?.classList.add("loading");

        setTimeout(async () => {
            let config = this.getShowcaseAppearance();
            this.diceFactory.disposeCachedMaterials("showcase");

            if (this.isUser) {
                this.diceFactory.setQualitySettings(config);
                this.diceScene.updateRenderSettings();
            }
            await this.diceFactory.preloadPresets(true, null, config.appearance);

            this.showcaseView.showExtraDice = config.showExtraDice;
            await this.showcaseView.showcase(config);
            container?.classList.remove("loading");
        }, 100);
    }

    async _onSaveAs() {
        let saves = game.user.getFlag("dice-so-nice", "saves");
        let saveList = new Map();
        if (saves) saveList = new Map(Object.entries(saves));

        foundry.applications.api.DialogV2.wait({
            classes: ["dice-so-nice"],
            window: { title: "DICESONICE.SaveAs" },
            position: { width: 550 },
            content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-saveas.hbs", { saveList: saveList.keys() }),
            buttons: [{ action: "cancel", icon: "fa-solid fa-ban", label: "Cancel", default: true }],
            render: (event, dialog) => {
                const el = dialog.element;
                if (saveList.size) {
                    el.addEventListener("click", (ev) => {
                        if (ev.target.closest("[data-overwrite]")) {
                            let name = el.querySelector("[data-save-list]").value;
                            this.actionSaveAs(name);
                            dialog.close();
                        } else if (ev.target.closest("[data-delete]")) {
                            let name = el.querySelector("[data-save-list]").value;
                            this.actionDeleteSave(name).then(() => {
                                saveList.delete(name);
                                el.querySelector("[data-save-list] option:checked")?.remove();
                                if (!saveList.size) {
                                    const ow = el.querySelector("[data-overwrite]");
                                    const del = el.querySelector("[data-delete]");
                                    if (ow) ow.disabled = true;
                                    if (del) del.disabled = true;
                                }
                            });
                        } else if (ev.target.closest("[data-add-new]")) {
                            let name = el.querySelector("[data-save-name]").value;
                            if (name) {
                                if (saveList.has(name)) {
                                    ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorAlreadyExist"));
                                } else {
                                    this.actionSaveAs(name);
                                    dialog.close();
                                }
                            } else {
                                ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorName"));
                            }
                        }
                    });
                } else {
                    const ow = el.querySelector("[data-overwrite]");
                    const del = el.querySelector("[data-delete]");
                    if (ow) ow.disabled = true;
                    if (del) del.disabled = true;

                    el.addEventListener("click", (ev) => {
                        if (ev.target.closest("[data-add-new]")) {
                            let name = el.querySelector("[data-save-name]").value;
                            if (name) {
                                if (saveList.has(name)) {
                                    ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorAlreadyExist"));
                                } else {
                                    this.actionSaveAs(name);
                                    dialog.close();
                                }
                            } else {
                                ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorName"));
                            }
                        }
                    });
                }
            }
        });
    }

    async _onLoad() {
        let saves = game.user.getFlag("dice-so-nice", "saves");
        let saveList = [];
        if (saves) saveList = new Map(Object.entries(saves));

        foundry.applications.api.DialogV2.wait({
            window: { title: "DICESONICE.Load" },
            position: { width: 550 },
            content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-load.hbs", { saveList: saveList.keys() }),
            buttons: [{
                action: "load", icon: "fa-solid fa-box-open", label: "DICESONICE.Load",
                callback: async (event, button, dialog) => {
                    let name = dialog.element.querySelector("[data-save-list]").value;
                    await this.actionLoadSave(name);
                    this.close();
                }
            }, {
                action: "no", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel", default: true
            }],
            render: (event, dialog) => {
                if (!saveList.size) {
                    const btn = dialog.element.querySelector('[data-button="load"]');
                    if (btn) btn.disabled = true;
                }
            }
        });
    }

    async _onImport() {
        foundry.applications.api.DialogV2.wait({
            window: { title: "DICESONICE.Import" },
            position: { width: 400 },
            content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-import.hbs"),
            buttons: [{
                action: "import", icon: "fa-solid fa-file-import", label: "DICESONICE.Import",
                callback: async (event, button, dialog) => {
                    const form = dialog.element.querySelector("form");
                    if (!form.data.files.length) return ui.notifications.error(game.i18n.localize("DICESONICE.ImportNoFile"));
                    foundry.utils.readTextFromFile(form.data.files[0]).then(async json => {
                        await this.actionImportFromJSON(json);
                        this.close();
                    });
                },
                default: true
            }, {
                action: "no", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel"
            }]
        });
    }

    async _onGMPush() {
        if (!game.user.isGM) return;

        foundry.applications.api.DialogV2.wait({
            classes: ["dice-so-nice"],
            window: { title: "DICESONICE.GMPushDialogTitle" },
            position: { width: 500 },
            content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-gm-push.hbs"),
            buttons: [{
                action: "push", icon: "fa-solid fa-share-square", label: "DICESONICE.GMPushConfirm",
                callback: async (event, button, dialog) => {
                    const form = dialog.element.querySelector("form");
                    const parts = {
                        appearance: form.elements.appearance.checked,
                        sfxList: form.elements.sfxList.checked,
                        settings: form.elements.settings.checked
                    };
                    if (!parts.appearance && !parts.sfxList && !parts.settings) {
                        ui.notifications.warn(game.i18n.localize("DICESONICE.GMPushNone"));
                        return;
                    }
                    await this.submit({ preventClose: true, preventRender: true });
                    await this.actionGMPushConfig(parts);
                }
            }, {
                action: "cancel", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel", default: true
            }]
        });
    }

    _onCanvasClick(event) {
        let rect = event.target.getBoundingClientRect();
        let x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        if (x > 1) x = 1;
        let y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        let pos = { x: x, y: y };
        let dice = this.showcaseView.findShowcaseDie(pos);
        if (dice) {
            let diceType = this.showcaseView.findRootObject(dice.object).userData;
            if (!this.document.getFlag("dice-so-nice", "appearance") && (this.diceFactory.preferredSystem != "standard" || this.diceFactory.preferredColorset != "custom"))
                this.getShowcaseAppearance();
            if (this.element.querySelector(`.dsn-appearance-tabs [data-tab="${diceType}"]`)) {
                this.activateAppearanceTab(diceType);
            } else {
                let newSystemSettings = {};
                if (this.diceFactory.systems.has(this.currentGlobalAppearance.system)) {
                    const system = this.diceFactory.systems.get(this.currentGlobalAppearance.system);
                    if (system.settings.length > 0) {
                        const dialogContent = system.getSettingsDialogContent(diceType);
                        if (dialogContent.content != "") {
                            const hdbsTemplate = Handlebars.compile(dialogContent.content);
                            newSystemSettings = hdbsTemplate(dialogContent.data);
                        }
                    }
                }
                const hint = this.element.querySelector(".dsn-appearance-hint");
                if (hint) hint.style.display = "none";
                const libraryDiceGroups = DiceLibrary.buildLibraryDiceGroups(diceType, null);
                foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-appearance.hbs", {
                    dicetype: diceType,
                    appearance: this.currentGlobalAppearance,
                    systemList: this.initializationData.systemList,
                    colorsetList: this.initializationData.colorsetList,
                    textureList: this.initializationData.textureList,
                    materialList: this.initializationData.materialList,
                    fontList: this.initializationData.fontList,
                    showLibrary: DiceLibrary.getFullDieTypes().includes(diceType),
                    libraryDiceGroups: libraryDiceGroups,
                    systemSettings: newSystemSettings
                }).then((htmlString) => {
                    htmlString = this.addTitleToOptions(htmlString, '[data-colorset] option');

                    let tabName = diceType.toUpperCase();
                    let insertBefore = null;
                    this.element.querySelectorAll(".dsn-appearance-tabs .item").forEach(el => {
                        if (insertBefore) return;
                        if (this.navOrder[el.dataset.tab] >= this.navOrder[diceType]) {
                            insertBefore = el.dataset.tab;
                        }
                    });

                    const template = document.createElement("template");
                    template.innerHTML = htmlString;
                    const newTabContent = template.content.firstElementChild;

                    const navSpan = document.createElement("span");
                    navSpan.className = "item";
                    navSpan.dataset.action = "tab";
                    navSpan.dataset.group = "dsn-dice";
                    navSpan.dataset.tab = diceType;
                    navSpan.innerHTML = `${tabName} <i class="fa-solid fa-times" data-close-tab></i>`;

                    if (insertBefore) {
                        const beforeContent = this.element.querySelector(`.tabAppearance[data-tab="${insertBefore}"]`);
                        const beforeNav = this.element.querySelector(`.dsn-appearance-tabs .item[data-tab="${insertBefore}"]`);
                        if (beforeContent) beforeContent.before(newTabContent);
                        if (beforeNav) beforeNav.before(navSpan);
                    } else {
                        this.element.querySelector("#dsn-appearance-content").append(newTabContent);
                        this.element.querySelector(".dsn-appearance-tabs").append(navSpan);
                    }
                    this.activateAppearanceTab(diceType);
                    this.toggleCustomization(diceType);
                    this.filterSystems(diceType);
                });
            }
        }
    }

    onReset() {
        this.reset = true;
        this.render();
        this.changeTab("general", "dsn-main", { force: true });
    }

    parseInputs(data) {
        var ret = {};
        retloop:
        for (var input in data) {
            var val = data[input];

            var parts = input.split('[');
            var last = ret;

            for (var i in parts) {
                var part = parts[i];
                if (part.substring(part.length - 1) == ']') {
                    part = part.substring(0, part.length - 1);
                }

                if (i == parts.length - 1) {
                    last[part] = val;
                    continue retloop;
                } else if (!last.hasOwnProperty(part)) {
                    last[part] = {};
                }
                last = last[part];
            }
        }
        return ret;
    }

    async _updateObject(event, formData) {
        formData = this.parseInputs(formData.object);

        if (this.isActor) {
            return this._updateActorAppearance(formData);
        }

        //Remove custom settings if custom isn't selected to prevent losing them in the user save
        let sfxLine = formData.sfxLine;
        if (sfxLine) {
            sfxLine = Object.values(sfxLine);
            //Remove empty lines
            for (let i = sfxLine.length - 1; i >= 0; i--) {
                if (sfxLine[i].mode === 'advanced') {
                    if (!sfxLine[i].formula || !sfxLine[i].specialEffect || !SFXFormulaMatcher.validate(sfxLine[i].formula).valid)
                        sfxLine.splice(i, 1);
                } else if (sfxLine[i].diceType == undefined || sfxLine[i].diceType == "" || sfxLine[i].onResult == "" || Array.isArray(sfxLine[i].diceType) || Array.isArray(sfxLine[i].specialEffect))
                    sfxLine.splice(i, 1);
            }
            //Remove duplicate lines
            let dataArr = sfxLine.map(item => {
                return [JSON.stringify(item), item]
            });
            let mapArr = new Map(dataArr);

            sfxLine = [...mapArr.values()];

            delete formData.sfxLine;
        }

        let scopedAppearance = Object.keys(formData.appearance);
        let systemsInUse = new Set();
        for (let scope of scopedAppearance) {
            if (formData.appearance[scope].libraryDieId) {
                const parsed = DiceConfig._parseLibraryDieValue(formData.appearance[scope].libraryDieId);
                formData.appearance[scope].libraryDieId = parsed.libraryDieId || "";
                if (parsed.libraryDieOwner) {
                    formData.appearance[scope].libraryDieOwner = parsed.libraryDieOwner;
                } else {
                    delete formData.appearance[scope].libraryDieOwner;
                }
            } else {
                delete formData.appearance[scope].libraryDieId;
                delete formData.appearance[scope].libraryDieOwner;
            }

            if (formData.appearance[scope].colorset != "custom") {
                delete formData.appearance[scope].labelColor;
                delete formData.appearance[scope].diceColor;
                delete formData.appearance[scope].outlineColor;
                delete formData.appearance[scope].edgeColor;
            }

            // filter form system settings based on the system settings to remove helpers and selectors
            systemsInUse.add(formData.appearance[scope].system);
            const system = this.diceFactory.systems.get(formData.appearance[scope].system);
            if (system && system.settings.length > 0) {
                const systemSettingsList = system.settings;
                const systemSettingsIDs = systemSettingsList.map(setting => setting.id);

                //Only keep settings form entries that are in the system settings id list. systemSettings is an object with the ids as keys
                formData.appearance[scope].systemSettings = Object.fromEntries(Object.entries(formData.appearance[scope].systemSettings).filter(([key]) => systemSettingsIDs.includes(key)));
            }
        }
        let currentSettings = Dice3D.CONFIG();

        //required
        await game.user.unsetFlag("dice-so-nice", "sfxList");
        await game.user.unsetFlag("dice-so-nice", "appearance");
        await game.user.unsetFlag("dice-so-nice", "settings");

        //system settings won't be merged here because insertValues is false
        let appearance = foundry.utils.mergeObject(Dice3D.APPEARANCE(), formData.appearance, { insertKeys: true, insertValues: false, applyOperators: true });

        //add back system settings and library die refs (mergeObject drops them)
        for (let scope of scopedAppearance) {
            if (formData.appearance[scope].systemSettings) {
                appearance[scope].systemSettings = formData.appearance[scope].systemSettings;
            }
            if (formData.appearance[scope].libraryDieId) {
                appearance[scope].libraryDieId = formData.appearance[scope].libraryDieId;
                if (formData.appearance[scope].libraryDieOwner) {
                    appearance[scope].libraryDieOwner = formData.appearance[scope].libraryDieOwner;
                }
            } else {
                delete appearance[scope].libraryDieId;
                delete appearance[scope].libraryDieOwner;
            }
        }

        delete formData.appearance;
        let settings = foundry.utils.mergeObject(Dice3D.CONFIG(), formData, { insertKeys: false, insertValues: false, applyOperators: true });

        // preserve rollingArea config
        settings.rollingArea = currentSettings.rollingArea;

        await game.user.setFlag('dice-so-nice', 'settings', settings);
        await game.user.setFlag("dice-so-nice", "appearance", appearance);
        await game.user.setFlag("dice-so-nice", "sfxList", sfxLine);

        game.socket.emit("module.dice-so-nice", { type: "update", user: game.user.id });
        DiceSFXManager.init();
        for (let system of systemsInUse) {
            this.diceFactory.systems.get(system).loadSettings();
        }
        ui.notifications.info(game.i18n.localize("DICESONICE.saveMessage"));

        let reloadRequired = Utils.RELOAD_REQUIRED_IF_MODIFIED.some(setting => settings[setting] != currentSettings[setting]);

        if (reloadRequired) {
            foundry.applications.settings.SettingsConfig.reloadConfirm();
        } else {
            game.dice3d.update(settings);
        }
    }

    async _updateActorAppearance(formData) {
        let scopedAppearance = Object.keys(formData.appearance);
        for (let scope of scopedAppearance) {
            if (formData.appearance[scope].libraryDieId) {
                const parsed = DiceConfig._parseLibraryDieValue(formData.appearance[scope].libraryDieId);
                formData.appearance[scope].libraryDieId = parsed.libraryDieId || "";
                formData.appearance[scope].libraryDieOwner = parsed.libraryDieOwner || game.user.id;
            } else {
                delete formData.appearance[scope].libraryDieId;
                delete formData.appearance[scope].libraryDieOwner;
            }

            if (formData.appearance[scope].colorset != "custom") {
                delete formData.appearance[scope].labelColor;
                delete formData.appearance[scope].diceColor;
                delete formData.appearance[scope].outlineColor;
                delete formData.appearance[scope].edgeColor;
            }

            const system = this.diceFactory.systems.get(formData.appearance[scope].system);
            if (system && system.settings.length > 0) {
                const systemSettingsIDs = system.settings.map(s => s.id);
                formData.appearance[scope].systemSettings = Object.fromEntries(
                    Object.entries(formData.appearance[scope].systemSettings).filter(([key]) => systemSettingsIDs.includes(key))
                );
            }
        }

        await this.document.unsetFlag("dice-so-nice", "appearance");
        await this.document.setFlag("dice-so-nice", "appearance", formData.appearance);

        const uuid = this.document.uuid;
        if (game.user.isGM) {
            let preloadList = game.settings.get("dice-so-nice", "documentsForPreload");
            if (!preloadList.includes(uuid)) {
                preloadList = [...preloadList, uuid];
                await game.settings.set("dice-so-nice", "documentsForPreload", preloadList);
            }
        }

        game.socket.emit("module.dice-so-nice", { type: "update", user: game.user.id, document: uuid });
        ui.notifications.info(game.i18n.localize("DICESONICE.saveMessage"));
    }

    static async _onResetActor() {
        if (!this.isActor) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("DICESONICE.Reset") },
            content: game.i18n.localize("DICESONICE.ResetActorConfirm")
        });
        if (!confirmed) return;

        await this.document.unsetFlag("dice-so-nice", "appearance");

        const uuid = this.document.uuid;
        if (game.user.isGM) {
            let preloadList = game.settings.get("dice-so-nice", "documentsForPreload");
            preloadList = preloadList.filter(u => u !== uuid);
            await game.settings.set("dice-so-nice", "documentsForPreload", preloadList);
        }

        game.socket.emit("module.dice-so-nice", { type: "update", user: game.user.id, document: uuid });
        this.close();
    }

    _buildSlimSelectOptions(dicetype, selectedValues = []) {
        if (!dicetype || !this.possibleResultList[dicetype]) return [];
        const selected = new Set(Array.isArray(selectedValues) ? selectedValues : [selectedValues]);
        return this.possibleResultList[dicetype].map(opt => {
            let displayText = opt.id;
            if (opt.name !== opt.id) {
                displayText = `${opt.name} (${opt.id})`;
            }
            return {
                text: displayText,
                value: opt.id,
                selected: selected.has(opt.id)
            };
        });
    }

    _initSlimSelects() {
        const selects = this.element.querySelectorAll("[data-sfx-result]");
        selects.forEach(selectEl => {
            if (this.slimSelectInstances.has(selectEl)) return;
            const dicetype = selectEl.dataset.sfxResultDicetype;
            const currentSelected = Array.from(selectEl.selectedOptions).map(o => o.value);
            const instance = new SlimSelect({
                select: selectEl,
                settings: {
                    showSearch: false,
                    closeOnSelect: false,
                    allowDeselect: true,
                    contentLocation: this.element.querySelector("form.dice-so-nice")
                },
                events: {
                    afterChange: () => this.setPosition()
                }
            });
            if (dicetype && this.possibleResultList[dicetype]) {
                instance.setData(this._buildSlimSelectOptions(dicetype, currentSelected));
            }
            this.slimSelectInstances.set(selectEl, instance);
        });
    }

    _destroySlimSelects() {
        for (const [selectEl, instance] of this.slimSelectInstances) {
            instance.destroy();
        }
        this.slimSelectInstances.clear();
    }

    _sfxToggleToAdvanced(sfxLine) {
        const diceTypeSelect = sfxLine.querySelector("[data-sfx-dicetype]");
        const resultSelect = sfxLine.querySelector("[data-sfx-result]");
        const ID = sfxLine.querySelector("[data-sfx-mode-input]").name.match(/\[(\d+)\]/)[1];

        // auto-convert current selections to formula
        let formula = '';
        if (diceTypeSelect) {
            const diceType = diceTypeSelect.value;
            if (diceType) {
                if (resultSelect) {
                    const selected = Array.from(resultSelect.selectedOptions).map(o => o.value);
                    const specialTriggers = ["kh", "kl", "dh", "dl", "cs", "cf", "x", "r"];
                    const numericResults = selected.filter(v => !specialTriggers.includes(v));

                    if (selected.includes("kh") || selected.includes("kl") || selected.includes("dh") || selected.includes("dl")) {
                        const mod = selected.find(v => ["kh", "kl", "dh", "dl"].includes(v));
                        formula = '!discarded(' + diceType + mod + ')';
                    } else if (selected.includes("cs")) {
                        formula = 'success(' + diceType + 'cs)';
                    } else if (selected.includes("cf")) {
                        formula = 'failure(' + diceType + 'cf)';
                    } else if (selected.includes("x")) {
                        formula = 'exploded(' + diceType + ')';
                    } else if (selected.includes("r")) {
                        formula = 'rerolled(' + diceType + ')';
                    } else {
                        formula = diceType;
                        if (numericResults.length > 0) {
                            formula += ' == ' + numericResults.join(',');
                        }
                    }
                } else {
                    formula = diceType;
                }
            }
        }

        // destroy SlimSelect on the result dropdown
        if (resultSelect && this.slimSelectInstances.has(resultSelect)) {
            this.slimSelectInstances.get(resultSelect).destroy();
            this.slimSelectInstances.delete(resultSelect);
        }

        // replace diceType + onResult with formula input
        const diceTypeContainer = sfxLine.querySelector(".sfx-flex-2");
        const resultContainer = sfxLine.querySelector(".sfx-flex-5");
        if (diceTypeContainer) diceTypeContainer.remove();
        if (resultContainer) resultContainer.remove();

        const formulaDiv = document.createElement("div");
        formulaDiv.className = "sfx-data sfx-flex-7 sfx-formula-container";
        const formulaInput = document.createElement("input");
        formulaInput.type = "text";
        formulaInput.setAttribute("data-sfx-formula", "");
        formulaInput.name = `sfxLine[${ID}][formula]`;
        formulaInput.value = formula;
        formulaInput.placeholder = game.i18n.localize("DICESONICE.sfxFormulaPlaceholder");
        formulaInput.autocomplete = "off";
        formulaDiv.appendChild(formulaInput);
        const errorIcon = document.createElement("i");
        errorIcon.className = "fas fa-circle-exclamation sfx-formula-error-icon";
        errorIcon.setAttribute("data-sfx-formula-error", "");
        formulaDiv.appendChild(errorIcon);

        const specialEffectDiv = sfxLine.querySelector(".sfx-flex-3");
        sfxLine.insertBefore(formulaDiv, specialEffectDiv);

        // update mode state
        sfxLine.dataset.sfxMode = "advanced";
        sfxLine.querySelector("[data-sfx-mode-input]").value = "advanced";
        sfxLine.querySelector("[data-sfx-mode-toggle] i").className = "fas fa-list";

        this.setPosition();
    }

    async _sfxToggleToBasic(sfxLine) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("DICESONICE.sfxModeConfirmTitle") },
            content: `<p>${game.i18n.localize("DICESONICE.sfxModeConfirmContent")}</p>`
        });
        if (!confirmed) return;

        const ID = sfxLine.querySelector("[data-sfx-mode-input]").name.match(/\[(\d+)\]/)[1];

        // remove formula input
        const formulaContainer = sfxLine.querySelector(".sfx-formula-container");
        if (formulaContainer) formulaContainer.remove();

        const specialEffectDiv = sfxLine.querySelector(".sfx-flex-3");

        // create diceType dropdown
        const diceTypeDiv = document.createElement("div");
        diceTypeDiv.className = "sfx-data sfx-flex-2";
        const diceTypeSelect = document.createElement("select");
        diceTypeSelect.setAttribute("data-sfx-dicetype", "");
        diceTypeSelect.name = `sfxLine[${ID}][diceType]`;
        this.triggerTypeList.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            diceTypeSelect.appendChild(opt);
        });
        diceTypeDiv.appendChild(diceTypeSelect);

        // create onResult multi-select
        const resultDiv = document.createElement("div");
        resultDiv.className = "sfx-data sfx-flex-5";
        const resultSelect = document.createElement("select");
        resultSelect.setAttribute("data-sfx-result", "");
        resultSelect.setAttribute("data-sfx-result-dicetype", "");
        resultSelect.name = `sfxLine[${ID}][onResult]`;
        resultSelect.multiple = true;
        resultDiv.appendChild(resultSelect);

        sfxLine.insertBefore(resultDiv, specialEffectDiv);
        sfxLine.insertBefore(diceTypeDiv, resultDiv);

        // update mode state
        sfxLine.dataset.sfxMode = "basic";
        sfxLine.querySelector("[data-sfx-mode-input]").value = "basic";
        sfxLine.querySelector("[data-sfx-mode-toggle] i").className = "fas fa-code";

        this._initSlimSelects();
        this.setPosition();
    }

    close(options) {
        this._destroySlimSelects();
        super.close(options);
        this.showcaseView.stopAnimation();
        this.diceScene.clearScene();
        this.diceFactory.disposeCachedMaterials("showcase");
    }

    static async _onSubmit(event, form, formData) {
        this.sfxDialogList.forEach((dialog) => {
            dialog.close();
        });

        this.systemSettingsDialogList.forEach((dialog) => {
            dialog.close();
        });

        //await super._onSubmit(event, options);
        this._updateObject(event, formData);
    }
}