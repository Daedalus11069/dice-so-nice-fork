import { DiceColors } from './DiceColors.js';

/**
 * Manages CRUD operations on a user's custom dice library.
 * Stored in the `dice-so-nice/diceLibrary` user flag (array of custom die objects).
 */
export class DiceLibrary {

    constructor() {
        this._dice = [];
    }

    /**
     * Load library data from the current user's flags.
     */
    async load() {
        const data = game.user.getFlag("dice-so-nice", "diceLibrary");
        this._dice = Array.isArray(data) ? data : [];
    }

    /**
     * Save library data to the current user's flags.
     */
    async save() {
        await game.user.unsetFlag("dice-so-nice", "diceLibrary");
        await game.user.setFlag("dice-so-nice", "diceLibrary", this._dice);
    }

    /**
     * Get a single die by ID.
     */
    get(id) {
        return this._dice.find(d => d.id === id) || null;
    }

    /**
     * Get all dice.
     */
    getAll() {
        return [...this._dice];
    }

    /**
     * Get all dice of a given type (e.g., "d20", "d6").
     */
    getByType(dieType) {
        return this._dice.filter(d => d.dieType === dieType);
    }

    /**
     * Add a new die to the library.
     * @param {object} dieData - Die data without an ID.
     * @returns {object} The added die (with assigned ID).
     */
    async add(dieData) {
        const die = foundry.utils.deepClone(dieData);
        die.id = foundry.utils.randomID();
        die.createdAt = Date.now();
        die.updatedAt = Date.now();
        this._dice.push(die);
        await this.save();
        return die;
    }

    /**
     * Update an existing die.
     * @param {string} id
     * @param {object} dieData - Partial data to merge.
     */
    async update(id, dieData) {
        const index = this._dice.findIndex(d => d.id === id);
        if (index === -1) return null;
        foundry.utils.mergeObject(this._dice[index], dieData);
        this._dice[index].updatedAt = Date.now();
        await this.save();
        return this._dice[index];
    }

    /**
     * Delete a die from the library.
     */
    async delete(id) {
        this._dice = this._dice.filter(d => d.id !== id);
        await this.save();
    }

    /**
     * Duplicate an existing die.
     * @returns {object} The new copy.
     */
    async duplicate(id) {
        const original = this.get(id);
        if (!original) return null;
        const copy = foundry.utils.deepClone(original);
        copy.id = foundry.utils.randomID();
        copy.name = `${copy.name} (Copy)`;
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        this._dice.push(copy);
        await this.save();
        return copy;
    }

    /**
     * Export a die as a JSON string.
     */
    export(id) {
        const die = this.get(id);
        if (!die) return null;
        const exportData = foundry.utils.deepClone(die);
        delete exportData.id;
        return JSON.stringify({
            dsnLibraryExport: true,
            version: 1,
            dice: [exportData]
        }, null, 2);
    }

    /**
     * Export all dice as a JSON string.
     */
    exportAll() {
        const exportDice = this._dice.map(d => {
            const copy = foundry.utils.deepClone(d);
            delete copy.id;
            return copy;
        });
        return JSON.stringify({
            dsnLibraryExport: true,
            version: 1,
            dice: exportDice
        }, null, 2);
    }

    /**
     * Import dice from a JSON string.
     * @param {string} jsonString
     * @returns {Array} The imported dice.
     */
    async import(jsonString) {
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            throw new Error("Invalid JSON format");
        }
        if (!parsed.dsnLibraryExport || !Array.isArray(parsed.dice)) {
            throw new Error("Invalid dice library export format");
        }
        const imported = [];
        for (const dieData of parsed.dice) {
            dieData.id = foundry.utils.randomID();
            dieData.createdAt = Date.now();
            dieData.updatedAt = Date.now();
            this._dice.push(dieData);
            imported.push(dieData);
        }
        await this.save();
        return imported;
    }

    /**
     * Resolve the effective appearance for a specific face value.
     * Merges the die's baseAppearance with per-face overrides.
     * Null values in the face override mean "inherit from base".
     *
     * @param {object} libraryDie - A library die object.
     * @param {string|number} faceValue - The face value to resolve (e.g., "20", "1").
     * @returns {object} Resolved face appearance.
     */
    static resolveFaceAppearance(libraryDie, faceValue) {
        const base = foundry.utils.deepClone(libraryDie.baseAppearance || {});
        const faceKey = String(faceValue);
        const faceOverride = libraryDie.faces?.[faceKey];

        if (!faceOverride) return base;

        const resolved = { ...base };
        for (const [key, value] of Object.entries(faceOverride)) {
            if (value !== null && value !== undefined) {
                resolved[key] = value;
            }
        }
        return resolved;
    }

    /**
     * Load a dice library from any user's flags (for multiplayer).
     * @param {User} user - The Foundry VTT User document.
     * @returns {Array} The user's dice library array.
     */
    static getLibraryForUser(user) {
        const data = user.getFlag("dice-so-nice", "diceLibrary");
        return Array.isArray(data) ? data : [];
    }

    /**
     * Find a library die by ID from a given user's library.
     */
    static getFromUser(user, id) {
        const library = DiceLibrary.getLibraryForUser(user);
        return library.find(d => d.id === id) || null;
    }

    /**
     * Create a new empty die data structure.
     * @param {string} dieType - e.g. "d20", "d6"
     * @param {string} name - Display name
     * @returns {object} A die data template (without id).
     */
    static createEmptyDie(dieType, name = "Custom Die") {
        return {
            name,
            dieType,
            baseAppearance: {
                labelColor: "#FFFFFF",
                diceColor: "#000000",
                outlineColor: "",
                edgeColor: "",
                texture: "none",
                material: "plastic",
                font: "auto",
                colorset: "custom"
            },
            faces: {}
        };
    }
}
