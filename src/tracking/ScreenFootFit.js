import * as THREE from 'three';

// Match the shoe's heel/toe projection to the observed image. Depth is a visual
// convention, not a measured floor plane or metric foot size.
export function fitScreenFoot(heel, toe, width, height, fov = 50, bounds = { minZ: -0.15, maxZ: 0.16 }) {
  const pixelLength = Math.hypot(toe.screenX - heel.screenX, toe.screenY - heel.screenY);
  if (!Number.isFinite(pixelLength) || pixelLength < 25 || !Number.isFinite(bounds.minZ) ||
      !Number.isFinite(bounds.maxZ) || bounds.maxZ - bounds.minZ < 0.001) return null;
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const depth = 0.26 * (height / 2) / tangent / pixelLength;
  const unproject = point => new THREE.Vector3(point.ndcX * depth * tangent * width / height,
    point.ndcY * depth * tangent, -depth);
  const heelWorld = unproject(heel), toeWorld = unproject(toe);
  const forward = toeWorld.clone().sub(heelWorld).normalize();
  const up = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  const scale = heelWorld.distanceTo(toeWorld) / (bounds.maxZ - bounds.minZ);
  const position = heelWorld.clone().add(toeWorld).multiplyScalar(0.5)
    .addScaledVector(forward, -(bounds.minZ + bounds.maxZ) / 2 * scale);
  return { position, quaternion, scale, heelWorld, toeWorld };
}
