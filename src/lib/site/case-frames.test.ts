import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CASE_FRAMES, frameSrc, type FrameProject } from './case-frames';

/**
 * 案例页分镜（FrameStrip）的守门。最可能出的事故：重截之后换了尺寸没改数据、删了一张图没删引用、
 * 中英两侧引用的组不一样（content.test 只比插槽编号，不比组名）。
 */

const pub = (src: string) => join(process.cwd(), 'public', src);
const CJK = /[㐀-鿿　-〿＀-￯]/;

/** 正文里按出现顺序引用的组名 */
function setsIn(file: string): string[] {
  const body = readFileSync(join(process.cwd(), file), 'utf8');
  return [...body.matchAll(/<FrameStrip\b[^>]*?\bset="([^"]+)"/g)].map((m) => m[1]);
}
const PROJECTS: FrameProject[] = ['project-ii', 'reincarnation-machine'];

describe('案例页分镜', () => {
  for (const project of PROJECTS) {
    it(`${project}：中英两侧引用同样几组、顺序相同，每组都存在且属于这个项目，没有没人引用的组`, () => {
      const EN = setsIn(`content/work/${project}/index.mdx`);
      const ZH = setsIn(`content/work/${project}/index.zh.mdx`);
      expect(ZH).toEqual(EN);
      expect(EN.length).toBeGreaterThan(0);
      for (const s of EN) {
        expect(CASE_FRAMES[s], s).toBeDefined();
        expect(CASE_FRAMES[s].project, s).toBe(project);
      }
      expect(new Set(EN).size).toBe(EN.length);
      const mine = Object.entries(CASE_FRAMES).filter(([, s]) => s.project === project).map(([k]) => k);
      expect(mine.sort()).toEqual([...EN].sort());
    });
  }

  it('文字中英两份齐全，英文里不混中文', () => {
    for (const [name, s] of Object.entries(CASE_FRAMES)) {
      for (const bi of [s.caption, s.sub, ...s.frames.flatMap((f) => [f.t, f.note])]) {
        if (!bi) continue;
        expect(bi.en.trim(), name).not.toBe('');
        expect(bi.zh.trim(), name).not.toBe('');
        expect(CJK.test(bi.en), `${name}: ${bi.en}`).toBe(false);
      }
      expect(s.frames.length, name).toBeGreaterThan(0);
      expect(new Set(s.frames.map((f) => f.file)).size, name).toBe(s.frames.length);
    }
  });

  it('每张原图与缩略图都在，尺寸与数据一致', async () => {
    for (const [name, s] of Object.entries(CASE_FRAMES)) {
      for (const f of s.frames) {
        const full = pub(frameSrc(name, f.file));
        const thumb = pub(frameSrc(name, f.file, true));
        expect(existsSync(full), full).toBe(true);
        expect(existsSync(thumb), thumb).toBe(true);
        const a = await sharp(full).metadata();
        expect([a.width, a.height], full).toEqual([s.w, s.h]);
        const t = await sharp(thumb).metadata();
        expect(t.width, thumb).toBe(s.tw);
        expect(Math.abs((t.height ?? 0) - (s.tw * s.h) / s.w), thumb).toBeLessThanOrEqual(1);
      }
    }
  });
});
