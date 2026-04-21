import { Dice3D } from '../Dice3D.js';
import { DiceScene } from '../engine/DiceScene.js';
import { DiceSFXManager } from '../sfx/DiceSFXManager.js';
import { ShowcaseView } from '../rendering/ShowcaseView.js';
import { Utils } from '../Utils.js';
import { DiceNotation, COMPOUND_DICE } from '../DiceNotation.js';
import { DiceColors, DICE_SCALE } from '../engine/DiceColors.js';
import { DiceSystem } from '../DiceSystem.js';
import { DiceLibrary, LIBRARY_DIE_TYPES } from '../engine/DiceLibrary.js';
import { DiceLibraryDialog } from './DiceLibraryDialog.js';
import { DiceEditor } from './DiceEditor.js';

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
            ambianceList: Utils.localize({
                "blouberg_sunrise_2_1k": "DICESONICE.AmbianceNeutral",
                "warm_restaurant_night_1k": "DICESONICE.AmbianceTavern",
                "shanghai_bund_1k": "DICESONICE.AmbianceNeon"
            }),
            canvasZIndexList: Utils.localize({
                "auto": "DICESONICE.CanvasZIndexAuto",
                "over": "DICESONICE.CanvasZIndexOver",
                "under": "DICESONICE.CanvasZIndexUnder",
            }),
            throwingForceList: Utils.localize({
                "weak": "DICESONICE.ThrowingForceWeak",
                "medium": "DICESONICE.ThrowingForceMedium",
                "strong": "DICESONICE.ThrowingForceStrong"
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

        this.canvas = $('<div id="dice-configuration-canvas"></div>')[0];
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
            }
        });

        let specialEffectsList = [];
        let specialEffectsPromises = [];
        let specialEffects = Dice3D.SFX();
        if (this.reset)
            specialEffects = [];
        this.triggerTypeList = [...triggerTypeList, ...DiceSFXManager.EXTRA_TRIGGER_TYPE];
        foundry.utils.mergeObject(this.possibleResultList, DiceSFXManager.EXTRA_TRIGGER_RESULTS, { applyOperators: true });

        //Filter out the SFX that are not registered
        if (specialEffects) {
            let registeredTriggerTypes = this.triggerTypeList.map(trigger => trigger.id);
            specialEffects = specialEffects.filter(sfx => registeredTriggerTypes.includes(sfx.diceType));
        }

        if (specialEffects) {
            specialEffects.forEach((sfx, index) => {
                let sfxClass = DiceSFXManager.SFX_MODE_CLASS[sfx.specialEffect];
                let dialogContent = sfxClass.getDialogContent(sfx, index);
                let hdbsTemplate = Handlebars.compile(dialogContent.content);

                specialEffectsPromises.push(foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.hbs", {
                    id: index,
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
                showLibrary: isPerDie && LIBRARY_DIE_TYPES.includes(diceType),
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

        const templateSelect2 = (result) => {

            if (result.element) {
                let label = this.possibleResultList[result.element.parentElement.dataset.sfxResultDicetype].find(el => el.id == result.text).name;
                if (label != result.text)
                    return `${label} (${result.text})`;
                else
                    return result.text;
            } else {
                return result.text;
            }
        };

        this.select2Options = {
            dropdownCssClass: "dice-so-nice",
            escapeMarkup: function (text) { return text; },
            dropdownParent: "form.dice-so-nice",
            templateResult: templateSelect2,
            templateSelection: templateSelect2,
            width: "306px"
        }

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

        const html = $(this.element);

        $(html).find("#dice-configuration-canvas-container").append(this.canvas);

        if (this.isUser) {
            this.toggleHideAfterRoll();
            this.toggleAutoScale();
        }
        this.toggleCustomization();
        this.filterSystems();
        this.setPreferredOptions();

        select2dsn.call($(this.element).find("[data-sfx-result]"), this.select2Options);

        if (!this.reset) {
            $(this.element).on("change", "[data-showExtraDice]", (ev) => {
                this.onApply(ev);
            });

            $(this.element).on("change", "[data-hideAfterRoll]", (ev) => {
                this.toggleHideAfterRoll(ev);
            });

            $(this.element).on("change", "[data-sounds]", (ev) => {
                this.toggleSounds(ev);
            });

            $(this.element).on("change", "[data-autoscale]", (ev) => {
                this.toggleAutoScale(ev);
            });

            $(this.element).on("change", "[data-colorset]", (ev) => {
                this.toggleCustomColors($(ev.target).data("dicetype"));
            });

            $(this.element).on("change", "[data-libraryDie]", (ev) => {
                this.toggleCustomization($(ev.target).data("dicetype"));
            });

            $(this.element).on("change", "[data-system]", (ev) => {
                this.toggleCustomization($(ev.target).data("dicetype"));

                //replace system settings
                const systemSettingsContainer = $(ev.target).parents(".tabAppearance").find('[data-systemsettings-hidden]');
                systemSettingsContainer.children().remove();

                const system = this.diceFactory.systems.get($(ev.target).val());

                if (system.settings.length > 0) {
                    $(ev.target).next("[data-system-options]").removeClass("dsn-hidden");
                    const dialogContent = system.getSettingsDialogContent($(ev.target).data("dicetype"));
                    if (dialogContent.content != "") {
                        const hdbsTemplate = Handlebars.compile(dialogContent.content);
                        systemSettingsContainer.append(hdbsTemplate(dialogContent.data));
                    }
                } else {
                    $(ev.target).next("[data-system-options]").addClass("dsn-hidden");
                }
            });

            $(this.element).on("change", "input,select", (ev) => {
                this.onApply(ev);
            });

            $(this.element).on("click", "[data-reset]", (ev) => {
                this.onReset(ev);
            });

            $(this.element).on("click", "[data-cancel]", (ev) => {
                this.close();
            });

            $(this.element).on("click", "[data-close-tab]", (ev) => {
                let diceType = $(ev.target).parent().data("tab");
                this.closeAppearanceTab(diceType);
            });

            $(this.element).on("click", "[data-library-manage]", (ev) => {
                ev.preventDefault();
                const diceType = $(ev.currentTarget).data("dicetype");
                new DiceLibraryDialog({ diceType, diceConfig: this }).render(true);
            });

            $(this.element).on("click", "[data-action=test]", (ev) => {
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
                let roll = new Roll(denominationList.join("+")).evaluate().then((roll) => {
                    let data = new DiceNotation(roll);

                    let specialEffects = this.getShowcaseSFX();
                    let customization = foundry.utils.mergeObject({ appearance: config.appearance }, { specialEffects: specialEffects }, { applyOperators: true });
                    customization.diceLibrary = config.diceLibrary;

                    game.dice3d._showAnimation(data, customization);
                });
            });

            $(this.element).on("click", "[data-sfx-create]", (ev) => {
                let ID = $(this.element).find(".sfx-line").length;
                let firstSFX = Object.keys(DiceSFXManager.SFX_MODE_LIST)[0];
                let sfxClass = DiceSFXManager.SFX_MODE_CLASS[firstSFX];
                let dialogContent = sfxClass.getDialogContent({}, ID);
                let hdbsTemplate = Handlebars.compile(dialogContent.content);
                foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.hbs", {
                    id: ID,
                    diceType: "",
                    onResult: [],
                    specialEffect: "",
                    specialEffectsMode: DiceSFXManager.SFX_MODE_LIST,
                    triggerTypeList: this.triggerTypeList,
                    possibleResultList: [],
                    options: hdbsTemplate(dialogContent.data)
                }).then((html) => {
                    $(this.element).find("#sfxs-list").append(html);
                    select2dsn.call($("[data-sfx-result]"), this.select2Options);
                    this.setPosition();
                });
            });

            $(this.element).on("click", "[data-sfx-delete]", (ev) => {
                $(ev.target).parents(".sfx-line").remove();
                $(this.element).find(".sfx-line").each(function (index) {
                    $(this).find("input, select").each(function () {
                        let name = $(this).attr("name");
                        $(this).attr("name", name.replace(/(\w+\[)(\d+)(\]\[\w+\])/, "$1" + index + "$3"));
                    });
                });
                this.setPosition();
            });

            $(this.element).on("click", "[data-sfx-options]", (ev) => {
                let sfxLineOptions = $(ev.target).parents(".sfx-line").find("[data-sfx-hidden-options]");

                if (sfxLineOptions.length < 1)
                    return;

                foundry.applications.api.DialogV2.wait({
                    classes: ["dice-so-nice"],
                    window: {
                        title: "DICESONICE.Options",
                        contentClasses: ["standard-form"]
                    },
                    position: {
                        width: 680
                    },
                    content: `<form class="standard-form" autocomplete="off" onsubmit="event.preventDefault();"></form>`,
                    buttons: [{
                        action: "ok",
                        icon: "fa-solid fa-check-circle",
                        label: "OK",
                        default: true
                    }],
                    render: (event, dialog) => {
                        sfxLineOptions.detach().appendTo($(dialog.element).find(".dialog-content"));
                        this.activateDialogFilePicker(sfxLineOptions);
                        this.sfxDialogList.push(dialog);
                    },
                    close: (event, dialog) => {
                        sfxLineOptions.appendTo($(ev.target).parents(".sfx-line").find(".sfx-hidden"));
                        this.sfxDialogList = this.sfxDialogList.filter(d => dialog.appId != d.appId);
                    }
                });
            });

            $(this.element).on("change", "[data-sfx-dicetype]", (ev) => {
                let dicetype = $(ev.target).val();
                let optionHTML = $([]);
                if (dicetype != "") {
                    this.possibleResultList[dicetype].forEach(opt => {
                        let frag = $("<option></option>");
                        frag.html(opt.id);
                        frag.attr("value", opt.id);
                        optionHTML = optionHTML.add(frag);
                    });
                    $(ev.target).parents(".sfx-line").find("[data-sfx-result]").html(optionHTML).attr("data-sfx-result-dicetype", dicetype).trigger("change");
                } else {
                    $(ev.target).parents(".sfx-line").find("[data-sfx-result]").empty().trigger("change");
                }
            });

            $(this.element).on("change", "[data-sfx-result]", (ev) => {
                this.setPosition();
            });

            $(this.element).on("change", "[data-sfx-specialeffect]", (ev) => {
                this.sfxDialogList.forEach((dialog) => {
                    dialog.close();
                });
                this.sfxDialogList = [];
                let sfxLine = $(ev.target).parents(".sfx-line");

                let ID = sfxLine.prevAll(".sfx-line").length;
                let sfxClass = DiceSFXManager.SFX_MODE_CLASS[$(ev.target).val()];
                let dialogContent = sfxClass.getDialogContent({}, ID);
                let hdbsTemplate = Handlebars.compile(dialogContent.content);

                sfxLine.find(".sfx-hidden [data-sfx-hidden-options]").html(hdbsTemplate(dialogContent.data));
            });


            /**
             * System Settings
             */
            $(this.element).on("click", "[data-system-options]", (ev) => {
                const systemSettingsContainer = $(ev.target).parents(".tabAppearance").find(`[data-systemSettings-hidden]`);
                const systemSettingsElement = systemSettingsContainer.find("[data-systemSettings]");
                const systemSelected = $(ev.target).parents(".tabAppearance").find("[data-system]").val();
                const systemName = this.diceFactory.systems.get(systemSelected).name;

                foundry.applications.api.DialogV2.wait({
                    window: {
                        title: `${game.i18n.localize("DICESONICE.SystemOptions")} - ${this.lastActiveAppearanceTab.charAt(0).toUpperCase()}${this.lastActiveAppearanceTab.slice(1)} - ${systemName}`,
                    },
                    position: {
                        width: 550
                    },
                    content: `<form autocomplete="off" onsubmit="event.preventDefault();"></form>`,
                    buttons: [{
                        action: 'ok',
                        icon: 'fa-solid fa-check',
                        label: 'OK',
                        default: true,
                    }],
                    render: (event, dialog) => {
                        this.systemSettingsDialogList.push(dialog);
                        const html = dialog.element;
                        systemSettingsElement.detach().appendTo($(html).find("form"));
                        this.activateDialogListeners(html);
                    },
                    close: (event, dialog) => {
                        systemSettingsElement.appendTo(systemSettingsContainer);
                        this.systemSettingsDialogList = this.systemSettingsDialogList.filter(d => dialog.appId != d.appId);

                        //apply changes
                        this.onApply();
                    }
                });
            });

            /**
             * Save As
             */
            $(this.element).on("click", "[data-saveas]", async (ev) => {
                let saves = game.user.getFlag("dice-so-nice", "saves");
                let saveList = new Map();
                if (saves)
                    saveList = new Map(Object.entries(saves));

                foundry.applications.api.DialogV2.wait({
                    classes: ["dice-so-nice"],
                    window: {
                        title: "DICESONICE.SaveAs"
                    },
                    position: {
                        width: 550
                    },
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-saveas.hbs",
                        {
                            saveList: saveList.keys()
                        }),
                    buttons: [{
                        action: 'cancel',
                        icon: 'fa-solid fa-ban',
                        label: 'Cancel',
                        default: true,
                    }],
                    render: (event, dialog) => {
                        const html = dialog.element;
                        if (saveList.size) {
                            $(html).on("click", "[data-overwrite]", (ev) => {
                                let name = $(html).find("[data-save-list]").val();
                                this.actionSaveAs(name);
                                dialog.close();
                            });

                            $(html).on("click", "[data-delete]", async (ev) => {
                                let name = $(html).find("[data-save-list]").val();
                                await this.actionDeleteSave(name);
                                saveList.delete(name);
                                $(html).find("[data-save-list] option:selected").remove();
                                if (!saveList.size) {
                                    $(html).find("[data-overwrite]").prop("disabled", true);
                                    $(html).find("[data-delete]").prop("disabled", true);
                                }
                            });

                        } else {
                            $(html).find("[data-overwrite]").prop("disabled", true);
                            $(html).find("[data-delete]").prop("disabled", true);
                        }

                        $(html).on("click", "[data-add-new]", (ev) => {
                            let name = $(html).find("[data-save-name]").val();
                            if (name) {
                                if (saveList.has(name)) {
                                    ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorAlreadyExist"));
                                } else {
                                    this.actionSaveAs(name);
                                    dialog.close();
                                }
                            }
                            else
                                ui.notifications.error(game.i18n.localize("DICESONICE.SaveAsErrorName"));
                        });
                    },
                });
            });

            /**
             * Load
             */
            $(this.element).on("click", "[data-load]", async (ev) => {
                let saves = game.user.getFlag("dice-so-nice", "saves");
                let saveList = [];
                if (saves)
                    saveList = new Map(Object.entries(saves));

                foundry.applications.api.DialogV2.wait({
                    window: {
                        title: "DICESONICE.Load"
                    },
                    position: {
                        width: 550
                    },
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-load.hbs",
                        {
                            saveList: saveList.keys()
                        }),
                    buttons: [{
                        action: "load",
                        icon: "fa-solid fa-box-open",
                        label: "DICESONICE.Load",
                        callback: async (event, button, dialog) => {
                            let name = $(dialog.element).find("[data-save-list]").val();
                            await this.actionLoadSave(name);
                            //Close Dice Settings
                            this.close();
                        }
                    },{
                        action: "no",
                        icon: "fa-solid fa-ban",
                        label: "DICESONICE.Cancel",
                        default: true,
                    }],
                    render: (event, dialog) => {
                        if (!saveList.size)
                            $(dialog.element).find('[data-button="load"]').prop("disabled", true);
                    },
                });
            });


            /**
             * Import
             */
            $(this.element).on("click", "[data-import]", async (ev) => {

                foundry.applications.api.DialogV2.wait({
                    window: {
                        title: "DICESONICE.Import"
                    },
                    position: {
                        width: 400
                    },
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-import.hbs"),
                    buttons: [{
                        action: "import",
                        icon: "fa-solid fa-file-import",
                        label: "DICESONICE.Import",
                        callback: async (event, button, dialog) => {
                            const form = $(dialog.element).find("form")[0];
                            if (!form.data.files.length) return ui.notifications.error(game.i18n.localize("DICESONICE.ImportNoFile"));
                            foundry.utils.readTextFromFile(form.data.files[0]).then(async json => {
                                await this.actionImportFromJSON(json);
                                this.close();
                            });
                        },
                        default: true
                    },{
                        action: "no",
                        icon: "fa-solid fa-ban",
                        label: "DICESONICE.Cancel"
                    }]
                });
            });

            $(this.element).on("click", "[data-export]", async (ev) => {
                const filename = `fvtt-dicesonice-${Date.now()}.json`;
                this.actionExportToJSON().then((json) => {
                    foundry.utils.saveDataToFile(json, "text/json", filename);
                });
            });

            $(this.element).on("click", "[data-exportSFX]", async (ev) => {
                const filename = `fvtt-dicesonice-SFX-${Date.now()}.json`;
                this.actionExportSFXToJSON().then((json) => {
                    foundry.utils.saveDataToFile(json, "text/json", filename);
                });
            });

            $(this.element).on("click", "[data-exportLibrary]", async (ev) => {
                const filename = `fvtt-dicesonice-Library-${Date.now()}.json`;
                const json = this.actionExportLibraryToJSON();
                foundry.utils.saveDataToFile(json, "text/json", filename);
            });

            /**
             * GM: push my config to all other users (#513)
             */
            $(this.element).on("click", "[data-gm-push]", async (ev) => {
                if (!game.user.isGM) return;

                foundry.applications.api.DialogV2.wait({
                    classes: ["dice-so-nice"],
                    window: {
                        title: "DICESONICE.GMPushDialogTitle"
                    },
                    position: {
                        width: 500
                    },
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-gm-push.hbs"),
                    buttons: [{
                        action: "push",
                        icon: "fa-solid fa-share-square",
                        label: "DICESONICE.GMPushConfirm",
                        callback: async (event, button, dialog) => {
                            const form = $(dialog.element).find("form")[0];
                            const parts = {
                                appearance: form.elements.appearance.checked,
                                sfxList: form.elements.sfxList.checked,
                                settings: form.elements.settings.checked
                            };
                            if (!parts.appearance && !parts.sfxList && !parts.settings) {
                                ui.notifications.warn(game.i18n.localize("DICESONICE.GMPushNone"));
                                return;
                            }
                            //persist whatever the GM edited so the push reflects the current UI
                            await this.submit({
                                preventClose: true,
                                preventRender: true
                            });
                            await this.actionGMPushConfig(parts);
                        }
                    }, {
                        action: "cancel",
                        icon: "fa-solid fa-ban",
                        label: "DICESONICE.Cancel",
                        default: true
                    }]
                });
            });

            $(this.element).on("click", "#dice-configuration-canvas", (event) => {
                let rect = event.target.getBoundingClientRect();
                let x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                if (x > 1)
                    x = 1;
                let y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
                let pos = { x: x, y: y };
                let dice = this.showcaseView.findShowcaseDie(pos);
                if (dice) {
                    let diceType = this.showcaseView.findRootObject(dice.object).userData;
                    if (!this.document.getFlag("dice-so-nice", "appearance") && (this.diceFactory.preferredSystem != "standard" || this.diceFactory.preferredColorset != "custom"))
                        this.getShowcaseAppearance();
                    if ($(this.element).find(`.dsn-appearance-tabs [data-tab="${diceType}"]`).length) {
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
                        $(this.element).find(".dsn-appearance-hint").hide();
                        const libraryDiceGroups = DiceLibrary.buildLibraryDiceGroups(diceType, null);
                        foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-appearance.hbs", {
                            dicetype: diceType,
                            appearance: this.currentGlobalAppearance,
                            systemList: this.initializationData.systemList,
                            colorsetList: this.initializationData.colorsetList,
                            textureList: this.initializationData.textureList,
                            materialList: this.initializationData.materialList,
                            fontList: this.initializationData.fontList,
                            showLibrary: LIBRARY_DIE_TYPES.includes(diceType),
                            libraryDiceGroups: libraryDiceGroups,
                            systemSettings: newSystemSettings
                        }).then((html) => {
                            //We add a "title" attribute to all colorsets to give a way to users to see the colorset id
                            //However the FVTT Hdlb helper does not provide such functionnality so we have to do it ourselves
                            html = this.addTitleToOptions(html, '[data-colorset] option');

                            let tabName = diceType.toUpperCase();

                            let insertBefore = null;
                            //let's find where to insert the tab so it keeps the same order as the dice list
                            $(this.element).find(".dsn-appearance-tabs .item").each((index, el) => {
                                if (this.navOrder[$(el).data("tab")] >= this.navOrder[diceType]) {
                                    insertBefore = $(el).data("tab");
                                    return false;
                                }
                            });
                            let htmlNavString = `<span class="item" data-action="tab" data-group="dsn-dice" data-tab="${diceType}">${tabName} <i class="fa-solid fa-times" data-close-tab></i></span>`;
                            if (insertBefore) {
                                $(html).insertBefore($(this.element).find(`.tabAppearance[data-tab="${insertBefore}"]`));
                                $(htmlNavString).insertBefore($(this.element).find(`.dsn-appearance-tabs .item[data-tab="${insertBefore}"]`));
                            } else {
                                $(this.element).find("#dsn-appearance-content").append(html);
                                $(this.element).find(".dsn-appearance-tabs").append(htmlNavString);
                            }
                            this.activateAppearanceTab(diceType);
                            this.toggleCustomization(diceType);
                            this.filterSystems(diceType);
                        });
                    }
                }
            });

            $(this.element).on("change", "[data-imageQuality]", (event) => {
                let quality = {
                    bumpMapping: true,
                    shadowQuality: "high",
                    glow: true,
                    antialiasing: game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa",
                    useHighDPI: true,
                    persistentDiceOutlines: true,
                    advancedGlass: true
                };
                switch (event.target.value) {
                    case "low":
                        quality.bumpMapping = false;
                        quality.shadowQuality = "low";
                        quality.glow = false;
                        quality.antialiasing = "none";
                        quality.useHighDPI = false;
                        quality.persistentDiceOutlines = false;
                        quality.advancedGlass = false;
                        break;
                    case "medium":
                        quality.bumpMapping = true;
                        quality.shadowQuality = "medium";
                        quality.glow = false;
                        quality.antialiasing = "none";
                        quality.useHighDPI = false;
                        quality.persistentDiceOutlines = false;
                        quality.advancedGlass = false;
                        break;
                    case "high":
                        quality.bumpMapping = true;
                        quality.shadowQuality = "high";
                        quality.glow = true;
                        quality.antialiasing = game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa";
                        quality.useHighDPI = true;
                        quality.persistentDiceOutlines = true;
                        quality.advancedGlass = true;
                        break;
                }
                $(this.element).find("[data-bumpMapping]").prop("checked", quality.bumpMapping);
                $(this.element).find("[data-shadowQuality]").val(quality.shadowQuality);
                $(this.element).find("[data-glow]").prop("checked", quality.glow);
                $(this.element).find("[data-antialiasing]").val(quality.antialiasing);
                $(this.element).find("[data-useHighDPI]").prop("checked", quality.useHighDPI);
                $(this.element).find("[data-persistentDiceOutlines]").prop("checked", quality.persistentDiceOutlines);
                $(this.element).find("[data-advancedGlass]").prop("checked", quality.advancedGlass);
            });

            $(this.element).on("change", "[data-bumpMapping],[data-shadowQuality],[data-glow],[data-antialiasing],[data-useHighDPI],[data-persistentDiceOutlines],[data-advancedGlass]", (event) => {
                $(this.element).find("[data-imageQuality]").val("custom");
            });
        }

        this.activateDialogListeners(this.element);
    }

    activateDialogFilePicker(html) {
        $(html).on("click", "button.file-picker", (event) => {
            const filePicker = foundry.applications.apps.FilePicker.fromButton(event.currentTarget);
            filePicker.render(true);
        });
    }

    activateDialogListeners(html) {
        //sync range input with span
        $(html).on("change", "input[type=range]", (event) => {
            const value = $(event.target).val();
            $(event.target).next().text(value);
        });

        //sync span input with range
        $(html).on("change", "span.range-value", (event) => {
            const value = $(event.target).text();
            $(event.target).prev().val(value);
        });

        //sync color picker with input
        $(html).on("change", "input[type=color]", (event) => {
            const value = $(event.target).val();
            $(event.target).prev().val(value);
        });

        //sync input with color picker
        $(html).on("change", "[data-colorpicker]", (event) => {
            const value = $(event.target).val();
            $(event.target).next().val(value);
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

        //collect the GM's current flag values once — offline users get written the same payload
        const payload = {};
        if (parts.appearance) {
            const appearance = foundry.utils.deepClone(game.user.getFlag("dice-so-nice", "appearance") || {});
            //strip cross-user library die refs — they point at the GM's library and won't resolve for other users
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

        //write directly to each non-GM user's flags — works for offline users too, since GMs have permission
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

        $(this.element).find(`.tabAppearance[data-tab="${diceType}"]`).remove();
        $(this.element).find(`.dsn-appearance-tabs [data-tab="${diceType}"]`).remove();

        this.onApply();
    }

    changeTab(tab, group, { force=false } = {}) {
        super.changeTab(tab, group, { force });
        if (group == "dsn-dice") {
            if (this.lastActiveAppearanceTab != "global") {
                let appearanceArray = [];
                let systemSettingsElement = null;
                $(this.element).find(`.tabAppearance[data-tab="global"],.tabAppearance[data-tab="${this.lastActiveAppearanceTab}"]`).each((index, element) => {
                    let obj = {
                        labelColor: $(element).find('[data-labelColor]').val(),
                        diceColor: $(element).find('[data-diceColor]').val(),
                        outlineColor: $(element).find('[data-outlineColor]').val(),
                        edgeColor: $(element).find('[data-edgeColor]').val(),
                        colorset: $(element).find('[data-colorset]').val(),
                        texture: $(element).find('[data-texture]').val(),
                        material: $(element).find('[data-material]').val(),
                        font: $(element).find('[data-font]').val(),
                        system: $(element).find('[data-system]').val(),
                        libraryDie: $(element).find('[data-libraryDie]').val() || ""
                    };
                    if (index == 1)
                        systemSettingsElement = $(element).find('[data-systemSettings]');
                    //disabled systems arent returned
                    if (obj.system == null) {
                        obj.system = this.currentGlobalAppearance.system;
                    }
                    appearanceArray.push(obj);
                });
                if (appearanceArray.length > 1) {
                    let hasDiff = false;
                    //Check if at least one appearance is different
                    hasDiff = !foundry.utils.isEmpty(foundry.utils.diffObject(appearanceArray[0], appearanceArray[1]));

                    //Check if any of the system settings is different from the default settings
                    if (!hasDiff) {
                        for (let setting of this.diceFactory.systems.get(appearanceArray[1].system).settings) {
                            //find the html input value 
                            let settingElement = $(systemSettingsElement).find(`[name="systemSettings[${appearanceArray[1].system}][${setting.id}]"]`);
                            let value;

                            if (setting.type == DiceSystem.SETTING_TYPE.BOOLEAN) {
                                value = settingElement.is(":checked");
                            } else {
                                value = settingElement.val();
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
        let hideAfterRoll = $(this.element).find('[data-hideAfterRoll]')[0].checked;
        $(this.element).find('[data-timeBeforeHide]').prop("disabled", !hideAfterRoll);
        $(this.element).find('[data-hideFX]').prop("disabled", !hideAfterRoll);
    }

    toggleSounds() {
        let sounds = $(this.element).find('[data-sounds]')[0].checked;
        $(this.element).find('[data-soundsSurface]').prop("disabled", !sounds);
        $(this.element).find('[data-soundsVolume]').prop("disabled", !sounds);
        //$('.sounds-range-value').css({ 'opacity': !sounds ? 0.4 : 1 });
    }

    toggleAutoScale() {
        let autoscale = $(this.element).find('[data-autoscale]')[0].checked;
        $(this.element).find('[data-scale]').prop("disabled", autoscale);
        //$('.scale-range-value').css({ 'opacity': autoscale ? 0.4 : 1 });
    }

    toggleCustomColors(dicetype) {
        let scope = $(this.element).find(".tabAppearance");
        if (dicetype) {
            scope = scope.filter(`[data-tab="${dicetype}"]`);
        }
        scope.each((index, element) => {
            const libraryDieVal = $(element).find('[data-libraryDie]').val();
            if (libraryDieVal) return;

            let colorset = $(element).find('[data-colorset]');
            let disabled = colorset.val() !== 'custom' || colorset.prop("disabled");
            $(element).find('[data-labelColor]').prop("disabled", disabled);
            $(element).find('[data-diceColor]').prop("disabled", disabled);
            $(element).find('[data-outlineColor]').prop("disabled", disabled);
            $(element).find('[data-edgeColor]').prop("disabled", disabled);
            $(element).find('[data-labelColorSelector]').prop("disabled", disabled);
            $(element).find('[data-diceColorSelector]').prop("disabled", disabled);
            $(element).find('[data-outlineColorSelector]').prop("disabled", disabled);
            $(element).find('[data-edgeColorSelector]').prop("disabled", disabled);
        });
    }

    toggleCustomization(diceType = null) {
        let container;
        if (diceType) {
            container = $(this.element).find(`.tabAppearance[data-tab="${diceType}"]`);
        } else {
            container = $(this.element).find(`.tabAppearance`);
        }

        container.each((index, element) => {
            let diceType = $(element).data("tab");
            if (diceType != "global") {
                //library die selected: disable all appearance controls
                const libraryDieVal = $(element).find('[data-libraryDie]').val();
                const allAppearanceControls = $(element).find('[data-colorset],[data-texture],[data-material],[data-font],[data-labelColor],[data-diceColor],[data-outlineColor],[data-edgeColor],[data-labelColorSelector],[data-diceColorSelector],[data-outlineColorSelector],[data-edgeColorSelector]');
                if (libraryDieVal) {
                    allAppearanceControls.prop("disabled", true);
                    return;
                }

                let system = $(element).find('[data-system]').val();
                let customizationElements = $(element).find('[data-colorset],[data-texture],[data-material],[data-font]');
                if (system != "standard") {
                    let diceobj = this.diceFactory.systems.get(system).dice.get(diceType);
                    if (diceobj) {
                        let colorsetData = {};
                        if (diceobj.colorset) {
                            colorsetData = DiceColors.getColorSet(diceobj.colorset);
                        }
                        customizationElements.each((index, el) => {
                            let colorsetForce = false;
                            if ($(el).is("[data-colorset]") && !foundry.utils.isEmpty(colorsetData))
                                colorsetForce = true;
                            else if ($(el).is("[data-texture]") && !foundry.utils.isEmpty(colorsetData) && colorsetData.texture != "custom")
                                colorsetForce = true;
                            else if ($(el).is("[data-material]") && !foundry.utils.isEmpty(colorsetData) && colorsetData.material != "custom")
                                colorsetForce = true;
                            else if ($(el).is("[data-font]") && ((!foundry.utils.isEmpty(colorsetData) && colorsetData.font != "custom") || diceobj.font))
                                colorsetForce = true;
                            $(el).prop("disabled", diceobj.modelFile || colorsetForce);
                        });
                    }
                } else {
                    customizationElements.prop("disabled", false);
                }
            }
        });
        this.toggleCustomColors(diceType);
    }

    filterSystems(diceType = null) {
        let container;
        if (diceType) {
            container = $(this.element).find(`.tabAppearance[data-tab="${diceType}"] [data-system]`);
        } else {
            container = $(this.element).find(`.tabAppearance [data-system]`);
        }
        container.each((index, element) => {
            let diceType = $(element).data("dicetype");
            if (diceType != "global") {
                $(element).find("option").each((indexOpt, elementOpt) => {
                    let model = this.diceFactory.systems.get("standard").dice.get(diceType);
                    if (!this.diceFactory.systems.get($(elementOpt).val()).dice.has(diceType) || !this.diceFactory.systems.get($(elementOpt).val()).getDiceByShapeAndValues(model.shape, model.values))
                        $(elementOpt).attr("disabled", "disabled");
                });
            }
        });
    }

    setPreferredOptions() {
        if (!game.user.getFlag("dice-so-nice", "appearance") && !this.document.getFlag("dice-so-nice", "appearance")) {
            if (this.diceFactory.preferredSystem != "standard")
                $(this.element).find('.tabAppearance[data-tab="global"] [data-system]').val(this.diceFactory.preferredSystem);
            if (this.diceFactory.preferredColorset != "custom")
                $(this.element).find('.tabAppearance[data-tab="global"] [data-colorset]').val(this.diceFactory.preferredColorset);
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
            config = {
                autoscale: false,
                scale: 60,
                shadowQuality: $('[data-shadowQuality]').val(),
                imageQuality: $('[data-imageQuality]').val(),
                antialiasing: $('[data-antialiasing]').val(),
                bumpMapping: $('[data-bumpMapping]').is(':checked'),
                glow: $('[data-glow]').is(':checked'),
                sounds: $('[data-sounds]').is(':checked'),
                throwingForce: $('[data-throwingForce]').val(),
                useHighDPI: $('[data-useHighDPI]').is(':checked'),
                advancedGlass: $('[data-advancedGlass]').is(':checked'),
                showExtraDice: $('[data-showExtraDice]').is(':checked'),
                muteSoundSecretRolls: $('[data-muteSoundSecretRolls]').is(':checked'),
                enableFlavorColorset: $('[data-enableFlavorColorset]').is(':checked'),
                immersiveDarkness: $('[data-immersiveDarkness]').is(':checked'),
                appearance: {}
            };
        }
        $(this.element).find('.tabAppearance').each((index, element) => {
            config.appearance[$(element).data("tab")] = {
                labelColor: $(element).find('[data-labelColor]').val(),
                diceColor: $(element).find('[data-diceColor]').val(),
                outlineColor: $(element).find('[data-outlineColor]').val(),
                edgeColor: $(element).find('[data-edgeColor]').val(),
                colorset: $(element).find('[data-colorset]').val(),
                texture: $(element).find('[data-texture]').val(),
                material: $(element).find('[data-material]').val(),
                font: $(element).find('[data-font]').val(),
                system: $(element).find('[data-system]').val(),
                ...DiceConfig._parseLibraryDieValue($(element).find('[data-libraryDie]').val())
            };

            const systemSettingsRaw = {};
            const systemSettingsFields = $(element).find('[data-systemsettings]').find('input, select');
            systemSettingsFields.each((index, element) => {
                let name = $(element).attr("name");
                //keep only the last string between the last "[" and "]"
                name = name.substring(name.lastIndexOf("[") + 1, name.lastIndexOf("]"));

                //if it is a checkbox, we need to convert "on" to true and "off" to false
                if ($(element).is(':checkbox')) {
                    systemSettingsRaw[name] = $(element).is(':checked') ? true : false;
                } else {
                    systemSettingsRaw[name] = $(element).val();
                }
            });

            const system = this.diceFactory.systems.get(config.appearance[$(element).data("tab")].system);
            if (system && system.settings.length > 0) {
                const systemSettingsList = system.settings;
                const systemSettingsIDs = systemSettingsList.map(setting => setting.id);

                //Only keep settings form entries that are in the system settings id list. systemSettings is an object with the ids as keys
                config.appearance[$(element).data("tab")].systemSettings = Object.fromEntries(Object.entries(systemSettingsRaw).filter(([key]) => systemSettingsIDs.includes(key)));
            }
        });

        config.diceLibrary = DiceLibrary.getLibraryForUser(game.user);
        this.currentGlobalAppearance = config.appearance.global;
        return config;
    }

    refreshLibraryDropdown(dieType = null) {
        const tabs = dieType
            ? $(this.element).find(`.tabAppearance[data-tab="${dieType}"]`)
            : $(this.element).find('.tabAppearance').not('[data-tab="global"]');

        tabs.each((_, element) => {
            const tab = $(element).data("tab");
            const select = $(element).find('[data-libraryDie]');
            if (!select.length) return;
            const currentVal = select.val() || "";
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
            select.html(html);
        });
    }

    //Not used because SFX aren't initialized. Keeping it here for later use.
    getShowcaseSFX() {
        let sfxList = [];

        $(this.element).find('.sfx-line').each((index, element) => {
            let sfx = {
                diceType: $(element).find('[data-sfx-dicetype]').val(),
                onResult: $(element).find('[data-sfx-result]').val(),
                specialEffect: $(element).find('[data-sfx-specialeffect]').val(),
                options: {}
            };
            $(element).find("[data-sfx-hidden-options]").find("input,select").each((i, el) => {
                let name = $(el).attr("name").match(/.*\[(.*)\]$/)[1];
                if ($(el).attr("type") == "checkbox")
                    sfx.options[name] = $(el).prop("checked");
                else
                    sfx.options[name] = $(el).val();
            });
            if (sfx.diceType && sfx.onResult && sfx.specialEffect)
                sfxList.push(sfx);
        });
        return sfxList;
    }

    onApply(event = null) {
        if (event)
            event.preventDefault();

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
        }, 100);
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
                //also prevent bug #217, unknown cause
                if (sfxLine[i].diceType == undefined || sfxLine[i].diceType == "" || sfxLine[i].onResult == "" || Array.isArray(sfxLine[i].diceType) || Array.isArray(sfxLine[i].specialEffect))
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

    close(options) {
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