/**
 * Staff survey screens (v0.19.0; Staff Voice Specification v0.1, SV-1 to SV-14). The answering page
 * (#/survey/<roundId>), the organisation's results for everyone asked (#/survey/<roundId>/results), the Home card,
 * and the Staff survey tab on Strategy › Communication. Results are sentences first for every audience (SV-14).
 * Everything shown comes from repo.survey; nothing is computed here beyond formatting.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../components/AppContext';
import type { CompareColumn, ResultsBlock, RoundDraft, TabRound } from '../data/access/survey';
import { CONCERN_MAX } from '../rules/survey';
import { formatDate, formatPercent } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, primary } from './organisation/ui';
import { hrefFor } from './router';

const S = en.survey;
const R = S.results;
const share = (n: number, of: number) => (of ? formatPercent(n / of) : '—');
const area = (a: keyof typeof S.areas) => S.areas[a];

/* ───────── Home card ───────── */

export function SurveyHomeCard() {
  const { repo, say } = useApp();
  const h = repo.survey.home();
  if (!h.open && !h.closed.length) return null;
  const o = h.open;
  const status = !o ? null
    : o.state === 'open' ? S.home.open(o.title, formatDate(o.closesOn))
    : o.state === 'answered' ? S.home.answered(o.title, formatDate(o.closesOn))
    : o.state === 'declined' ? S.home.declined(o.title)
    : o.state === 'waiting' ? S.home.waiting(o.title)
    : S.home.failed(o.title, S.errors[o.failure ?? 'round_closed'] ?? '');
  return (
    <section className={`${card} mt-6`} aria-labelledby="survey-card">
      <h2 id="survey-card" className="text-18 font-bold text-navy">{S.home.title}</h2>
      {status && <p className="mt-1 text-14 text-text">{status}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {o?.state === 'open' && <a className={primary} href={hrefFor({ kind: 'survey', roundId: o.roundId })}>{S.home.answer}</a>}
        {o?.state === 'failed' && <button type="button" className={btn} onClick={() => { if (repo.survey.removeFailed(o.roundId).ok) say(S.toasts.deleted); }}>{S.home.delete}</button>}
      </div>
      {h.closed.map((c) => (
        <p key={c.roundId} className="mt-2 text-14"><a className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4" href={hrefFor({ kind: 'survey', roundId: c.roundId, results: true })}>{S.home.seeResults(c.title)}</a></p>
      ))}
      <p className="mt-1 text-13 text-muted">{S.home.anon}</p>
    </section>
  );
}

/* ───────── Answering, one question at a time ───────── */

export function SurveyAnswer({ roundId }: { roundId: string }) {
  const { repo, say } = useApp();
  const [form] = useState(() => repo.survey.form(roundId));
  const [step, setStep] = useState(-1);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [concern, setConcern] = useState('');
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const qid = useId();
  useEffect(() => { heading.current?.focus(); }, [step, done]);

  if (done) {
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className="text-28 font-bold text-navy outline-none">{S.answer.thanks}</h1>
        <section className={`${card} mt-4`}>
          <p className="text-16 text-text">{done === 'sent' ? S.answer.sent : S.answer.savedOffline}</p>
          <p className="mt-2 text-14 text-muted">{S.answer.storedHow(form?.minGroup ?? 5)}</p>
          <div className="mt-3"><a className={primary} href="#/home">{S.answer.backHome}</a></div>
        </section>
      </>
    );
  }
  if (!form) {
    const h = repo.survey.home();
    const done2 = h.open && h.open.roundId === roundId && h.open.state !== 'open';
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className="text-28 font-bold text-navy outline-none">{S.name}</h1>
        <p className="mt-3 text-16 text-text">{done2 ? S.answer.already(h.open!.title) : S.answer.notOpen}</p>
        <div className="mt-3"><a className={btn} href="#/home">{S.answer.backHome}</a></div>
      </>
    );
  }
  const n = form.questions.length + 1; // the comment is the last screen
  const eyebrow = <p className="text-13 font-semibold text-navy">{S.name}</p>;

  if (step === -1) {
    return (
      <>
        {eyebrow}
        <h1 ref={heading} tabIndex={-1} className="mt-1 text-28 font-bold text-navy outline-none">{form.title}</h1>
        <p className="mt-2 max-w-2xl text-16 text-text">{S.answer.intro(n)}</p>
        <div className="mt-3 max-w-2xl rounded-lg bg-info-bg px-4 py-3 text-14 text-info-text"><b>{S.anonymous}</b> {S.anonymousLong(form.minGroup)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => setStep(0)}>{S.answer.start}</button></div>
      </>
    );
  }

  if (step >= n) {
    const answered = Object.keys(choices).length;
    const send = () => {
      const r = repo.survey.send(roundId, choices, concern);
      if (!r.ok) return setError(S.errors[r.error] ?? S.errors.not_allowed!);
      say(r.queued ? S.toasts.savedOffline : S.toasts.sent);
      setDone(r.queued ? 'queued' : 'sent');
    };
    return (
      <>
        {eyebrow}
        <h1 ref={heading} tabIndex={-1} className="mt-1 text-28 font-bold text-navy outline-none">{S.answer.readyTitle}</h1>
        <p className="mt-2 max-w-2xl text-16 text-text">{S.answer.ready(answered, form.questions.length, !!concern.trim())}</p>
        {error && <p role="alert" className="mt-2 text-14 font-semibold text-block-text">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={send}>{S.answer.send}</button>
          <button type="button" className={btn} onClick={() => setStep(step - 1)}>{S.answer.back}</button>
        </div>
      </>
    );
  }

  const isConcern = step === form.questions.length;
  const q = isConcern ? null : form.questions[step]!;
  const key = q ? `${q.key}:${q.goalId ?? ''}` : '';
  const picked = q ? choices[key] : undefined;
  const areaName = q ? area(q.area) : area('interaction');
  return (
    <>
      {eyebrow}
      <p className="mt-2 text-13 text-muted">{S.answer.progress(step + 1, n, areaName)}</p>
      <div className="mt-1 h-1.5 max-w-2xl rounded-full bg-info-bg" aria-hidden="true"><div className="h-1.5 rounded-full bg-navy" style={{ width: `${(step / n) * 100}%` }} /></div>
      <h1 ref={heading} tabIndex={-1} id={qid} className="mt-4 max-w-2xl text-22 font-bold text-navy outline-none">{q ? q.prompt : S.q.concern}</h1>
      {q?.quote && <p className="mt-2 max-w-2xl rounded-lg bg-info-bg px-4 py-3 text-16 text-navy">{q.quote}</p>}
      {q ? (
        <div role="group" aria-labelledby={qid} className="mt-3 flex max-w-2xl flex-col gap-2">
          {q.options.map((o) => (
            <button key={o.value} type="button" aria-pressed={picked === o.value}
              onClick={() => setChoices({ ...choices, [key]: o.value })}
              className={`min-h-12 rounded-lg border px-4 py-2 text-left text-16 ${picked === o.value ? 'border-2 border-navy bg-info-bg font-semibold text-navy' : 'border-control bg-white text-text'}`}>
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 max-w-2xl">
          <label htmlFor={`${qid}-c`} className={label}>{S.answer.concernLabel}</label>
          <p id={`${qid}-h`} className="text-13 text-muted">{S.answer.concernHint}</p>
          <textarea id={`${qid}-c`} aria-describedby={`${qid}-h ${qid}-n`} rows={4} maxLength={CONCERN_MAX} value={concern} onChange={(e) => setConcern(e.target.value)} className={`${input} py-2`} />
          <p id={`${qid}-n`} className="tabular text-12 text-muted">{S.answer.chars(concern.length, CONCERN_MAX)}</p>
        </div>
      )}
      <p className="mt-3 max-w-2xl text-12 text-muted">{S.whyLabel} {S.why[q ? q.area : 'interaction']}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => setStep(step + 1)}>{isConcern || picked ? S.answer.next : S.answer.skip}</button>
        <button type="button" className={btn} onClick={() => setStep(step - 1)}>{S.answer.back}</button>
      </div>
    </>
  );
}

/* ───────── Results, sentence first (SV-14) ───────── */

function KeyFacts({ b, asked }: { b: ResultsBlock; asked: number }) {
  return (
    <>
      <ol className="list-decimal space-y-1 pl-5 text-16 text-text">
        <li><b>{R.answered(b.answered, asked)}</b></li>
        {b.strongest && <li>{R.strongest(area(b.strongest.area).toLowerCase(), share(b.strongest.positive, b.strongest.of))}</li>}
        {b.weakest && b.weakest.area !== b.strongest?.area && <li>{R.weakest(area(b.weakest.area).toLowerCase(), share(b.weakest.positive, b.weakest.of))}</li>}
      </ol>
      <p className="mt-2 text-13 text-muted">{R.positiveNote}</p>
    </>
  );
}

function Sentences({ b }: { b: ResultsBlock }) {
  const areas = [...new Set(b.lines.map((l) => l.area))];
  return (
    <>
      {areas.map((a) => (
        <section key={a} aria-label={area(a)} className="mt-4">
          <h4 className="text-16 font-bold text-navy">{area(a)}</h4>
          <ul>
            {b.lines.filter((l) => l.area === a).map((l) => (
              <li key={`${l.key}:${l.goalId ?? ''}`} className="border-t border-border py-2">
                <p className="text-14 text-text">{l.text}</p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-2.5 w-full max-w-xs rounded-full bg-info-bg" aria-hidden="true"><div className="h-2.5 rounded-full bg-navy" style={{ width: `${l.of ? (l.positive / l.of) * 100 : 0}%` }} /></div>
                  <span className="tabular text-13 font-semibold text-navy">{share(l.positive, l.of)}</span>
                </div>
                <p className="tabular mt-0.5 text-13 text-muted">{l.counts.map((x) => `${x.word} ${x.n}`).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {b.notLinked > 0 && <p className="mt-2 text-13 text-muted">{R.notLinked(b.notLinked)}</p>}
    </>
  );
}

function Compare({ cols, min }: { cols: CompareColumn[]; min: number }) {
  const rows = cols[0]!.areas;
  return (
    <>
      <div className="mt-2 overflow-x-auto">
        <table className="tabular w-full min-w-[28rem] border-collapse text-14">
          <caption className="pb-2 text-left text-13 text-muted">{R.byUnitCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 text-left font-semibold text-muted">{R.area}</th>
              {cols.map((c) => <th key={c.name} scope="col" className="px-2 py-2 text-right font-semibold text-navy">{c.name}<br /><span className="font-normal text-muted">{R.answeredCol(c.answered)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.area} className="border-b border-border">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-navy">{area(r.area)}</th>
                {cols.map((c) => { const x = c.areas[i]; return <td key={c.name} className="px-2 py-2 text-right"><b className="text-navy">{x ? share(x.positive, x.of) : '—'}</b><br /><span className="text-13 text-muted">{x ? R.ofN(x.positive, x.of) : ''}</span></td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-13 text-muted">{R.byUnitNote(min)}</p>
    </>
  );
}

function ClosingNote({ note }: { note: { text: string; on: string } | null }) {
  if (!note) return null;
  return (
    <section className={`${card} mt-4 border-t-4 border-t-navy`} aria-labelledby="closing-note">
      <h3 id="closing-note" className="text-16 font-bold text-navy">{R.noteTitle}</h3>
      <p className="mt-1 whitespace-pre-line text-14 text-text">{note.text}</p>
      <p className="mt-1 text-13 text-muted">{R.noteBy(formatDate(note.on as never))}</p>
    </section>
  );
}

export function SurveyStaffResults({ roundId }: { roundId: string }) {
  const { repo } = useApp();
  const r = repo.survey.staffResults(roundId);
  if (!r) return <><h1 className="text-28 font-bold text-navy">{S.name}</h1><p className="mt-3 text-16">{R.tooFew}</p></>;
  return (
    <>
      <p className="text-13 font-semibold text-navy">{S.name}</p>
      <h1 className="mt-1 text-28 font-bold text-navy">{R.title(r.title)}</h1>
      <p className="mt-2 max-w-2xl text-16 text-text">{R.lead(formatDate(r.opensOn), formatDate(r.closesOn))}</p>
      <ClosingNote note={r.note} />
      {r.block ? (
        <>
          <section className={`${card} mt-4`} aria-labelledby="key-facts"><h2 id="key-facts" className="mb-2 text-18 font-bold text-navy">{R.keyFacts}</h2><KeyFacts b={r.block} asked={r.asked} /></section>
          <section className={`${card} mt-4`}><Sentences b={r.block} /></section>
        </>
      ) : <p className="mt-4 rounded-lg bg-info-bg px-4 py-3 text-14">{R.tooFew}</p>}
    </>
  );
}

/* ───────── Strategy › Communication › Staff survey ───────── */

export function SurveyTab() {
  const { repo } = useApp();
  const t = repo.survey.tab();
  const [creating, setCreating] = useState(false);
  if (!t) return null;
  return (
    <>
      {t.canCreate && !creating && <div className="mb-4"><button type="button" className={btn} onClick={() => setCreating(true)}>{S.tabPage.newRound}</button></div>}
      {creating && <NewRound onDone={() => setCreating(false)} />}
      {!t.rounds.length && !creating && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{S.tabPage.none}</p>}
      <ul className="flex flex-col gap-4">
        {t.rounds.map((r) => <li key={r.id}><RoundCard r={r} min={t.minGroup} role={t.role} /></li>)}
      </ul>
    </>
  );
}

function RoundCard({ r, min, role }: { r: TabRound; min: number; role: 'strategy_office' | 'executive' | 'department_head' }) {
  const { repo, say } = useApp();
  const act = (res: { ok: boolean; error?: string }, ok: string) => say(res.ok ? ok : S.errors[res.error ?? 'not_allowed'] ?? null);
  return (
    <section className={`${card} border-t-4 border-t-strategy-mark`} aria-labelledby={`round-${r.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`round-${r.id}`} className="text-18 font-bold text-navy">{r.title}</h3>
        <Chip tone={r.status === 'closed' ? 'complete' : 'info'}>{S.tabPage.status[r.status]}</Chip>
      </div>
      <p className="text-13 text-muted">{S.tabPage.window(r.goals, formatDate(r.opensOn), formatDate(r.closesOn))}</p>
      {r.can.open && <div className="mt-2"><button type="button" className={primary} onClick={() => act(repo.survey.openRound(r.id), S.toasts.roundOpened)}>{S.tabPage.openRound}</button></div>}
      {r.openCount && (
        <>
          <p className="mt-2 text-14">{S.tabPage.openCount(r.openCount.answered, r.asked)}</p>
          {r.openCount.byGroup.length > 0 && <p className="text-13 text-muted">{r.openCount.byGroup.map((g) => `${g.name}: ${g.n}`).join(' · ')}</p>}
          {r.can.close && <div className="mt-2"><button type="button" className={btn} onClick={() => act(repo.survey.closeRound(r.id), S.toasts.roundClosed)}>{S.tabPage.closeNow}</button></div>}
        </>
      )}
      {r.status === 'closed' && (
        <>
          <ClosingNote note={r.note} />
          {r.can.note && <NoteForm roundId={r.id} />}
          {r.unit && (
            <>
              <h4 className="mt-4 text-16 font-bold text-navy">{r.unit.name}</h4>
              {r.unit.block ? <><div className="mt-2"><KeyFacts b={r.unit.block} asked={r.unit.block.answered} /></div><Sentences b={r.unit.block} /></> : <p className="mt-1 rounded-lg bg-info-bg px-4 py-3 text-14">{R.tooFewUnit(min)}</p>}
            </>
          )}
          {r.whole && (
            <>
              <h4 className="mt-4 text-16 font-bold text-navy">{R.keyFacts}</h4>
              <div className="mt-1"><KeyFacts b={r.whole} asked={r.asked} /></div>
              {r.compare && <><h4 className="mt-4 text-16 font-bold text-navy">{R.byUnit}</h4><Compare cols={r.compare} min={min} /></>}
              <details className="mt-3">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{R.everyQuestion}</summary>
                <Sentences b={r.whole} />
              </details>
            </>
          )}
          {!r.whole && !r.unit && <p className="mt-2 rounded-lg bg-info-bg px-4 py-3 text-14">{R.tooFew}</p>}
          {r.coverage && r.whole && <Coverage rows={r.coverage} />}
          {role === 'strategy_office' && r.concerns && <Concerns r={r} min={min} />}
          {role === 'executive' && (
            <>
              <h4 className="mt-4 text-16 font-bold text-navy">{R.concernsExec}</h4>
              {r.summary ? <><p className="mt-1 border-l-4 border-border pl-3 text-14">{r.summary.text}</p><p className="mt-1 text-13 text-muted">{R.concernsAccepted(r.concernCount)}</p></> : <p className="mt-1 text-14 text-muted">{R.concernsPending(r.concernCount)}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Coverage({ rows }: { rows: NonNullable<TabRound['coverage']> }) {
  return (
    <>
      <h4 className="mt-4 text-16 font-bold text-navy">{R.coverage}</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="tabular w-full min-w-[24rem] border-collapse text-14">
          <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3 text-left font-semibold text-muted">{R.coverageUnit}</th><th scope="col" className="px-2 py-2 text-left font-semibold text-muted">{R.coverageMeetings}</th><th scope="col" className="px-2 py-2 text-right font-semibold text-muted">{R.coverageMet}</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.name} className="border-b border-border"><th scope="row" className="py-2 pr-3 text-left font-semibold text-navy">{x.name}</th><td className="px-2 py-2">{x.meetings.length}{x.meetings.length ? ` (${x.meetings.map((m) => formatDate(m)).join(', ')})` : ''}</td><td className="px-2 py-2 text-right">{R.ofN(x.met, x.of)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-1 text-13 text-muted">{R.coverageNote}</p>
    </>
  );
}

function Concerns({ r, min }: { r: TabRound; min: number }) {
  const { repo, say } = useApp();
  const [draft, setDraft] = useState<{ text: string; aiTaskId: string } | null>(null);
  return (
    <>
      <h4 className="mt-4 text-16 font-bold text-navy">{R.concerns(r.concerns!.length)}</h4>
      <p className="text-13 text-muted">{R.concernsNote(min)}</p>
      <ul className="mt-2 space-y-2">{r.concerns!.map((c, i) => <li key={i} className="border-l-4 border-advisory-border pl-3 text-14">{c.text}<br /><span className="text-13 text-muted">{c.group}</span></li>)}</ul>
      {r.summary?.accepted ? (
        <div className="mt-3"><Chip tone="complete">{R.summaryAccepted}</Chip> <span className="text-13 text-muted">{R.execSees}</span><p className="mt-1 border-l-4 border-border pl-3 text-14">{r.summary.text}</p></div>
      ) : draft ? (
        <div className="mt-3 rounded-lg border border-info-border bg-info-bg p-3">
          <p className="text-12 font-bold uppercase text-navy">{en.integrity.aiDraft}</p>
          <label className="sr-only" htmlFor={`sum-${r.id}`}>{R.concernsExec}</label>
          <textarea id={`sum-${r.id}`} rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} className={`${input} mt-1 py-2`} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { const x = repo.survey.acceptSummary(r.id, draft.text, draft.aiTaskId); say(x.ok ? S.toasts.summaryAccepted : null); }}>{R.acceptSummary}</button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>{R.discard}</button>
          </div>
        </div>
      ) : r.can.summary && r.concerns!.length > 0 ? (
        <div className="mt-3"><button type="button" className={btn} onClick={() => { void repo.survey.draftSummary(r.id).then((x) => { if (x.ok) setDraft({ text: x.text, aiTaskId: x.aiTaskId }); }); }}>{R.draftSummary}</button></div>
      ) : null}
    </>
  );
}

function NoteForm({ roundId }: { roundId: string }) {
  const { repo, say } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <form className="mt-4 rounded-lg border border-control p-3" noValidate onSubmit={(e) => { e.preventDefault(); const r = repo.survey.saveNote(roundId, text); if (!r.ok) return setError(S.errors[r.error] ?? null); say(S.toasts.noteSaved); }}>
      <label htmlFor={id} className={label}>{R.noteLabel}</label>
      <p id={`${id}-h`} className="text-13 text-muted">{R.noteHint}</p>
      <textarea id={id} aria-describedby={`${id}-h`} rows={3} maxLength={1000} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} className={`${input} py-2`} />
      {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
      <div className="mt-2"><button type="submit" className={primary}>{R.saveNote}</button></div>
    </form>
  );
}

function NewRound({ onDone }: { onDone: () => void }) {
  const { repo, say } = useApp();
  const f = repo.survey.newRound();
  const [d, setD] = useState<RoundDraft>(f.defaults);
  const [tried, setTried] = useState(false);
  const id = useId();
  const check = repo.survey.check(d);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const r = repo.survey.saveRound(d);
    if (!r.ok) return say(S.errors[r.error] ?? null);
    say(S.toasts.roundSaved);
    onDone();
  };
  return (
    <section className={`${card} mb-4`} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="text-18 font-bold text-navy">{S.form.title}</h3>
      <p className="text-14 text-muted">{S.form.lead}</p>
      <form className="mt-3 space-y-3" noValidate onSubmit={save}>
        <div>
          <label htmlFor={`${id}-n`} className={label}>{S.form.name}</label>
          <p id={`${id}-nh`} className="text-13 text-muted">{S.form.nameHint}</p>
          <input id={`${id}-n`} aria-describedby={`${id}-nh`} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className={input} list={`${id}-s`} />
          <datalist id={`${id}-s`}>{f.suggested.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <fieldset>
          <legend className={label}>{S.form.goals}</legend>
          {f.goals.map((g) => (
            <label key={g.id} className={`flex min-h-11 items-start gap-3 py-1 ${g.ok ? '' : 'text-muted'}`}>
              <input type="checkbox" className="mt-1 h-5 w-5" disabled={!g.ok} checked={d.goalIds.includes(g.id)}
                onChange={(e) => setD({ ...d, goalIds: e.target.checked ? [...d.goalIds, g.id] : d.goalIds.filter((x) => x !== g.id) })} />
              <span><span className="font-semibold text-navy">{g.label}</span>{!g.ok && <><br /><span className="text-13">{S.form.noRecord}</span></>}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={d.asksAboutChanges} onChange={(e) => setD({ ...d, asksAboutChanges: e.target.checked })} />{S.form.changes}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor={`${id}-o`} className={label}>{S.form.opens}</label><input id={`${id}-o`} type="date" value={d.opensOn} onChange={(e) => setD({ ...d, opensOn: e.target.value as never })} className={input} /></div>
          <div><label htmlFor={`${id}-c`} className={label}>{S.form.closes}</label><input id={`${id}-c`} type="date" aria-describedby={`${id}-ch`} value={d.closesOn} onChange={(e) => setD({ ...d, closesOn: e.target.value as never })} className={input} /><p id={`${id}-ch`} className="text-13 text-muted">{S.form.closesHint}</p></div>
        </div>
        <div aria-live="polite">
          {(tried || d.goalIds.length > 0) && check.mustFix.length > 0 && (
            <div className="rounded-lg border border-block-border bg-block-bg p-3 text-14 text-block-text"><p className="font-semibold">{S.form.mustFix}</p><ul className="mt-1 list-disc pl-5">{check.mustFix.map((m) => <li key={m}>{m}</li>)}</ul></div>
          )}
          {check.worth.length > 0 && (
            <div className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg p-3 text-14 text-advisory-text"><p className="font-semibold">{S.form.worth}</p><ul className="mt-1 list-disc pl-5">{check.worth.map((m) => <li key={m}>{m}</li>)}</ul></div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary}>{S.form.save}</button>
          <button type="button" className={btn} onClick={onDone}>{S.form.cancel}</button>
        </div>
      </form>
    </section>
  );
}
