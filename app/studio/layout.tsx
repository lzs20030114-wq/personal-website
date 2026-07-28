import type { Metadata } from 'next';
import './studio.css';

/**
 * Studio 自带布局：**不在 (site) 路由组里**——没有顶导、没有页脚，也不套站点的浅纸底版式。
 * 这是工具界面，不是作品集页面；视觉上借站点的发丝线语言，但度量按「能长时间打字」来定。
 */
export const metadata: Metadata = {
  title: 'Studio',
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="studio" lang="zh-Hans">
      {children}
    </div>
  );
}
