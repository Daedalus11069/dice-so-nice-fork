import { DiceConfig } from './DiceConfig.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

//sidebar tab for persistent dice - per-type counters, visibility, clear buttons
export class DsnSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {

    static tabName = "dice-so-nice";

    static DEFAULT_OPTIONS = {
        id: "dice-so-nice",
        classes: ["dice-so-nice", "dsn-sidebar-tab"],
        window: {
            title: "DICESONICE.sidebarTabTitle",
            icon: "fa-solid fa-dice-d20"
        },
        actions: {
            spawn: DsnSidebarTab._onSpawn,
            remove: DsnSidebarTab._onRemove,
            toggleExtras: DsnSidebarTab._onToggleExtras,
            clearMine: DsnSidebarTab._onClearMine,
            clearAll: DsnSidebarTab._onClearAll,
            openConfig: DsnSidebarTab._onOpenConfig
        }
    };

    static PARTS = {
        content: {
            template: "modules/dice-so-nice/templates/dsn-sidebar-tab.hbs",
            root: true
        }
    };

    //dice types behind "Show more", d100 handled separately as linked pair
    static EXTRA_DICE_TYPES = ["d3", "d5", "d7", "d14", "d16", "d24", "d30"];

    static HIDDEN_DICE_TYPES = new Set(["dc", "df"]);

    constructor(options = {}) {
        super(options);
        this._showExtras = false;

        //re-render when persistent dice change from outside the sidebar
        this._persistentChangedHookId = Hooks.on(
            "dice-so-nice.persistentDiceChanged",
            () => this._onPersistentDiceChanged()
        );
    }

    _onPersistentDiceChanged() {
        if (this.rendered) this.render(false);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        const persistentDiceEnabled = !!game.settings.get("dice-so-nice", "persistentDice");
        const box = game.dice3d?.box;

        let diceContext = null;
        if (persistentDiceEnabled && box) {
            const standardDice = [...box.dicefactory.systems.get("standard").dice.keys()];

            const isExtra = (t) => DsnSidebarTab.EXTRA_DICE_TYPES.includes(t);
            const isHidden = (t) => DsnSidebarTab.HIDDEN_DICE_TYPES.has(t);
            const isD100 = (t) => t === "d100";

            const toEntry = (type) => ({
                type,
                label: type.toUpperCase(),
                count: box.countPersistentDiceByOwner(game.user.id, type)
            });

            const main = standardDice
                .filter(t => !isExtra(t) && !isHidden(t) && !isD100(t))
                .map(toEntry);

            const extras = standardDice
                .filter(t => isExtra(t))
                .map(toEntry);

            const hasD100 = standardDice.includes("d100") && standardDice.includes("d10");
            const d100Entry = hasD100 ? toEntry("d100") : null;

            const visibility = box.persistentDiceVisibility || "all";
            diceContext = {
                mainDice: main,
                extraDice: extras,
                showExtras: this._showExtras,
                d100: d100Entry,
                visibility,
                visibilityAll: visibility === "all",
                visibilityMine: visibility === "mine",
                visibilityNone: visibility === "none"
            };
        }

        return Object.assign(context, {
            persistentDiceEnabled,
            ready: !!box,
            dice: diceContext,
            isGM: !!game.user?.isGM
        });
    }

    //select change needs manual wiring — ApplicationV2 actions only fire on click
    _onRender(context, options) {
        super._onRender?.(context, options);
        const select = this.element.querySelector("[data-action=setVisibility]");
        if (select) {
            select.addEventListener("change", (ev) => {
                game.dice3d?.setPersistentDiceVisibility(ev.currentTarget.value);
            });
        }
    }

    async _confirm(titleKey, contentKey) {
        return foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize(titleKey) },
            content: `<p>${game.i18n.localize(contentKey)}</p>`,
            modal: true
        });
    }

    static async _onSpawn(event, target) {
        const type = target.dataset.type;
        if (!type) return;
        await this._spawn(type);
        this.render(true);
    }

    static async _onRemove(event, target) {
        const type = target.dataset.type;
        if (!type) return;
        await this._remove(type);
        this.render(true);
    }

    static _onToggleExtras() {
        this._showExtras = !this._showExtras;
        this.render(true);
    }

    static async _onClearMine() {
        await this._clearMine();
        this.render(true);
    }

    static async _onClearAll() {
        await this._clearAll();
        this.render(true);
    }

    static _onOpenConfig() {
        new DiceConfig().render(true);
    }

    async _spawn(type) {
        const dice3d = game.dice3d;
        if (!dice3d) return;

        //d100 spawns as linked tens+units pair, bail if primary fails
        if (type === "d100") {
            const linkGroupId = foundry.utils.randomID();
            const primary = await dice3d.spawnPersistentDie("d100", null, { linkGroupId });
            if (!primary) return;
            await dice3d.spawnPersistentDie("d10", null, { linkGroupId, linkGroupSecondary: true });
            return;
        }

        await dice3d.spawnPersistentDie(type);
    }

    async _remove(type) {
        const box = game.dice3d?.box;
        if (!box) return;

        const mesh = box.findMostRecentPersistentDie(type, game.user.id);
        if (!mesh) return;

        //if part of a link group (d100 pair), remove all members
        const linkGroupId = mesh.userData.linkGroupId;
        if (linkGroupId) {
            const ids = box.persistentDiceList
                .filter(m => m.userData.linkGroupId === linkGroupId)
                .map(m => m.userData.persistentId);
            await Promise.all(ids.map(id => game.dice3d.removePersistentDie(id)));
            return;
        }

        await game.dice3d.removePersistentDie(mesh.userData.persistentId);
    }

    async _clearMine() {
        const dice3d = game.dice3d;
        if (!dice3d) return;
        const confirmed = await this._confirm(
            "DICESONICE.persistentDiceToolboxClearMineConfirmTitle",
            "DICESONICE.persistentDiceToolboxClearMineConfirm"
        );
        if (!confirmed) return;
        await dice3d.clearPersistentDice({ ownerUserId: game.user.id });
    }

    async _clearAll() {
        if (!game.user?.isGM) return;
        const dice3d = game.dice3d;
        if (!dice3d) return;
        const confirmed = await this._confirm(
            "DICESONICE.persistentDiceToolboxClearAllConfirmTitle",
            "DICESONICE.persistentDiceToolboxClearAllConfirm"
        );
        if (!confirmed) return;
        await dice3d.clearPersistentDice();
    }
}
