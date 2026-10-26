# Work 分组：一组一个平面像素符号

2026-10-25，作者确认细小方点、一组一个整体标记与平面化方向，否决了图标阵列、抽象波带和具象透视场景。2026-10-26 发布前同步最新 master：网站实际已调整为主项目加五个分类，背景按真实分类补齐，不改内容归属或分组名称。

| 真实分组 | 平面符号 | 当前内容依据 |
| --- | --- | --- |
| Selected work | 开放边界向内回转的响应单元 | 人、响应物体与空间的关系 |
| Interaction & design research | 观察与感知的眼形标记 | Smart Bed 与 Co-Evolving Kitchen |
| Landscape & urban design | 连续地形与路径 | Floating Terrain, Framed Axis（同一项目）、Hongkong Facade、Under-Cane |
| Interiors | 围合与开口 | The Patrick、Design for our future、New Wave Film Club |
| Architecture & construction | 承重与连接 | B365 Office Renovation、House for a Family of Five |
| Installations | 交织结构 | 竹编装置与 The Shape of Sound |

所有原稿统一单色平涂、等粗轮廓与圆端点。主题是单一符号，点只是组成轮廓的材料；不平铺图标，不使用人物、家具、透视或阴影。

## 文件与生成

- `sources/*.svg` 是可编辑原稿，`previews/*.png` 是提高对比度的完整预览。
- 在仓库根目录运行 `node scripts/work-pixel-scenes/generate.mjs`，用现有 sharp 采样为 160×100 格、6 单位间距、8 档方点。
- 产物为 `public/home/work-scenes/*.svg`，`manifest.json` 记录源、点数和字节数。同档点合成一条 path，网页不创建数千独立节点。
- `WorkMosaic.tsx` 显式映射真实 group key，未知组保留雾色底。
- 背景沿用新版 Work 轮播状态、时长和曲线；首尾环回只让来源与目标图移动一屏。手机和 reduced-motion 沿用文档流静态背景。
- 装饰层不拦截点击、不进入无障碍树。文字前保留渐淡处理，窄屏限制图幅以免方点随长面板放大。

发布验证记录见 `design-ref/MAPPING.md` §63。
