/**
 * HighDensityFootTracker.js
 * Production-Grade WebAR Foot Tracking & Non-Rigid TPS 3D Deformation Engine
 * 
 * Pipeline:
 * 1. 2D/3D Optical Landmark Detection (MediaPipe PoseLandmarker + OpticalFootDetector)
 * 2. 30-Frame Temporal Memory Buffer (TemporalFootMemory) for rock-solid stability
 * 3. 24-Point Parametric Anatomical Foot Reconstruction in LOCAL space (DenseFootMesh)
 * 4. 3D Thin-Plate Spline (TPS) Non-Rigid Mesh Warper (TPSDeformer3D)
 * 5. Screen-Space Depth & Pinhole Unprojection (Top-Down Camera Compatible)
 * 6. Continuous Visibility: shoes never vanish/flicker
 */
import * as THREE from 'three';
import { TPSDeformer3D } from './TPSDeformer.js';
import { DenseFootMesh } from './DenseFootMesh.js';
import { TemporalFootMemory } from './TemporalFootMemory.js';
import { videoPointToScreen } from '../core/FrameGeometry.js';
import { fitScreenFoot } from './ScreenFootFit.js';

// ────────────────────────────────────────────────────────────────
// 1-Euro Adaptive Low-Pass Filter (jitter reduction)
// ────────────────────────────────────────────────────────────────

export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.015, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(x, timestamp) {
    if (this.tPrev === null || timestamp === undefined) {
      this.xPrev = x;
      this.tPrev = timestamp || performance.now() * 0.001;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max(timestamp - this.tPrev, 0.001);
    this.tPrev = timestamp;

    const dx = (x - this.xPrev) / dt;
    const edx = this._lowpass(dx, this.dxPrev, dt, this.dCutoff);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const filteredX = this._lowpass(x, this.xPrev, dt, cutoff);
    this.xPrev = filteredX;
    return filteredX;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  _lowpass(x, xPrev, dt, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const alpha = 1.0 / (1.0 + tau / dt);
    return alpha * x + (1.0 - alpha) * xPrev;
  }
}

export class OneEuroVector3 {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterZ = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(v, timestamp) {
    return new THREE.Vector3(
      this.filterX.filter(v.x, timestamp),
      this.filterY.filter(v.y, timestamp),
      this.filterZ.filter(v.z, timestamp)
    );
  }

  reset() {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}

export class OneEuroQuaternion {
  constructor(minCutoff = 1.0, beta = 0.025, dCutoff = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterZ = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterW = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.prevQuat = new THREE.Quaternion();
  }

  filter(q, timestamp) {
    if (this.prevQuat.dot(q) < 0) {
      q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
    }
    this.prevQuat.copy(q);

    const out = new THREE.Quaternion(
      this.filterX.filter(q.x, timestamp),
      this.filterY.filter(q.y, timestamp),
      this.filterZ.filter(q.z, timestamp),
      this.filterW.filter(q.w, timestamp)
    );
    return out.normalize();
  }

  reset() {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
    this.filterW.reset();
    this.prevQuat.set(0, 0, 0, 1);
  }
}

export class OneEuroFilterScalar {
  constructor(freq = 60, minCutoff = 1.0, beta = 0.08, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.lastTime = null;
    this.lastCutoff = minCutoff;
  }

  filter(value, timestamp) {
    return this.x.filter(value, timestamp);
  }
}

export class PoseFilter3D {
  constructor(minCutoff = 1.0, beta = 0.08) {
    this.filters = [
      new OneEuroFilter(minCutoff, beta, 1.0),
      new OneEuroFilter(minCutoff, beta, 1.0),
      new OneEuroFilter(minCutoff, beta, 1.0),
    ];
    this.lastQuat = null;
  }

  setParams(minCutoff, beta) {
    for (const f of this.filters) {
      f.minCutoff = minCutoff;
      f.beta = beta;
    }
  }

  filterPosition(vec3, timestamp) {
    return new THREE.Vector3(
      this.filters[0].filter(vec3.x, timestamp),
      this.filters[1].filter(vec3.y, timestamp),
      this.filters[2].filter(vec3.z, timestamp)
    );
  }

  filterQuaternion(quat, slerpAlpha = 0.35) {
    if (!this.lastQuat) {
      this.lastQuat = quat.clone();
      return quat.clone();
    }
    let q = quat.clone();
    if (this.lastQuat.dot(q) < 0) {
      q.set(-q.x, -q.y, -q.z, -q.w);
    }
    this.lastQuat.slerp(q, slerpAlpha);
    return this.lastQuat.clone();
  }

  reset() {
    for (const f of this.filters) {
      f.reset();
    }
    this.lastQuat = null;
  }
}

export class GramSchmidtPoseSolver {
  static unprojectLandmark(lm, W, H, fx, fy, baseDepthZ) {
    const z = baseDepthZ - (lm.z || 0) * 0.35;
    const x = ((lm.x * W - W / 2) * -z) / fx;
    const y = -((lm.y * H - H / 2) * -z) / fy;
    return new THREE.Vector3(x, y, z);
  }

  static solveBasisFrom3Points(pOrigin, pBack, pFront) {
    // pOrigin = Ankle, pBack = Heel, pFront = Toe
    const vFwd = new THREE.Vector3().subVectors(pFront, pBack).normalize();
    let vUpRaw = new THREE.Vector3().subVectors(pOrigin, pBack).normalize();
    if (vUpRaw.lengthSq() < 1e-4 || Math.abs(vUpRaw.dot(vFwd)) > 0.99) {
      vUpRaw = new THREE.Vector3(0, 1, 0);
    }
    let vRight = new THREE.Vector3().crossVectors(vUpRaw, vFwd);
    if (vRight.lengthSq() < 1e-4) {
      vRight = new THREE.Vector3(1, 0, 0).cross(vFwd);
      if (vRight.lengthSq() < 1e-4) vRight.set(1, 0, 0);
    }
    vRight.normalize();
    const vUp = new THREE.Vector3().crossVectors(vFwd, vRight).normalize();

    const rotMatrix = new THREE.Matrix4().makeBasis(vRight, vUp, vFwd);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    return { quaternion, rotMatrix, vRight, vUp, vFwd };
  }
}

const LANDMARKS = {
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_TOE: 31,
  RIGHT_TOE: 32
};

const SHOE_CANONICAL_LENGTH = 0.26;
const DEFAULT_FOOT_LENGTH = 0.26;
const MIDFOOT_FRACTION = 0.50;

export class HighDensityFootTracker {
  constructor(threeScene) {
    this.threeScene = threeScene;
    this.denseFootMesh = new DenseFootMesh();
    this.temporalMemory = new TemporalFootMemory(30);

    this.feet = {
      left: this.createFootState('left'),
      right: this.createFootState('right')
    };

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();
    this._rotMatrix = new THREE.Matrix4();
  }

  createFootState(side) {
    const isRight = side === 'right';
    return {
      side,
      isRight,
      isTracked: false,
      confidence: 0.0,
      consecutiveLostFrames: 0,
      isManualAnchor: false,
      manualAnchorExpiry: 0,
      hasInitialized: false,

      // Filtered 6-DOF render pose
      position: new THREE.Vector3(0, -10, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      opacity: 0.0,

      // Raw target pose
      targetPosition: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      targetScale: new THREE.Vector3(1, 1, 1),

      // Key landmark world positions (for OcclusionManager)
      ankleWorld: new THREE.Vector3(),
      heelWorld: new THREE.Vector3(),
      toeWorld: new THREE.Vector3(),
      kneeWorld: new THREE.Vector3(),

      // TPS Deformer instance for dynamic mesh warping
      tpsDeformer: new TPSDeformer3D(0.0005),
      canonicalControlPoints: this.denseFootMesh.getCanonicalPoints(isRight),
      targetControlPoints: [],

      // Tracking-scale dimensions for visual placement only. These are not
      // calibrated body measurements and must not drive size recommendations.
      footLengthMetric: DEFAULT_FOOT_LENGTH,
      widthRatio: 0.38,
      instepRatio: 0.32,

      // 1-Euro filters
      posFilter: new OneEuroVector3(1.2, 0.018, 1.0),
      rotFilter: new OneEuroQuaternion(1.0, 0.022, 1.0),
      scaleFilter: new OneEuroFilter(0.8, 0.005, 1.0),
      depthFilter: new OneEuroFilter(1.0, 0.010, 1.0)
    };
  }

  initDefaultAnchors(containerWidth, containerHeight) {
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;

    // Default shoes to screen center (0.42) at realistic standing distance (1.25m)
    this.setManualAnchor(cw * 0.38, ch * 0.42, cw, ch, 1.25);
    this.setManualAnchor(cw * 0.62, ch * 0.42, cw, ch, 1.25);
  }

  setManualAnchor(screenX, screenY, containerWidth, containerHeight, customDepth = null) {
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;
    const isRight = screenX >= cw * 0.5;
    const side = isRight ? 'right' : 'left';
    const foot = this.feet[side];

    const ndcX = (screenX / cw) * 2 - 1;
    const ndcY = -((screenY / ch) * 2 - 1);

    // Standing eye/chest to floor distance is 1.1m to 1.4m
    const depth = customDepth !== null ? customDepth : 1.25;
    const aspect = cw / ch;
    const fov = this.threeScene.fov || 50;
    const tapPos = this._unprojectNDC(ndcX, ndcY, depth, aspect, fov);

    foot.isManualAnchor = true;
    foot.manualAnchorExpiry = (performance.now() * 0.001) + 3.0; // 3-second hold
    foot.isTracked = true;
    foot.confidence = 1.0;
    foot.consecutiveLostFrames = 0;
    foot.targetPosition.copy(tapPos);
    foot.position.copy(tapPos);
    foot.opacity = 1.0;
    foot.hasInitialized = true;

    // Natural floor tangent pointing forward away from standing viewer
    const forward = new THREE.Vector3(isRight ? 0.05 : -0.05, 0.70, -0.71).normalize();

    foot.heelWorld.copy(tapPos).addScaledVector(forward, -0.12);
    foot.toeWorld.copy(tapPos).addScaledVector(forward, 0.13);
    foot.ankleWorld.copy(tapPos).add(new THREE.Vector3(0, 0.08, -0.04));
    foot.kneeWorld.copy(tapPos).add(new THREE.Vector3(0, 0.40, -0.10));

    const { quaternion: basisQuat } = GramSchmidtPoseSolver.solveBasisFrom3Points(
      foot.ankleWorld,
      foot.heelWorld,
      foot.toeWorld
    );
    foot.quaternion.copy(basisQuat);
    foot.targetQuaternion.copy(foot.quaternion);

    foot.scale.set(1.0, 1.0, 1.0);
    foot.targetScale.set(1.0, 1.0, 1.0);

    // Initial local TPS setup
    const localTargets = this.denseFootMesh.generateLocalTargetPoints(0.26, 0.38, 0.32, isRight);
    foot.tpsDeformer.solve(foot.canonicalControlPoints, localTargets);

    foot.posFilter.reset();
    foot.rotFilter.reset();
    foot.scaleFilter.reset();
    foot.depthFilter.reset();
  }

  setScreenAnchors(side, heel, toe, width, height) {
    const coords = point => ({ screenX: point.x, screenY: point.y,
      ndcX: point.x / width * 2 - 1, ndcY: 1 - point.y / height * 2 });
    const fit = fitScreenFoot(coords(heel), coords(toe), width, height, this.threeScene.fov, this.renderBounds);
    if (!fit) return false;
    this._applyScreenFit(side, fit, 0, true);
    this.feet[side].manualCoordinates = { heel, toe, width, height };
    return true;
  }

  setRenderBounds(bounds) {
    this.renderBounds = bounds;
    for (const foot of Object.values(this.feet)) {
      if (foot.isManualAnchor && foot.manualCoordinates) {
        const { heel, toe, width, height } = foot.manualCoordinates;
        this.setScreenAnchors(foot.side, heel, toe, width, height);
      }
    }
  }

  clearManualAnchors() {
    for (const foot of Object.values(this.feet)) {
      foot.isManualAnchor = false;
      foot.hasInitialized = false;
      foot.isTracked = false;
      foot.opacity = 0;
    }
    this.temporalMemory.reset();
  }

  _applyScreenFit(side, fit, confidence, manual = false) {
    const foot = this.feet[side];
    const fresh = !foot.hasInitialized || foot.consecutiveLostFrames > 3 || manual;
    const now = performance.now() * 0.001;
    const dt = Math.max(0, now - (foot.lastScreenFitTime ?? now));
    const alpha = 1 - Math.exp(-dt / 0.055);
    foot.lastScreenFitTime = now;
    foot.position.copy(fresh ? fit.position : foot.position.clone().lerp(fit.position, alpha));
    if (fresh) foot.quaternion.copy(fit.quaternion);
    else foot.quaternion.slerp(fit.quaternion, alpha);
    foot.scale.setScalar(fit.scale);
    foot.heelWorld.copy(fit.heelWorld);
    foot.toeWorld.copy(fit.toeWorld);
    foot.ankleWorld.copy(fit.heelWorld).lerp(fit.toeWorld, 0.12).add(new THREE.Vector3(0, 0, 0.04));
    foot.kneeWorld.copy(foot.ankleWorld).add(new THREE.Vector3(0, -0.3, 0.15));
    foot.confidence = confidence;
    foot.isTracked = true;
    foot.opacity = 1;
    foot.consecutiveLostFrames = 0;
    foot.hasInitialized = true;
    foot.isManualAnchor = manual;
    if (manual) foot.manualAnchorExpiry = Infinity;
    foot.trackingSource = manual ? 'manual' : 'image-landmarks';
    if (!foot.tpsDeformer.isTrained) foot.tpsDeformer.solve(foot.canonicalControlPoints,
      this.denseFootMesh.generateLocalTargetPoints(0.26, 0.38, 0.32, foot.isRight));
  }

  update(landmarks, worldLandmarks, containerWidth, containerHeight, videoWidth, videoHeight, mirrored = false) {
    this.mirrored = mirrored;
    const timestamp = performance.now() * 0.001;
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;
    const vw = videoWidth || 720;
    const vh = videoHeight || 1280;
    const aspect = cw / ch;
    const fov = this.threeScene.fov || 50;

    if (!landmarks || landmarks.length < 33) {
      this._handleLostFrame('left');
      this._handleLostFrame('right');
      return this.feet;
    }

    const leftLm = {
      ankle: landmarks[LANDMARKS.LEFT_ANKLE],
      heel: landmarks[LANDMARKS.LEFT_HEEL],
      toe: landmarks[LANDMARKS.LEFT_TOE],
      knee: landmarks[LANDMARKS.LEFT_KNEE]
    };
    const rightLm = {
      ankle: landmarks[LANDMARKS.RIGHT_ANKLE],
      heel: landmarks[LANDMARKS.RIGHT_HEEL],
      toe: landmarks[LANDMARKS.RIGHT_TOE],
      knee: landmarks[LANDMARKS.RIGHT_KNEE]
    };

    const leftWorld = worldLandmarks ? {
      ankle: worldLandmarks[LANDMARKS.LEFT_ANKLE],
      heel: worldLandmarks[LANDMARKS.LEFT_HEEL],
      toe: worldLandmarks[LANDMARKS.LEFT_TOE],
      knee: worldLandmarks[LANDMARKS.LEFT_KNEE]
    } : null;

    const rightWorld = worldLandmarks ? {
      ankle: worldLandmarks[LANDMARKS.RIGHT_ANKLE],
      heel: worldLandmarks[LANDMARKS.RIGHT_HEEL],
      toe: worldLandmarks[LANDMARKS.RIGHT_TOE],
      knee: worldLandmarks[LANDMARKS.RIGHT_KNEE]
    } : null;

    // Spatial separation check
    if (leftLm.ankle && rightLm.ankle) {
      const leftCoords = this._getScreenCoords(leftLm.ankle, cw, ch, vw, vh);
      const rightCoords = this._getScreenCoords(rightLm.ankle, cw, ch, vw, vh);
      const dist = Math.abs(leftCoords.screenX - rightCoords.screenX);

      if (dist < cw * 0.08) {
        if (leftCoords.screenX < cw * 0.5) {
          rightLm.ankle = null; rightLm.heel = null; rightLm.toe = null;
        } else {
          leftLm.ankle = null; leftLm.heel = null; leftLm.toe = null;
        }
      }
    }

    this._processFoot('left', leftLm, leftWorld, cw, ch, vw, vh, aspect, fov, timestamp);
    this._processFoot('right', rightLm, rightWorld, cw, ch, vw, vh, aspect, fov, timestamp);

    // Symmetrical scale coupling
    if (worldLandmarks && this.feet.left.isTracked && this.feet.right.isTracked) {
      const avgScale = (this.feet.left.scale.x + this.feet.right.scale.x) * 0.5;
      this.feet.left.scale.set(avgScale, avgScale, avgScale);
      this.feet.right.scale.set(avgScale, avgScale, avgScale);
    }

    // Dynamic ground contact shadow plane positioning
    let lowestY = 999;
    let avgGroundX = 0;
    let avgGroundZ = -0.7;
    let trackedCount = 0;
    ['left', 'right'].forEach(side => {
      const f = this.feet[side];
      if (f && f.isTracked && f.opacity > 0.3) {
        lowestY = Math.min(lowestY, f.position.y - 0.042 * f.scale.y);
        avgGroundX += f.position.x;
        avgGroundZ += f.position.z;
        trackedCount++;
      }
    });
    if (trackedCount > 0 && this.threeScene && typeof this.threeScene.updateGroundPlane === 'function') {
      this.threeScene.updateGroundPlane(
        new THREE.Vector3(avgGroundX / trackedCount, lowestY, avgGroundZ / trackedCount),
        0.42
      );
    }

    return this.feet;
  }

  _processFoot(side, lm, worldLm, cw, ch, vw, vh, aspect, fov, timestamp) {
    const foot = this.feet[side];
    if (foot.isManualAnchor && foot.manualAnchorExpiry === Infinity) return;

    if (!lm.ankle || !lm.heel || !lm.toe) {
      this._handleLostFrame(side);
      return;
    }

    const ankleConf = lm.ankle.visibility ?? lm.ankle.presence ?? 0.8;
    const heelConf = lm.heel.visibility ?? lm.heel.presence ?? 0.8;
    const toeConf = lm.toe.visibility ?? lm.toe.presence ?? 0.8;
    const avgConfidence = (ankleConf + heelConf + toeConf) / 3;

    const ankleCoords = this._getScreenCoords(lm.ankle, cw, ch, vw, vh);
    const heelCoords = this._getScreenCoords(lm.heel, cw, ch, vw, vh);
    const toeCoords = this._getScreenCoords(lm.toe, cw, ch, vw, vh);

    const dx = toeCoords.screenX - heelCoords.screenX;
    const dy = toeCoords.screenY - heelCoords.screenY;
    const pixelLength = Math.sqrt(dx * dx + dy * dy);

    const isValidPose = ([ankleConf, heelConf, toeConf].every(conf => Number.isFinite(conf) && conf >= 0.4) && pixelLength >= 25 &&
      [heelCoords, toeCoords].every(point => Number.isFinite(point.screenX) && Number.isFinite(point.screenY) &&
        point.screenX >= 0 && point.screenX <= cw && point.screenY >= 0 && point.screenY <= ch));

    if (!isValidPose) {
      this._handleLostFrame(side);
      return;
    }

    if (!worldLm) {
      const fit = fitScreenFoot(heelCoords, toeCoords, cw, ch, fov, this.renderBounds);
      if (fit) this._applyScreenFit(side, fit, Math.min(ankleConf, heelConf, toeConf));
      else this._handleLostFrame(side);
      return;
    }

    // ── 1. Depth estimation (with perspective tilt compensation) ──
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const focalLengthPixels = (ch / 2) / tanHalfFov;

    let metricFootLength = DEFAULT_FOOT_LENGTH;
    if (worldLm && worldLm.heel && worldLm.toe) {
      const wLen = Math.sqrt(
        (worldLm.toe.x - worldLm.heel.x) ** 2 +
        (worldLm.toe.y - worldLm.heel.y) ** 2 +
        (worldLm.toe.z - worldLm.heel.z) ** 2
      );
      if (wLen > 0.12 && wLen < 0.40) {
        metricFootLength = THREE.MathUtils.clamp(wLen * 1.1, 0.20, 0.32);
      }
    }

    const rawDistance = (metricFootLength * focalLengthPixels) / Math.max(35, pixelLength);
    // Downward camera perspective foreshortening compensation (0.75x factor)
    const clampedDistance = THREE.MathUtils.clamp(rawDistance * 0.75, 0.85, 1.45);
    const depth = foot.depthFilter.filter(clampedDistance, timestamp);

    // ── 2. Per-landmark depth refinement (Floor Plane Solver) ──
    let heelDepth = depth;
    let toeDepth = depth;
    let ankleDepth = depth;
    if (worldLm && worldLm.heel && worldLm.toe && worldLm.ankle) {
      const midZ = (worldLm.heel.z + worldLm.toe.z) * 0.5;
      heelDepth = depth - (worldLm.heel.z - midZ);
      toeDepth = depth - (worldLm.toe.z - midZ);
      ankleDepth = depth - (worldLm.ankle.z - midZ);
    } else {
      // Analytical 3D Floor Plane Depth Recovery:
      // When feet rest on the floor, the toe extends further from the camera along the floor plane.
      // We analytically solve for toeDepth such that 3D distance between Heel and Toe == metricFootLength (0.26m)!
      const xh = heelCoords.ndcX * tanHalfFov * aspect;
      const yh = heelCoords.ndcY * tanHalfFov;
      const xt = toeCoords.ndcX * tanHalfFov * aspect;
      const yt = toeCoords.ndcY * tanHalfFov;
      const Dh = depth;
      const L = metricFootLength; // 0.26m

      const A = xt * xt + yt * yt + 1;
      const B = -2 * Dh * (xt * xh + yt * yh + 1);
      const C = Dh * Dh * (xh * xh + yh * yh + 1) - L * L;
      const disc = B * B - 4 * A * C;

      if (disc >= 0) {
        toeDepth = (-B + Math.sqrt(disc)) / (2 * A);
      } else {
        toeDepth = Dh * 1.15;
      }
      ankleDepth = Dh * 0.97;
    }

    // ── 3. Unproject screen positions into Three.js camera space ──
    const rawHeelWorld = this._unprojectNDC(heelCoords.ndcX, heelCoords.ndcY, heelDepth, aspect, fov);
    const rawToeWorld = this._unprojectNDC(toeCoords.ndcX, toeCoords.ndcY, toeDepth, aspect, fov);
    const rawAnkleWorld = this._unprojectNDC(ankleCoords.ndcX, ankleCoords.ndcY, ankleDepth, aspect, fov);

    let rawKneeWorld;
    if (lm.knee) {
      const kneeCoords = this._getScreenCoords(lm.knee, cw, ch, vw, vh);
      rawKneeWorld = this._unprojectNDC(
        kneeCoords.ndcX, kneeCoords.ndcY,
        Math.max(0.15, ankleDepth - 0.25), aspect, fov
      );
    } else {
      rawKneeWorld = rawAnkleWorld.clone().add(new THREE.Vector3(0, 0.35, 0));
    }

    // 6-DoF Gram-Schmidt Orthogonal Basis:
    // vFwd   = normalize(P_toe - P_heel) (Local +Z, toe direction)
    // vUpRaw = normalize(P_ankle - P_heel)
    // vRight = normalize(cross(vUpRaw, vFwd)) (Local +X)
    // vUp    = normalize(cross(vFwd, vRight)) (Local +Y, true 90° orthogonal up)
    const { quaternion: rawQuat, vFwd: rawForward } = GramSchmidtPoseSolver.solveBasisFrom3Points(
      rawAnkleWorld,
      rawHeelWorld,
      rawToeWorld
    );

    const footLength3D = rawHeelWorld.distanceTo(rawToeWorld);
    const rawPos = new THREE.Vector3()
      .copy(rawHeelWorld)
      .addScaledVector(rawForward, footLength3D * MIDFOOT_FRACTION);

    const rawScaleFactor = THREE.MathUtils.clamp(
      footLength3D / SHOE_CANONICAL_LENGTH,
      0.82, 1.20
    );
    const rawScale = new THREE.Vector3(rawScaleFactor, rawScaleFactor, rawScaleFactor);

    // ── 4. Temporal Multi-Frame Memory Buffer Integration ──
    const fusedState = this.temporalMemory.update(
      side,
      rawPos,
      rawQuat,
      rawScale,
      rawHeelWorld,
      rawToeWorld,
      rawAnkleWorld,
      rawKneeWorld,
      avgConfidence,
      timestamp
    );

    const finalPos = fusedState ? fusedState.position : rawPos;
    const finalQuat = fusedState ? fusedState.quaternion : rawQuat;
    const finalScale = fusedState ? fusedState.scale : rawScale;
    const finalHeel = fusedState ? fusedState.heel : rawHeelWorld;
    const finalToe = fusedState ? fusedState.toe : rawToeWorld;
    const finalAnkle = fusedState ? fusedState.ankle : rawAnkleWorld;

    // Store for OcclusionManager
    foot.ankleWorld.copy(finalAnkle);
    foot.heelWorld.copy(finalHeel);
    foot.toeWorld.copy(finalToe);
    foot.kneeWorld.copy(rawKneeWorld);

    // ── 5. 3D Thin-Plate Spline (TPS) in LOCAL Model Space ──
    const learnedLength = fusedState ? fusedState.learnedFootLength : footLength3D;
    const widthRatio = fusedState ? fusedState.learnedFootWidthRatio : 0.38;
    const instepRatio = fusedState ? fusedState.learnedInstepRatio : 0.32;

    foot.footLengthMetric = learnedLength;
    foot.widthRatio = widthRatio;
    foot.instepRatio = instepRatio;

    const localTargetPoints = this.denseFootMesh.generateLocalTargetPoints(
      learnedLength,
      widthRatio,
      instepRatio,
      foot.isRight
    );

    // Solve TPS non-rigid deformation mapping strictly in local model coordinates
    foot.tpsDeformer.solve(foot.canonicalControlPoints, localTargetPoints);

    // ── 6. Apply Fused Pose with 1-Euro Smoothing ──
    if (foot.isManualAnchor && timestamp < (foot.manualAnchorExpiry || 0)) {
      if (finalPos.distanceTo(foot.position) < 0.25 && avgConfidence > 0.40) {
        foot.isManualAnchor = false;
      } else {
        return;
      }
    }
    foot.isManualAnchor = false;
    foot.confidence = avgConfidence;
    foot.consecutiveLostFrames = 0;
    foot.isTracked = true;
    foot.opacity = 1.0;

    foot.targetPosition.copy(finalPos);
    foot.targetQuaternion.copy(finalQuat);
    foot.targetScale.copy(finalScale);

    if (!foot.hasInitialized || foot.consecutiveLostFrames > 5) {
      foot.position.copy(finalPos);
      foot.quaternion.copy(finalQuat);
      foot.scale.copy(finalScale);
      foot.posFilter.reset();
      foot.rotFilter.reset();
      foot.scaleFilter.reset();
      foot.depthFilter.reset();
      foot.hasInitialized = true;
    } else {
      foot.position.copy(foot.posFilter.filter(finalPos, timestamp));
      foot.quaternion.copy(foot.rotFilter.filter(finalQuat, timestamp));
      foot.scale.copy(finalScale);
    }
  }

  _getScreenCoords(landmark, cw, ch, vw, vh) {
    if (!landmark) return { screenX: cw * 0.5, screenY: ch * 0.5, ndcX: 0, ndcY: 0, z: 0 };

    return videoPointToScreen(landmark, cw, ch, vw, vh, this.mirrored);
  }

  _unprojectNDC(ndcX, ndcY, depth, aspect, fov) {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const worldY = ndcY * depth * tanHalfFov;
    const worldX = ndcX * depth * tanHalfFov * aspect;
    const worldZ = -depth;
    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  _handleLostFrame(side) {
    const foot = this.feet[side];
    if (foot.isManualAnchor && performance.now() * 0.001 < foot.manualAnchorExpiry) return;
    foot.consecutiveLostFrames++;
    foot.confidence = 0;
    if (!foot.hasInitialized) {
      foot.isTracked = false;
      foot.opacity = 0.0;
      return;
    }
    // Smooth decay when foot temporarily leaves camera view
    foot.opacity = Math.max(0, foot.opacity - 0.12);
    if (foot.opacity <= 0.04) foot.isTracked = false;
  }

  getFoot(side) {
    return this.feet[side];
  }

  getVisualScaleTelemetry() {
    const rightTracked = this.feet.right && this.feet.right.isTracked && !this.feet.right.isManualAnchor;
    const leftTracked = this.feet.left && this.feet.left.isTracked && !this.feet.left.isManualAnchor;
    const primaryFoot = rightTracked ? this.feet.right : (leftTracked ? this.feet.left : null);

    if (!primaryFoot) return null;

    const lengthProxyM = THREE.MathUtils.clamp(primaryFoot.footLengthMetric || 0.26, 0.20, 0.32);
    const widthProxyM = lengthProxyM * (primaryFoot.widthRatio || 0.38);

    return {
      lengthProxyM: Number(lengthProxyM.toFixed(3)),
      widthProxyM: Number(widthProxyM.toFixed(3)),
      confidence: Math.round((primaryFoot.confidence || 0.85) * 100),
      side: primaryFoot.side,
      source: 'uncalibrated-tracking'
    };
  }
}
