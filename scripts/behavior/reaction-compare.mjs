// 大触手反应的「对比量」表：读 reaction-probe.mjs 的输出（一版或两版），按感知研究里观众真正用来分辨
// 的几样东西算倍数（轮回机器_触手与转向研究.md §8.6）。
//
//   node scripts/behavior/reaction-compare.mjs <A 版前缀> [<B 版前缀>] [--labels 现状,提案]
//
// 为什么不用分类器准确率：留一 1-近邻拿的是精确数值（呼吸中心偏 0.1、方向朝下……），人眼分不出的差别它也
// 分得出——现状下按「惊跳 / 回应 / 自发」三大类就有 83–100%，与「区别不明显」的观感对不上。这里改看对比：
//   起动   惊跳多早看得出动了（梢端偏离 5 mm 的时刻）、回应 / 惊跳的起动比
//   快慢   惊跳峰速 ÷ 刻意动作（回应）峰速；峰加速度同理——「突然」是激动程度最强的线索
//   大小   惊跳峰值 ÷ 回应峰值；回应 ÷ 自发（自发动作不该比对人的回应大）；回应 ÷ 静息漂移（要跳出本底）
// 回应 = 抚摸 / 轻拍 / 碰触须里实际打成回应的那些（被打成惊跳的归惊跳）；自发 = 卷臂 + 扫臂。
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const li = args.indexOf('--labels');
const labels = li >= 0 ? args.splice(li, 2)[1].split(',') : ['现状', '提案'];
const load = (prefix) => {
  const files = existsSync(`${prefix}.json`) ? [`${prefix}.json`] : ['A', 'B', 'C', 'D'].map((p) => `${prefix}-${p}.json`).filter(existsSync);
  const summary = {};
  for (const f of files) Object.assign(summary, JSON.parse(readFileSync(f, 'utf8')).summary);
  return summary;
};
const versions = args.map(load);
const med = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');

const RESP = ['respond', 'pat', 'feeler', 'knock', 'sound', 'approach'];
const SPONT = ['curl', 'sway'];
const rows = [];
for (const P of ['A', 'B', 'C', 'D']) {
  versions.forEach((S, v) => {
    if (!S[P]) return;
    const all = (keys) => keys.flatMap((k) => S[P][k] ?? []);
    const st = [...all(['startle']), ...all(RESP).filter((m) => m.startled)];
    const rs = all(RESP).filter((m) => !m.startled);
    const sp = all(SPONT);
    const bg = med((S[P].rest ?? []).map((m) => m.bg));
    const g = (xs, k) => med(xs.map((m) => m[k]));
    rows.push({
      P,
      v: labels[v],
      stOn5: g(st, 'on5'),
      stOn: g(st, 'onset'),
      stV: g(st, 'vPeak'),
      stA: g(st, 'aPeak'),
      stPk: g(st, 'peak'),
      rsOn: g(rs, 'onset'),
      rsV: g(rs, 'vPeak'),
      rsA: g(rs, 'aPeak'),
      rsPk: g(rs, 'peak'),
      spPk: g(sp, 'peak'),
      spV: g(sp, 'vPeak'),
      bg,
      nRs: rs.length,
    });
  });
}
console.log('| 人格 | 版本 | 惊跳起动（5 mm）s | 惊跳峰速 mm/s | 惊跳峰值 mm | 回应峰速 | 回应峰值 | 自发峰值 | 静息漂移 | 峰速比 惊/回 | 峰加速比 惊/回 | 峰值比 惊/回 | 回应/自发 | 回应/静息 | 起动比 回/惊 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.P} | ${r.v} | ${f(r.stOn5, 2)} | ${f(r.stV)} | ${f(r.stPk)} | ${f(r.rsV)} | ${f(r.rsPk)} | ${f(r.spPk)} | ${f(r.bg)} | ${f(r.stV / r.rsV, 1)}× | ${f(r.stA / r.rsA, 1)}× | ${f(r.stPk / r.rsPk, 1)}× | ${f(r.rsPk / r.spPk, 1)}× | ${f(r.rsPk / r.bg, 0)}× | ${f(r.rsOn / r.stOn, 1)}× |`,
  );
}
