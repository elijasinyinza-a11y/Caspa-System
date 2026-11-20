/**
 * Values group work on screen (v0.32.0; Values Group Work Specification v0.1, VG-1 to VG-10; contract v1.23). Behaviour
 * from the approved prototype `reference/caspa-values-group-work-prototype.html`.
 *
 * - `ValuesGroups`: the groups of a values session (on its card in the forming schedule, or on the Strategy landing).
 * - `ValuesFlipChart`: a group's flip chart at #/flipchart/<session>/<group>, for its scribe.
 * - `GroupSheet`: the printed group sheet at #/flipchart/<session>/<group>/sheet.
 * - `ValuesBoard`: the values board (in the vision step while forming; on the Strategy landing after publication).
 * - `ValuesLanding`: the Strategy landing's block after publication, when the active plan has no values (VG-8).
 * - `backingLine`: "Put forward by n of m groups" beside a draft value (VG-6: a fact, never a score).
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import type { Repository } from '../data/access/repository';
import type { CandidateView, ValuesBoardView, ValuesSessionView } from '../data/access/values-work';
import { ANSWER_QUESTIONS, MAX_CANDIDATES, VALUE_MEANING_MAX, VALUE_NAME_MAX, type AnswerQuestion } from '../rules/values-work';
import type { ValueInput } from '../rules/values';
import { formatDate, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, link, primary } from './organisation/ui';
import { hrefFor } from './router';

const V = en.valuesWork;
const field = `${input} py-2`;
const note = 'rounded-lg px-4 py-3 text-14';

/** VG-6: "Put forward by 2 of 3 groups" for a draft value that came from group work; null otherwise. */
export function backingLine(repo: Repository, v: ValueInput): string | null {
  const b = repo.valuesWork.backing(v.fromCandidateIds);
  return b ? V.board.putForwardShort(b.groups, b.of) : null;
}

/* ───────── Groups ───────── */

export function ValuesGroups({ session, boardElsewhere = false }: { session: ValuesSessionView; boardElsewhere?: boolean }) {
  const { repo, say } = useApp();
  const G = V.groups;
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="mt-3 border-t border-border pt-3" aria-labelledby={`vg-${session.workshopId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`vg-${session.workshopId}`} className="text-16 font-bold text-navy">{G.title}</h4>
        {session.canManage && editing !== 'new' && <button type="button" className={btn} onClick={() => setEditing('new')}>{G.add}</button>}
      </div>
      <p className="mt-1 text-13 text-muted">{G.intro}{boardElsewhere ? ` ${G.boardIn}` : ''}</p>
      {editing === 'new' && <GroupForm session={session} onDone={() => setEditing(null)} />}
      {session.groups.length === 0 ? <p className="mt-2 text-13 text-muted">{G.none}</p> : (
        <ul className="mt-2 divide-y divide-border">
          {session.groups.map((g) => (
            <li key={g.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 flex-[1_1_16rem]">
                  <b className="text-14 text-navy">{g.name}</b>
                  <span className="block text-13 text-muted">{G.scribeLine(g.scribe.name)} · {g.memberNames.length ? g.memberNames.join(', ') : G.onBoard}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Chip tone={g.closed ? 'info' : 'complete'}>{g.closed ? G.closed : G.entering}</Chip>
                  {g.closed && g.toReview > 0 && <Chip tone="advisory">{G.toReview(formatNumber(g.toReview))}</Chip>}
                </span>
              </div>
              {editing === g.id && <GroupForm session={session} groupId={g.id} onDone={() => setEditing(null)} />}
              <div className="mt-2 flex flex-wrap gap-2">
                <a className={btn} href={hrefFor({ kind: 'flipchart', workshopId: session.workshopId, groupId: g.id })}>
                  {session.canRun && !g.closed ? G.enter : G.openChart}<span className="sr-only">: {g.name}</span>
                </a>
                {session.canRun && <a className={btn} href={hrefFor({ kind: 'flipchart', workshopId: session.workshopId, groupId: g.id, sheet: true })}>{G.sheet}<span className="sr-only">: {g.name}</span></a>}
                {session.canManage && !g.closed && editing !== g.id && <button type="button" className={btn} onClick={() => setEditing(g.id)}>{G.edit}<span className="sr-only">: {g.name}</span></button>}
                {session.canRun && (g.closed
                  ? <button type="button" className={btn} onClick={() => { if (repo.valuesWork.setGroupClosed(session.workshopId, g.id, false).ok) say(G.reopenNote); }}>{G.reopen}<span className="sr-only">: {g.name}</span></button>
                  : <button type="button" className={primary} onClick={() => { if (repo.valuesWork.setGroupClosed(session.workshopId, g.id, true).ok) say(G.closedNote); }}>{G.close}<span className="sr-only">: {g.name}</span></button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupForm({ session, groupId, onDone }: { session: ValuesSessionView; groupId?: string; onDone: () => void }) {
  const { repo } = useApp();
  const G = V.groups;
  const g = groupId ? session.groups.find((x) => x.id === groupId) : undefined;
  const [name, setName] = useState(g?.name ?? `Group ${session.groups.length + 1}`);
  const [scribe, setScribe] = useState(g?.scribe.membershipId ?? '');
  const [members, setMembers] = useState((g?.memberNames ?? []).join('\n'));
  const [error, setError] = useState<string | null>(null);
  const idp = `vgf-${groupId ?? 'new'}`;
  const save = () => {
    const input = { name, scribeMembershipId: scribe, memberNames: members.split('\n') };
    const r = groupId ? repo.valuesWork.updateGroup(session.workshopId, groupId, input) : repo.valuesWork.addGroup(session.workshopId, input);
    if (r.ok) onDone(); else setError(r.error === 'too_long' ? G.tooLong : G.required);
  };
  return (
    <div className="mt-2 rounded-lg bg-strategy-tint p-3">
      <h5 className="text-14 font-bold text-navy">{g ? G.editTitle(g.name) : G.newTitle}</h5>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <div><label htmlFor={`${idp}-n`} className={label}>{G.name}</label><input id={`${idp}-n`} className={input} maxLength={40} value={name} placeholder={G.namePlaceholder} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor={`${idp}-s`} className={label}>{G.scribe}</label>
          <select id={`${idp}-s`} className={input} value={scribe} onChange={(e) => setScribe(e.target.value)}>
            <option value="">{G.choose}</option>
            {session.members.map((m) => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}
          </select></div>
      </div>
      <label htmlFor={`${idp}-m`} className={`${label} mt-3`}>{G.members}</label>
      <textarea id={`${idp}-m`} rows={3} className={field} value={members} onChange={(e) => setMembers(e.target.value)} />
      <p className="mt-1 text-12 text-muted">{G.membersHint}</p>
      {error && <p role="alert" className="mt-2 text-13 text-block-text">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{G.save}</button>
        <button type="button" className={btn} onClick={onDone}>{G.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── Flip chart ───────── */

export function ValuesFlipChart({ workshopId, groupId }: { workshopId: string; groupId: string }) {
  const { repo } = useApp();
  const C = V.chart;
  const f = repo.valuesWork.flipChart(workshopId, groupId);
  if (!f) return <p className={`${note} bg-info-bg`}>{C.notYours}</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-13 text-muted">{C.eyebrow(f.planTitle)}{f.scheduledOn ? ` · ${formatDate(f.scheduledOn)}` : ''}</p>
        <h1 className="text-28 font-bold text-navy">{C.title(f.name)}</h1>
        <p className="mt-1 text-14">{C.intro}</p>
      </div>
      {f.onBehalf && f.open && <p className={`${note} border border-advisory-border bg-advisory-bg text-advisory-text`}>{C.onBehalf(f.name)}</p>}
      {!f.open && <p className={`${note} bg-info-bg`}>{C.closed}</p>}
      {f.offline && <p role="status" className={`${note} border border-advisory-border bg-advisory-bg text-advisory-text`}>{C.offline}</p>}
      {f.open && !f.canEnter && <p className={`${note} bg-info-bg`}>{C.lookOnly}</p>}
      <div className="space-y-3 rounded-xl bg-navy p-3 md:p-4">
        {ANSWER_QUESTIONS.map((q) => <Question key={q} f={f} q={q} />)}
        <Candidates f={f} />
      </div>
    </div>
  );
}

type Chart = NonNullable<ReturnType<Repository['valuesWork']['flipChart']>>;

function QuestionHead({ n }: { n: number }) {
  return (
    <h2 className="flex gap-2 text-14 font-semibold text-white">
      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-12 font-bold text-navy">{n}</span>
      <span><span className="sr-only">Question {n}: </span>{V.questions[n - 1]}</span>
    </h2>
  );
}

function Question({ f, q }: { f: Chart; q: AnswerQuestion }) {
  const { repo, say } = useApp();
  const C = V.chart;
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const answers = f.answers.filter((a) => a.question === q);
  const waiting = f.waitingAnswers.filter((a) => a.question === q);
  const add = () => {
    if (!text.trim()) { setError(true); return; }
    const r = repo.valuesWork.addAnswer(f.workshopId, f.groupId, q, text);
    if (r.ok) { setText(''); setError(false); say(r.queued ? C.savedOnDevice : C.added); }
  };
  return (
    <section className="rounded-lg bg-text p-3" aria-label={`Question ${q}`}>
      <QuestionHead n={q} />
      {answers.length || waiting.length ? (
        <ul className="mt-2 space-y-2">
          {answers.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-14">
              <span className="min-w-0 flex-[1_1_14rem]">{a.text}</span>
              {f.canEnter && <button type="button" className={btn} onClick={() => { if (repo.valuesWork.deleteAnswer(f.workshopId, f.groupId, a.id).ok) say(C.deleted); }}>{C.delete}<span className="sr-only">: {a.text}</span></button>}
            </li>
          ))}
          {waiting.map((a) => <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-14"><span>{a.text}</span><Chip tone="advisory">{C.waiting}</Chip></li>)}
        </ul>
      ) : <p className="mt-2 text-13 text-white">{C.noAnswers}</p>}
      {f.canEnter && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_14rem]">
            <label htmlFor={`va-${q}`} className="block text-12 font-semibold text-white">{C.addPoint}</label>
            <input id={`va-${q}`} className={input} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </div>
          <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-14 font-semibold text-navy" onClick={add}>{C.add}<span className="sr-only"> {C.toQuestion(q)}</span></button>
          {error && <p role="alert" className="w-full text-13 text-white">{C.writeFirst}</p>}
        </div>
      )}
    </section>
  );
}

function Candidates({ f }: { f: Chart }) {
  const C = V.chart;
  const [adding, setAdding] = useState(false);
  const total = f.candidates.length + f.waitingCandidates.length;
  return (
    <section className="rounded-lg bg-text p-3" aria-label="Question 5">
      <QuestionHead n={5} />
      <p className="mt-1 text-12 text-white">{C.count(total, MAX_CANDIDATES)}</p>
      <div className="mt-2 space-y-2">
        {f.candidates.map((c) => <CandidateCard key={c.id} f={f} c={c} />)}
        {f.waitingCandidates.map((c) => (
          <div key={c.key} className="rounded-lg bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-14 text-navy">{c.name}</b><Chip tone="advisory">{C.waiting}</Chip></div><p className="mt-1 text-14">{c.meaning}</p></div>
        ))}
        {adding && <CandidateForm f={f} onDone={() => setAdding(false)} />}
      </div>
      {f.mayAddCandidate && !adding && <button type="button" className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-white px-4 text-14 font-semibold text-white" onClick={() => setAdding(true)}>{C.addCandidate}</button>}
    </section>
  );
}

function CandidateCard({ f, c }: { f: Chart; c: Chart['candidates'][number] }) {
  const { repo, say } = useApp();
  const C = V.chart;
  const [editing, setEditing] = useState(false);
  if (editing) return <CandidateForm f={f} c={c} onDone={() => setEditing(false)} />;
  const tone = c.state === 'to_review' ? 'advisory' : c.state === 'kept' ? 'complete' : 'info';
  return (
    <div className="rounded-lg bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-16 text-navy">{c.name}</b>
        <span className="flex flex-wrap gap-2">{c.onBehalf && <Chip tone="info">{C.onBehalfTag}</Chip>}<Chip tone={tone}>{C.state[c.state]}</Chip></span>
      </div>
      <p className="mt-1 text-14">{c.meaning}</p>
      {c.canChange && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setEditing(true)}>{C.change}<span className="sr-only">: {c.name}</span></button>
          <button type="button" className={btn} onClick={() => { if (repo.valuesWork.deleteCandidate(c.id).ok) say(C.deleted); }}>{C.delete}<span className="sr-only">: {c.name}</span></button>
        </div>
      )}
    </div>
  );
}

function CandidateForm({ f, c, onDone }: { f: Chart; c?: Chart['candidates'][number]; onDone: () => void }) {
  const { repo, say } = useApp();
  const C = V.chart;
  const [name, setName] = useState(c?.name ?? '');
  const [meaning, setMeaning] = useState(c?.meaning ?? '');
  const [ties, setTies] = useState<string[]>(c?.answerIds ?? []);
  const [ai, setAi] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idp = `vcf-${c?.id ?? 'new'}`;
  const save = () => {
    const input = { name, meaning, answerIds: ties };
    const r = c ? repo.valuesWork.updateCandidate(c.id, input) : repo.valuesWork.addCandidate(f.workshopId, f.groupId, input);
    if (r.ok) { say('queued' in r && r.queued ? C.savedOnDevice : C.saved); onDone(); } else setError(C.errors[r.error] ?? C.errors.name_required!);
  };
  const tidy = async () => {
    const r = await repo.valuesWork.tidyWording(f.workshopId, f.groupId, meaning);
    if (r.ok) { setAi(r.draft.text); setError(null); } else setError(C.errors[r.error] ?? null);
  };
  return (
    <div className="rounded-lg bg-white p-3">
      <label htmlFor={`${idp}-n`} className={label}>{C.valueName}</label>
      <input id={`${idp}-n`} className={input} maxLength={VALUE_NAME_MAX} placeholder={C.valuePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      <p className="mt-1 text-12 text-muted">{C.chars(name.length, VALUE_NAME_MAX)}</p>
      <label htmlFor={`${idp}-t`} className={`${label} mt-2`}>{C.meaning}</label>
      <textarea id={`${idp}-t`} rows={2} className={field} maxLength={VALUE_MEANING_MAX} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      {f.aiEnabled && (ai ? (
        <div className="mt-2 rounded-lg border border-border bg-cream p-3">
          <Chip tone="info">{C.aiLabel}</Chip>
          <p className="mt-2 text-14">{ai}</p>
          <p className="mt-1 text-12 text-muted">{C.aiNote}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { setMeaning(ai); setAi(null); }}>{C.useIt}</button>
            <button type="button" className={btn} onClick={() => { setMeaning(ai); setAi(null); document.getElementById(`${idp}-t`)?.focus(); }}>{C.changeFirst}</button>
            <button type="button" className={btn} onClick={() => setAi(null)}>{C.ignore}</button>
          </div>
        </div>
      ) : <button type="button" className={`${btn} mt-2`} onClick={tidy}>{C.tidy}</button>)}
      {f.answers.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-13 font-semibold text-strategy-text">{C.from} · {C.ticked(ties.length)}</summary>
          <div className="space-y-2">
            {f.answers.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-13">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={ties.includes(a.id)} onChange={(e) => setTies(e.target.checked ? [...ties, a.id] : ties.filter((x) => x !== a.id))} />
                <span><span className="text-muted">{V.board.question(a.question)}:</span> {a.text}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert" className="mt-2 text-13 text-block-text">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{C.saveCandidate}</button>
        <button type="button" className={btn} onClick={onDone}>{C.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── Printed group sheet ───────── */

export function GroupSheet({ workshopId, groupId }: { workshopId: string; groupId: string }) {
  const { repo } = useApp();
  const S = V.sheet;
  const g = repo.valuesWork.groupSheet(workshopId, groupId);
  if (!g) return <p className={`${note} bg-info-bg`}>{S.notYours}</p>;
  const box = 'mt-2 h-24 rounded border border-dashed border-control';
  return (
    <article className="space-y-4 rounded-xl bg-white p-4 md:p-8">
      <p className="no-print text-13 text-muted">{S.hint} <button type="button" className={link} onClick={() => window.print()}>{S.print}</button> · <a className={link} href="#/strategy">{S.back}</a></p>
      <h1 className="text-22 font-bold text-navy">{S.title(g.name)}</h1>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-13">
        <dt className="text-muted">{S.organisation}</dt><dd className="font-semibold">{g.organisation}</dd>
        <dt className="text-muted">{S.plan}</dt><dd className="font-semibold">{g.planTitle}</dd>
        <dt className="text-muted">{S.session}</dt><dd className="font-semibold">{g.scheduledOn ? formatDate(g.scheduledOn) : S.notDated}</dd>
        <dt className="text-muted">{S.scribe}</dt><dd className="font-semibold">{g.scribe}</dd>
        <dt className="text-muted">{S.members}</dt><dd>{g.memberNames.length ? g.memberNames.join(', ') : '______________________________'}</dd>
      </dl>
      {V.questions.slice(0, 4).map((q, i) => (
        <section key={i} className="break-inside-avoid border-t border-border pt-3"><b className="text-14">{i + 1}. {q}</b><div className={box} /></section>
      ))}
      <section className="break-inside-avoid border-t border-border pt-3">
        <b className="text-14">5. {V.questions[4]}</b>
        <div className="mt-2 grid gap-2 md:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="h-28 rounded border border-dashed border-control p-2 text-12 text-muted">{S.valueBox(n)}</div>)}</div>
      </section>
    </article>
  );
}

/* ───────── Values board ───────── */

export function ValuesBoard({ workshopId }: { workshopId: string }) {
  const { repo } = useApp();
  const B = V.board;
  const b = repo.valuesWork.board(workshopId);
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<string[]>([]);
  if (!b) return null;
  const closed = b.groups.filter((g) => g.closed);
  const shown = b.candidates.filter((c) => filter === 'all' || (filter === 'review' ? c.state === 'to_review' : c.groups.includes(b.groups.find((g) => g.id === filter)?.name ?? '')));
  const sel = selected.map((id) => b.candidates.find((c) => c.id === id)).filter((c): c is CandidateView => !!c && (c.state === 'to_review' || c.state === 'kept') && !c.inDraft);
  return (
    <section className={card} aria-labelledby={`vb-${workshopId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`vb-${workshopId}`} className="text-18 font-bold text-navy">{B.title}</h3>
        <span className="text-13 text-muted">{B.counts(formatNumber(b.toReview), formatNumber(closed.length), formatNumber(b.groups.length))}</span>
      </div>
      <p className="mt-1 text-13 text-muted">{b.canReview ? B.intro : B.introView}</p>
      {b.draftCount > 0 && <p className="mt-2 rounded-lg bg-strategy-tint px-3 py-2 text-13">{B.draftHere(formatNumber(b.draftCount))}</p>}
      {b.draftBlocked && b.draftBlocked !== 'draft_full' && <p className="mt-2 rounded-lg bg-info-bg px-3 py-2 text-13">{B.blocked[b.draftBlocked]}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show">
        {[['all', B.all], ['review', B.toReviewFilter], ...closed.map((g) => [g.id, g.name])].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k!)}
            className={`min-h-11 rounded-full border px-4 text-14 font-semibold ${filter === k ? 'border-navy bg-navy text-white' : 'border-border bg-white text-text'}`}>{l}</button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {shown.length ? shown.map((c) => (
          <CandidateRow key={c.id} b={b} c={c} selected={selected.includes(c.id)} onSelect={(on) => setSelected(on ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
        )) : <p className="text-13 text-muted">{B.none}</p>}
      </div>
      {b.canReview && sel.length === 1 && <p className="sticky bottom-3 mt-3 rounded-xl bg-navy px-4 py-3 text-13 text-white">{B.oneSelected}</p>}
      {b.canReview && sel.length >= 2 && <MergeBar sel={sel} onDone={() => setSelected([])} />}
    </section>
  );
}

function CandidateRow({ b, c, selected, onSelect }: { b: ValuesBoardView; c: CandidateView; selected: boolean; onSelect: (on: boolean) => void }) {
  const { repo, say } = useApp();
  const B = V.board;
  const [mode, setMode] = useState<'view' | 'edit' | 'aside'>('view');
  const [name, setName] = useState(c.name);
  const [meaning, setMeaning] = useState(c.meaning);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tone = c.state === 'to_review' ? 'advisory' : c.state === 'kept' ? 'complete' : 'info';
  const selectable = b.canReview && !c.inDraft && (c.state === 'to_review' || c.state === 'kept') && mode === 'view';
  const done = (r: { ok: true } | { ok: false; error: string }, text: string) => { if (r.ok) { setMode('view'); setError(null); say(text); } else setError(B.errors[r.error] ?? null); };
  const box = c.state === 'to_review' ? 'border-advisory-border bg-advisory-bg' : c.state === 'set_aside' ? 'border-border bg-cream' : 'border-border bg-white';
  return (
    <article className={`rounded-xl border p-3 ${box}`}>
      <div className="flex items-start gap-3">
        {selectable && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={B.selectToMerge(c.name)} />}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-16 text-navy">{c.name}</b><Chip tone={tone}>{V.chart.state[c.state]}</Chip></div>
          <p className="text-14">{c.meaning}</p>
          {c.entered && <p className="text-12 text-muted">{B.groupsWording}: <b>{c.entered.name}</b>: {c.entered.meaning}</p>}
          <p className="text-13 font-semibold text-strategy-text">{B.putForward(c.groups.length, c.of, c.groups.join(', '))}</p>
          {c.mergedFrom.length > 0 && <p className="text-12 text-muted">{B.mergedFrom}: {c.mergedFrom.map((m) => `${m.name} (${m.group})`).join(', ')}</p>}
          {c.state === 'set_aside' && c.setAsideReason && <p className="text-12 text-muted">{B.setAsideBecause}: {c.setAsideReason}</p>}
          {c.onBehalf && <Chip tone="info">{V.chart.onBehalfTag}</Chip>}
          {c.answers.length > 0 && (
            <details>
              <summary className="min-h-8 cursor-pointer text-13 font-semibold text-strategy-text">{B.answersFrom(formatNumber(c.answers.length))}</summary>
              <ul className="mt-1 list-disc pl-5 text-13">{c.answers.map((a, i) => <li key={i}><span className="text-muted">{a.group}, {B.question(a.question)}:</span> {a.text}</li>)}</ul>
            </details>
          )}
        </div>
      </div>
      {mode === 'edit' && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div><label htmlFor={`kn-${c.id}`} className={label}>{V.chart.valueName}</label><input id={`kn-${c.id}`} className={input} maxLength={VALUE_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label htmlFor={`kt-${c.id}`} className={label}>{V.chart.meaning}</label><textarea id={`kt-${c.id}`} rows={2} className={field} maxLength={VALUE_MEANING_MAX} value={meaning} onChange={(e) => setMeaning(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="button" className={primary} onClick={() => done(repo.valuesWork.keep(c.id, { name, meaning }), B.keptEdited)}>{B.keepEdited}</button>
            <button type="button" className={btn} onClick={() => setMode('view')}>{B.cancel}</button>
          </div>
        </div>
      )}
      {mode === 'aside' && (
        <div className="mt-3">
          <label htmlFor={`ar-${c.id}`} className={label}>{B.reason}</label>
          <input id={`ar-${c.id}`} className={input} placeholder={B.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { if (!reason.trim()) { setError(B.reasonRequired); return; } done(repo.valuesWork.setAside(c.id, reason), B.setAside); }}>{B.aside}</button>
            <button type="button" className={btn} onClick={() => setMode('view')}>{B.cancel}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-13 text-block-text">{error}</p>}
      {b.canReview && mode === 'view' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.state === 'to_review' && <>
            <button type="button" className={primary} onClick={() => done(repo.valuesWork.keep(c.id), B.kept(c.name))}>{B.keep}<span className="sr-only">: {c.name}</span></button>
            <button type="button" className={btn} onClick={() => setMode('edit')}>{B.editKeep}<span className="sr-only">: {c.name}</span></button>
            <button type="button" className={btn} onClick={() => setMode('aside')}>{B.aside}<span className="sr-only">: {c.name}</span></button>
          </>}
          {c.state === 'kept' && <>
            {c.inDraft ? <Chip tone="complete">{B.inDraft}</Chip>
              : <button type="button" className={primary} disabled={!b.canDraft || !!b.draftBlocked} title={b.draftBlocked ? B.blocked[b.draftBlocked] : undefined} onClick={() => done(repo.valuesWork.addToDraftValues(c.id), B.added(c.name))}>{B.toDraft}<span className="sr-only">: {c.name}</span></button>}
            {!c.inDraft && <button type="button" className={btn} onClick={() => setMode('edit')}>{B.edit}<span className="sr-only">: {c.name}</span></button>}
            {!c.inDraft && <button type="button" className={btn} onClick={() => setMode('aside')}>{B.aside}<span className="sr-only">: {c.name}</span></button>}
          </>}
          {c.state === 'set_aside' && <button type="button" className={btn} onClick={() => done(repo.valuesWork.backToReview(c.id), B.backed)}>{B.backToReview}<span className="sr-only">: {c.name}</span></button>}
        </div>
      )}
    </article>
  );
}

function MergeBar({ sel, onDone }: { sel: CandidateView[]; onDone: () => void }) {
  const { repo, say } = useApp();
  const B = V.board;
  const [target, setTarget] = useState(sel[0]!.id);
  const t = sel.find((c) => c.id === target) ?? sel[0]!;
  const [name, setName] = useState(t.name);
  const [meaning, setMeaning] = useState(t.meaning);
  const [error, setError] = useState<string | null>(null);
  const pick = (id: string) => { const c = sel.find((x) => x.id === id)!; setTarget(id); setName(c.name); setMeaning(c.meaning); };
  const merge = () => {
    const r = repo.valuesWork.merge(sel.map((c) => c.id), t.id, { name, meaning });
    if (r.ok) { say(B.merged(name.trim())); onDone(); } else setError(B.errors[r.error] ?? null);
  };
  return (
    <div role="region" aria-label={B.mergeTitle(formatNumber(sel.length))} className="sticky bottom-3 mt-3 space-y-3 rounded-xl bg-navy p-4 text-white">
      <b className="text-14">{B.mergeTitle(formatNumber(sel.length))}</b>
      <fieldset><legend className="text-12">{B.startFrom}</legend>
        <div className="mt-1 flex flex-col gap-1">
          {sel.map((c) => <label key={c.id} className="flex min-h-11 items-center gap-2 text-14"><input type="radio" name="merge-target" className="h-5 w-5" checked={c.id === t.id} onChange={() => pick(c.id)} />{c.name} <span className="text-12">({c.group.name})</span></label>)}
        </div>
      </fieldset>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div><label htmlFor="mg-n" className="block text-12 font-semibold">{B.mergedName}</label><input id="mg-n" className={input} maxLength={VALUE_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="mg-t" className="block text-12 font-semibold">{V.chart.meaning}</label><textarea id="mg-t" rows={2} className={field} maxLength={VALUE_MEANING_MAX} value={meaning} onChange={(e) => setMeaning(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="text-13">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-14 font-semibold text-navy" onClick={merge}>{B.mergeKeep}</button>
        <button type="button" className="inline-flex min-h-11 items-center rounded-lg border border-white px-4 text-14 font-semibold text-white" onClick={onDone}>{B.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── Strategy landing, after publication (VG-8) ───────── */

export function ValuesLanding() {
  const { repo, say } = useApp();
  const L = V.landing;
  const session = repo.valuesWork.sessionFor('after');
  if (session?.locked) return null;
  if (session) {
    return (
      <div className="space-y-4">
        <section className={card} aria-labelledby="vw-landing">
          <h2 id="vw-landing" className="text-18 font-bold text-navy">{L.title}</h2>
          <ValuesGroups session={session} />
        </section>
        <ValuesBoard workshopId={session.workshopId} />
      </div>
    );
  }
  if (!repo.valuesWork.canStartAfterPublication()) return null;
  return (
    <section className={card} aria-labelledby="vw-landing">
      <h2 id="vw-landing" className="text-18 font-bold text-navy">{L.title}</h2>
      <p className="mt-1 text-14">{L.intro}</p>
      <button type="button" className={`${primary} mt-3`} onClick={() => { if (repo.valuesWork.startAfterPublication().ok) say(L.started); }}>{L.start}</button>
    </section>
  );
}
