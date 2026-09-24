// Post-processing (from the Austerlitz and Titanic films): bloom, tone mapping and grading, a light painterly
// Kuwahara, film finish; plus the fogged telescopic sight and the grey-out of a hard pull-out.
import { HEAD } from './shaders.js';

export const DOWN_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh;
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec3 c = vec3(0.);
  c += texture(uSrc, uv + uTexel * vec2(-1, -1)).rgb; c += texture(uSrc, uv + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, uv + uTexel * vec2(-1, 1)).rgb; c += texture(uSrc, uv + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  if (uThresh > 0.) { float l = max(c.r, max(c.g, c.b)); c *= max(l - uThresh, 0.) / max(l, 1e-4); }
  frag = vec4(c, 1.);
}`;

export const BLUR_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform vec2 uDir;
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec3 c = texture(uSrc, uv).rgb * 0.227;
  c += (texture(uSrc, uv + uDir * 1.385).rgb + texture(uSrc, uv - uDir * 1.385).rgb) * 0.316;
  c += (texture(uSrc, uv + uDir * 3.231).rgb + texture(uSrc, uv - uDir * 3.231).rgb) * 0.070;
  frag = vec4(c, 1.);
}`;

export const GRADE_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform sampler2D uBloom1; uniform sampler2D uBloom2;
uniform float uExposure; uniform float uBloom;
uniform vec3 uLift; uniform vec3 uGain; uniform float uGamma; uniform float uSat; uniform float uContrast;
uniform sampler2D uPlate; uniform float uPlateMix; uniform sampler2D uShaftTex; uniform float uShafts;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec3 c = texture(uSrc, uv).rgb;
  c += (texture(uBloom1, uv).rgb * 0.6 + texture(uBloom2, uv).rgb * 0.8) * uBloom;
  if (uShafts > 0.) c += texture(uShaftTex, uv).rgb * uShafts;
  c = aces(c * uExposure);
  if (uPlateMix > 0.) c = mix(c, texture(uPlate, vec2(uv.x, 1. - uv.y)).rgb, uPlateMix);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c = uLift + c * (uGain - uLift);
  c = pow(max(c, 0.), vec3(1. / uGamma));
  frag = vec4(c, 1.);
}`;

export const KUWA_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform sampler2D uPrev; uniform float uMix; uniform vec2 uTexel; uniform float uRadius;
vec3 src(vec2 uv) { vec3 c = texture(uSrc, uv).rgb; if (uMix > 0.) c = mix(c, texture(uPrev, uv).rgb, uMix); return c; }
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec3 m[4]; vec3 s2[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.); s2[k] = vec3(0.); }
  float R = uRadius;
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    vec2 o = vec2(float(i), float(j)) * R / 3.;
    vec3 c = src(uv + o * uTexel);
    vec3 cc = c * c;
    if (i <= 0 && j <= 0) { m[0] += c; s2[0] += cc; }
    if (i >= 0 && j <= 0) { m[1] += c; s2[1] += cc; }
    if (i <= 0 && j >= 0) { m[2] += c; s2[2] += cc; }
    if (i >= 0 && j >= 0) { m[3] += c; s2[3] += cc; }
  }
  vec3 acc = vec3(0.); float wsum = 0.;
  for (int k = 0; k < 4; k++) {
    vec3 mu = m[k] / 16.;
    vec3 v = abs(s2[k] / 16. - mu * mu);
    float sig = v.r + v.g + v.b;
    float w = 1. / (1. + pow(sig * 400., 2.));
    acc += mu * w; wsum += w;
  }
  frag = vec4(acc / wsum, 1.);
}`;

export const PAINT_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform sampler2D uPrev; uniform float uMix; uniform sampler2D uKuwa;
uniform float uPaint; uniform float uTime; uniform float uGrain; uniform float uVignette; uniform float uBars; uniform float uFade;
uniform sampler2D uCanvasTex;
uniform float uFog; uniform float uGrey; uniform vec2 uShakeUV;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec3 c = texture(uSrc, uv).rgb;
  if (uMix > 0.) c = mix(c, texture(uPrev, uv).rgb, uMix);
  vec3 k = texture(uKuwa, uv).rgb;
  if (uFog > 0.) {
    // condensation on the sight's lens: blur, then a milky veil with beads of water
    vec3 b = vec3(0.); float R = 0.004 + 0.022 * uFog;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 16.) * R;
      b += texture(uSrc, uv + vec2(cos(a), sin(a) * 1.78) * r).rgb;
    }
    b /= 16.;
    vec2 gq = uv * vec2(150., 84.); vec2 cell = floor(gq);
    vec2 fq = fract(gq) - 0.5 - (vec2(h12(cell), h12(cell + 7.)) - 0.5) * 0.5;
    float rr = 0.12 + 0.22 * h12(cell + 3.);
    float bead = smoothstep(rr, rr - 0.1, length(fq)) * step(0.45, h12(cell + 11.)) * 0.12;
    float veil = clamp(uFog * (0.55 + 0.35 * smoothstep(0.05, 0.4, length(uv - 0.5))) , 0., 0.92);
    vec3 fogged = mix(b, vec3(0.78, 0.8, 0.8) * (0.7 + 0.3 * dot(b, vec3(0.33))), veil) + bead * uFog;
    c = mix(c, fogged, clamp(uFog * 1.6, 0., 1.));
    k = mix(k, fogged, clamp(uFog * 1.6, 0., 1.));
  }
  // keep fine detail where the painting and the photo agree; brush it where they differ
  c = mix(c, k, uPaint);
  float weave = texture(uCanvasTex, uv * vec2(16., 9.) * 1.6).r - 0.5;
  c *= 1. + weave * 0.07 * uPaint;
  vec2 d = uv - 0.5; d.x *= 1.3;
  c *= 1. - uVignette * smoothstep(0.25, 0.85, length(d));
  float g = h12(uv * vec2(1920., 1080.) + fract(uTime * 13.7) * 1000.) - 0.5;
  c += g * uGrain * (0.6 + 0.4 * (1. - dot(c, vec3(0.33))));
  if (uGrey > 0.) {
    // blood leaves the eyes: colour goes first, then the edges close in
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l) * vec3(0.95, 0.97, 1.0), clamp(uGrey * 1.3, 0., 1.));
    float r = length(d);
    c *= 1. - clamp(uGrey, 0., 1.) * smoothstep(0.55 - 0.4 * uGrey, 0.8 - 0.35 * uGrey, r);
    c *= 1. - 0.35 * uGrey;
  }
  c *= uFade;
  if (uv.y < uBars || uv.y > 1. - uBars) c = vec3(0.);
  frag = vec4(c, 1.);
}`;

export const SHAFTS_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uSrc; uniform vec2 uSunUV; uniform float uDecay;
void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec2 d = (uSunUV - uv) / 48.;
  vec3 acc = vec3(0.); float w = 1.;
  vec2 p = uv;
  for (int i = 0; i < 48; i++) { p += d; vec3 c = texture(uSrc, p).rgb; acc += max(c - 1.5, 0.) * w; w *= uDecay; }
  float fall = exp(-length((uv - uSunUV) * vec2(1.78, 1.)) * 2.5);
  frag = vec4(acc / 24. * fall, 1.);
}`;
