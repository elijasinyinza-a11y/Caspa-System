/**
 * Help built into the screens (Clarity Specification, sections 5 and 11): a term that opens a short explanation
 * on tap or keyboard, never on hover alone, so it works on phones and with screen readers.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SixPLevel } from '../contract/caspa-data-contract';
import { en } from '../strings/en';

/* Preferences remembered in this browser only, until sign-in exists (decision D4). Every hook using the same key
   sees the same value, so the breadcrumb and the cascade agree on "Show codes". Storage failures never throw. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const readPref = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k) ?? memory.get(k) ?? null;
  } catch {
    return memory.get(k) ?? null;
  }
};
const writePref = (k: string, v: string) => {
  memory.set(k, v);
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: kept for this visit only */
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePref<T extends string | boolean>(key: string, fallback: T): [T, (v: T) => void] {
  const storageKey = `caspa:${key}`;
  const raw = useSyncExternalStore(subscribe, () => readPref(storageKey), () => null);
  const value = (raw === null ? fallback : typeof fallback === 'boolean' ? raw === 'true' : raw) as T;
  return [value, (v: T) => writePref(storageKey, String(v))];
}

/** A tappable term with a short explanation underneath it. */
export function Explain({ term, label, children, className = '', triggerClass }: { term: ReactNode; label?: string; children: ReactNode; className?: string; triggerClass?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <span ref={wrap} className={`relative inline-block ${className}`}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen(!open)}
        className={triggerClass ?? 'inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4'}
      >
        {term}
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full z-30 mt-1 block w-[min(320px,80vw)] rounded-lg bg-navy p-3 text-left text-13 font-normal text-white shadow-lg"
        >
          {children}
          <button type="button" onClick={() => { setOpen(false); button.current?.focus(); }} className="mt-1 inline-flex min-h-11 items-center text-13 text-white underline underline-offset-4">
            {en.explain.close}
          </button>
        </span>
      )}
    </span>
  );
}

/** One confirmed line from the book, with its source. */
export function BookLine({ line }: { line: { text: string; page: string } }) {
  return (
    <>
      <span className="block">{line.text}</span>
      <span className="mt-1 block text-12 text-border">{en.explain.source}</span>
    </>
  );
}

/** A 6P level as a tappable chip: what the level is (from the book), then what it covers (SIX_P_SCOPE). */
export function SixPChip({ level, scope, size = 'chip' }: { level: SixPLevel; scope?: string; size?: 'chip' | 'large' }) {
  // The button keeps a 44px target; the pill inside it is the visible chip.
  const term =
    size === 'large'
      ? <span className="text-18 font-bold text-navy underline decoration-dotted underline-offset-4">{en.sixP[level]}</span>
      : <span className="rounded-full bg-cascade-tint px-3 py-1 text-13 font-medium text-cascade-text">{en.sixP[level]}</span>;
  return (
    <Explain term={term} label={en.explain.open(`${en.sixP[level]}, ${en.sixPLevel}`)} triggerClass="inline-flex min-h-11 items-center">
      <span className="block font-semibold">{en.explain.sixPIntro(en.sixP[level])}</span>
      <span className="mt-1 block"><BookLine line={en.book.sixPLevel[level]} /></span>
      {scope && <span className="mt-2 block">{en.explain.covers}: {scope}</span>}
    </Explain>
  );
}
