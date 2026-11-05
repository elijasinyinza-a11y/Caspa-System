/**
 * The device a person works on (slice 13, OP-7). In the review build there is no server and no device storage, so
 * this holds, in memory, what a phone would keep: whether it is offline, and what waits to be sent. It sits in the
 * data-access layer the backend will replace; the screens never touch it directly. It resets on reload, as every
 * other change in the review build does.
 *
 * Unsent items belong to the person who saved them (keyed by membership) and are never shown to anyone else.
 */
import type { ISODate, ISODateTime, SurveyResponse } from '../../contract/caspa-data-contract';
import type { ArrivalFailure } from '../../rules/survey';
import type { ArrivalError } from '../../rules/progress';

/** A progress update saved on the device and not yet accepted. */
export interface DeviceUpdate {
  kind: 'update';
  id: string;
  membershipId: string;
  contractObjectiveId: string;
  periodEnd: ISODate;
  quantityDone: number;
  note: string;
  evidence: string;
  capturedAt: ISODateTime;
  capturedOffline: boolean;
  seq: number;
  /** Set when the server refused it on arrival; it stays here as "Couldn't be sent". */
  failure: ArrivalError | null;
}

/** A supervisor's decision taken offline; it is applied only if the update is unchanged when it arrives. */
export interface DeviceDecision {
  kind: 'decision';
  id: string;
  membershipId: string;
  updateId: string;
  /** The update's `updated` stamp when the decision was taken. */
  seenUpdatedAt: ISODateTime;
  decision: 'verify' | 'return';
  reason: string;
  decidedAt: ISODateTime;
  seq: number;
}

/** A decision that arrived too late to apply, kept so the supervisor sees why. */
export interface DeviceNotice {
  id: string;
  membershipId: string;
  contractObjectiveId: string;
  periodEnd: ISODate;
  quantityDone: number | null;
  personName: string;
}

/**
 * Staff survey answers saved on the device (v0.19.0, SV-8). Already scored and given their group unit, so nothing on
 * arrival needs to know who answered beyond the receipt. Kept apart from the progress outbox.
 */
export interface DeviceSurvey {
  id: string;
  membershipId: string;
  roundId: string;
  unitId: string;
  results: SurveyResponse['results'];
  concern: string | null;
  /** Set when the server refused it on arrival; it stays here as "Couldn't be sent". */
  failure: ArrivalFailure | null;
}

export interface Device {
  offline: Record<string, boolean>;
  outbox: (DeviceUpdate | DeviceDecision)[];
  notices: DeviceNotice[];
  survey: DeviceSurvey[];
  seq: number;
}

export const createDevice = (): Device => ({ offline: {}, outbox: [], notices: [], survey: [], seq: 1 });
