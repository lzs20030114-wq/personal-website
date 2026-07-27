# Modernist 方案落地映射（2026-07-21 定案）

设计源 = claude.ai/design「个人网站UI设计规划」：`Home-Modernist.dc.html` / `Case-Modernist.dc.html` /
`Log-Modernist.dc.html`（本目录有逐字副本）+ Modernist 设计系统（`modernist-styles.css` 组件类参考）。
配色**不用**设计系统原生的红色 mono 方案，用已落地的绿×紫 After Monet（见 `app/globals.css` 与 SITE_SPEC §8
2026-07-21 修订）。本文件是两者的桥：实现页面时按此表翻译。

## 1. 颜色变量翻译表（设计稿 var → 本站 token）

| 设计稿 | 本站 | 说明 |
|---|---|---|
| `--color-bg` | `--paper` | 画布暖乳白 |
| `--color-surface` | `--surface` | 卡片底 |
| `--color-text` | `--ink` | |
| `--color-divider` | `var(--ink)` | ★палette 定案：分隔线=墨色 2px 实线（不用设计系统的 40% 混色） |
| `--color-accent`（文字/小元素/编号/hover） | `--accent`（=G700） | 浅底彩色文字一律 700 级 |
| `--color-accent`（主按钮填充） | `--g600` | hover `--g700`，active `--g800`（palette 实测 5.2:1 AA） |
| `--color-accent`（页脚整版铺底） | `--g900` 深林 | ★palette 铺底纪律：页脚/深色区块=G900，文字用 `--g100`/`--g200`；G500 只留给「页面最重要的一句话」海报时刻，本次不用 |
| `--color-neutral-400` | `--n400` | 虚线占位框边 |
| `--color-neutral-500/600/700` | `--n500`/`--n600`/`--n700` | 次级文字（--graphite=--n600 亦可） |
| `.tag-outline` | 边框+文字 `--accent` | |
| `.tag-neutral` | 底 `--n200`、文字 `--n800` | 设计系统用 n100 底，本站纸面更暖，n200 更清晰 |
| `::selection` | `--g200`（已落地） | |
| `:focus-visible` | `2px solid var(--accent)` offset 2px | 必须加，不留浏览器默认蓝圈 |

## 2. 字体

- 全站换 **Archivo**（设计系统 heading/body 同一字族；400/600/800 三档，标题 800 大写、letter-spacing -0.02em、行高 ~0.98）。
- **自托管**（评审机/国内网络不可控，沿用 Source Serif 自托管同一理由）：优先 `npm i @fontsource-variable/archivo`
  然后在 `app/layout.tsx` `import '@fontsource-variable/archivo'`，栈 `'Archivo Variable', Archivo, system-ui, sans-serif`；
  CJK 回退加 `'PingFang SC','Microsoft YaHei'`（站内还有少量中文占位记号）。
- 若 npm 装不上：退回系统栈 `Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif` 并在交付报告注明。
- mono 栈不变（题栏/数据仍 ui-monospace）。

## 3. IA / 路由映射（路由结构不动）

| 设计稿导航 | 本站 |
|---|---|
| [Name]（brand） | `/`（文案维持现有占位 `[NAME·占位]` 直至作者定名） |
| Work | `/#work`（主页 Selected work 区锚点） |
| Lab | `/#lab`（主页 The lab 区锚点） |
| Log | `/archive`（**路由名不改**，页面标题按设计 "Work log"） |
| About | `/about` |

- Lab 四卡链接：Lab.01 → `/demo/`、Lab.02 → `/demo/arch.html`、Lab.03 → `/demo/tentacle3d.html`、Lab.04 → `/demo/shell3d.html`（新窗口或本窗均可，保持朴素 `<a>`）。
- Selected work 行 01 整行可点 → `/work/reincarnation-machine`；02–04 灰置不可点（TBD）。
- 主页 Work log 预览三条 + "All entries →" → `/archive`。

## 4. 数据来源

- 主页 2×2 统计格：04 Projects / **176** Tests green（用当前实测数，设计稿 168 已过时）/ 02 Solver kernels / 05 Live demos。硬编码即可（发版时人工更新）。
- Work log 条目：设计稿 8 条为定稿文案，若现有 archive 内容池为空/占位则以设计稿 8 条建档（沿用现有内容池机制建，不许绕过 zod 校验管线；机制若不适配纯 log 条目可扩 schema）。
- Case 页：**保持 frontmatter/内容池驱动**（role/date/tools/figures/video/AI 披露插槽机制不动），只换渲染模板；设计稿的 My role 四行、Tools 串、六个编号 section（01 Research question / 02 Concepts 四卡 / 03 Form / 04 Structure / 05 Behavior / 06 Research）+ V.60 视频席位 + AI disclosure 席位为目标结构。设计稿虚线 Placeholder 框原样保留（那就是占位标记的视觉形态）。

## 5. 纪律（红线）

1. `src/lib/linkage/`、`components/linkage/LinkageFigure.tsx` 内部**一行不改**（封盘；颜色已通过 `--trace-blue→--accent` 别名自动换绿）。包裹容器/题栏可改。
2. 正文占位纪律：设计稿文案照搬（视为用户在设计工具里定的稿），**不新写、不扩写**任何正文；Placeholder 框保持占位。
3. 四路由不动；`/demo/*` 台架不动；MDX/zod 内容管线不绕过。
4. 响应式：设计稿是 1440 桌面稿。≥1280 按稿；<1024 单列回落（SITE_SPEC 硬要求移动端可用）；大标题用 clamp()（如 `clamp(40px, 7.5vw, 88px)`）。
5. SVG 坑：SVG presentation attribute 不解析 var()——SVG 内颜色一律走 class/inline style（LINKAGE_SPEC §5 条 1）。
6. 版式细节按设计稿逐像素：2px 墨色分隔线、零圆角、全部 flush-left（含宽按钮文字左对齐——设计系统 readme 明确 never centered）、图框斜纹占位底 `repeating-linear-gradient(45deg,...)`、题栏大写 12px 600。
7. 无障碍：正文级彩字一律 700 级（G700/P700/N700）；G500/G600 底上只放 ≥AA 达标组合（映射表已给）。
8. 紫（--accent-2/--p*）与莲粉（--rose）本轮**不主动使用**——palette 纪律「紫一页至多一处」，留给作者后续点睛。

---

## 6. 主页设计源更替：Home-Screens.dc.html（2026-07-23 迭代稿同步）

主页 `/` 的设计源由 `Home-Modernist.dc.html` **更替**为 `Home-Screens.dc.html`（本目录逐字副本；Case/Log 两稿不变，仍按上文映射）。`Home-Monet.dc.html`、`Home-Stage.dc.html` 为中间迭代稿，**不落地**。本节要点：

- **结构**：三幕整屏（S0 枢纽 = 标题 + 四项目卡片组 + 预览舞台 / S1 About / S2 Lab+Log+页脚），每幕 100svh、幕内零滚动（1280×800 验收线）。右缘 rail 00–02 跳幕。
- **阻力翻页引擎**：接管 wheel/touch 的分页物理（脚本内「手感标定项」常量块：COMMIT_DIST 360 / FLICK_V 140 / COMMIT_P 0.5 / PUSH_MS 620 / 锁定+惯性防抖等）——落地时**原样移植数值**，这些是用户手感拍板对象。S1↔S2 为横向推入转场（其余纵向 push）。
- **S0 舞台三态**：hover 卡片=偷看、离开卡片组 300ms 回归默认位、点击=驻留（figChip 解除）；hoverPeek 开关切换"偷看/即选驻留"两种手感。
- **Stage 默认位（用户拍板 2026-07-24：先空着）**：落地时按稿内 [待定] 占位实现——保持空展示位，不放 LinkageFigure、不自行填充任何内容；后续放什么由用户另行拍板。
- **落地约束**：wheel 接管仅桌面生效；`prefers-reduced-motion` 与 <1024px 回落常规文档流（稿内已实现，移植时保持）；动效 token（--dur-micro 180ms / --dur-struct 520ms / --ease-site）进 globals.css；Tweaks 布尔开关（pagingFeel/hoverPeek/entrance/staggerFx/stageFx/cursorReadout/railFlip/spin）落地为组件 props 或构建期常量。
- **克制条款（用户拍板 2026-07-24：冻结不回填）**：SITE_SPEC §1 原文**保持不动、不做修订**；主页按本稿执行，主页与该条款的差异以本节为准（视为主页专属例外，其余页面仍守原条款）。统计数字 168 已过时（同 §4，落地用当前实测数）。占位文案照搬纪律同 §5 条 2。
- **落地记录（2026-07-24）**：`app/page.tsx`（服务端取内容池）+ `components/site/HomeScreens.tsx`（全部交互，引擎常量原样）；SiteNav/SiteFooter 移入 `app/(site)/layout.tsx` 路由组（/work /archive /about 不变，主页无顶部导航、页脚在 S2 幕内）；`/#lab` 深链在引擎态直落 S2；卡片/舞台数据自内容池（title/date/status），Role/Tools/thesis 文案照稿硬编；统计条 = vitest 实测 103（2026-07-24）。
- **落地后修订（2026-07-24 用户真机拍板）**：删除翻幕到位后的幕内 stagger + 边框闪（设计稿 `enter()`/staggerFx/data-flash）——该编排只保留在 S0 首次载入；S1/S2 进幕即静置，后续转场用户另行安排。此项为对冻结稿的有意偏离，以本条为准。

### 6.1 迭代稿同步（2026-07-26，用户上传 standalone 导出）

设计源更新为同名迭代稿（本目录副本 = standalone 导出**反重构**：DS 资源引用/内链 href/image-slot from 还原、打包器 `__standalone` 标记移除——**非逐字**，以稿内代码为准）。结构与引擎不变，变化与落地决定：

- **视觉语言**：2px 墨色分隔线全面换 `--hair` 发丝线（墨 22% 透明）；S0/S2 加 72px 制图网格衬底；S1 与页脚改深色渐变段（teal→indigo 稿内字面值）+ 点阵/颗粒叠加；全幕加颗粒纹理层；卡片从边框盒改发丝线列表项（26px 编号 + 顶部色刻度 绿/灰/灰/紫）；rail 活动条加宽 22px；新增顶缘 3px 进度条；kicker 加脉冲圆点、标题下加行进虚线（reduced-motion 全停）；`.tag` 盒退役改纯文字小签；Lab 四卡 3px 色顶边按内核家族双色编码（SVG=绿 / WebGL=紫，题栏加图例）。
- **紫色启用**：迭代稿在 S2 编码、c4 刻度、统计条等多处使用紫——§5 条 8「不主动使用」对主页由设计源解除（仍非模型主动配色）。
- **页面转场 goPT**（新机制）：点击卡片/舞台内链 → 深色遮罩淡入 + 视口缩放模糊 + 媒体块（data-ptm）克隆生长满屏 → 跳转。**卡片点击语义从「驻留」改为「转场跳页」**（hover 偷看/回归保留；驻留只剩 hoverPeek=false 分支，figChip 保留）。SPA 适配：MPA 稿的 `location.href` + sessionStorage om-veil 交接改为 `router.push` + 转场节点挂 body + 定时淡出，目标路由挂载时预取。
- **翻幕编排**：迭代稿把边框闪重设计为**斜向扫光**并保留 stagger——已按稿移植，但 2026-07-24 拍板「翻幕后静置」维持有效，`FX.staggerFx` 常量默认关；用户要启用新扫光只翻此常量（HomeScreens.tsx）。
- **人像位**：稿内 image-slot + duotone 机件；本站以 g200 底 + 点阵占位块落地（主页无图片机制），作者供图后按 §1 duotone-g 接入。
- 统计条仍用当前实测数（§4 纪律）；Stage 默认位仍空占位（07-24 拍板不变）；引擎手感常量数值原样。

### 6.2 case / log 深色化 + 转场进入段落地（2026-07-27）

迭代稿 standalone 内含三页——除 pgHome 外还有 **pgCase / pgLog 深色改版**与转场进入段（caseInit/logInit 的 clip 揭开）。§6.1 只落地了主页；本次补齐 case（`/work/[slug]`）与 log（`/archive`）的深色版并接通转场。源出处：从用户上传 standalone 解包的 pgCase/pgLog（DesignSync 授权在云端失效，无 .dc.html 源，实现依据已在代码中固化）。

- **深色 token 策略**：不逐字复制静态 pgCase，改在 `.pg-dark` 容器内**重定义语义 token**（`--paper`→深蓝 `oklch(0.25 0.05 225)`、`--ink`→浅绿白、`--accent`→深底亮绿 `oklch(0.71 0.098 145)`、`--accent-2`→亮紫、`--hair`/`--hairline`→浅绿 25%、`--n300..800` 深底中性）——现有组件类（`.case-body` / `.tag` / `.card` / MetaRail / slots）零改动自动深色。全站唯一深色 scope，其余页面不受影响。
- **深底铺满**：`.ground-plane`（fixed inset:0 z-index:-1，深渐变 + 颗粒）盖住 body 浅纸底，滚动不露边。
- **深色 nav 变体**：SiteNav 在 `/work` / `/archive` 路由加 `.nav-dark`（透明底 + 浅绿文字 + 发丝线 + hover 亮绿），沿用 usePathname 判定。footer（g900）在深底上更深，自洽。
- **case hero 着陆块**：case 内容列首插 `.case-hero`（3:2 深绿渐变媒体块 + 点阵/颗粒，Fig.01 占位「待拍摄」不代写）——既是版式 hero，也是转场落点（`data-pt-target`）。
- **转场进入段 `PageEnter`（新 client 组件）**：补齐 goPT 只有的出发段。主页 goPT push 前对深色目标（`/work/` `/archive`）写一次性 `sessionStorage('om-pt'=Date.now(), 'om-pt-bg'=媒体块底色)`；目标页 `PageEnter` 挂载读标记 → 造不透明着陆平面（`.pt-veil`，续接同族底色）盖场 → 清 goPT 残留 → 内容（`data-pt-content`）blur 揭入 → 平面 `clipPath` 从满屏收回到 hero 后移除。**强兜底（跨路由动画唯一硬风险 = 遮罩残留白屏）**：无标记/reduced-motion 立即清残留不揭开、标记超 3s 过期忽略、2s 超时强制移除、组件卸载即清。goPT 兜底淡出延迟 220→700ms 给 PageEnter 接管窗口。真浏览器 CDP 实测：生长→push→揭开→残留归零（tmp:0，不白屏）；直接访问无残留；reduced-motion 直跳。
- **返回转场**：设计稿 goBack（case→home 平面淡入返回）本次**未做**——返回走普通 SPA 切换。可作后续。
- **about 未动**：设计稿这次未给 /about 独立深色稿（主页 S1 About 幕的深色语言可作后续套用依据）；/about 现仍浅色 Modernist。**三内页现状：case/log 深色、about 浅色**——是否统一深色待用户拍板。
- 纪律守恒：case 仍 frontmatter/内容池 + MDXRemote 驱动，只换渲染模板与配色；四路由不动；LinkageFigure 内部零改；正文/图占位不代写。

---

## 7. Lab-Modernist：站内求解器台架（2026-07-27）

设计源 = `Lab-Modernist.dc.html`（DesignSync 云端授权失效，本目录 `Lab-Modernist.extracted.html` = 从用户上传 standalone 解包的文档；`lab-solvers.reference.js` = 稿内四台台架的暗色实现，**仅作视觉参照存档，不参与构建**）。

### 7.1 关键判定：稿里没有「内核改进」

稿内 `lab-kernel.js` 头注自述：*"faithful JS port of …/src/lib/linkage/* (master @ 2026-07-27) … Kernel semantics must NOT be changed here"* —— 它是**我们自己 TS 内核的 1:1 JS 移植**，不是新算法。`lab-solvers.js` 同样自述是 `src/demo/{main,arch,tentacle3d,shell3d}.ts` 的移植 + 暗色 HUD。

因此本次落地的"改进"= **表现层**：暗色 HUD 语言、可嵌入组件化、带规格表的 Lab 页。**内核一行未改**（封盘纪律不受影响），也**没有**把那份 JS 移植引入仓库（会造成内核双份、必然漂移）。

### 7.2 实现路径

站内新建 React 台架组件 `components/lab/*`，**直接 import 我们的 TS 内核**（`src/lib/linkage/*`），渲染画法逐段照搬对应 `src/demo/*.ts`：

| 组件 | 对应台架 | 内核/装备 |
|---|---|---|
| `FourBarBench` | `src/demo/main.ts` | solver / controller / trace |
| `ArchBench` | `src/demo/arch.ts` | arch 实例 + 定步 + `archStopPass` |
| `TentacleBench` | `src/demo/tentacle3d.ts` | solver3d + gl3d + camera3d + **真实扫描网格** |
| `RingsBench` | `src/demo/shell3d.ts` | shell3d 五环 + gl3d + camera3d |

- `src/demo/*` 台架文件**零改动**（用户真机验过手感的东西不动，规避回归风险）；`npm run demo` 与线上 `/demo/*` 行为不变。
- 暗色皮肤在 `app/globals.css`（`.lab-fig` 系列，沿用台架同名 class：`.bar/.plate/.trace/.joint-*/.slot/.ground/.grid-dot`）。
- 公共 rAF 循环 `useBenchLoop`：IntersectionObserver 停启 + 页面隐藏暂停 + 单帧 dt 封顶 50ms。

### 7.3 ★ 3D 用真实形态（用户拍板 2026-07-27）

稿内 `lab-solvers.js` 自述：*"The scanned 106k-tri mesh (.bin) is not importable, so Lab.03 renders the vertebrae as procedural boxes"* —— 设计工具导不进网格才退化成程序化方盒。**本站不接受该退化**：`TentacleBench` 载入真实扫描网格（`src/demo/assets/tentacle3d-mesh.bin`，10.7 万三角），由 `scripts/copy-assets.mjs` 在 `predev`/`prebuild` 复制到 `public/mesh/`（gitignore，构建期生成），组件 fetch `/mesh/tentacle3d-mesh.bin`。gl3d/camera3d 装备零改（架构纪律：加新机构 = 新实例 + 台架，不改装备）。

### 7.4 路由与入口变更

- 新增 `/lab`（深色，与 case/log 同语言）：四台台架 + 规格表，文案照搬稿内。
- 主页 S2 的 Lab 四卡链接 `/demo/*.html` → **`/lab#lab01..04`**（站内台架取代裸台架页作为公开入口；`/demo/*` 保留为开发台架）。
- SiteNav：Lab 指向 `/lab`；`/lab` 并入深色 nav 判定。
- **Stage 默认位 = 活的四杆台架**（用户 2026-07-27 拍板放入，此前为空占位）——签名件定位（CLAUDE.md：连杆 = 主页封面）；同时挂 `data-ptm` 作 goPT 转场克隆源，题栏加 "Open the lab →"。

### 7.5 未搬运 / 已知偏离

- `RingsBench` 未搬织物蒙皮与视角预设按钮（`/demo/shell3d.html` 仍有），站内取结构主体。
- 稿内 Lab 页自带 nav/footer 为设计稿自描；站内走既有 `(site)` 布局与 rule-link 页脚。
- 台架 canvas 背景缓冲沿用台架的 1400×1040（2× 逻辑 700×520）——漏设会导致 3D 画面偏小偏移（实测踩过）。

### 7.6 Stage 轮播 + 项目 01 临时主图（2026-07-27，用户拍板）

- **Stage 待机 = 四台 Lab 台架顺序轮播**（`components/lab/StageRotator.tsx`）：四杆 → 拱环 → 触手 → 五环，每台停留 `DWELL_MS` **4s**（用户拍板：9s 太长），交叉淡入 520ms（= --dur-struct），图注随片切换、带可点选的进度指示点。三条工程约束：
  1. **懒挂载**——首屏只建四杆，轮到才建、建后常驻（3D 重建要重传 GPU 缓冲、触手还要重取 1.4MB 网格）；
  2. **非当前片停跑**——`useBenchLoop` 新增 `enabled` 门控。IntersectionObserver 只看几何、看不见 visibility/opacity，不显式关会让后台台架空烧 CPU/WebGL；
  3. **交互即暂停**——台架上 pointerdown/wheel 即停轮播（正拖着被切走最恼人），静置 `RESUME_MS` 15s 恢复；点指示点亦暂停。
  reduced-motion：不轮播，定格第一台。
- **项目 01 预览主图 = Lab.04 五环台架**（临时）：`StagePlaceholderPanel` 在 index 0 用 `<RingsBench>` 顶替 `StageMedia` 占位块，`active` 由新增的 `panel` state 门控（只在该预览显示时跑）。**作者主图供稿后换回 StageMedia**。
- **`controls` 开关**：3D 台架新增 `controls`（默认 true）。主页语境（轮播 / 项目预览）传 `false`——控制条是为深色 /lab 页配色的，浅底主页上白字不可读，且"展示图"不该带仪表控件；真控件在 /lab。
- 两处的活台架都挂 `data-ptm`，仍是 goPT 转场克隆源（canvas 克隆无像素，转场表现为同族深色块生长——可接受）。

### 7.7 对稿返工（2026-07-27，用户指出「视觉细节全丢」）

**失误与真因**：首版落地时我读设计稿是**把 `style=` 全剥掉之后读的**（为看清结构），于是照着一个「无样式骨架」重建——蒙皮、配色、控制条、版式度量全部丢失，且自作主张把「织物蒙皮 / 视角预设」列为「未搬运」。用户对照参考图指出后返工，本节记录对稿结果，**以稿内代码为准**。

**Lab 页版式（逐项对稿）**：
- section = `grid 300px minmax(0,1fr) / gap 44px / padding 44px 0 52px / border-bottom hair`（原实现是 0.8fr+1.2fr、gap 40，错）。
- 规格表 = **竖排行**（`92px 1fr`、`padding 8px 0`、行间 `1px solid ink/14%`、末行加 border-bottom；标签 10px/700/0.1em n500 + padding-top 2px；值 12px）。原实现是 2×2 网格，错。
- 图框 = `border hair` + **`border-top: 3px` 彩色顶线**（2D 内核绿 / 3D 内核紫）+ `background ink/4.5%` 极淡填充。原实现无顶线、无填充。
- 标题 72px；虚线尺 = 绿走线 + 紫实线双条；页脚 `26px 0 72px` 两链 g300。

**台架视觉（逐项对稿，CSS 为稿内 `lab-solvers.js` 内 CSS 的忠实移植）**：
- HUD：11px/700/0.1em/1.75，`.tl` 16/20、`.br` 右下 tabular-nums、`.bl` 左下 max-width 44%；`.dim` opacity .55/600；`.num` 15px/800。题名用中文（Grashof 曲柄摇杆 / S4 环 / 立体肌腱触手 / S1–S5 伏丘壳体），编号色按内核家族（2D 绿 / 3D 紫）。
- 控制条：居中 flex + `.grp` 组间发丝竖线 + 方形复选框（选中填绿）+ 方形拇指滑块 + 分段按钮（active 绿底纸字）。原实现是自创的松散布局、浅底白字不可读。
- **五环补齐三项此前「未搬运」的**：① **织物蒙皮**（相邻环外侧支点等弧长重采样成直纹带，逐帧烘焙）；② **族系配色** S1 绿 → S3 中性 → S5 紫，线色承载环身份，关节点径随环递增 `2.0+ri*0.22`、销点绿、轮毂点取环色；③ **视角预设**（轴测/正/左/右/顶，四元数 slerp 0.35s，拖拽打断）+ **透视开关**（d=700）。
- 触手：滑块拇指色 = 该腱线色（绿/中性/紫），联动分段（无/1+2/2+3/1+3）+ 放松/归位/视角归位。

**装备的一处加法式扩展**：`gl3d.drawDynamicMesh` 增加可选 `dark`/`lite` 明暗端色（画完即还原默认）——暗底台架需要「烟灰织物」压暗蒙皮，好让彩色线稿透出来（稿内 `[0.08,0.10,0.13]`/`[0.52,0.56,0.60]`）。不传即旧行为，`src/demo/shell3d.ts` 等现有调用点零影响；这是能力扩展不是逐机构 hack，未违反「加新机构不改装备」。
