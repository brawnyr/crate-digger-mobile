/* "pbrew" — the OG coffee-and-milk swirl, now run bright: no global dim, easy vignette, no overlay veils. External file for CSP (no inline scripts). */
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
  /* the record's own wheel — every pixel is EXACTLY one of the six colors in
     the ascii-record conic gradient, hard-stepped, never shaded or blended */
  vec3 pal(float x){
    float s=floor(fract(x)*6.);
    if(s<1.) return vec3(.969,.925,.824);   /* #f7ecd2 cream       */
    if(s<2.) return vec3(.902,.690,.416);   /* #e6b06a latte       */
    if(s<3.) return vec3(.788,.561,.329);   /* #c98f54 caramel     */
    if(s<4.) return vec3(.933,.576,.733);   /* #ee93bb rose        */
    if(s<5.) return vec3(.604,.435,.839);   /* #9a6fd6 violet      */
    return vec3(.435,.306,.659);            /* #6f4ea8 deep violet */
  }
  void main(){
    vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
    float t=uT*.03;
    vec2 q=vec2(fbm(uv*1.6+vec2(0.,t)), fbm(uv*1.6+vec2(5.2,t*.8)));
    float f=fbm(uv*2.2+2.6*q+vec2(t*.5,-t*.3));
    float idx=f*.9 + t*.18 + length(uv)*.18 + q.x*.30;
    gl_FragColor=vec4(pal(idx),1.);           /* flat record colors, nothing else */
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
