# 项目代码审核、修复与复核清单

审核日期：2026 年 10 月 23 日。代码基线：`ccf7101`。

初次审核确认 **15 项需要修复的问题，其中 P1 五项、P2 十项**，另列四项维护改进和一项尚未复现用户故障的资源回收疑点。优先级最高的是 Studio 的草稿与图片保护、人猫台架的家具删除异常，以及受安全公告影响的依赖。现有架构的内核与页面分离、组件复用方向成立，没有充分理由整体重写。

以下 01–15 保留初次审核的缺陷描述与复现证据；其中的位置和代码行为对应修复前基线。用户随后授权在保持正常展示与运行的前提下修复，结果如下。

## 修复与自查结果（同日追加）

**原清单 15 项已修复，并修复复验中新发现的第 16 项窄屏时间轴重叠。** 改动保留原有正文、视觉设计和正常仿真行为，没有进行整体架构重写。四项 P3 维护建议及未证实用户故障的 WebGL 回收疑点仍保留为后续事项。

| 编号 | 已落实的修复 | 复验依据 |
|---|---|---|
| 01、02 | 待处理草稿不再被自动清理；恢复时保留原始 SHA | 连续两次刷新、旧稿恢复和冲突响应的真实浏览器验证 |
| 03、07 | 图片名称跨异步批次及连续发布预占；成功响应只清理实际提交且未替换的图片；服务端拒绝覆盖已有图 | 中文文件批量上传、发布中新增图片、下一次补发通过；晚引用附件另有组件回归 |
| 04、08 | 家具更新先迁移全部座位身份再处理起身；空间切换清理旧路线并恢复合法支撑 | 新增边界测试通过；六种正常场景的 72 个状态检查点与原版逐字节一致 |
| 05 | 升级受影响的 Next、Vite、Vitest、sharp 及间接依赖，更新锁文件 | 全量 `npm audit`（包括开发依赖）由 9 项降为 0；完整测试与生产构建通过 |
| 06 | 版本检查和提交使用同一个固定 HEAD；缺少远程版本信息时拒绝覆盖 | GitHub 请求打桩的并发与缺失 SHA 回归通过 |
| 09–11 | 文档流按可见性运行预览并同步读位；切换布局清理隐藏和动画；保留按钮 Space 语义 | 首页与案例导航 25 项浏览器检查通过，另有运行中动画切换复验 |
| 12、13 | 减少动态效果下松手后有限收敛；两套拱环入口共享原有手柄命中限制 | 三组正常轨迹不变；147 组四杆拖拽组合恢复到误差阈值内 |
| 14 | 日志持久 ID 贯穿读取、新建、恢复与发布；无歧义迁移旧格式 | 149 个原 URL 全部保留；去掉新增 ID 后内容、日期、排序完全一致；57 处引用的 23 个目标全部保留 |
| 15 | 按项目拆分客户端依赖，保留 SSR；Lab 仅在悬停或聚焦后预取 | 最终生产浏览器确认项目一和筹备页均不下载空间终态；项目二保留必需实验数据 |
| 16 | 窄屏时间轴标签独立排布、补足行高，手机 today 与月份分行；提示框使用同一套尺寸变量 | 320、390、820、1280px 无标签或月份重叠；桌面时间轴截图逐像素相同 |

完整测试为 **94 个文件、1,075 项通过**，比审核基线净增 32 项回归测试。`npm run typecheck`、完整 `npm run build`（测试、Vite、Next）通过；后续最小预取和样式补丁另经类型检查、既有 18 项转场测试及最终 `next build` 验证。独立复核覆盖草稿保护、身份迁移、仿真迁移、SSR 组件映射、首页状态和转场监听清理。

最终生产包的七个页面 × 两种尺寸（1280、390px）共 14 组对照均返回 200，无页面异常或横向溢出，标题、全部标题节点的位置、链接和图片信息一致。屏蔽实时 canvas、实验 SVG 与 HUD 后，12 张首屏截图逐像素相同；首页两张仅轮播计时条分别有 10、6 个像素的采样时刻差异。窄屏时间轴修复另外以局部截图与几何检查验收，桌面版本逐像素不变。首次并行截图超时，最终串行采集完整通过。

加载修复没有只看 HTML 清单：首次拆包后的浏览器实测仍发现导航自动预取整个 Lab，随后定位并修正。最终筹备页 HTML 初始脚本从 3,344,381 B 降到 667,903 B；包含动态加载及正常预取的浏览器实测为 744,625 B 解码脚本、233,342 B 本地 HTTP 压缩响应体，不包含实验终态或台架渲染代码标记。上述是脚本体积和本地请求测量，不代表线上 LCP。

旧格式草稿如果完全改写了条目，且无法唯一认回旧身份，会保留原草稿并提示核对，避免猜测身份后悄悄改变旧链接。正常带 ID 的草稿不受这种兼容限制。

**验证边界：**Studio 浏览器发布请求全部拦截模拟，没有写入真实内容池或图片，没有执行 GitHub 写入、线上部署或数据库变更。浏览器验证使用本地 Chromium；Safari 和真机触控未复验。两次手机平滑滚动初测在动画途中采样，改为等待实际落点后通过，初始记录与重测均保留。

修复证据：[project-fix-2026-10-23](/workspace/project-fix-2026-10-23)。主要入口：

- [完整测试与构建](/workspace/project-fix-2026-10-23/build.log)、[最终生产构建](/workspace/project-fix-2026-10-23/final-next-build.log)、[依赖审计](/workspace/project-fix-2026-10-23/audit-after.json)
- [Studio 六项浏览器验证](/workspace/project-fix-2026-10-23/studio-verification/results.json)、[首页与导航最终结果](/workspace/project-fix-2026-10-23/ui-verification/final-summary.json)
- [时间轴布局结果](/workspace/project-fix-2026-10-23/ui-verification/timeline/after/geometry.json)、[动画切换清理结果](/workspace/project-fix-2026-10-23/ui-verification/home-animation-cleanup.json)
- [内容与原链接核对](/workspace/project-fix-2026-10-23/content-verification.json)、[最终浏览器脚本下载](/workspace/project-fix-2026-10-23/browser-bundles-after.json)
- [14 组视觉与 DOM 对照结果](/workspace/project-fix-2026-10-23/visual-comparison.json)、[修复前截图](/workspace/project-fix-2026-10-23/before)、[修复后截图](/workspace/project-fix-2026-10-23/after)
- [键盘与鼠标意图预取、点击转场](/workspace/project-fix-2026-10-23/lab-prefetch-intent.json)、[滚动至页脚的加载复验](/workspace/project-fix-2026-10-23/case-scroll-bundles.json)

## 初次审核记录

## 审核范围与验证结果

覆盖站点路由、首页与案例页、Lab 控件和生命周期、Studio 发布链、访客 API 与数据库权限、机械和空间仿真、内容池、重复实现、构建与依赖。重点沿真实用户入口检查跨模块行为，并对照现行规范及后续已批准的例外。

| 检查 | 结果 | 解释 |
|---|---|---|
| 现有完整测试 | 92 个文件，1,043 项通过 | 不能覆盖本轮新增发现的所有操作组合 |
| TypeScript | 通过 | `npm run typecheck` |
| Vite 生产构建 | 通过 | 五个独立演示页面正常生成 |
| Next.js 生产构建 | 通过 | 编译、类型检查、静态生成均完成 |
| 桌面与手机路由冒烟 | 8 路由 × 2 尺寸均返回 200 | 1280 和 390px，采样时无页面异常、横向溢出或已加载图片损坏 |
| 首页专项浏览器验证 | 三项缺陷复现 | 普通手机与减少动态效果路径、断点切换、Space 操作 |
| Studio 定向探针 | 6 个场景复现 | 实际组件回调及 effect 顺序，GitHub 请求打桩，不是线上发布 |
| 仿真定向探针 | 四项缺陷复现 | 家具删除、空间切档、四杆松手、拱环命中 |
| 日志与素材检查 | 149 条日志无完全重复的 lead/body | 中英文分别检查。57 处日志引用涉及 23 个独立锚点，目前均存在，本地图片引用未发现缺文件 |
| 生产依赖审计 | 6 个依赖节点被标记 | 1 critical、4 high、1 moderate，适用性见问题 05 |

构建第一次在受限沙箱中出现 Vite 监听端口 EPERM 警告，测试和 Vite 构建仍完成。Next 编译阶段停滞后，单独在允许本机进程及端口的环境重跑成功。这不是已确认的项目构建缺陷。

路由冒烟覆盖三个案例、Archive、About、Lab、Privacy 和 Studio。当前本地未配置 Studio 密码，浏览器检查到的是其配置提示页。后台操作使用独立探针验证。未验证真实 GitHub 写入、Vercel 发布、线上 Supabase 凭证、Safari 或真机触控。

## P1 优先修复

### 01 尚未恢复的草稿会在打开后台时被删除

位置：[StudioEditor.tsx](/workspace/personal-website/components/studio/StudioEditor.tsx:102)。

打开后台时，第一个 effect 把 localStorage 草稿读进内存并显示恢复提示。紧接着自动保存 effect 看到当前页面尚未修改且没有待传图片，就删除同一个草稿键。

**触发与影响：**有未发布草稿时重新打开后台，不点“恢复草稿”，再次刷新或关闭页面。第一次仍可从内存恢复，第二次打开时持久备份已经丢失，未发布文字和附件可能无法找回。

**验证：**按实际 effect 顺序执行后，恢复提示状态仍在，`studio-draft-v1` 已不存在。独立反证复核确认。

**修复方向：**在用户完成恢复或丢弃选择之前暂停草稿自动保存与清理，明确区分“有待处理的历史草稿”和“当前编辑内容没有变化”。

### 02 恢复旧草稿会绕过版本冲突保护

位置：[StudioEditor.tsx](/workspace/personal-website/components/studio/StudioEditor.tsx:275)。

草稿记录了自己的 `baseSha`，恢复按钮却只恢复条目和图片，继续使用页面刚载入的最新 SHA。

**触发与影响：**草稿基于 A 版，另一个标签页已发布 B 版。刷新后台后恢复 A 的草稿，再发布，旧内容池会携带 B 的 SHA，通过服务端版本检查并覆盖 B 的新内容。

**验证：**实际恢复回调探针得到“旧稿内容＋最新 SHA”，独立复核确认没有后续合并或二次版本检查。

**修复方向：**保留草稿原始 SHA。与远端版本不同时要求解决冲突，不能给旧稿换上新版本号。

### 03 图片文件名冲突会替换其他日志的图片

位置：[StudioEditor.tsx](/workspace/personal-website/components/studio/StudioEditor.tsx:161)，文件名生成接线见 [image.ts](/workspace/personal-website/components/studio/image.ts:113)。

两条路径均已复现：

- 同批多选 `图一.png`、`图二.png`，中文名称均规范成 `image`。批处理中的回调持有同一份旧占用名单，两次产生相同路径，后图覆盖 pending 中的前图，两个图片块引用同一张图。
- 发布成功会清空 pending，但不将已发布文件名并入 `existingImages`。不刷新继续上传同日另一个中文名文件，又可能分配刚用过的路径，下一次发布覆盖旧图片，所有引用该路径的日志一起变图。

**验证：**两个实际回调探针分别确认同批同 src、发布后重复 src。服务端写入逻辑没有阻止这种非显式替换。

**修复方向：**同步预占文件名，并在整个编辑会话内维护已占用集合。服务端对已有路径增加冲突检查，明确替换应走独立语义。

### 04 删除有人坐着的家具会使仿真抛异常

位置：[cohabit.ts](/workspace/personal-website/src/lib/space/cohabit.ts:1120)，越界解引用见 [cohabit.ts](/workspace/personal-website/src/lib/space/cohabit.ts:2089)。

`refurnish()` 先替换座位数组，再逐个迁移访客的旧座位下标。第一位访客起身寻找站位时，会查询其他访客尚未迁移的旧下标，因此可能读到不存在的新座位。

最小复现使用真实模块：

```ts
const sim = new CohabitSim({
  trigger: 'posture', opening: false, faces: true, social: true,
});
sim.addPerson(sim.seats[0].x, sim.seats[0].y);
sim.addPerson(sim.seats[9].x, sim.seats[9].y);
sim.removeFurniture(0);
```

**结果：**抛出 `TypeError: Cannot read properties of undefined (reading 'node')`。家具和座位此时已经部分更新，后续状态也可能不一致。

**真实入口：**Lab 2-14 的“走、站、坐”规则启用 `social:true`。两人坐到左上沙发和最后椅子后，删除左上沙发即可触发。原有家具测试未打开 social，不能覆盖当前 UI 默认组合。

**修复方向：**先完成所有访客的座位映射或清空，再处理起身、站位与路线。迁移过程中不能读取混合了新旧下标的状态。

### 05 当前依赖仍落在已知安全公告的影响范围

位置：[package.json](/workspace/personal-website/package.json:29)、[package-lock.json](/workspace/personal-website/package-lock.json)。

本轮 `npm audit --omit=dev --json` 标记 Next、sharp、js-yaml、nanoid、source-map-js 和 baseline-browser-mapping 共 6 个依赖节点。锁定的 Next 为 `16.2.12`，当前公告已超出 package.json 注释所述“自身的公告已清”的状态。

**应优先关注：**[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) 涉及 App Router Server Actions 拒绝服务。本站 [actions.ts](/workspace/personal-website/app/studio/actions.ts:1) 使用 Server Actions，启用 Studio 后匿名登录表单会调用 `loginAction`。函数体中的密码校验不能保护框架解析请求之前的阶段。

**证据边界：**确认的是依赖版本命中和对应功能的使用路径，没有执行攻击或验证线上可利用性。扫描中的 Windows、next/og、`use cache`、图像优化等其他公告，不能不经条件判断就声称本站存在远程代码执行。没有把所有间接依赖的 build-time 风险当成公开 API 漏洞。

**修复方向：**按当前公告逐项升级到受支持的修复版本，更新锁文件与过时注释，随后跑完整构建和关键交互回归。不要盲目执行 `npm audit fix --force`。

## P2 功能与一致性问题

### 06 GitHub 并发检查仍有覆盖窗口

位置：[repo.ts](/workspace/personal-website/src/lib/studio/repo.ts:164)。

先按浮动分支读取内容池 blob 并检查 SHA，再单独读取 HEAD。如果其他提交恰好发生在两次读取之间，检查基于旧版本，而新提交的 parent 和 base tree 已改为别人的新 HEAD。最终是合法快进，`force:false` 也挡不住旧内容覆盖。

**验证：**对真实 `publishFiles()` 打桩，在两次读取之间推进分支，旧稿仍发布成功。独立复核确认。相比问题 02，这一问题需要较窄的并发时间窗口，因此列 P2，但同样有数据覆盖后果。

**修复方向：**先固定 HEAD，再按该不可变 commit 读取文件 SHA，并以同一 HEAD 创建提交。提交前分支已前进应转成明确冲突。

### 07 发布途中新增的图片会被成功响应清掉

位置：[StudioEditor.tsx](/workspace/personal-website/components/studio/StudioEditor.tsx:207)。

请求发出后表单仍能上传图片。旧请求成功时执行 `setPending({})`，连同请求发出后新增、尚未提交的图片一起清空。条目却继续引用这些图片，随后预览裂图、下次发布报图片不存在。

**验证：**延迟发布成功响应，通过真实表单回调新增图片，响应后 pending 为空而条目仍引用新图。

**修复方向：**仅清除该请求实际提交的图片，或发布期间冻结附件变更。保留请求快照与当前编辑状态的区别。

### 08 切空间档位后猫仍执行旧路线

位置：[cohabit.ts](/workspace/personal-website/src/lib/space/cohabit.ts:956)，UI 调用见 [CohabitBench.tsx](/workspace/personal-website/components/lab/CohabitBench.tsx:312)。

从“空房间”切到“会动的单元”时，只改变猫的 `unit` 并清掉部分转移状态，没有清理 walker 的路线和运动状态。猫被登记到平台，却继续沿原地面路线跨越平台空隙。

**验证：**按台架配置、种子 11，在约 42.067 秒切档。3 秒后猫距登记支撑中心约 1.65m，平台半径约 0.254m，仍登记为 unit 0。支撑保护与实际脚下位置不一致。

**修复方向：**作为完整状态迁移处理切档，重新建立合法落点、路线与支撑。若保留地面身份，应按新空间重新规划，不能仅换一个 unit 编号。

### 09 普通手机首页的 Lab 预览为空

位置：[HomeScroll.tsx](/workspace/personal-website/components/site/home/HomeScroll.tsx:226)、[ZonePage.tsx](/workspace/personal-website/components/site/home/ZonePage.tsx:51)。

文档流模式下导航只滚动，不更新 `page`。预览首次挂载又要求 `active={page === 3}`，普通访问 `/` 后滚到 Lab 时该条件一直不成立。

**浏览器验证：**390×844 访问 `/`，将预览实际滚进视口后，预览容器子节点数为 0。直接访问 `/#lab` 的对照组为 1。1280px 开启减少动态效果也复现空白。因此只测深链会漏掉问题。

**修复方向：**文档流模式按真实可见性启用预览，同时使导航高亮与实际读位同步。

### 10 切换到手机布局后目录与日志保持透明

位置：[HomeScroll.tsx](/workspace/personal-website/components/site/home/HomeScroll.tsx:185)、[HomeScroll.tsx](/workspace/personal-website/components/site/home/HomeScroll.tsx:460)。

桌面首次打开时，代码给待显现条目写入 `opacity:0`。未进入 Lab 前将窗口缩到手机宽度，或切到减少动态效果，媒体查询回调只重排 section，没有清理这些内联样式，文档流模式又不会执行 reveal。

**浏览器验证：**1280px 打开再缩到 390px，Lab 条目的实际 computed opacity 仍为 0。元素占位且能参与交互，读者却看不到内容。

**修复方向：**进入文档流时显式恢复所有内容可见并清理动画状态，回到分页模式时重新建立必要的观察关系。

### 11 首页 Space 按键抢走按钮的原生操作

位置：[HomeScroll.tsx](/workspace/personal-website/components/site/home/HomeScroll.tsx:346)。

全局 keydown 只排除输入框等元素，没排除按钮，也未尊重 `defaultPrevented`。按 Space 被拦成翻页，按钮原本的激活行为被取消。

**浏览器验证：**桌面首页聚焦第二个轮播按钮后按 Space，当前轮播仍为第一项，页面却进入 Work。

**修复方向：**保留交互控件的原生键盘语义，仅在适当的页面背景上下文处理翻页快捷键。

### 12 减少动态效果时四杆松手后不再收敛

位置：[controller.ts](/workspace/personal-website/src/lib/linkage/controller.ts:175)。

软拖拽会留下杆长误差。减少动态效果模式下 `pointerUp()` 直接进入 idle，非动力学四杆的后续 frame 不再投影约束，因此把变形一起冻结。

**验证：**真实四杆 P 点拖至 viewBox `(500,100)`，运行 30 帧后松手。再运行 120 帧误差仍为 18.2858918px。单独无拖拽 `iterate(36)` 后降至 0.0000273px。

**影响范围复核：**列明四杆入口，不能泛称所有机构。拱环调用链另有 `archStopPass()`，会继续迭代。

**修复方向：**停止自转的同时，在松手后执行有限次无拖拽约束收敛，然后保持静止。

### 13 React 拱环台架漏掉可拖拽手柄限制

位置：[ArchBench.tsx](/workspace/personal-website/components/lab/ArchBench.tsx:197)，对照 [原演示页](/workspace/personal-website/src/demo/arch.ts:152)。

原演示页先执行 `nearestHandleWithin()`，仅允许抓拱顶、四脚、曲柄销。React 页面把白名单只用于绘制，指针事件直接交给控制器，导致中段节点及不可见支撑点也能命中。

**验证：**节点 0 距最近合法手柄约 102.77px，仍可抓住。向下拖 160px 并按实际台架步进 30 步，第 6 块板翻面，误差约 20.65px。松手约 10 秒可恢复，不是永久损坏。

**修复方向：**共享命中白名单逻辑。此处是两套页面接线维护分叉的具体实例，无需改物理内核。

### 14 旧日志编辑后引用会指向另一条内容

位置：[log-facets.ts](/workspace/personal-website/src/lib/site/log-facets.ts:298)。

锚点仍由日期和当天序号生成。新条目追加在同日末尾只解决了新增情况，删除旧条目或改日期仍会重新编号。

**真实内容池复现：**删除 2026-07-27 当日第一条后，原第 3 条 “Cut the simulation down to a single minute-scale clock…” 仍然存在，但 `/archive#log-2026-07-27-3` 改指 “Brought the existing live benches into the site…”。发布校验仍通过。当前 36 个日期有多条日志。

**影响：**案例正文引用静默改变含义，HTTP 200 和普通锚点存在性检查都发现不了。当前引用均存在，不能将其描述成当前全部断链。

**修复方向：**落盘不可变 ID，并固定现有链接的映射。日期和排序只负责展示，不再充当条目身份。

### 15 筹备页也加载完整实验终态数据

位置：[案例模板](/workspace/personal-website/app/(site)/work/[slug]/page.tsx:48)、[skinTerminal.ts](/workspace/personal-website/components/lab/skinTerminal.ts:4)。

共享案例模板静态导入两项目全部实验组件，连带引入完整生成终态 JSON。即使项目三只显示“筹备中”，仍承担这部分脚本加载和解析成本。

**新生产构建验证：**三个案例页 HTML 初始 JS 清单相同，各 19 个 chunk，合计 3,344,381 B，逐文件 gzip 加总 875,036 B。其中终态数据块单独为 2,142,444 B，gzip 475,364 B。浏览器访问本地生产筹备页也确认加载了该块。

这些数字包含框架代码，表示初始脚本体积，不是线上 LCP 或每次实际网络传输。浏览器缓存和动态预取会影响观测值。

**修复方向：**按项目和实际使用的实验组件拆分依赖边界。保留已批准的预计算终态机制，只让需要它的页面加载。

### 16 窄屏首页日志时间轴的英文标签和日期标记重叠（复验新增，已修复）

位置：[home.css](/workspace/personal-website/components/site/home/home.css:347)、[ZonePage.tsx](/workspace/personal-website/components/site/home/ZonePage.tsx:308)。

窄屏把标签列缩到 96px，但泳道仍固定 28px 高。长项目名称换行后会挤到下一泳道；手机的最后一个月份与 today 标记也会重叠。320、390、820px 均复现标签溢出。旧提示框位置还硬编码桌面的列宽和行高。

已仅在窄屏增加泳道空间、约束标签与计数的列布局，手机 today 单独排一行；提示框与图表共用尺寸变量。文字、字号和动画保持原样，1280px 桌面截图完全相同。验证记录见上方修复证据。

## 架构与重复实现的维护改进

以下四项列 P3，不与已复现功能缺陷混计。

1. **相机数学维护了四份。** `m2q` 17 行、`q2m` 8 行在 [RingsBench](/workspace/personal-website/components/lab/RingsBench.tsx:125)、[MachineBench](/workspace/personal-website/components/lab/MachineBench.tsx:332)、[SkinSolidBench](/workspace/personal-website/components/lab/SkinSolidBench.tsx:136)、[shell3d](/workspace/personal-website/src/demo/shell3d.ts:219) 规范化后完全相同，`slerpQ` 也基本相同。适合提取纯数学，机位和页面接线仍由各实例配置。
2. **部分组件职责过多。** SkinSolidBench 约 1,629 行，同时管理求解、相机、GPU 几何、播放、终态恢复和 UI。现有复用有效，宜逐步抽出播放器状态与渲染生命周期，不建议推倒重写。HomeScroll 的 DOM 状态、React page 状态、媒体查询应建立一致的状态来源，本轮三项首页问题与这处边界直接相关。
3. **构建缺少全站链接检查。** [package.json](/workspace/personal-website/package.json:6) 没有 SITE_SPEC 要求的 `check-links`。现有内容检查不等于最终渲染页面中的所有 href 都有效。补构建后链接检查，同时针对日志引用增加身份稳定性回归。
4. **现行规则与历史条目混在一起。** SITE_SPEC 保留早期禁止转场等表述，后续 MAPPING 已批准转场。AGENTS/CLAUDE 又积累了大量历史记录。宜增加简短的现行规则索引，避免后来开发者误把已批准设计当违规。保留历史原文。

合理重复不建议删除：双语正文、生成终态数据、构建复制网格、已批准的 2D/3D 平行内核，以及 Vite 验收页与 React 正式页面的不同外壳。应共享的是容易分叉的规则和纯函数，不是强行合并所有入口。

## 尚未确认的资源回收影响

[HomeLabPreview.tsx](/workspace/personal-website/components/site/HomeLabPreview.tsx:40) 的 cleanup 用外层 host 是否连接 DOM 判断是否释放 WebGL。切换 no 时 host 会复用，因此预期的显式释放被跳过。

本地生产 Chromium 连续切换 24 次三维预览，记录到 26 次上下文创建、0 次 context lost，没有出现“Too many active WebGL contexts”、页面异常或已确认的空白台架。浏览器可能通过垃圾回收回收旧对象。**不能据此宣称已证明显存泄漏或线上崩溃**。建议进一步验证低资源设备和资源恢复，再决定是否提升为功能缺陷。

## 自查结论与修复顺序

已做第二轮独立反证复核：草稿清理时序、旧草稿 SHA、GitHub 并发窗口、家具座位迁移、四杆收敛。复核修正了两处可能夸大的表述：第一次打开后台草稿仍在内存中，以及四杆问题不能泛称所有台架。

已剔除的候选包括：文档明确接受的立体演示简化、Lab 未放大时让单指滑页、2D/3D 平行内核、没有真实入口的快照疑点，以及“关闭自走是否应立即停止当前一程”这种尚不明确的语义。没有把这些与已确认 bug 混列。

建议分三批修复：

1. **保护内容与基本运行：**01–05，随后补 06–07。重点防止未发布草稿丢失、图片被替换和旧内容覆盖新内容。
2. **恢复可见与可操作行为：**08–13，验证切档、移动端、减少动态效果、键盘和拖拽这些交互边界。
3. **稳定引用与加载边界：**14–15，再整理相机数学、组件职责和链接检查。每批都补对应用户场景的回归，不能只重跑现有绿色测试。

## 证据与复查入口

独立证据目录：[project-audit-2026-10-23](/workspace/project-audit-2026-10-23)。

- [全套测试及 Vite 构建记录](/workspace/project-audit-2026-10-23/project-audit-build.log)
- [Next 生产构建记录](/workspace/project-audit-2026-10-23/project-audit-next-build.log)
- [类型检查记录](/workspace/project-audit-2026-10-23/project-audit-typecheck.log)
- [依赖审计原始结果](/workspace/project-audit-2026-10-23/project-audit-deps.json)
- [首页浏览器结果](/workspace/project-audit-2026-10-23/browser/browser.json) 与 [手机和深链对照](/workspace/project-audit-2026-10-23/browser/browser-more.json)
- [路由冒烟记录](/workspace/project-audit-2026-10-23/browser/smoke.json)
- [手机空预览截图](/workspace/project-audit-2026-10-23/browser/mobile_normal.png) 与 [断点切换截图](/workspace/project-audit-2026-10-23/browser/resized-lab.png)
- [生产包和 WebGL 浏览器记录](/workspace/project-audit-2026-10-23/browser/production.json)
- [脚本体积结果](/workspace/project-audit-2026-10-23/project-audit-bundles.json) 与 [只读复查脚本](/workspace/project-audit-2026-10-23/project-audit-bundles.py)
- [Studio 定向探针](/workspace/project-audit-2026-10-23/probes/studio/studio-review.test.ts) 与 [运行结果](/workspace/project-audit-2026-10-23/probes/studio/results.txt)
- [空间仿真复现脚本](/workspace/project-audit-2026-10-23/probes/space/reproduce.mjs) 与 [运行结果](/workspace/project-audit-2026-10-23/probes/space/output.txt)
- [四杆收敛复现脚本](/workspace/project-audit-2026-10-23/probes/linkage/reduced-motion-residual.mjs) 与 [拱环命中复现脚本](/workspace/project-audit-2026-10-23/probes/linkage/arch-handle-filter.mjs)

从项目目录运行 Studio 探针：

```sh
./node_modules/.bin/vitest run --config /workspace/project-audit-2026-10-23/probes/studio/vitest.config.mjs
```

证据中的浏览器脚本依赖本地 Chromium 和 Playwright，默认使用 3100 开发端口、3101 生产端口。审计结束会停止本轮启动的服务，重跑前需要自行启动对应本地服务器。仿真探针位于证据目录的 `probes/linkage` 和 `probes/space`。
