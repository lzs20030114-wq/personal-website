import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CASE_FRAMES, frameSrc } from '../../../src/lib/site/case-frames';
import type { SlotLang } from '../slots';

/**
 * 分镜条（2026-10-28，作者「把它们的过程一帧一帧像漫画一样截出来放在一起」）：
 * 一组从 /lab 台架截下来的小帧按时间排成一行，每格左上编号、下方一行读数（步数或时刻）
 * 和一句说明。点任何一格都在页内看图器里看大图（ImageViewer，同一页所有分镜按页面顺序翻），
 * 没有脚本时链接照旧打开原图。帧数据在 src/lib/site/case-frames.ts，截图脚本 scripts/case-frames/。
 *
 * 版式语言照案例页的图框（.cs-* token、发丝线、mono 读数），图注两列与 FigSlot 相同；
 * 「去实验室」链接直达对应台架，那里能动手跑同一台；不是台架截图的组（模型渲染）不出这条链接。
 */
export function FrameStrip({ id, set, lang = 'en' }: { id: string; set: string; lang?: SlotLang }) {
  const s = CASE_FRAMES[set];
  // 组不存在时画一个占位框而不是让整页构建失败；case-frames.test.ts 会卡住「正文引用的组都存在」
  if (!s)
    return (
      <figure className="cs-strip">
        <div className="cs-figure__frame" style={{ aspectRatio: '6 / 1' }}>
          <div className="cs-figure__ph">{id} · frames pending · {set}</div>
        </div>
      </figure>
    );
  const n = id.replace(/^FIG\./, '');
  const cols = s.cols ?? s.frames.length;
  // 窄屏折成三列、两列：repeat() 的次数不吃 min()，在这里算好再给
  const style = { '--cols': cols, '--cols-m': Math.min(cols, 3), '--cols-s': Math.min(cols, 2), '--ar': `${s.w} / ${s.h}` } as CSSProperties;
  return (
    <figure className={`cs-strip${s.frames.length === 1 ? ' cs-strip--one' : ''}`} style={style}>
      <ol className="cs-strip__grid">
        {s.frames.map((f, i) => {
          const no = String(i + 1).padStart(2, '0');
          const capEn = [f.t.en, f.note?.en].filter(Boolean).join(' · ');
          const capZh = [f.t.zh, f.note?.zh].filter(Boolean).join(' · ');
          return (
            <li key={f.file} className="cs-strip__cell">
              <a
                className="cs-strip__shot"
                href={frameSrc(set, f.file)}
                target="_blank"
                rel="noopener"
                data-viewer={frameSrc(set, f.file)}
                data-w={s.w}
                data-h={s.h}
                data-n={s.frames.length === 1 ? n : `${n}-${i + 1}`}
                data-cap-en={`${s.caption.en} · ${capEn}`}
                data-cap-zh={`${s.caption.zh} · ${capZh}`}
              >
                <img
                  src={frameSrc(set, f.file, true)}
                  width={s.tw}
                  height={Math.round((s.tw * s.h) / s.w)}
                  alt={lang === 'zh' ? capZh : capEn}
                  loading="lazy"
                  decoding="async"
                />
                {s.frames.length > 1 ? <span className="cs-strip__no">{no}</span> : null}
              </a>
              <span className="cs-strip__t">{f.t[lang]}</span>
              {f.note ? <span className="cs-strip__note">{f.note[lang]}</span> : null}
            </li>
          );
        })}
      </ol>
      <figcaption>
        <span className="cs-cap__id">{id}</span>
        <span className="cs-cap__t">
          <span className="cs-cap__cap">{s.caption[lang]}</span>
          {s.sub || s.lab ? (
            <span className="cs-cap__sub">
              {s.sub ? `${s.sub[lang]} ` : ''}
              {s.lab ? (
                <Link href={`/lab#lab${s.hash ?? s.lab}`} prefetch={false} className="cs-strip__lab">
                  {lang === 'zh' ? `实验 ${s.lab} ↗` : `Lab ${s.lab} ↗`}
                </Link>
              ) : null}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
