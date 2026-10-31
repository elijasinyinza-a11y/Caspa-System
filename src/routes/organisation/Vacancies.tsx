/**
 * Vacancies and handover on screen (slice 9; decisions H1 to H9; prototype approved 30 October 2026).
 * Everything shown comes from repo.structure.vacancies() and handover(), already limited to this viewer.
 */
import { useState } from 'react';
import { useApp } from '../../components/AppContext';
import type { HandoverView, HoldingsView } from '../../data/access/setup';
import { formatDate, formatMoney, formatNumber } from '../../selectors/format';
import { en } from '../../strings/en';
import { btn, card, CheckBox, Chip, download, input, link, primary } from './ui';

const V = en.vacancy;
const count = (n: number, key: string) => {
  const [one, many] = V.counts[key]!;
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
};

/** One plain sentence on what stops while the post is unfilled, from what it holds (H1, section 4). */
export function whatStops(h: HoldingsView): string {
  if (h.state === 'acting') return V.actingStops;
  const out: string[] = [];
  const needs = h.contracts.filter((c) => c.needsSupervisor);
  if (needs.length) {
    const parts = [
      needs.some((c) => c.openReview) && V.stopReview,
      needs.some((c) => c.status === 'draft') && V.stopIssue,
      needs.some((c) => c.unverified > 0) && V.stopVerify,
    ].filter(Boolean) as string[];
    out.push(V.stopsContracts(count(needs.length, 'contractsHave'), en.list(parts)));
  }
  if (h.lines.length) out.push(V.stopsLines(count(h.lines.length, 'linesHave')));
  if (h.owned.length) out.push(V.stopsRecords(count(h.owned.length, 'recordsHave')));
  if (h.checks.length) out.push(V.stopsChecks(count(h.checks.length, 'checksAre')));
  return out.length ? out.join(' ') : V.stopsNothing;
}

const stateLine = (h: HoldingsView) =>
  h.state === 'vacant' ? (
    <><Chip tone="info">{V.vacant}</Chip> {h.vacantSince ? V.vacantSince(formatDate(h.vacantSince)) : V.neverHeld}</>
  ) : (
    <><Chip tone="info">{V.acting}</Chip> {V.actingSince(h.holder!.name, formatDate(h.holder!.since))}</>
  );

function Counts({ h }: { h: HoldingsView }) {
  const c = [
    h.contracts.length && count(h.contracts.length, 'contracts'),
    h.lines.length && count(h.lines.length, 'lines'),
    h.owned.length && count(h.owned.length, 'owned'),
    h.reports.length && count(h.reports.length, 'reports'),
    h.answersFor.length && V.answersFor(en.list(h.answersFor.map((u) => u.name))),
    h.checks.length && count(h.checks.length, 'checks'),
  ].filter(Boolean) as string[];
  return <div className="mt-1 flex flex-wrap gap-1">{c.map((x) => <span key={x} className="rounded-md border border-border bg-cream px-2 py-0.5 text-12">{x}</span>)}</div>;
}

export function Holdings({ h }: { h: HoldingsView }) {
  const { repo } = useApp();
  const terms = repo.settings().termLabels;
  const H = V.holds;
  const none = <p className="text-13 text-muted">{H.none}</p>;
  const sec = (title: string, body: React.ReactNode) => <div className="mt-3"><h3 className="text-14 font-bold text-navy">{title}</h3>{body}</div>;
  const kind = { Goal: terms.goal.singular, Objective: terms.objective.singular, Kpi: terms.kpi.singular, Activity: terms.activity.singular };
  return (
    <div>
      {sec(H.owned, h.owned.length ? <ul className="mt-1 list-disc pl-5 text-14">{h.owned.map((o) => <li key={o.id}>{kind[o.type]} {o.code}: {o.title}{o.mustFix && <> <Chip tone="block">{H.mustFix}</Chip></>}</li>)}</ul> : none)}
      {sec(H.lines, h.lines.length ? (
        <>
          <ul className="mt-1 list-disc pl-5 text-14">{h.lines.map((l) => (
            <li key={l.id}>{l.description}: {l.amount ? formatMoney(l.amount) : H.funded}. {l.funds ? H.funds(l.funds.code, l.funds.title) : <><Chip tone="block">{H.mustFix}</Chip> {H.notLinked}</>}</li>
          ))}</ul>
          <p className="text-12 text-muted">{H.linesNote}</p>
        </>
      ) : none)}
      {sec(H.answersFor, h.answersFor.length ? <p className="text-14">{en.list(h.answersFor.map((u) => u.name))}</p> : none)}
      {sec(H.reports, h.reports.length ? <ul className="mt-1 list-disc pl-5 text-14">{h.reports.map((r) => <li key={r.positionId}>{r.title} ({r.holder ?? V.vacant.toLowerCase()})</li>)}</ul> : none)}
      {sec(H.contracts, h.contracts.length ? (
        h.contracts.every((c) => c.personName !== null) ? (
          <ul className="mt-1 list-disc pl-5 text-14">{h.contracts.map((c) => (
            <li key={c.positionId}>
              {H.contractLine(c.positionTitle, c.personName, V.status[c.status] ?? c.status)}
              {c.openReview && c.reviewDue && `; ${H.reviewOpen(formatDate(c.reviewDue))}`}
              {c.issueDue && `; ${H.issueDue(formatDate(c.issueDue))}`}
              {c.unverified > 0 && `; ${H.unverified(formatNumber(c.unverified))}`}
            </li>
          ))}</ul>
        ) : (
          <p className="text-14">{H.contractsCount(count(h.contracts.length, 'contracts'), formatNumber(h.contracts.filter((c) => c.status === 'signed').length), formatNumber(h.contracts.filter((c) => c.status !== 'signed').length))}</p>
        )
      ) : none)}
      {sec(H.corrective, h.corrective.deficiencies ? <p className="text-14">{H.correctiveLine(`${formatNumber(h.corrective.deficiencies)} ${h.corrective.deficiencies === 1 ? terms.deficiency.singular.toLowerCase() : terms.deficiency.plural.toLowerCase()}`, formatNumber(h.corrective.unaddressed))}</p> : none)}
      {sec(H.checks, h.checks.length ? (
        h.checks.every((c) => c.message !== null)
          ? <ul className="mt-1 space-y-1 text-14">{h.checks.map((c) => <li key={c.key}><Chip tone={c.must ? 'block' : 'advisory'}>{c.must ? H.mustFix : H.worth}</Chip> {c.message}</li>)}</ul>
          : <p className="text-14">{H.checksCount(formatNumber(h.checks.filter((c) => c.must).length), formatNumber(h.checks.filter((c) => !c.must).length))}</p>
      ) : none)}
      {h.dated.length > 0 && sec(H.dated, <ul className="mt-1 list-disc pl-5 text-14">{h.dated.map((d, i) => <li key={i}>{d.label}: {H.due(formatDate(d.due))}</li>)}</ul>)}
    </div>
  );
}

const sheetRows = (rows: HoldingsView[]) => [
  [...V.columns],
  ...rows.map((h) => [
    h.title, h.unitPath.join(' › '), h.state === 'vacant' ? V.vacant : V.acting,
    h.state === 'vacant' ? (h.vacantSince ?? V.neverHeld) : `${h.holder!.name}, ${h.holder!.since}`,
    String(h.contracts.length), String(h.lines.length), String(h.owned.length), String(h.reports.length), String(h.checks.length), whatStops(h),
  ]),
];

/** The "Vacant and acting positions" tab (H1, H3, H4). */
export function VacancyList({ onFill }: { onFill: (positionId: string) => void }) {
  const { repo, navigate } = useApp();
  const v = repo.structure.vacancies();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  if (!v) return null;
  const q = find.trim().toLowerCase();
  const rows = q ? v.rows.filter((h) => `${h.title} ${h.unitPath.join(' ')} ${h.holder?.name ?? ''}`.toLowerCase().includes(q)) : v.rows;
  const admin = repo.viewer.roles.includes('org_admin');
  return (
    <section className={card}>
      <p className="text-14">{v.scope === 'all' ? V.introAll : V.introUnits}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="vac-find" className="sr-only">{V.find}</label>
        <input id="vac-find" type="search" className={`${input} min-w-[200px] flex-1`} placeholder={V.findPlaceholder} value={find} onChange={(e) => setFind(e.target.value)} />
        <button type="button" className={btn} disabled={!v.rows.length} onClick={() => download(V.fileName, [{ name: V.tab, rows: sheetRows(rows), widths: [30, 40, 10, 22, 10, 10, 10, 10, 8, 80] }])}>{V.download}</button>
      </div>
      <p role="status" className="mt-1 text-13 text-muted">{rows.length > 30 ? V.firstThirty : ''}</p>
      {rows.length === 0 && <p className="mt-2 text-14 text-muted">{v.scope === 'all' ? V.none : V.noneUnits}</p>}
      <ul className="mt-2 space-y-2">
        {rows.slice(0, 30).map((h) => {
          const isOpen = open.has(h.positionId);
          return (
            <li key={h.positionId} className="rounded-lg border border-border bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-[1_1_15rem]">
                  <div className="text-16 font-bold text-navy">{h.title}</div>
                  <div className="text-12 text-muted">{h.unitPath.join(' › ')}</div>
                  <div className="mt-1 text-13">{stateLine(h)}</div>
                  <Counts h={h} />
                  <p className="mt-2 text-14"><b>{V.stops}:</b> {whatStops(h)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} aria-expanded={isOpen} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(h.positionId)) n.delete(h.positionId); else n.add(h.positionId); return n; })}>
                    {isOpen ? V.hideHolds : V.showHolds}
                  </button>
                  {h.canHandover && <a className={link} href={`#/organisation/handover/${encodeURIComponent(h.positionId)}`} onClick={(e) => { e.preventDefault(); navigate({ kind: 'org', handover: h.positionId }); }}>{V.handover}</a>}
                  {admin && <button type="button" className={link} onClick={() => onFill(h.positionId)}>{V.fill}</button>}
                </div>
              </div>
              {isOpen && <div className="border-t border-border p-3"><Holdings h={h} /></div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The handover list (H5 to H7): computed now from the records, printed or downloaded, never stored. */
export function HandoverPage({ positionId }: { positionId: string }) {
  const { repo, navigate } = useApp();
  const h = repo.structure.handover(positionId);
  const [note, setNote] = useState<string | null>(null);
  const P = V.handoverPage;
  const back = <p className="print:hidden"><a href="#/organisation" className={link} onClick={(e) => { e.preventDefault(); navigate({ kind: 'org' }); }}>{P.back}</a></p>;
  if (!h) return <>{back}<h1 className="text-28 font-bold text-navy">{V.handover}</h1><p className="mt-2 text-14">{P.notAllowed}</p></>;
  const terms = repo.settings().termLabels;
  const waitWhat = (c: HandoverView['waiting'][number]) => (c.openReview ? P.waitReview : c.status === 'draft' ? P.waitIssue : P.waitVerify);
  const sheet = () => download(P.fileName(h.title), [{
    name: P.sheet, widths: [30, 90],
    rows: [
      [P.title(h.title), h.unitPath.join(' › ')],
      ...h.owned.map((o) => [V.holds.owned, `${o.code} ${o.title}`]),
      ...h.lines.map((l) => [V.holds.lines, `${l.description}: ${l.amount ? formatMoney(l.amount) : V.holds.funded}`]),
      ...h.reports.map((r) => [V.holds.reports, `${r.title} (${r.holder ?? V.vacant.toLowerCase()})`]),
      ...h.contracts.map((c) => [V.holds.contracts, V.holds.contractLine(c.positionTitle, c.personName, V.status[c.status] ?? c.status)]),
      ...h.waiting.map((c) => [P.waiting, P.waitingLine(c.positionTitle, c.personName, waitWhat(c))]),
    ],
  }]);
  void terms;
  return (
    <>
      {back}
      <h1 className="text-28 font-bold text-navy md:text-34">{P.title(h.title)}</h1>
      <p className="mt-1 text-16">
        {h.unitPath.join(' › ')}. {h.holder ? P.held(h.holder.name, h.holder.acting) : P.vacant(h.vacantSince ? formatDate(h.vacantSince) : null)} {P.computed}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button type="button" className={btn} onClick={() => window.print()}>{P.print}</button>
        <button type="button" className={btn} onClick={sheet}>{P.download}</button>
        {h.noteAvailable && (
          <button type="button" className={btn} onClick={() => { void repo.structure.handoverNote(positionId).then(setNote); }}>
            {P.note} <span className="ml-2"><Chip tone="info">{en.vacancy.aiDraft}</Chip></span>
          </button>
        )}
      </div>
      {note && (
        <section className={`${card} mt-4`}>
          <p className="text-12 text-muted"><Chip tone="info">{en.vacancy.aiDraft}</Chip> {P.noteLabel}</p>
          <p className="mt-2 text-14">{note}</p>
        </section>
      )}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={card}>
          <h2 className="text-18 font-bold text-navy">{V.holds.title}</h2>
          <Holdings h={h} />
        </section>
        <div className="space-y-4">
          <section className={card}>
            <h2 className="text-18 font-bold text-navy">{P.leaves}</h2>
            {h.holder ? (
              <>
                <h3 className="mt-3 text-14 font-bold text-navy">{P.roles}</h3>
                {h.rolesLeaving === null ? <p className="text-13 text-muted">{P.rolesHidden}</p>
                  : h.rolesLeaving.length ? <><ul className="mt-1 list-disc pl-5 text-14">{h.rolesLeaving.map((r) => <li key={r}>{en.assignedRole[r]}</li>)}</ul><p className="text-12 text-muted">{P.rolesNote}</p></>
                  : <p className="text-13 text-muted">{V.holds.none}</p>}
                <h3 className="mt-3 text-14 font-bold text-navy">{P.ownContract}</h3>
                <p className="text-14">{h.ownContract ? P.ownContractStatus(V.status[h.ownContract.status] ?? h.ownContract.status) : P.noContract}</p>
              </>
            ) : <p className="mt-1 text-13 text-muted">{P.nobody}</p>}
          </section>
          <section className={card}>
            <h2 className="text-18 font-bold text-navy">{P.waiting}</h2>
            {h.waiting.length
              ? <ul className="mt-1 list-disc pl-5 text-14">{h.waiting.map((c) => <li key={c.positionId}>{P.waitingLine(c.positionTitle, c.personName, waitWhat(c))}</li>)}</ul>
              : <p className="mt-1 text-13 text-muted">{P.nothing}</p>}
          </section>
        </div>
      </div>
    </>
  );
}

/** The holder-change panel in the administrator's dialog (as D6-6): what passes on, or what the vacant post keeps. */
export function HolderChangePanel({ positionId, oldHolder, newHolder }: { positionId: string; oldHolder: string | null; newHolder: string }) {
  const { repo } = useApp();
  const p = repo.structure.holdingsPreview(positionId);
  if (!p) return null;
  const D = V.dialog;
  const what = [p.owned && count(p.owned, 'owned'), p.lines && count(p.lines, 'lines'), p.contracts && count(p.contracts, 'contracts'), p.reports && count(p.reports, 'reports')].filter(Boolean) as string[];
  const list = what.length ? en.list(what) : D.nothing;
  const name = newHolder.trim();
  return (
    <CheckBox tone="complete" title={name === (oldHolder ?? '') ? D.noChange : name ? D.passes : D.keeps}>
      {name !== (oldHolder ?? '') && <>{list}. </>}
      {name && oldHolder && name !== oldHolder && D.rolesStay(oldHolder)}
      {!name && p.needingSupervisor > 0 && D.whileVacant(V.stopsContracts(count(p.needingSupervisor, 'contractsHave'), en.list([V.stopReview, V.stopIssue])).toLowerCase())}
    </CheckBox>
  );
}

export { primary };
