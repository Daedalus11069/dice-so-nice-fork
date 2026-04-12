import {
	Euler,
	Quaternion,
	Vector2
} from 'three';

export class InputHandler {

	constructor(diceScene, physicsWorker, persistentDiceManager, throwEngine) {
		this.diceScene = diceScene;
		this.physicsWorker = physicsWorker;
		this.persistentDiceManager = persistentDiceManager;
		this.throwEngine = throwEngine;

		this.mouse = {
			pos: new Vector2(),
			startDrag: undefined,
			startDragTime: undefined,
			constraintDown: false,
			constraint: null,
			//ring buffer for velocity tracking
			dragPositions: [],
			//currently held persistent dice (one cursor drives the whole group)
			heldPersistentDice: [],
			//sticky pre-roll: gesture commits to throw on release
			preRoll: false,
			//gesture accumulators: shakeCount (direction reversals), spinAccum (rotational sweep)
			shakeCount: 0,
			spinAccum: 0,
			//tentative grab armed by Ctrl+pointerdown, promoted to drag past threshold
			pendingGrab: null
		};

		this.hoveredDie = null;

		//reusable scratch objects for pre-roll rotation (avoid per-frame allocations)
		this._preRollEuler = new Euler(0, 0, 0, 'XYZ');
		this._preRollDeltaQuat = new Quaternion();

		//throttle for move socket emission (~100ms)
		this._lastMoveEmitTime = 0;

		//callbacks set by DiceBox
		this.onPersistentEvent = null;
		this.onSelectionChanged = null;
		this.onDiceClicked = null;
	}

	//per-frame: chaotic rotation for held dice during pre-roll
	updatePreRoll(timeDiff) {
		if (!this.mouse.preRoll || this.mouse.heldPersistentDice.length === 0) return;

		for (const dicemesh of this.mouse.heldPersistentDice) {
			const r = dicemesh.userData?.preRollRates;
			if (!r) continue;
			r.t += timeDiff;
			const ex = r.x * timeDiff;
			const ey = r.y * timeDiff;
			//z oscillates sinusoidally for wobble
			const w = 2 * Math.PI * r.zFreq;
			const ez = r.zAmp * w * Math.cos(w * r.t) * timeDiff;
			this._preRollEuler.set(ex, ey, ez, 'XYZ');
			this._preRollDeltaQuat.setFromEuler(this._preRollEuler);
			dicemesh.quaternion.multiply(this._preRollDeltaQuat);
		}
	}

	findRootObject(object) {
		if (object.hasOwnProperty("shape"))
			return object;
		else if (object.parent)
			return this.findRootObject(object.parent);
		else
			return null;
	}

	findHoveredDie() {
		const persistentDiceList = this.persistentDiceManager.persistentDiceList;
		//persistent dice can be interacted with even during ephemeral rolls
		const canInteractPersistent = this._isVisible && !this.mouse.constraintDown && persistentDiceList.length > 0;
		if ((this._isVisible && !this.throwEngine.running && !this.mouse.constraintDown) || canInteractPersistent) {
			this.diceScene.raycaster.setFromCamera(this.mouse.pos, this.diceScene.camera);
			const intersects = this.diceScene.raycaster.intersectObjects([...this.throwEngine.diceList, ...this.throwEngine.deadDiceList, ...persistentDiceList], true);
			if (intersects.length) {
				this.hoveredDie = intersects[0];
			}
			else
				this.hoveredDie = null;
		}
	}

	async onMouseMove(event, ndc) {
		this.mouse.pos.x = ndc.x;
		this.mouse.pos.y = ndc.y;

		//tentative-grab promotion: Ctrl+pointerdown=>drag past threshold picks up selection
		if (this.mouse.pendingGrab && !this.mouse.constraint) {
			const dx = event.clientX - this.mouse.pendingGrab.clientX;
			const dy = event.clientY - this.mouse.pendingGrab.clientY;
			const DRAG_THRESHOLD_PX = 5;
			if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
				const pending = this.mouse.pendingGrab;
				this.mouse.pendingGrab = null;
				//add under-cursor die to selection if not already there
				if (!pending.wasSelected && pending.root) {
					//include link-group siblings (d100 pair)
					for (const m of this.persistentDiceManager.getLinkGroupSiblings(pending.root)) {
						this.persistentDiceManager.selectedPersistentDiceIds.add(m.id);
					}
					if (this.onSelectionChanged) this.onSelectionChanged();
				}
				let heldDice = this.persistentDiceManager.getSelectedPersistentDice();
				if (heldDice.length === 0 && pending.root) {
					//defensive fallback
					heldDice = [pending.root];
				}
				if (heldDice.length > 0) {
					this.mouse.constraintDown = true;
					if (canvas.mouseInteractionManager)
						canvas.mouseInteractionManager.object.interactive = false;
					await this._beginPersistentGrab(heldDice, pending.pos);
				}
				//fall through to update constraint target with current cursor
			}
		}

		if (this.mouse.constraint) {
			this.diceScene.raycaster.setFromCamera(this.mouse.pos, this.diceScene.camera);
			const intersects = this.diceScene.raycaster.intersectObjects([this.diceScene.desk]);
			if (intersects.length) {
				let pos = intersects[0].point;
				//persistent dice: per-die targets from pickupOffset; ephemeral: legacy single-pos
				if (this.mouse.heldPersistentDice.length > 0) {
					const positions = {};
					for (const d of this.mouse.heldPersistentDice) {
						const off = d.userData?.pickupOffset;
						positions[d.id] = off
							? { x: pos.x + off.x, y: pos.y + off.y, z: pos.z }
							: { x: pos.x, y: pos.y, z: pos.z };
					}
					await this.physicsWorker.exec("updateConstraint", { positions });

					//multiplayer sync: emit visual positions (not constraint targets)
					if (this.onPersistentEvent) {
						const now = performance.now();
						if (now - this._lastMoveEmitTime >= 100) {
							this._lastMoveEmitTime = now;
							const movePositions = [];
							for (const d of this.mouse.heldPersistentDice) {
								const container = d.parent;
								const cx = container ? container.position.x : positions[d.id].x;
								const cy = container ? container.position.y : positions[d.id].y;
								movePositions.push({
									persistentId: d.userData.persistentId,
									...this.toPositionPct(cx, cy)
								});
							}
							this.onPersistentEvent("move", {
								data: { positions: movePositions }
							});
						}
					}
				} else {
					//ephemeral die - legacy single-pos path
					await this.physicsWorker.exec("updateConstraint", { pos });
				}

				//ring buffer for velocity calculation
				if (this.mouse.heldPersistentDice.length > 0) {
					const DRAG_BUFFER_SIZE = 6;
					const now = performance.now();
					const buf = this.mouse.dragPositions;
					buf.push({ x: pos.x, y: pos.y, z: pos.z, time: now });
					if (buf.length > DRAG_BUFFER_SIZE) buf.shift();

					//gesture detection: shakes (direction reversals) or spins (rotational sweep)
					if (!this.mouse.preRoll && buf.length >= 3) {
						const p0 = buf[buf.length - 3];
						const p1 = buf[buf.length - 2];
						const p2 = buf[buf.length - 1];
						const d1x = p1.x - p0.x, d1y = p1.y - p0.y;
						const d2x = p2.x - p1.x, d2y = p2.y - p1.y;
						const dt12 = (p2.time - p1.time) / 1000;
						const mag1 = Math.hypot(d1x, d1y);
						const mag2 = Math.hypot(d2x, d2y);
						const instSpeed = dt12 > 0 ? mag2 / dt12 : 0;

						//noise gate: reject sub-pixel jitter, require real gesture speed
						const MIN_GESTURE_SPEED = 1300;
						const MIN_DELTA_MAG = 12;
						if (mag1 > MIN_DELTA_MAG && mag2 > MIN_DELTA_MAG && instSpeed > MIN_GESTURE_SPEED) {
							const dot = (d1x * d2x + d1y * d2y) / (mag1 * mag2);
							const cross = (d1x * d2y - d1y * d2x) / (mag1 * mag2);

							//sharp reversal => shake tick
							if (dot < -0.35) this.mouse.shakeCount++;

							//integrate signed rotational sweep
							this.mouse.spinAccum += cross;
						} else {
							//decay accumulators on non-gesture motion
							this.mouse.shakeCount = Math.max(0, this.mouse.shakeCount - 0.25);
							this.mouse.spinAccum *= 0.92;
						}

						const SHAKE_TRIGGER = 3;
						const SPIN_TRIGGER = 3;
						if (this.mouse.shakeCount >= SHAKE_TRIGGER ||
							Math.abs(this.mouse.spinAccum) >= SPIN_TRIGGER) {
							this._activatePreRoll();
						}
					}
				}
			}
		}
	}

	async onMouseDown(event, ndc) {
		this.mouse.pos.x = ndc.x;
		this.mouse.pos.y = ndc.y;
		this.hoveredDie = null;
		this.findHoveredDie();

		let entity = this.hoveredDie;
		if (!entity) {
			//clear selection only if click landed on the DSN canvas (not Foundry chrome)
			if (Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) {
				this.persistentDiceManager.clearPersistentSelection();
			}
			return;
		}
		let pos = entity.point;
		if (pos) {
			let root = this.findRootObject(entity.object);
			const isPersistent = root.userData?.persistent === true;
			const multiSelectKey = event.ctrlKey || event.metaKey;

			//Ctrl+click: arm tentative grab, toggle on release unless promoted to drag
			if (isPersistent && multiSelectKey) {
				if (root.userData?.lockedBy && root.userData.lockedBy !== game.user?.id) return false;
				event.stopPropagation();
				event.preventDefault();
				this.mouse.pendingGrab = {
					dieId: root.id,
					root: root,
					pos,
					wasSelected: this.persistentDiceManager.selectedPersistentDiceIds.has(root.id),
					clientX: event.clientX,
					clientY: event.clientY
				};
				return true;
			}

			this.mouse.constraintDown = true;
			//disable FVTT mouse events
			event.stopPropagation();
			event.preventDefault();
			if (canvas.mouseInteractionManager)
				canvas.mouseInteractionManager.object.interactive = false;

			try {
				if (isPersistent) {
					if (root.userData?.lockedBy && root.userData.lockedBy !== game.user?.id) {
						this.mouse.constraintDown = false;
						if (canvas.mouseInteractionManager)
							canvas.mouseInteractionManager.activate();
						return false;
					}
					//if in selection, grab all selected; otherwise clear and grab just this one
					let heldDice;
					if (this.persistentDiceManager.selectedPersistentDiceIds.has(root.id)) {
						heldDice = this.persistentDiceManager.getSelectedPersistentDice();
					} else {
						this.persistentDiceManager.clearPersistentSelection();
						//grab the whole link group (d100 pair)
						heldDice = this.persistentDiceManager.getLinkGroupSiblings(root);
					}

					await this._beginPersistentGrab(heldDice, pos);
				} else {
					//ephemeral die pickup
					await this.physicsWorker.exec("addConstraint", { id: root.id, pos });
					this.mouse.constraint = true;
				}

				if (this.onDiceClicked) this.onDiceClicked(root, pos);
				return true;
			} catch (error) {
				console.error(error);
				this.mouse.constraintDown = false;
				this.mouse.constraint = false;
				this.mouse.heldPersistentDice = [];
				if (canvas.mouseInteractionManager)
					canvas.mouseInteractionManager.activate();
			}
		}
		return false;
	}

	async onMouseUp(event) {
		//tentative grab that never promoted - commit selection toggle on release
		if (this.mouse.pendingGrab && !this.mouse.constraintDown) {
			const pending = this.mouse.pendingGrab;
			this.mouse.pendingGrab = null;
			if (pending.root) this.persistentDiceManager.togglePersistentSelection(pending.root);
			return true;
		}

		if (this.mouse.constraintDown) {
			this.mouse.constraintDown = false;
			this.mouse.constraint = false;

			//snapshot before awaiting to prevent concurrent mousedown from overwriting state
			const heldDice = this.mouse.heldPersistentDice.slice();
			const wasPreRoll = this.mouse.preRoll;
			//only pre-roll releases become throws (no skill-shot-by-flick)
			const throwVelocity = (heldDice.length > 0 && wasPreRoll)
				? this._computeThrowVelocity(true)
				: null;

			//clear pre-roll rotation before throw (angular velocity hides the snap)
			if (heldDice.length > 0 && wasPreRoll) {
				for (const d of heldDice) d.quaternion.set(0, 0, 0, 1);
			}

			//clear per-die state before _resetPreRollState empties the held list
			for (const d of heldDice) {
				if (d.userData) {
					delete d.userData.pickupOffset;
					d.userData.preRollRates = null;
				}
			}

			this._resetPreRollState();
			this.mouse.heldPersistentDice = [];
			this.mouse.dragPositions = [];

			try {
				//release constraints - pass ids for persistent, empty for ephemeral fallthrough
				if (heldDice.length > 0) {
					await this.physicsWorker.exec("removeConstraint", { ids: heldDice.map(d => d.id) });
				} else {
					await this.physicsWorker.exec("removeConstraint", {});
				}

				//throw the whole held group (combined Roll + combined sim)
				if (heldDice.length > 0 && throwVelocity) {
					await this.persistentDiceManager.throwPersistentDice(heldDice, throwVelocity);
				} else if (heldDice.length > 0 && this.onPersistentEvent) {
					//reposition release - notify to unlock
					this.onPersistentEvent("release", {
						data: {
							persistentIds: heldDice.map(d => d.userData.persistentId)
						}
					});
				}
			} catch (err) {
				console.error("[Dice So Nice] Persistent throw failed:", err);
			} finally {
				//re-enable fvtt canvas events
				if (canvas.mouseInteractionManager)
					canvas.mouseInteractionManager.activate();
			}
			return true;
		}
		return false;
	}

	_resetPreRollState() {
		const wasPreRoll = this.mouse.preRoll;
		this.mouse.preRoll = false;
		this.mouse.shakeCount = 0;
		this.mouse.spinAccum = 0;
		for (const d of this.mouse.heldPersistentDice) {
			if (d.userData) d.userData.preRollRates = null;
		}
		//restore selection outlines now that pre-roll is over
		if (wasPreRoll && this.onSelectionChanged) this.onSelectionChanged();
	}

	//pick up persistent dice as a held group
	async _beginPersistentGrab(heldDice, pos) {
		//desk-plane cursor point so pickupOffsets don't jump on first mousemove
		this.diceScene.raycaster.setFromCamera(this.mouse.pos, this.diceScene.camera);
		const deskHits = this.diceScene.raycaster.intersectObjects([this.diceScene.desk]);
		const cursorDesk = deskHits.length > 0 ? deskHits[0].point : pos;

		//anchor z from desk plane (die-surface z caused one-frame vertical jump)
		const anchorPos = { x: cursorDesk.x, y: cursorDesk.y, z: cursorDesk.z };

		for (const die of heldDice) {
			//offset from cursor so the group preserves its spatial arrangement
			const worldPos = die.parent ? die.parent.position : die.position;
			die.userData.pickupOffset = {
				x: worldPos.x - cursorDesk.x,
				y: worldPos.y - cursorDesk.y
			};
			await this.physicsWorker.exec("addConstraint", { id: die.id, pos: anchorPos });
		}
		this.mouse.constraint = true;
		this.mouse.heldPersistentDice = heldDice;
		//don't seed with down-point (die surface vs desk plane = false velocity spikes)
		this.mouse.dragPositions = [];
		this._resetPreRollState();

		//multiplayer sync: notify pickup
		if (this.onPersistentEvent) {
			this.onPersistentEvent("pickup", {
				data: {
					persistentIds: heldDice.map(d => d.userData.persistentId)
				}
			});
		}
	}

	_activatePreRoll() {
		this.mouse.preRoll = true;
		//pre-roll dissolves the selection (one-time grouping, not a persistent tag)
		this.persistentDiceManager.selectedPersistentDiceIds.clear();
		//per-die random rotation rates so multi-die selections don't rotate in lockstep
		const rate = () => (Math.random() < 0.5 ? -1 : 1) * (6.3 + Math.random() * 1.8);
		for (const d of this.mouse.heldPersistentDice) {
			d.userData.preRollRates = {
				x: rate(),
				y: rate(),
				//z oscillates slowly
				zAmp: 0.35,
				zFreq: 1.2 + Math.random() * 0.4,
				t: 0
			};
			//compact multi-die group under cursor ("cupped in hand")
			if (this.mouse.heldPersistentDice.length > 1 && d.userData) {
				d.userData.pickupOffset = { x: 0, y: 0 };
			}
		}
		if (this.onSelectionChanged) this.onSelectionChanged();

		//multiplayer sync: notify pre-roll
		if (this.onPersistentEvent) {
			this.onPersistentEvent("preroll", {
				data: {
					persistentIds: this.mouse.heldPersistentDice.map(d => d.userData.persistentId)
				}
			});
		}
	}

	_computeThrowVelocity(forceThrow = false) {
		const positions = this.mouse.dragPositions;

		const THROW_VELOCITY_THRESHOLD = 800;
		//floor: weak throws get scaled up so the die still tumbles
		const MIN_THROW_VELOCITY = 1200;

		//fallback: random direction at MIN velocity when buffer is degenerate
		const randomMinThrow = () => {
			const angle = Math.random() * Math.PI * 2;
			return {
				x: Math.cos(angle) * MIN_THROW_VELOCITY,
				y: Math.sin(angle) * MIN_THROW_VELOCITY,
				z: 0
			};
		};

		if (positions.length < 3) return forceThrow ? randomMinThrow() : null;

		const first = positions[0];
		const last = positions[positions.length - 1];
		const dt = (last.time - first.time) / 1000; // seconds
		if (dt < 0.001) return forceThrow ? randomMinThrow() : null;

		const vx = (last.x - first.x) / dt;
		const vy = (last.y - first.y) / dt;
		const speed = Math.sqrt(vx * vx + vy * vy);

		if (!forceThrow && speed < THROW_VELOCITY_THRESHOLD) return null;

		//scale up to minimum if too slow
		if (speed < MIN_THROW_VELOCITY) {
			if (speed < 1e-6) return randomMinThrow();
			const scale = MIN_THROW_VELOCITY / speed;
			return { x: vx * scale, y: vy * scale, z: 0 };
		}

		return { x: vx, y: vy, z: 0 };
	}

	toPositionPct(worldX, worldY) {
		return {
			x: (worldX / this.diceScene.display.innerWidth) + 0.5,
			y: -(worldY / this.diceScene.display.innerHeight) + 0.5
		};
	}

	fromPositionPct(pct) {
		return {
			x: (pct.x - 0.5) * this.diceScene.display.innerWidth,
			y: -(pct.y - 0.5) * this.diceScene.display.innerHeight
		};
	}

	//visibility flag read from DiceBox (set by DiceBox after construction)
	get _isVisible() {
		return this._isVisibleFn ? this._isVisibleFn() : false;
	}
}
