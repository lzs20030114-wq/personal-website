# 首页 02 Work：露边对称 + 1a 题栏印记

按仓库路径一一覆盖即可（都是在现行文件上改的，其他内容未动）：

- `components/site/home/home.css` — 露边改 mask 对称；删 `.hs-work-mosaic*` / `.hs-wg__flow-mosaic`；加 `.hs-work-paper`、`.hs-wg__mark`；文档流段同步
- `components/site/home/WorkAboutPages.tsx` — 背景轨道只铺纸色；每个组面板卡片后挂 `<WorkMark />`；删 flow-mosaic
- `components/site/home/WorkMosaic.tsx` — 导出改为 `WorkMark`
- `scripts/work-pixel-scenes/generate.mjs` — 二值、6px 格距、面积等重、264 高画框
- `public/home/work-scenes/*.svg` — 已按新生成器算好（浏览器端栅格化，和 sharp 可能差几个边缘点；以 `node scripts/work-pixel-scenes/generate.mjs` 重跑的为准，会同时刷新 previews 与 manifest）
- `design-ref/work-pixel-scenes/README.md` — 同步现行做法
- `MAPPING-58.3.md` — 追加到 design-ref/MAPPING.md §58.2 之后

覆盖后：`npm run typecheck`，然后 1512×982 / 1440×900 / 1728×1117 / 390×844 各看一遍。
