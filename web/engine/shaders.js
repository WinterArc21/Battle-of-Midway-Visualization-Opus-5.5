// GLSL for a bright Pacific morning: sky and sun, a broken layer of cumulus (with gaps, and shadows on the sea),
// the ocean with wakes, ships and aircraft, figures, smoke / fire / flak particles.
export const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;

export const COMMON = `
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uSun;        // direction to the sun
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uHaze;      // extinction per metre at sea level
uniform vec4 uCloud;      // altitude, coverage, feature scale (m), opacity
uniform vec4 uHole[2];    // clear gaps in the cloud: x, z, radius, strength
uniform vec4 uLP[12];     // point lights (fires, flashes): xyz, radius
uniform vec3 uLC[12];
uniform int uNL;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
vec2 g2(vec2 c) { float a = hash12(c) * 6.2832; return vec2(cos(a), sin(a)); }
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float a = dot(g2(i), f), b = dot(g2(i + vec2(1, 0)), f - vec2(1, 0)), c = dot(g2(i + vec2(0, 1)), f - vec2(0, 1)), d = dot(g2(i + vec2(1, 1)), f - vec2(1, 1));
  return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gfbm(vec2 p, int oct) { float s = 0., a = .5; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.13; a *= .5; } return s; }
float fbm(vec2 p, int oct) { float s = 0., a = .5; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.13; a *= .5; } return s; }

vec3 lightAt(vec3 p) {
  vec3 s = vec3(0.);
  for (int i = 0; i < 12; i++) {
    if (i >= uNL) break;
    vec3 d = uLP[i].xyz - p;
    float r = length(d) / uLP[i].w;
    s += uLC[i] / (1. + 12. * r * r) * smoothstep(1., 0.4, r);
  }
  return s;
}

vec3 skyBase(vec3 rd) {
  float up = max(rd.y, 0.);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
  if (rd.y < 0.) col = mix(uHorizon * 0.85, vec3(0.06, 0.12, 0.2), clamp(-rd.y * 3., 0., 1.));
  return col;
}
vec3 skyColor(vec3 rd) {
  vec3 col = skyBase(rd);
  float sd = max(dot(rd, uSun), 0.);
  if (rd.y >= 0.) {
    col += uSunCol * (pow(sd, 12.) * 0.035 + pow(sd, 300.) * 0.25 + pow(sd, 3000.) * 1.5);
    col += uSunCol * smoothstep(0.9996, 0.99985, sd) * 60.;
  }
  return col;
}

// ---- the cumulus layer ----
float cloudDens(vec2 xz, int oct) {
  vec2 p = (xz + vec2(uTime * 4., uTime * 1.5)) / uCloud.z;
  // trade-wind cumulus: clustered in streets and patches, with clear lanes between and a range of sizes
  float cluster = gnoise(p * 0.16 + vec2(3.1, 7.7)) * 0.7 + gnoise(p * 0.37 - 1.3) * 0.3;
  float n = gfbm(p * 0.78, oct);
  float th = uCloud.y + (0.5 - cluster) * 0.34;
  float d = smoothstep(th, th + 0.2, n + 0.1 * (gnoise(p * 0.21) - 0.5));
  d *= 0.82 + 0.18 * smoothstep(th, th + 0.45, n);
  for (int i = 0; i < 2; i++) {
    float r = length(xz - uHole[i].xy) / uHole[i].z;
    d *= 1. - uHole[i].w * (1. - smoothstep(0.55, 1.0, r + (gnoise(xz / 160.) - 0.5) * 0.4));
  }
  return d;
}
float cloudShadow(vec3 p) {
  if (uCloud.w <= 0. || p.y > uCloud.x) return 1.;
  vec2 q = p.xz + uSun.xz / max(uSun.y, 0.2) * (uCloud.x - p.y);
  return 1. - 0.62 * cloudDens(q, 4) * uCloud.w;
}
vec3 fogApply(vec3 col, vec3 wp, vec3 rd) {
  float dist = length(wp - uCam);
  // thinner air aloft: integrate an exponential atmosphere along the ray
  float h0 = uCam.y, h1 = wp.y, H = 1600.;
  float dens = abs(h1 - h0) < 1. ? exp(-h0 / H) : H * (exp(-min(h0, h1) / H) - exp(-max(h0, h1) / H)) / max(abs(h1 - h0), 1.);
  float k = 1. - exp(-dist * uHaze * dens);
  float sd = max(dot(rd, uSun), 0.);
  vec3 fc = uHorizon * 1.02 + uSunCol * pow(sd, 6.) * 0.12;
  return mix(col, fc, k);
}
// the cloud layer seen along a ray, up to distance tmax: rgb (already hazed) and alpha
vec4 cloudAlong(vec3 ro, vec3 rd, float tmax) {
  if (uCloud.w <= 0. || abs(rd.y) < 1e-4) return vec4(0.);
  float t = (uCloud.x - ro.y) / rd.y;
  if (t <= 0. || t > tmax) return vec4(0.);
  vec3 p = ro + rd * t;
  int oct = t < 3000. ? 6 : t < 12000. ? 5 : 4;
  float d = cloudDens(p.xz, oct);
  if (d <= 0.001) return vec4(0.);
  vec2 sh = normalize(uSun.xz + 1e-4);
  float d2 = cloudDens(p.xz + sh * 60., 4);
  float above = ro.y > uCloud.x ? 1. : 0.;
  vec3 top = uSunCol * (0.5 + 0.55 * clamp((d - d2) * 2.2 + 0.25, -0.1, 0.7)) * (0.75 + 0.25 * d) + uZenith * 0.7;
  vec3 base = uSunCol * 0.34 * (1. - d * 0.55) + uHorizon * 0.4;
  vec3 col = mix(base, top, above);
  float a = smoothstep(0.0, 0.6, d) * uCloud.w;
  a *= 1. - smoothstep(20000., 60000., t) * 0.5;
  return vec4(fogApply(col, p, rd), a);
}
vec3 withClouds(vec3 col, vec3 wp) {
  vec3 d = wp - uCam; float L = length(d);
  vec4 c = cloudAlong(uCam, d / L, L);
  return mix(col, c.rgb, c.a);
}
`;

export const QUAD_VS = `${HEAD}
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, -1., 1.); }`;

export const SKY_FS = `${HEAD}${COMMON}
in vec2 vNdc; out vec4 frag;
uniform mat4 uInvVP;
void main() {
  vec4 a = uInvVP * vec4(vNdc, 1., 1.);
  vec4 b = uInvVP * vec4(vNdc, -1., 1.);
  vec3 rd = normalize(b.xyz / b.w - a.xyz / a.w);
  vec3 col = skyColor(rd);
  vec4 c = cloudAlong(uCam, rd, 1e7);
  col = mix(col, c.rgb, c.a);
  frag = vec4(col, 1.);
}`;

// ---------------- ocean ----------------
export const WATER_VS = `${HEAD}
layout(location=0) in vec2 aPos;
uniform mat4 uVP;
uniform vec3 uCam;
out vec3 vWP;
void main() {
  float R = 250000.;
  vec3 p = vec3(uCam.x + aPos.x * R, 0., uCam.z + aPos.y * R);
  vWP = p;
  gl_Position = uVP * vec4(p, 1.);
}`;

export const WATER_FS = `${HEAD}${COMMON}
in vec3 vWP; layout(location=0) out vec4 frag;
uniform vec4 uShipA[8];   // pos x, z, fwd x, z
uniform vec4 uShipB[8];   // circle centre x, z, radius, direction (0 = straight)
uniform vec4 uShipC[8];   // half length, half beam, wake strength, stern z
uniform int uNS;
uniform vec4 uSplash[6];  // x, z, radius, strength (bomb splashes, debris rings)
uniform int uNSp;

vec2 wave(vec2 p, float lod) {
  // gradient of a sum of directional waves (swell from the north-east + wind sea)
  vec2 g = vec2(0.);
  vec2 dirs[5] = vec2[5](vec2(0.8, 0.6), vec2(0.95, -0.3), vec2(0.3, 0.95), vec2(-0.6, 0.8), vec2(0.7, 0.72));
  float wl[5] = float[5](90., 41., 23., 11., 5.3);
  float amp[5] = float[5](0.9, 0.42, 0.22, 0.1, 0.045);
  for (int i = 0; i < 5; i++) {
    float k = 6.2832 / wl[i];
    float w = sqrt(9.81 * k);
    float fade = 1. - smoothstep(wl[i] * 6., wl[i] * 60., lod);
    g += dirs[i] * k * amp[i] * cos(dot(dirs[i], p) * k - w * uTime) * fade;
  }
  float nfade = 1. - smoothstep(30., 900., lod);
  g += (vec2(vnoise(p * 0.35 + uTime * 0.3), vnoise(p * 0.35 - uTime * 0.25 + 9.)) - 0.5) * 0.2 * nfade;
  return g;
}
float wakeFoam(vec2 p, int i) {
  vec4 A = uShipA[i], B = uShipB[i], C = uShipC[i];
  vec2 pos = A.xy, fwd = A.zw;
  vec2 right = vec2(fwd.y, -fwd.x);
  vec2 d = p - pos;
  float lx = dot(d, right), lz = dot(d, fwd);
  float foam = 0.;
  // bow wave and hull-side foam
  if (lz > -C.x && lz < C.x + 12.) {
    float bw = C.y * (lz > C.x * 0.4 ? 1. - pow((lz - C.x * 0.4) / (C.x * 0.6 + 12.), 1.6) : 1.);
    float side = abs(lx) - max(bw, 0.);
    float bow = smoothstep(C.x * 0.3, C.x, lz);
    foam += exp(-max(side, 0.) * (0.35 - bow * 0.15)) * step(-2., side) * (0.35 + 0.9 * bow);
  }
  // wake along the track (circle or line) behind the stern
  float behind, lat;
  if (B.w != 0.) {
    vec2 q = p - B.xy;
    float r = length(q);
    lat = r - B.z;
    float aP = atan(q.y, q.x), aS = atan(pos.y - B.y, pos.x - B.x);
    float da = (aS - aP) * sign(B.w);
    da = mod(da, 6.2832);
    behind = da * B.z - C.x;
  } else { behind = -lz - C.x; lat = lx; }
  if (behind > 0. && behind < 2200.) {
    float spread = C.y * 0.8 + behind * 0.035;
    float fade = exp(-behind / 700.) * smoothstep(2200., 1400., behind);
    float core = exp(-pow(lat / spread, 2.)) * (0.45 + 0.55 * exp(-behind / 180.));
    float kel = exp(-pow((abs(lat) - (C.y + behind * 0.3)) / (3. + behind * 0.015), 2.)) * exp(-behind / 350.) * 0.5;
    foam += (core + kel) * fade * (0.55 + 0.7 * vnoise(p * 0.08 + uTime * 0.4));
  }
  return foam * C.z;
}
void main() {
  vec3 V = normalize(uCam - vWP);
  float dist = length(uCam - vWP);
  vec2 p = vWP.xz;
  float lod = dist * (0.6 + 0.4 * (1. - abs(V.y)));
  vec2 g = wave(p, lod);
  vec3 n = normalize(vec3(-g.x * 0.5, 1., -g.y * 0.5));
  n = normalize(mix(n, vec3(0., 1., 0.), smoothstep(4000., 60000., dist) * 0.7));
  vec3 r = reflect(-V, n);
  r.y = abs(r.y);
  float cosT = max(dot(n, V), 0.);
  float F = 0.02 + 0.98 * pow(1. - cosT, 5.);
  vec3 sky = skyBase(r) + uSunCol * pow(max(dot(r, uSun), 0.), 12.) * 0.03;
  float shadow = cloudShadow(vWP);
  // body colour: deep Pacific blue, a little brighter in the light
  vec3 deep = vec3(0.006, 0.034, 0.075);
  vec3 body = deep * (0.45 + 0.55 * shadow) * (0.8 + 0.4 * max(dot(n, uSun), 0.)) ;
  vec3 col = body * (1. - F) + sky * F * (0.55 + 0.45 * shadow);
  // sun glitter
  float spec = pow(max(dot(r, uSun), 0.), 200.) * 0.05 + pow(max(dot(r, uSun), 0.), 20.) * 0.012;
  col += uSunCol * spec * shadow;
  // wakes, bow waves, splashes
  float foam = 0.;
  for (int i = 0; i < 8; i++) { if (i >= uNS) break; foam += wakeFoam(p, i); }
  for (int i = 0; i < 6; i++) {
    if (i >= uNSp) break;
    float dd = length(p - uSplash[i].xy) / uSplash[i].z;
    foam += uSplash[i].w * (exp(-dd * dd * 1.5) + 0.6 * exp(-pow((dd - 1.) * 5., 2.))) * (0.6 + 0.6 * vnoise(p * 0.3));
  }
  // scattered whitecaps
  float wc = smoothstep(0.83, 0.93, vnoise(p * 0.03 + vec2(uTime * 0.05, 0.)) * vnoise(p * 0.11 - uTime * 0.1)) * (1. - smoothstep(600., 4000., dist));
  foam += wc * 0.35;
  foam = clamp(foam, 0., 1.);
  vec3 fcol = (uSunCol * 0.72 * shadow + uZenith * 0.6) * 0.95;
  col = mix(col, fcol, foam * 0.9);
  col += lightAt(vWP + vec3(0., 3., 0.)) * 0.08;
  col = fogApply(col, vWP, -V);
  col = withClouds(col, vWP);
  frag = vec4(col, 1.);
}`;

// ---------------- ships and aircraft ----------------
export const MESH_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in float aMat;
uniform mat4 uVP;
uniform mat4 uModel;
uniform float uFlap;      // dive brake opening, radians
uniform vec3 uHinge;      // z, y0, tan(dihedral)
uniform float uHeave;
out vec3 vWP; out vec3 vLP; out vec3 vN; out float vMat;
void main() {
  vec3 p = aPos, n = aNrm;
  int m = int(aMat + 0.5);
  if ((m == 4 || m == 11) && uFlap > 0.) {
    // split dive brakes: hinged spanwise at the rear spar, trailing edges swing up (upper) and down (lower)
    float a = m == 4 ? uFlap : -uFlap;
    float u = abs(p.x) / 6.33;
    vec2 h = vec2(uHinge.y + abs(p.x) * uHinge.z, uHinge.x + 1.1 * u);
    vec2 q = p.yz - h;
    float c = cos(a), s = sin(a);
    p.yz = h + vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    n.yz = vec2(n.y * c - n.z * s, n.y * s + n.z * c);
  }
  vec4 w = uModel * vec4(p, 1.);
  vWP = w.xyz; vLP = p; vN = mat3(uModel) * n; vMat = aMat;
  gl_Position = uVP * w;
}`;

export const MESH_FS = `${HEAD}${COMMON}
in vec3 vWP; in vec3 vLP; in vec3 vN; in float vMat;
layout(location=0) out vec4 frag;
uniform sampler2D uDeck;
uniform vec4 uDeckRect;   // x0, z0, width, length (local)
uniform vec4 uDamage;     // local x, z, radius, amount
uniform vec4 uDamage2;
uniform int uCockpit;     // 1 = we are sitting in this aircraft
uniform float uProp;      // propeller turning
uniform vec3 uHinge;
uniform float uFlap;
float star(vec2 p, float r) {
  float a = atan(p.y, p.x) + 1.5708, l = length(p) / r;
  float k = 0.5 + 0.5 * cos(a * 5.);
  float edge = mix(0.39, 1.0, pow(k, 3.));
  return step(l, edge);
}
void main() {
  int m = int(vMat + 0.5);
  if (m == 5 && uCockpit == 1) discard;                 // no glass between us and the sky
  if (m == 8 && uProp > 0. && vLP.z > 4.05 && length(vLP.xy) > 0.24) discard;   // the spinning prop is drawn as a blur disc
  vec3 n = normalize(vN);
  vec3 V = normalize(uCam - vWP);
  if (dot(n, V) < 0.) n = -n;
  vec3 alb = vec3(0.3);
  float spec = 0.04, rough = 24.;
  if (m == 0) alb = vec3(0.2, 0.21, 0.22);
  else if (m == 1) {
    vec2 uv = vec2((vLP.x - uDeckRect.x) / uDeckRect.z, (vLP.z - uDeckRect.y) / uDeckRect.w);
    alb = pow(texture(uDeck, uv).rgb, vec3(2.2));
  }
  else if (m == 2) { alb = vec3(0.016, 0.017, 0.019); spec = 0.01; }
  else if (m == 3 || m == 4 || m == 11) {
    // US Navy 1942: blue-grey above, light grey below
    float ref = abs(vLP.x) > 0.62 ? uHinge.y + abs(vLP.x) * uHinge.z : 0.15;
    alb = mix(vec3(0.4, 0.42, 0.44), vec3(0.085, 0.1, 0.12), smoothstep(-0.04, 0.04, vLP.y - ref));
    // insignia: top of the left wing, bottom of the right wing, both fuselage sides
    vec2 ip = vec2(0.);
    float r = 0.;
    if (abs(vLP.x) > 3.4 && abs(vLP.x) < 5.4) { ip = vec2(vLP.x - sign(vLP.x) * 4.3, vLP.z - 0.45); r = 0.62; }
    if (abs(vLP.x) < 0.8 && vLP.z < -2.4 && vLP.z > -4.4 && vLP.y > -0.4) { ip = vec2(vLP.z + 3.35, vLP.y - 0.2); r = 0.42; }
    if (r > 0. && length(ip) < r) alb = star(ip, r) > 0.5 ? vec3(0.55) : vec3(0.03, 0.05, 0.16);
    if (uCockpit == 1 && abs(vLP.x) < 0.66 && vLP.z < 2.25 && vLP.z > -3.) alb = vec3(0.03, 0.036, 0.042);
    // dive-brake perforations: holes you can see the sky through
    if (m == 4 || m == 11) {
      vec2 hp = vec2(abs(vLP.x) * 7.5, vLP.z * 7.5);
      if (length(fract(hp) - 0.5) < 0.3 && uFlap > 0.) discard;
      alb *= 0.9;
    }
    spec = 0.05; rough = 16.;
  }
  else if (m == 5) { alb = vec3(0.05, 0.06, 0.07); spec = 0.5; rough = 300.; }
  else if (m == 6) alb = vec3(0.06, 0.085, 0.05);
  else if (m == 7) alb = vec3(0.4, 0.39, 0.33);
  else if (m == 8) { alb = vec3(0.006); spec = 0.004; }
  else if (m == 9) alb = vec3(0.45, 0.06, 0.05);
  else if (m == 10) alb = vec3(0.24, 0.25, 0.2);
  else if (m == 12) { alb = vec3(0.025, 0.026, 0.028); spec = 0.18; rough = 60.; }            // gunmetal
  else if (m == 13) {                                                                         // perforated cooling jacket
    float ang = atan(vLP.y - 1.14, vLP.x - sign(vLP.x) * 0.095);
    vec2 hp = vec2(ang * 1.6, vLP.z * 28.);
    alb = length(fract(hp) - 0.5) < 0.3 ? vec3(0.004) : vec3(0.03, 0.031, 0.033); spec = 0.16; rough = 50.;
  }
  else if (m == 14) { alb = vec3(0.022, 0.017, 0.012); spec = 0.03; rough = 10.; }             // leather padding
  // damage: charred deck and hull, glowing where it burns
  vec3 emit = vec3(0.);
  for (int k = 0; k < 2; k++) {
    vec4 D = k == 0 ? uDamage : uDamage2;
    if (D.w > 0.) {
      float dd = length(vLP.xz - D.xy) / D.z;
      float nz = fbm(vLP.xz * 0.25 + float(k) * 7., 4);
      float burnt = smoothstep(1.2, 0.3, dd + (nz - 0.5) * 0.8) * D.w;
      alb = mix(alb, vec3(0.02, 0.018, 0.016), burnt);
      float hot = smoothstep(0.55, 0.1, dd + (nz - 0.5) * 0.9) * D.w;
      emit += vec3(4.0, 1.3, 0.3) * hot * (0.4 + 0.6 * vnoise(vLP.xz * 1.3 + uTime * 3.));
    }
  }
  float sh = cloudShadow(vWP);
  float diff = max(dot(n, uSun), 0.);
  vec3 amb = mix(uHorizon * 0.55, uZenith * 1.1, 0.5 + 0.5 * n.y) + vec3(0.02, 0.03, 0.04) * max(-n.y, 0.);
  vec3 col = alb * (uSunCol * diff * sh + amb + lightAt(vWP + n * 0.5));
  vec3 H = normalize(uSun + V);
  col += uSunCol * spec * pow(max(dot(n, H), 0.), rough) * sh * (rough > 100. ? 8. : 1.);
  if (m == 5) col += skyColor(reflect(-V, n)) * 0.25;
  col += emit;
  col = fogApply(col, vWP, -V);
  col = withClouds(col, vWP);
  frag = vec4(col, 1.);
}`;

// ---------------- figures (billboards) ----------------
export const FIG_VS = `${HEAD}
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA;  // world x y z, height m
layout(location=2) in vec4 iB;  // cell, flip, bright, alpha
uniform mat4 uVP; uniform vec3 uRight; uniform vec2 uCells;
out vec2 vUV; out vec3 vWP; out float vA; out float vB;
void main() {
  vec3 r = normalize(vec3(uRight.x, 0., uRight.z));
  vec3 p = iA.xyz + r * (aCorner.x - 0.5) * iA.w + vec3(0., 1., 0.) * aCorner.y * iA.w;
  vec2 c = vec2(mod(iB.x, uCells.x), floor(iB.x / uCells.x));
  float u = iB.y < 0. ? 1. - aCorner.x : aCorner.x;
  vUV = (c + vec2(u, 1. - aCorner.y)) * uCells.y;
  vWP = p; vA = iB.w; vB = iB.z;
  gl_Position = uVP * vec4(p, 1.);
}`;
export const FIG_FS = `${HEAD}${COMMON}
in vec2 vUV; in vec3 vWP; in float vA; in float vB; layout(location=0) out vec4 frag;
uniform sampler2D uAtlas;
void main() {
  vec4 t = texture(uAtlas, vUV);
  if (t.a < 0.1) discard;
  vec3 alb = pow(t.rgb / t.a, vec3(2.2));
  float sh = cloudShadow(vWP);
  vec3 col = alb * (uSunCol * 0.55 * sh + uZenith * 0.9 + uHorizon * 0.3 + lightAt(vWP)) * vB;
  float a = t.a * vA;
  frag = vec4(fogApply(col, vWP, normalize(vWP - uCam)) * a, a);
}`;

// ---------------- particles ----------------
export const PART_VS = `${HEAD}${COMMON}
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iA;   // x,y,z,size
layout(location=2) in vec4 iB;   // rot, alpha, kind, variant (+16 per 0.5 stretch)
layout(location=3) in vec4 iC;   // r,g,b, glow
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp;
out vec2 vUV; out vec4 vB; out vec4 vC; out vec4 vClip; out vec2 vLocal; out vec3 vLit; out float vTr; out float vSh;
void main() {
  vec2 c = aCorner - 0.5;
  float s = sin(iB.x), co = cos(iB.x);
  float v = mod(iB.w, 16.);
  float stretch = 1. + floor(iB.w / 16.) * 0.5;
  vec2 cc = c; cc.x *= stretch;
  vec2 rc = vec2(co * cc.x - s * cc.y, s * cc.x + co * cc.y);
  vec3 p = iA.xyz + (uRight * rc.x + uUp * rc.y) * iA.w;
  vec2 cell = vec2(mod(v, 4.), floor(v / 4.));
  vUV = (cell + aCorner) * 0.25;
  vB = iB; vC = iC; vLocal = c;
  vB.y *= smoothstep(iA.w * 0.6, iA.w * 2.0, length(iA.xyz - uCam));
  vLit = lightAt(iA.xyz);
  vSh = cloudShadow(iA.xyz);
  float dist = length(iA.xyz - uCam);
  vTr = exp(-dist * uHaze * exp(-min(iA.y, uCam.y) / 1600.));
  vClip = uVP * vec4(p, 1.);
  gl_Position = vClip;
}`;
export const PART_FS = `${HEAD}${COMMON}
in vec2 vUV; in vec4 vB; in vec4 vC; in vec4 vClip; in vec2 vLocal; in vec3 vLit; in float vTr; in float vSh;
layout(location=0) out vec4 frag;
uniform sampler2D uPuffs; uniform sampler2D uDepth; uniform vec2 uNearFar; uniform vec2 uRes;
void main() {
  float sceneD = texture(uDepth, gl_FragCoord.xy / uRes).r;
  float linS = sceneD <= 0. ? 1e9 : uNearFar.x / (sceneD * 2. - 1. + uNearFar.y);
  float soft = clamp((linS - vClip.w) / max(0.3, vClip.w * 0.03), 0., 1.);
  float kind = vB.z;
  vec3 fc = uHorizon * 1.02;
  if (kind < 0.5) {
    // smoke / cloud puff, lit by the sun from one side
    float d = texture(uPuffs, vUV).r;
    float a = min(1., pow(d, 1.2) * vB.y * soft);
    if (a < 0.003) discard;
    float side = 0.55 + 0.45 * dot(normalize(vec3(vLocal.x, vLocal.y, 0.3)), normalize(vec3(0.3, 0.8, 0.5)));
    vec3 col = vC.rgb * (uSunCol * 0.6 * side * vSh + uZenith * 0.8 + uHorizon * 0.25 + vLit * 0.8) + vec3(1.0, 0.42, 0.12) * vC.a * pow(d, 1.5);
    col = mix(fc, col, vTr);
    frag = vec4(col * a, a);
  } else if (kind < 1.5) {
    // glow: fire, flash, tracer (additive)
    float r = length(vLocal) * 2.;
    float core = (exp(-r * r * 10.) * 2.5 + exp(-r * r * 2.5) * 0.4) * smoothstep(1., 0.6, r);
    frag = vec4(vC.rgb * core * vB.y * soft * vTr, 0.);
  } else if (kind < 2.5) {
    // solid debris
    float r = length(vLocal) * 2.;
    float a = min(1., smoothstep(1., 0.6, r) * vB.y * soft);
    vec3 col = vC.rgb * (uSunCol * 0.5 + uZenith) + vC.rgb * vC.a * 3.;
    frag = vec4(col * a, a);
  } else {
    // propeller disc: a faint ring
    float r = length(vLocal) * 2.;
    float ring = smoothstep(1.0, 0.9, r) * smoothstep(0.12, 0.3, r);
    float blade = 0.6 + 0.4 * sin(atan(vLocal.y, vLocal.x) * 3. + uTime * 40.);
    float a = ring * vB.y * (0.14 + 0.08 * blade);
    vec3 col = vec3(0.05) + uSunCol * 0.04;
    frag = vec4(col * a, a);
  }
}`;

// a textured full-screen layer composited into the HDR image (the cockpit's painted parts, the sight)
export const LAYER_FS = `${HEAD}
in vec2 vNdc; out vec4 frag;
uniform sampler2D uTex; uniform float uGain;
void main() { vec4 t = texture(uTex, vec2(vNdc.x * 0.5 + 0.5, 0.5 - vNdc.y * 0.5)); frag = vec4(t.rgb * uGain, t.a); }`;
