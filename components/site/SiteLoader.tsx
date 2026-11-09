import { SITE_LOADER_ID, siteLoaderScript } from '../../src/lib/site/site-loader';

/**
 * 首次载入页（MAPPING §87）。服务端组件：只出一段静态标记与一段内联控制器，没有客户端代码。
 *
 * 标记走 dangerouslySetInnerHTML：控制器在打包脚本到达之前就改读数与进度条、退场后把它藏起来，
 * React 不管这块里面的节点，水合时也就不会和它们对不上。
 *
 * 四个方格 = 首页方块场的四种格子（项目 · 台架 · 日志 · 其他作品，右上角记号与图例同一套），
 * 依次亮起又暗回去，是方块场「亮格」的同一个动作；不用项目色（颜色只表示项目，SITE_SPEC §8）。
 */
const MARKUP = `<div class="sl__in">
<p class="sl__name"><b>Zishuo Li</b><span>portfolio · 2026</span></p>
<div class="sl__cells" aria-hidden="true">${['project', 'lab', 'log', 'other']
  .map((k, i) => `<span class="sl__cell" data-kind="${k}" style="--k:${i}"><i></i></span>`)
  .join('')}</div>
<div class="sl__bar" aria-hidden="true"><span data-sl-bar></span></div>
<p class="sl__step" data-sl-step aria-hidden="true">Loading page</p>
</div>`;

export function SiteLoader() {
  return (
    <>
      <div
        id={SITE_LOADER_ID}
        className="sl"
        role="status"
        aria-label="Loading"
        // 控制器在水合之前改 lang / aria-label / style（中文偏好、退场后隐藏）
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: MARKUP }}
      />
      <script dangerouslySetInnerHTML={{ __html: siteLoaderScript() }} />
    </>
  );
}
