import {
    ACESFilmicToneMapping,
    Color,
    DirectionalLight,
    HemisphereLight,
    MOUSE,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShaderUtils } from './ShaderUtils';

/**
 * Lightweight Three.js preview for the Dice Editor.
 * Renders a single die mesh with orbit controls and face raycasting.
 */
export class DiceEditorPreview {

    /**
     * @param {HTMLElement} container - The DOM element to render into.
     * @param {DiceFactory} diceFactory - Reference to the shared DiceFactory.
     */
    constructor(container, diceFactory) {
        this.container = container;
        this.diceFactory = diceFactory;
        this.dieMesh = null;
        this.selectedFaces = new Set();
        this.onFaceSelect = null; // callback: (selectedFaces: Set<number|string>) => void
        this._animFrameId = null;

        this._initRenderer();
        this._initScene();
        this._initControls();
        this._initRaycasting();
        this._animate();
    }

    _initRenderer() {
        this.renderer = new WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        if (this.diceFactory.realisticLighting) {
            this.renderer.toneMapping = ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
        }

        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;
        this.renderer.setSize(width, height);
        this.container.appendChild(this.renderer.domElement);
    }

    _initScene() {
        this.scene = new Scene();
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;

        // Camera
        this.camera = new PerspectiveCamera(20, width / height, 1, 10000);
        this.camera.position.set(0, 0, 500);
        this.camera.lookAt(new Vector3(0, 0, 0));

        // Lighting — matches DiceBox.setScene()
        const intensity = this.diceFactory.realisticLighting ? 1.5 : 0.2;
        const intensityAmb = this.diceFactory.realisticLighting ? 4.0 : 8.0;

        this.lightAmb = new HemisphereLight(0xF0D0A0, 0x606060, intensityAmb);
        this.scene.add(this.lightAmb);

        this.light = new DirectionalLight(0xFFFFFF, intensity);
        this.light.position.set(0, height / 20, Math.max(width, height) / 2);
        this.light.target.position.set(0, 0, 0);
        this.scene.add(this.light);

        // Environment map from existing renderer
        const boardRenderer = game.dice3d?.dice3dRenderers?.board;
        if (boardRenderer?.scopedTextureCache?.textureCube) {
            this.scene.environment = boardRenderer.scopedTextureCache.textureCube;
        }
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: null,
            RIGHT: MOUSE.ROTATE
        };
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        this.controls.minDistance = 200;
        this.controls.maxDistance = 800;
    }

    _initRaycasting() {
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.renderer.domElement.addEventListener("click", (event) => {
            if (!this.dieMesh) return;

            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.dieMesh, true);
            if (intersects.length === 0) return;

            const faceValue = this._triangleToFaceValue(intersects[0].faceIndex);
            if (faceValue === null) return;

            if (event.ctrlKey || event.metaKey) {
                // Toggle face in multi-selection
                if (this.selectedFaces.has(faceValue)) {
                    this.selectedFaces.delete(faceValue);
                } else {
                    this.selectedFaces.add(faceValue);
                }
            } else {
                // Single selection
                this.selectedFaces.clear();
                this.selectedFaces.add(faceValue);
            }

            this._updateHighlights();
            if (this.onFaceSelect) {
                this.onFaceSelect(new Set(this.selectedFaces));
            }
        });
    }

    /**
     * Map a triangle index from the BufferGeometry to a logical face value.
     * The geometry is built as a fan per face, so we can count triangles per face.
     */
    _triangleToFaceValue(triangleIndex) {
        if (!this.dieMesh || !this._faceTriangleMap) return null;

        for (const [faceValue, range] of this._faceTriangleMap.entries()) {
            if (triangleIndex >= range.start && triangleIndex < range.end) {
                return faceValue;
            }
        }
        return null;
    }

    /**
     * Build a lookup map from triangle indices to face values.
     * Must be called after setting the die mesh.
     */
    _buildFaceTriangleMap(diceobj) {
        this._faceTriangleMap = new Map();
        if (!this.dieMesh?.geometry) return;

        const geo = this.dieMesh.geometry;
        const index = geo.index;
        if (!index) return;

        // For standard BufferGeometry dice, faces are laid out as groups
        // Each face gets a group of triangles. We use the geometry groups if available.
        if (geo.groups && geo.groups.length > 0) {
            // Groups are typically 1 per face (edge + faces)
            for (let g = 0; g < geo.groups.length; g++) {
                const group = geo.groups[g];
                const triStart = group.start / 3;
                const triEnd = (group.start + group.count) / 3;
                if (g > 0 && g - 1 < diceobj.values.length) {
                    this._faceTriangleMap.set(diceobj.values[g - 1], { start: triStart, end: triEnd });
                }
            }
        } else {
            // Fallback: divide triangles evenly among faces + edge
            const totalTriangles = index.count / 3;
            const numFaces = diceobj.values.length + 1; // +1 for edge
            const trisPerFace = Math.floor(totalTriangles / numFaces);

            for (let i = 0; i < diceobj.values.length; i++) {
                const start = (i + 1) * trisPerFace;
                const end = (i + 2) * trisPerFace;
                this._faceTriangleMap.set(diceobj.values[i], { start, end });
            }
        }
    }

    /**
     * Update visual highlights on selected faces.
     * Re-paints the emissive map tiles for selected faces with a highlight color.
     */
    _updateHighlights() {
        if (!this.dieMesh?.material?.emissiveMap) return;
        const mat = this.dieMesh.material;
        if (!mat.userData?.materialData) return;

        // Rebuild the die mesh with highlight info
        // For now, we use emissive color to signal selection
        if (this.selectedFaces.size > 0) {
            mat.emissive = new Color(0x00AAFF);
            mat.emissiveIntensity = 0.3;
        } else {
            mat.emissive = new Color(0x000000);
            mat.emissiveIntensity = 1;
        }
        mat.needsUpdate = true;
    }

    _animate() {
        this._animFrameId = requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Set a new die mesh in the preview scene.
     * @param {string} dieType - e.g. "d20"
     * @param {object} appearance - Resolved appearance object
     * @param {Array} diceLibrary - Optional library data for per-face overrides
     */
    async setDie(dieType, appearance, diceLibrary = null) {
        if (this.dieMesh) {
            this.scene.remove(this.dieMesh);
            this.dieMesh = null;
        }

        const scopedTextureCache = game.dice3d?.dice3dRenderers?.board?.scopedTextureCache
            || game.dice3d?.dice3dRenderers?.showcase?.scopedTextureCache;
        if (!scopedTextureCache) return;

        // Use a "showcase" type cache to avoid physics worker
        const previewCache = { ...scopedTextureCache, type: "showcase" };
        this.dieMesh = await this.diceFactory.create(previewCache, dieType, appearance, diceLibrary);
        if (!this.dieMesh) return;

        // Scale die to fit the viewport nicely
        this.dieMesh.scale.multiplyScalar(2);
        this.scene.add(this.dieMesh);

        // Build face triangle map for raycasting
        const diceobj = this.diceFactory.getPresetBySystem(dieType, appearance.system || "standard");
        if (diceobj) {
            this._buildFaceTriangleMap(diceobj);
        }
    }

    /**
     * Refresh the die mesh (e.g., after property change).
     */
    async refresh(dieType, appearance, diceLibrary = null) {
        // Dispose cached materials for this library die to force re-creation
        if (appearance.libraryDieId) {
            this.diceFactory.disposeCachedMaterials();
        }
        this.selectedFaces.clear();
        await this.setDie(dieType, appearance, diceLibrary);
    }

    /**
     * Resize the renderer to match the container.
     */
    resize() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Clean up resources.
     */
    dispose() {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
        this.controls.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}
