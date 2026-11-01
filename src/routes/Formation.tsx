/**
 * Strategy formation, part 11a (BUILD-BRIEF section 30): setting up a formed plan, the formation tracker, the
 * preparer-built calendar and its sessions with decision logs. Behaviour from the approved Strategy workspace
 * prototype (`reference/caspa-strategy-prototype.html`).
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import type { FormationPage, SessionView } from '../data/access/formation';
import type { FormationStage, ISODate, WorkshopPurpose } from '../contract/caspa-data-contract';
import { PURPOSES, STAGES, type AgendaItem, type Format } from '../rules/formation';
import { formatDate, formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, input, label, plural, primary } from './organisation/ui';
import { Board, Documents, MyPart, VisionMission } from './Conception';
import { Baselines, Compliance, Room } from './Consultation';

const F = en.formation;
const K = en.consultation;
const FORMATS: Format[] = ['in_person', 'online', 'hybrid', 'async_review'];
const sessionTitle = (purposes: WorkshopPurpose[]) => en.list(purposes.map((p) => F.purpose[p]!));
const d = (x: ISODate | null) => (x ? formatDate(x) : '');

export function Formation() {
  const { repo } = useApp();
  const f = repo.formation.page();
  const [setup, setSetup] = useState(false);
  const c = repo.conception.page();
  const room = repo.consultation.room();
  const bl = repo.consultation.baselines();
  const cp = repo.consultation.compliance();
  // Part 11c: someone here only to have their say, or the compliance officer, opens on their own tab.
  const [tab, setTab] = useState<'formation' | 'calendar' | 'sessions' | 'board' | 'mine' | 'documents' | 'vision' | 'room' | 'baselines' | 'compliance'>(() =>
    cp?.canReview && !c?.seesAll ? 'compliance' : room?.canComment && !room.canRun && !c?.seesAll && !c?.myDepartments.length ? 'room' : 'formation');
  if (!f.plan) {
    return (
      <section className={`${card} mt-4`} aria-labelledby="next-plan">
        <h2 id="next-plan" className="text-18 font-bold text-navy">{F.nextPlan}</h2>
        {f.activePlan && <p className="mt-1 text-14 text-muted">{F.nextPlanText(f.activePlan.title)}</p>}
        {setup && f.canSetUp ? <SetupForm f={f} onDone={() => setSetup(false)} /> : f.canSetUp
          ? <button type="button" className={`${primary} mt-3`} onClick={() => setSetup(true)}>{F.nextPlanStart}</button>
          : <p className="mt-2 text-14">{F.nextPlanOthers}</p>}
      </section>
    );
  }
  const p = f.plan;
  const C = en.conception.tabs;
  const mine = c ? c.departments.filter((x) => c.myDepartments.includes(x.unitId)) : [];
  const tabs: [typeof tab, string][] = [
    ['formation', F.tabs.formation],
    ...(mine.length ? [['mine', mine.length === 1 ? C.mine(mine[0]!.name) : C.mineMany] as [typeof tab, string]] : []),
    ...(c && (c.seesAll || mine.length) ? [['board', C.board] as [typeof tab, string]] : []),
    ...(c ? [['vision', C.vision] as [typeof tab, string]] : []),
    ...(c?.seesAll ? [['documents', C.documents] as [typeof tab, string]] : []),
    ...(room ? [['room', room.canRun || c?.seesAll || c?.myDepartments.length ? K.tabs.room : K.tabs.say] as [typeof tab, string]] : []),
    ...(bl && (bl.rows.length || bl.canRun || bl.ownUnits.length || c?.seesAll) ? [['baselines', K.tabs.baselines] as [typeof tab, string]] : []),
    ...(cp && (cp.canAdd || cp.canReview || c?.seesAll || c?.myDepartments.length) ? [['compliance', K.tabs.compliance] as [typeof tab, string]] : []),
    ['calendar', F.tabs.calendar], ['sessions', F.tabs.sessions],
  ];
  return (
    <section className="mt-6" aria-labelledby="forming">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-[1_1_15rem]">
            <h2 id="forming" className="text-18 font-bold text-navy">{p.title}</h2>
            <p className="mt-1 text-13 text-muted">
              {p.label}{p.processOwner ? ` · ${F.tracker.processOwner(`${p.processOwner.label} (${p.processOwner.holder ?? en.onboarding.vacant})`)}` : ''}
            </p>
          </div>
          {f.canSetUp && !setup && <button type="button" className={btn} onClick={() => setSetup(true)}>{F.setup.edit}</button>}
        </div>
        {setup && f.canSetUp && <SetupForm f={f} onDone={() => setSetup(false)} />}
        <p className="mt-2 text-13 text-muted">{F.later}</p>
      </div>
      <div role="tablist" aria-label={p.title} className="mt-4 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-11 rounded-lg px-4 text-14 font-semibold ${tab === k ? 'bg-navy text-white' : 'border border-control bg-white text-navy hover:border-navy'}`}>{l}</button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4">
        {tab === 'formation' && <Tracker f={f} openCalendar={() => setTab('calendar')} />}
        {tab === 'calendar' && <Calendar f={f} />}
        {tab === 'sessions' && <Sessions f={f} />}
        {tab === 'board' && c && <Board c={c} openVision={() => setTab('vision')} />}
        {tab === 'mine' && c && <MyPart c={c} />}
        {tab === 'documents' && c && <Documents c={c} />}
        {tab === 'vision' && c && <VisionMission c={c} />}
        {tab === 'room' && room && <Room r={room} />}
        {tab === 'baselines' && bl && <Baselines b={bl} />}
        {tab === 'compliance' && cp && <Compliance c={cp} />}
      </div>
    </section>
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

/* ───────── The formation tracker ───────── */

function agendaLabel(i: AgendaItem, f: FormationPage): { label: string; kind: string } {
  const C = F.calendar;
  switch (i.kind) {
    case 'stage_opens': return { label: C.opens(F.stage[i.stage]!), kind: C.stageKind };
    case 'stage_closes': return { label: C.closes(F.stage[i.stage]!), kind: C.stageKind };
    case 'session': return { label: sessionTitle(i.purposes), kind: C.sessionKind(F.format[i.format]!) };
    case 'deadline': return { label: i.label, kind: C.deadlineKind(en.list(i.ownerPositionIds.map((id) => f.positions.find((x) => x.id === id)?.label ?? id))) };
    case 'gate_target': return { label: F.gates[i.gate]!, kind: C.gateKind };
  }
}

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

function Tracker({ f, openCalendar }: { f: FormationPage; openCalendar: () => void }) {
  const { repo } = useApp();
  const p = f.plan!;
  const T = F.tracker;
  const today = f.today;
  const upcoming = f.agenda.filter((i) => i.date >= today).slice(0, 6);
  const checkText = (c: FormationPage['checks'][number]) =>
    c.kind === 'purpose_uncovered' ? T.checks.purpose_uncovered(F.purpose[c.purpose]!) : c.kind === 'stage_dates_backwards' ? T.checks.stage_dates_backwards(F.stage[c.stage]!) : T.checks[c.kind];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-16 font-bold text-navy">{T.calendar}</h3>
          <Chip tone={p.published ? 'complete' : 'advisory'}>{p.published ? T.published(formatDate(p.published.on)) : T.notPublished}</Chip>
        </div>
        {!p.preparer ? <p className="mt-2 text-14">{T.noPreparer}</p> : p.published ? (
          <>
            <p className="mt-1 text-13 text-muted">{T.preparedBy(p.preparer.name)} {T.comingUp}</p>
            {upcoming.length ? (
              <ul className="mt-1 divide-y divide-border">
                {upcoming.map((i, n) => { const a = agendaLabel(i, f); return <li key={n} className="flex flex-wrap justify-between gap-2 py-2 text-14"><span><b>{a.label}</b> <span className="text-12 text-muted">{a.kind}</span></span><span className="tabular">{formatDate(i.date)}</span></li>; })}
              </ul>
            ) : <p className="mt-1 text-14 text-muted">{T.nothingUpcoming}</p>}
          </>
        ) : <p className="mt-2 text-14 text-muted">{T.notYet(p.preparer.name)}</p>}
        {(f.seesDraft || p.published) && (
          <button type="button" className={`${btn} mt-3`} onClick={openCalendar}>{f.isPreparer ? (p.published ? T.editCalendar : T.prepare) : T.openCalendar}</button>
        )}
      </section>
      <section className={card}>
        <h3 className="text-16 font-bold text-navy">{T.stages}</h3>
        <p className="mt-1 text-12 text-muted">{T.stagesNote}</p>
        <ul className="mt-2 divide-y divide-border">
          {p.stages.map((st) => (
            <li key={st.stage} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-14"><b>{F.stage[st.stage]}</b> <span className="text-12 text-muted">{st.startsOn && st.endsOn ? T.dates(d(st.startsOn), d(st.endsOn)) : T.noDates}</span></span>
              <span className="flex flex-wrap items-center gap-2">
                <Chip tone={st.status === 'complete' ? 'complete' : st.status === 'open' ? 'advisory' : 'info'}>{F.stageStatus[st.status]}</Chip>
                {f.canSetUp && st.status === 'not_started' && <button type="button" className={btn} onClick={() => repo.formation.moveStage(st.stage as FormationStage, 'open')}>{T.open}</button>}
                {f.canSetUp && st.status === 'open' && <button type="button" className={btn} onClick={() => repo.formation.moveStage(st.stage as FormationStage, 'complete')}>{T.complete}</button>}
              </span>
            </li>
          ))}
          {(['vision.confirm', 'plan.confirm'] as const).map((g) => {
            const target = g === 'vision.confirm' ? p.visionTargetOn : p.planTargetOn;
            const done = g === 'vision.confirm' ? p.visionConfirmedOn : null;
            return (
              <li key={g} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-14"><b>{T.gate(F.gates[g]!)}</b> <span className="text-12 text-muted">{target ? T.target(d(target)) : T.noTarget}</span></span>
                {done ? <Chip tone="complete">{T.passedOn(d(done))}</Chip> : <Chip tone="info">{T.notYetPassed}</Chip>}
              </li>
            );
          })}
        </ul>
      </section>
      {f.seesDraft && <Progress />}
      {f.checks.length > 0 && (
        <section className={`${card} xl:col-span-2`}>
          <h3 className="text-16 font-bold text-navy">{T.worth}</h3>
          {f.checks.map((c, i) => <CheckBox key={i} tone="advisory" title={T.worth}>{checkText(c)}</CheckBox>)}
        </section>
      )}
    </div>
  );
}

/* ───────── The formation calendar (preparer-built) ───────── */

function Calendar({ f }: { f: FormationPage }) {
  const { repo } = useApp();
  const p = f.plan!;
  const ed = f.isPreparer;
  const C = F.calendar;
  const [dates, setDates] = useState(() => Object.fromEntries(p.stages.map((s) => [s.stage, { startsOn: s.startsOn, endsOn: s.endsOn }])) as Record<FormationStage, { startsOn: ISODate | null; endsOn: ISODate | null }>);
  const [vision, setVision] = useState<ISODate | null>(p.visionTargetOn);
  const [planT, setPlanT] = useState<ISODate | null>(p.planTargetOn);
  const [note, setNote] = useState<string | null>(null);
  const [dl, setDl] = useState({ label: '', owner: 'heads', due: '' });
  const heads = f.departmentHeads;
  if (!f.seesDraft && !p.published) return <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{C.notPublishedOthers}</p>;
  const dateInput = (id: string, value: ISODate | null, set: (v: ISODate | null) => void, aria: string) => (
    <input id={id} type="date" aria-label={aria} className={`${input} max-w-[11rem]`} disabled={!ed} value={value ?? ''} onChange={(e) => set((e.target.value || null) as ISODate | null)} />
  );
  const saveDates = () => {
    const r = repo.formation.saveCalendar({ stages: dates, visionTargetOn: vision, planTargetOn: planT });
    setNote(r.ok ? C.saved : r.error === 'dates' ? C.datesError : null);
  };
  const addDeadline = () => {
    const owners = dl.owner === 'heads' ? repo.formation.departmentHeads() : [dl.owner];
    const r = repo.formation.addDeadline({ label: dl.label, ownerPositionIds: owners, dueOn: dl.due as ISODate });
    if (r.ok) { setDl({ label: '', owner: 'heads', due: '' }); setNote(null); } else setNote(C.required);
  };
  const months = [...new Set(f.agenda.map((i) => i.date.slice(0, 7)))];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-[1_1_15rem] text-14">{p.preparer ? C.intro(p.preparer.name, ed) : F.tracker.noPreparer}</p>
        {ed && <button type="button" className={primary} onClick={() => { if (repo.formation.publishCalendar().ok) setNote(C.published); }}>{p.published ? C.republish : C.publish}</button>}
      </div>
      {note && <p role="status" className="mt-2 rounded-lg border border-complete-border bg-complete-bg px-4 py-2 text-14 text-complete-text">{note}</p>}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className={card}>
            <h3 className="text-16 font-bold text-navy">{C.stageDates}</h3>
            <ul className="mt-2 divide-y divide-border">
              {STAGES.map((st) => (
                <li key={st} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <b className="text-14">{F.stage[st]}</b>
                  <span className="flex flex-wrap items-center gap-2">
                    {dateInput(`cs-${st}`, dates[st].startsOn, (v) => setDates({ ...dates, [st]: { ...dates[st], startsOn: v } }), C.from(F.stage[st]!))}
                    <span className="text-12 text-muted">–</span>
                    {dateInput(`ce-${st}`, dates[st].endsOn, (v) => setDates({ ...dates, [st]: { ...dates[st], endsOn: v } }), C.to(F.stage[st]!))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className={card}>
            <h3 className="text-16 font-bold text-navy">{C.gateTargets}</h3>
            <p className="mt-1 text-12 text-muted">{C.gateNote}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 py-1"><b className="text-14">{F.gates['vision.confirm']}</b>{dateInput('g-vision', vision, setVision, F.gates['vision.confirm']!)}</div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-1"><b className="text-14">{F.gates['plan.confirm']}</b>{dateInput('g-plan', planT, setPlanT, F.gates['plan.confirm']!)}</div>
            {ed && <button type="button" className={`${btn} mt-3`} onClick={saveDates}>{C.save}</button>}
          </section>
          <section className={card}>
            <h3 className="text-16 font-bold text-navy">{C.deadlines}</h3>
            {f.deadlines.length ? (
              <ul className="mt-2 divide-y divide-border">
                {f.deadlines.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 flex-[1_1_12rem] text-14"><b>{x.label}</b><span className="block text-12 text-muted">{en.list(x.owners)}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-14">{formatDate(x.dueOn)}</span>
                      {ed && <button type="button" className={btn} onClick={() => repo.formation.removeDeadline(x.id)}>{C.remove}</button>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-14 text-muted">{C.noDeadlines}</p>}
            {ed && (
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2"><label htmlFor="dl-label" className={label}>{C.deadline}</label><input id="dl-label" className={input} placeholder={C.deadlinePlaceholder} value={dl.label} onChange={(e) => setDl({ ...dl, label: e.target.value })} /></div>
                <div><label htmlFor="dl-owner" className={label}>{C.owners}</label>
                  <select id="dl-owner" className={input} value={dl.owner} onChange={(e) => setDl({ ...dl, owner: e.target.value })}>
                    <option value="heads">{C.ownersAllHeads(formatNumber(heads))}</option>
                    {f.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? en.onboarding.vacant})</option>)}
                  </select></div>
                <div><label htmlFor="dl-due" className={label}>{C.due}</label><input id="dl-due" type="date" className={input} value={dl.due} onChange={(e) => setDl({ ...dl, due: e.target.value })} /></div>
                <div className="sm:col-span-2"><button type="button" className={btn} onClick={addDeadline}>{C.addDeadline}</button></div>
              </div>
            )}
            <p className="mt-2 text-12 text-muted">{C.deadlineNote}</p>
          </section>
        </div>
        <section className={card}>
          <h3 className="text-16 font-bold text-navy">{C.agenda}</h3>
          {months.length ? months.map((m) => (
            <div key={m} className="mt-3">
              <b className="text-14">{new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
              <ul className="divide-y divide-border">
                {f.agenda.filter((i) => i.date.startsWith(m)).map((i, n) => { const a = agendaLabel(i, f); return <li key={n} className="flex flex-wrap justify-between gap-2 py-2 text-14"><span>{a.label}<span className="block text-12 text-muted">{a.kind}</span></span><span className="tabular text-13">{formatDate(i.date)}</span></li>; })}
              </ul>
            </div>
          )) : <p className="mt-1 text-14 text-muted">{C.agendaEmpty}</p>}
        </section>
      </div>
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
              {PURPOSES.map((p) => (
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
      <div className="mt-3 border-t border-border pt-2">
        <b className="text-14">{S.decisionLog}</b>
        {w.decisionLog.length ? w.decisionLog.map((l, i) => (
          <p key={i} className="mt-1 text-14">{l.decision}. {l.actions.map((a) => <span key={a.text} className="text-muted">{S.actionLine(a.text, a.owner, formatDate(a.dueOn))} </span>)}</p>
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

