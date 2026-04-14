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
        const html = $(this.element);
        html.off(".dsnGlyphPicker");

        html.on("click.dsnGlyphPicker", "[data-dsn-tab]", (ev) => {
            const tab = ev.currentTarget.dataset.dsnTab;
            this.activeTab = tab;
            html.find("[data-dsn-tab]").removeClass("active");
            html.find(`[data-dsn-tab="${tab}"]`).addClass("active");
            html.find("[data-dsn-tab-content]").each(function () {
                this.hidden = this.dataset.dsnTabContent !== tab;
            });
            //reapply the search filter on the newly visible grid
            this._applyFilter(html);
        });

        //simple substring filter on className (icons) or glyph (emoji)
        html.on("input.dsnGlyphPicker", "input.dsn-glyph-search", (ev) => {
            this.searchFilter = ev.target.value.toLowerCase().trim();
            this._applyFilter(html);
        });

        html.on("click.dsnGlyphPicker", "button.dsn-glyph-icon", (ev) => {
            const btn = ev.currentTarget;
            const glyph = btn.dataset.glyph;
            this.onSelect({ labelText: glyph, font: GlyphPicker.FA_PRO_FAMILY });
            this.close();
        });

        html.on("click.dsnGlyphPicker", "button.dsn-glyph-emoji", (ev) => {
            const btn = ev.currentTarget;
            const glyph = btn.dataset.glyph;
            this.onSelect({ labelText: glyph, font: null });
            this.close();
        });

        this._applyFilter(html);
        html.find("[data-dsn-tab-content]").each((_, el) => {
            el.hidden = el.dataset.dsnTabContent !== this.activeTab;
        });
    }

    _applyFilter(html) {
        const q = this.searchFilter;

        html.find("button.dsn-glyph-icon").each(function () {
            const name = this.dataset.name || "";
            this.hidden = q ? !name.includes(q) : false;
        });
        html.find("[data-dsn-icon-cat]").each(function () {
            const label = (this.dataset.label || "").toLowerCase();
            //if the search matches the category label, show every button inside it
            if (q && label.includes(q)) {
                this.hidden = false;
                this.querySelectorAll("button.dsn-glyph-icon").forEach(b => b.hidden = false);
                return;
            }
            //otherwise hide the whole category if every button got filtered out
            const visible = this.querySelectorAll("button.dsn-glyph-icon:not([hidden])").length;
            this.hidden = q ? visible === 0 : false;
        });
    }
}
