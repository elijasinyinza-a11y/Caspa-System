/**
 * The Strategy landing (v0.28.0; Strategy Landing Specification v0.1, SL-1 to SL-7; prototype
 * `reference/caspa-strategy-landing-prototype.html`). Read top to bottom: the plan, its vision and mission, your part,
 * the goals with progress and why each was chosen, then themes. Every figure comes from `repo.strategyLanding`.
 *
 * v0.31.0 (Vision, Mission and Values Drafting Specification v0.1, VM-1 to VM-8): the Strategy office or a facilitator
 * drafts and sends; the Executive confirms as written or sends back with a reason, or records their own in one step.
 */
import type { ValueInput } from '../rules/values';
import { ValueListEditor, ValueListView, valuesReady } from './ValueList';
import { backingLine, ValuesLanding } from './ValuesWork';
import { withBoardValues } from '../rules/values-work';
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import { ProgressBar } from '../components/Status';
import type { LandingDraft, LandingGoal } from '../data/access/strategy-landing';
import { formatDate, formatPercent } from '../selectors/format';
import { en, type Terms } from '../strings/en';
import { nodeHref } from './router';
import { Chip, btn, card, primary } from './organisation/ui';

const L = en.landing;
const field = 'mt-1 min-h-20 w-full rounded-lg border border-control bg-white px-3 py-2 text-14 text-text';
const link = 'font-semibold text-navy underline underline-offset-4 hover:text-text';

function GoalCard({ g, t }: { g: LandingGoal; t: Terms }) {
  const r = g.reasons;
  return (
    <article aria-labelledby={`goal-${g.ref.id}`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-white p-5">
      <h4 id={`goal-${g.ref.id}`} className="flex flex-wrap items-baseline gap-x-2 text-16 font-bold">
        <span className="tabular text-14 font-normal text-muted">{g.ref.code}</span>
        <a href={nodeHref('goal', g.ref.id, 'strategy')} className={link}>{g.ref.title}</a>
      </h4>
      <p className="text-13 text-muted">
        {g.owner ? en.node.owner(g.owner.position, g.owner.person, g.owner.acting) : en.node.noOwner}
      </p>
      <ProgressBar share={g.progress.progress} expected={g.progress.expected} status={g.progress.status} label={`${g.ref.code} ${g.ref.title}`} />
      <p className="text-13 text-muted">{L.counts(g.objectives, g.kpis, t)}</p>
      <div className="space-y-2 border-t border-border pt-3">
        <h5 className="text-13 font-semibold text-navy">{L.why}</h5>
        {r.visible ? (
          r.entries.length === 0 ? <p><Chip tone="advisory">{L.noReason}</Chip></p> : (
            <ul className="space-y-2">
              {r.entries.map((e, i) => (
                <li key={i} className="rounded-lg bg-strategy-tint px-3 py-2">
                  <p className="text-12 font-semibold text-strategy-text">{en.fourQ.cell(e.cell)}{e.on === 'objective' ? ` · ${L.onObjective(t)}` : ''}</p>
                  <p className="text-14 text-text">{e.text}</p>
                </li>
              ))}
            </ul>
          )
        ) : r.count === 0 ? <p><Chip tone="advisory">{L.noReason}</Chip></p> : <p className="text-14 text-text">{L.reasonCount(r.count)}</p>}
      </div>
    </article>
  );
}

/** SL-4 and CV-5: the Executive records what the plan is missing, once. `mode` says whether that is everything or the values alone. */
function RecordStatements({ mode, onDone }: { mode: 'all' | 'values'; onDone: (saved: boolean) => void }) {
  const { repo } = useApp();
  const [vision, setVision] = useState('');
  const [mission, setMission] = useState('');
  const [values, setValues] = useState<ValueInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const all = mode === 'all';
  const save = () => {
    const r = all ? repo.strategyLanding.recordStatements(vision, mission, values) : repo.strategyLanding.recordValues(values);
    if (r.ok) onDone(true); else setError(L.errors[r.error] ?? L.errors.not_allowed!);
  };
  const ready = valuesReady(values) && (all ? !!vision.trim() && !!mission.trim() : values.length > 0);
  return (
    <section aria-labelledby="record-vm" className="space-y-3 rounded-xl border border-control bg-white p-5">
      <h2 id="record-vm" className="text-18 font-bold text-navy">{all ? L.record.title : L.record.titleValues}</h2>
      <p className="text-13 text-muted">{L.record.note}</p>
      {all && (
        <>
          <div><label htmlFor="vm-vision" className="text-14 font-semibold text-navy">{L.vision}</label>
            <textarea id="vm-vision" value={vision} onChange={(e) => setVision(e.target.value)} className={field} /></div>
          <div><label htmlFor="vm-mission" className="text-14 font-semibold text-navy">{L.mission}</label>
            <textarea id="vm-mission" value={mission} onChange={(e) => setMission(e.target.value)} className={field} /></div>
        </>
      )}
      <h3 className="pt-1 text-14 font-bold text-navy">{en.values.title}</h3>
      <ValueListEditor values={values} onChange={setValues} idPrefix="rec-val" />
      {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!ready} className={primary}>{L.record.save}</button>
        <button type="button" onClick={() => onDone(false)} className={btn}>{L.record.cancel}</button>
      </div>
    </section>
  );
}

/** VM-1: the Strategy office or a facilitator drafts, saves and sends to the Executive. */
function DraftStatements({ mode, draft, onDone }: { mode: 'all' | 'values'; draft: LandingDraft | null; onDone: (note: string | null) => void }) {
  const { repo } = useApp();
  const D = L.draft;
  const [vision, setVision] = useState(draft?.vision ?? '');
  const [mission, setMission] = useState(draft?.mission ?? '');
  const [values, setValues] = useState<ValueInput[]>(draft?.values ?? []);
  // v0.32.0: a value added from the values board joins the list being edited, keeping anything not yet saved.
  const stored = JSON.stringify(draft?.values ?? []);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) { setSeen(stored); setValues(withBoardValues(values, draft?.values ?? [])); }
  const [error, setError] = useState<string | null>(null);
  const all = mode === 'all';
  const fail = (e: string) => setError(L.errors[e] ?? L.errors.not_allowed!);
  const save = (send: boolean) => {
    const r = repo.strategyLanding.saveDraft(vision, mission, values);
    if (!r.ok) return fail(r.error);
    if (!send) return onDone(D.saved);
    const sent = repo.strategyLanding.sendDraft();
    if (sent.ok) onDone(D.sentDone); else fail(sent.error);
  };
  return (
    <section aria-labelledby="draft-vm" className="space-y-3 rounded-xl border border-control bg-white p-5">
      <h2 id="draft-vm" className="text-18 font-bold text-navy">{all ? D.title : D.titleValues}</h2>
      <p className="text-13 text-muted">{D.note}</p>
      {draft?.returned && <p className="rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text">{D.statusReturned(draft.returned.by, formatDate(draft.returned.on), draft.returned.reason)}</p>}
      {all && (
        <>
          <div><label htmlFor="dr-vision" className="text-14 font-semibold text-navy">{L.vision}</label>
            <textarea id="dr-vision" value={vision} onChange={(e) => setVision(e.target.value)} className={field} /></div>
          <div><label htmlFor="dr-mission" className="text-14 font-semibold text-navy">{L.mission}</label>
            <textarea id="dr-mission" value={mission} onChange={(e) => setMission(e.target.value)} className={field} /></div>
        </>
      )}
      <h3 className="pt-1 text-14 font-bold text-navy">{en.values.title}</h3>
      <ValueListEditor values={values} onChange={setValues} idPrefix="dr-val" note={(x) => backingLine(repo, x)} />
      {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => save(false)} disabled={!valuesReady(values)} className={btn}>{D.save}</button>
        <button type="button" onClick={() => save(true)} disabled={!valuesReady(values) || (all ? !vision.trim() || !mission.trim() : values.length === 0)} className={primary}>{D.send}</button>
        <button type="button" onClick={() => onDone(null)} className={btn}>{D.cancel}</button>
      </div>
    </section>
  );
}

/** The draft as written, read-only. */
function DraftView({ d }: { d: LandingDraft }) {
  const { repo } = useApp();
  return (
    <div className="space-y-3">
      {d.mode === 'all' && ([['vision', d.vision], ['mission', d.mission]] as const).map(([k, text]) => (
        <div key={k}><p className="text-12 font-semibold uppercase tracking-wide text-strategy-text">{k === 'vision' ? L.vision : L.mission}</p><p className="mt-1 text-16 text-navy">{text}</p></div>
      ))}
      {d.values.length > 0 && <div><p className="mb-2 text-12 font-semibold uppercase tracking-wide text-strategy-text">{en.values.title}</p><ValueListView values={d.values} note={(x) => backingLine(repo, x)} /></div>}
    </div>
  );
}

/** VM-4, VM-5: the Executive confirms the sent draft as written, or sends it back with a reason. */
function ConfirmDraft({ d, onDone }: { d: LandingDraft; onDone: (note: string) => void }) {
  const { repo } = useApp();
  const D = L.draft;
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const drafter = d.sent?.by ?? d.by;
  return (
    <section aria-labelledby="confirm-vm" className="space-y-3 rounded-xl border border-advisory-border bg-white p-5">
      <p><Chip tone="advisory">{D.waitingTitle}</Chip></p>
      <h2 id="confirm-vm" className="text-18 font-bold text-navy">{d.mode === 'all' ? D.confirmTitle : D.confirmTitleValues}</h2>
      <p className="text-14">{D.waitingIntro(drafter, d.sent ? formatDate(d.sent.on) : '')}</p>
      <DraftView d={d} />
      {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => { const r = repo.strategyLanding.confirmDraft(); if (r.ok) onDone(D.confirmed); else setError(L.errors[r.error] ?? L.errors.not_allowed!); }}>{D.confirm}</button>
        <button type="button" className={btn} aria-expanded={back} onClick={() => setBack(true)}>{D.sendBack}</button>
      </div>
      {back && (
        <div>
          <label htmlFor="vm-reason" className="text-14 font-semibold text-navy">{D.reasonLabel}</label>
          <textarea id="vm-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
          <button type="button" className={`${primary} mt-2`} disabled={!reason.trim()} onClick={() => { const r = repo.strategyLanding.sendBackDraft(reason); if (r.ok) onDone(D.returnedDone(drafter)); else setError(L.errors[r.error] ?? L.errors.not_allowed!); }}>{D.sendBackGo(drafter)}</button>
        </div>
      )}
      <p className="text-12 text-muted">{D.editNote}</p>
    </section>
  );
}

export function StrategyLanding() {
  const { repo } = useApp();
  const t = repo.settings().termLabels;
  const v = repo.strategyLanding.landing();
  const [recording, setRecording] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!v) return null;
  const p = v.plan;
  const st = v.statements;
  return (
    <div className="space-y-4">
      <section aria-labelledby="plan-title" className="rounded-xl border border-t-4 border-border border-t-strategy-mark bg-white px-5 py-4">
        <h2 id="plan-title" className="text-22 font-bold text-navy">{p.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-14 text-muted">
          <span>{p.period}{p.year && <> · <b className="font-semibold text-text">{L.year(p.year.label, p.year.n, p.year.of)}</b></>}</span>
          <Chip tone="complete">{en.onboarding.plan.status.published}</Chip>
        </p>
        {p.confirmed && <p className="mt-2 text-14">{en.onboarding.confirm.confirmedBy(p.confirmed.by, formatDate(p.confirmed.on), p.confirmed.ref)}</p>}
      </section>

      <div role="status" aria-live="polite">{note && <p className="rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 font-semibold text-complete-text">{note}</p>}</div>

      {(st.vision || st.mission || st.values.length > 0) && (
        <section aria-label={L.direction} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {([['vision', st.vision], ['mission', st.mission]] as const).map(([k, text]) => text && (
              <div key={k} className="rounded-xl border border-border bg-white px-5 py-4">
                <p className="text-12 font-semibold uppercase tracking-wide text-strategy-text">{k === 'vision' ? L.vision : L.mission}</p>
                <p className="mt-1 text-18 font-medium text-navy">{text}</p>
              </div>
            ))}
          </div>
          {/* v0.29.0 (CV-8): values beneath the vision and mission, each name in bold with its meaning. */}
          {st.values.length > 0 && (
            <div className="rounded-xl border border-border bg-white px-5 py-4">
              <p className="mb-2 text-12 font-semibold uppercase tracking-wide text-strategy-text">{en.values.title}</p>
              <ValueListView values={st.values} columns />
            </div>
          )}
          {st.recorded && <p className="text-12 text-muted">{L.recorded(st.recorded.by, formatDate(st.recorded.on))}</p>}
        </section>
      )}
      {/* v0.31.0 (VM-4): the Executive's confirmation of a sent draft. */}
      {v.draft?.status === 'sent' && repo.viewer.roles.includes('executive') && (
        <ConfirmDraft d={v.draft} onDone={(n) => setNote(n)} />
      )}
      {/* The Strategy office or a facilitator: a draft with the Executive, read-only. */}
      {v.draft?.status === 'sent' && !repo.viewer.roles.includes('executive') && (
        <section aria-labelledby="sent-vm" className={`${card} space-y-3`}>
          <h2 id="sent-vm" className="text-18 font-bold text-navy">{v.draft.mode === 'all' ? L.draft.title : L.draft.titleValues}</h2>
          <p><Chip tone="info">{L.draft.statusSent(v.draft.sent?.by ?? v.draft.by, v.draft.sent ? formatDate(v.draft.sent.on) : '')}</Chip></p>
          <DraftView d={v.draft} />
        </section>
      )}
      {/* VM-1: drafting by the Strategy office or a facilitator. */}
      {v.canDraft && (
        drafting ? <DraftStatements mode={v.canDraft} draft={v.draft} onDone={(n) => { setDrafting(false); setNote(n); }} /> : (
          <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-18 font-bold text-navy">{v.canDraft === 'all' ? L.record.missing : L.record.missingValues}</h2>
              <p className="text-13 text-muted">{L.draft.missingNote}</p>
              {v.draft && (
                <p className="mt-1">{v.draft.status === 'returned' && v.draft.returned
                  ? <Chip tone="advisory">{L.draft.statusReturned(v.draft.returned.by, formatDate(v.draft.returned.on), v.draft.returned.reason)}</Chip>
                  : <Chip tone="info">{L.draft.statusDraft(v.draft.by)}</Chip>}</p>
              )}
            </div>
            <button type="button" onClick={() => { setDrafting(true); setNote(null); }} className={btn}>{v.draft ? L.draft.edit : v.canDraft === 'all' ? L.draft.title : L.draft.titleValues}</button>
          </section>
        )
      )}
      {v.canRecord && v.draft && v.draft.status !== 'sent' && <p className="text-13 text-muted">{L.draft.drafting(v.draft.by)}</p>}
      {v.canRecord && (
        recording ? <RecordStatements mode={v.canRecord} onDone={(saved) => { setRecording(false); setNote(saved ? L.record.saved : null); }} /> : (
          <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-18 font-bold text-navy">{v.canRecord === 'all' ? L.record.missing : L.record.missingValues}</h2>
              <p className="text-13 text-muted">{L.record.missingNote}</p>
            </div>
            <button type="button" onClick={() => { setRecording(true); setNote(null); }} className={btn}>{v.canRecord === 'all' ? L.record.title : L.record.titleValues}</button>
          </section>
        )
      )}
      {/* v0.32.0 (VG-8): values group work, while the active plan has no values. */}
      <ValuesLanding />

      {v.yourPart && v.yourPart.length > 0 && (
        <section aria-label={L.yourPart} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-performance-tint px-5 py-3">
          <span className="text-13 font-semibold text-performance-text">{L.yourPart}</span>
          <span className="text-14 text-text">
            {L.serves}{' '}
            {v.yourPart.map((g, i) => (
              <span key={g.id}>{i > 0 && (i === v.yourPart!.length - 1 ? ' and ' : ', ')}<a href={nodeHref('goal', g.id, 'strategy')} className={link}>{g.code} {g.title}</a></span>
            ))}.
          </span>
        </section>
      )}

      <section aria-labelledby="landing-goals" className="space-y-3 pt-2">
        <div>
          <h2 id="landing-goals" className="text-22 font-bold text-navy">{t.goal.plural}</h2>
          <p className="mt-1 text-13 text-muted">{en.goalHealth.note(formatPercent(v.expected))}</p>
        </div>
        {v.groups.map((gr) => (
          <div key={gr.label ?? 'all'} className="space-y-3">
            {gr.label && <h3 className="pt-1 text-13 font-semibold uppercase tracking-wide text-muted">{gr.label === 'other' ? L.otherGoals(t) : gr.label}</h3>}
            <div className="grid gap-3 lg:grid-cols-2">
              {gr.goals.map((g) => <GoalCard key={g.ref.id} g={g} t={t} />)}
            </div>
          </div>
        ))}
      </section>

      {v.themes.length > 0 && (
        <section aria-labelledby="landing-themes" className={card}>
          <h2 id="landing-themes" className="text-18 font-bold text-navy">{L.themes}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {v.themes.map((x) => <li key={x.id} className="rounded-full bg-strategy-tint px-3 py-1 text-14 text-strategy-text">{x.title}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

