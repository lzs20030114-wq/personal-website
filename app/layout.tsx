import type { Metadata } from 'next';
// MAPPING §2：自托管 Archivo（可变字重 100–900）——不引 Google Fonts @import。
import '@fontsource-variable/archivo';
import './globals.css';

export const metadata: Metadata = {
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
