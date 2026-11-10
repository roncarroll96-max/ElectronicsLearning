/** Disjoint sets: groups things that are connected to each other. */
export class UnionFind<T> {
  private parent = new Map<T, T>();

  add(x: T): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: T): T {
    let root = x;
    for (let p = this.parent.get(root); p !== undefined && p !== root; p = this.parent.get(root)) root = p;
    // Path compression: point everything on the way straight at the root.
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur) as T;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: T, b: T): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}
