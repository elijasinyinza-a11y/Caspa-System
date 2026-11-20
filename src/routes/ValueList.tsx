/**
 * Corporate values on screen (v0.29.0; Corporate Values Specification v0.1, CV-1 to CV-8; prototype
 * `reference/caspa-values-prototype.html`). One editor for the forming vision step, the import door's vision step and the
 * Strategy landing's record form, and one read-only list for everywhere values are shown.
 */
import { MAX_VALUES, VALUE_MEANING_MAX, VALUE_NAME_MAX, valuesError, type ValueInput } from '../rules/values';
import { en } from '../strings/en';

const V = en.values;
const field = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-3 py-2 text-14 text-text';
const small = 'inline-flex min-h-10 items-center rounded-lg border border-control bg-white px-3 text-13 font-medium text-navy hover:border-navy disabled:cursor-not-allowed disabled:opacity-50';

/** Add, edit, move and remove values. The caller keeps the list and decides when to save. */
/** v0.32.0: `note` adds a line under a value, such as where it came from in group work ("Put forward by 2 of 3 groups"). */
export function ValueListEditor({ values, onChange, idPrefix, note }: { values: ValueInput[]; onChange: (next: ValueInput[]) => void; idPrefix: string; note?: (v: ValueInput) => string | null }) {
  const set = (i: number, patch: Partial<ValueInput>) => onChange(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = (i: number, d: -1 | 1) => { const next = [...values]; [next[i], next[i + d]] = [next[i + d]!, next[i]!]; onChange(next); };
  const error = values.length ? valuesError(values) : null;
  return (
    <div className="space-y-3">
      {values.length === 0 && <p className="text-13 text-muted">{V.none}</p>}
      <ol className="space-y-3">
        {values.map((v, i) => (
          <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border border-border p-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-strategy-tint text-14 font-bold text-strategy-text">{i + 1}</span>
            <div className="min-w-0 space-y-2">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div>
                  <label htmlFor={`${idPrefix}-n-${i}`} className="text-14 font-semibold text-navy">{V.nameLabel(i + 1)}</label>
                  <input id={`${idPrefix}-n-${i}`} value={v.name} maxLength={VALUE_NAME_MAX} onChange={(e) => set(i, { name: e.target.value })} className={field} />
                  <p className="mt-1 text-12 text-muted">{V.count(v.name.length, VALUE_NAME_MAX)}</p>
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-t-${i}`} className="text-14 font-semibold text-navy">{V.meaningLabel}</label>
                  <textarea id={`${idPrefix}-t-${i}`} rows={2} value={v.text} maxLength={VALUE_MEANING_MAX} onChange={(e) => set(i, { text: e.target.value })} className={field} />
                  <p className="mt-1 text-12 text-muted">{V.count(v.text.length, VALUE_MEANING_MAX)}</p>
                </div>
              </div>
              {note?.(v) && <p className="text-12 font-semibold text-strategy-text">{note(v)}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label={V.moveUpLabel(i + 1)}>{V.moveUp}</button>
                <button type="button" className={small} disabled={i === values.length - 1} onClick={() => move(i, 1)} aria-label={V.moveDownLabel(i + 1)}>{V.moveDown}</button>
                <button type="button" className={small} onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label={V.removeLabel(i + 1)}>{V.remove}</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={small} disabled={values.length >= MAX_VALUES} onClick={() => onChange([...values, { name: '', text: '' }])}>{V.add}</button>
        <span className="text-13 text-muted">{V.ofMax(values.length, MAX_VALUES)}</span>
      </div>
      {error && error !== 'name_required' && error !== 'meaning_required' && <p role="alert" className="text-13 font-semibold text-block-text">{V.errors[error]}</p>}
    </div>
  );
}

/** True when the list can be saved: every value complete, within the limits (CV-4). An empty list is fine. */
export const valuesReady = (values: ValueInput[]) => valuesError(values) === null;

/** The values as a read-only list: each name in bold with its meaning, in order (CV-8). */
export function ValueListView({ values, columns = false, note }: { values: ValueInput[]; columns?: boolean; note?: (v: ValueInput) => string | null }) {
  if (!values.length) return null;
  return (
    <ol className={columns ? 'grid gap-x-6 gap-y-3 md:grid-cols-2' : 'space-y-2'}>
      {values.map((v, i) => (
        <li key={i}>
          <b className="block text-16 font-semibold text-navy">{v.name}</b>
          <span className="text-14 text-text">{v.text}</span>
          {note?.(v) && <span className="block text-12 font-semibold text-strategy-text">{note(v)}</span>}
        </li>
      ))}
    </ol>
  );
}
