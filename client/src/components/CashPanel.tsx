import { useState, type FormEvent } from 'react';
import { formatPaise, parseRupees, type CashCountDTO } from '@nocap/shared';
import { api } from '../api';
import { formatTimestamp } from '../format';
import { useResource } from '../useResource';
import { Dialog } from './Dialog';
import { Icon } from './icons';

function gapText(c: CashCountDTO) {
  if (c.differencePaise === 0) return 'Matches';
  return `${formatPaise(Math.abs(c.differencePaise))} ${c.differencePaise < 0 ? 'short' : 'over'}`;
}

/** What the cash box should hold, the last physical count, and every count so far. */
export function CashPanel({
  eventId,
  refreshKey,
  canCount,
  onCounted,
}: {
  eventId: string;
  refreshKey: number;
  canCount: boolean;
  onCounted: () => void;
}) {
  const { data, error } = useResource(`cash-${eventId}-${refreshKey}`, () => api.cash(eventId));
  const [counting, setCounting] = useState(false);
  if (error)
    return (
      <p role="alert" className="alert">
        Could not load the cash box: {error}
      </p>
    );
  if (!data) return <p className="page-status">Loading…</p>;
  const last = data.counts[0];

  return (
    <div className="panel">
      <div className="cash-grid">
        <div className="cash-tile" data-testid="cash-expected">
          <span className="muted">Should be in the cash box</span>
          <span className="cash-figure">{formatPaise(data.expectedPaise)}</span>
          <span className="muted small">Cash collected minus cash spent, from the ledger</span>
        </div>
        <div className="cash-tile" data-testid="cash-last">
          <span className="muted">Last count</span>
          {last ? (
            <>
              <span className="cash-figure">{formatPaise(last.countedPaise)}</span>
              <span
                className={last.differencePaise === 0 ? 'state state-paid' : 'state state-disputed'}
              >
                <Icon name={last.differencePaise === 0 ? 'check' : 'alert'} />
                {gapText(last)}
              </span>
              <span className="muted small">
                Counted by {last.countedBy.name}, {formatTimestamp(last.createdAt)}; expected{' '}
                {formatPaise(last.expectedPaise)} then
              </span>
            </>
          ) : (
            <span className="cash-figure cash-none">No count yet</span>
          )}
        </div>
      </div>
      {canCount && (
        <div>
          <button type="button" className="btn" onClick={() => setCounting(true)}>
            Record cash count
          </button>
        </div>
      )}
      {data.counts.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col" className="num">
                  Counted
                </th>
                <th scope="col" className="num">
                  Expected
                </th>
                <th scope="col">Result</th>
                <th scope="col">By</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.counts.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{formatTimestamp(c.createdAt)}</td>
                  <td className="num">{formatPaise(c.countedPaise)}</td>
                  <td className="num">{formatPaise(c.expectedPaise)}</td>
                  <td className="nowrap">{gapText(c)}</td>
                  <td>{c.countedBy.name}</td>
                  <td className="muted">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {counting && (
        <CashCountDialog
          eventId={eventId}
          onClose={() => setCounting(false)}
          onSaved={() => {
            setCounting(false);
            onCounted();
          }}
        />
      )}
    </div>
  );
}

function CashCountDialog({
  eventId,
  onClose,
  onSaved,
}: {
  eventId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const paise = parseRupees(amount);
    if (paise === null) return setProblem('Enter the cash counted, like 1220 or 1,220.50');
    setSaving(true);
    try {
      await api.countCash(eventId, paise, note.trim() || undefined);
      onSaved();
    } catch (err) {
      setProblem((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog title="Record cash count" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <p className="form-context">
          Count the notes and coins in the cash box, then enter the total.
        </p>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}
        <label className="field">
          <span className="field-label">Cash counted (₹)</span>
          <input
            className="input-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">
            Note <span className="optional">optional</span>
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            Save count
          </button>
        </div>
      </form>
    </Dialog>
  );
}
