import { DICE_MODELS } from './DiceModels.js';
import { DiceSFXManager } from './DiceSFXManager.js';
import { DiceSystem } from './DiceSystem.js';
import { SoundManager } from './SoundManager.js';
//import {GLTFExporter} from 'three/examples/jsm/loaders/exporters/GLTFExporter.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import Stats from 'stats-gl';

import {
	ACESFilmicToneMapping,
	Clock,
	Color,
	CubeTextureLoader,
	DirectionalLight,
	Euler,
	FloatType,
	Group,
	HalfFloatType,
	HemisphereLight,
	Layers,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	PCFSoftShadowMap,
	PCFShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	PMREMGenerator,
	Quaternion,
	Raycaster,
	Scene,
	ShaderMaterial,
	ShadowMaterial,
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget
} from 'three';


export class DiceBox {

	constructor(element_container, dice_factory, config) {
		this.container = element_container;
		this.dicefactory = dice_factory;
		this.config = config;
		this.speed = 1;
		this.isVisible = false;
		this.last_time = 0;
		this.running = false;
		this.allowInteractivity = false;
		this.raycaster = new Raycaster();
		this.blackColor = new Color(0, 0, 0);
		this.nbIterationsBetweenRolls = 15;

		this.display = {
			currentWidth: null,
			currentHeight: null,
			containerWidth: null,
			containerHeight: null,
			innerWidth: null,
			innerHeight: null,
			aspect: null,
			scale: null
		};

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

		//persistent dice selection set (Ctrl-click toggles), outlines via outlinePass
		this.selectedPersistentDiceIds = new Set();
		this._highlightedSelectionMeshes = new Set();

		//per-user outline passes for remote persistent dice (userId => {pass, meshes})
		this._remoteOutlinePasses = new Map();

		//visibility mode: "none", "mine", "all"
		this.persistentDiceVisibility = "all";

		//reusable scratch objects for pre-roll rotation (avoid per-frame allocations)
		this._preRollEuler = new Euler(0, 0, 0, 'XYZ');
		this._preRollDeltaQuat = new Quaternion();

		this.cameraHeight = {
			max: null,
			close: null,
			medium: null,
			far: null
		};

		this.clock = new Clock();

		this.iteration = 0;
		this.detectedCollides = [];
		this.renderer;
		this.camera;
		this.light;
		this.light_amb;
		this.desk;
		this.pane;

		this.diceList = [];
		this.deadDiceList = [];
		this.persistentDiceList = [];
		this.framerate = (1 / 60);

		this.throwingForce = "medium";
		this.immersiveDarkness = true;
		this.toneMappingExposureDefault = 1.0;

		this.selector = {
			animate: true,
			rotate: true,
			intersected: null,
			dice: []
		};
		this.showExtraDice = false;

		this.colors = {
			ambient: 0xf0f0f0,
			spotlight: 0x000000,
			ground: 0x080820
		};

		this.soundManager = new SoundManager();

		//callback for persistent dice multiplayer sync (set by Dice3D)
		this.onPersistentEvent = null;
		//throttle for move socket emission (~100ms)
		this._lastMoveEmitTime = 0;

		this.layers = {
			dice: 0,
			bloom: 1
		};

		this.bloomMaterials = {};
		this.darkMaterial = new MeshBasicMaterial({ color: 'black' });

		this.debugMode = false;
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
			let globalAnimationSpeed = game.settings.get("dice-so-nice", "globalAnimationSpeed");
			if (globalAnimationSpeed === "0")
				this.speed = this.config.speed;
			else
				this.speed = parseInt(globalAnimationSpeed, 10);
			this.throwingForce = this.config.throwingForce;
			this.immersiveDarkness = this.config.immersiveDarkness;
			this.scene = new Scene();
			if (game.dice3d.dice3dRenderers[this.config.boxType] != null) {
				this.renderer = game.dice3d.dice3dRenderers[this.config.boxType];
				this.scene.environment = this.renderer.scopedTextureCache.textureCube;
				this.scene.traverse(object => {
					if (object.type === 'Mesh') object.material.needsUpdate = true;
				});
			}
			else {
				const preserveDrawingBuffer = game.user.getFlag("dice-so-nice", "preserveDrawingBuffer") || false;
				this.renderer = new WebGLRenderer({
					antialias: false,
					alpha: true,
					powerPreference: "high-performance",
					preserveDrawingBuffer: preserveDrawingBuffer,
					logarithmicDepthBuffer: true
				});
				if (this.dicefactory.useHighDPI)
					this.renderer.setPixelRatio(window.devicePixelRatio);
				if (this.dicefactory.realisticLighting) {
					this.renderer.toneMapping = ACESFilmicToneMapping;
					this.renderer.toneMappingExposure = this.toneMappingExposureDefault;
				}
				const capabilities = this.renderer.capabilities;
				this.anisotropy = capabilities.getMaxAnisotropy() < 16 ? capabilities.getMaxAnisotropy() : 16;
				await this.loadContextScopedTextures(this.config.boxType);
				this.dicefactory.initializeMaterials();
				game.dice3d.dice3dRenderers[this.config.boxType] = this.renderer;
			}

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
				
				// append the stats container to the body of the document
				document.body.appendChild( this.stats.dom );
				
				// begin the performance monitor
				this.stats.init(this.renderer);
			}

			this.container.appendChild(this.renderer.domElement);
			this.renderer.shadowMap.enabled = this.dicefactory.shadows;
			this.renderer.shadowMap.type = this.dicefactory.shadowQuality == "high" ? PCFSoftShadowMap : PCFShadowMap;
			this.renderer.setClearColor(0x000000, 0.0);

			this.setScene(this.config.dimensions);

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
			}
			resolve();
		});
	}

	loadContextScopedTextures(type) {
		return new Promise(resolve => {
			this.renderer.scopedTextureCache = { type: type };
			if (this.dicefactory.realisticLighting) {
				let textureLoader = new TextureLoader();
				this.renderer.scopedTextureCache.roughnessMap_fingerprint = textureLoader.load('modules/dice-so-nice/textures/roughnessMap_finger.webp');
				this.renderer.scopedTextureCache.roughnessMap_wood = textureLoader.load('modules/dice-so-nice/textures/roughnessMap_wood.webp');
				this.renderer.scopedTextureCache.roughnessMap_metal = textureLoader.load('modules/dice-so-nice/textures/roughnessMap_metal.webp');
				this.renderer.scopedTextureCache.roughnessMap_stone = textureLoader.load('modules/dice-so-nice/textures/roughnessMap_stone.webp');

				//set anisotropy
				this.renderer.scopedTextureCache.roughnessMap_fingerprint.anisotropy = this.anisotropy;
				this.renderer.scopedTextureCache.roughnessMap_wood.anisotropy = this.anisotropy;
				this.renderer.scopedTextureCache.roughnessMap_metal.anisotropy = this.anisotropy;
				this.renderer.scopedTextureCache.roughnessMap_stone.anisotropy = this.anisotropy;

				this.pmremGenerator = new PMREMGenerator(this.renderer);
				this.pmremGenerator.compileEquirectangularShader();

				new HDRLoader()
					.setDataType(HalfFloatType)
					.setPath('modules/dice-so-nice/textures/equirectangular/')
					.load('blouberg_sunrise_2_1k.hdr', function (texture) {
						this.renderer.scopedTextureCache.textureCube = this.pmremGenerator.fromEquirectangular(texture).texture;
						this.renderer.scopedTextureCache.textureCube.colorSpace = SRGBColorSpace;
						this.scene.environment = this.renderer.scopedTextureCache.textureCube;
						//this.scene.background = this.renderer.scopedTextureCache.textureCube;
						texture.dispose();
						this.pmremGenerator.dispose();
						resolve();

					}.bind(this));
			} else {
				let loader = new CubeTextureLoader();
				loader.setPath('modules/dice-so-nice/textures/cubemap/');

				this.renderer.scopedTextureCache.textureCube = loader.load([
					'px.webp', 'nx.webp',
					'py.webp', 'ny.webp',
					'pz.webp', 'nz.webp'
				]);
				resolve();
			}
		});
	}

	setScene(dimensions) {
		this.display.currentWidth = this.container.clientWidth > 0 ? this.container.clientWidth : parseInt(this.container.style.width);
		this.display.currentHeight = this.container.clientHeight > 0 ? this.container.clientHeight : parseInt(this.container.style.height);

		if (dimensions) {
			this.display.containerWidth = dimensions.width;
			this.display.containerHeight = dimensions.height;
			this.display.containerMargin = dimensions.margin || null;

			if (!this.display.currentWidth || !this.display.currentHeight) {
				this.display.currentWidth = dimensions.width;
				this.display.currentHeight = dimensions.height;
				this.display.currentMargin = dimensions.margin || null;
			}
		} else {
			this.display.containerWidth = this.display.currentWidth;
			this.display.containerHeight = this.display.currentHeight;
			this.display.containerMargin = this.display.currentMargin;
		}

		this.updateInnerDimensions();

		this.display.aspect = Math.min(this.display.currentWidth / this.display.containerWidth, this.display.currentHeight / this.display.containerHeight);

		this.updateScale(this.config.scale, this.config.autoscale);

		this.renderer.setSize(this.display.currentWidth, this.display.currentHeight);

		this.cameraHeight.max = this.display.currentHeight / this.display.aspect / Math.tan(10 * Math.PI / 180);

		this.cameraHeight.medium = this.cameraHeight.max / 1.5;
		this.cameraHeight.far = this.cameraHeight.max;
		this.cameraHeight.close = this.cameraHeight.max / 2;

		if (this.camera) this.scene.remove(this.camera);
		this.camera = new PerspectiveCamera(20, this.display.currentWidth / this.display.currentHeight, 1, this.cameraHeight.max * 1.3);

		switch (this.config.boxType) {
			case "showcase":
				this.camera.position.z = this.selector.dice.length > 9 ? this.cameraHeight.far : (this.selector.dice.length < 6 ? this.cameraHeight.close : this.cameraHeight.medium);
				break;
			default:
				this.camera.position.z = this.cameraHeight.far;
		}
		this.camera.near = 10;
		this.camera.lookAt(new Vector3(0, 0, 0));

		const maxwidth = Math.max(this.display.containerWidth / 2, this.display.containerHeight / 2);

		if (this.light) this.scene.remove(this.light);
		if (this.light_amb) this.scene.remove(this.light_amb);

		let intensity, intensity_amb;
		if (this.dicefactory.realisticLighting) { //advanced lighting
			intensity = 1.5;
			intensity_amb = 4.0;
		} else {
			this.colors.spotlight = 0xffffff;
			this.colors.ambient = 0xffffff;
			if (this.config.boxType == "board") {
				intensity = 0.2;
				intensity_amb = 8.0;
			} else {
				intensity = 0.2;
				intensity_amb = 8.0;
			}
		}


		this.light_amb = new HemisphereLight(this.colors.ambient, this.colors.ground, intensity_amb);
		this.scene.add(this.light_amb);

		this.light = new DirectionalLight(this.colors.spotlight, intensity);
		if (this.config.boxType == "board")
			this.light.position.set(-this.display.containerWidth / 20, this.display.containerHeight / 20, maxwidth / 2);
		else
			this.light.position.set(0, this.display.containerHeight / 20, maxwidth / 2);
		this.light.target.position.set(0, 0, 0);
		this.light.distance = 0;
		this.light.castShadow = this.dicefactory.shadows;
		this.light.shadow.camera.near = maxwidth / 10;
		this.light.shadow.camera.far = maxwidth * 5;
		this.light.shadow.camera.fov = 50;
		this.light.shadow.bias = -0.0001;
		const shadowMapSize = this.dicefactory.shadowQuality == "high" ? 2048 : 1024;
		this.light.shadow.mapSize.width = shadowMapSize;
		this.light.shadow.mapSize.height = shadowMapSize;

		const halfWidth  = this.display.containerWidth  / 2;
        const halfHeight = this.display.containerHeight / 2;
        const d = Math.max(halfWidth, halfHeight) * 1.05;
		
		this.light.shadow.camera.left = - d * 2;
		this.light.shadow.camera.right = d * 2;
		this.light.shadow.camera.top = d;
		this.light.shadow.camera.bottom = - d;
		this.scene.add(this.light);

		if (this.desk)
			this.scene.remove(this.desk);

		let shadowplane = new ShadowMaterial();
		shadowplane.opacity = 0.5;
		shadowplane.depthWrite = false;
		this.desk = new Mesh(new PlaneGeometry(this.display.containerWidth * 3, this.display.containerHeight * 3, 1, 1), shadowplane);
		this.desk.receiveShadow = this.dicefactory.shadows;
		this.desk.position.set(0, 0, -1);
		this.scene.add(this.desk);
		if (this.dicefactory.realisticLighting) {
			let renderScene = new RenderPass(this.scene, this.camera);
			const canvasSize = new Vector2(this.display.currentWidth, this.display.currentHeight);
			this.bloomPass = new UnrealBloomPass(canvasSize, game.dice3d.uniforms.bloomStrength.value, game.dice3d.uniforms.bloomRadius.value, game.dice3d.uniforms.bloomThreshold.value);
			this.bloomLayer = new Layers();
			this.bloomLayer.set(this.layers.bloom);

			// Combined gamma correction + premultiplied alpha fix.
			// After bloom blending, the gamma correction (linear -> sRGB) boosts RGB values
			// but leaves alpha in linear space. This goes against the logic of the premultiplied alpha
			// system (RGB must be <= alpha) which causes visible bloom halos on
			// compositors that strictly enforce it (e.g. Chromium on Linux Wayland).
			// We fix this by ensuring alpha >= max(R, G, B) after gamma correction.
			this.gammaPass = new ShaderPass(
				new ShaderMaterial({
					name: 'GammaCorrectionWithAlphaFixShader',
					uniforms: {
						tDiffuse: { value: null }
					},
					vertexShader: /* glsl */`
						varying vec2 vUv;
						void main() {
							vUv = uv;
							gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
						}`,
					fragmentShader: /* glsl */`
						uniform sampler2D tDiffuse;
						varying vec2 vUv;
						void main() {
							vec4 tex = texture2D( tDiffuse, vUv );
							gl_FragColor = sRGBTransferOETF( tex );
							gl_FragColor.a = max( gl_FragColor.a, max( gl_FragColor.r, max( gl_FragColor.g, gl_FragColor.b ) ) );
						}`
				})
			);

			// Add an outline pass for the outline sfx
			this.outlinePass = new OutlinePass(canvasSize, this.scene, this.camera);
			this.outlinePass.pulsePeriod = 1.5;

			let size = canvasSize.multiplyScalar(this.renderer.getPixelRatio());
			//Create a RenderTarget with high precision
			let options = {
				type: game.canvas.app.renderer.context.extensions.floatTextureLinear ? FloatType : HalfFloatType,
				samples: this.dicefactory.aa == "msaa" ? 4 : 0,
				anisotropy: this.anisotropy
			};
			//Workaround for a bug on Chrome on OSX
			if (navigator.userAgent.indexOf('Mac OS X') != -1 && navigator.userAgent.indexOf('Chrome') != -1) {
				options.stencilBuffer = true;
			}
			this.composerTarget = new WebGLRenderTarget(size.x, size.y, options);

			// This EffectComposer is in charge of rendering the Bloom/Glow effect
			this.bloomComposer = new EffectComposer(this.renderer, this.composerTarget);
			this.bloomComposer.renderToScreen = false;
			this.bloomComposer.addPass(renderScene);
			this.bloomComposer.addPass(this.bloomPass);

			//This shader will blend the bloom effect with the scene. Only the alpha from the bloom effect will be used.
			this.blendingPass = new ShaderPass(
				new ShaderMaterial({
					uniforms: {
						baseTexture: { value: null },
						bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
					},
					vertexShader: /* glsl */`
						varying vec2 vUv;
						void main() {
							vUv = uv;
							gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
						}
					`,
					fragmentShader: /* glsl */`
						uniform sampler2D baseTexture;
						uniform sampler2D bloomTexture;
						varying vec2 vUv;
						void main() {
							vec4 base_color = texture2D(baseTexture, vUv);
							vec4 bloom_color = texture2D(bloomTexture, vUv);

							float lum = 0.21 * bloom_color.r + 0.71 * bloom_color.g + 0.07 * bloom_color.b;
							gl_FragColor = vec4(base_color.rgb + bloom_color.rgb, max(base_color.a, lum));
						}
					`,
					defines: {}
				}), "baseTexture"
			);
			this.blendingPass.needsSwap = true;

			// This EffectComposer is in charge of rendering the final image
			// The blendingPass won't be rendered if no emissive textures are found during the render loop
			this.finalComposer = new EffectComposer(this.renderer, this.composerTarget);
			this.finalComposer.addPass(renderScene);
			this.finalComposer.addPass(this.outlinePass);
			this.finalComposer.addPass(this.blendingPass);

			//Software Anti-aliasing pass. Should be rendered in a linear space.
			if (this.dicefactory.aa == "smaa") {
				this.AAPass = new SMAAPass();
				this.AAPass.renderToScreen = true;
				this.finalComposer.addPass(this.AAPass);
			}

			//Convert the image to gamma space
			this.finalComposer.addPass(this.gammaPass);
		}
		this.renderScene();
	}

	async update(config) {
		this.showExtraDice = config.showExtraDice;

		this.soundManager.update({
			muteSoundSecretRolls: config.muteSoundSecretRolls,
			sounds: config.sounds,
			volume: config.volume,
			soundsSurface: config.soundsSurface
		});
		
		this.updateScale(config.scale, config.autoscale);

		this.dicefactory.setQualitySettings(config);

		let globalAnimationSpeed = game.settings.get("dice-so-nice", "globalAnimationSpeed");
		if (globalAnimationSpeed === "0")
			this.speed = parseInt(config.speed, 10);
		else
			this.speed = parseInt(globalAnimationSpeed, 10);

		this.light.castShadow = this.dicefactory.shadows;
		this.desk.receiveShadow = this.dicefactory.shadows;
		this.renderer.shadowMap.enabled = this.dicefactory.shadows;
		this.renderer.shadowMap.type = this.dicefactory.shadowQuality == "high" ? PCFSoftShadowMap : PCFShadowMap;

		await this.dicefactory.preloadPresets(true, null, config.appearance);

		this.throwingForce = config.throwingForce;
		this.immersiveDarkness = config.immersiveDarkness;
		this.scene.traverse(object => {
			if (object.type === 'Mesh') object.material.needsUpdate = true;
		});
	}

	updateBoundaries(dimensions) {
		//Note: we're currently not managing resize of width and height, only margin for physics barriers
		const newDimensions = {
			width: dimensions.width ?? this.display.containerWidth,
			height: dimensions.height ?? this.display.containerHeight,
			margin: {
				top: dimensions.margin?.top ?? this.display.containerMargin?.top ?? 0,
				bottom: dimensions.margin?.bottom ?? this.display.containerMargin?.bottom ?? 0,
				left: dimensions.margin?.left ?? this.display.containerMargin?.left ?? 0,
				right: dimensions.margin?.right ?? this.display.containerMargin?.right ?? 0
			}
		};

		this.display.containerWidth = newDimensions.width;
		this.display.containerHeight = newDimensions.height;
		this.display.containerMargin = newDimensions.margin;

		this.updateInnerDimensions();
		this.updateScale(this.config.scale, this.config.autoscale);

		if (this.physicsWorker) {
			this.physicsWorker.exec('updateBarriers', newDimensions);
		}
	}

	updateInnerDimensions() {
        const m = this.display.containerMargin || { top:0,bottom:0,left:0,right:0 };
        this.display.innerWidth = Math.max(0, this.display.containerWidth - (m.left||0) - (m.right||0));
        this.display.innerHeight = Math.max(0, this.display.containerHeight - (m.top||0) - (m.bottom||0));
        if (!this.display.innerWidth) this.display.innerWidth = this.display.containerWidth;
        if (!this.display.innerHeight) this.display.innerHeight = this.display.containerHeight;
    }

	updateScale(scale = 100, autoscale = false) {
		this.config.autoscale = autoscale;
		this.config.scale = scale;
		if (autoscale) {
			this.display.scale = this.computeAutoScale();
		} else {
			const autoScaleReference = this.computeAutoScale();
			const BASE = 75; // base autoscale number
			const pct = Math.min(100, Math.max(0, scale));
			const normalizedScale = autoScaleReference * (pct / BASE) || 1;
			this.display.scale = normalizedScale;
		}
		if (this.config.boxType == "board") {
			this.dicefactory.setScale(this.display.scale);
		}
	}

	computeAutoScale() {
		const w = this.display.innerWidth || this.display.containerWidth;
        const h = this.display.innerHeight || this.display.containerHeight;
        return Math.sqrt(w * w + h * h) / 13;
	}

	vectorRand({ x, y }) {
		let angle = Math.random() * Math.PI / 5 - Math.PI / 5 / 2;
		let vec = {
			x: x * Math.cos(angle) - y * Math.sin(angle),
			y: x * Math.sin(angle) + y * Math.cos(angle)
		};
		if (vec.x == 0) vec.x = 0.01;
		if (vec.y == 0) vec.y = 0.01;
		return vec;
	}

	getVectors(notationVectors, vector, boost, dist) {

		for (let i = 0; i < notationVectors.dice.length; i++) {

			const diceobj = this.dicefactory.get(notationVectors.dice[i].type);

			let vec = this.vectorRand(vector);

			vec.x /= dist;
			vec.y /= dist;

			let W = this.display.innerWidth;
            let H = this.display.innerHeight;
            let pos = {
                x: W * (vec.x > 0 ? -1 : 1) * 0.9 + Math.floor(Math.random() * 201) - 100,
                y: H * (vec.y > 0 ? -1 : 1) * 0.9 + Math.floor(Math.random() * 201) - 100,
                z: Math.random() * 200 + 200
            };

			let projector = Math.abs(vec.x / vec.y);
			if (projector > 1.0) pos.y /= projector; else pos.x *= projector;


			let velvec = this.vectorRand(vector);

			velvec.x /= dist;
			velvec.y /= dist;
			let velocity, angle, axis;

			if (diceobj.shape != "d2") {

				velocity = {
					x: velvec.x * boost,
					y: velvec.y * boost,
					z: -10
				};

				angle = {
					x: -(Math.random() * vec.y * 5 + diceobj.inertia * vec.y),
					y: Math.random() * vec.x * 5 + diceobj.inertia * vec.x,
					z: 0
				};

				axis = {
					x: Math.random(),
					y: Math.random(),
					z: Math.random(),
					a: Math.random()
				};

				axis = {
					x: 0,
					y: 0,
					z: 0,
					a: 0
				};
			} else {
				//coin flip
				velocity = {
					x: velvec.x * boost / 10,
					y: velvec.y * boost / 10,
					z: 3000
				};

				angle = {
					x: 12 * diceobj.inertia,//-(Math.random() * velvec.y * 50 + diceobj.inertia * velvec.y ) ,
					y: 1 * diceobj.inertia,//Math.random() * velvec.x * 50 + diceobj.inertia * velvec.x ,
					z: 0
				};

				axis = {
					x: 1,//Math.random(), 
					y: 1,//Math.random(), 
					z: Math.random(),
					a: Math.random()
				};
			}

			notationVectors.dice[i].vectors = {
				type: diceobj.type,
				pos,
				velocity,
				angle,
				axis
			};
		}
		return notationVectors;
	}

	// swaps dice faces to match desired result
	async swapDiceFace(dicemesh) {
		const diceobj = this.dicefactory.get(dicemesh.notation.type);

		let value = parseInt(await dicemesh.getValue());
		let result = parseInt(dicemesh.forcedResult);

		if (diceobj.shape == 'd10' && result == 0) result = 10;

		if (diceobj.valueMap) { //die with special values
			result = diceobj.valueMap[result];
		}

		// Make the last rolled dice and the DiceBox instance available for debugging
		//CONFIG.DiceSoNice = {
		//	dicemesh,
		//	dicebox: this
		//};

		if (value == result) return;

		let rotIndex = value > result ? result + "," + value : value + "," + result;
		//console.log(`Needed ${result}, Rolled ${value}, Remap: ${rotIndex}`)
		let rotationDegrees = DICE_MODELS[dicemesh.shape].rotationCombinations[rotIndex];
		if (!rotationDegrees) {
			console.log(`[Dice So Nice] No dice rotation found for ${dicemesh.shape} ${value} ${result}`);
			rotationDegrees = [0, 0, 0];
		}
		let eulerAngle = new Euler(MathUtils.degToRad(rotationDegrees[0]), MathUtils.degToRad(rotationDegrees[1]), MathUtils.degToRad(rotationDegrees[2]));
		let quaternion = new Quaternion().setFromEuler(eulerAngle);
		if (value > result)
			quaternion.invert();

		dicemesh.applyQuaternion(quaternion);
	}

	/*
	// Apply an euler angle from rotationCombinations for debugging
	  swapTest(dicemesh, mapping, invert = false, revert = true) {
  
		  let rotationDegrees = DICE_MODELS[dicemesh.shape].rotationCombinations[mapping];
		  let eulerAngle = new Euler(MathUtils.degToRad(rotationDegrees[0]), MathUtils.degToRad(rotationDegrees[1]), MathUtils.degToRad(rotationDegrees[2]));
		  let quaternion = new Quaternion().setFromEuler(eulerAngle);
		  if (invert)
			  quaternion.invert();
  
		  dicemesh.applyQuaternion(quaternion);
  
		  if (revert) {
			  setTimeout(() => { this.swapTest(dicemesh, mapping, !invert, false) }, 2000 )
		  }
  
		  dicemesh.resultReason = 'forced';
	  }
  
	// Apply an euler angle directly for debugging
	  swapTest(dicemesh, mapping, invert = false, revert = true) {
	  swapTestEuler(dicemesh, euler, invert = false, revert = true) {
		  let eulerAngle = new Euler(MathUtils.degToRad(euler[0]), MathUtils.degToRad(euler[1]), MathUtils.degToRad(euler[2]));
		  let quaternion = new Quaternion().setFromEuler(eulerAngle);
		  if (invert)
			  quaternion.invert();
  
		  dicemesh.applyQuaternion(quaternion);
  
		  if (revert) {
			  setTimeout(() => { this.swapTestEuler(dicemesh, euler, !invert, false) }, 2000 )
		  }
  
		  dicemesh.resultReason = 'forced';
	  }
  
	// Extract the euler angle from a mesh in degrees for debugging
	  extractEuler(dicemesh) {
		  let euler = dicemesh.rotation
		  console.log("World Euler:", MathUtils.radToDeg(euler.x), MathUtils.radToDeg(euler.y), MathUtils.radToDeg(euler.z), euler.order)
	  }
	*/

	//create a dice mesh (shared setup for ephemeral and persistent)
	async _createDiceMesh(type, appearance, diceLibrary = null) {
		const diceobj = this.dicefactory.get(type);
		if (!diceobj) return null;

		let dicemesh = await this.dicefactory.create(this.renderer.scopedTextureCache, diceobj.type, appearance, diceLibrary);
		if (!dicemesh) return null;

		let mass = diceobj.mass;
		switch (appearance.material) {
			case "metal":
				mass *= 7;
				break;
			case "wood":
				mass *= 0.65;
				break;
			case "glass":
				mass *= 2;
				break;
			case "stone":
				mass *= 1.5;
				break;
		}

		dicemesh.castShadow = this.dicefactory.shadows;
		dicemesh.receiveShadow = this.dicefactory.shadows;
		dicemesh.userData.system = appearance.system;

		return { dicemesh, diceobj, mass };
	}

	//spawns one dicemesh object from a single vectordata object
	async spawnDice(dicedata, appearance, diceLibrary = null) {
		let vectordata = dicedata.vectors;
		const result = await this._createDiceMesh(vectordata.type, appearance, diceLibrary);
		if (!result) return;
		const { dicemesh, diceobj, mass } = result;

		//todo these should be moved to .userData. old code
		dicemesh.notation = vectordata;
		dicemesh.result = null;
		dicemesh.forcedResult = dicedata.result;
		dicemesh.startAtIteration = dicedata.startAtIteration;
		dicemesh.stopped = 0;
		dicemesh.specialEffects = dicedata.specialEffects;
		dicemesh.options = dicedata.options;
		//todo

		// Add the dice to the physics world
		await this.physicsWorker.exec('createDice', {
			id: dicemesh.id,
			shape: diceobj.shape,
			material: appearance.material,
			vectordata: vectordata,
			mass: mass,
			startAtIteration: dicedata.startAtIteration,
			options: dicedata.options
		});

		if (dicemesh.userData.glowingInDarkness) {
			if (canvas.darknessLevel > 0.5) {
				//If the darkness level is less than 0.5, we activate the "glowing in the dark" mode
				//This mode is activated by setting the userData.glowingInDarkness to true on the mesh of the dice
				dicemesh.material.emissiveIntensity = 0.3;
				dicemesh.material.emissive = new Color(0xffffff);
			} else {
				dicemesh.material.emissiveIntensity = 0;
				dicemesh.material.emissive = new Color(0x000000);
			}
		}

		//dicemesh.meshCannon = this.body2mesh(dicemesh.body_sim,true);

		let objectContainer = new Group();
		objectContainer.add(dicemesh);

		this.diceList.push(dicemesh);
		if (dicemesh.startAtIteration == 0) {
			await this.physicsWorker.exec('addDice', dicemesh.id);
		}
	}

	//spawn a persistent die on the tabletop
	async spawnPersistentDie(type, appearance, position = null, diceLibrary = null, opts = {}) {
		if (!this.persistentDiceEnabled) return null;

		//cap persistent dice at maxDiceNumber
		const maxDiceNumber = game.settings.get("dice-so-nice", "maxDiceNumber");
		if (this.persistentDiceList.length >= maxDiceNumber) {
			ui.notifications?.warn(game.i18n?.localize?.("DICESONICE.persistentDiceCapReached") || `Dice So Nice: persistent dice limit reached (${maxDiceNumber}).`);
			return null;
		}

		const result = await this._createDiceMesh(type, appearance, diceLibrary);
		if (!result) return null;
		const { dicemesh, diceobj, mass } = result;

		let posX, posY;
		if (position) {
			posX = (position.x - 0.5) * this.display.innerWidth;
			posY = -(position.y - 0.5) * this.display.innerHeight;
		} else {
			posX = (Math.random() - 0.5) * this.display.innerWidth * 0.5;
			posY = -(Math.random() - 0.5) * this.display.innerHeight * 0.5;
		}

		//axis must be zero or normalized (cannon-es NaN otherwise)
		const vectordata = {
			type: type,
			pos: { x: posX, y: posY, z: diceobj.inertia * 13 },
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

		let objectContainer = new Group();
		objectContainer.add(dicemesh);
		objectContainer.position.set(vectordata.pos.x, vectordata.pos.y, vectordata.pos.z);
		this.scene.add(objectContainer);

		this.persistentDiceList.push(dicemesh);
		this._emitPersistentDiceChanged();

		//apply current visibility mode
		this._applyPersistentDieVisibility(dicemesh);

		//ensure ticker is running
		if (!this.running) {
			this.removeTicker(this.animateThrow);
			canvas.app.ticker.add(this.animateThrow, this);
		}

		this.isVisible = true;
		this.renderScene();

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
			this._updateSelectionOutlines();
		}

		this.scene.remove(dicemesh.parent.type === "Scene" ? dicemesh : dicemesh.parent);
		await this.physicsWorker.exec("removeDice", [dicemesh.id]);

		//clean up if no more dice
		if (this.persistentDiceList.length === 0 && !this.rolling && this.diceList.length === 0 && this.deadDiceList.length === 0) {
			this.removeTicker(this.animateThrow);
			this.isVisible = false;
		}

		this.renderScene();
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
		this.renderScene();
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
		const keep = [];
		const remove = [];
		for (const mesh of this.persistentDiceList) {
			if (ownerUserId && mesh.userData.ownerUserId !== ownerUserId) keep.push(mesh);
			else remove.push(mesh);
		}
		if (remove.length === 0) return;

		const removedIds = remove.map(d => d.id);
		for (const dicemesh of remove) {
			this.scene.remove(dicemesh.parent.type === "Scene" ? dicemesh : dicemesh.parent);
			this.selectedPersistentDiceIds.delete(dicemesh.id);
		}
		this.persistentDiceList = keep;
		this._emitPersistentDiceChanged();
		this._updateSelectionOutlines();

		if (this.physicsWorker) {
			await this.physicsWorker.exec("removeDice", removedIds);
		}

		this.renderScene();
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

	throwFinished() {
		let stopped = true;
		if (this.iteration <= this.minIterations) return false;
		stopped = this.iteration >= this.iterationsNeeded;
		if (stopped && this.rolling) {
			//Can't await here because of the PIXI ticker. Hopefully it's not needed.
			for (let i = 0, len = this.diceList.length; i < len; ++i) {
				if (!this.diceList[i].sim)
					continue;
				this.diceList[i].sim.stepPositions = new Float32Array(1001 * 3);
				this.diceList[i].sim.stepQuaternions = new Float32Array(1001 * 4);
				if (this.diceList[i].dead > 0)
					this.diceList[i].static = true;
			}
		}
		return stopped;
	}

	async simulateThrow() {
		this.rolling = true;

		const workerData = {
			minIterations: this.minIterations,
			nbIterationsBetweenRolls: this.nbIterationsBetweenRolls,
			framerate: this.framerate,
			canBeFlipped: game.settings.get("dice-so-nice", "diceCanBeFlipped")
		}

		const { ids, quaternionsBuffers, positionsBuffers, detectedCollides, deads, iterationsNeeded } = await this.physicsWorker.exec('simulateThrow', workerData);

		const quaternions = quaternionsBuffers.map(buffer => new Float32Array(buffer));
		const positions = positionsBuffers.map(buffer => new Float32Array(buffer));

		this.iterationsNeeded = iterationsNeeded;

		// Create a mapping of IDs to their index in the 'ids' array
		const idToIndex = new Map();
		ids.forEach((id, index) => {
			idToIndex.set(id, index);
		});

		const combinedDiceList = [...this.diceList, ...this.deadDiceList, ...this.persistentDiceList];

		combinedDiceList.forEach(dice => {
			const index = idToIndex.get(dice.id);
			if (index !== undefined) {
				dice.sim = {
					dead: deads[index],
					stepQuaternions: quaternions[index],
					stepPositions: positions[index]
				}
			}
		});

		this.detectedCollides = this.soundManager.generateCollisionSounds(detectedCollides);
	}

	addDiceToScene() {
		for (let i = 0; i < this.diceList.length; i++) {
			if (this.diceList[i].startAtIteration == this.iteration) {
				let dicemesh = this.diceList[i];
				//set initial position from sim to avoid flash at origin
				if (dicemesh.sim && dicemesh.sim.stepPositions) {
					dicemesh.parent.position.fromArray(dicemesh.sim.stepPositions, 0);
					dicemesh.parent.quaternion.fromArray(dicemesh.sim.stepQuaternions, 0);
				}
				this.scene.add(dicemesh.parent);
				this.dicefactory.systems.get(dicemesh.userData.system).fire(DiceSystem.DICE_EVENT_TYPE.SPAWN, { dice: dicemesh });
			}
		}
	}

	//This is the render loop for the board. /!\ Not called in the showcase /!\
	animateThrow() {

		let time = (new Date()).getTime();
		this.last_time = this.last_time || time - (this.framerate * 1000);
		let time_diff = (time - this.last_time) / 1000;

		let neededSteps = Math.floor(time_diff / this.framerate);

		if(this.stats)
			this.stats.update();

		if(this.iteration == 0) {
			this.addDiceToScene();
		}

		if (neededSteps && this.rolling) {
			for (let i = 0; i < neededSteps * this.speed; i++) {
				++this.iteration;
				if (!(this.iteration % this.nbIterationsBetweenRolls)) {
					this.addDiceToScene();
				}
			}
			if (this.iteration > this.iterationsNeeded)
				this.iteration = this.iterationsNeeded;

			for (const child of this.scene.children) {
				let dicemesh = child.children && child.children.length && child.children[0].sim != undefined && (!child.children[0].sim.dead || child.children[0].sim.dead > this.iteration) ? child.children[0] : null;

				if (dicemesh && dicemesh.sim.stepPositions[this.iteration * 3]) {
					child.position.fromArray(dicemesh.sim.stepPositions, this.iteration * 3);
					child.quaternion.fromArray(dicemesh.sim.stepQuaternions, this.iteration * 4);
				}
			}

			//Note: if the game is lagging, it means some collisions won't be played. Not sure if it is what we want or not
			if (this.detectedCollides[this.iteration]) {
				this.soundManager.playAudioSprite(...this.detectedCollides[this.iteration]);
			}
		} else if (!this.rolling) {
			//pre-roll chaotic rotation: visual-only tumble layered on top of physics
			if (this.mouse.preRoll && this.mouse.heldPersistentDice.length > 0) {
				//each die has its own preRollRates so multi-die selections don't rotate in lockstep
				for (const dicemesh of this.mouse.heldPersistentDice) {
					const r = dicemesh.userData?.preRollRates;
					if (!r) continue;
					r.t += time_diff;
					const ex = r.x * time_diff;
					const ey = r.y * time_diff;
					//z oscillates sinusoidally for wobble
					const w = 2 * Math.PI * r.zFreq;
					const ez = r.zAmp * w * Math.cos(w * r.t) * time_diff;
					this._preRollEuler.set(ex, ey, ez, 'XYZ');
					this._preRollDeltaQuat.setFromEuler(this._preRollEuler);
					dicemesh.quaternion.multiply(this._preRollDeltaQuat);
				}
			}

			//remote pre-roll: same visual effect for dice held by other players
			for (const dicemesh of this.persistentDiceList) {
				if (!dicemesh.userData?.remotePreRoll) continue;
				const r = dicemesh.userData?.preRollRates;
				if (!r) continue;
				r.t += time_diff;
				const ex = r.x * time_diff;
				const ey = r.y * time_diff;
				const w = 2 * Math.PI * r.zFreq;
				const ez = r.zAmp * w * Math.cos(w * r.t) * time_diff;
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
				const dy = target.y - container.position.y;
				//snap if close enough
				if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
					container.position.x = target.x;
					container.position.y = target.y;
				} else {
					container.position.x += dx * REMOTE_LERP_FACTOR;
					container.position.y += dy * REMOTE_LERP_FACTOR;
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
		for (const dicemesh of this.persistentDiceList) {
			const pt = dicemesh.persistentThrow;
			if (!dicemesh.sim || !pt) continue;

			//advance playback, clamped to buffer length
			const steps = Math.max(neededSteps, 1) * this.speed;
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
						flavor: `${pt.diceType} — Persistent Dice`,
						flags: { "dice-so-nice": { persistent: true } }
					}).catch(err => {
						console.error("[Dice So Nice] Failed to create persistent dice chat message:", err);
						if (ui?.notifications) ui.notifications.warn("Dice So Nice: persistent roll failed to post to chat (see console).");
					});
				}
				//fire SFX at throw completion
				if (dicemesh.specialEffects) {
					for (const sfx of dicemesh.specialEffects) {
						DiceSFXManager.playSFX(sfx, this, dicemesh);
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

		if (this.isVisible && (this.allowInteractivity || this.animatedDiceDetected || neededSteps || DiceSFXManager.renderQueue.length || this.persistentDiceList.length > 0)) {
			DiceSFXManager.renderSFX();
			//use darknessLevel to change toneMapping
			if (this.dicefactory.realisticLighting && this.immersiveDarkness) {
				//If the darkness level is not defined, we set it to 0
				let darknessLevel = canvas.darknessLevel || 0;
				this.renderer.toneMappingExposure = this.toneMappingExposureDefault * 0.4 + (this.toneMappingExposureDefault * 0.6 - darknessLevel * 0.6);
			}

			this.renderScene();
		}

		this.last_time = this.last_time + neededSteps * this.framerate * 1000;

		// roll finished
		if (this.throwFinished()) {
			//if animated dice still on the table, keep animating
			if (this.running) {
				for(let i = 0; i < this.diceList.length; i++){
					this.dicefactory.systems.get(this.diceList[i].userData.system).fire(DiceSystem.DICE_EVENT_TYPE.RESULT, { dice: this.diceList[i] });
				}
				this.handleSpecialEffectsInit().then(() => {
					this.rolling = false;
					//clean up sim data so persistent dice return to live physics
					for (const die of this.persistentDiceList) {
						delete die.sim;
					}
					this.callback(this.throws);
					if (!this.animatedDiceDetected && !(this.allowInteractivity && (this.deadDiceList.length + this.diceList.length) > 0) && !DiceSFXManager.renderQueue.length && this.persistentDiceList.length === 0)
						this.removeTicker(this.animateThrow);
				});
			}
			this.running = false;
		}
	}

	async start_throw(throws, callback) {
		if (this.rolling) return;
		this.throws = null;
		this.callback = null;
		let countNewDice = 0;
		throws.forEach(notation => {
			let vector = {
                x: (Math.random() * 2 - 0.5) * this.display.innerWidth,
                y: -(Math.random() * 2 - 0.5) * this.display.innerHeight
            };
            let dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
			let throwingForceModifier = 0.8;
			switch (this.throwingForce) {
				case "weak":
					throwingForceModifier = 0.5;
					break;
				case "strong":
					throwingForceModifier = 1.8;
					break;
			}
			let boost = ((Math.random() + 3) * throwingForceModifier) * dist;

			notation = this.getVectors(notation, vector, boost, dist);
			countNewDice += notation.dice.length;
		});

		let maxDiceNumber = game.settings.get("dice-so-nice", "maxDiceNumber");
		if (this.deadDiceList.length + this.diceList.length + countNewDice > maxDiceNumber) {
			await this.clearAll();
		}
		this.isVisible = true;
		await this.rollDice(throws, callback);
	}

	clearDice() {
		this.running = false;
		this.deadDiceList = this.deadDiceList.concat(this.diceList);
		this.diceList = [];
	}

	async clearAll() {
		this.clearDice();
		const diceToRemove = [];
		let dice;
		while (dice = this.deadDiceList.pop()) {
			this.scene.remove(dice.parent.type == "Scene" ? dice : dice.parent);
			diceToRemove.push(dice.id);
		}

		if (this.pane) this.scene.remove(this.pane);

		if (this.config.boxType == "board") {
			if(this.physicsWorker)
				await this.physicsWorker.exec("removeDice", diceToRemove);
			DiceSFXManager.clearQueue();
			//keep ticker alive if persistent dice exist
			if (this.persistentDiceList.length === 0) {
				this.removeTicker(this.animateThrow);
			}
		} else {
			this.removeTicker(this.animateSelector);
		}

		this.renderScene();

		//keep canvas visible if persistent dice exist
		if (this.persistentDiceList.length === 0) {
			this.isVisible = false;
		}
	}

	darkenNonBloomed(obj) {
		if (obj.isMesh && this.bloomLayer.test(obj.layers) === false) {
			this.bloomMaterials[obj.uuid] = obj.material;
			obj.material = this.darkMaterial;
		}
	}

	restoreMaterial(obj) {
		if (this.bloomMaterials[obj.uuid]) {
			obj.material = this.bloomMaterials[obj.uuid];
			delete this.bloomMaterials[obj.uuid];
		}
	}

	renderScene() {
		//Update animated dice mixer
		if (this.animatedDiceDetected) {
			let animatedMaterials = new Set();
			let delta = this.clock.getDelta();
			
			this.scene.traverse(obj => {
				if(obj.mixer)
					obj.mixer.update(delta);
				if(obj.material?.mixer)
					animatedMaterials.add(obj.material);
			});

			for (const material of animatedMaterials) {
				material.mixer.update(delta);
			}
		}

		//Update time uniform
		game.dice3d.uniforms.time.value = performance.now() / 1000;

		if (this.dicefactory.realisticLighting) {
			game.dice3d.uniforms.globalBloom.value = 1;
			if (!this.finalComposer)
				return;

			//Check if there is any emissive materials before rendering the bloom pass
			let hasEmissive = false;
			let black = this.blackColor;
			this.scene.traverseVisible(function (object) {
				if (object.material && object.material.emissive != undefined && !object.material.emissive.equals(black)) {
					hasEmissive = true;
					return;
				}
			});
			if (hasEmissive && this.dicefactory.glow) {
				// Darken non-bloomed materials
				this.scene.traverseVisible(this.darkenNonBloomed.bind(this));
				this.bloomComposer.render();
				//restore materials
				this.scene.traverseVisible(this.restoreMaterial.bind(this));
				this.blendingPass.enabled = true;
			} else {
				this.blendingPass.enabled = false;
			}
			game.dice3d.uniforms.globalBloom.value = 0;
			this.finalComposer.render();
		} else {
			this.renderer.render(this.scene, this.camera);
		}
	}

	clearScene() {
		while (this.scene.children.length > 0) {
			this.scene.remove(this.scene.children[0]);
		}
		this.desk.material.dispose();
		this.desk.geometry.dispose();
		if (this.composerTarget)
			this.composerTarget.dispose();
		if (this.bloomPass)
			this.bloomPass.dispose();
		if (this.AAPass)
			this.AAPass.dispose();
		if (this.bloomComposer) {
			this.bloomComposer.renderTarget1.dispose();
			this.bloomComposer.renderTarget2.dispose();
		}
		if (this.finalComposer) {
			this.finalComposer.renderTarget1.dispose();
			this.finalComposer.renderTarget2.dispose();
		}
		//dispose remote outline passes
		for (const [, entry] of this._remoteOutlinePasses) {
			entry.pass.dispose();
		}
		this._remoteOutlinePasses.clear();
		if (this.dicefactory.shadows) {
			this.light.shadow.map.dispose();
		}
		if (this.config.boxType == "board")
			this.removeTicker(this.animateThrow);
		else
			this.removeTicker(this.animateSelector);
	}

	//Allow to remove an handler from a PIXI ticker even when the context changed.
	removeTicker(fn) {
		let ticker = canvas.app.ticker;
		let listener = ticker._head.next;

		while (listener) {
			// We found a match, lets remove it
			// no break to delete all possible matches
			// incase a listener was added 2+ times
			if (listener.fn === fn) {
				listener = listener.destroy();
			}
			else {
				listener = listener.next;
			}
		}

		if (!ticker._head.next) {
			ticker._cancelIfNeeded();
		}
		return ticker;
	}

	async rollDice(throws, callback) {
		//old code??
		//this.camera.position.z = this.cameraHeight.far;
		this.clearDice();

		this.minIterations = (throws.length - 1) * this.nbIterationsBetweenRolls;

		for (let j = 0; j < throws.length; j++) {
			let notationVectors = throws[j];

			for (let i = 0, len = notationVectors.dice.length; i < len; ++i) {
				notationVectors.dice[i].startAtIteration = j * this.nbIterationsBetweenRolls;
				let appearance = this.dicefactory.getAppearanceForDice(notationVectors.dsnConfig.appearance, notationVectors.dice[i].type, notationVectors.dice[i]);
				await this.spawnDice(notationVectors.dice[i], appearance, notationVectors.dsnConfig.diceLibrary);
			}
		}

		await this.simulateThrow();
		this.iteration = 0;

		// swap faces if needed based on fvtt roll result
		for (let i = 0, len = this.diceList.length; i < len; ++i) {
			let dicemesh = this.diceList[i];
			if (!dicemesh) continue;
			await this.swapDiceFace(dicemesh);
		}

		this.animatedDiceDetected = await this.checkForAnimatedDice();

		//reset the result
		for (let i = 0, len = this.diceList.length; i < len; ++i) {
			if (!this.diceList[i]) continue;
			this.diceList[i].result = null;

		}

		// animate the previously simulated roll
		this.rolling = true;
		this.running = (new Date()).getTime();
		this.last_time = 0;

		this.callback = callback;
		this.throws = throws;
		this.removeTicker(this.animateThrow);
		canvas.app.ticker.add(this.animateThrow, this);
	}

	//Check if there's an animated dice to reduce render loop complexecity if there's none
	async checkForAnimatedDice() {
		//Detect if there's an animated dice
		let animatedDiceDetected = false;
		for (let i = 0, len = this.diceList.length; i < len; ++i) {
			let dicemesh = this.diceList[i];
			if (!dicemesh) continue;
			dicemesh.traverse(obj => {
				if(obj.mixer || obj.material?.mixer){
					animatedDiceDetected = true;
				}
			});
		}

		return animatedDiceDetected;
	}

	async showcase(config) {
		await this.clearAll();
		//Get dice type list as an array
		let selectordice = [...this.dicefactory.systems.get("standard").dice.keys()];
		const extraDiceTypes = ["d3", "d5", "d7", "d14", "d16", "d24", "d30"];
		if (!this.showExtraDice)
			selectordice = selectordice.filter((die) => !extraDiceTypes.includes(die));

		let proportion = this.display.containerWidth / this.display.containerHeight;
		let columns = Math.min(selectordice.length, Math.round(Math.sqrt(proportion * selectordice.length)));
		let rows = Math.floor((selectordice.length + columns - 1) / columns);

		this.camera.position.z = this.cameraHeight.medium;
		this.camera.position.x = this.display.containerWidth / 2 - (this.display.containerWidth / columns / 2);
		this.camera.position.y = -this.display.containerHeight / 2 + (this.display.containerHeight / rows / 2);
		this.camera.fov = 2 * Math.atan(this.display.containerHeight / (2 * this.camera.position.z)) * (180 / Math.PI);
		this.camera.updateProjectionMatrix();

		if (this.pane) this.scene.remove(this.pane);
		if (this.desk) this.scene.remove(this.desk);
		if (this.dicefactory.shadows) {

			let shadowplane = new ShadowMaterial();
			shadowplane.opacity = 0.5;
			shadowplane.depthWrite = false;

			this.pane = new Mesh(new PlaneGeometry(this.display.containerWidth * 2, this.display.containerHeight * 2, 1, 1), shadowplane);
			this.pane.receiveShadow = this.dicefactory.shadows;
			this.pane.position.set(0, 0, -70);
			this.scene.add(this.pane);
		}

		let z = 0;
		let count = 0;
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < columns; x++) {
				if (count >= selectordice.length)
					break;
				let appearance = this.dicefactory.getAppearanceForDice(config.appearance, selectordice[count]);
				let dicemesh = await this.dicefactory.create(this.renderer.scopedTextureCache, selectordice[count], appearance, config.diceLibrary || null);
				dicemesh.scale.set(
					Math.min(dicemesh.scale.x * 5 / columns, dicemesh.scale.x * 2 / rows),
					Math.min(dicemesh.scale.y * 5 / columns, dicemesh.scale.y * 2 / rows),
					Math.min(dicemesh.scale.z * 5 / columns, dicemesh.scale.z * 2 / rows)
				);

				dicemesh.position.set(x * this.display.containerWidth / columns, -(y * this.display.containerHeight / rows), z);

				dicemesh.castShadow = this.dicefactory.shadows;

				dicemesh.userData = selectordice[count];

				this.diceList.push(dicemesh);
				this.scene.add(dicemesh);
				count++;
			}
		}

		this.animatedDiceDetected = await this.checkForAnimatedDice();

		this.last_time = 0;
		if (this.selector.animate) {
			this.container.style.opacity = 0;
			this.last_time = window.performance.now();
			this.start_time = this.last_time;
			this.framerate = 1000 / 60;
			this.removeTicker(this.animateSelector);
			canvas.app.ticker.add(this.animateSelector, this);
		}
		else this.renderScene();
		setTimeout(() => {
			this.scene.traverse(object => {
				if (object.type === 'Mesh') object.material.needsUpdate = true;
			});
		}, 2000);
	}

	animateSelector() {
		let now = window.performance.now();
		let elapsed = now - this.last_time;
		if (elapsed > this.framerate) {
			this.last_time = now - (elapsed % this.framerate);

			if (this.container.style.opacity != '1') this.container.style.opacity = Math.min(1, (parseFloat(this.container.style.opacity) + 0.05));

			if (this.selector.rotate) {
				let angle_change = 0.005 * Math.PI;
				for (let i = 0; i < this.diceList.length; i++) {
					this.diceList[i].rotation.y += angle_change;
					this.diceList[i].rotation.x += angle_change / 4;
					this.diceList[i].rotation.z += angle_change / 10;
				}
			}
			this.renderScene();
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

	findShowcaseDie(pos) {
		this.raycaster.setFromCamera(pos, this.camera);
		const intersects = this.raycaster.intersectObjects([...this.diceList, ...this.deadDiceList], true);
		if (intersects.length) {

			return intersects[0];
		}
		else
			return null;
	}

	findHoveredDie() {
		//persistent dice can be interacted with even during ephemeral rolls
		const canInteractPersistent = this.isVisible && !this.mouse.constraintDown && this.persistentDiceList.length > 0;
		if ((this.isVisible && !this.running && !this.mouse.constraintDown) || canInteractPersistent) {
			this.raycaster.setFromCamera(this.mouse.pos, this.camera);
			const intersects = this.raycaster.intersectObjects([...this.diceList, ...this.deadDiceList, ...this.persistentDiceList], true);
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
					for (const m of this._getLinkGroupSiblings(pending.root)) {
						this.selectedPersistentDiceIds.add(m.id);
					}
					this._updateSelectionOutlines();
				}
				let heldDice = this._getSelectedPersistentDice();
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
			this.raycaster.setFromCamera(this.mouse.pos, this.camera);
			const intersects = this.raycaster.intersectObjects([this.desk]);
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
					//ephemeral die — legacy single-pos path
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
				this._clearPersistentSelection();
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
					wasSelected: this.selectedPersistentDiceIds.has(root.id),
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
					if (this.selectedPersistentDiceIds.has(root.id)) {
						heldDice = this._getSelectedPersistentDice();
					} else {
						this._clearPersistentSelection();
						//grab the whole link group (d100 pair)
						heldDice = this._getLinkGroupSiblings(root);
					}

					await this._beginPersistentGrab(heldDice, pos);
				} else {
					//ephemeral die pickup
					await this.physicsWorker.exec("addConstraint", { id: root.id, pos });
					this.mouse.constraint = true;
				}

				let diceSystem = root.userData?.system ?? "standard";
				this.dicefactory.systems.get(diceSystem).fire(DiceSystem.DICE_EVENT_TYPE.CLICK, { dice: root, position: pos });
				return true;
			} catch (error) {
				console.error(error);
			}
		}
		return false;
	}

	async onMouseUp(event) {
		//tentative grab that never promoted — commit selection toggle on release
		if (this.mouse.pendingGrab && !this.mouse.constraintDown) {
			const pending = this.mouse.pendingGrab;
			this.mouse.pendingGrab = null;
			if (pending.root) this._togglePersistentSelection(pending.root);
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
				//release constraints — pass ids for persistent, empty for ephemeral fallthrough
				if (heldDice.length > 0) {
					await this.physicsWorker.exec("removeConstraint", { ids: heldDice.map(d => d.id) });
				} else {
					await this.physicsWorker.exec("removeConstraint", {});
				}

				//throw the whole held group (combined Roll + combined sim)
				if (heldDice.length > 0 && throwVelocity) {
					await this._throwPersistentDice(heldDice, throwVelocity);
				} else if (heldDice.length > 0 && this.onPersistentEvent) {
					//reposition release — notify to unlock
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
		if (wasPreRoll) this._updateSelectionOutlines();
	}

	//pick up persistent dice as a held group
	async _beginPersistentGrab(heldDice, pos) {
		//desk-plane cursor point so pickupOffsets don't jump on first mousemove
		this.raycaster.setFromCamera(this.mouse.pos, this.camera);
		const deskHits = this.raycaster.intersectObjects([this.desk]);
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

	_getSelectedPersistentDice() {
		if (this.selectedPersistentDiceIds.size === 0) return [];
		const result = [];
		for (const mesh of this.persistentDiceList) {
			if (this.selectedPersistentDiceIds.has(mesh.id)) result.push(mesh);
		}
		return result;
	}

	_clearPersistentSelection() {
		if (this.selectedPersistentDiceIds.size === 0) return;
		this.selectedPersistentDiceIds.clear();
		this._updateSelectionOutlines();
	}

	//return all dice in the same link group (d100 pair)
	_getLinkGroupSiblings(dicemesh) {
		const lg = dicemesh.userData?.linkGroupId;
		if (!lg) return [dicemesh];
		const siblings = [];
		for (const m of this.persistentDiceList) {
			if (m.userData?.linkGroupId === lg) siblings.push(m);
		}
		return siblings.length > 0 ? siblings : [dicemesh];
	}

	_togglePersistentSelection(dicemesh) {
		//toggle whole link group together
		const siblings = this._getLinkGroupSiblings(dicemesh);
		const wasSelected = this.selectedPersistentDiceIds.has(dicemesh.id);
		for (const m of siblings) {
			if (wasSelected) this.selectedPersistentDiceIds.delete(m.id);
			else this.selectedPersistentDiceIds.add(m.id);
		}
		this._updateSelectionOutlines();
	}

	_updateSelectionOutlines() {
		if (!this.outlinePass) return;
		const pass = this.outlinePass;

		//remove our outlines, leave SFX outlines intact
		if (this._highlightedSelectionMeshes.size > 0) {
			pass.selectedObjects = pass.selectedObjects.filter(o => !this._highlightedSelectionMeshes.has(o));
			this._highlightedSelectionMeshes.clear();
		}

		//hide outlines during pre-roll (chaotic rotation is enough visual signal)
		if (this.mouse.preRoll) return;

		//add current selection
		for (const mesh of this._getSelectedPersistentDice()) {
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
		const sfxIndex = this.finalComposer.passes.indexOf(this.outlinePass);
		if (sfxIndex >= 0) {
			this.finalComposer.insertPass(pass, sfxIndex + 1 + this._remoteOutlinePasses.size);
		} else {
			this.finalComposer.addPass(pass);
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
				this._removeRemoteOutlinePass(userId);
			}
		}
	}

	_removeRemoteOutlinePass(userId) {
		const entry = this._remoteOutlinePasses.get(userId);
		if (!entry) return;
		const idx = this.finalComposer.passes.indexOf(entry.pass);
		if (idx >= 0) this.finalComposer.passes.splice(idx, 1);
		entry.pass.dispose();
		this._remoteOutlinePasses.delete(userId);
	}

	toPositionPct(worldX, worldY) {
		return {
			x: (worldX / this.display.innerWidth) + 0.5,
			y: -(worldY / this.display.innerHeight) + 0.5
		};
	}

	fromPositionPct(pct) {
		return {
			x: (pct.x - 0.5) * this.display.innerWidth,
			y: -(pct.y - 0.5) * this.display.innerHeight
		};
	}

	_activatePreRoll() {
		this.mouse.preRoll = true;
		//pre-roll dissolves the selection (one-time grouping, not a persistent tag)
		this.selectedPersistentDiceIds.clear();
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
		this._updateSelectionOutlines();

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

	//throw held persistent dice: combined Roll, one sim, one chat message
	async _throwPersistentDice(heldDice, velocity) {
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
			return; // Graceful degradation — dice settle on physics results
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
						x: velocity.x / this.display.innerWidth,
						y: velocity.y / this.display.innerHeight,
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
			framerate: this.framerate
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
				console.warn("[Dice So Nice] Held die has no derived face value — skipping", { id: dicemesh.id });
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
			await this.swapDiceFace(dicemesh);

			//bake swap into every frame so forced face shows throughout playback
			const swapQuat = dicemesh.quaternion.clone();
			this._bakeSwapIntoQuaternionBuffer(stepQuaternions, swapQuat, iterationsNeeded);

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
			console.warn("[Dice So Nice] Persistent batch throw produced no chat carrier — every die was skipped", { ids: heldDice.map(d => d.id) });
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

	_bakeSwapIntoQuaternionBuffer(stepQuaternions, swapQuat, iterations) {
		const tempQuat = new Quaternion();
		for (let i = 0; i <= iterations; i++) {
			const offset = i * 4;
			tempQuat.set(stepQuaternions[offset], stepQuaternions[offset + 1], stepQuaternions[offset + 2], stepQuaternions[offset + 3]);
			tempQuat.multiply(swapQuat);
			stepQuaternions[offset] = tempQuat.x;
			stepQuaternions[offset + 1] = tempQuat.y;
			stepQuaternions[offset + 2] = tempQuat.z;
			stepQuaternions[offset + 3] = tempQuat.w;
		}
	}

	//replay a persistent throw from another client (no Roll, no chat)
	async _replayRemoteThrow(heldDice, velocity, forcedByMesh, sfxList = []) {
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
			ids, impulses, framerate: this.framerate
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
			await this.swapDiceFace(dicemesh);

			const swapQuat = dicemesh.quaternion.clone();
			this._bakeSwapIntoQuaternionBuffer(stepQuaternions, swapQuat, iterationsNeeded);

			dicemesh.quaternion.set(0, 0, 0, 1);
			dicemesh.sim = { dead: false, stepQuaternions, stepPositions };
			const isSoundCarrier = !soundCarrierAssigned;
			dicemesh.persistentThrow = {
				swapQuat: swapQuat.clone(),
				rawQuat: rawFinalQuat,
				iterations: iterationsNeeded,
				iteration: 0,
				//no roll/diceType — first die carries collision sounds only
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
	}

	async handleSpecialEffectsInit() {
		let promisesSFX = [];
		this.diceList.forEach(dice => {
			if (dice.specialEffects) {
				dice.specialEffects.forEach(sfx => {
					promisesSFX.push(DiceSFXManager.playSFX(sfx, this, dice));
				});
			}
		});
		return Promise.all(promisesSFX);
	}

	//match SFX config entries against a persistent die's type and result.
	//mirrors the filter logic in DiceNotation.js for ephemeral dice
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
					promises.push(DiceSFXManager.playSFX(sfx, this, dicemesh));
				}
			}
		}
		return Promise.all(promises);
	}
}
