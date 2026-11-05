/**
 * Communication, part 11e (BUILD-BRIEF section 36, D16-1 to D16-11): the Communication page in Strategy
 * (#/communication), the record on each goal's page under "Why this matters", the board paper (#/board-paper/<goalId>),
 * and the "Our strategic plan" card on Home. Everything shown comes from the data-access layer; nothing is computed here.
 */
import { useEffect, useId, useState } from 'react';
import { useApp } from '../components/AppContext';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import type { CommunicationGoalView, CommunicationResult, Fields } from '../data/access/communication';
import { communicationFiguresNote } from '../data/access/communication';
import type { Audience } from '../rules/communication';
import { formatDate } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, link, plural, primary } from './organisation/ui';
import { hrefFor, nodeHref } from './router';
import { SurveyTab } from './Survey';

const C = en.communication;
const AUDIENCES: Audience[] = ['board', 'managers', 'staff'];

/* ───────── Strategy workspace: a summary card linking to the page ───────── */

export function CommunicationCard() {
  const { repo } = useApp();
  const page = repo.communication.page();
  if (!page.plans.length) return null;
  const goals = repo.settings().termLabels.goal.plural.toLowerCase();
  return (
    <section className={`${card} mt-6`} aria-labelledby="comm-card">
      <h2 id="comm-card" className="text-18 font-bold text-navy">{C.cardTitle}</h2>
      <ul className="mt-1">
        {page.plans.map((p) => (
          <li key={p.planId} className="text-14">
            <b className="text-navy">{p.title}</b>: {C.cardSummary(p.complete, p.goals.length, goals)}
          </li>
        ))}
      </ul>
      <a className={link} href={hrefFor({ kind: 'strategy', entry: 'communication' })}>{C.open}</a>
    </section>
  );
}

/* ───────── #/communication ───────── */

export function CommunicationPage({ goalId, embedded = false, tab }: { goalId?: string; embedded?: boolean; tab?: string }) {
  const { repo } = useApp();
  const page = repo.communication.page();
  const terms = repo.settings().termLabels;
  // v0.19.0: the Staff survey tab, for the Strategy office, the Executive and department heads.
  const survey = repo.survey.tab() !== null;
  const onSurvey = survey && tab === 'survey';
  const tabs = survey && (
    <nav aria-label={en.survey.tab} className="mb-4 flex gap-1 border-b border-border">
      {([['goals', en.survey.goalsTab, hrefFor({ kind: 'strategy', entry: 'communication' })], ['survey', en.survey.tab, hrefFor({ kind: 'strategy', entry: 'communication', tab: 'survey' })]] as const).map(([k, l, h]) => {
        const here = (k === 'survey') === onSurvey;
        return <a key={k} href={h} aria-current={here ? 'page' : undefined} className={`-mb-px inline-flex min-h-11 items-center border-b-4 px-3 text-14 ${here ? 'border-navy font-bold text-navy' : 'border-transparent text-muted hover:text-navy'}`}>{l}</a>;
      })}
    </nav>
  );
  if (onSurvey) return <>{tabs}<SurveyTab /></>;
  return (
    <>
      {tabs}
      {!embedded && <WorkspaceHeader w="strategy" title={C.title} intro={C.intro} />}
      {embedded && <p className="mb-2 max-w-3xl text-14 text-muted">{C.intro}</p>}
      {!page.plans.length && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{C.none}</p>}
      {page.plans.map((p) => (
        <section key={p.planId} className="mt-6" aria-labelledby={`comm-${p.planId}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`comm-${p.planId}`} className="text-22 font-bold text-navy">{p.title}</h2>
            <span className="text-13 text-muted">{C.planLine(p.period, C.planStatus[p.status] ?? p.status)} · {C.count(p.complete, p.goals.length)}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {p.goals.map((g) => (
              <li key={g.goalId}>
                <GoalRow g={g} goalLabel={terms.goal.singular} startOpen={g.goalId === goalId} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function StatusChip({ g }: { g: CommunicationGoalView }) {
  return <Chip tone={g.status === 'complete' ? 'complete' : 'info'}>{C.status[g.status]}</Chip>;
}

function GoalRow({ g, goalLabel, startOpen }: { g: CommunicationGoalView; goalLabel: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const body = useId();
  const ref = useId();
  useEffect(() => { if (startOpen) document.getElementById(ref)?.scrollIntoView({ block: 'start' }); }, [startOpen, ref]);
  return (
    <div id={ref} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_15rem]">
          <p className="text-12 font-semibold text-muted">{goalLabel} · {g.code}</p>
          <h3 className="text-16 font-bold text-navy"><a className="underline underline-offset-4" href={nodeHref('goal', g.goalId, 'strategy')}>{g.title}</a></h3>
          {g.owner && <p className="text-13 text-muted">{C.owner(g.owner.person ? `${g.owner.position} (${g.owner.person})` : g.owner.position)}</p>}
        </div>
        <StatusChip g={g} />
      </div>
      <button type="button" className={`${btn} mt-3`} aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>{open ? C.hide : C.show}</button>
      {open && <div id={body} className="mt-4"><GoalCommunication g={g} /></div>}
    </div>
  );
}

/* ───────── One goal's record: the page row and the goal's record page share it ───────── */

export function GoalCommunication({ g, onGoalPage = false }: { g: CommunicationGoalView; onGoalPage?: boolean }) {
  const reachesPage = useApp().repo.workspaces().includes('strategy');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = (r: CommunicationResult | Promise<CommunicationResult>, ok?: string) =>
    void Promise.resolve(r).then((x) => { setError(x.ok ? null : C.errors[x.error] ?? C.errors.not_allowed!); setNote(x.ok && ok ? ok : null); });
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-block-border bg-block-bg px-4 py-3 text-14 text-block-text">{error}</p>}
      {note && <p role="status" className="rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">{note}</p>}
      {editing ? (
        <RecordForm g={g} onDone={(saved) => { setEditing(false); if (saved) { setError(null); setNote(C.saved); } }} />
      ) : g.record ? (
        <>
          <dl className="space-y-3">
            <Part title={C.fields.what} text={g.record.what} />
            <Part title={C.fields.why} text={g.record.why} />
            <WhyCards g={g} />
            <Part title={C.fields.how} text={g.record.how} />
          </dl>
          <p className="text-13 text-muted">{C.updated(g.record.updated.by, formatDate(g.record.updated.on))}</p>
          {g.can.write && <button type="button" className={btn} onClick={() => setEditing(true)}>{C.edit}</button>}
        </>
      ) : (
        <>
          <p className="text-14 text-muted">{g.can.write ? C.noRecord : C.noRecordReader}</p>
          <WhyCards g={g} />
          {g.can.write && <button type="button" className={primary} onClick={() => setEditing(true)}>{C.write}</button>}
        </>
      )}
      {g.record && <Versions g={g} act={act} />}
      {g.record && <Meetings g={g} act={act} />}
      <p className="flex flex-wrap gap-x-4">
        {g.documentFinal && <a className={link} href={hrefFor({ kind: 'planDocument' })}>{C.documentLink}</a>}
        {onGoalPage && reachesPage && <a className={link} href={hrefFor({ kind: 'strategy', entry: 'communication', goalId: g.goalId })}>{C.openPage}</a>}
      </p>
    </div>
  );
}

function Part({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <dt className="text-13 font-semibold text-navy">{title}</dt>
      <dd className="whitespace-pre-line text-14 text-text">{text}</dd>
    </div>
  );
}

/** D16-6: the goal's linked 4Q points, live; a count for those who may not read card text. */
function WhyCards({ g }: { g: CommunicationGoalView }) {
  return (
    <div className="rounded-lg bg-strategy-tint p-3">
      <p className="text-12 font-semibold text-strategy-text">{C.whyCards}</p>
      {!g.whyCards.length ? (
        <p className="text-14 text-muted">{C.whyCardsNone}</p>
      ) : g.whyCardsVisible ? (
        <ul className="mt-1 space-y-2">
          {g.whyCards.map((c) => (
            <li key={c.id}>
              <span className="block text-12 text-strategy-text">{c.cell}</span>
              <span className="block text-14 text-text">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-14 text-text">{C.whyCardsHidden(plural(g.whyCards.length, 'fourQPoint'))}</p>
      )}
    </div>
  );
}

function RecordForm({ g, onDone }: { g: CommunicationGoalView; onDone: (saved: boolean) => void }) {
  const comm = useApp().repo.communication;
  const [f, setF] = useState<Fields>({ what: g.record?.what ?? '', why: g.record?.why ?? '', how: g.record?.how ?? '' });
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const complete = !!(f.what.trim() && f.why.trim() && f.how.trim());
  const suggest = () =>
    void comm.suggest(g.goalId).then((r) => {
      if (r.ok) { setF(r.fields); setAi(true); setError(null); } else setError(C.errors[r.error] ?? C.errors.not_allowed!);
    });
  const save = () => {
    const r = comm.save(g.goalId, f);
    if (r.ok) onDone(true);
    else setError(C.errors[r.error] ?? C.errors.not_allowed!);
  };
  const field = (k: keyof Fields, rows: number) => (
    <div key={k}>
      <label htmlFor={`${id}-${k}`} className={label}>{C.fields[k]}</label>
      <p id={`${id}-${k}-hint`} className="text-13 text-muted">{C.fieldHint[k]}</p>
      <textarea id={`${id}-${k}`} aria-describedby={`${id}-${k}-hint`} rows={rows} className={`${input} mt-1 py-2`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {communicationFiguresNote(f[k], g.names) && <p className="mt-1 text-13 text-muted">{C.figuresNote}</p>}
    </div>
  );
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {error && <p role="alert" className="rounded-lg border border-block-border bg-block-bg px-4 py-3 text-14 text-block-text">{error}</p>}
      {g.can.askAi && <button type="button" className={btn} onClick={suggest}>{C.suggest}</button>}
      {ai && <p className="text-13"><Chip tone="advisory">{C.versionState.ai_draft}</Chip> <span className="text-muted">{C.suggested}</span></p>}
      {field('what', 3)}
      {field('why', 2)}
      <WhyCards g={g} />
      {field('how', 3)}
      {!complete && <p className="text-13 text-muted">{C.allThree}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!complete} onClick={save}>{C.save}</button>
        <button type="button" className={btn} onClick={() => onDone(false)}>{C.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── Audience versions (D16-7) ───────── */

function Versions({ g, act }: { g: CommunicationGoalView; act: (r: CommunicationResult | Promise<CommunicationResult>, ok?: string) => void }) {
  const comm = useApp().repo.communication;
  const available = AUDIENCES.filter((a) => g.versions.some((v) => v.audience === a));
  const [shown, setShown] = useState<Audience>(available.includes(g.firstAudience) ? g.firstAudience : available[0] ?? g.firstAudience);
  const v = g.versions.find((x) => x.audience === shown);
  const board = g.versions.find((x) => x.audience === 'board' && x.state === 'accepted');
  return (
    <section aria-labelledby={`v-${g.goalId}`}>
      <h4 id={`v-${g.goalId}`} className="text-14 font-semibold text-navy">{C.versions}</h4>
      {g.can.editVersions && <p className="text-13 text-muted">{C.versionsIntro}</p>}
      {!available.length ? (
        <p className="mt-1 text-14 text-muted">{g.can.editVersions || g.can.draftVersions ? C.noVersionsEditor : C.noVersions}</p>
      ) : (
        <>
          <div role="tablist" aria-label={C.versions} className="mt-2 flex flex-wrap gap-2">
            {available.map((a) => (
              <button key={a} type="button" role="tab" aria-selected={a === shown} onClick={() => setShown(a)}
                className={`min-h-11 rounded-lg px-3 text-14 font-semibold ${a === shown ? 'bg-navy text-white' : 'border border-control bg-white text-navy hover:border-navy'}`}>
                {C.audience[a]}{a === g.firstAudience ? ` · ${C.yourVersion}` : ''}
              </button>
            ))}
          </div>
          {v && <VersionBody key={`${v.audience}:${v.text}:${v.state}`} g={g} v={v} act={act} />}
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {g.can.draftVersions && (
          <button type="button" className={btn} onClick={() => act(comm.draftVersions(g.goalId))}>{available.length ? C.redraftVersions : C.draftVersions}</button>
        )}
        {board && <a className={link} href={hrefFor({ kind: 'boardPaper', goalId: g.goalId })}>{C.boardPaper}</a>}
      </div>
      {g.can.draftVersions && available.length > 0 && <p className="text-13 text-muted">{C.redraftNote}</p>}
    </section>
  );
}

function VersionBody({ g, v, act }: { g: CommunicationGoalView; v: CommunicationGoalView['versions'][number]; act: (r: CommunicationResult) => void }) {
  const comm = useApp().repo.communication;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.text);
  const id = useId();
  const tone = v.state === 'accepted' ? 'complete' : 'advisory';
  return (
    <div role="tabpanel" className="mt-2 rounded-lg border border-border p-3">
      {g.can.editVersions && <Chip tone={tone}>{C.versionState[v.state]}</Chip>}
      {editing ? (
        <div className="mt-2">
          <label htmlFor={id} className={label}>{C.audience[v.audience]}</label>
          <textarea id={id} rows={5} className={`${input} mt-1 py-2`} value={text} onChange={(e) => setText(e.target.value)} />
          {communicationFiguresNote(text, g.names) && <p className="mt-1 text-13 text-muted">{C.figuresNote}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { act(comm.editVersion(g.goalId, v.audience, text)); setEditing(false); }}>{en.planDocument.save}</button>
            <button type="button" className={btn} onClick={() => { setText(v.text); setEditing(false); }}>{C.cancel}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-line text-14">{v.text}</p>
          <WhyCards g={g} />
          {g.can.editVersions && (
            <div className="mt-2 flex flex-wrap gap-2">
              {v.state !== 'accepted' && <button type="button" className={primary} onClick={() => act(comm.acceptVersion(g.goalId, v.audience))}>{C.accept}</button>}
              <button type="button" className={btn} onClick={() => setEditing(true)}>{en.planDocument.edit}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────── Meetings (D16-8) ───────── */

function Meetings({ g, act }: { g: CommunicationGoalView; act: (r: CommunicationResult, ok?: string) => void }) {
  const { repo, now } = useApp();
  const [adding, setAdding] = useState(false);
  const [unitId, setUnitId] = useState(g.meetingUnits[0]?.id ?? '');
  const [heldOn, setHeldOn] = useState<string>(now);
  const [feedback, setFeedback] = useState('');
  const id = useId();
  const save = () => {
    const r = repo.communication.logMeeting(g.goalId, { unitId, heldOn, feedbackSummary: feedback });
    act(r);
    if (r.ok) { setAdding(false); setFeedback(''); }
  };
  return (
    <section aria-labelledby={`m-${g.goalId}`}>
      <h4 id={`m-${g.goalId}`} className="text-14 font-semibold text-navy">{C.meetings}</h4>
      <p className="text-13 text-muted">{C.meetingsIntro}</p>
      {!g.meetings.length ? <p className="mt-1 text-14 text-muted">{C.noMeetings}</p> : (
        <ul className="mt-2 divide-y divide-border">
          {g.meetings.map((m, i) => (
            <li key={i} className="py-2">
              <span className="block text-13 font-semibold text-navy">{C.meetingLine(m.unit, formatDate(m.heldOn))}</span>
              <span className="block text-14">{m.feedbackSummary}</span>
            </li>
          ))}
        </ul>
      )}
      {g.can.logMeeting && !adding && <button type="button" className={`${btn} mt-2`} onClick={() => setAdding(true)}>{C.logMeeting}</button>}
      {adding && (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div><label htmlFor={`${id}-u`} className={label}>{C.meetingUnit}</label>
            <select id={`${id}-u`} className={`${input} mt-1`} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {g.meetingUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
          <div><label htmlFor={`${id}-d`} className={label}>{C.meetingDate}</label>
            <input id={`${id}-d`} type="date" max={now} className={`${input} mt-1`} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} /></div>
          <div className="sm:col-span-2"><label htmlFor={`${id}-f`} className={label}>{C.meetingFeedback}</label>
            <textarea id={`${id}-f`} rows={3} className={`${input} mt-1 py-2`} value={feedback} onChange={(e) => setFeedback(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" className={primary} disabled={!feedback.trim() || !unitId} onClick={save}>{C.meetingSave}</button>
            <button type="button" className={btn} onClick={() => setAdding(false)}>{C.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────── A goal's record page, under "Why this matters" (D16-2, D16-3) ───────── */

export function GoalRecordSection({ goalId }: { goalId: string }) {
  const g = useApp().repo.communication.goal(goalId);
  if (!g) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-14 font-semibold text-navy">{C.onGoal}</h3>
        <StatusChip g={g} />
      </div>
      <div className="mt-2"><GoalCommunication g={g} onGoalPage /></div>
    </div>
  );
}

/* ───────── #/board-paper/<goalId> ───────── */

export function BoardPaperPrint({ goalId }: { goalId: string }) {
  const paper = useApp().repo.communication.boardPaper(goalId);
  const P = C.paper;
  if (!paper || !paper.text) {
    return (
      <div className={card}>
        <p className="text-14 text-muted">{P.notReady}</p>
        <a className={link} href={hrefFor({ kind: 'strategy', entry: 'communication', goalId })}>{P.back}</a>
      </div>
    );
  }
  return (
    <article className="rounded-xl bg-white p-6 md:p-10">
      <p className="no-print text-13 text-muted">{P.print} <a className={link} href={hrefFor({ kind: 'strategy', entry: 'communication', goalId })}>{P.back}</a></p>
      <p className="mt-4 text-13 text-muted">{paper.organisation} · {paper.planTitle} ({paper.period})</p>
      <h1 className="mt-1 text-28 font-bold text-navy">{P.title}</h1>
      <h2 className="mt-2 text-18 font-bold text-navy">{P.goal(paper.goalLabel, paper.code, paper.title)}</h2>
      <p className="mt-4 whitespace-pre-line text-16">{paper.text}</p>
      <div className="mt-4">
        <WhyCards g={{ whyCards: paper.whyCards, whyCardsVisible: paper.whyCardsVisible } as CommunicationGoalView} />
      </div>
      {paper.acceptedBy && <p className="mt-6 text-13 text-muted">{P.accepted(paper.acceptedBy.by, formatDate(paper.acceptedBy.on))}</p>}
    </article>
  );
}

/* ───────── Home: "Our strategic plan" (D16-2) ───────── */

export function OurPlanCard() {
  const d = useApp().repo.planDocument.page();
  if (!d?.document || d.document.status !== 'final') return null;
  const H = C.home;
  return (
    <section className={`${card} mb-6`} aria-labelledby="our-plan">
      <h2 id="our-plan" className="text-18 font-bold text-navy">{H.title}</h2>
      <p className="mt-1 text-14">{H.text(d.planTitle)}</p>
      <a className={link} href={hrefFor({ kind: 'planDocument' })}>{H.open}</a>
    </section>
  );
}
