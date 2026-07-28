# SITE_SPEC.md — 作品集网站架构规格

**版本**：v1.0（2026-07-07，ROADMAP ① 产出）
**地位**：网站工程的唯一权威。连杆组件内部以 LINKAGE_SPEC.md 为准；两者冲突时组件事务听 LINKAGE_SPEC，站点事务听本文档。
**执行者假设**：脚手架与排版由较弱模型执行——照做，不发挥。**case study 正文与一切叙事文字是用户本人的活，模型不代写。**

---

## 0. 死线与节奏（来自 ADMISSIONS_RESEARCH.md）

- 网站实际上线死线 ≈ **2026-11-16**（NYU ITP 12-01 最早截止，留填表余量）。
- 首选项目 CMU MHCI 的作品集**只收链接**——本网站就是提交物本身，不是补充材料。
- 空间线（GSD/MSCD 等）要 25–30 页 PDF：站点必须服从「双轨输出纪律」（§6）。
- 推荐节奏：S1–S2 里程碑 ≤ 2026-08 中；S3–S4 ≤ 09 中；内容期 09–10；**内容冻结 11-01**。

## 1. 网站角色与设计立场

- 角色：申请提交物 + 持续生长的个人工作全景（不是一次性作品集）。
- 视觉：quiet editorial 容器 + 工程图纸式细节排印，参照 ciechanow.ski 的交互文章质感。
- **语言：英文优先**（受众 = 评审），v1 不做 i18n。
- 克制条款（2026-07-10 修订，用户拍板，依据 SITE_REVIEW §五）：连杆活物是全站唯一的**表演级**动效；另放宽一个最小集——**hover/active 状态反馈**（链接下划线过渡、项目行 hover、按压 scale ≤0.97；150–200ms ease；`@media (hover:hover) and (pointer:fine)` 门控；逐属性声明、禁 `transition: all`）。仍然没有：入场动画、页面转场、滚动特效、暗色模式（v1）。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js（最新稳定版，App Router）+ TypeScript strict | 部署 Vercel |
| 样式 | Tailwind v4 | token 见 §8 |
| 内容 | MDX 文件 + `gray-matter`（frontmatter）+ `zod`（构建期校验，fail-fast）+ `next-mdx-remote` 渲染 | **不引入 CMS / contentlayer 类重依赖** |
| 测试 | 保留现有 Vitest（连杆 23 项） | 站点层只加构建/链接检查 |

**双构建共存**：现有 Vite 验收页（`index.html` + `src/demo/`）**保留**，作为连杆的工程台架（真机手测、手感回归都用它）。脚本：`dev`=next dev、`demo`=vite、`build`=next build、`test`、`typecheck`。tsconfig 按 Next 要求合并（jsx preserve + next 插件），Vitest 不受影响。

## 3. 仓库布局

```
app/                        # Next.js App Router（新建）
  layout.tsx  page.tsx
  work/[slug]/page.tsx
  archive/page.tsx  about/page.tsx  not-found.tsx
content/
  work/<slug>/index.mdx     # 每个作品一个目录
  work/<slug>/figures/      # 该作品全部图素材（§6 核心纪律）
components/
  linkage/LinkageFigure.tsx # §7
  site/*                    # 版式组件
src/lib/linkage/            # ★ 内核，禁止任何修改；组件事务见 LINKAGE_SPEC
src/demo/ + index.html      # ★ Vite 工程台架，保留，禁止删除
LINKAGE_SPEC.md 等文档       # 保留在根
```

## 4. 信息架构

- `/` 首页：名字 + 一句定位 → **FIG. 01 连杆活物**（可交互 hero）→ selected 作品（恒 4 个，order 排序）→ 页脚（邮箱、GitHub、明文完整 URL）。
- `/work/[slug]` case study 页（模板见 §9）。
- `/archive` 全量索引：published 且非 selected 的条目，**只标 YYYY-MM**，无 last-updated。允许长期为空——**申请季前不为凑数填内容（防「第五个项目化」）**。
- `/about` 一页：背景、方法、**colophon 段**（「这个站怎么做的」——技术栈/自研求解器/性能与无障碍决策；2026-07-10 拍板新增，v1 只留席位，正文用户写）、AI 披露席位（§9）。
- 另：404、sitemap、favicon、每页 OG 图。

## 5. 内容池 schema（zod 构建期强制）

```ts
const WorkEntry = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}$/),   // 只到月
  selected: z.boolean(),                      // true → 首页；全站恒 4 个 true，多/少即构建失败
  order: z.number().optional(),
  summary: z.string().max(160),               // 列表与 OG 共用
  cover: z.string().optional(),               // 相对 figures/
  role: z.array(z.string()).min(1),           // ★ My Role 行，跨校硬要求，必填
  credits: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
  tools: z.array(z.string()).optional(),
  video: z.object({ src: z.string(), duration: z.number() }).optional(), // 60s 演示等
  status: z.enum(['draft', 'published']),
});
```

## 6. 双轨输出纪律（GSD/MSCD 线的生存条款）

1. **Case study 主体必须是静态图文的完整叙事**——去掉全部交互后仍是一篇成立的 case study（GSD 只看 PDF + ≤60s 视频）。交互组件是增强层。
2. **每个交互点必须有静态兜底图**，且**所有图都是 `figures/` 下的独立文件**（SVG 优先线稿、PNG 截图，命名 `fig-NN-描述.ext`），不允许只存在于 JSX 内联。PDF 排版直接取这些文件。
3. 连杆定格帧/曲线族由 `renderStaticSVG`（LINKAGE_SPEC §7）产出，同样落 `figures/`。
4. **30 页 PDF 的排版在用户自己的设计工具里做**——网站不生成 PDF，只保证素材纪律。

## 7. 连杆组件嵌入（本文档最技术的一节）

- `LinkageFigure.tsx`：`"use client"`；solver + controller 挂 `useRef` 建一次；rAF 在 `useEffect` 起停；每帧 `setFrame(n => n + 1)` 强刷、JSX 读 solver 快照（LINKAGE_SPEC §4.2 所有权规则，交互状态机直接复用 `LinkageController`，不重写）。
- **Hydration 安全论证（照此理解，不要画蛇添足）**：`createCrankRocker()` 是纯确定性计算（无 Date/random/DOM），服务端与客户端首帧 markup 逐位一致——**不需要 `ssr:false`**，首屏直出完整 SVG（LCP 友好、无闪空）。`matchMedia` 等浏览器 API 只准出现在 effect 里。
- **运行节能**：IntersectionObserver——组件离开视口即停 rAF，回来再启；标签页隐藏浏览器自动停 rAF；恢复瞬间的大 dt 由 controller 的 dt clamp 保护（LINKAGE_SPEC §5 条 3，本项目预览环境已实测验证此场景）。
- 无障碍：`<svg role="img" aria-label="Interactive four-bar linkage; drag any white joint">`；reduced-motion 已由 controller 处理（初始 idle，拖拽可用）；键盘操控为 post-deadline 项（IDEAS.md）。
- **性能预算**：连杆相关 JS ≤ 15KB gz；首页自有 JS（不含框架）≤ 60KB gz；CLS = 0（SVG 外包 `aspect-ratio: 700/520` 盒）；LCP ≤ 2.5s。

## 8. 视觉系统 v1（毛坯锁定，语言不变、可微调数值）

- CSS 变量（**2026-07-21 配色修订：绿×紫 Proposal 02 · After Monet**，源 = claude.ai/design「个人网站UI设计规划」`Palette-绿紫.dc.html`，token 语言不变、源定义 OKLCH）：三条 100–900 色阶 `--g*`（莲叶绿，hue 120→196）/ `--p*`（水面紫，300→277）/ `--n*`（池雾灰，118→215）+ 角色 `--paper oklch(0.965 0.010 115)`、`--ink oklch(0.235 0.025 215)`、`--graphite = N600`（对纸 5.2:1，≥4.5 达标）、`--hairline = N300`、`--accent = G700`（强调/链接，对纸 7.2:1）、`--accent-2 = P700`（稀用）、`--rose`（莲粉，全站一两处）；`--trace-blue` 保留为 `var(--accent)` 兼容别名（组件零改动整站换肤）。面积纪律：纸 58 / 墨 30 / 绿 8 / 紫 3 / 粉 1；浅底彩色文字一律 700 级、深底文字用同色阶 100–300 级；大面积铺底只允许 G500 / G900 / P500（P500 全站至多一处）。图片调色 = 黑白基准（`.tone-bw`）+ 双色映射（`.duotone-g / -p / -gp`，暗部→900 亮部→100）。
- **页面结构（2026-07-21 修订：Modernist 方案对齐**，源 = claude.ai/design 同项目 Home/Case/Log-Modernist.dc.html，逐字副本与落地映射见 `design-ref/`**）**：全站 Archivo（自托管 @fontsource-variable/archivo，替代下条 Source Serif 选型）、2px 墨色分隔线、零圆角、flush-left；导航 Work `/#work` · Lab `/#lab` · Log `/archive` · About（路由不改）；页脚 G900 深林铺底；主页 = hero 大标题 + 机构分屏 + 2×2 统计 + 四项目索引 + Lab 四卡 + Log 预览；/archive 按 Work log 稿；case 页 Modernist 骨架并保留内容池全部席位。<1024 单列回落、大标题 clamp()。
- 字体（2026-07-10 修订，用户拍板：正文换自托管——系统 serif 栈在 Windows/Linux 评审机上不可控）：正文 = `next/font/local` 自托管可变衬线，默认选型 **Source Serif 4 Variable**（latin 子集 woff2，文件 <100KB，`display: swap` + `adjustFontFallback` 防 CLS；选型可换、接口不变）；回退栈保留原 serif 栈（Iowan Old Style, Palatino, 'Songti SC', serif）；标注/数据 = `ui-monospace` 栈**不变**；正文 17–18px / 行高 1.6 不变。`--graphite` 微调至对纸白对比度 ≥4.5:1（#70706A 量级，属数值微调）。
- **版式 v2（2026-07-08 拍板：桌面横屏优先，依据 LAYOUT_NOTES.md）**：
  - 第一定律：**行长恒定（62–68ch），宽度给区不给字**。
  - 内容画布 max-width ≈ 1360px；case study 三区网格（≥1280px）：左粘性元数据栏 ~260px（My Role/date/tools）+ 正文列 flush-left + 边缘列（图注/旁注）；1024–1280 两区；<1024 单列回落（移动端必须仍可用）。
  - 图三档宽度：`inline` / `wide`（正文+边缘）/ `full`（整内容区）；对比双图横向并置。
  - 首页 hero 分屏（文 + FIG.01 左右分置）；项目索引 = 图纸清单式多列行。
  - 横向滚动禁止用于主内容。动效克制条款不变——取桌面布局结构，弃 awwwards 式表演。
- 图框 = 发丝线边 + 点阵网格衬底（只用于 figure，不铺全页）；题栏（FIG. NN / 参数 / 读数）用 mono。
- ★ SVG 颜色坑（LINKAGE_SPEC §5 条 1）：presentation attribute 不解析 `var()`——SVG 内颜色一律 class/style。**站点模板同样受此约束。**

## 9. Case study 模板与合规结构（来自 ADMISSIONS_RESEARCH，模板级落实）

每个 `/work/[slug]` 页面的固定结构：

1. 首屏：标题 + summary + **My Role 块**（渲染 `role[]`，逐行）+ credits + date + tools。
2. 正文 MDX：模板保留固定席位标题 **Process**（多校明文要求过程展示）。
3. 交互增强层（如连杆）+ 其静态兜底图。
4. 视频席位：frontmatter `video` 存在时渲染播放器——**不自动播放**，尊重 reduced-motion（GSD 60s 规格演示放这里，顺产 OG/循环素材）。
5. 尾部：AI 披露席位（文字将来自用户按 AI_DISCLOSURE.md 流程撰写；v1 只留插槽）。

链接卫生（硬要求）：全站**无密码**（SVA）；URL 简短、可明文抄写（UW）；`npm run check-links` 脚本——build 后扫全部 href 断链即失败（ITP 要求逐条有效）。

## 10. 里程碑（弱模型执行，每个 commit）

| | 交付 | 验收线 |
|---|---|---|
| **S1** | Next+Tailwind+MDX 管线、zod 校验、四路由骨架（占位内容） | `next build` 与 `typecheck` 全过；假 frontmatter 违规时构建失败 |
| **S2** | LinkageFigure 上首页 | 无 hydration 警告；拖拽/自转手感与 Vite 台架一致；§7 性能预算达标 |
| **S3** | case study 模板 + §9 全部合规块 + figures 管线 | linkage 条目用占位文字渲染出完整结构（My Role/Process/视频席位/披露席位） |
| **S4** | archive / about / OG / check-links / Vercel 部署 | 生产 URL 可访问，check-links 全绿，四路由 OG 齐全 |

纪律：不动 `src/lib/linkage/`；不删 Vite 台架；不写 case study 正文；每里程碑 git commit；对本文档的任何偏离须在 commit message 注明「SITE_SPEC 修订」。

## 11. 明确不做（v1）

CMS、评论、站内搜索、i18n、暗色模式、RSS、动效库、第三方 analytics（Vercel 内置足够）、newsletter。发现自己在装其中任何一个时，停手。

**2026-07-28 修订（用户拍板）**：「不做 CMS」这一条对 work log 开一个**有边界的例外**——见 §12。边界是：不引第三方 CMS / 后台框架 / 数据库 / 图床，站内多写一个受密码保护的路由，写的还是 `content/log/entries.json` 这同一个内容池文件，构建期 zod 校验一行不动。其余内容（四个 case study 的 MDX、about）仍然只手工改。

## 12. Work log 编辑后台 `/studio`（2026-07-28，用户拍板）

需求原话：「加一个可以让我自己上传的页面，就像编写博客、传图片、传表格一样把内容传上去……同时也支持已经交上去的工作日志可以被我修改」。

**存储 = 仓库本身**（用户在三个选项里选的）：编辑器用 GitHub API 打一个 commit（`content/log/entries.json` + 新图片 `public/log/*`）→ Vercel 自动部署 → 约 1–2 分钟后 `/archive` 上线。内容池仍是唯一来源、每次修改都有 git 历史可回滚、不新增任何服务。代价写明：**不即时**，且一次发布 = 一次 Vercel 部署（Hobby 100 次/天，见 CLAUDE.md 部署纪律）——所以编辑器是「改多条 → 一次发布 = 一个 commit」，不是逐条保存。

没配 `STUDIO_GITHUB_TOKEN` 时自动退化成**本地文件模式**：直接写本地文件，之后作者自己 commit。本地 `npm run dev` 写日志不必配任何东西。

### 12.1 环境变量（在 Vercel 项目 Environment Variables 里配）

| 变量 | 必需 | 作用 |
|---|---|---|
| `STUDIO_PASSWORD` | 是 | 进 `/studio` 的密码。**随机 24 位以上**——serverless 没有持久的失败次数计数器，短密码会被穷举。没配则页面只显示配置说明，编辑器不渲染。 |
| `STUDIO_GITHUB_TOKEN` | 生产必需 | fine-grained PAT，只给本仓库 `Contents: Read and write`。发布时用它打 commit。 |
| `STUDIO_BRANCH` | 否（默认 `master`） | 发布目标分支 = 生产分支。 |
| `STUDIO_REPO` | 否 | 默认取 Vercel 注入的 `VERCEL_GIT_REPO_OWNER/SLUG`。 |
| `STUDIO_SECRET` | 否 | 会话 cookie 的 HMAC 密钥；不配则从密码派生（**改密码即登出所有会话**）。 |

### 12.2 门禁（`src/lib/studio/auth.ts`）

密码 + HMAC 签名的 httpOnly cookie（30 天）。cookie 里只有一个到期时间戳 + 签名，没有秘密可泄；签名覆盖到期时间，改时间即失效。诚实的局限：**会话不可撤销**（无服务端 session 表，要一次性踢掉所有会话就改 `STUDIO_SECRET` 或密码）、**无持久暴力破解计数**（密码错时慢 400ms，仅此而已）。页面 `noindex` + `app/robots.ts` 屏蔽 `/studio` 与 `/api/`——但那是「别收录」，不是访问控制。

### 12.3 「不可能因为在网页上写日志而把线上构建搞挂」

这是整个设计的核心约束：发布提交的是构建输入，构建失败 = 站点停在旧版直到人来修。做法是**校验只有一份代码，三处跑**：

- `src/lib/site/log-schema.ts` —— zod 形状（从 `log.ts` 拆出来，不碰 fs，客户端可 import）。
- `src/lib/site/log-guards.ts` —— zod 挡不住但会让站点变坏的规则：恰好一个项目标签、项目标签必须登记在 `PROJECT_GROUPS`（否则条目从所有筛选视图消失）、同一英文标签只能有一个中文译名、同日同引句去重、真实存在的日期、表格行列数一致。
- 跑它的三处：① 编辑器里实时跑（有问题「发布」按钮就是禁用的，并列出人话报错）；② 发布接口在服务端再跑一遍（不信客户端）；③ `log.test.ts` 构建期跑同一份。

另外两道：图片引用必须真的存在（新上传的或仓库里已有的，**已有名单由服务端自己去看**，不听客户端）；发布前比对 `entries.json` 的 blob sha，被别处改过就拒绝并要求刷新（两个标签页各改一半不会互相覆盖）。

### 12.4 内容能力：正文受限 Markdown + 图 / 表块

- **受限 Markdown**（`src/lib/site/md.ts`，自己写的小解析器，零新依赖）：`### 小标题`、`- 列表`、`1. 编号`、``` 代码块、行内 `**加粗**` / `` `代码` `` / `[文字](链接)`。输出**数据**而非 HTML 字符串，渲染用 React 元素拼——没有 `dangerouslySetInnerHTML`，也就没有从编辑器注入脚本的路径。不安全链接（`javascript:`、协议相对 URL）降级成原文。段落内换行原样保留（`white-space: pre-line`）。**池内既有 47 条正文一个记号都没有，解析后逐字不变**（守门测试对着真数据比过）。
- **图片块**：`blocks: [{ kind: 'image', src: '/log/…', alt, caption?, width, height }]`。src 只允许 `/log/` 下的文件（挡外链热链与注入 URL）；alt 必填；width/height 必填（展开面板时不顶下面的正文）。浏览器端先缩到长边 1600px 再转 WebP 才上传（手机直出 4MB 原图会永久留在 git 历史里），单张压缩后上限 900KB、单次发布图片总量 3MB。
- **表格块**：`{ kind: 'table', caption?, head, rows }`。单元格是双语对象**或一个字符串**——字符串 = 两种语言相同，给数字 / 单位 / 零件代号用（逼作者把 `0.34 mm` 抄两遍只会制造抄错的机会）。散文性单元格仍双语。
- 双语仍是**中英并排必填**（用户在三个选项里选的）：编辑器两栏永排在眼前，缺一侧发布不了。

### 12.5 落盘格式：一次发布 = 一条 diff

`serializeEntries`（log-schema.ts）不是 `JSON.stringify(x, null, 2)`——后者会把 `{ "label": …, "variant": … }` 这种短对象拆成五行，一次发布产生几百行无意义 diff。规则是「`tags` / `head` / `rows` 的每一项短就并一行，散文字段逐字段换行」，**与手写时期的 entries.json 逐字一致**（`log.test.ts` 里对着真文件比过；实测发布一条新日志 = 36 行纯新增）。

### 12.6 验证（2026-07-28）

175 测试绿（+42：md 10 / auth 6 / publish 15 / repo 6 / 落盘格式与守门各 1 等）。GitHub 提交那条路对着打桩的 fetch 钉了请求序列与载荷（blob → tree → commit → 移动引用、`base_tree` 接原树、`parents` 挂当前 HEAD、引用不 force）、并发拒绝时一个写请求都不发、401 给的是能照着修的中文报错。真浏览器 12 步（本地文件模式）：登录 / 密码错 / 改既有条目 / 新建带图带表 / 预览 / 发布 / `/archive` 展开且图真的加载出来（`naturalWidth>0`）且中英切换正确 / 三级筛选 / robots / 匿名调发布接口 401 / 删除后回到 47 条——全过、无 pageerror。**未在生产验证的一件事**：真 GitHub token 下的实际 commit（本地没有 token），首次线上发布请留意 commit 是否出现在目标分支。

### 12.7 界面（`app/studio/` + `components/studio/`）

顶栏（条数 / 发布目标 / 有无未发布改动 / 发布 / 退出）+ 左清单（搜索、新建、每条显示日期 · 引句 · 标签 · 块数）+ 右表单（日期、项目下拉、方面下拉或自定义、引句双栏、正文双栏、图表块编辑器）+ **预览**。预览用的是站上那个 `LogBody` 组件本身——预览与线上必须是同一段代码画的。项目 / 方面用下拉而不是自由输入，正是为了让守门规则天然被满足（词汇表 = `src/lib/studio/vocab.ts` 从池里现算）。草稿存 localStorage（图片放不下时退回只存文字并明说）。**无设计稿来源**：这是工具界面，视觉借站点的发丝线语言，度量按「能长时间打字」定，不进 design-ref/MAPPING。
