/**
 * Performance › Reviews (v0.20.0; Reviews Specification v0.1, RV-1 to RV-10). One page with a tab for each part a
 * person plays: Mine, My team, To check, Round. Scores read as sentences (RV-6); everything comes from repo.reviews.
 * Matches reference/caspa-reviews-prototype.html.
 */
import { useId, useState } from 'react';
import { useApp } from '../components/AppContext';
import { EntryRow } from '../components/SubMenu';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { quarterOf, type ObjectiveLine, type ReviewTab, type ReviewView, type RoundView } from '../data/access/reviews';
import { formatDate, formatFinancialYear, formatNumber, formatPercent } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, primary } from './organisation/ui';
import { hrefFor } from './router';
import { ScoringPolicy } from './ScoringPolicy';

const R = en.reviews;
/** "mid-year", "year-end" or "quarter 2" (TG-11). */
function useKindLabel() {
  const { repo } = useApp();
  const start = repo.settings().financialYearStartMonth;
  return (kind: string, periodEnd: string | null) => (kind === 'quarterly' && periodEnd ? R.quarter(quarterOf(periodEnd, start)) : R.kind[kind]!);
}

export function ReviewsPage({ tab, reviewId }: { tab?: ReviewTab; reviewId?: string }) {
  const { repo } = useApp();
  const p = repo.reviews.page();
  const single = reviewId ? repo.reviews.review(reviewId) : null;
  // A review opened by its link shows in the tab for the part this person plays in it.
  const fromReview: ReviewTab | undefined = single ? (p.mine.some((x) => x.id === single.id) ? 'mine' : p.team.some((x) => x.id === single.id) ? 'team' : p.check.some((x) => x.id === single.id) ? 'check' : 'round') : undefined;
  const on: ReviewTab = (tab && p.tabs.includes(tab) ? tab : fromReview && p.tabs.includes(fromReview) ? fromReview : p.opensOn);
  return (
    <>
      <WorkspaceHeader w="performance" title={R.title} intro={R.purpose} />
      <EntryRow w="performance" />
      {p.tabs.length > 1 && (
        <nav aria-label={R.tabsLabel} className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
          {p.tabs.map((t) => (
            <a key={t} href={hrefFor({ kind: 'reviews', tab: t })} aria-current={on === t ? 'page' : undefined}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-4 px-3 text-14 ${on === t ? 'border-navy font-bold text-navy' : 'border-transparent text-muted hover:text-navy'}`}>{R.tabs[t]}</a>
          ))}
        </nav>
      )}
      {on === 'mine' && p.mine.map((r) => <Review key={r.id} r={r} share={p.yearShare} fy={formatFinancialYear(p.financialYear, repo.settings().financialYearStartMonth)} as="employee" />)}
      {on === 'team' && <Team rows={p.team} open={single && p.team.some((x) => x.id === single.id) ? single.id : null} share={p.yearShare} />}
      {on === 'check' && (p.check.length ? p.check.map((r) => <Review key={r.id} r={r} share={p.yearShare} as="reviewer" />) : <p className={`${card} text-14 text-muted`}>{R.check.empty}</p>)}
      {on === 'policy' && <ScoringPolicy />}
      {on === 'round' && p.round && <Round rv={p.round} fy={formatFinancialYear(p.financialYear, repo.settings().financialYearStartMonth)} />}
    </>
  );
}

function Lines({ r, share, supervise, employeeAsk = false }: { r: ReviewView; share: number; supervise: boolean; employeeAsk?: boolean }) {
  return (
    <>
      <ul className="mt-2">
        {r.objectives.map((o) => <Line key={o.id} o={o} reviewId={r.id} supervise={supervise && r.method === 'bands'} employeeAsk={employeeAsk} points={r.method === 'weighted_points'} />)}
      </ul>
      {r.overall ? (
        <>
          <p className="mt-3 text-16 text-text">{R.overall(r.overall.display, r.overall.label)} <span className="font-semibold">{r.overall.provisional ? R.provisional : R.final}</span></p>
          {r.method === 'bands' && r.overall.percent !== null && <p className="tabular text-13 text-muted">{R.total.percent(`${r.overall.percent.toFixed(2)}%`)}</p>}
          <p className="text-13 text-muted">{r.methodText}.</p>
          {r.scoredWeightPct < r.totalWeightPct && <p className="text-13 text-muted">{R.partial(r.scoredWeightPct)}</p>}
          {(r.kind === 'mid_year' || r.kind === 'quarterly') && <p className="text-13 text-muted">{R.midYear(formatPercent(share))}</p>}
        </>
      ) : <p className="mt-3 text-14 text-muted">{R.nothingScored}</p>}
    </>
  );
}

function Line({ o, reviewId, supervise, employeeAsk, points }: { o: ObjectiveLine; reviewId: string; supervise: boolean; employeeAsk: boolean; points: boolean }) {
  const { repo, say } = useApp();
  const id = useId();
  const [delta, setDelta] = useState<-1 | 0 | 1>(o.adjustment?.delta ?? 0);
  const [reason, setReason] = useState('');
  const O = R.objective;
  const fig = (n: number | null) => (n === null ? '—' : formatNumber(n));
  const pct = o.achievement === null ? (o.done === 0 && o.lower ? '∞' : '—') : formatPercent(o.achievement);
  const main = o.cantAssess?.accepted ? O.cantAssess(o.cantAssess.reason)
    : o.basis !== 'verified' ? (o.basis === 'no_quantity' ? O.noQuantity : O.notScored)
    : `${o.lower ? O.lower(fig(o.done), fig(o.target), pct) : O.verified(fig(o.done), fig(o.target), pct)} ${points ? R.points((o.points ?? 0).toFixed(2)) + '.' : O.score(o.score ?? 0, o.label ?? '')}`;
  const act = (res: { ok: boolean; error?: string }, ok: string) => say(res.ok ? ok : R.errors[res.error ?? 'not_allowed'] ?? null);
  return (
    <li className="border-t border-border py-3">
      <p className="font-bold text-navy">{o.title}</p>
      <p className="tabular text-14 text-text">{main}</p>
      {o.fullYearTarget !== null && o.target !== null && o.fullYearTarget !== o.target && <p className="tabular text-13 text-muted">{R.periodTarget(fig(o.target), fig(o.fullYearTarget))}</p>}
      {o.selfDone !== null && o.selfDone !== o.done && <p className="tabular text-13 text-muted">{R.selfReported(fig(o.selfDone))}</p>}
      {o.adjustment && <p className="text-13 text-muted">{O.moved(o.adjustment.delta > 0 ? 'up' : 'down', o.adjustment.by, o.adjustment.reason)}</p>}
      {o.cantAssess && !o.cantAssess.accepted && <p className="text-13 text-muted">{O.cantAssessAsked(o.cantAssess.reason)}</p>}
      {o.lower && <p className="text-13 text-muted">{O.lowerNote}</p>}
      {o.depends.map((d) => <p key={d} className="mt-1 rounded-lg bg-cream px-3 py-2 text-13">{d}</p>)}
      <p className="text-13 text-muted">{O.verifiedAt(o.verifiedOn ? formatDate(o.verifiedOn) : '', o.weightPct)}</p>
      {employeeAsk && !o.cantAssess && (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{R.sup.askHr}</summary>
          <label htmlFor={`${id}-er`} className={label}>{R.sup.reason}</label>
          <textarea id={`${id}-er`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
          <div className="mt-2"><button type="button" className={btn} onClick={() => act(repo.reviews.askCantAssess(reviewId, o.id, reason), R.toasts.askedHr)}>{R.sup.askHr}</button></div>
        </details>
      )}
      {supervise && o.bandScore !== null && !o.cantAssess?.accepted && (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{R.sup.change}</summary>
          <div className="mt-1 space-y-2">
            <div>
              <label htmlFor={`${id}-d`} className={label}>{R.sup.move}</label>
              <select id={`${id}-d`} value={delta} onChange={(e) => setDelta(Number(e.target.value) as -1 | 0 | 1)} className={input}>
                <option value={0}>{R.sup.keep(o.bandScore, '')}</option>
                {o.bandScore < 5 && <option value={1}>{R.sup.up(o.bandScore + 1)}</option>}
                {o.bandScore > 1 && <option value={-1}>{R.sup.down(o.bandScore - 1)}</option>}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-r`} className={label}>{R.sup.reason}</label>
              <textarea id={`${id}-r`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => act(repo.reviews.adjust(reviewId, o.id, delta, reason), R.toasts.saved)}>{R.sup.save}</button>
              <button type="button" className={btn} onClick={() => act(repo.reviews.askCantAssess(reviewId, o.id, reason), R.toasts.askedHr)}>{R.sup.askHr}</button>
            </div>
          </div>
        </details>
      )}
    </li>
  );
}

function Review({ r, share, fy, as }: { r: ReviewView; share: number; fy?: string; as: 'employee' | 'supervisor' | 'reviewer' }) {
  const { repo, say } = useApp();
  const id = useId();
  const [self, setSelf] = useState(r.self.text);
  const [assessment, setAssessment] = useState(r.assessment ?? '');
  const [reason, setReason] = useState('');
  const [dis, setDis] = useState('');
  const kindLabel = useKindLabel();
  const kind = kindLabel(r.kind, r.periodEnd);
  const act = (res: { ok: boolean; error?: string; queued?: boolean; note?: string }, ok: string) => say(res.ok ? (res.queued ? R.toasts.savedOffline : ok) : R.errors[res.error ?? 'not_allowed'] ?? null);
  const stepTone = r.step === 'acknowledged' ? 'complete' : 'info';
  return (
    <section className="mb-6" aria-label={as === 'employee' ? R.yourReview(kind, fy ?? '') : R.personReview(r.person, kind)}>
      <div className={`${card} border-t-4 border-t-performance-mark`}>
        <h2 className="text-18 font-bold text-navy">{as === 'employee' ? R.yourReview(kind, fy ?? '') : R.personReview(r.person, kind)}</h2>
        <p className="text-13 text-muted">{R.meta(r.position, r.supervisor || '—', r.due ? formatDate(r.due) : '—')}</p>
        <p className="mt-1"><Chip tone={stepTone}>{R.step[r.step]}</Chip></p>
        {as === 'reviewer' && r.flags.map((f, i) => <p key={i} className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text"><b>{R.check.flag[f.kind]}</b> {f.title}</p>)}
        <Lines r={r} share={share} supervise={r.can.supervise} employeeAsk={as === 'employee' && (r.step === 'awaiting_self' || r.step === 'awaiting_supervisor')} />
        {r.step !== 'awaiting_self' && r.step !== 'awaiting_supervisor' && r.step !== 'waiting_to_send' && <p className="mt-2"><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'print', doc: 'review', id: r.id })}>{R.print}<span className="sr-only">: {r.person}</span></a></p>}
        {r.history.length > 0 && <p className="tabular mt-2 text-13 text-muted">{R.history} {r.history.map((h) => R.historyItem(kindLabel(h.kind, h.periodEnd), h.score === null ? '—' : h.score.toFixed(2))).join(' · ')}</p>}
      </div>

      {r.attributes.enabled && <Attributes r={r} as={as} />}

      <div className={`${card} mt-3`}>
        <h3 className="text-16 font-bold text-navy">{R.self.title}</h3>
        {r.sentBack && <p className="mt-1 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text"><b>{R.self.sentBack(r.supervisor)}</b> {r.sentBack}</p>}
        {r.can.writeSelf ? (
          <>
            <label htmlFor={`${id}-s`} className={`${label} mt-2 block`}>{R.self.label}</label>
            <p id={`${id}-sh`} className="text-13 text-muted">{R.self.hint}</p>
            <textarea id={`${id}-s`} aria-describedby={`${id}-sh`} rows={5} value={self} onChange={(e) => setSelf(e.target.value)} className={`${input} py-2`} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={primary} onClick={() => act(repo.reviews.submitSelf(r.id, self), R.toasts.sent(r.supervisor))}>{R.self.send(r.supervisor)}</button>
              <button type="button" className={btn} onClick={() => act(repo.reviews.saveSelf(r.id, self), R.toasts.draft)}>{R.self.saveDraft}</button>
            </div>
          </>
        ) : r.step === 'waiting_to_send' ? <p className="mt-1 text-14">{R.self.waiting}</p>
          : r.self.text ? <p className="mt-1 whitespace-pre-line border-l-4 border-border pl-3 text-14">{r.self.text}</p>
          : <p className="mt-1 text-14 text-muted">{as === 'supervisor' ? R.sup.notYet : R.self.none}</p>}
      </div>

      {(r.assessment || r.can.supervise) && (
        <div className={`${card} mt-3`}>
          <h3 className="text-16 font-bold text-navy">{as === 'employee' ? R.sup.theirs : R.sup.title}</h3>
          {r.returned && <p className="mt-1 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text"><b>{R.sup.returned(r.returned.by)}</b> {r.returned.reason}</p>}
          {r.can.supervise ? (
            <>
              <label htmlFor={`${id}-a`} className={`${label} mt-2 block`}>{R.sup.label}</label>
              <textarea id={`${id}-a`} rows={5} value={assessment} onChange={(e) => setAssessment(e.target.value)} className={`${input} py-2`} />
              <Notes r={r} />
              {r.finalPending > 0 && <p className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text">{R.finalPending(r.finalPending)}</p>}
              {r.blocks.length > 0 && <div className="mt-2 rounded-lg border border-block-border bg-block-bg p-3 text-14 text-block-text"><p className="font-semibold">{R.blocks.title}</p><ul className="list-disc pl-5">{r.blocks.map((b) => <li key={b}>{b}</li>)}</ul></div>}
              <div className="mt-2"><button type="button" className={primary} onClick={() => { const x = repo.reviews.complete(r.id, assessment); say(x.ok ? (x.note ? R.toasts.completedCheck(x.note) : R.toasts.completed) : x.error === 'blocked' ? (assessment.trim() ? R.errors.blocked! : R.blocks.no_assessment) : R.errors[x.error] ?? null); }}>{R.sup.complete}</button></div>
              <details className="mt-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{R.sup.sendBack}</summary>
                <label htmlFor={`${id}-b`} className={label}>{R.sup.reason}</label>
                <textarea id={`${id}-b`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
                <div className="mt-2"><button type="button" className={btn} onClick={() => act(repo.reviews.sendBack(r.id, reason), R.toasts.sentBack)}>{R.sup.sendBackDo}</button></div>
              </details>
            </>
          ) : <>
            <p className="mt-1 whitespace-pre-line border-l-4 border-border pl-3 text-14">{r.assessment}</p>
            {r.contributions && <><h4 className="mt-3 text-14 font-semibold text-navy">{R.notes.contributionsShown}</h4><p className="whitespace-pre-line text-14">{r.contributions}</p></>}
            {r.followUp && <><h4 className="mt-3 text-14 font-semibold text-navy">{R.notes.followUpShown}</h4><p className="whitespace-pre-line text-14">{r.followUp}</p></>}
          </>}
        </div>
      )}

      {r.can.check && r.countersign.required && <Countersign r={r} />}
      {r.countersign.done && r.countersign.required && <p className="mt-3 text-14">{R.countersign.done(r.countersign.done.by, r.countersign.done.agrees, r.countersign.done.reason)}</p>}
      {r.can.check && !r.countersign.required && (
        <div className={`${card} mt-3`}>
          <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => act(repo.reviews.accept(r.id), R.toasts.accepted)}>{R.check.accept}</button></div>
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{R.check.returnTo(r.supervisor)}</summary>
            <label htmlFor={`${id}-rr`} className={label}>{R.sup.reason}</label>
            <textarea id={`${id}-rr`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
            <div className="mt-2"><button type="button" className={btn} onClick={() => act(repo.reviews.returnToSupervisor(r.id, reason), R.toasts.returned)}>{R.check.returnDo}</button></div>
          </details>
        </div>
      )}

      {as === 'employee' && r.can.acknowledge && (
        <div className={`${card} mt-3`}>
          <h3 className="text-16 font-bold text-navy">{R.ack.title}</h3>
          <p className="text-14">{R.ack.note}</p>
          <label htmlFor={`${id}-x`} className={`${label} mt-2 block`}>{R.ack.disagree}</label>
          <p id={`${id}-xh`} className="text-13 text-muted">{R.ack.disagreeHint}</p>
          <textarea id={`${id}-x`} aria-describedby={`${id}-xh`} rows={3} value={dis} onChange={(e) => setDis(e.target.value)} className={`${input} py-2`} />
          <div className="mt-2"><button type="button" className={primary} onClick={() => act(repo.reviews.acknowledge(r.id, dis), R.toasts.acknowledged)}>{R.ack.do}</button></div>
        </div>
      )}
      {as === 'employee' && r.step === 'being_checked' && <p className="mt-3 text-14 text-muted">{R.ack.wait}</p>}
      {r.acknowledgement && <p className="mt-3 text-14"><Chip tone="complete">{R.ack.done}</Chip> {r.acknowledgement.disagreement ? (as === 'employee' ? R.ack.withNote(r.acknowledgement.disagreement) : R.ack.withNoteOther(r.acknowledgement.disagreement)) : ''}</p>}
    </section>
  );
}

/** v0.23.0: personal attributes. The employee may add their own score while writing the self-assessment; the supervisor scores each with a comment. */
function Attributes({ r, as }: { r: ReviewView; as: 'employee' | 'supervisor' | 'reviewer' }) {
  const { repo, say } = useApp();
  const id = useId();
  const A = R.attrs;
  const a = r.attributes;
  const [draft, setDraft] = useState<Record<string, { score: string; why: string }>>(() => Object.fromEntries(a.lines.map((l) => [l.id, { score: l.score ? String(l.score) : '', why: l.justification }])));
  const act = (res: { ok: boolean; error?: string }, ok: string) => say(res.ok ? ok : R.errors[res.error ?? 'not_allowed'] ?? null);
  const supervise = r.can.supervise;
  const selfEdit = as === 'employee' && r.can.writeSelf;
  return (
    <section className={`${card} mt-3`} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="text-16 font-bold text-navy">{A.title}</h3>
      <p className="text-13 text-muted">{supervise ? A.shareSup(a.weightPct) : A.share(a.weightPct)}</p>
      <ul className="mt-2">
        {a.lines.map((l) => (
          <li key={l.id} className="border-t border-border py-3">
            <p className="font-bold text-navy">{l.name}</p>
            <p className="text-13 text-muted">{l.measures}</p>
            <details className="mt-1"><summary className="inline-flex min-h-11 cursor-pointer items-center text-14 font-semibold text-navy">{A.levels}</summary>
              <dl className="text-13">{l.levels.map((d, j) => <div key={j} className="mt-1"><dt className="font-semibold">{5 - j} {a.levelLabels[j]}</dt><dd>{d}</dd></div>)}</dl></details>
            {selfEdit ? (
              <div className="mt-1 max-w-60"><label htmlFor={`${id}-s-${l.id}`} className={label}>{A.self}</label>
                <select id={`${id}-s-${l.id}`} className={input} value={l.selfScore ?? ''} onChange={(e) => act(repo.reviews.selfRateAttribute(r.id, l.id, e.target.value ? Number(e.target.value) : null), R.toasts.saved)}>
                  <option value="">{A.noSelf}</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {a.levelLabels[5 - n]}</option>)}
                </select></div>
            ) : l.selfScore !== null && <p className="text-13">{as === 'employee' ? A.yourScore(`${l.selfScore} ${a.levelLabels[5 - l.selfScore] ?? ''}`) : A.theirSelf(`${l.selfScore} ${a.levelLabels[5 - l.selfScore] ?? ''}`)}</p>}
            {supervise ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
                <div><label htmlFor={`${id}-v-${l.id}`} className={label}>{A.sup}</label>
                  <select id={`${id}-v-${l.id}`} className={input} value={draft[l.id]?.score ?? ''} onChange={(e) => setDraft({ ...draft, [l.id]: { score: e.target.value, why: draft[l.id]?.why ?? '' } })}>
                    <option value="" />{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {a.levelLabels[5 - n]}</option>)}
                  </select></div>
                <div><label htmlFor={`${id}-w-${l.id}`} className={label}>{A.comment}</label><input id={`${id}-w-${l.id}`} className={input} value={draft[l.id]?.why ?? ''} onChange={(e) => setDraft({ ...draft, [l.id]: { score: draft[l.id]?.score ?? '', why: e.target.value } })} /></div>
                <div className="sm:col-span-2"><button type="button" className={btn} onClick={() => act(repo.reviews.rateAttribute(r.id, l.id, Number(draft[l.id]?.score), draft[l.id]?.why ?? ''), R.toasts.saved)}>{A.save}<span className="sr-only">: {l.name}</span></button></div>
              </div>
            ) : <p className="tabular mt-1 text-14">{l.score !== null ? <><b>{A.scored(l.score, l.scoreLabel ?? '')}</b>{l.justification ? ` · ${l.justification}` : ''}</> : <span className="text-muted">{as === 'employee' && r.step !== 'acknowledged' && r.step !== 'awaiting_acknowledgement' ? A.hidden : A.notYet}</span>}</p>}
          </li>
        ))}
      </ul>
      {a.percent !== null && <p className="tabular mt-2 text-14 font-semibold text-navy">{A.total(a.sum, a.max, `${a.percent.toFixed(1)}%`)}</p>}
    </section>
  );
}

/** v0.23.0 (C4, C5): the supervisor's notes beside the assessment; never scored. */
function Notes({ r }: { r: ReviewView }) {
  const { repo, say } = useApp();
  const id = useId();
  const [c, setC] = useState(r.contributions ?? '');
  const [f, setF] = useState(r.followUp ?? '');
  return (
    <div className="mt-3 space-y-2">
      <div><label htmlFor={`${id}-c`} className={label}>{R.notes.contributions}</label><textarea id={`${id}-c`} rows={2} value={c} onChange={(e) => setC(e.target.value)} className={`${input} py-2`} /></div>
      <div><label htmlFor={`${id}-f`} className={label}>{R.notes.followUp}</label><textarea id={`${id}-f`} rows={2} value={f} onChange={(e) => setF(e.target.value)} className={`${input} py-2`} /></div>
      <button type="button" className={btn} onClick={() => { const x = repo.reviews.saveNotes(r.id, { contributions: c, followUp: f }); say(x.ok ? R.toasts.saved : R.errors[x.error] ?? null); }}>{R.notes.save}</button>
    </div>
  );
}

/** v0.23.0 (C3): countersigning every review, where the policy says so: agree, or disagree with reasons. */
function Countersign({ r }: { r: ReviewView }) {
  const { repo, say } = useApp();
  const id = useId();
  const [agrees, setAgrees] = useState(true);
  const [reason, setReason] = useState('');
  const C = R.countersign;
  return (
    <section className={`${card} mt-3`} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="text-16 font-bold text-navy">{C.title}</h3>
      <p className="text-13 text-muted">{C.note}</p>
      <fieldset className="mt-2"><legend className="sr-only">{C.title}</legend>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" className="h-5 w-5" name={`${id}-a`} checked={agrees} onChange={() => setAgrees(true)} />{C.agree}</label>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" className="h-5 w-5" name={`${id}-a`} checked={!agrees} onChange={() => setAgrees(false)} />{C.disagree}</label>
      </fieldset>
      <label htmlFor={`${id}-r`} className={label}>{C.reason}</label>
      <textarea id={`${id}-r`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => { const x = repo.reviews.countersign(r.id, agrees, reason); say(x.ok ? R.toasts.countersigned : R.errors[x.error] ?? null); }}>{C.do}</button>
        <button type="button" className={btn} onClick={() => { const x = repo.reviews.returnToSupervisor(r.id, reason); say(x.ok ? R.toasts.returned : R.errors[x.error] ?? null); }}>{R.check.returnTo(r.supervisor)}</button>
      </div>
    </section>
  );
}

function Team({ rows, open, share }: { rows: ReviewView[]; open: string | null; share: number }) {
  const r = rows.find((x) => x.id === open);
  if (r) return (<><p><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'reviews', tab: 'team' })}>{R.team.back}</a></p><Review r={r} share={share} as="supervisor" /></>);
  return (
    <section className={card} aria-labelledby="team-reviews">
      <h2 id="team-reviews" className="text-18 font-bold text-navy">{R.team.title}</h2>
      {rows.length === 0 ? <p className="text-14 text-muted">{R.team.none}</p> : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b className="text-navy">{x.person}</b><br /><span className="text-13 text-muted">{x.position}</span></span>
              <span className="flex flex-wrap items-center gap-2"><Chip tone={x.step === 'acknowledged' ? 'complete' : 'info'}>{R.step[x.step]}</Chip><a className={btn} href={hrefFor({ kind: 'reviews', reviewId: x.id })}>{R.team.open}<span className="sr-only">: {x.person}</span></a></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Round({ rv, fy }: { rv: RoundView; fy: string }) {
  const { repo, say } = useApp();
  const kindLabel = useKindLabel();
  const act = (res: { ok: boolean; error?: string }, ok: string) => say(res.ok ? ok : R.errors[res.error ?? 'not_allowed'] ?? null);
  return (
    <>
      <section className={`${card} border-t-4 border-t-performance-mark`}>
        {rv.open ? (
          <>
            <h2 className="text-18 font-bold text-navy">{R.round.title(kindLabel(rv.open.kind, rv.open.periodEnd), fy)}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="tabular w-full border-collapse text-14">
                <thead><tr className="border-b border-border"><th scope="col" className="py-2 text-left font-semibold text-muted">{R.round.steps}</th><th scope="col" className="py-2 text-right font-semibold text-muted">{R.round.count}</th></tr></thead>
                <tbody>{rv.open.byStep.map((x) => <tr key={x.step} className="border-b border-border"><td className="py-2">{R.step[x.step]}</td><td className="py-2 text-right">{x.n}</td></tr>)}</tbody>
              </table>
            </div>
            {rv.open.kind !== 'annual' && <p className="mt-2 text-13 text-muted">{R.round.midYearNote}</p>}
          </>
        ) : <p className="text-14 text-muted">{rv.closed ? R.round.closed : R.round.none}</p>}
        {rv.canOpen.length > 0 && (
          <div className="mt-3">
            <p className="text-13 text-muted">{R.round.openHint}</p>
            <div className="mt-1 flex flex-wrap gap-2">{rv.canOpen.map((k) => <button key={`${k.kind}:${k.periodEnd ?? ''}`} type="button" className={btn} onClick={() => act(repo.reviews.openRound(k.kind, k.periodEnd), R.toasts.opened)}>{R.round.open(kindLabel(k.kind, k.periodEnd))}</button>)}</div>
          </div>
        )}
      </section>
      {rv.waiting.length > 0 && (
        <section className={`${card} mt-3`} aria-labelledby="hr-waiting">
          <h3 id="hr-waiting" className="text-16 font-bold text-navy">{R.round.waiting}</h3>
          <ul className="divide-y divide-border">
            {rv.waiting.map((w) => (
              <li key={`${w.reviewId}:${w.contractObjectiveId}`} className="py-2">
                <p className="font-semibold text-navy">{R.round.cantAssess(w.title, w.person)}</p>
                <p className="border-l-4 border-border pl-3 text-14">{w.reason}</p>
                <p className="text-13 text-muted">{R.round.askedBy(w.askedBy)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className={primary} onClick={() => act(repo.reviews.decideCantAssess(w.reviewId, w.contractObjectiveId, true), R.toasts.hrAccepted)}>{R.round.accept}</button>
                  <button type="button" className={btn} onClick={() => act(repo.reviews.decideCantAssess(w.reviewId, w.contractObjectiveId, false), R.toasts.hrRefused)}>{R.round.refuse}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rv.received.length > 0 && (
        <section className={`${card} mt-3`} aria-labelledby="hr-received">
          <h3 id="hr-received" className="text-16 font-bold text-navy">{R.round.received(rv.received.length)}</h3>
          <p className="text-13 text-muted">{R.round.receivedNote}</p>
          <ul className="divide-y divide-border">{rv.received.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b className="text-navy">{x.person}</b> <span className="text-13 text-muted">{R.kind[x.kind]}</span></span><a className={btn} href={hrefFor({ kind: 'print', doc: 'review', id: x.id })}>{R.print}<span className="sr-only">: {x.person}</span></a></li>)}</ul>
        </section>
      )}
      {rv.open?.kind === 'annual' && (
        <section className={`${card} mt-3`}>
          <h3 className="text-16 font-bold text-navy">{R.round.close}</h3>
          <p className="text-14">{R.round.closeNote}</p>
          {rv.finalPending > 0 && <p className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text">{R.finalPending(rv.finalPending)}</p>}
          {rv.closeBlocks.length > 0 && <div className="mt-2 rounded-lg border border-block-border bg-block-bg p-3 text-14 text-block-text"><p className="font-semibold">{R.round.closeBlocks}</p><ul className="list-disc pl-5">{rv.closeBlocks.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          <div className="mt-2"><button type="button" className={primary} onClick={() => act(repo.reviews.closeRound(), R.toasts.closed)}>{R.round.close}</button></div>
        </section>
      )}
    </>
  );
}
