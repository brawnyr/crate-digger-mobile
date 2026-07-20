/* The sky behind the glass — the porch at dusk, and nobody's in a
   hurry: the wheel plays the blues (night indigo — never black —
   worn denim, tobacco brown, whiskey amber, lamplight cream) and
   every clock in the paint runs at rocking-chair speed. The paint is
   twice-folded domain-warped fbm — no center, no subject, colors
   mixed all over — and five organic friends wander through it on
   separate paths, meeting and disappearing on their own slow life
   cycles. And the whole sky is pressed like a sprite sheet — 180
   rows of fat pixels, the flow snapped to ten swatches of the ramp
   through a 4x4 Bayer sieve — flat color fields that stipple only
   at the band seams, the way aseprite would shade it; contrast
   stays low in the mids so the frosted glass floats on top instead
   of fighting it.
   Separate file for CSP: no inline scripts. */

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
  for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 17.7; a *= 0.5; }
  return s;
}

/* the 4x4 ordered dither — the family grain, same as the planet wears */
float bayer(vec2 fc){
  int b[16] = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
  ivec2 p = ivec2(mod(fc, 4.0));
  return (float(b[p.y*4 + p.x]) + 0.5) / 16.0;
}

/* the wheel plays the blues: night indigo (never black), worn
   denim, tobacco brown, whiskey amber, lamplight cream */
vec3 ramp(float v){
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.051, 0.067, 0.129), vec3(0.208, 0.298, 0.451), smoothstep(0.02, 0.40, v)); /* night indigo -> worn denim */
  c = mix(c, vec3(0.373, 0.294, 0.235), smoothstep(0.36, 0.60, v)); /* -> tobacco brown   */
  c = mix(c, vec3(0.702, 0.443, 0.208), smoothstep(0.56, 0.78, v)); /* -> whiskey amber   */
  c = mix(c, vec3(0.851, 0.624, 0.376), smoothstep(0.76, 0.89, v)); /* -> late gold       */
  c = mix(c, vec3(0.957, 0.878, 0.741), smoothstep(0.87, 0.99, v)); /* -> lamplight cream */
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime * 0.016; /* rocking-chair speed — the paint takes its time */

  /* the friends: soft presences wandering the paint on their own
     paths — they meet, they mingle, they fade out and are gone */
  float friends = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float ph = fi*2.399; /* golden-angle spread, no two paths alike */
    vec2 fp = vec2(sin(t*(1.3 + 0.4*fi) + ph)*0.85,
                   cos(t*(1.0 + 0.3*fi) + ph*1.7)*0.55);
    float life = smoothstep(-0.35, 0.5, sin(uTime*(0.045 + 0.012*fi) + ph*3.1));
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
             + 0.10*sin(uv.x*3.0 + uv.y*2.0 + paint*4.0 + t*2.0); /* a lazy sway, not a shimmy */

  /* ping-pong through the ramp — every color everywhere, no seam —
     softened toward the middle so the mids stay quiet under glass */
  float v = abs(fract(flow) * 2.0 - 1.0);
  v = v*v*(3.0 - 2.0*v); /* ease the turnarounds, kill any crease */
  v = mix(v, 0.42, 0.22); /* pull gently toward the calm middle */

  /* dusk gathers at the edges: the vignette leans v down BEFORE the
     press, so every screen pixel still lands on a palette color */
  v -= (1.0 - smoothstep(1.55, 0.4, length(uv))) * 0.10;

  /* the aseprite press: the flow snaps to ten swatches of the ramp,
     one bayer cell per fat pixel — flat color fields, stippled only
     where one band hands off to the next */
  v = floor(clamp(v, 0.0, 1.0)*10.0 + bayer(gl_FragCoord.xy)) / 10.0;

  vec3 col = ramp(v);
  col = col / (1.0 + col*0.22);
  col = pow(col, vec3(0.92, 0.98, 1.08)); /* the whole field leans warm */

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
