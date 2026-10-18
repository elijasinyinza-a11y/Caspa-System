/** Workspaces a person sees: the union across all their roles and derived relations (shell decision C). Pure. */
import type { WorkspaceKey } from '../strings/en';
import type { Viewer } from '../data/access/viewer';

export const WORKSPACE_ORDER: WorkspaceKey[] = ['home', 'strategy', 'cascade', 'plan', 'performance'];

export function workspacesFor(v: Viewer): WorkspaceKey[] {
  const set = new Set<WorkspaceKey>(['home']);
  const add = (...w: WorkspaceKey[]) => w.forEach((x) => set.add(x));
  if (v.roles.includes('executive') || v.roles.includes('strategy_office')) add('strategy', 'cascade', 'plan', 'performance');
  if (v.roles.includes('finance')) add('strategy', 'cascade', 'plan');
  if (v.roles.includes('hr')) add('performance');
  if (v.roles.includes('facilitator')) add('strategy', 'cascade');
  if (v.roles.includes('compliance')) add('strategy');
  if (v.isSupervisor) add('cascade', 'performance');
  if (v.hasContract) add('performance');
  return WORKSPACE_ORDER.filter((w) => set.has(w));
}
