import { CustomDiceTerms } from '../engine/CustomDiceTerms.js';
import { DiceLibrary } from '../engine/DiceLibrary.js';
import { DiceLibraryDialog } from './DiceLibraryDialog.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CustomDiceTermConfig extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["dice-so-nice", "custom-diceterm-config"],
        form: {
            handler: CustomDiceTermConfig._onSubmit,
            submitOnChange: false,
            closeOnSubmit: false
        },
        window: {
            title: "DICESONICE.CustomDiceTermConfigTitle",
            contentClasses: ["standard-form"],
            resizable: true
        },
        id: "custom-diceterm-config",
        position: {
            width: 520,
            height: "auto"
        },
        actions: {
            createTerm: CustomDiceTermConfig._onCreateTerm,
            editTerm: CustomDiceTermConfig._onEditTerm,
            deleteTerm: CustomDiceTermConfig._onDeleteTerm,
            saveEditing: CustomDiceTermConfig._onSaveEditing,
            cancelEditing: CustomDiceTermConfig._onCancelEditing,
            exportAll: CustomDiceTermConfig._onExportAll,
            importTerms: CustomDiceTermConfig._onImportTerms,
            openLibrary: CustomDiceTermConfig._onOpenLibrary
        }
    };

    static PARTS = {
        body: {
            template: "modules/dice-so-nice/templates/custom-diceterm-config.hbs",
            scrollable: [".custom-diceterm-list-wrap", ".custom-diceterm-face-table-wrap"]
        }
    };

    constructor(options = {}) {
        super(options);
        this._editing = null;
        this._denominationError = null;
    }

    async _prepareContext(options) {
        if (!game.user.isGM) {
            throw new Error("CustomDiceTermConfig is GM-only");
        }

        const stored = game.settings.get("dice-so-nice", "customDiceTerms") ?? {};
        const terms = Object.entries(stored).map(([denomination, def]) => ({
            denomination,
            shape: def.shape,
            faceCount: def.faces.length
        }));

        const context = { terms };

        if (this._editing) {
            const shapes = CustomDiceTerms.getValidShapes().map(s => ({
                value: s,
                label: s.toUpperCase(),
                selected: s === this._editing.shape
            }));

            const faceCount = CustomDiceTerms.getShapeFaceCount(this._editing.shape);
            const faces = [];
            for (let i = 0; i < faceCount; i++) {
                const existing = this._editing.faces?.[i];
                faces.push({
                    num: i + 1,
                    value: existing?.value ?? (i + 1)
                });
            }

            context.editingTerm = {
                denomination: this._editing.denomination || "",
                shape: this._editing.shape,
                faces,
                isNew: this._editing.isNew
            };
            context.shapes = shapes;
            context.denominationError = this._denominationError;

            if (!this._editing.isNew) {
                const dieType = "d" + this._editing.denomination;
                const myDice = game.dice3d?.diceLibrary?.getByType(dieType) ?? [];
                context.libraryDice = myDice.map(d => ({
                    id: d.id,
                    name: d.name,
                    selected: d.id === this._editing.defaultDieId
                }));
            }
        }

        return context;
    }

    _onRender(context, options) {
        const html = this.element;

        const shapeSelect = html.querySelector("select[name='shape']");
        if (shapeSelect) {
            shapeSelect.addEventListener("change", () => {
                this._captureEditing();
                this._editing.shape = shapeSelect.value;
                this._editing.faces = [];
                this.render();
            });
        }

        const denomInput = html.querySelector("input[name='denomination']");
        if (denomInput) {
            denomInput.setAttribute("maxlength", "1");
            denomInput.addEventListener("input", () => {
                const raw = denomInput.value.toLowerCase().replace(/[^a-z]/g, "").substring(0, 1);
                denomInput.value = raw;
                const excludeExisting = this._editing?.isNew ? null : this._editing?.originalDenomination;
                if (raw && !CustomDiceTerms.isDenominationValid(raw, excludeExisting)) {
                    this._denominationError = game.i18n.localize("DICESONICE.CustomDiceTermDenominationConflict");
                } else {
                    this._denominationError = null;
                }
                const errorEl = this.element.querySelector(".denomination-input-wrap + .notes.warning");
                if (errorEl) {
                    errorEl.textContent = this._denominationError || "";
                    errorEl.style.display = this._denominationError ? "" : "none";
                }
            });
        }
    }

    _captureEditing() {
        if (!this._editing) return;
        const html = this.element;

        const denomInput = html.querySelector("input[name='denomination']");
        if (denomInput && this._editing.isNew) {
            this._editing.denomination = denomInput.value.toLowerCase().replace(/[^a-z]/g, "").substring(0, 1);
        }

        this._editing.shape = html.querySelector("select[name='shape']")?.value || this._editing.shape;

        const faceCount = CustomDiceTerms.getShapeFaceCount(this._editing.shape);
        const faces = [];
        for (let i = 0; i < faceCount; i++) {
            const num = i + 1;
            const valueInput = html.querySelector(`input[name='face-value-${num}']`);
            faces.push({
                value: valueInput ? Number(valueInput.value) : num
            });
        }
        this._editing.faces = faces;

        const defaultDieSelect = html.querySelector("select[name='defaultDieId']");
        if (defaultDieSelect) {
            this._editing.defaultDieId = defaultDieSelect.value || null;
        }
    }

    static _onCreateTerm(event, target) {
        event.preventDefault();
        const defaultShape = "d6";
        this._editing = {
            isNew: true,
            denomination: "",
            shape: defaultShape,
            faces: []
        };
        this._denominationError = null;
        this.render();
    }

    static _onEditTerm(event, target) {
        event.preventDefault();
        const denomination = target.dataset.denomination;
        const stored = game.settings.get("dice-so-nice", "customDiceTerms") ?? {};
        const def = stored[denomination];
        if (!def) return;

        this._editing = {
            isNew: false,
            denomination,
            originalDenomination: denomination,
            shape: def.shape,
            faces: def.faces.map(f => ({ ...f })),
            defaultDieId: def.defaultDieId || null
        };
        this._denominationError = null;
        this.render();
    }

    static async _onDeleteTerm(event, target) {
        event.preventDefault();
        const denomination = target.dataset.denomination;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("DICESONICE.CustomDiceTermDeleteConfirmTitle") },
            content: game.i18n.format("DICESONICE.CustomDiceTermDeleteConfirmContent", { denomination: "d" + denomination }),
            yes: { default: true }
        });
        if (!confirmed) return;

        const stored = foundry.utils.deepClone(game.settings.get("dice-so-nice", "customDiceTerms") ?? {});
        delete stored[denomination];
        await game.settings.set("dice-so-nice", "customDiceTerms", stored);

        CustomDiceTerms.sync(stored, game.dice3d?.DiceFactory);
        game.socket.emit("module.dice-so-nice", { type: "customTermSync", definitions: stored });

        ui.notifications.info(game.i18n.format("DICESONICE.CustomDiceTermDeleted", { denomination: "d" + denomination }));
        this.render();
    }

    static async _onSaveEditing(event, target) {
        event.preventDefault();
        this._captureEditing();

        const denomination = this._editing.denomination;
        if (!denomination) {
            ui.notifications.warn(game.i18n.localize("DICESONICE.CustomDiceTermDenominationRequired"));
            return;
        }

        const excludeExisting = this._editing.isNew ? null : this._editing.originalDenomination;
        if (!CustomDiceTerms.isDenominationValid(denomination, excludeExisting)) {
            ui.notifications.warn(game.i18n.localize("DICESONICE.CustomDiceTermDenominationConflict"));
            return;
        }

        const stored = foundry.utils.deepClone(game.settings.get("dice-so-nice", "customDiceTerms") ?? {});

        if (!this._editing.isNew && this._editing.originalDenomination !== denomination) {
            delete stored[this._editing.originalDenomination];
        }

        const def = {
            denomination,
            shape: this._editing.shape,
            faces: this._editing.faces,
            createdAt: stored[denomination]?.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        if (this._editing.defaultDieId) {
            def.defaultDieId = this._editing.defaultDieId;
            def.defaultDieOwner = game.user.id;
        }
        stored[denomination] = def;

        await game.settings.set("dice-so-nice", "customDiceTerms", stored);

        CustomDiceTerms.sync(stored, game.dice3d?.DiceFactory);
        CustomDiceTerms.applyDefaultAppearances();
        game.socket.emit("module.dice-so-nice", { type: "customTermSync", definitions: stored });

        this._editing = null;
        this._denominationError = null;
        ui.notifications.info(game.i18n.format("DICESONICE.CustomDiceTermSaved", { denomination: "d" + denomination }));
        this.render();
    }

    static _onCancelEditing(event, target) {
        event.preventDefault();
        this._editing = null;
        this._denominationError = null;
        this.render();
    }

    static _onOpenLibrary(event, target) {
        event.preventDefault();
        const dieType = "d" + this._editing?.denomination;
        const self = this;
        const dialog = new DiceLibraryDialog({ diceType: dieType });
        dialog._refreshConfigDropdown = () => self.render();
        dialog.render(true);
    }

    static _onExportAll(event, target) {
        event.preventDefault();
        const stored = game.settings.get("dice-so-nice", "customDiceTerms") ?? {};
        const terms = Object.values(stored).map(def => ({
            denomination: def.denomination,
            shape: def.shape,
            faces: def.faces
        }));
        const exportData = {
            dsnTermExport: true,
            version: 1,
            terms
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dsn-custom-diceterms.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    static _onImportTerms(event, target) {
        event.preventDefault();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                await this._processImport(text);
            } catch (err) {
                ui.notifications.error(game.i18n.localize("DICESONICE.CustomDiceTermImportError"));
                console.error("[Dice So Nice] Import error:", err);
            }
        });
        input.click();
    }

    static async _processImport(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            ui.notifications.error(game.i18n.localize("DICESONICE.CustomDiceTermImportInvalidJSON"));
            return;
        }

        if (!parsed.dsnTermExport || !Array.isArray(parsed.terms)) {
            ui.notifications.error(game.i18n.localize("DICESONICE.CustomDiceTermImportInvalidFormat"));
            return;
        }

        const validShapes = new Set(CustomDiceTerms.getValidShapes());
        const stored = foundry.utils.deepClone(game.settings.get("dice-so-nice", "customDiceTerms") ?? {});
        let imported = 0;
        let skipped = 0;

        for (const term of parsed.terms) {
            if (!term.denomination || !term.shape || !Array.isArray(term.faces)) {
                skipped++;
                continue;
            }
            if (!validShapes.has(term.shape)) {
                console.warn(`[Dice So Nice] Skipping import of "${term.denomination}": invalid shape "${term.shape}"`);
                skipped++;
                continue;
            }
            const expectedFaces = CustomDiceTerms.getShapeFaceCount(term.shape);
            if (term.faces.length !== expectedFaces) {
                console.warn(`[Dice So Nice] Skipping import of "${term.denomination}": face count mismatch (got ${term.faces.length}, expected ${expectedFaces})`);
                skipped++;
                continue;
            }
            if (term.faces.some(f => typeof f.value !== "number" || !Number.isFinite(f.value))) {
                console.warn(`[Dice So Nice] Skipping import of "${term.denomination}": faces contain non-numeric values`);
                skipped++;
                continue;
            }

            if (stored[term.denomination]) {
                const overwrite = await foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize("DICESONICE.CustomDiceTermImportConflictTitle") },
                    content: game.i18n.format("DICESONICE.CustomDiceTermImportConflictContent", { denomination: "d" + term.denomination }),
                    yes: { default: false }
                });
                if (!overwrite) {
                    skipped++;
                    continue;
                }
            }

            if (!CustomDiceTerms.isDenominationValid(term.denomination, stored[term.denomination] ? term.denomination : null)) {
                console.warn(`[Dice So Nice] Skipping import of "${term.denomination}": conflicts with existing DiceTerm`);
                skipped++;
                continue;
            }

            stored[term.denomination] = {
                denomination: term.denomination,
                shape: term.shape,
                faces: term.faces,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            imported++;
        }

        if (imported > 0) {
            await game.settings.set("dice-so-nice", "customDiceTerms", stored);
            CustomDiceTerms.sync(stored, game.dice3d?.DiceFactory);
            game.socket.emit("module.dice-so-nice", { type: "customTermSync", definitions: stored });
        }

        ui.notifications.info(game.i18n.format("DICESONICE.CustomDiceTermImportResult", { imported, skipped }));
        this.render();
    }

    static async _onSubmit(event, form, formData) {
        // Form submission is handled by individual action buttons
    }
}
