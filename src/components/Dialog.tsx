import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal dialog: labelled by its heading, Escape closes it, focus moves in on opening, Tab stays inside it,
 * and focus returns to what opened it.
 */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>('input, select, textarea, button');
    (first ?? box)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && box) {
        const items = [...box.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea')];
        if (!items.length) return;
        const [a, z] = [items[0]!, items[items.length - 1]!];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
    // Open once; onClose may change identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg outline-none sm:rounded-xl ${wide ? 'sm:max-w-[720px]' : 'sm:max-w-[520px]'}`}>
        <h2 id={titleId} className="text-18 font-bold text-navy">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
