# Lab 优化实施与自查记录

日期：2026-10-23。依据：[21 台审核报告](/workspace/personal-website/LAB_OPTIMIZATION_REVIEW_2026-10-23.md)。用户确认实施后，在上一轮修复的工作区上继续修改。修改前保存 315 个相关文件，哈希与报告基线全部一致；未回退原有修复。

## 已实施

| 范围 | 实际改动 | 保持的行为 |
|---|---|---|
| **2-9 单元关系，L01** | 用实际 spec、规范化选项和 delay 构造物理身份，切错层后更新真正的高度输入；中英提示同步限定为“换间距不重解” | 仅间距变化不重播；仍区分不同启动延迟 |
| **2-13 单元组合，L02** | 将实例编制更新与求解状态更新分开，同谱的台阶切拱正确重建摆放映射 | 保留有效求解器、成形进度及终态；第二个主体和正确键数恢复 |
| **1-1～1-6 机械** | HUD 按现有显示精度与语义去重；执行器面板复用相同快照；五环接回既有 skin 工具；触手/整机共享局部刚架与固定资产的 CPU 烘焙结果 | 阻尼、拖动热区、松手衔接、物理时间步、行为事件、读数发布频率不变 |
| **共用 WebGL 渲染器** | 四种 program 的句柄在构造时缓存；每帧仅转置一次 view | shader、上传数据、混合/深度状态、绘制次序不变；GL 对象仍各 context 独立 |
| **2-2～2-5、2-7～2-9、2-13 形态** | 同一几何版本缓存平滑、实体、芯轨、键线、膜和桥网；cells 内同一解共享局部实体 | 缓存随推进、EMA、终态、重播、半径、布局及编制失效；透明排序仍每帧随相机更新 |
| **2-9 错相** | 相同物理输入和 delay 只求解一次，保留逻辑槽位到共享解的映射；代表九宫由 9 解变 5 解 | 每个独立解每步只推进一次；150 步波延迟、原速率、显示数量和 HUD 保留 |
| **2-6 多层** | 静止目标改为按需绘制；膜索引并入既有拓扑缓存 | 相机输入立即绘制；首帧、尺寸/可见性恢复、模式切换补画；成形进度保留 |
| **2-14、2-15 人猫** | 固定全长带端点在实例内缓存，两份相同几何 Catchment 共用只读采样表 | 两份可变场、演员、响应和 RNG 独立；动态半径带段仍实时计算 |
| **2-11 多人及公共输入反馈** | RNG 工厂复用既有 seededRng；连续输入取消旧扫线，仅保留当前动画 | 每人独立随机流；相同随机调用次序；扫线仍是原 900ms 装饰反馈 |
| **2-1、2-10、2-12** | 保留审核确认已有的求解/更新机制；2-1 错误的拖拽提示改为“观察成形” | 不增加原本不存在的控制，不修改步序、猫支撑和落点准备 |

核心入口：[SkinSolidBench](/workspace/personal-website/components/lab/SkinSolidBench.tsx)、[模拟身份与去重](/workspace/personal-website/src/lib/space/skin-simulation-input.ts)、[FlatRenderer](/workspace/personal-website/src/lib/linkage/gl3d.ts)、[触手绘制复用](/workspace/personal-website/src/lib/linkage/tentacle3d-render.ts)、[多层目标输入](/workspace/personal-website/components/lab/SkinLayersBench.tsx)、[CohabitSim](/workspace/personal-website/src/lib/space/cohabit.ts)。

## 自查与验证

所有新旧对照使用本轮开始前的实际源码快照，而非 Git HEAD。没有以终态相似代替成形过程检查。

- **机械**：五条完整状态轨迹各 6 个检查点一致；360 帧 × 7 个局部/世界刚架一致；24 次触手、72 次整机大臂、56 次五环绘制的参数与数组完全一致。五个 HUD 各回放 5,000 帧，可见读数与语义相同；共享资产的失败重试和卸载后不更新均通过。
- **形态**：8 组、1,494 帧对照的几何字节、绘制顺序、透明度、相机矩阵和 HUD 一致；包括 2-8 完整 1,500 步、2-9 完整 2,100 tick 的原 9 解与新 5 解。16 项针对测试覆盖 L01/L02、映射连续性、缓存失效和输入身份。
- **多层**：132 组几何输出的顶点与索引原始字节一致，覆盖形态、连接深度、不同协议步和 pose/whole 模式。
- **行为**：26 场景、303 状态检查点一致，覆盖拖放、增删、空间切换、家具、事件和随机序列；检查包含完整数组和非有限数值。
- **渲染器**：1,261 条非查询 GL 命令及上传字节一致；跨实例/context 隔离与深度/混合恢复通过。
- **独立复核**：另一路只读检查了共享引用、缓存失效、异步生命周期、计数/速率和目标按需绘制，未发现阻断问题。确认本轮仅修改 21 个既有文件、新增 5 个源码/测试文件，其余 294 个基线文件未变；前轮修复和页面样式保持基线版本。
- **完整集成检查**：`npm run test -- --maxWorkers=1`，**97 文件 / 1,094 测试全过**；292 份终态数据全部复用。TypeScript、资产复制、Vite 与 Next 生产构建全部通过，`git diff --check` 通过。完整测试只运行一遍，构建阶段分别执行，避免重复跑全套测试。pretest 的 Vite 开发 WebSocket 在沙箱内出现端口权限警告，但生成器及全部测试正常完成、退出码为 0；正式生产构建在允许本地端口的环境完成。
- **生产浏览器回归**：全部 **21 台**展开运行，无 pageerror、WebGL context lost 或不可用提示。共 **30 组新旧截图逐像素一致**：17 组终态/视角/重播/拖动/移动视口，7 组多层圆方及目标↔成形切换，6 组右拖、滚轮、双指缩放平移、归位、触摸后再拖和重新进入。移动视口无横向溢出。
- **两处 bug**：L01 直接切错层与强制重建后相同最终选择的画面一致；L02 直接台阶切拱与强制重建后的画面一致，均为完整两格、440 键。保留修复前截图作为原错误证据。
- **复用场景**：两篇案例页 9 个画布正常显示，无加载错误；首页 2-6 目标预览首帧正常。最后仅补正 2-9 中英提示，随后再运行 Next 生产构建与类型检查，均通过。

恢复场景初次有 3 张截图不匹配。自查确认脚本在原有 560ms 关闭动画结束前再次点击，实际比较的是不同收起/展开状态；补上状态及动画完成断言后，仅复测相关场景，全部一致。原关闭逻辑逐字未变，没有据此修改产品交互。原始差异保存在 `browser-comparison-initial.json` 和 `*-after-initial/`，最终结果见下方链接。

集成证据：[完整测试日志](/workspace/lab-optimization-implementation-2026-10-23/full-tests.log)、[最终生产构建](/workspace/lab-optimization-implementation-2026-10-23/next-build-final.log)、[30 组画面对照](/workspace/lab-optimization-implementation-2026-10-23/browser-comparison.json)、[两处切档复验](/workspace/lab-optimization-implementation-2026-10-23/browser-fixes/comparison.json)、[21 台运行记录](/workspace/lab-optimization-implementation-2026-10-23/browser-smoke/profile.json)、[案例页](/workspace/lab-optimization-implementation-2026-10-23/site-smoke/results.json)、[首页](/workspace/lab-optimization-implementation-2026-10-23/site-smoke/home-results.json)、[本轮独立源码差异](/workspace/lab-optimization-implementation-2026-10-23/implementation-source.patch)。

专项证据：[机械](/workspace/lab-optimization-implementation-2026-10-23/linkage/RESULT.md)、[形态](/workspace/lab-optimization-implementation-2026-10-23/shapes/README.md)、[行为](/workspace/lab-optimization-implementation-2026-10-23/behavior/README.md)、[输入](/workspace/lab-optimization-implementation-2026-10-23/input/IMPLEMENTATION.md)、[渲染器](/workspace/lab-optimization-implementation-2026-10-23/renderer/README.md)。

## 收益与取舍

- 触手局部刚架由每帧 **20 次变 7 次**；五环相同精度的边界采样由 **16 次变 10 次**。这不是降低采样分辨率。
- GL 探针中 5 帧的重复句柄查询由 **600 次变 0 次**；查询移至每个 renderer 构造时，未跨 context 共用对象。
- 生产浏览器的 2-6 目标视图在五个静止观察窗口内均无重绘或上传，拖动与参数输入仍即时绘制，前后画面一致。40 次连续 input 的活动扫线由 **40 个变 1 个**。
- 行为模型的相同工作量探针中，全长带段调用仍为 **5,630,620 次**，端点数组构造由同样数量变成实例初始化的 **1,280 份**。五组交替测量的中位 CPU 时间：正常场景约 1,388→1,115ms，最大场景 2,486→1,894ms，痕迹场景 2,450→1,772ms；固定场景约 109ms，基本不变。这是纯模型执行时间，不能换算成浏览器 FPS。
- 固定触手 CPU 烘焙结果成功后保留约 **9.48MB / JavaScript realm**，换取后续挂载免重复烘焙；GPU 缓冲仍独立。失败时释放 promise，后续调用可以重试。
- 形态 CPU 几何缓存不等于 GPU 上传缓存，本轮不将两者混报。

## 本轮保留的候选项

未扩用静态 GPU 驻留：现有静态 API 的透明语义和资源生命周期需要单独设计与验证，本轮保留原上传/绘制路径。未做槽端离线表、梯度暂存、曲线横坐标缓存、装配计划进一步缓存或播放器拆分；这些没有足够收益证据支持扩大改动面。未改尚未复现的多指所有权/空场快路径，也未精简行为状态机。

以上保留项不影响两处已确认 bug 的修复。自动化能验证具体输入的状态、画面和事件响应；云端软件 WebGL 的结果不能代表所有真机 GPU、触屏延迟或主观操作手感。
