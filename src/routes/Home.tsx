import { useState, type ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import { NeedsYou } from '../components/NeedsYou';
import { ProgressBar } from '../components/Status';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { countFindings, type HomeView } from '../data/access/repository';
import type { FinanceSummary, GoalHealth, HomeKind, HrSummary, MyContract, RatingView, TeamMember } from '../selectors/home';
import { formatDate, formatFinancialYear, formatMoney, formatNumber, formatPercent, formatScore } from '../selectors/format';
import type { NodeRef } from '../selectors/node';
import { en } from '../strings/en';
import { nodeHref } from './router';

type Terms = ReturnType<ReturnType<typeof useApp>['repo']['settings']>['termLabels'];

const card = 'rounded-xl border border-border bg-white p-5';
const link = 'inline-flex min-h-11 items-center text-14 font-semibold text-navy underline decoration-border underline-offset-4 hover:decoration-navy';

function Tile({ label, value, note, onClick }: { label: string; value: string; note?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-13 text-muted">{label}</div>
      <div className="tabular mt-1 text-28 font-bold text-navy">{value}</div>
      {note && <div className="mt-1 text-13 text-muted">{note}</div>}
    </>
  );
  const cls = 'flex h-full w-full flex-col items-start rounded-xl border border-border bg-white p-5 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-control`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className={`mt-6 ${card}`} aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-18 font-bold text-navy">{title}</h2>
        {note && <p className="max-w-[60ch] text-13 text-muted">{note}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A score with its written label. Provisional scores always say so. */
function Score({ r }: { r: RatingView }) {
  if (r.overall === null || !r.label) return <span className="text-14 text-muted">{en.team.notScored}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular text-14 font-semibold text-navy">{en.rating.score(formatScore(r.overall), r.label)}</span>
      <span className="inline-flex items-center rounded-full border border-info-border bg-info-bg px-2 py-0.5 text-12 font-semibold text-info-text">
        {r.provisional ? en.rating.provisional : en.rating.final}
      </span>
    </span>
  );
}

/* ───────── Executive, Strategy office, member ───────── */

function GoalHealthView({ h, rows, terms }: { h: HomeView; rows: GoalHealth[]; terms: Terms }) {
  const { repo, openFindings } = useApp();
  const c = countFindings(repo.findings());
  const funded = rows.reduce((n, g) => n + g.funded, 0);
  const total = rows.reduce((n, g) => n + g.activities, 0);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label={terms.goal.plural} value={formatNumber(rows.length)} note={h.planTitle ?? undefined} />
        <Tile
          label={en.home.funded(terms.activity.plural)}
          value={total ? formatPercent(funded / total) : '—'}
          note={en.home.fundedNote(funded, total, terms.activity.plural, terms.budgetLine.singular)}
        />
        <Tile label={en.home.findings} value={formatNumber(c.open)} note={en.home.findingsNote(c.blocking, c.advisory, c.acknowledged)} onClick={openFindings} />
      </div>
      <Section id="goal-progress" title={en.goalHealth.title(terms.goal.singular)} note={en.goalHealth.note(formatPercent(h.expected))}>
        <ul className="space-y-5">
          {rows.map((g) => (
            <li key={g.ref.id} className="grid items-center gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="min-w-0">
                <a href={nodeHref('goal', g.ref.id)} className={link}>{g.ref.code} {g.ref.title}</a>
                <div className="text-13 text-muted">
                  {[g.perspectiveLabel, g.owner ? en.goalHealth.owner(g.owner) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="min-w-0">
                <ProgressBar share={g.progress.progress} expected={g.progress.expected} status={g.progress.status} label={`${g.ref.code} ${g.ref.title}`} />
                <div className="mt-1 text-13 text-muted">
                  {en.goalHealth.reporting(g.progress.reporting, g.progress.total, terms.objective.plural)} ·{' '}
                  {g.activities ? en.goalHealth.funded(g.funded, g.activities, terms.activity.plural) : en.goalHealth.noActivities(terms.activity.plural)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/* ───────── Finance ───────── */

function FinanceView({ f, terms }: { f: FinanceSummary; terms: Terms }) {
  if (!f.version) return <p className={`${card} text-14 text-text`}>{en.financeHome.noVersion}</p>;
  const lines = (n: number) => en.financeHome.lines(n, terms.budgetLine.singular, terms.budgetLine.plural);
  return (
    <>
      <p className="mb-3 text-14 font-semibold text-navy">{en.financeHome.version(f.version.number, en.financeHome.versionStatus[f.version.status])}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label={en.financeHome.total} value={f.total ? formatMoney(f.total) : '—'} note={f.total ? lines(f.lines) : en.financeHome.totalHidden} />
        <Tile label={en.financeHome.linked(terms.activity.plural)} value={f.linked.amount ? formatMoney(f.linked.amount) : '—'} note={lines(f.linked.lines)} />
        <Tile label={en.financeHome.unlinked(terms.activity.singular)} value={f.unlinked.amount ? formatMoney(f.unlinked.amount) : '—'} note={lines(f.unlinked.lines)} />
      </div>
      {f.bySource && (
        <Section id="by-source" title={en.financeHome.bySource}>
          <dl className="divide-y divide-border">
            {f.bySource.map((x) => (
              <div key={x.source} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-14 text-text">{en.fundingSource[x.source as keyof typeof en.fundingSource]}</dt>
                <dd className="tabular text-14 font-semibold text-navy">{formatMoney(x.amount)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  );
}

/* ───────── HR ───────── */

function HrView({ hr }: { hr: HrSummary }) {
  return (
    <>
      <h2 className="mb-3 text-18 font-bold text-navy">{en.hrHome.contracts}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label={en.hrHome.signed} value={formatNumber(hr.contracts.signed)} />
        <Tile label={en.hrHome.issued} value={formatNumber(hr.contracts.issued)} />
        <Tile label={en.hrHome.draft} value={formatNumber(hr.contracts.draft)} />
        <Tile label={en.hrHome.none} value={formatNumber(hr.contracts.none)} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Tile label={en.hrHome.reviews} value={formatNumber(hr.reviews.open + hr.reviews.selfSubmitted)} note={en.hrHome.reviewsNote(hr.reviews.open, hr.reviews.selfSubmitted)} />
      </div>
      <Section id="scored" title={en.hrHome.scored} note={en.rating.provisionalNote}>
        {hr.scored.length === 0 ? (
          <p className="text-14 text-text">{en.hrHome.scoredNone}</p>
        ) : (
          <ul className="divide-y divide-border">
            {hr.scored.map((x) => (
              <li key={x.contractId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-14 font-semibold text-navy">{x.person}</div>
                  <div className="text-13 text-muted">{x.position}</div>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Score r={x.rating} />
                  {x.rating.flags > 0 && <span className="text-13 text-advisory-text">{en.hrHome.flags(x.rating.flags)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ───────── Supervisor ───────── */

function TeamView({ rows, terms }: { rows: TeamMember[]; terms: Terms }) {
  return (
    <>
      <section className={card} aria-labelledby="team">
        <h2 id="team" className="text-18 font-bold text-navy">{en.team.title}</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-14 text-text">{en.team.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((m) => (
              <li key={m.positionId} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
                <div className="min-w-0">
                  <div className="text-14 font-semibold text-navy">{m.holder?.person ?? en.team.vacant}</div>
                  <div className="text-13 text-muted">{m.position}</div>
                </div>
                <div className="text-14 text-text">
                  {m.contract ? (
                    <>
                      {en.contractStatus[m.contract.status]} · {en.team.objectives(m.contract.objectives, terms.contractObjective.singular, terms.contractObjective.plural)}
                      <div className="text-13 text-muted">{m.review ? en.team.review[m.review.status] : en.team.noReview}</div>
                    </>
                  ) : (
                    en.team.noContract
                  )}
                </div>
                <div className="flex flex-col items-start gap-1">
                  {m.rating && <Score r={m.rating} />}
                  {m.rating && m.rating.flags > 0 && <span className="text-13 text-advisory-text">{en.team.flags(m.rating.flags)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6 rounded-xl border border-dashed border-control bg-white p-5" aria-labelledby="reserved">
        <h2 id="reserved" className="text-18 font-bold text-navy">{en.team.reserved}</h2>
        <p className="mt-1 text-13 text-muted">{en.team.reservedNote}</p>
      </section>
    </>
  );
}

/* ───────── Employee ───────── */

function Lineage({ refs, terms }: { refs: NodeRef[]; terms: Terms }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-0 text-13" aria-label={en.node.partOf}>
      {refs.map((r, i) => (
        <li key={r.id} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true" className="text-muted">›</span>}
          <a href={nodeHref(r.kind, r.id, 'performance')} className="inline-flex min-h-11 items-center text-navy underline decoration-border underline-offset-4 hover:decoration-navy">
            <span className="sr-only">{terms[r.kind].singular} </span>
            {r.code} {r.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

function basisText(basis: string): string {
  switch (basis) {
    case 'no_quantity': return en.rating.noQuantity;
    case 'not_assessable': return en.rating.notAssessable;
    case 'direction_unconfirmed': return en.rating.directionUnconfirmed;
    default: return en.rating.notVerified;
  }
}

function ContractView({ c, terms }: { c: MyContract; terms: Terms }) {
  return (
    <section className={card} aria-labelledby={`contract-${c.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`contract-${c.id}`} className="text-18 font-bold text-navy">{c.position}</h2>
        <p className="text-13 text-muted">
          {c.signedOn ? en.rating.signedOn(formatDate(c.signedOn)) : en.contractStatus[c.status]}
          {c.review ? ` · ${en.rating.review(en.needsYou.reviewKind[c.review.kind], en.rating.reviewStatus[c.review.status])}` : ''}
        </p>
      </div>
      {c.rating && (
        <div className="mt-4 rounded-lg border border-border bg-cream p-4">
          <div className="text-13 text-muted">{en.rating.overall}</div>
          <div className="mt-1"><Score r={c.rating} /></div>
          {c.rating.overall !== null && <p className="mt-2 text-13 text-muted">{en.rating.basis(c.rating.scoredWeightPct, c.rating.totalWeightPct)}</p>}
          {c.rating.floorApplied && <p className="mt-1 text-13 text-text">{en.rating.floorApplied}</p>}
          {c.rating.provisional && <p className="mt-1 text-13 text-muted">{en.rating.provisionalNote}</p>}
        </div>
      )}
      <ul className="mt-4 space-y-4">
        {c.objectives.map((o) => (
          <li key={o.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-16 font-semibold text-navy">{o.title}</p>
              <span className="tabular text-13 text-muted">{en.rating.weight}: {formatNumber(o.weightPct)}%</span>
            </div>
            <div className="mt-1 text-13 text-muted">{en.rating.serves}</div>
            <Lineage refs={o.lineage} terms={terms} />
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label={en.node.personalTarget}>{o.target ? `${formatNumber(o.target.value)} ${o.target.unit}` : en.node.noTarget}</Field>
              <Field label={en.node.done}>{o.rating?.done != null ? `${formatNumber(o.rating.done)}${o.target ? ` ${o.target.unit}` : ''}` : en.node.notVerified}</Field>
              <Field label={en.rating.achievement}>{o.rating?.achievement != null ? formatPercent(o.rating.achievement) : '—'}</Field>
              <Field label={c.rating?.provisional === false ? en.rating.final : en.rating.objectiveScore}>{o.rating?.score ? `${o.rating.score}, ${o.rating.label ?? ''}` : o.rating ? basisText(o.rating.basis) : '—'}</Field>
            </dl>
            {o.rating?.adjustment && <p className="mt-2 text-13 text-text">{en.rating.adjusted(o.rating.adjustment.delta, o.rating.adjustment.reason)}</p>}
          </li>
        ))}
      </ul>
      {!c.rating && <p className="mt-3 text-13 text-muted">{en.rating.hidden}</p>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-12 text-muted">{label}</dt>
      <dd className="tabular text-14 text-text">{children}</dd>
    </div>
  );
}

/** For the Executive: who confirmed the organisation's structure, and when (D7-9). Information, not a "Needs you" item. */
function StructureNotice() {
  const { repo, navigate } = useApp();
  const c = repo.structureConfirmed();
  return (
    <section aria-labelledby="org-info" className={`${card} mt-6`}>
      <h2 id="org-info" className="text-18 font-bold text-navy">{en.setup.home.title}</h2>
      <p className="mt-1 text-14 text-text">
        {c ? en.setup.home.confirmed(c.by, formatDate(c.on)) : en.setup.home.notYet}{' '}
        <a href="#/organisation" onClick={(e) => { e.preventDefault(); navigate({ kind: 'org' }); }} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">{en.setup.home.see}</a>
      </p>
    </section>
  );
}

/* ───────── The home ───────── */

/** Role homes (Build Brief, screen 4): "Needs you" first, then the role's status view. Every figure is computed. */
export function Home() {
  const { repo } = useApp();
  const h = repo.home();
  const terms = repo.settings().termLabels;
  const [picked, setPicked] = useState<HomeKind | null>(null);
  const current: HomeKind = picked && h.homes.includes(picked) ? picked : h.homes[0]!;
  const fy = formatFinancialYear(h.financialYear, repo.settings().financialYearStartMonth);

  const view = (() => {
    switch (current) {
      case 'executive':
      case 'strategy_office':
      case 'member':
        return h.goalHealth && <GoalHealthView h={h} rows={h.goalHealth} terms={terms} />;
      case 'finance':
        return h.finance && <FinanceView f={h.finance} terms={terms} />;
      case 'hr':
        return h.hr && <HrView hr={h.hr} />;
      case 'supervisor':
        return h.team && <TeamView rows={h.team} terms={terms} />;
      case 'employee':
        return h.contracts && h.contracts.length > 0
          ? <div className="space-y-6">{h.contracts.map((c) => <ContractView key={c.id} c={c} terms={terms} />)}</div>
          : <p className={`${card} text-14 text-text`}>{en.rating.noContract}</p>;
    }
  })();

  return (
    <>
      <WorkspaceHeader w="home" title={en.homes.title[current](fy)} intro={en.homes.intro[current]} />
      {h.homes.length > 1 && (
        <div role="group" aria-label={en.homes.viewsLabel} className="-mt-2 mb-6 flex flex-wrap gap-2">
          {h.homes.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === current}
              onClick={() => setPicked(k)}
              className={`min-h-11 rounded-lg px-4 text-14 font-semibold ${k === current ? 'bg-navy text-white' : 'border border-control bg-white text-navy hover:bg-cream'}`}
            >
              {en.homes.kind[k]}
            </button>
          ))}
        </div>
      )}
      <NeedsYou items={h.needsYou} />
      {view}
      {repo.viewer.roles.includes('executive') && <StructureNotice />}
    </>
  );
}
