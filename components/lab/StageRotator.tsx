'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FourBarBench } from './FourBarBench';
import { ArchBench } from './ArchBench';
import { TentacleBench } from './TentacleBench';
import { RingsBench } from './RingsBench';

/**
 * 主页 Stage 待机展示：四台 Lab 台架按顺序自动轮播（用户拍板 2026-07-27）。
 *
 * 三条工程约束决定了这个实现：
 * ① **懒挂载**——首屏只建四杆；轮到某台才建，建后保留（3D 台架重建要重传 GPU 缓冲、
 *    触手还要重取 1.4MB 网格，每轮重建不可接受）。
 * ② **非当前片停跑**（active 门控）——IntersectionObserver 只看几何、看不见
 *    visibility/opacity，不显式关会让后台台架空烧 CPU 与 WebGL。
 * ③ **交互即暂停**——用户在台架上按下就停轮播（正拖着被切走最恼人），
 *    静置 RESUME_MS 后恢复。
 * reduced-motion：不轮播，定格第一台。
 */
const DWELL_MS = 9000; // 每台停留
const RESUME_MS = 15000; // 交互后恢复轮播的静置时长
const FADE_MS = 520; // 与 --dur-struct 同

const SLIDES = [
  { key: 'fourbar', caption: 'Fig. 01 · four-bar · live', href: '/lab#lab01' },
  { key: 'arch', caption: 'Fig. 12 · S4 arch ring · live', href: '/lab#lab02' },
  { key: 'tentacle', caption: 'Lab.03 · tendon tentacle · live', href: '/lab#lab03' },
  { key: 'rings', caption: 'Fig. 13 · five-ring shell · live', href: '/lab#lab04' },
] as const;

export function StageRotator() {
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState<number[]>([0]);
  const [rotating, setRotating] = useState(true);
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRotating(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SLIDES.length), DWELL_MS);
    return () => clearTimeout(t);
  }, [rotating, idx]);

  // 轮到某台才挂载（挂载后常驻）
  useEffect(() => {
    setMounted((m) => (m.includes(idx) ? m : [...m, idx]));
  }, [idx]);

  // 台架上有指针动作 → 暂停轮播，静置后恢复
  const hold = (): void => {
    setRotating(false);
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => setRotating(true), RESUME_MS);
  };
  useEffect(() => () => clearTimeout(holdRef.current), []);

  const slide = SLIDES[idx];

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
            const on = i === idx;
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
                  opacity: on ? 1 : 0,
                  visibility: on ? 'visible' : 'hidden',
                  pointerEvents: on ? 'auto' : 'none',
                  transition: `opacity ${FADE_MS}ms var(--ease-site), visibility ${FADE_MS}ms`,
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
          {slide.caption}
          {/* 轮播指示点：也可点选，点选即暂停自动轮播 */}
          <span className="flex items-center" style={{ gap: 5 }}>
            {SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`展示 ${s.caption}`}
                onClick={() => {
                  setIdx(i);
                  hold();
                }}
                style={{
                  width: i === idx ? 14 : 5,
                  height: 3,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  cursor: 'pointer',
                  background: i === idx ? 'var(--g500)' : 'var(--n300)',
                  transition: 'width var(--dur-micro) var(--ease-site)',
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
