/**
 * Strategy formation, part 11a (BUILD-BRIEF section 30): setting up a formed plan, the formation tracker, the
 * preparer-built calendar and its sessions with decision logs. Behaviour from the approved Strategy workspace
 * prototype (`reference/caspa-strategy-prototype.html`).
 */
import { useState, type ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import type { FormationPage, ScheduleItemView, SessionView } from '../data/access/formation';
import type { FormationStage, FourQCell, ISODate, WorkshopPurpose } from '../contract/caspa-data-contract';
import { BANDS, CELLS, cellKey, cellOfKey } from '../rules/conception';
import { SESSION_PURPOSES, STAGES, type Format } from '../rules/formation';
import { formatDate, formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, input, label, plural, primary } from './organisation/ui';
import { Board, Documents, MyPart, VisionMission } from './Conception';
import { ValuesGroups } from './ValuesWork';
import { Baselines, Compliance, Room } from './Consultation';
import { Composer } from './Composition';
import { PlanDocumentPanel } from './PlanDocument';
import { hrefFor } from './router';
import type { FormingStage, RegisterTab } from '../selectors/nav';

const F = en.formation;
const K = en.consultation;
const FORMATS: Format[] = ['in_person', 'online', 'hybrid', 'async_review'];
const sessionTitle = (purposes: WorkshopPurpose[]) => en.list(purposes.map((p) => F.purpose[p]!));

/** Tabs within a sub-menu page: real links, so every view has its own address (NV-5). */
export function PageTabs({ label: name, tabs, current }: { label: string; tabs: [string, string, string][]; current: string }) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={name} className="mt-4 flex flex-wrap gap-2">
      {tabs.map(([k, l, href]) => (
        <a key={k} href={href} aria-current={current === k ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-4 text-14 font-semibold ${current === k ? 'bg-navy text-white' : 'border border-control bg-white text-navy hover:border-navy'}`}>{l}</a>
      ))}
    </nav>
  );
}

/** Strategy overview: setting up the next plan, or a pointer to it while it is being formed (part 11a, NV-9). */
export function NextPlanCard({ open = false, onCancel }: { open?: boolean; onCancel?: () => void } = {}) {
  const { repo } = useApp();
  const f = repo.formation.page();
  const [setup, setSetup] = useState(open);
  const forming = repo.menu().strategy.some((e) => e.entry === 'forming');
  if (f.plan) {
    if (!forming) return null;
    return (
      <section className={`${card} mt-6`} aria-labelledby="next-plan">
        <h2 id="next-plan" className="text-18 font-bold text-navy">{en.menu.entry.forming}</h2>
        <p className="mt-1 text-14 text-muted">{en.menu.formingCard(f.plan.title)}</p>
        <a className={`${btn} mt-3`} href={hrefFor({ kind: 'strategy', entry: 'forming' })}>{en.menu.formingOpen}</a>
      </section>
    );
  }
  return (
    <section className={`${card} mt-6`} aria-labelledby="next-plan">
      <h2 id="next-plan" className="text-18 font-bold text-navy">{f.activePlan ? F.nextPlan : en.onboarding.formDoor}</h2>
      {f.activePlan && <p className="mt-1 text-14 text-muted">{F.nextPlanText(f.activePlan.title)}</p>}
      {setup && f.canSetUp ? <SetupForm f={f} onDone={() => { setSetup(false); onCancel?.(); }} /> : f.canSetUp
        ? <button type="button" className={`${primary} mt-3`} onClick={() => setSetup(true)}>{F.nextPlanStart}</button>
        : <p className="mt-2 text-14">{F.nextPlanOthers}</p>}
    </section>
  );
}

/**
 * Forming the next plan (NV-9, C-1): one entry, opening on the stage that is open now, with a stage row
 * (Overview, Conception, Consultation, Composition). Someone here only to have their say sees the room alone.
 */
export function FormingPage({ stage, tab }: { stage?: FormingStage; tab?: string }) {
  const { repo, navigate } = useApp();
  const f = repo.formation.page();
  const menu = repo.menu();
  const m = menu.forming;
  const [setup, setSetup] = useState(false);
  if (!f.plan || !m) return null;
  const p = f.plan;
  const st: FormingStage = stage && m.stages.includes(stage) ? stage : m.openStage;
  const at = (s2: FormingStage, t2?: string) => hrefFor({ kind: 'strategy', entry: 'forming', stage: s2, tab: t2 });
  const c = repo.conception.page();
  const room = repo.consultation.room();
  const comp = repo.composition.page();
  const C = en.conception.tabs;
  const mine = c ? c.departments.filter((x) => c.myDepartments.includes(x.unitId)) : [];
  let tabs: [string, string, string][] = [];
  let body: ReactNode = null;
  let current = '';
  if (st === 'overview') {
    // v0.26.0: the schedule replaces the stage list and the calendar; their old addresses open the schedule.
    tabs = (['schedule', 'sessions'] as const).map((k) => [k, en.menu.overviewTabs[k], at('overview', k)]);
    current = tab === 'sessions' ? 'sessions' : 'schedule';
    body = current === 'sessions' ? <Sessions f={f} /> : <Schedule f={f} />;
  } else if (st === 'conception' && c) {
    tabs = [
      ...(mine.length ? [['mine', mine.length === 1 ? C.mine(mine[0]!.name) : C.mineMany, at('conception', 'mine')] as [string, string, string]] : []),
      ...(c.seesAll || mine.length ? [['board', C.board, at('conception', 'board')] as [string, string, string]] : []),
      ['vision', C.vision, at('conception', 'vision')],
      ...(c.seesAll ? [['documents', C.documents, at('conception', 'documents')] as [string, string, string]] : []),
    ];
    current = tab && tabs.some(([k]) => k === tab) ? tab : tabs[0]![0];
    body = current === 'mine' ? <MyPart c={c} /> : current === 'board' ? <Board c={c} openVision={() => navigate({ kind: 'strategy', entry: 'forming', stage: 'conception', tab: 'vision' })} />
      : current === 'documents' ? <Documents c={c} /> : <VisionMission c={c} />;
  } else if (st === 'consultation' && room) {
    body = <Room r={room} />;
  } else if (st === 'composition' && comp) {
    body = <Composer c={comp} />;
  }
  return (
    <>
      {!m.audienceOnly && (
        <div className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-[1_1_15rem]">
              <h2 className="text-18 font-bold text-navy">{p.title}</h2>
              <p className="mt-1 text-13 text-muted">
                {p.label}{p.processOwner ? ` · ${F.tracker.processOwner(`${p.processOwner.label} (${p.processOwner.holder ?? en.onboarding.vacant})`)}` : ''}
              </p>
            </div>
            {f.canSetUp && !setup && <button type="button" className={btn} onClick={() => setSetup(true)}>{F.setup.edit}</button>}
          </div>
          {setup && f.canSetUp && <SetupForm f={f} onDone={() => setSetup(false)} />}
        </div>
      )}
      {!m.audienceOnly && (
        <nav aria-label={en.menu.stagesLabel} className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-white px-2">
          {m.stages.map((s2) => (
            <a key={s2} href={at(s2)} aria-current={s2 === st ? 'page' : undefined}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-4 px-3 text-14 ${s2 === st ? 'border-strategy-mark font-bold text-navy' : 'border-transparent text-muted hover:text-navy'}`}>
              {en.menu.stage[s2]}
              {s2 === m.openStage && s2 !== 'overview' && <span className="rounded-full border border-border bg-info-bg px-2 text-12 font-medium text-navy">{en.menu.openNow}</span>}
            </a>
          ))}
        </nav>
      )}
      {menu.formingConfirmed && st !== 'overview' && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{en.menu.readOnly}</p>}
      <PageTabs label={en.menu.stage[st]} tabs={tabs} current={current} />
      <div className="mt-4">{body}</div>
    </>
  );
}

/** Registers (NV-3): baselines and compliance, one entry with two tabs; Compliance first for the compliance officer. */
export function RegistersPage({ tab }: { tab?: string }) {
  const { repo } = useApp();
  const order = repo.menu().registers;
  const bl = repo.consultation.baselines();
  const cp = repo.consultation.compliance();
  if (!order.length) return null;
  const current = order.includes(tab as RegisterTab) ? (tab as RegisterTab) : order[0]!;
  const tabs = order.map((k) => [k, k === 'baselines' ? K.tabs.baselines : K.tabs.compliance, hrefFor({ kind: 'strategy', entry: 'registers', tab: k })] as [string, string, string]);
  return (
    <>
      <PageTabs label={en.menu.entry.registers!} tabs={tabs} current={current} />
      <div className="mt-4">{current === 'baselines' && bl ? <Baselines b={bl} /> : current === 'compliance' && cp ? <Compliance c={cp} /> : null}</div>
    </>
  );
}

/** Plan document (D15-4): the document to read or draft, with its print version at its own address. */
export function PlanDocumentEntry() {
  const pdoc = useApp().repo.planDocument.page();
  if (!pdoc) return null;
  return (
    <>
      <PlanDocumentPanel d={pdoc} />
    </>
  );
}

/* ───────── Plan setup (F-1) ───────── */

function SetupForm({ f, onDone }: { f: FormationPage; onDone: () => void }) {
  const { repo } = useApp();
  const p = f.plan;
  const startDefault = p?.startYear ?? f.nextStartYear;
  const years = Array.from({ length: 12 }, (_v, i) => startDefault - 3 + i);
  const [title, setTitle] = useState(p?.title ?? '');
  const [first, setFirst] = useState(p?.startYear ?? startDefault);
  const [last, setLast] = useState(p?.endYear ?? startDefault + 4);
  const [owner, setOwner] = useState(p?.processOwner?.positionId ?? '');
  const [preparer, setPreparer] = useState(p?.preparer?.membershipId ?? f.preparerOptions[0]?.membershipId ?? '');
  const [error, setError] = useState<string | null>(null);
  const S = F.setup;
  const save = () => {
    const r = repo.formation.setUp({ title: title.trim() || S.titleFor(first, last), startYear: first, endYear: last, processOwnerPositionId: owner || null, preparerMembershipId: preparer || null });
    if (r.ok) onDone();
    else setError(r.error === 'period' ? S.periodError : null);
  };
  return (
    <div className="mt-3">
      {!p && <p className="text-14">{S.intro}</p>}
      {error && <CheckBox tone="block" title={en.setup.edit.cantSave}>{error}</CheckBox>}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="fm-title" className={label}>{S.planTitle}</label><input id="fm-title" className={input} value={title} placeholder={S.titleFor(first, last)} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="fm-first" className={label}>{S.first}</label>
          <select id="fm-first" className={input} value={first} onChange={(e) => setFirst(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{formatFinancialYear(y, f.fyStartMonth)}</option>)}</select></div>
        <div><label htmlFor="fm-last" className={label}>{S.last}</label>
          <select id="fm-last" className={input} value={last} onChange={(e) => setLast(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{formatFinancialYear(y, f.fyStartMonth)}</option>)}</select></div>
        <div><label htmlFor="fm-owner" className={label}>{S.processOwner}</label>
          <select id="fm-owner" className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{S.none}</option>
            {f.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? en.onboarding.vacant})</option>)}
          </select></div>
        <div><label htmlFor="fm-prep" className={label}>{S.preparer}</label>
          <select id="fm-prep" className={input} value={preparer} aria-describedby="fm-prep-note" onChange={(e) => setPreparer(e.target.value)}>
            <option value="">{S.none}</option>
            {f.preparerOptions.map((x) => <option key={x.membershipId} value={x.membershipId}>{x.name} ({x.role})</option>)}
          </select></div>
      </div>
      <p id="fm-prep-note" className="mt-1 text-12 text-muted">{S.preparerNote}</p>
      <p className="mt-2 text-13">{S.invited(formatNumber(f.leadership), formatNumber(f.departmentHeads))}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{p ? S.save : S.start}</button>
        <button type="button" className={btn} onClick={onDone}>{S.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── The forming schedule (Forming Schedule Specification v0.1) ───────── */

/** Part 11c: how far Consultation and Confirmation have got, as in the prototype's formation home. Counts only. */
function Progress() {
  const { repo } = useApp();
  const room = repo.consultation.room();
  const bl = repo.consultation.baselines();
  const cp = repo.consultation.compliance();
  const P = K.progress;
  const rows: [string, string][] = [
    ...(bl ? [[P.baselines, P.of(formatNumber(bl.counts.validated), formatNumber(bl.counts.total))] as [string, string]] : []),
    ...(cp ? [[P.compliance, P.of(formatNumber(cp.counts.reviewed), formatNumber(cp.counts.total))] as [string, string]] : []),
    ...(room?.round && room.seesInputs ? [[P.inputs, formatNumber(room.round.counts.inputs)] as [string, string]] : []),
  ];
  if (!rows.length) return null;
  return (
    <section className={`${card} xl:col-span-2`} aria-labelledby="progress">
      <h3 id="progress" className="text-16 font-bold text-navy">{P.title}</h3>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        {rows.map(([k, v]) => <div key={k} className="rounded-lg bg-cream p-3"><dt className="text-13 text-muted">{k}</dt><dd className="tabular text-22 font-bold text-navy">{v}</dd></div>)}
      </dl>
    </section>
  );
}

const MONTH = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const itemTitle = (i: ScheduleItemView) =>
  i.source.type === 'deadline' ? i.label ?? '' : i.source.type === 'session' ? Sch.sessionTitle(sessionTitle(i.purposes)) : F.gates[i.source.gate]!;
const itemOwner = (i: ScheduleItemView) => (i.source.type === 'deadline' ? en.list(i.owners) : i.source.type === 'session' ? Sch.ownerOffice : Sch.ownerExecutive);
const Sch = F.schedule;

/** Strategy › Forming the next plan › Overview: the schedule of meetings and milestones, with the stage strip. */
function Schedule({ f }: { f: FormationPage }) {
  const { repo, say } = useApp();
  const p = f.plan!;
  const sc = f.schedule;
  const T = F.tracker;
  const [stage, setStage] = useState<FormationStage | null>(null);
  const [adding, setAdding] = useState(false);
  const checkText = (c: FormationPage['checks'][number]) =>
    c.kind === 'purpose_uncovered' ? T.checks.purpose_uncovered(F.purpose[c.purpose]!) : c.kind === 'stage_dates_backwards' ? T.checks.stage_dates_backwards(F.stage[c.stage]!) : T.checks[c.kind];
  const seen = f.seesDraft || !!p.published;
  const st = stage ? p.stages.find((x) => x.stage === stage)! : null;
  const move = (to: 'open' | 'complete') => { if (!stage) return; const r = repo.formation.moveStage(stage, to); if (r.ok) say(Sch.stageMoved[to](F.stage[stage]!)); };
  return (
    <div className="space-y-4">
      <p className="text-14">{sc.next ? <>{Sch.next(itemTitle(sc.next), formatDate(sc.next.date!))}</> : seen && !sc.empty ? Sch.nothingNext : null}</p>
      <section className={card} aria-labelledby="st-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="st-h" className="text-16 font-bold text-navy">{Sch.stagesTitle}</h3>
          <span className="text-12 text-muted">{Sch.stagesNote}</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {p.stages.map((x) => (
            <button key={x.stage} type="button" aria-expanded={stage === x.stage} onClick={() => setStage(stage === x.stage ? null : (x.stage as FormationStage))}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-14 ${stage === x.stage ? 'border-navy bg-info-bg' : 'border-control bg-white'} text-navy`}>
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${x.status === 'open' ? 'bg-navy' : x.status === 'complete' ? 'border-2 border-navy' : 'border border-control'}`} />
              <b>{F.stage[x.stage]}</b><span className="text-12 text-muted">{Sch.stageChip[x.status]}</span>
            </button>
          ))}
        </div>
        {st && stage && (
          <div className="mt-3 rounded-lg bg-cream p-3">
            <p className="text-13"><span className="font-semibold">{F.stage[stage]}: </span>{en.book.sevenCStage[F.stage[stage]!]?.text}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-14">{Sch.stageItems(F.stage[stage]!, plural(sc.counts[stage], 'scheduleItem'), Sch.stageNow[st.status]!)}</span>
              {sc.canMoveStages && (st.status === 'open'
                ? <button type="button" className={btn} onClick={() => move('complete')}>{Sch.closeStage(F.stage[stage]!)}</button>
                : <button type="button" className={primary} onClick={() => move('open')}>{st.status === 'complete' ? Sch.reopenStage(F.stage[stage]!) : Sch.openStage(F.stage[stage]!)}</button>)}
            </div>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="sc-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sc-h" className="text-16 font-bold text-navy">{Sch.title}</h3>
          <span className="flex flex-wrap items-center gap-2">
            {p.preparer && <Chip tone={p.published ? 'complete' : 'info'}>{p.published ? T.published(formatDate(p.published.on)) : T.notPublished}</Chip>}
            {sc.canEdit && !sc.empty && <button type="button" className={btn} aria-expanded={adding} onClick={() => setAdding(!adding)}>{Sch.add}</button>}
            {f.isPreparer && !sc.empty && <button type="button" className={primary} onClick={() => { if (repo.formation.publishCalendar().ok) say(F.calendar.published); }}>{p.published ? F.calendar.republish : F.calendar.publish}</button>}
          </span>
        </div>
        {!p.preparer && <p className="mt-2 text-14">{T.noPreparer}</p>}
        {!seen && p.preparer && <p className="mt-2 text-14 text-muted">{T.notYet(p.preparer.name)}</p>}
        {adding && <AddItem f={f} onDone={() => setAdding(false)} />}
        {seen && sc.empty && (
          <div className="mt-3 rounded-lg border border-dashed border-control p-4">
            <p className="text-14 font-semibold text-navy">{Sch.empty}</p>
            {sc.canBuild ? (
              <>
                <p className="mt-1 text-13 text-muted">{Sch.emptyNote}</p>
                <button type="button" className={`${primary} mt-3`} onClick={() => { const r = repo.formation.buildSchedule(); if (r.ok) say(Sch.built); }}>{Sch.build}</button>
              </>
            ) : p.preparer ? <p className="mt-1 text-13 text-muted">{Sch.emptyOthers(p.preparer.name)}</p> : null}
          </div>
        )}
        {sc.months.map((m) => (
          <div key={m.month} className="mt-4">
            <h4 className="text-16 font-bold text-navy">{MONTH(m.month)}</h4>
            <ul className="mt-1 divide-y divide-border">{m.items.map((i) => <ItemRow key={i.key} i={i} />)}</ul>
          </div>
        ))}
        {sc.undated.length > 0 && (
          <div className="mt-4">
            <h4 className="text-16 font-bold text-navy">{Sch.notScheduled(formatNumber(sc.undated.length))}</h4>
            <ul className="mt-1 divide-y divide-border">{sc.undated.map((i) => <ItemRow key={i.key} i={i} />)}</ul>
          </div>
        )}
      </section>
      {f.seesDraft && <Progress />}
      {f.checks.length > 0 && (
        <section className={card}>
          <h3 className="text-16 font-bold text-navy">{T.worth}</h3>
          {f.checks.map((c, i) => <CheckBox key={i} tone="advisory" title={T.worth}>{checkText(c)}</CheckBox>)}
        </section>
      )}
    </div>
  );
}

function ItemRow({ i }: { i: ScheduleItemView }) {
  const { repo, say } = useApp();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(i.label ?? '');
  const title = itemTitle(i);
  const setDate = (v: string) => {
    const on = (v || null) as ISODate | null;
    const r = i.source.type === 'session' ? repo.formation.updateSession(i.source.id, { scheduledOn: on })
      : i.source.type === 'deadline' ? repo.formation.updateDeadline(i.source.id, { dueOn: on }) : repo.formation.setGateTarget(i.source.gate, on);
    if (r.ok) say(Sch.dateSet);
  };
  const statusChip = i.status === 'done' ? <Chip tone="complete">{Sch.status.done}</Chip>
    : i.status === 'overdue' ? <Chip tone="block">{Sch.status.overdue}</Chip>
    : i.status === 'today' ? <Chip tone="advisory">{Sch.status.today}</Chip>
    : i.status === 'soon' ? <Chip tone="advisory">{Sch.status.soon(i.inDays!)}</Chip> : null;
  const linked = i.linked === 'session' ? Sch.linked.session : i.linked ? Sch.linked[i.linked] : null;
  const [y, m, dd] = i.date ? i.date.split('-') : [];
  return (
    <li className={`flex flex-wrap items-start gap-3 py-3 ${i.kind === 'confirmation' ? 'border-l-4 border-l-navy pl-3' : ''}`}>
      <div className="w-14 shrink-0 text-center">
        {i.date ? <><b className="tabular block text-18 text-navy">{Number(dd)}</b><span className="text-12 text-muted">{new Date(`${y}-${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span></> : <span className="text-12 text-muted">{Sch.noDate}</span>}
      </div>
      <div className="min-w-0 flex-[1_1_14rem]">
        <p className="text-14 font-semibold text-navy">{title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-12 text-muted">
          <span>{F.stage[i.stage]}</span><span>{Sch.kind[i.kind]}</span><span>{itemOwner(i)}</span>
          {i.kind === 'confirmation' && <span className="font-semibold text-navy">{Sch.enforced}</span>}
          {i.needsBoard && <span className="font-semibold text-navy">{Sch.needsBoard}</span>}
        </p>
        {linked && <p className="mt-1 text-12 text-muted">{typeof linked === 'function' ? linked(sessionTitle(i.purposes)) : linked}</p>}
        {edit && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {i.canSetDate && i.date && (
              <div><label htmlFor={`cd-${i.key}`} className={label}>{Sch.dateFor(title)}</label><input id={`cd-${i.key}`} type="date" className={`${input} w-40`} value={i.date} onChange={(e) => setDate(e.target.value)} /></div>
            )}
            {i.canSetDate && i.date && i.source.type === 'gate' && <button type="button" className={btn} onClick={() => setDate('')}>{Sch.clearDate}</button>}
            {i.canEdit && (
              <>
                <div className="min-w-0 flex-[1_1_12rem]"><label htmlFor={`rn-${i.key}`} className={label}>{Sch.rename}</label><input id={`rn-${i.key}`} className={input} value={name} onChange={(e) => setName(e.target.value)} /></div>
                <button type="button" className={btn} onClick={() => { if (i.source.type === 'deadline' && repo.formation.updateDeadline(i.source.id, { label: name }).ok) setEdit(false); }}>{Sch.save}</button>
                <button type="button" className={btn} onClick={() => { if (i.source.type === 'deadline') repo.formation.removeDeadline(i.source.id); }}>{Sch.remove}<span className="sr-only">: {title}</span></button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {statusChip}
        {i.canSetDate && !i.date && (
          <>
            <label htmlFor={`dt-${i.key}`} className="sr-only">{Sch.dateFor(title)}</label>
            <input id={`dt-${i.key}`} type="date" className={`${input} w-40`} value={i.date ?? ''} onChange={(e) => setDate(e.target.value)} />
          </>
        )}
        {i.canMarkDone && <button type="button" className={btn} onClick={() => { if (i.source.type === 'deadline' && repo.formation.markDeadlineDone(i.source.id).ok) say(Sch.markedDone); }}>{Sch.markDone}<span className="sr-only">{Sch.markDoneFor(title)}</span></button>}
        {(i.canEdit || (i.canSetDate && !!i.date)) && <button type="button" className={btn} aria-expanded={edit} onClick={() => setEdit(!edit)}>{en.formation.groups.edit}<span className="sr-only">: {title}</span></button>}
      </div>
    </li>
  );
}

function AddItem({ f, onDone }: { f: FormationPage; onDone: () => void }) {
  const { repo, say } = useApp();
  const [v, setV] = useState({ what: '', kind: 'meeting' as 'meeting' | 'milestone', stage: 'conception' as FormationStage, date: '', owner: f.plan?.processOwner?.positionId ?? 'heads' });
  const [error, setError] = useState(false);
  const save = () => {
    const owners = v.owner === 'heads' ? repo.formation.departmentHeads() : v.owner ? [v.owner] : [];
    const r = repo.formation.addDeadline({ label: v.what, ownerPositionIds: owners, dueOn: (v.date || null) as ISODate | null, kind: v.kind, stage: v.stage });
    if (r.ok) { say(Sch.added); onDone(); } else setError(true);
  };
  return (
    <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg bg-cream p-3 sm:grid-cols-2">
      {error && <p role="alert" className="text-13 text-block-text sm:col-span-2">{Sch.required}</p>}
      <div className="sm:col-span-2"><label htmlFor="ai-what" className={label}>{Sch.what}</label><input id="ai-what" className={input} placeholder={Sch.whatPlaceholder} value={v.what} onChange={(e) => setV({ ...v, what: e.target.value })} /></div>
      <div><label htmlFor="ai-kind" className={label}>{Sch.kindLabel}</label>
        <select id="ai-kind" className={input} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as 'meeting' | 'milestone' })}><option value="meeting">{Sch.kind.meeting}</option><option value="milestone">{Sch.kind.milestone}</option></select></div>
      <div><label htmlFor="ai-stage" className={label}>{Sch.stageLabel}</label>
        <select id="ai-stage" className={input} value={v.stage} onChange={(e) => setV({ ...v, stage: e.target.value as FormationStage })}>{STAGES.map((x) => <option key={x} value={x}>{F.stage[x]}</option>)}</select></div>
      <div><label htmlFor="ai-date" className={label}>{Sch.dateOptional}</label><input id="ai-date" type="date" className={input} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
      <div><label htmlFor="ai-owner" className={label}>{Sch.ownerLabel}</label>
        <select id="ai-owner" className={input} value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })}>
          <option value="heads">{F.calendar.ownersAllHeads(formatNumber(f.departmentHeads))}</option>
          {f.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? en.onboarding.vacant})</option>)}
        </select></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" className={primary} onClick={save}>{Sch.addButton}</button><button type="button" className={btn} onClick={onDone}>{Sch.cancel}</button></div>
    </div>
  );
}


/* ───────── Sessions with decision logs ───────── */

function Sessions({ f }: { f: FormationPage }) {
  const { repo } = useApp();
  const S = F.sessions;
  const editable = f.canSetUp;
  const [purposes, setPurposes] = useState<WorkshopPurpose[]>([]);
  const [format, setFormat] = useState<Format>('in_person');
  const [date, setDate] = useState('');
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!f.seesDraft && !f.plan!.published) return <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{F.calendar.notPublishedOthers}</p>;
  const add = () => {
    const r = repo.formation.addSession({ purposes, format, scheduledOn: (date || null) as ISODate | null, window: opens && closes ? { opensOn: opens as ISODate, closesOn: closes as ISODate } : null });
    if (r.ok) { setPurposes([]); setDate(''); setOpens(''); setCloses(''); setError(null); } else setError(r.error === 'dates' ? F.calendar.datesError : S.required);
  };
  return (
    <div>
      <p className="text-14">{S.intro}</p>
      {editable && (
        <section className={`${card} mt-4`}>
          <h3 className="text-16 font-bold text-navy">{S.add}</h3>
          {error && <CheckBox tone="block" title={en.setup.edit.cantSave}>{error}</CheckBox>}
          <fieldset className="mt-2"><legend className={label}>{S.purposes}</legend>
            <div className="flex flex-wrap gap-x-4">
              {SESSION_PURPOSES.map((p) => (
                <label key={p} className="flex min-h-11 items-center gap-2 text-14">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={purposes.includes(p)} onChange={(e) => setPurposes(e.target.checked ? [...purposes, p] : purposes.filter((x) => x !== p))} />
                  {F.purpose[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
            <div><label htmlFor="ws-format" className={label}>{S.format}</label>
              <select id="ws-format" className={input} value={format} onChange={(e) => setFormat(e.target.value as Format)}>{FORMATS.map((x) => <option key={x} value={x}>{F.format[x]}</option>)}</select></div>
            {format === 'async_review' ? (
              <>
                <div><label htmlFor="ws-opens" className={label}>{S.opens}</label><input id="ws-opens" type="date" className={input} value={opens} onChange={(e) => setOpens(e.target.value)} /></div>
                <div><label htmlFor="ws-closes" className={label}>{S.closes}</label><input id="ws-closes" type="date" className={input} value={closes} onChange={(e) => setCloses(e.target.value)} /></div>
              </>
            ) : <div><label htmlFor="ws-date" className={label}>{S.date}</label><input id="ws-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></div>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={add}>{S.addButton}</button>
            {(['standard', 'lean', 'remote'] as const).map((k) => (
              <button key={k} type="button" className={btn} title={F.packageNote[k]} onClick={() => repo.formation.applyPackage(k)}>{S.fromPackage(F.packages[k]!)}</button>
            ))}
          </div>
          <p className="mt-1 text-12 text-muted">{S.packageHint} {(['lean', 'remote'] as const).map((k) => `${F.packages[k]}: ${F.packageNote[k]}`).join(' ')}</p>
        </section>
      )}
      {f.checks.filter((c) => c.kind === 'purpose_uncovered').map((c) => c.kind === 'purpose_uncovered' && (
        <CheckBox key={c.purpose} tone="advisory" title={F.tracker.worth}>{F.tracker.checks.purpose_uncovered(F.purpose[c.purpose]!)}</CheckBox>
      ))}
      <ul className="mt-4 space-y-3">
        {f.sessions.length ? f.sessions.map((w) => <SessionCard key={w.id} w={w} f={f} editable={editable} />) : <li className={card}><p className="text-14 text-muted">{S.none}</p></li>}
      </ul>
    </div>
  );
}

function SessionCard({ w, f, editable }: { w: SessionView; f: FormationPage; editable: boolean }) {
  const { repo } = useApp();
  const S = F.sessions;
  const [dec, setDec] = useState({ decision: '', action: '', owner: '', due: '' });
  const [error, setError] = useState(false);
  const planned = w.status === 'planned';
  const when = w.format === 'async_review' ? (w.window ? S.windowDates(formatDate(w.window.opensOn), formatDate(w.window.closesOn)) : S.noDate) : w.scheduledOn ? formatDate(w.scheduledOn) : S.noDate;
  return (
    <li className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-[1_1_15rem] text-16 font-bold text-navy">{S.title(sessionTitle(w.purposes))}</h3>
        <span className="flex flex-wrap gap-2"><Chip tone="info">{when}</Chip><Chip tone={w.status === 'held' ? 'complete' : 'info'}>{F.sessionStatus[w.status]}</Chip></span>
      </div>
      <p className="mt-1 text-13 text-muted">{S.purposeLine(sessionTitle(w.purposes))}{w.purposes.includes('vision') ? ` ${S.visionNote}` : ''} {S.participants(plural(w.participants, 'position'))}</p>
      {editable && planned && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div><label htmlFor={`fmt-${w.id}`} className={label}>{S.format}</label>
            <select id={`fmt-${w.id}`} className={`${input} w-auto`} value={w.format} onChange={(e) => repo.formation.updateSession(w.id, { format: e.target.value as Format })}>{FORMATS.map((x) => <option key={x} value={x}>{F.format[x]}</option>)}</select></div>
          {w.format === 'async_review' ? (
            <>
              <div><label htmlFor={`wo-${w.id}`} className={label}>{S.opens}</label><input id={`wo-${w.id}`} type="date" className={`${input} max-w-[11rem]`} value={w.window?.opensOn ?? ''} onChange={(e) => e.target.value && repo.formation.updateSession(w.id, { window: { opensOn: e.target.value as ISODate, closesOn: (w.window?.closesOn ?? e.target.value) as ISODate } })} /></div>
              <div><label htmlFor={`wc-${w.id}`} className={label}>{S.closes}</label><input id={`wc-${w.id}`} type="date" className={`${input} max-w-[11rem]`} value={w.window?.closesOn ?? ''} onChange={(e) => e.target.value && repo.formation.updateSession(w.id, { window: { opensOn: (w.window?.opensOn ?? e.target.value) as ISODate, closesOn: e.target.value as ISODate } })} /></div>
            </>
          ) : <div><label htmlFor={`wd-${w.id}`} className={label}>{S.date}</label><input id={`wd-${w.id}`} type="date" className={`${input} max-w-[11rem]`} value={w.scheduledOn ?? ''} onChange={(e) => repo.formation.updateSession(w.id, { scheduledOn: (e.target.value || null) as ISODate | null })} /></div>}
          <button type="button" className={btn} onClick={() => repo.formation.markHeld(w.id)}>{S.markHeld}</button>
          <button type="button" className={btn} onClick={() => repo.formation.cancelSession(w.id)}>{S.cancel}</button>
        </div>
      )}
      {w.purposes.includes('four_q_review') && (w.groups.length > 0 || w.canManageGroups) && <Groups w={w} f={f} />}
      {w.purposes.includes('values') && <ValuesSessionGroups workshopId={w.id} />}
      <div className="mt-3 border-t border-border pt-2">
        <b className="text-14">{S.decisionLog}</b>
        {w.decisionLog.length ? w.decisionLog.map((l, i) => (
          <div key={i} className="mt-1 text-14">
            <p>{l.decision}.</p>
            <ul className="mt-1 space-y-1">
              {l.actions.map((a) => (
                <li key={`${a.logIndex}:${a.actionIndex}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-[1_1_14rem] text-muted">{S.actionLine(a.text, a.owner, formatDate(a.dueOn))}{a.done ? ` ${F.actions.doneLine(a.done.by, formatDate(a.done.on))}` : ''}</span>
                  <span className="flex items-center gap-2">
                    {a.done && <Chip tone="complete">{F.actions.done}</Chip>}
                    {a.canClose && <button type="button" className={btn} onClick={() => repo.formation.setActionDone(w.id, a.logIndex, a.actionIndex, !a.done)}>{a.done ? F.actions.reopen : F.actions.markDone}<span className="sr-only">: {a.text}</span></button>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="mt-1 text-13 text-muted">{S.noDecisions}</p>}
        {editable && (
          <>
            {error && <p role="alert" className="mt-1 text-13 text-block-text">{S.decisionRequired}</p>}
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              <div><label htmlFor={`dec-${w.id}`} className={label}>{S.decision}</label><input id={`dec-${w.id}`} className={input} value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })} /></div>
              <div><label htmlFor={`act-${w.id}`} className={label}>{S.action}</label><input id={`act-${w.id}`} className={input} value={dec.action} onChange={(e) => setDec({ ...dec, action: e.target.value })} /></div>
              <div><label htmlFor={`own-${w.id}`} className={label}>{S.owner}</label>
                <select id={`own-${w.id}`} className={input} value={dec.owner} onChange={(e) => setDec({ ...dec, owner: e.target.value })}>
                  <option value="">{F.setup.none}</option>
                  {f.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? en.onboarding.vacant})</option>)}
                </select></div>
              <div><label htmlFor={`due-${w.id}`} className={label}>{S.due}</label><input id={`due-${w.id}`} type="date" className={input} value={dec.due} onChange={(e) => setDec({ ...dec, due: e.target.value })} /></div>
            </div>
            <button type="button" className={`${btn} mt-2`} onClick={() => {
              const r = repo.formation.addDecision(w.id, { decision: dec.decision, actions: [{ text: dec.action, ownerPositionId: dec.owner, dueOn: dec.due as ISODate }] });
              if (r.ok) { setDec({ decision: '', action: '', owner: '', due: '' }); setError(false); } else setError(true);
            }}>{S.addDecision}</button>
            <p className="mt-1 text-12 text-muted">{S.logNote}</p>
          </>
        )}
      </div>
    </li>
  );
}


/* ───────── v0.32.0: groups in a values session (Values Group Work Specification v0.1) ───────── */

function ValuesSessionGroups({ workshopId }: { workshopId: string }) {
  const { repo } = useApp();
  const session = repo.valuesWork.session(workshopId);
  return session ? <ValuesGroups session={session} boardElsewhere /> : null;
}

/* ───────── v1.19: groups in the 4Q review session (4Q Group Work Specification v0.1) ───────── */

function Groups({ w, f }: { w: SessionView; f: FormationPage }) {
  const { repo, say } = useApp();
  const G = F.groups;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  return (
    <div className="mt-3 border-t border-border pt-2">
      <b className="text-14">{G.title}</b>
      <p className="text-12 text-muted">{G.intro}</p>
      {w.groups.length ? (
        <ul className="mt-2 divide-y divide-border">
          {w.groups.map((g) => (
            <li key={g.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 flex-[1_1_14rem] text-14">
                  <b className="text-navy">{g.name}</b> · {partLabel(g.cells)}
                  <span className="block text-12 text-muted">{G.scribeLine(g.scribe.name)}{g.memberNames.length ? ` · ${en.list(g.memberNames)}` : ''}</span>
                  {g.closed && <span className="block text-12 text-muted">{G.closedNote(g.closed.by, formatDate(g.closed.on))}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Chip tone="info">{g.closed ? G.closed : G.entering}</Chip>
                  {g.toReview > 0 && <Chip tone="advisory">{G.toReview(formatNumber(g.toReview))}</Chip>}
                  <a className={btn} href={hrefFor({ kind: 'flipchart', workshopId: w.id, groupId: g.id })}>{G.flipChart(g.name)}</a>
                  {w.canManageGroups && !g.closed && <button type="button" className={btn} onClick={() => setEditing(g.id)}>{G.edit}<span className="sr-only">: {g.name}</span></button>}
                  {w.canCloseGroups && (g.closed
                    ? <button type="button" className={btn} title={G.reopenNote} onClick={() => { if (repo.formation.setGroupClosed(w.id, g.id, false).ok) say(G.reopenNote); }}>{G.reopen}<span className="sr-only">: {g.name}</span></button>
                    : <button type="button" className={btn} onClick={() => repo.formation.setGroupClosed(w.id, g.id, true)}>{G.close}<span className="sr-only">: {g.name}</span></button>)}
                </span>
              </div>
              {editing === g.id && <GroupForm w={w} f={f} groupId={g.id} onDone={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-13 text-muted">{G.none}</p>}
      {w.canManageGroups && (editing === 'new' ? <GroupForm w={w} f={f} onDone={() => setEditing(null)} /> : <button type="button" className={`${btn} mt-2`} onClick={() => setEditing('new')}>{G.add}</button>)}
    </div>
  );
}

const partLabel = (cells: FourQCell[]) => {
  const bands = [...new Set(cells.map((c) => c.band))];
  if (bands.length === 1 && CELLS.filter((c) => c.band === bands[0]).every((c) => cells.some((x) => cellKey(x) === cellKey(c))) && cells.length === 4) return F.groups.band(en.fourQ.band[bands[0]!]);
  return en.list(cells.map((c) => `${en.fourQ.band[c.band]}: ${en.fourQ.cellName(c)}`));
};

function GroupForm({ w, f, groupId, onDone }: { w: SessionView; f: FormationPage; groupId?: string; onDone: () => void }) {
  const { repo } = useApp();
  const G = F.groups;
  const g = groupId ? w.groups.find((x) => x.id === groupId) : undefined;
  const [name, setName] = useState(g?.name ?? `Group ${w.groups.length + 1}`);
  const [cells, setCells] = useState<string[]>(g ? g.cells.map(cellKey) : []);
  const [scribe, setScribe] = useState(g?.scribe.membershipId ?? '');
  const [members, setMembers] = useState(g ? g.memberNames.join(', ') : '');
  const [error, setError] = useState<string | null>(null);
  const id = groupId ?? 'new';
  const toggle = (k: string, on: boolean) => setCells(on ? [...cells, k] : cells.filter((x) => x !== k));
  const save = () => {
    const input = { name, cells: cells.map((k) => cellOfKey(k)!).filter(Boolean), scribeMembershipId: scribe, memberNames: members.split(',').map((x) => x.trim()).filter(Boolean) };
    const r = groupId ? repo.formation.updateGroup(w.id, groupId, input) : repo.formation.addGroup(w.id, input);
    if (r.ok) onDone(); else setError(r.error === 'cells' ? G.cellsError : G.required);
  };
  return (
    <div className="mt-2 rounded-lg bg-cream p-3">
      {error && <p role="alert" className="text-13 text-block-text">{error}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <div><label htmlFor={`gn-${id}`} className={label}>{G.name}</label><input id={`gn-${id}`} className={input} placeholder={G.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor={`gs-${id}`} className={label}>{G.scribe}</label>
          <select id={`gs-${id}`} className={input} aria-describedby={`gsh-${id}`} value={scribe} onChange={(e) => setScribe(e.target.value)}>
            <option value="">{F.setup.none}</option>
            {f.members.map((m) => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}
          </select>
          <p id={`gsh-${id}`} className="mt-1 text-12 text-muted">{G.scribeNote}</p></div>
      </div>
      <fieldset className="mt-3">
        <legend className={label}>{G.part}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {BANDS.map((b) => {
            const keys = CELLS.filter((c) => c.band === b).map(cellKey);
            return <button key={b} type="button" className={btn} onClick={() => setCells(keys)}>{G.band(en.fourQ.band[b])}</button>;
          })}
        </div>
        <p className="mt-2 text-12 text-muted">{G.sections}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4 sm:grid-cols-2">
          {CELLS.map((c) => (
            <label key={cellKey(c)} className="flex min-h-11 items-center gap-2 text-14">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={cells.includes(cellKey(c))} onChange={(e) => toggle(cellKey(c), e.target.checked)} />
              {en.fourQ.band[c.band]}: {en.fourQ.cellName(c)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-2"><label htmlFor={`gm-${id}`} className={label}>{G.members}</label><input id={`gm-${id}`} className={input} placeholder={G.membersPlaceholder} value={members} onChange={(e) => setMembers(e.target.value)} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primary} onClick={save}>{G.save}</button><button type="button" className={btn} onClick={onDone}>{G.cancel}</button></div>
    </div>
  );
}
