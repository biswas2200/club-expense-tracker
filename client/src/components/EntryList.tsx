import { formatPaise, type EntryDTO, type MemberDTO } from '@nocap/shared';
import { formatTimestamp, paymentDateParts } from '../format';
import { VerificationLine } from './VerificationLine';

/**
 * What the current person may do to check an entry, mirroring the server's rules:
 * nobody checks their own entry; the member involved confirms member payments;
 * another admin checks everything else.
 */
export function checkRole(entry: EntryDTO, me: MemberDTO | null): 'admin' | 'member' | null {
  if (!me || entry.status !== 'active' || entry.verification.state === 'verified') return null;
  if (entry.createdBy.id === me.id) return null;
  const confirmer = entry.verification.confirmer;
  if (confirmer) return confirmer.id === me.id ? 'member' : null;
  return me.role === 'admin' ? 'admin' : null;
}

interface EntryListProps {
  entries: EntryDTO[];
  me: MemberDTO | null;
  onCorrect: (entry: EntryDTO) => void;
  onHistory: (entry: EntryDTO) => void;
  onCheck: (entry: EntryDTO, asAdmin: boolean) => void;
}

/** The ledger: every entry ever recorded, newest first, including replaced ones. */
export function EntryList({ entries, me, onCorrect, onHistory, onCheck }: EntryListProps) {
  return (
    <ol className="ledger" aria-label="Entries">
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          canCorrect={me?.role === 'admin' && entry.status === 'active'}
          check={checkRole(entry, me)}
          onCorrect={() => onCorrect(entry)}
          onHistory={() => onHistory(entry)}
          onCheck={(asAdmin) => onCheck(entry, asAdmin)}
        />
      ))}
    </ol>
  );
}

function EntryRow({
  entry,
  canCorrect,
  check,
  onCorrect,
  onHistory,
  onCheck,
}: {
  entry: EntryDTO;
  canCorrect: boolean;
  check: 'admin' | 'member' | null;
  onCorrect: () => void;
  onHistory: () => void;
  onCheck: (asAdmin: boolean) => void;
}) {
  const { day, month } = paymentDateParts(entry.occurredAt);
  const amount = formatPaise(entry.amountPaise);
  const replaced = entry.status === 'superseded';
  const hasHistory = Boolean(entry.correctsEntryId || entry.correctedByEntryId);
  const classes = ['entry', replaced && 'entry-replaced', entry.isVoid && 'entry-void']
    .filter(Boolean)
    .join(' ');
  const label = `${entry.counterparty}, ${amount}`;

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
          {entry.paidBy && <span className="chip chip-soft">Paid by {entry.paidBy.name}</span>}
          {entry.txnId && <span>Txn {entry.txnId}</span>}
          {entry.note && <span>{entry.note}</span>}
        </p>

        {replaced && <p className="entry-flag">Replaced by a correction</p>}
        {entry.correctsEntryId && (
          <p className={entry.isVoid ? 'entry-flag entry-flag-void' : 'entry-flag entry-flag-fix'}>
            {entry.isVoid ? 'Voided' : 'Correction'}: {entry.reason}
          </p>
        )}
        {!replaced && !entry.isVoid && <VerificationLine entry={entry} />}

        <p className="entry-by">
          Added by {entry.createdBy.name}
          {entry.source === 'chat' ? ' via chat' : ''}, {formatTimestamp(entry.createdAt)}
        </p>

        <div className="entry-actions">
          {entry.proofUrl && (
            <a
              href={entry.proofUrl}
              target="_blank"
              rel="noopener"
              aria-label={`View proof for ${entry.counterparty}`}
            >
              View proof
            </a>
          )}
          {check && (
            <button
              type="button"
              className="link-button link-strong"
              onClick={() => onCheck(check === 'admin')}
              aria-label={
                check === 'admin' ? `Verify entry: ${label}` : `Confirm or dispute: ${label}`
              }
            >
              {check === 'admin' ? 'Verify' : 'Confirm or dispute'}
            </button>
          )}
          {hasHistory && (
            <button
              type="button"
              className="link-button"
              onClick={onHistory}
              aria-label={`History: ${label}`}
            >
              History
            </button>
          )}
          {canCorrect && (
            <button
              type="button"
              className="link-button"
              onClick={onCorrect}
              aria-label={`Correct entry: ${label}`}
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
