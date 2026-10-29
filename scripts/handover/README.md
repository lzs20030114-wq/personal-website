# 轮回机器 · 交接图册出图

给作品集机构的实体交接图册（`轮回机器_交接图册/`）由这里的脚本从 815.3dm 生成。模型更新后按下面四步重跑即可换掉全部立体图。

```bash
pip install -r scripts/model-extract/requirements.txt          # rhino3dm、numpy；另需 Pillow
python scripts/handover/extract_815.py 模型求解器参考/815.3dm /tmp/ho/parts.pkl   # 分件网格（复用 gen_machine 的分类）
python scripts/handover/make_figures.py /tmp/ho/parts.pkl /tmp/ho/fig             # 渲染图 + 锚点 + 环拓扑
node   scripts/handover/ring-phases.mjs /tmp/ho/fig/ring-phases.json              # 五环各相位销位（站上同一份解算，需 npm ci）
python scripts/handover/build_doc.py scripts/handover/handover.src.html /tmp/ho/fig 轮回机器_交接图册
```

- `proxies.py`：模型里没有、交接时必须画出来的件（主电机 + 带轮 + 皮带、三台肌腱电机 + 绕线盘、偏航转台实物外形、三根肌腱、环 S3 各铰点的对锁螺丝 + 石墨垫片 ⌀8 × 0.5 + 外侧脚的打印圆筒）。位置取模型留好的框、托盘；肌腱路径取 `extract_815.py` 从大触手块测出的端板窗口与中央导块槽口。
- `render.py` + `raster.c`：正交投影、z-buffer、线稿（轮廓 / 折痕 / 深度跳变）+ 淡色平涂。首次运行自动编译 `raster.so`（需要 `cc`）。
- `handover.src.html`：图册正文模板。`<!--FIG name 图注-->` 换成渲染图 + 编号气泡；`<!--RINGS-->`、`<!--RACK-->`、`<!--GEARTABLE-->`、`<!--RINGTABLE-->` 换成由数据计算的矢量图和表。
- 呼吸传动按 815 画：每环两片曲柄轮 + 两根传动杆（寄出的实物就是这套，用户 2026-10-29 更正）。齿条推内侧脚是作者的预想方案，没做也没建模，图纸 07 第 3 节单独画示意。
- 铰点层叠（图纸 06 第 3 节）由 `make_figures.py` 从 S3 每个销实际穿过的件现量：每两件之间一片垫片，螺丝两头各一片（用户 2026-10-29）。
- 图册只讲实体（用户 2026-10-25 拍板）：电子接线、行为、固件不写。
- 不列零件清单、不写来源与核对说明（用户 2026-10-29 拍板）：正文只讲结构、电机位置、装配顺序和走线，解释性文字尽量少。
- PDF：用 Playwright 打开生成的页面，`emulateMedia('print')` 后 `page.pdf()`（A4 横版，`preferCSSPageSize`）。
