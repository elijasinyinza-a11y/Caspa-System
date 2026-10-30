/**
 * Reading the setup template into a draft structure (D7-12). Pure: rows in, draft out.
 *
 * Columns (approved 23 October 2026): unit path, unit type, position title, reports to, holder's full name, holder's
 * email, acting, assigned roles, and an optional position reference. One row per position; a blank holder is a
 * vacant position. Unit paths accept "›", ">" or "/". "Reports to" is a position reference, else a title looked for
 * in the same unit, then each parent unit, then anywhere if unique. Roles belong to the person and are merged across
 * their rows; roles on a vacant row are a row problem.
 */
import type { AssignedRole } from '../../../contract/caspa-data-contract';
import { en } from '../../../strings/en';
import { human, type DraftPerson, type DraftPosition, type DraftStructure, type DraftUnit, type RowProblem } from './draft';

export const TEMPLATE_COLUMNS = en.setup.template.columns;

export interface ImportResult {
  structure: DraftStructure;
  problems: RowProblem[];
  summary: { rows: number; units: number; positions: number; holders: number };
}

const ROLE_BY_LABEL = new Map(
  (Object.entries(en.assignedRole) as [AssignedRole, string][]).flatMap(([k, label]) => [[label.toLowerCase(), k], [k.replace('_', ' '), k]]),
);
/** Assigned roles named in a cell, separated by ";" or ","; unknown names are ignored. */
export const rolesIn = (cell: string): AssignedRole[] =>
  [...new Set(cell.split(/[;,]/).map((t) => ROLE_BY_LABEL.get(t.trim().toLowerCase())).filter((r): r is AssignedRole => !!r))];

export const splitPath = (path: string) => path.split(/\s*[›>/]\s*/).map((s) => s.trim()).filter(Boolean);

const isHeader = (row: string[]) => (row[0] ?? '').trim().toLowerCase() === TEMPLATE_COLUMNS[0].toLowerCase();
const blank = (row: string[]) => row.every((c) => !(c ?? '').trim());
const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());

/**
 * Rows of the template into a draft structure. `existing` are people already in the organisation (such as the
 * administrator): a row with the same name and email is the same person. `nextId` gives each new record its ID.
 * Row numbers count the header as row 1, as a spreadsheet program shows them.
 */
export function importRows(sheet: string[][], existing: DraftPerson[], nextId: (prefix: 'u' | 'pos' | 'per') => string): ImportResult {
  const start = sheet.length && isHeader(sheet[0]!) ? 1 : 0;
  const units: DraftUnit[] = [];
  const positions: DraftPosition[] = [];
  const people: DraftPerson[] = existing.map((p) => ({ ...p, roles: [...p.roles] }));
  const problems: RowProblem[] = [];
  const unitByPath = new Map<string, DraftUnit>();
  const personByKey = new Map(people.filter((p) => p.email).map((p) => [`${p.email!.toLowerCase()}|${p.fullName.trim().toLowerCase()}`, p]));
  const rowsOf: { row: number; cells: string[]; position: DraftPosition }[] = [];

  const ensureUnit = (parts: string[], type: string): DraftUnit | null => {
    let parent: DraftUnit | null = null;
    parts.forEach((name, i) => {
      const key = parts.slice(0, i + 1).join('\u0000').toLowerCase();
      let u = unitByPath.get(key);
      if (!u) {
        u = { id: nextId('u'), name, unitType: i === parts.length - 1 ? type : '', parentId: parent?.id ?? null, draft: human() };
        unitByPath.set(key, u);
        units.push(u);
      } else if (i === parts.length - 1 && !u.unitType && type) u.unitType = type;
      parent = u;
    });
    return parent;
  };

  for (let i = start; i < sheet.length; i++) {
    const cells = (sheet[i] ?? []).map((c) => (c ?? '').trim());
    if (blank(cells)) continue;
    const [path = '', type = '', title = '', , name = '', email = '', acting = '', roleCell = '', ref = ''] = cells;
    const row = i + 1;
    const unit = ensureUnit(splitPath(path), type);
    if (!unit || !title) continue; // a row with no unit path or title has nothing to add
    const position: DraftPosition = { id: nextId('pos'), unitId: unit.id, title, ref: ref || null, reportsToId: null, holder: null, draft: human(), row };
    const roles = rolesIn(roleCell);
    if (name) {
      const key = email ? `${email.toLowerCase()}|${name.toLowerCase()}` : null;
      let person = key ? personByKey.get(key) : undefined;
      if (!person) {
        person = { id: nextId('per'), fullName: name, email: email || null, roles: [], endsOn: null, existing: false };
        people.push(person);
        if (key) personByKey.set(key, person);
      }
      for (const r of roles) if (!person.roles.includes(r)) person.roles.push(r);
      position.holder = { personId: person.id, acting: yes(acting) };
    } else if (roles.length) {
      problems.push({ kind: 'roles_on_vacant', row, positionId: position.id, roles, done: false });
    }
    positions.push(position);
    rowsOf.push({ row, cells, position });
  }

  // "Reports to": a reference first, then the title in the same unit, each parent unit, then anywhere if unique.
  const byRef = new Map<string, DraftPosition>();
  const byUnitTitle = new Map<string, DraftPosition[]>();
  const byTitle = new Map<string, DraftPosition[]>();
  const push = <K,>(m: Map<K, DraftPosition[]>, k: K, p: DraftPosition) => (m.get(k) ?? m.set(k, []).get(k)!).push(p);
  for (const p of positions) {
    if (p.ref) byRef.set(p.ref.toLowerCase(), p);
    push(byUnitTitle, `${p.unitId}\u0000${p.title.toLowerCase()}`, p);
    push(byTitle, p.title.toLowerCase(), p);
  }
  const unitById = new Map(units.map((u) => [u.id, u]));
  for (const { row, cells, position } of rowsOf) {
    const to = (cells[3] ?? '').trim();
    if (!to) continue;
    let hit: DraftPosition | null = byRef.get(to.toLowerCase()) ?? null;
    let ambiguous = false;
    for (let u = unitById.get(position.unitId); !hit && u; u = u.parentId ? unitById.get(u.parentId) : undefined) {
      const c = (byUnitTitle.get(`${u.id}\u0000${to.toLowerCase()}`) ?? []).filter((x) => x.id !== position.id);
      if (c.length === 1) hit = c[0]!;
      else if (c.length > 1) { ambiguous = true; break; }
    }
    if (!hit && !ambiguous) {
      const c = (byTitle.get(to.toLowerCase()) ?? []).filter((x) => x.id !== position.id);
      if (c.length === 1) hit = c[0]!;
      else if (c.length > 1) ambiguous = true;
    }
    if (hit && hit.id !== position.id) position.reportsToId = hit.id;
    else problems.push({ kind: 'reports_unmatched', row, positionId: position.id, reportsTo: to, ambiguous, done: false });
  }

  const holders = new Set(positions.flatMap((p) => (p.holder ? [p.holder.personId] : [])));
  return {
    structure: { units, positions, people },
    problems,
    summary: { rows: rowsOf.length, units: units.length, positions: positions.length, holders: holders.size },
  };
}

/** A sheet as a spreadsheet program shows it: the template's header in row 1, then the rows. */
export const withHeader = (rows: string[][]): string[][] => [[...TEMPLATE_COLUMNS], ...rows];
