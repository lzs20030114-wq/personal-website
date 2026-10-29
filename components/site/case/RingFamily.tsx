import RINGS from '../../../src/lib/site/ring-family.data.json';
import type { Lang } from '../../../src/lib/site/case-reincarnation';

/**
 * N07 · 五环参数族（2026-10-29，项目一案例页重构）：五个环在中间轴 0°（全开）与 180°（折叠）时的形状，
 * 同一比例并排。数据取站上的解算（shell3d.ts，Lab 1-4 / 1-5 与交接图册 RM-HO-08 同一份），
 * 由 scripts/case-figures/ring-family.mjs 生成 ring-family.data.json，这里只画。
 * 全开 = 细线，折叠 = 实心浅绿，两者共用地线（脚槽）与中轴，看得出整环等比缩小。
 */

type Ring = {
  ring: string;
  base: string;
  tris: number[][];
  apex: [number, number];
  innerTravel: number;
  open: [number, number][];
  fold: [number, number][];
};
const DATA = RINGS as unknown as Ring[];

const S = 0.56; // mm → viewBox 单位（与交接图册同一比例）
const COL = 216;
const GROUND = 150;
const H = 214;

const T = {
  zh: {
    title: '五环参数族',
    sub: '同一比例 · 细线 = 全开（中轴 0°）· 实心 = 折叠（180°）',
    apex: '拱顶',
    inner: '内侧脚行程',
    aria: '五个呼吸环全开与折叠的形状对照',
  },
  en: {
    title: 'The five-ring family',
    sub: 'same scale · outline = open (shaft 0°) · filled = folded (180°)',
    apex: 'apex',
    inner: 'inner-foot travel',
    aria: 'The five breathing rings, open and folded, at the same scale',
  },
};

const pts = (cx: number, ns: [number, number][], t: number[]) =>
  t.map((i) => `${(cx + ns[i][0] * S).toFixed(1)},${(GROUND - ns[i][1] * S).toFixed(1)}`).join(' ');

export function RingFamily({ id = 'N07', lang = 'en' }: { id?: string; lang?: Lang }) {
  const t = T[lang];
  return (
    <figure className="cs-rings">
      <span className="cs-panel__row">
        <span className="cs-id">
          {id} · {t.title}
        </span>
        <span className="cs-dim">{t.sub}</span>
      </span>
      <div className="cs-rings__grid" role="img" aria-label={t.aria}>
        {DATA.map((r) => {
          const cx = COL / 2;
          return (
            <svg key={r.ring} className="cs-rings__svg" viewBox={`0 0 ${COL} ${H}`} aria-hidden="true">
              <line className="cs-rings__ground" x1={cx - 100} x2={cx + 100} y1={GROUND} y2={GROUND} />
              {r.tris.map((tri, j) => (
                <polygon key={`f${j}`} className="cs-rings__fold" points={pts(cx, r.fold, tri)} />
              ))}
              {r.tris.map((tri, j) => (
                <polygon key={`o${j}`} className="cs-rings__open" points={pts(cx, r.open, tri)} />
              ))}
              <circle className="cs-rings__axis" cx={cx} cy={GROUND} r={2.6} />
              <text className="cs-rings__name" x={cx} y={176} textAnchor="middle">
                {r.ring} · {r.base}
              </text>
              <text className="cs-rings__num" x={cx} y={193} textAnchor="middle">
                {t.apex} {Math.round(r.apex[0])} → {Math.round(r.apex[1])} mm
              </text>
              <text className="cs-rings__num" x={cx} y={208} textAnchor="middle">
                {t.inner} {r.innerTravel.toFixed(1)}
              </text>
            </svg>
          );
        })}
      </div>
    </figure>
  );
}
