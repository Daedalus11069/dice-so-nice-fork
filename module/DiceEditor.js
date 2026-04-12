import { DiceEditorPreview } from './DiceEditorPreview.js';
import { DiceLibrary } from './DiceLibrary.js';
import { DiceColors } from './DiceColors.js';
import { DICE_SHAPE } from './DiceModels.js';
import { Utils } from './Utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

//dice editor - create/edit custom dice face-by-face
export class DiceEditor extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["dice-so-nice", "dice-editor-app"],
        form: {
            handler: DiceEditor._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        window: {
            title: "DICESONICE.editorTitle",
            contentClasses: ["standard-form"],
            resizable: true
        },
        id: "dice-editor",
        position: {
            width: 580,
            height: "auto"
        }
    };

    static PARTS = {
        editor: {
            template: "modules/dice-so-nice/templates/dice-editor.hbs",
            scrollable: [".dice-editor-properties"]
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    constructor(dieType, libraryDie = null, options = {}) {
        super(options);
        this.dieType = dieType;
        this.onSaveCallback = options.onSave || null;

        if (libraryDie) {
            this.libraryDie = foundry.utils.deepClone(libraryDie);
            this.isNew = false;
        } else {
            //init from current appearance, prefer live DiceConfig form values over persisted flag
            const factory = game.dice3d.box.dicefactory;
            const diceConfig = options.diceConfig || null;
            const appearances = diceConfig
                ? diceConfig.getShowcaseAppearance().appearance
                : (game.user.getFlag("dice-so-nice", "appearance") || {});
            const resolved = factory.getAppearanceForDice(appearances, dieType);
            this.libraryDie = DiceLibrary.createEmptyDie(dieType, `Custom ${dieType.toUpperCase()}`);

            //themes use arrays for random variation, pick one snapshot
            const pick = (val, fallback) => {
                if (Array.isArray(val)) return val.length > 0 ? val[Math.floor(Math.random() * val.length)] : fallback;
                return val || fallback;
            };

            this.libraryDie.baseAppearance.diceColor = pick(resolved.background, "#000000");
            this.libraryDie.baseAppearance.labelColor = pick(resolved.foreground, "#FFFFFF");
            this.libraryDie.baseAppearance.outlineColor = pick(resolved.outline, "");
            this.libraryDie.baseAppearance.edgeColor = pick(resolved.edge, "");
            //editor forces colorset=custom, so resolve texture from colorset data if needed
            let effectiveTexture = pick(resolved.texture, "none");
            if (effectiveTexture === "none" && resolved.colorset && resolved.colorset !== "custom") {
                const colorsetData = DiceColors.getColorSet(resolved.colorset);
                if (colorsetData.texture && colorsetData.texture !== "custom" && colorsetData.texture !== "none") {
                    let tex = Array.isArray(colorsetData.texture)
                        ? colorsetData.texture[Math.floor(Math.random() * colorsetData.texture.length)]
                        : colorsetData.texture;
                    effectiveTexture = (typeof tex === "object" && tex.name) ? tex.name : tex;
                }
            }
            if (typeof effectiveTexture === "object" && effectiveTexture.name) {
                effectiveTexture = effectiveTexture.name;
            }
            this.libraryDie.baseAppearance.texture = effectiveTexture;
            //resolve "auto" material from texture (e.g. bronze => metal)
            let effectiveMaterial = resolved.material || "plastic";
            if (effectiveMaterial === "auto" && effectiveTexture && effectiveTexture !== "none") {
                const texData = DiceColors.getTexture(effectiveTexture);
                if (texData && texData.material) effectiveMaterial = texData.material;
            }
            this.libraryDie.baseAppearance.material = effectiveMaterial;
            this.libraryDie.baseAppearance.font = resolved.font || "auto";
            this.libraryDie.baseAppearance.system = resolved.system || "standard";

            //if preset has emissive maps (Spectrum, Dot), pre-populate faces with glow
            const diceobj = factory.getPresetBySystem(dieType, resolved.system || "standard");
            if (diceobj && diceobj.emissive && diceobj.emissive !== 0x000000) {
                this.libraryDie.baseAppearance.emissive = true;
                const shapeData = DICE_SHAPE[diceobj.shape];
                const shapeFaceCount = shapeData ? shapeData.faceValues.filter(v => v !== 0).length : diceobj.values.length;
                for (let f = 1; f <= shapeFaceCount; f++) {
                    this.libraryDie.faces[String(f)] = { emissive: true };
                }
            }

            this.isNew = true;
        }

        this.selectedFaces = new Set();
        this.preview = null;
    }

    async _prepareContext(options) {
        const data = {};
        data.dieType = this.dieType;
        data.dieName = this.libraryDie.name;
        data.baseAppearance = this.libraryDie.baseAppearance;

        data.textureList = Utils.prepareTextureList();
        data.materialList = Utils.localize({
            "auto": "DICESONICE.MaterialAuto",
            "chrome": "DICESONICE.MaterialChrome",
            "glass": "DICESONICE.MaterialGlass",
            "iridescent": "DICESONICE.MaterialIridescent",
            "metal": "DICESONICE.MaterialMetal",
            "plastic": "DICESONICE.MaterialPlastic",
            "pristine": "DICESONICE.MaterialPristine",
            "stone": "DICESONICE.MaterialStone",
            "wood": "DICESONICE.MaterialWood"
        });
        data.fontList = Utils.prepareFontList();

        data.facePropsHtml = await foundry.applications.handlebars.renderTemplate(
            "modules/dice-so-nice/templates/dice-editor-face-props.hbs",
            {
                faceLabelText: "",
                faceFont: "",
                faceFontScale: 100,
                faceForeground: "",
                faceBackground: "",
                faceOutline: "",
                faceLabelImage: "",
                faceLabelImageScale: 100,
                faceLabelImageFlip: false,
                faceLabelImagePosition: 50,
                faceTexture: "",
                faceEmissive: false,
                fontList: data.fontList,
                textureList: data.textureList
            }
        );

        data.buttons = [
            { type: "submit", icon: "fa-solid fa-save", label: "DICESONICE.Save" },
            { type: "button", action: "resetFaces", icon: "fa-solid fa-undo", label: "DICESONICE.editorResetFace" },
            { type: "button", action: "close", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel" }
        ];

        data.tabs = {};
        return data;
    }

    _onRender(context, options) {
        const html = $(this.element);

        html.off(".diceEditor");

        const previewContainer = html.find("#dice-editor-preview-container")[0];
        if (previewContainer && !this.preview) {
            this.preview = new DiceEditorPreview(previewContainer, game.dice3d.box.dicefactory);
            this.preview.onFaceSelect = (faces) => this._onFaceSelect(faces);
            this.preview.init().then(() => this._refreshPreview());
        }

        html.on("change.diceEditor", "[name=baseMaterial]", () => this._onGlobalChange());
        html.on("change.diceEditor", "[name=baseEdgeColor]", () => this._onGlobalChange());
        html.on("change.diceEditor", "[name=baseDiceColor]", () => this._onGlobalChange());
        html.on("change.diceEditor", "[name=baseTexture]", () => this._onGlobalChange());
        html.on("change.diceEditor", "[name=dieName]", (ev) => {
            this.libraryDie.name = ev.target.value;
        });

        //rebuild mesh on "change" (picker closed), not every "input" frame
        html.on("input.diceEditor", "input[type=color]", (ev) => {
            const editTarget = $(ev.target).data("edit");
            if (editTarget) {
                html.find(`[name=${editTarget}]`).val(ev.target.value);
            }
        });
        html.on("change.diceEditor", "input[type=color]", (ev) => {
            const editTarget = $(ev.target).data("edit");
            if (editTarget) {
                html.find(`[name=${editTarget}]`).val(ev.target.value).trigger("change");
            }
        });

        html.on("change.diceEditor", "[name^=face]", () => this._onFacePropertyChange());
        html.on("input.diceEditor", "input[type=range]", (ev) => {
            $(ev.target).next(".range-value").text(ev.target.value);
        });
        html.on("click.diceEditor", "[data-face-filepicker]", () => this._onFilePicker());

        html.on("click.diceEditor", "[data-action=resetFaces]", () => this._onResetFace());
    }

    _onGlobalChange() {
        const html = $(this.element);
        this.libraryDie.baseAppearance.material = html.find("[name=baseMaterial]").val();
        this.libraryDie.baseAppearance.edgeColor = html.find("[name=baseEdgeColor]").val();
        this.libraryDie.baseAppearance.diceColor = html.find("[name=baseDiceColor]").val();
        this.libraryDie.baseAppearance.texture = html.find("[name=baseTexture]").val();
        this._refreshPreview();
    }

    _getShapeFaceDisplay(shapeFaceValue) {
        const typeMap = this.preview?._shapeToTypeValue || {};
        const typeLabels = this.preview?._typeValueLabels || {};
        const tv = typeMap[shapeFaceValue] !== undefined ? typeMap[shapeFaceValue] : shapeFaceValue;
        const label = typeLabels[tv];
        return { typeValue: tv, label: label && label.trim() ? label : String(tv) };
    }

    _onFaceSelect(faces) {
        this.selectedFaces = faces;
        const html = $(this.element);

        if (faces.size === 0) {
            html.find("[data-face-indicator]").text(game.i18n.localize("DICESONICE.editorClickFace"));
            html.find("[data-face-props]").hide();
            return;
        }

        const shapeFaces = [...faces].sort((a, b) => Number(a) - Number(b));
        const isD4 = this.libraryDie.dieType === "d4";
        const faceLabel = shapeFaces.map(sf => {
            const { typeValue } = this._getShapeFaceDisplay(sf);
            //d4 has no single "face" in the usual sense - each triangle shows three vertex digits,
            //so we edit by die value and let users discover the mapping by trial and error.
            if (isD4) return `Value ${sf}`;
            return typeValue !== sf ? `Face ${sf} (${typeValue})` : `Face ${sf}`;
        }).join(", ");
        html.find("[data-face-indicator]").text(faceLabel);
        html.find("[data-face-props]").show();
        this._clampToViewport();

        if (faces.size === 1) {
            const shapeFace = String(shapeFaces[0]);
            const faceData = this.libraryDie.faces[shapeFace] || {};
            const { label: defaultLabel } = this._getShapeFaceDisplay(shapeFaces[0]);
            html.find("[name=faceLabelText]").val(faceData.labelText || "").attr("placeholder", defaultLabel);
            html.find("[name=faceFont]").val(faceData.font || "");
            html.find("[name=faceFontScale]").val(faceData.fontScale ?? 100);
            html.find("[name=faceFontScale]").closest(".form-group").find(".range-value").text((faceData.fontScale ?? 100) + "%");
            html.find("[name=faceForeground]").val(faceData.foreground || "");
            html.find("[name=faceBackground]").val(faceData.background || "");
            html.find("[name=faceOutline]").val(faceData.outline || "");
            html.find("[name=faceLabelImage]").val(faceData.labelImage || "");
            html.find("[name=faceLabelImageScale]").val(faceData.labelImageScale ?? 100);
            html.find("[name=faceLabelImageFlip]").prop("checked", !!faceData.labelImageFlip);
            html.find("[name=faceLabelImagePosition]").val(faceData.labelImagePosition ?? 50);
            html.find(".label-image-controls").toggle(!!faceData.labelImage);
            html.find("[name=faceTexture]").val(faceData.backgroundTexture || "");
            html.find("[name=faceEmissive]").prop("checked", !!faceData.emissive);
            html.find("[name=faceEmissiveColor]").val(faceData.emissiveColor || "");
            const base = this.libraryDie.baseAppearance;
            html.find("[name=faceForegroundSelector]").val(faceData.foreground || base.labelColor || "#FFFFFF");
            html.find("[name=faceBackgroundSelector]").val(faceData.background || base.diceColor || "#000000");
            html.find("[name=faceOutlineSelector]").val(faceData.outline || base.outlineColor || "#000000");
        } else {
            html.find("[name=faceLabelText]").val("").attr("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            html.find("[name=faceFont]").val("");
            html.find("[name=faceFontScale]").val(100);
            html.find("[name=faceFontScale]").closest(".form-group").find(".range-value").text("100%");
            html.find("[name=faceForeground]").val("").attr("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            html.find("[name=faceBackground]").val("").attr("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            html.find("[name=faceOutline]").val("").attr("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            html.find("[name=faceLabelImage]").val("");
            html.find("[name=faceLabelImageScale]").val(100);
            html.find("[name=faceLabelImageFlip]").prop("checked", false);
            html.find("[name=faceLabelImagePosition]").val(50);
            html.find(".label-image-controls").hide();
            html.find("[name=faceTexture]").val("");
            html.find("[name=faceEmissive]").prop("checked", false);
            const base = this.libraryDie.baseAppearance;
            html.find("[name=faceForegroundSelector]").val(base.labelColor || "#FFFFFF");
            html.find("[name=faceBackgroundSelector]").val(base.diceColor || "#000000");
            html.find("[name=faceOutlineSelector]").val(base.outlineColor || "#000000");
        }
    }

    _clampToViewport() {
        const el = this.element;
        const rect = el.getBoundingClientRect();
        const overflow = rect.bottom - window.innerHeight;
        if (overflow > 0) {
            const newTop = Math.max(0, rect.top - overflow - 10);
            this.setPosition({ top: newTop });
        }
    }

    _onFacePropertyChange() {
        const html = $(this.element);

        const faceData = {};
        const labelText = html.find("[name=faceLabelText]").val();
        const font = html.find("[name=faceFont]").val();
        const fontScale = parseInt(html.find("[name=faceFontScale]").val()) || 100;
        const foreground = html.find("[name=faceForeground]").val();
        const background = html.find("[name=faceBackground]").val();
        const outline = html.find("[name=faceOutline]").val();
        const labelImage = html.find("[name=faceLabelImage]").val();
        const backgroundTexture = html.find("[name=faceTexture]").val();
        const emissive = html.find("[name=faceEmissive]").is(":checked");

        html.find("[name=faceFontScale]").closest(".form-group").find(".range-value").text(fontScale + "%");

        if (labelText) faceData.labelText = labelText;
        if (font) faceData.font = font;
        if (fontScale !== 100) faceData.fontScale = fontScale;
        if (foreground) faceData.foreground = foreground;
        if (background) faceData.background = background;
        if (outline) faceData.outline = outline;
        if (labelImage) {
            faceData.labelImage = labelImage;
            faceData.labelImageScale = parseInt(html.find("[name=faceLabelImageScale]").val()) || 100;
            faceData.labelImageFlip = html.find("[name=faceLabelImageFlip]").is(":checked");
            faceData.labelImagePosition = parseInt(html.find("[name=faceLabelImagePosition]").val()) || 50;
        } else {
            faceData.labelImage = null;
            faceData.labelImageScale = null;
            faceData.labelImageFlip = null;
            faceData.labelImagePosition = null;
        }
        html.find(".label-image-controls").toggle(!!labelImage);
        if (backgroundTexture) faceData.backgroundTexture = backgroundTexture;
        faceData.emissive = emissive;

        for (const shapeFace of this.selectedFaces) {
            const key = String(shapeFace);
            if (Object.keys(faceData).length > 0) {
                this.libraryDie.faces[key] = foundry.utils.mergeObject(
                    this.libraryDie.faces[key] || {},
                    faceData
                );
            }
        }

        this._refreshPreview();
    }

    _onResetFace() {
        if (this.selectedFaces.size === 0) return;
        for (const shapeFace of this.selectedFaces) {
            delete this.libraryDie.faces[String(shapeFace)];
        }
        this._onFaceSelect(this.selectedFaces);
        this._refreshPreview();
    }

    _onFilePicker() {
        const html = $(this.element);
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: async (path) => {
                await DiceLibrary.loadImage(path);
                html.find("[name=faceLabelImage]").val(path).trigger("change");
            }
        });
        fp.render(true);
    }

    _buildAppearance() {
        const base = this.libraryDie.baseAppearance;
        return {
            colorset: base.colorset || "custom",
            foreground: base.labelColor || "#FFFFFF",
            background: base.diceColor || "#000000",
            outline: base.outlineColor || "",
            edge: base.edgeColor || "",
            texture: base.texture || "none",
            material: base.material || "plastic",
            font: base.font || "auto",
            system: base.system || "standard",
            systemSettings: {},
            libraryDieId: this.libraryDie.id || null
        };
    }

    async _refreshPreview() {
        if (!this.preview) return;
        const appearance = this._buildAppearance();
        const tempLibrary = this.libraryDie.id
            ? [this.libraryDie]
            : [{ ...this.libraryDie, id: "__editor_temp__" }];

        if (!this.libraryDie.id) {
            appearance.libraryDieId = "__editor_temp__";
        }

        await this.preview.refresh(this.dieType, appearance, tempLibrary);
    }

    static async _onSubmit(event, form, formData) {
        const html = $(form);

        this.libraryDie.name = html.find("[name=dieName]").val() || `Custom ${this.dieType.toUpperCase()}`;

        const library = game.dice3d.diceLibrary;
        if (this.isNew) {
            await library.add(this.libraryDie);
        } else {
            await library.update(this.libraryDie.id, this.libraryDie);
        }

        game.dice3d.box.dicefactory.disposeCachedMaterials();

        if (this.onSaveCallback) {
            this.onSaveCallback();
        }

        ui.notifications.info(game.i18n.localize("DICESONICE.editorSaved"));
    }

    close(options) {
        if (this.preview) {
            this.preview.dispose();
            this.preview = null;
        }
        return super.close(options);
    }
}
