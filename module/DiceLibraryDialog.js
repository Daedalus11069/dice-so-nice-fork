import { DiceEditor } from './DiceEditor.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Library popup — lists the user's custom dice for a given type, with CRUD actions.
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
            height: 400
        }
    };

    static PARTS = {
        content: {
            template: "modules/dice-so-nice/templates/dice-library-dialog.hbs",
            scrollable: [""]
        }
    };

    constructor(options = {}) {
        super(options);
        this.dieType = options.diceType || options.dieType || null;
        this.diceConfig = options.diceConfig || null;
    }

    async _prepareContext(options) {
        const library = game.dice3d.diceLibrary;
        let dice;
        if (this.dieType) {
            dice = library.getByType(this.dieType);
        } else {
            dice = library.getAll();
        }

        return {
            dieType: this.dieType ? this.dieType.toUpperCase() : game.i18n.localize("DICESONICE.editorAllTypes"),
            dice
        };
    }

    _onRender(context, options) {
        const html = $(this.element);

        // Remove previous event handlers to avoid stacking on re-render
        html.off("click.diceLibrary change.diceLibrary");

        html.on("click.diceLibrary", "[data-action=createNew]", () => {
            const dieType = this.dieType || "d20";
            const editor = new DiceEditor(dieType, null, {
                onSave: () => this.render(true)
            });
            editor.render(true);
        });

        html.on("click.diceLibrary", "[data-action=editDie]", (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            const die = game.dice3d.diceLibrary.get(id);
            if (!die) return;
            const editor = new DiceEditor(die.dieType, die, {
                onSave: () => this.render(true)
            });
            editor.render(true);
        });

        html.on("click.diceLibrary", "[data-action=duplicateDie]", async (ev) => {
            const id = $(ev.currentTarget).data("die-id");
            await game.dice3d.diceLibrary.duplicate(id);
            this.render(true);
        });


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
        });

        html.on("click.diceLibrary", "[data-action=importDie]", () => {
            html.find("[data-import-file]").trigger("click");
        });

        html.on("change.diceLibrary", "[data-import-file]", async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                await game.dice3d.diceLibrary.import(text);
                ui.notifications.info(game.i18n.localize("DICESONICE.editorImportSuccess"));
                this.render(true);
            } catch (e) {
                ui.notifications.error(e.message);
            }
        });
    }
}
