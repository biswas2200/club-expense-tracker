import { formatPaise } from '@nocap/shared';

/** "₹11,230 spent of ₹25,000" with a bar; the bar turns red past the budget. */
export function BudgetMeter({
  spentPaise,
  budgetPaise,
}: {
  spentPaise: number;
  budgetPaise: number;
}) {
  const ratio = budgetPaise > 0 ? spentPaise / budgetPaise : spentPaise > 0 ? 1 : 0;
  const over = spentPaise > budgetPaise;
  return (
    <div className="meter">
      <p className="meter-text">
        <strong>{formatPaise(spentPaise)}</strong> spent of {formatPaise(budgetPaise)}
        {over && <span className="neg"> (over budget)</span>}
      </p>
      <div
        className={over ? 'meter-bar meter-over' : 'meter-bar'}
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
      >
        <span style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
    </div>
  );
}
