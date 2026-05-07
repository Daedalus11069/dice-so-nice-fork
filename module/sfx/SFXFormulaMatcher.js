const SUPPORTED_MODIFIERS = ['cs', 'cf', 'kh', 'kl', 'dl', 'dh'];
const OPERATORS = ['==', '>=', '<=', '>', '<'];
const COUNT_KEYWORDS = ['success', 'failure', 'discarded', 'rerolled', 'exploded'];

const parseCache = new Map();

// [count]d<faces>[modifier]
// groups: 1=count, 2=faces, 3=modType, 4=modOp, 5=modValue
const DIE_TERM_RE = /^(\d+|\*)?d(\d+)(?:(cs|cf|kh|kl|dl|dh)(>=|<=|>|<|=)?(\d+)?)?$/;

// [!]keyword(diceExpr) — groups: 1=negation, 2=keyword, 3=inner dice expression
const COUNT_RE = /^(!?)(success|failure|discarded|rerolled|exploded)\((.+)\)$/;

export class SFXFormulaMatcher {

	static parse(formula) {
		if (typeof formula !== 'string' || !formula.trim()) return null;

		const key = formula;
		const cached = parseCache.get(key);
		if (cached !== undefined) return cached;

		const result = SFXFormulaMatcher._doParse(formula.trim());
		if (result) parseCache.set(key, result);
		return result;
	}

	static _doParse(formula) {
		const tokens = formula.split(/\s+/);

		if (tokens[0] === 'total') {
			if (tokens.length !== 3) return null;
			if (!OPERATORS.includes(tokens[1])) return null;
			const values = SFXFormulaMatcher._parseValues(tokens[2]);
			if (!values) return null;
			if (tokens[1] !== '==' && values.length > 1) return null;
			return { type: 'total', operator: tokens[1], values };
		}

		const countMatch = COUNT_RE.exec(tokens[0]);
		if (countMatch) {
			const negated = countMatch[1] === '!';
			const keyword = countMatch[2];
			const innerMatch = DIE_TERM_RE.exec(countMatch[3]);
			if (!innerMatch) return null;

			const faces = parseInt(innerMatch[2]);
			let modifier = null;
			if (innerMatch[3]) {
				modifier = { type: innerMatch[3], params: null };
				if (innerMatch[4]) {
					if (!innerMatch[5]) return null;
					modifier.params = innerMatch[4] + innerMatch[5];
				}
			}

			if (tokens.length === 1) {
				return { type: 'count', keyword, negated, faces, modifier, operator: null, values: null };
			}

			if (tokens.length !== 3) return null;
			if (!OPERATORS.includes(tokens[1])) return null;
			const values = SFXFormulaMatcher._parseValues(tokens[2]);
			if (!values) return null;
			if (tokens[1] !== '==' && values.length > 1) return null;

			return { type: 'count', keyword, negated, faces, modifier, operator: tokens[1], values };
		}

		const match = DIE_TERM_RE.exec(tokens[0]);
		if (!match) return null;

		const count = match[1] ? (match[1] === '*' ? '*' : parseInt(match[1])) : null;
		const faces = parseInt(match[2]);

		let modifier = null;
		if (match[3]) {
			modifier = { type: match[3], params: null };
			if (match[4]) {
				if (!match[5]) return null;
				modifier.params = match[4] + match[5];
			}
		}

		if (tokens.length === 1) {
			return { type: 'dice', count, faces, modifier, operator: null, values: null };
		}

		if (tokens.length !== 3) return null;
		if (!OPERATORS.includes(tokens[1])) return null;
		const values = SFXFormulaMatcher._parseValues(tokens[2]);
		if (!values) return null;
		if (tokens[1] !== '==' && values.length > 1) return null;

		return { type: 'dice', count, faces, modifier, operator: tokens[1], values };
	}

	static _parseValues(str) {
		const parts = str.split(',');
		const values = [];
		for (const part of parts) {
			if (!/^\d+$/.test(part)) return null;
			values.push(parseInt(part));
		}
		return values.length > 0 ? values : null;
	}

	static validate(formula) {
		if (typeof formula !== 'string' || !formula.trim()) {
			return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorEmpty") };
		}

		const trimmed = formula.trim();
		const parsed = SFXFormulaMatcher.parse(trimmed);

		if (!parsed) {
			const tokens = trimmed.split(/\s+/);

			if (tokens[0] === 'total') {
				if (tokens.length < 3) return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorTotalSyntax") };
				if (!OPERATORS.includes(tokens[1])) return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorBadOperator", { op: tokens[1] }) };
				return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorBadValue") };
			}

			const countMatch = COUNT_RE.exec(tokens[0]);
			if (countMatch) {
				if (tokens.length === 2) return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorIncomplete") };
				if (tokens.length > 3) return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorCountSyntax", { kw: countMatch[2] }) };
				if (tokens.length === 3 && !OPERATORS.includes(tokens[1])) return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorBadOperator", { op: tokens[1] }) };
				return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorCountBadDie", { kw: countMatch[2] }) };
			}

			const kwMatch = tokens[0].match(/^!?([a-z]+)\(/);
			if (kwMatch && !COUNT_KEYWORDS.includes(kwMatch[1])) {
				return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorBadKeyword", { kw: kwMatch[1] }) };
			}

			if (trimmed.includes('+') || trimmed.includes('-')) {
				return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorCrossTerm") };
			}

			if (!/d\d/.test(tokens[0])) {
				return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorBadStart") };
			}

			const modMatch = tokens[0].match(/d\d+([a-z]+)/);
			if (modMatch && !SUPPORTED_MODIFIERS.includes(modMatch[1])) {
				return { valid: false, error: game.i18n.format("DICESONICE.sfxFormulaErrorBadModifier", { mod: modMatch[1] }) };
			}

			if (tokens.length === 2) {
				return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorIncomplete") };
			}

			if (tokens.length > 3) {
				return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorTooManyParts") };
			}

			return { valid: false, error: game.i18n.localize("DICESONICE.sfxFormulaErrorInvalid") };
		}

		return { valid: true, error: null };
	}

	static match(formula, context) {
		const { dice, rollTotal } = context;
		if (!dice || !dice.length) return [];

		const parsed = SFXFormulaMatcher.parse(formula);
		if (!parsed) return [];

		if (parsed.type === 'total') {
			return SFXFormulaMatcher._matchTotal(parsed, dice, rollTotal);
		}

		if (parsed.type === 'count') {
			return SFXFormulaMatcher._matchCount(parsed, dice);
		}

		if (parsed.count === null) {
			return SFXFormulaMatcher._matchPerDie(parsed, dice);
		}

		return SFXFormulaMatcher._matchAggregate(parsed, dice);
	}

	static _matchTotal(parsed, dice, rollTotal) {
		if (rollTotal == null) return [];
		if (!SFXFormulaMatcher._compare(rollTotal, parsed.operator, parsed.values)) return [];
		return dice.filter(d => !d.options?.ghost);
	}

	static _matchCount(parsed, dice) {
		const formulaType = 'd' + parsed.faces;
		const flagValue = !parsed.negated;
		const matching = dice.filter(d => {
			if (d.options?.ghost) return false;

			const isType = (d.compositeType && d.compositeType === formulaType) || d.type === formulaType;
			if (!isType) return false;

			if (parsed.modifier) {
				if (!SFXFormulaMatcher._matchModifier(parsed.modifier, d.termModifiers)) return false;
			}

			return (d.fvttResult?.[parsed.keyword] === true) === flagValue;
		});

		if (parsed.operator && parsed.values) {
			if (!SFXFormulaMatcher._compare(matching.length, parsed.operator, parsed.values)) return [];
		}
		return matching;
	}

	static _matchPerDie(parsed, dice) {
		const formulaType = 'd' + parsed.faces;
		return dice.filter(d => {
			if (d.options?.ghost) return false;

			let result;
			if (d.compositeType && d.compositeType === formulaType) {
				result = d.compositeResult;
			} else if (d.type === formulaType) {
				result = d.result;
			} else {
				return false;
			}

			if (parsed.modifier) {
				if (!SFXFormulaMatcher._matchModifier(parsed.modifier, d.termModifiers)) return false;
			}

			if (parsed.operator && parsed.values) {
				return SFXFormulaMatcher._compare(result, parsed.operator, parsed.values);
			}

			return true;
		});
	}

	static _matchAggregate(parsed, dice) {
		const termGroups = new Map();
		for (const d of dice) {
			if (d.options?.ghost) continue;
			if (d.termIndex == null) continue;
			if (!termGroups.has(d.termIndex)) termGroups.set(d.termIndex, []);
			termGroups.get(d.termIndex).push(d);
		}

		const matched = [];
		for (const [, group] of termGroups) {
			const rep = group[0];

			if (rep.termFaces !== parsed.faces) continue;
			if (parsed.count !== '*' && rep.termNumber !== parsed.count) continue;

			if (parsed.modifier) {
				if (!SFXFormulaMatcher._matchModifier(parsed.modifier, rep.termModifiers)) continue;
			}

			if (parsed.operator && parsed.values) {
				if (!SFXFormulaMatcher._compare(rep.termTotal, parsed.operator, parsed.values)) continue;
			}

			for (const d of group) {
				matched.push(d);
			}
		}

		return matched;
	}

	static _matchModifier(parsedMod, termModifiers) {
		if (!termModifiers || !termModifiers.length) return false;

		// DnD 5e uses "adv"/"dis" as aliases for "kh"/"kl"
		const aliases = parsedMod.type === 'kh' ? ['kh', 'adv'] : parsedMod.type === 'kl' ? ['kl', 'dis'] : [parsedMod.type];

		if (parsedMod.params === null) {
			return termModifiers.some(m => aliases.some(a => m.startsWith(a)));
		}

		return aliases.some(a => termModifiers.includes(a + parsedMod.params));
	}

	static _compare(value, operator, targets) {
		switch (operator) {
			case '==': return targets.includes(value);
			case '>=': return value >= targets[0];
			case '<=': return value <= targets[0];
			case '>':  return value > targets[0];
			case '<':  return value < targets[0];
			default: return false;
		}
	}
}
