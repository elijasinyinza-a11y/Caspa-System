/**
 * The Strategy workspace in slice 8: onboarding's import door (Onboarding Specification v0.1, O1 to O9).
 * The formation stages arrive with the Strategy formation slice; until then "Form a new strategy" is "Coming later" (O6).
 */
import { useState } from 'react';
import { useApp } from '../components/AppContext';
import { Dialog } from '../components/Dialog';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import type { ItemInput, OnboardingPage, PlanItemView } from '../data/access/onboarding';
import { readSpreadsheet } from '../data/access/setup/files';
import type { ISODate, PerspectiveKey, SixPLevel } from '../contract/caspa-data-contract';
import type { PlanMust } from '../rules/onboarding';
import { formatDate, formatFinancialYear, formatNumber } from '../selectors/format';
import { en } from '../strings/en';
import { btn, card, CheckBox, Chip, download, input, label, link, plural, primary } from './organisation/ui';

const O = en.onboarding;

/** Set by "Bring your existing plan" on Home, so the Strategy workspace opens straight on plan setup. */
let openSetupNext = false;
export const openPlanSetup = () => { openSetupNext = true; };

export function Strategy() {
  const { repo } = useApp();
  const ob = repo.onboarding;
  const page = ob.page();
  const [note, setNote] = useState<string | null>(null);
  const [setup, setSetup] = useState(() => { const v = openSetupNext; openSetupNext = false; return v; });
  return (
    <>
      <WorkspaceHeader w="strategy" title={en.nav.strategy} intro={en.workspaceIntro.strategy} />
      {note && <p role="status" className="mb-4 rounded-lg border border-complete-border bg-complete-bg px-4 py-3 text-14 text-complete-text">{note}</p>}
      {!page.plan ? (
        setup && page.canSetUp ? <SetupForm page={page} onDone={(m) => { setSetup(false); setNote(m); }} onCancel={() => setSetup(false)} />
          : <FirstQuestion page={page} onImport={() => setSetup(true)} />
      ) : (
        <PlanView page={page} setNote={setNote} />
      )}
    </>
  );
}

/* ───────── The first question (O1, O6) ───────── */

export function FirstQuestion({ page, onImport }: { page: OnboardingPage; onImport: () => void }) {
  const sees = page.canSetUp || page.isExecutive || page.steps.length > 0;
  if (!sees) return <p className="rounded-lg bg-info-bg px-4 py-3 text-14">{O.beingPrepared}</p>;
  const door = 'flex min-h-44 flex-col gap-2 rounded-xl border border-border border-t-4 bg-white p-5 text-left';
  return (
    <section className={card} aria-labelledby="first-q">
      <h2 id="first-q" className="text-22 font-bold text-navy">{O.question}</h2>
      <p className="mt-1 text-14 text-muted">{page.canSetUp ? O.questionIntro : O.questionOthers(page.strategyOffice)}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <button type="button" disabled={!page.canSetUp} onClick={onImport} className={`${door} border-t-strategy-mark hover:border-navy disabled:cursor-not-allowed disabled:opacity-75`}>
          <span className="text-22 font-bold text-navy">{O.importDoor}</span>
          <span className="text-14 text-text">{O.importDoorText}</span>
        </button>
        <button type="button" disabled aria-describedby="form-later" className={`${door} cursor-not-allowed opacity-75`}>
          <span className="text-22 font-bold text-navy">{O.formDoor}</span>
          <span className="text-14 text-text">{O.formDoorText}</span>
          <span id="form-later"><Chip tone="info">{O.comingLater}</Chip></span>
        </button>
      </div>
    </section>
  );
}

/* ───────── Getting started (section 7) ───────── */

export function GettingStarted() {
  const { repo, navigate } = useApp();
  const page = repo.onboarding.page();
  if (!page.steps.length) return null;
  const confirmed = repo.structureConfirmed();
  const counts = page.items.length
    ? `${plural(page.items.filter((i) => i.kind === 'goal').length, 'goal')}, ${plural(page.items.filter((i) => i.kind === 'objective').length, 'objective')}, ${plural(page.items.filter((i) => i.kind === 'kpi').length, 'kpi')}, ${plural(page.items.filter((i) => i.kind === 'activity').length, 'activity')}.`
    : null;
  const S = O.started;
  const detail = (key: string, state: string) => {
    switch (key) {
      case 'structure': return S.detail.structure(state === 'done', confirmed?.by ?? null, confirmed ? formatDate(confirmed.on) : null);
      case 'strategy_office': return S.detail.strategy_office(page.strategyOffice, state);
      case 'plan_setup': return S.detail.plan_setup(page.plan ? `${page.plan.title}, ${page.plan.label}` : null);
      case 'plan_content': return S.detail.plan_content(counts, page.must.length);
      case 'plan_confirmed': return S.detail.plan_confirmed(state, page.plan?.confirmed?.by ?? null);
      case 'published': return S.detail.published;
      default: return S.detail.why;
    }
  };
  const tone = { done: 'complete', next: 'advisory', later: 'info', must: 'block' } as const;
  const target = (key: string) => (key === 'structure' || key === 'strategy_office' ? { kind: 'org' as const } : key === 'why' ? null : { kind: 'workspace' as const, w: 'strategy' as const });
  return (
    <section aria-labelledby="getting-started" className={`${card} mt-6`}>
      <h2 id="getting-started" className="text-18 font-bold text-navy">{S.title}</h2>
      <ol className="mt-2 divide-y divide-border">
        {page.steps.map((st) => {
          const t = target(st.key);
          return (
            <li key={st.key} className="flex flex-wrap items-start gap-3 py-3">
              <span className="w-24 shrink-0"><Chip tone={tone[st.state]}>{S.state[st.state]}</Chip></span>
              <span className="min-w-0 flex-1">
                <b className="text-14 text-navy">{S.steps[st.key]}</b>
                <span className="block text-13 text-muted">{detail(st.key, st.state)}</span>
              </span>
              {t && (st.state === 'next' || st.state === 'must') && (
                <a href={t.kind === 'org' ? '#/organisation' : '#/strategy'} className={link} onClick={(e) => { e.preventDefault(); navigate(t); }}>{S.open}</a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ───────── Plan setup ───────── */

function SetupForm({ page, onDone, onCancel }: { page: OnboardingPage; onDone: (m: string | null) => void; onCancel: () => void }) {
  const { repo } = useApp();
  const start = page.org.fyStartMonth;
  const years = Array.from({ length: 11 }, (_v, i) => page.financialYear - 5 + i);
  const p = page.plan;
  const [title, setTitle] = useState(p?.title ?? '');
  const [first, setFirst] = useState(p?.startYear ?? page.financialYear - 1);
  const [last, setLast] = useState(p?.endYear ?? page.financialYear + 3);
  const [owner, setOwner] = useState<string>(page.positions.find((x) => page.strategyOffice && x.holder === page.strategyOffice)?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const S = O.setup;
  const save = () => {
    const r = repo.onboarding.setupPlan({ title: title.trim() || S.titleFor(first, last), startYear: first, endYear: last, processOwnerPositionId: owner || null });
    if (!r.ok) setError(r.error === 'period' ? S.periodError : null);
    else onDone(null);
  };
  return (
    <section className={card} aria-labelledby="plan-setup">
      <h2 id="plan-setup" className="text-18 font-bold text-navy">{S.title}</h2>
      <p className="mt-1 text-14 text-muted">{S.intro(S.yearNote(formatFinancialYear(page.financialYear, start)))}</p>
      {error && <CheckBox tone="block" title={en.setup.edit.cantSave}>{error}</CheckBox>}
      <div className="mt-3 space-y-3">
        <div><label htmlFor="pl-title" className={label}>{S.planTitle}</label><input id="pl-title" className={input} value={title} placeholder={S.titleFor(first, last)} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="pl-first" className={label}>{S.first}</label>
            <select id="pl-first" className={input} value={first} onChange={(e) => setFirst(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{formatFinancialYear(y, start)}</option>)}</select></div>
          <div><label htmlFor="pl-last" className={label}>{S.last}</label>
            <select id="pl-last" className={input} value={last} onChange={(e) => setLast(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{formatFinancialYear(y, start)}</option>)}</select></div>
        </div>
        <div><label htmlFor="pl-owner" className={label}>{S.processOwner}</label>
          <select id="pl-owner" className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{S.none}</option>
            {page.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? O.vacant})</option>)}
          </select></div>
        <p className="text-14">{S.board(p?.boardApprovalRequired ?? page.boardApprovalForNew)}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={save}>{p ? S.saveChanges : S.save}</button>
        <button type="button" className={btn} onClick={onCancel}>{S.cancel}</button>
      </div>
    </section>
  );
}

/* ───────── The plan being brought in ───────── */

function PlanView({ page, setNote }: { page: OnboardingPage; setNote: (m: string | null) => void }) {
  const { repo, navigate } = useApp();
  const ob = repo.onboarding;
  const p = page.plan!;
  const fy = formatFinancialYear(page.financialYear, page.org.fyStartMonth);
  const [edit, setEdit] = useState<PlanItemView | null>(null);
  const [remove, setRemove] = useState<PlanItemView | null>(null);
  const [replace, setReplace] = useState<(() => void) | null>(null);
  const [editSetup, setEditSetup] = useState(false);
  const [fileError, setFileError] = useState(false);
  const draft = p.status === 'draft';
  const strategy = page.canSetUp;
  const status = p.published ? O.plan.status.published : p.status === 'draft' ? (p.sentBy ? O.plan.status.with : O.plan.status.draft) : O.plan.status[p.status];

  if (p.published) {
    return (
      <section className={card}>
        <h2 className="text-18 font-bold text-navy">{p.title}</h2>
        <p className="mt-1 text-14 text-muted">{p.label}</p>
        <p className="mt-2"><Chip tone="complete">{status}</Chip></p>
        {p.confirmed && <p className="mt-2 text-14">{O.confirm.confirmedBy(p.confirmed.by, formatDate(p.confirmed.on), p.confirmed.ref)}</p>}
        <p className="mt-2 text-14 text-muted">{O.strategyHome.formingLater}</p>
        <a href="#/cascade" className={link} onClick={(e) => { e.preventDefault(); navigate({ kind: 'workspace', w: 'cascade' }); }}>{en.nav.cascade}</a>
      </section>
    );
  }
  if (editSetup && strategy && draft) return <SetupForm page={page} onDone={() => setEditSetup(false)} onCancel={() => setEditSetup(false)} />;

  const replacing = (run: () => void) => (page.items.length ? setReplace(() => run) : run());
  const onSheet = async (f: File | undefined) => {
    if (!f) return;
    try {
      const rows = await readSpreadsheet(f.name, new Uint8Array(await f.arrayBuffer()));
      replacing(() => { ob.importSheet(rows); setFileError(false); setNote(null); });
    } catch { setFileError(true); }
  };
  const runDoc = (name: string) => replacing(() => { void ob.draftFromDocument(name).then(() => setNote(O.routes.aiDrafted(name))); });
  const sheet = page.sheet;
  const goals = page.items.filter((i) => i.kind === 'goal');
  const kidsOf = (id: string) => page.items.filter((i) => i.parentId === id);
  const count = (k: string) => page.items.filter((i) => i.kind === k).length;

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-18 font-bold text-navy">{p.title}</h2>
            <p className="mt-1 text-13 text-muted">{p.label} · {O.plan.broughtIn}{p.processOwner ? ` · ${O.plan.processOwner(p.processOwner)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={p.status === 'active' ? 'complete' : 'info'}>{status}</Chip>
            {strategy && draft && <button type="button" className={btn} onClick={() => setEditSetup(true)}>{O.setup.edit}</button>}
          </div>
        </div>
        {strategy && draft && (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <h3 className="flex flex-wrap items-center gap-2 text-16 font-bold text-navy">{O.routes.docTitle} <Chip tone="info">{O.item.aiDraft(null)}</Chip></h3>
              {page.org.aiEnabled ? (
                <>
                  <p className="mt-1 text-13 text-muted">{O.routes.docText}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className={`${btn} cursor-pointer focus-within:ring-[3px] focus-within:ring-focus`}>
                      {O.routes.chooseDoc}
                      <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) runDoc(f.name); e.target.value = ''; }} />
                    </label>
                    <button type="button" className={link} onClick={() => runDoc('sample-strategic-plan.pdf')}>{O.routes.sampleDoc}</button>
                  </div>
                  <p className="mt-1 text-12 text-muted">{O.routes.stubNote}</p>
                </>
              ) : <p className="mt-1 text-13 text-muted">{O.routes.aiOff}</p>}
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-16 font-bold text-navy">{O.routes.sheetTitle}</h3>
              <p className="mt-1 text-13 text-muted">{O.routes.sheetText}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={() => download(O.template.fileName, [
                  { name: O.template.sheetName, rows: [[...O.template.columns]], widths: [12, 10, 40, 10, 30, 22, 12, 18, 12, 10, 14, 16, 12, 10, 14] },
                  { name: O.template.instructionsSheet, rows: O.template.instructions.map((r) => [...r]), widths: [120] },
                ])}>{O.routes.template}</button>
                <label className={`${btn} cursor-pointer focus-within:ring-[3px] focus-within:ring-focus`}>
                  {O.routes.chooseSheet}
                  <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => { void onSheet(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
              <button type="button" className={link} onClick={() => replacing(() => { ob.importSheet(ob.sampleSheet()); setNote(null); })}>{O.routes.sampleSheet}</button>
              {fileError && <p role="alert" className="text-13 text-block-text">{O.routes.sheetError}</p>}
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-16 font-bold text-navy">{O.routes.typeTitle}</h3>
              <p className="mt-1 text-13 text-muted">{O.routes.typeText}</p>
              <button type="button" className={`${btn} mt-2`} onClick={() => { const r = ob.addItem('goal', null); if (r.ok) setEdit(ob.page().items.find((i) => i.id === r.id) ?? null); }}>{O.routes.addGoal}</button>
            </div>
          </div>
        )}
        {sheet && <p className="mt-3 rounded-lg bg-info-bg px-4 py-3 text-14">{O.routes.sheetRead(plural(sheet.rows, 'row'), plural(sheet.goals, 'goal'), plural(sheet.objectives, 'objective'), plural(sheet.kpis, 'kpi'), plural(sheet.activities, 'activity'))}</p>}
      </section>

      {strategy && page.problems.length > 0 && (
        <section className={`${card} mt-4`}>
          <h2 className="text-18 font-bold text-navy">{O.rows.title(formatNumber(page.problems.length))}</h2>
          {page.problems.map((x) => <OwnerFix key={x.code} page={page} code={x.code} owner={x.kind === 'parent_missing' ? '' : x.owner} ambiguous={x.kind === 'owner_ambiguous'} />)}
        </section>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section className={card}>
          <h2 className="text-18 font-bold text-navy">{O.plan.content}</h2>
          {page.items.length ? (
            <>
              <p className="mt-1 text-13 text-muted">{O.plan.counts(plural(count('goal'), 'goal'), plural(count('objective'), 'objective'), plural(count('kpi'), 'kpi'), plural(count('activity'), 'activity'))} {O.plan.scope(fy)}</p>
              <ul className="mt-3 space-y-2">{goals.map((g) => <ItemRow key={g.id} i={g} kidsOf={kidsOf} page={page} fy={fy} onEdit={setEdit} onRemove={setRemove} />)}</ul>
            </>
          ) : <p className="mt-1 text-14 text-muted">{O.plan.empty}</p>}
        </section>
        <div className="space-y-4">
          <Checks page={page} onEdit={setEdit} setNote={setNote} />
          <Action page={page} setNote={setNote} />
          <Vision page={page} setNote={setNote} />
        </div>
      </div>

      {edit && <EditDialog item={edit} page={page} fy={fy} onClose={() => setEdit(null)} />}
      {remove && (
        <Dialog title={O.edit.removeTitle(remove.code)} onClose={() => setRemove(null)}>
          <p className="text-14">{O.edit.removeText}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className={primary} onClick={() => { ob.removeItem(remove.type, remove.id); setRemove(null); }}>{O.edit.removeGo}</button>
            <button type="button" className={btn} onClick={() => setRemove(null)}>{O.edit.cancel}</button>
          </div>
        </Dialog>
      )}
      {replace && (
        <Dialog title={O.routes.replaceTitle} onClose={() => setReplace(null)}>
          <p className="text-14">{O.routes.replaceText}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className={primary} onClick={() => { const run = replace; setReplace(null); run(); }}>{O.routes.replace}</button>
            <button type="button" className={btn} onClick={() => setReplace(null)}>{O.edit.cancel}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function OwnerFix({ page, code, owner, ambiguous }: { page: OnboardingPage; code: string; owner: string; ambiguous: boolean }) {
  const { repo } = useApp();
  const item = page.items.find((i) => i.code === code)!;
  const [pick, setPick] = useState(page.positions[0]?.id ?? '');
  return (
    <CheckBox tone="advisory" title={ambiguous ? O.rows.ambiguous : O.rows.unmatched}>
      <p>{(ambiguous ? O.rows.textAmbiguous : O.rows.text)(item.code, item.title, owner)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`own-${item.id}`} className="text-13 font-semibold">{O.rows.owner}</label>
        <select id={`own-${item.id}`} className={`${input} w-auto max-w-full`} value={pick} onChange={(e) => setPick(e.target.value)}>
          {page.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? O.vacant})</option>)}
        </select>
        <button type="button" className={btn} onClick={() => repo.onboarding.saveItem(item.type, item.id, { ownerPositionId: pick })}>{O.rows.useThis}</button>
      </div>
    </CheckBox>
  );
}

function ItemRow({ i, kidsOf, page, fy, onEdit, onRemove }: {
  i: PlanItemView; kidsOf: (id: string) => PlanItemView[]; page: OnboardingPage; fy: string; onEdit: (i: PlanItemView) => void; onRemove: (i: PlanItemView) => void;
}) {
  const { repo } = useApp();
  const ob = repo.onboarding;
  const editable = page.canSetUp && page.plan!.status === 'draft';
  const ai = i.draft === 'ai_draft';
  const kids = kidsOf(i.id);
  const child = { goal: 'objective', objective: 'kpi', kpi: 'activity', activity: null }[i.kind] as 'objective' | 'kpi' | 'activity' | null;
  const terms = page.org.termLabels;
  const pct = (v: number | null, unit: string) => (v === null ? '' : unit === '%' ? `${formatNumber(v)}%` : `${formatNumber(v)} ${unit}`.trim());
  return (
    <li className="rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-12 text-muted">{terms[i.kind].singular}</span>
            <b className="text-14 text-navy">{i.title}</b>
            <span className="text-12 text-muted">{i.code}</span>
            {ai && <Chip tone="info">{O.item.aiDraft(i.page)}</Chip>}
          </div>
          <div className="text-13">
            {O.item.owner}: {i.owner ? <>{i.owner.label} <span className="text-muted">({i.owner.holder ?? O.vacant})</span></> : i.ownerText ? <><Chip tone="advisory">{O.item.notMatched}</Chip> <span className="text-muted">“{i.ownerText}”</span></> : <span className="text-muted">{O.item.noOwner}</span>}
          </div>
          {i.kpi && (
            <div className="text-12 text-muted">
              {i.kpi.baseline === null ? O.item.noBaseline : O.item.baseline(pct(i.kpi.baseline, i.kpi.unit), i.kpi.baselineAsOf ? formatDate(i.kpi.baselineAsOf) : '')}
              {i.kpi.validated !== null && ` · ${i.kpi.validated ? O.item.validated : O.item.notValidated}`}
              {' · '}{i.kpi.target === null ? O.item.noTarget(fy) : O.item.target(fy, pct(i.kpi.target, i.kpi.unit))}
              {' · '}{i.kpi.direction === 'lower_is_better' ? O.item.lower : O.item.higher}
            </div>
          )}
          {i.activity && (
            <div className="text-12 text-muted">
              {O.item.level}: {i.activity.level ? en.sixP[i.activity.level] : <Chip tone="block">{O.item.notSet}</Chip>}
              {i.activity.quantity !== null && ` · ${O.item.quantity(fy, `${formatNumber(i.activity.quantity)} ${i.activity.unit}`.trim())}`}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && ai && <button type="button" className={btn} onClick={() => ob.accept(i.type, i.id)}>{O.item.accept}</button>}
          {editable && <button type="button" className={btn} onClick={() => onEdit(i)}>{ai ? O.item.correct : O.item.edit}</button>}
          {editable && child && <button type="button" className={btn} onClick={() => { const r = ob.addItem(child, i.id); if (r.ok) onEdit(ob.page().items.find((x) => x.id === r.id)!); }}>{O.item.add[child]}</button>}
          {editable && <button type="button" className={btn} onClick={() => onRemove(i)}>{O.item.remove}</button>}
          {repo.viewer.roles.includes('strategy_office') && i.kpi?.validated === false && !ai && (
            <button type="button" className={link} onClick={() => ob.validateBaseline(i.id)}>{O.item.validate}</button>
          )}
        </div>
      </div>
      {kids.length > 0 && <ul className="mt-2 space-y-2 border-l border-border pl-3">{kids.map((k) => <ItemRow key={k.id} i={k} kidsOf={kidsOf} page={page} fy={fy} onEdit={onEdit} onRemove={onRemove} />)}</ul>}
    </li>
  );
}

const PERSPECTIVES: PerspectiveKey[] = ['customer', 'internal', 'innovation_learning', 'financial'];
const LEVELS = Object.keys(en.sixP) as SixPLevel[];

function EditDialog({ item, page, fy, onClose }: { item: PlanItemView; page: OnboardingPage; fy: string; onClose: () => void }) {
  const { repo } = useApp();
  const ob = repo.onboarding;
  const [title, setTitle] = useState(item.title);
  const [owner, setOwner] = useState(item.owner?.positionId ?? '');
  const [perspective, setPerspective] = useState<string>(item.perspective ?? '');
  const [baseline, setBaseline] = useState(item.kpi?.baseline === null || !item.kpi ? '' : String(item.kpi.baseline));
  const [target, setTarget] = useState(item.kpi?.target === null || !item.kpi ? '' : String(item.kpi.target));
  const [level, setLevel] = useState<string>(item.activity?.level ?? '');
  const [qty, setQty] = useState(item.activity?.quantity === null || !item.activity ? '' : String(item.activity.quantity));
  const [unit, setUnit] = useState(item.activity?.unit ?? '');
  const confirmedFix = page.plan!.status !== 'draft'; // after confirmation only the 6P level is set here (a publish block)
  const persp = page.org.perspectives;
  const numOrNull = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const save = () => {
    const input: ItemInput = confirmedFix ? { level: (level || null) as SixPLevel | null } : {
      title, ownerPositionId: owner || null,
      ...(item.kind === 'goal' ? { perspective: (perspective || null) as PerspectiveKey | null } : {}),
      ...(item.kind === 'kpi' ? { baseline: numOrNull(baseline), target: numOrNull(target) } : {}),
      ...(item.kind === 'activity' ? { level: (level || null) as SixPLevel | null, quantity: numOrNull(qty), quantityUnit: unit } : {}),
    };
    if (ob.saveItem(item.type, item.id, input).ok) onClose();
  };
  return (
    <Dialog title={item.draft === 'ai_draft' ? O.edit.correctTitle(item.code) : O.edit.title(item.code)} onClose={onClose}>
      <div className="space-y-3">
        {!confirmedFix && <div><label htmlFor="it-title" className={label}>{O.edit.name}</label><input id="it-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></div>}
        {!confirmedFix && (
          <div><label htmlFor="it-owner" className={label}>{O.edit.owner}</label>
            <select id="it-owner" className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">{O.item.noOwner}</option>
              {page.positions.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.holder ?? O.vacant})</option>)}
            </select></div>
        )}
        {!confirmedFix && item.kind === 'goal' && persp && (
          <div><label htmlFor="it-persp" className={label}>{O.edit.perspective}</label>
            <select id="it-persp" className={input} value={perspective} onChange={(e) => setPerspective(e.target.value)}>
              <option value="">{O.edit.none}</option>
              {PERSPECTIVES.map((k) => <option key={k} value={k}>{persp.find((x) => x.key === k)?.label ?? k}</option>)}
            </select></div>
        )}
        {!confirmedFix && item.kind === 'kpi' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="it-base" className={label}>{O.edit.baseline}</label><input id="it-base" type="number" className={input} value={baseline} onChange={(e) => setBaseline(e.target.value)} /></div>
            <div><label htmlFor="it-target" className={label}>{O.edit.target(fy)}</label><input id="it-target" type="number" className={input} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          </div>
        )}
        {item.kind === 'activity' && (
          <div><label htmlFor="it-level" className={label}>{O.edit.level}</label>
            <select id="it-level" className={input} value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">{O.item.notSet}</option>
              {LEVELS.map((l) => <option key={l} value={l}>{en.sixP[l]}</option>)}
            </select></div>
        )}
        {!confirmedFix && item.kind === 'activity' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="it-qty" className={label}>{O.edit.quantity}</label><input id="it-qty" type="number" className={input} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label htmlFor="it-unit" className={label}>{O.edit.unit}</label><input id="it-unit" className={input} value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className={primary} onClick={save}>{O.edit.save}</button>
        <button type="button" className={btn} onClick={onClose}>{O.edit.cancel}</button>
      </div>
    </Dialog>
  );
}

function mustText(m: PlanMust) {
  return m.kind === 'period' ? O.checks.period : m.kind === 'no_goal' ? O.checks.noGoal : O.checks.aiPending(plural(m.count, 'aiHave'));
}

function Checks({ page, onEdit, setNote }: { page: OnboardingPage; onEdit: (i: PlanItemView) => void; setNote: (m: string | null) => void }) {
  const { repo } = useApp();
  const ob = repo.onboarding;
  const p = page.plan!;
  const confirmed = p.status !== 'draft';
  const strategyRole = repo.viewer.roles.includes('strategy_office');
  return (
    <section className={card}>
      <h2 className="text-18 font-bold text-navy">{O.checks.title}</h2>
      {!confirmed && (page.must.length
        ? page.must.map((m) => <CheckBox key={m.kind} tone="block" title={O.checks.mustConfirm}>{mustText(m)}</CheckBox>)
        : <p className="mt-2 text-14"><Chip tone="complete">{O.checks.nothingConfirm}</Chip></p>)}
      {confirmed && (page.publishBlocks.length
        ? page.publishBlocks.map((b) => {
          const item = page.items.find((i) => i.id === b.subject.id);
          return (
            <CheckBox key={b.key} tone="block" title={O.checks.mustPublish}>
              {b.message}{' '}
              {strategyRole && item?.kind === 'activity' && <button type="button" className={link} onClick={() => onEdit(item)}>{O.checks.setLevel}</button>}
              {strategyRole && item?.kind === 'kpi' && <button type="button" className={link} onClick={() => { ob.validateBaseline(item.id); setNote(null); }}>{O.item.validate}</button>}
            </CheckBox>
          );
        })
        : <p className="mt-2 text-14"><Chip tone="complete">{O.checks.nothingPublish}</Chip></p>)}
      {confirmed && strategyRole && page.publishBlocks.some((b) => b.key.startsWith('BOOK-KPI-BASELINE')) && (
        <button type="button" className={`${btn} mt-2`} onClick={() => { const r = ob.validateAllBaselines(); if (r.ok) setNote(null); }}>{O.checks.validateAll}</button>
      )}
      {page.worth.filter((w) => !confirmed || !page.publishBlocks.some((b) => b.key === w.key)).map((w) => <CheckBox key={w.key} tone="advisory" title={O.checks.worth}>{w.message}</CheckBox>)}
      {page.noVisionOrMission && <CheckBox tone="advisory" title={O.checks.worth}>{O.checks.noVision}</CheckBox>}
    </section>
  );
}

function Action({ page, setNote }: { page: OnboardingPage; setNote: (m: string | null) => void }) {
  const { repo } = useApp();
  const ob = repo.onboarding;
  const p = page.plan!;
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (p.status === 'draft' && page.canSetUp) {
    return (
      <section className={card}>
        <h2 className="text-18 font-bold text-navy">{O.send.title}</h2>
        <p className="mt-1 text-14">{p.sentBy ? O.send.sentText(p.sentBy) : O.send.text}</p>
        <button type="button" className={`${primary} mt-3`} disabled={page.must.length > 0 || !!p.sentBy || page.items.length === 0} onClick={() => { if (ob.send().ok) setNote(O.send.done); }}>{O.send.button}</button>
        {page.must.length > 0 && <p className="mt-1 text-12 text-muted">{O.send.fixFirst(plural(page.must.length, 'item'))}</p>}
      </section>
    );
  }
  if (p.status === 'draft' && page.isExecutive) {
    return (
      <section className={card}>
        <h2 className="text-18 font-bold text-navy">{O.confirm.title}</h2>
        {!p.sentBy ? <p className="mt-1 text-14 text-muted">{O.confirm.notSent}</p> : (
          <>
            <p className="mt-1 text-14">{O.confirm.sentBy(p.sentBy)}</p>
            {p.boardApprovalRequired && (
              <>
                <p className="mt-2 text-14">{O.confirm.board}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="br-ref" className={label}>{O.confirm.ref}</label><input id="br-ref" className={input} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
                  <div><label htmlFor="br-date" className={label}>{O.confirm.date}</label><input id="br-date" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                </div>
              </>
            )}
            {page.worth.length > 0 && <p className="mt-2 text-14">{O.confirm.worth(plural(page.worth.length + (page.noVisionOrMission ? 1 : 0), 'item'))}</p>}
            {error && <p role="alert" className="mt-2 text-13 text-block-text">{error}</p>}
            <button type="button" className={`${primary} mt-3`} onClick={() => {
              const r = ob.confirm(p.boardApprovalRequired ? { resolutionRef: ref, date: date as ISODate } : null);
              if (r.ok) setNote(O.confirm.done(repo.onboarding.page().plan?.status === 'active'));
              else setError(r.error === 'board_required' ? O.confirm.boardRequired : r.error === 'same_person' ? O.confirm.samePerson : null);
            }}>{O.confirm.button}</button>
          </>
        )}
      </section>
    );
  }
  if (p.status !== 'draft') {
    return (
      <section className={card}>
        {p.confirmed && <p className="text-14">{O.confirm.confirmedBy(p.confirmed.by, formatDate(p.confirmed.on), p.confirmed.ref)}</p>}
        {repo.viewer.roles.includes('strategy_office') && (
          <>
            <h2 className="mt-3 text-18 font-bold text-navy">{O.publish.title}</h2>
            {p.status === 'active' ? (
              <>
                <p className="mt-1 text-14">{O.publish.text}</p>
                <button type="button" className={`${primary} mt-3`} onClick={() => {
                  const r = ob.publish();
                  if (r.ok) setNote(r.blocking ? O.publish.blocked(plural(r.blocking, 'item')) : O.publish.done);
                }}>{O.publish.button}</button>
              </>
            ) : <p className="mt-1 text-14 text-muted">{O.publish.notActive}</p>}
          </>
        )}
      </section>
    );
  }
  return null;
}

function Vision({ page, setNote }: { page: OnboardingPage; setNote: (m: string | null) => void }) {
  const { repo } = useApp();
  const [vision, setVision] = useState(page.vision);
  const [mission, setMission] = useState(page.mission);
  const V = O.vision;
  const canEdit = page.isExecutive && page.plan!.status === 'draft';
  return (
    <section className={card}>
      <h2 className="text-18 font-bold text-navy">{V.title}</h2>
      {canEdit ? (
        <>
          <p className="mt-1 text-12 text-muted">{V.note}</p>
          <label htmlFor="vm-v" className={`${label} mt-2`}>{V.vision}</label>
          <textarea id="vm-v" className={`${input} min-h-20 py-2`} value={vision} onChange={(e) => setVision(e.target.value)} />
          <label htmlFor="vm-m" className={`${label} mt-2`}>{V.mission}</label>
          <textarea id="vm-m" className={`${input} min-h-20 py-2`} value={mission} onChange={(e) => setMission(e.target.value)} />
          <button type="button" className={`${btn} mt-2`} onClick={() => { repo.onboarding.saveVision('vision', vision); repo.onboarding.saveVision('mission', mission); setNote(V.saved); }}>{V.save}</button>
        </>
      ) : (
        <>
          <p className="mt-1 text-14"><b>{V.vision}:</b> {page.vision || <span className="text-muted">{V.onlyExecutive}</span>}</p>
          <p className="mt-1 text-14"><b>{V.mission}:</b> {page.mission || <span className="text-muted">{V.notRecorded}</span>}</p>
        </>
      )}
    </section>
  );
}
