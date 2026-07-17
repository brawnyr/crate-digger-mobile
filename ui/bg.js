/* The record-wheel swirl behind the glass — the blood-flow shader
   (myspace create/blood-flow.html) repoured in the ASCII vinyl's own
   conic-wheel colors: cream, amber, caramel, rose, violet. Separate
   file for CSP: no inline scripts. */

const bgCanvas = document.getElementById('bg');
const gl = bgCanvas.getContext('webgl2', { antialias: false });

if (gl) {

const RENDER_H = 1080; /* render height cap — the flow is soft, upscaling is free perf */

const VERT = `#version 300 es
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  uRes;
uniform float uTime;

float hash11(float n){ n = fract(n*0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float hash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
vec2  hash22(vec2 p){ vec3 q = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz)*q.zy); }

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i),             hash21(i + vec2(1,0)), u.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 17.7; a *= 0.5; }
  return s;
}

/* the vinyl's own wheel as a depth ramp — deeps carry the room,
   rose/amber/cream ride only the crests:
   dark plum -> deep violet -> violet -> rose -> amber -> cream */
vec3 wheel(float v){
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.030, 0.016, 0.050), vec3(0.270, 0.185, 0.420), smoothstep(0.08, 0.50, v));
  c = mix(c, vec3(0.435, 0.306, 0.659), smoothstep(0.50, 0.70, v));
  c = mix(c, vec3(0.604, 0.435, 0.839), smoothstep(0.70, 0.84, v));
  c = mix(c, vec3(0.933, 0.576, 0.733), smoothstep(0.84, 0.93, v));
  c = mix(c, vec3(0.902, 0.690, 0.416), smoothstep(0.93, 0.975, v));
  c = mix(c, vec3(0.969, 0.925, 0.824), smoothstep(0.975, 0.995, v));
  return c;
}

void main(){
  float t = uTime * 0.055;
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  uv.y = -uv.y;

  /* slow systole under everything */
  float ph = fract(uTime * 0.16);
  float pulse = pow(0.5 + 0.5*cos(6.2832*ph), 3.0);

  /* three drifting vortices wind the space, coil and release */
  vec2 p = uv;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 c = (hash22(vec2(fi*7.0 + 3.0, fi*13.0 + 1.0)) - 0.5) * 1.5;
    c += 0.22 * vec2(cos(t*(0.5 + 0.3*fi) + fi*2.1), sin(t*(0.4 + 0.25*fi) + fi*4.7));
    vec2 d = p - c;
    float fall = exp(-dot(d, d) * 2.6);
    float a = (3.0*sin(t*(0.28 + 0.10*hash11(fi + 2.2)) + fi*2.6) + pulse*0.06) * fall
            * (hash11(fi + 9.1) > 0.5 ? 1.0 : -1.0);
    p = c + rot(a)*d;
  }

  /* nested flow warp on top of the swirl: the churn */
  vec2 q = vec2(fbm(p*1.6 + t*0.9), fbm(p*1.6 - t*0.7 + 5.2));
  vec2 r = vec2(fbm(p*1.6 + 2.6*q + 1.7 + t*0.35), fbm(p*1.6 + 2.6*q + 8.3 - t*0.45));
  float v = fbm(p*1.8 + 3.0*r);
  v = v*0.8 + 0.35*fbm(p*5.5 + 4.0*r - t*1.2);
  v = clamp((v - 0.18) * 1.55, 0.0, 1.0);

  vec3 col = wheel(v * (0.94 + 0.10*pulse));

  /* wet sheen: light the field by its own gradient */
  vec2 g = vec2(dFdx(v), dFdy(v)) * uRes.y * 0.12;
  vec3 n = normalize(vec3(-g, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.72));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  col += vec3(1.0, 0.94, 0.85) * spec * 0.30 * smoothstep(0.25, 0.6, v);

  float vig = smoothstep(1.35, 0.3, length(uv));
  col *= 0.28 + 0.72*vig;
  col = col / (1.0 + col*0.45);
  col = pow(col, vec3(0.92, 0.92, 0.94));

  col += (hash21(gl_FragCoord.xy + fract(uTime)*371.0) - 0.5) * 0.012;

  outColor = vec4(col, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
  throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const uRes  = gl.getUniformLocation(prog, 'uRes');
const uTime = gl.getUniformLocation(prog, 'uTime');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(1, RENDER_H / (bgCanvas.clientHeight * dpr)) * dpr;
  const w = Math.round(bgCanvas.clientWidth * scale);
  const h = Math.round(bgCanvas.clientHeight * scale);
  if (bgCanvas.width !== w || bgCanvas.height !== h) {
    bgCanvas.width = w;
    bgCanvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function frame(ms) {
  resize();
  gl.uniform2f(uRes, bgCanvas.width, bgCanvas.height);
  gl.uniform1f(uTime, ms * 0.001);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

}
