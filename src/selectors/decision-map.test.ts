/** The decision-map selector (BUILD-BRIEF section 22; Clarity Specification, section 10), in all four organisations. */
import { computeFindings, RULES } from '../rules/integrity';
import { createSampleOrgs } from '../data/sample/all';
import { createSeed } from '../data/sample/seed';
import { decisionMap } from './decision-map';

const see = { canView: true };

describe('O1.2 on Sample Water Utility', () => {
  const m = decisionMap(createSeed(), 'o1.2', see)!;
  it('counts deficiencies, levels and corrective activities', () => {
    expect([m.total, m.levelsUsed, m.corrective, m.unaddressed]).toEqual([5, 4, 4, 1]);
    expect(m.counts).toEqual({ principle: 0, process: 2, people: 1, policy: 1, procedures: 0, practices: 1 });
  });
  it('groups rows by level in book order and collapses the empty levels', () => {
    expect(m.groups.map((g) => g.level)).toEqual(['process', 'people', 'policy', 'practices']);
    expect(m.empty).toEqual(['principle', 'procedures']);
  });
  it('marks a solution at another level, and only there', () => {
    const solved = m.groups.flatMap((g) => g.rows).map((r) => [r.id, r.corrective.map((c) => c.solvedAt)]);
    expect(solved).toEqual([['def-1', [null]], ['def-2', [null]], ['def-5', []], ['def-3', [null]], ['def-4', ['procedures']]]);
  });
  it('names the objective, its goal and owner', () => {
    expect([m.objective.code, m.goal.code, m.owner]).toEqual(['O1.2', 'G1', 'Head of Operations']);
  });
  it('gives the count only to those who may not see deficiencies (D6-5)', () => {
    const r = decisionMap(createSeed(), 'o1.2', { canView: false })!;
    expect(r.visible).toBe(false);
    expect(r.total).toBe(5);
    expect(r.groups).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('tampering');
  });
  it('follows a level change of a corrective activity', () => {
    const s = createSeed();
    s.activities.find((a) => a.code === 'A1.2.1.3')!.decisionLevel = 'people';
    const row = decisionMap(s, 'o1.2', see)!.groups[0]!.rows.find((r) => r.id === 'def-1')!;
    expect(row.corrective[0]!.solvedAt).toBe('people');
  });
  it('returns null for an unknown objective', () => {
    expect(decisionMap(createSeed(), 'nope', see)).toBeNull();
  });
});

describe('test organisations', () => {
  const orgs = createSampleOrgs();
  const by = (name: string) => orgs.find((o) => o.store.organisation.name === name)!.store;

  it('NGO: two rows on R1.1, one solved at another level, one with none', () => {
    const s = by('Sample Community Health NGO');
    const o = s.objectives.find((x) => x.code === 'R1.1')!;
    const m = decisionMap(s, o.id, see)!;
    expect([m.total, m.unaddressed, m.corrective]).toEqual([2, 1, 1]);
    expect(m.groups.map((g) => g.level)).toEqual(['people', 'practices']);
    expect(m.groups[0]!.rows[0]!.corrective[0]!.solvedAt).toBe('procedures');
  });
  it('packaging manufacturer: every map is empty', () => {
    const s = by('Sample Packaging Manufacturer');
    for (const o of s.objectives) {
      const m = decisionMap(s, o.id, see)!;
      expect([m.total, m.groups.length, m.empty.length]).toEqual([0, 0, 6]);
    }
  });
  it('scale organisation: 14 rows on O2.1 across all six levels, 8 at Process, 3 with none', () => {
    const s = by('Sample Scale Test Organisation');
    const o = s.objectives.find((x) => x.code === 'O2.1')!;
    const m = decisionMap(s, o.id, see)!;
    expect([m.total, m.levelsUsed, m.unaddressed, m.empty.length]).toEqual([14, 6, 3, 0]);
    const process = m.groups.find((g) => g.level === 'process')!.rows;
    expect(process).toHaveLength(8);
    // The 7th and 8th Process rows are the unaddressed ones, so folding after six must keep them.
    expect(process.map((r) => r.corrective.length === 0)).toEqual([false, false, false, false, false, false, true, true]);
  });

  it.each(orgs.map((o) => [o.store.organisation.name, o.store] as const))('%s: the map agrees with the check on every row', (_n, s) => {
    const fy = s.activities[0]!.financialYear;
    const flagged = new Set(computeFindings(s, { financialYear: fy }).filter((f) => f.ruleId === RULES.deficiencyUnaddressed.id).map((f) => f.subject.id));
    for (const o of s.objectives) {
      for (const r of decisionMap(s, o.id, see)!.groups.flatMap((g) => g.rows)) expect(flagged.has(r.id), r.id).toBe(r.corrective.length === 0);
    }
  });
});
