import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { LabCopyScroll } from '../../../components/lab/LabCopyScroll';
import { PageEnter } from '../../../components/site/PageEnter';
import { FourBarBench } from '../../../components/lab/FourBarBench';
import { ArchBench } from '../../../components/lab/ArchBench';
import { TentacleBench } from '../../../components/lab/TentacleBench';
import { RingsBench } from '../../../components/lab/RingsBench';
import { MachineBench } from '../../../components/lab/MachineBench';
import { SkinBench } from '../../../components/lab/SkinBench';
import { SkinSolidBench } from '../../../components/lab/SkinSolidBench';
import { SkinRingBench } from '../../../components/lab/SkinRingBench';
import { SkinSeriesBench } from '../../../components/lab/SkinSeriesBench';
import { SkinGridBench } from '../../../components/lab/SkinGridBench';
import { SkinDualBench } from '../../../components/lab/SkinDualBench';
import { SquareRingBench } from '../../../components/lab/SquareRingBench';
import { SkinClusterBench } from '../../../components/lab/SkinClusterBench';

export const metadata = { title: 'The lab' };

/**
 * The lab（Lab-Modernist 稿 → MAPPING §7）：十三台真求解器台架，深色语言与 case/log 一致。
 * ★ 版式逐项对稿：300px 定宽左栏 + 44px 间距；规格表竖排行（92px 标签列 + 发丝线分隔）；
 *   图框 3px 彩色顶线（2D 绿 / 3D 紫）+ 极淡填充；标题 72px；页脚两链。
 * 每台跑的是站内 TS 内核，不是视频、不是二次实现：Lab.01–05 = src/lib/linkage（封盘零改，
 * 项目一），Lab.06–13 = src/lib/space（项目二皮肤单元引擎，Python 研究代码的 1:1 移植）。
 *
 * 项目二七台按**尺度**收成四段（2026-09-03 用户拍板「七台四段」——此前九台按立项时间排，
 * 读者看完 4×4 的房间又跳回单条带）：一条带 → 一排 → 一圈 → 一间房；段内按形态族
 * （目录四形态 → 双结构 → 捏分 → 方形）。一台 = 一种排布，编制 = 形态族：
 * 06 二维剖面（SVG）· 07 立体带 · 08 双结构带（原 11）｜09 序列 = 原 08 目录渐变 + 原 12
 * 捏分十级｜10 圆筒环 = 原 09 三编制 + 原 13 捏分环 · 11 方形环（原 14）｜12 环阵列场地（原 10）。
 * 46 种离散差分一档不少，冻在 src/lib/space/lab-variants.test.ts；折进编制按钮的差分用
 * `/lab#labNN-<plan>` 直达（如 #lab10-split）。编号按新页序连续；文档里的旧号见 CLAUDE.md 对照表。
 * 2026-09-03 加第五段 Ⅴ Between units（Lab.13 单元关系）：尺度主轴到「一间房」封顶，Ⅴ 开的是第二条轴
 * ——几个单元**之间**能是什么关系（距离 / 高度 / 形态），编号顺延不重排。
 * 2026-08-18 起页面按项目分组（MAPPING §16）——log 页先例：多项目共用一条主线。
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

/** 项目分组头：台架从此按项目归组（Lab.01–05 = 项目一，Lab.06–12 = 项目二；项目二内再按尺度分四段，见 ScaleRule） */
function ProjectRule({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between"
      style={{ gap: 24, padding: '44px 0 0' }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--n500)',
        }}
      >
        {sub}
      </span>
    </div>
  );
}

/**
 * 尺度段头（项目二专用，2026-09-03 收纳）：Ⅰ 一条带 / Ⅱ 一排 / Ⅲ 一圈 / Ⅳ 一间房。
 * 比 ProjectRule 轻一档（11px、n700），读作项目内的目录而不是又一个项目。
 */
function ScaleRule({ n, label, sub }: { n: string; label: string; sub: string }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between"
      style={{ gap: 24, padding: '40px 0 0' }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--n700)',
        }}
      >
        <span style={{ display: 'inline-block', minWidth: 26, color: 'var(--accent-2)' }}>{n}</span>
        {label}
      </p>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--n500)',
        }}
      >
        {sub}
      </span>
    </div>
  );
}

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
      <div className="lab-copy">
        <div className="lab-copy__inner flex flex-col" style={{ gap: 14 }}>
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
      </div>
      <div
        style={{
          position: 'relative',
          border: 'var(--hair)',
          borderTop: `3px solid ${accent}`,
          background: 'color-mix(in srgb, var(--ink) 4.5%, transparent)',
          // 框贴着台架自己的高度，**不跟着 grid 拉满行高**：左栏（正文 + 规格表）比它长时
          // 拉伸出来的是一个空框，框线一路画到底下什么也没有（Lab.14 实测空了 614px）。
          // 单列（窄屏）下 grid 只有一列，这条不起作用。
          alignSelf: 'start',
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
      <LabCopyScroll />
      <div className="shell pg-dark" data-pt-content>
        <header style={{ padding: '64px 0 40px', borderBottom: 'var(--hair)' }}>
          <div className="flex items-baseline justify-between" style={{ gap: 32 }}>
            <p style={{ ...KICKER, margin: '0 0 16px' }}>S2 — The lab · fifteen live instruments</p>
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
            Every figure below runs a real solver — nothing here is a video. Project I&apos;s
            benches run the same kernels, tests and stops as the hardware; Project II&apos;s
            benches run its structure engine, ported line-for-line from the research code, at four
            scales — one band, a row, a ring, a room.
          </p>
        </header>

        <ProjectRule
          label="Project I — Reincarnation machine"
          sub="Lab.01–05 · two linkage kernels"
        />

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

        {/* 项目二尚未定名：与 log 页 PROJECT_GROUPS 同一措辞（描述而非标题），定名后一并改 */}
        <ProjectRule
          label="Project II — Spatial simulation"
          sub="Lab.06–12 · skin-unit engine · four scales"
        />

        <ScaleRule n="Ⅰ" label="One band" sub="Lab.06–08 · what a unit is" />

        <Bench
          no="06"
          title="Contractile skin units"
          lede="Project II's structure system — a ceiling-hung strip contracts, surplus fabric gathers, and a pre-embedded bond map decides what it becomes: pocket, bulb, ledge or stairs."
          accent="var(--accent)"
          specs={[
            ['Kernel', 'Position-based · Verlet + projection'],
            ['Port', '1:1 from research code · parity ≤ 1e-9'],
            ['Bonds', 'Zipper lock · permanent — hysteresis'],
            ['Roots', 'Hug the shaft · solid-core wall (author rev.)'],
            ['Drive', 'One contraction ℓ · four bond maps'],
            ['Render', 'SVG · smoothing is draw-only'],
          ]}
        >
          <SkinBench />
        </Bench>

        <Bench
          no="07"
          title="Skin units, solid"
          lede="The same four bond maps, extruded into fabric bands with real thickness — the section cut shows the skin as material, and the whole catalog turns in space."
          accent="var(--accent-2)"
          specs={[
            ['Kernel', 'Same 2D engine as Lab.06 · one protocol'],
            ['Solid', 'Extruded band · fabric thickness 5'],
            ['Camera', 'Orbit + presets — shared 3D rig'],
            ['Bonds', 'Zipper rungs on both section cuts'],
            ['Render', 'WebGL z-buffer · bake per frame'],
          ]}
        >
          <SkinSolidBench />
        </Bench>

        <Bench
          no="08"
          title="Two structures, one band"
          lede="One strip, two bond maps — a five-segment spectrum folds an upper and a lower structure out of a single contraction. The glued run between them is pinned to the mast every pass, so the two zippers never feel each other: drop one map and the other folds identically. Four same-form pairs plus one mixed band; set how far apart they sit."
          accent="var(--accent-2)"
          specs={[
            ['Band', 'Five segments: glue · free A · glue · free B · glue'],
            ['Engine', 'Same 2D kernel — the spec was always a list'],
            ['Decouple', 'Gap ≥ 29 nodes ⇒ bit-identical; ≥ 16 ⇒ < 1 px'],
            ['Drive', 'One contraction ℓ — both structures share it'],
            ['Pairs', 'Same-form × 4 + bulb over ledge'],
            ['Gap', '16 / 29 / 48 nodes · live switch'],
          ]}
        >
          <SkinDualBench />
        </Bench>

        <ScaleRule n="Ⅱ" label="A row" sub="Lab.09 · transitions along a line" />

        <Bench
          no="09"
          title="Series"
          lede="Two transition series on one line, every band a real unit. The graded catalogue walks twelve narrow slices from bulb flange to stepped box — each bond map shifts a little, and the transition grows out of the physics, not out of an interpolation. Pinched apart walks ten bands from a single box until it is two platforms: the seam is cut, not carved — an outer ladder folds the box while a second zipper inside it holds the crack open, and every level was designed on its own and measured against the drawn target by silhouette; the numbers agreed three times while the shape was wrong, so only the picture counts. Pack them into one body to read the section, or spread them to read band by band."
          accent="var(--accent-2)"
          specs={[
            ['Plans', 'Graded catalogue (12 bands) · pinched apart (10 levels)'],
            ['Gradient', 'Bond length 0.10 → 0.32 in even steps · endpoints Lab.06 unit 2 → 4, verbatim'],
            ['Pinch', 'One box ⇒ two platforms · platform 12 px · depth 40 · final seam 28'],
            ['Design', 'Per level — no single parameter sweeps it'],
            ['Chains', 'Outer ladder + seam zipper + two face-corner bonds'],
            ['Tether', 'Skin-to-mast, one-sided — a ceiling, not a pin'],
            ['Forming', 'Zipper reversed — the box grows rung by rung from the nose; no warp'],
            ['Fit', 'Silhouette Δ 0.3–3.7 px · neighbours within 1.8×'],
            ['Align', 'Symmetric padding ⇒ the seam centre sits at 138 + 114·r px on every level'],
            ['Mast', 'Gradient: the mast is the core · pinch: fixed mast, skin gathers down it'],
            ['Layouts', 'Packed body ↔ spread row · same run, both plans'],
            ['Render', 'Shared solid bench · WebGL'],
          ]}
        >
          <SkinSeriesBench />
        </Bench>

        <ScaleRule n="Ⅲ" label="A ring" sub="Lab.10–11 · the row closed into a loop" />

        <Bench
          no="10"
          title="Cylinder of units"
          lede="Twenty narrow bands stood in a circle: hanging slack they close into a tube, and as they contract each one folds out its ledge — together, a platform ringing the cylinder. Four plans. By default the ledge climbs and falls once around, a stair wrapped on the tube; hold it level on one form; let the form drift bulb → box → bulb; or bend the pinched series into the ring, so the box splits into two platforms and closes again over a single turn — each level placed twice, mirrored, and because the seam centre sits at the same height on every level the platform reads as one band that opens and shuts, not as twenty different shelves. Set the radius yourself."
          accent="var(--accent-2)"
          specs={[
            ['Ring', '20 bands · level, undulating, drifting, or pinched'],
            ['Height', 'Same form, one lead per station — 18% ↔ 71%'],
            ['Solve', '1 / 11 / 10 engines, 20 placements — same run'],
            ['Closure', 'Palindrome (11 levels) or exact mirror (10) — the seam is one step wide'],
            ['Pinch', 'Lab.09 levels verbatim — no ring-scale, index-bound mechanisms'],
            ['Flat', 'Pinched: seam centre 138 + 114·r px — level-independent'],
            ['Radius', 'Live slider · gaps widen with it'],
            ['Skin', 'Membrane 0–1 · 0.35 by default, 0.15 under the pinch'],
            ['Ceiling', 'Ring plate · fixed masts, skin gathers down them'],
            ['Caveat', 'Bands do not touch each other — 2D sections'],
          ]}
        >
          <SkinRingBench />
        </Bench>

        <Bench
          no="11"
          title="A square ring"
          lede="The mast stays round; the plan does not. Each of the twenty bands reaches out a different distance — four at the corners, eight along the edges, eight on the faces — so the rim lands on a square, and since the membrane between neighbours is a ruled panel, the chord it draws is the edge itself. Only the reach changes: the box is the same height the whole way round, its ladder the same ten rungs, squeezed closer as the shelf gets shallower. Two conditions decide whether that works, and both were learnt the hard way: the end panel must end on a locked rung or the end face bows out, and the box has to fit inside the free run it lives in — when it does not, the lower buffer is pulled straight and the mouth curls the wrong way. The plan is a dial, not a fixed shape: hold the inscribed circle, push only the corners out, and the same twenty bands walk from circle to square in five steps."
          accent="var(--accent-2)"
          specs={[
            ['Ring', '20 bands · three depths — 8 face · 8 edge · 4 corner'],
            ['Plans', 'Flat, undulating — or pinched, where the box splits into two shelves'],
            ['Layout', 'One ring, or sixteen — pitch set edge-to-edge'],
            ['Plan', 'Circle to square in five (|x|ⁿ+|z|ⁿ = aⁿ) · square side 169 px, rim within 0.9 px'],
            ['Reach', '54 / 54 / 54 round · 56 / 64 / 89 square'],
            ['Box', 'Height 36 px everywhere · faces flat within 0.1 px'],
            ['Ladder', '10 rungs on every band, pitched closer when shallow'],
            ['Flat', 'Platform spread 0.0 px — the padding makes it, not a fit'],
            ['Wave', '40 px swing · shape unchanged, only where it sits'],
            ['Pinch', 'One round trip: two shelves 100 px apart on one side, one slab on the opposite side, ten steps between'],
            ['Shelves', '16 px thick, fixed — the gap opens from 0 to 100 px, so the height grows from 32 to 132 px around the ring'],
            ['Why the height varies', 'A solid box must be deeper than it is tall (the buffer rule); a 132 px box would need a 358 px square — so the slab side stays 32 px'],
            ['Forming', 'Tall boxes fold their top face into the seam while forming — the faces are kept straight (a placement rule), and the fold never appears'],
            ['Ten engines', 'One per pair of bands, ten steps of gap from 100 px to 0 — the height drops 11 px a pair, evenly, all the way round'],
            ['Square', 'Side 223 px (flat plan 169), rim within 0.9 px · own band of 338 nodes, own grid pitch'],
            ['Level', 'The seam centre stays level (symmetric padding); the two shelves part evenly above and below it'],
            ['Radius', 'Fixed: the depths are calibrated against it'],
            ['Ceiling', 'Ring plate · fixed masts, skin gathers down them'],
          ]}
        >
          <SquareRingBench />
        </Bench>

        <ScaleRule n="Ⅳ" label="A room" sub="Lab.12 · the field at real scale" />

        <Bench
          no="12"
          title="Four by four"
          lede="Sixteen of the cylinders from Lab.10 hung in a room — 320 bands, one solved section. A 1.70 m figure stands on the floor beside them, and that figure is what sets the scale: everything else on this page had none until now. How far a ledge reaches is set by how much material its outermost bond captures — not by how hard the unit contracts. So this family folds more of the same strip: 202 nodes as before, but the fan spans 2.1× the catalogue's, and the slack hugging the mast is what pays for it. Each ring keeps its own clearance, and pulling the radius breathes the whole field."
          accent="var(--accent-2)"
          specs={[
            ['Field', '4 × 4 rings · 20 bands each · 320 placements'],
            ['Solved', 'One section — the field is that section, placed'],
            ['Scale', 'Figure 1.70 m ⇒ room 3.74 m · ring 1.04 m across'],
            ['Rig', 'Half size, hung lower — underside stays at 1.08 m'],
            ['Pitch', '2 × (radius + peak swell 101.1) + gap · tracks the slider'],
            ['Gap', '1.5 × the gap inside a ring — rings stay separate'],
            ['Plans', 'One form ↔ one form per row'],
            ['Skin', 'A membrane bridges the gaps between bands · 0–1'],
          ]}
        >
          <SkinGridBench />
        </Bench>

        <ScaleRule n="Ⅴ" label="Between units" sub="Lab.13 · what two, three, four, nine units can be to each other" />

        <Bench
          no="13"
          title="Between units"
          lede="Call one of those cylinders a unit — twenty bands round a mast that contract into a ring platform. This bench asks what a few of them can be to each other. Two, three, four or nine hang in Lab.12's room; the relations are measured, not styled: apart (Lab.12's clearance), touching (platform edge to platform edge, with a fabric web growing across each seam once the rims meet), stepped (the same shape carried higher on its band — up to 0.35 m), or interleaved, where a lower platform slides under a higher one and stops short of its neighbour's mast. Interleaving has a physical gate: the step must clear the folded body at its fattest moment, so some form–cluster pairs grey out rather than collide. Timing is a second axis: all at once, or wave by wave across the cluster."
          accent="var(--accent-2)"
          specs={[
            ['Unit', 'One Lab.10 ring — 20 bands · 202 nodes · same bond maps'],
            ['Clusters', 'Pair · triad · two-by-two · three-by-three'],
            ['Relations', 'Apart · touching · apart stepped · touching stepped · interleaved'],
            ['Spacing', 'Derived per relation from peak reach — never a styled number'],
            ['Height', 'lead knob, 14–58 nodes ⇒ up to 0.35 m; shape unchanged'],
            ['Interleave', 'Step ≥ body swell + 6 px · greyed out where it fails'],
            ['Timing', 'Together, or one wave every 150 steps — one solver per unit'],
            ['Seams', 'Touching, level: a 16 cm fabric web bridges each seam'],
            ['Switching', 'Relation re-places without re-solving; form, timing or level count re-solves'],
            ['Scale', 'Lab.12\'s room and 1.70 m figure, whatever the cluster size'],
          ]}
        >
          <SkinClusterBench />
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
            15 instruments · 03 kernels · all live
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
