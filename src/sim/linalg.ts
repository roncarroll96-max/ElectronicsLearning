/**
 * Solves A·x = b for a dense n×n matrix (row-major) using Gaussian
 * elimination with partial pivoting. A and b are overwritten.
 * Returns null if the matrix is singular or the result is not finite.
 */
export function solveDense(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col++) {
    let piv = col;
    let max = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > max) {
        max = v;
        piv = r;
      }
    }
    if (!(max > 0) || !Number.isFinite(max)) return null;
    if (piv !== col) {
      for (let c = col; c < n; c++) {
        const t = A[col * n + c];
        A[col * n + c] = A[piv * n + c];
        A[piv * n + c] = t;
      }
      const t = b[col];
      b[col] = b[piv];
      b[piv] = t;
    }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c];
    x[r] = s / A[r * n + r];
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}
