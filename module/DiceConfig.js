import { Dice3D } from './Dice3D.js';
import { DiceBox } from './DiceBox.js';
import { DiceSFXManager } from './DiceSFXManager.js';
import { Utils } from './Utils.js';
import { DiceNotation } from './DiceNotation.js';
import { DiceColors, DICE_SCALE } from './DiceColors.js';
import { DiceSystem } from './DiceSystem.js';

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
            title: "DICESONICE.configTitle",
            contentClasses: ["standard-form"]
        },
        id: "dice-config",
        position: {
            width: 680,
            height: "auto"
        }
    };

    static TABS = {
        "dsn-main": {
            tabs: [
                { id: "general", icon: "fa-solid fa-dice-d20", label: "DICESONICE.settingsAppearance" },
                { id: "preferences", icon: "fa-solid fa-cog", label: "DICESONICE.settingsPreferences" },
                { id: "sfx", icon: "fa-solid fa-meteor", label: "DICESONICE.settingsSpecialEffects" },
                { id: "performance", icon: "fa-solid fa-tachometer-alt", label: "DICESONICE.settingsPerformance" },
                { id: "backup", icon: "fa-solid fa-upload", label: "DICESONICE.settingsBackup" }
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
        backup: {
            template: "modules/dice-so-nice/templates/dice-config-backup.hbs",
            scrollable: [""]
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        context.tab = context.tabs[partId];
        return context;
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
            canvasZIndexList: Utils.localize({
                "over": "DICESONICE.CanvasZIndexOver",
                "under": "DICESONICE.CanvasZIndexUnder",
            }),
            throwingForceList: Utils.localize({
                "weak": "DICESONICE.ThrowingForceWeak",
                "medium": "DICESONICE.ThrowingForceMedium",
                "strong": "DICESONICE.ThrowingForceStrong"
            })
        },
            this.reset ? Dice3D.ALL_DEFAULT_OPTIONS() : Dice3D.ALL_CONFIG()
        );
        delete data.sfxLine;

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
        let config = foundry.utils.mergeObject(
            this.reset ? Dice3D.ALL_DEFAULT_OPTIONS() : Dice3D.ALL_CONFIG(),
            { dimensions: { width: 634, height: 245 }, autoscale: false, scale: 60, boxType: "showcase" }
        );

        this.box = new DiceBox(this.canvas, game.dice3d.box.dicefactory, config);
        await this.box.initialize();
        if (!game.user.getFlag("dice-so-nice", "appearance")) {
            if (this.box.dicefactory.preferredSystem != "standard")
                config.appearance.global.system = this.box.dicefactory.preferredSystem;
            if (this.box.dicefactory.preferredColorset != "standard")
                config.appearance.global.colorset = this.box.dicefactory.preferredColorset;
        }
        await this.box.showcase(config);

        this.navOrder = {};
        let triggerTypeList = [{ id: "", name: "" }];
        this.possibleResultList = {};
        let i = 0;
        this.box.diceList.forEach((el) => {
            this.navOrder[el.userData] = i++;
            triggerTypeList.push({ id: el.userData, name: el.userData });
            this.possibleResultList[el.userData] = [];
            let preset = this.box.dicefactory.systems.get("standard").dice.get(el.userData);
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

            //add special triggers, like "keep hihest" (kh)
            this.possibleResultList[el.userData].push({ id: "kh", name: "Keep Highest" });
            this.possibleResultList[el.userData].push({ id: "kl", name: "Keep Lowest" });
        });

        let specialEffectsList = [];
        let specialEffectsPromises = [];
        let specialEffects = Dice3D.SFX();
        if (this.reset)
            specialEffects = [];
        this.triggerTypeList = [...triggerTypeList, ...DiceSFXManager.EXTRA_TRIGGER_TYPE];
        foundry.utils.mergeObject(this.possibleResultList, DiceSFXManager.EXTRA_TRIGGER_RESULTS, { performDeletions: true });

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

                specialEffectsPromises.push(foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.html", {
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

                if (this.box.dicefactory.systems.has(data.appearance[scope].system)) {
                    const system = this.box.dicefactory.systems.get(data.appearance[scope].system);

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
            tabsPromises.push(foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-appearance.html", {
                dicetype: diceType,
                appearance: data.appearance[diceType],
                systemList: data.systemList,
                colorsetList: data.colorsetList,
                textureList: data.textureList,
                materialList: data.materialList,
                fontList: data.fontList,
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


        this.toggleHideAfterRoll();
        this.toggleAutoScale();
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

            $(this.element).on("change", "[data-system]", (ev) => {
                this.toggleCustomization($(ev.target).data("dicetype"));

                //replace system settings
                const systemSettingsContainer = $(ev.target).parents(".tabAppearance").find('[data-systemsettings-hidden]');
                systemSettingsContainer.children().remove();

                const system = this.box.dicefactory.systems.get($(ev.target).val());

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

            $(this.element).on("click", "[data-action=test]", (ev) => {
                let config = this.getShowcaseAppearance();
                let denominationList = [];
                this.box.diceList.forEach((el) => {
                    //the d100 will roll the d10 so we remove the d10 from the list
                    if (el.userData != "d10")
                        denominationList.push(el.userData);
                });
                let roll = new Roll(denominationList.join("+")).evaluate().then((roll) => {
                    let data = new DiceNotation(roll);

                    let specialEffects = this.getShowcaseSFX();
                    let customization = foundry.utils.mergeObject({ appearance: config.appearance }, { specialEffects: specialEffects }, { performDeletions: true });

                    game.dice3d._showAnimation(data, customization);
                });
            });

            $(this.element).on("click", "[data-sfx-create]", (ev) => {
                let ID = $(this.element).find(".sfx-line").length;
                let firstSFX = Object.keys(DiceSFXManager.SFX_MODE_LIST)[0];
                let sfxClass = DiceSFXManager.SFX_MODE_CLASS[firstSFX];
                let dialogContent = sfxClass.getDialogContent({}, ID);
                let hdbsTemplate = Handlebars.compile(dialogContent.content);
                foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-sfx.html", {
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
                        title: "DICESONICE.Options"
                    },
                    position: {
                        width: 400
                    },
                    content: `<form autocomplete="off" onsubmit="event.preventDefault();"></form>`,
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
                const systemName = this.box.dicefactory.systems.get(systemSelected).name;

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
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-saveas.html",
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
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-load.html",
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
                    content: await foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/dialog-import.html"),
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

            $(this.element).on("click", "#dice-configuration-canvas", (event) => {
                let rect = event.target.getBoundingClientRect();
                let x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                if (x > 1)
                    x = 1;
                let y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
                let pos = { x: x, y: y };
                let dice = this.box.findShowcaseDie(pos);
                if (dice) {
                    let diceType = this.box.findRootObject(dice.object).userData;
                    if (!game.user.getFlag("dice-so-nice", "appearance") && (this.box.dicefactory.preferredSystem != "standard" || this.box.dicefactory.preferredColorset != "custom"))
                        this.getShowcaseAppearance();
                    if ($(this.element).find(`.dsn-appearance-tabs [data-tab="${diceType}"]`).length) {
                        this.activateAppearanceTab(diceType);
                    } else {
                        let newSystemSettings = {};
                        if (this.box.dicefactory.systems.has(this.currentGlobalAppearance.system)) {
                            const system = this.box.dicefactory.systems.get(this.currentGlobalAppearance.system);

                            if (system.settings.length > 0) {
                                const dialogContent = system.getSettingsDialogContent(diceType);

                                if (dialogContent.content != "") {
                                    const hdbsTemplate = Handlebars.compile(dialogContent.content);
                                    newSystemSettings = hdbsTemplate(dialogContent.data);
                                }
                            }
                        }
                        $(this.element).find(".dsn-appearance-hint").hide();
                        foundry.applications.handlebars.renderTemplate("modules/dice-so-nice/templates/partial-appearance.html", {
                            dicetype: diceType,
                            appearance: this.currentGlobalAppearance,
                            systemList: this.initializationData.systemList,
                            colorsetList: this.initializationData.colorsetList,
                            textureList: this.initializationData.textureList,
                            materialList: this.initializationData.materialList,
                            fontList: this.initializationData.fontList,
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
                    useHighDPI: true
                };
                switch (event.target.value) {
                    case "low":
                        quality.bumpMapping = false;
                        quality.shadowQuality = "low";
                        quality.glow = false;
                        quality.antialiasing = "none";
                        quality.useHighDPI = false;
                        break;
                    case "medium":
                        quality.bumpMapping = true;
                        quality.shadowQuality = "low";
                        quality.glow = false;
                        quality.antialiasing = "none";
                        quality.useHighDPI = false;
                        break;
                    case "high":
                        quality.bumpMapping = true;
                        quality.shadowQuality = "high";
                        quality.glow = true;
                        quality.antialiasing = game.canvas.app.renderer.context.webGLVersion === 2 ? "msaa" : "smaa";
                        quality.useHighDPI = true;
                        break;
                }
                $(this.element).find("[data-bumpMapping]").prop("checked", quality.bumpMapping);
                $(this.element).find("[data-shadowQuality]").val(quality.shadowQuality);
                $(this.element).find("[data-glow]").prop("checked", quality.glow);
                $(this.element).find("[data-antialiasing]").val(quality.antialiasing);
                $(this.element).find("[data-useHighDPI]").prop("checked", quality.useHighDPI);
            });

            $(this.element).on("change", "[data-bumpMapping],[data-shadowQuality],[data-glow],[data-antialiasing],[data-useHighDPI]", (event) => {
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
        let data = {
            appearance: game.user.getFlag("dice-so-nice", "appearance"),
            sfxList: game.user.getFlag("dice-so-nice", "sfxList"),
            settings: game.user.getFlag("dice-so-nice", "settings"),
            saves: game.user.getFlag("dice-so-nice", "saves")
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

    async actionImportFromJSON(json) {
        let data = JSON.parse(json);

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
                        system: $(element).find('[data-system]').val()
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
                        for (let setting of this.box.dicefactory.systems.get(appearanceArray[1].system).settings) {
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
                let system = $(element).find('[data-system]').val();
                let customizationElements = $(element).find('[data-colorset],[data-texture],[data-material],[data-font]');
                if (system != "standard") {
                    let diceobj = this.box.dicefactory.systems.get(system).dice.get(diceType);
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
                    let model = this.box.dicefactory.systems.get("standard").dice.get(diceType);
                    if (!this.box.dicefactory.systems.get($(elementOpt).val()).dice.has(diceType) || !this.box.dicefactory.systems.get($(elementOpt).val()).getDiceByShapeAndValues(model.shape, model.values))
                        $(elementOpt).attr("disabled", "disabled");
                });
            }
        });
    }

    setPreferredOptions() {
        if (!game.user.getFlag("dice-so-nice", "appearance")) {
            if (this.box.dicefactory.preferredSystem != "standard")
                $(this.element).find('.tabAppearance[data-tab="global"] [data-system]').val(this.box.dicefactory.preferredSystem);
            if (this.box.dicefactory.preferredColorset != "custom")
                $(this.element).find('.tabAppearance[data-tab="global"] [data-colorset]').val(this.box.dicefactory.preferredColorset);
        }
    }

    getShowcaseAppearance() {
        let config = {
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
            showExtraDice: $('[data-showExtraDice]').is(':checked'),
            muteSoundSecretRolls: $('[data-muteSoundSecretRolls]').is(':checked'),
            enableFlavorColorset: $('[data-enableFlavorColorset]').is(':checked'),
            immersiveDarkness: $('[data-immersiveDarkness]').is(':checked'),
            appearance: {}
        };
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
                system: $(element).find('[data-system]').val()
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

            const system = this.box.dicefactory.systems.get(config.appearance[$(element).data("tab")].system);
            if (system && system.settings.length > 0) {
                const systemSettingsList = system.settings;
                const systemSettingsIDs = systemSettingsList.map(setting => setting.id);

                //Only keep settings form entries that are in the system settings id list. systemSettings is an object with the ids as keys
                config.appearance[$(element).data("tab")].systemSettings = Object.fromEntries(Object.entries(systemSettingsRaw).filter(([key]) => systemSettingsIDs.includes(key)));
            }
        });

        this.currentGlobalAppearance = config.appearance.global;
        return config;
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

        setTimeout(() => {
            let config = this.getShowcaseAppearance();
            this.box.dicefactory.disposeCachedMaterials("showcase");
            this.box.update(config).then(() => {
                this.box.showcase(config);
            });
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
        //Remove custom settings if custom isn't selected to prevent losing them in the user save
        formData = this.parseInputs(formData.object);
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
            if (formData.appearance[scope].colorset != "custom") {
                delete formData.appearance[scope].labelColor;
                delete formData.appearance[scope].diceColor;
                delete formData.appearance[scope].outlineColor;
                delete formData.appearance[scope].edgeColor;
            }

            // filter form system settings based on the system settings to remove helpers and selectors
            systemsInUse.add(formData.appearance[scope].system);
            const system = this.box.dicefactory.systems.get(formData.appearance[scope].system);
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
        let appearance = foundry.utils.mergeObject(Dice3D.APPEARANCE(), formData.appearance, { insertKeys: true, insertValues: false, performDeletions: true });

        //So we add back the system settings to the appearance
        for (let scope of scopedAppearance) {
            if (formData.appearance[scope].systemSettings) {
                appearance[scope].systemSettings = formData.appearance[scope].systemSettings;
            }
        }

        delete formData.appearance;
        let settings = foundry.utils.mergeObject(Dice3D.CONFIG(), formData, { insertKeys: false, insertValues: false, performDeletions: true });

        // preserve rollingArea config
        settings.rollingArea = currentSettings.rollingArea;

        await game.user.setFlag('dice-so-nice', 'settings', settings);
        await game.user.setFlag("dice-so-nice", "appearance", appearance);
        await game.user.setFlag("dice-so-nice", "sfxList", sfxLine);

        game.socket.emit("module.dice-so-nice", { type: "update", user: game.user.id });
        DiceSFXManager.init();
        for (let system of systemsInUse) {
            this.box.dicefactory.systems.get(system).loadSettings();
        }
        ui.notifications.info(game.i18n.localize("DICESONICE.saveMessage"));

        let reloadRequired = Utils.RELOAD_REQUIRED_IF_MODIFIED.some(setting => settings[setting] != currentSettings[setting]);

        if (reloadRequired) {
            foundry.applications.settings.SettingsConfig.reloadConfirm();
        } else {
            game.dice3d.update(settings);
        }
    }

    close(options) {
        super.close(options);
        this.box.clearScene();
        this.box.dicefactory.disposeCachedMaterials("showcase");
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