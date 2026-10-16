/**
 * test_vto_simulation.js
 * Automated validation test for WebAR Shoe VTO Pipeline:
 * 1. Pinhole depth estimation & unprojection
 * 2. Orthonormal basis & orientation
 * 3. 30-Frame Temporal Foot Memory convergence & stability score
 * 4. 24-Point DenseFootMesh control points
 * 5. 3D Thin-Plate Spline (TPS) non-rigid deformation solver
 */
import * as THREE from 'three';
import { TPSDeformer3D } from './src/tracking/TPSDeformer.js';
import { DenseFootMesh } from './src/tracking/DenseFootMesh.js';
import { TemporalFootMemory } from './src/tracking/TemporalFootMemory.js';
import { HighDensityFootTracker, GramSchmidtPoseSolver, PoseFilter3D } from './src/tracking/HighDensityFootTracker.js';
import { OcclusionManager } from './src/tracking/OcclusionManager.js';
import { ProceduralSneaker } from './src/models/ProceduralSneaker.js';

console.log('====================================================');
console.log('🧪 RUNNING AUTOMATED WebAR VTO SIMULATION TESTS');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    if (details) console.log(`   └─ ${details}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   └─ ${details}`);
  }
}

// ----------------------------------------------------
// TEST 1: TPSDeformer3D Mathematical Solver Test
// ----------------------------------------------------
console.log('\n--- TEST 1: 3D Thin-Plate Spline Solver ---');
const tps = new TPSDeformer3D(0.0005);
const denseMesh = new DenseFootMesh();
const canonicalPoints = denseMesh.getCanonicalPoints(true);

// Create a realistic foot contour target with 15% wider ball and 10% higher arch
const targetPoints = canonicalPoints.map(p => {
  const t = p.clone();
  // Wider forefoot
  if (t.z > 0.02) t.x *= 1.15;
  // Higher instep arch
  if (t.y > 0.03 && t.z < 0.05) t.y *= 1.10;
  return t;
});

const tpsSolved = tps.solve(canonicalPoints, targetPoints);
assert(tpsSolved === true, 'TPSDeformer3D solves without singularity');
assert(tps.isTrained === true, 'TPSDeformer3D trained flag is true');

// Test point transformation
const testVertex = new THREE.Vector3(0.04, 0.03, 0.05);
const warpedVertex = tps.transformPoint(testVertex);
assert(!isNaN(warpedVertex.x) && !isNaN(warpedVertex.y) && !isNaN(warpedVertex.z), 'Warped vertex contains valid finite numbers', `Warped: (${warpedVertex.x.toFixed(4)}, ${warpedVertex.y.toFixed(4)}, ${warpedVertex.z.toFixed(4)})`);

// ----------------------------------------------------
// TEST 2: BufferGeometry Mesh Deformation Test
// ----------------------------------------------------
console.log('\n--- TEST 2: BufferGeometry Deformation ---');
const boxGeom = new THREE.BoxGeometry(0.08, 0.06, 0.26, 8, 8, 8);
const basePositions = new Float32Array(boxGeom.attributes.position.array);

tps.deformGeometry(boxGeom, basePositions);
const posArray = boxGeom.attributes.position.array;
let hasNaN = false;
let maxDisplacement = 0;

for (let i = 0; i < posArray.length; i += 3) {
  if (isNaN(posArray[i]) || isNaN(posArray[i + 1]) || isNaN(posArray[i + 2])) {
    hasNaN = true;
  }
  const dx = posArray[i] - basePositions[i];
  const dy = posArray[i + 1] - basePositions[i + 1];
  const dz = posArray[i + 2] - basePositions[i + 2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > maxDisplacement) maxDisplacement = dist;
}

assert(!hasNaN, 'Deformed geometry has zero NaNs');
assert(maxDisplacement > 0.0001, 'Deformed geometry vertices actively moved to match foot contour', `Max displacement = ${(maxDisplacement * 1000).toFixed(2)} mm`);

// ----------------------------------------------------
// TEST 3: 30-Frame Temporal Memory Buffer Convergence
// ----------------------------------------------------
console.log('\n--- TEST 3: 30-Frame Temporal Memory Buffer ---');
const tempMemory = new TemporalFootMemory(30);

// Simulate stationary foot over 30 frames with slight camera sensor noise (+/- 2mm)
const truePos = new THREE.Vector3(0.08, -0.25, -0.55);
const trueQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
const trueScale = new THREE.Vector3(1.02, 1.02, 1.02);
const trueHeel = new THREE.Vector3(0.08, -0.32, -0.52);
const trueToe = new THREE.Vector3(0.08, -0.18, -0.58);
const trueAnkle = new THREE.Vector3(0.08, -0.28, -0.48);
const trueKnee = new THREE.Vector3(0.08, 0.05, -0.42);

let lastFused = null;
for (let frame = 0; frame < 30; frame++) {
  const noiseX = (Math.random() - 0.5) * 0.004; // 2mm noise
  const noiseY = (Math.random() - 0.5) * 0.004;
  const noisyPos = truePos.clone().add(new THREE.Vector3(noiseX, noiseY, 0));

  lastFused = tempMemory.update(
    'right',
    noisyPos,
    trueQuat,
    trueScale,
    trueHeel,
    trueToe,
    trueAnkle,
    trueKnee,
    0.95,
    frame * 0.033
  );
}

assert(lastFused !== null, 'Temporal memory produces fused state');
assert(lastFused.stabilityScore > 0.70, 'Stability score reaches locked state (> 0.70)', `Stability Score: ${(lastFused.stabilityScore * 100).toFixed(1)}%`);
const posError = lastFused.position.distanceTo(truePos);
assert(posError < 0.003, 'Temporal fused position error < 3mm against true position', `Error: ${(posError * 1000).toFixed(2)} mm`);

// ----------------------------------------------------
// TEST 4: Full HighDensityFootTracker End-to-End Test
// ----------------------------------------------------
console.log('\n--- TEST 4: HighDensityFootTracker End-to-End ---');
const mockScene = { fov: 50 };
const tracker = new HighDensityFootTracker(mockScene);

// Simulate full 33-point MediaPipe landmarks for top-down view (user looking at bare feet)
const mockLandmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

// Right foot (normalized screen coords from top-down camera)
mockLandmarks[28] = { x: 0.62, y: 0.58, z: -0.05, visibility: 0.95 }; // Right Ankle
mockLandmarks[30] = { x: 0.62, y: 0.68, z: -0.02, visibility: 0.95 }; // Right Heel
mockLandmarks[32] = { x: 0.63, y: 0.38, z: -0.08, visibility: 0.95 }; // Right Toe
mockLandmarks[26] = { x: 0.60, y: 0.85, z: 0.15, visibility: 0.85 };  // Right Knee

// Container & video dims (iPhone 13 portrait: 390x844 container, 1920x1080 video)
const cw = 390, ch = 844, vw = 1080, vh = 1920;

let feetState = null;
for (let f = 0; f < 15; f++) {
  feetState = tracker.update(mockLandmarks, null, cw, ch, vw, vh);
}

const rightFoot = feetState.right;
assert(rightFoot.isTracked === true, 'Right foot is successfully tracked');
assert(rightFoot.confidence > 0.8, 'Foot tracking confidence is high (> 0.8)', `Confidence: ${(rightFoot.confidence * 100).toFixed(1)}%`);
assert(rightFoot.position.z < 0, 'Shoe 3D position is in front of camera (Z < 0)', `Pos Z: ${rightFoot.position.z.toFixed(3)} m`);
assert(rightFoot.scale.x >= 0.7 && rightFoot.scale.x <= 1.5, 'Shoe scale is anatomically realistic (0.7 - 1.5)', `Scale: ${rightFoot.scale.x.toFixed(2)}x`);
assert(rightFoot.tpsDeformer.isTrained === true, 'Real-time 3D TPS deformer is active and trained on foot state');

// ----------------------------------------------------
// TEST 5: Visual Scale Telemetry & Ground Contact Shadow
// ----------------------------------------------------
console.log('\n--- TEST 5: Visual Scale Telemetry & Ground Shadow ---');
const scaleTelemetry = tracker.getVisualScaleTelemetry();
assert(scaleTelemetry !== null, 'Visual scale telemetry is available from tracking');
assert(scaleTelemetry.source === 'uncalibrated-tracking', 'Tracking telemetry is marked as uncalibrated');
assert(scaleTelemetry.lengthProxyM >= 0.20 && scaleTelemetry.lengthProxyM <= 0.32, 'Visual foot-length proxy is within placement range', `Proxy: ${scaleTelemetry.lengthProxyM} m`);
assert(scaleTelemetry.euSize === undefined && scaleTelemetry.usSize === undefined, 'Tracking telemetry does not emit shoe-size recommendations');

// ----------------------------------------------------
// TEST 6: FootNet Master ONNX Engine & YOLOv8-Pose Tensor Inference
// ----------------------------------------------------
console.log('\n--- TEST 6: FootNet Neural Model & Keypoint Pipeline ---');
import * as ort from 'onnxruntime-web';

const session = await ort.InferenceSession.create('public/models/footnet_master.onnx', {
  executionProviders: ['wasm']
});
assert(session !== null, 'FootNet Master ONNX model loads in WASM');
assert(session.inputNames.length === 1 && session.inputNames[0] === 'images', 'Model input tensor is named "images"');
assert(session.outputNames.length === 1 && session.outputNames[0] === 'output0', 'Model output tensor is named "output0"');

// Create test input tensor [1, 3, 256, 256]
const testInput = new ort.Tensor('float32', new Float32Array(1 * 3 * 256 * 256), [1, 3, 256, 256]);
const runResult = await session.run({ images: testInput });
const outTensor = runResult.output0;
assert(outTensor.dims[0] === 1 && outTensor.dims[1] === 23 && outTensor.dims[2] === 1344, 'Inference output tensor shape matches [1, 23, 1344]', `Shape: [${outTensor.dims.join(', ')}]`);

// ----------------------------------------------------
// TEST 7: 6DoF Gram-Schmidt Orthogonal Basis & Quaternion Solver
// ----------------------------------------------------
console.log('\n--- TEST 7: 6DoF Gram-Schmidt Orthogonal Basis Solver ---');
const pAnkle = new THREE.Vector3(0.08, -0.28, -0.48);
const pHeel = new THREE.Vector3(0.08, -0.32, -0.52);
const pToe = new THREE.Vector3(0.08, -0.18, -0.58);

const basisResult = GramSchmidtPoseSolver.solveBasisFrom3Points(pAnkle, pHeel, pToe);
assert(basisResult !== null && basisResult.quaternion !== undefined, 'GramSchmidtPoseSolver returns valid basis result');
assert(!isNaN(basisResult.quaternion.x) && !isNaN(basisResult.quaternion.w), 'Basis quaternion has no NaNs');

// Test strict 90 degree orthogonality
const dotRightFwd = basisResult.vRight.dot(basisResult.vFwd);
const dotUpFwd = basisResult.vUp.dot(basisResult.vFwd);
const dotRightUp = basisResult.vRight.dot(basisResult.vUp);
assert(Math.abs(dotRightFwd) < 1e-6, 'Right and Forward vectors are strictly orthogonal (dot = 0)', `dot: ${dotRightFwd.toFixed(7)}`);
assert(Math.abs(dotUpFwd) < 1e-6, 'Up and Forward vectors are strictly orthogonal (dot = 0)', `dot: ${dotUpFwd.toFixed(7)}`);
assert(Math.abs(dotRightUp) < 1e-6, 'Right and Up vectors are strictly orthogonal (dot = 0)', `dot: ${dotRightUp.toFixed(7)}`);

// Test PoseFilter3D quaternion slerp shortest path
const poseFilter = new PoseFilter3D(1.0, 0.08);
const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
const qFiltered = poseFilter.filterQuaternion(q1, 0.35);
assert(qFiltered !== null && !isNaN(qFiltered.x), 'PoseFilter3D filters quaternion successfully');

// Opposite hemisphere quaternion:
const qOpposite = new THREE.Quaternion(-q1.x, -q1.y, -q1.z, -q1.w);
const qHemisphere = poseFilter.filterQuaternion(qOpposite, 0.35);
assert(qHemisphere.dot(qFiltered) > 0.9, 'Shortest-path hemisphere dot check prevents 180° quaternion spin glitch');

// ----------------------------------------------------
// TEST 8: Phantom Z-Buffer Depth Occlusion Architecture
// ----------------------------------------------------
console.log('\n--- TEST 8: Phantom Z-Buffer Depth Occlusion Engine ---');
const dummyScene = { add: () => {} };
const occManager = new OcclusionManager(dummyScene);
assert(occManager.isEnabled === true, 'OcclusionManager is enabled by default for realistic wear');
assert(occManager.occluderMaterial.colorWrite === false, 'Occluder material colorWrite is false (invisible depth only)');
assert(occManager.occluderMaterial.depthWrite === true, 'Occluder material depthWrite is true (writes to Z-buffer)');
assert(occManager.leftAssembly.legMesh.renderOrder === 0, 'Occluder leg mesh renderOrder is 0 (first pass)');
assert(occManager.leftAssembly.footCoreMesh.renderOrder === 0, 'Occluder foot core capsule renderOrder is 0 (first pass)');

const sneakerMesh = ProceduralSneaker.create('retro-white', true);
let productMeshesHaveRenderOrder1 = true;
sneakerMesh.traverse((child) => {
  if (child.isMesh && !child.userData.isShadow && child.name !== 'ContactShadow') {
    if (child.renderOrder !== 1) productMeshesHaveRenderOrder1 = false;
  }
});
assert(productMeshesHaveRenderOrder1 === true, 'All footwear product meshes have renderOrder = 1 (second pass after occluder)');

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
