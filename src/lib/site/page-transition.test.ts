import { describe, expect, it } from 'vitest';
import {
  backdropFor,
  chooseForm,
  homeHashFor,
  inView,
  keepsHeader,
  parseLoc,
  plateVars,
  PT_DURATION,
  settleForm,
  type Loc,
} from './page-transition';

const loc = (path: string, hash = ''): Loc => {
  const l = parseLoc(path, hash);
  if (!l) throw new Error(`not a route: ${path}`);
  return l;
};

describe('parseLoc', () => {
  it('reads the five page routes and only those', () => {
    expect(parseLoc('/')?.kind).toBe('home');
    expect(parseLoc('/work/reincarnation-machine')).toMatchObject({ kind: 'case', slug: 'reincarnation-machine' });
    expect(parseLoc('/lab')?.kind).toBe('lab');
    expect(parseLoc('/archive')?.kind).toBe('log');
    expect(parseLoc('/about')?.kind).toBe('about');
    // 不做转场的：编辑后台、静态台架页、接口、其他
    for (const p of ['/studio', '/demo/index.html', '/api/studio/publish', '/work', '/work/a/b', '/robots.txt']) {
      expect(parseLoc(p)).toBeNull();
    }
  });

  it('takes the bench number out of a lab hash, with or without a plan suffix', () => {
    expect(parseLoc('/lab', '#lab1-5')?.labNo).toBe('1-5');
    expect(parseLoc('/lab', '#lab2-5-split')?.labNo).toBe('2-5');
    expect(parseLoc('/lab', '#lab2-13')?.labNo).toBe('2-13');
    expect(parseLoc('/lab', '#lab-directory')?.labNo).toBeUndefined();
    expect(parseLoc('/lab')?.labNo).toBeUndefined();
  });

  it('ignores a trailing slash', () => {
    expect(parseLoc('/lab/')?.path).toBe('/lab');
  });
});

describe('chooseForm', () => {
  const home = loc('/');
  const homeWork = loc('/', '#work');
  const c1 = loc('/work/reincarnation-machine');
  const c2 = loc('/work/project-ii');
  const lab = loc('/lab');
  const lab15 = loc('/lab', '#lab1-5');
  const log = loc('/archive');
  const about = loc('/about');

  it('does nothing inside one page (hash-only moves are in-page scrolling)', () => {
    expect(chooseForm(lab, lab15)).toBeNull();
    expect(chooseForm(home, homeWork)).toBeNull();
  });

  it('opens a work card into its case page, but only when the card is really there', () => {
    expect(chooseForm(homeWork, c1, { intent: 'card', hasCard: true })).toBe('open');
    // 卡片不在视野里（例如从 Lab 区的「Case study」链接过去）→ 退成升起
    expect(chooseForm(homeWork, c1, { hasCard: false })).toBe('rise');
  });

  it('flies a frame to its bench only when the source frame is there', () => {
    expect(chooseForm(c1, lab15, { intent: 'frame', hasFrame: true })).toBe('morph');
    expect(chooseForm(home, lab15, { intent: 'frame', hasFrame: true })).toBe('morph');
    expect(chooseForm(c1, lab15, { intent: 'frame', hasFrame: false })).toBe('swap');
    // 没有台架编号的 /lab 不可能有落点
    expect(chooseForm(c1, lab, { intent: 'frame', hasFrame: true })).toBe('swap');
  });

  it('goes back to the hub by closing into the card or sinking the sheet', () => {
    expect(chooseForm(c1, homeWork)).toBe('close');
    expect(chooseForm(c1, home)).toBe('sink');
    expect(chooseForm(lab, homeWork)).toBe('sink');
    expect(chooseForm(log, home)).toBe('sink');
  });

  it('raises every other page out of the hub', () => {
    for (const to of [lab, lab15, log, about, c1]) expect(chooseForm(home, to)).toBe('rise');
  });

  it('turns case pages sideways and swaps the rest under a fixed header', () => {
    expect(chooseForm(c1, c2, { intent: 'next' })).toBe('next');
    expect(chooseForm(c2, c1, { intent: 'prev' })).toBe('prev');
    expect(chooseForm(lab, log)).toBe('swap');
    expect(chooseForm(log, c1)).toBe('swap');
    expect(chooseForm(c1, about)).toBe('swap');
  });
});

describe('settleForm', () => {
  const c1 = loc('/work/reincarnation-machine');
  const home = loc('/');

  it('falls back when the landing target is missing', () => {
    expect(settleForm('close', c1, { hasTargetCard: false })).toBe('sink');
    expect(settleForm('close', c1, { hasTargetCard: true })).toBe('close');
    expect(settleForm('morph', c1, { hasTargetFrame: false })).toBe('swap');
    expect(settleForm('morph', home, { hasTargetFrame: false })).toBe('rise');
  });

  it('orders case pages by their case number when both are known', () => {
    expect(settleForm('next', c1, { fromOrder: 2, toOrder: 1 })).toBe('prev');
    expect(settleForm('prev', c1, { fromOrder: 1, toOrder: 3 })).toBe('next');
    expect(settleForm('next', c1, {})).toBe('next');
  });
});

describe('header and backdrop', () => {
  const c1 = loc('/work/reincarnation-machine');
  const lab = loc('/lab', '#lab1-5');
  const home = loc('/');
  const about = loc('/about');

  it('keeps the header still only between pages that share the same header', () => {
    expect(keepsHeader('swap', c1, lab)).toBe(true);
    expect(keepsHeader('morph', c1, lab)).toBe(true);
    expect(keepsHeader('next', c1, loc('/work/project-ii'))).toBe(true);
    // 日志页 / about 还是旧顶栏：与深色顶栏之间不钉，免得叠出两排字
    expect(keepsHeader('swap', lab, loc('/archive'))).toBe(false);
    expect(keepsHeader('swap', loc('/archive'), about)).toBe(true);
    expect(keepsHeader('morph', home, lab)).toBe(false);
    expect(keepsHeader('rise', home, lab)).toBe(false);
    expect(keepsHeader('sink', lab, home)).toBe(false);
  });

  it('puts the destination colour under a cross-fade', () => {
    expect(backdropFor('swap', lab)).toBe('night');
    expect(backdropFor('swap', about)).toBe('paper');
    expect(backdropFor('rise', lab)).toBe('shade');
  });
});

describe('plateVars', () => {
  it('maps a box onto the viewport with a translate and two scales', () => {
    const v = plateVars({ left: 120, top: 200, width: 400, height: 300 }, 1440, 900);
    expect(v).toEqual({ '--pt-x': '120px', '--pt-y': '200px', '--pt-sx': '3.6', '--pt-sy': '3' });
  });

  it('never divides by zero', () => {
    const v = plateVars({ left: 0, top: 0, width: 0, height: 0 }, 800, 600);
    expect(Number(v['--pt-sx'])).toBe(800);
    expect(Number(v['--pt-sy'])).toBe(600);
  });
});

describe('inView', () => {
  it('needs a real share of the box inside the viewport', () => {
    expect(inView({ left: 0, top: 0, width: 100, height: 100 }, 1000, 800)).toBe(true);
    expect(inView({ left: 0, top: 760, width: 100, height: 100 }, 1000, 800)).toBe(true); // 露出 40%
    expect(inView({ left: 0, top: 780, width: 100, height: 100 }, 1000, 800)).toBe(false); // 只露出下沿 20%
    expect(inView({ left: 0, top: 900, width: 100, height: 100 }, 1000, 800)).toBe(false);
    expect(inView({ left: 0, top: 0, width: 0, height: 0 }, 1000, 800)).toBe(false);
  });
});

describe('homeHashFor', () => {
  it('names the home page the reader is on', () => {
    expect(homeHashFor(0, undefined)).toBe('');
    expect(homeHashFor(1, undefined)).toBe('#work');
    expect(homeHashFor(2, undefined)).toBe('#about');
    expect(homeHashFor(3, 'lab')).toBe('#lab');
    expect(homeHashFor(3, 'log')).toBe('#log');
  });
});

describe('durations', () => {
  it('keeps structural moves in the site range and the frequent swap short', () => {
    for (const [form, ms] of Object.entries(PT_DURATION)) {
      if (form === 'swap') expect(ms).toBeLessThanOrEqual(520);
      else expect(ms).toBeGreaterThanOrEqual(760);
      expect(ms).toBeLessThanOrEqual(1100);
    }
  });
});
