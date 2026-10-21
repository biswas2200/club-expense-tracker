import { describe, expect, it } from 'vitest';
import type { Mode, VerificationState } from '@nocap/shared';
import { computeSummary, resolveStatuses, type LedgerRow } from '../src/services/ledger';

function row(
  id: string,
  direction: 'in' | 'out',
  amountPaise: number,
  opts: { corrects?: string; mode?: Mode; verification?: VerificationState } = {},
): LedgerRow {
  return {
    id,
    direction,
    amountPaise,
    correctsEntryId: opts.corrects,
    mode: opts.mode ?? 'upi',
    verification: opts.verification ?? 'unverified',
  };
}

describe('resolveStatuses', () => {
  it('marks an entry superseded once something corrects it', () => {
    const statuses = resolveStatuses([
      row('a', 'out', 100),
      row('b', 'out', 150, { corrects: 'a' }),
    ]);
    expect(statuses.get('a')).toEqual({ status: 'superseded', correctedByEntryId: 'b' });
    expect(statuses.get('b')).toEqual({ status: 'active' });
  });

  it('follows a chain of corrections to the latest one', () => {
    const statuses = resolveStatuses([
      row('a', 'out', 100),
      row('b', 'out', 150, { corrects: 'a' }),
      row('c', 'out', 175, { corrects: 'b' }),
    ]);
    expect(statuses.get('a')?.status).toBe('superseded');
    expect(statuses.get('b')?.status).toBe('superseded');
    expect(statuses.get('c')?.status).toBe('active');
  });
});

describe('computeSummary', () => {
  it('totals only active entries', () => {
    const summary = computeSummary(100_000, [
      row('fee1', 'in', 50_000, { verification: 'verified' }),
      row('fee2', 'in', 30_000),
      row('decor', 'out', 20_000),
      row('decor-fixed', 'out', 25_000, { corrects: 'decor', verification: 'verified' }),
    ]);
    expect(summary).toEqual({
      budgetPaise: 100_000,
      collectedPaise: 80_000,
      spentPaise: 25_000,
      remainingBudgetPaise: 75_000,
      balancePaise: 55_000,
      activeEntryCount: 3,
      unverifiedCount: 1,
      unverifiedPaise: 30_000,
      disputedCount: 0,
      cashExpectedPaise: 0,
    });
  });

  it('a void correction (amount 0) removes the original from the totals', () => {
    const summary = computeSummary(10_000, [
      row('dup', 'out', 4_000),
      row('void', 'out', 0, { corrects: 'dup' }),
    ]);
    expect(summary.spentPaise).toBe(0);
    expect(summary.activeEntryCount).toBe(0);
    expect(summary.unverifiedCount).toBe(0);
  });

  it('allows remaining budget and balance to go negative', () => {
    const summary = computeSummary(1_000, [row('x', 'out', 3_000)]);
    expect(summary.remainingBudgetPaise).toBe(-2_000);
    expect(summary.balancePaise).toBe(-3_000);
  });

  it('counts unverified and disputed entries separately', () => {
    const summary = computeSummary(0, [
      row('a', 'in', 500, { verification: 'unverified' }),
      row('b', 'in', 700, { verification: 'unverified' }),
      row('c', 'in', 900, { verification: 'disputed' }),
      row('d', 'in', 300, { verification: 'verified' }),
    ]);
    expect(summary).toMatchObject({ unverifiedCount: 2, unverifiedPaise: 1_200, disputedCount: 1 });
  });

  it('expects cash in hand to be cash in minus cash out, ignoring UPI and replaced entries', () => {
    const summary = computeSummary(0, [
      row('fund', 'in', 100_000, { mode: 'cash' }),
      row('tea', 'out', 30_000, { mode: 'cash' }),
      row('sponsor', 'in', 500_000, { mode: 'upi' }),
      row('print', 'out', 20_000, { mode: 'cash' }),
      row('print-fixed', 'out', 15_000, { mode: 'cash', corrects: 'print' }),
    ]);
    expect(summary.cashExpectedPaise).toBe(55_000);
  });
});
