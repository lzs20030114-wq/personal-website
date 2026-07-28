import type { MetadataRoute } from 'next';

/**
 * /studio 与它的接口不进搜索引擎索引。
 * 页面自己也带 noindex meta（robots.txt 只是「别爬」，meta 才是「别收录」——两层都要）。
 * 注意 robots.txt 不是访问控制：门禁在 src/lib/studio/auth.ts。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/studio', '/api/'] }],
  };
}
