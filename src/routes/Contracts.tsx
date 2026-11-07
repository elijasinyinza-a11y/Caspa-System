/**
 * Performance › Contracts (v0.22.0; Contracts Specification v0.1, CT-1 to CT-10). Tabs Mine, My team, To check and
 * Overview. Everything comes from repo.contracts; matches reference/caspa-contracts-prototype.html.
 */
import { useId, useState } from 'react';
import { useApp } from '../components/AppContext';
import { EntryRow } from '../components/SubMenu';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import type { ContractTab, ContractView, ObjectiveView } from '../data/access/contracts';
import { formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, primary } from './organisation/ui';
import { hrefFor } from './router';

const C = en.contracts;

export function ContractsPage({ tab, contractId }: { tab?: ContractTab; contractId?: string }) {
  const { repo } = useApp();
  const p = repo.contracts.page();
  const fy = formatFinancialYear(repo.reviews.page().financialYear, repo.settings().financialYearStartMonth);
  const one = contractId ? repo.contracts.contract(contractId) : null;
  const fromOne: ContractTab | undefined = one ? (p.mine.some((x) => x.id === one.id) ? 'mine' : p.check.some((x) => x.id === one.id) ? 'check' : 'team') : undefined;
  const on: ContractTab = tab && p.tabs.includes(tab) ? tab : fromOne && p.tabs.includes(fromOne) ? fromOne : p.opensOn;
  return (
    <>
      <WorkspaceHeader w="performance" title={C.title} intro={C.purpose} />
      <EntryRow w="performance" />
      {p.tabs.length > 1 && (
        <nav aria-label={C.tabsLabel} className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
          {p.tabs.map((t) => <a key={t} href={hrefFor({ kind: 'contracts', tab: t })} aria-current={on === t ? 'page' : undefined} className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-4 px-3 text-14 ${on === t ? 'border-navy font-bold text-navy' : 'border-transparent text-muted hover:text-navy'}`}>{C.tabs[t]}</a>)}
        </nav>
      )}
      {on === 'mine' && (p.mine.length ? p.mine.map((c) => <Contract key={c.id} c={c} fy={fy} as="employee" />) : <p className={`${card} text-14 text-muted`}>{one ? C.notIssued : C.none}</p>)}
      {on === 'team' && (one && fromOne === 'team' ? <><p><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'contracts', tab: 'team' })}>{C.team.back}</a></p><Contract c={one} fy={fy} as="supervisor" /></> : <Team fy={fy} />)}
      {on === 'check' && (p.check.length ? p.check.map((c) => <Contract key={c.id} c={c} fy={fy} as="reviewer" />) : <p className={`${card} text-14 text-muted`}>{C.check.none}</p>)}
      {on === 'overview' && p.overview && <Overview o={p.overview} fy={fy} />}
    </>
  );
}

function Team({ fy }: { fy: string }) {
  const { repo, say, navigate } = useApp();
  const rows = repo.contracts.page().team;
  return (
    <section className={card} aria-labelledby="team-contracts">
      <h2 id="team-contracts" className="text-18 font-bold text-navy">{C.team.title(fy)}</h2>
      <ul className="mt-2 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.positionId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><b className="text-navy">{r.person ?? C.team.vacant}</b><br /><span className="text-13 text-muted">{r.position}</span></span>
            <span className="flex flex-wrap items-center gap-2">
              {r.contract ? <><Chip tone={r.contract.step === 'signed' ? 'complete' : 'info'}>{C.step[r.contract.step]}</Chip><a className={btn} href={hrefFor({ kind: 'contracts', contractId: r.contract.id })}>{C.team.open}<span className="sr-only">: {r.person}</span></a></>
                : r.canCreate ? <button type="button" className={btn} onClick={() => { const x = repo.contracts.createDraft(r.positionId); if (x.ok) { say(C.toasts.created); navigate({ kind: 'contracts', contractId: x.id! }); } }}>{C.team.create}<span className="sr-only">: {r.person}</span></button>
                : <span className="text-13 text-muted">{C.team.none}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Objective({ o, edit, contractId }: { o: ObjectiveView; edit: boolean; contractId: string }) {
  const { repo, say } = useApp();
  const id = useId();
  const [qty, setQty] = useState(o.quantity === null ? '' : String(o.quantity));
  const [weight, setWeight] = useState(String(o.weight));
  const [mov, setMov] = useState(o.meansOfVerification ?? '');
  const [periods, setPeriods] = useState(o.periodTargets.map((p) => ({ periodEnd: p.periodEnd as string, label: p.label, value: p.value === null ? '' : String(p.value) })));
  const savePeriods = (next: typeof periods) => act(repo.contracts.updateObjective(o.id, { periodTargets: next.map((p) => ({ periodEnd: p.periodEnd, value: p.value.trim() === '' ? null : Number(p.value.replace(/[ ,]/g, '')) })) }), C.toasts.saved);
  const [dep, setDep] = useState<{ on: string; by: string; note: string } | null>(null);
  const act = (r: { ok: boolean; error?: string }, ok: string) => say(r.ok ? ok : C.errors[r.error ?? 'not_allowed'] ?? null);
  const sources = dep ? repo.contracts.sources(contractId) : null;
  return (
    <li className="border-t border-border py-3">
      <p className="font-bold text-navy">{o.title}</p>
      <p className="text-13">{o.source === 'duty' ? <Chip tone="info">{o.sourceText}</Chip> : <span className="text-muted">{o.sourceText}{o.level ? ` · ${C.level(o.level)}` : ''}</span>}</p>
      {edit ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {o.quantity !== null && <div><label htmlFor={`${id}-q`} className={label}>{C.quantity(o.unit)}</label><input id={`${id}-q`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => act(repo.contracts.updateObjective(o.id, { quantity: Number(qty.replace(/[ ,]/g, '')) || 0 }), C.toasts.saved)} className={input} /></div>}
          <div><label htmlFor={`${id}-w`} className={label}>{C.weight}</label><input id={`${id}-w`} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} onBlur={() => act(repo.contracts.updateObjective(o.id, { weight: Number(weight) || 0 }), C.toasts.saved)} className={input} /></div>
        </div>
      ) : <p className="tabular text-14">{o.quantity !== null ? `${formatNumber(o.quantity)} ${o.unit} · ` : ''}{C.weight.replace(' (%)', '')} {o.weight}%</p>}
      {edit && o.quantity !== null && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {periods.map((p, k) => (
            <div key={p.periodEnd}><label htmlFor={`${id}-p${k}`} className={label}>{C.periodTarget(p.label)}{o.unit ? ` (${o.unit})` : ''}</label>
              <input id={`${id}-p${k}`} inputMode="numeric" value={p.value} onChange={(e) => { const n = [...periods]; n[k] = { ...p, value: e.target.value }; setPeriods(n); }} onBlur={() => savePeriods(periods)} className={input} /></div>
          ))}
        </div>
      )}
      {!edit && o.periodTargets.some((p) => p.value !== null) && <p className="tabular text-13 text-muted">{C.periodTargetsShown(o.periodTargets.filter((p) => p.value !== null).map((p) => `${p.label} ${formatNumber(p.value!)}`).join(', '))}</p>}
      {edit ? (
        <div className="mt-2"><label htmlFor={`${id}-mv`} className={label}>{C.mov}</label><input id={`${id}-mv`} value={mov} onChange={(e) => setMov(e.target.value)} onBlur={() => act(repo.contracts.updateObjective(o.id, { meansOfVerification: mov }), C.toasts.saved)} className={input} /></div>
      ) : o.meansOfVerification && <p className="text-13 text-muted">{C.movShown(o.meansOfVerification)}</p>}
      {o.deps.map((d) => (
        <div key={d.id} className="mt-2 rounded-lg bg-cream px-3 py-2 text-13">
          <p>{d.text}</p>
          {d.flags.length > 0 && <p className="font-semibold text-advisory-text">{C.checks.worth}: {d.flags.join('; ')}</p>}
          {d.note && <p className="text-muted">{d.note}</p>}
          {edit && <button type="button" className="mt-1 inline-flex min-h-11 items-center font-semibold text-navy underline" onClick={() => act(repo.contracts.removeDependency(d.id), C.toasts.removed)}>{C.removeDep}</button>}
        </div>
      ))}
      {edit && !dep && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setDep({ on: '', by: '', note: '' })}>{C.addDep}</button>
          <button type="button" className={btn} onClick={() => act(repo.contracts.removeObjective(o.id), C.toasts.removed)}>{C.remove}</button>
        </div>
      )}
      {edit && dep && sources && (
        <div className="mt-2 space-y-2 rounded-lg border border-control p-3">
          <div><label htmlFor={`${id}-d`} className={label}>{C.dependsLabel}</label><select id={`${id}-d`} value={dep.on} onChange={(e) => setDep({ ...dep, on: e.target.value })} className={input}><option value="" />{sources.dependable.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div><label htmlFor={`${id}-b`} className={label}>{C.neededBy}</label><input id={`${id}-b`} type="date" value={dep.by} onChange={(e) => setDep({ ...dep, by: e.target.value })} className={input} /></div>
          <div><label htmlFor={`${id}-n`} className={label}>{C.why}</label><input id={`${id}-n`} value={dep.note} onChange={(e) => setDep({ ...dep, note: e.target.value })} className={input} /></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => { const r = repo.contracts.addDependency(o.id, dep.on, dep.by, dep.note); act(r, C.toasts.depAdded); if (r.ok) setDep(null); }}>{C.addDo}</button><button type="button" className={btn} onClick={() => setDep(null)}>{C.cancel}</button></div>
        </div>
      )}
    </li>
  );
}

function AddObjective({ contractId, onDone }: { contractId: string; onDone: () => void }) {
  const { repo, say } = useApp();
  const id = useId();
  const src = repo.contracts.sources(contractId);
  const [source, setSource] = useState<ObjectiveView['source']>('activity');
  const [ref, setRef] = useState(src.activities[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [weight, setWeight] = useState('');
  const options = source === 'activity' ? src.activities : source === 'share' ? src.shares : source === 'combined' ? src.breakdowns : [];
  return (
    <section className={`${card} mt-3`} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="text-16 font-bold text-navy">{C.addTitle}</h3>
      <fieldset className="mt-2"><legend className={label}>{C.source}</legend>
        {(['activity', 'share', 'combined', 'duty'] as const).map((k) => {
          const none = k === 'share' ? !src.shares.length : k === 'combined' ? !src.breakdowns.length : false;
          return <label key={k} className={`flex min-h-11 items-start gap-3 py-1 ${none ? 'text-muted' : ''}`}><input type="radio" className="mt-1 h-5 w-5" name={`${id}-s`} disabled={none} checked={source === k} onChange={() => { setSource(k); setRef((k === 'activity' ? src.activities : k === 'share' ? src.shares : src.breakdowns)[0]?.id ?? ''); }} /><span>{C.sources[k]}{none && <><br /><span className="text-13">{C.noSource}</span></>}</span></label>;
        })}
      </fieldset>
      {options.length > 0 && <div className="mt-2"><label htmlFor={`${id}-r`} className={label}>{C.activity}</label><select id={`${id}-r`} value={ref} onChange={(e) => setRef(e.target.value)} className={input}>{options.map((x) => { const a = x as { id: string; label: string; remaining?: number | null; unit?: string }; return <option key={a.id} value={a.id}>{a.label}{a.remaining !== undefined && a.remaining !== null ? ` · ${C.remaining(formatNumber(a.remaining), a.unit ?? '')}` : ''}</option>; })}</select></div>}
      <div className="mt-2"><label htmlFor={`${id}-ti`} className={label}>{C.objTitle}</label><input id={`${id}-ti`} value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(source === 'activity' || source === 'duty') && <div><label htmlFor={`${id}-q`} className={label}>{C.quantity('')}</label><input id={`${id}-q`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={input} /></div>}
        <div><label htmlFor={`${id}-w`} className={label}>{C.weight}</label><input id={`${id}-w`} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} className={input} /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => { const r = repo.contracts.addObjective(contractId, { source, refId: ref, title, quantity: qty ? Number(qty.replace(/[ ,]/g, '')) : null, unit: source === 'duty' ? 'times' : '', weight: Number(weight) || 0 }); if (!r.ok) return say(C.errors[r.error] ?? null); say(C.toasts.added); onDone(); }}>{C.addDo}</button>
        <button type="button" className={btn} onClick={onDone}>{C.cancel}</button>
      </div>
    </section>
  );
}

function Contract({ c, fy, as }: { c: ContractView; fy: string; as: 'employee' | 'supervisor' | 'reviewer' }) {
  const { repo, say, navigate } = useApp();
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const act = (r: { ok: boolean; error?: string }, ok: string) => say(r.ok ? ok : C.errors[r.error ?? 'not_allowed'] ?? null);
  const flagged = c.fairness;
  return (
    <section className="mb-6" aria-labelledby={`${id}-h`}>
      <div className={`${card} border-t-4 border-t-performance-mark`}>
        <h2 id={`${id}-h`} className="text-18 font-bold text-navy">{as === 'employee' ? C.yours(fy, c.version) : C.heading(c.person, fy, c.version)}</h2>
        <p className="text-13 text-muted">{C.meta(c.position, c.supervisor)}</p>
        <p className="mt-1"><Chip tone={c.step === 'signed' ? 'complete' : 'info'}>{C.step[c.step]}</Chip></p>
        {c.checkReason && <p className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text"><b>{C.sentBack(c.reviewer)}</b> {c.checkReason}</p>}
        {as === 'reviewer' && <p className="mt-1 text-13 text-muted">{C.check.drafted(c.supervisor)}</p>}
        <ul className="mt-2">{c.objectives.map((o) => <Objective key={`${o.id}:${o.weight}:${o.quantity}`} o={o} edit={c.can.edit} contractId={c.id} />)}</ul>
        <p className="tabular mt-2 text-14 font-semibold text-navy">{C.weights(c.weightTotal)}</p>
        <p className="text-14">{c.split.attributesPct > 0 ? C.split(c.split.targetsPct, c.split.attributesPct) : C.splitTargetsOnly} <span className="text-muted">{c.split.methodText}.</span></p>
        {c.split.attributes.length > 0 && <p className="text-13 text-muted">{C.attributesShown(c.split.attributes.map((a) => a.name).join(', '))}</p>}
        {(c.step === 'signed' || c.step === 'issued') && <p className="mt-2"><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'print', doc: 'contract', id: c.id })}>{C.print}</a></p>}
        {c.can.edit && !adding && <div className="mt-2"><button type="button" className={btn} onClick={() => setAdding(true)}>{C.add}</button></div>}
      </div>
      {adding && <AddObjective contractId={c.id} onDone={() => setAdding(false)} />}
      {(c.mustFix.length > 0 || c.worth.length > 0) && (as !== 'employee') && (
        <section className={`${card} mt-3`} aria-label={C.checks.title}>
          <h3 className="text-16 font-bold text-navy">{C.checks.title}</h3>
          {c.mustFix.map((m) => <p key={m} className="mt-2 rounded-lg border border-block-border bg-block-bg px-3 py-2 text-14 text-block-text"><b className="block">{C.checks.mustFix}</b>{m}</p>)}
          {c.worth.map((w) => <p key={w} className="mt-2 rounded-lg border border-advisory-border bg-advisory-bg px-3 py-2 text-14 text-advisory-text"><b className="block">{C.checks.worth}</b>{w}</p>)}
        </section>
      )}
      {c.can.issue && (
        <div className="mt-3">
          <button type="button" className={primary} onClick={() => { const r = repo.contracts.issue(c.id); say(r.ok ? (r.outcome === 'sent_for_check' ? C.toasts.sentForCheck(c.reviewer) : C.toasts.issued) : C.errors[r.error] ?? null); }}>{flagged && c.step !== 'sent_back' ? C.issueCheck(c.reviewer) : C.issue}</button>
          {flagged && <p className="mt-1 text-13 text-muted">{C.issueCheckNote}</p>}
        </div>
      )}
      {c.can.check && (
        <div className={`${card} mt-3`}>
          <button type="button" className={primary} onClick={() => act(repo.contracts.clearCheck(c.id), C.toasts.cleared)}>{C.check.clear}</button>
          <details className="mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{C.check.sendBack(c.supervisor)}</summary>
            <label htmlFor={`${id}-r`} className={label}>{C.check.reason}</label><textarea id={`${id}-r`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
            <div className="mt-2"><button type="button" className={btn} onClick={() => act(repo.contracts.sendBack(c.id, reason), C.toasts.sentBack)}>{C.check.sendBackDo}</button></div></details>
        </div>
      )}
      {c.can.signAsEmployee && (
        <div className={`${card} mt-3`}>
          <h3 className="text-16 font-bold text-navy">{C.sign.title}</h3>
          <label htmlFor={`${id}-n`} className={`${label} mt-2 block`}>{C.sign.note}</label><p id={`${id}-nh`} className="text-13 text-muted">{C.sign.noteHint}</p>
          <textarea id={`${id}-n`} aria-describedby={`${id}-nh`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${input} py-2`} />
          <div className="mt-2"><button type="button" className={primary} onClick={() => { const r = repo.contracts.sign(c.id, note); say(r.ok ? (r.outcome === 'fully_signed' ? C.toasts.fullySigned : C.toasts.signed) : C.errors[r.error] ?? null); }}>{C.sign.do}</button></div>
        </div>
      )}
      {c.can.signAsSupervisor && <div className="mt-3"><button type="button" className={primary} onClick={() => { const r = repo.contracts.sign(c.id, ''); say(r.ok ? (r.outcome === 'fully_signed' ? C.toasts.fullySigned : C.toasts.signed) : C.errors[r.error] ?? null); }}>{C.sign.supervisor}</button></div>}
      {c.employeeNote && <p className="mt-3 text-14"><b>{as === 'employee' ? C.sign.yourNote : C.sign.theirNote}</b> “{c.employeeNote}”</p>}
      {c.step === 'signed' && <p className="mt-3 text-14"><Chip tone="complete">{C.step.signed}</Chip> {as === 'employee' ? C.sign.signed(c.supervisor) : C.sign.signedOther}</p>}
      {c.can.revise && (
        <div className={`${card} mt-3`}>
          <h3 className="text-16 font-bold text-navy">{C.revise.title}</h3><p className="text-14">{C.revise.note}</p>
          <div className="mt-2"><button type="button" className={btn} onClick={() => { const r = repo.contracts.revise(c.id); if (r.ok) { say(C.toasts.revised); navigate({ kind: 'contracts', contractId: r.id! }); } }}>{C.revise.do(c.version + 1)}</button></div>
        </div>
      )}
      {c.history.length > 0 && <p className="mt-2 text-13 text-muted">{C.history(c.history.map((h) => C.historyItem(h.version, C.step[h.status] ?? h.status)).join('; '))}</p>}
    </section>
  );
}

function Overview({ o, fy }: { o: NonNullable<ReturnType<ReturnType<typeof useApp>['repo']['contracts']['page']>['overview']>; fy: string }) {
  const { repo, say } = useApp();
  const id = useId();
  const [standing, setStanding] = useState(String(o.limits.standing));
  const [single, setSingle] = useState(o.limits.single === null ? '' : String(o.limits.single));
  const [show, setShow] = useState(o.limits.showDraft);
  return (
    <>
      <section className={`${card} border-t-4 border-t-performance-mark`}>
        <h2 className="text-18 font-bold text-navy">{C.overview.title(fy)}</h2>
        <table className="tabular mt-2 w-full border-collapse text-14"><thead><tr className="border-b border-border"><th scope="col" className="py-2 text-left font-semibold text-muted">{C.overview.status}</th><th scope="col" className="py-2 text-right font-semibold text-muted">{C.overview.count}</th></tr></thead>
          <tbody><tr className="border-b border-border"><td className="py-2">{C.overview.none}</td><td className="py-2 text-right">{o.none}</td></tr>{o.byStep.map((x) => <tr key={x.step} className="border-b border-border"><td className="py-2">{C.step[x.step]}</td><td className="py-2 text-right">{x.n}</td></tr>)}</tbody></table>
      </section>
      {o.received.length > 0 && (
        <section className={`${card} mt-3`} aria-labelledby={`${id}-rc`}>
          <h3 id={`${id}-rc`} className="text-16 font-bold text-navy">{C.received(o.received.length)}</h3>
          <p className="text-13 text-muted">{C.receivedNote}</p>
          <ul className="divide-y divide-border">{o.received.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b className="text-navy">{x.person}</b> <span className="text-13 text-muted">{x.position}</span></span><a className={btn} href={hrefFor({ kind: 'print', doc: 'contract', id: x.id })}>{C.print}<span className="sr-only">: {x.person}</span></a></li>)}</ul>
        </section>
      )}
      <section className={`${card} mt-3`} aria-labelledby={`${id}-l`}>
        <h3 id={`${id}-l`} className="text-16 font-bold text-navy">{C.overview.limits}</h3>
        <div className="mt-2"><label htmlFor={`${id}-s`} className={label}>{C.overview.standing}</label><input id={`${id}-s`} inputMode="numeric" value={standing} onChange={(e) => setStanding(e.target.value)} className={input} /></div>
        <div className="mt-2"><label htmlFor={`${id}-o`} className={label}>{C.overview.single}</label><p id={`${id}-oh`} className="text-13 text-muted">{C.overview.singleHint}</p><input id={`${id}-o`} aria-describedby={`${id}-oh`} inputMode="numeric" value={single} onChange={(e) => setSingle(e.target.value)} className={input} /></div>
        <label className="mt-2 flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={show} onChange={(e) => setShow(e.target.checked)} />{C.overview.showDraft}</label>
        <div className="mt-2"><button type="button" className={primary} onClick={() => { const r = repo.contracts.saveLimits({ standing: Number(standing), single: single.trim() ? Number(single) : null, showDraft: show }); say(r.ok ? C.toasts.saved : C.errors[r.error] ?? null); }}>{C.overview.save}</button></div>
      </section>
    </>
  );
}
