/**
 * Performance › Targets (v0.21.0; Targets Specification v0.1). The list of KPIs, setting up a breakdown, the
 * breakdown page and a share's page. Everything comes from repo.targets; matches reference/caspa-targets-prototype.html.
 */
import { useId, useState } from 'react';
import { useApp } from '../components/AppContext';
import { EntryRow } from '../components/SubMenu';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import type { KpiBreakdown } from '../contract/caspa-data-contract';
import { formatDate, formatNumber, formatPercent } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, primary } from './organisation/ui';
import { hrefFor } from './router';

const T = en.targets;
const fig = (n: number | null, unit: string) => (n === null ? '—' : `${formatNumber(Math.round(n * 10) / 10)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`);

export function TargetsPage({ breakdownId, shareId, setup }: { breakdownId?: string; shareId?: string; setup?: string }) {
  return (
    <>
      <WorkspaceHeader w="performance" title={T.title} intro={T.purpose} />
      <EntryRow w="performance" />
      {shareId ? <Share id={shareId} /> : breakdownId ? <Breakdown id={breakdownId} /> : setup ? <Setup kpiId={setup} /> : <List />}
    </>
  );
}

function List() {
  const { repo } = useApp();
  const l = repo.targets.list();
  return (
    <>
      <ul className="space-y-3">
        {l.kpis.map((k) => (
          <li key={k.kpiId} className={`${card} border-t-4 border-t-performance-mark`}>
            <p className="text-13 text-muted">{k.partOf.join(' › ')}</p>
            <h2 className="text-18 font-bold text-navy">{k.name} <span className="text-13 font-normal text-muted">{k.code}</span></h2>
            {k.breakdown ? (
              <>
                <p className="text-14">{T.brokenDown(k.breakdown.shares, T.combine[k.breakdown.combine]!)}</p>
                {k.breakdown.combinedTarget !== null && <p className="tabular text-14">{T.combinesTo(fig(k.breakdown.combinedTarget, k.unit), fig(k.corporate, k.unit))}</p>}
                <p className="mt-1 flex flex-wrap gap-2">{k.breakdown.mustFix + k.breakdown.worth === 0 ? <Chip tone="complete">{T.allClear}</Chip> : <>{k.breakdown.mustFix > 0 && <Chip tone="block">{T.mustFix(k.breakdown.mustFix)}</Chip>}{k.breakdown.worth > 0 && <Chip tone="advisory">{T.toCheck(k.breakdown.worth)}</Chip>}</>}</p>
                <div className="mt-2"><a className={primary} href={hrefFor({ kind: 'targets', breakdownId: k.breakdown.id })}>{T.open}<span className="sr-only">: {k.name}</span></a></div>
              </>
            ) : (
              <>
                <p className="text-14">{T.notBroken(fig(k.corporate, k.unit))}</p>
                {k.canBreakDown && <div className="mt-2"><a className={btn} href={hrefFor({ kind: 'targets', setup: k.kpiId })}>{T.breakDown}<span className="sr-only">: {k.name}</span></a></div>}
              </>
            )}
          </li>
        ))}
      </ul>
      {l.notCarried.length > 0 && (
        <section className={`${card} mt-4`} aria-labelledby="not-carried">
          <h2 id="not-carried" className="text-16 font-bold text-navy">{T.notCarried}</h2>
          <p className="text-13 text-muted">{T.notCarriedNote}</p>
          <ul className="mt-1 list-disc pl-5 text-14">{l.notCarried.map((k) => <li key={k.code}>{k.code} {k.name}</li>)}</ul>
        </section>
      )}
    </>
  );
}

function Setup({ kpiId }: { kpiId: string }) {
  const { repo, say, navigate } = useApp();
  const opts = repo.targets.setupOptions(kpiId);
  const id = useId();
  const [unit, setUnit] = useState(opts?.units[0]?.id ?? '');
  const [combine, setCombine] = useState<KpiBreakdown['combine']>('weighted');
  const [weightLabel, setWeightLabel] = useState('');
  const k = repo.targets.list().kpis.find((x) => x.kpiId === kpiId);
  if (!opts || !k) return <p className={card}>{T.errors.not_allowed}</p>;
  const create = () => {
    const r = repo.targets.create(kpiId, unit, combine, weightLabel);
    if (!r.ok) return say(T.errors[r.error] ?? null);
    say(T.toasts.created);
    navigate({ kind: 'targets', breakdownId: r.id! });
  };
  return (
    <section className={`${card} border-t-4 border-t-performance-mark`} aria-labelledby={`${id}-t`}>
      <p><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'targets' })}>{T.page.back}</a></p>
      <h2 id={`${id}-t`} className="text-18 font-bold text-navy">{T.setup.title(k.name)}</h2>
      <div className="mt-3 space-y-3">
        <div><label htmlFor={`${id}-u`} className={label}>{T.setup.units}</label>
          <select id={`${id}-u`} value={unit} onChange={(e) => setUnit(e.target.value)} className={input}>{opts.units.map((u) => <option key={u.id} value={u.id}>{T.setup.unitsOption(u.label, u.count)}</option>)}</select></div>
        <fieldset><legend className={label}>{T.setup.how}</legend>
          {(['weighted', 'sum', 'none'] as const).map((c) => (
            <label key={c} className="flex min-h-11 items-start gap-3 py-1"><input type="radio" name={`${id}-c`} className="mt-1 h-5 w-5" checked={combine === c} onChange={() => setCombine(c)} /><span><b className="text-navy">{T.combine[c]}</b><br /><span className="text-13 text-muted">{T.combineHelp[c]}</span></span></label>
          ))}
        </fieldset>
        {combine === 'weighted' && <div><label htmlFor={`${id}-w`} className={label}>{T.setup.weightBy}</label><p id={`${id}-wh`} className="text-13 text-muted">{T.setup.weightHint}</p><input id={`${id}-w`} aria-describedby={`${id}-wh`} value={weightLabel} onChange={(e) => setWeightLabel(e.target.value)} className={input} /></div>}
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={create}>{T.setup.create}</button><a className={btn} href={hrefFor({ kind: 'targets' })}>{T.setup.cancel}</a></div>
      </div>
    </section>
  );
}

function Breakdown({ id }: { id: string }) {
  const { repo, say } = useApp();
  const b = repo.targets.breakdown(id);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Record<string, { target: string; weight: string; owner: string }>>({});
  const fid = useId();
  if (!b) return <p className={card}>{T.errors.not_allowed}</p>;
  const startEdit = () => { setRows(Object.fromEntries(b.shares.map((x) => [x.id, { target: String(x.target), weight: x.weight === null ? '' : String(x.weight), owner: b.owners.find((o) => o.label.startsWith(x.ownerPosition ?? '\u0000'))?.id ?? '' }]))); setEditing(true); };
  const save = () => {
    const r = repo.targets.saveShares(id, b.shares.map((x) => ({ shareId: x.id, target: Number(rows[x.id]!.target.replace(/[ ,]/g, '')), weight: rows[x.id]!.weight.trim() === '' ? null : Number(rows[x.id]!.weight.replace(/[ ,]/g, '')), ownerPositionId: rows[x.id]!.owner || null })));
    if (!r.ok) return say(T.errors[r.error] ?? null);
    say(T.toasts.saved); setEditing(false);
  };
  const latest = b.combinedLatest.value !== null ? fig(b.combinedLatest.value, b.unit) : T.page.latestPartial(b.combinedLatest.covered, b.combinedLatest.of);
  return (
    <>
      <p><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'targets' })}>{T.page.back}</a></p>
      <p className="text-13 text-muted">{[...b.partOf, b.kpiName].join(' › ')}</p>
      <h2 className="text-22 font-bold text-navy">{T.page.title(b.kpiName)}</h2>
      <section className={`${card} mt-3 border-t-4 border-t-performance-mark`}>
        {b.combinedTarget !== null && <p className="tabular text-18 text-navy">{T.page.combined(fig(b.combinedTarget, b.unit))}</p>}
        <p className="tabular text-14">{T.page.corporate(fig(b.corporate, b.unit), latest)}</p>
        <p className="text-13 text-muted">{T.page.howCombined(T.combine[b.combine]!, b.combine === 'weighted' ? b.weightLabel : '')}</p>
      </section>
      {b.checks.length > 0 && (
        <section className={`${card} mt-3`} aria-labelledby={`${fid}-c`}>
          <h3 id={`${fid}-c`} className="text-16 font-bold text-navy">{T.page.checks}</h3>
          {b.checks.map((c, i) => <p key={i} className={`mt-2 rounded-lg border px-3 py-2 text-14 ${c.must ? 'border-block-border bg-block-bg text-block-text' : 'border-advisory-border bg-advisory-bg text-advisory-text'}`}><b className="block">{c.must ? T.page.mustFix : T.page.worth}</b>{c.text}</p>)}
        </section>
      )}
      {b.canEdit && <div className="my-3 flex flex-wrap gap-2">{editing ? <><button type="button" className={primary} onClick={save}>{T.page.save}</button><button type="button" className={btn} onClick={() => setEditing(false)}>{T.page.cancel}</button></> : <button type="button" className={btn} onClick={startEdit}>{T.page.edit}</button>}</div>}
      <ul className="mt-3 space-y-2">
        {b.shares.map((x) => (
          <li key={x.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a className="inline-flex min-h-11 items-center text-16 font-bold text-navy underline" href={hrefFor({ kind: 'targets', shareId: x.id })}>{x.unit}</a>
              {!x.ownerPosition && <Chip tone="block">{T.page.noOwner}</Chip>}
            </div>
            {editing ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div><label htmlFor={`${fid}-t-${x.id}`} className={label}>{T.page.target}</label><input id={`${fid}-t-${x.id}`} inputMode="decimal" value={rows[x.id]!.target} onChange={(e) => setRows({ ...rows, [x.id]: { ...rows[x.id]!, target: e.target.value } })} className={input} /></div>
                {b.combine === 'weighted' && <div><label htmlFor={`${fid}-w-${x.id}`} className={label}>{T.page.weight}</label><input id={`${fid}-w-${x.id}`} inputMode="decimal" value={rows[x.id]!.weight} onChange={(e) => setRows({ ...rows, [x.id]: { ...rows[x.id]!, weight: e.target.value } })} className={input} /></div>}
                <div><label htmlFor={`${fid}-o-${x.id}`} className={label}>{T.page.owner}</label><select id={`${fid}-o-${x.id}`} value={rows[x.id]!.owner} onChange={(e) => setRows({ ...rows, [x.id]: { ...rows[x.id]!, owner: e.target.value } })} className={input}><option value="">{T.page.chooseOwner}</option>{b.owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
              </div>
            ) : (
              <>
                <p className="text-13 text-muted">{x.ownerPosition ? `${T.page.owner}: ${x.ownerPosition}${x.owner ? `, ${x.owner}` : ''}` : ''}{x.weightPct !== null ? ` · ${T.page.share(formatPercent(x.weightPct))}` : ''}</p>
                <p className="tabular text-14">{T.page.target} <b>{fig(x.target, b.unit)}</b> · {x.latest ? T.page.latest(fig(x.latest.value, b.unit), formatDate(x.latest.periodEnd)) : T.page.noReading}</p>
                <p className="text-13 text-muted">{T.page.work(x.work)}{x.waiting ? ` · ${T.page.waiting(x.waiting)}` : ''}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-13 text-muted">{T.page.cascadeNote}</p>
    </>
  );
}

function Share({ id }: { id: string }) {
  const { repo, say } = useApp();
  const sh = repo.targets.share(id);
  const fid = useId();
  const [period, setPeriod] = useState(sh?.periods[0] ?? '');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  if (!sh) return <p className={card}>{T.errors.not_allowed}</p>;
  const act = (r: { ok: boolean; error?: string; queued?: boolean }, ok: string) => say(r.ok ? (r.queued ? T.toasts.savedOffline : ok) : T.errors[r.error ?? 'not_allowed'] ?? null);
  return (
    <>
      <p><a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: 'targets', breakdownId: sh.breakdownId })}>{T.share.back(sh.kpiName)}</a></p>
      <h2 className="text-22 font-bold text-navy">{T.share.title(sh.unit)}</h2>
      <section className={`${card} mt-3 border-t-4 border-t-performance-mark`}>
        <p className="tabular text-18 text-navy">{T.share.target(fig(sh.target, sh.kpiUnit))}</p>
        {sh.owner && <p className="text-13 text-muted">{T.page.owner}: {sh.owner}</p>}
        {sh.inContract && <p className="mt-1 text-14">{sh.inContract}</p>}
      </section>
      <section className={`${card} mt-3`} aria-labelledby={`${fid}-r`}>
        <h3 id={`${fid}-r`} className="text-16 font-bold text-navy">{T.share.readings}</h3>
        {sh.readings.length === 0 ? <p className="text-14 text-muted">{T.share.none}</p> : (
          <ul className="divide-y divide-border">
            {sh.readings.map((r) => (
              <li key={r.id} className="py-2">
                <p className="tabular text-14"><b>{fig(r.value, sh.kpiUnit)}</b> · {formatDate(r.periodEnd)} <Chip tone={r.state === 'verified' ? 'complete' : r.state === 'returned' ? 'advisory' : 'info'}>{T.share.state[r.state]}</Chip></p>
                {r.reason && <p className="text-13 text-muted">{r.reason}</p>}
                {sh.can.verify && r.state === 'sent' && (
                  <div className="mt-1 flex flex-wrap items-end gap-2">
                    <button type="button" className={primary} onClick={() => act(repo.targets.verify(r.id), T.toasts.verified)}>{T.share.verify}</button>
                    <label className="sr-only" htmlFor={`${fid}-x-${r.id}`}>{T.share.reason}</label>
                    <input id={`${fid}-x-${r.id}`} placeholder={T.share.reason} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} max-w-xs`} />
                    <button type="button" className={btn} onClick={() => act(repo.targets.returnReading(r.id, reason), T.toasts.returned)}>{T.share.return}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {sh.can.record && sh.periods.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div><label htmlFor={`${fid}-p`} className={label}>{T.share.period}</label><select id={`${fid}-p`} value={period} onChange={(e) => setPeriod(e.target.value)} className={input}>{sh.periods.map((p) => <option key={p} value={p}>{formatDate(p)}</option>)}</select></div>
            <div><label htmlFor={`${fid}-v`} className={label}>{T.share.value(sh.kpiUnit)}</label><input id={`${fid}-v`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={input} /></div>
            <div className="flex items-end"><button type="button" className={primary} onClick={() => { act(repo.targets.record(id, period, value), T.toasts.recorded); setValue(''); }}>{T.share.record}</button></div>
          </div>
        )}
        {!sh.can.record && !sh.can.verify && <p className="mt-2 text-13 text-muted">{T.share.onlyOwner}</p>}
      </section>
      <section className={`${card} mt-3`} aria-labelledby={`${fid}-w`}>
        <h3 id={`${fid}-w`} className="text-16 font-bold text-navy">{T.share.work}</h3>
        <p className="text-13 text-muted">{T.share.workNote}</p>
        {sh.work.length === 0 ? <p className="mt-1 text-14 text-muted">{T.share.nothingLinked}</p> : (
          <ul className="mt-1 divide-y divide-border">{sh.work.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b className="text-navy">{w.title}</b><br /><span className="text-13 text-muted">{w.who}{w.quantity ? ` · ${w.quantity}` : ''}{w.how === 'source' ? ` · ${T.share.fromShare}` : ''}</span></span>
              {sh.can.link && w.how === 'serves' && <button type="button" className={btn} onClick={() => act(repo.targets.unlink(id, w.id), T.toasts.unlinked)}>{T.share.unlink}</button>}
            </li>
          ))}</ul>
        )}
        {sh.can.link && sh.linkable.length > 0 && (
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-navy">{T.share.link}</summary>
            {sh.linkable.map((l) => <label key={l.id} className="flex min-h-11 items-start gap-3 py-1"><input type="checkbox" className="mt-1 h-5 w-5" checked={picks.includes(l.id)} onChange={(e) => setPicks(e.target.checked ? [...picks, l.id] : picks.filter((x) => x !== l.id))} /><span><b className="text-navy">{l.title}</b><br /><span className="text-13 text-muted">{l.who}{l.quantity ? ` · ${l.quantity}` : ''}</span></span></label>)}
            <div className="mt-2"><button type="button" className={primary} onClick={() => { act(repo.targets.link(id, picks), T.toasts.linked); setPicks([]); }}>{T.share.linkDo}</button></div>
          </details>
        )}
      </section>
    </>
  );
}
