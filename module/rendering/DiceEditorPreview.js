import {
    Quaternion,
    Raycaster,
    Triangle,
    Vector2,
    Vector3
} from 'three';
import { DiceScene } from '../engine/DiceScene.js';
import { LEGACY_TO_METERS } from '../engine/SceneConstants.js';
import { Dice3D } from '../Dice3D.js';
import { DICE_SHAPE } from '../engine/DiceModels.js';
import { Utils } from '../Utils.js';

//wraps a DiceScene with manual mesh rotation + face raycasting
export class DiceEditorPreview {

    constructor(container, diceFactory) {
        this.container = container;
        this.diceFactory = diceFactory;
        this.dieMesh = null;
        this.selectedFaces = new Set();
        this.onFaceSelect = null;
        this.diceScene = null;
    }

    async init() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;

        const config = foundry.utils.mergeObject(
            Dice3D.ALL_CONFIG(),
            {
                rendererCacheKey: "editor",
                dimensions: { width, height },
                autoscale: false,
                scale: 60
            }
        );

        this.diceScene = new DiceScene(this.container, this.diceFactory, config);
        await this.diceScene.initialize();
        this.diceScene.setupBloomPipeline();

        this.diceScene.camera.position.set(150 * LEGACY_TO_METERS, 540 * LEGACY_TO_METERS, 200 * LEGACY_TO_METERS);
        this.diceScene.camera.lookAt(0, 0, 0);
        this.diceScene.camera.updateProjectionMatrix();

        this._initControls();
        this._initRaycasting();
        canvas.app.ticker.add(this._animate, this);
    }

    _initControls() {
        //right-drag rotates the mesh (not camera) so HDR lighting changes
        this._isDragging = false;
        this._prevMouse = { x: 0, y: 0 };
        const canvas = this.diceScene.renderer.domElement;

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

            //camera-relative axes so drag direction always feels natural
            const speed = 0.01;
            const cameraRight = new Vector3();
            const cameraUp = new Vector3();
            cameraRight.setFromMatrixColumn(this.diceScene.camera.matrixWorld, 0);
            cameraUp.setFromMatrixColumn(this.diceScene.camera.matrixWorld, 1);

            const qX = new Quaternion().setFromAxisAngle(cameraUp, dx * speed);
            const qY = new Quaternion().setFromAxisAngle(cameraRight, dy * speed);
            this.dieMesh.quaternion.premultiply(qX).premultiply(qY);
        });

        this._onWindowMouseUp = (e) => {
            if (e.button === 2) this._isDragging = false;
        };
        window.addEventListener("mouseup", this._onWindowMouseUp);
    }

    _initRaycasting() {
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.diceScene.renderer.domElement.addEventListener("click", (event) => {
            if (!this.dieMesh) return;

            const rect = this.diceScene.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.diceScene.camera);
            const intersects = this.raycaster.intersectObject(this.dieMesh, true);
            if (intersects.length === 0) return;

            const hit = intersects[0];
            const faceValue = this._hitToFaceValue(hit);
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

            if (this.onFaceSelect) {
                this.onFaceSelect(new Set(this.selectedFaces));
            }
        });
    }

    //compare hit triangle normal against known face normals from DICE_SHAPE
    _hitToFaceValue(hit) {
        if (!this._faceNormals) return null;

        const localNormal = hit.face.normal.clone();

        let bestValue = null;
        let bestAngle = Math.PI;
        for (const { normal, value } of this._faceNormals) {
            const angle = localNormal.angleTo(normal);
            if (angle < bestAngle) {
                bestAngle = angle;
                bestValue = value;
            }
        }

        return bestValue;
    }

    _buildFaceNormals(diceobj) {
        this._faceNormals = null;
        this._shapeToTypeValue = {};
        const shapeData = DICE_SHAPE[diceobj.shape];
        if (!shapeData) return;

        this._faceNormals = [];

        //for inherited shapes (df->d6, d3->d6, etc), values cycle
        const mapToTypeValue = (shapeFaceValue) => {
            return diceobj.values[(shapeFaceValue - 1) % diceobj.values.length];
        };

        if (shapeData.type === "Cylinder") {
            const valueFaceValues = shapeData.faceValues.filter(v => v !== 0);
            if (valueFaceValues.length >= 2) {
                this._faceNormals.push({ normal: new Vector3(0, 1, 0), value: valueFaceValues[1] });
                this._faceNormals.push({ normal: new Vector3(0, -1, 0), value: valueFaceValues[0] });
                for (const sfv of valueFaceValues) {
                    this._shapeToTypeValue[sfv] = mapToTypeValue(sfv);
                }
            }
        } else if (shapeData.vertices && shapeData.faces) {
            const verts = shapeData.vertices.map(v => new Vector3(v[0], v[1], v[2]));

            for (let i = 0; i < shapeData.faces.length; i++) {
                const face = shapeData.faces[i];
                const shapeFaceValue = shapeData.faceValues[i];
                if (shapeFaceValue === 0) continue;

                const tri = new Triangle(verts[face[0]], verts[face[1]], verts[face[2]]);
                const normal = new Vector3();
                tri.getNormal(normal);

                this._faceNormals.push({ normal, value: shapeFaceValue });
                this._shapeToTypeValue[shapeFaceValue] = mapToTypeValue(shapeFaceValue);
            }
        }

        this._typeValueLabels = {};
        const labels = Array.isArray(diceobj.labels[0]) ? diceobj.labels[0] : diceobj.labels;
        const edgeOffset = labels.length - diceobj.values.length;
        for (let i = 0; i < diceobj.values.length; i++) {
            const label = labels[i + edgeOffset];
            if (label !== undefined && typeof label === 'string') {
                this._typeValueLabels[diceobj.values[i]] = label;
            }
        }
    }

    _animate() {
        this.diceScene.renderScene();
    }

    async setDie(dieType, appearance, diceLibrary = null) {
        //guard against concurrent calls - newer call supersedes
        const token = this._setDieToken = {};

        if (this.dieMesh) {
            this.diceScene.scene.remove(this.dieMesh);
            this.dieMesh = null;
        }

        const scopedTextureCache = this.diceScene.renderer.scopedTextureCache;
        if (!scopedTextureCache) return;

        const mesh = await this.diceFactory.create(scopedTextureCache, dieType, appearance, diceLibrary);
        if (this._setDieToken !== token) return;
        if (!mesh) return;

        this.dieMesh = mesh;
        this.dieMesh.scale.multiplyScalar(1.7);
        this.diceScene.scene.add(this.dieMesh);

        const diceobj = this.diceFactory.getPresetBySystem(dieType, appearance.system || "standard");
        if (diceobj) {
            this._buildFaceNormals(diceobj);
        }
    }

    async refresh(dieType, appearance, diceLibrary = null) {
        if (appearance.libraryDieId) {
            this.diceFactory.disposeCachedMaterials();
        }
        //preserve rotation across mesh rebuilds
        const savedRotation = this.dieMesh ? this.dieMesh.quaternion.clone() : null;
        const savedSelection = new Set(this.selectedFaces);
        this.selectedFaces.clear();
        await this.setDie(dieType, appearance, diceLibrary);
        if (savedRotation && this.dieMesh) {
            this.dieMesh.quaternion.copy(savedRotation);
        }
        this.selectedFaces = savedSelection;
    }

    resize() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 300;
        this.diceScene.camera.aspect = width / height;
        this.diceScene.camera.updateProjectionMatrix();
        this.diceScene.renderer.setSize(width, height);
    }

    dispose() {
        if (this._onWindowMouseUp) {
            window.removeEventListener("mouseup", this._onWindowMouseUp);
            this._onWindowMouseUp = null;
        }
        Utils.removeTicker(this._animate);
        if (this.diceScene) {
            this.diceScene.clearScene();
            //renderer is shared via dice3dRenderers.editor, don't dispose it
            if (this.diceScene.renderer.domElement.parentNode) {
                this.diceScene.renderer.domElement.parentNode.removeChild(this.diceScene.renderer.domElement);
            }
            this.diceScene = null;
        }
    }
}
