import { Mesh, PlaneGeometry, ShadowMaterial } from 'three';
import { removeTicker } from './Utils.js';

//showcase grid layout, selector animation, and die raycasting
export class ShowcaseView {

	constructor(diceScene, diceFactory) {
		this.diceScene = diceScene;
		this.dicefactory = diceFactory;

		this.selector = {
			animate: true,
			rotate: true,
			intersected: null,
			dice: []
		};
		this.showExtraDice = false;
		this.diceList = [];
		this.deadDiceList = [];
		this.pane = null;
		this.last_time = 0;
	}

	//clear showcase dice and stop animation
	clearAll() {
		this.deadDiceList = this.deadDiceList.concat(this.diceList);
		this.diceList = [];

		let dice;
		while (dice = this.deadDiceList.pop()) {
			this.diceScene.scene.remove(dice.parent.type == "Scene" ? dice : dice.parent);
		}

		if (this.pane) this.diceScene.scene.remove(this.pane);
		removeTicker(this.animateSelector);
		this.diceScene.renderScene();
	}

	//stop the selector ticker without touching scene contents
	stopAnimation() {
		removeTicker(this.animateSelector);
	}

	async showcase(config) {
		this.clearAll();

		//get dice type list as an array
		let selectordice = [...this.dicefactory.systems.get("standard").dice.keys()];
		const extraDiceTypes = ["d3", "d5", "d7", "d14", "d16", "d24", "d30"];
		if (!this.showExtraDice)
			selectordice = selectordice.filter((die) => !extraDiceTypes.includes(die));

		let proportion = this.diceScene.display.containerWidth / this.diceScene.display.containerHeight;
		let columns = Math.min(selectordice.length, Math.round(Math.sqrt(proportion * selectordice.length)));
		let rows = Math.floor((selectordice.length + columns - 1) / columns);

		this.diceScene.camera.position.z = this.diceScene.cameraHeight.medium;
		this.diceScene.camera.position.x = this.diceScene.display.containerWidth / 2 - (this.diceScene.display.containerWidth / columns / 2);
		this.diceScene.camera.position.y = -this.diceScene.display.containerHeight / 2 + (this.diceScene.display.containerHeight / rows / 2);
		this.diceScene.camera.fov = 2 * Math.atan(this.diceScene.display.containerHeight / (2 * this.diceScene.camera.position.z)) * (180 / Math.PI);
		this.diceScene.camera.updateProjectionMatrix();

		if (this.pane) this.diceScene.scene.remove(this.pane);
		if (this.diceScene.desk) this.diceScene.scene.remove(this.diceScene.desk);
		if (this.dicefactory.shadows) {

			let shadowplane = new ShadowMaterial();
			shadowplane.opacity = 0.5;
			shadowplane.depthWrite = false;

			this.pane = new Mesh(new PlaneGeometry(this.diceScene.display.containerWidth * 2, this.diceScene.display.containerHeight * 2, 1, 1), shadowplane);
			this.pane.receiveShadow = this.dicefactory.shadows;
			this.pane.position.set(0, 0, -70);
			this.diceScene.scene.add(this.pane);
		}

		let z = 0;
		let count = 0;
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < columns; x++) {
				if (count >= selectordice.length)
					break;
				let appearance = this.dicefactory.getAppearanceForDice(config.appearance, selectordice[count]);
				let dicemesh = await this.dicefactory.create(this.diceScene.renderer.scopedTextureCache, selectordice[count], appearance, config.diceLibrary || null);
				//cap oversized custom models at their base size in the showcase
				const preset = this.dicefactory.getPresetBySystem(selectordice[count], appearance.system);
				const modifier = preset?.scaleModifier || 1;
				const showcaseNormalize = modifier > 1 ? 1 / modifier : 1;
				dicemesh.scale.set(
					Math.min(dicemesh.scale.x * 5 / columns, dicemesh.scale.x * 2 / rows) * showcaseNormalize,
					Math.min(dicemesh.scale.y * 5 / columns, dicemesh.scale.y * 2 / rows) * showcaseNormalize,
					Math.min(dicemesh.scale.z * 5 / columns, dicemesh.scale.z * 2 / rows) * showcaseNormalize
				);

				dicemesh.position.set(x * this.diceScene.display.containerWidth / columns, -(y * this.diceScene.display.containerHeight / rows), z);

				dicemesh.castShadow = this.dicefactory.shadows;

				dicemesh.userData = selectordice[count];

				this.diceList.push(dicemesh);
				this.diceScene.scene.add(dicemesh);
				count++;
			}
		}

		this.diceScene.animatedDiceDetected = this._checkForAnimatedDice();

		this.last_time = 0;
		if (this.selector.animate) {
			this.diceScene.container.style.opacity = 0;
			this.last_time = window.performance.now();
			removeTicker(this.animateSelector);
			canvas.app.ticker.add(this.animateSelector, this);
		}
		else this.diceScene.renderScene();
		setTimeout(() => {
			this.diceScene.scene.traverse(object => {
				if (object.type === 'Mesh') object.material.needsUpdate = true;
			});
		}, 2000);
	}

	animateSelector() {
		let now = window.performance.now();
		let delta = (now - this.last_time) / 1000;
		this.last_time = now;

		if (this.diceScene.container.style.opacity != '1') this.diceScene.container.style.opacity = Math.min(1, (parseFloat(this.diceScene.container.style.opacity) + 3.0 * delta));

		if (this.selector.rotate) {
			let angle_change = 0.3 * Math.PI * delta;
			for (let i = 0; i < this.diceList.length; i++) {
				this.diceList[i].rotation.y += angle_change;
				this.diceList[i].rotation.x += angle_change / 4;
				this.diceList[i].rotation.z += angle_change / 10;
			}
		}
		this.diceScene.renderScene();
	}

	findRootObject(object) {
		if (object.hasOwnProperty("shape"))
			return object;
		else if (object.parent)
			return this.findRootObject(object.parent);
		else
			return null;
	}

	findShowcaseDie(pos) {
		this.diceScene.raycaster.setFromCamera(pos, this.diceScene.camera);
		const intersects = this.diceScene.raycaster.intersectObjects([...this.diceList, ...this.deadDiceList], true);
		if (intersects.length) {
			return intersects[0];
		}
		else
			return null;
	}

	_checkForAnimatedDice() {
		let animatedDiceDetected = false;
		for (let i = 0, len = this.diceList.length; i < len; ++i) {
			let dicemesh = this.diceList[i];
			if (!dicemesh) continue;
			dicemesh.traverse(obj => {
				if (obj.mixer || obj.material?.mixer) {
					animatedDiceDetected = true;
				}
			});
		}
		return animatedDiceDetected;
	}
}
