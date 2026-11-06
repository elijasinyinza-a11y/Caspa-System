/**
 * The sub-menus for one person (Navigation Specification v1.1, BUILD-BRIEF section 37). Built from what the
 * data-access layer already returns for that person, so an entry shows only when its page holds something they may
 * use (N-4) and the menu grants nothing. The rule itself is in src/selectors/nav.ts.
 */
import { formationInProgress } from '../../rules/formation';
import {
  openStageOf, organisationMenu, performanceMenu, strategyMenu, type FormingStage, type MenuEntry, type RegisterTab, type StrategyMenuInput,
} from '../../selectors/nav';
import type { Repository } from './repository';
import type { Store } from './store';

export interface Menu {
  strategy: MenuEntry[];
  organisation: MenuEntry[];
  /** v0.18.0: Progress updates. */
  performance: MenuEntry[];
  /** Forming the next plan: its stages for this person, the one open now, and whether it is only "Have your say". */
  forming: StrategyMenuInput['forming'];
  /** The register tabs, in the order this person opens them. */
  registers: RegisterTab[];
  /** The plan being formed is confirmed, so its stages are read-only until it is active (NV-4). */
  formingConfirmed: boolean;
}

export function menuFor(repo: Repository, s: Store): Menu {
  const has = repo.workspaces().includes('strategy');
  const f = has ? repo.formation.page() : null;
  const c = has ? repo.conception.page() : null;
  const room = has ? repo.consultation.room() : null;
  const bl = has ? repo.consultation.baselines() : null;
  const cp = has ? repo.consultation.compliance() : null;
  const comp = has ? repo.composition.page() : null;
  const pdoc = has ? repo.planDocument.page() : null;
  const v = repo.viewer;
  const mine = c ? c.myDepartments.length > 0 : false;

  let forming: Menu['forming'] = null;
  const plan = formationInProgress(s);
  if (has && f?.plan && plan) {
    const audienceOnly = !!room && room.canComment && !room.canRun && !c?.seesAll && !mine;
    const composes = !!comp && (comp.runs || !!c?.seesAll || mine || v.roles.includes('finance') || comp.goals.some((g) => g.objectives.some((o) => o.canAddKpi)));
    const stages: FormingStage[] = audienceOnly ? ['consultation'] : [
      'overview',
      ...(c ? ['conception' as const] : []),
      ...(room ? ['consultation' as const] : []),
      ...(composes ? ['composition' as const] : []),
    ];
    const open = (st: 'conception' | 'consultation' | 'composition') => plan.formation?.[st]?.status === 'open';
    forming = { stages, openStage: audienceOnly ? 'consultation' : openStageOf(stages, open), audienceOnly };
  }
  const baselines = !!bl && (bl.rows.length > 0 || bl.canRun || bl.ownUnits.length > 0 || !!c?.seesAll);
  const compliance = !!cp && (cp.canAdd || cp.canReview || !!c?.seesAll || mine);
  // NV-3: the compliance officer opens on Compliance.
  const complianceFirst = !!cp?.canReview && !c?.seesAll;
  const registers: RegisterTab[] = [
    ...(complianceFirst && compliance ? ['compliance' as const] : []),
    ...(baselines ? ['baselines' as const] : []),
    ...(!complianceFirst && compliance ? ['compliance' as const] : []),
  ];
  const strategy = has ? strategyMenu({
    forming, registers,
    planDocument: !!pdoc && (pdoc.canDraft || !!pdoc.document),
    communication: repo.communication.page().plans.length > 0,
  }) : [];
  const org = repo.structure.page();
  const organisation = org.mode === 'structure' ? organisationMenu({ vacancies: !!repo.structure.vacancies(), people: org.isAdmin }) : [];
  // N-4 from what the data-access layer returns: the person's own contract to report on, or someone's updates to verify.
  const pp = repo.workspaces().includes('performance') ? repo.progress.page() : null;
  const performance = performanceMenu({ progress: !!pp && (pp.mine !== null || pp.verify !== null), reviews: !!pp && repo.reviews.page().tabs.length > 0 });
  return { strategy, organisation, performance, forming, registers, formingConfirmed: plan?.status === 'confirmed' };
}
