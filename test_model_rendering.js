import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeShoe } from './src/models/NormalizeShoe.js';
import { ShoeManager } from './src/models/ShoeManager.js';

for (const dimensions of [[4, 1, 2], [2, 1, 4]]) {
  const root = new THREE.Group();
  root.position.set(12, 3, -7);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshStandardMaterial()));
  const shoe = normalizeShoe(root);
  const box = new THREE.Box3().setFromObject(shoe);
  assert.ok(box.getCenter(new THREE.Vector3()).length() < 1e-6, 'Off-origin GLBs must be centered');
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).z - 0.26) < 1e-6, 'Either horizontal long axis must normalize to +Z');
}
assert.throws(() => normalizeShoe(new THREE.Group()), /geometry/);
const manager = new ShoeManager({ add() {} });
manager.gltfLoader.loadAsync = async () => ({ scene: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), new THREE.MeshStandardMaterial()) });
await manager.loadGLTF('fixture.glb');
let left, right;
manager.leftMeshGroup.traverse(mesh => { if (mesh.isMesh) left = mesh; });
manager.rightMeshGroup.traverse(mesh => { if (mesh.isMesh) right = mesh; });
assert.notEqual(left.material, right.material, 'Foot fades must not share materials');
left.material.opacity = 0.2;
assert.equal(right.material.opacity, 1);
let resolve;
manager.gltfLoader.loadAsync = () => new Promise(done => { resolve = done; });
const loading = manager.loadGLTF('slow.glb');
manager.loadStyle('retro-white');
resolve({ scene: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), new THREE.MeshStandardMaterial()) });
assert.equal(await loading, null, 'Late GLB response must not replace newer selection');
assert.equal(manager.currentStyleId, 'retro-white');
console.log('Model rendering regression checks passed: centering, axis, invalid geometry, material isolation and load races.');
