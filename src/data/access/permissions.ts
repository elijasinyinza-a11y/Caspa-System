/** Permission checks applied by the data-access layer (decisions B2, B3). Default is deny. */
import { PERMISSIONS, type Action, type Finding, type Principal } from '../../contract/caspa-data-contract';
import { budgetHolderPositions, objectiveOfActivity } from '../../rules/structure';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface Subject {
  type: string;
  id: string;
}

/** Records whose permissions are governed by a parent record type. */
const GOVERNED_BY: Record<string, string> = { ContractObjective: 'PerformanceContract', ProgressUpdate: 'PerformanceContract' };

function contractOf(s: Store, subject: Subject) {
  if (subject.type === 'PerformanceContract') return s.contracts.find((c) => c.id === subject.id);
  if (subject.type === 'Review') {
    const r = s.reviews.find((x) => x.id === subject.id);
    return r && s.contracts.find((c) => c.id === r.contractId);
  }
  const co = s.contractObjectives.find((x) => x.id === subject.id);
  return co && s.contracts.find((c) => c.id === co.contractId);
}

function holds(s: Store, v: Viewer, principal: Principal, subject: Subject): boolean {
  if (principal === 'all_members') return true;
  if (principal === 'executive' || principal === 'strategy_office' || principal === 'finance' || principal === 'hr' || principal === 'facilitator' || principal === 'compliance' || principal === 'org_admin') {
    return v.roles.includes(principal);
  }
  const mine = (pid: string | null | undefined) => !!pid && v.positionIds.includes(pid as Viewer['positionIds'][number]);
  switch (principal) {
    case 'owner': {
      const rec =
        s.goals.find((x) => x.id === subject.id) ?? s.objectives.find((x) => x.id === subject.id) ??
        s.kpis.find((x) => x.id === subject.id) ?? s.activities.find((x) => x.id === subject.id);
      return mine(rec?.ownerPositionId);
    }
    case 'objective_owner': {
      const a = s.activities.find((x) => x.id === subject.id);
      if (a) return mine(objectiveOfActivity(s, a)?.ownerPositionId);
      const df = s.deficiencies.find((x) => x.id === subject.id);
      if (df) return mine(s.objectives.find((o) => o.id === df.objectiveId)?.ownerPositionId);
      const k = s.kpis.find((x) => x.id === subject.id);
      if (k) return mine(s.objectives.find((o) => o.id === k.objectiveId)?.ownerPositionId);
      return mine(s.objectives.find((o) => o.id === subject.id)?.ownerPositionId);
    }
    case 'budget_holder': {
      const l = s.budgetLines.find((x) => x.id === subject.id);
      if (!l) return false;
      const holders = budgetHolderPositions(s, l);
      return v.positionIds.some((p) => holders.has(p));
    }
    case 'self':
      return contractOf(s, subject)?.personId === v.personId;
    case 'supervisor': {
      const c = contractOf(s, subject);
      return mine(s.positions.find((p) => p.id === c?.positionId)?.reportsToPositionId);
    }
    case 'next_level_reviewer': {
      const c = contractOf(s, subject);
      const sup = s.positions.find((p) => p.id === c?.positionId)?.reportsToPositionId;
      return mine(s.positions.find((p) => p.id === sup)?.reportsToPositionId);
    }
  }
  return false;
}

/** Personnel cost detail is for Finance and HR only (B6), on top of the matrix. */
const personnelHidden = (s: Store, v: Viewer, subject: Subject): boolean =>
  subject.type === 'BudgetLine' &&
  s.budgetLines.find((l) => l.id === subject.id)?.costCategory === 'personnel' &&
  !v.roles.includes('finance') && !v.roles.includes('hr');

export function can(s: Store, v: Viewer, action: Action, subject: Subject): boolean {
  if (action === 'view' && personnelHidden(s, v, subject)) return false;
  const type = GOVERNED_BY[subject.type] ?? subject.type;
  const principals = PERMISSIONS[type]?.[action] ?? [];
  return principals.some((p) => holds(s, v, p, subject));
}

/**
 * Whether this viewer may acknowledge a finding (contract v1.3). Advisory flags only; the viewer must be
 * able to see the finding's subject, and hold a principal in the Acknowledgement row of the matrix.
 */
export function canAcknowledge(s: Store, v: Viewer, f: Finding): boolean {
  if (f.blocksAt.length > 0) return false;
  if (!can(s, v, 'view', f.subject)) return false;
  return (PERMISSIONS.Acknowledgement?.draft ?? []).some((p) =>
    p === 'finding_recipient' ? f.routeToPositionIds.some((pid) => v.positionIds.includes(pid)) : holds(s, v, p, f.subject),
  );
}

/**
 * Whether this viewer may see a contract's rating (scores, labels, rating flags). Ratings follow the Review row of
 * the matrix (B5: employee, supervisor, next-level reviewer, HR) whether or not a review record exists yet.
 * Executives, Finance and facilitators never see ratings through this.
 */
export function canSeeRating(s: Store, v: Viewer, contractId: string): boolean {
  if (!s.contracts.some((c) => c.id === contractId)) return false;
  return (PERMISSIONS.Review?.view ?? []).some((p) => holds(s, v, p, { type: 'PerformanceContract', id: contractId }));
}

/**
 * Who may take each budget step (BUILD-BRIEF section 19). Finance submits the consolidated budget. Approving or
 * returning it is open to the roles that approve budget lines in the matrix (Finance and Executive), never to the
 * person who submitted it; that last check is made by the rules engine against the gate record.
 */
export function canTakeBudgetStep(v: Viewer, step: 'submit' | 'approve' | 'return'): boolean {
  if (step === 'submit') return v.roles.includes('finance');
  const approvers = (PERMISSIONS.BudgetLine?.approve ?? []) as Principal[];
  return approvers.some((p) => (v.roles as Principal[]).includes(p));
}
