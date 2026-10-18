import { en } from '../strings/en';
import { useApp } from './AppContext';
import { IntegrityPill } from './IntegrityPill';
import { RoleSwitcher } from './RoleSwitcher';

export function TopBar() {
  const { repo, route } = useApp();
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-white px-4 md:px-8">
      <div className="md:hidden">
        <div className="text-16 font-bold text-navy">{en.product}</div>
      </div>
      <nav aria-label={en.breadcrumbLabel} className="hidden flex-1 md:block">
        <ol className="flex items-center gap-2 text-14">
          <li className="text-muted">{repo.organisation().name}</li>
          <li aria-hidden="true" className="text-muted">›</li>
          <li aria-current="page" className="font-semibold text-navy">{en.nav[route]}</li>
        </ol>
      </nav>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <span className="hidden sm:block"><IntegrityPill /></span>
        <span className="sm:hidden"><IntegrityPill compact /></span>
        <RoleSwitcher />
      </div>
    </header>
  );
}
