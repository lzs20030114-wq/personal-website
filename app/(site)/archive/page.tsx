import { getLogEntries } from '../../../src/lib/site/log';
import { LogList } from '../../../components/site/LogList';
import { PageEnter } from '../../../components/site/PageEnter';

export const metadata = { title: 'Work log' };

/**
 * Work log（Log-Modernist 稿 + 2026-07-27 中英切换/版式修订）：
 * 标头 + EN/中文 滑块 + 三级筛选 + 热力图 + 按月分组的条目列表，全部在 LogList 客户端组件里。
 * 本页只从内容池取数（src/lib/site/log）——路由名不改（仍 /archive）。
 * 筛选项由 LogList 用 src/lib/site/log-facets 现算（纯函数、不碰 fs，客户端可用）。
 */
export default function ArchivePage() {
  const entries = getLogEntries();
  return (
    <>
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <div className="shell pg-dark" data-pt-content>
        <LogList entries={entries} />
      </div>
    </>
  );
}
