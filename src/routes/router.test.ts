/** v0.17.0 (NV-5): sub-menu addresses, and earlier addresses that still open. */
import { hrefFor, LEGACY, parseRoute, type Route } from './router';

const round = (r: Route) => expect(parseRoute(hrefFor(r))).toEqual(r);

describe('addresses under their workspace (NV-5)', () => {
  it('round-trips every Strategy entry, stage and tab', () => {
    round({ kind: 'strategy', entry: 'forming' });
    round({ kind: 'strategy', entry: 'forming', stage: 'composition' });
    round({ kind: 'strategy', entry: 'forming', stage: 'conception', tab: 'vision' });
    round({ kind: 'strategy', entry: 'registers', tab: 'compliance' });
    round({ kind: 'strategy', entry: 'plan-document' });
    round({ kind: 'strategy', entry: 'communication', goalId: 'g2' });
    round({ kind: 'org', tab: 'people' });
    round({ kind: 'org', tab: 'vacancies' });
    expect(hrefFor({ kind: 'strategy', entry: 'forming', stage: 'overview', tab: 'calendar' })).toBe('#/strategy/forming/overview/calendar');
    expect(hrefFor({ kind: 'planDocument' })).toBe('#/strategy/plan-document/print');
  });
  it('opens the earlier addresses at their new places', () => {
    expect(parseRoute('#/communication/g1')).toEqual({ kind: 'strategy', entry: 'communication', goalId: 'g1' });
    expect(parseRoute('#/communication')).toEqual({ kind: 'strategy', entry: 'communication', goalId: undefined });
    expect(parseRoute('#/plan-document')).toEqual({ kind: 'planDocument' });
    expect(LEGACY.test('#/communication/g1')).toBe(true);
    expect(LEGACY.test('#/strategy/communication')).toBe(false);
    // Board papers keep their own address.
    expect(hrefFor({ kind: 'boardPaper', goalId: 'g1' })).toBe('#/board-paper/g1');
  });
  it('treats an unknown stage as the entry itself', () => {
    expect(parseRoute('#/strategy/forming/nowhere')).toEqual({ kind: 'strategy', entry: 'forming', stage: undefined, tab: undefined });
  });
});
