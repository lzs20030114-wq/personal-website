# 轮回机器 · 交接图册出图

给作品集机构的实体交接图册（`轮回机器_交接图册/`）由这里的脚本从 815.3dm 生成。模型更新后按下面四步重跑即可换掉全部立体图。

```bash
pip install -r scripts/model-extract/requirements.txt          # rhino3dm、numpy；另需 Pillow
python scripts/handover/extract_815.py 模型求解器参考/815.3dm /tmp/ho/parts.pkl   # 分件网格（复用 gen_machine 的分类）
python scripts/handover/make_figures.py /tmp/ho/parts.pkl /tmp/ho/fig             # 渲染图 + 锚点 + 环拓扑
node   scripts/handover/ring-phases.mjs /tmp/ho/fig/ring-phases.json              # 五环各相位销位（站上同一份解算，需 npm ci）
python scripts/handover/build_doc.py scripts/handover/handover.src.html /tmp/ho/fig 轮回机器_交接图册
```

- `render.py` + `raster.c`：正交投影、z-buffer、线稿（轮廓 / 折痕 / 深度跳变）+ 淡色平涂。首次运行自动编译 `raster.so`（需要 `cc`）。
- `handover.src.html`：图册正文模板。`<!--FIG name 图注-->` 换成渲染图 + 编号气泡；`<!--RINGS-->`、`<!--RACK-->`、`<!--GEARTABLE-->`、`<!--RINGTABLE-->` 换成由数据计算的矢量图和表。
- 图里**不画** 815 模型中的曲柄轮与驱动杆：日志 2026-08-23 记录实物已改为齿条驱动，齿条没有建模，图册里用示意图另画（RM-HO-09）。
- PDF：用 Playwright 打开生成的页面，`emulateMedia('print')` 后 `page.pdf()`（A4 横版，`preferCSSPageSize`）。
