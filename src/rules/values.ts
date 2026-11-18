/**
 * Corporate values (v0.29.0; Corporate Values Specification v0.1, CV-1 to CV-8; contract v1.21). Pure rules: no React,
 * no I/O, no clock. Values are the organisation's own words; the AI never drafts them (F1).
 */
import type { VisionStatement } from '../contract/caspa-data-contract';

export const MAX_VALUES = 10;
export const VALUE_NAME_MAX = 40;
export const VALUE_MEANING_MAX = 300;

export interface ValueInput { name: string; text: string }
export type ValuesError = 'too_many' | 'name_required' | 'meaning_required' | 'name_too_long' | 'meaning_too_long' | 'duplicate_name';

/** Why a list of values cannot be saved, or null (CV-4). An empty list is allowed: values are optional. */
export function valuesError(list: readonly ValueInput[]): ValuesError | null {
  if (list.length > MAX_VALUES) return 'too_many';
  const seen = new Set<string>();
  for (const v of list) {
    const name = v.name.trim();
    const text = v.text.trim();
    if (!name) return 'name_required';
    if (!text) return 'meaning_required';
    if (name.length > VALUE_NAME_MAX) return 'name_too_long';
    if (text.length > VALUE_MEANING_MAX) return 'meaning_too_long';
    const key = name.toLowerCase();
    if (seen.has(key)) return 'duplicate_name';
    seen.add(key);
  }
  return null;
}

/** A plan's values, in order. */
export const valuesOf = (statements: readonly VisionStatement[], planId: string): VisionStatement[] =>
  statements.filter((x) => x.planId === planId && x.kind === 'value').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** The values as names and meanings, for display and for carrying forward (CV-2). */
export const valueInputs = (statements: readonly VisionStatement[], planId: string): ValueInput[] =>
  valuesOf(statements, planId).map((v) => ({ name: v.name ?? '', text: v.text }));
