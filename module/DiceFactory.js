import {DicePreset} from './DicePreset.js';
import {BASE_PRESETS_LIST, EXTRA_PRESETS_LIST} from './DiceDefaultPresets.js';
import {DiceColors, DICE_SCALE, COLORSETS} from './DiceColors.js';
import {DICE_MODELS} from './DiceModels.js';
import {DiceSystem} from './DiceSystem.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ShaderUtils } from './ShaderUtils';
import PhysicsWorker from 'web-worker:./web-workers/PhysicsWorker.js';
import WebworkerPromise from 'webworker-promise';

import {
	MixOperation,
	AddOperation,
	AnimationMixer,
	Mesh,
	Color,
	Vector3,
	MeshPhongMaterial,
	MeshStandardMaterial,
	MeshLambertMaterial,
	MeshPhysicalMaterial,
	CanvasTexture,
	SRGBColorSpace,
	BufferGeometryLoader
} from 'three';

export class DiceFactory {

	constructor() {
		this.geometries = {};

		this.physicsWorker = new WebworkerPromise(new PhysicsWorker());

		this.baseScale = 50;

		this.preferredSystem = "standard";
		this.preferredColorset = "custom";

		this.cache_hits = 0;
		this.cache_misses = 0;

		this.realisticLighting = true;

		this.loaderGLTF = new GLTFLoader();
		this.loaderDRACO = new DRACOLoader();
		this.loaderDRACO.setDecoderPath('modules/dice-so-nice/libs/');
		this.loaderDRACO.setDecoderConfig({type: 'wasm'});
		this.loaderGLTF.setDRACOLoader(this.loaderDRACO);
		this.fontLoadingPromises = [];

		this.baseMaterialCache = {};

		this.systems = new Map();
		this.systems.set("standard", new DiceSystem("standard", game.i18n.localize("DICESONICE.System.Standard"), "default"));
		this.systems.set("spectrum", new DiceSystem("spectrum", game.i18n.localize("DICESONICE.System.SpectrumDice"), "default", "Dice So Nice!"));
		this.systems.set("foundry_vtt", new DiceSystem("foundry_vtt", game.i18n.localize("DICESONICE.System.FoundryVTT"), "default", "Dice So Nice!"));
		this.systems.set("dot", new DiceSystem("dot", game.i18n.localize("DICESONICE.System.Dot"), "default", "Dice So Nice!"));
		this.systems.set("dot_b", new DiceSystem("dot_b", game.i18n.localize("DICESONICE.System.DotBlack"), "default", "Dice So Nice!"));

		//load all the systems
		for(let [id, system] of this.systems){
			system.loadSettings();
		}
		
		BASE_PRESETS_LIST.forEach((preset) => {
			this.register(preset);
		});
		
		EXTRA_PRESETS_LIST.forEach((data) => {
			this.addDicePreset(data);
		});

		for(let i in CONFIG.Dice.terms){
			let term = CONFIG.Dice.terms[i];
			//If this is not a core dice type
			if(![foundry.dice.terms.Coin, foundry.dice.terms.FateDie, foundry.dice.terms.Die].includes(term)){
				let objTerm = new term({});
				if([2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24, 30].includes(objTerm.faces)){
					this.internalAddDicePreset(objTerm);
				}
			}
		}
	}

	initializeMaterials(){
		if(this.realisticLighting){
			this.material_options = {
				'plastic': {
					'type':"standard",
					'options':{
						metalness: 0,
						roughness: 0.6,
						envMapIntensity:1
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_fingerprint",
						envMap : true
					}
				},
				'metal': {
					'type':'standard',
					'options': {
						roughness: 0.6,
						metalness: 1
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_metal",
						envMap : true
					}
				},
				'wood': {
					'type':'standard',
					'options': {
						roughness:1,
						metalness:0
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_wood",
						envMap : true
					}
				},
				'glass': {
					'type':'standard',
					'options': {
						roughness: 0.3,
						metalness: 0
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_fingerprint",
						envMap : true
					}
				},
				'chrome': {
					'type':'standard',
					'options': {
						metalness: 1,
						roughness: 0.1
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_fingerprint",
						envMap : true
					}
				},
				'pristine': {
					'type':'physical',
					'options': {
						metalness: 0,
						roughness: 0.8,
						envMapIntensity:1,
						clearcoat: 1,
						clearcoatRoughness: 0.9
					},
					'scopedOptions':{
						envMap : true
					}
				},
				'iridescent': {
					'type':'physical',
					'options': {
						metalness: 1,
						roughness: 0.2,
						iridescence: 1,
						iridescenceIOR: 1.8,
						iridescenceThicknessRange: [485,515]
					},
					'scopedOptions':{
						envMap : true
					}
				},
				'stone': {
					'type':'standard',
					'options': {
						metalness: 0,
						roughness: 1
					},
					'scopedOptions':{
						roughnessMap : "roughnessMap_stone",
						envMap : true
					}
				}
			}
		} else {
			this.material_options = {
				'plastic': {
					'type':"phong",
					'options':{
						specular: 0xffffff,
						color: 0xb5b5b5,
						shininess: 3,
						flatShading: true
					}
				},
				'metal': {
					'type':'standard',
					'options': {
						color: 0xdddddd,
						emissive:0x111111,
						roughness: 0.6,
						metalness: 1,
						envMapIntensity:2
					},
					'scopedOptions':{
						envMap:true
					}
				},
				'wood': {
					'type':'phong',
					'options': {
						specular: 0xffffff,
						color: 0xb5b5b5,
						shininess: 1,
						flatShading: true
					}
				},
				'glass': {
					'type':'phong',
					'options': {
						specular: 0xffffff,
						color: 0xb5b5b5,
						shininess: 0.3,
						reflectivity:0.1,
						combine:MixOperation
					},
					'scopedOptions':{
						envMap:true
					}
				},
				'chrome': {
					'type':'phong',
					'options': {
						specular: 0xffffff,
						color: 0xb5b5b5,
						shininess: 1,
						reflectivity:0.7,
						combine:AddOperation
					},
					'scopedOptions':{
						envMap:true
					}
				},
				//no difference with plastic without advanced ligthing
				'pristine': {
					'type':'phong',
					'options':{
						specular: 0xffffff,
						color: 0xb5b5b5,
						shininess: 3,
						flatShading: true
					}
				},
				//not possible without advanced ligthing
				'iridescent': {
					'type':'standard',
					'options': {
						color: 0xdddddd,
						emissive:0x111111,
						roughness: 0.2,
						metalness: 1,
						envMapIntensity:2
					},
					'scopedOptions':{
						envMap:true
					}
				},
				'stone': {
					'type':'lambert',
					'options': {
						color: 0xb5b5b5,
						reflectivity:0.01
					},
					'scopedOptions':{
						envMap:true
					}
				}
			}
		}
	}

	setScale(scale){
		this.baseScale = scale;
	}

	setQualitySettings(config){
		this.realisticLighting = config.bumpMapping;
		this.aa = config.antialiasing;
		this.glow = config.glow;
		this.useHighDPI = config.useHighDPI;
		this.shadows = config.shadowQuality != "none";
		this.shadowQuality = config.shadowQuality;
	}

	register(diceobj) {
		//If it is added to standard, it can be from automated system detecting DiceTerm, or the basic dice list. In those case, the internalAdd preorperty is set to true
		//Everything should exist in the standard system
		//We check to see if there's already this Dice DONOMINATOR in the standard system
		const hasDice = this.systems.get("standard").dice.has(diceobj.type);

		//If it exists in the standard system, and it was added there by the automated system, we want to override and load it
		if(hasDice && (this.systems.get("standard").dice.get(diceobj.type).internalAdd || diceobj.internalAdd)){
			this.systems.get("standard").dice.set(diceobj.type, diceobj);
			if(diceobj.modelFile){
				diceobj.loadModel(this.loaderGLTF);
			} else {
				diceobj.loadTextures();
			}
		}
		if(diceobj.system == "standard"){
			//If we're adding to the standard system directly, we only do it if it didn't exist previously
			if(!hasDice){
				this.systems.get(diceobj.system).dice.set(diceobj.type, diceobj);
			}	
		} else {
			//If for some reasons, we try to register a dice type that doesnt exist on the standard system, we add it there first.
			//This should not happen because of internalAddDicePreset but I'm only 95% sure.
			if(!hasDice){
				this.systems.get("standard").dice.set(diceobj.type, diceobj);
				if(diceobj.modelFile){
					diceobj.loadModel(this.loaderGLTF);
				} else {
					diceobj.loadTextures();
				}
			}
			//Then we add it to its own system. No need to load it, that will be taken care of automatically
			this.systems.get(diceobj.system).dice.set(diceobj.type, diceobj);
		}
	}

	async preloadPresets(waitForLoad = true, userID = null, config = {}){
		let activePresets = [];
		const preloadPresetsByUser = (user) => {
			let appearance = user.getFlag("dice-so-nice", "appearance") ? foundry.utils.duplicate(user.getFlag("dice-so-nice", "appearance")) : null;
			if(!appearance){
				appearance = {global:{}};
				if(this.preferredSystem != "standard")
					appearance.global.system = this.preferredSystem;
				if(this.preferredColorset != "custom")
					appearance.global.colorset = this.preferredColorset;
			}
			//load basic model
			this.systems.get("standard").dice.forEach((obj) =>{
				activePresets.push(obj);
			});
			foundry.utils.mergeObject(appearance, config,{performDeletions:true});
			if(!foundry.utils.isEmpty(appearance)){
				for (let scope in appearance) {
					if (appearance.hasOwnProperty(scope)) {
						if(scope != "global")
							activePresets.push(this.getPresetBySystem(scope, appearance[scope].system));
						else if(this.systems.has(appearance[scope].system)){
							this.systems.get(appearance[scope].system).dice.forEach((obj) =>{
								activePresets.push(obj);
							});
						}
					}
				}
			}
		};
		if(userID)
			preloadPresetsByUser(game.users.get(userID));
		else
        	game.users.forEach((user) =>{
				preloadPresetsByUser(user);
			});
        //remove duplicate
        activePresets = activePresets.filter((v, i, a) => a.indexOf(v) === i);
		let promiseArray = [];
		activePresets.forEach((preset)=>{
			if(preset){
				if(preset.modelFile){
					//Custom 3D model
					promiseArray.push(preset.loadModel(this.loaderGLTF));
				} else {
					//Classic 3D model
					promiseArray.push(preset.loadTextures());
				}
			}
		});

		if(waitForLoad)
			await Promise.all(promiseArray);
	}

	//{id: 'standard', name: game.i18n.localize("DICESONICE.System.Standard")}
	//Internal use, legacy
	//See dice3d.addSystem for public API
	addSystem(system, mode="default"){
		if(system.constructor.name === 'DiceSystem'){ //note: do not use instanceof, it breaks on The Forge
			this.systems.set(system.id, system);
			mode = system.mode;
		} else {
			system = new DiceSystem(system.id, system.name, mode, system.group);
			this.systems.set(system.id, system);
			
		}
		system.loadSettings();
		if(mode != "default" && this.preferredSystem == "standard")
			this.preferredSystem = system.id;
	}

	//{type:"",labels:[],system:""}
	//Should have been called "addDicePresetFromModel" but ¯\_(ツ)_/¯
	addDicePreset(dice, shape = null){
		let model = this.systems.get("standard").dice.get(dice.type);
		if(!model || !model.internalAdd){
			if(!shape)
				shape = dice.type;
			model = this.systems.get("standard").dice.get(shape);
		}
		let preset = new DicePreset(dice.type, model.shape);
		let denominator = dice.type.substring(1,dice.type.length);

		preset.term = isNaN(denominator) ? CONFIG.Dice.terms[denominator].name : "Die";
		
		preset.setLabels(dice.labels);
		preset.setModel(dice.modelFile);
		if(dice.values){
			if(dice.values.min == undefined)
				dice.values.min = 1;
			if(dice.values.max == undefined)
				dice.values.max = model.values.length;
			if(dice.values.step == undefined)
				dice.values.step = 1;
			preset.setValues(dice.values.min,dice.values.max,dice.values.step);
		} else {
			preset.values = model.values;
			preset.valueMap = model.valueMap;
		}
		if(dice.valueMap){
			preset.valueMap = dice.valueMap;
		}
		preset.mass = model.mass;
		preset.scale = model.scale;
		preset.inertia = model.inertia;
		preset.system = dice.system;
		preset.font = dice.font;
		preset.fontScale = dice.fontScale || null;
		preset.colorset = dice.colorset || null;
		//If it overrides an existing model that isn't a numbered die, set a font scale to prevent undesired fontScale from previous model
		if(!preset.fontScale && !["d2","d4","d6","d8","d10","d12","d14","d16","d20","d24","d30","d100"].includes(dice.type) && this.systems.get("standard").dice.has(dice.type))
			preset.fontScale = DICE_SCALE[shape];
		
		if(dice.bumpMaps && dice.bumpMaps.length)
			preset.setBumpMaps(dice.bumpMaps);

		if(dice.emissiveMaps && dice.emissiveMaps.length)
			preset.setEmissiveMaps(dice.emissiveMaps);

		if(dice.emissive)
			preset.emissive = dice.emissive;

		if(dice.emissiveIntensity)
			preset.emissiveIntensity = dice.emissiveIntensity;

		if(dice.atlas)
			preset.atlas = dice.atlas;

		this.register(preset);

		if(dice.font && !foundry.applications.settings.menus.FontConfig.getAvailableFonts().includes(dice.font)){
			this.fontLoadingPromises.push(foundry.applications.settings.menus.FontConfig.loadFont(dice.font,{editor:false,fonts:[]}));
		}
	}

	//Is called when trying to create a DicePreset by guessing its faces from the CONFIG entries
	internalAddDicePreset(diceobj){
		let shape = "d";
		let fakeShape = [3,5,7];
		if(fakeShape.includes(diceobj.faces))
			shape += (diceobj.faces*2);
		else
			shape += diceobj.faces;
		let type = "d" + diceobj.constructor.DENOMINATION;
		let model = this.systems.get("standard").dice.get(shape);
		let preset = new DicePreset(type, model.shape);
		preset.term = diceobj.constructor.name;
		let labels = [];
		for(let i = 1;i<= diceobj.faces;i++){
			labels.push(diceobj.getResultLabel({result:i}));
		}
		preset.setLabels(labels);
		preset.setValues(1,diceobj.faces);
		preset.mass = model.mass;
		preset.inertia = model.inertia;
		preset.scale = model.scale;
		preset.internalAdd = true;
		this.register(preset);
	}

	disposeCachedMaterials(type = null){
		for (const material in this.baseMaterialCache) {
			if(type == null || material.substring(0,type.length) == type){
				if(this.baseMaterialCache[material].map instanceof CanvasTexture)
					this.baseMaterialCache[material].map.dispose();
				if(this.baseMaterialCache[material].bumpMap && this.baseMaterialCache[material].bumpMap instanceof CanvasTexture)
					this.baseMaterialCache[material].bumpMap.dispose();
				if(this.baseMaterialCache[material].emissiveMap && this.baseMaterialCache[material].emissiveMap instanceof CanvasTexture)
					this.baseMaterialCache[material].emissiveMap.dispose();
				this.baseMaterialCache[material].dispose();
				delete this.baseMaterialCache[material];
			}
		}
	}

	//Stripped version from the Foundry Core library to avoid reloading fonts
	async _loadFonts(){
		const timeout = new Promise(resolve => setTimeout(resolve, 4500));
		const ready = Promise.all(this.fontLoadingPromises).then(() => document.fonts.ready);
		this.fontLoadingPromises = [];
		await Promise.race([ready, timeout]);
	}

	get(type) {
		return this.getPresetBySystem(type);
	}

	getPresetBySystem(type, system = "standard"){
		let model = this.systems.get("standard").dice.get(type);
		if(!model)
			return null;
		let diceobj = null;
		if(system != "standard"){
			if(this.systems.has(system)){
				// If it exists, we look for a similar shape
				diceobj = this.systems.get(system).dice.get(type)?.shape == model.shape ? this.systems.get(system).dice.get(type) : null;
				if(!diceobj && !['Coin', 'FateDie', 'Die'].includes(model.term)){
					//If it doesn't exist and is not a core DiceTerm, we look for a similar shape and values
					if(!model.colorset)
						diceobj = this.systems.get(system).getDiceByShapeAndValues(model.shape, model.values);
					else
						diceobj = null;
				}
			}
		}

		if(!diceobj){
			diceobj = this.systems.get("standard").dice.get(type);
		}
		return diceobj;
	}

	async create(scopedTextureCache, type, appearance) {
		let diceobj = this.getPresetBySystem(type, appearance.system);
		if(diceobj.model && appearance.isGhost){
			diceobj = this.getPresetBySystem(type, "standard");
		}
		let scopedScale = scopedTextureCache.type == "board" ? this.baseScale : 60;
		if (!diceobj) return null;
		let dicemesh;
		
		let geom = this.geometries[type+scopedScale];
		if(!geom) {
			geom = await this.createGeometry(diceobj.shape, diceobj.scale, scopedScale);
			this.geometries[type+scopedScale] = geom;
		}
		if (!geom) return null;

		// If we're on the board, we also create the shape in the physics worker
		if(scopedTextureCache.type == "board"){
			await this.physicsWorker.exec("createShape", { type:diceobj.shape, radius:diceobj.scale * scopedScale });
		}

		if(diceobj.model){
			dicemesh = diceobj.model.scene.children[0].clone();
			let scale = scopedScale/100;
			dicemesh.scale.set(scale,scale,scale);
			if(!dicemesh.geometry)
				dicemesh.geometry = {};
			if(diceobj.model.animations.length>0){
				dicemesh.mixer = new AnimationMixer(dicemesh);
				dicemesh.mixer.clipAction(diceobj.model.animations[0]).play();
			}

			//for each mesh, we need to clone the material, pass it to the system for optional processing and then cache it in the baseMaterialCache

			//first, we get all the different materials
			const materialList = new Set();
			dicemesh.traverse((child) => {
				if(child.isMesh) {
					materialList.add(child.material);
				}
			});

			//then we process each material or get the cached one
			for(let uniqueMaterial of materialList){
				let material;
				let baseMaterialCacheString = scopedTextureCache.type+type+appearance.system+uniqueMaterial.uuid+this.systems.get(appearance.system).getCacheString(appearance.systemSettings);
				if(this.baseMaterialCache[baseMaterialCacheString]) {
					material = this.baseMaterialCache[baseMaterialCacheString];
				} else {
					material = uniqueMaterial.clone();
					material = this.systems.get(appearance.system).processMaterial(type, material, appearance);
					material.onBeforeCompile = ShaderUtils.applyDiceSoNiceShader;

					if(!this.realisticLighting){
						material.envMap = scopedTextureCache.textureCube;
					}

					//finally, we cache the material
					this.baseMaterialCache[baseMaterialCacheString] = material;
				}
				//replace the original material with the processed based on the model material uuid
				dicemesh.traverse((child) => {
					if(child.isMesh) {
						if(child.material.uuid == uniqueMaterial.uuid){
							child.material = material;
						}
					}
				});
			}
		}else{
			let materialData = this.generateMaterialData(diceobj, appearance);

			let baseMaterialCacheString = scopedTextureCache.type+type+materialData.cacheString+this.systems.get(appearance.system).getCacheString(appearance.systemSettings);
			let material;
			if(this.baseMaterialCache[baseMaterialCacheString]){
				material = this.baseMaterialCache[baseMaterialCacheString];
			}
			else {
				material = this.createMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData);
				//send to the system for processing
				material = this.systems.get(appearance.system).processMaterial(type, material, appearance);
				material.onBeforeCompile = ShaderUtils.applyDiceSoNiceShader;
			}
				
			dicemesh = new Mesh(geom, material);

			//TODO: Find if this entire block is still needed
			//I think not
			if (diceobj.color) {
				dicemesh.material[0].color = new Color(diceobj.color);
				if(this.realisticLighting)
					dicemesh.material[0].color.convertLinearToSRGB();
				//dicemesh.material[0].emissive = new Color(diceobj.color);
				dicemesh.material[0].emissiveIntensity = diceobj.emissiveIntensity ? diceobj.emissiveIntensity : 1;
				dicemesh.material[0].needsUpdate = true;
				console.log("[Dice So Nice][Debug] If you see this message, please report it to the module author <3");
			}
			dicemesh.layers.enableAll();
		}

		//Because of an orientation change in cannon-es for the Cylinder shape, we need to rotate the mesh for the d2
		//https://github.com/pmndrs/cannon-es/pull/30
		if(diceobj.shape == "d2")
			dicemesh.lookAt(new Vector3(0,-1,0));
		
		dicemesh.result = null;
		dicemesh.shape = diceobj.shape;
		const that=dicemesh;
		dicemesh.getValue = async () => {
			const result = await this.physicsWorker.exec('getDiceValue', that.id);
			return result;
		};

		return dicemesh;
	}

	createMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData) {
		if(this.baseMaterialCache[baseMaterialCacheString])
			return this.baseMaterialCache[baseMaterialCacheString];

		let labels = diceobj.labels;
		if (diceobj.shape == 'd4') {
			labels = diceobj.labels[0];
		}
		//If the texture is an array of texture (for random face texture), we look at the first element to determine the faces material and the edge texture
		let dice_texture = Array.isArray(materialData.texture) ? materialData.texture[0] : materialData.texture;

		var mat;
		let materialSelected = this.material_options[materialData.material] ? this.material_options[materialData.material] : this.material_options["plastic"];
		if(!this.realisticLighting){
			delete materialSelected.roughnessMap;
		}
		switch(materialSelected.type){
			case "phong":
				mat = new MeshPhongMaterial(materialSelected.options);
				break;
			case "standard":
				mat = new MeshStandardMaterial(materialSelected.options);
				break;
			case "lambert":
				mat = new MeshLambertMaterial(materialSelected.options);
				break;
			case "physical":
				mat = new MeshPhysicalMaterial(materialSelected.options);
				break;
			default: //plastic
				mat = new MeshPhongMaterial(this.material_options.plastic.options);
		}
		if(materialSelected.scopedOptions){
			if(materialSelected.scopedOptions.envMap)
				mat.envMap = scopedTextureCache.textureCube;
			if(materialSelected.scopedOptions.roughnessMap)
				mat.roughnessMap = scopedTextureCache[materialSelected.scopedOptions.roughnessMap];
		}
		let font = {
			"type":diceobj.font,
			"scale": diceobj.fontScale ? diceobj.fontScale:null
		};
		
		if(!font.type){
			font.type = materialData.font;
		}
		if(!font.scale){
			if(materialData.fontScale[diceobj.type])
				font.scale = materialData.fontScale[diceobj.type];
			else{
				font.scale = DICE_SCALE[diceobj.shape];
			}	
		}

		let canvas = document.createElement("canvas");
		let context = canvas.getContext("2d", {alpha: true});
		context.globalAlpha = 0;

		let canvasBump = document.createElement("canvas");
		let contextBump = canvasBump.getContext("2d", {alpha: true});
		contextBump.globalAlpha = 0;

		let canvasEmissive = document.createElement("canvas");
		let contextEmissive = canvasEmissive.getContext("2d");
		
		let labelsTotal = labels.length;
		let isHeritedFromShape = ["d3","d5","d7"].includes(diceobj.type) || (diceobj.type == "df"&&diceobj.shape == "d6");
		if(isHeritedFromShape){
			labelsTotal = labelsTotal*2 -2;
			if(diceobj.shape == "d2" || diceobj.shape == "d10")
				labelsTotal += 1;
		}

		let texturesPerLine = Math.ceil(Math.sqrt(labelsTotal));
		let sizeTexture = 256;
		let ts = this.calc_texture_size(Math.sqrt(labelsTotal)*sizeTexture, true);
		
		canvas.width = canvas.height = canvasBump.width = canvasBump.height = canvasEmissive.width = canvasEmissive.height = ts;
		let x = 0;
		let y = 0;
		let texturesOnThisLine = 0;
		for (var i = 0; i < labels.length; ++i) {
			if(texturesOnThisLine == texturesPerLine){
				y += sizeTexture;
				x = 0;
				texturesOnThisLine = 0;
			}
			if(i==0)//edge
			{
				//if the texture is fully opaque, we do not use it for edge
				let texture = {name:"none"};
				if(dice_texture.composite != "source-over")
					texture = dice_texture;
				this.createTextMaterial(context, contextBump, contextEmissive, x, y, sizeTexture, diceobj, labels, font, i, texture, materialData);
			}
			else
			{
				this.createTextMaterial(context, contextBump, contextEmissive, x, y, sizeTexture, diceobj, labels, font, i, materialData.texture, materialData);
			}
			texturesOnThisLine++;
			x += sizeTexture;
		}

		//Special dice from shape divided by 2
		//D3
		if(isHeritedFromShape){
			let startI = 2;
			//for some reason, there's an extra empty cell for all shape except d2 and d10. Should fix that at some point.
			if(diceobj.shape == "d2" || diceobj.shape == "d10")
				startI = 1;
			for(i=startI;i<labels.length;i++){
				if(texturesOnThisLine == texturesPerLine){
					y += sizeTexture;
					x = 0;
					texturesOnThisLine = 0;
				}
				this.createTextMaterial(context, contextBump, contextEmissive, x, y, sizeTexture, diceobj, labels, font, i, materialData.texture, materialData);
				texturesOnThisLine++;
				x += sizeTexture;
			}
		}


		//var img    = canvas.toDataURL("image/png");
		//document.write('<img src="'+img+'"/>');
		//generate basetexture for caching
		if(!this.baseMaterialCache[baseMaterialCacheString]){
			let texture = new CanvasTexture(canvas);
			if(this.realisticLighting)
				texture.colorSpace = SRGBColorSpace;
			texture.flipY = false;
			mat.map = texture;
			mat.map.anisotropy = game.dice3d.box.anisotropy;

			if(this.realisticLighting){
				let bumpMap = new CanvasTexture(canvasBump);
				bumpMap.flipY = false;
				mat.bumpMap = bumpMap;

				let emissiveMap = new CanvasTexture(canvasEmissive);
				if(this.realisticLighting)
					emissiveMap.colorSpace = SRGBColorSpace;
				emissiveMap.flipY = false;
				mat.emissiveMap = emissiveMap;
				mat.emissiveIntensity = diceobj.emissiveIntensity ? diceobj.emissiveIntensity:1;
				mat.emissive = new Color(diceobj.emissive);
				if(this.realisticLighting)
					mat.emissive.convertLinearToSRGB();
			}
		}

		//mat.displacementMap = mat.bumpMap;

		switch(materialData.material){
			case "chrome":
				if(this.realisticLighting)
					mat.metalnessMap = mat.bumpMap;
				break;
			case "iridescent":
				if(this.realisticLighting)
					mat.metalnessMap = mat.bumpMap;
				break;
		}
		
		mat.opacity = 1;
		mat.transparent = true;
		mat.depthTest = true;
		mat.needUpdate = true;
		mat.userData.materialData = materialData;
		mat.onBeforeCompile = ShaderUtils.applyDiceSoNiceShader;

		// deprecated shader hook
		Hooks.callAll("diceSoNiceOnMaterialReady", mat, baseMaterialCacheString);

		this.baseMaterialCache[baseMaterialCacheString] = mat;
		return mat;
	}
	createTextMaterial(context, contextBump, contextEmissive, x, y, ts, diceobj, labels, font, index, texture, materialData) {
		if (labels[index] === undefined) return null;

		let forecolor = materialData.foreground;
		let outlinecolor = materialData.outline;
		let backcolor = index > 0 ? materialData.background : materialData.edge != "" ? materialData.edge:materialData.background;

		if(Array.isArray(texture))
			texture = texture[Math.floor(Math.random() * texture.length)];
		
		let text = labels[index];
		let bump = diceobj.bumps[index];
		let emissive = diceobj.emissiveMaps[index];
		let isTexture = false;
		let margin = 1.0;

		// create color
		context.fillStyle = backcolor;
		context.fillRect(x, y, ts, ts);

		contextBump.fillStyle = "#FFFFFF";
		contextBump.fillRect(x, y, ts, ts);

		contextEmissive.fillStyle = "#000000";
		contextEmissive.fillRect(x, y, ts, ts);

		//context.rect(x, y, ts, ts);
		//context.stroke();

		//create underlying texture
		if (texture.name != '' && texture.name != 'none') {
			context.save();
			context.beginPath();
			context.rect(x,y,ts,ts);
			context.clip();
			context.globalCompositeOperation = texture.composite || 'source-over';
			context.drawImage(texture.texture.source, texture.texture.frame.x, texture.texture.frame.y, texture.texture.frame.w, texture.texture.frame.h, x, y, ts, ts);
			context.restore();
			
			if (texture.bump != '') {
				contextBump.drawImage(texture.bump.source, texture.bump.frame.x, texture.bump.frame.y, texture.bump.frame.w, texture.bump.frame.h, x, y, ts, ts);
			}
		}

		// create text
		context.globalCompositeOperation = 'source-over';
		context.textAlign = "center";
		context.textBaseline = "middle";

		contextBump.textAlign = "center";
		contextBump.textBaseline = "middle";
		contextBump.shadowColor = "#000000";
		contextBump.shadowOffsetX = 1;
		contextBump.shadowOffsetY = 1;
		contextBump.shadowBlur = 3;

		contextEmissive.textAlign = "center";
		contextEmissive.textBaseline = "middle";
		
		if (diceobj.shape != 'd4') {
			if(materialData.isGhost && labels[index] != "")
				text = "?";
			//custom texture face
			if(text.source instanceof HTMLImageElement){
				isTexture = true;
				context.drawImage(text.source, text.frame.x, text.frame.y, text.frame.w, text.frame.h, x, y, ts, ts);
				if(bump)
					contextBump.drawImage(bump.source, bump.frame.x, bump.frame.y, bump.frame.w, bump.frame.h,x,y,ts,ts);
				if(emissive)
					contextEmissive.drawImage(emissive.source, emissive.frame.x, emissive.frame.y, emissive.frame.w, emissive.frame.h,x,y,ts,ts);
			}
			else{
				let fontsize = ts / (1 + 2 * margin);
				let textstarty = (ts / 2);
				let textstartx = (ts / 2);

				if(font.scale)
					fontsize *= font.scale;

				//Needed for every fonts
				switch(diceobj.shape){
					case 'd10':
						textstarty = textstartx*1.3;
						break
					case 'd14':
						textstarty = textstartx*1.4;
						break
					case 'd16':
						textstarty = textstartx*1.4;
						break
					case 'd8':
						textstarty = textstarty*1.1;
						break;
					case 'd12':
						textstarty = textstarty*1.08;
						break;
					case 'd20':
						textstarty = textstartx*1.2;
						break;
					case 'd6':
						textstarty = textstarty*1.1;
						break;
				}

				context.font =  fontsize+ 'pt '+font.type;
				contextBump.font =  fontsize+ 'pt '+font.type;
				contextEmissive.font =  fontsize+ 'pt '+font.type;

				var lineHeight = fontsize;
				
				let textlines = text.split("\n");

				if (textlines.length > 1) {
					fontsize = fontsize / textlines.length;
					context.font =  fontsize+ 'pt '+font.type;
					contextBump.font =  fontsize+ 'pt '+font.type;
					contextEmissive.font =  fontsize+ 'pt '+font.type;

					//to find the correct text height for every possible fonts, we have no choice but to use the great (and complex) pixi method
					//First we create a PIXI.TextStyle object, to pass later to the measure method
					let pixiStyle = new PIXI.TextStyle({
						fontFamily: font.type,
						fontSize: fontsize,
						stroke: "#0000FF",
						strokeThickness: (outlinecolor != 'none' && outlinecolor != backcolor) ? 1:0
					});
					//Then we call the PIXI measureText method
					let textMetrics = PIXI.TextMetrics.measureText(textlines.join(""),pixiStyle);

					lineHeight = textMetrics.lineHeight;
					if(textlines[0]!=""){
						textstarty -= (lineHeight * textlines.length) / 2;
						//On a D12, we add a little padding because it looks better to human eyes even tho it's not really the center anymore
						if(diceobj.shape == "d12")
							textstarty = textstarty *1.08;
					}
					else
						textlines.shift();
				}

				for(let i = 0, l = textlines.length; i < l; i++){
					let textline = textlines[i].trim();

					// attempt to outline the text with a meaningful color
					if (outlinecolor != 'none' && outlinecolor != backcolor) {
						context.strokeStyle = outlinecolor;
						context.lineWidth = 5;
						context.strokeText(textlines[i], textstartx+x, textstarty+y);

						contextBump.strokeStyle = "#555555";
						contextBump.lineWidth = 5;
						contextBump.strokeText(textlines[i], textstartx+x, textstarty+y);

						contextEmissive.strokeStyle = "#999999";
						contextEmissive.lineWidth = 5;
						contextEmissive.strokeText(textlines[i], textstartx+x, textstarty+y);

						if (textline == '6' || textline == '9') {
							context.strokeText('  .', textstartx+x, textstarty+y);
							contextBump.strokeText('  .', textstartx+x, textstarty+y);
							contextEmissive.strokeText('  .', textstartx+x, textstarty+y);
						}
					}

					context.fillStyle = forecolor;
					context.fillText(textlines[i], textstartx+x, textstarty+y);

					contextBump.fillStyle = "#555555";
					contextBump.fillText(textlines[i], textstartx+x, textstarty+y);

					contextEmissive.fillStyle = "#999999";
					contextEmissive.fillText(textlines[i], textstartx+x, textstarty+y);

					if (textline == '6' || textline == '9') {
						context.fillText('  .', textstartx+x, textstarty+y);
						contextBump.fillText('  .', textstartx+x, textstarty+y);
						contextEmissive.fillText('  .', textstartx+x, textstarty+y);
					}
					textstarty += (lineHeight * 1.5);
				}
			}

		} else {

			var hw = (ts / 2);
			var hh = (ts / 2);
			let fontsize = (ts / 128 * 24);
			if(font.scale)
				fontsize *= font.scale;
			context.font =  fontsize+'pt '+font.type;
			contextBump.font =  fontsize+'pt '+font.type;
			contextEmissive.font =  fontsize+'pt '+font.type;

			//draw the numbers
			let wShift = 1;
			let hShift = 1;
			for (let i=0;i<text.length;i++) {
				if(materialData.isGhost)
					text[i] = "?";
				switch(i){
					case 0:
						hShift = 1.13;
						break;
					case 1:
						hShift=0.87;
						wShift=1.13;
						break;
					case 2:
						wShift = 0.87;
				}
				let destX = hw*wShift+x;
				let destY = (hh - ts * 0.3)*hShift+y;
				//custom texture face
				if(text[i].source instanceof HTMLImageElement){
					isTexture = true;
					let textureSize = 60 / (text[i].frame.w / ts);
					context.drawImage(text[i].source,text[i].frame.x, text[i].frame.y, text[i].frame.w, text[i].frame.h,destX-(textureSize/2),destY-(textureSize/2),textureSize,textureSize);
					//There's an issue with bump texture because they are smaller than the dice face so it causes visual glitches
					/*if(bump)
						contextBump.drawImage(text[i],0,0,text[i].width,text[i].height,destX-(textureSize/2),destY-(textureSize/2),textureSize,textureSize);*/
					if(emissive)
						contextEmissive.drawImage(text[i].source,text[i].frame.x, text[i].frame.y, text[i].frame.w, text[i].frame.h,destX-(textureSize/2),destY-(textureSize/2),textureSize,textureSize);
				}
				else{
					// attempt to outline the text with a meaningful color
					if (outlinecolor != 'none' && outlinecolor != backcolor) {
						context.strokeStyle = outlinecolor;
						
						context.lineWidth = 5;
						context.strokeText(text[i], destX, destY);

						contextBump.strokeStyle = "#555555";
						contextBump.lineWidth = 5;
						contextBump.strokeText(text[i], destX, destY);

						contextEmissive.strokeStyle = "#999999";
						contextEmissive.lineWidth = 5;
						contextEmissive.strokeText(text[i], destX, destY);
					}

					//draw label in top middle section
					context.fillStyle = forecolor;
					context.fillText(text[i], destX, destY);
					contextBump.fillStyle = "#555555";
					contextBump.fillText(text[i], destX, destY);
					contextEmissive.fillStyle = "#999999";
					contextEmissive.fillText(text[i], destX, destY);
					//var img    = canvas.toDataURL("image/png");
					//document.write('<img src="'+img+'"/>');
				}

				//rotate 1/3 for next label
				context.translate(hw+x, hh+y);
				context.rotate(Math.PI * 2 / 3);
				context.translate(-hw-x, -hh-y);

				contextBump.translate(hw+x, hh+y);
				contextBump.rotate(Math.PI * 2 / 3);
				contextBump.translate(-hw-x, -hh-y);

				contextEmissive.translate(hw+x, hh+y);
				contextEmissive.rotate(Math.PI * 2 / 3);
				contextEmissive.translate(-hw-x, -hh-y);
			}
		}
	}

	getAppearanceForDice(appearances, dicetype, dicenotation = null){
		/*
			We use either (by order of priority): 
			1) A notation appearance
			2) A flavor/notation colorset
			3) The colorset of the diceobj
			4) The colorset configured by the player for this dice type
			5) A preferred system set by a module/system (done in main.js)
			6) The global colorset of the player
		*/
		
		let settings;
		if(appearances[dicetype])
			settings = appearances[dicetype];
		else
			settings = appearances.global;

		//To keep compatibility with both older integrations and user settings, we use the DiceColor naming convention from there
		let appearance = {
			colorset: settings.colorset ? settings.colorset : appearances.global.colorset ? appearances.global.colorset : "custom",
			foreground: settings.labelColor ? settings.labelColor:appearances.global.labelColor ? appearances.global.labelColor : "#FFFFFF",
			background: settings.diceColor ? settings.diceColor:appearances.global.diceColor ? appearances.global.diceColor : "#000000",
			//outline: settings.outlineColor ? settings.outlineColor: appearances.global.outlineColor ? appearances.global.outlineColor : "",
			//edge: settings.edgeColor ? settings.edgeColor:appearances.global.edgeColor ? appearances.global.edgeColor:"",
			texture: settings.texture ? settings.texture:appearances.global.texture ? appearances.global.texture : "none",
			material: settings.material ? settings.material:appearances.global.material ? appearances.global.material : "auto",
			font: settings.font ? settings.font:appearances.global.font ? appearances.global.font : "Arial",
			system: settings.system ? settings.system:appearances.global.system ? appearances.global.system : "standard",
			systemSettings: settings.systemSettings ? settings.systemSettings:appearances.global.systemSettings ? appearances.global.systemSettings : {}
		};

		//Merge with the default systemSettings to aply default values
		if(!this.systems.has(appearance.system))
			appearance.system = "standard";

		const system = this.systems.get(appearance.system);
		const defaultSystemSettings = system.getDefaultSettings();
		foundry.utils.mergeObject(appearance.systemSettings, defaultSystemSettings, { overwrite: false });

		//Check if this dice exists for this system. If not, it means it is the one from global
		if(!system || !system.dice.has(dicetype))
			appearance.system = "standard";

		if(appearance.colorset == "custom"){
			appearance.outline = settings.outlineColor ? settings.outlineColor:"";
			appearance.edge = settings.edgeColor ? settings.edgeColor:"";
		} else {
			appearance.outline = settings.outlineColor ? settings.outlineColor: appearances.global.outlineColor ? appearances.global.outlineColor : "";
			appearance.edge = settings.edgeColor ? settings.edgeColor:appearances.global.edgeColor ? appearances.global.edgeColor:"";
		}

		if(appearance.colorset && appearance.colorset != "custom"){
			let colorsetData = DiceColors.getColorSet(appearance.colorset);
			appearance.foreground = colorsetData.foreground;
			appearance.background = colorsetData.background;
			appearance.outline = colorsetData.outline;
			appearance.edge = colorsetData.edge ? colorsetData.edge : "";
		}
		let diceobj = this.getPresetBySystem(dicetype,appearance.system);
		if(diceobj.colorset){
			let colorsetData = {...DiceColors.getColorSet(diceobj.colorset)};
			Object.entries(colorsetData).forEach((opt) => {
				if(opt[1] == "custom")
					delete colorsetData[opt[0]];
			});
			foundry.utils.mergeObject(appearance, colorsetData,{performDeletions:true});
			appearance.colorset = diceobj.colorset;
		}
		
		if(dicenotation){
			let colorset = null;

			//First we try to find a colorset
			if (dicenotation.options.colorset)
				colorset = dicenotation.options.colorset;
			else if (dicenotation.options.flavor && COLORSETS[dicenotation.options.flavor]) {
				colorset = dicenotation.options.flavor;
			} else if(dicenotation.options.appearance && dicenotation.options.appearance.colorset){
				colorset = dicenotation.options.appearance.colorset;
			}

			// If we do, we retrieve the colorset data
			if(colorset){
				let colorsetData = DiceColors.getColorSet(colorset);
				colorsetData.edge = colorsetData.edge ? colorsetData.edge : "";
				//save system and systemSettings before we overwrite them
				colorsetData.system = appearance.system;
				colorsetData.systemSettings = appearance.systemSettings;
				appearance = colorsetData;
			}

			// Then we overwrite the colorset data with the appearance to let players override the colorset default colors
			if(dicenotation.options.appearance){
				foundry.utils.mergeObject(appearance, dicenotation.options.appearance,{performDeletions:true});
			}
			if(dicenotation.options.ghost){
				appearance.isGhost = true;
			}
		}
		return appearance;
	}

	generateMaterialData(diceobj, appearance) {
		let materialData = {};
		let colorindex;

		if(appearance.texture && !appearance.texture.id)
			appearance.texture = DiceColors.getTexture(appearance.texture);

		let colorsetData = DiceColors.getColorSet(appearance.colorset);

		// ignore custom colorset with unset properties
		if(colorsetData.foreground == "custom")
			colorsetData.foreground = appearance.foreground;
		if(colorsetData.background == "custom")
			colorsetData.background = appearance.background;
		if(colorsetData.texture == "custom")
			colorsetData.texture = appearance.texture;
		if(colorsetData.material == "custom")
			colorsetData.material = appearance.material;
		if(colorsetData.font == "custom")
			colorsetData.font = appearance.font;


		// set base color first
		if (Array.isArray(appearance.background)) {

			colorindex = Math.floor(Math.random() * appearance.background.length);

			// if color list and label list are same length, treat them as a parallel list
			if (Array.isArray(appearance.foreground) && appearance.foreground.length == appearance.background.length) {
				materialData.foreground = appearance.foreground[colorindex];

				// if label list and outline list are same length, treat them as a parallel list
				if (Array.isArray(appearance.outline) && appearance.outline.length == appearance.foreground.length) {
					materialData.outline = appearance.outline[colorindex];
				}
			}
			// if texture list is same length do the same
			if (Array.isArray(appearance.texture) && appearance.texture.length == appearance.background.length) {
				materialData.texture = appearance.texture[colorindex];
			}

			//if edge list and color list are same length, treat them as a parallel list
			if (Array.isArray(appearance.edge) && appearance.edge.length == appearance.background.length) {
				materialData.edge = appearance.edge[colorindex];
			}

			materialData.background = appearance.background[colorindex];
		} else {
			materialData.background = appearance.background;
		}

		if(!materialData.edge){
			if (Array.isArray(appearance.edge)) {
				colorindex = Math.floor(Math.random() * appearance.edge.length);
				materialData.edge = appearance.edge[colorindex];
			}
			else
				materialData.edge = appearance.edge;
		}

		// if selected label color is still not set, pick one
		if(!materialData.foreground){
			if(Array.isArray(appearance.foreground)){
				colorindex = appearance.foreground[Math.floor(Math.random() * appearance.foreground.length)];

				// if label list and outline list are same length, treat them as a parallel list
				if (Array.isArray(appearance.outline) && appearance.outline.length == appearance.foreground.length) {
					materialData.outline = appearance.outline[colorindex];
				}

				materialData.foreground = appearance.foreground[colorindex];
			}
			else
				materialData.foreground = appearance.foreground;
		}

		// if selected label outline is still not set, pick one
		if (!materialData.outline){
			if(Array.isArray(appearance.outline)) {
				colorindex = appearance.outline[Math.floor(Math.random() * appearance.outline.length)];

				materialData.outline = appearance.outline[colorindex];
			} else {
				materialData.outline = appearance.outline;
			}
		}

		// same for textures list
		if(!materialData.texture){
			if (Array.isArray(appearance.texture)) {
				materialData.texture = appearance.texture[Math.floor(Math.random() * appearance.texture.length)];
			} else if(appearance.texture.name == "none"){
				//set to none/theme
				if (Array.isArray(colorsetData.texture)){
					materialData.texture = colorsetData.texture[Math.floor(Math.random() * colorsetData.texture.length)];
				} else {
					materialData.texture = colorsetData.texture;
				}
			} else {
				materialData.texture = appearance.texture;
			}
		}

		//Same for material
		let baseTexture = Array.isArray(materialData.texture) ? materialData.texture[0]:materialData.texture;

		if(appearance.material == "auto" || appearance.material == ""){
			if(colorsetData.material)
				materialData.material = colorsetData.material;
			else
				materialData.material = baseTexture.material;
		} else {
			materialData.material = appearance.material;
		}

		//for font, we priorize the dicepreset font, then custom, then coloret
		if(appearance.font == "auto"){
			if(diceobj.font){
				materialData.font = diceobj.font;
			} else {
				materialData.font = colorsetData.font;
			}
		} else {
			materialData.font = appearance.font;
		}

		if(appearance.fontScale)
			materialData.fontScale = appearance.fontScale;
		else if(diceobj.fontScale){
			materialData.fontScale = diceobj.fontScale;
		} else {
			materialData.fontScale = colorsetData.fontScale;
		}

		materialData.isGhost = appearance.isGhost?appearance.isGhost:false;

		materialData.cacheString = appearance.system+materialData.background+materialData.foreground+materialData.outline+materialData.texture.name+materialData.edge+materialData.material+materialData.font+materialData.isGhost;
		return materialData;
	}

	calc_texture_size(approx, ceil = false) {
		let size = 0;
		if(!ceil)
			size = Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
		else
			size = Math.pow(2, Math.ceil(Math.log(approx) / Math.log(2)));
		return size;
	}

	async createGeometry(type, typeScale, scopedScale) {
		const geometryTypes = [
			'd2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd14', 'd16', 'd20', 'd24', 'd30'
		];
	
		if (!geometryTypes.includes(type)) {
			throw new Error(`Invalid geometry type: ${type}`);
		}
	
		return this.loadGeometry(type, scopedScale);
	}
	
	loadGeometry(type, scopedScale) {
		const loader = new BufferGeometryLoader();
		const bufferGeometry = loader.parse(DICE_MODELS[type]);
		bufferGeometry.scale(scopedScale / 100, scopedScale / 100, scopedScale / 100);
	
		return bufferGeometry;
	}	
}
