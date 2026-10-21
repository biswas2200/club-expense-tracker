/** Types shared by the API and the React client, so both sides agree on every payload. */

export const ROLES = ['admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const DIRECTIONS = ['in', 'out'] as const;
/** in = money collected (fees, sponsorship); out = money spent. */
export type Direction = (typeof DIRECTIONS)[number];

export const MODES = ['upi', 'cash'] as const;
export type Mode = (typeof MODES)[number];

export const VERIFICATION_OUTCOMES = ['confirmed', 'disputed'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

/**
 * unverified: nobody other than the person who recorded it has checked it yet.
 * verified: the other party confirmed it.
 * disputed: the other party says it is wrong.
 */
export type VerificationState = 'unverified' | 'verified' | 'disputed';

export interface PersonRef {
  id: string;
  name: string;
}

export interface MemberDTO extends PersonRef {
  role: Role;
}

export interface VerificationInfo {
  state: VerificationState;
  /** The member who must confirm (who paid, or was paid). Absent: another admin checks the proof. */
  confirmer?: PersonRef;
  /** Cash with no bill or receipt yet: an admin has to attach one to verify it. */
  needsProof: boolean;
  by?: PersonRef;
  at?: string;
  note?: string;
}

export interface EventSummary {
  budgetPaise: number;
  collectedPaise: number;
  spentPaise: number;
  /** budget − spent */
  remainingBudgetPaise: number;
  /** collected − spent: the money the club should be holding */
  balancePaise: number;
  /** entries that count towards the totals (not replaced by a correction) */
  activeEntryCount: number;
  /** active entries nobody has verified yet */
  unverifiedCount: number;
  unverifiedPaise: number;
  disputedCount: number;
  /** cash in − cash out: what the cash box should hold */
  cashExpectedPaise: number;
}

export interface EventDTO {
  id: string;
  name: string;
  budgetPaise: number;
  /** what each admin and member owes for this event; 0 = no fee */
  feePaise: number;
  createdAt: string;
  summary: EventSummary;
}

/**
 * active: counts towards the totals.
 * superseded: replaced by a later correction; kept for history, excluded from totals.
 */
export type EntryStatus = 'active' | 'superseded';

export interface EntryDTO {
  id: string;
  eventId: string;
  direction: Direction;
  mode: Mode;
  amountPaise: number;
  counterparty: string;
  occurredAt: string;
  txnId?: string;
  note?: string;
  /** the entry's own proof, or the bill attached when it was verified; cash may have none */
  proofUrl?: string;
  /** the club member who paid (money in) or was paid (money out) */
  member?: PersonRef;
  /** set when someone else paid on the member's behalf */
  paidBy?: PersonRef;
  createdBy: PersonRef;
  createdAt: string;
  /** set when this entry is a correction of an earlier one */
  correctsEntryId?: string;
  /** why the correction was made */
  reason?: string;
  /** a correction with amount 0 cancels the original entry */
  isVoid: boolean;
  status: EntryStatus;
  /** set when a later entry corrects this one */
  correctedByEntryId?: string;
  verification: VerificationInfo;
}

export interface MyPaymentDTO extends EntryDTO {
  eventName: string;
  /** true when I am the one who should confirm or dispute it, and it is not verified yet */
  canRespond: boolean;
}

export const FEE_STATES = ['unpaid', 'partly', 'disputed', 'awaiting', 'paid'] as const;
/** In the order the fee list shows them: people who still owe money first. */
export type FeeState = (typeof FEE_STATES)[number];

export interface FeeRow {
  member: PersonRef;
  state: FeeState;
  paidPaise: number;
  /** people who paid on this member's behalf */
  paidBy: PersonRef[];
}

export interface FeesDTO {
  feePaise: number;
  counts: Record<FeeState, number>;
  rows: FeeRow[];
}

export interface CashCountDTO {
  id: string;
  eventId: string;
  countedPaise: number;
  expectedPaise: number;
  /** counted − expected: negative means cash is missing */
  differencePaise: number;
  note?: string;
  countedBy: PersonRef;
  createdAt: string;
}

export interface CashDTO {
  expectedPaise: number;
  /** newest first */
  counts: CashCountDTO[];
}

export const ACTIVITY_ACTIONS = [
  'event.created',
  'entry.recorded',
  'entry.corrected',
  'entry.confirmed',
  'entry.disputed',
  'cash.counted',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityDTO {
  id: string;
  at: string;
  actor: PersonRef;
  action: ActivityAction;
  summary: string;
  eventId?: string;
  eventName?: string;
  entryId?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string>;
}
