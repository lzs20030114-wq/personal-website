'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { logoutAction } from '../../app/studio/actions';
import type { VisitorRecord, VisitorResult } from '../../src/lib/visitors/types';

type DateRange = { from: string; to: string };
type Filters = DateRange & { ip: string; path: string };
type QueryResult = {
  mode: 'supabase' | 'local' | 'disabled';
  data?: VisitorResult;
  error?: string;
};

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Singapore',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timeFormat.format(date) : '未知';
}

function locationOf(record: VisitorRecord): string {
  return [record.country, record.region, record.city].filter(Boolean).join(' · ') || '未知';
}

export function VisitorDashboard({ initialRange }: { initialRange: DateRange }) {
  const initial = { ...initialRange, ip: '', path: '' };
  const [filters, setFilters] = useState<Filters>(initial);
  const [query, setQuery] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'expired'>('loading');
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setStatus('loading');
      setResult(null);
      setError('');
      try {
        const params = new URLSearchParams({ ...query, page: String(page) });
        const response = await fetch(`/api/studio/visitors?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setStatus('expired');
          return;
        }
        const body = await response.json() as QueryResult;
        if (controller.signal.aborted) return;
        if (!response.ok || body.error) throw new Error(body.error || '读取记录失败，请稍后重试。');
        if (body.mode !== 'disabled' && !body.data) throw new Error('服务器没有返回记录，请重试。');
        setResult(body);
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : '网络连接失败，请稍后重试。');
        setStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [query, page, revision]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from > filters.to) {
      setValidation('开始日期不能晚于结束日期。');
      return;
    }
    setValidation('');
    setQuery({ ...filters, ip: filters.ip.trim(), path: filters.path.trim() });
    setPage(1);
  }

  function reset() {
    const today = Date.now() + 8 * 60 * 60 * 1000;
    const next = {
      from: new Date(today - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      to: new Date(today).toISOString().slice(0, 10),
      ip: '', path: '',
    };
    setFilters(next);
    setQuery(next);
    setPage(1);
    setValidation('');
  }

  function filterBy(key: 'ip' | 'path', value: string) {
    const next = { ...query, [key]: value };
    setFilters(next);
    setQuery(next);
    setPage(1);
    setValidation('');
  }

  const data = result?.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="visitor-shell">
      <header className="studio-bar">
        <div className="studio-bar__left">
          <strong>Studio · 访客记录</strong>
          <span className="studio-bar__meta">仅作者本人可见</span>
        </div>
        <div className="studio-row">
          <a className="studio-mini" href="/studio">工作日志编辑器</a>
          <a className="studio-mini" href="/" target="_blank" rel="noreferrer">查看网站 ↗</a>
          <form action={logoutAction}>
            <button className="studio-mini" type="submit">退出</button>
          </form>
        </div>
      </header>

      <main className="visitor-main">
        <div className="visitor-heading">
          <div>
            <h1>访客记录</h1>
            <p>查看访问时间、页面、IP 地址及大致地域。日期与时间均为 UTC+8。</p>
          </div>
          <button
            className="studio-mini"
            type="button"
            disabled={status === 'loading' || status === 'expired'}
            onClick={() => setRevision((value) => value + 1)}
          >
            {status === 'loading' ? '读取中…' : '刷新记录'}
          </button>
        </div>

        <form className="visitor-filters" onSubmit={search}>
          <label className="studio-field">
            <span>开始日期</span>
            <input type="date" required value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </label>
          <label className="studio-field">
            <span>结束日期</span>
            <input type="date" required value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </label>
          <label className="studio-field">
            <span>完整 IP 地址</span>
            <input type="text" autoComplete="off" placeholder="全部 IP" maxLength={45} value={filters.ip} onChange={(event) => setFilters({ ...filters, ip: event.target.value })} />
          </label>
          <label className="studio-field">
            <span>完整页面路径</span>
            <input type="text" autoComplete="off" placeholder="例如 /work/reincarnation-machine" maxLength={256} value={filters.path} onChange={(event) => setFilters({ ...filters, path: event.target.value })} />
          </label>
          <div className="studio-row visitor-filters__actions">
            <button className="studio-publish" type="submit" disabled={status === 'expired'}>查询</button>
            <button className="studio-mini" type="button" onClick={reset}>重置</button>
          </div>
          {validation && <p className="studio-error visitor-filters__validation" role="alert">{validation}</p>}
        </form>

        <div className="visitor-results" aria-busy={status === 'loading'}>
          {status === 'loading' && <p className="visitor-message" role="status">正在读取访客记录…</p>}
          {status === 'expired' && (
            <div className="visitor-message" role="alert">
              <h2>登录已过期</h2>
              <p>重新登录后可继续查看记录。</p>
              <a className="studio-mini" href="/studio/visitors">重新登录</a>
            </div>
          )}
          {status === 'error' && (
            <div className="visitor-message" role="alert">
              <h2>暂时无法读取记录</h2>
              <p>{error}</p>
              <button className="studio-mini" type="button" onClick={() => setRevision((value) => value + 1)}>重试</button>
            </div>
          )}
          {status === 'ready' && result?.mode === 'disabled' && (
            <div className="visitor-message" role="status">
              <h2>尚未接入线上数据库</h2>
              <p>完成数据库配置并重新部署后，网站才会开始保存访问记录；无法补录此前的访问。</p>
              <p>配置步骤见仓库中的 <code>docs/visitor-analytics.md</code>。</p>
            </div>
          )}
          {status === 'ready' && data && (
            <>
              {result?.mode === 'local' && (
                <p className="visitor-local" role="status">本地模式：这里显示的是当前电脑保存的访问记录，线上访客记录需要连接数据库。</p>
              )}
              <div className="visitor-summary">
                <dl>
                  <div><dt>访问记录</dt><dd>{data.total.toLocaleString('zh-CN')}</dd></div>
                  <div><dt>独立 IP</dt><dd>{data.uniqueIps.toLocaleString('zh-CN')}</dd></div>
                </dl>
                <p>{query.from} 至 {query.to} · 当前筛选范围</p>
              </div>
              <p className="visitor-note">仅保留最近 30 天。独立 IP 不等于访客人数；同一网络可能共用 IP。地域来自 IP 的大致归属，不能识别具体个人或精确位置。</p>
              {data.records.length === 0 ? (
                <div className="visitor-message" role="status">
                  <h2>这个范围内还没有访问记录</h2>
                  <p>可以扩大日期范围或清除 IP、页面筛选。记录从启用采集后开始保存。</p>
                </div>
              ) : (
                <div className="visitor-table-wrap">
                  <table className="visitor-table">
                    <caption>访客访问明细，时间为 UTC+8，最新记录在前</caption>
                    <thead><tr><th scope="col">访问时间 · UTC+8</th><th scope="col">页面</th><th scope="col">IP 地址</th><th scope="col">大致地域</th><th scope="col">来源</th></tr></thead>
                    <tbody>
                      {data.records.map((record) => (
                        <tr key={record.id}>
                          <td data-label="访问时间 · UTC+8"><time dateTime={record.visitedAt}>{formatTime(record.visitedAt)}</time></td>
                          <td data-label="页面" className="visitor-table__path">
                            {record.path ? <button className="visitor-filter-link" type="button" title="只看此页面的访问" onClick={() => filterBy('path', record.path)}>{record.path}</button> : '未知'}
                          </td>
                          <td data-label="IP 地址" className="visitor-table__ip">
                            {record.ip ? <button className="visitor-filter-link" type="button" title="只看此 IP 的访问" onClick={() => filterBy('ip', record.ip!)}>{record.ip}</button> : '未知'}
                          </td>
                          <td data-label="大致地域">{locationOf(record)}</td>
                          <td data-label="来源">{record.referrer || '未知'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <nav className="visitor-pagination" aria-label="访客记录分页">
                <p>第 {data.page} / {pageCount} 页 · 每页 {data.pageSize} 条</p>
                <div className="studio-row">
                  <button className="studio-mini" type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>上一页</button>
                  <button className="studio-mini" type="button" disabled={data.page >= pageCount} onClick={() => setPage(data.page + 1)}>下一页</button>
                </div>
              </nav>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
