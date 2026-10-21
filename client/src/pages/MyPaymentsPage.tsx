import { useState } from 'react';
import { Link } from 'react-router';
import { formatPaise, type MyPaymentDTO } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { VerificationLine } from '../components/VerificationLine';
import { DisputeDialog } from '../components/VerifyDialog';
import { formatPaymentDate } from '../format';
import { useResource } from '../useResource';

/** Payments recorded for me or paid by me, so I can say whether they are right. */
export function MyPaymentsPage() {
  const { member } = useAuth();
  const [version, setVersion] = useState(0);
  const { data, error } = useResource(`my-payments-${version}`, api.myPayments);
  const [disputing, setDisputing] = useState<MyPaymentDTO | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = data?.filter((p) => p.canRespond).length ?? 0;

  async function confirm(p: MyPaymentDTO) {
    const form = new FormData();
    form.set('outcome', 'confirmed');
    try {
      await api.verify(p.id, form);
      setProblem(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  function describe(p: MyPaymentDTO) {
    const me = member?.id;
    if (p.direction === 'out') return `${p.counterparty} was paid`;
    if (p.paidBy?.id === me && p.member?.id !== me) return `You paid for ${p.member?.name}`;
    if (p.paidBy && p.paidBy.id !== me) return `${p.paidBy.name} paid for you`;
    return 'You paid';
  }

  return (
    <>
      <div className="page-head page-head-stack">
        <h1>My payments</h1>
        <p className="muted">
          Payments recorded for you or paid by you. Confirm the ones that are right and dispute the
          ones that are not; the admins see your answer next to the entry.
        </p>
      </div>
      {(error || problem) && (
        <p role="alert" className="alert">
          {problem ?? `Could not load your payments: ${error}`}
        </p>
      )}
      {data && (
        <p className="muted">
          {waiting === 0 ? 'Nothing is waiting for you.' : `${waiting} waiting for your answer.`}
        </p>
      )}
      {data?.length === 0 && (
        <div className="empty">
          <p className="empty-title">No payments yet</p>
          <p className="muted">
            When an admin records a fee or a payment for you, it shows up here.
          </p>
        </div>
      )}
      <ul className="payments">
        {data?.map((p) => (
          <li key={p.id} className={p.canRespond ? 'payment payment-waiting' : 'payment'}>
            <div className="payment-top">
              <div>
                <Link to={`/events/${p.eventId}`} className="payment-event">
                  {p.eventName}
                </Link>
                <p className="payment-what">
                  {describe(p)} by {p.mode === 'upi' ? 'UPI' : 'cash'} on{' '}
                  {formatPaymentDate(p.occurredAt)}
                </p>
              </div>
              <p className="payment-amount">{formatPaise(p.amountPaise)}</p>
            </div>
            <VerificationLine entry={p} />
            <p className="entry-by">
              Recorded by {p.createdBy.name}
              {p.note ? `: ${p.note}` : ''}
            </p>
            {p.canRespond && (
              <div className="payment-actions">
                <button type="button" className="btn" onClick={() => confirm(p)}>
                  Yes, this is right
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setDisputing(p)}>
                  No, this is wrong
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {disputing && (
        <DisputeDialog
          entry={disputing}
          onClose={() => setDisputing(null)}
          onSaved={() => {
            setDisputing(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
