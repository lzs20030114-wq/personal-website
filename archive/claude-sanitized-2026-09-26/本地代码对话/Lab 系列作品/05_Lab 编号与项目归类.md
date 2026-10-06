# Lab 系列作品｜Lab 编号与项目归类

### 用户

> 把我们这些lab按照项目归类吧 比如lab1-1就是项目1第一个项目 lab1-2这种格式

### 助手

> I've renumbered the labs by project. Nothing is committed or pushed yet.
>
> | New | Old | Bench |
> |---|---|---|
> | **Lab 1-1 – 1-5** | Lab.01–05 | Four-bar / arch ring / tentacle / five rings / full machine |
> | **Lab 2-1 – 2-3** | Lab.06–08 | 2D skin unit / solid band / two-structure band |
> | **Lab 2-4** | Lab.09 | Series |
> | **Lab 2-5 – 2-6** | Lab.10–11 | Cylinder ring / square ring |
> | **Lab 2-7** | Lab.12 | Ring-array floor |
> | **Lab 2-8** | Lab.13 | Relations between units |
> | **Lab 2-9 – 2-10** | Lab.14–15 | One person walking through / a few people |
>
> **What changed:**
> - **Labels on the site:** each bench's title on /lab, the section and group headers, spec-table lines that point to other labs, the 15 cards on the home page, and the figure captions and main-image captions on both case pages. The "loop" behaviour preset in Lab 2-9 also has a note that named a lab, so that changed too.
> - **Links:** anchors are now `/lab#lab2-5`, and links that open a specific mode look like `#lab2-5-split`. Old links such as `#lab10` and `#lab10-split` still open the right bench and mode, and the address bar switches to the new number.
> - **Variant list and its test:** the IDs are now `2-5:split…`. There are still 290 variants, none missing.
> - **Code comments and the older entries in 旧助手.md are unchanged.** They record the number that was current when they were written. The lookup table in 旧助手.md now has a column for the new numbers, so you can go from old to new.
>
> **Checks:**
> - Typecheck is clean, all 601 tests pass, and the production build succeeds.
> - I opened the production build in the in-app browser. /lab shows all 15 benches with the new numbers. Visiting the old `#lab10-split` switched the address to `#lab2-5-split` and selected the pinch mode. The home page and the Project II case page contain no old `Lab.NN` labels.
> - I couldn't confirm the scroll-to-bench on page load. The Browser pane was hidden, so screenshots came out blank. In that state even a plain new anchor like `#lab2-7` didn't scroll, so it doesn't look like something this change broke. Scrolling to the bench by hand worked. Worth a quick look on a real device.
>
> **Things I did along the way:**
> - `remark-gfm` was listed in `package.json` but missing from this machine's `node_modules`, so I ran `npm install`. I reverted the `package-lock.json` changes it made.
> - I deleted the `.next` build cache, which still pointed at routes from before the `(site)` folder and broke the build.
> - I added a `site-prod` entry to `.[已隐去service_branch]` so the production build can be opened in the preview browser.
>
> One thing to decide: the display format is `Lab 2-5`, a space and a hyphen. The old style was `Lab.06` with a dot. If you'd rather have `Lab.2-5` or `Lab 2.5`, it's a quick change.

### 用户

> 中文汇报

### 助手

> Lab 编号已改成按项目编：项目一是 Lab 1-1 到 1-5，项目二是 Lab 2-1 到 2-10。还没 commit，也没推。
>
> | 新号 | 旧号 | 台架 |
> |---|---|---|
> | **Lab 1-1 – 1-5** | Lab.01–05 | 四杆 / 拱环 / 触手 / 五环 / 整机 |
> | **Lab 2-1 – 2-3** | Lab.06–08 | 二维皮肤单元 / 立体带 / 双结构带 |
> | **Lab 2-4** | Lab.09 | 序列 |
> | **Lab 2-5 – 2-6** | Lab.10–11 | 圆筒环 / 方形环 |
> | **Lab 2-7** | Lab.12 | 环阵列场地 |
> | **Lab 2-8** | Lab.13 | 单元关系 |
> | **Lab 2-9 – 2-10** | Lab.14–15 | 一个人走过 / 几个人在场 |
>
> **改了哪些**
> - **页面上的编号**：/lab 每台的题头、项目和段落的标题、规格表里引用别台的地方、主页 15 张卡片、两个案例页的图注和主图注。Lab 2-9「绕圈」预设的说明里也引用了编号，一并改了。
> - **链接**：锚点改成 `/lab#lab2-5`，直达某个编制的写法是 `#lab2-5-split`。
> - **旧链接照样能用**：`#lab10`、`#lab10-split` 这类会打开对应的台架和编制，地址栏自动换成新号。
> - **差分清单和它的测试**：id 改成 `2-5:split…` 的形式，仍是 290 种，一档没少。
> - **没改的**：代码注释和 旧助手.md 上面那些旧条目里的两位号，记的是写下时的号，保持原样。旧助手.md 的「Lab 编号对照」表加了一列新号，新旧能对上。
>
> **验证结果**
> - typecheck 通过，601 项测试全过，生产构建通过。
> - 在内置浏览器里看了生产版：
>   - /lab 十五台的题头和锚点都是新号。
>   - 打开旧链接 `#lab10-split`，地址栏换成 `#lab2-5-split`，捏分编制也选上了。
>   - 主页和项目二案例页里找不到旧的 `Lab.NN`。
> - **有一项没测到**：打开页面时自动滚到那台。浏览器面板当时是隐藏状态，截图全是白的；那种状态下连新锚点 `#lab2-7` 也不滚，所以看着不是这次改坏的。手动调滚动是正常的。建议你在真机上点一下确认。
>
> **过程中顺手处理的**
> - 本机 `node_modules` 缺 `remark-gfm`（`package.json` 里有），跑了 `npm install`。它改动的 `package-lock.json` 已还原。
> - 删了 `.next` 构建缓存：里面还指着 `(site)` 路由组之前的旧路由，导致构建报错。
> - `.[已隐去service_branch]` 加了一条 `site-prod`，方便在预览浏览器里跑生产版。
>
> **要你拍板**：现在显示成 `Lab 2-5`（空格加连字符），原来的风格是 `Lab.06`（带点）。想换成 `Lab.2-5` 或 `Lab 2.5` 的话，改起来很快。

### 用户

> 现在这样就行 推上去吧

### 助手

> 已经推到 master 了（提交 `58d077e`），Vercel 会自动部署，一般一两分钟就能在线上看到。
>
> - **提交内容**：上一轮说的那些改动，外加新增的 `LegacyLabHash.tsx`（负责让旧链接继续可用）。
> - **没有提交**：仓库根目录那个未跟踪的 `personal-website/` 文件夹不是这次的改动，没动它。
> - **上线后请看一眼**：打开主页，点一张 Lab 卡片，看能不能滚到对应台架。本地面板是隐藏状态，这一项当时没测到。
