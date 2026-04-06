import { DiceEditorPreview } from './DiceEditorPreview.js';
import { DiceLibrary } from './DiceLibrary.js';
import { Utils } from './Utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dice Editor — modal popup for creating/editing custom dice face-by-face.
 */
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

    /**
     * @param {string} dieType - e.g. "d20"
     * @param {object|null} libraryDie - Existing library die to edit, or null for new.
     * @param {object} options - Additional options (onSave callback, etc.)
     */
    constructor(dieType, libraryDie = null, options = {}) {
        super(options);
        this.dieType = dieType;
        this.onSaveCallback = options.onSave || null;

        if (libraryDie) {
            this.libraryDie = foundry.utils.deepClone(libraryDie);
            this.isNew = false;
        } else {
            // Initialize new die from the user's current appearance for this die type
            const factory = game.dice3d.box.dicefactory;
            const appearances = game.user.getFlag("dice-so-nice", "appearance") || {};
            const resolved = factory.getAppearanceForDice(appearances, dieType);
            this.libraryDie = DiceLibrary.createEmptyDie(dieType, `Custom ${dieType.toUpperCase()}`);
            this.libraryDie.baseAppearance.diceColor = resolved.background || "#000000";
            this.libraryDie.baseAppearance.labelColor = resolved.foreground || "#FFFFFF";
            this.libraryDie.baseAppearance.outlineColor = resolved.outline || "";
            this.libraryDie.baseAppearance.edgeColor = resolved.edge || "";
            this.libraryDie.baseAppearance.texture = resolved.texture || "none";
            this.libraryDie.baseAppearance.material = resolved.material || "plastic";
            this.libraryDie.baseAppearance.font = resolved.font || "auto";
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

        // Render face props partial (empty initially, populated on face selection)
        data.facePropsHtml = await foundry.applications.handlebars.renderTemplate(
            "modules/dice-so-nice/templates/dice-editor-face-props.hbs",
            {
                faceLabelText: "",
                faceFont: "",
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
            { type: "button", action: "exportDie", icon: "fa-solid fa-file-export", label: "DICESONICE.Export" },
            { type: "button", action: "close", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel" }
        ];

        data.tabs = {};
        return data;
    }

    _onRender(context, options) {
        const html = $(this.element);

        // Initialize 3D preview
        const previewContainer = html.find("#dice-editor-preview-container")[0];
        if (previewContainer && !this.preview) {
            this.preview = new DiceEditorPreview(previewContainer, game.dice3d.box.dicefactory);
            this.preview.onFaceSelect = (faces) => this._onFaceSelect(faces);
            this.preview.init().then(() => this._refreshPreview());
        }

        // Global property change handlers
        html.on("change", "[name=baseMaterial]", () => this._onGlobalChange());
        html.on("change", "[name=baseEdgeColor]", () => this._onGlobalChange());
        html.on("change", "[name=baseDiceColor]", () => this._onGlobalChange());
        html.on("change", "[name=baseTexture]", () => this._onGlobalChange());
        html.on("change", "[name=dieName]", (ev) => {
            this.libraryDie.name = ev.target.value;
        });

        // Color selector sync — update the text field live but only trigger
        // the mesh rebuild on "change" (when the picker is closed), not on
        // every "input" frame, since each rebuild recreates the full Canvas2D
        // texture atlas + Three.js materials.
        html.on("input", "input[type=color]", (ev) => {
            const editTarget = $(ev.target).data("edit");
            if (editTarget) {
                html.find(`[name=${editTarget}]`).val(ev.target.value);
            }
        });
        html.on("change", "input[type=color]", (ev) => {
            const editTarget = $(ev.target).data("edit");
            if (editTarget) {
                html.find(`[name=${editTarget}]`).val(ev.target.value).trigger("change");
            }
        });

        // Face property change handlers
        html.on("change", "[name^=face]", () => this._onFacePropertyChange());
        // Range sliders: update display value on input, trigger property change on release
        html.on("input", "input[type=range]", (ev) => {
            $(ev.target).next(".range-value").text(ev.target.value);
        });
        html.on("click", "[data-face-reset]", () => this._onResetFace());
        html.on("click", "[data-face-filepicker]", () => this._onFilePicker());

        // Export button
        html.on("click", "[data-action=exportDie]", () => this._onExport());
    }

    _onGlobalChange() {
        const html = $(this.element);
        this.libraryDie.baseAppearance.material = html.find("[name=baseMaterial]").val();
        this.libraryDie.baseAppearance.edgeColor = html.find("[name=baseEdgeColor]").val();
        this.libraryDie.baseAppearance.diceColor = html.find("[name=baseDiceColor]").val();
        this.libraryDie.baseAppearance.texture = html.find("[name=baseTexture]").val();
        this._refreshPreview();
    }

    _onFaceSelect(faces) {
        this.selectedFaces = faces;
        const html = $(this.element);

        if (faces.size === 0) {
            html.find("[data-face-indicator]").text(game.i18n.localize("DICESONICE.editorClickFace"));
            html.find("[data-face-props]").hide();
            return;
        }

        const faceValues = [...faces].sort((a, b) => Number(a) - Number(b));
        const faceLabel = faceValues.map(v => `Face ${v}`).join(", ");
        html.find("[data-face-indicator]").text(faceLabel);
        html.find("[data-face-props]").show();

        // If single face selected, populate with its values
        if (faces.size === 1) {
            const faceValue = String(faceValues[0]);
            const faceData = this.libraryDie.faces[faceValue] || {};
            html.find("[name=faceLabelText]").val(faceData.labelText || "");
            html.find("[name=faceFont]").val(faceData.font || "");
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
            // Sync color pickers — use face override or fall back to base appearance
            const base = this.libraryDie.baseAppearance;
            html.find("[name=faceForegroundSelector]").val(faceData.foreground || base.labelColor || "#FFFFFF");
            html.find("[name=faceBackgroundSelector]").val(faceData.background || base.diceColor || "#000000");
            html.find("[name=faceOutlineSelector]").val(faceData.outline || base.outlineColor || "#000000");
        } else {
            // Multi-selection: show "Mixed" placeholder
            html.find("[name=faceLabelText]").val("").attr("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            html.find("[name=faceFont]").val("");
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
            // Color pickers fall back to base appearance
            const base = this.libraryDie.baseAppearance;
            html.find("[name=faceForegroundSelector]").val(base.labelColor || "#FFFFFF");
            html.find("[name=faceBackgroundSelector]").val(base.diceColor || "#000000");
            html.find("[name=faceOutlineSelector]").val(base.outlineColor || "#000000");
        }
    }

    _onFacePropertyChange() {
        const html = $(this.element);

        const faceData = {};
        const labelText = html.find("[name=faceLabelText]").val();
        const font = html.find("[name=faceFont]").val();
        const foreground = html.find("[name=faceForeground]").val();
        const background = html.find("[name=faceBackground]").val();
        const outline = html.find("[name=faceOutline]").val();
        const labelImage = html.find("[name=faceLabelImage]").val();
        const backgroundTexture = html.find("[name=faceTexture]").val();
        const emissive = html.find("[name=faceEmissive]").is(":checked");

        if (labelText) faceData.labelText = labelText;
        if (font) faceData.font = font;
        if (foreground) faceData.foreground = foreground;
        if (background) faceData.background = background;
        if (outline) faceData.outline = outline;
        if (labelImage) {
            faceData.labelImage = labelImage;
            faceData.labelImageScale = parseInt(html.find("[name=faceLabelImageScale]").val()) || 100;
            faceData.labelImageFlip = html.find("[name=faceLabelImageFlip]").is(":checked");
            faceData.labelImagePosition = parseInt(html.find("[name=faceLabelImagePosition]").val()) || 50;
        }
        html.find(".label-image-controls").toggle(!!labelImage);
        if (backgroundTexture) faceData.backgroundTexture = backgroundTexture;
        if (emissive) faceData.emissive = true;

        // Apply to all selected faces
        for (const faceValue of this.selectedFaces) {
            const key = String(faceValue);
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
        for (const faceValue of this.selectedFaces) {
            delete this.libraryDie.faces[String(faceValue)];
        }
        this._onFaceSelect(this.selectedFaces);
        this._refreshPreview();
    }

    _onFilePicker() {
        const html = $(this.element);
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: async (path) => {
                // Pre-load the image into the cache so the preview can use it immediately
                await DiceLibrary.loadImage(path);
                html.find("[name=faceLabelImage]").val(path).trigger("change");
            }
        });
        fp.render(true);
    }

    _onExport() {
        const library = game.dice3d.diceLibrary;
        if (!this.isNew && this.libraryDie.id) {
            const json = library.export(this.libraryDie.id);
            if (json) {
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${this.libraryDie.name || "custom-die"}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } else {
            // Export the in-memory die
            const exportData = foundry.utils.deepClone(this.libraryDie);
            delete exportData.id;
            const json = JSON.stringify({ dsnLibraryExport: true, version: 1, dice: [exportData] }, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${this.libraryDie.name || "custom-die"}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
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
            system: "standard",
            systemSettings: {},
            libraryDieId: this.libraryDie.id || null
        };
    }

    async _refreshPreview() {
        if (!this.preview) return;
        const appearance = this._buildAppearance();
        // Temporary: store the library die in an array for the preview
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

        // Update name from form
        this.libraryDie.name = html.find("[name=dieName]").val() || `Custom ${this.dieType.toUpperCase()}`;

        const library = game.dice3d.diceLibrary;
        if (this.isNew) {
            await library.add(this.libraryDie);
        } else {
            await library.update(this.libraryDie.id, this.libraryDie);
        }

        // Invalidate cached materials
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
