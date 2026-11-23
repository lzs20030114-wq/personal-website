# 决定性瞬间的线稿（项目二）

把「感知 → 理解 → 干预」的每一条规则画成一行静帧线稿，给案例页和 PDF 作品集用。规则与图注的字取自 `项目二_输入到输出的规则.md` §4、§5。

三步，站上页面不改：

1. `capture.mjs`：先起生产服务（`npm run build && npx next start -p 3100`），打开 `/lab#lab2-16-<场景键>`，用假时钟快进到某一秒，在 WebGL 这一层把这一帧画的三角形（世界坐标）与每次绘制的颜色抄下来。
   `node scripts/moments/capture.mjs <几何目录> <场景键> <秒> [秒 …]`
2. `line.py`：用交接图册的线稿渲染器（`scripts/handover/render.py` + `raster.c`，要先编出 `raster.so`，见 `scripts/handover/README.md`）找线，合成黑白线稿，同名 `.json` 写出平面小图要用的数据。
   `python scripts/moments/line.py <几何前缀> <out.png> '<json 选项>'`
3. `sheet.mjs`：按 `rows/letting-agent.json` 排成图版（每行一条规则：编号 · 理解 · 实跑次数，下面几格线稿，每格左上一张平面小图）。
   `node scripts/moments/sheet.mjs scripts/moments/rows/letting-agent.json <线稿目录> <out.png> [宽]`

## 画法（2026-11-23 作者定）

- 全部黑白线稿，线细；不画落下箭头。
- 触发的人或猫 = 中灰底、黑线、脚下一圈；被调动的单元 = 黑线、浅灰底；让路时只标收回的带；本来要落、没落的台 = 虚线框；人注视猫 = 虚线。
- 画面只取到约 2.4 m 高（单元平时收在天花板下，不入画）；2×2 的场地按 3×3 的比例尺画。

## 场景与时刻

现成的小样：`giveway`（①）。只用于出静帧的场景（`src/lib/space/cohabit-vignette.ts` 的 `STILL_SCENES`，不进 Lab 2-16 的按钮与差分清单，时刻照规则排）：

| 行 | 场景键 | 取的秒（capture 的参数） | line.py 选项里标的 |
|---|---|---|---|
| ① 路过 | `giveway` | 5.4 · 7.2 · 16 | 人 · 收回的带（`bands`）· 人；`fit_n: 3` |
| ② 站立注视 | `stillwatch` | 7.6 · 11.5 · 21.5 | 人猫 + 视线 · 台 (1,0) · 台 (1,0) + 猫 |
| ③ 落座引猫 | `stillguide` | 7 · 10 · 18.5 | 人猫 + 视线 · 台 (2,0) · 台 (2,1) + 猫 |
| ④ 相遇 | `stillguide` | 39 · 45 | 人猫 + 视线 · 台 (1,1) + 人猫 |
| ⑤ 猫换台 | `stillwatch` | 28.5 · 32.5 · 42 | 猫 · 台 (1,1) · 台 (1,1) + 猫 |
| 桌子 | `stillguide` | 7 · 10 · 14.4 | 人 · 台 (1,2) · 台 (1,2) + 人 |
| 头顶 | `stillhead` | 16.5 · 20 · 37 | 人猫 · 虚线框 (2,2) · 台 (1,1) + 猫 |
| 台角 | `stillcorner` | 9.5 · 11.5 · 28 | 人猫 · 虚线框 (1,1) · 台 (1,1) + 猫 |

各格统一用 `"w":1400,"h":1773,"crop":[0,0.365,1,1]`。R5（不把人困住）没画：八场实跑里一次没触发。
