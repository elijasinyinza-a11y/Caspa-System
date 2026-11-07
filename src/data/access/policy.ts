/**
 * Performance › Reviews › Scoring policy (v0.23.0; Scoring Policy and Personal Attributes Specification v0.1;
 * contract v1.15). HR drafts the policy for the next financial year; the Executive approves or returns it (A1, B7).
 * The policy in force is never edited: it is locked by the rounds it scores, and signed contracts keep their own.
 */
import type { FinancialYear, ISODate, ISODateTime, RatingScheme } from '../../contract/caspa-data-contract';
import { policyChecks, type PolicyCheck } from '../../rules/policy';
import { isApproved, schemeOf } from '../../rules/rating';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { en } from '../../strings/en';
import type { Store } from './store';
import type { Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; financialYear: FinancialYear; clock: () => ISODateTime; changed: () => void }

/** The editable shape. Thresholds are percentages here (120 = 120%); the record holds shares. */
export interface PolicyInput {
  method: 'bands' | 'weighted_points';
  cap: number | null; // percent
  labels: string[]; // five, score 5 first
  mins: number[]; // four, percent, score 5 first
  attrsOn: boolean;
  attrWeight: number;
  attrLevels: string[];
  attrs: { id: string; name: string; measures: string; levels: string[] }[];
  flagScoredOne: boolean;
  flagHigh: number; // percent
  countersignAll: boolean;
}
export interface PolicyView {
  canEdit: boolean;
  canDecide: boolean;
  canStart: boolean;
  inForce: PolicyInput & { year: FinancialYear | null };
  draft: (PolicyInput & { id: string; status: 'draft' | 'sent' | 'approved' | 'returned'; year: FinancialYear; sentBy: string | null; sentAt: string | null; decidedBy: string | null; decidedAt: string | null; returnReason: string | null }) | null;
  checks: PolicyCheck[];
}
export type PolicyResult = { ok: true } | { ok: false; error: string };

export interface PolicyAccess {
  visible(): boolean;
  view(): PolicyView;
  start(): PolicyResult;
  save(input: PolicyInput): PolicyResult;
  send(): PolicyResult;
  approve(): PolicyResult;
  returnToHr(reason: string): PolicyResult;
  needs(): NeedsYouItem[];
}

const pct = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10000) / 100);
export const toInput = (r: Pick<RatingScheme, 'bands' | 'competencySection' | 'highAchievementFlagAt' | 'scoringMethod' | 'achievementCap' | 'countersignAll' | 'flagScoredOne'>): PolicyInput => {
  const bands = [...r.bands].sort((a, b) => b.score - a.score);
  return {
    method: r.scoringMethod ?? 'bands', cap: pct(r.achievementCap ?? null), labels: bands.map((b) => b.label), mins: bands.slice(0, 4).map((b) => pct(b.minAchievement) ?? 0),
    attrsOn: r.competencySection.enabled, attrWeight: r.competencySection.weightPct, attrLevels: [...(r.competencySection.levelLabels ?? ['Outstanding', 'Commendable', 'Satisfactory', 'Needs improvement', 'Unsatisfactory'])],
    attrs: structuredClone(r.competencySection.attributes ?? []), flagScoredOne: r.flagScoredOne !== false, flagHigh: pct(r.highAchievementFlagAt) ?? 150, countersignAll: !!r.countersignAll,
  };
};
export const fromInput = (i: PolicyInput): Pick<RatingScheme, 'preset' | 'bands' | 'competencySection' | 'highAchievementFlagAt' | 'scoringMethod' | 'achievementCap' | 'countersignAll' | 'flagScoredOne'> => ({
  preset: 'custom',
  bands: [5, 4, 3, 2, 1].map((score, k) => ({ score: score as 1 | 2 | 3 | 4 | 5, label: (i.labels[k] ?? '').trim(), minAchievement: k < 4 ? (i.mins[k] ?? 0) / 100 : null })),
  competencySection: { enabled: i.attrsOn, weightPct: i.attrWeight, levelLabels: i.attrLevels.map((x) => x.trim()), attributes: i.attrs.map((a) => ({ id: a.id, name: a.name.trim(), measures: a.measures.trim(), levels: a.levels.map((x) => x.trim()) })) },
  highAchievementFlagAt: i.flagHigh / 100, scoringMethod: i.method, achievementCap: i.cap == null ? null : i.cap / 100, countersignAll: i.countersignAll, flagScoredOne: i.flagScoredOne,
});

export function createPolicyAccess(c: Ctx): PolicyAccess {
  const { s, viewer: v, financialYear: fy } = c;
  const isHr = v.roles.includes('hr');
  const isExec = v.roles.includes('executive');
  const next = (fy + 1) as FinancialYear;
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const who = (m: string | undefined) => s.people.find((p) => p.id === s.memberships.find((x) => x.id === m)?.personId)?.fullName ?? '';
  const draftRec = () => s.ratingSchemes.find((r) => r.approval && r.appliesFromYear === next);
  const audit = (action: string, id: string, before: unknown, after: unknown) =>
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type: 'RatingScheme', id }, before, after });
  const deny = (error: string): PolicyResult => ({ ok: false, error });

  return {
    visible: () => isHr || isExec,
    view() {
      const d = draftRec();
      const force = schemeOf(s);
      const status = d?.approval?.status ?? 'draft';
      return {
        canEdit: isHr && !!d && (status === 'draft' || status === 'returned'),
        canDecide: isExec && !!d && status === 'sent' && d.approval?.sent?.byMembershipId !== v.membershipId,
        canStart: isHr && !d,
        inForce: { ...toInput(force), year: s.ratingSchemes.find((r) => r.id === s.organisation.settings.ratingSchemeId)?.appliesFromYear ?? null },
        draft: d ? {
          ...toInput(d), id: d.id, status, year: next,
          sentBy: d.approval?.sent ? who(d.approval.sent.byMembershipId) : null, sentAt: d.approval?.sent?.at ?? null,
          decidedBy: d.approval?.decided ? who(d.approval.decided.byMembershipId) : null, decidedAt: d.approval?.decided?.at ?? null,
          returnReason: d.approval?.returnReason ?? null,
        } : null,
        checks: d ? policyChecks(d) : [],
      };
    },
    start() {
      if (!isHr || draftRec()) return deny('not_allowed');
      const st = stamp();
      const force = schemeOf(s);
      const rec: RatingScheme = {
        ...structuredClone(force), orgId: s.organisation.id, id: `rs-${next}` as never, preset: 'custom', lockedByCycleId: null,
        appliesFromYear: next, approval: { status: 'draft', sent: null, decided: null, returnReason: null }, created: st, updated: st,
      } as RatingScheme;
      s.ratingSchemes.push(rec);
      audit('create', rec.id, null, { appliesFromYear: next });
      c.changed();
      return { ok: true };
    },
    save(input) {
      const d = draftRec();
      const st = d?.approval?.status;
      if (!isHr || !d || (st !== 'draft' && st !== 'returned')) return deny('not_allowed');
      const before = toInput(d);
      Object.assign(d, fromInput(input));
      d.updated = stamp();
      audit('update', d.id, before, toInput(d));
      c.changed();
      return { ok: true };
    },
    send() {
      const d = draftRec();
      const st = d?.approval?.status;
      if (!isHr || !d || (st !== 'draft' && st !== 'returned')) return deny('not_allowed');
      if (policyChecks(d).length) return deny('must_fix');
      d.approval = { status: 'sent', sent: stamp(), decided: null, returnReason: null };
      audit('send', d.id, { status: st }, { status: 'sent' });
      c.changed();
      return { ok: true };
    },
    approve() {
      const d = draftRec();
      if (!isExec || !d || d.approval?.status !== 'sent' || d.approval.sent?.byMembershipId === v.membershipId) return deny('not_allowed');
      d.approval = { ...d.approval, status: 'approved', decided: stamp() };
      audit('approve', d.id, { status: 'sent' }, { status: 'approved' });
      c.changed();
      return { ok: true };
    },
    needs() {
      const d = draftRec();
      const st = d?.approval?.status;
      const item = (title: string, as: NeedsYouItem['as']): NeedsYouItem => ({ key: `policy:${d!.id}:${st}`, kind: 'approval', title, detail: null, due: null, daysOverdue: null, severity: null, as, link: { kind: 'reviews', tab: 'policy' } });
      if (st === 'sent' && isExec && d!.approval?.sent?.byMembershipId !== v.membershipId) return [item(en.policy.needs.approve(next), 'executive')];
      if (st === 'returned' && isHr) return [item(en.policy.needs.returned(next), 'hr')];
      return [];
    },
    returnToHr(reason) {
      const d = draftRec();
      if (!isExec || !d || d.approval?.status !== 'sent') return deny('not_allowed');
      if (!reason.trim()) return deny('reason_required');
      d.approval = { ...d.approval, status: 'returned', decided: stamp(), returnReason: reason.trim() };
      audit('return', d.id, { status: 'sent' }, { status: 'returned', reason: reason.trim() });
      c.changed();
      return { ok: true };
    },
  };
}

export { isApproved };
