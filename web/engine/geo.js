// Triangle-soup geometry builder (metres). Each vertex carries a position, a normal and a material id.
export class Geo {
  constructor() { this.P = []; this.N = []; this.M = []; }
  tri(a, b, c, m) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    for (const p of [a, b, c]) { this.P.push(...p); this.N.push(...n); this.M.push(m); }
  }
  quad(a, b, c, d, m) { this.tri(a, b, c, m); this.tri(a, c, d, m); }
  box(x0, x1, y0, y1, z0, z1, m, top = m, bottom = true) {
    const p = (x, y, z) => [x, y, z];
    this.quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1), m);
    this.quad(p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), p(x0, y0, z0), m);
    this.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), m);
    this.quad(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), m);
    if (top !== null) this.quad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), top);
    if (bottom) this.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), m);
  }
  // cylinder between two points
  tube(a, b, r0, r1, m, seg = 12, caps = true) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(...d); const f = d.map(v => v / L);
    const t = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0]]; const ul = Math.hypot(...u); u = u.map(v => v / ul);
    const w = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const ring = (c, r, k) => { const an = k / seg * Math.PI * 2, cs = Math.cos(an) * r, sn = Math.sin(an) * r; return [c[0] + u[0] * cs + w[0] * sn, c[1] + u[1] * cs + w[1] * sn, c[2] + u[2] * cs + w[2] * sn]; };
    for (let k = 0; k < seg; k++) {
      this.quad(ring(a, r0, k), ring(a, r0, k + 1), ring(b, r1, k + 1), ring(b, r1, k), m);
      if (caps) { this.tri(a, ring(a, r0, k + 1), ring(a, r0, k), m); this.tri(b, ring(b, r1, k), ring(b, r1, k + 1), m); }
    }
  }
  // loft through cross-sections: rings[i] = array of [x,y,z] with equal counts; closed around
  loft(rings, m, close = true) {
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], n = A.length;
      for (let k = 0; k < (close ? n : n - 1); k++) {
        const k1 = (k + 1) % n;
        this.quad(A[k], A[k1], B[k1], B[k], m);
      }
    }
  }
  // flat polygon (fan)
  disc(c, r, axis, m, seg = 16) {
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const pt = a => axis === 'y' ? [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r] : axis === 'x' ? [c[0], c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r] : [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]];
      this.tri(c, pt(a1), pt(a0), m);
    }
  }
  append(o, xf = p => p) { for (let i = 0; i < o.P.length; i += 9) this.tri(xf(o.P.slice(i, i + 3)), xf(o.P.slice(i + 3, i + 6)), xf(o.P.slice(i + 6, i + 9)), o.M[i / 3]); }
  arrays() { return { P: new Float32Array(this.P), N: new Float32Array(this.N), M: new Float32Array(this.M), count: this.P.length / 3 }; }
}
