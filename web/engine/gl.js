// Thin WebGL2 helpers: programs, textures, framebuffers, math.
export let gl = null;

export function initGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  gl.getExtension('OES_texture_float_linear');
  return gl;
}

function compile(type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
    const m = /0:(\d+)/.exec(log);
    const ctx = m ? lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n') : '';
    throw new Error(`[${name}] ${log}\n${ctx}`);
  }
  return s;
}

export function program(name, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs, name + '.vs'));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs, name + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${name}] link: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
  }
  let unit = 0;
  const texUnits = {};
  return {
    p, u,
    use() { gl.useProgram(p); unit = 0; return this; },
    set(vals) {
      for (const k in vals) {
        const e = u[k];
        if (!e) continue;
        const v = vals[k], L = e.loc;
        switch (e.type) {
          case gl.FLOAT: e.size > 1 ? gl.uniform1fv(L, v) : gl.uniform1f(L, v); break;
          case gl.FLOAT_VEC2: gl.uniform2fv(L, v); break;
          case gl.FLOAT_VEC3: gl.uniform3fv(L, v); break;
          case gl.FLOAT_VEC4: gl.uniform4fv(L, v); break;
          case gl.FLOAT_MAT4: gl.uniformMatrix4fv(L, false, v); break;
          case gl.INT: case gl.BOOL: gl.uniform1i(L, v); break;
          case gl.SAMPLER_2D: case gl.SAMPLER_2D_ARRAY: case gl.SAMPLER_3D: {
            if (!(k in texUnits)) texUnits[k] = Object.keys(texUnits).length;
            const t = texUnits[k];
            gl.activeTexture(gl.TEXTURE0 + t);
            gl.bindTexture(e.type === gl.SAMPLER_2D ? gl.TEXTURE_2D : e.type === gl.SAMPLER_3D ? gl.TEXTURE_3D : gl.TEXTURE_2D_ARRAY, v);
            gl.uniform1i(L, t);
            break;
          }
          default: throw new Error('uniform type ' + e.type + ' for ' + k);
        }
      }
      return this;
    },
  };
}

export function texture({ w, h, internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, data = null, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mips = false }) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  t.w = w; t.h = h;
  return t;
}

export function canvasTexture(canvas, { mips = true, wrap = gl.CLAMP_TO_EDGE, premul = true, tex = null } = {}) {
  const t = tex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (!tex) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  t.w = canvas.width; t.h = canvas.height;
  return t;
}

export function target(w, h, { internal = gl.RGBA16F, depth = false } = {}) {
  const fb = gl.createFramebuffer();
  const color = texture({ w, h, internal, format: gl.RGBA, type: internal === gl.RGBA8 ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT });
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  let dtex = null;
  if (depth) {
    dtex = texture({ w, h, internal: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT, filter: gl.NEAREST });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dtex, 0);
  }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + st);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, color, depth: dtex, w, h };
}

export function bindTarget(t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  gl.viewport(0, 0, t ? t.w : gl.drawingBufferWidth, t ? t.h : gl.drawingBufferHeight);
}

// ---------- math (column-major 4x4) ----------
export const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export function lookAt(eye, at, up = [0, 1, 0]) {
  const f = v3.norm(v3.sub(at, eye));
  const s = v3.norm(v3.cross(f, up));
  const u = v3.cross(s, f);
  return {
    m: new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -v3.dot(s, eye), -v3.dot(u, eye), v3.dot(f, eye), 1]),
    right: s, up: u, fwd: f,
  };
}

// Reversed-Z perspective (near -> ndc 1, far -> ndc -1); use depthFunc GREATER, clearDepth 0.
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (far - near), -1, 0, 0, 2 * far * near / (far - near), 0]);
}

export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

export function invert(m) {
  const inv = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  det = 1 / det;
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return inv;
}
