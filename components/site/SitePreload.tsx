'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { afterLoader } from '../../src/lib/site/site-loader';
import { SITE_PRELOAD, pageAssetUrls, preloadAllowed, preloadQueue } from '../../src/lib/site/site-preload';
import { fetchMeshBuffer } from '../../src/lib/linkage/mesh-fetch';

/**
 * 详情页预载（MAPPING §87，规则见 src/lib/site/site-preload.ts）。挂在根布局，什么也不画。
 * 每个文档只跑一遍（站内跳转不会重来）；没预载完就点进去，页面照常自己下载。
 */

let started = false;

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: SITE_PRELOAD.IDLE_TIMEOUT_MS });
    } else {
      setTimeout(resolve, 200);
    }
  });
}

const lowPriority = { priority: 'low' } as RequestInit;

/** 浏览器已经下载过（或正在下载）的地址 */
function alreadyFetched(): Set<string> {
  const have = new Set<string>();
  for (const e of performance.getEntriesByType('resource')) have.add(e.name);
  for (const s of Array.from(document.scripts)) if (s.src) have.add(s.src);
  for (const l of Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'))) have.add(l.href);
  return have;
}

/** 预取一个静态文件：支持 rel=prefetch 的浏览器交给它（最低优先级），Safari 退回低优先级 fetch，都只是进 HTTP 缓存 */
function hint(url: string, canPrefetch: boolean): Promise<void> {
  if (canPrefetch) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    if (url.split('?')[0].endsWith('.css')) link.as = 'style';
    else link.as = 'script';
    document.head.appendChild(link);
    return Promise.resolve();
  }
  return fetch(url, lowPriority)
    .then((r) => r.blob())
    .then(
      () => {},
      () => {},
    );
}

/** 这一页的 HTML → 它要的脚本与样式 → 还没下载过的预取 */
async function prefetchPageAssets(path: string): Promise<void> {
  const res = await fetch(path, lowPriority);
  if (!res.ok) return;
  const urls = pageAssetUrls(await res.text());
  const have = alreadyFetched();
  const canPrefetch = document.createElement('link').relList?.supports?.('prefetch') ?? false;
  await Promise.all(
    urls.map((u) => new URL(u, window.location.origin).href).filter((u) => !have.has(u)).map((u) => hint(u, canPrefetch)),
  );
}

export function SitePreload() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    // 严格模式下开发期挂两次：第一次就占住，第二次不再排（根布局不会卸载，不需要清理）
    if (started) return;
    started = true;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!preloadAllowed(conn)) return;
    const queue = preloadQueue(window.location.pathname);
    if (!queue.length) return;

    // 先把每一页的小件（路由数据、脚本、样式，合计约 0.5 MB）都拉完，再拉大件 3D 网格（1.5 MB）：
    // 慢网下网格要下好几秒，排在前面会让后面那一页的脚本迟迟轮不上（实测点项目二时它还在下项目一的网格）
    const run = async () => {
      for (const target of queue) {
        await idle();
        try {
          routerRef.current.prefetch(target.path);
        } catch {
          /* 预取只是锦上添花 */
        }
        await idle();
        await prefetchPageAssets(target.path).catch(() => {});
      }
      for (const url of queue.flatMap((t) => t.meshes)) {
        await idle();
        await fetchMeshBuffer(url).catch(() => {});
      }
    };
    afterLoader(() => {
      setTimeout(() => void run(), SITE_PRELOAD.START_DELAY_MS);
    });
  }, []);

  return null;
}
