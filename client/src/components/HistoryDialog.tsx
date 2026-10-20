import { formatPaise, type EntryDTO } from '@nocap/shared';
import { api } from '../api';
import { formatPaymentDate, formatTimestamp } from '../format';
import { useResource } from '../useResource';
import { Dialog } from './Dialog';

/** Every version of an entry, oldest first, with who made each change and why. */
export function HistoryDialog({ entry, onClose }: { entry: EntryDTO; onClose: () => void }) {
  const { data: versions, error } = useResource(`history-${entry.id}`, () => api.history(entry.id));

  return (
    <Dialog title="Entry history" onClose={onClose}>
      {error && (
        <p role="alert" className="alert">
          Could not load the history: {error}
        </p>
      )}
      <ol className="history">
        {versions?.map((v, i) => (
          <li
            key={v.id}
            className={v.status === 'active' ? 'history-item history-current' : 'history-item'}
          >
            <p className="history-head">
              <strong>{formatPaise(v.amountPaise)}</strong>
              <span>
                {v.direction === 'in' ? 'from' : 'to'} {v.counterparty},{' '}
                {formatPaymentDate(v.occurredAt)}
              </span>
              {v.status === 'active' && <span className="chip">Current</span>}
            </p>
            <p className="muted">
              {i === 0 ? 'Recorded' : v.isVoid ? 'Voided' : 'Corrected'} by {v.createdBy.name},{' '}
              {formatTimestamp(v.createdAt)}
            </p>
            {v.reason && <p className="history-reason">{v.reason}</p>}
            <a href={v.proofUrl} target="_blank" rel="noopener">
              View proof
            </a>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
