import { describe, expect, it } from 'vitest';
import { LOG_SCHEMA, formatRecord, parseJsonl, sessionHeader, toJsonl, type LogRecord } from './log';

const rec = (over: Partial<LogRecord> = {}): LogRecord => ({
  id: 3,
  t: 70.18333333333334,
  life: 1,
  persona: 'A',
  phase: 'GROW',
  src: 'engine',
  ev: 'RESPONSE',
  p: { to: 2, latency: 0.18333333333333, gain: -0.0000001, arm: true, turn: 'toward' },
  ...over,
});

describe('事件日志（JSON Lines）', () => {
  it('键顺序固定、数值只在序列化时取整（t 三位、载荷四位），不出 -0', () => {
    expect(formatRecord(rec())).toBe(
      '{"id":3,"t":70.183,"life":1,"persona":"A","phase":"GROW","src":"engine","ev":"RESPONSE","p":{"to":2,"latency":0.1833,"gain":0,"arm":true,"turn":"toward"}}',
    );
    const sensor = rec({ src: 'sensor', ev: 'KNOCK', I: 0.9, out: 'startle', p: { intensity: 0.9 } });
    expect(formatRecord(sensor)).toBe(
      '{"id":3,"t":70.183,"life":1,"persona":"A","phase":"GROW","src":"sensor","ev":"KNOCK","I":0.9,"out":"startle","p":{"intensity":0.9}}',
    );
  });

  it('首行会话头 + 每行一条，读回来逐条对得上', () => {
    const header = sessionHeader(11, ['B', 'A', 'D', 'C'], 60);
    const text = toJsonl([rec(), rec({ id: 4, ev: 'LIFE_DEATH', p: undefined })], header);
    expect(text.split('\n')[0]).toBe(JSON.stringify(header));
    const back = parseJsonl(text);
    expect(back.header).toEqual({ schema: LOG_SCHEMA, v: 1, seed: 11, order: ['B', 'A', 'D', 'C'], hz: 60 });
    expect(back.records.map((r) => formatRecord(r))).toEqual([formatRecord(rec()), formatRecord(rec({ id: 4, ev: 'LIFE_DEATH', p: undefined }))]);
  });

  it('不是行为日志的行直接报错', () => {
    expect(() => parseJsonl('{"hello":1}\n')).toThrow();
  });
});
