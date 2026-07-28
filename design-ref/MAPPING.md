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
- Work log 条目：设计稿 8 条为定稿文案，若现有 archive 内容池为空/占位则以设计稿 8 条建档（沿用现有内容池机制建，不许绕过 zod 校验管线；机制若不适配纯 log 条目可扩 schema）。**2026-07-27 起以 §8 为准**（并入项目 1 日志、全字段双语、主页预览改接池）。
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
- **返回转场**：设计稿 goBack（case→home 平面淡入返回）本次**未做**——返回走普通 SPA 切换。可作后续。**已于 §6.3 补上。**
- **about 未动**：设计稿这次未给 /about 独立深色稿（主页 S1 About 幕的深色语言可作后续套用依据）；/about 现仍浅色 Modernist。**三内页现状：case/log 深色、about 浅色**——是否统一深色待用户拍板。
- 纪律守恒：case 仍 frontmatter/内容池 + MDXRemote 驱动，只换渲染模板与配色；四路由不动；LinkageFigure 内部零改；正文/图占位不代写。

### 6.3 案例页对稿返工（2026-07-28，用户指出「没完全对齐参考」）

**失误与真因**：§6.2 说「不逐字复制静态 pgCase，改在 `.pg-dark` 里重定义语义 token」——这是**只搬配色不搬构件**，与 §7.7 那次「剥掉 style 读稿」是同一类偷工。深色稿当时确实见过（站上 `.pg-dark` 的 token 与稿内 `#caseRoot` 逐值相同），但**没有存档**，于是稿里的构件全丢了、也无从复查。本轮用户重传，存档为 `design-ref/Case-Screens.dc.html`（**深色案例页稿 = 设计项目里 `Case-Modernist.dc.html` 的迭代版**，旧的浅色副本保留作对照）。**教训与 §7.7 并列：稿要存档，token 相同不等于对过稿。**

**逐项对稿结果**（以稿内代码为准，实测计算值已与稿比对）：

| 位置 | 稿 | 返工前 |
|---|---|---|
| Fig.01 主图 | 一件（内容列首 hero，图注在盒外） | **出现两次**——模板 hero + MDX 里同名 FigSlot |
| 图注行 | `Fig. NN` (55% 墨) + 说明 (n600) + 状态**纯文字**小签 11px/700 | 缺说明；状态还是 `.tag` 盒；字号 11px/0.1em（应 12px/0.08em） |
| 编号 h2 | 左上 **26×3 accent 色刻度**；行高 1.12；01 段整段 62ch（线短一截）、上距 64 | 无色刻度；行高 1.2；全段等宽、上距一律 56 |
| 占位框 | 1px **绿虚线**（accent 45%） | 2px 中性虚线 |
| 概念四卡 | gap **1px** + 发丝线底、**无外框**、卡内边距 12 | gap 2px + 满不透明墨底 + 2px 外框、内边距 16 |
| 斜纹图框 / 元数据竖线 / 披露分隔线 | 一律 1px 发丝线 | 2px 墨线 |
| Fig.05 / 06 | **并置一行**（1fr 1fr · gap 24 · 62ch · 各 4/3） | 顺次两张全宽图 |
| Fig.12 连杆裱框 | 深色页里仍是**浅纸底** `oklch(0.955 0.009 118)` | `var(--paper)` → 在 `.pg-dark` 里解析成深底 |
| ground plane | 渐变 + **点阵（115° 遮罩）** + 颗粒 | 少了点阵层 |
| 页脚 | 104° 渐变 + 点阵（92° 遮罩）+ 颗粒 | G900 平铺色块 |
| nav | padding 12/48 · gap 16 · 下缘 1px 发丝线 | padding 14/48 · gap 24 · 2px |
| 标题下 | 绿虚线（行进）+ 紫实线**双线尺** | 无 |
| summary | 正文墨色 | 被调到 n700 变灰 |

**落地方式**：新增 `.fig-cap*`（图注行）/`.fig-live`（活件裱框）/`.concept-grid` 三组类 + `.pg-dark` 下的发丝线化覆盖；`FigSlot` 加 `desc`（稿里"框内标签"与"图注说明"本就是两串字）、状态由 `StatusTag` 改 `StatusSign`；新增 `FigPair`。MDX 只动三处：删掉重复的 FIG.01、05/06 包进 FigPair、按稿补 desc。**四路由不动、内容池机制不动、LinkageFigure 内部零改。**

**两处有意保留的偏离**：① 项目 01 主图仍是 Lab.04 五环活件（§9.1 用户拍板，稿里是待拍摄占位块）；② 大标题用 `clamp()` 而非稿的定值 72px（§5 条 4 响应式硬要求）。

**首屏完整性（用户 2026-07-28 追加拍板：「进来第一眼看到的是一个完整的页面，大图不会被截断」）**——这是对稿的**第三处有意偏离**，稿是 1440 桌面稿、不管视口高度：

- 对稿后实测主图下沿在 1144px，而常见笔记本视口只有 768–912px，主图一定被切。两件事一起做：① `@media (max-height: 960px)` 时标题区整体压一档（`header` padding 64/40 → 36/24、标题 clamp 上限 72 → 54、副标 19 → 17px、内容列上距 32 → 20），把主图上沿从 470 提到 363；② 主图高度锁进预算 `--case-hero-budget`（= 实测上沿 + 图注行 + 底部留白，高/矮视口各一份：523 / 412px）。
- **只给 `max-width` 不给 `max-height`**：主图按比例缩、不裁切——活台架的高度是 `.lab-fig canvas` 的 `aspect-ratio: 700/520` 推出来的，给 `max-height` 只会让它溢出后被 `overflow:hidden` 切掉（连 HUD 角标一起切）。占位主图是 3/2，同理。
- 版式度量因此**从内联样式搬到 `.case-*` 类**（`case-head/kicker/title/rule/lede/content/hero-fig`）——内联样式没法被媒体查询接管。
- 实测（CDP）：1366×768 / 1280×800 / 1440×900 / 1680×912 / 1920×1080 / 2560×1300 六档，主图 + 图注全部落在首屏内，底部余量 21–157px；转场落位仍正常（落点 `data-pt-target` 就是主图盒本身，盒子变小几何自动跟着变，`PageEnter` 一行没改）。
- **改版式度量时预算值要一起改**——两个数是实测钉的，不是推导的。

**主图控制条竖排右侧（用户拍板 2026-07-28：「控制台放在展示窗口的右边，图不会变长、只变宽」）**：

- 案例页主图此前传的是 `controls={false}`（§7.6 的理由是「浅底主页上白字不可读、展示图不该带仪表控件」）——**案例页本身是深色**，前半条不成立；作者要能在主图上直接调，于是开控制条。
- 但**横排控制条挂在画面下面会把整件变高**，直接撞上面那条首屏预算。故新增 `.lab-wrap--side`（`RingsBench` 的 `sideControls` prop）：整件转 flex 行、控制条竖排成右侧一列（`--lab-ctl-w` 188px，定在 `:root`——`.case-hero--live` 是 `.lab-wrap` 的**父**，从子元素继承不到这个变量），组间分隔线从竖线转横线，相位滑杆占满列宽。`.case-hero--live` 的宽度预算相应加一列：`calc(画面宽 + var(--lab-ctl-w))`。**只变宽不变高**，主图高度仍由预算决定。
- **转场落点随之下移到画面盒**（`ptTarget` prop 把 `data-pt-target` 打在 `.lab-fig` 上，不再在 `.case-hero` 上）：落点若还框着整件（含 188px 控制列），主页飞过来的那张画面快照会被按整件宽度拉伸，交接那一帧明显一跳（1440 下约 29%）。落点只框画面本身，快照与活件才严丝合缝。
- `/lab` 页不用侧栏（那里没有首屏约束，横排读着更顺）；主页舞台/项目预览仍 `controls={false}`。实测 `/lab` 的四台台架与主页均无变化。

**图版整理 + 控制条英文（用户 2026-07-28 追加：「优化一下图版，现在有点丑，控制杆改成英文版本」）**：

- **词表 `COPY` + `lang` prop**（`'zh' | 'en'`，默认 zh）：案例页主图传 `lang="en"`——那一页从标题到 role/tools 全英文，控件夹一列中文读成两种语言的拼贴。**`/lab` 仍是中文**（§7.7 对稿结论），要改也只是翻一个 prop。英文侧连 HUD 一起翻（`S1–S5 shell family` / `85 mm pitch · in-phase breathing · slot ladder`），只翻两处控件而留着中文 HUD 反而更花。
- **竖排版式重排**：① 每组补组名（DISPLAY / PHASE / VIEW，10px 大写、45% 墨），此前三个勾选框直接浮在列顶；② 相位组名右端挂实时读数（tabular-nums、accent 色）；③ 视角从**分段控件改 2×3 按钮网格**——分段控件是横排语汇，竖排里换行会留豁口、还得靠负边距补边框；「归位」并进网格当第 6 格（描边淡一档，不参与选中态填色）；④ 滑杆占满列宽；⑤ 操作提示从画面里的 `.lab-hud.bl` **移到列底**（侧栏模式下画面里那条关掉，不重复），顺带把画面左下角腾干净；⑥ 整件收进一个发丝线框——此前它浮在页面底色上、只有画面与控制列之间一条竖线，看着像掉了半边。
- **两道高度闸**（矮屏实测踩到：控制列内容比画面高时会把 flex 行撑高、首屏又被顶破，1366×768 溢出 20px）：`@media (max-height: 830px)` 收掉列底提示与内边距；`.case-hero--live` 加 `max-height` 封死整件高度，真装不下时由 `.lab-ctl` 自己滚（`overflow-y: auto`）。六档视口复测底部余量 21–296px。

**返回转场 goBack 补上**（`components/site/BackTransition.tsx`）：点 brand / Work → 内容 blur(10px)+scale(0.985)、深色平面 480ms 淡入盖满 → 换页 → 平面淡出。**SPA 适配两条**：稿靠换文档 + `om-pt` 交接给主页 `<head>` 脚本揭开，本站平面不随文档销毁，**由本组件自己淡出移除**，因此**不写 `om-pt`**（写了会让下一次进深色页的 `PageEnter` 误判成"刚从主页转场过来"）；卸载时**不撤销**收尾定时器——push 之后组件即卸载，撤了平面就永远留在屏上（平面另带 `pointer-events:none` + `data-pt-tmp` + 自身兜底移除三重保险）。**必须挂捕获阶段**：`next/link` 自带点击处理，冒泡阶段再 `preventDefault` 已经晚了（实测跳转照常发生、转场根本没播）。reduced-motion 直接走普通导航。

**连带影响（非案例页）**：`.nav` 的 padding/gap 改为设计系统值——全站导航同步；`.site-footer--deep` 只加在深色路由（`/work` `/archive` `/lab`），`/about` 仍是 G900 铺底。CDP 实测四路由无 pageerror、返回转场残留归零（含 reduced-motion 分支）。

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
- 两处的活台架都挂 `data-ptm`，仍是 goPT 转场克隆源（canvas 克隆无像素，转场表现为同族深色块生长——可接受）。**已于 §9.3 改掉**：主图也换成活件之后，中间断这一下变刺眼，克隆改挂画面快照。

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

### 7.8 主页舞台回归修复（2026-07-27）

§7.7 忠实移植稿内 CSS 时，把 `.lab-fig` 原有的**深色底与宽度**一并删了（稿内台架只跑在深色 /lab 页，深底由页面供给、宽度由网格单元供给），导致主页舞台两处回归：

1. **深底丢失**——台架是深色仪表，落在浅色主页上"裸奔"在纸面，HUD 与 SVG class 还会解析成浅底配色。修：新增修饰符 `.lab-wrap.on-light`（重定义深色 token + 给 `.lab-fig` 深底与发丝边框），四台加 `onLight` prop，主页语境（StageRotator / 项目 01 预览）传 true；`/lab` 深色页不加，仍由页面供给。
2. **尺寸塌缩**——`.lab-wrap` / `.lab-fig` 在 flex 容器里作为 flex item 收缩成内容宽，内部 `width:100%` 失去参照 → SVG 退回固有宽（约 300px 小图）。修：两者都补 `width: 100%`（对 /lab 的网格单元无影响）。

教训同 §7.7：**照搬稿内 CSS 时要连"稿内隐含的上下文假设"一起搬**——稿只跑在深色页、只用网格布局，这两条假设在主页都不成立。

---

## 8. Work log 双语化 + 版式重排（2026-07-27，用户拍板）

项目 1「轮回机器」的工作日志（2026.03–07，19 条）并入 log 内容池后，日志从「站建设流水」变成「项目主线记录」，随之三处修订——**§4「数据来源」中 Work log 一条以本节为准**：

### 8.1 数据形状：条目全字段双语

- `lead` / `body` / `tags[].label` 均改为 `{ en, zh }`，zod 两语言都 `min(1)`——**缺一种构建期直接 fail**（半翻译的条目切到中文会留英文孤岛，形状校验本身挡不住，故落在 schema 上）。
- 标签词汇表（en/zh）：Machine 机器 · Lab 实验室 · Site 网站 · Docs 文档 · Record 记录 · Shell 壳体 · Arch 拱环 · 3D 立体 · Concept 概念 · Study 实验设计 · Mechanical 机械 · Simulation 仿真 · Electronics 电子 · Sourcing 采购 · Strategy 战略。`Machine`（outline）= 项目桶，与既有 `Lab` 平级；每条上限 1 outline + 1 neutral（多了会把 /archive 的 tag 列撑宽）。
- 双语来源存档 = 轮回机器_工作日志原稿.md（未删减）；站上条目是其**结论式压缩**，不是逐句翻译——原稿留数值细节，站上留「学到什么」。
- 守门测试 `src/lib/site/log.test.ts`：排序、同日 tie 稳定性、双语补全、标签译名一致性（zod 挡不住这四类）。

### 8.2 语言切换（Log 页专属）

- `/archive` 标头右侧 EN / 中文 滑块（`.lang-switch`），切换范围 = 条目 + 标签 + 标题 + 副标 + 页脚说明；**全站不做 i18n 路由**，其余页面恒英文。
- SSR 首帧恒 EN（页面是静态预渲染，服务端读不到偏好）；挂载后从 `localStorage['log-lang']` 恢复，选择即写回。隐私模式下 localStorage 抛异常已吞掉——记不住语言不该让整页挂掉。
- 中文标题走系统 CJK 回退字体（自托管的 Source Serif 4 无中文字面）。**已知偏离**，要统一质感需另外自托管中文字体，本轮不做。

### 8.3 版式：条目拆行（用户「不要全堆在一起」）

设计稿的单行条目（日期 / lead+正文同段 / tag 组）在 27 条、含长正文时糊成一片，改为：

- 左栏 150px：日期（20px/800）+ 标签竖排；右栏：**引句独占一行**（16px/650），正文另起（英 66ch / 中 40em 限宽，中文行距 1.85、字距 +0.01em——同号字下中文比拉丁更密）。
- 按月分组，月首一条「月份标签 + 占满余量的发丝线」（`.log-month`）。
- <768px 回落单栏，日期与标签同行。

### 8.4 主页 Log 预览改接内容池

`LOG_PREVIEW` 硬编码（稿内三条字面）删除 → `app/page.tsx` 从池里取最新三条英文面传 `HomeScreens` 的 `logs` prop，与 /archive 同源。池里条目长短不一，预览行 `-webkit-line-clamp: 2` 钳两行——S2 幕高度固定，长条目会把页脚顶出去。

### 8.5 条目折叠展开（2026-07-27，用户拍板）

正文改成说明性长文后，27 条全展开一屏扫不动。条目改为**概括 + 详情**两层：

- 收起态只显示 `lead`（一句「这次更新做了什么」）+ 日期 + 标签；点整行展开 `body`。默认全收起。
- 概括行是 `<button aria-expanded aria-controls>`，键盘可达（Enter/空格）；右端箭头 180° 翻转指示状态。
- 面板用 `grid-template-rows: 0fr → 1fr` 过渡（240ms，比 `--dur-micro` 慢一档；reduced-motion 下无过渡）。**内容始终留在 DOM 里**，不做条件渲染——收起态也能被搜索引擎读到。
- 展开状态存在组件内存里（`Set<id>`），切语言不重置、刷新即清空。

**图 / 表格插槽（预留，本轮不实现）**：内容池加可选 `blocks` 字段（图片 / 表格 / 代码等有判别字段的联合类型），在 `LogList` 的 `.log-entry__panelInner` 里正文之后按序渲染。落地位置已在组件里注释标出；zod 现在**不加未使用字段**，等真要加图时再一并加 schema + 校验。

### 8.6 项目 2 日志并入（2026-07-27，用户拍板「与项目 1 同样的要求」）

项目 2「双层多智能体空间仿真（真实的人，梦境的空间）」的 2026.06–07 工作日志 11 条按 §8.1 同一套要求并入同一个池——**log 从此是多项目共用的主线记录**，机制不变（无新字段、无新组件、无新路由）。

- **项目桶标签新增 `Space 空间`（outline）**，与 `Machine 机器`、`Lab 实验室` 平级——§8.1 的标签词汇表据此扩一项。多项目共池后，outline 标签就是读者辨认「这条属于哪个项目」的唯一线索，因此新增守门测试：**每条至多 1 个 outline + 1 个 neutral**（版式按左栏 150px 定，超预算会撑宽标签列；同时防止一条同时挂两个项目桶）。项目 2 用到的 neutral 全部复用既有词汇：Concept 概念 / Strategy 战略 / Simulation 仿真 / Study 实验设计 / Record 记录 / Docs 文档。
- **双语来源存档 = `项目二_工作日志原稿.md`**（用户上传原文，未删减）。文件名用「项目二」而非项目名：项目 2 尚未定名（原稿暂定名《孤室 / Cells of Withdrawal》已被 07-09 愿景修正推翻，`content/work/project-ii` 仍是占位）——作者定名后连同 slug 一并改。
- **写法同 §8.1 + 项目 1 的两轮返工教训**：结论式压缩而非逐句翻译；说明性文字（做了什么 → 为什么 → 结果如何），术语首次出现即解释（如可供性、强化学习、滞后效应、阈值级联、内生级联在正文里直接展开）；不写警句、不留内部黑话。
- **两条区间日期钉成单日**（schema 要求 `YYYY-MM-DD`）：原稿「2026-06 上旬（至 06-07 收束）」→ `2026-06-07`；「2026-07 中下旬（依据项目记忆补记）」→ `2026-07-24`，且该条正文末尾如实注明「会话记录读不回来、日期为近似值」。
- **同日 tie 顺序规则**：项目 1 / 站建设的既有条目在前，项目 2 在后（合并时用稳定排序实现，JSON 内顺序即站上顺序——`log.ts` 与 `Array.sort` 双端都稳定）。碰撞日：06-03 / 06-15 / 07-09 / 07-13 / 07-17。
- **连带更新**：池 27 → 38 条；主页 S2 的 Log 预览（§8.4，取最新三条）随之含项目 2 条目——最新条现在是 2026-07-24 那条；统计条 Tests green 108 → **109**（新增标签预算测试）。

### 8.7 项目筛选（2026-07-27，用户拍板「可以选择只看某一个项目，也可以总览看全部」）

多项目共池后，`/archive` 标头下加一行筛选条：**全部（默认）+ 每个项目桶**，各带条数。机制仍不新开字段——

- **桶 = outline 标签**（§8.1 既定约定的直接兑现）：`getLogBuckets()` 从池里现算，条数多的在前、同数按 key 字典序（顺序必须确定，否则 SSR 首帧与客户端 hydration 对不上）。桶名与条目左栏那枚 outline 标签同名同色，点的是哪个项目一眼对得上。
- **前置条件：每条恰好一个 outline**。原先 3 条没有项目桶（两条建站 + 一条连杆 spec），它们会从所有筛选视图里消失、只在总览态出现——读者看不出漏在哪。已归位：两条建站条目的 `Site` 由 neutral **升为 outline 项目桶**（网站建设自成一条工作线），连杆 spec 那条补 `Lab` outline、`Docs` 留作 neutral。守门测试相应从「至多 1 个」收紧为「**恰好 1 个**」，并新增桶测试（覆盖全池 / 条数守恒 / 顺序确定）。当前四桶：Machine 19 · Space 11 · Lab 6 · Site 2 = 38。
- **交互**：点已选中的桶 = 取消回总览；筛选态右端出「Showing N of 38 / 显示 38 条中的 N 条」读数（总览态留空占位，按钮行不跳动）；筛选**不记 localStorage**，刷新回总览（与语言不同——语言是长期偏好，筛选是当下视角，记住它会让人下次进来以为条目丢了）。
- **展开态 id 改用全池下标**：原先 id 是「日期 + 月内下标」，筛选后同一个 id 会落到另一条条目上（展开态串位）。改为全池下标后，切筛选/切语言都不重置，回到总览时刚才展开的那条仍是展开的。
- **客户端/服务端边界**：`LogList` 是 `'use client'`，**不能 import `src/lib/site/log` 的运行时导出**（该模块 import `node:fs`，会撞 Turbopack 的 `does not support external modules`）——桶在服务端 `page.tsx` 算好当 prop 递入，组件内只 import 类型、判定逻辑就地写一份。
- **样式** `.log-filter*`（globals.css）：12px/700 大写字距 0.1em，选中 = accent 文字 + 2px accent 底边；中文态整条 `lang="zh-Hans"` 关掉 uppercase。<768px 自动换行，实测 390px 无横向溢出。
- 统计条 Tests green 109 → **110**。

### 8.8 三级筛选 + 日历热力图（2026-07-27，用户拍板「多层目录筛选 + GitHub 那样的热力图，点击即跳转」）

§8.7 的单级项目筛选扩为**三级下钻**（项目 → 方面 → 月份），右侧配一张 GitHub 式日历热力图。仍不新开字段、不加路由：三级全部从既有标签与日期现算。

**派生逻辑下沉到新模块 `src/lib/site/log-facets.ts`（纯函数，不碰 fs/DOM）** —— 这是 §8.7 那条「桶在服务端算好当 prop 递」的正式修正：三级筛选要在客户端实时重算，靠传 prop 不现实，所以把派生从 `log.ts`（带 `node:fs`）里拆出来，服务端与 `'use client'` 组件共用同一份实现（此前客户端另抄一份判定的隐患一并消掉）。`log.ts` 只剩读文件 + zod + 类型；`getLogBuckets`/`logBucketKey` 已删（迁为 `projectFacets`/`bucketOf`）。

- **三级的来源**：项目 = outline 标签；方面 = neutral 标签；月份 = `date.slice(0,7)`。**方面这一级新增 `Other 其他` 桶**接住没打 neutral 标签的条目（现有 4 条）——与项目那级同一条不变式：**每级各视图之和 = 总览**，任何条目都不会掉出下钻路径。
- **计数用 faceted search 惯例**：每一级的数字按「另外两级已选」现算，就是「点下去会剩几条」。**选项集合恒取自全池**（不随下钻消失），当前组合下为空的选项计数归零、变灰、`disabled`——行不跳动，也让人看得见「这条路走不通」。
- **热力图**：列 = 周、行 = 周日→周六，值域 = **池内首条到末条**（不铺满一年——日志才五个月，铺一年是一片空网格）；分 4 级着色（`color-mix` 兑 `--accent`）。**筛选只改格子深浅、不缩网格**（值域恒取全池，`buildHeatmap(entries, range)` 第二参）——否则切一次项目整张图换个宽度，右侧版面跟着跳，也没法横向比较两个项目的活跃期。日期算术全程 UTC（本地时区不该改变格子落在星期几）。
- **点击跳转**：只有有条目的格子是 `<button>`（空日与首末周的补位格不进 tab 序，键盘不在空网格里穿行）。点某天 → 滚到那天第一条并闪一下（`data-flash`，1.6s；`prefers-reduced-motion` 下不做平滑滚动）。热力图本身已按项目+方面筛过，**唯一可能挡住目标的是月份那一级**——就把月份切到目标所在月，不粗暴清空用户其余选择。月份筛选生效时，热力图上其余月份的格子 `data-dim` 退到背景：热力图与月份那一级是同一个控件的两种形态。
- **版式**：`.log-band` 左（三行 `.log-facet`，每行 76px 级别名 + 自动换行的选项）右（`.log-heat`）；<1100px 热力图落到筛选下面，<640px 级别名转为独占一行。热力图窄屏横向滚动（格子宁可滑出去，也不缩到点不中）。
- **守门测试** `src/lib/site/log-facets.test.ts`（新增 13 项）：三级各自覆盖全池 / 排序确定（顺序若不确定，SSR 首帧与 hydration 会打架）/ 交叉下钻不丢条目 / 热力图周对齐、值域边界、日期落在正确的星期行、分级、空池不炸、筛选不缩网格。统计条 110 → **121**。
- **月份改横向滚轴（用户拍板：「不然以后就太长了」）**：月份是三级里唯一会无限增长的一级，平铺换行迟早把筛选带撑成一堵墙。改法 = 「全部」留在轨道**外**（永远够得着、不用先滚回头），月份装进 `.log-facet__track`（`overflow-x:auto` + `scroll-snap` + 4px 细滚动条 + `overscroll-behavior-x: contain`，滚到头不把整页往回带）；标签同时换紧凑写法 `monthChip()`（`Jul 2026` / `2026.07`，全称仍用于列表里的月份分隔），轨道里一屏能多看见几个月。选中项自动滚进视野（热力图跳转会替你改月份，那格可能在轨道外）——**位置用 `getBoundingClientRect` 相减算，不用 `offsetLeft`**：`offsetLeft` 是相对最近的定位祖先量的，轨道自身没定位时会量到外层 `.pg-dark` 上去（首版就是这个错，滚出来的位置差了几百像素）。方面那一级不改：它的词汇表是有界的，不会长。统计条 121 → **122**。

### 8.9 智能床日志并入（2026-07-27，用户拍板「同样的工作，传上去」）

第三份日志——**2030 智慧睡眠前瞻研究（清华大学未来实验室 × 慕思）的智能床项目**，2026.05–07 共 9 条——按 §8.1 / §8.6 同一套要求并入同一个池。机制照旧零改：无新字段、无新组件、无新路由，三级筛选与热力图全部自动接住新条目。

- **定位**：用户明说此项目**暂列 other work，不算项目 3**（作品集主体仍是四个主项目）。log 里它照样是一条独立工作线——项目桶就是读者辨认归属的唯一线索，不给桶反而会让 9 条无处可归。桶名 `Sleep 睡眠`（outline），与 `Machine 机器`/`Space 空间`/`Lab 实验室`/`Site 网站` 平级；**不叫 `Lab`**——那个桶已经指连杆求解器台架，两个「实验室」会当场混读。当前五桶：Machine 19 · Space 11 · Sleep 9 · Lab 6 · Site 2 = 47。
- **方面（neutral）新增 5 个**：`Research 调研` · `Writing 写作` · `Survey 问卷` · `Personas 画像` · `Interviews 访谈`（`Concept 概念` 复用既有）。这是设计研究的词汇，与既有的工程词汇（仿真/机械/电子/采购…）不重叠，硬塞进旧词只会让方面这一级失去分辨力。方面那一级是自动换行的平铺（§8.8 明确不改滚轴），13 → 18 个选项后 1280px 下仍是两行，**再增就该考虑按项目分组或也上滚轴**。
- **作者给的标签是两个一组，站上只留一个**（§8.1 的 1 outline + 1 neutral 预算，超了会撑宽 /archive 左栏）。取舍按「这条主要在干什么」：竞品分析与证据库都归 `Research`（`文献 Literature` 未单开——单条计数的方面选项不产生分辨力）；6-12 那条主体是合并稿修复，归 `Writing` 而非 `可视化`；6-30 / 7-7 两条归 `Personas` 而非 `文献`/`问卷`。**被舍掉的标签在原稿里原样保留**。
- **两条区间日期钉成单日**（schema 要求 `YYYY-MM-DD`）：6 月 1–5 日 → `2026-06-05`、7 月 9–14 日 → `2026-07-14`，一律取**区间末日 = 完成日**；6-05 那条正文里写明「用五天」，跨度信息不丢。同日碰撞 06-04 / 06-12 / 06-15 / 07-07 一律既有条目在前、智能床在后（合并脚本稳定排序，JSON 内顺序即站上顺序）。
- **双语来源存档 = `智能床_工作日志原稿.md`**（用户提供的原文，未删减，含被舍掉的第二标签与区间日期说明）。站上条目是其结论式压缩：中文侧补了原文只在英文侧解释过的术语（RU-SATED 六维度、关键事件技术），并把半角标点统一为全角，与池内其余条目同一质感——**双语两侧都是原文，不是互相的译文**。
- **新增守门测试**「没有重复条目（同日 + 同一句 lead）」：池现在由三份原稿汇入，同一条被并入两次是最可能的合并事故，而重复条目形状完全合法、日期也对，zod 与排序测试都看不出来。统计条 122 → **123**。
- **合并用 `work-log` skill 的 `merge_log.py`**（校验双语补全 + 查重 + 稳定排序），输出再按池内既有的紧凑标签写法回排一次——脚本的展开式格式会把 38 条既有条目全部重排，制造无意义的 diff。池 38 → 47 条；主页 S2 的 Log 预览（§8.4 取最新三条）不受影响——最新条仍是 2026-07-24。

### 8.10 一级筛选改按「项目」呈现（2026-07-27，用户拍板「按具体的项目，比如项目 1 / 项目 2 / other works 这样分别展示」）

§8.7–8.8 的一级筛选选的是 **outline 标签的字面**（Machine / Space / Sleep / Lab / Site）——那是主题词，不是读者认的东西：`Lab` 与 `Machine` 其实是同一个项目的两半（CLAUDE.md「定位与边界」：连杆求解器属于「轮回机器」的结构实现部分，**不是第五个项目**），而 `Site` 根本不是作品集项目。一级因此改为**项目分组**：

- **新增 `PROJECT_GROUPS`（`src/lib/site/log-facets.ts`）**：项目 key → 显示名 + 该项目吃下的 outline 标签集合。当前四组：`project-i`（Machine + **Lab** = 25）· `project-ii`（Space = 11）· `other-work`（Sleep = 9）· `this-site`（Site = 2）。`bucketOf` 保留（仍是「这条的 outline 标签是什么」），新增 `projectOf` = 经此表归组；`projectFacets` 与 `LogList` 的一级判定改用后者。
- **顺序固定为登记顺序**，不再按条数排——项目的先后是作者定的（作品集编号），不该随写了多少条抖动。另外两级不变（方面仍按条数、月份仍按时间）。
- **命名**：`Project I · Reincarnation Machine` / `项目一 · 轮回机器` 与 /work 各页编号一致；项目二尚未定名，给的是**描述而非标题**（`Project II · Spatial Simulation`，定名后连同 slug 一并改）；智能床按作者拍板是 `Other work · Smart Bed`；建站流水单列 `This site 本站`——它不是项目，但也不该塞进 other work 与研究项目混读（**这一条是判断，作者要合并的话改 `PROJECT_GROUPS` 一行即可**）。
- **失去的性质**：§8.7 那条「桶名与条目左栏那枚 outline 标签同名同色」不再成立——点 `Project I` 出来的条目左栏是 `Machine` 或 `Lab`。这是有意的：标签继续说「这条是哪一类工作」，筛选说「这条属于哪个项目」，两件事本来就不同粒度。
- **新增守门测试**「每个 outline 标签都登记在某个项目组里，且不重复登记」+ 项目顺序改判 `PROJECT_GROUPS` 顺序：漏登记的标签会让那批条目从所有一级视图里消失、只在总览态出现，页面上看不出漏在哪。统计条 123 → 124；**与主线的转场工作（§9，131 项）合并后全套实测 133**，统计条按此。
- **样式**：`.log-filter__opt` 加 `white-space: nowrap`——项目名带副名后标签变长，整项换行才对，从中间断开会读成两个筛选项。实测 1440px 项目行两行、390px 无横向溢出。

---

## 9. 项目 01 主图 = Lab.04 活件 + 预览→主图变位缩放转场（2026-07-27，用户拍板）

用户要求两件事接成一件：**主页项目 01 预览位那台 Lab.04 五环活件，也放进项目 01 详情页的主图位**；然后把 §6.2 那条「点卡片 → 预览图展开 → 进新页面」的转场**接到底**——预览图要流畅地变位缩放，落到新页面里主图该在的位置。

### 9.1 案例页主图位（`app/(site)/work/[slug]/page.tsx`）

- 项目 01（`slug === 'reincarnation-machine'`）的 hero 换成 `<RingsBench controls={false} />`，与主页预览位**同一件**（同组件、同内核、同视角预设——转场两端看到的必须是同一台机器，否则「落位」只是障眼法）。其余三个项目 hero 不动，仍是 §6.2 的占位媒体块。**作者主图供稿后删掉 `liveHero` 这一支即回占位**，与 §7.6 主页那处同一条退出路径。
- `.case-hero--live`：`aspect-ratio: auto` + `display:block`。固定 3/2 会把 700/520 的画布上下裁掉，连 HUD 角标一起切；渐变底保留不动——它与主页 `.om-media` 同款，落地时两端底色对得上。
- 图注移到 hero 盒**外**（`Fig. 01 — [临时顶替] Lab.04 five-ring shell · live · machine hero 待拍摄`）：`data-pt-target` 是转场落点，落点应当只框住画面本身，不该把一行小字算进几何。
- `/lab` 与主页语境的差别照旧：`/lab` 是深色页由页面供 token，主页浅底要 `onLight`；案例页是 `.pg-dark`，与 `/lab` 同侧，**不传 `onLight`**。

### 9.2 转场第二段：变位缩放（`components/site/PageEnter.tsx`）

原落地段是「不透明平面盖场 → `clipPath` 从满屏收回到 hero」——**裁出来的**，不是飞过去的。现改为真正的共享元素变位缩放：

**直飞（用户拍板 2026-07-27：「不要中间放大一下再缩小过去，能不能直接过去」）**——首版是「卡片位放大铺满 → 跳页 → 从满屏缩回 hero」，两段各自连续、合起来却是一次没有必要的鼓胀。现在 `/work/*` 走**一次飞行**：goPT 不再放大克隆，把它**钉在卡片原位**跳页，目标页量到 hero 后一次飞过去。`PageEnter` 那侧一行没为此改——它的起点一律取「克隆此刻的视觉框」，所以出发段是钉住还是放大，落地段不必知道。其余路由（`/archive` `/lab`）没有落点可飞，仍是稿内的生长铺满。
- **背景从预览块展开（用户拍板 2026-07-27：「现在是直接一下闪过来的，不太自然」）**：换页那一帧必须被盖住，但**怎么盖**是有讲究的——首版是一块全屏遮罩淡入，读起来是平白多出一层东西糊在脸上。改成底板从**预览块自己的框**沿四边铺开（`clip-path: inset()` 从源块矩形展到 `inset(0)`，`EXPAND_MS` 380，铺满即 push），读起来是这块预览的底板长成了新页面的背景。**用 clip 不用 scale**：缩放会把渐变一起拉伸变形，clip 只是把同一块底板露出来。底色取源块自身的 `backgroundImage`，取不到（活台架的包裹层没有底色）才退 `PT_BG`。展开期间预览块钉在原位、在底板之上（z 200 > 199）。铺满前 push 会从没盖住的边角漏出浅底主页硬切成深色案例页那一帧。
- **遮罩落地后要淡出、且压到 hero 之下**（`z-index` 100）：生长那条路遮罩被满屏克隆盖着，撤不撤都一样；直飞这条路它正盖着整页。若让它夹在 hero（150）与克隆（200）之间，活件被蒙一层灰而克隆不受影响，交叉淡出就成了「亮的淡成暗的」。

两段合一后的构件：

- **同一条几何路径，两个元素一起走**：出场克隆（body 上、跨路由存活的 `[data-pt-morph]`）与本页 hero 各自算「起点盒 → hero 版式盒」的 translate+scale，途中交叉淡出（`CROSSFADE` 0.55 处克隆已透明，活件接手）。几何在 `src/lib/site/flip.ts`（纯函数 + 9 项测试）：等比按宽 + 中心对齐 ⇒ 两个起点盒不同、终点盒相同的元素**全程重合**，看不出中途换了元素。实测两者中心 y 全程同值（1440×900：克隆 -14,-290,1469,1479 / hero -14,-96,1469,1091，中心均 449.5）。
- **起点取克隆此刻的视觉框**，不重新按视口算——上一段的末帧就是这一段的首帧，接缝为零（直飞下即卡片原位）。没有克隆时（窄视口无面板、或克隆源尺寸不足的兜底路径）才退回按视口 cover 算一帧，hero 自己缩回去，同样不露底。
- **着陆平面不再承担揭开**：`.pt-veil` 那条老路**原样保留**给没有 `data-pt-target` 的路由（`/archive` `/lab`）；有落点的路由上，遮罩只负责盖住换页那一帧然后淡出。白屏没有落脚点——hero 自身的渐变底 + `.ground-plane` 双重兜底。
- **z-index 只有 150**：克隆在 body 上 z=200，必须压在 hero 之上（交叉淡出要的就是这个前后关系）；150 足够压住 nav 与正文（都不带 z-index）。**周边内容揭入时跳过 hero 所在的那一块**——给它加 `filter` 会另起层叠上下文，把 hero 关进去、压回 nav 底下。
- **收尾连动画一起收**：硬兜底超时只复原内联样式、放任动画跑完，会让 hero 在失去 z-index 之后继续放大着压在正文底下（慢机器上先到超时，CDP 实测可见）。`finish` 里 `heroAnim.cancel()`。

### 9.3 克隆的画面：canvas 快照（`components/lab/snapshot.ts`）

`cloneNode(true)` **不复制 canvas 像素**——3D 台架当预览时，点下去机构凭空消失、只剩深色方块放大（§7.6 末尾那句「可接受」在主图也变成活件之后不再可接受：现在两端都是同一台机器，中间断一下最刺眼）。

- 台架挂载时登记一个「重绘一帧 + 立即读回」的闭包（`setSnapshot`），goPT 克隆时逐个 canvas 换成快照 `<img>`（按源 canvas 实测宽高比设 `aspect-ratio`，HUD 绝对定位层不受影响）。
- **不开 `preserveDrawingBuffer`**：那要全站每帧多留一份缓冲，代价加在常态渲染上；合成后读回是空的这件事，靠「同一个任务里绘制完立刻读」绕开，且只在点击转场时跑那一帧。gl3d/camera3d 装备零改。
- 登记方：`RingsBench` / `TentacleBench`（另两台是 SVG，克隆天然带画面）。取不到快照一律降级为原样克隆，不抛错。

### 9.4 手感常量与实测

`EXPAND_MS` 380（底板展开，直飞专用）/ `MORPH_MS` 660（飞行；直飞路程短，760 → 660）/ `CROSSFADE` 0.55 / `REVEAL_MS` 560 + 140ms 延迟 / `VEIL_OUT` 420。生长那条路的 `PUSH_MS` 620 不动——**待用户真机拍板**。真浏览器（CDP，1440×900）实测五条路径：转场落位后残留归零、hero 内联样式复原、无 pageerror；直接访问 / reduced-motion / `/archive`（无落点走老路）/ 回退后二次转场 / 窄视口无克隆兜底，全部干净。统计条 122 → **131**（新增 flip 9 项）。
