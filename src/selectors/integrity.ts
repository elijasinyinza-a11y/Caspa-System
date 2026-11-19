/**
 * Where a finding is fixed (Build Brief section 8: every finding links directly to the record that fixes it).
 * Pure: reads stored records only. Permissions are applied by the data-access layer, which passes `canOpen`.
 */
import type { AssignedRole, Finding } from "../contract/caspa-data-contract";
import type { Store } from "../data/access/store";
import type { WorkspaceKey } from "../strings/en";
import type { NodeKind } from "./node";

export type FixTarget =
  | { kind: "node"; node: NodeKind; id: string; code: string }
  /** The record has no page of its own yet; the fix happens in a workspace (e.g. linking a budget line in Plan). */
  | { kind: "workspace"; w: Exclude<WorkspaceKey, "home"> }
  /** A row on an objective's decision map (BUILD-BRIEF section 22, D6-2). `code` is the objective's. */
  | { kind: "map"; objectiveId: string; deficiencyId: string; code: string }
  /** v0.30.0: People and access, at a person's row (By person) or a role (By role). Administrators only. */
  | { kind: "access"; personId?: string; role?: AssignedRole };

const node = (
  node: NodeKind,
  rec: { id: string; code: string } | undefined,
): FixTarget | null =>
  rec ? { kind: "node", node, id: rec.id, code: rec.code } : null;

export function fixTarget(s: Store, f: Finding): FixTarget | null {
  const { type, id } = f.subject;
  switch (type) {
    case "Goal":
      return node(
        "goal",
        s.goals.find((x) => x.id === id),
      );
    case "Objective":
      return node(
        "objective",
        s.objectives.find((x) => x.id === id),
      );
    case "Kpi":
      return node(
        "kpi",
        s.kpis.find((x) => x.id === id),
      );
    case "Activity":
      return node(
        "activity",
        s.activities.find((x) => x.id === id),
      );
    case "BudgetLine": {
      const l = s.budgetLines.find((x) => x.id === id);
      if (!l) return null;
      // A linked line is fixed from its activity; an orphan line is linked to an activity in Plan.
      return l.activityId
        ? node(
            "activity",
            s.activities.find((a) => a.id === l.activityId),
          )
        : { kind: "workspace", w: "plan" };
    }
    case "Deficiency": {
      // Fixed on the objective's decision map, at the deficiency's own row (D6-2).
      const df = s.deficiencies.find((x) => x.id === id);
      const o = s.objectives.find((x) => x.id === df?.objectiveId);
      return df && o ? { kind: "map", objectiveId: o.id, deficiencyId: df.id, code: o.code } : null;
    }
    case "Membership": {
      const m = s.memberships.find((x) => x.id === id);
      return m ? { kind: "access", personId: m.personId } : null;
    }
    case "Organisation": {
      // Access checks on the whole organisation (v0.30.0): the role concerned, or the people list.
      if (f.ruleId === "ACCESS-NO-EXECUTIVE") return { kind: "access", role: "executive" };
      if (f.ruleId === "ACCESS-KEY-ROLE-ACTING-ONLY") return { kind: "access", role: id.split(":")[1] as AssignedRole };
      if (f.ruleId === "ACCESS-NO-STAFF-ADMIN") return { kind: "access" };
      return null;
    }
    case "ContractObjective": {
      // Reviewed against the activity whose change raised it.
      const co = s.contractObjectives.find((x) => x.id === id);
      return node(
        "activity",
        s.activities.find((a) => a.id === co?.sourceActivityId),
      );
    }
  }
  return null;
}
