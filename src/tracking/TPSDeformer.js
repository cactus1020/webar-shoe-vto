/**
 * TPSDeformer.js - 3D Thin-Plate Spline (TPS) Non-Rigid Surface Warper
 * 
 * Mathematical Foundation:
 * Given N 3D source control points {S_i} on a canonical shoe model and
 * N 3D target control points {T_i} on the user's tracked foot surface,
 * Thin-Plate Spline finds the unique mapping f: R^3 -> R^3 that minimizes
 * the physical bending energy of a thin metal plate while interpolating
 * the control point displacements.
 * 
 * Mapping function:
 * f(x, y, z) = a_0 + a_x*x + a_y*y + a_z*z + sum_{i=1}^N w_i * U(||(x,y,z) - S_i||)
 * 
 * Kernel function in 3D:
 * U(r) = r^2 * ln(r + eps)  (or U(r) = r for 3D biharmonic RBF)
 * 
 * System matrix L of size (N+4) x (N+4):
 * [ K + lambda*I   P  ] [ W ] = [ T ]
 * [     P^T        0  ] [ A ]   [ 0 ]
 * where K_ij = U(||S_i - S_j||), P_i = [1, S_i.x, S_i.y, S_i.z]
 */
import * as THREE from 'three';

export class TPSDeformer3D {
  constructor(regularization = 0.0005) {
    this.lambda = regularization;
    this.sourcePoints = [];
    this.targetPoints = [];
    this.weights = [];      // N x 3
    this.affine = [];       // 4 x 3
    this.isTrained = false;
    this.numPoints = 0;
  }

  /**
   * Evaluates the radial basis kernel U(r)
   * Using 3D biharmonic kernel U(r) = r
   */
  _kernel(r) {
    return r; // Standard 3D biharmonic TPS kernel
  }

  /**
   * Sets up and solves the TPS linear system from source to target control points
   * @param {Array<THREE.Vector3>} srcPoints - Canonical control points on shoe template
   * @param {Array<THREE.Vector3>} dstPoints - Target control points on deformed foot surface
   */
  solve(srcPoints, dstPoints) {
    const N = srcPoints.length;
    if (N < 4 || dstPoints.length !== N) {
      this.isTrained = false;
      return false;
    }

    this.numPoints = N;
    this.sourcePoints = srcPoints.map(p => p.clone());
    this.targetPoints = dstPoints.map(p => p.clone());

    const dim = N + 4;
    // Allocate matrix L of size dim x dim
    const L = new Float64Array(dim * dim);
    // Allocate RHS vector Y of size dim x 3
    const Y = new Float64Array(dim * 3);

    // 1. Fill K matrix (N x N)
    for (let i = 0; i < N; i++) {
      const pi = this.sourcePoints[i];
      for (let j = 0; j < N; j++) {
        if (i === j) {
          L[i * dim + j] = this.lambda;
        } else {
          const pj = this.sourcePoints[j];
          const dist = pi.distanceTo(pj);
          L[i * dim + j] = this._kernel(dist);
        }
      }
    }

    // 2. Fill P matrix (N x 4) and P^T (4 x N)
    for (let i = 0; i < N; i++) {
      const p = this.sourcePoints[i];
      // P part
      L[i * dim + (N + 0)] = 1.0;
      L[i * dim + (N + 1)] = p.x;
      L[i * dim + (N + 2)] = p.y;
      L[i * dim + (N + 3)] = p.z;

      // P^T part
      L[(N + 0) * dim + i] = 1.0;
      L[(N + 1) * dim + i] = p.x;
      L[(N + 2) * dim + i] = p.y;
      L[(N + 3) * dim + i] = p.z;
    }

    // 3. Fill zero block (4 x 4) at bottom-right (already 0 in Float64Array)

    // 4. Fill RHS Y (dim x 3)
    for (let i = 0; i < N; i++) {
      const t = this.targetPoints[i];
      Y[i * 3 + 0] = t.x;
      Y[i * 3 + 1] = t.y;
      Y[i * 3 + 2] = t.z;
    }
    // Last 4 rows of Y are 0

    // 5. Solve linear system L * X = Y using Gaussian Elimination with partial pivoting
    const X = this._solveLinearSystem(L, Y, dim, 3);
    if (!X) {
      this.isTrained = false;
      return false;
    }

    // 6. Extract weights W (N x 3) and affine parameters A (4 x 3)
    this.weights = [];
    for (let i = 0; i < N; i++) {
      this.weights.push(new THREE.Vector3(
        X[i * 3 + 0],
        X[i * 3 + 1],
        X[i * 3 + 2]
      ));
    }

    this.affine = [
      new THREE.Vector3(X[(N + 0) * 3 + 0], X[(N + 0) * 3 + 1], X[(N + 0) * 3 + 2]), // a0
      new THREE.Vector3(X[(N + 1) * 3 + 0], X[(N + 1) * 3 + 1], X[(N + 1) * 3 + 2]), // ax
      new THREE.Vector3(X[(N + 2) * 3 + 0], X[(N + 2) * 3 + 1], X[(N + 2) * 3 + 2]), // ay
      new THREE.Vector3(X[(N + 3) * 3 + 0], X[(N + 3) * 3 + 1], X[(N + 3) * 3 + 2])  // az
    ];

    this.isTrained = true;
    return true;
  }

  /**
   * Warps a single 3D point using the calculated TPS transform
   * @param {THREE.Vector3} v - Input vertex
   * @param {THREE.Vector3} out - Output warped vertex (optional)
   * @returns {THREE.Vector3}
   */
  transformPoint(v, out = new THREE.Vector3()) {
    if (!this.isTrained) {
      out.copy(v);
      return out;
    }

    // Affine component: a0 + ax*x + ay*y + az*z
    out.set(
      this.affine[0].x + this.affine[1].x * v.x + this.affine[2].x * v.y + this.affine[3].x * v.z,
      this.affine[0].y + this.affine[1].y * v.x + this.affine[2].y * v.y + this.affine[3].y * v.z,
      this.affine[0].z + this.affine[1].z * v.x + this.affine[2].z * v.y + this.affine[3].z * v.z
    );

    // Non-rigid kernel sum: sum w_i * U(||v - S_i||)
    for (let i = 0; i < this.numPoints; i++) {
      const src = this.sourcePoints[i];
      const dx = v.x - src.x;
      const dy = v.y - src.y;
      const dz = v.z - src.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = this._kernel(dist);
      const w = this.weights[i];

      out.x += w.x * k;
      out.y += w.y * k;
      out.z += w.z * k;
    }

    return out;
  }

  /**
   * Warps an entire Three.js BufferGeometry in-place
   * @param {THREE.BufferGeometry} geometry - Three.js geometry to deform
   * @param {Float32Array} basePositions - Reference un-deformed canonical vertex positions
   */
  deformGeometry(geometry, basePositions) {
    if (!this.isTrained || !geometry || !basePositions) return;

    const posAttr = geometry.attributes.position;
    if (!posAttr) return;

    const count = posAttr.count;
    const vIn = new THREE.Vector3();
    const vOut = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      vIn.set(
        basePositions[i * 3 + 0],
        basePositions[i * 3 + 1],
        basePositions[i * 3 + 2]
      );

      this.transformPoint(vIn, vOut);

      posAttr.setXYZ(i, vOut.x, vOut.y, vOut.z);
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  /**
   * Gaussian elimination with partial pivoting for multi-column RHS
   */
  _solveLinearSystem(A, B, n, m) {
    const M = new Float64Array(A);
    const X = new Float64Array(B);

    for (let k = 0; k < n; k++) {
      // Find pivot
      let maxVal = Math.abs(M[k * n + k]);
      let maxRow = k;
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(M[i * n + k]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxVal < 1e-12) {
        // Singular or degenerate matrix
        return null;
      }

      // Swap rows in M and X
      if (maxRow !== k) {
        for (let j = k; j < n; j++) {
          const temp = M[k * n + j];
          M[k * n + j] = M[maxRow * n + j];
          M[maxRow * n + j] = temp;
        }
        for (let j = 0; j < m; j++) {
          const temp = X[k * m + j];
          X[k * m + j] = X[maxRow * m + j];
          X[maxRow * m + j] = temp;
        }
      }

      // Eliminate below
      const pivot = M[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const factor = M[i * n + k] / pivot;
        M[i * n + k] = 0;
        for (let j = k + 1; j < n; j++) {
          M[i * n + j] -= factor * M[k * n + j];
        }
        for (let j = 0; j < m; j++) {
          X[i * m + j] -= factor * X[k * m + j];
        }
      }
    }

    // Back substitution
    for (let i = n - 1; i >= 0; i--) {
      const diag = M[i * n + i];
      for (let j = 0; j < m; j++) {
        let sum = X[i * m + j];
        for (let k = i + 1; k < n; k++) {
          sum -= M[i * n + k] * X[k * m + j];
        }
        X[i * m + j] = sum / diag;
      }
    }

    return X;
  }
}
