# 私有访客后台

入口 `/studio/visitors`，与 `/studio` 日志编辑器共用密码。功能在配置并部署后开始记录，不能补录之前的访问。

## 功能与口径

- 浏览器真正打开页面时记录：访问时间、路径、完整公开 IP、IP 大致国家／地区／城市、初次来源域名。
- 日期筛选与显示固定 UTC+8；日期起止包含两端。IP 与页面使用精确匹配，每页 50 条。
- 独立 IP 不等于人数。共享网络会合并，多设备／VPN／动态 IP 会拆开。来源未知通常是直接访问或浏览器未提供。
- 不记录查询参数、锚点、表单、密码、浏览器指纹；不生成跨页／跨天访客标识，不设追踪 Cookie。
- 已登录作者、后台、API、资源、隐私页、常见爬虫、预取、DNT/GPC 退出统计的访问不记。JavaScript 未运行、拦截器、离线与数据库故障可能漏记；这不是完整服务器访问日志。
- 页面首访、刷新、SPA 切页、浏览器 BFCache 返回计数；React StrictMode、锚点与普通切标签页不重复计数。
- 线上 IP／地域仅信任 Vercel 注入的头；本地显示未知。若域名前另有代理，IP 可能属于代理，需要先验证。
- 最近 30 天可查；每次读写清理过期记录，生产还应安装每 10 分钟的 SQL 清理任务。数据库备份遵循供应商自身保留设置。

## 线上启用

1. 在用户已确认的组织 `lzs20030114-wq's Org`（`xhilqdthtojkxhzwmvfr`）新建专供本网站使用的项目 `personal-website-visitors`。执行 `db/visitor-analytics.sql`，按脚本末尾说明启用定期清理。随后执行 `db/visitor-analytics-verify.sql` 中的验证查询，确认 RLS、权限与清理任务。
2. 在网站 Vercel 项目的 **Production** 环境添加以下服务器变量。密钥不得加 `NEXT_PUBLIC_`，不得进 Git 或聊天消息。

| 变量 | 用途 |
| --- | --- |
| `STUDIO_PASSWORD` | 现有后台密码；随机 24 位以上。已配置就沿用。 |
| `VISITOR_SUPABASE_URL` | 本网站数据库的 HTTPS 项目 URL |
| `VISITOR_SUPABASE_SERVICE_ROLE_KEY` | 仅服务器持有的 legacy `service_role` key |
| `STUDIO_SECRET` | 可选：沿用现有签名密钥；修改密码但保留独立密钥时，旧会话仍有效。 |

访客后台无需 `STUDIO_GITHUB_TOKEN`；该变量只用于发布工作日志。数据库凭据仅在服务端使用，前台只得到采集开关。

3. 合并并部署一次。采集开关在构建期确定；只修改环境变量不重新部署，不会更新前台开关。Preview 部署不采集。
4. 用未登录后台的浏览器打开首页 → 项目页 → 日志页，然后登录 `/studio/visitors`，核对三条实际记录、UTC+8 时间、IP 与地域。登录后的作者访问不记。
5. 未登录请求 `/api/studio/visitors` 应返回 401，后台页面不应泄漏记录。用 Supabase anon key 读表或调用 RPC 应失败。任何数据库错误都不应阻碍网站导航。

IP／地域接口依据：[Vercel Request Headers](https://vercel.com/docs/headers/request-headers)。数据库权限依据：[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。没有额外地理定位 API，也没有第三方统计脚本。

## 本地验证

在仅本机使用的 PowerShell 进程中设置 `STUDIO_PASSWORD` 和 `VISITOR_LOCAL_ENABLED=1` 后运行 `npm run dev`。不要将本地模式用于公网服务。

本地记录保存于 `.local/visitors.json`，已加入 Git 忽略；只支持单个 Node 进程，进程重启后保留。Vercel 环境绝不回退为本地文件，缺配置时显示“尚未接入线上数据库”。本地 IP 和地域为未知，不用虚构数据顶替。

静态 `/demo/*.html` 的开关由 Vite 构建注入；测试静态台架需在同一组环境变量下运行 `npx vite build`，再通过 Next 服务访问它们。

## 关闭与删除

移除 `VISITOR_SUPABASE_URL` 或服务端 key 并重新部署可关闭采集。删除历史数据在 Supabase 管理端执行针对 `portfolio_visits` 的删除；不要公开增加无鉴权删除接口。原始记录不进入 GitHub 内容仓库。

## 当前交付边界

2026-10-12：代码、SQL 和本地验证完成。用户已选择新建网站专用数据库并确认所属组织，尚未创建远程项目、配置生产密钥或部署。

- Supabase 连接能读取组织和项目，但创建流程所需的 `get_cost` 返回 `UNAVAILABLE`（服务端未提供此工具）。网页替代流程停在登录页，等待用户登录；没有修改 TOEFL 数据库。
- Vercel 连接能列出 `personal-website-848r`（`prj_evCUeCulidzWiqkhd4T4rOpZVJmD`），但读取网站团队 `zishuos-projects-87b82d2a` 的环境变量配置返回 403，需要重新授权正确团队。
- 本地全套 93 个测试文件、1067 项测试通过；Vite 与 Next 生产构建通过，最终 typecheck 通过。浏览器实测登录、匿名查询 401、真实浏览采集、SPA 切页、刷新、返回、静态 demo、页面筛选、作者访问排除与手机布局。展示中的 6 条记录均为本地验证数据，IP／地域按设计显示未知。
- 数据库 SQL 与权限验证脚本尚未在真实 PostgreSQL 执行；部署后仍需核对真实 IP／地域和清理任务执行记录，不能把本地通过视为线上验收。
