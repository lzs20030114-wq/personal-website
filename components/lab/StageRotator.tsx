'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FourBarBench } from './FourBarBench';
import { ArchBench } from './ArchBench';
import { TentacleBench } from './TentacleBench';
import { RingsBench } from './RingsBench';

/**
 * 主页 Stage 待机展示：四台 Lab 台架按顺序自动轮播（用户拍板 2026-07-27）。
 *
 * 转场 = 横向滑入 + 交叉淡出（用户拍板 2026-07-27：不要硬切）。
 * ★ 硬切的真因：懒挂载的片是「凭空出现在最终态」——新挂载元素没有起始值，
 *   CSS transition 根本不会跑。所以必须**预挂载**：当前片入位 PREMOUNT_MS 后
 *   就把下一片建好、停在待入位（右侧 +ENTER_X、opacity 0），轮到它时才有动画可跑。
 *   预挂载顺带把 3D 初始化成本挪到切换之前，切过去不卡顿。
 *
 * 另两条工程约束：
 * ① **非当前片停跑**（active 门控）——IntersectionObserver 只看几何、看不见
 *    visibility/opacity，不显式关会让后台台架空烧 CPU 与 WebGL。
 * ② **交互即暂停**——在台架上按下就停轮播（正拖着被切走最恼人），静置 RESUME_MS 恢复。
 * reduced-motion：不轮播、不位移，定格第一台。
 */
const DWELL_MS = 4000; // 每台停留（用户拍板 2026-07-27：9s 太长，改 4s）
const RESUME_MS = 15000; // 交互后恢复轮播的静置时长
const PREMOUNT_MS = 1200; // 入位多久后预建下一片（必须 < DWELL_MS）
const OUT_MS = 380; // 旧片退场
const IN_MS = 460; // 新片入场
const IN_DELAY = 120; // 入场稍晚起步 → 交叉而不是对撞
const ENTER_X = '4%'; // 入场起点 / 退场终点的横向位移

const SLIDES = [
  { key: 'fourbar', caption: 'Fig. 01 · four-bar · live', href: '/lab#lab01' },
  { key: 'arch', caption: 'Fig. 12 · S4 arch ring · live', href: '/lab#lab02' },
  { key: 'tentacle', caption: 'Lab.03 · tendon tentacle · live', href: '/lab#lab03' },
  { key: 'rings', caption: 'Fig. 13 · five-ring shell · live', href: '/lab#lab04' },
] as const;

export function StageRotator() {
  const [{ cur, prev }, setSlide] = useState({ cur: 0, prev: -1 });
  const [mounted, setMounted] = useState<number[]>([0]);
  const [rotating, setRotating] = useState(true);
  const [reduced, setReduced] = useState(false);
  const curRef = useRef(0);
  const mountedRef = useRef<number[]>([0]);
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  curRef.current = cur;
  mountedRef.current = mounted;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setRotating(false);
    }
  }, []);

  /** 切到第 n 片：没建过的先建、停一帧在待入位，下一帧才激活——否则没有起始值＝硬切。 */
  const activate = useCallback((n: number) => {
    if (n === curRef.current) return;
    if (mountedRef.current.includes(n)) {
      setSlide((s) => ({ cur: n, prev: s.cur }));
      return;
    }
    setMounted((m) => (m.includes(n) ? m : [...m, n]));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setSlide((s) => ({ cur: n, prev: s.cur }))),
    );
  }, []);

  // 自动轮播
  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => activate((curRef.current + 1) % SLIDES.length), DWELL_MS);
    return () => clearTimeout(t);
  }, [rotating, cur, activate]);

  // 预挂载下一片（停在待入位，供转场使用）
  useEffect(() => {
    if (!rotating) return;
    const next = (cur + 1) % SLIDES.length;
    if (mounted.includes(next)) return;
    const t = setTimeout(
      () => setMounted((m) => (m.includes(next) ? m : [...m, next])),
      PREMOUNT_MS,
    );
    return () => clearTimeout(t);
  }, [cur, rotating, mounted]);

  // 台架上有指针动作 → 暂停轮播，静置后恢复
  const hold = useCallback((): void => {
    setRotating(false);
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => setRotating(true), RESUME_MS);
  }, []);
  useEffect(() => () => clearTimeout(holdRef.current), []);

  const slide = SLIDES[cur];

  /** 三态：当前片入位 / 刚离开的片向左退场 / 其余停在右侧待入位（无过渡） */
  const slideStyle = (i: number): React.CSSProperties => {
    const on = i === cur;
    const leaving = i === prev;
    if (reduced) {
      return {
        opacity: on ? 1 : 0,
        visibility: on ? 'visible' : 'hidden',
        pointerEvents: on ? 'auto' : 'none',
      };
    }
    return {
      opacity: on ? 1 : 0,
      transform: on ? 'translateX(0)' : `translateX(${leaving ? `-${ENTER_X}` : ENTER_X})`,
      transition: on
        ? `opacity ${IN_MS}ms var(--ease-site) ${IN_DELAY}ms, transform ${IN_MS}ms var(--ease-site) ${IN_DELAY}ms`
        : leaving
          ? `opacity ${OUT_MS}ms var(--ease-site), transform ${OUT_MS}ms var(--ease-site)`
          : 'none',
      pointerEvents: on ? 'auto' : 'none',
    };
  };

  return (
    <>
      <div
        style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}
        onPointerDown={hold}
        onWheelCapture={hold}
      >
        {/* data-ptm = goPT 转场克隆源（取当前片） */}
        <div
          data-ptm
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {SLIDES.map((s, i) => {
            if (!mounted.includes(i)) return null;
            const on = i === cur;
            return (
              <div
                key={s.key}
                aria-hidden={!on}
                style={{
                  position: i === 0 ? 'relative' : 'absolute',
                  inset: i === 0 ? undefined : 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  willChange: 'opacity, transform',
                  ...slideStyle(i),
                }}
              >
                {s.key === 'fourbar' && <FourBarBench active={on} />}
                {s.key === 'arch' && <ArchBench active={on} />}
                {s.key === 'tentacle' && <TentacleBench active={on} controls={false} />}
                {s.key === 'rings' && <RingsBench active={on} controls={false} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <span
          className="flex items-center"
          style={{
            gap: 10,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--n600)',
          }}
        >
          {/* key 变化 → 重挂载 → 重播入场动画（图注跟着片走） */}
          <span key={slide.key} className="stage-cap">
            {slide.caption}
          </span>
          {/* 轮播指示点：可点选，点选即暂停自动轮播 */}
          <span className="flex items-center" style={{ gap: 5 }}>
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`展示 ${s.caption}`}
                onClick={() => {
                  activate(i);
                  hold();
                }}
                style={{
                  width: i === cur ? 14 : 5,
                  height: 3,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  cursor: 'pointer',
                  background: i === cur ? 'var(--g500)' : 'var(--n300)',
                  transition:
                    'width var(--dur-micro) var(--ease-site), background var(--dur-micro) var(--ease-site)',
                }}
              />
            ))}
          </span>
        </span>
        <Link href={slide.href} className="rule-link" data-pt style={{ fontSize: 10 }}>
          Open the lab →
        </Link>
      </div>
    </>
  );
}
