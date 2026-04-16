import { DiceSFXManager } from './DiceSFXManager.js';
import { LEGACY_TO_METERS } from './SceneConstants.js';

import {
	Euler,
	Group,
	Quaternion
} from 'three';

//owns persistent dice CRUD, visibility modes, link group management,
//selection state, multiplayer event emission, persistent throw execution and replay
export class PersistentDiceManager {

	constructor(diceScene, physicsWorker, diceFactory, soundManager) {
		this.diceScene = diceScene;
		this.physicsWorker = physicsWorker;
		this.dicefactory = diceFactory;
		this.soundManager = soundManager;
		this.throwEngine = null;

		this.persistentDiceList = [];
		this.selectedPersistentDiceIds = new Set();
		this.persistentDiceVisibility = "all";

		//set by DiceBox to the DiceBox instance - SFX subclasses access box.scene, box.camera, etc.
		this.sfxContext = null;

		//callback for persistent dice multiplayer sync (set by Dice3D via DiceBox)
		this.onPersistentEvent = null;
		//callback when selection changes (DiceBox updates outline passes)
		this.onSelectionChanged = null;
		//callback at end of replayRemoteThrow (DiceBox triggers updateRemoteOutlines)
		this.onRemoteThrowReplayed = null;
		//callback to resolve SFX list for a user (set by Dice3D via DiceBox)
		this.sfxListForUser = null;

		//reusable scratch objects for remote pre-roll rotation (avoid per-frame allocations)
		this._preRollEuler = new Euler(0, 0, 0, 'XYZ');
		this._preRollDeltaQuat = new Quaternion();
	}

	setThrowEngine(throwEngine) {
		this.throwEngine = throwEngine;
	}

	//spawn a persistent die on the tabletop
	async spawnPersistentDie(type, appearance, position = null, diceLibrary = null, opts = {}) {
		//cap persistent dice at maxDiceNumber
		const maxDiceNumber = game.settings.get("dice-so-nice", "maxDiceNumber");
		if (this.persistentDiceList.length >= maxDiceNumber) {
			ui.notifications?.warn(game.i18n?.localize?.("DICESONICE.persistentDiceCapReached") || `Dice So Nice: persistent dice limit reached (${maxDiceNumber}).`);
			return null;
		}

		const result = await this.throwEngine.createDiceMesh(type, appearance, diceLibrary);
		if (!result) return null;
		const { dicemesh, diceobj, mass } = result;

		let posX, posY;
		if (position) {
			posX = (position.x - 0.5) * this.diceScene.display.innerWidth;
			posY = -(position.y - 0.5) * this.diceScene.display.innerHeight;
		} else {
			posX = (Math.random() - 0.5) * this.diceScene.display.innerWidth * 0.5;
			posY = -(Math.random() - 0.5) * this.diceScene.display.innerHeight * 0.5;
		}

		//axis must be zero or normalized (cannon-es NaN otherwise)
		const vectordata = {
			type: type,
			pos: { x: posX, y: diceobj.inertia * 13 * LEGACY_TO_METERS, z: posY },
			velocity: { x: 0, y: 0, z: 0 },
			angle: { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2, z: Math.random() * Math.PI * 2 },
			axis: { x: 0, y: 0, z: 0, a: 0 }
		};

		dicemesh.notation = vectordata;
		dicemesh.result = null;
		dicemesh.stopped = 0;
		dicemesh.startAtIteration = 0;
		dicemesh.options = {};
		dicemesh.userData.persistent = true;
		dicemesh.userData.persistentId = opts.remotePersistentId || foundry.utils.randomID();
		dicemesh.userData.ownerUserId = opts.ownerUserId || game.user?.id || null;
		if (opts.linkGroupId) dicemesh.userData.linkGroupId = opts.linkGroupId;
		if (opts.linkGroupSecondary) dicemesh.userData.linkGroupSecondary = true;

		try {
			await this.physicsWorker.exec('createDice', {
				id: dicemesh.id,
				shape: diceobj.shape,
				material: appearance.material,
				vectordata: vectordata,
				mass: mass,
				startAtIteration: 0,
				options: { persistent: true }
			});

			await this.physicsWorker.exec('addDice', dicemesh.id);
		} catch (error) {
			console.error("[Dice So Nice] Failed to create physics body for persistent die", error);
			dicemesh.geometry?.dispose();
			dicemesh.material?.dispose();
			return null;
		}

		let objectContainer = new Group();
		objectContainer.add(dicemesh);
		objectContainer.position.set(vectordata.pos.x, vectordata.pos.y, vectordata.pos.z);
		this.diceScene.scene.add(objectContainer);

		this.persistentDiceList.push(dicemesh);
		this._emitPersistentDiceChanged();

		//apply current visibility mode
		this._applyPersistentDieVisibility(dicemesh);

		return dicemesh;
	}

	async removePersistentDie(persistentId) {
		const index = this.persistentDiceList.findIndex(d => d.userData.persistentId === persistentId);
		if (index === -1) return;

		const dicemesh = this.persistentDiceList[index];
		this.persistentDiceList.splice(index, 1);
		this._emitPersistentDiceChanged();

		//drop from selection set
		if (this.selectedPersistentDiceIds.delete(dicemesh.id)) {
			if (this.onSelectionChanged) this.onSelectionChanged();
		}

		this.diceScene.scene.remove(dicemesh.parent.type === "Scene" ? dicemesh : dicemesh.parent);
		await this.physicsWorker.exec("removeDice", [dicemesh.id]);
	}

	//count persistent dice for a user, optionally filtered by type
	countPersistentDiceByOwner(userId = null, type = null, opts = {}) {
		const uid = userId ?? game.user?.id ?? null;
		const includeSecondary = opts.includeLinkSecondary === true;
		let count = 0;
		for (const mesh of this.persistentDiceList) {
			if (mesh.userData.ownerUserId !== uid) continue;
			if (type && mesh.notation?.type !== type) continue;
			if (!includeSecondary && mesh.userData.linkGroupSecondary) continue;
			count++;
		}
		return count;
	}

	//find the most recent persistent die of a given type for the toolbox "−" button
	findMostRecentPersistentDie(type, userId = null, opts = {}) {
		const uid = userId ?? game.user?.id ?? null;
		const includeSecondary = opts.includeLinkSecondary === true;
		for (let i = this.persistentDiceList.length - 1; i >= 0; i--) {
			const mesh = this.persistentDiceList[i];
			if (mesh.userData.ownerUserId !== uid) continue;
			if (mesh.notation?.type !== type) continue;
			if (!includeSecondary && mesh.userData.linkGroupSecondary) continue;
			return mesh;
		}
		return null;
	}

	//set visibility mode (render-only, physics stays active)
	setPersistentDiceVisibility(mode) {
		if (mode !== "none" && mode !== "mine" && mode !== "all") return;
		this.persistentDiceVisibility = mode;
		for (const mesh of this.persistentDiceList) {
			this._applyPersistentDieVisibility(mesh);
		}
	}

	_emitPersistentDiceChanged() {
		try {
			Hooks.callAll("dice-so-nice.persistentDiceChanged");
		} catch (err) {
			console.error("[Dice So Nice] persistentDiceChanged hook listener threw:", err);
		}
	}

	_applyPersistentDieVisibility(dicemesh) {
		const container = dicemesh.parent;
		if (!container) return;
		const owner = dicemesh.userData.ownerUserId;
		const mine = owner && game.user && owner === game.user.id;
		let visible;
		switch (this.persistentDiceVisibility) {
			case "none": visible = false; break;
			case "mine": visible = !!mine; break;
			case "all":
			default: visible = true; break;
		}
		container.visible = visible;
	}

	//remove persistent dice (ownerUserId filters by owner, null = all)
	async clearPersistentDice({ ownerUserId = null } = {}) {
		const remove = [];
		for (const mesh of this.persistentDiceList) {
			if (!ownerUserId || mesh.userData.ownerUserId === ownerUserId) remove.push(mesh);
		}
		if (remove.length === 0) return;

		const removedIds = remove.map(d => d.id);
		for (const dicemesh of remove) {
			this.diceScene.scene.remove(dicemesh.parent.type === "Scene" ? dicemesh : dicemesh.parent);
			this.selectedPersistentDiceIds.delete(dicemesh.id);
			const idx = this.persistentDiceList.indexOf(dicemesh);
			if (idx !== -1) this.persistentDiceList.splice(idx, 1);
		}
		this._emitPersistentDiceChanged();
		if (this.onSelectionChanged) this.onSelectionChanged();

		if (this.physicsWorker) {
			await this.physicsWorker.exec("removeDice", removedIds);
		}
	}

	//delete selected persistent dice (respects ownership, expands link groups)
	async removeSelectedPersistentDice() {
		if (this.selectedPersistentDiceIds.size === 0) return 0;

		const isGM = !!game.user?.isGM;
		const myId = game.user?.id ?? null;

		//collect persistentIds the user is allowed to remove
		const allowedIds = new Set();
		const linkGroups = new Set();
		for (const mesh of this.persistentDiceList) {
			if (!this.selectedPersistentDiceIds.has(mesh.id)) continue;
			const ownedByMe = mesh.userData.ownerUserId === myId;
			if (!isGM && !ownedByMe) continue;
			allowedIds.add(mesh.userData.persistentId);
			if (mesh.userData.linkGroupId) linkGroups.add(mesh.userData.linkGroupId);
		}

		//expand link groups (d100 pair)
		if (linkGroups.size > 0) {
			for (const mesh of this.persistentDiceList) {
				if (mesh.userData.linkGroupId && linkGroups.has(mesh.userData.linkGroupId)) {
					allowedIds.add(mesh.userData.persistentId);
				}
			}
		}

		if (allowedIds.size === 0) return 0;

		const sizeBefore = this.persistentDiceList.length;
		await Promise.all(
			Array.from(allowedIds, id => this.removePersistentDie(id))
		);
		return sizeBefore - this.persistentDiceList.length;
	}

	getSelectedPersistentDice() {
		if (this.selectedPersistentDiceIds.size === 0) return [];
		const result = [];
		for (const mesh of this.persistentDiceList) {
			if (this.selectedPersistentDiceIds.has(mesh.id)) result.push(mesh);
		}
		return result;
	}

	clearPersistentSelection() {
		if (this.selectedPersistentDiceIds.size === 0) return;
		this.selectedPersistentDiceIds.clear();
		if (this.onSelectionChanged) this.onSelectionChanged();
	}

	//return all dice in the same link group (d100 pair)
	getLinkGroupSiblings(dicemesh) {
		const lg = dicemesh.userData?.linkGroupId;
		if (!lg) return [dicemesh];
		const siblings = [];
		for (const m of this.persistentDiceList) {
			if (m.userData?.linkGroupId === lg) siblings.push(m);
		}
		return siblings.length > 0 ? siblings : [dicemesh];
	}

	togglePersistentSelection(dicemesh) {
		//toggle whole link group together
		const siblings = this.getLinkGroupSiblings(dicemesh);
		const wasSelected = this.selectedPersistentDiceIds.has(dicemesh.id);
		for (const m of siblings) {
			if (wasSelected) this.selectedPersistentDiceIds.delete(m.id);
			else this.selectedPersistentDiceIds.add(m.id);
		}
		if (this.onSelectionChanged) this.onSelectionChanged();
	}

	//per-frame: remote pre-roll visual rotation + remote move interpolation
	updateRemoteAnimations(timeDiff) {
		//remote pre-roll: same visual effect for dice held by other players
		for (const dicemesh of this.persistentDiceList) {
			if (!dicemesh.userData?.remotePreRoll) continue;
			const r = dicemesh.userData?.preRollRates;
			if (!r) continue;
			r.t += timeDiff;
			const ex = r.x * timeDiff;
			const ey = r.y * timeDiff;
			const w = 2 * Math.PI * r.zFreq;
			const ez = r.zAmp * w * Math.cos(w * r.t) * timeDiff;
			this._preRollEuler.set(ex, ey, ez, 'XYZ');
			this._preRollDeltaQuat.setFromEuler(this._preRollEuler);
			dicemesh.quaternion.multiply(this._preRollDeltaQuat);
		}

		//remote move interpolation: lerp toward latest known position
		const REMOTE_LERP_FACTOR = 0.2;
		const remotePosUpdates = [];
		for (const dicemesh of this.persistentDiceList) {
			const target = dicemesh.userData?.remoteMoveTarget;
			if (!target) continue;
			const container = dicemesh.parent;
			if (!container) continue;
			const dx = target.x - container.position.x;
			const dz = target.z - container.position.z;
			if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
				container.position.x = target.x;
				container.position.z = target.z;
			} else {
				container.position.x += dx * REMOTE_LERP_FACTOR;
				container.position.z += dz * REMOTE_LERP_FACTOR;
			}
			remotePosUpdates.push({
				id: dicemesh.id,
				position: { x: container.position.x, y: container.position.y, z: container.position.z }
			});
		}
		//batch-sync remote dice physics bodies
		if (remotePosUpdates.length > 0) {
			this.physicsWorker?.exec("setBodyPositions", { updates: remotePosUpdates });
		}
	}

	//per-frame: play back pre-recorded buffers for persistent dice mid-throw
	updatePersistentPlayback(neededSteps, speed) {
		for (const dicemesh of this.persistentDiceList) {
			const pt = dicemesh.persistentThrow;
			if (!dicemesh.sim || !pt) continue;

			//advance playback, clamped to buffer length
			const steps = Math.max(neededSteps, 1) * speed;
			const prevIteration = pt.iteration;
			pt.iteration = Math.min(pt.iteration + steps, pt.iterations);

			//replay collision sounds between previous and current frame
			if (pt.detectedCollides) {
				const startFrame = Math.max(Math.floor(prevIteration), pt.lastCollideFrame + 1);
				const endFrame = Math.min(Math.floor(pt.iteration), pt.iterations);
				for (let f = startFrame; f <= endFrame; f++) {
					const c = pt.detectedCollides[f];
					if (c) this.soundManager.playAudioSprite(...c);
				}
				pt.lastCollideFrame = endFrame;
			}

			if (pt.iteration >= pt.iterations) {
				//playback complete
				const fi = pt.iterations;
				if (dicemesh.parent) {
					dicemesh.parent.position.fromArray(dicemesh.sim.stepPositions, fi * 3);
					if (pt.rawQuat) {
						//throwing die: parent=raw quat, child=swap correction
						const rq = pt.rawQuat;
						dicemesh.parent.quaternion.set(rq.x, rq.y, rq.z, rq.w);
					} else {
						//struck die: no swap, hand off to live physics
						dicemesh.parent.quaternion.fromArray(dicemesh.sim.stepQuaternions, fi * 4);
					}
				}
				if (pt.swapQuat) {
					dicemesh.quaternion.copy(pt.swapQuat);
				}
				//send chat message
				if (pt.roll) {
					pt.roll.toMessage({
						flavor: `${pt.diceType} - Persistent Dice`,
						flags: { "dice-so-nice": { persistent: true } }
					}).catch(err => {
						console.error("[Dice So Nice] Failed to create persistent dice chat message:", err);
						if (ui?.notifications) ui.notifications.warn("Dice So Nice: persistent roll failed to post to chat (see console).");
					});
				}
				//fire SFX at throw completion
				if (dicemesh.specialEffects) {
					for (const sfx of dicemesh.specialEffects) {
						DiceSFXManager.playSFX(sfx, this.sfxContext, dicemesh);
					}
					delete dicemesh.specialEffects;
				}
				delete dicemesh.sim;
				delete dicemesh.persistentThrow;
			} else {
				//floor to integer frame index
				const iter = Math.floor(pt.iteration);
				if (dicemesh.parent && iter < pt.iterations) {
					dicemesh.parent.position.fromArray(dicemesh.sim.stepPositions, iter * 3);
					dicemesh.parent.quaternion.fromArray(dicemesh.sim.stepQuaternions, iter * 4);
				}
			}
		}
	}

	//throw held persistent dice: combined Roll, one sim, one chat message
	async throwPersistentDice(heldDice, velocity) {
		if (!heldDice || heldDice.length === 0) return;

		//1. reset mesh quaternions to identity
		for (const d of heldDice) d.quaternion.set(0, 0, 0, 1);

		//2. build combined Foundry roll
		//d100 secondaries derive their face from the primary's result, not their own term
		//orphan secondaries (primary not held) fall back to rolling independently
		const heldPrimaryLinkGroups = new Set();
		for (const d of heldDice) {
			if (!d.userData?.linkGroupSecondary && d.userData?.linkGroupId) {
				heldPrimaryLinkGroups.add(d.userData.linkGroupId);
			}
		}

		const primaries = [];
		const secondariesByLinkGroup = new Map();
		for (const d of heldDice) {
			const isLinkedSecondary = d.userData?.linkGroupSecondary
				&& d.userData?.linkGroupId
				&& heldPrimaryLinkGroups.has(d.userData.linkGroupId);
			if (isLinkedSecondary) {
				secondariesByLinkGroup.set(d.userData.linkGroupId, d);
			} else {
				primaries.push(d);
			}
		}

		//one Die term per primary, same order
		const rollFormula = primaries.map(d => `1${d.notation.type}`).join("+");
		let roll;
		try {
			roll = new Roll(rollFormula);
			await roll.evaluate();
		} catch (err) {
			console.error("[Dice So Nice] Persistent dice RNG evaluation failed:", err);
			return;
		}

		//extract per-primary results
		const perPrimaryResults = [];
		for (const term of roll.dice) {
			for (const r of term.results) perPrimaryResults.push(r.result);
		}
		if (perPrimaryResults.length !== primaries.length) {
			console.warn("[Dice So Nice] Persistent batch roll result count mismatch", {
				expected: primaries.length, got: perPrimaryResults.length, formula: rollFormula
			});
			return;
		}

		//2b. derive forced face for every held mesh (d100 splits into tens/units)
		const forcedByMesh = new Map();
		for (let i = 0; i < primaries.length; i++) {
			const primary = primaries[i];
			const rawResult = perPrimaryResults[i];
			if (primary.notation.type === "d100" && primary.userData?.linkGroupId) {
				let tens = Math.floor(rawResult / 10);
				if (tens === 10) tens = 0;
				forcedByMesh.set(primary, tens);
				primary.notation.d100Result = rawResult;

				const secondary = secondariesByLinkGroup.get(primary.userData.linkGroupId);
				if (secondary) {
					forcedByMesh.set(secondary, rawResult % 10);
					secondary.notation.d100Result = rawResult;
				}
			} else {
				forcedByMesh.set(primary, rawResult);
			}
		}

		//2c. multiplayer sync: emit throw with forced results
		if (this.onPersistentEvent) {
			const results = [];
			for (const [mesh, forcedResult] of forcedByMesh) {
				results.push({
					persistentId: mesh.userData.persistentId,
					forcedResult
				});
			}
			this.onPersistentEvent("throw", {
				data: {
					persistentIds: heldDice.map(d => d.userData.persistentId),
					velocityPct: {
						x: velocity.x / this.diceScene.display.innerWidth,
						y: velocity.y / this.diceScene.display.innerHeight,
						z: velocity.z || 0
					},
					results,
					rollFormula
				}
			});
		}

		//3. impulse map: shared linear velocity, random angular per die
		const ANGULAR_SPEED_TUMBLE = 50;
		const ANGULAR_SPEED_SPIN = 20;
		const impulses = {};
		for (const d of heldDice) {
			impulses[d.id] = {
				velocity: velocity,
				angularVelocity: {
					x: (Math.random() - 0.5) * ANGULAR_SPEED_TUMBLE,
					y: (Math.random() - 0.5) * ANGULAR_SPEED_TUMBLE,
					z: (Math.random() - 0.5) * ANGULAR_SPEED_SPIN
				}
			};
		}

		//4. one background simulation (impulses applied atomically before first step)
		const ids = heldDice.map(d => d.id);
		const simResult = await this.physicsWorker.exec("simulatePersistentThrow", {
			ids: ids,
			impulses: impulses,
			framerate: this.throwEngine.framerate
		});

		if (!simResult) {
			console.warn("[Dice So Nice] Persistent throw simulation failed");
			return;
		}

		const { diceIds, positionsBuffers, quaternionsBuffers, iterationsNeeded, detectedCollides } = simResult;

		//resolve collisions to playable audio sprites
		const resolvedCollides = detectedCollides
			? this.soundManager.generateCollisionSounds(detectedCollides)
			: null;

		const meshById = new Map();
		for (const m of this.persistentDiceList) meshById.set(m.id, m);

		const consumedSimIndices = new Set();

		const typeLabels = Array.from(new Set(primaries.map(d => d.notation.type.toUpperCase()))).join(", ");

		//5. per-die: face swap + buffer playback. First valid die carries chat+sound
		let chatCarrierAssigned = false;
		for (let i = 0; i < heldDice.length; i++) {
			const dicemesh = heldDice[i];
			const diceobj = this.dicefactory.get(dicemesh.notation.type);
			if (!diceobj) continue;

			if (!forcedByMesh.has(dicemesh)) {
				console.warn("[Dice So Nice] Held die has no derived face value - skipping", { id: dicemesh.id });
				continue;
			}

			const simIdx = diceIds.indexOf(dicemesh.id);
			if (simIdx === -1) {
				console.warn("[Dice So Nice] Thrown die not found in sim payload", { id: dicemesh.id });
				continue;
			}
			consumedSimIndices.add(simIdx);

			const stepPositions = new Float32Array(positionsBuffers[simIdx]);
			const stepQuaternions = new Float32Array(quaternionsBuffers[simIdx]);

			//raw physics quat for final-frame handoff (no swap doubling)
			const rawFinalQuat = await this.physicsWorker.exec("getBodyQuaternion", dicemesh.id);

			//apply face swap
			dicemesh.quaternion.set(0, 0, 0, 1);
			dicemesh.forcedResult = forcedByMesh.get(dicemesh);
			await this.throwEngine.swapDiceFace(dicemesh);

			//bake swap into every frame so forced face shows throughout playback
			const swapQuat = dicemesh.quaternion.clone();
			this.throwEngine.bakeSwapIntoQuaternionBuffer(stepQuaternions, swapQuat, iterationsNeeded);

			//switch to buffer playback (reset mesh quat to avoid doubling swap)
			dicemesh.quaternion.set(0, 0, 0, 1);
			dicemesh.sim = {
				dead: false,
				stepQuaternions: stepQuaternions,
				stepPositions: stepPositions
			};
			const isChatCarrier = !chatCarrierAssigned;
			dicemesh.persistentThrow = {
				swapQuat: swapQuat.clone(),
				rawQuat: rawFinalQuat,
				iterations: iterationsNeeded,
				iteration: 0,
				roll: isChatCarrier ? roll : null,
				diceType: isChatCarrier ? typeLabels : null,
				detectedCollides: isChatCarrier ? resolvedCollides : null,
				lastCollideFrame: -1
			};
			if (isChatCarrier) chatCarrierAssigned = true;
		}
		if (!chatCarrierAssigned) {
			console.warn("[Dice So Nice] Persistent batch throw produced no chat carrier - every die was skipped", { ids: heldDice.map(d => d.id) });
		}

		//5b. populate SFX on thrown dice
		if (this.sfxListForUser) {
			const sfxList = this.sfxListForUser(game.user);
			for (const dicemesh of heldDice) {
				if (dicemesh.forcedResult == null) continue;
				const matched = this._matchPersistentSFX(
					sfxList, dicemesh.notation.type,
					dicemesh.forcedResult, dicemesh.notation.d100Result || null
				);
				if (matched.length > 0) dicemesh.specialEffects = matched;
			}
		}

		//6. buffer playback for struck bystander dice (no face swap, no chat)
		for (let i = 0; i < diceIds.length; i++) {
			if (consumedSimIndices.has(i)) continue;
			const struckMesh = meshById.get(diceIds[i]);
			if (!struckMesh) continue;
			struckMesh.sim = {
				dead: false,
				stepPositions: new Float32Array(positionsBuffers[i]),
				stepQuaternions: new Float32Array(quaternionsBuffers[i])
			};
			struckMesh.persistentThrow = {
				iterations: iterationsNeeded,
				iteration: 0
			};
		}
	}

	//replay a persistent throw from another client (no Roll, no chat)
	async replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList = []) {
		if (!heldDice || heldDice.length === 0) return;

		//1. reset mesh quaternions
		for (const d of heldDice) d.quaternion.set(0, 0, 0, 1);

		//2. build impulse map
		const ANGULAR_SPEED_TUMBLE = 50;
		const ANGULAR_SPEED_SPIN = 20;
		const impulses = {};
		for (const d of heldDice) {
			impulses[d.id] = {
				velocity: velocity,
				angularVelocity: {
					x: (Math.random() - 0.5) * ANGULAR_SPEED_TUMBLE,
					y: (Math.random() - 0.5) * ANGULAR_SPEED_TUMBLE,
					z: (Math.random() - 0.5) * ANGULAR_SPEED_SPIN
				}
			};
		}

		//3. run simulation
		const ids = heldDice.map(d => d.id);
		const simResult = await this.physicsWorker.exec("simulatePersistentThrow", {
			ids, impulses, framerate: this.throwEngine.framerate
		});
		if (!simResult) return;

		const { diceIds, positionsBuffers, quaternionsBuffers, iterationsNeeded, detectedCollides } = simResult;
		const resolvedCollides = detectedCollides
			? this.soundManager.generateCollisionSounds(detectedCollides)
			: null;

		const meshById = new Map();
		for (const m of this.persistentDiceList) meshById.set(m.id, m);
		const consumedSimIndices = new Set();

		//4. face swap + buffer playback (no chat carrier)
		let soundCarrierAssigned = false;
		for (let i = 0; i < heldDice.length; i++) {
			const dicemesh = heldDice[i];
			const diceobj = this.dicefactory.get(dicemesh.notation.type);
			if (!diceobj) continue;
			if (!forcedByMesh.has(dicemesh)) continue;

			const simIdx = diceIds.indexOf(dicemesh.id);
			if (simIdx === -1) continue;
			consumedSimIndices.add(simIdx);

			const stepPositions = new Float32Array(positionsBuffers[simIdx]);
			const stepQuaternions = new Float32Array(quaternionsBuffers[simIdx]);
			const rawFinalQuat = await this.physicsWorker.exec("getBodyQuaternion", dicemesh.id);

			dicemesh.quaternion.set(0, 0, 0, 1);
			dicemesh.forcedResult = forcedByMesh.get(dicemesh);
			await this.throwEngine.swapDiceFace(dicemesh);

			const swapQuat = dicemesh.quaternion.clone();
			this.throwEngine.bakeSwapIntoQuaternionBuffer(stepQuaternions, swapQuat, iterationsNeeded);

			dicemesh.quaternion.set(0, 0, 0, 1);
			dicemesh.sim = { dead: false, stepQuaternions, stepPositions };
			const isSoundCarrier = !soundCarrierAssigned;
			dicemesh.persistentThrow = {
				swapQuat: swapQuat.clone(),
				rawQuat: rawFinalQuat,
				iterations: iterationsNeeded,
				iteration: 0,
				//no roll/diceType - first die carries collision sounds only
				roll: null,
				diceType: null,
				detectedCollides: isSoundCarrier ? resolvedCollides : null,
				lastCollideFrame: -1
			};
			if (isSoundCarrier) soundCarrierAssigned = true;
		}

		//4b. populate SFX using thrower's config
		if (sfxList.length > 0) {
			for (const dicemesh of heldDice) {
				if (dicemesh.forcedResult == null) continue;
				const matched = this._matchPersistentSFX(
					sfxList, dicemesh.notation.type,
					dicemesh.forcedResult, dicemesh.notation.d100Result || null
				);
				if (matched.length > 0) dicemesh.specialEffects = matched;
			}
		}

		//5. buffer playback for struck bystander dice
		for (let i = 0; i < diceIds.length; i++) {
			if (consumedSimIndices.has(i)) continue;
			const struckMesh = meshById.get(diceIds[i]);
			if (!struckMesh) continue;
			struckMesh.sim = {
				dead: false,
				stepPositions: new Float32Array(positionsBuffers[i]),
				stepQuaternions: new Float32Array(quaternionsBuffers[i])
			};
			struckMesh.persistentThrow = {
				iterations: iterationsNeeded,
				iteration: 0
			};
		}

		//notify DiceBox so it can update remote outlines
		if (this.onRemoteThrowReplayed) {
			const userId = heldDice[0]?.userData?.ownerUserId;
			if (userId) this.onRemoteThrowReplayed(userId);
		}
	}

	//match SFX config entries against a persistent die's type and result
	_matchPersistentSFX(sfxList, dieType, forcedResult, d100Result = null) {
		if (!Array.isArray(sfxList) || sfxList.length === 0) return [];
		const resultStr = String(forcedResult);
		return sfxList.filter(sfx => {
			if (sfx.diceType === "d100") {
				if (!d100Result) return false;
				const sfxClass = DiceSFXManager.SFX_MODE_CLASS?.[sfx.specialEffect];
				if (sfxClass?.PLAY_ONLY_ONCE_PER_MESH && dieType === "d10") return false;
				return sfx.onResult.includes(String(d100Result));
			}
			return sfx.diceType === dieType && sfx.onResult.includes(resultStr);
		});
	}

	//populate specialEffects on thrown persistent dice and fire SFX for them
	_triggerPersistentSFX(dicemeshes, sfxList) {
		const promises = [];
		for (const dicemesh of dicemeshes) {
			const matched = this._matchPersistentSFX(
				sfxList,
				dicemesh.notation.type,
				dicemesh.forcedResult,
				dicemesh.notation.d100Result || null
			);
			if (matched.length > 0) {
				dicemesh.specialEffects = matched;
				for (const sfx of matched) {
					promises.push(DiceSFXManager.playSFX(sfx, this.sfxContext, dicemesh));
				}
			}
		}
		return Promise.all(promises);
	}
}
