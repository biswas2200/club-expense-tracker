import { Link } from 'react-router';
import type { ActivityDTO } from '@nocap/shared';
import { formatTimestamp } from '../format';

/** The activity log: plain sentences, newest first. */
export function ActivityList({ items, showEvent }: { items: ActivityDTO[]; showEvent?: boolean }) {
  if (items.length === 0) return <p className="empty">Nothing has happened yet.</p>;
  return (
    <ol className="activity">
      {items.map((a) => (
        <li key={a.id} className={`activity-item activity-${a.action.replace('.', '-')}`}>
          <p className="activity-summary">{a.summary}</p>
          <p className="activity-meta">
            {a.actor.name}, {formatTimestamp(a.at)}
            {showEvent && a.eventId && (
              <>
                {' in '}
                <Link to={`/events/${a.eventId}`}>{a.eventName}</Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
