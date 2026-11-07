/**
 * Performance › Targets data access (v0.21.0; Targets Specification v0.1, TG-1 to TG-10; contract v1.13). A Cascade
 * KPI broken down into unit shares; readings recorded by each share's owner and verified by their supervisor (TG-3);
 * combined figures computed from verified readings only. Nothing here changes Strategy or Cascade records.
 */
import type { Activity, ActivityProposal, Dependency, FinancialYear, ISODate, ISODateTime, KpiBreakdown, KpiShare, ShareReading, SixPLevel } from '../../contract/caspa-data-contract';
import { dependencyFlags, makesCircle } from '../../rules/contracts';
import { financialYearBounds } from '../../rules/kpi-progress';
import { can } from './permissions';
import { endedPeriods, parseFigure } from '../../rules/progress';
import { breakdownChecks, breakdownOf, combinedLatest, combinedTarget, corporateTarget, fromShares, latestVerifiedReading, lowerIsBetter, notCarried, sharesOf, suggestedCombine, unusualCombine } from '../../rules/targets';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { en } from '../../strings/en';
import type { Device } from './device';
import type { Store } from './store';
import type { Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; financialYear: FinancialYear; clock: () => ISODateTime; device: Device; changed: () => void }

export interface TargetsKpi {
  kpiId: string; code: string; name: string; unit: string; partOf: string[]; corporate: number | null; lower: boolean;
  breakdown: { id: string; shares: number; combine: KpiBreakdown['combine']; combinedTarget: number | null; combinedLatest: number | null; mustFix: number; worth: number } | null;
  canBreakDown: boolean;
}
export interface ShareCard {
  id: string; unit: string; owner: string | null; ownerPosition: string | null; target: number; weight: number | null; weightPct: number | null;
  latest: { value: number; periodEnd: ISODate } | null; waiting: number; work: number;
}
export interface BreakdownView {
  id: string; kpiId: string; kpiName: string; code: string; unit: string; partOf: string[]; lower: boolean;
  combine: KpiBreakdown['combine']; weightLabel: string; corporate: number | null; combinedTarget: number | null;
  combinedLatest: { value: number | null; covered: number; of: number };
  checks: { must: boolean; text: string }[]; shares: ShareCard[]; canEdit: boolean;
  owners: { id: string; label: string }[];
}
export interface ShareView {
  id: string; breakdownId: string; kpiName: string; unit: string; owner: string | null; target: number; lower: boolean; kpiUnit: string;
  readings: { id: string; periodEnd: ISODate; value: number; state: 'waiting' | 'sent' | 'verified' | 'returned'; reason: string | null; savedOffline: boolean }[];
  periods: ISODate[];
  work: { id: string; title: string; who: string; quantity: string; how: 'source' | 'serves' }[];
  linkable: { id: string; title: string; who: string; quantity: string }[];
  can: { record: boolean; verify: boolean; link: boolean; propose: boolean; depend: boolean };
  inContract: string | null;
  /** v0.25.0 (TG-9): proposals of new work for this share; the owners a proposal may name. */
  proposals: ProposalView[];
  proposalOwners: { id: string; label: string }[];
  kpiCode: string;
  /** v0.25.0: what this share depends on, and what it can depend on (an activity or another share). */
  deps: { id: string; on: string; owner: string; neededBy: ISODate; note: string; flags: string[] }[];
  dependOptions: { id: string; kind: 'activity' | 'share'; label: string }[];
}
export interface ProposalView {
  id: string; shareId: string; shareUnit: string; kpi: string; title: string; level: SixPLevel; quantity: { value: number; unit: string } | null;
  owner: string; ownerPositionId: string; evidence: string; reason: string; by: string; sentAt: string;
  outcome: ActivityProposal['outcome']; returnReason: string | null; activityCode: string | null;
  asSent: { title: string; level: SixPLevel } | null; canDecide: boolean; canChange: boolean;
}
export interface ProposalInput { title: string; decisionLevel: SixPLevel | null; quantity: number | null; unit: string; ownerPositionId: string; evidence: string; reason: string }
export type TargetsResult = { ok: true; queued?: boolean } | { ok: false; error: string };

export interface TargetsAccess {
  hasAny(): boolean;
  list(): { kpis: TargetsKpi[]; notCarried: { code: string; name: string }[] };
  setupOptions(kpiId: string): { units: { id: string; label: string; count: number }[] } | null;
  create(kpiId: string, parentUnitId: string, combine: KpiBreakdown['combine'], weightLabel: string): TargetsResult & { id?: string };
  breakdown(id: string): BreakdownView | null;
  saveShares(id: string, rows: { shareId: string; target: number; weight: number | null; ownerPositionId: string | null }[]): TargetsResult;
  share(id: string): ShareView | null;
  record(shareId: string, periodEnd: string, value: string): TargetsResult;
  sendWaiting(): number;
  verify(readingId: string): TargetsResult;
  returnReading(readingId: string, reason: string): TargetsResult;
  link(shareId: string, contractObjectiveIds: string[]): TargetsResult;
  unlink(shareId: string, contractObjectiveId: string): TargetsResult;
  needs(): NeedsYouItem[];
  cascadeLine(kpiId: string): { shares: number; combinedLatest: number | null; breakdownId: string; fromShares: { reported: number; of: number; latest: ISODate | null; showing: ISODate | null } | null } | null;
  /** v0.25.0 (F10): the combining rule a new breakdown starts from, by the KPI's unit. */
  suggestedCombine(kpiId: string): KpiBreakdown['combine'];
  /** v0.25.0 (TG-9): propose new work from a share; the Strategy office confirms or returns it. */
  propose(shareId: string, input: ProposalInput): TargetsResult & { id?: string };
  changeProposal(id: string, input: ProposalInput): TargetsResult;
  withdrawProposal(id: string): TargetsResult;
  proposalsToDecide(): ProposalView[];
  confirmProposal(id: string, edits?: Partial<ProposalInput>): TargetsResult & { code?: string };
  returnProposal(id: string, reason: string): TargetsResult;
  /** v0.25.0: dependencies from a share, on an activity or another share. */
  addDependency(shareId: string, onId: string, neededBy: string, note: string): TargetsResult;
  removeDependency(id: string): TargetsResult;
}

export function createTargetsAccess(c: Ctx): TargetsAccess {
  const { s, viewer: v, now, financialYear: fy, device } = c;
  const T = en.targets;
  const me = v.membershipId as string;
  const isSO = v.roles.includes('strategy_office');
  const mine = (pos: string | null | undefined) => !!pos && v.positionIds.includes(pos as never);
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const audit = (action: string, type: string, id: string, before: unknown, after: unknown) =>
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type, id }, before, after });
  const held = (from: string, to: string | null) => from <= now && (to === null || to >= now);
  const holder = (pos: string | null) => { const a = s.assignments.find((x) => x.positionId === pos && held(x.from, x.to)); return a ? (s.people.find((p) => p.id === a.personId)?.fullName ?? null) : null; };
  const posTitle = (pos: string | null) => s.positions.find((p) => p.id === pos)?.title ?? null;
  const supOf = (pos: string | null) => (s.positions.find((p) => p.id === pos)?.reportsToPositionId as string | null) ?? null;
  const kpi = (id: string) => s.kpis.find((k) => k.id === id);
  const partOf = (kpiId: string) => {
    const k = kpi(kpiId); const o = s.objectives.find((x) => x.id === k?.objectiveId); const g = s.goals.find((x) => x.id === o?.goalId);
    return [g ? `${g.code} ${g.title}` : '', o ? `${o.code} ${o.title}` : ''].filter(Boolean);
  };
  const canEdit = (kpiId: string) => isSO || mine(kpi(kpiId)?.ownerPositionId);
  const shareOf = (id: string) => s.kpiShares.find((x) => x.id === id);
  const bOfShare = (sh: KpiShare) => s.kpiBreakdowns.find((b) => b.id === sh.breakdownId)!;
  const involved = (b: KpiBreakdown) => canEdit(b.kpiId) || sharesOf(s, b.id).some((x) => mine(x.ownerPositionId) || mine(supOf(x.ownerPositionId)));
  const pending = () => (device.shareReadings ?? []).filter((x) => x.membershipId === me);
  const objTitle = (coId: string) => { const co = s.contractObjectives.find((x) => x.id === coId); return co?.snapshot?.title ?? co?.title ?? ''; };
  const who = (contractId: string) => { const ct = s.contracts.find((x) => x.id === contractId); return ct ? `${s.people.find((p) => p.id === ct.personId)?.fullName ?? ''}, ${posTitle(ct.positionId) ?? ''}` : ''; };
  const qty = (coId: string) => { const co = s.contractObjectives.find((x) => x.id === coId); const q = co?.snapshot?.quantityTarget ?? co?.quantityTarget; return q ? `${q.value.toLocaleString('en-GB')} ${q.unit}` : ''; };

  const checksText = (b: KpiBreakdown) => breakdownChecks(s, b).map((x) => {
    if (x.kind === 'short_of_target') return { must: true, text: T.checks.short(round1(x.combined), round1(x.corporate), kpi(b.kpiId)?.unit ?? '') };
    const sh = shareOf((x as { shareId: string }).shareId); const unit = s.units.find((u) => u.id === sh?.unitId)?.name ?? '';
    return x.kind === 'no_owner' ? { must: true, text: T.checks.noOwner(unit) } : { must: false, text: T.checks.noWork(unit) };
  }).concat((() => { const u = unusualCombine(kpi(b.kpiId)?.unit ?? '', b.combine, s.organisation.baseCurrency); return u ? [{ must: false, text: T.checks[u] }] : []; })());

  const breakdownView = (b: KpiBreakdown): BreakdownView => {
    const k = kpi(b.kpiId)!;
    const shares = sharesOf(s, b.id);
    const totalW = shares.reduce((a, x) => a + (x.weight ?? 0), 0);
    const units = s.units.filter((u) => shares.some((x) => x.unitId === u.id));
    return {
      id: b.id, kpiId: k.id, kpiName: k.name, code: k.code, unit: k.unit, partOf: partOf(k.id), lower: lowerIsBetter(s, k.id),
      combine: b.combine, weightLabel: b.weightLabel, corporate: corporateTarget(s, k.id, fy), combinedTarget: combinedTarget(s, b), combinedLatest: combinedLatest(s, b, now),
      checks: checksText(b), canEdit: canEdit(k.id),
      owners: s.positions.filter((p) => units.some((u) => u.id === p.unitId)).map((p) => ({ id: p.id as string, label: `${p.title}${holder(p.id) ? `, ${holder(p.id)}` : ''}` })),
      shares: shares.map((x) => {
        const l = latestVerifiedReading(s, x.id, now);
        return {
          id: x.id, unit: s.units.find((u) => u.id === x.unitId)?.name ?? '', owner: holder(x.ownerPositionId), ownerPosition: posTitle(x.ownerPositionId), target: x.target, weight: x.weight,
          weightPct: b.combine === 'weighted' && totalW > 0 && x.weight !== null ? x.weight / totalW : null,
          latest: l ? { value: l.value, periodEnd: l.periodEnd } : null,
          waiting: s.shareReadings.filter((r) => r.shareId === x.id && !r.verified && !r.returned).length,
          work: s.contractObjectives.filter((co) => co.servesShareId === x.id || co.sourceShareId === x.id).length,
        };
      }),
    };
  };

  /* ── v0.25.0 (Finish Targets Specification v0.1) ── */
  const levelOk = (l: unknown): l is SixPLevel => ['principle', 'process', 'people', 'policy', 'procedures', 'practices'].includes(l as string);
  const proposalView = (p: ActivityProposal): ProposalView => {
    const sh = shareOf(p.shareId)!; const k = kpi(p.kpiId)!;
    return {
      id: p.id, shareId: p.shareId, shareUnit: s.units.find((u) => u.id === sh.unitId)?.name ?? '', kpi: `${k.code} ${k.name}`, title: p.title, level: p.decisionLevel, quantity: p.quantityTarget,
      owner: `${posTitle(p.ownerPositionId) ?? ''}${holder(p.ownerPositionId) ? `, ${holder(p.ownerPositionId)}` : ''}`, ownerPositionId: p.ownerPositionId, evidence: p.evidence, reason: p.reason,
      by: s.people.find((x) => x.id === s.memberships.find((m) => m.id === p.sent.byMembershipId)?.personId)?.fullName ?? '', sentAt: p.sent.at,
      outcome: p.outcome, returnReason: p.returnReason, activityCode: s.activities.find((a) => a.id === p.activityId)?.code ?? null,
      asSent: p.asSent ? { title: p.asSent.title, level: p.asSent.decisionLevel } : null,
      canDecide: isSO && p.outcome === 'waiting', canChange: p.outcome === 'returned' && can(s, v, 'propose', { type: 'ActivityProposal', id: p.id }),
    };
  };
  const ownerChoices = (sh: KpiShare) => s.positions.filter((p) => p.unitId === sh.unitId || p.id === sh.ownerPositionId).map((p) => ({ id: p.id as string, label: `${p.title}${holder(p.id) ? `, ${holder(p.id)}` : ''}` }));
  const checkInput = (sh: KpiShare, i: ProposalInput): string | null => {
    if (!i.title.trim()) return 'title_required';
    if (!levelOk(i.decisionLevel)) return 'level_required';
    if (!ownerChoices(sh).some((o) => o.id === i.ownerPositionId)) return 'owner_required';
    if (i.quantity !== null && !(i.quantity > 0)) return 'bad_number';
    return null;
  };
  const nextCode = (kpiId: string) => {
    const k = kpi(kpiId)!; const base = `A${k.code.replace(/^K/, '')}.`;
    const n = Math.max(0, ...s.activities.filter((a) => a.code.startsWith(base)).map((a) => Number(a.code.slice(base.length)) || 0)) + 1;
    return `${base}${n}`;
  };
  const depText = (d: Dependency): { on: string; owner: string } => {
    if ('activityId' in d.on) { const a = s.activities.find((x) => x.id === (d.on as { activityId: string }).activityId); return { on: a ? `${a.code} ${a.title}` : '', owner: holder(a?.ownerPositionId ?? null) ?? posTitle(a?.ownerPositionId ?? null) ?? '' }; }
    const o = shareOf((d.on as { shareId: string }).shareId); const ob = o && bOfShare(o); const k2 = ob && kpi(ob.kpiId);
    return { on: o ? T.deps.shareOf(s.units.find((u) => u.id === o.unitId)?.name ?? '', k2?.code ?? '') : '', owner: holder(o?.ownerPositionId ?? null) ?? '' };
  };

  const deliver = (sh: KpiShare, periodEnd: ISODate, value: number, offline: boolean) => {
    // A new figure replaces an unverified one for the same period; verified ones are kept (as OP-5).
    s.shareReadings = s.shareReadings.filter((r) => !(r.shareId === sh.id && r.periodEnd === periodEnd && !r.verified));
    const st = stamp();
    const rec: ShareReading = { orgId: s.organisation.id, id: `sr-${sh.id}-${periodEnd}-${s.shareReadings.length + 1}` as never, shareId: sh.id, periodEnd, value, savedOffline: offline, verified: null, returned: null, created: st, updated: st };
    s.shareReadings.push(rec);
    audit('create', 'ShareReading', rec.id, null, { shareId: sh.id, periodEnd, value });
  };

  return {
    hasAny: () => s.kpiBreakdowns.some((b) => b.financialYear === fy && involved(b)) || s.kpis.some((k) => mine(k.ownerPositionId) && corporateTarget(s, k.id, fy) !== null) || isSO,
    list() {
      const kpis = s.kpis.filter((k) => corporateTarget(s, k.id, fy) !== null || breakdownOf(s, k.id, fy)).filter((k) => { const b = breakdownOf(s, k.id, fy); return canEdit(k.id) || (b && involved(b)); });
      return {
        kpis: kpis.map((k) => {
          const b = breakdownOf(s, k.id, fy);
          const ch = b ? checksText(b) : [];
          return {
            kpiId: k.id, code: k.code, name: k.name, unit: k.unit, partOf: partOf(k.id), corporate: corporateTarget(s, k.id, fy), lower: lowerIsBetter(s, k.id),
            breakdown: b ? { id: b.id, shares: sharesOf(s, b.id).length, combine: b.combine, combinedTarget: combinedTarget(s, b), combinedLatest: combinedLatest(s, b, now).value, mustFix: ch.filter((x) => x.must).length, worth: ch.filter((x) => !x.must).length } : null,
            canBreakDown: !b && canEdit(k.id) && !!k.ownerPositionId,
          };
        }),
        notCarried: isSO ? notCarried(s, fy).map((id) => ({ code: kpi(id)?.code ?? '', name: kpi(id)?.name ?? '' })) : [],
      };
    },
    setupOptions(kpiId) {
      if (!canEdit(kpiId) || breakdownOf(s, kpiId, fy)) return null;
      return { units: s.units.filter((u) => s.units.some((x) => x.parentId === u.id)).map((u) => ({ id: u.id as string, label: u.name, count: s.units.filter((x) => x.parentId === u.id).length })) };
    },
    create(kpiId, parentUnitId, combine, weightLabel) {
      if (!canEdit(kpiId) || breakdownOf(s, kpiId, fy)) return { ok: false, error: 'not_allowed' };
      const children = s.units.filter((u) => u.parentId === parentUnitId);
      if (!children.length) return { ok: false, error: 'no_units' };
      const st = stamp();
      const b: KpiBreakdown = { orgId: s.organisation.id, id: `kb-${kpiId}-${fy}` as never, kpiId: kpiId as never, financialYear: fy, combine, weightLabel: weightLabel.trim(), created: st, updated: st };
      s.kpiBreakdowns.push(b);
      const corp = corporateTarget(s, kpiId, fy) ?? 0;
      for (const u of children) {
        // Each share starts at the corporate target (for a sum, an even split), with no owner: the checks say what to fix.
        s.kpiShares.push({ orgId: s.organisation.id, id: `ks-${b.id}-${u.id}` as never, breakdownId: b.id, unitId: u.id, ownerPositionId: null, target: combine === 'sum' ? Math.round(corp / children.length) : corp, weight: combine === 'weighted' ? 1 : null, created: st, updated: st });
      }
      audit('create', 'KpiBreakdown', b.id, null, { kpiId, combine, units: children.length });
      c.changed();
      return { ok: true, id: b.id };
    },
    breakdown(id) {
      const b = s.kpiBreakdowns.find((x) => x.id === id);
      return b && involved(b) ? breakdownView(b) : null;
    },
    saveShares(id, rows) {
      const b = s.kpiBreakdowns.find((x) => x.id === id);
      if (!b || !canEdit(b.kpiId)) return { ok: false, error: 'not_allowed' };
      if (rows.some((r) => !Number.isFinite(r.target) || (r.weight !== null && (!Number.isFinite(r.weight) || r.weight < 0)))) return { ok: false, error: 'bad_number' };
      const before = structuredClone(sharesOf(s, id));
      for (const r of rows) { const sh = shareOf(r.shareId); if (sh && sh.breakdownId === id) { sh.target = r.target; sh.weight = r.weight; sh.ownerPositionId = r.ownerPositionId as never; sh.updated = stamp(); } }
      audit('update', 'KpiBreakdown', id, before, structuredClone(sharesOf(s, id)));
      c.changed();
      return { ok: true };
    },
    share(id) {
      const sh = shareOf(id);
      if (!sh || !involved(bOfShare(sh))) return null;
      const b = bOfShare(sh); const k = kpi(b.kpiId)!;
      const owner = mine(sh.ownerPositionId);
      const teamPositions = s.positions.filter((p) => p.reportsToPositionId === sh.ownerPositionId).map((p) => p.id as string);
      const teamCos = s.contractObjectives.filter((co) => co.sourceActivityId && !co.servesShareId && s.contracts.some((ct) => ct.id === co.contractId && ct.financialYear === fy && teamPositions.includes(ct.positionId)));
      const queued = pending().filter((x) => x.shareId === id);
      const contractObj = s.contractObjectives.find((co) => co.sourceShareId === id);
      return {
        id, breakdownId: b.id, kpiName: k.name, unit: s.units.find((u) => u.id === sh.unitId)?.name ?? '', owner: holder(sh.ownerPositionId), target: sh.target, lower: lowerIsBetter(s, k.id), kpiUnit: k.unit,
        readings: [
          ...queued.map((x) => ({ id: `q-${x.periodEnd}`, periodEnd: x.periodEnd as ISODate, value: x.value, state: 'waiting' as const, reason: null, savedOffline: true })),
          ...s.shareReadings.filter((r) => r.shareId === id).sort((a, b2) => (a.periodEnd < b2.periodEnd ? 1 : -1)).map((r) => ({ id: r.id, periodEnd: r.periodEnd, value: r.value, state: r.verified ? 'verified' as const : r.returned ? 'returned' as const : 'sent' as const, reason: r.returned?.reason ?? null, savedOffline: r.savedOffline })),
        ],
        periods: [...endedPeriods(fy, s.organisation.financialYearStartMonth, k.reportingFrequency, now)].reverse(),
        work: s.contractObjectives.filter((co) => co.servesShareId === id || co.sourceShareId === id).map((co) => ({ id: co.id, title: objTitle(co.id), who: who(co.contractId), quantity: qty(co.id), how: co.sourceShareId === id ? 'source' as const : 'serves' as const })),
        linkable: owner ? teamCos.map((co) => ({ id: co.id, title: objTitle(co.id), who: who(co.contractId), quantity: qty(co.id) })) : [],
        can: { record: owner, verify: mine(supOf(sh.ownerPositionId)) && !owner, link: owner, propose: can(s, v, 'propose', { type: 'ActivityProposal', id: sh.id }), depend: can(s, v, 'draft', { type: 'Dependency', id: sh.id }) && (owner || canEdit(k.id)) },
        inContract: contractObj ? T.inContract(k.name, s.units.find((u) => u.id === sh.unitId)?.name ?? '', sh.target, k.unit) : null,
        proposals: s.activityProposals.filter((p) => p.shareId === id && p.outcome !== 'withdrawn' && can(s, v, 'view', { type: 'ActivityProposal', id: p.id })).map(proposalView),
        proposalOwners: ownerChoices(sh), kpiCode: k.code,
        deps: s.dependencies.filter((d) => 'shareId' in d.from && (d.from as { shareId: string }).shareId === id).map((d) => ({ id: d.id, ...depText(d), neededBy: d.neededBy, note: d.note, flags: dependencyFlags(s, d, fy, now).map((f) => T.deps.flag[f] ?? f) })),
        dependOptions: [
          ...s.activities.filter((a) => a.financialYear === fy).map((a) => ({ id: a.id as string, kind: 'activity' as const, label: `${a.code} ${a.title}` })),
          ...s.kpiShares.filter((x) => x.id !== id && s.kpiBreakdowns.some((bb) => bb.id === x.breakdownId && bb.financialYear === fy)).map((x) => { const k2 = kpi(bOfShare(x).kpiId); return { id: x.id as string, kind: 'share' as const, label: T.deps.shareOf(s.units.find((u) => u.id === x.unitId)?.name ?? '', k2?.code ?? '') }; }),
        ],
      };
    },
    record(shareId, periodEnd, value) {
      const sh = shareOf(shareId);
      if (!sh || !mine(sh.ownerPositionId)) return { ok: false, error: 'not_allowed' };
      const k = kpi(bOfShare(sh).kpiId)!;
      if (!endedPeriods(fy, s.organisation.financialYearStartMonth, k.reportingFrequency, now).includes(periodEnd as ISODate)) return { ok: false, error: 'bad_period' };
      const n = parseFigure(value);
      if (n === null) return { ok: false, error: 'bad_number' };
      if (device.offline[me]) {
        device.shareReadings = [...(device.shareReadings ?? []).filter((x) => !(x.membershipId === me && x.shareId === shareId && x.periodEnd === periodEnd)), { membershipId: me, shareId, periodEnd, value: n }];
        c.changed();
        return { ok: true, queued: true };
      }
      deliver(sh, periodEnd as ISODate, n, false);
      c.changed();
      return { ok: true };
    },
    sendWaiting() {
      let n = 0;
      for (const x of pending()) { const sh = shareOf(x.shareId); if (sh && mine(sh.ownerPositionId)) { deliver(sh, x.periodEnd as ISODate, x.value, true); n++; } }
      device.shareReadings = (device.shareReadings ?? []).filter((x) => x.membershipId !== me);
      if (n) c.changed();
      return n;
    },
    verify(readingId) {
      const r = s.shareReadings.find((x) => x.id === readingId);
      const sh = r && shareOf(r.shareId);
      // Whoever records cannot verify; the owner's supervisor does, acting holders included (TG-3, OP-6).
      if (!r || !sh || r.verified || r.returned || !mine(supOf(sh.ownerPositionId)) || r.created.byMembershipId === v.membershipId) return { ok: false, error: 'not_allowed' };
      r.verified = { by: stamp() }; r.updated = r.verified.by;
      audit('verify', 'ShareReading', r.id, null, r.verified);
      c.changed();
      return { ok: true };
    },
    returnReading(readingId, reason) {
      const r = s.shareReadings.find((x) => x.id === readingId);
      const sh = r && shareOf(r.shareId);
      if (!r || !sh || r.verified || r.returned || !mine(supOf(sh.ownerPositionId))) return { ok: false, error: 'not_allowed' };
      if (!reason.trim()) return { ok: false, error: 'reason_required' };
      r.returned = { reason: reason.trim(), by: stamp() }; r.updated = r.returned.by;
      audit('return', 'ShareReading', r.id, null, r.returned);
      c.changed();
      return { ok: true };
    },
    link(shareId, ids) {
      const view = this.share(shareId);
      if (!view || !view.can.link) return { ok: false, error: 'not_allowed' };
      for (const id of ids) {
        const co = s.contractObjectives.find((x) => x.id === id);
        if (!co || !view.linkable.some((l) => l.id === id)) continue;
        co.servesShareId = shareId as never;
        audit('link', 'ContractObjective', co.id, null, { servesShareId: shareId });
      }
      c.changed();
      return { ok: true };
    },
    unlink(shareId, coId) {
      const sh = shareOf(shareId);
      const co = s.contractObjectives.find((x) => x.id === coId);
      if (!sh || !co || !mine(sh.ownerPositionId) || co.servesShareId !== shareId) return { ok: false, error: 'not_allowed' };
      co.servesShareId = null;
      audit('unlink', 'ContractObjective', co.id, { servesShareId: shareId }, null);
      c.changed();
      return { ok: true };
    },
    needs() {
      const out: NeedsYouItem[] = [];
      const toVerify = s.shareReadings.filter((r) => { const sh = shareOf(r.shareId); return sh && !r.verified && !r.returned && mine(supOf(sh.ownerPositionId)) && r.created.byMembershipId !== v.membershipId; });
      // F6 (v0.25.0): share readings are verified in Progress updates › To verify, with contract updates.
      if (toVerify.length) out.push({ key: 'targets:verify', kind: 'approval', title: T.needs.verify(toVerify.length), detail: null, due: null, daysOverdue: null, severity: null, as: null, link: { kind: 'progress', tab: 'verify' } });
      // TG-9: proposals waiting for the Strategy office; returned ones back with whoever may change them.
      for (const p of s.activityProposals.filter((x) => x.financialYear === fy)) {
        if (p.outcome === 'waiting' && isSO) out.push({ key: `targets:proposal:${p.id}`, kind: 'approval', title: T.proposals.needs.decide(kpi(p.kpiId)?.code ?? '', p.title), detail: null, due: null, daysOverdue: null, severity: null, as: 'strategy_office', link: { kind: 'targets' } });
        if (p.outcome === 'returned' && can(s, v, 'propose', { type: 'ActivityProposal', id: p.id })) out.push({ key: `targets:returned:${p.id}`, kind: 'deadline', title: T.proposals.needs.returned(p.title), detail: p.returnReason, due: null, daysOverdue: null, severity: null, as: null, link: { kind: 'targets', shareId: p.shareId } });
      }
      for (const b of s.kpiBreakdowns.filter((x) => x.financialYear === fy && canEdit(x.kpiId))) {
        const must = checksText(b).filter((x) => x.must).length;
        if (must) out.push({ key: `targets:fix:${b.id}`, kind: 'finding', title: T.needs.fix(kpi(b.kpiId)?.name ?? '', must), detail: null, due: null, daysOverdue: null, severity: 'advisory', as: null, link: { kind: 'targets', breakdownId: b.id } });
      }
      return out;
    },
    cascadeLine(kpiId) {
      const b = breakdownOf(s, kpiId, fy);
      if (!b) return null;
      const fs = fromShares(s, kpiId, fy, financialYearBounds(fy, s.organisation.financialYearStartMonth).start, now);
      const last = fs?.periods[fs.periods.length - 1];
      return {
        shares: sharesOf(s, b.id).length, breakdownId: b.id,
        combinedLatest: fs ? (last?.value ?? null) : combinedLatest(s, b, now).value,
        fromShares: fs ? { reported: fs.latest?.reported ?? 0, of: fs.of, latest: fs.latest?.periodEnd ?? null, showing: last?.periodEnd ?? null } : null,
      };
    },
    suggestedCombine: (kpiId) => suggestedCombine(kpi(kpiId)?.unit ?? ''),
    propose(shareId, input) {
      const sh = shareOf(shareId);
      if (!sh || !can(s, v, 'propose', { type: 'ActivityProposal', id: shareId })) return { ok: false, error: 'not_allowed' };
      const err = checkInput(sh, input);
      if (err) return { ok: false, error: err };
      const b = bOfShare(sh); const st = stamp();
      const p: ActivityProposal = {
        orgId: s.organisation.id, id: `prop-${s.activityProposals.length + 1}` as never, shareId: sh.id, kpiId: b.kpiId, financialYear: b.financialYear,
        title: input.title.trim(), decisionLevel: input.decisionLevel!, quantityTarget: input.quantity === null ? null : { value: input.quantity, unit: input.unit.trim() },
        ownerPositionId: input.ownerPositionId as never, evidence: input.evidence.trim(), reason: input.reason.trim(), sent: st, asSent: null,
        outcome: 'waiting', decided: null, returnReason: null, activityId: null, created: st, updated: st,
      };
      s.activityProposals.push(p);
      audit('propose', 'ActivityProposal', p.id, null, { title: p.title, decisionLevel: p.decisionLevel, shareId });
      c.changed();
      return { ok: true, id: p.id };
    },
    changeProposal(id, input) {
      const p = s.activityProposals.find((x) => x.id === id);
      if (!p || p.outcome !== 'returned' || !can(s, v, 'propose', { type: 'ActivityProposal', id })) return { ok: false, error: 'not_allowed' };
      const err = checkInput(shareOf(p.shareId)!, input);
      if (err) return { ok: false, error: err };
      const before = structuredClone(p);
      Object.assign(p, { title: input.title.trim(), decisionLevel: input.decisionLevel!, quantityTarget: input.quantity === null ? null : { value: input.quantity, unit: input.unit.trim() }, ownerPositionId: input.ownerPositionId, evidence: input.evidence.trim(), reason: input.reason.trim(), outcome: 'waiting', sent: stamp(), decided: null, returnReason: null, updated: stamp() });
      audit('resend', 'ActivityProposal', id, before, { title: p.title, decisionLevel: p.decisionLevel });
      c.changed();
      return { ok: true };
    },
    withdrawProposal(id) {
      const p = s.activityProposals.find((x) => x.id === id);
      if (!p || (p.outcome !== 'returned' && p.outcome !== 'waiting') || !can(s, v, 'propose', { type: 'ActivityProposal', id })) return { ok: false, error: 'not_allowed' };
      p.outcome = 'withdrawn'; p.updated = stamp();
      audit('withdraw', 'ActivityProposal', id, null, { outcome: 'withdrawn' });
      c.changed();
      return { ok: true };
    },
    proposalsToDecide: () => (isSO ? s.activityProposals.filter((p) => p.outcome === 'waiting' && p.financialYear === fy).map(proposalView) : []),
    confirmProposal(id, edits) {
      const p = s.activityProposals.find((x) => x.id === id);
      if (!p || p.outcome !== 'waiting' || !can(s, v, 'approve', { type: 'ActivityProposal', id })) return { ok: false, error: 'not_allowed' };
      const sh = shareOf(p.shareId)!;
      const next = { title: edits?.title ?? p.title, decisionLevel: edits?.decisionLevel ?? p.decisionLevel, quantity: edits?.quantity !== undefined ? edits.quantity : (p.quantityTarget?.value ?? null), unit: edits?.unit ?? p.quantityTarget?.unit ?? '', ownerPositionId: edits?.ownerPositionId ?? p.ownerPositionId, evidence: edits?.evidence ?? p.evidence, reason: p.reason };
      const err = checkInput(sh, next);
      if (err) return { ok: false, error: err };
      const changed = next.title !== p.title || next.decisionLevel !== p.decisionLevel || next.ownerPositionId !== p.ownerPositionId || next.quantity !== (p.quantityTarget?.value ?? null);
      if (changed) p.asSent = { title: p.title, decisionLevel: p.decisionLevel, quantityTarget: p.quantityTarget, ownerPositionId: p.ownerPositionId };
      const st = stamp();
      const a: Activity = {
        ...(s.activities.find((x) => x.kpiId === p.kpiId) ?? s.activities[0]!), // copies only the shape; every field that matters is set below
        id: `a-prop-${p.id}` as never, kpiId: p.kpiId, financialYear: p.financialYear, code: nextCode(p.kpiId), title: next.title.trim(),
        decisionLevel: next.decisionLevel!, ownerPositionId: next.ownerPositionId as never, quantityTarget: next.quantity === null ? null : { value: next.quantity, unit: next.unit.trim() },
        evidence: next.evidence.trim() || null, created: st, updated: st,
      } as Activity;
      s.activities.push(a);
      Object.assign(p, { title: a.title, decisionLevel: a.decisionLevel, ownerPositionId: a.ownerPositionId, quantityTarget: a.quantityTarget, outcome: 'confirmed', decided: st, activityId: a.id, updated: st });
      audit('create', 'Activity', a.id, null, { code: a.code, title: a.title, fromProposal: p.id });
      audit('confirm', 'ActivityProposal', p.id, null, { activityId: a.id, code: a.code });
      c.changed();
      return { ok: true, code: a.code };
    },
    returnProposal(id, reason) {
      const p = s.activityProposals.find((x) => x.id === id);
      if (!p || p.outcome !== 'waiting' || !can(s, v, 'approve', { type: 'ActivityProposal', id })) return { ok: false, error: 'not_allowed' };
      if (!reason.trim()) return { ok: false, error: 'reason_required' };
      Object.assign(p, { outcome: 'returned', decided: stamp(), returnReason: reason.trim(), updated: stamp() });
      audit('return', 'ActivityProposal', id, null, { reason: reason.trim() });
      c.changed();
      return { ok: true };
    },
    addDependency(shareId, onId, neededBy, note) {
      const sh = shareOf(shareId);
      if (!sh || !(mine(sh.ownerPositionId) || canEdit(bOfShare(sh).kpiId)) || !can(s, v, 'draft', { type: 'Dependency', id: shareId })) return { ok: false, error: 'not_allowed' };
      const isAct = s.activities.some((a) => a.id === onId); const isShare = s.kpiShares.some((x) => x.id === onId && x.id !== shareId);
      if ((!isAct && !isShare) || !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return { ok: false, error: 'source_required' };
      if (makesCircle(s, shareId, onId)) return { ok: false, error: 'circle' };
      const st = stamp();
      const d: Dependency = { orgId: s.organisation.id, id: `dep-${shareId}-${s.dependencies.length + 1}` as never, from: { shareId: sh.id }, on: isAct ? { activityId: onId as never } : { shareId: onId as never }, neededBy: neededBy as ISODate, note: note.trim(), created: st, updated: st };
      s.dependencies.push(d);
      audit('create', 'Dependency', d.id, null, { from: d.from, on: d.on, neededBy });
      c.changed();
      return { ok: true };
    },
    removeDependency(id) {
      const d = s.dependencies.find((x) => x.id === id);
      const shareId = d && 'shareId' in d.from ? (d.from as { shareId: string }).shareId : null;
      const sh = shareId ? shareOf(shareId) : undefined;
      if (!d || !sh || !(mine(sh.ownerPositionId) || canEdit(bOfShare(sh).kpiId))) return { ok: false, error: 'not_allowed' };
      s.dependencies = s.dependencies.filter((x) => x.id !== id);
      audit('delete', 'Dependency', id, { from: d.from, on: d.on }, null);
      c.changed();
      return { ok: true };
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
