/**
 * Strategy formation, part 11c: Consultation and Confirmation (Strategy Formation Specification v1.0, F2 and F3;
 * BUILD-BRIEF sections 30 and 32; contract v1.6). Pure: records in, results out. No clock, no React, no I/O.
 *
 * - A consultation round is opened and closed by the Strategy office or a facilitator, never by the clock. Its
 *   audience is all members or chosen units (with every unit below them).
 * - F-3: an input shows its unit only, never its author. A unit with fewer people than the organisation's smallest
 *   group is shown as its parent unit, going up until the group is large enough or the top unit is reached.
 * - The baseline register: the data owner answers for the measure's unit (contract v1.6); an AI draft waits for the
 *   owner to accept or correct it; the Strategy office validates. The AI never validates.
 * - The compliance register: obligations come only from uploaded laws, regulations, licences, policies and standards, or are
 *   typed by a person; department heads flag those affecting their area; the compliance officer reviews each one.
 */
import type { BaselineMeasure, ComplianceItem, ConsultationInput, ConsultationRound, FormationStage, ISODate, SourceDocument, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { departments } from './conception';
import { accountablePositionOfUnit } from './structure';

/* ───────── Structure helpers ───────── */

/** A unit and every unit below it. */
export function unitAndBelow(s: Store, unitId: string): Set<string> {
  const out = new Set<string>([unitId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of s.units) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true; }
  }
  return out;
}

const heldNow = (s: Store, now: ISODate) => s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));

/** People holding a position in the unit or below it at "now". */
export function headcount(s: Store, unitId: string, now: ISODate): number {
  const units = unitAndBelow(s, unitId);
  const inUnit = new Set(s.positions.filter((p) => units.has(p.unitId)).map((p) => p.id as string));
  return new Set(heldNow(s, now).filter((a) => inUnit.has(a.positionId)).map((a) => a.personId as string)).size;
}

/**
 * F-3: the unit an input is shown as. Units smaller than the organisation's smallest group show as their parent,
 * going up until the group is large enough; the top unit is shown as it is.
 */
export function shownUnit(s: Store, unitId: string | null, now: ISODate): string | null {
  if (!unitId) return null;
  const min = s.organisation.settings.consultationMinGroupSize;
  let u = s.units.find((x) => x.id === unitId);
  while (u && u.parentId && headcount(s, u.id, now) < min) u = s.units.find((x) => x.id === u!.parentId);
  return u?.id ?? null;
}

/** The unit a person's comment or idea comes from: the unit of the first position they hold. */
export function authorUnit(s: Store, positionIds: readonly string[]): string | null {
  const p = s.positions.find((x) => x.id === positionIds[0]);
  return p?.unitId ?? null;
}

/* ───────── Consultation rounds ───────── */

export const roundsOf = (s: Store, planId: string) => s.consultationRounds.filter((r) => r.planId === planId);
/** The round in play: the newest that is not closed, otherwise the newest. */
export function currentRound(s: Store, planId: string): ConsultationRound | null {
  const rs = roundsOf(s, planId);
  return [...rs].reverse().find((r) => r.status !== 'closed') ?? rs[rs.length - 1] ?? null;
}
export const inputsOf = (s: Store, roundId: string) => s.consultationInputs.filter((i) => i.roundId === roundId);

/** Whether positions sit in the round's audience (the round_audience principal). All members when the audience is 'all'. */
export function inAudience(s: Store, round: ConsultationRound, positionIds: readonly string[]): boolean {
  if (round.audienceUnitIds === 'all') return true;
  const units = new Set(round.audienceUnitIds.flatMap((u) => [...unitAndBelow(s, u)]));
  return s.positions.some((p) => positionIds.includes(p.id) && units.has(p.unitId));
}

/** An open round of the plan being formed that these positions belong to: their way into the Strategy workspace. */
export const openRoundFor = (s: Store, plan: StrategicPlan | null, positionIds: readonly string[]) =>
  plan ? roundsOf(s, plan.id).find((r) => r.status === 'open' && inAudience(s, r, positionIds)) ?? null : null;

/** What stops a round from being scheduled or opened. The stage must be open; one round runs at a time. */
export type RoundMust = 'stage_not_open' | 'another_round' | 'dates_backwards' | 'no_units';
export function roundChecks(s: Store, plan: StrategicPlan, input: { audienceUnitIds: string[] | 'all'; opensOn: ISODate; closesOn: ISODate }, exceptId?: string): RoundMust[] {
  const out: RoundMust[] = [];
  if (plan.formation?.consultation.status !== 'open') out.push('stage_not_open');
  if (roundsOf(s, plan.id).some((r) => r.id !== exceptId && r.status !== 'closed')) out.push('another_round');
  if (input.closesOn < input.opensOn) out.push('dates_backwards');
  if (input.audienceUnitIds !== 'all' && input.audienceUnitIds.length === 0) out.push('no_units');
  return out;
}

/** A round moves forward only: scheduled → open → closed. */
export const canMoveRound = (from: ConsultationRound['status'], to: 'open' | 'closed') =>
  (from === 'scheduled' && to === 'open') || (from === 'open' && to === 'closed');

/** Counts for the room, computed: inputs by kind and the shown units they came from. */
export function roundCounts(s: Store, roundId: string, now: ISODate) {
  const inputs = inputsOf(s, roundId);
  const by = (k: ConsultationInput['kind']) => inputs.filter((i) => i.kind === k).length;
  return {
    inputs: inputs.length, comments: by('comment'), ideas: by('idea'), meetings: by('meeting_summary'), expert: by('expert_input'),
    units: new Set(inputs.map((i) => shownUnit(s, i.unitId, now)).filter((u): u is string => !!u)).size,
  };
}

/* ───────── Baseline register ───────── */

export const baselinesOf = (s: Store, planId: string) => s.baselineMeasures.filter((b) => b.planId === planId);
/** Measures still in play: not rejected. */
export const isLiveBaseline = (b: BaselineMeasure) => b.draft.state !== 'rejected';

/** The data owner: whoever answers for the measure's unit (contract v1.6). Null: the Strategy office checks it. */
export const baselineOwnerPosition = (s: Store, b: BaselineMeasure): string | null => (b.ownerUnitId ? accountablePositionOfUnit(s, b.ownerUnitId) : null);

export type BaselineState = 'awaiting_owner' | 'confirmed' | 'validated' | 'rejected';
/** An AI draft awaits its owner; accepted or typed by a person, it is confirmed; the Strategy office then validates it. */
export const baselineState = (b: BaselineMeasure): BaselineState =>
  b.draft.state === 'rejected' ? 'rejected' : b.validated ? 'validated' : b.draft.state === 'ai_draft' ? 'awaiting_owner' : 'confirmed';

export function baselineCounts(s: Store, planId: string) {
  const live = baselinesOf(s, planId).filter(isLiveBaseline);
  const st = live.map(baselineState);
  return { total: live.length, awaiting: st.filter((x) => x === 'awaiting_owner').length, confirmed: st.filter((x) => x === 'confirmed').length, validated: st.filter((x) => x === 'validated').length };
}

/** Columns of the baseline import (specification F2: "imported directly from Excel or CSV exports"). */
export const BASELINE_COLUMNS = 6;
export type BaselineRowProblem = 'no_name' | 'no_value' | 'bad_value' | 'bad_date' | 'unknown_unit';
export interface BaselineRow { row: number; name: string; unit: string; value: number | null; asOf: ISODate | null; source: string; ownerUnitId: string | null; problems: BaselineRowProblem[] }

/**
 * Reads rows of measure, unit, value, as of (YYYY-MM-DD, blank for today), source and owner unit (the unit's name,
 * blank for none). The first row is the header. Values must be numbers; nothing is guessed.
 */
export function readBaselineRows(s: Store, rows: string[][]): BaselineRow[] {
  const byName = new Map(s.units.map((u) => [u.name.trim().toLowerCase(), u.id as string]));
  return rows.slice(1).map((r, i) => ({ r, n: i + 2 })).filter(({ r }) => r.some((c) => (c ?? '').trim())).map(({ r, n }) => {
    const cell = (k: number) => (r[k] ?? '').trim();
    const problems: BaselineRowProblem[] = [];
    const name = cell(0);
    if (!name) problems.push('no_name');
    const raw = cell(2).replace(/,/g, '');
    const value = raw === '' ? null : Number(raw);
    if (raw === '') problems.push('no_value');
    else if (!Number.isFinite(value)) problems.push('bad_value');
    const date = cell(3);
    const asOf = date === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? (date as ISODate) : null;
    if (date !== '' && !asOf) problems.push('bad_date');
    const ownerName = cell(5);
    const ownerUnitId = ownerName ? byName.get(ownerName.toLowerCase()) ?? null : null;
    if (ownerName && !ownerUnitId) problems.push('unknown_unit');
    return { row: n, name, unit: cell(1), value: value !== null && Number.isFinite(value) ? value : null, asOf, source: cell(4), ownerUnitId, problems };
  });
}

/* ───────── Compliance register ───────── */

export const complianceOf = (s: Store, planId: string) => s.complianceItems.filter((c) => c.planId === planId);

/** Documents the AI may read obligations from: laws and regulations, licences, policies and standards only (F3; standards from v1.7). */
export const COMPLIANCE_DOC_KINDS: SourceDocument['kind'][] = ['regulatory', 'licence', 'policy', 'standard'];
export const isComplianceSource = (d: SourceDocument) => COMPLIANCE_DOC_KINDS.includes(d.kind);

/** The item's owners: heads of the departments that flagged it (contract v1.6). */
export function complianceOwnerPositions(s: Store, c: ComplianceItem): string[] {
  const heads = new Map(departments(s).map((d) => [d.unitId, d.headPositionId]));
  return [...new Set(c.flaggedByUnitIds.map((u) => heads.get(u as string)).filter((p): p is string => !!p))];
}

export function complianceCounts(s: Store, planId: string) {
  const items = complianceOf(s, planId);
  const by = (o: ComplianceItem['outcome']) => items.filter((c) => c.outcome === o).length;
  return { total: items.length, reviewed: items.filter((c) => c.outcome !== null).length, aligned: by('aligned'), needsChange: by('needs_change'), notApplicable: by('not_applicable'), flagged: items.filter((c) => c.flaggedByUnitIds.length > 0).length };
}

/** Whether a stage has been opened (open or complete): its owners' work reaches "Needs you" from then on. */
export const stageStarted = (plan: StrategicPlan, stage: FormationStage) => (plan.formation?.[stage].status ?? 'not_started') !== 'not_started';
