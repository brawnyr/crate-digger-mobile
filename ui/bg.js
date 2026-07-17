/* The sky behind the glass — soft creamy psychedelia in the UI's own
   colors. The palette is lifted straight from style.css (cream, latte,
   rust, rose, violet over a plum deep) so the background and the glass
   are one thing. The paint is twice-folded domain-warped fbm — no
   center, no subject, colors mixed all over — and five organic friends
   wander through it on separate paths, meeting and disappearing on
   their own slow life cycles. Everything blends smooth as milk: no
   dither, no hard bands, low contrast in the mids so the frosted
   glass floats on top instead of fighting it.
   Separate file for CSP: no inline scripts. */

const bgCanvas = document.getElementById('bg');
const gl = bgCanvas.getContext('webgl2', { antialias: false });

if (gl) {

const RENDER_H = 720; /* the field is soft — upscaling only adds cream */

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
  for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 17.7; a *= 0.5; }
  return s;
}

/* the UI's wheel, coffee edition: purple deeps (never blue-black),
   violet, mocha tan, rose, milky coffee, cream */
vec3 ramp(float v){
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.145, 0.063, 0.220), vec3(0.478, 0.161, 0.769), smoothstep(0.02, 0.40, v)); /* purple deep -> psychedelic purple */
  c = mix(c, vec3(0.671, 0.502, 0.412), smoothstep(0.36, 0.60, v)); /* -> mocha tan     */
  c = mix(c, vec3(0.949, 0.373, 0.671), smoothstep(0.56, 0.78, v)); /* -> psychedelic pink */
  c = mix(c, vec3(0.847, 0.702, 0.573), smoothstep(0.76, 0.89, v)); /* -> milky coffee  */
  c = mix(c, vec3(0.961, 0.918, 0.847), smoothstep(0.87, 0.99, v)); /* -> cream         */
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime * 0.04;

  /* the friends: soft presences wandering the paint on their own
     paths — they meet, they mingle, they fade out and are gone */
  float friends = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float ph = fi*2.399; /* golden-angle spread, no two paths alike */
    vec2 fp = vec2(sin(t*(1.3 + 0.4*fi) + ph)*0.85,
                   cos(t*(1.0 + 0.3*fi) + ph*1.7)*0.55);
    float life = smoothstep(-0.35, 0.5, sin(uTime*(0.10 + 0.03*fi) + ph*3.1));
    vec2 d = uv - fp;
    friends += exp(-dot(d, d)*6.0) * life;
  }

  /* the paint: fold the field through itself twice — marbling */
  vec2 p = uv * 1.9;
  vec2 q = vec2(fbm(p + vec2(t*0.9, 0.0)),
                fbm(p + vec2(5.2, 1.3) - t*0.7));
  vec2 w = vec2(fbm(p + 3.0*q + vec2(1.7, 9.2) + t*0.5),
                fbm(p + 3.0*q + vec2(8.3, 2.8) - t*0.4));
  float paint = fbm(p + 3.2*w);

  /* life: the field breathes through the palette on a slow clock,
     stirred by the warp, lifted where a friend is passing */
  float flow = paint*2.2 + w.x*1.2 - w.y*0.7 + friends*0.9 + t*0.35
             + 0.18*sin(uv.x*3.0 + uv.y*2.0 + paint*4.0 + t*2.0); /* the wavy in the pink */

  /* ping-pong through the ramp — every color everywhere, no seam —
     softened toward the middle so the mids stay quiet under glass */
  float v = abs(fract(flow) * 2.0 - 1.0);
  v = v*v*(3.0 - 2.0*v); /* ease the turnarounds, kill any crease */
  v = mix(v, 0.42, 0.22); /* pull gently toward the calm middle */

  vec3 col = ramp(v);

  /* soft breath of light where friends gather, creamy not hot */
  col += vec3(0.10, 0.07, 0.05) * friends;

  /* gentle vignette and a milk rinse — the UI floats on this */
  float vig = smoothstep(1.55, 0.4, length(uv));
  col *= 0.66 + 0.34*vig;
  col = col / (1.0 + col*0.22);
  col = pow(col, vec3(0.96, 0.97, 1.0));

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
