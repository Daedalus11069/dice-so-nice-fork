/**
 * Masks initiative values in the combat tracker while their 3D roll
 * animation is playing. Freezes the tracker turn order so the result
 * is not spoiled by Foundry's re-sort.
 */
export class InitiativeMask {

    static _pendingCombatants = new Set();
    static _messageToCombatant = new Map();
    static _frozenOrder = null;
    static _pendingSnapshot = null;
    static _renderTimer = null;

    static _scheduleTrackerRender() {
        if (this._renderTimer) return;
        this._renderTimer = setTimeout(() => {
            InitiativeMask._renderTimer = null;
            ui.combat?.render();
        }, 50);
    }

    static _resolveCombatantId(chatMessage) {
        const combat = game.combat;
        if (!combat) return null;
        const speaker = chatMessage.speaker || {};
        let combatant = null;
        if (speaker.token) combatant = combat.combatants.find(c => c.tokenId === speaker.token);
        if (!combatant && speaker.actor) combatant = combat.combatants.find(c => c.actorId === speaker.actor);
        return combatant?.id ?? null;
    }

    /**
     * Capture the pre-reorder turn order. Called from preUpdateCombatant
     * because Combat.rollInitiative updates combatants before creating
     * chat messages.
     */
    static snapshot(combatant) {
        if (this._pendingCombatants.size) return;
        const combat = combatant?.parent;
        if (!combat || combat !== game.combat) return;
        this._pendingSnapshot = combat.turns.map(c => c.id);
    }

    /**
     * Flag a chat message as an initiative roll about to animate.
     */
    static flag(chatMessage) {
        const combatantId = this._resolveCombatantId(chatMessage);
        if (!combatantId) return;
        if (!this._pendingCombatants.size && this._pendingSnapshot) {
            this._frozenOrder = this._pendingSnapshot;
            this._pendingSnapshot = null;
        }
        this._pendingCombatants.add(combatantId);
        this._messageToCombatant.set(chatMessage.id, combatantId);
        ui.combat?.render();
    }

    /**
     * Release the mask for a message once its animation finishes.
     */
    static release(messageId) {
        const combatantId = this._messageToCombatant.get(messageId);
        if (!combatantId) return;
        this._messageToCombatant.delete(messageId);
        this._pendingCombatants.delete(combatantId);
        if (!this._pendingCombatants.size) this._frozenOrder = null;
        this._scheduleTrackerRender();
    }

    /**
     * Tag pending rows in the combat tracker, inject the hourglass icon,
     * and restore frozen turn order so Foundry's re-sort doesn't spoil results.
     */
    static apply(html) {
        if (!this._pendingCombatants.size) return;
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root) return;

        if (this._frozenOrder) {
            const rows = new Map();
            for (const li of root.querySelectorAll("[data-combatant-id]"))
                rows.set(li.dataset.combatantId, li);
            const parent = rows.values().next().value?.parentElement;
            if (parent) {
                for (const id of this._frozenOrder) {
                    const li = rows.get(id);
                    if (li) parent.appendChild(li);
                }
            }
        }

        for (const combatantId of this._pendingCombatants) {
            const li = root.querySelector(`[data-combatant-id="${combatantId}"]`);
            if (!li) continue;
            li.classList.add("dsn-initiative-pending");
            const cell = li.querySelector(".token-initiative");
            if (cell && !cell.querySelector(".dsn-initiative-pending-icon")) {
                const icon = document.createElement("i");
                icon.className = "fa-solid fa-hourglass-half dsn-initiative-pending-icon";
                cell.appendChild(icon);
            }
        }
    }
}
