# 脊衡未来 · 脊柱侧弯动态筛查系统

儿童/青少年脊柱侧弯动态筛查展示站：6 个页面 + 首页 WebGL 三维背心（六区柔性传感器）。

- 线上演示：https://spine-asym-screening.app.workbuddy.host/
- 技术栈：**纯静态，无构建、无 npm、无后端**。双击 `index.html` 即可打开。

## 30 秒跑起来

- 直接双击 `index.html`（file:// 即可，无需服务器）
- 或起个本地服务：`python -m http.server 8000`，然后访问 http://localhost:8000

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.html` | 首页（含三维背心 canvas #vestCanvas） |
| `script.js` | 全站脚本：首页 WebGL 背心渲染 + 各页图表/交互 |
| `style.css` | 全站样式 |
| `echarts.min.js` | 图表库（**本地依赖，勿删勿改 CDN**） |
| `report.html` | 筛查报告页（雷达图/条形/折线） |
| `dashboard.html` | 数据看板 |
| `analysis.html` | 数据分析 |
| `baseline.html` | 基线对比 |
| `about.html` | 关于/团队 |
| `.nojekyll` | 告诉 GitHub Pages 不要走 Jekyll 处理 |

## 三维背心（首页）怎么改

全在 `script.js` 的 `initVest()` 里，**WebGL 参数化曲面**，关键常量：

- `H / TH`：衣长、壳壁厚（1 单位 ≈ 1.5mm）
- `NU / NB / T_NECK / T_BNECK`：前/后领口半角与深度（领口大小只调这四个）
- `AC_U / AC_T / AC_R`：袖窿（侧面**封闭椭圆孔**，孔顶低于肩线，保证肩带跨肩连续）
- `SENSOR_SIDE`：传感器贴哪一面，`"rear"` = 背侧贴脊柱，`"front"` = 胸前
- 挖孔用片元 `cutField()` + `discard` 实现像素级精确开口；**JS 侧与 GLSL 侧两份 cutField 必须同步改**

## 发布到 GitHub Pages

1. 把本目录**全部文件**传到仓库**根目录**（`index.html` 必须在根，不能放子目录）
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`
3. 等 1~2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

注意：`echarts.min.js` 有 1MB，**漏传会导致所有图表空白**。

## 约定

- 不改图表库来源（保持本地 `echarts.min.js`）
- 页面间的导航链接与文件名保持现状
- 资源版本号形如 `?v=20261019h`，改完 css/js 记得同步提升，避免浏览器缓存
