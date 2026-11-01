/**
 * Strategy formation, part 11b: Conception (Strategy Formation Specification v1.0, F1; BUILD-BRIEF sections 30–31).
 * Pure: records in, results out. No clock, no React, no I/O.
 *
 * - The 4Q record sheet follows Table 2 of the book: three bands, four columns each.
 * - Department heads (F-2) fill in their department's sheet; the Strategy office consolidates accepted cards into
 *   one organisation sheet, merging duplicates and keeping every department that raised a card.
 * - vision.confirm needs an accepted entry in every section of the organisation sheet and a vision written by
 *   leadership; an Executive confirms. Dates are never checked.
 */
import type { FourQCell, FourQEntry, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { formingPlan } from './formation';
import { accountablePositionOfUnit } from './structure';

/** Table 2, in reading order: band by band, column by column. */
export const CELLS: FourQCell[] = [
  { band: 'retraction', column: 'successes' }, { band: 'retraction', column: 'success_factors' }, { band: 'retraction', column: 'failures' }, { band: 'retraction', column: 'failure_factors' },
  { band: 'repositioning', column: 'successes' }, { band: 'repositioning', column: 'success_factors' }, { band: 'repositioning', column: 'failures' }, { band: 'repositioning', column: 'failure_factors' },
  { band: 'projection', column: 'opportunities' }, { band: 'projection', column: 'key_strategic_actions' }, { band: 'projection', column: 'risks' }, { band: 'projection', column: 'risk_strategies' },
];
export const BANDS = ['retraction', 'repositioning', 'projection'] as const;
export const cellKey = (c: FourQCell) => `${c.band}.${c.column}`;
export const sameCell = (a: FourQCell, b: FourQCell) => a.band === b.band && a.column === b.column;
export const cellOfKey = (k: string): FourQCell | null => CELLS.find((c) => cellKey(c) === k) ?? null;

/** A card counts once a person has accepted it or written it themselves. */
export const isAccepted = (e: FourQEntry) => e.draft.state === 'accepted' || e.draft.state === 'human';
/** Cards still in play: not merged into another, not rejected. */
export const isLive = (e: FourQEntry) => e.mergedIntoId === null && e.draft.state !== 'rejected';
export const entriesOf = (s: Store, planId: string) => s.fourQEntries.filter((e) => e.planId === planId);
export const organisationSheet = (s: Store, planId: string) => entriesOf(s, planId).filter((e) => e.scope === 'organisation' && isLive(e));
export const departmentSheet = (s: Store, planId: string, unitId: string) =>
  entriesOf(s, planId).filter((e) => e.scope === 'department' && isLive(e) && e.raisedByUnitIds.includes(unitId as never));

/** F-2: the units directly below the top unit, each with the position that answers for it (vacant posts included). */
export function departments(s: Store): { unitId: string; name: string; headPositionId: string | null }[] {
  const top = new Set(s.units.filter((u) => !u.parentId).map((u) => u.id as string));
  return s.units
    .filter((u) => u.parentId && top.has(u.parentId))
    .map((u) => ({ unitId: u.id as string, name: u.name, headPositionId: (accountablePositionOfUnit(s, u.id) as string | null) ?? null }));
}

/** The departments a set of positions answers for. */
export const departmentsHeadedBy = (s: Store, positionIds: readonly string[]) =>
  departments(s).filter((d) => d.headPositionId !== null && positionIds.includes(d.headPositionId));

/** The department heads who may act on a card: those answering for a department that raised it (the FourQEntry "owner"). */
export function cardOwnerPositions(s: Store, e: FourQEntry): string[] {
  const heads = new Map(departments(s).map((d) => [d.unitId, d.headPositionId]));
  return [...new Set(e.raisedByUnitIds.map((u) => heads.get(u as string)).filter((p): p is string => !!p))];
}

/** A department's submission of its sheet to the Strategy office: the FourQEntry "propose" action, kept as an audit entry. */
export const SUBMIT_ACTION = 'four_q.submit';
export const KEEP_SEPARATE_ACTION = 'four_q.keep_separate';
export function submissionOf(s: Store, planId: string, unitId: string) {
  return [...s.auditEntries].reverse().find((a) => a.action === SUBMIT_ACTION && a.entity.type === 'OrgUnit' && a.entity.id === unitId && (a.after as { planId?: string } | null)?.planId === planId) ?? null;
}
/** Whether the department's interview has been held: an AI task of kind "interview" for this plan and unit. */
export const interviewOf = (s: Store, planId: string, unitId: string) =>
  s.aiTasks.find((t) => t.kind === 'interview' && t.inputRefs.some((r) => r.type === 'StrategicPlan' && r.id === planId) && t.inputRefs.some((r) => r.type === 'OrgUnit' && r.id === unitId)) ?? null;

export interface DepartmentState {
  unitId: string;
  name: string;
  headPositionId: string | null;
  interviewed: boolean;
  /** AI drafts on the department's sheet still to be accepted, corrected or rejected. */
  toCheck: number;
  /** Accepted cards still on the department's sheet, waiting to be added to the organisation sheet. */
  waiting: number;
  /** Accepted cards this department raised that are on the organisation sheet, merged ones included. */
  consolidated: number;
  submitted: boolean;
}

/** One department's checklist (specification, "Department view"; prototype "My department's part"). */
export function departmentState(s: Store, planId: string, unitId: string): DepartmentState {
  const d = departments(s).find((x) => x.unitId === unitId);
  const sheet = departmentSheet(s, planId, unitId);
  return {
    unitId, name: d?.name ?? '', headPositionId: d?.headPositionId ?? null,
    interviewed: !!interviewOf(s, planId, unitId),
    toCheck: sheet.filter((e) => e.draft.state === 'ai_draft').length,
    waiting: sheet.filter(isAccepted).length,
    consolidated: entriesOf(s, planId).filter((e) => e.scope === 'organisation' && isAccepted(e) && e.raisedByUnitIds.includes(unitId as never)).length,
    submitted: !!submissionOf(s, planId, unitId),
  };
}

/** A department may submit once it has checked every draft and has at least one accepted card. */
export const canSubmitDepartment = (d: DepartmentState) => d.toCheck === 0 && d.waiting + d.consolidated > 0;

/** Sections of the organisation sheet with at least one accepted card. */
export function filledCells(s: Store, planId: string): FourQCell[] {
  const sheet = organisationSheet(s, planId).filter(isAccepted);
  return CELLS.filter((c) => sheet.some((e) => sameCell(e.cell, c)));
}

/** What must be fixed before vision.confirm (Strategy Formation Specification v1.0, "Gates"). */
export type VisionMust = { kind: 'cell_empty'; cell: FourQCell } | { kind: 'no_vision' } | { kind: 'already_confirmed' } | { kind: 'not_formed' };
export const visionMustKey = (planId: string, m: VisionMust) =>
  m.kind === 'cell_empty' ? `FORM-4Q-CELL-EMPTY:StrategicPlan:${planId}:${cellKey(m.cell)}` : `FORM-${m.kind.toUpperCase().replace(/_/g, '-')}:StrategicPlan:${planId}`;

export function visionChecks(s: Store, plan: StrategicPlan): VisionMust[] {
  if (plan.entryDoor !== 'formed' || plan.status !== 'draft') return [{ kind: 'not_formed' }];
  const out: VisionMust[] = [];
  const vision = s.visionStatements.find((v) => v.planId === plan.id && v.kind === 'vision');
  if (vision?.confirmation) out.push({ kind: 'already_confirmed' });
  const filled = filledCells(s, plan.id).map(cellKey);
  for (const c of CELLS) if (!filled.includes(cellKey(c))) out.push({ kind: 'cell_empty', cell: c });
  if (!vision?.text.trim()) out.push({ kind: 'no_vision' });
  return out;
}

/** Whether the plan's vision has passed vision.confirm. */
export const visionConfirmed = (s: Store, planId: string) => !!s.visionStatements.find((v) => v.planId === planId && v.kind === 'vision')?.confirmation;

/** Pairs a person said are not duplicates, so they are not suggested again. */
export function keptSeparate(s: Store, planId: string): Set<string> {
  const out = new Set<string>();
  for (const a of s.auditEntries) {
    if (a.action !== KEEP_SEPARATE_ACTION) continue;
    const after = a.after as { planId?: string; otherId?: string } | null;
    if (after?.planId === planId && after.otherId) out.add(pairKey(a.entity.id, after.otherId));
  }
  return out;
}
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Whether these positions answer for a department while a plan is being formed: their Strategy workspace (F-2). */
export const headsADepartment = (s: Store, positionIds: readonly string[]) => !!formingPlan(s) && departmentsHeadedBy(s, positionIds).length > 0;
