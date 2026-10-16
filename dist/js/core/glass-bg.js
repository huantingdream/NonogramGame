// 动态玻璃背景：两个着色器场景。
// 1) 全屏画布躺在页面最底层，实时画网格渐变背景——四团主题色（品牌蓝 / 荧光黄 /
//    长春花蓝 / 亮蓝）在扭曲的色场上缓慢漂移，上压 32px 网格线；三颗融在一起的
//    玻璃珠在上面缓慢漂移（色散折射 + 菲涅尔反射），并跟随指针轻微视差。
// 2) 左侧蓝色控制面板里也铺一块画布，画面板同款蓝色渐变和荧光黄圆环，
//    几颗小玻璃珠在面板里慢慢游走——这是页面上始终可见的活物。
// WebGPU 优先，WebGL2 兜底，都不支持就什么也不做（页面保持原样）。
// 遵循 prefers-reduced-motion：减少动态时只渲染一帧静态画面。标签页隐藏时暂停。

const WGSL = /* wgsl */ `
struct Uniforms {
  res : vec2f,
  time_dark : vec2f,
  mouse : vec2f,
  mode_celeb : vec2f,
  burst_pad : vec2f,
  click_xy : vec2f,
  click_t : vec2f,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

const FOCAL : f32 = 2.6;
const ZPLANE : f32 = -1.0;

@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn smin(a : f32, b : f32, k : f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// mode 0：整页大轨道；mode 1：面板里贴着走的小轨道
// celeb 0→1：三颗珠向中心聚拢，融成一颗轻轻脉动的大球（通关庆祝）
fn blobSdf(p : vec3f, t : f32, mode : f32, celeb : f32) -> f32 {
  let tt = t * 0.35;
  let big = mode < 0.5;
  let ax = select(0.20, 0.95, big);
  let ay = select(0.75, 0.55, big);
  let r = select(0.16, 0.27, big);
  let grow = select(0.6, 0.4, big);
  let o = vec3f(0.0, 0.0, 0.0);
  let p0 = mix(vec3f(ax * sin(tt), ay * sin(tt * 1.3 + 1.7), 0.24 * cos(tt * 0.8)), o, celeb);
  let p1 = mix(vec3f(-ax * 1.1 * sin(tt * 0.9 + 2.1), ay * 1.09 * cos(tt * 1.1), 0.20 * sin(tt)), o, celeb);
  let p2 = mix(vec3f(ax * 0.68 * cos(tt * 1.2 + 4.0), -ay * 1.27 * sin(tt * 0.8 + 0.6), 0.18 * cos(tt * 1.4)), o, celeb);
  let rr = r * (1.0 + celeb * grow) * (1.0 + 0.04 * sin(t * 3.0) * celeb);
  var d = length(p - p0) - rr;
  d = smin(d, length(p - p1) - rr * 0.85, r);
  d = smin(d, length(p - p2) - rr * 0.75, r);
  return d;
}

fn blobNormal(p : vec3f, t : f32, mode : f32, celeb : f32) -> vec3f {
  let e = vec2f(0.0007, -0.0007);
  return normalize(e.xyy * blobSdf(p + e.xyy, t, mode, celeb) + e.yyx * blobSdf(p + e.yyx, t, mode, celeb)
    + e.yxy * blobSdf(p + e.yxy, t, mode, celeb) + e.xxx * blobSdf(p + e.xxx, t, mode, celeb));
}

fn env(rd : vec3f, dark : f32) -> vec3f {
  var g = mix(vec3f(0.62, 0.63, 0.67), vec3f(0.95, 0.95, 0.96), clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
  let win = smoothstep(0.93, 0.995, dot(rd, normalize(vec3f(0.55, 0.65, 0.5))));
  g += vec3f(1.0) * win * 2.5;
  return g * mix(1.0, 0.22, dark);
}

// 网格渐变的噪声工具：值噪声 + 两层 fbm，用来扭曲色场平面
fn hash21(p : vec2f) -> f32 {
  var q = fract(p * vec2f(234.34, 435.345));
  q += dot(q, q + 34.23);
  return fract(q.x * q.y);
}

fn vnoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), s.x),
    mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), s.x),
    s.y);
}

fn fbm2(p : vec2f) -> f32 {
  return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.13 + vec2f(5.2, 1.3));
}

// 整页背景：网格渐变——四团主题色（品牌蓝 / 荧光黄 / 长春花蓝 / 亮蓝）
// 在轻微扭曲的平面上缓慢漂移，落在纸面底上，角落轻压暗，再压 32px 网格线
fn paper(frag : vec2f, dark : f32, time : f32) -> vec3f {
  let res = u.res;
  let p = (frag - 0.5 * res) / res.y;
  let t = time * 0.12;
  let w = vec2f(fbm2(p * 1.3 + t * 0.4), fbm2(p * 1.3 - t * 0.3 + 7.0)) - 0.5;
  let q = p + w * 0.55;

  var cols = array<vec3f, 4>(
    vec3f(0.145, 0.278, 0.894),  // 品牌蓝 #2547e4
    vec3f(0.886, 1.0, 0.329),    // 荧光黄 #e2ff54
    vec3f(0.557, 0.671, 1.0),    // 长春花蓝
    vec3f(0.192, 0.435, 0.969)   // 亮蓝
  );
  let dim = mix(1.0, 0.6, dark);
  var acc = vec3f(0.0);
  var wsum = 0.0;
  for (var i = 0; i < 4; i++) {
    let fi = f32(i);
    let c = vec2f(0.72 * sin(t * (0.6 + fi * 0.13) + fi * 1.7),
                  0.48 * cos(t * (0.5 + fi * 0.11) + fi * 2.3));
    let d = q - c;
    let wgt = exp(-dot(d, d) * 3.0);
    // 深色模式下荧光黄再压暗一些，只留一点青绿余晖
    let cdim = dim * select(1.0, mix(1.0, 0.45, dark), i == 1);
    acc += cols[i] * cdim * wgt;
    wsum += wgt;
  }
  let field = acc / max(wsum, 1e-4);
  let cover = clamp(wsum * 1.5, 0.0, 1.0);
  let base = mix(vec3f(0.965, 0.969, 0.984), vec3f(0.055, 0.075, 0.149), dark);
  var col = mix(base, field, cover * mix(0.30, 0.62, dark));
  // 角落轻轻压暗，视线聚到中间
  col *= 1.0 - 0.07 * smoothstep(0.55, 1.35, length(p));
  // 一层胶片颗粒，防色带
  col += (hash21(frag + vec2f(fract(time * 13.7), fract(time * 7.3)) * 91.0) - 0.5) * 0.015;
  // 32px 网格线
  let g = fract(frag / 32.0);
  let line = max(step(g.x, 0.03125), step(g.y, 0.03125));
  let gridCol = mix(vec3f(0.09, 0.27, 0.85), vec3f(1.0, 1.0, 1.0), dark);
  col = mix(col, gridCol, line * 0.05);
  return col;
}

// 面板背景：品牌蓝 165° 渐变 + 右下角荧光黄圆环（对应 CSS 里的 ::after）
fn panel(frag : vec2f, dark : f32) -> vec3f {
  let uv = frag / u.res;
  let dir = vec2f(0.259, 0.966);
  let tt = clamp(dot(uv, dir) / 1.225, 0.0, 1.0);
  let c0 = mix(vec3f(0.173, 0.322, 0.941), vec3f(0.137, 0.227, 0.620), dark);
  let c1 = mix(vec3f(0.145, 0.278, 0.894), vec3f(0.102, 0.173, 0.518), dark);
  let c2 = mix(vec3f(0.102, 0.192, 0.651), vec3f(0.063, 0.114, 0.361), dark);
  var col = select(mix(c1, c2, (tt - 0.46) / 0.54), mix(c0, c1, tt / 0.46), tt < 0.46);
  let center = vec2f(u.res.x - 38.0, u.res.y - 32.0);
  let ring = 1.0 - smoothstep(13.0, 17.0, abs(length(frag - center) - 90.0));
  col = mix(col, vec3f(0.886, 1.0, 0.329), ring * 0.16);
  return col;
}

fn backdrop(frag : vec2f, dark : f32, mode : f32, time : f32) -> vec3f {
  if (mode > 0.5) { return panel(frag, dark); }
  return paper(frag, dark, time);
}

// 穿出玻璃的射线落到背景平面上，换算回屏幕 uv（y 向下）
fn screenUv(p : vec3f, rd : vec3f) -> vec2f {
  let t = (ZPLANE - p.z) / min(rd.z, -1e-4);
  let q = p + rd * t;
  let ndc = q.xy * FOCAL / (3.0 - ZPLANE);
  let a = u.res.x / u.res.y;
  return vec2f(ndc.x / a, -ndc.y) * 0.5 + 0.5;
}

@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let res = u.res;
  let frag = fc.xy;
  let time = u.time_dark.x;
  let dark = u.time_dark.y;
  let mode = u.mode_celeb.x;
  let celeb = u.mode_celeb.y;
  let burst = u.burst_pad.x;
  let disp = 0.03 + burst * 0.14;
  let uv = frag / res;
  let ndc0 = (frag - 0.5 * res) / res.y * 2.0;
  let ndc = vec2f(ndc0.x, -ndc0.y);
  let m = (u.mouse - 0.5) * 2.0;
  let ro = vec3f(m * 0.10, 3.0);
  let rd = normalize(vec3f(ndc, -FOCAL));

  var t = 0.0;
  var hit = false;
  for (var i = 0; i < 70; i++) {
    let d = blobSdf(ro + rd * t, time, mode, celeb);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 6.0) { break; }
  }

  var uvs = array<vec2f, 3>(uv, uv, uv);
  var fres = 0.0;
  var edge = 0.0;
  var room = vec3f(0.0);
  if (hit) {
    let p = ro + rd * t;
    let n = blobNormal(p, time, mode, celeb);
    fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    edge = pow(1.0 - abs(dot(n, -rd)), 8.0);
    room = env(reflect(rd, n), dark);
    // 三个波长各走各的折射路径，采样统一放在分支之后
    for (var c = 0; c < 3; c++) {
      let ior = 1.5 + (f32(c) - 1.0) * disp;
      let r1 = refract(rd, n, 1.0 / ior);
      var q = p - n * 0.002;
      for (var i = 0; i < 40; i++) {
        let d = -blobSdf(q, time, mode, celeb);
        if (d < 0.001) { break; }
        q += r1 * max(d, 0.004);
      }
      let n2 = -blobNormal(q, time, mode, celeb);
      var r2 = refract(r1, n2, ior);
      if (dot(r2, r2) < 0.5) { r2 = reflect(r1, n2); }
      uvs[c] = screenUv(q, r2);
    }
  }
  let seen = vec3f(
    backdrop(uvs[0] * res, dark, mode, time).r,
    backdrop(uvs[1] * res, dark, mode, time).g,
    backdrop(uvs[2] * res, dark, mode, time).b);
  var col = mix(seen, room, fres * select(0.55, 1.0, mode < 0.5));
  let edgeTint = mix(vec3f(0.36, 0.47, 1.0), vec3f(0.55, 0.7, 1.0), dark);
  col += edgeTint * edge * (select(0.30, 0.18, mode < 0.5) + burst * 0.45);
  // 点击涟漪：从点击位置扩散的荧光环，约 1.2s 消散（只画在整页背景上）
  let clickAge = time - u.click_t.x;
  if (mode < 0.5 && clickAge > 0.0 && clickAge < 1.4) {
    let d = distance(frag, u.click_xy);
    let ring = exp(-pow((d - clickAge * 640.0) / 52.0, 2.0)) * exp(-clickAge * 2.4);
    let ringCol = mix(vec3f(0.145, 0.278, 0.894), vec3f(0.886, 1.0, 0.329), 0.3);
    col += ringCol * ring * mix(0.3, 0.55, dark);
  }
  return vec4f(col, 1.0);
}
`;

const GLSL_VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const GLSL_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uDark;
uniform vec2 uMouse;
uniform float uMode;
uniform float uCeleb;
uniform float uBurst;
uniform vec2 uClickPos;
uniform float uClickTime;
out vec4 outColor;

const float FOCAL = 2.6;
const float ZPLANE = -1.0;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float blobSdf(vec3 p, float t, float mode, float celeb) {
  float tt = t * 0.35;
  bool big = mode < 0.5;
  float ax = big ? 0.95 : 0.20;
  float ay = big ? 0.55 : 0.75;
  float r = big ? 0.27 : 0.16;
  float grow = big ? 0.4 : 0.6;
  vec3 o = vec3(0.0);
  vec3 p0 = mix(vec3(ax * sin(tt), ay * sin(tt * 1.3 + 1.7), 0.24 * cos(tt * 0.8)), o, celeb);
  vec3 p1 = mix(vec3(-ax * 1.1 * sin(tt * 0.9 + 2.1), ay * 1.09 * cos(tt * 1.1), 0.20 * sin(tt)), o, celeb);
  vec3 p2 = mix(vec3(ax * 0.68 * cos(tt * 1.2 + 4.0), -ay * 1.27 * sin(tt * 0.8 + 0.6), 0.18 * cos(tt * 1.4)), o, celeb);
  float rr = r * (1.0 + celeb * grow) * (1.0 + 0.04 * sin(t * 3.0) * celeb);
  float d = length(p - p0) - rr;
  d = smin(d, length(p - p1) - rr * 0.85, r);
  d = smin(d, length(p - p2) - rr * 0.75, r);
  return d;
}

vec3 blobNormal(vec3 p, float t, float mode, float celeb) {
  vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy * blobSdf(p + e.xyy, t, mode, celeb) + e.yyx * blobSdf(p + e.yyx, t, mode, celeb)
    + e.yxy * blobSdf(p + e.yxy, t, mode, celeb) + e.xxx * blobSdf(p + e.xxx, t, mode, celeb));
}

vec3 env(vec3 rd, float dark) {
  vec3 g = mix(vec3(0.62, 0.63, 0.67), vec3(0.95, 0.95, 0.96), clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
  float win = smoothstep(0.93, 0.995, dot(rd, normalize(vec3(0.55, 0.65, 0.5))));
  g += vec3(1.0) * win * 2.5;
  return g * mix(1.0, 0.22, dark);
}

float hash21(vec2 p) {
  vec2 q = fract(p * vec2(234.34, 435.345));
  q += dot(q, q + 34.23);
  return fract(q.x * q.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), s.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), s.x),
    s.y);
}

float fbm2(vec2 p) {
  return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.13 + vec2(5.2, 1.3));
}

vec3 paper(vec2 frag, float dark, float time) {
  vec2 p = (frag - 0.5 * uRes) / uRes.y;
  float t = time * 0.12;
  vec2 w = vec2(fbm2(p * 1.3 + t * 0.4), fbm2(p * 1.3 - t * 0.3 + 7.0)) - 0.5;
  vec2 q = p + w * 0.55;

  vec3 cols[4];
  cols[0] = vec3(0.145, 0.278, 0.894);
  cols[1] = vec3(0.886, 1.0, 0.329);
  cols[2] = vec3(0.557, 0.671, 1.0);
  cols[3] = vec3(0.192, 0.435, 0.969);
  float dim = mix(1.0, 0.6, dark);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(0.72 * sin(t * (0.6 + fi * 0.13) + fi * 1.7),
                  0.48 * cos(t * (0.5 + fi * 0.11) + fi * 2.3));
    vec2 d = q - c;
    float wgt = exp(-dot(d, d) * 3.0);
    float cdim = dim * (i == 1 ? mix(1.0, 0.45, dark) : 1.0);
    acc += cols[i] * cdim * wgt;
    wsum += wgt;
  }
  vec3 field = acc / max(wsum, 1e-4);
  float cover = clamp(wsum * 1.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.965, 0.969, 0.984), vec3(0.055, 0.075, 0.149), dark);
  vec3 col = mix(base, field, cover * mix(0.30, 0.62, dark));
  col *= 1.0 - 0.07 * smoothstep(0.55, 1.35, length(p));
  col += (hash21(frag + vec2(fract(time * 13.7), fract(time * 7.3)) * 91.0) - 0.5) * 0.015;
  vec2 g = fract(frag / 32.0);
  float line = max(step(g.x, 0.03125), step(g.y, 0.03125));
  vec3 gridCol = mix(vec3(0.09, 0.27, 0.85), vec3(1.0), dark);
  col = mix(col, gridCol, line * 0.05);
  return col;
}

vec3 panel(vec2 frag, float dark) {
  vec2 uv = frag / uRes;
  vec2 dir = vec2(0.259, 0.966);
  float tt = clamp(dot(uv, dir) / 1.225, 0.0, 1.0);
  vec3 c0 = mix(vec3(0.173, 0.322, 0.941), vec3(0.137, 0.227, 0.620), dark);
  vec3 c1 = mix(vec3(0.145, 0.278, 0.894), vec3(0.102, 0.173, 0.518), dark);
  vec3 c2 = mix(vec3(0.102, 0.192, 0.651), vec3(0.063, 0.114, 0.361), dark);
  vec3 col = tt < 0.46 ? mix(c0, c1, tt / 0.46) : mix(c1, c2, (tt - 0.46) / 0.54);
  vec2 center = vec2(uRes.x - 38.0, uRes.y - 32.0);
  float ring = 1.0 - smoothstep(13.0, 17.0, abs(length(frag - center) - 90.0));
  col = mix(col, vec3(0.886, 1.0, 0.329), ring * 0.16);
  return col;
}

vec3 backdrop(vec2 frag, float dark, float mode, float time) {
  if (mode > 0.5) { return panel(frag, dark); }
  return paper(frag, dark, time);
}

vec2 screenUv(vec3 p, vec3 rd) {
  float t = (ZPLANE - p.z) / min(rd.z, -1e-4);
  vec3 q = p + rd * t;
  vec2 ndc = q.xy * FOCAL / (3.0 - ZPLANE);
  float a = uRes.x / uRes.y;
  return vec2(ndc.x / a, -ndc.y) * 0.5 + 0.5;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float time = uTime;
  float dark = uDark;
  float mode = uMode;
  float disp = 0.03 + uBurst * 0.14;
  vec2 uv = frag / uRes;
  vec2 ndc0 = (frag - 0.5 * uRes) / uRes.y * 2.0;
  vec2 ndc = vec2(ndc0.x, -ndc0.y);
  vec2 m = (uMouse - 0.5) * 2.0;
  vec3 ro = vec3(m * 0.10, 3.0);
  vec3 rd = normalize(vec3(ndc, -FOCAL));

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 70; i++) {
    float d = blobSdf(ro + rd * t, time, mode, uCeleb);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 6.0) { break; }
  }

  vec2 uvs[3];
  uvs[0] = uv; uvs[1] = uv; uvs[2] = uv;
  float fres = 0.0;
  float edge = 0.0;
  float celeb = uCeleb;
  vec3 room = vec3(0.0);
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = blobNormal(p, time, mode, celeb);
    fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    edge = pow(1.0 - abs(dot(n, -rd)), 8.0);
    room = env(reflect(rd, n), dark);
    for (int c = 0; c < 3; c++) {
      float ior = 1.5 + (float(c) - 1.0) * disp;
      vec3 r1 = refract(rd, n, 1.0 / ior);
      vec3 q = p - n * 0.002;
      for (int i = 0; i < 40; i++) {
        float d = -blobSdf(q, time, mode, celeb);
        if (d < 0.001) { break; }
        q += r1 * max(d, 0.004);
      }
      vec3 n2 = -blobNormal(q, time, mode, celeb);
      vec3 r2 = refract(r1, n2, ior);
      if (dot(r2, r2) < 0.5) { r2 = reflect(r1, n2); }
      uvs[c] = screenUv(q, r2);
    }
  }
  vec3 seen = vec3(
    backdrop(uvs[0] * uRes, dark, mode, time).r,
    backdrop(uvs[1] * uRes, dark, mode, time).g,
    backdrop(uvs[2] * uRes, dark, mode, time).b);
  vec3 col = mix(seen, room, fres * (mode < 0.5 ? 1.0 : 0.55));
  col += mix(vec3(0.36, 0.47, 1.0), vec3(0.55, 0.7, 1.0), dark) * edge * ((mode < 0.5 ? 0.18 : 0.30) + uBurst * 0.45);
  // 点击涟漪：从点击位置扩散的荧光环（只画在整页背景上）
  float clickAge = uTime - uClickTime;
  if (mode < 0.5 && clickAge > 0.0 && clickAge < 1.4) {
    float d = distance(frag, uClickPos);
    float ring = exp(-pow((d - clickAge * 640.0) / 52.0, 2.0)) * exp(-clickAge * 2.4);
    col += mix(vec3(0.145, 0.278, 0.894), vec3(0.886, 1.0, 0.329), 0.3) * ring * mix(0.3, 0.55, uDark);
  }
  outColor = vec4(col, 1.0);
}
`;

async function createBackend() {
  if (!('gpu' in navigator)) return { type: 'webgl' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { type: 'webgl' };
    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: WGSL });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    if (await device.popErrorScope()) return { type: 'webgl' };
    return { type: 'webgpu', device, format, pipeline };
  } catch {
    return { type: 'webgl' };
  }
}

function makeRenderer(backend, canvas) {
  if (backend.type === 'webgpu') {
    const { device, format, pipeline } = backend;
    const context = canvas.getContext('webgpu');
    if (!context) return null;
    // 延迟配置：画布插入 DOM、定好尺寸后才 configure，并且每次尺寸变化都重新
    // configure。在部分驱动（Intel Mac / Metal）上，canvas 离 DOM 时配置或尺寸
    // 变更后的交换链会一直不呈现（画布透明），重配可以确保拿到可用的交换链。
    let confW = 0;
    let confH = 0;
    const ensureConfigured = () => {
      if (canvas.width !== confW || canvas.height !== confH) {
        context.configure({ device, format, alphaMode: 'opaque' });
        confW = canvas.width;
        confH = canvas.height;
      }
    };
    const uniformBuffer = device.createBuffer({ size: 56, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    return {
      resize(w, h) { canvas.width = w; canvas.height = h; },
      render(u) {
        ensureConfigured();
        device.queue.writeBuffer(uniformBuffer, 0, u);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: { r: 0.96, g: 0.97, b: 0.98, a: 1 },
            storeOp: 'store',
          }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
    };
  }
  let gl;
  try {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, GLSL_VERT);
  const fs = compile(gl.FRAGMENT_SHADER, GLSL_FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const loc = {
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    dark: gl.getUniformLocation(program, 'uDark'),
    mouse: gl.getUniformLocation(program, 'uMouse'),
    mode: gl.getUniformLocation(program, 'uMode'),
    celeb: gl.getUniformLocation(program, 'uCeleb'),
    burst: gl.getUniformLocation(program, 'uBurst'),
    clickPos: gl.getUniformLocation(program, 'uClickPos'),
    clickTime: gl.getUniformLocation(program, 'uClickTime'),
  };
  return {
    resize(w, h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); },
    render(u) {
      gl.uniform2f(loc.res, u[0], u[1]);
      gl.uniform1f(loc.time, u[2]);
      gl.uniform1f(loc.dark, u[3]);
      gl.uniform2f(loc.mouse, u[4], u[5]);
      gl.uniform1f(loc.mode, u[6]);
      gl.uniform1f(loc.celeb, u[7]);
      gl.uniform1f(loc.burst, u[8]);
      gl.uniform2f(loc.clickPos, u[10], u[11]);
      gl.uniform1f(loc.clickTime, u[12]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

async function initGlassBackground() {
  const controlPanel = document.getElementById('controlPanel');
  const backend = await createBackend();

  // 画布由 JS 创建：不支持的浏览器里页面保持原样，不留任何痕迹
  const scenes = [];
  const bgCanvas = document.createElement('canvas');
  bgCanvas.className = 'glass-canvas glass-canvas-bg';
  bgCanvas.setAttribute('aria-hidden', 'true');
  const bgRenderer = makeRenderer(backend, bgCanvas);
  if (bgRenderer) scenes.push({ canvas: bgCanvas, renderer: bgRenderer, mode: 0, host: document.body, prepend: true });

  if (controlPanel) {
    const panelCanvas = document.createElement('canvas');
    panelCanvas.className = 'glass-canvas glass-canvas-panel';
    panelCanvas.setAttribute('aria-hidden', 'true');
    const panelRenderer = makeRenderer(backend, panelCanvas);
    if (panelRenderer) scenes.push({ canvas: panelCanvas, renderer: panelRenderer, mode: 1, host: controlPanel, prepend: true });
  }
  if (!scenes.length) return;

  for (const scene of scenes) scene.host.prepend(scene.canvas);
  document.documentElement.classList.add('glass-on');

  // 游戏挂载 / 切换时会重写 controlPanel 的 innerHTML，把画布一起抹掉。
  // 监听宿主子节点变化，画布一旦丢失就重新插回最底层（prepend 触发二次回调时因已就位而直接返回，不会死循环）。
  const panelScene = scenes.find((scene) => scene.mode === 1);
  if (panelScene) {
    new MutationObserver(() => {
      if (panelScene.canvas.parentNode === panelScene.host) return;
      panelScene.host.prepend(panelScene.canvas);
      resize();
      if (motionQuery.matches) staticFrame();
    }).observe(panelScene.host, { childList: true });
  }

  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const uniforms = new Float32Array(14);
  let mouseX = 0.5;
  let mouseY = 0.5;
  let targetX = 0.5;
  let targetY = 0.5;
  // 点击涟漪的位置（画布像素坐标）与发生时刻（draw 的秒数时间轴）
  let clickX = -9999;
  let clickY = -9999;
  let clickTime = -9999;
  // 通关庆祝：胜利弹窗开着时趋近 1，玻璃珠聚成一颗大球；关掉再散开
  let celeb = 0;
  let celebTarget = 0;
  // 大球成型瞬间的彩虹色散爆发，指数衰减
  let burst = 0;
  // 主题明暗在着色器里平滑过渡，而不是 0/1 硬切
  const isDark = () => document.documentElement.dataset.theme === 'dark' ? 1 : 0;
  let darkTarget = isDark();
  let darkValue = darkTarget;
  const victoryModal = document.getElementById('victoryModal');
  if (victoryModal) {
    new MutationObserver(() => {
      const open = victoryModal.open;
      celebTarget = open ? 1 : 0;
      if (open) burst = 1;
      else burst = 0;
      if (motionQuery.matches) { celeb = celebTarget; burst = 0; staticFrame(); }
    }).observe(victoryModal, { attributes: true, attributeFilter: ['open'] });
  }
  let scale = Math.min(devicePixelRatio || 1, 1.5) * 0.7;
  let rafId = 0;
  const t0 = performance.now();

  addEventListener('pointermove', (e) => {
    targetX = e.clientX / innerWidth;
    targetY = e.clientY / innerHeight;
  }, { passive: true });

  // 点击页面时：背景泛起一圈从指尖扩散的水波光环，玻璃珠同时轻轻一闪
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || motionQuery.matches) return;
    burst = Math.max(burst, 0.5);
    clickX = e.clientX * scale;
    clickY = e.clientY * scale;
    clickTime = (performance.now() - t0) / 1000 + 20;
  }, { passive: true });

  function resize() {
    for (const scene of scenes) {
      const box = scene.mode === 0
        ? { w: innerWidth, h: innerHeight }
        : { w: scene.host.clientWidth, h: scene.host.clientHeight };
      scene.renderer.resize(
        Math.max(1, Math.round(box.w * scale)),
        Math.max(1, Math.round(box.h * scale)),
      );
    }
  }

  function draw(time) {
    const dark = darkValue;
    for (const scene of scenes) {
      uniforms[0] = scene.canvas.width;
      uniforms[1] = scene.canvas.height;
      uniforms[2] = time;
      uniforms[3] = dark;
      uniforms[4] = mouseX;
      uniforms[5] = mouseY;
      uniforms[6] = scene.mode;
      uniforms[7] = celeb;
      uniforms[8] = burst;
      // 9 是 burst_pad 的占位；点击参数在 WGSL 里对齐到 10/11/12
      uniforms[10] = clickX;
      uniforms[11] = clickY;
      uniforms[12] = clickTime;
      scene.renderer.render(uniforms);
    }
  }

  // 帧耗时的滑动平均太高就自动降分辨率，保住页面流畅度
  let frames = 0;
  let slowTime = 16.7;
  let lastNow = 0;
  function frameAdaptive(now) {
    const dt = lastNow ? now - lastNow : 16.7;
    lastNow = now;
    slowTime = slowTime * 0.98 + dt * 0.02;
    frames += 1;
    if (frames % 120 === 0 && slowTime > 30 && scale > 0.35) {
      scale *= 0.8;
      resize();
    }
    mouseX += (targetX - mouseX) * 0.05;
    mouseY += (targetY - mouseY) * 0.05;
    celeb += (celebTarget - celeb) * Math.min(1, dt / 600);
    burst *= Math.exp(-dt / 450);
    if (burst < 0.01) burst = 0;
    // 明暗过渡约 300ms 收敛，配合页面主题切换的圆形扩散
    darkTarget = isDark();
    darkValue += (darkTarget - darkValue) * Math.min(1, dt / 140);
    if (Math.abs(darkTarget - darkValue) < 0.004) darkValue = darkTarget;
    draw((now - t0) / 1000 + 20);
    rafId = requestAnimationFrame(frameAdaptive);
  }

  function staticFrame() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    darkValue = darkTarget = isDark();
    draw(20);
  }

  function play() {
    if (rafId || motionQuery.matches || document.hidden) return;
    lastNow = 0;
    rafId = requestAnimationFrame(frameAdaptive);
  }

  addEventListener('resize', () => {
    resize();
    if (motionQuery.matches) staticFrame();
  });
  // 面板高度会随游戏 / 断点变化，跟着重算尺寸
  if (controlPanel && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      resize();
      if (motionQuery.matches) staticFrame();
    }).observe(controlPanel);
  }
  darkQuery.addEventListener('change', () => { if (motionQuery.matches) staticFrame(); });
  // 手动切换主题（data-theme）时也要刷新静态帧
  new MutationObserver(() => { if (motionQuery.matches) staticFrame(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  motionQuery.addEventListener('change', () => { motionQuery.matches ? staticFrame() : play(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else {
      play();
    }
  });

  resize();
  if (motionQuery.matches) staticFrame();
  else play();
}

initGlassBackground();
