import { formatPaise, type EventSummary } from '@nocap/shared';
import { BudgetMeter } from './BudgetMeter';
import { Icon } from './icons';

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** The event's totals, laid out like the bottom of a receipt, then what is still unchecked. */
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

      <dl className="checks-summary">
        <div
          data-testid="summary-unverified"
          className={summary.unverifiedCount ? 'check-row' : 'check-row check-row-clear'}
        >
          <dt>
            <Icon name={summary.unverifiedCount ? 'circle' : 'check'} />
            Not yet verified
          </dt>
          <dd>
            {summary.unverifiedCount
              ? `${formatPaise(summary.unverifiedPaise)} in ${entries(summary.unverifiedCount)}`
              : 'Nothing'}
          </dd>
        </div>
        <div
          data-testid="summary-disputed"
          className={
            summary.disputedCount ? 'check-row check-row-disputed' : 'check-row check-row-clear'
          }
        >
          <dt>
            <Icon name={summary.disputedCount ? 'alert' : 'check'} />
            Disputed
          </dt>
          <dd>{summary.disputedCount ? entries(summary.disputedCount) : 'None'}</dd>
        </div>
      </dl>
      <p className="totals-note muted">
        Balance in hand is collected minus spent: the money the club should be holding right now.
      </p>
    </section>
  );
}
