/* MOLTEN MATH — hot psychedelic lava, pixelated and codery. A domain-warped
   fbm field creeps like molten rock; its heat is posterized into hard bands
   with per-pixel hash dither (the codery grain), and level-set contour lines
   glow gold as they march through the melt — the math showing itself. Ramp
   runs black crust → blood → red → orange → gold, peaking pale only in the
   hottest crests. Chunky 6px pixels. External file for CSP (no inline). */
const FRAG = `
  precision highp float;
  uniform vec2 uRes; uniform float uT;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),
               mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.,a=.5;
    mat2 m=mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=.5;}
    return v;
  }
  /* the heat ramp: crust to pale gold, hot all the way up */
  vec3 ramp(float x){
    x=clamp(x,0.,1.)*5.;
    vec3 c=vec3(.07,.02,.03);                    /* black crust    */
    c=mix(c,vec3(.42,.05,.04),clamp(x,0.,1.));   /* blood          */
    c=mix(c,vec3(.80,.16,.06),clamp(x-1.,0.,1.));/* hot red        */
    c=mix(c,vec3(.96,.42,.09),clamp(x-2.,0.,1.));/* orange         */
    c=mix(c,vec3(1.,.72,.14), clamp(x-3.,0.,1.));/* gold           */
    c=mix(c,vec3(1.,.88,.46), clamp(x-4.,0.,1.));/* pale crest     */
    return c;
  }
  void main(){
    vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
    float t=uT*.05;
    /* the flow: two warp currents shear the field so it creeps like melt */
    vec2 q=vec2(fbm(uv*1.5+vec2(0.,t*.9)), fbm(uv*1.5+vec2(5.2,-t*.7)));
    float f=fbm(uv*2.3+2.8*q+vec2(-t*.5,t*1.1));
    /* heat: crusty lows, molten highs, a slow deep pulse underneath */
    float heat=smoothstep(.12,.96,f)*(.88+.12*sin(uT*.11));
    heat+=.22*q.x-.11;                            /* psychedelic drift in the hue */
    /* codery grain: posterize into hard bands, hash-dithered per pixel */
    float d=hash(floor(gl_FragCoord.xy))-.5;
    heat=floor(heat*11.+.5+d*.9)/11.;
    vec3 col=ramp(heat);
    /* the math surfaces: level-set contours marching through the melt */
    float lv=1.-abs(fract(f*7.-uT*.06)*2.-1.);
    float line=pow(lv,14.)*smoothstep(.25,.6,f);
    col+=vec3(1.,.72,.2)*line*.55;
    gl_FragColor=vec4(col,1.);
  }`;
const VERT = 'attribute vec2 aP;void main(){gl_Position=vec4(aP,0.,1.);}';
(function () {
  const cvs = document.getElementById('bg');
  const gl = cvs.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return;
  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes'), uT = gl.getUniformLocation(prog, 'uT');
  const PX = 6;
  function resize() {
    const w = Math.max(1, Math.round(cvs.clientWidth / PX)), h = Math.max(1, Math.round(cvs.clientHeight / PX));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; gl.viewport(0, 0, w, h); }
  }
  function render(t) { resize(); gl.uniform2f(uRes, cvs.width, cvs.height); gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  const RM = matchMedia('(prefers-reduced-motion:reduce)');
  const FRAME = 1000 / 30;
  let raf = null, last = 0, t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME) return; last = now;
    render((now - t0) / 1000);
  }
  function start() { if (!raf && !RM.matches) raf = requestAnimationFrame(loop); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function apply() { if (RM.matches) { stop(); render(12.0); } else start(); }
  apply();
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : apply());
  RM.addEventListener('change', apply);
  window.addEventListener('resize', () => { if (RM.matches) render(12.0); });
})();
