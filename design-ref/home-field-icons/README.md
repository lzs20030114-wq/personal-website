# Field Hero 统一图标 · 2026-10-24

作者明确要求：小图标、统一风格，覆盖所有能进入格子的内容，并按项目与内容类型分配颜色。本方案取代 `home-field-thumbnails/` 的写实插画试稿。

## 视觉与复用

- 依据 `SITE_SPEC.md §8`、`LAYOUT_NOTES.md`、`design-ref/MAPPING.md §55` 和 `home-field-hero/17 Home - Field Hero.dc.html` 的深底、低饱和 G/V/S 项目色与细线语言。
- 参考已有 `LabWorkspace.tsx` 的 `WorkspaceIcon`、`LogBody.tsx` 的 `TableGlyph`；采用原生 SVG，48 × 48 网格、2.4 单位线宽、圆端点、留白、无材质/投影/摄影。共 48 个母版。
- 项目 I 灰绿、项目 II 灰紫、项目 III 灰蓝；智能床灰青、本站石灰、个人介绍浅黄绿。项目与实验使用明亮笔画，日志笔画和底色更淡；格子角标区分项目实点、实验空框、日志双线。展开卡片显示明确的类型文字。
- 继续复用 FieldPage 的格子涌现、悬停展开、原有翻幕引擎；不改求解器或后续页面的图像。

## 全内容覆盖

当前 210 个入口：3 个主项目 + 21 台实验 + 184 条日志 + Smart Bed 专题入口 + About。

- 每台实验按目录的具体机制配图。日志逐条阅读匹配主题；184 个稳定 id 对应 25 种语义图标，同主题允许复用，不按日期或数组下标随机配图。
- `log-icon-audit.json` 保存每条匹配依据与原始内容文件哈希；生产映射为 `src/lib/site/field-log-icons.json`。新日志自动按方面标签回退到语义图标，始终有入口；可随后补充逐条映射。
- 项目 III 链向现有筹备页，并标明 `In preparation`；非公开项目 IV 不收录。Smart Bed 没有独立案例页，链到最新一条真实研究日志。
- About 在首页点击使用已有翻幕引擎进入第三幕，Ctrl/Meta 点击保留 `/#about` 深链。
- 抽取顺序为类型 → 项目 → 条目。类型权重 3 : 3 : 4 : 1 : 1，保证大量日志不会挤掉项目/实验入口；每层都能到达全部候选。

## 源文件与重新生成

- `src/lib/site/field-glyphs.ts`：48 个 SVG 母版，唯一绘图来源。
- `src/lib/site/field-visuals.ts`：配色、类型、内容映射与分层抽样。
- `src/lib/site/home-model.ts`：实际内容池与链接派生。
- `public/home/icons/*.svg`：首页加载的 SVG 遮罩，总体积约 15.3 KiB。
- `manifest.json` / `preview.html`：从与首页相同的模型和内容读取器生成的完整预览，可按项目/类型/标题筛选。

运行 `node scripts/field-icons/generate.mjs` 可重建 SVG 和预览页；需要 Node 24（项目当前运行环境，支持直接读取 TS 母版）。正式页面不运行生成脚本，不新增运行时依赖或路由。

仅本地接入；生成图标不代表实物完成或研究结果。原有案例、台架及日志证据保持原样。
