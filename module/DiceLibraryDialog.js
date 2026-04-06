import { DiceEditor } from './DiceEditor.js';
import { DiceLibrary, LIBRARY_DIE_TYPES } from './DiceLibrary.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Unified library popup - shows all die types in collapsible sections,
 * including other users' dice (duplicate-only).
 */
export class DiceLibraryDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        classes: ["dice-so-nice", "dice-library-dialog-app"],
        window: {
            title: "DICESONICE.diceLibrary",
            contentClasses: ["standard-form"],
            resizable: true
        },
        id: "dice-library-dialog",
        position: {
            width: 540,
            height: 500
        }
    };

    static PARTS = {
        content: {
            template: "modules/dice-so-nice/templates/dice-library-dialog.hbs",
            scrollable: [".dice-library-list"]
        }
    };

    constructor(options = {}) {
        super(options);
        this.dieType = options.diceType || options.dieType || null;
        this.diceConfig = options.diceConfig || null;
    }

    _refreshConfigDropdown() {
        if (this.diceConfig) {
            this.diceConfig.refreshLibraryDropdown();
        }
    }

    async _prepareContext(options) {
        const myId = game.user.id;
        const myDice = game.dice3d.diceLibrary.getAll();

        // Collect other users' dice
        const otherUsersData = [];
        for (const user of game.users) {
            if (user.id === myId) continue;
            const userDice = DiceLibrary.getLibraryForUser(user);
            if (userDice.length > 0) {
                otherUsersData.push({
                    userId: user.id,
                    userName: game.i18n.format("DICESONICE.libraryUserDice", { name: user.name }),
                    dice: userDice
                });
            }
        }

        // Build sections by die type - collect all types that have at least one die
        const allTypes = new Set();
        for (const d of myDice) allTypes.add(d.dieType);
        for (const u of otherUsersData) {
            for (const d of u.dice) allTypes.add(d.dieType);
        }

        // Sort die types in canonical order
        const sortedTypes = [...allTypes].sort((a, b) => {
            const ia = LIBRARY_DIE_TYPES.indexOf(a);
            const ib = LIBRARY_DIE_TYPES.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });

        const sections = sortedTypes.map(dieType => {
            const myTypeDice = myDice.filter(d => d.dieType === dieType);
            const otherUsers = otherUsersData
                .map(u => ({
                    userId: u.userId,
                    userName: u.userName,
                    dice: u.dice.filter(d => d.dieType === dieType)
                }))
                .filter(u => u.dice.length > 0);

            return {
                dieType,
                label: dieType.toUpperCase(),
                expanded: dieType === this.dieType,
                myDice: myTypeDice,
                otherUsers
            };
        });

        // Build die type list for footer create selector
        const dieTypeOptions = LIBRARY_DIE_TYPES.map(t => ({
            value: t,
            label: t.toUpperCase(),
            selected: t === this.dieType
        }));

        return { sections, hasAnySections: sections.length > 0, dieTypeOptions };
    }

    /** @deprecated Use DiceLibrary.buildLibraryDiceGroups instead */
    static buildLibraryDiceGroups(dieType, appearance, selectedOverride = null) {
        return DiceLibrary.buildLibraryDiceGroups(dieType, appearance, selectedOverride);
    }

    _onRender(context, options) {
        const html = $(this.element);

        // Remove previous event handlers to avoid stacking on re-render
        html.off(".diceLibrary");

        // Collapse/expand sections
        html.on("click.diceLibrary", "[data-action=toggleSection]", (ev) => {
            const section = $(ev.currentTarget).closest(".dice-library-section");
            section.toggleClass("collapsed");
        });

        // Create new die in a specific section
        html.on("click.diceLibrary", "[data-action=createNew]", (ev) => {
            ev.stopPropagation();
            const dieType = $(ev.currentTarget).data("die-type");
            const editor = new DiceEditor(dieType, null, {
                diceConfig: this.diceConfig,
                onSave: () => { this.render(true); this._refreshConfigDropdown(); }
            });
            editor.render(true);
        });

        // Edit own die
        html.on("click.diceLibrary", "[data-action=editDie]", (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            const die = game.dice3d.diceLibrary.get(id);
            if (!die) return;
            const editor = new DiceEditor(die.dieType, die, {
                onSave: () => { this.render(true); this._refreshConfigDropdown(); }
            });
            editor.render(true);
        });

        // Duplicate own die
        html.on("click.diceLibrary", "[data-action=duplicateDie]", async (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            await game.dice3d.diceLibrary.duplicate(id);
            this.render(true);
            this._refreshConfigDropdown();
        });

        // Duplicate another user's die into own library
        html.on("click.diceLibrary", "[data-action=duplicateOtherDie]", async (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            const userId = $(ev.currentTarget).data("user-id");
            const owner = game.users.get(userId);
            if (!owner) return;
            const die = DiceLibrary.getFromUser(owner, id);
            if (!die) return;
            const copy = foundry.utils.deepClone(die);
            delete copy.id;
            copy.name = `${copy.name} (Copy)`;
            await game.dice3d.diceLibrary.add(copy);
            this.render(true);
            this._refreshConfigDropdown();
        });

        // Delete own die
        html.on("click.diceLibrary", "[data-action=deleteDie]", async (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            const die = game.dice3d.diceLibrary.get(id);
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize("DICESONICE.Delete") },
                content: `<p>${game.i18n.format("DICESONICE.editorDeleteConfirm", { name: die?.name || "die" })}</p>`
            });
            if (!confirmed) return;
            await game.dice3d.diceLibrary.delete(id);
            game.dice3d.box.dicefactory.disposeCachedMaterials();
            this.render(true);
            this._refreshConfigDropdown();
        });

        // Footer: create die from selected type
        html.on("click.diceLibrary", "[data-action=createFromFooter]", () => {
            const dieType = html.find("[data-footer-dietype]").val();
            if (!dieType) return;
            const editor = new DiceEditor(dieType, null, {
                diceConfig: this.diceConfig,
                onSave: () => { this.render(true); this._refreshConfigDropdown(); }
            });
            editor.render(true);
        });

        // Auto-scroll to the expanded section
        if (this.dieType) {
            const target = html.find(`.dice-library-section[data-die-type="${this.dieType}"]`);
            if (target.length) {
                target[0].scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    }
}
