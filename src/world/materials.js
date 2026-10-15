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
  uWind: { value: new THREE.Vector2(0.16, 0.07) },   // the wind over the grass (m of lean at a blade's tip)
  uGrassLod: { value: new THREE.Vector2(9, 30) },    // grass in blades: all of it out to x m, none past y m
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
#ifdef USE_FLORA
in vec4 flora;     // how thick each of the four flowers grows here (see uFl0..3)
out vec4 vFlora;
#endif
#ifdef USE_SKIN
in vec4 skin;      // x: mm along a finger (wrinkles run across it), y: knuckle wrinkles, z: crepe, w: nail
out vec4 vSkin;
out vec3 vRest;
#endif
#ifdef USE_GRASS
// one tuft (or flower, or stone) per instance; the geometry is a tuft a metre tall, uv.y up its blades
in vec4 iPos;      // where it stands (world) and which way it is turned
in vec4 iShape;    // height (m), breadth (m), where the tip's colour starts up the blade, rank (0..1)
in vec3 iCol;      // its colour at the foot
in vec3 iTip;      // and at the tip (a flower's head)
uniform float uTime;
uniform vec2 uWind, uGrassLod;
out vec3 vGCol;
out vec3 vGTip;
out vec3 vGy;
${NOISE_GLSL}
#endif
void main() {
  #ifdef USE_TINT
    vTint = tint;
  #endif
  #ifdef USE_FLORA
    vFlora = flora;
  #endif
  #ifdef USE_SKIN
    vSkin = skin;
    vRest = position * 1000.0;
  #endif
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #ifdef USE_GRASS
    // thinned with distance in rank order, broader as it thins so it covers the same, and what is left
    // sinks into the ground at the far edge, so nothing pops in or out
    float gd = distance(cameraPosition, iPos.xyz);
    float keep = mix(1.0, 0.1, smoothstep(uGrassLod.x, uGrassLod.y, gd));
    float show = smoothstep(keep + 0.002, keep - 0.1, iShape.w) * smoothstep(uGrassLod.y * 1.08, uGrassLod.y * 0.85, gd);
    float broad = 1.0 + (1.0 - keep) * 1.1;
    vec3 lp = position * vec3(iShape.y * broad, iShape.x, iShape.y * broad) * show;
    float cs = cos(iPos.w), sn = sin(iPos.w);
    lp.xz = vec2(cs * lp.x - sn * lp.z, sn * lp.x + cs * lp.z);
    // the wind: a steady lean, gusts running across the headland, and each blade's own flutter
    vec2 gq = iPos.xz * 0.06 - uTime * vec2(0.7, 0.3);
    float gust = vn3(vec3(gq, 1.0));
    vec2 w = uWind * (0.4 + 1.6 * gust * gust) + vec2(sin(uTime * 2.6 + iPos.x * 1.7 + iPos.z), cos(uTime * 2.1 + iPos.z * 1.9)) * 0.025;
    float up = uv.y * uv.y;
    lp.xz += w * up * min(iShape.x, 0.8) * 2.2 * show;
    lp.y -= dot(w, w) * up * 3.0 * show;
    transformed = iPos.xyz + lp;
    // lit as the ground they stand on is, more or less, not blade by blade
    vec3 bn = vec3(cs * normal.x - sn * normal.z, 0.0, sn * normal.x + cs * normal.z);
    objectNormal = normalize(vec3(bn.x * 0.3, 1.0, bn.z * 0.3));
    vGCol = iCol;
    vGTip = iTip;
    vGy = vec3(uv.y, iShape.z, uv.x);
  #endif
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
#ifdef USE_FLORA
in vec4 vFlora;
uniform vec3 uFl0, uFl1, uFl2, uFl3;
uniform vec4 uFlFreq, uFlSize;
#endif
#ifdef USE_SKIN
in vec4 vSkin;
in vec3 vRest;
uniform vec3 uWrinkleCol;
uniform float uWrinkle;
#endif
#ifdef USE_GRASS
in vec3 vGCol;
in vec3 vGTip;
in vec3 vGy;
#endif
#ifdef UNDER_GRASS
uniform vec2 uGrassLod;
uniform vec2 uUnder;       // the reach of the darkening under the blades, as a part of uGrassLod's
#endif
#ifdef USE_ROCK
uniform float uRockAll;    // 1: all of it is stone; 0: only where the surface stands steep
uniform vec3 uCrackCol;
#endif

uniform vec3 uColor;
uniform vec3 uColor2;      // a second pigment the wash drifts toward
uniform float uLine, uCrease, uGran, uWater, uTurb, uLit, uFogAmt, uFogFloor, uBand, uBare;
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
#ifdef USE_FLORA
// Flowers as dabs of pigment: one dab at most in each cell of a lattice laid on the surface (on whichever
// plane it faces most nearly), kept where the cell's lot falls under how thick the flower grows; where it
// grows thick, a second lattice half a cell over fills the gaps. Far off, where the dabs would sparkle,
// they melt into the colour they average to, so a drift of gorse reads as a yellow wash across a hill.
float floraLattice(vec2 p, float pres, float rad, float seed, out float tone) {
  // a dab may sit anywhere in its cell and is at most half a cell across, so only the four cells
  // nearest the point can reach it
  vec2 c0 = floor(p - 0.5);
  float fw = length(fwidth(p));
  float best = 0.0;
  tone = 0.5;
  for (int k = 0; k < 4; k++) {
    vec2 c = c0 + vec2(float(k & 1), float(k >> 1));
    vec3 c3 = vec3(c, seed * 13.0);
    if (h31(c3 + seed) >= pres) continue;
    vec2 j = c + vec2(h31(c3 + 1.7), h31(c3 + 3.1));
    float rr = rad * (0.6 + 0.4 * h31(c3 + 7.7));
    // a dab is never quite round
    float a = h31(c3 + 5.3) * 6.2832;
    vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * (p - j);
    float d = length(q * vec2(1.0, 1.35));
    float v = 1.0 - smoothstep(rr - fw * 0.6 - 0.02, rr + fw * 0.6, d);
    if (v > best) { best = v; tone = h31(c3 + 9.1); }
  }
  return best;
}
vec3 floraDab(vec3 base, vec2 p, vec3 col, float pres, float freq, float rad, float seed) {
  if (pres <= 0.002) return base;
  p = p * freq + seed * 17.0;
  float fw = length(fwidth(p));
  float mean = (min(pres * 2.0, 1.0) + max(pres * 2.0 - 1.0, 0.0)) * 1.6 * rad * rad;
  float far = smoothstep(0.3, 0.85, fw);
  float k = mean, t1 = 0.5, t2;
  if (far < 1.0) {
    float dab = floraLattice(p, pres * 2.0, rad, seed, t1);
    // where it grows thick, a second lattice, turned and finer, fills the gaps without falling into a weave
    if (pres > 0.5) dab = max(dab, floraLattice(mat2(0.62, 0.79, -0.79, 0.62) * p * 1.37 + 0.31, pres * 2.0 - 1.0, rad, seed + 0.5, t2) * (1.0 - dab));
    k = mix(dab, mean, far);
  }
  return mix(base, col * (0.84 + 0.32 * t1), clamp(k, 0.0, 1.0));
}
// on stone the same plants are lichen: crusts spreading in ragged rosettes that run together where it
// grows thick, mottled through, not dabs
vec3 lichenCrust(vec3 base, vec3 p, vec3 col, float pres, float freq, float rad, float seed) {
  if (pres <= 0.002 || rad <= 0.0) return base;
  vec3 q = p * freq * 0.3 + seed * 7.3;
  float f = fbm3d(q) * 0.82 + vn3(q * 5.3) * 0.18;
  float th = mix(0.74, 0.44, pres);
  float fw = fwidth(f);
  float k = smoothstep(th - fw, th + fw + 0.015, f);
  float tone = vn3(q * 7.0 + 2.0);
  return mix(base, col * (0.78 + 0.4 * tone), k * (0.7 + 0.3 * smoothstep(th, th + 0.08, f)));
}
#endif
#ifdef USE_SKIN
// fine lines across a coordinate (one per unit), thinned and faded where they would alias
float skinLines(float ph, float width) {
  float fw = fwidth(ph);
  float d = abs(fract(ph + 0.5) - 0.5);
  return (1.0 - smoothstep(width, width + fw * 1.2, d)) * (1.0 - smoothstep(0.22, 0.45, fw));
}
#endif

#ifdef USE_ROCK
// thin lines along a noise's middle contour, faded where they would alias
float crackLine(float v, float width) {
  float fw = fwidth(v);
  return (1.0 - smoothstep(width, width + fw * 1.5, abs(v - 0.5))) * (1.0 - smoothstep(0.08, 0.2, fw));
}
#endif

void main() {
  vec3 n = normalize(vNormalW);
  #ifndef USE_GRASS
  if (!gl_FrontFacing) n = -n;
  #endif
  vec3 V = normalize(cameraPosition - vWorld);

  // pigment: base wash, drifting toward a second colour in slow blooms fixed to the surface
  #ifdef USE_GRASS
    vec3 base = uColor;
  #else
    float drift = fbm3d(vObj * 0.35 + 5.0);
    vec3 base = mix(uColor, uColor2, smoothstep(0.35, 0.75, drift));
  #endif
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
  #ifdef USE_GRASS
    // dark down among the stems, paler up the blade, then the tip's own colour (a seed head, a flower)
    base = vGCol * mix(0.5, 1.1, smoothstep(0.0, 0.8, vGy.x));
    base = mix(base, vGTip, max(smoothstep(vGy.y, vGy.y + 0.12, vGy.x), vGy.z));
  #endif
  #ifdef UNDER_GRASS
    // where the grass stands in blades round the eye, the ground seen between them is the shade down
    // among the stems, and the flowers are the plants' own; further off the paint stands for both
    float nearG = 1.0 - smoothstep(uGrassLod.x * uUnder.x, uGrassLod.y * uUnder.y, length(vWorld - cameraPosition));
    float under = nearG * vTint.a;
    base = mix(base, base * vec3(0.62, 0.6, 0.5), under);
    // the flowers stand up in the blades wherever anything grows at all, however thin the grass
    float grown = nearG * smoothstep(0.02, 0.2, vTint.a);
    // and down there it is thatch: last year's stems lying every way in streaks, moss in the hollows,
    // flecks of straw
    if (under > 0.01) {
      vec2 gp = vWorld.xz;
      // two lies of stem, crossing, one or the other in patches
      vec2 sa = mat2(0.8, 0.6, -0.6, 0.8) * gp, sb = mat2(0.28, -0.96, 0.96, 0.28) * gp;
      float lie = smoothstep(0.35, 0.65, vn3(vec3(gp * 0.9, 4.0)));
      float streak = mix(vn3(vec3(sa * vec2(6.0, 24.0), 2.0)), vn3(vec3(sb * vec2(6.0, 24.0), 3.0)), lie) * 0.65 + vn3(vec3(gp * 9.0, 6.0)) * 0.35;
      float fine = 1.0 - smoothstep(0.2, 0.6, length(fwidth(gp)) * 22.0);
      float moss = smoothstep(0.45, 0.75, vn3(vec3(gp * 1.6, 9.0)));
      vec3 thatch = base * mix(0.66, 1.24, streak);
      thatch = mix(thatch, base * vec3(0.8, 1.02, 0.62), moss * 0.6);
      thatch = mix(thatch, vec3(0.62, 0.55, 0.36) * dot(base, vec3(0.6)) * 2.2, smoothstep(0.72, 0.86, streak) * (1.0 - moss) * 0.65);
      base = mix(base, thatch, under * fine);
    }
  #endif
  #ifdef USE_FLORA
    // the flowers grow in clumps, thinner between
    vec4 clump = vec4(vn3(vWorld * 0.5 + 3.0), vn3(vWorld * 0.42 + 8.0), vn3(vWorld * 0.7 + 1.0), vn3(vWorld * 0.6 + 5.0));
    vec4 pres = clamp(vFlora * mix(vec4(0.25), vec4(1.6), smoothstep(vec4(0.3), vec4(0.7), clump)), 0.0, 1.0);
    #ifdef UNDER_GRASS
      pres *= 1.0 - grown;
    #endif
    // the lattice lies on the plane the surface faces most nearly
    vec3 an = abs(n);
    vec2 fp = an.y > max(an.x, an.z) ? vWorld.xz : an.x > an.z ? vWorld.zy : vWorld.xy;
    #ifdef USE_ROCK
    if (uRockAll > 0.5) {
      base = lichenCrust(base, vWorld, uFl0, pres.x, uFlFreq.x, uFlSize.x, 1.0);
      base = lichenCrust(base, vWorld, uFl1, pres.y, uFlFreq.y, uFlSize.y, 2.0);
      base = lichenCrust(base, vWorld, uFl2, pres.z, uFlFreq.z, uFlSize.z, 3.0);
      base = lichenCrust(base, vWorld, uFl3, pres.w, uFlFreq.w, uFlSize.w, 4.0);
    } else
    #endif
    {
      base = floraDab(base, fp, uFl0, pres.x, uFlFreq.x, uFlSize.x, 1.0);
      base = floraDab(base, fp, uFl1, pres.y, uFlFreq.y, uFlSize.y, 2.0);
      base = floraDab(base, fp, uFl2, pres.z, uFlFreq.z, uFlSize.z, 3.0);
      base = floraDab(base, fp, uFl3, pres.w, uFlFreq.w, uFlSize.w, 4.0);
    }
  #endif
  #ifdef USE_ROCK
    // stone: laid in beds that dip a little, each bed its own shade, broken by joints and cracks,
    // and speckled with its grain; the cracks are drawn in ink as well as shaded
    float rk = max(uRockAll, smoothstep(0.8, 0.6, n.y));
    float crack = 0.0;
    if (rk > 0.0) {
      vec3 rp = vWorld;
      float bedY = rp.y * 1.3 + rp.x * 0.12 - rp.z * 0.07 + vn3(rp * 0.3) * 1.6;
      float bed = floor(bedY);
      base *= mix(1.0, 0.86 + 0.24 * h31(vec3(bed, 3.0, 7.0)), rk);
      // the seams between beds, here and there; the joints running down through them, fewer
      float seam = crackLine(fract(bedY), 0.03) * smoothstep(0.45, 0.7, vn3(rp * 0.4 + 2.0));
      float joint = crackLine(vn3(vec3(rp.x * 0.6 + rp.z * 0.45, rp.y * 0.12, rp.z * 0.6 - rp.x * 0.45)), 0.014)
        * smoothstep(0.6, 0.8, vn3(rp * 0.25 + 6.0));
      crack = max(seam, joint) * rk;
      vec3 sq = rp * 22.0;
      float sfw = length(fwidth(sq));
      float speck = (vn3(sq) - 0.5) * (1.0 - smoothstep(0.4, 1.0, sfw)) + (vn3(sq * 2.7 + 4.0) - 0.5) * 0.6 * (1.0 - smoothstep(0.15, 0.4, sfw));
      // weathering: mottled darker and paler a hand's breadth across
      float mott = vn3(rp * 4.0 + 3.0) * 0.6 + vn3(rp * 9.0) * 0.4;
      base *= (1.0 + speck * 0.5 * rk) * mix(1.0, 0.82 + 0.32 * mott, rk);
      base = mix(base, base * 0.62, crack);
    }
  #endif

  // light: a wrapped, softly banded value study. Shadow is a cooler, deeper glaze of the same pigment.
  float ndl = dot(n, uSunDir);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  // two or three flat values, the way a painter would block them in
  float band = smoothstep(0.44, 0.56, wrap) * 0.7 + smoothstep(0.78, 0.86, wrap) * 0.3;
  float lit = mix(wrap, band, uBand) * uSunAmt + uAmbient;
  lit = mix(1.0, lit, uLit);
  vec3 shade = base * uShadeTint * 0.72;
  vec3 col = mix(shade, base * uLightTint, clamp(lit, 0.0, 1.15));
  // where the light hits square on, the paper is left almost bare
  float bare = uBare;
  #ifdef UNDER_GRASS
    bare *= 1.0 - under;
  #endif
  col = mix(col, mix(col, vec3(0.96, 0.94, 0.88), 0.5), smoothstep(0.86, 0.97, wrap) * uSunAmt * uLit * bare);

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

  #ifndef USE_GRASS
  // turbulence: uneven pigment within the wash, on the surface (not in the grass, a thousand blades
  // deep, where the blades' own colours do it)
  float turb = fbm3d(vObj * 1.3);
  col = density(col, 1.0 + (turb - 0.5) * 0.55 * uTurb * uTurbAmt);
  // blooms: where wet paint ran back into a drying wash it leaves a pale patch with a hard dark rim
  float bl = fbm3d(vObj * 0.55 + 2.0);
  float inBloom = smoothstep(0.6, 0.615, bl);
  float rimB = inBloom - smoothstep(0.615, 0.66, bl);
  col = density(col, 1.0 - inBloom * 0.16 * uTurb + rimB * 0.35 * uTurb);
  #endif

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
  #ifdef USE_ROCK
    ink = vec4(uCrackCol, crack * 0.3 * (1.0 - fog));
  #endif
  #ifdef USE_SKIN
    // an old hand's skin, drawn in fine pencil: bunched wrinkles over the knuckles, a crêpe of tiny
    // crossing lines on the backs of the hands, the outline of each nail
    vec3 sr = vRest;
    float irr = vn3(sr * 0.32);
    float brk = smoothstep(0.28, 0.6, vn3(sr * vec3(0.45, 0.45, 0.2) + 3.0));
    float wk = skinLines(vSkin.x / 1.4 + (irr - 0.5) * 1.3, 0.09) * clamp(vSkin.y, 0.0, 1.0) * mix(0.25, 1.0, brk);
    float c1 = skinLines(dot(sr.xz, vec2(0.80, 0.60)) / 2.1 + vn3(sr * 0.21) * 1.8, 0.07);
    float c2 = skinLines(dot(sr.xz, vec2(-0.74, 0.67)) / 2.6 + vn3(sr * 0.21 + 5.0) * 1.8, 0.07);
    float cr = max(c1, c2) * vSkin.z * 0.11 * smoothstep(0.45, 0.8, vn3(sr * 0.16 + 1.0)) * (0.5 + vn3(sr * 0.9));
    float nm = vSkin.w;
    float nl = (1.0 - smoothstep(0.0, fwidth(nm) * 1.4 + 0.03, abs(nm - 0.5))) * step(0.02, nm);
    float wa = clamp(max(max(wk * 0.55, cr), nl * 0.5) * uWrinkle, 0.0, 1.0);
    ink = vec4(uWrinkleCol, wa);
  #endif
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
//   band, bare      how much the light is blocked into flat values (0..1), and how much of the paper is
//                   left bare where it hits square on (skin, with its small forms, takes less of both)
//   emit            emissive colour into the light layer
//   map, mapAmt     painted CanvasTexture multiplying the wash
//   inkMap, inkAmt  lettering painted on the surface
//   noiseScale      object units → noise units (≈ 1 / metres per blotch)
//   world           take noise from world position (for big static scenery)
//   tint            geometry carries a vec4 'tint' attribute (pigment multiplier, a = ink stain);
//                   stain / stainCol set how much ink has gathered and its colour
//   flora           geometry carries a vec4 'flora' attribute (how thick four flowers grow); flora is
//                   { cols: [4 colours], freq: [dabs per metre], size: [dab radius, 0..0.5 of a cell] }
//   grass           drawn as instanced tufts (grass.js): iPos, iShape, iCol, iTip per instance
//   underGrass      the ground the grass stands on: tint.a is how much grass, darkened under the blades
//   rock            stone texture (beds, joints, cracks, grain); rock: 1 for all of it, 0.5 for only
//                   where the surface stands steep
//   skin            geometry carries a vec4 'skin' attribute (an old hand's wrinkles, crêpe and nails,
//                   drawn as fine lines in wrinkleCol, scaled by wrinkle)
export function wash(o = {}) {
  const c = col3(o.color ?? '#B9A88C');
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { ...(o.world ? { WORLD_NOISE: 1 } : {}), ...(o.tint ? { USE_TINT: 1 } : {}), ...(o.skin ? { USE_SKIN: 1 } : {}), ...(o.flora ? { USE_FLORA: 1 } : {}),
      ...(o.grass ? { USE_GRASS: 1 } : {}), ...(o.underGrass ? { UNDER_GRASS: 1 } : {}), ...(o.rock ? { USE_ROCK: 1 } : {}) },
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
      uBand: { value: o.band ?? 0.72 },
      uBare: { value: o.bare ?? 1 },
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
      uWrinkleCol: { value: col3(o.wrinkleCol ?? '#4A3028') },
      uWrinkle: { value: o.wrinkle ?? 1 },
      uRockAll: { value: o.rock === 1 ? 1 : 0 },
      uUnder: { value: new THREE.Vector2(...(o.underReach || [1, 1])) },
      uCrackCol: { value: col3(o.crackCol ?? '#2E2C30') },
      ...(o.flora ? {
        uFl0: { value: col3(o.flora.cols[0]) }, uFl1: { value: col3(o.flora.cols[1]) },
        uFl2: { value: col3(o.flora.cols[2]) }, uFl3: { value: col3(o.flora.cols[3]) },
        uFlFreq: { value: new THREE.Vector4(...o.flora.freq) }, uFlSize: { value: new THREE.Vector4(...o.flora.size) },
      } : {}),
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
