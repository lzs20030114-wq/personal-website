import { describe, expect, it } from 'vitest';
import { figureBox, figureVerts, type FigureSpec } from './figure';

/**
 * 守门：人体比例参考。它唯一的职责是**报出正确的身量**——尺度错了，整幅画面的
 * 比例读数就全错，而这种错不会报错、只会看着「差不多」。
 */
const BASE: FigureSpec = { x: 0, z: 0, footY: 473, height: 215 };

describe('figure 比例小人', () => {
  it('身高精确 = 给定值，脚底恰好站在地面上', () => {
    for (const h of [120, 215, 400]) {
      const b = figureBox({ ...BASE, height: h });
      expect(b.y1).toBeCloseTo(BASE.footY, 6); // 世界 Y 向下为正 ⇒ 脚是最大 y
      expect(b.y0).toBeCloseTo(BASE.footY - h, 6); // 头顶
      expect(b.y1 - b.y0).toBeCloseTo(h, 6);
    }
  });

  it('横向身量在人的范围里（不是一块板，也不是个方块）', () => {
    const b = figureBox(BASE);
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    // 张开手臂的总宽约 0.30–0.40 身高；迈步的前后总深约 0.20–0.35 身高
    expect(w / BASE.height).toBeGreaterThan(0.3);
    expect(w / BASE.height).toBeLessThan(0.4);
    expect(d / BASE.height).toBeGreaterThan(0.2);
    expect(d / BASE.height).toBeLessThan(0.35);
    // 两个方向都有实厚度 ⇒ 任何视角看都是人形，不是贴片
    expect(Math.min(w, d) / BASE.height).toBeGreaterThan(0.15);
  });

  it('站位与朝向：平移到位、转向只转不缩', () => {
    const moved = figureBox({ ...BASE, x: 300, z: -120 });
    const at0 = figureBox(BASE);
    expect(moved.x0 - at0.x0).toBeCloseTo(300, 4);
    expect(moved.z0 - at0.z0).toBeCloseTo(-120, 4);
    // 转 90°：宽深互换，身高不动
    const turned = figureBox({ ...BASE, yaw: Math.PI / 2 });
    expect(turned.x1 - turned.x0).toBeCloseTo(at0.z1 - at0.z0, 3);
    expect(turned.z1 - turned.z0).toBeCloseTo(at0.x1 - at0.x0, 3);
    expect(turned.y1 - turned.y0).toBeCloseTo(BASE.height, 6);
  });

  it('是闭合的三角网格：顶点数 = 块数×8，索引三三成组且不越界', () => {
    const { verts, idx } = figureVerts(BASE);
    expect(verts.length % 24).toBe(0); // 每块 8 顶点 × 3 分量
    expect(idx.length % 3).toBe(0);
    expect(idx.length / 36).toBe(verts.length / 24); // 每块 12 三角
    for (const i of idx) expect(i).toBeLessThan(verts.length / 3);
  });
});
