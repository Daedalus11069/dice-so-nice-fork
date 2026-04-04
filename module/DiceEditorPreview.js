import {
    Color,
    Quaternion,
    Raycaster,
    Vector2,
    Vector3
} from 'three';
import { DiceBox } from './DiceBox.js';
import { Dice3D } from './Dice3D.js';

/**
 * Dice Editor preview — wraps a DiceBox instance in "editor" mode
 * and adds manual mesh rotation + face raycasting on top.
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
        this.onFaceSelect = null;
        this._animFrameId = null;
        this.box = null;
    }

    /**
     * Async initialization — must be called after constructor.
     * Creates and sets up the DiceBox instance.
     */
    async init() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;

        // Create a DiceBox in "editor" mode (same pattern as DiceConfig showcase)
        const config = foundry.utils.mergeObject(
            Dice3D.ALL_CONFIG(),
            {
                boxType: "editor",
                dimensions: { width, height },
                autoscale: false,
                scale: 60
            }
        );

        this.box = new DiceBox(this.container, this.diceFactory, config);
        await this.box.initialize();
        this.box.setScene();

        // Override camera for a nice 3/4 angle
        this.box.camera.position.set(150, 200, 540);
        this.box.camera.lookAt(0, 0, 0);
        this.box.camera.updateProjectionMatrix();

        this._initControls();
        this._initRaycasting();
        this._animate();
    }

    _initControls() {
        // Manual right-drag rotation of the mesh (not the camera)
        // so the HDR lighting changes as you rotate the die
        this._isDragging = false;
        this._prevMouse = { x: 0, y: 0 };
        const canvas = this.box.renderer.domElement;

        canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        canvas.addEventListener("mousedown", (e) => {
            if (e.button === 2) {
                this._isDragging = true;
                this._prevMouse.x = e.clientX;
                this._prevMouse.y = e.clientY;
            }
        });

        canvas.addEventListener("mousemove", (e) => {
            if (!this._isDragging || !this.dieMesh) return;
            const dx = e.clientX - this._prevMouse.x;
            const dy = e.clientY - this._prevMouse.y;
            this._prevMouse.x = e.clientX;
            this._prevMouse.y = e.clientY;

            // Rotate using camera-relative axes so drag direction always feels natural
            const speed = 0.01;
            const cameraRight = new Vector3();
            const cameraUp = new Vector3();
            this.box.camera.getWorldDirection(new Vector3());
            cameraRight.setFromMatrixColumn(this.box.camera.matrixWorld, 0);
            cameraUp.setFromMatrixColumn(this.box.camera.matrixWorld, 1);

            const qX = new Quaternion().setFromAxisAngle(cameraUp, dx * speed);
            const qY = new Quaternion().setFromAxisAngle(cameraRight, dy * speed);
            this.dieMesh.quaternion.premultiply(qX).premultiply(qY);
        });

        window.addEventListener("mouseup", (e) => {
            if (e.button === 2) this._isDragging = false;
        });
    }

    _initRaycasting() {
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.box.renderer.domElement.addEventListener("click", (event) => {
            if (!this.dieMesh) return;

            const rect = this.box.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.box.camera);
            const intersects = this.raycaster.intersectObject(this.dieMesh, true);
            if (intersects.length === 0) return;

            const faceValue = this._triangleToFaceValue(intersects[0].faceIndex);
            if (faceValue === null) return;

            if (event.ctrlKey || event.metaKey) {
                if (this.selectedFaces.has(faceValue)) {
                    this.selectedFaces.delete(faceValue);
                } else {
                    this.selectedFaces.add(faceValue);
                }
            } else {
                this.selectedFaces.clear();
                this.selectedFaces.add(faceValue);
            }

            this._updateHighlights();
            if (this.onFaceSelect) {
                this.onFaceSelect(new Set(this.selectedFaces));
            }
        });
    }

    _triangleToFaceValue(triangleIndex) {
        if (!this.dieMesh || !this._faceTriangleMap) return null;
        for (const [faceValue, range] of this._faceTriangleMap.entries()) {
            if (triangleIndex >= range.start && triangleIndex < range.end) {
                return faceValue;
            }
        }
        return null;
    }

    _buildFaceTriangleMap(diceobj) {
        this._faceTriangleMap = new Map();
        if (!this.dieMesh?.geometry) return;

        const geo = this.dieMesh.geometry;
        const index = geo.index;
        if (!index) return;

        if (geo.groups && geo.groups.length > 0) {
            for (let g = 0; g < geo.groups.length; g++) {
                const group = geo.groups[g];
                const triStart = group.start / 3;
                const triEnd = (group.start + group.count) / 3;
                if (g > 0 && g - 1 < diceobj.values.length) {
                    this._faceTriangleMap.set(diceobj.values[g - 1], { start: triStart, end: triEnd });
                }
            }
        } else {
            const totalTriangles = index.count / 3;
            const numFaces = diceobj.values.length + 1;
            const trisPerFace = Math.floor(totalTriangles / numFaces);
            for (let i = 0; i < diceobj.values.length; i++) {
                const start = (i + 1) * trisPerFace;
                const end = (i + 2) * trisPerFace;
                this._faceTriangleMap.set(diceobj.values[i], { start, end });
            }
        }
    }

    _updateHighlights() {
        if (!this.dieMesh?.material?.emissiveMap) return;
        const mat = this.dieMesh.material;
        if (!mat.userData?.materialData) return;

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
        this.box.renderScene();
    }

    /**
     * Set a new die mesh in the preview scene.
     */
    async setDie(dieType, appearance, diceLibrary = null) {
        if (this.dieMesh) {
            this.box.scene.remove(this.dieMesh);
            this.dieMesh = null;
        }

        const scopedTextureCache = this.box.renderer.scopedTextureCache;
        if (!scopedTextureCache) return;

        this.dieMesh = await this.diceFactory.create(scopedTextureCache, dieType, appearance, diceLibrary);
        if (!this.dieMesh) return;

        this.dieMesh.scale.multiplyScalar(2);
        this.box.scene.add(this.dieMesh);

        const diceobj = this.diceFactory.getPresetBySystem(dieType, appearance.system || "standard");
        if (diceobj) {
            this._buildFaceTriangleMap(diceobj);
        }
    }

    /**
     * Refresh the die mesh (e.g., after property change).
     */
    async refresh(dieType, appearance, diceLibrary = null) {
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
        this.box.camera.aspect = width / height;
        this.box.camera.updateProjectionMatrix();
        this.box.renderer.setSize(width, height);
    }

    /**
     * Clean up resources.
     */
    dispose() {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
        if (this.box) {
            this.box.clearScene();
            // Don't dispose the renderer — it's shared via game.dice3d.dice3dRenderers.editor
            if (this.box.renderer.domElement.parentNode) {
                this.box.renderer.domElement.parentNode.removeChild(this.box.renderer.domElement);
            }
            this.box = null;
        }
    }
}
