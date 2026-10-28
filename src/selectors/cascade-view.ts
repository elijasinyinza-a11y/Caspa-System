/**
 * The Cascade workspace view (Clarity Specification v0.1, section 8): the person's own part, problems first,
 * checks rolled up to the nearest open record. Pure: it reads the cascade tree, the checks this viewer is shown
 * and the viewer's own records, all passed in by the data-access layer. Display filters only; permissions are
 * applied before this runs.
 */
import type { TreeNode } from './node';

/** Checks on one record, as this viewer is shown them. */
export interface NodeChecks {
  mustFix: number;
  toCheck: number;
  checked: number;
}
export const NO_CHECKS: NodeChecks = { mustFix: 0, toCheck: 0, checked: 0 };

export interface Indexed {
  node: TreeNode;
  parentId: string | null;
}

/** Every record by id, with its parent. */
export function indexTree(goals: TreeNode[]): Map<string, Indexed> {
  const out = new Map<string, Indexed>();
  const walk = (n: TreeNode, parentId: string | null) => {
    out.set(n.ref.id, { node: n, parentId });
    n.children.forEach((c) => walk(c, n.ref.id));
  };
  goals.forEach((g) => walk(g, null));
  return out;
}

export function ancestorIds(index: Map<string, Indexed>, id: string): string[] {
  const out: string[] = [];
  let p = index.get(id)?.parentId ?? null;
  while (p) {
    out.unshift(p);
    p = index.get(p)?.parentId ?? null;
  }
  return out;
}

const descendants = (n: TreeNode): string[] => n.children.flatMap((c) => [c.ref.id, ...descendants(c)]);

/**
 * The records to show for a set of the person's own records: each one, everything above it (the chain it serves)
 * and, for anything above activity level, everything under it.
 */
export function visibleFor(index: Map<string, Indexed>, own: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of own) {
    const x = index.get(id);
    if (!x) continue;
    out.add(id);
    ancestorIds(index, id).forEach((a) => out.add(a));
    descendants(x.node).forEach((d) => out.add(d));
  }
  return out;
}

/** Records owned by one position, for the owner filter. */
export const ownedBy = (index: Map<string, Indexed>, positionId: string): string[] =>
  [...index.values()].filter((x) => x.node.ownerPositionId === positionId).map((x) => x.node.ref.id);

const PROBLEM_STATUSES = new Set(['behind', 'at_risk', 'target_not_met']);

/** A record needs attention when something must be fixed or checked on it, or its progress is behind or at risk. */
export const needsAttention = (n: TreeNode, checks: Record<string, NodeChecks>): boolean => {
  const c = checks[n.ref.id] ?? NO_CHECKS;
  return c.mustFix > 0 || c.toCheck > 0 || (!!n.progress && PROBLEM_STATUSES.has(n.progress.status));
};

/** Whether a record or anything under it needs attention. */
export const branchNeedsAttention = (n: TreeNode, checks: Record<string, NodeChecks>): boolean =>
  needsAttention(n, checks) || n.children.some((c) => branchNeedsAttention(c, checks));

/**
 * "Worth checking" items shown on a row (section 8.5): its own, plus everything under it while it is closed, so
 * each count sits on the nearest open record. Items that must be fixed are never rolled up.
 */
export function toCheckOnRow(n: TreeNode, open: boolean, checks: Record<string, NodeChecks>): { count: number; below: boolean } {
  const own = (checks[n.ref.id] ?? NO_CHECKS).toCheck;
  if (open) return { count: own, below: false };
  const under = descendants(n).reduce((sum, id) => sum + (checks[id] ?? NO_CHECKS).toCheck, 0);
  return { count: own + under, below: under > 0 };
}

/**
 * Which records open by default on "Your part": everything above the person's own records, so their work is in
 * view. With `stopAboveKpi`, KPIs stay closed, so a supervisor starts at the team's KPIs (section 8.1).
 */
export function defaultOpen(index: Map<string, Indexed>, own: Iterable<string>, stopAboveKpi: boolean): Set<string> {
  const out = new Set<string>();
  for (const id of own) {
    for (const a of ancestorIds(index, id)) {
      if (stopAboveKpi && index.get(a)?.node.ref.kind === 'kpi') continue;
      out.add(a);
    }
  }
  return out;
}

/** "Find" (section 8.6): titles always, codes only when codes are shown. At most `limit` results, in tree order. */
export function findRecords(index: Map<string, Indexed>, query: string, codes: boolean, limit = 8): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [...index.values()]
    .map((x) => x.node)
    .filter((n) => n.ref.title.toLowerCase().includes(q) || (codes && n.ref.code.toLowerCase().includes(q)))
    .slice(0, limit);
}
