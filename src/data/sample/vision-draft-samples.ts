/**
 * v0.31.0 (Vision, Mission and Values Drafting Specification v0.1, VM-4): in the Packaging Manufacturer, the Strategy
 * office has drafted the active plan's vision, mission and values and sent them to the Executive, so the review build
 * shows the Executive's Needs you item and the confirm or send-back screen. Sample wording only.
 */
import type { Id, ISODateTime, VisionStatement } from '../../contract/caspa-data-contract';
import type { Store } from '../access/store';

export function addSampleVisionDraft(s: Store): void {
  const plan = s.plans.find((p) => p.status === 'active');
  const drafter = s.memberships.find((m) => m.status === 'active' && m.roles.includes('strategy_office'));
  if (!plan || !drafter) return;
  const saved = { at: '2026-10-12T10:00:00+02:00' as ISODateTime, byMembershipId: drafter.id };
  const sent = { at: '2026-10-14T09:30:00+02:00' as ISODateTime, byMembershipId: drafter.id };
  const rec = (key: string, kind: VisionStatement['kind'], text: string, extra: Partial<VisionStatement> = {}): VisionStatement => ({
    orgId: s.organisation.id, created: saved, updated: saved, id: `vs-${plan.id}-${key}` as Id<'VisionStatement'>, planId: plan.id, kind, text,
    confirmation: null, sentForConfirmation: sent, returned: null, ...extra,
  });
  s.visionStatements.push(
    rec('vision', 'vision', 'The packaging partner manufacturers trust for safe, on-time supply.'),
    rec('mission', 'mission', 'We make safe, affordable packaging, delivered when promised, with as little waste as we can.'),
    rec('value-1', 'value', 'We fix problems at the line, before they reach a customer.', { name: 'Quality at the source', order: 1 }),
    rec('value-2', 'value', 'We do what we said, on the day we said it.', { name: 'Keep our word', order: 2 }),
    rec('value-3', 'value', 'Everyone goes home unharmed; anyone may stop the line.', { name: 'Safety first', order: 3 }),
  );
}
