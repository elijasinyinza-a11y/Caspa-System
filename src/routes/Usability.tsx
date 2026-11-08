/**
 * The usability-test kit (BUILD-BRIEF sections 20 and 27; Clarity Specification v0.1, "Usability test kit"), at
 * #/usability. Development only, beside the role switcher: not part of the product. Each task starts from the
 * sample's seeded state (the page reloads, so nothing from the last person is kept) in the role the kit sets. The
 * results sheet is empty until the facilitator fills it in during a real round; nothing is recorded as passed before.
 * It is kept in this browser only.
 */
import { usePref } from '../components/Explain';
import { PARTICIPANTS, USABILITY_TASKS } from '../data/sample/usability-tasks';
import { en } from '../strings/en';
import { hrefFor } from './router';
import { btn, card, Chip } from './organisation/ui';

const U = en.usability;
type Outcome = '' | 'unaided' | 'helped' | 'not';

/** A task passes when at least 4 of 5 complete it unaided; a task with any blank result is not yet decided. */
export function taskResult(row: Outcome[]): 'pass' | 'fail' | 'open' {
  if (row.length < PARTICIPANTS.length || row.some((x) => !x)) return 'open';
  return row.filter((x) => x === 'unaided').length >= 4 ? 'pass' : 'fail';
}

/** Starting a task reloads the build at the task's start address, so it begins from the seeded sample. */
export function startTask(no: number) {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith('caspa:') && !k.startsWith('caspa:usability')) window.localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing to clear */ }
  window.location.hash = hrefFor({ kind: 'usability', start: no });
  window.location.reload();
}

export function UsabilityPage() {
  const [raw, setRaw] = usePref<string>('usability:results', '{}');
  let results: Record<string, Outcome[]> = {};
  try { results = JSON.parse(raw) as Record<string, Outcome[]>; } catch { results = {}; }
  const set = (task: number, p: number, v: Outcome) => {
    const row = [...(results[task] ?? PARTICIPANTS.map(() => '' as Outcome))];
    row[p] = v;
    setRaw(JSON.stringify({ ...results, [task]: row }));
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-28 font-bold text-navy">{U.title}</h1>
        <p className="mt-1 text-14">{U.intro}</p>
      </div>
      <section className={card} aria-labelledby="u-tasks">
        <h2 id="u-tasks" className="text-18 font-bold text-navy">{U.tasks}</h2>
        <p className="text-13 text-muted">{U.tasksNote}</p>
        <ol className="mt-2 divide-y divide-border">
          {USABILITY_TASKS.map((t) => (
            <li key={t.no} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-[1_1_20rem]">
                <p className="text-14 font-semibold text-navy">{U.taskNo(t.no, t.roleLabel)}</p>
                <p className="mt-1 text-16">{t.card}</p>
                <p className="mt-1 text-12 text-muted">{U.completedWhen(t.completedWhen)}</p>
              </div>
              <button type="button" className={btn} onClick={() => startTask(t.no)}>{U.start}<span className="sr-only">: {U.taskNo(t.no, t.roleLabel)}</span></button>
            </li>
          ))}
        </ol>
      </section>
      <section className={card} aria-labelledby="u-sheet">
        <h2 id="u-sheet" className="text-18 font-bold text-navy">{U.sheet}</h2>
        <p className="text-13 text-muted">{U.sheetNote}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-14">
            <thead><tr className="border-b border-border"><th scope="col" className="py-2 text-left">{U.task}</th>{PARTICIPANTS.map((p) => <th key={p} scope="col" className="py-2 text-left">{p}</th>)}<th scope="col" className="py-2 text-left">{U.result}</th></tr></thead>
            <tbody>
              {USABILITY_TASKS.map((t) => {
                const row = results[t.no] ?? PARTICIPANTS.map(() => '' as Outcome);
                const r = taskResult(row);
                return (
                  <tr key={t.no} className="border-b border-border">
                    <th scope="row" className="py-2 text-left font-semibold">{t.no}</th>
                    {PARTICIPANTS.map((p, i) => (
                      <td key={p} className="py-2 pr-2">
                        <label className="sr-only" htmlFor={`u-${t.no}-${p}`}>{U.cellLabel(t.no, p)}</label>
                        <select id={`u-${t.no}-${p}`} className="min-h-11 rounded-lg border border-control bg-white px-2 text-13" value={row[i] ?? ''} onChange={(e) => set(t.no, i, e.target.value as Outcome)}>
                          <option value="">{U.outcome.blank}</option><option value="unaided">{U.outcome.unaided}</option><option value="helped">{U.outcome.helped}</option><option value="not">{U.outcome.not}</option>
                        </select>
                      </td>
                    ))}
                    <td className="py-2">{r === 'open' ? <Chip tone="info">{U.open}</Chip> : r === 'pass' ? <Chip tone="complete">{U.pass}</Chip> : <Chip tone="block">{U.fail}</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className={`${btn} mt-3`} onClick={() => setRaw('{}')}>{U.clear}</button>
      </section>
    </div>
  );
}
