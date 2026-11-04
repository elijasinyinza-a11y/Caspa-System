/** v0.18.0 (BUILD-BRIEF section 39, OP-6, OP-10, OP-11): who verifies, and what "Needs you" asks for. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { verifierPosition } from '../../rules/progress';
import { createSeed } from '../sample/seed';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const ORG = 'org-sample-water';
const repoFor = (s: Store, m: string, device = createDevice()) => createMemoryRepository([s], ORG, m, NOW, { device });
const keys = (s: Store, m: string) => repoFor(s, m).home().needsYou.map((i) => i.key).filter((k) => k.startsWith('progress:'));

describe('Needs you for progress (OP-10)', () => {
  it('asks the Meter Reader for September readings only: meters already have the OP-11 update', () => {
    const s = createSeed();
    expect(keys(s, 'm-mrb')).toEqual(['progress:report:co-b-2:2026-09-30']);
    const item = repoFor(s, 'm-mrb').home().needsYou.find((i) => i.key.startsWith('progress:'))!;
    expect(item.title).toBe('Report progress for September');
    expect(item.due).toBeNull(); // undated items never nag
    expect(item.link).toEqual({ kind: 'progress', tab: 'mine', objectiveId: 'co-b-2' });
  });
  it('asks the Commercial Officer to verify the one update waiting, and nobody else', () => {
    const s = createSeed();
    expect(keys(s, 'm-co')).toEqual(['progress:verify']);
    expect(repoFor(s, 'm-co').home().needsYou.find((i) => i.key === 'progress:verify')!.title).toBe('Verify 1 progress update');
    for (const m of ['m-md', 'm-spm', 'm-hof', 'm-hrm']) expect(keys(s, m)).toEqual([]);
  });
  it('counts an update waiting on the device as reported, so the reminder goes', () => {
    const s = createSeed();
    const device = createDevice();
    const mary = repoFor(s, 'm-mrb', device);
    mary.progress.setOffline(true);
    expect(mary.progress.save({ contractObjectiveId: 'co-b-2', periodEnd: '2026-09-30', quantity: '2300', note: '', evidence: '' }).ok).toBe(true);
    expect(repoFor(s, 'm-mrb', device).home().needsYou.filter((i) => i.key.startsWith('progress:'))).toEqual([]);
  });
  it('turns a return into "Send a corrected figure", and verifying clears the supervisor item', () => {
    const s = createSeed();
    const esther = repoFor(s, 'm-co');
    expect(esther.progress.returnUpdate('pu-co-b-1-2026-09', 'Job cards show 250.')).toEqual({ ok: true, queued: false });
    expect(keys(s, 'm-mrb')).toContain('progress:correct:pu-co-b-1-2026-09');
    expect(keys(s, 'm-co')).toEqual([]);
  });
});

describe('who verifies (OP-6)', () => {
  it('is the Commercial Officer for Zone B, and the next position up when that one is vacant', () => {
    const s = createSeed();
    const c = s.contracts.find((x) => x.id === 'pc-mrb-2026')!;
    const co = s.positions.find((p) => p.title === 'Commercial Officer')!;
    expect(verifierPosition(s, c, NOW)).toBe(co.id);
    for (const a of s.assignments.filter((x) => x.positionId === co.id)) a.to = '2026-09-01' as ISODate;
    expect(verifierPosition(s, c, NOW)).toBe(co.reportsToPositionId);
    expect(keys(s, 'm-co')).toEqual([]);
  });
});
