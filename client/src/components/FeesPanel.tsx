import { formatPaise, type FeeState } from '@nocap/shared';
import { api } from '../api';
import { useResource } from '../useResource';
import { Icon, type IconName } from './icons';

export const FEE_LABEL: Record<FeeState, [string, IconName]> = {
  paid: ['Paid', 'check'],
  awaiting: ['Awaiting confirmation', 'half'],
  partly: ['Partly paid', 'half'],
  disputed: ['Disputed', 'alert'],
  unpaid: ['Unpaid', 'circle'],
};

/** Who has paid the event fee, with the people who still owe money first. */
export function FeesPanel({ eventId, refreshKey }: { eventId: string; refreshKey: number }) {
  const { data, error } = useResource(`fees-${eventId}-${refreshKey}`, () => api.fees(eventId));
  if (error)
    return (
      <p role="alert" className="alert">
        Could not load fees: {error}
      </p>
    );
  if (!data) return <p className="page-status">Loading…</p>;
  if (data.feePaise === 0) {
    return (
      <div className="empty">
        <p className="empty-title">No fee for this event</p>
        <p className="muted">Events with a fee per member show who has paid here.</p>
      </div>
    );
  }
  const total = data.rows.length;
  const owing = data.counts.unpaid + data.counts.partly;
  return (
    <div className="panel">
      <div className="panel-head">
        <p className="panel-figure">
          {data.counts.paid} of {total} paid
        </p>
        <p className="muted">
          {formatPaise(data.feePaise)} per member. {data.counts.awaiting} awaiting confirmation,{' '}
          {data.counts.disputed} disputed, {owing} {owing === 1 ? 'still owes' : 'still owe'} money.
        </p>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Paid
              </th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const [label, icon] = FEE_LABEL[row.state];
              return (
                <tr key={row.member.id}>
                  <th scope="row">{row.member.name}</th>
                  <td>
                    <span className={`state state-${row.state}`}>
                      <Icon name={icon} />
                      {label}
                    </span>
                  </td>
                  <td className="num">{row.paidPaise ? formatPaise(row.paidPaise) : '–'}</td>
                  <td className="muted">
                    {row.paidBy.length ? `Paid by ${row.paidBy.map((p) => p.name).join(', ')}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
