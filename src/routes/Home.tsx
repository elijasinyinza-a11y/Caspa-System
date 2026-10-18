import { useApp } from '../components/AppContext';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { isBlocking } from '../rules/integrity';
import { formatNumber, formatPercent } from '../selectors/format';
import { en } from '../strings/en';

/** Interim Home. Role homes replace it in slice 4. Every figure is computed. */
export function Home() {
  const { repo, openFindings } = useApp();
  const h = repo.home();
  const f = repo.findings();
  const blocking = f.filter((x) => isBlocking(x.finding)).length;
  const funded = h.coverage.reduce((n, g) => n + g.funded, 0);
  const total = h.coverage.reduce((n, g) => n + g.total, 0);

  const tile = (label: string, value: string, note: string, onClick?: () => void) => {
    const body = (
      <>
        <div className="text-13 text-muted">{label}</div>
        <div className="tabular mt-1 text-34 font-bold text-navy">{value}</div>
        <div className="mt-1 text-13 text-muted">{note}</div>
      </>
    );
    const cls = 'flex h-full w-full flex-col items-start rounded-xl border border-border bg-white p-5 text-left';
    return onClick ? <button type="button" onClick={onClick} className={`${cls} hover:border-control`}>{body}</button> : <div className={cls}>{body}</div>;
  };

  return (
    <>
      <WorkspaceHeader w="home" title={en.home.title(h.financialYear)} intro={en.home.intro} />
      <div className="grid gap-4 sm:grid-cols-3">
        {tile(en.home.goals, formatNumber(h.goalCount), h.planTitle ? en.home.goalsNote(h.planTitle) : '')}
        {tile(en.home.funded, total ? formatPercent(funded / total) : '—', en.home.fundedNote(funded, total))}
        {tile(en.home.findings, formatNumber(f.length), en.home.findingsNote(blocking, f.length - blocking), openFindings)}
      </div>
      <section className="mt-6 rounded-xl border border-border bg-white p-5" aria-labelledby="coverage">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="coverage" className="text-18 font-bold text-navy">{en.home.coverageTitle}</h2>
          <p className="text-13 text-muted">{en.home.coverageNote}</p>
        </div>
        <ul className="mt-4 space-y-4">
          {h.coverage.map((g) => {
            const share = g.total ? g.funded / g.total : 0;
            return (
              <li key={g.goalId} className="grid items-center gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_110px]">
                <div>
                  <div className="text-14 font-semibold text-navy">{g.code} {g.title}</div>
                  {g.perspectiveLabel && <div className="text-13 text-muted">{g.perspectiveLabel}</div>}
                </div>
                <div className="h-2 rounded-full bg-info-bg" role="img" aria-label={`${g.code}: ${en.home.coverageRow(g.funded, g.total)}`}>
                  <div className="h-2 rounded-full bg-chart-1" style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
                </div>
                <div className="tabular text-14 text-text md:text-right">
                  {g.total ? `${en.home.coverageRow(g.funded, g.total)}, ${formatPercent(share)}` : en.home.noActivities}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
