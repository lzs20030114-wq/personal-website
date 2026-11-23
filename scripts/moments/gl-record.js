// 注入到页面最前面：记下 WebGL 每次画三角形时用的顶点与模型变换，供 capture.mjs 把「这一帧画了什么」原样取出来。
// 站上代码一行不改：台架照常画，这里只在旁边抄一份（gl3d 的网格着色器：world = uModelR · aPos + uModelT，顶点 = 位置 3 + 法向 3）。
(() => {
  const rec = { on: false, calls: [] };
  window.__rec = rec;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    const states = new WeakMap();
    const S = (gl) => {
      let s = states.get(gl);
      if (!s) states.set(gl, (s = { buf: null, prog: null, bufs: new WeakMap(), names: new WeakMap(), uni: new WeakMap(), ptr: null }));
      return s;
    };
    const U = (s) => {
      let u = s.uni.get(s.prog);
      if (!u) s.uni.set(s.prog, (u = {}));
      return u;
    };
    const wrap = (name, fn) => {
      const f = P[name];
      if (!f) return;
      P[name] = function (...a) {
        const r = f.apply(this, a);
        try { fn(this, S(this), a, r); } catch (e) { console.error('rec', name, e); }
        return r;
      };
    };
    wrap('bindBuffer', (gl, s, [target, buf]) => { if (target === gl.ARRAY_BUFFER) s.buf = buf; });
    wrap('bufferData', (gl, s, [target, data]) => {
      if (target !== gl.ARRAY_BUFFER || !s.buf || typeof data === 'number' || !data) return;
      const src = data instanceof Float32Array ? data : ArrayBuffer.isView(data) ? new Float32Array(data.buffer, data.byteOffset, data.byteLength >> 2) : new Float32Array(data);
      s.bufs.set(s.buf, new Float32Array(src));
    });
    wrap('useProgram', (gl, s, [p]) => { s.prog = p; });
    wrap('getUniformLocation', (gl, s, [, name], loc) => { if (loc) s.names.set(loc, name); });
    wrap('vertexAttribPointer', (gl, s, [idx, size, , , stride, offset]) => { if (offset === 0) s.ptr = { stride, size }; });
    const setU = (gl, s, [loc, ...v]) => {
      const n = loc && s.names.get(loc);
      if (n && s.prog) U(s)[n] = v.length === 1 && typeof v[0] !== 'number' ? Array.from(v[0]) : v.length === 2 && typeof v[1] !== 'number' ? Array.from(v[1]) : v;
    };
    for (const n of ['uniform1f', 'uniform2f', 'uniform3f', 'uniformMatrix3fv']) wrap(n, setU);
    wrap('drawArrays', (gl, s, [mode, first, count]) => {
      if (!rec.on || mode !== gl.TRIANGLES || !s.buf || !s.prog) return;
      const data = s.bufs.get(s.buf);
      const u = U(s);
      if (!data || !u.uModelR) return;
      const stride = (s.ptr?.stride || 24) >> 2;
      const R = u.uModelR, T = u.uModelT ?? [0, 0, 0];
      const out = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const o = (first + i) * stride;
        const x = data[o], y = data[o + 1], z = data[o + 2];
        out[i * 3] = R[0] * x + R[3] * y + R[6] * z + T[0];
        out[i * 3 + 1] = R[1] * x + R[4] * y + R[7] * z + T[1];
        out[i * 3 + 2] = R[2] * x + R[5] * y + R[8] * z + T[2];
      }
      rec.calls.push({ canvas: gl.canvas, v: out, T: [T[0], T[1], T[2]], lite: (u.uLite ?? [1, 1, 1]).slice(0, 3), dark: (u.uDark ?? [0, 0, 0]).slice(0, 3), alpha: u.uAlpha ? u.uAlpha[0] : 1 });
    });
  }
  // 取出某个容器里那块画布上一帧的全部三角形：{meta: [{n, T, lite, dark, alpha}], b64: Float32 位置连在一起}
  window.__recDump = (root) => {
    const calls = rec.calls.filter((c) => root.contains(c.canvas));
    let total = 0;
    for (const c of calls) total += c.v.length;
    const all = new Float32Array(total);
    let o = 0;
    const meta = calls.map((c) => { all.set(c.v, o); o += c.v.length; return { n: c.v.length / 9, T: c.T, lite: c.lite, dark: c.dark, alpha: c.alpha }; });
    const bytes = new Uint8Array(all.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { meta, b64: btoa(bin) };
  };
})();
