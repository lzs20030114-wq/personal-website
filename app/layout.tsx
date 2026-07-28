import type { Metadata } from 'next';
// MAPPING §2：自托管 Archivo（可变字重 100–900）——不引 Google Fonts @import。
import '@fontsource-variable/archivo';
import './globals.css';

/**
 * 生产域名 zishuoli.org（apex 为主，www 在 Vercel 侧 301 到它）。
 * metadataBase 必须钉死字面量：不设的话 Next 会回落到 VERCEL_URL，
 * OG 图与 canonical 会指向那个 *.vercel.app 预览域名。
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://zishuoli.org'),
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

// 导航/页脚在 (site) 路由组布局；主页（Home-Screens 整屏分幕）自带页脚、无顶部导航。
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
