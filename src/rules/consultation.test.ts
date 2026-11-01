/** Part 11c rules: round audience, F-3 display units, baseline and compliance ownership and states, the baseline reader. Pure. */
import { describe, expect, it } from 'vitest';
import type { ConsultationRound, ISODate } from '../contract/caspa-data-contract';
import { createSampleOrgs } from '../data/sample/all';
import {
  baselineCounts, baselineOwnerPosition, baselinesOf, baselineState, canMoveRound, complianceCounts, complianceOf, complianceOwnerPositions,
  headcount, inAudience, isComplianceSource, readBaselineRows, roundChecks, shownUnit, unitAndBelow,
} from './consultation';

const NOW = '2026-10-18' as ISODate;
const orgs = () => createSampleOrgs();
const swu = () => orgs().find((o) => o.orgId === 'org-sample-water')!.store;
const PLAN = 'plan-2027';
const round = (audience: ConsultationRound['audienceUnitIds']) => ({ audienceUnitIds: audience } as ConsultationRound);

describe('units and audience', () => {
  it('a unit includes every unit below it', () => {
    expect([...unitAndBelow(swu(), 'u-com')].sort()).toEqual(['u-com', 'u-zone-a', 'u-zone-b', 'u-zone-c']);
    expect([...unitAndBelow(swu(), 'u-fin')]).toEqual(['u-fin']);
  });
  it('the audience is everyone, or the positions in chosen units and those within them', () => {
    const s = swu();
    expect(inAudience(s, round('all'), [])).toBe(true);
    expect(inAudience(s, round(['u-com' as never]), ['pos-mrb'])).toBe(true);
    expect(inAudience(s, round(['u-com' as never]), ['pos-hof'])).toBe(false);
    expect(inAudience(s, round(['u-zone-b' as never]), ['pos-co'])).toBe(false); // the officer sits in Commercial, above Zone B
  });
  it('counts the people holding positions now, so a vacant post is not counted', () => {
    const s = swu();
    expect(headcount(s, 'u-com', NOW)).toBe(6); // the Head of Commercial post is vacant (H2)
    expect(headcount(s, 'u-zone-b', NOW)).toBe(1);
    expect(headcount(s, 'u-org', NOW)).toBe(13 - 1);
  });
});

describe('F-3: the unit an input is shown as', () => {
  it('a small unit shows as the unit above it, going up until the group is large enough', () => {
    const s = swu();
    expect(shownUnit(s, 'u-zone-b', NOW)).toBe('u-com');
    expect(shownUnit(s, 'u-ops', NOW)).toBe('u-org');
    expect(shownUnit(s, 'u-com', NOW)).toBe('u-com');
    expect(shownUnit(s, null, NOW)).toBeNull();
  });
  it('follows the organisation’s smallest group setting', () => {
    const s = swu();
    s.organisation.settings.consultationMinGroupSize = 1;
    expect(shownUnit(s, 'u-zone-b', NOW)).toBe('u-zone-b');
    s.organisation.settings.consultationMinGroupSize = 7;
    expect(shownUnit(s, 'u-zone-b', NOW)).toBe('u-org');
  });
  it('a flat organisation shows its one unit', () => {
    const ngo = orgs().find((o) => o.store.units.length === 1)!.store;
    const only = ngo.units[0]!.id;
    expect(shownUnit(ngo, only, NOW)).toBe(only);
  });
});

describe('rounds', () => {
  it('need the Consultation stage open, one at a time, forward dates and at least one unit', () => {
    const s = swu();
    const plan = s.plans.find((p) => p.id === PLAN)!;
    const input = { audienceUnitIds: [] as string[], opensOn: '2026-10-20' as ISODate, closesOn: '2026-10-19' as ISODate };
    expect(roundChecks(s, plan, input)).toEqual(['stage_not_open', 'dates_backwards', 'no_units']);
    plan.formation!.consultation.status = 'open';
    expect(roundChecks(s, plan, { ...input, audienceUnitIds: 'all', closesOn: '2026-11-13' as ISODate })).toEqual([]);
  });
  it('move forward only', () => {
    expect([canMoveRound('scheduled', 'open'), canMoveRound('open', 'closed'), canMoveRound('scheduled', 'closed'), canMoveRound('closed', 'open')]).toEqual([true, true, false, false]);
  });
});

describe('the baseline register', () => {
  it('a measure’s owner answers for its unit; with no unit, the Strategy office checks it', () => {
    const s = swu();
    expect(baselinesOf(s, PLAN).map((b) => baselineOwnerPosition(s, b))).toEqual(['pos-hoc', 'pos-hoo', 'pos-hof', 'pos-hoo', 'pos-hoc', null]);
  });
  it('an AI draft awaits its owner, then is confirmed, then validated; a rejected draft is not counted', () => {
    const s = swu();
    expect(baselinesOf(s, PLAN).map(baselineState)).toEqual(['awaiting_owner', 'confirmed', 'awaiting_owner', 'confirmed', 'awaiting_owner', 'confirmed']);
    const b = baselinesOf(s, PLAN)[1]!;
    b.validated = { at: '2026-10-18T09:00:00+02:00' as never, byMembershipId: 'm-spm' as never };
    expect(baselineState(b)).toBe('validated');
    baselinesOf(s, PLAN)[0]!.draft.state = 'rejected';
    expect(baselineCounts(s, PLAN)).toEqual({ total: 5, awaiting: 2, confirmed: 2, validated: 1 });
  });
  it('reads spreadsheet rows without guessing: blank rows skipped, problems named', () => {
    const rows = readBaselineRows(swu(), [
      ['Measure', 'Unit', 'Value', 'As of', 'Source', 'Owner unit'],
      ['A', '%', '12.5', '2026-09-30', 'Log', 'commercial'],
      [' ', '', '', '', '', ''],
      ['B', '%', '', '30/09/2026', '', ''],
    ]);
    expect(rows.map((r) => [r.row, r.value, r.asOf, r.ownerUnitId, r.problems])).toEqual([
      [2, 12.5, '2026-09-30', 'u-com', []],
      [4, null, null, null, ['no_value', 'bad_date']],
    ]);
  });
});

describe('the compliance register', () => {
  it('owners are the heads of the departments that marked an item', () => {
    const s = swu();
    const c = complianceOf(s, PLAN)[0]!;
    expect(complianceOwnerPositions(s, c)).toEqual([]);
    c.flaggedByUnitIds = ['u-fin', 'u-com'] as never;
    expect(complianceOwnerPositions(s, c)).toEqual(['pos-hof', 'pos-hoc']);
  });
  it('counts outcomes and marked items', () => {
    const s = swu();
    const [a, b, c] = complianceOf(s, PLAN);
    a!.outcome = 'aligned'; b!.outcome = 'needs_change'; c!.outcome = 'not_applicable'; c!.flaggedByUnitIds = ['u-ops'] as never;
    expect(complianceCounts(s, PLAN)).toEqual({ total: 6, reviewed: 3, aligned: 1, needsChange: 1, notApplicable: 1, flagged: 1 });
  });
  it('reads obligations only from regulatory documents, licences and policies', () => {
    const s = swu();
    expect(s.sourceDocuments.filter(isComplianceSource).map((d) => d.kind)).toEqual(['licence', 'regulatory']);
  });
});
