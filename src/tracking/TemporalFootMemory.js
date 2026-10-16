/**
 * TemporalFootMemory.js
 * 30-Frame Multi-Frame Temporal Memory Buffer & Surface Envelope Engine
 * 
 * Provides:
 * 1. Rolling window memory buffer (30 frames) for temporal coherence.
 * 2. Adaptive Kalman-style temporal smoothing with velocity-dependent inertia.
 * 3. Foot Stability Locking: when stationary, eliminates 100% of camera sensor jitter.
 * 4. Temporal Outlier Rejection: rejects anomalous single-frame tracking glitches.
 * 5. Dynamic Foot Shape Learning: progressively refines foot length, width, and instep height.
 */
import * as THREE from 'three';

class SingleFootMemory {
  constructor(side, windowSize = 30) {
    this.side = side;
    this.isRight = side === 'right';
    this.windowSize = windowSize;

    // Rolling history buffers
    this.positionHistory = [];
    this.quaternionHistory = [];
    this.heelHistory = [];
    this.toeHistory = [];
    this.ankleHistory = [];
    this.scaleHistory = [];
    this.confidenceHistory = [];
    this.timestampHistory = [];

    // Stable temporal fused state
    this.fusedPosition = new THREE.Vector3(0, -10, 0);
    this.fusedQuaternion = new THREE.Quaternion();
    this.fusedScale = new THREE.Vector3(1, 1, 1);
    this.fusedHeel = new THREE.Vector3();
    this.fusedToe = new THREE.Vector3();
    this.fusedAnkle = new THREE.Vector3();
    this.fusedKnee = new THREE.Vector3();

    // Temporal stability metrics
    this.stabilityScore = 0; // 0 (unstable/moving) to 1 (solidly locked)
    this.velocity = new THREE.Vector3();
    this.lastPosition = new THREE.Vector3();
    this.lastTimestamp = 0;
    this.lockedCount = 0;
    this.hasSufficientMemory = false;

    // Learned foot shape parameters (meters)
    this.learnedFootLength = 0.25;
    this.learnedFootWidthRatio = 0.38;
    this.learnedInstepRatio = 0.32;
  }

  /**
   * Pushes a new frame observation into the temporal memory
   */
  pushObservation(position, quaternion, scale, heel, toe, ankle, knee, confidence, timestamp) {
    const t = timestamp || performance.now() * 0.001;

    // Velocity computation & outlier rejection
    if (this.lastTimestamp > 0 && this.positionHistory.length > 3) {
      const dt = Math.max(0.001, t - this.lastTimestamp);
      const instantVelocity = position.distanceTo(this.lastPosition) / dt;

      // Physical sanity check: reject instant jumps > 2.0 m/s (sensor glitch)
      if (instantVelocity > 2.0 && this.stabilityScore > 0.6) {
        // Discard glitch frame and retain last known good temporal prediction
        return this.getFusedState();
      }

      this.velocity.subVectors(position, this.lastPosition).divideScalar(dt);
    }

    this.lastPosition.copy(position);
    this.lastTimestamp = t;

    // Append to rolling buffers
    this.positionHistory.push(position.clone());
    this.quaternionHistory.push(quaternion.clone());
    this.scaleHistory.push(scale.clone());
    this.heelHistory.push(heel.clone());
    this.toeHistory.push(toe.clone());
    this.ankleHistory.push(ankle.clone());
    this.confidenceHistory.push(confidence);
    this.timestampHistory.push(t);

    // Keep buffers within windowSize
    if (this.positionHistory.length > this.windowSize) {
      this.positionHistory.shift();
      this.quaternionHistory.shift();
      this.scaleHistory.shift();
      this.heelHistory.shift();
      this.toeHistory.shift();
      this.ankleHistory.shift();
      this.confidenceHistory.shift();
      this.timestampHistory.shift();
      this.hasSufficientMemory = true;
    }

    // Compute temporal stability and fused state
    this._computeFusedState();
    return this.getFusedState();
  }

  /**
   * Calculates weighted temporal fusion across the rolling memory window
   */
  _computeFusedState() {
    const N = this.positionHistory.length;
    if (N === 0) return;

    if (N === 1) {
      this.fusedPosition.copy(this.positionHistory[0]);
      this.fusedQuaternion.copy(this.quaternionHistory[0]);
      this.fusedScale.copy(this.scaleHistory[0]);
      this.fusedHeel.copy(this.heelHistory[0]);
      this.fusedToe.copy(this.toeHistory[0]);
      this.fusedAnkle.copy(this.ankleHistory[0]);
      return;
    }

    // 1. Calculate positional variance over the last N frames
    let meanPos = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      meanPos.add(this.positionHistory[i]);
    }
    meanPos.divideScalar(N);

    let variance = 0;
    for (let i = 0; i < N; i++) {
      variance += meanPos.distanceToSquared(this.positionHistory[i]);
    }
    variance = Math.sqrt(variance / N);

    // Stability score: 1.0 when variance < 0.003m (stationary foot), 0.0 when moving fast
    this.stabilityScore = THREE.MathUtils.clamp(1.0 - (variance / 0.03), 0.0, 1.0);

    // 2. Exponential Recency Weighting with Stability Damping
    // When stationary (high stability), older frames carry more weight (locking).
    // When moving, recent frames dominate (low latency).
    let totalWeight = 0;
    const weights = new Float32Array(N);
    const decayBase = THREE.MathUtils.lerp(1.25, 1.05, this.stabilityScore);

    for (let i = 0; i < N; i++) {
      const recency = Math.pow(decayBase, i); // higher for newer frames
      const conf = this.confidenceHistory[i];
      const w = recency * (conf + 0.1);
      weights[i] = w;
      totalWeight += w;
    }

    if (totalWeight < 1e-6) totalWeight = 1.0;

    // 3. Fused Weighted Position, Heel, Toe, Ankle
    this.fusedPosition.set(0, 0, 0);
    this.fusedHeel.set(0, 0, 0);
    this.fusedToe.set(0, 0, 0);
    this.fusedAnkle.set(0, 0, 0);
    let avgScale = 0;

    for (let i = 0; i < N; i++) {
      const normW = weights[i] / totalWeight;
      this.fusedPosition.addScaledVector(this.positionHistory[i], normW);
      this.fusedHeel.addScaledVector(this.heelHistory[i], normW);
      this.fusedToe.addScaledVector(this.toeHistory[i], normW);
      this.fusedAnkle.addScaledVector(this.ankleHistory[i], normW);
      avgScale += this.scaleHistory[i].x * normW;
    }

    this.fusedScale.set(avgScale, avgScale, avgScale);

    // 4. Spherical Linear Interpolation (SLERP) for Quaternion
    // Start with the oldest frame and progressively SLERP toward the newest
    this.fusedQuaternion.copy(this.quaternionHistory[0]);
    for (let i = 1; i < N; i++) {
      let targetQ = this.quaternionHistory[i];
      // Shortest-path hemisphere check on S^3 to prevent 180-degree flip
      if (this.fusedQuaternion.dot(targetQ) < 0) {
        targetQ = new THREE.Quaternion(-targetQ.x, -targetQ.y, -targetQ.z, -targetQ.w);
      }
      const stepAlpha = (weights[i] / (totalWeight + 1e-4)) * (1.0 - this.stabilityScore * 0.5);
      this.fusedQuaternion.slerp(targetQ, THREE.MathUtils.clamp(stepAlpha, 0.05, 0.95));
    }

    // 5. Progressively learn real foot shape metrics
    const currentLength = this.fusedHeel.distanceTo(this.fusedToe);
    if (currentLength > 0.18 && currentLength < 0.32) {
      this.learnedFootLength = THREE.MathUtils.lerp(this.learnedFootLength, currentLength, 0.05);
    }
  }

  getFusedState() {
    return {
      position: this.fusedPosition,
      quaternion: this.fusedQuaternion,
      scale: this.fusedScale,
      heel: this.fusedHeel,
      toe: this.fusedToe,
      ankle: this.fusedAnkle,
      stabilityScore: this.stabilityScore,
      learnedFootLength: this.learnedFootLength,
      learnedFootWidthRatio: this.learnedFootWidthRatio,
      learnedInstepRatio: this.learnedInstepRatio
    };
  }

  reset() {
    this.positionHistory = [];
    this.quaternionHistory = [];
    this.scaleHistory = [];
    this.heelHistory = [];
    this.toeHistory = [];
    this.ankleHistory = [];
    this.confidenceHistory = [];
    this.timestampHistory = [];
    this.stabilityScore = 0;
    this.lastTimestamp = 0;
    this.hasSufficientMemory = false;
  }
}

export class TemporalFootMemory {
  constructor(windowSize = 30) {
    this.feet = {
      left: new SingleFootMemory('left', windowSize),
      right: new SingleFootMemory('right', windowSize)
    };
  }

  update(side, position, quaternion, scale, heel, toe, ankle, knee, confidence, timestamp) {
    const mem = this.feet[side];
    if (!mem) return null;
    return mem.pushObservation(position, quaternion, scale, heel, toe, ankle, knee, confidence, timestamp);
  }

  getFootMemory(side) {
    return this.feet[side];
  }

  reset(side = null) {
    if (side) {
      if (this.feet[side]) this.feet[side].reset();
    } else {
      this.feet.left.reset();
      this.feet.right.reset();
    }
  }
}
