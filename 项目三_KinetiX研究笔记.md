# 项目三 · KinetiX 研究笔记（参照物拆解）

> 立项定位（用户拍板 2026-09-06）：**项目三 = 项目二研究带来启发的独立研究**——延展，不是前传、不是项目二的附件。
> 参照物 = MIT Media Lab Tangible Media Group 的 **KinetiX**：由一个简单原理出发做一套物理形态探究。
> 题目候选（用户提出）：**一条绳 + 两条规则（线拉 / 棍撑）→ 一系列形态的构成**。
> 本文件 = 把 KinetiX 的研究结构拆开，提炼可搬的方法，并对到项目三。方案本身待用户拍板后另写 spec。

## 0. 取证情况（先说清楚哪些是确认的）

- **读到了**：论文摘要（ScienceDirect / Media Lab 出版页 / RWTH 记录三处一致）、出版信息、Tangible Media 项目页的摘要转述、Scite 引用图里 **120 篇引用它的论文对它的转述**（下面引到的按 DOI 标）。
- **读不到**：全文 PDF——本机网络代理把 ScienceDirect、MIT（media / tangible / dspace）、ResearchGate、Semantic Scholar、arXiv、Vimeo、YouTube 全拦了，Scite 也没有它的正文索引。
- 下文每条标 **[确认]**（摘要或引用论文原话）/ **[转述]**（引用它的论文怎么描述它）/ **[记忆]**（我对这篇论文的记忆，未经核对）。
- **要补的证据**：用户把 PDF 放进仓库（建议 `项目三参考/`），我逐节核对 §2 与 §6，改掉标错的。

## 1. 出处

Ou, J., Ma, Z., Peters, J., Dai, S., Vlavianos, N., & Ishii, H. (2018). *KinetiX – designing auxetic-inspired deformable material structures*. **Computers & Graphics, 75, 72–81.** DOI 10.1016/j.cag.2018.06.003。
发表在该刊 **Computational Fabrication 专栏**（专栏前言 10.1016/j.cag.2018.07.008 引用它）[确认]。作者第一人 Jifei Ou 的博士论文《Material Transformation: Designing Shape Changing Interfaces Enabled by Programmable Material Anisotropy》（MIT, 2019）有它的一章 [确认标题，章节归属为记忆]。

摘要要点（英文原句摘自摘要）[确认]：
- "a group of auxetic-inspired material structures that can transform into various shapes upon compression"
- "four cellular-based material structure units composed of rigid plates and elastic/rotary hinges"
- "the auxetic structure is viewed as a **parametric four-bar linkage**; by reconfiguring the **location and angle of the hinges**, each unit acquires a unique transformation, such as **uniform scaling, shearing, folding and twisting**"
- "by tessellating those transformations together, various higher level transformations"
- "an interactive simulation tool … to input designed structures and preview the transformation"; "three application prototypes"; applications: "packaging design, conformable exoskeleton, or reconfigurable furniture"
- 结语定位："inspire research in metamaterials design (micro), shape-change materials (meso) and transformable furniture (macro)"（Tangible Media 项目页）

## 2. 论文在做什么：研究结构拆成六步

| 步 | 内容 | 证据 |
|---|---|---|
| ① 起点原理 | 旋转方块式 auxetic（负泊松比：压一个方向、另一个方向也跟着收）。刚性板 + 铰。 | [确认] 摘要；引用它的论文说它"基于旋转方块的 auxetic 构型"（10.1155/2022/7562164） |
| ② 换视角 | **把一个单元看成参数化四杆机构**——四块刚板、四个铰，就是一个 1 自由度的四杆连杆。全部创新从这一句来。 | [确认] 摘要原话 "viewed as a parametric four-bar linkage"；"four-bar-linkage mechanism cell"（10.1117/12.3086271）、"4-bar mechanism cell that is able to transform out of the plane"（10.1109/icra48506.2021.9562099） |
| ③ 参数 | 只有两个：铰的**位置**（沿板边挪）、铰轴的**角度**（相对板面倾斜）。改它们**不改变自由度**。 | [确认] 摘要 "location and angle of the hinges"、"parameterized while maintaining the system's degree of freedom"；[转述] "每面壁给一个倾角 β，组合起来产生出铰平面的旋转"（10.1155/2022/7562164）；"skewing the rotation axis in space produces out-of-plane rotation"（10.52842/conf.acadia.2021.380） |
| ④ 单元词汇 | 四个单元：**均匀缩放 / 剪切 / 折叠（弯曲）/ 扭转（旋转）**。前两个是平面内（铰轴垂直板面、只挪位置），后两个是出平面（铰轴倾斜）。 | [确认] 四个名字；平面内/出平面的归属 = [转述]（"hinge-in-plane rotation 与 hinge-out-of-plane rotation 两类"，10.1155/2022/7562164）+ [记忆] |
| ⑤ 镶嵌 | 单元拼成模块、模块拼成整体，**整片仍是单自由度**：压一下，全体按设计变形；混排不同单元得到高阶变形（弯成弧、扭成螺旋、包住物体）。 | [确认] "tessellating … higher level transformations"、"tessellated modules … while keeping the single degree of freedom"（Tangible 项目页） |
| ⑥ 工具·制造·应用 | 交互仿真工具（输入结构、预览变形）；多材料 3D 打印（刚板 + 弹性铰一次成型）；三个应用原型：包装、贴身外骨骼、可重构家具；三级尺度收尾（微/中/宏）。 | [确认] 摘要 + 项目页；[转述] "multimaterial extruder as in the case of Kinetix … a softer hinge attached to the joints"（10.1109/lra.2020.3020546）；激光切割版本 = [记忆] |

**引用它的人把它归到哪**（Scite 引用图，120 条入边）：HCI 形变界面与可编程材料（与 Ion 等人的 Metamaterial Mechanisms 并列）、机械超材料综述、软体机器人抓手、建筑可展/可重构系统（eCAADe、ACADIA）、可穿戴辅具。它自己引的（出边）：Bickel 2010「设计并制造具有期望变形行为的材料」、Overvelde 2017 可重构棱柱结构、auxetic 三十年综述、4D 打印、Shutters / BubbleWrap（Tangible 自家的形变界面）——说明它把自己放在 **计算制造 × 形变界面** 的交叉，不是材料力学。

## 3. 它为什么成立：能搬走的方法

1. **一个已知原理 + 一次换视角 = 全部创新**。他们没有发明新材料，发明的是「把材料当机构看」的参数化视角。换视角那一句要能一句话说清。
2. **参数极少，且有一条守恒律**。两个参数、自由度不变。这让「设计」变成「选参数」而不是「调物理」，也让形态族可以被**穷举**而不是被采样。
3. **词汇有限 → 组合无限**。四个单元是词，镶嵌是语法，高阶变形是句子。呈现顺序固定：单元表 → 组合表 → 应用。
4. **仿真与实物并列**。工具预测、打印验证，两者都在论文里。
5. **三级尺度收尾**。微观材料 / 中观形变材料 / 宏观家具，同一原理贯穿，这是它能被那么多领域引用的原因。
6. **发表定位是方法与工具**（Computational Fabrication 专栏），不是性能指标。评价标准是「设计空间被打开了多少」，不是「泊松比多少」。

## 4. 对到项目三：一条绳 + 两条规则

| KinetiX | 项目三（候选） |
|---|---|
| 起点原理：旋转方块 auxetic | 起点：项目二的收缩张紧外皮——一条节点链 + 会锁定的键，本质就是 **绳 + 线拉**（Lab.06 引擎） |
| 换视角：材料 → 四杆机构 | 换视角：建筑外皮 → **一条绳 + 两条规则**（线拉 = 只拉不推的索；棍撑 = 刚性定长的杆） |
| 参数：铰位置、铰轴角 | 参数：规则挂在绳上的哪两点（跨几节）、线拉到多短 / 棍多长 |
| 守恒：单自由度 | 守恒：**绳长不变** + 统一边界（悬挂）；项目二那边对应的是「每单元一个收缩自由度」 |
| 4 个单元 | 规则数阶梯：0（悬链线）/ 1（线族、棍族）/ 2（线线、棍棍、线棍各三种关系）/ 周期（念珠、脊椎） |
| 镶嵌 → 高阶变形 | 组合（嵌套 / 串联 / 交叉）→ 形态族 |
| 仿真工具 | 站上引擎 + /lab 台架（基础设施已在） |
| 3D 打印 × 三个应用 | **手扎实物**（绳、线、木棍，五分钟一个）+ 仿真并排拍照；不一致处就是发现 |
| 三级尺度 | 一条绳 → 一个单元 → 一间房（项目二的尺度阶梯本来就在） |

**要如实说的差异**（也是项目三区别于 KinetiX 的研究点）：
- KinetiX 是**刚性单自由度机构**：形态由几何唯一决定、可逆、无重力项。我们的是**柔性绳 + 重力 + 锁定**：形态有滞回、有多解（Lab.06 时期 S3 那种坍缩分支就是多解）。所以项目三问的不是「压一下变成什么」，而是「两条规则能让一条绳落成多少种稳定形态、哪些会分岔」。
- KinetiX 的驱动是外压；我们的驱动是线拉自身缩短（内驱），棍撑是被动的。
- 「独立研究」的独立之处：把材料从「建筑外皮」退回「一条绳」，把词汇从「键谱」退回「两条规则」，退到能穷举的地方；项目二是这个语法的一个建筑尺度应用，项目三是语法本身。

## 5. 借与不借

**借**：① 换视角一句话；② 极少参数 + 一条守恒律；③ 单元表 → 组合表 → 应用 的三段呈现；④ 仿真 + 实物并列；⑤ 三级尺度收尾；⑥ 「设计空间打开多少」作为评价口径。
**不借**：① auxetic 本身（绳不是刚性铰接，不追负泊松比）；② 四杆机构解析——项目一已经是四杆的家，项目三别再回去；③ 多材料 3D 打印流程——项目三的实物是绳线棍手扎，这反而是它的独门优势。

## 6. 待核对清单（拿到 PDF 后逐条勾）

- [ ] 四单元的准确命名、对应图号、每个的铰参数取值
- [ ] 铰参数的确切定义：位置是沿板边的偏移量？角度是与板面法线的夹角？
- [ ] 仿真工具是什么实现：纯运动学还是物理？基于 Processing 还是 Rhino/Grasshopper？
- [ ] 制造：多材料打印的材料；有没有激光切割装配版
- [ ] 三个应用原型各自的形态与尺寸
- [ ] 相关工作里对 Bickel 2010 / Overvelde 2017 / Shutters / BubbleWrap 的定位措辞

## 7. 下一步（待用户拍板，沿 2026-09-06 上一轮的四条）

1. 边界条件：统一悬挂，还是把「怎么拿着」也当变量。
2. 绳是开的还是闭的（建议先开）。
3. 词汇表封闭：三个词（绳 / 线拉 / 棍撑）、五级阶梯，第六级不做。
4. 第一轮产出：零规则 + 一条规则的两张形态地图**线稿**，看图再决定往上走（沿「先线稿、看图、再上 3D」纪律）。

拍板后写 `项目三_spec.md`，本文件只管参照物。
