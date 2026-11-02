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
  if (v.isBudgetHolder) add('plan'); // slice 5: budget holders link and review their own lines
  if (v.isDepartmentHead) add('strategy'); // part 11b: department heads fill in their department's 4Q sheet
  if (v.inConsultation) add('strategy'); // part 11c: the audience of an open consultation round has its say there
  if (v.writesCommunication) add('strategy'); // part 11e: goal owners and department heads reach the Communication page
  return WORKSPACE_ORDER.filter((w) => set.has(w));
}

/*
 * Sub-menus (Navigation Specification v1.1, BUILD-BRIEF section 37, NV-1 to NV-9). One menu model for every screen
 * (NV-7). An entry appears only when its page holds something the person may use (N-4); the inputs come from the
 * data-access layer, so the menu never grants access. At most four entries per workspace per person (N-5, NV-9),
 * reached by grouping: the formation stages share one entry, "Forming the next plan" (C-1).
 */
export const MENU_CAP = 4;
export type StrategyEntry = 'forming' | 'registers' | 'plan-document' | 'communication';
export type FormingStage = 'overview' | 'conception' | 'consultation' | 'composition';
export const FORMING_STAGES: FormingStage[] = ['overview', 'conception', 'consultation', 'composition'];
export type RegisterTab = 'baselines' | 'compliance';
export type OrganisationEntry = 'vacancies' | 'people';

export interface StrategyMenuInput {
  /** The plan being formed, as this person may work on it; null when nothing is being formed or nothing is theirs. */
  forming: null | {
    stages: FormingStage[];
    /** The furthest stage open now, among those this person sees; "overview" when none is open. */
    openStage: FormingStage;
    /** Only here to have their say in the open round: the entry is "Have your say", with no stage row. */
    audienceOnly: boolean;
  };
  registers: RegisterTab[];
  planDocument: boolean;
  communication: boolean;
}

export type MenuEntry =
  | { w: 'strategy'; entry: StrategyEntry; label: 'forming' | 'say' | 'registers' | 'plan-document' | 'communication' }
  | { w: 'organisation'; entry: OrganisationEntry; label: OrganisationEntry };

/** Strategy's entries, in fixed places (C-2): the temporary work first, then the lasting ones. */
export function strategyMenu(i: StrategyMenuInput): MenuEntry[] {
  const out: MenuEntry[] = [];
  if (i.forming && (i.forming.audienceOnly || i.forming.stages.length)) out.push({ w: 'strategy', entry: 'forming', label: i.forming.audienceOnly ? 'say' : 'forming' });
  if (i.registers.length) out.push({ w: 'strategy', entry: 'registers', label: 'registers' });
  if (i.planDocument) out.push({ w: 'strategy', entry: 'plan-document', label: 'plan-document' });
  if (i.communication) out.push({ w: 'strategy', entry: 'communication', label: 'communication' });
  return out.slice(0, MENU_CAP);
}

/** Organisation's entries beside its structure (the landing): vacancies, and people and access for administrators. */
export function organisationMenu(i: { vacancies: boolean; people: boolean }): MenuEntry[] {
  const out: MenuEntry[] = [];
  if (i.vacancies) out.push({ w: 'organisation', entry: 'vacancies', label: 'vacancies' });
  if (i.people) out.push({ w: 'organisation', entry: 'people', label: 'people' });
  return out;
}

/** The furthest open stage among those shown (Composition, then Consultation, then Conception), else the overview. */
export function openStageOf(shown: readonly FormingStage[], open: (st: Exclude<FormingStage, 'overview'>) => boolean): FormingStage {
  for (const st of ['composition', 'consultation', 'conception'] as const) if (shown.includes(st) && open(st)) return st;
  return 'overview';
}
