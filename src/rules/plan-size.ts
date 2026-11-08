/** The plan-size guide (contract v1.20): set by HR, each number off (null) by default; worth checking only, never blocking. */
import type { Store } from '../data/access/store';

export interface PlanSizeGuide { kpisPerObjective: number | null; activitiesPerKpi: number | null; objectivesPerContract: number | null }
export const GUIDE_OFF: PlanSizeGuide = { kpisPerObjective: null, activitiesPerKpi: null, objectivesPerContract: null };
export const guideOf = (s: Store): PlanSizeGuide => ({ ...GUIDE_OFF, ...(s.organisation.settings.planSizeGuide ?? {}) });
