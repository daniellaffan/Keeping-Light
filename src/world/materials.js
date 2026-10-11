// Materials for the 3D world. Every surface is a flat watercolor wash: no specular, no PBR.
// One fragment shader writes all four layers at once (MRT):
//   0 paint  rgb wash, a = silhouette ink weight
//   1 ink    straight-alpha linework painted on the surface (signs, the logbook's handwriting)
//   2 light  emissive only
//   3 mask   r water, g haar density along the view ray, b grain noise in the surface's own space
//            (0.5 = none), a = crease ink weight
// Pigment turbulence and granulation are computed from object-space positions, so they stay on the
// surface as the camera moves instead of sitting on the glass.
import * as THREE from 'three';

// Uniforms shared by every material (one object per uniform, so a change reaches all of them).
export const SHARED = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunAmt: { value: 1.0 },
  uAmbient: { value: 0.38 },
  uShadeTint: { value: new THREE.Color(0.62, 0.66, 0.82) },   // shadows go cooler, not just darker
  uLightTint: { value: new THREE.Color(1.0, 0.98, 0.94) },
  uLampPos: { value: new THREE.Vector3(0, 2, 0) },
  uLampCol: { value: new THREE.Color(1.0, 0.72, 0.38) },
  uLampAmt: { value: 0.0 },
  uLampFall: { value: 0.35 },
  uRimAmt: { value: 0.0 },
  uFogDensity: { value: 0.0025 },
  uFogNear: { value: 8.0 },
  uFogHeight: { value: 40.0 },
  uTime: { value: 0 },
  uTurbAmt: { value: 1.0 },
};

export const NOISE_GLSL = /* glsl */`
float h31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), u.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), u.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm3d(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vn3(p); p = p * 2.07 + vec3(11.7, 3.1, 7.3); a *= 0.5; }
  return s / 0.875;
}
vec3 density(vec3 c, float d) { return c - (c - c * c) * (d - 1.0); }
`;

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uNoiseScale;
out vec3 vWorld;
out vec3 vNormalW;
out vec2 vUv;
out vec3 vObj;
#ifdef USE_TINT
in vec4 tint;      // per-vertex pigment multiplier; a = where ink stains gather
out vec4 vTint;
#endif
void main() {
  #ifdef USE_TINT
    vTint = tint;
  #endif
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(transformed, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(m) * objectNormal);
  vUv = uv;
  // noise space: the rest position, so grain rides with a moving or bending surface
  #ifdef WORLD_NOISE
    vObj = wp.xyz * uNoiseScale;
  #else
    vObj = position * uNoiseScale;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
precision highp float;
layout(location = 0) out vec4 oPaint;
layout(location = 1) out vec4 oInk;
layout(location = 2) out vec4 oLight;
layout(location = 3) out vec4 oMask;
in vec3 vWorld;
in vec3 vNormalW;
in vec2 vUv;
in vec3 vObj;
#ifdef USE_TINT
in vec4 vTint;
uniform vec3 uStainCol;
uniform float uStain;
#endif

uniform vec3 uColor;
uniform vec3 uColor2;      // a second pigment the wash drifts toward
uniform float uLine, uCrease, uGran, uWater, uTurb, uLit, uFogAmt, uFogFloor;
uniform vec3 uEmit;
uniform sampler2D uMap;    // painted texture (paint.js canvas), multiplies the wash
uniform float uMapAmt;
uniform sampler2D uInkMap; // lettering on the surface, straight alpha
uniform float uInkAmt;
uniform sampler2D uEmitMap;
uniform float uEmitMapAmt;

uniform vec3 uSunDir;
uniform float uSunAmt, uAmbient;
uniform vec3 uShadeTint, uLightTint;
uniform vec3 uLampPos, uLampCol;
uniform float uLampAmt, uLampFall, uRimAmt;
uniform float uFogDensity, uFogNear, uFogHeight;
uniform float uTurbAmt;
${NOISE_GLSL}

void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vWorld);

  // pigment: base wash, drifting toward a second colour in slow blooms fixed to the surface
  float drift = fbm3d(vObj * 0.35 + 5.0);
  vec3 base = mix(uColor, uColor2, smoothstep(0.35, 0.75, drift));
  if (uMapAmt > 0.0) {
    vec4 tx = texture(uMap, vUv);
    base = mix(base, base * tx.rgb * 1.08, uMapAmt * tx.a);
  }
  #ifdef USE_TINT
    base *= vTint.rgb;
    // ink worked into the skin: patchy, darker in the grain
    float st = vTint.a * uStain * smoothstep(0.25, 0.65, fbm3d(vObj * 2.2 + 9.0) + vTint.a * 0.4);
    base = mix(base, uStainCol, clamp(st, 0.0, 0.85));
  #endif

  // light: a wrapped, softly banded value study. Shadow is a cooler, deeper glaze of the same pigment.
  float ndl = dot(n, uSunDir);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  // two or three flat values, the way a painter would block them in
  float band = smoothstep(0.44, 0.56, wrap) * 0.7 + smoothstep(0.78, 0.86, wrap) * 0.3;
  float lit = mix(wrap, band, 0.72) * uSunAmt + uAmbient;
  lit = mix(1.0, lit, uLit);
  vec3 shade = base * uShadeTint * 0.72;
  vec3 col = mix(shade, base * uLightTint, clamp(lit, 0.0, 1.15));
  // where the light hits square on, the paper is left almost bare
  col = mix(col, mix(col, vec3(0.96, 0.94, 0.88), 0.5), smoothstep(0.86, 0.97, wrap) * uSunAmt * uLit);

  // lamp: a warm glaze that pools near the flame
  if (uLampAmt > 0.0) {
    vec3 L = uLampPos - vWorld;
    float d = length(L);
    float ln = clamp(dot(n, L / d) * 0.6 + 0.4, 0.0, 1.0);
    float att = uLampAmt / (1.0 + d * d * uLampFall);
    float k = clamp(att * ln, 0.0, 1.0) * uLit;
    col = mix(col, base * uLampCol * 1.25, k * 0.85);
    // a soft rim of lamplight round the far edge of forms
    float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.5) * clamp(dot(-V, L / d) * 0.5 + 0.6, 0.0, 1.0);
    col += uLampCol * rim * uRimAmt * att * 0.35;
  }

  // turbulence: uneven pigment within the wash, on the surface
  float turb = fbm3d(vObj * 1.3);
  col = density(col, 1.0 + (turb - 0.5) * 0.55 * uTurb * uTurbAmt);
  // blooms: where wet paint ran back into a drying wash it leaves a pale patch with a hard dark rim
  float bl = fbm3d(vObj * 0.55 + 2.0);
  float inBloom = smoothstep(0.6, 0.615, bl);
  float rimB = inBloom - smoothstep(0.615, 0.66, bl);
  col = density(col, 1.0 - inBloom * 0.16 * uTurb + rimB * 0.35 * uTurb);

  // grain noise in surface space, faded where it would alias
  vec3 gq = vObj * 18.0;
  float fw = length(fwidth(gq));
  float aa = 1.0 - smoothstep(0.35, 0.9, fw);
  float g = vn3(gq) * 0.65 + vn3(gq * 2.3 + 7.0) * 0.35;
  float grain = 0.5 + (g - 0.5) * uGran * aa;

  // haar: real density along the ray, thinning with height
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-max(dist - uFogNear, 0.0) * uFogDensity);
  fog *= mix(1.0, exp(-max(vWorld.y, 0.0) / uFogHeight), 0.6);
  fog = clamp(max(fog * uFogAmt, uFogFloor), 0.0, 1.0);

  vec4 ink = vec4(0.0);
  if (uInkAmt > 0.0) { ink = texture(uInkMap, vUv); ink.a *= uInkAmt; }
  vec3 emit = uEmit;
  if (uEmitMapAmt > 0.0) emit += texture(uEmitMap, vUv).rgb * uEmitMapAmt;

  oPaint = vec4(clamp(col, 0.0, 1.0), uLine);
  oInk = ink;
  oLight = vec4(emit, 1.0);
  oMask = vec4(uWater, fog, grain, uCrease);
}`;

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;
const CLEAR = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
CLEAR.needsUpdate = true;

const col3 = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

// A wash material. Options:
//   color, color2   pigments (hex or Color)
//   line, crease    ink weight at silhouettes / inner creases (0..1)
//   gran, turb      granulation and turbulence strength
//   water           1 for the sea (the composite ripples it)
//   fog, fogFloor   how much the haar takes it, and a least amount it always takes (something seen
//                   only through mist)
//   lit             0 = unlit (sky, paper), 1 = shaded
//   emit            emissive colour into the light layer
//   map, mapAmt     painted CanvasTexture multiplying the wash
//   inkMap, inkAmt  lettering painted on the surface
//   noiseScale      object units → noise units (≈ 1 / metres per blotch)
//   world           take noise from world position (for big static scenery)
//   tint            geometry carries a vec4 'tint' attribute (pigment multiplier, a = ink stain);
//                   stain / stainCol set how much ink has gathered and its colour
export function wash(o = {}) {
  const c = col3(o.color ?? '#B9A88C');
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { ...(o.world ? { WORLD_NOISE: 1 } : {}), ...(o.tint ? { USE_TINT: 1 } : {}) },
    uniforms: {
      ...SHARED,
      uColor: { value: c },
      uColor2: { value: o.color2 != null ? col3(o.color2) : c.clone().offsetHSL(0.015, -0.04, -0.03) },
      uLine: { value: o.line ?? 0.8 },
      uCrease: { value: o.crease ?? 0.5 },
      uGran: { value: o.gran ?? 0.5 },
      uWater: { value: o.water ?? 0 },
      uTurb: { value: o.turb ?? 1 },
      uLit: { value: o.lit ?? 1 },
      uFogAmt: { value: o.fog ?? 1 },
      uFogFloor: { value: o.fogFloor ?? 0 },
      uEmit: { value: col3(o.emit ?? 0x000000) },
      uMap: { value: o.map || WHITE },
      uMapAmt: { value: o.map ? (o.mapAmt ?? 1) : 0 },
      uInkMap: { value: o.inkMap || CLEAR },
      uInkAmt: { value: o.inkMap ? (o.inkAmt ?? 1) : 0 },
      uEmitMap: { value: o.emitMap || CLEAR },
      uEmitMapAmt: { value: o.emitMap ? (o.emitMapAmt ?? 1) : 0 },
      uNoiseScale: { value: o.noiseScale ?? 1 },
      uStainCol: { value: col3(o.stainCol ?? '#1F2940') },
      uStain: { value: o.stain ?? 0 },
    },
    side: o.side ?? THREE.FrontSide,
  });
  return m;
}

// Light that only adds to the light layer (beams, glows): writes nothing else, no depth.
const LIGHT_FRAG = /* glsl */`
precision highp float;
layout(location = 0) out vec4 oPaint;
layout(location = 1) out vec4 oInk;
layout(location = 2) out vec4 oLight;
layout(location = 3) out vec4 oMask;
in vec2 vUv;
in vec3 vWorld;
in vec3 vCol;
uniform vec3 uEmit;
uniform float uAmt;
uniform sampler2D uMap;
void main() {
  vec3 e = uEmit * texture(uMap, vUv).rgb * uAmt * vCol;
  // premultiplied blending with alpha 0: adds to light, leaves the other layers untouched
  oPaint = vec4(0.0);
  oInk = vec4(0.0);
  oLight = vec4(e, 0.0);
  oMask = vec4(0.0);
}`;

const LIGHT_VERT = /* glsl */`
out vec2 vUv;
out vec3 vWorld;
out vec3 vCol;
void main() {
  vUv = uv;
  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// emit, amt, map; vcolor: the geometry's 'color' attribute scales it per vertex
export function glowMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    vertexColors: !!o.vcolor,
    glslVersion: THREE.GLSL3,
    vertexShader: LIGHT_VERT,
    fragmentShader: LIGHT_FRAG,
    uniforms: {
      uEmit: { value: col3(o.emit ?? 0xffe0a0) },
      uAmt: { value: o.amt ?? 1 },
      uMap: { value: o.map || WHITE },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
}

// The lamp's beam: a long cone of light that only adds to the light layer. Brightest where the view
// passes through the most of it (face-on to the surface), fading along its length, with slow motes.
const BEAM_VERT = /* glsl */`
out vec3 vWorld;
out vec3 vN;
out float vAlong;
out vec3 vAxis;
uniform float uLen;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, -1.0));
  vAlong = clamp(-position.z / uLen, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FRAG = /* glsl */`
precision highp float;
layout(location = 0) out vec4 oPaint;
layout(location = 1) out vec4 oInk;
layout(location = 2) out vec4 oLight;
layout(location = 3) out vec4 oMask;
in vec3 vWorld;
in vec3 vN;
in float vAlong;
in vec3 vAxis;
uniform vec3 uEmit;
uniform float uAmt, uReach, uTime;
${NOISE_GLSL}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float face = abs(dot(normalize(vN), V));
  // seen from the side the shaft is brightest down its middle; seen from behind the lamp, looking
  // along it, every surface is grazing, so the glow comes from looking down its length instead
  float down = abs(dot(V, normalize(vAxis)));
  float fall = exp(-vAlong / max(uReach, 0.02) * 2.2) * smoothstep(0.0, 0.015, vAlong);
  float thick = max(pow(face, 1.6), pow(down, 3.0) * 0.45 * smoothstep(0.0, 0.02, face) * smoothstep(0.01, 0.1, vAlong));
  float motes = 0.75 + 0.5 * vn3(vWorld * 0.05 + vec3(0.0, uTime * 0.2, uTime * 0.1));
  vec3 e = uEmit * uAmt * thick * fall * motes;
  oPaint = vec4(0.0);
  oInk = vec4(0.0);
  oLight = vec4(e, 0.0);
  oMask = vec4(0.0);
}`;

export function beamMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      uEmit: { value: col3(o.emit ?? 0xffe2a8) },
      uAmt: { value: o.amt ?? 1 },
      uReach: { value: o.reach ?? 1 },
      uLen: { value: o.len ?? 1 },
      uTime: SHARED.uTime,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
}

// The sky: an unlit gradient dome, haar-weighted toward the horizon, stars into the light layer.
const SKY_VERT = /* glsl */`
out vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;   // always at the back
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
layout(location = 0) out vec4 oPaint;
layout(location = 1) out vec4 oInk;
layout(location = 2) out vec4 oLight;
layout(location = 3) out vec4 oMask;
in vec3 vDir;
uniform vec3 uTop, uMid, uLow, uHor, uCloud;
uniform float uCloudAmt, uStars, uFogAmt, uTime;
uniform vec3 uSunPos;
uniform vec3 uSunCol;
uniform float uSunGlow;
uniform mat3 uStarRot;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uHor, uLow, smoothstep(0.0, 0.08, h));
  c = mix(c, uMid, smoothstep(0.06, 0.3, h));
  c = mix(c, uTop, smoothstep(0.25, 0.85, h));
  c = mix(c, uHor * 0.92, smoothstep(0.0, -0.1, h));
  // clouds: soft streaks of a second wash, banded low across the sky
  vec3 cp = d / max(h + 0.25, 0.12);
  float cl = fbm3d(vec3(cp.x * 0.9 + uTime * 0.004, cp.z * 0.9, 1.0) * vec3(1.0, 1.0, 1.0) * vec3(0.8, 1.0, 2.6));
  float cloud = smoothstep(0.48, 0.78, cl) * smoothstep(-0.02, 0.15, h) * (1.0 - smoothstep(0.55, 0.9, h)) * uCloudAmt;
  c = mix(c, uCloud, cloud * 0.7);
  float sd = max(dot(d, normalize(uSunPos)), 0.0);
  c = mix(c, uSunCol, pow(sd, 18.0) * uSunGlow * 0.6);
  vec3 light = uSunCol * pow(sd, 260.0) * uSunGlow;
  // stars: points in a frame that can wheel through the night
  if (uStars > 0.0) {
    vec3 sdir = uStarRot * d;
    vec3 q = sdir * 220.0;
    vec3 cell = floor(q);
    float r = h31(cell);
    if (r > 0.985) {
      vec3 jit = vec3(h31(cell + 1.3), h31(cell + 2.7), h31(cell + 4.1));
      float dd = length(fract(q) - jit);
      float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
      light += vec3(0.95, 0.92, 0.85) * smoothstep(0.22, 0.0, dd) * uStars * tw * (1.0 - cloud) * smoothstep(0.0, 0.2, h);
    }
  }
  float fog = clamp((1.0 - smoothstep(0.0, 0.35, h)) * uFogAmt + 0.15 * uFogAmt, 0.0, 1.0);
  float g = vn3(d * 600.0);
  oPaint = vec4(c, 0.0);
  oInk = vec4(0.0);
  oLight = vec4(light, 1.0);
  oMask = vec4(0.0, fog, 0.5 + (g - 0.5) * 0.25, 0.0);
}`;

export function skyMaterial() {
  const c = (h) => ({ value: new THREE.Color(h) });
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: c('#7F93AE'), uMid: c('#A9B6C2'), uLow: c('#D9CFC0'), uHor: c('#E8DCC4'), uCloud: c('#C9BFB4'),
      uCloudAmt: { value: 0.8 }, uStars: { value: 0 }, uFogAmt: { value: 1 },
      uSunPos: { value: new THREE.Vector3(-0.5, 0.2, -0.8) }, uSunCol: c('#F5D9A8'), uSunGlow: { value: 0.6 },
      uStarRot: { value: new THREE.Matrix3() },
      uTime: SHARED.uTime,
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
}
