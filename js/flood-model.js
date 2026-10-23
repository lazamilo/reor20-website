/* Illustrative flood model — a procedural catchment used to *explain* how DeepWater works.
   It is deliberately simple (a valley, a river, a rising downstream-propagating water level)
   and is labelled on the page as illustrative. It is not DeepWater and makes no claims about it. */
(function () {
  'use strict';

  // ---- noise ----
  function hash(x, y, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) {
    let v = 0, a = .5, f = 1;
    for (let o = 0; o < 5; o++) { v += a * vnoise(x * f, y * f, s + o * 17); f *= 2.03; a *= .5; }
    return v;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => t * t * (3 - 2 * t);

  // water-depth colour map, shallow → deep (matches the CSS --d0…--d5 tokens)
  const RAMP = [[0, 221, 248, 255], [.18, 143, 230, 250], [.38, 56, 211, 242], [.6, 30, 150, 230], [.8, 31, 89, 214], [1, 23, 46, 120]];
  function ramp(t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const a = RAMP[i - 1], b = RAMP[i], k = (t - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    return RAMP[RAMP.length - 1].slice(1);
  }
  const LUT = Array.from({ length: 256 }, (_, i) => ramp(i / 255));

  // ---- terrain ----
  function Terrain(W, H, seed) {
    this.W = W; this.H = H;
    const h = this.h = new Float32Array(W * H);
    const yc = this.yc = new Float32Array(W);
    const dyc = this.dyc = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      yc[x] = H * (.52 + .17 * Math.sin(u * 6.6 + .5) + .06 * Math.sin(u * 16.1 + 1.3));
    }
    for (let x = 0; x < W; x++) dyc[x] = (yc[Math.min(W - 1, x + 1)] - yc[Math.max(0, x - 1)]) / 2;
    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, d = Math.abs(y - yc[x]) / H;
      const n = fbm(x / W * 5, y / W * 5, seed);
      const r = fbm(x / W * 16, y / W * 16, seed + 91);
      // broad, gently sloping floodplain, then valley walls rising into hills
      const plain = .07 + .12 * fbm(x / W * 3, 1.7, seed + 5);
      const prof = d < plain ? d * .25 : plain * .25 + Math.pow(d - plain, 1.05) * 1.5;
      const v = prof * (.8 + .4 * n) + .09 * n + .05 * r + .04 * r * Math.min(1, d * 3) + (1 - u) * .05;
      h[y * W + x] = v;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) / (mx - mn);
    // river bed elevation: minimum within a small band around the centre line
    const bed = this.bed = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let b = Infinity;
      for (let dy = -2; dy <= 2; dy++) { const y = clamp(Math.round(yc[x]) + dy, 0, H - 1); b = Math.min(b, h[y * W + x]); }
      bed[x] = b;
    }
    for (let x = 1; x < W; x++) bed[x] = Math.min(bed[x], bed[x - 1] + .0006); // keep it draining downstream
    // carve the channel so the river is always present
    for (let x = 0; x < W; x++) for (let dy = -2; dy <= 2; dy++) {
      const y = Math.round(yc[x]) + dy; if (y < 0 || y >= H) continue;
      const i = y * W + x; h[i] = Math.min(h[i], bed[x] - .004 * (3 - Math.abs(dy)));
    }
    this.bake();
  }
  Terrain.prototype.bake = function () {
    const { W, H, h } = this;
    const base = this.base = new Uint8ClampedArray(W * H * 3);
    const cont = this.cont = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = h[i + (x < W - 1 ? 1 : 0)] - h[i - (x > 0 ? 1 : 0)];
      const gy = h[i + (y < H - 1 ? W : 0)] - h[i - (y > 0 ? W : 0)];
      const s = clamp(.78 + (-gx * .9 - gy * .7) * (W / 4.5), .25, 1.3);
      const e = Math.sqrt(h[i]);
      const r = (30 + 66 * e) * s, g = (40 + 70 * e) * s, b = (50 + 74 * e) * s;
      base[i * 3] = r; base[i * 3 + 1] = g; base[i * 3 + 2] = b;
      const c = h[i] * 22, f = c - Math.floor(c);
      cont[i] = f < .07 ? 1 : 0;
    }
  };
  // water level at column x for event progress t (0..1): a front travelling downstream
  Terrain.prototype.level = function (x, t, rise) {
    const front = smooth(clamp(t * 1.55 - (x / this.W) * .55, 0, 1));
    return this.bed[x] + .006 + rise * front;
  };
  Terrain.prototype.depth = function (x, y, t, rise) {
    const d = this.level(x, t, rise) - this.h[y * this.W + x];
    return d > 0 ? d : 0;
  };

  // ---- renderer ----
  // opts: { seed, simW, simH, rise }
  function FloodView(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.simW = opts.simW || 260; this.simH = opts.simH || 170;
    this.rise = opts.rise || .15;
    this.T = new Terrain(this.simW, this.simH, opts.seed || 7);
    this.off = document.createElement('canvas');
    this.off.width = this.simW; this.off.height = this.simH;
    this.octx = this.off.getContext('2d');
    this.img = this.octx.createImageData(this.simW, this.simH);
    this.drops = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), l: .5 + Math.random(), v: .6 + Math.random() * .6 }));
    this.assets = this.makeAssets();
    this.resize();
  }
  FloodView.prototype.makeAssets = function () {
    const T = this.T, out = [], fr = [.16, .31, .47, .63, .79, .9];
    // target ground height above the river bed, as a fraction of the flood rise:
    // a mix of deep, shallow and dry sites so the thresholds mean something
    const lift = [.35, 1.25, .75, .2, 1.15, .9];
    fr.forEach((f, k) => {
      const x = Math.round(T.W * f);
      const side = k % 2 ? 1 : -1;
      let y = Math.round(T.yc[x]);
      for (let s = 0; s < T.H * .45; s++) {
        y += side;
        if (y <= 6 || y >= T.H - 6) break;
        if (T.h[y * T.W + x] - T.bed[x] > this.rise * lift[k]) break;
      }
      out.push({ x, y, id: String.fromCharCode(65 + k) });
    });
    return out;
  };
  FloodView.prototype.resize = function () {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = Math.max(1, Math.round(r.width * dpr));
    this.ch = Math.max(1, Math.round(r.height * dpr));
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.dpr = dpr;
  };
  // fit the sim grid into the canvas (cover)
  FloodView.prototype.map = function () {
    const sx = this.cw / this.simW, sy = this.ch / this.simH, s = Math.max(sx, sy);
    return { s, ox: (this.cw - this.simW * s) / 2, oy: (this.ch - this.simH * s) / 2 };
  };

  /* state:
     t        event progress 0..1
     water    overall water visibility 0..1
     cmap     0 = realistic muddy water, 1 = depth colour map
     contours 0..1 terrain contour emphasis
     rain     0..1
     arrows   0..1 velocity streaks
     assets   0..1 threshold markers
     reveal   optional 0..1 left→right reveal mask for water (solver illustration)
     mesh     0..1 computational mesh overlay
     time     seconds, for ambient motion */
  FloodView.prototype.draw = function (st) {
    const T = this.T, W = T.W, H = T.H, d = this.img.data, base = T.base, cont = T.cont;
    const rise = this.rise, t = st.t || 0, wv = st.water == null ? 1 : st.water, cm = st.cmap || 0;
    const ce = (st.contours || 0) * 46 + 10;
    const revealX = st.reveal == null ? W : st.reveal * W;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      let r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
      if (cont[i]) { r += ce; g += ce * 1.05; b += ce * 1.1; }
      const dep = x < revealX ? T.depth(x, y, t, rise) : 0;
      if (dep > 0 && wv > 0) {
        const dn = dep / (rise * 1.05);
        const a = clamp(dep / .006, 0, 1) * .93 * wv;
        // realistic water: muted grey-teal, darker when deeper
        const mr = 92 - 40 * dn, mg = 112 - 38 * dn, mb = 118 - 30 * dn;
        const c = LUT[Math.min(255, (dn * 255) | 0)];
        let wr = mr + (c[0] - mr) * cm, wg = mg + (c[1] - mg) * cm, wb = mb + (c[2] - mb) * cm;
        if (cm > .5) { const f = (dn * 9) % 1; if (f < .08) { wr += 26 * cm; wg += 26 * cm; wb += 26 * cm; } }
        r += (wr - r) * a; g += (wg - g) * a; b += (wb - b) * a;
      }
      const o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);

    const ctx = this.ctx, m = this.map(), dpr = this.dpr;
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.off, m.ox, m.oy, W * m.s, H * m.s);

    if (st.mesh > 0) this.drawMesh(st, m);
    if (st.arrows > 0) this.drawArrows(st, m);
    if (st.rain > 0) this.drawRain(st);
    if (st.assets > 0) this.drawAssets(st, m);
    ctx.restore();
  };
  FloodView.prototype.drawMesh = function (st, m) {
    const ctx = this.ctx, step = 10, cols = Math.ceil(this.T.W / step), rows = Math.ceil(this.T.H / step);
    ctx.strokeStyle = 'rgba(200,225,245,' + (.14 * st.mesh) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) { const x = m.ox + c * step * m.s; ctx.moveTo(x, 0); ctx.lineTo(x, this.ch); }
    for (let r = 0; r <= rows; r++) { const y = m.oy + r * step * m.s; ctx.moveTo(0, y); ctx.lineTo(this.cw, y); }
    ctx.stroke();
    if (st.scan != null) {
      // highlight the cell column currently being solved
      const c = Math.floor(st.scan * cols);
      ctx.fillStyle = 'rgba(143,230,250,' + (.16 * st.mesh) + ')';
      ctx.fillRect(m.ox + c * step * m.s, 0, step * m.s, this.ch);
    }
  };
  FloodView.prototype.drawArrows = function (st, m) {
    const T = this.T, ctx = this.ctx, step = 9, time = st.time || 0;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 1.1 * this.dpr);
    for (let y = 4; y < T.H - 4; y += step) for (let x = 4; x < T.W - 4; x += step) {
      const jx = x + ((y / step) % 2) * (step / 2) | 0;
      if (jx >= T.W - 2) continue;
      const dep = T.depth(jx, y, st.t, this.rise);
      if (dep < .012) continue;
      const i = y * T.W + jx;
      const gx = T.h[i + 1] - T.h[i - 1], gy = T.h[i + T.W] - T.h[i - T.W];
      let vx = 1 - gx * 30, vy = T.dyc[jx] - gy * 30;
      const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
      const len = (3 + dep * 60) * m.s * .55;
      const ph = ((time * .7 + jx * .031 + y * .017) % 1);
      const px = m.ox + jx * m.s + vx * len * (ph - .5), py = m.oy + y * m.s + vy * len * (ph - .5);
      const a = st.arrows * Math.sin(ph * Math.PI) * clamp(dep * 18, .25, 1);
      ctx.strokeStyle = 'rgba(240,252,255,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + vx * len * .5, py + vy * len * .5); ctx.stroke();
    }
  };
  FloodView.prototype.drawRain = function (st) {
    const ctx = this.ctx, a = st.rain, time = st.time || 0;
    ctx.fillStyle = 'rgba(4,8,15,' + (.28 * a) + ')';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.strokeStyle = 'rgba(200,232,250,' + (.5 * a) + ')';
    ctx.lineWidth = Math.max(1, this.dpr * .9);
    ctx.beginPath();
    const L = this.ch * .035;
    for (const p of this.drops) {
      const y = ((p.y + time * .55 * p.v) % 1) * (this.ch + L) - L;
      const x = (p.x * this.cw + y * .12) % this.cw;
      ctx.moveTo(x, y); ctx.lineTo(x + L * .12 * p.l, y + L * p.l);
    }
    ctx.stroke();
  };
  FloodView.prototype.drawAssets = function (st, m) {
    const ctx = this.ctx, T = this.T, dpr = this.dpr, a = st.assets;
    const fs = Math.round(10.5 * dpr);
    ctx.font = fs + 'px "Maison Neue Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    this.assets.forEach((p, k) => {
      const dep = T.depth(p.x, p.y, st.t, this.rise) / (this.rise * 1.05) * 3.2; // illustrative metres
      const hot = dep >= .6;
      const x = m.ox + p.x * m.s, y = m.oy + p.y * m.s;
      const ak = clamp(a * 1.6 - k * .12, 0, 1);
      if (ak <= 0) return;
      ctx.globalAlpha = ak;
      ctx.fillStyle = hot ? '#FFB547' : '#FFFFFF';
      ctx.strokeStyle = hot ? 'rgba(255,181,71,.9)' : 'rgba(255,255,255,.85)';
      ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.arc(x, y, 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2); ctx.stroke();
      const label = p.id + '  ' + (dep < .05 ? 'dry' : dep.toFixed(1) + ' m');
      const tw = ctx.measureText(label).width, pad = 6 * dpr, bx = x + 14 * dpr, by = y - 10 * dpr, bh = 20 * dpr;
      ctx.fillStyle = 'rgba(4,8,15,.82)';
      ctx.fillRect(bx, by, tw + pad * 2, bh);
      ctx.fillStyle = hot ? '#FFB547' : '#EEF3F7';
      ctx.fillText(label, bx + pad, by + bh / 2 + dpr * .5);
    });
    ctx.globalAlpha = 1;
  };

  window.FloodView = FloodView;
})();
