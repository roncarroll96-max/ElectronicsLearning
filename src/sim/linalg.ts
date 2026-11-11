/**
 * Solves A·x = b for a dense n×n matrix (row-major) using Gaussian
 * elimination with partial pivoting. A and b are overwritten.
 * Returns null if the matrix is singular or the result is not finite.
 * The answer goes into `out` when given (so a loop can reuse one array).
 */
export function solveDense(A: Float64Array, b: Float64Array, n: number, out?: Float64Array): Float64Array | null {
  for (let col = 0; col < n; col++) {
    const cc = col * n;
    let piv = col;
    let max = Math.abs(A[cc + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > max) {
        max = v;
        piv = r;
      }
    }
    if (!(max > 0) || !Number.isFinite(max)) return null;
    if (piv !== col) {
      const pc = piv * n;
      for (let c = col; c < n; c++) {
        const t = A[cc + c];
        A[cc + c] = A[pc + c];
        A[pc + c] = t;
      }
      const t = b[col];
      b[col] = b[piv];
      b[piv] = t;
    }
    const d = A[cc + col];
    const bc = b[col];
    for (let r = col + 1; r < n; r++) {
      const rc = r * n;
      const f = A[rc + col] / d;
      if (f === 0) continue;
      for (let c = col + 1; c < n; c++) A[rc + c] -= f * A[cc + c];
      b[r] -= f * bc;
    }
  }
  const x = out ?? new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    const rc = r * n;
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[rc + c] * x[c];
    x[r] = s / A[rc + r];
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}
