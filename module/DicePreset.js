import { ShaderUtils } from './ShaderUtils';
import { AssetsLoader } from './AssetsLoader.js';
export class DicePreset {

	constructor(type, shape = '') {

		shape = shape || type;

		this.type = type;
		this.term = 'Die';
		this.shape = shape || type;
		this.scale = 1;
		this.labels = [];
		this.valueMap = null;
		this.values = [];
		this.bumps = [];
		this.emissiveMaps = [];
		this.emissive = 0x000000;
		this.emissiveIntensity = 1;
		this.mass = 300;
		this.inertia = 13;
		this.geometry = null;
		this.model = null;
		this.system = 'standard';
		this._diceSystem = null;
		this.modelLoaded = false;
		this.modelLoading = false;
		this.modelFile = null;
		this.internalAdd = false;
		this.atlas = null;

		//todo : check if this is useful
		this.appearance = {
			labelColor: "#FFFFFF",
			diceColor: "#000000",
			outlineColor: "#000000",
			edgeColor: "#000000",
			texture: "none",
			material: "auto",
			font: "auto",
			colorset: "custom"
		};
	}

	set diceSystem(system) {
		this._diceSystem = system;
	}

	get diceSystem() {
		return this._diceSystem;
	}

	get systemSettings() {
		return this.diceSystem.getSettingsByDiceType(this.type);
	}

	setValues(min = 1, max = 20, step = 1) {
		this.values = this.range(min, max, step);
		if (min < 1)
			this.setValueMap(min, max, step);
	}

	setValueMap(min, max, step) {
		let map = {};
		let count = 1;
		for (let i = min; i <= max; i += step) {
			map[i] = count;
			count++;
		}
		this.valueMap = map;
	}

	registerFaces(faces) {
		// Faces is an object with keys: 'labels', 'bumps', and 'emissiveMaps'
		// Each key points to another object with keys as the texture names and values as the loaded textures
		for (let type of ['labels', 'bumps', 'emissiveMaps']) {
			if (faces[type] && Object.keys(faces[type]).length > 0) {
				let tab = [];
	
				tab.push(''); //No one knows anymore why we need an empty line
				if (!["d2", "d10"].includes(this.shape)) tab.push(''); //But even less people know why we need two empty lines except for d2 and d10
	
				if (this.shape == 'd4') {
					// For d4, specific layout is needed
					const textures = Object.values(faces[type]); // Convert object to array of textures
					let a = textures[0];
					let b = textures[1];
					let c = textures[2];
					let d = textures[3];
	
					tab = [
						[[], [0, 0, 0], [b, d, c], [a, c, d], [b, a, d], [a, b, c]],
						[[], [0, 0, 0], [b, c, d], [c, a, d], [b, d, a], [c, b, a]],
						[[], [0, 0, 0], [d, c, b], [c, d, a], [d, b, a], [c, a, b]],
						[[], [0, 0, 0], [d, b, c], [a, d, c], [d, a, b], [a, c, b]]
					];
				} else {
					// For other shapes, just flatten the object values into an array
					Array.prototype.push.apply(tab, Object.values(faces[type]));
				}
	
				// Assign the prepared tab array to the corresponding property of the object
				switch (type) {
					case "labels":
						this.labels = tab;
						break;
					case "bumps":
						this.bumps = tab;
						break;
					case "emissiveMaps":
						this.emissiveMaps = tab;
						break;
				}
			}
		}
	}
	

	setLabels(labels) {
		this.labels = labels;
		this.unloadModel();
	}

	setBumpMaps(bumps) {
		this.bumps = bumps;
		this.unloadModel();
	}

	setEmissiveMaps(emissiveMaps) {
		this.emissiveMaps = emissiveMaps;
		this.unloadModel();
	}

	setAtlas(atlas) {
		this.atlas = atlas;
		this.unloadModel();
	}

	unloadModel() {
		this.modelLoaded = false;
		this.modelLoading = false;
	}

	loadTextures() {
        if (!this.modelLoaded && this.modelLoading === false) {
            this.modelLoading = new Promise(async (resolve, reject) => {
                try {
                    const assetsLoader = new AssetsLoader();
                    let allTextures = {};

                    if (this.atlas) {
                        // Load the atlas, which will be checked first for each texture.
                        let loadedAtlasTextures = await assetsLoader.load(this.atlas);
						loadedAtlasTextures = loadedAtlasTextures[this.atlas];

                        // Process each texture type, attempting to use the atlas first, then falling back to URLs.
                        allTextures['labels'] = await this.loadTextureType(this.labels, loadedAtlasTextures, assetsLoader);
                        if (this.bumps) {
                            allTextures['bumps'] = await this.loadTextureType(this.bumps, loadedAtlasTextures, assetsLoader);
                        }
                        if (this.emissiveMaps) {
                            allTextures['emissiveMaps'] = await this.loadTextureType(this.emissiveMaps, loadedAtlasTextures, assetsLoader);
                        }
                    } else {
                        // Load each texture type from URLs as no atlas is specified.
                        allTextures['labels'] = await this.loadTextureType(this.labels, {}, assetsLoader);
                        if (this.bumps) {
                            allTextures['bumps'] = await this.loadTextureType(this.bumps, {}, assetsLoader);
                        }
                        if (this.emissiveMaps) {
                            allTextures['emissiveMaps'] = await this.loadTextureType(this.emissiveMaps, {}, assetsLoader);
                        }
                    }

                    // Register textures based on type.
                    this.registerFaces(allTextures);

                    this.modelLoaded = true;
                    resolve();
                } catch (error) {
                    console.error("[Dice So Nice] Error loading textures:", error);
                    reject(error);
                }
            });
        }
        return this.modelLoading;
    }

    // Helper function to load textures by type, checking the atlas first, then falling back to direct URLs.
    async loadTextureType(textureList, loadedAtlasTextures, assetsLoader) {
		const textureMap = [];
		const imageRegex = /\.(png|jpg|jpeg|gif|webp)$/i;
		
		for (let i = 0; i < textureList.length; i++) {
			const texture = textureList[i];
	
			if (!texture || !texture.match(imageRegex)) {
				// If the entry is not an image, handle it as a string directly.
				textureMap[i] = texture;
			} else if (loadedAtlasTextures[texture]) {
				// If the texture is found in the atlas (without the file extension)
				textureMap[i] = loadedAtlasTextures[texture];
			} else {
				// If the texture is not found in the atlas, try to load from the URL
				const loadedTexture = await assetsLoader.load([texture]);
				// Extract the texture directly from the returned object, assuming it has been flattened
				textureMap[i] = loadedTexture[texture];
			}
		}
		return textureMap;
	}
	

	range(start, stop, step = 1) {
		var a = [start], b = start;
		while (b < stop) {
			a.push(b += step || 1);
		}
		return a;
	}

	setModel(file) {
		this.modelFile = file;
		this.modelLoaded = false;
	}

	//loader is a GLTFLoader instance
	loadModel(loader = null) {
		// Load a glTF resource
		if (!this.modelLoaded && this.modelLoading === false) {
			this.modelLoading = new Promise((resolve, reject) => {
				loader.load(this.modelFile, gltf => {
					gltf.scene.traverse(function (node) {
						if (node.isMesh) {
							if (node.userData && node.userData.hasOwnProperty('castShadow'))
								node.castShadow = node.userData.castShadow;
							else
								node.castShadow = true;
							node.material.onBeforeCompile = ShaderUtils.applyDiceSoNiceShader;
							const anisotropy = game.dice3d.box.anisotropy;
							if (node.material.map !== null)
								node.material.map.anisotropy = anisotropy;

							if (node.material.normalMap !== null)
								node.material.normalMap.anisotropy = anisotropy;

							if (node.material.emissiveMap !== null)
								node.material.emissiveMap.anisotropy = anisotropy;

							if (node.material.roughnessMap !== null)
								node.material.roughnessMap.anisotropy = anisotropy;

							if (node.material.metalnessMap !== null)
								node.material.metalnessMap.anisotropy = anisotropy;
							node.layers.enableAll();

							//deprecated shader hook
							Hooks.callAll("diceSoNiceOnMaterialReady", node.material, null);
						}
					});
					this.model = gltf;
					this.modelLoaded = true;
					Hooks.callAll("diceSoNiceModelLoaded", this);
					resolve(gltf);
				});
			});
		}
		return this.modelLoading;
	}
}