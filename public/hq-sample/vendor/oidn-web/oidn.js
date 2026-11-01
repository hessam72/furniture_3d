var Kn = Object.defineProperty;
var qn = (i, t, e) => t in i ? Kn(i, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : i[t] = e;
var g = (i, t, e) => qn(i, typeof t != "symbol" ? t + "" : t, e);
class jn {
  constructor() {
    g(this, "dims", []);
    g(this, "paddedDims", []);
    g(this, "layout", "x");
    g(this, "dataType", "Float32");
  }
  getByteSize() {
    let t = 1;
    for (const e of this.paddedDims)
      t *= e;
    return this.dataType === "Float32" ? t *= 4 : this.dataType === "Float16" && (t *= 2), t;
  }
}
class Jn {
  constructor(t, e) {
    this.desc = t, this.data = e;
  }
}
class Qn {
  constructor(t) {
    g(this, "offset", 0);
    this._view = t;
  }
  read(t) {
    const e = this._view, n = this.offset;
    switch (this.offset += t, t) {
      case 1:
        return e.getUint8(n);
      case 2:
        return e.getUint16(n, !0);
      case 4:
        return e.getUint32(n, !0);
      case 8:
        return Number(e.getBigUint64(n, !0));
      default:
        throw new Error("unsupported read size");
    }
  }
}
function Zn(i) {
  const t = new Uint8Array(i), e = new Qn(new DataView(i));
  if (e.read(2) !== 16855)
    throw new Error("invalid or corrupted weights blob");
  const o = e.read(1);
  if (e.read(1), o !== 2)
    throw new Error("unsupported weights blob version");
  const r = e.read(8);
  e.offset = r;
  const s = e.read(4), a = /* @__PURE__ */ new Map();
  for (let u = 0; u < s; ++u) {
    const l = new jn(), p = e.read(2), c = new TextDecoder().decode(
      t.subarray(e.offset, e.offset + p)
    );
    e.offset += p;
    const f = e.read(1);
    for (let x = 0; x < f; ++x)
      l.dims.push(e.read(4));
    l.paddedDims = [...l.dims], new TextDecoder().decode(
      t.subarray(e.offset, e.offset + f)
    ) === "oihw" && (l.layout = "oihw"), e.offset += f;
    const h = String.fromCharCode(e.read(1));
    if (h === "f")
      l.dataType = "Float32";
    else if (h === "h")
      l.dataType = "Float16";
    else
      throw new Error("invalid tensor data type");
    const _ = e.read(8), y = t.slice(
      _,
      _ + l.getByteSize()
    );
    a.set(c, new Jn(l, y));
  }
  return a;
}
function ti(i, t) {
  return i.channels === t.channels;
}
const Mt = 8;
class zt {
  constructor(t, e, n) {
    g(this, "autoUpdateOutputBuffer", !0);
    g(this, "_label");
    g(this, "_device");
    g(this, "_outputBuffers", {});
    g(this, "_pipeline");
    g(this, "_bindGroups", []);
    g(this, "_needsUpdatePipeline", !0);
    g(this, "_needsResizeBuffer", !0);
    g(this, "_inputs", []);
    g(this, "_outputs", []);
    g(this, "_uniforms", []);
    g(this, "_uniformBuffers", {});
    g(this, "_width", 10);
    g(this, "_height", 10);
    g(this, "_execWidth");
    g(this, "_execHeight");
    g(this, "_csCode", "");
    g(this, "_csMain");
    g(this, "_csDefine");
    g(this, "_groupOffsets", {
      inputs: 0,
      uniforms: 1,
      outputs: 2
    });
    this._label = t, this._device = e, this._csMain = n.csMain, this._csDefine = n.csDefine, this._inputs = n.inputs, this._outputs = n.outputs, this._uniforms = n.uniforms, this.autoUpdateOutputBuffer = n.autoUpdateOutputBuffer ?? !0, n.uniforms.forEach((o) => {
      this._uniformBuffers[o.label] = e.createBuffer({
        label: this._label,
        size: o.data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }), this._device.queue.writeBuffer(
        this._uniformBuffers[o.label],
        0,
        o.data
      );
    });
  }
  setCSCode({ csDefine: t, csMain: e }) {
    this._csDefine = t, this._csMain = e, this._needsUpdatePipeline = !0;
  }
  setSize(t, e) {
    t = Math.ceil(t), e = Math.ceil(e);
    const n = t !== this._width || e !== this._height;
    this._width = t, this._height = e, n && (this._needsResizeBuffer = !0, this._needsUpdatePipeline = !0);
  }
  setExecuteSize(t, e) {
    t = Math.ceil(t), e = Math.ceil(e), this._execWidth = t, this._execHeight = e;
  }
  setOutputParams(t) {
    this.autoUpdateOutputBuffer && this._updateOutputBuffers(t), this._needsUpdatePipeline = !0;
  }
  setOutputBuffers(t) {
    this._outputBuffers = Object.keys(t).reduce((e, n) => (e[n] = {
      buffer: t[n],
      params: { channels: 4 }
    }, e), {});
  }
  setUniform(t, e) {
    const n = this._uniformBuffers[t];
    this._device.queue.writeBuffer(n, 0, e);
  }
  getOutput(t) {
    return this._needsResizeBuffer && this.autoUpdateOutputBuffer && (this._resizeOutputBuffers(), this._needsResizeBuffer = !1), this._outputBuffers[t].buffer;
  }
  dispose(t = !0) {
    Object.keys(this._uniformBuffers).forEach((e) => {
      this._uniformBuffers[e].destroy();
    }), t && Object.keys(this._outputBuffers).forEach((e) => {
      this._outputBuffers[e].buffer.destroy();
    });
  }
  _createBuffer(t) {
    const e = this._width * this._height * 4 * 4;
    return this._device.createBuffer({
      label: this._label,
      // webgpu needs buffer at least 80 bytes.
      size: Math.max(e, 80),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
  }
  _resizeOutputBuffers() {
    const t = this._outputBuffers;
    for (const e in t) {
      const { buffer: n, params: o } = t[e];
      n.destroy(), t[e].buffer = this._createBuffer(o);
    }
  }
  _updateOutputBuffers(t) {
    var n, o;
    const e = this._outputBuffers;
    for (const r in t) {
      const s = t[r];
      if (!ti(
        s,
        ((n = e[r]) == null ? void 0 : n.params) || {}
      )) {
        (o = e[r]) == null || o.buffer.destroy();
        const a = this._createBuffer(s);
        e[r] = {
          buffer: a,
          params: s
        };
      }
    }
  }
  _updatePipeline(t, e) {
    if (!this._needsUpdatePipeline)
      return;
    this._needsUpdatePipeline = !1;
    const n = this._device, o = this._getFullCs(t, e);
    o !== this._csCode && (this._csCode = o, this._pipeline = n.createComputePipeline({
      label: this._label,
      layout: "auto",
      compute: {
        module: n.createShaderModule({
          label: this._label,
          code: o
        }),
        entryPoint: "main"
      }
    }), this._updateBindGroups());
  }
  _getFullCs(t, e) {
    const n = this._inputs, o = this._uniforms;
    let r = 0;
    const s = this._groupOffsets = {
      inputs: 0,
      uniforms: 0,
      outputs: 0
    };
    return n.length > 0 && r++, o.length > 0 && (s.uniforms = r, r++), s.outputs = r, `
${n.sort().map((u, l) => {
      const p = `@group(${s.inputs}) @binding(${l}) `, c = `in_${u}`;
      return e[u] === "texture" ? `${p} var ${c}: texture_2d<f32>;` : `${p} var<storage, read> ${c}: array<vec${t[u].channels}f>;`;
    }).join(`
`)}
${this._uniforms.map(
      (u, l) => `@group(${s.uniforms}) @binding(${l}) var<uniform> ${u.label}: ${u.type};`
    ).join(`
`)}

${this._outputs.map(
      (u, l) => `@group(${s.outputs}) @binding(${l}) var<storage, read_write> out_${u}: array<vec${this._outputBuffers[u].params.channels}f>;`
    ).join(`
`)}
${this._csDefine ?? ""}
@compute @workgroup_size(${Mt}, ${Mt}, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
${this._csMain}
}
`;
  }
  _updateBindGroups() {
    const t = [], e = this._device, n = this._groupOffsets;
    this._uniforms.length > 0 && (t[n.uniforms] = e.createBindGroup({
      label: this._label,
      layout: this._pipeline.getBindGroupLayout(n.uniforms),
      entries: this._uniforms.map(
        (o, r) => ({
          binding: r,
          resource: {
            buffer: this._uniformBuffers[o.label]
          }
        })
      )
    })), this._bindGroups = t;
  }
  createPass(t, e) {
    this._needsResizeBuffer && this.autoUpdateOutputBuffer && (this._resizeOutputBuffers(), this._needsResizeBuffer = !1);
    const n = this._inputs.reduce((s, a) => (s[a] = e[a].buffer ? "buffer" : "texture", s), {});
    this._updatePipeline(e, n);
    const o = this._groupOffsets;
    this._inputs.length > 0 && (this._bindGroups[o.inputs] = this._device.createBindGroup({
      label: this._label,
      layout: this._pipeline.getBindGroupLayout(o.inputs),
      entries: this._inputs.map((s, a) => ({
        binding: a,
        // TODO
        resource: e[s].buffer ? {
          buffer: e[s].buffer
        } : e[s].texture.createView()
      }))
    })), this._bindGroups[o.outputs] = this._device.createBindGroup({
      label: this._label,
      layout: this._pipeline.getBindGroupLayout(o.outputs),
      entries: this._outputs.map((s, a) => ({
        binding: a,
        resource: {
          buffer: this._outputBuffers[s].buffer
        }
      }))
    });
    const r = t.beginComputePass();
    r.setPipeline(this._pipeline), this._bindGroups.forEach((s, a) => {
      r.setBindGroup(a, s);
    }), r.dispatchWorkgroups(
      Math.ceil((this._execWidth ?? this._width) / Mt),
      Math.ceil((this._execHeight ?? this._height) / Mt),
      1
    ), r.end();
  }
}
const ve = 1412.83765, we = 1.64593172, xe = 0.431384981, be = -0.00294139609, $e = 0.192653254, ke = 0.00626026094, Be = 0.998620152, ln = 15794576e-13, pn = 0.0322087631, fn = 0.00223151711, dn = 0.370974749;
function hn(i) {
  return i <= ln ? i = ve * i : i <= pn ? i = we * Math.pow(i, xe) + be : i = $e * Math.log(i + ke) + Be, i;
}
function ei(i) {
  return i <= fn ? i = i / ve : i <= dn ? i = Math.pow((i - be) / we, 1 / xe) : i = Math.exp((i - Be) / $e) - ke, i;
}
const ni = 65504, gn = hn(ni), _n = 1 / gn, yn = gn;
class ne {
  constructor(t, e, n, o) {
    this.x = t, this.y = e, this.width = n, this.height = o;
  }
}
function ii({
  data: i,
  channels: t
}) {
  let e = 0;
  for (let s = 0; s < i.length; s += t) {
    const a = i[s], u = i[s + 1], l = i[s + 2], p = 0.212671 * a + 0.71516 * u + 0.072169 * l;
    e += Math.log2(p + 1e-4);
  }
  const n = i.length / t, o = e / n;
  return 0.18 / Math.pow(2, o);
}
function ri({
  data: i,
  channels: t,
  inputScale: e
}) {
  const n = new Float32Array(i.length);
  n.set(i);
  for (let o = 0; o < n.length; o += t)
    for (let r = 0; r < 3; r++) {
      let s = n[o + r] * e;
      n[o + r] = hn(s) * _n;
    }
  return n;
}
function oi({
  data: i,
  channels: t,
  inputScale: e
}) {
  const n = new Float32Array(i.length);
  n.set(i);
  const o = 1 / e;
  for (let r = 0; r < n.length; r += t)
    for (let s = 0; s < 3; s++) {
      let a = n[r + s] * yn;
      n[r + s] = ei(a) * o;
    }
  return n;
}
const Ne = `
const a = ${ve};
const b = ${we};
const c = ${xe};
const d = ${be};
const e = ${$e};
const f = ${ke};
const g = ${Be};
const y0 =${ln};
const y1 =${pn};
const x0 =${fn};
const x1 =${dn};

const normScale = ${_n};
const rcpNormScale = ${yn};
`;
class si {
  constructor(t, e) {
    g(this, "_inputPassAux");
    g(this, "_inputPassColor");
    g(this, "_outputPass");
    g(this, "_copyPass");
    g(this, "_isInputTexture");
    this._device = t, this._isHDR = e;
    const n = [
      {
        label: "inputScale",
        type: "f32",
        data: new Float32Array([1])
      },
      {
        label: "inputSize",
        type: "vec2i",
        data: new Int32Array(2)
      },
      {
        label: "outputSize",
        type: "vec2i",
        data: new Int32Array(2)
      },
      {
        label: "inputOffset",
        type: "vec2i",
        data: new Int32Array(2)
      }
    ];
    this._inputPassAux = new zt("inputPassAux", this._device, {
      inputs: ["color", "albedo", "normal"],
      outputs: ["color", "albedo", "normal"],
      uniforms: n,
      csDefine: "",
      csMain: ""
    }), this._inputPassColor = new zt("inputPassColor", this._device, {
      inputs: ["color"],
      outputs: ["color"],
      uniforms: n,
      csDefine: "",
      csMain: ""
    }), this._outputPass = new zt("outputPass", this._device, {
      inputs: ["color", "raw"],
      outputs: ["color"],
      uniforms: [
        {
          label: "inputScale",
          type: "f32",
          data: new Float32Array([1])
        },
        {
          label: "inputSize",
          type: "vec2i",
          data: new Int32Array(2)
        },
        {
          label: "outputSize",
          type: "vec2i",
          data: new Int32Array(2)
        },
        {
          label: "imageSize",
          type: "vec2i",
          data: new Int32Array(2)
        },
        {
          label: "inputOffset",
          type: "vec2i",
          data: new Int32Array(2)
        },
        {
          label: "outputOffset",
          type: "vec2i",
          data: new Int32Array(2)
        }
      ],
      csDefine: "",
      csMain: ""
    }), this._copyPass = new zt("copyPass", this._device, {
      inputs: ["color"],
      outputs: ["color"],
      autoUpdateOutputBuffer: !1,
      uniforms: [
        {
          label: "size",
          type: "vec2i",
          data: new Int32Array(2)
        }
      ],
      csMain: (
        /*wgsl*/
        `
let outIdx = i32(globalId.x + globalId.y * u32(size.x));
out_color[outIdx] = textureLoad(in_color, globalId.xy, 0);
`
      )
    }), this._inputPassAux.setOutputParams({
      color: { channels: 3 },
      albedo: { channels: 3 },
      normal: { channels: 3 }
    }), this._inputPassColor.setOutputParams({
      color: { channels: 3 }
    }), this._outputPass.setOutputParams({
      color: { channels: 4 }
    });
  }
  _updatePasses(t, e = !1) {
    if (this._isInputTexture != null && this._isInputTexture === t)
      return;
    this._isInputTexture = t;
    const n = this._isHDR, o = (
      /* wgsl */
      `
${Ne}
fn PUForward(y: f32) -> f32 {
  if (y <= y0) {
    return a * y;
  } else if (y <= y1) {
    return b * pow(y, c) + d;
  } else {
    return e * log(y + f) + g;
  }
}`
    );
    function r(a) {
      return t ? `textureLoad(in_${a}, globalId.xy + vec2u(inputOffset), 0)` : `in_${a}[inIdx]`;
    }
    const s = (
      /* wgsl */
      `
let x = i32(globalId.x);
let y = i32(globalId.y);
let inIdx = (y + inputOffset.y) * inputSize.x + (x + inputOffset.x);
let col = ${r("color")};

let outIdx = y * outputSize.x + x;

if (${e}) {
  // Denoise the inversed alpha. Or the anti aliased edge will be too dark after denoised
  out_color[outIdx] = vec3f(1.0 - col.a);
}
else if (${n}) {
  out_color[outIdx] = vec3f(PUForward(col.r * inputScale), PUForward(col.g * inputScale), PUForward(col.b * inputScale)) * normScale;
}
else {
  out_color[outIdx] = col.rgb;
}
`
    );
    this._inputPassAux.setCSCode({
      csDefine: o,
      csMain: (
        /* wgsl */
        `
${s}
let alb = ${r("albedo")};
let nor = ${r("normal")};
out_normal[outIdx] = nor.rgb;
out_albedo[outIdx] = alb.rgb;
  `
      )
    }), this._inputPassColor.setCSCode({
      csDefine: o,
      csMain: (
        /* wgsl */
        `
${s}
`
      )
    }), this._outputPass.setCSCode({
      csDefine: (
        /* wgsl */
        `
${Ne}
fn PUInverse(y: f32) -> f32 {
  if (y <= x0) {
    return y / a;
  } else if (y <= x1) {
    return pow((y - d) / b, 1 / c);
  } else {
    return exp((y - g) / e) - f;
  }
}
`
      ),
      csMain: (
        /* wgsl */
        `
let x = i32(globalId.x);
let y = i32(globalId.y);
if (x >= outputSize.x || y >= outputSize.y) {
  return;
}
let inIdx = (y + inputOffset.y) * inputSize.x + x + inputOffset.x;
let outIdx = (y + outputOffset.y) * imageSize.x + x + outputOffset.x;
let col = in_color[inIdx];
let raw = ${t ? "textureLoad(in_raw, globalId.xy + vec2u(outputOffset), 0)" : "in_raw[outIdx]"};

if (${e}) {
  out_color[outIdx] = vec4f(raw.rgb, 1.0 - col.r);
}
else if (${n}) {
  out_color[outIdx] = vec4f(
    vec3f(PUInverse(col.r * rcpNormScale), PUInverse(col.g * rcpNormScale), PUInverse(col.b * rcpNormScale)) / inputScale,
    // Pick the alpha
    raw.a
  );
}
else {
  out_color[outIdx] = vec4f(col.rgb, raw.a);
}
`
      )
    });
  }
  setImageSize(t, e) {
    this._inputPassAux.setUniform("inputSize", new Int32Array([t, e])), this._inputPassColor.setUniform("inputSize", new Int32Array([t, e])), this._outputPass.setUniform("imageSize", new Int32Array([t, e])), this._outputPass.setSize(t, e), this._copyPass.setSize(t, e), this._copyPass.setUniform("size", new Int32Array([t, e]));
  }
  setInputTile(t) {
    const e = new Int32Array([t.width, t.height]);
    [this._inputPassAux, this._inputPassColor].forEach((n) => {
      n.setUniform("inputOffset", new Int32Array([t.x, t.y])), n.setUniform("outputSize", e), n.setSize(e[0], e[1]);
    }), this._outputPass.setUniform("inputSize", e);
  }
  setOutputTile(t, e) {
    const n = this._outputPass, o = new Int32Array([t.width, t.height]), r = t.x - e.x, s = t.y - e.y;
    n.setUniform("outputSize", o), n.setUniform("inputOffset", new Int32Array([r, s])), n.setUniform(
      "outputOffset",
      new Int32Array([t.x, t.y])
    ), n.setExecuteSize(o[0], o[1]);
  }
  forward(t, e, n, o) {
    const r = t instanceof GPUTexture;
    this._updatePasses(r, o);
    const s = this._inputPassAux, a = this._inputPassColor, u = this._device.createCommandEncoder();
    function l(p) {
      return p instanceof GPUTexture ? {
        texture: p,
        channels: 4
      } : {
        buffer: p,
        channels: 4
      };
    }
    return e && n ? s.createPass(u, {
      color: l(t),
      albedo: l(e),
      normal: l(n)
    }) : a.createPass(u, {
      color: l(t)
    }), this._device.queue.submit([u.finish()]), e && n ? {
      color: s.getOutput("color"),
      albedo: s.getOutput("albedo"),
      normal: s.getOutput("normal")
    } : {
      color: a.getOutput("color")
    };
  }
  inverse(t, e) {
    const o = this._device.createCommandEncoder(), r = this._outputPass;
    return r.createPass(o, {
      color: { buffer: t, channels: 4 },
      raw: e instanceof GPUBuffer ? { buffer: e, channels: 4 } : { texture: e, channels: 4 }
    }), this._device.queue.submit([o.finish()]), r.getOutput("color");
  }
  copyInputDataToOutput(t) {
    const e = this._device.createCommandEncoder(), o = this._outputPass.getOutput("color"), r = this._copyPass;
    t instanceof GPUTexture ? (r.setOutputBuffers({
      color: o
    }), r.createPass(e, {
      color: { texture: t, channels: 4 }
    })) : e.copyBufferToBuffer(
      t,
      0,
      o,
      0,
      o.size
    ), this._device.queue.submit([e.finish()]);
  }
  dispose() {
    this._outputPass.dispose(), this._inputPassAux.dispose(), this._inputPassColor.dispose(), this._copyPass.dispose(!1);
  }
}
const ai = 256, ui = 384, ci = 16, li = 128, nt = 16;
function Ct(i, t) {
  return Math.ceil(i / t) * t;
}
function pi(i, t) {
  return Math.floor(i / t) * t;
}
function ie(i, t, e) {
  return Math.min(Math.max(i, t), e);
}
function fi(i) {
  const t = [...i].sort((n, o) => n - o), e = Math.floor(t.length / 2);
  return t.length % 2 ? t[e] : (t[e - 1] + t[e]) / 2;
}
function Me(i, t) {
  return i <= t ? Math.min(Ct(i, nt), t) : t;
}
class di {
  constructor(t, e = !0) {
    g(this, "enabled");
    g(this, "maxTileSize");
    g(this, "minTileSize");
    g(this, "targetTileTimeMs");
    g(this, "_tileSize");
    g(this, "_adjustmentStep");
    const n = typeof e == "object" ? e : {};
    this.enabled = e !== !1, this.maxTileSize = Math.max(
      nt,
      pi(t, nt)
    ), this.minTileSize = ie(
      Ct(n.minTileSize ?? ai, nt),
      nt,
      this.maxTileSize
    ), this.targetTileTimeMs = Math.max(
      1,
      n.targetTileTimeMs ?? ci
    ), this._adjustmentStep = Math.max(
      nt,
      Ct(
        n.adjustmentStep ?? li,
        nt
      )
    ), this._tileSize = this.enabled ? ie(
      Ct(
        n.initialTileSize ?? ui,
        nt
      ),
      this.minTileSize,
      this.maxTileSize
    ) : this.maxTileSize;
  }
  get tileSize() {
    return this._tileSize;
  }
  /** Returns true when the next execution should use a different tile size. */
  observe(t) {
    if (!this.enabled || t.length === 0) return !1;
    const e = t.filter(
      (r) => Number.isFinite(r) && r >= 0
    );
    if (e.length === 0) return !1;
    const n = fi(e);
    let o = this._tileSize;
    return n > this.targetTileTimeMs * 1.25 ? o -= this._adjustmentStep : n < this.targetTileTimeMs * 0.65 && (o += this._adjustmentStep), o = ie(
      Ct(o, nt),
      this.minTileSize,
      this.maxTileSize
    ), o === this._tileSize ? !1 : (this._tileSize = o, !0);
  }
}
async function hi(i) {
  try {
    await i.onSubmittedWorkDone();
  } catch {
  }
}
function w(i, t) {
  return {
    op: "conv2d",
    id: i,
    input: t,
    weight: `${i}.weight`,
    bias: `${i}.bias`,
    activation: "relu",
    padding: "same"
  };
}
function pt(i, t) {
  return {
    op: "maxPool2d",
    id: i,
    input: t,
    size: 2,
    stride: 2,
    padding: "same"
  };
}
function ft(i, t) {
  return {
    op: "upsample2d",
    id: i,
    input: t,
    scale: 2,
    mode: "nearest"
  };
}
function dt(i, t, e) {
  return {
    op: "concat",
    id: i,
    inputs: [t, e],
    axis: "channels"
  };
}
const gi = {
  schemaVersion: 1,
  id: "oidn-unet-small-v1",
  family: "oidn-unet-small",
  input: "input",
  output: "dec_conv0",
  receptiveField: 174,
  nodes: [
    w("enc_conv0", "input"),
    w("enc_conv1", "enc_conv0"),
    pt("pool1", "enc_conv1"),
    w("enc_conv2", "pool1"),
    pt("pool2", "enc_conv2"),
    w("enc_conv3", "pool2"),
    pt("pool3", "enc_conv3"),
    w("enc_conv4", "pool3"),
    pt("pool4", "enc_conv4"),
    w("enc_conv5a", "pool4"),
    w("enc_conv5b", "enc_conv5a"),
    ft("up4", "enc_conv5b"),
    dt("concat4", "up4", "pool3"),
    w("dec_conv4a", "concat4"),
    w("dec_conv4b", "dec_conv4a"),
    ft("up3", "dec_conv4b"),
    dt("concat3", "up3", "pool2"),
    w("dec_conv3a", "concat3"),
    w("dec_conv3b", "dec_conv3a"),
    ft("up2", "dec_conv3b"),
    dt("concat2", "up2", "pool1"),
    w("dec_conv2a", "concat2"),
    w("dec_conv2b", "dec_conv2a"),
    ft("up1", "dec_conv2b"),
    dt("concat1", "up1", "input"),
    w("dec_conv1a", "concat1"),
    w("dec_conv1b", "dec_conv1a"),
    w("dec_conv0", "dec_conv1b")
  ]
}, _i = {
  schemaVersion: 1,
  id: "oidn-unet-large-v1",
  family: "oidn-unet-large",
  input: "input",
  output: "dec_conv1c",
  receptiveField: 202,
  nodes: [
    w("enc_conv1a", "input"),
    w("enc_conv1b", "enc_conv1a"),
    pt("pool1", "enc_conv1b"),
    w("enc_conv2a", "pool1"),
    w("enc_conv2b", "enc_conv2a"),
    pt("pool2", "enc_conv2b"),
    w("enc_conv3a", "pool2"),
    w("enc_conv3b", "enc_conv3a"),
    pt("pool3", "enc_conv3b"),
    w("enc_conv4a", "pool3"),
    w("enc_conv4b", "enc_conv4a"),
    pt("pool4", "enc_conv4b"),
    w("enc_conv5a", "pool4"),
    w("enc_conv5b", "enc_conv5a"),
    ft("up4", "enc_conv5b"),
    dt("concat4", "up4", "pool3"),
    w("dec_conv4a", "concat4"),
    w("dec_conv4b", "dec_conv4a"),
    ft("up3", "dec_conv4b"),
    dt("concat3", "up3", "pool2"),
    w("dec_conv3a", "concat3"),
    w("dec_conv3b", "dec_conv3a"),
    ft("up2", "dec_conv3b"),
    dt("concat2", "up2", "pool1"),
    w("dec_conv2a", "concat2"),
    w("dec_conv2b", "dec_conv2a"),
    ft("up1", "dec_conv2b"),
    dt("concat1", "up1", "input"),
    w("dec_conv1a", "concat1"),
    w("dec_conv1b", "dec_conv1a"),
    w("dec_conv1c", "dec_conv1b")
  ]
}, yi = [
  gi,
  _i
];
function mn(i) {
  const t = /* @__PURE__ */ new Set();
  for (const e of i.nodes)
    e.op === "conv2d" && (t.add(e.weight), t.add(e.bias));
  return t;
}
function ze(i) {
  return i.desc.getByteSize();
}
function vn(i) {
  return [...i].sort().join(", ");
}
function wn(i, t = yi) {
  const e = t.filter((n) => {
    const o = mn(n);
    return [...o].some((r) => !i.has(r)) ? !1 : n.allowAdditionalTensors === !0 || [...i.keys()].every((r) => o.has(r));
  });
  if (e.length === 1) return e[0];
  throw e.length > 1 ? new Error(
    `Ambiguous OIDN model topology: ${e.map((n) => n.id).join(", ")}`
  ) : new Error(
    `Unsupported OIDN model topology. TZA tensors: ${vn(i.keys())}`
  );
}
function De(i, t, e) {
  const n = i.get(t);
  if (!n)
    throw new Error(`Model ${e} is missing tensor ${t}`);
  if (n.data.byteLength !== ze(n))
    throw new Error(
      `Tensor ${t} has ${n.data.byteLength} bytes, expected ${ze(n)}`
    );
  return n;
}
function mi(i, t = wn(i)) {
  if (t.schemaVersion !== 1)
    throw new Error(`Unsupported model descriptor schema ${t.schemaVersion}`);
  const e = mn(t);
  if (!t.allowAdditionalTensors) {
    const c = [...i.keys()].filter((f) => !e.has(f));
    if (c.length > 0)
      throw new Error(
        `Model ${t.id} has unexpected tensors: ${vn(c)}`
      );
  }
  const n = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Set([t.input]);
  let a, u;
  const l = (c, f) => {
    const d = n.get(c);
    if (d === void 0)
      throw new Error(
        `Model ${t.id} node ${f} reads unknown or forward value ${c}`
      );
    return d;
  };
  for (const c of t.nodes) {
    if (s.has(c.id))
      throw new Error(`Model ${t.id} produces duplicate value ${c.id}`);
    if (c.op === "conv2d") {
      const f = De(i, c.weight, t.id), d = De(i, c.bias, t.id), h = f.desc.dims;
      if (f.desc.layout !== "oihw" || h.length !== 4)
        throw new Error(`Tensor ${c.weight} must use OIHW layout`);
      if (h[2] !== 3 || h[3] !== 3)
        throw new Error(`Tensor ${c.weight} must use a 3x3 kernel`);
      if (d.desc.layout !== "x" || d.desc.dims.length !== 1)
        throw new Error(`Tensor ${c.bias} must be a one-dimensional bias`);
      if (d.desc.dims[0] !== h[0])
        throw new Error(
          `Tensor ${c.bias} has ${d.desc.dims[0]} channels, expected ${h[0]}`
        );
      if (f.desc.dataType !== d.desc.dataType)
        throw new Error(`Weight and bias dtype differ for ${c.id}`);
      if (u && u !== f.desc.dataType)
        throw new Error(`Mixed tensor dtypes are not supported by model ${t.id}`);
      u = f.desc.dataType, c.input === t.input && a === void 0 && (a = h[1], n.set(t.input, a));
      const _ = l(c.input, c.id);
      if (_ !== h[1])
        throw new Error(
          `Tensor ${c.weight} expects ${h[1]} input channels, but ${c.input} provides ${_}`
        );
      n.set(c.id, h[0]), o.set(c.id, {
        weight: f,
        bias: d,
        inputChannels: h[1],
        outputChannels: h[0],
        kernelHeight: h[2],
        kernelWidth: h[3]
      }), r.set(c.id, {
        inputChannels: h[1],
        outputChannels: h[0]
      });
    } else if (c.op === "concat") {
      if (c.inputs.length < 2)
        throw new Error(`Concat ${c.id} requires at least two inputs`);
      const f = c.inputs.reduce(
        (d, h) => d + l(h, c.id),
        0
      );
      n.set(c.id, f);
    } else
      n.set(c.id, l(c.input, c.id));
    s.add(c.id);
  }
  if (a === void 0 || u === void 0)
    throw new Error(`Model ${t.id} has no convolution reading its input`);
  const p = n.get(t.output);
  if (p === void 0)
    throw new Error(`Model ${t.id} output ${t.output} is not produced`);
  if (p !== 3)
    throw new Error(`Model ${t.id} must produce 3 channels, got ${p}`);
  return {
    spec: t,
    inputChannels: a,
    outputChannels: p,
    tensorDataType: u,
    channelsByValue: n,
    convChannels: r,
    convTensors: o
  };
}
const vi = "This is not an object", wi = "This is not a Float16Array object", We = "This constructor is not a subclass of Float16Array", xn = "The constructor property value is not an object", xi = "Species constructor didn't return TypedArray object", bi = "Derived constructor created TypedArray object which was too small length", Et = "Attempting to access detached ArrayBuffer", le = "Cannot convert undefined or null to object", pe = "Cannot mix BigInt and other types, use explicit conversions", Le = "@@iterator property is not callable", Re = "Reduce of empty array with no initial value", $i = "The comparison function must be either a function or undefined", re = "Offset is out of bounds";
function T(i) {
  return (t, ...e) => K(i, t, e);
}
function kt(i, t) {
  return T(
    xt(
      i,
      t
    ).get
  );
}
const {
  apply: K,
  construct: St,
  defineProperty: Ge,
  get: oe,
  getOwnPropertyDescriptor: xt,
  getPrototypeOf: Ot,
  has: fe,
  ownKeys: bn,
  set: Ye,
  setPrototypeOf: $n
} = Reflect, ki = Proxy, {
  EPSILON: Bi,
  MAX_SAFE_INTEGER: Fe,
  isFinite: kn,
  isNaN: bt
} = Number, {
  iterator: rt,
  species: Pi,
  toStringTag: Pe,
  for: Ii
} = Symbol, $t = Object, {
  create: qt,
  defineProperty: Ut,
  freeze: Ti,
  is: Xe
} = $t, de = $t.prototype, Ci = (
  /** @type {any} */
  de.__lookupGetter__ ? T(
    /** @type {any} */
    de.__lookupGetter__
  ) : (i, t) => {
    if (i == null)
      throw C(
        le
      );
    let e = $t(i);
    do {
      const n = xt(e, t);
      if (n !== void 0)
        return ct(n, "get") ? n.get : void 0;
    } while ((e = Ot(e)) !== null);
  }
), ct = (
  /** @type {any} */
  $t.hasOwn || T(de.hasOwnProperty)
), Bn = Array, Pn = Bn.isArray, jt = Bn.prototype, Si = T(jt.join), Ei = T(jt.push), Ai = T(
  jt.toLocaleString
), Ie = jt[rt], Oi = T(Ie), {
  abs: Ui,
  trunc: In
} = Math, Jt = ArrayBuffer, Ni = Jt.isView, Tn = Jt.prototype, Mi = T(Tn.slice), zi = kt(Tn, "byteLength"), he = typeof SharedArrayBuffer < "u" ? SharedArrayBuffer : null, Di = he && kt(he.prototype, "byteLength"), Te = Ot(Uint8Array), Wi = Te.from, D = Te.prototype, Li = D[rt], Ri = T(D.keys), Gi = T(
  D.values
), Yi = T(
  D.entries
), Fi = T(D.set), He = T(
  D.reverse
), Xi = T(D.fill), Hi = T(
  D.copyWithin
), Ve = T(D.sort), It = T(D.slice), Vi = T(
  D.subarray
), z = kt(
  D,
  "buffer"
), _t = kt(
  D,
  "byteOffset"
), k = kt(
  D,
  "length"
), Cn = kt(
  D,
  Pe
), Ki = Uint8Array, j = Uint16Array, Ke = (...i) => K(Wi, j, i), Ce = Uint32Array, qi = Float32Array, mt = Ot([][rt]()), Qt = T(mt.next), ji = T(function* () {
}().next), Ji = Ot(mt), C = TypeError, se = RangeError, Sn = WeakSet, En = Sn.prototype, Qi = T(En.add), Zi = T(En.has), Zt = WeakMap, Se = Zt.prototype, Yt = T(Se.get), tr = T(Se.has), Ee = T(Se.set), An = new Zt(), er = qt(null, {
  next: {
    value: function() {
      const t = Yt(An, this);
      return Qt(t);
    }
  },
  [rt]: {
    value: function() {
      return this;
    }
  }
});
function Dt(i) {
  if (i[rt] === Ie && mt.next === Qt)
    return i;
  const t = qt(er);
  return Ee(An, t, Oi(i)), t;
}
const On = new Zt(), Un = qt(Ji, {
  next: {
    value: function() {
      const t = Yt(On, this);
      return ji(t);
    },
    writable: !0,
    configurable: !0
  }
});
for (const i of bn(mt))
  i !== "next" && Ut(Un, i, xt(mt, i));
function qe(i) {
  const t = qt(Un);
  return Ee(On, t, i), t;
}
function Ft(i) {
  return i !== null && typeof i == "object" || typeof i == "function";
}
function je(i) {
  return i !== null && typeof i == "object";
}
function Xt(i) {
  return Cn(i) !== void 0;
}
function ge(i) {
  const t = Cn(i);
  return t === "BigInt64Array" || t === "BigUint64Array";
}
function nr(i) {
  try {
    return Pn(i) ? !1 : (zi(
      /** @type {any} */
      i
    ), !0);
  } catch {
    return !1;
  }
}
function Nn(i) {
  if (he === null)
    return !1;
  try {
    return Di(
      /** @type {any} */
      i
    ), !0;
  } catch {
    return !1;
  }
}
function ir(i) {
  return nr(i) || Nn(i);
}
function Je(i) {
  return Pn(i) ? i[rt] === Ie && mt.next === Qt : !1;
}
function rr(i) {
  return Xt(i) ? i[rt] === Li && mt.next === Qt : !1;
}
function Wt(i) {
  if (typeof i != "string")
    return !1;
  const t = +i;
  return i !== t + "" || !kn(t) ? !1 : t === In(t);
}
const Ht = Ii("__Float16Array__");
function or(i) {
  if (!je(i))
    return !1;
  const t = Ot(i);
  if (!je(t))
    return !1;
  const e = t.constructor;
  if (e === void 0)
    return !1;
  if (!Ft(e))
    throw C(xn);
  return fe(e, Ht);
}
const _e = 1 / Bi;
function sr(i) {
  return i + _e - _e;
}
const Mn = 6103515625e-14, ar = 65504, zn = 9765625e-10, Qe = zn * Mn, ur = zn * _e;
function cr(i) {
  const t = +i;
  if (!kn(t) || t === 0)
    return t;
  const e = t > 0 ? 1 : -1, n = Ui(t);
  if (n < Mn)
    return e * sr(n / Qe) * Qe;
  const o = (1 + ur) * n, r = o - (o - n);
  return r > ar || bt(r) ? e * (1 / 0) : e * r;
}
const Dn = new Jt(4), Wn = new qi(Dn), Ln = new Ce(Dn), tt = new j(512), et = new Ki(512);
for (let i = 0; i < 256; ++i) {
  const t = i - 127;
  t < -24 ? (tt[i] = 0, tt[i | 256] = 32768, et[i] = 24, et[i | 256] = 24) : t < -14 ? (tt[i] = 1024 >> -t - 14, tt[i | 256] = 1024 >> -t - 14 | 32768, et[i] = -t - 1, et[i | 256] = -t - 1) : t <= 15 ? (tt[i] = t + 15 << 10, tt[i | 256] = t + 15 << 10 | 32768, et[i] = 13, et[i | 256] = 13) : t < 128 ? (tt[i] = 31744, tt[i | 256] = 64512, et[i] = 24, et[i | 256] = 24) : (tt[i] = 31744, tt[i | 256] = 64512, et[i] = 13, et[i | 256] = 13);
}
function it(i) {
  Wn[0] = cr(i);
  const t = Ln[0], e = t >> 23 & 511;
  return tt[e] + ((t & 8388607) >> et[e]);
}
const Ae = new Ce(2048);
for (let i = 1; i < 1024; ++i) {
  let t = i << 13, e = 0;
  for (; !(t & 8388608); )
    t <<= 1, e -= 8388608;
  t &= -8388609, e += 947912704, Ae[i] = t | e;
}
for (let i = 1024; i < 2048; ++i)
  Ae[i] = 939524096 + (i - 1024 << 13);
const Bt = new Ce(64);
for (let i = 1; i < 31; ++i)
  Bt[i] = i << 23;
Bt[31] = 1199570944;
Bt[32] = 2147483648;
for (let i = 33; i < 63; ++i)
  Bt[i] = 2147483648 + (i - 32 << 23);
Bt[63] = 3347054592;
const Rn = new j(64);
for (let i = 1; i < 64; ++i)
  i !== 32 && (Rn[i] = 1024);
function P(i) {
  const t = i >> 10;
  return Ln[0] = Ae[Rn[t] + (i & 1023)] + Bt[t], Wn[0];
}
function ut(i) {
  const t = +i;
  return bt(t) || t === 0 ? 0 : In(t);
}
function ae(i) {
  const t = ut(i);
  return t < 0 ? 0 : t < Fe ? t : Fe;
}
function Lt(i, t) {
  if (!Ft(i))
    throw C(vi);
  const e = i.constructor;
  if (e === void 0)
    return t;
  if (!Ft(e))
    throw C(xn);
  const n = e[Pi];
  return n ?? t;
}
function At(i) {
  if (Nn(i))
    return !1;
  try {
    return Mi(i, 0, 0), !1;
  } catch {
  }
  return !0;
}
function Ze(i, t) {
  const e = bt(i), n = bt(t);
  if (e && n)
    return 0;
  if (e)
    return 1;
  if (n || i < t)
    return -1;
  if (i > t)
    return 1;
  if (i === 0 && t === 0) {
    const o = Xe(i, 0), r = Xe(t, 0);
    if (!o && r)
      return -1;
    if (o && !r)
      return 1;
  }
  return 0;
}
const Oe = 2, Vt = new Zt();
function wt(i) {
  return tr(Vt, i) || !Ni(i) && or(i);
}
function $(i) {
  if (!wt(i))
    throw C(wi);
}
function Rt(i, t) {
  const e = wt(i), n = Xt(i);
  if (!e && !n)
    throw C(xi);
  if (typeof t == "number") {
    let o;
    if (e) {
      const r = v(i);
      o = k(r);
    } else
      o = k(i);
    if (o < t)
      throw C(
        bi
      );
  }
  if (ge(i))
    throw C(pe);
}
function v(i) {
  const t = Yt(Vt, i);
  if (t !== void 0) {
    const o = z(t);
    if (At(o))
      throw C(Et);
    return t;
  }
  const e = (
    /** @type {any} */
    i.buffer
  );
  if (At(e))
    throw C(Et);
  const n = St(I, [
    e,
    /** @type {any} */
    i.byteOffset,
    /** @type {any} */
    i.length
  ], i.constructor);
  return Yt(Vt, n);
}
function tn(i) {
  const t = k(i), e = [];
  for (let n = 0; n < t; ++n)
    e[n] = P(i[n]);
  return e;
}
const Gn = new Sn();
for (const i of bn(D)) {
  if (i === Pe)
    continue;
  const t = xt(D, i);
  ct(t, "get") && typeof t.get == "function" && Qi(Gn, t.get);
}
const lr = Ti(
  /** @type {ProxyHandler<Float16BitsArray>} */
  {
    get(i, t, e) {
      return Wt(t) && ct(i, t) ? P(oe(i, t)) : Zi(Gn, Ci(i, t)) ? oe(i, t) : oe(i, t, e);
    },
    set(i, t, e, n) {
      return Wt(t) && ct(i, t) ? Ye(i, t, it(e)) : Ye(i, t, e, n);
    },
    getOwnPropertyDescriptor(i, t) {
      if (Wt(t) && ct(i, t)) {
        const e = xt(i, t);
        return e.value = P(e.value), e;
      }
      return xt(i, t);
    },
    defineProperty(i, t, e) {
      return Wt(t) && ct(i, t) && ct(e, "value") && (e.value = it(e.value)), Ge(i, t, e);
    }
  }
);
class I {
  /** @see https://tc39.es/ecma262/#sec-typedarray */
  constructor(t, e, n) {
    let o;
    if (wt(t))
      o = St(j, [v(t)], new.target);
    else if (Ft(t) && !ir(t)) {
      let s, a;
      if (Xt(t)) {
        s = t, a = k(t);
        const u = z(t);
        if (At(u))
          throw C(Et);
        if (ge(t))
          throw C(pe);
        const l = new Jt(
          a * Oe
        );
        o = St(j, [l], new.target);
      } else {
        const u = t[rt];
        if (u != null && typeof u != "function")
          throw C(Le);
        u != null ? Je(t) ? (s = t, a = t.length) : (s = [.../** @type {Iterable<unknown>} */
        t], a = s.length) : (s = /** @type {ArrayLike<unknown>} */
        t, a = ae(s.length)), o = St(j, [a], new.target);
      }
      for (let u = 0; u < a; ++u)
        o[u] = it(s[u]);
    } else
      o = St(j, arguments, new.target);
    const r = (
      /** @type {any} */
      new ki(o, lr)
    );
    return Ee(Vt, r, o), r;
  }
  /**
   * limitation: `Object.getOwnPropertyNames(Float16Array)` or `Reflect.ownKeys(Float16Array)` include this key
   * @see https://tc39.es/ecma262/#sec-%typedarray%.from
   */
  static from(t, ...e) {
    const n = this;
    if (!fe(n, Ht))
      throw C(
        We
      );
    if (n === I) {
      if (wt(t) && e.length === 0) {
        const p = v(t), c = new j(
          z(p),
          _t(p),
          k(p)
        );
        return new I(
          z(It(c))
        );
      }
      if (e.length === 0)
        return new I(
          z(
            Ke(t, it)
          )
        );
      const u = e[0], l = e[1];
      return new I(
        z(
          Ke(t, function(p, ...c) {
            return it(
              K(u, this, [p, ...Dt(c)])
            );
          }, l)
        )
      );
    }
    let o, r;
    const s = t[rt];
    if (s != null && typeof s != "function")
      throw C(Le);
    if (s != null)
      Je(t) ? (o = t, r = t.length) : rr(t) ? (o = t, r = k(t)) : (o = [...t], r = o.length);
    else {
      if (t == null)
        throw C(
          le
        );
      o = $t(t), r = ae(o.length);
    }
    const a = new n(r);
    if (e.length === 0)
      for (let u = 0; u < r; ++u)
        a[u] = /** @type {number} */
        o[u];
    else {
      const u = e[0], l = e[1];
      for (let p = 0; p < r; ++p)
        a[p] = K(u, l, [o[p], p]);
    }
    return a;
  }
  /**
   * limitation: `Object.getOwnPropertyNames(Float16Array)` or `Reflect.ownKeys(Float16Array)` include this key
   * @see https://tc39.es/ecma262/#sec-%typedarray%.of
   */
  static of(...t) {
    const e = this;
    if (!fe(e, Ht))
      throw C(
        We
      );
    const n = t.length;
    if (e === I) {
      const r = new I(n), s = v(r);
      for (let a = 0; a < n; ++a)
        s[a] = it(t[a]);
      return r;
    }
    const o = new e(n);
    for (let r = 0; r < n; ++r)
      o[r] = t[r];
    return o;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.keys */
  keys() {
    $(this);
    const t = v(this);
    return Ri(t);
  }
  /**
   * limitation: returns a object whose prototype is not `%ArrayIteratorPrototype%`
   * @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.values
   */
  values() {
    $(this);
    const t = v(this);
    return qe(function* () {
      for (const e of Gi(t))
        yield P(e);
    }());
  }
  /**
   * limitation: returns a object whose prototype is not `%ArrayIteratorPrototype%`
   * @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.entries
   */
  entries() {
    $(this);
    const t = v(this);
    return qe(function* () {
      for (const [e, n] of Yi(t))
        yield (
          /** @type {[number, number]} */
          [e, P(n)]
        );
    }());
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.at */
  at(t) {
    $(this);
    const e = v(this), n = k(e), o = ut(t), r = o >= 0 ? o : n + o;
    if (!(r < 0 || r >= n))
      return P(e[r]);
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.with */
  with(t, e) {
    $(this);
    const n = v(this), o = k(n), r = ut(t), s = r >= 0 ? r : o + r, a = +e;
    if (s < 0 || s >= o)
      throw se(re);
    const u = new j(
      z(n),
      _t(n),
      k(n)
    ), l = new I(
      z(
        It(u)
      )
    ), p = v(l);
    return p[s] = it(a), l;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.map */
  map(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0], s = Lt(n, I);
    if (s === I) {
      const u = new I(o), l = v(u);
      for (let p = 0; p < o; ++p) {
        const c = P(n[p]);
        l[p] = it(
          K(t, r, [c, p, this])
        );
      }
      return u;
    }
    const a = new s(o);
    Rt(a, o);
    for (let u = 0; u < o; ++u) {
      const l = P(n[u]);
      a[u] = K(t, r, [l, u, this]);
    }
    return (
      /** @type {any} */
      a
    );
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.filter */
  filter(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0], s = [];
    for (let l = 0; l < o; ++l) {
      const p = P(n[l]);
      K(t, r, [p, l, this]) && Ei(s, p);
    }
    const a = Lt(n, I), u = new a(s);
    return Rt(u), /** @type {any} */
    u;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduce */
  reduce(t, ...e) {
    $(this);
    const n = v(this), o = k(n);
    if (o === 0 && e.length === 0)
      throw C(Re);
    let r, s;
    e.length === 0 ? (r = P(n[0]), s = 1) : (r = e[0], s = 0);
    for (let a = s; a < o; ++a)
      r = t(
        r,
        P(n[a]),
        a,
        this
      );
    return r;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduceright */
  reduceRight(t, ...e) {
    $(this);
    const n = v(this), o = k(n);
    if (o === 0 && e.length === 0)
      throw C(Re);
    let r, s;
    e.length === 0 ? (r = P(n[o - 1]), s = o - 2) : (r = e[0], s = o - 1);
    for (let a = s; a >= 0; --a)
      r = t(
        r,
        P(n[a]),
        a,
        this
      );
    return r;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.foreach */
  forEach(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = 0; s < o; ++s)
      K(t, r, [
        P(n[s]),
        s,
        this
      ]);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.find */
  find(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = 0; s < o; ++s) {
      const a = P(n[s]);
      if (K(t, r, [a, s, this]))
        return a;
    }
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.findindex */
  findIndex(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = 0; s < o; ++s) {
      const a = P(n[s]);
      if (K(t, r, [a, s, this]))
        return s;
    }
    return -1;
  }
  /** @see https://tc39.es/proposal-array-find-from-last/index.html#sec-%typedarray%.prototype.findlast */
  findLast(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = o - 1; s >= 0; --s) {
      const a = P(n[s]);
      if (K(t, r, [a, s, this]))
        return a;
    }
  }
  /** @see https://tc39.es/proposal-array-find-from-last/index.html#sec-%typedarray%.prototype.findlastindex */
  findLastIndex(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = o - 1; s >= 0; --s) {
      const a = P(n[s]);
      if (K(t, r, [a, s, this]))
        return s;
    }
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.every */
  every(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = 0; s < o; ++s)
      if (!K(t, r, [
        P(n[s]),
        s,
        this
      ]))
        return !1;
    return !0;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.some */
  some(t, ...e) {
    $(this);
    const n = v(this), o = k(n), r = e[0];
    for (let s = 0; s < o; ++s)
      if (K(t, r, [
        P(n[s]),
        s,
        this
      ]))
        return !0;
    return !1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.set */
  set(t, ...e) {
    $(this);
    const n = v(this), o = ut(e[0]);
    if (o < 0)
      throw se(re);
    if (t == null)
      throw C(
        le
      );
    if (ge(t))
      throw C(
        pe
      );
    if (wt(t))
      return Fi(
        v(this),
        v(t),
        o
      );
    if (Xt(t)) {
      const u = z(t);
      if (At(u))
        throw C(Et);
    }
    const r = k(n), s = $t(t), a = ae(s.length);
    if (o === 1 / 0 || a + o > r)
      throw se(re);
    for (let u = 0; u < a; ++u)
      n[u + o] = it(s[u]);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reverse */
  reverse() {
    $(this);
    const t = v(this);
    return He(t), this;
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.toReversed */
  toReversed() {
    $(this);
    const t = v(this), e = new j(
      z(t),
      _t(t),
      k(t)
    ), n = new I(
      z(
        It(e)
      )
    ), o = v(n);
    return He(o), n;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.fill */
  fill(t, ...e) {
    $(this);
    const n = v(this);
    return Xi(
      n,
      it(t),
      ...Dt(e)
    ), this;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.copywithin */
  copyWithin(t, e, ...n) {
    $(this);
    const o = v(this);
    return Hi(o, t, e, ...Dt(n)), this;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.sort */
  sort(t) {
    $(this);
    const e = v(this), n = t !== void 0 ? t : Ze;
    return Ve(e, (o, r) => n(P(o), P(r))), this;
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.toSorted */
  toSorted(t) {
    $(this);
    const e = v(this);
    if (t !== void 0 && typeof t != "function")
      throw new C($i);
    const n = t !== void 0 ? t : Ze, o = new j(
      z(e),
      _t(e),
      k(e)
    ), r = new I(
      z(
        It(o)
      )
    ), s = v(r);
    return Ve(s, (a, u) => n(P(a), P(u))), r;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.slice */
  slice(t, e) {
    $(this);
    const n = v(this), o = Lt(n, I);
    if (o === I) {
      const h = new j(
        z(n),
        _t(n),
        k(n)
      );
      return new I(
        z(
          It(h, t, e)
        )
      );
    }
    const r = k(n), s = ut(t), a = e === void 0 ? r : ut(e);
    let u;
    s === -1 / 0 ? u = 0 : s < 0 ? u = r + s > 0 ? r + s : 0 : u = r < s ? r : s;
    let l;
    a === -1 / 0 ? l = 0 : a < 0 ? l = r + a > 0 ? r + a : 0 : l = r < a ? r : a;
    const p = l - u > 0 ? l - u : 0, c = new o(p);
    if (Rt(c, p), p === 0)
      return c;
    const f = z(n);
    if (At(f))
      throw C(Et);
    let d = 0;
    for (; u < l; )
      c[d] = P(n[u]), ++u, ++d;
    return (
      /** @type {any} */
      c
    );
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.subarray */
  subarray(t, e) {
    $(this);
    const n = v(this), o = Lt(n, I), r = new j(
      z(n),
      _t(n),
      k(n)
    ), s = Vi(r, t, e), a = new o(
      z(s),
      _t(s),
      k(s)
    );
    return Rt(a), /** @type {any} */
    a;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.indexof */
  indexOf(t, ...e) {
    $(this);
    const n = v(this), o = k(n);
    let r = ut(e[0]);
    if (r === 1 / 0)
      return -1;
    r < 0 && (r += o, r < 0 && (r = 0));
    for (let s = r; s < o; ++s)
      if (ct(n, s) && P(n[s]) === t)
        return s;
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.lastindexof */
  lastIndexOf(t, ...e) {
    $(this);
    const n = v(this), o = k(n);
    let r = e.length >= 1 ? ut(e[0]) : o - 1;
    if (r === -1 / 0)
      return -1;
    r >= 0 ? r = r < o - 1 ? r : o - 1 : r += o;
    for (let s = r; s >= 0; --s)
      if (ct(n, s) && P(n[s]) === t)
        return s;
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.includes */
  includes(t, ...e) {
    $(this);
    const n = v(this), o = k(n);
    let r = ut(e[0]);
    if (r === 1 / 0)
      return !1;
    r < 0 && (r += o, r < 0 && (r = 0));
    const s = bt(t);
    for (let a = r; a < o; ++a) {
      const u = P(n[a]);
      if (s && bt(u) || u === t)
        return !0;
    }
    return !1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.join */
  join(t) {
    $(this);
    const e = v(this), n = tn(e);
    return Si(n, t);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.tolocalestring */
  toLocaleString(...t) {
    $(this);
    const e = v(this), n = tn(e);
    return Ai(n, ...Dt(t));
  }
  /** @see https://tc39.es/ecma262/#sec-get-%typedarray%.prototype-@@tostringtag */
  get [Pe]() {
    if (wt(this))
      return (
        /** @type {any} */
        "Float16Array"
      );
  }
}
Ut(I, "BYTES_PER_ELEMENT", {
  value: Oe
});
Ut(I, Ht, {});
$n(I, Te);
const Kt = I.prototype;
Ut(Kt, "BYTES_PER_ELEMENT", {
  value: Oe
});
Ut(Kt, rt, {
  value: Kt.values,
  writable: !0,
  configurable: !0
});
$n(Kt, D);
function pr(i) {
  return i.op === "concat" ? i.inputs : [i.input];
}
function fr(i) {
  const t = /* @__PURE__ */ new Map();
  for (const e of i.nodes)
    for (const n of pr(e)) {
      const o = t.get(n) ?? [];
      o.push(e), t.set(n, o);
    }
  return t;
}
function ue(i, t, e) {
  const n = i.get(t);
  if (!((n == null ? void 0 : n.length) !== 1 || n[0].op !== e))
    return n[0];
}
function ye(i, t = {}) {
  const e = i.spec, n = fr(e), o = new Map(e.nodes.map((p) => [p.id, p])), r = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Map();
  let a = 0, u = 0;
  if (t.fuseConvPool !== !1)
    for (const p of e.nodes) {
      if (p.op !== "conv2d" || p.activation !== "relu") continue;
      const c = ue(n, p.id, "maxPool2d");
      !c || c.size !== 2 || c.stride !== 2 || (r.add(p.id), s.set(c.id, {
        op: "fusedConvReluMaxPool2d",
        id: c.id,
        input: p.input,
        conv: p,
        pool: c
      }), a++);
    }
  if (t.fuseUpsampleConcatConv !== !1)
    for (const p of e.nodes) {
      if (p.op !== "conv2d") continue;
      const c = o.get(p.input);
      if ((c == null ? void 0 : c.op) !== "concat" || c.inputs.length !== 2 || ue(n, c.id, "conv2d") !== p) continue;
      const f = i.channelsByValue.get(c.inputs[0]);
      if (f === void 0 || f % 4 !== 0)
        continue;
      const d = c.inputs.map((_) => {
        const y = o.get(_);
        return (y == null ? void 0 : y.op) === "upsample2d" && y.scale === 2 && y.mode === "nearest" && ue(n, y.id, "concat") === c ? { value: y.input, upsample: y } : { value: _ };
      });
      if (d.filter((_) => _.upsample).length === 1) {
        r.add(c.id);
        for (const _ of c.inputs) {
          const y = o.get(_);
          (y == null ? void 0 : y.op) === "upsample2d" && r.add(y.id);
        }
        s.set(p.id, {
          op: "fusedUpsampleConcatConv2d",
          id: p.id,
          inputs: d,
          conv: p
        }), u++;
      }
    }
  const l = [];
  for (const p of e.nodes) {
    const c = s.get(p.id);
    c ? l.push(c) : r.has(p.id) || l.push(p);
  }
  return {
    spec: e,
    nodes: l,
    fusions: { convPool: a, upsampleConcatConv: u }
  };
}
function dr(i) {
  return i.op === "concat" ? i.inputs : i.op === "fusedUpsampleConcatConv2d" ? i.inputs.map((t) => t.value) : [i.input];
}
function en(i, t) {
  return i.width === t.width && i.height === t.height;
}
function hr(i, t, e, n) {
  if (!Number.isInteger(t) || t <= 0 || !Number.isInteger(e) || e <= 0)
    throw new Error(`Invalid model input size ${t}x${e}`);
  const o = ye(i, n), r = { width: t, height: e, channels: i.inputChannels }, s = /* @__PURE__ */ new Map([
    [i.spec.input, r]
  ]), a = [], u = (c, f) => {
    const d = s.get(c);
    if (!d) throw new Error(`Planned node ${f} reads missing value ${c}`);
    return d;
  };
  for (const c of o.nodes) {
    let f;
    if (c.op === "conv2d") {
      const d = u(c.input, c.id);
      f = {
        width: d.width,
        height: d.height,
        channels: i.convChannels.get(c.id).outputChannels
      };
    } else if (c.op === "maxPool2d") {
      const d = u(c.input, c.id);
      f = {
        width: Math.ceil(d.width / 2),
        height: Math.ceil(d.height / 2),
        channels: d.channels
      };
    } else if (c.op === "upsample2d") {
      const d = u(c.input, c.id);
      f = {
        width: d.width * 2,
        height: d.height * 2,
        channels: d.channels
      };
    } else if (c.op === "concat") {
      const d = c.inputs.map((h) => u(h, c.id));
      if (d.some((h) => !en(h, d[0])))
        throw new Error(`Concat ${c.id} has mismatched spatial shapes`);
      f = {
        width: d[0].width,
        height: d[0].height,
        channels: d.reduce((h, _) => h + _.channels, 0)
      };
    } else if (c.op === "fusedConvReluMaxPool2d") {
      const d = u(c.input, c.id);
      f = {
        width: Math.ceil(d.width / 2),
        height: Math.ceil(d.height / 2),
        channels: i.convChannels.get(c.conv.id).outputChannels
      };
    } else {
      const d = c.inputs.map((h) => {
        const _ = u(h.value, c.id);
        return h.upsample ? { ..._, width: _.width * 2, height: _.height * 2 } : _;
      });
      if (d.some((h) => !en(h, d[0])))
        throw new Error(`Fused decoder ${c.id} has mismatched spatial shapes`);
      f = {
        width: d[0].width,
        height: d[0].height,
        channels: i.convChannels.get(c.conv.id).outputChannels
      };
    }
    s.set(c.id, f), a.push(f);
  }
  const l = /* @__PURE__ */ new Map();
  o.nodes.forEach((c, f) => {
    for (const d of dr(c)) l.set(d, f);
  }), l.set(i.spec.output, o.nodes.length);
  const p = o.nodes.map((c, f) => ({
    node: c,
    outputShape: a[f],
    lastUse: l.get(c.id) ?? f
  }));
  return { ...o, inputShape: r, valueShapes: s, plannedNodes: p };
}
class Yn {
  constructor() {
    g(this, "_stats", /* @__PURE__ */ new Map());
  }
  track(t, e) {
    let n = this._stats.get(t);
    return n || (n = {
      created: 0,
      destroyed: 0,
      live: 0,
      peakLive: 0,
      resources: /* @__PURE__ */ new Set()
    }, this._stats.set(t, n)), n.resources.has(e) || (n.resources.add(e), n.created++, n.live++, n.peakLive = Math.max(n.peakLive, n.live)), e;
  }
  release(t, e, n) {
    if (!e) return !1;
    const o = this._stats.get(t);
    if (!(o != null && o.resources.delete(e))) return !1;
    try {
      n();
    } finally {
      o.destroyed++, o.live--;
    }
    return !0;
  }
  snapshot(t = 0) {
    let e = 0, n = 0, o = 0, r = 0;
    const s = {};
    for (const [a, u] of this._stats) {
      const l = {
        created: u.created,
        destroyed: u.destroyed,
        live: u.live,
        peakLive: u.peakLive
      };
      s[a] = l, e += l.live, n += l.created, o += l.destroyed, r += l.peakLive;
    }
    return { live: e, created: n, destroyed: o, peakLive: r, pending: t, byKind: s };
  }
}
const nn = /* @__PURE__ */ new WeakMap();
function gr(i) {
  let t = nn.get(i);
  return t || (t = { ready: /* @__PURE__ */ new Map(), pending: /* @__PURE__ */ new Map() }, nn.set(i, t)), t;
}
const Y = 8, Q = 8, G = 4, yt = Q * G, J = Q, q = 8, S = 8, Z = S + 2;
function Ue(i, t) {
  return Math.ceil(i / t) * t;
}
function U(i) {
  return Math.ceil(i / 4);
}
function _r(i, t) {
  return i.width * i.height * U(i.channels) * 4 * t;
}
let Tt;
function Fn(i) {
  const t = i & 32768 ? -1 : 1, e = i >>> 10 & 31, n = i & 1023;
  return e === 0 ? t * n * 2 ** -24 : e === 31 ? n === 0 ? t * (1 / 0) : NaN : t * (1 + n / 1024) * 2 ** (e - 15);
}
function yr() {
  if (!Tt) {
    Tt = new Float32Array(65536);
    for (let i = 0; i < Tt.length; i++)
      Tt[i] = Fn(i);
  }
  return Tt;
}
function rn(i) {
  if (i.desc.dataType === "Float32")
    return new Float32Array(
      i.data.buffer,
      i.data.byteOffset,
      i.data.byteLength / 4
    );
  const t = new Uint16Array(
    i.data.buffer,
    i.data.byteOffset,
    i.data.byteLength / 2
  ), e = new Float32Array(t.length);
  if (t.length < 4096)
    for (let n = 0; n < t.length; n++)
      e[n] = Fn(t[n]);
  else {
    const n = yr();
    for (let o = 0; o < t.length; o++)
      e[o] = n[t[o]];
  }
  return e;
}
function me(i, t, e, n) {
  const o = Ue(e.byteLength, 4), r = i.createBuffer({
    label: t,
    size: o,
    usage: n,
    mappedAtCreation: !0
  });
  return new Uint8Array(r.getMappedRange()).set(
    new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
  ), r.unmap(), r;
}
function on(i, t, e) {
  const n = new Uint32Array(Ue(e.length, 4));
  return n.set(e), me(i, t, n, GPUBufferUsage.UNIFORM);
}
function mr(i, t, e, n) {
  const o = U(e.inputChannels), r = U(e.outputChannels), s = r * e.kernelHeight * e.kernelWidth * o * 4 * 4, a = n === "fp16" && e.weight.desc.dataType === "Float16", u = a ? new Uint16Array(s) : n === "fp16" ? new I(s) : new Float32Array(s), l = a ? new Uint16Array(
    e.weight.data.buffer,
    e.weight.data.byteOffset,
    e.weight.data.byteLength / 2
  ) : rn(e.weight);
  for (let f = 0; f < r; f++)
    for (let d = 0; d < e.kernelHeight; d++)
      for (let h = 0; h < e.kernelWidth; h++)
        for (let _ = 0; _ < o; _++)
          for (let y = 0; y < 4; y++) {
            const x = f * 4 + y;
            for (let m = 0; m < 4; m++) {
              const b = _ * 4 + m, W = (((f * e.kernelHeight + d) * e.kernelWidth + h) * o + _) * 16 + m * 4 + y;
              if (x < e.outputChannels && b < e.inputChannels) {
                const H = ((x * e.inputChannels + b) * e.kernelHeight + d) * e.kernelWidth + h;
                u[W] = l[H];
              }
            }
          }
  const p = new Float32Array(r * 4);
  p.set(rn(e.bias));
  const c = me(
    i,
    `oidn/${t}/weights/${n}`,
    u,
    GPUBufferUsage.STORAGE
  );
  try {
    return {
      weights: c,
      bias: me(
        i,
        `oidn/${t}/bias`,
        p,
        GPUBufferUsage.STORAGE
      )
    };
  } catch (f) {
    throw c.destroy(), f;
  }
}
function F(i) {
  return i === "fp16" ? "vec4<f16>" : "vec4<f32>";
}
function ot(i) {
  return i === "fp16" ? `enable f16;
` : "";
}
function st(i, t) {
  return t === "fp16" ? `vec4<f16>(${i})` : i;
}
function gt(i, t) {
  return t === "relu" ? `max(${i}, vec4<f32>(0.0))` : i;
}
function Nt(i, t, e) {
  return e === "fp32" ? (
    /* wgsl */
    `
let inputValue = vec4<f32>(${i});
let weightBase = ${t};
acc = fma(vec4<f32>(weights[weightBase]), vec4<f32>(inputValue.x), acc);
acc = fma(vec4<f32>(weights[weightBase + 1u]), vec4<f32>(inputValue.y), acc);
acc = fma(vec4<f32>(weights[weightBase + 2u]), vec4<f32>(inputValue.z), acc);
acc = fma(vec4<f32>(weights[weightBase + 3u]), vec4<f32>(inputValue.w), acc);
`
  ) : (
    /* wgsl */
    `
let inputValue = vec4<f16>(${i});
let weightBase = ${t};
var partial = vec4<f16>(0.0h);
partial = fma(weights[weightBase], vec4<f16>(inputValue.x), partial);
partial = fma(weights[weightBase + 1u], vec4<f16>(inputValue.y), partial);
partial = fma(weights[weightBase + 2u], vec4<f16>(inputValue.z), partial);
partial = fma(weights[weightBase + 3u], vec4<f16>(inputValue.w), partial);
acc += vec4<f32>(partial);
`
  );
}
function vr(i, t, e) {
  const n = e === "fp16" ? "vec4<f16>" : "vec4<f32>", o = e === "fp16" ? `var partial = vec4<f16>(0.0h);
partial = fma(subgroupBroadcast(weights[weightBase], 0u), ${n}(inputValue.x), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 1u], 0u), ${n}(inputValue.y), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 2u], 0u), ${n}(inputValue.z), partial);
partial = fma(subgroupBroadcast(weights[weightBase + 3u], 0u), ${n}(inputValue.w), partial);
acc += vec4<f32>(partial);` : `acc = fma(subgroupBroadcast(weights[weightBase], 0u), vec4<f32>(inputValue.x), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 1u], 0u), vec4<f32>(inputValue.y), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 2u], 0u), vec4<f32>(inputValue.z), acc);
acc = fma(subgroupBroadcast(weights[weightBase + 3u], 0u), vec4<f32>(inputValue.w), acc);`;
  return (
    /* wgsl */
    `
let inputValue = ${n}(${i});
let weightBase = ${t};
${o}
`
  );
}
function Xn(i) {
  return i === "fp16" ? (
    /* wgsl */
    `
    var partial: array<vec4<f16>, ${G}>;
    for (var row = 0u; row < ${G}u; row++) {
      partial[row] = vec4<f16>(0.0h);
    }
    for (var tileK = 0u; tileK < ${q}u; tileK++) {
      let weightBase =
        (tileK * ${J}u + localId.x) * 4u;
      for (var row = 0u; row < ${G}u; row++) {
        let tileSpatial =
          localId.y * ${G}u + row;
        let inputValue =
          inputTile[tileSpatial * ${q}u + tileK];
        partial[row] = fma(
          weightTile[weightBase],
          vec4<f16>(inputValue.x),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 1u],
          vec4<f16>(inputValue.y),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 2u],
          vec4<f16>(inputValue.z),
          partial[row]
        );
        partial[row] = fma(
          weightTile[weightBase + 3u],
          vec4<f16>(inputValue.w),
          partial[row]
        );
      }
    }
    for (var row = 0u; row < ${G}u; row++) {
      acc[row] += vec4<f32>(partial[row]);
    }
`
  ) : (
    /* wgsl */
    `
    for (var tileK = 0u; tileK < ${q}u; tileK++) {
      let weightBase =
        (tileK * ${J}u + localId.x) * 4u;
      for (var row = 0u; row < ${G}u; row++) {
        let tileSpatial =
          localId.y * ${G}u + row;
        let inputValue =
          inputTile[tileSpatial * ${q}u + tileK];
        acc[row] = fma(
          weightTile[weightBase],
          vec4<f32>(inputValue.x),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 1u],
          vec4<f32>(inputValue.y),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 2u],
          vec4<f32>(inputValue.z),
          acc[row]
        );
        acc[row] = fma(
          weightTile[weightBase + 3u],
          vec4<f32>(inputValue.w),
          acc[row]
        );
      }
    }
`
  );
}
function wr(i, t, e, n, o) {
  const r = F(i), s = F(i), a = F(t), u = st(
    gt("acc", e),
    t
  );
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}

@group(0) @binding(0) var<storage, read> inputData: array<${r}>;
@group(0) @binding(1) var<storage, read> weights: array<${s}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${a}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${o}u) {
    return;
  }
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    if (inputY < 0 || inputY >= i32(params.inputHeight)) { continue; }
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      if (inputX < 0 || inputX >= i32(params.inputWidth)) { continue; }
      let pixelBase = (u32(inputY) * params.inputWidth + u32(inputX)) * ${n}u;
      for (var inputBlock = 0u; inputBlock < ${n}u; inputBlock++) {
        ${Nt(
      "inputData[pixelBase + inputBlock]",
      `((((gid.z * 3u + ky) * 3u + kx) * ${n}u + inputBlock) * 4u)`,
      i
    )}
      }
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${o}u + gid.z;
  outputData[outputIndex] = ${u};
}
`
  );
}
function xr(i, t, e, n, o) {
  const r = F(i), s = F(i), a = F(t), u = st(
    gt("acc", e),
    t
  );
  return (
    /* wgsl */
    `${ot(i)}
enable subgroups;
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${r}>;
@group(0) @binding(1) var<storage, read> weights: array<${s}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${a}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let outputInBounds =
    gid.x < params.outputWidth && gid.y < params.outputHeight;
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    let clampedY = u32(clamp(inputY, 0, i32(params.inputHeight) - 1));
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      let clampedX = u32(clamp(inputX, 0, i32(params.inputWidth) - 1));
      let inputInBounds =
        outputInBounds && inputX >= 0 && inputY >= 0 &&
        inputX < i32(params.inputWidth) && inputY < i32(params.inputHeight);
      let pixelBase =
        (clampedY * params.inputWidth + clampedX) * ${n}u;
      for (var inputBlock = 0u; inputBlock < ${n}u; inputBlock++) {
        ${vr(
      `select(${r}(0.0), inputData[pixelBase + inputBlock], inputInBounds)`,
      `((((gid.z * 3u + ky) * 3u + kx) * ${n}u + inputBlock) * 4u)`,
      i
    )}
      }
    }
  }
  if (outputInBounds) {
    let outputIndex =
      (gid.y * params.outputWidth + gid.x) * ${o}u + gid.z;
    outputData[outputIndex] = ${u};
  }
}
`
  );
}
function br(i, t, e, n, o) {
  const r = F(i), s = F(t), a = st(
    gt("acc", e),
    t
  ), u = Z * Z * n, l = S * S;
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${r}>;
@group(0) @binding(1) var<storage, read> weights: array<${r}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${s}>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> inputPatch: array<${r}, ${u}>;

@compute @workgroup_size(${S}, ${S}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let localLinear =
    localId.y * ${S}u + localId.x;
  for (
    var loadIndex = localLinear;
    loadIndex < ${u}u;
    loadIndex += ${l}u
  ) {
    let patchPixel = loadIndex / ${n}u;
    let inputBlock = loadIndex % ${n}u;
    let patchX = patchPixel % ${Z}u;
    let patchY = patchPixel / ${Z}u;
    let inputX =
      i32(workgroupId.x * ${S}u + patchX) - 1;
    let inputY =
      i32(workgroupId.y * ${S}u + patchY) - 1;
    var value = ${r}(0.0);
    if (
      inputX >= 0 && inputX < i32(params.inputWidth) &&
      inputY >= 0 && inputY < i32(params.inputHeight)
    ) {
      let inputIndex =
        (u32(inputY) * params.inputWidth + u32(inputX)) *
        ${n}u + inputBlock;
      value = inputData[inputIndex];
    }
    inputPatch[loadIndex] = value;
  }
  workgroupBarrier();

  let outputX =
    workgroupId.x * ${S}u + localId.x;
  let outputY =
    workgroupId.y * ${S}u + localId.y;
  let outputBlock = workgroupId.z;
  if (
    outputX >= params.outputWidth || outputY >= params.outputHeight ||
    outputBlock >= ${o}u
  ) {
    return;
  }

  var acc = bias[outputBlock];
  for (var ky = 0u; ky < 3u; ky++) {
    for (var kx = 0u; kx < 3u; kx++) {
      let patchBase =
        ((localId.y + ky) * ${Z}u + localId.x + kx) *
        ${n}u;
      for (var inputBlock = 0u; inputBlock < ${n}u; inputBlock++) {
        ${Nt(
      "inputPatch[patchBase + inputBlock]",
      `((((outputBlock * 3u + ky) * 3u + kx) * ${n}u + inputBlock) * 4u)`,
      i
    )}
      }
    }
  }
  let outputIndex =
    (outputY * params.outputWidth + outputX) * ${o}u + outputBlock;
  outputData[outputIndex] = ${a};
}
`
  );
}
function $r(i, t, e, n, o) {
  const r = F(i), s = F(t), a = st(
    gt("acc", e),
    t
  ), u = Q * Q, l = yt * q, p = q * J * 4;
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${r}>;
@group(0) @binding(1) var<storage, read> weights: array<${r}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${s}>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> inputTile: array<${r}, ${l}>;
var<workgroup> weightTile: array<${r}, ${p}>;

@compute @workgroup_size(${Q}, ${Q}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let spatialBase =
    workgroupId.x * ${yt}u +
    localId.y * ${G}u;
  let outputBlock =
    workgroupId.y * ${J}u + localId.x;
  let spatialCount = params.outputWidth * params.outputHeight;
  var acc: array<vec4<f32>, ${G}>;
  if (outputBlock < ${o}u) {
    for (var row = 0u; row < ${G}u; row++) {
      acc[row] = bias[outputBlock];
    }
  }

  let localLinear =
    localId.y * ${Q}u + localId.x;
  let totalK = ${n * 9}u;
  for (var kBase = 0u; kBase < totalK; kBase += ${q}u) {
    for (
      var loadIndex = localLinear;
      loadIndex < ${l}u;
      loadIndex += ${u}u
    ) {
      let tileSpatial = loadIndex / ${q}u;
      let tileK = loadIndex % ${q}u;
      let inputSpatialIndex =
        workgroupId.x * ${yt}u + tileSpatial;
      let kIndex = kBase + tileK;
      var value = ${r}(0.0);
      if (inputSpatialIndex < spatialCount && kIndex < totalK) {
        let outputY = inputSpatialIndex / params.outputWidth;
        let outputX = inputSpatialIndex % params.outputWidth;
        let inputBlock = kIndex % ${n}u;
        let kernelIndex = kIndex / ${n}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let inputY = i32(outputY) + i32(kernelY) - 1;
        let inputX = i32(outputX) + i32(kernelX) - 1;
        if (
          inputY >= 0 && inputY < i32(params.inputHeight) &&
          inputX >= 0 && inputX < i32(params.inputWidth)
        ) {
          let inputIndex =
            (u32(inputY) * params.inputWidth + u32(inputX)) *
            ${n}u + inputBlock;
          value = inputData[inputIndex];
        }
      }
      inputTile[loadIndex] = value;
    }

    for (
      var loadIndex = localLinear;
      loadIndex < ${p}u;
      loadIndex += ${u}u
    ) {
      let tileK = loadIndex / ${J * 4}u;
      let outputRemainder = loadIndex % ${J * 4}u;
      let tileOutputBlock = outputRemainder / 4u;
      let outputLane = outputRemainder % 4u;
      let loadedOutputBlock =
        workgroupId.y * ${J}u + tileOutputBlock;
      let kIndex = kBase + tileK;
      var value = ${r}(0.0);
      if (loadedOutputBlock < ${o}u && kIndex < totalK) {
        let inputBlock = kIndex % ${n}u;
        let kernelIndex = kIndex / ${n}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let weightIndex =
          ((((loadedOutputBlock * 3u + kernelY) * 3u + kernelX) *
            ${n}u + inputBlock) * 4u + outputLane);
        value = weights[weightIndex];
      }
      weightTile[loadIndex] = value;
    }

    workgroupBarrier();
    ${Xn(i)}
    workgroupBarrier();
  }

  if (outputBlock < ${o}u) {
    for (var row = 0u; row < ${G}u; row++) {
      let spatialIndex = spatialBase + row;
      if (spatialIndex < spatialCount) {
        let outputIndex = spatialIndex * ${o}u + outputBlock;
        outputData[outputIndex] = ${a.replaceAll("acc", "acc[row]")};
      }
    }
  }
}
`
  );
}
function kr(i, t, e, n) {
  const o = F(i), r = gt("acc", t);
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  inputBlocks: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${o}>;
@group(0) @binding(1) var<storage, read> weights: array<${o}>;
@group(0) @binding(2) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outputData: array<${o}>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${n}u) {
    return;
  }
  var pooled = vec4<f32>(-3.402823466e+38);
  for (var py = 0u; py < 2u; py++) {
    let centerY = gid.y * 2u + py;
    if (centerY >= params.inputHeight) { continue; }
    for (var px = 0u; px < 2u; px++) {
      let centerX = gid.x * 2u + px;
      if (centerX >= params.inputWidth) { continue; }
      var acc = bias[gid.z];
      for (var ky = 0u; ky < 3u; ky++) {
        let inputY = i32(centerY) + i32(ky) - 1;
        if (inputY < 0 || inputY >= i32(params.inputHeight)) { continue; }
        for (var kx = 0u; kx < 3u; kx++) {
          let inputX = i32(centerX) + i32(kx) - 1;
          if (inputX < 0 || inputX >= i32(params.inputWidth)) { continue; }
          let pixelBase = (u32(inputY) * params.inputWidth + u32(inputX)) * ${e}u;
          for (var inputBlock = 0u; inputBlock < ${e}u; inputBlock++) {
            ${Nt(
      "inputData[pixelBase + inputBlock]",
      `((((gid.z * 3u + ky) * 3u + kx) * ${e}u + inputBlock) * 4u)`,
      i
    )}
          }
        }
      }
      pooled = max(pooled, ${r});
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${n}u + gid.z;
  outputData[outputIndex] = ${st("pooled", i)};
}
`
  );
}
function Br(i, t) {
  const e = F(i);
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  inputWidth: u32,
  inputHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
}
@group(0) @binding(0) var<storage, read> inputData: array<${e}>;
@group(0) @binding(1) var<storage, read_write> outputData: array<${e}>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (
    gid.x >= params.outputWidth ||
    gid.y >= params.outputHeight ||
    gid.z >= ${t}u
  ) {
    return;
  }
  var pooled = vec4<f32>(-3.402823466e+38);
  for (var py = 0u; py < 2u; py++) {
    let inputY = gid.y * 2u + py;
    if (inputY >= params.inputHeight) { continue; }
    for (var px = 0u; px < 2u; px++) {
      let inputX = gid.x * 2u + px;
      if (inputX >= params.inputWidth) { continue; }
      let inputIndex =
        (inputY * params.inputWidth + inputX) * ${t}u + gid.z;
      pooled = max(pooled, vec4<f32>(inputData[inputIndex]));
    }
  }
  let outputIndex =
    (gid.y * params.outputWidth + gid.x) * ${t}u + gid.z;
  outputData[outputIndex] = ${st("pooled", i)};
}
`
  );
}
function Pr(i, t, e, n, o) {
  const r = F(i), s = e[0] + e[1], a = st(
    gt("acc[row]", t),
    i
  ), u = Q * Q, l = yt * q, p = q * J * 4, c = (f, d) => (
    /* wgsl */
    `
          {
            let sourceBlock = ${d};
            let sourceX = ${f === n ? "u32(inputX) / 2u" : "u32(inputX)"};
            let sourceY = ${f === n ? "u32(inputY) / 2u" : "u32(inputY)"};
            let sourceIndex =
              (sourceY * params.source${f}Width + sourceX) *
              ${e[f]}u + sourceBlock;
            value = input${f}[sourceIndex];
          }`
  );
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${r}>;
@group(0) @binding(1) var<storage, read> input1: array<${r}>;
@group(0) @binding(2) var<storage, read> weights: array<${r}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${r}>;
@group(0) @binding(5) var<uniform> params: Params;

var<workgroup> inputTile: array<${r}, ${l}>;
var<workgroup> weightTile: array<${r}, ${p}>;

@compute @workgroup_size(${Q}, ${Q}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let spatialBase =
    workgroupId.x * ${yt}u +
    localId.y * ${G}u;
  let outputBlock =
    workgroupId.y * ${J}u + localId.x;
  let spatialCount = params.outputWidth * params.outputHeight;
  var acc: array<vec4<f32>, ${G}>;
  if (outputBlock < ${o}u) {
    for (var row = 0u; row < ${G}u; row++) {
      acc[row] = bias[outputBlock];
    }
  }

  let localLinear =
    localId.y * ${Q}u + localId.x;
  let totalK = ${s * 9}u;
  for (var kBase = 0u; kBase < totalK; kBase += ${q}u) {
    for (
      var loadIndex = localLinear;
      loadIndex < ${l}u;
      loadIndex += ${u}u
    ) {
      let tileSpatial = loadIndex / ${q}u;
      let tileK = loadIndex % ${q}u;
      let outputSpatialIndex =
        workgroupId.x * ${yt}u + tileSpatial;
      let kIndex = kBase + tileK;
      var value = ${r}(0.0);
      if (outputSpatialIndex < spatialCount && kIndex < totalK) {
        let outputY = outputSpatialIndex / params.outputWidth;
        let outputX = outputSpatialIndex % params.outputWidth;
        let inputBlock = kIndex % ${s}u;
        let kernelIndex = kIndex / ${s}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let inputY = i32(outputY) + i32(kernelY) - 1;
        let inputX = i32(outputX) + i32(kernelX) - 1;
        if (
          inputY >= 0 && inputY < i32(params.outputHeight) &&
          inputX >= 0 && inputX < i32(params.outputWidth)
        ) {
          if (inputBlock < ${e[0]}u) {
            ${c(0, "inputBlock")}
          } else {
            ${c(1, `inputBlock - ${e[0]}u`)}
          }
        }
      }
      inputTile[loadIndex] = value;
    }

    for (
      var loadIndex = localLinear;
      loadIndex < ${p}u;
      loadIndex += ${u}u
    ) {
      let tileK = loadIndex / ${J * 4}u;
      let outputRemainder = loadIndex % ${J * 4}u;
      let tileOutputBlock = outputRemainder / 4u;
      let outputLane = outputRemainder % 4u;
      let loadedOutputBlock =
        workgroupId.y * ${J}u + tileOutputBlock;
      let kIndex = kBase + tileK;
      var value = ${r}(0.0);
      if (loadedOutputBlock < ${o}u && kIndex < totalK) {
        let inputBlock = kIndex % ${s}u;
        let kernelIndex = kIndex / ${s}u;
        let kernelY = kernelIndex / 3u;
        let kernelX = kernelIndex % 3u;
        let weightIndex =
          ((((loadedOutputBlock * 3u + kernelY) * 3u + kernelX) *
            ${s}u + inputBlock) * 4u + outputLane);
        value = weights[weightIndex];
      }
      weightTile[loadIndex] = value;
    }

    workgroupBarrier();
    ${Xn(i)}
    workgroupBarrier();
  }

  if (outputBlock < ${o}u) {
    for (var row = 0u; row < ${G}u; row++) {
      let spatialIndex = spatialBase + row;
      if (spatialIndex < spatialCount) {
        let outputIndex = spatialIndex * ${o}u + outputBlock;
        outputData[outputIndex] = ${a};
      }
    }
  }
}
`
  );
}
function Ir(i, t, e, n, o) {
  const r = F(i), s = e[0] + e[1], a = (l, p) => {
    const c = l === n;
    return (
      /* wgsl */
      `
      {
        let sourceX = ${c ? "u32(inputX) / 2u" : "u32(inputX)"};
        let sourceY = ${c ? "u32(inputY) / 2u" : "u32(inputY)"};
        let sourcePixelBase = (sourceY * params.source${l}Width + sourceX) * ${e[l]}u;
        for (var sourceBlock = 0u; sourceBlock < ${e[l]}u; sourceBlock++) {
          let inputBlock = ${p}u + sourceBlock;
          ${Nt(
        `input${l}[sourcePixelBase + sourceBlock]`,
        `((((gid.z * 3u + ky) * 3u + kx) * ${s}u + inputBlock) * 4u)`,
        i
      )}
        }
      }
`
    );
  }, u = st(
    gt("acc", t),
    i
  );
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${r}>;
@group(0) @binding(1) var<storage, read> input1: array<${r}>;
@group(0) @binding(2) var<storage, read> weights: array<${r}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${r}>;
@group(0) @binding(5) var<uniform> params: Params;

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outputWidth || gid.y >= params.outputHeight || gid.z >= ${o}u) {
    return;
  }
  var acc = bias[gid.z];
  for (var ky = 0u; ky < 3u; ky++) {
    let inputY = i32(gid.y) + i32(ky) - 1;
    if (inputY < 0 || inputY >= i32(params.outputHeight)) { continue; }
    for (var kx = 0u; kx < 3u; kx++) {
      let inputX = i32(gid.x) + i32(kx) - 1;
      if (inputX < 0 || inputX >= i32(params.outputWidth)) { continue; }
      ${a(0, 0)}
      ${a(1, e[0])}
    }
  }
  let outputIndex = (gid.y * params.outputWidth + gid.x) * ${o}u + gid.z;
  outputData[outputIndex] = ${u};
}
`
  );
}
function Tr(i, t, e, n, o) {
  const r = F(i), s = e[0] + e[1], a = Z * Z * s, u = S * S, l = st(
    gt("acc", t),
    i
  ), p = (c, f) => (
    /* wgsl */
    `
      let sourceBlock = ${f};
      let sourceIndex =
        (${c === n ? "u32(inputY) / 2u" : "u32(inputY)"} * params.source${c}Width + ${c === n ? "u32(inputX) / 2u" : "u32(inputX)"}) *
        ${e[c]}u + sourceBlock;
      value = input${c}[sourceIndex];`
  );
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  outputWidth: u32,
  outputHeight: u32,
  outputBlocks: u32,
  inputBlocks: u32,
  source0Width: u32,
  source0Height: u32,
  source1Width: u32,
  source1Height: u32,
}
@group(0) @binding(0) var<storage, read> input0: array<${r}>;
@group(0) @binding(1) var<storage, read> input1: array<${r}>;
@group(0) @binding(2) var<storage, read> weights: array<${r}>;
@group(0) @binding(3) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outputData: array<${r}>;
@group(0) @binding(5) var<uniform> params: Params;

var<workgroup> inputPatch: array<${r}, ${a}>;

@compute @workgroup_size(${S}, ${S}, 1)
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let localLinear =
    localId.y * ${S}u + localId.x;
  for (
    var loadIndex = localLinear;
    loadIndex < ${a}u;
    loadIndex += ${u}u
  ) {
    let patchPixel = loadIndex / ${s}u;
    let inputBlock = loadIndex % ${s}u;
    let patchX = patchPixel % ${Z}u;
    let patchY = patchPixel / ${Z}u;
    let inputX =
      i32(workgroupId.x * ${S}u + patchX) - 1;
    let inputY =
      i32(workgroupId.y * ${S}u + patchY) - 1;
    var value = ${r}(0.0);
    if (
      inputX >= 0 && inputX < i32(params.outputWidth) &&
      inputY >= 0 && inputY < i32(params.outputHeight)
    ) {
      if (inputBlock < ${e[0]}u) {
        ${p(0, "inputBlock")}
      } else {
        ${p(1, `inputBlock - ${e[0]}u`)}
      }
    }
    inputPatch[loadIndex] = value;
  }
  workgroupBarrier();

  let outputX =
    workgroupId.x * ${S}u + localId.x;
  let outputY =
    workgroupId.y * ${S}u + localId.y;
  let outputBlock = workgroupId.z;
  if (
    outputX >= params.outputWidth || outputY >= params.outputHeight ||
    outputBlock >= ${o}u
  ) {
    return;
  }

  var acc = bias[outputBlock];
  for (var ky = 0u; ky < 3u; ky++) {
    for (var kx = 0u; kx < 3u; kx++) {
      let patchBase =
        ((localId.y + ky) * ${Z}u + localId.x + kx) *
        ${s}u;
      for (var inputBlock = 0u; inputBlock < ${s}u; inputBlock++) {
        ${Nt(
      "inputPatch[patchBase + inputBlock]",
      `((((outputBlock * 3u + ky) * 3u + kx) * ${s}u + inputBlock) * 4u)`,
      i
    )}
      }
    }
  }
  let outputIndex =
    (outputY * params.outputWidth + outputX) * ${o}u + outputBlock;
  outputData[outputIndex] = ${l};
}
`
  );
}
function sn(i, t) {
  const e = F(i), n = Array.from(
    { length: t },
    (a, u) => `@group(0) @binding(${u}) var<storage, read> input${u}: array<vec4<f32>>;`
  ).join(`
`), o = Array.from({ length: t }, (a, u) => {
    const l = u * 3;
    return `if (channel < ${l + 3}u) { return input${u}[pixel][channel - ${l}u]; }`;
  }).join(`
  `), r = t, s = t + 1;
  return (
    /* wgsl */
    `${ot(i)}
struct Params {
  width: u32,
  height: u32,
  outputBlocks: u32,
  inputChannels: u32,
}
${n}
@group(0) @binding(${r}) var<storage, read_write> outputData: array<${e}>;
@group(0) @binding(${s}) var<uniform> params: Params;

fn readChannel(pixel: u32, channel: u32) -> f32 {
  ${o}
  return 0.0;
}

@compute @workgroup_size(${Y}, ${Y}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height || gid.z >= params.outputBlocks) {
    return;
  }
  let pixel = gid.y * params.width + gid.x;
  let firstChannel = gid.z * 4u;
  let value = vec4<f32>(
    readChannel(pixel, firstChannel),
    readChannel(pixel, firstChannel + 1u),
    readChannel(pixel, firstChannel + 2u),
    readChannel(pixel, firstChannel + 3u)
  );
  outputData[pixel * params.outputBlocks + gid.z] = ${st("value", i)};
}
`
  );
}
function Cr(i) {
  return i.op === "concat" ? i.inputs : i.op === "fusedUpsampleConcatConv2d" ? i.inputs.map((t) => t.value) : [i.input];
}
function Sr(i, t = "auto") {
  const e = i.features.has("shader-f16");
  if (t === "fp16" && !e)
    throw new Error(
      "OIDN FP16 was requested but the GPUDevice does not have shader-f16 enabled"
    );
  return t === "auto" ? e ? "fp16" : "fp32" : t;
}
class Er {
  constructor(t, e, n = {}) {
    g(this, "precision");
    g(this, "kernelSetting");
    g(this, "maxSpatialInputBlocks");
    g(this, "subgroupsAvailable");
    g(this, "_model");
    g(this, "_packedConvs", /* @__PURE__ */ new Map());
    g(this, "_pipelineCache");
    g(this, "_pipelinePromises");
    g(this, "_executionCache", /* @__PURE__ */ new Map());
    g(this, "_retiredExecutions", /* @__PURE__ */ new Set());
    g(this, "_clock", 0);
    g(this, "_shapeCacheSize");
    g(this, "_profileNextExecution", !1);
    g(this, "_lastExecutionProfile");
    g(this, "_profileOperations", 0);
    g(this, "_resources", new Yn());
    g(this, "_disposed", !1);
    this._device = t;
    const o = gr(t);
    if (this._pipelineCache = o.ready, this._pipelinePromises = o.pending, this.precision = Sr(
      t,
      n.precision ?? "auto"
    ), this.kernelSetting = n.kernel ?? "auto", this.subgroupsAvailable = t.features.has(
      "subgroups"
    ), this.maxSpatialInputBlocks = this.precision === "fp16" && t.limits.maxComputeInvocationsPerWorkgroup >= S * S && t.limits.maxComputeWorkgroupSizeX >= S && t.limits.maxComputeWorkgroupSizeY >= S ? Math.floor(
      t.limits.maxComputeWorkgroupStorageSize / (Z * Z * 4 * 2)
    ) : 0, this._shapeCacheSize = Math.max(1, n.shapeCacheSize ?? 2), e.inputChannels % 3 !== 0 || e.inputChannels < 3 || e.inputChannels > 9)
      throw new Error(
        `Native OIDN expects 3, 6, or 9 input channels, got ${e.inputChannels}`
      );
    this._model = {
      spec: e.spec,
      inputChannels: e.inputChannels,
      outputChannels: e.outputChannels,
      channelsByValue: new Map(e.channelsByValue),
      convChannels: new Map(e.convChannels)
    };
    for (const r of ye(this._model, {
      fuseConvPool: !1
    }).nodes)
      if (r.op !== "conv2d" && r.op !== "maxPool2d" && r.op !== "fusedConvReluMaxPool2d" && r.op !== "fusedUpsampleConcatConv2d")
        throw new Error(
          `Native OIDN descriptor ${e.spec.id} leaves unsupported ${r.op} node ${r.id} after graph optimization`
        );
    try {
      for (const [r, s] of e.convTensors) {
        const a = mr(t, r, s, this.precision);
        this._resources.track("gpu-buffer", a.weights), this._resources.track("gpu-buffer", a.bias), this._packedConvs.set(r, a);
      }
    } catch (r) {
      for (const s of this._packedConvs.values())
        this._releaseBuffer(s.weights), this._releaseBuffer(s.bias);
      throw this._packedConvs.clear(), r;
    }
  }
  _pipeline(t, e) {
    let n = this._pipelineCache.get(t);
    return n || (n = this._device.createComputePipeline({
      label: `oidn/${t}`,
      layout: "auto",
      compute: {
        module: this._device.createShaderModule({
          label: `oidn/${t}`,
          code: e
        }),
        entryPoint: "main"
      }
    }), this._pipelineCache.set(t, n)), n;
  }
  _pipelineAsync(t, e) {
    const n = this._pipelineCache.get(t);
    if (n) return Promise.resolve(n);
    const o = this._pipelinePromises.get(t);
    if (o) return o;
    const r = this._device.createComputePipelineAsync({
      label: `oidn/${t}`,
      layout: "auto",
      compute: {
        module: this._device.createShaderModule({
          label: `oidn/${t}`,
          code: e
        }),
        entryPoint: "main"
      }
    }).then((s) => (this._pipelineCache.set(t, s), this._pipelinePromises.delete(t), s), (s) => {
      throw this._pipelinePromises.delete(t), s;
    });
    return this._pipelinePromises.set(t, r), r;
  }
  _nodePipelineSpec(t, e) {
    if (t.op === "conv2d") {
      const n = e ? "fp32" : this.precision, o = U(
        this._model.convChannels.get(t.id).inputChannels
      ), r = U(
        this._model.convChannels.get(t.id).outputChannels
      ), s = this._selectConvKernel(o, e);
      return {
        key: `conv-${s}/${this.precision}/${n}/${t.activation}/in${o}/out${r}`,
        kernel: s,
        code: s === "implicit-gemm" ? $r(
          this.precision,
          n,
          t.activation,
          o,
          r
        ) : s === "spatial" ? br(
          this.precision,
          n,
          t.activation,
          o,
          r
        ) : s === "subgroup" ? xr(
          this.precision,
          n,
          t.activation,
          o,
          r
        ) : wr(
          this.precision,
          n,
          t.activation,
          o,
          r
        )
      };
    }
    if (t.op === "maxPool2d") {
      const n = U(
        this._model.channelsByValue.get(t.id)
      );
      return {
        key: `max-pool/${this.precision}/out${n}`,
        kernel: "direct",
        code: Br(this.precision, n)
      };
    }
    if (t.op === "fusedConvReluMaxPool2d") {
      const n = U(
        this._model.convChannels.get(t.conv.id).inputChannels
      ), o = U(
        this._model.convChannels.get(t.conv.id).outputChannels
      );
      return {
        key: `conv-pool/${this.precision}/${t.conv.activation}/in${n}/out${o}`,
        kernel: "direct",
        code: kr(
          this.precision,
          t.conv.activation,
          n,
          o
        )
      };
    }
    if (t.op === "fusedUpsampleConcatConv2d") {
      if (t.inputs.length !== 2)
        throw new Error(`Native fused decoder ${t.id} requires two inputs`);
      const n = t.inputs.map(
        (p) => U(this._model.channelsByValue.get(p.value))
      ), o = t.inputs.findIndex((p) => p.upsample);
      if (o !== 0 && o !== 1)
        throw new Error(`Native fused decoder ${t.id} has no upsample input`);
      const r = n[0] + n[1], s = this._selectConvKernel(r, !1), a = s === "subgroup" ? "direct" : s, u = U(
        this._model.convChannels.get(t.conv.id).outputChannels
      );
      return {
        key: `decoder-${a}/${this.precision}/${t.conv.activation}/${n.join("+")}/out${u}/up${o}`,
        kernel: a,
        code: a === "implicit-gemm" ? Pr(
          this.precision,
          t.conv.activation,
          n,
          o,
          u
        ) : a === "spatial" ? Tr(
          this.precision,
          t.conv.activation,
          n,
          o,
          u
        ) : Ir(
          this.precision,
          t.conv.activation,
          n,
          o,
          u
        )
      };
    }
    throw new Error(
      `Native OIDN does not implement unfused ${t.op} node ${t.id}`
    );
  }
  _selectConvKernel(t, e) {
    const n = this.precision === "fp16" && t <= this.maxSpatialInputBlocks;
    return this.kernelSetting === "direct" ? "direct" : this.kernelSetting === "spatial" ? n ? "spatial" : "direct" : this.kernelSetting === "implicit-gemm" ? e ? "direct" : "implicit-gemm" : this.kernelSetting === "subgroup" ? this.subgroupsAvailable ? "subgroup" : "direct" : this.precision === "fp32" && !e ? "implicit-gemm" : "direct";
  }
  _nodePipeline(t, e) {
    const { key: n, code: o } = this._nodePipelineSpec(t, e);
    return this._pipeline(n, o);
  }
  /** Compiles all shape-independent kernels before the model reports ready. */
  async prepare() {
    if (this._disposed) throw new Error("Native OIDN executor is disposed");
    const t = ye(this._model, { fuseConvPool: !1 }), e = this._model.inputChannels / 3, n = [
      {
        key: `pack/${this.precision}/${e}`,
        code: sn(this.precision, e)
      },
      ...t.nodes.map(
        (o) => this._nodePipelineSpec(o, o.id === t.spec.output)
      )
    ];
    await Promise.all(
      n.map(({ key: o, code: r }) => this._pipelineAsync(o, r))
    );
  }
  _createExecution(t, e) {
    const n = hr(this._model, t, e, {
      fuseConvPool: !1
    }), o = /* @__PURE__ */ new Map(), r = [], s = /* @__PURE__ */ new Map();
    n.nodes.forEach((l, p) => {
      for (const c of Cr(l)) s.set(c, p);
    }), s.set(n.spec.output, n.nodes.length);
    const a = [], u = (l) => (a.push(l), this._resources.track("gpu-buffer", l));
    try {
      const l = (m, b, O, W) => {
        for (const N of r)
          N.activeValue && (s.get(N.activeValue) ?? -1) < W && (N.activeValue = void 0);
        const H = _r(b, O);
        let L = r.filter((N) => !N.activeValue && N.capacity >= H).sort((N, X) => N.capacity - X.capacity)[0];
        L || (L = { buffer: u(this._device.createBuffer({
          label: `oidn/activation/${t}x${e}/${r.length}`,
          size: Ue(H, 4),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        })), capacity: H }, r.push(L)), L.activeValue = m, o.set(m, L.buffer);
      };
      l(
        n.spec.input,
        n.inputShape,
        this.precision === "fp16" ? 2 : 4,
        -1
      ), n.plannedNodes.forEach(({ node: m, outputShape: b }, O) => {
        const W = m.id === n.spec.output;
        l(
          m.id,
          b,
          W || this.precision === "fp32" ? 4 : 2,
          O
        );
      });
      const p = this._model.inputChannels / 3, c = `pack/${this.precision}/${p}`, f = this._pipeline(
        c,
        sn(this.precision, p)
      ), d = [], h = [], _ = [], y = [];
      n.plannedNodes.forEach(({ node: m, outputShape: b }, O) => {
        const W = m.id === n.spec.output, H = this._nodePipelineSpec(m, W), L = this._pipeline(H.key, H.code);
        d.push(L), h.push(H.kernel ?? "direct");
        const N = o.get(m.id);
        let X, B, E;
        if (m.op === "conv2d") {
          const M = n.valueShapes.get(m.input);
          E = m.id, B = [
            M.width,
            M.height,
            b.width,
            b.height,
            U(M.channels),
            U(b.channels)
          ];
          const A = this._packedConvs.get(E);
          X = [
            { binding: 0, resource: { buffer: o.get(m.input) } },
            { binding: 1, resource: { buffer: A.weights } },
            { binding: 2, resource: { buffer: A.bias } },
            { binding: 3, resource: { buffer: N } }
          ];
        } else if (m.op === "maxPool2d") {
          const M = n.valueShapes.get(m.input);
          B = [
            M.width,
            M.height,
            b.width,
            b.height,
            U(b.channels)
          ], X = [
            { binding: 0, resource: { buffer: o.get(m.input) } },
            { binding: 1, resource: { buffer: N } }
          ];
        } else if (m.op === "fusedConvReluMaxPool2d") {
          const M = n.valueShapes.get(m.input);
          E = m.conv.id, B = [
            M.width,
            M.height,
            b.width,
            b.height,
            U(M.channels),
            U(b.channels)
          ];
          const A = this._packedConvs.get(E);
          X = [
            { binding: 0, resource: { buffer: o.get(m.input) } },
            { binding: 1, resource: { buffer: A.weights } },
            { binding: 2, resource: { buffer: A.bias } },
            { binding: 3, resource: { buffer: N } }
          ];
        } else if (m.op === "fusedUpsampleConcatConv2d") {
          E = m.conv.id;
          const M = n.valueShapes.get(m.inputs[0].value), A = n.valueShapes.get(m.inputs[1].value);
          B = [
            b.width,
            b.height,
            U(b.channels),
            U(this._model.convChannels.get(E).inputChannels),
            M.width,
            M.height,
            A.width,
            A.height
          ];
          const R = this._packedConvs.get(E);
          X = [
            {
              binding: 0,
              resource: { buffer: o.get(m.inputs[0].value) }
            },
            {
              binding: 1,
              resource: { buffer: o.get(m.inputs[1].value) }
            },
            { binding: 2, resource: { buffer: R.weights } },
            { binding: 3, resource: { buffer: R.bias } },
            { binding: 4, resource: { buffer: N } }
          ];
        } else
          throw new Error(`Unexpected native node ${m.op}`);
        const at = u(
          on(
            this._device,
            `oidn/${m.id}/params/${t}x${e}`,
            B
          )
        );
        y.push(at), X.push({ binding: X.length, resource: { buffer: at } }), _.push(
          this._device.createBindGroup({
            label: `oidn/${m.id}/bindings`,
            layout: L.getBindGroupLayout(0),
            entries: X
          })
        );
      });
      const x = u(
        on(
          this._device,
          `oidn/input/params/${t}x${e}`,
          [
            t,
            e,
            U(this._model.inputChannels),
            this._model.inputChannels
          ]
        )
      );
      return y.push(x), {
        plan: n,
        valueBuffers: o,
        slots: r,
        nodeBindings: _,
        nodePipelines: d,
        nodeKernels: h,
        inputPipeline: f,
        inputUniform: x,
        ownedBuffers: y,
        lastUsed: ++this._clock
      };
    } catch (l) {
      for (const p of a) this._releaseBuffer(p);
      throw l;
    }
  }
  _execution(t, e) {
    if (this._disposed) throw new Error("Native OIDN executor is disposed");
    const n = `${t}x${e}`;
    let o = this._executionCache.get(n);
    if (!o && (o = this._createExecution(t, e), this._executionCache.set(n, o), this._executionCache.size > this._shapeCacheSize)) {
      const r = [...this._executionCache.entries()].filter(([s]) => s !== n).sort((s, a) => s[1].lastUsed - a[1].lastUsed)[0];
      r && (this._executionCache.delete(r[0]), this._retiredExecutions.add(r[1]), this._device.queue.onSubmittedWorkDone().catch(() => {
      }).then(() => {
        this._retiredExecutions.delete(r[1]), this._destroyExecution(r[1]);
      }));
    }
    return o.lastUsed = ++this._clock, o;
  }
  /** Captures per-pass GPU timestamps for the next execute call when supported. */
  profileNextExecution() {
    return this._device.features.has("timestamp-query") ? (this._profileNextExecution = !0, !0) : !1;
  }
  getLastExecutionProfile() {
    return this._lastExecutionProfile;
  }
  execute(t, e, n) {
    const o = this._model.inputChannels / 3;
    if (t.length !== o)
      throw new Error(
        `Native OIDN expected ${o} input buffers, got ${t.length}`
      );
    const r = this._execution(e, n), s = [
      "input-pack",
      ...r.plan.nodes.map((h) => h.id)
    ], a = this._profileNextExecution && this._device.features.has("timestamp-query");
    this._profileNextExecution = !1;
    const u = s.length * 2, l = a ? this._resources.track(
      "gpu-query-set",
      this._device.createQuerySet({ type: "timestamp", count: u })
    ) : void 0, p = u * 8;
    let c, f;
    try {
      c = a ? this._resources.track(
        "gpu-buffer",
        this._device.createBuffer({
          label: `oidn/profile/resolve/${e}x${n}`,
          size: p,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        })
      ) : void 0, f = a ? this._resources.track(
        "gpu-buffer",
        this._device.createBuffer({
          label: `oidn/profile/readback/${e}x${n}`,
          size: p,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        })
      ) : void 0;
    } catch (h) {
      throw this._releaseBuffer(f), this._releaseBuffer(c), this._releaseQuerySet(l), h;
    }
    const d = (h, _) => ({
      label: h,
      ...l ? {
        timestampWrites: {
          querySet: l,
          beginningOfPassWriteIndex: _ * 2,
          endOfPassWriteIndex: _ * 2 + 1
        }
      } : {}
    });
    try {
      const h = this._device.createCommandEncoder({
        label: `oidn/native/${e}x${n}`
      }), _ = t.map(
        (x, m) => ({ binding: m, resource: { buffer: x } })
      );
      _.push({
        binding: o,
        resource: { buffer: r.valueBuffers.get(r.plan.spec.input) }
      }), _.push({
        binding: o + 1,
        resource: { buffer: r.inputUniform }
      });
      const y = this._device.createBindGroup({
        label: "oidn/input/bindings",
        layout: r.inputPipeline.getBindGroupLayout(0),
        entries: _
      });
      {
        const x = h.beginComputePass(
          d("oidn/input-pack", 0)
        );
        x.setPipeline(r.inputPipeline), x.setBindGroup(0, y), x.dispatchWorkgroups(
          Math.ceil(e / Y),
          Math.ceil(n / Y),
          U(this._model.inputChannels)
        ), x.end();
      }
      r.plan.plannedNodes.forEach(({ node: x, outputShape: m }, b) => {
        const O = h.beginComputePass(
          d(`oidn/${r.plan.nodes[b].id}`, b + 1)
        );
        O.setPipeline(r.nodePipelines[b]), O.setBindGroup(0, r.nodeBindings[b]), r.nodeKernels[b] === "implicit-gemm" ? O.dispatchWorkgroups(
          Math.ceil(
            m.width * m.height / yt
          ),
          Math.ceil(
            U(m.channels) / J
          ),
          1
        ) : O.dispatchWorkgroups(
          Math.ceil(m.width / Y),
          Math.ceil(m.height / Y),
          U(m.channels)
        ), O.end();
      }), l && (h.resolveQuerySet(
        l,
        0,
        u,
        c,
        0
      ), h.copyBufferToBuffer(
        c,
        0,
        f,
        0,
        p
      )), this._device.queue.submit([h.finish()]);
    } catch (h) {
      throw this._releaseBuffer(f), this._releaseBuffer(c), this._releaseQuerySet(l), h;
    }
    return l && (this._profileOperations++, this._lastExecutionProfile = (async () => {
      try {
        await f.mapAsync(GPUMapMode.READ);
        const h = new BigUint64Array(
          f.getMappedRange()
        ), _ = s.map((y, x) => ({
          id: y,
          durationMs: Number(h[x * 2 + 1] - h[x * 2]) / 1e6
        }));
        return {
          totalMs: _.reduce(
            (y, x) => y + x.durationMs,
            0
          ),
          layers: _
        };
      } finally {
        f.mapState === "mapped" && f.unmap(), this._releaseQuerySet(l), this._releaseBuffer(c), this._releaseBuffer(f), this._profileOperations--;
      }
    })()), r.valueBuffers.get(r.plan.spec.output);
  }
  /** Compatibility path for ImageData/HDR arrays without TensorFlow.js. */
  async executeCPU(t, e, n) {
    const o = e * n * this._model.inputChannels;
    if (t.length !== o)
      throw new Error(
        `Native OIDN CPU input has ${t.length} values, expected ${o}`
      );
    const r = this._execution(e, n), s = this._model.inputChannels / 3, a = e * n;
    r.cpuInputBuffers || (r.cpuInputBuffers = Array.from({ length: s }, (f, d) => {
      const h = this._device.createBuffer({
        label: `oidn/cpu-input/${e}x${n}/${d}`,
        size: a * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      return this._resources.track("gpu-buffer", h), r.ownedBuffers.push(h), h;
    }), r.cpuReadbackBuffer = this._device.createBuffer({
      label: `oidn/cpu-readback/${e}x${n}`,
      size: a * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    }), this._resources.track("gpu-buffer", r.cpuReadbackBuffer), r.ownedBuffers.push(r.cpuReadbackBuffer));
    for (let f = 0; f < s; f++) {
      const d = new Float32Array(a * 4);
      for (let h = 0; h < a; h++) {
        const _ = h * this._model.inputChannels + f * 3, y = h * 4;
        d[y] = t[_], d[y + 1] = t[_ + 1], d[y + 2] = t[_ + 2];
      }
      this._device.queue.writeBuffer(
        r.cpuInputBuffers[f],
        0,
        d
      );
    }
    const u = this.execute(r.cpuInputBuffers, e, n), l = this._device.createCommandEncoder({
      label: `oidn/cpu-readback/${e}x${n}`
    });
    l.copyBufferToBuffer(
      u,
      0,
      r.cpuReadbackBuffer,
      0,
      a * 16
    ), this._device.queue.submit([l.finish()]), await r.cpuReadbackBuffer.mapAsync(GPUMapMode.READ);
    const p = new Float32Array(
      r.cpuReadbackBuffer.getMappedRange()
    ), c = new Float32Array(a * 3);
    for (let f = 0; f < a; f++)
      c[f * 3] = p[f * 4], c[f * 3 + 1] = p[f * 4 + 1], c[f * 3 + 2] = p[f * 4 + 2];
    return r.cpuReadbackBuffer.unmap(), c;
  }
  _releaseBuffer(t) {
    this._resources.release("gpu-buffer", t, () => t.destroy());
  }
  _releaseQuerySet(t) {
    this._resources.release(
      "gpu-query-set",
      t,
      () => t.destroy()
    );
  }
  _destroyExecution(t) {
    t.slots.forEach((e) => this._releaseBuffer(e.buffer)), t.ownedBuffers.forEach((e) => this._releaseBuffer(e));
  }
  getResourceInfo() {
    return this._resources.snapshot(
      this._retiredExecutions.size + this._profileOperations
    );
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = !0;
      for (const t of this._packedConvs.values())
        this._releaseBuffer(t.weights), this._releaseBuffer(t.bias);
      this._packedConvs.clear();
      for (const t of this._executionCache.values())
        this._destroyExecution(t);
      this._executionCache.clear();
      for (const t of this._retiredExecutions)
        this._destroyExecution(t);
      this._retiredExecutions.clear();
    }
  }
}
const an = /* @__PURE__ */ new WeakMap();
function Ar(i, t) {
  let e = an.get(i);
  e || (e = /* @__PURE__ */ new Map(), an.set(i, e));
  let n = e.get(t);
  if (!n) {
    const o = i.createShaderModule({
      label: `oidn/webnn/input-pack/${t}`,
      code: Nr(t)
    }), r = i.createShaderModule({
      label: "oidn/webnn/output-unpack",
      code: Mr()
    });
    n = {
      input: i.createComputePipeline({
        label: `oidn/webnn/input-pack/${t}`,
        layout: "auto",
        compute: { module: o, entryPoint: "main" }
      }),
      output: i.createComputePipeline({
        label: "oidn/webnn/output-unpack",
        layout: "auto",
        compute: { module: r, entryPoint: "main" }
      })
    }, e.set(t, n);
  }
  return n;
}
const ht = 8;
function Hn(i, t) {
  return Math.ceil(i / t) * t;
}
function Or(i, t, e, n) {
  const o = i.createBuffer({
    label: t,
    size: Hn(e.byteLength, 4),
    usage: n,
    mappedAtCreation: !0
  });
  return new Uint8Array(o.getMappedRange()).set(
    new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
  ), o.unmap(), o;
}
function un(i, t, e) {
  const n = new Uint32Array(Hn(e.length, 4));
  return n.set(e), Or(i, t, n, GPUBufferUsage.UNIFORM);
}
function ce(i, t, e, n) {
  var o, r, s, a;
  return !!((a = (s = (r = (o = i == null ? void 0 : i[t]) == null ? void 0 : o[e]) == null ? void 0 : r.dataTypes) == null ? void 0 : s.includes) != null && a.call(s, n));
}
function Ur(i, t) {
  if (t === "fp16" && i.desc.dataType === "Float16")
    return new Uint8Array(
      i.data.buffer,
      i.data.byteOffset,
      i.data.byteLength
    );
  if (t === "fp32" && i.desc.dataType === "Float32")
    return new Uint8Array(
      i.data.buffer,
      i.data.byteOffset,
      i.data.byteLength
    );
  const e = i.desc.dataType === "Float32" ? new Float32Array(
    i.data.buffer,
    i.data.byteOffset,
    i.data.byteLength / 4
  ) : new I(
    i.data.buffer,
    i.data.byteOffset,
    i.data.byteLength / 2
  ), n = t === "fp16" ? new I(e) : new Float32Array(e);
  return new Uint8Array(
    n.buffer,
    n.byteOffset,
    n.byteLength
  );
}
function Nr(i) {
  const t = Array.from(
    { length: i },
    (n, o) => `@group(0) @binding(${o}) var<storage, read> input${o}: array<vec4<f32>>;`
  ).join(`
`), e = Array.from({ length: i }, (n, o) => {
    const r = o * 3;
    return `if (channel < ${r + 3}u) {
      return input${o}[pixel][channel - ${r}u];
    }`;
  }).join(`
  `);
  return (
    /* wgsl */
    `enable f16;
struct Params { width: u32, height: u32, channels: u32, padding: u32 }
${t}
@group(0) @binding(${i}) var<storage, read_write> outputData: array<f16>;
@group(0) @binding(${i + 1}) var<uniform> params: Params;

fn readChannel(pixel: u32, channel: u32) -> f32 {
  ${e}
  return 0.0;
}

@compute @workgroup_size(${ht}, ${ht}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height || gid.z >= params.channels) {
    return;
  }
  let pixel = gid.y * params.width + gid.x;
  let outputIndex = (gid.z * params.height + gid.y) * params.width + gid.x;
  outputData[outputIndex] = f16(readChannel(pixel, gid.z));
}
`
  );
}
function Mr() {
  return (
    /* wgsl */
    `enable f16;
struct Params { width: u32, height: u32, padding0: u32, padding1: u32 }
@group(0) @binding(0) var<storage, read> inputData: array<f16>;
@group(0) @binding(1) var<storage, read_write> outputData: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${ht}, ${ht}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let pixel = gid.y * params.width + gid.x;
  let plane = params.width * params.height;
  outputData[pixel] = vec4<f32>(
    f32(inputData[pixel]),
    f32(inputData[plane + pixel]),
    f32(inputData[plane * 2u + pixel]),
    0.0
  );
}
`
  );
}
function zr(i, t) {
  if (t === "fp32")
    throw new Error(
      "OIDN WebNN GPU interop currently requires FP16 exportable tensors"
    );
  if (!i.features.has("shader-f16"))
    throw new Error("OIDN WebNN requires shader-f16 on the shared GPUDevice");
  return "fp16";
}
function Dr(i, t, e) {
  return e === "relu" ? i.relu(t) : t;
}
class Wr {
  constructor(t, e, n = {}) {
    g(this, "precision");
    g(this, "support");
    g(this, "_context");
    g(this, "_builderConstructor");
    g(this, "_shapeCache", /* @__PURE__ */ new Map());
    g(this, "_shapePromises", /* @__PURE__ */ new Map());
    g(this, "_retiredExecutions", /* @__PURE__ */ new Set());
    g(this, "_pendingCreationCount", 0);
    g(this, "_shapeCacheSize");
    g(this, "_clock", 0);
    g(this, "_inputPipeline");
    g(this, "_outputPipeline");
    g(this, "_resources", new Yn());
    g(this, "_disposed", !1);
    this._device = t, this._model = e, this.precision = zr(
      t,
      n.precision ?? "auto"
    ), this._shapeCacheSize = Math.max(1, n.shapeCacheSize ?? 2), this.support = {
      available: !1,
      fp16Conv: !1,
      gpuInterop: !1
    };
    const o = Ar(
      t,
      e.inputChannels / 3
    );
    this._inputPipeline = o.input, this._outputPipeline = o.output;
  }
  async prepare() {
    var n, o, r;
    if (this._disposed) throw new Error("OIDN WebNN executor is disposed");
    const t = (n = globalThis.navigator) == null ? void 0 : n.ml, e = globalThis.MLGraphBuilder;
    if (!(t != null && t.createContext) || typeof e != "function")
      throw this.support.reason = "WebNN is not exposed by this browser", new Error(this.support.reason);
    this._builderConstructor = e;
    try {
      try {
        this._context = await t.createContext({
          deviceType: "gpu",
          powerPreference: "high-performance"
        });
      } catch {
        this._context = await t.createContext({ deviceType: "gpu" });
      }
      if (this._resources.track("ml-context", this._context), this._disposed) throw new Error("OIDN WebNN executor is disposed");
      if (typeof this._context.createExportableTensor != "function" || typeof this._context.exportToGPU != "function")
        throw this.support.reason = "WebNN WebGPU tensor interop is unavailable", new Error(this.support.reason);
      const s = ((r = (o = this._context).opSupportLimits) == null ? void 0 : r.call(o)) ?? {};
      if (this.support.fp16Conv = ce(s, "conv2d", "input", "float16") && ce(s, "conv2d", "filter", "float16") && ce(s, "conv2d", "output", "float16"), !this.support.fp16Conv)
        throw this.support.reason = "WebNN does not support FP16 conv2d", new Error(this.support.reason);
      let a, u;
      try {
        a = this._resources.track(
          "ml-tensor",
          await this._context.createExportableTensor(
            { dataType: "float16", shape: [4] },
            this._device
          )
        ), u = this._resources.track(
          "gpu-buffer",
          await this._context.exportToGPU(a)
        ), this.support.gpuInterop = !0;
      } catch (l) {
        throw this.support.reason = `WebNN FP16 WebGPU interop failed: ${String(l)}`, new Error(this.support.reason);
      } finally {
        this._releaseBuffer(u), this._releaseTensor(a);
      }
      this.support.available = !0;
    } catch (s) {
      throw this._releaseContext(), s;
    }
  }
  _constant(t, e) {
    return t.constant(
      {
        dataType: "float16",
        shape: [...e.desc.dims]
      },
      Ur(e, this.precision)
    );
  }
  async _createExecution(t, e) {
    if (this._disposed) throw new Error("OIDN WebNN executor is disposed");
    const n = new this._builderConstructor(this._context), o = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
    o.set(
      this._model.spec.input,
      n.input("input", {
        dataType: "float16",
        shape: [1, this._model.inputChannels, e, t]
      })
    ), r.set(this._model.spec.input, [this._model.inputChannels, e, t]);
    for (const f of this._model.spec.nodes) {
      let d, h;
      if (f.op === "conv2d") {
        const _ = r.get(f.input), y = this._model.convTensors.get(f.id), x = n.conv2d(
          o.get(f.input),
          this._constant(n, y.weight),
          {
            bias: this._constant(n, y.bias),
            padding: [1, 1, 1, 1],
            inputLayout: "nchw",
            filterLayout: "oihw"
          }
        );
        d = Dr(n, x, f.activation), h = [y.outputChannels, _[1], _[2]];
      } else if (f.op === "maxPool2d") {
        const _ = r.get(f.input);
        d = n.maxPool2d(o.get(f.input), {
          windowDimensions: [2, 2],
          strides: [2, 2],
          padding: [0, _[1] % 2, 0, _[2] % 2],
          layout: "nchw"
        }), h = [
          _[0],
          Math.ceil(_[1] / 2),
          Math.ceil(_[2] / 2)
        ];
      } else if (f.op === "upsample2d") {
        const _ = r.get(f.input);
        d = n.resample2d(o.get(f.input), {
          mode: "nearest-neighbor",
          axes: [2, 3],
          scales: [2, 2]
        }), h = [_[0], _[1] * 2, _[2] * 2];
      } else {
        const _ = f.inputs.map((y) => r.get(y));
        if (_.some(
          (y) => y[1] !== _[0][1] || y[2] !== _[0][2]
        ))
          throw new Error(
            `WebNN concat ${f.id} has mismatched spatial shapes`
          );
        d = n.concat(
          f.inputs.map((y) => o.get(y)),
          1
        ), h = [
          _.reduce((y, x) => y + x[0], 0),
          _[0][1],
          _[0][2]
        ];
      }
      o.set(f.id, d), r.set(f.id, h);
    }
    let s, a, u, l, p, c;
    try {
      return s = this._resources.track(
        "ml-graph",
        await n.build({
          output: o.get(this._model.spec.output)
        })
      ), a = this._resources.track(
        "ml-tensor",
        await this._context.createExportableTensor(
          {
            dataType: "float16",
            shape: [1, this._model.inputChannels, e, t],
            writable: !0
          },
          this._device
        )
      ), u = this._resources.track(
        "ml-tensor",
        await this._context.createExportableTensor(
          {
            dataType: "float16",
            shape: [1, this._model.outputChannels, e, t],
            readable: !0
          },
          this._device
        )
      ), l = this._resources.track(
        "gpu-buffer",
        this._device.createBuffer({
          label: `oidn/webnn/output/${t}x${e}`,
          size: t * e * 4 * 4,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        })
      ), p = this._resources.track(
        "gpu-buffer",
        un(
          this._device,
          `oidn/webnn/input/${t}x${e}`,
          [t, e, this._model.inputChannels]
        )
      ), c = this._resources.track(
        "gpu-buffer",
        un(
          this._device,
          `oidn/webnn/output/${t}x${e}`,
          [t, e]
        )
      ), {
        graph: s,
        inputTensor: a,
        outputTensor: u,
        outputBuffer: l,
        inputUniform: p,
        outputUniform: c,
        width: t,
        height: e,
        lastUsed: ++this._clock
      };
    } catch (f) {
      throw this._releaseBuffer(c), this._releaseBuffer(p), this._releaseBuffer(l), this._releaseTensor(u), this._releaseTensor(a), this._releaseGraph(s), f;
    }
  }
  async _execution(t, e) {
    const n = `${t}x${e}`;
    let o = this._shapeCache.get(n);
    if (!o) {
      let r = this._shapePromises.get(n);
      r || (r = (async () => {
        this._pendingCreationCount++;
        try {
          return await this._createExecution(t, e);
        } finally {
          this._pendingCreationCount--;
        }
      })(), this._shapePromises.set(n, r));
      try {
        if (o = await r, this._disposed)
          throw this._destroyExecution(o), new Error("OIDN WebNN executor is disposed");
        this._shapeCache.set(n, o);
      } finally {
        this._shapePromises.get(n) === r && this._shapePromises.delete(n);
      }
      if (this._shapeCache.size > this._shapeCacheSize) {
        const s = [...this._shapeCache.entries()].filter(([a]) => a !== n).sort((a, u) => a[1].lastUsed - u[1].lastUsed)[0];
        s && (this._shapeCache.delete(s[0]), this._retireExecution(s[1]));
      }
    }
    return o.lastUsed = ++this._clock, o;
  }
  /** Compiles common tile shapes while the host still reports model loading. */
  async prewarm(t) {
    for (const e of t)
      await this._execution(e.width, e.height);
  }
  async execute(t, e, n) {
    const o = this._model.inputChannels / 3;
    if (t.length !== o)
      throw new Error(
        `OIDN WebNN expected ${o} input buffers, got ${t.length}`
      );
    const r = await this._execution(e, n), s = this._resources.track(
      "gpu-buffer",
      await this._context.exportToGPU(r.inputTensor)
    );
    try {
      const u = t.map(
        (f, d) => ({ binding: d, resource: { buffer: f } })
      );
      u.push({
        binding: o,
        resource: { buffer: s }
      }), u.push({
        binding: o + 1,
        resource: { buffer: r.inputUniform }
      });
      const l = this._device.createBindGroup({
        label: "oidn/webnn/input-bindings",
        layout: this._inputPipeline.getBindGroupLayout(0),
        entries: u
      }), p = this._device.createCommandEncoder({
        label: "oidn/webnn/input-pack"
      }), c = p.beginComputePass();
      c.setPipeline(this._inputPipeline), c.setBindGroup(0, l), c.dispatchWorkgroups(
        Math.ceil(e / ht),
        Math.ceil(n / ht),
        this._model.inputChannels
      ), c.end(), this._device.queue.submit([p.finish()]);
    } finally {
      this._releaseBuffer(s);
    }
    this._context.dispatch(
      r.graph,
      { input: r.inputTensor },
      { output: r.outputTensor }
    );
    const a = this._resources.track(
      "gpu-buffer",
      await this._context.exportToGPU(r.outputTensor)
    );
    try {
      const u = this._device.createBindGroup({
        label: "oidn/webnn/output-bindings",
        layout: this._outputPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: a } },
          { binding: 1, resource: { buffer: r.outputBuffer } },
          { binding: 2, resource: { buffer: r.outputUniform } }
        ]
      }), l = this._device.createCommandEncoder({
        label: "oidn/webnn/output-unpack"
      }), p = l.beginComputePass();
      p.setPipeline(this._outputPipeline), p.setBindGroup(0, u), p.dispatchWorkgroups(
        Math.ceil(e / ht),
        Math.ceil(n / ht)
      ), p.end(), this._device.queue.submit([l.finish()]);
    } finally {
      this._releaseBuffer(a);
    }
    return r.outputBuffer;
  }
  async executeCPU(t, e, n) {
    const o = await this._execution(e, n), r = e * n, s = new I(r * this._model.inputChannels);
    for (let l = 0; l < r; l++)
      for (let p = 0; p < this._model.inputChannels; p++)
        s[p * r + l] = t[l * this._model.inputChannels + p];
    this._context.writeTensor(o.inputTensor, s), this._context.dispatch(
      o.graph,
      { input: o.inputTensor },
      { output: o.outputTensor }
    );
    const a = new I(
      await this._context.readTensor(o.outputTensor)
    ), u = new Float32Array(r * this._model.outputChannels);
    for (let l = 0; l < r; l++)
      for (let p = 0; p < this._model.outputChannels; p++)
        u[l * this._model.outputChannels + p] = a[p * r + l];
    return u;
  }
  _destroyExecution(t) {
    this._releaseGraph(t.graph), this._releaseTensor(t.inputTensor), this._releaseTensor(t.outputTensor), this._releaseBuffer(t.outputBuffer), this._releaseBuffer(t.inputUniform), this._releaseBuffer(t.outputUniform);
  }
  _retireExecution(t) {
    this._retiredExecutions.add(t), this._device.queue.onSubmittedWorkDone().catch(() => {
    }).then(() => {
      this._retiredExecutions.delete(t), this._destroyExecution(t);
    });
  }
  _releaseBuffer(t) {
    this._resources.release("gpu-buffer", t, () => t.destroy());
  }
  _releaseTensor(t) {
    this._resources.release("ml-tensor", t, () => t.destroy());
  }
  _releaseGraph(t) {
    this._resources.release("ml-graph", t, () => {
      var e;
      return (e = t.destroy) == null ? void 0 : e.call(t);
    });
  }
  _releaseContext() {
    this._resources.release(
      "ml-context",
      this._context,
      () => {
        var t, e;
        return (e = (t = this._context).destroy) == null ? void 0 : e.call(t);
      }
    );
  }
  getResourceInfo() {
    return this._resources.snapshot(
      this._pendingCreationCount + this._retiredExecutions.size
    );
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = !0;
      for (const t of this._shapeCache.values())
        this._destroyExecution(t);
      this._shapeCache.clear();
      for (const t of this._retiredExecutions)
        this._destroyExecution(t);
      this._retiredExecutions.clear(), this._shapePromises.clear(), this._releaseContext();
    }
  }
}
function cn(i, t) {
  return Math.ceil(i / t) * t;
}
function Gt(i) {
  return i.data instanceof GPUBuffer || i.data instanceof GPUTexture;
}
class Lr {
  constructor(t, e, n = {}) {
    g(this, "_device");
    // TODO calculate the tile size from memory size
    // https://github.com/RenderKit/oidn/blob/713ec7838ba650f99e0a896549c0dca5eeb3652d/core/unet_filter.cpp#L287
    g(this, "_tileWidth", 0);
    g(this, "_tileHeight", 0);
    g(this, "_tileOverlapX", 0);
    g(this, "_tileOverlapY", 0);
    g(this, "_aux");
    g(this, "_hdr");
    g(this, "_dataProcessGPU");
    g(this, "_nativeExecutor");
    g(this, "_webNNExecutor");
    g(this, "_modelSpec");
    g(this, "_inputChannels");
    g(this, "_engine");
    g(this, "_dynamicTileController");
    g(this, "_lastExecution");
    this._aux = n.aux || !1, this._hdr = n.hdr || !1, this._engine = n.engine ?? "auto";
    const o = n.modelSpec ?? wn(t), r = mi(t, o);
    this._modelSpec = r.spec, this._inputChannels = r.inputChannels;
    const s = this._aux ? 9 : 3;
    if (r.inputChannels !== s)
      throw new Error(
        `OIDN model expects ${r.inputChannels} input channels, but aux=${this._aux} provides ${s}`
      );
    this._dynamicTileController = new di(
      n.maxTileSize ?? 512,
      n.dynamicTile
    ), this._device = e.device, this._engine === "webnn" ? this._webNNExecutor = new Wr(
      this._device,
      r,
      { precision: n.precision }
    ) : this._nativeExecutor = new Er(
      this._device,
      r,
      { precision: n.precision, kernel: n.kernel }
    );
  }
  getDevice() {
    return this._device;
  }
  /** Completes backend compilation before first interactive use. */
  async prepare() {
    if (this._webNNExecutor) {
      await this._webNNExecutor.prepare();
      const t = cn(
        this._modelSpec.receptiveField / 2,
        nt
      ), e = [
        this._dynamicTileController.tileSize,
        this._dynamicTileController.minTileSize
      ];
      await this._webNNExecutor.prewarm(
        [...new Set(e)].map((n) => ({
          width: n + 2 * t,
          height: n + 2 * t
        }))
      );
      return;
    }
    await this._nativeExecutor.prepare();
  }
  getRuntimeInfo() {
    var t;
    return {
      configuredEngine: this._engine,
      gpuEngine: this._webNNExecutor ? "webnn" : "wgsl",
      precision: (this._webNNExecutor ?? this._nativeExecutor).precision,
      kernel: this._nativeExecutor ? {
        configured: this._nativeExecutor.kernelSetting,
        maxSpatialInputBlocks: this._nativeExecutor.maxSpatialInputBlocks,
        subgroupsAvailable: this._nativeExecutor.subgroupsAvailable
      } : void 0,
      webnn: (t = this._webNNExecutor) == null ? void 0 : t.support,
      resources: (this._webNNExecutor ?? this._nativeExecutor).getResourceInfo(),
      model: this._modelSpec.id,
      modelFamily: this._modelSpec.family,
      inputChannels: this._inputChannels,
      dynamicTile: {
        enabled: this._dynamicTileController.enabled,
        currentTileSize: this._dynamicTileController.tileSize,
        minTileSize: this._dynamicTileController.minTileSize,
        maxTileSize: this._dynamicTileController.maxTileSize,
        targetTileTimeMs: this._dynamicTileController.targetTileTimeMs
      },
      lastExecution: this._lastExecution
    };
  }
  /** Captures per-node GPU timestamps for the next native tile execution. */
  profileNextExecution() {
    var t;
    return ((t = this._nativeExecutor) == null ? void 0 : t.profileNextExecution()) ?? !1;
  }
  getLastExecutionProfile() {
    var t;
    return (t = this._nativeExecutor) == null ? void 0 : t.getLastExecutionProfile();
  }
  _updateModel(t, e) {
    const n = this._dynamicTileController.tileSize;
    let o = Me(t, n), r = Me(e, n);
    const s = cn(
      this._modelSpec.receptiveField / 2,
      nt
    );
    let a = s, u = s;
    t <= n && (a = 0), e <= n && (u = 0);
    const l = Math.max(o, r), p = Math.max(a, u);
    o = l, r = l, a = p, u = p, (o !== this._tileWidth || r !== this._tileHeight || a !== this._tileOverlapX || u !== this._tileOverlapY) && (this._tileWidth = o, this._tileHeight = r, this._tileOverlapX = a, this._tileOverlapY = u);
  }
  _getTileSizeWithOverlap() {
    return {
      width: this._tileWidth + 2 * this._tileOverlapX,
      height: this._tileHeight + 2 * this._tileOverlapY
    };
  }
  _processImageData(t, e, n, o) {
    const r = t.data, s = r.length / 4, a = this._aux ? 9 : 3, u = new Float32Array(s * a);
    if (e && !n || n && !e)
      throw new Error("Normal map and albedo map are both required");
    if (e && n && (e.width !== n.width || e.height !== n.height || t.width !== e.width || t.height !== e.height))
      throw new Error("Image size mismatch");
    const l = e == null ? void 0 : e.data, p = n == null ? void 0 : n.data;
    for (let c = 0; c < r.length; c += 4) {
      const f = c / 4 * a;
      for (let d = 0; d < 3; d++)
        o ? u[f + d] = r[c + d] : u[f + d] = r[c + d] / 255, l && (u[f + d + 3] = l[c + d] / 255), p && (u[f + d + 6] = p[c + d] / 255);
    }
    return u;
  }
  _readTile(t, e, n, o) {
    const r = new Float32Array(
      n.width * n.height * e
    );
    for (let s = 0; s < n.height; s++)
      for (let a = 0; a < n.width; a++) {
        const u = ((s + n.y) * o + (a + n.x)) * e, l = (s * n.width + a) * e;
        for (let p = 0; p < e; p++)
          r[l + p] = t[u + p];
      }
    return r;
  }
  _writeTile(t, e, n, o, r, s) {
    const { data: a, width: u } = t, l = n.x - e.x, p = n.y - e.y;
    for (let c = 0; c < n.height; c++)
      for (let f = 0; f < n.width; f++) {
        const d = ((c + p) * r + f + l) * 3, h = ((c + n.y) * u + (f + n.x)) * 4;
        for (let _ = 0; _ < 3; _++)
          s ? a[h + _] = o[d + _] : a[h + _] = Math.min(
            Math.max(o[d + _] * 255, 0),
            255
          );
        t.data[h + 3] = s ? 1 : 255;
      }
  }
  async _executeTile(t, e, n, o, r, s, a, u, l) {
    const p = this._aux ? 9 : 3, c = this._tileOverlapX, f = this._tileOverlapY;
    let d = this._getTileSizeWithOverlap(), h = { width: this._tileWidth, height: this._tileHeight }, _ = o > 0 ? o * h.width - c : 0, y = Math.min(_ + d.width, s);
    _ = Math.max(y - d.width, 0);
    let x = r > 0 ? r * h.height - f : 0, m = Math.min(x + d.height, a);
    x = Math.max(m - d.height, 0);
    const b = d.width, O = d.height, W = new ne(_, x, b, O);
    let H, L, N = 1;
    const X = this._device;
    let B = this._dataProcessGPU;
    if (t instanceof Float32Array) {
      let R = this._readTile(t, p, W, s);
      u && (N = ii({
        data: R,
        channels: p
      }), R = ri({
        data: R,
        channels: p,
        inputScale: N
      })), L = await (this._webNNExecutor ?? this._nativeExecutor).executeCPU(
        R,
        b,
        O
      );
    } else {
      B || (B = this._dataProcessGPU = new si(
        X,
        u
      )), B.setImageSize(s, a), B.setInputTile(W), o === 0 && r === 0 && B.copyInputDataToOutput(t.color);
      const { color: R, albedo: lt, normal: V } = B.forward(
        t.color,
        this._aux ? t.albedo : void 0,
        this._aux ? t.normal : void 0,
        l
      );
      H = await (this._webNNExecutor ?? this._nativeExecutor).execute(
        this._aux ? [R, lt, V] : [R],
        b,
        O
      );
    }
    let E;
    const at = Math.min(h.width, s), M = Math.min(h.height, a), A = new ne(o * at, r * M, at, M);
    if (A.width = Math.min(A.width, s - A.x), A.height = Math.min(A.height, a - A.y), t instanceof Float32Array) {
      u && (L = oi({
        data: L,
        channels: 3,
        inputScale: N
      })), this._writeTile(
        n,
        W,
        A,
        L,
        d.width,
        u
      );
      for (let R = 0; R < M; R++)
        for (let lt = 0; lt < at; lt++) {
          const V = (R * at + lt) * 4, Pt = ((R + A.y) * s + (lt + A.x)) * 4;
          for (let vt = 0; vt < 4; vt++)
            e.data[V + vt] = n.data[Pt + vt];
        }
    } else
      B.setOutputTile(A, W), E = B.inverse(
        H,
        t.color
      );
    return E;
  }
  tileExecute({
    color: t,
    albedo: e,
    normal: n,
    done: o,
    progress: r,
    denoiseAlpha: s
  }) {
    if (this._aux && (!e || !n))
      throw new Error("Normal map and albedo map are both required");
    if (!this._aux && (e || n))
      throw new Error("Normal map and albedo map are not required");
    const a = t.width, u = t.height, l = this._dynamicTileController.tileSize, p = a > l || u > l;
    this._updateModel(a, u);
    const c = this._hdr || !1;
    let f;
    Gt(t) || (f = this._processImageData(
      t,
      e,
      n,
      c
    ));
    const d = this._tileWidth, h = this._tileHeight, _ = Math.ceil(u / h), y = Math.ceil(a / d);
    function x(B, E) {
      return c ? {
        data: new Float32Array(B * E * 4),
        width: B,
        height: E
      } : new ImageData(B, E);
    }
    const m = Gt(t) ? void 0 : x(a, u), b = Gt(t) ? void 0 : x(Math.min(d, a), Math.min(h, u));
    let O = !1;
    const W = () => typeof performance > "u" ? Date.now() : performance.now(), H = W(), L = [], N = (B) => {
      typeof requestAnimationFrame > "u" ? setTimeout(B, 0) : requestAnimationFrame(B);
    }, X = async (B, E) => {
      if (O)
        return;
      const at = W(), M = await this._executeTile(
        Gt(t) ? {
          color: t.data,
          albedo: e == null ? void 0 : e.data,
          normal: n == null ? void 0 : n.data
        } : f,
        b,
        m,
        B,
        E,
        a,
        u,
        c,
        s
      );
      if (O) return;
      const A = m || {
        data: M,
        width: a,
        height: u
      };
      r == null || r(
        A,
        // Is undefined if using webgpu buffer
        b,
        new ne(B * d, E * h, d, h),
        B + E * y,
        y * _
      );
      const R = B + 1 < y || E + 1 < _, lt = () => {
        if (L.push(W() - at), !O)
          if (R)
            N(() => {
              O || (B + 1 < y ? X(B + 1, E) : E + 1 < _ && X(0, E + 1));
            });
          else {
            const V = [...L].sort((te, ee) => te - ee), Pt = Math.floor(V.length / 2), vt = V.length % 2 ? V[Pt] : (V[Pt - 1] + V[Pt]) / 2;
            this._lastExecution = {
              width: a,
              height: u,
              tileWidth: d,
              tileHeight: h,
              tileCount: y * _,
              durationMs: W() - H,
              tileTimeMs: {
                min: V[0],
                median: vt,
                mean: V.reduce((te, ee) => te + ee, 0) / V.length,
                max: V[V.length - 1]
              }
            }, p && this._dynamicTileController.observe(L), o(A);
          }
      };
      hi(this._device.queue).then(
        lt
      );
    };
    return X(0, 0), () => {
      O = !0;
    };
  }
  dispose() {
    var t, e, n;
    (t = this._dataProcessGPU) == null || t.dispose(), (e = this._nativeExecutor) == null || e.dispose(), (n = this._webNNExecutor) == null || n.dispose();
  }
}
async function Rr() {
  var a;
  if (!navigator.gpu) throw new Error("WebGPU is not available");
  const i = {
    powerPreference: "high-performance"
  }, t = await navigator.gpu.requestAdapter(i);
  if (!t) throw new Error("No WebGPU adapter is available");
  const e = {}, n = [];
  t.features.has("timestamp-query") && n.push("timestamp-query"), t.features.has("bgra8unorm-storage") && n.push("bgra8unorm-storage"), t.features.has("shader-f16") && n.push("shader-f16"), e.requiredFeatures = n;
  const o = t.limits;
  e.requiredLimits = {
    maxComputeWorkgroupStorageSize: o.maxComputeWorkgroupStorageSize,
    maxComputeWorkgroupsPerDimension: o.maxComputeWorkgroupsPerDimension,
    maxStorageBufferBindingSize: o.maxStorageBufferBindingSize,
    maxBufferSize: o.maxBufferSize,
    maxComputeWorkgroupSizeX: o.maxComputeWorkgroupSizeX,
    maxComputeInvocationsPerWorkgroup: o.maxComputeInvocationsPerWorkgroup
  };
  const r = await t.requestDevice(e), s = (
    // requestAdapterInfo is deprecated
    // @ts-ignore
    t.info ?? await ((a = t.requestAdapterInfo) == null ? void 0 : a.call(t))
  );
  return Vn(r, s);
}
async function Vn(i, t) {
  return { device: i, adapterInfo: t };
}
async function Gr(i, t, e) {
  const n = await (t ? Vn(
    t.device,
    t.adapterInfo
  ) : Rr()), o = Zn(i), r = new Lr(o, n, e);
  return await r.prepare(), r;
}
async function Fr(i, t, e) {
  return fetch(i).then((n) => n.arrayBuffer()).then((n) => Gr(n, t, e));
}
export {
  Er as NativeUNetExecutor,
  _i as OIDN_UNET_LARGE_SPEC,
  gi as OIDN_UNET_SMALL_SPEC,
  Lr as UNet,
  Wr as WebNNUNetExecutor,
  wn as detectUNetModelSpec,
  Gr as initUNetFromBuffer,
  Fr as initUNetFromURL,
  ye as optimizeModelGraph,
  Zn as parseTZA,
  hr as planModelExecution,
  Sr as resolveNativeUNetPrecision,
  mi as validateUNetModel
};
