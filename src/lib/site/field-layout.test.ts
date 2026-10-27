import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, FIELD_COLS, FIELD_ROWS, FIELD_TEXT, HALO_MIN, cardOrigin, cellAt, fieldSlots, initialPlacement } from './field-layout';

const N = FIELD_COLS * FIELD_ROWS;
const rowOf = (cell: number) => Math.floor(cell / FIELD_COLS);
const colOf = (cell: number) => cell % FIELD_COLS;

describe('首屏格子版式', () => {
  it('标语拼回来是那一句，objects / spaces 每个字母占 2×2', () => {
    const { letters, keys } = FIELD_TEXT;
    const words = (w: 'objects' | 'spaces') => keys.filter((k) => k.word === w).map((k) => k.ch).join('');
    expect(words('objects')).toBe('OBJECTS');
    expect(words('spaces')).toBe('SPACES');
    const order = [...letters, ...keys].sort((a, b) => a.n - b.n).map((x) => x.ch).join('');
    expect(order).toBe('IEXPLOREHOWPEOPLERELATETOOBJECTSANDSPACESTHATRESPONDTOTHEM.');
  });
  it('所有字、框、按钮都在格子里，彼此不重叠', () => {
    const seen = new Map<number, string>();
    const put = (c: number, r: number, who: string) => {
      expect(c >= 0 && c < FIELD_COLS && r >= 0 && r < FIELD_ROWS, `${who} 越界`).toBe(true);
      const k = cellAt(c, r);
      expect(seen.has(k), `${who} 与 ${seen.get(k)} 重叠`).toBe(false);
      seen.set(k, who);
    };
    const { letters, keys, name, nav, work, lab, hint } = FIELD_TEXT;
    letters.forEach((L) => put(L.c, L.r, L.ch));
    keys.forEach((K) => [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dc, dr]) => put(K.c + dc, K.r + dr, K.ch)));
    for (const [b, who] of [[name, 'name'], ...nav.map((n) => [n, n.label] as const), [work, 'work'], [lab, 'lab'], [hint, 'hint']] as const)
      for (let c = b.c0; c <= b.c1; c++) put(c, b.r, who);
    // reserved 还含标语里的空格；字自己占的格一个不少
    for (const k of seen.keys()) expect(FIELD_TEXT.reserved.has(k)).toBe(true);
  });
  it('导航按页序排在第一行右端，名字在左端', () => {
    const { nav, name } = FIELD_TEXT;
    expect(nav.map((n) => n.page)).toEqual([1, 2, 3, 4]);
    expect(nav.every((n) => n.r === 0)).toBe(true);
    expect(nav[nav.length - 1].c1).toBe(FIELD_COLS - 1);
    expect(name).toMatchObject({ r: 0, c0: 0 });
  });
  it('标语左右大致对称（每行左右空出的格数相差不超过 1）', () => {
    const rows = new Map<number, number[]>();
    for (const k of FIELD_TEXT.textCells) {
      const r = rowOf(k);
      rows.set(r, [...(rows.get(r) ?? []), colOf(k)]);
    }
    for (const cols of rows.values()) {
      const l = Math.min(...cols);
      const r = FIELD_COLS - 1 - Math.max(...cols);
      expect(Math.abs(l - r)).toBeLessThanOrEqual(1);
    }
  });
});

describe('作品格', () => {
  const free = N - FIELD_TEXT.reserved.size;
  it('作品少于空位时一件一格；作品再多也至少空出 HALO_MIN 格', () => {
    expect(fieldSlots(40).slots.length).toBe(40);
    const many = fieldSlots(999);
    expect(many.slots.length).toBe(free - HALO_MIN);
    expect(many.empty.length).toBe(HALO_MIN);
  });
  it('作品格与空格互不重叠、合起来正好是全部空位，且不压字', () => {
    const { slots, empty } = fieldSlots(200);
    const all = new Set([...slots, ...empty]);
    expect(all.size).toBe(slots.length + empty.length);
    expect(all.size).toBe(free);
    for (const c of all) expect(FIELD_TEXT.reserved.has(c)).toBe(false);
  });
  it('留空的格子多半贴着字（空格离字的平均距离比作品格近）', () => {
    const { slots, empty } = fieldSlots(200);
    const text = FIELD_TEXT.textCells;
    const near = (cell: number) => Math.min(...text.map((t) => Math.hypot(colOf(cell) - colOf(t), rowOf(cell) - rowOf(t))));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(empty.map(near))).toBeLessThan(mean(slots.map(near)));
  });
  it('同一份输入得到同一张版面（服务端与浏览器一致）', () => {
    expect(fieldSlots(180)).toEqual(fieldSlots(180));
    expect(initialPlacement(['log', 'project', 'lab'], 2)).toEqual(initialPlacement(['log', 'project', 'lab'], 2));
  });
});

describe('展开卡位置', () => {
  it('卡总盖住被悬停的那一格，且不出格子', () => {
    for (const cell of fieldSlots(999).slots) {
      const { c0, r0 } = cardOrigin(cell);
      const c = colOf(cell);
      const r = rowOf(cell);
      expect(c >= c0 && c < c0 + CARD_W && r >= r0 && r < r0 + CARD_H).toBe(true);
      expect(c0 >= 0 && r0 >= 0 && c0 + CARD_W <= FIELD_COLS && r0 + CARD_H <= FIELD_ROWS).toBe(true);
    }
  });
  it('能不压字就不压字', () => {
    // 右下角那片作品格四周都是作品，卡完全避开字
    const { c0, r0 } = cardOrigin(cellAt(26, 13));
    for (let y = r0; y < r0 + CARD_H; y++) for (let x = c0; x < c0 + CARD_W; x++) expect(FIELD_TEXT.reserved.has(cellAt(x, y))).toBe(false);
  });
});

describe('初次落位', () => {
  it('项目、台架、其他作品先上，日志按原顺序排在后面；格子不够时多出来的进轮换队列', () => {
    const kinds = ['log', 'log', 'project', 'lab', 'log', 'other', 'about'];
    const { shown, queue } = initialPlacement(kinds, 5);
    expect(shown).toHaveLength(5);
    expect(new Set(shown)).toEqual(new Set([2, 3, 5, 6, 0]));
    expect(queue).toEqual([1, 4]);
  });
  it('格子够时全部上场，队列为空', () => {
    const { shown, queue } = initialPlacement(['log', 'project'], 10);
    expect(shown.sort()).toEqual([0, 1]);
    expect(queue).toEqual([]);
  });
});
