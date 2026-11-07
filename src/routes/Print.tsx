/**
 * Printed contract and printed assessment (v0.23.0). A4 landscape, laid out in tables, as approved by Elijah on
 * 6 November 2026 (samples: caspa-printed-contract-sample.html, caspa-printed-assessment-sample.html). Everything comes
 * from repo.printouts, which uses the same records and rules as the screens. The record in CASPA™ is authoritative.
 */
import type { ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import type { PrintContract, PrintHeader, PrintReview } from '../data/access/printouts';
import { formatDate, formatDateTime, formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { card, link } from './organisation/ui';
import { hrefFor } from './router';

const T = en.print;
const th = 'border border-border bg-cream px-2 py-1 text-left text-12 font-semibold text-navy';
const td = 'border border-border px-2 py-1 align-top text-12';
const k = `${td} w-[14%] font-semibold text-muted`;
const v = `${td} font-semibold text-navy`;

function Section({ title, cols, children }: { title: string; cols: number; children: ReactNode }) {
  return (
    <table className="tabular w-full border-collapse break-inside-avoid border border-navy">
      <thead><tr><th colSpan={cols} scope="colgroup" className="bg-navy px-2 py-1 text-left text-13 font-semibold text-white" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>{title}</th></tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Page({ back, children }: { back: string; children: ReactNode }) {
  return (
    <article className="space-y-3 rounded-xl bg-white p-4 md:p-8">
      {/* Landscape for these two printouts only. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>
      <p className="no-print text-13 text-muted">{T.hint} <button type="button" className={link} onClick={() => window.print()}>{T.print}</button> · <a className={link} href={back}>{T.back}</a></p>
      <div className="overflow-x-auto space-y-3">{children}</div>
    </article>
  );
}

function Parties({ h, fy, title, status, ok, extra }: { h: PrintHeader; fy: string; title: string; status: string; ok: boolean; extra: [string, string][] }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-navy pb-2">
        <div><p className="text-16 font-bold text-navy">{h.organisation}</p><h1 className="text-22 font-bold text-navy">{title}</h1></div>
        <span className={`rounded-md border px-2 py-1 text-12 font-semibold ${ok ? 'border-complete-border bg-complete-bg text-complete-text' : 'border-border bg-info-bg text-navy'}`}>{status}</span>
      </div>
      <Section title={T.details} cols={6}>
        <tr><td className={k}>{T.reference}</td><td className={v}>{h.reference}{h.version > 1 ? `, ${T.version(h.version)}` : ''}</td><td className={k}>{T.fy}</td><td className={v}>{fy}</td><td className={k}>{T.period}</td><td className={v}>{T.range(formatDate(h.periodStart), formatDate(h.periodEnd))}</td></tr>
        {extra.length > 0 && <tr>{extra.slice(0, 3).flatMap(([a, b]) => [<td key={`${a}k`} className={k}>{a}</td>, <td key={`${a}v`} className={v}>{b}</td>])}</tr>}
      </Section>
      <Section title={T.parties} cols={6}>
        <tr><td className={k}>{T.employee}</td><td className={v}>{h.employee.name}</td><td className={k}>{T.number}</td><td className={v}>{h.employee.number ?? '—'}</td><td className={k}>{T.position}</td><td className={v}>{h.employee.position}</td></tr>
        <tr><td className={k}>{T.unit}</td><td className={v}>{h.employee.unit}</td><td className={k}>{T.appointed}</td><td className={v}>{h.employee.appointed ? formatDate(h.employee.appointed) : '—'}</td><td className={k}>{T.supervisor}</td><td className={v}>{T.who(h.supervisor.name || '—', h.supervisor.position)}</td></tr>
        <tr><td className={k}>{T.reviewer}</td><td className={v} colSpan={5}>{h.reviewer ? `${T.who(h.reviewer.name || '—', h.reviewer.position)} ${T.whenRequired}` : '—'}</td></tr>
        <tr><td className={k}>{T.madeUp}</td><td className={v} colSpan={5}>{h.attributesPct > 0 ? T.split(h.targetsPct, h.attributesPct) : T.targetsOnly}</td></tr>
      </Section>
    </>
  );
}

function scale(h: PrintHeader) {
  const pct = (x: number | null) => (x === null ? '' : `${Math.round(x * 1000) / 10}%`);
  return h.bands.map((b, i) => (b.min === null ? T.scaleLast(b.score, b.label, pct(h.bands[i - 1]?.min ?? null)) : T.scaleItem(b.score, b.label, pct(b.min)))).join('; ');
}

export function PrintPage({ doc, id }: { doc: 'contract' | 'review'; id: string }) {
  const { repo } = useApp();
  if (doc === 'contract') {
    const p = repo.printouts.contract(id);
    return p ? <ContractPrint p={p} /> : <div className={card}><p className="text-14 text-muted">{T.notAvailable}</p></div>;
  }
  const p = repo.printouts.review(id);
  return p ? <ReviewPrint p={p} /> : <div className={card}><p className="text-14 text-muted">{T.notAvailable}</p></div>;
}

function ContractPrint({ p }: { p: PrintContract }) {
  const tz = p.timeZone;
  const fy = formatFinancialYear(p.financialYear, p.startMonth);
  const periods = p.objectives[0]?.periodTargets.map((x) => x.label) ?? [];
  const signed = p.status === 'signed';
  return (
    <Page back={hrefFor({ kind: 'contracts', contractId: p.reference })}>
      <Parties h={p} fy={fy} title={T.contractTitle(fy)} status={signed ? T.signedStatus : T.notSigned} ok={signed} extra={[[T.signedVersion, p.signedVersionOn ? formatDate(p.signedVersionOn) : '—'], [T.printed, formatDate(p.printedOn)], [T.scoring, p.methodText]]} />
      <Section title={T.targets(p.targetsPct)} cols={7 + periods.length}>
        <tr><th scope="col" className={th}>{T.no}</th><th scope="col" className={th}>{T.objective}</th><th scope="col" className={th}>{T.source}</th><th scope="col" className={th}>{T.chain}</th><th scope="col" className={th}>{T.mov}</th><th scope="col" className={`${th} text-right`}>{T.fullYear}</th>{periods.map((x) => <th key={x} scope="col" className={`${th} text-right`}>{T.periodCol(x)}</th>)}<th scope="col" className={`${th} text-right`}>{T.weight}</th></tr>
        {p.objectives.map((o, i) => (
          <tr key={i}>
            <td className={td}>{i + 1}</td><td className={`${td} font-semibold text-navy`}>{o.title}</td><td className={td}>{o.source}{o.level ? ` (${o.level})` : ''}</td><td className={td}>{o.chain || '—'}</td><td className={td}>{o.mov ?? '—'}</td>
            <td className={`${td} text-right`}>{o.fullYear === null ? '—' : `${formatNumber(o.fullYear)} ${o.unit}`}</td>
            {o.periodTargets.map((x, j) => <td key={j} className={`${td} text-right`}>{x.value === null ? '—' : `${formatNumber(x.value)} ${o.unit}`}</td>)}
            <td className={`${td} text-right font-semibold`}>{o.weight}%</td>
          </tr>
        ))}
        <tr><td className={`${td} text-right font-bold text-navy`} colSpan={6 + periods.length}>{T.totalWeight}</td><td className={`${td} text-right font-bold text-navy`}>{p.objectives.reduce((n, o) => n + o.weight, 0)}%</td></tr>
        <tr><td className={td} colSpan={7 + periods.length}><b>{T.scaleTitle}</b> {scale(p)}</td></tr>
      </Section>
      {p.attributes.length > 0 && (
        <Section title={T.attributesTitle(p.attributesPct)} cols={3}>
          <tr><th scope="col" className={th}>{T.no}</th><th scope="col" className={th}>{T.attribute}</th><th scope="col" className={th}>{T.measures}</th></tr>
          {p.attributes.map((a, i) => <tr key={i}><td className={td}>{i + 1}</td><td className={`${td} font-semibold text-navy`}>{a.name}</td><td className={td}>{a.measures}</td></tr>)}
        </Section>
      )}
      {p.employeeNote && <Section title={T.employeeNote} cols={1}><tr><td className={td}>{p.employeeNote}</td></tr></Section>}
      <Section title={T.signatures} cols={5}>
        <tr><th scope="col" className={th}>{T.party}</th><th scope="col" className={th}>{T.nameAndPosition}</th><th scope="col" className={th}>{T.inCaspa}</th><th scope="col" className={`${th} w-1/4`}>{T.signature}</th><th scope="col" className={`${th} w-[14%]`}>{T.date}</th></tr>
        <tr><td className={v}>{T.employee}</td><td className={td}>{T.who(p.employee.name, p.employee.position)}</td><td className={td}>{p.signedByEmployee ? formatDateTime(p.signedByEmployee, tz) : T.notYetSigned}</td><td className={`${td} h-11`} /><td className={td} /></tr>
        <tr><td className={v}>{T.supervisor}</td><td className={td}>{T.who(p.supervisor.name, p.supervisor.position)}</td><td className={td}>{p.signedBySupervisor ? formatDateTime(p.signedBySupervisor, tz) : T.notYetSigned}</td><td className={`${td} h-11`} /><td className={td} /></tr>
      </Section>
      <p className="text-12 text-muted">{T.contractFooter}</p>
    </Page>
  );
}

function ReviewPrint({ p }: { p: PrintReview }) {
  const fy = formatFinancialYear(p.financialYear, p.startMonth);
  const r = p.review;
  const points = r.method === 'weighted_points';
  const kind = en.reviews.kind[r.kind] ?? r.kind;
  const f2 = (x: number | null) => (x === null ? '—' : x.toFixed(2));
  const pc = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
  const fig = (x: number | null, unit: string) => (x === null ? '—' : `${formatNumber(x)} ${unit}`);
  const a = r.attributes;
  const tPart = r.targetsPart;
  return (
    <Page back={hrefFor({ kind: 'reviews', reviewId: r.id })}>
      <Parties h={p} fy={fy} title={T.reviewTitle(kind, fy)} status={p.final ? T.final : T.provisional} ok={p.final} extra={[[T.review, T.range(formatDate(p.periodStart), formatDate(p.reviewEnd))], [T.scoring, p.methodText], [T.printed, formatDate(p.printedOn)]]} />
      <Section title={T.targets(p.targetsPct)} cols={points ? 10 : 11}>
        <tr><th scope="col" className={th}>{T.no}</th><th scope="col" className={th}>{T.objective}</th><th scope="col" className={th}>{T.mov}</th><th scope="col" className={`${th} text-right`}>{T.fullYear}</th><th scope="col" className={`${th} text-right`}>{T.periodTarget}</th><th scope="col" className={`${th} text-right`}>{T.weight}</th><th scope="col" className={`${th} text-right`}>{T.achieved}</th><th scope="col" className={`${th} text-right`}>{T.achievement}</th>
          {points ? <><th scope="col" className={`${th} text-right`}>{T.selfScore}</th><th scope="col" className={`${th} text-right`}>{T.pointsEarned}</th></> : <><th scope="col" className={th}>{T.band}</th><th scope="col" className={th}>{T.adjustment}</th><th scope="col" className={`${th} text-right`}>{T.weighted}</th></>}</tr>
        {r.objectives.map((o, i) => (
          <tr key={o.id}>
            <td className={td}>{i + 1}</td><td className={`${td} font-semibold text-navy`}>{o.title}</td><td className={td}>{o.meansOfVerification ?? '—'}</td>
            <td className={`${td} text-right`}>{fig(o.fullYearTarget, o.unit)}</td><td className={`${td} text-right font-semibold`}>{fig(o.target, o.unit)}</td><td className={`${td} text-right font-semibold`}>{o.weightPct}%</td>
            <td className={`${td} text-right font-semibold`}>{o.cantAssess?.accepted ? T.notAssessed : fig(o.done, o.unit)}</td><td className={`${td} text-right`}>{pc(o.achievement)}</td>
            {points ? <><td className={`${td} text-right`}>{f2(o.selfPoints)}</td><td className={`${td} text-right font-semibold`}>{f2(o.points)}</td></>
              : <><td className={td}>{o.score === null ? '—' : `${o.bandScore} ${o.label ?? ''}`}</td><td className={td}>{o.adjustment ? `${o.adjustment.delta > 0 ? '+1' : '−1'}: ${o.adjustment.reason}` : T.none}</td><td className={`${td} text-right font-semibold`}>{o.score === null ? '—' : f2((o.score * o.weightPct) / 100)}</td></>}
          </tr>
        ))}
        <tr><td className={`${td} text-right font-bold text-navy`} colSpan={points ? 9 : 10}>{points ? T.targetsTotalPoints : T.targetsTotalScore}</td><td className={`${td} text-right font-bold text-navy`}>{points ? `${f2(tPart)}%` : f2(tPart)}</td></tr>
        <tr><td className={td} colSpan={points ? 10 : 11}>{points ? T.pointsNote : T.bandsNote} {T.verifiedOnly}</td></tr>
      </Section>
      {a.enabled && (
        <Section title={T.attributesTitle(a.weightPct)} cols={5}>
          <tr><th scope="col" className={th}>{T.no}</th><th scope="col" className={th}>{T.attribute}</th><th scope="col" className={`${th} text-center`}>{T.selfScore}</th><th scope="col" className={th}>{T.supervisorScore}</th><th scope="col" className={th}>{T.comment}</th></tr>
          {a.lines.map((l, i) => <tr key={l.id}><td className={td}>{i + 1}</td><td className={`${td} font-semibold text-navy`}>{l.name}</td><td className={`${td} text-center`}>{l.selfScore ?? '—'}</td><td className={`${td} font-semibold`}>{l.score === null ? '—' : `${l.score} ${l.scoreLabel ?? ''}`}</td><td className={td}>{l.justification || '—'}</td></tr>)}
          <tr><td className={`${td} text-right font-bold text-navy`} colSpan={3}>{T.attrTotal(a.sum, a.max)}</td><td className={`${td} font-bold text-navy`} colSpan={2}>{a.percent === null ? '—' : `${a.percent.toFixed(1)}%`}</td></tr>
        </Section>
      )}
      <Section title={T.overall} cols={6}>
        <tr><th scope="col" className={th}>{T.category}</th><th scope="col" className={`${th} text-right`}>{T.result}</th><th scope="col" className={`${th} text-right`}>{T.share}</th><th scope="col" className={`${th} text-right`} colSpan={3}>{T.weightedResult}</th></tr>
        <tr><td className={v}>{T.targetsRow}</td><td className={`${td} text-right`}>{points ? `${f2(tPart)}%` : `${f2(tPart)} / 5`}</td><td className={`${td} text-right`}>{p.targetsPct}%</td><td className={`${td} text-right`} colSpan={3}>{tPart === null ? '—' : points ? `${((tPart * p.targetsPct) / 100).toFixed(2)}%` : ((tPart * p.targetsPct) / 100).toFixed(2)}</td></tr>
        {a.enabled && <tr><td className={v}>{T.attributesRow}</td><td className={`${td} text-right`}>{points ? `${a.percent === null ? '—' : a.percent.toFixed(1)}%` : a.percent === null ? '—' : `${((a.percent / 100) * 5).toFixed(2)} / 5`}</td><td className={`${td} text-right`}>{a.weightPct}%</td><td className={`${td} text-right`} colSpan={3}>{a.percent === null ? '—' : points ? `${((a.percent * a.weightPct) / 100).toFixed(2)}%` : (((a.percent / 100) * 5 * a.weightPct) / 100).toFixed(2)}</td></tr>}
        <tr><td className={`${td} text-right font-bold text-navy`} colSpan={3}>{T.totalWeighted}</td><td className={`${td} text-right text-16 font-bold text-navy`} colSpan={3}>{r.overall ? r.overall.display : '—'}</td></tr>
        {!points && <tr><td className={`${td} text-right font-bold text-navy`} colSpan={3}>{T.asPercent}</td><td className={`${td} text-right font-bold text-navy`} colSpan={3}>{r.overall?.percent == null ? '—' : `${r.overall.percent.toFixed(1)}%`}</td></tr>}
        <tr><td className={`${td} text-right font-bold text-navy`} colSpan={3}>{T.rating}</td><td className={`${td} text-right text-16 font-bold text-navy`} colSpan={3}>{r.overall ? r.overall.label : '—'}</td></tr>
        <tr><td className={td} colSpan={6}><b>{T.scaleTitle}</b> {scale(p)}</td></tr>
      </Section>
      <Section title={T.comments} cols={5}>
        <tr><th scope="col" className={th}>{T.by}</th><th scope="col" className={th}>{T.comment}</th><th scope="col" className={th}>{T.inCaspa}</th><th scope="col" className={`${th} w-1/5`}>{T.signature}</th><th scope="col" className={`${th} w-[10%]`}>{T.date}</th></tr>
        <tr><td className={v}>{T.selfAssessment}</td><td className={td}>{r.self.text || '—'}</td><td className={td}>{r.self.submitted ? T.sent : '—'}</td><td className={`${td} h-11`} rowSpan={2} /><td className={td} rowSpan={2} /></tr>
        <tr><td className={v}>{T.acknowledgement}</td><td className={td}>{r.acknowledgement ? (r.acknowledgement.disagreement ? T.disagreed(r.acknowledgement.disagreement) : T.noDisagreement) : T.notYet}</td><td className={td}>{r.acknowledgement ? T.done : '—'}</td></tr>
        <tr><td className={v}>{T.supervisorAssessment}</td><td className={td}>{r.assessment || '—'}</td><td className={td}>{r.assessment ? T.done : '—'}</td><td className={`${td} h-11`} rowSpan={3} /><td className={td} rowSpan={3} /></tr>
        <tr><td className={v}>{T.contributions}</td><td className={td} colSpan={2}>{r.contributions ?? '—'}</td></tr>
        <tr><td className={v}>{T.followUp}</td><td className={td} colSpan={2}>{r.followUp ?? '—'}</td></tr>
        <tr><td className={v}>{T.reviewer}</td><td className={td} colSpan={2}>{r.countersign.done ? T.countersigned(r.countersign.done.agrees, r.countersign.done.reason) : r.countersign.required ? T.notYet : T.notRequired}</td>{r.countersign.required ? <><td className={`${td} h-11`} /><td className={td} /></> : <td className={`${td} text-muted`} colSpan={2}>{T.noSignature}</td>}</tr>
      </Section>
      <p className="text-12 text-muted">{p.final ? T.reviewFooterFinal : T.reviewFooterProvisional}</p>
    </Page>
  );
}
