# AI_DISCLOSURE.md — AI 使用披露：策略与素材（2026-07-07）

**用途**：申请季写披露声明 / 准备面试 / 回答"AI 辅助是否吃亏"时直接调用。
**背景**：ADMISSIONS_RESEARCH.md 确认 Parsons 与 SVA 明文要求披露 AI 生成/辅助的使用方式与工具；其余学校未强制，但 role/contribution 声明是跨校标配。

---

## 一、核心认知（先把误解拆掉）

1. **披露条款惩罚的不是"用了 AI 的人"，是"谎报作者身份的人"。** 它与"团队项目必须标注 My Role"完全同源——评审从不假设作品集每个像素都出自你一人之手，他们要验证的只有一件事：**你声称的能力与实际能力是否一致。**
2. **比较对象算对**：2026 年申计算设计的人几乎全在用 AI，这是基准线不是差异项。真正的分野是三种人：
   - 藏着用的——出镜视频（多校标配 1–2 min）和面试就是为抓这个设计的验证通道；
   - 用了但讲不清的——作品超出理解，面试一钻就塌，披露与否都完蛋；
   - **用了且能指挥、能验证、能负责的——披露制度奖励这种人**，因为他们敢把方法摊开。
3. **卖的从来不是打字，是判断。** 账不吃亏。

## 二、我方证据链（为什么这个项目撑得住披露）

全部可查证，evidence package 按此组织：

- **Spec 先行**：LINKAGE_SPEC.md 的数学推导、边界情况、测试容差在写码之前定稿；实现与公式冲突时改实现。
- **决策留痕**：关键决策由本人拍板并有记录——spec 六条评审（补初始化断言、稳态取样两条强化）；三角板镜像翻转由**本人亲手操作发现**，处置方案（按帧限步 + 接受故意翻转）由本人选定。
- **测试锁定**：23 项单测与实现同步写成，实测数字（收敛遍数、稳态残差、翻转帧数）回填规格。
- **Git 历史完整**：每个里程碑独立 commit，SPEC 修订在 commit message 中注明。
- **可脱稿复述**（承重墙）：约束投影推导、权重=逆质量、GS vs Jacobi 与 Kangaroo 差异、非凸性与分支、warm start——教学义务条款的存在就是为此。

## 三、披露声明草稿（起点，**必须改写成自己的声音**）

中文骨架：

> 数学原理、设计决策与行为验收由我制定和把关；实现由 AI 辅助加速；所有关键行为由我参与设计的测试锁定，开发历史完整可查。工具：Claude（Anthropic）。

英文起点（按各校字数要求裁剪）：

> The mathematical foundations, design decisions, and acceptance criteria of this work are my own: I authored the specification before implementation, reviewed and ratified every architectural choice, and personally discovered and triaged key behavioral edge cases. AI tooling (Claude, Anthropic) was used to accelerate implementation under this specification, with all critical behaviors locked by tests I helped design. The full development history is documented in version control, and I can explain and re-derive the underlying mathematics without reference.

最后一句只在真能做到时保留——它是整段话的牙齿。

## 四、分校策略（评审文化梯度）

| 学校类型 | 姿态 |
|---|---|
| 技术向（CMU MHCI/MSCD、GT、UW） | AI 熟练度本身读作能力——"能指挥计算的设计师"正是招生对象；方法论可作为亮点展示 |
| 明文要求披露（Parsons、SVA） | 贴原文要求写，工具、方式、范围三要素齐全，不多不少 |
| 艺术实践型（MIT ACT、RCA） | 评观念作者性，"手感折扣"文化更重——叙述重心放在概念与判断，工具退后台 |

## 五、叙事资产

美院 → CS61A → 独立做 treepractice.com → 实现约束求解器：评审最爱的成长弧线。
"非理工出身、用 AI 跨越工具鸿沟、但原理层亲自过手"比"科班标准实现"更稀缺。轮回机器的论点（机器的生命感）与"人如何与计算协作"在主题上互相加强。

## 六、风险（不粉饰）

1. **兜底不能塌**：面试问"扩展到 3D 要改什么"答不上来，任何措辞都救不了。教学义务是唯一承重墙。
2. 艺术实践型项目的保守评审真实存在，风险不为零——靠分校策略对冲，不靠隐瞒。
3. 披露一处失实，比不披露更糟——声明里每句话都要能被 git 历史和面试支撑。

## 七、行动项与时点

- [ ] 2026-09/10：复核截止日期时拉取 Parsons/SVA 披露条款**原文**，措辞贴原文写
- [ ] 起草正式披露段 + evidence package 组织（届时找强模型协作，**声音必须是本人的**）
- [ ] 持续：每个 session 的数学讲解 = 给披露声明背书，不许跳过
- [ ] 面试前：对照 §二 清单做一次自测——每条都能脱稿讲，声明才成立
