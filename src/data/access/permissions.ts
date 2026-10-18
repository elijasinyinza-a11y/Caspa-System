/** Permission checks applied by the data-access layer (decisions B2, B3). Default is deny. */
import { PERMISSIONS, type Action, type Principal } from '../../contract/caspa-data-contract';
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

export function can(s: Store, v: Viewer, action: Action, subject: Subject): boolean {
  const type = GOVERNED_BY[subject.type] ?? subject.type;
  const principals = PERMISSIONS[type]?.[action] ?? [];
  return principals.some((p) => holds(s, v, p, subject));
}
