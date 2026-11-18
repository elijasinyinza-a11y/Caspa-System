/**
 * The Strategy landing (v0.28.0; Strategy Landing Specification v0.1, SL-1 to SL-7; prototype
 * `reference/caspa-strategy-landing-prototype.html`). Read top to bottom: the plan, its vision and mission, your part,
 * the goals with progress and why each was chosen, then themes. Every figure comes from `repo.strategyLanding`.
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import { ProgressBar } from '../components/Status';
import type { LandingGoal } from '../data/access/strategy-landing';
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

function RecordStatements({ onDone }: { onDone: (saved: boolean) => void }) {
  const { repo } = useApp();
  const [vision, setVision] = useState('');
  const [mission, setMission] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const r = repo.strategyLanding.recordStatements(vision, mission);
    if (r.ok) onDone(true); else setError(L.errors[r.error] ?? L.errors.not_allowed!);
  };
  return (
    <section aria-labelledby="record-vm" className="space-y-3 rounded-xl border border-control bg-white p-5">
      <h2 id="record-vm" className="text-18 font-bold text-navy">{L.record.title}</h2>
      <p className="text-13 text-muted">{L.record.note}</p>
      <div><label htmlFor="vm-vision" className="text-14 font-semibold text-navy">{L.vision}</label>
        <textarea id="vm-vision" value={vision} onChange={(e) => setVision(e.target.value)} className={field} /></div>
      <div><label htmlFor="vm-mission" className="text-14 font-semibold text-navy">{L.mission}</label>
        <textarea id="vm-mission" value={mission} onChange={(e) => setMission(e.target.value)} className={field} /></div>
      {error && <p role="alert" className="text-13 font-semibold text-block-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!vision.trim() || !mission.trim()} className={primary}>{L.record.save}</button>
        <button type="button" onClick={() => onDone(false)} className={btn}>{L.record.cancel}</button>
      </div>
    </section>
  );
}

export function StrategyLanding() {
  const { repo } = useApp();
  const t = repo.settings().termLabels;
  const v = repo.strategyLanding.landing();
  const [recording, setRecording] = useState(false);
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

      {(st.vision || st.mission) ? (
        <section aria-label={L.direction}>
          <div className="grid gap-3 md:grid-cols-2">
            {([['vision', st.vision], ['mission', st.mission]] as const).map(([k, text]) => text && (
              <div key={k} className="rounded-xl border border-border bg-white px-5 py-4">
                <p className="text-12 font-semibold uppercase tracking-wide text-strategy-text">{k === 'vision' ? L.vision : L.mission}</p>
                <p className="mt-1 text-18 font-medium text-navy">{text}</p>
              </div>
            ))}
          </div>
          {st.recorded && <p className="mt-2 text-12 text-muted">{L.recorded(st.recorded.by, formatDate(st.recorded.on))}</p>}
        </section>
      ) : v.canRecord && (
        recording ? <RecordStatements onDone={(saved) => { setRecording(false); setNote(saved ? L.record.saved : null); }} /> : (
          <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-18 font-bold text-navy">{L.record.missing}</h2>
              <p className="text-13 text-muted">{L.record.missingNote}</p>
            </div>
            <button type="button" onClick={() => { setRecording(true); setNote(null); }} className={btn}>{L.record.title}</button>
          </section>
        )
      )}

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

