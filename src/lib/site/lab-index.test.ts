import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LAB_BENCHES, LAB_INDEX, labAnchor, labBench } from "./lab-index";

/**
 * /lab 目录守门：目录是页面的唯一台架清单，页面里每台的 `no=` 都必须登记在此，
 * 此处每条都必须在页面里——少一台目录就少一行、多一台就出一条跳到空处的链接。
 */
describe("lab-index", () => {
  it("编号唯一、按「项目-序号」格式、页序连续", () => {
    const nos = LAB_BENCHES.map((b) => b.no);
    expect(new Set(nos).size).toBe(nos.length);
    for (const no of nos) expect(no).toMatch(/^[12]-\d{1,2}$/);
    const byProject = { 1: [] as number[], 2: [] as number[] };
    for (const no of nos) {
      const [p, i] = no.split("-").map(Number);
      byProject[p as 1 | 2].push(i);
    }
    for (const list of Object.values(byProject)) {
      expect(list).toEqual(list.map((_, k) => k + 1));
    }
  });

  it("项目一没有段头（唯一一段 n 为空），项目二每段都有段头且不为空", () => {
    const [p1, p2] = LAB_INDEX;
    expect(p1.segments).toHaveLength(1);
    expect(p1.segments[0].n).toBe("");
    for (const s of p2.segments) {
      expect(s.n).not.toBe("");
      expect(s.label).not.toBe("");
      expect(s.benches.length).toBeGreaterThan(0);
    }
  });

  it("与 /lab 页面上的台架逐一对应（页面 no= ↔ 目录），锚点同一套", () => {
    const src = readFileSync(
      new URL("../../../app/(site)/lab/page.tsx", import.meta.url),
      "utf8",
    );
    const inPage = Array.from(
      src.matchAll(/\bno="([12]-\d{1,2})"/g),
      (m) => m[1],
    );
    expect(inPage.length).toBeGreaterThan(0);
    expect(inPage).toEqual(LAB_BENCHES.map((b) => b.no));
    expect(labAnchor("2-5")).toBe("lab2-5");
    expect(() => labBench("9-9")).toThrow();
    expect(labBench("1-1").title).toBe("Four-bar linkage");
  });
});
