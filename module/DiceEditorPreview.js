import {
    Color,
    Quaternion,
    Raycaster,
    Triangle,
    Vector2,
    Vector3
} from 'three';
import { DiceBox } from './DiceBox.js';
import { Dice3D } from './Dice3D.js';
import { DICE_SHAPE } from './DiceModels.js';

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
            if (!this.dieMesh) {
                console.log("[DSN Editor] Click ignored: no dieMesh");
                return;
            }

            const rect = this.box.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            console.log("[DSN Editor] Click at NDC:", this.mouse.x.toFixed(3), this.mouse.y.toFixed(3));

            this.raycaster.setFromCamera(this.mouse, this.box.camera);
            const intersects = this.raycaster.intersectObject(this.dieMesh, true);
            console.log("[DSN Editor] Intersects:", intersects.length);
            if (intersects.length === 0) return;

            const hit = intersects[0];
            console.log("[DSN Editor] Hit faceIndex:", hit.faceIndex, "distance:", hit.distance.toFixed(2));

            const faceValue = this._hitToFaceValue(hit);
            console.log("[DSN Editor] Mapped faceValue:", faceValue);
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

    /**
     * Determine the face value at the raycast hit point by comparing
     * the hit triangle's normal against the known face normals from DICE_SHAPE.
     */
    _hitToFaceValue(hit) {
        if (!this._faceNormals) {
            console.log("[DSN Editor] No face normals built");
            return null;
        }

        // Get the hit triangle's face normal in mesh-local space
        const localNormal = hit.face.normal.clone();

        // Find the closest face normal
        let bestValue = null;
        let bestAngle = Math.PI;
        for (const { normal, value } of this._faceNormals) {
            const angle = localNormal.angleTo(normal);
            if (angle < bestAngle) {
                bestAngle = angle;
                bestValue = value;
            }
        }

        console.log("[DSN Editor] Hit normal:", `(${localNormal.x.toFixed(3)}, ${localNormal.y.toFixed(3)}, ${localNormal.z.toFixed(3)})`,
            "→ face", bestValue, `(angle: ${(bestAngle * 180 / Math.PI).toFixed(1)}°)`);
        return bestValue;
    }

    /**
     * Build face normals from DICE_SHAPE vertex/face data.
     * Each entry: { normal: Vector3, value: number }
     */
    _buildFaceNormals(diceobj) {
        this._faceNormals = null;
        const shapeData = DICE_SHAPE[diceobj.shape];
        if (!shapeData || !shapeData.vertices || !shapeData.faces) {
            console.log("[DSN Editor] No DICE_SHAPE data for", diceobj.shape);
            return;
        }

        const verts = shapeData.vertices.map(v => new Vector3(v[0], v[1], v[2]));
        this._faceNormals = [];

        for (let i = 0; i < shapeData.faces.length; i++) {
            const face = shapeData.faces[i];
            // Face value: last element if skipLastFaceIndex, otherwise from faceValues
            const faceValue = shapeData.faceValues[i];
            if (faceValue === 0) continue; // skip non-value faces (e.g. d2 cylinder sides)

            // Compute normal from first 3 vertices of the face
            const tri = new Triangle(verts[face[0]], verts[face[1]], verts[face[2]]);
            const normal = new Vector3();
            tri.getNormal(normal);

            this._faceNormals.push({ normal, value: faceValue });
        }

        console.log("[DSN Editor] Built", this._faceNormals.length, "face normals for", diceobj.shape,
            "values:", this._faceNormals.map(f => f.value));
    }

    _updateHighlights() {
        if (!this.dieMesh?.material?.emissiveMap) return;
        const mat = this.dieMesh.material;
        if (!mat.userData?.materialData) return;

        if (this._hasGlow) {
            // When glow is active, the emissive is used for the bloom effect.
            // Don't override it for selection highlights.
            mat.emissive = new Color(0xffffff);
            mat.emissiveIntensity = 0.7;
        } else if (this.selectedFaces.size > 0) {
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
        // Guard against concurrent calls — each call gets a unique token;
        // if a newer call starts before we finish, we abandon this one.
        const token = this._setDieToken = {};

        if (this.dieMesh) {
            this.box.scene.remove(this.dieMesh);
            this.dieMesh = null;
        }

        const scopedTextureCache = this.box.renderer.scopedTextureCache;
        if (!scopedTextureCache) return;

        const mesh = await this.diceFactory.create(scopedTextureCache, dieType, appearance, diceLibrary);
        if (this._setDieToken !== token) return; // superseded by a newer call
        if (!mesh) return;

        this.dieMesh = mesh;
        this.dieMesh.scale.multiplyScalar(2);
        this.box.scene.add(this.dieMesh);

        // Track whether glow is active (set in createMaterial) so _updateHighlights
        // knows not to overwrite the emissive values.
        this._hasGlow = !!this.dieMesh.material?.userData?.emissiveMapGlow;

        const diceobj = this.diceFactory.getPresetBySystem(dieType, appearance.system || "standard");
        if (diceobj) {
            this._buildFaceNormals(diceobj);
        }
    }

    /**
     * Refresh the die mesh (e.g., after property change).
     */
    async refresh(dieType, appearance, diceLibrary = null) {
        if (appearance.libraryDieId) {
            this.diceFactory.disposeCachedMaterials();
        }
        // Preserve the user's current rotation across mesh rebuilds
        const savedRotation = this.dieMesh ? this.dieMesh.quaternion.clone() : null;
        const savedSelection = new Set(this.selectedFaces);
        this.selectedFaces.clear();
        await this.setDie(dieType, appearance, diceLibrary);
        if (savedRotation && this.dieMesh) {
            this.dieMesh.quaternion.copy(savedRotation);
        }
        this.selectedFaces = savedSelection;
        this._updateHighlights();
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
            // Don't call clearScene() — it uses removeTicker which matches by function
            // reference on the prototype, so it would remove the showcase's animateSelector
            // from the PIXI ticker too. Just clean up the scene children instead.
            while (this.box.scene.children.length > 0) {
                this.box.scene.remove(this.box.scene.children[0]);
            }
            // Don't dispose the renderer — it's shared via game.dice3d.dice3dRenderers.editor
            if (this.box.renderer.domElement.parentNode) {
                this.box.renderer.domElement.parentNode.removeChild(this.box.renderer.domElement);
            }
            this.box = null;
        }
    }
}
