import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { PageEnter } from '../../../components/site/PageEnter';
import { FourBarBench } from '../../../components/lab/FourBarBench';
import { ArchBench } from '../../../components/lab/ArchBench';
import { TentacleBench } from '../../../components/lab/TentacleBench';
import { RingsBench } from '../../../components/lab/RingsBench';
import { MachineBench } from '../../../components/lab/MachineBench';

export const metadata = { title: 'The lab' };

/**
 * The lab（Lab-Modernist 稿 → MAPPING §7）：五台真求解器台架，深色语言与 case/log 一致。
 * ★ 版式逐项对稿：300px 定宽左栏 + 44px 间距；规格表竖排行（92px 标签列 + 发丝线分隔）；
 *   图框 3px 彩色顶线（2D 绿 / 3D 紫）+ 极淡填充；标题 72px；页脚两链。
 * 每台跑的是站内 TS 内核（src/lib/linkage，封盘零改），不是视频、不是二次实现。
 */
const KICKER: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const LEGEND: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const SPEC_KEY: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n500)',
  paddingTop: 2,
};
const HAIR_14 = '1px solid color-mix(in srgb, var(--ink) 14%, transparent)';

function Bench({
  no,
  title,
  lede,
  specs,
  accent,
  children,
}: {
  no: string;
  title: string;
  lede: string;
  specs: [string, string][];
  /** 图框顶线：2D 内核绿 / 3D 内核紫（稿内编码） */
  accent: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`lab${no}`}
      className="lab-section"
      style={{ padding: '44px 0 52px', borderBottom: 'var(--hair)', scrollMarginTop: 16 }}
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          Lab.{no}
        </p>
        <h2
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--n700)', maxWidth: '30ch' }}>
          {lede}
        </p>
        <div style={{ marginTop: 10 }}>
          {specs.map(([k, v], i) => (
            <div
              key={k}
              className="grid"
              style={{
                gridTemplateColumns: '92px 1fr',
                gap: 12,
                padding: '8px 0',
                borderTop: HAIR_14,
                ...(i === specs.length - 1 ? { borderBottom: HAIR_14 } : {}),
                fontSize: 12,
              }}
            >
              <span style={SPEC_KEY}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          border: 'var(--hair)',
          borderTop: `3px solid ${accent}`,
          background: 'color-mix(in srgb, var(--ink) 4.5%, transparent)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

export default function LabPage() {
  return (
    <>
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <div className="shell pg-dark" data-pt-content>
        <header style={{ padding: '64px 0 40px', borderBottom: 'var(--hair)' }}>
          <div className="flex items-baseline justify-between" style={{ gap: 32 }}>
            <p style={{ ...KICKER, margin: '0 0 16px' }}>S2 — The lab · five live instruments</p>
            <span style={LEGEND}>
              <span className="flex items-center" style={{ gap: 6 }}>
                <span style={{ width: 9, height: 9, background: 'var(--accent)' }} />
                2D kernel
              </span>
              <span className="flex items-center" style={{ gap: 6 }}>
                <span style={{ width: 9, height: 9, background: 'var(--accent-2)' }} />
                3D kernel
              </span>
              <span>All live</span>
            </span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(44px, 7vw, 72px)',
              fontWeight: 800,
              lineHeight: 0.98,
              letterSpacing: '-0.02em',
              margin: 0,
              textTransform: 'uppercase',
            }}
          >
            The lab
          </h1>
          <svg width="230" height="12" style={{ display: 'block', margin: '16px 0 0', overflow: 'visible' }}>
            <line
              className="dash-rule"
              x1="0"
              y1="4"
              x2="230"
              y2="4"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="8 6"
            />
            <line x1="0" y1="10" x2="150" y2="10" stroke="var(--accent-2)" strokeWidth="1.5" />
          </svg>
          <p style={{ fontSize: 19, lineHeight: 1.5, margin: '24px 0 0', maxWidth: '56ch' }}>
            Every figure below runs the real solver — the same kernel that drives the hardware. Drag
            them; nothing here is a video. Same kernel, same tests, same stops as the hardware
            benches.
          </p>
        </header>

        <Bench
          no="01"
          title="Four-bar linkage"
          lede="The 2D testbench behind Fig. 01 — position-based dynamics with a Gauss–Seidel pass, driven from the crank."
          accent="var(--accent)"
          specs={[
            ['Kernel', '2D PBD · Gauss–Seidel'],
            ['Tests', '36 green'],
            ['Render', 'SVG · live coupler trace'],
            ['Drive', 'Any free node · release damping'],
          ]}
        >
          <FourBarBench />
        </Bench>

        <Bench
          no="02"
          title="Arch ring solver"
          lede="The physical S4 ring — angulated plates on a crank-slider, run as a preset of the untouched 2D kernel."
          accent="var(--accent)"
          specs={[
            ['Kernel', 'Same 2D core — untouched'],
            ['Instance', 'S4 M3×1.000 · 14 plates'],
            ['Stops', 'Dual-end slot clamp · fixed step'],
            ['Drive', 'Apex / feet / crank pin'],
          ]}
        >
          <ArchBench />
        </Bench>

        <Bench
          no="03"
          title="Tendon tentacle"
          lede="Seven box vertebrae on three tendons at 120° — the independent 3D kernel, rendered from the real scanned mesh."
          accent="var(--accent-2)"
          specs={[
            ['Kernel', 'LinkageSolver3D · symmetric GS'],
            ['Mesh', '107k tri · real scan'],
            ['Camera', 'Trackball · wheel zoom · RMB pan'],
            ['Drive', 'Tendon sliders · critical damping'],
          ]}
        >
          <TentacleBench />
        </Bench>

        <Bench
          no="04"
          title="Five-ring shell"
          lede="Five ring instances breathing in phase — 85 mm pitch, foot slots auto-calibrated per ring."
          accent="var(--accent-2)"
          specs={[
            ['Family', 'S1–S5 · ladder 0 / 2 / 4 / 8'],
            ['Choreo', 'In-phase · ω 0.8 · step 1/120 s'],
            ['Peaks', '0.24–0.42 mm'],
            ['Drive', 'Breathe · phase · skin · views'],
          ]}
        >
          <RingsBench />
        </Bench>

        <Bench
          no="05"
          title="Full assembly"
          lede="The whole machine on one motor — one shaft swings 180° back and forth, five cranks of different radii open and close the rings, and the big arm curls on its three tendons."
          accent="var(--accent-2)"
          specs={[
            ['Bodies', 'Real solids · adjustable skin'],
            ['Drive', 'One shaft · five cranks · in phase'],
            ['Stroke', '180° reciprocating · apex ≡ 2R'],
            ['Arm', 'Three tendons · same solver as Lab.03'],
            ['Caveats', 'Speed not to scale · small arms static'],
          ]}
        >
          <MachineBench />
        </Bench>

        <footer
          className="flex flex-wrap items-baseline justify-between"
          style={{ gap: 32, padding: '26px 0 72px' }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--n500)',
            }}
          >
            05 instruments · one kernel · all live
          </span>
          <span
            className="flex"
            style={{
              gap: 24,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <Link href="/work/reincarnation-machine" style={{ textDecoration: 'none', color: 'var(--g300)' }}>
              Work →
            </Link>
            <Link href="/archive" style={{ textDecoration: 'none', color: 'var(--g300)' }}>
              Log →
            </Link>
          </span>
        </footer>
      </div>
    </>
  );
}
