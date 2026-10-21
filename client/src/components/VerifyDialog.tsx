import { useId, useState, type FormEvent } from 'react';
import { formatPaise, type EntryDTO } from '@nocap/shared';
import { api } from '../api';
import { formatPaymentDate } from '../format';
import { Dialog } from './Dialog';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * The other party's check of an entry. An admin checks the proof (and attaches the bill for
 * cash that has none); the member involved confirms or disputes their own payment.
 */
export function VerifyDialog({
  entry,
  asAdmin,
  onClose,
  onSaved,
}: {
  entry: EntryDTO;
  asAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<'confirmed' | 'disputed'>('confirmed');
  const [note, setNote] = useState('');
  const [bill, setBill] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileId = useId();
  const needsBill = asAdmin && entry.verification.needsProof;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (outcome === 'disputed' && !note.trim())
      return setProblem('Say what is wrong with this entry');
    if (outcome === 'confirmed' && needsBill && !bill) {
      return setProblem('Attach the bill photo or receipt to verify this cash entry');
    }
    if (bill && bill.size > MAX_PROOF_BYTES) return setProblem('The bill must be 5 MB or smaller');
    const form = new FormData();
    form.set('outcome', outcome);
    if (outcome === 'disputed') form.set('note', note.trim());
    if (bill && outcome === 'confirmed') form.set('proof', bill);
    setSaving(true);
    setProblem(null);
    try {
      await api.verify(entry.id, form);
      onSaved();
    } catch (err) {
      setProblem((err as Error).message);
      setSaving(false);
    }
  }

  const way = entry.direction === 'in' ? 'received from' : 'paid to';
  return (
    <Dialog title={asAdmin ? 'Verify entry' : 'Confirm or dispute'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <p className="form-context">
          <strong>{formatPaise(entry.amountPaise)}</strong> {way}{' '}
          <strong>{entry.counterparty}</strong> by {entry.mode === 'upi' ? 'UPI' : 'cash'} on{' '}
          {formatPaymentDate(entry.occurredAt)}, recorded by {entry.createdBy.name}.{' '}
          {entry.proofUrl ? (
            <a href={entry.proofUrl} target="_blank" rel="noopener">
              Open the proof
            </a>
          ) : (
            'There is no photo yet.'
          )}
        </p>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}

        <fieldset className="segmented">
          <legend className="field-label">Your check</legend>
          <label>
            <input
              type="radio"
              name="outcome"
              checked={outcome === 'confirmed'}
              onChange={() => setOutcome('confirmed')}
            />
            It is correct
          </label>
          <label>
            <input
              type="radio"
              name="outcome"
              checked={outcome === 'disputed'}
              onChange={() => setOutcome('disputed')}
            />
            It is wrong
          </label>
        </fieldset>

        {outcome === 'disputed' && (
          <label className="field">
            <span className="field-label">What is wrong?</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              autoFocus
            />
          </label>
        )}

        {needsBill && outcome === 'confirmed' && (
          <div className="field">
            <label className="field-label" htmlFor={fileId}>
              Bill photo
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setBill(e.target.files?.[0] ?? null)}
            />
            <span className="field-hint">
              This cash entry has no bill yet. Attach it to verify the amount.
            </span>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save check'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The member's quick "No, this is wrong" from My payments: a note is all that is needed. */
export function DisputeDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: EntryDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setProblem('Say what is wrong with this payment');
    const form = new FormData();
    form.set('outcome', 'disputed');
    form.set('note', note.trim());
    setSaving(true);
    try {
      await api.verify(entry.id, form);
      onSaved();
    } catch (err) {
      setProblem((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog title="Dispute this payment" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <p className="form-context">
          {formatPaise(entry.amountPaise)} on {formatPaymentDate(entry.occurredAt)}, recorded by{' '}
          {entry.createdBy.name}. The admins will see your note next to the entry.
        </p>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}
        <label className="field">
          <span className="field-label">What is wrong?</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="For example: I paid ₹300 in cash, not ₹500"
            autoFocus
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            Send dispute
          </button>
        </div>
      </form>
    </Dialog>
  );
}
