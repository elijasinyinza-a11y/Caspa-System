/**
 * Where a finding is fixed (Build Brief section 8: every finding links directly to the record that fixes it).
 * Pure: reads stored records only. Permissions are applied by the data-access layer, which passes `canOpen`.
 */
import type { Finding } from "../contract/caspa-data-contract";
import type { Store } from "../data/access/store";
import type { WorkspaceKey } from "../strings/en";
import type { NodeKind } from "./node";

export type FixTarget =
  | { kind: "node"; node: NodeKind; id: string; code: string }
  /** The record has no page of its own yet; the fix happens in a workspace (e.g. linking a budget line in Plan). */
  | { kind: "workspace"; w: Exclude<WorkspaceKey, "home"> };

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
      // Fixed by adding a corrective activity under the objective that holds the deficiency.
      const df = s.deficiencies.find((x) => x.id === id);
      return node(
        "objective",
        s.objectives.find((o) => o.id === df?.objectiveId),
      );
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
