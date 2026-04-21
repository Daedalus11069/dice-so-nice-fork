// tracks companion messages linked to a primary roll message so they can be
// hidden during animation and revealed together when the roll completes.

const SAFETY_TIMEOUT_MS = 30000;

const primaryToCompanions = new Map();
const companionToPrimary = new Map();
const companionTimeouts = new Map();

function revealCompanionElement(companionId) {
    const selector = `.message[data-message-id="${companionId}"]`;

    const mainEl = window.ui?.chat?.element?.querySelector(selector);
    if (mainEl) mainEl.classList.remove("dsn-hide");

    const popout = window.ui?.sidebar?.popouts?.chat;
    if (popout) {
        const popoutEl = popout.element?.querySelector(selector);
        if (popoutEl) popoutEl.classList.remove("dsn-hide");
    }

    const notifEl = document.querySelector(`#chat-notifications ${selector}`);
    if (notifEl) notifEl.remove();

    if (!ui.sidebar.expanded) {
        const msg = game.messages.get(companionId);
        if (msg) {
            ui.chat.notify(msg, {
                newMessage: true,
                existing: ui.chat.element.querySelector(`[data-message-id="${companionId}"]`)
            });
        }
    }
}

function clearCompanionTimeout(companionId) {
    const timer = companionTimeouts.get(companionId);
    if (timer) {
        clearTimeout(timer);
        companionTimeouts.delete(companionId);
    }
}

function startSafetyTimeout(companionId, primaryId) {
    const timer = setTimeout(() => {
        companionTimeouts.delete(companionId);
        CompanionLink.release(primaryId);

        // also reveal the primary if it is still hidden
        const primary = game.messages.get(primaryId);
        if (primary?._dice3danimating) {
            delete primary._dice3danimating;
            const selector = `.message[data-message-id="${primaryId}"]`;
            document.querySelector(selector)?.classList.remove("dsn-hide");
            const popout = window.ui?.sidebar?.popouts?.chat;
            if (popout) popout.element?.querySelector(selector)?.classList.remove("dsn-hide");
        }
    }, SAFETY_TIMEOUT_MS);
    companionTimeouts.set(companionId, timer);
}

export const CompanionLink = {
    register(companionId, primaryId) {
        if (!primaryToCompanions.has(primaryId))
            primaryToCompanions.set(primaryId, new Set());
        primaryToCompanions.get(primaryId).add(companionId);
        companionToPrimary.set(companionId, primaryId);
        startSafetyTimeout(companionId, primaryId);
        return true;
    },

    release(primaryId) {
        const companions = primaryToCompanions.get(primaryId);
        if (!companions) return [];

        const released = [...companions];
        for (const companionId of released) {
            revealCompanionElement(companionId);
            clearCompanionTimeout(companionId);
            companionToPrimary.delete(companionId);
        }
        primaryToCompanions.delete(primaryId);
        return released;
    },

    isHidden(companionId) {
        return companionToPrimary.has(companionId);
    },

    cleanup(messageId) {
        // if it is a primary, release all its companions
        if (primaryToCompanions.has(messageId)) {
            this.release(messageId);
            return;
        }
        // if it is a companion, remove it from tracking
        const primaryId = companionToPrimary.get(messageId);
        if (!primaryId) return;
        clearCompanionTimeout(messageId);
        companionToPrimary.delete(messageId);
        const set = primaryToCompanions.get(primaryId);
        if (set) {
            set.delete(messageId);
            if (!set.size) primaryToCompanions.delete(primaryId);
        }
    },

    releaseAll() {
        for (const primaryId of [...primaryToCompanions.keys()]) {
            this.release(primaryId);
        }
    }
};
