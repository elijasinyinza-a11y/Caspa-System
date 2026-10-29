/**
 * The six-point decision map (Build Brief, screen 6; BUILD-BRIEF section 22) and its entry points on record pages.
 * Layout as Clarity Specification section 10: all six levels kept, levels with a deficiency in full, empty levels in one
 * line, an unaddressed row never folded. Every figure comes from the decision-map selector through the data-access layer.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SIX_P_SCOPE, type ReportingFrequency, type SixPLevel } from '../contract/caspa-data-contract';
import { useApp } from '../components/AppContext';
import { BookLine, Explain } from '../components/Explain';
import { FindingCard } from '../components/FindingCard';
import { useShowCodes } from '../components/prefs';
import { SevenCStage } from '../components/WorkspaceHeader';
import type { CorrectiveForm, MapPage } from '../data/access/repository';
import { SIX_P_LEVELS } from '../rules/structure';
import { formatDate } from '../selectors/format';
import type { MapRow } from '../selectors/decision-map';
import { en, type Terms } from '../strings/en';
import { mapHref, nodeHref } from './router';

const FOLD_AT = 6;
const button = 'inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text';
const textButton = 'inline-flex min-h-11 items-center text-13 text-muted underline underline-offset-4 hover:text-navy';
const field = 'mt-1 min-h-11 w-full rounded-lg border border-control bg-white px-2 text-14 text-text';
const rowAnchor = (id: string) => `map-row-${id}`;
const levelAnchor = (l: SixPLevel) => `map-level-${l}`;
const FREQUENCIES: ReportingFrequency[] = ['monthly', 'quarterly', 'biannual', 'annual'];

const focusEl = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
};

/** A level name that opens the book's line and its scope on tap (Clarity Specification, D2). */
function LevelName({ level, className }: { level: SixPLevel; className: string }) {
  return (
    <Explain term={<span className={className}>{en.sixP[level]}</span>} label={en.explain.open(`${en.sixP[level]}, ${en.sixPLevel}`)} triggerClass="inline-flex min-h-11 items-center">
      <span className="block font-semibold">{en.explain.sixPIntro(en.sixP[level])}</span>
      <span className="mt-1 block"><BookLine line={en.book.sixPLevel[level]} /></span>
      <span className="mt-2 block">{en.explain.covers}: {SIX_P_SCOPE[level]}</span>
    </Explain>
  );
}

/* ───────── The page ───────── */

export function DecisionMapPage({ objectiveId, deficiencyId }: { objectiveId: string; deficiencyId?: string }) {
  const { repo } = useApp();
  const [codes, setCodes] = useShowCodes();
  const page = repo.decisionMap(objectiveId);
  const t = repo.settings().termLabels;
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<SixPLevel[]>([]);
  const codesId = useId();

  // Arriving at a row from a check, the activity page or a link scrolls to it and moves focus there (D6-2).
  useEffect(() => {
    if (deficiencyId) setTimeout(() => focusEl(rowAnchor(deficiencyId)), 0);
  }, [deficiencyId]);

  if (!page) {
    return (
      <div className="rounded-xl border border-border bg-white p-6">
        <p className="text-16 text-text">{en.decisionMap.notFound}</p>
        <a href="#/home" className={`${primary} mt-4`}>{en.node.goHome}</a>
      </div>
    );
  }
  const m = page.map;
  const done = (text: string, rowId: string) => {
    setEditing(null);
    setMessage(text);
    setTimeout(() => focusEl(rowAnchor(rowId)), 0);
  };

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-3 text-13">
        <span className="flex items-center gap-2 font-semibold text-cascade-text">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-cascade-mark" />
          {en.nav.cascade}
        </span>
        <SevenCStage stage={en.sevenC.cascade} />
      </p>
      <div className="mb-4 mt-1 rounded-xl border border-t-4 border-border border-t-cascade-mark bg-white px-5 py-4">
        <h1 className="text-22 font-bold text-navy md:text-28">
          <Explain term={en.decisionMap.title} label={en.explain.open(en.decisionMap.title)} triggerClass="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4">
            <span className="block font-semibold">{en.decisionMap.title}</span>
            <span className="mt-1 block"><BookLine line={en.book.decisionMap} /></span>
          </Explain>
        </h1>
        <p className="max-w-[70ch] text-16 text-text">
          <a href={nodeHref('objective', m.objective.id, 'cascade')} className="underline underline-offset-4 hover:text-navy">
            {en.decisionMap.of(t.objective.singular, m.objective.title)}
          </a>
          {codes && <span className="tabular ml-2 text-14 text-muted">{m.objective.code}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-14">
          <span className={m.owner ? 'text-text' : 'text-muted'}>{m.owner ? en.decisionMap.owner(m.owner) : en.decisionMap.noOwner}</span>
          {m.visible && m.total > 0 && (
            m.unaddressed > 0
              ? <span className="rounded-full border border-advisory-border bg-advisory-bg px-3 py-0.5 text-13 font-semibold text-advisory-text">{en.decisionMap.unaddressed(t, m.unaddressed)}</span>
              : <span className="rounded-full border border-complete-border bg-complete-bg px-3 py-0.5 text-13 font-semibold text-complete-text">{en.decisionMap.allAddressed(t)}</span>
          )}
        </div>
      </div>

      {!m.visible ? (
        <section className="max-w-[70ch] rounded-xl border border-border bg-white p-5">
          <p className="text-18 font-semibold text-navy">{en.decisionMap.restricted(t, m.total)}</p>
          <p className="mt-1 text-14 text-muted">{en.decisionMap.restrictedNote(t)}</p>
        </section>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-16 text-text">{en.decisionMap.summary(t, m.total, m.levelsUsed, m.corrective, m.unaddressed)}</p>
            <label htmlFor={codesId} className="flex min-h-11 cursor-pointer items-center gap-2 text-14 text-text">
              <input id={codesId} type="checkbox" checked={codes} onChange={(e) => setCodes(e.target.checked)} className="h-5 w-5 accent-navy" />
              {en.cascadeTree.showCodes}
            </label>
          </div>
          <ul aria-label={en.decisionMap.stripLabel(t)} className="mb-4 flex flex-wrap gap-2">
            {SIX_P_LEVELS.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => focusEl(levelAnchor(l))}
                  aria-label={en.decisionMap.levelCount(en.sixP[l], m.counts[l])}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-14 hover:border-control ${m.counts[l] ? 'text-text' : 'text-muted'}`}
                >
                  {en.sixP[l]} <span className="tabular font-semibold">{m.counts[l]}</span>
                </button>
              </li>
            ))}
          </ul>
          <div role="status" aria-live="polite">
            {message && <p className="mb-3 rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">{message}</p>}
          </div>

          {m.groups.map((g) => {
            const all = expanded.includes(g.level);
            const shown = all ? g.rows : g.rows.filter((r, i) => i < FOLD_AT || r.corrective.length === 0);
            return (
              <section key={g.level} aria-labelledby={`${levelAnchor(g.level)}-h`} className="mb-4 rounded-xl border border-t-4 border-border border-t-cascade-mark bg-white">
                <div id={levelAnchor(g.level)} tabIndex={-1} className="sticky top-16 z-10 flex flex-wrap items-baseline gap-x-3 rounded-t-xl border-b border-border bg-white px-4 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-focus md:static md:px-5">
                  <h2 id={`${levelAnchor(g.level)}-h`} className="text-18 font-bold">
                    <LevelName level={g.level} className="text-cascade-text underline decoration-dotted underline-offset-4" />
                  </h2>
                  <span className="text-13 text-muted">{en.decisionMap.covers(SIX_P_SCOPE[g.level])}</span>
                  <span className="ml-auto text-13 text-muted">{en.decisionMap.count(t, g.rows.length)}</span>
                </div>
                <table className="block w-full text-14 md:table md:table-fixed">
                  <thead className="hidden md:table-header-group">
                    <tr className="text-left text-13 text-muted">
                      <th scope="col" className="w-[22%] px-5 py-2 font-semibold">{t.deficiency.singular}</th>
                      <th scope="col" className="w-[18%] px-4 py-2 font-semibold">{en.decisionMap.column.cause}</th>
                      <th scope="col" className="w-[18%] px-4 py-2 font-semibold">{en.decisionMap.column.effects}</th>
                      <th scope="col" className="w-[30%] px-4 py-2 font-semibold">{en.decisionMap.column.corrective(t)}</th>
                      <th scope="col" className="w-[12%] px-4 py-2 font-semibold">{en.decisionMap.column.timeframe}</th>
                    </tr>
                  </thead>
                  <tbody className="block divide-y divide-border md:table-row-group">
                    {shown.map((r) => (
                      <Row key={r.id} r={r} page={page} t={t} codes={codes} editing={editing === r.id} setEditing={(v) => setEditing(v ? r.id : null)} onDone={(text) => done(text, r.id)} />
                    ))}
                  </tbody>
                </table>
                {(all || shown.length < g.rows.length) && g.rows.length > FOLD_AT && (
                  <button
                    type="button"
                    aria-expanded={all}
                    onClick={() => setExpanded(all ? expanded.filter((x) => x !== g.level) : [...expanded, g.level])}
                    className="block min-h-11 w-full rounded-b-xl border-t border-border px-5 text-left text-14 font-semibold text-navy hover:bg-cream"
                  >
                    {all ? en.decisionMap.showFewer : en.decisionMap.showAll(g.rows.length, en.sixP[g.level])}
                  </button>
                )}
              </section>
            );
          })}

          {m.empty.length === SIX_P_LEVELS.length ? (
            <p className="rounded-xl border border-border bg-white px-5 py-3 text-14 text-muted">{en.decisionMap.emptyAll}</p>
          ) : m.empty.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border bg-white px-5 py-1 text-14">
              <span className="text-muted">{en.decisionMap.emptyAt}</span>
              <span>
                {m.empty.map((l, i) => (
                  <span key={l} id={levelAnchor(l)} tabIndex={-1} className="outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
                    <LevelName level={l} className="text-text underline decoration-dotted underline-offset-4" />
                    {i < m.empty.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
            </p>
          )}
        </>
      )}
    </>
  );
}

/* ───────── One row ───────── */

function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <td className={`block px-4 py-1 align-top md:table-cell md:px-4 md:py-3 ${className}`}>
      <span className="block text-12 font-semibold text-muted md:hidden">{label}</span>
      {children}
    </td>
  );
}

function Row({ r, page, t, codes, editing, setEditing, onDone }: {
  r: MapRow; page: MapPage; t: Terms; codes: boolean; editing: boolean; setEditing: (v: boolean) => void; onDone: (text: string) => void;
}) {
  const { repo } = useApp();
  const [removing, setRemoving] = useState<string | null>(null);
  const check = page.checks[r.id];
  const unlink = (activityId: string) => {
    const res = repo.unlinkCorrective(r.id, activityId);
    setRemoving(null);
    onDone(res.ok ? en.decisionMap.removed : en.decisionMap.errors[res.error]!);
  };
  return (
    <>
      <tr id={rowAnchor(r.id)} tabIndex={-1} className="block py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-focus md:table-row md:py-0">
        <Cell label={t.deficiency.singular} className="font-semibold text-navy md:pl-5">
          {r.description}
          {r.aiDraft && <span className="ml-2 rounded bg-info-bg px-2 py-0.5 text-12 font-semibold text-info-text">{en.decisionMap.aiDraft}</span>}
        </Cell>
        <Cell label={en.decisionMap.column.cause}>{r.probableCause}</Cell>
        <Cell label={en.decisionMap.column.effects}>{r.effects}</Cell>
        <Cell label={en.decisionMap.column.corrective(t)}>
          {r.corrective.length > 0 ? (
            <ul className="space-y-2">
              {r.corrective.map((c) => (
                <li key={c.ref.id}>
                  <a href={nodeHref('activity', c.ref.id, 'cascade')} className="font-semibold text-navy underline underline-offset-4">
                    {c.ref.title}
                  </a>
                  {codes && <span className="tabular ml-2 text-13 text-muted">{c.ref.code}</span>}
                  <span className="block text-13 text-muted">
                    {[c.level ? en.sixP[c.level] : en.noSixP, c.owner, en.activityStatus[c.status]].filter(Boolean).join(' · ')}
                  </span>
                  {c.solvedAt && <span className="block text-13 font-semibold text-cascade-text">{en.decisionMap.solvedAt(en.sixP[c.solvedAt])}</span>}
                  {page.can.link && removing !== c.ref.id && (
                    <button type="button" onClick={() => setRemoving(c.ref.id)} className={textButton} aria-label={en.decisionMap.removeLinkTo(c.ref.title)}>
                      {en.decisionMap.removeLink}
                    </button>
                  )}
                  {removing === c.ref.id && (
                    <div className="mt-2 rounded-lg border border-control bg-white p-3">
                      <p className="text-14 font-semibold text-navy">{en.decisionMap.removeTitle}</p>
                      <p className="mt-1 text-13 text-text">{en.decisionMap.removeBody(t, c.ref.title, r.description, r.corrective.length === 1)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" autoFocus onClick={() => setRemoving(null)} className={button}>{en.decisionMap.keepLink}</button>
                        <button type="button" onClick={() => unlink(c.ref.id)} className={primary}>{en.decisionMap.removeLink}</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : check ? (
            <ul>
              <FindingCard
                view={check}
                short={en.decisionMap.none(t)}
                noFix={!page.can.link}
                fixAction={page.can.link && !editing ? { label: en.decisionMap.add(t), onClick: () => setEditing(true) } : undefined}
              />
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <span className="rounded-full border border-advisory-border bg-advisory-bg px-3 py-0.5 text-13 font-semibold text-advisory-text">{en.decisionMap.none(t)}</span>
              {page.can.link && !editing && <button type="button" onClick={() => setEditing(true)} className={primary}>{en.decisionMap.add(t)}</button>}
            </div>
          )}
        </Cell>
        <Cell label={en.decisionMap.column.timeframe}>{r.timeframe}</Cell>
      </tr>
      {editing && (
        <tr className="block md:table-row">
          <td colSpan={5} className="block px-4 pb-4 md:table-cell md:px-5">
            <CorrectivePanel deficiencyId={r.id} t={t} codes={codes} onCancel={() => setEditing(false)} onDone={onDone} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────── "Add corrective activity" (D6-1) ───────── */

function CorrectivePanel({ deficiencyId, t, codes, onCancel, onDone }: { deficiencyId: string; t: Terms; codes: boolean; onCancel: () => void; onDone: (text: string) => void }) {
  const { repo } = useApp();
  const form = repo.correctiveForm(deficiencyId);
  const [mode, setMode] = useState<'link' | 'add'>('link');
  const headingId = useId();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  if (!form) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-control bg-white p-4">
      <h3 id={headingId} className="text-16 font-bold text-navy">{en.decisionMap.add(t)}</h3>
      <p className="text-13 text-muted">{en.decisionMap.panelFor(form.deficiency.description, en.sixP[form.deficiency.level])}</p>
      <div role="group" aria-label={en.decisionMap.howLabel} className="mt-3 flex flex-wrap gap-2">
        <button ref={first} type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')} className={mode === 'link' ? primary : button}>{en.decisionMap.linkTab(t)}</button>
        {form.add && <button type="button" aria-pressed={mode === 'add'} onClick={() => setMode('add')} className={mode === 'add' ? primary : button}>{en.decisionMap.addTab(t)}</button>}
      </div>
      {!form.add && <p className="mt-2 text-13 text-muted">{en.decisionMap.cannotAdd(t)}</p>}
      {mode === 'link' ? <LinkChoice form={form} t={t} codes={codes} onCancel={onCancel} onDone={onDone} /> : <AddForm form={form} t={t} onCancel={onCancel} onDone={onDone} />}
    </section>
  );
}

function LinkChoice({ form, t, codes, onCancel, onDone }: { form: CorrectiveForm; t: Terms; codes: boolean; onCancel: () => void; onDone: (text: string) => void }) {
  const { repo } = useApp();
  const [choice, setChoice] = useState(form.options[0]?.ref.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const name = useId();
  const level = form.deficiency.level;
  if (form.options.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-14 text-text">{en.decisionMap.allLinked(t)}</p>
        <button type="button" onClick={onCancel} className={`${button} mt-2`}>{en.decisionMap.cancel}</button>
      </div>
    );
  }
  const save = () => {
    const r = repo.linkCorrective(form.deficiency.id, choice);
    if (r.ok) onDone(en.decisionMap.linked(form.options.find((o) => o.ref.id === choice)?.ref.title ?? ''));
    else setError(en.decisionMap.errors[r.error]!);
  };
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">{en.decisionMap.optionsLabel(t)}</legend>
      <div className="space-y-2">
        {form.options.map((o) => (
          <label key={o.ref.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-control">
            <input type="radio" name={name} value={o.ref.id} checked={choice === o.ref.id} onChange={() => { setChoice(o.ref.id); setError(null); }} className="mt-1 h-5 w-5 accent-navy" />
            <span>
              <span className="font-semibold text-navy">{o.ref.title}</span>
              {codes && <span className="tabular ml-2 text-13 text-muted">{o.ref.code}</span>}
              <span className="block text-13 text-muted">
                {[o.level ? en.sixP[o.level] : en.noSixP, o.owner, o.level === level ? en.decisionMap.sameLevel(t) : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </label>
        ))}
      </div>
      {!form.options.some((o) => o.level === level) && <p className="mt-2 text-13 text-muted">{en.decisionMap.noneAtLevel(t, en.sixP[level])}</p>}
      {error && <p role="alert" className="mt-2 text-13 font-semibold text-block-text">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={primary}>{en.decisionMap.linkButton(t)}</button>
        <button type="button" onClick={onCancel} className={button}>{en.decisionMap.cancel}</button>
      </div>
    </fieldset>
  );
}

function AddForm({ form, t, onCancel, onDone }: { form: CorrectiveForm; t: Terms; onCancel: () => void; onDone: (text: string) => void }) {
  const { repo } = useApp();
  const add = form.add!;
  const [kpiId, setKpiId] = useState(add.kpis[0]?.ref.id ?? '');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<SixPLevel>(form.deficiency.level);
  const [owner, setOwner] = useState('');
  const [evidence, setEvidence] = useState('');
  const [frequency, setFrequency] = useState<ReportingFrequency>('monthly');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const code = add.kpis.find((k) => k.ref.id === kpiId)?.nextCode ?? '';
  const save = () => {
    const quantity = qty.trim() || unit.trim() ? { value: Number(qty), unit } : null;
    const r = repo.addCorrectiveActivity(form.deficiency.id, { kpiId, title, level, ownerPositionId: owner, evidence, frequency, quantity });
    if (r.ok) onDone(en.decisionMap.added(r.code, title.trim()));
    else {
      setError(en.decisionMap.errors[r.error]!);
      setTimeout(() => errorRef.current?.focus(), 0);
    }
  };
  const label = 'block text-14 font-semibold text-navy';
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-13 font-semibold text-block-text md:col-span-2">{error}</p>}
      <div className="md:col-span-2">
        <label htmlFor={`${id}-kpi`} className={label}>{en.decisionMap.kpi(t)}</label>
        <select id={`${id}-kpi`} value={kpiId} onChange={(e) => setKpiId(e.target.value)} className={field} aria-describedby={`${id}-code`}>
          {add.kpis.map((k) => <option key={k.ref.id} value={k.ref.id}>{`${k.ref.code} ${k.ref.title}`}</option>)}
        </select>
        <p id={`${id}-code`} className="mt-1 text-12 text-muted">{en.decisionMap.codeGiven(code)}</p>
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${id}-title`} className={label}>{en.decisionMap.titleField}</label>
        <input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={en.decisionMap.titleHint} autoComplete="off" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-level`} className={label}>{en.sixPLevel}</label>
        <select id={`${id}-level`} value={level} onChange={(e) => setLevel(e.target.value as SixPLevel)} className={field} aria-describedby={`${id}-level-hint`}>
          {SIX_P_LEVELS.map((l) => <option key={l} value={l}>{en.sixP[l]}</option>)}
        </select>
        <p id={`${id}-level-hint`} className="mt-1 text-12 text-muted">{en.decisionMap.levelHint(t)}</p>
      </div>
      <div>
        <label htmlFor={`${id}-owner`} className={label}>{en.decisionMap.ownerField}</label>
        <select id={`${id}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)} className={field}>
          <option value="">{en.decisionMap.ownerChoose}</option>
          {add.positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-ev`} className={label}>{en.decisionMap.evidenceField}</label>
        <input id={`${id}-ev`} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder={en.decisionMap.evidenceHint} autoComplete="off" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-freq`} className={label}>{en.decisionMap.frequencyField}</label>
        <select id={`${id}-freq`} value={frequency} onChange={(e) => setFrequency(e.target.value as ReportingFrequency)} className={field}>
          {FREQUENCIES.map((f) => <option key={f} value={f}>{en.frequency[f]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-qty`} className={label}>{en.decisionMap.quantityField} <span className="font-normal text-muted">{en.decisionMap.optional}</span></label>
        <input id={`${id}-qty`} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" autoComplete="off" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-unit`} className={label}>{en.decisionMap.unitField} <span className="font-normal text-muted">{en.decisionMap.optional}</span></label>
        <input id={`${id}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} autoComplete="off" className={field} />
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <button type="button" onClick={save} className={primary}>{en.decisionMap.addButton(t)}</button>
        <button type="button" onClick={onCancel} className={button}>{en.decisionMap.cancel}</button>
      </div>
    </div>
  );
}

/* ───────── Entry points on record pages ───────── */

/** On an objective's "How it's done": the map's summary and its link (D6-2). */
export function MapSummary({ objectiveId }: { objectiveId: string }) {
  const { repo } = useApp();
  const page = repo.decisionMap(objectiveId);
  const t = repo.settings().termLabels;
  if (!page) return null;
  const m = page.map;
  return (
    <div className="border-t border-border pt-3">
      <h3 className="text-14 font-semibold text-navy">{en.decisionMap.title}</h3>
      <p className="mt-1 text-14 text-text">{m.visible ? en.decisionMap.onObjective(t, m.total, m.unaddressed) : en.decisionMap.restricted(t, m.total)}</p>
      {m.visible && <a href={mapHref(objectiveId)} className="inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4">{en.decisionMap.open}</a>}
    </div>
  );
}

/** On an activity's "How it's done": "Change level" (D6-6), "Corrects:" (D6-2) and the level history. */
export function ActivityLevel({ activityId, title, level }: { activityId: string; title: string; level: SixPLevel | null }) {
  const { repo } = useApp();
  const v = repo.activityLevel(activityId);
  const t = repo.settings().termLabels;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  if (!v) return null;
  return (
    <>
      {v.canChange && !open && (
        <button ref={opener} type="button" onClick={() => { setOpen(true); setMessage(null); }} className={button}>{en.levelChange.button}</button>
      )}
      {open && level && (
        <LevelForm
          activityId={activityId} title={title} level={level} t={t}
          commitments={v.commitments} corrects={v.corrects ?? []}
          onClose={(text) => { setOpen(false); setMessage(text); setTimeout(() => opener.current?.focus(), 0); }}
        />
      )}
      <div role="status" aria-live="polite">
        {message && <p className="rounded-lg border border-complete-border bg-complete-bg px-3 py-2 text-14 text-complete-text">{message}</p>}
      </div>
      {v.corrects && v.corrects.length > 0 && (
        <p className="text-14 text-text">
          <span className="text-muted">{en.decisionMap.corrects} </span>
          {v.corrects.map((d, i) => (
            <span key={d.id}>
              <a href={mapHref(d.objectiveId, d.id)} className="underline underline-offset-4 hover:text-navy">{d.description}</a> ({en.sixP[d.level]})
              {level && level !== d.level && <span className="font-semibold text-cascade-text"> · {en.decisionMap.solvedAt(en.sixP[level])}</span>}
              {i < v.corrects!.length - 1 ? '; ' : ''}
            </span>
          ))}
        </p>
      )}
      {v.history.length > 0 && (
        <div>
          <h3 className="text-14 font-semibold text-navy">{en.levelChange.history}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-13 text-text">
            {v.history.map((h, i) => (
              <li key={i}>{en.levelChange.historyItem(h.from ? en.sixP[h.from] : en.noSixP, en.sixP[h.to], h.by, formatDate(h.on), h.reason)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LevelForm({ activityId, title, level, t, commitments, corrects, onClose }: {
  activityId: string; title: string; level: SixPLevel; t: Terms; commitments: number;
  corrects: { description: string; level: SixPLevel }[]; onClose: (message: string | null) => void;
}) {
  const { repo } = useApp();
  const [to, setTo] = useState<SixPLevel>(level);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const name = useId();
  const reasonId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const follows = to === level ? [] : [
    ...(commitments ? [en.levelChange.commitments(t, commitments)] : []),
    ...corrects.map((d) => en.levelChange.corrects(d.description, en.sixP[d.level], to !== d.level ? en.sixP[to] : null)),
  ];
  const save = () => {
    const r = repo.changeActivityLevel(activityId, to, reason);
    if (r.ok) onClose(en.levelChange.done(en.sixP[to], commitments));
    else {
      setError(en.levelChange.errors[r.error]!(en.sixP[level]));
      setTimeout(() => errorRef.current?.focus(), 0);
    }
  };
  return (
    <section aria-label={en.levelChange.title} className="rounded-lg border border-control bg-white p-4">
      <h3 className="text-16 font-bold text-navy">{en.levelChange.title}</h3>
      <p className="text-13 text-muted">{en.levelChange.now(title, en.sixP[level])}</p>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-2 text-13 font-semibold text-block-text">{error}</p>}
      <fieldset className="mt-3">
        <legend className="text-14 font-semibold text-navy">{en.levelChange.legend}</legend>
        <div className="mt-2 space-y-2">
          {SIX_P_LEVELS.map((l, i) => (
            <label key={l} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-control">
              <input ref={i === 0 ? first : undefined} type="radio" name={name} value={l} checked={to === l} onChange={() => { setTo(l); setError(null); }} className="mt-1 h-5 w-5 accent-navy" />
              <span>
                <span className="font-semibold text-navy">{en.sixP[l]}</span>
                {l === level && <span className="ml-2 text-13 text-muted">{en.levelChange.current}</span>}
                <span className="block text-13 text-muted">{en.explain.covers}: {SIX_P_SCOPE[l]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={reasonId} className="mt-3 block text-14 font-semibold text-navy">{en.levelChange.reason}</label>
      <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${reasonId}-hint`} className="mt-1 w-full rounded-lg border border-control bg-white p-2 text-14 text-text" />
      <p id={`${reasonId}-hint`} className="text-12 text-muted">{en.levelChange.reasonHint}</p>
      {follows.length > 0 && (
        <div className="mt-3 rounded-lg border border-advisory-border bg-advisory-bg p-3 text-13 text-advisory-text">
          <p className="font-semibold">{en.levelChange.follows}</p>
          {follows.map((f) => <p key={f} className="mt-1">{f}</p>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={primary}>{en.levelChange.save}</button>
        <button type="button" onClick={() => onClose(null)} className={button}>{en.levelChange.cancel}</button>
      </div>
    </section>
  );
}

