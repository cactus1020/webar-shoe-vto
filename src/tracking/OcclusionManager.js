/**
 * OcclusionManager.js
 * Production Phantom Z-Buffer Depth Occlusion Engine (Prescription Standard)
 * 
 * Pipeline:
 * 1. Invisible Anatomical Occluder Mesh: Lower Leg/Ankle Cylinder + Foot Core Capsule
 * 2. Writes to Depth Buffer: colorWrite: false, depthWrite: true, depthFunc: LessEqualDepth
 * 3. Render Order: renderOrder = 0 (Evaluated before shoe product meshes at renderOrder = 1)
 * 4. Result: Leg and ankle physically enter the shoe collar cavity, masking rear walls.
 */
import * as THREE from 'three';

export class OcclusionManager {
  constructor(threeScene) {
    this.threeScene = threeScene;
    this.isDebug = false;
    this.isEnabled = true; // Enabled by default for realistic wear

    this.occluderMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthFunc: THREE.LessEqualDepth
    });

    this.debugMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: true
    });

    // Left Foot Phantom Assembly
    this.leftAssembly = this.createFootwearOccluderGroup('Left_Phantom_Occluder', false);
    this.leftOccluderGroup = this.leftAssembly.group;
    this.leftLegMesh = this.leftAssembly.legMesh;

    // Right Foot Phantom Assembly
    this.rightAssembly = this.createFootwearOccluderGroup('Right_Phantom_Occluder', true);
    this.rightOccluderGroup = this.rightAssembly.group;
    this.rightLegMesh = this.rightAssembly.legMesh;

    this.threeScene.add(this.leftOccluderGroup);
    this.threeScene.add(this.rightOccluderGroup);
  }

  createFootwearOccluderGroup(name, isRight) {
    const group = new THREE.Group();
    group.name = name;
    const mat = this.isDebug ? this.debugMaterial : this.occluderMaterial;

    // 1. Lower Shin & Ankle Cylinder (Entering the collar cavity)
    const legGeo = new THREE.CylinderGeometry(0.046, 0.038, 0.28, 28);
    legGeo.translate(0, 0.11, -0.02);
    const legMesh = new THREE.Mesh(legGeo, mat);
    legMesh.renderOrder = 0;

    // 2. Anatomical Foot Core Capsule (Inside the shoe vamp)
    const footCoreGeo = new THREE.CapsuleGeometry(0.036, 0.13, 12, 24);
    footCoreGeo.rotateX(Math.PI / 2);
    footCoreGeo.translate(0, -0.025, 0.045);
    const footCoreMesh = new THREE.Mesh(footCoreGeo, mat);
    footCoreMesh.renderOrder = 0;

    group.add(legMesh, footCoreMesh);
    group.renderOrder = 0;
    group.visible = false;

    return { group, legMesh, footCoreMesh };
  }

  update(leftFoot, rightFoot) {
    this.updateSingleOccluder(this.leftAssembly, leftFoot);
    this.updateSingleOccluder(this.rightAssembly, rightFoot);
  }

  updateSingleOccluder(assembly, foot) {
    const group = assembly.group;
    if (!this.isEnabled && !this.isDebug) {
      group.visible = false;
      return;
    }

    if (!foot || !foot.isTracked || foot.opacity < 0.05) {
      group.visible = false;
      return;
    }

    // Image-only heel/toe fits do not recover leg depth or foot volume.
    // A guessed capsule otherwise masks the visible shoe upper in top-down views.
    if (foot.trackingSource === 'image-landmarks' || foot.trackingSource === 'manual') {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(foot.position);
    group.quaternion.copy(foot.quaternion);

    const s = foot.scale ? foot.scale.x : 1;
    group.scale.set(s, s, s);
  }

  setDebug(enabled) {
    this.isDebug = enabled;
    const mat = this.isDebug ? this.debugMaterial : this.occluderMaterial;
    [this.leftAssembly, this.rightAssembly].forEach(assy => {
      assy.legMesh.material = mat;
      assy.footCoreMesh.material = mat;
    });
  }

  toggleDebug() {
    this.isDebug = !this.isDebug;
    this.isEnabled = true;
    this.setDebug(this.isDebug);
    return this.isDebug;
  }
}
