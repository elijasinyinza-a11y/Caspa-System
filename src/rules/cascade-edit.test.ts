/** Slice 6 rules: next activity code, corrective options, new-activity and level-change checks (BUILD-BRIEF section 22). */
import type { Deficiency } from '../contract/caspa-data-contract';
import { createNgo } from '../data/sample/ngo';
import { createSeed } from '../data/sample/seed';
import { correctiveOptions, levelChangeError, newActivityError, nextActivityCode, type NewActivityDraft } from './cascade-edit';
import { SIX_P_LEVELS } from './structure';

const def5 = (s: ReturnType<typeof createSeed>) => s.deficiencies.find((d) => d.id === 'def-5')! as Deficiency;

describe('6P order', () => {
  it('follows the book, Principle to Practices', () => {
    expect(SIX_P_LEVELS).toEqual(['principle', 'process', 'people', 'policy', 'procedures', 'practices']);
  });
});

describe('next activity code', () => {
  it('takes the lowest unused number under the KPI', () => {
    const s = createSeed();
    expect(nextActivityCode(s, 'k1.2.1')).toBe('A1.2.1.5');
    expect(nextActivityCode(s, 'k1.1.1')).toBe('A1.1.1.2');
  });
  it('fills a gap left by a missing number', () => {
    const s = createSeed();
    s.activities = s.activities.filter((a) => a.code !== 'A1.2.1.2');
    expect(nextActivityCode(s, 'k1.2.1')).toBe('A1.2.1.2');
  });
  it('uses the organisation’s own activity prefix, including under a KPI with none yet', () => {
    const { store } = createNgo();
    const k = store.kpis.find((x) => x.code === 'IN1.1.1')!;
    expect(nextActivityCode(store, k.id)).toBe('IV1.1.1.3');
    store.activities = store.activities.filter((a) => a.kpiId !== k.id);
    expect(nextActivityCode(store, k.id)).toBe('IV1.1.1.1');
  });
});

describe('corrective options', () => {
  it('lists the objective’s activities, those at the deficiency’s level first, then by code', () => {
    const s = createSeed();
    expect(correctiveOptions(s, def5(s), 2026).map((a) => a.code)).toEqual(['A1.2.1.1', 'A1.2.1.2', 'A1.2.1.3', 'A1.2.1.4']);
    const def1 = s.deficiencies.find((d) => d.id === 'def-1')!; // Process, already corrected by A1.2.1.3
    expect(correctiveOptions(s, def1, 2026).map((a) => a.code)).toEqual(['A1.2.1.1', 'A1.2.1.2', 'A1.2.1.4']);
  });
  it('never offers activities of another objective or archived ones', () => {
    const s = createSeed();
    s.activities.find((a) => a.code === 'A1.2.1.1')!.status = 'archived';
    const codes = correctiveOptions(s, def5(s), 2026).map((a) => a.code);
    expect(codes).not.toContain('A1.2.1.1');
    expect(codes).not.toContain('A1.1.1.1');
  });
});

describe('new corrective activity', () => {
  const ok = (s: ReturnType<typeof createSeed>): NewActivityDraft => ({
    kpiId: 'k1.2.1', title: 'Train meter readers to spot tampering', level: 'people',
    ownerPositionId: s.positions.find((p) => p.title === 'Commercial Manager')!.id, evidence: 'Attendance registers', frequency: 'monthly', quantity: null,
  });
  it('accepts a complete draft', () => {
    const s = createSeed();
    expect(newActivityError(s, def5(s), ok(s))).toBeNull();
    expect(newActivityError(s, def5(s), { ...ok(s), quantity: { value: 40, unit: 'readers trained' } })).toBeNull();
  });
  it('requires a title, an owner and the means of verification', () => {
    const s = createSeed();
    expect(newActivityError(s, def5(s), { ...ok(s), title: '  ' })).toBe('title_required');
    expect(newActivityError(s, def5(s), { ...ok(s), ownerPositionId: '' })).toBe('owner_required');
    expect(newActivityError(s, def5(s), { ...ok(s), evidence: '' })).toBe('evidence_required');
  });
  it('keeps it under the deficiency’s own objective', () => {
    const s = createSeed();
    expect(newActivityError(s, def5(s), { ...ok(s), kpiId: 'k1.1.1' })).toBe('kpi_not_allowed');
  });
  it('refuses a quantity that is not a whole number above zero with a unit', () => {
    const s = createSeed();
    expect(newActivityError(s, def5(s), { ...ok(s), quantity: { value: 0, unit: 'x' } })).toBe('quantity_invalid');
    expect(newActivityError(s, def5(s), { ...ok(s), quantity: { value: 2.5, unit: 'x' } })).toBe('quantity_invalid');
    expect(newActivityError(s, def5(s), { ...ok(s), quantity: { value: 4, unit: ' ' } })).toBe('quantity_invalid');
  });
});

describe('changing a 6P level (D6-6)', () => {
  it('needs a different level and a reason', () => {
    const s = createSeed();
    const a = s.activities.find((x) => x.code === 'A1.2.1.3')!;
    expect(levelChangeError(a, 'process', 'reason')).toBe('same_level');
    expect(levelChangeError(a, 'people', '  ')).toBe('reason_required');
    expect(levelChangeError(a, 'people', 'Skills, not equipment')).toBeNull();
  });
  it('never changes an archived activity', () => {
    const s = createSeed();
    const a = s.activities.find((x) => x.code === 'A1.2.1.3')!;
    a.status = 'archived';
    expect(levelChangeError(a, 'people', 'reason')).toBe('archived');
  });
});
