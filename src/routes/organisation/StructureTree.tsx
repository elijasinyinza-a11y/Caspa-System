/**
 * The structure tree (D7-14): the Cascade tree pattern. It opens one level at a time; each unit shows its counts and
 * who answers for it; lists over six fold behind "Show all"; "Find" matches unit, title and holder names; a filter
 * keeps only units with something to fix or check. Only open levels are rendered, so thousands of positions stay quick.
 */
import { useEffect, useMemo, useState } from 'react';
import type { OrganisationPage } from '../../data/access/setup';
import {
  answersFor, childUnits, flaggedUnits, indexStructure, positionsIn, topUnits, unitCounts, unitPath, type StructureIndex, type StructurePosition, type StructureUnit,
} from '../../rules/setup';
import { formatNumber } from '../../selectors/format';
import { en } from '../../strings/en';
import { btn, Chip, FOLD, input, link, plural } from './ui';

export interface TreeActions {
  editPosition(id: string): void;
  editUnit(id: string): void;
  addPosition(unitId: string): void;
  addUnit(parentId: string): void;
  remove(kind: 'unit' | 'position', id: string): void;
  accept(id: string): void;
}

const t = en.setup.tree;
const holderName = (ix: StructureIndex, p: StructurePosition) => (p.holder ? ix.person.get(p.holder.personId)?.fullName ?? null : null);
/** A position's title, with its unit when the title repeats elsewhere. */
export const positionLabel = (ix: StructureIndex, p: StructurePosition, repeated: Map<string, number>) =>
  (repeated.get(p.title) ?? 0) > 1 ? `${p.title}, ${ix.unit.get(p.unitId)?.name ?? ''}` : p.title;
export const titleCounts = (ix: StructureIndex) => {
  const m = new Map<string, number>();
  for (const p of ix.st.positions) m.set(p.title, (m.get(p.title) ?? 0) + 1);
  return m;
};

export function StructureTree({ page, actions, reveal }: {
  page: OrganisationPage;
  /** Null for a read-only tree. */
  actions: TreeActions | null;
  /** Open the tree down to a unit, and focus it or one of its positions. */
  reveal: { unitId: string; positionId?: string; n: number } | null;
}) {
  const st = page.structure;
  const ix = indexStructure(st);
  const flagged = useMemo(() => flaggedUnits(ix, page.checks), [ix, page.checks]);
  const repeated = useMemo(() => titleCounts(ix), [ix]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(topUnits(ix).map((u) => u.id)));
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  // Top units open by default, including after an import replaces the structure.
  const tops = topUnits(ix).map((u) => u.id).join(',');
  useEffect(() => { setOpen((o) => new Set([...o, ...tops.split(',').filter(Boolean)])); }, [tops]);

  useEffect(() => {
    if (!reveal) return;
    const chain = new Set<string>();
    let u: StructureUnit | undefined = ix.unit.get(reveal.unitId);
    while (u && !chain.has(u.id)) { chain.add(u.id); u = u.parentId ? ix.unit.get(u.parentId) : undefined; }
    setOpen((o) => new Set([...o, ...chain]));
    if (reveal.positionId) setShowAll((s) => new Set([...s, `p:${reveal.unitId}`]));
    setFind('');
    setOnlyFlagged(false);
    setFocus(reveal.positionId ? `p-${reveal.positionId}` : `t-${reveal.unitId}`);
    // Only when a new reveal is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.n]);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus);
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
    setFocus(null);
  }, [focus]);

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const more = (key: string) => setShowAll((s) => new Set([...s, key]));
  const q = find.trim().toLowerCase();

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="org-find">{t.find}</label>
        <input id="org-find" type="search" className={`${input} min-w-[200px] flex-1`} placeholder={t.findPlaceholder} value={find} onChange={(e) => setFind(e.target.value)} />
        {(page.checks.must.length > 0 || page.checks.worth.length > 0) && (
          <label className="flex min-h-11 items-center gap-2 text-13 text-text">
            <input type="checkbox" className="h-5 w-5 shrink-0" checked={onlyFlagged} onChange={(e) => { setOnlyFlagged(e.target.checked); setFind(''); }} />
            {t.onlyFlagged}
          </label>
        )}
      </div>
      {q.length >= 2 ? <FindResults ix={ix} q={q} onShow={(unitId, positionId) => {
        setFind('');
        const chain = new Set<string>();
        let u: StructureUnit | undefined = ix.unit.get(unitId);
        while (u && !chain.has(u.id)) { chain.add(u.id); u = u.parentId ? ix.unit.get(u.parentId) : undefined; }
        setOpen((o) => new Set([...o, ...chain]));
        if (positionId) setShowAll((s) => new Set([...s, `p:${unitId}`]));
        setFocus(positionId ? `p-${positionId}` : `t-${unitId}`);
      }} /> : (
        <ul className="space-y-1">
          {topUnits(ix).filter((u) => !onlyFlagged || flagged.has(u.id)).map((u) => (
            <UnitRow key={u.id} ix={ix} u={u} depth={0} page={page} actions={actions} open={open} toggle={toggle} showAll={showAll} more={more} flagged={flagged} onlyFlagged={onlyFlagged} repeated={repeated} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindResults({ ix, q, onShow }: { ix: StructureIndex; q: string; onShow: (unitId: string, positionId?: string) => void }) {
  const hits: { unit: StructureUnit; position?: StructurePosition }[] = [];
  for (const u of ix.st.units) if (u.name.toLowerCase().includes(q)) hits.push({ unit: u });
  for (const p of ix.st.positions) {
    const h = holderName(ix, p);
    const u = ix.unit.get(p.unitId);
    if (u && (p.title.toLowerCase().includes(q) || (h ?? '').toLowerCase().includes(q) || (p.ref ?? '').toLowerCase().includes(q))) hits.push({ unit: u, position: p });
  }
  return (
    <div>
      <p role="status" className="text-13 text-muted">{plural(hits.length, 'match')}{hits.length > 30 ? `. ${t.firstThirty}` : ''}</p>
      <ul className="mt-2 divide-y divide-border">
        {hits.slice(0, 30).map((h) => (
          <li key={h.position?.id ?? h.unit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="text-14 font-semibold text-navy">
                {h.position ? `${h.position.title} · ${holderName(ix, h.position) ?? t.vacant}` : <>{h.unit.name} <span className="font-normal text-muted">{h.unit.unitType || t.typeNotGiven}</span></>}
              </div>
              <div className="text-12 text-muted">{unitPath(ix, h.unit.id).join(' › ')}</div>
            </div>
            <button type="button" className={btn} onClick={() => onShow(h.unit.id, h.position?.id)}>{t.showInStructure}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitRow({ ix, u, depth, page, actions, open, toggle, showAll, more, flagged, onlyFlagged, repeated }: {
  ix: StructureIndex; u: StructureUnit; depth: number; page: OrganisationPage; actions: TreeActions | null; open: Set<string>; toggle: (id: string) => void;
  showAll: Set<string>; more: (k: string) => void; flagged: Set<string>; onlyFlagged: boolean; repeated: Map<string, number>;
}) {
  const [menu, setMenu] = useState(false);
  if (depth > 40) return null;
  const isOpen = open.has(u.id);
  const kids = childUnits(ix, u.id).filter((k) => !onlyFlagged || flagged.has(k.id));
  const ps = positionsIn(ix, u.id);
  const c = unitCounts(ix, u.id);
  const a = answersFor(ix, u.id);
  const ap = a ? ix.position.get(a.positionId) : undefined;
  const allPos = showAll.has(`p:${u.id}`);
  const allKids = showAll.has(`u:${u.id}`);
  const ai = u.draft?.state === 'ai_draft';
  return (
    <li className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="flex min-w-0 items-start gap-2">
          <button id={`t-${u.id}`} type="button" onClick={() => toggle(u.id)} aria-expanded={isOpen} aria-label={isOpen ? t.close(u.name) : t.open(u.name)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-control text-18 font-bold text-navy">
            {isOpen ? '−' : '+'}
          </button>
          <div className="min-w-0 py-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-16 font-bold text-navy">{u.name}</span>
              <span className="text-13 text-muted">{u.unitType || t.typeNotGiven}</span>
              {ai && <Chip tone="info">{t.aiDraft(u.draft?.provenance.kind === 'document' ? u.draft.provenance.page : null)}</Chip>}
              {flagged.has(u.id) && !isOpen && <Chip tone="advisory">{t.somethingToCheck}</Chip>}
            </div>
            <div className="text-12 text-muted">{t.unitCounts(plural(c.positions, 'position'), formatNumber(c.vacant), plural(c.people, 'person'))}</div>
            <div className="text-12 text-muted">
              {t.answers}: {ap ? `${positionLabel(ix, ap, repeated)} (${holderName(ix, ap) ?? t.vacant})${a!.fromUnitId ? `, ${t.from(ix.unit.get(a!.fromUnitId)?.name ?? '')}` : ''}` : t.answersNone}
            </div>
          </div>
        </div>
        {actions && isOpen && (
          <div className="flex flex-wrap gap-2">
            {ai && <button type="button" className={btn} onClick={() => actions.accept(u.id)}>{t.accept}</button>}
            <button type="button" className={btn} onClick={() => actions.editUnit(u.id)}>{ai ? t.correct : t.edit}</button>
            <button type="button" className={btn} aria-expanded={menu} aria-label={t.unitActions(u.name)} onClick={() => setMenu(!menu)}>{t.more}</button>
            {menu && (
              <div className="flex w-full flex-wrap justify-end gap-2">
                <button type="button" className={btn} onClick={() => actions.addPosition(u.id)}>{t.addPosition}</button>
                <button type="button" className={btn} onClick={() => actions.addUnit(u.id)}>{t.addUnit}</button>
                <button type="button" className={btn} onClick={() => actions.remove('unit', u.id)}>{t.remove}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="border-t border-border px-2 pb-2 md:pl-12">
          <ul className="divide-y divide-border">
            {(allPos ? ps : ps.slice(0, FOLD)).map((p) => <PositionRow key={p.id} ix={ix} p={p} page={page} actions={actions} repeated={repeated} />)}
          </ul>
          {ps.length > FOLD && !allPos && <button type="button" className={link} onClick={() => more(`p:${u.id}`)}>{t.showAllPositions(formatNumber(ps.length))}</button>}
          {kids.length > 0 && (
            <ul className="mt-2 space-y-1">
              {(allKids ? kids : kids.slice(0, FOLD)).map((k) => (
                <UnitRow key={k.id} ix={ix} u={k} depth={depth + 1} page={page} actions={actions} open={open} toggle={toggle} showAll={showAll} more={more} flagged={flagged} onlyFlagged={onlyFlagged} repeated={repeated} />
              ))}
            </ul>
          )}
          {kids.length > FOLD && !allKids && <button type="button" className={link} onClick={() => more(`u:${u.id}`)}>{t.showAllUnits(formatNumber(kids.length))}</button>}
        </div>
      )}
    </li>
  );
}

function PositionRow({ ix, p, page, actions, repeated }: { ix: StructureIndex; p: StructurePosition; page: OrganisationPage; actions: TreeActions | null; repeated: Map<string, number> }) {
  const h = p.holder ? ix.person.get(p.holder.personId) : undefined;
  const to = p.reportsToId ? ix.position.get(p.reportsToId) : undefined;
  const ai = p.draft?.state === 'ai_draft';
  return (
    <li id={`p-${p.id}`} tabIndex={-1} className="flex flex-wrap items-start justify-between gap-2 py-2 outline-none focus:ring-2 focus:ring-focus">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-14 font-semibold text-navy">
          {p.title}
          {p.ref && <span className="text-12 font-normal text-muted">{p.ref}</span>}
          {ai && <Chip tone="info">{t.aiDraft(p.draft?.provenance.kind === 'document' ? p.draft.provenance.page : null)}</Chip>}
        </div>
        <div className="text-13 text-text">
          {h ? (
            <>
              {t.holder}: {h.fullName}
              {p.holder!.acting && <> <Chip tone="info">{t.acting}</Chip></>}
              {page.isAdmin && <span className="text-muted"> · {h.email ?? t.noEmail}</span>}
            </>
          ) : <Chip tone="info">{t.vacantChip}</Chip>}
        </div>
        <div className="text-12 text-muted">
          {t.reportsTo}: {to ? `${positionLabel(ix, to, repeated)} (${holderName(ix, to) ?? t.vacant})` : t.nobody}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2">
          {ai && <button type="button" className={btn} onClick={() => actions.accept(p.id)}>{t.accept}</button>}
          <button type="button" className={btn} onClick={() => actions.editPosition(p.id)}>{ai ? t.correct : t.edit}</button>
          <button type="button" className={btn} onClick={() => actions.remove('position', p.id)}>{t.remove}</button>
        </div>
      )}
    </li>
  );
}
