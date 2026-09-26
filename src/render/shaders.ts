// GLSL ES 3.00 sources. All lighting is in linear space; the composite pass tone-maps.

const H = `#version 300 es
precision highp float;
`;

// Mobile GPUs (Mali/Adreno) turn any NaN/Inf into black blocks once bloom spreads it:
// scrub values before they are stored in a render target.
const SAFE = `
vec3 safe(vec3 c){ return mix(vec3(0.), min(c, vec3(256.)), lessThan(abs(c), vec3(1e4))); }
`;

const NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0., a = .5;
  for (int i = 0; i < 4; i++){ s += vnoise(p)*a; p = p*2.03 + vec2(17.1, 3.7); a *= .5; }
  return s;
}
`;

export const FULLSCREEN_VS = `${H}
out vec2 v_uv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

// ---------------------------------------------------------------- the world (one fullscreen pass)
// Sky, the sea behind the wave, the wave (face, lip, tube, whitewater) and the water in front
// of it, per pixel. The wave's shape along x comes from a small per-column texture filled from
// wave data every frame. We look at the face from the channel: the eye sits `u_hz` above the
// water, `u_d0` away from the wave, so the flat sea around the wave is in perspective while the
// wave itself is the gameplay plane (x along the wave, y up the wall).
// Value noise from a mipmapped random texture: one fetch instead of four hashes, and the mips
// filter out detail finer than a pixel (no shimmer on the distant sea).
const TEX_NOISE = `
uniform sampler2D u_noise;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ return texture(u_noise, p * (1. / 256.)).r; }
float fbm(vec2 p){ return vnoise(p) * .5 + vnoise(p * 2.03 + vec2(17.1, 3.7)) * .25 + vnoise(p * 4.1 + vec2(5.3, 9.1)) * .125 + vnoise(p * 8.3 + vec2(1.7, 13.3)) * .0625; }
`;

export const WORLD_FS = `${H}
${TEX_NOISE}
in vec2 v_uv;
uniform vec4 u_view;      // cam x, cam y, view w, view h (world units; h includes the vertical stretch)
uniform vec2 u_res;
uniform sampler2D u_col;  // per column: H, pocket, closeout 0..1, flat 0..1
uniform vec2 u_colX;      // x of the first column, 1 / span
uniform float u_xb;       // break position
uniform float u_time;
uniform float u_hz;       // eye height = horizon (world y)
uniform float u_d0;       // eye -> wave distance
uniform float u_detail;   // 0..1 surface detail (quality)
uniform vec3 u_top, u_hor, u_sunCol, u_amb, u_deep, u_scat, u_back, u_cloud;
uniform vec3 u_sun;       // screen x, height above the horizon (fraction of screen height), visibility
uniform vec3 u_moon;
uniform float u_backX;    // screen x of the light behind the wave
uniform float u_night;
out vec4 o;

float asp, hzUv, pxY;

vec4 column(float x){ return texture(u_col, vec2((x - u_colX.x) * u_colX.y, .5)); }
float sq(float x){ return x * x; }
// light passing through water of a given thickness (0 = paper thin): red goes first
vec3 transmit(float k){ return exp(-vec3(3.2, 1., .8) * (.08 + k)); }
// the light behind the wave: its own colour through thin water, whiter (so turquoise) through thick
vec3 backLight(float thin){ return mix(vec3(dot(u_back, vec3(.3, .5, .2))), u_back, thin); }

vec3 skyGrad(float e){
  float s = clamp(e / .7, 0., 1.);
  s = 1. - (1. - s) * (1. - s);
  return mix(u_hor, u_top, s);
}

vec3 sky(vec2 uv){
  float e = uv.y - hzUv;
  vec3 c = skyGrad(e);
  vec2 sd = vec2((uv.x - u_sun.x) * asp, e - u_sun.y);
  float r = length(sd);
  float sv = u_sun.z;
  // halo, glow along the horizon under the sun, disc
  c += u_sunCol * sv * (exp(-r * 6.) * .03 + exp(-r * r * 90.) * .04 + exp(-sd.x * sd.x * 3.) * exp(-max(e, 0.) * 9.) * .05);
  c += u_sunCol * sv * smoothstep(.034, .03, r) * 2.;
  // moon
  vec2 md = vec2((uv.x - u_moon.x) * asp, e - u_moon.y);
  float mr = length(md);
  float lit = smoothstep(.029, .026, mr) * (.75 + .25 * vnoise(md * 160.));
  c += vec3(.8, .85, .95) * u_moon.z * (lit * 1.4 + exp(-mr * 14.) * .05);
  // stars
  if (u_night > .02) {
    vec2 g = vec2(uv.x * asp, e) * 70.;
    vec2 cell = floor(g), f = fract(g) - .5;
    float h = hash12(cell);
    vec2 off = vec2(hash12(cell + 7.1), hash12(cell + 3.3)) - .5;
    float st = step(.955, h) * smoothstep(.1, 0., length(f - off * .7));
    st *= .55 + .45 * sin(u_time * (1.5 + h * 4.) + h * 40.);
    c += vec3(.75, .82, 1.) * st * u_night * smoothstep(.02, .15, e) * (1. - lit) * 1.6;
  }
  // clouds: stretched bands, drifting with the ride
  float band = smoothstep(.03, .14, e) * (1. - smoothstep(.55, 1., e));
  if (band > 0.) {
    vec2 cp = vec2((uv.x * asp + u_view.x * 1.4e-5) * 1.3 + u_time * .004, e * 6.5);
    float n = fbm(cp);
    float cl = smoothstep(.56, .8, n) * band;
    vec3 cc = u_cloud * (.5 + .55 * exp(-r * 2.2)) * mix(1., .72, smoothstep(.62, .85, n));
    c = mix(c, cc, cl * .88);
  }
  return c;
}

// top of the water mass at x: the face, the lip pitching over, or the whitewater pile
float foamTop(float d, float H, float x){
  float L = .6 * H;
  float k = max(d - .5 * L, 0.);
  float boom = exp(-sq((d - .9 * L) / (.45 * H)));
  return H * (.3 + .62 * exp(-k / (1.4 * H)) + .18 * boom)
    + H * .07 * (vnoise(vec2(x * .018 - u_time * .7, u_time * .4)) - .5);
}
float massTop(float x, float H, float d){
  if (d < 0.) return H * (1. + .012 * (vnoise(vec2(x * .025, u_time * .8)) - .5));
  float L = .6 * H;
  float top = 0.;
  if (d < L) top = H * (1. + .07 * sin(3.1416 * clamp(d / L * 1.3, 0., 1.))) * (1. - smoothstep(.65 * L, L, d));
  if (d > .45 * L) top = max(top, foamTop(d, H, x));
  return top;
}

vec3 foamCol(vec2 wp, float shade){
  vec3 f = (u_amb * .8 + u_sunCol * u_sun.z * .04 + u_back * .12) * shade;
  // bioluminescence: breaking water glows blue at night
  float b = vnoise(wp * .035 + vec2(0., u_time * .9));
  f += vec3(.03, .45, 1.1) * u_night * (.25 + b * b * 1.6) * shade;
  return f;
}

vec3 whitewater(vec2 wp, float H, float ft){
  float n = fbm(vec2(wp.x * .011 + u_time * .06, wp.y * .015 - u_time * .38));
  float shade = (.5 + .65 * n) * mix(.62, 1.05, smoothstep(0., ft, wp.y));
  vec3 f = foamCol(wp, shade);
  // aerated turquoise showing between the billows
  return mix(f, u_deep + u_scat * u_amb * .5, smoothstep(.42, .22, n) * .45);
}

// simplified wave colour at a height (for reflections in the sea in front)
vec3 faceLite(float y, vec4 cd, float d){
  float v = clamp(y / cd.x, 0., 1.);
  float thin = smoothstep(.4, 1., v) * mix(.35, 1., clamp(cd.y, 0., 1.));
  vec3 c = u_deep * (.5 + .5 * u_amb) + u_scat * u_amb * .3 + transmit(1. - thin * .75) * backLight(thin) * thin * thin * .8;
  return mix(c, foamCol(vec2(y), .55), smoothstep(.2, .6, d / cd.x));
}

vec3 waterPlane(vec2 wp, vec2 uv){
  float dy = max(u_hz - wp.y, u_hz * .002);
  float z = u_hz * u_d0 / dy;
  vec2 P = vec2(u_view.x + (wp.x - u_view.x) * z / u_d0, z);
  // world units covered by one pixel along the depth: fade waves smaller than that
  float foot = z * z / (u_hz * u_d0) * pxY;
  float t = u_time;
  vec2 g = vec2(0.);
  vec2 d1 = vec2(.15, .99), d2 = vec2(-.42, .91), d3 = vec2(.7, .71), d4 = vec2(-.86, .51), d5 = vec2(.33, -.94);
  g += d1 * .07 * cos(dot(d1, P) * .014 - t * .9) * clamp(1. - foot * .014 * 1.2, 0., 1.);
  g += d2 * .06 * cos(dot(d2, P) * .027 - t * 1.25) * clamp(1. - foot * .027 * 1.2, 0., 1.);
  g += d3 * .05 * cos(dot(d3, P) * .047 - t * 1.7) * clamp(1. - foot * .047 * 1.2, 0., 1.);
  g += d4 * .045 * cos(dot(d4, P) * .08 - t * 2.2) * clamp(1. - foot * .08 * 1.2, 0., 1.);
  g += d5 * .04 * cos(dot(d5, P) * .13 - t * 2.9) * clamp(1. - foot * .13 * 1.2, 0., 1.);
  // small chop on top of the swell
  float fq = clamp(1. - foot * .09, 0., 1.);
  if (fq > 0.) {
    vec2 cp = P * vec2(.06, .09) + vec2(t * .2, -t * .4);
    float c0 = vnoise(cp), cx = vnoise(cp + vec2(.25, 0.)), cz = vnoise(cp + vec2(0., .25));
    g += vec2(cx - c0, cz - c0) * .5 * fq;
  }
  vec3 n = normalize(vec3(-g.x, 1., -g.y));
  vec3 V = normalize(vec3(0., u_hz, -z));
  vec3 R = reflect(-V, n);
  float q = 1. - max(dot(n, V), 0.);
  float fr = .02 + .98 * q * q * q * q * q;
  float s = R.y / max(R.z, .02);
  vec3 refl;
  bool hitWave = false;
  if (z < u_d0) {
    // the reflected ray may hit the wave standing at distance d0
    float xw = P.x + R.x / max(R.z, .02) * (u_d0 - z);
    vec4 cw = column(xw);
    float hy = (u_d0 - z) * s, dw = u_xb - xw;
    if (hy < massTop(xw, cw.x, dw)) { refl = faceLite(hy, cw, dw) * .75; hitWave = true; }
  }
  float e = s * u_d0 / u_view.w;
  if (!hitWave) {
    refl = skyGrad(e);
    float rx = uv.x + R.x / max(R.z, .02) * u_d0 / u_view.z;
    float dd = sq((rx - u_sun.x) * asp) + sq(e - u_sun.y);
    refl += u_sunCol * u_sun.z * (exp(-dd * 1500.) * 6. + exp(-dd * 80.) * .15);
    float md = sq((rx - u_moon.x) * asp) + sq(e - u_moon.y);
    refl += vec3(.8, .85, .95) * u_moon.z * exp(-md * 1200.) * 2.;
  }
  vec3 c = mix(u_deep * (.5 + .6 * u_amb) + u_scat * u_amb * .1, refl, fr);
  // haze towards the horizon
  return mix(c, u_hor, (1. - exp(-max(z - u_d0, 0.) / (u_d0 * 6.))) * .8);
}

float ripple(vec2 p){
  float t = u_time;
  // texture lines along the wave, drawn up the face as the wall rises
  float h = vnoise(p * vec2(.006, .045) + vec2(t * .05, t * .45)) * .6
          + vnoise(p * vec2(.022, .11) + vec2(t * .2, t * .7)) * .3;
  if (u_detail > .7) h += vnoise(p * vec2(.08, .22) + vec2(t * .5, t)) * .14;
  return h;
}

float backLobe(vec2 uv){ float x = (uv.x - u_backX) * asp; return .2 + .6 * exp(-x * x * 4.) + 1.8 * exp(-x * x * 40.); }

vec3 face(vec2 wp, vec2 uv, vec4 cd, float d){
  float H = cd.x, P = cd.y, C = cd.z, F = cd.w;
  float v = clamp(wp.y / H, 0., 1.);
  // far ahead of the break a rounded hump, in the pocket a steep wall pitching over at the top
  float steep = clamp(P * 1.1 + C * .6, 0., 1.) * (1. - .45 * F);
  // sets of stronger water along the wave, so the wall isn't the same everywhere
  float lump = vnoise(vec2(wp.x * .0035, 3.7));
  float th = mix(.12, 1.45, smoothstep(0., .55, v)) + smoothstep(.6, 1., v) * mix(-.7, .55, steep);
  vec3 n = vec3(0., cos(th), sin(th));
  vec3 up = vec3(0., sin(th), -cos(th));
  float e = 3.;
  float h0 = ripple(wp), hx = ripple(wp + vec2(e, 0.)), hy = ripple(wp + vec2(0., e));
  vec2 g = vec2(hx - h0, hy - h0) * (mix(2., 6., smoothstep(.1, .5, v)) / e);
  n = normalize(n - vec3(g.x, 0., 0.) - up * g.y);
  vec3 V = normalize(vec3(0., (u_hz - wp.y) / u_d0, 1.));
  float q = 1. - max(dot(n, V), 0.);
  float fr = .03 + .97 * q * q * q;
  vec3 R = reflect(-V, n);
  // low on the concave face the reflection runs back into the wall above; higher up it sees the sky
  vec3 refl = R.z < 0. ? faceLite(wp.y + H * .5, cd, d) * .6
    : R.y > 0. ? skyGrad(R.y / max(R.z, .15) * u_d0 / u_view.w) : mix(u_deep, u_hor * .3, exp(R.y * 6.));
  // light through the thin top of the wall: the turquoise glow
  float thin = smoothstep(.52, 1., v);
  thin *= thin * mix(.4, 1., steep) * (.7 + .6 * lump);
  // the very edge of the lip is paper thin: it passes the light's own colour (gold at sunset)
  float edgeT = smoothstep(.86, 1., v) * mix(.3, 1., steep);
  vec3 sss = u_scat * u_amb * (.1 + .5 * thin) + transmit((1. - thin * .75) * (1. - edgeT * .85)) * backLight(max(thin, edgeT)) * backLobe(uv) * (thin + edgeT * .4) * 1.3;
  vec3 c = mix(u_deep * (.45 + .4 * u_amb) + sss, refl, fr);
  // the hollow under a pitching lip is in its own shade
  float hollow = steep * smoothstep(.6, .8, v) * (1. - smoothstep(.86, .95, v));
  c *= 1. - .4 * hollow;
  // thin backlit rim along the crest
  c += transmit(.25) * u_back * exp(-(H - wp.y) / (H * .02)) * mix(.4, 1.2, steep);
  // white mane: feathering near the break, thick and pulsing on a closeout
  float feather = smoothstep(-1.4 * H, 0., d);
  float pulse = .75 + .25 * sin(u_time * 9. + wp.x * .05);
  float mt = H * (.012 + .08 * C * pulse + .06 * feather);
  float mn = vnoise(vec2(wp.x * .09, wp.y * .05 - u_time * 1.5));
  c = mix(c, foamCol(wp, .95), smoothstep(mt * (.35 + mn), 0., H - wp.y) * .95);
  // spume at the foot of the wall
  c = mix(c, foamCol(wp, .6), exp(-wp.y / (H * .008)) * (.15 + .3 * vnoise(vec2(wp.x * .05, u_time))));
  return c;
}

vec3 waterMass(vec2 wp, vec2 uv, vec4 cd, float d){
  float H = cd.x, L = .6 * H;
  if (d < 0.) return face(wp, uv, cd, d);
  if (d >= L) return whitewater(wp, H, foamTop(d, H, wp.x));
  // the lip pitching over: a thin falling curtain, the tube under its edge
  float s = d / L;
  float edge = H * (1.02 - s * s * 1.1) + H * .05 * (vnoise(vec2(wp.x * .08, u_time * 3.)) - .5);
  float lobe = backLobe(uv);
  float st = vnoise(vec2(wp.x * .07 - wp.y * .03, wp.y * .02 + u_time * 2.));
  vec3 c;
  if (wp.y > edge) {
    c = (u_deep * .4 + u_scat * u_amb * .6 + transmit(.3 + .2 * s) * u_back * lobe * 1.5) * (.8 + .4 * st);
    float fo = smoothstep(.3, 1., s) * (.4 + .6 * st) + smoothstep(H * .1, 0., wp.y - edge) * .7;
    c = mix(c, foamCol(wp, 1.), clamp(fo, 0., 1.));
    c += transmit(.25) * u_back * exp(-(massTop(wp.x, H, d) - wp.y) / (H * .03)) * .9;
  } else {
    c = face(wp, uv, cd, d) * mix(1., .3, smoothstep(0., .6, s));
    c += transmit(.5) * u_back * lobe * .5 * exp(-(edge - wp.y) / (H * .1)) * smoothstep(0., .3, s);
    c = mix(c, foamCol(wp, .8), smoothstep(.6, 1., s) * smoothstep(H * .25, 0., wp.y) * (.5 + .5 * st));
  }
  if (d > .45 * L) {
    // the whitewater bursts in from where the lip lands (bottom) and from the crest
    float ft = foamTop(d, H, wp.x);
    float grow = smoothstep(.45 * L, L, d + H * .25 * (vnoise(wp * .03) - .5));
    float fa = smoothstep(ft, ft - H * .08, wp.y) * clamp(grow * 1.4 - .4 * sin(3.1416 * clamp(wp.y / H, 0., 1.)) * (1. - grow), 0., 1.);
    c = mix(c, whitewater(wp, H, ft), fa);
  }
  return c;
}

void main(){
  vec2 uv = v_uv;
  asp = u_res.x / u_res.y;
  pxY = u_view.w / u_res.y;
  vec2 wp = u_view.xy + (uv - .5) * u_view.zw;
  hzUv = (u_hz - u_view.y) / u_view.w + .5;
  vec4 cd = column(wp.x);
  float H = cd.x, d = u_xb - wp.x, L = .6 * H;
  float top = massTop(wp.x, H, d);
  float soft = d > .45 * L ? H * .03 : 0.;
  float cov = wp.y >= 0. ? clamp((top - wp.y) / (pxY + soft) + .5, 0., 1.) : 0.;
  vec3 c = vec3(0.);
  if (cov < 1.) {
    c = wp.y > u_hz ? sky(uv) : waterPlane(wp, uv);
    // spray mist hanging over the whitewater
    if (d > .3 * L && wp.y >= 0.) {
      float m = exp(-max(wp.y - top, 0.) / (H * .35)) * smoothstep(.3 * L, L, d) * exp(-max(d - 2. * H, 0.) / (3. * H));
      c += (u_amb * .22 + u_back * .08 + vec3(.02, .2, .45) * u_night) * m * (.5 + .5 * vnoise(wp * .02 + vec2(u_time * .3, 0.)));
    }
  }
  if (cov > 0.) c = mix(c, waterMass(wp, uv, cd, d), cov);
  if (wp.y < 0. && d > .4 * L) {
    // whitewater spreading towards us in front of the break
    float sk = H * .12 * smoothstep(.4 * L, L, d) * exp(-max(d - L, 0.) / (4. * H));
    float n = vnoise(vec2(wp.x * .03 - u_time * .25, wp.y * .1));
    c = mix(c, whitewater(wp, H, sk) * .85, smoothstep(-sk * (.5 + .8 * n), 0., wp.y) * .9);
  }
  o = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- soft sprites (spray, mist, drops)
// Instanced quads; colours premultiplied like the shapes (alpha 0 = additive glow).
export const SPRITE_VS = `${H}
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_ps;   // x, y, radius (x units), hardness 0..1
layout(location=2) in vec4 a_col;
uniform vec4 u_view;               // cam x, cam y, 2/w, 2/h
uniform float u_ey;
out vec2 v_uv;
out vec4 v_col;
out float v_hard;
void main(){
  v_uv = a_corner;
  v_col = a_col;
  v_hard = a_ps.w;
  vec2 p = a_ps.xy + a_corner * vec2(a_ps.z, a_ps.z / u_ey);
  gl_Position = vec4((p - u_view.xy) * u_view.zw, 0., 1.);
}`;

export const SPRITE_FS = `${H}
in vec2 v_uv;
in vec4 v_col;
in float v_hard;
out vec4 o;
void main(){
  float d2 = dot(v_uv, v_uv);
  if (d2 > 1.) discard;
  float soft = exp(-d2 * 4.) * (1. - d2);
  float hard = smoothstep(1., .6, d2);
  o = v_col * mix(soft, hard, v_hard);
}`;

// ---------------------------------------------------------------- flat shapes (placeholder graphics)
// Premultiplied colour: alpha 0 with rgb > 0 adds light (glow), alpha 1 covers.
export const FLAT_VS = `${H}
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_col;
uniform vec4 u_view;       // cam x, cam y, 2s/W, 2s/H (world -> clip)
out vec4 v_col;
void main(){
  v_col = a_col;
  gl_Position = vec4((a_pos - u_view.xy) * u_view.zw, 0., 1.);
}`;

export const FLAT_FS = `${H}
in vec4 v_col;
out vec4 o;
void main(){ o = v_col; }`;

// ---------------------------------------------------------------- bloom
export const DOWN_FS = `${H}
${SAFE}
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_pre;       // 1 on the first (threshold) pass
uniform float u_thresh;
out vec4 o;
void main(){
  vec2 t = u_texel;
  vec3 a = texture(u_src, v_uv + t * vec2(-1., -1.)).rgb;
  vec3 b = texture(u_src, v_uv + t * vec2( 1., -1.)).rgb;
  vec3 c = texture(u_src, v_uv + t * vec2(-1.,  1.)).rgb;
  vec3 d = texture(u_src, v_uv + t * vec2( 1.,  1.)).rgb;
  vec3 e = texture(u_src, v_uv).rgb;
  vec3 s = safe((a + b + c + d) * .125 + e * .5);
  if (u_pre > .5) {
    float br = max(s.r, max(s.g, s.b));
    float knee = u_thresh * .5;
    float rq = clamp(br - u_thresh + knee, 0., 2. * knee);
    rq = rq * rq / (4. * knee + 1e-4);
    s *= max(rq, br - u_thresh) / max(br, 1e-4);
  }
  o = vec4(s, 1.);
}`;

export const UP_FS = `${H}
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_amt;
out vec4 o;
void main(){
  vec2 t = u_texel;
  vec3 s = texture(u_src, v_uv).rgb * 4.;
  s += texture(u_src, v_uv + t * vec2(-1., 0.)).rgb * 2.;
  s += texture(u_src, v_uv + t * vec2( 1., 0.)).rgb * 2.;
  s += texture(u_src, v_uv + t * vec2(0., -1.)).rgb * 2.;
  s += texture(u_src, v_uv + t * vec2(0.,  1.)).rgb * 2.;
  s += texture(u_src, v_uv + t * vec2(-1., -1.)).rgb;
  s += texture(u_src, v_uv + t * vec2( 1., -1.)).rgb;
  s += texture(u_src, v_uv + t * vec2(-1.,  1.)).rgb;
  s += texture(u_src, v_uv + t * vec2( 1.,  1.)).rgb;
  o = vec4(s / 16. * u_amt, 1.);
}`;

// ---------------------------------------------------------------- composite
export const COMPOSITE_FS = `${H}
${SAFE}
${NOISE}
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bloomAmt;
uniform float u_exposure;
uniform float u_ca;
uniform vec4 u_shock;      // center uv, radius (in height units), amplitude
uniform vec3 u_lift;
uniform float u_sat;
uniform float u_fade;      // 0..1 fade to black
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec2 uv = v_uv;
  float asp = u_res.x / u_res.y;
  vec2 dd = (uv - u_shock.xy) * vec2(asp, 1.);
  float r = length(dd);
  float kq = (r - u_shock.z) * 16.;
  float k = exp(-kq * kq) * u_shock.w;
  uv -= (dd / (r + 1e-4)) * k * .025 / vec2(asp, 1.);
  vec2 cd = (uv - .5) * (u_ca + k * .02);
  vec3 c = vec3(texture(u_scene, uv + cd).r, texture(u_scene, uv).g, texture(u_scene, uv - cd).b);
  c = safe(c) + safe(texture(u_bloom, uv).rgb) * u_bloomAmt;
  c *= u_exposure;
  c = aces(c);
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, u_sat);
  c += u_lift * (1. - l);
  vec2 q = v_uv - .5;
  c *= 1. - dot(q * vec2(asp > 1. ? .7 : 1., 1.), q) * 1.1;
  c = pow(max(c, 0.), vec3(1. / 2.2));
  c += (hash12(gl_FragCoord.xy + fract(u_time * 7.3) * 311.) - .5) * .035;
  c *= 1. - u_fade;
  o = vec4(c, 1.);
}`;
