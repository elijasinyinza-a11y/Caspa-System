/**
 * "Make a change" and "Changes this year" on record pages (v0.27.0; In-Year Cascade Changes Specification v0.1,
 * decisions IC-1 to IC-8; prototype approved 18 November 2026). Every choice, effect and permission comes from the
 * data-access layer (`repo.inYear`); this file only words and lays them out.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { SIX_P_SCOPE, type ReportingFrequency, type SixPLevel } from '../contract/caspa-data-contract';
import { useApp } from '../components/AppContext';
import type { ChangeChoice, ChangeEffects, ChangeForm, ChangeInput, EffectLine } from '../data/access/in-year';
import { SIX_P_LEVELS } from '../rules/structure';
import { formatDate, formatNumber } from '../selectors/format';
import type { NodeKind } from '../selectors/node';
import { en, lc, type Terms } from '../strings/en';

const button = 'inline-flex min-h-11 items-center rounded-lg border border-navy bg-white px-4 text-14 font-semibold text-navy hover:bg-cream';
const quiet = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-4 text-14 font-medium text-navy hover:bg-cream';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text disabled:cursor-not-allowed disabled:bg-info-bg disabled:text-muted';
const danger = 'inline-flex min-h-11 items-center rounded-lg bg-block-text px-4 text-14 font-semibold text-white disabled:cursor-not-allowed disabled:bg-info-bg disabled:text-muted';
const field = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-3 py-2 text-14 text-text';
const FREQUENCIES: ReportingFrequency[] = ['monthly', 'quarterly', 'biannual', 'annual'];

interface Draft { title: string; evidence: string; frequency: ReportingFrequency; value: string; positionId: string; level: SixPLevel }

const draftFor = (f: ChangeForm, choice: ChangeChoice): Draft => ({
  title: f.title,
  evidence: f.activity?.evidence ?? '',
  frequency: f.activity?.frequency ?? 'monthly',
  value: f.activity?.quantity ? String(f.activity.quantity.value) : '',
  positionId: choice === 'owner' ? '' : f.owner.positionId ?? '',
  level: f.activity?.level ?? 'process',
});

const inputOf = (choice: ChangeChoice, d: Draft): ChangeInput => {
  switch (choice) {
    case 'details': return { change: 'details', title: d.title, evidence: d.evidence, frequency: d.frequency };
    case 'target': return { change: 'target', value: /^\s*\d+\s*$/.test(d.value) ? Number(d.value) : NaN };
    case 'owner': return { change: 'owner', positionId: d.positionId };
    case 'level': return { change: 'level', level: d.level };
    default: return { change: choice };
  }
};

const qty = (n: number, unit: string) => `${formatNumber(n)} ${unit}`;
const kindLabel = (t: Terms, k: NodeKind) => lc(t[k].singular);

function effectText(l: EffectLine, t: Terms, details: boolean): string[] {
  const E = en.inYear.effect;
  switch (l.kind) {
    case 'commitments_flagged':
      return [...l.named.map((n) => E.commitmentsFlagged(t, n.person, n.title, n.supervisor)), ...(l.others ? [E.commitmentsFlaggedOthers(t, l.others)] : [])];
    case 'commitments_stay': return [E.commitmentsStay(t, l.named, l.others)];
    case 'no_commitment_affected': return [details ? E.noCommitmentDetails(t) : E.noCommitment(t)];
    case 'signed_carry': return [E.signedCarry(t, qty(l.signed, l.unit), l.recorded ? `${qty(l.recorded.done, l.unit)}, as of ${formatDate(l.recorded.periodEnd)}` : null)];
    case 'below_signed': return [E.belowSigned(qty(l.signed, l.unit), l.objectiveOwner)];
    case 'recorded': return [E.recorded(formatNumber(l.done), qty(l.target, l.unit), l.periodEnd ? formatDate(l.periodEnd) : null, l.below)];
    case 'budget_lines_flagged': return [E.budgetFlagged(t, l.count)];
    case 'budget_lines_stay': return [E.budgetStay(t, l.count)];
    case 'dependents_done': return [E.dependentsDone(l.count)];
    case 'dependents_not_done': return [E.dependentsNotDone(l.count)];
    case 'no_figures_added': return [E.noFigures(t)];
    case 'leaves_counts': return [E.leaves(t)];
    case 'returns_counts': return [E.returns(t)];
    case 'stop_flags_clear': return [E.stopFlagsClear];
    case 'owner_sees': return [E.ownerSees(kindLabel(t, l.what), l.position, l.person)];
    case 'no_owner_clears': return [E.noOwnerClears];
  }
}
const flagged = (l: EffectLine) => l.kind === 'commitments_flagged' || l.kind === 'below_signed' || l.kind === 'budget_lines_flagged';

/**
 * The "Make a change" button and panel. `pending` opens it straight at one choice (the "Assign owner" fix on a
 * check); `onPendingUsed` tells the page it was taken.
 */
export function MakeAChange({ kind, id, pending, onPendingUsed }: { kind: NodeKind; id: string; pending?: ChangeChoice | null; onPendingUsed?: () => void }) {
  const { repo } = useApp();
  const t = repo.settings().termLabels;
  const form = repo.inYear.form(kind, id);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ChangeChoice | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const ids = { title: useId(), evidence: useId(), frequency: useId(), value: useId(), owner: useId(), reason: useId(), level: useId() };

  const pick = (c: ChangeChoice) => { if (!form) return; setChoice(c); setDraft(draftFor(form, c)); setSaveError(null); };
  const start = (c: ChangeChoice | null) => {
    if (!form) return;
    setOpen(true); setMessage(null); setReason(''); setSaveError(null);
    const only = form.choices.length === 1 ? form.choices[0]! : c;
    if (only) pick(only); else { setChoice(null); setDraft(null); }
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus(), 0);
  };
  const close = (text: string | null) => {
    setOpen(false); setChoice(null); setDraft(null); setReason(''); setSaveError(null); setMessage(text);
    setTimeout(() => opener.current?.focus(), 0);
  };
  useEffect(() => {
    if (pending && form?.choices.includes(pending)) { start(pending); onPendingUsed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const status = <div role="status" aria-live="polite">{message && <p className="rounded-lg border border-complete-border bg-complete-bg px-3 py-2 text-14 font-semibold text-complete-text">{message}</p>}</div>;
  if (!form) return status;
  const a = form.activity;
  const stoppedNote = a?.status === 'archived' && !form.choices.includes('restart');

  if (!open) {
    return (
      <>
        {status}
        {stoppedNote && <p className="border-l-4 border-border pl-3 text-13 text-muted">{en.inYear.stoppedNote(t)}</p>}
        <div><button ref={opener} type="button" onClick={() => start(null)} className={button}>{en.inYear.button}</button></div>
      </>
    );
  }

  const input = choice && draft ? inputOf(choice, draft) : null;
  const fx: ChangeEffects | null = input ? repo.inYear.effects(kind, id, input) : null;
  const ready = !!fx && fx.error === null && (!fx.reasonNeeded || reason.trim() !== '');
  const shownError = fx?.error && fx.error !== 'no_change' && !(fx.error === 'owner_unknown' && !draft?.positionId) && !(fx.error === 'same_level') ? en.inYear.errors[fx.error] : null;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const nowOf = (c: ChangeChoice) =>
    c === 'target' && a?.quantity ? qty(a.quantity.value, a.quantity.unit)
      : c === 'owner' ? (form.owner.title ? (form.owner.holder ? `${form.owner.holder}, ${form.owner.title}` : `${form.owner.title} (${en.inYear.vacant})`) : en.node.noOwner)
        : c === 'level' && a?.level ? en.sixP[a.level] : '';

  const save = () => {
    if (!choice || !draft || !input) return;
    const r = input.change === 'level' ? repo.changeActivityLevel(id, input.level, reason) : repo.inYear.make(kind, id, input, reason);
    if (!r.ok) { setSaveError(en.inYear.errors[r.error] ?? en.levelChange.errors[r.error]?.('') ?? en.inYear.errors.not_allowed!); return; }
    const D = en.inYear.done;
    const pos = form.positions.find((p) => p.id === draft.positionId);
    close(
      choice === 'target' && a?.quantity ? D.target(qty(Number(draft.value), a.quantity.unit))
        : choice === 'owner' ? D.owner(pos ? (pos.holder ? `${pos.holder}, ${pos.title}` : `${pos.title} (${en.inYear.vacant})`) : '')
          : choice === 'level' ? D.level(en.sixP[draft.level])
            : choice === 'details' ? D.details : choice === 'complete' || choice === 'reopen' || choice === 'stop' || choice === 'restart' ? D[choice] : null,
    );
  };

  return (
    <section ref={panel} aria-labelledby={`${ids.reason}-h`} className="space-y-4 rounded-xl border border-control bg-white p-4">
      <div>
        <h3 id={`${ids.reason}-h`} className="text-16 font-bold text-navy">{en.inYear.title}</h3>
        <p className="text-13 text-muted">{form.choices.length > 1 ? en.inYear.intro : form.choices[0] === 'owner' ? en.inYear.introOne : en.inYear.choice[form.choices[0]!]![1](t, '')}</p>
      </div>
      {form.choices.length > 1 && (
        <div role="group" aria-label={en.inYear.legend} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {form.choices.map((c) => {
            const [label, sub] = en.inYear.choice[c]!;
            const on = choice === c;
            return (
              <button
                key={c} type="button" aria-pressed={on} onClick={() => pick(c)}
                className={`flex min-h-14 flex-col items-start rounded-lg p-3 text-left hover:bg-cream ${on ? 'border-2 border-navy bg-cream' : 'border border-border bg-white'}`}
              >
                <span className={`text-14 font-semibold ${c === 'stop' ? 'text-block-text' : 'text-navy'}`}>{label}</span>
                <span className="text-13 text-muted">{sub(t, nowOf(c))}</span>
              </button>
            );
          })}
        </div>
      )}

      {choice === 'details' && draft && (
        <div className="space-y-3">
          <div><label htmlFor={ids.title} className="text-14 font-semibold text-navy">{en.inYear.titleField}</label>
            <input id={ids.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} className={field} /></div>
          <div><label htmlFor={ids.evidence} className="text-14 font-semibold text-navy">{en.inYear.evidence}</label>
            <textarea id={ids.evidence} rows={2} value={draft.evidence} onChange={(e) => set({ evidence: e.target.value })} className={field} /></div>
          <div><label htmlFor={ids.frequency} className="text-14 font-semibold text-navy">{en.inYear.frequency}</label>
            <select id={ids.frequency} value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as ReportingFrequency })} className={`${field} sm:max-w-xs`}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{en.frequency[f]}</option>)}
            </select></div>
        </div>
      )}
      {choice === 'target' && draft && a?.quantity && (
        <div><label htmlFor={ids.value} className="text-14 font-semibold text-navy">{en.inYear.target(a.quantity.unit)}</label>
          <input id={ids.value} inputMode="numeric" value={draft.value} onChange={(e) => set({ value: e.target.value })} className={`${field} tabular sm:max-w-[14rem]`} /></div>
      )}
      {choice === 'owner' && draft && (
        <div><label htmlFor={ids.owner} className="text-14 font-semibold text-navy">{en.inYear.newOwner}</label>
          <select id={ids.owner} value={draft.positionId} onChange={(e) => set({ positionId: e.target.value })} className={`${field} sm:max-w-md`}>
            <option value="">{en.inYear.chooseOwner}</option>
            {form.positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title} — {p.holder ? `${p.holder}${p.acting ? ` (${en.inYear.acting})` : ''}` : en.inYear.vacant}</option>
            ))}
          </select>
          <p className="mt-1 text-13 text-muted">{en.inYear.ownerHint}</p></div>
      )}
      {choice === 'level' && draft && (
        <fieldset>
          <legend className="text-14 font-semibold text-navy">{en.levelChange.legend}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SIX_P_LEVELS.map((l) => (
              <label key={l} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-control">
                <input type="radio" name={ids.level} value={l} checked={draft.level === l} onChange={() => set({ level: l })} className="mt-1 h-5 w-5 accent-navy" />
                <span>
                  <span className="font-semibold text-navy">{en.sixP[l]}</span>
                  {l === a?.level && <span className="ml-2 text-13 text-muted">{en.levelChange.current}</span>}
                  <span className="block text-13 text-muted">{en.explain.covers}: {SIX_P_SCOPE[l]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {shownError && <p role="alert" className="text-13 font-semibold text-block-text">{shownError}</p>}
      {fx && fx.lines.length > 0 && (
        <div className="rounded-lg bg-cream p-4">
          <h4 className="text-14 font-semibold text-navy">{en.inYear.affects}</h4>
          <ul className="mt-2 space-y-2">
            {fx.lines.flatMap((l, i) => effectText(l, t, choice === 'details').map((text, j) => (
              <li key={`${i}-${j}`} className="flex gap-3 text-14 text-text">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${flagged(l) ? 'bg-advisory-border' : 'bg-control'}`} />
                <span>{text}</span>
              </li>
            )))}
          </ul>
        </div>
      )}
      {fx?.reasonNeeded && (
        <div><label htmlFor={ids.reason} className="text-14 font-semibold text-navy">{en.inYear.reason}</label>
          <textarea id={ids.reason} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${ids.reason}-hint`} className={field} />
          <p id={`${ids.reason}-hint`} className="mt-1 text-13 text-muted">{en.inYear.reasonHint}</p></div>
      )}
      {saveError && <p role="alert" className="text-13 font-semibold text-block-text">{saveError}</p>}
      <div className="flex flex-wrap gap-2">
        {choice && <button type="button" disabled={!ready} onClick={save} className={choice === 'stop' ? danger : primary}>{en.inYear.save[choice]}</button>}
        <button type="button" onClick={() => close(null)} className={quiet}>{en.inYear.cancel}</button>
      </div>
    </section>
  );
}

/** "Changes this year" (IC-8): every in-year change to this record, newest first, with its reason. */
export function ChangesThisYear({ kind, id }: { kind: NodeKind; id: string }) {
  const { repo } = useApp();
  const items = repo.inYear.changes(kind, id);
  return (
    <div className="border-t border-border pt-3">
      <h3 className="text-14 font-semibold text-navy">{en.inYear.history}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-13 text-muted">{en.inYear.none}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {items.map((c, i) => (
            <li key={i} className="space-y-1 py-2">
              <p className="text-14 font-semibold text-navy">{en.inYear.item(en.inYear.field[c.field]!, c.from, c.to)}</p>
              <p className="text-14 text-text">{en.inYear.reason}: {c.reason}</p>
              <p className="text-12 text-muted">{en.inYear.by(c.by, formatDate(c.on))}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
