/**
 * Performance › Reviews › Scoring policy (v0.23.0; Scoring Policy and Personal Attributes Specification v0.1; contract
 * v1.15). HR drafts the next year's policy and sends it; the Executive approves or returns it. Matches
 * reference/caspa-scoring-policy-prototype.html. Every check comes from src/rules/policy.ts; "Try it" from scoreWith.
 */
import { useId, useState } from 'react';
import { useApp } from '../components/AppContext';
import type { ISODate } from '../contract/caspa-data-contract';
import { fromInput, type PolicyInput, type PolicyView } from '../data/access/policy';
import type { PolicyCheck } from '../rules/policy';
import { scoreWith } from '../rules/rating';
import { formatDate, formatFinancialYear } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, input, label, primary } from './organisation/ui';

const P = en.policy;
const DEFAULT_MINS: Record<PolicyInput['method'], number[]> = { bands: [120, 105, 95, 80], weighted_points: [90, 80, 70, 60] };
const sr = 'sr-only';

export function checkText(c: PolicyCheck, i: PolicyInput): string {
  switch (c.kind) {
    case 'level_name': return P.check.level_name(c.score);
    case 'thresholds_order': return P.check.thresholds_order;
    case 'unreachable': return P.check.unreachable(c.scores.map((s) => `${s} ${i.labels[5 - s] ?? ''}`).join(' or '), String(i.cap ?? ''));
    case 'attr_weight': return P.check.attr_weight;
    case 'attr_count': return P.check.attr_count(c.n);
    case 'attr_level_name': return P.check.attr_level_name;
    case 'attr_incomplete': return P.check.attr_incomplete(c.index + 1, c.name);
    case 'flag_high': return P.check.flag_high;
  }
}

export function ScoringPolicy() {
  const { repo } = useApp();
  const v = repo.policy.view();
  const fyStart = repo.settings().financialYearStartMonth;
  const fy = (y: number | null) => (y === null ? '' : formatFinancialYear(y, fyStart));
  const thisYear = repo.reviews.page().financialYear;
  return (
    <div className="space-y-4">
      <p className="text-14 text-muted">{P.intro}</p>
      <Summary title={P.inForce(fy(v.inForce.year ?? thisYear))} p={v.inForce} note={P.inForceNote} />
      {v.draft ? <Draft key={`${v.draft.id}:${v.draft.status}`} v={v} fy={fy(v.draft.year)} /> : (
        <section className={card}>
          <p className="text-14">{P.none(fy(thisYear + 1))}</p>
          {v.canStart && <><p className="mt-1 text-13 text-muted">{P.startNote}</p><StartButton fy={fy(thisYear + 1)} /></>}
        </section>
      )}
    </div>
  );
}

function StartButton({ fy }: { fy: string }) {
  const { repo, say } = useApp();
  return <div className="mt-3"><button type="button" className={primary} onClick={() => { const r = repo.policy.start(); say(r.ok ? P.saved : P.errors[r.error] ?? null); }}>{P.start(fy)}</button></div>;
}

/** A read-only summary of a policy: method, limit, levels, attributes and reviewer settings. */
function Summary({ title, p, note }: { title: string; p: PolicyInput; note?: string }) {
  return (
    <section className={`${card} border-t-4 border-t-performance-mark`} aria-label={title}>
      <h2 className="text-18 font-bold text-navy">{title}</h2>
      <p className="mt-1 text-14">{p.method === 'weighted_points' ? P.method.points : P.method.bands}{p.cap !== null ? ` · ${P.cap.title.toLowerCase()} ${p.cap}%` : ''}</p>
      <table className="tabular mt-2 w-full border-collapse text-14">
        <thead><tr className="border-b border-border"><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.score}</th><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.name}</th><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.from}</th></tr></thead>
        <tbody>{p.labels.map((l, k) => <tr key={k} className="border-b border-border"><td className="py-1">{5 - k}</td><td className="py-1">{l}</td><td className="py-1">{k < 4 ? `${p.mins[k]}%` : P.levels.below(String(p.mins[3]))}</td></tr>)}</tbody>
      </table>
      <p className="mt-2 text-14">{p.attrsOn ? `${P.attrs.title}: ${p.attrWeight}% (${p.attrs.map((a) => a.name).join(', ')})` : P.attrs.off}</p>
      <p className="text-14">{p.countersignAll ? P.reviewer.allOn : P.reviewer.allOff}</p>
      {note && <p className="mt-2 text-13 text-muted">{note}</p>}
    </section>
  );
}

function Draft({ v, fy }: { v: PolicyView; fy: string }) {
  const { repo, say } = useApp();
  const d = v.draft!;
  const id = useId();
  const [p, setP] = useState<PolicyInput>(() => structuredClone({ method: d.method, cap: d.cap, labels: d.labels, mins: d.mins, attrsOn: d.attrsOn, attrWeight: d.attrWeight, attrLevels: d.attrLevels, attrs: d.attrs, flagScoredOne: d.flagScoredOne, flagHigh: d.flagHigh, countersignAll: d.countersignAll }));
  const [reason, setReason] = useState('');
  const dis = !v.canEdit;
  const set = (patch: Partial<PolicyInput>) => setP({ ...p, ...patch });
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const save = () => { const r = repo.policy.save(p); say(r.ok ? P.saved : P.errors[r.error] ?? null); return r.ok; };
  return (
    <>
      <section className={`${card} border-t-4 border-t-performance-mark`} aria-labelledby={`${id}-h`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${id}-h`} className="text-18 font-bold text-navy">{P.draftFor(fy)}</h2>
          <Chip tone={d.status === 'approved' ? 'complete' : d.status === 'draft' ? 'info' : 'advisory'}>{P.status[d.status]}</Chip>
        </div>
        {d.sentBy && d.sentAt && d.status !== 'draft' && <p className="mt-1 text-13 text-muted">{P.sentBy(d.sentBy, formatDate(d.sentAt.slice(0, 10) as ISODate))}</p>}
        {d.status === 'approved' && d.decidedBy && d.decidedAt && <p className="mt-1 text-13">{P.approvedBy(d.decidedBy, formatDate(d.decidedAt.slice(0, 10) as ISODate))}</p>}
        {d.status === 'returned' && d.returnReason && <p className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text">{P.returnedBy(d.decidedBy ?? '', d.returnReason)}</p>}
        {!v.canEdit && !v.canDecide && d.status !== 'approved' && <p className="mt-1 text-13 text-muted">{P.readOnly}</p>}
      </section>

      <section className={card} aria-labelledby={`${id}-m`}>
        <h3 id={`${id}-m`} className="text-16 font-bold text-navy">{P.method.title}</h3>
        <fieldset className="mt-2 space-y-2" disabled={dis}>
          <legend className={sr}>{P.method.title}</legend>
          {(['bands', 'weighted_points'] as const).map((m) => (
            <label key={m} className={`flex min-h-11 items-start gap-3 rounded-lg border p-3 ${p.method === m ? 'border-navy bg-cream' : 'border-border'}`}>
              <input type="radio" className="mt-1 h-5 w-5" name={`${id}-method`} checked={p.method === m} onChange={() => set({ method: m, mins: [...DEFAULT_MINS[m]], cap: m === 'weighted_points' ? 100 : null })} />
              <span><b className="text-navy">{m === 'bands' ? P.method.bands : P.method.points}</b><br /><span className="text-13">{m === 'bands' ? P.method.bandsNote : P.method.pointsNote}</span></span>
            </label>
          ))}
          <p className="text-13 text-muted">{P.cap.resetNote}</p>
        </fieldset>
        <fieldset className="mt-3" disabled={dis}>
          <legend className={label}>{P.cap.title}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {[100, 110, 120, 150, null].map((c) => (
              <label key={String(c)} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-14 font-semibold ${p.cap === c ? 'border-navy bg-navy text-white' : 'border-control text-navy'}`}>
                <input type="radio" className={sr} name={`${id}-cap`} checked={p.cap === c} onChange={() => set({ cap: c })} />{c === null ? P.cap.none : P.cap.pct(c)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-13 text-muted">{P.cap.note}</p>
        </fieldset>
      </section>

      <section className={card} aria-labelledby={`${id}-l`}>
        <h3 id={`${id}-l`} className="text-16 font-bold text-navy">{P.levels.title}</h3>
        <p className="text-13 text-muted">{p.method === 'bands' ? P.levels.bandsNote : P.levels.pointsNote}</p>
        <div className="overflow-x-auto"><table className="tabular mt-2 w-full border-collapse text-14">
          <thead><tr className="border-b border-border"><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.score}</th><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.name}</th><th scope="col" className="py-1 text-left font-semibold text-muted">{P.levels.from}</th></tr></thead>
          <tbody>{p.labels.map((l, k) => (
            <tr key={k} className="border-b border-border">
              <td className="py-2 pr-2 font-bold">{5 - k}</td>
              <td className="py-2 pr-2"><input aria-label={P.levels.nameOf(5 - k)} className={input} value={l} disabled={dis} onChange={(e) => { const labels = [...p.labels]; labels[k] = e.target.value; set({ labels }); }} /></td>
              <td className="py-2">{k < 4 ? <input aria-label={P.levels.fromOf(5 - k)} inputMode="decimal" className={`${input} max-w-28`} value={Number.isNaN(p.mins[k]!) ? '' : String(p.mins[k])} disabled={dis} onChange={(e) => { const mins = [...p.mins]; mins[k] = num(e.target.value); set({ mins }); }} /> : <span className="text-muted">{P.levels.below(String(p.mins[3]))}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className={card} aria-labelledby={`${id}-a`}>
        <h3 id={`${id}-a`} className="text-16 font-bold text-navy">{P.attrs.title}</h3>
        <label className="mt-2 flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={p.attrsOn} disabled={dis} onChange={(e) => set({ attrsOn: e.target.checked })} />{P.attrs.on}</label>
        {p.attrsOn ? (
          <div className="mt-2 space-y-3">
            <div className="max-w-60"><label htmlFor={`${id}-w`} className={label}>{P.attrs.weight}</label><input id={`${id}-w`} inputMode="numeric" className={input} disabled={dis} value={Number.isNaN(p.attrWeight) ? '' : String(p.attrWeight)} onChange={(e) => set({ attrWeight: num(e.target.value) })} /><p className="mt-1 text-13 text-muted">{P.attrs.rest(100 - (p.attrWeight || 0))}</p></div>
            <fieldset disabled={dis}><legend className={label}>{P.attrs.levelNames}</legend>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-5">{p.attrLevels.map((l, k) => <input key={k} aria-label={`${P.attrs.levelNames}: ${5 - k}`} className={input} value={l} onChange={(e) => { const attrLevels = [...p.attrLevels]; attrLevels[k] = e.target.value; set({ attrLevels }); }} />)}</div>
            </fieldset>
            <p className="text-14 font-semibold text-navy">{P.attrs.count(p.attrs.length)} <span className="text-13 font-normal text-muted">· {P.attrs.countNote}</span></p>
            {p.attrs.map((a, i) => (
              <details key={a.id} className="rounded-lg border border-border p-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-navy">{a.name || P.attrs.untitled}</summary>
                <div className="mt-2 space-y-2">
                  <div><label htmlFor={`${id}-an${i}`} className={label}>{P.attrs.name}</label><input id={`${id}-an${i}`} className={input} disabled={dis} value={a.name} onChange={(e) => { const attrs = structuredClone(p.attrs); attrs[i]!.name = e.target.value; set({ attrs }); }} /></div>
                  <div><label htmlFor={`${id}-am${i}`} className={label}>{P.attrs.measures}</label><input id={`${id}-am${i}`} className={input} disabled={dis} value={a.measures} onChange={(e) => { const attrs = structuredClone(p.attrs); attrs[i]!.measures = e.target.value; set({ attrs }); }} /></div>
                  {a.levels.map((x, j) => (
                    <div key={j}><label htmlFor={`${id}-ad${i}-${j}`} className={label}>{5 - j} {p.attrLevels[j]}</label><textarea id={`${id}-ad${i}-${j}`} rows={2} className={`${input} py-2`} disabled={dis} value={x} onChange={(e) => { const attrs = structuredClone(p.attrs); attrs[i]!.levels[j] = e.target.value; set({ attrs }); }} /></div>
                  ))}
                  {!dis && <button type="button" className={btn} onClick={() => set({ attrs: p.attrs.filter((_, k) => k !== i) })}>{P.attrs.remove(a.name)}</button>}
                </div>
              </details>
            ))}
            {!dis && p.attrs.length < 8 && <button type="button" className={btn} onClick={() => set({ attrs: [...p.attrs, { id: `attr-${Date.now().toString(36)}`, name: '', measures: '', levels: ['', '', '', '', ''] }] })}>{P.attrs.add}</button>}
          </div>
        ) : <p className="mt-1 text-13 text-muted">{P.attrs.off}</p>}
      </section>

      <section className={card} aria-labelledby={`${id}-r`}>
        <h3 id={`${id}-r`} className="text-16 font-bold text-navy">{P.reviewer.title}</h3>
        <label className="mt-2 flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={p.countersignAll} disabled={dis} onChange={(e) => set({ countersignAll: e.target.checked })} />{P.reviewer.all}</label>
        <p className="text-13 text-muted">{p.countersignAll ? P.reviewer.allOn : P.reviewer.allOff}</p>
        <label className="mt-2 flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={p.flagScoredOne} disabled={dis} onChange={(e) => set({ flagScoredOne: e.target.checked })} />{P.reviewer.low}</label>
        <div className="max-w-60"><label htmlFor={`${id}-fh`} className={label}>{P.reviewer.high}</label><input id={`${id}-fh`} inputMode="numeric" className={input} disabled={dis} value={Number.isNaN(p.flagHigh) ? '' : String(p.flagHigh)} onChange={(e) => set({ flagHigh: num(e.target.value) })} /></div>
      </section>

      <TryIt p={p} />

      {v.canEdit && (
        <section className={card} aria-labelledby={`${id}-c`}>
          <h3 id={`${id}-c`} className="text-16 font-bold text-navy">{P.checksTitle}</h3>
          <p className="text-13 text-muted">{P.checksNote}</p>
          {v.checks.length ? v.checks.map((c, k) => <CheckBox key={k} tone="block" title={P.mustFix}>{checkText(c, d)}</CheckBox>) : <CheckBox tone="complete" title={P.nothing}>{''}</CheckBox>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={save}>{P.save}</button>
            <button type="button" className={primary} onClick={() => { if (!save()) return; const r = repo.policy.send(); say(r.ok ? P.sent : P.errors[r.error] ?? null); }}>{P.send}</button>
          </div>
        </section>
      )}
      {v.canDecide && (
        <section className={card}>
          <button type="button" className={primary} onClick={() => { const r = repo.policy.approve(); say(r.ok ? P.approved : P.errors[r.error] ?? null); }}>{P.approve}</button>
          <details className="mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{P.returnTo}</summary>
            <label htmlFor={`${id}-rr`} className={label}>{P.reason}</label><textarea id={`${id}-rr`} rows={2} className={`${input} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-2"><button type="button" className={btn} onClick={() => { const r = repo.policy.returnToHr(reason); say(r.ok ? P.returned : P.errors[r.error] ?? null); }}>{P.returnDo}</button></div>
          </details>
        </section>
      )}
    </>
  );
}

/** "Try it": typed-in achievements scored under the policy being edited (scoreWith). Nothing is stored. */
function TryIt({ p }: { p: PolicyInput }) {
  const id = useId();
  const T = P.tryIt;
  const [rows, setRows] = useState([{ a: '', w: '50' }, { a: '', w: '50' }]);
  const [attrs, setAttrs] = useState('');
  const objs = rows.map((r) => ({ weightPct: Number(r.w) || 0, achievement: Number(r.a) / 100 })).filter((o) => Number.isFinite(o.achievement) && o.achievement > 0);
  const scores = attrs.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  const sc = { ...fromInput(p), floorRule: false };
  const r = objs.length ? scoreWith(sc, objs, p.attrsOn ? scores : []) : null;
  const f2 = (x: number | null) => (x === null ? '—' : x.toFixed(2));
  return (
    <section className={card} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="text-16 font-bold text-navy">{T.title}</h3>
      <p className="text-13 text-muted">{T.note}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {rows.map((x, k) => (
          <fieldset key={k} className="rounded-lg border border-border p-2"><legend className="px-1 text-13 font-semibold text-navy">{T.objective(k + 1)}</legend>
            <label htmlFor={`${id}-a${k}`} className={label}>{T.achievement}</label><input id={`${id}-a${k}`} inputMode="decimal" className={input} value={x.a} onChange={(e) => { const n = [...rows]; n[k] = { ...x, a: e.target.value }; setRows(n); }} />
            <label htmlFor={`${id}-w${k}`} className={`${label} mt-1`}>{T.weight}</label><input id={`${id}-w${k}`} inputMode="numeric" className={input} value={x.w} onChange={(e) => { const n = [...rows]; n[k] = { ...x, w: e.target.value }; setRows(n); }} />
          </fieldset>
        ))}
      </div>
      {p.attrsOn && <div className="mt-2"><label htmlFor={`${id}-s`} className={label}>{T.attrs}</label><input id={`${id}-s`} className={input} value={attrs} onChange={(e) => setAttrs(e.target.value)} /></div>}
      {r && r.overall !== null && (
        <dl className="tabular mt-3 grid grid-cols-2 gap-1 text-14">
          <dt>{T.targets}</dt><dd className="text-right">{r.method === 'weighted_points' ? `${f2(r.targetsPart)}%` : f2(r.targetsPart)}</dd>
          {r.attributesPercent !== null && <><dt>{T.attributes}</dt><dd className="text-right">{f2(r.attributesPercent)}%</dd></>}
          <dt className="font-semibold">{T.total}</dt><dd className="text-right font-bold text-navy">{r.method === 'weighted_points' ? `${f2(r.overall)}%` : f2(r.overall)}</dd>
          {r.method === 'bands' && <><dt>{T.percent}</dt><dd className="text-right">{f2(r.percent)}%</dd></>}
          <dt>{T.rating}</dt><dd className="text-right font-semibold">{r.score} {r.label}</dd>
        </dl>
      )}
    </section>
  );
}
