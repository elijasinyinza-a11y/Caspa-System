/**
 * Strategy formation, part 11b: Conception (Strategy Formation Specification v1.0, F1; BUILD-BRIEF section 31).
 * The 4Q board in the layout of Table 2 with a workshop view, department sheets and the AI interview, source
 * documents and AI-drafted cards, consolidation, and vision and mission with their confirmation. Behaviour from the
 * approved Strategy workspace prototype (`reference/caspa-strategy-prototype.html`).
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../components/AppContext';
import { BookLine, Explain } from '../components/Explain';
import { Dialog } from '../components/Dialog';
import type { CardView, ConceptionPage, DepartmentView } from '../data/access/conception';
import type { FourQCell, SourceDocument } from '../contract/caspa-data-contract';
import { BANDS, CELLS, cellKey, cellOfKey } from '../rules/conception';
import { formatDate, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, input, label, plural, primary } from './organisation/ui';

const C = en.conception;
type Band = (typeof BANDS)[number];
const cellName = (c: FourQCell) => en.fourQ.cell(c);

/* ───────── One card ───────── */

function StateChip({ state }: { state: CardView['state'] }) {
  if (state === 'ai_draft') return <Chip tone="advisory">{C.card.aiDraft}</Chip>;
  if (state === 'accepted') return <Chip tone="complete">{C.card.accepted}</Chip>;
  if (state === 'human') return <Chip tone="complete">{C.card.written}</Chip>;
  return <Chip tone="info">{C.card.rejected}</Chip>;
}

export function Card({ c, large = false, onDone }: { c: CardView; large?: boolean; onDone?: (note: string | null) => void }) {
  const { repo } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const [error, setError] = useState<string | null>(null);
  const draft = c.state === 'ai_draft';
  const save = () => {
    const r = repo.conception.updateCard(c.id, { text });
    if (r.ok) { setEditing(false); setError(null); onDone?.(null); } else setError(C.card.required);
  };
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border p-3 ${draft ? 'border-advisory-border bg-advisory-bg' : 'border-border bg-white'}`}>
      {editing ? (
        <div>
          <label htmlFor={`card-${c.id}`} className={label}>{C.card.text}</label>
          <textarea id={`card-${c.id}`} rows={2} className={`${input} py-2`} value={text} onChange={(e) => setText(e.target.value)} />
          {error && <p className="mt-1 text-13 text-block-text">{error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={save}>{draft ? C.card.correct : C.card.save}</button>
            <button type="button" className={btn} onClick={() => { setEditing(false); setText(c.text); setError(null); }}>{C.card.cancel}</button>
          </div>
        </div>
      ) : <span className={`${large ? 'text-22' : 'text-14'} font-semibold text-navy`}>{c.text}</span>}
      <span className={`${large ? 'text-14' : 'text-12'} text-muted`}>
        {c.units.length ? `${C.card.from(en.list(c.units))}. ` : ''}{c.source}.{c.evidence ? ` ${C.card.evidence(c.evidence)}.` : ''}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StateChip state={c.state} />
        {c.merged > 0 && <span className="text-12 text-muted">{C.card.merged(formatNumber(c.merged))}</span>}
      </span>
      {c.canDecide && !editing && !large && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={C.card.actionsFor(c.text)}>
          {draft && <button type="button" className={primary} onClick={() => { repo.conception.updateCard(c.id, { decision: 'accept' }); onDone?.(null); }}>{C.card.accept}</button>}
          <button type="button" className={btn} onClick={() => setEditing(true)}>{draft ? C.card.correct : C.card.edit}</button>
          {draft && <button type="button" className={btn} onClick={() => { repo.conception.updateCard(c.id, { decision: 'reject' }); onDone?.(null); }}>{C.card.reject}</button>}
        </div>
      )}
    </div>
  );
}

/* ───────── Adding a card ───────── */

function AddCard({ unitId, title, intro, idPrefix }: { unitId: string | null; title: string; intro: string; idPrefix: string }) {
  const { repo } = useApp();
  const [cell, setCell] = useState(cellKey(CELLS[0]!));
  const [text, setText] = useState('');
  const [evidence, setEvidence] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const add = () => {
    const r = repo.conception.addCard({ cell: cellOfKey(cell)!, text, unitId, evidence: evidence || null });
    if (r.ok) { setText(''); setEvidence(''); setNote({ ok: true, text: C.add.added }); } else setNote({ ok: false, text: C.card.required });
  };
  return (
    <section className={card} aria-labelledby={`${idPrefix}-add`}>
      <h3 id={`${idPrefix}-add`} className="text-16 font-bold text-navy">{title}</h3>
      <p className="mt-1 text-13 text-muted">{intro}</p>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <div><label htmlFor={`${idPrefix}-cell`} className={label}>{C.add.section}</label>
          <select id={`${idPrefix}-cell`} className={input} value={cell} onChange={(e) => setCell(e.target.value)}>
            {CELLS.map((c) => <option key={cellKey(c)} value={cellKey(c)}>{cellName(c)}</option>)}
          </select></div>
        <div><label htmlFor={`${idPrefix}-text`} className={label}>{C.card.text}</label>
          <input id={`${idPrefix}-text`} className={input} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div className="md:col-span-2"><label htmlFor={`${idPrefix}-ev`} className={label}>{C.card.evidenceLabel}</label>
          <input id={`${idPrefix}-ev`} className={input} value={evidence} aria-describedby={`${idPrefix}-ev-hint`} onChange={(e) => setEvidence(e.target.value)} />
          <p id={`${idPrefix}-ev-hint`} className="mt-1 text-12 text-muted">{C.card.evidenceHint}</p></div>
      </div>
      {note && <p role="status" className={`mt-2 text-13 ${note.ok ? 'text-complete-text' : 'text-block-text'}`}>{note.text}</p>}
      <button type="button" className={`${btn} mt-3`} onClick={add}>{C.add.button}</button>
    </section>
  );
}

/* ───────── The 4Q board (organisation sheet, Table 2) ───────── */

function BandTitle({ band, dark = false }: { band: Band; dark?: boolean }) {
  return (
    <Explain term={<span className={`text-16 font-bold ${dark ? 'text-white' : 'text-navy'}`}>{en.fourQ.band[band]}</span>}
      triggerClass={`inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4 ${dark ? 'text-white' : ''}`}>
      <BookLine line={en.book.fourQBand[band]} />
    </Explain>
  );
}

function Progress({ c, openVision }: { c: ConceptionPage; openVision?: () => void }) {
  const ready = c.filled === CELLS.length;
  return (
    <div className={`rounded-lg border p-3 ${ready ? 'border-complete-border bg-complete-bg' : 'border-info-border bg-info-bg'}`}>
      <p className="text-14 font-semibold text-navy">{C.board.progress(formatNumber(c.filled), formatNumber(CELLS.length))}</p>
      <p className="mt-1 text-13 text-text">{ready ? C.board.ready : C.board.readyNeeded}</p>
      {ready && openVision && !c.vision.confirmed && <button type="button" className={`${btn} mt-2`} onClick={openVision}>{C.board.openVision}</button>}
    </div>
  );
}

function BoardBands({ c, focus, large = false }: { c: ConceptionPage; focus: Band | 'all'; large?: boolean }) {
  return (
    <>
      {BANDS.filter((b) => focus === 'all' || focus === b).map((b) => (
        <section key={b} aria-label={en.fourQ.band[b]} className={`rounded-xl p-4 ${large ? 'bg-text' : 'border border-border bg-cream'}`}>
          <BandTitle band={b} dark={large} />
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-4">
            {c.board.filter((x) => x.cell.band === b).map((x) => (
              <div key={cellKey(x.cell)} className="flex min-w-0 flex-col gap-2">
                <h4 className={`${large ? 'text-18 text-white' : 'text-14 text-navy'} font-semibold`}>{en.fourQ.cellName(x.cell)}</h4>
                {x.cards.map((card) => <Card key={card.id} c={card} large={large} />)}
                {!x.filled && <p className={`rounded-lg border border-dashed p-3 ${large ? 'border-border text-14 text-white' : 'border-control text-13 text-muted'}`}>{C.board.empty}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function FocusPicker({ focus, setFocus, dark = false }: { focus: Band | 'all'; setFocus: (f: Band | 'all') => void; dark?: boolean }) {
  const opts: [Band | 'all', string][] = [['all', C.board.all], ...BANDS.map((b) => [b, en.fourQ.band[b]] as [Band, string])];
  return (
    <div role="group" aria-label={C.board.focus} className="flex flex-wrap gap-2">
      {opts.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={focus === k} onClick={() => setFocus(k)}
          className={`min-h-11 rounded-lg px-4 text-14 font-semibold ${focus === k ? (dark ? 'bg-white text-navy' : 'bg-navy text-white') : (dark ? 'border border-border text-white' : 'border border-control bg-white text-navy hover:border-navy')}`}>{l}</button>
      ))}
    </div>
  );
}

export function Board({ c, openVision }: { c: ConceptionPage; openVision: () => void }) {
  const [focus, setFocus] = useState<Band | 'all'>('all');
  const [workshop, setWorkshop] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {c.stage === 'not_started' && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{C.stageNotOpen}</p>}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-[1_1_18rem]">
            <h3 className="text-18 font-bold text-navy">
              <Explain term={C.model}><BookLine line={en.book.fourQ} /></Explain>
            </h3>
            <p className="mt-1 text-13 text-muted">{C.board.intro}</p>
          </div>
          <button type="button" className={btn} onClick={() => setWorkshop(true)}>{C.board.workshop}</button>
        </div>
        <div className="mt-3"><Progress c={c} openVision={openVision} /></div>
        {c.hiddenOnBoard > 0 && <p className="mt-2 text-13 text-muted">{C.board.hidden(formatNumber(c.hiddenOnBoard))}</p>}
        <div className="mt-3"><FocusPicker focus={focus} setFocus={setFocus} /></div>
      </div>
      <BoardBands c={c} focus={focus} />
      {c.canCurate && <Duplicates c={c} />}
      {c.canCurate && <AddCard unitId={null} title={C.add.title} intro={C.add.intro} idPrefix="board" />}
      {c.seesAll && <DepartmentSheets c={c} />}
      {workshop && <WorkshopView c={c} onClose={() => setWorkshop(false)} />}
    </div>
  );
}

/* ───────── Workshop view: full screen, large type, minimal controls ───────── */

function WorkshopView({ c, onClose }: { c: ConceptionPage; onClose: () => void }) {
  const [focus, setFocus] = useState<Band | 'all'>('all');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; opener?.focus(); };
    // Open once; onClose may change identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ws-title" className="fixed inset-0 z-40 overflow-y-auto bg-navy p-4 text-white sm:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-[1_1_18rem]">
            <h2 id="ws-title" ref={heading} tabIndex={-1} className="text-28 font-bold text-white outline-none">{C.workshop.title}</h2>
            <p className="mt-1 text-16 text-white">{C.workshop.note}</p>
          </div>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-14 font-semibold text-navy" onClick={onClose}>{C.workshop.leave}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FocusPicker focus={focus} setFocus={setFocus} dark />
          <p className="text-18 font-semibold text-white">{C.board.progress(formatNumber(c.filled), formatNumber(CELLS.length))}</p>
        </div>
        <BoardBands c={c} focus={focus} large />
        {c.canCurate && <div className="text-text"><AddCard unitId={null} title={C.add.sessionTitle} intro={C.add.intro} idPrefix="ws" /></div>}
      </div>
    </div>
  );
}

/* ───────── Possible duplicates (AI suggestion; people decide) ───────── */

function Duplicates({ c }: { c: ConceptionPage }) {
  const { repo } = useApp();
  const [pairs, setPairs] = useState<[CardView, CardView][] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const find = async () => {
    const r = await repo.conception.findDuplicates();
    if (r.ok) { setPairs(r.pairs); setNote(null); }
  };
  const drop = (a: string, b: string) => setPairs((p) => (p ?? []).filter(([x, y]) => !(x.id === a && y.id === b)));
  if (!c.aiEnabled) return null;
  return (
    <section className={card} aria-labelledby="dupes">
      <h3 id="dupes" className="text-16 font-bold text-navy">{C.duplicates.title}</h3>
      <p className="mt-1 text-13 text-muted">{C.duplicates.intro}</p>
      {note && <p role="status" className="mt-2 text-13 text-complete-text">{note}</p>}
      {pairs && !pairs.length && !note && <p className="mt-2 text-14">{C.duplicates.none}</p>}
      {pairs?.map(([a, b]) => (
        <CheckBox key={`${a.id}|${b.id}`} tone="advisory" title={C.duplicates.label}>
          <p>{C.duplicates.pair(a.text, b.text)}</p>
          <p className="mt-1 text-12 text-muted">{cellName(a.cell)} · {en.list([...new Set([...a.units, ...b.units])])}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => { if (repo.conception.merge(a.id, b.id).ok) { drop(a.id, b.id); setNote(C.duplicates.merged); } }}>{C.duplicates.merge}</button>
            <button type="button" className={btn} onClick={() => { if (repo.conception.keepSeparate(a.id, b.id).ok) drop(a.id, b.id); }}>{C.duplicates.keep}</button>
          </div>
        </CheckBox>
      ))}
      <button type="button" className={`${btn} mt-3`} onClick={find}>{C.duplicates.find}</button>
    </section>
  );
}

/* ───────── Department sheets and consolidation ───────── */

function DepartmentSheets({ c }: { c: ConceptionPage }) {
  const { repo } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const D = C.departments;
  return (
    <section className={card} aria-labelledby="dept-sheets">
      <h3 id="dept-sheets" className="text-16 font-bold text-navy">{D.title}</h3>
      <p className="mt-1 text-13 text-muted">{D.intro}</p>
      {note && <p role="status" className="mt-2 text-13 text-complete-text">{note}</p>}
      <ul className="mt-2 divide-y divide-border">
        {c.departments.map((d) => (
          <li key={d.unitId} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-[1_1_16rem]">
                <p className="text-14 font-semibold text-navy">{d.name}</p>
                <p className="text-12 text-muted">{D.head}: {d.head ? `${d.head} (${d.holder ?? D.vacant})` : D.vacant}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={d.submitted ? 'complete' : 'info'}>{d.submittedOn ? D.sentOn(formatDate(d.submittedOn)) : D.notSent}</Chip>
                {d.toCheck > 0 && <Chip tone="advisory">{`${D.toCheck}: ${formatNumber(d.toCheck)}`}</Chip>}
              </div>
            </div>
            <p className="mt-1 text-13 text-text">
              {D.interview}: {d.interviewed ? D.done : D.notDone} · {D.waiting}: {formatNumber(d.waiting)} · {D.onBoard}: {formatNumber(d.consolidated)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.canCurate && d.waiting > 0 && (
                <button type="button" className={primary} onClick={() => { const r = repo.conception.consolidate(d.unitId); if (r.ok) setNote(D.consolidated(plural(r.moved, 'card'), d.name)); }}>
                  {D.consolidate(plural(d.waiting, 'card'))}
                </button>
              )}
              <button type="button" className={btn} aria-expanded={open === d.unitId} onClick={() => setOpen(open === d.unitId ? null : d.unitId)}>
                {open === d.unitId ? D.hide : D.show(d.name, formatNumber(d.sheet.length))}
              </button>
            </div>
            {open === d.unitId && (
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
                {d.sheet.length ? d.sheet.map((x) => <div key={x.id}><p className="mb-1 text-12 font-semibold text-navy">{cellName(x.cell)}</p><Card c={x} /></div>) : <p className="text-13 text-muted">{D.sheetEmpty}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────── A department's part: checklist, interview, its cards ───────── */

export function MyPart({ c }: { c: ConceptionPage }) {
  return (
    <div className="flex flex-col gap-6">
      {c.stage === 'not_started' && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{C.stageNotOpen}</p>}
      {c.departments.filter((d) => c.myDepartments.includes(d.unitId)).map((d) => <Department key={d.unitId} c={c} d={d} />)}
    </div>
  );
}

function Step({ n, title, state, done, later = false }: { n: number; title: string; state: string; done: boolean; later?: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-14 font-bold ${done ? 'bg-complete-text text-white' : later ? 'bg-info-bg text-muted' : 'bg-navy text-white'}`}>{done ? '✓' : n}</span>
        <b className="text-14 text-navy">{title}</b>
      </span>
      <span className="text-13 text-muted">{done ? `${C.departments.done}. ` : ''}{state}</span>
    </li>
  );
}

function Department({ c, d }: { c: ConceptionPage; d: DepartmentView }) {
  const { repo } = useApp();
  const M = C.mine;
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const total = d.sheet.length + d.consolidated;
  const accepted = d.waiting + d.consolidated;
  const ready = d.toCheck === 0 && accepted > 0;
  const send = () => {
    const r = repo.conception.submitDepartment(d.unitId);
    setNote(r.ok ? { ok: true, text: M.sent } : { ok: false, text: M.sendBlocked });
  };
  return (
    <section aria-labelledby={`dept-${d.unitId}`} className="flex flex-col gap-4">
      <div className={card}>
        <h3 id={`dept-${d.unitId}`} className="text-18 font-bold text-navy">{C.tabs.mine(d.name)}</h3>
        <p className="mt-1 text-13 text-muted">{M.intro}</p>
        <ol className="mt-2 divide-y divide-border">
          <Step n={1} title={c.aiEnabled ? M.steps.interview : M.steps.interviewManual} state={c.aiEnabled ? (d.interviewed ? '' : M.interviewTime) : M.manualHint} done={c.aiEnabled ? d.interviewed : total > 0} />
          <Step n={2} title={M.steps.check} state={M.checkState(formatNumber(accepted), formatNumber(total))} done={total > 0 && d.toCheck === 0} />
          <Step n={3} title={M.steps.send} state={d.submittedOn ? M.sentState(formatDate(d.submittedOn)) : M.sendState} done={d.submitted} />
          {(() => {
            // Part 11c: this department's measures in the baseline register, once Consultation opens.
            const b = repo.consultation.baselines();
            const rows = b?.rows.filter((r) => r.owner?.unitId === d.unitId) ?? [];
            const waiting = rows.filter((r) => r.state === 'awaiting_owner').length;
            return !b || b.stage === 'not_started'
              ? <Step n={4} title={M.steps.baselines} state={M.later(en.formation.stage.consultation!)} done={false} later />
              : <Step n={4} title={M.steps.baselines} state={M.baselineState(formatNumber(rows.length - waiting), formatNumber(rows.length))} done={rows.length > 0 && waiting === 0} />;
          })()}
          <Step n={5} title={M.steps.objectives} state={M.later(en.formation.stage.composition!)} done={false} later />
        </ol>
      </div>
      {c.aiEnabled && !d.interviewed && <Interview unitId={d.unitId} unit={d.name} />}
      <section className={card} aria-labelledby={`cards-${d.unitId}`}>
        <h3 id={`cards-${d.unitId}`} className="text-16 font-bold text-navy">{M.cardsTitle(d.name)}</h3>
        {d.sheet.length ? (
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {d.sheet.map((x) => <div key={x.id}><p className="mb-1 text-12 font-semibold text-navy">{cellName(x.cell)}</p><Card c={x} /></div>)}
          </div>
        ) : <p className="mt-2 text-14 text-muted">{C.board.nothingHere}</p>}
        {d.consolidated > 0 && <p className="mt-2 text-13 text-muted">{C.departments.onBoard}: {formatNumber(d.consolidated)}</p>}
        {note && <p role="status" className={`mt-2 text-13 ${note.ok ? 'text-complete-text' : 'text-block-text'}`}>{note.text}</p>}
        <div className="mt-3">
          <button type="button" className={primary} disabled={!ready} aria-describedby={ready ? undefined : `send-${d.unitId}`} onClick={send}>{d.submitted ? M.sendAgain : M.send}</button>
          {!ready && <p id={`send-${d.unitId}`} className="mt-1 text-12 text-muted">{M.sendBlocked}</p>}
        </div>
      </section>
      <AddCard unitId={d.unitId} title={C.add.title} intro={C.add.deptIntro(d.name)} idPrefix={`add-${d.unitId}`} />
    </section>
  );
}

function Interview({ unitId, unit }: { unitId: string; unit: string }) {
  const { repo } = useApp();
  const M = C.mine;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    const r = await repo.conception.interview(unitId, CELLS.map((cell) => ({ cell, answer: answers[cellKey(cell)] ?? '' })));
    setBusy(false);
    setNote(r.ok ? M.drafted(plural(r.added, 'aiCard')) : M.noAnswers);
  };
  return (
    <section className={card} aria-labelledby={`iv-${unitId}`}>
      <h3 id={`iv-${unitId}`} className="text-16 font-bold text-navy">{M.interviewTitle}</h3>
      <p className="mt-1 text-13 text-muted">{M.interviewIntro}</p>
      {BANDS.map((b) => (
        <fieldset key={b} className="mt-4">
          <legend className="text-14 font-bold text-navy">{en.fourQ.band[b]}</legend>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {CELLS.filter((c) => c.band === b).map((cell) => {
              const k = cellKey(cell);
              return (
                <div key={k}>
                  <label htmlFor={`iv-${unitId}-${k}`} className={label}>{en.fourQ.cellName(cell)}</label>
                  <p id={`iv-${unitId}-${k}-q`} className="text-12 text-muted">{M.question(unit)}</p>
                  <textarea id={`iv-${unitId}-${k}`} aria-describedby={`iv-${unitId}-${k}-q`} rows={2} className={`${input} py-2`} value={answers[k] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {note && <p role="status" className="mt-3 text-13">{note}</p>}
      <button type="button" className={`${primary} mt-4`} disabled={busy} onClick={finish}>{M.finish}</button>
    </section>
  );
}

/* ───────── Source documents ───────── */

const KINDS: SourceDocument['kind'][] = ['strategic_plan', 'annual_report', 'performance_report', 'board_paper', 'budget', 'regulatory', 'licence', 'policy', 'other'];

export function Documents({ c }: { c: ConceptionPage }) {
  const { repo } = useApp();
  const D = C.documents;
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<SourceDocument['kind']>('annual_report');
  const [file, setFile] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const add = () => {
    const r = repo.conception.addDocument({ title, kind, fileName: file });
    if (r.ok) { setTitle(''); setFile(''); setNote(null); } else setNote({ ok: false, text: D.required });
  };
  const draft = async (id: string) => {
    const r = await repo.conception.draftFromDocument(id);
    if (r.ok) setNote({ ok: true, text: `${D.draftedNote(plural(r.added, 'aiCard'))}${r.sameForAnyFile ? ` ${D.sameForAny}` : ''}` });
  };
  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="docs">
        <h3 id="docs" className="text-18 font-bold text-navy">{D.title}</h3>
        <p className="mt-1 text-13 text-muted">{c.aiEnabled ? D.intro : D.aiOff}</p>
        {note && <p role="status" className={`mt-2 text-13 ${note.ok ? 'text-complete-text' : 'text-block-text'}`}>{note.text}</p>}
        {c.documents.length ? (
          <ul className="mt-2 divide-y divide-border">
            {c.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-[1_1_16rem] text-14"><b className="text-navy">{d.title}</b> <span className="text-12 text-muted">{D.kinds[d.kind]}</span></span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-13 text-muted">{D.drafted(plural(d.drafted, 'aiCard'))}</span>
                  {c.canCurate && c.aiEnabled && <button type="button" className={btn} onClick={() => draft(d.id)}>{D.draft}</button>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-14 text-muted">{D.none}</p>}
      </section>
      {c.canCurate && (
        <section className={card} aria-labelledby="doc-add">
          <h3 id="doc-add" className="text-16 font-bold text-navy">{D.add}</h3>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
            <div><label htmlFor="doc-title" className={label}>{D.docTitle}</label><input id="doc-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label htmlFor="doc-kind" className={label}>{D.kind}</label>
              <select id="doc-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as SourceDocument['kind'])}>{KINDS.map((k) => <option key={k} value={k}>{D.kinds[k]}</option>)}</select></div>
            <div><label htmlFor="doc-file" className={label}>{D.file}</label>
              <input id="doc-file" type="file" className="min-h-11 w-full text-14" onChange={(e) => { const f = e.target.files?.[0]; setFile(f?.name ?? ''); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} /></div>
          </div>
          <button type="button" className={`${btn} mt-3`} onClick={add}>{D.addButton}</button>
        </section>
      )}
    </div>
  );
}

/* ───────── Vision and mission (written by leadership; vision.confirm) ───────── */

export function VisionMission({ c }: { c: ConceptionPage }) {
  const { repo } = useApp();
  const V = C.vision;
  const v = c.vision;
  const [vision, setVision] = useState(v.vision);
  const [mission, setMission] = useState(v.mission);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const editable = v.canWrite && v.open;
  const save = () => { const r = repo.conception.saveVision({ vision, mission }); setNote(r.ok ? { ok: true, text: V.saved } : null); };
  const confirm = () => {
    repo.conception.saveVision({ vision, mission });
    const r = repo.conception.confirmVision();
    setConfirming(false);
    if (r.ok) { setBlocked(r.outcome === 'blocked'); setNote({ ok: r.outcome === 'passed', text: r.outcome === 'passed' ? V.passed : V.blocked }); }
  };
  const checkText = (m: ConceptionPage['vision']['checks'][number]) => (m.kind === 'cell_empty' ? V.checks.cell_empty(cellName(m.cell)) : V.checks[m.kind]);
  const must = v.checks.filter((m) => m.kind === 'cell_empty' || m.kind === 'no_vision');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
      <section className={card} aria-labelledby="vm">
        <h3 id="vm" className="text-18 font-bold text-navy">{V.title}</h3>
        <p className="mt-1 text-13 text-muted">
          <Explain term={en.formation.stage.conception!}><BookLine line={en.book.sevenCStage.Conception!} /></Explain>{' '}{V.intro}
        </p>
        {note && <p role="status" className={`mt-2 text-13 ${note.ok ? 'text-complete-text' : 'text-block-text'}`}>{note.text}</p>}
        {v.confirmed ? (
          <>
            <div className="mt-3"><Chip tone="complete">{V.confirmed(v.confirmed.by, formatDate(v.confirmed.on))}</Chip></div>
            <h4 className="mt-3 text-14 font-bold text-navy">{V.vision}</h4>
            <p className="mt-1 text-22 text-navy">“{v.vision}”</p>
            {v.mission && <><h4 className="mt-3 text-14 font-bold text-navy">{V.missionShown}</h4><p className="mt-1 text-16">{v.mission}</p></>}
            <p className="mt-3 text-13 text-muted">{V.confirmedNote}</p>
          </>
        ) : editable ? (
          <>
            <label htmlFor="vm-vision" className={`${label} mt-3`}>{V.vision}</label>
            <textarea id="vm-vision" rows={3} className={`${input} py-2`} value={vision} onChange={(e) => setVision(e.target.value)} />
            <label htmlFor="vm-mission" className={`${label} mt-3`}>{V.mission}</label>
            <textarea id="vm-mission" rows={3} className={`${input} py-2`} value={mission} onChange={(e) => setMission(e.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={save}>{V.save}</button>
              <button type="button" className={primary} onClick={() => setConfirming(true)}>{V.confirm}</button>
            </div>
          </>
        ) : (
          <>
            {!v.open && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{V.notOpen(formatNumber(c.filled), formatNumber(CELLS.length))}</p>}
            {!v.canWrite && <p className="mt-3 text-13 text-muted">{V.onlyExecutive}</p>}
            {v.vision && <><p className="mt-3"><Chip tone="info">{V.draftLabel}</Chip></p><p className="mt-2 text-16 text-navy">“{v.vision}”</p></>}
            {v.mission && <p className="mt-2 text-14">{v.mission}</p>}
          </>
        )}
        {!v.confirmed && (blocked || (c.isExecutive && v.open)) && must.length > 0 && (
          <CheckBox tone="block" title={V.mustFix}>
            <ul className="list-disc pl-5">{must.map((m, i) => <li key={i}>{checkText(m)}</li>)}</ul>
          </CheckBox>
        )}
      </section>
      {c.seesAll && <BoardSummary c={c} />}
      {confirming && (
        <Dialog title={V.confirmTitle} onClose={() => setConfirming(false)}>
          <p className="text-14">{V.confirmText}</p>
          <p className="mt-3 text-16 text-navy">“{vision}”</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={confirm}>{V.confirm}</button>
            <button type="button" className={btn} onClick={() => setConfirming(false)}>{C.card.cancel}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function BoardSummary({ c }: { c: ConceptionPage }) {
  const { repo } = useApp();
  const V = C.vision;
  const [text, setText] = useState<string | null>(null);
  if (!c.aiEnabled) return null;
  const run = async () => { const r = await repo.conception.summarise(); if (r.ok) setText(r.draft.text); };
  return (
    <section className={card} aria-labelledby="summary">
      <h3 id="summary" className="text-16 font-bold text-navy">{V.summaryTitle}</h3>
      <p className="mt-1 text-13 text-muted">{V.summaryIntro}</p>
      {text && (
        <div className="mt-3 rounded-lg border border-border bg-cream p-3">
          <Chip tone="info">{V.aiLabel}</Chip>
          <p className="mt-2 text-14">{text}</p>
          <p className="mt-2 text-12 text-muted">{V.summaryNote}</p>
        </div>
      )}
      <button type="button" className={`${btn} mt-3`} onClick={run}>{V.summarise}</button>
    </section>
  );
}
