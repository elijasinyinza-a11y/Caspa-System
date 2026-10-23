import { useState } from 'react';
import { useApp } from '../components/AppContext';
import { ProgressBar } from '../components/Status';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { formatFinancialYear } from '../selectors/format';
import type { NodeKind, TreeNode } from '../selectors/node';
import { en } from '../strings/en';
import { nodeHref } from './router';

const INDENT: Record<NodeKind, string> = { goal: 'pl-0', objective: 'pl-4 md:pl-6', kpi: 'pl-8 md:pl-12', activity: 'pl-12 md:pl-[72px]' };

/** Every node id that has children, for "Expand all". */
const parentsOf = (nodes: TreeNode[]): string[] => nodes.flatMap((n) => (n.children.length ? [n.ref.id, ...parentsOf(n.children)] : []));

function Row({ n, open, toggle }: { n: TreeNode; open: Set<string>; toggle: (id: string) => void }) {
  const expanded = open.has(n.ref.id);
  const hasChildren = n.children.length > 0;
  const top = n.ref.kind === 'goal';
  return (
    <li>
      <div className={`grid items-center gap-x-4 gap-y-1 border-b border-border py-2 md:grid-cols-[minmax(0,1fr)_minmax(200px,280px)] ${INDENT[n.ref.kind]}`}>
        <div className="flex min-w-0 items-start gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(n.ref.id)}
              aria-expanded={expanded}
              aria-label={expanded ? en.cascadeTree.collapse(n.ref.code) : en.cascadeTree.expand(n.ref.code)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-navy hover:bg-cream"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className={expanded ? 'rotate-90' : ''}>
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span aria-hidden="true" className="w-11 shrink-0" />
          )}
          <a href={nodeHref(n.ref.kind, n.ref.id)} className={`flex min-h-11 min-w-0 items-baseline gap-2 py-2 text-navy hover:underline ${top ? 'text-16' : 'text-14'}`}>
            <span className="tabular shrink-0 font-bold">{n.ref.code}</span>
            <span className={`min-w-0 ${top ? 'font-semibold' : ''}`}>{n.ref.title}</span>
          </a>
        </div>
        <div className="pl-12 md:pl-0">
          {n.progress ? (
            <ProgressBar compact share={n.progress.share} status={n.progress.status} label={n.ref.code} />
          ) : (
            <p className="text-13 text-muted md:text-right">
              {n.level ? en.sixP[n.level] : en.noSixP}. {n.funded ? en.cascadeTree.funded : en.cascadeTree.notFunded}
            </p>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <ul>
          {n.children.map((c) => <Row key={c.ref.id} n={c} open={open} toggle={toggle} />)}
        </ul>
      )}
    </li>
  );
}

export function CascadeTree() {
  const { repo } = useApp();
  const t = repo.cascadeTree();
  const settings = repo.settings();
  const terms = settings.termLabels;
  // Goals open by default; smaller cascades open fully.
  const [open, setOpen] = useState<Set<string>>(() => new Set(t.counts.activity <= 40 ? parentsOf(t.goals) : t.goals.map((g) => g.ref.id)));
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const fy = formatFinancialYear(repo.financialYear, settings.financialYearStartMonth);
  const counts = [
    en.cascadeTree.count(t.counts.goal, (t.counts.goal === 1 ? terms.goal.singular : terms.goal.plural).toLowerCase()),
    en.cascadeTree.count(t.counts.objective, (t.counts.objective === 1 ? terms.objective.singular : terms.objective.plural).toLowerCase()),
    en.cascadeTree.count(t.counts.kpi, t.counts.kpi === 1 ? terms.kpi.singular : terms.kpi.plural),
    en.cascadeTree.count(t.counts.activity, (t.counts.activity === 1 ? terms.activity.singular : terms.activity.plural).toLowerCase()),
  ];
  return (
    <>
      <WorkspaceHeader w="cascade" title={en.cascadeTree.title} intro={en.cascadeTree.intro(fy)} />
      <section aria-labelledby="tree-title" className="rounded-xl border border-t-4 border-border border-t-cascade-mark bg-white p-4 md:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="tree-title" className="text-16 font-bold text-navy">{t.planTitle}</h2>
            <p className="tabular text-13 text-muted">{en.list(counts)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(new Set(parentsOf(t.goals)))} className="min-h-11 rounded-lg border border-control bg-white px-3 text-13 font-semibold text-navy hover:border-navy">{en.cascadeTree.expandAll}</button>
            <button type="button" onClick={() => setOpen(new Set())} className="min-h-11 rounded-lg border border-control bg-white px-3 text-13 font-semibold text-navy hover:border-navy">{en.cascadeTree.collapseAll}</button>
          </div>
        </div>
        {t.goals.length === 0 ? <p className="py-4 text-14 text-muted">{en.cascadeTree.empty}</p> : <ul>{t.goals.map((g) => <Row key={g.ref.id} n={g} open={open} toggle={toggle} />)}</ul>}
      </section>
    </>
  );
}
