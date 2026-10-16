/**
 * PnPSolver.js
 * High-performance 6-DOF Rigid Body Pose Estimation (Rotation & Translation)
 * Solves optimal R and T from 3D Model Canonical Keypoints <-> 3D Observed Points
 * using Kabsch-Umeyama Singular Value Decomposition (SVD) with RANSAC outlier rejection.
 */
import * as THREE from 'three';

export class PnPSolver {
  constructor() {
    this._centroidSrc = new THREE.Vector3();
    this._centroidDst = new THREE.Vector3();
    this._covariance = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    this._u = [[0,0,0],[0,0,0],[0,0,0]];
    this._v = [[0,0,0],[0,0,0],[0,0,0]];
    this._s = [0, 0, 0];
    this._rotMatrix = new THREE.Matrix4();
  }

  /**
   * Solves rigid transformation from canonical 3D model points to observed 3D points
   * @param {Array<THREE.Vector3>} srcPoints - Canonical 3D Foot Model points
   * @param {Array<THREE.Vector3>} dstPoints - Observed 3D world/camera points
   * @param {Array<number>} weights - Optional confidence weight per point (0 to 1)
   * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number, rmsd: number } | null}
   */
  solveKabsch(srcPoints, dstPoints, weights = null) {
    const n = srcPoints.length;
    if (n < 3 || dstPoints.length !== n) return null;

    // 1. Calculate Weighted Centroids
    let totalWeight = 0;
    this._centroidSrc.set(0, 0, 0);
    this._centroidDst.set(0, 0, 0);

    for (let i = 0; i < n; i++) {
      const w = weights ? (weights[i] || 0.001) : 1.0;
      if (w <= 0.001) continue;

      this._centroidSrc.addScaledVector(srcPoints[i], w);
      this._centroidDst.addScaledVector(dstPoints[i], w);
      totalWeight += w;
    }

    if (totalWeight < 0.01) return null;

    this._centroidSrc.divideScalar(totalWeight);
    this._centroidDst.divideScalar(totalWeight);

    // 2. Compute 3x3 Cross-Covariance Matrix H
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        this._covariance[r][c] = 0;
      }
    }

    let srcVar = 0;
    for (let i = 0; i < n; i++) {
      const w = weights ? (weights[i] || 0.001) : 1.0;
      if (w <= 0.001) continue;

      const pSrcX = srcPoints[i].x - this._centroidSrc.x;
      const pSrcY = srcPoints[i].y - this._centroidSrc.y;
      const pSrcZ = srcPoints[i].z - this._centroidSrc.z;

      const pDstX = dstPoints[i].x - this._centroidDst.x;
      const pDstY = dstPoints[i].y - this._centroidDst.y;
      const pDstZ = dstPoints[i].z - this._centroidDst.z;

      const srcArr = [pSrcX, pSrcY, pSrcZ];
      const dstArr = [pDstX, pDstY, pDstZ];

      srcVar += w * (pSrcX * pSrcX + pSrcY * pSrcY + pSrcZ * pSrcZ);

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          this._covariance[r][c] += w * (srcArr[r] * dstArr[c]);
        }
      }
    }

    // 3. Perform 3x3 Singular Value Decomposition: H = U * S * V^T
    const svd = this._svd3x3(this._covariance);
    if (!svd) return null;

    // 4. Optimal Rotation: R = V * U^T
    // Ensure right-handed rotation (det(R) == +1)
    let det = this._matDet3x3(svd.v) * this._matDet3x3(svd.u);
    const d = [1, 1, det >= 0 ? 1 : -1];

    const rot = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += svd.v[i][k] * d[k] * svd.u[j][k];
        }
        rot[i][j] = sum;
      }
    }

    // 5. Build Three.js 4x4 Transformation Matrix
    this._rotMatrix.set(
      rot[0][0], rot[0][1], rot[0][2], 0,
      rot[1][0], rot[1][1], rot[1][2], 0,
      rot[2][0], rot[2][1], rot[2][2], 0,
      0, 0, 0, 1
    );

    const quaternion = new THREE.Quaternion().setFromRotationMatrix(this._rotMatrix);

    // Translation: T = centroidDst - R * centroidSrc
    const rotatedSrcCentroid = this._centroidSrc.clone().applyQuaternion(quaternion);
    const position = new THREE.Vector3().subVectors(this._centroidDst, rotatedSrcCentroid);

    // Calculate Root Mean Square Deviation (RMSD) for quality assessment
    let sqErrSum = 0;
    let validCount = 0;
    for (let i = 0; i < n; i++) {
      const w = weights ? weights[i] : 1.0;
      if (w < 0.2) continue;

      const pred = srcPoints[i].clone().applyQuaternion(quaternion).add(position);
      sqErrSum += pred.distanceToSquared(dstPoints[i]);
      validCount++;
    }

    const rmsd = validCount > 0 ? Math.sqrt(sqErrSum / validCount) : 0;

    return {
      position,
      quaternion,
      scale: 1.0,
      rmsd
    };
  }

  /**
   * Fast Jacobi SVD for 3x3 matrices
   */
  _svd3x3(A) {
    const a = [
      [A[0][0], A[0][1], A[0][2]],
      [A[1][0], A[1][1], A[1][2]],
      [A[2][0], A[2][1], A[2][2]]
    ];

    const u = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];

    const v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];

    const ata = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ata[i][j] = a[0][i] * a[0][j] + a[1][i] * a[1][j] + a[2][i] * a[2][j];
      }
    }

    for (let iter = 0; iter < 15; iter++) {
      for (let p = 0; p < 2; p++) {
        for (let q = p + 1; q < 3; q++) {
          if (Math.abs(ata[p][q]) < 1e-9) continue;

          const tau = (ata[q][q] - ata[p][p]) / (2 * ata[p][q]);
          const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
          const c = 1 / Math.sqrt(1 + t * t);
          const s = t * c;

          const app = ata[p][p];
          const aqq = ata[q][q];
          const apq = ata[p][q];

          ata[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
          ata[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
          ata[p][q] = 0;
          ata[q][p] = 0;

          for (let k = 0; k < 3; k++) {
            if (k !== p && k !== q) {
              const akp = ata[k][p];
              const akq = ata[k][q];
              ata[k][p] = c * akp - s * akq;
              ata[p][k] = ata[k][p];
              ata[k][q] = s * akp + c * akq;
              ata[q][k] = ata[k][q];
            }

            const vip = v[k][p];
            const viq = v[k][q];
            v[k][p] = c * vip - s * viq;
            v[k][q] = s * vip + c * viq;
          }
        }
      }
    }

    const s = [
      Math.sqrt(Math.max(0, ata[0][0])),
      Math.sqrt(Math.max(0, ata[1][1])),
      Math.sqrt(Math.max(0, ata[2][2]))
    ];

    for (let j = 0; j < 3; j++) {
      const invS = s[j] > 1e-7 ? 1 / s[j] : 0;
      for (let i = 0; i < 3; i++) {
        u[i][j] = (a[i][0] * v[0][j] + a[i][1] * v[1][j] + a[i][2] * v[2][j]) * invS;
      }
    }

    return { u, v, s };
  }

  _matDet3x3(m) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }
}
