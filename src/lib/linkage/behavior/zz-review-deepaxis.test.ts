import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-personal-website/97efef09-60ad-5a3f-b9bc-b110dafb47ef/scratchpad/review/deepaxis.txt';
import { BehaviorEngine, type EngineState, HZ } from './engine';
import { PERSONA_KEYS, type PersonaKey } from './persona';
import { tendonContractions, nearestAxis } from '../machine-behavior';

const REFLEX = new Set(['flex', 'zv2', 'aftershock', 'recoil', 'wince', 'unhook', 'antic']);

function grown(P: PersonaKey, seed: number): BehaviorEngine {
  const e = new BehaviorEngine({ seed, order: [P, ...PERSONA_KEYS.filter((k) => k !== P)], loop: false, vocab: 2 });
  e.skip();
  e.tick();
  e.drain();
  const st = e.state as EngineState;
  st.nextSpont = 1e9;
  st.nextOrient = 1e9;
  e.advance(4, 1000);
  e.drain();
  return e;
}

it('review', () => {
 for (const EV of [{ kind: 'SHELL_HOLD', half: 'both', on: true }, { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' }, { kind: 'SHELL_STROKE', half: 'R', touch: 'pat' }, { kind: 'FEELER_TOUCH', feeler: 1, side: 'R' }] as any[]) {
  for (const P of ['A', 'C', 'D'] as PersonaKey[]) {
    let worst = { jump: 0, seed: -1, phase: '', motion: '', deep: 0, dir: 0, prevDir: 0 };
    let offAxisDeepTicks = 0;
    let offAxisDeepSeeds = 0;
    let motions = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const e = grown(P, seed);
      e.push(EV);
      let prev = e.targets();
      let prevC = tendonContractions(prev.arm, { deep: true });
      let sawOff = false;
      for (let i = 0; i < 14 * HZ; i++) {
        e.tick();
        e.drain();
        const tg = e.targets();
        const mo = e.motion();
        const ph = mo?.phase ?? '';
        if (mo) motions.set(mo.name, (motions.get(mo.name) ?? 0) + 0);
        const d = tg.arm.deep ?? 0;
        if (d > 1e-9) {
          const off = nearestAxis(tg.arm.dir).off;
          if (off > 1e-6) {
            offAxisDeepTicks++;
            sawOff = true;
          }
        }
        const c = tendonContractions(tg.arm, { deep: true });
        const j = Math.max(...c.map((x, k) => Math.abs(x - prevC[k])));
        if (!REFLEX.has(ph) && j > worst.jump) worst = { jump: j, seed, phase: ph, motion: mo?.name ?? '-', deep: d, dir: (tg.arm.dir * 180) / Math.PI, prevDir: (prev.arm.dir * 180) / Math.PI };
        const inW = (a: typeof tg.arm) => (a.deep ?? 0) > 0 && nearestAxis(a.dir).off <= (12 * Math.PI) / 180;
        if (false && inW(tg.arm) !== inW(prev.arm)) appendFileSync(OUT, `X ${P} seed ${seed} ${ph} ${mo?.name} jump ${j.toFixed(4)} deep ${(tg.arm.deep ?? 0).toFixed(4)}/${(prev.arm.deep ?? 0).toFixed(4)} dir ${(tg.arm.dir * 180 / Math.PI).toFixed(2)}/${(prev.arm.dir * 180 / Math.PI).toFixed(2)} bend ${tg.arm.bend.toFixed(3)} tone ${tg.arm.tone.toFixed(3)} c ${c.map((x) => x.toFixed(3))} pc ${prevC.map((x) => x.toFixed(3))}\n`);
        prevC = c;
        prev = tg;
      }
      if (sawOff) offAxisDeepSeeds++;
    }
    appendFileSync(OUT, EV.kind + '/' + (EV.half ?? EV.feeler) + ' ' + P + ' ' + JSON.stringify({ worst, offAxisDeepTicks, offAxisDeepSeeds, motions: [...motions.keys()] }) + '\n');
  }
 }
}, 120000);
