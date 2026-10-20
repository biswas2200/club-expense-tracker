/** Types shared by the API and the React client, so both sides agree on every payload. */

export const ROLES = ['admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const DIRECTIONS = ['in', 'out'] as const;
/** in = money collected (fees, sponsorship); out = money spent. */
export type Direction = (typeof DIRECTIONS)[number];

export const MODES = ['upi', 'cash'] as const;
export type Mode = (typeof MODES)[number];

export interface MemberDTO {
  id: string;
  name: string;
  role: Role;
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
}

export interface EventDTO {
  id: string;
  name: string;
  budgetPaise: number;
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
  proofUrl: string;
  createdBy: { id: string; name: string };
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
}

export interface ApiError {
  error: string;
  details?: Record<string, string>;
}
