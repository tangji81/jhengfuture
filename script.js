/* ============================================================
   脊衡未来 · 青少年脊柱健康动态筛查系统 — 全局脚本
   说明：页面数据为演示用模拟数据，按固定随机种子生成，
   每次刷新结果一致（可复现）。
   指标定义对齐《说明书》3.3.3 / 3.6 / 3.7：
     带符号不对称量 SASI_k(P) = (R_k(P) - L_k(P)) / [(R_k(P)+L_k(P))/2]
     MDC = 1.96 × √2 × SEM
   ============================================================ */

"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hasEcharts = () => typeof window.echarts !== "undefined";

/* ---------- 固定种子随机数（保证演示数据可复现） ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(20261014);
const rnd = (a, b) => a + RNG() * (b - a);
const resetRng = () => { RNG = mulberry32(20261014); };

/* ============================================================
   数据模型（全站唯一数据源，保证各页数字自洽）
   ⚠ 下面 CASE-DATA 区块由 tools/reroll_case.py 自动生成与替换。
     手工改其中的数值会在下次 reroll 时被整块覆盖。
   ============================================================ */
/* ==== CASE-DATA-START ==== */
const SUBJECT = {
  id: "AIS-2026-007",
  name: "李同学",
  sex: "女",
  age: 12,
  MDC: 6.0,                 // 最小可检变化阈值 %（系统级参数，不随病例变化）
  // B0 首检 → B3 当前检测
  sessions: [
    { name: "B0", label: "首次检测", date: "2026-03-12", resp: 100.0, asym: 2.6, deform: 3.78, rec: 2.6, hyst: 15.1 },
    { name: "B1", label: "第 2 次", date: "2026-05-20", resp: 102.6, asym: 5.1, deform: 4.02, rec: 3.2, hyst: 16.0 },
    { name: "B2", label: "第 3 次", date: "2026-08-06", resp: 105.6, asym: 9.5, deform: 4.25, rec: 3.8, hyst: 16.9 },
    { name: "B3", label: "当前检测", date: "2026-10-14", resp: 108.5, asym: 11.3, deform: 4.49, rec: 4.4, hyst: 17.8 }
  ],
  level: "risk",            // 当前评级
  quality: 99.2             // 数据完整率 %
};

/* 六区域：L1–L3 / R1–R3，对应上 / 中 / 下背（按《说明书》3.2） */
const REGIONS = [
  { id: "L1", side: "左侧上背", h: "upper", p: 14.90, d: 3.02, bias: 0.0 },
  { id: "R1", side: "右侧上背", h: "upper", p: 15.52, d: 3.34, bias: 5.2 },
  { id: "L2", side: "左侧中背", h: "middle", p: 14.85, d: 3.47, bias: 0.0 },
  { id: "R2", side: "右侧中背", h: "middle", p: 16.63, d: 4.49, bias: 14.4 },
  { id: "L3", side: "左侧下背", h: "lower", p: 15.31, d: 3.38, bias: 0.0 },
  { id: "R3", side: "右侧下背", h: "lower", p: 15.79, d: 3.65, bias: 3.9 }
];

/* 各高度层面的 SASI(P) 曲线（载荷档位 5/10/15/20 kPa）
   中背在中低载荷段发生左右强弱关系翻转 → 反转点 */
const SASI_P = {
  upper:  [0.016, 0.023, 0.033, 0.041],
  middle: [-0.046, -0.013, 0.035, 0.113],
  lower:  [0.044, 0.033, 0.032, 0.031]
};

/* 基线（B0）各高度层面的 SASI(P) */
const SASI_P0 = {
  upper:  [0.004, 0.005, 0.007, 0.009],
  middle: [-0.036, -0.019, 0.002, 0.026],
  lower:  [0.013, 0.011, 0.010, 0.009]
};

/* 各高度形变幅度 4 次检测序列（mm） */
const DEFORM_TREND = {
  upper:  [2.80, 2.98, 3.16, 3.34],
  middle: [3.78, 4.02, 4.25, 4.49],
  lower:  [3.15, 3.31, 3.48, 3.65]
};

/* 由上述数据派生的展示用汇总值（reroll 时一并计算） */
const CASE_META = {
  pressMeanNow: 15.50, pressMeanBase: 14.74,
  deformMeanNow: 4.49, deformMeanBase: 3.78,
  reversalP: 11.3, diagDominance: 0.29, trendPeriods: 4
};
/* ==== CASE-DATA-END ==== */

const HEIGHTS = [
  { key: "upper", name: "上背", L: "L1", R: "R1" },
  { key: "middle", name: "中背", L: "L2", R: "R2" },
  { key: "lower", name: "下背", L: "L3", R: "R3" }
];

/* 带符号不对称量 SASI（无量纲）— 对第 k 组左右区域 */
function sasi(l, r) { return (r - l) / ((r + l) / 2); }

const LOAD_LEVELS = [5, 10, 15, 20];

/* 载荷协议（《说明书》表 3-1） */
const LOAD_PROTOCOL = {
  levels: LOAD_LEVELS, rate: 2, hold: 5, cycle: "40–50", single: "3–5"
};

/* 状态命名（《说明书》3.7.4 三级） */
const STATUS_TXT = { ok: "低风险", warn: "需关注", risk: "建议专业筛查" };
const STATUS_CLS = { ok: "ok", warn: "warn", risk: "risk" };
function levelFromAsym(asym) {
  const over = Math.abs(asym - SUBJECT.sessions[0].asym);
  if (over > SUBJECT.MDC * 1.3) return "risk";
  if (over > SUBJECT.MDC) return "warn";
  return "ok";
}

/* ============================================================
   导航 / 时钟 / 出现动画 / 计数
   ============================================================ */
function initNav() {
  const page = document.body.dataset.page;
  $$(".nav-links a").forEach(a => { if (a.dataset.page === page) a.classList.add("active"); });
  $$(".side-link").forEach(a => { if (a.dataset.page === page) a.classList.add("active"); });
  const toggle = $(".nav-toggle"), links = $(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("open");
      links.classList.toggle("open");
    });
  }
}

function initClock() {
  const els = $$("[data-clock]");
  const dateEls = $$("[data-date]");
  const fmt = n => String(n).padStart(2, "0");
  const tick = () => {
    const d = new Date();
    const s = `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())} ${fmt(d.getHours())}:${fmt(d.getMinutes())}:${fmt(d.getSeconds())}`;
    const day = `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())}`;
    els.forEach(el => (el.textContent = s));
    dateEls.forEach(el => (el.textContent = day));
  };
  tick();
  if (els.length || dateEls.length) setInterval(tick, 1000);
}

/* 入场动画已改为纯 CSS 实现（见 style.css .reveal），此处仅保留标记 */
function initReveal() {
  $$(".reveal").forEach(el => el.classList.add("in"));
}

function countUp(el, target, { dur = 1300, dec = 0, suffixHtml = "" } = {}) {
  const render = v => { el.innerHTML = v.toFixed(dec) + suffixHtml; };
  const t0 = performance.now();
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    render(target * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  /* 兜底：无论动画是否被打断，最终必须显示准确数值 */
  setTimeout(() => render(target), dur + 120);
}

/* ============================================================
   ECharts —— 浅色科技蓝主题（深蓝 / 科技蓝 + 少量青绿）
   ============================================================ */
const C = {
  brand: "#0f9b8e", brand2: "#17bfa8", brandLight: "#3fc4b4",
  line: "#c6dcd6", axis: "#8aa69f", grid: "#edf6f4",
  ok: "#189a5b", warn: "#d78f0a", risk: "#d94848",
  slate: "#4a6b63", violet: "#0a6b62", amber: "#e0a020", navy: "#0a2b26"
};
const AXIS = {
  axisLine: { lineStyle: { color: C.line } },
  axisTick: { show: false },
  axisLabel: { color: C.axis, fontSize: 10.5 },
  splitLine: { lineStyle: { color: C.grid } }
};
const TIP = {
  backgroundColor: "rgba(255,255,255,.97)",
  borderColor: C.line,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: "#12271f", fontSize: 12 },
  extraCssText: "box-shadow:0 6px 20px rgba(23,54,76,.12);border-radius:8px;"
};
const LEGEND = { textStyle: { color: C.slate, fontSize: 11.5 }, itemWidth: 14, itemHeight: 9, icon: "roundRect" };

function makeChart(id, option) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!hasEcharts()) {
    el.innerHTML = '<div class="chart-fallback">图表组件未加载：请确认 echarts.min.js 与页面同目录</div>';
    return null;
  }
  const chart = echarts.init(el, null, { renderer: "canvas" });
  chart.setOption(option);
  window.addEventListener("resize", () => chart.resize());
  return chart;
}

/* ============================================================
   首页
   ============================================================ */
function initHome() {
  /* 首屏统计数字：直接起算，不依赖观察器（避免空白） */
  $$(".stat .num").forEach(el => {
    const target = parseFloat(el.dataset.target);
    const dec = parseInt(el.dataset.dec || "0", 10);
    const suffix = el.dataset.suffix || "";
    countUp(el, target, { dec, dur: 1500, suffixHtml: `<i>${suffix}</i>` });
  });

  initVest();
  initPipeline();
}

/* ============================================================
   3D 智能背心：六区感知阵列 + 拖拽旋转
   ============================================================ */
function initVest() {
  const stage = document.getElementById("vestStage");
  const cv = document.getElementById("vestCanvas");
  if (!stage || !cv) return;

  const opt = { antialias: true, alpha: true, premultipliedAlpha: false, depth: true };
  const gl = cv.getContext("webgl", opt) || cv.getContext("experimental-webgl", opt);
  if (!gl) {
    cv.style.display = "none";
    const tip = document.createElement("div");
    tip.className = "v-fallback";
    tip.innerHTML = "六区柔性感知背心（3D 预览需浏览器开启 WebGL）";
    stage.insertBefore(tip, stage.firstChild);
    return;
  }
  const noMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     版型：躯干截面 = 椭圆筒，前后片本身带弧度
     领口 / 袖窿 在片元里按参数域精确挖穿（discard），边界平滑；
     壳体内外两层，因此有真实壁厚（1 单位 ≈ 1.5 mm）
     ============================================================ */
  const H = 340;            // 衣长 510mm（参考图是短款，长宽比 ≈1.4）
  const TH = 6;             // 壳壁厚 9mm
  /* 领口按「小孩头刚能过」定：横向约 92mm，前落 53mm / 后落 25mm
     （前领深 ×H = 落肩量；单位换算 1 单位 ≈ 1.5mm） */
  const NU = 0.093;         // 前领半宽（u）→ 领口宽 ≈ 133mm
  const NB = 0.100;         // 后领半宽
  const T_NECK = 0.210;     // 前领深（t）≈ 107mm
  const T_BNECK = 0.088;    // 后领深 ≈ 45mm
  /* 袖窿 = 侧面的【封闭椭圆孔】，孔顶低于肩线 —— 顶边在肩膀上方保持一整圈
     连续布料，前片经肩带跨过肩膀连到后片；若从顶边开口则会咬断肩带 */
  const AC_U = 0.085;       // 袖窿半宽（u）→ 肩带留 51mm
  const AC_T = 0.453;       // 袖窿中心高度（t）：孔从 0.200 开到 0.706
  const AC_R = 0.253;       // 袖窿半高（t）：孔顶 t=0.200 ≈ 肩带 102mm

  const PA = [[0, 117], [.09, 124], [.28, 118], [.45, 103], [.60, 104], [.82, 111], [1, 113]];
  const PB = [[0, 64], [.09, 80], [.28, 80], [.45, 65], [.60, 67], [.82, 73], [1, 76]];

  const prof = (P, t) => {
    if (t <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (t <= P[i][0]) {
        const k = (t - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
        const kk = k * k * (3 - 2 * k);   // 平滑过渡，关键点处切线水平，不出环状台阶
        return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * kk;
      }
    }
    return P[P.length - 1][1];
  };
  const A_OF = t => prof(PA, t);
  const B_OF = t => prof(PB, t);

  /* 肩头收圆：t 很小的时候径向往内收。
     左右（A）和前后（B）必须分开收：
     真实肩带跨在肩上只有 5~6cm 厚，若前后也按同一个比例收，
     顶边仍是一整片 15cm 深的"肩垫"，俯视看就是一个大开口。
     所以 A 收得轻、B 收得重，顶边就变成一条窄脊 —— 这才像肩带。 */
  const SH_T = 0.088;       // 收圆作用区 ≈ 45mm
  const SH_KA = 0.90;       // 顶边处左右半径收到 90%
  const SH_KB = 0.56;       // 顶边处前后半径收到 56%（肩带厚度 ≈79mm）
  const shoulderKA = t => {
    if (t >= SH_T) return 1;
    const k = 1 - t / SH_T;
    const s = k * k * (3 - 2 * k);
    return 1 - (1 - SH_KA) * s;
  };
  const shoulderKB = t => {
    if (t >= SH_T) return 1;
    const k = 1 - t / SH_T;
    const s = k * k * (3 - 2 * k);
    return 1 - (1 - SH_KB) * s;
  };

  /* 顶边成形：真实服装的领口不是"平顶边上挖个口"，而是顶边本身
     在前中线处最低、到肩峰最高，颈口由这条曲线围出来。
     这里直接把顶边高度做成曲线（dy），颈口自然就有了。 */
  const EDGE_F = 0;         // 顶边下拉已弃用（领口改打孔），保留为 0
  const EDGE_B = 0;         // 同上
  const EDGE_WF = 0.105;    // 前领口横向半宽（u）→ 领宽≈139mm
  const EDGE_WB = 0.062;    // 后领口横向半宽（u）
  const EDGE_P = 2.0;       // 曲线指数：U 形领底
  const edgeBump = (d, w, p) => (d >= w ? 0 : Math.pow(1 - (d / w) * (d / w), p));
  const edgeDrop = u => Math.max(
    EDGE_F * edgeBump(Math.abs(u - Math.round(u)), EDGE_WF, EDGE_P),
    EDGE_B * edgeBump(Math.abs(u - 0.5), EDGE_WB, EDGE_P)
  );
  const EDGE_T2 = 0.073;    // 顶边成形作用厚度
  const SH_DROP = 22;       // 肩头相对肩峰的下落量（≈33mm）
  const armpitBump = u => {
    const d = Math.abs(((u % 0.5) + 0.5) % 0.5 - 0.25);
    if (d >= 0.140) return 0;
    const q = 1 - d / 0.140;
    return q * q * (3 - 2 * q);
  };
  const shoulderDrop = (u, t) => {
    if (t >= EDGE_T2) return 0;
    const k = 1 - t / EDGE_T2;
    const s = k * k * (3 - 2 * k);
    return -(edgeDrop(u) + SH_DROP * armpitBump(u)) * s;
  };

  const POS = (u, t, lift, dy) => {
    const ph = u * Math.PI * 2;
    const a = A_OF(t) * shoulderKA(t) + (lift || 0);
    const b = B_OF(t) * shoulderKB(t) + (lift || 0);
    return [a * Math.sin(ph), H / 2 - t * H + (dy || 0), b * Math.cos(ph)];
  };

  /* 传感器只装一面：rear = 贴脊柱那一侧（穿着时贴皮肤）；front = 胸前展示面 */
  const SENSOR_SIDE = "front";   // 参考图：软垫在胸前

  /* 与片元着色器同源的挖孔有符号距离：<0 在布料上，>0 落在孔里 */
  const cutField = (u, t) => {
    let f = -1;
    const df = Math.abs(u - Math.round(u));
    if (df < NU) {
      const q = df / NU;
      f = Math.max(f, T_NECK * Math.pow(Math.max(0, 1 - q * q), 1.5) - t);
    }
    /* 肩带顶边就是 t=0 直筒顶边，平坦连续 */
    const db = Math.abs(u - 0.5);
    if (db < NB) {
      const qb = db / NB;
      f = Math.max(f, T_BNECK * Math.pow(Math.max(0, 1 - qb * qb), 1.35) - t);
    }
    for (let s = 0; s < 2; s++) {
      const c = s === 0 ? 0.25 : 0.75;
      /* 封闭椭圆孔：孔内 f>0，边界附近 f ≈ 到孔边的距离（t 单位），包缝逻辑不变 */
      const dx = (u - c) / AC_U, dyy = (t - AC_T) / AC_R;
      const e = dx * dx + dyy * dyy;
      if (e < 1) f = Math.max(f, AC_R * (1 - Math.sqrt(e)));
    }
    return f;
  };

  /* 所有开口边（顶边、下摆、领口、袖窿）都做对折包缝：
     内外两层在边界处收拢到同一条圆角线，边缘是缝死的，没有敞口薄片 */
  const EDGE_T = 0.015;
  const GAP = 0.8;  // 内层与外壳在边缘处留 ~1.2mm：重合会 z-fighting，掠射角下太薄也会闪白茬
  const edgeDist = (u, t) => Math.min(t, 1 - t, Math.abs(cutField(u, t)));
  const hemK = (u, t) => {
    const d = edgeDist(u, t);
    if (d >= EDGE_T) return 0;
    const k = 1 - d / EDGE_T;
    return k * k * (3 - 2 * k);
  };
  /* 外壳保持光滑曲面（不做位移，边缘才不会有网格台阶）；内层在边界处贴上去收边 */
  const outerInset = () => 0;
  const innerInset = (u, t) => -TH + (TH - GAP) * hemK(u, t);

  /* ---------------- 着色器 ---------------- */
  const VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aNor;",
    "attribute vec2 aUV;",
    "attribute float aZone;",
    "attribute vec2 aLocal;",
    "uniform mat4 uMVP;",
    "uniform mat3 uRot;",
    "varying vec3 vN;",
    "varying vec2 vUV;",
    "varying float vZone;",
    "varying vec2 vLocal;",
    "void main() {",
    "  vN = uRot * aNor;",
    "  vUV = aUV;",
    "  vZone = aZone;",
    "  vLocal = aLocal;",
    "  gl_Position = uMVP * vec4(aPos, 1.0);",
    "}"
  ].join("\n");

  const FS = [
    "precision mediump float;",
    "varying vec3 vN;",
    "varying vec2 vUV;",
    "varying float vZone;",
    "varying vec2 vLocal;",
    "uniform vec3 uCol;",
    "uniform float uHot;",
    "uniform float uScan;",
    "uniform float uCut;",
    "uniform float uNU;",
    "uniform float uNB;",
    "uniform float uAU;",
    "uniform float uTN;",
    "uniform float uTB;",
    "uniform float uAC;",
    "uniform float uAR;",
    "uniform sampler2D uTex;",
    "float cutField(float u, float t) {",
    "  float f = -1.0;",
    "  float df = abs(u - floor(u + 0.5));",
    "  if (df < uNU) {",
    "    float q = df / uNU;",
    "    f = max(f, uTN * pow(max(0.0, 1.0 - q * q), 1.5) - t);",
    "  }",
    "  float db = abs(u - 0.5);",
    "  if (db < uNB) {",
    "    float qb = db / uNB;",
    "    f = max(f, uTB * pow(max(0.0, 1.0 - qb * qb), 1.5) - t);",
    "  }",
    "  for (int s = 0; s < 2; s++) {",
    "    float c = (s == 0) ? 0.25 : 0.75;",
    "    float dx = (u - c) / uAU;",
    "    float dy = (t - uAC) / uAR;",
    "    float e = dx * dx + dy * dy;",
    "    if (e < 1.0) { f = max(f, uAR * (1.0 - sqrt(e))); }",
    "  }",
    "  return f;",
    "}",
    "void main() {",
    "  float field = cutField(vUV.x, vUV.y);",
    "  if (uCut > 0.5 && field > 0.0) discard;",
    "  vec3 n = normalize(vN);",
    "  vec3 L1 = normalize(vec3(-0.58, 0.48, 0.66));",
    "  vec3 L2 = normalize(vec3(0.62, 0.12, -0.34));",
    "  float d1 = max(0.0, dot(n, L1));",
    "  float d2 = max(0.0, dot(n, L2)) * 0.26;",
    "  float rim = pow(1.0 - abs(n.z), 3.0) * 0.46;",
    "  vec3 base = uCol;",
    "  if (vLocal.x < 2.0 && vLocal.x > -2.0) {",
    "    float rr = pow(pow(abs(vLocal.x), 4.0) + pow(abs(vLocal.y), 4.0), 0.25);",
    "    base *= mix(1.12, 0.26, smoothstep(0.905, 1.000, rr));",
"    base *= 1.0 + 0.11 * (-vLocal.y);",
    "    if (vZone > -0.5 && vZone < 5.5) {",
    "      float cx = mod(vZone, 2.0), cy = floor(vZone / 2.0 + 0.001);",
    "      vec2 lz = vLocal * 0.5 + 0.5;",
    "      float mark = texture2D(uTex, vec2((cx + lz.x) * 0.5, (cy + lz.y) / 3.0)).r;",
    "      mark *= smoothstep(0.92, 0.70, pow(pow(abs(vLocal.x), 4.0) + pow(abs(vLocal.y), 4.0), 0.25));",
    "      base = mix(base, vec3(0.70, 0.735, 0.775), mark * 0.75);",
    "    }",
    "  }",
    "  if (uCut > 1.5) {",
    "    float seamY = min(vUV.y, 1.0 - vUV.y);",
    "    float edgeK = max(smoothstep(-0.030, -0.009, field), smoothstep(0.018, 0.001, seamY));",
    "    base = mix(base, vec3(0.048, 0.058, 0.074), edgeK * 0.75);",
    "  }",
    "  /* 前中门襟：一道压条 + 两侧单缝线 */",
"  float dF = min(vUV.x, 1.0 - vUV.x);",
"  if (dF < 0.0034) base *= 0.46;",
"  else if (dF > 0.0072 && dF < 0.0090) base *= 0.74;",
"  /* 侧腰网眼片：左右各一片，孔洞透出内部阴影 */",
"  float dSide = min(abs(vUV.x - 0.25), abs(vUV.x - 0.75));",
"  float meshK = smoothstep(0.090, 0.070, dSide) * smoothstep(0.35, 0.47, vUV.y) * smoothstep(0.99, 0.93, vUV.y);",
"  if (uCut < 0.5 && vZone < -0.5) meshK = 0.0;   // 金属接口件不参与网眼图案",
"  if (meshK > 0.002) {",
"    vec2 mg = vec2(vUV.x * 112.0, vUV.y * 124.0);",
"    float hole = smoothstep(0.42, 0.26, length(fract(mg) - 0.5));",
"    base = mix(base, base * mix(0.62, 0.12, hole), meshK);",
"  }",
"  if (uCut < 0.5 && vZone < -0.5) {",
"    float mr = length(vLocal);",
"    base *= mix(1.46, 0.84, smoothstep(0.10, 0.66, mr));",
"  }",
"  if (vZone > -0.5 && abs(vZone - uHot) < 0.5) base = vec3(0.070, 0.560, 0.510);",
    "  vec3 c = base * (0.40 + 0.98 * d1 + d2 + rim);",
    "  c += vec3(0.048, 0.076, 0.108) * pow(d1, 3.0);",
    "  c *= 0.90 + 0.10 * (1.0 - vUV.y);",
    "  float weave = sin((vUV.x * 420.0 + vUV.y * 150.0) * 3.14159) * (1.0 - 0.85 * meshK);",
    "  c *= 1.0 + 0.026 * weave;",
    "  float sx = abs(fract(vUV.x * 2.0) - 0.5);",
    "  if (sx < 0.006) c *= 0.93;",
    "  float sxc = abs(vUV.x - 0.25);",
    "  if (sxc < 0.0022 && vUV.y > 0.30) c *= 0.88;",
    "  if (abs(vUV.x - 0.75) < 0.0022 && vUV.y > 0.30) c *= 0.88;",
    "  if (abs(vUV.x - 0.5) < 0.0016 && vUV.y > 0.18) c *= 0.86;",
    "  if (uCut > 0.5 && uCut < 1.5 && field > -0.006) c = mix(c, vec3(0.235, 0.272, 0.332), 0.34);",
    "  if (uCut > 1.5) c = mix(c, base * 0.9, 0.40);",
    "  float band = smoothstep(0.046, 0.0, abs(vUV.y - uScan)) * 0.28;",
    "  c = mix(c, vec3(0.30, 0.80, 0.76), band * 0.40);",
    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const A_POS = gl.getAttribLocation(prog, "aPos");
  const A_NOR = gl.getAttribLocation(prog, "aNor");
  const A_UV = gl.getAttribLocation(prog, "aUV");
  const A_ZONE = gl.getAttribLocation(prog, "aZone");
  const A_LOCAL = gl.getAttribLocation(prog, "aLocal");
  const U_MVP = gl.getUniformLocation(prog, "uMVP");
  const U_ROT = gl.getUniformLocation(prog, "uRot");
  const U_COL = gl.getUniformLocation(prog, "uCol");
  const U_HOT = gl.getUniformLocation(prog, "uHot");
  const U_SCAN = gl.getUniformLocation(prog, "uScan");
  const U_CUT = gl.getUniformLocation(prog, "uCut");
  gl.uniform1f(gl.getUniformLocation(prog, "uNU"), NU);
  gl.uniform1f(gl.getUniformLocation(prog, "uNB"), NB);
  gl.uniform1f(gl.getUniformLocation(prog, "uAU"), AC_U);
  gl.uniform1f(gl.getUniformLocation(prog, "uTN"), T_NECK);
  gl.uniform1f(gl.getUniformLocation(prog, "uTB"), T_BNECK);
  gl.uniform1f(gl.getUniformLocation(prog, "uAC"), AC_T);
  gl.uniform1f(gl.getUniformLocation(prog, "uAR"), AC_R);

  /* 软垫标注纹理：2 列 × 3 行，L1/R1 … L3/R3（黑底白字，片元取 .r 当遮罩） */
  const U_TEX = gl.getUniformLocation(prog, "uTex");
  const labelTex = (() => {
    const CW = 256, CH = 256;
    const c2 = document.createElement("canvas");
    c2.width = CW * 2; c2.height = CH * 3;
    const g2 = c2.getContext("2d");
    g2.fillStyle = "#000";
    g2.fillRect(0, 0, c2.width, c2.height);
    g2.fillStyle = "#fff";
    g2.font = "500 66px 'Microsoft YaHei', 'PingFang SC', sans-serif";
    g2.textAlign = "center";
    g2.textBaseline = "middle";
    const ids = ["L1", "R1", "L2", "R2", "L3", "R3"];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        g2.fillText(ids[r * 2 + c], c * CW + CW / 2, r * CH + CH / 2);
      }
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  })();

  /* ---------------- 分组 ---------------- */
  const groups = [
    { col: [0.148, 0.180, 0.252], cut: 1, pos: [], nor: [], uv: [], zon: [], loc: [], idx: [], n: 0 }, // 0 外层面料
    { col: [0.068, 0.084, 0.116], cut: 2, pos: [], nor: [], uv: [], zon: [], loc: [], idx: [], n: 0 }, // 1 内里
    { col: [0.248, 0.275, 0.330], cut: 0, pos: [], nor: [], uv: [], zon: [], loc: [], idx: [], n: 0 }, // 2 软垫
    { col: [0.205, 0.234, 0.272], cut: 0, pos: [], nor: [], uv: [], zon: [], loc: [], idx: [], n: 0 }, // 3 背面软垫
    { col: [0.300, 0.318, 0.344], cut: 0, pos: [], nor: [], uv: [], zon: [], loc: [], idx: [], n: 0 }  // 4 金属
  ];

  const pushQuad = (g, p, n, uvs, zone, loc) => {
    const b = g.n;
    const per = Array.isArray(loc) && Array.isArray(loc[0]);
    for (let i = 0; i < 4; i++) {
      const L = per ? loc[i] : (loc || [9, 9]);
      g.pos.push(p[i][0], p[i][1], p[i][2]);
      g.nor.push(n[i][0], n[i][1], n[i][2]);
      g.uv.push(uvs[i][0], uvs[i][1]);
      g.zon.push(zone);
      g.loc.push(L[0], L[1]);
    }
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    g.n += 4;
  };

  /* ---------------- 壳体网格（完整生成，孔洞由片元丢弃） ---------------- */
  const SEG_U = 384, SEG_V = 144;
  /* 壳体：共享顶点网格（400x150 若每格独立顶点会超出 16 位索引上限） */
  const build = (insetFn, dyFn, group) => {
    const ins = insetFn, dyv = dyFn || (() => 0);
    const sg = ins(0.02, 0.5) < 0 ? -1 : 1;
    const stride = SEG_U + 1;
    const base = group.n;

    for (let i = 0; i <= SEG_V; i++) {
      const t = i / SEG_V;
      for (let j = 0; j <= SEG_U; j++) {
        const u = j / SEG_U;
        const p = POS(u, t, ins(u, t), dyv(u, t));
        const e = 0.0014;
        const pa = POS(u - e, t, ins(u - e, t), dyv(u - e, t));
        const pb = POS(u + e, t, ins(u + e, t), dyv(u + e, t));
        const qa = POS(u, t - 0.002, ins(u, t - 0.002), dyv(u, t - 0.002));
        const qb = POS(u, t + 0.002, ins(u, t + 0.002), dyv(u, t + 0.002));
        const ax = pb[0] - pa[0], ay = pb[1] - pa[1], az = pb[2] - pa[2];
        const bx = qb[0] - qa[0], by = qb[1] - qa[1], bz = qb[2] - qa[2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        if (nx * p[0] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        group.pos.push(p[0], p[1], p[2]);
        group.nor.push(sg * nx / L, sg * ny / L, sg * nz / L);
        group.uv.push(u, t);
        group.zon.push(-1);
        group.loc.push(9, 9);
      }
    }

    for (let i = 0; i < SEG_V; i++) {
      for (let j = 0; j < SEG_U; j++) {
        const k = base + i * stride + j;
        group.idx.push(k, k + 1, k + stride + 1, k, k + stride + 1, k + stride);
      }
    }
    group.n = base + stride * (SEG_V + 1);
  };
  build(outerInset, shoulderDrop, groups[0]);
  build(innerInset, shoulderDrop, groups[1]);

  /* ---------------- 六区感知软垫 ---------------- */
  const PADU = 0.058, PADT = 0.086;   // 单块软垫 ≈ 76mm 宽 × 88mm 高
  const ZONES = [];
  for (let r = 0; r < 3; r++) {
    for (let s = 0; s < 2; s++) {
      const id = (s ? "R" : "L") + (r + 1);
      const t = 0.300 + r * 0.203;      // 三行：0.300 / 0.503 / 0.706
      ZONES.push({ id, u: s ? 0.072 : -0.072, t, rear: false, z: r * 2 + s });
      ZONES.push({ id, u: s ? 0.572 : 0.428, t, rear: true, z: r * 2 + s });
    }
  }
  const padLift = zone => (u, t) => {
    const lx = (u - zone.u) / PADU, ly = (t - zone.t) / PADT;
    const rr = Math.pow(Math.pow(Math.abs(lx), 4) + Math.pow(Math.abs(ly), 4), 0.25);
    if (rr >= 1) return 0;
    const k = rr < 0.78 ? 1 : 1 - (rr - 0.78) / 0.22;
    return 2.4 * k * k * (3 - 2 * k);
  };

  const addPatch = (zone, halfU, halfT, su, sv, group, zoneId, liftFn) => {
    const stride = su + 1;
    const pos = [], nor = [], uv = [];
    const uAt = j => zone.u - halfU + (2 * halfU) * (j / su);
    const tAt = i => zone.t - halfT + (2 * halfT) * (i / sv);
    for (let i = 0; i <= sv; i++) {
      for (let j = 0; j <= su; j++) {
        const u = uAt(j), t = tAt(i);
        const p = POS(u, t, liftFn(u, t), shoulderDrop(u, t));
        const e = 0.0010;
        const pa = POS(u - e, t, liftFn(u - e, t), shoulderDrop(u - e, t)),
              pb = POS(u + e, t, liftFn(u + e, t), shoulderDrop(u + e, t));
        const qa = POS(u, t - e, liftFn(u, t - e), shoulderDrop(u, t - e)),
              qb = POS(u, t + e, liftFn(u, t + e), shoulderDrop(u, t + e));
        const ax = pb[0] - pa[0], ay = pb[1] - pa[1], az = pb[2] - pa[2];
        const bx = qb[0] - qa[0], by = qb[1] - qa[1], bz = qb[2] - qa[2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        if (nx * p[0] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        pos.push(p);
        nor.push([nx / L, ny / L, nz / L]);
        uv.push([u, t]);
      }
    }
    for (let i = 0; i < sv; i++) {
      for (let j = 0; j < su; j++) {
        const k = i * stride + j;
        pushQuad(group,
          [pos[k], pos[k + 1], pos[k + stride + 1], pos[k + stride]],
          [nor[k], nor[k + 1], nor[k + stride + 1], nor[k + stride]],
          [uv[k], uv[k + 1], uv[k + stride + 1], uv[k + stride]], zoneId,
          [
            [(uAt(j) - zone.u) / halfU, (tAt(i) - zone.t) / halfT],
            [(uAt(j + 1) - zone.u) / halfU, (tAt(i) - zone.t) / halfT],
            [(uAt(j + 1) - zone.u) / halfU, (tAt(i + 1) - zone.t) / halfT],
            [(uAt(j) - zone.u) / halfU, (tAt(i + 1) - zone.t) / halfT]
          ]);
      }
    }
  };

  for (const zone of ZONES) {
    /* 只装一面：另一面保持纯织物 */
    if ((SENSOR_SIDE === "rear") !== !!zone.rear) continue;
    addPatch(zone, PADU, PADT, 18, 16, groups[zone.rear ? 3 : 2], zone.z, padLift(zone));
  }

  /* 下摆接口模块（左下摆偏前） */
  {
    const zone = { u: 0.822, t: 0.653 };
    const lift = (u, t) => {
      const lx = (u - zone.u) / 0.036, ly = (t - zone.t) / 0.059;
      const rr = Math.pow(Math.pow(Math.abs(lx), 2.4) + Math.pow(Math.abs(ly), 2.4), 1 / 2.4);
      if (rr >= 1) return 0;
      const k = rr < 0.72 ? 1 : 1 - (rr - 0.72) / 0.28;
      return 9.0 * k * k * (3 - 2 * k);
    };
    addPatch(zone, 0.036, 0.059, 12, 16, groups[4], -1, lift);
  }

  /* ---------------- 上传 ---------------- */
  const vbos = groups.map(g => {
    const vbo = {
      pos: gl.createBuffer(), nor: gl.createBuffer(), uv: gl.createBuffer(),
      zon: gl.createBuffer(), loc: gl.createBuffer(), idx: gl.createBuffer(),
      count: g.idx.length, col: g.col, cut: g.cut
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.nor), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.uv);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.uv), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.zon);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.zon), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo.loc);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.loc), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vbo.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.idx), gl.STATIC_DRAW);
    return vbo;
  });

  /* ---------------- 相机 ---------------- */
  const DIST = 1000, FOV = 24 * Math.PI / 180;
  const persp = aspect => {
    const f = 1 / Math.tan(FOV / 2), nf = 1 / (200 - 3000);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (3000 + 200) * nf, -1,
      0, 0, 2 * 3000 * 200 * nf, 0
    ]);
  };
  const mul4 = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                       a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  };

  let W = 1, HC = 1, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth || 340;
    HC = cv.clientHeight || 438;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(HC * dpr));
  };
  resize();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  let ry = -12, rx = -5, vx = 0, dragging = false, px0 = 0, py0 = 0;
  let spin = true;
  const rm = /ry=(-?\d+)/.exec(window.location.hash || "");
  if (rm) { ry = parseInt(rm[1], 10); spin = false; }
  const rm2 = /rx=(-?\d+)/.exec(window.location.hash || "");
  if (rm2) { rx = parseInt(rm2[1], 10); spin = false; }
  let hotZone = 5, hotAt = 0;
  /* 截图/核对时用 #nohot 冻结随机高亮，方便逐帧对比 */
  const FREEZE_HOT = /nohot/.test(window.location.hash || "");

  const draw = ts => {
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);

    const ryR = ry * Math.PI / 180, rxR = rx * Math.PI / 180;
    const cy = Math.cos(ryR), sy = Math.sin(ryR);
    const cx = Math.cos(rxR), sx = Math.sin(rxR);

    const M = new Float32Array([
      cy, sx * sy, -cx * sy, 0,
      0, cx, sx, 0,
      sy, -sx * cy, cx * cy, 0,
      0, 0, 0, 1
    ]);
    const VM = new Float32Array(M);
    VM[14] = -DIST;
    const MVP = mul4(persp(W / HC), VM);
    gl.uniformMatrix4fv(U_MVP, false, MVP);
    gl.uniformMatrix3fv(U_ROT, false, new Float32Array([
      cy, sx * sy, -cx * sy,
      0, cx, sx,
      sy, -sx * cy, cx * cy
    ]));
    gl.uniform1f(U_HOT, hotZone);
    gl.uniform1f(U_SCAN, ((ts * 0.00016) % 1.32) - 0.16);

    for (const vbo of vbos) {
      if (!vbo.count) continue;
      gl.uniform1f(U_CUT, vbo.cut);
      gl.uniform3fv(U_COL, new Float32Array(vbo.col));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, labelTex);
      gl.uniform1i(U_TEX, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.pos);
      gl.enableVertexAttribArray(A_POS);
      gl.vertexAttribPointer(A_POS, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.nor);
      gl.enableVertexAttribArray(A_NOR);
      gl.vertexAttribPointer(A_NOR, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.uv);
      gl.enableVertexAttribArray(A_UV);
      gl.vertexAttribPointer(A_UV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.zon);
      gl.enableVertexAttribArray(A_ZONE);
      gl.vertexAttribPointer(A_ZONE, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo.loc);
      gl.enableVertexAttribArray(A_LOCAL);
      gl.vertexAttribPointer(A_LOCAL, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vbo.idx);
      gl.drawElements(gl.TRIANGLES, vbo.count, gl.UNSIGNED_SHORT, 0);
    }
  };

  /* ---------------- 交互 ---------------- */
  stage.addEventListener("pointerdown", e => {
    dragging = true; px0 = e.clientX; py0 = e.clientY; vx = 0;
    stage.classList.add("grabbing");
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
  });
  stage.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - px0, dy = e.clientY - py0;
    px0 = e.clientX; py0 = e.clientY;
    ry += dx * 0.52;
    rx = Math.max(-28, Math.min(28, rx - dy * 0.24));
    vx = dx * 0.20;
  });
  const release = () => { dragging = false; stage.classList.remove("grabbing"); };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("pointerleave", release);

  let lastT = 0;
  const tick = ts => {
    if (!lastT) lastT = ts;
    const dt = Math.min(64, ts - lastT);
    lastT = ts;

    if (!dragging) {
      if (Math.abs(vx) > 0.04) { ry += vx * dt / 16; vx *= 0.94; }
      else if (spin && !noMotion) ry += 0.12 * dt / 16;
    }
    if (ry > 360) ry -= 360;
    if (ry < -360) ry += 360;

    if (ts - hotAt > 1100) {
      hotAt = ts;
      hotZone = FREEZE_HOT ? -1 : (Math.random() * 6) | 0;
    }

    draw(ts);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ============================================================
   首页五步视觉流程：顺序点亮
   ============================================================ */
function initPipeline() {
  const steps = $$("#pipeline .pipe-step");
  if (!steps.length) return;
  let i = 0;
  setInterval(() => {
    steps.forEach((s, k) => s.classList.toggle("live", k === i));
    i = (i + 1) % steps.length;
  }, 1250);
  steps[0].classList.add("live");
}

/* ============================================================
   用户信息：头像首字与受试者姓名保持一致
   ============================================================ */
function initUser() {
  const av = $(".user-chip .avatar");
  if (av) av.textContent = (SUBJECT.name || "?").charAt(0);
  const chips = $$(".user-chip .meta");
  chips.forEach(el => {
    const b = el.querySelector("b");
    if (b) b.textContent = SUBJECT.name;
    const s = el.querySelector("span");
    if (s) s.textContent = `${SUBJECT.sex} · ${SUBJECT.age} 岁 · 检测编号 ${SUBJECT.id}`;
  });
}

/* ============================================================
   载荷响应曲线生成（四档阶梯加载 → 卸载恢复，约 45 s）
   ============================================================ */
function buildLoadProfile() {
  const pts = [];
  let t = 0, cur = 0;
  const push = v => { t = +(t + 0.25).toFixed(2); pts.push([t, +v.toFixed(2)]); };
  LOAD_LEVELS.forEach(level => {
    const ramp = (level - cur) / LOAD_PROTOCOL.rate;          // 2 kPa/s
    for (let x = 0; x < ramp - 1e-6; x += 0.25) push(cur + LOAD_PROTOCOL.rate * (x + 0.25));
    cur = level;
    for (let x = 0; x < LOAD_PROTOCOL.hold; x += 0.25) push(cur);   // 单档保持 5 s
  });
  for (let x = 0; x < 15; x += 0.25) push(0);                 // 卸载恢复 15 s
  return pts;
}
function lagResponse(profile, factor, tau, noise) {
  const out = [];
  let y = 0;
  for (let i = 0; i < profile.length; i++) {
    const [tt, target] = profile[i];
    y += (target * factor - y) * (0.25 / tau);
    out.push([tt, +Math.max(0, y + rnd(-noise, noise)).toFixed(3)]);
  }
  return out;
}

/* ============================================================
   检测结果页（对齐参考图 界面.png）
   ============================================================ */
function initResult() {
  resetRng();
  const profile = buildLoadProfile();

  /* ① 六个区域压力—形变曲线 */
  const grid = $("#regionGrid");
  if (grid) {
    grid.innerHTML = REGIONS.map(r => `
      <div class="card region-card reveal">
        <div class="card-head">
          <span class="rc-id">${r.id}</span>
          <span class="rc-side">${r.side}</span>
          <span class="pill ${r.bias > 6 ? "warn" : "ok"}" style="margin-left:auto">${r.bias > 6 ? "需关注" : "低风险"}</span>
        </div>
        <div id="rc-${r.id}" class="chart chart-xs"></div>
      </div>`).join("");
  }
  REGIONS.forEach(r => {
    const pData = lagResponse(profile, r.p / 20, 0.9, 0.06);
    const dData = lagResponse(profile, r.d / 20, 1.15, 0.015);
    makeChart(`rc-${r.id}`, {
      tooltip: { trigger: "axis", ...TIP, valueFormatter: v => (v == null ? "-" : (+v).toFixed(2)) },
      legend: { ...LEGEND, top: 0, right: 0, data: ["压力响应", "形变响应"] },
      grid: { left: 34, right: 14, top: 26, bottom: 20 },
      xAxis: { type: "value", min: 0, max: 46, ...AXIS, axisLabel: { ...AXIS.axisLabel, fontSize: 9.5, formatter: "{value}s" } },
      yAxis: [
        { type: "value", min: 0, max: 22, ...AXIS, axisLabel: { ...AXIS.axisLabel, fontSize: 9.5 } },
        { type: "value", min: 0, max: 6, show: false }
      ],
      series: [
        {
          name: "压力响应", type: "line", showSymbol: false, smooth: .25, data: pData, animation: false,
          lineStyle: { color: C.violet, width: 2 }, itemStyle: { color: C.violet },
          areaStyle: { color: "rgba(124,120,214,.10)" }
        },
        {
          name: "形变响应", type: "line", showSymbol: false, smooth: .25, yAxisIndex: 1, data: dData, animation: false,
          lineStyle: { color: C.brand2, width: 2 }, itemStyle: { color: C.brand2 }
        }
      ]
    });
  });

  /* ② 左右响应差异分析（雷达：六区，当前值 vs 基线值） */
  const base = REGIONS.map(r => +(r.p * (1 - (r.bias / 100) * 1.2)).toFixed(2));
  makeChart("radarChart", {
    tooltip: { ...TIP },
    legend: { ...LEGEND, bottom: 0, data: ["当前值", "基线值"] },
    radar: {
      radius: "62%", center: ["50%", "46%"],
      indicator: REGIONS.map(r => ({ name: r.id, max: 20 })),
      axisName: { color: C.slate, fontSize: 11 },
      splitLine: { lineStyle: { color: C.grid } },
      splitArea: { areaStyle: { color: ["#fbfefd", "#f3faf8"] } },
      axisLine: { lineStyle: { color: C.line } }
    },
    series: [{
      type: "radar", symbolSize: 5,
      data: [
        { value: REGIONS.map(r => r.p), name: "当前值", lineStyle: { color: C.warn, width: 2 }, itemStyle: { color: C.warn }, areaStyle: { color: "rgba(215,143,10,.16)" } },
        { value: base, name: "基线值", lineStyle: { color: C.brand, width: 2, type: "dashed" }, itemStyle: { color: C.brand }, areaStyle: { color: "rgba(15,159,153,.10)" } }
      ]
    }]
  });
  const rt = $("#regionTbl");
  if (rt) {
    rt.innerHTML = HEIGHTS.map(h => {
      const L = REGIONS.find(r => r.id === h.L), R = REGIONS.find(r => r.id === h.R);
      const s = sasi(L.p, R.p);
      return `<tr><td>${h.name}（${h.L}/${h.R}）</td><td>${s.toFixed(3)}</td><td>${s > 0 ? "右侧偏大" : "左侧偏大"}</td></tr>`;
    }).join("");
  }

  /* ③ 个人历史趋势（不对称指数 %） */
  makeChart("historyChart", {
    tooltip: { trigger: "axis", ...TIP, valueFormatter: v => (v == null ? "-" : (+v).toFixed(1) + "%") },
    grid: { left: 42, right: 18, top: 24, bottom: 34 },
    xAxis: { type: "category", data: SUBJECT.sessions.map(s => `${s.name}\n${s.date.slice(5)}`), ...AXIS },
    yAxis: { type: "value", name: "%", min: 0, max: Math.max(8, Math.ceil(Math.max(...SUBJECT.sessions.map(s => s.asym)) * 1.05 / 2) * 2), ...AXIS },
    series: [{
      name: "左右不对称指数", type: "line", smooth: true, symbolSize: 7,
      data: SUBJECT.sessions.map(s => s.asym),
      lineStyle: { color: C.warn, width: 2.5 }, itemStyle: { color: C.warn },
      areaStyle: { color: "rgba(215,143,10,.12)" },
      markLine: {
        silent: true, symbol: "none",
        lineStyle: { color: C.risk, type: "dashed", width: 1.4 },
        label: { color: C.risk, fontSize: 10, formatter: "MDC " + SUBJECT.MDC + "%" },
        data: [{ yAxis: SUBJECT.MDC }]
      }
    }]
  });

  /* ④ 关键指标 */
  const last = SUBJECT.sessions[3], first = SUBJECT.sessions[0], prev = SUBJECT.sessions[2];
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  const pctDelta = (now, base) => `${now >= base ? "+" : ""}${((now - base) / base * 100).toFixed(1)}%`;
  set("#mAsym", `${last.asym.toFixed(1)}<i> %</i>`);
  set("#mAsymNote", `基线 ${first.asym.toFixed(1)}%（${first.date}）`);
  set("#mPress", `${CASE_META.pressMeanNow.toFixed(1)}<i> kPa</i>`);
  set("#mPressNote", `较基线 ${pctDelta(CASE_META.pressMeanNow, CASE_META.pressMeanBase)}`);
  set("#mDeform", `${last.deform.toFixed(2)}<i> mm</i>`);
  set("#mDeformNote", `较基线 ${pctDelta(CASE_META.deformMeanNow, CASE_META.deformMeanBase)}`);
  set("#mTrend", `+${(last.asym - prev.asym).toFixed(1)}<i> %</i>`);
  set("#mTrendNote", `较上次，连续 ${CASE_META.trendPeriods} 次检测单向偏移`);
  const mv = $("#mTrend");
  if (mv) mv.classList.add("up");
  const badge = $("#resultBanner");
  if (badge) badge.className = "banner " + STATUS_CLS[SUBJECT.level];

  /* ---- 综合状态横幅文案：由数据推导，不写死 ---- */
  const domR = REGIONS.reduce((a, b) => (b.bias > a.bias ? b : a), REGIONS[0]);
  const domH = HEIGHTS.find(h => h.key === domR.h) || HEIGHTS[1];
  const domSide = domR.id[0] === "R" ? "右侧" : "左侧";
  const domHTxt = domH.name;
  const bt = $("#resultBannerTitle"), btx = $("#resultBannerText");
  if (bt) bt.textContent = STATUS_TXT[SUBJECT.level];
  /* 侧弯方向：由主导区域的侧别推导（R → 右侧凸），不写死 */
  const bendTxt = `${domSide}弯（${domSide}凸）`;
  const bendEl = $("#kpiBend");
  if (bendEl) bendEl.textContent = bendTxt;
  if (btx) btx.textContent =
    `主导区域为${domSide}${domHTxt}（${domH.L} / ${domH.R}），左右不对称指数当前 ${last.asym.toFixed(1)}%，` +
    `已超出 MDC 阈值（${SUBJECT.MDC.toFixed(1)}%），连续 ${CASE_META.trendPeriods} 次检测单向增大，` +
    `提示脊柱向${bendTxt}风险。` +
    (SUBJECT.level === "risk"
      ? "建议尽快前往专业机构（骨科 / 康复科）接受临床评估。"
      : "建议缩短复查间隔并加强观察。");

  /* ---- 当前检测状态条 ---- */
  const stQual = $("#stQualB");
  if (stQual) stQual.textContent = `数据完整率 ${SUBJECT.quality.toFixed(1)}%`;

  /* ---- 大型核心指标卡：综合不对称指数 SASI ---- */
  const kpiHero = $("#kpiHero");
  if (kpiHero) kpiHero.classList.add(STATUS_CLS[SUBJECT.level]);
  const dltKpi = +(last.asym - first.asym).toFixed(1);
  const setT = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  const kv = $("#kpiVal"); if (kv) kv.innerHTML = `${last.asym.toFixed(1)}<i>%</i>`;
  setT("#kpiDelta", `${dltKpi >= 0 ? "+" : ""}${dltKpi.toFixed(1)} %`);
  setT("#kpiMdc", `${SUBJECT.MDC.toFixed(1)} %`);
  setT("#kpiStatus", STATUS_TXT[SUBJECT.level]);
  const ring = $("#kpiRing");
  if (ring) {
    const R = 64, CIR = +(2 * Math.PI * R).toFixed(1);
    ring.style.strokeDasharray = CIR;
    ring.style.strokeDashoffset = CIR;
    const ratio = clamp(last.asym / 12, 0.04, 1);      // 12% 视为满量程
    requestAnimationFrame(() => { ring.style.strokeDashoffset = +(CIR * (1 - ratio)).toFixed(1); });
  }

  /* 底部「系统建议」摘要：与报告页共用同一建议引擎 */
  buildAdvice();
}

/* ============================================================
   载荷响应分析页
   ============================================================ */
function initAnalysis() {
  resetRng();
  const TICK = 120;
  const RAMP = s => s / LOAD_PROTOCOL.rate;   // 2 kPa/s
  const HOLD = LOAD_PROTOCOL.hold * 1000;
  const RELEASE = 15000;
  let stageIdx = 0, stageT = 0, phase = "load", t = 0, pressure = 0, deform = 0;

  const loadNow = $("#loadNow"), loadLabel = $("#loadLabel"), loadBar = $("#loadBar i");
  const stepEls = $$(".load-step");
  const MAXN = 420;
  const pData = [], dData = [];
  const tau = SUBJECT.sessions[3].rec;

  /* ---- 实时检测面板：当前载荷 / 阶段 / 进度 / 剩余时间 ---- */
  const stageDurMs = LOAD_LEVELS.map(l => (l / LOAD_PROTOCOL.rate) * 1000 + HOLD);
  const cycleMs = stageDurMs.reduce((a, b) => a + b, 0) + RELEASE;
  const liveLoad = $("#liveLoad"), livePhase = $("#livePhase"), liveProg = $("#liveProg"),
    liveRemain = $("#liveRemain"), liveProgTxt = $("#liveProgTxt"), liveBar = $("#liveProgBar i");

  /* ---- 六区实时响应瓦片 ---- */
  const grid = $("#liveGrid");
  if (grid) {
    grid.innerHTML = REGIONS.map(r => `
      <div class="live-tile" id="lt-${r.id}">
        <div class="lt-id">${r.id}</div>
        <div class="lt-side">${r.side}</div>
        <div class="lt-p">0.00<small> kPa</small></div>
        <div class="lt-d">0.00 mm</div>
        <div class="lt-bar"><i></i></div>
      </div>`).join("");
  }
  const meanP = REGIONS.reduce((a, r) => a + r.p, 0) / REGIONS.length;
  const meanD = REGIONS.reduce((a, r) => a + r.d, 0) / REGIONS.length;
  const liveTiles = REGIONS.map(r => ({
    r,
    p: $(`#lt-${r.id} .lt-p`), d: $(`#lt-${r.id} .lt-d`),
    bar: $(`#lt-${r.id} .lt-bar i`), box: $(`#lt-${r.id}`)
  }));

  /* 模块 2/3：压力—时间 / 形变—时间 */
  const pChart = makeChart("pressureChart", {
    tooltip: { trigger: "axis", ...TIP },
    legend: { ...LEGEND, top: 0, data: ["载荷输入", "压力响应"] },
    grid: { left: 44, right: 16, top: 30, bottom: 26 },
    xAxis: { type: "value", name: "t / s", min: 0, max: 45, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    yAxis: { type: "value", name: "kPa", min: 0, max: 24, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    series: [
      { name: "载荷输入", type: "line", showSymbol: false, step: "end", data: [], animation: false, lineStyle: { color: C.line, width: 2, type: "dashed" }, itemStyle: { color: C.line } },
      { name: "压力响应", type: "line", showSymbol: false, smooth: .3, data: [], animation: false, lineStyle: { color: C.violet, width: 2.4 }, itemStyle: { color: C.violet }, areaStyle: { color: "rgba(124,120,214,.10)" } }
    ]
  });
  const dChart = makeChart("deformChart", {
    tooltip: { trigger: "axis", ...TIP },
    legend: { ...LEGEND, top: 0, data: ["形变响应"] },
    grid: { left: 44, right: 16, top: 30, bottom: 26 },
    xAxis: { type: "value", name: "t / s", min: 0, max: 45, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    yAxis: { type: "value", name: "mm", min: 0, max: 6, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    series: [{ name: "形变响应", type: "line", showSymbol: false, smooth: .3, data: [], animation: false, lineStyle: { color: C.brand2, width: 2.4 }, itemStyle: { color: C.brand2 }, areaStyle: { color: "rgba(23,191,168,.12)" } }]
  });

  /* 模块 4：SASI(P) 曲线（带符号，可跨零 → 反转点） */
  /* 纵轴量程随病例自适应，避免高值被裁到画布外 */
  const sasiAll = [...SASI_P.upper, ...SASI_P.middle, ...SASI_P.lower,
                   ...SASI_P0.upper, ...SASI_P0.middle, ...SASI_P0.lower];
  const sasiHi = Math.max(0.09, Math.ceil(Math.max(...sasiAll) * 130) / 100);
  const sasiLo = Math.min(-0.08, Math.floor(Math.min(...sasiAll) * 130) / 100);
  makeChart("sasiChart", {
    tooltip: {
      trigger: "axis", ...TIP,
      formatter: ps => {
        const p = ps[0].axisValue;
        return `${p} kPa<br/>` + ps.map(s => `${s.marker}${s.seriesName}：${(+s.value).toFixed(3)}`).join("<br/>");
      }
    },
    legend: { ...LEGEND, top: 0, data: HEIGHTS.map(h => `${h.name}（${h.L}/${h.R}）`) },
    grid: { left: 50, right: 20, top: 32, bottom: 28 },
    xAxis: { type: "category", name: "载荷档位 P / kPa", data: LOAD_LEVELS, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    yAxis: { type: "value", name: "SASI（带符号）", min: sasiLo, max: sasiHi, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    series: HEIGHTS.map((h, i) => ({
      name: `${h.name}（${h.L}/${h.R}）`, type: "line", smooth: true,
      data: SASI_P[h.key], symbolSize: 7,
      lineStyle: { width: h.key === "middle" ? 3 : 2, color: [C.brand, C.warn, C.brandLight][i] },
      itemStyle: { color: [C.brand, C.warn, C.brandLight][i] },
      markLine: h.key === "middle" ? {
        silent: true, symbol: ["none", "circle"], symbolSize: 9,
        lineStyle: { color: C.risk, type: "dashed", width: 1.4 },
        label: { color: C.risk, fontSize: 10, formatter: `反转点 P* ≈ ${CASE_META.reversalP.toFixed(1)} kPa` },
        data: [{ yAxis: 0, xAxis: 1 + (CASE_META.reversalP - LOAD_LEVELS[1]) / (LOAD_LEVELS[2] - LOAD_LEVELS[1]) }]
      } : undefined
    }))
  });
  const sasiNote = $("#sasiNote");
  if (sasiNote) {
    sasiNote.innerHTML =
      `<b>SASI<sub>k</sub>(P)</b> = (R<sub>k</sub>(P) − L<sub>k</sub>(P)) / [(R<sub>k</sub>(P) + L<sub>k</sub>(P)) / 2]（《说明书》3.3.3）。
       正值表示右侧响应较大。曲线<b>过零即反转点</b>——因此必须使用<b>带符号</b>定义，取绝对值将无法定义反转点。`;
  }

  /* 特征计算 */
  const tiles = { amp: $("#fAmp"), slope: $("#fSlope"), cross: $("#fCross"), rec: $("#fRec"), hyst: $("#fHyst"), dom: $("#fDom") };
  function computeMetrics() {
    const stage = phase === "load" ? LOAD_LEVELS[stageIdx] : LOAD_LEVELS[LOAD_LEVELS.length - 1];
    const amp = SASI_P.middle[LOAD_LEVELS.indexOf(stage)] ?? SASI_P.middle[3];
    const slope = (SASI_P.middle[3] - SASI_P.middle[0]) / (LOAD_LEVELS[3] - LOAD_LEVELS[0]);
    if (tiles.amp) tiles.amp.innerHTML = `${amp.toFixed(3)}<i></i>`;
    if (tiles.slope) tiles.slope.innerHTML = `${slope.toFixed(4)}<i> /kPa</i>`;
    if (tiles.cross) tiles.cross.innerHTML = `${CASE_META.reversalP.toFixed(1)}<i> kPa</i>`;
    if (tiles.rec) tiles.rec.innerHTML = `${tau.toFixed(1)}<i> s</i>`;
    if (tiles.hyst) tiles.hyst.innerHTML = `${SUBJECT.sessions[3].hyst.toFixed(1)}<i> %</i>`;
    if (tiles.dom) tiles.dom.innerHTML = `${CASE_META.diagDominance.toFixed(2)}<i></i>`;
  }

  function tick() {
    t += TICK / 1000;
    stageT += TICK;
    let target;
    if (phase === "load") {
      target = LOAD_LEVELS[stageIdx];
      if (stageT >= HOLD) {
        if (stageIdx < LOAD_LEVELS.length - 1) { stageIdx++; stageT = 0; computeMetrics(); }
        else { phase = "release"; stageT = 0; }
      }
    } else {
      target = 0;
      if (stageT >= RELEASE) { phase = "load"; stageIdx = 0; stageT = 0; computeMetrics(); }
    }
    pressure += (target - pressure) * (TICK / 1000 / 0.9) + rnd(-0.05, 0.05);
    deform += (target * 0.22 - deform) * (TICK / 1000 / 1.15) + rnd(-0.012, 0.012);
    pressure = Math.max(0, pressure); deform = Math.max(0, deform);

    if (loadNow) loadNow.innerHTML = `${target}<small> kPa</small>`;
    if (loadLabel) loadLabel.textContent = phase === "load"
      ? `分级加载中 · 第 ${stageIdx + 1} / ${LOAD_LEVELS.length} 级 · 目标 ${LOAD_LEVELS[stageIdx]} kPa · 加载速率 ${LOAD_PROTOCOL.rate} kPa/s`
      : "卸载恢复阶段 · 记录组织恢复时间常数";
    if (loadBar) loadBar.style.width = `${(target / LOAD_LEVELS[LOAD_LEVELS.length - 1]) * 100}%`;
    stepEls.forEach((el, i) => {
      el.classList.toggle("active", phase === "load" && i === stageIdx);
      el.classList.toggle("done", phase === "release" || i < stageIdx);
    });

    /* 实时面板数值 */
    let done;
    if (phase === "load") done = stageDurMs.slice(0, stageIdx).reduce((a, b) => a + b, 0) + stageT;
    else done = cycleMs - RELEASE + stageT;
    const pct = clamp(done / cycleMs * 100, 0, 100);
    if (liveLoad) liveLoad.innerHTML = `${Math.round(target)} <small>kPa</small>`;
    if (livePhase) livePhase.textContent = phase === "load"
      ? (stageT > HOLD * 0.35 ? "稳态保持" : "分级加载") : "卸载恢复";
    if (liveProg) liveProg.innerHTML = `${pct.toFixed(0)} <small>%</small>`;
    if (liveRemain) liveRemain.innerHTML = `${Math.max(0, (cycleMs - done) / 1000).toFixed(1)} <small>s</small>`;
    if (liveProgTxt) liveProgTxt.textContent = `${pct.toFixed(0)}%`;
    if (liveBar) liveBar.style.width = pct + "%";

    /* 六区实时瓦片：按各自六区压力/形变占比缩放 */
    liveTiles.forEach(t => {
      const pv = pressure * (t.r.p / meanP);
      const dv = deform * (t.r.d / meanD);
      if (t.p) t.p.innerHTML = `${pv.toFixed(2)}<small> kPa</small>`;
      if (t.d) t.d.textContent = `${dv.toFixed(2)} mm`;
      if (t.bar) t.bar.style.width = clamp(pv / 20 * 100, 0, 100) + "%";
      if (t.box) t.box.classList.toggle("on", phase === "load" && pressure > 1.5);
    });

    pData.push([+t.toFixed(1), +pressure.toFixed(2)]);
    dData.push([+t.toFixed(1), +deform.toFixed(2)]);
    if (pData.length > MAXN) { pData.shift(); dData.shift(); }
    const xMin = Math.max(0, t - 45);

    if (pChart) pChart.setOption({
      xAxis: { min: xMin, max: xMin + 45 },
      series: [
        { data: pData.map(([x]) => [x, phase === "load" ? LOAD_LEVELS[stageIdx] : 0]) },
        { data: pData }
      ]
    });
    if (dChart) dChart.setOption({ xAxis: { min: xMin, max: xMin + 45 }, series: [{ data: dData }] });
    const pEl = $("#rtPressure"), dEl = $("#rtDeform");
    if (pEl) pEl.textContent = pressure.toFixed(2) + " kPa";
    if (dEl) dEl.textContent = deform.toFixed(2) + " mm";
  }
  computeMetrics();
  setInterval(tick, TICK);
}

/* ============================================================
   健康基线页
   ============================================================ */
function initBaseline() {
  const B0 = SUBJECT.sessions[0].resp, MDC = SUBJECT.MDC;

  makeChart("baselineChart", {
    tooltip: {
      trigger: "axis", ...TIP,
      formatter: ps => {
        const s = SUBJECT.sessions[ps[0].dataIndex];
        const d = s.resp - B0;
        return `${s.name} · ${s.label}<br/>检测日期：${s.date}<br/>力学响应指数：${s.resp.toFixed(1)}<br/>相对 B0 变化量：${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
      }
    },
    grid: { left: 48, right: 26, top: 34, bottom: 30 },
    xAxis: { type: "category", data: SUBJECT.sessions.map(s => `${s.name}\n${s.label}`), ...AXIS },
    yAxis: { type: "value", name: "响应指数", min: 90, max: 112, nameTextStyle: { color: C.axis, fontSize: 10.5 }, ...AXIS },
    series: [{
      name: "力学响应指数", type: "line", smooth: true, symbolSize: 9,
      data: SUBJECT.sessions.map(s => s.resp),
      lineStyle: { color: C.brand, width: 3 }, itemStyle: { color: C.brand, borderColor: "#fff", borderWidth: 2 },
      areaStyle: { color: "rgba(15,159,153,.10)" },
      markArea: {
        silent: true, itemStyle: { color: "rgba(24,154,91,.07)" },
        label: { color: C.ok, fontSize: 10.5, position: "insideTop" },
        data: [[{ name: `MDC 波动允许范围（B0 ± ${MDC.toFixed(1)}%）`, yAxis: B0 - MDC }, { yAxis: B0 + MDC }]]
      },
      markLine: {
        silent: true, symbol: "none",
        lineStyle: { color: C.warn, type: "dashed", width: 1.4 },
        label: { color: C.warn, fontSize: 10.5, formatter: `MDC 上限 ${(B0 + MDC).toFixed(1)}` },
        data: [{ yAxis: B0 + MDC }]
      }
    }]
  });

  const tbody = $("#blTableBody");
  if (tbody) {
    tbody.innerHTML = SUBJECT.sessions.map((s, i) => {
      const d = s.resp - B0, over = Math.abs(d) > MDC;
      const judge = i === 0 ? '<span class="pill ok">基线建立</span>'
        : over ? '<span class="pill warn">超出 MDC</span>' : '<span class="pill ok">范围内</span>';
      return `<tr><td>${s.name}</td><td>${s.date}</td><td>${s.resp.toFixed(1)}</td>
        <td class="${over ? "up" : "ok"}">${i === 0 ? "—" : (d > 0 ? "+" : "") + d.toFixed(1) + "%"}</td>
        <td>${judge}</td></tr>`;
    }).join("");
  }

  const blId = $("#blCaseId");
  if (blId) blId.textContent = `检测编号 ${SUBJECT.id}`;

  const dv = $("#deltaValue");
  if (dv) countUp(dv, SUBJECT.sessions[3].resp - B0, { dec: 1, dur: 1400, suffixHtml: "<i> %</i>" });
  const icc = $("#iccVal");
  if (icc) countUp(icc, 0.86, { dec: 2, dur: 1200 });
  const sem = $("#semVal");
  if (sem) countUp(sem, 2.16, { dec: 2, dur: 1200, suffixHtml: " %" });

  /* ---- 基线演进时间轴（B0 → B3） ---- */
  const tlNodes = $("#tlNodes"), tlFill = $("#tlFill");
  if (tlNodes) {
    tlNodes.innerHTML = SUBJECT.sessions.map((s, i) => {
      const d = s.resp - B0, cur = i === SUBJECT.sessions.length - 1;
      return `<div class="tl-node ${cur ? "cur" : ""}">
        <div class="tl-date">${s.date}</div>
        <div class="tl-dot"></div>
        <div class="tl-name">${s.name}</div>
        <div class="tl-val">${s.resp.toFixed(1)}</div>
        <div class="tl-delta">${i === 0 ? "基线建立" : (d > 0 ? "+" : "") + d.toFixed(1) + "%"}</div>
        <div class="tl-tag">${s.label}</div>
      </div>`;
    }).join("");
    if (tlFill) setTimeout(() => { tlFill.style.width = "100%"; }, 260);
  }

  /* ---- 个人健康档案信息块 ---- */
  const fc = $("#fileCells");
  if (fc) {
    const last = SUBJECT.sessions[SUBJECT.sessions.length - 1];
    const d = +(last.resp - B0).toFixed(1);
    const over = Math.abs(d) > MDC;
    const rising = last.resp > SUBJECT.sessions[0].resp;
    fc.innerHTML = `
      <div class="file-cell"><div class="k">检测次数</div><div class="v">${SUBJECT.sessions.length} 次</div></div>
      <div class="file-cell"><div class="k">首次基线建立</div><div class="v">${SUBJECT.sessions[0].date}</div></div>
      <div class="file-cell"><div class="k">最近一次检测</div><div class="v">${last.date}</div></div>
      <div class="file-cell"><div class="k">趋势方向</div><div class="v ${rising ? "up" : ""}">${rising ? "持续上升 ↑" : "平稳 / 下降 ↓"}</div></div>
      <div class="file-cell"><div class="k">MDC 阈值</div><div class="v">${MDC.toFixed(1)} %</div></div>
      <div class="file-cell"><div class="k">状态判断</div><div class="v ${over ? "up" : ""}">${over ? "超出测量波动范围" : "处于波动范围内"}</div></div>`;
  }

  /* ---- 结论（数据驱动，不再写死数值与日期） ---- */
  const concl = $("#blConcl");
  if (concl) {
    const last = SUBJECT.sessions[SUBJECT.sessions.length - 1];
    const d = +(last.resp - B0).toFixed(1);
    const over = Math.abs(d) > MDC;
    concl.innerHTML = `<b>结论：</b>${last.name}（${last.label}，${last.date}）相对 B0 变化量为 <b>${d > 0 ? "+" : ""}${d.toFixed(1)}%</b>，` +
      `${over ? `已超出 MDC 阈值（${MDC.toFixed(1)}%），判定变化超出测量波动范围` : `仍在 MDC 阈值（${MDC.toFixed(1)}%）以内`}。` +
      `系统已将该受检者标记为「${STATUS_TXT[SUBJECT.level]}」，建议${SUBJECT.level === "warn" ? "缩短复查间隔并跟踪下一周期数据" : "按系统提示持续跟踪"}，详见 ` +
      `<a href="report.html" style="color:#0f9b8e;font-weight:600">综合风险评估</a>。`;
  }
}

/* ============================================================
   综合风险评估页（对齐参考图 界面2.png）
   ============================================================ */
/* ============================================================
   系统建议引擎：按本次检测数据自适应生成
   输入 SUBJECT / REGIONS / SASI_P / SASI_P0 / CASE_META
   输出 报告页「系统建议」分组卡片 + 检测结果页一句话摘要
   所有文案均由数据推导，不写死具体数值
   ============================================================ */
const ADV_ICON = {
  tip: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round"><path d="M12 3.5l9 16.5H3L12 3.5z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.8" r=".9" fill="currentColor"/></svg>'
};

function buildAdvice() {
  const H_NAME = { upper: "上背", middle: "中背", lower: "下背" };
  const first = SUBJECT.sessions[0], last = SUBJECT.sessions[3], prev = SUBJECT.sessions[2];

  /* ① 主导区域：六区中偏差最大者，决定建议方向 */
  const dom = REGIONS.reduce((a, b) => (b.bias > a.bias ? b : a), REGIONS[0]);
  const isRight = dom.id[0] === "R";
  const sideTxt = isRight ? "右" : "左";
  const hName = H_NAME[dom.h];
  const domSasi = +(SASI_P[dom.h][3] * 100).toFixed(1);      // 主导层面当前不对称 %
  const domBase = +(SASI_P0[dom.h][3] * 100).toFixed(1);     // 主导层面基线不对称 %
  const exceed = Math.abs(domSasi) > SUBJECT.MDC;

  /* ② 趋势与恢复性 */
  const deltaAsym = +(last.asym - first.asym).toFixed(1);
  const trendUp = last.asym > prev.asym && prev.asym > SUBJECT.sessions[1].asym;
  const recUp = +(last.rec - first.rec).toFixed(1);
  const hystUp = +(last.hyst - first.hyst).toFixed(1);
  const P = CASE_META.reversalP;

  /* ---- 组 1 · 体态与坐姿（方向由主导层面决定） ---- */
  const POSTURE = {
    middle: `主受力侧集中在${sideTxt}侧${hName}，优先纠正含胸、前倾类坐姿：背部贴靠椅背、桌椅高度调到肘关节约 90°，阅读书写时视线与桌面保持约 45°。`,
    upper: `主受力侧集中在${sideTxt}侧${hName}，优先保持双肩受力均衡：书包改双肩背、避免单侧挎包与长时间偏头书写，课间做耸肩—绕肩放松。`,
    lower: `主受力侧集中在${sideTxt}侧${hName}，优先加强坐姿支撑：坐满椅面、后腰加靠垫、双脚平放，避免久坐塌腰与习惯性跷二郎腿。`
  }[dom.h];

  const GRIP = exceed
    ? `${hName}左右不对称 ${domSasi}%（基线 ${domBase}%），已超出 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}%，属于需要主动干预的范围，建议按上述要求逐项纠正并记录执行情况。`
    : `${hName}左右不对称 ${domSasi}%（基线 ${domBase}%），仍在 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}% 以内，保持现有习惯、按计划复测即可。`;

  /* ---- 组 2 · 日常行为习惯 ---- */
  const HABIT_LOAD = `载荷—响应曲线在${hName}约 ${P} kPa 处出现左右强弱翻转，说明不对称在较轻负荷下即可显现；建议日常负重控制在体重的 10% 以内，并优先纠正${sideTxt}侧单侧用力习惯（单肩背包、单侧倚靠、单边手支撑）。`;

  const sitMin = last.rec > 3.5 ? 30 : 45;
  const HABIT_REST = `恢复时间常数由 ${first.rec.toFixed(1)} s 延长至 ${last.rec.toFixed(1)} s（+${recUp}）、滞后由 ${first.hyst}% 升至 ${last.hyst}%（+${hystUp}），提示组织恢复与回弹能力下降；建议单次连续坐姿不超过 ${sitMin} 分钟，起身做扩胸与肩背拉伸 1–2 分钟，并保证每日适量有氧与背部肌群锻炼。`;

  /* ---- 组 3 · 复查与就医安排 ---- */
  const REVIEW = {
    ok: `本次变化量 ${deltaAsym}%，在 MDC 阈值以内，按计划 10 周后复测即可，无需缩短复查间隔。`,
    warn: `本次变化量 ${deltaAsym}%，超出 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}%${trendUp ? `，且连续 ${CASE_META.trendPeriods} 次检测单向偏移` : ""}；建议将复查间隔由 10 周缩短至 4–6 周，获取下一周期数据确认趋势。`,
    risk: `本次已触发「建议专业筛查」，建议在 2–4 周内完成复测，并同步咨询专业机构。`
  }[SUBJECT.level] || "";

  /* ---- 就医提醒：醒目块，仅「需关注」及以上出现 ---- */
  const ALERT = {
    warn: {
      cls: "warn",
      text: `本次为「需关注」级辅助筛查提示：请按 4–6 周周期复测；<b>若下一周期指标仍单向超出 MDC，请前往专业机构（骨科 / 康复科）接受临床评估</b>。目前无需紧急处理，但不建议长期搁置。`
    },
    risk: {
      cls: "risk",
      text: `<b>本次已触发「建议专业筛查」，建议尽快前往专业机构（骨科 / 康复科）接受临床评估，就诊时携带本报告。</b>`
    }
  }[SUBJECT.level] || null;

  /* ---- 渲染：报告页「系统建议」卡片 ---- */
  const box = $("#adviceBox");
  if (box) {
    const groups = [
      { t: "体态与坐姿", items: [POSTURE, GRIP] },
      { t: "日常行为习惯", items: [HABIT_LOAD, HABIT_REST] },
      { t: "复查与就医安排", items: [REVIEW] }
    ].filter(g => g.items.length && g.items[0]);
    box.innerHTML = groups.map(g => `
      <div class="adv-group">
        <div class="adv-group-title">${g.t}</div>
        <ul class="advice">${g.items.map(t => `<li>${ADV_ICON.tip}<span>${t}</span></li>`).join("")}</ul>
      </div>`).join("")
      + (ALERT ? `<div class="alert adv-alert ${ALERT.cls}">${ADV_ICON.alert}<span>${ALERT.text}</span></div>` : "")
      + `<div class="card-note">以上建议由本次六区压力响应、SASI(P) 曲线与个体基线对比结果自动生成，仅作姿态与行为干预参考。</div>`;
  }

  /* ---- 渲染：检测结果页一句话摘要 ---- */
  const dashTxt = `主导区域为${sideTxt}侧${hName}（不对称 ${domSasi}%）。${REVIEW}${exceed ? `日常应重点纠正${sideTxt}侧单侧受力与久坐习惯。` : ""}`;
  const dash = $("#dashAdvice");
  if (dash) dash.textContent = dashTxt;

  return { dom, sideTxt, hName, domSasi, exceed, review: REVIEW, alert: ALERT, dashTxt };
}

function initReport() {
  /* 分级卡「本次评价结果」标记：跟随 SUBJECT.level 移动，不写死在某一档 */
  const rcCards = $$(".risk-row .risk-card");
  if (rcCards.length === 3) {
    const idx = { ok: 0, warn: 1, risk: 2 }[SUBJECT.level] ?? 1;
    rcCards.forEach((c, i) => {
      c.classList.toggle("current", i === idx);
      const f = c.querySelector(".flag");
      if (f) f.remove();
    });
    const cur = rcCards[idx];
    if (cur) {
      const sp = document.createElement("span");
      sp.className = "flag";
      sp.textContent = "本次评价结果";
      cur.insertBefore(sp, cur.firstChild);
    }
  }
  /* 当前测量结果：六区雷达（当前值 vs 基线值） */
  const base = REGIONS.map(r => +(r.p * (1 - (r.bias / 100) * 1.2)).toFixed(2));
  makeChart("rpRadar", {
    tooltip: { ...TIP },
    legend: { ...LEGEND, bottom: 0, data: ["当前值", "基线值"] },
    radar: {
      radius: "60%", center: ["50%", "46%"],
      indicator: REGIONS.map(r => ({ name: r.id, max: 20 })),
      axisName: { color: C.slate, fontSize: 10.5 },
      splitLine: { lineStyle: { color: C.grid } },
      splitArea: { areaStyle: { color: ["#fbfefd", "#f3faf8"] } },
      axisLine: { lineStyle: { color: C.line } }
    },
    series: [{
      type: "radar", symbolSize: 4,
      data: [
        { value: REGIONS.map(r => r.p), name: "当前值", lineStyle: { color: C.warn, width: 2 }, itemStyle: { color: C.warn }, areaStyle: { color: "rgba(215,143,10,.16)" } },
        { value: base, name: "基线值", lineStyle: { color: C.brand, width: 2, type: "dashed" }, itemStyle: { color: C.brand }, areaStyle: { color: "rgba(15,159,153,.10)" } }
      ]
    }]
  });

  /* 个体基线偏离：左右不对称指数 当前值 vs 基线值 */
  const bars = $("#baseBars");
  if (bars) {
    const rows = HEIGHTS.map((h, i) => {
      const cur = SASI_P[h.key][3] * 100;
      const bs = SASI_P0[h.key][3] * 100;
      const mx = 8;
      return `<div class="bar-row">
        <div class="bl-top"><span>${h.name}</span><span><b>${cur.toFixed(1)}%</b> / 基线 ${bs.toFixed(1)}%</span></div>
        <div class="bar-track"><i class="bar-fill cur" style="width:${(cur / mx * 100).toFixed(1)}%"></i></div>
        <div class="bar-track" style="margin-top:4px"><i class="bar-fill base" style="width:${(bs / mx * 100).toFixed(1)}%"></i></div>
      </div>`;
    }).join("");
    bars.innerHTML = rows;
  }

  /* 历次变化趋势：左右不对称指数 */
  makeChart("rpAsymTrend", {
    tooltip: { trigger: "axis", ...TIP, valueFormatter: v => (v == null ? "-" : (+v).toFixed(1) + "%") },
    grid: { left: 36, right: 12, top: 22, bottom: 26 },
    xAxis: { type: "category", data: SUBJECT.sessions.map(s => s.date.slice(5)), ...AXIS },
    yAxis: { type: "value", min: 0, max: Math.max(8, Math.ceil(Math.max(...SUBJECT.sessions.map(s => s.asym)) * 1.05 / 2) * 2), ...AXIS },
    series: [{
      name: "左右不对称指数", type: "line", smooth: true, symbolSize: 6,
      data: SUBJECT.sessions.map(s => s.asym),
      lineStyle: { color: C.warn, width: 2.4 }, itemStyle: { color: C.warn },
      areaStyle: { color: "rgba(215,143,10,.12)" },
      markLine: { silent: true, symbol: "none", lineStyle: { color: C.risk, type: "dashed", width: 1.3 }, label: { color: C.risk, fontSize: 9.5, formatter: "MDC" }, data: [{ yAxis: SUBJECT.MDC }] }
    }]
  });

  /* 历次变化趋势：区域形变幅度（上背/中背/下背） */
  makeChart("rpDeformTrend", {
    tooltip: { trigger: "axis", ...TIP, valueFormatter: v => (v == null ? "-" : (+v).toFixed(2) + " mm") },
    legend: { ...LEGEND, top: 0, data: ["上背", "中背", "下背"] },
    grid: { left: 36, right: 12, top: 30, bottom: 26 },
    xAxis: { type: "category", data: SUBJECT.sessions.map(s => s.date.slice(5)), ...AXIS },
    yAxis: { type: "value", min: 0, max: 5, ...AXIS },
    series: [
      { name: "上背", type: "line", smooth: true, symbolSize: 5, data: DEFORM_TREND.upper, lineStyle: { color: C.brand, width: 2 }, itemStyle: { color: C.brand } },
      { name: "中背", type: "line", smooth: true, symbolSize: 5, data: DEFORM_TREND.middle, lineStyle: { color: C.warn, width: 2.6 }, itemStyle: { color: C.warn } },
      { name: "下背", type: "line", smooth: true, symbolSize: 5, data: DEFORM_TREND.lower, lineStyle: { color: C.brandLight, width: 2 }, itemStyle: { color: C.brandLight } }
    ]
  });

  /* 数据质量 */
  const q = $("#qualityBox");
  if (q) {
    q.innerHTML = `
      <div class="qual-row">
        <div class="qual-node done"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>穿戴位置</div>
        <span class="qual-arrow">→</span>
        <div class="qual-node done"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>扫描位置</div>
      </div>
      <div class="qual-row">
        <div class="qual-node done"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>扫描程序</div>
        <span class="qual-arrow">→</span>
        <div class="qual-node done"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M3 20h18M6 16l4-6 4 3 5-8"/></svg>特征评估</div>
      </div>
      <div class="qual-final">数据完整性 ${SUBJECT.quality}%</div>`;
  }

  /* 数据完整率文案与数据源同步（report.html 中另有 2 处显示） */
  $$("#qualNotePct, #qualInfoPct").forEach(el => { el.textContent = SUBJECT.quality.toFixed(1); });

  /* ---- 检测信息（数据驱动，避免换病例后露馅） ---- */
  const s3 = SUBJECT.sessions[3], s0 = SUBJECT.sessions[0], sN = SUBJECT.sessions.length;
  const setTxt = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  setTxt("#rpCaseId", SUBJECT.id);
  setTxt("#rpOrder", `第 ${sN} 次（当前检测 ${s3.name}）`);
  setTxt("#rpBaseDate", `${s0.name}（${s0.date} 建立）`);
  setTxt("#refGridNote", `当前检测 ${s3.name} · ${s3.date} · 对比基线 ${s0.name}（${s0.date}）`);
  const bbn = $("#baseBarsNote");
  if (bbn) {
    const domH2 = HEIGHTS.reduce((a, h) => (Math.abs(SASI_P[h.key][3]) > Math.abs(SASI_P[a.key][3]) ? h : a), HEIGHTS[0]);
    const curV = SASI_P[domH2.key][3] * 100, baseV = SASI_P0[domH2.key][3] * 100;
    bbn.textContent = `左右不对称指数（%）。${domH2.name}由基线 ${baseV.toFixed(1)}% 变为 ${curV.toFixed(1)}%` +
      `${Math.abs(curV) > SUBJECT.MDC ? `，超出 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}%` : `，仍在 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}% 以内`}。`;
  }

  /* ---- 当前状态大卡 ---- */
  const DOT = { ok: "🟢", warn: "🟡", risk: "🔴" };
  const hero = $("#statusHero");
  if (hero) hero.className = `status-hero reveal ${STATUS_CLS[SUBJECT.level]}`;
  const dltR = +(s3.asym - s0.asym).toFixed(1);
  /* 侧弯方向：主导区域侧别推导 */
  const domR3 = REGIONS.reduce((a, b) => (b.bias > a.bias ? b : a), REGIONS[0]);
  const domH3 = HEIGHTS.find(h => h.key === domR3.h) || HEIGHTS[1];
  const bend3 = domR3.id[0] === "R" ? "右侧" : "左侧";
  setTxt("#shBend", `${bend3}凸`);
  setTxt("#shValue", `${DOT[SUBJECT.level] || ""} ${STATUS_TXT[SUBJECT.level]}`);
  setTxt("#shDesc",
    `主导区域为${bend3}${domH3.name}（${domH3.L} / ${domH3.R}），左右不对称指数 ${s3.asym.toFixed(1)}%，` +
    `较个人基线 ${dltR >= 0 ? "+" : ""}${dltR.toFixed(1)}%` +
    (Math.abs(dltR) > SUBJECT.MDC ? `，已超出 MDC 阈值 ${SUBJECT.MDC.toFixed(1)}%` : "") + "。" +
    (SUBJECT.level === "risk"
      ? `提示脊柱向${bend3}弯（${bend3}凸）风险，建议尽快前往专业机构接受临床评估。`
      : `提示脊柱向${bend3}弯（${bend3}凸）的持续性偏移，建议复测并加强观察。`) +
    "该结果属于健康风险辅助筛查提示，不构成医学诊断。");
  setTxt("#shAsym", `${s3.asym.toFixed(1)} %`);
  setTxt("#shDelta", `${dltR >= 0 ? "+" : ""}${dltR.toFixed(1)} %`);
  setTxt("#shQual", `${SUBJECT.quality.toFixed(1)} %`);

  /* ---- AI 辅助分析流程：顺序点亮动画 ---- */
  const aiSteps = $$("#aiFlow .ai-step");
  if (aiSteps.length) {
    let ai = 0;
    const runAi = () => {
      aiSteps.forEach((s, k) => s.classList.toggle("on", k <= ai));
      ai = ai >= aiSteps.length - 1 ? 0 : ai + 1;
    };
    runAi();
    setInterval(runAi, 950);
  }

  /* 系统建议：按本次检测数据自适应生成 */
  buildAdvice();
}

/* ============================================================
   路由
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initClock();
  initReveal();
  initUser();
  const page = document.body.dataset.page;
  if (page === "home") initHome();
  if (page === "result") initResult();
  if (page === "analysis") initAnalysis();
  if (page === "baseline") initBaseline();
  if (page === "report") initReport();
  /* 布局稳定后让所有图表按最终容器尺寸重算，避免首帧尺寸偏差 */
  window.addEventListener("load", () => window.dispatchEvent(new Event("resize")));
});
