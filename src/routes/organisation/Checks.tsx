/**
 * Setup checks on screen (D7-2, D7-14). Must-fix items are listed one by one, folding after six per kind, and are
 * never hidden. Worth-checking items are one row per kind with a count, opening to a filterable, downloadable list;
 * one reason marks the whole kind as checked.
 */
import { useState } from 'react';
import type { OrganisationPage } from '../../data/access/setup';
import { indexStructure, type SetupGroup, type SetupItem, type StructureIndex, type WorthKind } from '../../rules/setup';
import { formatDate, formatNumber } from '../../selectors/format';
import { en } from '../../strings/en';
import { positionLabel, titleCounts } from './StructureTree';
import { btn, CheckBox, Chip, download, FOLD, input, label, link, plural } from './ui';

const c = en.setup.checks;

export interface FixActions {
  editPosition(id: string): void;
  editUnit(id: string): void;
  openAccess(): void;
  openBuild(): void;
  merge(keep: string, drop: string): void;
  setEmail(personId: string, email: string): void;
  reveal(unitId: string): void;
  mark(kind: WorthKind): void;
}

/** The plain sentence for one item, composed from the strings file with the records' own names. */
export function itemText(ix: StructureIndex, item: SetupItem, repeated = titleCounts(ix)): string {
  const pos = (id: string) => ix.position.get(id);
  const unitName = (id: string | null | undefined) => (id ? ix.unit.get(id)?.name ?? '' : '');
  const person = (id: string) => ix.person.get(id);
  switch (item.kind) {
    case 'ai_pending': return c.text.aiPending(plural(item.ids.length, 'aiHave'));
    case 'loop': {
      const [first, ...rest] = item.ids.map((id) => pos(id)!.title);
      return rest.length ? c.text.loop(first!, en.list(rest)) : c.text.loopSelf(first!);
    }
    case 'position_unit_missing': return c.text.positionUnit(pos(item.subject.id)!.title);
    case 'unit_parent_missing': return c.text.unitParent(unitName(item.subject.id));
    case 'top_units': return c.text.topUnits(item.ids.length, en.list(item.ids.map(unitName)));
    case 'same_email': return c.text.sameEmail(en.list(item.ids.map((id) => person(id)!.fullName)), person(item.ids[0]!)!.email ?? '');
    case 'no_executive': return c.text.noExecutive;
    case 'no_staff_admin': return c.text.noStaffAdmin;
    case 'no_manager': return c.text.position(pos(item.subject.id)!.title, unitName(item.unitId));
    case 'empty_unit': {
      const a = item.answeredBy;
      const ap = a ? pos(a.positionId) : undefined;
      if (!ap) return c.text.emptyUnitNobody(unitName(item.subject.id));
      const named = positionLabel(ix, ap, repeated);
      // A repeated title already names its unit.
      return c.text.emptyUnit(unitName(item.subject.id), `${named}${a!.fromUnitId && named === ap.title ? ` (${unitName(a!.fromUnitId)})` : ''}`);
    }
    case 'no_unit_type': return c.text.noType(unitName(item.subject.id));
    case 'two_permanent': return c.text.twoPermanent(person(item.subject.id)!.fullName, en.list(item.ids.map((id) => pos(id)!.title)));
    case 'no_email': {
      const p = ix.positionsOfHolder.get(item.subject.id)?.[0];
      return c.text.noEmail(person(item.subject.id)!.fullName, p?.title ?? '', unitName(p?.unitId));
    }
  }
}

function Fix({ ix, item, a }: { ix: StructureIndex; item: SetupItem; a: FixActions }) {
  switch (item.kind) {
    case 'ai_pending': return <button type="button" className={btn} onClick={a.openBuild}>{c.text.aiPendingFix}</button>;
    case 'loop': case 'position_unit_missing': case 'no_manager':
      return <button type="button" className={btn} onClick={() => a.editPosition(item.subject.id)}>{c.fix}</button>;
    case 'unit_parent_missing': return <button type="button" className={btn} onClick={() => a.editUnit(item.subject.id)}>{c.fix}</button>;
    case 'no_unit_type': return <button type="button" className={btn} onClick={() => a.editUnit(item.subject.id)}>{c.text.noTypeFix}</button>;
    case 'top_units': return <button type="button" className={btn} onClick={a.openBuild}>{c.text.topUnitsFix}</button>;
    case 'no_executive': return <button type="button" className={btn} onClick={a.openAccess}>{c.text.openAccess}</button>;
    case 'no_staff_admin': {
      if (!item.merge) return <button type="button" className={btn} onClick={a.openAccess}>{c.text.openAccess}</button>;
      const keep = ix.person.get(item.merge.keepPersonId)!.fullName;
      const drop = ix.person.get(item.merge.dropPersonId)!.fullName;
      return <button type="button" className={btn} onClick={() => a.merge(item.merge!.keepPersonId, item.merge!.dropPersonId)}>{c.text.merge(keep, drop)}</button>;
    }
    case 'same_email':
      return (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {item.ids.map((id) => {
            const p = ix.person.get(id)!;
            return (
              <div key={id}>
                <label htmlFor={`em-${id}`} className={label}>{en.setup.access.email(p.fullName)}</label>
                <input id={`em-${id}`} type="email" className={input} defaultValue={p.email ?? ''} onBlur={(e) => { if (e.target.value.trim() !== (p.email ?? '')) a.setEmail(id, e.target.value); }} />
              </div>
            );
          })}
        </div>
      );
    default: return null;
  }
}

function MustGroup({ ix, g, a }: { ix: StructureIndex; g: SetupGroup; a: FixActions }) {
  const [all, setAll] = useState(false);
  const items = all ? g.items : g.items.slice(0, FOLD);
  return (
    <CheckBox tone="block" title={`${c.must}${g.items.length > 1 ? ` · ${c.kinds[g.kind]} · ${formatNumber(g.items.length)}` : ''}`}>
      {items.map((i, n) => (
        <div key={n} className="py-1">
          <p>{itemText(ix, i)}</p>
          <div className="mt-1 flex flex-wrap gap-2"><Fix ix={ix} item={i} a={a} /></div>
        </div>
      ))}
      {g.items.length > FOLD && !all && <button type="button" className={link} onClick={() => setAll(true)}>{c.showAll(formatNumber(g.items.length))}</button>}
    </CheckBox>
  );
}

function WorthGroup({ ix, g, a, checked, editable, canMark }: { ix: StructureIndex; g: SetupGroup; a: FixActions; checked: OrganisationPage['checked'][WorthKind]; editable: boolean; canMark: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const single = g.items.length === 1;
  const repeated = titleCounts(ix);
  const texts = g.items.map((i) => ({ i, text: itemText(ix, i, repeated) }));
  const f = filter.trim().toLowerCase();
  const list = f ? texts.filter((x) => x.text.toLowerCase().includes(f)) : texts;
  const why = c.why[g.kind];
  return (
    <CheckBox tone={checked ? 'complete' : 'advisory'} title={checked ? c.checked : c.worth}>
      <p>{single ? texts[0]!.text.replace(/([^.!?])$/, '$1.') : <b>{c.kinds[g.kind]}: {formatNumber(g.items.length)}.</b>}{why ? ` ${why}` : ''}</p>
      {checked && <p className="text-13 text-muted">{c.checkedBy(checked.by, formatDate(checked.on), checked.reason)}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!single && <button type="button" className={btn} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? c.hideList : c.showList}</button>}
        {!single && g.items.length > FOLD && (
          <button type="button" className={btn} onClick={() => download(en.setup.downloads.checksFile(c.kinds[g.kind]), [{ name: c.kinds[g.kind], rows: [[...en.setup.downloads.checkColumns], ...texts.map((x) => [x.text, x.i.unitId ? ix.unit.get(x.i.unitId)?.name ?? '' : ''])], widths: [70, 30] }])}>
            {c.download}
          </button>
        )}
        {single && editable && <Fix ix={ix} item={g.items[0]!} a={a} />}
        {single && g.items[0]!.unitId && <button type="button" className={btn} onClick={() => a.reveal(g.items[0]!.unitId!)}>{c.show}</button>}
        {canMark && !checked && <button type="button" className={btn} onClick={() => a.mark(g.kind as WorthKind)}>{c.markAsChecked}</button>}
      </div>
      {open && (
        <div className="mt-2">
          <label htmlFor={`gf-${g.kind}`} className={label}>{c.filter}</label>
          <input id={`gf-${g.kind}`} type="search" className={input} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <p className="mt-1 text-12 text-muted">{f ? `${plural(list.length, 'match')}. ` : ''}{list.length > 30 ? en.setup.tree.firstThirty : ''}</p>
          <ul className="mt-1 space-y-1">
            {list.slice(0, 30).map((x, n) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-2">
                <span>{x.text}</span>
                <span className="flex gap-2">
                  {editable && (x.i.kind === 'no_manager' || x.i.kind === 'no_unit_type') && <Fix ix={ix} item={x.i} a={a} />}
                  {x.i.unitId && <button type="button" className={btn} onClick={() => a.reveal(x.i.unitId!)}>{c.show}</button>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CheckBox>
  );
}

export function ChecksPanel({ page, a, editable }: { page: OrganisationPage; a: FixActions; editable: boolean }) {
  const ix = indexStructure(page.structure);
  const must = page.checks.must.reduce((n, g) => n + g.items.length, 0);
  const done = page.checks.worth.filter((g) => page.checked[g.kind as WorthKind]).length;
  return (
    <div>
      {page.mode === 'setup' && (must ? <p className="text-14"><Chip tone="block">{c.mustCount(formatNumber(must))}</Chip> {c.before}</p> : <p className="text-14"><Chip tone="complete">{c.nothing}</Chip></p>)}
      {page.checks.must.map((g) => <MustGroup key={g.kind} ix={ix} g={g} a={a} />)}
      {page.checks.worth.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2 text-14">
          <Chip tone="advisory">{c.worthCount(page.checks.worth.length - done)}</Chip>
          {done > 0 && <Chip tone="info">{c.checkedCount(done)}</Chip>}
        </p>
      )}
      {page.checks.worth.map((g) => <WorthGroup key={g.kind} ix={ix} g={g} a={a} checked={page.checked[g.kind as WorthKind]} editable={editable} canMark={editable && page.mode === 'setup'} />)}
    </div>
  );
}
