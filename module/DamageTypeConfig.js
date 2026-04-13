import { COLORSETS } from './DiceColors.js';
import { Utils } from './Utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

//GM-facing damage type → dice appearance mapping editor
//world-scoped setting, opened from the main DsN config menu
export class DamageTypeConfig extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["dice-so-nice", "damage-type-config"],
        form: {
            handler: DamageTypeConfig._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        window: {
            title: "DICESONICE.DamageTypeConfigTitle",
            contentClasses: ["standard-form"],
            resizable: true
        },
        id: "damage-type-config",
        position: {
            width: 680,
            height: "auto"
        },
        actions: {
            addRow: DamageTypeConfig._onAddRow,
            deleteRow: DamageTypeConfig._onDeleteRow,
            resetRow: DamageTypeConfig._onResetRow
        }
    };

    static PARTS = {
        body: {
            template: "modules/dice-so-nice/templates/damage-type-config.hbs",
            scrollable: [".damage-type-config-table-wrap"]
        },
        footer: {
            template: "templates/generic/form-footer.hbs"
        }
    };

    constructor(options = {}) {
        super(options);
        //working rows carry a stable row key separate from the editable damage-type id
        //this lets the user rename a custom entry's id without breaking form field names
        //row shape: { key, id, label, preset, colorset, isBuiltin }
        this._rows = null;
        this._customCounter = 0;
    }

    _initRowsFromSetting() {
        const stored = game.settings.get("dice-so-nice", "damageTypeMap") ?? {};
        const builtinIds = Object.entries(COLORSETS)
            .filter(([, cs]) => cs.category === "DICESONICE.DamageTypes")
            .map(([key]) => key);

        const rows = [];
        for (const id of builtinIds) {
            const entry = stored[id] || {};
            rows.push({
                key: `builtin_${id}`,
                id,
                label: game.i18n.localize(COLORSETS[id].description),
                preset: entry.preset || "standard",
                colorset: entry.colorset || "",
                isBuiltin: true
            });
        }
        for (const [id, entry] of Object.entries(stored)) {
            if (builtinIds.includes(id)) continue;
            this._customCounter++;
            rows.push({
                key: `custom_${this._customCounter}`,
                id,
                label: entry.label || id,
                preset: entry.preset || "standard",
                colorset: entry.colorset || "",
                isBuiltin: false
            });
        }
        this._rows = rows;
    }

    async _prepareContext(options) {
        //defensive GM check on top of the menu's restricted:true
        if (!game.user.isGM) {
            throw new Error("DamageTypeConfig is GM-only");
        }

        if (!this._rows) {
            this._initRowsFromSetting();
        }

        //preset dropdown — standard comes first via prepareSystemList's sort, no blank option
        const systemList = Utils.prepareSystemList();
        const presetOptions = [];
        for (const [id, cfg] of Object.entries(systemList)) {
            presetOptions.push({ id, name: cfg.label });
        }

        //colorset dropdown — grouped by category, sorted inside each group
        const colorsetList = Utils.prepareColorsetList();
        const colorsetGroups = {};
        for (const [id, cs] of Object.entries(colorsetList)) {
            const group = cs.group || "";
            if (!colorsetGroups[group]) colorsetGroups[group] = [];
            colorsetGroups[group].push({ id, label: cs.label });
        }
        const colorsetGroupList = Object.entries(colorsetGroups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, items]) => ({ group, items }));

        //per-row, precompute which options are selected so the template doesn't need a comparison helper
        const renderRows = this._rows.map(r => ({
            key: r.key,
            id: r.id,
            label: r.label,
            isBuiltin: r.isBuiltin,
            presets: presetOptions.map(p => ({ ...p, selected: p.id === r.preset })),
            colorsetGroups: colorsetGroupList.map(g => ({
                group: g.group,
                items: g.items.map(it => ({ ...it, selected: it.id === r.colorset }))
            })),
            colorsetBlankSelected: (r.colorset === ""),
            hasPreset: r.preset !== "",
            hasColorset: r.colorset !== ""
        }));

        return {
            rows: renderRows,
            buttons: [
                { type: "submit", icon: "fa-solid fa-save", label: "DICESONICE.Save" },
                { type: "button", action: "close", icon: "fa-solid fa-ban", label: "DICESONICE.Cancel" }
            ]
        };
    }

    _onRender(context, options) {
        const html = this.element;
        html.querySelectorAll(".damage-type-row").forEach(row => this._syncRowInterlock(row));

        //theme disables when the preset is non-standard (its colorset wins instead)
        html.addEventListener("change", (ev) => {
            const target = ev.target;
            if (!(target instanceof HTMLElement)) return;
            if (!target.matches("select[name^='preset-']")) return;
            const row = target.closest(".damage-type-row");
            if (!row) return;
            this._captureForm();
            this._syncRowInterlock(row);
        });
    }

    //theme is only selectable when preset is "standard" — any other preset brings its own colorset
    _syncRowInterlock(row) {
        const presetSelect = row.querySelector("select[name^='preset-']");
        const colorsetSelect = row.querySelector("select[name^='colorset-']");
        if (!presetSelect || !colorsetSelect) return;

        const isStandard = (presetSelect.value || "standard") === "standard";
        colorsetSelect.disabled = !isStandard;
        if (!isStandard) {
            colorsetSelect.value = "";
        }
    }

    //read the current form state back into this._rows so add/delete/interlock don't drop edits
    _captureForm() {
        if (!this._rows) return;
        const html = this.element;
        for (const r of this._rows) {
            const row = html.querySelector(`.damage-type-row[data-key='${r.key}']`);
            if (!row) continue;
            r.preset = row.querySelector(`[name='preset-${r.key}']`)?.value || "";
            r.colorset = row.querySelector(`[name='colorset-${r.key}']`)?.value || "";
            if (!r.isBuiltin) {
                const labelInput = row.querySelector(`[name='label-${r.key}']`);
                if (labelInput) {
                    r.label = labelInput.value || "";
                    //id is derived from the label — single source of truth for custom rows
                    r.id = labelInput.value.trim().toLowerCase();
                }
            }
        }
    }

    static _onAddRow(event, target) {
        event.preventDefault();
        this._captureForm();
        this._customCounter++;
        this._rows.push({
            key: `custom_${this._customCounter}`,
            id: "",
            label: game.i18n.localize("DICESONICE.DamageTypeNewEntry"),
            preset: "standard",
            colorset: "",
            isBuiltin: false
        });
        this.render();
    }

    static _onDeleteRow(event, target) {
        event.preventDefault();
        const key = target.dataset.key;
        if (!key) return;
        this._captureForm();
        this._rows = this._rows.filter(r => r.key !== key);
        this.render();
    }

    static _onResetRow(event, target) {
        event.preventDefault();
        const key = target.dataset.key;
        if (!key) return;
        this._captureForm();
        const row = this._rows.find(r => r.key === key);
        if (row) {
            row.preset = "standard";
            row.colorset = "";
        }
        this.render();
    }

    static async _onSubmit(event, form, formData) {
        this._captureForm();

        const final = {};
        for (const r of this._rows) {
            //skip rows still at default (standard preset + no theme) — they'd do nothing
            const isDefault = (r.preset === "standard" || !r.preset) && !r.colorset;
            if (isDefault) continue;
            if (!r.isBuiltin && !r.id) {
                ui.notifications.warn(game.i18n.localize("DICESONICE.DamageTypeMissingId"));
                continue;
            }
            const entry = {};
            if (r.preset && r.preset !== "standard") entry.preset = r.preset;
            if (r.colorset) entry.colorset = r.colorset;
            if (!r.isBuiltin && r.label) entry.label = r.label;
            final[r.id] = entry;
        }

        await game.settings.set("dice-so-nice", "damageTypeMap", final);
        ui.notifications.info(game.i18n.localize("DICESONICE.DamageTypeConfigSaved"));
    }
}
