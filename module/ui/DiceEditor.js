import { DiceEditorPreview } from '../rendering/DiceEditorPreview.js';
import { DiceLibrary } from '../engine/DiceLibrary.js';
import { DiceColors, TEXTURELIST } from '../engine/DiceColors.js';
import { DICE_SHAPE } from '../engine/DiceModels.js';
import { Utils } from '../Utils.js';
import { GlyphPicker } from '../glyph-picker/GlyphPicker.js';

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
        },
        actions: {
            copyDocumentId: DiceEditor._onCopyDocumentId
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
            let resolved = factory.getAppearanceForDice(appearances, dieType);

            //if a library die is already selected, init from its stored appearance
            if (resolved.libraryDieId) {
                const owner = resolved.libraryDieOwner ? game.users.get(resolved.libraryDieOwner) : game.user;
                const existingDie = owner ? DiceLibrary.getFromUser(owner, resolved.libraryDieId) : null;
                if (existingDie?.baseAppearance) {
                    const base = existingDie.baseAppearance;
                    resolved = {
                        foreground: base.labelColor || "#FFFFFF",
                        background: base.diceColor || "#000000",
                        outline: base.outlineColor || "",
                        edge: base.edgeColor || "",
                        texture: base.texture || "none",
                        material: base.material || "plastic",
                        font: base.font || "auto",
                        system: base.system || "standard",
                        colorset: "custom"
                    };
                }
            }

            //custom 3D models are not compatible with the dice factory material maker,
            //fall back to standard system appearance
            const preset = factory.getPresetBySystem(dieType, resolved.system || "standard");
            if (preset && preset.modelFile) {
                resolved = factory.getAppearanceForDice({ global: { system: "standard" } }, dieType);
            }
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

    static COMPOSITE_OPTIONS = {
        "source-over": "DICESONICE.CompositeSourceOver",
        "multiply": "DICESONICE.CompositeMultiply",
        "destination-in": "DICESONICE.CompositeDestinationIn",
        "difference": "DICESONICE.CompositeDifference",
        "soft-light": "DICESONICE.CompositeSoftLight",
        "hueshift": "DICESONICE.CompositeHueShift"
    };

    _getHeaderControls() {
        const controls = super._getHeaderControls();
        if (!this.isNew) {
            controls.push({
                icon: "fa-solid fa-id-badge",
                label: game.i18n.localize("DICESONICE.editorCopyId"),
                action: "copyDocumentId"
            });
        }
        return controls;
    }

    static async _onCopyDocumentId() {
        await navigator.clipboard.writeText(this.libraryDie.id);
        ui.notifications.info(game.i18n.localize("DICESONICE.editorCopyIdNotification"));
    }

    async _prepareContext(options) {
        const data = {};
        data.dieType = this.dieType;
        data.dieName = this.libraryDie.name;
        data.baseAppearance = this.libraryDie.baseAppearance;

        const tex = this.libraryDie.baseAppearance.texture || "none";
        data.isCustomTexture = tex.startsWith("custom:");
        data.customTexturePath = data.isCustomTexture ? tex.slice(7) : "";
        data.builtinTexture = data.isCustomTexture ? "none" : tex;
        data.hasBaseTexture = tex !== "none";
        const defaultComposite = (!data.isCustomTexture && TEXTURELIST[tex]) ? TEXTURELIST[tex].composite : "multiply";
        data.baseTextureComposite = this.libraryDie.baseAppearance.textureComposite || defaultComposite;
        data.compositeOptions = Utils.localize(DiceEditor.COMPOSITE_OPTIONS);

        data.textureList = Utils.prepareTextureList();
        data.materialList = Utils.localize({
            "auto": "DICESONICE.MaterialAuto",
            "chrome": "DICESONICE.MaterialChrome",
            "frosted": "DICESONICE.MaterialFrosted",
            "glass": "DICESONICE.MaterialGlass",
            "iridescent": "DICESONICE.MaterialIridescent",
            "metal": "DICESONICE.MaterialMetal",
            "plastic": "DICESONICE.MaterialPlastic",
            "pristine": "DICESONICE.MaterialPristine",
            "resin": "DICESONICE.MaterialResin",
            "stone": "DICESONICE.MaterialStone",
            "velvet": "DICESONICE.MaterialVelvet",
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
                faceTextureEffective: "",
                faceCustomTexturePath: "",
                isFaceCustomTexture: false,
                hasFaceTexture: false,
                faceTextureComposite: "",
                compositeOptions: data.compositeOptions,
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
        const el = this.element;

        const previewContainer = el.querySelector("#dice-editor-preview-container");
        if (previewContainer && !this.preview) {
            this.preview = new DiceEditorPreview(previewContainer, game.dice3d.box.dicefactory);
            this.preview.onFaceSelect = (faces) => this._onFaceSelect(faces);
            this.preview.init().then(async () => {
                await this._registerCustomTextures();
                this._refreshPreview();
            });
        }

        el.addEventListener("change", (ev) => {
            const target = ev.target;
            if (target.matches("[name=baseMaterial]") || target.matches("[name=baseEdgeColor]") || target.matches("[name=baseDiceColor]")) {
                this._onGlobalChange();
            } else if (target.matches("[name=baseTexture]")) {
                this._onBaseTextureDropdownChange();
            } else if (target.matches("[name=baseTextureComposite]")) {
                this._onBaseCompositeChange();
            } else if (target.matches("[name=dieName]")) {
                this.libraryDie.name = target.value;
            } else if (target.matches("input[type=color]")) {
                const editTarget = target.dataset.edit;
                if (editTarget) {
                    const linked = el.querySelector(`[name=${editTarget}]`);
                    linked.value = target.value;
                    linked.dispatchEvent(new Event("change", { bubbles: true }));
                }
            } else if (target.matches("[name=faceFont]")) {
                //faceFont dropdown change wins over any stale override from a previous glyph pick
                el.querySelector("[name=faceFontOverride]").value = "";
                this._onFacePropertyChange();
            } else if (target.matches("[name=faceTexture]")) {
                this._onFaceTextureDropdownChange();
            } else if (target.matches("[name=faceTextureComposite]")) {
                this._onFaceCompositeChange();
            } else if (target.matches("[name^=face]")) {
                this._onFacePropertyChange();
            }
        });

        el.addEventListener("input", (ev) => {
            const target = ev.target;
            if (target.matches("input[type=color]")) {
                const editTarget = target.dataset.edit;
                if (editTarget) {
                    el.querySelector(`[name=${editTarget}]`).value = target.value;
                }
            } else if (target.matches("input[type=range]")) {
                target.nextElementSibling.textContent = target.value;
            }
        });

        el.addEventListener("click", (ev) => {
            if (ev.target.closest("[data-base-texture-filepicker]")) {
                this._onBaseTexturePicker();
            } else if (ev.target.closest("[data-base-texture-clear]")) {
                this._onBaseTextureClear();
            } else if (ev.target.closest("[data-face-filepicker]")) {
                this._onFilePicker();
            } else if (ev.target.closest("[data-face-texture-filepicker]")) {
                this._onFaceTexturePicker();
            } else if (ev.target.closest("[data-face-texture-clear]")) {
                this._onFaceTextureClear();
            } else if (ev.target.closest("[data-action=openGlyphPicker]")) {
                ev.preventDefault();
                this._onOpenGlyphPicker();
            } else if (ev.target.closest("[data-action=resetFaces]")) {
                this._onResetFace();
            }
        });
    }

    _onOpenGlyphPicker() {
        const el = this.element;
        GlyphPicker.open({
            onSelect: ({ labelText, font }) => {
                el.querySelector("[name=faceLabelText]").value = labelText;
                //FA picks carry a font family that isn't in the font dropdown - stash it in
                //a hidden override input that _onFacePropertyChange reads preferentially.
                //emoji picks pass font=null, meaning "leave the face font alone".
                if (font !== null) {
                    el.querySelector("[name=faceFontOverride]").value = font;
                    el.querySelector("[name=faceFont]").value = "";
                }
                el.querySelector("[name=faceLabelText]").dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
    }

    _onGlobalChange() {
        const el = this.element;
        this.libraryDie.baseAppearance.material = el.querySelector("[name=baseMaterial]").value;
        this.libraryDie.baseAppearance.edgeColor = el.querySelector("[name=baseEdgeColor]").value;
        this.libraryDie.baseAppearance.diceColor = el.querySelector("[name=baseDiceColor]").value;
        this.libraryDie.baseAppearance.texture = el.querySelector("[name=baseTextureEffective]").value;
        this.libraryDie.baseAppearance.textureComposite = el.querySelector("[name=baseTextureComposite]").value || "multiply";
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
        const el = this.element;

        if (faces.size === 0) {
            el.querySelector("[data-face-indicator]").textContent = game.i18n.localize("DICESONICE.editorClickFace");
            el.querySelector("[data-face-props]").hidden = true;
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
        el.querySelector("[data-face-indicator]").textContent = faceLabel;
        el.querySelector("[data-face-props]").hidden = false;
        this._clampToViewport();

        if (faces.size === 1) {
            const shapeFace = String(shapeFaces[0]);
            const faceData = this.libraryDie.faces[shapeFace] || {};
            const { label: defaultLabel } = this._getShapeFaceDisplay(shapeFaces[0]);
            const faceLabelTextEl = el.querySelector("[name=faceLabelText]");
            faceLabelTextEl.value = faceData.labelText || "";
            faceLabelTextEl.setAttribute("placeholder", defaultLabel);
            //if faceData.font isn't in the dropdown (e.g. FA Pro from the glyph picker),
            //the select silently rejects the assignment - detect that and stash in the
            //hidden override instead so _onFacePropertyChange round-trips correctly.
            const faceFontEl = el.querySelector("[name=faceFont]");
            faceFontEl.value = faceData.font || "";
            const fontAccepted = faceFontEl.value === (faceData.font || "");
            if (faceData.font && !fontAccepted) {
                el.querySelector("[name=faceFontOverride]").value = faceData.font;
                faceFontEl.value = "";
            } else {
                el.querySelector("[name=faceFontOverride]").value = "";
            }
            el.querySelector("[name=faceFontScale]").value = faceData.fontScale ?? 100;
            el.querySelector("[name=faceFontScale]").closest(".form-group").querySelector(".range-value").textContent = (faceData.fontScale ?? 100) + "%";
            el.querySelector("[name=faceForeground]").value = faceData.foreground || "";
            el.querySelector("[name=faceBackground]").value = faceData.background || "";
            el.querySelector("[name=faceOutline]").value = faceData.outline || "";
            el.querySelector("[name=faceLabelImage]").value = faceData.labelImage || "";
            el.querySelector("[name=faceLabelImageScale]").value = faceData.labelImageScale ?? 100;
            el.querySelector("[name=faceLabelImageFlip]").checked = !!faceData.labelImageFlip;
            el.querySelector("[name=faceLabelImagePosition]").value = faceData.labelImagePosition ?? 50;
            el.querySelector(".label-image-controls").hidden = !faceData.labelImage;
            const bgTex = faceData.backgroundTexture || "";
            const isFaceCustom = bgTex.startsWith("custom:");
            const hasFaceTexture = bgTex && bgTex !== "none";
            const faceTextureEl = el.querySelector("[name=faceTexture]");
            faceTextureEl.value = isFaceCustom ? "" : bgTex;
            faceTextureEl.disabled = isFaceCustom;
            el.querySelector("[name=faceTextureEffective]").value = bgTex;
            el.querySelector("[name=faceCustomTexturePath]").value = isFaceCustom ? bgTex.slice(7) : "";
            el.querySelector("[data-face-texture-clear]").hidden = !isFaceCustom;
            el.querySelector(".face-texture-composite").hidden = !hasFaceTexture;
            const faceDefaultComposite = (!isFaceCustom && TEXTURELIST[bgTex]) ? TEXTURELIST[bgTex].composite : "";
            el.querySelector("[name=faceTextureComposite]").value = faceData.backgroundTextureComposite || faceDefaultComposite;
            el.querySelector("[name=faceEmissive]").checked = !!faceData.emissive;
            el.querySelector("[name=faceEmissiveColor]").value = faceData.emissiveColor || "";
            const base = this.libraryDie.baseAppearance;
            el.querySelector("[name=faceForegroundSelector]").value = faceData.foreground || base.labelColor || "#FFFFFF";
            el.querySelector("[name=faceBackgroundSelector]").value = faceData.background || base.diceColor || "#000000";
            el.querySelector("[name=faceOutlineSelector]").value = faceData.outline || base.outlineColor || "#000000";
        } else {
            const faceLabelTextEl = el.querySelector("[name=faceLabelText]");
            faceLabelTextEl.value = "";
            faceLabelTextEl.setAttribute("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            el.querySelector("[name=faceFont]").value = "";
            el.querySelector("[name=faceFontOverride]").value = "";
            el.querySelector("[name=faceFontScale]").value = 100;
            el.querySelector("[name=faceFontScale]").closest(".form-group").querySelector(".range-value").textContent = "100%";
            const faceForegroundEl = el.querySelector("[name=faceForeground]");
            faceForegroundEl.value = "";
            faceForegroundEl.setAttribute("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            const faceBackgroundEl = el.querySelector("[name=faceBackground]");
            faceBackgroundEl.value = "";
            faceBackgroundEl.setAttribute("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            const faceOutlineEl = el.querySelector("[name=faceOutline]");
            faceOutlineEl.value = "";
            faceOutlineEl.setAttribute("placeholder", game.i18n.localize("DICESONICE.editorMixed"));
            el.querySelector("[name=faceLabelImage]").value = "";
            el.querySelector("[name=faceLabelImageScale]").value = 100;
            el.querySelector("[name=faceLabelImageFlip]").checked = false;
            el.querySelector("[name=faceLabelImagePosition]").value = 50;
            el.querySelector(".label-image-controls").hidden = true;
            const faceTextureEl = el.querySelector("[name=faceTexture]");
            faceTextureEl.value = "";
            faceTextureEl.disabled = false;
            el.querySelector("[name=faceTextureEffective]").value = "";
            el.querySelector("[name=faceCustomTexturePath]").value = "";
            el.querySelector("[data-face-texture-clear]").hidden = true;
            el.querySelector(".face-texture-composite").hidden = true;
            el.querySelector("[name=faceTextureComposite]").value = "";
            el.querySelector("[name=faceEmissive]").checked = false;
            const base = this.libraryDie.baseAppearance;
            el.querySelector("[name=faceForegroundSelector]").value = base.labelColor || "#FFFFFF";
            el.querySelector("[name=faceBackgroundSelector]").value = base.diceColor || "#000000";
            el.querySelector("[name=faceOutlineSelector]").value = base.outlineColor || "#000000";
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
        const el = this.element;

        const faceData = {};
        const labelText = el.querySelector("[name=faceLabelText]").value;
        //hidden override wins over the dropdown - it holds font families that aren't in
        //prepareFontList (currently only the FA Pro family, set by the glyph picker).
        const fontOverride = el.querySelector("[name=faceFontOverride]").value;
        const font = fontOverride || el.querySelector("[name=faceFont]").value;
        const fontScale = parseInt(el.querySelector("[name=faceFontScale]").value) || 100;
        const foreground = el.querySelector("[name=faceForeground]").value;
        const background = el.querySelector("[name=faceBackground]").value;
        const outline = el.querySelector("[name=faceOutline]").value;
        const labelImage = el.querySelector("[name=faceLabelImage]").value;
        const backgroundTexture = el.querySelector("[name=faceTextureEffective]").value;
        const backgroundTextureComposite = el.querySelector("[name=faceTextureComposite]").value;
        const emissive = el.querySelector("[name=faceEmissive]").checked;

        el.querySelector("[name=faceFontScale]").closest(".form-group").querySelector(".range-value").textContent = fontScale + "%";

        if (labelText) faceData.labelText = labelText;
        if (font) faceData.font = font;
        if (fontScale !== 100) faceData.fontScale = fontScale;
        if (foreground) faceData.foreground = foreground;
        if (background) faceData.background = background;
        if (outline) faceData.outline = outline;
        if (labelImage) {
            faceData.labelImage = labelImage;
            faceData.labelImageScale = parseInt(el.querySelector("[name=faceLabelImageScale]").value) || 100;
            faceData.labelImageFlip = el.querySelector("[name=faceLabelImageFlip]").checked;
            faceData.labelImagePosition = parseInt(el.querySelector("[name=faceLabelImagePosition]").value) || 50;
        } else {
            faceData.labelImage = null;
            faceData.labelImageScale = null;
            faceData.labelImageFlip = null;
            faceData.labelImagePosition = null;
        }
        el.querySelector(".label-image-controls").hidden = !labelImage;
        if (backgroundTexture) {
            faceData.backgroundTexture = backgroundTexture;
            if (backgroundTextureComposite) faceData.backgroundTextureComposite = backgroundTextureComposite;
        } else {
            faceData.backgroundTexture = null;
            faceData.backgroundTextureComposite = null;
        }
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
        const el = this.element;
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: async (path) => {
                await DiceLibrary.loadImage(path);
                const faceLabelImageEl = el.querySelector("[name=faceLabelImage]");
                faceLabelImageEl.value = path;
                faceLabelImageEl.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
        fp.render(true);
    }

    async _registerCustomTextures() {
        const promises = [];
        const base = this.libraryDie.baseAppearance;
        if (base.texture && base.texture.startsWith("custom:")) {
            promises.push(DiceColors.registerCustomTexture(base.texture.slice(7), base.textureComposite || "multiply"));
        }
        for (const [, faceData] of Object.entries(this.libraryDie.faces || {})) {
            if (faceData.backgroundTexture && faceData.backgroundTexture.startsWith("custom:")) {
                const path = faceData.backgroundTexture.slice(7);
                promises.push(DiceColors.registerCustomTexture(path, faceData.backgroundTextureComposite || base.textureComposite || "multiply"));
            }
        }
        await Promise.all(promises);
    }

    _onBaseTexturePicker() {
        const el = this.element;
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: async (path) => {
                const loaded = await DiceLibrary.loadImage(path);
                const img = loaded.source || loaded;
                if (img.naturalWidth > 1024 || img.naturalHeight > 1024) {
                    ui.notifications.warn(game.i18n.localize("DICESONICE.editorCustomTextureSizeWarn"));
                }
                const composite = el.querySelector("[name=baseTextureComposite]").value || "multiply";
                await DiceColors.registerCustomTexture(path, composite);
                el.querySelector("[name=baseTextureEffective]").value = `custom:${path}`;
                el.querySelector("[name=baseCustomTexturePath]").value = path;
                el.querySelector("[name=baseTexture]").disabled = true;
                el.querySelector("[data-base-texture-clear]").hidden = false;
                el.querySelector(".texture-composite").hidden = false;
                this._onGlobalChange();
            }
        });
        fp.render(true);
    }

    _onBaseTextureClear() {
        const el = this.element;
        const dropdownVal = el.querySelector("[name=baseTexture]").value || "none";
        el.querySelector("[name=baseTextureEffective]").value = dropdownVal;
        el.querySelector("[name=baseCustomTexturePath]").value = "";
        el.querySelector("[name=baseTexture]").disabled = false;
        el.querySelector("[data-base-texture-clear]").hidden = true;
        const hasTexture = dropdownVal !== "none";
        el.querySelector(".texture-composite").hidden = !hasTexture;
        if (hasTexture && TEXTURELIST[dropdownVal]) {
            el.querySelector("[name=baseTextureComposite]").value = TEXTURELIST[dropdownVal].composite || "source-over";
        }
        this.libraryDie.baseAppearance.textureComposite = null;
        this._onGlobalChange();
    }

    _onBaseTextureDropdownChange() {
        const el = this.element;
        const val = el.querySelector("[name=baseTexture]").value;
        el.querySelector("[name=baseTextureEffective]").value = val;
        el.querySelector("[name=baseCustomTexturePath]").value = "";
        el.querySelector("[data-base-texture-clear]").hidden = true;
        const hasTexture = val && val !== "none";
        el.querySelector(".texture-composite").hidden = !hasTexture;
        if (hasTexture && TEXTURELIST[val]) {
            el.querySelector("[name=baseTextureComposite]").value = TEXTURELIST[val].composite || "source-over";
        }
        this._onGlobalChange();
    }

    _onFaceTexturePicker() {
        const el = this.element;
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: async (path) => {
                const loaded = await DiceLibrary.loadImage(path);
                const img = loaded.source || loaded;
                if (img.naturalWidth > 1024 || img.naturalHeight > 1024) {
                    ui.notifications.warn(game.i18n.localize("DICESONICE.editorCustomTextureSizeWarn"));
                }
                const composite = el.querySelector("[name=faceTextureComposite]").value
                    || el.querySelector("[name=baseTextureComposite]").value || "multiply";
                await DiceColors.registerCustomTexture(path, composite);
                el.querySelector("[name=faceTextureEffective]").value = `custom:${path}`;
                el.querySelector("[name=faceCustomTexturePath]").value = path;
                el.querySelector("[name=faceTexture]").disabled = true;
                el.querySelector("[data-face-texture-clear]").hidden = false;
                el.querySelector(".face-texture-composite").hidden = false;
                this._onFacePropertyChange();
            }
        });
        fp.render(true);
    }

    _onFaceTextureClear() {
        const el = this.element;
        const dropdownVal = el.querySelector("[name=faceTexture]").value || "";
        el.querySelector("[name=faceTextureEffective]").value = dropdownVal;
        el.querySelector("[name=faceCustomTexturePath]").value = "";
        el.querySelector("[name=faceTexture]").disabled = false;
        el.querySelector("[data-face-texture-clear]").hidden = true;
        const hasTexture = dropdownVal && dropdownVal !== "none";
        el.querySelector(".face-texture-composite").hidden = !hasTexture;
        if (hasTexture && TEXTURELIST[dropdownVal]) {
            el.querySelector("[name=faceTextureComposite]").value = TEXTURELIST[dropdownVal].composite || "source-over";
        } else {
            el.querySelector("[name=faceTextureComposite]").value = "";
        }
        this._onFacePropertyChange();
    }

    _onFaceTextureDropdownChange() {
        const el = this.element;
        const val = el.querySelector("[name=faceTexture]").value;
        el.querySelector("[name=faceTextureEffective]").value = val;
        el.querySelector("[name=faceCustomTexturePath]").value = "";
        el.querySelector("[data-face-texture-clear]").hidden = true;
        const hasTexture = val && val !== "none";
        el.querySelector(".face-texture-composite").hidden = !hasTexture;
        if (hasTexture && TEXTURELIST[val]) {
            el.querySelector("[name=faceTextureComposite]").value = TEXTURELIST[val].composite || "source-over";
        } else if (!hasTexture) {
            el.querySelector("[name=faceTextureComposite]").value = "";
        }
    }

    async _onFaceCompositeChange() {
        const el = this.element;
        const effective = el.querySelector("[name=faceTextureEffective]").value;
        if (effective.startsWith("custom:")) {
            const path = effective.slice(7);
            const composite = el.querySelector("[name=faceTextureComposite]").value
                || el.querySelector("[name=baseTextureComposite]").value || "multiply";
            await DiceColors.registerCustomTexture(path, composite);
        }
        this._onFacePropertyChange();
    }

    async _onBaseCompositeChange() {
        const el = this.element;
        const effective = el.querySelector("[name=baseTextureEffective]").value;
        if (effective.startsWith("custom:")) {
            const path = effective.slice(7);
            const composite = el.querySelector("[name=baseTextureComposite]").value;
            await DiceColors.registerCustomTexture(path, composite);
        }
        this._onGlobalChange();
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
        this.libraryDie.name = form.querySelector("[name=dieName]").value || `Custom ${this.dieType.toUpperCase()}`;

        const library = game.dice3d.diceLibrary;
        if (this.isNew) {
            await library.add(this.libraryDie);
        } else {
            await library.update(this.libraryDie.id, this.libraryDie);
        }

        game.dice3d.box.dicefactory.disposeCachedMaterials();
        game.socket.emit("module.dice-so-nice", { type: "update", user: game.user.id });

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
