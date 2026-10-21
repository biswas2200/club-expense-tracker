import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  formatPaise,
  paiseToRupeeInput,
  parseRupees,
  type Direction,
  type EntryDTO,
  type Mode,
} from '@nocap/shared';
import { api } from '../api';
import { formatPaymentDate, todayInput } from '../format';
import { useResource } from '../useResource';
import { Dialog } from './Dialog';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES = 'image/png,image/jpeg,image/webp,application/pdf';

interface EntryFormDialogProps {
  eventId: string;
  /** When set, the form records a correction of this entry instead of a new entry. */
  correcting?: EntryDTO;
  onClose: () => void;
  onSaved: () => void;
}

export function EntryFormDialog({ eventId, correcting, onClose, onSaved }: EntryFormDialogProps) {
  const { data: people } = useResource('members', api.members);
  const payers = (people ?? []).filter((p) => p.role !== 'viewer');

  const [direction, setDirection] = useState<Direction>(correcting?.direction ?? 'out');
  const [mode, setMode] = useState<Mode>(correcting?.mode ?? 'upi');
  const [amount, setAmount] = useState(correcting ? paiseToRupeeInput(correcting.amountPaise) : '');
  const [memberId, setMemberId] = useState(correcting?.member?.id ?? '');
  const [someoneElse, setSomeoneElse] = useState(Boolean(correcting?.paidBy));
  const [paidById, setPaidById] = useState(correcting?.paidBy?.id ?? '');
  const [counterparty, setCounterparty] = useState(correcting?.counterparty ?? '');
  const [occurredAt, setOccurredAt] = useState(correcting?.occurredAt.slice(0, 10) ?? todayInput());
  const [txnId, setTxnId] = useState(correcting?.txnId ?? '');
  const [note, setNote] = useState(correcting?.note ?? '');
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hintId = useId();
  const member = payers.find((p) => p.id === memberId);

  useEffect(() => {
    if (!proof || !proof.type.startsWith('image/')) return setPreview(null);
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  function check(): string | FormData {
    const paise = parseRupees(amount);
    if (paise === null) return 'Enter an amount like 1200 or 1,200.50';
    if (paise === 0 && !correcting) return 'Amount must be more than ₹0';
    const party = member ? member.name : counterparty.trim();
    if (!party) return direction === 'out' ? 'Say who was paid' : 'Say who the money came from';
    if (someoneElse && member && !paidById) return 'Pick who paid for them';
    if (!occurredAt) return 'Pick the date of the payment';
    if (!correcting && !proof && mode === 'upi') {
      return 'Attach a proof: UPI entries need the payment screenshot';
    }
    if (proof && proof.size > MAX_PROOF_BYTES) return 'Proof must be 5 MB or smaller';
    if (correcting && !reason.trim()) return 'Say why this entry is being corrected';

    const form = new FormData();
    form.set('direction', direction);
    form.set('mode', mode);
    form.set('amountPaise', String(paise));
    form.set('counterparty', party);
    form.set('occurredAt', occurredAt);
    if (member) form.set('memberId', member.id);
    if (member && someoneElse && paidById) form.set('paidByMemberId', paidById);
    if (mode === 'upi' && txnId.trim()) form.set('txnId', txnId.trim());
    if (note.trim()) form.set('note', note.trim());
    if (correcting) {
      form.set('correctsEntryId', correcting.id);
      form.set('reason', reason.trim());
    }
    if (proof) form.set('proof', proof);
    return form;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check();
    if (typeof result === 'string') return setProblem(result);
    setSaving(true);
    setProblem(null);
    try {
      await api.createEntry(eventId, result);
      onSaved();
    } catch (err) {
      setProblem((err as Error).message);
      setSaving(false);
    }
  }

  let proofHint = 'UPI screenshot, bill photo or receipt. JPG, PNG, WebP or PDF, up to 5 MB.';
  if (correcting) proofHint = 'Leave empty to keep the original proof.';
  else if (mode === 'cash') {
    proofHint = member
      ? `Optional for cash: ${member.name} confirms the payment instead.`
      : 'Optional for cash now, but an admin needs the bill before it can be verified.';
  }

  return (
    <Dialog title={correcting ? 'Correct entry' : 'Add entry'} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {correcting && (
          <p className="form-context">
            Correcting <strong>{correcting.counterparty}</strong>,{' '}
            {formatPaise(correcting.amountPaise)} on {formatPaymentDate(correcting.occurredAt)}. The
            original stays in the ledger, marked as replaced. Set the amount to 0 to void a
            duplicate.
          </p>
        )}
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}

        <div className="field-row">
          <fieldset className="segmented">
            <legend className="field-label">Type</legend>
            {(['out', 'in'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="direction"
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                />
                {value === 'out' ? 'Money out' : 'Money in'}
              </label>
            ))}
          </fieldset>
          <fieldset className="segmented">
            <legend className="field-label">Payment method</legend>
            {(['upi', 'cash'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {value === 'upi' ? 'UPI' : 'Cash'}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Amount (₹)</span>
            <input
              className="input-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="1,200"
              autoFocus={!correcting}
            />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              max={todayInput()}
            />
          </label>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${hintId}-member`}>
            Club member <span className="optional">optional</span>
          </label>
          <select
            id={`${hintId}-member`}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            aria-describedby={`${hintId}-member-hint`}
          >
            <option value="">Not a club member</option>
            {payers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span id={`${hintId}-member-hint`} className="field-hint">
            Pick a member for fees or money paid to a member; they confirm it from My payments.
          </span>
        </div>

        <label className="field">
          <span className="field-label">{direction === 'out' ? 'Paid to' : 'Received from'}</span>
          <input
            value={member ? member.name : counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            readOnly={Boolean(member)}
            maxLength={120}
            placeholder={direction === 'out' ? 'Shop or person' : 'Student or sponsor'}
          />
        </label>

        {member && direction === 'in' && (
          <div className="field-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={someoneElse}
                onChange={(e) => setSomeoneElse(e.target.checked)}
              />
              Someone else paid for them
            </label>
            {someoneElse && (
              <label className="field">
                <span className="field-label">Paid by</span>
                <select value={paidById} onChange={(e) => setPaidById(e.target.value)}>
                  <option value="">Pick a person</option>
                  {payers
                    .filter((p) => p.id !== member.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        )}

        {mode === 'upi' && (
          <label className="field">
            <span className="field-label">
              UPI transaction ID <span className="optional">optional</span>
            </span>
            <input value={txnId} onChange={(e) => setTxnId(e.target.value)} maxLength={64} />
          </label>
        )}

        <label className="field">
          <span className="field-label">
            Note <span className="optional">optional</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="What was it for?"
          />
        </label>

        {correcting && (
          <label className="field">
            <span className="field-label">Reason for correction</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={2}
              autoFocus
            />
          </label>
        )}

        <div className="field">
          <label className="field-label" htmlFor={`${hintId}-file`}>
            {correcting ? 'New proof' : 'Proof'}
          </label>
          <input
            id={`${hintId}-file`}
            type="file"
            accept={PROOF_TYPES}
            aria-describedby={hintId}
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          />
          <span id={hintId} className="field-hint">
            {proofHint}
          </span>
          {preview && (
            <img className="proof-preview" src={preview} alt="Preview of the attached proof" />
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : correcting ? 'Save correction' : 'Save entry'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
