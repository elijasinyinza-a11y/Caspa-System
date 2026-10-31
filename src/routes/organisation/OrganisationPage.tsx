/**
 * Organisation (slice 7; Organisation Setup Specification v0.3, D7-13). Every member sees the structure read-only once
 * it is confirmed; the administrator also sets it up and edits it. Setup is not a stage of leading strategy, so the
 * header has a purpose sentence and "What is this page?" but no 7Cs stage.
 */
import { useState, type ReactNode } from 'react';
import { usePref } from '../../components/Explain';
import { useApp } from '../../components/AppContext';
import type { DraftDetails, OrganisationAccess, OrganisationPage as Page } from '../../data/access/setup';
import { readSpreadsheet } from '../../data/access/setup/files';
import { withHeader } from '../../data/access/setup/import';
import { SAMPLE_TEMPLATE_ROWS } from '../../data/sample/new-org';
import { largeStructureRows } from '../../data/sample/scale';
import { indexStructure, topUnits, unitPath, type WorthKind } from '../../rules/setup';
import { formatDate, formatFinancialYear, formatNumber } from '../../selectors/format';
import { en } from '../../strings/en';
import type { AssignedRole, SystemTerm } from '../../contract/caspa-data-contract';
import { ChecksPanel, type FixActions } from './Checks';
import { ConfirmDialog, MarkDialog, PositionDialog, RemoveDialog, ReplaceDialog, UnitDialog } from './Dialogs';
import { StructureTree, type TreeActions } from './StructureTree';
import { btn, card, CheckBox, Chip, download, downloadTemplate, FOLD, input, label, link, plural, primary } from './ui';

const S = en.setup;
type Step = 'details' | 'build' | 'review';
type Modal =
  | { kind: 'position'; id: string | null; unitId: string }
  | { kind: 'unit'; id: string | null; parentId: string | null }
  | { kind: 'remove'; what: 'unit' | 'position'; id: string }
  | { kind: 'mark'; check: WorthKind }
  | { kind: 'confirm' }
  | { kind: 'replace'; ai: boolean; run: () => void }
  | null;

export function OrganisationPage() {
  const { repo } = useApp();
  const access = repo.structure;
  const page = access.page();
  const [step, setStep] = useState<Step>('details');
  const [modal, setModal] = useState<Modal>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ unitId: string; positionId?: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState(false);
  const close = () => setModal(null);
  const done = (message?: string) => { setModal(null); setNote(message ?? null); };
  const show = (unitId: string, positionId?: string) => setReveal((r) => ({ unitId, positionId, n: (r?.n ?? 0) + 1 }));

  const tree: TreeActions = {
    editPosition: (id) => setModal({ kind: 'position', id, unitId: '' }),
    editUnit: (id) => setModal({ kind: 'unit', id, parentId: null }),
    addPosition: (unitId) => setModal({ kind: 'position', id: null, unitId }),
    addUnit: (parentId) => setModal({ kind: 'unit', id: null, parentId }),
    remove: (what, id) => setModal({ kind: 'remove', what, id }),
    accept: (id) => access.accept(id),
  };
  const fix: FixActions = {
    editPosition: tree.editPosition,
    editUnit: tree.editUnit,
    openAccess: () => { setStep('build'); setTimeout(() => document.getElementById('people-find')?.focus(), 50); },
    openBuild: () => setStep('build'),
    merge: (keep, drop) => access.mergePeople(keep, drop),
    setEmail: (id, email) => access.savePerson(id, { email }),
    reveal: (unitId) => show(unitId),
    mark: (check) => setModal({ kind: 'mark', check }),
  };

  /** Importing or drafting replaces only the draft structure; ask first when it already has entries. */
  const replacing = (ai: boolean, run: () => void) => (page.structure.units.length ? setModal({ kind: 'replace', ai, run }) : run());
  const runSheet = (rows: string[][]) => { access.importSheet(rows); setFileError(false); setNote(null); };
  const onSheetFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = await readSpreadsheet(f.name, new Uint8Array(await f.arrayBuffer()));
      replacing(false, () => runSheet(rows));
    } catch {
      setFileError(true);
    } finally {
      setBusy(false);
    }
  };
  const runAi = (name: string) => { void access.draftFromOrganogram(name).then(() => setNote(S.build.aiDrafted(name))); };

  return (
    <>
      <OrgHeader showFirstVisit={page.mode === 'setup'} />
      {note && <p role="status" className="mb-4 rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">{note}</p>}
      {page.mode === 'waiting' && (
        <section className={card}><h2 className="text-18 font-bold text-navy">{S.waitingTitle}</h2><p className="mt-1 text-14 text-muted">{S.waitingText}</p></section>
      )}
      {page.mode === 'setup' && (
        <Setup page={page} access={access} step={step} setStep={setStep} tree={tree} fix={fix} reveal={reveal} busy={busy} fileError={fileError}
          onSheetFile={onSheetFile}
          onSample={(large) => replacing(false, () => runSheet(withHeader(large ? largeStructureRows() : SAMPLE_TEMPLATE_ROWS)))}
          onAi={(name) => replacing(true, () => runAi(name))}
          onAddTop={() => setModal({ kind: 'unit', id: null, parentId: null })}
          onConfirm={() => setModal({ kind: 'confirm' })} onRevealPosition={show} />
      )}
      {page.mode === 'structure' && <Structure page={page} access={access} tree={tree} fix={fix} reveal={reveal} />}

      {modal?.kind === 'position' && <PositionDialog access={access} page={page} id={modal.id} unitId={modal.unitId} onClose={close} onSaved={done} />}
      {modal?.kind === 'unit' && <UnitDialog access={access} page={page} id={modal.id} parentId={modal.parentId} onClose={close} onSaved={done} />}
      {modal?.kind === 'remove' && <RemoveDialog access={access} page={page} kind={modal.what} id={modal.id} onClose={close} onDone={done} />}
      {modal?.kind === 'mark' && <MarkDialog access={access} page={page} kind={modal.check} onClose={close} onDone={() => done()} />}
      {modal?.kind === 'confirm' && <ConfirmDialog access={access} page={page} onClose={close} onDone={(m) => done(m)} />}
      {modal?.kind === 'replace' && <ReplaceDialog ai={modal.ai} onClose={close} onGo={() => { const run = modal.run; close(); run(); }} />}
    </>
  );
}

function OrgHeader({ showFirstVisit }: { showFirstVisit: boolean }) {
  const [help, setHelp] = useState(false);
  const [seen, setSeen] = usePref<boolean>('seen:organisation', false);
  const p = en.pageHelp;
  return (
    <div className="mb-6">
      <h1 className="text-28 font-bold text-navy md:text-34">{S.title}</h1>
      <p className="mt-1 max-w-[70ch] text-16 text-text">{S.purpose}</p>
      <button type="button" aria-expanded={help} onClick={() => setHelp(!help)} className={link}>{help ? p.hide : p.link}</button>
      {help && (
        <dl className="mt-1 max-w-[70ch] space-y-1 rounded-lg bg-info-bg p-4 text-14">
          <div><dt className="inline font-semibold text-navy">{p.shows}: </dt><dd className="inline">{S.help.shows}</dd></div>
          <div><dt className="inline font-semibold text-navy">{p.connects}: </dt><dd className="inline">{S.help.connects}</dd></div>
          <div><dt className="inline font-semibold text-navy">{p.usually}: </dt><dd className="inline">{S.help.usually}</dd></div>
        </dl>
      )}
      {showFirstVisit && !seen && (
        <div role="note" className="mt-3 flex max-w-[80ch] flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3">
          <p className="text-14 text-text">{S.firstVisit}</p>
          <button type="button" onClick={() => setSeen(true)} className={btn}>{en.firstVisit.dismiss}</button>
        </div>
      )}
    </div>
  );
}

/* ───────── Before confirmation ───────── */

function Setup({ page, access, step, setStep, tree, fix, reveal, busy, fileError, onSheetFile, onSample, onAi, onAddTop, onConfirm, onRevealPosition }: {
  page: Page; access: OrganisationAccess; step: Step; setStep: (s: Step) => void; tree: TreeActions; fix: FixActions;
  reveal: { unitId: string; positionId?: string; n: number } | null; busy: boolean; fileError: boolean;
  onSheetFile: (f: File | undefined) => void; onSample: (large: boolean) => void; onAi: (fileName: string) => void; onAddTop: () => void; onConfirm: () => void;
  onRevealPosition: (unitId: string, positionId?: string) => void;
}) {
  const st = page.structure;
  const must = page.checks.must.reduce((n, g) => n + g.items.length, 0);
  const toCheck = page.checks.worth.filter((g) => !page.checked[g.kind as WorthKind]).length;
  const vacant = st.positions.filter((p) => !p.holder).length;
  const openRows = page.rowProblems.filter((r) => !r.done).length;
  const tabs: [Step, string][] = [['details', S.tabs.details], ['build', S.tabs.build], ['review', S.tabs.review(formatNumber(must), formatNumber(toCheck))]];
  return (
    <>
      <p className="mb-4 rounded-lg bg-info-bg px-4 py-3 text-14 text-text">
        <b>{S.draftBanner}</b> {S.draftCounts(plural(st.units.length, 'unit'), plural(st.positions.length, 'position'), formatNumber(vacant), plural(st.people.length, 'person'))}{' '}
        {openRows > 0 && <Chip tone="advisory">{en.setup.rows.title}: {formatNumber(openRows)}</Chip>}
      </p>
      <div role="tablist" aria-label={S.tabs.label} className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <button key={k} id={`tab-${k}`} role="tab" type="button" aria-selected={step === k} aria-controls={`panel-${k}`} onClick={() => setStep(k)}
            className={`min-h-11 rounded-lg px-4 text-14 font-semibold ${step === k ? 'bg-navy text-white' : 'border border-control bg-white text-navy hover:border-navy'}`}>
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${step}`} aria-labelledby={`tab-${step}`}>
        {step === 'details' && (
          <>
            <DetailsForm page={page} access={access} />
            <div className="mt-4"><button type="button" className={primary} onClick={() => setStep('build')}>{S.details.next}</button></div>
          </>
        )}
        {step === 'build' && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <section className={card}>
                <h2 className="text-16 font-bold text-navy">{S.build.sheetTitle}</h2>
                <p className="mt-1 text-14 text-muted">{S.build.sheetText}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={downloadTemplate}>{S.build.template}</button>
                  <label className={`${btn} cursor-pointer focus-within:ring-[3px] focus-within:ring-focus`}>
                    {S.build.chooseSheet}
                    <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => { void onSheetFile(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  <button type="button" className={link} onClick={() => onSample(false)}>{S.build.sampleSmall}</button>
                  <button type="button" className={link} onClick={() => onSample(true)}>{S.build.sampleLarge}</button>
                </div>
                {busy && <p role="status" className="text-13 text-muted">{S.build.reading}</p>}
                {fileError && <p role="alert" className="text-13 text-block-text">{S.build.sheetError}</p>}
              </section>
              {page.aiEnabled ? (
                <section className={card}>
                  <h2 className="flex flex-wrap items-center gap-2 text-16 font-bold text-navy">{S.build.aiTitle} <Chip tone="info">{en.setup.tree.aiDraft(null)}</Chip></h2>
                  <p className="mt-1 text-14 text-muted">{S.build.aiText}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className={`${btn} cursor-pointer focus-within:ring-[3px] focus-within:ring-focus`}>
                      {S.build.chooseOrganogram}
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAi(f.name); e.target.value = ''; }} />
                    </label>
                    <button type="button" className={link} onClick={() => onAi('sample-organogram.pdf')}>{S.build.sampleOrganogram}</button>
                  </div>
                  <p className="mt-1 text-12 text-muted">{S.build.aiStubNote}</p>
                </section>
              ) : (
                <section className={card}><h2 className="text-16 font-bold text-navy">{S.build.aiTitle}</h2><p className="mt-1 text-14 text-muted">{S.build.aiOff}</p></section>
              )}
              <section className={card}>
                <h2 className="text-16 font-bold text-navy">{S.build.typeTitle}</h2>
                <p className="mt-1 text-14 text-muted">{S.build.typeText}</p>
                <div className="mt-3"><button type="button" className={btn} onClick={onAddTop}>{S.build.addTop}</button></div>
              </section>
            </div>
            {page.sheet && (
              <p className="mt-4 rounded-lg bg-info-bg px-4 py-3 text-14">
                {S.build.sheetRead(formatNumber(page.sheet.rows), plural(page.sheet.units, 'unit'), plural(page.sheet.positions, 'position'), plural(page.sheet.holders, 'holder'))}
              </p>
            )}
            {page.rowProblems.length > 0 && <RowProblems page={page} access={access} onEdit={tree.editPosition} onShow={onRevealPosition} />}
            <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
              <section className={card}>
                <h2 className="mb-3 text-18 font-bold text-navy">{S.tree.draftTitle}</h2>
                {st.units.length ? <StructureTree page={page} actions={tree} reveal={reveal} /> : <p className="text-14 text-muted">{S.tree.empty}</p>}
              </section>
              <section className={card} id="access">
                <h2 className="text-18 font-bold text-navy">{S.access.title}</h2>
                <p className="mt-1 text-14 text-muted">{S.access.intro}</p>
                <AccessList page={page} access={access} editable />
              </section>
            </div>
            <div className="mt-4"><button type="button" className={primary} onClick={() => setStep('review')}>{S.build.next}</button></div>
          </>
        )}
        {step === 'review' && (
          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <section className={card}>
              <h2 className="text-18 font-bold text-navy">{S.confirm.whatSaved}</h2>
              <p className="mt-1 mb-3 text-14 text-muted">{S.confirm.whatSavedNote(plural(st.units.length, 'unit'), plural(st.positions.length, 'position'), formatNumber(vacant), plural(st.people.length, 'person'))}</p>
              {st.units.length ? <StructureTree page={page} actions={null} reveal={reveal} /> : <p className="text-14 text-muted">{S.confirm.nothingYet}</p>}
              <h3 className="mt-5 text-16 font-bold text-navy">{S.access.title}</h3>
              <AccessList page={page} access={access} editable={false} />
            </section>
            <div className="space-y-4">
              <section className={card}>
                <h2 className="text-18 font-bold text-navy">{S.checks.title}</h2>
                <ChecksPanel page={page} a={fix} editable />
              </section>
              <section className={card}>
                <h2 className="text-18 font-bold text-navy">{S.confirm.title}</h2>
                <p className="mt-1 text-14">{page.canConfirm ? S.confirm.intro : S.confirm.needsStaff(page.staffAdmin)}</p>
                <button type="button" className={`${primary} mt-3`} disabled={!page.canConfirm || must > 0} onClick={onConfirm}>{S.confirm.button}</button>
                {page.canConfirm && must > 0 && <p className="mt-1 text-12 text-muted">{S.confirm.fixFirst(plural(must, 'item'))}</p>}
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Spreadsheet rows that need attention, counted by kind (D7-14): a few fixed on screen, many downloaded. */
function RowProblems({ page, access, onEdit, onShow }: { page: Page; access: OrganisationAccess; onEdit: (id: string) => void; onShow: (unitId: string, positionId?: string) => void }) {
  const ix = indexStructure(page.structure);
  const r = S.rows;
  const [pick, setPick] = useState<Record<string, string>>({});
  const reasonOf = (p: Page['rowProblems'][number]) =>
    p.kind === 'roles_on_vacant' ? r.rolesOnVacant(p.row, p.roles.map((x) => en.assignedRole[x]).join(', '))
    : p.ambiguous ? r.reportsAmbiguous(p.row, p.reportsTo) : r.reportsUnmatched(p.row, p.reportsTo);
  const downloadRows = (list: Page['rowProblems']) => download(en.setup.downloads.rowsFile, [{
    name: r.title, widths: [8, 32, 40, 70],
    rows: [[...en.setup.downloads.rowsColumns], ...list.map((p) => { const pos = ix.position.get(p.positionId); return [String(p.row), pos?.title ?? '', pos ? unitPath(ix, pos.unitId).join(' › ') : '', reasonOf(p)]; })],
  }]);
  return (
    <section className={`${card} mt-4`}>
      <h2 className="text-18 font-bold text-navy">{r.title}</h2>
      {(['reports_unmatched', 'roles_on_vacant'] as const).map((k) => {
        const all = page.rowProblems.filter((p) => p.kind === k);
        if (!all.length) return null;
        const open = all.filter((p) => !p.done);
        return (
          <div key={k} className="mt-3">
            <h3 className="flex flex-wrap items-center gap-2 text-16 font-semibold text-navy">
              {r.count(r.kinds[k], plural(open.length, 'row'))}
              {all.length > open.length && <Chip tone="complete">{r.fixed(all.length - open.length)}</Chip>}
            </h3>
            {open.length > FOLD && (
              <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-14">
                {r.showing(FOLD, formatNumber(open.length))}
                <button type="button" className={btn} onClick={() => downloadRows(open)}>{r.downloadRows(formatNumber(open.length))}</button>
                {r.downloadNote}
              </p>
            )}
            {open.slice(0, FOLD).map((p) => {
              const pos = ix.position.get(p.positionId);
              if (!pos) return null;
              const options = access.managerOptions(pos.id, pos.unitId, '').options;
              return (
                <CheckBox key={`${k}-${p.positionId}`} tone="advisory" title={r.needsAttention}>
                  <p>{reasonOf(p)} {pos.title}, {ix.unit.get(pos.unitId)?.name}.</p>
                  {p.kind === 'reports_unmatched' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label htmlFor={`rp-${p.positionId}`} className="text-13 font-semibold">{r.reportsTo}</label>
                      <select id={`rp-${p.positionId}`} className={`${input} w-auto max-w-full`} value={pick[p.positionId] ?? options[0]?.id ?? ''} onChange={(e) => setPick({ ...pick, [p.positionId]: e.target.value })}>
                        {options.map((o) => <option key={o.id} value={o.id}>{o.title} — {(o.holder && ix.person.get(o.holder.personId)?.fullName) || S.tree.vacant}</option>)}
                      </select>
                      <button type="button" className={btn} disabled={!options.length} onClick={() => access.fixRowReports(p.positionId, pick[p.positionId] ?? options[0]!.id)}>{r.useThis}</button>
                      <button type="button" className={btn} onClick={() => onEdit(p.positionId)}>{S.tree.edit}</button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={btn} onClick={() => access.dropVacantRoles(p.positionId)}>{r.dropRoles}</button>
                      <button type="button" className={btn} onClick={() => onEdit(p.positionId)}>{r.addHolder}</button>
                      <button type="button" className={btn} onClick={() => onShow(pos.unitId, pos.id)}>{S.checks.show}</button>
                    </div>
                  )}
                </CheckBox>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

/* ───────── People and access (D7-14: people with an assigned role, plus a search) ───────── */

const ROLE_KEYS = Object.keys(en.assignedRole) as AssignedRole[];

function AccessList({ page, access, editable }: { page: Page; access: OrganisationAccess; editable: boolean }) {
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const st = page.structure;
  const ix = indexStructure(st);
  const withRoles = st.people.filter((p) => p.roles.length || added.includes(p.id));
  const query = q.trim().toLowerCase();
  const found = query.length >= 2 ? st.people.filter((p) => !withRoles.includes(p) && (p.fullName.toLowerCase().includes(query) || (p.email ?? '').toLowerCase().includes(query))).slice(0, 10) : [];
  const a = S.access;
  const row = (p: (typeof st.people)[number]) => {
    const held = ix.positionsOfHolder.get(p.id) ?? [];
    const ends = page.endsOn[p.id];
    return (
      <tr key={p.id} className="border-b border-border align-top">
        <td className="py-2 pr-3">
          {editable && !held.length ? (
            <><label htmlFor={`nm-${p.id}`} className="sr-only">{a.name(p.fullName)}</label>
              <input id={`nm-${p.id}`} className={input} defaultValue={p.fullName} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== p.fullName) access.savePerson(p.id, { fullName: e.target.value }); }} /></>
          ) : <b className="text-navy">{p.fullName}</b>}
          {page.isAdmin && (editable ? (
            <><label htmlFor={`em-a-${p.id}`} className="sr-only">{a.email(p.fullName)}</label>
              <input id={`em-a-${p.id}`} type="email" className={`${input} mt-1`} placeholder={a.noEmail} defaultValue={p.email ?? ''} onBlur={(e) => { if ((e.target.value.trim() || null) !== p.email) access.savePerson(p.id, { email: e.target.value }); }} /></>
          ) : <div className="text-12 text-muted">{p.email ?? a.noEmail}</div>)}
          {ends && <div className="text-12 text-muted">{a.endsOn(formatDate(ends))}</div>}
        </td>
        <td className="py-2 pr-3 text-13">{held.map((x) => x.title).join(', ') || <span className="text-muted">{a.none}</span>}</td>
        <td className="py-2 text-13">
          {editable ? (
            <fieldset><legend className="sr-only">{a.roles}: {p.fullName}</legend>
              {ROLE_KEYS.map((k) => (
                <label key={k} className="flex min-h-8 items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={p.roles.includes(k)}
                    onChange={(e) => access.savePerson(p.id, { roles: e.target.checked ? [...p.roles, k] : p.roles.filter((x) => x !== k) })} />
                  {en.assignedRole[k]}
                </label>
              ))}
            </fieldset>
          ) : p.roles.map((k) => en.assignedRole[k]).join(', ')}
        </td>
      </tr>
    );
  };
  return (
    <div>
      <p className="mt-2 text-13 text-muted">{a.count(plural(withRoles.length, 'peopleHave'), plural(st.people.length, 'person'))}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-14">
          <thead><tr className="border-b border-border"><th className="py-2 pr-3 font-semibold">{a.person}</th><th className="py-2 pr-3 font-semibold">{a.position}</th><th className="py-2 font-semibold">{a.roles}</th></tr></thead>
          <tbody>{withRoles.map(row)}</tbody>
        </table>
      </div>
      {editable && (
        <>
          <div className="mt-3">
            <label htmlFor="people-find" className={label}>{a.find}</label>
            <input id="people-find" type="search" className={input} placeholder={a.findPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {query.length >= 2 && (found.length ? (
            <div className="mt-1 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-14"><tbody>{found.map(row)}</tbody></table></div>
          ) : <p className="mt-1 text-13 text-muted">{a.nobodyElse}</p>)}
          <button type="button" className={`${btn} mt-3`} onClick={() => { const r = access.addPerson(); if (r.ok) setAdded([...added, r.id]); }}>{a.addPerson}</button>
        </>
      )}
    </div>
  );
}

/* ───────── Details and settings (D7-11) ───────── */

const intlValues = (key: string): string[] => (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(key) ?? [];
const MONTHS = Array.from({ length: 12 }, (_v, i) => new Date(Date.UTC(2026, i, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }));
let countryCache: [string, string][] | null = null;
const countries = () => {
  if (countryCache) return countryCache;
  const names = new Intl.DisplayNames(['en-GB'], { type: 'region' });
  const out: [string, string][] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    const name = names.of(code);
    if (name && name !== code && !/pseudo|unknown/i.test(name)) out.push([code, name]);
  }
  countryCache = out.sort((x, y) => x[1].localeCompare(y[1]));
  return countryCache;
};

function DetailsForm({ page, access }: { page: Page; access: OrganisationAccess }) {
  const [d, setD] = useState<DraftDetails>(() => structuredClone(page.details));
  const [saved, setSaved] = useState(false);
  const set = (next: DraftDetails) => {
    setD(next);
    setSaved(false);
    if (page.mode === 'setup') access.saveDetails(next); // the draft keeps every change at once
  };
  const s = d.settings;
  const D = S.details;
  const T = S.settings;
  const currencies = intlValues('currency');
  const zones = intlValues('timeZone');
  const curName = new Intl.DisplayNames(['en-GB'], { type: 'currency' });
  const field = (id: string, text: string, control: ReactNode, hint?: string) => (
    <div><label htmlFor={id} className={label}>{text}</label>{control}{hint && <p className="mt-1 text-12 text-muted">{hint}</p>}</div>
  );
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : fallback);
  const terms = Object.keys(d.termLabels) as SystemTerm[];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-18 font-bold text-navy">{D.title}</h2>
        <div className="mt-3 space-y-3">
          {field('d-name', D.name, <input id="d-name" className={input} value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} />)}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('d-country', D.country, <select id="d-country" className={input} value={d.countryCode} onChange={(e) => set({ ...d, countryCode: e.target.value })}>{countries().map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>)}
            {field('d-tz', D.timeZone, <select id="d-tz" className={input} value={d.timeZone} onChange={(e) => set({ ...d, timeZone: e.target.value })}>{(zones.includes(d.timeZone) ? zones : [d.timeZone, ...zones]).map((z) => <option key={z} value={z}>{z}</option>)}</select>)}
          </div>
          {field('d-cur', D.currency, (
            <select id="d-cur" className={input} value={d.baseCurrency} disabled={page.locked} onChange={(e) => set({ ...d, baseCurrency: e.target.value })}>
              {(currencies.includes(d.baseCurrency) ? currencies : [d.baseCurrency, ...currencies]).map((c) => <option key={c} value={c}>{c}, {curName.of(c)}</option>)}
            </select>
          ), page.locked ? D.locked : undefined)}
          {field('d-fy', D.fyStart, (
            <select id="d-fy" className={input} value={d.financialYearStartMonth} disabled={page.locked} onChange={(e) => set({ ...d, financialYearStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          ), `${D.fyLabel(formatFinancialYear(page.financialYear, d.financialYearStartMonth))} ${page.locked ? D.locked : D.lockNote}`)}
        </div>
      </section>
      <section className={card}>
        <h2 className="text-18 font-bold text-navy">{T.title}</h2>
        <p className="mt-1 text-14 text-muted">{T.intro}</p>
        <div className="mt-3 space-y-3">
          <fieldset><legend className={label}>{T.board}</legend>
            <label className="flex min-h-11 items-center gap-2 text-14"><input type="checkbox" className="h-5 w-5 shrink-0" checked={s.boardApprovalRequired.plan} onChange={(e) => set({ ...d, settings: { ...s, boardApprovalRequired: { ...s.boardApprovalRequired, plan: e.target.checked } } })} />{T.boardPlan}</label>
            <label className="flex min-h-11 items-center gap-2 text-14"><input type="checkbox" className="h-5 w-5 shrink-0" checked={s.boardApprovalRequired.budget} onChange={(e) => set({ ...d, settings: { ...s, boardApprovalRequired: { ...s.boardApprovalRequired, budget: e.target.checked } } })} />{T.boardBudget}</label>
          </fieldset>
          <fieldset><legend className={label}>{T.kpiStatus}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('s-on', T.onTrack, <input id="s-on" type="number" min={0} max={100} className={input} value={Math.round(s.kpiStatus.onTrackAt * 100)} onChange={(e) => set({ ...d, settings: { ...s, kpiStatus: { ...s.kpiStatus, onTrackAt: num(e.target.value, 90) / 100 } } })} />)}
              {field('s-risk', T.atRisk, <input id="s-risk" type="number" min={0} max={100} className={input} value={Math.round(s.kpiStatus.atRiskAt * 100)} onChange={(e) => set({ ...d, settings: { ...s, kpiStatus: { ...s.kpiStatus, atRiskAt: num(e.target.value, 70) / 100 } } })} />)}
            </div>
          </fieldset>
          <fieldset><legend className={label}>{T.perspectives}</legend>
            <label className="flex min-h-11 items-center gap-2 text-14">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={!!d.perspectives} onChange={(e) => set({ ...d, perspectives: e.target.checked ? page.details.perspectives ?? T.defaultPerspectives.map((x) => ({ ...x })) : null })} />
              {T.perspectivesUsed}
            </label>
            {d.perspectives && <div className="grid gap-2 sm:grid-cols-2">{d.perspectives.map((p, i) => (
              <div key={p.key}><label htmlFor={`pv-${p.key}`} className="sr-only">{p.label}</label>
                <input id={`pv-${p.key}`} className={input} value={p.label} onChange={(e) => set({ ...d, perspectives: d.perspectives!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></div>
            ))}</div>}
          </fieldset>
          {field('s-review', T.reviews, <select id="s-review" className={input} value={s.reviewModel} onChange={(e) => set({ ...d, settings: { ...s, reviewModel: e.target.value as typeof s.reviewModel } })}>{(Object.keys(T.reviewModel) as (keyof typeof T.reviewModel)[]).map((k) => <option key={k} value={k}>{T.reviewModel[k]}</option>)}</select>)}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('s-over', T.overdue, <input id="s-over" type="number" min={0} className={input} value={s.overdueEscalationDays} onChange={(e) => set({ ...d, settings: { ...s, overdueEscalationDays: num(e.target.value, 7) } })} />)}
            {field('s-group', T.minGroup, <input id="s-group" type="number" min={1} className={input} value={s.consultationMinGroupSize} onChange={(e) => set({ ...d, settings: { ...s, consultationMinGroupSize: num(e.target.value, 5) } })} />)}
          </div>
          <fieldset><legend className={label}>{T.ai}</legend>
            <label className="flex min-h-11 items-center gap-2 text-14"><input type="checkbox" className="h-5 w-5 shrink-0" checked={s.aiEnabled} onChange={(e) => set({ ...d, settings: { ...s, aiEnabled: e.target.checked } })} />{T.aiOn}</label>
            <p className="text-12 text-muted">{T.aiNote}</p>
          </fieldset>
          <fieldset>
            <legend className={label}>{T.structureView.title}</legend>
            <p className="mt-1 text-13 font-semibold text-navy">{T.structureView.fullView}</p>
            <p className="text-12 text-muted">{T.structureView.adminAlways}</p>
            <div className="grid sm:grid-cols-2">
              {(Object.keys(en.assignedRole) as AssignedRole[]).filter((r) => r !== 'org_admin').map((r) => (
                <label key={r} className="flex min-h-11 items-center gap-2 text-14">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={s.structureView.fullViewRoles.includes(r)}
                    onChange={(e) => set({ ...d, settings: { ...s, structureView: { ...s.structureView, fullViewRoles: e.target.checked ? [...s.structureView.fullViewRoles, r] : s.structureView.fullViewRoles.filter((x) => x !== r) } } })} />
                  {en.assignedRole[r]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-13 font-semibold text-navy">{T.structureView.others}</p>
            {(Object.keys(T.structureView.levels) as (keyof typeof T.structureView.levels)[]).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-14">
                <input type="radio" name="structure-others" className="h-5 w-5 shrink-0" checked={s.structureView.others === k}
                  onChange={() => set({ ...d, settings: { ...s, structureView: { ...s.structureView, others: k } } })} />
                {T.structureView.levels[k]}
              </label>
            ))}
            <p className="mt-1 text-12 text-muted">{T.structureView.floor}</p>
          </fieldset>
          <p className="text-14"><span className="font-semibold text-navy">{T.rating}: </span><span className="text-muted">{T.ratingNote}</span></p>
          <fieldset><legend className={label}>{T.words}</legend>
            <div className="mt-1 space-y-2">
              {terms.map((k) => (
                <div key={k} className="grid gap-2 sm:grid-cols-2">
                  <div><label htmlFor={`tw-${k}`} className="sr-only">{T.singular(page.details.termLabels[k].singular)}</label>
                    <input id={`tw-${k}`} className={input} value={d.termLabels[k].singular} onChange={(e) => set({ ...d, termLabels: { ...d.termLabels, [k]: { ...d.termLabels[k], singular: e.target.value } } })} /></div>
                  <div><label htmlFor={`tp-${k}`} className="sr-only">{T.plural(page.details.termLabels[k].singular)}</label>
                    <input id={`tp-${k}`} className={input} value={d.termLabels[k].plural} onChange={(e) => set({ ...d, termLabels: { ...d.termLabels, [k]: { ...d.termLabels[k], plural: e.target.value } } })} /></div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-12 text-muted">{T.bookNames}</p>
          </fieldset>
          {page.mode === 'structure' && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primary} onClick={() => { if (access.saveDetails(d).ok) setSaved(true); }}>{D.save}</button>
              {saved && <span role="status" className="text-13 text-complete-text">{D.saved}</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ───────── After confirmation ───────── */

function Structure({ page, access, tree, fix, reveal }: {
  page: Page; access: OrganisationAccess; tree: TreeActions; fix: FixActions; reveal: { unitId: string; positionId?: string; n: number } | null;
}) {
  const st = page.structure;
  const ix = indexStructure(st);
  const vacant = st.positions.filter((p) => !p.holder).length;
  const [details, setDetails] = useState(false);
  return (
    <>
      <p className="mb-4 rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">
        {S.structure.confirmedBy(page.confirmed!.by, formatDate(page.confirmed!.on))}{page.isAdmin ? ` ${S.structure.changesSaved}` : ''}{page.scoped ? ` ${S.structure.scopedNote}` : ''}
      </p>
      {page.isAdmin && page.checks.worth.length > 0 && (
        <details className={`${card} mb-4`}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-14"><Chip tone="advisory">{S.checks.worthCount(page.checks.worth.length)}</Chip> {S.checks.onStructure}</summary>
          <ChecksPanel page={page} a={fix} editable />
        </details>
      )}
      <div className={`grid gap-4 ${page.isAdmin ? 'xl:grid-cols-[3fr_2fr]' : ''}`}>
        <section className={card}>
          <h2 className="text-18 font-bold text-navy">{S.tree.structureTitle}</h2>
          <p className="mt-1 mb-3 text-14 text-muted">{S.tree.counts(plural(st.units.length, 'unit'), plural(st.positions.length, 'position'), formatNumber(vacant))}</p>
          {st.positions.length > 500 && <p className="mb-2 text-13 text-muted">{S.largeHint(plural(st.positions.length, 'position'))}</p>}
          {topUnits(ix).length ? <StructureTree page={page} actions={page.isAdmin ? tree : null} reveal={reveal} /> : <p className="text-14 text-muted">{S.confirm.nothingYet}</p>}
        </section>
        {page.isAdmin && (
          <div className="space-y-4">
            <section className={card}>
              <h2 className="text-18 font-bold text-navy">{S.access.title}</h2>
              <p className="mt-1 text-14 text-muted">{S.access.intro}</p>
              <AccessList page={page} access={access} editable />
            </section>
            {page.changes.length > 0 && (
              <section className={card}>
                <h2 className="text-18 font-bold text-navy">{S.structure.changes}</h2>
                <ul className="mt-2 space-y-1 text-13">
                  {page.changes.map((c, i) => <li key={i}>{S.structure.change(`${S.structure.actions[c.action] ?? c.action}: ${c.label}`, c.by, formatDate(c.at))}</li>)}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      {page.isAdmin && (
        <section className="mt-4">
          <button type="button" className={link} aria-expanded={details} onClick={() => setDetails(!details)}>{S.structure.detailsTitle}</button>
          {details && <div className="mt-2"><DetailsForm page={page} access={access} /></div>}
        </section>
      )}
    </>
  );
}
