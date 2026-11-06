/**
 * Performance › Reviews data access (v0.20.0; Reviews Specification v0.1; contract v1.12). Every score is computed by
 * src/rules/rating.ts and every step by src/rules/review.ts. Visibility follows the Review row: the employee, the
 * supervisor, the next-level reviewer and HR only; nobody else sees scores here (section 17).
 */
import type { FinancialYear, ISODate, ISODateTime, PerformanceContract, Review } from '../../contract/caspa-data-contract';
import { rateContract, type ObjectiveRating } from '../../rules/rating';
import { finalPeriodPending } from '../../rules/targets';
import { closeBlocks, completeBlocks, holdersOf, needsCheck, reviewerPositionOf, stepOf, supervisorPositionOf, type ReviewStep } from '../../rules/review';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { formatDate } from '../../selectors/format';
import { en } from '../../strings/en';
import type { Device } from './device';
import type { Store } from './store';
import type { Viewer } from './viewer';

const R = en.reviews;

interface Ctx {
  s: Store;
  viewer: Viewer;
  now: ISODate;
  financialYear: FinancialYear;
  clock: () => ISODateTime;
  device: Device;
  changed: () => void;
}

export type ReviewTab = 'mine' | 'team' | 'check' | 'round';
export interface ObjectiveLine {
  id: string;
  title: string;
  weightPct: number;
  lower: boolean;
  done: number | null;
  target: number | null;
  unit: string;
  achievement: number | null;
  bandScore: number | null;
  score: number | null;
  label: string | null;
  verifiedOn: ISODate | null;
  adjustment: { delta: -1 | 1; reason: string; by: string } | null;
  cantAssess: { reason: string; accepted: boolean } | null;
  basis: ObjectiveRating['basis'];
}
export interface ReviewView {
  id: string;
  person: string;
  firstName: string;
  position: string;
  supervisor: string;
  reviewer: string;
  kind: Review['kind'];
  step: ReviewStep | 'waiting_to_send';
  due: ISODate | null;
  objectives: ObjectiveLine[];
  overall: { score: number; label: string; provisional: boolean } | null;
  scoredWeightPct: number;
  totalWeightPct: number;
  flags: { kind: string; title: string }[];
  self: { text: string; submitted: boolean };
  sentBack: string | null;
  returned: { reason: string; by: string } | null;
  assessment: string | null;
  acknowledgement: { disagreement: string | null } | null;
  can: { writeSelf: boolean; supervise: boolean; check: boolean; acknowledge: boolean };
  blocks: string[]; // shown to the supervisor before completing
  /** TG-11: which quarter a quarterly review covers, and the year's earlier scores. */
  periodEnd: ISODate | null;
  history: { kind: Review['kind']; periodEnd: ISODate | null; score: number | null }[];
  /** TG-8: final-period figures sent but not verified (year-end reviews only). */
  finalPending: number;
}
export interface RoundView {
  open: { kind: Review['kind']; periodEnd: ISODate | null; reviews: number; byStep: { step: string; n: number }[] } | null;
  waiting: { reviewId: string; contractObjectiveId: string; title: string; person: string; reason: string; askedBy: string }[];
  canOpen: { kind: Review['kind']; periodEnd: ISODate | null }[];
  canClose: boolean;
  closeBlocks: string[];
  closed: boolean;
  finalPending: number;
}
export interface ReviewsPage {
  tabs: ReviewTab[];
  opensOn: ReviewTab;
  financialYear: FinancialYear;
  yearShare: number;
  mine: ReviewView[];
  team: ReviewView[];
  check: ReviewView[];
  round: RoundView | null;
}
export type ReviewResult = { ok: true; note?: string } | { ok: false; error: string };

export interface ReviewsAccess {
  page(): ReviewsPage;
  review(id: string): ReviewView | null;
  needs(): NeedsYouItem[];
  hasAny(): boolean;
  saveSelf(id: string, text: string): ReviewResult;
  submitSelf(id: string, text: string): ReviewResult & { queued?: boolean };
  sendWaiting(): number;
  adjust(id: string, contractObjectiveId: string, delta: -1 | 0 | 1, reason: string): ReviewResult;
  askCantAssess(id: string, contractObjectiveId: string, reason: string): ReviewResult;
  sendBack(id: string, reason: string): ReviewResult;
  complete(id: string, assessment: string): ReviewResult;
  accept(id: string): ReviewResult;
  returnToSupervisor(id: string, reason: string): ReviewResult;
  acknowledge(id: string, disagreement: string): ReviewResult;
  decideCantAssess(id: string, contractObjectiveId: string, accept: boolean): ReviewResult;
  openRound(kind: Review['kind'], periodEnd?: ISODate | null): ReviewResult;
  closeRound(): ReviewResult;
}

export function createReviewsAccess(c: Ctx): ReviewsAccess {
  const { s, viewer: v, now, financialYear: fy, device } = c;
  const me = v.membershipId as string;
  const isHr = v.roles.includes('hr');
  const mine = (pos: string | null) => !!pos && v.positionIds.includes(pos as never);
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const personName = (id: string) => s.people.find((p) => p.id === id)?.fullName ?? '';
  const holderName = (pos: string | null) => holdersOf(s, pos, now).map(personName)[0] ?? '';
  const contractOf = (r: Review) => s.contracts.find((x) => x.id === r.contractId)!;
  const yearReviews = () => s.reviews.filter((r) => s.contracts.find((x) => x.id === r.contractId)?.financialYear === fy);
  const pendingSelf = () => (device.reviewSelf ?? []).filter((x) => x.membershipId === me);
  const audit = (action: string, r: Review, before: unknown, after: unknown) => {
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type: 'Review', id: r.id }, before, after });
  };
  // TG-8: worth-checking items at a gate are recorded with no acknowledgement, as at the budget gate (section 19).
  const gate = (code: 'review.submit_self' | 'review.complete' | 'appraisal.close', subject: { type: string; id: string }, outcome: 'passed' | 'blocked', keys: string[], advisory: string[] = []) => {
    s.gateEvents.push({ id: `ge-${s.gateEvents.length + 1}` as never, orgId: s.organisation.id, gate: code, subject, attempted: stamp(), outcome, blockingFindingKeys: keys, advisoryAtGate: advisory.map((findingKey) => ({ findingKey, acknowledgementId: null })) });
  };
  const due = (code: string) => {
    const cyc = s.cycles.find((x) => x.financialYear === fy && x.kind === 'appraisal');
    return (cyc?.gateDueDates as Record<string, ISODate> | undefined)?.[code] ?? null;
  };
  const roles = (r: Review) => {
    const ct = contractOf(r);
    return {
      employee: ct.personId === v.personId,
      supervisor: mine(supervisorPositionOf(s, ct)),
      reviewer: mine(reviewerPositionOf(s, ct, now)),
    };
  };
  const visible = (r: Review) => { const x = roles(r); return x.employee || x.supervisor || x.reviewer || isHr; };
  const sentBackReason = (r: Review) => {
    if (r.status !== 'open') return null;
    const e = [...s.auditEntries].reverse().find((a) => a.entity.type === 'Review' && a.entity.id === r.id && a.action === 'send_back');
    return e ? ((e.after as { reason?: string })?.reason ?? null) : null;
  };

  /** An earlier review's score, as it stood: computed live for that review's own objectives (provisional). */
  const scoreAt = (x: Review) => { const rt = rateContract(s, x.contractId, { now: x.periodEnd ?? now }); return rt?.overall ?? null; };
  const sharesIn = (contractIds: string[]) => s.contractObjectives.filter((co) => contractIds.includes(co.contractId) && co.sourceShareId).map((co) => co.sourceShareId as string);
  const pendingFor = (contractIds: string[]) => { const p = finalPeriodPending(s, contractIds, sharesIn(contractIds), fy); return p.updates.length + p.readings.length; };
  const view = (r: Review): ReviewView => {
    const ct = contractOf(r);
    const rating = rateContract(s, ct.id, { now });
    const who = roles(r);
    const waiting = who.employee && pendingSelf().some((x) => x.reviewId === r.id);
    const objectives: ObjectiveLine[] = (rating?.objectives ?? []).map((o) => {
      const co = s.contractObjectives.find((x) => x.id === o.contractObjectiveId)!;
      const latest = s.progressUpdates.filter((u) => u.contractObjectiveId === co.id && u.verified && u.periodEnd <= now).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
      const adj = [...r.adjustments].reverse().find((a) => a.contractObjectiveId === co.id);
      const na = r.notAssessable.find((n) => n.contractObjectiveId === co.id);
      return {
        id: co.id, title: co.snapshot?.title ?? co.title, weightPct: co.weightPct, lower: co.direction === 'lower_is_better',
        done: o.done, target: o.target, unit: (co.snapshot?.quantityTarget ?? co.quantityTarget)?.unit ?? '',
        achievement: o.achievement === null || Number.isFinite(o.achievement) ? o.achievement : null, bandScore: o.bandScore, score: o.score,
        label: o.score === null ? null : (s.ratingSchemes[0]?.bands.find((b) => b.score === o.score)?.label ?? null), verifiedOn: latest?.periodEnd ?? null,
        adjustment: adj ? { delta: adj.bandDelta, reason: adj.reason, by: personName(s.memberships.find((m) => m.id === adj.by.byMembershipId)?.personId ?? '') } : null,
        cantAssess: na ? { reason: na.reason, accepted: !!na.hrApproval } : null, basis: o.basis,
      };
    });
    const step = waiting ? 'waiting_to_send' : stepOf(s, r, now);
    const showAssessment = r.status === 'completed' || who.supervisor || who.reviewer || isHr;
    return {
      id: r.id, person: personName(ct.personId), firstName: personName(ct.personId).split(' ')[0] ?? '', position: s.positions.find((p) => p.id === ct.positionId)?.title ?? '',
      supervisor: holderName(supervisorPositionOf(s, ct)), reviewer: holderName(reviewerPositionOf(s, ct, now)), kind: r.kind, step,
      due: due('review.complete'), objectives,
      overall: rating && rating.overall !== null && rating.labelScore !== null ? { score: rating.overall, label: rating.label ?? '', provisional: rating.provisional } : null,
      scoredWeightPct: rating?.scoredWeightPct ?? 0, totalWeightPct: rating?.totalWeightPct ?? 0,
      // Flags reach the next-level reviewer and HR only, never the employee as a warning about themselves.
      flags: who.reviewer || isHr ? (rating?.flags ?? []).map((f) => ({ kind: f.kind, title: objectives.find((o) => o.id === f.contractObjectiveId)?.title ?? '' })) : [],
      self: { text: (who.employee || r.selfAssessment?.submitted) ? (r.selfAssessment?.text ?? '') : '', submitted: !!r.selfAssessment?.submitted },
      sentBack: sentBackReason(r),
      returned: r.returnedByReviewer && r.status === 'self_submitted' ? { reason: r.returnedByReviewer.reason, by: personName(s.memberships.find((m) => m.id === r.returnedByReviewer!.by.byMembershipId)?.personId ?? '') } : null,
      assessment: showAssessment ? (r.supervisorAssessment?.text ?? null) : null,
      acknowledgement: r.employeeAcknowledgement ? { disagreement: r.employeeAcknowledgement.disagreement } : null,
      can: {
        writeSelf: who.employee && r.status === 'open' && !waiting,
        supervise: who.supervisor && r.status === 'self_submitted',
        check: who.reviewer && needsCheck(s, r, now),
        acknowledge: who.employee && r.status === 'completed' && !needsCheck(s, r, now) && !r.employeeAcknowledgement,
      },
      periodEnd: r.periodEnd ?? null,
      history: s.reviews.filter((x) => x.contractId === r.contractId && x.id !== r.id && (x.created.at < r.created.at)).map((x) => ({ kind: x.kind, periodEnd: x.periodEnd ?? null, score: x.finalResult?.overallScore ?? scoreAt(x) })),
      finalPending: r.kind === 'annual' && (who.supervisor || isHr) ? pendingFor([ct.id]) : 0,
      blocks: who.supervisor && r.status === 'self_submitted'
        ? completeBlocks(s, r, r.supervisorAssessment?.text ?? 'x', now).flatMap((b) => (b.kind === 'no_assessment' ? [] : [R.blocks[b.kind](objectives.find((o) => o.id === b.contractObjectiveId)?.title ?? '')]))
        : [],
    };
  };

  const page = (): ReviewsPage => {
    const all = yearReviews().filter(visible);
    const mineR = all.filter((r) => roles(r).employee).map(view);
    const team = all.filter((r) => roles(r).supervisor).map(view);
    const check = all.filter((r) => roles(r).reviewer && (needsCheck(s, r, now) || r.reviewerCheck)).map(view);
    const round = isHr ? roundView() : null;
    const tabs: ReviewTab[] = [];
    if (mineR.length) tabs.push('mine');
    if (team.length) tabs.push('team');
    if (all.some((r) => roles(r).reviewer)) tabs.push('check');
    if (isHr) tabs.push('round');
    const todo = (t: ReviewTab) => (t === 'mine' ? mineR.some((x) => x.can.writeSelf || x.can.acknowledge) : t === 'team' ? team.some((x) => x.can.supervise) : t === 'check' ? check.some((x) => x.can.check) : !!round && (round.waiting.length > 0 || round.canClose));
    const opensOn = tabs.find(todo) ?? tabs[0] ?? 'mine';
    const start = new Date(Date.UTC(fy, s.organisation.financialYearStartMonth - 1, 1)).getTime();
    const end = new Date(Date.UTC(fy + 1, s.organisation.financialYearStartMonth - 1, 1)).getTime();
    const yearShare = Math.min(1, Math.max(0, (Date.parse(now) - start) / (end - start)));
    return { tabs, opensOn, financialYear: fy, yearShare, mine: mineR, team, check, round };
  };

  const roundView = (): RoundView => {
    const reviews = yearReviews();
    // The current round: year-end once opened, otherwise the latest opened mid-year or quarter (TG-11).
    const active = reviews.filter((r) => !r.finalResult);
    const latest = [...active].sort((a, b) => (a.kind === 'annual' ? 1 : 0) - (b.kind === 'annual' ? 1 : 0) || String(a.periodEnd ?? '').localeCompare(String(b.periodEnd ?? '')) || a.created.at.localeCompare(b.created.at)).pop();
    const kind = latest?.kind ?? null;
    const open = active.filter((r) => r.kind === kind && (r.periodEnd ?? null) === (latest?.periodEnd ?? null));
    const steps = ['awaiting_self', 'awaiting_supervisor', 'being_checked', 'awaiting_acknowledgement', 'acknowledged'] as const;
    const signed = s.contracts.filter((x) => x.financialYear === fy && x.status === 'signed');
    const busy = open.some((r) => r.status !== 'completed');
    const has = (k: Review['kind'], pe: ISODate | null) => reviews.some((r) => r.kind === k && (r.periodEnd ?? null) === pe);
    const next: { kind: Review['kind']; periodEnd: ISODate | null }[] = [];
    if (s.organisation.settings.reviewModel === 'quarterly') {
      const start = s.organisation.financialYearStartMonth;
      const q = [3, 6, 9].map((m) => new Date(Date.UTC(fy, start - 1 + m, 0)).toISOString().slice(0, 10) as ISODate);
      const due = q.find((pe) => !has('quarterly', pe));
      if (due && due <= now) next.push({ kind: 'quarterly', periodEnd: due });
      else if (!due && !has('annual', null)) next.push({ kind: 'annual', periodEnd: null });
    } else {
      if (!has('mid_year', null)) next.push({ kind: 'mid_year', periodEnd: null });
      else if (!has('annual', null)) next.push({ kind: 'annual', periodEnd: null });
    }
    const canOpen = busy || signed.length === 0 ? [] : next;
    const blocks = closeBlocks(s, open, now);
    return {
      open: kind ? { kind, periodEnd: latest?.periodEnd ?? null, reviews: open.length, byStep: steps.map((st) => ({ step: st, n: open.filter((r) => stepOf(s, r, now) === st).length })) } : null,
      waiting: open.flatMap((r) => r.notAssessable.filter((n) => !n.hrApproval).map((n) => {
        const co = s.contractObjectives.find((x) => x.id === n.contractObjectiveId);
        const asked = [...s.auditEntries].reverse().find((a) => a.entity.id === r.id && a.action === 'ask_cant_assess');
        return { reviewId: r.id, contractObjectiveId: n.contractObjectiveId, title: co?.snapshot?.title ?? co?.title ?? '', person: personName(contractOf(r).personId), reason: n.reason, askedBy: personName(s.memberships.find((m) => m.id === asked?.actorMembershipId)?.personId ?? '') };
      })),
      canOpen,
      canClose: kind === 'annual' && open.length > 0 && blocks.length === 0,
      closeBlocks: kind === 'annual' ? blocks.map((b) => R.round.block[b.kind]!(b.count)) : [],
      closed: reviews.some((r) => r.kind === 'annual' && !!r.finalResult) && !open.some((r) => r.kind === 'annual'),
      finalPending: kind === 'annual' ? pendingFor(open.map((r) => r.contractId as string)) : 0,
    };
  };

  const find = (id: string) => yearReviews().find((r) => r.id === id);
  const deny = (error: string): ReviewResult => ({ ok: false, error });
  const touch = (r: Review) => { r.updated = stamp(); c.changed(); };

  const deliverSelf = (r: Review, text: string, offline: boolean) => {
    const before = structuredClone(r.selfAssessment);
    r.selfAssessment = { text, submitted: stamp(), capturedOffline: offline };
    r.status = 'self_submitted';
    gate('review.submit_self', { type: 'Review', id: r.id }, 'passed', []);
    audit('submit_self', r, before, r.selfAssessment);
  };

  return {
    page,
    review: (id) => { const r = find(id); return r && visible(r) ? view(r) : null; },
    hasAny: () => yearReviews().some(visible) || isHr,
    needs() {
      const out: NeedsYouItem[] = [];
      const link = (id: string) => ({ kind: 'reviews' as const, reviewId: id });
      for (const r of yearReviews().filter(visible)) {
        const w = roles(r);
        if (w.employee && r.status === 'completed' && !needsCheck(s, r, now) && !r.employeeAcknowledgement) {
          out.push({ key: `review:ack:${r.id}`, kind: 'deadline', title: R.needs.acknowledge, detail: null, due: due('review.complete'), daysOverdue: null, severity: null, as: 'employee', link: link(r.id) });
        }
      }
      const checks = yearReviews().filter((r) => roles(r).reviewer && needsCheck(s, r, now));
      if (checks.length) out.push({ key: 'review:check', kind: 'approval', title: R.needs.check(checks.length), detail: null, due: null, daysOverdue: null, severity: null, as: null, link: { kind: 'reviews', tab: 'check' } });
      if (isHr) {
        const rv = roundView();
        if (rv.waiting.length) out.push({ key: 'review:cant_assess', kind: 'approval', title: R.needs.approve(rv.waiting.length), detail: null, due: null, daysOverdue: null, severity: null, as: 'hr', link: { kind: 'reviews', tab: 'round' } });
        if (rv.canClose) out.push({ key: 'review:close', kind: 'deadline', title: R.needs.close, detail: null, due: due('appraisal.close'), daysOverdue: null, severity: null, as: 'hr', link: { kind: 'reviews', tab: 'round' } });
      }
      return out;
    },
    saveSelf(id, text) {
      const r = find(id);
      if (!r || !roles(r).employee || r.status !== 'open') return deny('not_allowed');
      r.selfAssessment = { text, submitted: null, capturedOffline: false };
      touch(r);
      return { ok: true };
    },
    submitSelf(id, text) {
      const r = find(id);
      if (!r || !roles(r).employee || r.status !== 'open') return deny('not_allowed');
      if (!text.trim()) return deny('text_required');
      if (device.offline[me]) {
        (device.reviewSelf ??= []).push({ membershipId: me, reviewId: id, text: text.trim() });
        r.selfAssessment = { text: text.trim(), submitted: null, capturedOffline: true };
        c.changed();
        return { ok: true, queued: true };
      }
      deliverSelf(r, text.trim(), false);
      touch(r);
      return { ok: true };
    },
    sendWaiting() {
      let n = 0;
      for (const x of pendingSelf()) {
        const r = find(x.reviewId);
        if (r && r.status === 'open') { deliverSelf(r, x.text, true); n++; }
      }
      device.reviewSelf = (device.reviewSelf ?? []).filter((x) => x.membershipId !== me);
      if (n) c.changed();
      return n;
    },
    adjust(id, coId, delta, reason) {
      const r = find(id);
      if (!r || !roles(r).supervisor || r.status !== 'self_submitted') return deny('not_allowed');
      if (delta !== 0 && !reason.trim()) return deny('reason_required');
      const before = structuredClone(r.adjustments);
      r.adjustments = r.adjustments.filter((a) => a.contractObjectiveId !== coId);
      if (delta !== 0) r.adjustments.push({ contractObjectiveId: coId as never, bandDelta: delta, reason: reason.trim(), by: stamp() });
      audit('adjust', r, before, r.adjustments);
      touch(r);
      return { ok: true };
    },
    askCantAssess(id, coId, reason) {
      const r = find(id);
      if (!r || !roles(r).supervisor || r.status !== 'self_submitted') return deny('not_allowed');
      if (!reason.trim()) return deny('reason_required');
      r.notAssessable = [...r.notAssessable.filter((n) => n.contractObjectiveId !== coId), { contractObjectiveId: coId as never, reason: reason.trim(), hrApproval: null }];
      audit('ask_cant_assess', r, null, { contractObjectiveId: coId, reason: reason.trim() });
      touch(r);
      return { ok: true };
    },
    sendBack(id, reason) {
      const r = find(id);
      if (!r || !roles(r).supervisor || r.status !== 'self_submitted') return deny('not_allowed');
      if (!reason.trim()) return deny('reason_required');
      const before = { status: r.status };
      r.status = 'open';
      if (r.selfAssessment) r.selfAssessment = { ...r.selfAssessment, submitted: null };
      audit('send_back', r, before, { status: 'open', reason: reason.trim() });
      touch(r);
      return { ok: true };
    },
    complete(id, assessment) {
      const r = find(id);
      if (!r || !roles(r).supervisor || r.status !== 'self_submitted') return deny('not_allowed');
      const blocks = completeBlocks(s, r, assessment, now);
      if (blocks.length) { gate('review.complete', { type: 'Review', id }, 'blocked', blocks.map((b) => `review:${b.kind}`)); c.changed(); return deny('blocked'); }
      const pending = r.kind === 'annual' ? finalPeriodPending(s, [r.contractId], sharesIn([r.contractId]), fy) : { updates: [], readings: [] };
      r.supervisorAssessment = { text: assessment.trim(), completed: stamp() };
      r.status = 'completed';
      r.returnedByReviewer = null;
      r.reviewerCheck = null;
      gate('review.complete', { type: 'Review', id }, 'passed', [], [...pending.updates, ...pending.readings].map((x) => `final-period:${x}`));
      audit('complete', r, { status: 'self_submitted' }, { status: 'completed' });
      touch(r);
      const flagged = needsCheck(s, r, now);
      return { ok: true, note: flagged ? holderName(reviewerPositionOf(s, contractOf(r), now)) : undefined };
    },
    accept(id) {
      const r = find(id);
      if (!r || !roles(r).reviewer || !needsCheck(s, r, now)) return deny('not_allowed');
      r.reviewerCheck = { by: stamp() };
      audit('reviewer_check', r, null, r.reviewerCheck);
      touch(r);
      return { ok: true };
    },
    returnToSupervisor(id, reason) {
      const r = find(id);
      if (!r || !roles(r).reviewer || !needsCheck(s, r, now)) return deny('not_allowed');
      if (!reason.trim()) return deny('reason_required');
      r.returnedByReviewer = { reason: reason.trim(), by: stamp() };
      r.status = 'self_submitted';
      audit('return', r, { status: 'completed' }, { status: 'self_submitted', reason: reason.trim() });
      touch(r);
      return { ok: true };
    },
    acknowledge(id, disagreement) {
      const r = find(id);
      if (!r || !roles(r).employee || r.status !== 'completed' || needsCheck(s, r, now) || r.employeeAcknowledgement) return deny('not_allowed');
      r.employeeAcknowledgement = { at: c.clock(), disagreement: disagreement.trim() || null };
      audit('acknowledge', r, null, r.employeeAcknowledgement);
      touch(r);
      return { ok: true };
    },
    decideCantAssess(id, coId, accept) {
      const r = find(id);
      if (!r || !isHr) return deny('not_allowed');
      const n = r.notAssessable.find((x) => x.contractObjectiveId === coId && !x.hrApproval);
      if (!n) return deny('not_allowed');
      if (accept) n.hrApproval = stamp();
      else r.notAssessable = r.notAssessable.filter((x) => x !== n);
      audit(accept ? 'accept_cant_assess' : 'refuse_cant_assess', r, null, { contractObjectiveId: coId });
      touch(r);
      return { ok: true };
    },
    openRound(kind, periodEnd = null) {
      if (!isHr || !roundView().canOpen.some((x) => x.kind === kind && x.periodEnd === (periodEnd ?? null))) return deny('not_allowed');
      const st = stamp();
      for (const ct of s.contracts.filter((x) => x.financialYear === fy && x.status === 'signed') as PerformanceContract[]) {
        if (s.reviews.some((r) => r.contractId === ct.id && r.kind === kind && (r.periodEnd ?? null) === (periodEnd ?? null))) continue;
        s.reviews.push({
          orgId: s.organisation.id, id: `rv-${ct.id}-${kind}${periodEnd ? `-${periodEnd}` : ''}` as never, contractId: ct.id, kind, periodEnd: periodEnd ?? null, selfAssessment: null, supervisorAssessment: null, status: 'open',
          adjustments: [], notAssessable: [], competencyRatings: [], returnedByReviewer: null, reviewerCheck: null, employeeAcknowledgement: null, finalResult: null, created: st, updated: st,
        });
      }
      c.changed();
      return { ok: true };
    },
    closeRound() {
      const rv = roundView();
      if (!isHr || rv.open?.kind !== 'annual') return deny('not_allowed');
      const open = yearReviews().filter((r) => r.kind === 'annual' && !r.finalResult);
      const blocks = closeBlocks(s, open, now);
      const cyc = s.cycles.find((x) => x.financialYear === fy && x.kind === 'appraisal');
      const subject = { type: 'Cycle', id: (cyc?.id as string) ?? `appraisal-${fy}` };
      if (blocks.length) { gate('appraisal.close', subject, 'blocked', blocks.map((b) => `review:${b.kind}`)); c.changed(); return deny('blocked'); }
      const pending = finalPeriodPending(s, open.map((r) => r.contractId as string), sharesIn(open.map((r) => r.contractId as string)), fy);
      for (const r of open) {
        const rating = rateContract(s, r.contractId, { now });
        if (rating && rating.overall !== null) r.finalResult = { overallScore: rating.overall, label: rating.label ?? '', schemeId: s.ratingSchemes[0]!.id, frozenAt: c.clock() };
        r.updated = stamp();
      }
      gate('appraisal.close', subject, 'passed', [], [...pending.updates, ...pending.readings].map((x) => `final-period:${x}`));
      c.changed();
      return { ok: true };
    },
  };
}

/** Which quarter of the financial year a quarter-end date closes (1 to 4). */
export const quarterOf = (periodEnd: string, startMonth: number): number => Math.round((((Number(periodEnd.slice(5, 7)) - startMonth + 12) % 12) + 1) / 3);

export const formatReviewDue = (d: ISODate | null) => (d ? formatDate(d) : '');
