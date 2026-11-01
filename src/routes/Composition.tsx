/**
 * Strategy formation, part 11d: Composition (BUILD-BRIEF section 34). Themes, goals, objectives, KPIs with a target
 * for every plan year, indicative costs against Finance's envelopes, decision-map rows, and confirming the plan.
 * Behaviour from the approved Strategy workspace prototype, within the contract (the contract wins where they differ).
 * Every figure comes from the data-access layer; nothing is computed here.
 */
import { useState, type ReactNode } from 'react';
import { useApp } from '../components/AppContext';
import { SixPChip } from '../components/Explain';
import type { ISODate, PerspectiveKey, SixPLevel } from '../contract/caspa-data-contract';
import type {
  ComposerPage, CompositionResult, GoalInput, GoalView, KpiInput, KpiView, ObjectiveView, RowView, ThemeView,
} from '../data/access/composition';
import { SIX_P_LEVELS } from '../rules/structure';
import { formatDate, formatMoney, formatNumber, minorUnitsOf } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, input, label, link, plural, primary } from './organisation/ui';
import { mustText } from './Strategy';

const K = en.composition;
type Act = <T extends object>(r: CompositionResult<T> | Promise<CompositionResult<T>>, done?: (r: { ok: true } & T) => string | null) => void;

export function Composer({ c }: { c: ComposerPage }) {
  const { repo } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act: Act = <T extends object>(r: CompositionResult<T> | Promise<CompositionResult<T>>, done?: (r: { ok: true } & T) => string | null) => {
    void Promise.resolve(r).then((x) => {
      if (x.ok) { setError(null); setNote(done ? done(x) : null); } else { setNote(null); setError(K.errors[x.error] ?? K.errors.invalid!); }
    });
  };
  const confirmed = c.confirm.status !== 'draft';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <section className={card} aria-labelledby="composition-title">
          <h2 id="composition-title" className="text-18 font-bold text-navy">{K.title}</h2>
          <p className="mt-1 text-14">{K.intro}</p>
          {confirmed ? <p className="mt-2 text-14 text-muted">{K.confirmedPlan}</p> : !c.open && <p className="mt-2 text-14 text-muted">{K.notOpen}</p>}
        </section>
        {note && <p role="status" className="rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">{note}</p>}
        {error && <p role="alert" className="rounded-lg border border-block-border bg-block-bg px-4 py-3 text-14 text-block-text">{error}</p>}
        <Themes c={c} act={act} />
        <Goals c={c} act={act} />
      </div>
      <aside className="flex min-w-0 flex-col gap-4" aria-label={K.checks.title}>
        <Checks c={c} />
        <Confirm c={c} act={act} />
        {c.runs && c.aiEnabled && !confirmed && (
          <section className={card}>
            <button type="button" className={btn} onClick={() => act(repo.composition.reviewWording(), (r) => K.wording.done(plural(r.notes, 'objective')))}>{K.wording.review}</button>
          </section>
        )}
      </aside>
    </div>
  );
}

/* ───────── Small pieces ───────── */

const statusChip = (accepted: boolean, fromAi: boolean, kind: 'confirm' | 'accept' = 'confirm') =>
  accepted ? <Chip tone="complete">{kind === 'accept' ? K.status.accepted : K.status.confirmed}</Chip>
    : <Chip tone="advisory">{fromAi ? K.status.aiDraft : kind === 'accept' ? K.status.toAccept : K.status.toConfirm}</Chip>;

function Cards({ cards, count }: { cards: { text: string }[] | null; count: number }) {
  if (count === 0) return <p className="text-13 text-muted">{K.noCards}</p>;
  if (!cards) return <p className="text-13 text-muted">{K.cardsHidden(plural(count, 'card'))}</p>;
  return <p className="text-13 text-muted">{K.from(cards.map((x) => `“${x.text}”`).join('; '))}</p>;
}

function CardPicker({ c, value, onChange, id }: { c: ComposerPage; value: string[]; onChange: (v: string[]) => void; id: string }) {
  if (!c.cards.length) return null;
  return (
    <fieldset className="mt-2">
      <legend className={label}>{K.pickCards}</legend>
      <div className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto">
        {c.cards.map((x) => (
          <label key={x.id} htmlFor={`${id}-${x.id}`} className="flex min-h-11 items-center gap-2 text-14">
            <input id={`${id}-${x.id}`} type="checkbox" className="h-5 w-5" checked={value.includes(x.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, x.id] : value.filter((v) => v !== x.id))} />
            <span>{x.text} <span className="text-12 text-muted">({K.grouping[x.grouping]})</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ id, text, children }: { id: string; text: string; children: ReactNode }) {
  return <div className="min-w-0 flex-[1_1_12rem]"><label htmlFor={id} className={label}>{text}</label><div className="mt-1">{children}</div></div>;
}

const Buttons = ({ children }: { children: ReactNode }) => <div className="mt-2 flex flex-wrap gap-2">{children}</div>;

/** Major units typed by a person, as minor units for the currency; null when blank; NaN when not a number. */
const toMinor = (text: string, currency: string): number | null => {
  const t = text.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10 ** minorUnitsOf(currency)) : NaN;
};
const fromMinor = (n: number | null, currency: string) => (n === null ? '' : String(n / 10 ** minorUnitsOf(currency)));
const money = (n: number, currency: string) => formatMoney({ amountMinor: n, currency });

/* ───────── Themes ───────── */

function Themes({ c, act }: { c: ComposerPage; act: Act }) {
  const { repo } = useApp();
  const cp = repo.composition;
  const [adding, setAdding] = useState(false);
  const runs = c.runs && c.confirm.status === 'draft';
  return (
    <section className={card} aria-labelledby="themes-title">
      <h3 id="themes-title" className="text-16 font-bold text-navy">{K.themes.title}</h3>
      <p className="mt-1 text-13 text-muted">{K.themes.text}</p>
      {runs && (
        <Buttons>
          {c.aiEnabled && <button type="button" className={btn} onClick={() => act(cp.suggestThemes(), (r) => K.themes.added(plural(r.added, 'theme')))}>{K.themes.suggest}</button>}
          {!adding && <button type="button" className={btn} onClick={() => setAdding(true)}>{K.themes.add}</button>}
        </Buttons>
      )}
      {adding && <ThemeForm c={c} onSave={(v) => act(cp.addTheme(v), () => { setAdding(false); return null; })} onCancel={() => setAdding(false)} />}
      {c.themes.length === 0 ? <p className="mt-3 text-14 text-muted">{K.themes.none}</p> : (
        <ul className="mt-3 flex flex-col divide-y divide-border">{c.themes.map((t) => <ThemeRow key={t.id} c={c} t={t} act={act} />)}</ul>
      )}
    </section>
  );
}

function ThemeRow({ c, t, act }: { c: ComposerPage; t: ThemeView; act: Act }) {
  const cp = useApp().repo.composition;
  const [editing, setEditing] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-14 font-semibold text-navy">{t.title}</span>{statusChip(t.accepted, t.fromAi, 'accept')}
        {t.groupings.map((g) => <Chip key={g} tone="info">{K.grouping[g]}</Chip>)}{t.goal && <span className="text-13 text-muted">{K.themes.goal(t.goal)}</span>}</div>
      <Cards cards={t.cards} count={t.cardCount} />
      {editing ? <ThemeForm c={c} initial={{ title: t.title, cardIds: t.cards?.map((x) => x.id) ?? [] }} onSave={(v) => act(cp.editTheme(t.id, v), () => { setEditing(false); return null; })} onCancel={() => setEditing(false)} /> : (
        <Buttons>
          {t.canAccept && <button type="button" className={primary} onClick={() => act(cp.acceptTheme(t.id))}>{K.themes.accept}</button>}
          {t.canMakeGoal && <button type="button" className={btn} onClick={() => act(cp.goalFromTheme(t.id))}>{K.themes.makeGoal}</button>}
          {t.canEdit && t.cards && <button type="button" className={btn} onClick={() => setEditing(true)}>{K.edit}</button>}
          {t.canEdit && !t.goal && <button type="button" className={btn} onClick={() => act(cp.remove('Theme', t.id))}>{K.remove}</button>}
        </Buttons>
      )}
    </li>
  );
}

function ThemeForm({ c, initial, onSave, onCancel }: { c: ComposerPage; initial?: { title: string; cardIds: string[] }; onSave: (v: { title: string; cardIds: string[] }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [cardIds, setCards] = useState<string[]>(initial?.cardIds ?? []);
  const id = `theme-${initial?.title ?? 'new'}`.replace(/\W+/g, '-');
  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <Field id={`${id}-t`} text={K.title_}><input id={`${id}-t`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <CardPicker c={c} value={cardIds} onChange={setCards} id={id} />
      <Buttons><button type="button" className={primary} onClick={() => onSave({ title, cardIds })}>{K.save}</button><button type="button" className={btn} onClick={onCancel}>{K.cancel}</button></Buttons>
    </div>
  );
}

/* ───────── Goals ───────── */

function Goals({ c, act }: { c: ComposerPage; act: Act }) {
  const cp = useApp().repo.composition;
  const [adding, setAdding] = useState(false);
  const runs = c.runs && c.open;
  return (
    <section className={card} aria-labelledby="goals-title">
      <h3 id="goals-title" className="text-16 font-bold text-navy">{K.goals.title}</h3>
      <p className="mt-1 text-13 text-muted">{K.goals.text}</p>
      {runs && (
        <Buttons>
          {!adding && <button type="button" className={btn} onClick={() => setAdding(true)}>{K.goals.add}</button>}
          {c.aiEnabled && c.goals.some((g) => g.confirmed) && <button type="button" className={btn} onClick={() => act(cp.suggestObjectives(), (r) => K.goals.objectivesAdded(plural(r.added, 'objective')))}>{K.goals.suggestObjectives}</button>}
        </Buttons>
      )}
      {adding && <GoalForm c={c} onSave={(v) => act(cp.addGoal(v), () => { setAdding(false); return null; })} onCancel={() => setAdding(false)} />}
      {c.planEnvelopes && (c.canSetEnvelope || c.planEnvelopes.some((e) => e.amount !== null)) && (
        <Envelopes c={c} title={K.envelopes.planTitle} rows={c.planEnvelopes} goalId={null} act={act} />
      )}
      {c.goals.length === 0 ? <p className="mt-3 text-14 text-muted">{K.goals.none}</p> : c.goals.map((g) => <GoalCard key={g.id} c={c} g={g} act={act} />)}
    </section>
  );
}

function GoalCard({ c, g, act }: { c: ComposerPage; g: GoalView; act: Act }) {
  const cp = useApp().repo.composition;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'add' | 'propose' | null>(null);
  const persp = c.perspectives.find((p) => p.key === g.perspective)?.label;
  return (
    <article className="mt-4 rounded-lg border border-border p-4" aria-labelledby={`goal-${g.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`goal-${g.id}`} className="text-16 font-bold text-navy">{g.title} <span className="text-13 font-normal text-muted">{g.code}</span></h4>
        {statusChip(g.confirmed, false)}
      </div>
      <p className="mt-1 text-13 text-muted">
        {[persp ? `${K.goals.perspective}: ${persp}` : c.perspectives.length ? K.goals.noPerspective : null,
          g.owner ? `${K.goals.owner}: ${g.owner.label}${g.owner.holder ? ` (${g.owner.holder})` : ''}` : K.goals.noOwner,
          g.themes.length ? K.goals.themes(g.themes.join(', ')) : null].filter(Boolean).join(' · ')}
      </p>
      <Cards cards={g.cards} count={g.cardCount} />
      {editing ? (
        <GoalForm c={c} initial={{ title: g.title, perspective: g.perspective, ownerPositionId: g.owner?.id ?? null, themeIds: c.themes.filter((t) => g.themes.includes(t.title)).map((t) => t.id), cardIds: g.cards?.map((x) => x.id) ?? [] }}
          onSave={(v) => act(cp.editGoal(g.id, v), () => { setEditing(false); return null; })} onCancel={() => setEditing(false)} />
      ) : (
        <Buttons>
          {g.canConfirm && <button type="button" className={primary} onClick={() => act(cp.confirmItem('Goal', g.id))}>{K.confirmItem}</button>}
          {g.canEdit && <button type="button" className={btn} onClick={() => setEditing(true)}>{K.edit}</button>}
          {(g.canEdit || g.canConfirm) && g.objectives.length === 0 && <button type="button" className={btn} onClick={() => act(cp.remove('Goal', g.id))}>{K.remove}</button>}
        </Buttons>
      )}
      {g.envelopes && (c.canSetEnvelope || g.envelopes.some((e) => e.amount !== null)) && <Envelopes c={c} title={K.envelopes.title} rows={g.envelopes} goalId={g.id} act={act} />}
      <h5 className="mt-4 text-14 font-bold text-navy">{K.objectives.title}</h5>
      {g.objectives.length === 0 && <p className="text-13 text-muted">{K.objectives.none}</p>}
      {g.objectives.map((o) => <ObjectiveCard key={o.id} c={c} g={g} o={o} act={act} />)}
      <Buttons>
        {g.canAddObjective && adding === null && <button type="button" className={btn} onClick={() => setAdding('add')}>{K.objectives.add}</button>}
        {g.canPropose && adding === null && <button type="button" className={btn} onClick={() => setAdding('propose')}>{K.objectives.propose}</button>}
      </Buttons>
      {adding && (
        <ObjectiveForm c={c} propose={adding === 'propose'} onCancel={() => setAdding(null)}
          onSave={(v) => act(adding === 'propose' ? cp.proposeObjective(g.id, { title: v.title, cardIds: v.cardIds }) : cp.addObjective(g.id, v), () => { setAdding(null); return null; })} />
      )}
    </article>
  );
}

function GoalForm({ c, initial, onSave, onCancel }: { c: ComposerPage; initial?: GoalInput; onSave: (v: GoalInput) => void; onCancel: () => void }) {
  const [v, set] = useState<GoalInput>(initial ?? { title: '', perspective: null, ownerPositionId: null, themeIds: [], cardIds: [] });
  const id = `goal-form-${initial?.title ?? 'new'}`.replace(/\W+/g, '-');
  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap gap-3">
        <Field id={`${id}-t`} text={K.title_}><input id={`${id}-t`} className={input} value={v.title} onChange={(e) => set({ ...v, title: e.target.value })} /></Field>
        {c.perspectives.length > 0 && (
          <Field id={`${id}-p`} text={K.goals.perspective}>
            <select id={`${id}-p`} className={input} value={v.perspective ?? ''} onChange={(e) => set({ ...v, perspective: (e.target.value || null) as PerspectiveKey | null })}>
              <option value="">{K.goals.noPerspective}</option>
              {c.perspectives.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
        )}
        <Field id={`${id}-o`} text={K.goals.owner}><PositionSelect id={`${id}-o`} c={c} value={v.ownerPositionId} onChange={(x) => set({ ...v, ownerPositionId: x })} /></Field>
      </div>
      {c.themes.some((t) => t.accepted) && (
        <fieldset className="mt-2">
          <legend className={label}>{K.themes.title}</legend>
          {c.themes.filter((t) => t.accepted).map((t) => (
            <label key={t.id} htmlFor={`${id}-th-${t.id}`} className="flex min-h-11 items-center gap-2 text-14">
              <input id={`${id}-th-${t.id}`} type="checkbox" className="h-5 w-5" checked={v.themeIds.includes(t.id)}
                onChange={(e) => set({ ...v, themeIds: e.target.checked ? [...v.themeIds, t.id] : v.themeIds.filter((x) => x !== t.id) })} />{t.title}
            </label>
          ))}
        </fieldset>
      )}
      <CardPicker c={c} value={v.cardIds} onChange={(cardIds) => set({ ...v, cardIds })} id={id} />
      <Buttons><button type="button" className={primary} onClick={() => onSave(v)}>{K.save}</button><button type="button" className={btn} onClick={onCancel}>{K.cancel}</button></Buttons>
    </div>
  );
}

function PositionSelect({ id, c, value, onChange, required }: { id: string; c: ComposerPage; value: string | null; onChange: (v: string | null) => void; required?: boolean }) {
  return (
    <select id={id} className={input} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {!required && <option value="">{K.goals.noOwner}</option>}
      {required && <option value="" disabled>{K.goals.noOwner}</option>}
      {c.positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}

function Envelopes({ c, title, rows, goalId, act }: { c: ComposerPage; title: string; rows: { amount: number | null; cost: number; exceeded: boolean }[]; goalId: string | null; act: Act }) {
  const cp = useApp().repo.composition;
  return (
    <div className="mt-3">
      <h5 className="text-14 font-bold text-navy">{title}</h5>
      <p className="text-13 text-muted">{K.envelopes.text}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-13 tabular-nums">
          <thead><tr className="text-left text-muted"><th className="py-1 pr-3 font-semibold" scope="col">{K.rows.year}</th>{c.years.map((y) => <th key={y.fy} scope="col" className="py-1 pr-3 font-semibold">{y.label}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row" className="py-1 pr-3 text-left font-semibold">{K.envelopes.envelope}</th>
              {rows.map((r, i) => (
                <td key={c.years[i]!.fy} className="py-1 pr-3">
                  {c.canSetEnvelope ? (
                    <MoneyInput c={c} label={`${K.envelopes.envelope} ${c.years[i]!.label}`} value={r.amount}
                      onSave={(n) => act(cp.setEnvelope(goalId, c.years[i]!.fy, n))} />
                  ) : r.amount === null ? K.envelopes.none : money(r.amount, c.currency)}
                </td>
              ))}
            </tr>
            <tr><th scope="row" className="py-1 pr-3 text-left font-semibold">{K.envelopes.cost}</th>
              {rows.map((r, i) => <td key={c.years[i]!.fy} className="py-1 pr-3">{money(r.cost, c.currency)}{r.exceeded && <> <Chip tone="advisory">{K.envelopes.over}</Chip></>}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MoneyInput({ c, label: aria, value, onSave }: { c: ComposerPage; label: string; value: number | null; onSave: (n: number | null) => void }) {
  const [text, setText] = useState(fromMinor(value, c.currency));
  const [bad, setBad] = useState(false);
  const commit = () => {
    const n = toMinor(text, c.currency);
    if (n !== null && Number.isNaN(n)) { setBad(true); return; }
    setBad(false);
    if (n !== value) onSave(n);
  };
  return <input aria-label={aria} aria-invalid={bad} inputMode="decimal" className={`${input} min-w-[8rem]`} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />;
}

/* ───────── Objectives ───────── */

function ObjectiveCard({ c, g, o, act }: { c: ComposerPage; g: GoalView; o: ObjectiveView; act: Act }) {
  const cp = useApp().repo.composition;
  const [editing, setEditing] = useState(false);
  const [into, setInto] = useState('');
  const [merging, setMerging] = useState(false);
  const others = g.objectives.filter((x) => x.id !== o.id);
  return (
    <div className="mt-3 rounded-lg border border-border bg-cream p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-14 font-semibold text-navy">{o.title}</span><span className="text-12 text-muted">{o.code}</span>{statusChip(o.confirmed, o.fromAi)}
        {o.wording && <Chip tone="info">{`${K.status.aiDraft}: ${o.wording}`}</Chip>}
      </div>
      <p className="mt-1 text-13 text-muted">
        {[o.proposedBy ? K.status.proposed(o.proposedBy) : o.fromAi ? K.objectives.aiSuggested : null,
          o.owner ? `${K.goals.owner}: ${o.owner.label}${o.owner.holder ? ` (${o.owner.holder})` : ''}` : K.goals.noOwner].filter(Boolean).join(' · ')}
      </p>
      <Cards cards={o.cards} count={o.cardCount} />
      {editing ? (
        <ObjectiveForm c={c} propose={!c.runs} initial={{ title: o.title, ownerPositionId: o.owner?.id ?? null, cardIds: o.cards?.map((x) => x.id) ?? [] }}
          onSave={(v) => act(cp.editObjective(o.id, v), () => { setEditing(false); return null; })} onCancel={() => setEditing(false)} />
      ) : (
        <Buttons>
          {o.canConfirm && <button type="button" className={primary} onClick={() => act(cp.confirmItem('Objective', o.id))}>{K.confirmItem}</button>}
          {o.canEdit && <button type="button" className={btn} onClick={() => setEditing(true)}>{K.edit}</button>}
          {(o.canEdit || o.canConfirm) && o.kpis.length === 0 && o.rowCount === 0 && <button type="button" className={btn} onClick={() => act(cp.remove('Objective', o.id))}>{K.remove}</button>}
          {c.runs && c.open && others.length > 0 && !merging && <button type="button" className={btn} onClick={() => setMerging(true)}>{K.objectives.mergeStart}</button>}
        </Buttons>
      )}
      {merging && !editing && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field id={`merge-${o.id}`} text={K.objectives.merge}>
            <select id={`merge-${o.id}`} className={input} value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="" disabled>{K.objectives.merge}</option>
              {others.map((x) => <option key={x.id} value={x.id}>{`${x.code} ${x.title}`}</option>)}
            </select>
          </Field>
          <button type="button" className={primary} disabled={!into} onClick={() => act(cp.mergeObjective(o.id, into))}>{K.objectives.mergeButton}</button>
          <button type="button" className={btn} onClick={() => setMerging(false)}>{K.cancel}</button>
        </div>
      )}
      <details className="mt-3" open={o.kpis.length === 0 && o.canAddKpi}>
        <summary className="flex min-h-11 cursor-pointer items-center text-14 font-semibold text-navy">{`${K.kpis.title} (${formatNumber(o.kpis.length)})`}</summary>
        <Kpis c={c} o={o} act={act} />
      </details>
      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-14 font-semibold text-navy">{K.costs.title}</summary>
        <Costs c={c} o={o} act={act} />
      </details>
      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-14 font-semibold text-navy">{`${K.rows.title} (${formatNumber(o.rowCount)})`}</summary>
        <Rows c={c} o={o} act={act} />
      </details>
    </div>
  );
}

function ObjectiveForm({ c, propose, initial, onSave, onCancel }: { c: ComposerPage; propose: boolean; initial?: { title: string; ownerPositionId: string | null; cardIds: string[] }; onSave: (v: { title: string; ownerPositionId: string | null; cardIds: string[] }) => void; onCancel: () => void }) {
  const [v, set] = useState(initial ?? { title: '', ownerPositionId: null, cardIds: [] as string[] });
  const id = `obj-form-${initial?.title ?? 'new'}`.replace(/\W+/g, '-');
  return (
    <div className="mt-3 rounded-lg border border-border bg-white p-3">
      {propose && c.proposeAs && <p className="mb-2 text-13 text-muted">{K.objectives.proposeAs(c.proposeAs.label)}</p>}
      <div className="flex flex-wrap gap-3">
        <Field id={`${id}-t`} text={K.title_}><input id={`${id}-t`} className={input} value={v.title} onChange={(e) => set({ ...v, title: e.target.value })} /></Field>
        {!propose && <Field id={`${id}-o`} text={K.goals.owner}><PositionSelect id={`${id}-o`} c={c} value={v.ownerPositionId} onChange={(x) => set({ ...v, ownerPositionId: x })} /></Field>}
      </div>
      <CardPicker c={c} value={v.cardIds} onChange={(cardIds) => set({ ...v, cardIds })} id={id} />
      <Buttons><button type="button" className={primary} onClick={() => onSave(v)}>{K.save}</button><button type="button" className={btn} onClick={onCancel}>{K.cancel}</button></Buttons>
    </div>
  );
}

/* ───────── KPIs ───────── */

function Kpis({ c, o, act }: { c: ComposerPage; o: ObjectiveView; act: Act }) {
  const cp = useApp().repo.composition;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="mt-1">
      <p className="text-13 text-muted">{K.kpis.pathNote}</p>
      {o.kpis.length === 0 && <p className="mt-1 text-13 text-muted">{K.kpis.none}</p>}
      {o.kpis.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-13 tabular-nums">
            <thead><tr className="text-left text-muted">
              <th scope="col" className="py-1 pr-3 font-semibold">{K.kpis.name}</th><th scope="col" className="py-1 pr-3 font-semibold">{K.kpis.baseline}</th>
              {c.years.map((y) => <th key={y.fy} scope="col" className="py-1 pr-3 font-semibold">{y.label}</th>)}<th scope="col" className="py-1 font-semibold"><span className="sr-only">{K.edit}</span></th>
            </tr></thead>
            <tbody>{o.kpis.map((k) => <KpiRow key={k.id} c={c} k={k} act={act} onEdit={() => setEditing(k.id)} />)}</tbody>
          </table>
        </div>
      )}
      {editing && (() => { const k = o.kpis.find((x) => x.id === editing); return k ? <KpiForm c={c} initial={k} onSave={(v) => act(cp.editKpi(k.id, v), () => { setEditing(null); return null; })} onCancel={() => setEditing(null)} /> : null; })()}
      {o.canAddKpi && !adding && !editing && (
        <Buttons>
          <button type="button" className={btn} onClick={() => setAdding(true)}>{K.kpis.add}</button>
          {c.aiEnabled && <button type="button" className={btn} onClick={() => act(cp.suggestKpi(o.id), (r) => (r.id ? null : K.kpis.noSuggestion))}>{K.kpis.suggest}</button>}
        </Buttons>
      )}
      {adding && <KpiForm c={c} ownerDefault={o.owner?.id ?? null} onSave={(v) => act(cp.addKpi(o.id, v), () => { setAdding(false); return null; })} onCancel={() => setAdding(false)} />}
    </div>
  );
}

function KpiRow({ c, k, act, onEdit }: { c: ComposerPage; k: KpiView; act: Act; onEdit: () => void }) {
  const cp = useApp().repo.composition;
  const unit = k.unit === '%' ? '%' : k.unit ? ` ${k.unit}` : '';
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        <span className="font-semibold text-navy">{k.name}</span> <span className="text-12 text-muted">{k.code}</span>
        <div className="mt-1 flex flex-wrap gap-1">{statusChip(k.confirmed, k.fromAi)}<span className="text-12 text-muted">{k.direction === 'lower_is_better' ? K.kpis.lower : K.kpis.higher}</span></div>
        {k.owner && <div className="text-12 text-muted">{`${K.kpis.owner}: ${k.owner.label}`}</div>}
      </th>
      <td className="py-2 pr-3">
        {k.baseline === null ? '—' : `${formatNumber(k.baseline)}${unit}`}
        {k.measure && <div className="text-12 text-muted">{`${k.measure.name}, ${k.measure.validated ? K.kpis.validated : K.kpis.notValidated}`}</div>}
      </td>
      {k.targets.map((t, i) => <td key={c.years[i]!.fy} className="py-2 pr-3">{t === null ? <span className="text-muted">{K.kpis.noTarget}</span> : `${formatNumber(t)}${unit}`}</td>)}
      <td className="py-2">
        <div className="flex flex-col gap-1">
          {k.canConfirm && <button type="button" className={primary} onClick={() => act(cp.confirmItem('Kpi', k.id))}>{K.confirmItem}</button>}
          {k.canEdit && <button type="button" className={btn} onClick={onEdit}>{K.edit}</button>}
          {(k.canEdit || k.canConfirm) && <button type="button" className={btn} onClick={() => act(cp.remove('Kpi', k.id))}>{K.remove}</button>}
        </div>
      </td>
    </tr>
  );
}

function KpiForm({ c, initial, ownerDefault, onSave, onCancel }: { c: ComposerPage; initial?: KpiView; ownerDefault?: string | null; onSave: (v: KpiInput) => void; onCancel: () => void }) {
  const [v, set] = useState<KpiInput>(initial
    ? { name: initial.name, unit: initial.unit, direction: initial.direction, measureId: initial.measure?.id ?? null, baseline: initial.measure ? null : initial.baseline, ownerPositionId: initial.owner?.id ?? null, targets: initial.targets }
    : { name: '', unit: '', direction: 'higher_is_better', measureId: null, baseline: null, ownerPositionId: ownerDefault ?? null, targets: c.years.map(() => null) });
  const [text, setText] = useState<string[]>(v.targets.map((t) => (t === null ? '' : String(t))));
  const id = `kpi-form-${initial?.id ?? 'new'}`;
  const num = (x: string) => (x.trim() === '' ? null : Number(x.replace(/,/g, '')));
  const pickMeasure = (mid: string) => {
    const m = c.measures.find((x) => x.id === mid);
    set({ ...v, measureId: m ? m.id : null, baseline: m ? null : v.baseline, name: v.name || m?.name || '', unit: v.unit || m?.unit || '' });
  };
  return (
    <div className="mt-3 rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap gap-3">
        <Field id={`${id}-n`} text={K.kpis.name}><input id={`${id}-n`} className={input} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} /></Field>
        <Field id={`${id}-u`} text={K.kpis.unit}><input id={`${id}-u`} className={input} value={v.unit} onChange={(e) => set({ ...v, unit: e.target.value })} /></Field>
        <Field id={`${id}-d`} text={K.kpis.direction}>
          <select id={`${id}-d`} className={input} value={v.direction} onChange={(e) => set({ ...v, direction: e.target.value as KpiInput['direction'] })}>
            <option value="higher_is_better">{K.kpis.higher}</option><option value="lower_is_better">{K.kpis.lower}</option>
          </select>
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        <Field id={`${id}-m`} text={K.kpis.measure}>
          <select id={`${id}-m`} className={input} value={v.measureId ?? ''} onChange={(e) => pickMeasure(e.target.value)}>
            <option value="">{K.kpis.noMeasure}</option>
            {c.measures.map((m) => <option key={m.id} value={m.id}>{`${m.name}: ${formatNumber(m.value)} ${m.unit} (${m.validated ? K.kpis.validated : K.kpis.notValidated})`}</option>)}
          </select>
        </Field>
        {!v.measureId && <Field id={`${id}-b`} text={K.kpis.baseline}><input id={`${id}-b`} inputMode="decimal" className={input} value={v.baseline ?? ''} onChange={(e) => set({ ...v, baseline: num(e.target.value) })} /></Field>}
        <Field id={`${id}-o`} text={K.kpis.owner}><PositionSelect id={`${id}-o`} c={c} value={v.ownerPositionId} onChange={(x) => set({ ...v, ownerPositionId: x })} /></Field>
      </div>
      <fieldset className="mt-2">
        <legend className={label}>{K.kpis.targets}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {c.years.map((y, i) => (
            <div key={y.fy} className="w-28">
              <label htmlFor={`${id}-y${y.fy}`} className="text-12 text-muted">{y.label}</label>
              <input id={`${id}-y${y.fy}`} inputMode="decimal" className={input} value={text[i] ?? ''} onChange={(e) => setText(text.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
        </div>
      </fieldset>
      <Buttons>
        <button type="button" className={primary} onClick={() => onSave({ ...v, targets: text.map(num) })}>{K.save}</button>
        <button type="button" className={btn} onClick={onCancel}>{K.cancel}</button>
      </Buttons>
    </div>
  );
}

/* ───────── Costs ───────── */

function Costs({ c, o, act }: { c: ComposerPage; o: ObjectiveView; act: Act }) {
  const cp = useApp().repo.composition;
  if (!o.costs) return <p className="mt-1 text-13 text-muted">{K.costs.hidden}</p>;
  return (
    <div className="mt-1">
      <p className="text-13 text-muted">{K.costs.text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {c.years.map((y, i) => (
          <div key={y.fy} className="min-w-[9rem]">
            <span className="text-12 text-muted">{y.label}</span>
            {o.canSetCost
              ? <MoneyInput c={c} label={`${K.costs.title} ${y.label}`} value={o.costs![i] ?? null} onSave={(n) => act(cp.setCost(o.id, y.fy, n))} />
              : <div className="text-14 tabular-nums">{o.costs![i] === null ? K.envelopes.none : money(o.costs![i]!, c.currency)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Decision-map rows ───────── */

function Rows({ c, o, act }: { c: ComposerPage; o: ObjectiveView; act: Act }) {
  const cp = useApp().repo.composition;
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<SixPLevel>('process');
  if (!o.rows) return <p className="mt-1 text-13 text-muted">{K.rows.hidden(plural(o.rowCount, 'row'))}</p>;
  const id = `row-form-${o.id}`;
  return (
    <div className="mt-1">
      <p className="text-13 text-muted">{K.rows.text}</p>
      {o.rows.length === 0 && <p className="mt-1 text-13 text-muted">{K.rows.none}</p>}
      <ul className="mt-2 flex flex-col gap-2">{o.rows.map((r) => <Row key={r.id} c={c} o={o} r={r} act={act} />)}</ul>
      {o.canEditRows && !adding && (
        <Buttons>
          <button type="button" className={btn} onClick={() => setAdding(true)}>{K.rows.add}</button>
          {c.aiEnabled && <button type="button" className={btn} onClick={() => act(cp.suggestRows(o.id), (x) => { const n = x.added; return n ? K.rows.rowsAdded(plural(n, 'row')) : K.rows.noRows; })}>{K.rows.suggest}</button>}
        </Buttons>
      )}
      {adding && (
        <div className="mt-2 rounded-lg border border-border bg-white p-3">
          <div className="flex flex-wrap gap-3">
            <Field id={`${id}-d`} text={K.rows.description}><input id={`${id}-d`} className={input} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field id={`${id}-l`} text={K.rows.level}><LevelSelect id={`${id}-l`} value={level} onChange={setLevel} /></Field>
          </div>
          <Buttons>
            <button type="button" className={primary} onClick={() => act(cp.addRow(o.id, { description, level }), () => { setAdding(false); setDescription(''); return null; })}>{K.save}</button>
            <button type="button" className={btn} onClick={() => setAdding(false)}>{K.cancel}</button>
          </Buttons>
        </div>
      )}
    </div>
  );
}

const LevelSelect = ({ id, value, onChange }: { id: string; value: SixPLevel; onChange: (l: SixPLevel) => void }) => (
  <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value as SixPLevel)}>
    {SIX_P_LEVELS.map((l) => <option key={l} value={l}>{en.sixP[l]}</option>)}
  </select>
);

function Row({ c, o, r, act }: { c: ComposerPage; o: ObjectiveView; r: RowView; act: Act }) {
  const cp = useApp().repo.composition;
  const [adding, setAdding] = useState(false);
  const [v, set] = useState({ kpiId: o.kpis[0]?.id ?? '', title: '', level: r.level, ownerPositionId: o.owner?.id ?? '', evidence: '', year: c.years[0]?.fy ?? 0 });
  const id = `corr-${r.id}`;
  const yearLabel = (fy: number) => c.years.find((y) => y.fy === fy)?.label ?? String(fy);
  return (
    <li className="rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2"><SixPChip level={r.level} /><span className="text-14">{r.description}</span>{r.draft && <Chip tone="advisory">{K.status.aiDraft}</Chip>}</div>
      {r.corrective.length === 0 ? <p className="mt-1 text-13 text-advisory-text">{K.rows.noCorrective}</p> : (
        <ul className="mt-1">{r.corrective.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-13">
            {a.level && <SixPChip level={a.level} />}<span>{K.rows.corrective(a.code, a.title, yearLabel(a.year))}</span>
            {r.canEdit && <button type="button" className={link} onClick={() => act(cp.unlinkCorrective(r.id, a.id))}>{K.rows.unlink}</button>}
          </li>
        ))}</ul>
      )}
      {r.canEdit && !adding && (
        <Buttons>
          {r.draft && <button type="button" className={primary} onClick={() => act(cp.acceptRow(r.id))}>{K.rows.accept}</button>}
          {o.kpis.length > 0 && <button type="button" className={btn} onClick={() => setAdding(true)}>{K.rows.addCorrective}</button>}
          {r.corrective.length === 0 && <button type="button" className={btn} onClick={() => act(cp.remove('Deficiency', r.id))}>{K.remove}</button>}
        </Buttons>
      )}
      {r.canEdit && o.kpis.length === 0 && <p className="mt-1 text-13 text-muted">{K.rows.needKpi}</p>}
      {adding && (
        <div className="mt-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-3">
            <Field id={`${id}-k`} text={K.rows.kpi}>
              <select id={`${id}-k`} className={input} value={v.kpiId} onChange={(e) => set({ ...v, kpiId: e.target.value })}>
                {o.kpis.map((k) => <option key={k.id} value={k.id}>{`${k.code} ${k.name}`}</option>)}
              </select>
            </Field>
            <Field id={`${id}-y`} text={K.rows.year}>
              <select id={`${id}-y`} className={input} value={v.year} onChange={(e) => set({ ...v, year: Number(e.target.value) })}>
                {c.years.map((y) => <option key={y.fy} value={y.fy}>{y.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Field id={`${id}-t`} text={K.rows.activity}><input id={`${id}-t`} className={input} value={v.title} onChange={(e) => set({ ...v, title: e.target.value })} /></Field>
            <Field id={`${id}-l`} text={K.rows.activityLevel}><LevelSelect id={`${id}-l`} value={v.level} onChange={(level) => set({ ...v, level })} /></Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Field id={`${id}-o`} text={K.rows.owner}><PositionSelect id={`${id}-o`} c={c} required value={v.ownerPositionId || null} onChange={(x) => set({ ...v, ownerPositionId: x ?? '' })} /></Field>
            <Field id={`${id}-e`} text={K.rows.evidence}><input id={`${id}-e`} className={input} value={v.evidence} onChange={(e) => set({ ...v, evidence: e.target.value })} /></Field>
          </div>
          <Buttons>
            <button type="button" className={primary} onClick={() => act(cp.addCorrective(r.id, v), () => { setAdding(false); return null; })}>{K.save}</button>
            <button type="button" className={btn} onClick={() => setAdding(false)}>{K.cancel}</button>
          </Buttons>
        </div>
      )}
    </li>
  );
}

/* ───────── Checks and confirmation ───────── */

function Checks({ c }: { c: ComposerPage }) {
  const { must, worth } = c.checks;
  return (
    <section className={card} aria-labelledby="checks-title">
      <h3 id="checks-title" className="text-16 font-bold text-navy">{K.checks.title}</h3>
      {must.length === 0 && worth.length === 0 && <p className="mt-2 text-14 text-muted">{K.checks.ok}</p>}
      {must.length > 0 && <CheckBox tone="block" title={K.checks.must}><ul className="flex flex-col gap-1">{must.map((m) => <li key={m.kind}>{mustText(m)}</li>)}</ul></CheckBox>}
      {worth.length > 0 && (
        <CheckBox tone="advisory" title={K.checks.worth}>
          <ul className="flex flex-col gap-1">{worth.map((w) => <li key={w.key}>{w.message}{w.years.length > 0 && ` ${K.checks.years(en.list(w.years))}`}</li>)}</ul>
        </CheckBox>
      )}
    </section>
  );
}

function Confirm({ c, act }: { c: ComposerPage; act: Act }) {
  const cp = useApp().repo.composition;
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const k = c.confirm;
  return (
    <section className={card} aria-labelledby="confirm-title">
      <h3 id="confirm-title" className="text-16 font-bold text-navy">{K.confirm.title}</h3>
      {k.confirmed ? (
        <>
          <p className="mt-2 text-14 text-complete-text">{K.confirm.confirmed(k.confirmed.by, formatDate(k.confirmed.on))}{k.confirmed.ref ? ` ${K.confirm.ref(k.confirmed.ref)}` : ''}</p>
          {k.status === 'confirmed' && <p className="mt-1 text-13 text-muted">{K.confirm.nextYear}</p>}
        </>
      ) : (
        <>
          <p className="mt-2 text-14">{k.sentBy ? K.confirm.sentBy(k.sentBy) : K.confirm.notSent}</p>
          {k.canSend && <Buttons><button type="button" className={primary} disabled={c.checks.must.length > 0} onClick={() => act(cp.send())}>{K.confirm.send}</button></Buttons>}
          {k.canConfirm && (
            <div className="mt-3">
              {k.boardRequired && (
                <>
                  <p className="text-13 text-muted">{K.confirm.boardNote}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Field id="board-ref" text={K.confirm.board}><input id="board-ref" className={input} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
                    <Field id="board-date" text={K.confirm.boardDate}><input id="board-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  </div>
                </>
              )}
              <p className="mt-2 text-13 text-muted">{K.confirm.worthNote}</p>
              <Buttons>
                <button type="button" className={primary} disabled={c.checks.must.length > 0}
                  onClick={() => act(cp.confirmPlan(k.boardRequired ? { resolutionRef: ref, date: date as ISODate } : null))}>{K.confirm.confirm}</button>
              </Buttons>
            </div>
          )}
        </>
      )}
    </section>
  );
}
