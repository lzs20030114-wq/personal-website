import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { PageEnter } from '../../../components/site/PageEnter';
import { FourBarBench } from '../../../components/lab/FourBarBench';
import { ArchBench } from '../../../components/lab/ArchBench';
import { TentacleBench } from '../../../components/lab/TentacleBench';
import { RingsBench } from '../../../components/lab/RingsBench';

export const metadata = { title: 'The lab' };

/**
 * The lab（Lab-Modernist 稿 → MAPPING §6.3）：四台真求解器台架，深色语言与 case/log 一致。
 * 每台跑的是站内 TS 内核（src/lib/linkage，封盘零改），不是视频、不是二次实现。
 * 规格表文案照搬设计稿。
 */
const SPEC_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const SPEC_VALUE: CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--n700)' };

function Bench({
  no,
  title,
  lede,
  specs,
  children,
}: {
  no: string;
  title: string;
  lede: string;
  specs: [string, string][];
  children: ReactNode;
}) {
  return (
    <section
      id={`lab${no}`}
      style={{ padding: '48px 0', borderTop: 'var(--hair)', scrollMarginTop: 24 }}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col" style={{ gap: 14 }}>
          <p style={{ ...SPEC_LABEL, color: 'var(--accent)', margin: 0 }}>Lab.{no}</p>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(26px, 2.6vw, 38px)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--n700)', maxWidth: '46ch' }}>
            {lede}
          </p>
          <dl className="grid grid-cols-2" style={{ gap: '14px 20px', margin: '6px 0 0' }}>
            {specs.map(([k, v]) => (
              <div key={k} style={{ borderTop: 'var(--hair)', paddingTop: 8 }}>
                <dt style={SPEC_LABEL}>{k}</dt>
                <dd style={{ ...SPEC_VALUE, margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0">{children}</div>
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
        <header style={{ padding: '64px 0 32px' }}>
          <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 16 }}>
            <p style={{ ...SPEC_LABEL, margin: 0 }}>
              S2 — The lab · four live instruments
            </p>
            <span className="flex items-center" style={{ ...SPEC_LABEL, gap: 14 }}>
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
              fontSize: 'clamp(40px, 7vw, 78px)',
              fontWeight: 800,
              lineHeight: 0.96,
              letterSpacing: '-0.02em',
              margin: '18px 0 0',
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
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: '20px 0 0', maxWidth: '62ch', color: 'var(--n700)' }}>
            Every figure below runs the real solver — the same kernel that drives the hardware. Drag
            them; nothing here is a video. Same kernel, same tests, same stops as the hardware
            benches.
          </p>
        </header>

        <Bench
          no="01"
          title="Four-bar linkage"
          lede="The 2D testbench behind Fig. 01 — position-based dynamics with a Gauss–Seidel pass, driven from the crank."
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
          specs={[
            ['Family', 'S1–S5 · ladder 0 / 2 / 4 / 8'],
            ['Choreo', 'In-phase · ω 0.8 · step 1/120 s'],
            ['Peaks', '0.24–0.42 mm'],
            ['Drive', 'Breathe toggle · phase slider'],
          ]}
        >
          <RingsBench />
        </Bench>

        <footer
          className="flex flex-wrap items-baseline justify-between"
          style={{ gap: 16, padding: '32px 0 72px', borderTop: 'var(--hair)' }}
        >
          <span style={SPEC_LABEL}>04 instruments · one kernel · all live</span>
          <span className="flex" style={{ gap: 18 }}>
            <Link href="/work/reincarnation-machine" className="rule-link">
              Work →
            </Link>
            <Link href="/archive" className="rule-link">
              Log →
            </Link>
          </span>
        </footer>
      </div>
    </>
  );
}
