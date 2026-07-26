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
