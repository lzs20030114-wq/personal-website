import type { Metadata } from 'next';
// MAPPING §2：自托管 Archivo（可变字重 100–900）——不引 Google Fonts @import。
// 2026-10-27（MAPPING §64）：换成带宽度轴的那份（字宽 62–125%，字重照旧 100–900），首页标题与编号用到宽窄对比；
// 不设 font-stretch 的地方仍是 100% 宽，字形与原先那份相同。
import '@fontsource-variable/archivo/wdth.css';
import './globals.css';
import './page-transitions.css';
import { PageTransitions } from '../components/site/PageTransitions';
import { VisitTracker } from '../components/site/VisitTracker';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

// 导航/页脚在 (site) 路由组布局；主页（Home-Screens 整屏分幕）自带页脚、无顶部导航。
// 页面转场挂在根布局：首页不在 (site) 组里，只有这一层能同时看见所有页面之间的跳转（MAPPING §48）。
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const visitorTrackingEnabled = process.env.VERCEL_ENV === 'production'
    ? Boolean(process.env.STUDIO_PASSWORD && process.env.VISITOR_SUPABASE_URL && process.env.VISITOR_SUPABASE_SERVICE_ROLE_KEY)
    : !process.env.VERCEL && process.env.VISITOR_LOCAL_ENABLED === '1';
  return (
    <html lang="en">
      <body>
        <PageTransitions />
        <VisitTracker enabled={visitorTrackingEnabled} />
        {children}
      </body>
    </html>
  );
}
