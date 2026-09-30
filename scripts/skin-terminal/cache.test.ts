import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materializeSkinTerminal } from './cache.mjs';
import { restoreSkinTerminal, skinTerminalAssetKey, skinTerminalSignature } from '../../src/lib/space/skin-terminal-format';

const fixtures: string[] = [];
const json = JSON.stringify({ px: [1.2345678901234567, 2], py: [3, 4], locked: [[0, 1, 2]], step: 1500, r: 0.1 });
const validate = (value: unknown) => restoreSkinTerminal(value, 2, 1500);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'skin-terminal-cache-'));
  fixtures.push(root);
  const cachePath = join(root, '.next/cache/skin-terminal/key.json');
  const outputPath = join(root, 'public/skin-terminal/key.json');
  return { root, cachePath, outputPath, validate, generate: vi.fn(() => json) };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    const actual = realpathSync(root);
    const parent = realpathSync(tmpdir());
    if (!actual.startsWith(`${parent}${sep}skin-terminal-cache-`)) throw new Error('Unexpected fixture path');
    rmSync(actual, { recursive: true });
  }
});

describe('skin terminal build cache', () => {
  it('冷构建生成一次；下次只有构建缓存时恢复原始字节，不再求解', () => {
    const f = fixture();
    expect(materializeSkinTerminal(f).source).toBe('generated');
    const nextOutput = join(f.root, 'next-checkout/public/skin-terminal/key.json');
    expect(materializeSkinTerminal({ ...f, outputPath: nextOutput }).source).toBe('cache');
    expect(f.generate).toHaveBeenCalledTimes(1);
    expect(readFileSync(nextOutput, 'utf8')).toBe(json);
    expect(readFileSync(f.cachePath, 'utf8')).toBe(json);
  });

  it('升级时用有效本地文件补齐缓存，不重新求解', () => {
    const f = fixture();
    materializeSkinTerminal(f);
    const newCache = join(f.root, 'new-cache/key.json');
    f.generate.mockClear();
    expect(materializeSkinTerminal({ ...f, cachePath: newCache }).source).toBe('local');
    expect(readFileSync(newCache, 'utf8')).toBe(json);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it('引擎版本或物理参数变化后不能复用旧键，未变化的输入仍命中', async () => {
    const f = fixture();
    const input = { spec: [['f', 2, []]] as const, opts: { warp: 1 } };
    // 与生成器相同的版本 + 输入文件键，三种输入分别创建独立缓存文件。
    const keys = await Promise.all([
      skinTerminalAssetKey('v1', skinTerminalSignature(input)),
      skinTerminalAssetKey('v2', skinTerminalSignature(input)),
      skinTerminalAssetKey('v1', skinTerminalSignature({ ...input, opts: { warp: 2 } })),
    ]);
    for (const key of keys) {
      expect(materializeSkinTerminal({ ...f,
        outputPath: join(f.root, 'public', `${key}.json`),
        cachePath: join(f.root, 'cache', `${key}.json`),
      }).source).toBe('generated');
    }
    expect(materializeSkinTerminal({ ...f,
      outputPath: join(f.root, 'next-public', `${keys[0]}.json`),
      cachePath: join(f.root, 'cache', `${keys[0]}.json`),
    }).source).toBe('cache');
    expect(f.generate).toHaveBeenCalledTimes(3);
  });

  it.each(['{truncated', JSON.stringify({ px: [null] })])('损坏的缓存被重新求解替换：%s', (bad) => {
    const f = fixture();
    materializeSkinTerminal(f);
    writeFileSync(f.cachePath, bad);
    const nextOutput = join(f.root, 'next-public/key.json');
    expect(materializeSkinTerminal({ ...f, outputPath: nextOutput }).source).toBe('generated');
    expect(f.generate).toHaveBeenCalledTimes(2);
    expect(readFileSync(f.cachePath, 'utf8')).toBe(json);
    expect(readFileSync(nextOutput, 'utf8')).toBe(json);
  });

  it('损坏的交付文件可从有效缓存恢复，坏的求解结果仍然阻止生成', () => {
    const f = fixture();
    materializeSkinTerminal(f);
    writeFileSync(f.outputPath, '{}');
    expect(materializeSkinTerminal(f).source).toBe('cache');
    expect(f.generate).toHaveBeenCalledTimes(1);
    const fresh = fixture();
    expect(() => materializeSkinTerminal({ ...fresh, generate: () => '{}' })).toThrow('Invalid precomputed');
    expect(existsSync(fresh.outputPath)).toBe(false);
    expect(existsSync(fresh.cachePath)).toBe(false);
  });

  it('--check 严格只读，缓存不能掩盖缺失或损坏的交付文件', () => {
    const f = fixture();
    materializeSkinTerminal(f);
    f.generate.mockClear();
    const missing = resolve(f.root, 'missing/key.json');
    expect(() => materializeSkinTerminal({ ...f, outputPath: missing, check: true })).toThrow('Missing or invalid');
    expect(existsSync(missing)).toBe(false);
    writeFileSync(f.outputPath, '{}');
    expect(() => materializeSkinTerminal({ ...f, check: true })).toThrow('Missing or invalid');
    expect(readFileSync(f.outputPath, 'utf8')).toBe('{}');
    expect(f.generate).not.toHaveBeenCalled();
    expect(readFileSync(f.cachePath, 'utf8')).toBe(json);
    writeFileSync(f.outputPath, json);
    const absentCache = join(f.root, 'absent-cache/key.json');
    expect(materializeSkinTerminal({ ...f, cachePath: absentCache, check: true }).source).toBe('local');
    expect(existsSync(absentCache)).toBe(false);
  });
});
