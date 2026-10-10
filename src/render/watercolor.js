// The watercolor composite: four painted layers in, one sketchbook page out.
import { createProgram, createTexture, createTarget, deleteTarget, uploadCanvas, FULLSCREEN_VS } from './gl.js';

const NOISE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
uniform vec2 uRes;
uniform float uSeed;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = r * p * 2.07 + 5.3; a *= 0.5; }
  return s;
}
void main() {
  vec2 pp = vUv * uRes;
  float pLow = fbm(pp * 0.018);
  float pHi = vnoise(pp * 0.55) * 0.6 + vnoise(pp * 1.3) * 0.4;
  vec2 fp = mat2(0.94, 0.34, -0.34, 0.94) * pp;
  float fib = smoothstep(0.72, 0.98, vnoise(vec2(fp.x * 0.05, fp.y * 0.9))) * 0.6
            + smoothstep(0.8, 1.0, vnoise(vec2(fp.x * 0.9, fp.y * 0.04) + 31.0)) * 0.4;
  float turb = fbm(pp * 0.0032 + 7.0);
  outA = vec4(pLow, pHi, fib, turb);
  vec2 wob = vec2(fbm3(pp * 0.008), fbm3(pp * 0.008 + 19.1));
  vec2 bd = vec2(fbm3(pp * 0.02 + 3.0), fbm3(pp * 0.02 + 9.0));
  outB = vec4(wob, bd);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPaint;   // opaque washes (mipmapped)
uniform sampler2D uInk;     // linework + handwriting, straight alpha
uniform sampler2D uLight;   // additive light on black (mipmapped)
uniform sampler2D uMask;    // r water, g haar weight, b granulation boost
uniform sampler2D uPrev;    // snapshot for transitions
uniform sampler2D uNoiseA;  // static paper: pLow, pHi, fibre, turbulence
uniform sampler2D uNoiseB;  // static wobble (rg) + bleed displacement (ba)

uniform vec2 uRes;          // css px
uniform float uTime;
uniform float uWarmth, uSat, uPaperShow, uBleed, uFog, uWobble, uGran, uEdge, uInkSpread;
uniform vec3 uFogColor;
uniform vec2 uWind;
uniform vec4 uMargin;       // painted rect in uv (x0,y0,x1,y1), y up
uniform float uTrans;       // 0..1 bloom from prev to current; >=1 done
uniform vec2 uTransCenter;
uniform float uWhite;       // 0..1 bleed to blank paper
uniform vec2 uWhiteCenter;
uniform vec4 uCloak;        // manannan's cloak (uv x,y, rx, ry)
uniform float uCloakAmt;
uniform vec4 uClear;        // a hole in the haar (uv x,y, rx, ry)
uniform float uClearAmt;
uniform float uSeed;
uniform float uLightGain;
uniform float uInkOut;     // 1: ink on the bare paper outside the painting still shows

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = r * p * 2.07 + 5.3; a *= 0.5; }
  return s;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Bousseau et al.: pigment density modulation
vec3 density(vec3 c, float d) { return c - (c - c * c) * (d - 1.0); }

const vec3 PAPER = vec3(0.949, 0.918, 0.851);

void main() {
  vec2 px = vUv * uRes;                 // css px, y up
  vec2 pp = px;                          // paper space
  float aspect = uRes.x / uRes.y;

  // ---- paper ----
  vec4 nA = texture(uNoiseA, vUv);
  vec4 nB = texture(uNoiseB, vUv);
  float pLow = nA.r, pHi = nA.g, fib = nA.b;
  float paperH = clamp(pLow * 0.55 + pHi * 0.45, 0.0, 1.0);
  vec3 paperCol = PAPER * (0.94 + 0.11 * paperH) - fib * 0.03 + vec3(0.012, 0.007, 0.0) * (pLow - 0.5);

  vec4 msk = texture(uMask, vUv);
  float water = msk.r;

  // ---- wobble: static wobble everywhere, gentle animation on water ----
  vec2 wob = (nB.rg - 0.5) * uWobble;
  vec2 wav = vec2(0.0);
  if (water > 0.01) {
    float rip = sin(px.y * 0.22 + uTime * 0.9 + vnoise(pp * vec2(0.01, 0.05) + uTime * 0.05) * 6.0);
    wav = vec2(rip * 2.4 + (vnoise(pp * vec2(0.004, 0.03) + vec2(uTime * 0.04, 0.0)) - 0.5) * 6.0, rip * 0.4) * water;
  }
  vec2 uvP = vUv + (wob + wav) / uRes;

  // ---- pigment ----
  vec3 paint = texture(uPaint, uvP).rgb;
  vec3 blur = textureLod(uPaint, uvP, 2.6).rgb;
  vec3 blur2 = textureLod(uPaint, uvP, 4.2).rgb;

  // bleed: washes soften and creep outward past their lines
  vec2 bd = (nB.ba - 0.5) * 14.0 * uBleed / uRes;
  vec3 bleedC = textureLod(uPaint, uvP + bd, 1.5 + uBleed * 1.8).rgb;
  paint = mix(paint, bleedC, uBleed * 0.55);

  // edge darkening: pigment pools at the boundary of each wash
  float e = max(0.0, lum(blur) - lum(paint)) * 2.2 + length(blur - paint) * 0.55
          + max(0.0, lum(blur2) - lum(paint)) * 0.6;
  float edgeD = 1.0 + uEdge * 1.25 * clamp(e, 0.0, 0.6) * (0.75 + 0.5 * pHi);
  paint = density(paint, edgeD);

  // low frequency turbulence: uneven pigment within washes
  float turb = nA.a;
  paint = density(paint, 1.0 + (turb - 0.5) * 0.5);
  // pigment drifts warmer and cooler across a wash
  paint *= mix(vec3(1.025, 1.0, 0.965), vec3(0.97, 0.995, 1.035), smoothstep(0.3, 0.7, nB.b));

  // granulation: pigment settles in the valleys of the paper, more in heavier washes
  float L = lum(paint);
  float gran = (vnoise(pp * 0.42) * 0.5 + (1.0 - paperH) * 0.7) - 0.6;
  paint = density(paint, 1.0 + gran * uGran * (0.45 + msk.b * 0.9) * (1.15 - L));

  // sit the paint on the paper
  vec3 col = paint * (paperCol / PAPER);
  float show = uPaperShow * (0.25 + 0.75 * smoothstep(0.35, 0.95, L));
  col = mix(col, paperCol, clamp(show * (0.6 + 0.4 * pLow), 0.0, 0.92));

  // ---- haar ----
  float fogD = 0.0;
  float f2 = 0.5;
  if (uFog > 0.001 || uCloakAmt > 0.001) {
    // banks: wide and low (stretched across the screen), with thinner places between them
    vec2 fogP = pp * vec2(0.0016, 0.0044);
    float f1 = fbm(fogP + uWind * uTime * 0.018);
    f2 = fbm3(fogP * 2.3 - uWind.yx * uTime * 0.011 + 4.0);
    float wisp = vnoise(pp * vec2(0.0035, 0.03) + vec2(uTime * 0.05, 0.0));
    float fogW = mix(0.35, 1.0, msk.g);
    float bank = smoothstep(0.36, 0.8, f1 * 0.72 + f2 * 0.42 + wisp * 0.12);
    fogD = uFog * fogW * clamp(0.2 + 0.95 * bank, 0.0, 1.0);
    if (uCloakAmt > 0.001) {
      // the cloak: mist that moves against the wind
      vec2 cd = (vUv - uCloak.xy) / max(uCloak.zw, vec2(1e-4));
      float cloakShape = exp(-dot(cd, cd) * 1.4);
      float cf = fbm3(pp * 0.009 - uWind * uTime * 0.06 + vec2(0.0, uTime * 0.03));
      fogD = max(fogD, uCloakAmt * cloakShape * clamp(0.25 + cf * 1.1, 0.0, 1.0));
    }
    if (uClearAmt > 0.001) {
      // a parting in the mist
      vec2 kd = (vUv - uClear.xy) / max(uClear.zw, vec2(1e-4));
      float hole = exp(-dot(kd, kd) * 1.6) * (0.7 + 0.5 * vnoise(pp * 0.01 + uTime * 0.02));
      fogD *= 1.0 - clamp(uClearAmt * hole, 0.0, 1.0);
    }
    fogD = clamp(fogD, 0.0, 0.97);
  }
  vec3 fogCol = uFogColor * (0.96 + 0.08 * f2) * (paperCol / PAPER);
  col = mix(col, fogCol, fogD);

  // ---- ink ----
  vec4 ink = texture(uInk, vUv + wob * 0.12 / uRes);
  float brk = smoothstep(0.66, 0.9, vnoise(pp * 0.28 + 3.0)) * 0.35;
  float inkA = ink.a * (0.88 + 0.16 * (1.0 - paperH)) * (1.0 - brk);
  inkA *= 1.0 - fogD * 0.55;
  vec3 inkCol = ink.rgb * mix(vec3(1.0), col, 0.3);
  col = mix(col, inkCol, clamp(inkA, 0.0, 1.0));
  // in later acts the washes creep over the lines
  vec3 creep = textureLod(uPaint, uvP + bd * 1.6, 3.0).rgb;
  col = mix(col, col * mix(vec3(1.0), creep / max(vec3(0.2), blur), 0.5), uInkSpread * ink.a * 0.5);

  // ---- light glaze ----
  vec3 l0 = texture(uLight, vUv).rgb;
  vec3 l1 = textureLod(uLight, vUv, 3.0).rgb;
  vec3 l2 = textureLod(uLight, vUv, 5.5).rgb;
  vec3 glow = l0 * (1.0 - fogD * 0.6) + l1 * (0.3 + fogD * 0.6) + l2 * (0.22 + fogD * 1.6);
  glow *= uLightGain * (0.92 + 0.12 * paperH);
  col = 1.0 - (1.0 - col) * (1.0 - clamp(glow, 0.0, 1.0));

  // ---- grading ----
  float g = lum(col);
  col = mix(vec3(g), col, uSat);
  col *= vec3(1.0 + uWarmth * 0.07, 1.0 + uWarmth * 0.012, 1.0 - uWarmth * 0.085);

  // ---- ragged unpainted margin ----
  vec2 m0 = (vUv - uMargin.xy) * uRes, m1 = (uMargin.zw - vUv) * uRes;
  float dEdge = min(min(m0.x, m1.x), min(m0.y, m1.y));
  float along = (min(m0.x, m1.x) < min(m0.y, m1.y)) ? px.y : px.x;
  float rag = (vnoise(vec2(along * 0.035, 3.0)) * 0.65 + vnoise(vec2(along * 0.09, dEdge * 0.02)) * 0.35) * 22.0 + vnoise(vec2(along * 0.3, 1.0)) * 4.0;
  float inside = smoothstep(0.0, 2.5, dEdge - rag);
  float rim = smoothstep(0.0, 3.0, dEdge - rag) * (1.0 - smoothstep(3.0, 18.0, dEdge - rag));
  col = density(col, 1.0 + rim * 0.22);
  col = mix(paperCol, col, inside);
  // ink written on the bare paper outside the painting still shows
  col = mix(col, ink.rgb * mix(vec3(1.0), paperCol, 0.3), clamp(inkA, 0.0, 1.0) * (1.0 - inside) * uInkOut);

  // ---- vignette + grain ----
  vec2 vq = (vUv - 0.5) * vec2(aspect, 1.0);
  col *= mix(0.86, 1.0, smoothstep(1.05, 0.25, length(vq)));
  float gt = floor(uTime * 8.0);
  col += (hash(px + gt) - 0.5) * 0.028;

  // ---- transitions: blooms with cauliflower edges ----
  if (uTrans < 1.0) {
    vec3 prev = texture(uPrev, vUv).rgb;
    vec2 tq = (vUv - uTransCenter) * vec2(aspect, 1.0);
    float n = fbm(vUv * 5.0 + 1.3) * 0.32 + fbm(vUv * 22.0) * 0.07;
    float front = uTrans * 2.05 - 0.15;
    float rv = smoothstep(front, front - 0.06, length(tq) + n);
    float trim = 1.0 - abs(rv * 2.0 - 1.0);
    col = mix(prev, col, rv);
    col = density(col, 1.0 + trim * 0.25);
  }
  if (uWhite > 0.0) {
    vec2 tq = (vUv - uWhiteCenter) * vec2(aspect, 1.0);
    float n = fbm(vUv * 4.0 + 7.7) * 0.35 + fbm(vUv * 18.0) * 0.08;
    float front = uWhite * 2.2 - 0.2;
    float wv = smoothstep(front, front - 0.12, length(tq) + n);
    float trim = 1.0 - abs(wv * 2.0 - 1.0);
    col = density(col, 1.0 + trim * 0.18 * (1.0 - uWhite));
    col = mix(col, paperCol, wv);
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Watercolor {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, FULLSCREEN_VS, FS);
    this.vao = gl.createVertexArray();
    this.tex = {
      paint: createTexture(gl, { mipmap: true }),
      ink: createTexture(gl),
      light: createTexture(gl, { mipmap: true }),
      mask: createTexture(gl),
    };
    this.noiseProg = createProgram(gl, FULLSCREEN_VS, NOISE_FS);
    this.noise = null;
    this.target = null;
    this.prev = null;
    this.hasPrev = false;
    this.u = {
      warmth: 0.4, sat: 1.0, paperShow: 0.1, bleed: 0.0, fog: 0.0, wobble: 3.0, gran: 0.7, edge: 1.0,
      inkSpread: 0.0, fogColor: [0.86, 0.86, 0.84], wind: [1, 0.15], lightGain: 1.0, inkOut: 0.0,
      trans: 1.0, transCenter: [0.5, 0.5], white: 0.0, whiteCenter: [0.5, 0.5],
      margin: [0.012, 0.016, 0.988, 0.984],
      cloak: [0.5, 0.5, 0.05, 0.2], cloakAmt: 0, clear: [0.5, 0.5, 0.1, 0.1], clearAmt: 0,
      seed: Math.random() * 10,
    };
  }

  resize(w, h, cssW, cssH) {
    const gl = this.gl;
    this.cssW = cssW; this.cssH = cssH;
    if (this.target && this.target.w === w && this.target.h === h) { this.buildNoise(w, h); return; }
    deleteTarget(gl, this.target);
    deleteTarget(gl, this.prev);
    this.target = createTarget(gl, w, h);
    this.prev = createTarget(gl, w, h);
    this.hasPrev = false;
    this.buildNoise(w, h);
  }

  // Static paper + wobble noise, computed once per size (two targets via MRT).
  buildNoise(w, h) {
    const gl = this.gl;
    if (this.noise) { deleteTarget(gl, this.noise.a); deleteTarget(gl, this.noise.b); gl.deleteFramebuffer(this.noise.fb); }
    const a = createTarget(gl, w, h), b = createTarget(gl, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a.tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b.tex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, w, h);
    const { program, uniforms: U } = this.noiseProg;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(U.uRes, this.cssW || w, this.cssH || h);
    gl.uniform1f(U.uSeed, this.u.seed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.noise = { a, b, fb };
  }

  upload(layers) {
    const gl = this.gl;
    for (const k of ['paint', 'ink', 'light', 'mask']) {
      if (layers.dirty[k]) { uploadCanvas(gl, this.tex[k], layers.canvas[k]); layers.dirty[k] = false; }
    }
  }

  // Copy the last rendered frame so a transition can bloom from it.
  snapshot() {
    const gl = this.gl;
    if (!this.target) return;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.target.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.prev.fb);
    gl.blitFramebuffer(0, 0, this.target.w, this.target.h, 0, 0, this.prev.w, this.prev.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    this.hasPrev = true;
  }

  render(cssW, cssH, time) {
    const gl = this.gl, { program, uniforms: U } = this.prog, u = this.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fb);
    gl.viewport(0, 0, this.target.w, this.target.h);
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    const bind = (name, tex, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U[name], unit);
    };
    bind('uPaint', this.tex.paint.tex, 0);
    bind('uInk', this.tex.ink.tex, 1);
    bind('uLight', this.tex.light.tex, 2);
    bind('uMask', this.tex.mask.tex, 3);
    bind('uPrev', this.prev.tex, 4);
    bind('uNoiseA', this.noise.a.tex, 5);
    bind('uNoiseB', this.noise.b.tex, 6);
    gl.uniform2f(U.uRes, cssW, cssH);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uWarmth, u.warmth);
    gl.uniform1f(U.uSat, u.sat);
    gl.uniform1f(U.uPaperShow, u.paperShow);
    gl.uniform1f(U.uBleed, u.bleed);
    gl.uniform1f(U.uFog, u.fog);
    gl.uniform1f(U.uWobble, u.wobble);
    gl.uniform1f(U.uGran, u.gran);
    gl.uniform1f(U.uEdge, u.edge);
    gl.uniform1f(U.uInkSpread, u.inkSpread);
    gl.uniform1f(U.uLightGain, u.lightGain);
    gl.uniform1f(U.uInkOut, u.inkOut);
    gl.uniform3fv(U.uFogColor, u.fogColor);
    gl.uniform2fv(U.uWind, u.wind);
    gl.uniform4fv(U.uMargin, u.margin);
    gl.uniform1f(U.uTrans, this.hasPrev ? u.trans : 1.0);
    gl.uniform2fv(U.uTransCenter, u.transCenter);
    gl.uniform1f(U.uWhite, u.white);
    gl.uniform2fv(U.uWhiteCenter, u.whiteCenter);
    gl.uniform4fv(U.uCloak, u.cloak);
    gl.uniform1f(U.uCloakAmt, u.cloakAmt);
    gl.uniform4fv(U.uClear, u.clear);
    gl.uniform1f(U.uClearAmt, u.clearAmt);
    gl.uniform1f(U.uSeed, u.seed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // present
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.target.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.target.w, this.target.h, 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }
}
