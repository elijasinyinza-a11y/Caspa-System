/** Component identity classes: labels, card top edges and nav markers only — never status or buttons. */
import type { WorkspaceKey } from '../strings/en';

export const identity: Record<WorkspaceKey, { mark: string; text: string; tint: string; edge: string }> = {
  home: { mark: 'bg-navy', text: 'text-navy', tint: 'bg-info-bg', edge: 'border-t-navy' },
  strategy: { mark: 'bg-strategy-mark', text: 'text-strategy-text', tint: 'bg-strategy-tint', edge: 'border-t-strategy-mark' },
  cascade: { mark: 'bg-cascade-mark', text: 'text-cascade-text', tint: 'bg-cascade-tint', edge: 'border-t-cascade-mark' },
  plan: { mark: 'bg-plan-mark', text: 'text-plan-text', tint: 'bg-plan-tint', edge: 'border-t-plan-mark' },
  performance: { mark: 'bg-performance-mark', text: 'text-performance-text', tint: 'bg-performance-tint', edge: 'border-t-performance-mark' },
};
