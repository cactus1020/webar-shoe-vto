import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as ort from 'onnxruntime-web';
import { inferenceGeometry, modelPointToVideo, videoPointToScreen } from './src/core/FrameGeometry.js';
import { decodeFootPoses } from './src/core/FootPoseDecoder.js';
import { fitScreenFoot } from './src/tracking/ScreenFootFit.js';
import { HighDensityFootTracker } from './src/tracking/HighDensityFootTracker.js';
import { ShoeManager } from './src/models/ShoeManager.js';

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 0.001, message);
for (const [vw, vh, cw, ch] of [[1920, 1080, 390, 700], [1080, 1920, 390, 844], [1280, 720, 844, 390]]) {
  const geometry = inferenceGeometry(vw, vh, cw, ch);
  for (const [x, y] of [[0.1, 0.2], [0.9, 0.8], [0.5, 0.5]]) {
    const point = modelPointToVideo(geometry.padX + x * geometry.drawWidth, geometry.padY + y * geometry.drawHeight, geometry);
    const screen = videoPointToScreen(point, cw, ch, vw, vh);
    close(screen.screenX, x * cw, 'Crop/letterbox X must match the visible video');
    close(screen.screenY, y * ch, 'Crop/letterbox Y must match the visible video');
    close(videoPointToScreen(point, cw, ch, vw, vh, true).screenX, cw - x * cw, 'Front camera must mirror the overlay');
  }
}

function tensor(rows) {
  const data = new Float32Array(rows.length * 23);
  rows.forEach((row, i) => row.forEach((value, channel) => { data[channel * rows.length + i] = value; }));
  return { dims: [1, 23, rows.length], data };
}
function footRow(x, confidence = 0.8, heelY = 185, toeY = 90) {
  return [x, (heelY + toeY) / 2, 55, heelY - toeY + 30, confidence,
    x, heelY, 0.8, x, heelY - 10, 0.7, 0, 0, 0, 0, 0, 0, x, toeY, 0.8, x + 8, toeY + 5, 0.7];
}
const square = inferenceGeometry(256, 256, 256, 256);
const decoded = decodeFootPoses(tensor([footRow(70), footRow(71, 0.65, 180, 95), footRow(188)]), square);
assert.equal(decoded.feet.length, 2, 'NMS must suppress duplicate boxes');
close(decoded.landmarks[29].y, 185 / 256, 'Heel must come from the best detection, not the furthest candidate');
close(decoded.landmarks[31].y, 90 / 256, 'Toe must come from that same detection');
assert.equal(decodeFootPoses(tensor([footRow(70, 0.2)]), square), null, 'Low object confidence must be rejected');
const weakToe = footRow(70); weakToe[19] = 0.1;
assert.equal(decodeFootPoses(tensor([weakToe]), square), null, 'Low landmark confidence must be rejected');
const modest = decodeFootPoses(tensor([footRow(70, 0.45)]), square);
assert.ok(modest.landmarks[29].visibility < 0.5, 'Decoder must never inflate confidence to 0.75');
assert.equal(decodeFootPoses({ dims: [1, 56, 1], data: new Float32Array(56) }, square), null, 'Wrong model layout must be rejected');

const width = 390, height = 700;
const coordinate = (x, y) => ({ screenX: x, screenY: y, ndcX: x / width * 2 - 1, ndcY: 1 - y / height * 2 });
const scene = new THREE.Scene();
const shoes = new ShoeManager({ add: object => scene.add(object) });
const bounds = shoes.renderBounds;
const heel = coordinate(95, 550), toe = coordinate(80, 270);
const fit = fitScreenFoot(heel, toe, width, height, 50, bounds);
const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
for (const [z, expected] of [[bounds.minZ, heel], [bounds.maxZ, toe]]) {
  const projected = new THREE.Vector3(0, 0, z).multiplyScalar(fit.scale).applyQuaternion(fit.quaternion).add(fit.position).project(camera);
  close((projected.x + 1) / 2 * width, expected.screenX, 'Shoe endpoint X must align with the observed foot');
  close((1 - projected.y) / 2 * height, expected.screenY, 'Shoe endpoint Y must align with the observed foot');
}
const tracker = new HighDensityFootTracker({ fov: 50 });
tracker.renderBounds = bounds;
assert.ok(tracker.setScreenAnchors('left', { x: 95, y: 550 }, { x: 80, y: 270 }, width, height));
for (let i = 0; i < 20; i++) tracker.update(null, null, width, height, width, height);
assert.equal(tracker.feet.left.isTracked, true, 'Manual placement must persist without AI detections');
assert.equal(tracker.feet.left.confidence, 0, 'Manual placement must not pretend to be a confident AI detection');
tracker.clearManualAnchors();
assert.equal(tracker.feet.left.isTracked, false, 'Switching to Auto must clear manual placement');
for (let i = 0; i < 12; i++) tracker.update(decoded.landmarks, null, width, height, width, height);
assert.ok(tracker.feet.left.isTracked);
for (let i = 0; i < 12; i++) tracker.update(null, null, width, height, width, height);
assert.equal(tracker.feet.left.isTracked, false, 'Missing detections must hide stale shoes');

const release = JSON.parse(readFileSync('public/models/footnet-release.json', 'utf8'));
const bytes = readFileSync('public/models/' + release.file);
assert.equal(createHash('sha256').update(bytes).digest('hex'), release.sha256, 'Model version must match the trained artifact');
const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', new Float32Array(3 * 256 ** 2), [1, 3, 256, 256]) });
assert.deepEqual(output[session.outputNames[0]].dims, [1, 23, 1344], 'Active public model must run in WASM with the expected layout');
await session.release();
console.log('Tracking regression checks passed: crop, mirror, NMS, confidence, endpoint projection, manual persistence, loss handling and active model hash/WASM.');
