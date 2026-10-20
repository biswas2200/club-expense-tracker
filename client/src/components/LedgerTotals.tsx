import { formatPaise, type EventSummary } from '@nocap/shared';
import { BudgetMeter } from './BudgetMeter';

/** The event's totals, laid out like the bottom of a receipt. */
export function LedgerTotals({ summary }: { summary: EventSummary }) {
  const rows = [
    { id: 'budget', label: 'Budget', value: summary.budgetPaise },
    { id: 'collected', label: 'Collected', value: summary.collectedPaise },
    { id: 'spent', label: 'Spent', value: summary.spentPaise },
    { id: 'remaining', label: 'Left in budget', value: summary.remainingBudgetPaise },
    { id: 'balance', label: 'Balance in hand', value: summary.balancePaise, total: true },
  ];
  return (
    <section className="totals" aria-label="Totals">
      <dl>
        {rows.map((row) => (
          <div
            key={row.id}
            className={row.total ? 'total-row total-row-final' : 'total-row'}
            data-testid={`summary-${row.id}`}
          >
            <dt>{row.label}</dt>
            <dd className={row.value < 0 ? 'neg' : undefined}>{formatPaise(row.value)}</dd>
          </div>
        ))}
      </dl>
      <BudgetMeter spentPaise={summary.spentPaise} budgetPaise={summary.budgetPaise} />
      <p className="totals-note muted">
        Balance in hand is collected minus spent: the money the club should be holding right now.
      </p>
    </section>
  );
}
