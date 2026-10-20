import { describe, expect, it } from 'vitest';
import { computeSummary, resolveStatuses, type LedgerRow } from '../src/services/ledger';

function row(
  id: string,
  direction: 'in' | 'out',
  amountPaise: number,
  correctsEntryId?: string,
): LedgerRow {
  return { id, direction, amountPaise, correctsEntryId };
}

describe('resolveStatuses', () => {
  it('marks an entry superseded once something corrects it', () => {
    const statuses = resolveStatuses([row('a', 'out', 100), row('b', 'out', 150, 'a')]);
    expect(statuses.get('a')).toEqual({ status: 'superseded', correctedByEntryId: 'b' });
    expect(statuses.get('b')).toEqual({ status: 'active' });
  });

  it('follows a chain of corrections to the latest one', () => {
    const statuses = resolveStatuses([
      row('a', 'out', 100),
      row('b', 'out', 150, 'a'),
      row('c', 'out', 175, 'b'),
    ]);
    expect(statuses.get('a')?.status).toBe('superseded');
    expect(statuses.get('b')?.status).toBe('superseded');
    expect(statuses.get('c')?.status).toBe('active');
  });
});

describe('computeSummary', () => {
  it('totals only active entries', () => {
    const summary = computeSummary(100_000, [
      row('fee1', 'in', 50_000),
      row('fee2', 'in', 30_000),
      row('decor', 'out', 20_000),
      row('decor-fixed', 'out', 25_000, 'decor'),
    ]);
    expect(summary).toEqual({
      budgetPaise: 100_000,
      collectedPaise: 80_000,
      spentPaise: 25_000,
      remainingBudgetPaise: 75_000,
      balancePaise: 55_000,
      activeEntryCount: 3,
    });
  });

  it('a void correction (amount 0) removes the original from the totals', () => {
    const summary = computeSummary(10_000, [
      row('dup', 'out', 4_000),
      row('void', 'out', 0, 'dup'),
    ]);
    expect(summary.spentPaise).toBe(0);
    expect(summary.activeEntryCount).toBe(0);
  });

  it('allows remaining budget and balance to go negative', () => {
    const summary = computeSummary(1_000, [row('x', 'out', 3_000)]);
    expect(summary.remainingBudgetPaise).toBe(-2_000);
    expect(summary.balancePaise).toBe(-3_000);
  });
});
