import { describe, expect, it } from 'vitest';
import { PRELOAD_TARGETS, pageAssetUrls, preloadAllowed, preloadQueue } from './site-preload';
import { getRoutableWork } from './content';

describe('详情页预载（MAPPING §87）', () => {
  it('省流量或 2G 档不预载；拿不到网络信息照常预载', () => {
    expect(preloadAllowed(undefined)).toBe(true);
    expect(preloadAllowed({ effectiveType: '4g' })).toBe(true);
    expect(preloadAllowed({ effectiveType: '3g' })).toBe(true);
    expect(preloadAllowed({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(preloadAllowed({ effectiveType: '2g' })).toBe(false);
    expect(preloadAllowed({ effectiveType: 'slow-2g' })).toBe(false);
  });

  it('不预载自己所在的那一页；编辑后台什么都不做', () => {
    expect(preloadQueue('/').map((t) => t.path)).toEqual(PRELOAD_TARGETS.map((t) => t.path));
    expect(preloadQueue('/work/reincarnation-machine').map((t) => t.path)).toEqual(['/work/letting-agent']);
    expect(preloadQueue('/studio')).toEqual([]);
  });

  it('预载的每一页都是站上真有、已经发稿的作品页（改 slug 时这里会红，2026-11-07 改过一次）', () => {
    const published = new Set(getRoutableWork().filter((w) => w.status === 'published').map((w) => `/work/${w.slug}`));
    for (const t of PRELOAD_TARGETS) expect(published.has(t.path), t.path).toBe(true);
  });

  it('从页面 HTML 读出它要的脚本与样式：只认 /_next/static，去重，保留查询串、还原 &amp;', () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/chunks/a1.css" data-precedence="next"/>',
      '<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/b2.js?dpl=dpl_x&amp;v=1"/>',
      '<script src="/_next/static/chunks/b2.js?dpl=dpl_x&amp;v=1" async=""></script>',
      '<script src="/_next/static/chunks/c3.js" async=""></script>',
      '<link rel="preload" href="/_next/static/media/font.woff2" as="font"/>',
      '<img src="/home/cover.webp"/>',
      '<script src="https://example.com/_next/static/chunks/x.js"></script>',
      '<a href="/work/letting-agent">next</a>',
    ].join('');
    expect(pageAssetUrls(html)).toEqual([
      '/_next/static/chunks/a1.css',
      '/_next/static/chunks/b2.js?dpl=dpl_x&v=1',
      '/_next/static/chunks/c3.js',
    ]);
  });
});
