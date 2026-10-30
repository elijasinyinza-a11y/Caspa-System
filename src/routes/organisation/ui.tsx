/** Small shared pieces for the Organisation pages. */
import type { ReactNode } from 'react';
import { formatNumber } from '../../selectors/format';
import { en } from '../../strings/en';
import { writeXlsx, type Sheet } from '../../data/access/setup/files';

export const card = 'rounded-xl border border-border bg-white p-5';
export const btn = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-control bg-white px-4 text-14 font-semibold text-navy hover:border-navy disabled:cursor-not-allowed disabled:opacity-60';
export const primary = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-navy px-4 text-14 font-semibold text-white hover:bg-text disabled:cursor-not-allowed disabled:opacity-60';
export const link = 'inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4';
export const input = 'min-h-11 w-full rounded-lg border border-control bg-white px-3 text-14 text-text';
export const label = 'block text-13 font-semibold text-navy';
export const FOLD = 6;

/** "3 units", "1 unit": the count in en-GB format with the right word. */
export const plural = (n: number, key: string) => {
  const [one, many] = en.setup.plural[key] ?? [key, key];
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
};

export function Chip({ tone, children }: { tone: 'block' | 'advisory' | 'complete' | 'info'; children: ReactNode }) {
  const c = {
    block: 'border-block-border bg-block-bg text-block-text',
    advisory: 'border-advisory-border bg-advisory-bg text-advisory-text',
    complete: 'border-complete-border bg-complete-bg text-complete-text',
    info: 'border-info-border bg-info-bg text-info-text',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-12 font-semibold ${c}`}>{children}</span>;
}

/** A check card: the label in words always, never colour alone. */
export function CheckBox({ tone, title, children }: { tone: 'block' | 'advisory' | 'complete'; title: string; children: ReactNode }) {
  const c = { block: 'border-block-border bg-block-bg', advisory: 'border-advisory-border bg-advisory-bg', complete: 'border-complete-border bg-complete-bg' }[tone];
  const t = { block: 'text-block-text', advisory: 'text-advisory-text', complete: 'text-complete-text' }[tone];
  return (
    <div className={`mt-3 rounded-lg border-l-4 border p-3 ${c}`}>
      <div className={`text-12 font-bold uppercase tracking-wide ${t}`}>{title}</div>
      <div className="mt-1 text-14 text-text">{children}</div>
    </div>
  );
}

/** Save a spreadsheet to the person's device. */
export function download(fileName: string, sheets: { name: string; rows: Sheet; widths?: number[] }[]) {
  const blob = new Blob([writeXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The template (D7-12, D7-14): the columns, a short instructions sheet and the role names to choose from. */
export function downloadTemplate() {
  download(en.setup.template.fileName, [
    { name: en.setup.template.sheetName, rows: [[...en.setup.template.columns]], widths: [36, 16, 30, 30, 26, 32, 10, 30, 20] },
    { name: en.setup.template.instructionsSheet, rows: en.setup.template.instructions.map((r) => [...r]), widths: [120] },
    { name: en.setup.template.rolesSheet, rows: [[en.setup.access.roles], ...Object.values(en.assignedRole).map((r) => [r])], widths: [32] },
  ]);
}
