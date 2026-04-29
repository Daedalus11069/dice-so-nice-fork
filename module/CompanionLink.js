/**
 * Tracks companion messages linked to a primary roll message so they can be
 * hidden during animation and revealed together when the roll completes.
 */
export class CompanionLink {

    static SAFETY_TIMEOUT_MS = 30000;

    static _primaryToCompanions = new Map();
    static _companionToPrimary = new Map();
    static _companionTimeouts = new Map();

    static _revealCompanionElement(companionId) {
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

    static _clearCompanionTimeout(companionId) {
        const timer = this._companionTimeouts.get(companionId);
        if (timer) {
            clearTimeout(timer);
            this._companionTimeouts.delete(companionId);
        }
    }

    static _startSafetyTimeout(companionId, primaryId) {
        const timer = setTimeout(() => {
            CompanionLink._companionTimeouts.delete(companionId);
            CompanionLink.release(primaryId);

            const primary = game.messages.get(primaryId);
            if (primary?._dice3danimating) {
                delete primary._dice3danimating;
                const selector = `.message[data-message-id="${primaryId}"]`;
                document.querySelector(selector)?.classList.remove("dsn-hide");
                const popout = window.ui?.sidebar?.popouts?.chat;
                if (popout) popout.element?.querySelector(selector)?.classList.remove("dsn-hide");
            }
        }, this.SAFETY_TIMEOUT_MS);
        this._companionTimeouts.set(companionId, timer);
    }

    static register(companionId, primaryId) {
        if (!this._primaryToCompanions.has(primaryId))
            this._primaryToCompanions.set(primaryId, new Set());
        this._primaryToCompanions.get(primaryId).add(companionId);
        this._companionToPrimary.set(companionId, primaryId);
        this._startSafetyTimeout(companionId, primaryId);
        return true;
    }

    static release(primaryId) {
        const companions = this._primaryToCompanions.get(primaryId);
        if (!companions) return [];

        const released = [...companions];
        for (const companionId of released) {
            this._revealCompanionElement(companionId);
            this._clearCompanionTimeout(companionId);
            this._companionToPrimary.delete(companionId);
        }
        this._primaryToCompanions.delete(primaryId);
        return released;
    }

    static isHidden(companionId) {
        return this._companionToPrimary.has(companionId);
    }

    static cleanup(messageId) {
        if (this._primaryToCompanions.has(messageId)) {
            this.release(messageId);
            return;
        }
        const primaryId = this._companionToPrimary.get(messageId);
        if (!primaryId) return;
        this._clearCompanionTimeout(messageId);
        this._companionToPrimary.delete(messageId);
        const set = this._primaryToCompanions.get(primaryId);
        if (set) {
            set.delete(messageId);
            if (!set.size) this._primaryToCompanions.delete(primaryId);
        }
    }

    static releaseAll() {
        for (const primaryId of [...this._primaryToCompanions.keys()]) {
            this.release(primaryId);
        }
    }
}
