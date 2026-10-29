import { useMemo, useState } from 'react';
import { useApp } from '../components/AppContext';
import { SixPChip, usePref } from '../components/Explain';
import { useShowCodes } from '../components/prefs';
import { ProgressBar, StatusBadge } from '../components/Status';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import {
  branchNeedsAttention, defaultOpen, findRecords, indexTree, ownedBy, toCheckOnRow, visibleFor, NO_CHECKS, type NodeChecks,
} from '../selectors/cascade-view';
import type { NodeKind, TreeNode } from '../selectors/node';
import { lc, en, type Terms } from '../strings/en';
import { fixHref, mapHref, nodeHref } from './router';

const chevron = (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
    <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface RowCtx {
  open: Set<string>;
  toggle: (id: string) => void;
  visible: Set<string> | null;
  attention: boolean;
  checks: Record<string, NodeChecks>;
  codes: boolean;
  funding: boolean;
  terms: Terms;
  showEverything: () => void;
  /** Objectives with a decision map this viewer may see, and how many rows it holds. */
  maps: Record<string, number>;
}

const activitiesUnder = (n: TreeNode): TreeNode[] => (n.ref.kind === 'activity' ? [n] : n.children.flatMap(activitiesUnder));

/** The single signal a row carries (section 6): progress, funding for Finance, or the 6P level for an activity. */
function Signal({ n, c }: { n: TreeNode; c: RowCtx }) {
  if (c.funding) {
    if (n.ref.kind === 'activity') return <span className="text-13 text-muted">{n.funded ? en.cascadeTree.funded : en.cascadeTree.notFunded}</span>;
    // Funded status only: the tree never shows amounts, which stay in Plan for those who may see them.
    const acts = activitiesUnder(n);
    return <span className="tabular text-13 text-text">{acts.length ? en.node.summary.fundedOf(acts.filter((a) => a.funded).length, acts.length, c.terms.activity.plural) : en.node.summary.noActivities(c.terms.activity.plural)}</span>;
  }
  if (n.ref.kind === 'activity') return n.level ? <SixPChip level={n.level} /> : <span className="text-13 text-muted">{en.noSixP}</span>;
  if (!n.progress) return null;
  // With no reading yet, the row says so in words; an empty bar would only add noise.
  if (n.progress.share === null) return <StatusBadge status={n.progress.status} />;
  return <span className="block w-60 max-w-full"><ProgressBar compact share={n.progress.share} status={n.progress.status} label={n.ref.title} /></span>;
}

function Rows({ nodes, depth, c }: { nodes: TreeNode[]; depth: number; c: RowCtx }) {
  const shown = nodes.filter((n) => !c.visible || c.visible.has(n.ref.id));
  const kept = c.attention ? shown.filter((n) => branchNeedsAttention(n, c.checks)) : shown;
  const folded = shown.length - kept.length;
  const kind = shown[0]?.ref.kind;
  return (
    <>
      {kept.map((n) => <Row key={n.ref.id} n={n} depth={depth} c={c} />)}
      {folded > 0 && kind && (
        <li className="flex flex-wrap items-center gap-x-3 border-b border-border py-1 text-14 text-muted" style={{ paddingLeft: `${depth * 24 + 52}px` }}>
          {en.cascadeTree.folded(folded, folded === 1 ? c.terms[kind].singular : c.terms[kind].plural)}
          <button type="button" onClick={c.showEverything} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">
            {en.cascadeTree.showEverything}
          </button>
        </li>
      )}
    </>
  );
}

const CHILD: Record<NodeKind, NodeKind | null> = { goal: 'objective', objective: 'kpi', kpi: 'activity', activity: null };

function Row({ n, depth, c }: { n: TreeNode; depth: number; c: RowCtx }) {
  const expanded = c.open.has(n.ref.id);
  const childKind = CHILD[n.ref.kind];
  const own = c.checks[n.ref.id] ?? NO_CHECKS;
  const roll = toCheckOnRow(n, expanded, c.checks);
  return (
    <li>
      <div className="grid items-center gap-x-3 border-b border-border py-1 md:grid-cols-[minmax(0,1fr)_auto]" style={{ paddingLeft: `${depth * 24}px` }}>
        <div className="flex min-w-0 items-center gap-1">
          {childKind ? (
            <button
              type="button"
              onClick={() => c.toggle(n.ref.id)}
              aria-expanded={expanded}
              aria-label={expanded ? en.cascadeTree.collapse(n.ref.title) : en.cascadeTree.expand(n.ref.title)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-navy hover:bg-cream"
            >
              <span className={expanded ? 'rotate-90' : ''}>{chevron}</span>
            </button>
          ) : (
            <span aria-hidden="true" className="w-11 shrink-0" />
          )}
          <a href={nodeHref(n.ref.kind, n.ref.id)} className="group flex min-h-11 min-w-0 flex-col justify-center py-1 text-navy">
            <span className="text-12 font-semibold text-cascade-text">{c.terms[n.ref.kind].singular}</span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={`min-w-0 truncate group-hover:underline ${n.ref.kind === 'goal' ? 'text-16 font-semibold' : 'text-14'}`}>{n.ref.title}</span>
              {c.codes && <span className="tabular shrink-0 text-13 text-muted">{n.ref.code}</span>}
            </span>
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1 pl-12 md:justify-end md:pb-0 md:pl-0">
          <Signal n={n} c={c} />
          {n.ref.kind === 'objective' && c.maps[n.ref.id] ? (
            <a href={mapHref(n.ref.id)} aria-label={en.decisionMap.treeLinkFor(n.ref.title)} className="inline-flex min-h-11 items-center text-13 font-semibold text-navy underline underline-offset-4">
              {en.decisionMap.treeLink}
            </a>
          ) : null}
          {own.mustFix > 0 && (
            <span className="rounded-full border border-block-border bg-block-bg px-2 py-0.5 text-12 font-semibold text-block-text">{en.cascadeTree.mustFix}</span>
          )}
          {roll.count > 0 && (
            <span className="rounded-full border border-advisory-border bg-advisory-bg px-2 py-0.5 text-12 font-semibold text-advisory-text">
              {en.cascadeTree.toCheck(roll.count, roll.below)}
            </span>
          )}
        </div>
      </div>
      {childKind && expanded && (
        <ul>
          {n.children.length === 0 ? (
            <li className="border-b border-border py-3 text-14 text-muted" style={{ paddingLeft: `${(depth + 1) * 24 + 52}px` }}>
              {en.cascadeTree.emptyChildren[n.ref.kind as 'goal' | 'objective' | 'kpi'](c.terms[childKind].plural)}
            </li>
          ) : (
            <Rows nodes={n.children} depth={depth + 1} c={c} />
          )}
        </ul>
      )}
    </li>
  );
}

/** The Cascade workspace (Clarity Specification, section 8). Every filter is a display filter; permissions come first. */
export function CascadeTree() {
  const { repo, role } = useApp();
  const v = repo.cascadeView();
  const terms = repo.settings().termLabels;
  const index = useMemo(() => indexTree(v.tree.goals), [v.tree.goals]);
  const hasPart = v.own.length > 0 && v.defaults.scope === 'part';
  const [scope, setScope] = useState<'part' | 'whole'>(hasPart ? 'part' : 'whole');
  const [attention, setAttention] = usePref<boolean>(`attention:${role}`, v.defaults.attention);
  const [codes, setCodes] = useShowCodes();
  const [owner, setOwner] = useState('');
  const [query, setQuery] = useState('');
  // One level at a time (section 8.2): on "Your part" the chain above the person's work is open; otherwise goals only.
  const startOpen = (k: 'part' | 'whole') => (k === 'part' ? defaultOpen(index, v.own, v.defaults.stopAboveKpi) : new Set<string>());
  const [open, setOpen] = useState<Set<string>>(() => startOpen(hasPart ? 'part' : 'whole'));
  const toggle = (id: string) => setOpen((s) => {
    const x = new Set(s);
    if (x.has(id)) x.delete(id); else x.add(id);
    return x;
  });

  let visible: Set<string> | null = scope === 'part' ? visibleFor(index, v.own) : null;
  if (owner) {
    const byOwner = visibleFor(index, ownedBy(index, owner));
    visible = visible ? new Set([...visible].filter((id) => byOwner.has(id))) : byOwner;
  }
  const c: RowCtx = {
    open, toggle, visible, attention, checks: v.checks, codes, funding: v.defaults.signal === 'funding', terms, maps: v.maps,
    showEverything: () => setAttention(false),
  };
  const hits = findRecords(index, query, codes);
  const labels = en.list([terms.goal.plural, terms.objective.plural, terms.kpi.plural, terms.activity.plural].map(lc));
  const visibleGoals = v.tree.goals.filter((g) => !visible || visible.has(g.ref.id));
  const keptGoals = attention ? visibleGoals.filter((g) => branchNeedsAttention(g, v.checks)) : visibleGoals;
  const fix = v.nextStep?.fix;

  return (
    <>
      <WorkspaceHeader
        w="cascade"
        title={en.cascadeTree.title}
        intro={en.workspaceIntro.cascade}
        next={v.nextStep && fix ? (
          <>
            <span className="text-14 font-semibold text-text">{v.nextStep.text}</span>
            <a
              href={fixHref(fix)}
              className="inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white"
            >
              {en.needsYou.open}
            </a>
          </>
        ) : undefined}
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {hasPart && (
          <div role="group" aria-label={en.cascadeTree.scopeLabel} className="inline-flex overflow-hidden rounded-lg border border-control bg-white">
            {(['part', 'whole'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={scope === k}
                onClick={() => { setScope(k); setOpen(startOpen(k)); }}
                className={`min-h-11 px-4 text-14 ${scope === k ? 'bg-navy font-semibold text-white' : 'text-navy'}`}
              >
                {k === 'part' ? en.cascadeTree.yourPart : en.cascadeTree.whole}
              </button>
            ))}
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-14 text-text">
          <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} className="h-5 w-5 accent-navy" />
          {en.cascadeTree.attention}
        </label>
        <div className="relative min-w-[200px] flex-1 md:max-w-[340px]">
          <label htmlFor="cascade-find" className="sr-only">{en.cascadeTree.findLabel(labels)}</label>
          <input
            id="cascade-find"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            placeholder={en.cascadeTree.findPlaceholder(codes)}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-control bg-white px-3 text-14"
          />
          {query.trim() && (
            <ul className="absolute left-0 right-0 top-12 z-20 rounded-lg border border-control bg-white p-1 shadow-lg">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-14 text-muted">{en.cascadeTree.findNone(query.trim())}</li>
              ) : (
                hits.map((h) => (
                  <li key={h.ref.id}>
                    <a href={nodeHref(h.ref.kind, h.ref.id)} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-14 text-navy hover:bg-cream">
                      <span className="text-12 font-semibold text-cascade-text">{terms[h.ref.kind].singular}</span>
                      <span className="min-w-0 truncate">{h.ref.title}</span>
                      {codes && <span className="tabular text-13 text-muted">{h.ref.code}</span>}
                    </a>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <label className="sr-only" htmlFor="cascade-owner">{en.cascadeTree.ownerLabel}</label>
        <select id="cascade-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="min-h-11 max-w-full rounded-lg border border-control bg-white px-3 text-14">
          <option value="">{en.cascadeTree.anyOwner}</option>
          {v.owners.map((o) => <option key={o.positionId} value={o.positionId}>{o.title}</option>)}
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-14 text-text">
          <input type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} className="h-5 w-5 accent-navy" />
          {en.cascadeTree.showCodes}
        </label>
      </div>
      <section aria-label={en.cascadeTree.title} className="rounded-xl border border-t-4 border-border border-t-cascade-mark bg-white px-3 md:px-4">
        {v.tree.goals.length === 0 ? (
          <p className="py-4 text-14 text-muted">{en.cascadeTree.empty}</p>
        ) : visibleGoals.length === 0 ? (
          <p className="py-4 text-14 text-muted">{en.cascadeTree.partEmpty}</p>
        ) : keptGoals.length === 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 py-3 text-14 text-muted">
            {en.cascadeTree.attentionEmpty}
            <button type="button" onClick={() => setAttention(false)} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">{en.cascadeTree.showEverything}</button>
          </p>
        ) : (
          <ul>
            <Rows nodes={v.tree.goals} depth={0} c={c} />
          </ul>
        )}
      </section>
      {v.unlinkedLines > 0 && (
        <section aria-labelledby="unlinked" className="mt-4 rounded-xl border border-block-border bg-block-bg px-4 py-3">
          <h2 id="unlinked" className="text-16 font-bold text-block-text">{en.cascadeTree.unlinkedTitle}</h2>
          <p className="flex flex-wrap items-center gap-x-3 text-14 text-text">
            {en.cascadeTree.unlinked(v.unlinkedLines, v.unlinkedLines === 1 ? terms.budgetLine.singular : terms.budgetLine.plural, terms.activity.singular)}
            {repo.workspaces().includes('plan') && (
              <a href="#/plan" className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">{en.cascadeTree.openPlan}</a>
            )}
          </p>
        </section>
      )}
    </>
  );
}
