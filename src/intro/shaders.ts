// GLSL-шейдеры для интро

export const NOISE = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#endif
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){
  float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ v+=a*vnoise(p); p=m*p; a*=.5; }
  return v;
}
`;

/* ---------------------------------------------------------------- BACKGROUND */
export const bgVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.9999,1.); }
`;

export const bgFrag = /* glsl */ `
precision highp float;
uniform float uTime, uAspect, uBeam, uRib, uGlow, uFlash, uFinal;
uniform vec2 uCam;
varying vec2 vUv;
${NOISE}

float beam(vec2 p, vec2 s, float ang, float spread, float seed){
  vec2 v=p-s; float r=length(v);
  float a=atan(v.y,v.x)-ang; a=mod(a+PI,2.*PI)-PI;
  float cone=exp(-(a*a)/(spread*spread));
  float rays=0.35+0.65*fbm(vec2(a*16.+seed, seed*3.+uTime*0.05));
  rays*=0.55+0.45*vnoise(vec2(a*80.+seed, r*0.18-uTime*0.1));
  return cone*rays*exp(-r*0.17);
}
float ribbon(vec2 p, vec2 c, float R, float w, float seed, float speed){
  vec2 v=p-c; float r=length(v); float a=atan(v.y,v.x); float d=r-R;
  float core=exp(-d*d/(w*w));
  float grain=0.25+0.75*fbm(vec2(a*70.+seed, d/w*1.3));
  float flow=0.3+0.7*fbm(vec2(a*4.-uTime*speed+seed, seed));
  return core*grain*flow;
}

void main(){
  vec2 p=(vUv-.5)*vec2(uAspect,1.)*9.+uCam;

  vec3 col=vec3(0.012,0.012,0.013);
  float top=exp(-length((p-vec2(0.,3.8))*vec2(0.45,0.75)));
  col+=vec3(0.018,0.017,0.017)*top;
  float haze=fbm(p*0.2+vec2(uTime*0.012,0.));
  col+=vec3(0.007,0.006,0.005)*haze*(0.5+top);
  float bands=fbm(vec2((p.x*0.55+p.y*0.45)*0.8, p.y*0.04+3.));
  col+=vec3(0.010)*smoothstep(0.45,0.9,bands);

  vec3 gold=vec3(1.0,0.56,0.13);
  vec3 pale=vec3(1.0,0.84,0.5);

  float bA=beam(p, vec2(-4.0,6.0), -2.0, 0.40, 1.3);
  float bB=beam(p, vec2(-8.5,4.2), -0.95, 0.26, 4.1);
  float bC=beam(p, vec2(9.0,-6.2), 2.25, 0.34, 7.7);
  float bD=beam(p, vec2(-9.0,-5.5), 0.62, 0.22, 9.2);
  float bs=(bA*1.25+bB*0.55+bC*0.9+bD*0.55)*uBeam;
  col+=mix(gold,pale,clamp(bs*0.6,0.,1.))*bs*0.34;

  // glitter ribbons in the corners
  float rib=0.;
  rib+=ribbon(p, vec2(10.,-7.), 6.0, 0.22, 2., 0.12);
  rib+=ribbon(p, vec2(10.,-7.), 6.55, 0.40, 5., 0.09)*0.8;
  rib+=ribbon(p, vec2(10.,-7.), 5.45, 0.10, 8., 0.15)*0.8;
  rib+=ribbon(p, vec2(-10.,-8.), 6.1, 0.24, 3., 0.1);
  rib+=ribbon(p, vec2(-10.,-8.), 6.7, 0.45, 6., 0.08)*0.7;
  rib+=ribbon(p, vec2(-9.,5.5), 3.45, 0.14, 11., 0.11)*0.8;
  rib+=ribbon(p, vec2(-9.,5.5), 4.1, 0.35, 12., 0.07)*0.6;
  col+=mix(gold,pale,clamp(rib*0.4,0.,1.))*rib*0.5*uRib;

  // micro-sparkles living inside the light
  vec2 g=floor(p*60.);
  float h=hash21(g);
  float sp=pow(h,38.)*(0.5+0.5*sin(uTime*2.5+h*60.));
  col+=pale*sp*(bs+rib*0.8)*1.4;

  col+=vec3(1.0,0.5,0.14)*0.03*exp(-length((p-vec2(0.,0.2))*vec2(0.5,0.9)))*uGlow;
  col+=vec3(1.0,0.66,0.28)*uFlash*exp(-length(p-vec2(0.,1.4))*0.45)*0.55;
  col+=vec3(1.0,0.6,0.2)*uFinal*0.02*exp(-length((p-vec2(0.,-0.6))*vec2(0.22,0.6)));

  gl_FragColor=vec4(col,1.);
}
`;

/* ---------------------------------------------------------------- DUST / BOKEH */
export const dustVert = /* glsl */ `
uniform float uTime, uScale, uIn, uBokeh;
attribute vec3 aDir;
attribute vec4 aP; // size, phase, speed, glint
varying float vAlpha;
varying float vGlint;
varying float vHeat;
void main(){
  float f=fract(uTime*aP.z*0.1+aP.y);
  vec3 pos=position+aDir*(f-0.5);
  float life=sin(f*3.14159265);
  float tw=0.55+0.45*sin(uTime*(1.2+aP.y*3.)+aP.y*40.);
  float breathe=mix(tw, 0.7+0.3*sin(uTime*0.6+aP.y*20.), uBokeh);
  vAlpha=life*breathe*uIn;
  vGlint=aP.w*tw;
  vHeat=aP.y;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aP.x*uScale/-mv.z, 220.);
  gl_Position=projectionMatrix*mv;
}
`;
export const dustFrag = /* glsl */ `
precision highp float;
uniform float uBokeh;
varying float vAlpha;
varying float vGlint;
varying float vHeat;
void main(){
  vec2 c=gl_PointCoord*2.-1.;
  float d=length(c);
  vec3 col=mix(vec3(1.,0.52,0.14), vec3(1.,0.86,0.55), vHeat);
  float a;
  if(uBokeh>0.5){
    float disc=smoothstep(1.,0.88,d);
    float rim=0.35+0.65*smoothstep(0.45,0.97,d);
    a=disc*rim*0.22;
  } else {
    float core=exp(-d*d*9.);
    float star=(exp(-abs(c.x)*38.)*smoothstep(1.,0.,abs(c.y))+exp(-abs(c.y)*38.)*smoothstep(1.,0.,abs(c.x)))*vGlint;
    a=core*1.1+star*1.4;
    col=mix(col,vec3(1.,0.95,0.8),core*0.6);
  }
  if(d>1.) discard;
  gl_FragColor=vec4(col*1.3, a*vAlpha*0.8);
}
`;

/* ---------------------------------------------------------------- ASSEMBLY SWARM */
export const swarmVert = /* glsl */ `
uniform float uAssemble, uTime, uScale, uFade;
uniform vec2 uCenter;
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec4 aR; // delay, swirl, size, phase
varying float vAlpha;
varying float vHot;
void main(){
  float raw=(uAssemble-aR.x*0.5)/0.5;
  float p=clamp(raw,0.,1.);
  float e=1.-pow(1.-p,3.);
  vec3 tgt=aTarget+0.012*vec3(sin(uTime*2.+aR.w*30.),cos(uTime*2.3+aR.w*17.),sin(uTime*1.7+aR.w*9.));
  vec3 pos=mix(aStart,tgt,e);
  float sw=(1.-e)*aR.y*2.8;
  vec2 q=pos.xy-uCenter; float cs=cos(sw), sn=sin(sw);
  pos.xy=uCenter+mat2(cs,-sn,sn,cs)*q;
  pos.z+=sin(p*3.14159265)*(aR.w-0.5)*3.0;
  float appear=smoothstep(0.,0.06,uAssemble-aR.x*0.5+0.03);
  vHot=(1.-e)*0.8+0.2*step(p,0.999);
  float tw=0.7+0.3*sin(uTime*6.+aR.w*50.);
  vAlpha=appear*uFade*tw;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aR.z*uScale/-mv.z*(0.8+1.2*(1.-e)), 60.);
  gl_Position=projectionMatrix*mv;
}
`;
export const swarmFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHot;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float d=length(c);
  if(d>1.) discard;
  float a=exp(-d*d*6.);
  vec3 col=mix(vec3(1.,0.6,0.18), vec3(1.,0.93,0.7), vHot);
  gl_FragColor=vec4(col*2.4, a*vAlpha);
}
`;

/* ---------------------------------------------------------------- SPARKS (deterministic bursts) */
export const sparkVert = /* glsl */ `
uniform float uTime, uScale;
attribute vec3 aVel;
attribute vec2 aLife; // birth, life
attribute float aSize;
varying float vAlpha;
varying float vHot;
void main(){
  float t=uTime-aLife.x;
  float ok=step(0.,t)*step(t,aLife.y);
  t=max(t,0.);
  float k=2.2;
  vec3 pos=position+aVel*(1.-exp(-t*k))/k+vec3(0.,-0.35,0.)*t*t*0.5;
  float u=clamp(t/aLife.y,0.,1.);
  vAlpha=ok*pow(1.-u,1.6)*(0.6+0.4*sin(t*38.+aSize*500.));
  vHot=1.-u;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aSize*uScale/-mv.z*(0.5+0.5*(1.-u)), 40.);
  gl_Position=projectionMatrix*mv;
}
`;
export const sparkFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHot;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float d=length(c);
  if(d>1.) discard;
  float a=exp(-d*d*7.);
  vec3 col=mix(vec3(1.,0.5,0.12), vec3(1.,0.92,0.65), vHot);
  gl_FragColor=vec4(col*3.0, a*vAlpha);
}
`;

/* ---------------------------------------------------------------- ARCS */
export const arcVert = /* glsl */ `
varying vec2 vP;
void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
export const arcFrag = /* glsl */ `
precision highp float;
uniform float uProg, uR, uStart, uLen, uDash, uAlpha, uW, uTime;
varying vec2 vP;
void main(){
  float r=length(vP);
  float d=abs(r-uR);
  float ang=atan(vP.y,vP.x);
  float t=mod(ang-uStart+12.5663706, 6.2831853)/uLen;
  if(t>1.) discard;
  float draw=smoothstep(uProg, uProg-0.03, t);
  float head=exp(-pow((t-uProg)*26.,2.))*step(uProg,0.999)*step(0.001,uProg);
  float fade=pow(max(sin(3.14159265*t),0.),0.55);
  float core=exp(-d*d/(uW*uW));
  float glow=exp(-d*30.)*0.12;
  float dashes=mix(1., step(0.5,fract(t*uDash*0.5+uTime*0.01)), step(0.5,uDash));
  float a=(core*1.0+glow*(1.-0.6*step(0.5,uDash)))*dashes*fade*draw;
  a+=(core*2.5+exp(-d*10.)*0.5)*head;
  vec3 col=mix(vec3(1.,0.55,0.16), vec3(1.,0.78,0.38), core);
  gl_FragColor=vec4(col*1.5, a*uAlpha);
}
`;

/* ---------------------------------------------------------------- DIVIDER LINES */
export const lineVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
export const lineFrag = /* glsl */ `
precision highp float;
uniform float uProg, uDir, uTime, uAlpha;
varying vec2 vUv;
void main(){
  // t: 0 at the diamond end, 1 at outer end
  float t=uDir>0.?(1.-vUv.x):vUv.x;
  float vy=abs(vUv.y-.5)*2.;
  float draw=smoothstep(uProg, uProg-0.06, t);
  float head=exp(-pow((t-uProg)*18.,2.))*step(uProg,0.999)*step(0.001,uProg);
  float core=exp(-vy*vy*70.);
  float glow=exp(-vy*5.)*0.14;
  float grad=pow(1.-t,0.55)*0.9+0.1;
  float sheen=0.6+0.4*sin(t*7.-uTime*1.4);
  float a=(core+glow)*draw*grad*sheen+head*(core*2.+glow*3.);
  vec3 col=mix(vec3(1.,0.7,0.28), vec3(1.,0.9,0.62), core);
  gl_FragColor=vec4(col*2.0, a*uAlpha);
}
`;

/* ---------------------------------------------------------------- TEXT PLANE */
export const textVert = lineVert;
export const textFrag = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uReveal, uTime, uShine, uBright;
uniform vec3 uColA, uColB;
varying vec2 vUv;
void main(){
  float cx=abs(vUv.x-.5)*2.;
  float rv=uReveal*2.0;
  float m=clamp(1.-smoothstep(rv-0.9, rv-0.2, cx),0.,1.);
  float blur=(1.-m)*5.5;
  vec4 t=texture2D(uMap, vUv, blur);
  float g=smoothstep(0.15,0.85,vUv.y);
  vec3 col=mix(uColA,uColB,g);
  float pos=fract(uTime*0.11)*1.6-0.3;
  float sh=exp(-pow((vUv.x-pos+(vUv.y-.5)*0.25)*7.,2.));
  col+=vec3(1.,0.9,0.6)*sh*uShine;
  float edge=exp(-pow((cx-(rv-0.55))*9.,2.))*step(0.001,uReveal)*step(uReveal,0.99)*0.0;
  float a=t.a*m;
  gl_FragColor=vec4(col*uBright*(1.+m*0.0), a);
}
`;

/* ---------------------------------------------------------------- SHOCKWAVE / FLARE */
export const waveFrag = /* glsl */ `
precision highp float;
uniform float uR, uA, uW;
varying vec2 vUv;
void main(){
  vec2 c=(vUv-.5)*2.;
  float d=length(c);
  float ring=exp(-pow((d-uR)/uW,2.));
  float inner=smoothstep(uR,0.,d)*0.0;
  float a=ring*uA;
  gl_FragColor=vec4(vec3(1.,0.72,0.3)*2.4, a);
}
`;

/* ---------------------------------------------------------------- POST */
export const finalPass = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uAspect: { value: 1.7778 },
    uRes: { value: [1920, 1080] },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uAspect;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    void main(){
      vec2 d=vUv-.5;
      float r2=dot(d*vec2(uAspect,1.),d*vec2(uAspect,1.));
      vec2 off=d*r2*0.005;
      vec3 col;
      col.r=texture2D(tDiffuse, vUv+off).r;
      col.g=texture2D(tDiffuse, vUv).g;
      col.b=texture2D(tDiffuse, vUv-off).b;
      // vignette
      float v=smoothstep(0.30,1.05,length(d*vec2(uAspect*0.72,1.15)));
      col*=1.-v*0.62;
      // warm grade
      col=pow(col, vec3(0.98,1.0,1.04));
      // film grain / dither
      float gr=h21(vUv*uRes+fract(uTime*7.13)*173.)-.5;
      col+=gr*0.02*(1.-0.4*col);
      col*=uFade;
      gl_FragColor=vec4(col,1.);
    }
  `,
};
