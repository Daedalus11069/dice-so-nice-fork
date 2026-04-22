// Masks initiative values in the combat tracker while their 3D roll animation is playing.

const pendingCombatants = new Set();
const messageToCombatant = new Map();
// frozen turn order held while any animation is pending.
// captured in preUpdateCombatant because Combat.rollInitiative updates combatants
// before creating chat messages - by the time createChatMessage fires, the tracker
// has already re-sorted. we must snapshot the pre-update order.
let frozenOrder = null;
// staging slot: preUpdateCombatant snapshots here, flag() promotes to frozenOrder.
// orphan snapshots from manual init edits are harmless - the next preUpdateCombatant
// overwrites, and flag() only promotes when no animation is already pending.
let pendingSnapshot = null;

let renderTimer = null;
function scheduleTrackerRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
        renderTimer = null;
        ui.combat?.render();
    }, 50);
}

function resolveCombatantId(chatMessage) {
    const combat = game.combat;
    if (!combat) return null;
    const speaker = chatMessage.speaker || {};
    let combatant = null;
    if (speaker.token) combatant = combat.combatants.find(c => c.tokenId === speaker.token);
    if (!combatant && speaker.actor) combatant = combat.combatants.find(c => c.actorId === speaker.actor);
    return combatant?.id ?? null;
}

export const InitiativeMask = {
    // called from preUpdateCombatant; captures the pre-reorder turn order so the
    // tracker can be frozen before foundry commits the initiative update
    snapshot(combatant) {
        if (pendingCombatants.size) return; // already frozen
        const combat = combatant?.parent;
        if (!combat || combat !== game.combat) return;
        pendingSnapshot = combat.turns.map(c => c.id);
    },

    // called from createChatMessage when an initiative roll is about to animate
    flag(chatMessage) {
        const combatantId = resolveCombatantId(chatMessage);
        if (!combatantId) return;
        if (!pendingCombatants.size && pendingSnapshot) {
            frozenOrder = pendingSnapshot;
            pendingSnapshot = null;
        }
        pendingCombatants.add(combatantId);
        messageToCombatant.set(chatMessage.id, combatantId);
        ui.combat?.render();
    },

    // called from Dice3D when the animation for a message is done
    release(messageId) {
        const combatantId = messageToCombatant.get(messageId);
        if (!combatantId) return;
        messageToCombatant.delete(messageId);
        pendingCombatants.delete(combatantId);
        if (!pendingCombatants.size) frozenOrder = null;
        scheduleTrackerRender();
    },

    // called from renderCombatTracker to tag pending rows, inject the hourglass,
    // and restore the frozen turn order so foundry's re-sort doesn't spoil the result
    apply(html) {
        if (!pendingCombatants.size) return;
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root) return;

        if (frozenOrder) {
            const rows = new Map();
            for (const li of root.querySelectorAll("[data-combatant-id]"))
                rows.set(li.dataset.combatantId, li);
            const parent = rows.values().next().value?.parentElement;
            if (parent) {
                for (const id of frozenOrder) {
                    const li = rows.get(id);
                    if (li) parent.appendChild(li);
                }
            }
        }

        for (const combatantId of pendingCombatants) {
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
};
