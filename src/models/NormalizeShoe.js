import * as THREE from 'three';

// Asset convention: Y up, toe along +Z. Long-axis detection cannot infer toe direction.
export function normalizeShoe(model, length = 0.26) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  if (!Number.isFinite(longest) || longest < 1e-6 || size.y <= 0) throw new Error('The GLB has no usable shoe geometry.');
  const centered = new THREE.Group();
  centered.add(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const wrapper = new THREE.Group();
  wrapper.add(centered);
  if (size.x > size.z) centered.rotation.y = -Math.PI / 2;
  wrapper.scale.setScalar(length / longest);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}
