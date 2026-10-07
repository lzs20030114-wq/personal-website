import { createServer } from 'vite';
const server = await createServer({ root: '/home/user/personal-website', configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { runCohabit } = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const [label, extra] of [['live 让位开', {}], ['live 让位关', { clearance: null }], ['live 目的关', { goal: false }], ['live 让位关+目的关', { clearance: null, goal: false }], ['live 8×8', { grid: 8 }]]) {
    const rs = []; for (let s = 1; s <= 8; s++) rs.push(runCohabit({ space: 'live', seed: 100 + s, seconds: 300, people: 3, cats: 1, ...extra }));
    console.log(label, '| 共温', mean(rs.map(r => r.ledger.counts.warmth)).toFixed(1), '共触', mean(rs.map(r => r.ledger.counts.touch)).toFixed(1), '交接', mean(rs.map(r => r.ledger.counts.pass)).toFixed(1), '| 猫换格', mean(rs.map(r => r.catTransfers)).toFixed(1), '远占比', (mean(rs.map(r => r.catFarShare)) * 100).toFixed(0) + '%', '绕行', mean(rs.map(r => r.detour)).toFixed(1), '终态成形', mean(rs.map(r => r.formed)).toFixed(1), 'R5', mean(rs.map(r => r.heldR5)).toFixed(2));
  }
} finally { await server.close(); }
