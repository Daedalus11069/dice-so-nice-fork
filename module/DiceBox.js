import { DiceScene } from './DiceScene.js';
import { DiceSFXManager } from './DiceSFXManager.js';
import { DiceSystem } from './DiceSystem.js';
import { InputHandler } from './InputHandler.js';
import { PersistentDiceManager } from './PersistentDiceManager.js';
import { SoundManager } from './SoundManager.js';
import { ThrowEngine } from './ThrowEngine.js';
import { removeTicker } from './Utils.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import Stats from 'stats-gl';

import {
	PCFSoftShadowMap,
	PCFShadowMap,
	Vector2
} from 'three';


export class DiceBox {

	constructor(element_container, dice_factory, config) {
		this.container = element_container;
		this.dicefactory = dice_factory;
		this.config = config;
		this.diceScene = null;
		this.throwEngine = null;
		this.persistentDiceManager = null;
		this.inputHandler = null;
		this.isVisible = false;
		this.last_time = 0;
		this.allowInteractivity = false;

		//outline pass state for persistent dice selection (owned by DiceBox, not PersistentDiceManager)
		this._highlightedSelectionMeshes = new Set();

		//per-user outline passes for remote persistent dice (userId => {pass, meshes})
		this._remoteOutlinePasses = new Map();

		this.immersiveDarkness = true;

		this.showExtraDice = false;

		this.soundManager = new SoundManager();

		//deferred callback values set before persistentDiceManager is created
		this._deferredOnPersistentEvent = null;
		this._deferredSfxListForUser = null;

		this.layers = {
			dice: 0,
			bloom: 1
		};

		this.debugMode = false;
	}

	//getters delegating to DiceScene
	get scene() { return this.diceScene?.scene; }
	get camera() { return this.diceScene?.camera; }
	get renderer() { return this.diceScene?.renderer; }
	get light() { return this.diceScene?.light; }
	get light_amb() { return this.diceScene?.light_amb; }
	get desk() { return this.diceScene?.desk; }
	get display() { return this.diceScene?.display; }
	get clock() { return this.diceScene?.clock; }
	get raycaster() { return this.diceScene?.raycaster; }
	get anisotropy() { return this.diceScene?.anisotropy; }
	get cameraHeight() { return this.diceScene?.cameraHeight; }

	//getters delegating to ThrowEngine
	get running() { return this.throwEngine ? this.throwEngine.running : false; }
	get rolling() { return this.throwEngine ? this.throwEngine.rolling : false; }

	//getters delegating to PersistentDiceManager
	get persistentDiceList() {
		return this.persistentDiceManager ? this.persistentDiceManager.persistentDiceList : [];
	}

	get selectedPersistentDiceIds() {
		return this.persistentDiceManager ? this.persistentDiceManager.selectedPersistentDiceIds : new Set();
	}

	get persistentDiceVisibility() {
		return this.persistentDiceManager ? this.persistentDiceManager.persistentDiceVisibility : "all";
	}

	//getters for SFX duck-typing contract (SFX subclasses access box.volume, box.shadows, box.muteSoundSecretRolls)
	get volume() { return this.soundManager.volume; }
	get shadows() { return this.dicefactory.shadows; }
	get muteSoundSecretRolls() { return this.soundManager.muteSoundSecretRolls; }

	get onPersistentEvent() {
		return this.persistentDiceManager ? this.persistentDiceManager.onPersistentEvent : this._deferredOnPersistentEvent;
	}

	set onPersistentEvent(value) {
		if (this.persistentDiceManager) this.persistentDiceManager.onPersistentEvent = value;
		else this._deferredOnPersistentEvent = value;
	}

	get sfxListForUser() {
		return this.persistentDiceManager ? this.persistentDiceManager.sfxListForUser : this._deferredSfxListForUser;
	}

	set sfxListForUser(value) {
		if (this.persistentDiceManager) this.persistentDiceManager.sfxListForUser = value;
		else this._deferredSfxListForUser = value;
	}

	initialize() {
		return new Promise(async resolve => {
			this.soundManager.update({
				sounds: this.config.sounds,
				volume: this.config.soundsVolume,
				soundsSurface: this.config.soundsSurface,
				muteSoundSecretRolls: this.config.muteSoundSecretRolls
			});

			this.showExtraDice = this.config.showExtraDice;
			this.allowInteractivity = this.config.boxType == "board" && game.settings.get("dice-so-nice", "allowInteractivity");
			this.persistentDiceEnabled = this.allowInteractivity && game.settings.get("dice-so-nice", "persistentDice");

			this.dicefactory.setQualitySettings(this.config);
			this.immersiveDarkness = this.config.immersiveDarkness;

			this.diceScene = new DiceScene(this.container, this.dicefactory, {
				rendererCacheKey: this.config.boxType,
				dimensions: this.config.dimensions,
				scale: this.config.scale,
				autoscale: this.config.autoscale
			});
			await this.diceScene.initialize();

			//DiceScene computed display.scale during init — push it to the factory
			this.dicefactory.setScale(this.display.scale);

			this.stats = null;
			if (this.debugMode && this.config.boxType == "board") {
				this.stats = new Stats({
					trackGPU: true,
					trackHz: true,
					trackCPT: true,
					logsPerSecond: 4,
					graphsPerSecond: 30,
					samplesLog: 40,
					samplesGraph: 10,
					precision: 2,
					horizontal: true,
					minimal: false,
					mode: 0
				});
				document.body.appendChild( this.stats.dom );
				this.stats.init(this.renderer);
			}

			//post-processing (board only, realistic lighting)
			if (this.config.boxType == "board") {
				this.setupPostProcessing();
			}

			if (this.config.boxType == "board") {
				this.physicsWorker = this.dicefactory.physicsWorker;

				await this.physicsWorker.exec('init', {
					muteSoundSecretRolls: this.muteSoundSecretRolls,
					height: this.display.containerHeight,
					width: this.display.containerWidth,
					margin: this.display.containerMargin
				});

				this.physicsWorker.off('collide');
				this.physicsWorker.on('collide', (data) => {
					this.soundManager.eventCollide(data);
				});

				this.persistentDiceManager = new PersistentDiceManager(this.diceScene, this.physicsWorker, this.dicefactory, this.soundManager);
				this.persistentDiceManager.sfxContext = this;
				this.persistentDiceManager.onSelectionChanged = () => this.updateSelectionOutlines();
				this.persistentDiceManager.onRemoteThrowReplayed = (userId) => this._updateRemoteOutlines();

				//apply deferred callbacks set before persistentDiceManager existed
				if (this._deferredOnPersistentEvent) {
					this.persistentDiceManager.onPersistentEvent = this._deferredOnPersistentEvent;
					this._deferredOnPersistentEvent = null;
				}
				if (this._deferredSfxListForUser) {
					this.persistentDiceManager.sfxListForUser = this._deferredSfxListForUser;
					this._deferredSfxListForUser = null;
				}

				this.throwEngine = new ThrowEngine(this.diceScene, this.physicsWorker, this.dicefactory, this.soundManager);
				this.throwEngine.sfxContext = this;
				this.throwEngine.persistentDiceList = this.persistentDiceManager.persistentDiceList;
				this.throwEngine.onClearAll = () => this.clearAll();

				this.persistentDiceManager.setThrowEngine(this.throwEngine);

				this.inputHandler = new InputHandler(this.diceScene, this.physicsWorker, this.persistentDiceManager, this.throwEngine);
				this.inputHandler._isVisibleFn = () => this.isVisible;
				this.inputHandler.onPersistentEvent = (type, data) => {
					if (this.onPersistentEvent) this.onPersistentEvent(type, data);
				};
				this.inputHandler.onSelectionChanged = () => this.updateSelectionOutlines();
				this.inputHandler.onDiceClicked = (root, pos) => {
					let diceSystem = root.userData?.system ?? "standard";
					this.dicefactory.systems.get(diceSystem).fire(DiceSystem.DICE_EVENT_TYPE.CLICK, { dice: root, position: pos });
				};

				let globalAnimationSpeed = game.settings.get("dice-so-nice", "globalAnimationSpeed");
				if (globalAnimationSpeed === "0")
					this.throwEngine.speed = this.config.speed;
				else
					this.throwEngine.speed = parseInt(globalAnimationSpeed, 10);
				this.throwEngine.throwingForce = this.config.throwingForce;
			}
			resolve();
		});
	}

	setScene(dimensions) {
		this.diceScene.setScene(dimensions);
		if (this.config.boxType == "board") {
			this.setupPostProcessing();
		}
	}

	setupPostProcessing() {
		this.diceScene.setupBloomPipeline();
		if (!this.diceScene.finalComposer) return;

		//board-specific: outline pass for persistent dice and SFX
		const canvasSize = new Vector2(this.display.currentWidth, this.display.currentHeight);
		this.outlinePass = new OutlinePass(canvasSize, this.scene, this.camera);
		this.outlinePass.pulsePeriod = 1.5;

		//insert outline pass before the blending pass
		const blendIdx = this.diceScene.finalComposer.passes.indexOf(this.diceScene.blendingPass);
		if (blendIdx >= 0) {
			this.diceScene.finalComposer.insertPass(this.outlinePass, blendIdx);
		}
	}

	async update(config) {
		this.showExtraDice = config.showExtraDice;

		this.soundManager.update({
			muteSoundSecretRolls: config.muteSoundSecretRolls,
			sounds: config.sounds,
			volume: config.volume,
			soundsSurface: config.soundsSurface
		});

		this.diceScene.updateScale(config.scale, config.autoscale);
		if (this.config.boxType == "board") {
			this.dicefactory.setScale(this.display.scale);
		}

		this.dicefactory.setQualitySettings(config);

		if (this.throwEngine) {
			let globalAnimationSpeed = game.settings.get("dice-so-nice", "globalAnimationSpeed");
			if (globalAnimationSpeed === "0")
				this.throwEngine.speed = parseInt(config.speed, 10);
			else
				this.throwEngine.speed = parseInt(globalAnimationSpeed, 10);
		}

		this.light.castShadow = this.dicefactory.shadows;
		this.desk.receiveShadow = this.dicefactory.shadows;
		this.renderer.shadowMap.enabled = this.dicefactory.shadows;
		this.renderer.shadowMap.type = this.dicefactory.shadowQuality == "high" ? PCFSoftShadowMap : PCFShadowMap;

		await this.dicefactory.preloadPresets(true, null, config.appearance);

		if (this.throwEngine) this.throwEngine.throwingForce = config.throwingForce;
		this.immersiveDarkness = config.immersiveDarkness;
		this.scene.traverse(object => {
			if (object.type === 'Mesh') object.material.needsUpdate = true;
		});
	}

	updateBoundaries(dimensions) {
		const newDimensions = this.diceScene.updateBoundaries(dimensions);
		if (this.config.boxType == "board") {
			this.dicefactory.setScale(this.display.scale);
		}

		if (this.physicsWorker) {
			this.physicsWorker.exec('updateBarriers', newDimensions);
		}
	}

	updateScale(scale = 100, autoscale = false) {
		this.diceScene.updateScale(scale, autoscale);
		if (this.config.boxType == "board") {
			this.dicefactory.setScale(this.display.scale);
		}
	}


	//spawn a persistent die on the tabletop
	async spawnPersistentDie(type, appearance, position = null, diceLibrary = null, opts = {}) {
		if (!this.persistentDiceEnabled) return null;

		const dicemesh = await this.persistentDiceManager.spawnPersistentDie(type, appearance, position, diceLibrary, opts);
		if (!dicemesh) return null;

		//ensure ticker is running
		if (!this.throwEngine.running) {
			removeTicker(this.animateThrow);
			canvas.app.ticker.add(this.animateThrow, this);
		}

		this.isVisible = true;
		this.renderScene();

		return dicemesh;
	}

	async removePersistentDie(persistentId) {
		if (!this.persistentDiceManager) return;
		await this.persistentDiceManager.removePersistentDie(persistentId);

		//clean up if no more dice
		if (this.persistentDiceList.length === 0 && !this.throwEngine.rolling && this.throwEngine.diceList.length === 0 && this.throwEngine.deadDiceList.length === 0) {
			removeTicker(this.animateThrow);
			this.isVisible = false;
		}

		this.renderScene();
	}

	countPersistentDiceByOwner(userId = null, type = null, opts = {}) {
		if (!this.persistentDiceManager) return 0;
		return this.persistentDiceManager.countPersistentDiceByOwner(userId, type, opts);
	}

	findMostRecentPersistentDie(type, userId = null, opts = {}) {
		if (!this.persistentDiceManager) return null;
		return this.persistentDiceManager.findMostRecentPersistentDie(type, userId, opts);
	}

	setPersistentDiceVisibility(mode) {
		if (!this.persistentDiceManager) return;
		this.persistentDiceManager.setPersistentDiceVisibility(mode);
		this.renderScene();
	}

	async clearPersistentDice(opts) {
		if (!this.persistentDiceManager) return;
		await this.persistentDiceManager.clearPersistentDice(opts);
		this.renderScene();
	}

	async removeSelectedPersistentDice() {
		if (!this.persistentDiceManager) return 0;
		return this.persistentDiceManager.removeSelectedPersistentDice();
	}

	//This is the render loop for the board. /!\ Not called in the showcase /!\
	animateThrow() {

		let time = (new Date()).getTime();
		this.last_time = this.last_time || time - (this.throwEngine.framerate * 1000);
		let time_diff = (time - this.last_time) / 1000;

		let neededSteps = Math.floor(time_diff / this.throwEngine.framerate);

		if(this.stats)
			this.stats.update();

		if(this.throwEngine.iteration == 0) {
			this.throwEngine.addDiceToScene();
		}

		if (neededSteps && this.throwEngine.rolling) {
			this.throwEngine.updateThrowPlayback(neededSteps);
		} else if (!this.throwEngine.rolling) {
			if (this.inputHandler) this.inputHandler.updatePreRoll(time_diff);

			this.persistentDiceManager.updateRemoteAnimations(time_diff);

			this.physicsWorker.exec('playStep', {
				time_diff: time_diff
			}).then((result) => {
				//If nothing is returned, skip the rest of the function
				if (!result || !result.ids)
					return;
				const { ids, quaternionsBuffers, positionsBuffers, worldAsleep } = result;

				if (worldAsleep)
					return;
				// Create a mapping of IDs to their index in the 'ids' array
				const quaternions = new Float32Array(quaternionsBuffers);
				const positions = new Float32Array(positionsBuffers);
				const idToIndex = new Map();
				ids.forEach((id, index) => {
					idToIndex.set(id, index);
				});

				for (const child of this.scene.children) {
					if (!child.children || !child.children.length) continue;
					let dicemesh = child.children[0];
					//skip persistent dice in buffer playback
					if (dicemesh.userData?.persistent && dicemesh.sim) continue;
					//update ephemeral dice and persistent dice (live physics)
					const isEphemeral = dicemesh.sim != undefined && !dicemesh.sim.dead;
					const isPersistent = dicemesh.userData?.persistent;
					if ((isEphemeral || isPersistent) && idToIndex.has(dicemesh.id)) {
						const idx = idToIndex.get(dicemesh.id);
						child.position.fromArray(positions, idx * 3);
						child.quaternion.fromArray(quaternions, idx * 4);
					}
				}
			});
		}

		//play back pre-recorded buffers for persistent dice mid-throw
		this.persistentDiceManager.updatePersistentPlayback(neededSteps, this.throwEngine.speed);

		if (this.isVisible && (this.allowInteractivity || this.diceScene.animatedDiceDetected || neededSteps || DiceSFXManager.renderQueue.length || this.persistentDiceList.length > 0)) {
			DiceSFXManager.renderSFX();
			//use darknessLevel to change toneMapping
			if (this.dicefactory.realisticLighting && this.immersiveDarkness) {
				//If the darkness level is not defined, we set it to 0
				let darknessLevel = canvas.darknessLevel || 0;
				let toneDefault = this.diceScene.toneMappingExposureDefault;
					this.renderer.toneMappingExposure = toneDefault * 0.4 + (toneDefault * 0.6 - darknessLevel * 0.6);
			}

			this.renderScene();
		}

		this.last_time = this.last_time + neededSteps * this.throwEngine.framerate * 1000;

		// roll finished
		if (this.throwEngine.throwFinished()) {
			//if animated dice still on the table, keep animating
			if (this.throwEngine.running) {
				this.throwEngine.fireResultEvents();
				this.throwEngine.handleSpecialEffectsInit().then(() => {
					this.throwEngine.rolling = false;
					//clean up sim data so persistent dice return to live physics
					for (const die of this.persistentDiceList) {
						delete die.sim;
					}
					this.throwEngine.callback(this.throwEngine.throws);
					if (!this.diceScene.animatedDiceDetected && !(this.allowInteractivity && (this.throwEngine.deadDiceList.length + this.throwEngine.diceList.length) > 0) && !DiceSFXManager.renderQueue.length && this.persistentDiceList.length === 0)
						removeTicker(this.animateThrow);
				});
			}
			this.throwEngine.running = false;
		}
	}

	async start_throw(throws, callback) {
		if (this.throwEngine.rolling) return;
		this.isVisible = true;
		await this.throwEngine.start_throw(throws, callback);
		this.last_time = 0;
		removeTicker(this.animateThrow);
		canvas.app.ticker.add(this.animateThrow, this);
	}

	async clearAll() {
		await this.throwEngine.clearAll();
		DiceSFXManager.clearQueue();
		//keep ticker alive if persistent dice exist
		if (this.persistentDiceList.length === 0) {
			removeTicker(this.animateThrow);
		}

		this.renderScene();

		//keep canvas visible if persistent dice exist
		if (this.persistentDiceList.length === 0) {
			this.isVisible = false;
		}
	}

	renderScene() {
		this.diceScene.renderScene();
	}

	clearScene() {
		//dispose board-specific outline passes
		if (this.outlinePass)
			this.outlinePass.dispose();
		for (const [, entry] of this._remoteOutlinePasses) {
			entry.pass.dispose();
		}
		this._remoteOutlinePasses.clear();

		this.diceScene.clearScene();

		removeTicker(this.animateThrow);
	}

	//facade: delegate input handling to InputHandler
	async onMouseMove(event, ndc) {
		if (this.inputHandler) return this.inputHandler.onMouseMove(event, ndc);
	}

	async onMouseDown(event, ndc) {
		if (this.inputHandler) return this.inputHandler.onMouseDown(event, ndc);
	}

	async onMouseUp(event) {
		if (this.inputHandler) return this.inputHandler.onMouseUp(event);
	}

	updateSelectionOutlines() {
		if (!this.outlinePass) return;
		const pass = this.outlinePass;

		//remove our outlines, leave SFX outlines intact
		if (this._highlightedSelectionMeshes.size > 0) {
			pass.selectedObjects = pass.selectedObjects.filter(o => !this._highlightedSelectionMeshes.has(o));
			this._highlightedSelectionMeshes.clear();
		}

		//hide outlines during pre-roll (chaotic rotation is enough visual signal)
		if (this.inputHandler && this.inputHandler.mouse.preRoll) return;

		//add current selection
		for (const mesh of this.persistentDiceManager.getSelectedPersistentDice()) {
			pass.selectedObjects.push(mesh);
			this._highlightedSelectionMeshes.add(mesh);
		}

		//update remote user outlines
		this._updateRemoteOutlines();
	}

	_getOrCreateRemoteOutlinePass(userId) {
		let entry = this._remoteOutlinePasses.get(userId);
		if (entry) return entry;

		const user = game.users.get(userId);
		if (!user) return null;

		const canvasSize = new Vector2(this.display.innerWidth, this.display.innerHeight);
		const pass = new OutlinePass(canvasSize, this.scene, this.camera);
		pass.pulsePeriod = 2.0;
		pass.edgeStrength = 3.0;
		pass.edgeGlow = 0.5;
		pass.visibleEdgeColor.set(user.color.toString());
		pass.hiddenEdgeColor.set(user.color.toString());

		//insert after the SFX outline pass
		const sfxIndex = this.diceScene.finalComposer.passes.indexOf(this.outlinePass);
		if (sfxIndex >= 0) {
			this.diceScene.finalComposer.insertPass(pass, sfxIndex + 1 + this._remoteOutlinePasses.size);
		} else {
			this.diceScene.finalComposer.addPass(pass);
		}

		entry = { pass, meshes: new Set() };
		this._remoteOutlinePasses.set(userId, entry);
		return entry;
	}

	_updateRemoteOutlines() {
		//clear existing
		for (const [, entry] of this._remoteOutlinePasses) {
			entry.pass.selectedObjects = [];
			entry.meshes.clear();
		}

		if (!this.config.persistentDiceOutlines) return;

		//gather remotely-held dice by user
		const activeUserIds = new Set();
		for (const mesh of this.persistentDiceList) {
			const userId = mesh.userData?.lockedBy;
			if (!userId || userId === game.user?.id) continue;

			activeUserIds.add(userId);
			const entry = this._getOrCreateRemoteOutlinePass(userId);
			if (!entry) continue;
			entry.pass.selectedObjects.push(mesh);
			entry.meshes.add(mesh);
		}

		//cleanup passes for users no longer holding dice
		for (const userId of this._remoteOutlinePasses.keys()) {
			if (!activeUserIds.has(userId)) {
				this.removeRemoteOutlinePass(userId);
			}
		}
	}

	removeRemoteOutlinePass(userId) {
		const entry = this._remoteOutlinePasses.get(userId);
		if (!entry) return;
		const idx = this.diceScene.finalComposer.passes.indexOf(entry.pass);
		if (idx >= 0) this.diceScene.finalComposer.passes.splice(idx, 1);
		entry.pass.dispose();
		this._remoteOutlinePasses.delete(userId);
	}

	//facade: coordinate conversion (used by Dice3D)
	toPositionPct(worldX, worldY) {
		if (this.inputHandler) return this.inputHandler.toPositionPct(worldX, worldY);
		//fallback before inputHandler is created
		return {
			x: (worldX / this.display.innerWidth) + 0.5,
			y: -(worldY / this.display.innerHeight) + 0.5
		};
	}

	fromPositionPct(pct) {
		if (this.inputHandler) return this.inputHandler.fromPositionPct(pct);
		//fallback before inputHandler is created
		return {
			x: (pct.x - 0.5) * this.display.innerWidth,
			y: -(pct.y - 0.5) * this.display.innerHeight
		};
	}

	//facade: replay a remote player's persistent dice throw
	replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList = []) {
		return this.persistentDiceManager.replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList);
	}

}
