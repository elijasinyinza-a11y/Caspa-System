/**
 * The plan document's live content (BUILD-BRIEF section 35, D15-2 and D15-3). Pure: records in, content out.
 * Figures, names and tables come from the records each time the document is shown; only the narrative is stored.
 *
 * The layout (which parts appear, in what order, under which headings) is kept here, in one place, so a document
 * template can later replace it without touching the content or the rules (section 35, later item).
 */
import type { FourQCell, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { kpiBaseline } from '../rules/baseline';
import { CELLS, organisationSheet, isAccepted, sameCell } from '../rules/conception';
import { composition, isDecided, planYears } from '../rules/composition';
import { en } from '../strings/en';
import { formatFinancialYear } from './format';

/** The parts of the document, in order. A template would replace this list. */
export const PLAN_DOCUMENT_LAYOUT = ['vision', 'summary', 'where', 'goals', 'approval'] as const;
export type PlanDocumentPart = (typeof PLAN_DOCUMENT_LAYOUT)[number];

/**
 * Narrative text holding a number (D15-3): a plain note, never a check. Names of records (the plan's title, goal and
 * theme titles) may hold numbers and are not figures, so they are set aside first.
 */
export const holdsFigure = (text: string, names: readonly string[] = []) =>
  /\d/.test([...names].sort((a, b) => b.length - a.length).reduce((t, n) => (n ? t.split(n).join(' ') : t), text));

export interface PlanDocumentContent {
  vision: string;
  mission: string;
  years: string[];
  /** The accepted cards of the organisation's 4Q board, by band and section. `cards` is null where they may not be read. */
  where: { band: string; sections: { name: string; cards: string[] | null; count: number }[] }[];
  goals: {
    id: string;
    code: string;
    title: string;
    objectives: {
      code: string;
      title: string;
      owner: string | null;
      kpis: { code: string; name: string; unit: string; lowerIsBetter: boolean; baseline: number | null; targets: (number | null)[]; owner: string | null }[];
    }[];
  }[];
}

export function planDocumentContent(s: Store, plan: StrategicPlan, seesCard: (id: string) => boolean): PlanDocumentContent {
  const r = composition(s, plan.id);
  const years = planYears(plan);
  const title = (pid: string | null) => (pid ? s.positions.find((p) => p.id === pid)?.title ?? null : null);
  const vision = s.visionStatements.find((v) => v.planId === plan.id && v.kind === 'vision' && v.confirmation)?.text ?? '';
  const mission = s.visionStatements.find((v) => v.planId === plan.id && v.kind === 'mission' && v.confirmation)?.text ?? '';
  const board = organisationSheet(s, plan.id).filter(isAccepted);
  const bands = [...new Set(CELLS.map((c) => c.band))];
  return {
    vision, mission,
    years: years.map((fy) => formatFinancialYear(fy, s.organisation.financialYearStartMonth)),
    where: bands.map((band) => ({
      band: en.fourQ.band[band],
      sections: CELLS.filter((c) => c.band === band).map((c: FourQCell) => {
        const cards = board.filter((e) => sameCell(e.cell, c));
        return { name: en.fourQ.cellName(c), cards: cards.every((e) => seesCard(e.id)) ? cards.map((e) => e.text) : null, count: cards.length };
      }),
    })),
    goals: [...r.goals].filter((g) => isDecided(g.draft)).sort(byCode).map((g) => ({
      id: g.id, code: g.code, title: g.title,
      objectives: r.objectives.filter((o) => o.goalId === g.id && isDecided(o.draft)).sort(byCode).map((o) => ({
        code: o.code, title: o.title, owner: title(o.ownerPositionId),
        kpis: r.kpis.filter((k) => k.objectiveId === o.id && isDecided(k.draft)).sort(byCode).map((k) => ({
          code: k.code, name: k.name, unit: k.unit, lowerIsBetter: k.direction === 'lower_is_better', baseline: kpiBaseline(s, k),
          targets: years.map((fy) => s.kpiTargets.find((t) => t.kpiId === k.id && t.financialYear === fy)?.target ?? null),
          owner: title(k.ownerPositionId),
        })),
      })),
    })),
  };
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en', { numeric: true });
