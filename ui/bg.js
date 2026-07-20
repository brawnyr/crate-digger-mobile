/* The sky behind the glass — not pressed noise anymore: a DRAWN
   sunset, sprited the way terraria or animal well would do it.
   Everything is computed on the fat-pixel grid itself (180 rows —
   animal well's own vertical resolution): ten hard swatches of
   pink-and-blue stacked bottom-glow to twilight-top, every 2-px
   column a wax run so the dark above drips long tongues down into
   the peach; a fat sun hanging low whose halo the band-snap presses
   into concentric dithered rings all by itself; three drifts of
   chunky cumulus sliding by whole pixels, violet bodies with
   bellies lit coral from below; slow-blinking stars up in the
   indigo; and four burning motes wandering the well on their own
   life cycles. Contrast stays calm in the mids so the glass floats.
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

/* one drift of cumulus: chunked cells so the clouds slide by whole
   pixels, a belt so each layer keeps its own altitude */
float cloudField(vec2 px, float fr, float t, float H){
  float belt = exp(-pow((px.y / H - (0.42 + fr*0.19))*6.5, 2.0));
  vec2 cp = floor(vec2(px.x + t*(1.2 + fr*0.9), px.y + fr*61.0) / 2.0);
  return fbm(cp * (0.030 + fr*0.008)) * belt;
}

void main(){
  vec2 px = floor(gl_FragCoord.xy);  /* the fat pixel IS the unit */
  float W = uRes.x, H = uRes.y;
  float y01 = px.y / H;
  float t = uTime;

  /* the melt: every two-pixel column of sky is a wax run — a broad
     lazy wobble plus the occasional long tongue where the twilight
     above drips down into the glow below */
  float c2 = floor(px.x / 2.0);
  float wob    = vnoise(vec2(c2*0.09,        t*0.05)) - 0.5;
  float tongue = pow(vnoise(vec2(c2*0.47 + 40.0, t*0.03)), 5.0);
  float v = 1.0 - (y01 + wob*0.07 + tongue*0.50)*1.12;

  /* the sun: a fat disc hanging low in the middle — the band snap
     below presses its halo into concentric stippled rings for free */
  float d = length((px - vec2(W*0.5, H*0.16)) / H);
  v = max(v, 0.97 - d*1.5);

  /* the press: ten hard swatches through the family bayer sieve */
  float vq = floor(clamp(v, 0.0, 1.0)*10.0 + bayer(px)) / 10.0;
  vec3 col = ramp(vq);

  /* clouds: three slow drifts of chunky cumulus — violet bodies, a
     darker heart, bellies lit coral by the sun underneath */
  float cloudHit = 0.0;
  for (int r = 0; r < 3; r++){
    float fr = float(r);
    float m = cloudField(px, fr, t, H);
    if (m > 0.37){
      float below = cloudField(px - vec2(0.0, 3.0), fr, t, H);
      float lit = step(below, 0.37);        /* open sky below -> sunlit belly */
      col = mix(ramp(0.30), ramp(0.80), lit);
      col = mix(col, ramp(0.18), step(0.46, m)*(1.0 - lit));
      cloudHit = 1.0;
    }
  }

  /* stars: the dark top of the sky keeps a scatter of slow blinkers */
  if (cloudHit < 0.5 && vq < 0.25 && y01 > 0.55){
    float s = hash21(px);
    if (s > 0.994){
      float tw = 0.5 + 0.5*sin(t*(0.6 + s*2.0) + s*90.0);
      col = mix(col, vec3(1.0, 0.90, 0.78), tw*0.85);
    }
  }

  /* the well-lit: four motes wandering on their own paths, each one
     burning pixel with a soft cross of glow, fading in and out on
     slow life cycles */
  for (int i = 0; i < 4; i++){
    float fi = float(i), ph = fi*2.399; /* golden-angle spread */
    vec2 fp = floor(vec2(W*(0.5 + 0.40*sin(t*0.043 + ph)*sin(t*0.021 + ph*1.7)),
                         H*(0.48 + 0.30*sin(t*0.031 + ph*2.3))));
    float life = smoothstep(0.15, 0.6, sin(t*0.05 + ph*3.1));
    float md = abs(px.x - fp.x) + abs(px.y - fp.y);
    if      (md < 0.5) col = mix(col, vec3(1.00, 0.93, 0.80), life);
    else if (md < 1.5) col = mix(col, vec3(1.00, 0.72, 0.62), life*0.5);
    else if (md < 2.5) col = mix(col, vec3(0.95, 0.50, 0.55), life*0.18);
  }

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
