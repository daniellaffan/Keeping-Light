// three.js renders the world into the watercolor's four layers in one MRT pass, sharing the game's
// WebGL2 context. A raw compose pass then turns depth into ink (silhouettes heavier than creases,
// wobbled and broken by noise fixed to the surfaces), pools a little pigment at depth edges, and lays
// the 2D canvas layers (lettering, panels, the HUD) over the top. Its four outputs go straight into
// Watercolor.render as GPU textures.
import * as THREE from 'three';
import { createProgram, createTexture, uploadCanvas, rawState, FULLSCREEN_VS } from '../render/gl.js';
import { NOISE_GLSL } from './materials.js';

const COMPOSE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oPaint;
layout(location = 1) out vec4 oInk;
layout(location = 2) out vec4 oLight;
layout(location = 3) out vec4 oMask;
uniform sampler2D uSPaint, uSInk, uSLight, uSMask, uDepth;
uniform sampler2D uHPaint, uHInk, uHLight, uHMask;
uniform float uHud;
uniform vec2 uRes;          // layer px
uniform float uNear, uFar;
uniform vec2 uTanHalf;      // tan(fov/2) * (aspect, 1)
uniform mat4 uCamWorld;
uniform float uPx;          // line width scale (layer px per css px)
uniform vec3 uLineCol;
uniform float uLineAmt, uCreaseAmt, uWobblePx, uBreak, uEdgeDark;
${NOISE_GLSL}

float linZ(vec2 uv) {
  float d = texture(uDepth, uv).r;
  return uNear * uFar / (uFar - d * (uFar - uNear));
}
vec3 worldAt(vec2 uv, float z) {
  vec3 v = vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z);
  return (uCamWorld * vec4(v, 1.0)).xyz;
}
// "dynamic solid" noise: world-fixed, but its frequency stays roughly constant on screen by
// blending two octaves picked from the distance (Bénard et al. 2011).
float solidNoise(vec3 w, float z, float k) {
  float s = log2(max(z, 0.05) * k);
  float i = floor(s), f = s - i;
  float sc = exp2(-i);
  float a = vn3(w * sc * 6.0);
  float b = vn3(w * sc * 3.0 + 17.0);
  return mix(a, b, f);
}

void main() {
  vec2 px = 1.0 / uRes;
  float z = linZ(vUv);
  vec3 W = worldAt(vUv, z);

  // wobble the sampling point by noise fixed to the surface
  float n1 = solidNoise(W, z, 0.35);
  float n2 = solidNoise(W + 31.7, z, 0.35);
  vec2 wob = (vec2(n1, n2) - 0.5) * uWobblePx * uPx * px;
  vec2 uv = vUv + wob;

  vec4 sp = texture(uSPaint, uv);
  vec4 sm = texture(uSMask, uv);
  float zc = linZ(uv);

  // silhouettes: this pixel is in front of something well behind it
  // line width varies along the stroke, like a brush pressing and lifting
  float press = solidNoise(W * 0.7 + 9.0, z, 0.5);
  float r1 = (0.8 + 0.7 * press) * uPx, r2 = (1.6 + 1.6 * press) * uPx;
  float zfar = 0.0, znear = 1e9, wgt = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 o = vec2(cos(a), sin(a));
    float zz1 = linZ(uv + o * r1 * px);
    float zz2 = linZ(uv + o * r2 * px);
    zfar = max(zfar, max(zz1, zz2 * 0.98 + zc * 0.02));
    znear = min(znear, min(zz1, zz2));
    // the near side carries the line; its own weight decides how heavy
    wgt = max(wgt, texture(uSPaint, uv + o * r1 * px).a);
  }
  float rel = (zfar - zc) / zc;
  float sil = smoothstep(0.035, 0.12, rel);
  float lineW = max(sp.a, wgt * 0.5);

  // creases: the Laplacian of 1/z vanishes on any plane, so it only fires where surfaces fold
  float izc = 1.0 / zc;
  float izl = 1.0 / linZ(uv - vec2(px.x, 0.0) * uPx), izr = 1.0 / linZ(uv + vec2(px.x, 0.0) * uPx);
  float izd = 1.0 / linZ(uv - vec2(0.0, px.y) * uPx), izu = 1.0 / linZ(uv + vec2(0.0, px.y) * uPx);
  float lap = abs(izl + izr + izd + izu - 4.0 * izc) / izc;
  float crease = smoothstep(0.004, 0.02, lap) * (1.0 - smoothstep(0.03, 0.08, rel)) * (1.0 - sil);

  // dry brush: the line skips where the brush ran short
  float br = solidNoise(W * 1.7 + 5.0, z, 1.3);
  float skip = smoothstep(0.3, 0.62, br);
  float silA = sil * lineW * mix(1.0, 0.35 + 0.65 * skip, uBreak) * uLineAmt;
  float crA = crease * sm.a * mix(1.0, skip * skip, min(1.0, uBreak * 1.4)) * uCreaseAmt * 0.75;
  float edgeA = clamp(max(silA, crA), 0.0, 1.0);

  // pigment pools a little on both sides of a depth step
  float step2 = clamp((zfar - znear) / zc, 0.0, 1.0);
  vec3 paint = density(sp.rgb, 1.0 + uEdgeDark * smoothstep(0.03, 0.25, step2));

  vec4 sInk = texture(uSInk, uv);
  vec4 light = texture(uSLight, vUv);
  vec4 mask = sm;

  // the surface's own lettering over the edge ink (straight alpha "over")
  vec4 ink = vec4(uLineCol, edgeA);
  float ia = sInk.a + ink.a * (1.0 - sInk.a);
  ink.rgb = ia > 0.0 ? (sInk.rgb * sInk.a + ink.rgb * ink.a * (1.0 - sInk.a)) / ia : uLineCol;
  ink.a = ia;

  if (uHud > 0.5) {
    vec4 hp = texture(uHPaint, vUv);
    vec4 hi = texture(uHInk, vUv);
    vec3 hl = texture(uHLight, vUv).rgb;
    vec4 hm = texture(uHMask, vUv);
    paint = mix(paint, hp.rgb, hp.a);
    mask = mix(mask, hm, hp.a);
    ink.a *= 1.0 - hp.a;
    float a2 = hi.a + ink.a * (1.0 - hi.a);
    ink.rgb = a2 > 0.0 ? (hi.rgb * hi.a + ink.rgb * ink.a * (1.0 - hi.a)) / a2 : ink.rgb;
    ink.a = a2;
    light.rgb = light.rgb * (1.0 - hp.a) + hl;
  }
  oPaint = vec4(paint, 1.0);
  oInk = ink;
  oLight = vec4(light.rgb, 1.0);
  oMask = vec4(mask.rgb, 1.0);
}`;

function colorTex(gl, w, h, mip) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const levels = mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export class Pipeline {
  constructor(gl, canvas) {
    this.gl = gl;
    THREE.ColorManagement.enabled = false;   // colours are the painter's sRGB hex values, as on the canvases
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.sortObjects = true;
    this.rt = null;
    this.out = null;
    this.prog = createProgram(gl, FULLSCREEN_VS, COMPOSE_FS);
    this.vao = gl.createVertexArray();
    this.hud = {
      paint: createTexture(gl), ink: createTexture(gl), light: createTexture(gl), mask: createTexture(gl),
    };
    this.u = {
      lineCol: [0.17, 0.15, 0.14], lineAmt: 1, creaseAmt: 1, wobblePx: 2.6, breakAmt: 0.6, edgeDark: 0.4,
    };
    this.w = 0; this.h = 0; this.cssPx = 1;
  }

  resize(w, h, cssPx) {
    this.cssPx = cssPx;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    if (this.rt) this.rt.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      count: 4, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, depthTexture: depth, generateMipmaps: false,
    });
    for (const t of this.rt.textures) { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; }
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    const gl = this.gl;
    if (this.out) {
      for (const k of ['paint', 'ink', 'light', 'mask']) gl.deleteTexture(this.out[k]);
      gl.deleteFramebuffer(this.out.fb);
    }
    const out = {
      paint: colorTex(gl, w, h, true), ink: colorTex(gl, w, h, false),
      light: colorTex(gl, w, h, true), mask: colorTex(gl, w, h, false),
    };
    out.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    ['paint', 'ink', 'light', 'mask'].forEach((k, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, out[k], 0));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.out = out;
    this.renderer.resetState();
  }

  // Render `scene` through `camera` into the four layers; `hud` (a Layers) is laid over if given.
  render(scene, camera, hud = null) {
    const r = this.renderer, gl = this.gl;
    r.resetState();
    r.setRenderTarget(this.rt);
    r.clear(true, true, true);
    r.render(scene, camera);
    r.setRenderTarget(null);

    const props = r.properties;
    const tex = this.rt.textures.map((t) => props.get(t).__webglTexture);
    const depthTex = props.get(this.rt.depthTexture).__webglTexture;

    rawState(gl);
    if (hud) {
      for (const k of ['paint', 'ink', 'light', 'mask']) {
        if (hud.dirty[k]) { uploadCanvas(gl, this.hud[k], hud.canvas[k]); hud.dirty[k] = false; }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    gl.viewport(0, 0, this.w, this.h);
    const { program, uniforms: U } = this.prog;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    const bind = (name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U[name], unit); };
    bind('uSPaint', tex[0], 0); bind('uSInk', tex[1], 1); bind('uSLight', tex[2], 2); bind('uSMask', tex[3], 3);
    bind('uDepth', depthTex, 4);
    bind('uHPaint', this.hud.paint.tex, 5); bind('uHInk', this.hud.ink.tex, 6);
    bind('uHLight', this.hud.light.tex, 7); bind('uHMask', this.hud.mask.tex, 8);
    gl.uniform1f(U.uHud, hud ? 1 : 0);
    gl.uniform2f(U.uRes, this.w, this.h);
    gl.uniform1f(U.uNear, camera.near);
    gl.uniform1f(U.uFar, camera.far);
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (camera.zoom || 1);
    gl.uniform2f(U.uTanHalf, th * camera.aspect, th);
    gl.uniformMatrix4fv(U.uCamWorld, false, camera.matrixWorld.elements);
    gl.uniform1f(U.uPx, this.cssPx);
    const u = this.u;
    gl.uniform3fv(U.uLineCol, u.lineCol);
    gl.uniform1f(U.uLineAmt, u.lineAmt);
    gl.uniform1f(U.uCreaseAmt, u.creaseAmt);
    gl.uniform1f(U.uWobblePx, u.wobblePx);
    gl.uniform1f(U.uBreak, u.breakAmt);
    gl.uniform1f(U.uEdgeDark, u.edgeDark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.out.paint);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, this.out.light);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    return this.out;
  }
}
