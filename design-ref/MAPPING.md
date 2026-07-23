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
- **★ 待拍板决策点**：设计稿 Stage 默认位当前为 **[待定] 占位**（"后续放置：动态图形 / 精选画面"）——原 FIG.01 连杆席位。落地时默认内容需用户拍板；自然候选 = `LinkageFigure`（CLAUDE.md 签名件定位、SITE_SPEC §7 已有实现）。落地前不得自作主张定夺。
- **落地约束**：wheel 接管仅桌面生效；`prefers-reduced-motion` 与 <1024px 回落常规文档流（稿内已实现，移植时保持）；动效 token（--dur-micro 180ms / --dur-struct 520ms / --ease-site）进 globals.css；Tweaks 布尔开关（pagingFeel/hoverPeek/entrance/staggerFx/stageFx/cursorReadout/railFlip/spin）落地为组件 props 或构建期常量。
- **纪律提醒**：SITE_SPEC §1 克制条款（无入场动画/无滚动特效）与本稿冲突——**回填修订待用户正式拍板**，在此之前 SITE_SPEC 原文不动，本节为过渡期事实记录。统计数字 168 已过时（同 §4，落地用当前实测数）。占位文案照搬纪律同 §5 条 2。
