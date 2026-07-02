/* Coffee & Milk swirl — same engine as the desktop app, tuned darker so text stays
   legible. Kept external so the page can run under a strict Content-Security-Policy
   (script-src 'self', no inline scripts). */
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
  vec3 pal(float x){
    vec3 cream =vec3(.96,.90,.78);
    vec3 latte =vec3(.87,.69,.45);
    vec3 caramel=vec3(.73,.42,.22);
    vec3 rose  =vec3(.93,.56,.72);
    vec3 violet=vec3(.52,.33,.76);
    vec3 coffee=vec3(.18,.11,.08);
    x=fract(x)*6.;
    vec3 c=cream;
    c=mix(c,latte,  clamp(x-0.,0.,1.));
    c=mix(c,caramel,clamp(x-1.,0.,1.));
    c=mix(c,rose,   clamp(x-2.,0.,1.));
    c=mix(c,violet, clamp(x-3.,0.,1.));
    c=mix(c,coffee, clamp(x-4.,0.,1.));
    c=mix(c,cream,  clamp(x-5.,0.,1.));
    return c;
  }
  void main(){
    vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
    float t=uT*.03;
    vec2 q=vec2(fbm(uv*1.6+vec2(0.,t)), fbm(uv*1.6+vec2(5.2,t*.8)));
    float f=fbm(uv*2.2+2.6*q+vec2(t*.5,-t*.3));
    float idx=f*.9 + t*.18 + length(uv)*.18 + q.x*.30;
    vec3 col=pal(idx);
    col*=mix(.40,1.0,smoothstep(.05,.95,f));
    float sheen=pow(smoothstep(.62,1.,f),3.);
    col+=vec3(.96,.90,.78)*sheen*.15;
    col=floor(col*10.+.5)/10.;                 /* chunky coffee-and-milk banding */
    float vg=smoothstep(1.5,.28,length(uv));
    col*=mix(.32,1.,vg);                        /* vignette for text contrast */
    col*=0.78;
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
