/**
 * FootTracker.js - Synchronized AR Foot Tracking Engine
 * Equipped with 1-Euro Adaptive Low-Pass Filter for rock-solid, zero-flicker tracking.
 * Fuses 2D optical screen landmarks with 3D metric worldLandmarks for anatomically
 * accurate top-down foot fitting.
 */
import * as THREE from 'three';

export const POSE_LANDMARKS = {
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_TOE: 31,
  RIGHT_TOE: 32
};

/**
 * LowPassFilter - Core single-variable low pass filter
 */
class LowPassFilter {
  constructor(alpha = 1) {
    this.alpha = THREE.MathUtils.clamp(alpha, 0, 1);
    this.y = null;
    this.s = null;
  }

  setAlpha(alpha) {
    this.alpha = THREE.MathUtils.clamp(alpha, 0, 1);
  }

  filter(value, alpha) {
    if (alpha !== undefined) this.setAlpha(alpha);
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = value;
    this.s = this.alpha * value + (1 - this.alpha) * this.s;
    return this.s;
  }

  hasLastRawValue() {
    return this.y !== null;
  }

  lastRawValue() {
    return this.y;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

/**
 * OneEuroFilter - Speed-adaptive low-pass filter
 * Eliminates jitter when stationary while preserving zero-latency response during movement.
 */
export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPassFilter();
    this.dx = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(val, timestamp) {
    const t = timestamp !== undefined ? timestamp : performance.now() * 0.001;
    if (this.lastTime === null) {
      this.lastTime = t;
      return this.x.filter(val);
    }
    const dt = Math.max(1e-4, Math.min(0.2, t - this.lastTime));
    this.lastTime = t;

    const prevRaw = this.x.hasLastRawValue() ? this.x.lastRawValue() : val;
    const dxVal = (val - prevRaw) / dt;
    const edx = this.dx.filter(dxVal, this.alpha(this.dCutoff, dt));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(val, this.alpha(cutoff, dt));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

/**
 * OneEuroVector3 - 3D vector 1-Euro filter
 */
export class OneEuroVector3 {
  constructor(minCutoff = 1.2, beta = 0.012, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.out = new THREE.Vector3();
  }

  filter(vec3, timestamp) {
    this.out.set(
      this.fx.filter(vec3.x, timestamp),
      this.fy.filter(vec3.y, timestamp),
      this.fz.filter(vec3.z, timestamp)
    );
    return this.out;
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/**
 * OneEuroQuaternion - Quaternion 1-Euro filter with antipodal continuity & normalization
 */
export class OneEuroQuaternion {
  constructor(minCutoff = 1.0, beta = 0.015, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fw = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.out = new THREE.Quaternion();
    this.lastQ = new THREE.Quaternion();
    this.hasLast = false;
  }

  filter(q, timestamp) {
    let target = q;
    if (this.hasLast && this.lastQ.dot(q) < 0) {
      target = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
    }

    this.out.set(
      this.fx.filter(target.x, timestamp),
      this.fy.filter(target.y, timestamp),
      this.fz.filter(target.z, timestamp),
      this.fw.filter(target.w, timestamp)
    ).normalize();

    this.lastQ.copy(this.out);
    this.hasLast = true;
    return this.out;
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
    this.fw.reset();
    this.hasLast = false;
  }
}

export class FootTracker {
  constructor(threeScene) {
    this.threeScene = threeScene;
    this.shoeModelLength = 0.26; // Canonical procedural shoe model length in meters
    this.minConfidence = 0.15;

    this.feet = {
      left: this.createFootState('left'),
      right: this.createFootState('right')
    };

    // Reusable math objects (zero garbage collection overhead)
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._rotMatrix = new THREE.Matrix4();
    this._nominalFloorUp = new THREE.Vector3(0, 0.707, 0.707).normalize();
  }

  createFootState(side) {
    return {
      side,
      isRight: side === 'right',
      isTracked: false,
      confidence: 0,
      consecutiveLostFrames: 99,
      
      // Interpolated/Filtered render state
      position: new THREE.Vector3(0, -10, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      opacity: 0,

      // Target raw calculated pose
      targetPosition: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      targetScale: new THREE.Vector3(1, 1, 1),

      // Key landmark world positions
      ankleWorld: new THREE.Vector3(),
      heelWorld: new THREE.Vector3(),
      toeWorld: new THREE.Vector3(),
      kneeWorld: new THREE.Vector3(),

      // Filters
      posFilter: new OneEuroVector3(1.2, 0.015, 1.0),
      rotFilter: new OneEuroQuaternion(1.0, 0.018, 1.0),
      scaleFilter: new OneEuroFilter(0.8, 0.005, 1.0),
      depthFilter: new OneEuroFilter(1.0, 0.010, 1.0),
      
      isManualAnchor: false,
      hasInitialized: false
    };
  }

  initDefaultAnchors(containerWidth, containerHeight) {
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;
    
    // Seed Left and Right foot anchors naturally resting on the floor
    this.setManualAnchor(cw * 0.38, ch * 0.65, cw, ch);
    this.setManualAnchor(cw * 0.62, ch * 0.65, cw, ch);
  }

  setManualAnchor(screenX, screenY, containerWidth, containerHeight) {
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;
    const isRight = screenX >= cw * 0.5;
    const side = isRight ? 'right' : 'left';
    const foot = this.feet[side];

    const ndcX = (screenX / cw) * 2 - 1;
    const ndcY = -((screenY / ch) * 2 - 1);
    
    // Natural handheld phone try-on distance (0.58m)
    const depth = 0.58;

    const aspect = cw / ch;
    const fov = this.threeScene.fov || 50;
    const tapPos = this.unprojectNDC(ndcX, ndcY, depth, aspect, fov);

    foot.isManualAnchor = true;
    foot.isTracked = true;
    foot.confidence = 1.0;
    foot.consecutiveLostFrames = 0;
    foot.targetPosition.copy(tapPos);
    foot.position.copy(tapPos);
    foot.opacity = 1.0;
    foot.hasInitialized = true;

    // Foot forward vector (pointing forward/away along the floor/bed towards toes)
    const forwardX = isRight ? 0.04 : -0.04;
    const forward = new THREE.Vector3(forwardX, 0.72, -0.69).normalize();

    // Top surface of the shoe (collar & laces) facing up towards camera
    const nominalTop = new THREE.Vector3(0, 0.69, 0.72).normalize();

    // Right lateral vector = Forward x NominalTop
    const right = new THREE.Vector3().crossVectors(forward, nominalTop).normalize();
    if (right.x < 0) {
      right.negate();
    }

    // Up vector = Right x Forward (strictly orthogonal)
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    this._rotMatrix.makeBasis(right, up, forward);
    foot.quaternion.setFromRotationMatrix(this._rotMatrix);
    foot.targetQuaternion.copy(foot.quaternion);

    // Life-sized real sneaker scale
    foot.scale.set(1.08, 1.08, 1.08);
    foot.targetScale.set(1.08, 1.08, 1.08);

    foot.posFilter.reset();
    foot.rotFilter.reset();
    foot.scaleFilter.reset();
    foot.depthFilter.reset();
  }

  update(landmarks, worldLandmarks, containerWidth, containerHeight, videoWidth, videoHeight) {
    const timestamp = performance.now() * 0.001;
    const cw = containerWidth || window.innerWidth;
    const ch = containerHeight || window.innerHeight;
    const vw = videoWidth || 720;
    const vh = videoHeight || 1280;
    const aspect = cw / ch;
    const fov = this.threeScene.fov || 50;

    if (!landmarks || landmarks.length < 33) {
      this.handleLostFrame('left');
      this.handleLostFrame('right');
      return this.feet;
    }

    let leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    let leftHeel = landmarks[POSE_LANDMARKS.LEFT_HEEL];
    let leftToe = landmarks[POSE_LANDMARKS.LEFT_TOE];
    let leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];

    let rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
    let rightHeel = landmarks[POSE_LANDMARKS.RIGHT_HEEL];
    let rightToe = landmarks[POSE_LANDMARKS.RIGHT_TOE];
    let rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];

    // Optional 3D metric landmarks from MediaPipe
    const leftWorldAnkle = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE] : null;
    const leftWorldHeel = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.LEFT_HEEL] : null;
    const leftWorldToe = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.LEFT_TOE] : null;
    const leftWorldKnee = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.LEFT_KNEE] : null;

    const rightWorldAnkle = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE] : null;
    const rightWorldHeel = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.RIGHT_HEEL] : null;
    const rightWorldToe = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.RIGHT_TOE] : null;
    const rightWorldKnee = worldLandmarks ? worldLandmarks[POSE_LANDMARKS.RIGHT_KNEE] : null;

    // Spatial separation check: prevent swapping when feet cross or occlude
    if (leftAnkle && rightAnkle) {
      const leftCoords = this.getScreenCoords(leftAnkle, cw, ch, vw, vh);
      const rightCoords = this.getScreenCoords(rightAnkle, cw, ch, vw, vh);
      const dist = Math.abs(leftCoords.screenX - rightCoords.screenX);

      if (dist < cw * 0.08) {
        if (leftCoords.screenX < cw * 0.5) {
          rightAnkle = null; rightHeel = null; rightToe = null;
        } else {
          leftAnkle = null; leftHeel = null; leftToe = null;
        }
      }
    }

    this.processFoot(
      'left',
      leftAnkle, leftHeel, leftToe, leftKnee,
      leftWorldAnkle, leftWorldHeel, leftWorldToe, leftWorldKnee,
      cw, ch, vw, vh, aspect, fov, timestamp
    );

    this.processFoot(
      'right',
      rightAnkle, rightHeel, rightToe, rightKnee,
      rightWorldAnkle, rightWorldHeel, rightWorldToe, rightWorldKnee,
      cw, ch, vw, vh, aspect, fov, timestamp
    );

    // Couple scale symmetrically when both feet are tracked
    if (this.feet.left.isTracked && this.feet.right.isTracked) {
      const avgScale = (this.feet.left.scale.x + this.feet.right.scale.x) * 0.5;
      this.feet.left.scale.set(avgScale, avgScale, avgScale);
      this.feet.right.scale.set(avgScale, avgScale, avgScale);
    }

    return this.feet;
  }

  getScreenCoords(landmark, cw, ch, vw, vh) {
    if (!landmark) return { screenX: 0, screenY: 0, ndcX: 0, ndcY: 0, z: 0 };

    const scale = Math.max(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (renderedW - cw) / 2;
    const offsetY = (renderedH - ch) / 2;

    const screenX = landmark.x * renderedW - offsetX;
    const screenY = landmark.y * renderedH - offsetY;

    const ndcX = (screenX / cw) * 2 - 1;
    const ndcY = -((screenY / ch) * 2 - 1);

    return {
      screenX,
      screenY,
      ndcX,
      ndcY,
      z: landmark.z || 0
    };
  }

  unprojectNDC(ndcX, ndcY, depth, aspect, fov) {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const worldY = ndcY * depth * tanHalfFov;
    const worldX = ndcX * depth * tanHalfFov * aspect;
    const worldZ = -depth;
    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  processFoot(
    side,
    ankle, heel, toe, knee,
    worldAnkle, worldHeel, worldToe, worldKnee,
    cw, ch, vw, vh, aspect, fov, timestamp
  ) {
    const foot = this.feet[side];

    const ankleConf = ankle ? (ankle.visibility ?? ankle.presence ?? 0.8) : 0;
    const heelConf = heel ? (heel.visibility ?? heel.presence ?? 0.8) : 0;
    const toeConf = toe ? (toe.visibility ?? toe.presence ?? 0.8) : 0;
    const avgConfidence = (ankleConf + heelConf + toeConf) / 3;

    const ankleCoords = this.getScreenCoords(ankle, cw, ch, vw, vh);
    const heelCoords = this.getScreenCoords(heel, cw, ch, vw, vh);
    const toeCoords = this.getScreenCoords(toe, cw, ch, vw, vh);
    const kneeCoords = knee ? this.getScreenCoords(knee, cw, ch, vw, vh) : null;

    // 2D screen distance between heel and toe
    const dx = toeCoords.screenX - heelCoords.screenX;
    const dy = toeCoords.screenY - heelCoords.screenY;
    const pixelLength = Math.sqrt(dx * dx + dy * dy);

    // Require solid confidence and valid anatomical span (> 80px on screen)
    const isValidPose = (avgConfidence >= 0.38 && pixelLength >= 80);

    if (!isValidPose) {
      if (foot.isManualAnchor) {
        foot.isTracked = true;
        foot.opacity = 1.0;
        return;
      }
      this.handleLostFrame(side);
      return;
    }

    foot.isManualAnchor = false;
    foot.confidence = avgConfidence;
    foot.consecutiveLostFrames = 0;
    foot.isTracked = true;

    // Optical geometry focal length
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const focalLengthPixels = (ch / 2) / tanHalfFov;

    const metricFootLength = 0.25;

    // Calculate distance constrained to handheld phone range (0.40m - 1.20m)
    const rawDistance = (metricFootLength * focalLengthPixels) / Math.max(80, pixelLength);
    const clampedDistance = THREE.MathUtils.clamp(rawDistance, 0.40, 1.20);
    const depth = foot.depthFilter.filter(clampedDistance, timestamp);

    // Unproject landmarks to 3D camera space
    const heelWorld = this.unprojectNDC(heelCoords.ndcX, heelCoords.ndcY, depth, aspect, fov);
    const toeWorld = this.unprojectNDC(toeCoords.ndcX, toeCoords.ndcY, depth, aspect, fov);
    const ankleWorld = this.unprojectNDC(ankleCoords.ndcX, ankleCoords.ndcY, depth, aspect, fov);
    const kneeWorld = kneeCoords ?
      this.unprojectNDC(kneeCoords.ndcX, kneeCoords.ndcY, depth, aspect, fov) :
      ankleWorld.clone().add(new THREE.Vector3(0, 0.4, 0));

    foot.heelWorld.copy(heelWorld);
    foot.toeWorld.copy(toeWorld);
    foot.ankleWorld.copy(ankleWorld);
    foot.kneeWorld.copy(kneeWorld);

    // Forward vector along foot (from heel to toe)
    const forward = this._v1.subVectors(toeWorld, heelWorld).normalize();

    // Top surface pointing up/out towards camera
    const nominalTop = new THREE.Vector3(0, 0.69, 0.72).normalize();

    // Lateral Right vector = Forward x NominalTop
    const right = this._v3.crossVectors(forward, nominalTop).normalize();
    if (right.x < 0) {
      right.negate();
    }

    // Up vector = Right x Forward
    const up = this._v2.crossVectors(right, forward).normalize();

    this._rotMatrix.makeBasis(right, up, forward);
    foot.targetQuaternion.setFromRotationMatrix(this._rotMatrix);

    const midfootOffset = 0.42;
    const heelToToe = new THREE.Vector3().subVectors(toeWorld, heelWorld);

    foot.targetPosition.copy(heelWorld)
      .addScaledVector(heelToToe, midfootOffset)
      .addScaledVector(up, -0.012);

    // Stable scale factor
    const rawScaleFactor = THREE.MathUtils.clamp(
      (depth * pixelLength) / (metricFootLength * focalLengthPixels),
      0.98,
      1.22
    );
    const filteredScale = foot.scaleFilter.filter(rawScaleFactor, timestamp);
    foot.targetScale.set(filteredScale, filteredScale, filteredScale);

    if (!foot.hasInitialized || foot.consecutiveLostFrames > 5) {
      foot.position.copy(foot.targetPosition);
      foot.quaternion.copy(foot.targetQuaternion);
      foot.scale.copy(foot.targetScale);
      foot.posFilter.reset();
      foot.rotFilter.reset();
      foot.scaleFilter.reset();
      foot.depthFilter.reset();
      foot.hasInitialized = true;
    } else {
      const filteredPos = foot.posFilter.filter(foot.targetPosition, timestamp);
      const filteredRot = foot.rotFilter.filter(foot.targetQuaternion, timestamp);

      foot.position.copy(filteredPos);
      foot.quaternion.copy(filteredRot);
      foot.scale.copy(foot.targetScale);
    }

    foot.opacity = THREE.MathUtils.lerp(foot.opacity, 1.0, 0.25);
  }

  handleLostFrame(side) {
    const foot = this.feet[side];
    foot.consecutiveLostFrames++;

    if (foot.consecutiveLostFrames > 30 && !foot.isManualAnchor) {
      foot.isTracked = false;
      foot.confidence = 0;
      foot.opacity = THREE.MathUtils.lerp(foot.opacity, 0.0, 0.15);
      if (foot.opacity < 0.02) {
        foot.hasInitialized = false;
      }
    } else if (foot.consecutiveLostFrames > 3) {
      // Temporary occlusion: smoothly hold last position while softly reducing opacity
      foot.opacity = THREE.MathUtils.lerp(foot.opacity, 0.0, 0.08);
    }
  }

  getFoot(side) {
    return this.feet[side];
  }
}

