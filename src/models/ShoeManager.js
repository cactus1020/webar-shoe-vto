/**
 * ShoeManager.js
 * Manages Left and Right 3D Shoe instances, dynamic style loading,
 * and Left/Right anatomical mirroring.
 */
import * as THREE from 'three';
import { normalizeShoe } from './NormalizeShoe.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralSneaker, SNEAKER_STYLES } from './ProceduralSneaker.js';

export class ShoeManager {
  constructor(threeScene) {
    this.threeScene = threeScene;
    this.currentStyleId = 'retro-white';
    this.gltfLoader = new GLTFLoader();

    this.leftRoot = new THREE.Group();
    this.leftRoot.name = 'Left_Shoe_Root';
    this.leftRoot.renderOrder = 1;

    this.rightRoot = new THREE.Group();
    this.rightRoot.name = 'Right_Shoe_Root';
    this.rightRoot.renderOrder = 1;

    this.threeScene.add(this.leftRoot);
    this.threeScene.add(this.rightRoot);

    this.leftMeshGroup = null;
    this.rightMeshGroup = null;

    this.loadStyle(this.currentStyleId);
  }

  loadStyle(styleId) {
    if (!SNEAKER_STYLES[styleId]) {
      styleId = 'retro-white';
    }
    this.loadRequest = (this.loadRequest || 0) + 1;
    this.currentStyleId = styleId;

    this.clearShoeMeshes();

    // Right Shoe (Canonical)
    this.rightMeshGroup = ProceduralSneaker.create(styleId, true);
    this.rightRoot.add(this.rightMeshGroup);

    // Left Shoe (Mirrored across X axis)
    this.leftMeshGroup = ProceduralSneaker.create(styleId, false);
    this.leftMeshGroup.scale.set(-1, 1, 1);
    
    // Ensure all materials on mirrored left shoe render both sides properly
    this.leftMeshGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { m.side = THREE.DoubleSide; });
        } else {
          child.material.side = THREE.DoubleSide;
        }
      }
    });

    this.leftRoot.add(this.leftMeshGroup);
    this.updateRenderBounds();

    return SNEAKER_STYLES[styleId];
  }

  async loadGLTF(source) {
    const ownedUrl = source instanceof File || source instanceof Blob;
    const url = ownedUrl ? URL.createObjectURL(source) : source;
    const request = this.loadRequest = (this.loadRequest || 0) + 1;
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const model = normalizeShoe(gltf.scene);
      if (request !== this.loadRequest) return null;
      this.clearShoeMeshes();
      model.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = child.receiveShadow = true;
        child.renderOrder = 1;
        const clone = m => { const copy = m.clone(); copy.side = THREE.DoubleSide; return copy; };
        child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
      });
      this.rightMeshGroup = model;
      this.leftMeshGroup = model.clone(true);
      // Independent materials prevent one foot's fade from changing the other.
      this.leftMeshGroup.traverse(child => {
        if (child.isMesh) child.material = Array.isArray(child.material)
          ? child.material.map(m => m.clone()) : child.material.clone();
      });
      this.leftMeshGroup.scale.x *= -1;
      this.rightRoot.add(model);
      this.leftRoot.add(this.leftMeshGroup);
      this.currentStyleId = 'custom';
      this.updateRenderBounds();
      return { id: 'custom', name: 'Custom GLB Model', price: 'Loaded' };
    } finally { if (ownedUrl) URL.revokeObjectURL(url); }
  }

  clearShoeMeshes() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const root of [this.leftRoot, this.rightRoot]) root.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      for (const mat of (Array.isArray(child.material) ? child.material : [child.material])) {
        if (!mat) continue;
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
    while (this.leftRoot.children.length > 0) {
      this.leftRoot.remove(this.leftRoot.children[0]);
    }
    while (this.rightRoot.children.length > 0) {
      this.rightRoot.remove(this.rightRoot.children[0]);
    }
    this.leftMeshGroup = null;
    this.rightMeshGroup = null;
  }

  updateRenderBounds() {
    this.rightRoot.updateWorldMatrix(true, true);
    const inverse = this.rightRoot.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    this.rightRoot.traverse(child => {
      if (!child.isMesh || child.name === 'ContactShadow' || child.userData.isShadow) return;
      child.geometry.computeBoundingBox();
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)));
    });
    this.renderBounds = { minZ: bounds.min.z, maxZ: bounds.max.z };
  }

  update(leftFoot, rightFoot) {
    this.updateSingleShoe(this.leftRoot, leftFoot);
    this.updateSingleShoe(this.rightRoot, rightFoot);
  }

  updateSingleShoe(rootGroup, footState) {
    if (!footState || !footState.isTracked || footState.opacity < 0.05) {
      rootGroup.visible = false;
      return;
    }

    rootGroup.visible = true;
    rootGroup.position.copy(footState.position);
    rootGroup.quaternion.copy(footState.quaternion);

    const s = footState.scale.x;
    rootGroup.scale.set(s, s, s);

    rootGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        // Exempt ground contact shadow meshes from disabling transparency
        const isShadow = child.name === 'ContactShadow' ||
                         child.userData.isShadow ||
                         (child.material && child.material.isShadowMaterial);

        if (isShadow) {
          const mat = child.material;
          mat.transparent = true;
          mat.depthWrite = false;
          mat.opacity = Math.min(0.60, footState.opacity * 0.60);
          return;
        }

        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.transparent = footState.opacity < 0.98;
            m.opacity = footState.opacity;
          });
        } else {
          child.material.transparent = footState.opacity < 0.98;
          child.material.opacity = footState.opacity;
        }
      }
    });
  }

  getStylesList() {
    return Object.values(SNEAKER_STYLES);
  }
}
