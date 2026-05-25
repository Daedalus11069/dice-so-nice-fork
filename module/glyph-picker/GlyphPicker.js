import emojiSet from "./emoji-set.js";
import faIconSet from "./fa-icon-set.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

//in-house glyph picker
export class GlyphPicker extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        classes: ["dice-so-nice", "dsn-glyph-picker"],
        window: {
            title: "DICESONICE.glyphPicker.title",
            resizable: true
        },
        id: "dsn-glyph-picker",
        position: {
            width: 480,
            height: 560
        }
    };

    static PARTS = {
        main: {
            template: "modules/dice-so-nice/templates/glyph-picker.hbs",
            scrollable: [".dsn-glyph-picker-grid"]
        }
    };

    static FA_PRO_FAMILY = '"Font Awesome 7 Pro"';

    constructor(options = {}) {
        super(options);
        this.onSelect = options.onSelect || (() => {});
        this.activeTab = options.initialTab === "emoji" ? "emoji" : "icons";
        this.searchFilter = "";
    }

    //entry point for callers
    static open(options = {}) {
        const picker = new GlyphPicker(options);
        picker.render(true);
        return picker;
    }

    async _prepareContext() {
        const iconCategories = Object.entries(faIconSet).map(([id, cat]) => ({
            id,
            label: cat.label,
            localizedLabel: game.i18n.localize(cat.label),
            icons: cat.icons
        }));
        const emojiCategories = Object.entries(emojiSet).map(([id, cat]) => ({
            id,
            label: cat.label,
            emojis: cat.emojis
        }));
        return {
            iconCategories,
            emojiCategories,
            iconsActive: this.activeTab === "icons",
            emojiActive: this.activeTab === "emoji"
        };
    }

    _onRender() {
        const el = this.element;

        el.addEventListener("click", (ev) => {
            const tabBtn = ev.target.closest("[data-dsn-tab]");
            if (tabBtn) {
                const tab = tabBtn.dataset.dsnTab;
                this.activeTab = tab;
                el.querySelectorAll("[data-dsn-tab]").forEach(t => t.classList.remove("active"));
                el.querySelector(`[data-dsn-tab="${tab}"]`).classList.add("active");
                el.querySelectorAll("[data-dsn-tab-content]").forEach(c => {
                    c.hidden = c.dataset.dsnTabContent !== tab;
                });
                //reapply the search filter on the newly visible grid
                this._applyFilter(el);
                return;
            }

            const iconBtn = ev.target.closest("button.dsn-glyph-icon");
            if (iconBtn) {
                const glyph = iconBtn.dataset.glyph;
                this.onSelect({ labelText: glyph, font: GlyphPicker.FA_PRO_FAMILY });
                this.close();
                return;
            }

            const emojiBtn = ev.target.closest("button.dsn-glyph-emoji");
            if (emojiBtn) {
                const glyph = emojiBtn.dataset.glyph;
                this.onSelect({ labelText: glyph, font: null });
                this.close();
                return;
            }
        });

        //simple substring filter on className (icons) or glyph (emoji)
        el.addEventListener("input", (ev) => {
            if (ev.target.matches("input.dsn-glyph-search")) {
                this.searchFilter = ev.target.value.toLowerCase().trim();
                this._applyFilter(el);
            }
        });

        this._applyFilter(el);
        el.querySelectorAll("[data-dsn-tab-content]").forEach(c => {
            c.hidden = c.dataset.dsnTabContent !== this.activeTab;
        });
    }

    _applyFilter(el) {
        const q = this.searchFilter;

        el.querySelectorAll("button.dsn-glyph-icon").forEach(btn => {
            const name = btn.dataset.name || "";
            btn.hidden = q ? !name.includes(q) : false;
        });
        el.querySelectorAll("[data-dsn-icon-cat]").forEach(cat => {
            const label = (cat.dataset.label || "").toLowerCase();
            //if the search matches the category label, show every button inside it
            if (q && label.includes(q)) {
                cat.hidden = false;
                cat.querySelectorAll("button.dsn-glyph-icon").forEach(b => b.hidden = false);
                return;
            }
            //otherwise hide the whole category if every button got filtered out
            const visible = cat.querySelectorAll("button.dsn-glyph-icon:not([hidden])").length;
            cat.hidden = q ? visible === 0 : false;
        });
    }
}
