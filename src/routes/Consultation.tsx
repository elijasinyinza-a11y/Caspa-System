/**
 * Strategy formation, part 11c: Consultation and Confirmation (Strategy Formation Specification v1.0, F2 and F3;
 * BUILD-BRIEF section 32). The consultation room, the baseline register and the compliance register. Behaviour from
 * the approved Strategy workspace prototype (`reference/caspa-strategy-prototype.html`).
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import { BookLine, Explain } from '../components/Explain';
import type { BaselinePage, BaselineView, CompliancePage, ComplianceView, InputView, RoomPage } from '../data/access/consultation';
import type { BaselineRow } from '../rules/consultation';
import type { ComplianceItem, ISODate } from '../contract/caspa-data-contract';
import { readSpreadsheet } from '../data/access/setup/files';
import { formatDate, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, download, input, label, plural, primary } from './organisation/ui';

const K = en.consultation;
type Note = { ok: boolean; text: string } | null;
const Status = ({ note }: { note: Note }) => (note ? <p role="status" className={`mt-2 text-13 ${note.ok ? 'text-complete-text' : 'text-block-text'}`}>{note.text}</p> : null);
const StageLine = ({ stage }: { stage: 'Consultation' | 'Confirmation' }) => (
  <Explain term={en.formation.stage[stage.toLowerCase()]!}><BookLine line={en.book.sevenCStage[stage]!} /></Explain>
);

/* ═════════ The consultation room ═════════ */

export function Room({ r }: { r: RoomPage }) {
  const R = K.room;
  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="room">
        <h3 id="room" className="text-18 font-bold text-navy">{R.title}</h3>
        <p className="mt-1 text-13 text-muted"><StageLine stage="Consultation" />{' '}{R.intro}</p>
        <p className="mt-2 text-13 text-text">{R.anonymity(formatNumber(r.minGroup))}</p>
        {r.stage === 'not_started' && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{R.stageNotOpen}</p>}
        <RoundLine r={r} />
      </section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={card} aria-labelledby="room-vision">
            <h3 id="room-vision" className="text-12 font-bold uppercase tracking-wide text-muted">{R.vision}</h3>
            {r.vision ? (
              <>
                <p className="mt-2 text-22 text-navy">“{r.vision.vision}”</p>
                {r.vision.mission && <p className="mt-2 text-14"><b className="text-navy">{R.mission}:</b> {r.vision.mission}</p>}
              </>
            ) : <p className="mt-2 text-14 text-muted">{R.visionNotYet}</p>}
          </section>
          {r.round && <Inputs r={r} />}
          {r.round && r.seesInputs && r.aiEnabled && (r.canRun || r.inputs.length > 0) && <Group r={r} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {r.canComment && <Say />}
          {r.meetingUnits.length > 0 && <Meeting r={r} />}
          {r.canRun && r.round?.status === 'open' && <Expert />}
          {r.canRun && <Run r={r} />}
          {r.round?.status === 'open' && !r.canComment && !r.canRun && !r.meetingUnits.length && <p className={`${card} text-14 text-muted`}>{R.notForYou}</p>}
        </div>
      </div>
    </div>
  );
}

function RoundLine({ r }: { r: RoomPage }) {
  const R = K.room;
  if (!r.round) return <p className="mt-3 text-14 text-muted">{R.noRound}</p>;
  const x = r.round;
  const tone = x.status === 'open' ? 'complete' : 'info';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-14">
      <Chip tone={tone}>{R.status[x.status]}</Chip>
      <span>{x.audience === 'all' ? R.audienceAll : R.audienceUnits(en.list(x.audience))}.</span>
      <span>{x.status === 'scheduled' ? R.scheduled(formatDate(x.opensOn), formatDate(x.closesOn)) : x.status === 'open' ? R.open(formatDate(x.closesOn)) : R.closed}</span>
      {r.seesInputs && <span className="text-muted">{R.counts(plural(x.counts.inputs, 'input'), plural(x.counts.units, 'unit'))}.</span>}
      {r.earlierRounds > 0 && <span className="text-muted">{plural(r.earlierRounds, 'earlierRound')}.</span>}
    </div>
  );
}

function InputRow({ i }: { i: InputView }) {
  const R = K.room;
  return (
    <li className="py-2">
      <p className="text-14 text-text">{i.text}</p>
      <p className="mt-1 text-12 text-muted">
        {R.kind[i.kind]} · {i.kind === 'expert_input' ? '' : `${i.unit ?? R.noUnit} · `}{formatDate(i.on)}{i.attachment ? ` · ${R.reference(i.attachment)}` : ''}{i.mine ? ` · ${R.yours}` : ''}
      </p>
    </li>
  );
}

function Inputs({ r }: { r: RoomPage }) {
  const R = K.room;
  const [all, setAll] = useState(false);
  const shown = all ? r.inputs : r.inputs.slice(0, 6);
  return (
    <section className={card} aria-labelledby="room-inputs">
      <h3 id="room-inputs" className="text-16 font-bold text-navy">{R.whatSaying}</h3>
      {!r.seesInputs ? <p className="mt-2 text-14 text-muted">{R.hiddenInputs}</p>
        : r.inputs.length ? (
          <>
            <ul className="mt-1 divide-y divide-border">{shown.map((i) => <InputRow key={i.id} i={i} />)}</ul>
            {r.inputs.length > 6 && !all && <button type="button" className={`${btn} mt-2`} onClick={() => setAll(true)}>{K.room.showAll(plural(r.inputs.length, 'input'))}</button>}
          </>
        ) : <p className="mt-2 text-14 text-muted">{R.noInputs}</p>}
    </section>
  );
}

function Group({ r }: { r: RoomPage }) {
  const { repo } = useApp();
  const G = K.room.group;
  const [res, setRes] = useState<{ groups: { word: string; inputs: InputView[] }[]; single: InputView[] } | null>(null);
  const [none, setNone] = useState(false);
  const run = async () => {
    const x = await repo.consultation.groupInputs();
    if (x.ok) { setRes({ groups: x.groups, single: x.single }); setNone(!x.groups.length && !x.single.length); }
  };
  return (
    <section className={card} aria-labelledby="room-group">
      <h3 id="room-group" className="text-16 font-bold text-navy">{G.title}</h3>
      <p className="mt-1 text-13 text-muted">{G.intro}</p>
      {none && <p className="mt-2 text-14 text-muted">{G.none}</p>}
      {res && !none && (
        <div className="mt-3 rounded-lg border border-border bg-cream p-3">
          <Chip tone="info">{G.aiLabel}</Chip>
          {res.groups.map((g) => (
            <div key={g.word} className="mt-3">
              <h4 className="text-14 font-bold text-navy">{G.theme(g.word, formatNumber(g.inputs.length))}</h4>
              <ul className="divide-y divide-border">{g.inputs.map((i) => <InputRow key={i.id} i={i} />)}</ul>
            </div>
          ))}
          {res.single.length > 0 && (
            <div className="mt-3">
              <h4 className="text-14 font-bold text-navy">{G.single} ({formatNumber(res.single.length)})</h4>
              <ul className="divide-y divide-border">{res.single.map((i) => <InputRow key={i.id} i={i} />)}</ul>
            </div>
          )}
          <p className="mt-2 text-12 text-muted">{G.note}</p>
        </div>
      )}
      {r.inputs.length > 0 && <button type="button" className={`${btn} mt-3`} onClick={run}>{G.button}</button>}
    </section>
  );
}

function Say() {
  const { repo } = useApp();
  const R = K.room;
  const [kind, setKind] = useState<'idea' | 'comment'>('idea');
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note>(null);
  const send = () => {
    const x = repo.consultation.addInput({ kind, text });
    if (x.ok) { setText(''); setNote({ ok: true, text: R.sent }); } else setNote({ ok: false, text: R.required });
  };
  return (
    <section className={card} aria-labelledby="say">
      <h3 id="say" className="text-16 font-bold text-navy">{R.sayTitle}</h3>
      <fieldset className="mt-2">
        <legend className={label}>{R.sayKind}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(['idea', 'comment'] as const).map((k) => (
            <label key={k} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-control bg-white px-3 text-14">
              <input type="radio" name="say-kind" checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5" />{R.kind[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="say-text" className={`${label} mt-3`}>{R.sayText}</label>
      <textarea id="say-text" rows={3} className={`${input} py-2`} aria-describedby="say-hint" value={text} onChange={(e) => setText(e.target.value)} />
      <p id="say-hint" className="mt-1 text-12 text-muted">{R.sayHint}</p>
      <Status note={note} />
      <button type="button" className={`${primary} mt-3`} onClick={send}>{R.send}</button>
    </section>
  );
}

function Meeting({ r }: { r: RoomPage }) {
  const { repo } = useApp();
  const R = K.room;
  const [unitId, setUnitId] = useState(r.meetingUnits[0]!.id);
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note>(null);
  const send = () => {
    const x = repo.consultation.addInput({ kind: 'meeting_summary', text, unitId });
    if (x.ok) { setText(''); setNote({ ok: true, text: R.meetingSent }); } else setNote({ ok: false, text: R.required });
  };
  return (
    <section className={card} aria-labelledby="meeting">
      <h3 id="meeting" className="text-16 font-bold text-navy">{R.meetingTitle}</h3>
      <p className="mt-1 text-13 text-muted">{R.meetingIntro}</p>
      {r.meetingUnits.length > 1 && (
        <>
          <label htmlFor="meeting-unit" className={`${label} mt-3`}>{R.meetingUnit}</label>
          <select id="meeting-unit" className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {r.meetingUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </>
      )}
      <label htmlFor="meeting-text" className={`${label} mt-3`}>{R.meetingText}</label>
      <textarea id="meeting-text" rows={3} className={`${input} py-2`} value={text} onChange={(e) => setText(e.target.value)} />
      <Status note={note} />
      <button type="button" className={`${btn} mt-3`} onClick={send}>{R.send}</button>
    </section>
  );
}

function Expert() {
  const { repo } = useApp();
  const R = K.room;
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [note, setNote] = useState<Note>(null);
  const add = () => {
    const x = repo.consultation.addInput({ kind: 'expert_input', text, attachment: file || null });
    if (x.ok) { setText(''); setFile(''); setNote({ ok: true, text: R.expertAdded }); } else setNote({ ok: false, text: R.required });
  };
  return (
    <section className={card} aria-labelledby="expert">
      <h3 id="expert" className="text-16 font-bold text-navy">{R.expertTitle}</h3>
      <p className="mt-1 text-13 text-muted">{R.expertIntro}</p>
      <label htmlFor="expert-text" className={`${label} mt-3`}>{R.expertText}</label>
      <textarea id="expert-text" rows={2} className={`${input} py-2`} value={text} onChange={(e) => setText(e.target.value)} />
      <label htmlFor="expert-file" className={`${label} mt-3`}>{R.expertFile}</label>
      <input id="expert-file" type="file" className="min-h-11 w-full text-14" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
      <Status note={note} />
      <button type="button" className={`${btn} mt-3`} onClick={add}>{R.send}</button>
    </section>
  );
}

function Run({ r }: { r: RoomPage }) {
  const { repo } = useApp();
  const U = K.room.run;
  const [all, setAll] = useState(true);
  const [units, setUnits] = useState<string[]>([]);
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [note, setNote] = useState<Note>(null);
  const x = r.round;
  const plan = () => {
    if (!opens || !closes) { setChecks(['dates_backwards']); return; }
    const res = repo.consultation.scheduleRound({ audienceUnitIds: all ? 'all' : units, opensOn: opens as ISODate, closesOn: closes as ISODate });
    if (res.ok) { setChecks([]); setNote({ ok: true, text: U.scheduledNote }); } else if (res.error === 'checks' && 'checks' in res) setChecks(res.checks);
  };
  const move = (to: 'open' | 'closed') => {
    if (!x) return;
    const res = repo.consultation.moveRound(x.id, to);
    setNote(res.ok ? { ok: true, text: to === 'open' ? U.opened : U.closedNote } : { ok: false, text: U.notOpenStage });
  };
  const canPlan = !x || x.status === 'closed';
  return (
    <section className={card} aria-labelledby="run">
      <h3 id="run" className="text-16 font-bold text-navy">{U.title}</h3>
      <p className="mt-1 text-13 text-muted">{U.intro}</p>
      <Status note={note} />
      {x?.status === 'scheduled' && <button type="button" className={`${primary} mt-3`} onClick={() => move('open')}>{U.open}</button>}
      {x?.status === 'open' && <button type="button" className={`${btn} mt-3`} onClick={() => move('closed')}>{U.close}</button>}
      {canPlan && (
        <div className="mt-3">
          <fieldset>
            <legend className={label}>{U.audience}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {[true, false].map((v) => (
                <label key={String(v)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-control bg-white px-3 text-14">
                  <input type="radio" name="round-aud" checked={all === v} onChange={() => setAll(v)} className="h-5 w-5" />{v ? U.all : U.chosen}
                </label>
              ))}
            </div>
          </fieldset>
          {!all && (
            <fieldset className="mt-2">
              <legend className="text-12 text-muted">{U.unitsHint}</legend>
              <div className="mt-1 flex max-h-64 flex-col overflow-y-auto">
                {r.units.map((u) => (
                  <label key={u.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-14">
                    <input type="checkbox" className="h-5 w-5" checked={units.includes(u.id)} onChange={(e) => setUnits(e.target.checked ? [...units, u.id] : units.filter((z) => z !== u.id))} />
                    {u.name}{u.parent ? <span className="text-12 text-muted">({u.parent})</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <div><label htmlFor="round-opens" className={label}>{U.opens}</label><input id="round-opens" type="date" className={input} value={opens} onChange={(e) => setOpens(e.target.value)} /></div>
            <div><label htmlFor="round-closes" className={label}>{U.closes}</label><input id="round-closes" type="date" className={input} value={closes} onChange={(e) => setCloses(e.target.value)} /></div>
          </div>
          {checks.length > 0 && <CheckBox tone="block" title={U.mustFix}><ul className="list-disc pl-5">{checks.map((c) => <li key={c}>{U.checks[c]}</li>)}</ul></CheckBox>}
          <button type="button" className={`${btn} mt-3`} onClick={plan}>{U.schedule}</button>
        </div>
      )}
    </section>
  );
}

/* ═════════ The baseline register ═════════ */

function BaselineChip({ b }: { b: BaselineView }) {
  const B = K.baselines;
  if (b.state === 'validated') return <Chip tone="complete">{B.state.validated}</Chip>;
  if (b.state === 'confirmed') return <Chip tone="info">{B.state.confirmed}</Chip>;
  return <Chip tone="advisory">{b.fromAi ? `${B.aiDraft}: ${B.state.awaiting_owner}` : B.state.awaiting_owner}</Chip>;
}

export function Baselines({ b }: { b: BaselinePage }) {
  const B = K.baselines;
  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="bl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="bl" className="text-18 font-bold text-navy">{B.title}</h3>
          <span className="tabular text-14 font-semibold text-navy">{B.counts(formatNumber(b.counts.validated), formatNumber(b.counts.total))}</span>
        </div>
        <p className="mt-1 text-13 text-muted"><StageLine stage="Consultation" />{' '}{B.intro}</p>
        {b.counts.awaiting > 0 && <p className="mt-1 text-13 text-text">{B.awaiting(plural(b.counts.awaiting, 'baseline'))}.</p>}
        {b.stage === 'not_started' && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{B.stageNotOpen}</p>}
        {b.rows.length ? (
          <ul className="mt-3 divide-y divide-border">{b.rows.map((r) => <BaselineRowView key={r.id} r={r} page={b} />)}</ul>
        ) : <p className="mt-3 text-14 text-muted">{B.none}</p>}
        {b.hidden > 0 && <p className="mt-2 text-13 text-muted">{B.hidden(plural(b.hidden, 'measure'))}</p>}
      </section>
      {(b.canRun || b.ownUnits.length > 0) && <AddBaseline b={b} />}
      {b.canRun && b.aiEnabled && <DraftBaselines b={b} />}
      {b.canRun && <ImportBaselines />}
    </div>
  );
}

function BaselineRowView({ r, page }: { r: BaselineView; page: BaselinePage }) {
  const { repo } = useApp();
  const B = K.baselines;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: r.name, unit: r.unit, value: String(r.value), asOf: r.asOf as string, source: r.source });
  const [note, setNote] = useState<Note>(null);
  const draft = r.state === 'awaiting_owner';
  const save = () => {
    const x = repo.consultation.correctBaseline(r.id, { name: f.name, unit: f.unit, value: Number(f.value.replace(/,/g, '')), asOf: f.asOf as ISODate, source: f.source });
    if (x.ok) { setEditing(false); setNote(null); } else setNote({ ok: false, text: B.required });
  };
  const owner = r.owner ? `${r.owner.unit}${r.owner.holder ? ` · ${r.owner.holder}` : ` · ${B.vacant}`}` : B.noOwner;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <b className="text-14 text-navy">{r.name}</b>{r.mine && <span className="ml-2"><Chip tone="info">{B.yours}</Chip></span>}
          <p className="text-12 text-muted">{B.columns.source}: {r.source} · {B.columns.asOf} {formatDate(r.asOf)}</p>
          <p className="text-12 text-muted">{B.columns.owner}: {owner}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="tabular text-18 font-bold text-navy">{formatNumber(r.value)}{r.unit === '%' ? '%' : ` ${r.unit}`}</span>
          <BaselineChip b={r} />
        </div>
      </div>
      {(r.validated || (r.confirmed && r.state !== 'awaiting_owner')) && (
        <p className="text-12 text-muted">{r.validated ? B.validatedBy(r.validated.by, formatDate(r.validated.on)) : B.confirmedBy(r.confirmed!.by, formatDate(r.confirmed!.on))}</p>
      )}
      {editing ? (
        <div className="rounded-lg border border-border bg-cream p-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
            {(['name', 'unit', 'value', 'asOf', 'source'] as const).map((k) => (
              <div key={k}><label htmlFor={`bl-${r.id}-${k}`} className={label}>{B.add[k]}</label>
                <input id={`bl-${r.id}-${k}`} type={k === 'asOf' ? 'date' : 'text'} inputMode={k === 'value' ? 'decimal' : undefined} className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
            ))}
          </div>
          {r.state === 'validated' && <p className="mt-2 text-12 text-muted">{B.correctNote}</p>}
          <Status note={note} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={save}>{B.save}</button>
            <button type="button" className={btn} onClick={() => setEditing(false)}>{B.cancel}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={B.actionsFor(r.name)}>
          {r.canDecide && draft && <button type="button" className={primary} onClick={() => repo.consultation.decideBaseline(r.id, 'accept')}>{B.accept}</button>}
          {r.canDecide && <button type="button" className={btn} onClick={() => setEditing(true)}>{B.correct}</button>}
          {r.canDecide && draft && <button type="button" className={btn} onClick={() => repo.consultation.decideBaseline(r.id, 'reject')}>{B.reject}</button>}
          {r.canValidate && <button type="button" className={primary} onClick={() => repo.consultation.validateBaseline(r.id)}>{B.validate}</button>}
          {page.canRun && (
            <span className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label htmlFor={`bl-owner-${r.id}`} className="text-13 text-muted">{B.ownerLabel}</label>
              <select id={`bl-owner-${r.id}`} className={`${input} sm:w-auto`} value={r.owner?.unitId ?? ''} onChange={(e) => repo.consultation.setBaselineOwner(r.id, e.target.value || null)}>
                <option value="">{B.ownerNone}</option>
                {page.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function AddBaseline({ b }: { b: BaselinePage }) {
  const { repo } = useApp();
  const B = K.baselines;
  const choices = b.canRun ? [{ id: '', name: B.ownerNone }, ...b.units] : b.ownUnits;
  const [f, setF] = useState({ name: '', unit: '', value: '', asOf: '', source: '', owner: choices[0]?.id ?? '' });
  const [note, setNote] = useState<Note>(null);
  const add = () => {
    const x = repo.consultation.addBaseline({ name: f.name, unit: f.unit, value: f.value.trim() === '' ? NaN : Number(f.value.replace(/,/g, '')), asOf: f.asOf as ISODate, source: f.source, ownerUnitId: f.owner || null });
    if (x.ok) { setF({ ...f, name: '', unit: '', value: '', source: '' }); setNote({ ok: true, text: B.add.added }); } else setNote({ ok: false, text: B.required });
  };
  return (
    <section className={card} aria-labelledby="bl-add">
      <h3 id="bl-add" className="text-16 font-bold text-navy">{B.add.title}</h3>
      <p className="mt-1 text-13 text-muted">{b.canRun ? B.add.introOffice : B.add.introOwner(en.list(b.ownUnits.map((u) => u.name)))}</p>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        {(['name', 'unit', 'value', 'asOf', 'source'] as const).map((k) => (
          <div key={k}><label htmlFor={`bla-${k}`} className={label}>{B.add[k]}</label>
            <input id={`bla-${k}`} type={k === 'asOf' ? 'date' : 'text'} inputMode={k === 'value' ? 'decimal' : undefined} className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div><label htmlFor="bla-owner" className={label}>{B.ownerLabel}</label>
          <select id="bla-owner" className={input} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
            {choices.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
      </div>
      <Status note={note} />
      <button type="button" className={`${btn} mt-3`} onClick={add}>{B.add.button}</button>
    </section>
  );
}

function DocPicker({ docs, title, intro, button, none, idPrefix, run }: { docs: { id: string; title: string }[]; title: string; intro: string; button: string; none: string; idPrefix: string; run: (id: string) => Promise<Note> }) {
  const [doc, setDoc] = useState(docs[0]?.id ?? '');
  const [note, setNote] = useState<Note>(null);
  return (
    <section className={card} aria-labelledby={`${idPrefix}-docs`}>
      <h3 id={`${idPrefix}-docs`} className="text-16 font-bold text-navy">{title}</h3>
      <p className="mt-1 text-13 text-muted">{intro}</p>
      {docs.length ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_16rem]">
            <label htmlFor={`${idPrefix}-doc`} className={label}>{K.baselines.fromDocs.document}</label>
            <select id={`${idPrefix}-doc`} className={input} value={doc} onChange={(e) => setDoc(e.target.value)}>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
          </div>
          <button type="button" className={btn} onClick={async () => setNote(await run(doc))}>{button}</button>
        </div>
      ) : <p className="mt-2 text-14 text-muted">{none}</p>}
      <Status note={note} />
    </section>
  );
}

function DraftBaselines({ b }: { b: BaselinePage }) {
  const { repo } = useApp();
  const D = K.baselines.fromDocs;
  return <DocPicker docs={b.documents} title={D.title} intro={D.intro} button={D.button} none={D.none} idPrefix="bld" run={async (id) => {
    const x = await repo.consultation.draftBaselines(id);
    return x.ok ? { ok: true, text: `${D.drafted(plural(x.added, 'aiBaseline'))}${x.sameForAnyFile ? ` ${K.sameForAny}` : ''}` } : null;
  }} />;
}

function ImportBaselines() {
  const { repo } = useApp();
  const I = K.baselines.import;
  const [note, setNote] = useState<Note>(null);
  const [problems, setProblems] = useState<BaselineRow[]>([]);
  const read = async (file: File) => {
    try {
      const rows = await readSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
      const x = repo.consultation.importBaselines(rows);
      if (x.ok) { setNote({ ok: true, text: I.added(plural(x.added, 'measure')) }); setProblems(x.problems); }
    } catch { setNote({ ok: false, text: I.unreadable }); setProblems([]); }
  };
  return (
    <section className={card} aria-labelledby="bl-import">
      <h3 id="bl-import" className="text-16 font-bold text-navy">{I.title}</h3>
      <p className="mt-1 text-13 text-muted">{I.intro}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div><label htmlFor="bl-file" className={label}>{I.choose}</label>
          <input id="bl-file" type="file" accept=".xlsx,.csv" className="min-h-11 text-14" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} /></div>
        <button type="button" className={btn} onClick={() => download(I.fileName, [{ name: I.sheetName, rows: [[...I.columns]], widths: [36, 14, 12, 14, 36, 24] }])}>{I.template}</button>
      </div>
      <Status note={note} />
      {problems.length > 0 && (
        <CheckBox tone="advisory" title={I.problems(plural(problems.length, 'row'))}>
          <ul className="list-disc pl-5">{problems.map((p) => <li key={p.row}>{I.row(formatNumber(p.row))}: {en.list(p.problems.map((x) => I.problem[x]!))}</li>)}</ul>
        </CheckBox>
      )}
    </section>
  );
}

/* ═════════ The compliance register ═════════ */

const OUTCOMES: NonNullable<ComplianceItem['outcome']>[] = ['aligned', 'needs_change', 'not_applicable'];
const KINDS: ComplianceItem['kind'][] = ['law', 'regulation', 'licence_condition', 'policy', 'standard'];

export function Compliance({ c }: { c: CompliancePage }) {
  const P = K.compliance;
  const left = c.counts.total - c.counts.reviewed;
  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="cr">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="cr" className="text-18 font-bold text-navy">{P.title}</h3>
          <span className="tabular text-14 font-semibold text-navy">{P.counts(formatNumber(c.counts.reviewed), formatNumber(c.counts.total))}</span>
        </div>
        <p className="mt-1 text-13 text-muted"><StageLine stage="Confirmation" />{' '}{P.intro}</p>
        <p className="mt-1 text-13 text-text">{left ? P.stillToReview(formatNumber(left)) : c.counts.total ? P.allReviewed : ''}</p>
        {c.stage === 'not_started' && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{P.stageNotOpen}</p>}
        <ul className="mt-3 divide-y divide-border">{c.items.map((i) => <ComplianceRow key={i.id} i={i} />)}</ul>
      </section>
      {c.canAdd && <AddCompliance />}
      {c.canAdd && c.aiEnabled && <DraftCompliance c={c} />}
    </div>
  );
}

function ComplianceRow({ i }: { i: ComplianceView }) {
  const { repo } = useApp();
  const P = K.compliance;
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(i.title);
  const [kind, setKind] = useState(i.kind);
  const [note, setNote] = useState<Note>(null);
  const save = () => {
    const x = repo.consultation.editCompliance(i.id, { title, kind });
    if (x.ok) { setEditing(false); setNote(null); } else setNote({ ok: false, text: P.required });
  };
  const showButtons = i.canReview && (!i.outcome || changing);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <b className="text-14 text-navy">{i.title}</b>
          <p className="text-12 text-muted">{P.kind[i.kind]} · {i.fromDocument ? P.fromDocument(i.source) : i.source}</p>
          <p className="text-12 text-muted">{i.flaggedBy.length ? P.affects(en.list(i.flaggedBy.map((u) => u.name))) : P.notMarked}</p>
          {i.reviewed && <p className="text-12 text-muted">{P.reviewedBy(i.reviewed.by, formatDate(i.reviewed.on))}</p>}
        </div>
        {i.outcome ? <Chip tone={i.outcome === 'needs_change' ? 'advisory' : 'complete'}>{P.outcome[i.outcome]}</Chip> : <Chip tone="info">{P.notReviewed}</Chip>}
      </div>
      {showButtons && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={P.actionsFor(i.title)}>
          {OUTCOMES.map((o) => <button key={o} type="button" className={btn} aria-pressed={i.outcome === o} onClick={() => { repo.consultation.reviewCompliance(i.id, o); setChanging(false); }}>{P.outcome[o]}</button>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {i.canReview && i.outcome && !changing && <button type="button" className={btn} onClick={() => setChanging(true)}>{P.change}</button>}
        {i.canEdit && !editing && <button type="button" className={btn} onClick={() => setEditing(true)}>{P.edit}</button>}
        {i.canFlag.map((u) => (
          <label key={u.unitId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-14">
            <input type="checkbox" className="h-5 w-5" checked={u.flagged} onChange={(e) => repo.consultation.flagCompliance(i.id, u.unitId, e.target.checked)} />{P.affectsUnit(u.name)}
          </label>
        ))}
      </div>
      {editing && (
        <div className="rounded-lg border border-border bg-cream p-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[2fr_1fr]">
            <div><label htmlFor={`ce-${i.id}`} className={label}>{P.add.obligation}</label><input id={`ce-${i.id}`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label htmlFor={`ck-${i.id}`} className={label}>{P.add.kind}</label>
              <select id={`ck-${i.id}`} className={input} value={kind} onChange={(e) => setKind(e.target.value as ComplianceItem['kind'])}>{KINDS.map((k) => <option key={k} value={k}>{P.kind[k]}</option>)}</select></div>
          </div>
          {i.outcome && <p className="mt-2 text-12 text-muted">{P.editNote}</p>}
          <Status note={note} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={save}>{P.save}</button>
            <button type="button" className={btn} onClick={() => { setEditing(false); setTitle(i.title); setKind(i.kind); }}>{P.cancel}</button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddCompliance() {
  const { repo } = useApp();
  const P = K.compliance;
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ComplianceItem['kind']>('regulation');
  const [note, setNote] = useState<Note>(null);
  const add = () => {
    const x = repo.consultation.addCompliance({ title, kind });
    if (x.ok) { setTitle(''); setNote({ ok: true, text: P.add.added }); } else setNote({ ok: false, text: P.required });
  };
  return (
    <section className={card} aria-labelledby="cr-add">
      <h3 id="cr-add" className="text-16 font-bold text-navy">{P.add.title}</h3>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[2fr_1fr]">
        <div><label htmlFor="cr-title" className={label}>{P.add.obligation}</label><input id="cr-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="cr-kind" className={label}>{P.add.kind}</label>
          <select id="cr-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as ComplianceItem['kind'])}>{KINDS.map((k) => <option key={k} value={k}>{P.kind[k]}</option>)}</select></div>
      </div>
      <Status note={note} />
      <button type="button" className={`${btn} mt-3`} onClick={add}>{P.add.button}</button>
    </section>
  );
}

function DraftCompliance({ c }: { c: CompliancePage }) {
  const { repo } = useApp();
  const D = K.compliance.fromDocs;
  return <DocPicker docs={c.documents} title={D.title} intro={D.intro} button={D.button} none={D.none} idPrefix="crd" run={async (id) => {
    const x = await repo.consultation.draftCompliance(id);
    if (x.ok) return { ok: true, text: `${D.drafted(plural(x.added, 'obligation'))}${x.sameForAnyFile ? ` ${K.sameForAny}` : ''}` };
    return x.error === 'not_source' ? { ok: false, text: D.notSource } : null;
  }} />;
}

