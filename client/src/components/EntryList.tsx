import { formatPaise, type EntryDTO } from '@nocap/shared';
import { formatTimestamp, paymentDateParts } from '../format';

interface EntryListProps {
  entries: EntryDTO[];
  canCorrect: boolean;
  onCorrect: (entry: EntryDTO) => void;
  onHistory: (entry: EntryDTO) => void;
}

/** The ledger: every entry ever recorded, newest first, including replaced ones. */
export function EntryList({ entries, canCorrect, onCorrect, onHistory }: EntryListProps) {
  return (
    <ol className="ledger" aria-label="Entries">
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          canCorrect={canCorrect && entry.status === 'active'}
          onCorrect={() => onCorrect(entry)}
          onHistory={() => onHistory(entry)}
        />
      ))}
    </ol>
  );
}

function EntryRow({
  entry,
  canCorrect,
  onCorrect,
  onHistory,
}: {
  entry: EntryDTO;
  canCorrect: boolean;
  onCorrect: () => void;
  onHistory: () => void;
}) {
  const { day, month } = paymentDateParts(entry.occurredAt);
  const amount = formatPaise(entry.amountPaise);
  const replaced = entry.status === 'superseded';
  const hasHistory = Boolean(entry.correctsEntryId || entry.correctedByEntryId);
  const classes = ['entry', replaced && 'entry-replaced', entry.isVoid && 'entry-void']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes}>
      <div className="entry-date" aria-label={`${day} ${month}`}>
        <span className="entry-day">{day}</span>
        <span className="entry-month">{month}</span>
      </div>

      <div className="entry-body">
        <p className="entry-party">{entry.counterparty}</p>
        <p className="entry-meta">
          <span className="chip">{entry.mode === 'upi' ? 'UPI' : 'Cash'}</span>
          <span>{entry.direction === 'in' ? 'Collected' : 'Paid out'}</span>
          {entry.txnId && <span>Txn {entry.txnId}</span>}
          {entry.note && <span>{entry.note}</span>}
        </p>

        {replaced && <p className="entry-flag">Replaced by a correction</p>}
        {entry.correctsEntryId && (
          <p className={entry.isVoid ? 'entry-flag entry-flag-void' : 'entry-flag entry-flag-fix'}>
            {entry.isVoid ? 'Voided' : 'Correction'}: {entry.reason}
          </p>
        )}

        <p className="entry-by">
          Added by {entry.createdBy.name}, {formatTimestamp(entry.createdAt)}
        </p>

        <div className="entry-actions">
          <a
            href={entry.proofUrl}
            target="_blank"
            rel="noopener"
            aria-label={`View proof for ${entry.counterparty}`}
          >
            View proof
          </a>
          {hasHistory && (
            <button
              type="button"
              className="link-button"
              onClick={onHistory}
              aria-label={`History: ${entry.counterparty}, ${amount}`}
            >
              History
            </button>
          )}
          {canCorrect && (
            <button
              type="button"
              className="link-button"
              onClick={onCorrect}
              aria-label={`Correct entry: ${entry.counterparty}, ${amount}`}
            >
              Correct
            </button>
          )}
        </div>
      </div>

      <p className={`entry-amount ${entry.direction === 'in' ? 'amount-in' : 'amount-out'}`}>
        <span className="sr-only">{entry.direction === 'in' ? 'Collected ' : 'Paid out '}</span>
        <span aria-hidden="true">{entry.direction === 'in' ? '+' : '−'}</span>
        {amount}
      </p>
    </li>
  );
}
