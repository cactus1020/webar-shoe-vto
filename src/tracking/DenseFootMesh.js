/**
 * DenseFootMesh.js
 * Parametric 24-Point Anatomical Foot Control System for TPS Deformation
 * 
 * CRITICAL FIX:
 * Canonical and Target control points MUST both be in LOCAL SHOE MODEL SPACE (centered around 0,0,0).
 * This allows the 3D Thin-Plate Spline deformer to warp the shoe's local mesh geometry (stretching,
 * widening, molding to foot arch) while Three.js rootGroup handles global 6-DOF world placement (position/quaternion).
 */
import * as THREE from 'three';

// 24 Canonical 3D Foot Control Points in LOCAL SHOE SPACE (Right Foot, meters)
// Origin (0,0,0) is at midfoot sole level.
// +Z = Forward (Toe), +Y = Up (Laces), +X = Lateral (Outer border for right foot).
export const CANONICAL_SHOE_CONTROL_POINTS_RIGHT = [
  // Heel Cup (0-4)
  new THREE.Vector3(0.000, 0.015, -0.115),   // 0: Heel Center Base
  new THREE.Vector3(-0.028, 0.020, -0.105),  // 1: Heel Medial (Inner)
  new THREE.Vector3(0.028, 0.020, -0.105),   // 2: Heel Lateral (Outer)
  new THREE.Vector3(0.000, 0.075, -0.110),   // 3: Heel Counter Top (Achilles)
  new THREE.Vector3(0.000, 0.045, -0.115),   // 4: Heel Mid-Back

  // Ankle Collar Opening (5-8)
  new THREE.Vector3(-0.034, 0.082, -0.065),  // 5: Medial Malleolus (Inner Ankle)
  new THREE.Vector3(0.036, 0.078, -0.070),   // 6: Lateral Malleolus (Outer Ankle)
  new THREE.Vector3(0.000, 0.088, -0.065),   // 7: Collar Center Top
  new THREE.Vector3(0.000, 0.060, -0.045),   // 8: Instep Tongue Throat

  // Midfoot & Arch (9-13)
  new THREE.Vector3(-0.032, 0.022, -0.020),  // 9: Medial Longitudinal Arch (Inner curve)
  new THREE.Vector3(0.042, 0.012, -0.020),   // 10: Lateral Foot Border (Outer edge)
  new THREE.Vector3(-0.005, 0.068, 0.000),   // 11: Instep Ridge Apex (Laces Peak)
  new THREE.Vector3(-0.024, 0.052, 0.000),   // 12: Medial Instep Slope
  new THREE.Vector3(0.028, 0.048, 0.000),    // 13: Lateral Instep Slope

  // Forefoot & Ball (14-18)
  new THREE.Vector3(-0.046, 0.015, 0.055),   // 14: Ball Medial (1st MTP Joint - Big Toe Base)
  new THREE.Vector3(0.046, 0.014, 0.040),    // 15: Ball Lateral (5th MTP Joint - Pinky Toe Base)
  new THREE.Vector3(0.000, 0.042, 0.055),    // 16: Forefoot Bridge Center
  new THREE.Vector3(-0.025, 0.038, 0.065),   // 17: Halux Joint Top
  new THREE.Vector3(0.028, 0.032, 0.055),    // 18: Pinky Joint Top

  // Toe Box & Tips (19-23)
  new THREE.Vector3(-0.028, 0.018, 0.138),   // 19: Big Toe Tip (Halux)
  new THREE.Vector3(-0.006, 0.018, 0.144),   // 20: Index Toe Tip (Longest point)
  new THREE.Vector3(0.018, 0.016, 0.135),    // 21: Middle/Ring Toe Tip
  new THREE.Vector3(0.038, 0.014, 0.118),    // 22: Pinky Toe Tip
  new THREE.Vector3(0.000, 0.000, 0.000)     // 23: Sole Ground Contact Center
];

// Mirrored Canonical 3D Foot Control Points in LOCAL SHOE SPACE (Left Foot)
export const CANONICAL_SHOE_CONTROL_POINTS_LEFT = CANONICAL_SHOE_CONTROL_POINTS_RIGHT.map(p => {
  return new THREE.Vector3(-p.x, p.y, p.z);
});

export class DenseFootMesh {
  constructor() {
    this._rightBase = CANONICAL_SHOE_CONTROL_POINTS_RIGHT;
    this._leftBase = CANONICAL_SHOE_CONTROL_POINTS_LEFT;
  }

  getCanonicalPoints(isRight = true) {
    return isRight ? this._rightBase : this._leftBase;
  }

  /**
   * Reconstructs 24 dense target control points in LOCAL SHOE SPACE
   * @param {number} footLengthMeters - Real tracked foot length in meters (e.g. 0.25)
   * @param {number} widthRatio - Foot width ratio (default ~0.38)
   * @param {number} instepHeightRatio - Instep height ratio (default ~0.32)
   * @param {boolean} isRight - True for right foot, false for left
   * @returns {Array<THREE.Vector3>} 24 target points in local model space
   */
  generateLocalTargetPoints(footLengthMeters = 0.26, widthRatio = 0.38, instepHeightRatio = 0.32, isRight = true) {
    const base = isRight ? this._rightBase : this._leftBase;
    const targetPoints = [];

    const canonicalLength = 0.26;
    const lengthScale = THREE.MathUtils.clamp(footLengthMeters / canonicalLength, 0.85, 1.25);
    const widthScale = THREE.MathUtils.clamp((widthRatio / 0.38), 0.85, 1.30);
    const heightScale = THREE.MathUtils.clamp((instepHeightRatio / 0.32), 0.85, 1.25);

    for (let i = 0; i < base.length; i++) {
      const canon = base[i];
      targetPoints.push(new THREE.Vector3(
        canon.x * widthScale,
        canon.y * heightScale,
        canon.z * lengthScale
      ));
    }

    return targetPoints;
  }
}
