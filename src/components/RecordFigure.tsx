/**
 * "Record progress" under "How it's done" on an activity page, and "Record a reading" on a KPI page (slice 13, OP-1,
 * OP-12). Only the record's owner sees it (the data-access layer returns no form otherwise). Online only: offline,
 * the form says so and saves nothing. Each save writes an audit entry; nothing is copied from contract updates.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { useApp } from './AppContext';

const R = en.capture.record;
const button = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text disabled:cursor-not-allowed disabled:opacity-60';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-3 text-14 text-text';

export function RecordFigure({ kind, id, aggregation }: { kind: 'activity' | 'kpi'; id: string; aggregation?: string }) {
  const { repo, say, now } = useApp();
  const form = kind === 'activity' ? repo.progress.activityForm(id) : repo.progress.kpiForm(id);
  const offline = repo.progress.offline();
  const [open, setOpen] = useState(false);
  // The latest period that has ended comes first: a figure for the period still running counts once it ends.
  const [period, setPeriod] = useState<string>(form?.periods.find((d) => d < now) ?? form?.periods[0] ?? '');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fid = useId();
  const first = useRef<HTMLSelectElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) first.current?.focus(); }, [open]);
  if (!form) return null;
  // F2: a KPI whose figure comes from its shares this year takes no readings of its own.
  if (form.fromShares) return <p className="border-t border-border pt-3 text-13 text-muted">{en.targets.fromSharesClosed}</p>;
  const title = kind === 'activity' ? R.activityTitle : R.kpiTitle;
  const unit = form.unit;
  const already = form.recorded[period];
  const close = () => { setOpen(false); setValue(''); setNote(''); setError(null); setTimeout(() => opener.current?.focus(), 0); };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = kind === 'activity' ? repo.progress.recordActivity(id, period, value, note) : repo.progress.recordKpi(id, period, value);
    if (!r.ok) { setError(R.errors[r.error] ?? en.capture.errors.generic as string); return; }
    say(R.saved);
    close();
  };
  return (
    <div className="border-t border-border pt-3">
      <h3 className="text-14 font-semibold text-navy">{title}</h3>
      <p className="tabular text-13 text-text">
        {form.latest && form.latest.value !== null ? R.latest(`${formatNumber(form.latest.value)}${unit ? ` ${unit}` : ''}`, formatDate(form.latest.periodEnd)) : en.capture.noneYet}
      </p>
      {kind === 'activity' && (
        <p className="tabular mt-1 text-13 text-muted">
          {form.contractTotal ? R.contractTotal(formatNumber(form.contractTotal.value), form.contractTotal.unit) : R.contractTotalNone} {R.contractTotalNote}
        </p>
      )}
      {!open ? (
        <button ref={opener} type="button" onClick={() => setOpen(true)} className={`${button} mt-2`}>{title}</button>
      ) : (
        <form onSubmit={save} noValidate aria-label={title} className="mt-2 space-y-3 rounded-lg border border-control bg-white p-4">
          <p className="text-13 text-muted">{kind === 'activity' ? R.activityIntro : R.kpiIntro(aggregation ?? '')}</p>
          {offline && <p role="status" className="rounded-lg border border-advisory-border bg-advisory-bg p-3 text-13 text-advisory-text">{R.onlineOnly}</p>}
          <div>
            <label htmlFor={`${fid}-p`} className="text-14 font-semibold text-navy">{en.capture.period}</label>
            <select ref={first} id={`${fid}-p`} value={period} onChange={(e) => { setPeriod(e.target.value); setError(null); }} className={input}>
              {form.periods.map((d) => {
                const name = en.capture.periodName(form.frequency, d);
                return <option key={d} value={d}>{en.capture.periodOption(name.charAt(0).toUpperCase() + name.slice(1), formatDate(d))}</option>;
              })}
            </select>
          </div>
          {already != null && <p className="text-13 text-muted">{R.replaces(formatNumber(already))}</p>}
          <div>
            <label htmlFor={`${fid}-v`} className="text-14 font-semibold text-navy">
              {kind === 'activity' ? (unit ? R.quantity(unit) : R.quantityPlain) : R.reading(unit ?? '')}
            </label>
            <input id={`${fid}-v`} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} className={`${input} tabular`} />
          </div>
          {kind === 'activity' && (
            <div>
              <label htmlFor={`${fid}-n`} className="text-14 font-semibold text-navy">{en.capture.note}</label>
              <textarea id={`${fid}-n`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${input} py-2`} />
            </div>
          )}
          {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={offline} className={primary}>{en.capture.save}</button>
            <button type="button" onClick={close} className={button}>{en.capture.cancel}</button>
          </div>
        </form>
      )}
    </div>
  );
}
