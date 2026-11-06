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
      {on === 'round' && p.round && <Round rv={p.round} fy={formatFinancialYear(p.financialYear, repo.settings().financialYearStartMonth)} />}
    </>
  );
}

function Lines({ r, share, supervise }: { r: ReviewView; share: number; supervise: boolean }) {
  return (
    <>
      <ul className="mt-2">
        {r.objectives.map((o) => <Line key={o.id} o={o} reviewId={r.id} supervise={supervise} />)}
      </ul>
      {r.overall ? (
        <>
          <p className="mt-3 text-16 text-text">{R.overall(r.overall.score.toFixed(2), r.overall.label)} <span className="font-semibold">{r.overall.provisional ? R.provisional : R.final}</span></p>
          {r.scoredWeightPct < r.totalWeightPct && <p className="text-13 text-muted">{R.partial(r.scoredWeightPct)}</p>}
          {(r.kind === 'mid_year' || r.kind === 'quarterly') && <p className="text-13 text-muted">{R.midYear(formatPercent(share))}</p>}
        </>
      ) : <p className="mt-3 text-14 text-muted">{R.nothingScored}</p>}
    </>
  );
}

function Line({ o, reviewId, supervise }: { o: ObjectiveLine; reviewId: string; supervise: boolean }) {
  const { repo, say } = useApp();
  const id = useId();
  const [delta, setDelta] = useState<-1 | 0 | 1>(o.adjustment?.delta ?? 0);
  const [reason, setReason] = useState('');
  const O = R.objective;
  const fig = (n: number | null) => (n === null ? '—' : formatNumber(n));
  const pct = o.achievement === null ? (o.done === 0 && o.lower ? '∞' : '—') : formatPercent(o.achievement);
  const main = o.cantAssess?.accepted ? O.cantAssess(o.cantAssess.reason)
    : o.score === null ? (o.basis === 'no_quantity' ? O.noQuantity : O.notScored)
    : `${o.lower ? O.lower(fig(o.done), fig(o.target), pct) : O.verified(fig(o.done), fig(o.target), pct)} ${O.score(o.score, o.label ?? '')}`;
  const act = (res: { ok: boolean; error?: string }, ok: string) => say(res.ok ? ok : R.errors[res.error ?? 'not_allowed'] ?? null);
  return (
    <li className="border-t border-border py-3">
      <p className="font-bold text-navy">{o.title}</p>
      <p className="tabular text-14 text-text">{main}</p>
      {o.adjustment && <p className="text-13 text-muted">{O.moved(o.adjustment.delta > 0 ? 'up' : 'down', o.adjustment.by, o.adjustment.reason)}</p>}
      {o.cantAssess && !o.cantAssess.accepted && <p className="text-13 text-muted">{O.cantAssessAsked(o.cantAssess.reason)}</p>}
      {o.lower && <p className="text-13 text-muted">{O.lowerNote}</p>}
      <p className="text-13 text-muted">{O.verifiedAt(o.verifiedOn ? formatDate(o.verifiedOn) : '', o.weightPct)}</p>
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
        <Lines r={r} share={share} supervise={r.can.supervise} />
        {r.history.length > 0 && <p className="tabular mt-2 text-13 text-muted">{R.history} {r.history.map((h) => R.historyItem(kindLabel(h.kind, h.periodEnd), h.score === null ? '—' : h.score.toFixed(2))).join(' · ')}</p>}
      </div>

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
          ) : <p className="mt-1 whitespace-pre-line border-l-4 border-border pl-3 text-14">{r.assessment}</p>}
        </div>
      )}

      {r.can.check && (
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
