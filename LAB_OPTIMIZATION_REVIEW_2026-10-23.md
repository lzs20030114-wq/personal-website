# Lab 内部算法、复用与操作体验优化报告

日期：2026-10-23。范围：当前全部 **21 台 Lab**，包括求解、行为、几何装配、渲染、输入和读数更新。基线是上一轮修复后的工作区，并非仅 Git HEAD。已先复读 [上一轮审核与修复报告](/workspace/personal-website/CODE_REVIEW_2026-10-23.md) 和各实验规范。

本文件保留“先看报告再改”阶段的审核、基线和建议。用户随后确认实施；实际完成项、未实施项与验证结果见 [Lab 优化实施与自查记录](/workspace/personal-website/LAB_OPTIMIZATION_RESULTS_2026-10-23.md)。上一轮修复保持原状。

## 结论与处理顺序

现有“纯算法 → 台架控制 → 绘制”的分层成立；多数台架已经共享内核。最有价值的方向是减少同一输入的重复计算、重复上传和无变化的更新。没有证据支持整体重写、统一所有时间步，或降低精度来换帧率。

建议分为三批：

1. **先修两处切档身份错误**：2-9 错相关系切换沿用旧高度；2-13 台阶切拱沿用旧摆放表。它们影响结果正确性，不能被缓存优化掩盖。
2. **先落地可保持输出一致的优化**：共享 WebGL 句柄缓存；2-7/2-8 等阵列共享相同局部几何；2-14/2-15 缓存固定带端点；2-6 静止目标按需绘制；机械 HUD 等值去重；扫线保持单个动画。
3. **再做需要更多边界验证的复用**：九宫错相的相同求解输入去重、静态 GPU 网格扩用、膜索引共享、不可变采样表共用。指针清理和空场快路径先补复现/接口约束，不混进第一批。

“不让手感更差”作为验收条件：保持原有阻尼、拖动增益、命中范围、松手衔接、求解顺序、随机序列、成形节奏、相机预设和画面细节；不得以降低采样/物理频率、减少结构、改用近似轨迹来完成优化。

## 新确认的正确性问题

### L01 · P2：2-9 错相下切关系，界面与实际高度不一致

位置：[SkinClusterBench.tsx:125](/workspace/personal-website/components/lab/SkinClusterBench.tsx:125)、[引擎更新条件](/workspace/personal-website/components/lab/SkinSolidBench.tsx:1375)、[高度构造](/workspace/personal-website/src/lib/space/unit-cluster.ts:309)。

`unitsKey` 在错相模式只含形态、时序、编制；关系变化可能改变每格的 lead，但 key 不变。`cellsKey` 只触发重摆，没有更换求解器的输入。

**浏览器复现**：一对 → 分离·齐平 → 错相 → 跳过成形 → 分离·错层。界面显示两级，实际两个平台仍齐平。保持最终选择不变，切同步再切错相触发重建，第二个平台才升高。九宫纯模块探针也确认同 key 下多格 lead 不同。

最小修复方向：物理身份覆盖实际键谱、选项、lead、delay 和映射；仅间距变化仍保留进度，相同物理输入不重解。不能简单把所有关系变化都设成重播。

证据：[错误高度截图](/workspace/lab-optimization-review-2026-10-23/browser/cluster-stale.png)、[相同最终选择重建后的截图](/workspace/lab-optimization-review-2026-10-23/browser/cluster-refreshed.png)、[构造输入对照](/workspace/lab-optimization-review-2026-10-23/shapes/results.json)。

### L02 · P2：2-13 台阶切拱，第二个单元主体缺失

位置：[SkinComboBench.tsx:109](/workspace/personal-website/components/lab/SkinComboBench.tsx:109)、[共享更新入口](/workspace/personal-website/components/lab/SkinSolidBench.tsx:1375)。

台阶和拱可使用同一组求解器，因而 `unitsKey` 相同；但 `ringPlans` 从一份变成两份，第二格需要 plan 1。当前仅重摆 cells，保留旧 `planList/insts`，找不到第二格的带实例。

**浏览器复现**：圆环、直挑台 → 台阶 → 跳过成形 → 拱。第二格只剩天花环，主体缺失。切坡降再切回拱后，保持相同最终控件选择，第二格恢复，HUD 键数从220恢复为440。

最小修复方向：把“求解状态”和“实例编制”独立更新；ringPlans 变化时重建实例映射，复用仍有效的求解状态。直接把所有 plan 写入物理重建 key 虽能遮住问题，却会让本可连续的切换倒带，不作为首选。

证据：[缺失截图](/workspace/lab-optimization-review-2026-10-23/browser/combo-stale.png)、[重建对照](/workspace/lab-optimization-review-2026-10-23/browser/combo-refreshed.png)、[64 配置身份检查](/workspace/lab-optimization-review-2026-10-23/shapes/layers/identity-results.json)。

## 21 台逐项检查

下表每台都检查了实际调用链。“保留内核”不是漏审，而是现有成本或风险不支持改写。共享层的一项优化可能覆盖多台，避免逐台复制新实现。

| 台架 | 当前算法与内部复用 | 优化判断与必须保留的行为 |
|---|---|---|
| **1-1 四杆** | 2D PBD、LinkageController、命令式 SVG | 求解很轻，保留。HUD 按实际显示精度去重；保留轨迹、24px 命中、拖动限制、松手继承角速度及残差收敛。 |
| **1-2 拱环** | 固定步长驱动、2D 约束、archStopPass | 保留求解及止挡顺序。先减无变化的 HUD 更新；继续使用上一轮已统一的可交互手柄规则，不扩命中区。 |
| **1-3 肌腱触手** | 3D 约束、三路临界阻尼、OrbitCamera、FlatRenderer | 七节刚架可每帧计算一次供零件/蒙皮共用；与整机共享同一公式。梯度临时数组可复用，但收益小。保留阻尼 5、三肌腱输入与 trackball。 |
| **1-4 五环** | 五个拱环投影、shell3d、蒙皮、共享渲染器 | 本地重采样/三角索引/排序可复用现有 skin 模块；保持三角顺序和透明排序。首次标定已有缓存，不能报成每台每帧重新标定。 |
| **1-5 整机编排** | MachineBench 整合五环、触手、小触手和编排器 | 优先共用触手刚架及 GL 句柄缓存，机械 HUD 等值去重。固定机位和暂停仍松弛是现行设计；不为复用重挂载模型。 |
| **1-6 行为整机** | 同一 MachineBench，行为引擎→执行器→同一机械层 | 行为引擎本身很轻，保留生命周期、人格、随机序列和触摸采样。执行器面板优先跳过相同快照的重渲染，再缓存不变的曲线横坐标；保持12Hz发布，不统一降成5Hz，也不丢手势事件。 |
| **2-1 收缩皮肤** | 四条 SkinUnit、SVG、协议步、内存终态 | 已有 n>0 才绘制及 HUD 去重，核心保留。可作为其他台的更新参考。目录 `drag ℓ` 与现有播放控件不符，属于提示文案问题；不因此新增物理输入。 |
| **2-2 皮肤实体** | 同一四条 2D 剖面经 skin-solid 挤出，SkinSolidBench | 缓存无几何变化帧的平滑、实体和键线；固定静件复用现有静态 GPU API。相机和视角动画持续响应。 |
| **2-3 双结构** | 五条不同双谱，完整复用 SkinSolidBench | 构造已 memo；共享 2-2 的渲染优化。不同间距的谱不能合成一个解；保留当前换谱、终态与相机行为。 |
| **2-4 序列** | 12 条渐变谱/10 条捏分谱，构造已有缓存 | 优化共享几何层，保留所有独立谱、80 步/s 和并拢/分列不倒带；不能只比终态而忽略成形全过程。 |
| **2-5 圆筒环** | 五种编制，1/10/11 条独立引擎摆成 20 带 | 先做无变化帧缓存。此单环分支把角度烘入 Float32 顶点，改成 GPU 旋转可能改变舍入，排在已有 cells 分支去重之后。 |
| **2-6 单元内多层** | 目标几何与四条真实成形引擎分层；目标 memo、成形 surface 缓存已存在 | 静止目标按需画；相同节点数膜索引共享；study 不变的装配计划缓存。保留 raw 节点、四次径向更新、动态端盖和切模式不丢进度。 |
| **2-7 方形环** | 按 k / k+lead 去重，单环与 4×4 共用台架 | 阵列的相同局部带烘焙可共享，代表配置 40→6 次；保持原 draw 顺序、所有摆位与方形读法，不减少深度档。 |
| **2-8 4×4 阵列** | 同形已只解一条，每行一种已只解四条 | 优先优化局部实体重复烘焙：40→2 或160→8 次。不是把16个引擎压成1个——物理去重原本已做。保持每格位置和膜排序。 |
| **2-9 单元关系** | 同步按高度级共享；错相每格一个实例 | 先修 L01，再按 spec+opts+delay 精确去重；九宫代表场景9→5，三层错层9→6。保留150步波延迟、各格映射、显示计数。 |
| **2-10 单人行走** | Walker→TraceField→Catchment→Activation，drawPlan | 底层复用充分，核心保留；采样表仅布局/读法变时建，不是逐帧热点。输入侧检查多指所有权，未复现前不宣称正常拖动有 bug。 |
| **2-11 多人** | 共用 Walker/场/响应，有序逐人叠加，全场一次更新 | 不做新的通用人群引擎。可共用重复 RNG 工厂，保持每人独立随机流与调用顺序。不得把叠加强度改平均，也不擅加避让规则。 |
| **2-12 猫** | CatPlanSim 扩展 PlanSim，cat-rules 共用动作与节奏 | 保留每个1/60子步完整 super.step、落点预备和支撑。现有 pointerId 清理及按显示键去重的 HUD 可供别台参考；不删下一步平台准备计算。 |
| **2-13 单元组合** | 两族八图形，已按谱+lead 去重，复用 Solid | 先修 L02；再受益于局部几何缓存。构造中位<0.14ms，优先级低；最多圆环25、方环28条引擎属真实差异，不减图形/级数/现行速率。 |
| **2-14 人猫同台** | CohabitSim 复用场、采样、响应、Walker；独立人猫规则 | 缓存固定全长带几何，复用同实例的不可变 Catchment。保留演员→事件→空间次序、猫支撑、门路可达性、家具和座位迁移。 |
| **2-15 人猫立体** | 直接复用 CohabitSim，一条真实形成/回程轨迹驱动1280带；已有静态 GPU 网格 | 同享2-14模型优化和GL句柄缓存。已有关键帧网格、静止整环缓存继续用；不把后台烘焙改回rAF，也不误做1280份独立求解。 |

逐台源代码位置及更细约束见：[机械专项](/workspace/lab-optimization-review-2026-10-23/linkage/review.md)、[形态专项](/workspace/lab-optimization-review-2026-10-23/shapes/review.md)、[行为专项](/workspace/lab-optimization-review-2026-10-23/behavior/review.md)、[21 台输入与 HUD 专项](/workspace/lab-optimization-review-2026-10-23/input/review.md)。

## 可直接调用的内部能力与最小架构调整

| 已有能力 | 应怎样复用 | 边界 |
|---|---|---|
| [skin.ts](/workspace/personal-website/src/lib/linkage/skin.ts:17)：resample、bandTriIndex、bandVerts、bandsFarToNear | 让 Rings 使用与 Machine 相同的蒙皮工具，去掉相同公式副本 | 原点顺序、采样数、三角绕向和透明排序不变。 |
| [FlatRenderer](/workspace/personal-website/src/lib/linkage/gl3d.ts:404) | 构造/链接时保存 uniform/attribute 句柄；每帧仅写值。view 转置每帧算一次 | 缓存属于各 WebGL context/program；不全局共享 GL 对象，不改 shader。 |
| [addMesh](/workspace/personal-website/src/lib/linkage/gl3d.ts:441)、[drawMeshAt](/workspace/personal-website/src/lib/linkage/gl3d.ts:639) | 扩用2-15已采用的驻留网格路径，先处理不透明房间、比例人、固定环板等 | drawMeshAt 当前没有 alpha 语义，不能直接替换半透明膜；保持深度写入、混合和远近顺序。 |
| [SkinSolidBench 几何循环](/workspace/personal-website/components/lab/SkinSolidBench.tsx:905) | 局部增加几何版本缓存，cells 分支同一 sim 共用 A/B 烘焙结果；不必先拆整个组件 | 版本必须覆盖 EMA、终态提交、重播、换谱及几何参数；不能只看 step 或可变数组身份。 |
| [skinTerminalSignature](/workspace/personal-website/src/lib/space/skin-terminal-format.ts:20) | 在2-9模拟去重中复用值签名，并追加 delay，保留原slot→unique映射 | 终态可以忽略delay；运行中的模拟不能。共享不可变数据，避免共享会被独立修改的状态。 |
| [SkinLayers 成形缓存](/workspace/personal-website/components/lab/SkinLayersForming.tsx:23) | 在已有缓存旁增加按n的只读膜索引缓存；复用已有surface结果 | 当前bake WeakMap看数组身份。以后若原地复用顶点数组，必须同时改版本管理，否则会画旧形状。 |
| [TraceField/Catchment/Activation](/workspace/personal-website/src/lib/space/unit-activation.ts:462) | Cohabit两份相同几何Catchment共用；固定带段以layout为生命周期缓存 | 不共享field.data、演员、Activation或RNG；缓存键包含实际网格几何和读法。 |
| [useBenchLoop](/workspace/personal-website/components/lab/useBenchLoop.ts:18)、[labCameraInput](/workspace/personal-website/components/lab/labCameraInput.ts:14) | 保留已做的离屏/后台门控；指针清理可沿现有桥局部补强 | 不统一各台物理时钟，不改变trackball/turntable/固定相机的差异。 |

**共享层的具体注意事项：**

- 几何缓存先复用 CPU 数组并保持原 draw 顺序，再独立验证 GPU 驻留。减少数组分配不等于减少 GPU 上传，两项收益分开验收。
- SkinSolid 的暂停/终态仍有控件依赖持续 render，例如部分复选框只改 ref。必须列全失效入口后才可停止重画；2-6 静止目标更适合作为按需绘制的首个试点。
- 机械 HUD 只跳过“格式化后的可见内容完全相同”的发布。行为 HUD、物理更新和执行器12Hz面板分别保持原时序。
- [工作区扫线](/workspace/personal-website/components/lab/LabWorkspace.tsx:237) 每个控件事件都会创建一个900ms动画。浏览器派发40个合成input事件后，存活动画从0变40，确认累积路径；这不是实际触控延迟测量。可保留同一Animation并重启，保持原关键帧、曲线和 reduced-motion 分支。“求解中”是设计指定的反馈效果，不是需要接入真实进度的错误。
- 不把人类门路寻路与猫的平台四邻寻路强合并；两者的障碍、支撑、优先顺序不同。也没有证据支持为最多12人3猫引入空间树或新框架。

## 本轮测量与证据

### 浏览器：逐台测实际提交量

使用现有生产构建，本地 Chromium，1280×900，逐台放大隔离，短暂预热后采样约1.5秒。记录 WebGL/Canvas/SVG 调用；全部21台采样期间无 pageerror，无 context lost。环境使用软件 WebGL，**不把采样帧数或 rAF 时长当成真机帧率、触控延迟或GPU耗时**。

| 代表台架/当前状态 | 每绘制帧 bufferData 次数 | 每帧上传 MiB | 每帧 uniform+attribute 查询 | 含义 |
|---|---:|---:|---:|---|
| 1-5 整机 | 11 | 0.091 | 957 | GL句柄重复查询明确；不是物理计算次数。 |
| 1-6 行为整机 | 11 | 0.091 | 989 | 与1-5共享渲染优化。 |
| 2-6 静止目标 | 4 | 0.195 | 66 | 没有相机/参数变化仍重复提交。目标几何本身已有memo。 |
| 2-7 默认方环 | 81 | 4.236 | 725 | 当前默认态计数；下文几何去重探针另选其4×4配置。 |
| 2-8 默认阵列 | 66 | 2.311 | 567 | 有大量相同局部几何；仍需保留实例摆放。 |
| 2-9 默认组合 | 127 | 4.569 | 1,057 | 当前计数是默认一对，不能冒称九宫最重态。 |
| 2-13 默认组合 | 226 | 7.876 | 1,927 | 共享渲染层值得先做；不是承诺每帧都能省去全部上传。 |

完整21台数据：[profile.json](/workspace/lab-optimization-review-2026-10-23/browser/profile.json)。2-15的软件渲染采样只有1帧，不用于推导稳态性能。

切档复现使用浏览器真实组件的DOM控件激活，并记录相同最终选择下的画面/HUD；不是物理触控回放。控件状态与动画计数见 [interaction-probe.json](/workspace/lab-optimization-review-2026-10-23/browser/interaction-probe.json)。

### 纯算法/几何：确认哪些复用值得做

Node v24.19.0、Xeon Platinum 8573C。只测指定CPU段；共享宿主负载存在波动，不把局部倍数写成整页提速倍数。

| 探针 | 结果 | 已证明 / 尚未证明 |
|---|---|---|
| 机械1/60s输入更新 | 四杆0.008ms、拱环0.542ms、触手1.536ms、五环2.693ms、整机编排4.209ms，中位 | 不含React、GPU；四杆等不值得优先重写内核。 |
| 1-6行为逻辑 | 无手势约2.05µs/步，含脚本HAND/接触约3.99µs/步 | 行为引擎不是该代表场景的主要CPU热点；不含机械求解。 |
| 五环冷启动 | 三个独立进程createShell首次中位455.54ms，同进程第二次4.46ms | 1-4/1-5/1-6共用模块槽缓存，仅首个调用者支付标定成本；可评估严格版本化预计算，不能三台重复计费。 |
| 触手CPU网格准备 | 三个独立进程烘焙48.78–64.18ms，产物9,483,360 B | 同资产跨1-3/1-5/1-6可共用只读CPU结果；不含下载和GPU上传，GL资源仍各实例独立。 |
| 2-8同形局部实体 | A/B烘焙40→2次；数组2,321,280→116,064 B；纯几何中位5.57→0.31ms | 每个原draw需要的Float32顶点/法向逐字节相同；尚未实施浏览器优化。 |
| 2-8每行一种 | 160→8次；9,285,120→464,256 B；24.49→1.18ms | 同上，仅此几何段。 |
| 2-7方形4×4 | 40→6次；3,507,840→526,176 B；9.03→1.33ms | 三个唯一剖面，保留原摆放和draw顺序。 |
| 2-9九宫交叠错相 | 9→5条精确相同输入组；2,100 ticks ×9格，共18,900份状态一致 | 节点、r、step、锁键顺序一致；仍需补全其他关系和切换回归。 |
| 2-6完整带膜索引 | 基准40份可共1份，少326,664 B重复Uint32索引 | 只依赖n；不包括临时数组，不声称省去整个装配。 |
| 人猫固定全长带段 | 6人2猫/60s约563万次重复bandSeg；缓存原型纯step中位951→801ms | 30个状态检查点一致；宿主有噪声，不能承诺稳定16%或真机同幅改善。 |
| Cohabit双Catchment | 8×8每份约9ms，可少建一份 | 构造收益；原本已缓存，不是逐帧节省。 |
| 人猫路径缓存反证 | 查询99.8%命中，实测仍无明显改善 | key/缓存管理抵消收益，本轮不推荐实施。 |

原始数据：[机械](/workspace/lab-optimization-review-2026-10-23/linkage/baseline.json)、[行为整机](/workspace/lab-optimization-review-2026-10-23/linkage/behavior/benchmark.json)、[形态几何与轨迹](/workspace/lab-optimization-review-2026-10-23/shapes/results.json)、[多层几何](/workspace/lab-optimization-review-2026-10-23/shapes/layers/results.json)、[人猫模型](/workspace/lab-optimization-review-2026-10-23/behavior/focused.json)。

## 暂缓或需要再确认的项目

- **多指与意外丢capture**：Walk/Crowd/Cohabit部分拖动没有pointerId所有权；部分3D台缺lostpointercapture。存在可疑分支，但本轮未做真触控复现，不能当作已发生的普通拖动故障。先测再小范围复用Cat/相机桥清理。
- **Cohabit空场计算**：当前catField没有写入，默认posture人场也为空，却仍衰减和采样。可评估空场快路径，但要处理公开data的直接写入；不能擅自补猫痕迹或删除字段，避免改变离台后的收回行为。
- **冷启动**：五环首次标定和触手烘焙已有上表纯CPU证据；其整页影响、2-15后台预烘焙与21台挂载仍需浏览器冷启动专项。现有离屏循环门控不等于延迟初始化。不能把“后台少做”换成第一次点击等待，也不能把随包到达的终态改成点击后下载。
- **资源清理**：本轮没有context lost，不把缺少dispose直接定性为已证实显存泄漏。先做往返路由和多次模式切换的资源基线。
- **低收益抽象**：R5洪泛替换、bodyNodes单读、固定邻接表、小型构造Map、整页统一rAF/播放器，均不应先于上述有证据的热点。原型中有改法反而变慢，已从首批清单排除。

## 后续修改的验收合同

1. **轨迹不变**：同seed、同输入序列、同协议tick，比较节点、锁键顺序、演员路线/动作、场数据、Activation、带开合/墙/支撑、事件账本和随机序列。不得只比较最终截图或formed数量。
2. **画面不变**：几何缓存先比较Float32字节、索引和draw顺序；浏览器对照形成期与终态、透明膜、遮挡、接缝、圆/方、组合、视角和半径两端。保留尺寸、颜色、细节、默认值和所有选项。
3. **操作不变或更快**：记录拖动到下一反馈帧、连续滑块、松手、暂停后操作、相机0.35s过渡、放大/退出/返回、隐藏页恢复。输入最终值不得丢失；状态提示按原显示时序更新。
4. **终态仍即时**：点击不新增网络/现场求解；原generation取消机制、整场提交、重播/取消跳过和晚结果隔离保持。不能用新缓存覆盖用户已换到的新配置。
5. **局部实施、分别验收**：先L01/L02，后独立的渲染/几何/模型优化。每步跑相关现有测试和有意义的边界回归；以结构计数、分配量、长任务和输入延迟评估，再看帧率。最终需实际目标浏览器/设备验证手感，当前软件GL基线不能替代它。

## 自查记录

已反查并排除的误报：离屏循环原本有门控；1-5固定机位是设计；2-6原本有surface缓存；2-8原本已共享求解器；2-15原本已有轨迹与GPU缓存；手机未放大时单指滚页是既定交互；solving是既定装饰；上一轮家具/空间切换修复没有重新报成未解决问题。

当前21台全部有逐项结论。浏览器截图对照确认L01/L02，不仅依赖静态猜测；两组复现与重建对照的最终控件选择分别一致。独立复核校正了Cat HUD的描述：它每帧计算，再按含5Hz时间桶与状态的显示键去重，并非事件驱动。

已核对本轮开始时记录的315个源码、内容与配置文件SHA-256，全部未变化；本轮只新增主报告和目录外的取证文件。主报告绝对路径链接与行号检查通过，21台浏览器采样记录完整，性能建议明确区分原型验证、调用计数和待验证收益。记录：[self-check.json](/workspace/lab-optimization-review-2026-10-23/self-check.json)。

完整取证目录：[lab-optimization-review-2026-10-23](/workspace/lab-optimization-review-2026-10-23)。本轮不重新宣称上一轮1,075项测试已针对这些尚未实施的优化通过；它们只属于上一轮修复验收。
