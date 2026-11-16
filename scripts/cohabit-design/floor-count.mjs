// 2-15 那间房 64 台各压着什么家具、最低能落多低（cohabit-design floorFor）
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const D = await server.ssrLoadModule('/src/lib/space/cohabit-design.ts');
const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 11, opening: false, auto: true, faces: true, social: true, catFloor: true });
const fl = sim.layout.units.map((u) => D.floorFor(sim.layout, u, sim.furn.rects));
const by = {}; for (const f of fl) { const k = f.toFixed(3); by[k] = (by[k] ?? 0) + 1; }
console.log('台数', fl.length, JSON.stringify(by));
const rows = []; for (let r = 0; r < 8; r++) rows.push(fl.slice(r * 8, r * 8 + 8).map((f) => (f > 0.43 ? f.toFixed(2) : ' .  ')).join(' '));
console.log(rows.join('\n'));
await server.close();
