# SITE_REVIEW_2026-07.md — 网站架构 review 与建议（调研先行）

**产出方式**：2026-07-10，用户 /loop 指令「review 网站架构 + 各方面建议，建议前先调研 GitHub 与获奖站案例」。四路并行调研（获奖站案例 / GitHub 开源架构 / 动效实践 / case study 叙事）→ 本地代码通读 → 综合。
**地位**：参考笔记，非规范。与 SITE_SPEC / LINKAGE_SPEC 冲突时一律以后者为准。「需拍板」条目在用户拍板前不执行。
**附录 A–D 为四份调研原文**（含全部出处 URL），正文只做综合。

---

## 一、总判断

现有架构的每个关键决策都与 2024–2026 的获奖数据和开源实践**同向**，无一条需要推翻：

| 已有决策 | 外部验证 |
|---|---|
| 容器定位 + 保守 IA + 交互装置 hero | Cassie Evans（SVG 装置 hero + 完全常规导航）、Antoine Wodniack（Awwwards SOTD + Webby：炫技 hero + 简历级 IA）——「装置负责人格与技术信号，导航负责效率」是获奖数据里唯一同时满足评委与 30 秒评审的构型 |
| 四项目对等的纯文字索引 | p5aholic.me（Awwwards HM）：项目列表即文字行，去缩略图化反而显得项目地位对等 |
| 零内容层库（gray-matter + zod） | Contentlayer 已死（维护者弃坑、Dub 被迫迁移）；leerob 个人站重写到「连 frontmatter 都不要」；Magic UI 模板收敛到纯 TS 对象。2026 共识：内容层依赖越薄越好 |
| 纸白 + 工程图纸美学 | blueprint 制图美学回潮（2025–26 趋势）；U.S. Graphics 是活样本。警示：题栏字段必须真实，否则是贴皮 |
| 动效克制条款 | Awwwards 评审语言转向「purposeful / restraint」；Roman Jean-Elie 公开砍特效后拿 SOTD |
| 多路由（非单页 hash） | case study 需独立 URL 供 PDF/CV 直链——体验派单页是明确反模式 |

建议全部是**增补与校准**。价值最高的三个增量：① 教学演示外壳（Demo 组件语法，S2/M3 后）；② 图注/题栏语法（内容期给用户当写作模板）；③ S4 工程标配的具体做法（OG/JSON-LD/对比度/字体）。

## 二、代码 review 发现（现状问题清单）

1. **graphite 对比度不达 AA**：`--graphite #8A8A82` 在 `--paper #FAFAF7` 上约 3.3:1（WCAG 小字要求 4.5:1），而它承担了大量阅读性小字（summary、figcaption、meta rail）。加深到 `#70706A` 附近（≈4.6:1）即过线——属 spec §8「数值可微调」范围。
2. **SlotSize 缺 `full` 档**：SITE_SPEC §8 定了图三档 inline/wide/full，`slots.tsx` 只实现了两档。补 `full`（`grid-column` 跨整内容区 + 负 margin 到 sheet 边）或改 spec 注明缓做。
3. **Tufte 边注体系只做了一半**：`.flow` 网格已预留 margin 列，但没有任何组件往里放内容（无 MarginNote/边注图注）。LAYOUT_NOTES 的核心卖点「图注与正文同视线高度」尚未兑现。
4. **`getAllWork()` 无缓存**：每页渲染中 generateStaticParams / generateMetadata / page 各自重新读盘+解析+校验。构建期无碍，dev 慢。包一层 React `cache()` 即可。
5. **正文链接无可供性**：`a { color: inherit }` 且无下划线约定——prose 里的链接与正文无区分。编辑风惯例是正文链接保留下划线（获奖极简站普遍如此）。
6. **无 skip-link / focus-visible 样式**：键盘用户体验缺口，几行 CSS 的事。
7. **about 页 h1 语义错位**：h1 被样式成 10px mono 标签——读屏/SEO 层级混乱。标签用 p/div，真 h1 另设或视觉隐藏。
8. **case study 页是死端**：结尾无「next project」链——评审读完一篇没有去处（调研共识：结尾必须给下一站）。
9. **视频将来需字幕轨**：评审可能静音看；60s 视频落位时 `<track>` 字幕同产（GSD 侧同一素材复用）。
10. metadata 占位（title "Portfolio"、无 metadataBase/OG）——S4 已排，不新增。

## 三、架构建议（Next.js / 内容工程）

1. **内容层维持零库**，不引 Velite/content-collections（两者在 Next 16 默认 Turbopack 下都是绕行方案），更不碰 Contentlayer 系。现有方案就是 2026 收敛点。
2. **S4 的 OG 图**：用文件约定 `opengraph-image.tsx` + `ImageResponse`，项目页动态传 title。**Satori 三条铁律**：只支持 flexbox（每个容器显式 `display:flex`）；不支持的 CSS 静默忽略（grid/calc/CSS 变量）；SVG 仅子集——**连杆图进 OG 一律先预渲染成 PNG 再嵌**。别复用站内 Tailwind 组件渲 OG。
3. **JSON-LD**：about/首页嵌 `Person`，项目页嵌 `CreativeWork`——内联 `<script type="application/ld+json">`，照抄 vercel/examples blog 的零依赖做法。sitemap/robots 走 `app/sitemap.ts` / `app/robots.ts` 文件约定。
4. **交互组件组织**（S2 挂 LinkageFigure 时）：per-project 组件目录（samuelkraft 的 `components/projects/*` 式）+ 重组件在 client 包装器内 `next/dynamic` 懒加载（Next 15+ `ssr:false` 只能写在 client 组件里）。LinkageFigure 的 React 封装层即 island 边界——与 SITE_SPEC §7 的 hydration 论证兼容（首屏直出不变，懒加载只用于非首屏交互件）。
5. **插槽保持窄接口**（props 传数据不传 JSX）——MDX 大版本升级税与嵌入组件复杂度成正比（Josh Comeau 亲历 v1→v3）。现有 slots 已合规，守住。
6. **colophon（"这个站怎么做的"）**：p5aholic 用 FAQ 页讲技术决策，成为其技术证据；对「求解器实现者」叙事同构，且是 AI 披露的自然落点。建议做成 **about 页一段**而非新路由（控范围）。→ **需拍板**。
7. 仓库将来若部分开源：antfu 的许可分层（代码 MIT / 文字图片 CC BY-NC-SA）。低优先级备忘。

## 四、UI 设计建议

1. **题栏字段真实化**：FigSlot 落材料时题栏加真实字段（日期/参数/版本），图注承担论证。U.S. Graphics 的警示：blueprint 美学正在流行，也正在被贴皮滥用——字段真实是与装饰性模仿拉开差距的唯一方式。恰好连杆题栏本来就有真参数可标。
2. **图注语法模板**（内容期给用户，模型不代写）：科学图注规范三段式——**陈述句结论 +看图方法（符号/颜色定义）+ 条件（样本量/容差）**，图注自足、不回正文也能读懂。题栏管档案性，图注管论证性。
3. **字体 → 需拍板**：现系统栈里 Iowan Old Style / Songti SC 都是 Apple 生态字体，Windows/Linux 评审机上 serif 表现不可控（落到 Palatino Linotype 尚可，但不保证）。调研共识：`next/font/local` + 单个可变 woff2 自托管、子集化、总预算 <100KB、`adjustFontFallback` 防 CLS。这是 spec §8 修订级变更，且需选具体字体（如 Source Serif 4 类），不拍板不动。
4. graphite 加深（见发现 1）；正文链接下划线；focus-visible；skip-link。
5. **暗色模式维持不做**（v1 不做清单已列）——调研补充了理由：暗色适合动效 showreel，不适合图纸/研究图表阅读；这是有意识的取舍而非缺项，可在 colophon 一句带过。
6. 四项目索引保持纯文字行，**不加缩略图等级差**（「一大三小」卡片是四项目对等的隐形杀手）。

## 五、动效设计建议

**基线：纯 CSS + 零新依赖。不引 GSAP**（2025 起全免费也不引——它的强项滚动剧场恰是本站明确不做的）。**Motion（原 framer-motion）只在未来确有 exit/layout 动画需求时按 LazyMotion + `m` 组件引入**（~4.6KB 起）。**View Transitions 不启用**：React `<ViewTransition>` 仍 canary，Next 16 flag 官方标注不建议生产——申请季的站不押实验特性；页面转场默认「无转场」。

**与克制条款的关系（诚实说明）**：调研给出的「入场淡入/stagger」语法表与 SITE_SPEC §1「没有入场动画」正面冲突——**默认从 spec，不做**。唯一建议放宽的最小集是 **hover/active 状态反馈**（链接下划线过渡、项目行 hover、`:active` scale 0.97；150–200ms ease；`@media (hover:hover) and (pointer:fine)` 门控）——这属于「状态反馈」不属于「表演」，且 Emil Kowalski 准则（高频交互零动效、<300ms、永不 ease-in）背书。→ **需拍板**：放宽与否都成立，克制到零也是成立的立场。

**教学演示外壳 = 最高优先的动效投资**（S2 挂 FIG.12 时设计，站点侧包装层，**不动连杆内核、不违反封盘**）：

- 统一 Demo 外壳组件（Josh Comeau `<Demo>` 模式）：题栏 + 播放/暂停 + scrubber + 重置按钮的固定槽位；
- Ciechanowski 控件纪律：**每个控件只隔离一个变量**；滑块永远在图正下方；scrubber 零延迟直驱状态（不是触发动画）；跨图颜色编码一致；
- 叙事「问题先行」：正文先抛失效，交互再演示解法——让机构显得必要而非装饰；
- 全部直驱现有 `LinkageController` / solver，rAF 循环现成，**零动画库**；
- 补 Ciechanowski 自己没做的：slider 可聚焦、键盘可操作（他的 `<div>` slider 是公开被点名的 a11y 短板，抄语法别抄这个坑）。

**reduced-motion 纪律**：reduce ≠ remove——保留 opacity/颜色过渡，砍 transform 位移与自动播放；教学演示改默认暂停 + 手动播放；**拖拽交互保留**（用户主导的直接操纵不是前庭刺激源）；释放后自转阻尼在 reduce 下停用或大幅缩短。controller 现有处理（初始 idle、拖拽可用）与此同向。

**性能红线**：只动 transform/opacity；禁 `transition: all`；`will-change` 用完即清；SVG 内部持续动画走 rAF 直改 attribute（solver 已是此模式），不走 CSS transition（部分浏览器不上合成器）。

## 六、case study 呈现层建议

1. **交互主语法 = 手动 scrubber，不做 scrollytelling**。NN/g 实证：滚动触发文字动画拖慢阅读与找信息；Bostock 五律（滚动必须快速/增量/可逆，禁劫持，不破坏键盘滚动）。阅读节奏与操作节奏解耦，读者反复来回观察机构运动——scrubber 是唯一支持「回头看」的语法。
2. **FIG 静帧序列是 PDF 双轨的唯一同构语法**——与 SITE_SPEC §6 完全一致，外部数据再次确认：CMU SoA 主件是 25–30 页 PDF，网页上的每个论证单元必须能降解为「静帧 + 自足图注」。
3. **「1 分钟版本」纪律**：MHCI 录取者的 Analytics 个案：评审每项目页均停留约 1 分钟。每页首屏必须独立成立：标题 + 首图 + 结论。交互文章是给愿意停 20 分钟的人的第二层。UW 官方原文同向："Limit the amount of text… images should do most of the work"——对非母语作者，**图注句（一句一断言）代替段落散文**既是安全线也是策略线。
4. **过程图纪律**：每张过程图的图注必须说明**它改变了什么决策**——不许无注解草图墙（HCI 侧要过程，纯艺侧警告堆过程，取中的守则就是这条）。ProcessAside 已有席位，落材料时执行。
5. **补「next project」尾链** + MetaRail 加图索引（LAYOUT_NOTES 已设想）。
6. **MarginNote 边注组件**：details-on-demand 的载体（术语注释、小图、图注入边缘列）——正文短句化、深度进注释层，对非母语写作特别有利。移动端 hover 需 tap 等价物。
7. **预测-再揭示**（You Draw It 模式）用于「耦合曲线不是圆」的反直觉时刻——低成本高回报，但属于交互文章设计增项：**记入 IDEAS，不进当前范围**。

## 七、反模式黑名单（研究背书，防将来手痒）

加载门/横屏门/教程层（评审 30 秒，任何进站阻拦是净损失）· 单页 hash 路由 · WebGL 滚动剧场/场景即导航 · 暗色沉浸整站 · 光标替换/磁吸按钮/3D tilt · 收集品游戏化 · 年年重做文化（取其版本意识：封盘=v1 完成）· 按 star 找参考（高星仓库系统性偏向已死技术栈，bchiang7/v4 是 2018 Gatsby）· UI 弹簧 bounce>0.3 · `transition: all` · 为交互而交互（Magic Ink 否决标准：一张标注好的静态图能回答的问题，不让读者去拖）。

## 八、优先级与分工（默认前提不变：TOEFL > 一切作品集工作）

| 建议 | 时机 | 执行者 |
|---|---|---|
| graphite 对比度微调、正文链接下划线、focus-visible、skip-link、about h1 语义、`getAllWork` 缓存、SlotSize 补 full、next-project 尾链 | 随时（合计约 1–2 小时） | 弱模型 |
| S4 全套：OG（Satori 纪律）、sitemap/robots、JSON-LD、check-links、metadata | 按 spec 节奏（≤09 中） | 弱模型 |
| MarginNote 边注组件 | 内容期前 | 弱模型 |
| Demo 教学外壳（控件纪律 + a11y） | S2 / M3 后挂 FIG.12 时 | 强模型出规格，弱模型可实现 |
| 图注三段式模板 + 题栏字段真实化 | 内容期（用户写图注） | 用户（模板留席位） |
| 字体自托管换栈（spec 修订级） | **需拍板** | 拍板后弱模型 |
| hover/active 微反馈是否放宽克制条款 | **需拍板** | 拍板后弱模型 |
| colophon 段（about 页内） | **需拍板** | — |
| 预测-再揭示交互 | 记 IDEAS，不做 | — |

## 九、弱模型工单（§八第一行的展开——随时可派，合计约 1–2 小时）

**前置纪律**：不动 `src/lib/linkage/`；不动 Vite 台架；完成后 `npm run build` + `typecheck` + 全部测试绿，一次 commit，message 注明「SITE_REVIEW §九 工单」。
**2026-07-10 更新**：原「三项待拍板」已全部拍板通过并写入 SITE_SPEC（§1 克制条款、§4 about、§8 字体）——对应新增工单 9–11。

1. **graphite 加深**：`app/globals.css` 的 `--graphite: #8a8a82` 改到 `#70706a` 量级。验收：与 `--paper #FAFAF7` 对比度 ≥ 4.5:1；grep 确认全站无别处硬编码旧值。
2. **正文链接下划线**：globals.css 给 `.flow` / `.prose-col` 内的 a 加 `text-decoration: underline` + `text-underline-offset: 0.15em`。导航、题栏、图纸清单行维持 no-underline。hover 过渡见第 9 条。
3. **focus-visible + skip-link**：全局 `:focus-visible { outline: 2px solid var(--trace-blue); outline-offset: 2px }`；`app/layout.tsx` body 首子元素加视觉隐藏、聚焦显形的「Skip to content」链接，`<main>` 加对应 id。
4. **about 页 h1 语义**：`app/about/page.tsx` 的 10px mono 标签改为非标题元素；真实 h1 另设（字号不小于正文）。
5. **`getAllWork()` 缓存**：`src/lib/site/content.ts` 用 React `cache()` 包裹。验收：行为不变、build 过。
6. **SlotSize 补 `full` 档**：`slots.tsx` 类型加 `'full'`，globals.css 加 `.fig-full`——≥1024px 时跨 `prose-start/margin-end` 并以负 margin（`-260px - 56px`）延伸到画布左边。**限制写进组件注释**：full 图会横越粘性 rail 列，只允许用于页首/页尾横幅位（与 rail 同读的图用 wide）。
7. **next-project 尾链**：`app/work/[slug]/page.tsx` 按 selected 的 order 计算下一个 published 条目（末尾回绕到第一个），在 `DisclosureSlot` 后渲染 `hairline-t` 分隔的 mono 行「NEXT → 标题」。验收：每个 published 页有去处、不指向 draft。
8. **备忘（素材期执行，现在不做）**：VideoSlot 的 `video.src` 落位时同步加 `<track kind="captions">` 字幕轨（评审可能静音看；GSD 60s 素材同源复用）。
9. **hover/active 微反馈**（已拍板，SITE_SPEC §1 修订）：正文链接下划线颜色/offset 过渡；首页项目索引行 hover（题字或背景色过渡）；可点击元素 `:active` scale(0.97)。150–200ms ease；hover 全部包 `@media (hover:hover) and (pointer:fine)`；逐属性声明、禁 `transition: all`。验收：触屏无 hover 残留、键盘 focus 与 hover 表现互不干扰。
10. **字体自托管**（已拍板，SITE_SPEC §8 修订）：Source Serif 4 Variable——官方仓库取可变字体、转 woff2、latin 子集；`next/font/local` 接入正文 serif，`display: 'swap'`，回退栈保留原 serif 栈；mono 维持 `ui-monospace` 不动。验收：woff2 <100KB、CLS 仍为 0、Windows 浏览器实测正文渲染与 mac 一致。
11. **about 页 colophon 席位**（已拍板，SITE_SPEC §4 修订）：about 页加 COLOPHON 小节席位（IntentNote 占位：技术栈 / 自研 PBD 求解器 / 性能与无障碍决策——正文作者写），置于 AI 披露席位之前。

S4 项（OG/sitemap/robots/JSON-LD/check-links）不在本工单——按 spec §10 节奏执行，做法见本文 §三（尤其 Satori 三条铁律）。

---

# 附录 A：获奖作品集网站调研（agent 原文）

## A. 具体案例（15 个）

### 第一组：交互 hero / creative developer 获奖站

**1. Bruno Simon — bruno-simon.com**（Awwwards SOTD 2026-01 + Portfolio Honors + Developer Award；初版曾获 FWA、CSSDA Website of the Year）
交互 hero 的原型级案例：开车逛 3D 世界即整站导航，2025 年底重制版换上 WebGPU。可提取的反面教训比正面更多——它是「hero 即整站」的极端，导航效率完全让位于体验，靠作者的圈内声望兜底。普通申请者复制这个模式=招生官找不到项目。

**2. Roman Jean-Elie「Portfolio '25」— romanjeanelie.com**（Awwwards SOTD；Codrops 2025-11 有完整制作复盘）
最有价值的是他公开的克制论：「真正的突破来自于用好已有的东西，而不是继续加」——与视觉方向冲突的复杂特效被主动砍掉。技术上用 hash 路由把五个分区收进单页、区块间 crossfade 过渡。可提取模式：交互装置服务于叙事弧线，而不是并列的技能展示。

**3. Antoine Wodniack — wodniack.dev**（Awwwards SOTD 2024-12 + Developer Award；2025 Webby「Best Home Page」）
生成艺术/笔式绘图机美学 + 极简锚点导航（About/Work/Contact 三项）+ 编号网格列项目（#0000/34）。它证明「炫技的 hero」和「无聊到可靠的导航」可以共存：视觉记忆点全在生成图形与动效细节上，信息架构本身保守得像简历。还带对比度调节开关（无障碍加分）。

**4. Keita Yamada — p5aholic.me**（Awwwards Honorable Mention，日本极简派代表）
WebGL 动态背景 + 纯文本 IA 的教科书：项目列表就是一行行「项目名 — 日期 / 角色 / 合作者」的文字，无缩略图；提供 Light/Dark/Monospaced 三种模式；专设 FAQ 页讲解网站怎么造的（技术栈、决策）。可提取模式：**用文档化的「这个站怎么做的」页面本身当技术证据**——与教学义务高度同构。

**5. Tomasz Szmajda — itomdev.com**（多平台收录，2025 盘点常客；也在 minimal.gallery 精选池）
2D 纸面「撕开」进入 3D 走廊的强奇观 hero，但工程纪律公开：基于 FPS 的动态画质降级、专门的无障碍覆盖层。可提取模式：**炫技必须附带可见的工程兜底**，性能与可访问性做成展示点而非隐藏成本。

**6. Pacôme Pertant — pacomepertant.com**（Awwwards SOTD 2026-06 + Developer Award）
巴黎动效/声音设计师，暗色沉浸 + 3D showreel 玩法 + 交互式项目视图。典型的「作品即媒介」型：他卖的就是动效，所以站本身必须是 demo。参照价值：判断「站=作品 demo」这条路的成立前提——连杆机构恰好满足（自研求解器本身就是四项目之一的证据）。

**7. Xianyao Wei — weisdevice.xyz**（2025 三方盘点收录）
交互式小岛 + 机器人，被特别指出「性能优化 + 工程决策有文档」。作为学生/新人级别的参照：交互 3D hero 不靠体量取胜，靠把决策讲清楚取胜。

### 第二组：Design engineer 极简「容器」站（多为业内公认标杆而非奖项站——这类人不投奖）

**8. Rauno Freiberg — rauno.me**（Vercel design engineer，被 ui.land/craftwork/killerportfolio 多方收录）
操作系统隐喻（dock、界面音效、暗色模式），但真正被业内引用的是 **rauno.me/craft**：一页密集的交互细节实验集，每条几秒即可感知。可提取模式：把「手感证据」集中成一个可扫读的 craft 页，比散在各处更有杀伤力——连杆阻尼/衔接论证可借鉴这种「细节即论点」的陈列法。

**9. Emil Kowalski — emilkowal.ski**（Linear design engineer，前 Vercel）
纯文本容器：身份一句话 + 项目即产品清单（Sonner、Vaul、animations.dev）+ 文章列表。他的公开动效准则（UI 动画 <300ms、自定义缓动曲线、感知性能优先）本身就是行业教材。可提取模式：**站的克制程度与作者的动效权威成正比**——微交互只出现在被触碰的地方。

**10. Benji Taylor — benji.org**（SpaceX 设计负责人；实际抓取验证）
极限容器：简介 + 履历时间线 + 作品以链接形式嵌入 + 按时间排的写作列表 + 页脚本地时间钟。零图片轰炸，「克制本身即品味声明」。这是「网站=CV 上的一个链接」定位的最纯实现。

**11. Cassie Evans — cassie.codes**（GSAP 团队，SVG 动画权威）
**最直接同构的案例**：hero 是一幅手绘 SVG 交互场景（桌面、显示器、台灯，元素可动可玩），配一句「I like making fun, interactive things with code」，下面的导航却完全常规（writing/speaking/workshop/playing）。证明「SVG 交互装置 hero + 保守导航」是一条被验证过的路：装置负责人格与技术信号，导航负责效率。

### 第三组：编辑排版 / 设计师获奖站

**12. Elliott Mangham — elliott.mangham.dev**（Awwwards SOTD 2025-12 + Developer Award；个人累计 9 次 SOTD）
被 Mindsparkle/Awwwards 评价为「clean、bold visuals、thoughtful simplicity」——创意开发者用编辑式克制拿 SOTD 的近期证据：大字排版 + 干净留白也能赢奖，不必上 WebGL。

**13. Olha Lazarieva — olhalazarieva.com**（Awwwards SOTD 2025-10 + Developer Award）
创意设计师个人站，2025 年获奖的女性设计师编辑风代表。与 Gianluca Gradogna（gianlucagradogna.com，SOTD 2025-01）并列可看：后者实测抓取时先出「请旋转设备」+ 加载计数器——**加载门与横屏门是这类站的通病，对「容器」定位是明确反模式**。

**14. Grégory Lallé — gregorylalle.com**（Awwwards SOTD 2024-10 + Developer Award）
法系 creative developer 的年度版号习惯（'24）：把个人站当年度作品迭代、旧版存档。可提取模式：站有版本意识——与「封盘不加功能」的纪律天然契合，封盘即「v1 完成」。

**15. minimal.gallery 精选池（横切参照）— minimal.gallery/tag/portfolio**
实抓的当期个人站精选：ma5a.com（Masahito Leo Takeuchi）、willphan.com、tayte.co、anatoly.design、itomdev.com 等。这个池子代表「非奖项赛道」的口味基准：白底/纸感、单栏窄测宽、无 loading、大量文字链。适合作为排版对标池（比 Awwwards 池更贴近「容器」定位）。

## B. 模式总结：获奖站的共性规律

**IA（信息架构）**
- 两极分化清晰：**体验派**（单页 hash 路由、场景即导航）与**容器派**（多路由、文本索引），2024–2026 中间地带在消失。容器派的共识结构：一句话身份 → 项目索引（同等地位列表/网格）→ about/contact，三层封顶。
- 项目索引普遍**去缩略图化或弱缩略图化**（p5aholic 纯文字行、wodniack 编号网格）——用编号/日期/角色元数据代替视觉诱饵，反而显得项目地位对等。
- 「这个站怎么做的」正在成为标准页（p5aholic 的 FAQ、Roman Jean-Elie 的 Codrops 复盘、itomdev 的工程决策文档）——对 developer/engineer 身份，**building in public 是信任货币**。

**Hero**
- 获奖交互 hero 的共同点不是复杂度，而是**三件兜底**：① 即时可玩（无教程，1 秒内有反馈）；② 有跳过/降级路径（性能降级、无障碍层、reduced-motion）；③ 导航不依赖它——装置坏了站还能用。
- 克制成为叙事卖点：Roman Jean-Elie 公开砍特效、Awwwards 评审语言转向「purposeful」「restraint」。「为什么做这个交互」比「做了什么交互」更被表彰。

**导航**
- 极简持续导航（3–5 项锚点或路由）+ 页脚重复导航是默认。sticky header 在长 case study 页几乎必配（有可用性研究称持续头部让导航提速约 22%，来源为三方博客，置信度中等）。
- Case study 页的成熟模式：**为略读设计**——招生官/招聘方不读只扫，所以段落短、小节标题自明、图注承担论证；长页配 sticky 目录或进度指示；页首放元数据块（角色/年份/技术栈/合作者）；大图全出血、正文窄栏（60–75 字符行长）交替形成节奏；结尾放「下一个项目」链避免死端。

**排版**
- 2025–2026 双主流：① 新怪诞 sans（Inter/Graphik/Host Grotesk 类）打底的瑞士式极简；② serif 回潮的编辑风（大号衬线标题 + sans 正文）。工程师身份站第三条路明显：**等宽字体作身份信号**（p5aholic 的 Mono 模式、代码式编号）。
- 通用手法：超大显示字号（vw 级）+ 极小 meta 字号（10–12px 大写字母间距拉开）的两极对比，中间层级尽量少。

**色彩**
- WebGL 沉浸派几乎全暗色；编辑/容器派几乎全纸白/暖灰，**单一强调色或零强调色**。共同点是把彩色的权利让给作品图。暗色模式在 design engineer 站是标配（rauno、p5aholic），在设计师编辑站反而少见。

## C. 适配性备注（针对「容器型、四项目对等、hero=物理机构」）

**明确适合、建议吸收：**
1. **Cassie Evans 模式**是直系模板：SVG 交互装置 hero + 一句话身份 + 完全常规的导航。她证明了装置只需负责「这人能做出这个」的信号，不必承担导航。连杆机构比她的插画场景论证力更强（自研求解器 vs 装饰动画）。
2. **p5aholic 的纯文字项目索引**：四项目同等地位最干净的实现就是等权重文字行（项目名—年份—角色—一句话），拒绝「一个大卡 + 三个小卡」的视觉等级。
3. **rauno.me/craft 的细节陈列法**：Session 4 的阻尼/衔接论证（手感即论点）适合在轮回机器 case study 内做成密集的「可感知细节」段，短交互 + 短说明并置，而不是长文解释。
4. **itomdev 的工程兜底展示**：把性能降级、触屏适配、reduced-motion 写进 FIG 题注或 process aside——已有真机触屏手测记录，这是可以直接展示的材料。
5. **Case study 略读优先结构**：sticky 目录/进度指示、页首元数据块、图注承担论证、结尾「下一项目」链——与已建的八段骨架 + FigSlot 体系兼容，成本低。
6. **排版**：新怪诞 sans 打底 + 等宽字体做编号/参数/FIG 题栏（呼应工程制图气质），纸白底色把颜色让给项目图。与 LAYOUT_NOTES 的行长恒定网格方向一致。
7. **「站怎么做的」页/段**：连杆求解器的构建笔记（约束投影、收敛）以 p5aholic FAQ 的形态出现，恰好覆盖教学义务和 AI 披露的落点。

**明确不适合、建议排除：**
1. **WebGL 滚动剧场 / 场景即导航**（bruno-simon、pacomepertant、sebastien-lempens 类）：与「容器 + PDF 为主体」定位正面冲突，且申请评审场景下导航效率一票否决。
2. **加载门 / 横屏门 / 教程层**（gianlucagradogna 的「请旋转设备」+ loading 计数）：招生官可能只给 30 秒，任何进站阻拦都是净损失。hero 机构必须秒开、SVG 首屏直出（SSR + 轻量 SVG 天然占优）。
3. **单页 hash 路由**（romanjeanelie）：四个 case study 需要独立 URL 供 PDF/CV/邮件直链引用，App Router 的多路由是对的，别被单页体验派带偏。
4. **收集品/游戏化导航**（thibault-introvigne 的隐藏收集物）：趣味成本高且与「求解器实现者」的严肃工程叙事错位。
5. **年度重做文化**（gregorylalle 的 '24 版号）：对 freelance 是营销，对申请者是无底洞——与「封盘」纪律冲突，仅取其「版本意识」不取其「年年重写」。
6. **暗色沉浸整站**：暗色适合动效 showreel，不适合以图纸、示意图、研究图表为主的 case study 图证阅读；若要暗色，做成模式切换而非默认。

**一条横向判断**：2024–2026 获奖数据里，「交互装置 + 保守 IA」的组合（wodniack、cassie）拿奖和口碑都不输纯剧场派，且是唯一同时满足「评委惊艳」与「招生官 30 秒找到项目」的构型——现有「hero 是门不是神龛」决策与获奖数据同向。

Sources: [Awwwards Portfolio Winners](https://www.awwwards.com/websites/winner_category_portfolio/) · [Codrops: Roman Jean-Elie WebGL Portfolio 复盘](https://tympanus.net/codrops/2025/11/27/letting-the-creative-process-shape-a-webgl-portfolio/) · [CreativeDevJobs: Best Three.js Portfolios](https://www.creativedevjobs.com/blog/best-threejs-portfolio-examples-2025) · [minimal.gallery portfolio 池](https://minimal.gallery/tag/portfolio/) · [rauno.me](https://rauno.me/) · [emilkowal.ski](https://emilkowal.ski/) · [benji.org](https://benji.org/) · [cassie.codes](https://www.cassie.codes/) · [p5aholic.me](https://p5aholic.me/) · [wodniack.dev](https://wodniack.dev/) · [bruno-simon.com SOTD](https://www.awwwards.com/sites/brunos-portfolio) · [Fontfabric 2025 字体趋势](https://www.fontfabric.com/blog/top-typography-trends-2025/) · [The Crit: 作品集字体配对](https://thecrit.co/resources/best-font-pairings-portfolio)

---

# 附录 B：GitHub 开源作品集架构调研（agent 原文）

## A. 仓库/站点清单（已逐一验证 2026-07 现状）

**1. leerob/next-mdx-blog** — https://github.com/leerob/next-mdx-blog（7.6k★，2026-06 仍在更新）
leerob 个人站的公开形态，已经历「激进极简」重写：整个仓库只有 `app/page.mdx`、`app/n/1/page.mdx`（文章即 MDX 路由页）、`mdx-components.tsx`、`app/sitemap.ts`——**零内容层库**，frontmatter 都不要了，文章排序靠目录编号。这是 2025-2026「内容层退潮」的极端样本：当内容量少且作者即开发者时，MDX 直接当页面比任何 content SDK 都稳。
可借鉴：`mdx-components.tsx` 全局组件映射；把 MDX 文件本身当 App Router 页面而非数据。

**2. Vercel Portfolio Starter Kit（leerob 旧站的官方模板化）** — https://github.com/vercel/examples/tree/main/solutions/blog
「标配四件套」的最小正确实现，全部用 Next.js 文件约定、零第三方库：
- `app/blog/utils.ts`：手写 frontmatter 解析（正则切 `---`），不用 gray-matter；
- `app/og/route.tsx`：`ImageResponse` + `tw` prop 动态 OG，`?title=` 传参；
- `app/rss/route.ts`：Route Handler 手拼 XML；`app/sitemap.ts`、`app/robots.ts`；
- `app/blog/[slug]/page.tsx`：`generateMetadata`（OG/twitter card 回退到 `/og?title=`）+ 内联 `<script type="application/ld+json">` 输出 BlogPosting JSON-LD。
可借鉴：对四项目固定结构的站，这套「文件约定 + 手写」就是 2026 稳妥基线，不需要 pliny/feed 之类。

**3. timlrx/tailwind-nextjs-starter-blog** — https://github.com/timlrx/tailwind-nextjs-starter-blog（10.5k★，v2.4.0 2025-03）
反方向的「全家桶」极：App Router + RSC + **Contentlayer2（作者自己维护的社区 fork）** + pliny（RSS/sitemap/analytics/评论）。首屏 JS 85kB、近满分 Lighthouse。
可借鉴：server-side Shiki 高亮（零客户端 JS）、pliny 里 RSS/sitemap 的实现可抄思路；但它绑死 Contentlayer2，依赖单人维护，不建议整体采用。

**4. MaximeHeckel/blog.maximeheckel.com** — https://github.com/MaximeHeckel/blog.maximeheckel.com（726★）
**交互式文章组件组织的最佳公开范本**（他的 WebGL/shader 文章以交互 demo 著称）：`content/*.mdx` 纯内容 + `core/components/` 按能力分组件目录——`Code/`（静态 CodeBlock + `Sandpack.tsx` 在线运行）、`ClientOnly.tsx`（客户端 island 包装器）、`BeforeAfterImage/`、`Charts/LineChart.tsx`、`Fullbleed/`（通栏图）、`Footnotes/`、`DynamicTOC/`（IntersectionObserver 高亮）。设计系统抽成独立 npm 包 `@maximeheckel/design-system`。
可借鉴：FigSlot 类插槽系统的「实弹版」——每个 MDX 可嵌组件都是独立目录（组件+styles+types+index），配 `ClientOnly` 包装。注意：他的样式栈 Stitches 已停维护，属反面教材（见 C）。

**5. Josh Comeau《How I Built My Blog v2》**（站不开源，架构自述极详尽）— https://www.joshwcomeau.com/blog/how-i-built-my-blog-v2/
Next.js App Router + MDX v3（next-mdx-remote）+ Shiki（RSC 内静态高亮，"0kb JS"）+ Sandpack 交互 playground + Linaria。关键做法：framer-motion 经 `next/dynamic` 懒加载（44.6kb 不进主包）；交互重组件全部是 client island，静态内容全走 RSC；View Transitions 作为渐进增强做路由过渡。他的坑清单是全网最诚实的（见 C）。

**6. samuelkraft/samuelkraft-next** — https://github.com/samuelkraft/samuelkraft-next（481★，2026-04 有 push）
可借鉴的目录法：`components/blog/`（**按文章放专属交互组件**：parallax、messages 动画等，MDXComponents.tsx 统一映射）+ `components/projects/*Graphic.tsx`（**每个项目一个专属 hero 图形组件**）。对「四项目、每项目有专属交互证据」的站，这个「per-project graphic + per-post widget」分法比通用组件库更贴。

**7. dillionverma/portfolio（Magic UI 官方模板）** — https://github.com/dillionverma/portfolio
Next.js 14 + shadcn/ui + Magic UI + Tailwind + Framer Motion。核心选型：**全站内容集中在单个 `src/data/resume.tsx` TS 对象**，博客才用 MDX。验证了「纯 TS 对象做结构化内容 + MDX 只留给长文」的分工——与现有 zod 内容池同构。

**8. antfu.me** — https://github.com/antfu/antfu.me（Vue/Vite/UnoCSS，Markdown 占仓库 76.8%）
非 Next 但值得看内容组织：文章即 markdown 页面、`data/` 放结构化数据、`photos/` 独立、构建脚本在 `scripts/`。代码 MIT、**文字与图片 CC BY-NC-SA 双许可**——作品集仓库开源时的许可分层做法值得直接抄。

**9. onur.dev** — https://github.com/suyalcinkaya/onur.dev（2.3k★）
「CMS 极」样本：Next.js + shadcn/ui + **Contentful 当内容层** + Supabase + Raindrop（书签）。所有动态内容预渲染为静态页。对单人作品集是过度架构，但展示了「内容不在仓库里」这一极的完整做法。

**10. bchiang7/v4** — https://github.com/bchiang7/v4（8.3k★，Gatsby + styled-components，2024 后基本停更；无公开 v5）
技术栈已过时，**只在设计/信息架构层面借鉴**（单页分区、项目卡片、featured/other 两级项目列表——和「selected 恒 4」的分层思路一致）。别抄栈。

**11. cristicretu/cretu.dev** — https://github.com/cristicretu/cretu.dev（275★，2026-06 活跃）
数据点：**从 Next.js 迁到了 Astro**（`src/content/writing/` + content collections + zod schema）。个人站圈 2024-2026 有一支「内容为主就去 Astro」的迁移流；本站主打交互组件，不适用，但说明内容层选型要按「交互密度」分岔。

**12. rauno.me / paco.me / emilkowal.ski** — 现状：rauno.me 站本体不开源，但 https://github.com/raunofreiberg/interfaces（交互细节清单）和付费站 devouringdetails.com（原型带可下载源码）是交互打磨的参照；pacocoursey/paco 已归档（2022，Next.js + CSS Modules，声明可随意 fork）；Emil Kowalski 个人站不开源（只开源 sonner/vaul）。**结论：交互最顶尖的一批个人站恰恰不开源，架构要从 4/5/6 学。**

## B. 2026 技术选型稳妥默认值（针对 Next.js 16 + Vercel + 已有 zod 内容池）

| 领域 | 稳妥默认 | 理由/备注 |
|---|---|---|
| 内容层（结构化数据） | **保持现状：纯 TS 对象 + zod，不引库** | magicui 模板和 leerob 极简重写共同收敛的方向；4 个项目的量级引入 content SDK 是负资产 |
| 内容层（如需长文 MDX） | 首选 **`@next/mdx` MDX 即页面路由**（leerob 式）；要 frontmatter 校验再上 **content-collections**（1.2k★活跃，Dub 生产迁移背书，zod schema） | **Next 16 默认 Turbopack 是硬约束**：Velite 的 VeliteWebpackPlugin 和 `withContentCollections` 都基于 webpack；Velite 官方给的出路是 next.config 里调编程 API，content-collections 给的是 CLI `watch` + concurrently。两者都能跑但都是绕行——能不加就不加 |
| 不要选 | Contentlayer（弃维护，维护者自述每月一天）、Contentlayer2（单人 fork）、Stitches/Linaria 系 CSS-in-JS | 见 C |
| OG image | `next/og` `ImageResponse`，**文件约定 `opengraph-image.tsx` 每路由一张** + 项目页动态传参；字体用 ttf/otf 在 handler 内 fetch | Satori 约束：只支持 flexbox，**每个容器必须显式 `display:flex`**，无 grid/calc/CSS 变量，不支持的 CSS **静默忽略**；bundle 上限 500KB；连杆 SVG 若要进 OG 图，注意 Satori 只支持 SVG 子集，稳妥做法是预渲染成 PNG 嵌入 |
| sitemap/robots/RSS/JSON-LD | 全走文件约定：`app/sitemap.ts`、`app/robots.ts`、`app/rss/route.ts` 手拼 XML、页面内联 JSON-LD（作品集用 `Person` + 项目页 `CreativeWork`） | 照抄 vercel/examples solutions/blog，零依赖 |
| 字体 | `next/font/local` + **单个可变字体 woff2** + 子集化；`display: swap` + 自动 `adjustFontFallback`（size-adjust 防 CLS）；总字体预算 <100KB；追零 CLS 用 `optional` | 2025-2026 共识：只发 woff2、自托管、可变字体合并字重 |
| 图片 | `next/image` + **静态 import**（自动 blurDataURL 占位）+ 显式 `sizes`；LCP 图（hero）加 `priority`；案例页长图配 `overflow` 容器 | hero 是 SVG 机构，不走 next/image，LCP 关注 SVG 内联与水合时机即可 |
| 动效库 | **`motion`（framer-motion 已改名）+ `LazyMotion` + `m` 组件**：初始 ~4.6kb（全量 motion 组件 ~34kb）；只做 spring 可继续裸写或用 React Spring | Josh Comeau 的教训：motion 全量包务必 `next/dynamic` 或 LazyMotion |
| 路由过渡 | 保守：**shuding/next-view-transitions**（2.4k★，专为 App Router）；激进：Next.js `experimental.viewTransition`（文档 2026-04 更新，仍标注「不建议生产」） | 官方 flag 一年多未转正；作品集这种「必须不坏」的场景用社区库或干脆不用 |
| 交互 demo 组织 | 沿用现有插槽系统，落地时：InteractiveSlot 实体 = **client 组件包装器**（内部 `next/dynamic` 懒加载重组件；注意 Next 15+ `ssr:false` 只能写在 client 组件里）+ 每项目专属目录（samuelkraft 的 `components/projects/*` 式）+ `ClientOnly` 兜底（maximeheckel 式） | solver 已零依赖、框架分离，天然满足最佳实践；React 封装层就是 island 边界 |

## C. 反面教训（仓库亲历或作者公开自述）

1. **押注单公司赞助的内容层 = 押注该公司现金流。** Contentlayer 因 Stackbit 被 Netlify 收购断供而死，维护者公开表示只能每月投入一天；Dub 被迫整体迁移到 content-collections（https://dub.co/blog/content-collections）。delba.dev 曾是 Contentlayer 展示样板，其仓库 delbaoliveira/website 现已 404（转私有/删除）。**教训：内容层这种「可自己写 200 行替代」的东西，依赖越薄越好。**
2. **CSS-in-JS 编译方案连环坍塌。** Josh Comeau 选 Linaria 后自述「无法推荐」（报错不可读、且撞上 Next.js CSS 打包问题：全站加载 245kB CSS 实际只用 47kB）；maximeheckel 的 Stitches 也已停维护。2026 年个人站样式的幸存者是 Tailwind / CSS Modules / 原生 CSS。
3. **MDX 大版本迁移是真实成本。** Josh 自述 MDX v1→v3「相当受挫」，大量旧文手改。文章里嵌的自定义组件越多，MDX 升级税越重——插槽组件保持窄接口（props 只传数据不传 JSX）能降税。
4. **App Router 的 DX 代价要预算进去。** Josh 实测：dev server 启动 30-60s+（Pages Router 7-12s）、热更新 1-5s、偶发 92s 编译；架构升级后 Lighthouse 分数并没涨（88→88）。Turbopack 默认化（Next 16）缓解了这条，但也正是它杀死了 webpack 插件式内容层（Velite 插件在 `--turbopack` 下直接语法报错，官方 workaround 是退回 webpack 或改编程 API）。
5. **Shiki 高亮在构建期吃内存。** 多代码块页面曾把 Josh 的构建打出 Node OOM；客户端动态高亮要用轻量版 + `useDeferredValue`。案例页若嵌大量代码块，预算构建内存。
6. **Satori 静默失败。** OG 图布局坏了不报错——grid/calc/CSS 变量被无声忽略，排查全靠肉眼；别复用站内 Tailwind 组件去渲 OG，从零用内联 flex 写。
7. **点赞/计数别用 localStorage 当身份。** Josh 初版被刷，改为 IP+盐哈希、每用户上限 16 次。
8. **明星旧仓库 ≠ 现役实践。** bchiang7/v4（8.3k★）是 Gatsby+styled-components 的 2018 栈；paco.me 已归档并自我标注「过时」。按 star 排序找参考会系统性偏向已死的栈——本清单里 2026 年仍活跃演进的只有 leerob 模板、timlrx starter、maximeheckel、cretu.dev、onur.dev、antfu.me。
9. **交互最强的站选择闭源 + 把 demo 当产品卖**（rauno 的 Devouring Details、Emil 的动画课）。含义：交互连杆机构这类组件在开源作品集里稀缺，本身就是差异化资产，展示层（case study 页）比架构层更值得投入。

Sources: [Contentlayer 弃维护与替代品](https://www.wisp.blog/blog/contentlayer-has-been-abandoned-what-are-the-alternatives) · [Velite](https://github.com/zce/velite) · [Velite×Next.js 集成](https://velite.js.org/guide/with-nextjs) · [content-collections](https://github.com/sdorra/content-collections) · [content-collections CLI](https://www.content-collections.dev/docs/quickstart/cli) · [Dub 迁移记](https://dub.co/blog/content-collections) · [Fumadocs MDX](https://www.fumadocs.dev/docs/mdx) · [leerob/next-mdx-blog](https://github.com/leerob/next-mdx-blog) · [vercel/examples blog](https://github.com/vercel/examples/tree/main/solutions/blog) · [timlrx starter](https://github.com/timlrx/tailwind-nextjs-starter-blog) · [MaximeHeckel blog 仓库](https://github.com/MaximeHeckel/blog.maximeheckel.com) · [Josh Comeau v2](https://www.joshwcomeau.com/blog/how-i-built-my-blog-v2/) · [samuelkraft-next](https://github.com/samuelkraft/samuelkraft-next) · [dillionverma/portfolio](https://github.com/dillionverma/portfolio) · [antfu.me](https://github.com/antfu/antfu.me) · [onur.dev](https://github.com/suyalcinkaya/onur.dev) · [bchiang7/v4](https://github.com/bchiang7/v4) · [cretu.dev](https://github.com/cristicretu/cretu.dev) · [raunofreiberg/interfaces](https://github.com/raunofreiberg/interfaces) · [pacocoursey/paco](https://github.com/pacocoursey/paco) · [Next.js viewTransition 配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition) · [next-view-transitions](https://github.com/shuding/next-view-transitions) · [Vercel OG 文档](https://vercel.com/docs/og-image-generation) · [ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response) · [Satori OG 指南](https://ogfixer.com/blog/satori-og-image-guide) · [web.dev 字体最佳实践](https://web.dev/articles/font-best-practices) · [Motion 减包](https://motion.dev/docs/react-reduce-bundle-size) · [Motion 升级指南](https://motion.dev/docs/react-upgrade-guide) · [Next.js 16](https://nextjs.org/blog/next-16) · [Turbopack 配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack) · [Velite Next15 讨论](https://github.com/zce/velite/discussions/274)

---

# 附录 C：动效设计调研（agent 原文）

## A. 案例与出处（12 条）

1. **Bartosz Ciechanowski — ciechanow.ski**（《Gears》https://ciechanow.ski/gears/ 、《Mechanical Watch》https://ciechanow.ski/mechanical-watch/）——与本项目最直接相关。可提取原则：**默认自动播放 + 全局暂停按钮**（照顾分心/省电/无障碍）；**滑块永远放在图的正下方，且每个控件只隔离一个变量**（时间 scrubber / 参数滑块 / 视角拖拽 / 状态切换按钮，四类控件不混用）；**先孤立零件 → 最小装配 → 全系统**的渐进披露；**「问题先行」叙事**——正文先抛出失效（「指针转太快了」），交互图示再演示解法，让每个机构显得必要而非装饰；跨图**颜色编码一致**保持零件身份。全部手写 Canvas/WebGL，零框架——本身就是「求解器实现者」姿态的范本。

2. **Emil Kowalski — emilkowal.ski / animations.dev**（《Great Animations》https://emilkowal.ski/ui/great-animations ；其公开 skill 文件含全部数值：https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md）。可提取：UI 动效 **<300ms**；**永不 ease-in**；enter 用强 ease-out `cubic-bezier(0.23,1,0.32,1)`，在屏移动用 `cubic-bezier(0.77,0,0.175,1)`；**频率决定动效量**——每天用 100+ 次的交互零动效，键盘触发的操作零动效；exit 快于 enter；列表 stagger 间隔 **30–80ms**；hover 效果用 `@media (hover:hover) and (pointer:fine)` 门控。

3. **Rauno Freiberg — 《Invisible Details of Interaction Design》** https://rauno.me/craft/interaction-design 。可提取：**动量传递**（释放时保留手势的速度与角度——释放阻尼正是这条的实现，可在 case study 文案里引这个概念）；**可中断性**；轻量动作在滑动中途即触发、破坏性动作必须完成手势才触发；高频交互去动效。

4. **Rauno Freiberg — Web Interface Guidelines** https://interfaces.rauno.me/ （已被 Vercel 采纳为 https://vercel.com/design/guidelines）。可提取的硬规则：动效必须可被用户输入打断；只动 `transform`/`opacity`；dialog 不要从 scale(0) 进场，用 opacity + scale(0.8→1)；显式列出要过渡的属性，禁 `transition: all`。

5. **Rauno Freiberg — Devouring Details** https://devouringdetails.com/ （2025，$249 交互式参考手册，23 章）。章节即原则清单：推断意图、交互隐喻、**模拟物理、动效编排（choreography）**、受限手势。是「克制 + 物理感」流派的当前集大成者。

6. **Josh Comeau — joshwcomeau.com**（《A Million Little Secrets》https://www.joshwcomeau.com/blog/whimsical-animations/ ；《prefers-reduced-motion》https://www.joshwcomeau.com/react/prefers-reduced-motion/）。可提取：MDX + 自建可复用 `<Demo>` 外壳组件（统一提供控件槽、播放/重置），每篇文章往里组合专属 widget——**这正是 InteractiveSlot 该有的形态**；「给读者控制权 = 被动学习翻转为主动学习」；reduced-motion 的 React hook 化。

7. **nan.fyi（Nanda Syahrasyad）**——《Inside Framer's Magic Motion》https://www.nan.fyi/magic-motion 。可提取：用**分步揭示 + 可拖拽沙盒**讲 FLIP 算法；每个交互图示都带「试一下」的最小任务。交互文章的轻量级实现范本（比 Ciechanowski 门槛低得多，Next.js + React 即可达成）。

8. **Maxime Heckel — blog.maximeheckel.com**（《The physics behind spring animations》https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/）。可提取：**弹簧参数可视化 playground**（mass/stiffness/damping 曲线图 + 同参数实物动画并排）——讲 PBD 阻尼时可以借这个「参数曲线 + 实物并排」的版式讲收敛。

9. **kvin.me — 《Effortless UI Spring Animations》** https://www.kvin.me/posts/effortless-ui-spring-animations ——Apple 双参数（duration + bounce）弹簧模型及其到 mass/stiffness/damping 的换算公式（stiffness = (2π/T)²，damping = (1−bounce)·4π/T）。写文书/面试讲阻尼时可直接引用的干净数学。

10. **Motion 官方《Web Animation Performance Tier List》** https://motion.dev/magazine/web-animation-performance-tier-list ——合成器线程 vs 主线程的分层判断；transform/opacity/filter/clip-path 可上合成器。

11. **WebKit 官方 scroll-driven animations 指南** https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/ ——Safari 26 已支持，配 `@supports (animation-timeline: view())` 渐进增强。

12. **Next.js View Transitions 官方文档** https://nextjs.org/docs/app/guides/view-transitions + React `<ViewTransition>` https://react.dev/reference/react/ViewTransition ——现状判断的一手出处（见 C 节）。

## B. 克制动效语法（针对本站）

**总原则**：全站动效只做三类——**状态反馈、空间定向、教学演示**。装饰性动效为零。hero 连杆本体是全站唯一的「物理明星」，其余动效的克制反而衬托它——这本身是设计论点，可写进 case study。

| 场合 | 做什么 | 参数区间 | 不做什么 |
|---|---|---|---|
| 页面/区块入场 | 一次性 opacity + translateY(8–12px) 淡入，首屏四项目索引可 stagger | 300–500ms，强 ease-out `cubic-bezier(0.23,1,0.32,1)`，stagger 间隔 40–60ms、总时长封顶 ~700ms | 不做滚动驱动的持续入场；折叠线以下用 IntersectionObserver 触发一次即止 |
| hover 微交互 | 项目卡片：图片 scale(1.02–1.03) + 题栏颜色过渡；链接下划线 | 150–200ms `ease`；必须 `(hover:hover) and (pointer:fine)` 门控 | 不做 3D tilt、不做磁吸按钮、不做光标替换 |
| 按钮/可点击反馈 | `:active` 时 scale(0.97) | 100–160ms ease-out | 键盘触发的操作零动效 |
| 页面转场 | 见 C 节；保守方案 = 无转场或 `template.tsx` 挂载时 150–200ms 纯 CSS 淡入 | ≤200ms，仅 opacity | 不做全屏遮罩转场、不做路由 loading 剧场 |
| 图片揭示 | case study 内长图：进入视口一次性淡入即可；可选 clip-path inset 揭示但仅限 FIG 级重点图 | 400–600ms ease-out | 不做视差、不做滚动绑定的 scale |
| 弹簧参数 | 需要物理感的地方统一用 Apple 双参数心智模型 | perceptual duration 0.2–0.5s，bounce 0–0.2（拖拽释放类可到 0.3）；换算成 Motion：`{type:'spring', duration:0.35, bounce:0.15}` 量级 | UI 弹跳超过 bounce 0.3 一律砍 |
| reduced-motion | **reduce 不是 remove**：保留 opacity/颜色过渡，砍掉所有 transform 位移与自动播放；教学演示改为默认暂停 + 手动播放；hero 的拖拽交互可保留（用户主导的直接操纵不属于前庭刺激源），但**释放后的自转阻尼动画应停用或大幅缩短** | `@media (prefers-reduced-motion: reduce)` + React hook 双轨 | 不做「全局 0ms」粗暴关停（会破坏理解性过渡） |
| 教学演示（InteractiveSlot） | 借 Ciechanowski 语法建统一 Demo 外壳：题栏 + 播放/暂停 + 时间 scrubber + 重置；**每个控件只管一个变量**；滑块在图正下方；提供全局暂停；叙事上问题先行 | scrubber 拖动零延迟直驱状态（不是触发动画） | 不做自动步进的「演示剧场」；不在一个 demo 里塞多个滑块讲多个概念 |

**性能红线**：只动 `transform`/`opacity`（`filter`/`clip-path` 谨慎）；禁 `transition: all`；`will-change` 只在动画前一刻加、结束即清，静态元素上出现即是 bug；入场动画避免在 hydration 关键期抢主线程（INP 预算）；注意 **SVG 内部元素的 transform 动画在部分浏览器不走合成器**——hero 已封盘不动，但新写的 SVG 教学图示若做持续动画，优先用 rAF 直改 attribute（solver 已是这个模式）而非 CSS transition。

## C. 技术选型结论

**结论：CSS 优先 + 选择性引入 Motion for React；不引 GSAP；View Transitions 暂不启用。**

1. **全站基线 = 纯 CSS**。入场淡入、hover、active、reduced-motion 降级全部 CSS transition/animation + 一个小的 IntersectionObserver hook 即可覆盖，零依赖、零 hydration 成本。这与「求解器零依赖」的项目纪律同构，且叙事上自洽：动效重头戏是自己写的 PBD，不该被第三方动画库抢戏。

2. **Motion（原 framer-motion）仅按需引入**，用于两个场景：case study 里需要 exit/layout 动画的交互组件，以及需要标准弹簧插值的 Demo 外壳。用 `LazyMotion` + `m` 组件或 `useAnimate` mini（2.3KB）控制体积（完整 `motion` 组件 tree-shake 底线约 34KB）。出处：https://motion.dev/docs/react-reduce-bundle-size 。

3. **GSAP 不引入**。它自 2025-04 起连全部插件（ScrollTrigger/SplitText 等）完全免费（https://webflow.com/updates/gsap-becomes-free ），但其强项是滚动剧场与影院式时间线——恰是本站明确不做的东西。引入 = 27KB+ 换零需求。

4. **View Transitions 现状（2026-07）**：同文档转场已全主流浏览器落地（Chrome 111+ / Safari 18+ / **Firefox 144+，2025 年秋**）；跨文档仅 Chromium + Safari 18.2+，Firefox 未定（争取进 Interop 2026）。但关键在框架层：React `<ViewTransition>` **仍只在 canary**，Next.js 16 的 `experimental.viewTransition` 官方标注「**不建议生产使用**」。在一个申请季要给招生官看的站上启用 canary React + 实验 flag，风险收益比不成立。**判断：本站页面转场做「无转场」或 `template.tsx` 纯 CSS 淡入；View Transitions 留到 React 稳定后作为渐进增强再考虑**（届时 hero→case study 的 FIG 题栏共享元素转场会是唯一值得做的一处）。

5. **CSS scroll-driven animations**：Chrome 115+ / Safari 26 已支持，Firefox stable 仍在 flag 后（全球覆盖 ~82.6%，未达 Baseline）。本站既然不做滚动剧场，此项无需求；若将来要做极轻的滚动进度指示，用 `@supports (animation-timeline: view())` 渐进增强，Firefox 看到静态内容。

6. **教学演示层（最高优先的动效投资）**：不用任何动画库——scrubber/滑块直驱已有的 `LinkageController`/solver 状态，rAF 渲染循环已现成。要建的是**交互语法外壳**（Josh Comeau 的 `<Demo>` 组件模式 + Ciechanowski 的控件纪律），而非动画能力。这一层做好了，比全站任何入场动效都更能支撑「手感即论点」。

Sources: 见正文各条 URL；另 [emilkowal.ski/ui/great-animations](https://emilkowal.ski/ui/great-animations)、[interfaces.rauno.me](https://interfaces.rauno.me/)、[devouringdetails.com](https://devouringdetails.com/)、[motion.dev/magazine/web-animation-performance-tier-list](https://motion.dev/magazine/web-animation-performance-tier-list)、[webkit.org scroll-driven animations](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)、[nextjs.org/docs/app/guides/view-transitions](https://nextjs.org/docs/app/guides/view-transitions)、[react.dev/reference/react/ViewTransition](https://react.dev/reference/react/ViewTransition)、[webflow.com/updates/gsap-becomes-free](https://webflow.com/updates/gsap-becomes-free)、[gsap.com/blog/3-13](https://gsap.com/blog/3-13/)

---

# 附录 D：case study 叙事与呈现调研（agent 原文）

## A. 案例与出处（12 条）

1. **Bartosz Ciechanowski（ciechanow.ski，最相关标杆）** — https://ciechanow.ski/ （尤其 /mechanical-watch、/gears、/bicycle）
   可提取模式：**全站不用 scrollytelling**——每个交互图都是行内、手动驱动（slider 擦洗 + 拖拽旋转），正文以「下面的演示」显式指向图；图在无人操作时有低速 idle 自转（既是可交互性的暗示，也是「活物感」——与轮回机器「手感即论点」直接同构）；讲解顺序是「零件→子装配→整机」的渐进组装，同一零件在全文保持同一配色编码；零外部框架、纯自绘。已知短板（CSS-Tricks 指出）：slider 是不可聚焦的 `<div>`，键盘/读屏不可用——照抄时要补 a11y（https://css-tricks.com/bartosz-ciechanowskis-interactive-blog-posts/）。

2. **Distill《Communicating with Interactive Articles》（范式总纲）** — https://distill.pub/2020/communicating-with-interactive-articles/
   给出五类交互承担的功能：连接人与数据、让系统可玩、促发自我反思（预测再揭示）、个性化阅读、降认知负荷（details-on-demand、渐进披露）。两条直接可用的原则：同一概念给多重表征（公式 + 图 + 可操作模拟）；以及作者原话——"not everything needs to be interactive……最坏情况下交互反而分散注意或根本没人用"。这是给交互文章做减法的权威出处。

3. **Nicky Case《How I Make an Explorable Explanation》+《4 More Design Patterns》** — https://blog.ncase.me/how-i-make-an-explorable-explanation/ 、 https://blog.ncase.me/explorable-explanations-4-more-design-patterns/
   叙事弧：以真问题开局（curiosity）→ 从具体操作爬向抽象（climb gradually）→ 以开放沙盒收尾（让读者「超过老师」）。设计模式：把系统拆成机制、**先隔离教单个机制再组合**；在交互里埋「作业题」（显式任务或隐式靶子）；策略性扣留解释让读者自己撞见结论；一定要拿真人测试。对连杆文章的映射很直接：先单杆约束→再四杆→末尾给自由拖拽沙盒。

4. **Mike Bostock《How To Scroll》（滚动叙事的五条铁律）** — https://bost.ocks.org/mike/scroll/
   ①滚动优于点击；②滚动必须快速、增量、可逆（禁止吸附式 swipe 劫持）；③反馈即时且与滚动量成正比；④不要自动播放造成突袭（尤其带声音）；⑤不许破坏 12 个标准键盘滚动快捷键。做任何 scroll 绑定前先过这五条。

5. **The Pudding 的 process 文档** — https://pudding.cool/process/how-to-implement-scrollytelling/ 、 https://pudding.cool/process/scrollytelling-sticky/
   工程模式：`position: sticky` 图 + 步进文字块触发状态切换（Scrollama）；叙事模式：以中心问题开篇，**结论之后附 Method 段**交代数据与算法——「正文讲论点、方法折叠到文末」这个结构非常适合 case study 的量化结果呈现（正文给结论数字，方法细节收进折叠段）。

6. **Josh Comeau** — https://www.joshwcomeau.com/blog/how-i-built-my-blog-v2/
   MDX 组件即段落：每个概念配一个微型 widget，**并排对照两组参数的演示比文字或视频都强**（被动读→主动调）；沙盒（Sandpack/playground）只在需要多文件时才升级使用——组件复杂度分级投放，不是处处上重炮。

7. **nan.fyi（Nanda Syahrasyad）** — https://www.nan.fyi/magic-motion 、 https://www.nan.fyi/svg-paths
   算法/机制类讲解的模板：步进式可视化（上一步/下一步按钮走状态机）+ 预测式小测验 + 章末沙盒；把「看不见的中间状态」（如 FLIP 动画的测量-反演）逐帧摊开。步进按钮模式是 scrollytelling 的低风险替代。

8. **Bret Victor《Magic Ink》（交互的反方证词）** — https://worrydream.com/MagicInk/
   信息类软件「所有交互本质上是在数据空间里导航」，是 Cooper 所谓 excise（与目标无关的认知税）；「交互应当克制而少用，仅当环境与历史给不出足够上下文时」。用途：为「这里到底要不要做成可交互」提供否决标准——能用一张设计好的图回答的问题，不要让读者去拖。

9. **U.S. Graphics Company / Berkeley Graphics（Neil Panchal）——工程制图美学上网页的活样本** — https://usgraphics.com/ 、字体规格书示例 https://usgraphics.com/static/products/TX-02/datasheet/TX-02-datasheet.a43c0c7f8d8c.pdf
   明确的设计哲学（其自述）：「dense 优于 sparse、explicit 优于 implicit、暴露状态与内部构造」——反极简主义的工程文档风。可提取：等宽字体 + 表格化元数据 + 文档编号/版本号当 UI 元素用；TX-02 datasheet 是「题栏（title block）语法在现代排印里复活」的直接范本（图号、rev、日期、栅格边框）。注意该站反爬（403），调研以站点自述与第三方描述为准。

10. **Blueprint / 技术制图美学趋势综述** — https://www.kittl.com/blogs/blueprint-graphic-design-trend-stl/
    2025–26 的「blueprint 回潮」特征清单：细线引出线（leader lines）、爆炸图、等宽注记、双色克制配色、"almost scientific in tone"。价值在于确认：FIG.01 式编号图版目前处在审美顺风期，但趋势文也提醒它容易沦为装饰——题栏字段必须真实（真日期、真版本、真容差），否则就是贴皮。

11. **科学图注（figure legend）写作规范** — Caltech 手册 https://writing.caltech.edu/documents/27629/HWC-FigureCaptionHandout.1-2024.pdf 、 https://www.internationalscienceediting.com/how-to-write-a-figure-caption/
    图注语法：**陈述句标题（直接说结论）+ 看图方法（符号/颜色/坐标定义）+ 来源与条件（样本量、比例尺、容差）**；自足——不回正文也能读懂；多面板图每个面板独立可读。这套语法可直接嫁接到 FIG 题栏：题栏字段管「档案性」（编号/日期/版本），图注管「论证性」（这张图证明什么）。

12. **招生方官方文件三份**
    - CMU SoA 研究生招生（MSCD 适用）：25–30 页、单一 PDF、≤20MB、150dpi、SlideRoom 提交，审查是 holistic（https://www.architecture.cmu.edu/admissions/graduate-admissions）；
    - UW M.Arch 官方 Portfolio Tips（原文）："Limit the amount of text… The images should do most of the work"；「通常一到两个对页足以完整讲清一个项目」；**协作/职务作品必须明确标注本人贡献**（https://arch.be.uw.edu/wp-content/uploads/sites/5/2022/07/M-ARCH_portfolio-tips_rev2022.pdf）；
    - RCA 官方 Portfolio Advice：策展式取舍（「不必展示一切，选最能代表能力与志向的关键作品」）、300 词动机陈述 + 2 分钟出镜视频、按项目要求定制（https://www.rca.ac.uk/study/apply-to-study/portfolio-advice/）。

## B. 「交互文章语法」清单——组件与正文的绑定模式

| 模式 | 机制 | 适用场景 | 风险/成本 |
|---|---|---|---|
| **1. 滚动触发（scrollytelling）** | sticky 图 + 步进文字块换图的状态 | 状态序列与阅读顺序严格同构、读者不需要回头对照的单线叙事（如「从一根杆到整机」的组装过程） | 最高风险项：键盘/读屏可断（Bostock 规则 2/5）、NN/g 实证滚动触发文字动画拖慢阅读、移动端与 LCP 代价大。必须保留原生滚动、给 prefers-reduced-motion 静态回退 |
| **2. 手动 scrubber / slider（Ciechanowski 模式）** | 行内演示 + 拖杆擦洗连续参数，正文显式指涉「下图」 | 连续参数空间、机构运动、需要读者**反复来回**观察的内容——连杆求解器的主语法应该是它而不是 scrollytelling：阅读节奏与操作节奏解耦，读者掌握主动权 | 成本在实现不在阅读；补键盘可聚焦（Ciechanowski 自己没做）；idle 自动微动画作可交互性提示 |
| **3. 静帧序列 / 编号图版（FIG 版）** | 一组静态图 + 自足图注承担叙述 | 对比多个状态（并排静帧优于播放动画）、以及**降解需求**——网页 case study 要能导出成 SlideRoom PDF 页时，静帧序列是唯一双轨同构的语法 | 几乎零风险；代价是失去「手感」论证力，所以只用于证据链的非核心环节 |
| **4. 直接操纵沙盒** | 拖拽机构本体，无脚本目标 | 章末开放探索（Nicky Case：end with open exploration）——概念教完之后才投放，放开头会让读者在不懂机制时乱拖 | 需要「作业题」式引导（隐式靶子），否则用户 10 秒即弃 |
| **5. 预测-再揭示** | 先让读者猜/画，再显示真实曲线（NYT You Draw It 谱系） | 反直觉结论之前（如「耦合曲线不是圆」） | 低成本高回报；Distill 列为自我反思类最有效模式 |
| **6. Details-on-demand** | 术语/公式 hover 注释、折叠段 | 降认知负荷（"overview first, details on demand"）；对非母语作者尤其有用——正文保持短句，深度塞进注释层 | 注意移动端无 hover，需 tap 等价物 |

绑定纪律（跨模式通用）：一个 widget 只讲一个概念（Comeau/Case）；正文必须显式指涉图（「下面的演示」），不许图文并置却互不认领；每个交互件都有静态回退帧；交互不是默认选项而是最后手段（Magic Ink）——先问「一张标注好的静态图能不能回答这个问题」。

## C. 招生视角的红线与安全线

**官方说法（有原文出处）**
- 载体事实：CMU SoA 的作品集主件是 25–30 页单一 PDF（SlideRoom），网站只是 CV 上的链接——**网页 case study 的每个论证单元都应能降解为 PDF 页**（静帧 + 图注），否则招生官根本看不到。这与骨架里「静帧序列/FIG 图版」语法直接对齐。
- 文字密度（UW 官方原文）："Limit the amount of text… images should do most of the work"；一个项目 1–2 个对页讲完；文字要参与版面设计而非附着。对非母语申请者这是安全线也是策略线：**用图注句（陈述句、一句一断言）代替段落散文**，长 prose 只出现在读者自愿点进的交互文章里（Distill 的 segmenting 原则——把复杂课拆成一口一块）。
- 红线（UW 官方）：协作作品不写清本人贡献。轮回机器这类多工种装置（壳体/引擎/用研）每个 FIG 的题栏加「角色」字段是最干净的解法，也顺带承载 AI 披露。
- RCA 官方：策展优于穷举；作品集按项目要求定制，「让每个元素都有作用」。

**社区经验（标明来源性质）**
- 阅读时长：MHCI 录取者用自己作品集的 Google Analytics 得出**评审平均每个项目页停留约 1 分钟**（Salonee Gupta, Medium，个案数据）；业界招聘侧的通说是首轮 90 秒扫全站、3–5 分钟读单篇（uxtools.co / careerstrategylab，针对求职非申请，但方向一致）。含义：每页必须有「1 分钟版本」——标题 + 首图 + 结论数字在首屏成立，交互文章是给愿意停留 20 分钟的人的第二层。
- 过程材料：两条社区经验存在张力——纯艺/RCA 侧毕业生提醒「过程图堆太多是常见错误，MA 看完成品」（laladrona.com，个人经验）；HCI/UX 侧通说是必须展示过程、约束与失败——「包含挫折与教训，团队要的是约束下仍有创造力的设计师」（uxtools.co）。对 MSCD（研究型项目）取后者但守规矩：**每张过程图必须有图注说明它改变了什么决策**，不许无注解的草图墙。
- 量化结果：先给结论再给方法（uxtools "lead with end result"；The Pudding 的 Method 后置模式）；图上直接标注差异而非并列裸图。
- 数量：3–5 个 case study 是业界共识区间（多来源社区经验）——四项目结构在安全区内。

**呈现技术红线（有实证/规范出处）**
- 滚动触发文字动画会实际拖慢阅读与找信息（NN/g，https://www.nngroup.com/articles/scroll-animations/ ，实证研究）；
- 破坏键盘滚动/读屏、无 reduced-motion 回退、自动播放带音频（Bostock 五律 + Chrome 官方 scrollytelling 指南 https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/user-experience/scrollytelling.md ）；
- 重滚动页在低端移动设备上 LCP 崩坏（社区工程经验）——招生官可能用任何设备打开；
- 交互为交互而做：Distill 与 Magic Ink 同时给出否决标准（前者「最坏情况是分散注意」，后者「交互是最后手段」）——每个 widget 要能回答「删掉它论证少了什么」。

**一条综合判断（供呈现层决策）**：这套材料里最值得抄的组合是——PDF/首屏层用「静帧 FIG 图版 + 陈述句图注 + 真实题栏字段」（UW 文字纪律 × 科学图注语法 × U.S. Graphics 题栏美学），交互文章层用「Ciechanowski 手动 scrubber + Case 的先隔离后组合 + 章末沙盒」，滚动触发只留给一次性的组装叙事段且全程守 Bostock 五律。

Sources: 除正文所列 URL 外：https://hcii.cmu.edu/academics/mhci/admissions 、 https://saloneegupta.medium.com/deconstructing-my-mhci-graduate-application-db915c8753e8 、 https://www.uxtools.co/blog/5-principles-of-exceptional-case-studies-in-ux-portfolios 、 https://www.careerstrategylab.com/how-long-should-ux-case-study-be/ 、 https://www.laladrona.com/how-to-prepare-a-portfolio-for-rca-painting-5-tips-from-a-recent-graduate
