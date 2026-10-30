# Work 分组：一组一个平面像素符号

2026-10-25，作者确认细小方点、一组一个整体标记与平面化方向，否决了图标阵列、抽象波带和具象透视场景。2026-10-26 发布前同步最新 master：网站实际已调整为主项目加五个分类，符号按真实分类补齐，不改内容归属或分组名称。

2026-10-26 作者交来「19 Work - Peek and Mosaic Fix」并选 1a（`handoff-19-peek-mark/`）：符号不再铺满整幕，改为每组卡片下方留白带里的印记（MAPPING §64）。

| 真实分组 | 平面符号 | 当前内容依据 |
| --- | --- | --- |
| Selected work | 开放边界向内回转的响应单元 | 人、响应物体与空间的关系 |
| Interaction & design research | 观察与感知的眼形标记 | Smart Bed 与 Co-Evolving Kitchen |
| Landscape & urban design | 连续地形与路径 | Floating Terrain, Framed Axis（同一项目）、Hongkong Facade、Under-Cane |
| Interiors | 围合与开口 | The Patrick、Design for our future、New Wave Film Club |
| Architecture & construction | 承重与连接 | B365 Office Renovation、House for a Family of Five |
| Installations | 交织结构 | 竹编装置与 The Shape of Sound |
| Drawing & painting | 一支斜放的笔拖出一道线 | 绘画页（2026-10-30 新增组，MAPPING §80） |

所有原稿统一单色平涂、等粗轮廓与圆端点。主题是单一符号，点只是组成轮廓的材料；不平铺图标，不使用人物、家具、透视或阴影。以后新增真实分组，再按其实际作品设计并登记符号；未登记的组只留空带。

## 文件与生成

- `sources/*.svg` 是可编辑原稿，原稿未改；`previews/*.png` 是生成结果预览。
- 在仓库根目录运行 `node scripts/work-pixel-scenes/generate.mjs`（复用 Next 已装的 sharp），同时刷新 `public/home/work-scenes/*.svg`、`previews/` 与 `manifest.json`（源与产物对应、格数、尺寸、点数、字节数）。
- 产物：格距 6px、点径 2.5px、**二值**（每格 4×4 采样、覆盖过半才出点，没有灰阶毛边）；统一 264 高的画框、符号贴右下，六组按面积等重（宽的符号因此更矮）。每张一条 path。
- `components/site/home/WorkMark.tsx`：分组 → 符号的显式映射，挂在每个组面板里；位置、尺寸、显隐全在 `home.css` 的 `.hs-wg__mark`。

## 怎么摆

右齐当前屏（85% 那一屏的右缘，不压到露出来的下一屏），底边坐在组名目录线上方 20px，只占卡片下方的留白带；留白带 ≥264px 时 1:1（格距正好 6px），更矮时等比缩，矮于 84px 不出。跟卡片走同一条轨道，只有当前屏的印记看得见。墨色：Selected work 主青，其他作品各组石板蓝（§61 颜色只表示项目）。窄屏 / reduced-motion 文档流里接在每组卡片后面，带高 clamp(96px, 26vw, 160px)。装饰层不拦截点击、不进入无障碍树。

旧做法（整幕铺满、8 档点、两层 wash，§63）已撤。
