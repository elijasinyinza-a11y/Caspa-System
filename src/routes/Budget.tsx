/**
 * Budget gate (Build Brief, screen 5; BUILD-BRIEF section 19). The consolidated budget by goal, the gate it faces
 * next, and its record. Every figure comes from the data-access layer; the screen only lays it out.
 */
import { useId, useRef, useState } from 'react';
import { useApp } from '../components/AppContext';
import { FindingCard } from '../components/FindingCard';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { identity } from '../components/identity';
import type { BudgetActionError, BudgetHistoryItem, BudgetPage, FindingView, LinkError } from '../data/access/repository';
import type { ISODate } from '../contract/caspa-data-contract';
import type { BudgetGoalGroup, BudgetLineRow } from '../selectors/budget';
import { formatDate, formatFinancialYear, formatMoney, formatPercent } from '../selectors/format';
import type { NodeRef } from '../selectors/node';
import { en } from '../strings/en';
import { nodeHref } from './router';

type Terms = ReturnType<ReturnType<typeof useApp>['repo']['settings']>['termLabels'];

const card = 'rounded-xl border border-border bg-white p-5';
const button = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text';
const field = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-2 text-14 text-text';
const lineAnchor = (id: string) => `budget-line-${id}`;

function CodeLink({ r }: { r: NodeRef }) {
  return (
    <a href={nodeHref(r.kind, r.id, 'plan')} title={r.title} className="group inline-flex min-h-11 min-w-0 max-w-full items-baseline gap-2 py-2 text-14 text-navy">
      <span className="tabular shrink-0 font-semibold">{r.code}</span>
      <span className="min-w-0 truncate underline decoration-border underline-offset-4 group-hover:decoration-navy">{r.title}</span>
    </a>
  );
}

export function Budget() {
  const { repo } = useApp();
  const settings = repo.settings();
  const terms = settings.termLabels;
  const page = repo.budget();
  const fy = formatFinancialYear(page.financialYear, settings.financialYearStartMonth);
  const [linking, setLinking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const goToLine = (lineId: string) => {
    const el = document.getElementById(lineAnchor(lineId));
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };

  const b = page.budget;
  return (
    <>
      <WorkspaceHeader w="plan" title={en.budget.title(fy)} intro={en.budget.intro(terms.goal.singular, terms.activity.plural)} />
      {!b.version ? (
        <p className={`${card} text-14 text-text`}>{en.budget.noVersion}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Reading order on a phone: the gate, then the lines, then the gate record. On a wide screen the gate and its record sit beside the lines. */}
          <aside className="lg:col-start-2 lg:row-start-1" aria-label={en.budget.gate.submitTitle}>
            <GateCard page={page} onGoToLine={goToLine} message={message} setMessage={setMessage} />
          </aside>
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Summary page={page} terms={terms} />
            <section className={card} aria-labelledby="by-goal">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="by-goal" className="text-18 font-bold text-navy">{en.budget.byGoal(terms.goal.singular)}</h2>
              </div>
              <p className="mt-1 max-w-[70ch] text-13 text-muted">{en.budget.byGoalNote(terms.goal.singular)}</p>
              <ul className="mt-3 divide-y divide-border">
                {b.goals.map((g) => <GoalRow key={g.ref.id} g={g} terms={terms} />)}
              </ul>
            </section>
            {b.unlinked.lineCount > 0 && (
              <Unlinked page={page} terms={terms} linking={linking} setLinking={setLinking} onLinked={setMessage} />
            )}
          </div>
          <div className="lg:col-start-2 lg:row-start-2">
            <History items={page.history} />
          </div>
        </div>
      )}
    </>
  );
}

function Summary({ page, terms }: { page: BudgetPage; terms: Terms }) {
  const b = page.budget;
  const status = en.financeHome.versionStatus[b.version!.status];
  return (
    <div className={`${card} border-t-4 ${identity.plan.edge}`}>
      <p className="text-14 font-semibold text-navy">{en.budget.version(b.version!.version, status)}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-13 text-muted">{en.budget.total}</div>
          <div className="tabular text-34 font-bold text-navy">{b.total ? formatMoney(b.total) : '—'}</div>
        </div>
        <p className="text-13 text-muted">
          {en.budget.lines(b.lineCount, terms.budgetLine.singular, terms.budgetLine.plural)}
          {b.hiddenLines > 0 && <>. {en.budget.hiddenLines(b.hiddenLines)}</>}
        </p>
      </div>
      {!b.total && <p className="mt-2 text-13 text-muted">{en.budget.totalHidden}</p>}
    </div>
  );
}

function ShareBar({ share, label }: { share: number; label: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-info-bg" role="img" aria-label={label}>
      <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${Math.min(100, share * 100)}%` }} />
    </div>
  );
}

function GoalRow({ g, terms }: { g: BudgetGoalGroup; terms: Terms }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const visible = g.objectives.reduce((n, o) => n + o.lines.length, 0);
  return (
    <li className="py-2">
      <div className="flex items-center gap-x-3">
        <div className="min-w-0 flex-1"><CodeLink r={g.ref} /></div>
        <span className="tabular shrink-0 text-right text-16 font-bold text-navy">
          {g.subtotal ? formatMoney(g.subtotal) : <span className="text-13 font-normal text-muted">{en.budget.subtotalHidden}</span>}
        </span>
      </div>
      {g.share !== null && <ShareBar share={g.share} label={en.budget.share(formatPercent(g.share))} />}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
        <p className="text-13 text-muted">
          {g.share !== null && <span className="tabular">{en.budget.share(formatPercent(g.share))}. </span>}
          {g.activities > 0 ? en.budget.fundedActivities(g.funded, g.activities, terms.activity.plural) : en.budget.noLines}
          {g.hiddenLines > 0 && <>. {en.budget.hiddenLines(g.hiddenLines)}</>}
        </p>
        {visible > 0 && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="inline-flex min-h-11 items-center text-14 font-semibold text-navy underline decoration-border underline-offset-4 hover:decoration-navy">
            {open ? en.budget.hideLines(g.ref.code) : en.budget.showLines(visible, g.ref.code)}
          </button>
        )}
      </div>
      {open && (
        <div id={id} className="mt-2 space-y-3 rounded-lg bg-cream p-3">
          {g.objectives.map((o) => (
            <div key={o.ref.id}>
              <div className="flex items-center gap-x-3">
                <div className="min-w-0 flex-1"><CodeLink r={o.ref} /></div>
                {o.subtotal && <span className="tabular shrink-0 text-14 font-semibold text-navy">{formatMoney(o.subtotal)}</span>}
              </div>
              <Lines lines={o.lines} caption={`${o.ref.code} ${terms.budgetLine.plural}`} />
              {o.hiddenLines > 0 && <p className="text-13 text-muted">{en.budget.hiddenLines(o.hiddenLines)}</p>}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function lineMeta(l: BudgetLineRow): string {
  return `${en.budget.holder(l.holderUnit)}. ${en.node.lineFrom(en.costCategory[l.costCategory as keyof typeof en.costCategory], en.fundingSource[l.fundingSource as keyof typeof en.fundingSource])}`;
}

function Lines({ lines, caption }: { lines: BudgetLineRow[]; caption: string }) {
  if (lines.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-14">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-border align-top last:border-b-0">
              <td className="py-2 pr-3">
                <div className="text-text">{l.description}</div>
                {/* Every line says what it funds (Clarity Specification, section 10). */}
                {l.activity && (
                  <a href={nodeHref('activity', l.activity.id, 'plan')} className="inline-flex min-h-11 items-center text-13 text-navy underline decoration-border underline-offset-4 hover:decoration-navy">
                    {en.budget.funds(l.activity.code, l.activity.title)}
                  </a>
                )}
                <div className="text-12 text-muted">{lineMeta(l)}</div>
              </td>
              <td className="tabular whitespace-nowrap py-2 text-right text-text">{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── Lines with no activity: the hard block, fixed in place ───────── */

function Unlinked({ page, terms, linking, setLinking, onLinked }: {
  page: BudgetPage; terms: Terms; linking: string | null; setLinking: (id: string | null) => void; onLinked: (m: string) => void;
}) {
  const { repo } = useApp();
  const u = page.budget.unlinked;
  const draft = page.budget.version?.status === 'draft';
  // Reading link options is the permission check: the data-access layer returns none to those who may not link.
  const canLink = (lineId: string) => repo.budgetLinkOptions(lineId).length > 0;
  return (
    <section className="rounded-xl border-2 border-block-border bg-white p-5" aria-labelledby="not-linked">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="not-linked" className="flex flex-wrap items-baseline gap-x-3 text-18 font-bold text-navy">
          {en.budget.notLinked}
          <span className="text-12 font-bold text-block-text">{en.integrity.hardBlock}</span>
        </h2>
        {u.subtotal && <span className="tabular text-16 font-bold text-navy">{formatMoney(u.subtotal)}</span>}
      </div>
      <p className="mt-1 max-w-[70ch] text-13 text-muted">{en.budget.notLinkedNote(terms.activity.plural)}</p>
      <ul className="mt-3 divide-y divide-border">
        {u.lines.map((l) => (
          <li key={l.id} id={lineAnchor(l.id)} tabIndex={-1} className="py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
            <div className="flex items-start gap-x-3">
              <div className="min-w-0 flex-1">
                <div className="text-14 text-text">{l.description}</div>
                <div className="text-12 text-muted">{lineMeta(l)}</div>
              </div>
              <span className="tabular whitespace-nowrap text-14 text-text">{formatMoney(l.amount)}</span>
            </div>
            {draft && linking !== l.id && canLink(l.id) && (
              <button type="button" onClick={() => setLinking(l.id)} className={`${button} mt-2`}>{en.budget.link.open(terms.activity.singular)}</button>
            )}
            {linking === l.id && (
              <LinkForm line={l} terms={terms} onDone={(m) => { setLinking(null); if (m) onLinked(m); }} />
            )}
          </li>
        ))}
      </ul>
      {u.hiddenLines > 0 && <p className="mt-2 text-13 text-muted">{en.budget.hiddenLines(u.hiddenLines)}</p>}
    </section>
  );
}

function LinkForm({ line, terms, onDone }: { line: BudgetLineRow; terms: Terms; onDone: (message: string | null) => void }) {
  const { repo } = useApp();
  const options = repo.budgetLinkOptions(line.id);
  const suggested = options.filter((o) => o.suggested);
  const others = options.filter((o) => !o.suggested);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<LinkError | null>(null);
  const selectId = useId();
  const ref = useRef<HTMLSelectElement>(null);
  const save = () => {
    const r = repo.linkBudgetLine(line.id, choice);
    if (r.ok) onDone(en.budget.link.done(line.description, options.find((o) => o.ref.id === choice)?.ref.code ?? ''));
    else { setError(r.error); ref.current?.focus(); }
  };
  const label = (o: (typeof options)[number]) => `${o.ref.code} ${o.ref.title} (${o.path})`;
  return (
    <div className="mt-3 rounded-lg border border-control bg-white p-3">
      <label htmlFor={selectId} className="block text-14 font-semibold text-navy">{en.budget.link.label(terms.activity.singular, line.description)}</label>
      <p id={`${selectId}-hint`} className="mt-1 text-12 text-muted">{en.budget.link.note}</p>
      <select
        id={selectId} ref={ref} autoFocus value={choice}
        onChange={(e) => { setChoice(e.target.value); setError(null); }}
        aria-describedby={`${selectId}-hint${error ? ` ${selectId}-error` : ''}`} aria-invalid={!!error}
        className={field}
      >
        <option value="">{en.budget.link.choose}</option>
        {suggested.length > 0 && (
          <optgroup label={en.budget.link.suggested(line.holderUnit)}>
            {suggested.map((o) => <option key={o.ref.id} value={o.ref.id}>{label(o)}</option>)}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={en.budget.link.others}>
            {others.map((o) => <option key={o.ref.id} value={o.ref.id}>{label(o)}</option>)}
          </optgroup>
        )}
      </select>
      {error && <p id={`${selectId}-error`} role="alert" className="mt-1 text-13 font-semibold text-block-text">{en.budget.link.error[error]}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={primary}>{en.budget.link.save}</button>
        <button type="button" onClick={() => onDone(null)} className={button}>{en.budget.link.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── The gate ───────── */

function GateCard({ page, onGoToLine, message, setMessage }: { page: BudgetPage; onGoToLine: (id: string) => void; message: string | null; setMessage: (m: string | null) => void }) {
  const { repo } = useApp();
  const v = page.budget.version!;
  const next = page.next;
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<BudgetActionError | null>(null);
  const openAdvisory = next ? next.advisory.filter((f) => f.ack.state !== 'acknowledged').length : 0;

  const submit = (confirmed: boolean) => {
    if (!next) return;
    if (!confirmed && next.blocking.length + next.hiddenBlocking === 0 && openAdvisory > 0) return setConfirm(true);
    setConfirm(false);
    const r = repo.submitBudget();
    if (!r.ok) return setError(r.error);
    setError(null);
    setMessage(r.outcome === 'passed' ? en.budget.gate.submittedResult : en.budget.gate.blockedResult(r.blocking));
  };

  const title = v.status === 'draft' ? en.budget.gate.submitTitle : v.status === 'submitted' ? en.budget.gate.approveTitle : en.financeHome.versionStatus[v.status];
  return (
    <section className={card} aria-labelledby="gate-title">
      <h2 id="gate-title" className="text-18 font-bold text-navy">{title}</h2>
      {next?.due && <p className="mt-1 text-13 text-muted">{en.budget.gate.due(formatDate(next.due))}</p>}
      <div role="status" aria-live="polite">
        {message && <p className="mt-3 rounded-lg border border-info-border bg-info-bg p-3 text-14 text-info-text">{message}</p>}
      </div>
      {page.returned && (
        <p className="mt-3 rounded-lg border border-advisory-border bg-advisory-bg p-3 text-14 text-advisory-text">
          {en.budget.gate.returnedBy(page.returned.by, formatDate(page.returned.on), page.returned.reason)}
        </p>
      )}
      {page.submitted && !page.approved && <p className="mt-3 text-14 text-text">{en.budget.gate.submittedBy(page.submitted.by, formatDate(page.submitted.on))}</p>}
      {page.approved && (
        <div className="mt-3 rounded-lg border border-complete-border bg-complete-bg p-3 text-14 text-complete-text">
          <p className="font-semibold">{en.budget.gate.approvedBy(page.approved.by, formatDate(page.approved.on))}</p>
          {page.approved.board && <p className="mt-1">{en.budget.gate.boardRecorded(page.approved.board.resolutionRef, formatDate(page.approved.board.date))}</p>}
          {page.approved.note && <p className="mt-1">“{page.approved.note}”</p>}
          <p className="mt-1">{en.budget.gate.frozen}</p>
        </div>
      )}

      {next && (
        <>
          <p className={`mt-4 text-14 font-semibold ${next.blocking.length + next.hiddenBlocking > 0 ? 'text-block-text' : 'text-text'}`}>
            {en.budget.gate.blocks(next.blocking.length + next.hiddenBlocking)}
          </p>
          {next.blocking.length > 0 && (
            <ul className="mt-2 space-y-3">
              {next.blocking.map((f) => (
                <FindingCard
                  key={f.finding.key} view={f}
                  fixAction={f.finding.subject.type === 'BudgetLine' && page.budget.unlinked.lines.some((l) => l.id === f.finding.subject.id)
                    ? { label: en.budget.link.goToLine, onClick: () => onGoToLine(f.finding.subject.id) } : undefined}
                />
              ))}
            </ul>
          )}
          {next.hiddenBlocking > 0 && <p className="mt-2 text-13 text-muted">{en.budget.gate.hiddenBlocks(next.hiddenBlocking)}</p>}
          <Advisories items={next.advisory} />
        </>
      )}

      {v.status === 'draft' && (
        page.can.submit ? (
          <div className="mt-4">
            {!confirm ? (
              <button type="button" onClick={() => submit(false)} className={primary}>{en.budget.gate.submit}</button>
            ) : (
              <div className="rounded-lg border border-advisory-border bg-advisory-bg p-3">
                <p className="text-14 font-semibold text-advisory-text">{en.budget.gate.confirmUnacknowledged(openAdvisory)}</p>
                <p className="mt-1 text-13 text-text">{en.budget.gate.confirmNote}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" autoFocus onClick={() => submit(true)} className={primary}>{en.budget.gate.confirmSubmit}</button>
                  <button type="button" onClick={() => setConfirm(false)} className={button}>{en.budget.gate.cancel}</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-13 text-muted">{en.budget.gate.financeSubmits}</p>
        )
      )}
      {v.status === 'submitted' && <ApproveOrReturn page={page} onResult={setMessage} />}
      {error && <p role="alert" className="mt-2 text-13 font-semibold text-block-text">{en.budget.gate.error[error]}</p>}
    </section>
  );
}

function Advisories({ items }: { items: FindingView[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-14 font-semibold text-navy">{en.budget.gate.advisoryTitle}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-13 text-muted">{en.budget.gate.noAdvisory}</p>
      ) : (
        <>
          <p className="mt-1 text-13 text-muted">{en.budget.gate.advisoryNote}</p>
          <ul className="mt-2 space-y-3">{items.map((f) => <FindingCard key={f.finding.key} view={f} />)}</ul>
        </>
      )}
    </div>
  );
}

function ApproveOrReturn({ page, onResult }: { page: BudgetPage; onResult: (m: string) => void }) {
  const { repo } = useApp();
  const [mode, setMode] = useState<'idle' | 'approve' | 'return'>('idle');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<BudgetActionError | null>(null);
  const ids = useId();

  if (page.ownSubmission) return <p className="mt-4 text-13 text-muted">{en.budget.gate.ownSubmission}</p>;
  if (!page.can.approve && !page.can.return) return <p className="mt-4 text-13 text-muted">{en.budget.gate.approversOnly}</p>;

  const approve = () => {
    const r = repo.approveBudget(page.boardRequired ? { resolutionRef: ref, date: date as ISODate } : null, note);
    if (!r.ok) return setError(r.error);
    onResult(r.outcome === 'passed' ? en.budget.gate.approvedResult : en.budget.gate.blockedResult(r.blocking));
  };
  const sendBack = () => {
    const r = repo.returnBudget(reason);
    if (!r.ok) return setError(r.error);
    onResult(en.budget.gate.returnedResult);
  };
  const errorEl = error && <p id={`${ids}-error`} role="alert" className="mt-2 text-13 font-semibold text-block-text">{en.budget.gate.error[error]}</p>;

  return (
    <div className="mt-4">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {page.can.approve && <button type="button" onClick={() => setMode('approve')} className={primary}>{en.budget.gate.approve}</button>}
          {page.can.return && <button type="button" onClick={() => setMode('return')} className={button}>{en.budget.gate.returnOpen}</button>}
        </div>
      )}
      {mode === 'approve' && (
        <div className="rounded-lg border border-control p-3">
          {page.boardRequired && (
            <>
              <p className="text-13 text-muted">{en.budget.gate.boardHint}</p>
              <label htmlFor={`${ids}-ref`} className="mt-2 block text-14 font-semibold text-navy">{en.budget.gate.boardRef}</label>
              <input id={`${ids}-ref`} autoFocus value={ref} onChange={(e) => { setRef(e.target.value); setError(null); }} className={field} required aria-invalid={error === 'board_reference_required'} />
              <label htmlFor={`${ids}-date`} className="mt-2 block text-14 font-semibold text-navy">{en.budget.gate.boardDate}</label>
              <input id={`${ids}-date`} type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} className={field} required aria-invalid={error === 'board_reference_required'} />
            </>
          )}
          <label htmlFor={`${ids}-note`} className="mt-2 block text-14 font-semibold text-navy">{en.budget.gate.approvalNote}</label>
          <textarea id={`${ids}-note`} autoFocus={!page.boardRequired} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-control p-2 text-14 text-text" />
          {errorEl}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={approve} className={primary}>{en.budget.gate.approveSave}</button>
            <button type="button" onClick={() => { setMode('idle'); setError(null); }} className={button}>{en.budget.gate.cancel}</button>
          </div>
        </div>
      )}
      {mode === 'return' && (
        <div className="rounded-lg border border-control p-3">
          <label htmlFor={`${ids}-reason`} className="block text-14 font-semibold text-navy">{en.budget.gate.returnReason}</label>
          <p id={`${ids}-hint`} className="mt-1 text-12 text-muted">{en.budget.gate.returnHint}</p>
          <textarea id={`${ids}-reason`} autoFocus rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} aria-describedby={`${ids}-hint`} aria-invalid={error === 'reason_required'} className="mt-2 w-full rounded-lg border border-control p-2 text-14 text-text" />
          {errorEl}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={sendBack} className={primary}>{en.budget.gate.returnSave}</button>
            <button type="button" onClick={() => { setMode('idle'); setError(null); }} className={button}>{en.budget.gate.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function History({ items }: { items: BudgetHistoryItem[] }) {
  return (
    <section className={card} aria-labelledby="gate-record">
      <h2 id="gate-record" className="text-16 font-bold text-navy">{en.budget.history.title}</h2>
      <p className="mt-1 text-12 text-muted">{en.budget.history.note}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-13 text-muted">{en.budget.history.empty}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {[...items].reverse().map((h) => (
            <li key={h.key} className="border-l-2 border-control pl-3">
              <p className="text-14 font-semibold text-navy">{en.budget.history.kind[h.kind]}</p>
              <p className="text-13 text-muted">{en.budget.history.by(h.by, formatDate(h.on))}</p>
              {h.blocking > 0 && <p className="text-13 text-block-text">{en.budget.history.blocking(h.blocking)}</p>}
              {h.advisory.acknowledged + h.advisory.open > 0 && <p className="text-13 text-text">{en.budget.history.advisory(h.advisory.acknowledged, h.advisory.open)}</p>}
              {h.reason && <p className="text-13 text-text">{en.budget.history.reason(h.reason)}</p>}
              {h.board && <p className="text-13 text-text">{en.budget.gate.boardRecorded(h.board.resolutionRef, formatDate(h.board.date))}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

