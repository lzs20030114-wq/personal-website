import './dark-chrome.css';
import { SiteNav } from '../../components/site/SiteNav';
import { SiteFooter } from '../../components/site/SiteFooter';
import { LabLanguageRoot } from '../../components/lab/LabLanguage';

/**
 * 内页布局（/work /archive /about）：共享 SiteNav + SiteFooter。
 * 主页不在此组内——Home-Screens 稿无顶部导航、页脚长在 S2 幕内（MAPPING §6）。
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <LabLanguageRoot>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </LabLanguageRoot>
  );
}
