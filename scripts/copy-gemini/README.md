# 用 Gemini 改案例页文案

把项目详情页正文（`content/work/<slug>/index.zh.mdx` 中文、`index.mdx` 英文）里的文字段落交给 Gemini 改写，
结果写成**草稿**，看过对照、满意了再覆盖原文件。原文件不会被自动改动。

## 第一次使用

1. 在 Google AI Studio 申请 API key。建议开通付费档：免费档的输入可能被用于改进 Google 的产品，
   这里发出去的是还没发表的作品集正文（以 Google 当前条款为准）。
2. 在仓库根目录的 `.env.local` 里加上下面几行（文件已被 gitignore，不会提交；已有这个文件就追加）：

   ```
   GEMINI_API_KEY=你的 key
   GEMINI_MODEL=
   # 在国内需要代理时加上（端口按你的代理软件填）：
   # HTTPS_PROXY=http://127.0.0.1:7890
   ```

3. 列出这个 key 能用的模型，挑一个填进 `GEMINI_MODEL`（不带 `models/` 前缀）：

   ```
   npm run copy:gemini -- models
   ```

## 平时怎么用

```
npm run copy:gemini -- list    project-ii zh                  # 看各节编号、每节可改几段
npm run copy:gemini -- rewrite project-ii zh                  # 改全文
npm run copy:gemini -- rewrite project-ii zh --section 2,3    # 只改第 2、3 节
npm run copy:gemini -- rewrite project-ii zh --note "这一节再精简一些"
npm run copy:gemini -- rewrite project-ii zh --dry-run        # 不调用 API，只看要发出去什么
npm run copy:gemini -- apply   project-ii zh                  # 用最近一次草稿覆盖原文件
```

slug：`reincarnation-machine` = 项目一，`project-ii` = 项目二。语言：`zh` / `en`，两侧各改各的。

每次 rewrite 在 `.local/copy-drafts/<slug>-<语言>/<时间>/` 下留四个文件：

| 文件 | 内容 |
|---|---|
| `index.zh.mdx` / `index.mdx` | 草稿 |
| `report.md` | 逐段对照（原文 / 改后），有提醒的排在前面 |
| `request.json` | 发出去的规则与段落（不含 key） |
| `response.json` | Gemini 的原始返回，含 token 用量 |

`request.json` 与 `response.json` 留着，日后写 AI 披露时可以说清楚哪些段落用过模型。

`apply` 之后跑一遍守门，确认中英两侧小节数和插槽顺序没变：

```
npx vitest run src/lib/site/content.test.ts src/lib/site/case-headings.test.ts
```

不满意就 `git restore content/work/<slug>/<文件>` 撤回。

## 改什么，不改什么

**会发出去改写**：普通段落、列表项、引用，包括 `<Lead>`、`<Accent>`、`<Fold>`、`<ProcessAside>` 这些容器里面的段落。
加 `--headings` 时连小标题一起改。

**原样保留**（不发出去，重建时逐字节照抄）：

- frontmatter（标题、summary、中文元数据块）
- 组件标签行，包括里面的 `caption`、`desc` 等属性文字
- 表格、代码块、`{/* */}` 注释
- `<Todo>`（作者的待补清单）和 `<ResearchQuestion>`（研究问题）里面的文字
- 「参考文献 / References」整节

**段内保护**：链接与日志锚点、行内代码、行内组件、`{表达式}`、`**加粗的术语**` 先换成 `⟦0⟧` 这样的占位符再发，
回来按编号还原。模型把占位符弄丢、弄重或多加的段落，草稿里自动用原文，report 里标「退回原文」。

**只提醒、不拦**：数字前后不一致、中文仍有分号 / 破折号 /「不是…而是」、英文仍有分号 / em dash。
这些在 report 里标 ⚠，要你自己判断。

改写规则写在同目录 `rules.md`，就是发给模型的系统提示，可以直接改。

## 不在这一版范围内

图注（组件属性）、frontmatter 的 summary、`src/lib/site/case-reincarnation.ts` 里的构件文案（人格表、技术参数等）。
要改这些，目前仍然手动改。

## 文件

- `run.mjs`：命令行入口（零依赖，Node 自带 fetch；`HTTPS_PROXY` 由 Node 24 的 `NODE_USE_ENV_PROXY` 生效）
- `segments.mjs`：拆段、保护、重建、提醒（纯函数）
- `segments.test.mjs`：守门，包括「四份正文不改动时重建逐字节相同」
- `rules.md`：改写规则
