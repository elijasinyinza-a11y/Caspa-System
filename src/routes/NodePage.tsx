import type { ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import { identity } from '../components/identity';
import { ProgressBar, StatusBadge } from '../components/Status';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { isBlocking } from '../rules/integrity';
import type { KpiProgress } from '../rules/kpi-progress';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../selectors/format';
import type { NodeKind, NodeRef, NodeView } from '../selectors/node';
import { en } from '../strings/en';
import { nodeHref } from './router';

type Panel = 'strategy' | 'cascade' | 'plan' | 'performance';

/** A KPI value with its unit: "47%", "4,000 hours per day". */
const value = (v: number, unit: string) => (unit === '%' ? `${formatNumber(v)}%` : `${formatNumber(v)} ${unit}`);

function PanelCard({ p, children }: { p: Panel; children: ReactNode }) {
  return (
    <section aria-labelledby={`panel-${p}`} className={`min-w-0 rounded-xl border border-t-4 border-border bg-white p-5 ${identity[p].edge}`}>
      <h2 id={`panel-${p}`} className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-18 font-bold ${identity[p].text}`}>{en.node[p].title}</span>
        <span className="text-14 text-muted">{en.node[p].subtitle}</span>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
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

function NodeLink({ r }: { r: NodeRef }) {
  return (
    <a href={nodeHref(r.kind, r.id)} className="group inline-flex min-h-11 min-w-0 items-baseline gap-2 py-2 text-14 text-navy">
      <span className="tabular shrink-0 font-semibold">{r.code}</span>
      <span className="min-w-0 underline decoration-border underline-offset-4 group-hover:decoration-navy">{r.title}</span>
    </a>
  );
}

function Lineage({ n }: { n: NodeView }) {
  return (
    <nav aria-label={en.node.lineage} className="mb-6">
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))` }}>
        {n.lineage.map((r, i) => {
          const current = i === n.lineage.length - 1;
          const body = (
            <>
              <span className="text-12 text-muted">{r.label}</span>
              <span className="tabular block text-14 font-bold text-navy">{r.code}</span>
              <span className="mt-0.5 line-clamp-2 block text-13 text-text">{r.title}</span>
            </>
          );
          const cls = 'block h-full rounded-lg border p-3';
          return (
            <li key={r.id} className="min-w-0">
              {current ? (
                <div aria-current="page" className={`${cls} border-2 border-cascade-mark bg-cascade-tint`}>{body}</div>
              ) : (
                <a href={nodeHref(r.kind, r.id)} className={`${cls} border-border bg-white hover:border-control`}>{body}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Findings({ n }: { n: NodeView }) {
  if (n.findings.length === 0) return null;
  const items = [...n.findings].sort((a, b) => Number(isBlocking(b)) - Number(isBlocking(a)));
  return (
    <section aria-labelledby="node-findings" className="mb-6">
      <h2 id="node-findings" className="text-16 font-bold text-navy">{en.node.findingsTitle}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((f) => {
          const block = isBlocking(f);
          return (
            <li key={f.key} className={`rounded-lg p-3 ${block ? 'border-2 border-block-border bg-block-bg' : 'border border-advisory-border bg-advisory-bg'}`}>
              <span className={`text-12 font-bold ${block ? 'text-block-text' : 'text-advisory-text'}`}>{block ? en.integrity.hardBlock : en.integrity.advisoryFlag}</span>
              <p className="text-14 text-text">{f.message}</p>
              {block && <p className="text-12 text-muted">{en.integrity.blocks(en.list(f.blocksAt.map((g) => en.gates[g])))}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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
  return (
    <PanelCard p="strategy">
      <dl className="space-y-3">
        <Field label={en.node.planName}>{s.planTitle}</Field>
        {n.ref.kind !== 'goal' && <Field label={en.node.servesGoal}><NodeLink r={s.goal} /></Field>}
        {s.perspective && <Field label={en.node.perspective}>{s.perspective}</Field>}
      </dl>
      <div>
        <h3 className="text-14 font-semibold text-navy">{en.node.reasons}</h3>
        {s.reasons.visible ? (
          s.reasons.entries.length === 0 ? (
            <p className="mt-1 text-14 text-muted">{en.node.noReasons}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {s.reasons.entries.map((e, i) => (
                <li key={i} className="rounded-lg bg-strategy-tint p-3">
                  <p className="text-12 text-strategy-text">
                    {en.fourQ.cell(e.cell)}. {e.on === 'goal' ? en.node.reasonOnGoal(goalLabel) : en.node.reasonOnObjective(objectiveLabel)}
                  </p>
                  <p className="mt-1 text-14 text-text">{e.text}</p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="mt-1 text-14 text-muted">{en.node.reasonsHidden(s.reasons.count)}</p>
        )}
      </div>
    </PanelCard>
  );
}

function CascadePanel({ n, labels, kpiSingular }: { n: NodeView; labels: Record<NodeKind, string>; kpiSingular: string }) {
  const c = n.cascade;
  return (
    <PanelCard p="cascade">
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
              <ul className="mt-1 divide-y divide-border">
                {c.children.map((ch) => {
                  const share = 'clamped' in ch.progress ? ch.progress.clamped : ch.progress.progress;
                  const trueShare = 'clamped' in ch.progress ? ch.progress.progress : ch.progress.progress;
                  return (
                    <li key={ch.ref.id} className="py-2">
                      <NodeLink r={ch.ref} />
                      <ProgressBar compact share={share} trueShare={trueShare} status={ch.progress.status} label={ch.ref.code} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
              <ul className="mt-1 divide-y divide-border">
                {c.children.map((a) => (
                  <li key={a.ref.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                    <NodeLink r={a.ref} />
                    <span className="text-13 text-muted">
                      {a.level ? en.sixP[a.level] : en.noSixP}. {a.funded ? en.node.funded : en.node.notFunded}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg bg-cascade-tint p-3">
            <p className="text-12 text-cascade-text">{en.sixPLevel}</p>
            {c.level ? (
              <>
                <p className="text-18 font-bold text-navy">{en.sixP[c.level]}</p>
                <p className="text-13 text-text">{en.node.scope}: {c.scope}</p>
              </>
            ) : (
              <p className="text-16 font-semibold text-navy">{en.noSixP}</p>
            )}
          </div>
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

function PlanPanel({ n, labels, line }: { n: NodeView; labels: Record<NodeKind, string>; line: { singular: string; plural: string } }) {
  const p = n.plan;
  const one = n.ref.kind === 'activity';
  return (
    <PanelCard p="plan">
      {p.activities === 0 ? (
        <p className="text-14 text-muted">{en.node.noActivities(labels.activity)}</p>
      ) : one ? (
        <p className="text-16 font-semibold text-navy">{p.funded ? en.node.funded : en.node.notFunded}</p>
      ) : (
        <p className="text-16 font-semibold text-navy">{en.node.fundedOf(p.funded, p.activities, labels.activity)}</p>
      )}
      {p.lines.length > 0 && (
        <table className="w-full text-14">
          <caption className="sr-only">{line.plural}</caption>
          <tbody>
            {p.lines.map((l) => (
              <tr key={l.id} className="border-b border-border align-top">
                <td className="py-2 pr-3">
                  <div className="text-text">{l.description}</div>
                  <div className="text-12 text-muted">
                    {!one && <>{l.activity.code}. </>}
                    {en.node.lineFrom(en.costCategory[l.costCategory as keyof typeof en.costCategory], en.fundingSource[l.fundingSource as keyof typeof en.fundingSource])}
                  </div>
                </td>
                <td className="tabular whitespace-nowrap py-2 text-right text-text">{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          {p.total && (
            <tfoot>
              <tr>
                <th scope="row" className="pt-2 text-left font-semibold text-navy">{en.node.total}</th>
                <td className="tabular whitespace-nowrap pt-2 text-right font-bold text-navy">{formatMoney(p.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
      {p.hiddenLines > 0 && p.lines.length > 0 && <p className="text-13 text-muted">{en.node.hiddenLines(p.hiddenLines, line.singular, line.plural)}</p>}
      {p.hiddenLines > 0 && p.lines.length === 0 && <p className="text-13 text-muted">{en.node.statusOnly}</p>}
      {!one && p.lines.length === 0 && p.activityFunding.length > 0 && p.activityFunding.length <= 12 && (
        <ul className="divide-y divide-border">
          {p.activityFunding.map((a) => (
            <li key={a.ref.id} className="flex flex-wrap items-center justify-between gap-x-3">
              <NodeLink r={a.ref} />
              <span className="text-13 text-muted">{a.funded ? en.node.funded : en.node.notFunded}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

function PerformancePanel({ n, co }: { n: NodeView; co: { singular: string; plural: string } }) {
  const p = n.performance;
  const none = p.objectives.length === 0 && p.hidden.count === 0;
  return (
    <PanelCard p="performance">
      {none && <p className="text-14 text-muted">{en.node.noContracts}</p>}
      {p.objectives.length > 0 && (
        <ul className="space-y-3">
          {p.objectives.map((o) => (
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
          ))}
        </ul>
      )}
      {p.hidden.count > 0 && (
        <div>
          <p className="text-14 text-text">{en.node.coverage(p.hidden.count, co.singular, co.plural)}</p>
          {p.hidden.assigned.length > 0 && (
            <p className="tabular text-14 text-text">{en.node.assigned(en.list(p.hidden.assigned.map((a) => `${formatNumber(a.value)} ${a.unit}`)))}</p>
          )}
          <p className="mt-1 text-13 text-muted">{en.node.coverageNote}</p>
        </div>
      )}
    </PanelCard>
  );
}

export function NodePage({ kind, id }: { kind: NodeKind; id: string }) {
  const { repo } = useApp();
  const n = repo.node(kind, id);
  const terms = repo.settings().termLabels;
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
  const intro = n.owner ? en.node.owner(n.owner.position, n.owner.person, n.owner.acting) : en.node.noOwner;
  return (
    <>
      <WorkspaceHeader w="cascade" title={`${n.ref.code} ${n.ref.title}`} intro={intro} />
      <Lineage n={n} />
      <Findings n={n} />
      <div className="grid gap-4 lg:grid-cols-2">
        <StrategyPanel n={n} />
        <CascadePanel n={n} labels={labels} kpiSingular={terms.kpi.singular} />
        <PlanPanel n={n} labels={labels} line={terms.budgetLine} />
        <PerformancePanel n={n} co={terms.contractObjective} />
      </div>
    </>
  );
}
