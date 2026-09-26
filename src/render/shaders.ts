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

// ---------------------------------------------------------------- sky (placeholder until M2)
export const SKY_FS = `${H}
in vec2 v_uv;
uniform vec3 u_top;
uniform vec3 u_bot;
uniform vec2 u_sun;        // uv of the sun
uniform vec2 u_res;
out vec4 o;
void main(){
  vec3 c = mix(u_bot, u_top, smoothstep(0., 1., v_uv.y));
  vec2 d = (v_uv - u_sun) * vec2(u_res.x / u_res.y, 1.);
  float r = length(d);
  c += vec3(1., .75, .45) * (exp(-r * r * 900.) * 3. + exp(-r * r * 40.) * .25 + exp(-r * 6.) * .08);
  o = vec4(c, 1.);
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
