/**
 * The plan document (BUILD-BRIEF section 35, D15-1 to D15-6): an editing panel on the Formation tab, and a print
 * version at #/plan-document. The narrative is stored; everything else is shown live from the records, in the order
 * set by PLAN_DOCUMENT_LAYOUT. Every figure comes from the selector; nothing is computed here.
 */
import { useState, type ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import type { PlanDocumentPage, PlanDocumentResult, PlanDocumentSectionView } from '../data/access/plan-document';
import { formatDate, formatNumber } from '../selectors/format';
import { holdsFigure } from '../selectors/plan-document';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, link, plural, primary } from './organisation/ui';
import { hrefFor } from './router';

const D = en.planDocument;

/** On the Formation tab: draft, edit, accept and finalise. */
export function PlanDocumentPanel({ d }: { d: PlanDocumentPage }) {
  const pd = useApp().repo.planDocument;
  const [error, setError] = useState<string | null>(null);
  const act = (r: PlanDocumentResult | Promise<PlanDocumentResult>) =>
    void Promise.resolve(r).then((x) => setError(x.ok ? null : D.errors[x.error] ?? D.errors.not_allowed!));
  const doc = d.document;
  return (
    <section className={card} aria-labelledby="plan-doc-title">
      <h2 id="plan-doc-title" className="text-18 font-bold text-navy">{D.title}</h2>
      <p className="mt-1 text-14">{D.intro}</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-block-border bg-block-bg px-4 py-3 text-14 text-block-text">{error}</p>}
      {!doc && d.hidden && <p className="mt-3 text-14 text-muted">{D.hidden}</p>}
      {!doc && !d.hidden && <p className="mt-3 text-14 text-muted">{D.noDocument}</p>}
      {d.canDraft && d.aiEnabled && <div className="mt-3"><button type="button" className={primary} onClick={() => act(pd.draft())}>{D.draft}</button></div>}
      {doc && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone={doc.status === 'final' ? 'complete' : 'info'}>{D.status[doc.status]}</Chip>
            {doc.finalised && <span className="text-13 text-muted">{D.finalised(doc.finalised.by, formatDate(doc.finalised.on))}</span>}
            <span className="text-13 text-muted">{D.revision(formatNumber(doc.basedOnRevision))}</span>
          </div>
          <p className="mt-2 text-14"><a className={link} href={hrefFor({ kind: 'planDocument' })}>{D.print}</a> <span className="text-13 text-muted">{D.printNote}</span></p>
          <ul className="mt-4 flex flex-col gap-3">{doc.sections.map((x) => <SectionEditor key={x.id} x={x} names={d.names} act={act} />)}</ul>
          {doc.canFinalise && (
            <div className="mt-4">
              <p className="text-13 text-muted">{D.finaliseNote}</p>
              <button type="button" className={`${primary} mt-2`} disabled={doc.sections.some((x) => x.state !== 'accepted')} onClick={() => act(pd.finalise())}>{D.finalise}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SectionEditor({ x, names, act }: { x: PlanDocumentSectionView; names: string[]; act: (r: PlanDocumentResult) => void }) {
  const pd = useApp().repo.planDocument;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(x.text);
  const id = `sec-${x.id}`;
  const chip = x.state === 'accepted' ? <Chip tone="complete">{D.status.accepted}</Chip> : <Chip tone="advisory">{x.state === 'ai_draft' ? D.status.aiDraft : D.status.edited}</Chip>;
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-16 font-bold text-navy">{x.heading}</h3>{chip}</div>
      {editing ? (
        <div className="mt-2">
          <label htmlFor={id} className={label}>{D.sectionText}</label>
          <textarea id={id} rows={5} className={`${input} mt-1`} value={text} onChange={(e) => setText(e.target.value)} />
          {holdsFigure(text, names) && <p className="mt-1 text-13 text-muted">{D.figuresNote}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { act(pd.editSection(x.id, text)); setEditing(false); }}>{D.save}</button>
            <button type="button" className={btn} onClick={() => { setText(x.text); setEditing(false); }}>{D.cancel}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-line text-14">{x.text}</p>
          {x.figuresNote && <p className="mt-1 text-13 text-muted">{D.figuresNote}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {x.canAccept && <button type="button" className={primary} onClick={() => act(pd.acceptSection(x.id))}>{D.accept}</button>}
            {x.canEdit && <button type="button" className={btn} onClick={() => setEditing(true)}>{D.edit}</button>}
          </div>
        </>
      )}
    </li>
  );
}

/** #/plan-document: the document as it prints, in the layout's order. */
export function PlanDocumentPrint() {
  const d = useApp().repo.planDocument.page();
  if (!d) return <p className="text-14 text-muted">{D.notYet}</p>;
  if (!d.document) return <p className="text-14 text-muted">{d.hidden ? D.hidden : D.noDocument}</p>;
  const doc = d.document;
  const narrative = (goalId: string | null) => doc.sections.find((x) => (goalId ? x.goalId === goalId : x.kind === 'executive_summary'));
  const c = d.content;
  const parts: Record<string, ReactNode> = {
    vision: (
      <section key="vision" className="mt-6">
        <h2 className="text-22 font-bold text-navy">{D.heading.vision}</h2>
        <p className="mt-1 text-16">{c.vision}</p>
        {c.mission && <><h2 className="mt-4 text-22 font-bold text-navy">{D.heading.mission}</h2><p className="mt-1 text-16">{c.mission}</p></>}
      </section>
    ),
    summary: (
      <section key="summary" className="mt-6">
        <h2 className="text-22 font-bold text-navy">{narrative(null)?.heading ?? D.heading.summary}</h2>
        <p className="mt-1 whitespace-pre-line text-14">{narrative(null)?.text}</p>
      </section>
    ),
    where: (
      <section key="where" className="mt-6">
        <h2 className="text-22 font-bold text-navy">{D.heading.where}</h2>
        <p className="mt-1 text-13 text-muted">{D.whereIntro}</p>
        {c.where.map((b) => (
          <div key={b.band} className="mt-3">
            <h3 className="text-16 font-bold text-navy">{b.band}</h3>
            {b.sections.filter((x) => x.count > 0).map((x) => (
              <div key={x.name} className="mt-1">
                <h4 className="text-14 font-semibold">{x.name}</h4>
                {x.cards ? <ul className="ml-5 list-disc text-14">{x.cards.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-13 text-muted">{D.whereHidden(plural(x.count, 'card'))}</p>}
              </div>
            ))}
          </div>
        ))}
      </section>
    ),
    goals: (
      <section key="goals" className="mt-6">
        <h2 className="text-22 font-bold text-navy">{D.heading.goals}</h2>
        {c.goals.map((g) => (
          <article key={g.id} className="mt-4 break-inside-avoid-page">
            <h3 className="text-18 font-bold text-navy">{g.title} <span className="text-13 font-normal text-muted">{g.code}</span></h3>
            {narrative(g.id) && <p className="mt-1 whitespace-pre-line text-14">{narrative(g.id)!.text}</p>}
            {g.objectives.map((o) => (
              <div key={o.code} className="mt-3">
                <h4 className="text-14 font-bold">{o.title} <span className="text-12 font-normal text-muted">{o.code}</span>{o.owner && <span className="text-13 font-normal text-muted"> · {o.owner}</span>}</h4>
                {o.kpis.length === 0 ? <p className="text-13 text-muted">{D.table.noKpi}</p> : (
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full text-13 tabular-nums">
                      <thead><tr className="text-left text-muted">
                        <th scope="col" className="py-1 pr-3 font-semibold">{D.table.kpi}</th><th scope="col" className="py-1 pr-3 font-semibold">{D.table.baseline}</th>
                        {c.years.map((y) => <th key={y} scope="col" className="py-1 pr-3 font-semibold">{y}</th>)}<th scope="col" className="py-1 font-semibold">{D.table.owner}</th>
                      </tr></thead>
                      <tbody>{o.kpis.map((k) => {
                        // A percentage reads in each cell; any other unit is named once, beside the KPI.
                        const pct = k.unit === '%';
                        const n = (v: number | null) => (v === null ? D.table.none : `${formatNumber(v)}${pct ? '%' : ''}`);
                        return (
                          <tr key={k.code} className="border-t border-border">
                            <th scope="row" className="py-1 pr-3 text-left font-normal">{k.name}{!pct && k.unit && <span className="text-muted"> ({k.unit})</span>} <span className="text-12 text-muted">{k.code}</span></th>
                            <td className="py-1 pr-3">{n(k.baseline)}</td>
                            {k.targets.map((t, i) => <td key={c.years[i]} className="py-1 pr-3">{n(t)}</td>)}
                            <td className="py-1">{k.owner ?? D.table.none}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </article>
        ))}
      </section>
    ),
    approval: d.approval && (
      <section key="approval" className="mt-6">
        <h2 className="text-22 font-bold text-navy">{D.heading.approval}</h2>
        <p className="mt-1 text-14">{D.confirmedBy(d.approval.confirmedBy, formatDate(d.approval.confirmedOn))}</p>
        {d.approval.boardRef && d.approval.boardOn && <p className="text-14">{D.approvedBoard(d.approval.boardRef, formatDate(d.approval.boardOn))}</p>}
      </section>
    ),
  };
  return (
    <article className="rounded-lg bg-white p-6 md:p-10" aria-labelledby="plan-doc-heading">
      <p className="no-print mb-4 text-13 text-muted">{D.printNote}</p>
      <h1 id="plan-doc-heading" className="text-34 font-bold text-navy">{d.planTitle}</h1>
      {doc.status === 'draft' && <p className="mt-1"><Chip tone="advisory">{D.status.draft}</Chip></p>}
      {d.layout.map((part) => parts[part])}
    </article>
  );
}
