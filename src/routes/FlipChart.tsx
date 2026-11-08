/**
 * A group's 4Q flip chart (4Q Group Work Specification v0.1; contract v1.19), #/flipchart/<workshopId>/<groupId>.
 * The group's scribe types the cards the group agrees, section by section; they go to the 4Q board as "to review" and
 * count only once the Strategy office accepts them. Saved on the device when the connection drops, sent when it returns.
 * Behaviour from `reference/caspa-4q-groups-prototype.html`.
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import type { FourQCell } from '../contract/caspa-data-contract';
import { cellKey } from '../rules/conception';
import { en } from '../strings/en';
import { btn, card, Chip, input, label, primary } from './organisation/ui';

const G = en.flipChart;

export function FlipChartPage({ workshopId, groupId }: { workshopId: string; groupId: string }) {
  const { repo } = useApp();
  const f = repo.conception.flipChart(workshopId, groupId);
  if (!f) return <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{G.notYours}</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-13 text-muted">{G.eyebrow(f.sessionLabel, f.planTitle)}</p>
        <h1 className="text-28 font-bold text-navy">{en.formation.groups.flipChart(f.name)}</h1>
        <p className="mt-1 text-14">{G.intro}</p>
      </div>
      {f.closed && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{G.closed}</p>}
      {f.offline && <p className="rounded-lg border border-advisory-border bg-advisory-bg px-4 py-3 text-14 text-advisory-text">{G.offline}</p>}
      {!f.isScribe && <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{G.lookOnly}</p>}
      {f.cells.map((cell) => <Section key={cellKey(cell)} f={f} cell={cell} />)}
    </div>
  );
}

function Section({ f, cell }: { f: NonNullable<ReturnType<ReturnType<typeof useApp>['repo']['conception']['flipChart']>>; cell: FourQCell }) {
  const { repo, say } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const key = cellKey(cell);
  const cards = f.cards.filter((c) => cellKey(c.cell) === key);
  const waiting = f.waiting.filter((c) => cellKey(c.cell) === key);
  const name = en.fourQ.cellName(cell);
  const add = () => {
    const r = repo.conception.addGroupCard(f.workshopId, f.groupId, { cell, text, evidence: null });
    if (r.ok) { setText(''); setError(false); say(r.queued ? G.savedOnDevice : G.added); } else setError(true);
  };
  return (
    <section className={card} aria-labelledby={`fc-${key}`}>
      <h2 id={`fc-${key}`} className="text-16 font-bold text-navy">{name}</h2>
      <p className="text-12 text-muted">{en.fourQ.band[cell.band]}</p>
      {cards.length || waiting.length ? (
        <ul className="mt-2 divide-y divide-border">
          {cards.map((c) => <CardRow key={c.id} c={c} />)}
          {waiting.map((c) => <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-14"><span>{c.text}</span><Chip tone="info">{G.waiting}</Chip></li>)}
        </ul>
      ) : <p className="mt-2 text-13 text-muted">{G.none}</p>}
      {f.isScribe && !f.closed && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_14rem]">
            <label htmlFor={`new-${key}`} className={label}>{G.newCard}<span className="sr-only">: {name}</span></label>
            <input id={`new-${key}`} className={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </div>
          <button type="button" className={primary} onClick={add}>{G.add}<span className="sr-only"> {G.to(name)}</span></button>
          {error && <p role="alert" className="w-full text-13 text-block-text">{G.required}</p>}
        </div>
      )}
    </section>
  );
}

function CardRow({ c }: { c: NonNullable<ReturnType<ReturnType<typeof useApp>['repo']['conception']['flipChart']>>['cards'][number] }) {
  const { repo, say } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const state = c.state === 'to_review' ? <Chip tone="advisory">{G.state.to_review}</Chip> : c.state === 'accepted' ? <Chip tone="complete">{G.state.accepted}</Chip> : <Chip tone="info">{G.state.rejected}</Chip>;
  if (editing) {
    return (
      <li className="py-2">
        <label htmlFor={`ed-${c.id}`} className={label}>{en.conception.card.text}</label>
        <input id={`ed-${c.id}`} className={input} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => { if (repo.conception.updateGroupCard(c.id, { text, evidence: c.evidence }).ok) { setEditing(false); say(G.changed); } }}>{en.conception.card.save}</button>
          <button type="button" className={btn} onClick={() => { setEditing(false); setText(c.text); }}>{en.conception.card.cancel}</button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-14">
      <span className="min-w-0 flex-[1_1_14rem]">{c.text}</span>
      <span className="flex flex-wrap items-center gap-2">
        {state}
        {c.canChange && <button type="button" className={btn} onClick={() => setEditing(true)}>{en.conception.card.edit}<span className="sr-only">: {c.text}</span></button>}
        {c.canChange && <button type="button" className={btn} onClick={() => { if (repo.conception.deleteGroupCard(c.id).ok) say(G.deleted); }}>{G.delete}<span className="sr-only">: {c.text}</span></button>}
      </span>
    </li>
  );
}
