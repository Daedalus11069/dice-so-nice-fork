import { DiceEditor } from './DiceEditor.js';
import { DiceLibrary } from '../engine/DiceLibrary.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

//library popup - collapsible sections per die type, including other users' dice
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

        const allTypes = new Set();
        for (const d of myDice) allTypes.add(d.dieType);
        for (const u of otherUsersData) {
            for (const d of u.dice) allTypes.add(d.dieType);
        }

        const sortedTypes = [...allTypes].sort((a, b) => {
            const ia = DiceLibrary.LIBRARY_DIE_TYPES.indexOf(a);
            const ib = DiceLibrary.LIBRARY_DIE_TYPES.indexOf(b);
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

        const dieTypeOptions = DiceLibrary.getFullDieTypes().map(t => ({
            value: t,
            label: t.toUpperCase(),
            selected: t === this.dieType
        }));

        return { sections, hasAnySections: sections.length > 0, dieTypeOptions };
    }

    _onRender(context, options) {
        const el = this.element;

        el.addEventListener("click", (ev) => {
            const toggleTarget = ev.target.closest("[data-action=toggleSection]");
            if (toggleTarget) {
                const section = toggleTarget.closest(".dice-library-section");
                section.classList.toggle("collapsed");
                return;
            }

            const createNewTarget = ev.target.closest("[data-action=createNew]");
            if (createNewTarget) {
                ev.stopPropagation();
                const dieType = createNewTarget.dataset.dieType;
                const editor = new DiceEditor(dieType, null, {
                    diceConfig: this.diceConfig,
                    onSave: () => { this.render(true); this._refreshConfigDropdown(); }
                });
                editor.render(true);
                return;
            }

            const editTarget = ev.target.closest("[data-action=editDie]");
            if (editTarget) {
                const id = editTarget.dataset.dieId;
                const die = game.dice3d.diceLibrary.get(id);
                if (!die) return;
                const editor = new DiceEditor(die.dieType, die, {
                    onSave: () => { this.render(true); this._refreshConfigDropdown(); }
                });
                editor.render(true);
                return;
            }

            const duplicateTarget = ev.target.closest("[data-action=duplicateDie]");
            if (duplicateTarget) {
                const id = duplicateTarget.dataset.dieId;
                game.dice3d.diceLibrary.duplicate(id).then(() => {
                    this.render(true);
                    this._refreshConfigDropdown();
                });
                return;
            }

            const duplicateOtherTarget = ev.target.closest("[data-action=duplicateOtherDie]");
            if (duplicateOtherTarget) {
                const id = duplicateOtherTarget.dataset.dieId;
                const userId = duplicateOtherTarget.dataset.userId;
                const owner = game.users.get(userId);
                if (!owner) return;
                const die = DiceLibrary.getFromUser(owner, id);
                if (!die) return;
                const copy = foundry.utils.deepClone(die);
                delete copy.id;
                copy.name = `${copy.name} (Copy)`;
                game.dice3d.diceLibrary.add(copy).then(() => {
                    this.render(true);
                    this._refreshConfigDropdown();
                });
                return;
            }

            const deleteTarget = ev.target.closest("[data-action=deleteDie]");
            if (deleteTarget) {
                const id = deleteTarget.dataset.dieId;
                const die = game.dice3d.diceLibrary.get(id);
                foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize("DICESONICE.Delete") },
                    content: `<p>${game.i18n.format("DICESONICE.editorDeleteConfirm", { name: die?.name || "die" })}</p>`
                }).then(confirmed => {
                    if (!confirmed) return;
                    game.dice3d.diceLibrary.delete(id).then(() => {
                        game.dice3d.box.dicefactory.disposeCachedMaterials();
                        this.render(true);
                        this._refreshConfigDropdown();
                    });
                });
                return;
            }

            const createFromFooterTarget = ev.target.closest("[data-action=createFromFooter]");
            if (createFromFooterTarget) {
                const dieType = el.querySelector("[data-footer-dietype]").value;
                if (!dieType) return;
                const editor = new DiceEditor(dieType, null, {
                    diceConfig: this.diceConfig,
                    onSave: () => { this.render(true); this._refreshConfigDropdown(); }
                });
                editor.render(true);
                return;
            }
        });

        if (this.dieType) {
            const target = el.querySelector(`.dice-library-section[data-die-type="${this.dieType}"]`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    }
}
