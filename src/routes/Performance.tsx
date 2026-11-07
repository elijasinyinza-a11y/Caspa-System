/**
 * Performance (slice 13; Offline Progress Capture Specification v1.0, BUILD-BRIEF section 39). The landing shows the
 * person's own contract objectives and a supervisor's team; Progress updates (#/performance/progress) has the tabs
 * Mine and To verify. Every figure comes from repo.progress; nothing is computed here beyond formatting.
 * Matches reference/caspa-progress-prototype.html.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { ISODate } from '../contract/caspa-data-contract';
import { useApp } from '../components/AppContext';
import { identity } from '../components/identity';
import { ProgressBar } from '../components/Status';
import { EntryRow } from '../components/SubMenu';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import type { ObjectiveCard, ProgressPage, RowState, UpdateRow, VerifyCard } from '../data/access/progress';
import type { NodeRef } from '../selectors/node';
import { formatDate, formatDateTime, formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { hrefFor, nodeHref } from './router';

const C = en.capture;
const button = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-3 text-14 text-text';
const card = `rounded-xl border border-border border-t-4 bg-white p-4 md:p-5 ${identity.performance.edge}`;
const plainCard = 'rounded-xl border border-border bg-white p-4 md:p-5';

const STATE_TONE: Record<RowState, string> = {
  waiting: 'border-info-border bg-info-bg text-info-text',
  sent: 'border-info-border bg-info-bg text-info-text',
  verified: 'border-complete-border bg-complete-bg text-complete-text',
  returned: 'border-advisory-border bg-advisory-bg text-advisory-text',
  failed: 'border-advisory-border bg-advisory-bg text-advisory-text',
};
function StateChip({ state }: { state: RowState }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-12 font-semibold ${STATE_TONE[state]}`}>{C.state[state]}</span>;
}

const fig = (n: number | null) => (n === null ? '—' : formatNumber(n));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useOrg() {
  const { repo } = useApp();
  const o = repo.settings();
  return { tz: o.timeZone, startMonth: o.financialYearStartMonth };
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="tabular mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-14">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Flag({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-advisory-border bg-advisory-bg p-3 text-13 text-advisory-text">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function PartOf({ o }: { o: { activity: NodeRef | null } }) {
  if (!o.activity) return null;
  return (
    <p className="text-13 text-muted">
      {C.partOf}:{' '}
      <a href={nodeHref(o.activity.kind, o.activity.id, 'performance')} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-navy">{o.activity.title}</a>
    </p>
  );
}

/* ───────── The landing, #/performance ───────── */

export function PerformanceLanding() {
  const { repo } = useApp();
  const { startMonth } = useOrg();
  const l = repo.progress.landing();
  const fy = formatFinancialYear(l.financialYear, startMonth);
  const hasProgress = repo.menu().performance.some((e) => e.entry === 'progress');
  return (
    <>
      <WorkspaceHeader w="performance" title={C.landingTitle} intro={en.workspaceIntro.performance} />
      <EntryRow w="performance" />
      {l.mine && (
        <section aria-labelledby="your-contract">
          <h2 id="your-contract" className="text-18 font-bold text-navy">{C.yourContract(fy)}</h2>
          <p className="mb-3 text-14 text-muted">{C.contractLine(l.mine.position, l.mine.signedOn ? formatDate(l.mine.signedOn) : '—', l.mine.verifier)}</p>
          <div className="space-y-3">
            {l.mine.objectives.map((o) => (
              <section key={o.id} className={card} aria-label={o.title}>
                <h3 className="text-16 font-bold text-navy">{o.title}</h3>
                <PartOf o={o} />
                <Facts rows={[
                  [C.target, o.target ? `${formatNumber(o.target.value)} ${o.target.unit}` : '—'],
                  [C.verified, o.verified ? C.atPeriod(formatNumber(o.verified.done), formatDate(o.verified.periodEnd)) : C.noVerifiedYet],
                ]} />
                <div className="mt-3">
                  <ProgressBar share={o.clamped} trueShare={o.share} expected={l.expected} status={o.status} label={o.title} />
                </div>
                {o.pending && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-14 text-text">
                    <StateChip state={o.pending.state} />
                    {C.figureFor(fig(o.pending.quantityDone), o.unit, C.periodName(o.frequency, o.pending.periodEnd))}
                    {o.pending.state === 'sent' ? C.pendingSent(l.mine?.verifier ?? C.yourSupervisor) : ''}
                  </p>
                )}
                {hasProgress && (
                  <div className="mt-3"><a href={hrefFor({ kind: 'progress', tab: 'mine', objectiveId: o.id })} className={button}>{C.report}</a></div>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
      {l.team && (
        <section aria-labelledby="your-team" className={l.mine ? 'mt-6' : ''}>
          <h2 id="your-team" className="mb-2 text-18 font-bold text-navy">{C.yourTeam}</h2>
          <div className={plainCard}>
            {l.team.length === 0 ? <p className="text-14 text-muted">{C.teamEmpty}</p> : (
              <ul className="divide-y divide-border">
                {l.team.map((t) => (
                  <li key={t.positionId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="block font-semibold text-navy">{t.person ?? C.vacant}</span>
                      <span className="block text-13 text-muted">{t.position}</span>
                    </span>
                    <span className="text-14">
                      {t.contract === 'signed'
                        ? t.waiting ? <a href={hrefFor({ kind: 'progress', tab: 'verify' })} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">{C.toVerify(t.waiting)}</a> : <span className="text-muted">{C.nothingToVerify}</span>
                        : <span className="text-muted">{t.contract ? C.contractRow[t.contract] : C.noContractRow}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      {!l.mine && !l.team && (
        <div className={card}><p className="text-14 text-muted">{C.noContract}</p></div>
      )}
    </>
  );
}

/* ───────── Progress updates, #/performance/progress ───────── */

export function ProgressUpdates({ tab, objectiveId }: { tab?: 'mine' | 'verify'; objectiveId?: string }) {
  const { repo } = useApp();
  const p = repo.progress.page();
  const can = { mine: p.mine !== null, verify: p.verify !== null };
  const on: 'mine' | 'verify' = tab && can[tab] ? tab : p.opensOn;
  const tabs = (['mine', 'verify'] as const).filter((k) => can[k]);
  return (
    <>
      <WorkspaceHeader w="performance" title={C.pageTitle} intro={en.menu.purpose.progress!} />
      <EntryRow w="performance" />
      {tabs.length > 1 && (
        <nav aria-label={C.tabsLabel} className="mb-4 flex gap-1 border-b border-border">
          {tabs.map((k) => (
            <a key={k} href={hrefFor({ kind: 'progress', tab: k })} aria-current={on === k ? 'page' : undefined}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-4 px-3 text-14 ${on === k ? 'border-navy font-bold text-navy' : 'border-transparent text-muted hover:text-navy'}`}>
              {C.tabs[k]}
              {k === 'verify' && p.verify && p.verify.length + p.shareReadings.length > 0 && <span className="tabular rounded-full bg-navy px-2 text-12 font-semibold text-white">{p.verify.length + p.shareReadings.length}</span>}
            </a>
          ))}
        </nav>
      )}
      {on === 'mine' ? <Mine focus={objectiveId} /> : <ToVerify />}
    </>
  );
}

function Mine({ focus }: { focus?: string }) {
  const { repo } = useApp();
  const p = repo.progress.page();
  const m = p.mine;
  const [opened, setOpened] = useState<string[]>([]);
  const [edit, setEdit] = useState<UpdateRow | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  // A saved form closes, even when the address still names its objective.
  const [closed, setClosed] = useState<string[]>([]);
  if (!m) return <div className={card}><p className="text-14 text-muted">{C.noContract}</p></div>;
  const verifier = m.verifier ?? C.yourSupervisor;
  return (
    <>
      <div className="space-y-3">
        {m.objectives.map((o) => {
          const editing = edit && edit.contractObjectiveId === o.id ? edit : null;
          const open = (focus === o.id && !closed.includes(o.id)) || !!o.due || !!o.returned || !!editing || opened.includes(o.id) || correcting === o.id;
          return open
            ? <FormCard key={`${o.id}:${editing?.id ?? ''}`} o={o} yearStart={p.yearStart} verifier={verifier} edit={editing} focus={focus === o.id || !!editing}
                onDone={() => {
                  setEdit(null); setCorrecting(null); setOpened((x) => x.filter((y) => y !== o.id)); setClosed((x) => [...x, o.id]);
                  window.history.replaceState(null, '', hrefFor({ kind: 'progress', tab: 'mine' }));
                }} />
            : <FoldedCard key={o.id} o={o} onOpen={() => { setClosed((x) => x.filter((y) => y !== o.id)); setOpened((x) => [...x, o.id]); }} />;
        })}
      </div>
      <h2 className="mb-2 mt-6 text-18 font-bold text-navy">{C.yourUpdates}</h2>
      <div className={plainCard}>
        {m.updates.length === 0 ? <p className="text-14 text-muted">{C.noUpdates}</p> : (
          <ul className="divide-y divide-border">
            {m.updates.map((u) => <UpdateItem key={u.id} u={u} verifier={verifier} onEdit={() => { setClosed((x) => x.filter((y) => y !== u.contractObjectiveId)); setEdit(u); }} onCorrect={() => { setClosed((x) => x.filter((y) => y !== u.contractObjectiveId)); setCorrecting(u.contractObjectiveId); }} />)}
          </ul>
        )}
      </div>
    </>
  );
}

function FoldedCard({ o, onOpen }: { o: ObjectiveCard; onOpen: () => void }) {
  return (
    <section className={card} aria-label={o.title}>
      <h3 className="text-16 font-bold text-navy">{o.title}</h3>
      <PartOf o={o} />
      <Facts rows={[
        [C.target, o.target ? `${formatNumber(o.target.value)} ${o.target.unit}` : '—'],
        [C.lastVerified, o.verified ? C.atPeriod(formatNumber(o.verified.done), formatDate(o.verified.periodEnd)) : C.noneYet],
      ]} />
      <div className="mt-3"><button type="button" onClick={onOpen} className={button}>{C.report}</button></div>
    </section>
  );
}

function FormCard({ o, yearStart, verifier, edit, focus, onDone }: {
  o: ObjectiveCard; yearStart: ISODate; verifier: string; edit: UpdateRow | null; focus: boolean; onDone: () => void;
}) {
  const { repo, say } = useApp();
  const id = useId();
  const firstPeriod = edit?.periodEnd ?? o.returned?.periodEnd ?? o.due ?? o.periods[0] ?? '';
  const [period, setPeriod] = useState<string>(firstPeriod);
  const [qty, setQty] = useState(edit && edit.quantityDone !== null ? String(edit.quantityDone) : '');
  const [note, setNote] = useState(edit?.note ?? '');
  const [evidence, setEvidence] = useState(edit?.evidence ?? '');
  const [error, setError] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus) return;
    sectionRef.current?.scrollIntoView({ block: 'start' });
    qtyRef.current?.focus({ preventScroll: true });
  }, [focus]);
  const periods = edit && !o.periods.includes(edit.periodEnd) ? [edit.periodEnd, ...o.periods] : o.periods;
  const typed = qty.trim() === '' ? null : Number(qty.replace(/[\s,]/g, ''));
  // The form's own hint; whether a reason is needed is decided by the data-access layer on save (OP-9).
  const lower = typed !== null && Number.isFinite(typed) && o.verified !== null && typed < o.verified.done;
  const sent = o.sentByPeriod[period];
  const verified = o.verifiedByPeriod[period];
  const name = (d: string) => C.periodName(o.frequency, d);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = repo.progress.save({ contractObjectiveId: o.id, periodEnd: period, quantity: qty, note, evidence, editId: edit?.onDevice ? edit.id : undefined });
    if (!r.ok) {
      const msg = C.errors[r.error] ?? C.errors.generic;
      setError(typeof msg === 'function' ? msg(o.unit) : msg!);
      (r.error === 'reason_required' ? noteRef : qtyRef).current?.focus();
      return;
    }
    if (edit?.onDevice) say(C.toasts.changed);
    else if (r.queued) say(C.toasts.savedOffline);
    else if (r.sent) say(r.sent.failed ? (r.sent.sent ? C.toasts.sentSome(r.sent.sent, r.sent.failed) : C.toasts.failed) : C.toasts.sent(r.sent.sent, verifier));
    onDone();
  };
  return (
    <section ref={sectionRef} className={card} aria-label={o.title}>
      <h3 className="text-16 font-bold text-navy">{o.title}</h3>
      <PartOf o={o} />
      <Facts rows={[
        [C.target, o.target ? `${formatNumber(o.target.value)} ${o.target.unit}` : '—'],
        [C.lastVerified, o.verified ? C.atPeriod(formatNumber(o.verified.done), formatDate(o.verified.periodEnd)) : C.noneYet],
      ]} />
      {o.returned && <Flag title={C.returnedBy(o.returned.by)}>{o.returned.reason}</Flag>}
      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        <div>
          <label htmlFor={`${id}-p`} className="text-14 font-semibold text-navy">{C.period}</label>
          <select id={`${id}-p`} value={period} onChange={(e) => { setPeriod(e.target.value); setError(null); }} className={input}>
            {periods.map((d) => <option key={d} value={d}>{C.periodOption(capital(name(d)), formatDate(d))}</option>)}
          </select>
        </div>
        {sent != null && !o.returned && <p className="text-13 text-muted">{C.sentBefore(formatNumber(sent), name(period))}</p>}
        {verified != null && <p className="text-13 text-muted">{C.verifiedBefore(formatNumber(verified), name(period), verifier)}</p>}
        <div>
          <label htmlFor={`${id}-q`} className="text-14 font-semibold text-navy">{C.figureLabel(o.unit)}</label>
          <p id={`${id}-qh`} className="text-12 text-muted">{C.figureHint(formatDate(yearStart))}</p>
          <input ref={qtyRef} id={`${id}-q`} aria-describedby={`${id}-qh`} inputMode="numeric" autoComplete="off" value={qty}
            onChange={(e) => { setQty(e.target.value); setError(null); }} className={`${input} tabular text-18 font-semibold`} />
        </div>
        <div aria-live="polite">
          {lower && o.verified && <Flag title={C.lowerFlagTitle}>{C.lowerFlag(formatNumber(o.verified.done), formatDate(o.verified.periodEnd), verifier)}</Flag>}
        </div>
        <div>
          <label htmlFor={`${id}-n`} className="text-14 font-semibold text-navy">{lower ? C.noteLower : C.note}</label>
          <textarea ref={noteRef} id={`${id}-n`} rows={2} value={note} onChange={(e) => { setNote(e.target.value); setError(null); }} className={`${input} py-2`} />
        </div>
        <div>
          <label htmlFor={`${id}-e`} className="text-14 font-semibold text-navy">{C.evidence}</label>
          <p id={`${id}-eh`} className="text-12 text-muted">{C.evidenceHint}</p>
          <input id={`${id}-e`} aria-describedby={`${id}-eh`} value={evidence} onChange={(e) => setEvidence(e.target.value)} className={input} />
        </div>
        {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primary}>{edit ? C.saveChanges : C.save}</button>
          {edit && <button type="button" onClick={onDone} className={button}>{C.cancel}</button>}
        </div>
      </form>
    </section>
  );
}

function UpdateItem({ u, verifier, onEdit, onCorrect }: { u: UpdateRow; verifier: string; onEdit: () => void; onCorrect: () => void }) {
  const { repo, say } = useApp();
  const { tz, startMonth } = useOrg();
  const fy = formatFinancialYear(repo.progress.page().financialYear, startMonth);
  const position = repo.progress.page().mine?.position ?? '';
  const detail = u.state === 'waiting' ? C.detail.waiting(formatDateTime(u.savedAt, tz), u.savedOffline)
    : u.state === 'sent' ? C.detail.sent(u.sentAt ? formatDateTime(u.sentAt, tz) : '', verifier)
    : u.state === 'verified' ? `${C.detail.verified(u.verified!.by, formatDate(u.verified!.on))}${u.superseded ? ` ${C.detail.superseded}` : ''}`
    : u.state === 'returned' ? C.detail.returned(u.returned!.by, formatDate(u.returned!.on))
    : u.failure === 'contract_not_signed' ? C.failure.contract_not_signed(fy, verifier)
    : u.failure === 'objective_missing' ? C.failure.objective_missing(verifier)
    : u.failure === 'outside_year' ? C.failure.outside_year(fy)
    : u.failure === 'position_not_held' ? C.failure.position_not_held(position, formatDate(u.periodEnd)) : '';
  const remove = () => {
    if (!window.confirm(C.confirmDelete)) return;
    if (repo.progress.remove(u.id).ok) say(C.toasts.deleted);
  };
  const retry = () => {
    const r = repo.progress.retry(u.id);
    say(r ? (r.failed ? C.toasts.failed : C.toasts.sent(r.sent, verifier)) : C.toasts.retryLater);
  };
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="tabular text-16 font-bold text-navy">{fig(u.quantityDone)} {u.unit}</span>{' '}
          <span className="text-14 text-muted">{C.forPeriod(C.periodName(u.frequency, u.periodEnd))}</span>
          <p className="text-13 text-muted">{u.objectiveTitle}</p>
        </div>
        <StateChip state={u.state} />
      </div>
      <p className={`mt-1 text-13 ${u.state === 'failed' ? 'text-advisory-text' : 'text-muted'}`}>{detail}</p>
      {u.state === 'returned' && u.returned && (
        <>
          <p className="mt-1 border-l-4 border-advisory-border pl-3 text-14 text-text">{u.returned.reason}</p>
          <div className="mt-2"><a href={hrefFor({ kind: 'progress', tab: 'mine', objectiveId: u.contractObjectiveId })} onClick={onCorrect} className={primary}>{C.sendCorrected(C.periodName(u.frequency, u.periodEnd))}</a></div>
        </>
      )}
      {u.state === 'waiting' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className={button}>{C.edit}</button>
          <button type="button" onClick={remove} className={button}>{C.delete}</button>
        </div>
      )}
      {u.state === 'failed' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={retry} className={button}>{C.retry}</button>
          <button type="button" onClick={remove} className={button}>{C.delete}</button>
        </div>
      )}
    </li>
  );
}

function ToVerify() {
  const { repo } = useApp();
  const p = repo.progress.page();
  const list = p.verify ?? [];
  return (
    <div className="space-y-3">
      {p.notices.map((n) => (
        <div key={n.id} role="status" className="rounded-lg border border-advisory-border bg-advisory-bg p-3 text-14 text-advisory-text">
          <p>{C.notApplied(C.periodName(n.frequency, n.periodEnd), `${fig(n.quantityDone)} ${n.unit}`, n.person)}</p>
          <div className="mt-2"><button type="button" onClick={() => repo.progress.dismissNotice(n.id)} className={button}>{C.dismiss}</button></div>
        </div>
      ))}
      {p.queued.length > 0 && (
        <section className={plainCard} aria-label={C.state.waiting}>
          <h3 className="text-16 font-bold text-navy">{C.state.waiting}</h3>
          {p.queued.map((q) => (
            <p key={q.id} className="mt-1 flex flex-wrap items-center gap-2 text-14"><StateChip state="waiting" />{C.queuedLine(q.decision, C.figureFor(fig(q.quantityDone), q.unit, C.periodName(q.frequency, q.periodEnd)))}</p>
          ))}
          <p className="mt-1 text-13 text-muted">{C.queuedNote}</p>
        </section>
      )}
      {list.length === 0 && p.shareReadings.length === 0 ? <div className={plainCard}><p className="text-14 text-muted">{C.verifyEmpty}</p></div>
        : list.map((c) => <VerifyItem key={c.id} c={c} />)}
      {p.shareReadings.map((r) => <ShareVerifyItem key={r.id} r={r} />)}
    </div>
  );
}

/** v0.25.0 (F6): a share reading, verified here with contract updates; the same Verify and Return as on the share page. */
function ShareVerifyItem({ r }: { r: ProgressPage['shareReadings'][number] }) {
  const { repo, say } = useApp();
  const id = useId();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const S = en.targets;
  const done = (x: { ok: boolean; error?: string }, ok: string) => say(x.ok ? ok : S.errors[x.error ?? 'not_allowed'] ?? null);
  return (
    <section className={plainCard} aria-labelledby={`${id}-h`}>
      <p className="text-12"><span className="rounded-md bg-cascade-tint px-2 py-0.5 font-semibold text-cascade-text">{C.shareOf(r.kpi.split(' ')[0] ?? '')}</span></p>
      <h3 id={`${id}-h`} className="mt-1 text-16 font-bold text-navy">{r.person ? `${r.person}, ` : ''}{r.unit}</h3>
      <p className="tabular text-14">{C.shareLine(r.kpi, `${fig(r.value)}${r.kpiUnit}`, C.periodName('monthly', r.periodEnd), `${fig(r.target)}${r.kpiUnit}`)}</p>
      {r.savedOffline && <p className="text-13 text-muted">{C.savedOfflineNote}</p>}
      {!returning ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => done(repo.targets.verify(r.id), S.toasts.verified)}>{C.verify}<span className="sr-only">: {r.unit}</span></button>
          <button type="button" className={button} onClick={() => setReturning(true)}>{S.share.return}<span className="sr-only">: {r.unit}</span></button>
        </div>
      ) : (
        <div className="mt-2">
          <label htmlFor={`${id}-r`} className="text-14 font-semibold text-navy">{S.share.reason}</label>
          <textarea id={`${id}-r`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-control px-3 py-2 text-14" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => done(repo.targets.returnReading(r.id, reason), S.toasts.returned)}>{S.share.return}</button>
            <button type="button" className={button} onClick={() => setReturning(false)}>{S.page.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function VerifyItem({ c }: { c: VerifyCard }) {
  const { repo, say } = useApp();
  const { tz } = useOrg();
  const id = useId();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (returning) reasonRef.current?.focus(); }, [returning]);
  const period = C.periodName(c.frequency, c.periodEnd);
  const verify = () => {
    const r = repo.progress.verify(c.id);
    if (!r.ok) return setError(C.errors[r.error] as string);
    say(r.queued ? C.queuedDecision('verify') : C.toasts.verified(fig(c.quantityDone), c.unit));
  };
  const ret = (e: React.FormEvent) => {
    e.preventDefault();
    const r = repo.progress.returnUpdate(c.id, reason);
    if (!r.ok) { setError(C.errors[r.error] as string); reasonRef.current?.focus(); return; }
    say(r.queued ? C.queuedDecision('return') : C.toasts.returned);
  };
  const markDetail = (m: VerifyCard['marks'][number]) =>
    m === 'lower' ? (c.previous ? C.marks.lowerDetail(fig(c.previous.done), formatDate(c.previous.periodEnd)) : '')
    : m === 'saved_time' ? C.marks.saved_timeDetail(formatDateTime(c.savedAt, tz), c.arrivedAt ? formatDateTime(c.arrivedAt, tz) : '')
    : C.marks.source_changedDetail;
  return (
    <section className={card} aria-label={`${c.person}: ${c.objectiveTitle}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-16 font-bold text-navy">{c.person}</h3>
          <p className="text-13 text-muted">{c.position}</p>
        </div>
        <StateChip state="sent" />
      </div>
      <p className="mt-2 text-14 font-semibold text-text">{c.objectiveTitle}</p>
      <PartOf o={c} />
      <Facts rows={[
        [C.verifyCard.period, C.periodOption(capital(period), formatDate(c.periodEnd))],
        [C.verifyCard.figure, <b key="f" className="text-16 text-navy">{fig(c.quantityDone)} {c.unit}</b>],
        [C.verifyCard.previous, c.previous ? C.atPeriod(fig(c.previous.done), formatDate(c.previous.periodEnd)) : C.verifyCard.none],
        [C.verifyCard.target, c.target ? `${formatNumber(c.target.value)} ${c.target.unit}` : '—'],
        [C.verifyCard.note, c.note || <span key="n" className="text-muted">{C.verifyCard.none}</span>],
        [C.verifyCard.evidence, c.evidence || <span key="e" className="text-muted">{C.verifyCard.none}</span>],
        [C.verifyCard.saved, `${formatDateTime(c.savedAt, tz)}${c.savedOffline ? C.verifyCard.offline : ''}`],
        [C.verifyCard.arrived, c.arrivedAt ? formatDateTime(c.arrivedAt, tz) : '—'],
      ]} />
      {c.marks.map((m) => <Flag key={m} title={`${C.marks.prefix}: ${C.marks[m]}`}>{markDetail(m)}</Flag>)}
      {error && <p role="alert" className="mt-2 text-13 font-semibold text-block-text">{error}</p>}
      {c.queued ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-14"><StateChip state="waiting" />{C.queuedDecision(c.queued)}</p>
      ) : returning ? (
        <form onSubmit={ret} noValidate className="mt-3">
          <label htmlFor={`${id}-r`} className="text-14 font-semibold text-navy">{C.returnLabel}</label>
          <p id={`${id}-rh`} className="text-12 text-muted">{C.returnHint}</p>
          <textarea ref={reasonRef} id={`${id}-r`} aria-describedby={`${id}-rh`} rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} className={`${input} py-2`} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="submit" className={primary}>{C.returnTo(c.firstName)}</button>
            <button type="button" onClick={() => { setReturning(false); setError(null); }} className={button}>{C.cancel}</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={verify} className={primary}>{C.verify}</button>
          <button type="button" onClick={() => setReturning(true)} className={button}>{C.return}</button>
        </div>
      )}
    </section>
  );
}

