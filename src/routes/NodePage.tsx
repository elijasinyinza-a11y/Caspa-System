import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import { identity } from '../components/identity';
import { ProgressBar, StatusBadge } from '../components/Status';
import { FindingCard } from '../components/FindingCard';
import { BookLine, Explain, SixPChip } from '../components/Explain';
import { useShowCodes } from '../components/prefs';
import { isBlocking } from '../rules/integrity';
import type { KpiProgress } from '../rules/kpi-progress';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../selectors/format';
import type { NodeKind, NodeRef, NodeView, PlanGroup, PlanLine } from '../selectors/node';
import { en, type WorkspaceKey } from '../strings/en';
import { nodeHref } from './router';
import { ActivityLevel, MapSummary } from './DecisionMap';

type Panel = 'strategy' | 'cascade' | 'plan' | 'performance';

/** A KPI value with its unit: "47%", "4,000 hours per day". */
const value = (v: number, unit: string) => (unit === '%' ? `${formatNumber(v)}%` : `${formatNumber(v)} ${unit}`);

/** Lists longer than this fold behind "Show all" (Build Brief, section 18). */
const FOLD_AT = 6;

/**
 * Record page sections (Clarity Specification, section 9, option A decided 28 October 2026): all four summary lines
 * are always visible, so the thread from strategy to action reads at a glance; one section is open at a time.
 */
const Sections = createContext<{ open: Panel | null; toggle: (p: Panel) => void }>({ open: null, toggle: () => {} });

function PanelCard({ p, summary, children, empty }: { p: Panel; summary: string; children?: ReactNode; empty?: boolean }) {
  const { open, toggle } = useContext(Sections);
  const bodyId = useId();
  const isOpen = !empty && open === p;
  const heading = (
    <span className="min-w-0">
      <span className={`block text-12 font-semibold ${identity[p].text}`}>{en.node[p].title}</span>
      <span className="block text-18 font-bold text-navy">{en.node[p].subtitle}</span>
      <span className="block text-14 text-text">{summary}</span>
    </span>
  );
  return (
    <section aria-labelledby={`panel-${p}`} className={`min-w-0 overflow-hidden rounded-xl border border-l-4 border-border bg-white ${identity[p].side}`}>
      <h2 id={`panel-${p}`}>
        {empty ? (
          <span className="flex min-h-14 items-center px-5 py-3">{heading}</span>
        ) : (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => toggle(p)}
            className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-cream"
          >
            {heading}
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={`ml-auto shrink-0 text-navy ${isOpen ? 'rotate-90' : ''}`}>
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </h2>
      {isOpen && <div id={bodyId} className="space-y-4 px-5 pb-5 pt-1">{children}</div>}
    </section>
  );
}

const textButton = 'inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4';

/** Shows the first FOLD_AT items, with the rest one click away. */
function Folded<T>({ items, label, render, className }: { items: T[]; label: string; render: (x: T) => ReactNode; className: string }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const shown = all || items.length <= FOLD_AT ? items : items.slice(0, FOLD_AT);
  return (
    <>
      <ul id={id} className={className}>{shown.map(render)}</ul>
      {items.length > FOLD_AT && (
        <button type="button" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)} className={textButton}>
          {all ? en.node.showFewer : en.node.showAll(items.length, label)}
        </button>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-13 text-muted">{label}</dt>
      <dd className="mt-0.5 text-14 text-text">{children}</dd>
    </div>
  );
}

function NodeLink({ r, oneLine = false }: { r: NodeRef; oneLine?: boolean }) {
  const [codes] = useShowCodes();
  return (
    <a href={nodeHref(r.kind, r.id)} title={oneLine ? r.title : undefined} className="group inline-flex min-h-11 min-w-0 max-w-full items-baseline gap-2 py-2 text-14 text-navy">
      {codes && <span className="tabular shrink-0 text-13 text-muted">{r.code}</span>}
      <span className={`min-w-0 underline decoration-border underline-offset-4 group-hover:decoration-navy ${oneLine ? 'truncate' : ''}`}>{r.title}</span>
    </a>
  );
}

/** Hard blocks always show in full; advisory flags fold into one strip that can be opened. */
function Findings({ n }: { n: NodeView }) {
  const { repo } = useApp();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (n.findings.length === 0) return null;
  const self = n.label.toLowerCase();
  const card = (f: NodeView['findings'][number]) => {
    const own = f.subject.type === NODE_TYPE_OF[n.ref.kind] && f.subject.id === n.ref.id;
    const short = own ? en.node.findingHere[f.ruleId]?.(self) : undefined;
    return <FindingCard key={f.key} view={repo.describeFinding(f)} here={{ node: n.ref.kind, id: n.ref.id }} short={short} />;
  };
  const blocks = n.findings.filter(isBlocking);
  const flags = n.findings.filter((f) => !isBlocking(f));
  const acknowledged = flags.filter((f) => repo.describeFinding(f).ack.state === 'acknowledged').length;
  const openFlags = flags.length - acknowledged;
  return (
    <section aria-labelledby="node-findings" className="mb-6 space-y-2">
      <h2 id="node-findings" className="sr-only">{en.node.findingsTitle}</h2>
      {blocks.length > 0 && <ul className="space-y-2">{blocks.map(card)}</ul>}
      {flags.length > 0 && (
        <div className={`rounded-lg border ${openFlags ? 'border-advisory-border bg-advisory-bg' : 'border-info-border bg-info-bg'}`}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 px-4 py-2 text-left"
          >
            <span className={`text-14 font-semibold ${openFlags ? 'text-advisory-text' : 'text-info-text'}`}>
              {openFlags ? en.node.advisoryStrip(openFlags, acknowledged) : en.node.acknowledgedStrip(acknowledged)}
            </span>
            <span className="text-14 font-semibold text-navy underline underline-offset-4">{open ? en.node.hide : en.node.show}</span>
          </button>
          {open && <ul id={listId} className="space-y-2 px-2 pb-2">{flags.map(card)}</ul>}
        </div>
      )}
    </section>
  );
}

const NODE_TYPE_OF: Record<NodeKind, string> = { goal: 'Goal', objective: 'Objective', kpi: 'Kpi', activity: 'Activity' };

function KpiDetail({ p, unit }: { p: KpiProgress; unit: string }) {
  const note =
    p.kind === 'no_data' ? en.progress.noData
    : p.kind === 'no_target' ? en.progress.noTarget
    : p.kind === 'invalid' ? en.progress.invalid
    : p.kind === 'target_check' ? en.progress.targetCheck
    : p.baselineAssumedZero ? en.progress.baselineAssumed
    : null;
  return (
    <>
      {p.kind === 'target_check' ? (
        <StatusBadge status={p.status} />
      ) : (
        <ProgressBar share={p.clamped} trueShare={p.progress} expected={p.expected} status={p.status} label={en.status[p.status]} />
      )}
      {p.kind === 'percent' && <p className="text-13 text-muted">{en.progress.expected(formatPercent(p.expected))}</p>}
      {note && <p className="text-13 text-muted">{note}</p>}
      <dl className="grid grid-cols-3 gap-3">
        <Field label={en.node.baseline}>{p.baseline === null ? '—' : <span className="tabular">{value(p.baseline, unit)}</span>}</Field>
        <Field label={en.node.target}>{p.target === null ? '—' : <span className="tabular">{value(p.target, unit)}</span>}</Field>
        <Field label={en.node.actual}>{p.actual === null ? '—' : <span className="tabular">{value(p.actual, unit)}</span>}</Field>
      </dl>
    </>
  );
}

function StrategyPanel({ n }: { n: NodeView }) {
  const s = n.strategy;
  const goalLabel = n.lineage[0]!.label;
  const objectiveLabel = n.lineage[1]?.label ?? '';
  const parent = n.lineage[n.lineage.length - 2];
  const summary =
    n.ref.kind === 'goal' || !parent
      ? (s.perspective ? en.node.summary.perspective(s.perspective) : s.planTitle)
      : n.ref.kind === 'activity'
        ? en.node.summary.moves(parent.label, parent.title)
        : en.node.summary.serves(parent.label, parent.title);
  return (
    <PanelCard p="strategy" summary={summary}>
      {n.ref.kind !== 'goal' && (
        <div>
          <h3 className="text-14 font-semibold text-navy">{en.node.partOf}</h3>
          <ol className="mt-1 divide-y divide-border">
            {n.lineage.slice(0, -1).reverse().map((r) => (
              <li key={r.id}>
                <span className="block pt-2 text-12 text-muted">{r.label}</span>
                <NodeLink r={r} />
              </li>
            ))}
          </ol>
        </div>
      )}
      <dl className="space-y-3">
        <Field label={en.node.planName}>{s.planTitle}</Field>
        {n.ref.kind !== 'goal' && <Field label={en.node.servesGoal}><NodeLink r={s.goal} /></Field>}
        {s.perspective && <Field label={en.node.perspective}>{s.perspective}</Field>}
      </dl>
      <div>
        <h3 className="text-14 font-semibold text-navy">
          <Explain term={en.node.reasons} label={en.explain.open(en.node.reasons)} triggerClass="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4">
            <BookLine line={en.book.fourQ} />
          </Explain>
        </h3>
        {s.reasons.visible ? (
          s.reasons.entries.length === 0 ? (
            <p className="mt-1 text-14 text-muted">{en.node.noReasons}</p>
          ) : (
            <Folded
              items={s.reasons.entries.map((e, i) => ({ ...e, i }))}
              label={en.node.reasonsLabel}
              className="mt-2 space-y-2"
              render={(e) => (
                <li key={e.i} className="rounded-lg bg-strategy-tint p-3">
                  <p className="text-12 text-strategy-text">
                    <Explain
                      term={en.fourQ.band[e.cell.band]}
                      label={en.explain.open(en.fourQ.band[e.cell.band])}
                      triggerClass="inline-flex min-h-11 items-center font-semibold underline decoration-dotted underline-offset-4"
                    >
                      <BookLine line={en.book.fourQBand[e.cell.band]} />
                    </Explain>
                    {': '}{en.fourQ.cellName(e.cell)}. {e.on === 'goal' ? en.node.reasonOnGoal(goalLabel) : en.node.reasonOnObjective(objectiveLabel)}
                  </p>
                  <p className="mt-1 text-14 text-text">{e.text}</p>
                </li>
              )}
            />
          )
        ) : (
          <p className="mt-1 text-14 text-muted">{en.node.reasonsHidden(s.reasons.count)}</p>
        )}
      </div>
    </PanelCard>
  );
}

function cascadeSummary(n: NodeView, labels: Record<NodeKind, string>): string {
  const c = n.cascade;
  if (c.kind === 'activity') return c.level ? en.node.summary.level(en.sixP[c.level]) : en.node.summary.noLevel;
  const childLabel = labels[c.kind === 'goal' ? 'objective' : c.kind === 'objective' ? 'kpi' : 'activity'];
  if (c.children.length === 0) return en.node.summary.noChildren(childLabel);
  const counts = new Map<string, number>();
  if (c.kind === 'kpi') {
    c.children.forEach((a) => { const k = a.level ? en.sixP[a.level] : en.noSixP; counts.set(k, (counts.get(k) ?? 0) + 1); });
    return en.node.summary.children(c.children.length, childLabel, [...counts].map(([k, v]) => en.node.summary.levelCount(v, k)).join(', '));
  }
  c.children.forEach((ch) => { const k = en.status[ch.progress.status]; counts.set(k, (counts.get(k) ?? 0) + 1); });
  return en.node.summary.children(c.children.length, childLabel, [...counts].map(([k, v]) => en.node.summary.statusCount(v, k)).join(', '));
}

function CascadePanel({ n, labels, kpiSingular }: { n: NodeView; labels: Record<NodeKind, string>; kpiSingular: string }) {
  const c = n.cascade;
  return (
    <PanelCard p="cascade" summary={cascadeSummary(n, labels)}>
      {c.kind === 'goal' || c.kind === 'objective' ? (
        <>
          <ProgressBar share={c.progress.progress} expected={c.progress.expected} status={c.progress.status} label={n.ref.code} />
          <p className="text-13 text-muted">
            {en.progress.reporting(c.progress.reporting, c.progress.total)}. {en.progress.expected(formatPercent(c.progress.expected))}.
          </p>
          <div>
            <h3 className="text-14 font-semibold text-navy">{labels[c.kind === 'goal' ? 'objective' : 'kpi']}</h3>
            {c.children.length === 0 ? (
              <p className="mt-1 text-14 text-muted">{en.node.noChildren(labels[c.kind === 'goal' ? 'objective' : 'kpi'])}</p>
            ) : (
              <Folded
                items={c.children as { ref: NodeRef; progress: { progress: number | null; status: KpiProgress['status']; clamped?: number | null } }[]}
                label={labels[c.kind === 'goal' ? 'objective' : 'kpi']}
                className="mt-1 divide-y divide-border"
                render={(ch) => {
                  const share = ch.progress.clamped !== undefined ? ch.progress.clamped : ch.progress.progress;
                  return (
                    <li key={ch.ref.id} className="flex flex-wrap items-center gap-x-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1"><NodeLink r={ch.ref} oneLine /></div>
                      <div className="w-full pb-2 sm:w-56 sm:shrink-0 sm:pb-0">
                        <ProgressBar compact share={share} trueShare={ch.progress.progress} status={ch.progress.status} label={ch.ref.code} />
                      </div>
                    </li>
                  );
                }}
              />
            )}
          </div>
          {c.kind === 'objective' && <MapSummary objectiveId={n.ref.id} />}
        </>
      ) : c.kind === 'kpi' ? (
        <>
          <KpiDetail p={c.progress} unit={c.unit} />
          <dl className="grid grid-cols-2 gap-3">
            <Field label={en.node.direction}>{en.direction[c.direction]}</Field>
            <Field label={en.node.aggregation}>{en.aggregation[c.aggregation]}</Field>
            <Field label={en.node.frequency}>{en.frequency[c.frequency]}</Field>
            <Field label={en.node.unit}>{c.unit}</Field>
          </dl>
          <div>
            <h3 className="text-14 font-semibold text-navy">{labels.activity}</h3>
            {c.children.length === 0 ? (
              <p className="mt-1 text-14 text-muted">{en.node.noChildren(labels.activity)}</p>
            ) : (
              <Folded
                items={c.children}
                label={labels.activity}
                className="mt-1 divide-y divide-border"
                render={(a) => (
                  <li key={a.ref.id} className="flex flex-wrap items-center justify-between gap-x-3 sm:flex-nowrap">
                    <div className="min-w-0 flex-1"><NodeLink r={a.ref} oneLine /></div>
                    <span className="flex shrink-0 items-center gap-2 pb-2 text-13 text-muted sm:pb-0">
                      {a.level ? <SixPChip level={a.level} /> : en.noSixP}
                      <span>{a.funded ? en.node.funded : en.node.notFunded}</span>
                    </span>
                  </li>
                )}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg bg-cascade-tint p-3">
            <p className="text-12 text-cascade-text">
              <Explain term={en.sixPLevel} label={en.explain.open(en.sixPLevel)} triggerClass="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4">
                <BookLine line={en.book.sixP} />
              </Explain>
            </p>
            {c.level ? (
              <>
                <SixPChip level={c.level} scope={c.scope ?? undefined} size="large" />
                <p className="text-13 text-text">{en.explain.covers}: {c.scope}</p>
              </>
            ) : (
              <p className="text-16 font-semibold text-navy">{en.noSixP}</p>
            )}
          </div>
          <ActivityLevel key={`${n.ref.id}:${c.level ?? ''}`} activityId={n.ref.id} title={n.ref.title} level={c.level} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={en.node.evidence}>{c.evidence || '—'}</Field>
            <Field label={en.node.frequency}>{en.frequency[c.frequency]}</Field>
            <Field label={en.node.status}>{en.activityStatus[c.status]}</Field>
            {c.dependsOn.length > 0 && <Field label={en.node.dependsOn}>{c.dependsOn.map((d) => <NodeLink key={d.id} r={d} />)}</Field>}
          </dl>
          {c.completion && (
            <div>
              <h3 className="text-14 font-semibold text-navy">{en.node.completion}</h3>
              {c.completion.done === null ? (
                <p className="mt-1 text-14 text-muted">{en.node.noCompletion}</p>
              ) : (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-info-bg" role="img" aria-label={`${en.node.completion}: ${formatPercent(c.completion.share ?? 0)}`}>
                      <div className="h-2 rounded-full bg-chart-2" style={{ width: `${Math.min(100, (c.completion.share ?? 0) * 100)}%` }} />
                    </div>
                    <span className="tabular w-12 text-right text-14 font-semibold text-navy">{formatPercent(c.completion.share ?? 0)}</span>
                  </div>
                  <p className="tabular mt-1 text-13 text-text">
                    {en.node.completionOf(formatNumber(c.completion.done), formatNumber(c.completion.target), c.completion.unit)}
                    {c.completion.asOf && `, ${en.node.asOf(formatDate(c.completion.asOf))}`}
                  </p>
                </>
              )}
              <p className="mt-1 text-12 text-muted">{en.node.completionNote}</p>
            </div>
          )}
          <div className="border-t border-border pt-3">
            <h3 className="text-14 font-semibold text-navy">{en.node.parentKpi(kpiSingular)}</h3>
            <NodeLink r={c.kpi.ref} />
            {c.kpi.progress.kind === 'target_check' ? (
              <StatusBadge status={c.kpi.progress.status} />
            ) : (
              <ProgressBar compact share={c.kpi.progress.clamped} trueShare={c.kpi.progress.progress} status={c.kpi.progress.status} label={c.kpi.ref.code} />
            )}
          </div>
        </>
      )}
    </PanelCard>
  );
}

type Labels = Record<NodeKind, string>;
type Term = { singular: string; plural: string };

function LineTable({ lines, total, showActivity, caption, totalLabel = en.node.total }: { lines: PlanLine[]; total: PlanGroup['subtotal']; showActivity: boolean; caption: string; totalLabel?: string }) {
  return (
    <table className="w-full text-14">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-border align-top">
            <td className="py-2 pr-3">
              <div className="text-text">{l.description}</div>
              <div className="text-12 text-muted">
                {showActivity && <span className="block">{en.budget.funds(l.activity.code, l.activity.title)}</span>}
                {en.node.lineFrom(en.costCategory[l.costCategory as keyof typeof en.costCategory], en.fundingSource[l.fundingSource as keyof typeof en.fundingSource])}
              </div>
            </td>
            <td className="tabular whitespace-nowrap py-2 text-right text-text">{formatMoney(l.amount)}</td>
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr>
            <th scope="row" className="pt-2 text-left font-semibold text-navy">{totalLabel}</th>
            <td className="tabular whitespace-nowrap pt-2 text-right font-bold text-navy">{formatMoney(total)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** One group on a goal or objective page: the child, its funding, its subtotal, and its lines in place. */
function GroupRow({ g, labels, line }: { g: PlanGroup; labels: Labels; line: Term }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="py-1">
      <div className="flex items-center gap-x-3">
        <div className="min-w-0 flex-1"><NodeLink r={g.ref} oneLine /></div>
        <span className="tabular shrink-0 text-right text-14 font-semibold text-navy">
          {g.subtotal ? formatMoney(g.subtotal) : g.hiddenLines > 0 ? <span className="text-13 font-normal text-muted">{en.node.groupHidden}</span> : '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="text-13 text-muted">
          {g.activities === 0 ? en.node.groupNoActivities(labels.activity) : en.node.groupFunded(g.funded, g.activities)}
        </span>
        {g.lines.length > 0 && (
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={textButton}>
            {open ? en.node.hideLines(line.plural) : en.node.showLines(g.lines.length, line.singular, line.plural)}
          </button>
        )}
      </div>
      {open && (
        <div id={id} className="mb-2 rounded-lg bg-cream px-3">
          <LineTable lines={g.lines} total={g.subtotal} showActivity caption={`${g.ref.code} ${line.plural}`} totalLabel={en.node.subtotal} />
        </div>
      )}
    </li>
  );
}

function PlanPanel({ n, labels, line }: { n: NodeView; labels: Labels; line: Term }) {
  const p = n.plan;
  const one = n.ref.kind === 'activity';
  if (p.activities === 0) return <PanelCard p="plan" summary={en.node.summary.noActivities(labels.activity)} empty />;
  const childLabel = labels[n.ref.kind === 'goal' ? 'objective' : 'kpi'];
  // A total is shown only when every line is visible; otherwise the summary says how much is funded.
  const summary = p.total
    ? en.node.summary.cost(formatMoney(p.total), p.lines.length, line.singular, line.plural)
    : one
      ? (p.funded ? (p.hiddenLines > 0 ? en.node.summary.fundedOnly : en.node.funded) : en.node.summary.notFunded)
      : en.node.summary.fundedOf(p.funded, p.activities, labels.activity);
  return (
    <PanelCard p="plan" summary={summary}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-16 font-semibold text-navy">
          {one ? (p.funded ? en.node.funded : en.node.notFunded) : en.node.fundedOf(p.funded, p.activities, labels.activity)}
        </p>
        {p.groups && p.total && <p className="tabular text-18 font-bold text-navy">{formatMoney(p.total)}</p>}
      </div>
      {p.groups ? (
        <div>
          <h3 className="text-14 font-semibold text-navy">{en.node.groupedBy(childLabel)}</h3>
          <Folded items={p.groups} label={childLabel} className="mt-1 divide-y divide-border" render={(g) => <GroupRow key={g.ref.id} g={g} labels={labels} line={line} />} />
        </div>
      ) : (
        p.lines.length > 0 && <LineTable lines={p.lines} total={p.total} showActivity={!one} caption={line.plural} />
      )}
      {p.hiddenLines > 0 && p.lines.length > 0 && <p className="text-13 text-muted">{en.node.hiddenLines(p.hiddenLines, line.singular, line.plural)}</p>}
      {p.hiddenLines > 0 && p.lines.length === 0 && <p className="text-13 text-muted">{en.node.statusOnly}</p>}
      {!one && !p.groups && p.lines.length === 0 && p.activityFunding.length > 0 && (
        <Folded
          items={p.activityFunding}
          label={labels.activity}
          className="divide-y divide-border"
          render={(a) => (
            <li key={a.ref.id} className="flex flex-wrap items-center justify-between gap-x-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1"><NodeLink r={a.ref} oneLine /></div>
              <span className="shrink-0 text-13 text-muted">{a.funded ? en.node.funded : en.node.notFunded}</span>
            </li>
          )}
        />
      )}
    </PanelCard>
  );
}

function PerformancePanel({ n, co }: { n: NodeView; co: { singular: string; plural: string } }) {
  const p = n.performance;
  if (p.objectives.length === 0 && p.hidden.count === 0) return <PanelCard p="performance" summary={en.node.summary.noCommitments} empty />;
  const count = p.objectives.length + p.hidden.count;
  return (
    <PanelCard p="performance" summary={en.node.summary.commitments(count)}>
      {p.objectives.length > 0 && (
        <Folded
          items={p.objectives}
          label={co.plural}
          className="space-y-3"
          render={(o) => (
            <li key={o.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-14 font-semibold text-navy">{o.person}</span>
                <span className="text-12 text-muted">{en.contractStatus[o.contractStatus as keyof typeof en.contractStatus]}</span>
              </div>
              <div className="text-13 text-muted">{o.position}</div>
              <p className="mt-2 text-14 text-text">{o.title}</p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Field label={en.node.personalTarget}>{o.target ? <span className="tabular">{formatNumber(o.target.value)} {o.target.unit}</span> : en.node.noTarget}</Field>
                <Field label={en.node.done}>{o.done === null ? en.node.notVerified : <span className="tabular">{formatNumber(o.done)}{o.target ? ` ${o.target.unit}` : ''}</span>}</Field>
              </dl>
            </li>
          )}
        />
      )}
      {p.hidden.count > 0 && (
        <div>
          <p className="text-14 text-text">{en.node.coverage(p.hidden.count)}</p>
          {p.hidden.assigned.length > 0 && (
            <p className="tabular text-14 text-text">{en.node.assigned(en.list(p.hidden.assigned.map((a) => `${formatNumber(a.value)} ${a.unit}`)))}</p>
          )}
          <p className="mt-1 text-13 text-muted">{en.node.coverageNote}</p>
        </div>
      )}
    </PanelCard>
  );
}

/** The record's heading (Clarity Specification, section 9.1): type, title, status and owner. "Part of" is the breadcrumb. */
function RecordHeading({ n }: { n: NodeView }) {
  const [codes] = useShowCodes();
  const [full, setFull] = useState(false);
  const long = n.ref.title.length > 90;
  const c = n.cascade;
  return (
    <div className="mb-4 rounded-xl border border-t-4 border-border border-t-cascade-mark bg-white px-5 py-4">
      <p className="text-13 font-semibold text-cascade-text">{n.label}</p>
      <h1 className={`mt-1 max-w-[70ch] text-22 font-bold text-navy md:text-28 ${full ? '' : 'line-clamp-2'}`}>{n.ref.title}</h1>
      {long && (
        <button type="button" onClick={() => setFull(!full)} aria-expanded={full} className={textButton}>
          {full ? en.node.hideFullTitle : en.node.showFullTitle}
        </button>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-14">
        <span className="flex min-w-0 items-center gap-2">
          {c.kind === 'activity' ? (
            <>
              <span className="text-muted">{en.sixPLevel}</span>
              {c.level ? <SixPChip level={c.level} scope={c.scope ?? undefined} /> : <span>{en.noSixP}</span>}
            </>
          ) : (
            <>
              <span className="text-muted">{en.node.status}</span>
              {c.kind === 'kpi' && c.progress.kind === 'target_check' ? (
                <StatusBadge status={c.progress.status} />
              ) : (
                <span className="w-56 max-w-full">
                  <ProgressBar
                    compact
                    share={c.kind === 'kpi' ? c.progress.clamped : c.progress.progress}
                    trueShare={c.kind === 'kpi' ? c.progress.progress : undefined}
                    status={c.progress.status}
                    label={n.ref.title}
                  />
                </span>
              )}
            </>
          )}
        </span>
        <span className={n.owner ? 'text-text' : 'text-muted'}>
          {n.owner ? en.node.owner(n.owner.position, n.owner.person, n.owner.acting) : en.node.noOwner}
        </span>
        {codes && <span className="tabular text-muted">{n.ref.code}</span>}
      </div>
    </div>
  );
}

/** One next step on this record for this person (principle C6): the first check sent to them that this record fixes. */
function NextStep({ n }: { n: NodeView }) {
  const { repo } = useApp();
  const own = n.findings
    .filter((f) => f.subject.type === NODE_TYPE_OF[n.ref.kind] && f.subject.id === n.ref.id)
    .map((f) => repo.describeFinding(f))
    .filter((f) => f.routedToMe && (isBlocking(f.finding) || f.ack.state !== 'acknowledged'));
  const step = own[0] && en.fixStep[own[0].finding.ruleId];
  if (!step) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 rounded-lg bg-white px-4 py-3 ring-1 ring-border">
      <span className="text-13 text-muted">{en.nextStep}</span>
      <span className="text-14 font-semibold text-text">{step(n.ref.title)}</span>
    </div>
  );
}

const FIRST_OPEN: Partial<Record<WorkspaceKey, Panel>> = { strategy: 'strategy', plan: 'plan', performance: 'performance' };

export function NodePage({ kind, id, from }: { kind: NodeKind; id: string; from?: WorkspaceKey }) {
  const { repo } = useApp();
  const n = repo.node(kind, id);
  const terms = repo.settings().termLabels;
  // Which section opens first depends on where the person came from; a direct visit opens "How it's done" (9.3).
  const [open, setOpen] = useState<Panel | null>((from && FIRST_OPEN[from]) ?? 'cascade');
  if (!n) {
    return (
      <div className="rounded-xl border border-border bg-white p-6">
        <p className="text-16 text-text">{en.node.notFound}</p>
        <a href={repo.workspaces().includes('cascade') ? '#/cascade' : '#/home'} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white">
          {repo.workspaces().includes('cascade') ? en.node.backToCascade : en.node.goHome}
        </a>
      </div>
    );
  }
  const labels: Record<NodeKind, string> = { goal: terms.goal.plural, objective: terms.objective.plural, kpi: terms.kpi.plural, activity: terms.activity.plural };
  return (
    <>
      <RecordHeading n={n} />
      <Findings n={n} />
      <NextStep n={n} />
      {/* Reading order is the source order, so on a phone the sections stack as Strategy, Cascade, Plan, Performance. */}
      <Sections.Provider value={{ open, toggle: (p) => setOpen(open === p ? null : p) }}>
        <div className="grid gap-3">
          <StrategyPanel n={n} />
          <CascadePanel n={n} labels={labels} kpiSingular={terms.kpi.singular} />
          <PlanPanel n={n} labels={labels} line={terms.budgetLine} />
          <PerformancePanel n={n} co={terms.contractObjective} />
        </div>
      </Sections.Provider>
    </>
  );
}
