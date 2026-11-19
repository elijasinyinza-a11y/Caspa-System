/**
 * People and access (D7-14), with By role, access end dates and End access (v0.30.0; Access Review Specification
 * v0.1, sections 3 and 4; prototype reference/caspa-access-review-prototype.html). Administrators only: roles, emails
 * and end dates live on Membership (D7-5).
 */
import { useEffect, useState } from 'react';
import type { AssignedRole, ISODate } from '../../contract/caspa-data-contract';
import { useApp } from '../../components/AppContext';
import { Dialog } from '../../components/Dialog';
import type { OrganisationAccess, OrganisationPage as Page, SetupResult } from '../../data/access/setup';
import type { FindingView } from '../../data/access/repository';
import { ROLE_ORDER } from '../../rules/access';
import { indexStructure } from '../../rules/setup';
import { formatDate } from '../../selectors/format';
import { en } from '../../strings/en';
import { itemText } from './Checks';
import { btn, Chip, input, label, link, plural, primary } from './ui';

const A = en.setup.access;
const ROLE_KEYS = Object.keys(en.assignedRole) as AssignedRole[];

/** The words for a refused access change. */
function refusal(page: Page, r: SetupResult): string | null {
  if (r.ok) return null;
  if (r.error === 'must_fix') {
    const ix = indexStructure(page.structure);
    return A.error.must_fix(r.items.map((i) => itemText(ix, i)).join(' '));
  }
  if (r.error === 'ends_required' || r.error === 'ends_past' || r.error === 'own_access' || r.error === 'already') return A.error[r.error];
  return A.error.other;
}

/** Access checks about each person this viewer is shown (administrators only), by person id. */
function checksByPerson(findings: FindingView[]): Map<string, FindingView[]> {
  const out = new Map<string, FindingView[]>();
  for (const f of findings) {
    if (f.fix?.kind !== 'access' || !f.fix.personId) continue;
    (out.get(f.fix.personId) ?? out.set(f.fix.personId, []).get(f.fix.personId)!).push(f);
  }
  return out;
}

function CheckChips({ list }: { list: FindingView[] | undefined }) {
  if (!list?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {list.map((f) => {
        const done = f.ack.state === 'acknowledged';
        return <Chip key={f.finding.key} tone={done ? 'info' : 'advisory'}>{done ? A.checked : A.toCheck}: {f.finding.message}</Chip>;
      })}
    </div>
  );
}

/** The two tabs of People and access (NV-5 addresses). */
export function AccessTabs({ byRole }: { byRole: boolean }) {
  const { navigate } = useApp();
  const tab = (on: boolean, text: string, go: () => void, href: string) => (
    <a role="tab" aria-selected={on} href={href} onClick={(e) => { e.preventDefault(); go(); }}
      className={`inline-flex min-h-11 items-center border-b-[3px] px-4 text-14 font-semibold ${on ? 'border-navy text-navy' : 'border-transparent text-muted'}`}>{text}</a>
  );
  return (
    <div role="tablist" aria-label={A.tabsLabel} className="mt-3 flex gap-1 border-b border-border">
      {tab(!byRole, A.byPerson, () => navigate({ kind: 'org', tab: 'people' }), '#/organisation/people')}
      {tab(byRole, A.byRole, () => navigate({ kind: 'org', tab: 'people', byRole: true }), '#/organisation/people/by-role')}
    </div>
  );
}

/** By person: everyone with an assigned role, with role checkboxes, an end date and End access. */
export function AccessList({ page, access, editable, focus }: { page: Page; access: OrganisationAccess; editable: boolean; focus?: string }) {
  const { repo, now } = useApp();
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const st = page.structure;
  const ix = indexStructure(st);
  const live = page.mode === 'structure';
  const checks = live ? checksByPerson(repo.findings()) : new Map<string, FindingView[]>();
  const ended = live ? access.accessByRole()?.ended ?? [] : [];
  const withRoles = st.people.filter((p) => p.roles.length || added.includes(p.id) || p.id === focus);
  const query = q.trim().toLowerCase();
  const found = query.length >= 2 ? st.people.filter((p) => !withRoles.includes(p) && (p.fullName.toLowerCase().includes(query) || (p.email ?? '').toLowerCase().includes(query))).slice(0, 10) : [];
  const foundEnded = query.length >= 2 ? ended.filter((e) => e.name.toLowerCase().includes(query)).slice(0, 5) : [];
  useEffect(() => { if (focus) document.getElementById(`access-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus]);
  const save = (r: SetupResult) => setMsg(r.ok ? null : { ok: false, text: refusal(page, r) ?? A.error.other });

  const row = (p: (typeof st.people)[number]) => {
    const held = ix.positionsOfHolder.get(p.id) ?? [];
    const ends = page.endsOn[p.id];
    return (
      <tr key={p.id} id={`access-${p.id}`} className={`border-b border-border align-top ${p.id === focus ? 'bg-advisory-bg' : ''}`}>
        <td className="py-2 pr-3">
          {editable && !held.length ? (
            <><label htmlFor={`nm-${p.id}`} className="sr-only">{A.name(p.fullName)}</label>
              <input id={`nm-${p.id}`} className={input} defaultValue={p.fullName} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== p.fullName) save(access.savePerson(p.id, { fullName: e.target.value })); }} /></>
          ) : <b className="text-navy">{p.fullName}</b>}
          {page.isAdmin && (editable ? (
            <><label htmlFor={`em-a-${p.id}`} className="sr-only">{A.email(p.fullName)}</label>
              <input id={`em-a-${p.id}`} type="email" className={`${input} mt-1`} placeholder={A.noEmail} defaultValue={p.email ?? ''} onBlur={(e) => { if ((e.target.value.trim() || null) !== p.email) save(access.savePerson(p.id, { email: e.target.value })); }} /></>
          ) : <div className="text-12 text-muted">{p.email ?? A.noEmail}</div>)}
          {editable ? (
            <div className="mt-2">
              <label htmlFor={`end-${p.id}`} className="block text-12 text-muted">{A.endsLabel(p.fullName)}</label>
              <input id={`end-${p.id}`} type="date" className={`${input} max-w-[12rem]`} min={now} value={ends ?? ''}
                onChange={(e) => save(access.savePerson(p.id, { endsOn: (e.target.value || null) as ISODate | null }))} />
            </div>
          ) : ends && <div className="text-12 text-muted">{A.endsOn(formatDate(ends))}</div>}
          <CheckChips list={checks.get(p.id)} />
        </td>
        <td className="py-2 pr-3 text-13">{held.map((x) => <div key={x.id}>{x.title}{x.holder?.acting ? <> <Chip tone="info">{A.acting}</Chip></> : null}</div>)}{!held.length && <span className="text-muted">{A.none}</span>}</td>
        <td className="py-2 pr-3 text-13">
          {editable ? (
            <fieldset><legend className="sr-only">{A.roles}: {p.fullName}</legend>
              {ROLE_KEYS.map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={p.roles.includes(k)}
                    onChange={(e) => save(access.savePerson(p.id, { roles: e.target.checked ? [...p.roles, k] : p.roles.filter((x) => x !== k) }))} />
                  {en.assignedRole[k]}
                </label>
              ))}
            </fieldset>
          ) : p.roles.map((k) => en.assignedRole[k]).join(', ')}
        </td>
        {editable && live && (
          <td className="py-2 text-13">
            {p.id === repo.viewer.personId ? <span className="text-muted">{A.you}</span>
              : <button type="button" className={`${btn} whitespace-nowrap`} aria-label={A.endAccessFor(p.fullName)} onClick={() => { setMsg(null); setEnding(p.id); }}>{A.endAccess}</button>}
          </td>
        )}
      </tr>
    );
  };
  const head = (
    <thead><tr className="border-b border-border">
      <th className="py-2 pr-3 font-semibold">{A.person}</th><th className="py-2 pr-3 font-semibold">{A.position}</th><th className="py-2 pr-3 font-semibold">{A.roles}</th>
      {editable && live && <th className="py-2 font-semibold"><span className="sr-only">{A.endAccess}</span></th>}
    </tr></thead>
  );
  const endingPerson = ending ? st.people.find((p) => p.id === ending) : undefined;
  return (
    <div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-lg border px-4 py-3 text-14 ${msg.ok ? 'border-complete-border bg-complete-bg text-complete-text' : 'border-block-border bg-block-bg text-block-text'}`}>{msg.text}</p>}
      <p className="mt-2 text-13 text-muted">{A.count(plural(withRoles.length, 'peopleHave'), plural(st.people.length, 'person'))}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-14">{head}<tbody>{withRoles.map(row)}</tbody></table>
      </div>
      {editable && (
        <>
          <div className="mt-3">
            <label htmlFor="people-find" className={label}>{A.find}</label>
            <input id="people-find" type="search" className={input} placeholder={A.findPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {query.length >= 2 && (found.length || foundEnded.length ? (
            <div className="mt-1 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-14"><tbody>
              {found.map(row)}
              {foundEnded.map((e) => (
                <tr key={e.personId} className="border-b border-border align-top">
                  <td className="py-2 pr-3"><b className="text-navy">{e.name}</b><div className="text-12 text-muted">{A.endedOn(formatDate(e.lastDay))}</div></td>
                  <td className="py-2 pr-3" colSpan={2} />
                  <td className="py-2"><button type="button" className={btn} aria-label={A.giveAgainFor(e.name)} onClick={() => {
                    const r = access.giveAccessAgain(e.personId);
                    if (r.ok) { setAdded([...added, e.personId]); setQ(''); setMsg({ ok: true, text: A.done.again(e.name) }); } else save(r);
                  }}>{A.giveAgain}</button></td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <p className="mt-1 text-13 text-muted">{A.nobodyElse}</p>)}
          <button type="button" className={`${btn} mt-3`} onClick={() => { const r = access.addPerson(); if (r.ok) setAdded([...added, r.id]); }}>{A.addPerson}</button>
        </>
      )}
      {endingPerson && (
        <EndAccessDialog page={page} access={access} personId={endingPerson.id} onClose={() => setEnding(null)}
          onDone={(text, ok) => { setEnding(null); setMsg({ ok, text }); }} />
      )}
    </div>
  );
}

/** D4: what ending a person's access does, then End access. */
export function EndAccessDialog({ page, access, personId, onClose, onDone }: {
  page: Page; access: OrganisationAccess; personId: string; onClose: () => void; onDone: (text: string, ok: boolean) => void;
}) {
  const { now } = useApp();
  const ix = indexStructure(page.structure);
  const p = ix.person.get(personId);
  if (!p) return null;
  const D = A.endDialog;
  const held = ix.positionsOfHolder.get(personId) ?? [];
  const yesterday = new Date(Date.parse(`${now}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return (
    <Dialog title={D.title(p.fullName)} onClose={onClose}>
      <div className="space-y-2 text-14">
        <p>{D.lastDay(formatDate(yesterday as ISODate))}</p>
        {held.length > 0 && <p>{D.leaves(en.list(held.map((x) => x.title)))}</p>}
        {p.roles.length > 0 && <p>{D.roles(en.list(p.roles.map((r) => en.assignedRole[r])))}</p>}
        <p className="text-muted">{D.kept}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => {
          const r = access.endAccess(personId);
          onDone(r.ok ? A.done.ended(p.fullName) : refusal(page, r) ?? A.error.other, r.ok);
        }}>{D.confirm}</button>
        <button type="button" className={btn} onClick={onClose}>{D.cancel}</button>
      </div>
    </Dialog>
  );
}

/** By role (section 3.1): each role in a fixed order, who holds it, since when, and who no longer has access. */
export function AccessByRolePanel({ access, focusRole }: { access: OrganisationAccess; focusRole?: AssignedRole }) {
  const { repo, navigate } = useApp();
  const view = access.accessByRole();
  useEffect(() => { if (focusRole) document.getElementById(`role-${focusRole}`)?.scrollIntoView({ block: 'start' }); }, [focusRole]);
  if (!view) return null;
  const findings = repo.findings();
  const checks = checksByPerson(findings);
  const roleChecks = (role: AssignedRole) => findings.filter((f) => f.fix?.kind === 'access' && f.fix.role === role);
  const goTo = (personId: string) => navigate({ kind: 'org', tab: 'people', person: personId });
  return (
    <div>
      <p className="mt-3 text-14 text-muted">{A.byRoleIntro}</p>
      {ROLE_ORDER.map((role) => {
        const r = view.roles.find((x) => x.role === role)!;
        return (
          <section key={role} id={`role-${role}`} aria-labelledby={`role-h-${role}`} className={`mt-4 border-t border-border pt-4 ${focusRole === role ? 'rounded-lg bg-advisory-bg px-3' : ''}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`role-h-${role}`} className="text-16 font-bold text-navy">{en.assignedRole[role]}</h3>
              <span className="text-13 text-muted">{r.holders.length ? plural(r.holders.length, 'person') : A.nobodyHolds}</span>
            </div>
            <CheckChips list={roleChecks(role)} />
            {r.holders.length > 0 && (
              <ul className="mt-2">
                {r.holders.map((h) => (
                  <li key={h.personId} className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-dashed border-border py-2 first:border-t-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto]">
                    <div><b className="text-navy">{h.name}</b>{h.endsOn && <div className="text-12 text-muted">{A.endsOn(formatDate(h.endsOn))}</div>}</div>
                    <div className="text-13">
                      {h.positions.length ? h.positions.map((p) => <div key={p.title}>{p.title}{p.acting ? <> <Chip tone="info">{A.acting}</Chip></> : null}</div>) : <span className="text-muted">{A.noPosition}</span>}
                      <CheckChips list={checks.get(h.personId)} />
                    </div>
                    <div className="text-13 text-muted">{A.heldSince(formatDate(h.since))}</div>
                    <div>
                      <a href={`#/organisation/people/person/${encodeURIComponent(h.personId)}`} className={`${link} text-13`} aria-label={A.changeRoles(h.name)}
                        onClick={(e) => { e.preventDefault(); goTo(h.personId); }}>{A.changeRolesShort}</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <section aria-labelledby="role-h-ended" className="mt-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="role-h-ended" className="text-16 font-bold text-navy">{A.ended}</h3>
          <span className="text-13 text-muted">{view.ended.length ? plural(view.ended.length, 'person') : A.endedNobody}</span>
        </div>
        {view.ended.length > 0 && (
          <ul className="mt-2">
            {view.ended.map((e) => (
              <li key={e.personId} className="grid grid-cols-[minmax(0,1fr)] gap-x-3 border-t border-dashed border-border py-2 first:border-t-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
                <b className="text-navy">{e.name}</b>
                <span className="text-13">{e.roles.length ? e.roles.map((r) => en.assignedRole[r]).join(', ') : A.noRoles}</span>
                <span className="text-13 text-muted">{A.endedLine(formatDate(e.lastDay))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
