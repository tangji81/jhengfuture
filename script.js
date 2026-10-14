/* ============================================================
   脊衡未来 — 全局脚本
   说明：所有数据均为演示用模拟数据，由前端定时器驱动，
   用于展示“动态筛查 / 动态趋势管理”的系统形态。
   ============================================================ */

"use strict";

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hasEcharts = () => typeof window.echarts !== "undefined";

/* ---------- 导航 ---------- */
function initNav() {
  const page = document.body.dataset.page;
  $$(".nav-links a").forEach(a => {
    if (a.dataset.page === page) a.classList.add("active");
  });
  const toggle = $(".nav-toggle");
  const links = $(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("open");
      links.classList.toggle("open");
    });
  }
}

/* ---------- 实时时钟 ---------- */
function initClock() {
  const els = $$("[data-clock]");
  if (!els.length) return;
  const fmt = n => String(n).padStart(2, "0");
  const tick = () => {
    const d = new Date();
    const s = `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())} ${fmt(d.getHours())}:${fmt(d.getMinutes())}:${fmt(d.getSeconds())}`;
    els.forEach(el => (el.textContent = s));
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- 滚动出现动画 ---------- */
function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  $$(".reveal").forEach(el => io.observe(el));
}

/* ---------- 数字滚动 ---------- */
function countUp(el, target, { dur = 1200, dec = 0, suffix = "" } = {}) {
  const t0 = performance.now();
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- ECharts 通用配置 ---------- */
const AXIS_STYLE = {
  axisLine: { lineStyle: { color: "rgba(90,150,255,.25)" } },
  axisLabel: { color: "#8ba3c7", fontSize: 11, fontFamily: "Consolas, monospace" },
  splitLine: { lineStyle: { color: "rgba(90,150,255,.08)" } },
};
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(10,20,44,.92)",
  borderColor: "rgba(90,150,255,.35)",
  textStyle: { color: "#e9effc", fontSize: 12 },
};

function makeChart(id, option) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!hasEcharts()) {
    el.innerHTML = '<div class="chart-fallback">图表组件加载失败：请联网后刷新页面（ECharts CDN）</div>';
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
  // 统计数字滚动
  $$(".stat .num").forEach(el => {
    const target = parseFloat(el.dataset.target);
    const dec = parseInt(el.dataset.dec || "0", 10);
    const suffix = el.dataset.suffix || "";
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting) {
        countUp(el, target, { dec, dur: 1600 });
        el.insertAdjacentHTML("beforeend", `<i>${suffix}</i>`);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
  });

  // Hero 背景波形图（装饰性动态曲线）
  const heroChart = makeChart("heroWave", {
    grid: { left: 0, right: 0, top: 10, bottom: 0 },
    xAxis: { type: "category", show: false, boundaryGap: false, data: [] },
    yAxis: { type: "value", show: false, min: -1.4, max: 1.4 },
    series: [0, 1, 2].map(k => ({
      type: "line", showSymbol: false, smooth: true,
      lineStyle: { width: 1.6, color: ["#2f7bff", "#22d3ee", "#5b8def"][k], opacity: 0.55 },
      areaStyle: { opacity: 0.05, color: ["#2f7bff", "#22d3ee", "#5b8def"][k] },
      data: [],
      animation: false,
    })),
  });
  if (heroChart) {
    let t = 0;
    const N = 120;
    setInterval(() => {
      t += 0.12;
      const xs = [], waves = [[], [], []];
      for (let i = 0; i < N; i++) {
        xs.push(i);
        waves[0].push(Math.sin(i * 0.10 + t) * 0.8 + Math.sin(i * 0.021 + t * 0.6) * 0.3);
        waves[1].push(Math.sin(i * 0.13 + t * 1.3 + 2) * 0.55);
        waves[2].push(Math.sin(i * 0.07 + t * 0.8 + 4) * 0.95);
      }
      heroChart.setOption({
        xAxis: { data: xs },
        series: [{ data: waves[0] }, { data: waves[1] }, { data: waves[2] }],
      });
    }, 90);
  }
}

/* ============================================================
   Dashboard 智能健康管理平台
   ============================================================ */
function regionStatus(pressureDev, stability) {
  if (Math.abs(pressureDev) > 12 || stability < 84) return "risk";
  if (Math.abs(pressureDev) > 7 || stability < 90) return "warn";
  return "ok";
}
const STATUS_TXT = { ok: "正常", warn: "需关注", risk: "异常波动" };

function initDashboard() {
  // 六区域模型：R2 设定为轻度不对称（与报告“需关注”结论一致）
  const regions = [
    { id: "L1", side: "左侧上背", pBase: 14.6, dBase: 3.1, sBase: 94, bias: 0 },
    { id: "R1", side: "右侧上背", pBase: 14.9, dBase: 3.2, sBase: 93, bias: 1.5 },
    { id: "L2", side: "左侧中背", pBase: 15.2, dBase: 3.4, sBase: 92, bias: 0 },
    { id: "R2", side: "右侧中背", pBase: 16.4, dBase: 3.9, sBase: 87, bias: 8.5 },
    { id: "L3", side: "左侧腰背", pBase: 14.8, dBase: 3.2, sBase: 93, bias: 0 },
    { id: "R3", side: "右侧腰背", pBase: 15.1, dBase: 3.3, sBase: 91, bias: 2.5 },
  ];
  const grid = $("#regionGrid");
  grid.innerHTML = regions.map(r => `
    <div class="panel region-card" id="rc-${r.id}">
      <div class="region-head">
        <span class="name">${r.id}</span>
        <span style="font-size:12px;color:var(--muted)">${r.side}</span>
        <span class="status-pill ok" data-role="pill">正常</span>
      </div>
      <div class="region-metrics">
        <div class="rm"><div class="mv" data-role="p">--</div><div class="mk">压力响应 kPa</div></div>
        <div class="rm"><div class="mv" data-role="d">--</div><div class="mk">形变响应 mm</div></div>
        <div class="rm"><div class="mv" data-role="s">--</div><div class="mk">稳定性 %</div></div>
      </div>
    </div>`).join("");

  function refreshRegions() {
    regions.forEach(r => {
      const p = r.pBase * (1 + r.bias / 100) + rnd(-0.35, 0.35);
      const d = r.dBase * (1 + r.bias / 130) + rnd(-0.12, 0.12);
      const s = clamp(r.sBase - r.bias * 0.35 + rnd(-1.6, 1.6), 78, 99);
      const dev = r.bias + rnd(-2, 2);
      const st = regionStatus(dev, s);
      const card = $(`#rc-${r.id}`);
      card.classList.remove("ok", "warn", "risk");
      if (st !== "ok") card.classList.add(st);
      const pill = $('[data-role="pill"]', card);
      pill.className = `status-pill ${st}`;
      pill.textContent = STATUS_TXT[st];
      const pEl = $('[data-role="p"]', card), dEl = $('[data-role="d"]', card), sEl = $('[data-role="s"]', card);
      pEl.textContent = p.toFixed(2);
      dEl.textContent = d.toFixed(2);
      sEl.textContent = s.toFixed(1);
      [pEl, dEl, sEl].forEach(el => el.classList.toggle("hl", st !== "ok"));
    });
    // 汇总徽标
    const warnCount = regions.filter(r => r.bias > 6).length;
    const sumEl = $("#regionSummary");
    if (sumEl) sumEl.textContent = warnCount > 0 ? `${warnCount} 个区域需关注` : "全部区域正常";
  }
  refreshRegions();
  setInterval(refreshRegions, 2600);

  // 历史检测趋势图（体现长期动态管理）
  const sessions = ["第 1 次", "第 2 次", "第 3 次", "第 4 次", "当前检测"];
  const asym = [3.2, 4.1, 5.0, 5.8, 6.7];        // 左右不对称指数 %
  const stab = [93.5, 92.8, 91.9, 91.2, 90.4];   // 平均稳定性 %
  const trendChart = makeChart("trendChart", {
    tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
    legend: { textStyle: { color: "#8ba3c7", fontSize: 12 }, top: 0 },
    grid: { left: 46, right: 48, top: 42, bottom: 30 },
    xAxis: { type: "category", data: sessions, ...AXIS_STYLE },
    yAxis: [
      { type: "value", name: "不对称指数 %", nameTextStyle: { color: "#8ba3c7" }, ...AXIS_STYLE },
      { type: "value", name: "稳定性 %", min: 85, max: 96, nameTextStyle: { color: "#8ba3c7" }, ...AXIS_STYLE, splitLine: { show: false } },
    ],
    series: [
      {
        name: "左右不对称指数", type: "line", smooth: true, data: asym,
        lineStyle: { width: 2.5, color: "#fbbf24" }, itemStyle: { color: "#fbbf24" },
        areaStyle: { color: "rgba(251,191,36,.08)" }, symbolSize: 7,
      },
      {
        name: "平均稳定性", type: "line", smooth: true, yAxisIndex: 1, data: stab,
        lineStyle: { width: 2.5, color: "#22d3ee" }, itemStyle: { color: "#22d3ee" },
        areaStyle: { color: "rgba(34,211,238,.08)" }, symbolSize: 7,
      },
    ],
  });

  // “当前检测”点微幅实时更新，体现动态趋势
  if (trendChart) {
    setInterval(() => {
      asym[4] = clamp(asym[4] + rnd(-0.15, 0.18), 5.5, 8);
      stab[4] = clamp(stab[4] + rnd(-0.2, 0.15), 88, 92);
      trendChart.setOption({ series: [{ data: asym.map(v => +v.toFixed(2)) }, { data: stab.map(v => +v.toFixed(2)) }] });
      const el = $("#asymNow");
      if (el) el.textContent = asym[4].toFixed(1) + " %";
    }, 3000);
  }
}

/* ============================================================
   Analysis 标准化载荷响应分析
   ============================================================ */
function initAnalysis() {
  const STAGES = [5, 10, 15, 20];       // kPa 分级载荷
  const STAGE_MS = 5000;                 // 每级保持时间
  const RELEASE_MS = 3500;               // 卸载恢复时间
  const TICK = 120;

  let stageIdx = 0, stageT = 0, phase = "load"; // load | release
  let pressure = 0, deform = 0, t = 0;

  const loadNow = $("#loadNow"), loadLabel = $("#loadLabel"), loadBar = $("#loadBar i");
  const stepEls = $$(".load-step");

  // 曲线数据缓存
  const MAXN = 160;
  const ts = [], pData = [], dData = [];
  const diffData = { 1: [], 2: [], 3: [] };

  // 左右区域不对称系数（R2 偏大）
  const asymFactor = { 1: 0.03, 2: 0.11, 3: 0.05 };

  const pChart = makeChart("pressureChart", {
    tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
    grid: { left: 46, right: 18, top: 30, bottom: 28 },
    xAxis: { type: "value", name: "t / s", min: 0, max: 40, ...AXIS_STYLE },
    yAxis: { type: "value", name: "kPa", min: 0, max: 24, ...AXIS_STYLE },
    series: [
      { name: "载荷输入", type: "line", showSymbol: false, step: "end",
        lineStyle: { color: "#5b8def", width: 2, type: "dashed" }, itemStyle: { color: "#5b8def" }, data: [], animation: false },
      { name: "压力响应", type: "line", showSymbol: false, smooth: 0.3,
        lineStyle: { color: "#22d3ee", width: 2.5 }, itemStyle: { color: "#22d3ee" },
        areaStyle: { color: "rgba(34,211,238,.10)" }, data: [], animation: false },
    ],
    legend: { textStyle: { color: "#8ba3c7", fontSize: 12 }, top: 0 },
  });

  const dChart = makeChart("deformChart", {
    tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
    grid: { left: 46, right: 18, top: 30, bottom: 28 },
    xAxis: { type: "value", name: "t / s", min: 0, max: 40, ...AXIS_STYLE },
    yAxis: { type: "value", name: "mm", min: 0, max: 6, ...AXIS_STYLE },
    series: [{
      name: "形变响应", type: "line", showSymbol: false, smooth: 0.3,
      lineStyle: { color: "#a78bfa", width: 2.5 }, itemStyle: { color: "#a78bfa" },
      areaStyle: { color: "rgba(167,139,250,.12)" }, data: [], animation: false,
    }],
    legend: { textStyle: { color: "#8ba3c7", fontSize: 12 }, top: 0 },
  });

  const diffChart = makeChart("diffChart", {
    tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
    grid: { left: 52, right: 18, top: 30, bottom: 28 },
    xAxis: { type: "value", name: "t / s", min: 0, max: 40, ...AXIS_STYLE },
    yAxis: { type: "value", name: "响应差 kPa", min: 0, ...AXIS_STYLE },
    series: [1, 2, 3].map(k => ({
      name: `L${k} / R${k} 差异`, type: "line", showSymbol: false, smooth: 0.3,
      lineStyle: { width: k === 2 ? 3 : 2, color: ["#34d399", "#fbbf24", "#5b8def"][k - 1] },
      itemStyle: { color: ["#34d399", "#fbbf24", "#5b8def"][k - 1] },
      data: [], animation: false,
    })),
    legend: { textStyle: { color: "#8ba3c7", fontSize: 12 }, top: 0 },
  });

  // 指标计算面板
  const tiles = { asym: $("#mAsym"), rec: $("#mRec"), slope: $("#mSlope") };
  function computeMetrics() {
    Object.values(tiles).forEach(t => t && t.closest(".metric-tile").classList.add("computing"));
    setTimeout(() => {
      const target = phase === "load" ? STAGES[stageIdx] : STAGES[STAGES.length - 1];
      const asym = (asymFactor[2] * 100 * (target / 20) * rnd(0.9, 1.1)).toFixed(1);
      const rec = (2.8 + asymFactor[2] * 12 + rnd(-0.2, 0.3)).toFixed(1);
      const slope = (target / (1.6 + rnd(0, 0.5))).toFixed(2);
      if (tiles.asym) { tiles.asym.innerHTML = `${asym}<i> %</i>`; tiles.asym.closest(".metric-tile").classList.remove("computing"); }
      if (tiles.rec)  { tiles.rec.innerHTML = `${rec}<i> s</i>`;  tiles.rec.closest(".metric-tile").classList.remove("computing"); }
      if (tiles.slope){ tiles.slope.innerHTML = `${slope}<i> kPa/s</i>`; tiles.slope.closest(".metric-tile").classList.remove("computing"); }
      const note = $("#asymNote");
      if (note) note.textContent = `AI = |L−R| / (L+R) × 100%，基于 L2/R2 区域在 ${target} kPa 载荷下的稳态响应计算`;
    }, 1100);
  }
  computeMetrics();

  // 主循环：模拟分级加载 → 卸载恢复 → 循环
  setInterval(() => {
    t += TICK / 1000;
    stageT += TICK;

    let target;
    if (phase === "load") {
      target = STAGES[stageIdx];
      if (stageT >= STAGE_MS) {
        if (stageIdx < STAGES.length - 1) { stageIdx++; stageT = 0; computeMetrics(); }
        else { phase = "release"; stageT = 0; }
      }
    } else {
      target = 0;
      if (stageT >= RELEASE_MS) { phase = "load"; stageIdx = 0; stageT = 0; computeMetrics(); }
    }

    // 一阶惯性响应模型：P(t) 以时间常数 τ 趋近目标载荷
    const tauP = 0.9, tauD = 1.15;
    pressure += (target - pressure) * (TICK / 1000 / tauP) + rnd(-0.06, 0.06);
    deform   += (target * 0.22 - deform) * (TICK / 1000 / tauD) + rnd(-0.015, 0.015);
    pressure = Math.max(0, pressure); deform = Math.max(0, deform);

    // 更新载荷面板
    if (loadNow) loadNow.innerHTML = `${target}<small> kPa</small>`;
    if (loadLabel) loadLabel.textContent = phase === "load"
      ? `分级加载中 · 第 ${stageIdx + 1} / ${STAGES.length} 级 · 目标 ${STAGES[stageIdx]} kPa`
      : "卸载恢复阶段 · 记录组织恢复时间";
    if (loadBar) loadBar.style.width = `${(target / STAGES[STAGES.length - 1]) * 100}%`;
    stepEls.forEach((el, i) => {
      el.classList.toggle("active", phase === "load" && i === stageIdx);
      el.classList.toggle("done", phase === "release" || i < stageIdx);
    });

    // 曲线数据
    ts.push(+t.toFixed(1));
    pData.push([+t.toFixed(1), +pressure.toFixed(2)]);
    dData.push([+t.toFixed(1), +deform.toFixed(2)]);
    [1, 2, 3].forEach(k => diffData[k].push([+t.toFixed(1), +(pressure * asymFactor[k] + rnd(0, 0.04)).toFixed(3)]));
    if (ts.length > MAXN) {
      ts.shift(); pData.shift(); dData.shift();
      [1, 2, 3].forEach(k => diffData[k].shift());
    }
    const xMin = Math.max(0, t - 40);

    if (pChart) pChart.setOption({
      xAxis: { min: xMin, max: xMin + 40 },
      series: [
        { data: pData.map(([x]) => [x, phase === "load" ? STAGES[stageIdx] : 0]) },
        { data: pData },
      ],
    });
    if (dChart) dChart.setOption({ xAxis: { min: xMin, max: xMin + 40 }, series: [{ data: dData }] });
    if (diffChart) diffChart.setOption({
      xAxis: { min: xMin, max: xMin + 40 },
      series: [{ data: diffData[1] }, { data: diffData[2] }, { data: diffData[3] }],
    });

    // 实时读数
    const pEl = $("#rtPressure"), dEl = $("#rtDeform");
    if (pEl) pEl.textContent = pressure.toFixed(2) + " kPa";
    if (dEl) dEl.textContent = deform.toFixed(2) + " mm";
  }, TICK);
}

/* ============================================================
   Baseline 个人健康基线管理
   ============================================================ */
function initBaseline() {
  const B0 = 100;                     // 首检基线指数（归一化）
  const MDC = 6.0;                    // 最小可检测变化阈值 %
  const points = [
    { name: "B0", label: "首次检测", date: "2026-03-12", value: 100.0 },
    { name: "B1", label: "第 2 次", date: "2026-05-20", value: 102.3 },
    { name: "B2", label: "第 3 次", date: "2026-08-06", value: 104.8 },
    { name: "B3", label: "当前检测", date: "2026-10-14", value: 107.2 },
  ];

  // 基线趋势图 + MDC 阈值带
  makeChart("baselineChart", {
    tooltip: {
      trigger: "axis", ...TOOLTIP_STYLE,
      formatter: ps => {
        const i = ps[0].dataIndex, p = points[i];
        const delta = (p.value - B0).toFixed(1);
        return `${p.name} · ${p.label}<br/>检测日期：${p.date}<br/>响应指数：${p.value.toFixed(1)}<br/>相对 B0 变化量：${delta > 0 ? "+" : ""}${delta}%`;
      },
    },
    grid: { left: 50, right: 24, top: 36, bottom: 30 },
    xAxis: { type: "category", data: points.map(p => `${p.name}\n${p.label}`), ...AXIS_STYLE },
    yAxis: { type: "value", name: "响应指数", min: 90, max: 112, nameTextStyle: { color: "#8ba3c7" }, ...AXIS_STYLE },
    series: [{
      name: "力学响应指数", type: "line", smooth: true, symbolSize: 9,
      data: points.map(p => p.value),
      lineStyle: { width: 3, color: "#2f7bff" },
      itemStyle: { color: "#22d3ee", borderColor: "#0b1530", borderWidth: 2 },
      areaStyle: { color: "rgba(47,123,255,.10)" },
      markArea: {
        silent: true,
        itemStyle: { color: "rgba(52,211,153,.07)" },
        label: { color: "#34d399", fontSize: 11, position: "insideTop" },
        data: [[{ name: "MDC 波动允许范围 (B0 ± 6.0%)", yAxis: B0 - MDC }, { yAxis: B0 + MDC }]],
      },
      markLine: {
        silent: true, symbol: "none",
        lineStyle: { color: "#fbbf24", type: "dashed", width: 1.5 },
        label: { color: "#fbbf24", fontSize: 11, formatter: "MDC 上限 106.0" },
        data: [{ yAxis: B0 + MDC }],
      },
    }],
  });

  // 基线表
  const tbody = $("#blTableBody");
  tbody.innerHTML = points.map((p, i) => {
    const delta = p.value - B0;
    const over = Math.abs(delta) > MDC;
    const judge = i === 0 ? '<span class="status-pill ok">基线建立</span>'
      : over ? '<span class="status-pill warn">超出 MDC</span>'
             : '<span class="status-pill ok">范围内</span>';
    return `<tr>
      <td>${p.name}</td><td>${p.date}</td>
      <td>${p.value.toFixed(1)}</td>
      <td class="${over ? "delta-up" : "delta-ok"}">${i === 0 ? "—" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%"}</td>
      <td>${judge}</td>
    </tr>`;
  }).join("");

  // 变化量指标滚动动画
  const dv = $("#deltaValue"), over = points[3].value - B0 > MDC;
  if (dv) {
    countUp(dv, points[3].value - B0, { dec: 1, dur: 1500 });
    setTimeout(() => {
      dv.insertAdjacentHTML("beforeend", "<i> %</i>");
      dv.style.color = over ? "var(--warn)" : "var(--ok)";
    }, 1500);
  }
}

/* ============================================================
   Report 健康趋势分析报告
   ============================================================ */
function initReport() {
  // 当前评级：需关注（与 dashboard / baseline 数据链一致）
  const LEVEL = 2;
  setTimeout(() => {
    const card = $(`.level-card.l${LEVEL}`);
    if (card) card.classList.add("on");
  }, 500);

  // 历史趋势迷你图
  makeChart("reportTrend", {
    tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
    grid: { left: 40, right: 14, top: 26, bottom: 26 },
    xAxis: { type: "category", data: ["3月", "5月", "8月", "10月"], ...AXIS_STYLE },
    yAxis: { type: "value", min: 96, max: 110, ...AXIS_STYLE },
    series: [{
      name: "响应指数", type: "line", smooth: true, symbolSize: 7,
      data: [100, 102.3, 104.8, 107.2],
      lineStyle: { width: 2.5, color: "#2f7bff" }, itemStyle: { color: "#22d3ee" },
      areaStyle: { color: "rgba(47,123,255,.10)" },
      markLine: {
        silent: true, symbol: "none",
        lineStyle: { color: "#fbbf24", type: "dashed" },
        label: { color: "#fbbf24", fontSize: 10, formatter: "MDC" },
        data: [{ yAxis: 106 }],
      },
    }],
  });

  // 报告生成进度动画
  const bar = $("#reportBar i"), pct = $("#reportPct"), state = $("#reportState");
  if (bar) {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + rnd(4, 11));
      bar.style.width = p + "%";
      pct.textContent = Math.floor(p) + "%";
      if (p >= 100) {
        clearInterval(timer);
        state.textContent = "报告生成完成";
        state.style.color = "var(--ok)";
        $("#reportBody").style.opacity = "1";
        $("#reportBody").style.transform = "none";
      }
    }, 160);
  }
}

/* ============================================================
   路由
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initClock();
  initReveal();
  const page = document.body.dataset.page;
  if (page === "home") initHome();
  if (page === "dashboard") initDashboard();
  if (page === "analysis") initAnalysis();
  if (page === "baseline") initBaseline();
  if (page === "report") initReport();
});
