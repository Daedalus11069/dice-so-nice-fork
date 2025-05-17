"use strict"

export class DiceNotation {

	/**
	 * A roll object from Foundry 
	 * @param {Roll} rolls 
	 */
	constructor(rolls, userConfig = null) {
		this.throws = [{dice:[]}];
		this.userConfig = userConfig;
		
		//First we need to prepare the data
		rolls.dice.forEach(die => {
			//We only are able to handle this list of number of face in 3D for now
			if([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100].includes(die.faces)) {
				//We flag every single die with a throw number, to queue exploded dice
				let cnt=die.number;
				let countExploded = 0;
				let localNbThrow = 0;
				for(let i =0; i< die.results.length; i++){
					if(localNbThrow >= this.throws.length)
						this.throws.push({dice:[]});

					if(die.results[i].exploded)
						countExploded++;
					die.results[i].indexThrow = localNbThrow;
					if (die.results[i].discarded) continue; //Continue if die result is discarded
					//If we have a new throw
					if(--cnt <= 0){
						localNbThrow++;
						cnt = countExploded;
						countExploded = 0;
					}
				}
			}
		});
		let diceNumber = 0;
		let maxDiceNumber = game.settings.get("dice-so-nice", "maxDiceNumber");
		//Then we can create the throws
		rolls.dice.some(die => {
			//We only are able to handle this list of number of face in 3D for now
			if([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100].includes(die.faces)) {
				let options = {};
				for(let i =0; i< die.results.length; i++){
					if(++diceNumber >= maxDiceNumber)
						return true;
					if(!die.results[i].hidden){
						//ghost can't be secret
						if(rolls.ghost)
							options.ghost = true;
						else if(rolls.secret)
							options.secret = true;

						if(die.modifiers.length)
							options.modifiers = die.modifiers;

						this.addDie({fvttDie: die, index:i, options:options});
						if(die.faces == 100){
							this.addDie({fvttDie: die, index:i, isd10of100:true, options:options});
						}
					}
				}
			}
		});
	}
	/**
	 * 
	 * @param {DiceTerm} fvttDie Die object from Foundry VTT
	 * @param {Integer} index Position in the dice array
	 * @param {Boolean} isd10of100 In DsN, we use two d10 for a d100. Set to true if this die should be the unit dice of a d100
	 * @param {Object} options Options related to the fvtt roll that should be attached to the dsn die
	 */
	addDie({fvttDie, index, isd10of100 = false, options = {}}){
		let dsnDie = {};
		let dieValue = fvttDie.results[index].result;
		if(fvttDie.faces == 100) {
			//For d100, we create two d10 dice
			if(isd10of100) {
				dieValue = dieValue%10;
				
				dsnDie.resultLabel = fvttDie.getResultLabel({result:dieValue});
			}
			else {
				dieValue = parseInt(dieValue/10);
				dsnDie.resultLabel = fvttDie.getResultLabel({result:dieValue*10});
				//On a d100, 0 is 10, because.
				if(dieValue==10)
					dieValue=0;
			}
			dsnDie.d100Result = fvttDie.results[index].result;
		} else
			
			dsnDie.resultLabel = fvttDie.getResultLabel({result:dieValue});
		dsnDie.result = dieValue;
		if(fvttDie.results[index].discarded)
			dsnDie.discarded = true;


		//If it is not a standard die ("d"), we need to prepend "d" to the denominator. If it is, we append the number of face
		dsnDie.type = fvttDie.constructor.DENOMINATION;
		if(fvttDie.constructor.name == CONFIG.Dice.terms["d"].name)
			dsnDie.type += isd10of100 ? "10":fvttDie.faces;
		else {
			dsnDie.type = "d"+dsnDie.type;
		}
		dsnDie.vectors = [];
		//Contains optionals flavor (core) and colorset (dsn) infos.
		dsnDie.options = foundry.utils.duplicate(fvttDie.options);
		foundry.utils.mergeObject(dsnDie.options, options);
		if(this.userConfig && !this.userConfig.enableFlavorColorset && dsnDie.options.flavor)
			delete dsnDie.options.flavor;

		this.throws[fvttDie.results[index].indexThrow].dice.push(dsnDie);
	}

	static mergeQueuedRollCommands(queue){
		let mergedRollCommands = [];
		queue.forEach(command => {
			for(let i = 0; i< command.params.throws.length; i++){
				if(!mergedRollCommands[i])
					mergedRollCommands.push([]);
				command.params.throws[i].dsnConfig = command.params.dsnConfig;
				mergedRollCommands[i].push(command.params.throws[i]);
			}
		});
		//First we loop on the command list
		for(let i=0;i<mergedRollCommands.length;i++){
			//Then we loop on throws
			for(let j=0;j<mergedRollCommands[i].length;j++){

				//Retrieve the sfx list (unfiltered) for this throw. We do not know yet if these sfx should be visible or not
				let sfxList = mergedRollCommands[i][j].dsnConfig.specialEffects.slice(0);
				/*if(!sfxList || !sfxList["0"])
					continue;*/
				//Finally we loop over each dice in this throw
				for(let k=0;k<mergedRollCommands[i][j].dice.length;k++){
					const dsnDie = mergedRollCommands[i][j].dice[k];
					// Loop through effects added by onResultEffects dice options key (nameOfEffect -> resultToTriggerOn)
					if (dsnDie.options.onResultEffects) {
						Object.keys(dsnDie.options.onResultEffects).forEach(specialEffect => {
							const {onResult, options: opts = {}} =  dsnDie.options.onResultEffects[specialEffect];
							sfxList.push({
									"diceType": dsnDie.type,
									"onResult": onResult,
									"specialEffect": specialEffect,
									"options": {
											"isGlobal": false,
											"muteSound": false,
											...opts
									}
							});
						});
					}
					//attach SFX that should trigger for this roll
					//For each sfx configured
					let specialEffects = Object.values(sfxList).filter(sfx => {
						//if the dice is discarded, it should not trigger a special fx
						if(dsnDie.discarded)
							return false;
						
						//if the dice is a ghost dice, it should not trigger a special fx
						if(dsnDie.options.ghost)
							return false;

						//if the special effect "onResult" list contains non-numeric value, we manually deal with them here
						let manualResultTrigger = false;
						//Keep Highest. Discarded dice are already filtered out
						if(sfx.onResult.includes("kh"))
							manualResultTrigger = dsnDie.options?.modifiers?.includes("kh");
						//Keep Lowest. Discarded dice are already filtered out
						if(sfx.onResult.includes("kl"))
							manualResultTrigger = dsnDie.options?.modifiers?.includes("kl");

						if(manualResultTrigger)
							return true;

						//if the result is in the triggers value, we keep the fx. Special case: double d10 for a d100 roll
						if(sfx.diceType == "d100"){
							if(dsnDie.d100Result && sfx.onResult.includes(dsnDie.d100Result.toString()))
								return true;
						}
						if(sfx.diceType == dsnDie.type && sfx.onResult.includes(dsnDie.result.toString()))
							return true;
							
						//if a special effect was manually triggered for this dice, we also include it
						if(dsnDie.options.sfx && dsnDie.options.sfx.id == sfx.diceType && sfx.onResult.includes(dsnDie.options.sfx.result.toString()))
							return true;

						//if a special effect was manually triggered for this result set, include it
						if(dsnDie.options.onResult && dsnDie.type == sfx.diceType && sfx.onResult.includes(dsnDie.result.toString()))
							return true;

						return false;
					});
					//Now that we have a filtered list of sfx to play, we make a final list of all sfx for this die and we remove the duplicates
					if(dsnDie.options.sfx && dsnDie.options.sfx.specialEffect)
						specialEffects.push({
							specialEffect:dsnDie.options.sfx.specialEffect,
							options:dsnDie.options.sfx.options
						});
					if(specialEffects.length){
						//remove duplicate
						specialEffects = specialEffects.filter((v, i, a) => a.findIndex(se => this.deepEqual(se, v)) === i);
						mergedRollCommands[i][j].dice[k].specialEffects = specialEffects;
					}
				}
			}
		}
		return mergedRollCommands;
	}

	static deepEqual(x, y) {
		const ok = Object.keys, tx = typeof x, ty = typeof y;
		return x && y && tx === 'object' && tx === ty ? (
			ok(x).length === ok(y).length &&
				ok(x).every(key => this.deepEqual(x[key], y[key]))
		) : (x === y);
	}
}
