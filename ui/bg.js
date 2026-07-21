/* The sky behind the glass — one piece of cool math now: a single
   fbm field folded through itself twice (iq's domain warp — the
   whole weather in three lines), pressed through the family bayer
   into ten hard swatches of the pink-and-blue wheel on the
   fat-pixel grid itself (180 rows — animal well's own vertical
   resolution). No sun, no clouds, no stars — just the fold, melting
   slow; indigo pools at the top, peach at the floor, and the mids
   stay calm so the glass floats. Twin of dig.html's sky — change
   one, change both. Separate file for CSP: no inline scripts. */

const bgCanvas = document.getElementById('bg');
const gl = bgCanvas.getContext('webgl2', { antialias: false });

if (gl) {

const RENDER_H = 180; /* the sprite-sheet look: few rows, fat pixels */

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

float hash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i),             hash21(i + vec2(1,0)), u.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = p*2.03 + 17.7; a *= 0.5; }
  return s;
}

/* the 4x4 ordered dither — the family grain, same as the planet wears */
float bayer(vec2 fc){
  int b[16] = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
  ivec2 p = ivec2(mod(fc, 4.0));
  return (float(b[p.y*4 + p.x]) + 0.5) / 16.0;
}

/* the wheel plays pink and blue: twilight indigo (never black),
   periwinkle, lavender violet, hot pink, melted coral, peach glow */
vec3 ramp(float v){
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.078, 0.075, 0.243), vec3(0.302, 0.373, 0.761), smoothstep(0.02, 0.40, v)); /* twilight indigo -> periwinkle */
  c = mix(c, vec3(0.576, 0.400, 0.812), smoothstep(0.36, 0.60, v)); /* -> lavender violet */
  c = mix(c, vec3(0.910, 0.447, 0.655), smoothstep(0.56, 0.78, v)); /* -> hot pink        */
  c = mix(c, vec3(0.965, 0.573, 0.475), smoothstep(0.76, 0.89, v)); /* -> melted coral    */
  c = mix(c, vec3(1.000, 0.827, 0.663), smoothstep(0.87, 0.99, v)); /* -> peach glow      */
  return c;
}

void main(){
  vec2 px = floor(gl_FragCoord.xy);  /* the fat pixel IS the unit */
  float t = uTime*0.05;

  /* the fold: warp the field by the field by the field */
  vec2 p = px/uRes.y*2.2;
  vec2 q = vec2(fbm(p + t),                         fbm(p + vec2(7.3, 1.2) - t*0.7));
  vec2 r = vec2(fbm(p + 2.6*q + vec2(11.0, 3.0) + t*0.4),
                fbm(p + 2.6*q + vec2(4.7, 9.2)  - t*0.3));
  float v = fbm(p + 2.4*r);

  /* dusk bias: the glow pools at the floor, the dark keeps the top */
  v = v*1.25 + (1.0 - px.y/uRes.y)*0.25 - 0.12;

  /* the press: ten hard swatches through the family bayer sieve */
  float vq = floor(clamp(v, 0.0, 1.0)*10.0 + bayer(px)) / 10.0;
  outColor = vec4(ramp(vq), 1.0);
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
