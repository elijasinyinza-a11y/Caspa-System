/**
 * Next year's draft (BUILD-BRIEF section 35, D15-7 to D15-9): the switch between this year and next year's draft,
 * the banner while the draft is shown, publishing for the Strategy office, and adding work under a KPI.
 * Actions go through the repository on the records as they are (`base`); figures come from the data-access layer.
 */
import { useState } from 'react';
import type { SixPLevel } from '../contract/caspa-data-contract';
import { SIX_P_LEVELS } from '../rules/structure';
import { en } from '../strings/en';
import { useApp } from './AppContext';

const Y = en.firstYear;
const btn = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-4 text-14 font-semibold text-navy';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white disabled:opacity-60';
const input = 'min-h-11 w-full rounded-lg border border-control bg-white px-3 text-14';

/** Under the Cascade header and on record pages, whenever next year's draft exists. */
export function NextYearBar() {
  const { year, setYear, nextYear, preview, base } = useApp();
  const [note, setNote] = useState<string | null>(null);
  if (!nextYear) return null;
  const page = base.firstYear.page();
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div role="group" aria-label={Y.switchLabel} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={year === 'this'} className={year === 'this' ? primary : btn} onClick={() => setYear('this')}>{Y.thisYear}</button>
        <button type="button" aria-pressed={year === 'next'} className={year === 'next' ? primary : btn} onClick={() => setYear('next')}>{Y.nextYear(nextYear.label)}</button>
      </div>
      {preview && (
        <p className="rounded-lg border border-advisory-border bg-advisory-bg px-4 py-3 text-14 text-advisory-text">{Y.banner(nextYear.planTitle, nextYear.label)}</p>
      )}
      {preview && page && base.viewer.roles.includes('strategy_office') && (
        <section className="rounded-lg border border-border bg-white p-4" aria-labelledby="publish-title">
          <h2 id="publish-title" className="text-16 font-bold text-navy">{Y.publishTitle}</h2>
          <p className="mt-1 text-13 text-muted">{Y.publishText}</p>
          {page.blocks.length > 0 ? (
            <div className="mt-2 rounded-lg border border-block-border bg-block-bg p-3 text-14 text-block-text">
              <p className="font-semibold">{Y.mustFix}</p>
              <ul className="mt-1 flex flex-col gap-1">{page.blocks.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ) : <p className="mt-2 text-14">{Y.nothing}</p>}
          {!page.begun && <p className="mt-2 text-14 text-muted">{Y.notBegun(page.yearLabel)}</p>}
          {page.lastBlocked && page.blocks.length > 0 && <p role="alert" className="mt-2 text-14 text-block-text">{Y.blocked}</p>}
          {note && <p role="status" className="mt-2 text-14 text-complete-text">{note}</p>}
          <button type="button" className={`${primary} mt-3`} disabled={!page.canPublish}
            onClick={() => { const r = base.firstYear.publish(); if (r.ok && r.passed) { setNote(Y.published); setYear('this'); } }}>
            {Y.publish}
          </button>
        </section>
      )}
    </div>
  );
}

/** On a KPI's record page in next year's draft (D15-8). */
export function AddNextYearActivity({ kpiId, ownerDefault }: { kpiId: string; ownerDefault: string | null }) {
  const { base, preview } = useApp();
  const [open, setOpen] = useState(false);
  const [v, set] = useState({ title: '', level: 'process' as SixPLevel, ownerPositionId: ownerDefault ?? '', evidence: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!preview || !base.firstYear.canAddActivity(kpiId)) return null;
  const positions = base.firstYear.positions();
  const id = `next-${kpiId}`;
  return (
    <section className="mb-4 rounded-lg border border-border bg-white p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-16 font-bold text-navy">{Y.addTitle}</h2>
      <p className="mt-1 text-13 text-muted">{Y.addText}</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-14 ${msg.ok ? 'text-complete-text' : 'text-block-text'}`}>{msg.text}</p>}
      {!open ? <button type="button" className={`${btn} mt-2`} onClick={() => setOpen(true)}>{Y.add}</button> : (
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor={`${id}-t`} className="text-13 font-semibold">{Y.title}</label>
          <input id={`${id}-t`} className={input} value={v.title} onChange={(e) => set({ ...v, title: e.target.value })} />
          <label htmlFor={`${id}-l`} className="text-13 font-semibold">{Y.level}</label>
          <select id={`${id}-l`} className={input} value={v.level} onChange={(e) => set({ ...v, level: e.target.value as SixPLevel })}>
            {SIX_P_LEVELS.map((l) => <option key={l} value={l}>{en.sixP[l]}</option>)}
          </select>
          <label htmlFor={`${id}-o`} className="text-13 font-semibold">{Y.owner}</label>
          <select id={`${id}-o`} className={input} value={v.ownerPositionId} onChange={(e) => set({ ...v, ownerPositionId: e.target.value })}>
            <option value="" disabled>{Y.owner}</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <label htmlFor={`${id}-e`} className="text-13 font-semibold">{Y.evidence}</label>
          <input id={`${id}-e`} className={input} value={v.evidence} onChange={(e) => set({ ...v, evidence: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => {
              const r = base.firstYear.addActivity(kpiId, v);
              if (r.ok) { setMsg({ ok: true, text: Y.added(r.code) }); setOpen(false); set({ ...v, title: '', evidence: '' }); }
              else setMsg({ ok: false, text: Y.errors[r.error] ?? Y.errors.invalid! });
            }}>{Y.save}</button>
            <button type="button" className={btn} onClick={() => setOpen(false)}>{Y.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}
