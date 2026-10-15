import { describe, expect, it } from 'vitest';
import { VisitClient, visitPath, visitReferrerOrigin, type VisitPayload } from './client';

function harness() {
  const visits: VisitPayload[] = [];
  let visible = true;
  let optedOut = false;
  let sequence = 0;
  const client = new VisitClient({
    referrer: 'https://search.example/results?private=secret#section',
    visible: () => visible,
    optedOut: () => optedOut,
    createId: () => `visit-${++sequence}`,
    send: (visit) => { visits.push(visit); },
  });
  return {
    client,
    visits,
    setVisible: (value: boolean) => { visible = value; },
    setOptedOut: (value: boolean) => { optedOut = value; },
  };
}

describe('visitor collection boundaries', () => {
  it('keeps one event per committed path, with fresh IDs on back navigation and refresh', () => {
    const { client, visits } = harness();
    client.visit('/');
    client.visit('/'); // React StrictMode repeats the effect.
    client.visit('/#work');
    client.visit('/lab?private=value#2-1');
    client.visit('/'); // Back navigation must count again.
    expect(visits).toEqual([
      { id: 'visit-1', path: '/', referrer: 'https://search.example' },
      { id: 'visit-2', path: '/lab', referrer: null },
      { id: 'visit-3', path: '/', referrer: null },
    ]);
    const refreshed = harness();
    refreshed.client.visit('/');
    expect(refreshed.visits).toHaveLength(1);
  });

  it('records only the current page when hidden prerendering becomes visible', () => {
    const state = harness();
    state.setVisible(false);
    state.client.visit('/');
    state.client.visit('/about');
    state.client.activate();
    expect(state.visits).toEqual([]);
    state.setVisible(true);
    state.client.activate();
    state.client.activate();
    expect(state.visits.map((visit) => visit.path)).toEqual(['/about']);
  });

  it('does not treat leaving and returning to a browser tab as another visit', () => {
    const state = harness();
    state.client.visit('/');
    state.setVisible(false);
    state.client.activate();
    state.setVisible(true);
    state.client.activate();
    expect(state.visits).toHaveLength(1);
    state.client.restore('/');
    expect(state.visits).toHaveLength(2);
  });

  it('honors privacy opt-outs both on navigation and before pending delivery', () => {
    const state = harness();
    state.setOptedOut(true);
    state.client.visit('/');
    state.setOptedOut(false);
    state.setVisible(false);
    state.client.visit('/about');
    state.setOptedOut(true);
    state.setVisible(true);
    state.client.activate();
    expect(state.visits).toEqual([]);
  });

  it('omits backend pages and resources, including them as navigation referrers', () => {
    const { client, visits } = harness();
    for (const path of ['/studio', '/studio/visitors', '/api/visits', '/_next/static/x.js', '/privacy', '/robots.txt']) {
      client.visit(path);
    }
    client.visit('/');
    expect(visits).toEqual([{ id: 'visit-1', path: '/', referrer: null }]);
    expect(visitPath('https://example.com/')).toBeNull();
    expect(visitPath('//example.com/')).toBeNull();
    expect(visitPath('/\\example.com/')).toBeNull();
  });

  it('covers all five static demo entries while excluding static assets', () => {
    for (const path of ['/demo/', '/demo/index.html', '/demo/arch.html', '/demo/tentacle.html', '/demo/tentacle3d.html', '/demo/shell3d.html']) {
      expect(visitPath(path)).toBe(path);
    }
    expect(visitPath('/demo/assets/index.js')).toBeNull();
    expect(visitPath('/demo/unlisted.html')).toBeNull();
  });

  it('never exposes referrer search, fragments, credentials or non-web URL schemes', () => {
    expect(visitReferrerOrigin('https://user:secret@search.example/private?q=secret#token')).toBe('https://search.example');
    for (const referrer of ['', 'invalid', 'javascript:alert(1)', 'file:///local/private']) {
      expect(visitReferrerOrigin(referrer)).toBeNull();
    }
  });

  it('silences synchronous and asynchronous transport failures without a retry storm', async () => {
    for (const send of [() => { throw new Error('blocked'); }, () => Promise.reject(new Error('offline'))]) {
      let calls = 0;
      const client = new VisitClient({
        referrer: '', visible: () => true, optedOut: () => false, createId: () => 'id',
        send: () => { calls++; return send(); },
      });
      expect(() => client.visit('/')).not.toThrow();
      client.visit('/');
      client.activate();
      await Promise.resolve();
      expect(calls).toBe(1);
    }
  });
});
