/* Luxe Aura — interactive 3D hair in plain WebGL (no libraries, ~8 KB).
   Every <canvas data-hair="hero|page|cta"> becomes a curtain of GPU-animated strands:
   - the pointer parts the strands (combing), touch works too
   - [data-shade] buttons recolour every curtain on the page; the choice is remembered across pages
   - data-extend on the hero: scrolling grows the hair longer (12" -> 26")           */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 760px)').matches;
  const SHADE_KEY = 'lxa-shade';

  const VS = `#version 300 es
    in vec4 aData;            // t, rootX, seed, lock
    uniform mat4 uPV;
    uniform float uTime, uLen, uTop, uH, uComb, uFlow;
    uniform vec2 uMouse;
    out float vT; out float vSeed; out float vHi;
    void main() {
      float t = aData.x, rootX = aData.y, seed = aData.z, lock = aData.w;
      float cp = lock * 6.2831;
      float lenR = 0.6 * lock + 0.4 * fract(seed * 7.13);
      float L = uH * (0.62 + 0.38 * lenR) * uLen;
      float y = uTop - t * L;
      float sway = sin(uTime * 0.55 + cp) * 0.32 + sin(uTime * 0.93 + cp * 1.7 + t * 2.0) * 0.11;
      float x = rootX + sin(t * 3.0 + cp) * 0.16 * uFlow + sway * t * t
              + sin(t * 7.0 + cp * 2.0 - uTime * 0.6) * 0.05 * t + (seed - 0.5) * 0.07 * t;
      float z = sin(t * 2.0 + cp) * 0.35 + (seed - 0.5) * 0.7;
      vec2 d = vec2(x, y) - uMouse;
      float f = exp(-dot(d, d) / 1.1) * uComb * smoothstep(0.02, 0.25, t);
      x += d.x / (abs(d.x) + 0.08) * f * 1.25;
      y += f * 0.08;
      vHi = pow(0.5 + 0.5 * sin(y * 1.35 + cp * 0.45 + x * 0.25 + uTime * 0.25), 14.0);
      vT = t; vSeed = seed;
      gl_Position = uPV * vec4(x, y, z, 1.0);
    }`;
  const FS = `#version 300 es
    precision mediump float;
    uniform vec3 uRoot, uTip, uShine;
    uniform float uAlpha;
    in float vT; in float vSeed; in float vHi;
    out vec4 o;
    void main() {
      vec3 col = mix(uRoot, uTip, smoothstep(0.0, 0.85, vT)) * (0.78 + 0.44 * vSeed);
      col = mix(col, uShine, vHi * 0.6);
      float a = (0.38 + 0.3 * vSeed) * smoothstep(0.0, 0.03, vT) * (1.0 - 0.85 * smoothstep(0.78, 1.0, vT));
      o = vec4(col, a * uAlpha);
    }`;

  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const lerp3 = (a, b, k) => { for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; };

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SHADE_KEY) || 'null'); } catch (e) { /* ignore */ }
  const DEFAULT = ['#7d5c31', '#dcb880', '#fff0cc'];
  const instances = [];

  function mount(canvas) {
    const kind = canvas.dataset.hair || 'page';
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: kind === 'hero' ? 'high-performance' : 'low-power' });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const U = {};
    ['uPV', 'uTime', 'uLen', 'uTop', 'uH', 'uComb', 'uFlow', 'uMouse', 'uRoot', 'uTip', 'uShine', 'uAlpha'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

    const cfg = {
      hero: { strands: small ? 1500 : 3000, seg: small ? 40 : 52, from: small ? -0.55 : -0.12, to: small ? 0.55 : 0.52, alpha: 1, len: 0.55 },
      page: { strands: small ? 900 : 2000, seg: small ? 36 : 46, from: small ? -0.55 : 0.02, to: 0.55, alpha: 0.9, len: 0.95 },
      cta: { strands: small ? 700 : 1600, seg: 40, from: -0.55, to: 0.55, alpha: 0.55, len: 1.0 },
    }[kind] || {};

    const buf = gl.createBuffer(), ibuf = gl.createBuffer();
    let count = 0, W = 1, H = 1, lastW = 0;
    const build = () => {
      const S = cfg.strands, SEG = cfg.seg, PER = 26;
      const data = new Float32Array(S * SEG * 4);
      const idx = new Uint32Array(S * (SEG - 1) * 2);
      const x0 = W * cfg.from, x1 = W * cfg.to, locks = Math.ceil(S / PER);
      const lockX = new Float32Array(locks), lockS = new Float32Array(locks);
      for (let k = 0; k < locks; k++) { lockX[k] = x0 + (x1 - x0) * ((k + Math.random() * 0.8) / locks); lockS[k] = Math.random(); }
      let v = 0, ii = 0;
      for (let s = 0; s < S; s++) {
        const lk = (s / PER) | 0;
        const rx = lockX[lk] + (Math.random() - 0.5) * ((x1 - x0) / locks) * 1.6, seed = Math.random();
        for (let k = 0; k < SEG; k++, v++) {
          data.set([k / (SEG - 1), rx, seed, lockS[lk]], v * 4);
          if (k < SEG - 1) { idx[ii++] = v; idx[ii++] = v + 1; }
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aData');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      count = idx.length;
    };

    const fov = 35 * Math.PI / 180, camZ = 10;
    const fit = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = w / h, f = 1 / Math.tan(fov / 2), n = 0.1, fa = 100;
      // projection * view(translate z -10)
      const pv = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa) - camZ * (fa + n) / (n - fa), camZ]);
      gl.uniformMatrix4fv(U.uPV, false, pv);
      H = 2 * Math.tan(fov / 2) * camZ; W = H * aspect;
      gl.uniform1f(U.uTop, H / 2 + 0.15);
      gl.uniform1f(U.uH, H * 1.12);
      if (Math.abs(w - lastW) > 40) { build(); lastW = w; }
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1f(U.uAlpha, cfg.alpha);
    gl.uniform1f(U.uFlow, 1);
    new ResizeObserver(fit).observe(canvas);
    fit();

    const shade = (saved || DEFAULT).map(hex);
    const cur = shade.map(c => c.slice());
    const st = { len: cfg.len, lenT: cfg.len, comb: 0, combT: 0, mx: 99, my: 99, tx: 99, ty: 99, target: shade };
    const onMove = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      if (cy < r.top || cy > r.bottom || cx < r.left || cx > r.right) { st.combT = 0; return; }
      st.tx = ((cx - r.left) / r.width - 0.5) * W; st.ty = -((cy - r.top) / r.height - 0.5) * H; st.combT = 1;
    };
    addEventListener('pointermove', e => onMove(e.clientX, e.clientY), { passive: true });
    addEventListener('touchmove', e => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });

    let raf = 0, visible = false;
    const t0 = performance.now();
    const frame = now => {
      const t = reduce ? 4 : (now - t0) / 1000;
      st.mx += (st.tx - st.mx) * 0.12; st.my += (st.ty - st.my) * 0.12;
      st.comb += (st.combT - st.comb) * 0.06; st.len += (st.lenT - st.len) * 0.08;
      for (let i = 0; i < 3; i++) lerp3(cur[i], st.target[i], 0.06);
      gl.uniform1f(U.uTime, t); gl.uniform1f(U.uLen, st.len); gl.uniform1f(U.uComb, st.comb);
      gl.uniform2f(U.uMouse, st.mx, st.my);
      gl.uniform3fv(U.uRoot, cur[0]); gl.uniform3fv(U.uTip, cur[1]); gl.uniform3fv(U.uShine, cur[2]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.LINES, count, gl.UNSIGNED_INT, 0);
      if (visible && !reduce) raf = requestAnimationFrame(frame);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    }).observe(canvas);
    document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden && visible) raf = requestAnimationFrame(frame); });
    requestAnimationFrame(() => canvas.classList.add('is-ready'));
    return {
      setShade: s => { st.target = s.map(hex); },
      setLength: v => { st.lenT = v; },
    };
  }

  const start = () => {
    document.querySelectorAll('canvas[data-hair]').forEach(c => {
      const go = () => { try { const api = mount(c); if (api) { instances.push(api); c._hair = api; } } catch (e) { console.warn('hair', e); } };
      if (c.dataset.hair === 'cta') {
        new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); go(); } }, { rootMargin: '300px' }).observe(c);
      } else go();
    });

    // shade buttons (remembered across pages)
    const btns = document.querySelectorAll('[data-shade]');
    const mark = s => btns.forEach(b => { const on = b.dataset.shade === JSON.stringify(s); b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    if (saved) mark(saved);
    btns.forEach(b => b.addEventListener('click', () => {
      const s = JSON.parse(b.dataset.shade);
      instances.forEach(i => i.setShade(s));
      mark(s);
      try { localStorage.setItem(SHADE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    }));

    // scroll to extend (home hero)
    const hero = document.querySelector('[data-extend]');
    const canvas = hero && hero.querySelector('canvas[data-hair]');
    if (canvas && canvas._hair) {
      const meter = hero.querySelector('[data-meter]'), inches = hero.querySelector('[data-inches]');
      const upd = () => {
        const r = hero.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
        canvas._hair.setLength(0.55 + p * 0.55);
        if (meter) meter.style.transform = `scaleY(${0.15 + p * 0.85})`;
        if (inches) inches.textContent = Math.round(12 + p * 14);
      };
      addEventListener('scroll', upd, { passive: true });
      upd();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
