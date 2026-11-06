/**
 * Performance › Contracts data access (v0.22.0; Contracts Specification v0.1, CT-1 to CT-10; contract v1.14).
 * Drafting by the position's supervisor, the next-level reviewer's check before issue where a dependency is worth
 * checking (CT-5), signing with the employee's note (CT-6), and revising as a new version (CT-8).
 */
import type { ContractObjective, Dependency, FinancialYear, ISODate, ISODateTime, PerformanceContract } from '../../contract/caspa-data-contract';
import { carriedQuantity, dependencyFlags, draftChecks, makesCircle, type DraftCheck } from '../../rules/contracts';
import { activityFingerprint } from '../../rules/fingerprint';
import { holdersOf, reviewerPositionOf, supervisorPositionOf } from '../../rules/review';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { formatDate } from '../../selectors/format';
import { en } from '../../strings/en';
import type { Store } from './store';
import type { Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; financialYear: FinancialYear; clock: () => ISODateTime; changed: () => void }

export type ContractTab = 'mine' | 'team' | 'check' | 'overview';
export interface ObjectiveView {
  id: string; title: string; source: 'activity' | 'share' | 'combined' | 'duty'; sourceText: string; level: string | null;
  quantity: number | null; unit: string; weight: number;
  deps: { id: string; text: string; neededBy: ISODate; note: string; flags: string[] }[];
}
export interface ContractView {
  id: string; person: string; position: string; supervisor: string; reviewer: string; version: number;
  step: 'draft' | 'waiting_check' | 'sent_back' | 'issued' | 'signed' | 'closed'; checkReason: string | null;
  objectives: ObjectiveView[]; weightTotal: number; mustFix: string[]; worth: string[]; fairness: boolean;
  employeeNote: string | null; signedByEmployee: boolean; signedBySupervisor: boolean; history: { version: number; status: string }[];
  can: { edit: boolean; issue: boolean; signAsEmployee: boolean; signAsSupervisor: boolean; check: boolean; revise: boolean };
}
export interface TeamRow { positionId: string; position: string; person: string | null; contract: { id: string; step: ContractView['step'] } | null; canCreate: boolean }
export type ContractResult = { ok: true; outcome?: 'issued' | 'sent_for_check' | 'signed' | 'fully_signed'; id?: string } | { ok: false; error: string };

export interface ContractsAccess {
  hasAny(): boolean;
  page(): { tabs: ContractTab[]; opensOn: ContractTab; mine: ContractView[]; team: TeamRow[]; check: ContractView[]; overview: { byStep: { step: string; n: number }[]; none: number; limits: { standing: number; single: number | null; showDraft: boolean } } | null };
  contract(id: string): ContractView | null;
  sources(contractId: string): { activities: { id: string; label: string; remaining: number | null; unit: string }[]; shares: { id: string; label: string }[]; breakdowns: { id: string; label: string }[]; dependable: { id: string; label: string }[] };
  createDraft(positionId: string): ContractResult;
  addObjective(contractId: string, o: { source: ObjectiveView['source']; refId?: string; title: string; quantity: number | null; unit: string; weight: number }): ContractResult;
  updateObjective(id: string, o: { title?: string; quantity?: number | null; weight?: number }): ContractResult;
  removeObjective(id: string): ContractResult;
  addDependency(contractObjectiveId: string, onActivityId: string, neededBy: string, note: string): ContractResult;
  removeDependency(id: string): ContractResult;
  issue(id: string): ContractResult;
  clearCheck(id: string): ContractResult;
  sendBack(id: string, reason: string): ContractResult;
  sign(id: string, note: string): ContractResult;
  revise(id: string): ContractResult;
  saveLimits(l: { standing: number; single: number | null; showDraft: boolean }): ContractResult;
  needs(): NeedsYouItem[];
  dependsLines(contractObjectiveId: string): string[];
}

export function createContractsAccess(c: Ctx): ContractsAccess {
  const { s, viewer: v, now, financialYear: fy } = c;
  const C = en.contracts;
  const isHr = v.roles.includes('hr');
  const mine = (pos: string | null | undefined) => !!pos && v.positionIds.includes(pos as never);
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const audit = (action: string, type: string, id: string, before: unknown, after: unknown) =>
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type, id }, before, after });
  const gate = (code: 'contract.issue' | 'contract.sign', id: string, outcome: 'passed' | 'blocked', keys: string[], advisory: string[] = []) =>
    s.gateEvents.push({ id: `ge-${s.gateEvents.length + 1}` as never, orgId: s.organisation.id, gate: code, subject: { type: 'PerformanceContract', id }, attempted: stamp(), outcome, blockingFindingKeys: keys, advisoryAtGate: advisory.map((findingKey) => ({ findingKey, acknowledgementId: null })) });
  const person = (id: string | null | undefined) => s.people.find((p) => p.id === id)?.fullName ?? '';
  const holder = (pos: string | null) => person(holdersOf(s, pos, now)[0]);
  const posTitle = (pos: string | null) => s.positions.find((p) => p.id === pos)?.title ?? '';
  const yearContracts = () => s.contracts.filter((x) => x.financialYear === fy);
  const find = (id: string) => yearContracts().find((x) => x.id === id);
  const roles = (ct: PerformanceContract) => ({
    employee: ct.personId === v.personId,
    supervisor: mine(supervisorPositionOf(s, ct)),
    reviewer: mine(reviewerPositionOf(s, ct, now)),
  });
  const step = (ct: PerformanceContract): ContractView['step'] =>
    ct.status === 'draft' ? (ct.preIssueCheck?.outcome === 'waiting' ? 'waiting_check' : ct.preIssueCheck?.outcome === 'sent_back' ? 'sent_back' : 'draft') : ct.status;
  const visible = (ct: PerformanceContract) => { const r = roles(ct); return r.supervisor || isHr || (r.employee && (ct.status !== 'draft' || s.organisation.settings.showDraftToEmployee)) || (r.reviewer && ct.preIssueCheck?.outcome === 'waiting'); };
  const act = (id: string | null | undefined) => s.activities.find((a) => a.id === id);
  const levelName = (l: string | null | undefined) => (l ? (en.sixP as Record<string, string>)[l] ?? l : null);

  const depText = (d: Dependency) => {
    const a = 'activityId' in d.on ? act((d.on as { activityId: string }).activityId) : null;
    const sh = 'shareId' in d.on ? s.kpiShares.find((x) => x.id === (d.on as { shareId: string }).shareId) : null;
    if (a) return C.dependsOn(`${a.code} ${a.title}`, posTitle(a.ownerPositionId) + (holder(a.ownerPositionId) ? '' : ` ${C.vacant}`), levelName(a.decisionLevel) ?? '', formatDate(d.neededBy));
    return C.dependsOnShare(s.units.find((u) => u.id === sh?.unitId)?.name ?? '', formatDate(d.neededBy));
  };
  const flagText = (f: string, d: Dependency) => (f === 'late' ? C.flags.late(formatDate(d.neededBy)) : C.flags[f as 'not_carried' | 'higher_level']);
  const depsOf = (coId: string) => s.dependencies.filter((d) => 'contractObjectiveId' in d.from && (d.from as { contractObjectiveId: string }).contractObjectiveId === coId);

  const describe = (ch: DraftCheck, cos: ContractObjective[]): string => {
    const t = (id: string) => cos.find((x) => x.id === id)?.title ?? '';
    switch (ch.kind) {
      case 'weights': return C.checks.weights(ch.total);
      case 'no_quantity': return C.checks.noQuantity(t(ch.contractObjectiveId));
      case 'standing_duties': return C.checks.standing(ch.pct, ch.limit);
      case 'single_limit': return C.checks.single(t(ch.contractObjectiveId), ch.pct, ch.limit);
      case 'over_activity': { const a = act(ch.activityId); return C.checks.overActivity(a ? `${a.code}` : '', ch.planned.toLocaleString('en-GB'), ch.total.toLocaleString('en-GB'), a?.quantityTarget?.unit ?? ''); }
      case 'dependency': { const d = s.dependencies.find((x) => x.id === ch.dependencyId)!; const co = cos.find((x) => x.id === (d.from as { contractObjectiveId: string }).contractObjectiveId); return C.checks.dependency(co?.title ?? '', depText(d), ch.flags.map((f) => flagText(f, d)).join('; ')); }
    }
  };

  const view = (ct: PerformanceContract): ContractView => {
    const r = roles(ct);
    const cos = s.contractObjectives.filter((co) => co.contractId === ct.id);
    const checks = ct.status === 'draft' ? draftChecks(s, ct.id, now) : { mustFix: [], worth: [], fairness: false };
    const st = step(ct);
    return {
      id: ct.id, person: person(ct.personId), position: posTitle(ct.positionId), supervisor: holder(supervisorPositionOf(s, ct)), reviewer: holder(reviewerPositionOf(s, ct, now)),
      version: ct.version ?? 1, step: st, checkReason: ct.preIssueCheck?.outcome === 'sent_back' ? ct.preIssueCheck.reason : null,
      objectives: cos.map((co) => {
        const a = act(co.sourceActivityId);
        const source: ObjectiveView['source'] = co.standingDuty ? 'duty' : co.sourceShareId ? 'share' : co.sourceBreakdownId ? 'combined' : 'activity';
        const q = co.snapshot?.quantityTarget ?? co.quantityTarget;
        return {
          id: co.id, title: co.snapshot?.title ?? co.title, source,
          sourceText: source === 'duty' ? en.targets.standingDuty : source === 'activity' && a ? C.fromActivity(`${a.code} ${a.title}`) : source === 'share' ? C.fromShare : C.fromCombined,
          level: levelName(a?.decisionLevel), quantity: q?.value ?? null, unit: q?.unit ?? '', weight: co.weightPct,
          deps: depsOf(co.id).map((d) => ({ id: d.id, text: depText(d), neededBy: d.neededBy, note: d.note, flags: dependencyFlags(s, d, fy, now).map((f) => flagText(f, d)) })),
        };
      }),
      weightTotal: cos.reduce((a, co) => a + co.weightPct, 0),
      mustFix: checks.mustFix.map((x) => describe(x, cos)), worth: checks.worth.map((x) => describe(x, cos)), fairness: checks.fairness,
      employeeNote: ct.employeeNote ?? null, signedByEmployee: !!ct.signedByEmployee, signedBySupervisor: !!ct.signedBySupervisor,
      history: s.contracts.filter((x) => x.positionId === ct.positionId && x.financialYear === fy && x.id !== ct.id).map((x) => ({ version: x.version ?? 1, status: x.status })),
      can: {
        edit: r.supervisor && ct.status === 'draft' && st !== 'waiting_check',
        issue: r.supervisor && ct.status === 'draft' && st !== 'waiting_check',
        signAsEmployee: r.employee && ct.status === 'issued' && !ct.signedByEmployee,
        signAsSupervisor: r.supervisor && ct.status === 'issued' && !ct.signedBySupervisor,
        check: r.reviewer && !r.supervisor && st === 'waiting_check',
        revise: r.supervisor && ct.status === 'signed' && !s.contracts.some((x) => x.previousVersionId === ct.id && x.status !== 'closed'),
      },
    };
  };

  const team = (): TeamRow[] => s.positions.filter((p) => mine(p.reportsToPositionId as string | null)).map((p) => {
    const ct = yearContracts().filter((x) => x.positionId === p.id && x.status !== 'closed').sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0];
    const who = holdersOf(s, p.id, now)[0];
    return { positionId: p.id, position: p.title, person: who ? person(who) : null, contract: ct ? { id: ct.id, step: step(ct) } : null, canCreate: !ct && !!who };
  });

  const canEditObjective = (coId: string) => { const co = s.contractObjectives.find((x) => x.id === coId); const ct = co && find(co.contractId); return ct && view(ct).can.edit ? { co: co!, ct } : null; };

  const freeze = (ct: PerformanceContract) => {
    for (const co of s.contractObjectives.filter((x) => x.contractId === ct.id)) {
      const a = act(co.sourceActivityId);
      co.snapshot = { title: co.title, quantityTarget: co.quantityTarget, sourceFingerprint: a ? activityFingerprint(a) : `${co.sourceShareId ?? co.sourceBreakdownId ?? 'duty'}`, frozenAt: c.clock() };
    }
    ct.status = 'signed';
    if (ct.previousVersionId) { const old = s.contracts.find((x) => x.id === ct.previousVersionId); if (old) { old.status = 'closed'; old.updated = stamp(); } }
  };

  return {
    hasAny: () => isHr || team().length > 0 || yearContracts().some((ct) => visible(ct)),
    page() {
      const all = yearContracts().filter(visible);
      const mineC = all.filter((ct) => roles(ct).employee && ct.status !== 'closed').map(view);
      const tm = team();
      const check = all.filter((ct) => roles(ct).reviewer && step(ct) === 'waiting_check').map(view);
      const tabs: ContractTab[] = [];
      if (mineC.length || yearContracts().some((ct) => roles(ct).employee)) tabs.push('mine');
      if (tm.length) tabs.push('team');
      if (yearContracts().some((ct) => roles(ct).reviewer)) tabs.push('check');
      if (isHr) tabs.push('overview');
      const steps = ['draft', 'waiting_check', 'sent_back', 'issued', 'signed'] as const;
      const overview = isHr ? {
        byStep: steps.map((x) => ({ step: x, n: yearContracts().filter((ct) => ct.status !== 'closed' && step(ct) === x).length })),
        none: s.positions.filter((p) => holdersOf(s, p.id, now).length && !yearContracts().some((ct) => ct.positionId === p.id && ct.status !== 'closed')).length,
        limits: { standing: s.organisation.settings.standingDutyLimitPct, single: s.organisation.settings.singleObjectiveLimitPct, showDraft: s.organisation.settings.showDraftToEmployee },
      } : null;
      const todo = (t: ContractTab) => (t === 'team' ? tm.some((x) => x.canCreate || (x.contract && ['draft', 'sent_back'].includes(x.contract.step))) : t === 'check' ? check.length > 0 : t === 'mine' ? mineC.some((x) => x.can.signAsEmployee) : false);
      return { tabs, opensOn: tabs.find(todo) ?? tabs[0] ?? 'mine', mine: mineC, team: tm, check, overview };
    },
    contract(id) { const ct = find(id); return ct && visible(ct) ? view(ct) : null; },
    sources(contractId) {
      const ct = find(contractId);
      if (!ct) return { activities: [], shares: [], breakdowns: [], dependable: [] };
      const pos = s.positions.find((p) => p.id === ct.positionId);
      const acts = [...s.activities]
        .sort((a, b) => Number(b.ownerPositionId === ct.positionId || (s.positions.find((p) => p.id === b.ownerPositionId)?.unitId === pos?.unitId)) - Number(a.ownerPositionId === ct.positionId || (s.positions.find((p) => p.id === a.ownerPositionId)?.unitId === pos?.unitId)));
      return {
        activities: acts.map((a) => ({ id: a.id, label: `${a.code} ${a.title}`, remaining: a.quantityTarget ? a.quantityTarget.value - carriedQuantity(s, a.id, fy) : null, unit: a.quantityTarget?.unit ?? '' })),
        shares: s.kpiShares.filter((x) => x.ownerPositionId === ct.positionId).map((x) => ({ id: x.id, label: `${s.kpis.find((k) => k.id === s.kpiBreakdowns.find((b) => b.id === x.breakdownId)?.kpiId)?.name ?? ''}, ${s.units.find((u) => u.id === x.unitId)?.name ?? ''}` })),
        breakdowns: s.kpiBreakdowns.filter((b) => b.financialYear === fy && s.kpis.find((k) => k.id === b.kpiId)?.ownerPositionId === ct.positionId).map((b) => ({ id: b.id, label: s.kpis.find((k) => k.id === b.kpiId)?.name ?? '' })),
        dependable: acts.map((a) => ({ id: a.id, label: `${a.code} ${a.title} (${posTitle(a.ownerPositionId) || C.noOwner})` })),
      };
    },
    createDraft(positionId) {
      const row = team().find((x) => x.positionId === positionId);
      if (!row || !row.canCreate) return { ok: false, error: 'not_allowed' };
      const st = stamp();
      const id = `pc-${positionId}-${fy}`;
      s.contracts.push({ orgId: s.organisation.id, id: id as never, personId: holdersOf(s, positionId, now)[0] as never, positionId: positionId as never, financialYear: fy, status: 'draft', signedByEmployee: null, signedBySupervisor: null, version: 1, previousVersionId: null, employeeNote: null, preIssueCheck: null, created: st, updated: st });
      audit('create', 'PerformanceContract', id, null, { positionId });
      c.changed();
      return { ok: true, id };
    },
    addObjective(contractId, o) {
      const ct = find(contractId);
      if (!ct || !view(ct).can.edit) return { ok: false, error: 'not_allowed' };
      if (!o.title.trim()) return { ok: false, error: 'title_required' };
      const a = o.source === 'activity' ? act(o.refId) : undefined;
      if (o.source === 'activity' && !a) return { ok: false, error: 'source_required' };
      const st = stamp();
      const co: ContractObjective = {
        orgId: s.organisation.id, id: `co-${contractId}-${s.contractObjectives.length + 1}` as never, contractId: ct.id,
        sourceActivityId: a ? a.id : null, sourceShareId: o.source === 'share' ? (o.refId as never) : null, sourceBreakdownId: o.source === 'combined' ? (o.refId as never) : null,
        standingDuty: o.source === 'duty' ? { description: o.title.trim() } : null, servesShareId: null,
        title: o.title.trim(), quantityTarget: o.source === 'share' || o.source === 'combined' ? null : { value: o.quantity ?? 0, unit: a?.quantityTarget?.unit ?? o.unit },
        snapshot: null, direction: 'higher_is_better', weightPct: o.weight, created: st, updated: st,
      };
      s.contractObjectives.push(co);
      audit('create', 'ContractObjective', co.id, null, { source: o.source, refId: o.refId ?? null, weightPct: o.weight });
      c.changed();
      return { ok: true, id: co.id };
    },
    updateObjective(id, o) {
      const x = canEditObjective(id);
      if (!x) return { ok: false, error: 'not_allowed' };
      const before = { title: x.co.title, quantityTarget: x.co.quantityTarget, weightPct: x.co.weightPct };
      if (o.title !== undefined && o.title.trim()) x.co.title = o.title.trim();
      if (o.quantity !== undefined && x.co.quantityTarget) x.co.quantityTarget = { ...x.co.quantityTarget, value: o.quantity ?? 0 };
      if (o.weight !== undefined) x.co.weightPct = o.weight;
      x.co.updated = stamp();
      audit('update', 'ContractObjective', id, before, { title: x.co.title, quantityTarget: x.co.quantityTarget, weightPct: x.co.weightPct });
      c.changed();
      return { ok: true };
    },
    removeObjective(id) {
      const x = canEditObjective(id);
      if (!x) return { ok: false, error: 'not_allowed' };
      s.contractObjectives = s.contractObjectives.filter((co) => co.id !== id);
      s.dependencies = s.dependencies.filter((d) => !('contractObjectiveId' in d.from && d.from.contractObjectiveId === id));
      audit('delete', 'ContractObjective', id, null, null);
      c.changed();
      return { ok: true };
    },
    addDependency(coId, onActivityId, neededBy, note) {
      const x = canEditObjective(coId);
      if (!x) return { ok: false, error: 'not_allowed' };
      if (!act(onActivityId) || !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) return { ok: false, error: 'source_required' };
      // A circle is refused when the link is made (section 4).
      if (makesCircle(s, x.co.sourceActivityId ?? x.co.id, onActivityId)) return { ok: false, error: 'circle' };
      const st = stamp();
      const d: Dependency = { orgId: s.organisation.id, id: `dep-${coId}-${s.dependencies.length + 1}` as never, from: { contractObjectiveId: coId as never }, on: { activityId: onActivityId as never }, neededBy: neededBy as ISODate, note: note.trim(), created: st, updated: st };
      s.dependencies.push(d);
      audit('create', 'Dependency', d.id, null, { from: d.from, on: d.on, neededBy });
      c.changed();
      return { ok: true };
    },
    removeDependency(id) {
      const d = s.dependencies.find((x) => x.id === id);
      if (!d || !('contractObjectiveId' in d.from) || !canEditObjective(d.from.contractObjectiveId)) return { ok: false, error: 'not_allowed' };
      s.dependencies = s.dependencies.filter((x) => x.id !== id);
      audit('delete', 'Dependency', id, null, null);
      c.changed();
      return { ok: true };
    },
    issue(id) {
      const ct = find(id);
      if (!ct || !view(ct).can.issue) return { ok: false, error: 'not_allowed' };
      const ch = draftChecks(s, id, now);
      if (ch.mustFix.length) { gate('contract.issue', id, 'blocked', ch.mustFix.map((x) => `contract:${x.kind}`)); c.changed(); return { ok: false, error: 'must_fix' }; }
      // CT-5: a dependency worth checking goes to the next-level reviewer first; they clear or send it back.
      if (ch.fairness && ct.preIssueCheck?.outcome !== 'cleared') {
        ct.preIssueCheck = { by: stamp(), outcome: 'waiting', reason: null };
        audit('send_for_check', 'PerformanceContract', id, null, { reasons: ch.worth.map((w) => w.kind) });
        c.changed();
        return { ok: true, outcome: 'sent_for_check' };
      }
      ct.status = 'issued'; ct.updated = stamp();
      gate('contract.issue', id, 'passed', [], ch.worth.map((w) => `contract:${w.kind}`));
      audit('issue', 'PerformanceContract', id, { status: 'draft' }, { status: 'issued' });
      c.changed();
      return { ok: true, outcome: 'issued' };
    },
    clearCheck(id) {
      const ct = find(id);
      if (!ct || !view(ct).can.check) return { ok: false, error: 'not_allowed' };
      ct.preIssueCheck = { by: stamp(), outcome: 'cleared', reason: null };
      audit('check_cleared', 'PerformanceContract', id, null, ct.preIssueCheck);
      c.changed();
      return { ok: true };
    },
    sendBack(id, reason) {
      const ct = find(id);
      if (!ct || !view(ct).can.check) return { ok: false, error: 'not_allowed' };
      if (!reason.trim()) return { ok: false, error: 'reason_required' };
      ct.preIssueCheck = { by: stamp(), outcome: 'sent_back', reason: reason.trim() };
      audit('check_sent_back', 'PerformanceContract', id, null, ct.preIssueCheck);
      c.changed();
      return { ok: true };
    },
    sign(id, note) {
      const ct = find(id);
      if (!ct) return { ok: false, error: 'not_allowed' };
      const vv = view(ct);
      if (vv.can.signAsEmployee) { ct.signedByEmployee = stamp(); ct.employeeNote = note.trim() || null; }
      else if (vv.can.signAsSupervisor) ct.signedBySupervisor = stamp();
      else return { ok: false, error: 'not_allowed' };
      gate('contract.sign', id, 'passed', []);
      if (ct.signedByEmployee && ct.signedBySupervisor) freeze(ct);
      ct.updated = stamp();
      audit('sign', 'PerformanceContract', id, null, { employee: !!ct.signedByEmployee, supervisor: !!ct.signedBySupervisor, employeeNote: ct.employeeNote ?? null });
      c.changed();
      return { ok: true, outcome: ct.status === 'signed' ? 'fully_signed' : 'signed' };
    },
    revise(id) {
      const ct = find(id);
      if (!ct || !view(ct).can.revise) return { ok: false, error: 'not_allowed' };
      const st = stamp();
      const version = (ct.version ?? 1) + 1;
      const nid = `${ct.id}-v${version}`;
      s.contracts.push({ ...structuredClone(ct), id: nid as never, status: 'draft', version, previousVersionId: ct.id, signedByEmployee: null, signedBySupervisor: null, employeeNote: null, preIssueCheck: null, created: st, updated: st });
      for (const co of s.contractObjectives.filter((x) => x.contractId === ct.id)) {
        const copy: ContractObjective = { ...structuredClone(co), id: `${co.id}-v${version}` as never, contractId: nid as never, snapshot: null, created: st, updated: st };
        s.contractObjectives.push(copy);
        for (const d of depsOf(co.id)) s.dependencies.push({ ...structuredClone(d), id: `${d.id}-v${version}` as never, from: { contractObjectiveId: copy.id }, created: st, updated: st });
      }
      audit('revise', 'PerformanceContract', nid, { version: version - 1 }, { version });
      c.changed();
      return { ok: true, id: nid };
    },
    saveLimits(l) {
      if (!isHr) return { ok: false, error: 'not_allowed' };
      if (!(l.standing >= 0 && l.standing <= 100) || (l.single !== null && !(l.single > 0 && l.single <= 100))) return { ok: false, error: 'bad_number' };
      const before = { ...s.organisation.settings };
      s.organisation.settings.standingDutyLimitPct = l.standing;
      s.organisation.settings.singleObjectiveLimitPct = l.single;
      s.organisation.settings.showDraftToEmployee = l.showDraft;
      audit('update', 'Organisation', s.organisation.id, { limits: [before.standingDutyLimitPct, before.singleObjectiveLimitPct, before.showDraftToEmployee] }, { limits: [l.standing, l.single, l.showDraft] });
      c.changed();
      return { ok: true };
    },
    needs() {
      const out: NeedsYouItem[] = [];
      const waiting = yearContracts().filter((ct) => roles(ct).reviewer && !roles(ct).supervisor && step(ct) === 'waiting_check');
      if (waiting.length) out.push({ key: 'contracts:check', kind: 'approval', title: C.needs.check(waiting.length), detail: null, due: null, daysOverdue: null, severity: null, as: null, link: { kind: 'contracts', tab: 'check' } });
      for (const ct of yearContracts().filter((x) => roles(x).supervisor && step(x) === 'sent_back')) out.push({ key: `contracts:sent_back:${ct.id}`, kind: 'deadline', title: C.needs.sentBack(person(ct.personId)), detail: ct.preIssueCheck?.reason ?? null, due: null, daysOverdue: null, severity: null, as: 'supervisor', link: { kind: 'contracts', contractId: ct.id } });
      return out;
    },
    dependsLines(coId) {
      const co = s.contractObjectives.find((x) => x.id === coId);
      const base = co?.contractId ? s.contracts.find((x) => x.id === co.contractId) : undefined;
      return depsOf(coId).map((d) => { const f = dependencyFlags(s, d, base?.financialYear ?? fy, now); return `${depText(d)}${f.length ? ` · ${f.map((x) => flagText(x, d)).join('; ')}` : ''}`; });
    },
  };
}
