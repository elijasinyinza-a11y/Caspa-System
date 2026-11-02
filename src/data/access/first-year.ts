/**
 * The first year's cascade of a confirmed formed plan (BUILD-BRIEF section 35, D15-7 to D15-9).
 * - Before it is published, the year's work can be added under a KPI by those the Activity row allows (the
 *   objective's owner, the Strategy office, facilitators), with a 6P level (D15-8).
 * - The Strategy office publishes it once that year has begun. The usual checks apply and every attempt is recorded
 *   as a gate event. When it passes, the plan becomes active and the previously active plan is superseded (D15-9).
 * Screens show the draft year through a view of the store in which this plan counts as active (asIfActive).
 */
import type { Activity, AuditEntry, Id, ISODate, ISODateTime, SixPLevel, StrategicPlan } from '../../contract/caspa-data-contract';
import { nextActivityCode } from '../../rules/cascade-edit';
import { composition } from '../../rules/composition';
import { gateRecord } from '../../rules/gate';
import { isPublished, planChecks } from '../../rules/onboarding';
import { formatFinancialYear } from '../../selectors/format';
import { can } from './permissions';
import type { Store } from './store';
import { financialYearOf, type Viewer } from './viewer';

export interface FirstYearPage {
  planId: string;
  planTitle: string;
  financialYear: number;
  yearLabel: string;
  /** The year has begun, so it may be published. */
  begun: boolean;
  canPublish: boolean;
  /** What must be fixed before publishing, as messages. */
  blocks: string[];
  /** The last attempt was blocked. */
  lastBlocked: boolean;
}

export type FirstYearError = 'not_allowed' | 'not_found' | 'required' | 'not_begun' | 'invalid';
export type FirstYearResult<T = object> = ({ ok: true } & T) | { ok: false; error: FirstYearError };

export interface FirstYearAccess {
  /** The confirmed formed plan waiting for its first year to be published, or null. */
  page(): FirstYearPage | null;
  /** Whether this viewer may add work under this KPI in the draft year. */
  canAddActivity(kpiId: string): boolean;
  addActivity(kpiId: string, input: { title: string; level: SixPLevel; ownerPositionId: string; evidence: string }): FirstYearResult<{ id: string; code: string }>;
  publish(): FirstYearResult<{ passed: boolean }>;
  /** Positions to choose an activity's owner from. */
  positions(): { id: string; label: string }[];
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

/** A confirmed formed plan whose first year is not yet published. */
export const nextYearPlan = (s: Store): StrategicPlan | null =>
  [...s.plans].reverse().find((p) => p.entryDoor === 'formed' && p.status === 'confirmed' && !isPublished(s, p.id)) ?? null;

export function createFirstYearAccess(ctx: Ctx): FirstYearAccess {
  const { s, viewer, now, clock, audit } = ctx;
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const changed = () => ctx.onChange?.();
  const deny = <T,>(error: FirstYearError): FirstYearResult<T> => ({ ok: false, error });
  const isSO = viewer.roles.includes('strategy_office');
  const begun = (p: StrategicPlan) => financialYearOf(now, s.organisation.financialYearStartMonth) >= p.startYear;
  const kpiIn = (p: StrategicPlan, kpiId: string) => composition(s, p.id).kpis.find((k) => k.id === kpiId);
  const mayAdd = (p: StrategicPlan, kpiId: string) => {
    const k = kpiIn(p, kpiId);
    return !!k && can(s, viewer, 'draft', { type: 'Activity', id: k.objectiveId });
  };

  return {
    page() {
      const p = nextYearPlan(s);
      if (!p) return null;
      const c = planChecks(s, p, p.startYear);
      const last = s.gateEvents.filter((g) => g.gate === 'cascade.publish' && g.subject.id === p.id).pop();
      return {
        planId: p.id, planTitle: p.title, financialYear: p.startYear,
        yearLabel: formatFinancialYear(p.startYear, s.organisation.financialYearStartMonth),
        begun: begun(p), canPublish: isSO && begun(p),
        blocks: c.publishBlocks.map((f) => f.message),
        lastBlocked: last?.outcome === 'blocked',
      };
    },

    positions() {
      const unit = (u: string) => s.units.find((x) => x.id === u)?.name ?? '';
      return s.positions.map((p) => ({ id: p.id as string, label: s.positions.filter((x) => x.title === p.title).length > 1 ? `${p.title}, ${unit(p.unitId)}` : p.title }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    canAddActivity(kpiId) {
      const p = nextYearPlan(s);
      return !!p && mayAdd(p, kpiId);
    },

    addActivity(kpiId, input) {
      const p = nextYearPlan(s);
      if (!p) return deny('not_found');
      if (!kpiIn(p, kpiId)) return deny('not_found');
      if (!mayAdd(p, kpiId)) return deny('not_allowed');
      if (!input.title.trim() || !input.evidence.trim() || !input.level) return deny('required');
      if (!s.positions.some((x) => x.id === input.ownerPositionId)) return deny('required');
      const code = nextActivityCode(s, kpiId);
      const key = (s.organisation.id as string).replace(/^org-/, '');
      const used = new Set(s.activities.map((a) => a.id as string));
      let n = s.activities.length;
      let id: string;
      do id = `a-${key}-${++n}`; while (used.has(id));
      const a: Activity = {
        orgId: s.organisation.id, id: id as Id<'Activity'>, kpiId: kpiId as Id<'Kpi'>, financialYear: p.startYear, code, title: input.title.trim(),
        decisionLevel: input.level, ownerPositionId: input.ownerPositionId as Id<'Position'>, reportingFrequency: 'quarterly', evidence: input.evidence.trim(),
        quantityTarget: null, dependsOn: [], status: 'planned', draft: { state: 'human', provenance: { kind: 'manual' }, decided: stamp() },
        created: stamp(), updated: stamp(),
      };
      s.activities.push(a);
      audit('create', { type: 'Activity', id: a.id }, null, structuredClone(a));
      changed();
      return { ok: true, id: a.id, code };
    },

    publish() {
      const p = nextYearPlan(s);
      if (!p) return deny('not_found');
      if (!isSO) return deny('not_allowed');
      if (!begun(p)) return deny('not_begun');
      const c = planChecks(s, p, p.startYear);
      const passed = c.publishBlocks.length === 0;
      s.gateEvents.push({
        id: `ge-${s.gateEvents.length + 1}-${(s.organisation.id as string).replace(/^org-/, '')}` as Id<'GateEvent'>, orgId: s.organisation.id,
        gate: 'cascade.publish', subject: { type: 'StrategicPlan', id: p.id }, attempted: stamp(),
        ...gateRecord(s, { gate: 'cascade.publish', passes: passed, blocking: c.publishBlocks, advisory: [] }),
      });
      if (passed) {
        // D15-9: the new plan becomes active and the one it replaces is superseded (one active plan, C1).
        for (const old of s.plans.filter((x) => x.status === 'active' && x.id !== p.id)) {
          const before = structuredClone(old);
          old.status = 'superseded';
          old.updated = stamp();
          audit('supersede', { type: 'StrategicPlan', id: old.id }, before, structuredClone(old));
        }
        const before = structuredClone(p);
        p.status = 'active';
        p.updated = stamp();
        audit('activate', { type: 'StrategicPlan', id: p.id }, before, structuredClone(p));
      }
      changed();
      return { ok: true, passed };
    },
  };
}
