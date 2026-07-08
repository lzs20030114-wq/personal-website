# LAYOUT_NOTES.md — 桌面横屏排版研究笔记（2026-07-08）

**用途**：SITE_SPEC §8 v2 的依据。改版式前先读此文，防止把"桌面优化"做成"把字拉宽"。

---

## 第一定律：行长恒定，宽度给区

一切权威来源一致：正文行长 50–75 字符（66 为理想），桌面上 ≈ 600–800px 或 60–75ch。
**宽屏的横向空间永远不给正文行长**，给的是：元数据栏、边注列、更宽的图、留白。
把字拉宽 = 可读性下降，是横屏排版的第一号错误。

## 三个可组合的成熟模式

### 1. Tufte 边注体系（最贴本站气质）
主文列 + 边缘列：旁注、引用、小图、图注放边缘，与其所讨论的正文**同一视线高度**——读者不跳眼。大屏显示边注、小屏折叠。图与讨论它的文字紧邻，不分离（Tufte 的核心训条）。
→ 对本站：工程图纸的"图号 + 注释"天然就是边注语言；FIG 图注可入边缘列。

### 2. Swiss / 编辑网格
多列网格结构化页面；flush-left 对齐（每行视线有固定起点）；8pt 间距节奏；层级靠字号/字重/颜色不靠花样。
→ 对本站：case study 页三区网格（元数据栏 + 正文列 + 边缘列）；首页项目索引做成"图纸清单"式多列行。

### 3. 桌面作品集惯用件（取结构、弃表演）
分屏 hero（文一侧、图一侧）、粘性侧栏（滚动时元数据/目录常驻）是桌面作品集的主流骨架。
awwwards 系的滚动动效、视差、3D 表演与本站克制条款冲突——**只取布局结构，不取动效**。

## 关于参照系 ciechanow.ski 的澄清

它实际是**窄单列**排版——我们参照它的是"交互图示嵌入正文的密度与质感"，不是页面网格。桌面网格另取 Tufte + Swiss。这两者不矛盾：正文列内的阅读体验仍是 ciechanowski 式的。

## 本站落地规则（SITE_SPEC §8 v2 的骨架）

1. **容器**：内容画布 max-width ≈ 1360px，居中；页眉页脚同宽。
2. **case study 三区**（≥1280px）：左粘性元数据栏 ~260px（My Role / date / tools / 图索引）+ 正文列 62–68ch（flush-left）+ 边缘列（图注/旁注，弹性）。1024–1280px 降两区（并轨边缘列）；<1024px 单列回落（移动端仍可用，评审可能手机开）。
3. **图三档宽度**：`inline`（正文列宽）/ `wide`（正文 + 边缘列）/ `full`（整个内容区）。对比性双图（如衰老 A/B）用横向并置。
4. **首页 hero 分屏**：文字区 + FIG.01（700/520）左右分置，不再上下堆叠。
5. **项目索引 = 图纸清单**：编号 / 标题 / 摘要 / 年月 多列成行，发丝线分隔。
6. **横向滚动禁止**用于主内容；仅画廊类局部可用且需明确示能。
7. 行长、字体栈、token、克制条款全部不变。

## 来源

- [Tufte CSS](https://edwardtufte.github.io/tufte-css/) / [tufte-css GitHub](https://github.com/edwardtufte/tufte-css) — 边注体系、图文紧邻、大屏边注小屏折叠
- [Sidenotes In Web Design · Gwern.net](https://gwern.net/sidenote) — 旁注 vs 脚注的系统研究
- [Grids & Type | Design Shack](https://designshack.net/articles/layouts/grids-and-typography/) · [Spacing, grids, and layouts | designsystems.com](https://www.designsystems.com/space-grids-and-layouts/) · [USWDS Typography](https://designsystem.digital.gov/components/typography/) — 行长 50–75ch、编辑网格、基线节奏
- [8-Point Grid: Typography On The Web](https://medium.com/free-code-camp/8-point-grid-typography-on-the-web-be5dc97db6bc) — 8pt 间距系统
- [Awwwards Portfolio 集](https://www.awwwards.com/websites/portfolio/) · [Split Screen Sticky Scrolling Layout](https://www.awwwards.com/inspiration/split-screen-sticky-scrolling-layout-squarekicker-2) · [Muzli Top 100 Portfolios](https://muz.li/blog/top-100-most-creative-and-unique-portfolio-websites-of-2025/) — 分屏 hero / 粘性侧栏为桌面主流骨架
- [Bartosz Ciechanowski 文章群](https://ciechanow.ski/gps/)（[CSS-Tricks 评述](https://css-tricks.com/bartosz-ciechanowskis-interactive-blog-posts/)）— 参照的是正文列密度，非页面网格
