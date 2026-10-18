import { useEffect, useRef } from 'react';
import type { GateCode } from '../contract/caspa-data-contract';
import { isBlocking } from '../rules/integrity';
import { en } from '../strings/en';
import { useApp } from './AppContext';

const steps = (gates: GateCode[]) => en.list(gates.map((g) => en.gates[g]));

/** Hard blocks and advisory flags are told apart by label, border and background — never colour alone. */
export function IntegrityDrawer({ onClose }: { onClose: () => void }) {
  const { repo } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  const items = [...repo.findings()].sort((x, y) => Number(isBlocking(y.finding)) - Number(isBlocking(x.finding)));

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-navy/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="findings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[400px] flex-col bg-white shadow-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <h2 id="findings-title" className="text-18 font-bold text-navy">{en.integrity.drawerTitle}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={en.integrity.close} className="grid h-11 w-11 place-items-center rounded-lg border border-control text-18 text-navy hover:bg-cream">×</button>
        </div>
        <p className="px-5 text-13 text-muted">{en.integrity.drawerIntro}</p>
        <ul className="mt-4 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
          {items.length === 0 && <li className="rounded-lg border border-complete-border bg-complete-bg p-4 text-14 text-complete-text">{en.integrity.empty}</li>}
          {items.map(({ finding, routedTo }) => {
            const block = isBlocking(finding);
            return (
              <li key={finding.key} className={`rounded-lg border p-4 ${block ? 'border-2 border-block-border bg-block-bg' : 'border-advisory-border bg-advisory-bg'}`}>
                <div className={`text-12 font-bold ${block ? 'text-block-text' : 'text-advisory-text'}`}>{block ? en.integrity.hardBlock : en.integrity.advisoryFlag}</div>
                <p className="mt-1 text-14 text-text">{finding.message}</p>
                <p className="mt-2 text-12 text-muted">
                  {block && <>{en.integrity.blocks(steps(finding.blocksAt))} </>}
                  {en.integrity.routedTo(routedTo.length ? en.list(routedTo) : en.integrity.nobody)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
