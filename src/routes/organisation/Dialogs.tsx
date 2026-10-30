/** Dialogs for the Organisation pages: positions, units, removal, marking as checked, confirming and replacing. */
import { useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { OrganisationAccess, OrganisationPage, PositionInput, SetupResult } from '../../data/access/setup';
import { indexStructure, unitPath, type RemovalBlocker, type WorthKind } from '../../rules/setup';
import { formatFinancialYear, formatNumber } from '../../selectors/format';
import { NODE_TYPE, type NodeKind } from '../../selectors/node';
import { en } from '../../strings/en';
import { nodeHref } from '../router';
import { itemText } from './Checks';
import { positionLabel, titleCounts } from './StructureTree';
import { btn, CheckBox, Chip, input, label, link, plural, primary } from './ui';

const e = en.setup.edit;

/** The words for a refused change. */
function errorText(page: OrganisationPage, r: SetupResult, title: string): string | null {
  if (r.ok) return null;
  const ix = indexStructure(page.structure);
  if (r.error === 'loop') return e.loop(title, en.list(r.through.map((id) => ix.position.get(id)?.title ?? id)));
  if (r.error === 'unit_loop') return e.unitLoop;
  if (r.error === 'must_fix') return e.refused(r.items.map((i) => itemText(ix, i)).join(' '));
  return e.cantSave;
}

export function PositionDialog({ access, page, id, unitId, onClose, onSaved }: {
  access: OrganisationAccess; page: OrganisationPage;
  /** Null when adding a position to `unitId`. */
  id: string | null; unitId: string; onClose: () => void; onSaved: (message?: string) => void;
}) {
  const ix = indexStructure(page.structure);
  const p = id ? ix.position.get(id) : undefined;
  const holder = p?.holder ? ix.person.get(p.holder.personId) : undefined;
  const repeated = useMemo(() => titleCounts(ix), [ix]);
  const [title, setTitle] = useState(p?.title ?? '');
  const [unit, setUnit] = useState(p?.unitId ?? unitId);
  const [reportsTo, setReportsTo] = useState<string | null>(p ? p.reportsToId : null);
  const [q, setQ] = useState('');
  const [name, setName] = useState(holder?.fullName ?? '');
  const [personId, setPersonId] = useState<string | null>(holder?.id ?? null);
  const [acting, setActing] = useState(!!p?.holder?.acting);
  const [ref, setRef] = useState(p?.ref ?? '');
  const [error, setError] = useState<string | null>(null);
  const opts = access.managerOptions(id, unit, q);
  const to = reportsTo ? ix.position.get(reportsTo) : undefined;
  const nameQ = name.trim().toLowerCase();
  const people = nameQ.length >= 2 && !personId
    ? page.structure.people.filter((x) => x.fullName.toLowerCase().includes(nameQ)).slice(0, 6)
    : [];
  const ai = p?.draft?.state === 'ai_draft';

  const save = () => {
    const input: PositionInput = {
      title: title.trim() || e.newPosition, unitId: unit, reportsToId: reportsTo, ref: ref.trim() || null,
      holder: name.trim() || personId ? { personId, name: name.trim(), acting } : null,
    };
    const r = id ? access.savePosition(id, input) : access.addPosition(input);
    const msg = errorText(page, r, input.title);
    if (msg) setError(msg);
    else onSaved(page.mode === 'structure' ? en.setup.details.saved : undefined);
  };

  return (
    <Dialog title={id ? (ai ? e.correctTitle(p!.title) : e.editTitle(p!.title)) : en.setup.tree.addPosition} onClose={onClose} wide>
      {error && <CheckBox tone="block" title={e.cantSave}>{error}</CheckBox>}
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="e-title" className={label}>{e.title}</label>
          <input id="e-title" className={input} value={title} onChange={(x) => setTitle(x.target.value)} />
        </div>
        <div>
          <label htmlFor="e-unit" className={label}>{e.unit}</label>
          <select id="e-unit" className={input} value={unit} onChange={(x) => setUnit(x.target.value)}>
            {page.structure.units.map((u) => <option key={u.id} value={u.id}>{unitPath(ix, u.id).join(' › ')}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className={label}>{e.reportsTo}</legend>
          <p className="text-14">
            {e.now}: <b>{to ? `${positionLabel(ix, to, repeated)} (${(to.holder && ix.person.get(to.holder.personId)?.fullName) || en.setup.tree.vacant})` : en.setup.tree.nobody}</b>{' '}
            {to && <button type="button" className={link} onClick={() => setReportsTo(null)}>{e.setNobody}</button>}
          </p>
          <label htmlFor="e-rq" className="sr-only">{e.findManager}</label>
          <input id="e-rq" type="search" className={input} placeholder={e.findPlaceholder} value={q} onChange={(x) => setQ(x.target.value)} />
          <p className="mt-1 text-12 text-muted" role="status">
            {q.trim().length < 2 ? e.suggested : plural(opts.total, 'match')}{opts.total > 8 && q.trim().length >= 2 ? `. ${e.firstEight}` : ''}
          </p>
          <ul className="mt-1 space-y-1">
            {opts.options.map((o) => (
              <li key={o.id}>
                <button type="button" aria-pressed={reportsTo === o.id} onClick={() => setReportsTo(o.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-14 ${reportsTo === o.id ? 'border-navy bg-info-bg' : 'border-control bg-white'} min-h-11`}>
                  <span className="font-semibold text-navy">{positionLabel(ix, o, repeated)}</span>
                  <span className="text-13 text-muted"> · {(o.holder && ix.person.get(o.holder.personId)?.fullName) || en.setup.tree.vacant} · {unitPath(ix, o.unitId).join(' › ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <div>
          <label htmlFor="e-holder" className={label}>{e.holder}</label>
          <input id="e-holder" className={input} value={name} aria-describedby="e-holder-hint" onChange={(x) => { setName(x.target.value); setPersonId(null); }} />
          <p id="e-holder-hint" className="text-12 text-muted">{e.holderFind}</p>
          {people.length > 0 && (
            <ul className="mt-1 space-y-1">
              {people.map((x) => (
                <li key={x.id}>
                  <button type="button" className={`${btn} w-full justify-start`} onClick={() => { setName(x.fullName); setPersonId(x.id); }}>
                    {x.fullName}{ix.positionsOfHolder.get(x.id)?.length ? ` · ${ix.positionsOfHolder.get(x.id)!.map((y) => y.title).join(', ')}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-14"><input type="checkbox" className="h-5 w-5 shrink-0" checked={acting} onChange={(x) => setActing(x.target.checked)} />{e.acting}</label>
        {page.mode === 'setup' && (
          <div>
            <label htmlFor="e-ref" className={label}>{e.reference}</label>
            <input id="e-ref" className={input} value={ref} onChange={(x) => setRef(x.target.value)} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{e.save}</button>
        <button type="button" className={btn} onClick={onClose}>{e.cancel}</button>
      </div>
    </Dialog>
  );
}

export function UnitDialog({ access, page, id, parentId, onClose, onSaved }: {
  access: OrganisationAccess; page: OrganisationPage; id: string | null; parentId: string | null; onClose: () => void; onSaved: (message?: string) => void;
}) {
  const ix = indexStructure(page.structure);
  const u = id ? ix.unit.get(id) : undefined;
  const [name, setName] = useState(u?.name ?? '');
  const [type, setType] = useState(u?.unitType ?? '');
  const [parent, setParent] = useState<string>(u ? u.parentId ?? '' : parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const input = { name: name.trim() || e.newUnit, unitType: type, parentId: parent || null };
    const r = id ? access.saveUnit(id, input) : access.addUnit(input);
    const msg = errorText(page, r, input.name);
    if (msg) setError(msg);
    else onSaved(page.mode === 'structure' ? en.setup.details.saved : undefined);
  };
  return (
    <Dialog title={id ? e.unitTitle : en.setup.tree.addUnit} onClose={onClose}>
      {error && <CheckBox tone="block" title={e.cantSave}>{error}</CheckBox>}
      <div className="mt-3 space-y-3">
        <div><label htmlFor="u-n" className={label}>{e.unitName}</label><input id="u-n" className={input} value={name} onChange={(x) => setName(x.target.value)} /></div>
        <div><label htmlFor="u-t" className={label}>{e.unitType}</label><input id="u-t" className={input} value={type} onChange={(x) => setType(x.target.value)} /></div>
        <div>
          <label htmlFor="u-p" className={label}>{e.sitsUnder}</label>
          <select id="u-p" className={input} value={parent} onChange={(x) => setParent(x.target.value)}>
            <option value="">{e.topUnit}</option>
            {page.structure.units.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{unitPath(ix, x.id).join(' › ')}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{e.save}</button>
        <button type="button" className={btn} onClick={onClose}>{e.cancel}</button>
      </div>
    </Dialog>
  );
}

const NODE_OF_TYPE = Object.fromEntries(Object.entries(NODE_TYPE).map(([k, v]) => [v, k])) as Record<string, NodeKind>;

export function RemoveDialog({ access, page, kind, id, onClose, onDone }: {
  access: OrganisationAccess; page: OrganisationPage; kind: 'unit' | 'position'; id: string; onClose: () => void; onDone: (message?: string) => void;
}) {
  const ix = indexStructure(page.structure);
  const name = kind === 'unit' ? ix.unit.get(id)?.name ?? '' : ix.position.get(id)?.title ?? '';
  const blockers = access.removalBlockers(kind, id);
  const r = en.setup.remove;
  const terms = page.details.termLabels;
  const fy = formatFinancialYear(page.financialYear, page.details.financialYearStartMonth);
  const holderOf = (pid: string) => { const p = ix.position.get(pid); return p?.holder ? ix.person.get(p.holder.personId)?.fullName ?? '' : ''; };
  const what = (b: RemovalBlocker) => {
    switch (b.reason) {
      case 'child_unit': return r.reason.child_unit(b.subject.title);
      case 'position_in_unit': return r.reason.position_in_unit(b.subject.title);
      case 'reports_to_it': return r.reason.reports_to_it(b.subject.title);
      case 'budget_line_draft': case 'budget_line_fixed': return r.reason.budget_line_draft(b.subject.title);
      case 'signed_contract': return r.reason.signed_contract(fy);
      case 'owns_record': {
        const k = NODE_OF_TYPE[b.subject.type];
        return r.owner(k ? terms[k].singular : b.subject.type, b.subject.code ?? '', b.subject.title);
      }
    }
  };
  const who = (b: RemovalBlocker) => {
    switch (b.reason) {
      case 'child_unit': return r.moveChild;
      case 'position_in_unit': return r.movePosition;
      case 'reports_to_it': return r.changeManager;
      case 'budget_line_draft': return r.budgetDraft(r.or(b.who.filter((w) => w.role === 'finance').map((w) => r.roleAt(w.title, en.assignedRole.finance))));
      case 'budget_line_fixed': return r.budgetFixed(r.budgetStatus[b.budgetStatus ?? ''] ?? '', name);
      case 'signed_contract': return r.signed(holderOf(id));
      case 'owns_record': return r.or(b.who.map((w) => (w.role === 'objective_owner' ? r.objectiveOwner(w.title) : w.role && w.role !== 'budget_holder' ? r.roleAt(w.title, en.assignedRole[w.role]) : w.title)));
    }
  };
  const go = () => {
    const res = access.remove(kind, id);
    if (res.ok) onDone(page.mode === 'structure' ? r.done : undefined);
  };
  // A budget submitted or approved gives one line, not one per budget line.
  const fixedLines = blockers.filter((b) => b.reason === 'budget_line_fixed');
  const shown = [...blockers.filter((b) => b.reason !== 'budget_line_fixed'), ...fixedLines.slice(0, 1)];
  return (
    <Dialog title={r.title(name)} onClose={onClose} wide>
      {blockers.length ? (
        <>
          <p className="text-14">{r.blocked(name)}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-14">
              <thead><tr className="border-b border-border"><th className="py-2 pr-3 font-semibold">{r.what}</th><th className="py-2 font-semibold">{r.who}</th></tr></thead>
              <tbody>
                {shown.slice(0, 30).map((b, n) => {
                  const k = NODE_OF_TYPE[b.subject.type];
                  return (
                    <tr key={n} className="border-b border-border align-top">
                      <td className="py-2 pr-3">
                        {b.fixed && <><Chip tone="block">{r.mustFix}</Chip>{' '}</>}
                        {b.reason === 'budget_line_fixed' ? plural(fixedLines.length, 'line') : what(b)}
                      </td>
                      <td className="py-2">
                        {who(b)}{' '}
                        {k && b.reason === 'owns_record' && <a className={link} href={nodeHref(k, b.subject.id)}>{r.open}</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length > 30 && <p className="text-13 text-muted">{r.more(formatNumber(shown.length - 30))}</p>}
          <div className="mt-4"><button type="button" className={btn} onClick={onClose}>{r.close}</button></div>
        </>
      ) : (
        <>
          <p className="text-14">{page.mode === 'structure' ? r.savedNote : r.draftNote}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={go}>{r.go}</button>
            <button type="button" className={btn} onClick={onClose}>{r.cancel}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

export function MarkDialog({ access, page, kind, onClose, onDone }: { access: OrganisationAccess; page: OrganisationPage; kind: WorthKind; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const g = page.checks.worth.find((x) => x.kind === kind)!;
  const ix = indexStructure(page.structure);
  const m = en.setup.mark;
  const save = () => {
    const r = access.markChecked(kind, reason);
    if (r.ok) onDone();
    else setError(true);
  };
  return (
    <Dialog title={m.title} onClose={onClose}>
      <p className="text-14">{g.items.length > 1 ? m.many(en.setup.checks.kinds[kind], formatNumber(g.items.length)) : itemText(ix, g.items[0]!)}</p>
      <label htmlFor="mark-reason" className={`${label} mt-3`}>{m.reason}</label>
      <textarea id="mark-reason" className={`${input} min-h-24 py-2`} value={reason} aria-invalid={error} aria-describedby={error ? 'mark-err' : undefined} onChange={(x) => setReason(x.target.value)} />
      {error && <p id="mark-err" className="text-13 text-block-text">{m.reasonRequired}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{m.save}</button>
        <button type="button" className={btn} onClick={onClose}>{m.cancel}</button>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({ access, page, onClose, onDone }: { access: OrganisationAccess; page: OrganisationPage; onClose: () => void; onDone: (message: string) => void }) {
  const st = page.structure;
  const vacant = st.positions.filter((p) => !p.holder).length;
  const unchecked = page.checks.worth.filter((g) => !page.checked[g.kind as WorthKind]).length;
  const c = en.setup.confirm;
  const execs = en.list(page.executives);
  const go = () => {
    const r = access.confirm();
    if (r.ok) onDone(c.done(execs));
  };
  return (
    <Dialog title={c.dialogTitle} onClose={onClose}>
      <p className="text-14">{c.dialogText(plural(st.units.length, 'unit'), plural(st.positions.length, 'position'), formatNumber(vacant), plural(st.people.length, 'person'))}</p>
      {unchecked > 0 && <p className="mt-2 text-14"><Chip tone="advisory">{c.unchecked(unchecked)}</Chip> {c.uncheckedNote}</p>}
      <p className="mt-2 text-13 text-muted">{c.locks(execs)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={go}>{c.go}</button>
        <button type="button" className={btn} onClick={onClose}>{c.cancel}</button>
      </div>
    </Dialog>
  );
}

export function ReplaceDialog({ ai, onGo, onClose }: { ai: boolean; onGo: () => void; onClose: () => void }) {
  const b = en.setup.build;
  return (
    <Dialog title={b.replaceTitle} onClose={onClose}>
      <p className="text-14">{b.replaceText(ai)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={onGo}>{b.replace}</button>
        <button type="button" className={btn} onClick={onClose}>{en.setup.edit.cancel}</button>
      </div>
    </Dialog>
  );
}
