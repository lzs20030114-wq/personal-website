import { getLogBuckets, getLogEntries } from '../../../src/lib/site/log';
import { LogList } from '../../../components/site/LogList';
import { PageEnter } from '../../../components/site/PageEnter';

export const metadata = { title: 'Work log' };

/**
 * Work log（Log-Modernist 稿 + 2026-07-27 中英切换/版式修订）：
 * 标头 + EN/中文 滑块 + 项目筛选条 + 按月分组的条目列表，全部在 LogList 客户端组件里。
 * 本页只从内容池取数（src/lib/site/log）——路由名不改（仍 /archive）。
 * 筛选桶在服务端算好递过去：客户端组件不能 import 内容池模块（那边有 node:fs）。
 */
export default function ArchivePage() {
  const entries = getLogEntries();
  const buckets = getLogBuckets();
  return (
    <>
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <div className="shell pg-dark" data-pt-content>
        <LogList entries={entries} buckets={buckets} />
      </div>
    </>
  );
}
